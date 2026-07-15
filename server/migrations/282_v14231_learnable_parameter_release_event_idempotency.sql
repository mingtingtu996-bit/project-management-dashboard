-- Idempotency boundary for publication, monitoring, and rollback events emitted by
-- durable learning operations. Historical events remain nullable and unchanged.

ALTER TABLE public.algorithm_learnable_parameter_release_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_learnable_parameter_release_event_idempotency
  ON public.algorithm_learnable_parameter_release_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.algorithm_learnable_parameter_release_events.idempotency_key IS
  'Stable operation/stage/effect key; retries do not create duplicate publication, monitoring, or rollback events.';
