-- Durable task batch updates. Accepted HTTP 202 work must survive process restarts
-- and expose per-task outcomes instead of running from an in-memory timer.

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_batch_update_jobs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_batch_update_jobs_idempotency_key_nonempty
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT task_batch_update_jobs_request_hash_nonempty
    CHECK (btrim(request_hash) <> ''),
  CONSTRAINT task_batch_update_jobs_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'partial_failed', 'failed')),
  CONSTRAINT task_batch_update_jobs_counts_check
    CHECK (
      accepted_count >= 0
      AND succeeded_count >= 0
      AND failed_count >= 0
      AND succeeded_count + failed_count <= accepted_count
    ),
  UNIQUE (project_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.task_batch_update_items (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.task_batch_update_jobs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  expected_version INTEGER NOT NULL,
  target_patch JSONB NOT NULL,
  result_version INTEGER NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_batch_update_items_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'conflict')),
  CONSTRAINT task_batch_update_items_expected_version_check
    CHECK (expected_version >= 0),
  UNIQUE (job_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_batch_update_jobs_claim
  ON public.task_batch_update_jobs(status, lease_expires_at, created_at)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_task_batch_update_items_claim
  ON public.task_batch_update_items(job_id, status, lease_expires_at, created_at)
  WHERE status IN ('pending', 'running');

ALTER TABLE public.task_batch_update_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_batch_update_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_batch_update_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_batch_update_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.task_batch_update_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.task_batch_update_items FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS task_batch_update_jobs_runtime_policy ON public.task_batch_update_jobs;
CREATE POLICY task_batch_update_jobs_runtime_policy
ON public.task_batch_update_jobs
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

DROP POLICY IF EXISTS task_batch_update_items_runtime_policy ON public.task_batch_update_items;
CREATE POLICY task_batch_update_items_runtime_policy
ON public.task_batch_update_items
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_batch_update_jobs TO workbuddy_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_batch_update_items TO workbuddy_runtime;
  END IF;
END $$;

COMMENT ON TABLE public.task_batch_update_jobs IS
  'Durable API jobs for task batch updates; one row per idempotent accepted request.';
COMMENT ON TABLE public.task_batch_update_items IS
  'Per-task absolute target patches and visible outcomes for a durable batch update job.';

COMMIT;
