/**
 * Incident Service
 * Business logic layer for incident response operations
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { PowerShellService } = require('./powershellService');
const { AuditService } = require('./auditService');

class IncidentService {
    constructor() {
        this.psService = new PowerShellService();
        this.auditService = new AuditService();
        this.activeIncidents = new Map();
        this.loadTargetsConfig();
    }

    /**
     * Load targets configuration
     */
    loadTargetsConfig() {
        const configPath = path.join(__dirname, '../config/targets.json');

        try {
            const configData = fs.readFileSync(configPath, 'utf8');
            this.targetsConfig = JSON.parse(configData);
            logger.info('Loaded targets configuration');
        } catch (error) {
            logger.warn('Failed to load targets.json', { error: error.message });
            this.targetsConfig = { targets: {}, aliases: {}, managementIPs: ['192.168.100.1'] };
        }
    }

    /**
     * Resolve target name to IP address
     * @param {string} target - Hostname, alias, or IP
     * @returns {string} - Resolved IP or original target
     */
    resolveTarget(target) {
        // Check if it's an alias
        if (this.targetsConfig.aliases && this.targetsConfig.aliases[target.toLowerCase()]) {
            target = this.targetsConfig.aliases[target.toLowerCase()];
        }

        // Check if it's a known target name
        if (this.targetsConfig.targets && this.targetsConfig.targets[target]) {
            return this.targetsConfig.targets[target].ip;
        }

        // Return as-is (assume it's an IP)
        return target;
    }

    /**
     * Get target information
     * @param {string} target - Target identifier
     * @returns {object} - Target info
     */
    getTargetInfo(target) {
        const resolved = this.resolveTarget(target);

        // Find target by IP
        for (const [name, info] of Object.entries(this.targetsConfig.targets || {})) {
            if (info.ip === resolved) {
                return { name, ...info };
            }
        }

        return { name: target, ip: resolved, description: 'Unknown target' };
    }

    /**
     * Validate target before operation
     * @param {string} target - Target to validate
     * @returns {object} - Validation result
     */
    async validateTarget(target) {
        const resolved = this.resolveTarget(target);

        // Basic IP/hostname validation
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]?$/;

        if (!ipRegex.test(resolved) && !hostnameRegex.test(resolved)) {
            return { valid: false, error: 'Invalid target format' };
        }

        // Test connectivity
        try {
            const isReachable = await this.psService.testConnection(resolved);
            return {
                valid: isReachable,
                resolved,
                error: isReachable ? null : 'Target not reachable via WinRM'
            };
        } catch (error) {
            return { valid: false, resolved, error: error.message };
        }
    }

    /**
     * Create a new incident
     * @param {object} params - Incident parameters
     * @returns {object} - Created incident
     */
    createIncident(params) {
        const incident = {
            id: this.generateIncidentId(),
            type: params.type,
            target: params.target,
            status: 'OPEN',
            createdBy: params.userId,
            createdByName: params.userName,
            createdAt: new Date().toISOString(),
            actions: [],
            notes: []
        };

        this.activeIncidents.set(incident.id, incident);
        logger.info('Incident created', { incidentId: incident.id, type: incident.type });

        return incident;
    }

    /**
     * Generate incident ID
     * Format: INC-YYYYMMDD-XXXX
     */
    generateIncidentId() {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.floor(1000 + Math.random() * 9000);
        return `INC-${date}-${random}`;
    }

    /**
     * Update incident status
     * @param {string} incidentId - Incident ID
     * @param {string} status - New status
     * @param {string} note - Optional note
     */
    updateIncidentStatus(incidentId, status, note = null) {
        const incident = this.activeIncidents.get(incidentId);

        if (!incident) {
            logger.warn('Incident not found', { incidentId });
            return null;
        }

        incident.status = status;
        incident.updatedAt = new Date().toISOString();

        if (note) {
            incident.notes.push({
                text: note,
                timestamp: new Date().toISOString()
            });
        }

        logger.info('Incident updated', { incidentId, status });
        return incident;
    }

    /**
     * Add action to incident
     * @param {string} incidentId - Incident ID
     * @param {object} action - Action details
     */
    addIncidentAction(incidentId, action) {
        const incident = this.activeIncidents.get(incidentId);

        if (!incident) {
            return null;
        }

        incident.actions.push({
            ...action,
            timestamp: new Date().toISOString()
        });

        return incident;
    }

    /**
     * Get incident by ID
     * @param {string} incidentId - Incident ID
     * @returns {object|null} - Incident or null
     */
    getIncident(incidentId) {
        return this.activeIncidents.get(incidentId) || null;
    }

    /**
     * List active incidents
     * @param {object} filters - Filter options
     * @returns {object[]} - List of incidents
     */
    listIncidents(filters = {}) {
        let incidents = Array.from(this.activeIncidents.values());

        if (filters.status) {
            incidents = incidents.filter(i => i.status === filters.status);
        }

        if (filters.target) {
            incidents = incidents.filter(i => i.target === filters.target);
        }

        if (filters.type) {
            incidents = incidents.filter(i => i.type === filters.type);
        }

        return incidents;
    }

    /**
     * Close incident
     * @param {string} incidentId - Incident ID
     * @param {string} resolution - Resolution notes
     * @param {string} closedBy - User who closed
     */
    closeIncident(incidentId, resolution, closedBy) {
        const incident = this.activeIncidents.get(incidentId);

        if (!incident) {
            return null;
        }

        incident.status = 'CLOSED';
        incident.closedAt = new Date().toISOString();
        incident.closedBy = closedBy;
        incident.resolution = resolution;

        logger.info('Incident closed', { incidentId, resolution });
        return incident;
    }

    /**
     * Get quarantine status for a target
     * @param {string} target - Target to check
     * @returns {object} - Quarantine status
     */
    async getQuarantineStatus(target) {
        const resolved = this.resolveTarget(target);

        try {
            const status = await this.psService.executeRemoteScript(
                resolved,
                './src/scripts/Get-SystemInfo.ps1',
                {}
            );

            // Check if isolation rules are in place
            // This is a simplified check - in production, you'd want to verify firewall rules
            return {
                target: resolved,
                isQuarantined: false, // Would need to check actual firewall rules
                status: status
            };
        } catch (error) {
            return {
                target: resolved,
                isQuarantined: 'unknown',
                error: error.message
            };
        }
    }

    /**
     * Get management IPs that are allowed during quarantine
     * @returns {string[]} - List of management IPs
     */
    getManagementIPs() {
        return this.targetsConfig.managementIPs || ['192.168.100.1'];
    }
}

module.exports = { IncidentService };
