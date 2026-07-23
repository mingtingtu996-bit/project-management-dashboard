-- Roll back only migration 324 benchmark provenance and cause segments.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.duration_benchmark_cause_segments') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS duration_benchmark_cause_segments_member_read ON public.duration_benchmark_cause_segments';
    EXECUTE 'DROP POLICY IF EXISTS duration_benchmark_cause_segments_backend_runtime ON public.duration_benchmark_cause_segments';
    EXECUTE 'DROP TRIGGER IF EXISTS ensure_duration_benchmark_cause_segment_scope_trigger ON public.duration_benchmark_cause_segments';
  END IF;

  IF to_regclass('public.duration_benchmarks') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS ensure_duration_benchmark_scope_trigger ON public.duration_benchmarks';
    EXECUTE 'DROP TRIGGER IF EXISTS prevent_duration_benchmark_scope_change_with_segments_trigger ON public.duration_benchmarks';
  END IF;
END
$$;

ALTER TABLE IF EXISTS public.duration_benchmarks
  DROP CONSTRAINT IF EXISTS duration_benchmarks_project_company_fk;

DROP INDEX IF EXISTS public.uq_duration_benchmarks_candidate_operation;
DROP INDEX IF EXISTS public.uq_structured_cause_task_active_primary;
DROP INDEX IF EXISTS public.uq_projects_id_company_id_for_duration_benchmarks;

DROP FUNCTION IF EXISTS public.prevent_duration_benchmark_scope_change_with_segments();
DROP FUNCTION IF EXISTS public.ensure_duration_benchmark_scope();
DROP FUNCTION IF EXISTS public.ensure_duration_benchmark_cause_segment_scope();

DROP TABLE IF EXISTS public.duration_benchmark_cause_segments;

ALTER TABLE IF EXISTS public.duration_benchmarks
  DROP COLUMN IF EXISTS generated_at,
  DROP COLUMN IF EXISTS source_window_start,
  DROP COLUMN IF EXISTS source_as_of;

NOTIFY pgrst, 'reload schema';

COMMIT;
