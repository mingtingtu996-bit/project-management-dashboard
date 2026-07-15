-- v1.4.7.3 task list performance hardening
-- Speeds up the task list cold path:
--   SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC

CREATE INDEX IF NOT EXISTS idx_tasks_project_created_at_desc
  ON public.tasks(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_project_task_date
  ON public.acceptance_plans(project_id, task_id, planned_date, created_at);

CREATE INDEX IF NOT EXISTS idx_project_entity_links_acceptance_task
  ON public.project_entity_links(project_id, target_entity_id)
  WHERE source_entity_type = 'acceptance_plan'
    AND target_entity_type = 'task'
    AND relation_type = 'covers_task'
    AND status = 'active';
