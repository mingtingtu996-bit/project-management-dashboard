BEGIN;

UPDATE public.task_progress_snapshots
SET
  event_type = COALESCE(NULLIF(BTRIM(event_type), ''), 'task_update'),
  event_source = COALESCE(NULLIF(BTRIM(event_source), ''), CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY task_id, snapshot_date, event_type, event_source
      ORDER BY created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.task_progress_snapshots
)
DELETE FROM public.task_progress_snapshots
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
);

ALTER TABLE public.task_progress_snapshots
  ALTER COLUMN event_type SET DEFAULT 'task_update',
  ALTER COLUMN event_source SET DEFAULT 'system_auto';

ALTER TABLE public.task_progress_snapshots
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN event_source SET NOT NULL;

DROP INDEX IF EXISTS idx_task_progress_snapshots_event;

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_progress_snapshots_daily_event
  ON public.task_progress_snapshots(task_id, snapshot_date, event_type, event_source);

CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_event
  ON public.task_progress_snapshots(task_id, event_type, event_source, snapshot_date DESC);

COMMIT;
