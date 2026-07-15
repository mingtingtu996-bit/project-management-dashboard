-- Durable idempotency boundary for stable-duration-publication baseline drafts.

CREATE TABLE IF NOT EXISTS public.duration_asset_baseline_revision_operations (
  idempotency_key TEXT PRIMARY KEY,
  operation_status TEXT NOT NULL CHECK (operation_status IN ('running', 'succeeded', 'failed')),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  operation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  operation_result JSONB,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duration_asset_baseline_revision_operation_status
  ON public.duration_asset_baseline_revision_operations (operation_status, lease_expires_at);

ALTER TABLE public.duration_asset_baseline_revision_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_asset_baseline_revision_operations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_asset_baseline_revision_operations TO service_role;

COMMENT ON TABLE public.duration_asset_baseline_revision_operations IS
  'One durable operation per stable duration publication and confirmed baseline; results are draft-only and require PM confirmation.';
