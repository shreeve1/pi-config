#!/usr/bin/env python3
"""
Script to calculate workload comparison between Riely and Joey.
Uses halopsa_client.py directly.
"""

import sys
import os
import json

# Add script directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from halopsa_client import HaloPSAClient
from dotenv import load_dotenv
from constants import AGENT_IDS, AGENT_DISPLAY_NAMES, TICKET_STATUS_WEIGHTS

load_dotenv()

def get_agent_tickets(agent_id, client):
    """Get all open tickets for an agent."""
    # Get tickets by agent - using open_only=true
    tickets = client.get("Tickets", params={"agent_id": agent_id, "open_only": "true", "count": 500})
    
    if not tickets:
        return []
    
    # Filter to include only relevant statuses
    relevant_statuses = {'New', 'Open', 'In Progress', 'Pending', 'Scheduled',
                         'Waiting on User', 'Waiting on 3rd Party'}
    
    return [t for t in tickets if t.get('status', {}).get('name', '') in relevant_statuses]

def calculate_weighted_workload(tickets):
    """Calculate weighted workload score based on ticket statuses."""
    status_counts = {}
    weighted_score = 0.0

    for ticket in tickets:
        status = ticket.get('status', {}).get('name', 'Unknown')
        status_counts[status] = status_counts.get(status, 0) + 1
        weight = TICKET_STATUS_WEIGHTS.get(status, 0.5)
        weighted_score += weight

    return {
        'total_tickets': len(tickets),
        'status_counts': status_counts,
        'weighted_score': round(weighted_score, 1)
    }

def main():
    client_id = os.environ.get('HALO_CLIENT_ID')
    client_secret = os.environ.get('HALO_CLIENT_SECRET')
    tenant = os.environ.get('HALO_TENANT_NAME')
    
    if not all([client_id, client_secret, tenant]):
        print("ERROR: Missing required environment variables", file=sys.stderr)
        sys.exit(1)
    
    client = HaloPSAClient(client_id, client_secret, tenant)
    comparison_data = {'agents': []}

    for agent_id in AGENT_IDS:
        agent_name = AGENT_DISPLAY_NAMES.get(agent_id, f'Agent {agent_id}')

        try:
            tickets = get_agent_tickets(agent_id, client)
            workload = calculate_weighted_workload(tickets)

            comparison_data['agents'].append({
                'agent_id': agent_id,
                'agent_name': agent_name,
                'total_tickets': workload['total_tickets'],
                'weighted_score': workload['weighted_score'],
                'status_counts': workload['status_counts']
            })
        except Exception as e:
            print(f"Error fetching tickets for {agent_name}: {str(e)}", file=sys.stderr)
            sys.exit(1)

    # Determine recommended agent (lowest weighted score)
    if len(comparison_data['agents']) == 2:
        agent1, agent2 = comparison_data['agents']
        if agent1['weighted_score'] < agent2['weighted_score']:
            comparison_data['recommended_agent_id'] = agent1['agent_id']
            comparison_data['is_tied'] = False
        elif agent2['weighted_score'] < agent1['weighted_score']:
            comparison_data['recommended_agent_id'] = agent2['agent_id']
            comparison_data['is_tied'] = False
        else:
            comparison_data['recommended_agent_id'] = agent1['agent_id']
            comparison_data['is_tied'] = True

    print(json.dumps(comparison_data, indent=2))

if __name__ == "__main__":
    main()
