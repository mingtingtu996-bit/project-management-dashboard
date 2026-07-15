-- Normalize pre-v1.4.22.1 range-tree rows before migration 163 installs the
-- final seven-type CHECK constraint. This is intentionally before 163 so old
-- databases cannot get stuck with unclassifiable zone/professional records.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.engineering_objects legacy
    WHERE legacy.object_type IN ('zone', 'professional')
      AND (
        EXISTS (SELECT 1 FROM public.engineering_objects child WHERE child.parent_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.tasks task WHERE task.engineering_object_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.tasks task WHERE task.phase_object_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.tasks task WHERE task.section_object_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.tasks task WHERE task.building_object_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.tasks task WHERE task.basement_object_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.tasks task WHERE task.floor_object_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.tasks task WHERE task.physical_zone_object_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.tasks task WHERE task.functional_area_object_id = legacy.id)
        OR EXISTS (SELECT 1 FROM public.acceptance_plans plan WHERE plan.building_object_id = legacy.id)
      )
  ) THEN
    RAISE EXCEPTION 'legacy engineering-object references must be cleared before final type migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.engineering_objects legacy_zone
    JOIN public.engineering_objects physical_zone
      ON physical_zone.project_id = legacy_zone.project_id
     AND physical_zone.object_code = legacy_zone.object_code
     AND physical_zone.object_type = 'physical_zone'
    WHERE legacy_zone.object_type = 'zone'
  ) THEN
    RAISE EXCEPTION 'zone to physical_zone object-code collision';
  END IF;
END $$;

UPDATE public.engineering_objects
SET object_type = 'physical_zone'
WHERE object_type = 'zone';

DELETE FROM public.engineering_objects
WHERE object_type = 'professional';

COMMIT;
