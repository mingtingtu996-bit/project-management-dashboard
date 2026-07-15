-- v1.4.15+ retention confirmation hardening.
-- Raw decision tokens are returned to the user once, then stored as hashes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE deletion_retention_events
  ADD COLUMN IF NOT EXISTS decision_token_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS token_hash_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_action_result JSONB NULL,
  ADD COLUMN IF NOT EXISTS confirmation_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ NULL;

UPDATE deletion_retention_events
SET decision_token_hash = encode(digest(decision_token, 'sha256'), 'hex'),
    token_hash_version = 'sha256'
WHERE decision_token IS NOT NULL
  AND decision_token_hash IS NULL;

UPDATE deletion_retention_events
SET decision_token = NULL
WHERE decision_token IS NOT NULL;

DROP INDEX IF EXISTS idx_retention_events_token;

ALTER TABLE deletion_retention_events
  DROP COLUMN IF EXISTS decision_token;

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_events_token_hash
  ON deletion_retention_events(decision_token_hash)
  WHERE decision_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_retention_events_pending_expiry
  ON deletion_retention_events(expires_at)
  WHERE execution_status = 'pending_confirmation'
    AND expires_at IS NOT NULL;
