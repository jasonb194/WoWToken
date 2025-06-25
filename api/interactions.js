const { InteractionType, InteractionResponseType } = require('discord-interactions');
const { verifyKey } = require('discord-interactions');
const axios = require('axios');
const supabase = require('../src/lib/supabase');

// Blizzard API endpoints
const API_ENDPOINTS = {
    US: 'https://us.api.blizzard.com/data/wow/token/index',
    EU: 'https://eu.api.blizzard.com/data/wow/token/index',
    KR: 'https://kr.api.blizzard.com/data/wow/token/index',
    TW: 'https://tw.api.blizzard.com/data/wow/token/index'
};

// Load notification settings from Supabase
async function loadNotificationSettings() {
    try {
        console.log('=== LOAD NOTIFICATION SETTINGS STARTED ===');
        
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
        
        // Map database fields to expected format
        const settings = {
            channelId: data.channel_id,
            sellThreshold: data.sell_threshold,
            holdThreshold: data.hold_threshold,
            lastAction: data.last_action,
            lastNotified: data.last_notified
        };
        
        console.log('Loaded notification settings:', JSON.stringify(settings, null, 2));
        console.log('=== LOAD NOTIFICATION SETTINGS COMPLETED ===');
        return settings;
    } catch (error) {
        console.error('=== LOAD NOTIFICATION SETTINGS ERROR ===');
        console.error('Error loading notification settings:', error);
        console.error('Error stack:', error.stack);
        return null;
    }
}

// Save notification settings to Supabase  
async function saveNotificationSettings(settings) {
    try {
        console.log('=== SAVE NOTIFICATION SETTINGS STARTED ===');
        console.log('Settings to save:', JSON.stringify(settings, null, 2));
        
        const now = new Date().toISOString();
        
        const { data, error } = await supabase
            .from('notification_settings')
            .upsert({
                id: 'default',
                channel_id: settings.channelId,
                sell_threshold: settings.sellThreshold,
                hold_threshold: settings.holdThreshold,
                last_action: settings.lastAction || null,
                last_notified: settings.lastNotified ? new Date(settings.lastNotified).toISOString() : null,
                created_at: now,
                updated_at: now
            }, {
                onConflict: 'id'
            })
            .select();
        
        if (error) {
            console.error('Error saving notification settings:', error);
            throw error;
        }
        
        console.log('Notification settings saved successfully');
        console.log('Saved data:', JSON.stringify(data, null, 2));
        console.log('=== SAVE NOTIFICATION SETTINGS COMPLETED ===');
    } catch (error) {
        console.error('=== SAVE NOTIFICATION SETTINGS ERROR ===');
        console.error('Error saving notification settings:', error);
        console.error('Error stack:', error.stack);
        console.error('Error message:', error.message);
        throw error;
    }
}

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

// Verify the request is from Discord
function verifyDiscordRequest(request) {
    const signature = request.headers['x-signature-ed25519'];
    const timestamp = request.headers['x-signature-timestamp'];
    const rawBody = request.rawBody || JSON.stringify(request.body);
    
    // Debug logging
    console.log('Request headers:', {
        'x-signature-ed25519': signature,
        'x-signature-timestamp': timestamp
    });
    console.log('Raw body:', rawBody);
    console.log('Public key:', process.env.DISCORD_PUBLIC_KEY);
    
    // Check if we have the required headers and public key
    if (!signature || !timestamp || !rawBody) {
        console.error('Missing required headers:', { signature, timestamp, rawBody });
        throw new Error('Missing required headers');
    }

    if (!process.env.DISCORD_PUBLIC_KEY) {
        console.error('Missing DISCORD_PUBLIC_KEY environment variable');
        throw new Error('Server configuration error');
    }

    // Ensure the public key is a valid hex string
    const publicKey = process.env.DISCORD_PUBLIC_KEY.trim();
    if (!/^[0-9a-f]{64}$/i.test(publicKey)) {
        console.error('Invalid public key format:', publicKey);
        throw new Error('Invalid public key format');
    }

    try {
        const isValidRequest = verifyKey(
            rawBody,
            signature,
            timestamp,
            publicKey
        );
        
        if (!isValidRequest) {
            console.error('Invalid request signature');
            throw new Error('Invalid request signature');
        }
    } catch (error) {
        console.error('Error verifying request:', error);
        throw new Error('Failed to verify request');
    }
}

