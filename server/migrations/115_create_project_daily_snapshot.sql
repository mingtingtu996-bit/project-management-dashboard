-- 115_create_project_daily_snapshot.sql
-- Project daily BI snapshot for company cockpit and trend analytics.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_project_member(project_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = project_uuid
      AND user_id = user_uuid
      AND is_active = TRUE
  );
END;
$$;

CREATE TABLE IF NOT EXISTS public.project_daily_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  health_score INTEGER DEFAULT 0,
  health_status TEXT DEFAULT '危险',
  overall_progress NUMERIC(5,2) DEFAULT 0,
  task_progress NUMERIC(5,2) DEFAULT 0,
  delay_days INTEGER DEFAULT 0,
  delay_count INTEGER DEFAULT 0,
  active_risk_count INTEGER DEFAULT 0,
  pending_condition_count INTEGER DEFAULT 0,
  active_obstacle_count INTEGER DEFAULT 0,
  active_delay_requests INTEGER DEFAULT 0,
  monthly_close_status TEXT DEFAULT '未开始',
  attention_required BOOLEAN DEFAULT FALSE,
  highest_warning_level TEXT,
  shifted_milestone_count INTEGER DEFAULT 0,
  critical_path_affected_tasks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_daily_snapshot_project_date_unique UNIQUE (project_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_project_daily_snapshot_date
  ON public.project_daily_snapshot(snapshot_date);

CREATE INDEX IF NOT EXISTS idx_project_daily_snapshot_project_date
  ON public.project_daily_snapshot(project_id, snapshot_date DESC);

CREATE OR REPLACE FUNCTION public.update_project_daily_snapshot_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_project_daily_snapshot_updated_at ON public.project_daily_snapshot;
CREATE TRIGGER trigger_update_project_daily_snapshot_updated_at
  BEFORE UPDATE ON public.project_daily_snapshot
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_daily_snapshot_updated_at();

ALTER TABLE public.project_daily_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_daily_snapshot_select_member ON public.project_daily_snapshot;
CREATE POLICY project_daily_snapshot_select_member ON public.project_daily_snapshot
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
    OR public.is_project_member(project_daily_snapshot.project_id, auth.uid())
  );

DROP POLICY IF EXISTS project_daily_snapshot_insert_service_role ON public.project_daily_snapshot;
CREATE POLICY project_daily_snapshot_insert_service_role ON public.project_daily_snapshot
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS project_daily_snapshot_update_service_role ON public.project_daily_snapshot;
CREATE POLICY project_daily_snapshot_update_service_role ON public.project_daily_snapshot
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS project_daily_snapshot_delete_service_role ON public.project_daily_snapshot;
CREATE POLICY project_daily_snapshot_delete_service_role ON public.project_daily_snapshot
  FOR DELETE
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.project_daily_snapshot IS '项目级日快照事实表，作为 BI 统一趋势与 CompanyCockpit 读模型来源';
COMMENT ON COLUMN public.project_daily_snapshot.snapshot_date IS '快照日期';
COMMENT ON COLUMN public.project_daily_snapshot.health_score IS '项目健康度';
COMMENT ON COLUMN public.project_daily_snapshot.overall_progress IS '工期加权整体进度';
COMMENT ON COLUMN public.project_daily_snapshot.attention_required IS '是否需要关注';

COMMIT;
