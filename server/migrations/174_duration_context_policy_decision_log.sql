-- v1.4.22.2: duration context policy learning feedback loop.
-- Stores contextual-bandit strategy decisions, delayed rewards, and replay evidence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.duration_context_policy_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  model_family TEXT NOT NULL DEFAULT 'contextual_bandit_v1',
  model_version TEXT NOT NULL DEFAULT 'contextual_bandit_v1',
  decision_status TEXT NOT NULL DEFAULT 'shadow_run'
    CHECK (decision_status IN (
      'shadow_run',
      'candidate_only',
      'canary_candidate',
      'auto_publish_eligible',
      'reward_evaluated',
      'superseded',
      'rejected'
    )),
  decision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_reward_date DATE NOT NULL DEFAULT (CURRENT_DATE + 30),
  source_calibration_id UUID NULL REFERENCES public.project_productivity_compensation_calibrations(id) ON DELETE SET NULL,
  state_vector JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_action JSONB NOT NULL DEFAULT '{}'::jsonb,
  rule_baseline_p NUMERIC(6,3) NULL,
  current_p NUMERIC(6,3) NULL,
  runtime_policy TEXT NOT NULL DEFAULT 'shadow_run',
  runtime_auto_publish_eligible BOOLEAN NOT NULL DEFAULT false,
  runtime_mutation_policy TEXT NOT NULL DEFAULT 'none_decision_log_only',
  reward_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (reward_status IN ('pending', 'evaluated', 'insufficient_evidence', 'failed')),
  reward_payload JSONB NULL,
  reward_source_calibration_id UUID NULL REFERENCES public.project_productivity_compensation_calibrations(id) ON DELETE SET NULL,
  reward_evaluated_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_decisions_project
  ON public.duration_context_policy_decisions(project_id, decision_date DESC);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_decisions_reward_due
  ON public.duration_context_policy_decisions(reward_status, target_reward_date);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_decisions_model
  ON public.duration_context_policy_decisions(model_family, model_version, decision_date DESC);

ALTER TABLE public.duration_context_policy_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duration_context_policy_decision_select_member ON public.duration_context_policy_decisions;
CREATE POLICY duration_context_policy_decision_select_member ON public.duration_context_policy_decisions
  FOR SELECT
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
    OR public.is_project_member(duration_context_policy_decisions.project_id, auth.uid())
  );

DROP POLICY IF EXISTS duration_context_policy_decision_write_service_role ON public.duration_context_policy_decisions;
CREATE POLICY duration_context_policy_decision_write_service_role ON public.duration_context_policy_decisions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.duration_context_policy_decisions IS 'Backend-only contextual-bandit decision log for duration context policy learning.';
COMMENT ON COLUMN public.duration_context_policy_decisions.runtime_mutation_policy IS 'Always none_decision_log_only: policy learning logs decisions and rewards but does not mutate deterministic runtime factors.';
COMMENT ON COLUMN public.duration_context_policy_decisions.reward_payload IS 'Delayed reward payload produced by offline replay/backfill from later calibration evidence.';

NOTIFY pgrst, 'reload schema';

COMMIT;
