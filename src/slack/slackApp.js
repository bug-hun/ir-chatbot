/**
 * IR Playbook Bot - Slack Application
 * Professional Incident Response Chatbot with PowerShell Integration
 *
 * Features:
 * - Beautiful Block Kit UI design
 * - Real-time status updates
 * - Interactive confirmations
 * - Comprehensive audit logging
 */

const { App } = require('@slack/bolt');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { PowerShellService } = require('../services/powershellService');
const { AuditService } = require('../services/auditService');
const { checkPermission, getUserRole } = require('../middleware/authMiddleware');

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDING & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const BOT_NAME = 'IR Playbook Bot';
const BOT_VERSION = '1.0.0';

// Status indicators for visual feedback
const STATUS = {
    SUCCESS: ':white_check_mark:',
    ERROR: ':x:',
    WARNING: ':warning:',
    INFO: ':information_source:',
    LOADING: ':hourglass_flowing_sand:',
    SHIELD: ':shield:',
    LOCK: ':lock:',
    UNLOCK: ':unlock:',
    SEARCH: ':mag:',
    FOLDER: ':file_folder:',
    SKULL: ':skull:',
    BRAIN: ':brain:',
    COMPUTER: ':desktop_computer:',
    NETWORK: ':globe_with_meridians:',
    ALERT: ':rotating_light:',
    CLOCK: ':clock3:'
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a professional header block
 */
function createHeader(title, emoji = '') {
    return {
        type: 'header',
        text: { type: 'plain_text', text: `${emoji} ${title}`.trim(), emoji: true }
    };
}

/**
 * Create a divider block
 */
function createDivider() {
    return { type: 'divider' };
}

/**
 * Create a context block with timestamp
 */
function createContext(text, includeTimestamp = true) {
    const elements = [{ type: 'mrkdwn', text }];
    if (includeTimestamp) {
        elements.push({ type: 'mrkdwn', text: `  |  ${STATUS.CLOCK} ${new Date().toLocaleString()}` });
    }
    return { type: 'context', elements };
}

/**
 * Create a section with fields (two-column layout)
 */
function createFields(fieldsArray) {
    return {
        type: 'section',
        fields: fieldsArray.map(f => ({ type: 'mrkdwn', text: f }))
    };
}

/**
 * Create a formatted timestamp
 */
function formatTimestamp() {
    return new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';
}

/**
 * Generate incident ID
 */
function generateIncidentId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `IR-${date}-${rand}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

function createSlackApp() {
    const app = new App({
        token: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        socketMode: true,
        appToken: process.env.SLACK_APP_TOKEN,
        logLevel: 'error'
    });

    const psService = new PowerShellService();
    const auditService = new AuditService();

    // ═══════════════════════════════════════════════════════════════════════════
    // SLASH COMMAND HANDLER
    // ═══════════════════════════════════════════════════════════════════════════

    app.command('/ir', async ({ command, ack, respond, client }) => {
        await ack();

        const userId = command.user_id;
        const userName = command.user_name;
        const args = command.text.trim().split(/\s+/);
        const action = args[0]?.toLowerCase() || 'help';
        const target = args[1];

        logger.info('Command received', { userId, userName, action, target });

        try {
            switch (action) {
                case 'help':
                    await handleHelp(respond, userName);
                    break;
                case 'targets':
                case 'list':
                    await handleTargets(respond, userName);
                    break;
                case 'status':
                    await handleStatus(respond, userId, userName, target, psService, auditService, command.text);
                    break;
                case 'quarantine':
                    await handleQuarantine(respond, userId, userName, target, auditService, command.text);
                    break;
                case 'collect':
                    await handleCollect(respond, userId, userName, target, psService, auditService, command.text);
                    break;
                case 'kill':
                    await handleKill(respond, userId, userName, target, args[2], auditService);
                    break;
                case 'memdump':
                    await handleMemDump(respond, userId, userName, target, args[2], psService, auditService);
                    break;
                case 'release':
                    await handleRelease(respond, userId, userName, target, psService, auditService, command.text);
                    break;
                default:
                    await respond({
                        response_type: 'ephemeral',
                        blocks: [
                            createHeader('Unknown Command', STATUS.ERROR),
                            {
                                type: 'section',
                                text: { type: 'mrkdwn', text: `The command \`${action}\` is not recognized.\n\nUse \`/ir help\` to see available commands.` }
                            }
                        ]
                    });
            }
        } catch (error) {
            logger.error('Command error', { action, target, error: error.message });
            await respond({
                response_type: 'ephemeral',
                blocks: [
                    createHeader('Error', STATUS.ERROR),
                    { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`${error.message}\`\`\`` } },
                    createContext(`Command: /ir ${command.text}`)
                ]
            });
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTION HANDLERS
    // ═══════════════════════════════════════════════════════════════════════════

    // Confirm Quarantine
    app.action('confirm_quarantine', async ({ body, ack, respond }) => {
        await ack();
        const userId = body.user.id;
        const userName = body.user.username || body.user.name;
        const target = body.actions[0].value;
        const incidentId = generateIncidentId();
        const resolvedTarget = psService.resolveTarget(target);

        // Show loading state
        await respond({
            replace_original: true,
            blocks: [
                createHeader('Quarantine In Progress', STATUS.LOADING),
                createDivider(),
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: `${STATUS.LOCK} *Executing isolation procedures on* \`${target}\` (\`${resolvedTarget}\`)\n\n_Please wait while the host is being isolated..._` }
                },
                createFields([
                    `*Incident ID:*\n\`${incidentId}\``,
                    `*Initiated by:*\n@${userName}`
                ]),
                createContext('Isolation in progress...')
            ]
        });

        try {
            const result = await psService.executeRemoteScript(
                target,
                './src/scripts/Quarantine-Host.ps1',
                { Isolate: true, AllowedHosts: (process.env.ALLOWED_MANAGEMENT_IPS || '192.168.100.1').split(',') }
            );

            await auditService.log({
                action: 'QUARANTINE',
                userId, userName, target,
                status: 'SUCCESS',
                incidentId,
                details: result
            });

            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Host Successfully Quarantined', STATUS.SHIELD),
                    createDivider(),
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `${STATUS.ALERT} *The host has been ISOLATED from the network.*\n\nAll outbound traffic is blocked except for management access.` }
                    },
                    createDivider(),
                    createFields([
                        `*${STATUS.COMPUTER} Target:*\n\`${target}\``,
                        `*${STATUS.NETWORK} IP Address:*\n\`${resolvedTarget}\``
                    ]),
                    createFields([
                        `*${STATUS.SHIELD} Status:*\n\`ISOLATED\``,
                        `*${STATUS.COMPUTER} Hostname:*\n\`${result.Hostname || 'N/A'}\``
                    ]),
                    createFields([
                        `*Incident ID:*\n\`${incidentId}\``,
                        `*Executed by:*\n@${userName}`
                    ]),
                    createDivider(),
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: '*Actions Performed:*\n• Firewall enabled on all profiles\n• Outbound traffic BLOCKED\n• DNS cache cleared\n• DNS redirected to localhost\n• SMB services stopped\n• Management IPs whitelisted' }
                    },
                    createDivider(),
                    {
                        type: 'section',
                        text: { type: 'mrkdwn', text: `*${STATUS.INFO} Quick Actions:*` }
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                text: { type: 'plain_text', text: '🔓 Release Quarantine', emoji: true },
                                style: 'primary',
                                action_id: 'release_quarantine',
                                value: `${target}|${incidentId}`
                            },
                            {
                                type: 'button',
                                text: { type: 'plain_text', text: '📁 Collect Logs', emoji: true },
                                action_id: 'quick_collect',
                                value: target
                            },
                            {
                                type: 'button',
                                text: { type: 'plain_text', text: '📊 View Status', emoji: true },
                                action_id: 'quick_status',
                                value: target
                            }
                        ]
                    },
                    createDivider(),
                    createContext(`Quarantine completed at ${new Date().toLocaleString()}`)
                ]
            });

        } catch (error) {
            await auditService.log({
                action: 'QUARANTINE',
                userId, userName, target,
                status: 'FAILED',
                error: error.message
            });

            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Quarantine Failed', STATUS.ERROR),
                    createDivider(),
                    { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.ERROR} *Failed to quarantine host*\n\n\`\`\`${error.message}\`\`\`` } },
                    createFields([`*Target:*\n\`${target}\``, `*Attempted by:*\n@${userName}`]),
                    createContext('Operation failed')
                ]
            });
        }
    });

    // Cancel Quarantine
    app.action('cancel_quarantine', async ({ ack, respond }) => {
        await ack();
        await respond({
            replace_original: true,
            blocks: [
                createHeader('Quarantine Cancelled', STATUS.INFO),
                { type: 'section', text: { type: 'mrkdwn', text: 'The quarantine operation has been cancelled. No changes were made.' } },
                createContext('Operation cancelled by user')
            ]
        });
    });

    // Release Quarantine
    app.action('release_quarantine', async ({ body, ack, respond }) => {
        await ack();
        const userId = body.user.id;
        const userName = body.user.username || body.user.name;
        const [target, incidentId] = body.actions[0].value.split('|');

        await respond({
            replace_original: true,
            blocks: [
                createHeader('Releasing Quarantine', STATUS.LOADING),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.UNLOCK} *Restoring network connectivity on* \`${target}\`...` } },
                createContext('Release in progress...')
            ]
        });

        try {
            await psService.executeRemoteScript(target, './src/scripts/Quarantine-Host.ps1', { Isolate: false });

            await auditService.log({
                action: 'RELEASE_QUARANTINE',
                userId, userName, target,
                status: 'SUCCESS',
                incidentId
            });

            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Quarantine Released', STATUS.UNLOCK),
                    createDivider(),
                    { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.SUCCESS} *Network connectivity has been restored.*` } },
                    createFields([
                        `*${STATUS.COMPUTER} Target:*\n\`${target}\``,
                        `*Status:*\n\`ONLINE\``,
                        `*Incident ID:*\n\`${incidentId || 'N/A'}\``,
                        `*Released by:*\n@${userName}`
                    ]),
                    createContext('Host is back online')
                ]
            });

        } catch (error) {
            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Release Failed', STATUS.ERROR),
                    { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`${error.message}\`\`\`` } },
                    createContext('Operation failed')
                ]
            });
        }
    });

    // Quick Collect
    app.action('quick_collect', async ({ body, ack, respond }) => {
        await ack();
        const userName = body.user.username || body.user.name;
        const target = body.actions[0].value;

        await respond({
            replace_original: true,
            blocks: [
                createHeader('Collecting Forensic Logs', STATUS.LOADING),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.FOLDER} *Gathering forensic artifacts from* \`${target}\`\n\n_This may take several minutes..._` } },
                createContext('Collection in progress...')
            ]
        });

        try {
            const result = await psService.executeRemoteScript(target, './src/scripts/Collect-Logs.ps1', { DaysBack: 7 });

            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Log Collection Complete', STATUS.FOLDER),
                    createDivider(),
                    { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.SUCCESS} *Forensic artifacts have been collected and archived.*` } },
                    createFields([
                        `*Target:*\n\`${target}\``,
                        `*Events:*\n\`${result.EventCount || 'N/A'}\``,
                        `*Days:*\n\`${result.DaysCollected || 7}\``,
                        `*Archive:*\n\`${result.Size || 'N/A'}\``
                    ]),
                    { type: 'section', text: { type: 'mrkdwn', text: `*Archive Location:*\n\`\`\`${result.Path || 'See target machine'}\`\`\`` } },
                    createContext(`Collected by @${userName}`)
                ]
            });
        } catch (error) {
            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Collection Failed', STATUS.ERROR),
                    { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`${error.message}\`\`\`` } },
                    createContext('Operation failed')
                ]
            });
        }
    });

    // Quick Status
    app.action('quick_status', async ({ body, ack, respond }) => {
        await ack();
        const target = body.actions[0].value;
        const resolvedTarget = psService.resolveTarget(target);

        await respond({
            replace_original: true,
            blocks: [
                createHeader('Gathering System Status', STATUS.LOADING),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.SEARCH} *Querying* \`${target}\` (\`${resolvedTarget}\`)...` } },
                createContext('Please wait...')
            ]
        });

        try {
            const result = await psService.executeRemoteScript(target, './src/scripts/Get-SystemInfo.ps1', {});
            const formatted = formatStatusResult(result, target, resolvedTarget);

            await respond({ replace_original: true, blocks: formatted });
        } catch (error) {
            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Status Check Failed', STATUS.ERROR),
                    { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`${error.message}\`\`\`` } }
                ]
            });
        }
    });

    // Confirm Kill
    app.action('confirm_kill', async ({ body, ack, respond }) => {
        await ack();
        const userName = body.user.username || body.user.name;
        const [target, processId] = body.actions[0].value.split('|');

        await respond({
            replace_original: true,
            blocks: [
                createHeader('Terminating Process', STATUS.LOADING),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.SKULL} *Killing process* \`${processId}\` *on* \`${target}\`...` } }
            ]
        });

        try {
            const result = await psService.executeRemoteScript(target, './src/scripts/Kill-Process.ps1', { ProcessIdentifier: processId });

            await auditService.log({
                action: 'KILL_PROCESS',
                userId: body.user.id,
                userName, target, processId,
                status: 'SUCCESS',
                details: result
            });

            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Process Terminated', STATUS.SKULL),
                    createDivider(),
                    { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.SUCCESS} *The process has been forcefully terminated.*` } },
                    createFields([
                        `*Target:*\n\`${target}\``,
                        `*Process:*\n\`${processId}\``,
                        `*Terminated by:*\n@${userName}`,
                        `*Status:*\n\`KILLED\``
                    ]),
                    createContext('Process terminated successfully')
                ]
            });
        } catch (error) {
            await respond({
                replace_original: true,
                blocks: [
                    createHeader('Termination Failed', STATUS.ERROR),
                    { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`${error.message}\`\`\`` } }
                ]
            });
        }
    });

    // Cancel Kill
    app.action('cancel_kill', async ({ ack, respond }) => {
        await ack();
        await respond({
            replace_original: true,
            blocks: [
                createHeader('Operation Cancelled', STATUS.INFO),
                { type: 'section', text: { type: 'mrkdwn', text: 'Process termination has been cancelled.' } }
            ]
        });
    });

    return app;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

