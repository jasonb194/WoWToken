const { Client, GatewayIntentBits } = require('discord.js');
const { checkPrices } = require('../src/tasks/checkPrices');
const Logger = require('../src/lib/logger');

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
    const logger = new Logger('check-prices-api');
    
    try {
        logger.info('VERCEL CHECK-PRICES FUNCTION STARTED');
        logger.info('Request details', {
            method: req.method,
            headers: req.headers,
            userAgent: req.headers['user-agent']
        });
        
        //Check for UptimeRobot by examining the user-agent
        const userAgent = req.headers['user-agent'] || '';
        const isUptimeRobot = userAgent.includes('UptimeRobot');
        
        logger.info('Authorization check', { 
            userAgent,
            isUptimeRobot 
        });
        
        if (!isUptimeRobot) {
            logger.warn('Request not from UptimeRobot, returning unauthorized');
            await logger.flush();
            return res.status(401).json({ error: 'Unauthorized' });
        }

        logger.info('Request authorized, starting price check...');
        
        // Process synchronously to ensure logs are written
        try {
            const result = await checkPrices();
            logger.info('Price check completed successfully', result);
            logger.info('VERCEL CHECK-PRICES FUNCTION COMPLETED');
            await logger.flush();
            
            return res.status(200).json({ 
                status: 'completed',
                message: 'Price check completed successfully',
                result,
                timestamp: new Date().toISOString()
            });
        } catch (priceCheckError) {
            logger.error('Error in price check', {
                message: priceCheckError.message,
                stack: priceCheckError.stack
            });
            await logger.flush();
            
            return res.status(500).json({ 
                status: 'error',
                message: 'Price check failed',
                error: priceCheckError.message,
                timestamp: new Date().toISOString()
            });
        }
        
    } catch (error) {
        logger.error('Error in check-prices endpoint', {
            message: error.message,
            stack: error.stack
        });
        logger.error('VERCEL CHECK-PRICES FUNCTION ERROR');
        await logger.flush();
        
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}; 