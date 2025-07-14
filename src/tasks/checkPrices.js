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
            lastNotified: data.lastNotified,
            messageId: data.message_id, // Add message ID
            currentPrice: data.current_price // Add current price
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

// Update notification state (action, message ID, and current price)
async function updateNotificationState(action, messageId, currentPrice, logger) {
    try {
        logger.info('UPDATE NOTIFICATION STATE STARTED');
        logger.info('State to update', { action, messageId, currentPrice });
        
        const now = new Date().toISOString();
        
        const updateData = {
            id: 'default',
            updated_at: now
        };

        // Only update non-null values
        if (action !== undefined) {
            updateData.last_action = action;
            updateData.last_notified = now;
        }
        if (messageId !== undefined) {
            updateData.message_id = messageId;
        }
        if (currentPrice !== undefined) {
            updateData.current_price = currentPrice;
        }
        
        const { error } = await supabase
            .from('notification_settings')
            .upsert(updateData, {
                onConflict: 'id'
            });
        
        if (error) {
            logger.error('Error updating notification state', error);
        } else {
            logger.info('Notification state updated successfully');
            logger.info('UPDATE NOTIFICATION STATE COMPLETED');
        }
    } catch (error) {
        logger.error('UPDATE NOTIFICATION STATE ERROR');
        logger.error('Error updating notification state', {
            message: error.message,
            stack: error.stack
        });
    }
}

// Send notification to Discord channel and return message ID
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
            const sentMessage = await channel.send(message);
            logger.info(`Notification sent to channel ${channelId}`, { messageId: sentMessage.id });
            await client.destroy();
            return sentMessage.id; // Return the message ID
        } else {
            logger.error(`Channel ${channelId} not found or not text-based`);
            await client.destroy();
            return null;
        }
    } catch (error) {
        logger.error('Error sending notification', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

// Edit existing Discord message
async function editDiscordMessage(channelId, messageId, newMessage, logger) {
    let client;
    try {
        // Create a temporary Discord client for editing messages
        client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });

        await client.login(process.env.DISCORD_TOKEN);
        
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased()) {
            const message = await channel.messages.fetch(messageId);
            await message.edit(newMessage);
            logger.info(`Message ${messageId} edited in channel ${channelId}`);
            await client.destroy();
            return true;
        } else {
            logger.error(`Channel ${channelId} not found or not text-based`);
            await client.destroy();
            return false;
        }
    } catch (error) {
        logger.error('Error editing message', {
            messageId,
            channelId,
            message: error.message,
            stack: error.stack
        });
        try {
            if (client) {
                await client.destroy();
            }
        } catch (destroyError) {
            logger.error('Error destroying client', destroyError);
        }
        return false;
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
                    previousPrice: settings.currentPrice,
                    sellThreshold: settings.sellThreshold,
                    holdThreshold: settings.holdThreshold,
                    lastAction: settings.lastAction || 'none',
                    hasExistingMessage: !!settings.messageId
                });
                
                let shouldSendNewMessage = false;
                let shouldUpdateExistingMessage = false;
                let message = '';
                let newAction = settings.lastAction;
                
                // Check if we should send a new message (threshold crossed)
                if (price >= settings.sellThreshold && settings.lastAction !== 'SELL') {
                    // Price is above sell threshold and we haven't notified to sell yet
                    shouldSendNewMessage = true;
                    newAction = 'SELL';
                    message = `🚨 **Token Price Alert**\nRegion: ${region}\nCurrent Price: ${price.toLocaleString()} gold\nAction: **SELL** - Price is above threshold of ${settings.sellThreshold.toLocaleString()} gold\nWill notify again when price drops below ${settings.holdThreshold.toLocaleString()} gold`;
                    logger.info('Triggering SELL notification - sending new message');
                } else if (price <= settings.holdThreshold && settings.lastAction !== 'BUY') {
                    // Price is below hold threshold and we haven't notified to buy yet
                    shouldSendNewMessage = true;
                    newAction = 'BUY';
                    message = `🚨 **Token Price Alert**\nRegion: ${region}\nCurrent Price: ${price.toLocaleString()} gold\nAction: **HOLD** - Price is below threshold of ${settings.holdThreshold.toLocaleString()} gold\nWill notify again when price exceeds ${settings.sellThreshold.toLocaleString()} gold`;
                    logger.info('Triggering BUY notification - sending new message');
                } else if (settings.messageId && settings.currentPrice !== price) {
                    // Price has changed but no threshold crossed - update existing message
                    shouldUpdateExistingMessage = true;
                    
                    // Determine current status based on price
                    let status = 'MONITORING';
                    if (price > settings.sellThreshold) {
                        status = 'SELL ZONE';
                    } else if (price < settings.holdThreshold) {
                        status = 'BUY ZONE';
                    }
                    
                    message = `📊 **Token Price Update**\nRegion: ${region}\nCurrent Price: ${price.toLocaleString()} gold\nStatus: **${status}**\nSell Threshold: ${settings.sellThreshold.toLocaleString()} gold\nHold Threshold: ${settings.holdThreshold.toLocaleString()} gold\n\n*Last updated: ${new Date().toLocaleString()}*`;
                    logger.info('Price changed - updating existing message');
                } else {
                    logger.info('No notification needed', {
                        reason: settings.messageId ? 
                            `Price unchanged (${price.toLocaleString()})` : 
                            `Price ${price.toLocaleString()} is between thresholds or same action as last time`,
                        lastAction: settings.lastAction || 'none'
                    });
                }
                
                if (shouldSendNewMessage) {
                    logger.info('Sending new notification message...');
                    const messageId = await sendNotificationToChannel(settings.channelId, message, logger);
                    if (messageId) {
                        await updateNotificationState(newAction, messageId, price, logger);
                        logger.info('New message sent and state updated');
                    }
                } else if (shouldUpdateExistingMessage) {
                    logger.info('Updating existing message...');
                    const success = await editDiscordMessage(settings.channelId, settings.messageId, message, logger);
                    if (success) {
                        await updateNotificationState(undefined, undefined, price, logger);
                        logger.info('Existing message updated');
                    } else {
                        logger.warn('Failed to update existing message - it may have been deleted');
                        // Clear the message ID since it's no longer valid
                        await updateNotificationState(undefined, null, price, logger);
                    }
                } else {
                    // Just update the current price in the database
                    await updateNotificationState(undefined, undefined, price, logger);
                    logger.info('Price recorded in database');
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