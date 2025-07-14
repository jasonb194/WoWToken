-- Migration to add message_id and current_price columns to notification_settings table
-- Run this if you have an existing notification_settings table without these columns

-- Add the new columns
ALTER TABLE notification_settings 
ADD COLUMN IF NOT EXISTS message_id TEXT,
ADD COLUMN IF NOT EXISTS current_price NUMERIC;

-- Create an index on message_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_notification_settings_message_id ON notification_settings(message_id);

-- Optional: Add a comment to document the new columns
COMMENT ON COLUMN notification_settings.message_id IS 'Discord message ID for editing existing alerts';
COMMENT ON COLUMN notification_settings.current_price IS 'Current WoW Token price for change detection'; 