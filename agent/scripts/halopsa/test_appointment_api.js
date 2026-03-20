#!/usr/bin/env node
const path = require('path');
const HaloClient = require('./halo-client.js');

async function test() {
    const client = new HaloClient();

    // Test query for Joey's appointments today
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startStr = now.toISOString();
    const endStr = tomorrow.toISOString();

    console.log('Testing Appointment API query for agent 21 (Joey)');
    console.log('Start:', startStr);
    console.log('End:', endStr);
    console.log('');

    try {
        const endpoint = `Appointment?agent_id=21&start_date=${encodeURIComponent(startStr)}&end_date=${encodeURIComponent(endStr)}&count=100`;
        console.log('Endpoint:', endpoint);
        console.log('');

        const response = await client.makeRequest('GET', endpoint);

        console.log('Response type:', Array.isArray(response) ? 'Array' : 'Object');
        console.log('Response keys:', Object.keys(response).slice(0, 10));

        const appointments = Array.isArray(response) ? response : (response.appointments || []);
        console.log('Appointments found:', appointments.length);

        if (appointments.length > 0) {
            console.log('\nFirst appointment:');
            const appt = appointments[0];
            console.log('  ID:', appt.id);
            console.log('  Subject:', appt.subject);
            console.log('  Start:', appt.start_date);
            console.log('  End:', appt.end_date);
            console.log('  Agent ID:', appt.agent_id);
        }
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

test();
