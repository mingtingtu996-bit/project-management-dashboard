-- Reconcile non-table objects that were left inconsistent by historical
-- migrations. This is intentionally forward-only: historical migration files
-- and schema_migrations records remain immutable.

BEGIN;

-- Migration 278 moved policy helpers into workbuddy_private. Retire the
-- exposed public copies after all policy expressions have been rewritten.
DROP FUNCTION IF EXISTS public.has_project_edit_permission(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_project_owner(UUID, UUID);

-- The dashboard now reads the canonical summary/snapshot services directly;
-- this legacy materialized view has no runtime consumer.
DROP MATERIALIZED VIEW IF EXISTS public.mv_project_dashboard;

-- Remove duplicate legacy updated_at triggers. The canonical trigger names
-- created by the later reconciliation migrations remain in place.
DROP TRIGGER IF EXISTS update_task_conditions_updated_at ON public.task_conditions;
DROP TRIGGER IF EXISTS update_task_obstacles_updated_at ON public.task_obstacles;

CREATE OR REPLACE FUNCTION public.auto_complete_conditions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = '已完成' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.task_conditions
    SET status = '已确认',
        confirmed_at = NOW()
    WHERE task_id = NEW.id
      AND status = '已满足';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_task_progress_on_condition_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_conditions INTEGER;
  v_completed_conditions INTEGER;
  v_progress INTEGER;
BEGIN
  IF NEW.status IN ('已满足', '已确认')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_completed_conditions
    FROM public.task_conditions
    WHERE task_id = NEW.task_id;

    IF v_total_conditions > 0 THEN
      v_progress := ROUND((v_completed_conditions::NUMERIC / v_total_conditions) * 100);

      UPDATE public.tasks
      SET progress = v_progress
      WHERE id = NEW.task_id
        AND progress < v_progress;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_task_progress_on_condition ON public.task_conditions;
CREATE TRIGGER trigger_update_task_progress_on_condition
  AFTER UPDATE OF status ON public.task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_progress_on_condition_complete();

CREATE OR REPLACE FUNCTION public.auto_resolve_obstacles_on_task_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('completed', 'done', 'closed', '已完成')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.task_obstacles
    SET status = 'resolved',
        resolution = COALESCE(resolution, '任务已完成，系统自动关闭阻碍'),
        resolved_at = COALESCE(resolved_at, NOW())
    WHERE task_id = NEW.id
      AND status IN ('pending', 'active', 'resolving', 'blocked', '待处理', '处理中');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_resolve_obstacles ON public.tasks;
CREATE TRIGGER trigger_auto_resolve_obstacles
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_resolve_obstacles_on_task_complete();

-- The registry view is an internal governance surface. API roles remain
-- denied; backend roles receive only the SELECT privilege they require.
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM PUBLIC;
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM anon;
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM authenticated;
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM service_role;
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM workbuddy_runtime;

GRANT SELECT ON TABLE public.algorithm_asset_registry_view TO service_role;
GRANT SELECT ON TABLE public.algorithm_asset_registry_view TO workbuddy_runtime;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM workbuddy_runtime_login';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
