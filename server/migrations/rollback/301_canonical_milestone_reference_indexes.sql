-- Rollback migration 301. Only migration-specific repair index names are removed.

BEGIN;

DROP INDEX IF EXISTS public.idx_tasks_canonical_milestone_id;
DROP INDEX IF EXISTS public.idx_task_baseline_items_canonical_source_milestone_id;

COMMIT;
