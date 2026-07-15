-- 121_add_wbs_engineering_categories.sql
-- v1.4.2 WBS decomposition standard system.
-- Adds engineering_categories as the WBS work classification tree,
-- and attaches WBS semantic columns to tasks, baselines, and monthly plans.

BEGIN;

-- ============================================================
-- 1. Engineering categories (WBS work classification tree)
-- ============================================================
CREATE TABLE IF NOT EXISTS engineering_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES engineering_categories(id) ON DELETE SET NULL,
  category_name TEXT NOT NULL,
  category_type TEXT NOT NULL
    CHECK (category_type IN ('division','sub_division','item_work','process','activity_step','custom')),
  category_level INTEGER NOT NULL DEFAULT 1,
  category_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Same-parent enabled name uniqueness (handles both project=NULL and project=value)
CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_enabled_name
  ON engineering_categories (category_name)
  WHERE project_id IS NULL AND parent_id IS NULL AND enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_root_enabled_name
  ON engineering_categories (project_id, category_name)
  WHERE project_id IS NOT NULL AND parent_id IS NULL AND enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_child_enabled_name
  ON engineering_categories (project_id, parent_id, category_name)
  WHERE project_id IS NOT NULL AND parent_id IS NOT NULL AND enabled = true;

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_eng_cat_project_type
  ON engineering_categories (project_id, category_type) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eng_cat_system_type
  ON engineering_categories (category_type) WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_eng_cat_project_parent_sort
  ON engineering_categories (project_id, parent_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_eng_cat_path
  ON engineering_categories (category_path);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_engineering_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_engineering_categories_updated_at ON engineering_categories;
CREATE TRIGGER trigger_update_engineering_categories_updated_at
  BEFORE UPDATE ON engineering_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_engineering_categories_updated_at();

-- RLS
ALTER TABLE engineering_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS engineering_categories_select_policy ON engineering_categories;
CREATE POLICY engineering_categories_select_policy ON engineering_categories
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = engineering_categories.project_id
        AND pm.user_id = auth.uid()
    )
    OR engineering_categories.project_id IS NULL
    OR
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'company_admin'
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_categories_insert_policy ON engineering_categories;
CREATE POLICY engineering_categories_insert_policy ON engineering_categories
  FOR INSERT WITH CHECK (
    (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS engineering_categories_update_policy ON engineering_categories;
CREATE POLICY engineering_categories_update_policy ON engineering_categories
  FOR UPDATE USING ((SELECT current_setting('role', true) = 'service_role'))
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

DROP POLICY IF EXISTS engineering_categories_delete_policy ON engineering_categories;
CREATE POLICY engineering_categories_delete_policy ON engineering_categories
  FOR DELETE USING ((SELECT current_setting('role', true) = 'service_role'));

-- ============================================================
-- 2. WBS semantic columns on tasks
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID REFERENCES engineering_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_leaf BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_engineering_category_id ON tasks(engineering_category_id);
CREATE INDEX IF NOT EXISTS idx_tasks_wbs_node_type ON tasks(project_id, wbs_node_type);
CREATE INDEX IF NOT EXISTS idx_tasks_is_executable ON tasks(project_id, is_executable) WHERE is_executable = true;

-- ============================================================
-- 3. WBS semantic snapshot columns on task_baseline_items
-- ============================================================
ALTER TABLE task_baseline_items
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

-- ============================================================
-- 4. WBS semantic snapshot columns on monthly_plan_items
-- ============================================================
ALTER TABLE monthly_plan_items
  ADD COLUMN IF NOT EXISTS engineering_category_id UUID,
  ADD COLUMN IF NOT EXISTS wbs_node_type TEXT,
  ADD COLUMN IF NOT EXISTS wbs_path TEXT,
  ADD COLUMN IF NOT EXISTS is_wbs_summary BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_executable BOOLEAN,
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

COMMIT;
