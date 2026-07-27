BEGIN;

DROP INDEX IF EXISTS public.idx_duration_benchmarks_day_basis_current;
DROP INDEX IF EXISTS public.idx_duration_experience_samples_day_basis;

ALTER TABLE public.duration_benchmarks
  DROP CONSTRAINT IF EXISTS duration_benchmarks_duration_day_basis_check,
  DROP COLUMN IF EXISTS duration_day_basis;

ALTER TABLE public.duration_experience_samples
  DROP CONSTRAINT IF EXISTS duration_experience_samples_construction_calendar_basis_check,
  DROP CONSTRAINT IF EXISTS duration_experience_samples_dual_duration_days_check,
  DROP CONSTRAINT IF EXISTS duration_experience_samples_duration_day_basis_check,
  DROP COLUMN IF EXISTS construction_calendar_basis,
  DROP COLUMN IF EXISTS planned_duration_production_days,
  DROP COLUMN IF EXISTS planned_duration_calendar_days,
  DROP COLUMN IF EXISTS actual_duration_production_days,
  DROP COLUMN IF EXISTS actual_duration_calendar_days,
  DROP COLUMN IF EXISTS duration_day_basis;

NOTIFY pgrst, 'reload schema';

COMMIT;
