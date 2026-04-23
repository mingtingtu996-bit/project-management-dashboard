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
CREATE INDEX IF NOT EXISTS idx_pre_milestones_project ON pre_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_type ON pre_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_certificate_type ON pre_milestones(project_id, certificate_type);
CREATE INDEX IF NOT EXISTS idx_pre_milestones_status_current ON pre_milestones(project_id, status);

-- 创建触发器
CREATE TRIGGER update_pre_milestones_updated_at
BEFORE UPDATE ON pre_milestones
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 添加注释
COMMENT ON TABLE pre_milestones IS '前期证照表，记录项目前期各类证照的办理情况';
