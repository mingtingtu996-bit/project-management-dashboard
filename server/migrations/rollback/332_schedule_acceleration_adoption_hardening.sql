BEGIN;

DROP TRIGGER IF EXISTS task_commit_requests_immutable_evidence_trigger
  ON public.task_commit_requests;
DROP FUNCTION IF EXISTS workbuddy_private.guard_task_commit_request_mutation();

DROP POLICY IF EXISTS task_commit_requests_runtime_read ON public.task_commit_requests;
DROP POLICY IF EXISTS task_commit_requests_runtime_insert ON public.task_commit_requests;
DROP POLICY IF EXISTS task_commit_requests_runtime_complete ON public.task_commit_requests;
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
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_commit_requests TO workbuddy_runtime;

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

DROP TRIGGER IF EXISTS schedule_acceleration_recommendations_immutable_trigger
  ON public.schedule_acceleration_recommendations;
CREATE TRIGGER schedule_acceleration_recommendations_immutable_trigger
BEFORE UPDATE ON public.schedule_acceleration_recommendations
FOR EACH ROW
EXECUTE FUNCTION workbuddy_private.reject_schedule_acceleration_recommendation_mutation();

ALTER TABLE public.schedule_acceleration_recommendations
  DROP CONSTRAINT IF EXISTS schedule_acceleration_recommendations_issued_by_fk;
ALTER TABLE public.schedule_acceleration_recommendations
  ADD CONSTRAINT schedule_acceleration_recommendations_created_by_fk
    FOREIGN KEY (issued_by)
    REFERENCES public.users(id)
    ON UPDATE RESTRICT ON DELETE SET NULL;

ALTER TABLE public.schedule_acceleration_recommendations
  ALTER COLUMN issued_by DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS schedule_acceleration_recommendations_expires_after_issued,
  DROP COLUMN IF EXISTS expires_at;

ALTER INDEX IF EXISTS public.idx_schedule_acceleration_recommendations_project_issued
  RENAME TO idx_schedule_acceleration_recommendations_project_created;

ALTER TABLE public.schedule_acceleration_recommendations
  RENAME COLUMN issued_by TO created_by;
ALTER TABLE public.schedule_acceleration_recommendations
  RENAME COLUMN issued_at TO created_at;

ALTER TABLE public.schedule_acceleration_recommendations
  ALTER COLUMN created_at SET DEFAULT NOW();

NOTIFY pgrst, 'reload schema';

COMMIT;
