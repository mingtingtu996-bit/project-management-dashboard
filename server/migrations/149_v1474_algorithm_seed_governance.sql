-- v1.4.7.4 algorithm seed governance and self-upgrade mechanism
-- System TS seeds remain immutable fallbacks. Active rules are governed through
-- versioned seed imports, automatic candidate gates, quarantine, and project/company overrides.

CREATE TABLE IF NOT EXISTS public.algorithm_seed_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_type TEXT NOT NULL,
  seed_version TEXT NOT NULL,
  seed_scope TEXT NOT NULL DEFAULT 'algorithm_auxiliary',
  source_standards JSONB NOT NULL DEFAULT '[]'::jsonb,
  expected_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'deprecated', 'rejected')),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  imported_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  published_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seed_type, seed_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_seed_versions_current
  ON public.algorithm_seed_versions(seed_type)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_versions_type_status
  ON public.algorithm_seed_versions(seed_type, status, is_current);

CREATE TABLE IF NOT EXISTS public.algorithm_seed_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_version_id UUID NOT NULL REFERENCES public.algorithm_seed_versions(id) ON DELETE CASCADE,
  seed_type TEXT NOT NULL,
  stable_code TEXT NOT NULL,
  rule_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_standard TEXT NULL,
  source_version TEXT NULL,
  source_clause_ref TEXT NULL,
  evidence_source_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low')),
  web_verified BOOLEAN NOT NULL DEFAULT TRUE,
  review_needed BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deprecated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seed_version_id, stable_code)
);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_records_type_status
  ON public.algorithm_seed_records(seed_type, status);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_records_stable_code
  ON public.algorithm_seed_records(seed_type, stable_code);

CREATE TABLE IF NOT EXISTS public.algorithm_seed_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_version_id UUID NULL REFERENCES public.algorithm_seed_versions(id) ON DELETE SET NULL,
  seed_type TEXT NOT NULL,
  import_source TEXT NOT NULL DEFAULT 'ts_seed',
  expected_counts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  actual_counts_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_import_logs_type_time
  ON public.algorithm_seed_import_logs(seed_type, imported_at DESC);

CREATE TABLE IF NOT EXISTS public.algorithm_seed_upgrade_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_type TEXT NOT NULL,
  stable_code TEXT NOT NULL,
  candidate_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_source TEXT NOT NULL
    CHECK (candidate_source IN ('project_history', 'company_history', 'standard_update', 'system_observation')),
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sample_count INTEGER NOT NULL DEFAULT 0,
  variance NUMERIC NULL,
  confidence_level TEXT NOT NULL DEFAULT 'low'
    CHECK (confidence_level IN ('high', 'medium', 'low')),
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_policy TEXT NOT NULL DEFAULT 'auto_govern'
    CHECK (action_policy IN ('candidate_only', 'auto_govern')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'candidate_only', 'auto_published', 'quarantined', 'rejected', 'superseded')),
  auto_score NUMERIC NOT NULL DEFAULT 0,
  auto_governance_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  quarantine_reason TEXT NULL,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auto_governed_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_candidates_scope_status
  ON public.algorithm_seed_upgrade_candidates(seed_type, status, company_id, project_id);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_candidates_stable_code
  ON public.algorithm_seed_upgrade_candidates(seed_type, stable_code);

CREATE TABLE IF NOT EXISTS public.algorithm_seed_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_type TEXT NOT NULL,
  stable_code TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('project', 'company')),
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  override_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_candidate_id UUID NULL REFERENCES public.algorithm_seed_upgrade_candidates(id) ON DELETE SET NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'deprecated')),
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  published_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  auto_governance_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (scope_type = 'project' AND project_id IS NOT NULL)
    OR (scope_type = 'company' AND company_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_seed_overrides_active_project
  ON public.algorithm_seed_overrides(seed_type, stable_code, project_id)
  WHERE scope_type = 'project' AND status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_algorithm_seed_overrides_active_company
  ON public.algorithm_seed_overrides(seed_type, stable_code, company_id)
  WHERE scope_type = 'company' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_overrides_scope
  ON public.algorithm_seed_overrides(seed_type, scope_type, status, company_id, project_id);
