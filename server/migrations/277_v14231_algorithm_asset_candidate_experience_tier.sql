-- v1.4.23.1: promote experience tier fields on algorithm asset candidates.
-- The JSON payload remains the compatibility envelope; these nullable columns
-- provide indexed governance reads for T1/T2/T3 candidate assets.

BEGIN;

ALTER TABLE public.algorithm_asset_candidate_events
  ADD COLUMN IF NOT EXISTS experience_tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS experience_asset_type TEXT NULL;

UPDATE public.algorithm_asset_candidate_events
SET experience_tier = UPPER(candidate_payload->>'experienceTier')
WHERE experience_tier IS NULL
  AND UPPER(candidate_payload->>'experienceTier') IN ('T1', 'T2', 'T3');

UPDATE public.algorithm_asset_candidate_events
SET experience_asset_type = NULLIF(candidate_payload->>'experienceAssetType', '')
WHERE experience_asset_type IS NULL
  AND NULLIF(candidate_payload->>'experienceAssetType', '') IS NOT NULL;

UPDATE public.algorithm_asset_candidate_events
SET experience_asset_type = NULLIF(candidate_payload->>'experience_asset_type', '')
WHERE experience_asset_type IS NULL
  AND NULLIF(candidate_payload->>'experience_asset_type', '') IS NOT NULL;

ALTER TABLE public.algorithm_asset_candidate_events
  DROP CONSTRAINT IF EXISTS algorithm_asset_candidate_events_experience_tier_check;

ALTER TABLE public.algorithm_asset_candidate_events
  ADD CONSTRAINT algorithm_asset_candidate_events_experience_tier_check
  CHECK (experience_tier IS NULL OR experience_tier IN ('T1', 'T2', 'T3'));

CREATE INDEX IF NOT EXISTS idx_algorithm_asset_candidate_events_experience_tier
  ON public.algorithm_asset_candidate_events(experience_tier, experience_asset_type, learning_target, event_status)
  WHERE experience_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_algorithm_asset_candidate_events_experience_scope
  ON public.algorithm_asset_candidate_events(scope_level, company_id, project_id, experience_tier, event_status)
  WHERE experience_tier IS NOT NULL;

COMMENT ON COLUMN public.algorithm_asset_candidate_events.experience_tier IS
  'Nullable first-class T1/T2/T3 experience tier copied from candidate_payload for governed candidate lookup.';

COMMENT ON COLUMN public.algorithm_asset_candidate_events.experience_asset_type IS
  'Nullable first-class experience asset type copied from candidate_payload for governed candidate lookup.';

NOTIFY pgrst, 'reload schema';

COMMIT;
