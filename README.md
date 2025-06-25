# WoW Token Discord Bot

A Discord bot for tracking World of Warcraft token prices with real-time notifications and alerts.

## Features

- 📊 Real-time WoW Token price tracking
- 🔔 Customizable price threshold notifications
- 🌍 Multi-region support (US, EU, KR, TW)
- ⚡ Automatic price checking every 5 minutes
- 📱 Discord slash commands
- 🔒 Secure data storage with Supabase

## Available Commands

- `/token [region]` - Get current WoW Token price for a specific region
- `/notify <channel> <sell_threshold> <hold_threshold>` - Set up price alerts
- `/ping` - Check if the bot is responsive

## Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/jasonb194/WoWToken.git
cd WoWToken
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables** (see detailed setup sections below)

4. **Deploy commands**
```bash
npm run deploy
```

5. **Start the bot**
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

---

# 🚀 Complete Setup Guide

## 1. Discord Bot Setup

### Step 1: Create Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"**
3. Enter a name for your bot (e.g., "WoW Token Tracker")
4. Click **"Create"**

### Step 2: Create Bot User

1. In your application, go to the **"Bot"** section in the left sidebar
2. Click **"Add Bot"**
3. Customize your bot:
   - **Username**: Set your bot's display name
   - **Avatar**: Upload a bot avatar image
   - **Public Bot**: Turn OFF if you want only you to invite the bot

### Step 3: Get Bot Token

