-- 181_v14221_task_scope_columns_schema_repair.sql
-- v1.4.22.1 live schema repair: task list reads the final seven range-tree fields.

BEGIN;

ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS basement_object_id UUID REFERENCES public.engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS physical_zone_object_id UUID REFERENCES public.engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS functional_area_object_id UUID REFERENCES public.engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_basement_object_id
  ON public.tasks(basement_object_id)
  WHERE basement_object_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_physical_zone_object_id
  ON public.tasks(physical_zone_object_id)
  WHERE physical_zone_object_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_functional_area_object_id
  ON public.tasks(functional_area_object_id)
  WHERE functional_area_object_id IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';
