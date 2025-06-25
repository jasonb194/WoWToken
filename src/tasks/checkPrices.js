const { Client, GatewayIntentBits, TextChannel } = require('discord.js');
const axios = require('axios');
const supabase = require('../lib/supabase');

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
async function getAccessToken() {
    try {
        console.log('Getting access token...');
        const response = await axios.post('https://oauth.battle.net/token', null, {
            params: {
                grant_type: 'client_credentials'
            },
            auth: {
                username: process.env.BLIZZARD_CLIENT_ID,
                password: process.env.BLIZZARD_CLIENT_SECRET
            }
        });
        console.log('Access token received successfully');
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });
        throw new Error('Failed to get access token');
    }
}

// Get token price for a region
async function getTokenPrice(region, accessToken) {
    try {
        console.log(`Getting token price for ${region}...`);
        const url = API_ENDPOINTS[region];
        if (!url) {
            throw new Error(`Invalid region: ${region}`);
        }

        const params = {
            namespace: `dynamic-${region.toLowerCase()}`,
            locale: 'en_US',
            access_token: accessToken
        };
        
        console.log(`Fetching token price from ${url} with params:`, params);
        
        const response = await axios.get(url, { 
            params,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        console.log('API response:', {
            status: response.status,
            data: response.data
        });

        if (!response.data || !response.data.price) {
            throw new Error(`Invalid response format: ${JSON.stringify(response.data)}`);
        }
        
        // Convert from copper to gold (1 gold = 10000 copper)
        return response.data.price / 10000;
    } catch (error) {
        console.error(`Error getting token price for ${region}:`, {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });
        throw new Error(`Failed to get token price for ${region}`);
    }
}

// Load notification settings from Supabase
async function loadNotificationSettings() {
    try {
        console.log('=== LOAD NOTIFICATION SETTINGS (CHECKPRICES) STARTED ===');
        
        const { data, error } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('id', 'default')
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
            console.error('Error loading notification settings:', error);
            return null;
        }
        
        if (!data) {
            console.log('No notification settings found');
            return null;
        }
        
        console.log('Raw loaded data:', JSON.stringify(data, null, 2));
        
        // Convert lastNotified timestamp to number for comparison
        if (data.last_notified) {
            data.lastNotified = new Date(data.last_notified).getTime();
            console.log('Converted lastNotified to timestamp:', data.lastNotified);
        }
        
        // Map database fields to expected format
        const settings = {
            channelId: data.channel_id,
            sellThreshold: data.sell_threshold,
            holdThreshold: data.hold_threshold,
            lastAction: data.last_action,
            lastNotified: data.lastNotified
        };
        
        console.log('Final processed settings:', JSON.stringify(settings, null, 2));
        console.log('=== LOAD NOTIFICATION SETTINGS (CHECKPRICES) COMPLETED ===');
        return settings;
    } catch (error) {
        console.error('=== LOAD NOTIFICATION SETTINGS (CHECKPRICES) ERROR ===');
        console.error('Error loading notification settings:', error);
        console.error('Error stack:', error.stack);
        return null;
    }
}

// Update notification last action
async function updateNotificationAction(action) {
    try {
        console.log('=== UPDATE NOTIFICATION ACTION STARTED ===');
        console.log('Action to update:', action);
        
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
            console.error('Error updating notification action:', error);
        } else {
            console.log('Notification action updated successfully');
            console.log('=== UPDATE NOTIFICATION ACTION COMPLETED ===');
        }
    } catch (error) {
        console.error('=== UPDATE NOTIFICATION ACTION ERROR ===');
        console.error('Error updating notification action:', error);
        console.error('Error stack:', error.stack);
    }
}

// Send notification to Discord channel
async function sendNotificationToChannel(channelId, message) {
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
            // console.log(`Notification sent to channel ${channelId}`);
        } else {
            console.error(`Channel ${channelId} not found or not text-based`);
        }

        await client.destroy();
    } catch (error) {
        console.error('Error sending notification:', error);
        throw error;
    }
}

// Check prices and send notifications
async function checkPrices() {
    try {
        console.log('Starting price check...');
        
        // Get access token
        const accessToken = await getAccessToken();
        
        // Load notification settings
        const settings = await loadNotificationSettings();
        
        if (!settings) {
            console.log('No notification settings configured');
            return { success: true, timestamp: new Date().toISOString() };
        }
        
        // Check prices for each region
        for (const region of ['US']) {
            try {
                const price = await getTokenPrice(region, accessToken);
                console.log(`Current ${region} token price: ${price.toLocaleString()} gold`);
                console.log(`Sell threshold: ${settings.sellThreshold.toLocaleString()} gold`);
                console.log(`Hold threshold: ${settings.holdThreshold.toLocaleString()} gold`);
                console.log(`Last action: ${settings.lastAction || 'none'}`);
                
                let shouldNotify = false;
                let message = '';
                let newAction = settings.lastAction;
                
                // Check if we should notify based on price thresholds and last action
                if (price >= settings.sellThreshold && settings.lastAction !== 'SELL') {
                    // Price is above sell threshold and we haven't notified to sell yet
                    shouldNotify = true;
                    newAction = 'SELL';
                    message = `🚨 **Token Price Alert**\nRegion: ${region}\nCurrent Price: ${price.toLocaleString()} gold\nAction: **SELL** - Price is above threshold of ${settings.sellThreshold.toLocaleString()} gold`;
                    // console.log('Triggering SELL notification');
                } else if (price <= settings.holdThreshold && settings.lastAction !== 'BUY') {
                    // Price is below hold threshold and we haven't notified to buy yet
                    shouldNotify = true;
                    newAction = 'BUY';
                    message = `🚨 **Token Price Alert**\nRegion: ${region}\nCurrent Price: ${price.toLocaleString()} gold\nAction: **HOLD** - Price is below threshold of ${settings.holdThreshold.toLocaleString()} gold`;
                    // console.log('Triggering BUY notification');
                } else {
                    // console.log('No notification needed:');
                    // console.log(`- Price ${price.toLocaleString()} is between thresholds`);
                    // console.log(`- Last action was: ${settings.lastAction || 'none'}`);
                    // console.log(`- Would need opposite action to trigger new notification`);
                }
                
                if (shouldNotify) {
                    // console.log('Sending notification and updating state...');
                    await sendNotificationToChannel(settings.channelId, message);
                    await updateNotificationAction(newAction);
                } else {
                    // console.log('No notification sent - conditions not met');
                }
            } catch (error) {
                console.error(`Error checking prices for ${region}:`, error);
            }
        }

        // console.log('Price check completed successfully');
        return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
        console.error('Error in checkPrices:', error);
        return { success: false, error: error.message, timestamp: new Date().toISOString() };
    }
}

// Export for serverless function usage
module.exports = {
    checkPrices,
    getTokenPrice,
    getAccessToken
};