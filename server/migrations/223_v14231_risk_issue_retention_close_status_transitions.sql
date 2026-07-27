-- 223_v14231_risk_issue_retention_close_status_transitions.sql
-- Backfill lifecycle transition edges used by retention-close write paths.

BEGIN;

ALTER TABLE public.status_transitions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

INSERT INTO public.status_transitions (
  domain_key,
  from_status,
  to_status,
  dictionary_version,
  is_active
)
VALUES
  ('risk.lifecycle', 'identified', 'closed', 'v1.4.5', true),
  ('issue.lifecycle', 'open', 'closed', 'v1.4.5', true),
  ('issue.lifecycle', 'investigating', 'closed', 'v1.4.5', true)
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO UPDATE
SET dictionary_version = EXCLUDED.dictionary_version,
    is_active = true,
    updated_at = NOW();

COMMIT;
