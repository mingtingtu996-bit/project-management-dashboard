-- Preserve notifications when their source task has already been deleted.
-- The immutable pre-apply backup is required because this migration retires
-- dangling references and resolves warning rows in place.

BEGIN;

LOCK TABLE public.tasks IN SHARE MODE;
LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  backup_sha256 TEXT := current_setting('workbuddy.notification_task_reference_retirement_backup_sha256', true);
  expected_fingerprint TEXT := current_setting('workbuddy.notification_task_reference_retirement_data_fingerprint', true);
  actual_fingerprint TEXT;
BEGIN
  IF backup_sha256 IS NULL OR backup_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'notification_task_reference_retirement_backup_required';
  END IF;
  IF expected_fingerprint IS NULL OR expected_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'notification_task_reference_retirement_fingerprint_required';
  END IF;

  WITH captured AS (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(notification_row) ORDER BY notification_row.id),
      '[]'::jsonb
    ) AS snapshot
    FROM public.notifications notification_row
    LEFT JOIN public.tasks task_row
      ON task_row.id::text = notification_row.task_id::text
    WHERE notification_row.task_id IS NOT NULL
      AND task_row.id IS NULL
  )
  SELECT encode(
           digest(convert_to(snapshot::text, 'UTF8'), 'sha256'),
           'hex'
         )
    INTO actual_fingerprint
    FROM captured;

  IF actual_fingerprint <> expected_fingerprint THEN
    RAISE EXCEPTION 'notification_task_reference_retirement_data_changed_after_backup';
  END IF;
END
$$;

WITH orphaned AS (
  SELECT notification_row.id
  FROM public.notifications notification_row
  LEFT JOIN public.tasks task_row
    ON task_row.id::text = notification_row.task_id::text
  WHERE notification_row.task_id IS NOT NULL
    AND task_row.id IS NULL
)
UPDATE public.notifications notification_row
SET
  warning_lifecycle_status = 'resolved',
  status = 'resolved',
  resolved_source = 'source_deleted',
  resolved_at = COALESCE(notification_row.resolved_at, transaction_timestamp()),
  updated_at = transaction_timestamp()
FROM orphaned
WHERE notification_row.id = orphaned.id
  AND notification_row.source_entity_type = 'warning';

WITH orphaned AS (
  SELECT notification_row.id
  FROM public.notifications notification_row
  LEFT JOIN public.tasks task_row
    ON task_row.id::text = notification_row.task_id::text
  WHERE notification_row.task_id IS NOT NULL
    AND task_row.id IS NULL
)
UPDATE public.notifications notification_row
SET
  metadata = jsonb_set(
    CASE
      WHEN jsonb_typeof(COALESCE(notification_row.metadata, '{}'::jsonb)) = 'object'
        THEN COALESCE(notification_row.metadata, '{}'::jsonb)
      ELSE jsonb_build_object('legacy_metadata', notification_row.metadata)
    END,
    '{retired_task_reference}',
    jsonb_build_object(
      'task_id', notification_row.task_id::text,
      'retired_at', transaction_timestamp(),
      'reason', 'source_deleted'
    ),
    true
  ),
  updated_at = transaction_timestamp(),
  task_id = NULL
FROM orphaned
WHERE notification_row.id = orphaned.id;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_task_id_fkey;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_task_id_fkey
  FOREIGN KEY (task_id)
  REFERENCES public.tasks(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_task_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notifications notification_row
    LEFT JOIN public.tasks task_row
      ON task_row.id::text = notification_row.task_id::text
    WHERE notification_row.task_id IS NOT NULL
      AND task_row.id IS NULL
  ) THEN
    RAISE EXCEPTION 'notification_task_reference_retirement_postcondition_failed';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
