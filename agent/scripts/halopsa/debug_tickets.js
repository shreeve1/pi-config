#!/usr/bin/env node
const path = require('path');
const HaloClient = require('./halo-client.js');

async function main() {
    const client = new HaloClient();

    const endpoint = `Tickets?agent_id=25&open_only=true&count=10`;
    console.log(`Fetching: ${endpoint}`);

    const response = await client.makeRequest('GET', endpoint);

    console.log('\nResponse keys:', Object.keys(response));
    console.log('Response:', JSON.stringify(response, null, 2));
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
