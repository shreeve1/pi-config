#!/usr/bin/env node
const path = require('path');
const HaloClient = require('./halo-client.js');

async function test() {
    const client = new HaloClient();

    // Query with 7-day window
    const start = '2026-02-20T19:00:00.000Z';
    const end = '2026-02-27T19:00:00.000Z';

    const endpoint = `Appointment?agent_id=21&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&count=500`;

    console.log('Analyzing Joey\'s appointments (agent_id=21)');
    console.log('Date range:', start, 'to', end);
    console.log('');

    const response = await client.makeRequest('GET', endpoint);
    const appointments = Array.isArray(response) ? response : [];

    console.log('Total appointments returned:', appointments.length);
    console.log('');

    // Group by agent
    const byAgent = {};
    appointments.forEach(a => {
        const agentId = a.agent_id || 'unknown';
        byAgent[agentId] = (byAgent[agentId] || 0) + 1;
    });

    console.log('Appointments by agent_id:');
    Object.entries(byAgent).sort((a, b) => b[1] - a[1]).forEach(([id, count]) => {
        console.log(`  Agent ${id}: ${count} appointments`);
    });
    console.log('');

    // Sample appointments for Joey
    const joeyAppts = appointments.filter(a => a.agent_id === 21);
    console.log('Joey\'s appointments (agent_id=21):', joeyAppts.length);
    console.log('');
    console.log('Sample of Joey\'s appointments:');
    joeyAppts.slice(0, 10).forEach(a => {
        console.log(`  ${a.start_date} - ${a.subject}`);
    });
    console.log('');

    // Count by day
    const byDay = {};
    joeyAppts.forEach(a => {
        const day = a.start_date.split('T')[0];
        byDay[day] = (byDay[day] || 0) + 1;
    });

    console.log('Joey\'s appointments by day:');
    Object.entries(byDay).sort().forEach(([day, count]) => {
        console.log(`  ${day}: ${count} appointments`);
    });
}

test();
