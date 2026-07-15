-- 117_add_milestone_kpi_counts_to_project_daily_snapshot.sql
-- Add milestone KPI values to the BI daily snapshot fact table for strict monthly comparison.

BEGIN;

ALTER TABLE public.project_daily_snapshot
  ADD COLUMN IF NOT EXISTS milestone_baseline_on_time_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS milestone_due_soon_30d_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS milestone_high_risk_count INTEGER DEFAULT 0;

COMMENT ON COLUMN public.project_daily_snapshot.shifted_milestone_count IS '里程碑当前已偏移数快照值，用于严格月度对比口径';
COMMENT ON COLUMN public.project_daily_snapshot.milestone_baseline_on_time_count IS '按基线准时完成里程碑数快照值，用于严格月度对比口径';
COMMENT ON COLUMN public.project_daily_snapshot.milestone_due_soon_30d_count IS '近 30 天到期里程碑数快照值，用于严格月度对比口径';
COMMENT ON COLUMN public.project_daily_snapshot.milestone_high_risk_count IS '高风险里程碑数快照值，用于严格月度对比口径';

COMMIT;
