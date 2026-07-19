-- CANONICAL: current clean bootstrap bundle, synchronized through migration 321
-- CLEAN MIGRATION (UTF-8, no encoding issues)
-- Generated: 2026-03-26 02:39
-- All 17 migration files merged


-- ============================================================
-- Source: 001_initial_schema.sql
-- ============================================================
-- 项目管理系统数据库初始化脚本
-- 执行前请在 Supabase SQL Editor 中运行

-- 用户表（无注册模式，使用device_id）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  joined_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW()
);

-- 项目表
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  primary_invitation_code VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'todo',
  priority VARCHAR(20) DEFAULT 'medium',
  start_date DATE,
  end_date DATE,
  progress INTEGER DEFAULT 0,
  assignee VARCHAR(100),
  assignee_unit VARCHAR(100),
  dependencies UUID[],
  is_milestone BOOLEAN DEFAULT FALSE,
  version INTEGER DEFAULT 1,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 风险表
CREATE TABLE IF NOT EXISTS risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  level VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'identified',
  probability INTEGER DEFAULT 50,
  impact INTEGER DEFAULT 50,
  mitigation TEXT,
  task_id UUID REFERENCES tasks(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 里程碑表
CREATE TABLE IF NOT EXISTS milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 邀请码表
CREATE TABLE IF NOT EXISTS project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  invitation_code VARCHAR(50) UNIQUE NOT NULL,
  permission_level VARCHAR(20) DEFAULT 'editor',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  is_revoked BOOLEAN DEFAULT FALSE,
  used_count INTEGER DEFAULT 0,
  max_uses INTEGER
);

-- 项目成员表
CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  invitation_code_id UUID REFERENCES project_invitations(id),
  permission_level VARCHAR(20) DEFAULT 'editor',
  joined_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_risks_project ON risks(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_invitations_project ON project_invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_members_project ON project_members(project_id);

-- 启用RLS策略（可选，生产环境建议启用）
-- 注意: 启用RLS后需要配置相应的策略

-- ============================================================
-- Source: 002_add_phase1_tables.sql
-- ============================================================
-- 任务开工条件、阻碍、延期历史、验收计划、WBS模板、前期证照
-- 房地产工程管理系统V4.1 Phase 1 数据库迁移
-- 执行时间: 2026-03-22

-- 1. task_conditions（开工条件表）
CREATE TABLE IF NOT EXISTS task_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('图纸', '材料', '人员', '设备', '其他')),
  name TEXT NOT NULL,
  description TEXT,
  is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  attachments JSONB DEFAULT '[]',
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. task_obstacles（阻碍记录表）
CREATE TABLE IF NOT EXISTS task_obstacles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  obstacle_type TEXT NOT NULL CHECK (obstacle_type IN ('人员', '材料', '设备', '环境', '设计', '其他')),
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT '中' CHECK (severity IN ('低', '中', '高', '严重')),
  status TEXT NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '处理中', '已解决', '无法解决')),
  resolution TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. task_delay_history（延期历史表）
-- Legacy task_delay_history table retired: final schema must not create it.

-- 4. acceptance_plans（验收计划表）
CREATE TABLE IF NOT EXISTS acceptance_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  acceptance_type TEXT NOT NULL CHECK (acceptance_type IN ('分项', '分部', '竣工', '消防', '环保', '规划', '节能', '智能', '其他')),
  acceptance_name TEXT NOT NULL,
  planned_date DATE NOT NULL,
  actual_date DATE,
  status TEXT NOT NULL DEFAULT '待验收' CHECK (status IN ('待验收', '验收中', '已通过', '未通过')),
  documents JSONB DEFAULT '[]',
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. wbs_templates（WBS模板表）
CREATE TABLE IF NOT EXISTS wbs_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('住宅', '商业', '工业', '市政')),
  description TEXT,
  wbs_nodes JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT template_name_unique UNIQUE (template_name, template_type)
);

-- 6. pre_milestones（前期证照表）
CREATE TABLE IF NOT EXISTS pre_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN (
    'land_certificate',
    'land_use_planning_permit',
    'engineering_planning_permit',
    'construction_permit'
  )),
  milestone_name TEXT NOT NULL,
  certificate_type TEXT,
  certificate_name TEXT,
  application_date DATE,
  issue_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'preparing_documents',
    'internal_review',
    'external_submission',
    'supplement_required',
    'approved',
    'issued',
    'expired',
    'voided'
  )),
  certificate_no TEXT,
  current_stage VARCHAR(32),
  planned_finish_date DATE,
  actual_finish_date DATE,
  approving_authority VARCHAR(100),
  issuing_authority TEXT,
  next_action TEXT,
  next_action_due_date DATE,
  is_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  latest_record_at TIMESTAMPTZ,
  description TEXT,
  phase_id UUID,
  lead_unit TEXT,
  planned_start_date DATE,
  planned_end_date DATE,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_task_conditions_task ON task_conditions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_task ON task_obstacles(task_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_plans_project ON acceptance_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_plans_task ON acceptance_plans(task_id);
CREATE INDEX IF NOT EXISTS idx_wbs_templates_type ON wbs_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_project ON pre_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_type ON pre_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_certificate_type ON pre_milestones(project_id, certificate_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_status_current ON pre_milestones(project_id, status);

-- 创建触发器：自动更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_task_conditions_updated_at
  BEFORE UPDATE ON task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_task_obstacles_updated_at
  BEFORE UPDATE ON task_obstacles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_acceptance_plans_updated_at
  BEFORE UPDATE ON acceptance_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wbs_templates_updated_at
  BEFORE UPDATE ON wbs_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pre_milestones_updated_at
  BEFORE UPDATE ON pre_milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Source: 003_add_task_locks_and_logs.sql
-- ============================================================
-- ============================================================
-- Phase 1 补充数据库迁移
-- 房地产工程管理系统V4.1 Phase 1 补充
-- 执行时间: 2026-03-22
-- ============================================================

-- 1. task_locks（定时任务锁表）
CREATE TABLE IF NOT EXISTS task_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 任务标识
    job_name VARCHAR(100) NOT NULL UNIQUE,

    -- 锁状态
    is_locked BOOLEAN DEFAULT FALSE,

    -- 锁信息
    locked_by VARCHAR(100),
    locked_at TIMESTAMP,
    lock_expires_at TIMESTAMP,

    -- 锁配置
    lock_duration_seconds INTEGER DEFAULT 300,
    max_retries INTEGER DEFAULT 3,

    -- 元数据
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. job_execution_logs（定时任务执行日志表）
CREATE TABLE IF NOT EXISTS job_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 任务信息
    job_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50),

    -- 执行状态
    status VARCHAR(20) NOT NULL
      CHECK (status IN ('pending', 'running', 'success', 'failed', 'timeout', 'cancelled')),

    -- 执行时间
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP,
    duration_ms INTEGER,

    -- 输入输出
    input_data JSONB DEFAULT '{}',
    output_data JSONB DEFAULT '{}',
    error_message TEXT,
    error_stack TEXT,

    -- 执行环境
    executed_by VARCHAR(100),
    hostname VARCHAR(100),
    process_id INTEGER,

    -- 重试信息
    retry_count INTEGER DEFAULT 0,
    original_log_id UUID REFERENCES job_execution_logs(id),

    -- 元数据
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 为task_locks表添加updated_at触发器
CREATE TRIGGER update_task_locks_updated_at
  BEFORE UPDATE ON task_locks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_task_locks_job ON task_locks(job_name);
CREATE INDEX IF NOT EXISTS idx_task_locks_locked ON task_locks(is_locked, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_job_logs_name ON job_execution_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_job_logs_started ON job_execution_logs(started_at);

-- 5. task_locks表注释
COMMENT ON TABLE task_locks IS '定时任务锁表，防止分布式环境下的任务重复执行';
COMMENT ON TABLE job_execution_logs IS '定时任务执行日志表，记录任务执行历史';

-- ============================================================
-- Source: 004_add_dashboard_view.sql
-- ============================================================
-- ============================================================
-- Dashboard 物化视图
-- 房地产工程管理系统V4.1 Phase 1
-- 执行时间: 2026-03-22
-- ============================================================

-- 创建物化视图：项目Dashboard统计
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_dashboard AS
SELECT
    p.id AS project_id,
    p.name AS project_name,
    p.status AS project_status,
    p.health_score,
    p.health_status,
    p.start_date,
    p.end_date AS project_end_date,
    p.budget,
    p.location,

    -- 任务统计
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '已完成') AS completed_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '进行中') AS ongoing_tasks,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '未开始') AS pending_tasks,

    -- 里程碑统计
    (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id) AS total_milestones,
    (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.status = '已完成') AS completed_milestones,
    (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.status = '已延期') AS delayed_milestones,

    -- 延期任务统计
    (SELECT COUNT(*) FROM tasks t
     WHERE t.project_id = p.id
     AND t.planned_end_date < CURRENT_DATE
     AND t.status NOT IN ('已完成', '已暂停')) AS overdue_tasks,

    -- 条件统计
    (SELECT COUNT(*) FROM task_conditions tc
     JOIN tasks t ON tc.task_id = t.id
     WHERE t.project_id = p.id) AS total_conditions,
    (SELECT COUNT(*) FROM task_conditions tc
     JOIN tasks t ON tc.task_id = t.id
     WHERE t.project_id = p.id AND tc.status = '已满足') AS satisfied_conditions,
    (SELECT COUNT(*) FROM task_conditions tc
     JOIN tasks t ON tc.task_id = t.id
     WHERE t.project_id = p.id AND tc.status = '未满足') AS unsatisfied_conditions,

    -- 阻碍统计
    (SELECT COUNT(*) FROM task_obstacles ob
     JOIN tasks t ON ob.task_id = t.id
     WHERE t.project_id = p.id) AS total_obstacles,
    (SELECT COUNT(*) FROM task_obstacles ob
     JOIN tasks t ON ob.task_id = t.id
     WHERE t.project_id = p.id AND ob.status = '待处理') AS pending_obstacles,
    (SELECT COUNT(*) FROM task_obstacles ob
     JOIN tasks t ON ob.task_id = t.id
     WHERE t.project_id = p.id AND ob.status = '处理中') AS processing_obstacles,

    -- 验收统计
    (SELECT COUNT(*) FROM acceptance_plans ap
     WHERE ap.project_id = p.id) AS total_acceptance_plans,
    (SELECT COUNT(*) FROM acceptance_plans ap
     WHERE ap.project_id = p.id AND ap.status = '已通过') AS passed_acceptance_plans,
    (SELECT COUNT(*) FROM acceptance_plans ap
     WHERE ap.project_id = p.id AND ap.status = '待验收') AS pending_acceptance_plans,

    -- 证照统计
    (SELECT COUNT(*) FROM pre_milestones pm
     WHERE pm.project_id = p.id) AS total_pre_milestones,
    (SELECT COUNT(*) FROM pre_milestones pm
     WHERE pm.project_id = p.id AND pm.status = 'issued') AS obtained_pre_milestones,
    (SELECT COUNT(*) FROM pre_milestones pm
     WHERE pm.project_id = p.id AND pm.status IN ('preparing_documents', 'internal_review', 'external_submission', 'supplement_required', 'approved')) AS processing_pre_milestones,

    -- 更新时间
    NOW() AS last_refreshed
FROM projects p;

-- 为物化视图创建唯一索引（支持CONCURRENTLY刷新）
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_dashboard_project_id
ON mv_project_dashboard(project_id);

-- 添加注释
COMMENT ON MATERIALIZED VIEW mv_project_dashboard IS '项目Dashboard物化视图，存储项目级统计汇总数据';

-- 6. 创建更多触发器（Phase 1 补充）

-- 6.1 任务完成时自动闭合关联条件
CREATE OR REPLACE FUNCTION auto_complete_conditions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = '已完成' AND OLD.status != '已完成' THEN
    UPDATE task_conditions
    SET status = '已确认', confirmed_at = NOW()
    WHERE task_id = NEW.id AND status = '已满足';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_complete_conditions
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.status = '已完成')
  EXECUTE FUNCTION auto_complete_conditions();

-- 6.2 条件完成时自动更新任务进度
CREATE OR REPLACE FUNCTION update_task_progress_on_condition_complete()
RETURNS TRIGGER AS $$
DECLARE
  v_total_conditions INTEGER;
  v_completed_conditions INTEGER;
  v_progress INTEGER;
BEGIN
  IF NEW.status IN ('已满足', '已确认') AND OLD.status NOT IN ('已满足', '已确认') THEN
    SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_completed_conditions
    FROM task_conditions
    WHERE task_id = NEW.task_id;

    IF v_total_conditions > 0 THEN
      v_progress := ROUND((v_completed_conditions::NUMERIC / v_total_conditions) * 100);
      UPDATE tasks
      SET progress = v_progress
      WHERE id = NEW.task_id AND progress < v_progress;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_task_progress_on_condition
  AFTER UPDATE ON task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_task_progress_on_condition_complete();

-- 6.3 延期历史自动记录（通过任务状态变更触发）
-- Legacy record_task_delay_history trigger function retired.


-- 6.4 Legacy DB health scorer removed; projectHealthService is the authoritative scorer.
DROP FUNCTION IF EXISTS calculate_project_health_score(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_project_health_on_change() CASCADE;
-- Source: 005_add_pre_milestone_conditions.sql
-- ============================================================
-- ============================================================
-- 前期证照条件关联表 + WBS结构表
-- 房地产工程管理系统V4.1 Phase 3
-- 执行时间: 2026-03-22
-- ============================================================

-- 启用ltree扩展（用于WBS层级路径管理）
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA extensions;

-- 1. pre_milestone_conditions（前期证照条件关联表）
CREATE TABLE IF NOT EXISTS pre_milestone_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 关联的证照
    pre_milestone_id UUID NOT NULL
      REFERENCES pre_milestones(id) ON DELETE CASCADE,

    -- 条件信息
    condition_type VARCHAR(50) NOT NULL,
    condition_name TEXT NOT NULL,
    description TEXT,

    -- 状态
    status VARCHAR(20) DEFAULT '待处理'
      CHECK (status IN ('待处理', '已满足', '未满足', '已确认')),

    -- 时间和人员
    target_date DATE,
    completed_date DATE,
    completed_by UUID REFERENCES users(id),
    notes TEXT,

    -- 元数据
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. wbs_structure（WBS层级结构表）
CREATE TABLE IF NOT EXISTS wbs_structure (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- WBS基本信息
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES wbs_structure(id) ON DELETE CASCADE,

    -- WBS编码和路径（使用ltree扩展）
    wbs_code VARCHAR(100) NOT NULL,
    wbs_path extensions.LTREE NOT NULL,
    wbs_level INTEGER NOT NULL CHECK (wbs_level >= 0 AND wbs_level <= 4),

    -- 节点信息
    node_name VARCHAR(200) NOT NULL,
    node_code VARCHAR(50),
    description TEXT,

    -- 层级
    level INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER DEFAULT 0,

    -- 状态
    status VARCHAR(20) DEFAULT '待开始'
      CHECK (status IN ('待开始', '进行中', '已完成', '已暂停', '已取消')),

    -- 时间
    planned_start_date DATE,
    planned_end_date DATE,
    actual_start_date DATE,
    actual_end_date DATE,

    -- 进度
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),

    -- 责任人
    responsible_user_id UUID REFERENCES users(id),

    -- 扩展
    properties JSONB DEFAULT '{}',

    -- 元数据
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. wbs_task_links（WBS节点与任务关联表）
CREATE TABLE IF NOT EXISTS wbs_task_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 关联关系
    wbs_node_id UUID NOT NULL
      REFERENCES wbs_structure(id) ON DELETE CASCADE,
    task_id UUID NOT NULL
      REFERENCES tasks(id) ON DELETE CASCADE,

    -- 关联类型
    link_type VARCHAR(20) DEFAULT 'subtask'
      CHECK (link_type IN ('subtask', 'milestone', 'delivery', 'dependency')),

    -- 元数据
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(wbs_node_id, task_id)
);

-- 4. acceptance_nodes（验收节点表）
CREATE TABLE IF NOT EXISTS acceptance_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 关联验收计划
    acceptance_plan_id UUID NOT NULL
      REFERENCES acceptance_plans(id) ON DELETE CASCADE,

    -- 节点信息
    node_name VARCHAR(200) NOT NULL,
    node_type VARCHAR(50),
    description TEXT,

    -- 状态
    status VARCHAR(20) DEFAULT '待验收'
      CHECK (status IN ('待验收', '验收中', '已通过', '未通过', '需补充')),

    -- 时间
    planned_date DATE,
    actual_date DATE,

    -- 验收结果
    result JSONB DEFAULT '{}',
    documents JSONB DEFAULT '[]',
    notes TEXT,

    -- 验收人
    accepted_by UUID REFERENCES users(id),
    accepted_at TIMESTAMP,

    -- 元数据
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pre_milestone_conditions_milestone
  ON pre_milestone_conditions(pre_milestone_id);

CREATE INDEX IF NOT EXISTS idx_wbs_structure_project
  ON wbs_structure(project_id);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_parent
  ON wbs_structure(parent_id);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_wbs_path
  ON wbs_structure USING GIST(wbs_path);
CREATE INDEX IF NOT EXISTS idx_wbs_structure_wbs_code
  ON wbs_structure(wbs_code);

CREATE INDEX IF NOT EXISTS idx_wbs_task_links_wbs
  ON wbs_task_links(wbs_node_id);
CREATE INDEX IF NOT EXISTS idx_wbs_task_links_task
  ON wbs_task_links(task_id);

CREATE INDEX IF NOT EXISTS idx_acceptance_nodes_plan
  ON acceptance_nodes(acceptance_plan_id);

-- 创建触发器
CREATE TRIGGER update_pre_milestone_conditions_updated_at
  BEFORE UPDATE ON pre_milestone_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wbs_structure_updated_at
  BEFORE UPDATE ON wbs_structure
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_acceptance_nodes_updated_at
  BEFORE UPDATE ON acceptance_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 添加注释
COMMENT ON TABLE pre_milestone_conditions IS '前期证照条件关联表，记录证照办理的前置条件';
COMMENT ON TABLE wbs_structure IS 'WBS层级结构表，存储项目WBS分解结构';
COMMENT ON TABLE wbs_task_links IS 'WBS节点与任务关联表，建立WBS节点与任务的映射关系';
COMMENT ON TABLE acceptance_nodes IS '验收节点表，存储验收计划下的具体验收节点';

-- ============================================================
-- Source: 006_add_task_completion_reports.sql
-- ============================================================
-- 任务完成总结表
-- 房地产工程管理系统V4.1 Phase 3.6 数据库迁移
-- 执行时间: 2026-03-22

-- 1. task_completion_reports（任务完成总结表）
CREATE TABLE IF NOT EXISTS task_completion_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- 基本信息
  report_type TEXT NOT NULL CHECK (report_type IN ('task', 'building', 'sub_project', 'project')),
  title TEXT NOT NULL,
  summary TEXT,

  -- 效率统计
  planned_duration INTEGER NOT NULL,      -- 计划工期（天）
  actual_duration INTEGER NOT NULL,       -- 实际工期（天）
  efficiency_ratio NUMERIC(5, 2) NOT NULL, -- 效率比
  efficiency_status TEXT NOT NULL DEFAULT 'normal' CHECK (efficiency_status IN ('fast', 'normal', 'slow')),

  -- 延期统计
  total_delay_days INTEGER NOT NULL DEFAULT 0,
  delay_count INTEGER NOT NULL DEFAULT 0,
  delay_details JSONB DEFAULT '[]',

  -- 阻碍统计
  obstacle_count INTEGER NOT NULL DEFAULT 0,
  obstacles_summary TEXT,

  -- 完成质量
  quality_score INTEGER CHECK (quality_score BETWEEN 0 AND 100),
  quality_notes TEXT,

  -- 总结内容
  highlights TEXT,
  issues TEXT,
  lessons_learned TEXT,

  -- 元数据
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. task_progress_snapshots（任务进度快照表）- 用于效率计算
CREATE TABLE IF NOT EXISTS task_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
  snapshot_date DATE NOT NULL
  is_auto_generated BOOLEAN DEFAULT TRUE,
  event_type VARCHAR(50),
  event_source VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_task ON task_completion_reports(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_project ON task_completion_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_type ON task_completion_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_task_completion_reports_date ON task_completion_reports(generated_at);

CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_task ON task_progress_snapshots(task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_snapshots_date ON task_progress_snapshots(snapshot_date);

-- 创建触发器：自动更新 updated_at 字段
CREATE TRIGGER update_task_completion_reports_updated_at
  BEFORE UPDATE ON task_completion_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- v1.4.23.1: task completion report durations are service-owned.
-- Clean bootstrap must not recreate the retired SQL duration trigger.
DROP TRIGGER IF EXISTS trigger_auto_generate_report ON tasks;
DROP FUNCTION IF EXISTS auto_generate_completion_report() CASCADE;

-- 创建触发器：任务进度更新时记录快照
CREATE OR REPLACE FUNCTION auto_record_progress_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  -- 只有当进度发生变化时才记录快照
  IF NEW.progress IS DISTINCT FROM OLD.progress THEN
    INSERT INTO task_progress_snapshots (
      task_id,
      progress,
      snapshot_date,
      event_type,
      event_source,
      notes
    )
    VALUES (
      NEW.id,
      NEW.progress,
      CURRENT_DATE,
      'task_update',
      'db_trigger',
      '进度更新: ' || NEW.progress || '%'
    )
    ON CONFLICT (task_id, snapshot_date, event_type, event_source)
    DO UPDATE SET
      progress = EXCLUDED.progress,
      notes = EXCLUDED.notes;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_record_snapshot
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress IS NOT NULL)
  EXECUTE FUNCTION auto_record_progress_snapshot();

-- ============================================================
-- Source: 008_fix_phase36_triggers.sql
-- ============================================================
-- Phase 3.6 触发器字段引用修复
-- 修复问题: P0-001, P0-002
-- 执行时间: 2026-03-22

-- =====================================================
-- v1.4.23.1: legacy completion report duration trigger retired.
-- Historical migrations 006/008 created and patched this trigger, but the
-- clean bootstrap expresses the current schema target and must not recreate it.
-- =====================================================

DROP TRIGGER IF EXISTS trigger_auto_generate_report ON tasks;
DROP FUNCTION IF EXISTS auto_generate_completion_report() CASCADE;

-- =====================================================
-- 修复 2: 添加触发器异常处理（增强健壮性）
-- =====================================================

-- 创建日志表（如果不存在）用于记录触发器异常
CREATE TABLE IF NOT EXISTS trigger_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL,
  record_id UUID,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'warning')),
  message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_trigger_logs_name ON trigger_execution_logs(trigger_name);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_status ON trigger_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_created ON trigger_execution_logs(created_at);

-- 验证 retired trigger cleanup 状态
DO $$
BEGIN
  RAISE NOTICE 'Phase 3.6 legacy completion report trigger cleanup complete:';
  RAISE NOTICE '  - trigger_auto_generate_report retired';
  RAISE NOTICE '  - auto_generate_completion_report retired';
  RAISE NOTICE '  - task completion report durations are generated by taskSummaryService';
END $$;

-- ============================================================
-- Source: 009_add_job_execution_logs.sql
-- ============================================================
-- 创建任务执行日志表
-- 记录所有定时任务的执行历史，便于监控和排查问题

CREATE TABLE IF NOT EXISTS job_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  result JSONB,
  error_message TEXT,
  job_id TEXT,
  triggered_by TEXT CHECK (triggered_by IN ('scheduler', 'manual', 'api')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX idx_job_execution_logs_job_name ON job_execution_logs(job_name);
CREATE INDEX idx_job_execution_logs_status ON job_execution_logs(status);
CREATE INDEX idx_job_execution_logs_started_at ON job_execution_logs(started_at DESC);
CREATE INDEX idx_job_execution_logs_job_id ON job_execution_logs(job_id);

-- 添加注释
COMMENT ON TABLE job_execution_logs IS '定时任务执行日志表，记录所有定时任务的执行历史';
COMMENT ON COLUMN job_execution_logs.job_name IS '任务名称（如: riskStatisticsJob, conditionAlertJob）';
COMMENT ON COLUMN job_execution_logs.status IS '执行状态: success=成功, error=失败, timeout=超时';
COMMENT ON COLUMN job_execution_logs.started_at IS '任务开始时间';
COMMENT ON COLUMN job_execution_logs.completed_at IS '任务完成时间';
COMMENT ON COLUMN job_execution_logs.duration_ms IS '任务执行时长（毫秒）';
COMMENT ON COLUMN job_execution_logs.result IS '任务执行结果（JSON格式）';
COMMENT ON COLUMN job_execution_logs.error_message IS '错误消息（仅当status=error时有值）';
COMMENT ON COLUMN job_execution_logs.job_id IS '任务执行ID（用于追踪手动触发的任务）';
COMMENT ON COLUMN job_execution_logs.triggered_by IS '触发方式: scheduler=定时调度, manual=手动触发, api=API调用';

-- 创建清理旧日志的函数（保留最近90天）
CREATE OR REPLACE FUNCTION cleanup_old_job_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM job_execution_logs
  WHERE started_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 添加注释
COMMENT ON FUNCTION cleanup_old_job_logs IS '清理90天前的旧任务执行日志';

-- ============================================================
-- Source: 009b_fix_delivery_issues.sql
-- ============================================================
-- ============================================================
-- 修复交付计划遗留问题
-- 房地产工程管理系统V4.1 补丁迁移
-- 执行时间: 2026-03-23
-- 修复内容:
--   DEL-001 (P1): 创建 task_milestones 任务里程碑关联表
--   DEL-002 (P2): 创建 trg_pre_milestone_status_update 触发器
-- ============================================================

-- ============================================================
-- DEL-001: task_milestones（任务里程碑关联表）
-- 用于关联任务和里程碑，支持里程碑作为里程碑子类型
-- ============================================================

CREATE TABLE IF NOT EXISTS task_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 关联任务
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

    -- 关联里程碑
    milestone_id UUID NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,

    -- 关联类型：关联/关键/依赖
    relation_type TEXT NOT NULL DEFAULT '关联'
        CHECK (relation_type IN ('关联', '关键', '依赖')),

    -- 元数据
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 唯一约束：同一任务不重复关联同一里程碑
    UNIQUE(task_id, milestone_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_task_milestones_task
    ON task_milestones(task_id);

CREATE INDEX IF NOT EXISTS idx_task_milestones_milestone
    ON task_milestones(milestone_id);

-- updated_at 自动更新触发器
CREATE TRIGGER update_task_milestones_updated_at
    BEFORE UPDATE ON task_milestones
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DEL-002: trg_pre_milestone_status_update
-- 前期里程碑状态自动更新触发器
-- 当 pre_milestone_conditions 全部满足时，自动将 pre_milestone 状态改为"issued"
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_pre_milestone_status()
RETURNS TRIGGER AS $$
DECLARE
    v_pre_milestone_id UUID;
    v_total_conditions INTEGER;
    v_satisfied_conditions INTEGER;
    v_current_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_pre_milestone_id := OLD.pre_milestone_id;
    ELSE
        v_pre_milestone_id := NEW.pre_milestone_id;
    END IF;

    SELECT status INTO v_current_status
    FROM pre_milestones
    WHERE id = v_pre_milestone_id;

    IF v_current_status IN ('issued', 'expired', 'voided') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_satisfied_conditions
    FROM pre_milestone_conditions
    WHERE pre_milestone_id = v_pre_milestone_id;

    IF v_total_conditions > 0 AND v_total_conditions = v_satisfied_conditions THEN
        UPDATE pre_milestones
        SET status = 'issued',
            issue_date = COALESCE(issue_date, CURRENT_DATE),
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status NOT IN ('issued', 'expired', 'voided');
    ELSIF v_satisfied_conditions > 0 AND v_current_status = 'pending' THEN
        UPDATE pre_milestones
        SET status = 'preparing_documents',
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status = 'pending';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_pre_milestone_status_update
    AFTER INSERT OR UPDATE OR DELETE ON pre_milestone_conditions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_pre_milestone_status();

DROP TRIGGER IF EXISTS trigger_update_risk_statistics_updated_at ON risk_statistics;
CREATE TRIGGER trigger_update_risk_statistics_updated_at
  BEFORE UPDATE ON risk_statistics
  FOR EACH ROW
  EXECUTE FUNCTION update_risk_statistics_updated_at();

-- 启用RLS
ALTER TABLE risk_statistics ENABLE ROW LEVEL SECURITY;

-- RLS策略：用户只能查看自己有权限的项目的数据
CREATE POLICY risk_statistics_select_policy ON risk_statistics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE p.id = risk_statistics.project_id
      AND pm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE risk_statistics IS '每日风险统计快照表，用于趋势分析';
COMMENT ON COLUMN risk_statistics.new_risks IS '当日新增风险总数';
COMMENT ON COLUMN risk_statistics.resolved_risks IS '当日已处理风险总数';
COMMENT ON COLUMN risk_statistics.total_risks IS '当日结束时风险存量';

-- ============================================================
-- Legacy project_health_details table removed; projectHealthService details are returned by API and project_daily_snapshot owns trends.
DROP TABLE IF EXISTS project_health_details CASCADE;
DROP FUNCTION IF EXISTS update_project_health_details_updated_at() CASCADE;
-- Source: 015_add_license_phase_management.sql
-- ============================================================
-- 证照管理优化 - 添加阶段管理和审批进度跟踪
-- 执行前请在 Supabase SQL Editor 中运行

-- 1. 给 projects 表添加阶段管理相关字段
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS current_phase VARCHAR(50) DEFAULT 'pre-construction'
  CHECK (current_phase IN ('pre-construction', 'construction', 'completion', 'delivery')),
ADD COLUMN IF NOT EXISTS construction_unlock_date DATE,
ADD COLUMN IF NOT EXISTS construction_unlock_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS default_wbs_generated BOOLEAN DEFAULT FALSE;

-- 2. 创建证照审批进度跟踪表
CREATE TABLE IF NOT EXISTS certificate_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 关联的证照
  pre_milestone_id UUID NOT NULL
    REFERENCES pre_milestones(id) ON DELETE CASCADE,

  -- 审批步骤
  approval_step INTEGER NOT NULL DEFAULT 1,
  step_name VARCHAR(100) NOT NULL,
  step_description TEXT,

  -- 审批状态
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'returned')),

  -- 审批人员
  approver_name VARCHAR(100),
  approver_unit VARCHAR(100),

  -- 时间
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,

  -- 审批意见
  approval_comment TEXT,

  -- 排序
  sort_order INTEGER DEFAULT 0,

  -- 元数据
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_certificate_approvals_milestone
  ON certificate_approvals(pre_milestone_id);

-- 3. 创建证照依赖关系表
CREATE TABLE IF NOT EXISTS pre_milestone_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 源证照（依赖方）
  source_milestone_id UUID NOT NULL
    REFERENCES pre_milestones(id) ON DELETE CASCADE,

  -- 目标证照（被依赖方）
  target_milestone_id UUID NOT NULL
    REFERENCES pre_milestones(id) ON DELETE CASCADE,

  -- 依赖类型
  dependency_kind VARCHAR(20) DEFAULT 'hard'
    CHECK (dependency_kind IN ('hard', 'soft')),

  -- 描述
  description TEXT,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(source_milestone_id, target_milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_pre_milestone_deps_source
  ON pre_milestone_dependencies(source_milestone_id);
CREATE INDEX IF NOT EXISTS idx_pre_milestone_deps_target
  ON pre_milestone_dependencies(target_milestone_id);

-- 4. 创建默认施工阶段WBS模板
ALTER TABLE wbs_templates
ADD COLUMN IF NOT EXISTS is_construction_default BOOLEAN DEFAULT FALSE;

-- 5. 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_certificate_approvals_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_certificate_approvals_updated_at
  BEFORE UPDATE ON certificate_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_certificate_approvals_timestamp();

-- 注释
COMMENT ON TABLE projects IS '项目表 - 添加了阶段管理字段';
COMMENT ON TABLE certificate_approvals IS '证照审批进度跟踪表';
COMMENT ON TABLE pre_milestone_dependencies IS '证照依赖关系表';

-- ============================================================
-- Source: 016_add_risk_category.sql
-- ============================================================
-- 为 risks 表添加 risk_category 字段（风险类型：进度/质量/成本/安全/合同/外部/其他）
ALTER TABLE risks ADD COLUMN IF NOT EXISTS risk_category VARCHAR(20) DEFAULT 'other';

-- 为已有记录推断默认类型（全部设为 other，由用户手动更新）
COMMENT ON COLUMN risks.risk_category IS '风险类型：progress(进度)/quality(质量)/cost(成本)/safety(安全)/contract(合同)/external(外部)/other(其他)';

-- ============================================================
-- Source: 017_add_standard_processes.sql
-- ============================================================
-- Migration 017: 标准工序库表
-- F4: 提供可搜索的标准工序参考数据，供用户在创建WBS模板时参考和引用

CREATE TABLE IF NOT EXISTS standard_processes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,                    -- 工序名称，如"地基开挖"
  category   TEXT NOT NULL DEFAULT 'general',  -- 分类：civil/structure/fitout/mep/general
  phase      TEXT,                             -- 所属阶段：foundation/structure/enclosure/mep/fitout
  reference_days INTEGER,                      -- 参考工期（天）
  description    TEXT,                         -- 工序说明
  tags       TEXT[] DEFAULT '{}',              -- 搜索标签
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_standard_processes_category ON standard_processes(category);
CREATE INDEX IF NOT EXISTS idx_standard_processes_is_active ON standard_processes(is_active);
CREATE INDEX IF NOT EXISTS idx_standard_processes_name ON standard_processes USING gin(to_tsvector('simple', name));

-- 种子数据：常见建筑工序
INSERT INTO standard_processes (name, category, phase, reference_days, description, tags, sort_order) VALUES
  ('场地平整', 'civil', 'preparation', 5,  '建设场地的清理与平整工作',        ARRAY['土方','基础准备'], 10),
  ('基坑开挖', 'civil', 'foundation',  15, '按设计深度开挖基坑',              ARRAY['土方','地基'], 20),
  ('基坑支护', 'civil', 'foundation',  20, '基坑围护结构施工',                ARRAY['支护','安全'], 30),
  ('地基处理', 'civil', 'foundation',  10, '软弱地基的加固处理',              ARRAY['地基','加固'], 40),
  ('桩基施工', 'civil', 'foundation',  25, '钻孔灌注桩或预制桩施工',          ARRAY['桩基','地基'], 50),
  ('基础垫层', 'civil', 'foundation',  3,  '混凝土垫层浇筑',                  ARRAY['混凝土','基础'], 60),
  ('基础施工', 'structure', 'foundation', 20, '独立基础或条形基础施工',         ARRAY['混凝土','基础'], 70),
  ('地下室底板', 'structure', 'foundation', 15, '地下室底板钢筋绑扎及混凝土浇筑', ARRAY['混凝土','防水'], 80),
  ('地下室外墙', 'structure', 'foundation', 20, '地下室外墙施工',               ARRAY['混凝土','防水'], 90),
  ('地下室顶板', 'structure', 'foundation', 15, '地下室顶板施工',               ARRAY['混凝土'], 100),

  ('一层结构施工', 'structure', 'structure', 14, '首层钢筋绑扎、模板、混凝土浇筑', ARRAY['主体','混凝土'], 110),
  ('标准层结构施工', 'structure', 'structure', 10, '标准层流水施工',             ARRAY['主体','混凝土'], 120),
  ('楼板施工', 'structure', 'structure', 8, '楼板钢筋绑扎及混凝土浇筑',       ARRAY['主体','楼板'], 130),
  ('楼梯施工', 'structure', 'structure', 5, '现浇楼梯施工',                    ARRAY['主体','楼梯'], 140),
  ('屋面结构', 'structure', 'structure', 7, '屋面板施工',                      ARRAY['主体','屋面'], 150),

  ('外墙砌筑', 'fitout', 'enclosure', 15, '外围护墙体砌筑',                   ARRAY['砌体','外墙'], 160),
  ('内墙砌筑', 'fitout', 'enclosure', 20, '内隔墙砌筑',                       ARRAY['砌体','内墙'], 170),
  ('外墙保温', 'fitout', 'enclosure', 15, '外墙保温系统施工',                  ARRAY['保温','节能'], 180),
  ('外墙涂料', 'fitout', 'enclosure', 10, '外立面涂料施工',                    ARRAY['外立面','涂料'], 190),
  ('屋面防水', 'fitout', 'enclosure', 8, '屋面防水层施工',                    ARRAY['防水','屋面'], 200),
  ('外窗安装', 'fitout', 'enclosure', 10, '铝合金门窗安装',                    ARRAY['门窗','外立面'], 210),

  ('给排水管道', 'mep', 'mep', 20, '给排水主管道及支管安装',                   ARRAY['水电','给排水'], 220),
  ('强电线管', 'mep', 'mep', 15, '电气线管预埋及桥架安装',                    ARRAY['水电','强电'], 230),
  ('弱电线管', 'mep', 'mep', 12, '弱电系统管线安装',                         ARRAY['水电','弱电'], 240),
  ('通风空调', 'mep', 'mep', 25, '通风空调系统安装',                          ARRAY['机电','空调'], 250),
  ('消防系统', 'mep', 'mep', 20, '消防管道及喷淋系统安装',                    ARRAY['机电','消防'], 260),
  ('电梯安装', 'mep', 'mep', 30, '电梯设备安装及调试',                        ARRAY['机电','电梯'], 270),

  ('地面找平', 'fitout', 'fitout', 5, '地面找平层施工',                       ARRAY['装修','地面'], 280),
  ('内墙抹灰', 'fitout', 'fitout', 10, '内墙抹灰找平',                        ARRAY['装修','抹灰'], 290),
  ('内墙涂料', 'fitout', 'fitout', 8, '内墙乳胶漆施工',                       ARRAY['装修','涂料'], 300),
  ('地砖铺贴', 'fitout', 'fitout', 10, '地砖或木地板铺设',                    ARRAY['装修','地面'], 310),
  ('吊顶施工', 'fitout', 'fitout', 8, '轻钢龙骨吊顶施工',                     ARRAY['装修','吊顶'], 320),
  ('卫生洁具安装', 'fitout', 'fitout', 5, '卫浴设备安装调试',                  ARRAY['装修','洁具'], 330),
  ('门窗套安装', 'fitout', 'fitout', 7, '内门及门套安装',                      ARRAY['装修','门窗'], 340),

  ('竣工清理', 'general', 'completion', 5, '施工垃圾清运及场地清洁',           ARRAY['竣工','清理'], 350),
  ('竣工验收', 'general', 'completion', 7, '组织竣工验收手续',                  ARRAY['竣工','验收'], 360),
  ('质量检测', 'general', 'completion', 5, '各分部分项工程质量检测',            ARRAY['质量','检测'], 370),
  ('档案整理', 'general', 'completion', 3, '工程资料整理归档',                  ARRAY['竣工','档案'], 380)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Consolidated P0 contract alignment (folded from 056/065/066/067/068/084)
-- ============================================================

CREATE TABLE IF NOT EXISTS issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_type VARCHAR(60) NOT NULL
    CHECK (source_type IN ('manual', 'risk_converted', 'risk_auto_escalated', 'obstacle_escalated', 'condition_expired', 'source_deleted')),
  source_id UUID,
  chain_id UUID,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  priority INTEGER NOT NULL DEFAULT 50,
  pending_manual_close BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  closed_reason VARCHAR(100),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_issues_source
  ON issues (source_id, source_type)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_chain_id
  ON issues (chain_id)
  WHERE chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_project
  ON issues (project_id);
CREATE INDEX IF NOT EXISTS idx_issues_task
  ON issues (task_id)
  WHERE task_id IS NOT NULL;

DROP TRIGGER IF EXISTS issues_updated_at ON issues;
CREATE TRIGGER issues_updated_at
  BEFORE UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS participant_units (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  unit_type TEXT NOT NULL,
  contact_name TEXT,
  contact_role TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_participant_units_project_id
  ON participant_units(project_id);
CREATE INDEX IF NOT EXISTS idx_participant_units_unit_name
  ON participant_units(unit_name);
CREATE INDEX IF NOT EXISTS idx_participant_units_unit_type
  ON participant_units(unit_type);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES participant_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_participant_unit_id
  ON tasks(participant_unit_id);

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES participant_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_participant_unit_id
  ON acceptance_plans(participant_unit_id);

ALTER TABLE task_progress_snapshots
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_source VARCHAR(50);

UPDATE task_progress_snapshots
SET
  event_type = COALESCE(event_type, 'task_update'),
  event_source = COALESCE(event_source, CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END)
WHERE event_type IS NULL
   OR event_source IS NULL;

-- Consolidated post-057 schema alignment block (2026-04-16)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS operation_logs (
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

ALTER TABLE IF EXISTS operation_logs
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS resource_type TEXT,
  ADD COLUMN IF NOT EXISTS resource_id TEXT,
  ADD COLUMN IF NOT EXISTS method TEXT,
  ADD COLUMN IF NOT EXISTS path TEXT,
  ADD COLUMN IF NOT EXISTS status_code INTEGER,
  ADD COLUMN IF NOT EXISTS request_body JSONB,
  ADD COLUMN IF NOT EXISTS detail JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_operation_logs_user_id ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_project_id ON operation_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_action ON operation_logs(action);
CREATE INDEX IF NOT EXISTS idx_operation_logs_created_at ON operation_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  entity_type VARCHAR(60) NOT NULL
    CHECK (entity_type IN (
      'task',
      'risk',
      'issue',
      'delay_request',
      'milestone',
      'monthly_plan',
      'baseline',
      'task_condition',
      'task_obstacle'
    )),
  entity_id UUID NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_reason TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_source VARCHAR(40) NOT NULL DEFAULT 'manual_adjusted'
    CHECK (change_source IN (
      'system_auto',
      'manual_adjusted',
      'admin_force',
      'approval',
      'monthly_plan_correction',
      'baseline_revision'
    ))
);

CREATE INDEX IF NOT EXISTS idx_change_logs_entity ON change_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_project ON change_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_at ON change_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_logs_changed_by ON change_logs(changed_by)
  WHERE changed_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign', 'archived')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  source_type VARCHAR(30) NOT NULL DEFAULT 'current_schedule'
    CHECK (source_type IN ('manual', 'current_schedule', 'imported_file', 'carryover')),
  source_version_id UUID,
  source_version_label TEXT,
  effective_from DATE,
  effective_to DATE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS task_baseline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_version_id UUID NOT NULL REFERENCES task_baselines(id) ON DELETE CASCADE,
  parent_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  source_milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  target_progress NUMERIC(6,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_milestone BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  is_baseline_critical BOOLEAN NOT NULL DEFAULT FALSE,
  mapping_status VARCHAR(20) NOT NULL DEFAULT 'mapped'
    CHECK (mapping_status IN ('mapped', 'pending', 'missing', 'merged')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS monthly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign')),
  month VARCHAR(7) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  source_version_id UUID,
  source_version_label TEXT,
  closeout_at TIMESTAMPTZ,
  carryover_item_count INTEGER DEFAULT 0,
  data_confidence_score NUMERIC(5,2),
  data_confidence_flag TEXT,
  data_confidence_note TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, month, version)
);

CREATE TABLE IF NOT EXISTS monthly_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  monthly_plan_version_id UUID NOT NULL REFERENCES monthly_plans(id) ON DELETE CASCADE,
  baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  carryover_from_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS planning_draft_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  draft_type VARCHAR(20) NOT NULL
    CHECK (draft_type IN ('baseline', 'monthly_plan')),
  resource_id UUID NOT NULL,
  locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lock_expires_at TIMESTAMPTZ NOT NULL,
  reminder_sent_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id) ON DELETE SET NULL,
  release_reason VARCHAR(30)
    CHECK (release_reason IN ('timeout', 'force_unlock', 'manual_release')),
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, draft_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_task_baselines_project_id ON task_baselines(project_id);
CREATE INDEX IF NOT EXISTS idx_task_baselines_status ON task_baselines(status);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_baseline_version_id ON task_baseline_items(baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_project_id ON task_baseline_items(project_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_project_id ON monthly_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_month ON monthly_plans(month);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_plan_version_id ON monthly_plan_items(monthly_plan_version_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_project_id ON monthly_plan_items(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_project_id ON planning_draft_locks(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_expiry ON planning_draft_locks(is_locked, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_planning_draft_locks_resource_id ON planning_draft_locks(resource_id);

CREATE TABLE IF NOT EXISTS planning_governance_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_planning_governance_states_project_id ON planning_governance_states(project_id);
CREATE INDEX IF NOT EXISTS idx_planning_governance_states_status ON planning_governance_states(status);
CREATE INDEX IF NOT EXISTS idx_planning_governance_states_category ON planning_governance_states(category);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_baseline_item_id ON tasks(baseline_item_id);
CREATE INDEX IF NOT EXISTS idx_tasks_monthly_plan_item_id ON tasks(monthly_plan_item_id);

ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS baseline_date DATE,
  ADD COLUMN IF NOT EXISTS current_plan_date DATE,
  ADD COLUMN IF NOT EXISTS actual_date DATE;

CREATE INDEX IF NOT EXISTS idx_milestones_baseline_date ON milestones(baseline_date);
CREATE INDEX IF NOT EXISTS idx_milestones_current_plan_date ON milestones(current_plan_date);
CREATE INDEX IF NOT EXISTS idx_milestones_actual_date ON milestones(actual_date);

-- Legacy delay_requests table retired: final schema must not create it.




ALTER TABLE task_progress_snapshots
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_source VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS conditions_met_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conditions_total_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS obstacles_active_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_auto_generated BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_version_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS monthly_plan_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planning_source_type VARCHAR(30) DEFAULT 'execution'
    CHECK (planning_source_type IN ('baseline', 'monthly_plan', 'current_schedule', 'execution')),
  ADD COLUMN IF NOT EXISTS planning_source_version_id UUID,
  ADD COLUMN IF NOT EXISTS planning_source_item_id UUID;

UPDATE task_progress_snapshots
SET
  event_type = COALESCE(event_type, 'task_update'),
  event_source = COALESCE(event_source, CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END),
  conditions_met_count = COALESCE(conditions_met_count, 0),
  conditions_total_count = COALESCE(conditions_total_count, 0),
  obstacles_active_count = COALESCE(obstacles_active_count, 0),
  planning_source_type = COALESCE(planning_source_type, 'execution')
WHERE event_type IS NULL
   OR event_source IS NULL
   OR conditions_met_count IS NULL
   OR conditions_total_count IS NULL
   OR obstacles_active_count IS NULL
   OR planning_source_type IS NULL;

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS building_id TEXT,
  ADD COLUMN IF NOT EXISTS scope_level TEXT,
  ADD COLUMN IF NOT EXISTS catalog_id UUID,
  ADD COLUMN IF NOT EXISTS type_id TEXT,
  ADD COLUMN IF NOT EXISTS type_name TEXT,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS phase_order INTEGER,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER,
  ADD COLUMN IF NOT EXISTS parallel_group_id TEXT,
  ADD COLUMN IF NOT EXISTS position JSONB,
  ADD COLUMN IF NOT EXISTS depends_on JSONB,
  ADD COLUMN IF NOT EXISTS depended_by JSONB;

CREATE TABLE IF NOT EXISTS acceptance_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  catalog_code TEXT,
  catalog_name TEXT NOT NULL,
  phase_code TEXT,
  scope_level TEXT,
  planned_finish_date DATE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acceptance_catalog_project_code
  ON acceptance_catalog(project_id, catalog_code)
  WHERE catalog_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_catalog_project_id
  ON acceptance_catalog(project_id);

CREATE TABLE IF NOT EXISTS acceptance_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  source_plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  target_plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  dependency_kind TEXT NOT NULL DEFAULT 'hard'
    CHECK (dependency_kind IN ('hard', 'soft')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_project_id
  ON acceptance_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_source_plan_id
  ON acceptance_dependencies(source_plan_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_target_plan_id
  ON acceptance_dependencies(target_plan_id);

CREATE TABLE IF NOT EXISTS acceptance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  requirement_type TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  drawing_package_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE acceptance_requirements
  ADD COLUMN IF NOT EXISTS drawing_package_id UUID;

CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_project_id
  ON acceptance_requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_plan_id
  ON acceptance_requirements(plan_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_drawing_package_id
  ON acceptance_requirements(drawing_package_id);

ALTER TABLE acceptance_records
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS record_type TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS operator TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB;

CREATE INDEX IF NOT EXISTS idx_acceptance_records_project_id
  ON acceptance_records(project_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_plan_id
  ON acceptance_records(plan_id);

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_catalog_id
  ON acceptance_plans(catalog_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_acceptance_plans_catalog_id'
  ) THEN
    EXECUTE '
      ALTER TABLE acceptance_plans
      ADD CONSTRAINT fk_acceptance_plans_catalog_id
      FOREIGN KEY (catalog_id)
      REFERENCES acceptance_catalog(id)
      ON DELETE RESTRICT
      ON UPDATE CASCADE
    ';
  END IF;
END $$;

ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS drawing_package_id UUID NULL,
  ADD COLUMN IF NOT EXISTS drawing_package_code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_task_conditions_drawing_package_id
  ON task_conditions(drawing_package_id);
CREATE INDEX IF NOT EXISTS idx_task_conditions_drawing_package_code
  ON task_conditions(drawing_package_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_task_conditions_drawing_package_id'
  ) THEN
    EXECUTE '
      ALTER TABLE task_conditions
      ADD CONSTRAINT fk_task_conditions_drawing_package_id
      FOREIGN KEY (drawing_package_id)
      REFERENCES drawing_packages(id)
      ON DELETE SET NULL
    ';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS certificate_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_code VARCHAR(64),
  item_name VARCHAR(200) NOT NULL,
  item_stage VARCHAR(32) NOT NULL DEFAULT '资料准备'
    CHECK (item_stage IN ('资料准备', '内部报审', '外部报批', '批复领证')),
  status VARCHAR(40) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'preparing_documents',
      'internal_review',
      'external_submission',
      'supplement_required',
      'approved',
      'issued',
      'expired',
      'voided'
    )),
  planned_finish_date DATE,
  actual_finish_date DATE,
  approving_authority VARCHAR(100),
  is_shared BOOLEAN DEFAULT FALSE,
  next_action TEXT,
  next_action_due_date DATE,
  is_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  latest_record_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS certificate_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  predecessor_type VARCHAR(20) NOT NULL
    CHECK (predecessor_type IN ('certificate', 'work_item')),
  predecessor_id UUID NOT NULL,
  successor_type VARCHAR(20) NOT NULL
    CHECK (successor_type IN ('certificate', 'work_item')),
  successor_id UUID NOT NULL,
  dependency_kind VARCHAR(20) NOT NULL DEFAULT 'hard'
    CHECK (dependency_kind IN ('hard', 'soft')),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind)
);

CREATE INDEX IF NOT EXISTS idx_certificate_work_items_project
  ON certificate_work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_certificate_work_items_stage
  ON certificate_work_items(project_id, item_stage);
CREATE INDEX IF NOT EXISTS idx_certificate_work_items_status
  ON certificate_work_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_project
  ON certificate_dependencies(project_id);
CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_predecessor
  ON certificate_dependencies(project_id, predecessor_type, predecessor_id);
CREATE INDEX IF NOT EXISTS idx_certificate_dependencies_successor
  ON certificate_dependencies(project_id, successor_type, successor_id);

CREATE OR REPLACE FUNCTION update_certificate_work_items_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_certificate_work_items_updated_at ON certificate_work_items;
CREATE TRIGGER update_certificate_work_items_updated_at
  BEFORE UPDATE ON certificate_work_items
  FOR EACH ROW
  EXECUTE FUNCTION update_certificate_work_items_timestamp();

CREATE OR REPLACE FUNCTION create_certificate_work_item_atomic(
  p_id UUID,
  p_project_id UUID,
  p_item_code VARCHAR(64),
  p_item_name VARCHAR(200),
  p_item_stage VARCHAR(32),
  p_status VARCHAR(40),
  p_planned_finish_date DATE,
  p_actual_finish_date DATE,
  p_approving_authority VARCHAR(100),
  p_is_shared BOOLEAN,
  p_next_action TEXT,
  p_next_action_due_date DATE,
  p_is_blocked BOOLEAN,
  p_block_reason TEXT,
  p_sort_order INTEGER,
  p_notes TEXT,
  p_latest_record_at TIMESTAMP,
  p_certificate_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS certificate_work_items
LANGUAGE plpgsql
AS $$
DECLARE
  v_work_item certificate_work_items%ROWTYPE;
  v_certificate_id UUID;
BEGIN
  INSERT INTO certificate_work_items (
    id,
    project_id,
    item_code,
    item_name,
    item_stage,
    status,
    planned_finish_date,
    actual_finish_date,
    approving_authority,
    is_shared,
    next_action,
    next_action_due_date,
    is_blocked,
    block_reason,
    sort_order,
    notes,
    latest_record_at,
    created_at,
    updated_at
  ) VALUES (
    p_id,
    p_project_id,
    p_item_code,
    p_item_name,
    p_item_stage,
    p_status,
    p_planned_finish_date,
    p_actual_finish_date,
    p_approving_authority,
    p_is_shared,
    p_next_action,
    p_next_action_due_date,
    p_is_blocked,
    p_block_reason,
    p_sort_order,
    p_notes,
    COALESCE(p_latest_record_at, NOW()),
    NOW(),
    NOW()
  )
  RETURNING * INTO v_work_item;

  IF p_certificate_ids IS NOT NULL THEN
    FOREACH v_certificate_id IN ARRAY p_certificate_ids LOOP
      INSERT INTO certificate_dependencies (
        id,
        project_id,
        predecessor_type,
        predecessor_id,
        successor_type,
        successor_id,
        dependency_kind,
        notes,
        created_at
      ) VALUES (
        gen_random_uuid(),
        p_project_id,
        'certificate',
        v_certificate_id,
        'work_item',
        p_id,
        'hard',
        NULL,
        NOW()
      );
    END LOOP;
  END IF;

  RETURN v_work_item;
END;
$$;

CREATE TABLE IF NOT EXISTS task_critical_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  mode VARCHAR(32) NOT NULL CHECK (mode IN ('manual_attention', 'manual_insert')),
  anchor_type VARCHAR(16) CHECK (anchor_type IN ('before', 'after', 'between')),
  left_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  right_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT task_critical_overrides_unique_task_mode UNIQUE (project_id, task_id, mode),
  CONSTRAINT task_critical_overrides_manual_insert_anchor_check CHECK (
    mode <> 'manual_insert'
    OR anchor_type IS NOT NULL
  ),
  CONSTRAINT task_critical_overrides_manual_insert_anchor_ref_check CHECK (
    mode <> 'manual_insert'
    OR left_task_id IS NOT NULL
    OR right_task_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_task_critical_overrides_project_id
  ON task_critical_overrides(project_id);
CREATE INDEX IF NOT EXISTS idx_task_critical_overrides_task_id
  ON task_critical_overrides(task_id);

INSERT INTO task_critical_overrides (
  id,
  project_id,
  task_id,
  mode,
  anchor_type,
  left_task_id,
  right_task_id,
  reason,
  created_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  t.project_id,
  t.id,
  'manual_attention',
  NULL,
  NULL,
  NULL,
  'migrated from tasks.is_critical',
  NULL,
  NOW(),
  NOW()
FROM tasks t
WHERE t.is_critical = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM task_critical_overrides o
    WHERE o.project_id = t.project_id
      AND o.task_id = t.id
      AND o.mode = 'manual_attention'
  );

-- Final cleanup: 延期申请审批流已从计划模型移除，初始化脚本最终态不保留旧表/旧函数/旧字段。
DO $$
BEGIN
  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trigger_record_task_delay ON public.tasks;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.record_task_delay_history() CASCADE;
DROP FUNCTION IF EXISTS public.approve_delay_request_atomic(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.reject_delay_request_atomic(UUID, UUID) CASCADE;

ALTER TABLE IF EXISTS public.notifications
  DROP COLUMN IF EXISTS delay_request_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_daily_snapshot'
      AND column_name = 'active_delay_requests'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_daily_snapshot'
        AND column_name = 'active_delayed_tasks'
    ) THEN
      ALTER TABLE public.project_daily_snapshot
        RENAME COLUMN active_delay_requests TO active_delayed_tasks;
    ELSE
      UPDATE public.project_daily_snapshot
      SET active_delayed_tasks = COALESCE(active_delayed_tasks, active_delay_requests)
      WHERE active_delayed_tasks IS NULL
        AND active_delay_requests IS NOT NULL;
      ALTER TABLE public.project_daily_snapshot
        DROP COLUMN active_delay_requests;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.delay_requests CASCADE;
DROP TABLE IF EXISTS public.task_delay_history CASCADE;

CREATE TABLE IF NOT EXISTS warning_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NULL REFERENCES tasks(id) ON DELETE CASCADE,
  warning_type VARCHAR(50) NOT NULL,
  warning_signature VARCHAR(255) NOT NULL,
  acked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_warning_acknowledgments_user_signature
  ON warning_acknowledgments(user_id, warning_signature);
CREATE INDEX IF NOT EXISTS idx_warning_acknowledgments_project
  ON warning_acknowledgments(project_id, user_id);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_to_risk_id UUID,
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_source TEXT;

ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS severity_escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS severity_manually_overridden BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS is_baseline_critical BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_baseline_critical
  ON task_baseline_items (baseline_version_id, is_baseline_critical);

CREATE INDEX IF NOT EXISTS idx_notifications_warning_chain_id
  ON notifications(chain_id)
  WHERE chain_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_warning_source_signature
  ON notifications(source_entity_type, source_entity_id)
  WHERE source_entity_type = 'warning';
CREATE INDEX IF NOT EXISTS idx_notifications_warning_status
  ON notifications(status, source_entity_type)
  WHERE source_entity_type = 'warning';

CREATE TABLE IF NOT EXISTS drawing_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL,
  package_name TEXT NOT NULL,
  discipline_type TEXT NOT NULL,
  document_purpose TEXT NOT NULL DEFAULT '施工执行',
  status TEXT NOT NULL DEFAULT 'pending',
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_mode TEXT NOT NULL DEFAULT 'none',
  review_basis TEXT,
  completeness_ratio NUMERIC(5, 2) NOT NULL DEFAULT 0,
  missing_required_count INT NOT NULL DEFAULT 0,
  current_version_drawing_id UUID,
  has_change BOOLEAN NOT NULL DEFAULT FALSE,
  schedule_impact_flag BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready_for_construction BOOLEAN NOT NULL DEFAULT FALSE,
  is_ready_for_acceptance BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, package_code)
);

CREATE TABLE IF NOT EXISTS drawing_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES drawing_packages(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  current_drawing_id UUID,
  current_version TEXT,
  status TEXT NOT NULL DEFAULT 'missing',
  notes TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (package_id, item_code)
);

CREATE TABLE IF NOT EXISTS drawing_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES drawing_packages(id) ON DELETE CASCADE,
  drawing_id UUID NOT NULL REFERENCES construction_drawings(id) ON DELETE CASCADE,
  version_no TEXT NOT NULL,
  previous_version_id UUID REFERENCES drawing_versions(id) ON DELETE SET NULL,
  is_current_version BOOLEAN NOT NULL DEFAULT FALSE,
  change_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (drawing_id, version_no)
);

CREATE TABLE IF NOT EXISTS drawing_review_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  package_code TEXT,
  discipline_type TEXT,
  document_purpose TEXT,
  default_review_mode TEXT NOT NULL DEFAULT 'none',
  review_basis TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE construction_drawings
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES drawing_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_code TEXT,
  ADD COLUMN IF NOT EXISTS package_name TEXT,
  ADD COLUMN IF NOT EXISTS discipline_type TEXT,
  ADD COLUMN IF NOT EXISTS document_purpose TEXT DEFAULT '施工执行',
  ADD COLUMN IF NOT EXISTS drawing_code TEXT,
  ADD COLUMN IF NOT EXISTS version_no TEXT,
  ADD COLUMN IF NOT EXISTS is_current_version BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS review_basis TEXT,
  ADD COLUMN IF NOT EXISTS has_change BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS schedule_impact_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ready_for_construction BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_ready_for_acceptance BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_drawing_packages_project ON drawing_packages(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_packages_code ON drawing_packages(project_id, package_code);
CREATE INDEX IF NOT EXISTS idx_drawing_package_items_package ON drawing_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_package ON drawing_versions(package_id);
CREATE INDEX IF NOT EXISTS idx_drawing_versions_project ON drawing_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_review_rules_project ON drawing_review_rules(project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_review_rules_active ON drawing_review_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_package ON construction_drawings(project_id, package_code);
CREATE INDEX IF NOT EXISTS idx_construction_drawings_current_version ON construction_drawings(package_id, is_current_version);

CREATE OR REPLACE FUNCTION update_drawing_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_packages_updated_at ON drawing_packages;
CREATE TRIGGER update_drawing_packages_updated_at
  BEFORE UPDATE ON drawing_packages
  FOR EACH ROW
  EXECUTE FUNCTION update_drawing_packages_updated_at();

CREATE OR REPLACE FUNCTION update_drawing_package_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_package_items_updated_at ON drawing_package_items;
CREATE TRIGGER update_drawing_package_items_updated_at
  BEFORE UPDATE ON drawing_package_items
  FOR EACH ROW
  EXECUTE FUNCTION update_drawing_package_items_updated_at();

CREATE OR REPLACE FUNCTION update_drawing_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_versions_updated_at ON drawing_versions;
CREATE TRIGGER update_drawing_versions_updated_at
  BEFORE UPDATE ON drawing_versions
  FOR EACH ROW
  EXECUTE FUNCTION update_drawing_versions_updated_at();

CREATE OR REPLACE FUNCTION update_drawing_review_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_drawing_review_rules_updated_at ON drawing_review_rules;
CREATE TRIGGER update_drawing_review_rules_updated_at
  BEFORE UPDATE ON drawing_review_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_drawing_review_rules_updated_at();

INSERT INTO drawing_review_rules (
  id,
  project_id,
  package_code,
  discipline_type,
  document_purpose,
  default_review_mode,
  review_basis,
  is_active,
  created_at,
  updated_at
)
VALUES
  (gen_random_uuid(), NULL, 'fire-review', '消防', '送审报批', 'mandatory', '消防专项包默认必审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'civil-defense-review', '人防', '送审报批', 'mandatory', '人防专项包默认必审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'completion-archive', '竣工归档', '竣工归档', 'manual_confirm', '竣工归档包需要人工确认', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'architecture-construction', '建筑', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'structure-construction', '结构', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'water-construction', '给排水', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'hvac-construction', '暖通', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW()),
  (gen_random_uuid(), NULL, 'electrical-construction', '电气', '施工执行', 'none', '常规施工执行包默认不送审', TRUE, NOW(), NOW())
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_acceptance_requirements_drawing_package_id'
  ) THEN
    EXECUTE '
      ALTER TABLE acceptance_requirements
      ADD CONSTRAINT fk_acceptance_requirements_drawing_package_id
      FOREIGN KEY (drawing_package_id)
      REFERENCES drawing_packages(id)
      ON DELETE SET NULL
    ';
  END IF;
END $$;

-- P7 compatibility cleanup reconciliation
UPDATE acceptance_plans
SET status = CASE
  WHEN status IN ('pending', '寰呭惎鍔?, '寰呴獙鏀?) THEN 'not_started'
  WHEN status IN ('鍑嗗涓?) THEN 'preparing'
  WHEN status IN ('宸茬敵鎶?) THEN 'submitted'
  WHEN status IN ('in_progress', '楠屾敹涓?) THEN 'in_acceptance'
  WHEN status IN ('failed', 'needs_revision', '鏁存敼涓?, '鏈€氳繃', '闇€琛ュ厖') THEN 'rectification'
  WHEN status IN ('宸查€氳繃') THEN 'passed'
  WHEN status IN ('宸插妗?) THEN 'recorded'
  ELSE status
END
WHERE status IN ('pending', 'in_progress', 'failed', 'needs_revision', '寰呭惎鍔?, '鍑嗗涓?, '宸茬敵鎶?, '楠屾敹涓?, '鏁存敼涓?, '宸查€氳繃', '宸插妗?, '寰呴獙鏀?, '鏈€氳繃', '闇€琛ュ厖');

UPDATE acceptance_nodes
SET status = CASE
  WHEN status IN ('pending', '寰呭惎鍔?, '寰呴獙鏀?) THEN 'not_started'
  WHEN status IN ('鍑嗗涓?) THEN 'preparing'
  WHEN status IN ('宸茬敵鎶?) THEN 'submitted'
  WHEN status IN ('in_progress', '楠屾敹涓?) THEN 'in_acceptance'
  WHEN status IN ('failed', 'needs_revision', '鏁存敼涓?, '鏈€氳繃', '闇€琛ュ厖') THEN 'rectification'
  WHEN status IN ('宸查€氳繃') THEN 'passed'
  WHEN status IN ('宸插妗?) THEN 'recorded'
  ELSE status
END
WHERE status IN ('pending', 'in_progress', 'failed', 'needs_revision', '寰呭惎鍔?, '鍑嗗涓?, '宸茬敵鎶?, '楠屾敹涓?, '鏁存敼涓?, '宸查€氳繃', '宸插妗?, '寰呴獙鏀?, '鏈€氳繃', '闇€琛ュ厖');

ALTER TABLE IF EXISTS acceptance_plans DROP COLUMN IF EXISTS depends_on;
ALTER TABLE IF EXISTS acceptance_plans DROP CONSTRAINT IF EXISTS acceptance_plans_status_check_p7;
ALTER TABLE IF EXISTS acceptance_plans
  ADD CONSTRAINT acceptance_plans_status_check_p7
  CHECK (status IN ('draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived'));

ALTER TABLE IF EXISTS acceptance_nodes DROP CONSTRAINT IF EXISTS acceptance_nodes_status_check_p7;
ALTER TABLE IF EXISTS acceptance_nodes
  ADD CONSTRAINT acceptance_nodes_status_check_p7
  CHECK (status IN ('draft', 'preparing', 'ready_to_submit', 'submitted', 'inspecting', 'rectifying', 'passed', 'archived'));

UPDATE task_obstacles SET status = '宸茶В鍐? WHERE status = '鏃犳硶瑙ｅ喅';
ALTER TABLE IF EXISTS task_obstacles DROP CONSTRAINT IF EXISTS task_obstacles_status_check_p7;
ALTER TABLE IF EXISTS task_obstacles
  ADD CONSTRAINT task_obstacles_status_check_p7
  CHECK (status IN ('寰呭鐞?, '澶勭悊涓?, '宸茶В鍐?));

INSERT INTO task_critical_overrides (
  id,
  project_id,
  task_id,
  mode,
  anchor_type,
  left_task_id,
  right_task_id,
  reason,
  created_by,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  t.project_id,
  t.id,
  'manual_attention',
  NULL,
  NULL,
  NULL,
  'migrated from legacy is_critical flag',
  NULL,
  COALESCE(t.updated_at, t.created_at, NOW()),
  COALESCE(t.updated_at, t.created_at, NOW())
FROM tasks t
WHERE COALESCE(t.is_critical, FALSE) = TRUE
  AND t.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM task_critical_overrides o
    WHERE o.project_id = t.project_id
      AND o.task_id = t.id
      AND o.mode = 'manual_attention'
  );

-- ============================================================
-- 120_create_engineering_objects.sql — v1.4.1 Engineering objects master data
-- ============================================================
CREATE TABLE IF NOT EXISTS engineering_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL
    CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area')),
  object_code TEXT NOT NULL,
  object_name TEXT NOT NULL,
  parent_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, object_type, object_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_root_active_name
  ON engineering_objects (project_id, object_name)
  WHERE parent_id IS NULL AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_child_active_name
  ON engineering_objects (project_id, parent_id, object_name)
  WHERE parent_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_type_status
  ON engineering_objects (project_id, object_type, status);

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_parent_sort
  ON engineering_objects (project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_path
  ON engineering_objects (project_id, path);

DROP FUNCTION IF EXISTS public.update_engineering_objects_updated_at() CASCADE;
CREATE FUNCTION public.update_engineering_objects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_engineering_objects_updated_at ON engineering_objects;
CREATE TRIGGER trigger_update_engineering_objects_updated_at
  BEFORE UPDATE ON engineering_objects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_engineering_objects_updated_at();

ALTER TABLE engineering_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engineering_objects_select_policy ON engineering_objects;
CREATE POLICY engineering_objects_select_policy ON engineering_objects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = engineering_objects.project_id
        AND pm.user_id = auth.uid()
    );
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'company_admin'
    )
    OR
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_insert_policy ON engineering_objects;
CREATE POLICY engineering_objects_insert_policy ON engineering_objects
  FOR INSERT
  WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_update_policy ON engineering_objects;
CREATE POLICY engineering_objects_update_policy ON engineering_objects
  FOR UPDATE
  USING (
    (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_delete_policy ON engineering_objects;
CREATE POLICY engineering_objects_delete_policy ON engineering_objects
  FOR DELETE
  USING (
    (SELECT current_setting('role', true) = 'service_role')
  );

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS engineering_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS floor_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS basement_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS physical_zone_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS functional_area_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_engineering_object_id ON tasks(engineering_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase_object_id ON tasks(phase_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_section_object_id ON tasks(section_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_building_object_id ON tasks(building_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_floor_object_id ON tasks(floor_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_basement_object_id ON tasks(basement_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_physical_zone_object_id ON tasks(physical_zone_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_functional_area_object_id ON tasks(functional_area_object_id);

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS building_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_building_object_id
  ON acceptance_plans(building_object_id);

-- ============================================================
-- 121_add_wbs_engineering_categories.sql
-- ============================================================

-- ============================================================
-- 1. Engineering categories (WBS work classification tree)
-- ============================================================
CREATE TABLE IF NOT EXISTS engineering_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES engineering_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  category_type TEXT NOT NULL
    CHECK (category_type IN ('division','sub_division','item_work','process','activity_step','custom')),
  category_level INTEGER NOT NULL DEFAULT 1,
  category_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same-parent enabled name uniqueness (handles both project=NULL and project=value)
CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_enabled_name
  ON engineering_categories (category_name)
  WHERE project_id IS NULL AND parent_id IS NULL AND enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_root_enabled_name
  ON engineering_categories (project_id, category_name)
  WHERE project_id IS NOT NULL AND parent_id IS NULL AND enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_child_enabled_name
  ON engineering_categories (project_id, parent_id, category_name)
  WHERE project_id IS NOT NULL AND parent_id IS NOT NULL AND enabled = true;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_eng_cat_project_type
  ON engineering_categories (project_id, category_type) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eng_cat_system_type
  ON engineering_categories (category_type) WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_eng_cat_project_parent_sort
  ON engineering_categories (project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_eng_cat_path
  ON engineering_categories (category_path);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_engineering_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_engineering_categories_updated_at ON engineering_categories;
CREATE TRIGGER trigger_update_engineering_categories_updated_at
  BEFORE UPDATE ON engineering_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_engineering_categories_updated_at();

-- RLS
ALTER TABLE engineering_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engineering_categories_select_policy ON engineering_categories;
CREATE POLICY engineering_categories_select_policy ON engineering_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = engineering_categories.project_id
        AND pm.user_id = auth.uid()
    )
    OR engineering_categories.project_id IS NULL
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'company_admin'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_categories_insert_policy ON engineering_categories;
CREATE POLICY engineering_categories_insert_policy ON engineering_categories
  FOR INSERT WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_categories_update_policy ON engineering_categories;
CREATE POLICY engineering_categories_update_policy ON engineering_categories
  FOR UPDATE USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS engineering_categories_delete_policy ON engineering_categories;
CREATE POLICY engineering_categories_delete_policy ON engineering_categories
  FOR DELETE USING ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 2. WBS semantic columns on tasks
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID REFERENCES engineering_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_leaf BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_engineering_category_id ON tasks(engineering_category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wbs_node_type ON tasks(project_id, wbs_node_type);
CREATE INDEX IF NOT EXISTS idx_tasks_is_executable ON tasks(project_id, is_executable) WHERE is_executable = true;

-- ============================================================
-- 3. WBS semantic snapshot columns on task_baseline_items
-- ============================================================
ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT,
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'current_execution_fact',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

-- ============================================================
-- 4. WBS semantic snapshot columns on monthly_plan_items
-- ============================================================
ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT,
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'baseline_commitment_snapshot',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_snapshot_source
  ON task_baseline_items(project_id, snapshot_source);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_snapshot_source
  ON monthly_plan_items(project_id, snapshot_source);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_scope_snapshot
  ON task_baseline_items USING GIN (scope_snapshot);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_scope_snapshot
  ON monthly_plan_items USING GIN (scope_snapshot);


-- ============================================================
-- 122_create_construction_task_standard_model.sql
-- ============================================================

-- ============================================================
-- 0. Pre-flight: detect existing task_dependencies structure
-- ============================================================
DO $$
DECLARE
  has_predecessor_col BOOLEAN;
  has_task_id_col BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_dependencies'
  ) THEN
    -- Check column structure
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_dependencies'
        AND column_name = 'predecessor_id'
    ) INTO has_predecessor_col;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_dependencies'
        AND column_name = 'task_id'
    ) INTO has_task_id_col;

    -- If old structure (predecessor_id without task_id), rename to v1.4.3 standard
    IF has_predecessor_col AND NOT has_task_id_col THEN
      ALTER TABLE public.task_dependencies RENAME COLUMN predecessor_id TO task_id;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'task_dependencies'
          AND column_name = 'successor_id'
      ) THEN
        ALTER TABLE public.task_dependencies RENAME COLUMN successor_id TO dependency_task_id;
      END IF;
      RAISE NOTICE 'task_dependencies migrated from predecessor/successor to task_id/dependency_task_id';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 1. Task dependencies standard table
-- ============================================================
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'FS'
    CHECK (dependency_type IN ('FS','SS','FF','SF')),
  lag_days INTEGER NOT NULL DEFAULT 0,
  required_for_start BOOLEAN NOT NULL DEFAULT true,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_dependencies_not_self CHECK (task_id <> dependency_task_id)
);

-- Add constraint if not exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_not_self'
  ) THEN
    ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_not_self CHECK (task_id <> dependency_task_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_unique
  ON task_dependencies(project_id, task_id, dependency_task_id, dependency_type);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task
  ON task_dependencies(project_id, task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependency
  ON task_dependencies(project_id, dependency_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_required
  ON task_dependencies(project_id, required_for_start);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_source
  ON task_dependencies(project_id, source_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_task_dependencies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_dependencies_updated_at ON task_dependencies;
CREATE TRIGGER trigger_update_task_dependencies_updated_at
  BEFORE UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_dependencies_updated_at();

-- RLS
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_dependencies_select_policy ON task_dependencies;
CREATE POLICY task_dependencies_select_policy ON task_dependencies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_insert_policy ON task_dependencies;
CREATE POLICY task_dependencies_insert_policy ON task_dependencies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_update_policy ON task_dependencies;
CREATE POLICY task_dependencies_update_policy ON task_dependencies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_delete_policy ON task_dependencies;
CREATE POLICY task_dependencies_delete_policy ON task_dependencies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

-- ============================================================
-- 2. Task standard fields
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_code TEXT,
  ADD COLUMN IF NOT EXISTS task_code_version TEXT,
  ADD COLUMN IF NOT EXISTS progress_method TEXT NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS planned_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS completed_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT,
  ADD COLUMN IF NOT EXISTS progress_weight NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completion_rule TEXT NOT NULL DEFAULT 'progress_100',
  ADD COLUMN IF NOT EXISTS drawing_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS material_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceptance_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standard_task_metadata JSONB NOT NULL DEFAULT '{}';

-- Constraint: progress_method check (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_method_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_method_check
      CHECK (progress_method IN ('percent','quantity','milestone','manual_weighted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_completion_rule_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_completion_rule_check
      CHECK (completion_rule IN ('progress_100','quantity_completed','acceptance_passed','manual_confirmed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_weight_positive_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_weight_positive_check
      CHECK (progress_weight > 0);
  END IF;
END $$;

-- task_code unique per project
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_project_task_code
  ON tasks(project_id, task_code)
  WHERE task_code IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_executable
  ON tasks(project_id, is_executable, status);
CREATE INDEX IF NOT EXISTS idx_tasks_task_code
  ON tasks(task_code) WHERE task_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_progress_method
  ON tasks(project_id, progress_method);

-- ============================================================
-- 3. Backfill defaults for existing tasks
-- ============================================================
UPDATE tasks
SET
  progress_method = COALESCE(progress_method, 'percent'),
  completion_rule = COALESCE(completion_rule, 'progress_100'),
  progress_weight = COALESCE(progress_weight, 1),
  standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
WHERE progress_method IS NULL OR completion_rule IS NULL OR progress_weight IS NULL OR standard_task_metadata IS NULL;



-- 121a_add_engineering_categories_standard_fields.sql

ALTER TABLE engineering_categories
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_enabled_name
  ON engineering_categories (project_id, COALESCE(parent_id::text, '_root_'), category_name)
  WHERE enabled = true;


-- 122 trigger: same-project validation for task_dependencies
-- Same-project trigger: ensure task_id and dependency_task_id match project_id
CREATE OR REPLACE FUNCTION public.check_task_dependencies_same_project()
RETURNS TRIGGER AS $$
DECLARE
  task_project UUID;
  dep_project UUID;
BEGIN
  SELECT project_id INTO task_project FROM tasks WHERE id = NEW.task_id;
  SELECT project_id INTO dep_project FROM tasks WHERE id = NEW.dependency_task_id;
  IF task_project IS NULL OR dep_project IS NULL THEN
    RAISE EXCEPTION 'Task or dependency task not found';
  END IF;
  IF task_project != dep_project THEN
    RAISE EXCEPTION 'task_id (%) and dependency_task_id (%) belong to different projects', NEW.task_id, NEW.dependency_task_id;
  END IF;
  IF NEW.project_id IS NULL THEN
    NEW.project_id = task_project;
  ELSIF NEW.project_id != task_project THEN
    RAISE EXCEPTION 'project_id mismatch: task % belongs to project %, not %', NEW.task_id, task_project, NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_task_dependencies_same_project ON task_dependencies;
CREATE TRIGGER trigger_check_task_dependencies_same_project
  BEFORE INSERT OR UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_task_dependencies_same_project();


-- 122 replace_task_dependencies RPC
-- Atomic replace_task_dependencies RPC: delete all old + insert all new in one transaction
CREATE OR REPLACE FUNCTION public.replace_task_dependencies(
  p_task_id UUID,
  p_deps JSONB
)
RETURNS SETOF task_dependencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dep JSONB;
  dep_ids UUID[];
BEGIN
  -- Delete old
  DELETE FROM task_dependencies WHERE task_id = p_task_id;

  -- Insert new
  FOR dep IN SELECT * FROM jsonb_array_elements(p_deps)
  LOOP
    INSERT INTO task_dependencies (
      id, project_id, task_id, dependency_task_id,
      dependency_type, lag_days, required_for_start, source_type,
      created_at, updated_at
    ) VALUES (
      COALESCE((dep->>'id')::UUID, gen_random_uuid()),
      COALESCE((dep->>'project_id')::UUID, (SELECT project_id FROM tasks WHERE id = p_task_id)),
      p_task_id,
      (dep->>'dependency_task_id')::UUID,
      COALESCE(dep->>'dependency_type', 'FS'),
      COALESCE((dep->>'lag_days')::INTEGER, 0),
      COALESCE((dep->>'required_for_start')::BOOLEAN, true),
      COALESCE(dep->>'source_type', 'manual'),
      COALESCE((dep->>'created_at')::TIMESTAMPTZ, NOW()),
      COALESCE((dep->>'updated_at')::TIMESTAMPTZ, NOW())
    );
    -- rows are returned after the cache sync below
  END LOOP;

  -- Sync tasks.dependencies cache
  SELECT array_agg(dependency_task_id) INTO dep_ids
    FROM task_dependencies WHERE task_id = p_task_id;
  UPDATE tasks SET dependencies = COALESCE(dep_ids, '{}') WHERE id = p_task_id;

  RETURN QUERY SELECT * FROM task_dependencies WHERE task_id = p_task_id;
END;
$$;


-- 123_create_task_code_rules.sql

-- ============================================================
-- 1. projects: project_code
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code_generated_at TIMESTAMPTZ;
CREATE SEQUENCE IF NOT EXISTS project_code_seq START WITH 1 INCREMENT BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_project_code
  ON projects(project_code) WHERE project_code IS NOT NULL;

-- ============================================================
-- 2. tasks: task_code_rule_id / task_code_generated_at
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_code_rule_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_code_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_task_code_rule_id
  ON tasks(task_code_rule_id) WHERE task_code_rule_id IS NOT NULL;

-- ============================================================
-- 3. engineering_categories: standard_work_code idempotent confirm
-- ============================================================
ALTER TABLE engineering_categories ADD COLUMN IF NOT EXISTS standard_work_code TEXT;
ALTER TABLE engineering_categories ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_standard_work_code
  ON engineering_categories(standard_work_code)
  WHERE project_id IS NULL AND standard_work_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_standard_work_code
  ON engineering_categories(project_id, standard_work_code)
  WHERE project_id IS NOT NULL AND standard_work_code IS NOT NULL;

-- ============================================================
-- 4. project_task_code_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS project_task_code_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL DEFAULT '默认任务编码规则',
  rule_version TEXT NOT NULL DEFAULT 'v1',
  delimiter TEXT NOT NULL DEFAULT '-',
  sequence_length INTEGER NOT NULL DEFAULT 3,
  include_project BOOLEAN NOT NULL DEFAULT true,
  include_phase BOOLEAN NOT NULL DEFAULT true,
  include_section BOOLEAN NOT NULL DEFAULT true,
  include_building BOOLEAN NOT NULL DEFAULT true,
  include_floor BOOLEAN NOT NULL DEFAULT true,
  include_zone BOOLEAN NOT NULL DEFAULT true,
  include_professional BOOLEAN NOT NULL DEFAULT true,
  include_work_code BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_task_code_rules_enabled
  ON project_task_code_rules(project_id) WHERE enabled = true;

ALTER TABLE project_task_code_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_task_code_rules_select_policy ON project_task_code_rules;
CREATE POLICY project_task_code_rules_select_policy ON project_task_code_rules
  FOR SELECT USING ((SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS project_task_code_rules_write_policy ON project_task_code_rules;
CREATE POLICY project_task_code_rules_write_policy ON project_task_code_rules
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 5. task_code_sequences
-- ============================================================
CREATE TABLE IF NOT EXISTS task_code_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES project_task_code_rules(id) ON DELETE CASCADE,
  sequence_key TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, rule_id, sequence_key)
);

ALTER TABLE task_code_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_code_sequences_policy ON task_code_sequences;
CREATE POLICY task_code_sequences_policy ON task_code_sequences
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 6. task_code_history
-- ============================================================
CREATE TABLE IF NOT EXISTS task_code_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  old_task_code TEXT,
  new_task_code TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_task_code_history_task_id
  ON task_code_history(task_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_code_history_project_id
  ON task_code_history(project_id, changed_at DESC);

ALTER TABLE task_code_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_code_history_select_policy ON task_code_history;
CREATE POLICY task_code_history_select_policy ON task_code_history
  FOR SELECT USING ((SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS task_code_history_write_policy ON task_code_history;
CREATE POLICY task_code_history_write_policy ON task_code_history
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 7. FK: tasks.task_code_rule_id -> project_task_code_rules
-- ============================================================
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_code_rule_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_code_rule_id_fkey
  FOREIGN KEY (task_code_rule_id) REFERENCES project_task_code_rules(id) ON DELETE SET NULL;


-- 124_create_status_dictionary_system.sql

-- ============================================================
-- 1. status_dictionary_versions (created first for FK references)
-- ============================================================
CREATE TABLE IF NOT EXISTS status_dictionary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key TEXT NOT NULL UNIQUE,
  version_name TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  content_hash TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Bootstrap the current version
INSERT INTO status_dictionary_versions (version_key, version_name, change_reason)
VALUES ('v1.4.5', 'v1.4.5 Initial Status Dictionary', 'System bootstrap')
ON CONFLICT (version_key) DO NOTHING;

-- ============================================================
-- 2. status_domains
-- ============================================================
CREATE TABLE IF NOT EXISTS status_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL UNIQUE,
  domain_name TEXT NOT NULL,
  domain_group TEXT NOT NULL,
  status_kind TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status_kind IN ('lifecycle','derived','stage','activation','adjacent','technical'))
);

-- Bootstrap core domains
INSERT INTO status_domains (domain_key, domain_name, domain_group, status_kind) VALUES
  ('task.lifecycle', '任务生命周期', 'task', 'lifecycle'),
  ('task.business_status', '任务业务状态', 'task', 'derived'),
  ('task.lag_status', '任务滞后状态', 'task', 'derived'),
  ('task.due_status', '任务到期状态', 'task', 'derived'),
  ('baseline.lifecycle', '项目基线生命周期', 'planning', 'lifecycle'),
  ('monthly_plan.lifecycle', '月度计划生命周期', 'planning', 'lifecycle'),
  ('milestone.lifecycle', '里程碑生命周期', 'milestone', 'lifecycle'),
  ('condition.lifecycle', '条件生命周期', 'condition', 'lifecycle'),
  ('obstacle.lifecycle', '阻碍生命周期', 'obstacle', 'lifecycle'),
  ('risk.lifecycle', '风险生命周期', 'risk', 'lifecycle'),
  ('issue.lifecycle', '问题生命周期', 'issue', 'lifecycle'),
  ('warning.lifecycle', '预警生命周期', 'warning', 'lifecycle'),
  ('notification.lifecycle', '通知生命周期', 'notification', 'lifecycle'),
  ('acceptance.lifecycle', '验收生命周期', 'acceptance', 'lifecycle'),
  ('certificate.lifecycle', '证照生命周期', 'certificate', 'lifecycle'),
  ('certificate.stage', '证照阶段', 'certificate', 'stage'),
  ('drawing.lifecycle', '图纸生命周期', 'drawing', 'lifecycle'),
  ('drawing.review_status', '图纸审查状态', 'drawing', 'derived'),
  ('project.lifecycle', '项目生命周期', 'project', 'lifecycle'),
  ('project.phase', '项目阶段', 'project', 'stage'),
  ('project.health', '项目健康状态', 'project', 'derived'),
  ('material.derived_status', '材料派生状态', 'material', 'derived'),
  ('wbs_template.lifecycle', 'WBS模板生命周期', 'template', 'lifecycle'),
  ('engineering_object.activation', '工程对象启停', 'master_data', 'activation'),
  ('engineering_category.activation', '工程分类启停', 'master_data', 'activation'),
  ('invitation.lifecycle', '邀请生命周期', 'collaboration', 'lifecycle'),
  ('data_quality.finding_status', '数据质量发现状态', 'governance', 'lifecycle'),
  ('data_quality.confidence_flag', '数据可信度', 'governance', 'adjacent'),
  ('task_completion.efficiency_status', '任务完成效率', 'task', 'derived'),
  ('progress_deviation.row_status', '进度偏差行状态', 'report', 'derived'),
  ('delay_signal.derived_status', '延期信号派生', 'task', 'derived')
ON CONFLICT (domain_key) DO NOTHING;

-- ============================================================
-- 3. status_values
-- ============================================================
CREATE TABLE IF NOT EXISTS status_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  status_key TEXT NOT NULL,
  status_label TEXT NOT NULL,
  status_label_short TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  visual_tone TEXT,
  semantic_tone TEXT,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, status_key)
);

-- Bootstrap core status values
INSERT INTO status_values (domain_key, status_key, status_label, sort_order, is_initial, is_terminal, visual_tone, semantic_tone) VALUES
  ('task.lifecycle', 'todo', '待办', 1, false, false, 'slate', 'open'),
  ('task.lifecycle', 'pending', '待定', 2, true, false, 'slate', 'open'),
  ('task.lifecycle', 'in_progress', '进行中', 3, false, false, 'blue', 'active'),
  ('task.lifecycle', 'blocked', '受阻', 4, false, false, 'amber', 'blocked'),
  ('task.lifecycle', 'completed', '已完成', 5, false, true, 'green', 'closed'),
  ('task.lifecycle', 'cancelled', '已取消', 6, false, true, 'slate', 'closed'),
  ('risk.lifecycle', 'identified', '已识别', 1, true, false, 'amber', 'open'),
  ('risk.lifecycle', 'mitigating', '缓解中', 2, false, false, 'blue', 'active'),
  ('risk.lifecycle', 'closed', '已关闭', 3, false, true, 'green', 'closed'),
  ('issue.lifecycle', 'open', '未解决', 1, true, false, 'red', 'open'),
  ('issue.lifecycle', 'investigating', '调查中', 2, false, false, 'amber', 'active'),
  ('issue.lifecycle', 'resolved', '已解决', 3, false, false, 'blue', 'active'),
  ('issue.lifecycle', 'closed', '已关闭', 4, false, true, 'green', 'closed'),
  ('condition.lifecycle', 'open', '待满足', 1, true, false, 'slate', 'open'),
  ('condition.lifecycle', 'met', '已满足', 2, false, false, 'blue', 'active'),
  ('condition.lifecycle', 'confirmed', '已确认', 3, false, true, 'green', 'closed'),
  ('condition.lifecycle', 'blocked', '受阻', 4, false, false, 'amber', 'blocked'),
  ('condition.lifecycle', 'closed', '已关闭', 5, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'open', '待处理', 1, true, false, 'amber', 'open'),
  ('obstacle.lifecycle', 'resolving', '处理中', 2, false, false, 'blue', 'active'),
  ('obstacle.lifecycle', 'resolved', '已解决', 3, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'closed', '已关闭', 4, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'unresolvable', '无法解决', 5, false, true, 'red', 'blocked'),
  ('acceptance.lifecycle', 'draft', '草稿', 1, true, false, 'slate', 'open'),
  ('acceptance.lifecycle', 'preparing', '准备中', 2, false, false, 'blue', 'active'),
  ('acceptance.lifecycle', 'ready_to_submit', '待报验', 3, false, false, 'amber', 'active'),
  ('acceptance.lifecycle', 'submitted', '已报验', 4, false, false, 'amber', 'active'),
  ('acceptance.lifecycle', 'inspecting', '验收中', 5, false, false, 'blue', 'active'),
  ('acceptance.lifecycle', 'rectifying', '整改中', 6, false, false, 'red', 'blocked'),
  ('acceptance.lifecycle', 'passed', '已通过', 7, false, true, 'green', 'closed'),
  ('acceptance.lifecycle', 'archived', '已归档', 8, false, true, 'green', 'closed'),
  ('project.lifecycle', 'not_started', '未开始', 1, true, false, 'slate', 'open'),
  ('project.lifecycle', 'in_progress', '进行中', 2, false, false, 'blue', 'active'),
  ('project.lifecycle', 'completed', '已完成', 3, false, true, 'green', 'closed'),
  ('project.lifecycle', 'paused', '已暂停', 4, false, false, 'amber', 'blocked'),
  ('project.health', 'healthy', '健康', 1, false, false, 'green', 'positive'),
  ('project.health', 'warning', '亚健康', 2, false, false, 'amber', 'caution'),
  ('project.health', 'critical', '预警', 3, false, false, 'red', 'negative'),
  ('project.health', 'danger', '危险', 4, false, false, 'red', 'negative')
ON CONFLICT (domain_key, status_key) DO NOTHING;

-- ============================================================
-- 4. status_aliases
-- ============================================================
CREATE TABLE IF NOT EXISTS status_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  alias_value TEXT NOT NULL,
  status_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'legacy',
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, alias_value)
);

-- Add FK to status_values
ALTER TABLE status_aliases DROP CONSTRAINT IF EXISTS status_aliases_status_key_fkey;
ALTER TABLE status_aliases ADD CONSTRAINT status_aliases_status_key_fkey
  FOREIGN KEY (domain_key, status_key) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

-- Bootstrap legacy aliases
INSERT INTO status_aliases (domain_key, alias_value, status_key, source_type) VALUES
  ('task.lifecycle', 'not_started', 'todo', 'legacy'),
  ('task.lifecycle', '未开始', 'todo', 'legacy'),
  ('task.lifecycle', '进行中', 'in_progress', 'legacy'),
  ('task.lifecycle', '已完成', 'completed', 'legacy'),
  ('task.lifecycle', 'done', 'completed', 'legacy'),
  ('task.lifecycle', 'delayed', 'blocked', 'legacy'),
  ('task.lifecycle', 'on_hold', 'blocked', 'legacy'),
  ('task.lifecycle', '已取消', 'cancelled', 'legacy'),
  ('task.lifecycle', 'voided', 'cancelled', 'legacy'),
  ('task.lifecycle', 'archived', 'cancelled', 'legacy'),
  ('task.lifecycle', 'deleted', 'cancelled', 'legacy'),
  ('project.lifecycle', '未开始', 'not_started', 'legacy'),
  ('project.lifecycle', '进行中', 'in_progress', 'legacy'),
  ('project.lifecycle', '已完成', 'completed', 'legacy'),
  ('project.lifecycle', '已暂停', 'paused', 'legacy')
ON CONFLICT (domain_key, alias_value) DO NOTHING;

-- ============================================================
-- 5. status_transitions
-- ============================================================
CREATE TABLE IF NOT EXISTS status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  event_key TEXT,
  actor_scope TEXT NOT NULL DEFAULT 'system_or_user',
  guard_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK to status_values
ALTER TABLE status_transitions DROP CONSTRAINT IF EXISTS status_transitions_from_status_fkey;
ALTER TABLE status_transitions ADD CONSTRAINT status_transitions_from_status_fkey
  FOREIGN KEY (domain_key, from_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;
ALTER TABLE status_transitions DROP CONSTRAINT IF EXISTS status_transitions_to_status_fkey;
ALTER TABLE status_transitions ADD CONSTRAINT status_transitions_to_status_fkey
  FOREIGN KEY (domain_key, to_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_status_transitions_domain_from_to_event
  ON status_transitions(domain_key, from_status, to_status, COALESCE(event_key, ''));

-- Bootstrap task transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('task.lifecycle', 'pending', 'todo'),
  ('task.lifecycle', 'todo', 'in_progress'),
  ('task.lifecycle', 'pending', 'in_progress'),
  ('task.lifecycle', 'in_progress', 'blocked'),
  ('task.lifecycle', 'in_progress', 'completed'),
  ('task.lifecycle', 'blocked', 'in_progress'),
  ('task.lifecycle', 'todo', 'cancelled'),
  ('task.lifecycle', 'pending', 'cancelled'),
  ('task.lifecycle', 'in_progress', 'cancelled'),
  ('task.lifecycle', 'blocked', 'cancelled')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- Bootstrap risk transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('risk.lifecycle', 'identified', 'mitigating'),
  ('risk.lifecycle', 'mitigating', 'closed'),
  ('risk.lifecycle', 'closed', 'identified')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- Bootstrap issue transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('issue.lifecycle', 'open', 'investigating'),
  ('issue.lifecycle', 'investigating', 'resolved'),
  ('issue.lifecycle', 'resolved', 'closed'),
  ('issue.lifecycle', 'resolved', 'investigating')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- ============================================================
-- 6. status_derivation_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS status_derivation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_order INTEGER NOT NULL DEFAULT 0,
  output_status TEXT NOT NULL,
  rule_description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, rule_key)
);

ALTER TABLE status_derivation_rules DROP CONSTRAINT IF EXISTS status_derivation_rules_output_status_fkey;
ALTER TABLE status_derivation_rules ADD CONSTRAINT status_derivation_rules_output_status_fkey
  FOREIGN KEY (domain_key, output_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

-- ============================================================
-- 7. RLS on all status dictionary tables
-- ============================================================
ALTER TABLE status_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_derivation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_dictionary_versions ENABLE ROW LEVEL SECURITY;

-- All status tables: read for anyone, write for service_role only
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['status_domains','status_values','status_transitions','status_aliases','status_derivation_rules','status_dictionary_versions'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_read_policy ON %I FOR SELECT USING (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write_policy ON %I FOR ALL USING ((SELECT current_setting(''role'', true) = ''service_role'')) WITH CHECK ((SELECT current_setting(''role'', true) = ''service_role''))', tbl, tbl);
  END LOOP;
END $$;



-- 125_create_data_lineage_mapping_system.sql

-- ============================================================
-- 1. data_lineage_entity_types
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_entity_types (
  entity_type TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  entity_group TEXT NOT NULL,
  table_name TEXT,
  id_column TEXT NOT NULL DEFAULT 'id',
  project_id_column TEXT DEFAULT 'project_id',
  is_project_scoped BOOLEAN NOT NULL DEFAULT true,
  is_global_reference BOOLEAN NOT NULL DEFAULT false,
  is_business_lineage_allowed BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT (is_project_scoped AND is_global_reference))
);

-- Bootstrap entity types
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, table_name, is_project_scoped, is_global_reference) VALUES
  ('wbs_template', 'WBS模板', 'planning', 'wbs_templates', false, true),
  ('wbs_template_node', 'WBS模板节点', 'planning', null, false, true),
  ('task_baseline', '项目基线', 'planning', 'task_baselines', true, false),
  ('task_baseline_item', '项目基线行', 'planning', 'task_baseline_items', true, false),
  ('monthly_plan', '月度计划', 'planning', 'monthly_plans', true, false),
  ('monthly_plan_item', '月度计划行', 'planning', 'monthly_plan_items', true, false),
  ('task', '施工任务', 'task', 'tasks', true, false),
  ('task_dependency', '任务依赖', 'task', 'task_dependencies', true, false),
  ('task_condition', '前置条件', 'task', 'task_conditions', true, false),
  ('task_obstacle', '阻碍事项', 'task', 'task_obstacles', true, false),
  ('milestone', '里程碑', 'milestone', 'milestones', true, false),
  ('risk', '风险', 'risk', 'risks', true, false),
  ('issue', '问题', 'issue', 'issues', true, false),
  ('warning', '预警', 'warning', 'warnings', true, false),
  ('notification', '通知', 'notification', 'notifications', true, false),
  ('acceptance_plan', '验收计划', 'acceptance', 'acceptance_plans', true, false),
  ('acceptance_dependency', '验收依赖', 'acceptance', 'acceptance_dependencies', true, false),
  ('acceptance_requirement', '验收条件', 'acceptance', 'acceptance_requirements', true, false),
  ('construction_drawing', '施工图纸', 'drawing', 'construction_drawings', true, false),
  ('drawing_package', '图纸包', 'drawing', 'drawing_packages', true, false),
  ('drawing_version', '图纸版本', 'drawing', 'drawing_versions', true, false),
  ('certificate', '证照', 'certificate', 'pre_milestones', true, false),
  ('certificate_work_item', '证照工作项', 'certificate', 'certificate_work_items', true, false),
  ('certificate_dependency', '证照依赖', 'certificate', 'certificate_dependencies', true, false),
  ('pre_milestone', '前置里程碑', 'certificate', 'pre_milestones', true, false),
  ('engineering_object', '工程对象', 'master_data', 'engineering_objects', true, false),
  ('engineering_category', '工程分类', 'master_data', 'engineering_categories', true, false),
  ('project_material', '材料', 'material', 'project_materials', true, false),
  ('change_log', '变更日志', 'governance', 'change_logs', true, false),
  ('data_quality_finding', '数据质量发现', 'governance', 'data_quality_findings', true, false),
  ('project_daily_snapshot', '项目日报', 'bi', 'project_daily_snapshot', true, false),
  ('task_progress_snapshot', '进度快照', 'task', 'task_progress_snapshots', true, false),
  ('standard_process', '标准工序', 'reference', 'standard_processes', false, true),
  ('acceptance_catalog', '验收目录', 'reference', 'acceptance_catalog', false, true),
  ('import_batch', '导入批次', 'import', null, true, false),
  ('external_record', '外部记录', 'external', null, false, true),
  ('task_progress_snapshot', '进度快照', 'task', 'task_progress_snapshots', true, false),
  ('task_timeline_event', '任务时间轴事件', 'task', 'task_timeline_events', true, false),
  ('task_milestone', '任务里程碑关联', 'task', 'task_milestones', true, false),
  ('task_critical_override', '关键路径人工干预', 'task', 'task_critical_overrides', true, false),
  ('task_preceding_relation', '任务前置关系', 'task', 'task_preceding_relations', true, false),
  ('acceptance_record', '验收记录', 'acceptance', 'acceptance_records', true, false),
  ('acceptance_catalog', '验收目录参考', 'reference', 'acceptance_catalog', false, true),
  ('drawing_review_rule', '图纸审查规则', 'drawing', 'drawing_review_rules', true, false),
  ('drawing_package_item', '图纸包明细', 'drawing', 'drawing_package_items', true, false),
  ('pre_milestone_condition', '前置里程碑条件', 'certificate', 'pre_milestone_conditions', true, false),
  ('pre_milestone_dependency', '前置里程碑依赖', 'certificate', 'pre_milestone_dependencies', true, false),
  ('certificate_approval', '证照审批历史', 'certificate', 'certificate_approvals', true, false),
  ('responsibility_watchlist', '责任预警清单', 'governance', 'responsibility_watchlist', true, false),
  ('weekly_digest', '周报', 'report', 'weekly_digests', true, false),
  ('risk_statistics', '风险统计快照', 'risk', 'risk_statistics', true, false),
  ('planning_governance_signal', '计划治理信号', 'planning', 'planning_governance', true, false),
  ('data_confidence_snapshot', '数据可信度快照', 'governance', 'data_confidence_snapshots', true, false),
  ('wbs_structure', '历史WBS结构', 'compat', 'wbs_structure', true, false),
  ('wbs_task_link', '历史WBS任务关联', 'compat', 'wbs_task_links', true, false),
  ('standard_process', '标准工序参考', 'reference', 'standard_processes', false, true)
ON CONFLICT (entity_type) DO NOTHING;

-- Technical objects: lineage not allowed
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, is_business_lineage_allowed, is_project_scoped) VALUES
  ('operation_log', '操作日志', 'technical', false, false),
  ('task_lock', '任务锁', 'technical', false, false),
  ('planning_draft_lock', '计划草稿锁', 'technical', false, false),
  ('job_execution_log', '任务执行日志', 'technical', false, false),
  ('trigger_execution_log', '触发器执行日志', 'technical', false, false)
ON CONFLICT (entity_type) DO NOTHING;

-- ============================================================
-- 2. data_lineage_relation_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_relation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type TEXT NOT NULL REFERENCES data_lineage_entity_types(entity_type),
  relation_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL REFERENCES data_lineage_entity_types(entity_type),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_entity_type, relation_type, target_entity_type)
);

-- Bootstrap core relation rules
INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type) VALUES
  ('wbs_template_node', 'generates', 'task_baseline_item'),
  ('wbs_template_node', 'generates', 'task'),
  ('task_baseline_item', 'derives', 'monthly_plan_item'),
  ('monthly_plan_item', 'derives', 'task'),
  ('monthly_plan_item', 'carries_over_to', 'monthly_plan_item'),
  ('task', 'splits_into', 'task'),
  ('task', 'merged_from', 'task'),
  ('task', 'replaced_by', 'task'),
  ('import_batch', 'contains', 'task'),
  ('task', 'generates', 'task_baseline_item'),
  ('task', 'carries_over_to', 'monthly_plan_item'),
  ('risk', 'escalates_to', 'issue'),
  ('warning', 'escalates_to', 'risk'),
  ('task_obstacle', 'escalates_to', 'issue'),
  ('task_condition', 'blocks', 'task'),
  ('task_dependency', 'depends_on', 'task'),
  ('acceptance_plan', 'validates', 'task'),
  ('acceptance_dependency', 'depends_on', 'acceptance_plan'),
  ('construction_drawing', 'supports', 'task'),
  ('drawing_version', 'versions', 'construction_drawing'),
  ('project_material', 'supplies', 'task'),
  ('certificate', 'validates', 'milestone'),
  ('certificate_dependency', 'depends_on', 'certificate')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;

-- ============================================================
-- 3. data_lineage_links
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  batch_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_links_project ON data_lineage_links(project_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_source ON data_lineage_links(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_target ON data_lineage_links(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_batch ON data_lineage_links(batch_ref) WHERE batch_ref IS NOT NULL;

ALTER TABLE data_lineage_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_lineage_links_read_policy ON data_lineage_links;
CREATE POLICY data_lineage_links_read_policy ON data_lineage_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = data_lineage_links.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role')
  );
DROP POLICY IF EXISTS data_lineage_links_write_policy ON data_lineage_links;
CREATE POLICY data_lineage_links_write_policy ON data_lineage_links
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 4. AI Governance boundary (v1.4.6 §11)
-- AI tools may READ lineage for context, but must NOT directly write
-- lineage_links, tasks, or any production data. AI output is limited to
-- explanation, suggestion, and repair drafts only.
-- ============================================================
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, is_business_lineage_allowed, is_project_scoped) VALUES
  ('ai_suggestion', 'AI建议草案', 'governance', false, false),
  ('ai_repair_draft', 'AI修复草案', 'governance', false, false),
  ('ai_context_query', 'AI上下文查询', 'governance', false, false)
ON CONFLICT (entity_type) DO NOTHING;

INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type) VALUES
  ('ai_context_query', 'reads', 'task'),
  ('ai_suggestion', 'suggests', 'task'),
  ('ai_repair_draft', 'drafts_fix_for', 'task')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;


-- 126_complete_data_lineage_system.sql

-- ============================================================
-- 0. data_lineage_batches — track lineage batch operations
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_type TEXT NOT NULL,
  link_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_batches_project ON data_lineage_batches(project_id, created_at DESC);

-- ============================================================
-- 1. data_import_batches — track import operations
-- ============================================================
CREATE TABLE IF NOT EXISTS data_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL DEFAULT 'task_import',
  file_name TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  mapping_status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_import_batches_project ON data_import_batches(project_id, created_at DESC);

-- ============================================================
-- 2. import_rows — per-row import tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS data_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  target_entity_type TEXT NOT NULL DEFAULT 'task',
  target_entity_id UUID,
  source_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_import_rows_batch ON data_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_target ON data_import_rows(target_entity_type, target_entity_id);

-- ============================================================
-- 3. lineage_events — who/when changed lineage
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  link_id UUID REFERENCES data_lineage_links(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_events_project ON data_lineage_events(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_lineage_events_link ON data_lineage_events(link_id) WHERE link_id IS NOT NULL;

-- ============================================================
-- 4. Add mapping_status / confidence to data_lineage_links
-- ============================================================
ALTER TABLE data_lineage_links ADD COLUMN IF NOT EXISTS mapping_status TEXT;
ALTER TABLE data_lineage_links ADD COLUMN IF NOT EXISTS confidence REAL;

-- ============================================================
-- 4.1. Append-only trigger: data_lineage_events rejects UPDATE/DELETE
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_lineage_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'data_lineage_events is append-only: % not allowed', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lineage_events_append_only ON data_lineage_events;
CREATE TRIGGER trigger_lineage_events_append_only
  BEFORE UPDATE OR DELETE ON data_lineage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lineage_events_append_only();

-- Idempotency: unique active pair on data_lineage_links (one active link per source-target-type combination)
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_links_active_pair
  ON data_lineage_links(source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id);

-- Data completeness: mapping_status check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_lineage_links_mapping_check') THEN
    ALTER TABLE data_lineage_links ADD CONSTRAINT data_lineage_links_mapping_check
      CHECK (mapping_status IS NULL OR mapping_status IN ('mapped', 'pending', 'broken', 'orphan', 'deprecated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_lineage_links_confidence_check') THEN
    ALTER TABLE data_lineage_links ADD CONSTRAINT data_lineage_links_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

-- Idempotency key for data_lineage_batches
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_batches_idempotent
  ON data_lineage_batches(project_id, batch_type, COALESCE(metadata->>'source_ref', ''));

-- ============================================================
-- 5. RLS on new tables
-- ============================================================
ALTER TABLE data_lineage_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_lineage_events ENABLE ROW LEVEL SECURITY;

-- Read policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['data_lineage_batches','data_import_batches','data_import_rows','data_lineage_events'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_read_policy ON %I FOR SELECT USING (
      EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = %I.project_id AND pm.user_id = auth.uid())
      OR (SELECT current_setting(''role'', true) = ''service_role'')
    )', tbl, tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write_policy ON %I FOR INSERT WITH CHECK ((SELECT current_setting(''role'', true) = ''service_role''))', tbl, tbl);
  END LOOP;
END $$;



-- 128_create_project_entity_links.sql

CREATE TABLE IF NOT EXISTS project_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  relation_strength TEXT NOT NULL DEFAULT 'explicit',
  status TEXT NOT NULL DEFAULT 'active',
  source_ref_field TEXT,
  display_snapshot JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints (idempotent via DO $$)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_source_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_source_type_check
      CHECK (source_entity_type IN ('drawing_package','construction_drawing','pre_milestone','certificate_work_item','acceptance_plan'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_target_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_target_type_check
      CHECK (target_entity_type IN ('task','task_condition','acceptance_requirement','pre_milestone','certificate_work_item'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_relation_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_relation_type_check
      CHECK (relation_type IN ('satisfies_condition','satisfies_acceptance_requirement','covers_task','references_certificate','blocks_task_start'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_relation_strength_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_relation_strength_check
      CHECK (relation_strength IN ('explicit','system_inferred','legacy_mapped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_status_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_status_check
      CHECK (status IN ('active','inactive'));
  END IF;
END $$;

-- Unique active link
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_entity_links_unique_active
  ON project_entity_links(project_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type)
  WHERE status = 'active';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_project_entity_links_source
  ON project_entity_links(project_id, source_entity_type, source_entity_id, status);
CREATE INDEX IF NOT EXISTS idx_project_entity_links_target
  ON project_entity_links(project_id, target_entity_type, target_entity_id, status);

-- RLS
ALTER TABLE project_entity_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_entity_links_read_policy ON project_entity_links;
CREATE POLICY project_entity_links_read_policy ON project_entity_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_entity_links.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS project_entity_links_write_policy ON project_entity_links;
CREATE POLICY project_entity_links_write_policy ON project_entity_links FOR INSERT
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- Projection columns on task_conditions for v1.4.11 linkage
ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- Projection columns on acceptance_requirements for v1.4.11 linkage
ALTER TABLE acceptance_requirements
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_project_entity_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_project_entity_links_updated_at ON project_entity_links;
CREATE TRIGGER trigger_update_project_entity_links_updated_at
  BEFORE UPDATE ON project_entity_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_entity_links_updated_at();


-- 127_plan_truth_snapshot_boundaries.sql

-- Baseline rows are total-control commitment snapshots. They must preserve
-- the task facts used at generation/publish time instead of drifting with tasks.
ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'current_execution_fact',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

-- Monthly plan rows are monthly commitment snapshots. They either inherit a
-- baseline snapshot or capture current execution facts when generated directly.
ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'baseline_commitment_snapshot',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_snapshot_source
  ON task_baseline_items(project_id, snapshot_source);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_snapshot_source
  ON monthly_plan_items(project_id, snapshot_source);

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_scope_snapshot
  ON task_baseline_items USING GIN (scope_snapshot);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_scope_snapshot
  ON monthly_plan_items USING GIN (scope_snapshot);

-- Ensure the current migration's physical rules contain the plan snapshot links
-- used by v1.4.7 generation boundaries.
INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type)
VALUES
  ('task', 'generates', 'task_baseline_item'),
  ('task_baseline_item', 'derives', 'monthly_plan_item'),
  ('monthly_plan_item', 'carries_over_to', 'monthly_plan_item'),
  ('task', 'carries_over_to', 'monthly_plan_item')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;


-- 129_v147_v1410_plan_governance_completion.sql

-- ============================================================
-- v1.4.7: Plan governance columns
-- ============================================================
ALTER TABLE task_baselines
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_reason TEXT,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE monthly_plans
  ADD COLUMN IF NOT EXISTS source_mode TEXT,
  ADD COLUMN IF NOT EXISTS generation_cutoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temporary_without_baseline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS manual_override_fields JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS planning_governance_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_schedule_change_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_progress_snapshot_at TIMESTAMPTZ;

-- v1.4.7: Monthly plan status check + source_mode check
ALTER TABLE monthly_plans DROP CONSTRAINT IF EXISTS monthly_plans_status_check;
DO $$ BEGIN
  ALTER TABLE monthly_plans ADD CONSTRAINT monthly_plans_status_check
    CHECK (status IN ('draft','confirmed','closed','revising','pending_realign','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE monthly_plans DROP CONSTRAINT IF EXISTS monthly_plans_source_mode_check;
DO $$ BEGIN
  ALTER TABLE monthly_plans ADD CONSTRAINT monthly_plans_source_mode_check
    CHECK (source_mode IS NULL OR source_mode IN ('baseline','schedule','mixed','manual','imported'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_plans_current_confirmed
  ON monthly_plans(project_id, month) WHERE status = 'confirmed';

-- ============================================================
-- v1.4.8: task_dependencies hardening
-- ============================================================
ALTER TABLE task_dependencies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_satisfied BOOLEAN;

DO $$ BEGIN
  ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_status_check
    CHECK (status IN ('active','inactive','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Replace full unique index with active-only unique
DROP INDEX IF EXISTS uq_task_dependencies_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_active_unique
  ON task_dependencies(project_id, task_id, dependency_task_id, dependency_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_task_dependencies_status ON task_dependencies(project_id, status);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_confidence ON task_dependencies(project_id, inference_confidence);

-- ============================================================
-- v1.4.8: task_conditions hardening
-- ============================================================
ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS condition_code TEXT,
  ADD COLUMN IF NOT EXISTS required_for_start BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS blocking_level TEXT NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id UUID,
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_blocking_level_check
    CHECK (blocking_level IN ('hard','soft','info'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_conditions_constraint ON task_conditions(project_id, blocking_level, is_satisfied);
CREATE INDEX IF NOT EXISTS idx_task_conditions_confidence ON task_conditions(project_id, inference_confidence);

-- ============================================================
-- v1.4.8: task_obstacles hardening
-- ============================================================
ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS obstacle_code TEXT,
  ADD COLUMN IF NOT EXISTS impact_level TEXT NOT NULL DEFAULT 'partial',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id UUID,
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_impact_level_check
    CHECK (impact_level IN ('none','partial','severe','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_obstacles_constraint ON task_obstacles(project_id, impact_level, is_resolved);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_confidence ON task_obstacles(project_id, inference_confidence);

-- ============================================================
-- v1.4.9: Milestone key node snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS project_key_node_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'generated',
  key_node_type TEXT NOT NULL DEFAULT 'milestone',
  source_task_ids UUID[] NOT NULL DEFAULT '{}',
  display_label TEXT NOT NULL,
  planned_date TIMESTAMPTZ,
  actual_date TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_project ON project_key_node_snapshots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_baseline ON project_key_node_snapshots(baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_monthly ON project_key_node_snapshots(monthly_plan_id);

-- v1.4.9: tasks milestone indexes
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS key_node_type TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_project_milestones ON tasks(project_id, is_milestone, status);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id) WHERE milestone_id IS NOT NULL;

-- 130_reconcile_milestone_task_authority.sql
-- v1.4.9: Milestones are tasks.is_milestone=true rows.
-- Remove old FK to milestones table, enforce self-referencing within tasks.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_milestone_id;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_milestone_id_fkey;

CREATE OR REPLACE FUNCTION public.check_task_milestone_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.milestone_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.milestone_id IS NOT DISTINCT FROM NEW.milestone_id THEN
    RETURN NEW;
  END IF;
  IF NEW.milestone_id = NEW.id THEN
    RAISE EXCEPTION 'Task cannot reference itself as milestone: %', NEW.id;
  END IF;
  PERFORM 1 FROM tasks
    WHERE id = NEW.milestone_id
      AND project_id = NEW.project_id
      AND is_milestone = true
      AND status != 'cancelled'
    LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone_id must reference a same-project active milestone task: %', NEW.milestone_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_task_milestone_reference ON tasks;
CREATE TRIGGER trigger_check_task_milestone_reference
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.milestone_id IS NOT NULL)
  EXECUTE FUNCTION public.check_task_milestone_reference();

CREATE OR REPLACE FUNCTION public.cleanup_milestone_references_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.is_milestone = true THEN
    UPDATE tasks SET milestone_id = NULL WHERE milestone_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_milestone_refs ON tasks;
CREATE TRIGGER trigger_cleanup_milestone_refs
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_milestone_references_on_cancel();
-- ============================================================
-- v1.4.10: participant_units hardening
-- ============================================================
ALTER TABLE participant_units
  ADD COLUMN IF NOT EXISTS unit_code TEXT,
  ADD COLUMN IF NOT EXISTS unit_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE participant_units ADD CONSTRAINT participant_units_unit_status_check
    CHECK (unit_status IN ('active','inactive','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_participant_units_project_status ON participant_units(project_id, unit_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participant_units_project_name_active_unique
  ON participant_units(project_id, unit_name) WHERE unit_status = 'active';

-- v1.4.10: task_conditions participant_unit reference
ALTER TABLE task_conditions ADD COLUMN IF NOT EXISTS participant_unit_id UUID;
CREATE INDEX IF NOT EXISTS idx_task_conditions_participant_unit_id ON task_conditions(participant_unit_id);



-- 131_v147_v1411_closure_fixups.sql`n-- Final closure fixups for v1.4.7-v1.4.11 implementation boundaries.`n`n
-- v1.4.8 task constraint cache on current task facts.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS ready_for_start BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dependency_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS condition_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS obstacle_status TEXT NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS progress_impact_level TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS blocked_for_progress BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS readiness_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS constraint_evaluated_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_dependency_status_check
    CHECK (dependency_status IN ('satisfied','blocking','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_condition_status_check
    CHECK (condition_status IN ('satisfied','blocking','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_obstacle_status_check
    CHECK (obstacle_status IN ('clear','warning','partial_impact','blocked','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_progress_impact_level_check
    CHECK (progress_impact_level IN ('none','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_constraint_status
  ON tasks(project_id, ready_for_start, progress_impact_level, blocked_for_progress);

ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS progress_impact_level TEXT NOT NULL DEFAULT 'warning',
  ADD COLUMN IF NOT EXISTS blocking_scope TEXT NOT NULL DEFAULT 'progress',
  ADD COLUMN IF NOT EXISTS blocking_level TEXT NOT NULL DEFAULT 'warning';

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_progress_impact_level_check
    CHECK (progress_impact_level IN ('none','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_blocking_scope_check
    CHECK (blocking_scope IN ('none','start','progress','finish'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_blocking_level_check
    CHECK (blocking_level IN ('info','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS task_constraint_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ready_for_start BOOLEAN NOT NULL DEFAULT true,
  dependency_status TEXT NOT NULL DEFAULT 'not_applicable',
  condition_status TEXT NOT NULL DEFAULT 'not_applicable',
  obstacle_status TEXT NOT NULL DEFAULT 'clear',
  progress_impact_level TEXT NOT NULL DEFAULT 'none',
  blocked_for_progress BOOLEAN NOT NULL DEFAULT false,
  readiness_summary JSONB NOT NULL DEFAULT '{}',
  source_event_type TEXT NOT NULL,
  source_event_key TEXT NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT 'v1.4.8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_constraint_snapshots_event_key
  ON task_constraint_snapshots(source_event_key);
CREATE INDEX IF NOT EXISTS idx_task_constraint_snapshots_task
  ON task_constraint_snapshots(project_id, task_id, created_at DESC);

-- v1.4.10 participant unit lifecycle vocabulary used by ordinary selectors.
ALTER TABLE participant_units DROP CONSTRAINT IF EXISTS participant_units_unit_status_check;
ALTER TABLE participant_units
  ADD CONSTRAINT participant_units_unit_status_check
  CHECK (unit_status IN ('active','disabled','archived'));

-- Included from 132_project_entity_link_delete_guards.sql
-- 132_project_entity_link_delete_guards.sql
-- v1.4.11 closure: protect source facts and retire target links on delete.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_delete_active_project_entity_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
  v_active_count INTEGER := 0;
BEGIN
  SELECT COUNT(*)
    INTO v_active_count
    FROM public.project_entity_links
   WHERE project_id = OLD.project_id
     AND status = 'active'
     AND (
       (source_entity_type = v_entity_type AND source_entity_id = OLD.id::TEXT)
       OR (target_entity_type = v_entity_type AND target_entity_id = OLD.id::TEXT)
     );

  IF v_active_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete % % while active project_entity_links exist',
      v_entity_type,
      OLD.id
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_target_project_entity_links_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
BEGIN
  UPDATE public.project_entity_links
     SET status = 'inactive',
         updated_at = NOW()
   WHERE project_id = OLD.project_id
     AND target_entity_type = v_entity_type
     AND target_entity_id = OLD.id::TEXT
     AND status = 'active';

  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.drawing_packages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_drawing_packages_active_links ON public.drawing_packages;
    CREATE TRIGGER prevent_delete_drawing_packages_active_links
      BEFORE DELETE ON public.drawing_packages
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('drawing_package');
  END IF;

  IF to_regclass('public.construction_drawings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_construction_drawings_active_links ON public.construction_drawings;
    CREATE TRIGGER prevent_delete_construction_drawings_active_links
      BEFORE DELETE ON public.construction_drawings
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('construction_drawing');
  END IF;

  IF to_regclass('public.pre_milestones') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_pre_milestones_active_links ON public.pre_milestones;
    CREATE TRIGGER prevent_delete_pre_milestones_active_links
      BEFORE DELETE ON public.pre_milestones
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('pre_milestone');
  END IF;

  IF to_regclass('public.certificate_work_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_certificate_work_items_active_links ON public.certificate_work_items;
    CREATE TRIGGER prevent_delete_certificate_work_items_active_links
      BEFORE DELETE ON public.certificate_work_items
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('certificate_work_item');
  END IF;

  IF to_regclass('public.acceptance_plans') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_acceptance_plans_active_links ON public.acceptance_plans;
    CREATE TRIGGER prevent_delete_acceptance_plans_active_links
      BEFORE DELETE ON public.acceptance_plans
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('acceptance_plan');
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_task_project_entity_links_before_delete ON public.tasks;
    CREATE TRIGGER deactivate_task_project_entity_links_before_delete
      BEFORE DELETE ON public.tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('task');
  END IF;

  IF to_regclass('public.task_conditions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_task_condition_project_entity_links_before_delete ON public.task_conditions;
    CREATE TRIGGER deactivate_task_condition_project_entity_links_before_delete
      BEFORE DELETE ON public.task_conditions
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('task_condition');
  END IF;

  IF to_regclass('public.acceptance_requirements') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_acceptance_requirement_project_entity_links_before_delete ON public.acceptance_requirements;
    CREATE TRIGGER deactivate_acceptance_requirement_project_entity_links_before_delete
      BEFORE DELETE ON public.acceptance_requirements
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('acceptance_requirement');
  END IF;
END $$;

COMMIT;


-- ============================================================
-- v1.4 canonical clean bundle coverage backfill
-- These source blocks keep CLEAN_MIGRATION_V4 aligned with late v1.4 incremental migrations.
-- ============================================================


-- ============================================================
-- Source: 120_create_engineering_objects.sql
-- ============================================================
-- 120_create_engineering_objects.sql
-- v1.4 / v1.4.1 Engineering objects master data system.
-- Adds engineering_objects as the authoritative source for scope dimensions
-- and attaches object-id foreign keys to tasks, materials, and acceptance plans.

BEGIN;

-- ============================================================
-- 1. Engineering objects master table
-- ============================================================
CREATE TABLE IF NOT EXISTS engineering_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL
    CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area')),
  object_code TEXT NOT NULL,
  object_name TEXT NOT NULL,
  parent_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Code must be unique per project + type (all statuses)
  UNIQUE (project_id, object_type, object_code)
);

-- Name uniqueness is enforced via partial unique indexes below (not a plain UNIQUE constraint).
-- A plain UNIQUE(project_id, object_name) would block inactive/historical name reuse
-- and would be superseded by the partial indexes that only apply to active rows.

-- Partial unique indexes for name uniqueness (active objects only).
-- Root nodes: parent_id IS NULL, status = 'active'
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_root_active_name
  ON engineering_objects (project_id, object_name)
  WHERE parent_id IS NULL AND status = 'active';

-- Child nodes: parent_id IS NOT NULL, status = 'active'
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_child_active_name
  ON engineering_objects (project_id, parent_id, object_name)
  WHERE parent_id IS NOT NULL AND status = 'active';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_type_status
  ON engineering_objects (project_id, object_type, status);

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_parent_sort
  ON engineering_objects (project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_path
  ON engineering_objects (project_id, path);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_engineering_objects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_engineering_objects_updated_at ON engineering_objects;
CREATE TRIGGER trigger_update_engineering_objects_updated_at
  BEFORE UPDATE ON engineering_objects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_engineering_objects_updated_at();

-- ============================================================
-- 2. RLS on engineering_objects
-- ============================================================
ALTER TABLE engineering_objects ENABLE ROW LEVEL SECURITY;

-- SELECT: project members OR company_admin role OR service_role
DROP POLICY IF EXISTS engineering_objects_select_policy ON engineering_objects;
CREATE POLICY engineering_objects_select_policy ON engineering_objects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = engineering_objects.project_id
        AND pm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'company_admin'
    )
    OR
    (SELECT current_setting('role', true) = 'service_role')
  );

-- Only service_role can write (business logic enforced by backend API routes)
DROP POLICY IF EXISTS engineering_objects_insert_policy ON engineering_objects;
CREATE POLICY engineering_objects_insert_policy ON engineering_objects
  FOR INSERT
  WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_update_policy ON engineering_objects;
CREATE POLICY engineering_objects_update_policy ON engineering_objects
  FOR UPDATE
  USING (
    (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_delete_policy ON engineering_objects;
CREATE POLICY engineering_objects_delete_policy ON engineering_objects
  FOR DELETE
  USING (
    (SELECT current_setting('role', true) = 'service_role')
  );

-- ============================================================
-- 3. Task columns 鈥?v1.4.22.1 object-id foreign keys (seven-class range tree)
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS engineering_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS floor_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS basement_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS physical_zone_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS functional_area_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_engineering_object_id ON tasks(engineering_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase_object_id ON tasks(phase_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_section_object_id ON tasks(section_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_building_object_id ON tasks(building_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_floor_object_id ON tasks(floor_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_basement_object_id ON tasks(basement_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_physical_zone_object_id ON tasks(physical_zone_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_functional_area_object_id ON tasks(functional_area_object_id);

-- ============================================================
-- 4. Acceptance plan column 鈥?building object id
-- ============================================================
ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS building_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_building_object_id
  ON acceptance_plans(building_object_id);

COMMIT;

-- ============================================================
-- Source: 246_v14231_advisor_public_rls_closeout.sql
-- ============================================================
-- v1.4.23.1 follow-up: close the local migration side of the Supabase
-- Advisor public RLS findings discovered during C-18 / C-18.L review.
--
-- This migration is intentionally forward-only and idempotent. It hardens the
-- known public tables that Advisor flagged locally; a real Advisor/catalog
-- rescan is still required after applying it to staging or production.

BEGIN;

ALTER TABLE IF EXISTS public.project_key_node_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_key_node_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_constraint_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_constraint_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_entity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_entity_types FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_relation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_relation_rules FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.project_key_node_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_key_node_snapshots TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_key_node_snapshots_auth_read_policy ON public.project_key_node_snapshots';
      EXECUTE $policy$
        CREATE POLICY project_key_node_snapshots_auth_read_policy
          ON public.project_key_node_snapshots
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = project_key_node_snapshots.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS project_key_node_snapshots_auth_write_policy ON public.project_key_node_snapshots';
      EXECUTE $policy$
        CREATE POLICY project_key_node_snapshots_auth_write_policy
          ON public.project_key_node_snapshots
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = project_key_node_snapshots.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = project_key_node_snapshots.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_key_node_snapshots TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_key_node_snapshots_backend_runtime_policy ON public.project_key_node_snapshots';
      EXECUTE $policy$
        CREATE POLICY project_key_node_snapshots_backend_runtime_policy
          ON public.project_key_node_snapshots
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.task_constraint_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_constraint_snapshots TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS task_constraint_snapshots_auth_read_policy ON public.task_constraint_snapshots';
      EXECUTE $policy$
        CREATE POLICY task_constraint_snapshots_auth_read_policy
          ON public.task_constraint_snapshots
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = task_constraint_snapshots.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS task_constraint_snapshots_auth_write_policy ON public.task_constraint_snapshots';
      EXECUTE $policy$
        CREATE POLICY task_constraint_snapshots_auth_write_policy
          ON public.task_constraint_snapshots
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = task_constraint_snapshots.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
          WITH CHECK (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = task_constraint_snapshots.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_constraint_snapshots TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS task_constraint_snapshots_backend_runtime_policy ON public.task_constraint_snapshots';
      EXECUTE $policy$
        CREATE POLICY task_constraint_snapshots_backend_runtime_policy
          ON public.task_constraint_snapshots
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.data_lineage_entity_types') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_entity_types TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS data_lineage_entity_types_authenticated_read_policy ON public.data_lineage_entity_types';
      EXECUTE $policy$
        CREATE POLICY data_lineage_entity_types_authenticated_read_policy
          ON public.data_lineage_entity_types
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_entity_types TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS data_lineage_entity_types_backend_runtime_read_policy ON public.data_lineage_entity_types';
      EXECUTE $policy$
        CREATE POLICY data_lineage_entity_types_backend_runtime_read_policy
          ON public.data_lineage_entity_types
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.data_lineage_relation_rules') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_relation_rules TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS data_lineage_relation_rules_authenticated_read_policy ON public.data_lineage_relation_rules';
      EXECUTE $policy$
        CREATE POLICY data_lineage_relation_rules_authenticated_read_policy
          ON public.data_lineage_relation_rules
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_relation_rules TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS data_lineage_relation_rules_backend_runtime_read_policy ON public.data_lineage_relation_rules';
      EXECUTE $policy$
        CREATE POLICY data_lineage_relation_rules_backend_runtime_read_policy
          ON public.data_lineage_relation_rules
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
-- ============================================================
-- Source: 121_add_wbs_engineering_categories.sql
-- ============================================================
-- 121_add_wbs_engineering_categories.sql
-- v1.4.2 WBS decomposition standard system.
-- Adds engineering_categories as the WBS work classification tree,
-- and attaches WBS semantic columns to tasks, baselines, and monthly plans.

BEGIN;

-- ============================================================
-- 1. Engineering categories (WBS work classification tree)
-- ============================================================
CREATE TABLE IF NOT EXISTS engineering_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES engineering_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  category_type TEXT NOT NULL
    CHECK (category_type IN ('division','sub_division','item_work','process','activity_step','custom')),
  category_level INTEGER NOT NULL DEFAULT 1,
  category_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same-parent enabled name uniqueness (handles both project=NULL and project=value)
CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_enabled_name
  ON engineering_categories (category_name)
  WHERE project_id IS NULL AND parent_id IS NULL AND enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_root_enabled_name
  ON engineering_categories (project_id, category_name)
  WHERE project_id IS NOT NULL AND parent_id IS NULL AND enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_child_enabled_name
  ON engineering_categories (project_id, parent_id, category_name)
  WHERE project_id IS NOT NULL AND parent_id IS NOT NULL AND enabled = true;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_eng_cat_project_type
  ON engineering_categories (project_id, category_type) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eng_cat_system_type
  ON engineering_categories (category_type) WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_eng_cat_project_parent_sort
  ON engineering_categories (project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_eng_cat_path
  ON engineering_categories (category_path);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_engineering_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_engineering_categories_updated_at ON engineering_categories;
CREATE TRIGGER trigger_update_engineering_categories_updated_at
  BEFORE UPDATE ON engineering_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_engineering_categories_updated_at();

-- RLS
ALTER TABLE engineering_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engineering_categories_select_policy ON engineering_categories;
CREATE POLICY engineering_categories_select_policy ON engineering_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = engineering_categories.project_id
        AND pm.user_id = auth.uid()
    )
    OR engineering_categories.project_id IS NULL
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'company_admin'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_categories_insert_policy ON engineering_categories;
CREATE POLICY engineering_categories_insert_policy ON engineering_categories
  FOR INSERT WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_categories_update_policy ON engineering_categories;
CREATE POLICY engineering_categories_update_policy ON engineering_categories
  FOR UPDATE USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS engineering_categories_delete_policy ON engineering_categories;
CREATE POLICY engineering_categories_delete_policy ON engineering_categories
  FOR DELETE USING ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 2. WBS semantic columns on tasks
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID REFERENCES engineering_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_leaf BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_engineering_category_id ON tasks(engineering_category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wbs_node_type ON tasks(project_id, wbs_node_type);
CREATE INDEX IF NOT EXISTS idx_tasks_is_executable ON tasks(project_id, is_executable) WHERE is_executable = true;

-- ============================================================
-- 3. WBS semantic snapshot columns on task_baseline_items
-- ============================================================
ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

-- ============================================================
-- 4. WBS semantic snapshot columns on monthly_plan_items
-- ============================================================
ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

COMMIT;


-- ============================================================
-- Source: 121a_add_engineering_categories_standard_fields.sql
-- ============================================================
-- 121a_add_engineering_categories_standard_fields.sql
-- v1.4.2 revision: add standard_work_code/name to engineering_categories,
-- add unique index for enabled name uniqueness, and sync snapshots.

BEGIN;

ALTER TABLE engineering_categories
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_enabled_name
  ON engineering_categories (project_id, COALESCE(parent_id::text, '_root_'), category_name)
  WHERE enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_standard_work_code
  ON engineering_categories (standard_work_code)
  WHERE project_id IS NULL AND standard_work_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_standard_work_code
  ON engineering_categories (project_id, standard_work_code)
  WHERE project_id IS NOT NULL AND standard_work_code IS NOT NULL;

COMMIT;


-- ============================================================
-- Source: 122_create_construction_task_standard_model.sql
-- ============================================================
-- 122_create_construction_task_standard_model.sql
-- v1.4.3 Construction task standard data model.
-- Adds task standard fields, task_dependencies table, and constraints.

BEGIN;

-- ============================================================
-- 0. Pre-flight: detect existing task_dependencies structure
-- ============================================================
DO $$
DECLARE
  has_predecessor_col BOOLEAN;
  has_task_id_col BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_dependencies'
  ) THEN
    -- Check column structure
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_dependencies'
        AND column_name = 'predecessor_id'
    ) INTO has_predecessor_col;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_dependencies'
        AND column_name = 'task_id'
    ) INTO has_task_id_col;

    -- If old structure (predecessor_id without task_id), rename to v1.4.3 standard
    IF has_predecessor_col AND NOT has_task_id_col THEN
      ALTER TABLE public.task_dependencies RENAME COLUMN predecessor_id TO task_id;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'task_dependencies'
          AND column_name = 'successor_id'
      ) THEN
        ALTER TABLE public.task_dependencies RENAME COLUMN successor_id TO dependency_task_id;
      END IF;
      RAISE NOTICE 'task_dependencies migrated from predecessor/successor to task_id/dependency_task_id';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 1. Task dependencies standard table
-- ============================================================
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'FS'
    CHECK (dependency_type IN ('FS','SS','FF','SF')),
  lag_days INTEGER NOT NULL DEFAULT 0,
  required_for_start BOOLEAN NOT NULL DEFAULT true,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_dependencies_not_self CHECK (task_id <> dependency_task_id)
);

-- Add constraint if not exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_not_self'
  ) THEN
    ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_not_self CHECK (task_id <> dependency_task_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_unique
  ON task_dependencies(project_id, task_id, dependency_task_id, dependency_type);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task
  ON task_dependencies(project_id, task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependency
  ON task_dependencies(project_id, dependency_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_required
  ON task_dependencies(project_id, required_for_start);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_source
  ON task_dependencies(project_id, source_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_task_dependencies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_dependencies_updated_at ON task_dependencies;
CREATE TRIGGER trigger_update_task_dependencies_updated_at
  BEFORE UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_dependencies_updated_at();

-- RLS
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_dependencies_select_policy ON task_dependencies;
CREATE POLICY task_dependencies_select_policy ON task_dependencies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_insert_policy ON task_dependencies;
CREATE POLICY task_dependencies_insert_policy ON task_dependencies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.permission_level IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_update_policy ON task_dependencies;
CREATE POLICY task_dependencies_update_policy ON task_dependencies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.permission_level IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_delete_policy ON task_dependencies;
CREATE POLICY task_dependencies_delete_policy ON task_dependencies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.permission_level IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

-- ============================================================
-- 2. Task standard fields
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_code TEXT,
  ADD COLUMN IF NOT EXISTS task_code_version TEXT,
  ADD COLUMN IF NOT EXISTS progress_method TEXT NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS planned_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS completed_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT,
  ADD COLUMN IF NOT EXISTS progress_weight NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completion_rule TEXT NOT NULL DEFAULT 'progress_100',
  ADD COLUMN IF NOT EXISTS drawing_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS material_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceptance_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standard_task_metadata JSONB NOT NULL DEFAULT '{}';

-- Constraint: progress_method check (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_method_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_method_check
      CHECK (progress_method IN ('percent','quantity','milestone','manual_weighted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_completion_rule_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_completion_rule_check
      CHECK (completion_rule IN ('progress_100','quantity_completed','acceptance_passed','manual_confirmed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_weight_positive_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_weight_positive_check
      CHECK (progress_weight > 0);
  END IF;
END $$;

-- task_code unique per project
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_project_task_code
  ON tasks(project_id, task_code)
  WHERE task_code IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_executable
  ON tasks(project_id, is_executable, status);
CREATE INDEX IF NOT EXISTS idx_tasks_task_code
  ON tasks(task_code) WHERE task_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_progress_method
  ON tasks(project_id, progress_method);

-- ============================================================
-- 3. Backfill defaults for existing tasks
-- ============================================================
UPDATE tasks
SET
  progress_method = COALESCE(progress_method, 'percent'),
  completion_rule = COALESCE(completion_rule, 'progress_100'),
  progress_weight = COALESCE(progress_weight, 1),
  standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
WHERE progress_method IS NULL OR completion_rule IS NULL OR progress_weight IS NULL OR standard_task_metadata IS NULL;


-- Atomic replace_task_dependencies RPC: delete all old + insert all new in one transaction
CREATE OR REPLACE FUNCTION public.replace_task_dependencies(
  p_task_id UUID,
  p_deps JSONB
)
RETURNS SETOF task_dependencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dep JSONB;
  dep_ids UUID[];
BEGIN
  -- Delete old
  DELETE FROM task_dependencies WHERE task_id = p_task_id;

  -- Insert new
  FOR dep IN SELECT * FROM jsonb_array_elements(p_deps)
  LOOP
    INSERT INTO task_dependencies (
      id, project_id, task_id, dependency_task_id,
      dependency_type, lag_days, required_for_start, source_type,
      created_at, updated_at
    ) VALUES (
      COALESCE((dep->>'id')::UUID, gen_random_uuid()),
      COALESCE((dep->>'project_id')::UUID, (SELECT project_id FROM tasks WHERE id = p_task_id)),
      p_task_id,
      (dep->>'dependency_task_id')::UUID,
      COALESCE(dep->>'dependency_type', 'FS'),
      COALESCE((dep->>'lag_days')::INTEGER, 0),
      COALESCE((dep->>'required_for_start')::BOOLEAN, true),
      COALESCE(dep->>'source_type', 'manual'),
      COALESCE((dep->>'created_at')::TIMESTAMPTZ, NOW()),
      COALESCE((dep->>'updated_at')::TIMESTAMPTZ, NOW())
    );
    -- rows are returned after the cache sync below
  END LOOP;

  -- Sync tasks.dependencies cache
  SELECT array_agg(dependency_task_id) INTO dep_ids
    FROM task_dependencies WHERE task_id = p_task_id;
  UPDATE tasks SET dependencies = COALESCE(dep_ids, '{}') WHERE id = p_task_id;

  RETURN QUERY SELECT * FROM task_dependencies WHERE task_id = p_task_id;
END;
$$;

-- Same-project trigger: ensure task_id and dependency_task_id match project_id
CREATE OR REPLACE FUNCTION public.check_task_dependencies_same_project()
RETURNS TRIGGER AS $$
DECLARE
  task_project UUID;
  dep_project UUID;
BEGIN
  SELECT project_id INTO task_project FROM tasks WHERE id = NEW.task_id;
  SELECT project_id INTO dep_project FROM tasks WHERE id = NEW.dependency_task_id;
  IF task_project IS NULL OR dep_project IS NULL THEN
    RAISE EXCEPTION 'Task or dependency task not found';
  END IF;
  IF task_project != dep_project THEN
    RAISE EXCEPTION 'task_id (%) and dependency_task_id (%) belong to different projects', NEW.task_id, NEW.dependency_task_id;
  END IF;
  IF NEW.project_id IS NULL THEN
    NEW.project_id = task_project;
  ELSIF NEW.project_id != task_project THEN
    RAISE EXCEPTION 'project_id mismatch: task % belongs to project %, not %', NEW.task_id, task_project, NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_task_dependencies_same_project ON task_dependencies;
CREATE TRIGGER trigger_check_task_dependencies_same_project
  BEFORE INSERT OR UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_task_dependencies_same_project();

COMMIT;


-- ============================================================
-- Source: 123_create_task_code_rules.sql
-- ============================================================
-- 123_create_task_code_rules.sql
-- v1.4.4 Construction task code rules system.
-- Adds project_code, task code rules, sequences, history, and standard work code indexes.

BEGIN;

-- ============================================================
-- 0. Helper: nextval RPC wrapper
-- ============================================================
CREATE OR REPLACE FUNCTION public.nextval(seq_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  val INTEGER;
BEGIN
  EXECUTE format('SELECT nextval(%I)', seq_name) INTO val;
  RETURN val;
END;
$$;

-- ============================================================
-- 0.1 Atomic sequence increment RPC (SELECT FOR UPDATE lock)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_task_code_sequence(
  p_project_id UUID,
  p_rule_id UUID,
  p_sequence_key TEXT,
  p_seq_length INTEGER DEFAULT 3
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_next_val INTEGER;
BEGIN
  -- Upsert if not exists
  INSERT INTO task_code_sequences (project_id, rule_id, sequence_key, current_value)
  VALUES (p_project_id, p_rule_id, p_sequence_key, 0)
  ON CONFLICT (project_id, rule_id, sequence_key) DO NOTHING;

  -- Lock and increment
  SELECT * INTO v_row FROM task_code_sequences
  WHERE project_id = p_project_id AND rule_id = p_rule_id AND sequence_key = p_sequence_key
  FOR UPDATE;

  v_next_val := v_row.current_value + 1;

  UPDATE task_code_sequences SET current_value = v_next_val, updated_at = NOW()
  WHERE id = v_row.id;

  RETURN LPAD(v_next_val::TEXT, p_seq_length, '0');
END;
$$;

-- ============================================================
-- 1. projects: project_code
-- ============================================================
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code_generated_at TIMESTAMPTZ;
CREATE SEQUENCE IF NOT EXISTS project_code_seq START WITH 1 INCREMENT BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_project_code
  ON projects(project_code) WHERE project_code IS NOT NULL;

-- ============================================================
-- 2. tasks: task_code_rule_id / task_code_generated_at
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_code_rule_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_code_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_task_code_rule_id
  ON tasks(task_code_rule_id) WHERE task_code_rule_id IS NOT NULL;

-- ============================================================
-- 3. engineering_categories: standard_work_code idempotent confirm
-- ============================================================
ALTER TABLE engineering_categories ADD COLUMN IF NOT EXISTS standard_work_code TEXT;
ALTER TABLE engineering_categories ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_standard_work_code
  ON engineering_categories(standard_work_code)
  WHERE project_id IS NULL AND standard_work_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_standard_work_code
  ON engineering_categories(project_id, standard_work_code)
  WHERE project_id IS NOT NULL AND standard_work_code IS NOT NULL;

-- ============================================================
-- 4. project_task_code_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS project_task_code_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL DEFAULT '榛樿浠诲姟缂栫爜瑙勫垯',
  rule_version TEXT NOT NULL DEFAULT 'v1',
  delimiter TEXT NOT NULL DEFAULT '-',
  sequence_length INTEGER NOT NULL DEFAULT 3,
  include_project BOOLEAN NOT NULL DEFAULT true,
  include_phase BOOLEAN NOT NULL DEFAULT true,
  include_section BOOLEAN NOT NULL DEFAULT true,
  include_building BOOLEAN NOT NULL DEFAULT true,
  include_floor BOOLEAN NOT NULL DEFAULT true,
  include_zone BOOLEAN NOT NULL DEFAULT true,
  include_professional BOOLEAN NOT NULL DEFAULT true,
  include_work_code BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_task_code_rules_enabled
  ON project_task_code_rules(project_id) WHERE enabled = true;

ALTER TABLE project_task_code_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_task_code_rules_select_policy ON project_task_code_rules;
CREATE POLICY project_task_code_rules_select_policy ON project_task_code_rules
  FOR SELECT USING ((SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS project_task_code_rules_write_policy ON project_task_code_rules;
CREATE POLICY project_task_code_rules_write_policy ON project_task_code_rules
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 5. task_code_sequences
-- ============================================================
CREATE TABLE IF NOT EXISTS task_code_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES project_task_code_rules(id) ON DELETE CASCADE,
  sequence_key TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, rule_id, sequence_key)
);

ALTER TABLE task_code_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_code_sequences_policy ON task_code_sequences;
CREATE POLICY task_code_sequences_policy ON task_code_sequences
  FOR ALL USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 6. task_code_history
-- ============================================================
CREATE TABLE IF NOT EXISTS task_code_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  old_task_code TEXT,
  new_task_code TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_task_code_history_task_id
  ON task_code_history(task_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_code_history_project_id
  ON task_code_history(project_id, changed_at DESC);

ALTER TABLE task_code_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_code_history_select_policy ON task_code_history;
CREATE POLICY task_code_history_select_policy ON task_code_history
  FOR SELECT USING ((SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS task_code_history_write_policy ON task_code_history;
CREATE POLICY task_code_history_write_policy ON task_code_history
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 7. FK: tasks.task_code_rule_id -> project_task_code_rules
-- ============================================================
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_task_code_rule_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_task_code_rule_id_fkey
  FOREIGN KEY (task_code_rule_id) REFERENCES project_task_code_rules(id) ON DELETE SET NULL;

COMMIT;


-- ============================================================
-- Source: 124_create_status_dictionary_system.sql
-- ============================================================
-- 124_create_status_dictionary_system.sql
-- v1.4.5 Status and lifecycle dictionary system.

BEGIN;

-- ============================================================
-- 1. status_dictionary_versions (created first for FK references)
-- ============================================================
CREATE TABLE IF NOT EXISTS status_dictionary_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key TEXT NOT NULL UNIQUE,
  version_name TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  content_hash TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Bootstrap the current version
INSERT INTO status_dictionary_versions (version_key, version_name, change_reason)
VALUES ('v1.4.5', 'v1.4.5 Initial Status Dictionary', 'System bootstrap')
ON CONFLICT (version_key) DO NOTHING;

-- ============================================================
-- 2. status_domains
-- ============================================================
CREATE TABLE IF NOT EXISTS status_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL UNIQUE,
  domain_name TEXT NOT NULL,
  domain_group TEXT NOT NULL,
  status_kind TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status_kind IN ('lifecycle','derived','stage','activation','adjacent','technical'))
);

-- Bootstrap core domains
INSERT INTO status_domains (domain_key, domain_name, domain_group, status_kind) VALUES
  ('task.lifecycle', '浠诲姟鐢熷懡鍛ㄦ湡', 'task', 'lifecycle'),
  ('task.business_status', '浠诲姟涓氬姟鐘舵€?, 'task', 'derived'),
  ('task.lag_status', '浠诲姟婊炲悗鐘舵€?, 'task', 'derived'),
  ('task.due_status', '浠诲姟鍒版湡鐘舵€?, 'task', 'derived'),
  ('baseline.lifecycle', '椤圭洰鍩虹嚎鐢熷懡鍛ㄦ湡', 'planning', 'lifecycle'),
  ('monthly_plan.lifecycle', '鏈堝害璁″垝鐢熷懡鍛ㄦ湡', 'planning', 'lifecycle'),
  ('milestone.lifecycle', '閲岀▼纰戠敓鍛藉懆鏈?, 'milestone', 'lifecycle'),
  ('condition.lifecycle', '鏉′欢鐢熷懡鍛ㄦ湡', 'condition', 'lifecycle'),
  ('obstacle.lifecycle', '闃荤鐢熷懡鍛ㄦ湡', 'obstacle', 'lifecycle'),
  ('risk.lifecycle', '椋庨櫓鐢熷懡鍛ㄦ湡', 'risk', 'lifecycle'),
  ('issue.lifecycle', '闂鐢熷懡鍛ㄦ湡', 'issue', 'lifecycle'),
  ('warning.lifecycle', '棰勮鐢熷懡鍛ㄦ湡', 'warning', 'lifecycle'),
  ('notification.lifecycle', '閫氱煡鐢熷懡鍛ㄦ湡', 'notification', 'lifecycle'),
  ('acceptance.lifecycle', '楠屾敹鐢熷懡鍛ㄦ湡', 'acceptance', 'lifecycle'),
  ('certificate.lifecycle', '璇佺収鐢熷懡鍛ㄦ湡', 'certificate', 'lifecycle'),
  ('certificate.stage', '璇佺収闃舵', 'certificate', 'stage'),
  ('drawing.lifecycle', '鍥剧焊鐢熷懡鍛ㄦ湡', 'drawing', 'lifecycle'),
  ('drawing.review_status', '鍥剧焊瀹℃煡鐘舵€?, 'drawing', 'derived'),
  ('project.lifecycle', '椤圭洰鐢熷懡鍛ㄦ湡', 'project', 'lifecycle'),
  ('project.phase', '椤圭洰闃舵', 'project', 'stage'),
  ('project.health', '椤圭洰鍋ュ悍鐘舵€?, 'project', 'derived'),
  ('material.derived_status', '鏉愭枡娲剧敓鐘舵€?, 'material', 'derived'),
  ('wbs_template.lifecycle', 'WBS妯℃澘鐢熷懡鍛ㄦ湡', 'template', 'lifecycle'),
  ('engineering_object.activation', '宸ョ▼瀵硅薄鍚仠', 'master_data', 'activation'),
  ('engineering_category.activation', '宸ョ▼鍒嗙被鍚仠', 'master_data', 'activation'),
  ('invitation.lifecycle', '閭€璇风敓鍛藉懆鏈?, 'collaboration', 'lifecycle'),
  ('data_quality.finding_status', '鏁版嵁璐ㄩ噺鍙戠幇鐘舵€?, 'governance', 'lifecycle'),
  ('data_quality.confidence_flag', '鏁版嵁鍙俊搴?, 'governance', 'adjacent'),
  ('task_completion.efficiency_status', '浠诲姟瀹屾垚鏁堢巼', 'task', 'derived'),
  ('progress_deviation.row_status', '杩涘害鍋忓樊琛岀姸鎬?, 'report', 'derived'),
  ('delay_signal.derived_status', '寤舵湡淇″彿娲剧敓', 'task', 'derived')
ON CONFLICT (domain_key) DO NOTHING;

-- ============================================================
-- 3. status_values
-- ============================================================
CREATE TABLE IF NOT EXISTS status_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  status_key TEXT NOT NULL,
  status_label TEXT NOT NULL,
  status_label_short TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  visual_tone TEXT,
  semantic_tone TEXT,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, status_key)
);

-- Bootstrap core status values
INSERT INTO status_values (domain_key, status_key, status_label, sort_order, is_initial, is_terminal, visual_tone, semantic_tone) VALUES
  ('task.lifecycle', 'todo', '寰呭姙', 1, false, false, 'slate', 'open'),
  ('task.lifecycle', 'pending', '寰呭畾', 2, true, false, 'slate', 'open'),
  ('task.lifecycle', 'in_progress', '杩涜涓?, 3, false, false, 'blue', 'active'),
  ('task.lifecycle', 'blocked', '鍙楅樆', 4, false, false, 'amber', 'blocked'),
  ('task.lifecycle', 'completed', '宸插畬鎴?, 5, false, true, 'green', 'closed'),
  ('task.lifecycle', 'cancelled', '宸插彇娑?, 6, false, true, 'slate', 'closed'),
  ('risk.lifecycle', 'identified', '宸茶瘑鍒?, 1, true, false, 'amber', 'open'),
  ('risk.lifecycle', 'mitigating', '缂撹В涓?, 2, false, false, 'blue', 'active'),
  ('risk.lifecycle', 'closed', '宸插叧闂?, 3, false, true, 'green', 'closed'),
  ('issue.lifecycle', 'open', '鏈В鍐?, 1, true, false, 'red', 'open'),
  ('issue.lifecycle', 'investigating', '璋冩煡涓?, 2, false, false, 'amber', 'active'),
  ('issue.lifecycle', 'resolved', '宸茶В鍐?, 3, false, false, 'blue', 'active'),
  ('issue.lifecycle', 'closed', '宸插叧闂?, 4, false, true, 'green', 'closed'),
  ('condition.lifecycle', 'open', '寰呮弧瓒?, 1, true, false, 'slate', 'open'),
  ('condition.lifecycle', 'met', '宸叉弧瓒?, 2, false, false, 'blue', 'active'),
  ('condition.lifecycle', 'confirmed', '宸茬‘璁?, 3, false, true, 'green', 'closed'),
  ('condition.lifecycle', 'blocked', '鍙楅樆', 4, false, false, 'amber', 'blocked'),
  ('condition.lifecycle', 'closed', '宸插叧闂?, 5, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'open', '寰呭鐞?, 1, true, false, 'amber', 'open'),
  ('obstacle.lifecycle', 'resolving', '澶勭悊涓?, 2, false, false, 'blue', 'active'),
  ('obstacle.lifecycle', 'resolved', '宸茶В鍐?, 3, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'closed', '宸插叧闂?, 4, false, true, 'green', 'closed'),
  ('obstacle.lifecycle', 'unresolvable', '鏃犳硶瑙ｅ喅', 5, false, true, 'red', 'blocked'),
  ('acceptance.lifecycle', 'draft', '鑽夌', 1, true, false, 'slate', 'open'),
  ('acceptance.lifecycle', 'preparing', '鍑嗗涓?, 2, false, false, 'blue', 'active'),
  ('acceptance.lifecycle', 'ready_to_submit', '寰呮姤楠?, 3, false, false, 'amber', 'active'),
  ('acceptance.lifecycle', 'submitted', '宸叉姤楠?, 4, false, false, 'amber', 'active'),
  ('acceptance.lifecycle', 'inspecting', '楠屾敹涓?, 5, false, false, 'blue', 'active'),
  ('acceptance.lifecycle', 'rectifying', '鏁存敼涓?, 6, false, false, 'red', 'blocked'),
  ('acceptance.lifecycle', 'passed', '宸查€氳繃', 7, false, true, 'green', 'closed'),
  ('acceptance.lifecycle', 'archived', '宸插綊妗?, 8, false, true, 'green', 'closed'),
  ('project.lifecycle', 'not_started', '鏈紑濮?, 1, true, false, 'slate', 'open'),
  ('project.lifecycle', 'in_progress', '杩涜涓?, 2, false, false, 'blue', 'active'),
  ('project.lifecycle', 'completed', '宸插畬鎴?, 3, false, true, 'green', 'closed'),
  ('project.lifecycle', 'paused', '宸叉殏鍋?, 4, false, false, 'amber', 'blocked'),
  ('project.health', 'healthy', '鍋ュ悍', 1, false, false, 'green', 'positive'),
  ('project.health', 'warning', '浜氬仴搴?, 2, false, false, 'amber', 'caution'),
  ('project.health', 'critical', '棰勮', 3, false, false, 'red', 'negative'),
  ('project.health', 'danger', '鍗遍櫓', 4, false, false, 'red', 'negative'),
  ('certificate.lifecycle', 'pending', '寰呭姙鐞?, 1, true, false, 'slate', 'open'),
  ('certificate.lifecycle', 'preparing_documents', '璧勬枡鍑嗗涓?, 2, false, false, 'blue', 'active'),
  ('certificate.lifecycle', 'internal_review', '鍐呴儴鎶ュ', 3, false, false, 'amber', 'active'),
  ('certificate.lifecycle', 'external_submission', '澶栭儴鎶ユ壒', 4, false, false, 'amber', 'active'),
  ('certificate.lifecycle', 'supplement_required', '闇€琛ユ', 5, false, false, 'red', 'blocked'),
  ('certificate.lifecycle', 'approved', '宸叉壒澶?, 6, false, false, 'blue', 'active'),
  ('certificate.lifecycle', 'issued', '宸插彇寰?, 7, false, true, 'green', 'closed'),
  ('certificate.lifecycle', 'expired', '宸茶繃鏈?, 8, false, true, 'red', 'closed'),
  ('certificate.lifecycle', 'voided', '宸蹭綔搴?, 9, false, true, 'slate', 'closed'),
  ('drawing.lifecycle', 'preparing', '缂栧埗涓?, 1, true, false, 'slate', 'open'),
  ('drawing.lifecycle', 'reviewing', '瀹″浘涓?, 2, false, false, 'blue', 'active'),
  ('drawing.lifecycle', 'revising', '淇敼涓?, 3, false, false, 'amber', 'blocked'),
  ('drawing.lifecycle', 'issued', '宸插嚭鍥?, 4, false, false, 'blue', 'active'),
  ('drawing.lifecycle', 'completed', '宸插畬鎴?, 5, false, true, 'green', 'closed'),
  ('drawing.lifecycle', 'voided', '宸蹭綔搴?, 6, false, true, 'slate', 'closed'),
  ('drawing.review_status', 'not_submitted', '鏈彁浜?, 1, true, false, 'slate', 'open'),
  ('drawing.review_status', 'reviewing', '瀹℃煡涓?, 2, false, false, 'blue', 'active'),
  ('drawing.review_status', 'approved', '宸查€氳繃', 3, false, false, 'green', 'closed'),
  ('drawing.review_status', 'rejected', '宸查┏鍥?, 4, false, false, 'red', 'blocked'),
  ('drawing.review_status', 'revision_required', '闇€淇敼', 5, false, false, 'amber', 'blocked'),
  ('baseline.lifecycle', 'draft', '鑽夌', 1, true, false, 'slate', 'open'),
  ('baseline.lifecycle', 'confirmed', '宸茬‘璁?, 2, false, false, 'green', 'closed'),
  ('baseline.lifecycle', 'closed', '宸插叧闂?, 3, false, true, 'slate', 'closed'),
  ('baseline.lifecycle', 'revising', '淇涓?, 4, false, false, 'amber', 'active'),
  ('baseline.lifecycle', 'pending_realign', '寰呴噸鏁?, 5, false, false, 'amber', 'active'),
  ('baseline.lifecycle', 'archived', '宸插綊妗?, 6, false, true, 'slate', 'closed'),
  ('monthly_plan.lifecycle', 'draft', '鑽夌', 1, true, false, 'slate', 'open'),
  ('monthly_plan.lifecycle', 'confirmed', '宸茬‘璁?, 2, false, false, 'green', 'closed'),
  ('monthly_plan.lifecycle', 'closed', '宸插叧闂?, 3, false, true, 'slate', 'closed'),
  ('monthly_plan.lifecycle', 'revising', '淇涓?, 4, false, false, 'amber', 'active'),
  ('monthly_plan.lifecycle', 'pending_realign', '寰呴噸鏁?, 5, false, false, 'amber', 'active'),
  ('milestone.lifecycle', 'pending', '寰呭畬鎴?, 1, true, false, 'slate', 'open'),
  ('milestone.lifecycle', 'in_progress', '杩涜涓?, 2, false, false, 'blue', 'active'),
  ('milestone.lifecycle', 'completed', '宸插畬鎴?, 3, false, true, 'green', 'closed'),
  ('milestone.lifecycle', 'overdue', '宸查€炬湡', 4, false, false, 'red', 'blocked'),
  ('warning.lifecycle', 'unread', '鏈', 1, true, false, 'amber', 'open'),
  ('warning.lifecycle', 'acknowledged', '宸茬‘璁?, 2, false, false, 'blue', 'active'),
  ('warning.lifecycle', 'muted', '宸查潤榛?, 3, false, false, 'slate', 'closed'),
  ('warning.lifecycle', 'escalated', '宸插崌绾?, 4, false, false, 'red', 'active'),
  ('warning.lifecycle', 'resolved', '宸茶В鍐?, 5, false, false, 'green', 'closed'),
  ('warning.lifecycle', 'archived', '宸插綊妗?, 6, false, true, 'slate', 'closed'),
  ('warning.lifecycle', 'closed', '宸插叧闂?, 7, false, true, 'green', 'closed'),
  ('notification.lifecycle', 'unread', '鏈', 1, true, false, 'slate', 'open'),
  ('notification.lifecycle', 'read', '宸茶', 2, false, false, 'slate', 'closed'),
  ('notification.lifecycle', 'archived', '宸插綊妗?, 3, false, true, 'slate', 'closed'),
  ('wbs_template.lifecycle', 'draft', '鑽夌', 1, true, false, 'slate', 'open'),
  ('wbs_template.lifecycle', 'published', '宸插彂甯?, 2, false, false, 'green', 'closed'),
  ('wbs_template.lifecycle', 'disabled', '宸茬鐢?, 3, false, true, 'slate', 'closed'),
  ('engineering_object.activation', 'active', '鍚敤', 1, true, false, 'green', 'active'),
  ('engineering_object.activation', 'inactive', '鍋滅敤', 2, false, true, 'slate', 'closed'),
  ('engineering_category.activation', 'enabled', '鍚敤', 1, true, false, 'green', 'active'),
  ('engineering_category.activation', 'disabled', '绂佺敤', 2, false, true, 'slate', 'closed'),
  ('invitation.lifecycle', 'active', '鏈夋晥', 1, true, false, 'green', 'active'),
  ('invitation.lifecycle', 'used', '宸蹭娇鐢?, 2, false, true, 'blue', 'closed'),
  ('invitation.lifecycle', 'revoked', '宸叉挙閿€', 3, false, true, 'red', 'closed'),
  ('invitation.lifecycle', 'expired', '宸茶繃鏈?, 4, false, true, 'slate', 'closed'),
  ('data_quality.finding_status', 'active', '娲昏穬', 1, true, false, 'amber', 'open'),
  ('data_quality.finding_status', 'resolved', '宸茶В鍐?, 2, false, false, 'green', 'closed'),
  ('data_quality.finding_status', 'ignored', '宸插拷鐣?, 3, false, true, 'slate', 'closed')
ON CONFLICT (domain_key, status_key) DO NOTHING;

-- ============================================================
-- 4. status_aliases
-- ============================================================
CREATE TABLE IF NOT EXISTS status_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  alias_value TEXT NOT NULL,
  status_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'legacy',
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, alias_value)
);

-- Add FK to status_values
ALTER TABLE status_aliases DROP CONSTRAINT IF EXISTS status_aliases_status_key_fkey;
ALTER TABLE status_aliases ADD CONSTRAINT status_aliases_status_key_fkey
  FOREIGN KEY (domain_key, status_key) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

-- Bootstrap legacy aliases
INSERT INTO status_aliases (domain_key, alias_value, status_key, source_type) VALUES
  ('task.lifecycle', 'not_started', 'todo', 'legacy'),
  ('task.lifecycle', '鏈紑濮?, 'todo', 'legacy'),
  ('task.lifecycle', '杩涜涓?, 'in_progress', 'legacy'),
  ('task.lifecycle', '宸插畬鎴?, 'completed', 'legacy'),
  ('task.lifecycle', 'done', 'completed', 'legacy'),
  ('task.lifecycle', 'delayed', 'blocked', 'legacy'),
  ('task.lifecycle', 'on_hold', 'blocked', 'legacy'),
  ('task.lifecycle', '宸插彇娑?, 'cancelled', 'legacy'),
  ('task.lifecycle', 'voided', 'cancelled', 'legacy'),
  ('task.lifecycle', 'archived', 'cancelled', 'legacy'),
  ('task.lifecycle', 'deleted', 'cancelled', 'legacy'),
  ('project.lifecycle', '鏈紑濮?, 'not_started', 'legacy'),
  ('project.lifecycle', '杩涜涓?, 'in_progress', 'legacy'),
  ('project.lifecycle', '宸插畬鎴?, 'completed', 'legacy'),
  ('project.lifecycle', '宸叉殏鍋?, 'paused', 'legacy')
ON CONFLICT (domain_key, alias_value) DO NOTHING;

-- ============================================================
-- 5. status_transitions
-- ============================================================
CREATE TABLE IF NOT EXISTS status_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  event_key TEXT,
  actor_scope TEXT NOT NULL DEFAULT 'system_or_user',
  guard_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK to status_values
ALTER TABLE status_transitions DROP CONSTRAINT IF EXISTS status_transitions_from_status_fkey;
ALTER TABLE status_transitions ADD CONSTRAINT status_transitions_from_status_fkey
  FOREIGN KEY (domain_key, from_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;
ALTER TABLE status_transitions DROP CONSTRAINT IF EXISTS status_transitions_to_status_fkey;
ALTER TABLE status_transitions ADD CONSTRAINT status_transitions_to_status_fkey
  FOREIGN KEY (domain_key, to_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_status_transitions_domain_from_to_event
  ON status_transitions(domain_key, from_status, to_status, COALESCE(event_key, ''));

-- Bootstrap task transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('task.lifecycle', 'pending', 'todo'),
  ('task.lifecycle', 'todo', 'in_progress'),
  ('task.lifecycle', 'pending', 'in_progress'),
  ('task.lifecycle', 'in_progress', 'blocked'),
  ('task.lifecycle', 'in_progress', 'completed'),
  ('task.lifecycle', 'blocked', 'in_progress'),
  ('task.lifecycle', 'todo', 'cancelled'),
  ('task.lifecycle', 'pending', 'cancelled'),
  ('task.lifecycle', 'in_progress', 'cancelled'),
  ('task.lifecycle', 'blocked', 'cancelled')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- Bootstrap risk transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('risk.lifecycle', 'identified', 'mitigating'),
  ('risk.lifecycle', 'mitigating', 'closed'),
  ('risk.lifecycle', 'closed', 'identified')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- Bootstrap issue transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('issue.lifecycle', 'open', 'investigating'),
  ('issue.lifecycle', 'investigating', 'resolved'),
  ('issue.lifecycle', 'resolved', 'closed'),
  ('issue.lifecycle', 'resolved', 'investigating')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- v1.4.7: Bootstrap baseline transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('baseline.lifecycle', 'draft', 'confirmed'),
  ('baseline.lifecycle', 'confirmed', 'closed'),
  ('baseline.lifecycle', 'confirmed', 'revising'),
  ('baseline.lifecycle', 'revising', 'confirmed'),
  ('baseline.lifecycle', 'closed', 'archived'),
  ('baseline.lifecycle', 'draft', 'archived'),
  ('baseline.lifecycle', 'revising', 'archived'),
  ('baseline.lifecycle', 'confirmed', 'archived'),
  ('baseline.lifecycle', 'confirmed', 'pending_realign'),
  ('baseline.lifecycle', 'pending_realign', 'revising'),
  ('baseline.lifecycle', 'pending_realign', 'confirmed')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- v1.4.7: Bootstrap monthly plan transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('monthly_plan.lifecycle', 'draft', 'confirmed'),
  ('monthly_plan.lifecycle', 'confirmed', 'closed'),
  ('monthly_plan.lifecycle', 'confirmed', 'revising'),
  ('monthly_plan.lifecycle', 'revising', 'confirmed'),
  ('monthly_plan.lifecycle', 'draft', 'closed'),
  ('monthly_plan.lifecycle', 'revising', 'closed'),
  ('monthly_plan.lifecycle', 'confirmed', 'pending_realign'),
  ('monthly_plan.lifecycle', 'pending_realign', 'revising'),
  ('monthly_plan.lifecycle', 'pending_realign', 'confirmed')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- v1.4.8: Bootstrap condition transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('condition.lifecycle', 'open', 'met'),
  ('condition.lifecycle', 'met', 'confirmed'),
  ('condition.lifecycle', 'open', 'blocked'),
  ('condition.lifecycle', 'blocked', 'open'),
  ('condition.lifecycle', 'met', 'closed'),
  ('condition.lifecycle', 'confirmed', 'closed'),
  ('condition.lifecycle', 'blocked', 'closed')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- v1.4.8: Bootstrap obstacle transitions
INSERT INTO status_transitions (domain_key, from_status, to_status) VALUES
  ('obstacle.lifecycle', 'open', 'resolving'),
  ('obstacle.lifecycle', 'resolving', 'resolved'),
  ('obstacle.lifecycle', 'resolved', 'closed'),
  ('obstacle.lifecycle', 'open', 'unresolvable'),
  ('obstacle.lifecycle', 'unresolvable', 'open'),
  ('obstacle.lifecycle', 'closed', 'open')
ON CONFLICT (domain_key, from_status, to_status, COALESCE(event_key, '')) DO NOTHING;

-- ============================================================
-- 6. status_derivation_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS status_derivation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_key TEXT NOT NULL REFERENCES status_domains(domain_key) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_order INTEGER NOT NULL DEFAULT 0,
  output_status TEXT NOT NULL,
  rule_description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  dictionary_version TEXT NOT NULL DEFAULT 'v1.4.5',
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deprecated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_key, rule_key)
);

ALTER TABLE status_derivation_rules DROP CONSTRAINT IF EXISTS status_derivation_rules_output_status_fkey;
ALTER TABLE status_derivation_rules ADD CONSTRAINT status_derivation_rules_output_status_fkey
  FOREIGN KEY (domain_key, output_status) REFERENCES status_values(domain_key, status_key) ON DELETE CASCADE;

-- ============================================================
-- 7. RLS on all status dictionary tables
-- ============================================================
ALTER TABLE status_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_derivation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_dictionary_versions ENABLE ROW LEVEL SECURITY;

-- All status tables: read for anyone, write for service_role only
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['status_domains','status_values','status_transitions','status_aliases','status_derivation_rules','status_dictionary_versions'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_read_policy ON %I FOR SELECT USING (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write_policy ON %I FOR ALL USING ((SELECT current_setting(''role'', true) = ''service_role'')) WITH CHECK ((SELECT current_setting(''role'', true) = ''service_role''))', tbl, tbl);
  END LOOP;
END $$;

COMMIT;


-- ============================================================
-- Source: 125_create_data_lineage_mapping_system.sql
-- ============================================================
-- 125_create_data_lineage_mapping_system.sql
-- v1.4.6 Data lineage and mapping system.

BEGIN;

-- ============================================================
-- 1. data_lineage_entity_types
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_entity_types (
  entity_type TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  entity_group TEXT NOT NULL,
  table_name TEXT,
  id_column TEXT NOT NULL DEFAULT 'id',
  project_id_column TEXT DEFAULT 'project_id',
  is_project_scoped BOOLEAN NOT NULL DEFAULT true,
  is_global_reference BOOLEAN NOT NULL DEFAULT false,
  is_business_lineage_allowed BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT (is_project_scoped AND is_global_reference))
);

-- Bootstrap entity types
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, table_name, is_project_scoped, is_global_reference) VALUES
  ('wbs_template', 'WBS妯℃澘', 'planning', 'wbs_templates', false, true),
  ('wbs_template_node', 'WBS妯℃澘鑺傜偣', 'planning', null, false, true),
  ('task_baseline', '椤圭洰鍩虹嚎', 'planning', 'task_baselines', true, false),
  ('task_baseline_item', '椤圭洰鍩虹嚎琛?, 'planning', 'task_baseline_items', true, false),
  ('monthly_plan', '鏈堝害璁″垝', 'planning', 'monthly_plans', true, false),
  ('monthly_plan_item', '鏈堝害璁″垝琛?, 'planning', 'monthly_plan_items', true, false),
  ('task', '鏂藉伐浠诲姟', 'task', 'tasks', true, false),
  ('task_dependency', '浠诲姟渚濊禆', 'task', 'task_dependencies', true, false),
  ('task_condition', '鍓嶇疆鏉′欢', 'task', 'task_conditions', true, false),
  ('task_obstacle', '闃荤浜嬮」', 'task', 'task_obstacles', true, false),
  ('milestone', '閲岀▼纰?, 'milestone', 'milestones', true, false),
  ('risk', '椋庨櫓', 'risk', 'risks', true, false),
  ('issue', '闂', 'issue', 'issues', true, false),
  ('warning', '棰勮', 'warning', 'warnings', true, false),
  ('notification', '閫氱煡', 'notification', 'notifications', true, false),
  ('acceptance_plan', '楠屾敹璁″垝', 'acceptance', 'acceptance_plans', true, false),
  ('acceptance_dependency', '楠屾敹渚濊禆', 'acceptance', 'acceptance_dependencies', true, false),
  ('acceptance_requirement', '楠屾敹鏉′欢', 'acceptance', 'acceptance_requirements', true, false),
  ('construction_drawing', '鏂藉伐鍥剧焊', 'drawing', 'construction_drawings', true, false),
  ('drawing_package', '鍥剧焊鍖?, 'drawing', 'drawing_packages', true, false),
  ('drawing_version', '鍥剧焊鐗堟湰', 'drawing', 'drawing_versions', true, false),
  ('certificate', '璇佺収', 'certificate', 'pre_milestones', true, false),
  ('certificate_work_item', '璇佺収宸ヤ綔椤?, 'certificate', 'certificate_work_items', true, false),
  ('certificate_dependency', '璇佺収渚濊禆', 'certificate', 'certificate_dependencies', true, false),
  ('pre_milestone', '鍓嶇疆閲岀▼纰?, 'certificate', 'pre_milestones', true, false),
  ('engineering_object', '宸ョ▼瀵硅薄', 'master_data', 'engineering_objects', true, false),
  ('engineering_category', '宸ョ▼鍒嗙被', 'master_data', 'engineering_categories', true, false),
  ('project_material', '鏉愭枡', 'material', 'project_materials', true, false),
  ('change_log', '鍙樻洿鏃ュ織', 'governance', 'change_logs', true, false),
  ('data_quality_finding', '鏁版嵁璐ㄩ噺鍙戠幇', 'governance', 'data_quality_findings', true, false),
  ('project_daily_snapshot', '椤圭洰鏃ユ姤', 'bi', 'project_daily_snapshot', true, false),
  ('task_progress_snapshot', '杩涘害蹇収', 'task', 'task_progress_snapshots', true, false),
  ('standard_process', '鏍囧噯宸ュ簭', 'reference', 'standard_processes', false, true),
  ('acceptance_catalog', '楠屾敹鐩綍', 'reference', 'acceptance_catalog', false, true),
  ('import_batch', '瀵煎叆鎵规', 'import', null, true, false),
  ('external_record', '澶栭儴璁板綍', 'external', null, false, true),
  ('task_progress_snapshot', '杩涘害蹇収', 'task', 'task_progress_snapshots', true, false),
  ('task_timeline_event', '浠诲姟鏃堕棿杞翠簨浠?, 'task', 'task_timeline_events', true, false),
  ('task_milestone', '浠诲姟閲岀▼纰戝叧鑱?, 'task', 'task_milestones', true, false),
  ('task_critical_override', '鍏抽敭璺緞浜哄伐骞查', 'task', 'task_critical_overrides', true, false),
  ('task_preceding_relation', '浠诲姟鍓嶇疆鍏崇郴', 'task', 'task_preceding_relations', true, false),
  ('acceptance_record', '楠屾敹璁板綍', 'acceptance', 'acceptance_records', true, false),
  ('acceptance_catalog', '楠屾敹鐩綍鍙傝€?, 'reference', 'acceptance_catalog', false, true),
  ('drawing_review_rule', '鍥剧焊瀹℃煡瑙勫垯', 'drawing', 'drawing_review_rules', true, false),
  ('drawing_package_item', '鍥剧焊鍖呮槑缁?, 'drawing', 'drawing_package_items', true, false),
  ('pre_milestone_condition', '鍓嶇疆閲岀▼纰戞潯浠?, 'certificate', 'pre_milestone_conditions', true, false),
  ('pre_milestone_dependency', '鍓嶇疆閲岀▼纰戜緷璧?, 'certificate', 'pre_milestone_dependencies', true, false),
  ('certificate_approval', '璇佺収瀹℃壒鍘嗗彶', 'certificate', 'certificate_approvals', true, false),
  ('responsibility_watchlist', '璐ｄ换棰勮娓呭崟', 'governance', 'responsibility_watchlist', true, false),
  ('weekly_digest', '鍛ㄦ姤', 'report', 'weekly_digests', true, false),
  ('risk_statistics', '椋庨櫓缁熻蹇収', 'risk', 'risk_statistics', true, false),
  ('planning_governance_signal', '璁″垝娌荤悊淇″彿', 'planning', 'planning_governance', true, false),
  ('data_confidence_snapshot', '鏁版嵁鍙俊搴﹀揩鐓?, 'governance', 'data_confidence_snapshots', true, false),
  ('wbs_structure', '鍘嗗彶WBS缁撴瀯', 'compat', 'wbs_structure', true, false),
  ('wbs_task_link', '鍘嗗彶WBS浠诲姟鍏宠仈', 'compat', 'wbs_task_links', true, false),
  ('standard_process', '鏍囧噯宸ュ簭鍙傝€?, 'reference', 'standard_processes', false, true)
ON CONFLICT (entity_type) DO NOTHING;

-- Technical objects: lineage not allowed
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, is_business_lineage_allowed, is_project_scoped) VALUES
  ('operation_log', '鎿嶄綔鏃ュ織', 'technical', false, false),
  ('task_lock', '浠诲姟閿?, 'technical', false, false),
  ('planning_draft_lock', '璁″垝鑽夌閿?, 'technical', false, false),
  ('job_execution_log', '浠诲姟鎵ц鏃ュ織', 'technical', false, false),
  ('trigger_execution_log', '瑙﹀彂鍣ㄦ墽琛屾棩蹇?, 'technical', false, false)
ON CONFLICT (entity_type) DO NOTHING;

-- ============================================================
-- 2. data_lineage_relation_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_relation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type TEXT NOT NULL REFERENCES data_lineage_entity_types(entity_type),
  relation_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL REFERENCES data_lineage_entity_types(entity_type),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_entity_type, relation_type, target_entity_type)
);

-- Bootstrap core relation rules
INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type) VALUES
  ('wbs_template_node', 'generates', 'task_baseline_item'),
  ('wbs_template_node', 'generates', 'task'),
  ('task_baseline_item', 'derives', 'monthly_plan_item'),
  ('monthly_plan_item', 'derives', 'task'),
  ('monthly_plan_item', 'carries_over_to', 'monthly_plan_item'),
  ('task', 'splits_into', 'task'),
  ('task', 'merged_from', 'task'),
  ('task', 'replaced_by', 'task'),
  ('import_batch', 'contains', 'task'),
  ('task', 'generates', 'task_baseline_item'),
  ('task', 'carries_over_to', 'monthly_plan_item'),
  ('risk', 'escalates_to', 'issue'),
  ('warning', 'escalates_to', 'risk'),
  ('task_obstacle', 'escalates_to', 'issue'),
  ('task_condition', 'blocks', 'task'),
  ('task_dependency', 'depends_on', 'task'),
  ('acceptance_plan', 'validates', 'task'),
  ('acceptance_dependency', 'depends_on', 'acceptance_plan'),
  ('construction_drawing', 'supports', 'task'),
  ('drawing_version', 'versions', 'construction_drawing'),
  ('project_material', 'supplies', 'task'),
  ('certificate', 'validates', 'milestone'),
  ('certificate_dependency', 'depends_on', 'certificate')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;

-- ============================================================
-- 3. data_lineage_links
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  batch_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_links_project ON data_lineage_links(project_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_source ON data_lineage_links(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_target ON data_lineage_links(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_lineage_links_batch ON data_lineage_links(batch_ref) WHERE batch_ref IS NOT NULL;

ALTER TABLE data_lineage_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_lineage_links_read_policy ON data_lineage_links;
CREATE POLICY data_lineage_links_read_policy ON data_lineage_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = data_lineage_links.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role')
  );
DROP POLICY IF EXISTS data_lineage_links_write_policy ON data_lineage_links;
CREATE POLICY data_lineage_links_write_policy ON data_lineage_links
  FOR INSERT WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 4. AI Governance boundary (v1.4.6 搂11)
-- AI tools may READ lineage for context, but must NOT directly write
-- lineage_links, tasks, or any production data. AI output is limited to
-- explanation, suggestion, and repair drafts only.
-- ============================================================
INSERT INTO data_lineage_entity_types (entity_type, entity_name, entity_group, is_business_lineage_allowed, is_project_scoped) VALUES
  ('ai_suggestion', 'AI寤鸿鑽夋', 'governance', false, false),
  ('ai_repair_draft', 'AI淇鑽夋', 'governance', false, false),
  ('ai_context_query', 'AI涓婁笅鏂囨煡璇?, 'governance', false, false)
ON CONFLICT (entity_type) DO NOTHING;

INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type) VALUES
  ('ai_context_query', 'reads', 'task'),
  ('ai_suggestion', 'suggests', 'task'),
  ('ai_repair_draft', 'drafts_fix_for', 'task')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;

COMMIT;


-- ============================================================
-- Source: 126_complete_data_lineage_system.sql
-- ============================================================
-- 126_complete_data_lineage_system.sql
-- v1.4.6 (completion): batches, import tracking, confidence, relation validation

BEGIN;

-- ============================================================
-- 0. data_lineage_batches 鈥?track lineage batch operations
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  batch_type TEXT NOT NULL,
  link_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_batches_project ON data_lineage_batches(project_id, created_at DESC);

-- ============================================================
-- 1. data_import_batches 鈥?track import operations
-- ============================================================
CREATE TABLE IF NOT EXISTS data_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  import_type TEXT NOT NULL DEFAULT 'task_import',
  file_name TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  mapping_status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_import_batches_project ON data_import_batches(project_id, created_at DESC);

-- ============================================================
-- 2. import_rows 鈥?per-row import tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS data_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES data_import_batches(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  target_entity_type TEXT NOT NULL DEFAULT 'task',
  target_entity_id UUID,
  source_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_import_rows_batch ON data_import_rows(batch_id);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_target ON data_import_rows(target_entity_type, target_entity_id);

-- ============================================================
-- 3. lineage_events 鈥?who/when changed lineage
-- ============================================================
CREATE TABLE IF NOT EXISTS data_lineage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  link_id UUID REFERENCES data_lineage_links(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_data_lineage_events_project ON data_lineage_events(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_lineage_events_link ON data_lineage_events(link_id) WHERE link_id IS NOT NULL;

-- ============================================================
-- 4. Add mapping_status / confidence to data_lineage_links
-- ============================================================
ALTER TABLE data_lineage_links ADD COLUMN IF NOT EXISTS mapping_status TEXT;
UPDATE data_lineage_links
SET mapping_status = CASE
  WHEN mapping_status IN ('mapped', 'pending', 'broken', 'orphan', 'deprecated') THEN
    CASE mapping_status
      WHEN 'mapped' THEN 'active'
      WHEN 'pending' THEN 'unresolved'
      WHEN 'broken' THEN 'conflict'
      WHEN 'orphan' THEN 'unresolved'
      WHEN 'deprecated' THEN 'superseded'
    END
  WHEN mapping_status IS NULL THEN 'active'
  ELSE mapping_status
END;
ALTER TABLE data_lineage_links ALTER COLUMN mapping_status SET DEFAULT 'active';
ALTER TABLE data_lineage_links ALTER COLUMN mapping_status SET NOT NULL;
ALTER TABLE data_lineage_links ADD COLUMN IF NOT EXISTS confidence REAL;

-- ============================================================
-- 4.1. Append-only trigger: data_lineage_events rejects UPDATE/DELETE
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_lineage_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'data_lineage_events is append-only: % not allowed', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lineage_events_append_only ON data_lineage_events;
CREATE TRIGGER trigger_lineage_events_append_only
  BEFORE UPDATE OR DELETE ON data_lineage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lineage_events_append_only();

-- Idempotency: unique active pair on data_lineage_links (only constrains active rows)
DROP INDEX IF EXISTS uq_data_lineage_links_active_pair;
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_links_active_pair
  ON data_lineage_links(source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id)
  WHERE mapping_status = 'active';

-- Data completeness: mapping_status check
DO $$
BEGIN
  ALTER TABLE data_lineage_links DROP CONSTRAINT IF EXISTS data_lineage_links_mapping_check;
  ALTER TABLE data_lineage_links ADD CONSTRAINT data_lineage_links_mapping_check
    CHECK (mapping_status IN ('active', 'superseded', 'unresolved', 'conflict', 'ignored'));
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_lineage_links_confidence_check') THEN
    ALTER TABLE data_lineage_links ADD CONSTRAINT data_lineage_links_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

-- Real idempotency key for data_lineage_batches
ALTER TABLE data_lineage_batches ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
DROP INDEX IF EXISTS uq_data_lineage_batches_idempotent;
CREATE UNIQUE INDEX IF NOT EXISTS uq_data_lineage_batches_idempotent
  ON data_lineage_batches(project_id, batch_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 5. RLS on new tables
-- ============================================================
ALTER TABLE data_lineage_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_lineage_events ENABLE ROW LEVEL SECURITY;

-- Read policies
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['data_lineage_batches','data_import_batches','data_import_rows','data_lineage_events'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_read_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_read_policy ON %I FOR SELECT USING (
      EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = %I.project_id AND pm.user_id = auth.uid())
      OR (SELECT current_setting(''role'', true) = ''service_role'')
    )', tbl, tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_write_policy ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_write_policy ON %I FOR INSERT WITH CHECK ((SELECT current_setting(''role'', true) = ''service_role''))', tbl, tbl);
  END LOOP;
END $$;

COMMIT;


-- ============================================================
-- Source: 127_plan_truth_snapshot_boundaries.sql
-- ============================================================
-- 127_plan_truth_snapshot_boundaries.sql
-- v1.4-v1.4.7 completion: keep planning snapshots separate from current execution facts.

BEGIN;

-- Baseline rows are total-control commitment snapshots. They must preserve
-- the task facts used at generation/publish time instead of drifting with tasks.
ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'current_execution_fact',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

-- Monthly plan rows are monthly commitment snapshots. They either inherit a
-- baseline snapshot or capture current execution facts when generated directly.
ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS wbs_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_fact_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS task_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS status_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_source TEXT NOT NULL DEFAULT 'baseline_commitment_snapshot',
  ADD COLUMN IF NOT EXISTS snapshot_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_snapshot_source
  ON task_baseline_items(project_id, snapshot_source);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_snapshot_source
  ON monthly_plan_items(project_id, snapshot_source);

CREATE INDEX IF NOT EXISTS idx_task_baseline_items_scope_snapshot
  ON task_baseline_items USING GIN (scope_snapshot);

CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_scope_snapshot
  ON monthly_plan_items USING GIN (scope_snapshot);

-- Ensure the current migration's physical rules contain the plan snapshot links
-- used by v1.4.7 generation boundaries.
INSERT INTO data_lineage_relation_rules (source_entity_type, relation_type, target_entity_type)
VALUES
  ('task', 'generates', 'task_baseline_item'),
  ('task_baseline_item', 'derives', 'monthly_plan_item'),
  ('monthly_plan_item', 'carries_over_to', 'monthly_plan_item'),
  ('task', 'carries_over_to', 'monthly_plan_item')
ON CONFLICT (source_entity_type, relation_type, target_entity_type) DO NOTHING;

COMMIT;


-- ============================================================
-- Source: 128_create_project_entity_links.sql
-- ============================================================
-- 128_create_project_entity_links.sql
-- v1.4.11: Unified project entity linkage table.
-- Links drawings, certificates, and acceptance plans to tasks,
-- conditions, and requirements via stable relation types.

BEGIN;

CREATE TABLE IF NOT EXISTS project_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  relation_strength TEXT NOT NULL DEFAULT 'explicit',
  status TEXT NOT NULL DEFAULT 'active',
  source_ref_field TEXT,
  display_snapshot JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints (idempotent via DO $$)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_source_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_source_type_check
      CHECK (source_entity_type IN ('drawing_package','construction_drawing','pre_milestone','certificate_work_item','acceptance_plan'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_target_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_target_type_check
      CHECK (target_entity_type IN ('task','task_condition','acceptance_requirement','pre_milestone','certificate_work_item'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_relation_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_relation_type_check
      CHECK (relation_type IN ('satisfies_condition','satisfies_acceptance_requirement','covers_task','references_certificate','blocks_task_start'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_relation_strength_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_relation_strength_check
      CHECK (relation_strength IN ('explicit','system_inferred','legacy_mapped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_status_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_status_check
      CHECK (status IN ('active','inactive'));
  END IF;
END $$;

-- Unique active link
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_entity_links_unique_active
  ON project_entity_links(project_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type)
  WHERE status = 'active';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_project_entity_links_source
  ON project_entity_links(project_id, source_entity_type, source_entity_id, status);
CREATE INDEX IF NOT EXISTS idx_project_entity_links_target
  ON project_entity_links(project_id, target_entity_type, target_entity_id, status);

-- RLS
ALTER TABLE project_entity_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_entity_links_read_policy ON project_entity_links;
CREATE POLICY project_entity_links_read_policy ON project_entity_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_entity_links.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS project_entity_links_write_policy ON project_entity_links;
CREATE POLICY project_entity_links_write_policy ON project_entity_links FOR INSERT
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- Projection columns on task_conditions for v1.4.11 linkage
ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- Projection columns on acceptance_requirements for v1.4.11 linkage
ALTER TABLE acceptance_requirements
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_project_entity_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_project_entity_links_updated_at ON project_entity_links;
CREATE TRIGGER trigger_update_project_entity_links_updated_at
  BEFORE UPDATE ON project_entity_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_entity_links_updated_at();

COMMIT;


-- ============================================================
-- Source: 129_v147_v1410_plan_governance_completion.sql
-- ============================================================
-- 129_v147_v1410_plan_governance_completion.sql
-- v1.4.7-10: Complete remaining standardization columns, indexes, and constraints.

BEGIN;

-- ============================================================
-- v1.4.7: Plan governance columns
-- ============================================================
ALTER TABLE task_baselines
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_reason TEXT,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE monthly_plans
  ADD COLUMN IF NOT EXISTS source_mode TEXT,
  ADD COLUMN IF NOT EXISTS generation_cutoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temporary_without_baseline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS manual_override_fields JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS planning_governance_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_schedule_change_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_progress_snapshot_at TIMESTAMPTZ;

-- v1.4.7: Monthly plan status check + source_mode check
ALTER TABLE monthly_plans DROP CONSTRAINT IF EXISTS monthly_plans_status_check;
DO $$ BEGIN
  ALTER TABLE monthly_plans ADD CONSTRAINT monthly_plans_status_check
    CHECK (status IN ('draft','confirmed','closed','revising','pending_realign','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE monthly_plans DROP CONSTRAINT IF EXISTS monthly_plans_source_mode_check;
DO $$ BEGIN
  ALTER TABLE monthly_plans ADD CONSTRAINT monthly_plans_source_mode_check
    CHECK (source_mode IS NULL OR source_mode IN ('baseline','schedule','mixed','manual','imported'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_plans_current_confirmed
  ON monthly_plans(project_id, month) WHERE status = 'confirmed';

-- ============================================================
-- v1.4.8: task_dependencies hardening
-- ============================================================
ALTER TABLE task_dependencies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_satisfied BOOLEAN;

DO $$ BEGIN
  ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_status_check
    CHECK (status IN ('active','inactive','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Replace full unique index with active-only unique
DROP INDEX IF EXISTS uq_task_dependencies_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_active_unique
  ON task_dependencies(project_id, task_id, dependency_task_id, dependency_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_task_dependencies_status ON task_dependencies(project_id, status);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_confidence ON task_dependencies(project_id, inference_confidence);

-- ============================================================
-- v1.4.8: task_conditions hardening
-- ============================================================
ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS condition_code TEXT,
  ADD COLUMN IF NOT EXISTS required_for_start BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS blocking_level TEXT NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id UUID,
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_blocking_level_check
    CHECK (blocking_level IN ('hard','soft','info'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_conditions_constraint ON task_conditions(project_id, blocking_level, is_satisfied);
CREATE INDEX IF NOT EXISTS idx_task_conditions_confidence ON task_conditions(project_id, inference_confidence);

-- ============================================================
-- v1.4.8: task_obstacles hardening
-- ============================================================
ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS obstacle_code TEXT,
  ADD COLUMN IF NOT EXISTS impact_level TEXT NOT NULL DEFAULT 'partial',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id UUID,
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

UPDATE task_obstacles
SET is_resolved = true
WHERE COALESCE(is_resolved, false) = false
  AND (
    LOWER(COALESCE(status, '')) IN ('resolved', 'closed')
    OR status = '宸茶В鍐?
    OR resolved_at IS NOT NULL
  );

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_impact_level_check
    CHECK (impact_level IN ('none','partial','severe','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_obstacles_constraint ON task_obstacles(project_id, impact_level, is_resolved);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_confidence ON task_obstacles(project_id, inference_confidence);

-- ============================================================
-- v1.4.9: Milestone key node snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS project_key_node_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'generated',
  key_node_type TEXT NOT NULL DEFAULT 'milestone',
  source_task_ids UUID[] NOT NULL DEFAULT '{}',
  display_label TEXT NOT NULL,
  planned_date TIMESTAMPTZ,
  actual_date TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_project ON project_key_node_snapshots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_baseline ON project_key_node_snapshots(baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_monthly ON project_key_node_snapshots(monthly_plan_id);

-- v1.4.9: tasks milestone indexes
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS key_node_type TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_project_milestones ON tasks(project_id, is_milestone, status);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id) WHERE milestone_id IS NOT NULL;

-- ============================================================
-- v1.4.10: participant_units hardening
-- ============================================================
ALTER TABLE participant_units
  ADD COLUMN IF NOT EXISTS unit_code TEXT,
  ADD COLUMN IF NOT EXISTS unit_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE participant_units ADD CONSTRAINT participant_units_unit_status_check
    CHECK (unit_status IN ('active','inactive','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_participant_units_project_status ON participant_units(project_id, unit_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participant_units_project_name_active_unique
  ON participant_units(project_id, unit_name) WHERE unit_status = 'active';

-- v1.4.10: task_conditions participant_unit reference
ALTER TABLE task_conditions ADD COLUMN IF NOT EXISTS participant_unit_id UUID;
CREATE INDEX IF NOT EXISTS idx_task_conditions_participant_unit_id ON task_conditions(participant_unit_id);

COMMIT;


-- ============================================================
-- Source: 130_reconcile_milestone_task_authority.sql
-- ============================================================
-- 130_reconcile_milestone_task_authority.sql
-- v1.4.9: Milestones are tasks.is_milestone=true rows.
-- Remove old FK to milestones table, enforce self-referencing within tasks.

BEGIN;

-- Drop old FK to deprecated milestones table if exists
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS fk_tasks_milestone_id;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_milestone_id_fkey;

-- Create trigger: milestone_id must point to a valid task (same project, is_milestone=true, not cancelled, not self)
CREATE OR REPLACE FUNCTION public.check_task_milestone_reference()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.milestone_id IS NULL THEN RETURN NEW; END IF;
  -- Skip check if milestone_id unchanged from old row
  IF TG_OP = 'UPDATE' AND OLD.milestone_id IS NOT DISTINCT FROM NEW.milestone_id THEN
    RETURN NEW;
  END IF;
  IF NEW.milestone_id = NEW.id THEN
    RAISE EXCEPTION 'Task cannot reference itself as milestone: %', NEW.id;
  END IF;
  PERFORM 1 FROM tasks
    WHERE id = NEW.milestone_id
      AND project_id = NEW.project_id
      AND is_milestone = true
      AND status != 'cancelled'
    LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'milestone_id must reference a same-project active milestone task: %', NEW.milestone_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_task_milestone_reference ON tasks;
CREATE TRIGGER trigger_check_task_milestone_reference
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  WHEN (NEW.milestone_id IS NOT NULL)
  EXECUTE FUNCTION public.check_task_milestone_reference();

-- When a milestone is cancelled, nullify its milestone_id references
CREATE OR REPLACE FUNCTION public.cleanup_milestone_references_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.is_milestone = true THEN
    UPDATE tasks SET milestone_id = NULL WHERE milestone_id = OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_milestone_refs ON tasks;
CREATE TRIGGER trigger_cleanup_milestone_refs
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_milestone_references_on_cancel();

COMMIT;


-- ============================================================
-- Source: 131_v1412_warning_governance.sql
-- ============================================================
-- 131_v1412_warning_governance.sql
-- v1.4.12: Unified business warning lifecycle governance
-- Consolidates warnings into notifications(source_entity_type='warning') as single authority

BEGIN;

-- ============================================================
-- Phase 1: Warning lifecycle status + signature + hash
-- ============================================================
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS warning_signature TEXT,
  ADD COLUMN IF NOT EXISTS source_hash TEXT,
  ADD COLUMN IF NOT EXISTS warning_lifecycle_status TEXT;

-- Backfill existing warning notifications lifecycle status
UPDATE notifications
   SET warning_lifecycle_status = CASE
     WHEN COALESCE(is_escalated, FALSE) = TRUE OR escalated_to_risk_id IS NOT NULL THEN 'escalated'
     WHEN resolved_at IS NOT NULL OR resolved_source IS NOT NULL OR status = 'resolved' THEN 'resolved'
     WHEN muted_until IS NOT NULL AND muted_until > NOW() THEN 'muted'
     WHEN acknowledged_at IS NOT NULL OR status = 'acknowledged' THEN 'acknowledged'
     WHEN first_seen_at IS NOT NULL THEN 'active'
     ELSE 'created'
   END
 WHERE source_entity_type = 'warning'
   AND warning_lifecycle_status IS NULL;

-- Lifecycle status constraint: only warning notifications can have lifecycle
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notifications_warning_lifecycle_status_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_warning_lifecycle_status_check
      CHECK (
        (
          source_entity_type IS DISTINCT FROM 'warning'
          AND warning_lifecycle_status IS NULL
        )
        OR (
          source_entity_type = 'warning'
          AND warning_lifecycle_status IN ('created','active','acknowledged','muted','resolved','escalated')
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_warning_lifecycle
  ON notifications(project_id, source_entity_type, warning_lifecycle_status, severity, created_at DESC)
  WHERE source_entity_type = 'warning';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_warning_signature_unique
  ON notifications(project_id, warning_signature)
  WHERE source_entity_type = 'warning' AND warning_signature IS NOT NULL;

-- ============================================================
-- Phase 3: Upgrade chain protection + source_deleted rules
-- ============================================================

-- Protect risks that are part of upgrade chain from physical deletion
CREATE OR REPLACE FUNCTION public.protect_upgrade_chain_risk_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type IN ('warning_converted','warning_auto_escalated') THEN
      RAISE EXCEPTION 'UPGRADE_CHAIN_PROTECTED: risk linked to warning upgrade chain, use close instead';
    END IF;
    IF OLD.linked_issue_id IS NOT NULL THEN
      RAISE EXCEPTION 'UPGRADE_CHAIN_PROTECTED: risk has linked issue, use close instead';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_upgrade_chain_risk ON risks;
CREATE TRIGGER trigger_protect_upgrade_chain_risk
  BEFORE DELETE ON risks
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_upgrade_chain_risk_delete();

-- Protect issues that are part of upgrade chain from physical deletion
CREATE OR REPLACE FUNCTION public.protect_upgrade_chain_issue_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_type IN ('risk_converted','risk_auto_escalated','obstacle_escalated','condition_expired') THEN
      RAISE EXCEPTION 'UPGRADE_CHAIN_PROTECTED: issue linked to upgrade chain, use close instead';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_protect_upgrade_chain_issue ON issues;
CREATE TRIGGER trigger_protect_upgrade_chain_issue
  BEFORE DELETE ON issues
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_upgrade_chain_issue_delete();

-- ============================================================
-- Phase 3: Update atomic escalation RPC for lifecycle sync
-- ============================================================
-- Patch confirm_warning_as_risk_atomic to sync warning_lifecycle_status
CREATE OR REPLACE FUNCTION public.confirm_warning_as_risk_atomic(
  p_warning_id UUID,
  p_source_type VARCHAR DEFAULT 'warning_converted'
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_notification public.notifications%ROWTYPE;
  v_existing_risk_id UUID;
  v_risk_id UUID;
  v_chain_id UUID;
  v_risk_level VARCHAR(20);
  v_risk_category VARCHAR(20);
  v_probability INTEGER;
  v_impact INTEGER;
  v_timestamp TIMESTAMPTZ := NOW();
BEGIN
  SELECT *
  INTO v_notification
  FROM public.notifications
  WHERE id = p_warning_id
    AND source_entity_type = 'warning'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_notification.escalated_to_risk_id IS NOT NULL THEN
    RETURN v_notification.escalated_to_risk_id;
  END IF;

  SELECT id
  INTO v_existing_risk_id
  FROM public.risks
  WHERE source_entity_type = 'warning'
    AND (
      source_id = p_warning_id
      OR source_entity_id = p_warning_id::TEXT
    )
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  v_chain_id := COALESCE(v_notification.chain_id, gen_random_uuid());

  IF LOWER(COALESCE(v_notification.severity, 'warning')) = 'critical' THEN
    v_risk_level := 'critical';
    v_probability := 90;
    v_impact := 90;
  ELSIF LOWER(COALESCE(v_notification.severity, 'warning')) = 'warning' THEN
    v_risk_level := 'high';
    v_probability := 75;
    v_impact := 75;
  ELSE
    v_risk_level := 'medium';
    v_probability := 60;
    v_impact := 50;
  END IF;

  IF v_existing_risk_id IS NOT NULL THEN
    v_risk_id := v_existing_risk_id;
    UPDATE public.risks
    SET level = v_risk_level,
        probability = v_probability,
        impact = v_impact,
        status = 'identified',
        source_type = p_source_type,
        updated_at = v_timestamp
    WHERE id = v_risk_id;
  ELSE
    v_risk_id := gen_random_uuid();
    INSERT INTO public.risks (
      id, project_id, title, description, level, status,
      source_type, source_id, source_entity_type, source_entity_id,
      chain_id, probability, impact,
      created_at, updated_at
    ) VALUES (
      v_risk_id,
      v_notification.project_id,
      COALESCE(v_notification.title, v_notification.content, '棰勮鍗囩骇椋庨櫓'),
      COALESCE(v_notification.content, ''),
      v_risk_level,
      'identified',
      p_source_type,
      p_warning_id,
      'warning',
      v_notification.source_entity_id,
      v_chain_id,
      v_probability,
      v_impact,
      v_timestamp,
      v_timestamp
    );
  END IF;

  -- v1.4.12: sync warning_lifecycle_status = escalated
  UPDATE public.notifications
  SET escalated_to_risk_id = v_risk_id,
      escalated_at = v_timestamp,
      is_escalated = true,
      warning_lifecycle_status = 'escalated',
      updated_at = v_timestamp
  WHERE id = p_warning_id;

  RETURN v_risk_id;
END;
$$;

-- ============================================================
-- Phase 4: Old object backfill
-- ============================================================

-- risks: null source_type 鈫?manual
UPDATE risks SET source_type = 'manual' WHERE source_type IS NULL OR source_type = '';

-- risks: old status occurred 鈫?mitigating
UPDATE risks SET status = 'mitigating' WHERE status = 'occurred';

-- risks: null level 鈫?medium
UPDATE risks SET level = 'medium' WHERE level IS NULL OR level = '';

-- issues: null source_type 鈫?manual
UPDATE issues SET source_type = 'manual' WHERE source_type IS NULL OR source_type = '';

COMMIT;


-- ============================================================
-- Source: 131a_v147_v1411_closure_fixups.sql
-- ============================================================
-- 131_v147_v1411_closure_fixups.sql
-- Final closure fixups for v1.4.7-v1.4.11 implementation boundaries.

BEGIN;

-- v1.4.8 task constraint cache on current task facts.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS ready_for_start BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dependency_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS condition_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS obstacle_status TEXT NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS progress_impact_level TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS blocked_for_progress BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS readiness_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS constraint_evaluated_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_dependency_status_check
    CHECK (dependency_status IN ('satisfied','blocking','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_condition_status_check
    CHECK (condition_status IN ('satisfied','blocking','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_obstacle_status_check
    CHECK (obstacle_status IN ('clear','warning','partial_impact','blocked','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_progress_impact_level_check
    CHECK (progress_impact_level IN ('none','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_constraint_status
  ON tasks(project_id, ready_for_start, progress_impact_level, blocked_for_progress);

ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS progress_impact_level TEXT NOT NULL DEFAULT 'warning',
  ADD COLUMN IF NOT EXISTS blocking_scope TEXT NOT NULL DEFAULT 'progress',
  ADD COLUMN IF NOT EXISTS blocking_level TEXT NOT NULL DEFAULT 'warning';

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_progress_impact_level_check
    CHECK (progress_impact_level IN ('none','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_blocking_scope_check
    CHECK (blocking_scope IN ('none','start','progress','finish'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_blocking_level_check
    CHECK (blocking_level IN ('info','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS task_constraint_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ready_for_start BOOLEAN NOT NULL DEFAULT true,
  dependency_status TEXT NOT NULL DEFAULT 'not_applicable',
  condition_status TEXT NOT NULL DEFAULT 'not_applicable',
  obstacle_status TEXT NOT NULL DEFAULT 'clear',
  progress_impact_level TEXT NOT NULL DEFAULT 'none',
  blocked_for_progress BOOLEAN NOT NULL DEFAULT false,
  readiness_summary JSONB NOT NULL DEFAULT '{}',
  source_event_type TEXT NOT NULL,
  source_event_key TEXT NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT 'v1.4.8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_constraint_snapshots_event_key
  ON task_constraint_snapshots(source_event_key);
CREATE INDEX IF NOT EXISTS idx_task_constraint_snapshots_task
  ON task_constraint_snapshots(project_id, task_id, created_at DESC);

-- v1.4.10 participant unit lifecycle vocabulary used by ordinary selectors.
ALTER TABLE participant_units DROP CONSTRAINT IF EXISTS participant_units_unit_status_check;
ALTER TABLE participant_units
  ADD CONSTRAINT participant_units_unit_status_check
  CHECK (unit_status IN ('active','disabled','archived'));

COMMIT;


-- ============================================================
-- Source: 132_project_entity_link_delete_guards.sql
-- ============================================================
-- 132_project_entity_link_delete_guards.sql
-- v1.4.11 closure: protect source facts and retire target links on delete.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_delete_active_project_entity_links()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
  v_active_count INTEGER := 0;
BEGIN
  SELECT COUNT(*)
    INTO v_active_count
    FROM public.project_entity_links
   WHERE project_id = OLD.project_id
     AND status = 'active'
     AND (
       (source_entity_type = v_entity_type AND source_entity_id = OLD.id::TEXT)
       OR (target_entity_type = v_entity_type AND target_entity_id = OLD.id::TEXT)
     );

  IF v_active_count > 0 THEN
    RAISE EXCEPTION
      'Cannot delete % % while active project_entity_links exist',
      v_entity_type,
      OLD.id
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_target_project_entity_links_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_entity_type TEXT := TG_ARGV[0];
BEGIN
  UPDATE public.project_entity_links
     SET status = 'inactive',
         updated_at = NOW()
   WHERE project_id = OLD.project_id
     AND target_entity_type = v_entity_type
     AND target_entity_id = OLD.id::TEXT
     AND status = 'active';

  RETURN OLD;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.drawing_packages') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_drawing_packages_active_links ON public.drawing_packages;
    CREATE TRIGGER prevent_delete_drawing_packages_active_links
      BEFORE DELETE ON public.drawing_packages
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('drawing_package');
  END IF;

  IF to_regclass('public.construction_drawings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_construction_drawings_active_links ON public.construction_drawings;
    CREATE TRIGGER prevent_delete_construction_drawings_active_links
      BEFORE DELETE ON public.construction_drawings
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('construction_drawing');
  END IF;

  IF to_regclass('public.pre_milestones') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_pre_milestones_active_links ON public.pre_milestones;
    CREATE TRIGGER prevent_delete_pre_milestones_active_links
      BEFORE DELETE ON public.pre_milestones
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('pre_milestone');
  END IF;

  IF to_regclass('public.certificate_work_items') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_certificate_work_items_active_links ON public.certificate_work_items;
    CREATE TRIGGER prevent_delete_certificate_work_items_active_links
      BEFORE DELETE ON public.certificate_work_items
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('certificate_work_item');
  END IF;

  IF to_regclass('public.acceptance_plans') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_delete_acceptance_plans_active_links ON public.acceptance_plans;
    CREATE TRIGGER prevent_delete_acceptance_plans_active_links
      BEFORE DELETE ON public.acceptance_plans
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_delete_active_project_entity_links('acceptance_plan');
  END IF;

  IF to_regclass('public.tasks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_task_project_entity_links_before_delete ON public.tasks;
    CREATE TRIGGER deactivate_task_project_entity_links_before_delete
      BEFORE DELETE ON public.tasks
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('task');
  END IF;

  IF to_regclass('public.task_conditions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_task_condition_project_entity_links_before_delete ON public.task_conditions;
    CREATE TRIGGER deactivate_task_condition_project_entity_links_before_delete
      BEFORE DELETE ON public.task_conditions
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('task_condition');
  END IF;

  IF to_regclass('public.acceptance_requirements') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS deactivate_acceptance_requirement_project_entity_links_before_delete ON public.acceptance_requirements;
    CREATE TRIGGER deactivate_acceptance_requirement_project_entity_links_before_delete
      BEFORE DELETE ON public.acceptance_requirements
      FOR EACH ROW
      EXECUTE FUNCTION public.deactivate_target_project_entity_links_before_delete('acceptance_requirement');
  END IF;
END $$;

COMMIT;


-- ============================================================
-- Source: 133_v1414_change_audit_governance.sql
-- ============================================================
-- 133_v1414_change_audit_governance.sql
-- v1.4.14: Standardize change_logs + operation_logs + change_action_types dictionary
-- v1.4.15: deletion_retention_events table

BEGIN;

-- ============================================================
-- v1.4.14: change_logs hardening
-- ============================================================
ALTER TABLE change_logs
  ADD COLUMN IF NOT EXISTS action_type TEXT,
  ADD COLUMN IF NOT EXISTS action_group TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS before_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS after_snapshot JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS retention_policy TEXT NOT NULL DEFAULT 'project_lifecycle';

-- Widen entity_type/change_source constraints to accept all known values.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_logs_entity_type_check') THEN
    ALTER TABLE change_logs DROP CONSTRAINT change_logs_entity_type_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_logs_change_source_check') THEN
    ALTER TABLE change_logs DROP CONSTRAINT change_logs_change_source_check;
  END IF;
END $$;

-- Backfill action_type from existing field_name/source_type for old records.
UPDATE change_logs SET action_type = 'field_update' WHERE action_type IS NULL AND field_name IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'change_logs'
      AND column_name = 'source_type'
  ) THEN
    EXECUTE 'UPDATE change_logs SET action_type = source_type WHERE action_type IS NULL AND source_type IS NOT NULL';
  END IF;
END $$;
UPDATE change_logs SET action_type = 'unknown' WHERE action_type IS NULL;

-- Normalize old change_source to new standard values.
UPDATE change_logs SET change_source = 'user_save' WHERE change_source IN ('manual_adjusted', 'manual_edit', 'user_edit');
UPDATE change_logs SET change_source = 'user_confirm' WHERE change_source IN ('manual_close_confirmation', 'manual_keep_processing', 'baseline_revision', 'monthly_plan_confirm');
UPDATE change_logs SET change_source = 'force_action' WHERE change_source IN ('admin_force', 'force_unlock', 'force_close');
UPDATE change_logs SET change_source = 'approved_correction' WHERE change_source IN ('approval', 'correction_request_approved');
UPDATE change_logs SET change_source = 'high_privilege_correction' WHERE change_source IN ('monthly_plan_correction', 'baseline_correction', 'admin_correction');
UPDATE change_logs SET change_source = 'system_auto' WHERE change_source IN ('system', 'auto', 'system_generated', 'scheduler');
UPDATE change_logs SET change_source = 'imported' WHERE change_source IN ('import', 'csv_import', 'batch_import');
UPDATE change_logs SET change_source = 'backfill' WHERE change_source IN ('migration', 'data_backfill', 'legacy_migration');

-- ============================================================
-- v1.4.14: change_action_types dictionary
-- ============================================================
CREATE TABLE IF NOT EXISTS change_action_types (
  action_type TEXT PRIMARY KEY,
  action_name TEXT NOT NULL,
  action_group TEXT NOT NULL,
  entity_type TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  requires_reason BOOLEAN NOT NULL DEFAULT false,
  user_visible BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Use ASCII names so this migration is not sensitive to file encoding.
INSERT INTO change_action_types (action_type, action_name, action_group, entity_type, requires_approval, requires_reason, user_visible) VALUES
  ('field_update', 'Field update', 'edit', NULL, false, false, false),
  ('task_create', 'Task created', 'create', 'task', false, false, true),
  ('task_update', 'Task updated', 'edit', 'task', false, false, true),
  ('task_list_commit', 'Task list commit summary', 'edit', 'task_list', false, false, true),
  ('task_delete', 'Task deleted', 'delete', 'task', false, false, true),
  ('task_progress', 'Task progress saved', 'edit', 'task', false, false, true),
  ('task_complete', 'Task completed', 'confirm', 'task', false, false, true),
  ('task_reopen', 'Task reopened', 'confirm', 'task', false, false, true),
  ('baseline_publish', 'Baseline published', 'confirm', 'task_baseline', false, false, true),
  ('baseline_generate', 'Baseline generated', 'create', 'task_baseline', false, false, true),
  ('baseline_commit', 'Baseline draft commit summary', 'edit', 'baseline', false, false, true),
  ('monthly_confirm', 'Monthly plan confirmed', 'confirm', 'monthly_plan', false, false, true),
  ('monthly_generate', 'Monthly plan generated', 'create', 'monthly_plan', false, false, true),
  ('monthly_plan_commit', 'Monthly plan draft commit summary', 'edit', 'monthly_plan', false, false, true),
  ('monthly_close', 'Monthly plan closed', 'confirm', 'monthly_plan', false, false, true),
  ('risk_create', 'Risk created', 'create', 'risk', false, false, true),
  ('risk_close', 'Risk closed', 'confirm', 'risk', false, false, true),
  ('risk_convert_issue', 'Risk converted to issue', 'confirm', 'risk', false, false, true),
  ('issue_create', 'Issue created', 'create', 'issue', false, false, true),
  ('issue_close', 'Issue closed', 'confirm', 'issue', false, false, true),
  ('blockage_create', 'Blockage created', 'create', 'task_obstacle', false, false, true),
  ('blockage_close', 'Blockage closed', 'confirm', 'task_obstacle', false, false, true),
  ('condition_satisfy', 'Condition satisfied', 'confirm', 'task_condition', false, false, true),
  ('condition_create', 'Condition created', 'create', 'task_condition', false, false, true),
  ('milestone_mark', 'Milestone marked', 'confirm', 'task', false, false, true),
  ('milestone_unmark', 'Milestone unmarked', 'confirm', 'task', false, false, true),
  ('dependency_change', 'Dependency changed', 'edit', 'task_dependency', false, false, false),
  ('warning_acknowledge', 'Warning acknowledged', 'confirm', 'warning', false, false, true),
  ('warning_escalate', 'Warning escalated', 'confirm', 'warning', false, false, false),
  ('warning_resolve', 'Warning resolved', 'auto', 'warning', false, false, false),
  ('history_correction', 'History correction', 'governance', NULL, true, true, false),
  ('frozen_correction', 'Frozen-period correction', 'governance', NULL, true, true, false),
  ('backfill', 'Backfill', 'governance', NULL, false, false, false),
  ('import', 'Import', 'import', NULL, false, false, true),
  ('template_generate', 'Template generated', 'create', 'task', false, false, true),
  ('scope_change', 'Scope object changed', 'edit', 'engineering_object', false, false, true),
  ('participant_unit_change', 'Participant unit changed', 'edit', 'participant_unit', false, false, true),
  ('drawing_version', 'Drawing version changed', 'confirm', 'construction_drawing', false, false, true),
  ('acceptance_record', 'Acceptance record changed', 'confirm', 'acceptance_plan', false, false, true),
  ('certificate_status', 'Certificate status changed', 'confirm', 'certificate_work_item', false, false, true),
  ('governance_approval', 'Governance approval', 'governance', NULL, true, true, false),
  ('permission_change', 'Permission changed', 'governance', 'project_member', false, false, true),
  ('retention_decision', 'Retention decision', 'delete', NULL, false, false, false),
  ('retention_confirmed', 'Retention decision confirmed', 'confirm', NULL, false, true, false),
  -- v1.4.14 required bootstrap: task lifecycle
  ('task_progress_saved', 'Task progress saved', 'edit', 'task', false, false, false),
  ('task_actual_start_auto', 'Task actual start auto-filled', 'auto', 'task', false, false, false),
  ('task_actual_end_auto', 'Task actual end auto-filled', 'auto', 'task', false, false, false),
  ('task_planned_dates_updated', 'Task planned dates updated', 'edit', 'task', false, false, false),
  ('task_fact_corrected', 'Task fact corrected', 'governance', 'task', true, true, false),
  ('task_code_generated', 'Task code generated', 'auto', 'task_code', false, false, false),
  ('task_code_reassigned', 'Task code reassigned', 'governance', 'task_code', false, false, false),
  -- Engineering objects
  ('engineering_object_created', 'Engineering object created', 'create', 'engineering_object', false, false, true),
  ('engineering_object_disabled', 'Engineering object disabled', 'delete', 'engineering_object', false, false, true),
  ('engineering_object_restored', 'Engineering object restored', 'confirm', 'engineering_object', false, false, true),
  -- Engineering category
  ('engineering_category_calibrated', 'Engineering category calibrated', 'auto', 'engineering_category', false, false, false),
  -- Status dictionary
  ('status_dictionary_version', 'Status dictionary version created', 'create', 'status_dictionary', false, false, false),
  ('status_dictionary_normalized', 'Status auto-normalized', 'auto', 'status_dictionary', false, false, false),
  -- Conditions & obstacles (specific)
  ('condition_auto_satisfied', 'Condition auto-satisfied', 'auto', 'task_condition', false, false, false),
  ('condition_light_confirmed', 'Condition light-confirmed', 'confirm', 'task_condition', false, false, false),
  ('condition_not_applicable', 'Condition marked not applicable', 'confirm', 'task_condition', false, false, false),
  ('obstacle_degraded', 'Obstacle degraded', 'auto', 'task_obstacle', false, false, false),
  ('obstacle_suggested_close', 'Obstacle suggested close', 'auto', 'task_obstacle', false, false, false),
  ('obstacle_reopened', 'Obstacle reopened', 'confirm', 'task_obstacle', false, false, true),
  -- Draft lock
  ('draft_lock_acquired', 'Draft lock acquired', 'auto', 'planning_draft_lock', false, false, false),
  ('draft_lock_released', 'Draft lock released', 'auto', 'planning_draft_lock', false, false, false),
  -- Baseline & monthly plan (specific)
  ('baseline_suggestion_accepted', 'Baseline suggestion accepted', 'confirm', 'task_baseline', false, false, false),
  ('baseline_suggestion_ignored', 'Baseline suggestion ignored', 'confirm', 'task_baseline', false, false, false),
  ('monthly_correction_executed', 'Monthly correction executed', 'governance', 'monthly_plan', true, true, false),
  ('monthly_closed_incomplete', 'Monthly closed with incomplete data', 'confirm', 'monthly_plan', false, false, false),
  -- Milestone & key node
  ('milestone_marked', 'Milestone marked', 'confirm', 'task', false, false, true),
  ('milestone_unmarked', 'Milestone unmarked', 'confirm', 'task', false, false, true),
  ('key_node_algorithm_suggested', 'Key node algorithm suggested', 'auto', 'task', false, false, false),
  -- Drawing (specific)
  ('drawing_approved', 'Drawing approved', 'confirm', 'construction_drawing', false, false, true),
  ('drawing_voided', 'Drawing voided', 'confirm', 'construction_drawing', false, false, true),
  ('drawing_replaced', 'Drawing replaced', 'confirm', 'construction_drawing', false, false, true),
  -- Certificate (specific)
  ('certificate_completed', 'Certificate completed', 'confirm', 'certificate_work_item', false, false, true),
  ('certificate_voided', 'Certificate voided', 'confirm', 'certificate_work_item', false, false, true),
  -- Acceptance (specific)
  ('acceptance_submitted', 'Acceptance submitted', 'confirm', 'acceptance_plan', false, false, true),
  ('acceptance_passed', 'Acceptance passed', 'confirm', 'acceptance_plan', false, false, true),
  ('acceptance_rectifying', 'Acceptance rectifying', 'confirm', 'acceptance_plan', false, false, true),
  ('acceptance_archived', 'Acceptance archived', 'confirm', 'acceptance_plan', false, false, true),
  ('acceptance_task_linked', 'Acceptance task linked', 'edit', 'acceptance_plan', false, false, false),
  -- Material (specific)
  ('material_arrival_confirmed', 'Material arrival confirmed', 'confirm', 'project_material', false, false, true),
  ('material_sample_confirmed', 'Material sample confirmed', 'confirm', 'project_material', false, false, true),
  -- Participant unit (specific)
  ('participant_unit_archived', 'Participant unit archived', 'delete', 'participant_unit', false, false, true),
  ('participant_unit_merged', 'Participant unit merged', 'governance', 'participant_unit', false, false, false),
  -- Project member (specific)
  ('project_member_added', 'Project member added', 'create', 'project_member', false, false, true),
  ('project_member_removed', 'Project member removed', 'delete', 'project_member', false, false, true),
  ('project_member_role_changed', 'Project member role changed', 'edit', 'project_member', false, false, true),
  ('owner_transferred', 'Project owner transferred', 'governance', 'project_member', false, false, true),
  -- Lineage
  ('lineage_import_batch_created', 'Import batch created', 'import', 'data_import_batch', false, false, true)
ON CONFLICT (action_type) DO UPDATE SET
  action_name = EXCLUDED.action_name,
  action_group = EXCLUDED.action_group,
  entity_type = EXCLUDED.entity_type,
  requires_approval = EXCLUDED.requires_approval,
  requires_reason = EXCLUDED.requires_reason,
  user_visible = EXCLUDED.user_visible;

CREATE INDEX IF NOT EXISTS idx_change_action_types_group ON change_action_types(action_group, entity_type);

-- ============================================================
-- v1.4.14: governance_approval_records table
-- ============================================================
CREATE TABLE IF NOT EXISTS governance_approval_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  requested_action TEXT NOT NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_governance_approval_project
  ON governance_approval_records(project_id, status, created_at DESC);

-- ============================================================
-- v1.4.15: deletion_retention_events table
-- ============================================================
CREATE TABLE IF NOT EXISTS deletion_retention_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NULL,
  project_name_snapshot TEXT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name_snapshot TEXT NULL,
  requested_action TEXT NOT NULL,
  resolved_action TEXT NOT NULL,
  requested_allowed BOOLEAN NOT NULL DEFAULT false,
  resolved_allowed BOOLEAN NOT NULL DEFAULT false,
  execution_mode TEXT NOT NULL DEFAULT 'reject',
  execution_status TEXT NOT NULL DEFAULT 'decided',
  requires_user_confirmation BOOLEAN NOT NULL DEFAULT false,
  reason_code TEXT NOT NULL,
  reference_summary JSONB NOT NULL DEFAULT '{}',
  affected_entity_ids JSONB NOT NULL DEFAULT '[]',
  suggested_action JSONB NOT NULL DEFAULT '{}',
  actor_id UUID NULL,
  change_log_id UUID NULL,
  operation_log_id BIGINT NULL,
  request_id TEXT NULL,
  confirmed_by UUID NULL,
  confirmed_at TIMESTAMPTZ NULL,
  executed_at TIMESTAMPTZ NULL,
  decision_token TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retention_events_token
  ON deletion_retention_events(decision_token) WHERE decision_token IS NOT NULL;

-- Bring an already-created early table up to the final v1.4.15 shape.
ALTER TABLE deletion_retention_events
  ADD COLUMN IF NOT EXISTS project_name_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS entity_name_snapshot TEXT NULL,
  ADD COLUMN IF NOT EXISTS requested_action TEXT,
  ADD COLUMN IF NOT EXISTS resolved_action TEXT,
  ADD COLUMN IF NOT EXISTS requested_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_allowed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'reject',
  ADD COLUMN IF NOT EXISTS execution_status TEXT NOT NULL DEFAULT 'decided',
  ADD COLUMN IF NOT EXISTS requires_user_confirmation BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reason_code TEXT,
  ADD COLUMN IF NOT EXISTS affected_entity_ids JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS suggested_action JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS actor_id UUID NULL,
  ADD COLUMN IF NOT EXISTS change_log_id UUID NULL,
  ADD COLUMN IF NOT EXISTS operation_log_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS request_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ NULL;

DO $$
DECLARE
  has_user_action BOOLEAN;
  has_retention_decision BOOLEAN;
  has_decision_reason BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deletion_retention_events' AND column_name = 'user_action'
  ) INTO has_user_action;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deletion_retention_events' AND column_name = 'retention_decision'
  ) INTO has_retention_decision;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deletion_retention_events' AND column_name = 'decision_reason'
  ) INTO has_decision_reason;

  IF has_user_action THEN
    EXECUTE 'UPDATE deletion_retention_events SET requested_action = COALESCE(requested_action, user_action, ''delete'') WHERE requested_action IS NULL';
  ELSE
    UPDATE deletion_retention_events SET requested_action = 'delete' WHERE requested_action IS NULL;
  END IF;

  IF has_retention_decision THEN
    EXECUTE 'UPDATE deletion_retention_events SET resolved_action = COALESCE(resolved_action, retention_decision, ''reject'') WHERE resolved_action IS NULL';
  ELSE
    UPDATE deletion_retention_events SET resolved_action = 'reject' WHERE resolved_action IS NULL;
  END IF;

  IF has_decision_reason THEN
    EXECUTE 'UPDATE deletion_retention_events SET reason_code = COALESCE(reason_code, decision_reason, ''legacy_retention_decision'') WHERE reason_code IS NULL';
  ELSE
    UPDATE deletion_retention_events SET reason_code = 'legacy_retention_decision' WHERE reason_code IS NULL;
  END IF;
END $$;

ALTER TABLE deletion_retention_events
  ALTER COLUMN requested_action SET NOT NULL,
  ALTER COLUMN resolved_action SET NOT NULL,
  ALTER COLUMN reason_code SET NOT NULL;

ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_project_id_fkey;
ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_actor_id_fkey;
ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_change_log_id_fkey;
ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_operation_log_id_fkey;
ALTER TABLE deletion_retention_events DROP CONSTRAINT IF EXISTS deletion_retention_events_confirmed_by_fkey;

ALTER TABLE deletion_retention_events
  ADD CONSTRAINT deletion_retention_events_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  ADD CONSTRAINT deletion_retention_events_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT deletion_retention_events_change_log_id_fkey
    FOREIGN KEY (change_log_id) REFERENCES change_logs(id) ON DELETE SET NULL,
  ADD CONSTRAINT deletion_retention_events_operation_log_id_fkey
    FOREIGN KEY (operation_log_id) REFERENCES operation_logs(id) ON DELETE SET NULL,
  ADD CONSTRAINT deletion_retention_events_confirmed_by_fkey
    FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deletion_retention_events_project
  ON deletion_retention_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_retention_events_entity
  ON deletion_retention_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_retention_events_request
  ON deletion_retention_events(request_id);

-- ============================================================
-- v1.4.15: operation_logs boundary clarification
-- ============================================================
-- operation_logs is for technical/security audit only, not business change tracking.
ALTER TABLE operation_logs
  ADD COLUMN IF NOT EXISTS audit_domain TEXT NOT NULL DEFAULT 'technical',
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info';

COMMIT;


-- ============================================================
-- Source: 134_v1416_data_quality_governance.sql
-- ============================================================
-- 134_v1416_data_quality_governance.sql
-- v1.4.16: Extended data quality rules and dimensions

BEGIN;

-- ============================================================
-- Phase 1: data_quality_findings hardening
-- ============================================================
ALTER TABLE data_quality_findings
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS quality_dimension TEXT,
  ADD COLUMN IF NOT EXISTS confidence_impact REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS resolved_type TEXT;

-- Backfill entity_type from finding_key prefix
UPDATE data_quality_findings SET entity_type = 'task' WHERE entity_type IS NULL AND task_id IS NOT NULL;
UPDATE data_quality_findings SET entity_type = 'unknown' WHERE entity_type IS NULL;

-- Backfill quality_dimension from dimension_key or rule_type
UPDATE data_quality_findings SET quality_dimension = 'timeliness' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%timeliness%' OR rule_code IN ('SNAPSHOT_GAP', 'STALE_PROGRESS'));
UPDATE data_quality_findings SET quality_dimension = 'anomaly' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%anomaly%' OR rule_code IN ('PROGRESS_JUMP', 'BATCH_SAME_VALUE', 'ASSIGNEE_WORKLOAD_ABNORMAL'));
UPDATE data_quality_findings SET quality_dimension = 'consistency' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%consistency%' OR rule_code IN ('PARENT_CHILD_INCONSISTENT', 'DEPENDENCY_INCONSISTENT', 'MILESTONE_PREDECESSOR_INCONSISTENT', 'ACCEPTANCE_LINK_ORPHAN', 'CONDITION_ORPHAN'));
UPDATE data_quality_findings SET quality_dimension = 'jumpiness' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%jumpiness%' OR rule_code IN ('PROGRESS_TIME_MISMATCH'));
UPDATE data_quality_findings SET quality_dimension = 'coverage' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%coverage%');
UPDATE data_quality_findings SET quality_dimension = 'completeness' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%completeness%' OR rule_code IN ('ENGINEERING_OBJECT_MISSING', 'PARTICIPANT_UNIT_MISSING'));
UPDATE data_quality_findings SET quality_dimension = 'accuracy' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%accuracy%' OR rule_code IN ('WBS_TYPE_UNCALIBRATED'));
UPDATE data_quality_findings SET quality_dimension = 'lineage' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%lineage%' OR rule_code IN ('LINEAGE_INCOMPLETE'));
UPDATE data_quality_findings SET quality_dimension = 'governance' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%governance%' OR rule_code IN ('STATUS_NORMALIZATION_NEEDED'));
UPDATE data_quality_findings SET quality_dimension = 'retention' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%retention%' OR rule_code IN ('RETENTION_DECISION_EXPIRED', 'SOURCE_DELETED_UNRESOLVED'));
UPDATE data_quality_findings SET quality_dimension = 'metric_caliber' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%metric_caliber%' OR rule_code IN ('METRIC_CALIBER_MISSING', 'METRIC_VALUE_UNAVAILABLE'));
UPDATE data_quality_findings SET quality_dimension = 'timeliness' WHERE quality_dimension IS NULL;

-- Widen rule_type constraint to include new types
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_quality_findings_rule_type_check') THEN
    ALTER TABLE data_quality_findings DROP CONSTRAINT data_quality_findings_rule_type_check;
  END IF;
END $$;

-- task_id FK: set null on delete so findings survive task removal
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_quality_findings_task_id_fkey') THEN
    ALTER TABLE data_quality_findings DROP CONSTRAINT data_quality_findings_task_id_fkey;
  END IF;
END $$;

ALTER TABLE data_quality_findings
  ADD CONSTRAINT data_quality_findings_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- Indexes for new query patterns
CREATE INDEX IF NOT EXISTS idx_quality_findings_entity ON data_quality_findings(entity_type, entity_id) WHERE status IN ('active', 'ignored');
CREATE INDEX IF NOT EXISTS idx_quality_findings_rule ON data_quality_findings(project_id, rule_code, status);

-- ============================================================
-- Phase 3: Extended finding rules reference table
-- ============================================================
CREATE TABLE IF NOT EXISTS data_quality_rule_registry (
  rule_code TEXT PRIMARY KEY,
  rule_type TEXT NOT NULL,
  dimension TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  description TEXT,
  auto_resolve_condition TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed extended rules
INSERT INTO data_quality_rule_registry (rule_code, rule_type, dimension, severity, description, auto_resolve_condition) VALUES
  ('ENGINEERING_OBJECT_MISSING', 'completeness', 'completeness', 'warning', 'Active executable task missing engineering object', 'engineering_object_id IS NOT NULL'),
  ('PARTICIPANT_UNIT_MISSING', 'completeness', 'completeness', 'warning', 'Active task missing participant unit', 'participant_unit_id IS NOT NULL'),
  ('WBS_TYPE_UNCALIBRATED', 'wbs_classification', 'accuracy', 'info', 'WBS node type inferred from depth', 'wbs_node_type IS NOT NULL OR engineering_category_id IS NOT NULL'),
  ('STATUS_NORMALIZATION_NEEDED', 'status_normalization', 'governance', 'warning', 'Task status not normalized to dictionary', NULL),
  ('LINEAGE_INCOMPLETE', 'lineage', 'lineage', 'info', 'Source mapping missing for generated task', NULL),
  ('RETENTION_DECISION_EXPIRED', 'retention', 'retention', 'warning', 'Retention decision token expired before confirmation', 'decision regenerated'),
  ('SOURCE_DELETED_UNRESOLVED', 'retention', 'retention', 'info', 'Finding source has been deleted and should be resolved by governance action', 'source_deleted resolution applied'),
  ('METRIC_CALIBER_MISSING', 'metric_caliber', 'metric_caliber', 'warning', 'Metric caliber or registry metadata is missing', 'metric caliber metadata restored'),
  ('METRIC_VALUE_UNAVAILABLE', 'metric_caliber', 'metric_caliber', 'info', 'Metric value is unavailable under the current caliber', 'snapshot recomputed with metric availability'),
  ('ACCEPTANCE_LINK_ORPHAN', 'cross_consistency', 'consistency', 'warning', 'Acceptance linked to nonexistent/cancelled task', 'task restored OR acceptance link updated'),
  ('CONDITION_ORPHAN', 'cross_consistency', 'consistency', 'warning', 'Task condition references deleted source', 'source restored OR condition marked inapplicable'),
  ('STALE_PROGRESS', 'staleness', 'timeliness', 'info', 'Active task not updated in 14+ days', 'progress or status updated')
ON CONFLICT (rule_code) DO UPDATE SET
  description = EXCLUDED.description,
  auto_resolve_condition = EXCLUDED.auto_resolve_condition;

-- ============================================================
-- Data quality dimension weights per project
-- ============================================================
ALTER TABLE project_data_quality_settings
  ADD COLUMN IF NOT EXISTS dimension_weights JSONB NOT NULL DEFAULT '{}';

-- Set default weights for all dimensions
UPDATE project_data_quality_settings
  SET dimension_weights = jsonb_build_object(
    'timeliness', 0.20,
    'anomaly', 0.20,
    'consistency', 0.15,
    'jumpiness', 0.10,
    'coverage', 0.15,
    'completeness', 0.10,
    'accuracy', 0.05,
    'lineage', 0.03,
    'governance', 0.02,
    'retention', 0.03,
    'metric_caliber', 0.03
  )
  WHERE dimension_weights = '{}'::jsonb;

-- ============================================================
-- Index on quality findings by dimension
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quality_findings_dimension
  ON data_quality_findings(project_id, status, rule_code)
  WHERE status IN ('active', 'ignored');

-- ============================================================
-- Phase 1b: quality_dimension CHECK constraint + NOT NULL enforcement
-- ============================================================
UPDATE data_quality_findings SET quality_dimension = 'timeliness' WHERE quality_dimension IS NULL;

ALTER TABLE data_quality_findings
  ALTER COLUMN quality_dimension SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_quality_findings_quality_dimension_check'
  ) THEN
    ALTER TABLE data_quality_findings
      ADD CONSTRAINT data_quality_findings_quality_dimension_check
      CHECK (quality_dimension IN (
        'timeliness','anomaly','consistency','jumpiness','coverage',
        'completeness','accuracy','lineage','governance',
        'retention','metric_caliber'
      ));
  END IF;
END $$;

COMMIT;


-- ============================================================
-- Source: 135_v1417_metric_registry_snapshots.sql
-- ============================================================
-- 135_v1417_metric_registry_snapshots.sql
-- v1.4.17: metric caliber versions and metric value snapshots.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS metric_caliber_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key TEXT NOT NULL UNIQUE,
  version_name TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_count INTEGER NOT NULL DEFAULT 0,
  definition_hash TEXT,
  change_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS metric_value_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC,
  value_text TEXT,
  value_type TEXT NOT NULL DEFAULT 'number',
  availability_status TEXT NOT NULL DEFAULT 'ready',
  null_strategy TEXT NOT NULL DEFAULT 'show_null',
  source_type TEXT NOT NULL,
  source_ref_id TEXT,
  snapshot_date DATE NOT NULL,
  caliber_version TEXT NOT NULL DEFAULT 'v1.4.17',
  quality_dimension TEXT,
  data_quality_score NUMERIC(5,2),
  group_by TEXT NOT NULL DEFAULT 'project',
  group_key TEXT,
  group_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE metric_value_snapshots
  DROP CONSTRAINT IF EXISTS metric_value_snapshots_availability_status_check;

ALTER TABLE metric_value_snapshots
  ADD CONSTRAINT metric_value_snapshots_availability_status_check
  CHECK (availability_status IN (
    'ready',
    'insufficient_data',
    'not_applicable',
    'data_pending',
    'source_unavailable',
    'low_confidence'
  ));

ALTER TABLE project_daily_snapshot
  ADD COLUMN IF NOT EXISTS metric_availability JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metric_registry_version TEXT NOT NULL DEFAULT 'v1.4.17',
  ADD COLUMN IF NOT EXISTS metric_snapshot_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_metric_value_snapshots_project_date
  ON metric_value_snapshots(project_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_metric_value_snapshots_metric_date
  ON metric_value_snapshots(metric_key, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_metric_value_snapshots_availability
  ON metric_value_snapshots(project_id, availability_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_value_snapshots_scope
  ON metric_value_snapshots(project_id, metric_key, snapshot_date, caliber_version, group_by, COALESCE(group_key, ''));

INSERT INTO metric_caliber_versions (
  version_key,
  version_name,
  metric_count,
  change_reason,
  metadata
) VALUES (
  'v1.4.17',
  'v1.4.17 Metric Registry (v1.4.21 extended materials)',
  31,
  'Unified metric caliber registry with full material coverage',
  jsonb_build_object('source', 'metricRegistryService')
)
ON CONFLICT (version_key) DO UPDATE SET
  version_name = EXCLUDED.version_name,
  change_reason = EXCLUDED.change_reason,
  metadata = EXCLUDED.metadata;

COMMENT ON TABLE metric_caliber_versions IS '缁熻鎸囨爣鍙ｅ緞鐗堟湰琛紝璁板綍鎸囨爣瀹氫箟鍜屽彛寰勭増鏈?;
COMMENT ON TABLE metric_value_snapshots IS '缁熻鎸囨爣鍊煎揩鐓ц〃锛屼繚瀛樻寜椤圭洰銆佹棩鏈熴€佺淮搴﹀垏鐗囧悗鐨勬寚鏍囧€?;
COMMENT ON COLUMN project_daily_snapshot.metric_availability IS 'v1.4.17 鎸囨爣鍙敤鎬х姸鎬佸揩鐓э紝鎸?metric_key 瀛樺偍 ready/insufficient_data 绛夌姸鎬?;
COMMENT ON COLUMN project_daily_snapshot.metric_registry_version IS '鐢熸垚璇ユ棩鎶ュ揩鐓ф椂浣跨敤鐨勬寚鏍囧彛寰勭増鏈?;
COMMENT ON COLUMN project_daily_snapshot.metric_snapshot_version IS '鎸囨爣蹇収缁撴瀯鐗堟湰';

COMMIT;


-- ============================================================
-- Source: 135a_v1472_template_lineage_fields.sql
-- ============================================================
-- 135_v1472_template_lineage_fields.sql
-- v1.4.7.2 搂13.7 + v1.4.7.3 搂13.2: Template lineage fields on tasks and task_baselines

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source_template_id UUID,
  ADD COLUMN IF NOT EXISTS source_template_node_id UUID,
  ADD COLUMN IF NOT EXISTS generation_batch_id UUID;

ALTER TABLE task_baselines
  ADD COLUMN IF NOT EXISTS generation_batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_tasks_generation_batch
  ON tasks(generation_batch_id) WHERE generation_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_source_template
  ON tasks(source_template_id) WHERE source_template_id IS NOT NULL;

COMMIT;


-- ============================================================
-- Source: 136_v1472_wbs_template_generation.sql
-- ============================================================
-- v1.4.7.2: standard WBS template catalog and template generation contracts.

ALTER TABLE wbs_templates
  ADD COLUMN IF NOT EXISTS standard_catalog_code TEXT,
  ADD COLUMN IF NOT EXISTS catalog_scope TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS source_standard TEXT,
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE wbs_template_nodes
  ADD COLUMN IF NOT EXISTS stable_code TEXT,
  ADD COLUMN IF NOT EXISTS category_type TEXT,
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID REFERENCES engineering_categories(id),
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT,
  ADD COLUMN IF NOT EXISTS source_standard TEXT,
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS source_clause_ref TEXT,
  ADD COLUMN IF NOT EXISTS default_duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS default_responsible_unit_role TEXT,
  ADD COLUMN IF NOT EXISTS default_dependency_mode TEXT NOT NULL DEFAULT 'FS',
  ADD COLUMN IF NOT EXISTS precondition_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS acceptance_link_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_milestone BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_needed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS web_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deprecated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_wbs_template_nodes_category_type'
  ) THEN
    ALTER TABLE wbs_template_nodes
      ADD CONSTRAINT chk_wbs_template_nodes_category_type
      CHECK (
        category_type IS NULL
        OR category_type IN ('division','sub_division','item_work','process','activity_step','custom')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_wbs_template_nodes_dependency_mode'
  ) THEN
    ALTER TABLE wbs_template_nodes
      ADD CONSTRAINT chk_wbs_template_nodes_dependency_mode
      CHECK (default_dependency_mode IN ('FS','SS','FF','SF'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wbs_templates_standard_catalog_code
  ON wbs_templates(standard_catalog_code)
  WHERE standard_catalog_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_stable_code
  ON wbs_template_nodes(template_id, stable_code)
  WHERE stable_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_category_type
  ON wbs_template_nodes(template_id, category_type)
  WHERE category_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_engineering_category
  ON wbs_template_nodes(engineering_category_id)
  WHERE engineering_category_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wbs_template_candidate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('task_list','baseline')),
  event_type TEXT NOT NULL DEFAULT 'template_generate_commit',
  generation_batch_id TEXT,
  template_id TEXT,
  selected_node_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  attach_under_row_id TEXT,
  generated_row_count INTEGER NOT NULL DEFAULT 0,
  retained_row_count INTEGER NOT NULL DEFAULT 0,
  rejected_row_count INTEGER NOT NULL DEFAULT 0,
  pending_row_count INTEGER NOT NULL DEFAULT 0,
  generated_entity_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wbs_template_candidate_events_project
  ON wbs_template_candidate_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wbs_template_candidate_events_template
  ON wbs_template_candidate_events(template_id)
  WHERE template_id IS NOT NULL;


-- ============================================================
-- Source: 136a_v1472_wbs_template_candidates.sql
-- ============================================================
-- 136_v1472_wbs_template_candidates.sql
-- v1.4.7.2 搂13.3 / v1.4.7.3 搂13.3: Template candidate events

BEGIN;

CREATE TABLE IF NOT EXISTS wbs_template_candidate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('task_list','baseline')),
  event_type TEXT NOT NULL DEFAULT 'template_generate_commit',
  generation_batch_id TEXT,
  template_id TEXT,
  selected_node_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  attach_under_row_id TEXT,
  generated_row_count INTEGER NOT NULL DEFAULT 0,
  retained_row_count INTEGER NOT NULL DEFAULT 0,
  rejected_row_count INTEGER NOT NULL DEFAULT 0,
  pending_row_count INTEGER NOT NULL DEFAULT 0,
  generated_entity_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_template_candidate_project
  ON wbs_template_candidate_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_candidate_batch
  ON wbs_template_candidate_events(generation_batch_id)
  WHERE generation_batch_id IS NOT NULL;

-- ============================================================
-- v1.4.7.3 搂13.3: Aggregation table for template candidates
-- ============================================================
CREATE TABLE IF NOT EXISTS wbs_template_candidate_aggregations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id TEXT,
  period_month TEXT NOT NULL,
  total_candidates INT NOT NULL DEFAULT 0,
  accepted_candidates INT NOT NULL DEFAULT 0,
  rejected_candidates INT NOT NULL DEFAULT 0,
  pending_candidates INT NOT NULL DEFAULT 0,
  acceptance_rate REAL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_agg_unique
  ON wbs_template_candidate_aggregations(project_id, template_id, period_month);

COMMIT;


-- ============================================================
-- Source: 137_company_workspace_isolation.sql
-- ============================================================
-- v1.4.20 澶氬叕鍙哥┖闂翠笌鏁版嵁闅旂搴曞骇
-- 鐩爣锛氬厛寤虹珛鍏徃绌洪棿锛屽啀璁╅」鐩€侀」鐩潈闄愩€佸叕鍙哥骇姹囨€婚兘鍏峰 company_id 杈圭晫銆?
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_id UUID;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_owner_id_fkey,
  ADD CONSTRAINT projects_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.users(id);

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  owner_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_status_check CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE IF NOT EXISTS public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'regular',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_members_role_check CHECK (role IN ('company_admin', 'regular')),
  CONSTRAINT company_members_status_check CHECK (status IN ('active', 'inactive')),
  CONSTRAINT company_members_unique_user UNIQUE (company_id, user_id)
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS project_visibility TEXT NOT NULL DEFAULT 'private';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL;

DO $$
DECLARE
  default_company_id UUID;
  default_owner_id UUID;
BEGIN
  SELECT id INTO default_owner_id
  FROM public.users
  WHERE COALESCE(global_role, CASE WHEN role IN ('owner', 'admin') THEN 'company_admin' ELSE 'regular' END) = 'company_admin'
  ORDER BY joined_at ASC NULLS LAST, id ASC
  LIMIT 1;

  IF default_owner_id IS NULL THEN
    SELECT id INTO default_owner_id
    FROM public.users
    ORDER BY joined_at ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  SELECT id INTO default_company_id
  FROM public.companies
  WHERE name = '榛樿鍏徃'
  ORDER BY created_at ASC
  LIMIT 1;

  IF default_company_id IS NULL THEN
    INSERT INTO public.companies (id, name, owner_id)
    VALUES (gen_random_uuid(), '榛樿鍏徃', default_owner_id)
    RETURNING id INTO default_company_id;
  END IF;

  UPDATE public.projects
  SET company_id = default_company_id
  WHERE company_id IS NULL;

  INSERT INTO public.company_members (company_id, user_id, role, status)
  SELECT DISTINCT
    default_company_id,
    u.id,
    CASE
      WHEN COALESCE(u.global_role, CASE WHEN u.role IN ('owner', 'admin') THEN 'company_admin' ELSE 'regular' END) = 'company_admin'
        THEN 'company_admin'
      ELSE 'regular'
    END,
    'active'
  FROM public.users u
  ON CONFLICT (company_id, user_id)
  DO UPDATE SET
    role = CASE
      WHEN EXCLUDED.role = 'company_admin' THEN 'company_admin'
      ELSE public.company_members.role
    END,
    status = 'active',
    updated_at = NOW();

  UPDATE public.users
  SET last_active_company_id = default_company_id
  WHERE last_active_company_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = default_company_id
        AND cm.user_id = public.users.id
        AND cm.status = 'active'
    );
END $$;

ALTER TABLE public.projects
  ALTER COLUMN company_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_project_visibility_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_project_visibility_check
      CHECK (project_visibility IN ('private', 'company_visible', 'invite_only'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(status);
CREATE INDEX IF NOT EXISTS idx_company_members_user ON public.company_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_company_members_company_role ON public.company_members(company_id, role, status);
CREATE INDEX IF NOT EXISTS idx_projects_company ON public.projects(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_company_visibility ON public.projects(company_id, project_visibility);


-- ============================================================
-- Source: 137a_v1413_notification_lifecycle_fields.sql
-- ============================================================
-- 137_v1413_notification_lifecycle_fields.sql
-- v1.4.13: Notification lifecycle, touchpoint, scope, dedupe hardening

BEGIN;

-- ============================================================
-- New fields
-- ============================================================
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS touchpoint_type TEXT NOT NULL DEFAULT 'persistent',
  ADD COLUMN IF NOT EXISTS scope_type TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS target_route TEXT,
  ADD COLUMN IF NOT EXISTS target_label TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ============================================================
-- Backfill
-- ============================================================
UPDATE notifications SET lifecycle_status = 'active' WHERE lifecycle_status IS NULL;
UPDATE notifications SET touchpoint_type = 'persistent' WHERE touchpoint_type IS NULL;
UPDATE notifications SET scope_type = 'project' WHERE scope_type IS NULL;

-- Auto-backfill company_id from project_id
UPDATE notifications n SET company_id = p.company_id
FROM projects p
WHERE n.project_id = p.id AND n.company_id IS NULL AND n.project_id IS NOT NULL;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_notifications_project_lifecycle
  ON notifications(project_id, lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_scope_lifecycle
  ON notifications(company_id, scope_type, lifecycle_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_project_type_lifecycle
  ON notifications(project_id, notification_type, lifecycle_status);

CREATE INDEX IF NOT EXISTS idx_notifications_source_identity
  ON notifications(project_id, source_entity_type, source_entity_id, type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_active_project_dedupe
  ON notifications(company_id, project_id, dedupe_key)
  WHERE lifecycle_status = 'active'
    AND scope_type = 'project'
    AND company_id IS NOT NULL
    AND project_id IS NOT NULL
    AND dedupe_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_active_system_dedupe
  ON notifications(scope_type, dedupe_key)
  WHERE lifecycle_status = 'active'
    AND scope_type = 'system'
    AND company_id IS NULL
    AND project_id IS NULL
    AND dedupe_key IS NOT NULL;

-- ============================================================
-- Company_id auto-fill trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.fill_notification_company_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM projects WHERE id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_fill_notification_company_id ON notifications;
CREATE TRIGGER trigger_fill_notification_company_id
  BEFORE INSERT OR UPDATE ON notifications
  FOR EACH ROW
  WHEN (NEW.company_id IS NULL)
  EXECUTE FUNCTION public.fill_notification_company_id();

-- ============================================================
-- Backfill old notifications lifecycle_status from status/fields
-- ============================================================
UPDATE notifications SET lifecycle_status = 'archived'
  WHERE lifecycle_status = 'active'
    AND (status = 'archived' OR status = 'resolved' OR status = 'closed')
    AND source_entity_type != 'warning';

UPDATE notifications SET lifecycle_status = 'resolved'
  WHERE lifecycle_status = 'active'
    AND (resolved_at IS NOT NULL OR status = 'resolved')
    AND source_entity_type = 'warning';

UPDATE notifications SET lifecycle_status = 'archived'
  WHERE lifecycle_status = 'active'
    AND updated_at < NOW() - INTERVAL '90 days';

COMMIT;


-- ============================================================
-- Source: 138_add_notifications_company_scope.sql
-- ============================================================
-- v1.4.13 / v1.4.20: notifications must respect company workspace isolation.

ALTER TABLE IF EXISTS public.notifications
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL;

UPDATE public.notifications n
   SET company_id = p.company_id
  FROM public.projects p
 WHERE n.company_id IS NULL
   AND n.project_id = p.id
   AND p.company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_notification_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT p.company_id
      INTO NEW.company_id
      FROM public.projects p
     WHERE p.id = NEW.project_id
     LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_set_company_id ON public.notifications;
CREATE TRIGGER trg_notifications_set_company_id
BEFORE INSERT OR UPDATE OF project_id, company_id ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_notification_company_id();

CREATE INDEX IF NOT EXISTS idx_notifications_company_created
  ON public.notifications(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_project_status
  ON public.notifications(company_id, project_id, status, created_at DESC);


-- ============================================================
-- Source: 138a_v1413_reminder_tables.sql
-- ============================================================
-- 138_v1413_reminder_tables.sql
-- v1.4.13: Reminder preferences + dismissals tables

BEGIN;

CREATE TABLE IF NOT EXISTS reminder_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  reminder_days_before INT NOT NULL DEFAULT 3,
  popup_enabled BOOLEAN NOT NULL DEFAULT true,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_pref_user_project
  ON reminder_preferences(user_id, project_id);

CREATE TABLE IF NOT EXISTS reminder_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  source_entity_type TEXT,
  source_entity_id TEXT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminder_dismiss_user
  ON reminder_dismissals(user_id, dismissed_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminder_dismiss_source
  ON reminder_dismissals(source_entity_type, source_entity_id)
  WHERE source_entity_type IS NOT NULL AND source_entity_id IS NOT NULL;

COMMIT;


-- ============================================================
-- Source: 139_add_wbs_template_company_scope.sql
-- ============================================================
-- v1.4.7.2 / v1.4.18 / v1.4.20: WBS templates need explicit company scope.

ALTER TABLE public.wbs_templates
  ADD COLUMN IF NOT EXISTS project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_scope TEXT NOT NULL DEFAULT 'project';

UPDATE public.wbs_templates wt
   SET company_id = p.company_id
  FROM public.projects p
 WHERE wt.company_id IS NULL
   AND wt.project_id = p.id
   AND p.company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_wbs_template_company_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.project_id IS NOT NULL THEN
    SELECT p.company_id
      INTO NEW.company_id
      FROM public.projects p
     WHERE p.id = NEW.project_id
     LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wbs_templates_set_company_id ON public.wbs_templates;
CREATE TRIGGER trg_wbs_templates_set_company_id
BEFORE INSERT OR UPDATE OF project_id, company_id ON public.wbs_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_wbs_template_company_id();

CREATE INDEX IF NOT EXISTS idx_wbs_templates_company_scope
  ON public.wbs_templates(company_id, catalog_scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wbs_templates_company_project
  ON public.wbs_templates(company_id, project_id, deleted_at);


-- ============================================================
-- Source: 139a_v1421_material_lifecycle_fields.sql
-- ============================================================
-- 139_v1421_material_lifecycle_fields.sql
-- v1.4.21: Material record lifecycle, retention, and quality fields

BEGIN;

ALTER TABLE project_materials
  ADD COLUMN IF NOT EXISTS record_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at_trigger TIMESTAMPTZ;

-- Backfill record_status
UPDATE project_materials SET record_status = 'active' WHERE record_status IS NULL;

-- Backfill lifecycle_status from record_status
UPDATE project_materials SET lifecycle_status = 'archived' WHERE lifecycle_status = 'active' AND record_status IN ('inactive', 'voided', 'deleted');
UPDATE project_materials SET lifecycle_status = 'voided' WHERE lifecycle_status = 'active' AND record_status = 'voided';

-- Index for active-only queries
CREATE INDEX IF NOT EXISTS idx_materials_active
  ON project_materials(project_id, record_status)
  WHERE record_status = 'active';

-- Data quality rules for materials (v1.4.16 integration)
INSERT INTO data_quality_rule_registry (rule_code, rule_type, dimension, severity, description, auto_resolve_condition) VALUES
  ('MATERIAL_SPECIALTY_MISSING', 'completeness', 'completeness', 'warning', 'Material missing specialty type', 'specialty_type IS NOT NULL'),
  ('MATERIAL_UNIT_MISSING', 'completeness', 'completeness', 'warning', 'Material missing participant unit', 'participant_unit_id IS NOT NULL'),
  ('MATERIAL_ARRIVAL_OVERDUE', 'staleness', 'timeliness', 'warning', 'Material past expected arrival date', 'actual_arrival_date IS NOT NULL'),
  ('MATERIAL_SAMPLE_PENDING', 'staleness', 'timeliness', 'info', 'Material sample confirmation pending beyond expected date', 'sample_confirmed = true')
ON CONFLICT (rule_code) DO NOTHING;

COMMIT;


-- ============================================================
-- Source: 140_v1418_duration_experience_tables.sql
-- ============================================================
-- 140_v1418_duration_experience_tables.sql
-- v1.4.18: Duration experience samples + benchmarks + forecasts

BEGIN;

-- ============================================================
-- Duration experience samples (Phase 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_experience_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  template_node_id UUID,
  wbs_node_type TEXT NOT NULL DEFAULT 'process',
  generation_depth INT,
  parent_template_node_id UUID,
  parent_standard_work_code TEXT,
  standard_work_code TEXT,
  standard_work_name TEXT,
  engineering_category_id UUID,
  planned_duration INT NOT NULL,
  actual_duration INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  source_type TEXT NOT NULL DEFAULT 'task_completion',
  sample_strength TEXT NOT NULL DEFAULT 'strong',
  sample_status TEXT NOT NULL DEFAULT 'active',
  confidence_level TEXT NOT NULL DEFAULT 'medium',
  confidence_score INT DEFAULT 50,
  included_in_benchmark BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  superseded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_sample_active
  ON duration_experience_samples(task_id, source_type)
  WHERE sample_status = 'active';

CREATE INDEX IF NOT EXISTS idx_duration_sample_template
  ON duration_experience_samples(template_node_id, wbs_node_type)
  WHERE sample_status = 'active';

-- ============================================================
-- Duration benchmarks (Phase 4)
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  benchmark_key TEXT NOT NULL,
  benchmark_version TEXT NOT NULL DEFAULT 'v1',
  template_node_id UUID,
  engineering_category_id UUID,
  project_context TEXT DEFAULT 'all',
  wbs_node_type TEXT NOT NULL DEFAULT 'process',
  sample_count INT NOT NULL DEFAULT 0,
  p50_days INT,
  p75_days INT,
  p80_days INT,
  mean_days REAL,
  variance REAL,
  coefficient_of_variation REAL,
  confidence_level TEXT NOT NULL DEFAULT 'low',
  confidence_score INT DEFAULT 30,
  is_current BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS uq_duration_benchmark_current;
DROP INDEX IF EXISTS uq_duration_benchmark_current_company;
DROP INDEX IF EXISTS uq_duration_benchmark_current_global;
DROP INDEX IF EXISTS uq_duration_benchmark_current_project;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_project
  ON duration_benchmarks(project_id, benchmark_key)
  WHERE project_id IS NOT NULL AND is_current = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_company
  ON duration_benchmarks(company_id, benchmark_key)
  WHERE company_id IS NOT NULL AND project_id IS NULL AND is_current = true AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_benchmark_current_global
  ON duration_benchmarks(benchmark_key)
  WHERE company_id IS NULL AND project_id IS NULL AND is_current = true AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_duration_benchmarks_project_current
  ON duration_benchmarks(project_id, benchmark_key, is_current, is_active)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_duration_benchmark_template
  ON duration_benchmarks(company_id, template_node_id, wbs_node_type, is_current);

-- ============================================================
-- Task duration forecasts (Phase 5)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_duration_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  recommended_duration_days INT,
  conservative_duration_days INT,
  confidence_level TEXT NOT NULL DEFAULT 'medium',
  confidence_score INT DEFAULT 50,
  forecast_source TEXT NOT NULL DEFAULT 'benchmark',
  benchmark_key TEXT,
  business_reason TEXT,
  forecast_model_profile_id UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duration_forecast_task
  ON task_duration_forecasts(task_id, is_current)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_duration_forecast_project
  ON task_duration_forecasts(project_id, generated_at DESC);

-- ============================================================
-- Duration suggestion overrides (Phase 5)
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_suggestion_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  override_key TEXT NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  template_node_id UUID,
  recommended_duration_days INT NOT NULL,
  conservative_duration_days INT,
  reason TEXT,
  override_status TEXT NOT NULL DEFAULT 'active',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS uq_duration_override_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_override_active_project
  ON duration_suggestion_overrides(project_id, override_key)
  WHERE project_id IS NOT NULL AND override_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_override_active_company
  ON duration_suggestion_overrides(company_id, override_key)
  WHERE company_id IS NOT NULL AND project_id IS NULL AND override_status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_override_active_global
  ON duration_suggestion_overrides(override_key)
  WHERE company_id IS NULL AND project_id IS NULL AND override_status = 'active';

-- ============================================================
-- Duration forecast model profiles (Phase 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS duration_forecast_model_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  description TEXT,
  wbs_node_type TEXT NOT NULL DEFAULT 'process',
  confidence_weight REAL DEFAULT 1.0,
  model_status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_forecast_model_profiles_key
  ON duration_forecast_model_profiles(model_key);

INSERT INTO duration_forecast_model_profiles (model_key, model_name, description, wbs_node_type) VALUES
  ('benchmark_p50', '缁忛獙P50', '涓綅缁忛獙宸ユ湡', 'process'),
  ('benchmark_p75', '缁忛獙P75', '淇濆畧缁忛獙宸ユ湡', 'process'),
  ('p75_p50_ratio', 'P75/P50姣旂巼', '椋庨櫓淇绯绘暟', 'process'),
  ('calendar_productivity', '鏃ュ巻鐢熶骇鐜?, '鎸夊伐浣滄棩/鑷劧鏃ヤ慨姝?, 'process')
ON CONFLICT (model_key) DO NOTHING;

COMMIT;


-- ============================================================
-- Source: 141_v1419_health_snapshot_fields.sql
-- ============================================================
-- 141_v1419_health_snapshot_fields.sql
-- v1.4.19: Project health + deviation system -- daily snapshot hardening

BEGIN;

ALTER TABLE public.project_daily_snapshot
  ADD COLUMN IF NOT EXISTS business_health_score INTEGER,
  ADD COLUMN IF NOT EXISTS health_confidence_score INTEGER,
  ADD COLUMN IF NOT EXISTS health_confidence_flag TEXT,
  ADD COLUMN IF NOT EXISTS health_basis JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deviation_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS health_caliber_version TEXT,
  ADD COLUMN IF NOT EXISTS deviation_caliber_version TEXT;

UPDATE public.project_daily_snapshot
  SET health_caliber_version = COALESCE(health_caliber_version, 'legacy'),
      deviation_caliber_version = COALESCE(deviation_caliber_version, 'legacy')
  WHERE health_caliber_version IS NULL OR deviation_caliber_version IS NULL;

ALTER TABLE public.project_daily_snapshot
  ALTER COLUMN health_caliber_version SET DEFAULT 'v1.4.19',
  ALTER COLUMN deviation_caliber_version SET DEFAULT 'v1.4.19';

-- Constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_daily_snapshot_health_confidence_flag_check'
  ) THEN
    ALTER TABLE public.project_daily_snapshot
      ADD CONSTRAINT project_daily_snapshot_health_confidence_flag_check
      CHECK (health_confidence_flag IS NULL OR health_confidence_flag IN ('high', 'medium', 'low', 'unavailable'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_daily_snapshot_business_health_score_check'
  ) THEN
    ALTER TABLE public.project_daily_snapshot
      ADD CONSTRAINT project_daily_snapshot_business_health_score_check
      CHECK (business_health_score IS NULL OR (business_health_score >= 0 AND business_health_score <= 100));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_daily_snapshot_health_confidence_score_check'
  ) THEN
    ALTER TABLE public.project_daily_snapshot
      ADD CONSTRAINT project_daily_snapshot_health_confidence_score_check
      CHECK (health_confidence_score IS NULL OR (health_confidence_score >= 0 AND health_confidence_score <= 100));
  END IF;
END $$;

COMMIT;


-- ============================================================
-- Source: 142_v1420_permission_role_system.sql
-- ============================================================
-- 142_v1420_permission_role_system.sql
-- v1.4.20: Permission role + collaboration system foundation

BEGIN;

-- ============================================================
-- Company members table (cross-project membership)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  permission_level TEXT NOT NULL DEFAULT 'regular',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_member
  ON company_members(company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_company_member_user
  ON company_members(user_id);

-- ============================================================
-- Project member role enhancements
-- ============================================================
ALTER TABLE project_invitations
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ============================================================
-- Permission role lookup tables
-- ============================================================
CREATE TABLE IF NOT EXISTS permission_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO permission_roles (role_key, label, description, is_default, sort_order) VALUES
  ('project_owner', '椤圭洰璐熻矗浜?, '瀹屾暣椤圭洰绠＄悊鏉冮檺', false, 1),
  ('project_editor', '缂栬緫鑰?, '鍙紪杈戦」鐩笟鍔℃暟鎹?, true, 2),
  ('company_admin', '鍏徃绠＄悊鍛?, '鍏徃绾х鐞嗘潈闄?, false, 4)
ON CONFLICT (role_key) DO NOTHING;

-- ============================================================
-- Company-level workspace member management
-- ============================================================
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

COMMIT;


-- ============================================================
-- Source: 143_v1420_workspace_tables.sql
-- ============================================================
-- 143_v1420_workspace_tables.sql
-- v1.4.20: Demo projects + company/project invitations + join requests

BEGIN;

CREATE TABLE IF NOT EXISTS demo_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  project_type TEXT,
  thumbnail_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users(id),
  recipient_email TEXT,
  recipient_user_id UUID REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'regular',
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_invite_recipient
  ON company_invitations(recipient_user_id, status);

CREATE TABLE IF NOT EXISTS project_direct_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES users(id),
  recipient_user_id UUID REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'editor',
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_direct_invite
  ON project_direct_invitations(recipient_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS company_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_join_request
  ON company_join_requests(company_id, user_id, status)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS project_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_join_request
  ON project_join_requests(project_id, user_id, status)
  WHERE status = 'pending';

-- Seed demo projects
INSERT INTO demo_projects (name, description, project_type, sort_order) VALUES
  ('浣忓畢灏忓尯缁煎悎椤圭洰', '鍏稿瀷浣忓畢寤虹瓚宸ョ▼绀轰緥', 'residential', 1),
  ('鍟嗕笟缁煎悎浣撻」鐩?, '鍟嗕笟寤虹瓚鍏ㄧ敓鍛藉懆鏈熺ず渚?, 'commercial', 2),
  ('宸ヤ笟鍘傛埧椤圭洰', '宸ヤ笟寤虹瓚鏂藉伐绠＄悊绀轰緥', 'industrial', 3)
ON CONFLICT DO NOTHING;
COMMIT;


-- ============================================================
-- Source: 144_v1420_multi_company_isolation_followups.sql
-- ============================================================
-- 144_v1420_multi_company_isolation_followups.sql
-- v1.4.20: follow-up guards for multi-company workspace isolation

BEGIN;

-- Company workspaces need explicit discovery and join-policy fields. Earlier
-- company-space migrations only had status, while the workspace API already
-- writes these fields for new companies.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS discoverability TEXT NOT NULL DEFAULT 'invite_only',
  ADD COLUMN IF NOT EXISTS join_policy TEXT NOT NULL DEFAULT 'approval_required';

UPDATE companies
   SET is_active = CASE
     WHEN status = 'inactive' THEN false
     ELSE COALESCE(is_active, true)
   END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_discoverability_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_discoverability_check
      CHECK (discoverability IN ('public', 'searchable', 'invite_only', 'hidden'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_join_policy_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_join_policy_check
      CHECK (join_policy IN ('open', 'approval_required', 'invite_only'));
  END IF;
END $$;

-- Company-level reminder preferences have project_id = NULL, so they need a
-- company-aware uniqueness guard separate from project-level preferences.
CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_pref_user_company_global
  ON reminder_preferences(user_id, company_id)
  WHERE project_id IS NULL;

-- Workspace invitation / join-request tables must carry the same company
-- boundary as projects, otherwise cross-company workbench actions can collide.
ALTER TABLE project_direct_invitations
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE project_direct_invitations pdi
   SET company_id = p.company_id
  FROM projects p
 WHERE pdi.project_id = p.id
   AND pdi.company_id IS NULL;

ALTER TABLE project_direct_invitations
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE project_join_requests
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE project_join_requests pjr
   SET company_id = p.company_id
  FROM projects p
 WHERE pjr.project_id = p.id
   AND pjr.company_id IS NULL;

ALTER TABLE project_join_requests
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE company_join_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE project_invitations
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id) ON DELETE CASCADE;

UPDATE project_invitations pi
   SET company_id = p.company_id
  FROM projects p
 WHERE pi.project_id = p.id
   AND pi.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_direct_invite_company
  ON project_direct_invitations(company_id, recipient_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_join_requests_company
  ON project_join_requests(company_id, project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_invitations_company
  ON project_invitations(company_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_companies_discovery
  ON companies(is_active, discoverability, name);

COMMIT;


-- ============================================================
-- Source: 145_v1413_notification_user_states.sql
-- ============================================================
-- 145_v1413_notification_user_states.sql
-- v1.4.13: Per-user notification lifecycle states (read, acknowledged, muted, hidden)
-- Replaces the legacy metadata.personal_states JSON fallback

BEGIN;

CREATE TABLE IF NOT EXISTS notification_user_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_acknowledged BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  muted_at TIMESTAMPTZ,
  muted_until TIMESTAMPTZ,
  hidden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one state row per user per notification
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_user_states
  ON notification_user_states(notification_id, user_id);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_notification_user_states_user_read
  ON notification_user_states(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_user_states_user_muted
  ON notification_user_states(user_id, is_muted);

CREATE INDEX IF NOT EXISTS idx_notification_user_states_user_hidden
  ON notification_user_states(user_id, is_hidden);

CREATE INDEX IF NOT EXISTS idx_notification_user_states_notification
  ON notification_user_states(notification_id, user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notification_user_states_updated_at ON notification_user_states;
CREATE TRIGGER trigger_notification_user_states_updated_at
  BEFORE UPDATE ON notification_user_states
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Backfill from legacy metadata.personal_states
DO $$
DECLARE
  n record;
  state_key text;
  state_value jsonb;
  raw_states jsonb;
BEGIN
  FOR n IN SELECT id, metadata FROM notifications WHERE metadata ? 'personal_states' LOOP
    raw_states := n.metadata->'personal_states';
    FOR state_key, state_value IN SELECT key, value FROM jsonb_each(raw_states) LOOP
      INSERT INTO notification_user_states (notification_id, user_id, is_read, is_muted, is_hidden, read_at)
      VALUES (
        n.id,
        state_key::uuid,
        COALESCE((state_value->>'isRead')::boolean, false),
        COALESCE((state_value->>'isMuted')::boolean, false),
        false,
        CASE WHEN (state_value->>'isRead')::boolean THEN now() ELSE NULL END
      )
      ON CONFLICT (notification_id, user_id) DO NOTHING;
    END LOOP;
  END LOOP;
END
$$;

COMMIT;


-- ============================================================
-- Source: 146_v1420_legacy_viewer_cleanup.sql
-- ============================================================
-- 146_v1420_legacy_viewer_cleanup.sql
-- v1.4.20: remove legacy project viewer compatibility from live data.

BEGIN;

-- Project members only support owner/editor. Legacy viewer rows are no longer
-- formal project members, so keep the audit row but make it inactive.
UPDATE public.project_members
SET is_active = FALSE,
    permission_level = NULL
WHERE LOWER(COALESCE(permission_level, '')) = 'viewer';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_members'
      AND column_name = 'role'
  ) THEN
    UPDATE public.project_members
    SET is_active = FALSE,
        role = 'editor'
    WHERE LOWER(COALESCE(role, '')) = 'viewer';
  END IF;
END $$;

-- Do not promote old viewer invitations to editor. Revoke pending/active
-- legacy invitations so they cannot create write-capable access.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_invitations'
      AND column_name = 'status'
  ) THEN
    UPDATE public.project_invitations
    SET status = 'revoked'
    WHERE LOWER(COALESCE(permission_level, '')) = 'viewer'
      AND status IN ('active', 'pending');
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_invitations'
      AND column_name = 'is_revoked'
  ) THEN
    UPDATE public.project_invitations
    SET is_revoked = TRUE
    WHERE LOWER(COALESCE(permission_level, '')) = 'viewer'
      AND COALESCE(is_revoked, FALSE) = FALSE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_invitations'
      AND column_name = 'role'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_invitations'
        AND column_name = 'status'
    ) THEN
      UPDATE public.project_invitations
      SET status = 'revoked'
      WHERE LOWER(COALESCE(role, '')) = 'viewer'
        AND status IN ('active', 'pending');
    ELSIF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_invitations'
        AND column_name = 'is_revoked'
    ) THEN
      UPDATE public.project_invitations
      SET is_revoked = TRUE
      WHERE LOWER(COALESCE(role, '')) = 'viewer'
        AND COALESCE(is_revoked, FALSE) = FALSE;
    END IF;
  END IF;
END $$;

ALTER TABLE public.project_direct_invitations
  ALTER COLUMN role SET DEFAULT 'editor';

UPDATE public.project_direct_invitations
SET status = 'revoked'
WHERE LOWER(COALESCE(role, '')) = 'viewer'
  AND status = 'pending';

COMMIT;


-- ============================================================
-- Source: 147_v1474_duration_context_fields.sql
-- ============================================================
-- 147_v1474_duration_context_fields.sql
-- v1.4.7.4 + v1.4.18: persist unified duration context and forecast outputs

BEGIN;

ALTER TABLE task_duration_forecasts
  ADD COLUMN IF NOT EXISTS remaining_duration_days INT,
  ADD COLUMN IF NOT EXISTS forecast_finish_date DATE,
  ADD COLUMN IF NOT EXISTS forecast_delay_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS factor_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS calculation_context JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_duration_forecast_delay
  ON task_duration_forecasts(project_id, forecast_delay_days DESC, generated_at DESC)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_duration_forecast_context_adjusted_by
  ON task_duration_forecasts USING GIN (calculation_context);

COMMIT;


-- ============================================================
-- Source: 148_v1421_material_arrival_to_condition.sql
-- ============================================================
-- 148_v1421_material_arrival_to_condition.sql
-- v1.4.21: audit material arrival -> task condition auto-unlock chain

BEGIN;

CREATE TABLE IF NOT EXISTS public.material_arrival_to_condition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.project_materials(id) ON DELETE CASCADE,
  condition_id UUID NOT NULL REFERENCES public.task_conditions(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unlocked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source_event_type TEXT NOT NULL DEFAULT 'material_arrival_to_condition',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_material_arrival_to_condition
  ON public.material_arrival_to_condition(material_id, condition_id);

CREATE INDEX IF NOT EXISTS idx_material_arrival_to_condition_project
  ON public.material_arrival_to_condition(project_id, unlocked_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_arrival_to_condition_task
  ON public.material_arrival_to_condition(task_id, unlocked_at DESC);

COMMIT;


-- ============================================================
-- Source: 149_v1474_algorithm_seed_governance.sql
-- ============================================================
-- v1.4.7.4 algorithm seed governance and self-upgrade mechanism
-- System TS seeds remain immutable fallbacks. Active rules are governed through
-- versioned seed imports, automatic candidate gates, quarantine, and project/company overrides.

CREATE TABLE IF NOT EXISTS public.algorithm_seed_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_type TEXT NOT NULL,
  seed_version TEXT NOT NULL,
  seed_scope TEXT NOT NULL DEFAULT 'algorithm_auxiliary',
  source_standards JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'deprecated', 'rejected')),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  imported_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  published_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seed_type, seed_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_seed_versions_current
  ON public.algorithm_seed_versions(seed_type)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_versions_type_status
  ON public.algorithm_seed_versions(seed_type, status, is_current);

CREATE TABLE IF NOT EXISTS public.algorithm_seed_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_version_id UUID NOT NULL REFERENCES public.algorithm_seed_versions(id) ON DELETE CASCADE,
  seed_type TEXT NOT NULL,
  stable_code TEXT NOT NULL,
  rule_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_standard TEXT NULL,
  source_version TEXT NULL,
  source_clause_ref TEXT NULL,
  evidence_source_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low')),
  web_verified BOOLEAN NOT NULL DEFAULT TRUE,
  review_needed BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deprecated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seed_version_id, stable_code)
);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_records_type_status
  ON public.algorithm_seed_records(seed_type, status);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_records_stable_code
  ON public.algorithm_seed_records(seed_type, stable_code);

CREATE TABLE IF NOT EXISTS public.algorithm_seed_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_version_id UUID NULL REFERENCES public.algorithm_seed_versions(id) ON DELETE SET NULL,
  seed_type TEXT NOT NULL,
  import_source TEXT NOT NULL DEFAULT 'ts_seed',
  expected_counts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_counts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_import_logs_type_time
  ON public.algorithm_seed_import_logs(seed_type, imported_at DESC);

CREATE TABLE IF NOT EXISTS public.algorithm_seed_upgrade_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_type TEXT NOT NULL,
  stable_code TEXT NOT NULL,
  candidate_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_source TEXT NOT NULL
    CHECK (candidate_source IN ('project_history', 'company_history', 'standard_update', 'system_observation')),
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sample_count INTEGER NOT NULL DEFAULT 0,
  variance NUMERIC NULL,
  confidence_level TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence_level IN ('high', 'medium', 'low')),
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_policy TEXT NOT NULL DEFAULT 'auto_govern'
    CHECK (action_policy IN ('candidate_only', 'auto_govern')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'candidate_only', 'auto_published', 'quarantined', 'rejected', 'superseded')),
  auto_score NUMERIC NOT NULL DEFAULT 0,
  auto_governance_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  quarantine_reason TEXT NULL,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_governed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_candidates_scope_status
  ON public.algorithm_seed_upgrade_candidates(seed_type, status, company_id, project_id);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_candidates_stable_code
  ON public.algorithm_seed_upgrade_candidates(seed_type, stable_code);

CREATE TABLE IF NOT EXISTS public.algorithm_seed_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_type TEXT NOT NULL,
  stable_code TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project', 'company')),
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  override_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_candidate_id UUID NULL REFERENCES public.algorithm_seed_upgrade_candidates(id) ON DELETE SET NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deprecated')),
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  published_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  auto_governance_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (scope_type = 'project' AND project_id IS NOT NULL)
    OR (scope_type = 'company' AND company_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_seed_overrides_active_project
  ON public.algorithm_seed_overrides(seed_type, stable_code, project_id)
  WHERE scope_type = 'project' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_seed_overrides_active_company
  ON public.algorithm_seed_overrides(seed_type, stable_code, company_id)
  WHERE scope_type = 'company' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_overrides_scope
  ON public.algorithm_seed_overrides(seed_type, scope_type, status, company_id, project_id);


-- ============================================================
-- Source: 150_v1418_duration_calibration_source.sql
-- ============================================================
-- 150_v1418_duration_calibration_source.sql
-- v1.4.18: keep duration provenance separate from template structure and runtime facts.

BEGIN;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

ALTER TABLE wbs_template_nodes
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

ALTER TABLE duration_experience_samples
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT;

ALTER TABLE duration_benchmarks
  ADD COLUMN IF NOT EXISTS variance REAL,
  ADD COLUMN IF NOT EXISTS coefficient_of_variation REAL,
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT;

ALTER TABLE task_duration_forecasts
  ADD COLUMN IF NOT EXISTS duration_calibration_source TEXT,
  ADD COLUMN IF NOT EXISTS duration_provenance TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_duration_provenance
  ON tasks(project_id, duration_calibration_source, duration_provenance);

CREATE INDEX IF NOT EXISTS idx_duration_benchmarks_calibration_source
  ON duration_benchmarks(duration_calibration_source, is_current, is_active);

COMMIT;


-- ============================================================
-- Source: 151_v1473_task_list_performance_indexes.sql
-- ============================================================
-- v1.4.7.3 task list performance hardening
-- Speeds up the task list cold path:
--   SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC

CREATE INDEX IF NOT EXISTS idx_tasks_project_created_at_desc
  ON public.tasks(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_project_task_date
  ON public.acceptance_plans(project_id, task_id, planned_date, created_at);

CREATE INDEX IF NOT EXISTS idx_project_entity_links_acceptance_task
  ON public.project_entity_links(project_id, target_entity_id)
  WHERE source_entity_type = 'acceptance_plan'
    AND target_entity_type = 'task'
    AND relation_type = 'covers_task'
    AND status = 'active';


-- ============================================================
-- Source: 152_v1474_project_climate_profile.sql
-- ============================================================
-- v1.4.7.4 project climate profile foundation.
-- City-level automatic inference only: no precise coordinates are persisted.

CREATE TABLE IF NOT EXISTS public.regional_climate_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province TEXT NOT NULL,
  city TEXT NULL,
  admin_code TEXT NULL,
  climate_region TEXT NOT NULL CHECK (climate_region IN ('north', 'east', 'south', 'west', 'default')),
  thermal_zone TEXT NOT NULL,
  rainy_season_months INTEGER[] NOT NULL DEFAULT '{}',
  high_temp_months INTEGER[] NOT NULL DEFAULT '{}',
  cold_weather_months INTEGER[] NOT NULL DEFAULT '{}',
  typhoon_risk_level TEXT NOT NULL DEFAULT 'none' CHECK (typhoon_risk_level IN ('none', 'low', 'medium', 'high')),
  flood_season_months INTEGER[] NOT NULL DEFAULT '{}',
  winter_shutdown_risk_level TEXT NOT NULL DEFAULT 'none' CHECK (winter_shutdown_risk_level IN ('none', 'low', 'medium', 'high')),
  climate_tags TEXT[] NOT NULL DEFAULT '{}',
  source_standard TEXT NOT NULL,
  source_version TEXT NOT NULL,
  source_clause_ref TEXT NOT NULL,
  evidence_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS regional_climate_rules_scope_unique
  ON public.regional_climate_rules (
    LOWER(province),
    COALESCE(LOWER(city), ''),
    COALESCE(admin_code, '')
  );

CREATE INDEX IF NOT EXISTS regional_climate_rules_region_idx
  ON public.regional_climate_rules (climate_region, status);

CREATE TABLE IF NOT EXISTS public.project_location_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  observed_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  province TEXT NULL,
  city TEXT NULL,
  admin_code TEXT NULL,
  accuracy_level TEXT NOT NULL DEFAULT 'city' CHECK (accuracy_level IN ('city', 'province', 'region', 'unknown')),
  source TEXT NOT NULL CHECK (source IN ('browser_geolocation', 'ip_location', 'project_location', 'system_inference')),
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  raw_source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_location_observations_project_time_idx
  ON public.project_location_observations (project_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS project_location_observations_project_city_idx
  ON public.project_location_observations (project_id, province, city);

CREATE TABLE IF NOT EXISTS public.project_climate_profiles (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  province TEXT NULL,
  city TEXT NULL,
  admin_code TEXT NULL,
  climate_region TEXT NOT NULL DEFAULT 'default' CHECK (climate_region IN ('north', 'east', 'south', 'west', 'default')),
  thermal_zone TEXT NULL,
  climate_tags TEXT[] NOT NULL DEFAULT '{}',
  rainy_season_months INTEGER[] NOT NULL DEFAULT '{}',
  high_temp_months INTEGER[] NOT NULL DEFAULT '{}',
  cold_weather_months INTEGER[] NOT NULL DEFAULT '{}',
  typhoon_risk_level TEXT NOT NULL DEFAULT 'none' CHECK (typhoon_risk_level IN ('none', 'low', 'medium', 'high')),
  flood_season_months INTEGER[] NOT NULL DEFAULT '{}',
  winter_shutdown_risk_level TEXT NOT NULL DEFAULT 'none' CHECK (winter_shutdown_risk_level IN ('none', 'low', 'medium', 'high')),
  confidence TEXT NOT NULL DEFAULT 'low' CHECK (confidence IN ('high', 'medium', 'low')),
  location_consensus_status TEXT NOT NULL DEFAULT 'default_fallback'
    CHECK (location_consensus_status IN ('city_consensus', 'province_consensus', 'single_observation', 'project_location_fallback', 'default_fallback', 'conflict')),
  observation_count INTEGER NOT NULL DEFAULT 0,
  distinct_user_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'default' CHECK (source IN ('multi_user_location', 'single_user_location', 'project_location', 'ip_location', 'default')),
  source_rule_id UUID NULL REFERENCES public.regional_climate_rules(id) ON DELETE SET NULL,
  weather_provider TEXT NULL,
  last_weather_synced_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_climate_profiles_region_idx
  ON public.project_climate_profiles (climate_region, confidence);

CREATE TABLE IF NOT EXISTS public.project_weather_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  forecast_city TEXT NULL,
  forecast_admin_code TEXT NULL,
  forecast_date DATE NOT NULL,
  min_temp_c NUMERIC NULL,
  max_temp_c NUMERIC NULL,
  precipitation_mm NUMERIC NULL,
  wind_level TEXT NULL,
  warning_tags TEXT[] NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL,
  provider_record_id TEXT NULL,
  source_url TEXT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, forecast_date, provider)
);

CREATE INDEX IF NOT EXISTS project_weather_forecasts_project_date_idx
  ON public.project_weather_forecasts (project_id, forecast_date);


-- ============================================================
-- Source: 161_v1474_calendar_weather_gap_closure.sql
-- ============================================================
-- v1.4.7.4 calendar/weather real-project gap closure.
-- Additive only: keeps live projects compatible while aligning rule payloads with persisted schema.

ALTER TABLE public.regional_climate_rules
  ADD COLUMN IF NOT EXISTS soft_soil_level INTEGER NOT NULL DEFAULT 0 CHECK (soft_soil_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS mountain_terrain BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terrain_difficulty_level INTEGER NOT NULL DEFAULT 0 CHECK (terrain_difficulty_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS seismic_intensity INTEGER NULL CHECK (seismic_intensity IS NULL OR seismic_intensity IN (6, 7, 8, 9));

ALTER TABLE public.project_climate_profiles
  ADD COLUMN IF NOT EXISTS soft_soil_level INTEGER NOT NULL DEFAULT 0 CHECK (soft_soil_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS mountain_terrain BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS terrain_difficulty_level INTEGER NOT NULL DEFAULT 0 CHECK (terrain_difficulty_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS seismic_intensity INTEGER NULL CHECK (seismic_intensity IS NULL OR seismic_intensity IN (6, 7, 8, 9));

ALTER TABLE public.project_weather_forecasts
  ADD COLUMN IF NOT EXISTS relative_humidity_percent NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS snow_depth_cm NUMERIC NULL;

ALTER TABLE public.task_baseline_items
  ADD COLUMN IF NOT EXISTS seed_versions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.monthly_plan_items
  ADD COLUMN IF NOT EXISTS seed_versions JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.site_shutdown_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('red_rainstorm', 'red_typhoon', 'compound_red_weather', 'government_order', 'manual')),
  severity TEXT NOT NULL DEFAULT 'red' CHECK (severity IN ('orange', 'red', 'black')),
  source TEXT NOT NULL DEFAULT 'weather_forecast',
  source_forecast_id UUID NULL REFERENCES public.project_weather_forecasts(id) ON DELETE SET NULL,
  source_provider TEXT NULL,
  source_url TEXT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'confirmed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, event_date, event_type, source)
);

CREATE INDEX IF NOT EXISTS idx_site_shutdown_events_project_date
  ON public.site_shutdown_events(project_id, event_date, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_shutdown_events_project_date_type_source
  ON public.site_shutdown_events(project_id, event_date, event_type, source);


-- ============================================================
-- Source: 182_task_critical_projection_columns_schema_repair.sql
-- ============================================================
-- Live schema repair for v1.4 critical-path projection fields consumed by forecasts,
-- material reminders, and schedule acceleration runtime.

ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS baseline_is_critical BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS total_float_days INTEGER,
  ADD COLUMN IF NOT EXISTS free_float_days INTEGER,
  ADD COLUMN IF NOT EXISTS successor_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS milestone_distance_days INTEGER,
  ADD COLUMN IF NOT EXISTS downstream_milestone_distance_days INTEGER,
  ADD COLUMN IF NOT EXISTS criticality_weight NUMERIC(6,3) NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_tasks_project_baseline_critical
  ON public.tasks(project_id, baseline_is_critical)
  WHERE baseline_is_critical IS TRUE;

CREATE INDEX IF NOT EXISTS idx_tasks_project_criticality_float
  ON public.tasks(project_id, total_float_days, free_float_days);

CREATE INDEX IF NOT EXISTS idx_tasks_project_milestone_distance
  ON public.tasks(project_id, downstream_milestone_distance_days, milestone_distance_days);


-- ============================================================
-- Source: 190_add_execution_reference_days.sql
-- ============================================================
-- Separate execution-forecast reference duration from new-task reference duration.

ALTER TABLE IF EXISTS public.task_duration_forecasts
  ADD COLUMN IF NOT EXISTS execution_reference_days INT;

COMMENT ON COLUMN public.task_duration_forecasts.execution_reference_days IS
  'Reference duration used by execution remaining-duration forecast; does not replace task recommended_duration_days.';


-- ============================================================
-- Source: 191_v1418_duration_algorithm_accuracy_events.sql
-- ============================================================
-- v1.4.18: unified accuracy event contract for duration algorithm engines

CREATE TABLE IF NOT EXISTS public.duration_algorithm_accuracy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  engine_code TEXT NOT NULL,
  output_kind TEXT NOT NULL,
  dedupe_key TEXT,
  prediction_basis TEXT NOT NULL DEFAULT 'runtime_snapshot',
  prediction_source TEXT NOT NULL DEFAULT 'runtime',
  model_version TEXT NOT NULL DEFAULT 'unknown',
  predicted_start_date DATE,
  predicted_finish_date DATE,
  predicted_duration_days INT,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actual_start_date DATE,
  actual_finish_date DATE,
  actual_duration_days INT,
  signed_error_days INT,
  absolute_error_days INT,
  backtest_status TEXT NOT NULL DEFAULT 'prediction_pending',
  prediction_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  backtested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_algorithm_accuracy_dedupe
  ON public.duration_algorithm_accuracy_events(engine_code, dedupe_key);

CREATE INDEX IF NOT EXISTS idx_duration_algorithm_accuracy_project
  ON public.duration_algorithm_accuracy_events(project_id, engine_code, predicted_at DESC);

CREATE INDEX IF NOT EXISTS idx_duration_algorithm_accuracy_backtest
  ON public.duration_algorithm_accuracy_events(engine_code, backtested_at DESC)
  WHERE signed_error_days IS NOT NULL;

COMMENT ON TABLE public.duration_algorithm_accuracy_events IS
  'Unified prediction/backtest event contract for duration engines: standard reference, task remaining, CPM, project remaining, and acceleration target.';

COMMENT ON COLUMN public.duration_algorithm_accuracy_events.signed_error_days IS
  'Positive means actual duration/finish was later or longer than predicted; negative means earlier or shorter.';


-- ============================================================
-- Source: 194_add_conservative_duration_to_overrides.sql
-- ============================================================
-- Keep manual duration overrides symmetric with the E1 P50/P80 reference output.

ALTER TABLE IF EXISTS public.duration_suggestion_overrides
  ADD COLUMN IF NOT EXISTS conservative_duration_days INT;

UPDATE public.duration_suggestion_overrides
SET conservative_duration_days = recommended_duration_days
WHERE conservative_duration_days IS NULL;


-- ============================================================
-- Source: 214_v14225_recommendation_actions.sql
-- ============================================================
-- v1.4.22.5: user recommendation-action facts for runtime duration engines.
-- This table records that a user adopted or declined an algorithm recommendation. It does
-- not write tasks, seeds, baselines, monthly plans, or forecast artifacts.

CREATE TABLE IF NOT EXISTS public.recommendation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  recommendation_kind TEXT NOT NULL
    CHECK (recommendation_kind IN ('schedule_acceleration', 'construction_organization_plan_network')),
  recommendation_key TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('adopted', 'declined')),
  target_end_date DATE,
  natural_end_date DATE,
  total_recover_days INTEGER,
  acceleration_target_days INTEGER,
  adopted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  adopted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_actions_unique_action UNIQUE (
    project_id,
    recommendation_kind,
    recommendation_key,
    action_type
  )
);

CREATE INDEX IF NOT EXISTS idx_recommendation_actions_project_kind
  ON public.recommendation_actions(project_id, recommendation_kind, action_type, adopted_at DESC);

ALTER TABLE public.recommendation_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recommendation_actions_select_project_members
  ON public.recommendation_actions;
CREATE POLICY recommendation_actions_select_project_members
  ON public.recommendation_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members pm
      WHERE pm.project_id = recommendation_actions.project_id
        AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS recommendation_actions_write_service_role
  ON public.recommendation_actions;
CREATE POLICY recommendation_actions_write_service_role
  ON public.recommendation_actions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.recommendation_actions IS
  'User decision facts for algorithm recommendations. schedule_acceleration adoption is the production signal that allows E5 recovery backtests to attribute actual recovery to a user-accepted acceleration recommendation; construction_organization_plan_network adopted/declined decisions record the project/site choice without automatically writing task dependencies or plan dates.';

COMMENT ON COLUMN public.recommendation_actions.recommendation_key IS
  'Stable key derived from recommendation kind and option identity; schedule acceleration uses target finish/natural finish/recoverable days, construction organization uses option/draft/publication identity to dedupe repeated decisions.';

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Source: 215_v14231_drop_execute_sql_rpc.sql
-- ============================================================
-- v1.4.23.1 / C-18.01
-- Remove the historical arbitrary SQL RPC. It was SECURITY DEFINER, built SQL
-- from caller-supplied text, and had been granted to public API roles.

DO $$
DECLARE
  role_name text;
BEGIN
  IF to_regprocedure('public.execute_sql(text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.execute_sql(text,jsonb) FROM PUBLIC';
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.execute_sql(text,jsonb) FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;

  IF to_regprocedure('public.execute_sql(text,anyarray)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.execute_sql(text,anyarray) FROM PUBLIC';
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.execute_sql(text,anyarray) FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.execute_sql(text, jsonb);
DROP FUNCTION IF EXISTS public.execute_sql(text, anyarray);


-- ============================================================
-- Source: 216_v14231_lockdown_security_definer_rpcs.sql
-- ============================================================
-- v1.4.23.1 security hardening: lock down legacy SECURITY DEFINER RPCs.
--
-- SECURITY DEFINER functions inherit owner privileges, so they must not keep
-- PostgreSQL's default PUBLIC execute grant. Runtime access should go through
-- backend services that enforce project/company membership.

DO $$
BEGIN
  IF to_regprocedure('public.replace_task_dependencies(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM authenticated';
    END IF;
  END IF;

  IF to_regprocedure('public.increment_task_code_sequence(uuid,uuid,text,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM authenticated';
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.nextval(TEXT);


-- ============================================================
-- Source: 227_v14231_force_core_rls_and_project_policies.sql
-- ============================================================
-- v1.4.23.1 C-18.L01/L02: force core RLS and restore tenant policies.
--
-- Live evidence showed core tables with RLS enabled but not forced, and
-- projects/tasks/acceptance_plans without active policies. Keep this
-- forward-only and idempotent so drifted databases can be repaired safely.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_company_member(
  p_company_id UUID,
  p_allowed_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
      AND (
        p_allowed_roles IS NULL
        OR cm.role = ANY(p_allowed_roles)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO service_role';
  END IF;
END $$;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.engineering_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineering_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.acceptance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acceptance_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_daily_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_daily_snapshot FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select_policy ON public.companies;
CREATE POLICY companies_select_policy ON public.companies
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.companies.id, NULL::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS companies_write_policy ON public.companies;
CREATE POLICY companies_write_policy ON public.companies
  FOR ALL
  USING (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.companies.id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.companies.id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_members_select_policy ON public.company_members;
CREATE POLICY company_members_select_policy ON public.company_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_active_company_member(public.company_members.company_id, NULL::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_members_write_policy ON public.company_members;
CREATE POLICY company_members_write_policy ON public.company_members
  FOR ALL
  USING (
    public.is_active_company_member(public.company_members.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    public.is_active_company_member(public.company_members.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS projects_read_policy ON public.projects;
DROP POLICY IF EXISTS projects_select_own ON public.projects;
CREATE POLICY projects_read_policy ON public.projects
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.projects.company_id, NULL::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS projects_write_policy ON public.projects;
DROP POLICY IF EXISTS projects_insert_own ON public.projects;
DROP POLICY IF EXISTS projects_update_own ON public.projects;
DROP POLICY IF EXISTS projects_delete_own ON public.projects;
CREATE POLICY projects_write_policy ON public.projects
  FOR ALL
  USING (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.projects.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.projects.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS tasks_read_policy ON public.tasks;
DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_read_policy ON public.tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.tasks.project_id
        AND (
          public.is_active_company_member(p.company_id, NULL::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  );

DROP POLICY IF EXISTS tasks_write_policy ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;
CREATE POLICY tasks_write_policy ON public.tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.tasks.project_id
        AND (
          public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.tasks.project_id
        AND (
          public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  );

DROP POLICY IF EXISTS acceptance_plans_read_policy ON public.acceptance_plans;
DROP POLICY IF EXISTS acceptance_plans_select_own ON public.acceptance_plans;
CREATE POLICY acceptance_plans_read_policy ON public.acceptance_plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.acceptance_plans.project_id
        AND (
          public.is_active_company_member(p.company_id, NULL::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  );

DROP POLICY IF EXISTS acceptance_plans_write_policy ON public.acceptance_plans;
DROP POLICY IF EXISTS acceptance_plans_insert_own ON public.acceptance_plans;
DROP POLICY IF EXISTS acceptance_plans_update_own ON public.acceptance_plans;
DROP POLICY IF EXISTS acceptance_plans_delete_own ON public.acceptance_plans;
CREATE POLICY acceptance_plans_write_policy ON public.acceptance_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.acceptance_plans.project_id
        AND (
          public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.acceptance_plans.project_id
        AND (
          public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  );

COMMIT;


-- ============================================================
-- Source: 228_v14231_runtime_database_role.sql
-- ============================================================
-- v1.4.23.1 C-18.L03: introduce a non-BYPASSRLS runtime database role.
--
-- This migration intentionally creates only a NOLOGIN group role. A real
-- deployment should create a secret-bearing LOGIN role outside source control
-- and grant it membership in workbuddy_runtime.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'CREATE ROLE workbuddy_runtime NOLOGIN NOBYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE workbuddy_runtime WITH NOLOGIN NOBYPASSRLS';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workbuddy_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO workbuddy_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO workbuddy_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO workbuddy_runtime;

DROP POLICY IF EXISTS companies_backend_runtime_policy ON public.companies;
CREATE POLICY companies_backend_runtime_policy ON public.companies
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS company_members_backend_runtime_policy ON public.company_members;
CREATE POLICY company_members_backend_runtime_policy ON public.company_members
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS projects_backend_runtime_policy ON public.projects;
CREATE POLICY projects_backend_runtime_policy ON public.projects
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS tasks_backend_runtime_policy ON public.tasks;
CREATE POLICY tasks_backend_runtime_policy ON public.tasks
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS task_dependencies_backend_runtime_policy ON public.task_dependencies;
CREATE POLICY task_dependencies_backend_runtime_policy ON public.task_dependencies
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS engineering_objects_backend_runtime_policy ON public.engineering_objects;
CREATE POLICY engineering_objects_backend_runtime_policy ON public.engineering_objects
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS acceptance_plans_backend_runtime_policy ON public.acceptance_plans;
CREATE POLICY acceptance_plans_backend_runtime_policy ON public.acceptance_plans
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS project_daily_snapshot_backend_runtime_policy ON public.project_daily_snapshot;
CREATE POLICY project_daily_snapshot_backend_runtime_policy ON public.project_daily_snapshot
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;


-- ============================================================
-- Source: 229_v14231_runtime_rls_helper_function_acl.sql
-- ============================================================
-- v1.4.23.1 C-18.L03 follow-up: runtime role must be able to execute
-- helper functions referenced by FORCE RLS policies.
--
-- 227 created public.is_active_company_member(...) for tenant predicates and
-- 228 moved the backend runtime connection to the non-bypass workbuddy_runtime
-- role. Without EXECUTE on the helper, normal runtime reads can fail with
-- "permission denied for function is_active_company_member" before policy
-- predicates resolve.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime';
  END IF;
END $$;

COMMIT;


-- ============================================================
-- Source: 230_v14231_runtime_users_backend_policy.sql
-- ============================================================
-- v1.4.23.1 C-18.L03 follow-up: the backend runtime role must be able to
-- read and maintain users during authentication/session freshness checks.
--
-- The application enforces user-facing auth in Express. The runtime database
-- role is intentionally non-BYPASSRLS, so it still needs an explicit users
-- table policy; otherwise login, /auth/me and token-version revocation checks
-- can see zero users and reject valid sessions.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS users_backend_runtime_policy ON public.users;
CREATE POLICY users_backend_runtime_policy ON public.users
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;


-- ============================================================
-- Source: 233_v14231_runtime_login_rls_helper_acl.sql
-- ============================================================
-- v1.4.23.1 C-18.L03 follow-up: concrete runtime login role must be able
-- to execute helper functions referenced by FORCE RLS policies.
--
-- Migration 229 granted EXECUTE to the NOLOGIN group role workbuddy_runtime.
-- Real deployments connect as workbuddy_runtime_login, and a pre-existing
-- login role may not inherit the group role in every environment. Grant the
-- helper directly as a defensive live fix.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT workbuddy_runtime TO workbuddy_runtime_login';
    END IF;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime_login';
  END IF;
END $$;

COMMIT;


-- ============================================================
-- Source: 052_add_task_timeline_events.sql
-- ============================================================
-- Clean-bootstrap form of the task timeline event stream. The historical
-- incremental migration included live-data backfills; clean bootstrap only
-- needs the final table, helper function and synchronization triggers.

BEGIN;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS actual_start_date DATE,
  ADD COLUMN IF NOT EXISTS actual_end_date DATE,
  ADD COLUMN IF NOT EXISTS first_progress_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS planned_start_date DATE,
  ADD COLUMN IF NOT EXISTS planned_end_date DATE,
  ADD COLUMN IF NOT EXISTS milestone_id UUID;

ALTER TABLE public.task_conditions
  ADD COLUMN IF NOT EXISTS project_id UUID;

ALTER TABLE public.task_obstacles
  ADD COLUMN IF NOT EXISTS project_id UUID;

UPDATE public.task_conditions c
SET project_id = t.project_id
FROM public.tasks t
WHERE c.task_id = t.id
  AND c.project_id IS NULL;

UPDATE public.task_obstacles o
SET project_id = t.project_id
FROM public.tasks t
WHERE o.task_id = t.id
  AND o.project_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_task_conditions_project'
      AND conrelid = 'public.task_conditions'::regclass
  ) THEN
    ALTER TABLE public.task_conditions
      ADD CONSTRAINT fk_task_conditions_project
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_task_obstacles_project'
      AND conrelid = 'public.task_obstacles'::regclass
  ) THEN
    ALTER TABLE public.task_obstacles
      ADD CONSTRAINT fk_task_obstacles_project
      FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_conditions_project_id
  ON public.task_conditions(project_id);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_project_id
  ON public.task_obstacles(project_id);

CREATE TABLE IF NOT EXISTS task_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('task', 'milestone', 'condition', 'obstacle')),
  title TEXT NOT NULL,
  description TEXT,
  status_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_timeline_events_project ON task_timeline_events(project_id);
CREATE INDEX IF NOT EXISTS idx_task_timeline_events_task ON task_timeline_events(task_id);
CREATE INDEX IF NOT EXISTS idx_task_timeline_events_occurred_at ON task_timeline_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_task_timeline_events_type ON task_timeline_events(event_type);

ALTER TABLE task_timeline_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_timeline_events_select_policy" ON task_timeline_events;
CREATE POLICY "task_timeline_events_select_policy" ON task_timeline_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = task_timeline_events.project_id));

DROP POLICY IF EXISTS "task_timeline_events_insert_policy" ON task_timeline_events;
CREATE POLICY "task_timeline_events_insert_policy" ON task_timeline_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL OR (SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS "task_timeline_events_update_policy" ON task_timeline_events;
CREATE POLICY "task_timeline_events_update_policy" ON task_timeline_events FOR UPDATE
  USING (auth.uid() IS NOT NULL OR (SELECT current_setting('role', true) = 'service_role'));

CREATE OR REPLACE FUNCTION record_task_timeline_event(
  p_project_id UUID,
  p_task_id UUID,
  p_event_type TEXT,
  p_title TEXT,
  p_description TEXT,
  p_status_label TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_created_by UUID DEFAULT NULL,
  p_occurred_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO task_timeline_events (
    project_id,
    task_id,
    event_type,
    title,
    description,
    status_label,
    metadata,
    occurred_at,
    created_by
  ) VALUES (
    p_project_id,
    p_task_id,
    p_event_type,
    p_title,
    p_description,
    p_status_label,
    COALESCE(p_metadata, '{}'::jsonb),
    COALESCE(p_occurred_at, NOW()),
    p_created_by
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_task_timeline_for_task()
RETURNS TRIGGER AS $$
DECLARE
  v_status_label TEXT;
  v_description TEXT;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  v_status_label := CASE
    WHEN COALESCE(NEW.progress, 0) >= 100 OR NEW.status IN ('宸插畬鎴?, 'completed') THEN '宸插畬鎴?
    WHEN NEW.status IN ('杩涜涓?, 'in_progress') OR COALESCE(NEW.progress, 0) > 0 THEN '杩涜涓?
    WHEN NEW.status IN ('宸叉殏鍋?, 'blocked') THEN '宸叉殏鍋?
    ELSE '鏈紑濮?
  END;

  v_occurred_at := COALESCE(
    NEW.actual_end_date::timestamptz,
    NEW.actual_start_date::timestamptz,
    NEW.first_progress_at::timestamptz,
    NEW.updated_at,
    NEW.created_at,
    NOW()
  );

  IF TG_OP = 'INSERT' THEN
    v_description := '鐘舵€侊細' || COALESCE(NEW.status, '鏈煡')
      || '锛涜繘搴︼細' || COALESCE(NEW.progress, 0)::text || '%'
      || '锛涜鍒掑畬鎴愶細' || COALESCE(TO_CHAR(NEW.end_date, 'YYYY-MM-DD'), '鏈缃?);

    PERFORM record_task_timeline_event(
      NEW.project_id,
      NEW.id,
      'task',
      COALESCE(NEW.title, '鏈懡鍚嶄换鍔?),
      v_description,
      v_status_label,
      jsonb_build_object(
        'source', 'tasks',
        'event', 'created',
        'progress', COALESCE(NEW.progress, 0),
        'status', COALESCE(NEW.status, '鏈煡')
      ),
      NEW.updated_by,
      v_occurred_at
    );

    IF COALESCE(NEW.is_milestone, FALSE) THEN
      PERFORM record_task_timeline_event(
        NEW.project_id,
        NEW.id,
        'milestone',
        COALESCE(NEW.title, '鏈懡鍚嶄换鍔?),
        '浠诲姟琚爣璁颁负閲岀▼纰戣妭鐐?,
        v_status_label,
        jsonb_build_object('source', 'tasks', 'event', 'milestone_marked'),
        NEW.updated_by,
        v_occurred_at
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR COALESCE(NEW.progress, 0) IS DISTINCT FROM COALESCE(OLD.progress, 0)
      OR NEW.start_date IS DISTINCT FROM OLD.start_date
      OR NEW.end_date IS DISTINCT FROM OLD.end_date
      OR NEW.actual_start_date IS DISTINCT FROM OLD.actual_start_date
      OR NEW.actual_end_date IS DISTINCT FROM OLD.actual_end_date
      OR NEW.first_progress_at IS DISTINCT FROM OLD.first_progress_at THEN
      v_description := '鐘舵€侊細' || COALESCE(NEW.status, '鏈煡')
        || '锛涜繘搴︼細' || COALESCE(NEW.progress, 0)::text || '%'
        || '锛涜鍒掑畬鎴愶細' || COALESCE(TO_CHAR(NEW.end_date, 'YYYY-MM-DD'), '鏈缃?);

      PERFORM record_task_timeline_event(
        NEW.project_id,
        NEW.id,
        'task',
        COALESCE(NEW.title, '鏈懡鍚嶄换鍔?),
        v_description,
        v_status_label,
        jsonb_build_object(
          'source', 'tasks',
          'event', 'updated',
          'old_status', COALESCE(OLD.status, ''),
          'new_status', COALESCE(NEW.status, ''),
          'old_progress', COALESCE(OLD.progress, 0),
          'new_progress', COALESCE(NEW.progress, 0)
        ),
        NEW.updated_by,
        v_occurred_at
      );
    END IF;

    IF COALESCE(NEW.is_milestone, FALSE) AND NOT COALESCE(OLD.is_milestone, FALSE) THEN
      PERFORM record_task_timeline_event(
        NEW.project_id,
        NEW.id,
        'milestone',
        COALESCE(NEW.title, '鏈懡鍚嶄换鍔?),
        '浠诲姟琚爣璁颁负閲岀▼纰戣妭鐐?,
        v_status_label,
        jsonb_build_object('source', 'tasks', 'event', 'milestone_marked'),
        NEW.updated_by,
        v_occurred_at
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_timeline_tasks ON tasks;
CREATE TRIGGER trigger_task_timeline_tasks
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_timeline_for_task();

CREATE OR REPLACE FUNCTION sync_task_timeline_for_obstacle()
RETURNS TRIGGER AS $$
DECLARE
  v_status_label TEXT;
  v_description TEXT;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  v_status_label := CASE
    WHEN COALESCE(NEW.status, OLD.status) IN ('宸茶В鍐?, 'resolved', 'closed') THEN '宸茶В鍐?
    WHEN COALESCE(NEW.status, OLD.status) IN ('澶勭悊涓?, 'resolving') THEN '澶勭悊涓?
    WHEN COALESCE(NEW.status, OLD.status) IN ('鏃犳硶瑙ｅ喅', 'blocked') THEN '鏃犳硶瑙ｅ喅'
    ELSE '寰呭鐞?
  END;

  v_occurred_at := COALESCE(
    NEW.resolved_at,
    NEW.updated_at,
    NEW.created_at,
    OLD.resolved_at,
    OLD.updated_at,
    OLD.created_at,
    NOW()
  );

  IF TG_OP = 'INSERT' THEN
    v_description := CASE
      WHEN COALESCE(NEW.status, '寰呭鐞?) IN ('宸茶В鍐?, 'resolved', 'closed') THEN '闃荤宸茶В鍐?
      WHEN COALESCE(NEW.status, '寰呭鐞?) IN ('澶勭悊涓?, 'resolving') THEN '闃荤澶勭悊涓?
      WHEN COALESCE(NEW.status, '寰呭鐞?) IN ('鏃犳硶瑙ｅ喅', 'blocked') THEN '闃荤鏆傛椂鏃犳硶瑙ｅ喅'
      ELSE '鐜板満瀛樺湪闃荤锛岄渶鍏虫敞'
    END;

    PERFORM record_task_timeline_event(
      COALESCE(NEW.project_id, (SELECT project_id FROM public.tasks WHERE id = NEW.task_id)),
      NEW.task_id,
      'obstacle',
      COALESCE(NEW.description, '闃荤浜嬮」'),
      v_description,
      v_status_label,
      jsonb_build_object(
        'source', 'task_obstacles',
        'event', 'created',
        'status', COALESCE(NEW.status, '寰呭鐞?),
        'obstacle_type', COALESCE(NEW.obstacle_type, '鍏朵粬'),
        'severity', COALESCE(NEW.severity, '涓?)
      ),
      NEW.created_by,
      v_occurred_at
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.resolution IS DISTINCT FROM OLD.resolution
      OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
      OR NEW.obstacle_type IS DISTINCT FROM OLD.obstacle_type
      OR NEW.severity IS DISTINCT FROM OLD.severity THEN
      v_description := CASE
        WHEN COALESCE(NEW.status, '寰呭鐞?) IN ('宸茶В鍐?, 'resolved', 'closed') THEN '闃荤宸茶В鍐?
        WHEN COALESCE(NEW.status, '寰呭鐞?) IN ('澶勭悊涓?, 'resolving') THEN '闃荤澶勭悊涓?
        WHEN COALESCE(NEW.status, '寰呭鐞?) IN ('鏃犳硶瑙ｅ喅', 'blocked') THEN '闃荤鏆傛椂鏃犳硶瑙ｅ喅'
        ELSE '鐜板満瀛樺湪闃荤锛岄渶鍏虫敞'
      END;

      PERFORM record_task_timeline_event(
        COALESCE(NEW.project_id, (SELECT project_id FROM public.tasks WHERE id = NEW.task_id)),
        NEW.task_id,
        'obstacle',
        COALESCE(NEW.description, '闃荤浜嬮」'),
        v_description,
        v_status_label,
        jsonb_build_object(
          'source', 'task_obstacles',
          'event', 'updated',
          'old_status', COALESCE(OLD.status, '寰呭鐞?),
          'new_status', COALESCE(NEW.status, '寰呭鐞?),
          'obstacle_type', COALESCE(NEW.obstacle_type, '鍏朵粬'),
          'severity', COALESCE(NEW.severity, '涓?)
        ),
        NEW.created_by,
        v_occurred_at
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM record_task_timeline_event(
      COALESCE(OLD.project_id, (SELECT project_id FROM public.tasks WHERE id = OLD.task_id)),
      OLD.task_id,
      'obstacle',
      COALESCE(OLD.description, '闃荤浜嬮」'),
      '闃荤璁板綍宸插垹闄?,
      CASE
        WHEN COALESCE(OLD.status, '寰呭鐞?) IN ('宸茶В鍐?, 'resolved', 'closed') THEN '宸茶В鍐?
        WHEN COALESCE(OLD.status, '寰呭鐞?) IN ('澶勭悊涓?, 'resolving') THEN '澶勭悊涓?
        WHEN COALESCE(OLD.status, '寰呭鐞?) IN ('鏃犳硶瑙ｅ喅', 'blocked') THEN '鏃犳硶瑙ｅ喅'
        ELSE '寰呭鐞?
      END,
      jsonb_build_object(
        'source', 'task_obstacles',
        'event', 'deleted',
        'status', COALESCE(OLD.status, '寰呭鐞?),
        'obstacle_type', COALESCE(OLD.obstacle_type, '鍏朵粬'),
        'severity', COALESCE(OLD.severity, '涓?)
      ),
      OLD.created_by,
      COALESCE(OLD.resolved_at, OLD.updated_at, OLD.created_at, NOW())
    );
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_timeline_obstacles ON task_obstacles;
CREATE TRIGGER trigger_task_timeline_obstacles
  AFTER INSERT OR UPDATE OR DELETE ON task_obstacles
  FOR EACH ROW
  EXECUTE FUNCTION sync_task_timeline_for_obstacle();

COMMIT;


-- ============================================================
-- Source: 235_v14231_task_code_runtime_rls_policies.sql
-- ============================================================
-- v1.4.23.1 C-18.L09 follow-up: task creation bootstraps project
-- task-code rules inside the main write transaction. After runtime moved to a
-- non-bypass RLS role, the legacy service_role-only policies on these tables
-- block normal task creation with 42501.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.project_task_code_rules TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.task_code_sequences TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.task_code_history TO workbuddy_runtime';
  END IF;
END $$;

ALTER TABLE public.project_task_code_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_code_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_code_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_task_code_rules_backend_runtime_policy ON public.project_task_code_rules;
CREATE POLICY project_task_code_rules_backend_runtime_policy ON public.project_task_code_rules
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS task_code_sequences_backend_runtime_policy ON public.task_code_sequences;
CREATE POLICY task_code_sequences_backend_runtime_policy ON public.task_code_sequences
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS task_code_history_backend_runtime_policy ON public.task_code_history;
CREATE POLICY task_code_history_backend_runtime_policy ON public.task_code_history
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;


-- ============================================================
-- Source: 236_v14231_task_creation_side_effect_runtime_rls_policies.sql
-- ============================================================
-- v1.4.23.1 C-18.L09 follow-up: task creation writes runtime side-effect
-- rows inside the main transaction. Under the non-bypass runtime DB role,
-- task_timeline_events and operation_logs need explicit backend policies.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_timeline_events TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operation_logs TO workbuddy_runtime';
  END IF;
END $$;

ALTER TABLE public.task_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_timeline_events_backend_runtime_policy ON public.task_timeline_events;
CREATE POLICY task_timeline_events_backend_runtime_policy ON public.task_timeline_events
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS operation_logs_backend_runtime_policy ON public.operation_logs;
CREATE POLICY operation_logs_backend_runtime_policy ON public.operation_logs
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;


-- ============================================================
-- Source: 237_v14231_data_lineage_runtime_rls_policies.sql
-- ============================================================
-- v1.4.23.1 C-18.L09 follow-up: wizard task creation records
-- template-node -> task lineage inside the task write transaction. Backend
-- runtime must be able to read lineage rules and write lineage facts under RLS.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_entity_types TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT ON TABLE public.data_lineage_relation_rules TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_lineage_links TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_lineage_events TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_lineage_batches TO workbuddy_runtime';
  END IF;
END $$;

ALTER TABLE public.data_lineage_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_lineage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_lineage_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_lineage_links_backend_runtime_policy ON public.data_lineage_links;
CREATE POLICY data_lineage_links_backend_runtime_policy ON public.data_lineage_links
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS data_lineage_events_backend_runtime_policy ON public.data_lineage_events;
CREATE POLICY data_lineage_events_backend_runtime_policy ON public.data_lineage_events
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS data_lineage_batches_backend_runtime_policy ON public.data_lineage_batches;
CREATE POLICY data_lineage_batches_backend_runtime_policy ON public.data_lineage_batches
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;


-- ============================================================
-- Source: 238_v14231_data_lineage_event_cleanup_fk.sql
-- ============================================================
-- v1.4.23.1 C-18.L09 follow-up: data_lineage_events is append-only, so
-- deleting a lineage link must not update event.link_id through ON DELETE SET
-- NULL. Use CASCADE so disposable wizard cleanup can physically delete lineage
-- artifacts without violating the append-only trigger.

BEGIN;

ALTER TABLE public.data_lineage_events
  DROP CONSTRAINT IF EXISTS data_lineage_events_link_id_fkey;

ALTER TABLE public.data_lineage_events
  ADD CONSTRAINT data_lineage_events_link_id_fkey
  FOREIGN KEY (link_id)
  REFERENCES public.data_lineage_links(id)
  ON DELETE CASCADE;

COMMIT;


-- ============================================================
-- Source: 239_v14231_data_lineage_event_cleanup_trigger.sql
-- ============================================================
-- v1.4.23.1 C-18.L09 follow-up: keep lineage events immutable to UPDATE, but
-- allow backend-governed physical cleanup DELETEs. RLS and table grants still
-- decide who may delete rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.check_lineage_events_append_only()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'data_lineage_events is append-only: % not allowed', TG_OP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_lineage_events_append_only ON public.data_lineage_events;
CREATE TRIGGER trigger_lineage_events_append_only
  BEFORE UPDATE ON public.data_lineage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.check_lineage_events_append_only();

COMMIT;


-- ============================================================
-- Source: 240_v14231_task_condition_delete_timeline_cleanup_guard.sql
-- ============================================================
-- v1.4.23.1 C-18.L09 follow-up: physical cleanup may delete task rows before
-- legacy condition rows in a partially compensated draft. In that case the
-- condition DELETE trigger must not try to append a timeline event that points
-- at a task that no longer exists.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_task_timeline_for_condition()
RETURNS TRIGGER AS $$
DECLARE
  v_status_label TEXT;
  v_description TEXT;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.task_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
          FROM public.tasks t
         WHERE t.id = OLD.task_id
      ) THEN
      RETURN OLD;
    END IF;

    PERFORM public.record_task_timeline_event(
      OLD.project_id,
      OLD.task_id,
      'condition',
      COALESCE(OLD.name, '寮€宸ユ潯浠?),
      '寮€宸ユ潯浠惰褰曞凡鍒犻櫎',
      CASE WHEN COALESCE(OLD.is_satisfied, FALSE) THEN '宸叉弧瓒? ELSE '寰呮弧瓒? END,
      jsonb_build_object(
        'source', 'task_conditions',
        'event', 'deleted',
        'is_satisfied', COALESCE(OLD.is_satisfied, FALSE),
        'condition_type', COALESCE(OLD.condition_type, '鍏朵粬')
      ),
      OLD.created_by,
      COALESCE(OLD.updated_at, OLD.created_at, NOW())
    );
    RETURN OLD;
  END IF;

  v_status_label := CASE WHEN COALESCE(NEW.is_satisfied, FALSE) THEN '宸叉弧瓒? ELSE '寰呮弧瓒? END;
  v_occurred_at := COALESCE(NEW.confirmed_at, NEW.updated_at, NEW.created_at, NOW());

  IF TG_OP = 'INSERT' THEN
    v_description := CASE WHEN COALESCE(NEW.is_satisfied, FALSE)
      THEN '寮€宸ユ潯浠跺凡婊¤冻'
      ELSE '寮€宸ユ潯浠跺緟婊¤冻'
    END;

    PERFORM public.record_task_timeline_event(
      NEW.project_id,
      NEW.task_id,
      'condition',
      COALESCE(NEW.name, '寮€宸ユ潯浠?),
      v_description,
      v_status_label,
      jsonb_build_object(
        'source', 'task_conditions',
        'event', 'created',
        'is_satisfied', COALESCE(NEW.is_satisfied, FALSE),
        'condition_type', COALESCE(NEW.condition_type, '鍏朵粬')
      ),
      NEW.created_by,
      v_occurred_at
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_satisfied IS DISTINCT FROM OLD.is_satisfied
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.condition_type IS DISTINCT FROM OLD.condition_type THEN
      v_description := CASE WHEN COALESCE(NEW.is_satisfied, FALSE)
        THEN '寮€宸ユ潯浠跺凡婊¤冻'
        ELSE '寮€宸ユ潯浠跺緟婊¤冻'
      END;

      PERFORM public.record_task_timeline_event(
        NEW.project_id,
        NEW.task_id,
        'condition',
        COALESCE(NEW.name, '寮€宸ユ潯浠?),
        v_description,
        v_status_label,
        jsonb_build_object(
          'source', 'task_conditions',
          'event', 'updated',
          'old_is_satisfied', COALESCE(OLD.is_satisfied, FALSE),
          'new_is_satisfied', COALESCE(NEW.is_satisfied, FALSE),
          'condition_type', COALESCE(NEW.condition_type, '鍏朵粬')
        ),
        NEW.confirmed_by,
        v_occurred_at
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_timeline_conditions ON public.task_conditions;
CREATE TRIGGER trigger_task_timeline_conditions
  AFTER INSERT OR UPDATE OR DELETE ON public.task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_timeline_for_condition();

COMMIT;

-- ============================================================
-- Source: 242_v14231_algorithm_asset_candidate_events_runtime_candidate_policy.sql
-- ============================================================
-- v1.4.23.1 follow-up: allow the non-bypass backend runtime role to persist
-- governed candidate-only algorithm asset events.
--
-- The backend runtime connection intentionally cannot use service_role/postgres
-- in production-like environments. This policy keeps candidate evidence writable
-- for governance read models and wizard/backfill anchors, while still blocking
-- candidate rows from becoming runtime publication records through this table.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.algorithm_asset_candidate_events') IS NOT NULL
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_asset_candidate_events TO workbuddy_runtime';
    EXECUTE 'DROP POLICY IF EXISTS algorithm_asset_candidate_events_backend_runtime_select ON public.algorithm_asset_candidate_events';
    EXECUTE $policy$
      CREATE POLICY algorithm_asset_candidate_events_backend_runtime_select
        ON public.algorithm_asset_candidate_events
        FOR SELECT
        TO workbuddy_runtime
        USING (
          current_user = 'workbuddy_runtime'
          OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
        )
    $policy$;
    EXECUTE 'DROP POLICY IF EXISTS algorithm_asset_candidate_events_backend_runtime_candidate_write ON public.algorithm_asset_candidate_events';
    EXECUTE $policy$
      CREATE POLICY algorithm_asset_candidate_events_backend_runtime_candidate_write
        ON public.algorithm_asset_candidate_events
        FOR ALL
        TO workbuddy_runtime
        USING (
          (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          AND event_status IN ('observed', 'candidate', 'replay_ready', 'review_required', 'quarantined', 'rejected', 'superseded')
          AND publish_anchor IN ('candidate_only', 'manual_governance_required')
          AND learning_maturity IN ('shadow_report_only', 'governed_candidate')
          AND runtime_effect NOT IN ('guarded_runtime_auto_publish', 'system_curated_publish', 'runtime_published')
        )
        WITH CHECK (
          (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          AND event_status IN ('observed', 'candidate', 'replay_ready', 'review_required', 'quarantined', 'rejected', 'superseded')
          AND publish_anchor IN ('candidate_only', 'manual_governance_required')
          AND learning_maturity IN ('shadow_report_only', 'governed_candidate')
          AND runtime_effect NOT IN ('guarded_runtime_auto_publish', 'system_curated_publish', 'runtime_published')
        )
    $policy$;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- ============================================================
-- Source: 245_v14231_algorithm_asset_registry_view_acl_hardening.sql
-- ============================================================
-- v1.4.23.1 follow-up: harden algorithm_asset_registry_view so ordinary
-- consumers cannot read the governance registry directly.

BEGIN;

DO $$
DECLARE
  role_name text;
BEGIN
  IF to_regclass('public.algorithm_asset_registry_view') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.algorithm_asset_registry_view SET (security_invoker = true, security_barrier = true)';
    EXECUTE 'REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM PUBLIC';

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'workbuddy_runtime'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 247_v14231_users_active_session_guard_columns.sql
-- ============================================================
-- v1.4.23.1 auth/session live schema repair:
-- authentication now fails closed when users.status or users.deleted_at is
-- missing, so production databases must carry these guard columns explicitly.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

UPDATE public.users
SET status = 'active'
WHERE status IS NULL
   OR BTRIM(status) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'users_status_check'
       AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_status_check
      CHECK (status IN ('active', 'inactive', 'disabled', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_active_session_guard
  ON public.users(id, auth_token_version)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_username_active_session_guard
  ON public.users(username)
  WHERE status = 'active' AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 248_v14231_migration_drift_closeout.sql
-- ============================================================
-- v1.4.23.1 migration governance closeout follow-up.
--
-- This forward migration keeps the audited 214/246 ledger rows immutable while
-- aligning the live catalog with the canonical schema-drift contract:
-- 1) widen recommendation_actions constraints to the current product domain;
-- 2) re-state the Advisor RLS policies as static DDL so drift parsing and live
--    catalog readback share the same policy surface.

BEGIN;

ALTER TABLE public.recommendation_actions
  DROP CONSTRAINT IF EXISTS recommendation_actions_action_type_check;

ALTER TABLE public.recommendation_actions
  ADD CONSTRAINT recommendation_actions_action_type_check
  CHECK (action_type IN ('adopted', 'declined'));

ALTER TABLE public.recommendation_actions
  DROP CONSTRAINT IF EXISTS recommendation_actions_recommendation_kind_check;

ALTER TABLE public.recommendation_actions
  ADD CONSTRAINT recommendation_actions_recommendation_kind_check
  CHECK (recommendation_kind IN ('schedule_acceleration', 'construction_organization_plan_network'));

ALTER TABLE IF EXISTS public.project_key_node_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_key_node_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_constraint_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_constraint_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_entity_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_entity_types FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_relation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_lineage_relation_rules FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_key_node_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_key_node_snapshots TO workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_constraint_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_constraint_snapshots TO workbuddy_runtime;
GRANT SELECT ON TABLE public.data_lineage_entity_types TO authenticated;
GRANT SELECT ON TABLE public.data_lineage_entity_types TO workbuddy_runtime;
GRANT SELECT ON TABLE public.data_lineage_relation_rules TO authenticated;
GRANT SELECT ON TABLE public.data_lineage_relation_rules TO workbuddy_runtime;

DROP POLICY IF EXISTS project_key_node_snapshots_auth_read_policy
  ON public.project_key_node_snapshots;
CREATE POLICY project_key_node_snapshots_auth_read_policy
  ON public.project_key_node_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_key_node_snapshots.project_id
        AND public.is_active_company_member(p.company_id, NULL::TEXT[])
    )
  );

DROP POLICY IF EXISTS project_key_node_snapshots_auth_write_policy
  ON public.project_key_node_snapshots;
CREATE POLICY project_key_node_snapshots_auth_write_policy
  ON public.project_key_node_snapshots
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_key_node_snapshots.project_id
        AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_key_node_snapshots.project_id
        AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    )
  );

DROP POLICY IF EXISTS project_key_node_snapshots_backend_runtime_policy
  ON public.project_key_node_snapshots;
CREATE POLICY project_key_node_snapshots_backend_runtime_policy
  ON public.project_key_node_snapshots
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS task_constraint_snapshots_auth_read_policy
  ON public.task_constraint_snapshots;
CREATE POLICY task_constraint_snapshots_auth_read_policy
  ON public.task_constraint_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = task_constraint_snapshots.project_id
        AND public.is_active_company_member(p.company_id, NULL::TEXT[])
    )
  );

DROP POLICY IF EXISTS task_constraint_snapshots_auth_write_policy
  ON public.task_constraint_snapshots;
CREATE POLICY task_constraint_snapshots_auth_write_policy
  ON public.task_constraint_snapshots
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = task_constraint_snapshots.project_id
        AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = task_constraint_snapshots.project_id
        AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    )
  );

DROP POLICY IF EXISTS task_constraint_snapshots_backend_runtime_policy
  ON public.task_constraint_snapshots;
CREATE POLICY task_constraint_snapshots_backend_runtime_policy
  ON public.task_constraint_snapshots
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS data_lineage_entity_types_authenticated_read_policy
  ON public.data_lineage_entity_types;
CREATE POLICY data_lineage_entity_types_authenticated_read_policy
  ON public.data_lineage_entity_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS data_lineage_entity_types_backend_runtime_read_policy
  ON public.data_lineage_entity_types;
CREATE POLICY data_lineage_entity_types_backend_runtime_read_policy
  ON public.data_lineage_entity_types
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS data_lineage_relation_rules_authenticated_read_policy
  ON public.data_lineage_relation_rules;
CREATE POLICY data_lineage_relation_rules_authenticated_read_policy
  ON public.data_lineage_relation_rules
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS data_lineage_relation_rules_backend_runtime_read_policy
  ON public.data_lineage_relation_rules;
CREATE POLICY data_lineage_relation_rules_backend_runtime_read_policy
  ON public.data_lineage_relation_rules
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 249_v14231_data_lineage_global_reference_auth_predicate.sql
-- ============================================================
-- v1.4.23.1 follow-up: keep global data-lineage reference tables readable
-- only through an explicit authenticated identity predicate.
--
-- These two tables are global rule/reference catalogs, so they do not have a
-- company_id/project_id tenant column. The live RLS diagnostic still requires
-- a visible auth/tenant predicate instead of an unconditional read predicate.

BEGIN;

DROP POLICY IF EXISTS data_lineage_entity_types_authenticated_read_policy
  ON public.data_lineage_entity_types;
CREATE POLICY data_lineage_entity_types_authenticated_read_policy
  ON public.data_lineage_entity_types
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS data_lineage_relation_rules_authenticated_read_policy
  ON public.data_lineage_relation_rules;
CREATE POLICY data_lineage_relation_rules_authenticated_read_policy
  ON public.data_lineage_relation_rules
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 250_v14231_runtime_schema_gap_closeout.sql
-- ============================================================
-- v1.4.23.1 runtime schema gap closeout.
--
-- CloakBrowser-backed local runtime smoke exposed code paths that already
-- consume these columns while migrate:check/drift still reported no pending
-- migration. Keep the fix additive and idempotent: no data deletion, no
-- business default inference beyond compatibility backfills from existing
-- legacy display columns.

BEGIN;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS execution_lane TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_execution_lane
  ON public.tasks(project_id, execution_lane);

COMMENT ON COLUMN public.tasks.execution_lane IS
  'Optional schedule execution lane consumed by CPM/runtime planning read models. Null means no lane classification.';

ALTER TABLE public.acceptance_plans
  ADD COLUMN IF NOT EXISTS plan_name TEXT;

UPDATE public.acceptance_plans
SET plan_name = acceptance_name
WHERE plan_name IS NULL
  AND acceptance_name IS NOT NULL;

COMMENT ON COLUMN public.acceptance_plans.plan_name IS
  'Compatibility display name used by acceptance replay and task read models; backfilled from acceptance_name when present.';

ALTER TABLE public.monthly_plans
  ADD COLUMN IF NOT EXISTS pending_closeout_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.monthly_plans.pending_closeout_count IS
  'Cached monthly closeout backlog count consumed by project execution summaries; defaults to zero for historical rows.';

ALTER TABLE public.task_conditions
  ADD COLUMN IF NOT EXISTS condition_name TEXT;

UPDATE public.task_conditions
SET condition_name = name
WHERE condition_name IS NULL
  AND name IS NOT NULL;

COMMENT ON COLUMN public.task_conditions.condition_name IS
  'Compatibility condition title consumed by drawing, warning, and pre-milestone read models; backfilled from legacy name when present.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 252_v14231_advisor_public_rls_remaining_closeout.sql
-- ============================================================
-- v1.4.23.1 follow-up: close the remaining Supabase Advisor public RLS
-- findings currently visible for invitation, reminder, notification,
-- governance, metric, duration, WBS, and dictionary tables.
--
-- This migration is forward-only and idempotent. It is a local migration
-- closeout until staging/production apply, catalog readback, and Advisor
-- rescan evidence are archived.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_project_member(
  p_project_id UUID,
  p_allowed_permission_levels TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND COALESCE(pm.is_active, true) = true
      AND (
        p_allowed_permission_levels IS NULL
        OR pm.permission_level = ANY(p_allowed_permission_levels)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = auth.uid()
      AND (
        p_allowed_permission_levels IS NULL
        OR p_allowed_permission_levels && ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[]
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_project_member(UUID, TEXT[]) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_active_project_member(UUID, TEXT[]) FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO workbuddy_runtime';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO workbuddy_runtime_login';
  END IF;
END $$;

ALTER TABLE IF EXISTS public.data_quality_rule_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.data_quality_rule_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.change_action_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.change_action_types FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.governance_approval_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.governance_approval_records FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.metric_value_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.metric_value_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_template_candidate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_template_candidate_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reminder_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reminder_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reminder_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.reminder_dismissals FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_experience_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_experience_samples FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_template_candidate_aggregations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.wbs_template_candidate_aggregations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_forecast_model_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_forecast_model_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permission_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.permission_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_direct_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_direct_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_join_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_join_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_user_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notification_user_states FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.duration_experience_samples
  ADD COLUMN IF NOT EXISTS learning_scope TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS learning_scope_source TEXT NOT NULL DEFAULT 'task_completion_writer';

DO $$
BEGIN
  IF to_regclass('public.data_quality_rule_registry') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_quality_rule_registry TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS data_quality_rule_registry_authenticated_read_policy ON public.data_quality_rule_registry';
      EXECUTE $policy$
        CREATE POLICY data_quality_rule_registry_authenticated_read_policy
          ON public.data_quality_rule_registry
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.data_quality_rule_registry TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS data_quality_rule_registry_backend_runtime_read_policy ON public.data_quality_rule_registry';
      EXECUTE $policy$
        CREATE POLICY data_quality_rule_registry_backend_runtime_read_policy
          ON public.data_quality_rule_registry
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.change_action_types') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.change_action_types TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS change_action_types_authenticated_read_policy ON public.change_action_types';
      EXECUTE $policy$
        CREATE POLICY change_action_types_authenticated_read_policy
          ON public.change_action_types
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.change_action_types TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS change_action_types_backend_runtime_read_policy ON public.change_action_types';
      EXECUTE $policy$
        CREATE POLICY change_action_types_backend_runtime_read_policy
          ON public.change_action_types
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_forecast_model_profiles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_forecast_model_profiles TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_forecast_model_profiles_authenticated_read_policy ON public.duration_forecast_model_profiles';
      EXECUTE $policy$
        CREATE POLICY duration_forecast_model_profiles_authenticated_read_policy
          ON public.duration_forecast_model_profiles
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_forecast_model_profiles TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_forecast_model_profiles_backend_runtime_read_policy ON public.duration_forecast_model_profiles';
      EXECUTE $policy$
        CREATE POLICY duration_forecast_model_profiles_backend_runtime_read_policy
          ON public.duration_forecast_model_profiles
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.permission_roles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.permission_roles TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS permission_roles_authenticated_read_policy ON public.permission_roles';
      EXECUTE $policy$
        CREATE POLICY permission_roles_authenticated_read_policy
          ON public.permission_roles
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.permission_roles TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS permission_roles_backend_runtime_read_policy ON public.permission_roles';
      EXECUTE $policy$
        CREATE POLICY permission_roles_backend_runtime_read_policy
          ON public.permission_roles
          FOR SELECT
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.reminder_preferences') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_preferences TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS reminder_preferences_auth_self_policy ON public.reminder_preferences';
      EXECUTE $policy$
        CREATE POLICY reminder_preferences_auth_self_policy
          ON public.reminder_preferences
          FOR ALL
          TO authenticated
          USING (reminder_preferences.user_id = auth.uid())
          WITH CHECK (reminder_preferences.user_id = auth.uid())
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_preferences TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS reminder_preferences_backend_runtime_policy ON public.reminder_preferences';
      EXECUTE $policy$
        CREATE POLICY reminder_preferences_backend_runtime_policy
          ON public.reminder_preferences
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.reminder_dismissals') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_dismissals TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS reminder_dismissals_auth_self_policy ON public.reminder_dismissals';
      EXECUTE $policy$
        CREATE POLICY reminder_dismissals_auth_self_policy
          ON public.reminder_dismissals
          FOR ALL
          TO authenticated
          USING (reminder_dismissals.user_id = auth.uid())
          WITH CHECK (reminder_dismissals.user_id = auth.uid())
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminder_dismissals TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS reminder_dismissals_backend_runtime_policy ON public.reminder_dismissals';
      EXECUTE $policy$
        CREATE POLICY reminder_dismissals_backend_runtime_policy
          ON public.reminder_dismissals
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.notification_user_states') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_user_states TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS notification_user_states_auth_self_policy ON public.notification_user_states';
      EXECUTE $policy$
        CREATE POLICY notification_user_states_auth_self_policy
          ON public.notification_user_states
          FOR ALL
          TO authenticated
          USING (notification_user_states.user_id = auth.uid())
          WITH CHECK (notification_user_states.user_id = auth.uid())
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_user_states TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS notification_user_states_backend_runtime_policy ON public.notification_user_states';
      EXECUTE $policy$
        CREATE POLICY notification_user_states_backend_runtime_policy
          ON public.notification_user_states
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.governance_approval_records') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.governance_approval_records TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS governance_approval_records_auth_read_policy ON public.governance_approval_records';
      EXECUTE $policy$
        CREATE POLICY governance_approval_records_auth_read_policy
          ON public.governance_approval_records
          FOR SELECT
          TO authenticated
          USING (
            requested_by = auth.uid()
            OR approved_by = auth.uid()
            OR rejected_by = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = governance_approval_records.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS governance_approval_records_auth_write_policy ON public.governance_approval_records';
      EXECUTE $policy$
        CREATE POLICY governance_approval_records_auth_write_policy
          ON public.governance_approval_records
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = governance_approval_records.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
          WITH CHECK (
            (
              requested_by = auth.uid()
              OR approved_by = auth.uid()
              OR rejected_by = auth.uid()
            )
            AND EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = governance_approval_records.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.governance_approval_records TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS governance_approval_records_backend_runtime_policy ON public.governance_approval_records';
      EXECUTE $policy$
        CREATE POLICY governance_approval_records_backend_runtime_policy
          ON public.governance_approval_records
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.metric_value_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.metric_value_snapshots TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS metric_value_snapshots_auth_read_policy ON public.metric_value_snapshots';
      EXECUTE $policy$
        CREATE POLICY metric_value_snapshots_auth_read_policy
          ON public.metric_value_snapshots
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = metric_value_snapshots.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metric_value_snapshots TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS metric_value_snapshots_backend_runtime_policy ON public.metric_value_snapshots';
      EXECUTE $policy$
        CREATE POLICY metric_value_snapshots_backend_runtime_policy
          ON public.metric_value_snapshots
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.wbs_template_candidate_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wbs_template_candidate_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_events_auth_read_policy ON public.wbs_template_candidate_events';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_events_auth_read_policy
          ON public.wbs_template_candidate_events
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = wbs_template_candidate_events.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_events_auth_write_policy ON public.wbs_template_candidate_events';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_events_auth_write_policy
          ON public.wbs_template_candidate_events
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = wbs_template_candidate_events.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
          WITH CHECK (
            created_by = auth.uid()
            AND EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = wbs_template_candidate_events.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wbs_template_candidate_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_events_backend_runtime_policy ON public.wbs_template_candidate_events';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_events_backend_runtime_policy
          ON public.wbs_template_candidate_events
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.wbs_template_candidate_aggregations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.wbs_template_candidate_aggregations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_aggregations_auth_read_policy ON public.wbs_template_candidate_aggregations';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_aggregations_auth_read_policy
          ON public.wbs_template_candidate_aggregations
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = wbs_template_candidate_aggregations.project_id
                AND public.is_active_company_member(p.company_id, NULL::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wbs_template_candidate_aggregations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS wbs_template_candidate_aggregations_backend_runtime_policy ON public.wbs_template_candidate_aggregations';
      EXECUTE $policy$
        CREATE POLICY wbs_template_candidate_aggregations_backend_runtime_policy
          ON public.wbs_template_candidate_aggregations
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_experience_samples') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_samples TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_experience_samples_auth_read_policy ON public.duration_experience_samples';
      EXECUTE $policy$
        CREATE POLICY duration_experience_samples_auth_read_policy
          ON public.duration_experience_samples
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              COALESCE(duration_experience_samples.learning_scope, 'project') IN ('global', 'industry')
              OR EXISTS (
                SELECT 1
                FROM public.projects p
                WHERE p.id = duration_experience_samples.project_id
                  AND public.is_active_company_member(p.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS duration_experience_samples_auth_write_policy ON public.duration_experience_samples';
      EXECUTE $policy$
        CREATE POLICY duration_experience_samples_auth_write_policy
          ON public.duration_experience_samples
          FOR ALL
          TO authenticated
          USING (
            EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = duration_experience_samples.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
          WITH CHECK (
            COALESCE(duration_experience_samples.learning_scope, 'project') = 'project'
            AND EXISTS (
              SELECT 1
              FROM public.projects p
              WHERE p.id = duration_experience_samples.project_id
                AND public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_samples TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_experience_samples_backend_runtime_policy ON public.duration_experience_samples';
      EXECUTE $policy$
        CREATE POLICY duration_experience_samples_backend_runtime_policy
          ON public.duration_experience_samples
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.company_invitations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_invitations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS company_invitations_auth_read_policy ON public.company_invitations';
      EXECUTE $policy$
        CREATE POLICY company_invitations_auth_read_policy
          ON public.company_invitations
          FOR SELECT
          TO authenticated
          USING (
            recipient_user_id = auth.uid()
            OR invited_by = auth.uid()
            OR public.is_active_company_member(company_invitations.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS company_invitations_auth_write_policy ON public.company_invitations';
      EXECUTE $policy$
        CREATE POLICY company_invitations_auth_write_policy
          ON public.company_invitations
          FOR ALL
          TO authenticated
          USING (
            recipient_user_id = auth.uid()
            OR invited_by = auth.uid()
            OR public.is_active_company_member(company_invitations.company_id, ARRAY['company_admin']::TEXT[])
          )
          WITH CHECK (
            recipient_user_id = auth.uid()
            OR (
              invited_by = auth.uid()
              AND public.is_active_company_member(company_invitations.company_id, ARRAY['company_admin']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_invitations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS company_invitations_backend_runtime_policy ON public.company_invitations';
      EXECUTE $policy$
        CREATE POLICY company_invitations_backend_runtime_policy
          ON public.company_invitations
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_direct_invitations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_direct_invitations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_direct_invitations_auth_read_policy ON public.project_direct_invitations';
      EXECUTE $policy$
        CREATE POLICY project_direct_invitations_auth_read_policy
          ON public.project_direct_invitations
          FOR SELECT
          TO authenticated
          USING (
            recipient_user_id = auth.uid()
            OR invited_by = auth.uid()
            OR public.is_active_project_member(project_direct_invitations.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_direct_invitations.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS project_direct_invitations_auth_write_policy ON public.project_direct_invitations';
      EXECUTE $policy$
        CREATE POLICY project_direct_invitations_auth_write_policy
          ON public.project_direct_invitations
          FOR ALL
          TO authenticated
          USING (
            recipient_user_id = auth.uid()
            OR invited_by = auth.uid()
            OR public.is_active_project_member(project_direct_invitations.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_direct_invitations.company_id, ARRAY['company_admin']::TEXT[])
          )
          WITH CHECK (
            recipient_user_id = auth.uid()
            OR (
              invited_by = auth.uid()
              AND (
                public.is_active_project_member(project_direct_invitations.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
                OR public.is_active_company_member(project_direct_invitations.company_id, ARRAY['company_admin']::TEXT[])
              )
            )
            OR (
              public.is_active_project_member(project_direct_invitations.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
              OR public.is_active_company_member(project_direct_invitations.company_id, ARRAY['company_admin']::TEXT[])
            )
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_direct_invitations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_direct_invitations_backend_runtime_policy ON public.project_direct_invitations';
      EXECUTE $policy$
        CREATE POLICY project_direct_invitations_backend_runtime_policy
          ON public.project_direct_invitations
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_join_requests') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_join_requests TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_join_requests_auth_read_policy ON public.project_join_requests';
      EXECUTE $policy$
        CREATE POLICY project_join_requests_auth_read_policy
          ON public.project_join_requests
          FOR SELECT
          TO authenticated
          USING (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_project_member(project_join_requests.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS project_join_requests_auth_write_policy ON public.project_join_requests';
      EXECUTE $policy$
        CREATE POLICY project_join_requests_auth_write_policy
          ON public.project_join_requests
          FOR ALL
          TO authenticated
          USING (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_project_member(project_join_requests.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
          WITH CHECK (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_project_member(project_join_requests.project_id, ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[])
            OR public.is_active_company_member(project_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_join_requests TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_join_requests_backend_runtime_policy ON public.project_join_requests';
      EXECUTE $policy$
        CREATE POLICY project_join_requests_backend_runtime_policy
          ON public.project_join_requests
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.company_join_requests') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_join_requests TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS company_join_requests_auth_read_policy ON public.company_join_requests';
      EXECUTE $policy$
        CREATE POLICY company_join_requests_auth_read_policy
          ON public.company_join_requests
          FOR SELECT
          TO authenticated
          USING (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_company_member(company_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
      EXECUTE 'DROP POLICY IF EXISTS company_join_requests_auth_write_policy ON public.company_join_requests';
      EXECUTE $policy$
        CREATE POLICY company_join_requests_auth_write_policy
          ON public.company_join_requests
          FOR ALL
          TO authenticated
          USING (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_company_member(company_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
          WITH CHECK (
            user_id = auth.uid()
            OR reviewed_by = auth.uid()
            OR public.is_active_company_member(company_join_requests.company_id, ARRAY['company_admin']::TEXT[])
          )
      $policy$;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_join_requests TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS company_join_requests_backend_runtime_policy ON public.company_join_requests';
      EXECUTE $policy$
        CREATE POLICY company_join_requests_backend_runtime_policy
          ON public.company_join_requests
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Source: 253_v14231_advisor_public_rls_live_catalog_closeout.sql
-- Source: 257_v14231_warning_escalation_rpc_content_field.sql
-- Source: 258_v14231_db_lint_function_warning_closeout.sql
-- v1.4.23.1 follow-up: close the live Supabase Advisor public RLS
-- surface found on 2026-06-29. Catalog readback showed 31 public tables
-- with relrowsecurity=false; this is a new surface beyond migration 252.
--
-- Forward-only and idempotent. It enables RLS/FORCE RLS, grants
-- authenticated read only where a tenant/global read boundary exists, and
-- keeps mutation/write access behind the backend runtime role.

BEGIN;

ALTER TABLE IF EXISTS public.algorithm_caliber_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_caliber_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_import_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_quality_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_quality_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_records FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_upgrade_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_upgrade_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.algorithm_seed_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.certificate_template_apply_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.certificate_template_apply_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.company_project_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deletion_retention_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.deletion_retention_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.demo_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.demo_projects FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_algorithm_accuracy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_algorithm_accuracy_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_benchmarks FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_forecast_project_overlays ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_forecast_project_overlays FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_suggestion_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.duration_suggestion_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.material_arrival_to_condition ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.material_arrival_to_condition FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.metric_caliber_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.metric_caliber_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_climate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_climate_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_location_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_location_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_schedule_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_schedule_states FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_weather_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_weather_forecasts FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.regional_climate_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.regional_climate_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_shutdown_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.site_shutdown_events FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_duration_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_duration_forecasts FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_reconcile_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_reconcile_backups FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_coverage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_coverage_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_owner_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_owner_confirmations FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_policy_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_policy_configs FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_threshold_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warning_threshold_candidates FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.algorithm_catalog') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_catalog TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_catalog_authenticated_read_policy ON public.algorithm_catalog';
      EXECUTE $policy$
        CREATE POLICY algorithm_catalog_authenticated_read_policy
          ON public.algorithm_catalog
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              algorithm_catalog.ordinary_user_visible = true
              OR (
                algorithm_catalog.project_id IS NOT NULL
                AND public.is_active_project_member(algorithm_catalog.project_id, NULL::TEXT[])
              )
              OR (
                algorithm_catalog.company_id IS NOT NULL
                AND public.is_active_company_member(algorithm_catalog.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_caliber_versions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_caliber_versions TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_caliber_versions_authenticated_read_policy ON public.algorithm_caliber_versions';
      EXECUTE $policy$
        CREATE POLICY algorithm_caliber_versions_authenticated_read_policy
          ON public.algorithm_caliber_versions
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              (algorithm_caliber_versions.project_id IS NULL AND algorithm_caliber_versions.company_id IS NULL)
              OR (
                algorithm_caliber_versions.project_id IS NOT NULL
                AND public.is_active_project_member(algorithm_caliber_versions.project_id, NULL::TEXT[])
              )
              OR (
                algorithm_caliber_versions.company_id IS NOT NULL
                AND public.is_active_company_member(algorithm_caliber_versions.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_catalog') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_catalog TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_catalog_authenticated_read_policy ON public.algorithm_seed_catalog';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_catalog_authenticated_read_policy
          ON public.algorithm_seed_catalog
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              (algorithm_seed_catalog.project_id IS NULL AND algorithm_seed_catalog.company_id IS NULL)
              OR (
                algorithm_seed_catalog.project_id IS NOT NULL
                AND public.is_active_project_member(algorithm_seed_catalog.project_id, NULL::TEXT[])
              )
              OR (
                algorithm_seed_catalog.company_id IS NOT NULL
                AND public.is_active_company_member(algorithm_seed_catalog.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_versions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_versions TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_versions_authenticated_read_policy ON public.algorithm_seed_versions';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_versions_authenticated_read_policy
          ON public.algorithm_seed_versions
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_records') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_records TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_records_authenticated_read_policy ON public.algorithm_seed_records';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_records_authenticated_read_policy
          ON public.algorithm_seed_records
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.algorithm_seed_versions v
              WHERE v.id = algorithm_seed_records.seed_version_id
                AND v.status IN ('active', 'deprecated')
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_import_logs') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_import_logs TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_import_logs_authenticated_read_policy ON public.algorithm_seed_import_logs';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_import_logs_authenticated_read_policy
          ON public.algorithm_seed_import_logs
          FOR SELECT
          TO authenticated
          USING (algorithm_seed_import_logs.imported_by = auth.uid())
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_overrides') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_overrides TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_overrides_authenticated_read_policy ON public.algorithm_seed_overrides';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_overrides_authenticated_read_policy
          ON public.algorithm_seed_overrides
          FOR SELECT
          TO authenticated
          USING (
            algorithm_seed_overrides.created_by = auth.uid()
            OR algorithm_seed_overrides.published_by = auth.uid()
            OR (
              algorithm_seed_overrides.project_id IS NOT NULL
              AND public.is_active_project_member(algorithm_seed_overrides.project_id, NULL::TEXT[])
            )
            OR (
              algorithm_seed_overrides.company_id IS NOT NULL
              AND public.is_active_company_member(algorithm_seed_overrides.company_id, NULL::TEXT[])
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_upgrade_candidates') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_upgrade_candidates TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_upgrade_candidates_authenticated_read_policy ON public.algorithm_seed_upgrade_candidates';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_upgrade_candidates_authenticated_read_policy
          ON public.algorithm_seed_upgrade_candidates
          FOR SELECT
          TO authenticated
          USING (
            algorithm_seed_upgrade_candidates.created_by = auth.uid()
            OR (
              algorithm_seed_upgrade_candidates.project_id IS NOT NULL
              AND public.is_active_project_member(algorithm_seed_upgrade_candidates.project_id, NULL::TEXT[])
            )
            OR (
              algorithm_seed_upgrade_candidates.company_id IS NOT NULL
              AND public.is_active_company_member(algorithm_seed_upgrade_candidates.company_id, NULL::TEXT[])
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.algorithm_seed_quality_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.algorithm_seed_quality_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_quality_events_auth_read_policy ON public.algorithm_seed_quality_events';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_quality_events_auth_read_policy
          ON public.algorithm_seed_quality_events
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(algorithm_seed_quality_events.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.metric_caliber_versions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.metric_caliber_versions TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS metric_caliber_versions_authenticated_read_policy ON public.metric_caliber_versions';
      EXECUTE $policy$
        CREATE POLICY metric_caliber_versions_authenticated_read_policy
          ON public.metric_caliber_versions
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL)
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.demo_projects') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.demo_projects TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS demo_projects_authenticated_read_policy ON public.demo_projects';
      EXECUTE $policy$
        CREATE POLICY demo_projects_authenticated_read_policy
          ON public.demo_projects
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL AND demo_projects.is_active = true)
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.regional_climate_rules') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.regional_climate_rules TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS regional_climate_rules_authenticated_read_policy ON public.regional_climate_rules';
      EXECUTE $policy$
        CREATE POLICY regional_climate_rules_authenticated_read_policy
          ON public.regional_climate_rules
          FOR SELECT
          TO authenticated
          USING (auth.uid() IS NOT NULL AND regional_climate_rules.status = 'active')
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_benchmarks') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_benchmarks TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_benchmarks_authenticated_read_policy ON public.duration_benchmarks';
      EXECUTE $policy$
        CREATE POLICY duration_benchmarks_authenticated_read_policy
          ON public.duration_benchmarks
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              (duration_benchmarks.project_id IS NULL AND duration_benchmarks.company_id IS NULL)
              OR (
                duration_benchmarks.project_id IS NOT NULL
                AND public.is_active_project_member(duration_benchmarks.project_id, NULL::TEXT[])
              )
              OR (
                duration_benchmarks.company_id IS NOT NULL
                AND public.is_active_company_member(duration_benchmarks.company_id, NULL::TEXT[])
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_suggestion_overrides') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_suggestion_overrides TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_suggestion_overrides_authenticated_read_policy ON public.duration_suggestion_overrides';
      EXECUTE $policy$
        CREATE POLICY duration_suggestion_overrides_authenticated_read_policy
          ON public.duration_suggestion_overrides
          FOR SELECT
          TO authenticated
          USING (
            auth.uid() IS NOT NULL
            AND (
              duration_suggestion_overrides.created_by = auth.uid()
              OR (
                duration_suggestion_overrides.project_id IS NOT NULL
                AND public.is_active_project_member(duration_suggestion_overrides.project_id, NULL::TEXT[])
              )
              OR (
                duration_suggestion_overrides.company_id IS NOT NULL
                AND public.is_active_company_member(duration_suggestion_overrides.company_id, NULL::TEXT[])
              )
              OR (
                duration_suggestion_overrides.project_id IS NULL
                AND duration_suggestion_overrides.company_id IS NULL
                AND duration_suggestion_overrides.override_status = 'active'
              )
            )
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.company_project_templates') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.company_project_templates TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS company_project_templates_authenticated_read_policy ON public.company_project_templates';
      EXECUTE $policy$
        CREATE POLICY company_project_templates_authenticated_read_policy
          ON public.company_project_templates
          FOR SELECT
          TO authenticated
          USING (
            company_project_templates.deleted_at IS NULL
            AND public.is_active_company_member(company_project_templates.company_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.certificate_template_apply_batches') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.certificate_template_apply_batches TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS certificate_template_apply_batches_auth_read_policy ON public.certificate_template_apply_batches';
      EXECUTE $policy$
        CREATE POLICY certificate_template_apply_batches_auth_read_policy
          ON public.certificate_template_apply_batches
          FOR SELECT
          TO authenticated
          USING (
            certificate_template_apply_batches.applied_by = auth.uid()
            OR public.is_active_project_member(certificate_template_apply_batches.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.deletion_retention_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.deletion_retention_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS deletion_retention_events_auth_read_policy ON public.deletion_retention_events';
      EXECUTE $policy$
        CREATE POLICY deletion_retention_events_auth_read_policy
          ON public.deletion_retention_events
          FOR SELECT
          TO authenticated
          USING (
            deletion_retention_events.actor_id = auth.uid()
            OR deletion_retention_events.confirmed_by = auth.uid()
            OR public.is_active_project_member(deletion_retention_events.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_algorithm_accuracy_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_algorithm_accuracy_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_algorithm_accuracy_events_auth_read_policy ON public.duration_algorithm_accuracy_events';
      EXECUTE $policy$
        CREATE POLICY duration_algorithm_accuracy_events_auth_read_policy
          ON public.duration_algorithm_accuracy_events
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(duration_algorithm_accuracy_events.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.duration_forecast_project_overlays') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.duration_forecast_project_overlays TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS duration_forecast_project_overlays_auth_read_policy ON public.duration_forecast_project_overlays';
      EXECUTE $policy$
        CREATE POLICY duration_forecast_project_overlays_auth_read_policy
          ON public.duration_forecast_project_overlays
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(duration_forecast_project_overlays.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.material_arrival_to_condition') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.material_arrival_to_condition TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS material_arrival_to_condition_auth_project_member_read_policy ON public.material_arrival_to_condition';
      EXECUTE $policy$
        CREATE POLICY material_arrival_to_condition_auth_project_member_read_policy
          ON public.material_arrival_to_condition
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(material_arrival_to_condition.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_climate_profiles') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.project_climate_profiles TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_climate_profiles_auth_project_member_read_policy ON public.project_climate_profiles';
      EXECUTE $policy$
        CREATE POLICY project_climate_profiles_auth_project_member_read_policy
          ON public.project_climate_profiles
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(project_climate_profiles.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_location_observations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.project_location_observations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_location_observations_auth_read_policy ON public.project_location_observations';
      EXECUTE $policy$
        CREATE POLICY project_location_observations_auth_read_policy
          ON public.project_location_observations
          FOR SELECT
          TO authenticated
          USING (
            project_location_observations.observed_by_user_id = auth.uid()
            OR public.is_active_project_member(project_location_observations.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_schedule_states') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.project_schedule_states TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_schedule_states_auth_project_member_read_policy ON public.project_schedule_states';
      EXECUTE $policy$
        CREATE POLICY project_schedule_states_auth_project_member_read_policy
          ON public.project_schedule_states
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(project_schedule_states.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.project_weather_forecasts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.project_weather_forecasts TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS project_weather_forecasts_auth_project_member_read_policy ON public.project_weather_forecasts';
      EXECUTE $policy$
        CREATE POLICY project_weather_forecasts_auth_project_member_read_policy
          ON public.project_weather_forecasts
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(project_weather_forecasts.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.site_shutdown_events') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.site_shutdown_events TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS site_shutdown_events_auth_project_member_read_policy ON public.site_shutdown_events';
      EXECUTE $policy$
        CREATE POLICY site_shutdown_events_auth_project_member_read_policy
          ON public.site_shutdown_events
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(site_shutdown_events.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.task_duration_forecasts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.task_duration_forecasts TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS task_duration_forecasts_auth_project_member_read_policy ON public.task_duration_forecasts';
      EXECUTE $policy$
        CREATE POLICY task_duration_forecasts_auth_project_member_read_policy
          ON public.task_duration_forecasts
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(task_duration_forecasts.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.task_reconcile_backups') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.task_reconcile_backups TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS task_reconcile_backups_auth_read_policy ON public.task_reconcile_backups';
      EXECUTE $policy$
        CREATE POLICY task_reconcile_backups_auth_read_policy
          ON public.task_reconcile_backups
          FOR SELECT
          TO authenticated
          USING (
            task_reconcile_backups.created_by = auth.uid()
            OR public.is_active_project_member(task_reconcile_backups.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.warning_coverage_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.warning_coverage_snapshots TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS warning_coverage_snapshots_auth_project_member_read_policy ON public.warning_coverage_snapshots';
      EXECUTE $policy$
        CREATE POLICY warning_coverage_snapshots_auth_project_member_read_policy
          ON public.warning_coverage_snapshots
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(warning_coverage_snapshots.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.warning_owner_confirmations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.warning_owner_confirmations TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS warning_owner_confirmations_auth_read_policy ON public.warning_owner_confirmations';
      EXECUTE $policy$
        CREATE POLICY warning_owner_confirmations_auth_read_policy
          ON public.warning_owner_confirmations
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(warning_owner_confirmations.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.warning_policy_configs') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.warning_policy_configs TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS warning_policy_configs_auth_project_member_read_policy ON public.warning_policy_configs';
      EXECUTE $policy$
        CREATE POLICY warning_policy_configs_auth_project_member_read_policy
          ON public.warning_policy_configs
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(warning_policy_configs.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;

  IF to_regclass('public.warning_threshold_candidates') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.warning_threshold_candidates TO authenticated';
      EXECUTE 'DROP POLICY IF EXISTS warning_threshold_candidates_auth_project_member_read_policy ON public.warning_threshold_candidates';
      EXECUTE $policy$
        CREATE POLICY warning_threshold_candidates_auth_project_member_read_policy
          ON public.warning_threshold_candidates
          FOR SELECT
          TO authenticated
          USING (
            public.is_active_project_member(warning_threshold_candidates.project_id, NULL::TEXT[])
          )
      $policy$;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    IF to_regclass('public.algorithm_caliber_versions') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_caliber_versions TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_caliber_versions_backend_runtime_policy ON public.algorithm_caliber_versions';
      EXECUTE $policy$
        CREATE POLICY algorithm_caliber_versions_backend_runtime_policy
          ON public.algorithm_caliber_versions
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.algorithm_catalog') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_catalog TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_catalog_backend_runtime_policy ON public.algorithm_catalog';
      EXECUTE $policy$
        CREATE POLICY algorithm_catalog_backend_runtime_policy
          ON public.algorithm_catalog
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.algorithm_seed_catalog') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_catalog TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_catalog_backend_runtime_policy ON public.algorithm_seed_catalog';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_catalog_backend_runtime_policy
          ON public.algorithm_seed_catalog
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.algorithm_seed_import_logs') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_import_logs TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_import_logs_backend_runtime_policy ON public.algorithm_seed_import_logs';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_import_logs_backend_runtime_policy
          ON public.algorithm_seed_import_logs
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.algorithm_seed_overrides') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_overrides TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_overrides_backend_runtime_policy ON public.algorithm_seed_overrides';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_overrides_backend_runtime_policy
          ON public.algorithm_seed_overrides
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.algorithm_seed_quality_events') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_quality_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_quality_events_backend_runtime_policy ON public.algorithm_seed_quality_events';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_quality_events_backend_runtime_policy
          ON public.algorithm_seed_quality_events
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.algorithm_seed_records') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_records TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_records_backend_runtime_policy ON public.algorithm_seed_records';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_records_backend_runtime_policy
          ON public.algorithm_seed_records
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.algorithm_seed_upgrade_candidates') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_upgrade_candidates TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_upgrade_candidates_backend_runtime_policy ON public.algorithm_seed_upgrade_candidates';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_upgrade_candidates_backend_runtime_policy
          ON public.algorithm_seed_upgrade_candidates
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.algorithm_seed_versions') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_seed_versions TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS algorithm_seed_versions_backend_runtime_policy ON public.algorithm_seed_versions';
      EXECUTE $policy$
        CREATE POLICY algorithm_seed_versions_backend_runtime_policy
          ON public.algorithm_seed_versions
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.certificate_template_apply_batches') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.certificate_template_apply_batches TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS certificate_template_apply_batches_backend_runtime_policy ON public.certificate_template_apply_batches';
      EXECUTE $policy$
        CREATE POLICY certificate_template_apply_batches_backend_runtime_policy
          ON public.certificate_template_apply_batches
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.company_project_templates') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_project_templates TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS company_project_templates_backend_runtime_policy ON public.company_project_templates';
      EXECUTE $policy$
        CREATE POLICY company_project_templates_backend_runtime_policy
          ON public.company_project_templates
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.deletion_retention_events') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deletion_retention_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS deletion_retention_events_backend_runtime_policy ON public.deletion_retention_events';
      EXECUTE $policy$
        CREATE POLICY deletion_retention_events_backend_runtime_policy
          ON public.deletion_retention_events
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.demo_projects') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.demo_projects TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS demo_projects_backend_runtime_policy ON public.demo_projects';
      EXECUTE $policy$
        CREATE POLICY demo_projects_backend_runtime_policy
          ON public.demo_projects
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.duration_algorithm_accuracy_events') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_algorithm_accuracy_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_algorithm_accuracy_events_backend_runtime_policy ON public.duration_algorithm_accuracy_events';
      EXECUTE $policy$
        CREATE POLICY duration_algorithm_accuracy_events_backend_runtime_policy
          ON public.duration_algorithm_accuracy_events
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.duration_benchmarks') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_benchmarks TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_benchmarks_backend_runtime_policy ON public.duration_benchmarks';
      EXECUTE $policy$
        CREATE POLICY duration_benchmarks_backend_runtime_policy
          ON public.duration_benchmarks
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.duration_forecast_project_overlays') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_forecast_project_overlays TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_forecast_project_overlays_backend_runtime_policy ON public.duration_forecast_project_overlays';
      EXECUTE $policy$
        CREATE POLICY duration_forecast_project_overlays_backend_runtime_policy
          ON public.duration_forecast_project_overlays
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.duration_suggestion_overrides') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_suggestion_overrides TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS duration_suggestion_overrides_backend_runtime_policy ON public.duration_suggestion_overrides';
      EXECUTE $policy$
        CREATE POLICY duration_suggestion_overrides_backend_runtime_policy
          ON public.duration_suggestion_overrides
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.material_arrival_to_condition') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.material_arrival_to_condition TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS material_arrival_to_condition_backend_runtime_policy ON public.material_arrival_to_condition';
      EXECUTE $policy$
        CREATE POLICY material_arrival_to_condition_backend_runtime_policy
          ON public.material_arrival_to_condition
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.metric_caliber_versions') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metric_caliber_versions TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS metric_caliber_versions_backend_runtime_policy ON public.metric_caliber_versions';
      EXECUTE $policy$
        CREATE POLICY metric_caliber_versions_backend_runtime_policy
          ON public.metric_caliber_versions
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.project_climate_profiles') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_climate_profiles TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_climate_profiles_backend_runtime_policy ON public.project_climate_profiles';
      EXECUTE $policy$
        CREATE POLICY project_climate_profiles_backend_runtime_policy
          ON public.project_climate_profiles
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.project_location_observations') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_location_observations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_location_observations_backend_runtime_policy ON public.project_location_observations';
      EXECUTE $policy$
        CREATE POLICY project_location_observations_backend_runtime_policy
          ON public.project_location_observations
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.project_schedule_states') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_schedule_states TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_schedule_states_backend_runtime_policy ON public.project_schedule_states';
      EXECUTE $policy$
        CREATE POLICY project_schedule_states_backend_runtime_policy
          ON public.project_schedule_states
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.project_weather_forecasts') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_weather_forecasts TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS project_weather_forecasts_backend_runtime_policy ON public.project_weather_forecasts';
      EXECUTE $policy$
        CREATE POLICY project_weather_forecasts_backend_runtime_policy
          ON public.project_weather_forecasts
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.regional_climate_rules') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.regional_climate_rules TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS regional_climate_rules_backend_runtime_policy ON public.regional_climate_rules';
      EXECUTE $policy$
        CREATE POLICY regional_climate_rules_backend_runtime_policy
          ON public.regional_climate_rules
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.site_shutdown_events') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_shutdown_events TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS site_shutdown_events_backend_runtime_policy ON public.site_shutdown_events';
      EXECUTE $policy$
        CREATE POLICY site_shutdown_events_backend_runtime_policy
          ON public.site_shutdown_events
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.task_duration_forecasts') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_duration_forecasts TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS task_duration_forecasts_backend_runtime_policy ON public.task_duration_forecasts';
      EXECUTE $policy$
        CREATE POLICY task_duration_forecasts_backend_runtime_policy
          ON public.task_duration_forecasts
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.task_reconcile_backups') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_reconcile_backups TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS task_reconcile_backups_backend_runtime_policy ON public.task_reconcile_backups';
      EXECUTE $policy$
        CREATE POLICY task_reconcile_backups_backend_runtime_policy
          ON public.task_reconcile_backups
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.warning_coverage_snapshots') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warning_coverage_snapshots TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS warning_coverage_snapshots_backend_runtime_policy ON public.warning_coverage_snapshots';
      EXECUTE $policy$
        CREATE POLICY warning_coverage_snapshots_backend_runtime_policy
          ON public.warning_coverage_snapshots
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.warning_owner_confirmations') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warning_owner_confirmations TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS warning_owner_confirmations_backend_runtime_policy ON public.warning_owner_confirmations';
      EXECUTE $policy$
        CREATE POLICY warning_owner_confirmations_backend_runtime_policy
          ON public.warning_owner_confirmations
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.warning_policy_configs') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warning_policy_configs TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS warning_policy_configs_backend_runtime_policy ON public.warning_policy_configs';
      EXECUTE $policy$
        CREATE POLICY warning_policy_configs_backend_runtime_policy
          ON public.warning_policy_configs
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.warning_threshold_candidates') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warning_threshold_candidates TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS warning_threshold_candidates_backend_runtime_policy ON public.warning_threshold_candidates';
      EXECUTE $policy$
        CREATE POLICY warning_threshold_candidates_backend_runtime_policy
          ON public.warning_threshold_candidates
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Source: 259_v14231_supabase_advisor_security_closeout.sql
-- v1.4.23.1 Supabase Advisor security closeout.
--
-- Closes the staging Advisor security findings that remained after the RLS
-- disabled table pass: RLS-enabled tables without policies, always-true health
-- history write policies, mutable function search_path, and ltree in public.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'ltree') THEN
    ALTER EXTENSION ltree SET SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA extensions;
  END IF;
END $$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'acceptance_catalog',
    'acceptance_dependencies',
    'acceptance_nodes',
    'acceptance_requirements',
    'alerts',
    'certificate_approvals',
    'certificate_dependencies',
    'certificate_work_items',
    'change_logs',
    'construction_drawings',
    'data_confidence_snapshots',
    'data_quality_findings',
    'drawing_package_items',
    'drawing_packages',
    'drawing_review_rules',
    'drawing_versions',
    'duration_plan_network_outcomes',
    'issues',
    'job_execution_logs',
    'job_failures',
    'milestones',
    'participant_units',
    'planning_draft_locks',
    'planning_governance_states',
    'pre_milestone_conditions',
    'pre_milestone_dependencies',
    'pre_milestones',
    'project_data_quality_settings',
    'project_invitations',
    'project_materials',
    'project_members',
    'responsibility_alert_states',
    'responsibility_watchlist',
    'revision_pool_candidates',
    'risks',
    'schema_migrations',
    'standard_processes',
    'task_completion_reports',
    'task_critical_overrides',
    'task_locks',
    'task_milestones',
    'task_preceding_relations',
    'task_progress_snapshots',
    'trigger_execution_logs',
    'warning_acknowledgments',
    'warnings',
    'wbs_structure',
    'wbs_task_links',
    'wbs_template_nodes',
    'wbs_templates',
    'weekly_digests'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO workbuddy_runtime', table_name);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_backend_runtime_policy', table_name);
        EXECUTE format($policy$
          CREATE POLICY %I
            ON public.%I
            FOR ALL
            TO workbuddy_runtime
            USING (
              current_user = 'workbuddy_runtime'
              OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
            )
            WITH CHECK (
              current_user = 'workbuddy_runtime'
              OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
            )
        $policy$, table_name || '_backend_runtime_policy', table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.project_health_history') IS NOT NULL THEN
    ALTER TABLE public.project_health_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.project_health_history FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS health_history_select ON public.project_health_history;
    DROP POLICY IF EXISTS health_history_insert ON public.project_health_history;
    DROP POLICY IF EXISTS health_history_update ON public.project_health_history;
    DROP POLICY IF EXISTS project_health_history_auth_project_member_read_policy ON public.project_health_history;
    DROP POLICY IF EXISTS project_health_history_backend_runtime_policy ON public.project_health_history;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_health_history FROM anon;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_health_history FROM authenticated;
      GRANT SELECT ON TABLE public.project_health_history TO authenticated;

      CREATE POLICY project_health_history_auth_project_member_read_policy
        ON public.project_health_history
        FOR SELECT
        TO authenticated
        USING (
          auth.uid() IS NOT NULL
          AND public.is_active_project_member(project_health_history.project_id, NULL::TEXT[])
        );
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_health_history TO workbuddy_runtime;

      CREATE POLICY project_health_history_backend_runtime_policy
        ON public.project_health_history
        FOR ALL
        TO workbuddy_runtime
        USING (
          current_user = 'workbuddy_runtime'
          OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
        )
        WITH CHECK (
          current_user = 'workbuddy_runtime'
          OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
        );
    END IF;
  END IF;
END $$;

DO $$
DECLARE
  function_name TEXT;
  function_identity TEXT;
BEGIN
  FOREACH function_name IN ARRAY ARRAY[
    'auto_complete_conditions',
    'auto_record_progress_snapshot',
    'auto_resolve_obstacles_on_task_complete',
    'check_lineage_events_append_only',
    'check_task_dependencies_same_project',
    'check_task_milestone_reference',
    'cleanup_milestone_references_on_cancel',
    'cleanup_old_job_logs',
    'confirm_warning_as_risk_atomic',
    'create_certificate_work_item_atomic',
    'create_issue_from_risk_atomic',
    'deactivate_target_project_entity_links_before_delete',
    'delete_risk_with_source_backfill_atomic',
    'delete_task_condition_with_source_backfill_atomic',
    'delete_task_obstacle_with_source_backfill_atomic',
    'delete_task_with_source_backfill_atomic',
    'fill_notification_company_id',
    'fn_update_pre_milestone_status',
    'has_project_edit_permission',
    'is_project_owner',
    'mark_source_deleted_on_downstream_atomic',
    'prevent_delete_active_project_entity_links',
    'protect_upgrade_chain_issue_delete',
    'protect_upgrade_chain_risk_delete',
    'record_task_timeline_event',
    'safe_generate_completion_report',
    'set_duration_forecast_residual_overlay_publication_key',
    'set_notification_company_id',
    'set_updated_at',
    'set_wbs_template_company_id',
    'sync_task_condition_status',
    'sync_task_timeline_for_condition',
    'sync_task_timeline_for_obstacle',
    'sync_task_timeline_for_task',
    'update_certificate_approvals_timestamp',
    'update_certificate_work_items_timestamp',
    'update_construction_drawings_updated_at',
    'update_drawing_package_items_updated_at',
    'update_drawing_packages_updated_at',
    'update_drawing_review_rules_updated_at',
    'update_drawing_versions_updated_at',
    'update_engineering_categories_updated_at',
    'update_engineering_objects_updated_at',
    'update_issues_updated_at',
    'update_project_daily_snapshot_updated_at',
    'update_project_entity_links_updated_at',
    'update_risk_statistics_updated_at',
    'update_task_conditions_updated_at',
    'update_task_dependencies_updated_at',
    'update_task_obstacles_updated_at',
    'update_task_progress_on_condition_complete',
    'update_updated_at_column',
    'update_warnings_updated_at'
  ] LOOP
    FOR function_identity IN
      SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = function_name
    LOOP
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', function_identity);
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Source: 278_v14231_post277_advisor_security_rpc_acl_closeout.sql
-- v1.4.23.1 post-277 Supabase Advisor security RPC ACL closeout.
--
-- Public exposed SECURITY DEFINER helpers must not be executable through
-- PostgREST RPC by anon/authenticated roles. Keep RLS predicates functional by
-- moving their callable surface to a non-exposed private schema, then revoke
-- public RPC execution and hide the legacy dashboard materialized view from API
-- roles.

BEGIN;

CREATE SCHEMA IF NOT EXISTS workbuddy_private;

REVOKE ALL ON SCHEMA workbuddy_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION workbuddy_private.is_active_company_member(
  p_company_id UUID,
  p_allowed_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
      AND (
        p_allowed_roles IS NULL
        OR cm.role = ANY(p_allowed_roles)
      )
  );
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.is_active_project_member(
  p_project_id UUID,
  p_allowed_permission_levels TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND COALESCE(pm.is_active, true) = true
      AND (
        p_allowed_permission_levels IS NULL
        OR pm.permission_level = ANY(p_allowed_permission_levels)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = auth.uid()
      AND (
        p_allowed_permission_levels IS NULL
        OR p_allowed_permission_levels && ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[]
      )
  );
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.is_project_member(
  project_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = project_uuid
      AND user_id = user_uuid
      AND COALESCE(is_active, true) = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.is_project_owner(
  project_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = project_uuid
      AND owner_id = user_uuid
  );
END;
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.has_project_edit_permission(
  project_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = project_uuid
      AND user_id = user_uuid
      AND COALESCE(is_active, true) = true
      AND permission_level IN ('owner', 'project_owner', 'editor', 'project_editor')
  ) OR EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = project_uuid
      AND owner_id = user_uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION workbuddy_private.is_active_project_member(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION workbuddy_private.is_project_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION workbuddy_private.is_project_owner(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION workbuddy_private.has_project_edit_permission(UUID, UUID) FROM PUBLIC;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'workbuddy_runtime',
    'workbuddy_runtime_login'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA workbuddy_private TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_project_member(UUID, TEXT[]) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.is_project_member(UUID, UUID) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.is_project_owner(UUID, UUID) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.has_project_edit_permission(UUID, UUID) TO %I', role_name);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  policy_record RECORD;
  role_text TEXT;
  command_text TEXT;
  using_expr TEXT;
  check_expr TEXT;
  create_sql TEXT;
BEGIN
  FOR policy_record IN
    SELECT n.nspname,
           c.relname,
           p.polname,
           p.polcmd,
           p.polpermissive,
           p.polroles,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND (
         COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ~* '(^|[^[:alnum:]_.])(public\.)?(is_active_company_member|is_active_project_member|is_project_member|is_project_owner|has_project_edit_permission)\s*\('
         OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* '(^|[^[:alnum:]_.])(public\.)?(is_active_company_member|is_active_project_member|is_project_member|is_project_owner|has_project_edit_permission)\s*\('
       )
  LOOP
    SELECT string_agg(
             CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END,
             ', '
             ORDER BY role_oid
           )
      INTO role_text
      FROM unnest(policy_record.polroles) AS role_oid
      LEFT JOIN pg_roles r ON r.oid = role_oid;

    role_text := COALESCE(NULLIF(role_text, ''), 'PUBLIC');

    command_text := CASE policy_record.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
      ELSE 'ALL'
    END;

    using_expr := policy_record.using_expr;
    check_expr := policy_record.check_expr;

    IF using_expr IS NOT NULL THEN
      using_expr := regexp_replace(using_expr, 'public\.is_active_company_member\s*\(', 'workbuddy_private.is_active_company_member(', 'gi');
      using_expr := regexp_replace(using_expr, 'public\.is_active_project_member\s*\(', 'workbuddy_private.is_active_project_member(', 'gi');
      using_expr := regexp_replace(using_expr, 'public\.is_project_member\s*\(', 'workbuddy_private.is_project_member(', 'gi');
      using_expr := regexp_replace(using_expr, 'public\.is_project_owner\s*\(', 'workbuddy_private.is_project_owner(', 'gi');
      using_expr := regexp_replace(using_expr, 'public\.has_project_edit_permission\s*\(', 'workbuddy_private.has_project_edit_permission(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])is_active_company_member\s*\(', '\1workbuddy_private.is_active_company_member(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])is_active_project_member\s*\(', '\1workbuddy_private.is_active_project_member(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])is_project_member\s*\(', '\1workbuddy_private.is_project_member(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])is_project_owner\s*\(', '\1workbuddy_private.is_project_owner(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])has_project_edit_permission\s*\(', '\1workbuddy_private.has_project_edit_permission(', 'gi');
    END IF;

    IF check_expr IS NOT NULL THEN
      check_expr := regexp_replace(check_expr, 'public\.is_active_company_member\s*\(', 'workbuddy_private.is_active_company_member(', 'gi');
      check_expr := regexp_replace(check_expr, 'public\.is_active_project_member\s*\(', 'workbuddy_private.is_active_project_member(', 'gi');
      check_expr := regexp_replace(check_expr, 'public\.is_project_member\s*\(', 'workbuddy_private.is_project_member(', 'gi');
      check_expr := regexp_replace(check_expr, 'public\.is_project_owner\s*\(', 'workbuddy_private.is_project_owner(', 'gi');
      check_expr := regexp_replace(check_expr, 'public\.has_project_edit_permission\s*\(', 'workbuddy_private.has_project_edit_permission(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])is_active_company_member\s*\(', '\1workbuddy_private.is_active_company_member(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])is_active_project_member\s*\(', '\1workbuddy_private.is_active_project_member(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])is_project_member\s*\(', '\1workbuddy_private.is_project_member(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])is_project_owner\s*\(', '\1workbuddy_private.is_project_owner(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])has_project_edit_permission\s*\(', '\1workbuddy_private.has_project_edit_permission(', 'gi');
    END IF;

    create_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      policy_record.polname,
      policy_record.nspname,
      policy_record.relname,
      CASE WHEN policy_record.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      command_text,
      role_text
    );

    IF using_expr IS NOT NULL AND command_text IN ('SELECT', 'UPDATE', 'DELETE', 'ALL') THEN
      create_sql := create_sql || format(' USING (%s)', using_expr);
    END IF;

    IF check_expr IS NOT NULL AND command_text IN ('INSERT', 'UPDATE', 'ALL') THEN
      create_sql := create_sql || format(' WITH CHECK (%s)', check_expr);
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_record.polname, policy_record.nspname, policy_record.relname);
    EXECUTE create_sql;
  END LOOP;
END $$;

DO $$
DECLARE
  function_identity TEXT;
  role_name TEXT;
BEGIN
  FOREACH function_identity IN ARRAY ARRAY[
    'public.has_project_edit_permission(uuid, uuid)',
    'public.is_active_company_member(uuid, text[])',
    'public.is_active_project_member(uuid, text[])',
    'public.is_project_member(uuid, uuid)',
    'public.is_project_owner(uuid, uuid)'
  ] LOOP
    IF to_regprocedure(function_identity) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', function_identity);

      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', function_identity, role_name);
        END IF;
      END LOOP;

      FOREACH role_name IN ARRAY ARRAY['service_role', 'workbuddy_runtime', 'workbuddy_runtime_login'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', function_identity, role_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  IF to_regclass('public.mv_project_dashboard') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.mv_project_dashboard FROM PUBLIC;

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.mv_project_dashboard FROM %I', role_name);
      END IF;
    END LOOP;

    FOREACH role_name IN ARRAY ARRAY['service_role', 'workbuddy_runtime', 'workbuddy_runtime_login'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('GRANT SELECT ON TABLE public.mv_project_dashboard TO %I', role_name);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Source: 264_v14231_default_master_plan_runtime_publication_asset_kind.sql
-- v1.4.23.1 default master-plan runtime publication asset-kind closeout.
-- This only extends the governed WBS template runtime publication discriminator.
-- It does not write wbs_templates, wbs_template_nodes, tasks, task_baselines,
-- task_dependencies, or algorithm seed runtime.

BEGIN;

ALTER TABLE public.wbs_template_runtime_publications
  DROP CONSTRAINT IF EXISTS wbs_template_runtime_publications_asset_kind_check;

ALTER TABLE public.wbs_template_runtime_publications
  ADD CONSTRAINT wbs_template_runtime_publications_asset_kind_check
  CHECK (asset_kind IN ('special_work_duration_seed', 'wbs_reference_days', 'default_master_plan'));

COMMENT ON CONSTRAINT wbs_template_runtime_publications_asset_kind_check
  ON public.wbs_template_runtime_publications IS
  'Allows governed WBS template runtime assets, including default master-plan accepted baseline runtime publication; does not write wbs_templates, wbs_template_nodes, tasks, task_baselines, task_dependencies, or algorithm seed runtime.';

COMMENT ON TABLE public.wbs_template_runtime_publications IS
  'v1.4.22.3 governed WBS template runtime publications, extended by v1.4.23.1 for default master-plan accepted baseline runtime publication. This table is the runtime publication/audit boundary and does not write wbs_templates, wbs_template_nodes, tasks, task_baselines, task_dependencies, or algorithm seed runtime.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Source: 277_v14231_algorithm_asset_candidate_experience_tier.sql
-- v1.4.23.1: promote experience tier fields on algorithm asset candidates.
-- The JSON payload remains the compatibility envelope; these nullable columns
-- provide indexed governance reads for T1/T2/T3 candidate assets.

BEGIN;

ALTER TABLE public.algorithm_asset_candidate_events
  ADD COLUMN IF NOT EXISTS experience_tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS experience_asset_type TEXT NULL;

UPDATE public.algorithm_asset_candidate_events
SET experience_tier = UPPER(candidate_payload->>'experienceTier')
WHERE experience_tier IS NULL
  AND UPPER(candidate_payload->>'experienceTier') IN ('T1', 'T2', 'T3');

UPDATE public.algorithm_asset_candidate_events
SET experience_asset_type = NULLIF(candidate_payload->>'experienceAssetType', '')
WHERE experience_asset_type IS NULL
  AND NULLIF(candidate_payload->>'experienceAssetType', '') IS NOT NULL;

UPDATE public.algorithm_asset_candidate_events
SET experience_asset_type = NULLIF(candidate_payload->>'experience_asset_type', '')
WHERE experience_asset_type IS NULL
  AND NULLIF(candidate_payload->>'experience_asset_type', '') IS NOT NULL;

ALTER TABLE public.algorithm_asset_candidate_events
  DROP CONSTRAINT IF EXISTS algorithm_asset_candidate_events_experience_tier_check;

ALTER TABLE public.algorithm_asset_candidate_events
  ADD CONSTRAINT algorithm_asset_candidate_events_experience_tier_check
  CHECK (experience_tier IS NULL OR experience_tier IN ('T1', 'T2', 'T3'));

CREATE INDEX IF NOT EXISTS idx_algorithm_asset_candidate_events_experience_tier
  ON public.algorithm_asset_candidate_events(experience_tier, experience_asset_type, learning_target, event_status)
  WHERE experience_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_algorithm_asset_candidate_events_experience_scope
  ON public.algorithm_asset_candidate_events(scope_level, company_id, project_id, experience_tier, event_status)
  WHERE experience_tier IS NOT NULL;

COMMENT ON COLUMN public.algorithm_asset_candidate_events.experience_tier IS
  'Nullable first-class T1/T2/T3 experience tier copied from candidate_payload for governed candidate lookup.';

COMMENT ON COLUMN public.algorithm_asset_candidate_events.experience_asset_type IS
  'Nullable first-class experience asset type copied from candidate_payload for governed candidate lookup.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Source: 279_v14231_wbs_template_runtime_publication_runtime_rls.sql
-- v1.4.23.1 default master-plan WBS template runtime backend role RLS closeout.
-- This grants the backend runtime role access to governed WBS template runtime
-- publication records. It does not grant access to templates, tasks, baselines,
-- task_dependencies, or seed runtime.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_publications TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_events TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS wbs_template_runtime_publications_backend_runtime
  ON public.wbs_template_runtime_publications;
CREATE POLICY wbs_template_runtime_publications_backend_runtime
  ON public.wbs_template_runtime_publications
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS wbs_template_runtime_events_backend_runtime
  ON public.wbs_template_runtime_events;
CREATE POLICY wbs_template_runtime_events_backend_runtime
  ON public.wbs_template_runtime_events
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON POLICY wbs_template_runtime_publications_backend_runtime
  ON public.wbs_template_runtime_publications IS
  'Allows the backend runtime role to consume and maintain governed WBS template runtime publication records, including default master-plan runtime publications; does not grant access to templates, tasks, baselines, task_dependencies, or seed runtime.';

COMMENT ON POLICY wbs_template_runtime_events_backend_runtime
  ON public.wbs_template_runtime_events IS
  'Allows the backend runtime role to consume and maintain governed WBS template runtime publication event records without granting access to templates, tasks, baselines, task_dependencies, or seed runtime.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 280_auth_password_reset_required.sql
-- ============================================================
-- Require users who receive an administrator-issued temporary password to rotate it.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.password_reset_required IS
  'True after an administrator password reset; cleared only by a successful authenticated password change.';

-- ============================================================
-- Source: 281_v14231_duration_context_policy_learning_checkpoints.sql
-- ============================================================
-- Durable, stage-level recovery for the duration-context policy learning sweep.
-- The service role owns writes. Client roles must not read or mutate job internals.

CREATE TABLE IF NOT EXISTS public.duration_context_policy_learning_checkpoints (
  operation_id TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  stage_status TEXT NOT NULL CHECK (stage_status IN ('running', 'succeeded', 'failed')),
  input_hash TEXT NOT NULL,
  output_hash TEXT,
  output_payload JSONB,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  error_message TEXT,
  operation_identity JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (operation_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_learning_checkpoint_status
  ON public.duration_context_policy_learning_checkpoints (stage_status, lease_expires_at);

ALTER TABLE public.duration_context_policy_learning_checkpoints ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_context_policy_learning_checkpoints FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_context_policy_learning_checkpoints TO service_role;

COMMENT ON TABLE public.duration_context_policy_learning_checkpoints IS
  'Durable operation/stage checkpoints for idempotent duration-context policy learning retries.';
COMMENT ON COLUMN public.duration_context_policy_learning_checkpoints.operation_id IS
  'Stable digest of scheduled window, project scope, input fact digest, and learner version.';
COMMENT ON COLUMN public.duration_context_policy_learning_checkpoints.output_hash IS
  'SHA-256 of canonical output_payload; retries reject mismatched persisted output.';

-- ============================================================
-- Source: 282_v14231_learnable_parameter_release_event_idempotency.sql
-- ============================================================
-- Idempotency boundary for publication, monitoring, and rollback events emitted by
-- durable learning operations. Historical events remain nullable and unchanged.

ALTER TABLE public.algorithm_learnable_parameter_release_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_learnable_parameter_release_event_idempotency
  ON public.algorithm_learnable_parameter_release_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.algorithm_learnable_parameter_release_events.idempotency_key IS
  'Stable operation/stage/effect key; retries do not create duplicate publication, monitoring, or rollback events.';

-- ============================================================
-- Source: 283_v14231_duration_asset_baseline_revision_operations.sql
-- ============================================================
-- Durable idempotency boundary for stable-duration-publication baseline drafts.

CREATE TABLE IF NOT EXISTS public.duration_asset_baseline_revision_operations (
  idempotency_key TEXT PRIMARY KEY,
  operation_status TEXT NOT NULL CHECK (operation_status IN ('running', 'succeeded', 'failed')),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  operation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  operation_result JSONB,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_duration_asset_baseline_revision_operation_status
  ON public.duration_asset_baseline_revision_operations (operation_status, lease_expires_at);

ALTER TABLE public.duration_asset_baseline_revision_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_asset_baseline_revision_operations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_asset_baseline_revision_operations TO service_role;

COMMENT ON TABLE public.duration_asset_baseline_revision_operations IS
  'One durable operation per stable duration publication and confirmed baseline; results are draft-only and require PM confirmation.';

-- ============================================================
-- Source: 290_company_scoped_session_revocation.sql
-- ============================================================
ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS session_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.company_members.session_revoked_at IS
  'Reject JWTs issued at or before this timestamp only when accessing this company scope.';

-- ============================================================
-- Source: 291_commercial_atomicity_and_entitlements.sql
-- ============================================================
-- v1.4.23.2-B hardening: authoritative tiers, platform operator boundary,
-- registration-time commercial state and durable project metering.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_platform_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_platform_role_check
  CHECK (platform_role IN ('none', 'commercial_operator'));

ALTER TABLE public.company_commercial
  DROP CONSTRAINT IF EXISTS company_commercial_plan_tier_check;
ALTER TABLE public.company_commercial_orders
  DROP CONSTRAINT IF EXISTS company_commercial_orders_plan_tier_check;
ALTER TABLE public.company_commercial_audit
  DROP CONSTRAINT IF EXISTS company_commercial_audit_from_tier_check;
ALTER TABLE public.company_commercial_audit
  DROP CONSTRAINT IF EXISTS company_commercial_audit_to_tier_check;

UPDATE public.company_commercial
SET plan_tier = CASE WHEN plan_tier = 'enterprise' THEN 'group' ELSE plan_tier END;
UPDATE public.company_commercial_orders
SET plan_tier = CASE WHEN plan_tier = 'enterprise' THEN 'group' ELSE plan_tier END;
UPDATE public.company_commercial_audit
SET from_tier = CASE WHEN from_tier = 'enterprise' THEN 'group' ELSE from_tier END,
    to_tier = CASE WHEN to_tier = 'enterprise' THEN 'group' ELSE to_tier END;

ALTER TABLE public.company_commercial
  ADD CONSTRAINT company_commercial_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro', 'group'));
ALTER TABLE public.company_commercial_orders
  ADD CONSTRAINT company_commercial_orders_plan_tier_check
  CHECK (plan_tier IN ('free', 'starter', 'pro', 'group'));
ALTER TABLE public.company_commercial_audit
  ADD CONSTRAINT company_commercial_audit_from_tier_check
  CHECK (from_tier IS NULL OR from_tier IN ('free', 'starter', 'pro', 'group'));
ALTER TABLE public.company_commercial_audit
  ADD CONSTRAINT company_commercial_audit_to_tier_check
  CHECK (to_tier IS NULL OR to_tier IN ('free', 'starter', 'pro', 'group'));

ALTER TABLE public.company_commercial_audit
  DROP CONSTRAINT IF EXISTS company_commercial_audit_action_check;
ALTER TABLE public.company_commercial_audit
  ADD CONSTRAINT company_commercial_audit_action_check
  CHECK (action IN (
    'commercial_state_created',
    'commercial_metering_recorded',
    'commercial_state_changed',
    'commercial_payment_event_recorded',
    'commercial_payment_event_applied'
  ));

WITH active_counts AS (
  SELECT
    company_id,
    COUNT(*) FILTER (
      WHERE COALESCE(status, '') <> ALL(
        ARRAY['已暂停', '已完成', 'archived', 'deleted', 'inactive', 'cancelled', 'canceled']::TEXT[]
      )
    )::INT AS active_count
  FROM public.projects
  WHERE company_id IS NOT NULL
  GROUP BY company_id
)
UPDATE public.company_commercial commercial
SET active_project_limit = GREATEST(
  commercial.active_project_limit,
  COALESCE(active_counts.active_count, 0),
  CASE commercial.plan_tier
    WHEN 'starter' THEN 2
    WHEN 'pro' THEN 5
    WHEN 'free' THEN 1
    ELSE 0
  END
)
FROM active_counts
WHERE active_counts.company_id = commercial.company_id;

CREATE TABLE IF NOT EXISTS public.company_commercial_metering (
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  measured_on DATE NOT NULL DEFAULT CURRENT_DATE,
  active_project_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'project_table_trigger',
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, measured_on),
  CONSTRAINT company_commercial_metering_count_check CHECK (active_project_count >= 0)
);

CREATE OR REPLACE FUNCTION public.workbuddy_initialize_company_commercial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_commercial (
    company_id, plan_tier, commercial_state, active_project_limit,
    billing_enabled, onboarded_at
  ) VALUES (
    NEW.id, 'free', 'trial', 1, FALSE, COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO public.company_commercial_audit (
    company_id, action, to_state, to_tier, reason, payload
  ) VALUES (
    NEW.id,
    'commercial_state_created',
    'trial',
    'free',
    'company_created',
    jsonb_build_object('billingEnabled', FALSE, 'activeProjectLimit', 1)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workbuddy_initialize_company_commercial ON public.companies;
CREATE TRIGGER trg_workbuddy_initialize_company_commercial
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.workbuddy_initialize_company_commercial();

CREATE OR REPLACE FUNCTION public.workbuddy_meter_company_projects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_company_id UUID;
  active_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_company_id := OLD.company_id;
  ELSE
    affected_company_id := NEW.company_id;
  END IF;

  IF affected_company_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INT
  INTO active_count
  FROM public.projects
  WHERE company_id = affected_company_id
    AND COALESCE(status, '') <> ALL(
      ARRAY['已暂停', '已完成', 'archived', 'deleted', 'inactive', 'cancelled', 'canceled']::TEXT[]
    );

  INSERT INTO public.company_commercial_metering (
    company_id, measured_on, active_project_count, source, measured_at
  ) VALUES (
    affected_company_id, CURRENT_DATE, active_count, 'project_table_trigger', NOW()
  )
  ON CONFLICT (company_id, measured_on)
  DO UPDATE SET
    active_project_count = EXCLUDED.active_project_count,
    source = EXCLUDED.source,
    measured_at = EXCLUDED.measured_at;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workbuddy_meter_company_projects ON public.projects;
CREATE TRIGGER trg_workbuddy_meter_company_projects
AFTER INSERT OR UPDATE OR DELETE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.workbuddy_meter_company_projects();

ALTER TABLE public.company_commercial_metering ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_commercial_metering FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_commercial_metering_select_policy ON public.company_commercial_metering;
CREATE POLICY company_commercial_metering_select_policy
ON public.company_commercial_metering
FOR SELECT
USING (
  public.is_active_company_member(company_id, ARRAY['company_admin']::TEXT[])
  OR current_user = 'workbuddy_runtime'
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.company_commercial_metering TO workbuddy_runtime;
    GRANT EXECUTE ON FUNCTION public.workbuddy_initialize_company_commercial() TO workbuddy_runtime;
    GRANT EXECUTE ON FUNCTION public.workbuddy_meter_company_projects() TO workbuddy_runtime;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- Source: 292_certificate_template_apply_concurrency.sql
-- ============================================================
-- Serialize certificate template application per project and make retries durable.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.certificate_template_apply_batches
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE public.certificate_template_apply_batches
  ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;

UPDATE public.certificate_template_apply_batches
SET idempotency_key = 'legacy:' || id::TEXT
WHERE idempotency_key IS NULL OR btrim(idempotency_key) = '';

UPDATE public.certificate_template_apply_batches
SET request_fingerprint = encode(
  digest(
    concat_ws(
      ':',
      project_id::TEXT,
      template_code,
      seed_version,
      id::TEXT
    ),
    'sha256'
  ),
  'hex'
)
WHERE request_fingerprint IS NULL OR btrim(request_fingerprint) = '';

ALTER TABLE public.certificate_template_apply_batches
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE public.certificate_template_apply_batches
  ALTER COLUMN request_fingerprint SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_certificate_template_apply_batches_idempotency
  ON public.certificate_template_apply_batches(project_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_template_certificate_per_project
  ON public.pre_milestones(project_id, certificate_type)
  WHERE certificate_type IS NOT NULL
    AND notes LIKE 'system_template:%';

CREATE UNIQUE INDEX IF NOT EXISTS uq_system_template_work_item_per_project
  ON public.certificate_work_items(project_id, upper(item_code))
  WHERE item_code IS NOT NULL
    AND notes LIKE 'system_template:%';

COMMIT;

-- ============================================================
-- Source: 293_task_batch_update_jobs.sql
-- ============================================================
-- Durable task batch updates. Accepted HTTP 202 work must survive process restarts
-- and expose per-task outcomes instead of running from an in-memory timer.

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_batch_update_jobs (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  accepted_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_batch_update_jobs_idempotency_key_nonempty
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT task_batch_update_jobs_request_hash_nonempty
    CHECK (btrim(request_hash) <> ''),
  CONSTRAINT task_batch_update_jobs_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'partial_failed', 'failed')),
  CONSTRAINT task_batch_update_jobs_counts_check
    CHECK (
      accepted_count >= 0
      AND succeeded_count >= 0
      AND failed_count >= 0
      AND succeeded_count + failed_count <= accepted_count
    ),
  UNIQUE (project_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.task_batch_update_items (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.task_batch_update_jobs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  expected_version INTEGER NOT NULL,
  target_patch JSONB NOT NULL,
  result_version INTEGER NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  error_code TEXT NULL,
  error_message TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_batch_update_items_status_check
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'conflict')),
  CONSTRAINT task_batch_update_items_expected_version_check
    CHECK (expected_version >= 0),
  UNIQUE (job_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_batch_update_jobs_claim
  ON public.task_batch_update_jobs(status, lease_expires_at, created_at)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS idx_task_batch_update_items_claim
  ON public.task_batch_update_items(job_id, status, lease_expires_at, created_at)
  WHERE status IN ('pending', 'running');

ALTER TABLE public.task_batch_update_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_batch_update_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_batch_update_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_batch_update_items FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.task_batch_update_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.task_batch_update_items FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS task_batch_update_jobs_runtime_policy ON public.task_batch_update_jobs;
CREATE POLICY task_batch_update_jobs_runtime_policy
ON public.task_batch_update_jobs
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

DROP POLICY IF EXISTS task_batch_update_items_runtime_policy ON public.task_batch_update_items;
CREATE POLICY task_batch_update_items_runtime_policy
ON public.task_batch_update_items
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_batch_update_jobs TO workbuddy_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_batch_update_items TO workbuddy_runtime;
  END IF;
END $$;

COMMENT ON TABLE public.task_batch_update_jobs IS
  'Durable API jobs for task batch updates; one row per idempotent accepted request.';
COMMENT ON TABLE public.task_batch_update_items IS
  'Per-task absolute target patches and visible outcomes for a durable batch update job.';

COMMIT;

-- ============================================================
-- Source: 294_task_commit_requests.sql
-- ============================================================
-- Idempotency ledger for atomic task-list commits. The reservation and final
-- replay summary are written in the same transaction as the task mutations.

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_commit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_commit_requests_request_id_nonempty
    CHECK (btrim(request_id) <> ''),
  CONSTRAINT task_commit_requests_request_hash_nonempty
    CHECK (btrim(request_hash) <> ''),
  CONSTRAINT task_commit_requests_status_check
    CHECK (status IN ('running', 'succeeded')),
  UNIQUE (project_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_task_commit_requests_project_created
  ON public.task_commit_requests(project_id, created_at DESC);

ALTER TABLE public.task_commit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_commit_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.task_commit_requests FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS task_commit_requests_runtime_policy ON public.task_commit_requests;
CREATE POLICY task_commit_requests_runtime_policy
ON public.task_commit_requests
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_commit_requests TO workbuddy_runtime;
  END IF;
END $$;

COMMENT ON TABLE public.task_commit_requests IS
  'Tenant-scoped idempotency ledger and replay summary for atomic task-list commits.';

COMMIT;

-- ============================================================
-- Source: 295_v14231_engineering_object_type_final_reconciliation.sql
-- ============================================================
-- Reassert the v1.4.22.1 final range-tree object contract after historical
-- schema reconciliation migrations. Migration 162a has already normalized
-- legacy zone/professional rows before this constraint can be installed.

BEGIN;

ALTER TABLE public.engineering_objects
  DROP CONSTRAINT IF EXISTS engineering_objects_object_type_check;

ALTER TABLE public.engineering_objects
  ADD CONSTRAINT engineering_objects_object_type_check
  CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area'));

COMMIT;

-- ============================================================
-- Source: 296_v14231_commercial_metering_private_rls_helper.sql
-- ============================================================
-- The commercial-metering policy was created after the public helper RPC
-- lockdown. Authenticated users can read this table, so the policy must use
-- the private helper that is executable by authenticated database roles.

BEGIN;

DROP POLICY IF EXISTS company_commercial_metering_select_policy
  ON public.company_commercial_metering;

CREATE POLICY company_commercial_metering_select_policy
  ON public.company_commercial_metering
  FOR SELECT
  USING (
    workbuddy_private.is_active_company_member(company_id, ARRAY['company_admin']::TEXT[])
    OR current_user = 'workbuddy_runtime'
  );

COMMIT;

-- ============================================================
-- Source: 297_persistent_scheduled_job_slots.sql
-- ============================================================
-- Durable wall-clock job slots. A unique slot is claimed atomically so a
-- restarted or horizontally scaled scheduler can catch up without duplicates.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scheduled_job_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  claim_owner TEXT NOT NULL,
  claim_token UUID NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scheduled_job_slots_job_name_nonempty
    CHECK (btrim(job_name) <> ''),
  CONSTRAINT scheduled_job_slots_claim_owner_nonempty
    CHECK (btrim(claim_owner) <> ''),
  CONSTRAINT scheduled_job_slots_attempt_count_positive
    CHECK (attempt_count > 0),
  CONSTRAINT scheduled_job_slots_status_check
    CHECK (status IN ('running', 'succeeded', 'failed')),
  UNIQUE (job_name, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_slots_recovery
  ON public.scheduled_job_slots(status, claimed_at)
  WHERE status IN ('running', 'failed');

CREATE INDEX IF NOT EXISTS idx_scheduled_job_slots_job_history
  ON public.scheduled_job_slots(job_name, scheduled_for DESC);

CREATE TABLE IF NOT EXISTS public.job_lease_fences (
  job_name TEXT PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1,
  active_token UUID NULL,
  lease_backend_pid INTEGER NULL,
  lease_backend_started_at TIMESTAMPTZ NULL,
  activated_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_lease_fences_job_name_nonempty
    CHECK (btrim(job_name) <> ''),
  CONSTRAINT job_lease_fences_generation_positive
    CHECK (generation > 0),
  CONSTRAINT job_lease_fences_active_identity_complete
    CHECK (
      (active_token IS NULL AND lease_backend_pid IS NULL AND lease_backend_started_at IS NULL)
      OR
      (active_token IS NOT NULL AND lease_backend_pid IS NOT NULL AND lease_backend_started_at IS NOT NULL)
    )
);

ALTER TABLE public.scheduled_job_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_job_slots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.job_lease_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_lease_fences FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.scheduled_job_slots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.job_lease_fences FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS scheduled_job_slots_runtime_policy ON public.scheduled_job_slots;
CREATE POLICY scheduled_job_slots_runtime_policy
ON public.scheduled_job_slots
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

DROP POLICY IF EXISTS job_lease_fences_runtime_policy ON public.job_lease_fences;
CREATE POLICY job_lease_fences_runtime_policy
ON public.job_lease_fences
FOR ALL
USING (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
)
WITH CHECK (
  current_user = 'workbuddy_runtime'
  OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
);

CREATE OR REPLACE FUNCTION public.assert_job_lease_fence(
  p_job_name TEXT,
  p_fence_token UUID,
  p_generation BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_fence public.job_lease_fences%ROWTYPE;
  v_namespace_hash BIGINT;
  v_job_hash BIGINT;
  v_lock_held BOOLEAN;
BEGIN
  SELECT *
    INTO v_fence
    FROM public.job_lease_fences
   WHERE job_name = p_job_name;

  IF NOT FOUND
     OR v_fence.active_token IS DISTINCT FROM p_fence_token
     OR v_fence.generation IS DISTINCT FROM p_generation
     OR v_fence.lease_backend_pid IS NULL
     OR v_fence.lease_backend_started_at IS NULL THEN
    RAISE EXCEPTION 'job lease fence rejected for %: stale token or generation', p_job_name
      USING ERRCODE = '55000';
  END IF;

  v_namespace_hash := hashtext('workbuddy_job_lease')::BIGINT;
  IF v_namespace_hash < 0 THEN
    v_namespace_hash := v_namespace_hash + 4294967296;
  END IF;
  v_job_hash := hashtext(p_job_name)::BIGINT;
  IF v_job_hash < 0 THEN
    v_job_hash := v_job_hash + 4294967296;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_locks AS locks
      JOIN pg_catalog.pg_stat_activity AS activity
        ON activity.pid = locks.pid
     WHERE locks.locktype = 'advisory'
       AND locks.granted IS TRUE
       AND locks.pid = v_fence.lease_backend_pid
       AND activity.backend_start = v_fence.lease_backend_started_at
       AND locks.classid::BIGINT = v_namespace_hash
       AND locks.objid::BIGINT = v_job_hash
       AND locks.objsubid = 2
  ) INTO v_lock_held;

  IF NOT v_lock_held THEN
    RAISE EXCEPTION 'job lease fence rejected for %: advisory lock is no longer held', p_job_name
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_job_lease_fence_from_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_headers_text TEXT;
  v_headers JSONB;
  v_job_name TEXT;
  v_token_text TEXT;
  v_generation_text TEXT;
BEGIN
  v_headers_text := current_setting('request.headers', TRUE);
  IF v_headers_text IS NULL OR btrim(v_headers_text) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_headers := v_headers_text::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  v_job_name := NULLIF(btrim(v_headers ->> 'x-workbuddy-job-name'), '');
  v_token_text := NULLIF(btrim(v_headers ->> 'x-workbuddy-job-fence-token'), '');
  v_generation_text := NULLIF(btrim(v_headers ->> 'x-workbuddy-job-fence-generation'), '');

  IF v_job_name IS NULL AND v_token_text IS NULL AND v_generation_text IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_job_name IS NULL OR v_token_text IS NULL OR v_generation_text IS NULL THEN
    RAISE EXCEPTION 'job lease fence rejected: incomplete request identity'
      USING ERRCODE = '55000';
  END IF;

  BEGIN
    PERFORM public.assert_job_lease_fence(
      v_job_name,
      v_token_text::UUID,
      v_generation_text::BIGINT
    );
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'job lease fence rejected: malformed request identity'
      USING ERRCODE = '55000';
  END;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_job_lease_fence(TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_job_lease_fence_from_request() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.notifications';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.notifications FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.notification_user_states') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.notification_user_states';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.notification_user_states FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.risks') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.risks';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.risks FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.issues') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.issues';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.issues FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.warning_acknowledgments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.warning_acknowledgments';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.warning_acknowledgments FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
  IF to_regclass('public.change_logs') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS enforce_job_lease_fence ON public.change_logs';
    EXECUTE 'CREATE TRIGGER enforce_job_lease_fence BEFORE INSERT OR UPDATE OR DELETE ON public.change_logs FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_job_lease_fence_from_request()';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scheduled_job_slots TO workbuddy_runtime;
    GRANT SELECT, INSERT, UPDATE ON TABLE public.job_lease_fences TO workbuddy_runtime;
  END IF;
END $$;

COMMENT ON TABLE public.scheduled_job_slots IS
  'System scheduler ledger for persistent catch-up, retry, and multi-instance slot claims.';
COMMENT ON COLUMN public.scheduled_job_slots.claim_token IS
  'Write fence used to reject completion from an owner that no longer holds the slot.';
COMMENT ON TABLE public.job_lease_fences IS
  'Generation and PostgreSQL backend identity for rejecting stale distributed-job writes.';

COMMIT;

-- ============================================================
-- Source: 298_extended_schema_drift_reconciliation.sql
-- ============================================================
-- Reconcile non-table objects that were left inconsistent by historical
-- migrations. This is intentionally forward-only: historical migration files
-- and schema_migrations records remain immutable.

BEGIN;

-- Migration 278 moved policy helpers into workbuddy_private. Retire the
-- exposed public copies after all policy expressions have been rewritten.
DROP FUNCTION IF EXISTS public.has_project_edit_permission(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_project_owner(UUID, UUID);

-- The dashboard now reads the canonical summary/snapshot services directly;
-- this legacy materialized view has no runtime consumer.
DROP MATERIALIZED VIEW IF EXISTS public.mv_project_dashboard;

-- Remove duplicate legacy updated_at triggers. The canonical trigger names
-- created by the later reconciliation migrations remain in place.
DROP TRIGGER IF EXISTS update_task_conditions_updated_at ON public.task_conditions;
DROP TRIGGER IF EXISTS update_task_obstacles_updated_at ON public.task_obstacles;

CREATE OR REPLACE FUNCTION public.auto_complete_conditions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = '已完成' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.task_conditions
    SET status = '已确认',
        confirmed_at = NOW()
    WHERE task_id = NEW.id
      AND status = '已满足';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_task_progress_on_condition_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_conditions INTEGER;
  v_completed_conditions INTEGER;
  v_progress INTEGER;
BEGIN
  IF NEW.status IN ('已满足', '已确认')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_completed_conditions
    FROM public.task_conditions
    WHERE task_id = NEW.task_id;

    IF v_total_conditions > 0 THEN
      v_progress := ROUND((v_completed_conditions::NUMERIC / v_total_conditions) * 100);

      UPDATE public.tasks
      SET progress = v_progress
      WHERE id = NEW.task_id
        AND progress < v_progress;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_task_progress_on_condition ON public.task_conditions;
CREATE TRIGGER trigger_update_task_progress_on_condition
  AFTER UPDATE OF status ON public.task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_progress_on_condition_complete();

CREATE OR REPLACE FUNCTION public.auto_resolve_obstacles_on_task_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('completed', 'done', 'closed', '已完成')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.task_obstacles
    SET status = 'resolved',
        resolution = COALESCE(resolution, '任务已完成，系统自动关闭阻碍'),
        resolved_at = COALESCE(resolved_at, NOW())
    WHERE task_id = NEW.id
      AND status IN ('pending', 'active', 'resolving', 'blocked', '待处理', '处理中');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_resolve_obstacles ON public.tasks;
CREATE TRIGGER trigger_auto_resolve_obstacles
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_resolve_obstacles_on_task_complete();

-- The registry view is an internal governance surface. API roles remain
-- denied; backend roles receive only the SELECT privilege they require.
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM PUBLIC;
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM anon;
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM authenticated;
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM service_role;
REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM workbuddy_runtime;

GRANT SELECT ON TABLE public.algorithm_asset_registry_view TO service_role;
GRANT SELECT ON TABLE public.algorithm_asset_registry_view TO workbuddy_runtime;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM workbuddy_runtime_login';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 299_v14241_business_runtime_write_rls.sql
-- ============================================================
-- Complete the backend runtime RLS path exercised by the controlled staging
-- business-loop UAT. The API has already authenticated and authorized project
-- scope before these tables are accessed through the low-privilege DB role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 299';
  END IF;

  IF to_regclass('public.task_conditions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_conditions TO workbuddy_runtime;
    DROP POLICY IF EXISTS task_conditions_backend_runtime_policy ON public.task_conditions;
    CREATE POLICY task_conditions_backend_runtime_policy
      ON public.task_conditions
      FOR ALL
      TO workbuddy_runtime
      USING (
        current_user = 'workbuddy_runtime'
        OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
      )
      WITH CHECK (
        current_user = 'workbuddy_runtime'
        OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
      );
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO workbuddy_runtime;
    DROP POLICY IF EXISTS notifications_backend_runtime_policy ON public.notifications;
    CREATE POLICY notifications_backend_runtime_policy
      ON public.notifications
      FOR ALL
      TO workbuddy_runtime
      USING (
        current_user = 'workbuddy_runtime'
        OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
      )
      WITH CHECK (
        current_user = 'workbuddy_runtime'
        OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
      );
  END IF;
END
$$;

-- ============================================================
-- Source: 300_runtime_legacy_compatibility_cleanup.sql
-- ============================================================
-- Preserve the remaining legacy runtime data in canonical relations before
-- removing retired tables, columns, and role-based policies.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.tasks') IS NULL
     OR to_regclass('public.task_conditions') IS NULL
     OR to_regclass('public.participant_units') IS NULL
     OR to_regclass('public.milestones') IS NULL
     OR to_regclass('public.task_milestones') IS NULL
     OR to_regclass('public.warnings') IS NULL
     OR to_regclass('public.notifications') IS NULL
     OR to_regclass('public.task_baseline_items') IS NULL
     OR to_regclass('public.acceptance_plans') IS NULL
     OR to_regclass('public.project_entity_links') IS NULL
     OR to_regclass('public.task_dependencies') IS NULL
     OR to_regclass('public.engineering_objects') IS NULL THEN
    RAISE EXCEPTION 'migration 300 requires both the canonical runtime tables and the retired source objects';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE global_role IS NULL
       OR BTRIM(global_role) NOT IN ('company_admin', 'regular')
  ) THEN
    RAISE EXCEPTION 'migration 300 cannot remove users.role while global_role is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acceptance_plans ap
    LEFT JOIN public.tasks t ON t.id = ap.task_id
    WHERE ap.task_id IS NOT NULL
      AND (t.id IS NULL OR t.project_id IS DISTINCT FROM ap.project_id)
  ) THEN
    RAISE EXCEPTION 'migration 300 found an acceptance plan task outside its project';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    LEFT JOIN public.tasks predecessor ON predecessor.id = task.preceding_task_id
    WHERE task.preceding_task_id IS NOT NULL
      AND (
        predecessor.id IS NULL
        OR predecessor.project_id IS DISTINCT FROM task.project_id
        OR predecessor.id = task.id
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 found an invalid direct predecessor reference';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    LEFT JOIN public.engineering_objects phase_object
      ON phase_object.id = task.phase_id
     AND phase_object.project_id = task.project_id
     AND phase_object.object_type = 'phase'
    WHERE task.phase_id IS NOT NULL
      AND phase_object.id IS NULL
      AND task.phase_id IS DISTINCT FROM task.project_id
  ) THEN
    RAISE EXCEPTION 'migration 300 found a phase_id that cannot be mapped to a phase object';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_milestones relation
    JOIN public.tasks task ON task.id = relation.task_id
    JOIN public.milestones milestone ON milestone.id = relation.milestone_id
    WHERE task.project_id IS DISTINCT FROM milestone.project_id
  ) THEN
    RAISE EXCEPTION 'migration 300 found a milestone relation outside its project';
  END IF;

  IF EXISTS (
    SELECT relation.task_id
    FROM public.task_milestones relation
    GROUP BY relation.task_id
    HAVING COUNT(DISTINCT relation.milestone_id) > 1
  ) THEN
    RAISE EXCEPTION 'migration 300 cannot map multiple milestone targets into tasks.milestone_id';
  END IF;

  IF EXISTS (
    SELECT canonical_task.id
    FROM public.milestones milestone
    JOIN public.tasks canonical_task
      ON canonical_task.project_id IS NOT DISTINCT FROM milestone.project_id
     AND LOWER(BTRIM(canonical_task.title)) = LOWER(BTRIM(milestone.title))
     AND canonical_task.is_milestone IS TRUE
    GROUP BY canonical_task.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'migration 300 found duplicate legacy milestones for one canonical task';
  END IF;

  IF EXISTS (
    SELECT milestone.id
    FROM public.milestones milestone
    JOIN public.tasks canonical_task
      ON canonical_task.project_id IS NOT DISTINCT FROM milestone.project_id
     AND LOWER(BTRIM(canonical_task.title)) = LOWER(BTRIM(milestone.title))
     AND canonical_task.is_milestone IS TRUE
    GROUP BY milestone.id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'migration 300 found an ambiguous canonical milestone title match';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.warnings warning
    LEFT JOIN public.tasks task ON task.id = warning.task_id
    WHERE warning.task_id IS NOT NULL
      AND (task.id IS NULL OR task.project_id IS DISTINCT FROM warning.project_id)
  ) THEN
    RAISE EXCEPTION 'migration 300 found a warning task outside its project';
  END IF;
END
$$;

CREATE TEMP TABLE migration_300_milestone_map (
  old_milestone_id UUID PRIMARY KEY,
  canonical_task_id UUID NOT NULL,
  mapping_source TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO migration_300_milestone_map (
  old_milestone_id,
  canonical_task_id,
  mapping_source
)
SELECT
  milestone.id,
  canonical_task.id,
  'same_project_title'
FROM public.milestones milestone
JOIN public.tasks canonical_task
  ON canonical_task.project_id IS NOT DISTINCT FROM milestone.project_id
 AND LOWER(BTRIM(canonical_task.title)) = LOWER(BTRIM(milestone.title))
 AND canonical_task.is_milestone IS TRUE;

INSERT INTO migration_300_milestone_map (
  old_milestone_id,
  canonical_task_id,
  mapping_source
)
SELECT
  milestone.id,
  CASE
    WHEN colliding_task.id IS NULL THEN milestone.id
    ELSE gen_random_uuid()
  END,
  'created_from_legacy_milestone'
FROM public.milestones milestone
LEFT JOIN migration_300_milestone_map existing_map
  ON existing_map.old_milestone_id = milestone.id
LEFT JOIN public.tasks colliding_task
  ON colliding_task.id = milestone.id
WHERE existing_map.old_milestone_id IS NULL;

INSERT INTO public.tasks (
  id,
  project_id,
  title,
  description,
  status,
  priority,
  end_date,
  progress,
  is_milestone,
  task_type,
  planned_end_date,
  actual_end_date,
  created_by,
  created_at,
  updated_at,
  baseline_end,
  progress_method,
  key_node_type,
  planning_governance_metadata
)
SELECT
  milestone_map.canonical_task_id,
  milestone.project_id,
  milestone.title,
  milestone.description,
  CASE
    WHEN milestone.resolved_status = 'completed' THEN 'completed'
    WHEN milestone.resolved_status IN ('in_progress', 'active') THEN 'in_progress'
    ELSE milestone.resolved_status
  END,
  'high',
  COALESCE(milestone.current_plan_date, milestone.target_date),
  CASE WHEN milestone.resolved_status = 'completed' THEN 100 ELSE 0 END,
  TRUE,
  'milestone',
  COALESCE(milestone.current_plan_date, milestone.target_date),
  COALESCE(milestone.actual_date, milestone.completed_at::date),
  milestone.created_by,
  milestone.created_at,
  NOW(),
  COALESCE(milestone.baseline_date, milestone.target_date),
  'milestone',
  'milestone',
  jsonb_build_object(
    'migration300LegacyMilestone',
    jsonb_build_object(
      'id', milestone.id::text,
      'status', milestone.status,
      'targetDate', milestone.target_date,
      'mappingSource', milestone_map.mapping_source,
      'migratedBy', '300_runtime_legacy_compatibility_cleanup'
    )
  )
FROM (
  SELECT
    source.*,
    CASE
      WHEN LOWER(COALESCE(source.status, '')) IN ('completed', 'done')
        OR source.actual_date IS NOT NULL
        OR source.completed_at IS NOT NULL
      THEN 'completed'
      ELSE COALESCE(NULLIF(LOWER(BTRIM(source.status)), ''), 'pending')
    END AS resolved_status
  FROM public.milestones source
) milestone
JOIN migration_300_milestone_map milestone_map
  ON milestone_map.old_milestone_id = milestone.id
LEFT JOIN public.tasks existing_task
  ON existing_task.id = milestone_map.canonical_task_id
WHERE existing_task.id IS NULL;

UPDATE public.tasks canonical_task
SET
  description = COALESCE(canonical_task.description, milestone.description),
  is_milestone = TRUE,
  task_type = CASE
    WHEN canonical_task.task_type IS NULL OR canonical_task.task_type = 'task' THEN 'milestone'
    ELSE canonical_task.task_type
  END,
  planned_end_date = COALESCE(
    canonical_task.planned_end_date,
    milestone.current_plan_date,
    milestone.target_date
  ),
  end_date = COALESCE(
    canonical_task.end_date,
    milestone.current_plan_date,
    milestone.target_date
  ),
  baseline_end = COALESCE(canonical_task.baseline_end, milestone.baseline_date, milestone.target_date),
  actual_end_date = COALESCE(canonical_task.actual_end_date, milestone.actual_date, milestone.completed_at::date),
  created_by = COALESCE(canonical_task.created_by, milestone.created_by),
  planning_governance_metadata = COALESCE(canonical_task.planning_governance_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'migration300LegacyMilestone',
      jsonb_build_object(
        'id', milestone.id::text,
        'status', milestone.status,
        'targetDate', milestone.target_date,
        'mappingSource', milestone_map.mapping_source,
        'migratedBy', '300_runtime_legacy_compatibility_cleanup'
      )
    ),
  updated_at = NOW()
FROM public.milestones milestone
JOIN migration_300_milestone_map milestone_map
  ON milestone_map.old_milestone_id = milestone.id
WHERE canonical_task.id = milestone_map.canonical_task_id;

UPDATE public.task_baseline_items baseline_item
SET generation_metadata = COALESCE(baseline_item.generation_metadata, '{}'::jsonb)
  || jsonb_build_object(
    'migration300LegacySourceMilestoneId',
    baseline_item.source_milestone_id::text
  )
WHERE baseline_item.source_milestone_id IS NOT NULL;

ALTER TABLE public.task_baseline_items
  DROP CONSTRAINT IF EXISTS task_baseline_items_source_milestone_id_fkey;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT constraint_row.conname
    FROM pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.tasks'::regclass
      AND constraint_row.confrelid = 'public.milestones'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

UPDATE public.task_baseline_items baseline_item
SET source_milestone_id = milestone_map.canonical_task_id
FROM migration_300_milestone_map milestone_map
WHERE baseline_item.source_milestone_id = milestone_map.old_milestone_id;

UPDATE public.tasks task
SET planning_governance_metadata = COALESCE(task.planning_governance_metadata, '{}'::jsonb)
  || jsonb_build_object(
    'migration300LegacyMilestoneRelation',
    jsonb_build_object(
      'oldMilestoneId', relation.milestone_id::text,
      'canonicalMilestoneTaskId', milestone_map.canonical_task_id::text,
      'relationType', relation.relation_type,
      'migratedBy', '300_runtime_legacy_compatibility_cleanup'
    )
  )
FROM public.task_milestones relation
JOIN migration_300_milestone_map milestone_map
  ON milestone_map.old_milestone_id = relation.milestone_id
WHERE task.id = relation.task_id;

UPDATE public.tasks task
SET milestone_id = milestone_map.canonical_task_id
FROM public.task_milestones relation
JOIN migration_300_milestone_map milestone_map
  ON milestone_map.old_milestone_id = relation.milestone_id
WHERE task.id = relation.task_id
  AND task.id <> milestone_map.canonical_task_id
  AND (
    task.milestone_id IS NULL
    OR task.milestone_id = relation.milestone_id
    OR task.milestone_id = milestone_map.canonical_task_id
  );

ALTER TABLE public.tasks
  ADD CONSTRAINT fk_tasks_canonical_milestone_id
  FOREIGN KEY (milestone_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

ALTER TABLE public.task_baseline_items
  ADD CONSTRAINT task_baseline_items_source_milestone_id_fkey
  FOREIGN KEY (source_milestone_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

INSERT INTO public.notifications (
  id,
  user_id,
  notification_type,
  title,
  content,
  target_type,
  target_id,
  priority,
  channel,
  is_read,
  is_system,
  read_at,
  metadata,
  created_at,
  project_id,
  task_id,
  type,
  severity,
  level,
  is_broadcast,
  source_entity_type,
  source_entity_id,
  category,
  status,
  first_seen_at,
  acknowledged_at,
  resolved_at,
  updated_at,
  company_id,
  warning_lifecycle_status,
  lifecycle_status,
  dedupe_key
)
SELECT
  CASE WHEN id_collision.id IS NULL THEN warning.id ELSE gen_random_uuid() END,
  NULL,
  'warning',
  warning.title,
  warning.description,
  CASE WHEN warning.task_id IS NULL THEN 'project' ELSE 'task' END,
  COALESCE(warning.task_id, warning.project_id),
  CASE WHEN warning.warning_level = 'critical' THEN 'high' ELSE 'normal' END,
  'in_app',
  COALESCE(warning.is_acknowledged, FALSE) OR COALESCE(warning.resolved, FALSE),
  TRUE,
  COALESCE(warning.acknowledged_at, warning.resolved_at),
  jsonb_build_object(
    'migratedBy', '300_runtime_legacy_compatibility_cleanup',
    'legacyWarningId', warning.id::text,
    'legacyAcknowledgedBy', warning.acknowledged_by,
    'legacyResolvedBy', warning.resolved_by
  ),
  warning.created_at,
  warning.project_id,
  warning.task_id,
  warning.warning_type,
  warning.warning_level,
  warning.warning_level,
  TRUE,
  'warning',
  warning.id::text,
  warning.warning_type,
  CASE
    WHEN COALESCE(warning.resolved, FALSE) THEN 'resolved'
    WHEN COALESCE(warning.is_acknowledged, FALSE) THEN 'acknowledged'
    ELSE 'active'
  END,
  warning.created_at,
  warning.acknowledged_at,
  warning.resolved_at,
  COALESCE(warning.updated_at, warning.created_at, NOW()),
  project.company_id,
  CASE
    WHEN COALESCE(warning.resolved, FALSE) THEN 'resolved'
    WHEN COALESCE(warning.is_acknowledged, FALSE) THEN 'acknowledged'
    ELSE 'active'
  END,
  CASE WHEN COALESCE(warning.resolved, FALSE) THEN 'closed' ELSE 'active' END,
  'migration-300-warning:' || warning.id::text
FROM public.warnings warning
JOIN public.projects project ON project.id = warning.project_id
LEFT JOIN public.notifications id_collision ON id_collision.id = warning.id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notifications canonical_warning
  WHERE canonical_warning.source_entity_type = 'warning'
    AND canonical_warning.source_entity_id = warning.id::text
);

WITH unit_sources AS (
  SELECT task.project_id, BTRIM(task.responsible_unit) AS unit_name
  FROM public.tasks task
  WHERE NULLIF(BTRIM(task.responsible_unit), '') IS NOT NULL
  UNION
  SELECT task.project_id, BTRIM(task.assignee_unit) AS unit_name
  FROM public.tasks task
  WHERE NULLIF(BTRIM(task.assignee_unit), '') IS NOT NULL
  UNION
  SELECT condition.project_id, BTRIM(condition.responsible_unit) AS unit_name
  FROM public.task_conditions condition
  WHERE NULLIF(BTRIM(condition.responsible_unit), '') IS NOT NULL
  UNION
  SELECT plan.project_id, BTRIM(plan.responsible_unit) AS unit_name
  FROM public.acceptance_plans plan
  WHERE NULLIF(BTRIM(plan.responsible_unit), '') IS NOT NULL
), normalized_sources AS (
  SELECT DISTINCT ON (project_id, LOWER(unit_name))
    project_id,
    unit_name
  FROM unit_sources
  ORDER BY project_id, LOWER(unit_name), unit_name
)
INSERT INTO public.participant_units (
  id,
  project_id,
  unit_name,
  unit_type,
  unit_status,
  governance_metadata
)
SELECT
  gen_random_uuid(),
  source.project_id,
  source.unit_name,
  '其他',
  'active',
  jsonb_build_object(
    'migratedBy', '300_runtime_legacy_compatibility_cleanup',
    'source', 'retired_responsible_unit_text'
  )
FROM normalized_sources source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.participant_units participant_unit
  WHERE participant_unit.project_id IS NOT DISTINCT FROM source.project_id
    AND LOWER(BTRIM(participant_unit.unit_name)) = LOWER(source.unit_name)
);

WITH task_unit_source AS (
  SELECT
    task.id AS task_id,
    task.project_id,
    COALESCE(NULLIF(BTRIM(task.responsible_unit), ''), NULLIF(BTRIM(task.assignee_unit), '')) AS unit_name
  FROM public.tasks task
), participant_unit AS (
  SELECT DISTINCT ON (source.task_id)
    source.task_id,
    unit.id
  FROM task_unit_source source
  JOIN public.participant_units unit
    ON unit.project_id IS NOT DISTINCT FROM source.project_id
   AND LOWER(BTRIM(unit.unit_name)) = LOWER(source.unit_name)
  WHERE source.unit_name IS NOT NULL
  ORDER BY source.task_id, unit.created_at, unit.id
)
UPDATE public.tasks task
SET participant_unit_id = participant_unit.id
FROM participant_unit
WHERE task.id = participant_unit.task_id
  AND task.participant_unit_id IS DISTINCT FROM participant_unit.id;

WITH participant_unit AS (
  SELECT DISTINCT ON (condition.id)
    condition.id AS condition_id,
    unit.id
  FROM public.task_conditions condition
  JOIN public.participant_units unit
    ON unit.project_id IS NOT DISTINCT FROM condition.project_id
   AND LOWER(BTRIM(unit.unit_name)) = LOWER(BTRIM(condition.responsible_unit))
  WHERE NULLIF(BTRIM(condition.responsible_unit), '') IS NOT NULL
  ORDER BY condition.id, unit.created_at, unit.id
)
UPDATE public.task_conditions condition
SET participant_unit_id = participant_unit.id
FROM participant_unit
WHERE condition.id = participant_unit.condition_id
  AND condition.participant_unit_id IS DISTINCT FROM participant_unit.id;

WITH participant_unit AS (
  SELECT DISTINCT ON (plan.id)
    plan.id AS plan_id,
    unit.id
  FROM public.acceptance_plans plan
  JOIN public.participant_units unit
    ON unit.project_id IS NOT DISTINCT FROM plan.project_id
   AND LOWER(BTRIM(unit.unit_name)) = LOWER(BTRIM(plan.responsible_unit))
  WHERE NULLIF(BTRIM(plan.responsible_unit), '') IS NOT NULL
  ORDER BY plan.id, unit.created_at, unit.id
)
UPDATE public.acceptance_plans plan
SET participant_unit_id = participant_unit.id
FROM participant_unit
WHERE plan.id = participant_unit.plan_id
  AND plan.participant_unit_id IS DISTINCT FROM participant_unit.id;

UPDATE public.tasks task
SET phase_object_id = eo.id
FROM public.engineering_objects eo
WHERE task.phase_id = eo.id
  AND eo.project_id = task.project_id
  AND eo.object_type = 'phase'
  AND task.phase_object_id IS NULL;

INSERT INTO public.task_dependencies (
  project_id,
  task_id,
  dependency_task_id,
  dependency_type,
  lag_days,
  required_for_start,
  source_type,
  status,
  metadata,
  inference_confidence,
  inference_reason,
  evaluated_at
)
SELECT
  task.project_id,
  task.id,
  task.preceding_task_id,
  'FS',
  0,
  TRUE,
  'legacy_direct_predecessor',
  'active',
  jsonb_build_object('migratedBy', '300_runtime_legacy_compatibility_cleanup'),
  'high',
  'Migrated from the retired direct predecessor column',
  NOW()
FROM public.tasks task
WHERE task.preceding_task_id IS NOT NULL
ON CONFLICT (project_id, task_id, dependency_task_id, dependency_type)
  WHERE status = 'active'
DO NOTHING;

INSERT INTO public.project_entity_links (
  project_id,
  source_entity_type,
  source_entity_id,
  target_entity_type,
  target_entity_id,
  relation_type,
  relation_strength,
  status,
  source_ref_field,
  display_snapshot,
  metadata,
  created_at,
  updated_at
)
SELECT
  plan.project_id,
  'acceptance_plan',
  plan.id::text,
  'task',
  plan.task_id::text,
  'covers_task',
  'legacy_mapped',
  'active',
  'task_id',
  jsonb_build_object('acceptanceName', plan.acceptance_name),
  jsonb_build_object('migratedBy', '300_runtime_legacy_compatibility_cleanup'),
  COALESCE(plan.created_at, NOW()),
  NOW()
FROM public.acceptance_plans plan
WHERE plan.task_id IS NOT NULL
ON CONFLICT (
  project_id,
  source_entity_type,
  source_entity_id,
  target_entity_type,
  target_entity_id,
  relation_type
)
  WHERE status = 'active'
DO NOTHING;

UPDATE public.notifications
SET warning_lifecycle_status = CASE
  WHEN COALESCE(is_escalated, FALSE) = TRUE OR escalated_to_risk_id IS NOT NULL THEN 'escalated'
  WHEN resolved_at IS NOT NULL OR resolved_source IS NOT NULL OR status = 'resolved' THEN 'resolved'
  WHEN muted_until IS NOT NULL AND muted_until > NOW() THEN 'muted'
  WHEN acknowledged_at IS NOT NULL OR status = 'acknowledged' THEN 'acknowledged'
  WHEN first_seen_at IS NOT NULL THEN 'active'
  ELSE 'created'
END
WHERE source_entity_type = 'warning'
  AND (warning_lifecycle_status IS NULL OR BTRIM(warning_lifecycle_status) = '');

UPDATE public.notifications
SET metadata = metadata - 'personal_states'
WHERE jsonb_typeof(metadata) = 'object'
  AND metadata ? 'personal_states';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM migration_300_milestone_map)
     <> (SELECT COUNT(*) FROM public.milestones) THEN
    RAISE EXCEPTION 'migration 300 did not map every legacy milestone';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM migration_300_milestone_map milestone_map
    LEFT JOIN public.tasks canonical_task ON canonical_task.id = milestone_map.canonical_task_id
    WHERE canonical_task.id IS NULL OR canonical_task.is_milestone IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every legacy milestone as a canonical task';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_milestones relation
    JOIN migration_300_milestone_map milestone_map
      ON milestone_map.old_milestone_id = relation.milestone_id
    JOIN public.tasks task ON task.id = relation.task_id
    WHERE NOT (
      task.milestone_id = milestone_map.canonical_task_id
      OR task.id = milestone_map.canonical_task_id
    )
      OR COALESCE(
        task.planning_governance_metadata
          -> 'migration300LegacyMilestoneRelation'
          ->> 'oldMilestoneId',
        ''
      ) <> relation.milestone_id::text
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every legacy task milestone relation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_baseline_items baseline_item
    WHERE baseline_item.generation_metadata ? 'migration300LegacySourceMilestoneId'
      AND NOT EXISTS (
        SELECT 1
        FROM migration_300_milestone_map milestone_map
        WHERE milestone_map.old_milestone_id::text = baseline_item.generation_metadata ->> 'migration300LegacySourceMilestoneId'
          AND milestone_map.canonical_task_id = baseline_item.source_milestone_id
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every baseline milestone source';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.warnings warning
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.notifications canonical_warning
      WHERE canonical_warning.source_entity_type = 'warning'
        AND canonical_warning.source_entity_id = warning.id::text
        AND canonical_warning.project_id = warning.project_id
    )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every warning as a canonical notification';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    LEFT JOIN public.participant_units participant_unit ON participant_unit.id = task.participant_unit_id
    WHERE COALESCE(NULLIF(BTRIM(task.responsible_unit), ''), NULLIF(BTRIM(task.assignee_unit), '')) IS NOT NULL
      AND (
        participant_unit.id IS NULL
        OR participant_unit.project_id IS DISTINCT FROM task.project_id
        OR LOWER(BTRIM(participant_unit.unit_name))
          <> LOWER(COALESCE(NULLIF(BTRIM(task.responsible_unit), ''), NULLIF(BTRIM(task.assignee_unit), '')))
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every task participant unit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_conditions condition
    LEFT JOIN public.participant_units participant_unit ON participant_unit.id = condition.participant_unit_id
    WHERE NULLIF(BTRIM(condition.responsible_unit), '') IS NOT NULL
      AND (
        participant_unit.id IS NULL
        OR participant_unit.project_id IS DISTINCT FROM condition.project_id
        OR LOWER(BTRIM(participant_unit.unit_name)) <> LOWER(BTRIM(condition.responsible_unit))
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every condition participant unit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acceptance_plans plan
    LEFT JOIN public.participant_units participant_unit ON participant_unit.id = plan.participant_unit_id
    WHERE NULLIF(BTRIM(plan.responsible_unit), '') IS NOT NULL
      AND (
        participant_unit.id IS NULL
        OR participant_unit.project_id IS DISTINCT FROM plan.project_id
        OR LOWER(BTRIM(participant_unit.unit_name)) <> LOWER(BTRIM(plan.responsible_unit))
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every acceptance plan participant unit';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acceptance_plans plan
    WHERE plan.task_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_entity_links link
        WHERE link.project_id = plan.project_id
          AND link.source_entity_type = 'acceptance_plan'
          AND link.source_entity_id = plan.id::text
          AND link.target_entity_type = 'task'
          AND link.target_entity_id = plan.task_id::text
          AND link.relation_type = 'covers_task'
          AND link.status = 'active'
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every acceptance plan task link';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    WHERE task.preceding_task_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.task_dependencies dependency
        WHERE dependency.project_id = task.project_id
          AND dependency.task_id = task.id
          AND dependency.dependency_task_id = task.preceding_task_id
          AND dependency.dependency_type = 'FS'
          AND dependency.status = 'active'
      )
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every direct predecessor relation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tasks task
    JOIN public.engineering_objects engineering_object
      ON engineering_object.id = task.phase_id
     AND engineering_object.project_id = task.project_id
     AND engineering_object.object_type = 'phase'
    WHERE task.phase_object_id IS DISTINCT FROM engineering_object.id
  ) THEN
    RAISE EXCEPTION 'migration 300 did not preserve every valid phase object reference';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE source_entity_type = 'warning'
      AND (warning_lifecycle_status IS NULL OR BTRIM(warning_lifecycle_status) = '')
  ) THEN
    RAISE EXCEPTION 'migration 300 left warning lifecycle status incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notifications
    WHERE jsonb_typeof(metadata) = 'object'
      AND metadata ? 'personal_states'
  ) THEN
    RAISE EXCEPTION 'migration 300 left legacy personal notification state in metadata';
  END IF;
END
$$;

DROP POLICY IF EXISTS engineering_categories_select_policy ON public.engineering_categories;
CREATE POLICY engineering_categories_select_policy ON public.engineering_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members project_member
      WHERE project_member.project_id = engineering_categories.project_id
        AND project_member.user_id = auth.uid()
    )
    OR project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.users user_row
      WHERE user_row.id = auth.uid()
        AND user_row.global_role = 'company_admin'
    )
    OR (SELECT current_setting('role', TRUE) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_select_policy ON public.engineering_objects;
CREATE POLICY engineering_objects_select_policy ON public.engineering_objects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members project_member
      WHERE project_member.project_id = engineering_objects.project_id
        AND project_member.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.users user_row
      WHERE user_row.id = auth.uid()
        AND user_row.global_role = 'company_admin'
    )
    OR (SELECT current_setting('role', TRUE) = 'service_role')
  );

DROP TABLE public.task_milestones;
DROP TABLE public.milestones;
DROP TABLE public.warnings;

ALTER TABLE public.users DROP COLUMN IF EXISTS role;
ALTER TABLE public.users DROP COLUMN IF EXISTS device_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS phase_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS preceding_task_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS responsible_unit;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS assignee_unit;
ALTER TABLE public.task_conditions DROP COLUMN IF EXISTS responsible_unit;
ALTER TABLE public.acceptance_plans DROP COLUMN IF EXISTS task_id;
ALTER TABLE public.acceptance_plans DROP COLUMN IF EXISTS responsible_unit;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 301_canonical_milestone_reference_indexes.sql
-- ============================================================
-- Migration 301: cover the canonical milestone foreign-key lookups introduced by migration 300.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_row
    JOIN pg_class table_row ON table_row.oid = index_row.indrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = table_row.oid
     AND attribute_row.attname = 'milestone_id'
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'tasks'
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indkey[0] = attribute_row.attnum
  ) THEN
    CREATE INDEX idx_tasks_canonical_milestone_id
      ON public.tasks(milestone_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_row
    JOIN pg_class table_row ON table_row.oid = index_row.indrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = table_row.oid
     AND attribute_row.attname = 'source_milestone_id'
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'task_baseline_items'
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indkey[0] = attribute_row.attnum
  ) THEN
    CREATE INDEX idx_task_baseline_items_canonical_source_milestone_id
      ON public.task_baseline_items(source_milestone_id);
  END IF;
END
$$;

COMMIT;

-- ============================================================
-- Source: 302_canonical_milestone_index_normalization.sql
-- ============================================================
-- Migration 302: make canonical milestone reference index names and definitions deterministic.

BEGIN;

DROP INDEX IF EXISTS public.idx_tasks_canonical_milestone_id;
DROP INDEX IF EXISTS public.idx_tasks_milestone_id;
CREATE INDEX idx_tasks_milestone_id
  ON public.tasks(milestone_id);

DROP INDEX IF EXISTS public.idx_task_baseline_items_canonical_source_milestone_id;
DROP INDEX IF EXISTS public.idx_task_baseline_items_source_milestone_id;
CREATE INDEX idx_task_baseline_items_source_milestone_id
  ON public.task_baseline_items(source_milestone_id);

COMMIT;

-- ============================================================
-- Source: 303_v14231_duration_learning_operation_runtime_rls.sql
-- ============================================================
-- Allow the low-privilege backend runtime role to maintain the two durable
-- operation ledgers used by the duration learning and baseline-revision jobs.
-- Client roles remain unable to read or mutate these system-job internals.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 303';
  END IF;
END
$$;

ALTER TABLE public.duration_context_policy_learning_checkpoints ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_context_policy_learning_checkpoints TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_context_learning_checkpoints_backend_runtime
  ON public.duration_context_policy_learning_checkpoints;
CREATE POLICY duration_context_learning_checkpoints_backend_runtime
  ON public.duration_context_policy_learning_checkpoints
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

ALTER TABLE public.duration_asset_baseline_revision_operations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_asset_baseline_revision_operations TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_asset_baseline_revision_ops_backend_runtime
  ON public.duration_asset_baseline_revision_operations;
CREATE POLICY duration_asset_baseline_revision_ops_backend_runtime
  ON public.duration_asset_baseline_revision_operations
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON POLICY duration_context_learning_checkpoints_backend_runtime
  ON public.duration_context_policy_learning_checkpoints IS
  'Backend scheduler access to durable duration-policy learning checkpoints; client roles remain excluded.';
COMMENT ON POLICY duration_asset_baseline_revision_ops_backend_runtime
  ON public.duration_asset_baseline_revision_operations IS
  'Backend scheduler access to idempotent duration-asset baseline revision operations; client roles remain excluded.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 304_v1420_viewer_wbs_legacy_closeout.sql
-- ============================================================
-- v1.4.20 final closeout for retired project viewer access and the duplicated
-- WBS persistence path. Canonical WBS nodes live in public.tasks.

BEGIN;

LOCK TABLE public.project_members IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.project_invitations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.project_direct_invitations IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.change_action_types (
  action_type,
  action_name,
  action_group,
  entity_type,
  requires_approval,
  requires_reason,
  user_visible,
  metadata
)
VALUES (
  'legacy_project_access_retired',
  'Retired legacy project access',
  'migration',
  NULL,
  FALSE,
  FALSE,
  FALSE,
  jsonb_build_object('migration', '304_v1420_viewer_wbs_legacy_closeout.sql')
)
ON CONFLICT (action_type) DO NOTHING;

-- Keep a durable before-image before deleting viewer members, normalizing the
-- former admin alias, or removing the compatibility role column.
INSERT INTO public.change_logs (
  id,
  project_id,
  entity_type,
  entity_id,
  field_name,
  old_value,
  new_value,
  change_reason,
  changed_at,
  change_source,
  action_type,
  action_group,
  before_snapshot,
  after_snapshot,
  metadata,
  visibility,
  retention_policy
)
SELECT
  gen_random_uuid(),
  member.project_id,
  'project_member',
  member.id,
  'permission_level',
  COALESCE(member.permission_level, member.role),
  CASE
    WHEN LOWER(COALESCE(member.permission_level, '')) = 'viewer'
      OR LOWER(COALESCE(member.role, '')) = 'viewer'
      OR (member.permission_level IS NULL AND COALESCE(member.is_active, TRUE) = FALSE)
      THEN 'deleted'
    WHEN LOWER(COALESCE(member.permission_level, member.role, '')) = 'admin'
      THEN 'owner'
    ELSE member.permission_level
  END,
  'v1.4.20 removed viewer membership and the project_members.role compatibility column',
  NOW(),
  'backfill',
  'legacy_project_access_retired',
  'migration',
  to_jsonb(member),
  jsonb_build_object('canonical_roles', jsonb_build_array('owner', 'editor')),
  jsonb_build_object(
    'migration', '304_v1420_viewer_wbs_legacy_closeout.sql',
    'restorable_from_before_snapshot', TRUE
  ),
  'internal',
  'project_lifecycle'
FROM public.project_members member
WHERE LOWER(COALESCE(member.permission_level, '')) IN ('viewer', 'admin')
   OR LOWER(COALESCE(member.role, '')) IN ('viewer', 'admin')
   OR member.permission_level IS NULL;

UPDATE public.project_members
SET permission_level = CASE
  WHEN LOWER(role) = 'admin' THEN 'owner'
  ELSE LOWER(role)
END
WHERE permission_level IS NULL
  AND LOWER(COALESCE(role, '')) IN ('owner', 'editor', 'admin');

UPDATE public.project_members
SET permission_level = 'owner'
WHERE LOWER(COALESCE(permission_level, '')) = 'admin';

DELETE FROM public.project_members
WHERE LOWER(COALESCE(permission_level, '')) = 'viewer'
   OR LOWER(COALESCE(role, '')) = 'viewer'
   OR (permission_level IS NULL AND COALESCE(is_active, TRUE) = FALSE);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE permission_level IS NULL
       OR LOWER(permission_level) NOT IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'migration 304 blocked: project_members contains a non-canonical permission';
  END IF;
END
$$;

-- Invitation rows are historical records. Revoke every legacy viewer grant,
-- preserve its before-image, then normalize the now-inert role value so the
-- database can enforce the canonical domain.
INSERT INTO public.change_logs (
  id,
  project_id,
  entity_type,
  entity_id,
  field_name,
  old_value,
  new_value,
  change_reason,
  changed_at,
  change_source,
  action_type,
  action_group,
  before_snapshot,
  after_snapshot,
  metadata,
  visibility,
  retention_policy
)
SELECT
  gen_random_uuid(),
  invitation.project_id,
  'project_invitation',
  invitation.id,
  'permission_level',
  invitation.permission_level,
  'editor (revoked)',
  'v1.4.20 revoked the retired viewer invitation grant',
  NOW(),
  'backfill',
  'legacy_project_access_retired',
  'migration',
  to_jsonb(invitation),
  to_jsonb(invitation) || jsonb_build_object('permission_level', 'editor', 'is_revoked', TRUE),
  jsonb_build_object(
    'migration', '304_v1420_viewer_wbs_legacy_closeout.sql',
    'invitation_kind', 'code',
    'restorable_from_before_snapshot', TRUE
  ),
  'internal',
  'project_lifecycle'
FROM public.project_invitations invitation
WHERE LOWER(COALESCE(invitation.permission_level, '')) = 'viewer';

UPDATE public.project_invitations
SET permission_level = 'editor',
    is_revoked = TRUE
WHERE LOWER(COALESCE(permission_level, '')) = 'viewer';

INSERT INTO public.change_logs (
  id,
  project_id,
  entity_type,
  entity_id,
  field_name,
  old_value,
  new_value,
  change_reason,
  changed_at,
  change_source,
  action_type,
  action_group,
  before_snapshot,
  after_snapshot,
  metadata,
  visibility,
  retention_policy
)
SELECT
  gen_random_uuid(),
  invitation.project_id,
  'project_direct_invitation',
  invitation.id,
  'role',
  invitation.role,
  'editor (revoked)',
  'v1.4.20 revoked the retired direct viewer invitation grant',
  NOW(),
  'backfill',
  'legacy_project_access_retired',
  'migration',
  to_jsonb(invitation),
  to_jsonb(invitation) || jsonb_build_object('role', 'editor', 'status', 'revoked'),
  jsonb_build_object(
    'migration', '304_v1420_viewer_wbs_legacy_closeout.sql',
    'invitation_kind', 'direct',
    'restorable_from_before_snapshot', TRUE
  ),
  'internal',
  'project_lifecycle'
FROM public.project_direct_invitations invitation
WHERE LOWER(COALESCE(invitation.role, '')) = 'viewer';

UPDATE public.project_direct_invitations
SET role = 'editor',
    status = 'revoked'
WHERE LOWER(COALESCE(role, '')) = 'viewer';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_invitations
    WHERE permission_level IS NULL
       OR LOWER(permission_level) <> 'editor'
  ) THEN
    RAISE EXCEPTION 'migration 304 blocked: project_invitations contains a non-editor permission';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_direct_invitations
    WHERE role IS NULL
       OR LOWER(role) <> 'editor'
  ) THEN
    RAISE EXCEPTION 'migration 304 blocked: project_direct_invitations contains a non-editor role';
  END IF;
END
$$;

DROP INDEX IF EXISTS public.idx_project_members_role;

ALTER TABLE public.project_members
  DROP CONSTRAINT IF EXISTS project_members_permission_level_check;
ALTER TABLE public.project_members
  ALTER COLUMN permission_level SET DEFAULT 'editor',
  ALTER COLUMN permission_level SET NOT NULL,
  ADD CONSTRAINT project_members_permission_level_check
    CHECK (permission_level IN ('owner', 'editor'));
ALTER TABLE public.project_members
  DROP COLUMN IF EXISTS role;

ALTER TABLE public.project_invitations
  DROP CONSTRAINT IF EXISTS project_invitations_permission_level_check;
ALTER TABLE public.project_invitations
  ALTER COLUMN permission_level SET DEFAULT 'editor',
  ALTER COLUMN permission_level SET NOT NULL,
  ADD CONSTRAINT project_invitations_permission_level_check
    CHECK (permission_level = 'editor');

ALTER TABLE public.project_direct_invitations
  DROP CONSTRAINT IF EXISTS project_direct_invitations_role_check;
ALTER TABLE public.project_direct_invitations
  ALTER COLUMN role SET DEFAULT 'editor',
  ALTER COLUMN role SET NOT NULL,
  ADD CONSTRAINT project_direct_invitations_role_check
    CHECK (role = 'editor');

-- No WBS compatibility row or lineage link may be discarded implicitly.
DO $$
DECLARE
  lineage_link_count BIGINT;
  project_link_count BIGINT;
  external_fk_count BIGINT;
  relation_row_count BIGINT;
BEGIN
  SELECT count(*)
  INTO lineage_link_count
  FROM public.data_lineage_links
  WHERE source_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone')
     OR target_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone');

  SELECT count(*)
  INTO project_link_count
  FROM public.project_entity_links
  WHERE source_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone')
     OR target_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone');

  IF lineage_link_count > 0 OR project_link_count > 0 THEN
    RAISE EXCEPTION
      'migration 304 blocked: retired WBS/task_milestone lineage still has links (lineage %, project %)',
      lineage_link_count,
      project_link_count;
  END IF;

  IF to_regclass('public.wbs_task_links') IS NOT NULL THEN
    SELECT count(*) INTO relation_row_count FROM public.wbs_task_links;
    IF relation_row_count <> 0 THEN
      RAISE EXCEPTION 'migration 304 blocked: public.wbs_task_links contains % rows', relation_row_count;
    END IF;
  END IF;

  IF to_regclass('public.wbs_structure') IS NOT NULL THEN
    SELECT count(*) INTO relation_row_count FROM public.wbs_structure;
    IF relation_row_count <> 0 THEN
      RAISE EXCEPTION 'migration 304 blocked: public.wbs_structure contains % rows', relation_row_count;
    END IF;
  END IF;

  SELECT count(*)
  INTO external_fk_count
  FROM pg_constraint constraint_record
  WHERE constraint_record.contype = 'f'
    AND constraint_record.confrelid IN (
      COALESCE(to_regclass('public.wbs_structure'), 0::oid),
      COALESCE(to_regclass('public.wbs_task_links'), 0::oid)
    )
    AND constraint_record.conrelid NOT IN (
      COALESCE(to_regclass('public.wbs_structure'), 0::oid),
      COALESCE(to_regclass('public.wbs_task_links'), 0::oid)
    );

  IF external_fk_count > 0 THEN
    RAISE EXCEPTION 'migration 304 blocked: retired WBS tables still have % external foreign keys', external_fk_count;
  END IF;
END
$$;

DELETE FROM public.data_lineage_relation_rules
WHERE source_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone')
   OR target_entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone');

UPDATE public.data_lineage_entity_types
SET table_name = 'tasks',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_relation', 'tasks',
      'canonical_filter', jsonb_build_object('is_milestone', TRUE),
      'legacy_mapping_retired_by', '304_v1420_viewer_wbs_legacy_closeout.sql'
    ),
    updated_at = NOW()
WHERE entity_type = 'milestone';

UPDATE public.data_lineage_entity_types
SET table_name = 'notifications',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_relation', 'notifications',
      'canonical_filter', jsonb_build_object('source_entity_type', 'warning'),
      'legacy_mapping_retired_by', '304_v1420_viewer_wbs_legacy_closeout.sql'
    ),
    updated_at = NOW()
WHERE entity_type = 'warning';

UPDATE public.data_lineage_entity_types
SET table_name = 'planning_governance_states',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_relation', 'planning_governance_states',
      'legacy_mapping_retired_by', '304_v1420_viewer_wbs_legacy_closeout.sql'
    ),
    updated_at = NOW()
WHERE entity_type = 'planning_governance_signal';

DELETE FROM public.data_lineage_entity_types
WHERE entity_type IN ('wbs_structure', 'wbs_task_link', 'task_milestone');

DROP TABLE IF EXISTS public.wbs_task_links;
DROP TABLE IF EXISTS public.wbs_structure;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 305_v14231_learning_asset_architecture_closure.sql
-- ============================================================
-- v1.4.23.1 learning/calibration asset architecture closure.
--
-- This migration makes raw duration evidence tenant-identifiable, provides a
-- durable missed-sample recovery queue, and supplies the tenant-filtered
-- atomic approval/rollback functions consumed by the governance service.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 305';
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- Raw duration evidence identity and lineage
-- --------------------------------------------------------------------------

ALTER TABLE public.duration_experience_samples
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS experience_tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS reuse_scope TEXT NULL,
  ADD COLUMN IF NOT EXISTS fact_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS evidence_fingerprint TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_lineage JSONB NULL;

UPDATE public.duration_experience_samples sample
SET company_id = project.company_id
FROM public.projects project
WHERE sample.project_id = project.id
  AND sample.company_id IS NULL;

UPDATE public.duration_experience_samples
SET experience_tier = COALESCE(NULLIF(experience_tier, ''), 'T1'),
    reuse_scope = COALESCE(NULLIF(reuse_scope, ''), NULLIF(learning_scope, ''), 'project'),
    fact_source = COALESCE(NULLIF(fact_source, ''), 'actual_outcome'),
    evidence_fingerprint = COALESCE(NULLIF(evidence_fingerprint, ''), 'legacy-md5:' || md5(id::TEXT)),
    source_lineage = COALESCE(source_lineage, '{}'::jsonb) || jsonb_strip_nulls(
      jsonb_build_object(
        'schemaVersion', 'duration_experience.legacy_backfill.v1',
        'sourceService', '305_v14231_learning_asset_architecture_closure',
        'sampleId', id,
        'companyId', company_id,
        'projectId', project_id,
        'taskId', task_id,
        'sourceType', source_type
      )
    );

CREATE OR REPLACE FUNCTION public.ensure_duration_experience_sample_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  project_company_id UUID;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT project.company_id
      INTO project_company_id
      FROM public.projects project
     WHERE project.id = NEW.project_id;

    IF project_company_id IS NULL THEN
      RAISE EXCEPTION 'duration experience sample project does not exist: %', NEW.project_id;
    END IF;
    IF NEW.company_id IS NOT NULL AND NEW.company_id <> project_company_id THEN
      RAISE EXCEPTION 'duration experience sample company does not own project %', NEW.project_id;
    END IF;
    NEW.company_id := project_company_id;
  END IF;

  NEW.experience_tier := COALESCE(NULLIF(NEW.experience_tier, ''), 'T1');
  NEW.reuse_scope := COALESCE(NULLIF(NEW.reuse_scope, ''), NULLIF(NEW.learning_scope, ''), 'project');
  NEW.learning_scope := NEW.reuse_scope;
  NEW.fact_source := COALESCE(NULLIF(NEW.fact_source, ''), 'actual_outcome');
  NEW.evidence_fingerprint := COALESCE(
    NULLIF(NEW.evidence_fingerprint, ''),
    'legacy-md5:' || md5(NEW.id::TEXT)
  );
  NEW.source_lineage := COALESCE(NEW.source_lineage, '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
      'schemaVersion', 'duration_experience.identity_guard.v1',
      'sampleId', NEW.id,
      'companyId', NEW.company_id,
      'projectId', NEW.project_id,
      'taskId', NEW.task_id,
      'sourceType', NEW.source_type
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_duration_experience_sample_identity_trigger
  ON public.duration_experience_samples;
CREATE TRIGGER ensure_duration_experience_sample_identity_trigger
  BEFORE INSERT OR UPDATE OF company_id, project_id, learning_scope, reuse_scope,
    experience_tier, fact_source, evidence_fingerprint, source_lineage
  ON public.duration_experience_samples
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_duration_experience_sample_identity();

ALTER TABLE public.duration_experience_samples
  ALTER COLUMN experience_tier SET DEFAULT 'T1',
  ALTER COLUMN experience_tier SET NOT NULL,
  ALTER COLUMN reuse_scope SET DEFAULT 'project',
  ALTER COLUMN reuse_scope SET NOT NULL,
  ALTER COLUMN fact_source SET DEFAULT 'actual_outcome',
  ALTER COLUMN fact_source SET NOT NULL,
  ALTER COLUMN source_lineage SET DEFAULT '{}'::jsonb,
  ALTER COLUMN source_lineage SET NOT NULL,
  ALTER COLUMN evidence_fingerprint SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_experience_tier_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_experience_tier_check
      CHECK (experience_tier IN ('T1', 'T2', 'T3')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_reuse_scope_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_reuse_scope_check
      CHECK (reuse_scope IN ('project', 'company', 'industry', 'global')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_fact_source_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_fact_source_check
      CHECK (fact_source IN ('actual_outcome', 'behavioral_change', 'replay', 'hybrid')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_scope_alignment_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_scope_alignment_check
      CHECK (reuse_scope = learning_scope) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_company_scope_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_company_scope_check
      CHECK (company_id IS NOT NULL OR reuse_scope IN ('industry', 'global')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_project_scope_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_project_scope_check
      CHECK (reuse_scope <> 'project' OR (company_id IS NOT NULL AND project_id IS NOT NULL)) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_experience_tier_check;
ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_reuse_scope_check;
ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_fact_source_check;
ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_scope_alignment_check;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_experience_samples_company_fingerprint
  ON public.duration_experience_samples (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::UUID),
    evidence_fingerprint
  );

CREATE INDEX IF NOT EXISTS idx_duration_experience_samples_asset_identity
  ON public.duration_experience_samples (
    company_id,
    project_id,
    experience_tier,
    reuse_scope,
    fact_source,
    completed_at DESC
  );

ALTER TABLE public.duration_experience_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_experience_samples FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duration_experience_samples_auth_read_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_auth_read_policy
  ON public.duration_experience_samples
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND duration_experience_samples.company_id IS NOT NULL
    AND public.is_active_company_member(duration_experience_samples.company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS duration_experience_samples_auth_write_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_auth_write_policy
  ON public.duration_experience_samples
  FOR ALL
  TO authenticated
  USING (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND public.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
  )
  WITH CHECK (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.project_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND public.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_experience_samples.project_id
        AND project.company_id = duration_experience_samples.company_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_samples TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_experience_samples_backend_runtime_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_backend_runtime_policy
  ON public.duration_experience_samples
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON COLUMN public.duration_experience_samples.company_id IS
  'Explicit tenant owner for project/company raw duration evidence; shared upper-scope aggregates remain tenant-null and are not client-readable.';
COMMENT ON COLUMN public.duration_experience_samples.evidence_fingerprint IS
  'Stable dedupe identity for traceable raw evidence. New writers use SHA-256; migration backfill uses deterministic legacy-md5 identifiers.';
COMMENT ON COLUMN public.duration_experience_samples.source_lineage IS
  'Structured source and collection lineage required before learning-governance admission.';

-- --------------------------------------------------------------------------
-- Project calibration tenant identity
-- --------------------------------------------------------------------------

ALTER TABLE public.project_productivity_compensation_calibrations
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.project_productivity_compensation_calibrations calibration
SET company_id = project.company_id
FROM public.projects project
WHERE calibration.project_id = project.id
  AND calibration.company_id IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_project_productivity_calibration_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  project_company_id UUID;
BEGIN
  SELECT project.company_id
    INTO project_company_id
    FROM public.projects project
   WHERE project.id = NEW.project_id;
  IF project_company_id IS NULL THEN
    RAISE EXCEPTION 'project productivity calibration project does not exist: %', NEW.project_id;
  END IF;
  IF NEW.company_id IS NOT NULL AND NEW.company_id <> project_company_id THEN
    RAISE EXCEPTION 'project productivity calibration company does not own project %', NEW.project_id;
  END IF;
  NEW.company_id := project_company_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_project_productivity_calibration_tenant_trigger
  ON public.project_productivity_compensation_calibrations;
CREATE TRIGGER ensure_project_productivity_calibration_tenant_trigger
  BEFORE INSERT OR UPDATE OF company_id, project_id
  ON public.project_productivity_compensation_calibrations
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_project_productivity_calibration_tenant();

ALTER TABLE public.project_productivity_compensation_calibrations
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_productivity_calibration_tenant_status
  ON public.project_productivity_compensation_calibrations(
    company_id,
    project_id,
    calibration_key,
    status,
    window_end_date DESC
  );

ALTER TABLE public.project_productivity_compensation_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_productivity_compensation_calibrations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_productivity_calibration_select_member
  ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_select_member
  ON public.project_productivity_compensation_calibrations
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND public.is_active_company_member(company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS project_productivity_calibration_write_service_role
  ON public.project_productivity_compensation_calibrations;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.project_productivity_compensation_calibrations
  TO workbuddy_runtime;
DROP POLICY IF EXISTS project_productivity_calibration_backend_runtime
  ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_backend_runtime
  ON public.project_productivity_compensation_calibrations
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON COLUMN public.project_productivity_compensation_calibrations.company_id IS
  'Explicit tenant owner used by candidate replacement, publication and rollback transactions.';

-- --------------------------------------------------------------------------
-- Missed task-completion sample recovery
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.duration_experience_collection_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL DEFAULT 'task_completion',
  source_type TEXT NOT NULL DEFAULT 'task_completion',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'retrying', 'waiting_for_facts', 'completed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0 AND max_attempts <= 20),
  next_attempt_at TIMESTAMPTZ NULL DEFAULT now(),
  last_error TEXT NULL,
  completed_at TIMESTAMPTZ NULL,
  dead_lettered_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duration_experience_collection_queue_unique_task_source
    UNIQUE (company_id, task_id, source_type)
);

CREATE OR REPLACE FUNCTION public.ensure_duration_experience_collection_queue_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  project_company_id UUID;
  task_project_id UUID;
BEGIN
  SELECT project.company_id
    INTO project_company_id
    FROM public.projects project
   WHERE project.id = NEW.project_id;
  IF project_company_id IS NULL OR project_company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'duration experience queue company does not own project %', NEW.project_id;
  END IF;

  SELECT task.project_id
    INTO task_project_id
    FROM public.tasks task
   WHERE task.id = NEW.task_id;
  IF task_project_id IS NULL OR task_project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'duration experience queue task does not belong to project %', NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_duration_experience_collection_queue_tenant_trigger
  ON public.duration_experience_collection_queue;
CREATE TRIGGER ensure_duration_experience_collection_queue_tenant_trigger
  BEFORE INSERT OR UPDATE OF company_id, project_id, task_id
  ON public.duration_experience_collection_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_duration_experience_collection_queue_tenant();

CREATE INDEX IF NOT EXISTS idx_duration_experience_collection_queue_due
  ON public.duration_experience_collection_queue(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retrying', 'waiting_for_facts');

CREATE INDEX IF NOT EXISTS idx_duration_experience_collection_queue_project
  ON public.duration_experience_collection_queue(company_id, project_id, status, updated_at DESC);

ALTER TABLE public.duration_experience_collection_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_experience_collection_queue FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_collection_queue TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_experience_collection_queue_backend_runtime
  ON public.duration_experience_collection_queue;
CREATE POLICY duration_experience_collection_queue_backend_runtime
  ON public.duration_experience_collection_queue
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON TABLE public.duration_experience_collection_queue IS
  'Backend-only retry/dead-letter queue for task completions whose duration experience sample was not collected.';

-- --------------------------------------------------------------------------
-- Tenant-safe candidate/version state and atomic canary approval/rollback
-- --------------------------------------------------------------------------

ALTER TABLE public.duration_context_policy_versions
  ADD COLUMN IF NOT EXISTS supersedes_version_id UUID NULL
    REFERENCES public.duration_context_policy_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rollback_target_version_id UUID NULL
    REFERENCES public.duration_context_policy_versions(id) ON DELETE SET NULL;

UPDATE public.duration_context_policy_canary_candidates candidate
SET company_id = project.company_id
FROM public.projects project
WHERE candidate.project_id = project.id
  AND candidate.company_id IS NULL;

UPDATE public.duration_context_policy_versions version
SET company_id = COALESCE(candidate.company_id, project.company_id)
FROM public.duration_context_policy_canary_candidates candidate
LEFT JOIN public.projects project ON project.id = candidate.project_id
WHERE version.source_candidate_id = candidate.id
  AND version.company_id IS NULL;

ALTER TABLE public.duration_context_policy_canary_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_context_policy_canary_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.duration_context_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_context_policy_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates
  FOR SELECT
  TO authenticated
  USING (company_id IS NOT NULL AND public.is_active_company_member(company_id, NULL::TEXT[]));

DROP POLICY IF EXISTS duration_context_policy_version_select_member
  ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_version_select_member
  ON public.duration_context_policy_versions
  FOR SELECT
  TO authenticated
  USING (company_id IS NOT NULL AND public.is_active_company_member(company_id, NULL::TEXT[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_context_policy_canary_candidates TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_context_policy_canary_candidates_backend_runtime
  ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidates_backend_runtime
  ON public.duration_context_policy_canary_candidates
  FOR ALL
  TO workbuddy_runtime
  USING (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
  WITH CHECK (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_context_policy_versions TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_context_policy_versions_backend_runtime
  ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_versions_backend_runtime
  ON public.duration_context_policy_versions
  FOR ALL
  TO workbuddy_runtime
  USING (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
  WITH CHECK (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'));

CREATE OR REPLACE FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  p_company_id UUID,
  p_candidate_id UUID,
  p_approved_by UUID,
  p_scope JSONB,
  p_reason TEXT,
  p_expires_at TIMESTAMPTZ,
  p_review_metadata JSONB
)
RETURNS TABLE (candidate_row JSONB, version_row JSONB, superseded_version_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_candidate public.duration_context_policy_canary_candidates%ROWTYPE;
  selected_previous public.duration_context_policy_versions%ROWTYPE;
  inserted_version public.duration_context_policy_versions%ROWTYPE;
  previous_version_id UUID;
  previous_version_status TEXT;
BEGIN
  IF p_company_id IS NULL OR p_candidate_id IS NULL THEN
    RAISE EXCEPTION 'company and candidate identity are required';
  END IF;

  SELECT candidate.*
    INTO selected_candidate
    FROM public.duration_context_policy_canary_candidates candidate
   WHERE candidate.id = p_candidate_id
     AND candidate.company_id = p_company_id
     AND candidate.candidate_status = 'candidate'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration context policy canary candidate not found for tenant or already changed';
  END IF;

  IF selected_candidate.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = selected_candidate.project_id
      AND project.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'candidate project does not belong to the current tenant';
  END IF;

  IF jsonb_typeof(COALESCE(p_scope, '{}'::jsonb)->'projectIds') = 'array' AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p_scope, '{}'::jsonb)->'projectIds') scoped(project_id_text)
    LEFT JOIN public.projects project
      ON project.id = CASE
        WHEN scoped.project_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN scoped.project_id_text::UUID
        ELSE NULL
      END
    WHERE project.id IS NULL OR project.company_id <> p_company_id
  ) THEN
    RAISE EXCEPTION 'canary scope includes a project outside the current tenant';
  END IF;

  SELECT version.*
    INTO selected_previous
    FROM public.duration_context_policy_versions version
   WHERE version.company_id = p_company_id
     AND version.project_id IS NOT DISTINCT FROM selected_candidate.project_id
     AND version.state_bucket = selected_candidate.state_bucket
     AND version.action_key = selected_candidate.action_key
     AND version.version_status IN ('canary', 'published')
   ORDER BY version.approved_at DESC, version.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    previous_version_id := selected_previous.id;
    previous_version_status := selected_previous.version_status;
    UPDATE public.duration_context_policy_versions
       SET version_status = 'expired',
           runtime_auto_publish_eligible = FALSE,
           rollback_metadata = COALESCE(rollback_metadata, '{}'::jsonb) || jsonb_build_object(
             'supersededByCandidateId', p_candidate_id::TEXT,
             'previousVersionStatus', previous_version_status,
             'supersededAt', now()
           ),
           updated_at = now()
     WHERE id = previous_version_id
       AND company_id = p_company_id;
  END IF;

  UPDATE public.duration_context_policy_canary_candidates candidate
     SET candidate_status = 'approved_for_canary',
         runtime_auto_publish_eligible = FALSE,
         requires_review = FALSE,
         review_metadata = COALESCE(p_review_metadata, '{}'::jsonb) || jsonb_build_object(
           'reviewedBy', p_approved_by,
           'reviewedAt', now(),
           'reviewReason', p_reason,
           'approvalMode', 'tenant_atomic_canary'
         ),
         updated_at = now()
   WHERE candidate.id = p_candidate_id
     AND candidate.company_id = p_company_id
     AND candidate.candidate_status = 'candidate'
   RETURNING candidate.* INTO selected_candidate;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration context policy canary candidate changed during approval';
  END IF;

  INSERT INTO public.duration_context_policy_versions (
    company_id, model_family, model_version, source_candidate_id, version_status,
    activation_mode, runtime_mutation_policy, runtime_auto_publish_eligible,
    rollback_policy, project_id, state_bucket, action_key, canary_scope,
    approved_by, approved_at, expires_at, replay_case_count,
    average_projected_reward_delta, source_decision_ids, guardrails,
    approval_reason, supersedes_version_id, rollback_target_version_id,
    created_at, updated_at
  ) VALUES (
    p_company_id, selected_candidate.model_family, selected_candidate.model_version,
    selected_candidate.id, 'canary', 'review_required_canary',
    'none_version_registry_only', FALSE,
    'manual_rollback_required_before_runtime_disablement', selected_candidate.project_id,
    selected_candidate.state_bucket, selected_candidate.action_key,
    COALESCE(p_scope, '{}'::jsonb), p_approved_by, now(), p_expires_at,
    selected_candidate.replay_case_count, selected_candidate.average_projected_reward_delta,
    selected_candidate.source_decision_ids, selected_candidate.guardrails, p_reason,
    previous_version_id, previous_version_id, now(), now()
  )
  RETURNING * INTO inserted_version;

  RETURN QUERY
  SELECT to_jsonb(selected_candidate), to_jsonb(inserted_version), previous_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_duration_context_policy_version_atomic(
  p_company_id UUID,
  p_version_id UUID,
  p_rolled_back_by UUID,
  p_reason TEXT
)
RETURNS TABLE (rolled_back_version_row JSONB, restored_version_row JSONB)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_version public.duration_context_policy_versions%ROWTYPE;
  rolled_back_version public.duration_context_policy_versions%ROWTYPE;
  restore_target public.duration_context_policy_versions%ROWTYPE;
  restored_version public.duration_context_policy_versions%ROWTYPE;
  restore_target_id UUID;
  restore_status TEXT;
BEGIN
  IF p_company_id IS NULL OR p_version_id IS NULL THEN
    RAISE EXCEPTION 'company and version identity are required';
  END IF;

  SELECT version.*
    INTO selected_version
    FROM public.duration_context_policy_versions version
   WHERE version.id = p_version_id
     AND version.company_id = p_company_id
     AND version.version_status IN ('canary', 'published')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration context policy version not found for tenant or is not active';
  END IF;

  restore_target_id := COALESCE(
    selected_version.rollback_target_version_id,
    selected_version.supersedes_version_id
  );

  IF restore_target_id IS NULL THEN
    SELECT previous.id
      INTO restore_target_id
      FROM public.duration_context_policy_versions previous
     WHERE previous.company_id = p_company_id
       AND previous.project_id IS NOT DISTINCT FROM selected_version.project_id
       AND previous.state_bucket = selected_version.state_bucket
       AND previous.action_key = selected_version.action_key
       AND previous.version_status = 'expired'
       AND previous.rollback_metadata->>'supersededByCandidateId' = selected_version.source_candidate_id::TEXT
     ORDER BY previous.updated_at DESC, previous.approved_at DESC
     LIMIT 1;
  END IF;

  IF restore_target_id IS NOT NULL THEN
    SELECT previous.*
      INTO restore_target
      FROM public.duration_context_policy_versions previous
     WHERE previous.id = restore_target_id
       AND previous.company_id = p_company_id
       AND previous.version_status = 'expired'
     FOR UPDATE;
    IF FOUND THEN
      restore_status := CASE
        WHEN restore_target.rollback_metadata->>'previousVersionStatus' IN ('canary', 'published')
        THEN restore_target.rollback_metadata->>'previousVersionStatus'
        ELSE 'published'
      END;
    ELSE
      restore_target_id := NULL;
    END IF;
  END IF;

  UPDATE public.duration_context_policy_versions version
     SET version_status = 'rolled_back',
         runtime_auto_publish_eligible = FALSE,
         rollback_metadata = COALESCE(version.rollback_metadata, '{}'::jsonb) || jsonb_build_object(
           'rolledBackBy', p_rolled_back_by,
           'rollbackReason', p_reason,
           'rolledBackAt', now(),
           'restoredVersionId', restore_target_id
         ),
         updated_at = now()
   WHERE version.id = p_version_id
     AND version.company_id = p_company_id
     AND version.version_status IN ('canary', 'published')
   RETURNING version.* INTO rolled_back_version;

  IF restore_target_id IS NOT NULL THEN
    UPDATE public.duration_context_policy_versions previous
       SET version_status = restore_status,
           runtime_auto_publish_eligible = FALSE,
           rollback_metadata = COALESCE(previous.rollback_metadata, '{}'::jsonb) || jsonb_build_object(
             'restoredFromVersionId', p_version_id,
             'restoredAt', now()
           ),
           updated_at = now()
     WHERE previous.id = restore_target_id
       AND previous.company_id = p_company_id
       AND previous.version_status = 'expired'
     RETURNING previous.* INTO restored_version;
  END IF;

  RETURN QUERY
  SELECT to_jsonb(rolled_back_version),
         CASE WHEN restore_target_id IS NULL THEN NULL ELSE to_jsonb(restored_version) END;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_duration_context_policy_version_atomic(
  UUID, UUID, UUID, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, JSONB
) TO workbuddy_runtime;
GRANT EXECUTE ON FUNCTION public.rollback_duration_context_policy_version_atomic(
  UUID, UUID, UUID, TEXT
) TO workbuddy_runtime;

COMMENT ON FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, JSONB
) IS 'Tenant-filtered atomic canary approval: lock candidate, expire predecessor, persist lineage, and activate one canary version.';
COMMENT ON FUNCTION public.rollback_duration_context_policy_version_atomic(
  UUID, UUID, UUID, TEXT
) IS 'Tenant-filtered atomic rollback that restores the exact superseded canary/published predecessor when available.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 306_v14241_worker_runtime_job_write_rls.sql
-- ============================================================
-- v1.4.24.1: allow the non-bypass worker role to persist and inspect its
-- backend-only drawing-package iteration audit runs.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT ON TABLE public.drawing_package_experience_iteration_runs TO workbuddy_runtime;
  END IF;
END $$;

DROP POLICY IF EXISTS drawing_package_experience_iteration_runs_runtime_select
  ON public.drawing_package_experience_iteration_runs;
CREATE POLICY drawing_package_experience_iteration_runs_runtime_select
  ON public.drawing_package_experience_iteration_runs
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS drawing_package_experience_iteration_runs_runtime_insert
  ON public.drawing_package_experience_iteration_runs;
CREATE POLICY drawing_package_experience_iteration_runs_runtime_insert
  ON public.drawing_package_experience_iteration_runs
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;

-- ============================================================
-- Source: 307_v14231_learning_asset_private_rls_helper_reconciliation.sql
-- ============================================================
-- v1.4.23.1: keep the learning-asset RLS policies on the private membership
-- helper introduced by migration 278. Migration 305 recreated these policies
-- with the retired public helper after the private-helper rewrite had run.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('workbuddy_private.is_active_company_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private.is_active_company_member(uuid,text[]) is required before migration 307';
  END IF;
END
$$;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'authenticated',
    'service_role',
    'workbuddy_runtime',
    'workbuddy_runtime_login'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA workbuddy_private TO %I', role_name);
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO %I',
        role_name
      );
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM PUBLIC;
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$$;

DROP POLICY IF EXISTS duration_experience_samples_auth_read_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_auth_read_policy
  ON public.duration_experience_samples
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND duration_experience_samples.company_id IS NOT NULL
    AND workbuddy_private.is_active_company_member(
      duration_experience_samples.company_id,
      NULL::TEXT[]
    )
  );

DROP POLICY IF EXISTS duration_experience_samples_auth_write_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_auth_write_policy
  ON public.duration_experience_samples
  FOR ALL
  TO authenticated
  USING (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND workbuddy_private.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
  )
  WITH CHECK (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.project_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND workbuddy_private.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_experience_samples.project_id
        AND project.company_id = duration_experience_samples.company_id
    )
  );

DROP POLICY IF EXISTS project_productivity_calibration_select_member
  ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_select_member
  ON public.project_productivity_compensation_calibrations
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND workbuddy_private.is_active_company_member(company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND workbuddy_private.is_active_company_member(company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS duration_context_policy_version_select_member
  ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_version_select_member
  ON public.duration_context_policy_versions
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND workbuddy_private.is_active_company_member(company_id, NULL::TEXT[])
  );

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 308_commercial_trigger_rpc_acl_closeout.sql
-- ============================================================
-- Close the Supabase Advisor RPC ACL findings for commercial trigger functions.
-- Trigger execution remains unchanged; only direct function invocation is narrowed.

BEGIN;

DO $migration$
DECLARE
  function_identity TEXT;
  role_name TEXT;
BEGIN
  FOREACH function_identity IN ARRAY ARRAY[
    'public.workbuddy_initialize_company_commercial()',
    'public.workbuddy_meter_company_projects()'
  ] LOOP
    IF to_regprocedure(function_identity) IS NULL THEN
      RAISE EXCEPTION 'required commercial trigger function is missing: %', function_identity;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', function_identity);

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', function_identity, role_name);
      END IF;
    END LOOP;

    FOREACH role_name IN ARRAY ARRAY[
      'service_role',
      'workbuddy_runtime',
      'workbuddy_runtime_login'
    ] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', function_identity, role_name);
      END IF;
    END LOOP;
  END LOOP;
END
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 309_v14231_runtime_consumer_evidence_runtime_rls.sql
-- ============================================================
-- Allow the low-privilege backend runtime role to append and read duration
-- runtime-consumer evidence. The ledgers remain immutable to that role and
-- unavailable to browser-facing anon/authenticated roles.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 309';
  END IF;
END
$$;

ALTER TABLE public.runtime_consumer_runtime_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.runtime_consumer_runtime_calls FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.runtime_consumer_runtime_calls FROM anon, authenticated;
DROP POLICY IF EXISTS runtime_consumer_runtime_calls_select_admin
  ON public.runtime_consumer_runtime_calls;
GRANT SELECT, INSERT ON TABLE public.runtime_consumer_runtime_calls TO workbuddy_runtime;
REVOKE UPDATE, DELETE ON TABLE public.runtime_consumer_runtime_calls FROM workbuddy_runtime;
DROP POLICY IF EXISTS runtime_consumer_runtime_calls_backend_runtime_read
  ON public.runtime_consumer_runtime_calls;
CREATE POLICY runtime_consumer_runtime_calls_backend_runtime_read
  ON public.runtime_consumer_runtime_calls
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );
DROP POLICY IF EXISTS runtime_consumer_runtime_calls_backend_runtime_append
  ON public.runtime_consumer_runtime_calls;
CREATE POLICY runtime_consumer_runtime_calls_backend_runtime_append
  ON public.runtime_consumer_runtime_calls
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND writes_runtime_directly = false
    AND writes_fact_directly = false
  );

ALTER TABLE public.runtime_consumer_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.runtime_consumer_observations FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.runtime_consumer_observations FROM anon, authenticated;
DROP POLICY IF EXISTS runtime_consumer_observations_select_admin
  ON public.runtime_consumer_observations;
GRANT SELECT, INSERT ON TABLE public.runtime_consumer_observations TO workbuddy_runtime;
REVOKE UPDATE, DELETE ON TABLE public.runtime_consumer_observations FROM workbuddy_runtime;
DROP POLICY IF EXISTS runtime_consumer_observations_backend_runtime_read
  ON public.runtime_consumer_observations;
CREATE POLICY runtime_consumer_observations_backend_runtime_read
  ON public.runtime_consumer_observations
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );
DROP POLICY IF EXISTS runtime_consumer_observations_backend_runtime_append
  ON public.runtime_consumer_observations;
CREATE POLICY runtime_consumer_observations_backend_runtime_append
  ON public.runtime_consumer_observations
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND writes_runtime_directly = false
    AND writes_fact_directly = false
  );

COMMENT ON POLICY runtime_consumer_runtime_calls_backend_runtime_append
  ON public.runtime_consumer_runtime_calls IS
  'Backend runtime may append read-side facade-call evidence but cannot update or delete ledger rows.';
COMMENT ON POLICY runtime_consumer_observations_backend_runtime_append
  ON public.runtime_consumer_observations IS
  'Backend runtime may append lineage-bearing published artifact observations but cannot update or delete ledger rows.';

NOTIFY pgrst, 'reload schema';

COMMIT;


-- ============================================================
-- Source: 310_v14231_project_entity_links_runtime_rls.sql
-- ============================================================
-- Allow the low-privilege backend runtime role to maintain the polymorphic
-- links written by normal project workflows. Browser-facing policies remain
-- unchanged; application services must still scope every operation by project.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 310';
  END IF;
END
$$;

ALTER TABLE public.project_entity_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_entity_links TO workbuddy_runtime;

DROP POLICY IF EXISTS project_entity_links_backend_runtime_policy
  ON public.project_entity_links;
CREATE POLICY project_entity_links_backend_runtime_policy
  ON public.project_entity_links
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON POLICY project_entity_links_backend_runtime_policy
  ON public.project_entity_links IS
  'Backend runtime maintains project-scoped polymorphic links; browser-facing access remains governed by existing membership policies.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 311_retire_product_runtime_progress_knowledge_governance.sql
-- ============================================================
-- Retire repository-research candidate governance from the product database.
-- External knowledge remains a development input that is encoded into reviewed
-- seeds/rules/templates before normal code release. It is not a runtime subsystem.

BEGIN;

LOCK TABLE public.progress_asset_publication_readiness IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_asset_calibration_results IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_asset_calibration_runs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_asset_candidates IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_knowledge_documents IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_knowledge_sources IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  backup_sha256 TEXT := current_setting('workbuddy.progress_knowledge_retirement_backup_sha256', true);
  expected_fingerprint TEXT := current_setting('workbuddy.progress_knowledge_retirement_data_fingerprint', true);
  actual_fingerprint TEXT;
BEGIN
  IF backup_sha256 IS NULL OR backup_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'progress_knowledge_retirement_backup_required';
  END IF;
  IF expected_fingerprint IS NULL OR expected_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'progress_knowledge_retirement_fingerprint_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_asset_publication_readiness
    WHERE readiness_status IN ('auto_canary_active', 'auto_published')
  ) THEN
    RAISE EXCEPTION 'progress_knowledge_retirement_active_runtime_publication_present';
  END IF;

  SELECT encode(
           digest(
             convert_to(
               jsonb_build_object(
                 'progress_knowledge_sources', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_knowledge_sources source_row
                 ),
                 'progress_knowledge_documents', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_knowledge_documents source_row
                 ),
                 'progress_asset_candidates', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_asset_candidates source_row
                 ),
                 'progress_asset_calibration_runs', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_asset_calibration_runs source_row
                 ),
                 'progress_asset_calibration_results', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_asset_calibration_results source_row
                 ),
                 'progress_asset_publication_readiness', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_asset_publication_readiness source_row
                 )
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
  INTO actual_fingerprint;

  IF actual_fingerprint <> expected_fingerprint THEN
    RAISE EXCEPTION 'progress_knowledge_retirement_data_changed_after_backup';
  END IF;
END
$$;

DROP TABLE public.progress_asset_publication_readiness;
DROP TABLE public.progress_asset_calibration_results;
DROP TABLE public.progress_asset_calibration_runs;
DROP TABLE public.progress_asset_candidates;
DROP TABLE public.progress_knowledge_documents;
DROP TABLE public.progress_knowledge_sources;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 312_runtime_login_rls_helper_acl.sql
-- ============================================================
-- Ensure the concrete production runtime login can execute the non-exposed RLS
-- helper. Public helper RPCs remain unavailable to browser-facing roles.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('workbuddy_private.is_active_company_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private.is_active_company_member(uuid,text[]) is required before migration 312';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA workbuddy_private TO workbuddy_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT workbuddy_runtime TO workbuddy_runtime_login';
    END IF;

    EXECUTE 'GRANT USAGE ON SCHEMA workbuddy_private TO workbuddy_runtime_login';
    EXECUTE 'GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime_login';
  END IF;
END $$;

COMMIT;

-- ============================================================
-- Source: 313_grant_rls_helper_execute_to_runtime_roles.sql
-- ============================================================
-- Ensure every role that can evaluate project RLS can execute the non-exposed
-- active-company helper. Keep the legacy public helper backend-only so PostgREST
-- cannot expose its SECURITY DEFINER surface to anon/authenticated callers.

BEGIN;

DO $$
DECLARE
  target_role text;
BEGIN
  IF to_regprocedure('workbuddy_private.is_active_company_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private.is_active_company_member(uuid,text[]) is required before migration 313';
  END IF;

  FOREACH target_role IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'workbuddy_runtime',
    'workbuddy_runtime_login'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA workbuddy_private TO %I', target_role);
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO %I',
        target_role
      );
    END IF;
  END LOOP;

  IF to_regprocedure('public.is_active_company_member(uuid,text[])') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM PUBLIC';

    FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
        EXECUTE format(
          'REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM %I',
          target_role
        );
      END IF;
    END LOOP;

    FOREACH target_role IN ARRAY ARRAY['service_role', 'workbuddy_runtime', 'workbuddy_runtime_login'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO %I',
          target_role
        );
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT workbuddy_runtime TO workbuddy_runtime_login';
    END IF;
  END IF;
END $$;

COMMIT;

-- ============================================================
-- Source: 314_duration_day_basis_contract.sql
-- ============================================================
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

-- ============================================================
-- Source: 315_duration_learning_runtime_publications.sql
-- ============================================================
-- Governed runtime payloads for duration-learning assets.
-- Cold-start seeds and templates remain valid fallbacks. Only learned overlays
-- enter this table after replay/policy gates and remain reversible.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 315';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL UNIQUE,
  asset_key TEXT NOT NULL
    CHECK (asset_key IN (
      'base_duration_benchmark',
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate'
    )),
  artifact_key TEXT NOT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('project', 'company', 'industry', 'global')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  industry_key TEXT NULL,
  publication_stage TEXT NOT NULL
    CHECK (publication_stage IN ('canary', 'stable', 'superseded', 'rolled_back')),
  runtime_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_candidate_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  automation_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_publication_key TEXT NULL
    REFERENCES public.duration_learning_runtime_publications(publication_key) ON DELETE SET NULL,
  traffic_percent INTEGER NOT NULL DEFAULT 100
    CHECK (traffic_percent BETWEEN 1 AND 100),
  monitoring_window_hours INTEGER NOT NULL DEFAULT 72
    CHECK (monitoring_window_hours BETWEEN 1 AND 2160),
  monitoring_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (monitoring_status IN ('pending', 'collecting', 'passed', 'failed', 'rollback_pending')),
  monitoring_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  impact_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_execution JSONB NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rolled_back_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duration_learning_runtime_publications_scope_consistency CHECK (
    (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
      AND industry_key IS NULL
    )
    OR (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
      AND industry_key IS NULL
    )
    OR (
      scope_level = 'industry'
      AND company_id IS NULL
      AND project_id IS NULL
      AND NULLIF(industry_key, '') IS NOT NULL
    )
    OR (
      scope_level = 'global'
      AND company_id IS NULL
      AND project_id IS NULL
      AND industry_key IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_learning_runtime_publications_active_scope
  ON public.duration_learning_runtime_publications (
    asset_key,
    artifact_key,
    scope_level,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(industry_key, ''),
    publication_stage
  )
  WHERE publication_stage IN ('canary', 'stable');

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_publications_resolution
  ON public.duration_learning_runtime_publications (
    asset_key,
    artifact_key,
    publication_stage,
    scope_level,
    published_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_publications_monitoring
  ON public.duration_learning_runtime_publications (
    monitoring_status,
    monitoring_started_at,
    publication_stage
  )
  WHERE publication_stage IN ('canary', 'stable');

ALTER TABLE public.duration_learning_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_publications FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.duration_learning_runtime_publications
  TO workbuddy_runtime;

DROP POLICY IF EXISTS duration_learning_runtime_publications_backend_runtime_policy
  ON public.duration_learning_runtime_publications;
CREATE POLICY duration_learning_runtime_publications_backend_runtime_policy
  ON public.duration_learning_runtime_publications
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON TABLE public.duration_learning_runtime_publications IS
  'Executable, scoped and reversible duration-learning overlays. This table never stores task, dependency, baseline or progress facts.';
COMMENT ON COLUMN public.duration_learning_runtime_publications.runtime_payload IS
  'Validated runtime payload consumed by the owning duration or plan-network resolver.';
COMMENT ON COLUMN public.duration_learning_runtime_publications.previous_publication_key IS
  'Previously stable publication retained for atomic rollback.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 316_task_fact_write_integrity.sql
-- ============================================================
-- 316: Make the application task write chain the sole progress snapshot writer
-- and persist task-reconcile rollback execution state.

BEGIN;

DROP TRIGGER IF EXISTS trigger_auto_record_snapshot ON public.tasks;
DROP FUNCTION IF EXISTS public.auto_record_progress_snapshot();

ALTER TABLE public.task_reconcile_backups
  ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rolled_back_by UUID,
  ADD COLUMN IF NOT EXISTS rollback_result JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_task_reconcile_backups_rollback_state
  ON public.task_reconcile_backups(project_id, reconcile_batch_id, rolled_back_at);

COMMENT ON COLUMN public.task_reconcile_backups.rolled_back_at IS
  'Timestamp of the first successful atomic reconcile rollback.';
COMMENT ON COLUMN public.task_reconcile_backups.rolled_back_by IS
  'Actor that executed the first successful atomic reconcile rollback.';
COMMENT ON COLUMN public.task_reconcile_backups.rollback_result IS
  'Counts and outcome metadata from the atomic reconcile rollback.';

COMMIT;

-- ============================================================
-- Source: 317_structured_cause_attribution.sql
-- ============================================================
-- Structured business-cause attribution with evidence-first inference and
-- explicit separation between business cause and contractual responsibility.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 317';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.structured_cause_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL
    CHECK (subject_type IN ('task', 'risk', 'issue', 'baseline_change')),
  subject_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('delay', 'completion', 'closure', 'baseline_change')),
  cause_code TEXT NOT NULL
    CHECK (cause_code IN (
      'predecessor_delay', 'material_shortage', 'labor_shortage',
      'equipment_unavailable', 'design_change', 'drawing_delay',
      'quality_rework', 'weather_impact', 'owner_decision',
      'government_inspection', 'site_capacity_pressure',
       'workflow_sequence', 'external_readiness', 'other'
     )),
  prefilled_cause_code TEXT NULL
    CHECK (prefilled_cause_code IS NULL OR prefilled_cause_code IN (
      'predecessor_delay', 'material_shortage', 'labor_shortage',
      'equipment_unavailable', 'design_change', 'drawing_delay',
      'quality_rework', 'weather_impact', 'owner_decision',
      'government_inspection', 'site_capacity_pressure',
      'workflow_sequence', 'external_readiness', 'other'
    )),
  prefill_modified BOOLEAN NULL,
  cause_role TEXT NOT NULL
    CHECK (cause_role IN ('primary', 'contributing', 'transmitted')),
  taxonomy_version TEXT NOT NULL,
  responsibility_class TEXT NULL
    CHECK (responsibility_class IS NULL OR responsibility_class IN (
      'owner_attributable', 'contractor_attributable', 'force_majeure',
      'shared', 'undetermined'
    )),
  responsibility_basis TEXT NULL,
  raw_text TEXT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence_refs) = 'array'),
  evidence_source_types JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence_source_types) = 'array'),
  overlap_start TIMESTAMPTZ NULL,
  overlap_end TIMESTAMPTZ NULL,
  rule_version TEXT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'confirmed', 'rejected', 'superseded')),
  auto_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmation_source TEXT NOT NULL DEFAULT 'candidate'
    CHECK (confirmation_source IN ('candidate', 'deterministic_policy', 'user_confirmed')),
  review_reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(review_reason_codes) = 'array'),
  confirmed_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ NULL,
  rejected_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  dedupe_key TEXT NOT NULL,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, dedupe_key),
  CHECK (overlap_end IS NULL OR overlap_start IS NULL OR overlap_end >= overlap_start),
  CHECK (responsibility_class IS NULL OR status = 'confirmed'),
  CHECK (prefill_modified IS NULL OR prefilled_cause_code IS NOT NULL),
  CHECK (NOT auto_confirmed OR (status = 'confirmed' AND responsibility_class IS NULL))
);

ALTER TABLE public.structured_cause_attributions
  ADD COLUMN IF NOT EXISTS prefilled_cause_code TEXT NULL
    CHECK (prefilled_cause_code IS NULL OR prefilled_cause_code IN (
      'predecessor_delay', 'material_shortage', 'labor_shortage',
      'equipment_unavailable', 'design_change', 'drawing_delay',
      'quality_rework', 'weather_impact', 'owner_decision',
      'government_inspection', 'site_capacity_pressure',
      'workflow_sequence', 'external_readiness', 'other'
    )),
  ADD COLUMN IF NOT EXISTS prefill_modified BOOLEAN NULL;

UPDATE public.structured_cause_attributions
   SET prefilled_cause_code = cause_code
 WHERE prefilled_cause_code IS NULL
   AND confirmation_source IN ('candidate', 'deterministic_policy');

ALTER TABLE public.structured_cause_attributions
  DROP CONSTRAINT IF EXISTS structured_cause_prefill_modified_requires_prefill;
ALTER TABLE public.structured_cause_attributions
  ADD CONSTRAINT structured_cause_prefill_modified_requires_prefill
  CHECK (prefill_modified IS NULL OR prefilled_cause_code IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_structured_cause_confirmed_primary
  ON public.structured_cause_attributions (
    company_id, project_id, subject_type, subject_id, event_type
  )
  WHERE cause_role = 'primary' AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_structured_cause_project_subject
  ON public.structured_cause_attributions (
    company_id, project_id, subject_type, subject_id, created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_structured_cause_review_queue
  ON public.structured_cause_attributions (
    company_id, project_id, status, confidence DESC, created_at ASC
  )
  WHERE status = 'candidate';

CREATE INDEX IF NOT EXISTS idx_structured_cause_quality_metrics
  ON public.structured_cause_attributions (
    company_id, project_id, confirmed_at
  )
  WHERE confirmed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_structured_cause_attribution_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  project_company_id UUID;
BEGIN
  SELECT project.company_id
    INTO project_company_id
    FROM public.projects project
   WHERE project.id = NEW.project_id;

  IF project_company_id IS NULL THEN
    RAISE EXCEPTION 'structured cause attribution project not found';
  END IF;
  IF NEW.company_id IS DISTINCT FROM project_company_id THEN
    RAISE EXCEPTION 'structured cause attribution tenant mismatch';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ensure_structured_cause_attribution_tenant_trigger
  ON public.structured_cause_attributions;
CREATE TRIGGER ensure_structured_cause_attribution_tenant_trigger
  BEFORE INSERT OR UPDATE OF company_id, project_id
  ON public.structured_cause_attributions
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_structured_cause_attribution_tenant();

ALTER TABLE public.structured_cause_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.structured_cause_attributions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.structured_cause_attributions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.structured_cause_attributions
  TO authenticated, workbuddy_runtime;

DROP POLICY IF EXISTS structured_cause_attributions_member_read
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_member_read
  ON public.structured_cause_attributions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND workbuddy_private.is_active_company_member(structured_cause_attributions.company_id, NULL::TEXT[])
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        NULL::TEXT[]
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = structured_cause_attributions.project_id
        AND project.company_id = structured_cause_attributions.company_id
    )
  );

DROP POLICY IF EXISTS structured_cause_attributions_editor_insert
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_editor_insert
  ON public.structured_cause_attributions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workbuddy_private.is_active_company_member(
      structured_cause_attributions.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        ARRAY['owner', 'editor']::TEXT[]
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = structured_cause_attributions.project_id
        AND project.company_id = structured_cause_attributions.company_id
    )
  );

DROP POLICY IF EXISTS structured_cause_attributions_editor_update
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_editor_update
  ON public.structured_cause_attributions
  FOR UPDATE
  TO authenticated
  USING (
    workbuddy_private.is_active_company_member(
      structured_cause_attributions.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        ARRAY['owner', 'editor']::TEXT[]
      )
    )
  )
  WITH CHECK (
    workbuddy_private.is_active_company_member(
      structured_cause_attributions.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        ARRAY['owner', 'editor']::TEXT[]
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = structured_cause_attributions.project_id
        AND project.company_id = structured_cause_attributions.company_id
    )
  );

DROP POLICY IF EXISTS structured_cause_attributions_editor_delete
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_editor_delete
  ON public.structured_cause_attributions
  FOR DELETE
  TO authenticated
  USING (
    workbuddy_private.is_active_company_member(
      structured_cause_attributions.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        ARRAY['owner', 'editor']::TEXT[]
      )
    )
  );

DROP POLICY IF EXISTS structured_cause_attributions_backend_runtime
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_backend_runtime
  ON public.structured_cause_attributions
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON TABLE public.structured_cause_attributions IS
  'Evidence-backed business causes. Contractual responsibility remains null until explicit user confirmation.';
COMMENT ON COLUMN public.structured_cause_attributions.raw_text IS
  'Original field wording retained for human context; aggregation uses cause_code and taxonomy_version.';
COMMENT ON COLUMN public.structured_cause_attributions.confirmation_source IS
  'Offline model labels remain candidate; deterministic policy may confirm causes but never contractual responsibility.';
COMMENT ON COLUMN public.structured_cause_attributions.prefilled_cause_code IS
  'Original inferred cause shown to the reviewer; retained when the confirmed cause is changed.';
COMMENT ON COLUMN public.structured_cause_attributions.prefill_modified IS
  'User-confirmed comparison result used only for inference-rule quality governance.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 318_risk_issue_structured_closure_outcome.sql
-- ============================================================
-- Persist how a risk or issue was closed. Free text remains available for
-- context, while controlled result/effectiveness fields support reporting and learning.

BEGIN;

ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS closure_result_code TEXT,
  ADD COLUMN IF NOT EXISTS closure_result_summary TEXT,
  ADD COLUMN IF NOT EXISTS closure_effectiveness TEXT,
  ADD COLUMN IF NOT EXISTS closure_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS closure_cause_attribution_id UUID
    REFERENCES public.structured_cause_attributions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_recorded_at TIMESTAMPTZ;

ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS closure_result_code TEXT,
  ADD COLUMN IF NOT EXISTS closure_result_summary TEXT,
  ADD COLUMN IF NOT EXISTS closure_effectiveness TEXT,
  ADD COLUMN IF NOT EXISTS closure_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS closure_cause_attribution_id UUID
    REFERENCES public.structured_cause_attributions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_recorded_at TIMESTAMPTZ;

UPDATE public.risks
   SET closure_result_code = COALESCE(closure_result_code, 'legacy_close'),
       closure_result_summary = COALESCE(NULLIF(closure_result_summary, ''), NULLIF(closed_reason, ''), 'Historical close record'),
       closure_effectiveness = COALESCE(closure_effectiveness, 'undetermined'),
       closure_recorded_at = COALESCE(closure_recorded_at, closed_at, updated_at)
 WHERE status = 'closed';

UPDATE public.issues
   SET closure_result_code = COALESCE(closure_result_code, 'legacy_close'),
       closure_result_summary = COALESCE(NULLIF(closure_result_summary, ''), NULLIF(closed_reason, ''), 'Historical close record'),
       closure_effectiveness = COALESCE(closure_effectiveness, 'undetermined'),
       closure_recorded_at = COALESCE(closure_recorded_at, closed_at, updated_at)
 WHERE status = 'closed';

ALTER TABLE public.risks
  DROP CONSTRAINT IF EXISTS risks_closure_result_code_check,
  DROP CONSTRAINT IF EXISTS risks_closure_effectiveness_check,
  DROP CONSTRAINT IF EXISTS risks_closure_evidence_refs_array_check,
  DROP CONSTRAINT IF EXISTS risks_closed_outcome_required_check;
ALTER TABLE public.risks
  ADD CONSTRAINT risks_closure_result_code_check
    CHECK (closure_result_code IS NULL OR closure_result_code IN ('resolved', 'mitigated', 'transferred', 'accepted', 'duplicate', 'invalidated', 'retention_close', 'legacy_close')),
  ADD CONSTRAINT risks_closure_effectiveness_check
    CHECK (closure_effectiveness IS NULL OR closure_effectiveness IN ('resolved', 'partially_resolved', 'transferred', 'accepted', 'undetermined')),
  ADD CONSTRAINT risks_closure_evidence_refs_array_check
    CHECK (jsonb_typeof(closure_evidence_refs) = 'array'),
  ADD CONSTRAINT risks_closed_outcome_required_check
    CHECK (status <> 'closed' OR (
      closure_result_code IS NOT NULL
      AND NULLIF(closure_result_summary, '') IS NOT NULL
      AND closure_effectiveness IS NOT NULL
      AND closure_recorded_at IS NOT NULL
    ));

ALTER TABLE public.issues
  DROP CONSTRAINT IF EXISTS issues_closure_result_code_check,
  DROP CONSTRAINT IF EXISTS issues_closure_effectiveness_check,
  DROP CONSTRAINT IF EXISTS issues_closure_evidence_refs_array_check,
  DROP CONSTRAINT IF EXISTS issues_closed_outcome_required_check;
ALTER TABLE public.issues
  ADD CONSTRAINT issues_closure_result_code_check
    CHECK (closure_result_code IS NULL OR closure_result_code IN ('resolved', 'mitigated', 'transferred', 'accepted', 'duplicate', 'invalidated', 'retention_close', 'legacy_close')),
  ADD CONSTRAINT issues_closure_effectiveness_check
    CHECK (closure_effectiveness IS NULL OR closure_effectiveness IN ('resolved', 'partially_resolved', 'transferred', 'accepted', 'undetermined')),
  ADD CONSTRAINT issues_closure_evidence_refs_array_check
    CHECK (jsonb_typeof(closure_evidence_refs) = 'array'),
  ADD CONSTRAINT issues_closed_outcome_required_check
    CHECK (status <> 'closed' OR (
      closure_result_code IS NOT NULL
      AND NULLIF(closure_result_summary, '') IS NOT NULL
      AND closure_effectiveness IS NOT NULL
      AND closure_recorded_at IS NOT NULL
    ));

CREATE OR REPLACE FUNCTION public.validate_risk_issue_closure_cause_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  attribution public.structured_cause_attributions%ROWTYPE;
BEGIN
  IF NEW.closure_cause_attribution_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO attribution
    FROM public.structured_cause_attributions
   WHERE id = NEW.closure_cause_attribution_id;

  IF attribution.id IS NULL
     OR attribution.status <> 'confirmed'
     OR attribution.project_id <> NEW.project_id
     OR attribution.subject_type <> TG_ARGV[0]
     OR attribution.subject_id <> NEW.id::TEXT THEN
    RAISE EXCEPTION 'closure cause attribution does not match the closed record';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS validate_risk_closure_cause_attribution_trigger ON public.risks;
CREATE TRIGGER validate_risk_closure_cause_attribution_trigger
  BEFORE INSERT OR UPDATE OF closure_cause_attribution_id, project_id
  ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_risk_issue_closure_cause_attribution('risk');

DROP TRIGGER IF EXISTS validate_issue_closure_cause_attribution_trigger ON public.issues;
CREATE TRIGGER validate_issue_closure_cause_attribution_trigger
  BEFORE INSERT OR UPDATE OF closure_cause_attribution_id, project_id
  ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_risk_issue_closure_cause_attribution('issue');

CREATE INDEX IF NOT EXISTS idx_risks_closure_result
  ON public.risks(project_id, closure_result_code, closure_recorded_at DESC)
  WHERE status = 'closed';
CREATE INDEX IF NOT EXISTS idx_issues_closure_result
  ON public.issues(project_id, closure_result_code, closure_recorded_at DESC)
  WHERE status = 'closed';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 320_notification_task_reference_retirement.sql
-- ============================================================
-- Preserve notifications when their source task has already been deleted.
-- The immutable pre-apply backup is required because this migration retires
-- dangling references and resolves warning rows in place.

BEGIN;

LOCK TABLE public.tasks IN SHARE MODE;
LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  backup_sha256 TEXT := current_setting('workbuddy.notification_task_reference_retirement_backup_sha256', true);
  expected_fingerprint TEXT := current_setting('workbuddy.notification_task_reference_retirement_data_fingerprint', true);
  actual_fingerprint TEXT;
BEGIN
  IF backup_sha256 IS NULL OR backup_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'notification_task_reference_retirement_backup_required';
  END IF;
  IF expected_fingerprint IS NULL OR expected_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'notification_task_reference_retirement_fingerprint_required';
  END IF;

  WITH captured AS (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(notification_row) ORDER BY notification_row.id),
      '[]'::jsonb
    ) AS snapshot
    FROM public.notifications notification_row
    LEFT JOIN public.tasks task_row
      ON task_row.id::text = notification_row.task_id::text
    WHERE notification_row.task_id IS NOT NULL
      AND task_row.id IS NULL
  )
  SELECT encode(
           digest(convert_to(snapshot::text, 'UTF8'), 'sha256'),
           'hex'
         )
    INTO actual_fingerprint
    FROM captured;

  IF actual_fingerprint <> expected_fingerprint THEN
    RAISE EXCEPTION 'notification_task_reference_retirement_data_changed_after_backup';
  END IF;
END
$$;

WITH orphaned AS (
  SELECT notification_row.id
  FROM public.notifications notification_row
  LEFT JOIN public.tasks task_row
    ON task_row.id::text = notification_row.task_id::text
  WHERE notification_row.task_id IS NOT NULL
    AND task_row.id IS NULL
)
UPDATE public.notifications notification_row
SET
  warning_lifecycle_status = 'resolved',
  status = 'resolved',
  resolved_source = 'source_deleted',
  resolved_at = COALESCE(notification_row.resolved_at, transaction_timestamp()),
  updated_at = transaction_timestamp()
FROM orphaned
WHERE notification_row.id = orphaned.id
  AND notification_row.source_entity_type = 'warning';

WITH orphaned AS (
  SELECT notification_row.id
  FROM public.notifications notification_row
  LEFT JOIN public.tasks task_row
    ON task_row.id::text = notification_row.task_id::text
  WHERE notification_row.task_id IS NOT NULL
    AND task_row.id IS NULL
)
UPDATE public.notifications notification_row
SET
  metadata = jsonb_set(
    CASE
      WHEN jsonb_typeof(COALESCE(notification_row.metadata, '{}'::jsonb)) = 'object'
        THEN COALESCE(notification_row.metadata, '{}'::jsonb)
      ELSE jsonb_build_object('legacy_metadata', notification_row.metadata)
    END,
    '{retired_task_reference}',
    jsonb_build_object(
      'task_id', notification_row.task_id::text,
      'retired_at', transaction_timestamp(),
      'reason', 'source_deleted'
    ),
    true
  ),
  updated_at = transaction_timestamp(),
  task_id = NULL
FROM orphaned
WHERE notification_row.id = orphaned.id;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_task_id_fkey;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_task_id_fkey
  FOREIGN KEY (task_id)
  REFERENCES public.tasks(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.notifications
  VALIDATE CONSTRAINT notifications_task_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.notifications notification_row
    LEFT JOIN public.tasks task_row
      ON task_row.id::text = notification_row.task_id::text
    WHERE notification_row.task_id IS NOT NULL
      AND task_row.id IS NULL
  ) THEN
    RAISE EXCEPTION 'notification_task_reference_retirement_postcondition_failed';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- Source: 321_retire_duplicate_t2_schedule_runtime.sql
-- ============================================================
-- Retire the duplicate T2 task/date mutation surface. T2 rhythm remains a
-- governed WBS generation input and is committed through the canonical task,
-- dependency, baseline revision and rollback chain.

BEGIN;

LOCK TABLE public.t2_rhythm_schedule_runtime_publications IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.t2_rhythm_schedule_runtime_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.task_dependencies IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  backup_sha256 TEXT := current_setting('workbuddy.t2_schedule_runtime_retirement_backup_sha256', true);
  expected_fingerprint TEXT := current_setting('workbuddy.t2_schedule_runtime_retirement_data_fingerprint', true);
  actual_fingerprint TEXT;
BEGIN
  IF backup_sha256 IS NULL OR backup_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_backup_required';
  END IF;
  IF expected_fingerprint IS NULL OR expected_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_fingerprint_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.t2_rhythm_schedule_runtime_publications
    WHERE runtime_publication_status = 'runtime_published'
  ) THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_active_publication_present';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.task_dependencies dependency
    WHERE dependency.source_type = 't2_rhythm_schedule_runtime'
      AND NOT (
        dependency.status = 'inactive'
        AND dependency.dependency_type = 'FS'
        AND dependency.required_for_start IS TRUE
        AND dependency.source_ref_id IS NULL
        AND btrim(COALESCE(dependency.metadata ->> 'edgeId', '')) <> ''
        AND btrim(COALESCE(dependency.metadata ->> 'publicationKey', '')) ~ (
          '^t2-rhythm-schedule-runtime:'
          || dependency.project_id::text
          || ':real-closeout:[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?Z$'
        )
        AND EXISTS (
          SELECT 1
          FROM public.t2_rhythm_schedule_runtime_publications publication
          WHERE publication.publication_key = dependency.metadata ->> 'publicationKey'
            AND publication.runtime_publication_status = 'runtime_rolled_back'
            AND publication.project_id = dependency.project_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.projects project
          WHERE project.id = dependency.project_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = dependency.task_id
            AND task.project_id = dependency.project_id
        )
        AND EXISTS (
          SELECT 1
          FROM public.tasks dependency_task
          WHERE dependency_task.id = dependency.dependency_task_id
            AND dependency_task.project_id = dependency.project_id
        )
      )
  ) THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_ineligible_dependency_residue_present';
  END IF;

  SELECT encode(
           digest(
             convert_to(
               jsonb_build_object(
                 't2_rhythm_schedule_runtime_publications', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.t2_rhythm_schedule_runtime_publications source_row
                 ),
                 't2_rhythm_schedule_runtime_events', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.t2_rhythm_schedule_runtime_events source_row
                 ),
                 'task_dependencies', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.task_dependencies source_row
                   WHERE source_row.source_type = 't2_rhythm_schedule_runtime'
                 )
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
  INTO actual_fingerprint;

  IF actual_fingerprint <> expected_fingerprint THEN
    RAISE EXCEPTION 't2_schedule_runtime_retirement_data_changed_after_backup';
  END IF;
END
$$;

DELETE FROM public.task_dependencies
WHERE source_type = 't2_rhythm_schedule_runtime';

DROP TABLE public.t2_rhythm_schedule_runtime_events;
DROP TABLE public.t2_rhythm_schedule_runtime_publications;

NOTIFY pgrst, 'reload schema';

COMMIT;
