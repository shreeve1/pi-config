#!/usr/bin/env node
/**
 * Find next available appointment slot for an agent.
 * Uses US/Pacific timezone for proper PST/PDT handling.
 */

const path = require('path');
const { DateTime } = require('luxon');
const HaloClient = require('./halo-client.js');

// Business hours configuration (PST/PDT)
const TIMEZONE = 'America/Los_Angeles'; // US/Pacific
const BUSINESS_START_HOUR = 9;
const BUSINESS_START_MINUTE = 30;
const BUSINESS_END_HOUR = 17;
const BUSINESS_END_MINUTE = 30;
const BUFFER_MINUTES = 15;
const SEARCH_DAYS = 7;
const SLOT_INCREMENT = 15;

function parseArgs() {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.error('Usage: find_availability.js <agent_id> <duration_minutes>');
        process.exit(1);
    }
    return {
        agentId: parseInt(args[0]),
        durationMinutes: parseInt(args[1])
    };
}

function isBusinessHours(dt) {
    const day = dt.weekday; // 1=Monday, 7=Sunday
    if (day === 6 || day === 7) return false; // Skip weekends

    const hour = dt.hour;
    const minute = dt.minute;

    const startTime = BUSINESS_START_HOUR * 60 + BUSINESS_START_MINUTE;
    const endTime = BUSINESS_END_HOUR * 60 + BUSINESS_END_MINUTE;
    const currentTime = hour * 60 + minute;

    return currentTime >= startTime && currentTime < endTime;
}

function roundToNext15Min(dt) {
    const minutes = dt.minute;
    const roundedMinutes = Math.ceil(minutes / SLOT_INCREMENT) * SLOT_INCREMENT;
    return dt.set({ minute: roundedMinutes, second: 0, millisecond: 0 });
}

function formatSlot(startDt, endDt) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const dayName = dayNames[startDt.weekday === 7 ? 0 : startDt.weekday]; // Luxon uses 1-7, Sunday=7
    const month = monthNames[startDt.month - 1]; // Luxon months are 1-indexed
    const day = startDt.day;

    const startTime = startDt.toFormat('h:mm a');
    const endTime = endDt.toFormat('h:mm a');

    return `${dayName}, ${month} ${day} at ${startTime} - ${endTime}`;
}

async function getAgentAppointments(client, agentId, startDate, endDate) {
    try {
        const startStr = startDate.toUTC().toISO();
        const endStr = endDate.toUTC().toISO();

        // Note: HaloPSA Appointment API ignores agent_id query parameter
        // We must filter client-side after retrieval
        const endpoint = `Appointment?start_date=${encodeURIComponent(startStr)}&end_date=${encodeURIComponent(endStr)}&count=500`;
        const response = await client.makeRequest('GET', endpoint);

        // HaloPSA Appointment API returns array directly, not object with appointments property
        const allAppointments = Array.isArray(response) ? response : [];

        // Filter by agent_id client-side since API doesn't support this filter
        return allAppointments.filter(appt => appt.agent_id === agentId);
    } catch (error) {
        console.error(`Error fetching appointments: ${error.message}`);
        return [];
    }
}

function findNextAvailableSlot(appointments, durationMinutes) {
    // Start with current time in PST
    const now = DateTime.now().setZone(TIMEZONE);
    let candidateStart = roundToNext15Min(now);

    // Search for next SEARCH_DAYS days
    const searchEnd = now.plus({ days: SEARCH_DAYS });

    while (candidateStart < searchEnd) {
        if (!isBusinessHours(candidateStart)) {
            // Move to next business day start
            candidateStart = candidateStart.plus({ days: 1 }).set({
                hour: BUSINESS_START_HOUR,
                minute: BUSINESS_START_MINUTE,
                second: 0,
                millisecond: 0
            });
            continue;
        }

        const candidateEnd = candidateStart.plus({ minutes: durationMinutes + BUFFER_MINUTES });

        // Check if candidate slot goes past business hours
        if (!isBusinessHours(candidateEnd.minus({ milliseconds: 1 }))) {
            // Move to next business day start
            candidateStart = candidateStart.plus({ days: 1 }).set({
                hour: BUSINESS_START_HOUR,
                minute: BUSINESS_START_MINUTE,
                second: 0,
                millisecond: 0
            });
            continue;
        }

        // Check for conflicts with existing appointments (convert to PST for comparison)
        const hasConflict = appointments.some(appt => {
            const apptStart = DateTime.fromISO(appt.start_date, { zone: 'utc' }).setZone(TIMEZONE);
            const apptEnd = DateTime.fromISO(appt.end_date, { zone: 'utc' }).setZone(TIMEZONE);

            // Check if candidate slot overlaps with existing appointment
            return (candidateStart < apptEnd && candidateEnd > apptStart);
        });

        if (!hasConflict) {
            // Found available slot - return in UTC for API
            const slotEnd = candidateStart.plus({ minutes: durationMinutes });
            return {
                start: candidateStart.toUTC().toISO(),
                end: slotEnd.toUTC().toISO(),
                formatted: formatSlot(candidateStart, slotEnd),
                timezone: TIMEZONE
            };
        }

        // Move to next slot
        candidateStart = candidateStart.plus({ minutes: SLOT_INCREMENT });
    }

    return null;
}

async function main() {
    const {agentId, durationMinutes} = parseArgs();
    const client = new HaloClient();

    console.error(`Finding availability for agent ${agentId}, duration: ${durationMinutes} minutes (PST/PDT)...`);

    // Get appointments for the next SEARCH_DAYS days
    const now = DateTime.now().setZone(TIMEZONE);
    const searchEnd = now.plus({ days: SEARCH_DAYS });

    const appointments = await getAgentAppointments(client, agentId, now, searchEnd);
    console.error(`Found ${appointments.length} existing appointments`);

    const nextSlot = findNextAvailableSlot(appointments, durationMinutes);

    if (nextSlot) {
        console.log(JSON.stringify({
            available: true,
            agent_id: agentId,
            next_slot: nextSlot
        }, null, 2));
    } else {
        console.log(JSON.stringify({
            available: false,
            agent_id: agentId,
            next_slot: null,
            message: `No availability found in next ${SEARCH_DAYS} days`
        }, null, 2));
    }
}

main().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
