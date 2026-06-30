-- v1.4.22.5: make duration-outcome sample learning scope schema-visible.
-- Existing task-completion rows default to project scope; company / industry /
-- global rows must be produced by explicit aggregate evidence jobs.

ALTER TABLE public.duration_experience_samples
  ADD COLUMN IF NOT EXISTS learning_scope TEXT NOT NULL DEFAULT 'project';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_learning_scope_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_learning_scope_check
      CHECK (learning_scope IN ('global', 'industry', 'company', 'project'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_learning_scope_check;

CREATE INDEX IF NOT EXISTS idx_duration_experience_samples_learning_scope
  ON public.duration_experience_samples (
    learning_scope,
    sample_status,
    included_in_benchmark,
    completed_at DESC
  );

COMMENT ON COLUMN public.duration_experience_samples.learning_scope IS
  'Learning layer for duration-outcome evidence. Task-completion rows are project scope; company, industry, and global rows must come from explicit aggregate/shared-baseline evidence jobs, not metadata inference.';
