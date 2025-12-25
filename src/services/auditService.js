/**
 * Audit Service
 * Logs all IR actions for compliance and forensics
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class AuditService {
    constructor() {
        this.auditLogPath = process.env.AUDIT_LOG_PATH || './logs/audit.log';
        this.ensureLogDirectory();
    }

    /**
     * Ensure the audit log directory exists
     */
    ensureLogDirectory() {
        const logDir = path.dirname(path.resolve(this.auditLogPath));

        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
            logger.info('Created audit log directory', { path: logDir });
        }
    }

    /**
     * Log an audit event
     * @param {object} event - Audit event details
     * @param {string} event.action - Action performed (e.g., 'QUARANTINE', 'STATUS')
     * @param {string} event.userId - Slack user ID
     * @param {string} event.userName - Slack username
     * @param {string} event.target - Target hostname/IP
     * @param {string} event.status - Result status ('SUCCESS', 'FAILED')
     * @param {object} [event.details] - Additional details
     * @param {string} [event.error] - Error message if failed
     */
    async log(event) {
        const auditEntry = {
            timestamp: new Date().toISOString(),
            eventId: this.generateEventId(),
            action: event.action,
            user: {
                id: event.userId,
                name: event.userName
            },
            target: event.target,
            status: event.status,
            details: event.details || null,
            error: event.error || null,
            metadata: {
                hostname: process.env.COMPUTERNAME || 'unknown',
                botVersion: '1.0.0'
            }
        };

        // Log to Winston (for console and combined log)
        const logLevel = event.status === 'FAILED' ? 'error' : 'info';
        logger[logLevel]('Audit event', {
            action: auditEntry.action,
            user: auditEntry.user.name,
            target: auditEntry.target,
            status: auditEntry.status
        });

        // Append to dedicated audit log file
        try {
            const logLine = JSON.stringify(auditEntry) + '\n';
            fs.appendFileSync(path.resolve(this.auditLogPath), logLine);
        } catch (error) {
            logger.error('Failed to write audit log', { error: error.message });
        }

        return auditEntry;
    }

    /**
     * Generate a unique event ID
     * Format: IR-YYYYMMDD-XXXXXX
     */
    generateEventId() {
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `IR-${date}-${random}`;
    }

    /**
     * Query audit logs
     * @param {object} filters - Query filters
     * @param {string} [filters.action] - Filter by action type
     * @param {string} [filters.userId] - Filter by user ID
     * @param {string} [filters.target] - Filter by target
     * @param {string} [filters.startDate] - Start date (ISO string)
     * @param {string} [filters.endDate] - End date (ISO string)
     * @param {number} [filters.limit] - Maximum entries to return
     * @returns {object[]} - Matching audit entries
     */
    async query(filters = {}) {
        const logPath = path.resolve(this.auditLogPath);

        if (!fs.existsSync(logPath)) {
            return [];
        }

        try {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.trim().split('\n').filter(line => line);

            let entries = lines.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(entry => entry !== null);

            // Apply filters
            if (filters.action) {
                entries = entries.filter(e => e.action === filters.action);
            }

            if (filters.userId) {
                entries = entries.filter(e => e.user?.id === filters.userId);
            }

            if (filters.target) {
                entries = entries.filter(e => e.target === filters.target);
            }

            if (filters.startDate) {
                const startDate = new Date(filters.startDate);
                entries = entries.filter(e => new Date(e.timestamp) >= startDate);
            }

            if (filters.endDate) {
                const endDate = new Date(filters.endDate);
                entries = entries.filter(e => new Date(e.timestamp) <= endDate);
            }

            if (filters.status) {
                entries = entries.filter(e => e.status === filters.status);
            }

            // Sort by timestamp descending (most recent first)
            entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // Apply limit
            if (filters.limit && filters.limit > 0) {
                entries = entries.slice(0, filters.limit);
            }

            return entries;

        } catch (error) {
            logger.error('Failed to query audit logs', { error: error.message });
            return [];
        }
    }

    /**
     * Get summary statistics
     * @param {number} days - Number of days to analyze
     * @returns {object} - Summary statistics
     */
    async getSummary(days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const entries = await this.query({ startDate: startDate.toISOString() });

        const summary = {
            period: `Last ${days} days`,
            totalEvents: entries.length,
            byAction: {},
            byStatus: { SUCCESS: 0, FAILED: 0 },
            byUser: {},
            byTarget: {}
        };

        entries.forEach(entry => {
            // Count by action
            summary.byAction[entry.action] = (summary.byAction[entry.action] || 0) + 1;

            // Count by status
            if (entry.status === 'SUCCESS') summary.byStatus.SUCCESS++;
            else summary.byStatus.FAILED++;

            // Count by user
            const userName = entry.user?.name || 'Unknown';
            summary.byUser[userName] = (summary.byUser[userName] || 0) + 1;

            // Count by target
            if (entry.target) {
                summary.byTarget[entry.target] = (summary.byTarget[entry.target] || 0) + 1;
            }
        });

        return summary;
    }

    /**
     * Export audit logs to CSV format
     * @param {object} filters - Query filters
     * @returns {string} - CSV content
     */
    async exportToCsv(filters = {}) {
        const entries = await this.query(filters);

        if (entries.length === 0) {
            return 'No entries found';
        }

        const headers = ['Timestamp', 'Event ID', 'Action', 'User ID', 'User Name', 'Target', 'Status', 'Error'];
        const rows = entries.map(e => [
            e.timestamp,
            e.eventId,
            e.action,
            e.user?.id || '',
            e.user?.name || '',
            e.target || '',
            e.status,
            e.error || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        return csvContent;
    }
}

module.exports = { AuditService };
