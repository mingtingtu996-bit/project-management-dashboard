-- 135_v1417_metric_registry_snapshots.sql
-- v1.4.17: metric caliber versions and metric value snapshots.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS metric_caliber_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key TEXT NOT NULL UNIQUE,
  version_name TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metric_count INTEGER NOT NULL DEFAULT 0,
  definition_hash TEXT,
  change_reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS metric_value_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC,
  value_text TEXT,
  value_type TEXT NOT NULL DEFAULT 'number',
  availability_status TEXT NOT NULL DEFAULT 'ready',
  null_strategy TEXT NOT NULL DEFAULT 'show_null',
  source_type TEXT NOT NULL,
  source_ref_id TEXT,
  snapshot_date DATE NOT NULL,
  caliber_version TEXT NOT NULL DEFAULT 'v1.4.17',
  quality_dimension TEXT,
  data_quality_score NUMERIC(5,2),
  group_by TEXT NOT NULL DEFAULT 'project',
  group_key TEXT,
  group_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE metric_value_snapshots
  DROP CONSTRAINT IF EXISTS metric_value_snapshots_availability_status_check;

ALTER TABLE metric_value_snapshots
  ADD CONSTRAINT metric_value_snapshots_availability_status_check
  CHECK (availability_status IN (
    'ready',
    'insufficient_data',
    'not_applicable',
    'data_pending',
    'source_unavailable',
    'low_confidence'
  ));

ALTER TABLE project_daily_snapshot
  ADD COLUMN IF NOT EXISTS metric_availability JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS metric_registry_version TEXT NOT NULL DEFAULT 'v1.4.17',
  ADD COLUMN IF NOT EXISTS metric_snapshot_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_metric_value_snapshots_project_date
  ON metric_value_snapshots(project_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_metric_value_snapshots_metric_date
  ON metric_value_snapshots(metric_key, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_metric_value_snapshots_availability
  ON metric_value_snapshots(project_id, availability_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_value_snapshots_scope
  ON metric_value_snapshots(project_id, metric_key, snapshot_date, caliber_version, group_by, COALESCE(group_key, ''));

INSERT INTO metric_caliber_versions (
  version_key,
  version_name,
  metric_count,
  change_reason,
  metadata
) VALUES (
  'v1.4.17',
  'v1.4.17 Metric Registry (v1.4.21 extended materials)',
  31,
  'Unified metric caliber registry with full material coverage',
  jsonb_build_object('source', 'metricRegistryService')
)
ON CONFLICT (version_key) DO UPDATE SET
  version_name = EXCLUDED.version_name,
  change_reason = EXCLUDED.change_reason,
  metadata = EXCLUDED.metadata;

COMMENT ON TABLE metric_caliber_versions IS '统计指标口径版本表，记录指标定义和口径版本';
COMMENT ON TABLE metric_value_snapshots IS '统计指标值快照表，保存按项目、日期、维度切片后的指标值';
COMMENT ON COLUMN project_daily_snapshot.metric_availability IS 'v1.4.17 指标可用性状态快照，按 metric_key 存储 ready/insufficient_data 等状态';
COMMENT ON COLUMN project_daily_snapshot.metric_registry_version IS '生成该日报快照时使用的指标口径版本';
COMMENT ON COLUMN project_daily_snapshot.metric_snapshot_version IS '指标快照结构版本';

COMMIT;
