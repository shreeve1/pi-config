#!/usr/bin/env python3
"""
Test script to verify API connectivity.
"""

import sys
import os

# Add halopsa-api to path
_halopsa_api_path = os.path.join(os.path.dirname(__file__), '..', '..', 'halopsa-api')
sys.path.insert(0, _halopsa_api_path)

from scripts import get_ticket_manager

def main():
    print("Connecting to HaloPSA...")
    tm = get_ticket_manager()

    print("Fetching tickets for agent 25 (Riely)...")
    tickets = tm.get_tickets_by_agent(25)

    print(f"Found {len(tickets)} total tickets for Riely")

    # Show first 3 tickets
    for i, ticket in enumerate(tickets[:3]):
        print(f"  Ticket #{ticket.get('id')}: {ticket.get('summary')} - Status: {ticket.get('status_name')}")

    # Count by status
    statuses = {}
    for ticket in tickets:
        status = ticket.get('status_name', 'Unknown')
        statuses[status] = statuses.get(status, 0) + 1

    print("\nStatus breakdown:")
    for status, count in sorted(statuses.items()):
        print(f"  {status}: {count}")

if __name__ == "__main__":
    main()
