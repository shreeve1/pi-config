/**
 * IT-Glue Organization Lookup Helper
 *
 * Simplified helper for looking up IT-Glue organization IDs from client names.
 * Uses workspace configuration for cross-project path resolution.
 * Data fetching is now handled by the itglue-fetcher skill.
 *
 * @see /home/itadmin/itastack/itglue/.claude/skills/itglue-fetcher/
 *
 * Data fetching is now handled by scripts/itglue/fetch_org.js which wraps
 * the Python itglue-fetcher skill from the itglue project.
 */

const fs = require('fs');
const path = require('path');

// Use workspace config for path resolution
const { getProjectResource } = require('../../../.claude/lib/workspace');

// Path to IT-Glue org mapping (resolved from workspace config)
const ORG_MAPPING_PATH = getProjectResource('itglue', 'org_mapping');

/**
 * Load the IT-Glue organization ID mapping
 * Maps client names to IT-Glue organization IDs
 */
function loadOrgMapping() {
    try {
        const content = fs.readFileSync(ORG_MAPPING_PATH, 'utf8');
        const mapping = JSON.parse(content);

        // Create reverse mapping (name -> id) for easier lookup
        const nameToId = {};
        for (const [id, name] of Object.entries(mapping)) {
            nameToId[name.toLowerCase()] = id;
        }

        return { idToName: mapping, nameToId };
    } catch (error) {
        console.error(`Failed to load IT-Glue org mapping from ${ORG_MAPPING_PATH}: ${error.message}`);
        return { idToName: {}, nameToId: {} };
    }
}

/**
 * Look up IT-Glue organization ID by client name
 * @param {string} clientName - The client name to look up
 * @returns {string|null} - The IT-Glue org ID, or null if not found
 */
function getOrgIdByClientName(clientName) {
    if (!clientName) return null;

    const { nameToId } = loadOrgMapping();
    const normalizedName = clientName.toLowerCase().trim();

    // Direct match
    if (nameToId[normalizedName]) {
        return nameToId[normalizedName];
    }

    // Partial match (in case client name is slightly different)
    for (const [name, id] of Object.entries(nameToId)) {
        if (name.includes(normalizedName) || normalizedName.includes(name)) {
            return id;
        }
    }

    return null;
}

/**
 * Get client name from IT-Glue org ID (reverse lookup)
 * @param {string} orgId - IT-Glue organization ID
 * @returns {string|null} - Client name, or null if not found
 */
function getClientNameByOrgId(orgId) {
    if (!orgId) return null;

    const { idToName } = loadOrgMapping();
    return idToName[orgId] || null;
}

/**
 * Research ITGlue for a ticket - returns basic lookup info
 * @param {object} ticket - Ticket object from HaloPSA
 * @returns {object} - ITGlue research results
 */
function researchTicketITGlue(ticket) {
    const clientName = ticket.client_name || ticket.clientname;
    if (!clientName) {
        return {
            found: false,
            reason: 'No client name found on ticket'
        };
    }

    const orgId = getOrgIdByClientName(clientName);
    if (!orgId) {
        return {
            found: false,
            reason: `No IT-Glue org ID found for client: ${clientName}`
        };
    }

    // Return basic org info - additional fetching would be done by itglue-fetcher skill
    return {
        found: true,
        orgId: orgId,
        clientName: clientName,
        message: 'IT-Glue organization found. Use itglue-fetcher skill for detailed configuration lookup.'
    };
}

module.exports = {
    loadOrgMapping,
    getOrgIdByClientName,
    getClientNameByOrgId,
    researchTicketITGlue,
    ORG_MAPPING_PATH
};
