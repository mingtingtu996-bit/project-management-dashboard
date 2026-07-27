-- 132_project_entity_link_delete_guards.sql
-- v1.4.11 closure: protect source facts and retire target links on delete.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_delete_active_project_entity_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
  v_active_count INTEGER := 0;
BEGIN
  SELECT COUNT(*)
    INTO v_active_count
    FROM public.project_entity_links
   WHERE project_id = OLD.project_id
     AND status = 'active'
     AND (
       (source_entity_type = v_entity_type AND source_entity_id = OLD.id::TEXT)
       OR (target_entity_type = v_entity_type AND target_entity_id = OLD.id::TEXT)
     );

  IF v_active_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete % % while active project_entity_links exist',
      v_entity_type,
      OLD.id
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_target_project_entity_links_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
BEGIN
  UPDATE public.project_entity_links
     SET status = 'inactive',
         updated_at = NOW()
   WHERE project_id = OLD.project_id
     AND target_entity_type = v_entity_type
     AND target_entity_id = OLD.id::TEXT
     AND status = 'active';

  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.drawing_packages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_drawing_packages_active_links ON public.drawing_packages;
    CREATE TRIGGER prevent_delete_drawing_packages_active_links
      BEFORE DELETE ON public.drawing_packages
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('drawing_package');
  END IF;

  IF to_regclass('public.construction_drawings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_construction_drawings_active_links ON public.construction_drawings;
    CREATE TRIGGER prevent_delete_construction_drawings_active_links
      BEFORE DELETE ON public.construction_drawings
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('construction_drawing');
  END IF;

  IF to_regclass('public.pre_milestones') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_pre_milestones_active_links ON public.pre_milestones;
    CREATE TRIGGER prevent_delete_pre_milestones_active_links
      BEFORE DELETE ON public.pre_milestones
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('pre_milestone');
  END IF;

  IF to_regclass('public.certificate_work_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_certificate_work_items_active_links ON public.certificate_work_items;
    CREATE TRIGGER prevent_delete_certificate_work_items_active_links
      BEFORE DELETE ON public.certificate_work_items
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('certificate_work_item');
  END IF;

  IF to_regclass('public.acceptance_plans') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_acceptance_plans_active_links ON public.acceptance_plans;
    CREATE TRIGGER prevent_delete_acceptance_plans_active_links
      BEFORE DELETE ON public.acceptance_plans
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('acceptance_plan');
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_task_project_entity_links_before_delete ON public.tasks;
    CREATE TRIGGER deactivate_task_project_entity_links_before_delete
      BEFORE DELETE ON public.tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('task');
  END IF;

  IF to_regclass('public.task_conditions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_task_condition_project_entity_links_before_delete ON public.task_conditions;
    CREATE TRIGGER deactivate_task_condition_project_entity_links_before_delete
      BEFORE DELETE ON public.task_conditions
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('task_condition');
  END IF;

  IF to_regclass('public.acceptance_requirements') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_acceptance_requirement_project_entity_links_before_delete ON public.acceptance_requirements;
    CREATE TRIGGER deactivate_acceptance_requirement_project_entity_links_before_delete
      BEFORE DELETE ON public.acceptance_requirements
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('acceptance_requirement');
  END IF;
END $$;

COMMIT;
