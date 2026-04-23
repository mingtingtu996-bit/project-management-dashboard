BEGIN;

CREATE TABLE IF NOT EXISTS task_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  source_type VARCHAR(30) NOT NULL DEFAULT 'current_schedule'
    CHECK (source_type IN ('manual', 'current_schedule', 'imported_file', 'carryover')),
  source_version_id UUID,
  source_version_label TEXT,
  effective_from DATE,
  effective_to DATE,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS task_baseline_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_version_id UUID NOT NULL REFERENCES task_baselines(id) ON DELETE CASCADE,
  parent_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  source_milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  target_progress NUMERIC(6,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_milestone BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  mapping_status VARCHAR(20) NOT NULL DEFAULT 'mapped'
    CHECK (mapping_status IN ('mapped', 'pending', 'missing', 'merged')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_baselines_project_id ON task_baselines(project_id);
CREATE INDEX IF NOT EXISTS idx_task_baselines_status ON task_baselines(status);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_baseline_version_id ON task_baseline_items(baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_task_baseline_items_project_id ON task_baseline_items(project_id);

COMMIT;
