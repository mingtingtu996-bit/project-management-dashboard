-- Retire the duplicate T2 task/date mutation surface. T2 rhythm remains a
-- governed WBS generation input and is committed through the canonical task,
-- dependency, baseline revision and rollback chain.

BEGIN;

LOCK TABLE public.t2_rhythm_schedule_runtime_publications IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.t2_rhythm_schedule_runtime_events IN ACCESS EXCLUSIVE MODE;

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
    FROM public.task_dependencies
    WHERE source_type = 't2_rhythm_schedule_runtime'
  ) THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_dependency_residue_present';
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

DROP TABLE public.t2_rhythm_schedule_runtime_events;
DROP TABLE public.t2_rhythm_schedule_runtime_publications;

NOTIFY pgrst, 'reload schema';

COMMIT;
