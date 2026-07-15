-- 120_create_engineering_objects.sql
-- v1.4 / v1.4.1 Engineering objects master data system.
-- Adds engineering_objects as the authoritative source for scope dimensions
-- and attaches object-id foreign keys to tasks, materials, and acceptance plans.

BEGIN;

-- ============================================================
-- 1. Engineering objects master table
-- ============================================================
CREATE TABLE IF NOT EXISTS engineering_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL
    CHECK (object_type IN ('phase','section','building','basement','floor','physical_zone','functional_area')),
  object_code TEXT NOT NULL,
  object_name TEXT NOT NULL,
  parent_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive')),
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_ref_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Code must be unique per project + type (all statuses)
  UNIQUE (project_id, object_type, object_code)
);

-- Name uniqueness is enforced via partial unique indexes below (not a plain UNIQUE constraint).
-- A plain UNIQUE(project_id, object_name) would block inactive/historical name reuse
-- and would be superseded by the partial indexes that only apply to active rows.

-- Partial unique indexes for name uniqueness (active objects only).
-- Root nodes: parent_id IS NULL, status = 'active'
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_root_active_name
  ON engineering_objects (project_id, object_name)
  WHERE parent_id IS NULL AND status = 'active';

-- Child nodes: parent_id IS NOT NULL, status = 'active'
CREATE UNIQUE INDEX IF NOT EXISTS uq_engineering_objects_child_active_name
  ON engineering_objects (project_id, parent_id, object_name)
  WHERE parent_id IS NOT NULL AND status = 'active';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_type_status
  ON engineering_objects (project_id, object_type, status);

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_parent_sort
  ON engineering_objects (project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_engineering_objects_project_path
  ON engineering_objects (project_id, path);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_engineering_objects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_engineering_objects_updated_at ON engineering_objects;
CREATE TRIGGER trigger_update_engineering_objects_updated_at
  BEFORE UPDATE ON engineering_objects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_engineering_objects_updated_at();

-- ============================================================
-- 2. RLS on engineering_objects
-- ============================================================
ALTER TABLE engineering_objects ENABLE ROW LEVEL SECURITY;

-- SELECT: project members OR company_admin role OR service_role
DROP POLICY IF EXISTS engineering_objects_select_policy ON engineering_objects;
CREATE POLICY engineering_objects_select_policy ON engineering_objects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = engineering_objects.project_id
        AND pm.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.role = 'company_admin'
    )
    OR
    (SELECT current_setting('role', true) = 'service_role')
  );

-- Only service_role can write (business logic enforced by backend API routes)
DROP POLICY IF EXISTS engineering_objects_insert_policy ON engineering_objects;
CREATE POLICY engineering_objects_insert_policy ON engineering_objects
  FOR INSERT
  WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_update_policy ON engineering_objects;
CREATE POLICY engineering_objects_update_policy ON engineering_objects
  FOR UPDATE
  USING (
    (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_objects_delete_policy ON engineering_objects;
CREATE POLICY engineering_objects_delete_policy ON engineering_objects
  FOR DELETE
  USING (
    (SELECT current_setting('role', true) = 'service_role')
  );

-- ============================================================
-- 3. Task columns — v1.4.22.1 object-id foreign keys (seven-class range tree)
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS engineering_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS section_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS building_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS floor_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS basement_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS physical_zone_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS functional_area_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_engineering_object_id ON tasks(engineering_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_phase_object_id ON tasks(phase_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_section_object_id ON tasks(section_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_building_object_id ON tasks(building_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_floor_object_id ON tasks(floor_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_basement_object_id ON tasks(basement_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_physical_zone_object_id ON tasks(physical_zone_object_id);
CREATE INDEX IF NOT EXISTS idx_tasks_functional_area_object_id ON tasks(functional_area_object_id);

-- ============================================================
-- 4. Acceptance plan column — building object id
-- ============================================================
ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS building_object_id UUID REFERENCES engineering_objects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_building_object_id
  ON acceptance_plans(building_object_id);

COMMIT;
