ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_to_risk_id UUID,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notifications_warning_chain_id
  ON public.notifications (chain_id)
  WHERE chain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_warning_source_signature
  ON public.notifications (source_entity_type, source_entity_id)
  WHERE source_entity_type = 'warning';

CREATE INDEX IF NOT EXISTS idx_notifications_warning_status
  ON public.notifications (status, source_entity_type)
  WHERE source_entity_type = 'warning';
