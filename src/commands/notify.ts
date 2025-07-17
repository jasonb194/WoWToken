import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType } from 'discord.js';
import { promises as fs } from 'fs';
import path from 'path';

const NOTIFICATIONS_FILE = path.join(__dirname, '../data/guild-notifications.json');

interface GuildNotifications {
    [guildId: string]: {
        sellThreshold: number;
        holdThreshold: number;
        channelId: string;
    };
}

// Ensure the data directory exists
async function ensureDataDirectory(): Promise<void> {
    const dataDir = path.join(__dirname, '../data');
    try {
        await fs.access(dataDir);
    } catch {
        await fs.mkdir(dataDir, { recursive: true });
    }
}

// Load guild notifications
async function loadGuildNotifications(): Promise<GuildNotifications> {
    try {
        const data = await fs.readFile(NOTIFICATIONS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

// Save guild notifications
async function saveGuildNotifications(notifications: GuildNotifications): Promise<void> {
    await ensureDataDirectory();
    await fs.writeFile(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2));
}

export const data = new SlashCommandBuilder()
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
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // This function is not used in serverless deployment
    // The actual logic is handled in api/interactions.js
    await interaction.reply({
        content: 'This command is handled by the serverless function.',
        ephemeral: true
    });
} 