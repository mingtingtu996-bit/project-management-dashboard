-- 116_add_today_todo_count_to_project_daily_snapshot.sql
-- Add Dashboard primary KPI todo count to the BI daily snapshot fact table.

BEGIN;

ALTER TABLE public.project_daily_snapshot
  ADD COLUMN IF NOT EXISTS today_todo_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.project_daily_snapshot.today_todo_count IS 'Dashboard 今日待办主 KPI 快照值，用于严格周对比口径';

COMMIT;
