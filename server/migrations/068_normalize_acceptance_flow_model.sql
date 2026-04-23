BEGIN;

-- 13.2: 完整验收流程模型补齐
-- 保留 acceptance_plans 作为计划主表，在其上增补新建模字段；
-- 同时补齐目录 / 依赖 / 条件 / 过程记录四个辅助表。

ALTER TABLE acceptance_plans
  ADD COLUMN IF NOT EXISTS building_id TEXT,
  ADD COLUMN IF NOT EXISTS scope_level TEXT,
  ADD COLUMN IF NOT EXISTS participant_unit_id UUID REFERENCES participant_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS catalog_id UUID,
  ADD COLUMN IF NOT EXISTS type_id TEXT,
  ADD COLUMN IF NOT EXISTS type_name TEXT,
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS phase_order INTEGER,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER,
  ADD COLUMN IF NOT EXISTS parallel_group_id TEXT,
  ADD COLUMN IF NOT EXISTS position JSONB,
  ADD COLUMN IF NOT EXISTS depends_on JSONB,
  ADD COLUMN IF NOT EXISTS depended_by JSONB;

CREATE INDEX IF NOT EXISTS idx_acceptance_plans_participant_unit_id
  ON acceptance_plans(participant_unit_id);

CREATE TABLE IF NOT EXISTS acceptance_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  catalog_code TEXT,
  catalog_name TEXT NOT NULL,
  phase_code TEXT,
  scope_level TEXT,
  planned_finish_date DATE,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acceptance_catalog_project_code
  ON acceptance_catalog(project_id, catalog_code)
  WHERE catalog_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acceptance_catalog_project_id
  ON acceptance_catalog(project_id);

CREATE TABLE IF NOT EXISTS acceptance_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  source_plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  target_plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  dependency_kind TEXT NOT NULL DEFAULT 'hard'
    CHECK (dependency_kind IN ('hard', 'soft')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_project_id
  ON acceptance_dependencies(project_id);

CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_source_plan_id
  ON acceptance_dependencies(source_plan_id);

CREATE INDEX IF NOT EXISTS idx_acceptance_dependencies_target_plan_id
  ON acceptance_dependencies(target_plan_id);

CREATE TABLE IF NOT EXISTS acceptance_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID,
  plan_id UUID NOT NULL REFERENCES acceptance_plans(id) ON DELETE CASCADE,
  requirement_type TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_satisfied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_project_id
  ON acceptance_requirements(project_id);

CREATE INDEX IF NOT EXISTS idx_acceptance_requirements_plan_id
  ON acceptance_requirements(plan_id);

ALTER TABLE acceptance_records
  ADD COLUMN IF NOT EXISTS project_id UUID,
  ADD COLUMN IF NOT EXISTS plan_id UUID,
  ADD COLUMN IF NOT EXISTS record_type TEXT,
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS operator TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB;

UPDATE acceptance_records
SET plan_id = acceptance_plan_id
WHERE plan_id IS NULL AND acceptance_plan_id IS NOT NULL;

UPDATE acceptance_records ar
SET project_id = ap.project_id
FROM acceptance_plans ap
WHERE ar.project_id IS NULL AND ar.acceptance_plan_id = ap.id;

CREATE INDEX IF NOT EXISTS idx_acceptance_records_project_id
  ON acceptance_records(project_id);

CREATE INDEX IF NOT EXISTS idx_acceptance_records_plan_id
  ON acceptance_records(plan_id);

COMMIT;
