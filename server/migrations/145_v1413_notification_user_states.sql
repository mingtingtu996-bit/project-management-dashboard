-- 145_v1413_notification_user_states.sql
-- v1.4.13: Per-user notification lifecycle states (read, acknowledged, muted, hidden)
-- Replaces the legacy metadata.personal_states JSON fallback

BEGIN;

CREATE TABLE IF NOT EXISTS notification_user_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  muted_at TIMESTAMPTZ,
  muted_until TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one state row per user per notification
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_user_states
  ON notification_user_states(notification_id, user_id);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_notification_user_states_user_read
  ON notification_user_states(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_user_states_user_muted
  ON notification_user_states(user_id, is_muted);

CREATE INDEX IF NOT EXISTS idx_notification_user_states_user_hidden
  ON notification_user_states(user_id, is_hidden);

CREATE INDEX IF NOT EXISTS idx_notification_user_states_notification
  ON notification_user_states(notification_id, user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notification_user_states_updated_at ON notification_user_states;
CREATE TRIGGER trigger_notification_user_states_updated_at
  BEFORE UPDATE ON notification_user_states
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Backfill from legacy metadata.personal_states
DO $$
DECLARE
  n record;
  state_key text;
  state_value jsonb;
  raw_states jsonb;
BEGIN
  FOR n IN SELECT id, metadata FROM notifications WHERE metadata ? 'personal_states' LOOP
    raw_states := n.metadata->'personal_states';
    FOR state_key, state_value IN SELECT key, value FROM jsonb_each(raw_states) LOOP
      INSERT INTO notification_user_states (notification_id, user_id, is_read, is_muted, is_hidden, read_at)
      VALUES (
        n.id,
        state_key::uuid,
        COALESCE((state_value->>'isRead')::boolean, false),
        COALESCE((state_value->>'isMuted')::boolean, false),
        false,
        CASE WHEN (state_value->>'isRead')::boolean THEN now() ELSE NULL END
      )
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    END LOOP;
  END LOOP;
END
$$;

COMMIT;
