-- v1.4.7.2: standard WBS template catalog and template generation contracts.

ALTER TABLE wbs_templates
  ADD COLUMN IF NOT EXISTS standard_catalog_code TEXT,
  ADD COLUMN IF NOT EXISTS catalog_scope TEXT NOT NULL DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS source_standard TEXT,
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE wbs_template_nodes
  ADD COLUMN IF NOT EXISTS stable_code TEXT,
  ADD COLUMN IF NOT EXISTS category_type TEXT,
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID REFERENCES engineering_categories(id),
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT,
  ADD COLUMN IF NOT EXISTS source_standard TEXT,
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS source_clause_ref TEXT,
  ADD COLUMN IF NOT EXISTS default_duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS default_responsible_unit_role TEXT,
  ADD COLUMN IF NOT EXISTS default_dependency_mode TEXT NOT NULL DEFAULT 'FS',
  ADD COLUMN IF NOT EXISTS precondition_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS acceptance_link_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_milestone BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_needed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS web_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deprecated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_wbs_template_nodes_category_type'
  ) THEN
    ALTER TABLE wbs_template_nodes
      ADD CONSTRAINT chk_wbs_template_nodes_category_type
      CHECK (
        category_type IS NULL
        OR category_type IN ('division','sub_division','item_work','process','activity_step','custom')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_wbs_template_nodes_dependency_mode'
  ) THEN
    ALTER TABLE wbs_template_nodes
      ADD CONSTRAINT chk_wbs_template_nodes_dependency_mode
      CHECK (default_dependency_mode IN ('FS','SS','FF','SF'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wbs_templates_standard_catalog_code
  ON wbs_templates(standard_catalog_code)
  WHERE standard_catalog_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_stable_code
  ON wbs_template_nodes(template_id, stable_code)
  WHERE stable_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_category_type
  ON wbs_template_nodes(template_id, category_type)
  WHERE category_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wbs_template_nodes_engineering_category
  ON wbs_template_nodes(engineering_category_id)
  WHERE engineering_category_id IS NOT NULL;

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wbs_template_candidate_events_project
  ON wbs_template_candidate_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wbs_template_candidate_events_template
  ON wbs_template_candidate_events(template_id)
  WHERE template_id IS NOT NULL;
