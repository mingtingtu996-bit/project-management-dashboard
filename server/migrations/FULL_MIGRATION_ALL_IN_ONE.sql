-- ============================================================
-- FULL_MIGRATION_ALL_IN_ONE.sql
-- 房地产工程管理系统 V4.1  完整数据库迁移（合并版）
-- 合并自: 001~017 全部迁移文件
-- 已跳过: 007_enable_rls_policies.sql（依赖 auth.uid()，无登录系统不适用）
-- 使用方法: 粘贴到 Supabase SQL Editor 点击 Run 即可
-- ============================================================


-- ============================================================
-- 来自: 001_initial_schema.sql
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
-- 来自: 002_add_phase1_tables.sql
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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 无登录系统允许NULL
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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 无登录系统允许NULL
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
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 允许NULL（系统自动记录时无审批人）
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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 无登录系统允许NULL
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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 无登录系统允许NULL（012也有修复）
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT template_name_unique UNIQUE (template_name, template_type)
);

-- 6. pre_milestones（前期证照表）
CREATE TABLE IF NOT EXISTS pre_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('土地证', '规划证', '施工证', '预售证', '产权证', '其他')),
  milestone_name TEXT NOT NULL,
  application_date DATE,
  issue_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT '待申请' CHECK (status IN ('待申请', '办理中', '已取得', '已过期', '需延期')),
  document_no TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- 无登录系统允许NULL
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
-- 来自: 003_add_task_locks_and_logs.sql
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
-- 来自: 004_add_dashboard_view.sql
-- ============================================================
-- ============================================================
-- Dashboard 物化视图
-- 房地产工程管理系统V4.1 Phase 1
-- 执行时间: 2026-03-22
-- ============================================================

-- 创建物化视图：项目Dashboard统计
-- [跳过MV] CREATE MATERIALIZED VIEW IF NOT EXISTS mv_project_dashboard AS
-- [跳过MV] SELECT 
-- [跳过MV]     p.id AS project_id,
-- [跳过MV]     p.name AS project_name,
-- [跳过MV]     p.status AS project_status,
-- [跳过MV]     p.health_score,
-- [跳过MV]     p.health_status,
-- [跳过MV]     p.start_date,
-- [跳过MV]     p.end_date AS project_end_date,
-- [跳过MV]     p.budget,
-- [跳过MV]     p.location,
    
