-- 补建高频查询字段索引（§9.1 §13.1）
-- drawing_packages 按项目+专业类型筛选
CREATE INDEX IF NOT EXISTS idx_drawing_packages_discipline_type
  ON drawing_packages(project_id, discipline_type);

-- task_dependencies 前置/后继双向查询
DO $$
BEGIN
  IF to_regclass('public.task_dependencies') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_dependencies_predecessor ON public.task_dependencies(predecessor_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_task_dependencies_successor ON public.task_dependencies(successor_id)';
  END IF;
END $$;
