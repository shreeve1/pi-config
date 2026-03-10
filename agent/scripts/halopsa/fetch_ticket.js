/**
 * HaloPSA Ticket Fetch Script (READ-ONLY)
 *
 * GUARDRAIL NOTICE:
 * This script is designed to be READ-ONLY. It fetches ticket data from HaloPSA
 * and generates markdown research files. It does NOT modify any data in the PSA.
 *
 * Safety Features:
 * - No API write operations (POST, PATCH, DELETE to PSA endpoints)
 * - Only reads ticket data and generates local research files
 * - Output files are written to tickets/ directory for research purposes
 * - Protected by guardrails configuration (see lib/guardrails/)
 *
 * Allowed Operations:
 * - GET requests to Tickets, Actions, Client, Users, Site endpoints
 * - Writing research output files to tickets/single/ directory
 * - Creating temporary JSON cache files in /tmp/
 *
 * Prohibited Operations:
 * - Modifying ticket data via API
 * - Modifying client data via API
 * - Creating or updating actions via API
 * - Any writes to protected files (API clients, config, etc.)
 *
 * @module fetch_ticket
 * @read-only true
 * @protected true
 */

const HaloPSAClient = require('./halo-client');
const fs = require('fs');
const path = require('path');
const itglueHelper = require('./itglue_helper');
const { htmlToText } = require('html-to-text');

/**
 * Truncate text to maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text with "..." if needed
 */
function truncate(text, maxLength = 200) {
    if (!text) return '';
    if (text.length <= maxLength) return text.trim();
    return text.substring(0, maxLength).trim() + '...';
}

/**
 * Clean HTML content using html-to-text library
 * @param {string} html - HTML content to clean
 * @returns {string} - Cleaned text content
 */
function cleanHtml(html) {
    if (!html) return '';
    try {
        const text = htmlToText(html, {
            wordwrap: false,
            preserveNewlines: true,
            selectors: [
                { selector: 'img', format: 'skip' },
                { selector: 'a', options: { ignoreHref: true } }
            ]
        });
        return text.trim();
    } catch (error) {
        // Fallback to basic HTML tag removal if html-to-text fails
        return html.replace(/<[^>]*>/g, '').trim();
    }
}

/**
 * Normalize ticket field names from inconsistent API responses
 * @param {object} ticket - Raw ticket object from API
 * @returns {object} - Normalized ticket object
 */
function normalizeTicket(ticket) {
    if (!ticket) return ticket;
    return {
        ...ticket,
        client_name: ticket.client_name || ticket.clientname || null,
        status_name: ticket.status_name || ticket.statusname || null,
        agent_name: ticket.agent_name || ticket.agentname || null
    };
}

/**
 * Sanitize ticket summary for use as filename
 * @param {string} summary - Ticket summary text
 * @returns {string} - Sanitized filename-safe string
 */
function sanitizeSummary(summary) {
    if (!summary) return 'untitled';
    return summary
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .substring(0, 50); // Limit length
}

/**
 * Format action details for markdown output
 * @param {object} action - Action object from API
 * @returns {string} - Formatted action string
 */
function formatAction(action) {
    const parts = [];

    // Date/time
    if (action.dateoccurred || action.date_created) {
        const date = new Date(action.dateoccurred || action.date_created);
        parts.push(`**${date.toLocaleString()}**`);
    }

    // Who
    if (action.agent_name || action.agentname || action.user_name || action.username) {
        const who = action.agent_name || action.agentname || action.user_name || action.username;
        parts.push(`*${who}*`);
    }

    // What (type)
    if (action.action_type || action.type || action.note_type) {
        const type = action.action_type || action.type || action.note_type;
        parts.push(`[${type}]`);
    }

    // Description
    let description = '';
    if (action.notes_html || action.description_html || action.html) {
        // Clean HTML from notes
        const html = action.notes_html || action.description_html || action.html;
        try {
            description = htmlToText(html, {
                wordwrap: false,
                preserveNewlines: true,
                selectors: [
                    { selector: 'img', format: 'skip' },
                    { selector: 'a', options: { ignoreHref: true } }
                ]
            }).trim();
        } catch (e) {
            description = html.replace(/<[^>]*>/g, '').trim();
        }
    } else if (action.notes || action.description || action.note) {
        description = action.notes || action.description || action.note;
    }

    return parts.join(' ') + (description ? `\n\n${description}` : '');
}

/**
 * Fetch client details from HaloPSA
 *
 * READ-ONLY: GET request only, no modifications
 *
 * @param {number} clientId - Client ID
 * @returns {object|null} - Client object or null if not found
 * @read-only true
 * @safe yes
 */
