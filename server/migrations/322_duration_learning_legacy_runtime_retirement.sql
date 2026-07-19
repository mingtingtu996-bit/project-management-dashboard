-- Controlled retirement for legacy WBS and dependency runtime boundaries.
-- This migration is intentionally inert during an ordinary pending sweep. An
-- operator must bind approval to the exact archive manifest, source fingerprint
-- and backup hash through the documented session settings.
-- authorization_token = sha256(UTF8(
--   '322:' || authorization_ref || ':' || backup_sha256 || ':' ||
--   data_fingerprint || ':' || manifest_fingerprint
-- )).

DO $preflight$
DECLARE
  authorization_ref TEXT := current_setting(
    'workbuddy.duration_learning_legacy_runtime_retirement.authorization_ref',
    true
  );
  authorization_token TEXT := current_setting(
    'workbuddy.duration_learning_legacy_runtime_retirement.authorization_token',
    true
  );
  backup_sha256 TEXT := current_setting(
    'workbuddy.duration_learning_legacy_runtime_retirement.backup_sha256',
    true
  );
  expected_data_fingerprint TEXT := current_setting(
    'workbuddy.duration_learning_legacy_runtime_retirement.data_fingerprint',
    true
  );
  expected_manifest_fingerprint TEXT := current_setting(
    'workbuddy.duration_learning_legacy_runtime_retirement.manifest_fingerprint',
    true
  );
  expected_authorization_token TEXT;
  actual_source_fingerprint TEXT;
  actual_archive_fingerprint TEXT;
  actual_mapping_fingerprint TEXT;
  actual_mapping_count INTEGER;
  actual_wbs_publication_count INTEGER;
  actual_wbs_event_count INTEGER;
  actual_dependency_publication_count INTEGER;
  actual_dependency_event_count INTEGER;
  actual_unsupported_wbs_count INTEGER;
  state_source_fingerprint TEXT;
  state_archive_fingerprint TEXT;
  state_mapping_fingerprint TEXT;
  state_manifest_fingerprint TEXT;
  state_wbs_publication_count INTEGER;
  state_wbs_event_count INTEGER;
  state_dependency_publication_count INTEGER;
  state_dependency_event_count INTEGER;
  state_mapping_count INTEGER;
