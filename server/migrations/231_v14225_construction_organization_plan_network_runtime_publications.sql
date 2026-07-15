-- v1.4.22.5 construction organization plan-network runtime publication boundary.
-- This stores governed runtime application records for approved construction organization
-- plan-network drafts after release-exit handoff. The domain writer may append governed
-- task_dependencies edges, but this table is the audit/release/rollback boundary.

CREATE TABLE IF NOT EXISTS public.construction_organization_plan_network_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL UNIQUE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  draft_network_key TEXT NOT NULL,
  release_handoff_candidate_event_id TEXT NOT NULL,
  runtime_publication_status TEXT NOT NULL
    CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back')),
  applied_dependency_count INTEGER NOT NULL DEFAULT 0,
  applied_dependency_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  release_lineage JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_target TEXT NOT NULL,
  rollback_execution JSONB NULL,
  impact_monitoring JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  published_by_user_id TEXT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_construction_org_plan_network_runtime_project
  ON public.construction_organization_plan_network_runtime_publications(
    project_id,
    runtime_publication_status,
    published_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_construction_org_plan_network_runtime_rollback
  ON public.construction_organization_plan_network_runtime_publications(
    rollback_target,
    runtime_publication_status
  );

CREATE TABLE IF NOT EXISTS public.construction_organization_plan_network_runtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('plan_network_runtime_apply', 'rollback_execution', 'impact_monitoring')),
  event_status TEXT NOT NULL,
  source_publication_key TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_construction_org_plan_network_runtime_events_source
  ON public.construction_organization_plan_network_runtime_events(
    source_publication_key,
    event_type,
    executed_at DESC
  );

ALTER TABLE public.construction_organization_plan_network_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_organization_plan_network_runtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS construction_org_plan_network_runtime_publications_select_admin
  ON public.construction_organization_plan_network_runtime_publications;
CREATE POLICY construction_org_plan_network_runtime_publications_select_admin
  ON public.construction_organization_plan_network_runtime_publications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = construction_organization_plan_network_runtime_publications.company_id
        AND cm.role IN ('owner', 'admin')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS construction_org_plan_network_runtime_publications_write_service_role
  ON public.construction_organization_plan_network_runtime_publications;
CREATE POLICY construction_org_plan_network_runtime_publications_write_service_role
  ON public.construction_organization_plan_network_runtime_publications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.construction_organization_plan_network_runtime_publications TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS construction_org_plan_network_runtime_publications_backend_runtime
  ON public.construction_organization_plan_network_runtime_publications;
CREATE POLICY construction_org_plan_network_runtime_publications_backend_runtime
  ON public.construction_organization_plan_network_runtime_publications
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

DROP POLICY IF EXISTS construction_org_plan_network_runtime_events_select_admin
  ON public.construction_organization_plan_network_runtime_events;
CREATE POLICY construction_org_plan_network_runtime_events_select_admin
  ON public.construction_organization_plan_network_runtime_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.construction_organization_plan_network_runtime_publications p
      JOIN public.company_members cm ON cm.company_id = p.company_id
      WHERE p.publication_key = construction_organization_plan_network_runtime_events.source_publication_key
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS construction_org_plan_network_runtime_events_write_service_role
  ON public.construction_organization_plan_network_runtime_events;
CREATE POLICY construction_org_plan_network_runtime_events_write_service_role
  ON public.construction_organization_plan_network_runtime_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.construction_organization_plan_network_runtime_events TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS construction_org_plan_network_runtime_events_backend_runtime
  ON public.construction_organization_plan_network_runtime_events;
CREATE POLICY construction_org_plan_network_runtime_events_backend_runtime
  ON public.construction_organization_plan_network_runtime_events
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

COMMENT ON TABLE public.construction_organization_plan_network_runtime_publications IS
  'Governed runtime application records for construction organization plan-network drafts. Runtime application may append task_dependencies with source_type=construction_organization_plan_network, but never writes plan dates, baseline, seed, task facts, acceleration drafts, or critical-path facts.';

COMMENT ON COLUMN public.construction_organization_plan_network_runtime_publications.release_lineage IS
  'Lineage from construction organization scenario candidate, manual review handoff, manual approval, release-exit handoff, and bounded E1/E3/E5 evidence.';

NOTIFY pgrst, 'reload schema';
