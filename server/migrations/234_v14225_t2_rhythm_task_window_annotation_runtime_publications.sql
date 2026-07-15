-- v1.4.22.5 T2 rhythm task-window annotation runtime publication boundary.
-- This stores governed runtime application records for approved T2 task-window
-- annotation packages after manual review and release-exit handoff. The domain
-- writer may patch tasks.standard_task_metadata with T2 window metadata only.

CREATE TABLE IF NOT EXISTS public.t2_rhythm_task_window_annotation_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL UNIQUE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  release_handoff_candidate_event_id TEXT NOT NULL,
  source_candidate_event_id TEXT NOT NULL,
  approval_candidate_event_id TEXT NOT NULL,
  runtime_publication_status TEXT NOT NULL
    CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back')),
  patched_task_count INTEGER NOT NULL DEFAULT 0,
  metadata_patches JSONB NOT NULL DEFAULT '[]'::jsonb,
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

CREATE INDEX IF NOT EXISTS idx_t2_rhythm_task_window_annotation_runtime_project
  ON public.t2_rhythm_task_window_annotation_runtime_publications(
    project_id,
    runtime_publication_status,
    published_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_t2_rhythm_task_window_annotation_runtime_rollback
  ON public.t2_rhythm_task_window_annotation_runtime_publications(
    rollback_target,
    runtime_publication_status
  );

CREATE TABLE IF NOT EXISTS public.t2_rhythm_task_window_annotation_runtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('task_window_annotation_runtime_apply', 'rollback_execution', 'impact_monitoring')),
  event_status TEXT NOT NULL,
  source_publication_key TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_t2_rhythm_task_window_annotation_runtime_events_source
  ON public.t2_rhythm_task_window_annotation_runtime_events(
    source_publication_key,
    event_type,
    executed_at DESC
  );

ALTER TABLE public.t2_rhythm_task_window_annotation_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.t2_rhythm_task_window_annotation_runtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS t2_rhythm_task_window_annotation_runtime_publications_select_admin
  ON public.t2_rhythm_task_window_annotation_runtime_publications;
CREATE POLICY t2_rhythm_task_window_annotation_runtime_publications_select_admin
  ON public.t2_rhythm_task_window_annotation_runtime_publications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = t2_rhythm_task_window_annotation_runtime_publications.company_id
        AND cm.role IN ('owner', 'admin')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS t2_rhythm_task_window_annotation_runtime_publications_write_service_role
  ON public.t2_rhythm_task_window_annotation_runtime_publications;
CREATE POLICY t2_rhythm_task_window_annotation_runtime_publications_write_service_role
  ON public.t2_rhythm_task_window_annotation_runtime_publications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.t2_rhythm_task_window_annotation_runtime_publications TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS t2_rhythm_task_window_annotation_runtime_publications_backend_runtime
  ON public.t2_rhythm_task_window_annotation_runtime_publications;
CREATE POLICY t2_rhythm_task_window_annotation_runtime_publications_backend_runtime
  ON public.t2_rhythm_task_window_annotation_runtime_publications
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

DROP POLICY IF EXISTS t2_rhythm_task_window_annotation_runtime_events_select_admin
  ON public.t2_rhythm_task_window_annotation_runtime_events;
CREATE POLICY t2_rhythm_task_window_annotation_runtime_events_select_admin
  ON public.t2_rhythm_task_window_annotation_runtime_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.t2_rhythm_task_window_annotation_runtime_publications p
      JOIN public.company_members cm ON cm.company_id = p.company_id
      WHERE p.publication_key = t2_rhythm_task_window_annotation_runtime_events.source_publication_key
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS t2_rhythm_task_window_annotation_runtime_events_write_service_role
  ON public.t2_rhythm_task_window_annotation_runtime_events;
CREATE POLICY t2_rhythm_task_window_annotation_runtime_events_write_service_role
  ON public.t2_rhythm_task_window_annotation_runtime_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.t2_rhythm_task_window_annotation_runtime_events TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS t2_rhythm_task_window_annotation_runtime_events_backend_runtime
  ON public.t2_rhythm_task_window_annotation_runtime_events;
CREATE POLICY t2_rhythm_task_window_annotation_runtime_events_backend_runtime
  ON public.t2_rhythm_task_window_annotation_runtime_events
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

COMMENT ON TABLE public.t2_rhythm_task_window_annotation_runtime_publications IS
  'Governed runtime application records for approved T2 rhythm task-window annotation packages. Runtime application may patch tasks.standard_task_metadata with T2 window metadata only; it does not write task_dependencies and does not write plan dates, baselines, seeds, critical-path facts, or acceleration drafts.';

COMMENT ON COLUMN public.t2_rhythm_task_window_annotation_runtime_publications.metadata_patches IS
  'Approved task-level T2 window metadata patches. Used to make the next read-only replay diagnostic eligible to consume task actual rows; not itself replay admission or template publication.';

NOTIFY pgrst, 'reload schema';