async function fetchClientDetails(clientId) {
    try {
        const client = new HaloPSAClient();
        const response = await client.makeRequest('GET', `Client/${clientId}`);
        return response;
    } catch (error) {
        console.error(`⚠️  Failed to fetch client details for ID ${clientId}:`, error.message);
        return null;
    }
}

/**
 * Fetch client sites from HaloPSA
 *
 * READ-ONLY: GET request only, no modifications
 *
 * @param {number} clientId - Client ID
 * @returns {array} - Array of site objects
 * @read-only true
 * @safe yes
 */
async function fetchClientSites(clientId) {
    try {
        const client = new HaloPSAClient();
        const response = await client.makeRequest('GET', `Site?client_id=${clientId}&count=50`);
        return Array.isArray(response) ? response : (response?.sites || []);
    } catch (error) {
        console.error(`⚠️  Failed to fetch sites for client ${clientId}:`, error.message);
        return [];
    }
}

/**
 * Fetch client contacts/users from HaloPSA
 *
 * READ-ONLY: GET request only, no modifications
 *
 * @param {number} clientId - Client ID
 * @returns {array} - Array of contact/user objects
 * @read-only true
 * @safe yes
 */
async function fetchClientContacts(clientId) {
    try {
        const client = new HaloPSAClient();
        const response = await client.makeRequest('GET', `Users?client_id=${clientId}&count=100`);
        return Array.isArray(response) ? response : (response?.users || []);
    } catch (error) {
        console.error(`⚠️  Failed to fetch contacts for client ${clientId}:`, error.message);
        return [];
    }
}

/**
 * Fetch end-user details from HaloPSA
 *
 * READ-ONLY: GET request only, no modifications
 *
 * @param {number} userId - User ID
 * @returns {object|null} - User object or null if not found
 * @read-only true
 * @safe yes
 */
async function fetchEndUserDetails(userId) {
    try {
        const client = new HaloPSAClient();
        const response = await client.makeRequest('GET', `Users/${userId}`);
        return response;
    } catch (error) {
        console.error(`⚠️  Failed to fetch end-user details for ID ${userId}:`, error.message);
        return null;
    }
}

/**
 * Generate markdown file content for a ticket
 * @param {object} ticket - Ticket object from HaloPSA
 * @param {array} actions - Array of ticket actions/comments
 * @param {object} itglueResearch - ITGlue research results (org ID only)
 * @param {object} clientData - Client data including details, sites, contacts
 * @param {object} endUserData - End-user details from Users endpoint
 * @returns {string} - Markdown formatted content
 */
