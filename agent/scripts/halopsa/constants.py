"""
Scheduling & Workload Balancing Constants

Configuration for workload-balanced appointment scheduling between Riely and Joey.
"""

from datetime import time


# Agent Configuration (discovered from /Agent endpoint)
AGENTS = {
    'riley': {
        'id': 25,
        'name': 'Riely Borek'
    },
    'joey': {
        'id': 21,
        'name': 'Joey Alvarez'
    }
}

AGENT_IDS = [AGENTS['riley']['id'], AGENTS['joey']['id']]

# Display name lookup by agent ID
AGENT_DISPLAY_NAMES = {
    25: 'Riely',
    21: 'Joey'
}

# Business Hours (PST/PDT - US/Pacific handles DST automatically)
BUSINESS_HOURS = {
    'start': time(9, 30),   # 9:30 AM
    'end': time(17, 30),    # 5:30 PM
    'timezone': 'US/Pacific'
}

# Appointment Types (exact strings required by HaloPSA API)
APPOINTMENT_TYPES = {
    '1': 'Firm - Remote',
    '2': 'Firm - Onsite',
    '3': 'Tentative - Remote',
    '4': 'Tentative - Onsite'
}

# Duration Options (minutes)
DURATION_OPTIONS = {
    '1': 30,
    '2': 60,
    '3': 90
}

# Workload Calculation Weights (based on cognitive load research)
# Higher weight = more active workload impact
TICKET_STATUS_WEIGHTS = {
    'In Progress': 1.0,
    'New': 0.8,
    'Open': 0.8,
    'Scheduled': 0.6,
    'Pending': 0.6,
    'Waiting on User': 0.3,
    'Waiting on 3rd Party': 0.3
}

# Scheduling Constraints
BUFFER_MINUTES = 15       # Buffer time between appointments
SEARCH_DAYS = 7           # Days ahead to search for availability
SLOT_INCREMENT = 15       # Time slot granularity in minutes
SKIP_WEEKENDS = True      # Skip Saturday and Sunday