BEGIN
  IF authorization_ref IS NULL
    OR authorization_ref !~ '^change:[A-Za-z0-9][A-Za-z0-9._:/-]{7,239}$'
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_explicit_authorization_required';
  END IF;
  IF backup_sha256 IS NULL OR backup_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_backup_required';
  END IF;
  IF expected_data_fingerprint IS NULL
    OR expected_data_fingerprint !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_fingerprint_required';
  END IF;
  IF expected_manifest_fingerprint IS NULL
    OR expected_manifest_fingerprint !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_manifest_fingerprint_required';
  END IF;
  IF authorization_token IS NULL OR authorization_token !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_authorization_token_required';
  END IF;

  expected_authorization_token := encode(
    digest(convert_to('322:' || authorization_ref || ':' || backup_sha256 || ':'
      || expected_data_fingerprint || ':' || expected_manifest_fingerprint, 'UTF8'), 'sha256'),
    'hex'
  );
  IF authorization_token <> expected_authorization_token THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_authorization_token_mismatch';
  END IF;

  IF to_regclass('public.schema_migrations') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.schema_migrations
      WHERE version = '315'
        AND filename = '315_duration_learning_runtime_publications.sql'
    )
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_315_ledger_required';
  END IF;

  IF to_regclass('public.duration_learning_runtime_publications') IS NULL
    OR to_regclass('public.duration_learning_runtime_consumptions') IS NULL
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_unified_boundary_missing';
  END IF;
  IF to_regclass('public.duration_learning_legacy_runtime_row_archive') IS NULL
    OR to_regclass('public.duration_learning_legacy_default_master_plan_mappings') IS NULL
    OR to_regclass('public.duration_learning_legacy_runtime_retirement_state') IS NULL
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_archive_boundary_missing';
  END IF;
  IF to_regclass('public.wbs_template_runtime_publications') IS NULL
    OR to_regclass('public.wbs_template_runtime_events') IS NULL
    OR to_regclass('public.construction_dependency_rule_runtime_publications') IS NULL
    OR to_regclass('public.construction_dependency_rule_runtime_events') IS NULL
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_source_relation_missing';
  END IF;

  SELECT
    state.source_data_fingerprint,
    state.archive_data_fingerprint,
    state.mapping_fingerprint,
    state.manifest_fingerprint,
    state.source_wbs_publication_count,
    state.source_wbs_event_count,
    state.source_dependency_publication_count,
    state.source_dependency_event_count,
    state.default_master_plan_mapping_count
  INTO
    state_source_fingerprint,
    state_archive_fingerprint,
    state_mapping_fingerprint,
    state_manifest_fingerprint,
    state_wbs_publication_count,
    state_wbs_event_count,
    state_dependency_publication_count,
    state_dependency_event_count,
    state_mapping_count
  FROM public.duration_learning_legacy_runtime_retirement_state state
  WHERE retirement_key = 'duration_learning_legacy_runtime_v1'
    AND retirement_status = 'archived_ready_for_explicit_322_authorization'
    AND source_tables_present IS TRUE
    AND unsupported_wbs_publication_count = 0
    AND source_dependency_publication_count = 0
    AND source_dependency_event_count = 0;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_state_not_ready';
  END IF;
  IF expected_data_fingerprint <> state_source_fingerprint
    OR expected_manifest_fingerprint <> state_manifest_fingerprint
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_authorized_identity_mismatch';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE asset_kind <> 'default_master_plan')::INTEGER
  INTO actual_wbs_publication_count, actual_unsupported_wbs_count
  FROM public.wbs_template_runtime_publications;
  SELECT COUNT(*)::INTEGER INTO actual_wbs_event_count
  FROM public.wbs_template_runtime_events;
  SELECT COUNT(*)::INTEGER INTO actual_dependency_publication_count
  FROM public.construction_dependency_rule_runtime_publications;
  SELECT COUNT(*)::INTEGER INTO actual_dependency_event_count
  FROM public.construction_dependency_rule_runtime_events;

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

  SELECT
    COUNT(*)::INTEGER,
    encode(
      digest(
        convert_to(
          COALESCE(
            jsonb_agg(
              to_jsonb(mapping) - 'id' - 'archived_at'
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
  INTO actual_mapping_count, actual_mapping_fingerprint
  FROM public.duration_learning_legacy_default_master_plan_mappings mapping
  WHERE mapping_kind = 'legacy_default_master_plan_source_consumer_lineage';

  IF actual_source_fingerprint <> state_source_fingerprint
    OR actual_source_fingerprint <> expected_data_fingerprint
    OR actual_wbs_publication_count <> state_wbs_publication_count
    OR actual_wbs_event_count <> state_wbs_event_count
    OR actual_dependency_publication_count <> state_dependency_publication_count
    OR actual_dependency_event_count <> state_dependency_event_count
    OR actual_unsupported_wbs_count <> 0
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_source_changed_after_archive';
  END IF;
  IF actual_archive_fingerprint <> state_archive_fingerprint
    OR actual_archive_fingerprint <> actual_source_fingerprint
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_archive_fingerprint_mismatch';
  END IF;
  IF actual_mapping_count <> state_mapping_count
    OR actual_mapping_count <> actual_wbs_publication_count
    OR actual_mapping_fingerprint <> state_mapping_fingerprint
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_mapping_count_mismatch';
  END IF;
END
$preflight$;

BEGIN;

LOCK TABLE public.wbs_template_runtime_publications IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.wbs_template_runtime_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.construction_dependency_rule_runtime_publications IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.construction_dependency_rule_runtime_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.duration_learning_legacy_runtime_row_archive IN SHARE MODE;
LOCK TABLE public.duration_learning_legacy_default_master_plan_mappings IN SHARE MODE;
LOCK TABLE public.duration_learning_legacy_runtime_retirement_state IN SHARE ROW EXCLUSIVE MODE;

DO $locked_revalidation$
DECLARE
  actual_source_fingerprint TEXT;
  actual_archive_fingerprint TEXT;
  source_wbs_publication_count INTEGER;
  source_wbs_event_count INTEGER;
  source_dependency_publication_count INTEGER;
  source_dependency_event_count INTEGER;
  unsupported_wbs_publication_count INTEGER;
  mapping_count INTEGER;
  actual_mapping_fingerprint TEXT;
  state_source_fingerprint TEXT;
  state_archive_fingerprint TEXT;
  state_mapping_fingerprint TEXT;
  state_manifest_fingerprint TEXT;
  state_wbs_publication_count INTEGER;
  state_wbs_event_count INTEGER;
  state_dependency_publication_count INTEGER;
  state_dependency_event_count INTEGER;
  state_mapping_count INTEGER;
  state_found BOOLEAN := FALSE;
BEGIN
  SELECT
    state.source_data_fingerprint,
    state.archive_data_fingerprint,
    state.mapping_fingerprint,
    state.manifest_fingerprint,
    state.source_wbs_publication_count,
    state.source_wbs_event_count,
    state.source_dependency_publication_count,
    state.source_dependency_event_count,
    state.default_master_plan_mapping_count
  INTO
    state_source_fingerprint,
    state_archive_fingerprint,
    state_mapping_fingerprint,
    state_manifest_fingerprint,
    state_wbs_publication_count,
    state_wbs_event_count,
    state_dependency_publication_count,
    state_dependency_event_count,
    state_mapping_count
  FROM public.duration_learning_legacy_runtime_retirement_state state
  WHERE retirement_key = 'duration_learning_legacy_runtime_v1'
    AND retirement_status = 'archived_ready_for_explicit_322_authorization'
  FOR UPDATE;
  state_found := FOUND;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE asset_kind <> 'default_master_plan')::INTEGER
  INTO source_wbs_publication_count, unsupported_wbs_publication_count
  FROM public.wbs_template_runtime_publications;
  SELECT COUNT(*)::INTEGER INTO source_wbs_event_count
  FROM public.wbs_template_runtime_events;
  SELECT COUNT(*)::INTEGER INTO source_dependency_publication_count
  FROM public.construction_dependency_rule_runtime_publications;
  SELECT COUNT(*)::INTEGER INTO source_dependency_event_count
  FROM public.construction_dependency_rule_runtime_events;
  SELECT
    COUNT(*)::INTEGER,
    encode(
      digest(
        convert_to(
          COALESCE(
            jsonb_agg(
              to_jsonb(mapping) - 'id' - 'archived_at'
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
  INTO mapping_count, actual_mapping_fingerprint
  FROM public.duration_learning_legacy_default_master_plan_mappings
    mapping
  WHERE mapping.mapping_kind = 'legacy_default_master_plan_source_consumer_lineage';

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

  IF NOT state_found
    OR actual_source_fingerprint <> state_source_fingerprint
    OR state_source_fingerprint <> current_setting(
      'workbuddy.duration_learning_legacy_runtime_retirement.data_fingerprint',
      true
    )
    OR state_manifest_fingerprint <> current_setting(
      'workbuddy.duration_learning_legacy_runtime_retirement.manifest_fingerprint',
      true
    )
    OR actual_archive_fingerprint <> state_archive_fingerprint
    OR actual_archive_fingerprint <> actual_source_fingerprint
    OR source_wbs_publication_count <> state_wbs_publication_count
    OR source_wbs_event_count <> state_wbs_event_count
    OR source_dependency_publication_count <> state_dependency_publication_count
    OR source_dependency_event_count <> state_dependency_event_count
    OR source_wbs_publication_count <> state_mapping_count
    OR mapping_count <> state_mapping_count
    OR actual_mapping_fingerprint <> state_mapping_fingerprint
    OR source_dependency_publication_count <> 0
    OR source_dependency_event_count <> 0
    OR unsupported_wbs_publication_count <> 0
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_locked_revalidation';
  END IF;
END
$locked_revalidation$;

DROP TABLE public.wbs_template_runtime_events;
DROP TABLE public.wbs_template_runtime_publications;
DROP TABLE public.construction_dependency_rule_runtime_events;
DROP TABLE public.construction_dependency_rule_runtime_publications;

DO $record_readback$
DECLARE
  authorization_ref TEXT := current_setting(
    'workbuddy.duration_learning_legacy_runtime_retirement.authorization_ref',
    true
  );
  backup_sha256 TEXT := current_setting(
    'workbuddy.duration_learning_legacy_runtime_retirement.backup_sha256',
    true
  );
  actual_source_fingerprint TEXT := current_setting(
    'workbuddy.duration_learning_legacy_runtime_retirement.data_fingerprint',
    true
  );
BEGIN
  UPDATE public.duration_learning_legacy_runtime_retirement_state
  SET
    retirement_status = 'retired_readback_complete',
    source_tables_present = FALSE,
    retirement_authorization_ref = authorization_ref,
    retirement_backup_sha256 = backup_sha256,
    retired_source_data_fingerprint = actual_source_fingerprint,
    retired_at = transaction_timestamp(),
    restored_at = NULL,
    updated_at = transaction_timestamp()
  WHERE retirement_key = 'duration_learning_legacy_runtime_v1';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_readback_write_failed';
  END IF;
END
$record_readback$;

DO $$
BEGIN
  IF to_regclass('public.wbs_template_runtime_publications') IS NOT NULL
    OR to_regclass('public.wbs_template_runtime_events') IS NOT NULL
    OR to_regclass('public.construction_dependency_rule_runtime_publications') IS NOT NULL
    OR to_regclass('public.construction_dependency_rule_runtime_events') IS NOT NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.duration_learning_legacy_runtime_retirement_state
      WHERE retirement_key = 'duration_learning_legacy_runtime_v1'
        AND retirement_status = 'retired_readback_complete'
        AND source_tables_present IS FALSE
        AND retirement_backup_sha256 ~ '^[a-f0-9]{64}$'
        AND retired_source_data_fingerprint = source_data_fingerprint
    )
  THEN
    RAISE EXCEPTION 'duration_learning_legacy_runtime_retirement_postcondition_failed';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
