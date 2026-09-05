CREATE TABLE IF NOT EXISTS gmail_connections (
    firebase_uid TEXT PRIMARY KEY,
    refresh_token TEXT NOT NULL,
    email_address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
