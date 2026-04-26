BEGIN;

ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS baseline_start DATE,
  ADD COLUMN IF NOT EXISTS baseline_end DATE;

UPDATE public.tasks
SET
  baseline_start = COALESCE(baseline_start, planned_start_date, start_date),
  baseline_end = COALESCE(baseline_end, planned_end_date, end_date)
WHERE baseline_start IS NULL
   OR baseline_end IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
