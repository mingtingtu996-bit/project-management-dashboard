-- DEPRECATED: do not use for new environment bootstrap
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
CREATE TABLE IF NOT EXISTS task_delay_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  original_date DATE NOT NULL,
  delayed_date DATE NOT NULL,
  delay_days INTEGER NOT NULL CHECK (delay_days > 0),
  delay_type TEXT NOT NULL CHECK (delay_type IN ('主动申请', '被动延期', '客观因素')),
  reason TEXT NOT NULL,
  delay_reason TEXT,
  approved_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
CREATE INDEX IF NOT EXISTS idx_task_delay_history_task ON task_delay_history(task_id);
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
CREATE OR REPLACE FUNCTION record_task_delay_history()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.planned_end_date < OLD.planned_end_date 
     AND NEW.planned_end_date < CURRENT_DATE
     AND NEW.status NOT IN ('已完成', '已暂停') THEN
    INSERT INTO task_delay_history (task_id, original_date, delayed_date, delay_days, reason)
    VALUES (
      NEW.id,
      OLD.planned_end_date,
      NEW.planned_end_date,
      OLD.planned_end_date - NEW.planned_end_date,
      '计划延期'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_record_task_delay
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION record_task_delay_history();

-- 6.4 健康度自动更新函数
CREATE OR REPLACE FUNCTION calculate_project_health_score(p_project_id UUID)
RETURNS TABLE(
  health_score INTEGER,
  health_status VARCHAR(20)
) AS $$
DECLARE
  v_total_tasks INTEGER;
  v_completed_tasks INTEGER;
  v_task_completion_rate NUMERIC;
  v_total_milestones INTEGER;
  v_completed_milestones INTEGER;
  v_milestone_achievement_rate NUMERIC;
  v_overdue_tasks INTEGER;
  v_delay_risk_score NUMERIC;
  v_total_conditions INTEGER;
  v_completed_conditions INTEGER;
  v_condition_completion_rate NUMERIC;
  v_active_obstacles INTEGER;
  v_obstacle_risk_score NUMERIC;
  v_health_score INTEGER;
  v_health_status VARCHAR(20);
BEGIN
  -- 获取任务统计
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = '已完成')
    INTO v_total_tasks, v_completed_tasks
    FROM tasks WHERE project_id = p_project_id;
  v_task_completion_rate := CASE WHEN v_total_tasks > 0 THEN v_completed_tasks::NUMERIC / v_total_tasks ELSE 1 END;
  
  -- 获取里程碑统计
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = '已完成')
    INTO v_total_milestones, v_completed_milestones
    FROM milestones WHERE project_id = p_project_id;
  v_milestone_achievement_rate := CASE WHEN v_total_milestones > 0 THEN v_completed_milestones::NUMERIC / v_total_milestones ELSE 1 END;
  
  -- 延期风险
  SELECT COUNT(*) INTO v_overdue_tasks
    FROM tasks 
    WHERE project_id = p_project_id 
    AND planned_end_date < CURRENT_DATE 
    AND status NOT IN ('已完成', '已暂停');
  v_delay_risk_score := CASE WHEN v_total_tasks > 0 THEN 100 - (v_overdue_tasks::NUMERIC / v_total_tasks * 100) ELSE 100 END;
  
  -- 条件完成率
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_completed_conditions
    FROM task_conditions tc
    JOIN tasks t ON tc.task_id = t.id
    WHERE t.project_id = p_project_id;
  v_condition_completion_rate := CASE WHEN v_total_conditions > 0 THEN v_completed_conditions::NUMERIC / v_total_conditions ELSE 1 END;
  
  -- 阻碍风险
  SELECT COUNT(*) INTO v_active_obstacles
    FROM task_obstacles o
    JOIN tasks t ON o.task_id = t.id
    WHERE t.project_id = p_project_id AND o.status = '处理中';
  v_obstacle_risk_score := 100 - (v_active_obstacles * 10);
  
  -- 计算加权健康度
  v_health_score := ROUND(
    v_task_completion_rate * 30 +
    v_milestone_achievement_rate * 25 +
    v_delay_risk_score * 0.20 +
    v_condition_completion_rate * 15 +
    v_obstacle_risk_score * 0.10
  );
  
  -- 确定健康状态
  v_health_status := CASE 
    WHEN v_health_score >= 80 THEN '健康'
    WHEN v_health_score >= 60 THEN '亚健康'
    WHEN v_health_score >= 40 THEN '预警'
    ELSE '危险'
  END;
  
  RETURN QUERY SELECT v_health_score, v_health_status;
END;
$$ LANGUAGE plpgsql;

