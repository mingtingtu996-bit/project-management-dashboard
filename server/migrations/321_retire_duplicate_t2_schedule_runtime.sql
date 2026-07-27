-- Retire the duplicate T2 task/date mutation surface. T2 rhythm remains a
-- governed WBS generation input and is committed through the canonical task,
-- dependency, baseline revision and rollback chain.

BEGIN;

LOCK TABLE public.t2_rhythm_schedule_runtime_publications IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.t2_rhythm_schedule_runtime_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.task_dependencies IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  backup_sha256 TEXT := current_setting('workbuddy.t2_schedule_runtime_retirement_backup_sha256', true);
  expected_fingerprint TEXT := current_setting('workbuddy.t2_schedule_runtime_retirement_data_fingerprint', true);
  actual_fingerprint TEXT;
BEGIN
  IF backup_sha256 IS NULL OR backup_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_backup_required';
  END IF;
  IF expected_fingerprint IS NULL OR expected_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_fingerprint_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.t2_rhythm_schedule_runtime_publications
    WHERE runtime_publication_status = 'runtime_published'
  ) THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_active_publication_present';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_dependencies dependency
    WHERE dependency.source_type = 't2_rhythm_schedule_runtime'
      AND NOT (
        dependency.status = 'inactive'
        AND dependency.dependency_type = 'FS'
        AND dependency.required_for_start IS TRUE
        AND dependency.source_ref_id IS NULL
        AND btrim(COALESCE(dependency.metadata ->> 'edgeId', '')) <> ''
        AND btrim(COALESCE(dependency.metadata ->> 'publicationKey', '')) ~ (
          '^t2-rhythm-schedule-runtime:'
          || dependency.project_id::text
          || ':real-closeout:[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?Z$'
        )
        AND EXISTS (
          SELECT 1
          FROM public.t2_rhythm_schedule_runtime_publications publication
          WHERE publication.publication_key = dependency.metadata ->> 'publicationKey'
            AND publication.runtime_publication_status = 'runtime_rolled_back'
            AND publication.project_id = dependency.project_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.projects project
          WHERE project.id = dependency.project_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = dependency.task_id
            AND task.project_id = dependency.project_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.tasks dependency_task
          WHERE dependency_task.id = dependency.dependency_task_id
            AND dependency_task.project_id = dependency.project_id
        )
      )
  ) THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_ineligible_dependency_residue_present';
  END IF;

  SELECT encode(
           digest(
             convert_to(
               jsonb_build_object(
                 't2_rhythm_schedule_runtime_publications', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.t2_rhythm_schedule_runtime_publications source_row
                 ),
                 't2_rhythm_schedule_runtime_events', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.t2_rhythm_schedule_runtime_events source_row
                 ),
                 'task_dependencies', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.task_dependencies source_row
                   WHERE source_row.source_type = 't2_rhythm_schedule_runtime'
                 )
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
  INTO actual_fingerprint;

  IF actual_fingerprint <> expected_fingerprint THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_data_changed_after_backup';
  END IF;
END
$$;

DELETE FROM public.task_dependencies
WHERE source_type = 't2_rhythm_schedule_runtime';

DROP TABLE public.t2_rhythm_schedule_runtime_events;
DROP TABLE public.t2_rhythm_schedule_runtime_publications;

NOTIFY pgrst, 'reload schema';

COMMIT;
