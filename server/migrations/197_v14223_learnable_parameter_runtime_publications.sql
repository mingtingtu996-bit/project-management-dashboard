-- v1.4.22.3: learnable-parameter runtime publications, rollback closure, and audit events.
-- This is a parameter-runtime publication surface only. It does not write algorithm seeds or business runtime tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.algorithm_learnable_parameter_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL UNIQUE,
  event_key TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  parameter_key TEXT NOT NULL,
  owner_algorithm TEXT NULL,
  scope_level TEXT NOT NULL
    CHECK (scope_level IN ('company', 'project', 'system')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_surface TEXT NOT NULL
    CHECK (target_surface IN ('project_override', 'company_override', 'system_seed')),
  publication_status TEXT NOT NULL
    CHECK (publication_status IN ('published', 'canary', 'rolled_back')),
  parameter_value JSONB NOT NULL DEFAULT 'null'::jsonb,
  previous_value JSONB NOT NULL DEFAULT 'null'::jsonb,
  rollback_target TEXT NOT NULL,
  release_package JSONB NOT NULL DEFAULT '{}'::jsonb,
  impact_monitoring JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_execution JSONB NULL,
  writes_seed_runtime_directly BOOLEAN NOT NULL DEFAULT false,
  target_runtime_table TEXT NOT NULL DEFAULT 'algorithm_learnable_parameter_runtime_publications',
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT algorithm_learnable_parameter_runtime_publications_scope_consistency CHECK (
    (
      scope_level = 'system'
      AND company_id IS NULL
      AND project_id IS NULL
      AND target_surface = 'system_seed'
    )
    OR (
      scope_level = 'company'
      AND company_id IS NOT NULL
      AND project_id IS NULL
      AND target_surface = 'company_override'
    )
    OR (
      scope_level = 'project'
      AND company_id IS NOT NULL
      AND project_id IS NOT NULL
      AND target_surface = 'project_override'
    )
  ),
  CONSTRAINT algorithm_learnable_parameter_runtime_publications_no_seed_runtime_target CHECK (
    writes_seed_runtime_directly = false
    AND target_runtime_table = 'algorithm_learnable_parameter_runtime_publications'
  )
);

CREATE INDEX IF NOT EXISTS idx_algorithm_learnable_parameter_runtime_publications_scope
  ON public.algorithm_learnable_parameter_runtime_publications(
    scope_level,
    company_id,
    project_id,
    publication_status,
    published_at DESC
  );
CREATE INDEX IF NOT EXISTS idx_algorithm_learnable_parameter_runtime_publications_key
  ON public.algorithm_learnable_parameter_runtime_publications(parameter_key, owner_algorithm, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_algorithm_learnable_parameter_runtime_publications_rollback
  ON public.algorithm_learnable_parameter_runtime_publications(rollback_target, publication_status);

CREATE TABLE IF NOT EXISTS public.algorithm_learnable_parameter_release_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('parameter_runtime_publication', 'rollback_execution', 'impact_monitoring')),
  event_status TEXT NOT NULL
    CHECK (event_status IN (
      'runtime_parameter_published',
      'runtime_parameter_canary_published',
      'rollback_executed',
      'rollback_blocked',
      'monitoring_passed',
      'monitoring_failed'
    )),
  source_publication_key TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_algorithm_learnable_parameter_release_events_publication
  ON public.algorithm_learnable_parameter_release_events(source_publication_key, event_type, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_algorithm_learnable_parameter_release_events_status
  ON public.algorithm_learnable_parameter_release_events(event_type, event_status, executed_at DESC);

ALTER TABLE public.algorithm_learnable_parameter_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_learnable_parameter_release_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS algorithm_learnable_parameter_runtime_publications_select_admin
  ON public.algorithm_learnable_parameter_runtime_publications;
CREATE POLICY algorithm_learnable_parameter_runtime_publications_select_admin
  ON public.algorithm_learnable_parameter_runtime_publications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS algorithm_learnable_parameter_runtime_publications_write_service_role
  ON public.algorithm_learnable_parameter_runtime_publications;
CREATE POLICY algorithm_learnable_parameter_runtime_publications_write_service_role
  ON public.algorithm_learnable_parameter_runtime_publications
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS algorithm_learnable_parameter_release_events_select_admin
  ON public.algorithm_learnable_parameter_release_events;
CREATE POLICY algorithm_learnable_parameter_release_events_select_admin
  ON public.algorithm_learnable_parameter_release_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS algorithm_learnable_parameter_release_events_write_service_role
  ON public.algorithm_learnable_parameter_release_events;
CREATE POLICY algorithm_learnable_parameter_release_events_write_service_role
  ON public.algorithm_learnable_parameter_release_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.algorithm_learnable_parameter_runtime_publications IS
  'Backend-admin parameter-runtime publication surface for v1.4.22.3 learnable parameters. It records scoped parameter publications and rollback state without writing algorithm seed or business runtime tables.';

COMMENT ON TABLE public.algorithm_learnable_parameter_release_events IS
  'Backend-admin audit trail for learnable-parameter runtime publication, rollback execution, and impact-monitoring events.';

COMMENT ON COLUMN public.algorithm_learnable_parameter_runtime_publications.target_surface IS
  'Logical release target from release-exit. system_seed here is a governance target surface, not direct mutation of algorithm seed tables.';

NOTIFY pgrst, 'reload schema';

COMMIT;
