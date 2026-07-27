-- Idempotency ledger for atomic task-list commits. The reservation and final
-- replay summary are written in the same transaction as the task mutations.

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_commit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_commit_requests_request_id_nonempty
    CHECK (btrim(request_id) <> ''),
  CONSTRAINT task_commit_requests_request_hash_nonempty
    CHECK (btrim(request_hash) <> ''),
  CONSTRAINT task_commit_requests_status_check
    CHECK (status IN ('running', 'succeeded')),
  UNIQUE (project_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_task_commit_requests_project_created
  ON public.task_commit_requests(project_id, created_at DESC);

ALTER TABLE public.task_commit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_commit_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.task_commit_requests FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS task_commit_requests_runtime_policy ON public.task_commit_requests;
CREATE POLICY task_commit_requests_runtime_policy
ON public.task_commit_requests
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
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_commit_requests TO workbuddy_runtime;
  END IF;
END $$;

COMMENT ON TABLE public.task_commit_requests IS
  'Tenant-scoped idempotency ledger and replay summary for atomic task-list commits.';

COMMIT;
