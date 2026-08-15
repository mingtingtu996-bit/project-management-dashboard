-- Preserve historical notifications while retiring references to deleted projects.

BEGIN;

LOCK TABLE public.projects IN SHARE MODE;
LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;

WITH orphaned AS (
  SELECT notification_row.id
  FROM public.notifications notification_row
  LEFT JOIN public.projects project_row
    ON project_row.id = notification_row.project_id
  WHERE notification_row.project_id IS NOT NULL
    AND project_row.id IS NULL
)
UPDATE public.notifications notification_row
SET
  metadata = jsonb_set(
    CASE
      WHEN jsonb_typeof(COALESCE(notification_row.metadata, '{}'::jsonb)) = 'object'
        THEN COALESCE(notification_row.metadata, '{}'::jsonb)
      ELSE jsonb_build_object('legacy_metadata', notification_row.metadata)
    END,
    '{retired_project_reference}',
    jsonb_build_object(
      'project_id', notification_row.project_id::text,
      'retired_at', transaction_timestamp(),
      'reason', 'source_project_deleted',
      'previous_lifecycle_status', notification_row.lifecycle_status,
      'previous_status', notification_row.status,
      'previous_is_broadcast', notification_row.is_broadcast,
      'previous_warning_lifecycle_status', notification_row.warning_lifecycle_status,
      'previous_resolved_source', notification_row.resolved_source,
      'previous_resolved_at', notification_row.resolved_at
    ),
    true
  ),
  lifecycle_status = 'archived',
  status = 'archived',
  is_broadcast = FALSE,
  warning_lifecycle_status = CASE
    WHEN notification_row.source_entity_type = 'warning' THEN 'resolved'
    ELSE notification_row.warning_lifecycle_status
  END,
  resolved_source = 'source_project_deleted',
  resolved_at = COALESCE(notification_row.resolved_at, transaction_timestamp()),
  updated_at = transaction_timestamp(),
  project_id = NULL
FROM orphaned
WHERE notification_row.id = orphaned.id;

CREATE OR REPLACE FUNCTION public.retire_notifications_before_project_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.notifications notification_row
  SET
    metadata = jsonb_set(
      CASE
        WHEN jsonb_typeof(COALESCE(notification_row.metadata, '{}'::jsonb)) = 'object'
          THEN COALESCE(notification_row.metadata, '{}'::jsonb)
        ELSE jsonb_build_object('legacy_metadata', notification_row.metadata)
      END,
      '{retired_project_reference}',
      jsonb_build_object(
        'project_id', OLD.id::text,
        'retired_at', transaction_timestamp(),
        'reason', 'source_project_deleted',
        'previous_lifecycle_status', notification_row.lifecycle_status,
        'previous_status', notification_row.status,
        'previous_is_broadcast', notification_row.is_broadcast,
        'previous_warning_lifecycle_status', notification_row.warning_lifecycle_status,
        'previous_resolved_source', notification_row.resolved_source,
        'previous_resolved_at', notification_row.resolved_at
      ),
      true
    ),
    lifecycle_status = 'archived',
    status = 'archived',
    is_broadcast = FALSE,
    warning_lifecycle_status = CASE
      WHEN notification_row.source_entity_type = 'warning' THEN 'resolved'
      ELSE notification_row.warning_lifecycle_status
    END,
    resolved_source = 'source_project_deleted',
    resolved_at = COALESCE(notification_row.resolved_at, transaction_timestamp()),
    updated_at = transaction_timestamp(),
    project_id = NULL
  WHERE notification_row.project_id = OLD.id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.retire_notifications_before_project_delete() FROM PUBLIC;

DROP TRIGGER IF EXISTS trigger_retire_notifications_before_project_delete
  ON public.projects;
CREATE TRIGGER trigger_retire_notifications_before_project_delete
  BEFORE DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.retire_notifications_before_project_delete();

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_project_id_fkey;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_project_id_fkey
  FOREIGN KEY (project_id)
  REFERENCES public.projects(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_project_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notifications notification_row
    LEFT JOIN public.projects project_row
      ON project_row.id = notification_row.project_id
    WHERE notification_row.project_id IS NOT NULL
      AND project_row.id IS NULL
  ) THEN
    RAISE EXCEPTION 'notification_project_reference_retirement_postcondition_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.notifications'::regclass
      AND constraint_row.conname = 'notifications_project_id_fkey'
      AND constraint_row.contype = 'f'
      AND constraint_row.confdeltype = 'n'
      AND constraint_row.convalidated = TRUE
  ) THEN
    RAISE EXCEPTION 'notification_project_reference_foreign_key_readback_failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trigger_row
    WHERE trigger_row.tgrelid = 'public.projects'::regclass
      AND trigger_row.tgname = 'trigger_retire_notifications_before_project_delete'
      AND trigger_row.tgisinternal = FALSE
  ) THEN
    RAISE EXCEPTION 'notification_project_reference_retirement_trigger_readback_failed';
  END IF;

  RAISE NOTICE 'MIGRATION_339_NOTIFICATION_PROJECT_REFERENCE_RETIREMENT_READBACK_COMPLETE';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
