-- v1.4.23.2 local replay drift closeout.
-- Some early reconcile migrations were ledgered after later canonical cleanup
-- migrations in the current local database. Keep this forward-only patch
-- idempotent and align the catalog with the migration-derived final schema.

BEGIN;

UPDATE public.task_conditions AS condition_row
SET created_by = COALESCE(
  condition_row.created_by,
  condition_row.confirmed_by,
  task_row.created_by,
  (SELECT project_row.created_by FROM public.projects AS project_row WHERE project_row.id = condition_row.project_id),
  (SELECT project_row.owner_id FROM public.projects AS project_row WHERE project_row.id = condition_row.project_id),
  (SELECT project_row.created_by FROM public.projects AS project_row WHERE project_row.id = task_row.project_id),
  (SELECT project_row.owner_id FROM public.projects AS project_row WHERE project_row.id = task_row.project_id)
)
FROM public.tasks AS task_row
WHERE condition_row.task_id = task_row.id
  AND condition_row.created_by IS NULL;

UPDATE public.task_conditions AS condition_row
SET created_by = COALESCE(
  condition_row.created_by,
  condition_row.confirmed_by,
  (SELECT project_row.created_by FROM public.projects AS project_row WHERE project_row.id = condition_row.project_id),
  (SELECT project_row.owner_id FROM public.projects AS project_row WHERE project_row.id = condition_row.project_id)
)
WHERE condition_row.created_by IS NULL;

UPDATE public.task_obstacles AS obstacle_row
SET created_by = COALESCE(
  obstacle_row.created_by,
  obstacle_row.resolved_by,
  task_row.created_by,
  (SELECT project_row.created_by FROM public.projects AS project_row WHERE project_row.id = obstacle_row.project_id),
  (SELECT project_row.owner_id FROM public.projects AS project_row WHERE project_row.id = obstacle_row.project_id),
  (SELECT project_row.created_by FROM public.projects AS project_row WHERE project_row.id = task_row.project_id),
  (SELECT project_row.owner_id FROM public.projects AS project_row WHERE project_row.id = task_row.project_id)
)
FROM public.tasks AS task_row
WHERE obstacle_row.task_id = task_row.id
  AND obstacle_row.created_by IS NULL;

UPDATE public.task_obstacles AS obstacle_row
SET created_by = COALESCE(
  obstacle_row.created_by,
  obstacle_row.resolved_by,
  (SELECT project_row.created_by FROM public.projects AS project_row WHERE project_row.id = obstacle_row.project_id),
  (SELECT project_row.owner_id FROM public.projects AS project_row WHERE project_row.id = obstacle_row.project_id)
)
WHERE obstacle_row.created_by IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.task_conditions WHERE created_by IS NULL) THEN
    RAISE EXCEPTION 'Cannot set public.task_conditions.created_by NOT NULL: null rows remain';
  END IF;

  IF EXISTS (SELECT 1 FROM public.task_obstacles WHERE created_by IS NULL) THEN
    RAISE EXCEPTION 'Cannot set public.task_obstacles.created_by NOT NULL: null rows remain';
  END IF;
END
$$;

ALTER TABLE public.task_conditions
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.task_obstacles
  ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.task_preceding_relations
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS fk_tasks_milestone_id,
  DROP CONSTRAINT IF EXISTS tasks_milestone_id_fkey;

UPDATE public.wbs_templates
SET is_public = FALSE
WHERE is_public IS NULL;

ALTER TABLE public.wbs_templates
  ALTER COLUMN is_public SET DEFAULT FALSE,
  ALTER COLUMN is_public SET NOT NULL;

COMMIT;
