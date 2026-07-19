-- Unified governed runtime payloads for the six duration-learning asset families.
-- Cold-start seeds and templates remain valid fallbacks. Learned overlays enter
-- this boundary only after replay/policy gates and remain reversible.
--
-- Legacy WBS runtime rows are archived as default-master-plan lineage only. They
-- are deliberately not backfilled as learned six-family publications.

BEGIN;

DO $$
DECLARE
  required_relation TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 315';
  END IF;

  FOREACH required_relation IN ARRAY ARRAY[
    'public.wbs_template_runtime_publications',
    'public.wbs_template_runtime_events',
    'public.construction_dependency_rule_runtime_publications',
    'public.construction_dependency_rule_runtime_events'
  ] LOOP
    IF to_regclass(required_relation) IS NULL THEN
      RAISE EXCEPTION 'duration_learning_legacy_runtime_source_relation_missing:%', required_relation;
    END IF;
  END LOOP;
END
$$;

-- Hold a stable source snapshot while the archive and its fingerprints are built.
LOCK TABLE public.wbs_template_runtime_publications IN SHARE MODE;
LOCK TABLE public.wbs_template_runtime_events IN SHARE MODE;
LOCK TABLE public.construction_dependency_rule_runtime_publications IN SHARE MODE;
LOCK TABLE public.construction_dependency_rule_runtime_events IN SHARE MODE;

CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_key TEXT NOT NULL,
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
  CONSTRAINT duration_learning_runtime_publications_publication_key_key
    UNIQUE (publication_key),
  CONSTRAINT duration_learning_runtime_publications_identity_key
    UNIQUE (publication_key, asset_key, artifact_key),
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

