#!/usr/bin/env python3
"""
Simple script to fetch ticket information for scheduling workflow.
Uses halopsa_client.py directly.
"""

import sys
import os

# Add script directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from halopsa_client import HaloPSAClient
from dotenv import load_dotenv

load_dotenv()

def main():
    if len(sys.argv) < 2:
        print("Usage: fetch_ticket.py <ticket_id>")
        sys.exit(1)

    ticket_id = int(sys.argv[1])
    
    client_id = os.environ.get('HALO_CLIENT_ID')
    client_secret = os.environ.get('HALO_CLIENT_SECRET')
    tenant = os.environ.get('HALO_TENANT_NAME')
    
    if not all([client_id, client_secret, tenant]):
        print("ERROR: Missing required environment variables")
        sys.exit(1)
    
    client = HaloPSAClient(client_id, client_secret, tenant)
    
    try:
        ticket = client.get(f"Tickets/{ticket_id}")
        if ticket:
            print(f'[#{ticket_id}] {ticket.get("summary", "No summary")}')
            print(f'Priority: {ticket.get("priority", {}).get("name", "Unknown")}')
            print(f'Client: {ticket.get("client_name", "Unknown")}')
            print(f'Status: {ticket.get("status", {}).get("name", "Unknown")}')
            print(f'Agent: {ticket.get("agent", {}).get("name", "Unassigned")}')
        else:
            print(f'ERROR: Ticket {ticket_id} not found')
            sys.exit(1)
    except Exception as e:
        print(f'ERROR: {str(e)}')
        sys.exit(1)

if __name__ == "__main__":
    main()
