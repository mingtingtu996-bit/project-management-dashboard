-- 158_delete_acceptance_timeline_candidate_seed.sql
-- v1.4.7.5: remove the former acceptance delay / acceptance timeline candidate algorithm seed.

BEGIN;

DELETE FROM public.algorithm_seed_overrides
WHERE seed_type IN ('acceptance_lag', 'acceptance_timeline_candidate');

DELETE FROM public.algorithm_seed_upgrade_candidates
WHERE seed_type IN ('acceptance_lag', 'acceptance_timeline_candidate');

DELETE FROM public.algorithm_seed_records
WHERE seed_type IN ('acceptance_lag', 'acceptance_timeline_candidate');

DELETE FROM public.algorithm_seed_import_logs
WHERE seed_type IN ('acceptance_lag', 'acceptance_timeline_candidate');

DELETE FROM public.algorithm_seed_versions
WHERE seed_type IN ('acceptance_lag', 'acceptance_timeline_candidate');

ALTER TABLE public.duration_forecast_model_profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.duration_forecast_model_profiles
SET metadata = jsonb_set(
    jsonb_set(
      metadata,
      '{impactModes,add_days}',
      COALESCE((metadata #> '{impactModes,add_days}'), '[]'::jsonb) - 'acceptance_lag' - 'acceptance_timeline_candidate',
      true
    ),
    '{impactModes,confidence_only}',
    COALESCE((metadata #> '{impactModes,confidence_only}'), '[]'::jsonb) - 'acceptance_lag' - 'acceptance_timeline_candidate',
    true
  ),
  updated_at = NOW()
WHERE model_key = 'remaining_duration_forecast';

COMMIT;
