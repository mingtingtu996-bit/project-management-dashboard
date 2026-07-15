-- v1.4.22.5: make plan-network outcome learning scope schema-visible.
-- Existing rows default to project scope; global/industry/company rows must be
-- produced explicitly by their own aggregate evidence jobs.

ALTER TABLE public.duration_plan_network_outcomes
  ADD COLUMN IF NOT EXISTS learning_scope TEXT NOT NULL DEFAULT 'project';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.duration_plan_network_outcomes'::regclass
      AND conname = 'duration_plan_network_outcomes_learning_scope_check'
  ) THEN
    ALTER TABLE public.duration_plan_network_outcomes
      ADD CONSTRAINT duration_plan_network_outcomes_learning_scope_check
      CHECK (learning_scope IN ('global', 'industry', 'company', 'project'))
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.duration_plan_network_outcomes
  VALIDATE CONSTRAINT duration_plan_network_outcomes_learning_scope_check;

CREATE INDEX IF NOT EXISTS idx_duration_plan_network_outcomes_scope
  ON public.duration_plan_network_outcomes (learning_scope, asset_key, outcome_status, observed_at DESC);

COMMENT ON COLUMN public.duration_plan_network_outcomes.learning_scope IS
  'Learning layer for this plan-network outcome: project/company rows come from scoped business evidence; industry/global rows must come from explicit aggregate evidence jobs, not from project samples by implication.';
