-- v1.4.22.2: duration context policy learned parameter candidates.
-- Stores offline contextual-bandit action weights learned from evaluated decision rewards.

BEGIN;

CREATE TABLE IF NOT EXISTS public.duration_context_policy_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_family TEXT NOT NULL DEFAULT 'contextual_bandit_v1',
  model_version TEXT NOT NULL DEFAULT 'contextual_bandit_v1',
  parameter_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (parameter_status IN ('candidate', 'published', 'superseded', 'rejected')),
  runtime_mutation_policy TEXT NOT NULL DEFAULT 'none_candidate_parameters_only',
  runtime_auto_publish_eligible BOOLEAN NOT NULL DEFAULT false,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  state_bucket TEXT NOT NULL,
  action_key TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  average_reward NUMERIC(8,4) NOT NULL DEFAULT 0,
  positive_reward_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  learned_weight NUMERIC(8,4) NOT NULL DEFAULT 0,
  reward_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_parameters_lookup
  ON public.duration_context_policy_parameters(model_family, model_version, parameter_status, state_bucket);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_parameters_project
  ON public.duration_context_policy_parameters(project_id, parameter_status, state_bucket);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_parameters_action
  ON public.duration_context_policy_parameters(action_key, learned_weight DESC);

ALTER TABLE public.duration_context_policy_parameters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duration_context_policy_parameter_select_member ON public.duration_context_policy_parameters;
CREATE POLICY duration_context_policy_parameter_select_member ON public.duration_context_policy_parameters
  FOR SELECT
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
    OR public.is_project_member(duration_context_policy_parameters.project_id, auth.uid())
  );

DROP POLICY IF EXISTS duration_context_policy_parameter_write_service_role ON public.duration_context_policy_parameters;
CREATE POLICY duration_context_policy_parameter_write_service_role ON public.duration_context_policy_parameters
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.duration_context_policy_parameters IS 'Backend-only candidate parameters learned from contextual-bandit decision rewards.';
COMMENT ON COLUMN public.duration_context_policy_parameters.state_bucket IS 'Stable bucket derived from maturity, risk tier, schedule state and hard-constraint state.';
COMMENT ON COLUMN public.duration_context_policy_parameters.runtime_mutation_policy IS 'Candidate parameters do not mutate production duration-context runtime rules.';

NOTIFY pgrst, 'reload schema';

COMMIT;
