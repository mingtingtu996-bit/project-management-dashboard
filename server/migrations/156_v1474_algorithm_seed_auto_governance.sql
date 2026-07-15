-- v1.4.7.4 algorithm seed automatic governance follow-up.
-- Removes manual review/publish semantics from the runtime schema while keeping
-- candidate, quarantine, auto-publish, and audit fields.

ALTER TABLE public.algorithm_seed_upgrade_candidates
  DROP CONSTRAINT IF EXISTS algorithm_seed_upgrade_candidates_candidate_source_check,
  DROP CONSTRAINT IF EXISTS algorithm_seed_upgrade_candidates_action_policy_check,
  DROP CONSTRAINT IF EXISTS algorithm_seed_upgrade_candidates_status_check;

UPDATE public.algorithm_seed_upgrade_candidates
SET candidate_source = 'system_observation'
WHERE candidate_source = 'manual_evidence';

UPDATE public.algorithm_seed_upgrade_candidates
SET action_policy = 'auto_govern'
WHERE action_policy = 'review_required';

UPDATE public.algorithm_seed_upgrade_candidates
SET status = 'auto_published'
WHERE status = 'accepted';

ALTER TABLE public.algorithm_seed_upgrade_candidates
  ALTER COLUMN action_policy SET DEFAULT 'auto_govern',
  ADD COLUMN IF NOT EXISTS auto_score NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_governance_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS quarantine_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS auto_governed_at TIMESTAMPTZ NULL;

ALTER TABLE public.algorithm_seed_upgrade_candidates
  DROP COLUMN IF EXISTS review_note,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_at;

ALTER TABLE public.algorithm_seed_upgrade_candidates
  ADD CONSTRAINT algorithm_seed_upgrade_candidates_candidate_source_check
    CHECK (candidate_source IN ('project_history', 'company_history', 'standard_update', 'system_observation')),
  ADD CONSTRAINT algorithm_seed_upgrade_candidates_action_policy_check
    CHECK (action_policy IN ('candidate_only', 'auto_govern')),
  ADD CONSTRAINT algorithm_seed_upgrade_candidates_status_check
    CHECK (status IN ('pending', 'candidate_only', 'auto_published', 'quarantined', 'rejected', 'superseded'));

ALTER TABLE public.algorithm_seed_overrides
  ADD COLUMN IF NOT EXISTS published_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_governance_result JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'algorithm_seed_overrides'
      AND column_name = 'approved_by'
  ) THEN
    EXECUTE 'UPDATE public.algorithm_seed_overrides SET published_by = COALESCE(published_by, approved_by)';
    EXECUTE 'ALTER TABLE public.algorithm_seed_overrides DROP COLUMN approved_by';
  END IF;
END $$;
