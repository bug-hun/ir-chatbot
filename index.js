/**
 * Incident Response Playbook Bot
 * Main entry point
 *
 * A Slack chatbot that executes IR commands via PowerShell Remoting
 */

require('dotenv').config();
const logger = require('./src/utils/logger');
const { createSlackApp } = require('./src/slack/slackApp');

// Validate required environment variables
const requiredEnvVars = [
    'SLACK_BOT_TOKEN',
    'SLACK_SIGNING_SECRET',
    'SLACK_APP_TOKEN',
    'IR_USERNAME',
    'IR_PASSWORD'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    logger.error('Missing required environment variables:', { missing: missingVars });
    logger.error('Please copy .env.example to .env and fill in the values');
    process.exit(1);
}

// Start the bot
async function main() {
    try {
        logger.info('Starting IR Playbook Bot...');

        const app = createSlackApp();

        await app.start();

        logger.info('IR Playbook Bot is running!');
        logger.info('Commands available: /ir help, /ir status, /ir quarantine, /ir collect, /ir kill, /ir memdump');

    } catch (error) {
        logger.error('Failed to start bot:', { error: error.message, stack: error.stack });
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    logger.info('Received SIGINT. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Shutting down gracefully...');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', { error: error.message, stack: error.stack });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection:', { reason, promise });
});

main();