1. In the **"Bot"** section, under **"Token"**
2. Click **"Reset Token"** (or **"Copy"** if it's your first time)
3. **⚠️ IMPORTANT**: Copy this token immediately and save it securely
4. Never share this token publicly

### Step 4: Configure Bot Permissions

1. Go to **"OAuth2"** → **"URL Generator"** in the left sidebar
2. Under **"Scopes"**, select:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Under **"Bot Permissions"**, select:
   - ✅ `Send Messages`
   - ✅ `Read Message History`
   - ✅ `Use Slash Commands`
   - ✅ `Embed Links`
4. Copy the generated URL at the bottom

### Step 5: Invite Bot to Server

1. Open the copied URL in your browser
2. Select the Discord server you want to add the bot to
3. Verify the permissions and click **"Authorize"**
4. Complete the CAPTCHA if prompted

---

## 2. Blizzard API Setup

### Step 1: Create Blizzard Developer Account

1. Go to [Blizzard Developer Portal](https://develop.battle.net/)
2. Log in with your Battle.net account
3. Accept the API Terms of Service

### Step 2: Create API Client

1. Click **"Create Client"**
2. Fill in the details:
   - **Client Name**: "WoW Token Bot" (or your preferred name)
   - **Intended Use**: Select "Desktop/Mobile App"
   - **Redirect URLs**: Leave empty for this bot
3. Click **"Create"**

### Step 3: Get API Credentials

1. After creating the client, you'll see:
   - **Client ID**: Copy this value
   - **Client Secret**: Copy this value
2. **⚠️ IMPORTANT**: Keep these credentials secure

---

## 3. Supabase Setup

### Step 1: Create Supabase Project

1. Go to [Supabase](https://supabase.com/)
2. Click **"Start your project"**
3. Sign up/in with GitHub (recommended)
4. Click **"New Project"**
5. Fill in project details:
   - **Organization**: Select or create one
   - **Name**: "wow-token-bot" (or preferred name)
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users (e.g., US East)
6. Click **"Create new project"**

### Step 2: Set Up Database

1. Wait for project creation to complete
2. Go to **"SQL Editor"** in the left sidebar
3. Copy the contents of `supabase-setup.sql` from this repository
4. Paste into the SQL editor and click **"Run"**

### Step 3: Get Project Credentials

1. Go to **"Settings"** → **"API"** in the left sidebar
2. Copy these values:
   - **Project URL**: `https://your-project.supabase.co`
   - **Anon/Public Key**: `eyJ...` (long string starting with eyJ)

### Step 4: Configure Row Level Security (Optional but Recommended)

1. Go to **"Authentication"** → **"Policies"**
2. The setup script already includes basic policies
3. For production, consider more restrictive policies based on your needs

---

## 4. Vercel Deployment

### Step 1: Prepare for Deployment

1. Ensure your code is pushed to GitHub
2. Your repository should be public or accessible to Vercel

### Step 2: Deploy to Vercel

1. Go to [Vercel](https://vercel.com/)
2. Sign up/in with GitHub
3. Click **"New Project"**
4. Import your GitHub repository
5. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build` (or leave empty)
   - **Output Directory**: Leave empty
   - **Install Command**: `npm install`

### Step 3: Add Environment Variables

In Vercel project settings, add these environment variables:

```
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
BLIZZARD_CLIENT_ID=your_blizzard_client_id
BLIZZARD_CLIENT_SECRET=your_blizzard_client_secret
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait for deployment to complete
3. Your bot API will be available at `https://your-project.vercel.app`

### Step 5: Set Up Cron Job (Price Checking)

1. In Vercel, go to **"Functions"** → **"Cron Jobs"**
2. Create a new cron job:
   - **Path**: `/api/check-prices`
   - **Schedule**: `*/5 * * * *` (every 5 minutes)
3. Save the cron job

---

## 5. UptimeRobot Setup

### Step 1: Create UptimeRobot Account

1. Go to [UptimeRobot](https://uptimerobot.com/)
2. Sign up for a free account
3. Verify your email address

### Step 2: Add Monitor

1. Click **"Add New Monitor"**
2. Configure monitor:
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: "WoW Token Bot API"
   - **URL**: `https://your-project.vercel.app/api/check-prices`
   - **Monitoring Interval**: 5 minutes
   - **Monitor Timeout**: 30 seconds
3. Click **"Create Monitor"**

### Step 3: Set Up Alerts (Optional)

1. Go to **"Alert Contacts"**
2. Add your email/SMS/Discord webhook for notifications
3. Configure when you want to be notified of downtime

### Step 4: Monitor Status

- Your monitor will start checking your bot's API endpoint
- You'll get alerts if the bot goes down
- Use the dashboard to track uptime statistics

---

## 6. Environment Variables

Create a `.env` file in your project root with all required variables:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here

# Blizzard API Configuration
BLIZZARD_CLIENT_ID=your_blizzard_client_id_here
BLIZZARD_CLIENT_SECRET=your_blizzard_client_secret_here

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**⚠️ Security Note**: Never commit your `.env` file to version control. It's already included in `.gitignore`.

---

## 7. Testing Your Setup

### Test Discord Bot

1. Use `/token` to test Blizzard API integration
2. Use `/notify` to test Supabase integration

### Test API Endpoints

1. Visit `https://your-project.vercel.app/api/check-prices` to test price checking
2. Check Vercel logs for any errors
3. Monitor UptimeRobot dashboard for uptime status

### Test Database

1. In Supabase dashboard, go to **"Table Editor"**
2. Check the `notification_settings` table for your data
3. Verify data is being saved when you use `/notify`

---

## 8. Troubleshooting

### Common Issues

**Bot not responding to commands:**
- Check Discord token is correct
- Ensure bot has proper permissions in server
- Verify bot is online in Discord

**API errors:**
- Check Blizzard API credentials
- Verify Supabase connection and credentials
- Check Vercel logs for detailed error messages

**Database issues:**
- Ensure Supabase table was created properly
- Check Row Level Security policies
- Verify environment variables are set correctly

### Getting Help

- **GitHub Issues**: [https://github.com/jasonb194/WoWToken/issues](https://github.com/jasonb194/WoWToken/issues)
- **Documentation**: Check our [Terms of Service](./TERMS_OF_SERVICE.md) and [Privacy Policy](./PRIVACY_POLICY.md)

---

## 📚 Additional Resources

- [Discord.js Documentation](https://discord.js.org/#/docs)
- [Blizzard API Documentation](https://develop.battle.net/documentation)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)

## 🛠️ Technology Stack

- **Runtime**: Node.js
- **Bot Framework**: Discord.js v14
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel
- **Monitoring**: UptimeRobot
- **APIs**: Blizzard Battle.net API

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](./WoWToken/LICENSE) file for details. 