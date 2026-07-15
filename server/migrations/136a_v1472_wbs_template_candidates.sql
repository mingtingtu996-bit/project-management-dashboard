-- 136_v1472_wbs_template_candidates.sql
-- v1.4.7.2 §13.3 / v1.4.7.3 §13.3: Template candidate events

BEGIN;

CREATE TABLE IF NOT EXISTS wbs_template_candidate_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('task_list','baseline')),
  event_type TEXT NOT NULL DEFAULT 'template_generate_commit',
  generation_batch_id TEXT,
  template_id TEXT,
  selected_node_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  attach_under_row_id TEXT,
  generated_row_count INTEGER NOT NULL DEFAULT 0,
  retained_row_count INTEGER NOT NULL DEFAULT 0,
  rejected_row_count INTEGER NOT NULL DEFAULT 0,
  pending_row_count INTEGER NOT NULL DEFAULT 0,
  generated_entity_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_template_candidate_project
  ON wbs_template_candidate_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_candidate_batch
  ON wbs_template_candidate_events(generation_batch_id)
  WHERE generation_batch_id IS NOT NULL;

-- ============================================================
-- v1.4.7.3 §13.3: Aggregation table for template candidates
-- ============================================================
CREATE TABLE IF NOT EXISTS wbs_template_candidate_aggregations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  template_id TEXT,
  period_month TEXT NOT NULL,
  total_candidates INT NOT NULL DEFAULT 0,
  accepted_candidates INT NOT NULL DEFAULT 0,
  rejected_candidates INT NOT NULL DEFAULT 0,
  pending_candidates INT NOT NULL DEFAULT 0,
  acceptance_rate REAL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_agg_unique
  ON wbs_template_candidate_aggregations(project_id, template_id, period_month);

COMMIT;
