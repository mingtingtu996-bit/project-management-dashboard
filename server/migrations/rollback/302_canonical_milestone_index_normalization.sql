-- Rollback migration 302 to the index layout produced by migration 301.

BEGIN;

DROP INDEX IF EXISTS public.idx_tasks_milestone_id;
CREATE INDEX idx_tasks_milestone_id
  ON public.tasks(milestone_id)
  WHERE milestone_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_task_baseline_items_source_milestone_id;
CREATE INDEX idx_task_baseline_items_canonical_source_milestone_id
  ON public.task_baseline_items(source_milestone_id);

COMMIT;