function generateTicketMarkdown(ticket, actions, itglueResearch, clientData = null, endUserData = null) {
    const lines = [];
    const normalized = normalizeTicket(ticket);

    // TICKET SUMMARY TABLE
    lines.push('# TICKET SUMMARY');
    lines.push('');
    lines.push('| Field | Value |');
    lines.push('|-------|-------|');
    lines.push(`| Ticket ID | ${ticket.id} |`);
    lines.push(`| Summary | ${ticket.summary || 'Untitled'} |`);
    lines.push(`| Client | ${normalized.client_name || 'N/A'} |`);
    lines.push(`| Status | ${normalized.status_name || 'N/A'} |`);
    lines.push(`| Agent | ${normalized.agent_name || 'N/A'} |`);

    const created = ticket.dateoccurred
        ? new Date(ticket.dateoccurred).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : 'N/A';
    lines.push(`| Created | ${created} |`);

    const fixBy = ticket.fixbydate
        ? new Date(ticket.fixbydate).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
        : 'N/A';
    lines.push(`| Fix By Date | ${fixBy} |`);

    const categories = [ticket.category_1, ticket.category_2, ticket.category_3]
        .filter(Boolean)
        .join(' > ') || 'N/A';
    lines.push(`| Category | ${categories} |`);
    lines.push('');

    // DESCRIPTION (full, not truncated)
    lines.push('## Description');
    lines.push('');
    if (ticket.details_html) {
        const fullText = cleanHtml(ticket.details_html);
        lines.push(fullText || 'No description provided');
    } else {
        lines.push(ticket.details || 'No description provided');
    }
    lines.push('');

    // END-USER DETAILS
    if (endUserData) {
        lines.push('## End-User Details');
        lines.push('');
        lines.push('| Field | Value |');
        lines.push('|-------|-------|');

        const name = endUserData.name || `${endUserData.firstname || ''} ${endUserData.surname || ''}`.trim() || 'N/A';
        const email = endUserData.email || 'N/A';
        const title = endUserData.title || 'N/A';
        const department = endUserData.department || 'N/A';
        const phone = endUserData.phonenumber_preferred || endUserData.phonenumber || 'N/A';
        const mobile = endUserData.phonenumber_mobile || 'N/A';
        const site = endUserData.site_name || 'N/A';
        const isImportant = endUserData.isimportantcontact ? 'Yes' : 'No';
        const isActive = endUserData.isactive !== false ? 'Yes' : 'No';

        lines.push(`| Name | ${name} |`);
        lines.push(`| Email | ${email} |`);
        lines.push(`| Title | ${title} |`);
        lines.push(`| Department | ${department} |`);
        lines.push(`| Phone | ${phone} |`);
        lines.push(`| Mobile | ${mobile} |`);
        lines.push(`| Site | ${site} |`);
        lines.push(`| Important Contact | ${isImportant} |`);
        lines.push(`| Active | ${isActive} |`);
        lines.push('');
    }

    // CLIENT INFORMATION
    if (clientData && clientData.details) {
        lines.push('## Client Information');
        lines.push('');

        // Organization details
        lines.push('### Organization');
        lines.push('');
        lines.push('| Field | Value |');
        lines.push('|-------|-------|');
        lines.push(`| Client ID | ${clientData.details.id || 'N/A'} |`);
        lines.push(`| Name | ${clientData.details.name || 'N/A'} |`);
        lines.push(`| Reference | ${clientData.details.ref || 'N/A'} |`);
        lines.push(`| IT-Glue ID | ${clientData.details.itglue_id || 'N/A'} |`);
        lines.push(`| VIP | ${clientData.details.is_vip ? 'Yes' : 'No'} |`);
        lines.push(`| Customer Type | ${clientData.details.customertype || 'N/A'} |`);
        lines.push('');

        // Sites
        if (clientData.sites && clientData.sites.length > 0) {
            lines.push(`### Sites (${clientData.sites.length})`);
            lines.push('');
            lines.push('| Site | Phone | Timezone | Main Site |');
            lines.push('|------|-------|----------|-----------|');
            clientData.sites.forEach(site => {
                const siteName = site.name || 'N/A';
                const phone = site.phonenumber || 'N/A';
                const timezone = site.timezone || 'N/A';
                const isMain = site.isinvoicesite ? 'Yes' : 'No';
                lines.push(`| ${siteName} | ${phone} | ${timezone} | ${isMain} |`);
            });
            lines.push('');
        }

        // Key Contacts
        if (clientData.contacts && clientData.contacts.length > 0) {
            // Filter for important contacts and limit to top 10
            const keyContacts = clientData.contacts
                .filter(c => c.isimportantcontact || c.email || c.phonenumber_preferred)
                .slice(0, 10);

            lines.push(`### Key Contacts (${keyContacts.length})`);
            lines.push('');
            lines.push('| Name | Title | Email | Phone |');
            lines.push('|------|-------|-------|-------|');
            keyContacts.forEach(contact => {
                const name = contact.name || `${contact.firstname || ''} ${contact.surname || ''}`.trim() || 'N/A';
                const title = contact.title || 'N/A';
                const email = contact.email || 'N/A';
                const phone = contact.phonenumber_preferred || contact.phonenumber || 'N/A';
                lines.push(`| ${name} | ${title} | ${email} | ${phone} |`);
            });
            lines.push('');
        }

        lines.push('---');
        lines.push('');
    }

    // ACTIONS HISTORY (complete, for context)
    lines.push('## Actions History');
    lines.push('');
    if (actions && actions.length > 0) {
        lines.push(`**Total Actions:** ${actions.length}`);
        lines.push('');

        // Show all actions
        actions.forEach((action, index) => {
            lines.push(`### Action ${index + 1}`);
            lines.push(formatAction(action));
            lines.push('');
        });
    } else {
        lines.push('*No actions recorded*');
        lines.push('');
    }

    lines.push('---');
    lines.push('');

    // IT-GLUE REFERENCE
    if (itglueResearch && itglueResearch.found) {
        lines.push('**IT-Glue Organization:** ' +
                   `${itglueResearch.orgId} (${itglueResearch.clientName})`);
        lines.push('');
        lines.push('*Use the itglue-fetcher skill to retrieve detailed configurations, documents, and network information for this organization.*');
        lines.push('');
    }

    lines.push('---');
    lines.push('');

    // RESEARCH SECTIONS (to be filled by Claude)
    lines.push('## Problem');
    lines.push('');
    lines.push('*[Claude: Generate a clear, concise problem statement (2-4 sentences) ' +
               'based on the ticket description and context]*');
    lines.push('');

    lines.push('## RECOMMENDED SOLUTION');
    lines.push('');
    lines.push('*[Claude: Provide detailed step-by-step solution with commands/code examples. ' +
               'Include numbered steps, specific commands, configuration settings, and verification steps]*');
    lines.push('');

    lines.push('## CONSIDERATIONS');
    lines.push('');
    lines.push('*[Claude: Document important factors including scope of impact, timing considerations, ' +
               'potential risks, edge cases, and when to escalate]*');
    lines.push('');

    lines.push('## NEXT STEPS');
    lines.push('');
    lines.push('*[Claude: Provide actionable items with time estimates in this format:]*');
    lines.push('');
    lines.push('*1. [Action item] - [Time estimate]*');
    lines.push('*2. [Action item] - [Time estimate]*');
    lines.push('*...*');
    lines.push('');
    lines.push('*Total estimated time: [X minutes]*');
    lines.push('');

    lines.push('## Sources');
    lines.push('');
    lines.push('*[Claude: List all web research sources as markdown links]*');
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push(`**Fetched:** ${new Date().toISOString()}`);

    return lines.join('\n');
}

