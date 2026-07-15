-- 128_create_project_entity_links.sql
-- v1.4.11: Unified project entity linkage table.
-- Links drawings, certificates, and acceptance plans to tasks,
-- conditions, and requirements via stable relation types.

BEGIN;

CREATE TABLE IF NOT EXISTS project_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  relation_strength TEXT NOT NULL DEFAULT 'explicit',
  status TEXT NOT NULL DEFAULT 'active',
  source_ref_field TEXT,
  display_snapshot JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints (idempotent via DO $$)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_source_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_source_type_check
      CHECK (source_entity_type IN ('drawing_package','construction_drawing','pre_milestone','certificate_work_item','acceptance_plan'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_target_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_target_type_check
      CHECK (target_entity_type IN ('task','task_condition','acceptance_requirement','pre_milestone','certificate_work_item'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_relation_type_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_relation_type_check
      CHECK (relation_type IN ('satisfies_condition','satisfies_acceptance_requirement','covers_task','references_certificate','blocks_task_start'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_relation_strength_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_relation_strength_check
      CHECK (relation_strength IN ('explicit','system_inferred','legacy_mapped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_entity_links_status_check') THEN
    ALTER TABLE project_entity_links ADD CONSTRAINT project_entity_links_status_check
      CHECK (status IN ('active','inactive'));
  END IF;
END $$;

-- Unique active link
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_entity_links_unique_active
  ON project_entity_links(project_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type)
  WHERE status = 'active';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_project_entity_links_source
  ON project_entity_links(project_id, source_entity_type, source_entity_id, status);
CREATE INDEX IF NOT EXISTS idx_project_entity_links_target
  ON project_entity_links(project_id, target_entity_type, target_entity_id, status);

-- RLS
ALTER TABLE project_entity_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_entity_links_read_policy ON project_entity_links;
CREATE POLICY project_entity_links_read_policy ON project_entity_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_entity_links.project_id AND pm.user_id = auth.uid())
    OR (SELECT current_setting('role', true) = 'service_role'));
DROP POLICY IF EXISTS project_entity_links_write_policy ON project_entity_links;
CREATE POLICY project_entity_links_write_policy ON project_entity_links FOR INSERT
  WITH CHECK ((SELECT current_setting('role', true) = 'service_role'));

-- Projection columns on task_conditions for v1.4.11 linkage
ALTER TABLE task_conditions
  ADD COLUMN IF NOT EXISTS source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- Projection columns on acceptance_requirements for v1.4.11 linkage
ALTER TABLE acceptance_requirements
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS review_source_entity_id TEXT,
  ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_project_entity_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trigger_update_project_entity_links_updated_at ON project_entity_links;
CREATE TRIGGER trigger_update_project_entity_links_updated_at
  BEFORE UPDATE ON project_entity_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_entity_links_updated_at();

COMMIT;