async function handleHelp(respond, userName) {
    await respond({
        response_type: 'ephemeral',
        blocks: [
            createHeader(`${BOT_NAME}`, STATUS.SHIELD),
            createDivider(),
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `Welcome to the *Incident Response Playbook Bot*!\n\nThis bot allows you to execute incident response actions on remote Windows systems via PowerShell Remoting.`
                }
            },
            createDivider(),
            createHeader('Core Commands', STATUS.COMPUTER),
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text:
                        `*\`/ir help\`*\n_Display this help message_\n\n` +
                        `*\`/ir targets\`*\n_List all configured target systems_\n\n` +
                        `*\`/ir status <target>\`*\n_Get system information including processes, connections, and persistence_\n\n` +
                        `*\`/ir quarantine <target>\`*\n_Isolate a host from the network (blocks all traffic except management)_\n\n` +
                        `*\`/ir release <target>\`*\n_Release a quarantined host and restore connectivity_\n\n` +
                        `*\`/ir collect <target>\`*\n_Collect forensic logs and artifacts from the target system_`
                }
            },
            createDivider(),
            createHeader('Advanced Commands', STATUS.ALERT),
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text:
                        `*\`/ir kill <target> <pid|name>\`*\n_Forcefully terminate a process by PID or name_\n\n` +
                        `*\`/ir memdump <target> <pid>\`*\n_Capture memory dump of a process for analysis_`
                }
            },
            createDivider(),
            createHeader('Examples', STATUS.INFO),
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text:
                        '```' +
                        '/ir targets\n' +
                        '/ir status 192.168.1.33\n' +
                        '/ir quarantine IR-Target-01\n' +
                        '/ir collect 192.168.1.33\n' +
                        '/ir kill 192.168.1.33 notepad\n' +
                        '/ir memdump 192.168.1.33 4532' +
                        '```'
                }
            },
            createDivider(),
            createContext(`${BOT_NAME} v${BOT_VERSION} | Hello, @${userName}!`)
        ]
    });
}

