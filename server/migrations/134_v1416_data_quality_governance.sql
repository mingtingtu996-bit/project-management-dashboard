-- 134_v1416_data_quality_governance.sql
-- v1.4.16: Extended data quality rules and dimensions

BEGIN;

-- ============================================================
-- Phase 1: data_quality_findings hardening
-- ============================================================
ALTER TABLE data_quality_findings
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS quality_dimension TEXT,
  ADD COLUMN IF NOT EXISTS confidence_impact REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS resolved_type TEXT;

-- Backfill entity_type from finding_key prefix
UPDATE data_quality_findings SET entity_type = 'task' WHERE entity_type IS NULL AND task_id IS NOT NULL;
UPDATE data_quality_findings SET entity_type = 'unknown' WHERE entity_type IS NULL;

-- Backfill quality_dimension from dimension_key or rule_type
UPDATE data_quality_findings SET quality_dimension = 'timeliness' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%timeliness%' OR rule_code IN ('SNAPSHOT_GAP', 'STALE_PROGRESS'));
UPDATE data_quality_findings SET quality_dimension = 'anomaly' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%anomaly%' OR rule_code IN ('PROGRESS_JUMP', 'BATCH_SAME_VALUE', 'ASSIGNEE_WORKLOAD_ABNORMAL'));
UPDATE data_quality_findings SET quality_dimension = 'consistency' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%consistency%' OR rule_code IN ('PARENT_CHILD_INCONSISTENT', 'DEPENDENCY_INCONSISTENT', 'MILESTONE_PREDECESSOR_INCONSISTENT', 'ACCEPTANCE_LINK_ORPHAN', 'CONDITION_ORPHAN'));
UPDATE data_quality_findings SET quality_dimension = 'jumpiness' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%jumpiness%' OR rule_code IN ('PROGRESS_TIME_MISMATCH'));
UPDATE data_quality_findings SET quality_dimension = 'coverage' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%coverage%');
UPDATE data_quality_findings SET quality_dimension = 'completeness' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%completeness%' OR rule_code IN ('ENGINEERING_OBJECT_MISSING', 'PARTICIPANT_UNIT_MISSING'));
UPDATE data_quality_findings SET quality_dimension = 'accuracy' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%accuracy%' OR rule_code IN ('WBS_TYPE_UNCALIBRATED'));
UPDATE data_quality_findings SET quality_dimension = 'lineage' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%lineage%' OR rule_code IN ('LINEAGE_INCOMPLETE'));
UPDATE data_quality_findings SET quality_dimension = 'governance' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%governance%' OR rule_code IN ('STATUS_NORMALIZATION_NEEDED'));
UPDATE data_quality_findings SET quality_dimension = 'retention' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%retention%' OR rule_code IN ('RETENTION_DECISION_EXPIRED', 'SOURCE_DELETED_UNRESOLVED'));
UPDATE data_quality_findings SET quality_dimension = 'metric_caliber' WHERE quality_dimension IS NULL AND (dimension_key LIKE '%metric_caliber%' OR rule_code IN ('METRIC_CALIBER_MISSING', 'METRIC_VALUE_UNAVAILABLE'));
UPDATE data_quality_findings SET quality_dimension = 'timeliness' WHERE quality_dimension IS NULL;

-- Widen rule_type constraint to include new types
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_quality_findings_rule_type_check') THEN
    ALTER TABLE data_quality_findings DROP CONSTRAINT data_quality_findings_rule_type_check;
  END IF;
END $$;

-- task_id FK: set null on delete so findings survive task removal
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'data_quality_findings_task_id_fkey') THEN
    ALTER TABLE data_quality_findings DROP CONSTRAINT data_quality_findings_task_id_fkey;
  END IF;
END $$;

ALTER TABLE data_quality_findings
  ADD CONSTRAINT data_quality_findings_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;

-- Indexes for new query patterns
CREATE INDEX IF NOT EXISTS idx_quality_findings_entity ON data_quality_findings(entity_type, entity_id) WHERE status IN ('active', 'ignored');
CREATE INDEX IF NOT EXISTS idx_quality_findings_rule ON data_quality_findings(project_id, rule_code, status);

