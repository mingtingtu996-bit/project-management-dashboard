-- Durable, stage-level recovery for the duration-context policy learning sweep.
-- The service role owns writes. Client roles must not read or mutate job internals.

CREATE TABLE IF NOT EXISTS public.duration_context_policy_learning_checkpoints (
  operation_id TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  stage_status TEXT NOT NULL CHECK (stage_status IN ('running', 'succeeded', 'failed')),
  input_hash TEXT NOT NULL,
  output_hash TEXT,
  output_payload JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  error_message TEXT,
  operation_identity JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operation_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_learning_checkpoint_status
  ON public.duration_context_policy_learning_checkpoints (stage_status, lease_expires_at);

ALTER TABLE public.duration_context_policy_learning_checkpoints ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_context_policy_learning_checkpoints FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_context_policy_learning_checkpoints TO service_role;

COMMENT ON TABLE public.duration_context_policy_learning_checkpoints IS
  'Durable operation/stage checkpoints for idempotent duration-context policy learning retries.';
COMMENT ON COLUMN public.duration_context_policy_learning_checkpoints.operation_id IS
  'Stable digest of scheduled window, project scope, input fact digest, and learner version.';
COMMENT ON COLUMN public.duration_context_policy_learning_checkpoints.output_hash IS
  'SHA-256 of canonical output_payload; retries reject mismatched persisted output.';
