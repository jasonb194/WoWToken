const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

const NOTIFICATIONS_FILE = path.join(__dirname, '../data/guild-notifications.json');

// Ensure the data directory exists
async function ensureDataDirectory() {
    const dataDir = path.join(__dirname, '../data');
    try {
        await fs.access(dataDir);
    } catch {
        await fs.mkdir(dataDir, { recursive: true });
    }
}

// Load guild notifications
async function loadGuildNotifications() {
    try {
        const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

// Save guild notifications
async function saveGuildNotifications(notifications) {
    await ensureDataDirectory();
    await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('notify')
        .setDescription('Set up guild-wide token price notifications')
        .addIntegerOption(option =>
            option.setName('sell_threshold')
                .setDescription('Price threshold to notify when token price is high enough to sell')
                .setRequired(true)
                .setMinValue(1))
        .addIntegerOption(option =>
            option.setName('hold_threshold')
                .setDescription('Price threshold to notify when token price is low enough to buy')
                .setRequired(true)
                .setMinValue(1))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to send notifications to')
                .setRequired(true)),

    async execute(interaction) {
        // This function is not used in serverless deployment
        // The actual logic is handled in api/interactions.js
        return interaction.reply({
            content: 'This command is handled by the serverless function.',
            ephemeral: true
        });
    },
}; 