/**
 * Handle /ir targets - List all configured target systems
 */
async function handleTargets(respond, userName) {
    const fs = require('fs');
    const path = require('path');

    try {
        const targetsPath = path.join(__dirname, '../config/targets.json');
        const targetsData = JSON.parse(fs.readFileSync(targetsPath, 'utf8'));

        // Build target list
        let targetList = '';
        for (const [name, info] of Object.entries(targetsData.targets)) {
            targetList += `*${name}*\n` +
                `    IP: \`${info.ip}\`\n` +
                `    OS: ${info.os || 'Windows'}\n` +
                `    ${info.description || ''}\n\n`;
        }

        // Build aliases list
        let aliasList = '';
        for (const [alias, target] of Object.entries(targetsData.aliases || {})) {
            aliasList += `\`${alias}\` → ${target}\n`;
        }

        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Configured Targets', STATUS.NETWORK),
                createDivider(),
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: targetList || '_No targets configured_'
                    }
                },
                createDivider(),
                createHeader('Aliases', STATUS.INFO),
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: aliasList || '_No aliases configured_'
                    }
                },
                createDivider(),
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `${STATUS.INFO} *Tip:* You can use either the target name, alias, or IP address in commands.\n\nExample: \`/ir status vm1\` or \`/ir status 192.168.1.33\``
                    }
                },
                createContext(`Requested by @${userName}`)
            ]
        });
    } catch (error) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Error Loading Targets', STATUS.ERROR),
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: `\`\`\`${error.message}\`\`\`` }
                }
            ]
        });
    }
}

