const { Client, GatewayIntentBits, TextChannel } = require('discord.js');
const axios = require('axios');
const supabase = require('../lib/supabase');
const Logger = require('../lib/logger');

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds
const NOTIFICATION_COOLDOWN = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

// Blizzard API endpoints
const API_ENDPOINTS = {
    US: 'https://us.api.blizzard.com/data/wow/token/index',
    EU: 'https://eu.api.blizzard.com/data/wow/token/index',
    KR: 'https://kr.api.blizzard.com/data/wow/token/index',
    TW: 'https://tw.api.blizzard.com/data/wow/token/index'
};

// Get access token from Blizzard API
async function getAccessToken(logger) {
    try {
        logger.info('Getting access token...');
        const response = await axios.post('https://oauth.battle.net/token', null, {
            params: {
                grant_type: 'client_credentials'
            },
            auth: {
                username: process.env.BLIZZARD_CLIENT_ID,
                password: process.env.BLIZZARD_CLIENT_SECRET
            }
        });
        logger.info('Access token received successfully');
        return response.data.access_token;
    } catch (error) {
        logger.error('Error getting access token', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });
        throw new Error('Failed to get access token');
    }
}

// Get token price for a region
async function getTokenPrice(region, accessToken, logger) {
    try {
        logger.info(`Getting token price for ${region}...`);
        const url = API_ENDPOINTS[region];
        if (!url) {
            throw new Error(`Invalid region: ${region}`);
        }

        const params = {
            namespace: `dynamic-${region.toLowerCase()}`,
            locale: 'en_US',
            access_token: accessToken
        };
        
        logger.info(`Fetching token price from ${url}`, { params });
        
        const response = await axios.get(url, { 
            params,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        logger.info('API response received', {
            status: response.status,
            data: response.data
        });

        if (!response.data || !response.data.price) {
            throw new Error(`Invalid response format: ${JSON.stringify(response.data)}`);
        }
        
        // Convert from copper to gold (1 gold = 10000 copper)
        return response.data.price / 10000;
    } catch (error) {
        logger.error(`Error getting token price for ${region}`, {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });
        throw new Error(`Failed to get token price for ${region}`);
    }
}

// Load notification settings from Supabase
async function loadNotificationSettings(logger) {
    try {
        logger.info('LOAD NOTIFICATION SETTINGS (CHECKPRICES) STARTED');
        
        const { data, error } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('id', 'default')
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
            logger.error('Error loading notification settings', error);
            return null;
        }
        
        if (!data) {
            logger.info('No notification settings found');
            return null;
        }
        
        logger.info('Raw loaded data', data);
        
        // Convert lastNotified timestamp to number for comparison
        if (data.last_notified) {
            data.lastNotified = new Date(data.last_notified).getTime();
            logger.info('Converted lastNotified to timestamp', { lastNotified: data.lastNotified });
        }
        
        // Map database fields to expected format
        const settings = {
            channelId: data.channel_id,
            sellThreshold: data.sell_threshold,
            holdThreshold: data.hold_threshold,
            lastAction: data.last_action,
            lastNotified: data.lastNotified
        };
        
        logger.info('Final processed settings', settings);
        logger.info('LOAD NOTIFICATION SETTINGS (CHECKPRICES) COMPLETED');
        return settings;
    } catch (error) {
        logger.error('LOAD NOTIFICATION SETTINGS (CHECKPRICES) ERROR');
        logger.error('Error loading notification settings', {
            message: error.message,
            stack: error.stack
        });
        return null;
    }
}

// Update notification last action
async function updateNotificationAction(action, logger) {
    try {
        logger.info('UPDATE NOTIFICATION ACTION STARTED');
        logger.info('Action to update', { action });
        
        const now = new Date().toISOString();
        
        const { error } = await supabase
            .from('notification_settings')
            .upsert({
                id: 'default',
                last_action: action,
                last_notified: now,
                updated_at: now
            }, {
                onConflict: 'id'
            });
        
        if (error) {
            logger.error('Error updating notification action', error);
        } else {
            logger.info('Notification action updated successfully');
            logger.info('UPDATE NOTIFICATION ACTION COMPLETED');
        }
    } catch (error) {
        logger.error('UPDATE NOTIFICATION ACTION ERROR');
        logger.error('Error updating notification action', {
            message: error.message,
            stack: error.stack
        });
    }
}

// Send notification to Discord channel
async function sendNotificationToChannel(channelId, message, logger) {
    try {
        // Create a temporary Discord client for sending messages
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });

        await client.login(process.env.DISCORD_TOKEN);
        
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            await channel.send(message);
            logger.info(`Notification sent to channel ${channelId}`);
        } else {
            logger.error(`Channel ${channelId} not found or not text-based`);
        }

        await client.destroy();
    } catch (error) {
        logger.error('Error sending notification', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Check prices and send notifications
async function checkPrices() {
    const logger = new Logger('check-prices-task');
    
    try {
        logger.info('Starting price check...');
        
        // Get access token
        const accessToken = await getAccessToken(logger);
        
        // Load notification settings
        const settings = await loadNotificationSettings(logger);
        
        if (!settings) {
            logger.info('No notification settings configured');
            await logger.flush();
            return { success: true, timestamp: new Date().toISOString() };
        }
        
        // Check prices for each region
        for (const region of ['US']) {
            try {
                const price = await getTokenPrice(region, accessToken, logger);
                logger.info(`Price check results for ${region}`, {
                    currentPrice: price,
                    sellThreshold: settings.sellThreshold,
                    holdThreshold: settings.holdThreshold,
                    lastAction: settings.lastAction || 'none'
                });
                
                let shouldNotify = false;
                let message = '';
                let newAction = settings.lastAction;
                
                // Check if we should notify based on price thresholds and last action
                if (price >= settings.sellThreshold && settings.lastAction !== 'SELL') {
                    // Price is above sell threshold and we haven't notified to sell yet
                    shouldNotify = true;
                    newAction = 'SELL';
                    message = `🚨 **Token Price Alert**\nRegion: ${region}\nCurrent Price: ${price.toLocaleString()} gold\nAction: **SELL** - Price is above threshold of ${settings.sellThreshold.toLocaleString()} gold\nWill notify again when price drops below ${settings.holdThreshold.toLocaleString()} gold`;
                    logger.info('Triggering SELL notification');
                } else if (price <= settings.holdThreshold && settings.lastAction !== 'BUY') {
                    // Price is below hold threshold and we haven't notified to buy yet
                    shouldNotify = true;
                    newAction = 'BUY';
                    message = `🚨 **Token Price Alert**\nRegion: ${region}\nCurrent Price: ${price.toLocaleString()} gold\nAction: **HOLD** - Price is below threshold of ${settings.holdThreshold.toLocaleString()} gold\nWill notify again when price exceeds ${settings.sellThreshold.toLocaleString()} gold`;
                    logger.info('Triggering BUY notification');
                } else {
                    logger.info('No notification needed', {
                        reason: `Price ${price.toLocaleString()} is between thresholds or same action as last time`,
                        lastAction: settings.lastAction || 'none'
                    });
                }
                
                if (shouldNotify) {
                    logger.info('Sending notification and updating state...');
                    await sendNotificationToChannel(settings.channelId, message, logger);
                    await updateNotificationAction(newAction, logger);
                } else {
                    logger.info('No notification sent - conditions not met');
                }
            } catch (error) {
                logger.error(`Error checking prices for ${region}`, {
                    message: error.message,
                    stack: error.stack
                });
            }
        }

        logger.info('Price check completed successfully');
        await logger.flush();
        return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
        logger.error('Error in checkPrices', {
            message: error.message,
            stack: error.stack
        });
        await logger.flush();
        return { success: false, error: error.message, timestamp: new Date().toISOString() };
    }
}

// Export for serverless function usage
module.exports = {
    checkPrices,
    getTokenPrice,
    getAccessToken
};