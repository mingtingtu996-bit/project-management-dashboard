-- Reconcile early task_conditions/task_obstacles columns before migration 037 indexes them.
-- Migration 002 created narrower tables, so 037 CREATE TABLE IF NOT EXISTS cannot add missing columns.

ALTER TABLE public.task_conditions
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS satisfied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS target_date DATE,
  ADD COLUMN IF NOT EXISTS responsible_unit VARCHAR(100),
  ADD COLUMN IF NOT EXISTS responsible_person VARCHAR(100),
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.task_conditions AS condition_row
   SET project_id = task_row.project_id
  FROM public.tasks AS task_row
 WHERE condition_row.task_id = task_row.id
   AND condition_row.project_id IS NULL;

ALTER TABLE public.task_conditions
  ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.task_obstacles
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS estimated_resolve_date DATE,
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.task_obstacles AS obstacle_row
   SET project_id = task_row.project_id
  FROM public.tasks AS task_row
 WHERE obstacle_row.task_id = task_row.id
   AND obstacle_row.project_id IS NULL;

ALTER TABLE public.task_obstacles
  ALTER COLUMN created_by DROP NOT NULL;