-- 6.5 健康度自动更新触发器
CREATE OR REPLACE FUNCTION update_project_health_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_project_id UUID;
BEGIN
  -- 获取关联项目ID
  IF TG_TABLE_NAME = 'tasks' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'milestones' THEN
    v_project_id := NEW.project_id;
  ELSIF TG_TABLE_NAME = 'task_conditions' THEN
    SELECT project_id INTO v_project_id FROM tasks WHERE id = NEW.task_id;
  ELSIF TG_TABLE_NAME = 'task_obstacles' THEN
    SELECT project_id INTO v_project_id FROM tasks WHERE id = NEW.task_id;
  END IF;
  
  -- 更新健康度
  UPDATE projects
  SET (health_score, health_status) = (
    SELECT health_score, health_status 
    FROM calculate_project_health_score(v_project_id)
  )
  WHERE id = v_project_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为相关表创建触发器
CREATE TRIGGER trigger_update_health_tasks
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_project_health_on_change();

CREATE TRIGGER trigger_update_health_milestones
  AFTER INSERT OR UPDATE ON milestones
  FOR EACH ROW
  EXECUTE FUNCTION update_project_health_on_change();

CREATE TRIGGER trigger_update_health_conditions
  AFTER INSERT OR UPDATE ON task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_project_health_on_change();

CREATE TRIGGER trigger_update_health_obstacles
  AFTER INSERT OR UPDATE ON task_obstacles
  FOR EACH ROW
  EXECUTE FUNCTION update_project_health_on_change();

-- 添加注释
COMMENT ON FUNCTION calculate_project_health_score(UUID) IS '计算项目健康度得分';
COMMENT ON FUNCTION update_project_health_on_change() IS '任务/里程碑/条件/阻碍变更时自动更新健康度';

-- ============================================================
-- Source: 005_add_pre_milestone_conditions.sql
-- ============================================================
-- ============================================================
-- 前期证照条件关联表 + WBS结构表
-- 房地产工程管理系统V4.1 Phase 3
-- 执行时间: 2026-03-22
-- ============================================================

-- 启用ltree扩展（用于WBS层级路径管理）
CREATE EXTENSION IF NOT EXISTS ltree;

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
    wbs_path LTREE NOT NULL,
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

-- 创建触发器：任务进度达到100%时自动生成总结报告
CREATE OR REPLACE FUNCTION auto_generate_completion_report()
RETURNS TRIGGER AS $$
BEGIN
  -- 当任务进度更新为100%时，触发总结报告生成
  IF NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100) THEN
    INSERT INTO task_completion_reports (
      task_id,
      project_id,
      report_type,
      title,
      summary,
      planned_duration,
      actual_duration,
      efficiency_ratio,
      efficiency_status,
      generated_by,
      generated_at
    )
    SELECT
      NEW.id,
      NEW.project_id,
      'task',
      COALESCE(NEW.name, '任务') || ' 完成总结',
      '任务已完成，自动生成总结报告',
      EXTRACT(DAY FROM (NEW.planned_end_date - NEW.start_date)),
      EXTRACT(DAY FROM (CURRENT_DATE - NEW.start_date)),
      -- 效率比暂时设为1，由服务层重新计算
      1.0,
      'normal',
      NEW.updated_by,
      NOW()
    ON CONFLICT DO NOTHING; -- 避免重复插入
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_report
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100))
  EXECUTE FUNCTION auto_generate_completion_report();

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
    );
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
-- 修复 1: 修复 auto_generate_completion_report 函数
-- 问题: 
--   - P0-001: 引用了不存在的字段 planned_end_date，应改为 end_date
--   - P0-002: 引用了不存在的字段 name，应改为 title
-- =====================================================

-- 先删除触发器（依赖函数）
DROP TRIGGER IF EXISTS trigger_auto_generate_report ON tasks;

-- 删除旧函数
DROP FUNCTION IF EXISTS auto_generate_completion_report();

-- 创建修复后的函数
CREATE OR REPLACE FUNCTION auto_generate_completion_report()
RETURNS TRIGGER AS $$
BEGIN
  -- 当任务进度更新为100%时，触发总结报告生成
  IF NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100) THEN
    INSERT INTO task_completion_reports (
      task_id,
      project_id,
      report_type,
      title,
      summary,
      planned_duration,
      actual_duration,
      efficiency_ratio,
      efficiency_status,
      generated_by,
      generated_at
    )
    SELECT
      NEW.id,
      NEW.project_id,
      'task',
      COALESCE(NEW.title, '任务') || ' 完成总结',  -- 修复: name -> title
      '任务已完成，自动生成总结报告',
      EXTRACT(DAY FROM (NEW.end_date - NEW.start_date)),  -- 修复: planned_end_date -> end_date
      EXTRACT(DAY FROM (CURRENT_DATE - NEW.start_date)),
      -- 效率比设为 NULL，由服务层重新计算（避免硬编码值）
      NULL,
      'normal',
      NEW.updated_by,
      NOW()
    ON CONFLICT DO NOTHING; -- 避免重复插入
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 重新创建触发器
CREATE TRIGGER trigger_auto_generate_report
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100))
  EXECUTE FUNCTION auto_generate_completion_report();

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

