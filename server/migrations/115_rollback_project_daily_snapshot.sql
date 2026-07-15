-- 115_rollback_project_daily_snapshot.sql
-- Quick rollback for project_daily_snapshot.

BEGIN;

DROP TABLE IF EXISTS public.project_daily_snapshot CASCADE;
DROP FUNCTION IF EXISTS public.update_project_daily_snapshot_updated_at();

COMMIT;
