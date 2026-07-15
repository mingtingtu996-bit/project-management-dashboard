-- Migration 302: make canonical milestone reference index names and definitions deterministic.

BEGIN;

DROP INDEX IF EXISTS public.idx_tasks_canonical_milestone_id;
DROP INDEX IF EXISTS public.idx_tasks_milestone_id;
CREATE INDEX idx_tasks_milestone_id
  ON public.tasks(milestone_id);

DROP INDEX IF EXISTS public.idx_task_baseline_items_canonical_source_milestone_id;
DROP INDEX IF EXISTS public.idx_task_baseline_items_source_milestone_id;
CREATE INDEX idx_task_baseline_items_source_milestone_id
  ON public.task_baseline_items(source_milestone_id);

COMMIT;
