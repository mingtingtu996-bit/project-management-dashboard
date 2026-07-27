BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 332';
  END IF;
  IF to_regnamespace('workbuddy_private') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private schema is required before applying migration 332';
  END IF;
  IF to_regclass('public.schedule_acceleration_recommendations') IS NULL THEN
    RAISE EXCEPTION 'schedule_acceleration_recommendations table is required before applying migration 332';
  END IF;
  IF to_regclass('public.task_commit_requests') IS NULL THEN
    RAISE EXCEPTION 'task_commit_requests table is required before applying migration 332';
  END IF;
END
$$;

-- BEGIN MIGRATION 332
ALTER TABLE public.schedule_acceleration_recommendations
  RENAME COLUMN created_by TO issued_by;
ALTER TABLE public.schedule_acceleration_recommendations
  RENAME COLUMN created_at TO issued_at;

ALTER INDEX IF EXISTS public.idx_schedule_acceleration_recommendations_project_created
  RENAME TO idx_schedule_acceleration_recommendations_project_issued;

ALTER TABLE public.schedule_acceleration_recommendations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE public.schedule_acceleration_recommendations
   SET expires_at = issued_at + INTERVAL '30 minutes'
 WHERE expires_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.schedule_acceleration_recommendations
     WHERE issued_by IS NULL
        OR expires_at IS NULL
        OR expires_at <= issued_at
  ) THEN
    RAISE EXCEPTION 'migration 332 cannot harden invalid schedule acceleration recommendation identity or expiry';
  END IF;
END
$$;

ALTER TABLE public.schedule_acceleration_recommendations
  ALTER COLUMN issued_by SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.schedule_acceleration_recommendations
  DROP CONSTRAINT IF EXISTS schedule_acceleration_recommendations_expires_after_issued,
  ADD CONSTRAINT schedule_acceleration_recommendations_expires_after_issued
    CHECK (expires_at > issued_at) NOT VALID;
ALTER TABLE public.schedule_acceleration_recommendations
  VALIDATE CONSTRAINT schedule_acceleration_recommendations_expires_after_issued;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT c.conname
    INTO constraint_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = 'public.schedule_acceleration_recommendations'::regclass
     AND c.contype = 'f'
     AND a.attname = 'issued_by'
   LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.schedule_acceleration_recommendations DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END
$$;

ALTER TABLE public.schedule_acceleration_recommendations
  ADD CONSTRAINT schedule_acceleration_recommendations_issued_by_fk
    FOREIGN KEY (issued_by)
    REFERENCES public.users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT;

DROP TRIGGER IF EXISTS schedule_acceleration_recommendations_immutable_trigger
  ON public.schedule_acceleration_recommendations;
CREATE TRIGGER schedule_acceleration_recommendations_immutable_trigger
BEFORE UPDATE OR DELETE ON public.schedule_acceleration_recommendations
FOR EACH ROW
EXECUTE FUNCTION workbuddy_private.reject_schedule_acceleration_recommendation_mutation();

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
    ON UPDATE RESTRICT ON DELETE RESTRICT
    NOT VALID;
ALTER TABLE public.task_commit_requests
  VALIDATE CONSTRAINT task_commit_requests_schedule_acceleration_recommendation_fk;

CREATE OR REPLACE FUNCTION workbuddy_private.guard_task_commit_request_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'task commit request evidence cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (
    OLD.status = 'running'
    AND NEW.status = 'succeeded'
    AND NEW.completed_at IS NOT NULL
    AND (to_jsonb(NEW) - ARRAY['status', 'result_summary', 'completed_at', 'updated_at'])
      = (to_jsonb(OLD) - ARRAY['status', 'result_summary', 'completed_at', 'updated_at'])
  ) THEN
    RAISE EXCEPTION 'task commit request evidence only permits running to succeeded completion'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS task_commit_requests_immutable_evidence_trigger
  ON public.task_commit_requests;
CREATE TRIGGER task_commit_requests_immutable_evidence_trigger
BEFORE UPDATE OR DELETE ON public.task_commit_requests
FOR EACH ROW
EXECUTE FUNCTION workbuddy_private.guard_task_commit_request_mutation();

REVOKE ALL ON FUNCTION workbuddy_private.guard_task_commit_request_mutation()
  FROM PUBLIC, anon, authenticated, workbuddy_runtime;

DROP POLICY IF EXISTS task_commit_requests_runtime_policy ON public.task_commit_requests;
DROP POLICY IF EXISTS task_commit_requests_runtime_read ON public.task_commit_requests;
DROP POLICY IF EXISTS task_commit_requests_runtime_insert ON public.task_commit_requests;
DROP POLICY IF EXISTS task_commit_requests_runtime_complete ON public.task_commit_requests;

CREATE POLICY task_commit_requests_runtime_read
ON public.task_commit_requests
FOR SELECT
TO workbuddy_runtime
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

CREATE POLICY task_commit_requests_runtime_insert
ON public.task_commit_requests
FOR INSERT
TO workbuddy_runtime
WITH CHECK (
  (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  AND status = 'running'
);

CREATE POLICY task_commit_requests_runtime_complete
ON public.task_commit_requests
FOR UPDATE
TO workbuddy_runtime
USING (
  (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  AND status = 'running'
)
WITH CHECK (
  (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  AND status = 'succeeded'
);

REVOKE DELETE ON TABLE public.task_commit_requests FROM workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.task_commit_requests TO workbuddy_runtime;

COMMENT ON COLUMN public.schedule_acceleration_recommendations.issued_by IS
  'User identity that received this immutable server-issued recommendation.';
COMMENT ON COLUMN public.schedule_acceleration_recommendations.issued_at IS
  'Server timestamp at which this immutable recommendation was issued.';
COMMENT ON COLUMN public.schedule_acceleration_recommendations.expires_at IS
  'Exclusive expiry boundary after which this recommendation cannot be committed or adopted.';
-- END MIGRATION 332

NOTIFY pgrst, 'reload schema';

COMMIT;
