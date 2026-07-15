-- v1.4.23.1 T2 rhythm schedule runtime publication boundary.
-- This is the production runtime surface after verified release closure, explicit
-- manual/governed auto-publish approval, and phase-1 network evaluation. It may
-- materialize T2-owned task_dependencies and patch mapped task plan dates, but it
-- does not write seeds, baselines, critical-path facts, or acceleration drafts.

CREATE TABLE IF NOT EXISTS public.t2_rhythm_schedule_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL UNIQUE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  candidate_id TEXT NOT NULL,
  selected_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  release_artifact JSONB NOT NULL DEFAULT '{}'::jsonb,
  release_artifact_verification JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_publication_status TEXT NOT NULL
    CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back')),
  applied_dependency_count INTEGER NOT NULL DEFAULT 0,
  applied_plan_date_patch_count INTEGER NOT NULL DEFAULT 0,
  applied_dependency_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  applied_plan_date_patches JSONB NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_t2_rhythm_schedule_runtime_project
  ON public.t2_rhythm_schedule_runtime_publications(
    project_id,
    runtime_publication_status,
    published_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_t2_rhythm_schedule_runtime_rollback
  ON public.t2_rhythm_schedule_runtime_publications(
    rollback_target,
    runtime_publication_status
  );

CREATE TABLE IF NOT EXISTS public.t2_rhythm_schedule_runtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('schedule_runtime_apply', 'rollback_execution', 'impact_monitoring')),
  event_status TEXT NOT NULL,
  source_publication_key TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_t2_rhythm_schedule_runtime_events_source
  ON public.t2_rhythm_schedule_runtime_events(
    source_publication_key,
    event_type,
    executed_at DESC
  );

ALTER TABLE public.t2_rhythm_schedule_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t2_rhythm_schedule_runtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS t2_rhythm_schedule_runtime_publications_select_admin
  ON public.t2_rhythm_schedule_runtime_publications;
CREATE POLICY t2_rhythm_schedule_runtime_publications_select_admin
  ON public.t2_rhythm_schedule_runtime_publications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = t2_rhythm_schedule_runtime_publications.company_id
        AND cm.role IN ('owner', 'admin')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS t2_rhythm_schedule_runtime_publications_write_service_role
  ON public.t2_rhythm_schedule_runtime_publications;
CREATE POLICY t2_rhythm_schedule_runtime_publications_write_service_role
  ON public.t2_rhythm_schedule_runtime_publications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.t2_rhythm_schedule_runtime_publications TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS t2_rhythm_schedule_runtime_publications_backend_runtime
  ON public.t2_rhythm_schedule_runtime_publications;
CREATE POLICY t2_rhythm_schedule_runtime_publications_backend_runtime
  ON public.t2_rhythm_schedule_runtime_publications
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

DROP POLICY IF EXISTS t2_rhythm_schedule_runtime_events_select_admin
  ON public.t2_rhythm_schedule_runtime_events;
CREATE POLICY t2_rhythm_schedule_runtime_events_select_admin
  ON public.t2_rhythm_schedule_runtime_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.t2_rhythm_schedule_runtime_publications p
      JOIN public.company_members cm ON cm.company_id = p.company_id
      WHERE p.publication_key = t2_rhythm_schedule_runtime_events.source_publication_key
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS t2_rhythm_schedule_runtime_events_write_service_role
  ON public.t2_rhythm_schedule_runtime_events;
CREATE POLICY t2_rhythm_schedule_runtime_events_write_service_role
  ON public.t2_rhythm_schedule_runtime_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.t2_rhythm_schedule_runtime_events TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS t2_rhythm_schedule_runtime_events_backend_runtime
  ON public.t2_rhythm_schedule_runtime_events;
CREATE POLICY t2_rhythm_schedule_runtime_events_backend_runtime
  ON public.t2_rhythm_schedule_runtime_events
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

COMMENT ON TABLE public.t2_rhythm_schedule_runtime_publications IS
  'Governed runtime publication records for T2 rhythm schedule assets. Runtime application may write T2-owned task_dependencies and patch mapped task planned_start_date/planned_end_date after verified release closure and explicit runtime approval; it never writes seeds, baselines, critical-path facts, or acceleration drafts.';

COMMENT ON COLUMN public.t2_rhythm_schedule_runtime_publications.applied_plan_date_patches IS
  'Plan-date patches with previous task date snapshots for rollback. Only mapped T2 phase-1 network nodes may be patched.';

NOTIFY pgrst, 'reload schema';
