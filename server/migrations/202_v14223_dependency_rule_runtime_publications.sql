-- v1.4.22.3 dependency rule runtime publication boundary.
-- This stores governed dependency/critical-path rule runtime publications.
-- It does not write task_dependencies.
-- It does not write algorithm_seed_records.
-- It does not write algorithm_seed_versions.

CREATE TABLE IF NOT EXISTS public.construction_dependency_rule_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL UNIQUE,
  dependency_rule_version_id TEXT NOT NULL,
  runtime_publication_status TEXT NOT NULL
    CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back')),
  dependency_rule_lineage JSONB NOT NULL,
  rollback_target TEXT NOT NULL,
  rollback_execution JSONB NULL,
  rolled_back_at TIMESTAMPTZ NULL,
  impact_monitoring JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_construction_dependency_rule_runtime_publications_scope
  ON public.construction_dependency_rule_runtime_publications(
    runtime_publication_status,
    dependency_rule_version_id,
    published_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_construction_dependency_rule_runtime_publications_rollback
  ON public.construction_dependency_rule_runtime_publications(
    rollback_target,
    runtime_publication_status
  );

CREATE TABLE IF NOT EXISTS public.construction_dependency_rule_runtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('dependency_rule_runtime_publication', 'rollback_execution', 'impact_monitoring')),
  event_status TEXT NOT NULL,
  source_publication_key TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_construction_dependency_rule_runtime_events_source
  ON public.construction_dependency_rule_runtime_events(
    source_publication_key,
    event_type,
    executed_at DESC
  );

ALTER TABLE public.construction_dependency_rule_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_dependency_rule_runtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS construction_dependency_rule_runtime_publications_select_admin
  ON public.construction_dependency_rule_runtime_publications;
CREATE POLICY construction_dependency_rule_runtime_publications_select_admin
  ON public.construction_dependency_rule_runtime_publications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS construction_dependency_rule_runtime_publications_write_service_role
  ON public.construction_dependency_rule_runtime_publications;
CREATE POLICY construction_dependency_rule_runtime_publications_write_service_role
  ON public.construction_dependency_rule_runtime_publications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS construction_dependency_rule_runtime_events_select_admin
  ON public.construction_dependency_rule_runtime_events;
CREATE POLICY construction_dependency_rule_runtime_events_select_admin
  ON public.construction_dependency_rule_runtime_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS construction_dependency_rule_runtime_events_write_service_role
  ON public.construction_dependency_rule_runtime_events;
CREATE POLICY construction_dependency_rule_runtime_events_write_service_role
  ON public.construction_dependency_rule_runtime_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.construction_dependency_rule_runtime_publications IS
  'v1.4.22.3 governed dependency rule runtime publications. This table is the runtime publication/audit boundary for dependency rules and does not write task_dependencies or algorithm seed runtime.';

COMMENT ON COLUMN public.construction_dependency_rule_runtime_publications.dependency_rule_lineage IS
  'Readiness lineage from construction dependency replay and approved governance candidates; consumers must ignore runtime_rolled_back publications.';

NOTIFY pgrst, 'reload schema';
