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
