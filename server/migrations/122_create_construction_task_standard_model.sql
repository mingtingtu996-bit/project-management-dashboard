-- 122_create_construction_task_standard_model.sql
-- v1.4.3 Construction task standard data model.
-- Adds task standard fields, task_dependencies table, and constraints.

BEGIN;

-- ============================================================
-- 0. Pre-flight: detect existing task_dependencies structure
-- ============================================================
DO $$
DECLARE
  has_predecessor_col BOOLEAN;
  has_task_id_col BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'task_dependencies'
  ) THEN
    -- Check column structure
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_dependencies'
        AND column_name = 'predecessor_id'
    ) INTO has_predecessor_col;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'task_dependencies'
        AND column_name = 'task_id'
    ) INTO has_task_id_col;

    -- If old structure (predecessor_id without task_id), rename to v1.4.3 standard
    IF has_predecessor_col AND NOT has_task_id_col THEN
      ALTER TABLE public.task_dependencies RENAME COLUMN predecessor_id TO task_id;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'task_dependencies'
          AND column_name = 'successor_id'
      ) THEN
        ALTER TABLE public.task_dependencies RENAME COLUMN successor_id TO dependency_task_id;
      END IF;
      RAISE NOTICE 'task_dependencies migrated from predecessor/successor to task_id/dependency_task_id';
    END IF;
  END IF;
END $$;

-- ============================================================
-- 1. Task dependencies standard table
-- ============================================================
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'FS'
    CHECK (dependency_type IN ('FS','SS','FF','SF')),
  lag_days INTEGER NOT NULL DEFAULT 0,
  required_for_start BOOLEAN NOT NULL DEFAULT true,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_dependencies_not_self CHECK (task_id <> dependency_task_id)
);

