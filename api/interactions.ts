import { verifyKey } from 'discord-interactions';
import { 
    APIInteraction, 
    APIInteractionResponse,
    InteractionType,
    InteractionResponseType,
    APIApplicationCommandInteractionData,
    APIChatInputApplicationCommandInteractionData,
    APIApplicationCommandInteractionDataOption,
    ApplicationCommandOptionType
} from 'discord-api-types/v10';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import supabase from '../src/lib/supabase';

interface NotificationSettings {
    channelId: string;
    sellThreshold: number;
    holdThreshold: number;
    lastAction: string | null;
    lastNotified: string | null;
}

interface DatabaseNotificationSettings {
    id: string;
    channel_id: string;
    sell_threshold: number;
    hold_threshold: number;
    last_action: string | null;
    last_notified: string | null;
    created_at: string;
    updated_at: string;
}

// Blizzard API endpoints
const API_ENDPOINTS: Record<string, string> = {
    US: 'https://us.api.blizzard.com/data/wow/token/index',
    EU: 'https://eu.api.blizzard.com/data/wow/token/index',
    KR: 'https://kr.api.blizzard.com/data/wow/token/index',
    TW: 'https://tw.api.blizzard.com/data/wow/token/index'
};

// Load notification settings from Supabase
async function loadNotificationSettings(): Promise<NotificationSettings | null> {
    try {
        console.log('=== LOAD NOTIFICATION SETTINGS STARTED ===');
        
        const { data, error } = await supabase
            .from('notification_settings')
            .select('*')
            .eq('id', 'default')
            .single<DatabaseNotificationSettings>();
        
        if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
            console.error('Error loading notification settings:', error);
            return null;
        }
        
        if (!data) {
            console.log('No notification settings found');
            return null;
        }
        
        // Map database fields to expected format
        const settings: NotificationSettings = {
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
        if (error instanceof Error) {
            console.error('Error stack:', error.stack);
        }
        return null;
    }
}

// Save notification settings to Supabase  
async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
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
        if (error instanceof Error) {
            console.error('Error stack:', error.stack);
            console.error('Error message:', error.message);
        }
        throw error;
    }
}

interface AccessTokenResponse {
    access_token: string;
}

// Get access token from Blizzard API
async function getAccessToken(): Promise<string> {
    try {
        console.log('Getting access token...');
        const response = await axios.post<AccessTokenResponse>('https://oauth.battle.net/token', null, {
            params: {
                grant_type: 'client_credentials'
            },
            auth: {
                username: process.env.BLIZZARD_CLIENT_ID || '',
                password: process.env.BLIZZARD_CLIENT_SECRET || ''
            }
        });
        console.log('Access token received successfully');
        return response.data.access_token;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Error getting access token:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                headers: error.response?.headers
            });
        } else {
            console.error('Error getting access token:', error);
        }
        throw new Error('Failed to get access token');
    }
}

interface TokenResponse {
    price: number;
}