async function handleStatus(respond, userId, userName, target, psService, auditService, commandText = '') {
    if (!target) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Missing Target', STATUS.WARNING),
                createContext(`Command: \`/ir ${commandText || 'status'}\``, false),
                createDivider(),
                { type: 'section', text: { type: 'mrkdwn', text: '*Usage:* `/ir status <target>`\n*Example:* `/ir status vm1` or `/ir status 192.168.1.33`' } }
            ]
        });
        return;
    }

    if (!(await checkPermission(userId, 'status'))) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Access Denied', STATUS.LOCK),
                { type: 'section', text: { type: 'mrkdwn', text: 'You do not have permission to execute this command.' } }
            ]
        });
        return;
    }

    const resolvedTarget = psService.resolveTarget(target);

    // Show loading
    await respond({
        response_type: 'ephemeral',
        blocks: [
            createHeader('Gathering System Information', STATUS.LOADING),
            createContext(`Command: \`/ir ${commandText}\``, false),
            createDivider(),
            { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.SEARCH} *Querying target:* \`${target}\` (\`${resolvedTarget}\`)\n\n_Collecting processes, connections, persistence, and more..._` } },
            createContext('Please wait...')
        ]
    });

    try {
        const result = await psService.executeRemoteScript(target, './src/scripts/Get-SystemInfo.ps1', {});

        await auditService.log({ action: 'STATUS', userId, userName, target, status: 'SUCCESS' });

        const blocks = formatStatusResult(result, target, resolvedTarget);
        blocks.unshift(createContext(`Command: \`/ir ${commandText}\``, false));
        blocks.push(createContext(`Retrieved by @${userName}`));

        await respond({ response_type: 'ephemeral', blocks });

    } catch (error) {
        await auditService.log({ action: 'STATUS', userId, userName, target, status: 'FAILED', error: error.message });

        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Status Check Failed', STATUS.ERROR),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.ERROR} *Could not connect to* \`${target}\`\n\n\`\`\`${error.message}\`\`\`` } },
                createContext('Ensure WinRM is configured and the target is reachable')
            ]
        });
    }
}