-- ============================================================
-- Phase 3: Extended finding rules reference table
-- ============================================================
CREATE TABLE IF NOT EXISTS data_quality_rule_registry (
  rule_code TEXT PRIMARY KEY,
  rule_type TEXT NOT NULL,
  dimension TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  description TEXT,
  auto_resolve_condition TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed extended rules
INSERT INTO data_quality_rule_registry (rule_code, rule_type, dimension, severity, description, auto_resolve_condition) VALUES
  ('ENGINEERING_OBJECT_MISSING', 'completeness', 'completeness', 'warning', 'Active executable task missing engineering object', 'engineering_object_id IS NOT NULL'),
  ('PARTICIPANT_UNIT_MISSING', 'completeness', 'completeness', 'warning', 'Active task missing participant unit', 'participant_unit_id IS NOT NULL'),
  ('WBS_TYPE_UNCALIBRATED', 'wbs_classification', 'accuracy', 'info', 'WBS node type inferred from depth', 'wbs_node_type IS NOT NULL OR engineering_category_id IS NOT NULL'),
  ('STATUS_NORMALIZATION_NEEDED', 'status_normalization', 'governance', 'warning', 'Task status not normalized to dictionary', NULL),
  ('LINEAGE_INCOMPLETE', 'lineage', 'lineage', 'info', 'Source mapping missing for generated task', NULL),
  ('RETENTION_DECISION_EXPIRED', 'retention', 'retention', 'warning', 'Retention decision token expired before confirmation', 'decision regenerated'),
  ('SOURCE_DELETED_UNRESOLVED', 'retention', 'retention', 'info', 'Finding source has been deleted and should be resolved by governance action', 'source_deleted resolution applied'),
  ('METRIC_CALIBER_MISSING', 'metric_caliber', 'metric_caliber', 'warning', 'Metric caliber or registry metadata is missing', 'metric caliber metadata restored'),
  ('METRIC_VALUE_UNAVAILABLE', 'metric_caliber', 'metric_caliber', 'info', 'Metric value is unavailable under the current caliber', 'snapshot recomputed with metric availability'),
  ('ACCEPTANCE_LINK_ORPHAN', 'cross_consistency', 'consistency', 'warning', 'Acceptance linked to nonexistent/cancelled task', 'task restored OR acceptance link updated'),
  ('CONDITION_ORPHAN', 'cross_consistency', 'consistency', 'warning', 'Task condition references deleted source', 'source restored OR condition marked inapplicable'),
  ('STALE_PROGRESS', 'staleness', 'timeliness', 'info', 'Active task not updated in 14+ days', 'progress or status updated')
ON CONFLICT (rule_code) DO UPDATE SET
  description = EXCLUDED.description,
  auto_resolve_condition = EXCLUDED.auto_resolve_condition;

-- ============================================================
-- Data quality dimension weights per project
-- ============================================================
ALTER TABLE project_data_quality_settings
  ADD COLUMN IF NOT EXISTS dimension_weights JSONB NOT NULL DEFAULT '{}';

-- Set default weights for all dimensions
UPDATE project_data_quality_settings
  SET dimension_weights = jsonb_build_object(
    'timeliness', 0.20,
    'anomaly', 0.20,
    'consistency', 0.15,
    'jumpiness', 0.10,
    'coverage', 0.15,
    'completeness', 0.10,
    'accuracy', 0.05,
    'lineage', 0.03,
    'governance', 0.02,
    'retention', 0.03,
    'metric_caliber', 0.03
  )
  WHERE dimension_weights = '{}'::jsonb;

-- ============================================================
-- Index on quality findings by dimension
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_quality_findings_dimension
  ON data_quality_findings(project_id, status, rule_code)
  WHERE status IN ('active', 'ignored');

-- ============================================================
-- Phase 1b: quality_dimension CHECK constraint + NOT NULL enforcement
-- ============================================================
UPDATE data_quality_findings SET quality_dimension = 'timeliness' WHERE quality_dimension IS NULL;

ALTER TABLE data_quality_findings
  ALTER COLUMN quality_dimension SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'data_quality_findings_quality_dimension_check'
  ) THEN
    ALTER TABLE data_quality_findings
      ADD CONSTRAINT data_quality_findings_quality_dimension_check
      CHECK (quality_dimension IN (
        'timeliness','anomaly','consistency','jumpiness','coverage',
        'completeness','accuracy','lineage','governance',
        'retention','metric_caliber'
      ));
  END IF;
END $$;

COMMIT;
