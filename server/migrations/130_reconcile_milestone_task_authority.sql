-- 130_reconcile_milestone_task_authority.sql
-- v1.4.9: Milestones are tasks.is_milestone=true rows.
-- Remove old FK to milestones table, enforce self-referencing within tasks.

BEGIN;

-- Drop old FK to deprecated milestones table if exists
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_milestone_id;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_milestone_id_fkey;

-- Create trigger: milestone_id must point to a valid task (same project, is_milestone=true, not cancelled, not self)
CREATE OR REPLACE FUNCTION public.check_task_milestone_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.milestone_id IS NULL THEN RETURN NEW; END IF;
  -- Skip check if milestone_id unchanged from old row
  IF TG_OP = 'UPDATE' AND OLD.milestone_id IS NOT DISTINCT FROM NEW.milestone_id THEN
    RETURN NEW;
  END IF;
  IF NEW.milestone_id = NEW.id THEN
    RAISE EXCEPTION 'Task cannot reference itself as milestone: %', NEW.id;
  END IF;
  PERFORM 1 FROM tasks
    WHERE id = NEW.milestone_id
      AND project_id = NEW.project_id
      AND is_milestone = true
      AND status != 'cancelled'
    LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone_id must reference a same-project active milestone task: %', NEW.milestone_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_task_milestone_reference ON tasks;
CREATE TRIGGER trigger_check_task_milestone_reference
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.milestone_id IS NOT NULL)
  EXECUTE FUNCTION public.check_task_milestone_reference();

-- When a milestone is cancelled, nullify its milestone_id references
CREATE OR REPLACE FUNCTION public.cleanup_milestone_references_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.is_milestone = true THEN
    UPDATE tasks SET milestone_id = NULL WHERE milestone_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_milestone_refs ON tasks;
CREATE TRIGGER trigger_cleanup_milestone_refs
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_milestone_references_on_cancel();

COMMIT;
