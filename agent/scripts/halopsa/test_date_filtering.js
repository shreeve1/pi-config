#!/usr/bin/env node
const path = require('path');
const HaloClient = require('./halo-client.js');

async function test() {
    const client = new HaloClient();

    // Query with 7-day window
    const start = '2026-02-20T19:00:00.000Z';
    const end = '2026-02-27T19:00:00.000Z';

    const endpoint = `Appointment?agent_id=21&start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&count=500`;

    console.log('Querying 7-day window for Joey...');
    console.log('Requested range:', start, 'to', end);
    console.log('');

    const response = await client.makeRequest('GET', endpoint);
    const appointments = Array.isArray(response) ? response : [];

    console.log('Total appointments returned:', appointments.length);
    console.log('');

    // Check date range of returned appointments
    if (appointments.length > 0) {
        const dates = appointments.map(a => new Date(a.start_date)).sort((a, b) => a - b);
        console.log('Earliest appointment:', dates[0].toISOString());
        console.log('Latest appointment:', dates[dates.length - 1].toISOString());
        console.log('');

        // Count appointments in requested range
        const requestStart = new Date(start);
        const requestEnd = new Date(end);
        const inRange = appointments.filter(a => {
            const apptStart = new Date(a.start_date);
            return apptStart >= requestStart && apptStart <= requestEnd;
        });
        console.log('Appointments in requested range (start_date):', inRange.length);
        console.log('Appointments outside range:', appointments.length - inRange.length);

        // Sample some out-of-range appointments
        const outOfRange = appointments.filter(a => {
            const apptStart = new Date(a.start_date);
            return apptStart < requestStart || apptStart > requestEnd;
        });
        console.log('');
        console.log('Sample out-of-range appointments:');
        outOfRange.slice(0, 3).forEach(a => {
            console.log(' ', a.start_date, '-', a.subject);
        });
    }
}

test();
