-- v1.4.19 project health scoring cleanup.
-- The TypeScript projectHealthService owns the health algorithm. This guard
-- removes legacy DB-side scoring functions, triggers, and the old detail table
-- from databases initialized from older migration bundles.

BEGIN;

DROP TRIGGER IF EXISTS trigger_update_health_tasks ON public.tasks;
DROP TRIGGER IF EXISTS trigger_update_health_milestones ON public.milestones;
DROP TRIGGER IF EXISTS trigger_update_health_conditions ON public.task_conditions;
DROP TRIGGER IF EXISTS trigger_update_health_obstacles ON public.task_obstacles;

DROP FUNCTION IF EXISTS public.calculate_project_health_score(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_project_health_on_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_project_health_details_updated_at() CASCADE;

DROP TABLE IF EXISTS public.project_health_details CASCADE;

COMMENT ON COLUMN public.projects.health_score IS 'Project health score persisted from projectHealthService only.';
COMMENT ON COLUMN public.projects.health_status IS 'Project health status persisted from projectHealthService thresholds: healthy/subhealthy/warning/danger/incomplete.';

COMMIT;
