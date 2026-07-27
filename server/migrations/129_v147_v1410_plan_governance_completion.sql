-- 129_v147_v1410_plan_governance_completion.sql
-- v1.4.7-10: Complete remaining standardization columns, indexes, and constraints.

BEGIN;

-- ============================================================
-- v1.4.7: Plan governance columns
-- ============================================================
ALTER TABLE task_baselines
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_reason TEXT,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE monthly_plans
  ADD COLUMN IF NOT EXISTS source_mode TEXT,
  ADD COLUMN IF NOT EXISTS generation_cutoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_snapshot_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_by_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS temporary_without_baseline BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS manual_override_fields JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS planning_governance_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_schedule_change_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_progress_snapshot_at TIMESTAMPTZ;

-- v1.4.7: Monthly plan status check + source_mode check
ALTER TABLE monthly_plans DROP CONSTRAINT IF EXISTS monthly_plans_status_check;
DO $$ BEGIN
  ALTER TABLE monthly_plans ADD CONSTRAINT monthly_plans_status_check
    CHECK (status IN ('draft','confirmed','closed','revising','pending_realign','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE monthly_plans DROP CONSTRAINT IF EXISTS monthly_plans_source_mode_check;
DO $$ BEGIN
  ALTER TABLE monthly_plans ADD CONSTRAINT monthly_plans_source_mode_check
    CHECK (source_mode IS NULL OR source_mode IN ('baseline','schedule','mixed','manual','imported'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_monthly_plans_current_confirmed
  ON monthly_plans(project_id, month) WHERE status = 'confirmed';

-- ============================================================
-- v1.4.8: task_dependencies hardening
-- ============================================================
ALTER TABLE task_dependencies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_satisfied BOOLEAN;

DO $$ BEGIN
  ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_status_check
    CHECK (status IN ('active','inactive','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Replace full unique index with active-only unique
DROP INDEX IF EXISTS uq_task_dependencies_unique;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_active_unique
  ON task_dependencies(project_id, task_id, dependency_task_id, dependency_type)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_task_dependencies_status ON task_dependencies(project_id, status);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_confidence ON task_dependencies(project_id, inference_confidence);

-- ============================================================
-- v1.4.8: task_conditions hardening
-- ============================================================
ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS condition_code TEXT,
  ADD COLUMN IF NOT EXISTS required_for_start BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS blocking_level TEXT NOT NULL DEFAULT 'soft',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id UUID,
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_blocking_level_check
    CHECK (blocking_level IN ('hard','soft','info'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_conditions ADD CONSTRAINT task_conditions_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_conditions_constraint ON task_conditions(project_id, blocking_level, is_satisfied);
CREATE INDEX IF NOT EXISTS idx_task_conditions_confidence ON task_conditions(project_id, inference_confidence);

-- ============================================================
-- v1.4.8: task_obstacles hardening
-- ============================================================
ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS obstacle_code TEXT,
  ADD COLUMN IF NOT EXISTS impact_level TEXT NOT NULL DEFAULT 'partial',
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref_id UUID,
  ADD COLUMN IF NOT EXISTS inference_confidence TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS inference_reason TEXT,
  ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

UPDATE task_obstacles
SET is_resolved = true
WHERE COALESCE(is_resolved, false) = false
  AND (
    LOWER(COALESCE(status, '')) IN ('resolved', 'closed')
    OR status = '已解决'
    OR resolved_at IS NOT NULL
  );

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_impact_level_check
    CHECK (impact_level IN ('none','partial','severe','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_inference_confidence_check
    CHECK (inference_confidence IN ('high','medium','low'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_obstacles_constraint ON task_obstacles(project_id, impact_level, is_resolved);
CREATE INDEX IF NOT EXISTS idx_task_obstacles_confidence ON task_obstacles(project_id, inference_confidence);

-- ============================================================
-- v1.4.9: Milestone key node snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS project_key_node_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  baseline_version_id UUID REFERENCES task_baselines(id) ON DELETE SET NULL,
  monthly_plan_id UUID REFERENCES monthly_plans(id) ON DELETE SET NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'generated',
  key_node_type TEXT NOT NULL DEFAULT 'milestone',
  source_task_ids UUID[] NOT NULL DEFAULT '{}',
  display_label TEXT NOT NULL,
  planned_date TIMESTAMPTZ,
  actual_date TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_project ON project_key_node_snapshots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_baseline ON project_key_node_snapshots(baseline_version_id);
CREATE INDEX IF NOT EXISTS idx_key_node_snapshots_monthly ON project_key_node_snapshots(monthly_plan_id);

-- v1.4.9: tasks milestone indexes
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS key_node_type TEXT;
CREATE INDEX IF NOT EXISTS idx_tasks_project_milestones ON tasks(project_id, is_milestone, status);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON tasks(milestone_id) WHERE milestone_id IS NOT NULL;

-- ============================================================
-- v1.4.10: participant_units hardening
-- ============================================================
ALTER TABLE participant_units
  ADD COLUMN IF NOT EXISTS unit_code TEXT,
  ADD COLUMN IF NOT EXISTS unit_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS governance_metadata JSONB NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE participant_units ADD CONSTRAINT participant_units_unit_status_check
    CHECK (unit_status IN ('active','inactive','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_participant_units_project_status ON participant_units(project_id, unit_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_participant_units_project_name_active_unique
  ON participant_units(project_id, unit_name) WHERE unit_status = 'active';

-- v1.4.10: task_conditions participant_unit reference
ALTER TABLE task_conditions ADD COLUMN IF NOT EXISTS participant_unit_id UUID;
CREATE INDEX IF NOT EXISTS idx_task_conditions_participant_unit_id ON task_conditions(participant_unit_id);

COMMIT;