// Handle the interaction
async function handleInteraction(interaction) {
    if (interaction.type === InteractionType.PING) {
        return { type: InteractionResponseType.PONG };
    }

    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
        // Handle token command
        if (interaction.data.name === 'token') {
            try {
                // Get region from options or default to US
                const region = interaction.data.options?.[0]?.value || 'US';
                
                // Get token price
                const accessToken = await getAccessToken();
                const price = await getTokenPrice(region, accessToken);
                
                return {
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: `Current WoW Token price in ${region}: ${price.toLocaleString()} gold`
                    }
                };
            } catch (error) {
                console.error('Error in token command:', error);
                return {
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: 'Sorry, I encountered an error while fetching the token price.'
                    }
                };
            }
        }
        // Handle notify command
        else if (interaction.data.name === 'notify') {
            // console.log('=== NOTIFY COMMAND STARTED ===');
            // console.log('Interaction data:', JSON.stringify(interaction, null, 2));
            
            try {
                // console.log('Step 1: Checking user authorization...');
                
                // Check if user is authorized (comma-separated list in environment variable)
                const authorizedUsers = process.env.AUTHORIZED_USERS?.split(',').map(u => u.trim()) || [];
                // console.log('Authorized users:', authorizedUsers);
                
                const username = interaction.member?.user?.username || interaction.user?.username;
                // console.log('Current user username:', username);
                // console.log('User object:', JSON.stringify(interaction.member?.user || interaction.user, null, 2));
                
                if (!authorizedUsers.includes(username)) {
                    // console.log('User not authorized, rejecting command');
                    return {
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: `You are not authorized to use this command. Authorized users: ${authorizedUsers.join(', ')}`,
                            flags: 64 // Ephemeral flag
                        }
                    };
                }
                
                // console.log('Step 2: User authorized, extracting options...');

                const sellThreshold = interaction.data.options.find(opt => opt.name === 'sell_threshold')?.value;
                const holdThreshold = interaction.data.options.find(opt => opt.name === 'hold_threshold')?.value;
                const channel = interaction.data.options.find(opt => opt.name === 'channel')?.value;

                // console.log('Options extracted:');
                // console.log('- Sell threshold:', sellThreshold);
                // console.log('- Hold threshold:', holdThreshold);
                // console.log('- Channel ID:', channel);
                // console.log('Raw options:', JSON.stringify(interaction.data.options, null, 2));

                // console.log('Step 3: Validating thresholds...');
                
                // Validate thresholds
                if (sellThreshold <= holdThreshold) {
                    // console.log('Validation failed: sell threshold must be higher than hold threshold');
                    return {
                        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                        data: {
                            content: 'Sell threshold must be higher than hold threshold.',
                            flags: 64 // Ephemeral flag
                        }
                    };
                }
                
                // console.log('Step 4: Thresholds validated, preparing to save settings...');
                
                const settingsToSave = {
                    sellThreshold,
                    holdThreshold,
                    channelId: channel,
                    lastNotified: null,
                    lastAction: null  // Track last action (SELL/BUY) instead of cooldown
                };
                
                // console.log('Settings to save:', JSON.stringify(settingsToSave, null, 2));

                // console.log('Step 5: Calling saveNotificationSettings...');
                
                // Save notification settings
                await saveNotificationSettings(settingsToSave);
                
                // console.log('Step 6: Settings saved successfully, preparing response...');

                const responseData = {
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: `Notifications set up successfully!\nSell threshold: ${sellThreshold.toLocaleString()} gold\nHold threshold: ${holdThreshold.toLocaleString()} gold\nNotifications will be sent to <#${channel}>`,
                        flags: 64 // Ephemeral flag
                    }
                };
                
                // console.log('Step 7: Response prepared:', JSON.stringify(responseData, null, 2));
                // console.log('=== NOTIFY COMMAND COMPLETED SUCCESSFULLY ===');

                return responseData;
            } catch (error) {
                // console.error('=== NOTIFY COMMAND ERROR ===');
                console.error('Error in notify command:', error);
                // console.error('Error stack:', error.stack);
                // console.error('Error message:', error.message);
                
                return {
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        content: 'Sorry, I encountered an error while setting up notifications.',
                        flags: 64 // Ephemeral flag
                    }
                };
            }
        }

        // Unknown command
        return {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: 'Unknown command'
            }
        };
    }
}

// Export the handler for Vercel
module.exports = async (req, res) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify the request is from Discord
        verifyDiscordRequest(req);

        // Handle the interaction
        const response = await handleInteraction(req.body);
        return res.status(200).json(response);
    } catch (error) {
        console.error('Error handling interaction:', error);
        return res.status(400).json({ 
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}; 