-- Add constraint if not exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'task_dependencies_not_self'
  ) THEN
    ALTER TABLE task_dependencies ADD CONSTRAINT task_dependencies_not_self CHECK (task_id <> dependency_task_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_unique
  ON task_dependencies(project_id, task_id, dependency_task_id, dependency_type);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task
  ON task_dependencies(project_id, task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependency
  ON task_dependencies(project_id, dependency_task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_required
  ON task_dependencies(project_id, required_for_start);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_source
  ON task_dependencies(project_id, source_type);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_task_dependencies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_task_dependencies_updated_at ON task_dependencies;
CREATE TRIGGER trigger_update_task_dependencies_updated_at
  BEFORE UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_task_dependencies_updated_at();

-- RLS
ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_dependencies_select_policy ON task_dependencies;
CREATE POLICY task_dependencies_select_policy ON task_dependencies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_insert_policy ON task_dependencies;
CREATE POLICY task_dependencies_insert_policy ON task_dependencies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.permission_level IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_update_policy ON task_dependencies;
CREATE POLICY task_dependencies_update_policy ON task_dependencies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.permission_level IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS task_dependencies_delete_policy ON task_dependencies;
CREATE POLICY task_dependencies_delete_policy ON task_dependencies
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = task_dependencies.project_id
        AND pm.user_id = auth.uid()
        AND pm.permission_level IN ('owner', 'editor')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

-- ============================================================
-- 2. Task standard fields
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS task_code TEXT,
  ADD COLUMN IF NOT EXISTS task_code_version TEXT,
  ADD COLUMN IF NOT EXISTS progress_method TEXT NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS planned_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS completed_quantity NUMERIC,
  ADD COLUMN IF NOT EXISTS quantity_unit TEXT,
  ADD COLUMN IF NOT EXISTS progress_weight NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completion_rule TEXT NOT NULL DEFAULT 'progress_100',
  ADD COLUMN IF NOT EXISTS drawing_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS material_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acceptance_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quality_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS standard_task_metadata JSONB NOT NULL DEFAULT '{}';

-- Constraint: progress_method check (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_method_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_method_check
      CHECK (progress_method IN ('percent','quantity','milestone','manual_weighted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_completion_rule_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_completion_rule_check
      CHECK (completion_rule IN ('progress_100','quantity_completed','acceptance_passed','manual_confirmed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_weight_positive_check') THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_progress_weight_positive_check
      CHECK (progress_weight > 0);
  END IF;
END $$;

-- task_code unique per project
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_project_task_code
  ON tasks(project_id, task_code)
  WHERE task_code IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_executable
  ON tasks(project_id, is_executable, status);
CREATE INDEX IF NOT EXISTS idx_tasks_task_code
  ON tasks(task_code) WHERE task_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_progress_method
  ON tasks(project_id, progress_method);

-- ============================================================
-- 3. Backfill defaults for existing tasks
-- ============================================================
UPDATE tasks
SET
  progress_method = COALESCE(progress_method, 'percent'),
  completion_rule = COALESCE(completion_rule, 'progress_100'),
  progress_weight = COALESCE(progress_weight, 1),
  standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
WHERE progress_method IS NULL OR completion_rule IS NULL OR progress_weight IS NULL OR standard_task_metadata IS NULL;


-- Atomic replace_task_dependencies RPC: delete all old + insert all new in one transaction
CREATE OR REPLACE FUNCTION public.replace_task_dependencies(
  p_task_id UUID,
  p_deps JSONB
)
RETURNS SETOF task_dependencies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dep JSONB;
  new_row task_dependencies;
  dep_ids UUID[];
BEGIN
  -- Delete old
  DELETE FROM task_dependencies WHERE task_id = p_task_id;

  -- Insert new
  FOR dep IN SELECT * FROM jsonb_array_elements(p_deps)
  LOOP
    INSERT INTO task_dependencies (
      id, project_id, task_id, dependency_task_id,
      dependency_type, lag_days, required_for_start, source_type,
      created_at, updated_at
    ) VALUES (
      COALESCE((dep->>'id')::UUID, gen_random_uuid()),
      COALESCE((dep->>'project_id')::UUID, (SELECT project_id FROM tasks WHERE id = p_task_id)),
      p_task_id,
      (dep->>'dependency_task_id')::UUID,
      COALESCE(dep->>'dependency_type', 'FS'),
      COALESCE((dep->>'lag_days')::INTEGER, 0),
      COALESCE((dep->>'required_for_start')::BOOLEAN, true),
      COALESCE(dep->>'source_type', 'manual'),
      COALESCE((dep->>'created_at')::TIMESTAMPTZ, NOW()),
      COALESCE((dep->>'updated_at')::TIMESTAMPTZ, NOW())
    );
    -- rows are returned after the cache sync below
  END LOOP;

  -- Sync tasks.dependencies cache
  SELECT array_agg(dependency_task_id) INTO dep_ids
    FROM task_dependencies WHERE task_id = p_task_id;
  UPDATE tasks SET dependencies = COALESCE(dep_ids, '{}') WHERE id = p_task_id;

  RETURN QUERY SELECT * FROM task_dependencies WHERE task_id = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM authenticated;

-- Same-project trigger: ensure task_id and dependency_task_id match project_id
CREATE OR REPLACE FUNCTION public.check_task_dependencies_same_project()
RETURNS TRIGGER AS $$
DECLARE
  task_project UUID;
  dep_project UUID;
BEGIN
  SELECT project_id INTO task_project FROM tasks WHERE id = NEW.task_id;
  SELECT project_id INTO dep_project FROM tasks WHERE id = NEW.dependency_task_id;
  IF task_project IS NULL OR dep_project IS NULL THEN
    RAISE EXCEPTION 'Task or dependency task not found';
  END IF;
  IF task_project != dep_project THEN
    RAISE EXCEPTION 'task_id (%) and dependency_task_id (%) belong to different projects', NEW.task_id, NEW.dependency_task_id;
  END IF;
  IF NEW.project_id IS NULL THEN
    NEW.project_id = task_project;
  ELSIF NEW.project_id != task_project THEN
    RAISE EXCEPTION 'project_id mismatch: task % belongs to project %, not %', NEW.task_id, task_project, NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_task_dependencies_same_project ON task_dependencies;
CREATE TRIGGER trigger_check_task_dependencies_same_project
  BEFORE INSERT OR UPDATE ON task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_task_dependencies_same_project();

COMMIT;