/**
 * Fetch complete ticket details from HaloPSA
 *
 * READ-ONLY OPERATION: This function only reads data from the PSA.
 * No modifications are made to any tickets or related data.
 *
 * API Operations Used:
 * - GET Tickets/{id} - Fetch ticket details
 * - GET Actions?ticket_id={id} - Fetch ticket actions
 * - GET Client/{id} - Fetch client information
 * - GET Site?client_id={id} - Fetch client sites
 * - GET Users?client_id={id} - Fetch client contacts
 * - GET Users/{id} - Fetch end-user details
 *
 * Local File Operations:
 * - Writes: tickets/single/{id}_{summary}.md (research output)
 * - Writes: /tmp/halo_ticket_{id}.json (cache)
 *
 * @param {number|string} ticketId - The ticket ID to fetch
 * @returns {Promise<object|null>} - Object containing ticket, actions, client data, etc.
 * @read-only true
 * @safe yes
 */
async function fetchTicketDetails(ticketId) {
    const client = new HaloPSAClient();

    try {
        console.log(`\n🔍 Fetching ticket #${ticketId} from HaloPSA...\n`);
        await client.authenticate();

        const ticketsResponse = await client.makeRequest('GET', `Tickets/${ticketId}`);

        let ticket = null;
        if (ticketsResponse?.tickets && Array.isArray(ticketsResponse.tickets)) {
            ticket = ticketsResponse.tickets.find(t => t.id === parseInt(ticketId));
        } else if (Array.isArray(ticketsResponse)) {
            ticket = ticketsResponse.find(t => t.id === parseInt(ticketId));
        } else {
            ticket = ticketsResponse;
        }
        
        if (!ticket) {
            console.error(`❌ Ticket #${ticketId} not found`);
            return null;
        }
        
        let actions = [];
        try {
            const actionsResponse = await client.makeRequest('GET', `Actions?ticket_id=${ticketId}`);
            actions = Array.isArray(actionsResponse) ? actionsResponse : (actionsResponse?.actions || []);
        } catch (err) {
            console.log('⚠️  Note: Could not fetch actions');
        }

        // Normalize ticket fields
        const normalized = normalizeTicket(ticket);

        // Simplified terminal output
        const status = normalized.status_name || 'N/A';
        const agent = normalized.agent_name || 'N/A';
        const clientName = normalized.client_name || 'N/A';

        console.log('');
        console.log(`🎫 Ticket #${ticket.id}: ${ticket.summary || 'Untitled'}`);
        console.log(`   Client: ${clientName} | Status: ${status} | Agent: ${agent}`);
        console.log('');

        // Description (truncated)
        console.log('📝 Description:');
        if (ticket.details_html) {
            console.log(`   ${cleanHtml(ticket.details_html) || 'No description provided'}`);
        } else {
            console.log(`   ${truncate(ticket.details) || 'No description provided'}`);
        }
        console.log('');

        // Actions count
        const actionCount = actions ? actions.length : 0;
        console.log(`📊 ${actionCount} actions recorded`);
        console.log('');

        // Fetch client data from HaloPSA (source of truth)
        let clientData = { details: null, sites: [], contacts: [] };
        if (ticket.client_id) {
            try {
                console.log('📋 Fetching client information...');
                const [clientDetails, clientSites, clientContacts] = await Promise.all([
                    fetchClientDetails(ticket.client_id),
                    fetchClientSites(ticket.client_id),
                    fetchClientContacts(ticket.client_id)
                ]);

                clientData = {
                    details: clientDetails,
                    sites: clientSites,
                    contacts: clientContacts
                };

                if (clientDetails) {
                    console.log(`   Client: ${clientDetails.name || 'N/A'}`);
                    console.log(`   Sites: ${clientSites.length}`);
                    console.log(`   Contacts: ${clientContacts.length}`);
                }
            } catch (err) {
                console.error('⚠️  Failed to fetch client data:', err.message);
            }
            console.log('');
        }

        // Fetch end-user details from HaloPSA
        let endUserData = null;
        if (ticket.user_id) {
            try {
                console.log('👤 Fetching end-user details...');
                endUserData = await fetchEndUserDetails(ticket.user_id);
                if (endUserData) {
                    console.log(`   User: ${endUserData.name || `${endUserData.firstname || ''} ${endUserData.surname || ''}`.trim() || 'N/A'}`);
                    console.log(`   Email: ${endUserData.email || 'N/A'}`);
                }
            } catch (err) {
                console.error('⚠️  Failed to fetch end-user data:', err.message);
            }
            console.log('');
        }

        // IT-Glue ID lookup using client.itglue_id from HaloPSA (no extra lookup performed)
        let itglueResearch = { found: false, orgId: null, clientName: null };
        if (clientData.details && clientData.details.itglue_id) {
            itglueResearch = {
                found: true,
                orgId: clientData.details.itglue_id,
                clientName: clientData.details.name || normalized.client_name
            };
            console.log(`🔗 IT-Glue ID: ${clientData.details.itglue_id}`);
        }

        const outputData = {
            ticket,
            actions: actions || [],
            itglue: itglueResearch,
            vsa: null,
            client: clientData,
            endUser: endUserData,
            research_context: {
                client_name: normalized.client_name,
                client_id: ticket.client_id,
                summary: ticket.summary,
                description: ticket.details || ticket.details_html,
                categories: [ticket.category_1, ticket.category_2, ticket.category_3].filter(Boolean),
                asset: ticket.asset_name,
                recent_actions: (actions || []).slice(0, 5)
            }
        };

        const outputFile = `/tmp/halo_ticket_${ticketId}.json`;
        fs.writeFileSync(outputFile, JSON.stringify(outputData, null, 2));

        // Generate and save markdown file
        const ticketsDir = path.join(process.cwd(), 'tickets', 'single');
        if (!fs.existsSync(ticketsDir)) {
            fs.mkdirSync(ticketsDir, { recursive: true });
        }

        const sanitizedSummary = sanitizeSummary(ticket.summary);
        const markdownFilename = `${ticket.id}_${sanitizedSummary}.md`;
        const markdownPath = path.join(ticketsDir, markdownFilename);

        const markdownContent = generateTicketMarkdown(ticket, actions, itglueResearch, clientData, endUserData);
        fs.writeFileSync(markdownPath, markdownContent);

        console.log(`📁 Saved to: ${markdownPath}`);
        if (itglueResearch.found) {
            console.log(`🔗 IT-Glue: ${itglueResearch.orgId} (${itglueResearch.clientName})`);
        }
        console.log('');
        console.log('✅ Ready for research!');
        console.log('');

        return outputData;
        
    } catch (error) {
        console.error('❌ Error fetching ticket:', error.message);
        if (error.response?.data) {
            console.error('API Response:', JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

const ticketId = process.argv[2];

// Validate ticket ID
if (!ticketId) {
    console.log('Usage: node fetch_ticket.js <ticket_id>');
    console.log('Example: node fetch_ticket.js 64268');
    process.exit(1);
}

// Check if ticket ID is numeric
const numericId = parseInt(ticketId, 10);
if (isNaN(numericId)) {
    console.error('❌ Error: Ticket ID must be a number');
    console.log('Usage: node fetch_ticket.js <ticket_id>');
    console.log('Example: node fetch_ticket.js 64268');
    process.exit(1);
}

// Check if ticket ID is positive
if (numericId <= 0) {
    console.error('❌ Error: Ticket ID must be a positive number');
    console.log('Usage: node fetch_ticket.js <ticket_id>');
    console.log('Example: node fetch_ticket.js 64268');
    process.exit(1);
}

fetchTicketDetails(ticketId);