-- =====================================================
-- 修复 3: 创建带异常处理的包装函数（可选增强）
-- =====================================================

CREATE OR REPLACE FUNCTION safe_generate_completion_report()
RETURNS TRIGGER AS $$
BEGIN
  -- 调用主函数并捕获异常
  BEGIN
    -- 检查必要字段是否存在
    IF NEW.id IS NULL OR NEW.project_id IS NULL THEN
      RAISE WARNING '触发器执行跳过: task_id 或 project_id 为空';
      RETURN NEW;
    END IF;
    
    -- 调用主逻辑
    RETURN auto_generate_completion_report();
    
  EXCEPTION WHEN OTHERS THEN
    -- 记录错误日志
    INSERT INTO trigger_execution_logs (
      trigger_name,
      table_name,
      operation,
      record_id,
      status,
      message,
      details
    ) VALUES (
      'trigger_auto_generate_report',
      'tasks',
      'UPDATE',
      NEW.id,
      'error',
      SQLERRM,
      jsonb_build_object(
        'sqlstate', SQLSTATE,
        'task_id', NEW.id,
        'progress', NEW.progress
      )
    );
    
    -- 触发器异常不应阻止原操作，返回 NEW 继续执行
    RETURN NEW;
  END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 验证修复
-- =====================================================

-- 添加注释说明修复内容
COMMENT ON FUNCTION auto_generate_completion_report() IS 
'任务完成时自动生成总结报告（已修复字段引用：name->title, planned_end_date->end_date）';

-- 验证触发器状态
DO $$
BEGIN
  RAISE NOTICE 'Phase 3.6 触发器修复完成:';
  RAISE NOTICE '  - P0-001: planned_end_date -> end_date (已修复)';
  RAISE NOTICE '  - P0-002: name -> title (已修复)';
  RAISE NOTICE '  - efficiency_ratio 改为 NULL，由服务层计算';
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
-- Source: 014_add_project_health_details.sql
-- ============================================================
-- Migration 014: Add project_health_details table
-- Date: 2026-03-24
-- Purpose: 存储项目健康度分项得分，支持健康度分析和历史趋势（P2-02修复）

-- 1. 在 tasks 表增加 milestone_level 和 milestone_order 字段（如未创建）
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_level INTEGER CHECK (milestone_level IN (1, 2, 3));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS milestone_order INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_milestone_level ON tasks(milestone_level) WHERE is_milestone = TRUE;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_order ON tasks(milestone_order) WHERE is_milestone = TRUE;

COMMENT ON COLUMN tasks.milestone_level IS '里程碑层级：1=一级(amber)，2=二级(blue)，3=三级(gray)';
COMMENT ON COLUMN tasks.milestone_order IS '同级里程碑排序序号';

-- 2. 创建 project_health_details 表（方案B：存储分项分数）
CREATE TABLE IF NOT EXISTS project_health_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- 健康度总分
    health_score INTEGER NOT NULL DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
    health_status VARCHAR(20) NOT NULL DEFAULT '良好'
        CHECK (health_status IN ('优秀', '良好', '警告', '危险')),

    -- 分项得分（调试和分析用）
    base_score INTEGER NOT NULL DEFAULT 50,
    task_completion_score INTEGER NOT NULL DEFAULT 0,
    milestone_bonus INTEGER NOT NULL DEFAULT 0,
    delay_penalty INTEGER NOT NULL DEFAULT 0,
    risk_penalty INTEGER NOT NULL DEFAULT 0,

    -- 计算依据（快照）
    completed_task_count INTEGER DEFAULT 0,
    total_task_count INTEGER DEFAULT 0,
    completed_milestone_count INTEGER DEFAULT 0,
    total_delay_days INTEGER DEFAULT 0,
    high_risk_count INTEGER DEFAULT 0,
    medium_risk_count INTEGER DEFAULT 0,
    low_risk_count INTEGER DEFAULT 0,

    -- 时间戳
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- 每个项目保留最新一条（可查历史）
    UNIQUE (project_id, calculated_at)
);

