-- v1.4.22.3: cold-start shared baseline runtime publication state and rollback closure.
-- This patches already-applied algorithm_cold_start_baselines tables; it does not grant
-- standard_work_duration, algorithm seed, company override, or project sample write rights.

BEGIN;

ALTER TABLE public.algorithm_cold_start_baselines
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
  WHERE conrelid = 'public.algorithm_cold_start_baselines'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%runtime_publication_status%'
  LIMIT 1;

  IF status_constraint_name IS NOT NULL
     AND status_constraint_name <> 'algorithm_cold_start_baselines_runtime_publication_status_check' THEN
    EXECUTE format(
      'ALTER TABLE public.algorithm_cold_start_baselines DROP CONSTRAINT %I',
      status_constraint_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.algorithm_cold_start_baselines'::regclass
      AND conname = 'algorithm_cold_start_baselines_runtime_publication_status_check'
  ) THEN
    ALTER TABLE public.algorithm_cold_start_baselines
      ADD CONSTRAINT algorithm_cold_start_baselines_runtime_publication_status_check
      CHECK (runtime_publication_status IN ('candidate', 'canary', 'published', 'runtime_rolled_back'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.algorithm_cold_start_baselines
  VALIDATE CONSTRAINT algorithm_cold_start_baselines_runtime_publication_status_check;

CREATE INDEX IF NOT EXISTS idx_algorithm_cold_start_baselines_runtime_status
  ON public.algorithm_cold_start_baselines(scope_level, segment_key, runtime_publication_status);

COMMENT ON COLUMN public.algorithm_cold_start_baselines.runtime_publication_status IS
  'Cold-start shared baseline runtime state. candidate/canary/published may be considered by gated consumers; runtime_rolled_back must be ignored.';
COMMENT ON COLUMN public.algorithm_cold_start_baselines.rollback_execution IS
  'Cold-start shared baseline rollback execution audit. This field documents rollback only and does not mutate seed, company override, or project sample tables.';
COMMENT ON COLUMN public.algorithm_cold_start_baselines.rolled_back_at IS
  'Timestamp when the cold-start shared baseline runtime publication was marked runtime_rolled_back.';

NOTIFY pgrst, 'reload schema';

COMMIT;