async function handleQuarantine(respond, userId, userName, target, auditService, commandText = '') {
    if (!target) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Missing Target', STATUS.WARNING),
                createContext(`Command: \`/ir ${commandText || 'quarantine'}\``, false),
                createDivider(),
                { type: 'section', text: { type: 'mrkdwn', text: '*Usage:* `/ir quarantine <target>`\n*Example:* `/ir quarantine vm1` or `/ir quarantine 192.168.1.33`' } }
            ]
        });
        return;
    }

    if (!(await checkPermission(userId, 'quarantine'))) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Access Denied', STATUS.LOCK),
                { type: 'section', text: { type: 'mrkdwn', text: 'You do not have permission to execute quarantine operations.\n\n*Required role:* `IR_ANALYST` or higher' } }
            ]
        });
        return;
    }

    await respond({
        response_type: 'ephemeral',
        blocks: [
            createHeader('Quarantine Confirmation Required', STATUS.ALERT),
            createContext(`Command: \`/ir ${commandText}\``, false),
            createDivider(),
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${STATUS.WARNING} *You are about to isolate* \`${target}\` *from the network.*\n\nThis is a *critical action* that will affect the target system's connectivity.`
                }
            },
            createDivider(),
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*This operation will:*\n' +
                        `• ${STATUS.LOCK} Block all outbound network traffic\n` +
                        `• ${STATUS.NETWORK} Clear DNS cache and redirect DNS\n` +
                        '• Stop SMB/file sharing services\n' +
                        '• Only allow management IP connections'
                }
            },
            createDivider(),
            createFields([`*Target System:*\n\`${target}\``, `*Requested by:*\n@${userName}`]),
            createDivider(),
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Confirm Quarantine', emoji: true },
                        style: 'danger',
                        action_id: 'confirm_quarantine',
                        value: target,
                        confirm: {
                            title: { type: 'plain_text', text: 'Final Confirmation' },
                            text: { type: 'mrkdwn', text: `Are you absolutely sure you want to quarantine \`${target}\`?\n\nThis action can be reversed using the Release button.` },
                            confirm: { type: 'plain_text', text: 'Yes, Quarantine Now' },
                            deny: { type: 'plain_text', text: 'Cancel' },
                            style: 'danger'
                        }
                    },
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Cancel', emoji: true },
                        action_id: 'cancel_quarantine',
                        value: target
                    }
                ]
            },
            createContext('Review carefully before confirming')
        ]
    });
}

/**
 * Handle /ir release - Release a quarantined host
 */
async function handleRelease(respond, userId, userName, target, psService, auditService, commandText = '') {
    const incidentId = generateIncidentId();

    if (!target) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Missing Target', STATUS.WARNING),
                createContext(`Command: \`/ir ${commandText || 'release'}\``, false),
                createDivider(),
                { type: 'section', text: { type: 'mrkdwn', text: '*Usage:* `/ir release <target>`\n*Example:* `/ir release vm1` or `/ir release 192.168.1.33`' } }
            ]
        });
        return;
    }

    if (!(await checkPermission(userId, 'quarantine'))) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Access Denied', STATUS.LOCK),
                { type: 'section', text: { type: 'mrkdwn', text: 'You do not have permission to release quarantine.\n\n*Required role:* `IR_ANALYST` or higher' } }
            ]
        });
        return;
    }

    // Show loading state
    await respond({
        response_type: 'ephemeral',
        blocks: [
            createHeader('Releasing Quarantine', STATUS.LOADING),
            createContext(`Command: \`/ir ${commandText}\`  |  Incident: \`${incidentId}\``, false),
            createDivider(),
            { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.UNLOCK} *Restoring network connectivity on* \`${target}\`\n\n_Please wait..._` } },
            createContext('Release in progress...')
        ]
    });

    try {
        const resolvedTarget = psService.resolveTarget(target);
        const result = await psService.executeRemoteScript(target, './src/scripts/Quarantine-Host.ps1', { Isolate: false });

        await auditService.log({
            action: 'RELEASE_QUARANTINE',
            userId, userName, target,
            status: 'SUCCESS',
            incidentId
        });

        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Quarantine Released', STATUS.SUCCESS),
                createContext(`Command: \`/ir ${commandText}\`  |  Incident: \`${incidentId}\``, false),
                createDivider(),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.SUCCESS} *Network connectivity has been restored!*` } },
                createDivider(),
                createFields([
                    `*${STATUS.COMPUTER} Target:*\n\`${target}\``,
                    `*${STATUS.NETWORK} Resolved IP:*\n\`${resolvedTarget}\``
                ]),
                createFields([
                    `*${STATUS.UNLOCK} Status:*\n\`ONLINE\``,
                    `*${STATUS.CLOCK} Released:*\n\`${new Date().toLocaleString()}\``
                ]),
                createDivider(),
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: '*Actions Performed:*\n' +
                            '• Default outbound action set to Allow\n' +
                            '• Isolation firewall rules removed\n' +
                            '• DNS configuration reset\n' +
                            '• SMB services restarted'
                    }
                },
                createDivider(),
                createContext(`Released by @${userName}`)
            ]
        });

    } catch (error) {
        await auditService.log({
            action: 'RELEASE_QUARANTINE',
            userId, userName, target,
            status: 'FAILED',
            incidentId,
            error: error.message
        });

        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Release Failed', STATUS.ERROR),
                createContext(`Command: \`/ir ${commandText}\`  |  Incident: \`${incidentId}\``, false),
                createDivider(),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.ERROR} *Failed to release quarantine on* \`${target}\`` } },
                { type: 'section', text: { type: 'mrkdwn', text: `*Error:*\n\`\`\`${error.message}\`\`\`` } },
                createDivider(),
                createContext(`Requested by @${userName}`)
            ]
        });
    }
}

