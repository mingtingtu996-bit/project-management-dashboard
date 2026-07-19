-- Emergency rollback for migration 322. Exact legacy rows are restored from
-- the migration-315 archive and remain classified as legacy runtime lineage.

BEGIN;

DO $$
DECLARE
  actual_archive_fingerprint TEXT;
  expected_archive_fingerprint TEXT;
BEGIN
  IF to_regclass('public.duration_learning_legacy_runtime_row_archive') IS NULL
    OR to_regclass('public.duration_learning_legacy_default_master_plan_mappings') IS NULL
    OR to_regclass('public.duration_learning_legacy_runtime_retirement_state') IS NULL
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_rollback_archive_missing';
  END IF;
  IF to_regclass('public.wbs_template_runtime_publications') IS NOT NULL
    OR to_regclass('public.wbs_template_runtime_events') IS NOT NULL
    OR to_regclass('public.construction_dependency_rule_runtime_publications') IS NOT NULL
    OR to_regclass('public.construction_dependency_rule_runtime_events') IS NOT NULL
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_rollback_partial_schema_present';
  END IF;

  SELECT archive_data_fingerprint
  INTO expected_archive_fingerprint
  FROM public.duration_learning_legacy_runtime_retirement_state
  WHERE retirement_key = 'duration_learning_legacy_runtime_v1'
    AND retirement_status = 'retired_readback_complete'
    AND source_tables_present IS FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_rollback_state_not_retired';
  END IF;

  SELECT encode(
           digest(
             convert_to(
               jsonb_build_object(
                 'wbs_template_runtime_publications', COALESCE(
                   jsonb_agg(archive.source_row ORDER BY archive.source_row_id)
                     FILTER (WHERE archive.source_relation = 'wbs_template_runtime_publications'),
                   '[]'::jsonb
                 ),
                 'wbs_template_runtime_events', COALESCE(
                   jsonb_agg(archive.source_row ORDER BY archive.source_row_id)
                     FILTER (WHERE archive.source_relation = 'wbs_template_runtime_events'),
                   '[]'::jsonb
                 ),
                 'construction_dependency_rule_runtime_publications', COALESCE(
                   jsonb_agg(archive.source_row ORDER BY archive.source_row_id)
                     FILTER (WHERE archive.source_relation = 'construction_dependency_rule_runtime_publications'),
                   '[]'::jsonb
                 ),
                 'construction_dependency_rule_runtime_events', COALESCE(
                   jsonb_agg(archive.source_row ORDER BY archive.source_row_id)
                     FILTER (WHERE archive.source_relation = 'construction_dependency_rule_runtime_events'),
                   '[]'::jsonb
                 )
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
  INTO actual_archive_fingerprint
  FROM public.duration_learning_legacy_runtime_row_archive archive;

  IF actual_archive_fingerprint <> expected_archive_fingerprint THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_rollback_archive_fingerprint_mismatch';
  END IF;
END
$$;

CREATE TABLE public.wbs_template_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL,
  asset_kind TEXT NOT NULL,
  asset_version_id TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  runtime_publication_status TEXT NOT NULL
    CHECK (runtime_publication_status IN ('runtime_published', 'runtime_rolled_back')),
  runtime_lineage JSONB NOT NULL,
  rollback_target TEXT NOT NULL,
  rollback_execution JSONB NULL,
  rolled_back_at TIMESTAMPTZ NULL,
  impact_monitoring JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wbs_template_runtime_publications_asset_kind_check
    CHECK (asset_kind IN ('special_work_duration_seed', 'wbs_reference_days', 'default_master_plan')),
  UNIQUE (publication_key, company_id, project_id)
);

CREATE INDEX idx_wbs_template_runtime_publications_scope
  ON public.wbs_template_runtime_publications(
    company_id,
    project_id,
    asset_kind,
    runtime_publication_status,
    published_at DESC
  );
CREATE INDEX idx_wbs_template_runtime_publications_rollback
  ON public.wbs_template_runtime_publications(
    company_id,
    rollback_target,
    runtime_publication_status
  );

CREATE TABLE public.wbs_template_runtime_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('wbs_template_runtime_publication', 'rollback_execution', 'impact_monitoring')),
  event_status TEXT NOT NULL,
  source_publication_key TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_governance_only',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wbs_template_runtime_events_source
  ON public.wbs_template_runtime_events(
    company_id,
    source_publication_key,
    event_type,
    executed_at DESC
  );

CREATE TABLE public.construction_dependency_rule_runtime_publications (
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

CREATE INDEX idx_construction_dependency_rule_runtime_publications_scope
  ON public.construction_dependency_rule_runtime_publications(
    runtime_publication_status,
    dependency_rule_version_id,
    published_at DESC
  );
CREATE INDEX idx_construction_dependency_rule_runtime_publications_rollback
  ON public.construction_dependency_rule_runtime_publications(
    rollback_target,
    runtime_publication_status
  );

CREATE TABLE public.construction_dependency_rule_runtime_events (
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

CREATE INDEX idx_construction_dependency_rule_runtime_events_source
  ON public.construction_dependency_rule_runtime_events(
    source_publication_key,
    event_type,
    executed_at DESC
  );

INSERT INTO public.wbs_template_runtime_publications
SELECT (jsonb_populate_record(
  NULL::public.wbs_template_runtime_publications,
  archive.source_row
)).*
FROM public.duration_learning_legacy_runtime_row_archive archive
WHERE archive.source_relation = 'wbs_template_runtime_publications'
ORDER BY archive.source_row_id;

INSERT INTO public.wbs_template_runtime_events
SELECT (jsonb_populate_record(
  NULL::public.wbs_template_runtime_events,
  archive.source_row
)).*
FROM public.duration_learning_legacy_runtime_row_archive archive
WHERE archive.source_relation = 'wbs_template_runtime_events'
ORDER BY archive.source_row_id;

INSERT INTO public.construction_dependency_rule_runtime_publications
SELECT (jsonb_populate_record(
  NULL::public.construction_dependency_rule_runtime_publications,
  archive.source_row
)).*
FROM public.duration_learning_legacy_runtime_row_archive archive
WHERE archive.source_relation = 'construction_dependency_rule_runtime_publications'
ORDER BY archive.source_row_id;

INSERT INTO public.construction_dependency_rule_runtime_events
SELECT (jsonb_populate_record(
  NULL::public.construction_dependency_rule_runtime_events,
  archive.source_row
)).*
FROM public.duration_learning_legacy_runtime_row_archive archive
WHERE archive.source_relation = 'construction_dependency_rule_runtime_events'
ORDER BY archive.source_row_id;

DO $$
DECLARE
  actual_source_fingerprint TEXT;
  expected_source_fingerprint TEXT;
BEGIN
  SELECT source_data_fingerprint
  INTO expected_source_fingerprint
  FROM public.duration_learning_legacy_runtime_retirement_state
  WHERE retirement_key = 'duration_learning_legacy_runtime_v1';

  SELECT encode(
           digest(
             convert_to(
               jsonb_build_object(
                 'wbs_template_runtime_publications', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.wbs_template_runtime_publications source_row
                 ),
                 'wbs_template_runtime_events', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.wbs_template_runtime_events source_row
                 ),
                 'construction_dependency_rule_runtime_publications', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.construction_dependency_rule_runtime_publications source_row
                 ),
                 'construction_dependency_rule_runtime_events', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.construction_dependency_rule_runtime_events source_row
                 )
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
  INTO actual_source_fingerprint;

  IF actual_source_fingerprint <> expected_source_fingerprint THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_rollback_source_fingerprint_mismatch';
  END IF;
END
$$;

ALTER TABLE public.wbs_template_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wbs_template_runtime_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_dependency_rule_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.construction_dependency_rule_runtime_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.wbs_template_runtime_publications TO authenticated;
GRANT SELECT ON TABLE public.wbs_template_runtime_events TO authenticated;
GRANT SELECT ON TABLE public.construction_dependency_rule_runtime_publications TO authenticated;
GRANT SELECT ON TABLE public.construction_dependency_rule_runtime_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wbs_template_runtime_publications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wbs_template_runtime_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.construction_dependency_rule_runtime_publications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.construction_dependency_rule_runtime_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_publications TO workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE public.wbs_template_runtime_events TO workbuddy_runtime;

CREATE POLICY wbs_template_runtime_publications_select_company_admin
  ON public.wbs_template_runtime_publications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = wbs_template_runtime_publications.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );
CREATE POLICY wbs_template_runtime_publications_write_service_role
  ON public.wbs_template_runtime_publications
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY wbs_template_runtime_publications_backend_runtime
  ON public.wbs_template_runtime_publications
  FOR ALL TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

CREATE POLICY wbs_template_runtime_events_select_company_admin
  ON public.wbs_template_runtime_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = wbs_template_runtime_events.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );
CREATE POLICY wbs_template_runtime_events_write_service_role
  ON public.wbs_template_runtime_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY wbs_template_runtime_events_backend_runtime
  ON public.wbs_template_runtime_events
  FOR ALL TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

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
CREATE POLICY construction_dependency_rule_runtime_publications_write_service_role
  ON public.construction_dependency_rule_runtime_publications
  FOR ALL TO service_role USING (true) WITH CHECK (true);
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
CREATE POLICY construction_dependency_rule_runtime_events_write_service_role
  ON public.construction_dependency_rule_runtime_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

UPDATE public.duration_learning_legacy_runtime_retirement_state
SET
  retirement_status = 'restored_readback_complete',
  source_tables_present = TRUE,
  restored_at = transaction_timestamp(),
  updated_at = transaction_timestamp()
WHERE retirement_key = 'duration_learning_legacy_runtime_v1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.duration_learning_legacy_runtime_retirement_state
    WHERE retirement_key = 'duration_learning_legacy_runtime_v1'
      AND retirement_status = 'restored_readback_complete'
      AND source_tables_present IS TRUE
  ) THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_rollback_readback_failed';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
