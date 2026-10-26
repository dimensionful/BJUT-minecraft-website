CREATE TABLE IF NOT EXISTS votes (
  poll_id TEXT NOT NULL,
  voter_id TEXT NOT NULL,
  options TEXT NOT NULL,
  custom_version TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (poll_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_poll_id ON votes (poll_id);
