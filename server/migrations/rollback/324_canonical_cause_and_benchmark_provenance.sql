-- Roll back only migration 324 benchmark provenance and cause segments.

BEGIN;

DROP POLICY IF EXISTS duration_benchmark_cause_segments_member_read
  ON public.duration_benchmark_cause_segments;
DROP POLICY IF EXISTS duration_benchmark_cause_segments_backend_runtime
  ON public.duration_benchmark_cause_segments;

DROP TRIGGER IF EXISTS ensure_duration_benchmark_cause_segment_scope_trigger
  ON public.duration_benchmark_cause_segments;
DROP FUNCTION IF EXISTS public.ensure_duration_benchmark_cause_segment_scope();

DROP TABLE IF EXISTS public.duration_benchmark_cause_segments;

ALTER TABLE public.duration_benchmarks
  DROP COLUMN IF EXISTS generated_at,
  DROP COLUMN IF EXISTS source_window_start,
  DROP COLUMN IF EXISTS source_as_of;

NOTIFY pgrst, 'reload schema';

COMMIT;
