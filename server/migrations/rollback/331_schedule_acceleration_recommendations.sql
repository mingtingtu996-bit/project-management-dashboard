BEGIN;

ALTER TABLE IF EXISTS public.task_commit_requests
  DROP CONSTRAINT IF EXISTS task_commit_requests_schedule_acceleration_recommendation_fk,
  DROP CONSTRAINT IF EXISTS task_commit_requests_schedule_acceleration_binding_complete,
  DROP COLUMN IF EXISTS recommendation_id,
  DROP COLUMN IF EXISTS recommendation_hash,
  DROP COLUMN IF EXISTS operations_hash;

DROP TRIGGER IF EXISTS schedule_acceleration_recommendations_immutable_trigger
  ON public.schedule_acceleration_recommendations;
DROP FUNCTION IF EXISTS workbuddy_private.reject_schedule_acceleration_recommendation_mutation();
DROP TABLE IF EXISTS public.schedule_acceleration_recommendations;

NOTIFY pgrst, 'reload schema';

COMMIT;
