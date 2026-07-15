-- 189_add_planned_cumulative_to_snapshot.sql
-- Persist the planned S-curve line in the daily BI snapshot.

BEGIN;

ALTER TABLE public.project_daily_snapshot
  ADD COLUMN IF NOT EXISTS planned_cumulative NUMERIC(5,2);

COMMENT ON COLUMN public.project_daily_snapshot.planned_cumulative IS
  'Planned cumulative progress for S-curve reports, authoritative from the first snapshot written after this migration; historical rows are not backfilled.';

COMMIT;
