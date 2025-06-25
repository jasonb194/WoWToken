# WoW Token Discord Bot

A Discord bot for tracking World of Warcraft token prices and related information.

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following content:
```
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
```

3. Get your bot token:
   - Go to the [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to the "Bot" section
   - Click "Add Bot"
   - Copy the token and paste it in your `.env` file

4. Invite the bot to your server:
   - Go to OAuth2 > URL Generator in the Developer Portal
   - Select the following scopes:
     - `bot`
     - `applications.commands`
   - Select the following bot permissions:
     - `Send Messages`
     - `Read Message History`
   - Copy the generated URL and open it in your browser to invite the bot

5. Start the bot:
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## Available Commands

- `/ping` - Check if the bot is responsive

## Development

The bot is built using:
- Discord.js v14
- Node.js
- dotenv for environment variables 