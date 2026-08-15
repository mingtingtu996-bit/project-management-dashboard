-- Remove the project-reference boundary and restore links only when the project exists again.

BEGIN;

LOCK TABLE public.projects IN SHARE MODE;
LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;

DROP TRIGGER IF EXISTS trigger_retire_notifications_before_project_delete
  ON public.projects;
DROP FUNCTION IF EXISTS public.retire_notifications_before_project_delete();

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_project_id_fkey;

WITH restorable AS (
  SELECT
    notification_row.id AS notification_id,
    project_row.id AS project_id
  FROM public.notifications notification_row
  JOIN public.projects project_row
    ON project_row.id::text = notification_row.metadata -> 'retired_project_reference' ->> 'project_id'
  WHERE notification_row.project_id IS NULL
    AND notification_row.metadata ? 'retired_project_reference'
)
UPDATE public.notifications notification_row
SET
  project_id = restorable.project_id,
  updated_at = transaction_timestamp()
FROM restorable
WHERE notification_row.id = restorable.notification_id;

DO $$
BEGIN
  RAISE NOTICE 'MIGRATION_339_NOTIFICATION_PROJECT_REFERENCE_RETIREMENT_ROLLBACK_COMPLETE';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
