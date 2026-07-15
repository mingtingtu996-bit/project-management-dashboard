-- v1.4.22 phase 1-3: algorithm catalog, caliber versions, and seed catalog
-- These tables are governance metadata. System-level rows have null company_id/project_id.

CREATE TABLE IF NOT EXISTS public.algorithm_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  algorithm_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  owner_chapter TEXT NOT NULL,
  implementation_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  ordinary_user_visible BOOLEAN NOT NULL DEFAULT false,
  input_contract_version TEXT NOT NULL DEFAULT 'v1',
  output_contract_version TEXT NOT NULL DEFAULT 'v1',
  current_caliber_version TEXT NOT NULL DEFAULT 'v1',
  source_kind TEXT NOT NULL DEFAULT 'code',
  runtime_effect TEXT NOT NULL DEFAULT 'backend_governance_only',
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_catalog_scope_consistency CHECK (
    project_id IS NULL OR company_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_algorithm_catalog_domain ON public.algorithm_catalog(domain);
CREATE INDEX IF NOT EXISTS idx_algorithm_catalog_scope ON public.algorithm_catalog(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_algorithm_catalog_status ON public.algorithm_catalog(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_algorithm_catalog_unique_scope
  ON public.algorithm_catalog (
    algorithm_key,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE IF NOT EXISTS public.algorithm_caliber_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  algorithm_key TEXT NOT NULL,
  caliber_version TEXT NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ NULL,
  change_summary TEXT NOT NULL,
  input_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  consumer_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback_to_version TEXT NULL,
  test_suite_key TEXT NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_caliber_versions_scope_consistency CHECK (
    project_id IS NULL OR company_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_algorithm_caliber_versions_algorithm ON public.algorithm_caliber_versions(algorithm_key);
CREATE INDEX IF NOT EXISTS idx_algorithm_caliber_versions_scope ON public.algorithm_caliber_versions(company_id, project_id);
CREATE INDEX IF NOT EXISTS idx_algorithm_caliber_versions_effective ON public.algorithm_caliber_versions(effective_from, effective_to);
CREATE UNIQUE INDEX IF NOT EXISTS idx_algorithm_caliber_versions_unique_scope
  ON public.algorithm_caliber_versions (
    algorithm_key,
    caliber_version,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE TABLE IF NOT EXISTS public.algorithm_seed_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key TEXT NOT NULL,
  seed_file TEXT NOT NULL,
  seed_type TEXT NOT NULL,
  seed_version TEXT NOT NULL,
  registry_status TEXT NOT NULL,
  scope TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  authority_chapter TEXT NOT NULL,
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_effect TEXT NOT NULL DEFAULT 'backend_governance_only',
  owner TEXT NOT NULL DEFAULT 'backend_algorithm_governance',
  lifecycle_status TEXT NOT NULL DEFAULT 'active',
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT algorithm_seed_catalog_record_count_non_negative CHECK (record_count >= 0),
  CONSTRAINT algorithm_seed_catalog_scope_consistency CHECK (
    project_id IS NULL OR company_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_catalog_type ON public.algorithm_seed_catalog(seed_type);
CREATE INDEX IF NOT EXISTS idx_algorithm_seed_catalog_registry_status ON public.algorithm_seed_catalog(registry_status);
CREATE INDEX IF NOT EXISTS idx_algorithm_seed_catalog_scope ON public.algorithm_seed_catalog(company_id, project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_algorithm_seed_catalog_unique_scope
  ON public.algorithm_seed_catalog (
    seed_key,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
