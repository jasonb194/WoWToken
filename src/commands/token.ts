import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';

interface RegionConfig {
    url: string;
    namespace: string;
}

interface BlizzardApiConfig {
    [key: string]: RegionConfig;
}

interface TokenResponse {
    price: number;
}

interface AccessTokenResponse {
    access_token: string;
}

// Blizzard API endpoints and namespaces
const BLIZZARD_API: BlizzardApiConfig = {
    US: {
        url: 'https://us.api.blizzard.com',
        namespace: 'dynamic-us'
    },
    EU: {
        url: 'https://eu.api.blizzard.com',
        namespace: 'dynamic-eu'
    },
    KR: {
        url: 'https://kr.api.blizzard.com',
        namespace: 'dynamic-kr'
    },
    TW: {
        url: 'https://tw.api.blizzard.com',
        namespace: 'dynamic-tw'
    }
};

// Get access token
async function getAccessToken(): Promise<string> {
    try {
        const response = await axios.post<AccessTokenResponse>(
            'https://oauth.battle.net/token', 
            'grant_type=client_credentials',
            {
                auth: {
                    username: process.env.BLIZZARD_CLIENT_ID || '',
                    password: process.env.BLIZZARD_CLIENT_SECRET || ''
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error('Error getting access token:', error.response?.data || error.message);
        } else {
            console.error('Error getting access token:', error);
        }
        throw new Error('Failed to get access token');
    }
}

// Get token price
async function getTokenPrice(region: string, accessToken: string): Promise<number> {
    try {
        const regionConfig = BLIZZARD_API[region];
        if (!regionConfig) {
            throw new Error(`Invalid region: ${region}`);
        }

        const response = await axios.get<TokenResponse>(`${regionConfig.url}/data/wow/token/index`, {
            params: {
                namespace: regionConfig.namespace,
                locale: 'en_US',
                access_token: accessToken
            }
        });
        return response.data.price;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`Error getting token price for ${region}:`, error.response?.data || error.message);
        } else {
            console.error(`Error getting token price for ${region}:`, error);
        }
        throw new Error(`Failed to get token price for ${region}`);
    }
}

export const data = new SlashCommandBuilder()
    .setName('token')
    .setDescription('Get the current WoW Token price')
    .addStringOption(option =>
        option.setName('region')
            .setDescription('The region to check (US, EU, KR, TW)')
            .setRequired(false)
            .addChoices(
                { name: 'US', value: 'US' },
                { name: 'EU', value: 'EU' },
                { name: 'KR', value: 'KR' },
                { name: 'TW', value: 'TW' }
            ));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        // Defer the reply since the API call might take a moment
        await interaction.deferReply();
        
        const region = interaction.options.getString('region') || 'US';
        const accessToken = await getAccessToken();
        const price = await getTokenPrice(region, accessToken);
        
        // Convert price to gold (1 gold = 10000 copper)
        const priceInGold = price / 10000;
        
        await interaction.editReply(`Current WoW Token price in ${region}: ${priceInGold.toLocaleString()} gold`);
    } catch (error) {
        console.error('Error in token command:', error);
        await interaction.editReply('Sorry, I encountered an error while fetching the token price.');
    }
} 