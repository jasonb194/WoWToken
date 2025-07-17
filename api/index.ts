import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import handlers
import interactionsHandler from './interactions';

// Route handler
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse> {
    const path = req.url || '';

    // Log the incoming request
    console.log(`Received request to ${path}`);

    // Route to appropriate handler
    if (path === '/api/interactions') {
        return await interactionsHandler(req, res);
    } else {
        console.log(`No handler found for path: ${path}`);
        return res.status(404).json({ 
            error: 'Not found',
            path: path,
            availableEndpoints: ['/api/interactions']
        });
    }
} 