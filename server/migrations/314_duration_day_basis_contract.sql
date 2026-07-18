-- Make duration sample and benchmark day semantics explicit.
-- Existing values were collected as inclusive calendar days, so the migration
-- labels them without changing the historical actual_duration/planned_duration facts.

BEGIN;

ALTER TABLE public.duration_experience_samples
  ADD COLUMN IF NOT EXISTS duration_day_basis TEXT NOT NULL DEFAULT 'calendar_day',
  ADD COLUMN IF NOT EXISTS actual_duration_calendar_days INTEGER,
  ADD COLUMN IF NOT EXISTS actual_duration_production_days INTEGER,
  ADD COLUMN IF NOT EXISTS planned_duration_calendar_days INTEGER,
  ADD COLUMN IF NOT EXISTS planned_duration_production_days INTEGER,
  ADD COLUMN IF NOT EXISTS construction_calendar_basis TEXT;

UPDATE public.duration_experience_samples
SET actual_duration_calendar_days = COALESCE(actual_duration_calendar_days, actual_duration),
    planned_duration_calendar_days = COALESCE(planned_duration_calendar_days, planned_duration)
WHERE duration_day_basis = 'calendar_day';

ALTER TABLE public.duration_experience_samples
  DROP CONSTRAINT IF EXISTS duration_experience_samples_duration_day_basis_check,
  DROP CONSTRAINT IF EXISTS duration_experience_samples_dual_duration_days_check,
  DROP CONSTRAINT IF EXISTS duration_experience_samples_construction_calendar_basis_check;

ALTER TABLE public.duration_experience_samples
  ADD CONSTRAINT duration_experience_samples_duration_day_basis_check
    CHECK (duration_day_basis IN ('calendar_day', 'construction_production_day')),
  ADD CONSTRAINT duration_experience_samples_dual_duration_days_check
    CHECK (
      (actual_duration_calendar_days IS NULL OR actual_duration_calendar_days > 0)
      AND (actual_duration_production_days IS NULL OR actual_duration_production_days > 0)
      AND (planned_duration_calendar_days IS NULL OR planned_duration_calendar_days > 0)
      AND (planned_duration_production_days IS NULL OR planned_duration_production_days > 0)
    ),
  ADD CONSTRAINT duration_experience_samples_construction_calendar_basis_check
    CHECK (
      construction_calendar_basis IS NULL
      OR construction_calendar_basis IN ('calendar_day', 'official_construction_calendar_seed')
    );

ALTER TABLE public.duration_benchmarks
  ADD COLUMN IF NOT EXISTS duration_day_basis TEXT NOT NULL DEFAULT 'calendar_day';

ALTER TABLE public.duration_benchmarks
  DROP CONSTRAINT IF EXISTS duration_benchmarks_duration_day_basis_check;

ALTER TABLE public.duration_benchmarks
  ADD CONSTRAINT duration_benchmarks_duration_day_basis_check
    CHECK (duration_day_basis IN ('calendar_day', 'construction_production_day'));

CREATE INDEX IF NOT EXISTS idx_duration_experience_samples_day_basis
  ON public.duration_experience_samples(duration_day_basis, sample_status, included_in_benchmark);

CREATE INDEX IF NOT EXISTS idx_duration_benchmarks_day_basis_current
  ON public.duration_benchmarks(duration_day_basis, is_current, is_active, benchmark_key);

COMMENT ON COLUMN public.duration_experience_samples.duration_day_basis IS
  'Authoritative semantics of actual_duration and planned_duration. New governed samples use construction_production_day; pre-314 values remain calendar_day.';
COMMENT ON COLUMN public.duration_benchmarks.duration_day_basis IS
  'Authoritative semantics of p50/p75/p80/mean day values. Production forecast consumers require construction_production_day.';

NOTIFY pgrst, 'reload schema';

COMMIT;
