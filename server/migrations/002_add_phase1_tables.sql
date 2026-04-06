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
  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('土地证', '规划证', '施工证', '预售证', '产权证', '其他')),
  milestone_name TEXT NOT NULL,
  application_date DATE,
  issue_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT '待申请' CHECK (status IN ('待申请', '办理中', '已取得', '已过期', '需延期')),
  document_no TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
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
