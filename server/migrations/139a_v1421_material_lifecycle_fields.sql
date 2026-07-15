-- 139_v1421_material_lifecycle_fields.sql
-- v1.4.21: Material record lifecycle, retention, and quality fields

BEGIN;

ALTER TABLE project_materials
  ADD COLUMN IF NOT EXISTS record_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at_trigger TIMESTAMPTZ;

-- Backfill record_status
UPDATE project_materials SET record_status = 'active' WHERE record_status IS NULL;

-- Backfill lifecycle_status from record_status
UPDATE project_materials SET lifecycle_status = 'archived' WHERE lifecycle_status = 'active' AND record_status IN ('inactive', 'voided', 'deleted');
UPDATE project_materials SET lifecycle_status = 'voided' WHERE lifecycle_status = 'active' AND record_status = 'voided';

-- Index for active-only queries
CREATE INDEX IF NOT EXISTS idx_materials_active
  ON project_materials(project_id, record_status)
  WHERE record_status = 'active';

-- Data quality rules for materials (v1.4.16 integration)
INSERT INTO data_quality_rule_registry (rule_code, rule_type, dimension, severity, description, auto_resolve_condition) VALUES
  ('MATERIAL_SPECIALTY_MISSING', 'completeness', 'completeness', 'warning', 'Material missing specialty type', 'specialty_type IS NOT NULL'),
  ('MATERIAL_UNIT_MISSING', 'completeness', 'completeness', 'warning', 'Material missing participant unit', 'participant_unit_id IS NOT NULL'),
  ('MATERIAL_ARRIVAL_OVERDUE', 'staleness', 'timeliness', 'warning', 'Material past expected arrival date', 'actual_arrival_date IS NOT NULL'),
  ('MATERIAL_SAMPLE_PENDING', 'staleness', 'timeliness', 'info', 'Material sample confirmation pending beyond expected date', 'sample_confirmed = true')
ON CONFLICT (rule_code) DO NOTHING;

COMMIT;
