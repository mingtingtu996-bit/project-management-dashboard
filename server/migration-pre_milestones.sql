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
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_pre_milestones_project ON pre_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_type ON pre_milestones(milestone_type);

-- 创建触发器
CREATE TRIGGER update_pre_milestones_updated_at
BEFORE UPDATE ON pre_milestones
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 添加注释
COMMENT ON TABLE pre_milestones IS '前期证照表，记录项目前期各类证照的办理情况';