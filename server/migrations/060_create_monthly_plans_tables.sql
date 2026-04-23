BEGIN;

CREATE TABLE IF NOT EXISTS monthly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'closed', 'revising', 'pending_realign')),
  month VARCHAR(7) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  source_version_id UUID,
  source_version_label TEXT,
  closeout_at TIMESTAMPTZ,
  carryover_item_count INTEGER DEFAULT 0,
  confirmed_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, month, version)
);

CREATE TABLE IF NOT EXISTS monthly_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  monthly_plan_version_id UUID NOT NULL REFERENCES monthly_plans(id) ON DELETE CASCADE,
  baseline_item_id UUID REFERENCES task_baseline_items(id) ON DELETE SET NULL,
  carryover_from_item_id UUID REFERENCES monthly_plan_items(id) ON DELETE SET NULL,
  source_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  target_progress NUMERIC(6,2),
  current_progress NUMERIC(6,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_milestone BOOLEAN DEFAULT FALSE,
  is_critical BOOLEAN DEFAULT FALSE,
  commitment_status VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (commitment_status IN ('planned', 'carried_over', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_project_id ON monthly_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plans_month ON monthly_plans(month);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_plan_version_id ON monthly_plan_items(monthly_plan_version_id);
CREATE INDEX IF NOT EXISTS idx_monthly_plan_items_project_id ON monthly_plan_items(project_id);

COMMIT;
