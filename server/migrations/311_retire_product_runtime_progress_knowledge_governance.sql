-- Retire repository-research candidate governance from the product database.
-- External knowledge remains a development input that is encoded into reviewed
-- seeds/rules/templates before normal code release. It is not a runtime subsystem.

BEGIN;

LOCK TABLE public.progress_asset_publication_readiness IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_asset_calibration_results IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_asset_calibration_runs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_asset_candidates IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_knowledge_documents IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.progress_knowledge_sources IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  backup_sha256 TEXT := current_setting('workbuddy.progress_knowledge_retirement_backup_sha256', true);
  expected_fingerprint TEXT := current_setting('workbuddy.progress_knowledge_retirement_data_fingerprint', true);
  actual_fingerprint TEXT;
BEGIN
  IF backup_sha256 IS NULL OR backup_sha256 !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'progress_knowledge_retirement_backup_required';
  END IF;
  IF expected_fingerprint IS NULL OR expected_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'progress_knowledge_retirement_fingerprint_required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_asset_publication_readiness
    WHERE readiness_status IN ('auto_canary_active', 'auto_published')
  ) THEN
    RAISE EXCEPTION 'progress_knowledge_retirement_active_runtime_publication_present';
  END IF;

  SELECT encode(
           digest(
             convert_to(
               jsonb_build_object(
                 'progress_knowledge_sources', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_knowledge_sources source_row
                 ),
                 'progress_knowledge_documents', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_knowledge_documents source_row
                 ),
                 'progress_asset_candidates', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_asset_candidates source_row
                 ),
                 'progress_asset_calibration_runs', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_asset_calibration_runs source_row
                 ),
                 'progress_asset_calibration_results', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_asset_calibration_results source_row
                 ),
                 'progress_asset_publication_readiness', (
                   SELECT COALESCE(jsonb_agg(to_jsonb(source_row) ORDER BY source_row.id), '[]'::jsonb)
                   FROM public.progress_asset_publication_readiness source_row
                 )
               )::text,
               'UTF8'
             ),
             'sha256'
           ),
           'hex'
         )
  INTO actual_fingerprint;

  IF actual_fingerprint <> expected_fingerprint THEN
    RAISE EXCEPTION 'progress_knowledge_retirement_data_changed_after_backup';
  END IF;
END
$$;

DROP TABLE public.progress_asset_publication_readiness;
DROP TABLE public.progress_asset_calibration_results;
DROP TABLE public.progress_asset_calibration_runs;
DROP TABLE public.progress_asset_candidates;
DROP TABLE public.progress_knowledge_documents;
DROP TABLE public.progress_knowledge_sources;

NOTIFY pgrst, 'reload schema';

COMMIT;
