BEGIN;

ALTER TABLE IF EXISTS issues
  ADD COLUMN IF NOT EXISTS closed_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS participant_units
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_role TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

CREATE INDEX IF NOT EXISTS idx_participant_units_project_id
  ON participant_units(project_id);

WITH project_candidates AS (
  SELECT
    participant_unit_id,
    MIN(project_id) AS project_id,
    COUNT(DISTINCT project_id) AS project_count
  FROM tasks
  WHERE participant_unit_id IS NOT NULL
  GROUP BY participant_unit_id
)
UPDATE participant_units pu
SET project_id = pc.project_id
FROM project_candidates pc
WHERE pu.id = pc.participant_unit_id
  AND pu.project_id IS NULL
  AND pc.project_count = 1;

ALTER TABLE IF EXISTS acceptance_plans
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES participant_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_participant_unit_id
  ON acceptance_plans(participant_unit_id);

ALTER TABLE IF EXISTS task_progress_snapshots
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS event_source VARCHAR(50);

UPDATE task_progress_snapshots
SET
  event_type = COALESCE(event_type, 'task_update'),
  event_source = COALESCE(event_source, CASE WHEN is_auto_generated THEN 'system_auto' ELSE 'manual' END)
WHERE event_type IS NULL
   OR event_source IS NULL;

INSERT INTO scope_dimensions (dimension_key, label, sort_order, is_active, version)
VALUES
  ('region', '一区', 1, TRUE, 1),
  ('region', '二区', 2, TRUE, 1),
  ('region', '三区', 3, TRUE, 1),
  ('region', '四区', 4, TRUE, 1)
ON CONFLICT (dimension_key, label) DO UPDATE
SET
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  version = scope_dimensions.version + 1,
  updated_at = NOW();

COMMIT;
