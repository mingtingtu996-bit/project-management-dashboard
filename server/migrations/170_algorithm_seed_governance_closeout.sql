-- v1.4.24 algorithm seed governance closeout
-- Adds candidate idempotency support for the algorithm seed lifecycle.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.algorithm_seed_upgrade_candidates
  ADD COLUMN IF NOT EXISTS candidate_fingerprint TEXT NULL;

UPDATE public.algorithm_seed_upgrade_candidates
SET candidate_fingerprint = encode(
  digest(
    concat_ws(
      '|',
      seed_type,
      stable_code,
      candidate_source,
      coalesce(project_id::text, ''),
      coalesce(company_id::text, ''),
      candidate_payload::text,
      evidence_summary::text
    ),
    'sha256'
  ),
  'hex'
)
WHERE candidate_fingerprint IS NULL;

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_candidates_active_fingerprint
  ON public.algorithm_seed_upgrade_candidates(candidate_fingerprint)
  WHERE status IN ('pending', 'candidate_only') AND candidate_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_algorithm_seed_candidates_fingerprint
  ON public.algorithm_seed_upgrade_candidates(candidate_fingerprint)
  WHERE candidate_fingerprint IS NOT NULL;
