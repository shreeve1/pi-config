#!/usr/bin/env node
const path = require('path');
const { DateTime } = require('luxon');

const TIMEZONE = 'America/Los_Angeles';
const SEARCH_DAYS = 7;

const now = DateTime.now().setZone(TIMEZONE);
const searchEnd = now.plus({ days: SEARCH_DAYS });

console.log('Current time (PST):', now.toFormat('yyyy-MM-dd HH:mm:ss'));
console.log('Search end (PST):', searchEnd.toFormat('yyyy-MM-dd HH:mm:ss'));
console.log('');
console.log('UTC times sent to API:');
console.log('  Start:', now.toUTC().toISO());
console.log('  End:', searchEnd.toUTC().toISO());
console.log('');
console.log('Days between:', searchEnd.diff(now, 'days').days);
