-- 159_v1472_wbs_template_candidate_real_acceptance.sql
-- v1.4.7.2 / v1.4.22: keep WBS template candidate hit-rate honest.
-- generated rows are candidates; retained rows are accepted; filtered/deleted rows are rejected.

BEGIN;

ALTER TABLE IF EXISTS public.wbs_template_candidate_events
  ADD COLUMN IF NOT EXISTS retained_row_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_row_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pending_row_count INTEGER NOT NULL DEFAULT 0;

UPDATE public.wbs_template_candidate_events
SET
  retained_row_count = COALESCE(NULLIF((metadata ->> 'retained_row_count')::INTEGER, 0), generated_row_count, 0),
  rejected_row_count = COALESCE((metadata ->> 'rejected_row_count')::INTEGER, GREATEST(generated_row_count - COALESCE(NULLIF((metadata ->> 'retained_row_count')::INTEGER, 0), generated_row_count, 0), 0)),
  pending_row_count = COALESCE((metadata ->> 'pending_row_count')::INTEGER, 0),
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'acceptance_rate_basis', 'retained_rows_divided_by_generated_rows',
    'historical_backfill', true
  )
WHERE retained_row_count = 0
  AND generated_row_count > 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wbs_template_candidate_events_retained_non_negative'
  ) THEN
    ALTER TABLE public.wbs_template_candidate_events
      ADD CONSTRAINT wbs_template_candidate_events_retained_non_negative
      CHECK (retained_row_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wbs_template_candidate_events_rejected_non_negative'
  ) THEN
    ALTER TABLE public.wbs_template_candidate_events
      ADD CONSTRAINT wbs_template_candidate_events_rejected_non_negative
      CHECK (rejected_row_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wbs_template_candidate_events_pending_non_negative'
  ) THEN
    ALTER TABLE public.wbs_template_candidate_events
      ADD CONSTRAINT wbs_template_candidate_events_pending_non_negative
      CHECK (pending_row_count >= 0);
  END IF;
END $$;

WITH recalculated AS (
  SELECT
    project_id,
    COALESCE(template_id, 'unknown') AS template_id,
    to_char(created_at, 'YYYY-MM') AS period_month,
    SUM(generated_row_count)::INT AS total_candidates,
    SUM(retained_row_count)::INT AS accepted_candidates,
    SUM(rejected_row_count)::INT AS rejected_candidates,
    SUM(pending_row_count)::INT AS pending_candidates
  FROM public.wbs_template_candidate_events
  GROUP BY project_id, COALESCE(template_id, 'unknown'), to_char(created_at, 'YYYY-MM')
)
INSERT INTO public.wbs_template_candidate_aggregations (
  project_id,
  template_id,
  period_month,
  total_candidates,
  accepted_candidates,
  rejected_candidates,
  pending_candidates,
  acceptance_rate,
  metadata,
  updated_at
)
SELECT
  project_id,
  template_id,
  period_month,
  total_candidates,
  accepted_candidates,
  rejected_candidates,
  pending_candidates,
  CASE WHEN total_candidates > 0 THEN accepted_candidates::REAL / total_candidates ELSE NULL END,
  jsonb_build_object(
    'acceptance_rate_basis', 'retained_rows_divided_by_generated_rows',
    'recalculated_from_events', true
  ),
  NOW()
FROM recalculated
ON CONFLICT (project_id, template_id, period_month)
DO UPDATE SET
  total_candidates = EXCLUDED.total_candidates,
  accepted_candidates = EXCLUDED.accepted_candidates,
  rejected_candidates = EXCLUDED.rejected_candidates,
  pending_candidates = EXCLUDED.pending_candidates,
  acceptance_rate = EXCLUDED.acceptance_rate,
  metadata = COALESCE(public.wbs_template_candidate_aggregations.metadata, '{}'::jsonb) || EXCLUDED.metadata,
  updated_at = NOW();

COMMIT;