-- [跳过MV]     -- 任务统计
-- [跳过MV]     (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
-- [跳过MV]     (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '已完成') AS completed_tasks,
-- [跳过MV]     (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '进行中') AS ongoing_tasks,
-- [跳过MV]     (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = '未开始') AS pending_tasks,
    
-- [跳过MV]     -- 里程碑统计
-- [跳过MV]     (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id) AS total_milestones,
-- [跳过MV]     (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.status = '已完成') AS completed_milestones,
-- [跳过MV]     (SELECT COUNT(*) FROM milestones m WHERE m.project_id = p.id AND m.status = '已延期') AS delayed_milestones,
    
-- [跳过MV]     -- 延期任务统计
-- [跳过MV]     (SELECT COUNT(*) FROM tasks t 
-- [跳过MV]      WHERE t.project_id = p.id 
-- [跳过MV]      AND t.planned_end_date < CURRENT_DATE 
-- [跳过MV]      AND t.status NOT IN ('已完成', '已暂停')) AS overdue_tasks,
    
-- [跳过MV]     -- 条件统计
-- [跳过MV]     (SELECT COUNT(*) FROM task_conditions tc 
-- [跳过MV]      JOIN tasks t ON tc.task_id = t.id 
-- [跳过MV]      WHERE t.project_id = p.id) AS total_conditions,
-- [跳过MV]     (SELECT COUNT(*) FROM task_conditions tc 
-- [跳过MV]      JOIN tasks t ON tc.task_id = t.id 
-- [跳过MV]      WHERE t.project_id = p.id AND tc.status = '已满足') AS satisfied_conditions,
-- [跳过MV]     (SELECT COUNT(*) FROM task_conditions tc 
-- [跳过MV]      JOIN tasks t ON tc.task_id = t.id 
-- [跳过MV]      WHERE t.project_id = p.id AND tc.status = '未满足') AS unsatisfied_conditions,
    
-- [跳过MV]     -- 阻碍统计
-- [跳过MV]     (SELECT COUNT(*) FROM task_obstacles ob 
-- [跳过MV]      JOIN tasks t ON ob.task_id = t.id 
-- [跳过MV]      WHERE t.project_id = p.id) AS total_obstacles,
-- [跳过MV]     (SELECT COUNT(*) FROM task_obstacles ob 
-- [跳过MV]      JOIN tasks t ON ob.task_id = t.id 
-- [跳过MV]      WHERE t.project_id = p.id AND ob.status = '待处理') AS pending_obstacles,
-- [跳过MV]     (SELECT COUNT(*) FROM task_obstacles ob 
-- [跳过MV]      JOIN tasks t ON ob.task_id = t.id 
-- [跳过MV]      WHERE t.project_id = p.id AND ob.status = '处理中') AS processing_obstacles,
    
-- [跳过MV]     -- 验收统计
-- [跳过MV]     (SELECT COUNT(*) FROM acceptance_plans ap 
-- [跳过MV]      WHERE ap.project_id = p.id) AS total_acceptance_plans,
-- [跳过MV]     (SELECT COUNT(*) FROM acceptance_plans ap 
-- [跳过MV]      WHERE ap.project_id = p.id AND ap.status = '已通过') AS passed_acceptance_plans,
-- [跳过MV]     (SELECT COUNT(*) FROM acceptance_plans ap 
-- [跳过MV]      WHERE ap.project_id = p.id AND ap.status = '待验收') AS pending_acceptance_plans,
    
-- [跳过MV]     -- 证照统计
-- [跳过MV]     (SELECT COUNT(*) FROM pre_milestones pm 
-- [跳过MV]      WHERE pm.project_id = p.id) AS total_pre_milestones,
-- [跳过MV]     (SELECT COUNT(*) FROM pre_milestones pm 
-- [跳过MV]      WHERE pm.project_id = p.id AND pm.status = '已取得') AS obtained_pre_milestones,
-- [跳过MV]     (SELECT COUNT(*) FROM pre_milestones pm 
-- [跳过MV]      WHERE pm.project_id = p.id AND pm.status IN ('办理中', '需延期')) AS processing_pre_milestones,
    
-- [跳过MV]     -- 更新时间
-- [跳过MV]     NOW() AS last_refreshed
-- [跳过MV] FROM projects p;

-- [跳过] 物化视图索引（视图已被注释，跳过此索引）
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_project_dashboard_project_id 
-- ON mv_project_dashboard(project_id);

-- [跳过] COMMENT ON MATERIALIZED VIEW mv_project_dashboard IS '项目Dashboard物化视图';

-- 6. 创建更多触发器（Phase 1 补充）

-- 6.1 任务完成时自动闭合关联条件
CREATE OR REPLACE FUNCTION auto_complete_conditions()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = '已完成' AND OLD.status != '已完成' THEN
    UPDATE task_conditions
    SET is_satisfied = TRUE, confirmed_at = NOW()
    WHERE task_id = NEW.id AND is_satisfied = FALSE;
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
  IF NEW.end_date > OLD.end_date 
     AND OLD.end_date < CURRENT_DATE
     AND NEW.status NOT IN ('已完成', '已暂停') THEN
    INSERT INTO task_delay_history (task_id, original_date, delayed_date, delay_days, delay_type, reason, approved_by)
    VALUES (
      NEW.id,
      OLD.end_date,
      NEW.end_date,
      NEW.end_date - OLD.end_date,
      '被动延期',
      '计划延期',
      NEW.updated_by
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
-- 来自: 005_add_pre_milestone_conditions.sql
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
-- 来自: 006_add_task_completion_reports.sql
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
  snapshot_date DATE NOT NULL,
  is_auto_generated BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 唯一约束：同一任务每天最多一条自动生成的快照
  CONSTRAINT daily_snapshot UNIQUE (task_id, snapshot_date, is_auto_generated)
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
    INSERT INTO task_progress_snapshots (task_id, progress, snapshot_date, notes)
    VALUES (
      NEW.id,
      NEW.progress,
      CURRENT_DATE,
      '进度更新: ' || NEW.progress || '%'
    )
    ON CONFLICT (task_id, snapshot_date, is_auto_generated) 
    DO UPDATE SET 
      progress = NEW.progress,
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

-- [跳过] 007_enable_rls_policies.sql (RLS auth.uid() 依赖)


-- ============================================================
-- 来自: 008_fix_phase36_triggers.sql
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
-- 来自: 009_add_job_execution_logs.sql
-- ============================================================
-- 扩展任务执行日志表（在003中已创建基础版，这里补充额外字段）

-- 补充003中缺少的字段（使用ADD COLUMN IF NOT EXISTS避免冲突）
ALTER TABLE job_execution_logs 
  ADD COLUMN IF NOT EXISTS result JSONB,
  ADD COLUMN IF NOT EXISTS job_id TEXT,
  ADD COLUMN IF NOT EXISTS triggered_by TEXT CHECK (triggered_by IN ('scheduler', 'manual', 'api'));

-- 补充索引（009版本索引，IF NOT EXISTS避免冲突）
CREATE INDEX IF NOT EXISTS idx_job_execution_logs_job_name ON job_execution_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_job_execution_logs_status ON job_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_job_execution_logs_started_at ON job_execution_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_execution_logs_job_id ON job_execution_logs(job_id);

-- 添加注释
COMMENT ON TABLE job_execution_logs IS '定时任务执行日志表，记录所有定时任务的执行历史';
COMMENT ON COLUMN job_execution_logs.job_name IS '任务名称（如: riskStatisticsJob, autoAlertService.daily）';
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
-- 来自: 009_fix_delivery_issues.sql
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
-- 当 pre_milestone_conditions 全部满足时，自动将 pre_milestone 状态改为"已取得"
-- ============================================================

CREATE OR REPLACE FUNCTION fn_update_pre_milestone_status()
RETURNS TRIGGER AS $$
DECLARE
    v_pre_milestone_id UUID;
    v_total_conditions INTEGER;
    v_satisfied_conditions INTEGER;
    v_current_status TEXT;
BEGIN
    -- 确定受影响的 pre_milestone_id
    IF TG_OP = 'DELETE' THEN
        v_pre_milestone_id := OLD.pre_milestone_id;
    ELSE
        v_pre_milestone_id := NEW.pre_milestone_id;
    END IF;

    -- 查询当前证照状态
    SELECT status INTO v_current_status
    FROM pre_milestones
    WHERE id = v_pre_milestone_id;

    -- 已取得 / 已过期 状态不做自动变更
    IF v_current_status IN ('已取得', '已过期') THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- 统计条件总数和已满足数量
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE status IN ('已满足', '已确认'))
    INTO v_total_conditions, v_satisfied_conditions
    FROM pre_milestone_conditions
    WHERE pre_milestone_id = v_pre_milestone_id;

    -- 全部条件满足 → 状态更新为"已取得"
    IF v_total_conditions > 0 AND v_total_conditions = v_satisfied_conditions THEN
        UPDATE pre_milestones
        SET status = '已取得',
            issue_date = COALESCE(issue_date, CURRENT_DATE),
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status NOT IN ('已取得', '已过期');

    -- 存在未满足条件且当前为"待申请" → 更新为"办理中"
    ELSIF v_satisfied_conditions > 0 AND v_current_status = '待申请' THEN
        UPDATE pre_milestones
        SET status = '办理中',
            updated_at = NOW()
        WHERE id = v_pre_milestone_id
          AND status = '待申请';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 绑定到 pre_milestone_conditions 表
CREATE TRIGGER trg_pre_milestone_status_update
    AFTER INSERT OR UPDATE OR DELETE ON pre_milestone_conditions
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_pre_milestone_status();

-- ============================================================
-- 验证注释
-- ============================================================
-- 执行后预期结果：
--   SELECT COUNT(*) FROM task_milestones;  → 0（空表正常）
--   \d task_milestones                     → 字段结构完整
--   SELECT tgname FROM pg_trigger WHERE tgname = 'trg_pre_milestone_status_update';
--   → 返回 1 行
-- ============================================================


-- ============================================================
-- 来自: 010_add_missing_tables.sql
-- ============================================================
-- Migration 010: Add missing tables and fields from design review
-- Date: 2026-03-23

-- 1. Add predecessor_ids field to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS predecessor_ids JSONB;
CREATE INDEX IF NOT EXISTS idx_tasks_predecessor_ids_gin ON tasks USING GIN(predecessor_ids);

-- 2. Create task_progress_history table
CREATE TABLE IF NOT EXISTS task_progress_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    progress INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_progress_history_task_id ON task_progress_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_history_created_at ON task_progress_history(created_at);
CREATE INDEX IF NOT EXISTS idx_task_progress_history_task_created_by ON task_progress_history(task_id, created_by);

-- 3. Create acceptance_records table
CREATE TABLE IF NOT EXISTS acceptance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acceptance_plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
    record_date DATE NOT NULL,
    acceptance_result VARCHAR(50) NOT NULL,
    score INTEGER,
    findings TEXT,
    issues JSONB,
    attachments JSONB,
    attendees JSONB,
    next_action TEXT,
    next_action_date DATE,
    remarks TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_acceptance_records_acceptance_plan_id ON acceptance_records(acceptance_plan_id);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_record_date ON acceptance_records(record_date);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_acceptance_result ON acceptance_records(acceptance_result);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_attachments_gin ON acceptance_records USING GIN(attachments);
CREATE INDEX IF NOT EXISTS idx_acceptance_records_attendees_gin ON acceptance_records USING GIN(attendees);

-- 4. Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    setting_type VARCHAR(50) DEFAULT 'string',
    category VARCHAR(50) NOT NULL,
    description TEXT,
    is_editable BOOLEAN DEFAULT TRUE,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX IF NOT EXISTS idx_system_settings_value_gin ON system_settings USING GIN(setting_value);

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description, is_system) VALUES
('risk.alert.thresholds', '{"critical": 7, "high": 14, "medium": 7}', 'json', 'risk_alert', '风险预警阈值配置', TRUE),
('risk.consecutive.lag.weeks', '{"high": 2, "medium": 1}', 'json', 'risk_alert', '连续滞后周数阈值', TRUE),
('obstacle.timeout.days', '{"warning": 3, "critical": 7, "severe": 14}', 'json', 'risk_alert', '阻碍超时天数阈值', TRUE),
('dialog.frequency.defaults', '{"daily_max": 3, "cooldown_minutes": 60}', 'json', 'dialog_frequency', '弹窗频率默认配置', TRUE),
('ai.duration.confidence.min', '{"value": 0.6}', 'json', 'ai', 'AI工期预测最小置信度', TRUE)
ON CONFLICT (setting_key) DO NOTHING;

