BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 331';
  END IF;
  IF to_regnamespace('workbuddy_private') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private schema is required before applying migration 331';
  END IF;
  IF to_regclass('public.task_commit_requests') IS NULL THEN
    RAISE EXCEPTION 'task_commit_requests table is required before applying migration 331';
  END IF;
END
$$;

-- BEGIN MIGRATION 331
CREATE TABLE IF NOT EXISTS public.schedule_acceleration_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  recommendation JSONB NOT NULL CHECK (jsonb_typeof(recommendation) = 'object'),
  operations JSONB NOT NULL CHECK (jsonb_typeof(operations) = 'array'),
  recommendation_hash TEXT NOT NULL CHECK (recommendation_hash ~ '^[a-f0-9]{64}$'),
  operations_hash TEXT NOT NULL CHECK (operations_hash ~ '^[a-f0-9]{64}$'),
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, id, recommendation_hash, operations_hash)
);

CREATE INDEX IF NOT EXISTS idx_schedule_acceleration_recommendations_project_created
  ON public.schedule_acceleration_recommendations (project_id, created_at DESC, id);

CREATE OR REPLACE FUNCTION workbuddy_private.reject_schedule_acceleration_recommendation_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'schedule acceleration recommendations are immutable'
    USING ERRCODE = '55000';
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS schedule_acceleration_recommendations_immutable_trigger
  ON public.schedule_acceleration_recommendations;
CREATE TRIGGER schedule_acceleration_recommendations_immutable_trigger
BEFORE UPDATE ON public.schedule_acceleration_recommendations
FOR EACH ROW
EXECUTE FUNCTION workbuddy_private.reject_schedule_acceleration_recommendation_mutation();

REVOKE ALL ON FUNCTION workbuddy_private.reject_schedule_acceleration_recommendation_mutation()
  FROM PUBLIC, anon, authenticated, workbuddy_runtime;

ALTER TABLE public.schedule_acceleration_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_acceleration_recommendations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.schedule_acceleration_recommendations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.schedule_acceleration_recommendations TO workbuddy_runtime;

DROP POLICY IF EXISTS schedule_acceleration_recommendations_runtime_read
  ON public.schedule_acceleration_recommendations;
CREATE POLICY schedule_acceleration_recommendations_runtime_read
  ON public.schedule_acceleration_recommendations
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS schedule_acceleration_recommendations_runtime_insert
  ON public.schedule_acceleration_recommendations;
CREATE POLICY schedule_acceleration_recommendations_runtime_insert
  ON public.schedule_acceleration_recommendations
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

ALTER TABLE public.task_commit_requests
  ADD COLUMN IF NOT EXISTS recommendation_id UUID NULL,
  ADD COLUMN IF NOT EXISTS recommendation_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS operations_hash TEXT NULL;

ALTER TABLE public.task_commit_requests
  DROP CONSTRAINT IF EXISTS task_commit_requests_schedule_acceleration_binding_complete,
  ADD CONSTRAINT task_commit_requests_schedule_acceleration_binding_complete
    CHECK (
      (
        recommendation_id IS NULL
        AND recommendation_hash IS NULL
        AND operations_hash IS NULL
      )
      OR (
        recommendation_id IS NOT NULL
        AND recommendation_hash IS NOT NULL
        AND operations_hash IS NOT NULL
      )
    ) NOT VALID;

ALTER TABLE public.task_commit_requests
  VALIDATE CONSTRAINT task_commit_requests_schedule_acceleration_binding_complete;

ALTER TABLE public.task_commit_requests
  DROP CONSTRAINT IF EXISTS task_commit_requests_schedule_acceleration_recommendation_fk,
  ADD CONSTRAINT task_commit_requests_schedule_acceleration_recommendation_fk
    FOREIGN KEY (
      project_id,
      recommendation_id,
      recommendation_hash,
      operations_hash
    )
    REFERENCES public.schedule_acceleration_recommendations
      (project_id, id, recommendation_hash, operations_hash)
    ON UPDATE RESTRICT ON DELETE CASCADE
    NOT VALID;

ALTER TABLE public.task_commit_requests
  VALIDATE CONSTRAINT task_commit_requests_schedule_acceleration_recommendation_fk;

COMMENT ON TABLE public.schedule_acceleration_recommendations IS
  'Append-only schedule acceleration recommendation and task-operation snapshots awaiting explicit user acceptance.';
COMMENT ON COLUMN public.task_commit_requests.recommendation_id IS
  'Optional immutable schedule acceleration recommendation accepted by this atomic task commit.';
COMMENT ON COLUMN public.task_commit_requests.recommendation_hash IS
  'SHA-256 identity of the immutable recommendation snapshot bound to this commit.';
COMMENT ON COLUMN public.task_commit_requests.operations_hash IS
  'SHA-256 identity of the exact task operations bound to the immutable recommendation.';
-- END MIGRATION 331

NOTIFY pgrst, 'reload schema';

COMMIT;