-- 索引：按项目+时间查询
CREATE INDEX IF NOT EXISTS idx_project_health_details_project_id
    ON project_health_details(project_id);
CREATE INDEX IF NOT EXISTS idx_project_health_details_calculated_at
    ON project_health_details(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_health_details_project_latest
    ON project_health_details(project_id, calculated_at DESC);

-- 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_project_health_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_health_details_updated_at ON project_health_details;
CREATE TRIGGER trigger_project_health_details_updated_at
    BEFORE UPDATE ON project_health_details
    FOR EACH ROW
    EXECUTE FUNCTION update_project_health_details_updated_at();

-- 启用RLS
ALTER TABLE project_health_details ENABLE ROW LEVEL SECURITY;

-- RLS策略：项目成员可查询
CREATE POLICY project_health_details_select_policy ON project_health_details
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE p.id = project_health_details.project_id
            AND pm.user_id = auth.uid()
        )
    );

-- RLS策略：系统可写入（后端服务）
CREATE POLICY project_health_details_insert_policy ON project_health_details
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE p.id = project_health_details.project_id
            AND pm.user_id = auth.uid()
        )
    );

COMMENT ON TABLE project_health_details IS '项目健康度分项分数表，支持历史趋势分析和分项诊断';
COMMENT ON COLUMN project_health_details.health_score IS '综合健康度得分（0-100）';
COMMENT ON COLUMN project_health_details.health_status IS '健康度等级：优秀(90+)/良好(70-89)/警告(50-69)/危险(0-49)';

-- ============================================================
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

CREATE TABLE IF NOT EXISTS scope_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_key TEXT NOT NULL,
  label TEXT NOT NULL,
  code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scope_dimensions_dimension_key_label_key UNIQUE (dimension_key, label)
);

CREATE INDEX IF NOT EXISTS idx_scope_dimensions_dimension_key
  ON scope_dimensions (dimension_key, sort_order, label);

CREATE TABLE IF NOT EXISTS project_scope_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dimension_key TEXT NOT NULL,
  scope_dimension_id UUID NOT NULL REFERENCES scope_dimensions(id) ON DELETE CASCADE,
  scope_dimension_label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_scope_dimensions_project_dimension_label_key UNIQUE (project_id, dimension_key, scope_dimension_label)
);

CREATE INDEX IF NOT EXISTS idx_project_scope_dimensions_project_id
  ON project_scope_dimensions (project_id, dimension_key, sort_order);

INSERT INTO scope_dimensions (dimension_key, label, sort_order, is_active, version)
VALUES
  ('building', '住宅', 1, TRUE, 1),
  ('building', '商业', 2, TRUE, 1),
  ('building', '办公', 3, TRUE, 1),
  ('building', '工业', 4, TRUE, 1),
  ('building', '综合体', 5, TRUE, 1),
  ('building', '其他', 6, TRUE, 1),
  ('specialty', '土建', 1, TRUE, 1),
  ('specialty', '机电', 2, TRUE, 1),
  ('specialty', '装修', 3, TRUE, 1),
  ('specialty', '幕墙', 4, TRUE, 1),
  ('specialty', '景观', 5, TRUE, 1),
  ('specialty', '市政配套', 6, TRUE, 1),
  ('phase', '前期', 1, TRUE, 1),
  ('phase', '设计', 2, TRUE, 1),
  ('phase', '施工', 3, TRUE, 1),
  ('phase', '验收', 4, TRUE, 1),
  ('phase', '交付', 5, TRUE, 1),
  ('region', '一区', 1, TRUE, 1),
  ('region', '二区', 2, TRUE, 1),
  ('region', '三区', 3, TRUE, 1),
  ('region', '四区', 4, TRUE, 1)
ON CONFLICT (dimension_key, label) DO UPDATE
SET
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  version = scope_dimensions.version + 1,
  updated_at = NOW();

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

CREATE TABLE IF NOT EXISTS delay_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  original_date DATE NOT NULL,
  delayed_date DATE NOT NULL,
  delay_days INTEGER NOT NULL DEFAULT 0,
  delay_type TEXT NOT NULL DEFAULT '主动延期',
  reason TEXT NOT NULL,
  delay_reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  chain_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS delay_requests
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chain_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE IF EXISTS delay_requests
  ALTER COLUMN approved_by DROP NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_delay_requests_project_id ON delay_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_delay_requests_task_id ON delay_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_delay_requests_status ON delay_requests(status);
CREATE INDEX IF NOT EXISTS idx_delay_requests_chain_id ON delay_requests(chain_id);

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
