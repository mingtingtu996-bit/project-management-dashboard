-- 前期证照 12.2 迁移：办理事项真值层 + 依赖边
-- 说明：
-- - certificate_work_items 作为办理事项真值表
-- - certificate_dependencies 作为证件 / 办理事项之间的依赖边
-- - 旧 certificate_approvals 保留为历史兼容风险，不再作为新写入口

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE INDEX IF NOT EXISTS idx_certificate_work_items_project
  ON certificate_work_items(project_id);

CREATE INDEX IF NOT EXISTS idx_certificate_work_items_stage
  ON certificate_work_items(project_id, item_stage);

CREATE INDEX IF NOT EXISTS idx_certificate_work_items_status
  ON certificate_work_items(project_id, status);

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

COMMENT ON TABLE certificate_work_items IS '前期证照办理事项真值表，旧 certificate_approvals 仅保留兼容风险';
COMMENT ON TABLE certificate_dependencies IS '前期证照依赖边表，承载证件与办理事项、事项与事项的关系';
