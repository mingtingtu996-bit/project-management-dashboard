-- v1.4.22.3 metric runtime publication boundary.
-- This stores governed metric-caliber runtime publications and rollback events.
-- It does not write metric_value_snapshots.
-- It does not write project_daily_snapshot.
-- It does not write projects.
-- It does not write algorithm_seed_records.
-- It does not write algorithm_seed_versions.

CREATE TABLE IF NOT EXISTS public.metric_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  metric_caliber_version_id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  runtime_publication_status TEXT NOT NULL
    CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back')),
  metric_lineage JSONB NOT NULL,
  rollback_target TEXT NOT NULL,
  rollback_execution JSONB NULL,
  rolled_back_at TIMESTAMPTZ NULL,
  producer_contract JSONB NOT NULL,
  snapshot_contract JSONB NOT NULL,
  consumer_contracts JSONB NOT NULL DEFAULT '[]'::jsonb,
  impact_monitoring JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (publication_key, company_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_metric_runtime_publications_scope
  ON public.metric_runtime_publications(
    company_id,
    project_id,
    metric_key,
    runtime_publication_status,
    published_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_metric_runtime_publications_rollback
  ON public.metric_runtime_publications(
    company_id,
    rollback_target,
    runtime_publication_status
  );

CREATE TABLE IF NOT EXISTS public.metric_runtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('metric_runtime_publication', 'rollback_execution', 'impact_monitoring')),
  event_status TEXT NOT NULL,
  source_publication_key TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metric_runtime_events_source
  ON public.metric_runtime_events(
    company_id,
    source_publication_key,
    event_type,
    executed_at DESC
  );

ALTER TABLE public.metric_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_runtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metric_runtime_publications_select_company_admin
  ON public.metric_runtime_publications;
CREATE POLICY metric_runtime_publications_select_company_admin
  ON public.metric_runtime_publications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = metric_runtime_publications.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS metric_runtime_publications_write_service_role
  ON public.metric_runtime_publications;
CREATE POLICY metric_runtime_publications_write_service_role
  ON public.metric_runtime_publications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS metric_runtime_events_select_company_admin
  ON public.metric_runtime_events;
CREATE POLICY metric_runtime_events_select_company_admin
  ON public.metric_runtime_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = metric_runtime_events.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS metric_runtime_events_write_service_role
  ON public.metric_runtime_events;
CREATE POLICY metric_runtime_events_write_service_role
  ON public.metric_runtime_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.metric_runtime_publications IS
  'v1.4.22.3 governed metric-caliber runtime publications. This table is the runtime publication/audit boundary and does not write metric_value_snapshots, project_daily_snapshot, projects, or algorithm seed runtime.';

COMMENT ON COLUMN public.metric_runtime_publications.metric_lineage IS
  'Readiness lineage from metric producer, snapshot persistence, and dashboard consumer contracts; consumers must ignore runtime_rolled_back publications.';

NOTIFY pgrst, 'reload schema';
