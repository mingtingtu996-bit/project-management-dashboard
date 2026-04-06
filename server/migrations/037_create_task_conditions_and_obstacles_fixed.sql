-- Migration 037: Create task_conditions and task_obstacles tables (Fixed Version)
-- Date: 2026-03-30
-- Problem: Tables were referenced in code but never created
-- Fix: Create both tables with proper schema

-- ============================================
-- 1. task_conditions（任务开工条件表）
-- ============================================
CREATE TABLE IF NOT EXISTS task_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 条件基本信息
  condition_type VARCHAR(50) NOT NULL DEFAULT '其他' CHECK (condition_type IN ('图纸', '材料', '人员', '设备', '手续', '其他')),
  name TEXT NOT NULL,
  description TEXT,
  
  -- 状态管理
  is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  satisfied_at TIMESTAMPTZ,
  
  -- 目标完成日期（新增）
  target_date DATE,
  
  -- 责任单位和责任人（新增）
  responsible_unit VARCHAR(100),
  responsible_person VARCHAR(100),
  
  -- 附件和备注
  attachments JSONB DEFAULT '[]',
  notes TEXT,
  
  -- 确认信息
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  
  -- 创建和更新时间
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_task_conditions_task ON task_conditions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_conditions_project ON task_conditions(project_id);
CREATE INDEX IF NOT EXISTS idx_task_conditions_type ON task_conditions(condition_type);
CREATE INDEX IF NOT EXISTS idx_task_conditions_satisfied ON task_conditions(is_satisfied);

-- 创建触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_task_conditions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_conditions_updated_at ON task_conditions;
CREATE TRIGGER trigger_task_conditions_updated_at
  BEFORE UPDATE ON task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_task_conditions_updated_at();

-- 启用 RLS
ALTER TABLE task_conditions ENABLE ROW LEVEL SECURITY;

-- 删除现有 Policies（如果存在）
DROP POLICY IF EXISTS "task_conditions_select_policy" ON task_conditions;
DROP POLICY IF EXISTS "task_conditions_insert_policy" ON task_conditions;
DROP POLICY IF EXISTS "task_conditions_update_policy" ON task_conditions;
DROP POLICY IF EXISTS "task_conditions_delete_policy" ON task_conditions;

-- RLS Policies - 简化版本，使用 auth.uid() 检查
CREATE POLICY "task_conditions_select_policy" ON task_conditions FOR SELECT
  USING (true);

CREATE POLICY "task_conditions_insert_policy" ON task_conditions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "task_conditions_update_policy" ON task_conditions FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "task_conditions_delete_policy" ON task_conditions FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- ============================================
-- 2. task_obstacles（任务阻碍记录表）
-- ============================================
CREATE TABLE IF NOT EXISTS task_obstacles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- 阻碍基本信息
  obstacle_type VARCHAR(50) NOT NULL DEFAULT '其他' CHECK (obstacle_type IN ('人员', '材料', '设备', '环境', '设计', '手续', '资金', '其他')),
  description TEXT NOT NULL,
  
  -- 严重程度
  severity VARCHAR(20) NOT NULL DEFAULT '中' CHECK (severity IN ('低', '中', '高', '严重')),
  
  -- 状态管理
  status VARCHAR(50) NOT NULL DEFAULT '待处理' CHECK (status IN ('待处理', '处理中', '已解决', '无法解决')),
  
  -- 解决方案
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- 预计解决日期
  estimated_resolve_date DATE,
  
  -- 附件和备注
  attachments JSONB DEFAULT '[]',
  notes TEXT,
  
  -- 创建和更新时间
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_task_obstacles_task ON task_obstacles(task_id);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_project ON task_obstacles(project_id);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_type ON task_obstacles(obstacle_type);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_status ON task_obstacles(status);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_severity ON task_obstacles(severity);

-- 创建触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_task_obstacles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_obstacles_updated_at ON task_obstacles;
CREATE TRIGGER trigger_task_obstacles_updated_at
  BEFORE UPDATE ON task_obstacles
  FOR EACH ROW
  EXECUTE FUNCTION update_task_obstacles_updated_at();

-- 启用 RLS
ALTER TABLE task_obstacles ENABLE ROW LEVEL SECURITY;

-- 删除现有 Policies（如果存在）
DROP POLICY IF EXISTS "task_obstacles_select_policy" ON task_obstacles;
DROP POLICY IF EXISTS "task_obstacles_insert_policy" ON task_obstacles;
DROP POLICY IF EXISTS "task_obstacles_update_policy" ON task_obstacles;
DROP POLICY IF EXISTS "task_obstacles_delete_policy" ON task_obstacles;

-- RLS Policies - 简化版本
CREATE POLICY "task_obstacles_select_policy" ON task_obstacles FOR SELECT
  USING (true);

CREATE POLICY "task_obstacles_insert_policy" ON task_obstacles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "task_obstacles_update_policy" ON task_obstacles FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "task_obstacles_delete_policy" ON task_obstacles FOR DELETE
  USING (auth.uid() IS NOT NULL);
