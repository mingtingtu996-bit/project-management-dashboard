-- Reassert the v1.4.22.1 final range-tree object contract after historical
-- schema reconciliation migrations. Migration 162a has already normalized
-- legacy zone/professional rows before this constraint can be installed.

BEGIN;

ALTER TABLE public.engineering_objects
  DROP CONSTRAINT IF EXISTS engineering_objects_object_type_check;

ALTER TABLE public.engineering_objects
  ADD CONSTRAINT engineering_objects_object_type_check
  CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area'));

COMMIT;
