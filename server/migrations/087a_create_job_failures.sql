BEGIN;

CREATE TABLE IF NOT EXISTS public.job_failures (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  job_id TEXT,
  triggered_by TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  error_message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_failures_job_name
  ON public.job_failures(job_name);

CREATE INDEX IF NOT EXISTS idx_job_failures_failed_at
  ON public.job_failures(failed_at DESC);

COMMIT;
