-- 148_v1421_material_arrival_to_condition.sql
-- v1.4.21: audit material arrival -> task condition auto-unlock chain

BEGIN;

CREATE TABLE IF NOT EXISTS public.material_arrival_to_condition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.project_materials(id) ON DELETE CASCADE,
  condition_id UUID NOT NULL REFERENCES public.task_conditions(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlocked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source_event_type TEXT NOT NULL DEFAULT 'material_arrival_to_condition',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_material_arrival_to_condition
  ON public.material_arrival_to_condition(material_id, condition_id);

CREATE INDEX IF NOT EXISTS idx_material_arrival_to_condition_project
  ON public.material_arrival_to_condition(project_id, unlocked_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_arrival_to_condition_task
  ON public.material_arrival_to_condition(task_id, unlocked_at DESC);

COMMIT;
