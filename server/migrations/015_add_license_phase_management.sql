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
