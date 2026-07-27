-- v1.4.23.1 runtime schema gap closeout.
--
-- CloakBrowser-backed local runtime smoke exposed code paths that already
-- consume these columns while migrate:check/drift still reported no pending
-- migration. Keep the fix additive and idempotent: no data deletion, no
-- business default inference beyond compatibility backfills from existing
-- legacy display columns.

BEGIN;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS execution_lane TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_execution_lane
  ON public.tasks(project_id, execution_lane);

COMMENT ON COLUMN public.tasks.execution_lane IS
  'Optional schedule execution lane consumed by CPM/runtime planning read models. Null means no lane classification.';

ALTER TABLE public.acceptance_plans
  ADD COLUMN IF NOT EXISTS plan_name TEXT;

UPDATE public.acceptance_plans
SET plan_name = acceptance_name
WHERE plan_name IS NULL
  AND acceptance_name IS NOT NULL;

COMMENT ON COLUMN public.acceptance_plans.plan_name IS
  'Compatibility display name used by acceptance replay and task read models; backfilled from acceptance_name when present.';

ALTER TABLE public.monthly_plans
  ADD COLUMN IF NOT EXISTS pending_closeout_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.monthly_plans.pending_closeout_count IS
  'Cached monthly closeout backlog count consumed by project execution summaries; defaults to zero for historical rows.';

ALTER TABLE public.task_conditions
  ADD COLUMN IF NOT EXISTS condition_name TEXT;

UPDATE public.task_conditions
SET condition_name = name
WHERE condition_name IS NULL
  AND name IS NOT NULL;

COMMENT ON COLUMN public.task_conditions.condition_name IS
  'Compatibility condition title consumed by drawing, warning, and pre-milestone read models; backfilled from legacy name when present.';

NOTIFY pgrst, 'reload schema';

COMMIT;