// Get token price for a region
async function getTokenPrice(region: string, accessToken: string): Promise<number> {
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
        
        const response = await axios.get<TokenResponse>(url, { 
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
        if (axios.isAxiosError(error)) {
            console.error(`Error getting token price for ${region}:`, {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                headers: error.response?.headers
            });
        } else {
            console.error(`Error getting token price for ${region}:`, error);
        }
        throw new Error(`Failed to get token price for ${region}`);
    }
}

interface VercelRequestWithRawBody extends VercelRequest {
    rawBody?: string;
}

interface CommandNumberOption {
    name: string;
    type: ApplicationCommandOptionType.Number;
    value: number;
}

interface CommandStringOption {
    name: string;
    type: ApplicationCommandOptionType.String;
    value: string;
}

// Verify the request is from Discord
function verifyDiscordRequest(request: VercelRequestWithRawBody): void {
    const signature = request.headers['x-signature-ed25519'] as string;
    const timestamp = request.headers['x-signature-timestamp'] as string;
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
async function handleInteraction(interaction: APIInteraction): Promise<APIInteractionResponse> {
    if (interaction.type === InteractionType.Ping) {
        return { type: InteractionResponseType.Pong };
    }

    if (interaction.type === InteractionType.ApplicationCommand) {
        const commandData = interaction.data as APIChatInputApplicationCommandInteractionData;
        
        // Handle token command
        if (commandData.name === 'token') {
            try {
                // Get region from options or default to US
                const regionOption = commandData.options?.[0] as CommandStringOption | undefined;
                const region = regionOption?.value || 'US';
                
                // Get token price
                const accessToken = await getAccessToken();
                const price = await getTokenPrice(region, accessToken);
                
                return {
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content: `Current WoW Token price in ${region}: ${price.toLocaleString()} gold`,
                        flags: 64 // Ephemeral flag
                    }
                };
            } catch (error) {
                console.error('Error in token command:', error);
                return {
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content: 'Sorry, I encountered an error while fetching the token price.',
                        flags: 64 // Ephemeral flag
                    }
                };
            }
        }
        // Handle notify command
        else if (commandData.name === 'notify') {
            try {
                // Check if user is authorized (comma-separated list in environment variable)
                const authorizedUsers = process.env.AUTHORIZED_USERS?.split(',').map(u => u.trim()) || [];
                
                const username = interaction.member?.user?.username || interaction.user?.username;
                
                if (!authorizedUsers.includes(username || '')) {
                    return {
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: `You are not authorized to use this command. Authorized users: ${authorizedUsers.join(', ')}`,
                            flags: 64 // Ephemeral flag
                        }
                    };
                }

                const options = commandData.options || [];
                const sellThresholdOption = options.find(opt => opt.name === 'sell_threshold') as CommandNumberOption;
                const holdThresholdOption = options.find(opt => opt.name === 'hold_threshold') as CommandNumberOption;
                const channelOption = options.find(opt => opt.name === 'channel') as CommandStringOption;

                if (!sellThresholdOption || !holdThresholdOption || !channelOption) {
                    return {
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: 'Missing required options.',
                            flags: 64 // Ephemeral flag
                        }
                    };
                }

                const sellThreshold = sellThresholdOption.value;
                const holdThreshold = holdThresholdOption.value;
                const channel = channelOption.value;

                // Validate thresholds
                if (sellThreshold <= holdThreshold) {
                    return {
                        type: InteractionResponseType.ChannelMessageWithSource,
                        data: {
                            content: 'Sell threshold must be higher than hold threshold.',
                            flags: 64 // Ephemeral flag
                        }
                    };
                }
                
                const settingsToSave: NotificationSettings = {
                    sellThreshold,
                    holdThreshold,
                    channelId: channel,
                    lastNotified: null,
                    lastAction: null
                };
                
                // Save notification settings
                await saveNotificationSettings(settingsToSave);

                return {
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content: `Notifications set up successfully!\nSell threshold: ${sellThreshold.toLocaleString()} gold\nHold threshold: ${holdThreshold.toLocaleString()} gold\nNotifications will be sent to <#${channel}>`,
                        flags: 64 // Ephemeral flag
                    }
                };
            } catch (error) {
                console.error('Error in notify command:', error);
                
                return {
                    type: InteractionResponseType.ChannelMessageWithSource,
                    data: {
                        content: 'Sorry, I encountered an error while setting up notifications.',
                        flags: 64 // Ephemeral flag
                    }
                };
            }
        }

        // Unknown command
        return {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: 'Unknown command',
                flags: 64 // Ephemeral flag
            }
        };
    }

    // Unknown interaction type
    return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
            content: 'Unknown interaction type',
            flags: 64 // Ephemeral flag
        }
    };
}

// Export the handler for Vercel
export default async function handler(
    req: VercelRequestWithRawBody,
    res: VercelResponse
): Promise<VercelResponse> {
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
            error: error instanceof Error ? error.message : 'Unknown error',
            details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
        });
    }
} 