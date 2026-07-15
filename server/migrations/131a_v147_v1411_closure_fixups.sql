-- 131_v147_v1411_closure_fixups.sql
-- Final closure fixups for v1.4.7-v1.4.11 implementation boundaries.

BEGIN;

-- v1.4.8 task constraint cache on current task facts.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS ready_for_start BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dependency_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS condition_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS obstacle_status TEXT NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS progress_impact_level TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS blocked_for_progress BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS readiness_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS constraint_evaluated_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_dependency_status_check
    CHECK (dependency_status IN ('satisfied','blocking','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_condition_status_check
    CHECK (condition_status IN ('satisfied','blocking','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_obstacle_status_check
    CHECK (obstacle_status IN ('clear','warning','partial_impact','blocked','not_applicable'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_progress_impact_level_check
    CHECK (progress_impact_level IN ('none','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_constraint_status
  ON tasks(project_id, ready_for_start, progress_impact_level, blocked_for_progress);

ALTER TABLE task_obstacles
  ADD COLUMN IF NOT EXISTS progress_impact_level TEXT NOT NULL DEFAULT 'warning',
  ADD COLUMN IF NOT EXISTS blocking_scope TEXT NOT NULL DEFAULT 'progress',
  ADD COLUMN IF NOT EXISTS blocking_level TEXT NOT NULL DEFAULT 'warning';

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_progress_impact_level_check
    CHECK (progress_impact_level IN ('none','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_blocking_scope_check
    CHECK (blocking_scope IN ('none','start','progress','finish'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE task_obstacles ADD CONSTRAINT task_obstacles_blocking_level_check
    CHECK (blocking_level IN ('info','warning','partial','blocked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS task_constraint_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  ready_for_start BOOLEAN NOT NULL DEFAULT true,
  dependency_status TEXT NOT NULL DEFAULT 'not_applicable',
  condition_status TEXT NOT NULL DEFAULT 'not_applicable',
  obstacle_status TEXT NOT NULL DEFAULT 'clear',
  progress_impact_level TEXT NOT NULL DEFAULT 'none',
  blocked_for_progress BOOLEAN NOT NULL DEFAULT false,
  readiness_summary JSONB NOT NULL DEFAULT '{}',
  source_event_type TEXT NOT NULL,
  source_event_key TEXT NOT NULL,
  calculation_version TEXT NOT NULL DEFAULT 'v1.4.8',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_constraint_snapshots_event_key
  ON task_constraint_snapshots(source_event_key);
CREATE INDEX IF NOT EXISTS idx_task_constraint_snapshots_task
  ON task_constraint_snapshots(project_id, task_id, created_at DESC);

-- v1.4.10 participant unit lifecycle vocabulary used by ordinary selectors.
ALTER TABLE participant_units DROP CONSTRAINT IF EXISTS participant_units_unit_status_check;
ALTER TABLE participant_units
  ADD CONSTRAINT participant_units_unit_status_check
  CHECK (unit_status IN ('active','disabled','archived'));

COMMIT;
