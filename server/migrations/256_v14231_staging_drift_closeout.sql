-- v1.4.23.1 staging drift closeout.
-- Align replayed staging schema with the migration-derived expected schema.

BEGIN;

ALTER TABLE public.acceptance_plans
  DROP CONSTRAINT IF EXISTS fk_acceptance_plans_catalog_id;

ALTER TABLE public.acceptance_plans
  ADD CONSTRAINT fk_acceptance_plans_catalog_id
  FOREIGN KEY (catalog_id)
  REFERENCES public.acceptance_catalog(id)
  ON DELETE SET NULL;

DROP INDEX IF EXISTS public.idx_tasks_basement_object_id;
CREATE INDEX idx_tasks_basement_object_id
  ON public.tasks (basement_object_id)
  WHERE basement_object_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_tasks_physical_zone_object_id;
CREATE INDEX idx_tasks_physical_zone_object_id
  ON public.tasks (physical_zone_object_id)
  WHERE physical_zone_object_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_tasks_functional_area_object_id;
CREATE INDEX idx_tasks_functional_area_object_id
  ON public.tasks (functional_area_object_id)
  WHERE functional_area_object_id IS NOT NULL;

COMMIT;
