/**
 * Authentication Middleware
 * Handles role-based access control (RBAC) for IR commands
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Load roles configuration
let rolesConfig = null;

function loadRolesConfig() {
    if (rolesConfig) return rolesConfig;

    const configPath = path.join(__dirname, '../config/roles.json');

    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        rolesConfig = JSON.parse(configData);
        logger.info('Loaded roles configuration');
    } catch (error) {
        logger.warn('Failed to load roles.json, using defaults', { error: error.message });
        rolesConfig = {
            roles: {
                ADMIN: { permissions: ['help', 'status', 'quarantine', 'collect', 'kill', 'memdump'] },
                IR_ANALYST: { permissions: ['help', 'status', 'quarantine', 'collect', 'kill', 'memdump'] },
                SOC_TIER2: { permissions: ['help', 'status', 'collect'] },
                SOC_TIER1: { permissions: ['help', 'status'] }
            },
            users: {},
            defaultRole: 'SOC_TIER1',
            requireAuthentication: false
        };
    }

    return rolesConfig;
}

/**
 * Get user's role from configuration
 * @param {string} userId - Slack user ID
 * @returns {string} - Role name
 */
function getUserRole(userId) {
    const config = loadRolesConfig();

    // Check if user has a specific role assigned
    if (config.users && config.users[userId]) {
        return config.users[userId].role;
    }

    // Return default role
    return config.defaultRole || 'SOC_TIER1';
}

/**
 * Get permissions for a role
 * @param {string} roleName - Role name
 * @returns {string[]} - Array of permission names
 */
function getRolePermissions(roleName) {
    const config = loadRolesConfig();

    if (config.roles && config.roles[roleName]) {
        return config.roles[roleName].permissions || [];
    }

    return [];
}

/**
 * Check if user has permission for an action
 * @param {string} userId - Slack user ID
 * @param {string} action - Action name (e.g., 'quarantine', 'status')
 * @returns {boolean} - True if permitted
 */
async function checkPermission(userId, action) {
    const config = loadRolesConfig();

    // If authentication is not required, allow all
    if (!config.requireAuthentication) {
        logger.debug('Authentication disabled, allowing action', { userId, action });
        return true;
    }

    const role = getUserRole(userId);
    const permissions = getRolePermissions(role);

    const hasPermission = permissions.includes(action);

    logger.info('Permission check', {
        userId,
        role,
        action,
        hasPermission
    });

    return hasPermission;
}

/**
 * Get user info from config
 * @param {string} userId - Slack user ID
 * @returns {object|null} - User info or null
 */
function getUserInfo(userId) {
    const config = loadRolesConfig();

    if (config.users && config.users[userId]) {
        return {
            ...config.users[userId],
            userId
        };
    }

    return {
        userId,
        role: config.defaultRole || 'SOC_TIER1',
        name: 'Unknown'
    };
}

/**
 * Reload configuration (useful for runtime updates)
 */
function reloadConfig() {
    rolesConfig = null;
    loadRolesConfig();
    logger.info('Roles configuration reloaded');
}

/**
 * Middleware function for Slack Bolt
 * Can be used with app.use() for global auth
 */
async function authMiddleware({ context, next, command }) {
    const config = loadRolesConfig();

    if (!config.requireAuthentication) {
        await next();
        return;
    }

    const userId = context.userId || command?.user_id;

    if (!userId) {
        logger.warn('No user ID found in request');
        return;
    }

    // Add user info to context
    context.userRole = getUserRole(userId);
    context.userPermissions = getRolePermissions(context.userRole);

    await next();
}

module.exports = {
    checkPermission,
    getUserRole,
    getRolePermissions,
    getUserInfo,
    reloadConfig,
    authMiddleware
};
