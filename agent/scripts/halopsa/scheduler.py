"""
Scheduler Orchestration Module

Main entry point for workload-balanced appointment scheduling.
Designed to be called by Claude as a skill - returns structured data
for Claude to present interactively to the user.
"""

import sys
import os
import json
import subprocess
from datetime import datetime, timedelta
from typing import Dict, Optional

# Script directory - all modules are in the same directory
_script_dir = os.path.dirname(os.path.abspath(__file__))

# Add script directory to path for local imports
sys.path.insert(0, _script_dir)

# Import local modules
from halopsa_client import HaloPSAClient
from constants import (
    AGENTS, AGENT_IDS, AGENT_DISPLAY_NAMES,
    APPOINTMENT_TYPES, DURATION_OPTIONS
)

# Initialize HaloPSA client
_client = None

def _get_client():
    """Get or create HaloPSA client instance."""
    global _client
    if _client is None:
        # Load .env file from current working directory
        from dotenv import load_dotenv
        load_dotenv()

        client_id = os.environ.get('HALO_CLIENT_ID')
        client_secret = os.environ.get('HALO_CLIENT_SECRET')
        tenant = os.environ.get('HALO_TENANT_NAME')
        if not all([client_id, client_secret, tenant]):
            raise ValueError("Missing required environment variables: HALO_CLIENT_ID, HALO_CLIENT_SECRET, HALO_TENANT_NAME")
        _client = HaloPSAClient(client_id, client_secret, tenant)
    return _client


def fetch_ticket_summary(ticket_id: int) -> Optional[Dict]:
    """
    Fetch ticket details for display.

    Args:
        ticket_id: HaloPSA ticket ID

    Returns:
        Dict with ticket summary info, or None if not found
    """
    client = _get_client()
    try:
        # Use direct endpoint for specific ticket (more reliable than query params)
        ticket = client.get(f"Tickets/{ticket_id}")
    except Exception as e:
        return None

    if not ticket:
        return None

    return {
        'id': ticket.get('id', ticket_id),
        'summary': ticket.get('summary', 'No summary'),
        'priority': ticket.get('priority', {}).get('name', 'Unknown'),
        'client_name': ticket.get('client_name', 'Unknown'),
        'status': ticket.get('status', {}).get('name', 'Unknown'),
        'agent_name': ticket.get('agent', {}).get('name', 'Unassigned'),
        'raw': ticket
    }


def get_workload_comparison() -> Dict:
    """
    Compare workload between Riely and Joey.

    Returns:
        Dict with recommended agent and scores.
    """
    script_path = os.path.join(_script_dir, 'calculate_workload.js')
    result = subprocess.run(
        ['node', script_path],
        capture_output=True,
        text=True,
        cwd=_script_dir
    )

    if result.returncode != 0:
        raise Exception(f"Workload calculation failed: {result.stderr}")

    return json.loads(result.stdout)


def get_availability(agent_ids: list, duration_minutes: int) -> Dict:
    """
    Get availability for specified agents.

    Args:
        agent_ids: List of agent IDs to check
        duration_minutes: Requested appointment duration

    Returns:
        Dict mapping agent_id to availability info
    """
    script_path = os.path.join(_script_dir, 'find_availability.js')
    result = subprocess.run(
        ['node', script_path] + [str(aid) for aid in agent_ids] + [str(duration_minutes)],
        capture_output=True,
        text=True,
        cwd=_script_dir
    )

    if result.returncode != 0:
        raise Exception(f"Availability check failed: {result.stderr}")

    return json.loads(result.stdout)


def create_appointment(
    ticket_id: int,
    agent_id: int,
    duration_minutes: int,
    appointment_type_name: str,
    start_datetime: datetime
) -> Dict:
    """
    Create appointment in HaloPSA linked to a ticket.

    Args:
        ticket_id: HaloPSA ticket ID
        agent_id: Agent to assign
        duration_minutes: Duration in minutes
        appointment_type_name: Exact type string (e.g. "Firm - Remote")
        start_datetime: Timezone-aware start time

    Returns:
        Dict with success status, appointment_id, and details
    """
    client = _get_client()

    try:
        # Fetch ticket to get summary
        tickets = client.get("Tickets", params={"ticket_id": ticket_id, "includedetails": True})
        if not tickets or len(tickets) == 0:
            return {
                'success': False,
                'message': f'Ticket {ticket_id} not found',
                'appointment_id': None,
                'details': None
            }

        ticket = tickets[0]
        end_datetime = start_datetime + timedelta(minutes=duration_minutes)

        # Create appointment
        appointment_data = {
            "subject": ticket.get('summary', f'Ticket #{ticket_id}'),
            "start_date": start_datetime.isoformat(),
            "end_date": end_datetime.isoformat(),
            "ticket_id": ticket_id,
            "agent_id": agent_id,
            "appointment_type": appointment_type_name
        }

        result = client.post("Appointment", appointment_data)

        # Extract appointment ID from response
        appt_id = None
        if isinstance(result, list) and len(result) > 0:
            appt_id = result[0].get('id')
        elif isinstance(result, dict):
            appt_id = result.get('id')

        agent_name = AGENT_DISPLAY_NAMES.get(agent_id, f'Agent {agent_id}')

        return {
            'success': True,
            'appointment_id': appt_id,
            'message': 'Appointment created successfully',
            'details': {
                'ticket_id': ticket_id,
                'ticket_summary': ticket.get('summary', ''),
                'agent_id': agent_id,
                'agent_name': agent_name,
                'duration_minutes': duration_minutes,
                'appointment_type': appointment_type_name,
                'start': start_datetime.isoformat(),
                'end': end_datetime.isoformat()
            }
        }

    except Exception as e:
        return {
            'success': False,
            'appointment_id': None,
            'message': f'Error creating appointment: {str(e)}',
            'details': None
        }


def format_slot_display(slot: Dict) -> str:
    """
    Format a time slot for display.

    Args:
        slot: Dict with 'start' and 'end' datetime objects

    Returns:
        Formatted string like "Wednesday, Feb 19 at 9:30 AM"
    """
    start = slot['start']
    return start.strftime('%A, %b %d at %-I:%M %p')


def format_workload_display(comparison: Dict) -> str:
    """
    Format workload comparison for display.

    Args:
        comparison: Result from compare_agent_workload()

    Returns:
        Formatted string showing workload for each agent
    """
    lines = ["**Workload Analysis:**"]
    for agent_data in comparison['agents']:
        name = agent_data['agent_name']
        total = agent_data['total_tickets']
        score = agent_data['weighted_score']
        marker = ' <-- recommended' if agent_data['agent_id'] == comparison['recommended_agent_id'] else ''
        lines.append(f"- {name}: {total} tickets ({score} weighted){marker}")

    if comparison['is_tied']:
        lines.append("- *(Workload is tied - showing both agents)*")

    return '\n'.join(lines)
