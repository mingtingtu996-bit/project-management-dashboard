-- Preserve same-day multi-event task snapshot history.

ALTER TABLE IF EXISTS public.task_progress_snapshots
  DROP CONSTRAINT IF EXISTS daily_snapshot;

CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_task_date
  ON public.task_progress_snapshots(task_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_event
  ON public.task_progress_snapshots(task_id, event_type, event_source, snapshot_date DESC);

CREATE OR REPLACE FUNCTION auto_record_progress_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.progress IS DISTINCT FROM OLD.progress THEN
    INSERT INTO task_progress_snapshots (
      task_id,
      progress,
      snapshot_date,
      event_type,
      event_source,
      notes
    )
    VALUES (
      NEW.id,
      NEW.progress,
      CURRENT_DATE,
      'task_update',
      'db_trigger',
      '进度更新: ' || NEW.progress || '%'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
