-- 081: Reconcile skipped runtime schema gaps in environments that missed 058-064/051 follow-ups.
-- 目标：
-- 1. 补齐 delay_requests / task_progress_snapshots / operation_logs / alerts 运行时缺口
-- 2. 将 15.1 规划域基础表以幂等方式补建，避免 063 的外键目标缺失
-- 3. 所有变更保持增量、可重复执行

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 15.1 规划域基础表：真实库里存在跳过 059-064 的情况，这里按依赖顺序补齐。
CREATE TABLE IF NOT EXISTS public.task_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  source_type VARCHAR(30) NOT NULL DEFAULT 'current_schedule'
    CHECK (source_type IN ('manual', 'current_schedule', 'imported_file', 'carryover')),
  source_version_id UUID,
  source_version_label TEXT,
  effective_from DATE,
  effective_to DATE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS public.task_baseline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  baseline_version_id UUID NOT NULL REFERENCES public.task_baselines(id) ON DELETE CASCADE,
  parent_item_id UUID REFERENCES public.task_baseline_items(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  source_milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  target_progress NUMERIC(6,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_milestone BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  mapping_status VARCHAR(20) NOT NULL DEFAULT 'mapped'
    CHECK (mapping_status IN ('mapped', 'pending', 'missing', 'merged')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.monthly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign')),
  month VARCHAR(7) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  baseline_version_id UUID REFERENCES public.task_baselines(id) ON DELETE SET NULL,
  source_version_id UUID,
  source_version_label TEXT,
  closeout_at TIMESTAMPTZ,
  carryover_item_count INTEGER DEFAULT 0,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, month, version)
);

CREATE TABLE IF NOT EXISTS public.monthly_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  monthly_plan_version_id UUID NOT NULL REFERENCES public.monthly_plans(id) ON DELETE CASCADE,
  baseline_item_id UUID REFERENCES public.task_baseline_items(id) ON DELETE SET NULL,
  carryover_from_item_id UUID REFERENCES public.monthly_plan_items(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  target_progress NUMERIC(6,2),
  current_progress NUMERIC(6,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_milestone BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  commitment_status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (commitment_status IN ('planned', 'carried_over', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.planning_draft_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  draft_type VARCHAR(20) NOT NULL
    CHECK (draft_type IN ('baseline', 'monthly_plan')),
  resource_id UUID NOT NULL,
  locked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lock_expires_at TIMESTAMPTZ NOT NULL,
  reminder_sent_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  release_reason VARCHAR(30)
    CHECK (release_reason IN ('timeout', 'force_unlock', 'manual_release')),
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, draft_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_task_baselines_project_id ON public.task_baselines(project_id);
CREATE INDEX IF NOT EXISTS idx_task_baselines_status ON public.task_baselines(status);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_baseline_version_id ON public.task_baseline_items(baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_project_id ON public.task_baseline_items(project_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_project_id ON public.monthly_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_month ON public.monthly_plans(month);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_plan_version_id ON public.monthly_plan_items(monthly_plan_version_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_project_id ON public.monthly_plan_items(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_project_id ON public.planning_draft_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_expiry ON public.planning_draft_locks(is_locked, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_resource_id ON public.planning_draft_locks(resource_id);

CREATE TABLE IF NOT EXISTS public.planning_governance_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  state_key TEXT NOT NULL UNIQUE,
  category VARCHAR(30) NOT NULL
    CHECK (category IN ('closeout', 'reorder', 'ad_hoc')),
  kind VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved')),
  severity VARCHAR(20) NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  threshold_day INTEGER,
  dashboard_signal BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB,
  source_entity_type VARCHAR(50),
  source_entity_id TEXT,
  active_from TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planning_governance_states_project_id ON public.planning_governance_states(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_governance_states_status ON public.planning_governance_states(status);
CREATE INDEX IF NOT EXISTS idx_planning_governance_states_category ON public.planning_governance_states(category);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES public.task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_item_id UUID REFERENCES public.monthly_plan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_baseline_item_id ON public.tasks(baseline_item_id);
CREATE INDEX IF NOT EXISTS idx_tasks_monthly_plan_item_id ON public.tasks(monthly_plan_item_id);

ALTER TABLE public.milestones
  ADD COLUMN IF NOT EXISTS baseline_date DATE,
  ADD COLUMN IF NOT EXISTS current_plan_date DATE,
  ADD COLUMN IF NOT EXISTS actual_date DATE;

UPDATE public.milestones
SET
  baseline_date = COALESCE(baseline_date, target_date),
  current_plan_date = COALESCE(current_plan_date, target_date),
  actual_date = COALESCE(actual_date, CASE WHEN completed_at IS NOT NULL THEN completed_at::date ELSE NULL END)
WHERE baseline_date IS NULL
   OR current_plan_date IS NULL
   OR actual_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_milestones_baseline_date ON public.milestones(baseline_date);
CREATE INDEX IF NOT EXISTS idx_milestones_current_plan_date ON public.milestones(current_plan_date);
CREATE INDEX IF NOT EXISTS idx_milestones_actual_date ON public.milestones(actual_date);

-- 10.2 延期申请：兼容历史库里仍停留在 task_delay_history 的情况。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_delay_history'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'delay_requests'
  ) THEN
    ALTER TABLE public.task_delay_history RENAME TO delay_requests;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.delay_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  original_date DATE NOT NULL,
  delayed_date DATE NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  delay_type TEXT NOT NULL DEFAULT '主动延期',
  reason TEXT NOT NULL,
  delay_reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  chain_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.delay_requests
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS public.delay_requests
  ALTER COLUMN approved_by DROP NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW();

UPDATE public.delay_requests AS dr
SET
  project_id = COALESCE(dr.project_id, tasks.project_id),
  status = COALESCE(dr.status, CASE WHEN dr.approved_at IS NOT NULL OR dr.approved_by IS NOT NULL THEN 'approved' ELSE 'pending' END),
  requested_at = COALESCE(dr.requested_at, dr.created_at, NOW()),
  reviewed_at = COALESCE(dr.reviewed_at, dr.approved_at),
  reviewed_by = COALESCE(dr.reviewed_by, dr.approved_by),
  requested_by = COALESCE(dr.requested_by, dr.approved_by),
  updated_at = COALESCE(dr.updated_at, dr.approved_at, dr.created_at, NOW())
FROM public.tasks
WHERE dr.task_id = tasks.id;

UPDATE public.delay_requests
SET
  status = COALESCE(status, CASE WHEN approved_at IS NOT NULL OR approved_by IS NOT NULL THEN 'approved' ELSE 'pending' END),
  requested_at = COALESCE(requested_at, created_at, NOW()),
  reviewed_at = COALESCE(reviewed_at, approved_at),
  reviewed_by = COALESCE(reviewed_by, approved_by),
  requested_by = COALESCE(requested_by, approved_by),
  updated_at = COALESCE(updated_at, approved_at, created_at, NOW())
WHERE status IS NULL
   OR requested_at IS NULL
   OR updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_delay_requests_project_id ON public.delay_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_delay_requests_task_id ON public.delay_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_delay_requests_status ON public.delay_requests(status);
CREATE INDEX IF NOT EXISTS idx_delay_requests_chain_id ON public.delay_requests(chain_id);

-- 任务快照：补齐 058 + 063 列。
ALTER TABLE public.task_progress_snapshots
  ADD COLUMN IF NOT EXISTS status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS conditions_met_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conditions_total_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obstacles_active_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS baseline_version_id UUID REFERENCES public.task_baselines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_version_id UUID REFERENCES public.monthly_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES public.task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_item_id UUID REFERENCES public.monthly_plan_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planning_source_type VARCHAR(30) DEFAULT 'execution'
    CHECK (planning_source_type IN ('baseline', 'monthly_plan', 'current_schedule', 'execution')),
  ADD COLUMN IF NOT EXISTS planning_source_version_id UUID,
  ADD COLUMN IF NOT EXISTS planning_source_item_id UUID;

UPDATE public.task_progress_snapshots
SET
  conditions_met_count = COALESCE(conditions_met_count, 0),
  conditions_total_count = COALESCE(conditions_total_count, 0),
  obstacles_active_count = COALESCE(obstacles_active_count, 0),
  planning_source_type = COALESCE(planning_source_type, 'execution');

-- 审计日志：历史环境中表常由旧中间件自动创建，字段比当前运行时少。
CREATE TABLE IF NOT EXISTS public.operation_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  username TEXT,
  project_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  method TEXT,
  path TEXT,
  status_code INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  request_body JSONB,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.operation_logs
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS resource_id TEXT,
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS path TEXT,
  ADD COLUMN IF NOT EXISTS status_code INTEGER,
  ADD COLUMN IF NOT EXISTS request_body JSONB,
  ADD COLUMN IF NOT EXISTS detail JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON public.operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_project_id ON public.operation_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON public.operation_logs(action);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON public.operation_logs(created_at DESC);

-- AutoAlertService 仍在使用 alerts 表，这里补齐它的最小兼容结构。
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  level VARCHAR(20) NOT NULL CHECK (level IN ('info', 'warning', 'critical')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  related_id TEXT,
  related_type TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.alerts
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS related_id TEXT,
  ADD COLUMN IF NOT EXISTS related_type TEXT,
  ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_alerts_project_id ON public.alerts(project_id);
CREATE INDEX IF NOT EXISTS idx_alerts_project_resolved ON public.alerts(project_id, resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_related_id ON public.alerts(related_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
