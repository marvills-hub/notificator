CREATE TABLE gmail_connections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firebase_uid TEXT NOT NULL,
  gmail_account_id TEXT NOT NULL,
  email_address TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(firebase_uid, gmail_account_id),
  UNIQUE(firebase_uid, email_address)
);

INSERT INTO gmail_connections_new (
  firebase_uid,
  gmail_account_id,
  email_address,
  refresh_token,
  is_primary
)
SELECT
  firebase_uid,
  firebase_uid,
  'unknown',
  refresh_token,
  1
FROM gmail_connections;

DROP TABLE gmail_connections;

ALTER TABLE gmail_connections_new
RENAME TO gmail_connections;

CREATE INDEX idx_gmail_connections_firebase_uid
ON gmail_connections(firebase_uid);

CREATE INDEX idx_gmail_connections_account
ON gmail_connections(firebase_uid, gmail_account_id);