-- This append-only relation is the trusted consumption source. Business-owned
-- JSON metadata cannot impersonate publication, artifact or applied-day lineage.
CREATE TABLE IF NOT EXISTS public.duration_learning_runtime_consumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumption_key TEXT NOT NULL UNIQUE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  publication_key TEXT NOT NULL,
  asset_key TEXT NOT NULL,
  artifact_key TEXT NOT NULL,
  consumer_key TEXT NOT NULL CHECK (NULLIF(btrim(consumer_key), '') IS NOT NULL),
  consumer_surface TEXT NOT NULL CHECK (NULLIF(btrim(consumer_surface), '') IS NOT NULL),
  task_id UUID NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  baseline_item_id UUID NULL REFERENCES public.task_baseline_items(id) ON DELETE CASCADE,
  generation_batch_id TEXT NULL
    CHECK (generation_batch_id IS NULL OR NULLIF(btrim(generation_batch_id), '') IS NOT NULL),
  template_id TEXT NULL CHECK (template_id IS NULL OR NULLIF(btrim(template_id), '') IS NOT NULL),
  duration_day_basis TEXT NOT NULL DEFAULT 'construction_production_day',
  applied_duration_days NUMERIC(12,4) NULL,
  source_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  consumption_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duration_learning_runtime_consumptions_publication_identity_fkey
    FOREIGN KEY (publication_key, asset_key, artifact_key)
    REFERENCES public.duration_learning_runtime_publications
      (publication_key, asset_key, artifact_key)
    ON DELETE CASCADE,
  CONSTRAINT duration_learning_runtime_consumptions_subject_consistency CHECK (
    (
      task_id IS NOT NULL
      AND baseline_item_id IS NULL
    )
    OR (
      task_id IS NULL
      AND baseline_item_id IS NOT NULL
    )
  ),
  CONSTRAINT duration_learning_runtime_consumptions_duration_day_basis_check
    CHECK (duration_day_basis = 'construction_production_day'),
  CONSTRAINT duration_learning_runtime_consumptions_applied_days_check
    CHECK (applied_duration_days IS NULL OR applied_duration_days > 0),
  CONSTRAINT duration_learning_runtime_consumptions_source_evidence_refs_check
    CHECK (jsonb_typeof(source_evidence_refs) = 'array'),
  CONSTRAINT duration_learning_runtime_consumptions_context_check
    CHECK (jsonb_typeof(consumption_context) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_consumptions_project_subject
  ON public.duration_learning_runtime_consumptions (
    company_id,
    project_id,
    task_id,
    baseline_item_id,
    consumed_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_duration_learning_runtime_consumptions_publication
  ON public.duration_learning_runtime_consumptions (
    publication_key,
    asset_key,
    artifact_key,
    consumer_key,
    consumed_at DESC
  );

-- Generic row archive retains exact JSON rows for rollback. The discriminator
-- prevents unrelated product data from being smuggled into this boundary.
CREATE TABLE IF NOT EXISTS public.duration_learning_legacy_runtime_row_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_relation TEXT NOT NULL
    CHECK (source_relation IN (
      'wbs_template_runtime_publications',
      'wbs_template_runtime_events',
      'construction_dependency_rule_runtime_publications',
      'construction_dependency_rule_runtime_events'
    )),
  source_row_id UUID NOT NULL,
  company_id UUID NULL,
  project_id UUID NULL,
  source_row JSONB NOT NULL CHECK (jsonb_typeof(source_row) = 'object'),
  source_row_sha256 TEXT NOT NULL CHECK (source_row_sha256 ~ '^[a-f0-9]{64}$'),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duration_learning_legacy_runtime_row_archive_source_key
    UNIQUE (source_relation, source_row_id)
);

CREATE INDEX IF NOT EXISTS idx_duration_learning_legacy_runtime_row_archive_scope
  ON public.duration_learning_legacy_runtime_row_archive (
    source_relation,
    company_id,
    project_id,
    source_row_id
  );

-- No unified publication key exists here by design. These rows retain only
-- legacy default-master-plan source and consumer lineage.
CREATE TABLE IF NOT EXISTS public.duration_learning_legacy_default_master_plan_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_source_relation TEXT NOT NULL DEFAULT 'wbs_template_runtime_publications'
    CHECK (legacy_source_relation = 'wbs_template_runtime_publications'),
  legacy_source_id UUID NOT NULL,
  legacy_publication_key TEXT NOT NULL,
  legacy_asset_kind TEXT NOT NULL CHECK (legacy_asset_kind = 'default_master_plan'),
  legacy_asset_version_id TEXT NOT NULL,
  company_id UUID NOT NULL,
  project_id UUID NULL,
  legacy_runtime_publication_status TEXT NOT NULL,
  legacy_runtime_lineage JSONB NOT NULL,
  legacy_rollback_target TEXT NOT NULL,
  legacy_rollback_execution JSONB NULL,
  legacy_impact_monitoring JSONB NOT NULL,
  legacy_published_at TIMESTAMPTZ NOT NULL,
  mapping_kind TEXT NOT NULL DEFAULT 'legacy_default_master_plan_source_consumer_lineage'
    CHECK (mapping_kind = 'legacy_default_master_plan_source_consumer_lineage'),
  consumer_lineage JSONB NOT NULL CHECK (jsonb_typeof(consumer_lineage) = 'object'),
  source_row_sha256 TEXT NOT NULL CHECK (source_row_sha256 ~ '^[a-f0-9]{64}$'),
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT duration_learning_legacy_default_master_plan_mappings_source_key
    UNIQUE (legacy_source_relation, legacy_source_id),
  CONSTRAINT duration_learning_legacy_default_master_plan_mappings_archive_fkey
    FOREIGN KEY (legacy_source_relation, legacy_source_id)
    REFERENCES public.duration_learning_legacy_runtime_row_archive
      (source_relation, source_row_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_duration_learning_legacy_default_master_plan_scope
  ON public.duration_learning_legacy_default_master_plan_mappings (
    company_id,
    project_id,
    legacy_runtime_publication_status,
    legacy_published_at DESC
  );

CREATE TABLE IF NOT EXISTS public.duration_learning_legacy_runtime_retirement_state (
  retirement_key TEXT PRIMARY KEY,
  retirement_status TEXT NOT NULL
    CHECK (retirement_status IN (
      'archived_ready_for_explicit_322_authorization',
      'archived_blocked',
      'retired_readback_complete',
      'restored_readback_complete'
    )),
  source_wbs_publication_count INTEGER NOT NULL CHECK (source_wbs_publication_count >= 0),
  source_wbs_event_count INTEGER NOT NULL CHECK (source_wbs_event_count >= 0),
  source_dependency_publication_count INTEGER NOT NULL
    CHECK (source_dependency_publication_count >= 0),
  source_dependency_event_count INTEGER NOT NULL CHECK (source_dependency_event_count >= 0),
  unsupported_wbs_publication_count INTEGER NOT NULL
    CHECK (unsupported_wbs_publication_count >= 0),
  archived_row_count INTEGER NOT NULL CHECK (archived_row_count >= 0),
  default_master_plan_mapping_count INTEGER NOT NULL
    CHECK (default_master_plan_mapping_count >= 0),
  source_data_fingerprint TEXT NOT NULL CHECK (source_data_fingerprint ~ '^[a-f0-9]{64}$'),
  archive_data_fingerprint TEXT NOT NULL CHECK (archive_data_fingerprint ~ '^[a-f0-9]{64}$'),
  mapping_fingerprint TEXT NOT NULL CHECK (mapping_fingerprint ~ '^[a-f0-9]{64}$'),
  manifest_fingerprint TEXT NOT NULL CHECK (manifest_fingerprint ~ '^[a-f0-9]{64}$'),
  source_tables_present BOOLEAN NOT NULL DEFAULT TRUE,
  retirement_authorization_ref TEXT NULL,
  retirement_backup_sha256 TEXT NULL,
  retired_source_data_fingerprint TEXT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ NULL,
  restored_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.duration_learning_legacy_runtime_row_archive (
  source_relation,
  source_row_id,
  company_id,
  project_id,
  source_row,
  source_row_sha256
)
SELECT
  'wbs_template_runtime_publications',
  source_row.id,
  source_row.company_id,
  source_row.project_id,
  to_jsonb(source_row),
  encode(digest(convert_to(to_jsonb(source_row)::text, 'UTF8'), 'sha256'), 'hex')
FROM public.wbs_template_runtime_publications source_row
ON CONFLICT (source_relation, source_row_id) DO NOTHING;

INSERT INTO public.duration_learning_legacy_runtime_row_archive (
  source_relation,
  source_row_id,
  company_id,
  project_id,
  source_row,
  source_row_sha256
)
SELECT
  'wbs_template_runtime_events',
  source_row.id,
  source_row.company_id,
  source_row.project_id,
  to_jsonb(source_row),
  encode(digest(convert_to(to_jsonb(source_row)::text, 'UTF8'), 'sha256'), 'hex')
FROM public.wbs_template_runtime_events source_row
ON CONFLICT (source_relation, source_row_id) DO NOTHING;

INSERT INTO public.duration_learning_legacy_runtime_row_archive (
  source_relation,
  source_row_id,
  source_row,
  source_row_sha256
)
SELECT
  'construction_dependency_rule_runtime_publications',
  source_row.id,
  to_jsonb(source_row),
  encode(digest(convert_to(to_jsonb(source_row)::text, 'UTF8'), 'sha256'), 'hex')
FROM public.construction_dependency_rule_runtime_publications source_row
ON CONFLICT (source_relation, source_row_id) DO NOTHING;

INSERT INTO public.duration_learning_legacy_runtime_row_archive (
  source_relation,
  source_row_id,
  source_row,
  source_row_sha256
)
SELECT
  'construction_dependency_rule_runtime_events',
  source_row.id,
  to_jsonb(source_row),
  encode(digest(convert_to(to_jsonb(source_row)::text, 'UTF8'), 'sha256'), 'hex')
FROM public.construction_dependency_rule_runtime_events source_row
ON CONFLICT (source_relation, source_row_id) DO NOTHING;

INSERT INTO public.duration_learning_legacy_default_master_plan_mappings (
  legacy_source_relation,
  legacy_source_id,
  legacy_publication_key,
  legacy_asset_kind,
  legacy_asset_version_id,
  company_id,
  project_id,
  legacy_runtime_publication_status,
  legacy_runtime_lineage,
  legacy_rollback_target,
  legacy_rollback_execution,
  legacy_impact_monitoring,
  legacy_published_at,
  consumer_lineage,
  source_row_sha256
)
SELECT
  'wbs_template_runtime_publications',
  source_row.id,
  source_row.publication_key,
  source_row.asset_kind,
  source_row.asset_version_id,
  source_row.company_id,
  source_row.project_id,
  source_row.runtime_publication_status,
  source_row.runtime_lineage,
  source_row.rollback_target,
  source_row.rollback_execution,
  source_row.impact_monitoring,
  source_row.published_at,
  jsonb_build_object(
    'lineageKind', 'legacy_default_master_plan_source_consumer_lineage',
    'legacyPublicationKey', source_row.publication_key,
    'legacyAssetVersionId', source_row.asset_version_id,
    'companyId', source_row.company_id,
    'projectId', source_row.project_id,
    'runtimePublicationStatus', source_row.runtime_publication_status
  ),
  archive.source_row_sha256
FROM public.wbs_template_runtime_publications source_row
JOIN public.duration_learning_legacy_runtime_row_archive archive
  ON archive.source_relation = 'wbs_template_runtime_publications'
 AND archive.source_row_id = source_row.id
WHERE source_row.asset_kind = 'default_master_plan'
ON CONFLICT (legacy_source_relation, legacy_source_id) DO NOTHING;

DO $$
DECLARE
  source_wbs_publication_count INTEGER;
  source_wbs_event_count INTEGER;
  source_dependency_publication_count INTEGER;
  source_dependency_event_count INTEGER;
  unsupported_wbs_publication_count INTEGER;
  archived_row_count INTEGER;
  default_master_plan_mapping_count INTEGER;
  source_data_fingerprint TEXT;
  archive_data_fingerprint TEXT;
  mapping_fingerprint TEXT;
  manifest_fingerprint TEXT;
  retirement_status TEXT;
BEGIN
  SELECT COUNT(*)::INTEGER INTO source_wbs_publication_count
  FROM public.wbs_template_runtime_publications;
  SELECT COUNT(*)::INTEGER INTO source_wbs_event_count
  FROM public.wbs_template_runtime_events;
  SELECT COUNT(*)::INTEGER INTO source_dependency_publication_count
  FROM public.construction_dependency_rule_runtime_publications;
  SELECT COUNT(*)::INTEGER INTO source_dependency_event_count
  FROM public.construction_dependency_rule_runtime_events;
  SELECT COUNT(*)::INTEGER INTO unsupported_wbs_publication_count
  FROM public.wbs_template_runtime_publications
  WHERE asset_kind <> 'default_master_plan';

  SELECT COUNT(*)::INTEGER INTO archived_row_count
  FROM public.duration_learning_legacy_runtime_row_archive;
  SELECT COUNT(*)::INTEGER INTO default_master_plan_mapping_count
  FROM public.duration_learning_legacy_default_master_plan_mappings
  WHERE mapping_kind = 'legacy_default_master_plan_source_consumer_lineage';

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
    INTO source_data_fingerprint;

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
    INTO archive_data_fingerprint
    FROM public.duration_learning_legacy_runtime_row_archive archive;

  SELECT encode(
           digest(
             convert_to(
               COALESCE(
                 jsonb_agg(
                   to_jsonb(mapping)
                     - 'id'
                     - 'archived_at'
                   ORDER BY mapping.legacy_source_id
                 ),
                 '[]'::jsonb
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
    INTO mapping_fingerprint
    FROM public.duration_learning_legacy_default_master_plan_mappings mapping;

  IF source_data_fingerprint <> archive_data_fingerprint THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_archive_fingerprint_mismatch';
  END IF;

  IF archived_row_count <>
    source_wbs_publication_count
    + source_wbs_event_count
    + source_dependency_publication_count
    + source_dependency_event_count
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_archive_count_mismatch';
  END IF;

  IF default_master_plan_mapping_count + unsupported_wbs_publication_count
    <> source_wbs_publication_count
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_mapping_count_mismatch';
  END IF;

  retirement_status := CASE
    WHEN unsupported_wbs_publication_count = 0
      AND source_dependency_publication_count = 0
      AND source_dependency_event_count = 0
      AND default_master_plan_mapping_count = source_wbs_publication_count
    THEN 'archived_ready_for_explicit_322_authorization'
    ELSE 'archived_blocked'
  END;

  SELECT encode(
           digest(
             convert_to(
               jsonb_build_object(
                 'retirementKey', 'duration_learning_legacy_runtime_v1',
                 'retirementStatus', retirement_status,
                 'sourceWbsPublicationCount', source_wbs_publication_count,
                 'sourceWbsEventCount', source_wbs_event_count,
                 'sourceDependencyPublicationCount', source_dependency_publication_count,
                 'sourceDependencyEventCount', source_dependency_event_count,
                 'unsupportedWbsPublicationCount', unsupported_wbs_publication_count,
                 'archivedRowCount', archived_row_count,
                 'defaultMasterPlanMappingCount', default_master_plan_mapping_count,
                 'sourceDataFingerprint', source_data_fingerprint,
                 'archiveDataFingerprint', archive_data_fingerprint,
                 'mappingFingerprint', mapping_fingerprint
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
    INTO manifest_fingerprint;

  INSERT INTO public.duration_learning_legacy_runtime_retirement_state (
    retirement_key,
    retirement_status,
    source_wbs_publication_count,
    source_wbs_event_count,
    source_dependency_publication_count,
    source_dependency_event_count,
    unsupported_wbs_publication_count,
    archived_row_count,
    default_master_plan_mapping_count,
    source_data_fingerprint,
    archive_data_fingerprint,
    mapping_fingerprint,
    manifest_fingerprint,
    source_tables_present
  ) VALUES (
    'duration_learning_legacy_runtime_v1',
    retirement_status,
    source_wbs_publication_count,
    source_wbs_event_count,
    source_dependency_publication_count,
    source_dependency_event_count,
    unsupported_wbs_publication_count,
    archived_row_count,
    default_master_plan_mapping_count,
    source_data_fingerprint,
    archive_data_fingerprint,
    mapping_fingerprint,
    manifest_fingerprint,
    TRUE
  )
  ON CONFLICT (retirement_key) DO UPDATE SET
    retirement_status = EXCLUDED.retirement_status,
    source_wbs_publication_count = EXCLUDED.source_wbs_publication_count,
    source_wbs_event_count = EXCLUDED.source_wbs_event_count,
    source_dependency_publication_count = EXCLUDED.source_dependency_publication_count,
    source_dependency_event_count = EXCLUDED.source_dependency_event_count,
    unsupported_wbs_publication_count = EXCLUDED.unsupported_wbs_publication_count,
    archived_row_count = EXCLUDED.archived_row_count,
    default_master_plan_mapping_count = EXCLUDED.default_master_plan_mapping_count,
    source_data_fingerprint = EXCLUDED.source_data_fingerprint,
    archive_data_fingerprint = EXCLUDED.archive_data_fingerprint,
    mapping_fingerprint = EXCLUDED.mapping_fingerprint,
    manifest_fingerprint = EXCLUDED.manifest_fingerprint,
    source_tables_present = TRUE,
    retirement_authorization_ref = NULL,
    retirement_backup_sha256 = NULL,
    retired_source_data_fingerprint = NULL,
    retired_at = NULL,
    restored_at = NULL,
    updated_at = NOW();
END
$$;

ALTER TABLE public.duration_learning_runtime_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_publications FORCE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_runtime_consumptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_legacy_runtime_row_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_legacy_runtime_row_archive FORCE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_legacy_default_master_plan_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_legacy_default_master_plan_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_legacy_runtime_retirement_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_legacy_runtime_retirement_state FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_learning_runtime_publications FROM PUBLIC;
REVOKE ALL ON TABLE public.duration_learning_runtime_consumptions FROM PUBLIC;
REVOKE ALL ON TABLE public.duration_learning_legacy_runtime_row_archive FROM PUBLIC;
REVOKE ALL ON TABLE public.duration_learning_legacy_default_master_plan_mappings FROM PUBLIC;
REVOKE ALL ON TABLE public.duration_learning_legacy_runtime_retirement_state FROM PUBLIC;

DO $$
DECLARE
  role_name TEXT;
  relation_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      FOREACH relation_name IN ARRAY ARRAY[
        'duration_learning_runtime_publications',
        'duration_learning_runtime_consumptions',
        'duration_learning_legacy_runtime_row_archive',
        'duration_learning_legacy_default_master_plan_mappings',
        'duration_learning_legacy_runtime_retirement_state'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', relation_name, role_name);
      END LOOP;
    END IF;
  END LOOP;
END
$$;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.duration_learning_runtime_publications
  TO workbuddy_runtime;
REVOKE DELETE ON TABLE public.duration_learning_runtime_publications
  FROM workbuddy_runtime;
GRANT SELECT, INSERT ON TABLE public.duration_learning_runtime_consumptions
  TO workbuddy_runtime;
REVOKE UPDATE, DELETE ON TABLE public.duration_learning_runtime_consumptions
  FROM workbuddy_runtime;
GRANT SELECT ON TABLE public.duration_learning_legacy_runtime_row_archive
  TO workbuddy_runtime;
GRANT SELECT ON TABLE public.duration_learning_legacy_default_master_plan_mappings
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

DROP POLICY IF EXISTS duration_learning_runtime_consumptions_backend_runtime_select
  ON public.duration_learning_runtime_consumptions;
CREATE POLICY duration_learning_runtime_consumptions_backend_runtime_select
  ON public.duration_learning_runtime_consumptions
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS duration_learning_runtime_consumptions_backend_runtime_insert
  ON public.duration_learning_runtime_consumptions;
CREATE POLICY duration_learning_runtime_consumptions_backend_runtime_insert
  ON public.duration_learning_runtime_consumptions
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_learning_runtime_consumptions.project_id
        AND project.company_id = duration_learning_runtime_consumptions.company_id
    )
    AND (
      (duration_learning_runtime_consumptions.task_id IS NOT NULL AND EXISTS (
          SELECT 1
          FROM public.tasks task
          WHERE task.id = duration_learning_runtime_consumptions.task_id
            AND task.project_id = duration_learning_runtime_consumptions.project_id
        ))
      OR (
        duration_learning_runtime_consumptions.baseline_item_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.task_baseline_items baseline_item
          WHERE baseline_item.id = duration_learning_runtime_consumptions.baseline_item_id
            AND baseline_item.project_id = duration_learning_runtime_consumptions.project_id
        )
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.duration_learning_runtime_publications publication
      WHERE publication.publication_key = duration_learning_runtime_consumptions.publication_key
        AND publication.asset_key = duration_learning_runtime_consumptions.asset_key
        AND publication.artifact_key = duration_learning_runtime_consumptions.artifact_key
        AND publication.publication_stage IN ('canary', 'stable')
        AND (
          (
            publication.scope_level = 'project'
            AND publication.company_id = duration_learning_runtime_consumptions.company_id
            AND publication.project_id = duration_learning_runtime_consumptions.project_id
          )
          OR (
            publication.scope_level = 'company'
            AND publication.company_id = duration_learning_runtime_consumptions.company_id
          )
          OR (
            publication.scope_level = 'industry'
            AND publication.industry_key = NULLIF(
              duration_learning_runtime_consumptions.consumption_context ->> 'industryKey',
              ''
            )
          )
          OR publication.scope_level = 'global'
        )
    )
  );

DROP POLICY IF EXISTS duration_learning_legacy_runtime_row_archive_backend_runtime_select
  ON public.duration_learning_legacy_runtime_row_archive;
CREATE POLICY duration_learning_legacy_runtime_row_archive_backend_runtime_select
  ON public.duration_learning_legacy_runtime_row_archive
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS duration_learning_legacy_default_master_plan_mappings_backend_runtime_select
  ON public.duration_learning_legacy_default_master_plan_mappings;
CREATE POLICY duration_learning_legacy_default_master_plan_mappings_backend_runtime_select
  ON public.duration_learning_legacy_default_master_plan_mappings
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP VIEW IF EXISTS public.duration_learning_legacy_runtime_retirement_readback;
CREATE VIEW public.duration_learning_legacy_runtime_retirement_readback
WITH (security_invoker = true, security_barrier = true) AS
SELECT
  state.retirement_key,
  state.retirement_status,
  state.source_wbs_publication_count,
  state.source_wbs_event_count,
  state.source_dependency_publication_count,
  state.source_dependency_event_count,
  state.unsupported_wbs_publication_count,
  state.archived_row_count,
  state.default_master_plan_mapping_count,
  state.source_data_fingerprint,
  state.archive_data_fingerprint,
  state.mapping_fingerprint,
  state.manifest_fingerprint,
  state.source_tables_present,
  to_regclass('public.wbs_template_runtime_publications') IS NOT NULL
    AS wbs_publications_present,
  to_regclass('public.wbs_template_runtime_events') IS NOT NULL
    AS wbs_events_present,
  to_regclass('public.construction_dependency_rule_runtime_publications') IS NOT NULL
    AS dependency_publications_present,
  to_regclass('public.construction_dependency_rule_runtime_events') IS NOT NULL
    AS dependency_events_present,
  CASE
    WHEN state.retirement_status = 'retired_readback_complete'
      AND NOT state.source_tables_present
    THEN 'retired_readback_complete'
    WHEN state.retirement_status = 'restored_readback_complete'
      AND state.source_tables_present
    THEN 'restored_readback_complete'
    WHEN state.retirement_status = 'archived_ready_for_explicit_322_authorization'
      AND state.source_tables_present
    THEN 'ready_for_explicit_322_authorization'
    ELSE 'blocked'
  END AS preflight_signal,
  state.retirement_authorization_ref,
  state.retirement_backup_sha256,
  state.retired_source_data_fingerprint,
  state.archived_at,
  state.retired_at,
  state.restored_at,
  state.updated_at
FROM public.duration_learning_legacy_runtime_retirement_state state;

REVOKE ALL ON TABLE public.duration_learning_legacy_runtime_retirement_readback FROM PUBLIC;

COMMENT ON TABLE public.duration_learning_runtime_publications IS
  'Executable, scoped and reversible six-family duration-learning overlays. This table never stores task, dependency, baseline or progress facts.';
COMMENT ON TABLE public.duration_learning_runtime_consumptions IS
  'Backend-trusted append-only lineage proving which publication/artifact was applied to a task or baseline in construction-production-day units.';
COMMENT ON TABLE public.duration_learning_legacy_runtime_row_archive IS
  'Exact legacy WBS/dependency runtime rows retained for controlled 322 rollback; not learned publication data.';
COMMENT ON TABLE public.duration_learning_legacy_default_master_plan_mappings IS
  'Legacy default-master-plan source/consumer lineage only; rows are never reclassified as six-family learned publications.';
COMMENT ON COLUMN public.duration_learning_runtime_publications.runtime_payload IS
  'Validated runtime payload consumed by the owning duration or plan-network resolver.';
COMMENT ON COLUMN public.duration_learning_runtime_publications.previous_publication_key IS
  'Previously stable publication retained for atomic rollback.';

NOTIFY pgrst, 'reload schema';

COMMIT;
