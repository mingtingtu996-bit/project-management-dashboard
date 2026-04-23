-- Unified scope-dimension dictionary and per-project bindings.

CREATE TABLE IF NOT EXISTS scope_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_key TEXT NOT NULL,
  label TEXT NOT NULL,
  code TEXT NULL,
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
  ('region', '一区', 1, TRUE, 1),
  ('region', '二区', 2, TRUE, 1),
  ('region', '三区', 3, TRUE, 1),
  ('region', '四区', 4, TRUE, 1),
  ('phase', '前期', 1, TRUE, 1),
  ('phase', '设计', 2, TRUE, 1),
  ('phase', '施工', 3, TRUE, 1),
  ('phase', '验收', 4, TRUE, 1),
  ('phase', '交付', 5, TRUE, 1)
ON CONFLICT (dimension_key, label) DO UPDATE
SET
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  version = scope_dimensions.version + 1,
  updated_at = NOW();

DO $$
DECLARE
  legacy_scope_count BIGINT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'building_type'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'structure_type'
  ) THEN
    SELECT COUNT(*)
    INTO legacy_scope_count
    FROM projects
    WHERE building_type IS NOT NULL OR structure_type IS NOT NULL;

    IF legacy_scope_count = 0 THEN
      ALTER TABLE projects DROP COLUMN IF EXISTS building_type;
      ALTER TABLE projects DROP COLUMN IF EXISTS structure_type;
    END IF;
  END IF;
END $$;
