-- Create the notification_settings table
CREATE TABLE IF NOT EXISTS notification_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    channel_id TEXT,
    sell_threshold NUMERIC,
    hold_threshold NUMERIC,
    last_action TEXT,
    last_notified TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow all operations (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on notification_settings"
ON notification_settings
FOR ALL
USING (true)
WITH CHECK (true);

-- Create an index on the id column (though it's already the primary key)
CREATE INDEX IF NOT EXISTS idx_notification_settings_id ON notification_settings(id);

-- Insert a default row if none exists
INSERT INTO notification_settings (id, channel_id, sell_threshold, hold_threshold, last_action, last_notified)
VALUES ('default', NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING; 