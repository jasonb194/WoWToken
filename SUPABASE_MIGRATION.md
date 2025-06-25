# Migration from Vercel Blob to Supabase

This document outlines the steps taken to migrate your WoW Token Discord bot from Vercel Blob storage to Supabase.

## Changes Made

### 1. Dependencies Updated
- **Removed**: `@vercel/blob` 
- **Added**: `@supabase/supabase-js`

### 2. Files Modified
- `package.json` - Updated dependencies
- `src/lib/supabase.js` - New Supabase client configuration
- `src/tasks/checkPrices.js` - Replaced blob functions with Supabase queries
- `api/interactions.js` - Replaced blob functions with Supabase queries

### 3. Database Schema
A new table `notification_settings` has been designed to replace the JSON blob storage.

## Setup Instructions

### 1. Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Note down your project URL and anon key

### 2. Set Up the Database
1. In your Supabase dashboard, go to the SQL Editor
2. Run the SQL script from `supabase-setup.sql`

### 3. Environment Variables
Add these environment variables to your `.env` file:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Remove Old Environment Variables
You can remove these Vercel Blob related environment variables:
- `BLOB_READ_WRITE_TOKEN`

### 5. Install Dependencies
Run the following command to install the new Supabase dependency:

```bash
npm install
```

## Data Migration

If you have existing data in Vercel Blob that you want to migrate:

1. **Export existing data**: Use the Vercel dashboard or API to download your `notification-settings.json` file
2. **Import to Supabase**: Manually insert the data into the `notification_settings` table using the Supabase dashboard or API

Example SQL for importing data:
```sql
INSERT INTO notification_settings (
    id, 
    channel_id, 
    sell_threshold, 
    hold_threshold, 
    last_action, 
    last_notified
) VALUES (
    'default',
    'your_channel_id',
    250000,  -- example sell threshold
    200000,  -- example hold threshold
    'hold',  -- last action
    '2024-01-01T00:00:00Z'  -- last notified timestamp
) ON CONFLICT (id) DO UPDATE SET
    channel_id = EXCLUDED.channel_id,
    sell_threshold = EXCLUDED.sell_threshold,
    hold_threshold = EXCLUDED.hold_threshold,
    last_action = EXCLUDED.last_action,
    last_notified = EXCLUDED.last_notified;
```

## Testing

After completing the migration:

1. Test the `/notify` command to ensure settings are saved correctly
2. Test the price check functionality to ensure notifications work
3. Verify that data persists between bot restarts

## Key Changes in Code

### Data Structure Mapping
The JSON blob structure has been mapped to database columns:

| JSON Field | Database Column |
|------------|----------------|
| `channelId` | `channel_id` |
| `sellThreshold` | `sell_threshold` |
| `holdThreshold` | `hold_threshold` |
| `lastAction` | `last_action` |
| `lastNotified` | `last_notified` |

### Function Changes
- `loadNotificationSettings()` - Now queries Supabase instead of fetching from blob
- `saveNotificationSettings()` - Now uses upsert to Supabase instead of blob upload
- `updateNotificationAction()` - Now uses upsert to update specific fields

The migration maintains backward compatibility with the existing API while providing better data persistence and querying capabilities. 