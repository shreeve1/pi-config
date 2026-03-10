#!/usr/bin/env node
/**
 * Create an appointment in HaloPSA linked to a ticket.
 *
 * IMPORTANT: This script expects ISO timestamps in UTC format.
 * Use find_availability.js which properly converts PST times to UTC.
 */

const path = require('path');
const HaloClient = require('./halo-client.js');

function parseArgs() {
    const args = process.argv.slice(2);
    if (args.length < 5) {
        console.error('Usage: create_appointment.js <ticket_id> <agent_id> <start_iso_utc> <end_iso_utc> <type_name>');
        console.error('Example: create_appointment.js 65405 21 "2026-02-23T17:30:00.000Z" "2026-02-23T18:30:00.000Z" "Tentative - Remote"');
        console.error('Note: Times must be in UTC format. Use find_availability.js to get proper UTC times.');
        process.exit(1);
    }
    return {
        ticketId: parseInt(args[0]),
        agentId: parseInt(args[1]),
        startDate: args[2],
        endDate: args[3],
        typeName: args[4]
    };
}

async function getTicket(client, ticketId) {
    try {
        const endpoint = `Tickets/${ticketId}`;
        return await client.makeRequest('GET', endpoint);
    } catch (error) {
        console.error(`Error fetching ticket: ${error.message}`);
        return null;
    }
}

async function createAppointment(client, ticketId, agentId, startDate, endDate, typeName, subject) {
    try {
        const appointmentData = [{
            ticket_id: ticketId,
            agent_id: agentId,
            start_date: startDate,
            end_date: endDate,
            appointment_type_name: typeName,
            subject: subject || `Ticket #${ticketId}`
        }];

        const response = await client.makeRequest('POST', 'Appointment', appointmentData);
        return response;
    } catch (error) {
        console.error(`Error creating appointment: ${error.message}`);
        throw error;
    }
}

async function main() {
    const {ticketId, agentId, startDate, endDate, typeName} = parseArgs();
    const client = new HaloClient();

    console.error(`Creating appointment for ticket ${ticketId}...`);

    // Get ticket details
    const ticket = await getTicket(client, ticketId);
    if (!ticket) {
        console.log(JSON.stringify({
            success: false,
            message: `Ticket ${ticketId} not found`
        }, null, 2));
        process.exit(1);
    }

    const subject = ticket.summary || `Ticket #${ticketId}`;
    console.error(`Ticket subject: ${subject}`);

    // Create appointment
    const result = await createAppointment(client, ticketId, agentId, startDate, endDate, typeName, subject);

    // Extract appointment ID
    let appointmentId = null;
    if (Array.isArray(result) && result.length > 0) {
        appointmentId = result[0].id;
    } else if (result && result.id) {
        appointmentId = result.id;
    }

    console.log(JSON.stringify({
        success: true,
        appointment_id: appointmentId,
        ticket_id: ticketId,
        agent_id: agentId,
        start_date: startDate,
        end_date: endDate,
        appointment_type: typeName,
        subject: subject
    }, null, 2));
}

main().catch(error => {
    console.error('Fatal error:', error.message);
    console.log(JSON.stringify({
        success: false,
        message: error.message
    }, null, 2));
    process.exit(1);
});