async function handleCollect(respond, userId, userName, target, psService, auditService, commandText = '') {
    const incidentId = generateIncidentId();

    if (!target) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Missing Target', STATUS.WARNING),
                createContext(`Command: \`/ir ${commandText || 'collect'}\``, false),
                createDivider(),
                { type: 'section', text: { type: 'mrkdwn', text: '*Usage:* `/ir collect <target>`\n*Example:* `/ir collect vm1` or `/ir collect 192.168.1.33`' } }
            ]
        });
        return;
    }

    if (!(await checkPermission(userId, 'collect'))) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Access Denied', STATUS.LOCK),
                { type: 'section', text: { type: 'mrkdwn', text: 'You do not have permission to collect logs.' } }
            ]
        });
        return;
    }

    // Show command entered and loading state
    await respond({
        response_type: 'ephemeral',
        blocks: [
            createHeader('Collecting Forensic Logs', STATUS.LOADING),
            createContext(`Command: \`/ir ${commandText}\`  |  Incident: \`${incidentId}\``, false),
            createDivider(),
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${STATUS.FOLDER} *Gathering forensic artifacts from* \`${target}\`\n\n` +
                        '*Collecting:*\n' +
                        '• Security Event Logs (logons, process creation, etc.)\n' +
                        '• System and Application Logs\n' +
                        '• PowerShell Command History\n' +
                        '• Prefetch Files\n' +
                        '• Network Configuration\n\n' +
                        '_This may take several minutes..._'
                }
            },
            createContext('Collection in progress...')
        ]
    });

    try {
        const result = await psService.executeRemoteScript(target, './src/scripts/Collect-Logs.ps1', { DaysBack: 7 });
        const resolvedTarget = psService.resolveTarget(target);

        await auditService.log({ action: 'COLLECT_LOGS', userId, userName, target, incidentId, status: 'SUCCESS', details: result });

        // Download to local collected-logs folder
        let localPath = '';
        let downloadStatus = '';

        if (result.Path) {
            try {
                const logsFolder = path.join(__dirname, '../../collected-logs');
                if (!fs.existsSync(logsFolder)) {
                    fs.mkdirSync(logsFolder, { recursive: true });
                }
                localPath = path.join(logsFolder, `${incidentId}_${path.basename(result.Path)}`);

                const escapedPassword = process.env.IR_PASSWORD.replace(/'/g, "''");
                await psService.execute(`
                    $pw = ConvertTo-SecureString '${escapedPassword}' -AsPlainText -Force
                    $cred = New-Object PSCredential('${process.env.IR_USERNAME}', $pw)
                    $session = New-PSSession -ComputerName '${resolvedTarget}' -Credential $cred
                    Copy-Item -Path '${result.Path}' -Destination '${localPath.replace(/\\/g, '\\\\')}' -FromSession $session
                    Remove-PSSession $session
                `);

                if (fs.existsSync(localPath)) {
                    downloadStatus = `${STATUS.SUCCESS} *Downloaded to local machine*`;
                    logger.info('Logs downloaded successfully', { localPath });
                } else {
                    downloadStatus = `${STATUS.WARNING} *Download may have failed - check local folder*`;
                }
            } catch (downloadError) {
                logger.warn('Failed to download logs', { error: downloadError.message });
                downloadStatus = `${STATUS.INFO} *Logs available on target machine only*`;
            }
        }

        // Build artifacts list
        const artifactsList = (result.Items || []).map(i => `• ${i}`).join('\n') || '• No items listed';

        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Log Collection Complete', STATUS.SUCCESS),
                createContext(`Command: \`/ir ${commandText}\`  |  Incident: \`${incidentId}\``, false),
                createDivider(),
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `${STATUS.SUCCESS} *Forensic artifacts collected and archived!*\n${downloadStatus}`
                    }
                },
                createDivider(),
                createFields([
                    `*${STATUS.COMPUTER} Target:*\n\`${target}\``,
                    `*${STATUS.NETWORK} Resolved IP:*\n\`${resolvedTarget}\``
                ]),
                createFields([
                    `*${STATUS.SEARCH} Events Collected:*\n\`${result.EventCount || 0}\``,
                    `*${STATUS.FOLDER} Archive Size:*\n\`${result.Size || 'Unknown'}\``
                ]),
                createFields([
                    `*${STATUS.CLOCK} Time Range:*\n\`Last ${result.DaysCollected || 7} days\``,
                    `*${STATUS.COMPUTER} Hostname:*\n\`${result.Hostname || 'Unknown'}\``
                ]),
                createDivider(),
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: localPath
                            ? `*${STATUS.FOLDER} Local Path:*\n\`\`\`${localPath}\`\`\`\n*Remote Path:*\n\`\`\`${result.Path}\`\`\``
                            : `*${STATUS.FOLDER} Remote Path:*\n\`\`\`${result.Path || 'See target machine'}\`\`\``
                    }
                },
                {
                    type: 'section',
                    text: { type: 'mrkdwn', text: `*Artifacts Collected:*\n${artifactsList}` }
                },
                createDivider(),
                createContext(`Collected by @${userName}`)
            ]
        });

    } catch (error) {
        await auditService.log({ action: 'COLLECT_LOGS', userId, userName, target, incidentId, status: 'FAILED', error: error.message });

        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Collection Failed', STATUS.ERROR),
                createContext(`Command: \`/ir ${commandText}\`  |  Incident: \`${incidentId}\``, false),
                createDivider(),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.ERROR} *Failed to collect logs from* \`${target}\`` } },
                { type: 'section', text: { type: 'mrkdwn', text: `*Error:*\n\`\`\`${error.message}\`\`\`` } },
                createDivider(),
                createContext(`Requested by @${userName}`)
            ]
        });
    }
}