-- 5. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    target_type VARCHAR(50),
    target_id UUID,
    priority VARCHAR(20) DEFAULT 'normal',
    channel VARCHAR(50) DEFAULT 'in_app',
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON notifications(notification_type);

-- Enable RLS on new tables
ALTER TABLE task_progress_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE acceptance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for task_progress_history
DROP POLICY IF EXISTS "task_progress_history_select_policy" ON task_progress_history;
CREATE POLICY "task_progress_history_select_policy" ON task_progress_history FOR SELECT
    USING (EXISTS (SELECT 1 FROM tasks t WHERE t.id = task_progress_history.task_id AND t.deleted_at IS NULL));

DROP POLICY IF EXISTS "task_progress_history_insert_policy" ON task_progress_history;
CREATE POLICY "task_progress_history_insert_policy" ON task_progress_history FOR INSERT
    WITH CHECK (TRUE);  -- 无登录系统，允许所有插入

DROP POLICY IF EXISTS "task_progress_history_update_policy" ON task_progress_history;
CREATE POLICY "task_progress_history_update_policy" ON task_progress_history FOR UPDATE
    USING (TRUE);  -- 无登录系统，允许所有更新

-- RLS Policies for acceptance_records
DROP POLICY IF EXISTS "acceptance_records_select_policy" ON acceptance_records;
CREATE POLICY "acceptance_records_select_policy" ON acceptance_records FOR SELECT
    USING (EXISTS (SELECT 1 FROM acceptance_plans ap WHERE ap.id = acceptance_records.acceptance_plan_id AND ap.deleted_at IS NULL));

