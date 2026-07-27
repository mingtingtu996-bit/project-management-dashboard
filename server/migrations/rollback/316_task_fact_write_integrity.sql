-- Roll back migration 316. This intentionally restores the retired database
-- snapshot writer and removes reconcile rollback execution metadata.

BEGIN;

CREATE OR REPLACE FUNCTION public.auto_record_progress_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.progress IS DISTINCT FROM OLD.progress THEN
    INSERT INTO public.task_progress_snapshots (
      task_id,
      progress,
      snapshot_date,
      event_type,
      event_source,
      notes,
      status,
      conditions_met_count,
      conditions_total_count,
      obstacles_active_count,
      recorded_by,
      is_auto_generated,
      planning_source_type,
      created_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.progress, 0),
      COALESCE(NEW.updated_at::date, CURRENT_DATE),
      'task_update',
      'db_trigger',
      'Progress updated: ' || COALESCE(NEW.progress, 0) || '%',
      COALESCE(NEW.status, 'todo'),
      COALESCE(NEW.conditions_met_count, 0),
      COALESCE(NEW.conditions_total_count, 0),
      COALESCE(NEW.obstacles_active_count, 0),
      COALESCE(NEW.updated_by, NEW.created_by, OLD.updated_by, OLD.created_by),
      TRUE,
      'execution',
      COALESCE(NEW.updated_at, NOW())
    )
    ON CONFLICT (task_id, snapshot_date, event_type, event_source)
    DO UPDATE SET
      progress = EXCLUDED.progress,
      notes = EXCLUDED.notes,
      status = EXCLUDED.status,
      conditions_met_count = EXCLUDED.conditions_met_count,
      conditions_total_count = EXCLUDED.conditions_total_count,
      obstacles_active_count = EXCLUDED.obstacles_active_count,
      recorded_by = COALESCE(EXCLUDED.recorded_by, public.task_progress_snapshots.recorded_by),
      is_auto_generated = EXCLUDED.is_auto_generated,
      planning_source_type = COALESCE(EXCLUDED.planning_source_type, public.task_progress_snapshots.planning_source_type);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_record_snapshot ON public.tasks;
CREATE TRIGGER trigger_auto_record_snapshot
  AFTER UPDATE OF progress ON public.tasks
  FOR EACH ROW
  WHEN (NEW.progress IS NOT NULL)
  EXECUTE FUNCTION public.auto_record_progress_snapshot();

DROP INDEX IF EXISTS public.idx_task_reconcile_backups_rollback_state;

ALTER TABLE public.task_reconcile_backups
  DROP COLUMN IF EXISTS rollback_result,
  DROP COLUMN IF EXISTS rolled_back_by,
  DROP COLUMN IF EXISTS rolled_back_at;

COMMIT;
