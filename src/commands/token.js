const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

// Blizzard API endpoints and namespaces
const BLIZZARD_API = {
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
async function getAccessToken() {
    try {
        const response = await axios.post('https://oauth.battle.net/token', 
            'grant_type=client_credentials',
            {
                auth: {
                    username: process.env.BLIZZARD_CLIENT_ID,
                    password: process.env.BLIZZARD_CLIENT_SECRET
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw new Error('Failed to get access token');
    }
}

// Get token price
async function getTokenPrice(region, accessToken) {
    try {
        const regionConfig = BLIZZARD_API[region];
        if (!regionConfig) {
            throw new Error(`Invalid region: ${region}`);
        }

        const response = await axios.get(`${regionConfig.url}/data/wow/token/index`, {
            params: {
                namespace: regionConfig.namespace,
                locale: 'en_US',
                access_token: accessToken
            }
        });
        return response.data.price;
    } catch (error) {
        console.error(`Error getting token price for ${region}:`, error.response?.data || error.message);
        throw new Error(`Failed to get token price for ${region}`);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
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
                )),
    
    async execute(interaction) {
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
}; 