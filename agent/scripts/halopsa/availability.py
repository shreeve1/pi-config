"""
Availability Checking Module

Finds available appointment slots for agents by checking their existing
calendar against business hours, buffer time, and duration constraints.
"""

import sys
import os
from datetime import datetime, timedelta, time
from typing import Dict, List, Optional

try:
    import pytz
except ImportError:
    # Fallback for environments without pytz
    from zoneinfo import ZoneInfo
    pytz = None

# Add halopsa-api skill to path for imports
_halopsa_skill_path = os.path.join(
    os.path.dirname(__file__), '..', '..', 'halopsa-api'
)
sys.path.insert(0, _halopsa_skill_path)

from scripts.appointments import AppointmentManager, get_appointment_manager
from scripts.utils import parse_datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config.constants import (
    BUSINESS_HOURS, BUFFER_MINUTES, SEARCH_DAYS,
    SLOT_INCREMENT, SKIP_WEEKENDS, AGENT_DISPLAY_NAMES
)


def _get_timezone():
    """Get the configured timezone object."""
    tz_name = BUSINESS_HOURS['timezone']
    if pytz:
        return pytz.timezone(tz_name)
    return ZoneInfo(tz_name)


def _make_aware(dt: datetime, tz) -> datetime:
    """Make a naive datetime timezone-aware."""
    if pytz:
        if dt.tzinfo is None:
            return tz.localize(dt)
        return dt.astimezone(tz)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=tz)
    return dt.astimezone(tz)


def find_next_available_slot(
    agent_id: int,
    duration_minutes: int,
    search_days: int = None
) -> Dict:
    """
    Find next available appointment slot for an agent.

    Checks the agent's existing appointments and finds gaps that fit the
    requested duration within business hours, respecting buffer time.

    Args:
        agent_id: HaloPSA agent ID
        duration_minutes: Appointment duration in minutes
        search_days: Days ahead to search (defaults to SEARCH_DAYS constant)

    Returns:
        Dict with:
            - agent_id: int
            - agent_name: str
            - available: bool
            - next_slot: {start: datetime, end: datetime} or None
            - alternatives: list of up to 5 additional slots
    """
    if search_days is None:
        search_days = SEARCH_DAYS

    tz = _get_timezone()
    appt_mgr = get_appointment_manager()

    business_start = BUSINESS_HOURS['start']
    business_end = BUSINESS_HOURS['end']

    now = datetime.now(tz) if pytz else _make_aware(datetime.now(), tz)
    search_end = now + timedelta(days=search_days)

    # Fetch existing appointments for this agent
    appointments = appt_mgr.get_appointments_for_agent(
        agent_id=agent_id,
        start_date=now,
        end_date=search_end
    )

    # Build blocked time ranges (appointment + buffer on each side)
    blocked_ranges = []
    for appt in appointments:
        try:
            appt_start = parse_datetime(appt['start_date'])
            appt_end = parse_datetime(appt['end_date'])

            # Make timezone-aware
            appt_start = _make_aware(appt_start, tz)
            appt_end = _make_aware(appt_end, tz)

            blocked_start = appt_start - timedelta(minutes=BUFFER_MINUTES)
            blocked_end = appt_end + timedelta(minutes=BUFFER_MINUTES)
            blocked_ranges.append((blocked_start, blocked_end))
        except (KeyError, ValueError):
            continue

    blocked_ranges.sort(key=lambda x: x[0])

    # Scan for available slots
    available_slots = []
    current_date = now.date()

    for day_offset in range(search_days):
        check_date = current_date + timedelta(days=day_offset)

        # Skip weekends if configured
        if SKIP_WEEKENDS and check_date.weekday() >= 5:
            continue

        # Build day boundaries
        day_start = _make_aware(
            datetime.combine(check_date, business_start), tz
        )
        day_end = _make_aware(
            datetime.combine(check_date, business_end), tz
        )

        # Don't check slots in the past
        slot_start = max(day_start, now)

        # Round up to next slot increment
        minute = slot_start.minute
        remainder = minute % SLOT_INCREMENT
        if remainder != 0:
            slot_start = slot_start.replace(
                minute=0, second=0, microsecond=0
            ) + timedelta(minutes=minute + (SLOT_INCREMENT - remainder))

        while slot_start + timedelta(minutes=duration_minutes) <= day_end:
            slot_end = slot_start + timedelta(minutes=duration_minutes)

            # Check if slot conflicts with any blocked range
            is_available = True
            for blocked_start, blocked_end in blocked_ranges:
                if slot_start < blocked_end and slot_end > blocked_start:
                    is_available = False
                    break

            if is_available:
                available_slots.append({
                    'start': slot_start,
                    'end': slot_end
                })

                # Stop after finding enough slots
                if len(available_slots) >= 6:
                    break

            slot_start += timedelta(minutes=SLOT_INCREMENT)

        if len(available_slots) >= 6:
            break

    agent_name = AGENT_DISPLAY_NAMES.get(agent_id, f'Agent {agent_id}')

    if available_slots:
        return {
            'agent_id': agent_id,
            'agent_name': agent_name,
            'available': True,
            'next_slot': available_slots[0],
            'alternatives': available_slots[1:6]
        }
    else:
        return {
            'agent_id': agent_id,
            'agent_name': agent_name,
            'available': False,
            'next_slot': None,
            'alternatives': []
        }


def find_availability_for_agents(
    agent_ids: List[int],
    duration_minutes: int
) -> Dict[int, Dict]:
    """
    Find availability for multiple agents.

    Args:
        agent_ids: List of HaloPSA agent IDs
        duration_minutes: Appointment duration in minutes

    Returns:
        Dict mapping agent_id to their availability result
    """
    results = {}
    for agent_id in agent_ids:
        results[agent_id] = find_next_available_slot(agent_id, duration_minutes)
    return results
