const { Client, GatewayIntentBits } = require('discord.js');
const { checkPrices } = require('../src/tasks/checkPrices');

// Initialize Discord client for notifications
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// Export the handler for Vercel
module.exports = async (req, res) => {
    try {
        // console.log('=== VERCEL CHECK-PRICES FUNCTION STARTED ===');
        // console.log('Request method:', req.method);
        // console.log('Request headers:', JSON.stringify(req.headers, null, 2));
        // console.log('User-Agent:', req.headers['user-agent']);
        
        // Check for UptimeRobot by examining the user-agent
        const userAgent = req.headers['user-agent'] || '';
        const isUptimeRobot = userAgent.includes('UptimeRobot');
        
        // console.log('Is UptimeRobot request:', isUptimeRobot);
        
        if (!isUptimeRobot) {
            // console.log('Request not from UptimeRobot, returning unauthorized');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // console.log('Request authorized, running price check...');
        const result = await checkPrices();
        
        // console.log('Price check result:', JSON.stringify(result, null, 2));
        // console.log('=== VERCEL CHECK-PRICES FUNCTION COMPLETED ===');
        
        return res.status(200).json(result);
    } catch (error) {
        console.error('Error in check-prices endpoint:', error);
        // console.error('Error stack:', error.stack);
        // console.error('=== VERCEL CHECK-PRICES FUNCTION ERROR ===');
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}; 