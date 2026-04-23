-- 迁移 088: v2 稳定性补强（图纸乐观锁 / 任务依赖清理 / 高频索引）

ALTER TABLE IF EXISTS public.construction_drawings
  ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_preceding_relations'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_condition_id ON public.task_preceding_relations(condition_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_preceding_relations_task_id ON public.task_preceding_relations(task_id)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'task_conditions'
      AND column_name = 'preceding_task_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_conditions_preceding_task_id ON public.task_conditions(preceding_task_id) WHERE preceding_task_id IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'construction_drawings'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_construction_drawings_project_status_review ON public.construction_drawings(project_id, status, review_status)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_construction_drawings_project_created_at ON public.construction_drawings(project_id, created_at DESC)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'drawing_versions'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_drawing_versions_package_created_at ON public.drawing_versions(package_id, created_at DESC)';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.delete_task_with_source_backfill_atomic(
  p_task_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_task RECORD;
  v_condition RECORD;
  v_obstacle RECORD;
  v_plan RECORD;
BEGIN
  SELECT id
  INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM public.mark_source_deleted_on_downstream_atomic('task', p_task_id::TEXT);

  FOR v_condition IN
    SELECT id
    FROM public.task_conditions
    WHERE task_id = p_task_id
  LOOP
    PERFORM public.mark_source_deleted_on_downstream_atomic('task_condition', v_condition.id::TEXT);
  END LOOP;

  FOR v_obstacle IN
    SELECT id
    FROM public.task_obstacles
    WHERE task_id = p_task_id
  LOOP
    PERFORM public.mark_source_deleted_on_downstream_atomic('task_obstacle', v_obstacle.id::TEXT);
  END LOOP;

  FOR v_plan IN
    SELECT id
    FROM public.acceptance_plans
    WHERE task_id = p_task_id
  LOOP
    PERFORM public.mark_source_deleted_on_downstream_atomic('acceptance_plan', v_plan.id::TEXT);
  END LOOP;

  DELETE FROM public.task_preceding_relations
  WHERE task_id = p_task_id;

  DELETE FROM public.tasks
  WHERE id = p_task_id;

  RETURN TRUE;
END;
$$;
