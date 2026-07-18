-- Governed runtime payloads for duration-learning assets.
-- Cold-start seeds and templates remain valid fallbacks. Only learned overlays
-- enter this table after replay/policy gates and remain reversible.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 315';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL UNIQUE,
  asset_key TEXT NOT NULL
    CHECK (asset_key IN (
      'base_duration_benchmark',
      'standard_work_duration_seed',
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate'
    )),
  artifact_key TEXT NOT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('project', 'company', 'industry', 'global')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  industry_key TEXT NULL,
  publication_stage TEXT NOT NULL
    CHECK (publication_stage IN ('canary', 'stable', 'superseded', 'rolled_back')),
  runtime_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_candidate_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  automation_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  previous_publication_key TEXT NULL
    REFERENCES public.duration_learning_runtime_publications(publication_key) ON DELETE SET NULL,
  traffic_percent INTEGER NOT NULL DEFAULT 100
    CHECK (traffic_percent BETWEEN 1 AND 100),
  monitoring_window_hours INTEGER NOT NULL DEFAULT 72
    CHECK (monitoring_window_hours BETWEEN 1 AND 2160),
  monitoring_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (monitoring_status IN ('pending', 'collecting', 'passed', 'failed', 'rollback_pending')),
  monitoring_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  impact_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_execution JSONB NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rolled_back_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duration_learning_runtime_publications_scope_consistency CHECK (
    (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
      AND industry_key IS NULL
    )
    OR (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
      AND industry_key IS NULL
    )
    OR (
      scope_level = 'industry'
      AND company_id IS NULL
      AND project_id IS NULL
      AND NULLIF(industry_key, '') IS NOT NULL
    )
    OR (
      scope_level = 'global'
      AND company_id IS NULL
      AND project_id IS NULL
      AND industry_key IS NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_learning_runtime_publications_active_scope
  ON public.duration_learning_runtime_publications (
    asset_key,
    artifact_key,
    scope_level,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(industry_key, ''),
    publication_stage
  )
  WHERE publication_stage IN ('canary', 'stable');

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_publications_resolution
  ON public.duration_learning_runtime_publications (
    asset_key,
    artifact_key,
    publication_stage,
    scope_level,
    published_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_publications_monitoring
  ON public.duration_learning_runtime_publications (
    monitoring_status,
    monitoring_started_at,
    publication_stage
  )
  WHERE publication_stage IN ('canary', 'stable');

ALTER TABLE public.duration_learning_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_publications FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.duration_learning_runtime_publications
  TO workbuddy_runtime;

DROP POLICY IF EXISTS duration_learning_runtime_publications_backend_runtime_policy
  ON public.duration_learning_runtime_publications;
CREATE POLICY duration_learning_runtime_publications_backend_runtime_policy
  ON public.duration_learning_runtime_publications
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON TABLE public.duration_learning_runtime_publications IS
  'Executable, scoped and reversible duration-learning overlays. This table never stores task, dependency, baseline or progress facts.';
COMMENT ON COLUMN public.duration_learning_runtime_publications.runtime_payload IS
  'Validated runtime payload consumed by the owning duration or plan-network resolver.';
COMMENT ON COLUMN public.duration_learning_runtime_publications.previous_publication_key IS
  'Previously stable publication retained for atomic rollback.';

NOTIFY pgrst, 'reload schema';

COMMIT;