DROP POLICY IF EXISTS "acceptance_records_insert_policy" ON acceptance_records;
CREATE POLICY "acceptance_records_insert_policy" ON acceptance_records FOR INSERT
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "acceptance_records_update_policy" ON acceptance_records;
CREATE POLICY "acceptance_records_update_policy" ON acceptance_records FOR UPDATE
    USING (TRUE);

-- RLS Policies for system_settings (read-only for regular users)
DROP POLICY IF EXISTS "system_settings_select_policy" ON system_settings;
CREATE POLICY "system_settings_select_policy" ON system_settings FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "system_settings_insert_policy" ON system_settings;
CREATE POLICY "system_settings_insert_policy" ON system_settings FOR INSERT
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "system_settings_update_policy" ON system_settings;
CREATE POLICY "system_settings_update_policy" ON system_settings FOR UPDATE
    USING (TRUE);

-- RLS Policies for notifications
DROP POLICY IF EXISTS "notifications_select_policy" ON notifications;
CREATE POLICY "notifications_select_policy" ON notifications FOR SELECT
    USING (TRUE);  -- 无登录系统，所有通知可见

DROP POLICY IF EXISTS "notifications_insert_policy" ON notifications;
CREATE POLICY "notifications_insert_policy" ON notifications FOR INSERT
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "notifications_update_policy" ON notifications;
CREATE POLICY "notifications_update_policy" ON notifications FOR UPDATE
    USING (TRUE);


-- ============================================================
-- 来自: 011_add_missing_tables_phase2.sql
-- ============================================================
-- Migration 011: Add missing tables phase 2 (phases, wbs_template_nodes, dialog_frequency)
-- Date: 2026-03-23

-- 1. Create phases table (分期表)
CREATE TABLE IF NOT EXISTS phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_name VARCHAR(255) NOT NULL,
    phase_code VARCHAR(100),
    phase_sequence INTEGER NOT NULL DEFAULT 0,
    start_date DATE,
    end_date DATE,
    phase_status VARCHAR(50) DEFAULT 'planning',
    area_size DECIMAL(15, 2),
    building_count INTEGER,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_phases_project_id ON phases(project_id);
CREATE INDEX IF NOT EXISTS idx_phases_phase_sequence ON phases(phase_sequence);
CREATE INDEX IF NOT EXISTS idx_phases_phase_status ON phases(phase_status);

-- 2. Create wbs_template_nodes table (WBS模板节点表)
CREATE TABLE IF NOT EXISTS wbs_template_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES wbs_templates(id) ON DELETE CASCADE,
    parent_node_id UUID REFERENCES wbs_template_nodes(id) ON DELETE CASCADE,
    wbs_level VARCHAR(50) NOT NULL,
    wbs_code VARCHAR(100),
    node_name VARCHAR(255) NOT NULL,
    node_description TEXT,
    sequence INTEGER NOT NULL DEFAULT 0,
    standard_duration INTEGER,
    estimated_cost DECIMAL(15, 2),
    required_resources JSONB,
    dependencies JSONB,
    is_milestone BOOLEAN DEFAULT FALSE,
    acceptance_plan JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_template_id ON wbs_template_nodes(template_id);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_parent_node_id ON wbs_template_nodes(parent_node_id);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_sequence ON wbs_template_nodes(sequence);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_required_resources_gin ON wbs_template_nodes USING GIN(required_resources);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_dependencies_gin ON wbs_template_nodes USING GIN(dependencies);
CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_acceptance_plan_gin ON wbs_template_nodes USING GIN(acceptance_plan);

-- 3. Create dialog_frequency_control table (弹窗频率控制表)
CREATE TABLE IF NOT EXISTS dialog_frequency_control (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dialog_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(100),
    trigger_count INTEGER DEFAULT 1,
    last_triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    first_triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_suppressed BOOLEAN DEFAULT FALSE,
    suppress_until TIMESTAMP WITH TIME ZONE,
    suppress_reason VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dialog_frequency_user_type ON dialog_frequency_control(user_id, dialog_type);
CREATE INDEX IF NOT EXISTS idx_dialog_frequency_target ON dialog_frequency_control(target_id, dialog_type);
CREATE INDEX IF NOT EXISTS idx_dialog_frequency_suppress ON dialog_frequency_control(suppress_until) WHERE is_suppressed = TRUE;

-- 4. Create dialog_frequency_settings table (弹窗频率配置表)
CREATE TABLE IF NOT EXISTS dialog_frequency_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dialog_type VARCHAR(50) NOT NULL UNIQUE,
    enable_first_progress_skip BOOLEAN DEFAULT TRUE,
    first_progress_cool_minutes INTEGER DEFAULT 30,
    daily_max_trigger INTEGER DEFAULT 3,
    cooldown_minutes INTEGER DEFAULT 60,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default configuration data
INSERT INTO dialog_frequency_settings (dialog_type, enable_first_progress_skip, first_progress_cool_minutes, daily_max_trigger, cooldown_minutes, is_enabled) VALUES
('progress_condition', TRUE, 30, 5, 30, TRUE),
('obstacle_warning', FALSE, 0, 1, 1440, TRUE),
('risk_alert', FALSE, 0, 1, 10080, TRUE),
('delay_warning', FALSE, 0, 2, 4320, TRUE)
ON CONFLICT (dialog_type) DO NOTHING;

-- Enable RLS on new tables
ALTER TABLE phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE wbs_template_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialog_frequency_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE dialog_frequency_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for phases
DROP POLICY IF EXISTS "phases_select_policy" ON phases;
CREATE POLICY "phases_select_policy" ON phases FOR SELECT
    USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = phases.project_id AND p.deleted_at IS NULL));

