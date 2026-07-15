-- v1.4.22.3: forecast residual overlay runtime publication state and rollback closure.
-- This patches already-applied duration_forecast_residual_overlays tables; it does not grant
-- standard_work_duration, algorithm seed, or business fact write rights.

BEGIN;

ALTER TABLE public.duration_forecast_residual_overlays
  ADD COLUMN IF NOT EXISTS runtime_publication_status TEXT NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS rollback_execution JSONB NULL,
  ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ NULL;

DO $$
DECLARE
  status_constraint_name TEXT;
BEGIN
  SELECT conname
    INTO status_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.duration_forecast_residual_overlays'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%runtime_publication_status%'
  LIMIT 1;

  IF status_constraint_name IS NOT NULL
     AND status_constraint_name <> 'duration_forecast_residual_overlays_runtime_publication_status_check' THEN
    EXECUTE format(
      'ALTER TABLE public.duration_forecast_residual_overlays DROP CONSTRAINT %I',
      status_constraint_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.duration_forecast_residual_overlays'::regclass
      AND conname = 'duration_forecast_residual_overlays_runtime_publication_status_check'
  ) THEN
    ALTER TABLE public.duration_forecast_residual_overlays
      ADD CONSTRAINT duration_forecast_residual_overlays_runtime_publication_status_check
      CHECK (runtime_publication_status IN ('candidate', 'canary', 'published', 'runtime_rolled_back'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.duration_forecast_residual_overlays
  VALIDATE CONSTRAINT duration_forecast_residual_overlays_runtime_publication_status_check;

CREATE INDEX IF NOT EXISTS idx_duration_forecast_residual_overlays_runtime_status
  ON public.duration_forecast_residual_overlays(scope_level, company_id, project_id, runtime_publication_status);

COMMENT ON COLUMN public.duration_forecast_residual_overlays.runtime_publication_status IS
  'Forecast residual overlay runtime state. candidate/canary/published may be considered by gated consumers; runtime_rolled_back must be ignored.';
COMMENT ON COLUMN public.duration_forecast_residual_overlays.rollback_execution IS
  'Overlay-specific rollback execution audit. This field documents rollback only and does not mutate seed or task fact tables.';
COMMENT ON COLUMN public.duration_forecast_residual_overlays.rolled_back_at IS
  'Timestamp when the forecast residual overlay runtime publication was marked runtime_rolled_back.';

NOTIFY pgrst, 'reload schema';

COMMIT;
