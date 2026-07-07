-- Schema for MotivateBot database

-- Table for tracking bot users and their preferences
CREATE TABLE IF NOT EXISTS users (
    telegram_id BIGINT PRIMARY KEY,
    username VARCHAR(255),
    first_name VARCHAR(255),
    language_code VARCHAR(10) DEFAULT 'ru',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    timezone_offset INTEGER DEFAULT 3, -- UTC offset in hours, default is +3 (Moscow/Istanbul)
    next_notification_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for tracking sent quotes (for analytics and history)
CREATE TABLE IF NOT EXISTS sent_quotes (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
    quote TEXT NOT NULL,
    language_code VARCHAR(10) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_users_next_notification ON users(next_notification_at) WHERE notifications_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_sent_quotes_telegram_id ON sent_quotes(telegram_id);
CREATE INDEX IF NOT EXISTS idx_sent_quotes_sent_at ON sent_quotes(sent_at);
