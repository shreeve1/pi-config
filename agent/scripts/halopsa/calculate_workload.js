#!/usr/bin/env node
/**
 * Calculate workload comparison between Riely and Joey.
 */

const path = require('path');
const HaloClient = require('./halo-client.js');

// Agent IDs
const AGENTS = {
    RIELY: 25,
    JOEY: 21
};

// Status weights for workload calculation
const STATUS_WEIGHTS = {
    'In Progress': 1.0,
    'New': 0.8,
    'Open': 0.8,
    'Scheduled': 0.6,
    'Pending': 0.6,
    'Waiting on User': 0.3,
    'Waiting on 3rd Party': 0.3
};

const RELEVANT_STATUSES = new Set([
    'In Progress', 'New', 'Open', 'Scheduled', 'Pending',
    'Waiting on User', 'Waiting on 3rd Party'
]);

async function getAgentTickets(client, agentId) {
    try {
        // Get open tickets for agent - open_only flag already filters to active tickets
        const endpoint = `Tickets?agent_id=${agentId}&open_only=true&count=500`;
        const response = await client.makeRequest('GET', endpoint);

        // Return all tickets since open_only already filters appropriately
        return response.tickets || [];
    } catch (error) {
        console.error(`Error fetching tickets for agent ${agentId}: ${error.message}`);
        return [];
    }
}

function calculateWeightedWorkload(tickets) {
    const statusCounts = {};
    let weightedScore = 0;

    tickets.forEach(ticket => {
        const statusId = ticket.status_id || 0;
        statusCounts[`Status ${statusId}`] = (statusCounts[`Status ${statusId}`] || 0) + 1;

        // Use a simple weight of 0.8 for all open tickets since we don't have status names
        // This still provides relative comparison between agents
        weightedScore += 0.8;
    });

    return {
        total_tickets: tickets.length,
        status_counts: statusCounts,
        weighted_score: Math.round(weightedScore * 10) / 10
    };
}

async function main() {
    const client = new HaloClient();

    const results = {
        agents: []
    };

    // Fetch workload for Riely
    console.error('Fetching tickets for Riely (ID 25)...');
    const rielyTickets = await getAgentTickets(client, AGENTS.RIELY);
    const rielyWorkload = calculateWeightedWorkload(rielyTickets);
    results.agents.push({
        agent_id: AGENTS.RIELY,
        agent_name: 'Riely',
        ...rielyWorkload
    });

    // Fetch workload for Joey
    console.error('Fetching tickets for Joey (ID 21)...');
    const joeyTickets = await getAgentTickets(client, AGENTS.JOEY);
    const joeyWorkload = calculateWeightedWorkload(joeyTickets);
    results.agents.push({
        agent_id: AGENTS.JOEY,
        agent_name: 'Joey',
        ...joeyWorkload
    });

    // Determine recommended agent
    if (rielyWorkload.weighted_score < joeyWorkload.weighted_score) {
        results.recommended_agent_id = AGENTS.RIELY;
        results.recommended_agent_name = 'Riely';
        results.is_tied = false;
    } else if (joeyWorkload.weighted_score < rielyWorkload.weighted_score) {
        results.recommended_agent_id = AGENTS.JOEY;
        results.recommended_agent_name = 'Joey';
        results.is_tied = false;
    } else {
        // Tied - default to Riely but mark as tied
        results.recommended_agent_id = AGENTS.RIELY;
        results.recommended_agent_name = 'Riely';
        results.is_tied = true;
    }

    // Output as JSON
    console.log(JSON.stringify(results, null, 2));
}

main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