async function handleKill(respond, userId, userName, target, processId, auditService) {
    if (!target || !processId) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Missing Parameters', STATUS.WARNING),
                { type: 'section', text: { type: 'mrkdwn', text: '*Usage:* `/ir kill <target> <pid|name>`\n*Examples:*\n• `/ir kill 192.168.100.10 notepad`\n• `/ir kill 192.168.100.10 4532`' } }
            ]
        });
        return;
    }

    if (!(await checkPermission(userId, 'kill'))) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Access Denied', STATUS.LOCK),
                { type: 'section', text: { type: 'mrkdwn', text: 'You do not have permission to terminate processes.\n\n*Required role:* `IR_ANALYST` or higher' } }
            ]
        });
        return;
    }

    await respond({
        response_type: 'ephemeral',
        blocks: [
            createHeader('Process Termination Request', STATUS.SKULL),
            createDivider(),
            { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.WARNING} *You are about to forcefully terminate a process.*\n\nThis action cannot be undone.` } },
            createFields([`*Target System:*\n\`${target}\``, `*Process:*\n\`${processId}\``]),
            createDivider(),
            {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Terminate Process', emoji: true },
                        style: 'danger',
                        action_id: 'confirm_kill',
                        value: `${target}|${processId}`
                    },
                    {
                        type: 'button',
                        text: { type: 'plain_text', text: 'Cancel', emoji: true },
                        action_id: 'cancel_kill',
                        value: target
                    }
                ]
            },
            createContext(`Requested by @${userName}`)
        ]
    });
}

