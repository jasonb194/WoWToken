// Import handlers
const interactionsHandler = require('./interactions');
const testHandler = require('./test');

// Route handler
module.exports = async (req, res) => {
    const { path } = req;

    // Log the incoming request
    console.log(`Received request to ${path}`);

    // Route to appropriate handler
    if (path === '/api/interactions') {
        return await interactionsHandler(req, res);
    } else if (path === '/api/test') {
        return await testHandler(req, res);
    } else {
        console.log(`No handler found for path: ${path}`);
        res.status(404).json({ 
            error: 'Not found',
            path: path,
            availableEndpoints: ['/api/interactions', '/api/test']
        });
    }
}; 