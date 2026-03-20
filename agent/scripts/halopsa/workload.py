"""
Workload Calculation Module

Calculates weighted workload scores for agents based on their current ticket
distribution across statuses. Higher weights indicate more active/demanding work.
"""

import sys
import os
from typing import Dict, List

# Add halopsa-api skill to path for imports
_halopsa_skill_path = os.path.join(
    os.path.dirname(__file__), '..', '..', 'halopsa-api'
)
sys.path.insert(0, _halopsa_skill_path)

from scripts.agents import AgentManager, get_agent_manager

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from config.constants import TICKET_STATUS_WEIGHTS, AGENT_DISPLAY_NAMES


def calculate_weighted_workload(agent_id: int) -> Dict:
    """
    Calculate weighted workload score for an agent.

    Uses the AgentManager.get_agent_workload() to fetch ticket counts by status,
    then applies cognitive-load-based weights to produce a single score.

    Args:
        agent_id: HaloPSA agent ID

    Returns:
        Dict with:
            - agent_id: int
            - agent_name: str
            - total_tickets: int (open/active tickets)
            - weighted_score: float
            - breakdown: dict of {status_name: count}
    """
    agent_mgr = get_agent_manager()
    workload = agent_mgr.get_agent_workload(agent_id)

    # workload['by_status'] is {status_name: count}
    by_status = workload.get('by_status', {})

    weighted_score = 0.0
    for status_name, count in by_status.items():
        weight = TICKET_STATUS_WEIGHTS.get(status_name, 0.5)
        weighted_score += count * weight

    return {
        'agent_id': agent_id,
        'agent_name': AGENT_DISPLAY_NAMES.get(agent_id, f'Agent {agent_id}'),
        'total_tickets': workload.get('open_tickets', 0),
        'weighted_score': round(weighted_score, 1),
        'breakdown': by_status
    }


def compare_agent_workload(agent_ids: List[int]) -> Dict:
    """
    Compare workload across multiple agents and recommend the least loaded.

    Args:
        agent_ids: List of HaloPSA agent IDs to compare

    Returns:
        Dict with:
            - recommended_agent_id: int (agent with lowest weighted score)
            - agents: list of workload dicts sorted by score ascending
            - is_tied: bool (True if top agents have identical scores)
    """
    agents_workload = []
    for agent_id in agent_ids:
        workload = calculate_weighted_workload(agent_id)
        agents_workload.append(workload)

    agents_workload.sort(key=lambda x: x['weighted_score'])

    # Check for tie (identical lowest scores)
    min_score = agents_workload[0]['weighted_score']
    tied_agents = [a for a in agents_workload if a['weighted_score'] == min_score]

    return {
        'recommended_agent_id': agents_workload[0]['agent_id'],
        'agents': agents_workload,
        'is_tied': len(tied_agents) > 1
    }