async function handleMemDump(respond, userId, userName, target, pid, psService, auditService) {
    if (!target || !pid) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Missing Parameters', STATUS.WARNING),
                { type: 'section', text: { type: 'mrkdwn', text: '*Usage:* `/ir memdump <target> <pid>`\n*Example:* `/ir memdump 192.168.100.10 1234`' } }
            ]
        });
        return;
    }

    if (!(await checkPermission(userId, 'memdump'))) {
        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Access Denied', STATUS.LOCK),
                { type: 'section', text: { type: 'mrkdwn', text: 'You do not have permission to capture memory dumps.\n\n*Required role:* `IR_ANALYST` or higher' } }
            ]
        });
        return;
    }

    await respond({
        response_type: 'ephemeral',
        blocks: [
            createHeader('Capturing Memory Dump', STATUS.LOADING),
            createDivider(),
            { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.BRAIN} *Dumping process memory from* \`${target}\`\n\n*Process ID:* \`${pid}\`\n\n_This may take several minutes depending on process size..._` } },
            createContext('Memory capture in progress...')
        ]
    });

    try {
        const result = await psService.executeRemoteScript(target, './src/scripts/Get-MemoryDump.ps1', { ProcessId: pid });

        await auditService.log({ action: 'MEMORY_DUMP', userId, userName, target, processId: pid, status: 'SUCCESS', details: result });

        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Memory Dump Complete', STATUS.BRAIN),
                createDivider(),
                { type: 'section', text: { type: 'mrkdwn', text: `${STATUS.SUCCESS} *Process memory has been captured successfully.*` } },
                createFields([
                    `*Target:*\n\`${target}\``,
                    `*Process ID:*\n\`${pid}\``,
                    `*Process:*\n\`${result.ProcessName || 'N/A'}\``,
                    `*Dump Size:*\n\`${result.Size || 'N/A'}\``
                ]),
                { type: 'section', text: { type: 'mrkdwn', text: `*Dump Location:*\n\`\`\`${result.Path || 'See target machine'}\`\`\`` } },
                createContext(`Captured by @${userName}`)
            ]
        });

    } catch (error) {
        await auditService.log({ action: 'MEMORY_DUMP', userId, userName, target, processId: pid, status: 'FAILED', error: error.message });

        await respond({
            response_type: 'ephemeral',
            blocks: [
                createHeader('Memory Dump Failed', STATUS.ERROR),
                { type: 'section', text: { type: 'mrkdwn', text: `\`\`\`${error.message}\`\`\`` } },
                createContext('Consider using procdump.exe for more reliable dumps')
            ]
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function formatStatusResult(result, target, resolvedTarget = '') {
    if (!result) {
        return [
            createHeader('No Data Retrieved', STATUS.WARNING),
            { type: 'section', text: { type: 'mrkdwn', text: 'The system did not return any data.' } }
        ];
    }

    const blocks = [
        createHeader(`System Status: ${target}`, STATUS.COMPUTER),
        createDivider(),
        createFields([
            `*${STATUS.COMPUTER} Target:*\n\`${target}\``,
            `*${STATUS.NETWORK} Resolved IP:*\n\`${resolvedTarget || target}\``
        ]),
        createDivider()
    ];

    // QUARANTINE STATUS (show first, prominently)
    if (result.QuarantineStatus) {
        const qs = result.QuarantineStatus;
        const isQuarantined = qs.IsQuarantined;

        if (isQuarantined) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${STATUS.ALERT} *QUARANTINE STATUS: ISOLATED*\n\n_This host is currently quarantined and isolated from the network._`
                }
            });
            // Show evidence
            if (qs.Evidence && qs.Evidence.length > 0) {
                let evidenceText = '*Evidence:*\n';
                qs.Evidence.forEach(e => { evidenceText += `• ${e}\n`; });
                blocks.push({ type: 'section', text: { type: 'mrkdwn', text: evidenceText } });
            }
        } else {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `${STATUS.SUCCESS} *QUARANTINE STATUS: NOT ISOLATED*\n\n_This host has normal network connectivity._`
                }
            });
        }
        blocks.push(createDivider());
    }

    // System Info
    if (result.SystemInfo) {
        const si = result.SystemInfo;
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*${STATUS.INFO} System Information*` }
        });
        blocks.push(createFields([
            `*Hostname:*\n\`${si.Hostname || 'N/A'}\``,
            `*OS:*\n\`${si.OS || 'N/A'}\``,
            `*User:*\n\`${si.CurrentUser || 'N/A'}\``,
            `*Architecture:*\n\`${si.Architecture || 'N/A'}\``
        ]));
        blocks.push(createDivider());
    }

    // Processes
    if (result.Processes) {
        const count = Array.isArray(result.Processes) ? result.Processes.length : 0;
        const suspicious = (result.Processes || [])
            .filter(p => p.Path && !p.Path.toLowerCase().includes('windows') && !p.Path.toLowerCase().includes('program files'))
            .slice(0, 5);

        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*${STATUS.SEARCH} Running Processes:* \`${count}\`` }
        });

        if (suspicious.length > 0) {
            let procText = '*Notable (non-system) processes:*\n';
            suspicious.forEach(p => {
                procText += `• \`${p.Name}\` (PID: ${p.ProcessId}) - ${p.Owner || 'Unknown'}\n`;
            });
            blocks.push({ type: 'section', text: { type: 'mrkdwn', text: procText } });
        }
        blocks.push(createDivider());
    }

    // Connections
    if (result.Connections) {
        const count = Array.isArray(result.Connections) ? result.Connections.length : 0;
        const external = (result.Connections || [])
            .filter(c => c.RemoteAddress && !c.RemoteAddress.startsWith('192.168.') && !c.RemoteAddress.startsWith('127.') && !c.RemoteAddress.startsWith('10.'))
            .slice(0, 5);

        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*${STATUS.NETWORK} Network Connections:* \`${count} established\`` }
        });

        if (external.length > 0) {
            let connText = '*External connections:*\n';
            external.forEach(c => {
                connText += `• \`${c.Process || 'Unknown'}\` → ${c.RemoteAddress}:${c.RemotePort}\n`;
            });
            blocks.push({ type: 'section', text: { type: 'mrkdwn', text: connText } });
        }
        blocks.push(createDivider());
    }

    // Persistence
    if (result.Autoruns) {
        const count = Array.isArray(result.Autoruns) ? result.Autoruns.length : 0;
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*${STATUS.WARNING} Persistence Entries:* \`${count} found\`` }
        });
    }

    // Admins
    if (result.Admins) {
        const count = Array.isArray(result.Admins) ? result.Admins.length : 0;
        const adminList = (result.Admins || []).map(a => a.Name).slice(0, 5).join(', ');
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*${STATUS.LOCK} Local Administrators:* \`${count}\`\n${adminList ? `_${adminList}_` : ''}` }
        });
    }

    return blocks;
}

module.exports = { createSlackApp };