DROP POLICY IF EXISTS "phases_insert_policy" ON phases;
CREATE POLICY "phases_insert_policy" ON phases FOR INSERT
-- [跳过 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "phases_update_policy" ON phases;
CREATE POLICY "phases_update_policy" ON phases FOR UPDATE
-- [跳过 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for wbs_template_nodes
DROP POLICY IF EXISTS "wbs_template_nodes_select_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_select_policy" ON wbs_template_nodes FOR SELECT
    USING (EXISTS (SELECT 1 FROM wbs_templates wt WHERE wt.id = wbs_template_nodes.template_id AND wt.deleted_at IS NULL));

DROP POLICY IF EXISTS "wbs_template_nodes_insert_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_insert_policy" ON wbs_template_nodes FOR INSERT
-- [跳过 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "wbs_template_nodes_update_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_update_policy" ON wbs_template_nodes FOR UPDATE
-- [跳过 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for dialog_frequency_control
DROP POLICY IF EXISTS "dialog_frequency_control_select_policy" ON dialog_frequency_control;
CREATE POLICY "dialog_frequency_control_select_policy" ON dialog_frequency_control FOR SELECT
-- [跳过 auth.uid()]     USING (user_id::text = auth.uid()::text OR user_id IS NULL);

DROP POLICY IF EXISTS "dialog_frequency_control_insert_policy" ON dialog_frequency_control;
CREATE POLICY "dialog_frequency_control_insert_policy" ON dialog_frequency_control FOR INSERT
-- [跳过 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "dialog_frequency_control_update_policy" ON dialog_frequency_control;
CREATE POLICY "dialog_frequency_control_update_policy" ON dialog_frequency_control FOR UPDATE
-- [跳过 auth.uid()]     USING (auth.uid() IS NOT NULL);

-- RLS Policies for dialog_frequency_settings (read-only for regular users)
DROP POLICY IF EXISTS "dialog_frequency_settings_select_policy" ON dialog_frequency_settings;
CREATE POLICY "dialog_frequency_settings_select_policy" ON dialog_frequency_settings FOR SELECT
    USING (TRUE);

DROP POLICY IF EXISTS "dialog_frequency_settings_insert_policy" ON dialog_frequency_settings;
CREATE POLICY "dialog_frequency_settings_insert_policy" ON dialog_frequency_settings FOR INSERT
-- [跳过 auth.uid()]     WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "dialog_frequency_settings_update_policy" ON dialog_frequency_settings;
CREATE POLICY "dialog_frequency_settings_update_policy" ON dialog_frequency_settings FOR UPDATE
-- [跳过 auth.uid()]     USING (auth.uid() IS NOT NULL);


-- ============================================================
-- 来自: 012_fix_wbs_templates.sql
-- ============================================================
-- Migration 012: Fix wbs_templates table issues
-- Date: 2026-03-24
-- Problems:
--   1. created_by NOT NULL constraint prevents template creation (no-login system)
--   2. wbs_template_nodes RLS policy references wbs_templates.deleted_at which doesn't exist
--   3. Add deleted_at to wbs_templates for soft delete support
--   4. Add seed data for common WBS templates

-- 1. Fix created_by: Change NOT NULL to nullable
ALTER TABLE wbs_templates 
  ALTER COLUMN created_by DROP NOT NULL;

-- 2. Add deleted_at column to wbs_templates (needed by wbs_template_nodes RLS policy)
ALTER TABLE wbs_templates 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Fix RLS policies on wbs_templates to work without auth
DROP POLICY IF EXISTS "wbs_templates_select_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_select_policy" ON wbs_templates FOR SELECT
    USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "wbs_templates_insert_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_insert_policy" ON wbs_templates FOR INSERT
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "wbs_templates_update_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_update_policy" ON wbs_templates FOR UPDATE
    USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "wbs_templates_delete_policy" ON wbs_templates;
CREATE POLICY "wbs_templates_delete_policy" ON wbs_templates FOR DELETE
    USING (TRUE);

-- 4. Fix wbs_template_nodes RLS (referenced wbs_templates.deleted_at which now exists)
-- Already defined correctly in 011, just ensure it's applied
DROP POLICY IF EXISTS "wbs_template_nodes_select_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_select_policy" ON wbs_template_nodes FOR SELECT
    USING (EXISTS (SELECT 1 FROM wbs_templates wt WHERE wt.id = wbs_template_nodes.template_id AND wt.deleted_at IS NULL));

DROP POLICY IF EXISTS "wbs_template_nodes_insert_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_insert_policy" ON wbs_template_nodes FOR INSERT
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "wbs_template_nodes_update_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_update_policy" ON wbs_template_nodes FOR UPDATE
    USING (TRUE);

DROP POLICY IF EXISTS "wbs_template_nodes_delete_policy" ON wbs_template_nodes;
CREATE POLICY "wbs_template_nodes_delete_policy" ON wbs_template_nodes FOR DELETE
    USING (TRUE);

-- 5. Seed data: Insert default WBS templates for common project types
INSERT INTO wbs_templates (template_name, template_type, description, wbs_nodes, is_default)
VALUES 
(
  '住宅标准WBS模板',
  '住宅',
  '适用于普通住宅项目的标准WBS任务分解模板，包含从前期准备到竣工验收的完整流程',
  '[
    {"id":"1","name":"前期准备","level":1,"duration":30,"children":[
      {"id":"1-1","name":"可行性研究","level":2,"duration":15},
      {"id":"1-2","name":"立项审批","level":2,"duration":10},
      {"id":"1-3","name":"规划许可证办理","level":2,"duration":20}
    ]},
    {"id":"2","name":"勘察设计","level":1,"duration":90,"children":[
      {"id":"2-1","name":"地质勘察","level":2,"duration":20},
      {"id":"2-2","name":"方案设计","level":2,"duration":30},
      {"id":"2-3","name":"施工图设计","level":2,"duration":45}
    ]},
    {"id":"3","name":"施工准备","level":1,"duration":30,"children":[
      {"id":"3-1","name":"施工图审查","level":2,"duration":15},
      {"id":"3-2","name":"招标采购","level":2,"duration":20},
      {"id":"3-3","name":"施工许可证","level":2,"duration":10}
    ]},
    {"id":"4","name":"地基与基础","level":1,"duration":60,"children":[
      {"id":"4-1","name":"土方开挖","level":2,"duration":15},
      {"id":"4-2","name":"基础施工","level":2,"duration":30},
      {"id":"4-3","name":"地下室施工","level":2,"duration":20}
    ]},
    {"id":"5","name":"主体结构","level":1,"duration":120,"children":[
      {"id":"5-1","name":"钢筋工程","level":2,"duration":60},
      {"id":"5-2","name":"模板工程","level":2,"duration":60},
      {"id":"5-3","name":"混凝土浇筑","level":2,"duration":45}
    ]},
    {"id":"6","name":"二次结构与装修","level":1,"duration":90,"children":[
      {"id":"6-1","name":"砌体工程","level":2,"duration":30},
      {"id":"6-2","name":"抹灰工程","level":2,"duration":25},
      {"id":"6-3","name":"门窗安装","level":2,"duration":15},
      {"id":"6-4","name":"涂料工程","level":2,"duration":20}
    ]},
    {"id":"7","name":"机电安装","level":1,"duration":60,"children":[
      {"id":"7-1","name":"给排水安装","level":2,"duration":30},
      {"id":"7-2","name":"强弱电安装","level":2,"duration":30},
      {"id":"7-3","name":"暖通安装","level":2,"duration":20}
    ]},
    {"id":"8","name":"竣工验收","level":1,"duration":30,"children":[
      {"id":"8-1","name":"分项工程验收","level":2,"duration":15},
      {"id":"8-2","name":"竣工验收申请","level":2,"duration":5},
      {"id":"8-3","name":"竣工备案","level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '商业综合体WBS模板',
  '商业',
  '适用于商业综合体、写字楼、购物中心等商业项目的WBS任务分解模板',
  '[
    {"id":"1","name":"项目策划","level":1,"duration":45,"children":[
      {"id":"1-1","name":"市场调研","level":2,"duration":20},
      {"id":"1-2","name":"业态规划","level":2,"duration":15},
      {"id":"1-3","name":"投资分析","level":2,"duration":15}
    ]},
    {"id":"2","name":"前期手续","level":1,"duration":60,"children":[
      {"id":"2-1","name":"土地获取","level":2,"duration":30},
      {"id":"2-2","name":"规划审批","level":2,"duration":20},
      {"id":"2-3","name":"建设工程许可","level":2,"duration":15}
    ]},
    {"id":"3","name":"设计阶段","level":1,"duration":120,"children":[
      {"id":"3-1","name":"概念设计","level":2,"duration":30},
      {"id":"3-2","name":"方案深化","level":2,"duration":45},
      {"id":"3-3","name":"施工图出图","level":2,"duration":60}
    ]},
    {"id":"4","name":"施工阶段","level":1,"duration":540,"children":[
      {"id":"4-1","name":"基坑工程","level":2,"duration":60},
      {"id":"4-2","name":"地下结构","level":2,"duration":90},
      {"id":"4-3","name":"地上主体结构","level":2,"duration":180},
      {"id":"4-4","name":"幕墙工程","level":2,"duration":90},
      {"id":"4-5","name":"机电安装","level":2,"duration":120},
      {"id":"4-6","name":"精装修工程","level":2,"duration":120}
    ]},
    {"id":"5","name":"招商运营准备","level":1,"duration":90,"children":[
      {"id":"5-1","name":"招商策划","level":2,"duration":30},
      {"id":"5-2","name":"主力店签约","level":2,"duration":45},
      {"id":"5-3","name":"开业筹备","level":2,"duration":30}
    ]},
    {"id":"6","name":"竣工交付","level":1,"duration":30,"children":[
      {"id":"6-1","name":"竣工验收","level":2,"duration":15},
      {"id":"6-2","name":"消防验收","level":2,"duration":10},
      {"id":"6-3","name":"产权登记","level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '工业厂房WBS模板',
  '工业',
  '适用于工业厂房、仓储物流等工业项目的WBS任务分解模板',
  '[
    {"id":"1","name":"前期工作","level":1,"duration":30,"children":[
      {"id":"1-1","name":"工艺方案确定","level":2,"duration":15},
      {"id":"1-2","name":"环评报告","level":2,"duration":20},
      {"id":"1-3","name":"用地许可","level":2,"duration":15}
    ]},
    {"id":"2","name":"设计工作","level":1,"duration":60,"children":[
      {"id":"2-1","name":"工艺设计","level":2,"duration":30},
      {"id":"2-2","name":"建筑结构设计","level":2,"duration":35},
      {"id":"2-3","name":"设备基础设计","level":2,"duration":20}
    ]},
    {"id":"3","name":"主体施工","level":1,"duration":180,"children":[
      {"id":"3-1","name":"地基处理","level":2,"duration":30},
      {"id":"3-2","name":"钢结构安装","level":2,"duration":60},
      {"id":"3-3","name":"围护系统","level":2,"duration":30},
      {"id":"3-4","name":"地坪工程","level":2,"duration":20}
    ]},
    {"id":"4","name":"设备安装","level":1,"duration":90,"children":[
      {"id":"4-1","name":"工艺设备安装","level":2,"duration":45},
      {"id":"4-2","name":"管道安装","level":2,"duration":30},
      {"id":"4-3","name":"电气安装","level":2,"duration":25}
    ]},
    {"id":"5","name":"调试验收","level":1,"duration":30,"children":[
      {"id":"5-1","name":"单机调试","level":2,"duration":15},
      {"id":"5-2","name":"联动调试","level":2,"duration":10},
      {"id":"5-3","name":"试生产验收","level":2,"duration":10}
    ]}
  ]'::jsonb,
  TRUE
),
(
  '市政道路WBS模板',
  '市政',
  '适用于市政道路、管网、桥梁等市政项目的WBS任务分解模板',
  '[
    {"id":"1","name":"勘察设计","level":1,"duration":90,"children":[
      {"id":"1-1","name":"测量勘察","level":2,"duration":20},
      {"id":"1-2","name":"初步设计","level":2,"duration":30},
      {"id":"1-3","name":"施工图设计","level":2,"duration":45}
    ]},
    {"id":"2","name":"征地拆迁","level":1,"duration":60,"children":[
      {"id":"2-1","name":"征地范围确定","level":2,"duration":15},
      {"id":"2-2","name":"房屋拆迁","level":2,"duration":30},
      {"id":"2-3","name":"管线迁改","level":2,"duration":20}
    ]},
    {"id":"3","name":"路基工程","level":1,"duration":90,"children":[
      {"id":"3-1","name":"清表换填","level":2,"duration":20},
      {"id":"3-2","name":"路基填筑压实","level":2,"duration":45},
      {"id":"3-3","name":"边坡防护","level":2,"duration":20}
    ]},
    {"id":"4","name":"路面工程","level":1,"duration":60,"children":[
      {"id":"4-1","name":"基层铺设","level":2,"duration":20},
      {"id":"4-2","name":"沥青面层","level":2,"duration":30},
      {"id":"4-3","name":"人行道铺装","level":2,"duration":15}
    ]},
    {"id":"5","name":"附属工程","level":1,"duration":45,"children":[
      {"id":"5-1","name":"雨污水管网","level":2,"duration":25},
      {"id":"5-2","name":"路灯照明","level":2,"duration":15},
      {"id":"5-3","name":"交通标志标线","level":2,"duration":10}
    ]},
    {"id":"6","name":"竣工验收","level":1,"duration":20,"children":[
      {"id":"6-1","name":"交工检测","level":2,"duration":10},
      {"id":"6-2","name":"竣工验收","level":2,"duration":7},
      {"id":"6-3","name":"移交管养","level":2,"duration":5}
    ]}
  ]'::jsonb,
  TRUE
)
ON CONFLICT (template_name, template_type) DO NOTHING;


-- ============================================================
-- 来自: 013_add_risk_statistics.sql
-- ============================================================
-- 风险统计表：用于存储每日风险数据快照，支持趋势分析
CREATE TABLE IF NOT EXISTS risk_statistics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  stat_date date NOT NULL,
  
  -- 新增风险数量
  new_risks int DEFAULT 0,
  new_high_risks int DEFAULT 0,
  new_medium_risks int DEFAULT 0,
  new_low_risks int DEFAULT 0,
  
  -- 已处理风险数量
  resolved_risks int DEFAULT 0,
  resolved_high_risks int DEFAULT 0,
  resolved_medium_risks int DEFAULT 0,
  resolved_low_risks int DEFAULT 0,
  
  -- 当前风险存量（快照）
  total_risks int DEFAULT 0,
  high_risk_count int DEFAULT 0,
  medium_risk_count int DEFAULT 0,
  low_risk_count int DEFAULT 0,
  
  -- 按类型统计
  delay_risks int DEFAULT 0,
  obstacle_risks int DEFAULT 0,
  condition_risks int DEFAULT 0,
  general_risks int DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- 每个项目每天只有一条记录
  UNIQUE(project_id, stat_date)
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_risk_statistics_project_date 
  ON risk_statistics(project_id, stat_date);
CREATE INDEX IF NOT EXISTS idx_risk_statistics_stat_date 
  ON risk_statistics(stat_date);

-- 更新时间戳触发器
CREATE OR REPLACE FUNCTION update_risk_statistics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
-- [跳过 auth.uid()]       AND pm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE risk_statistics IS '每日风险统计快照表，用于趋势分析';
COMMENT ON COLUMN risk_statistics.new_risks IS '当日新增风险总数';
COMMENT ON COLUMN risk_statistics.resolved_risks IS '当日已处理风险总数';
COMMENT ON COLUMN risk_statistics.total_risks IS '当日结束时风险存量';


-- ============================================================
-- 来自: 014_add_project_health_details.sql
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
-- [跳过 auth.uid()]             AND pm.user_id = auth.uid()
        )
    );

-- RLS策略：系统可写入（后端服务）
CREATE POLICY project_health_details_insert_policy ON project_health_details
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects p
            JOIN project_members pm ON p.id = pm.project_id
            WHERE p.id = project_health_details.project_id
-- [跳过 auth.uid()]             AND pm.user_id = auth.uid()
        )
    );

COMMENT ON TABLE project_health_details IS '项目健康度分项分数表，支持历史趋势分析和分项诊断';
COMMENT ON COLUMN project_health_details.health_score IS '综合健康度得分（0-100）';
COMMENT ON COLUMN project_health_details.health_status IS '健康度等级：优秀(90+)/良好(70-89)/警告(50-69)/危险(0-49)';


-- ============================================================
-- 来自: 015_add_license_phase_management.sql
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
  dependency_type VARCHAR(20) DEFAULT 'sequential'
    CHECK (dependency_type IN ('sequential', 'parallel', 'conditional')),
  
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
-- 来自: 016_add_risk_category.sql
-- ============================================================
-- 为 risks 表添加 risk_category 字段（风险类型：进度/质量/成本/安全/合同/外部/其他）
ALTER TABLE risks ADD COLUMN IF NOT EXISTS risk_category VARCHAR(20) DEFAULT 'other';

-- 为已有记录推断默认类型（全部设为 other，由用户手动更新）
COMMENT ON COLUMN risks.risk_category IS '风险类型：progress(进度)/quality(质量)/cost(成本)/safety(安全)/contract(合同)/external(外部)/other(其他)';


-- ============================================================
-- 来自: 017_add_standard_processes.sql
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

