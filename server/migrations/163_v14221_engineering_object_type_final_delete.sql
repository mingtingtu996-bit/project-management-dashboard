-- v1.4.22.1 final engineering object model.
-- No historical compatibility layer: engineering objects use exactly seven range-tree types.

BEGIN;

ALTER TABLE public.engineering_objects
  DROP CONSTRAINT IF EXISTS engineering_objects_object_type_check;

ALTER TABLE public.engineering_objects
  ADD CONSTRAINT engineering_objects_object_type_check
  CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area'));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS basement_object_id uuid REFERENCES public.engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS physical_zone_object_id uuid REFERENCES public.engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS functional_area_object_id uuid REFERENCES public.engineering_objects(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS zone_object_id,
  DROP COLUMN IF EXISTS professional_object_id;

ALTER TABLE public.project_materials
  DROP COLUMN IF EXISTS professional_object_id;

ALTER TABLE public.engineering_categories
  DROP COLUMN IF EXISTS professional_object_id;

DROP INDEX IF EXISTS public.idx_tasks_zone_object_id;
DROP INDEX IF EXISTS public.idx_tasks_professional_object_id;
DROP INDEX IF EXISTS public.idx_project_materials_professional_object_id;
DROP INDEX IF EXISTS public.idx_engineering_categories_professional_object;

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
