-- 121a_add_engineering_categories_standard_fields.sql
-- v1.4.2 revision: add standard_work_code/name to engineering_categories,
-- add unique index for enabled name uniqueness, and sync snapshots.

BEGIN;

ALTER TABLE engineering_categories
  ADD COLUMN IF NOT EXISTS standard_work_code TEXT,
  ADD COLUMN IF NOT EXISTS standard_work_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_enabled_name
  ON engineering_categories (project_id, COALESCE(parent_id::text, '_root_'), category_name)
  WHERE enabled = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_system_standard_work_code
  ON engineering_categories (standard_work_code)
  WHERE project_id IS NULL AND standard_work_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_eng_cat_project_standard_work_code
  ON engineering_categories (project_id, standard_work_code)
  WHERE project_id IS NOT NULL AND standard_work_code IS NOT NULL;

COMMIT;
