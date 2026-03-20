#!/usr/bin/env python3
"""
Wrapper script to run scheduler functions.
Uses halopsa_client.py directly.
"""

import sys
import os

# Add script directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from halopsa_client import HaloPSAClient
from dotenv import load_dotenv
from constants import AGENT_DISPLAY_NAMES, APPOINTMENT_TYPES

load_dotenv()

def fetch_ticket_summary(ticket_id):
    """Fetch ticket details for display."""
    client_id = os.environ.get('HALO_CLIENT_ID')
    client_secret = os.environ.get('HALO_CLIENT_SECRET')
    tenant = os.environ.get('HALO_TENANT_NAME')
    
    if not all([client_id, client_secret, tenant]):
        raise ValueError("Missing required environment variables")
    
    client = HaloPSAClient(client_id, client_secret, tenant)
    ticket = client.get(f"Tickets/{ticket_id}")
    
    if not ticket:
        return None
    
    return {
        'id': ticket.get('id', ticket_id),
        'summary': ticket.get('summary', 'No summary'),
        'priority': ticket.get('priority', {}).get('name', 'Unknown'),
        'client_name': ticket.get('client_name', 'Unknown'),
        'status': ticket.get('status', {}).get('name', 'Unknown'),
        'agent_name': ticket.get('agent', {}).get('name', 'Unassigned'),
    }

if __name__ == "__main__":
    if len(sys.argv) > 1:
        ticket_id = int(sys.argv[1])
        ticket = fetch_ticket_summary(ticket_id)
        if ticket:
            print(f'[#{ticket["id"]}] {ticket["summary"]}')
            print(f'Priority: {ticket["priority"]}')
            print(f'Client: {ticket["client_name"]}')
            print(f'Status: {ticket["status"]}')
        else:
            print(f'ERROR: Ticket {ticket_id} not found')
    else:
        print("Usage: run_scheduler.py <ticket_id>")
