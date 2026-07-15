-- v1.4.22.2: duration context policy low-risk canary candidate gate.
-- Stores review-required canary candidates derived from learned-policy replay comparisons.

BEGIN;

CREATE TABLE IF NOT EXISTS public.duration_context_policy_canary_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_family TEXT NOT NULL DEFAULT 'contextual_bandit_v1',
  model_version TEXT NOT NULL DEFAULT 'contextual_bandit_v1',
  candidate_status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (candidate_status IN ('candidate', 'approved_for_canary', 'rejected', 'superseded')),
  runtime_mutation_policy TEXT NOT NULL DEFAULT 'none_canary_candidate_only',
  runtime_auto_publish_eligible BOOLEAN NOT NULL DEFAULT false,
  requires_review BOOLEAN NOT NULL DEFAULT true,
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  state_bucket TEXT NOT NULL,
  action_key TEXT NOT NULL,
  replay_case_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_case_count >= 0),
  average_projected_reward_delta NUMERIC(8,4) NOT NULL DEFAULT 0,
  source_decision_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  guardrails JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_canary_candidates_status
  ON public.duration_context_policy_canary_candidates(candidate_status, average_projected_reward_delta DESC);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_canary_candidates_bucket
  ON public.duration_context_policy_canary_candidates(model_family, model_version, state_bucket);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_canary_candidates_project
  ON public.duration_context_policy_canary_candidates(project_id, candidate_status);

ALTER TABLE public.duration_context_policy_canary_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duration_context_policy_canary_candidate_select_member ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidate_select_member ON public.duration_context_policy_canary_candidates
  FOR SELECT
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
    OR public.is_project_member(duration_context_policy_canary_candidates.project_id, auth.uid())
  );

DROP POLICY IF EXISTS duration_context_policy_canary_candidate_write_service_role ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidate_write_service_role ON public.duration_context_policy_canary_candidates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.duration_context_policy_canary_candidates IS 'Review-required low-risk canary candidates generated from learned-policy replay evidence.';
COMMENT ON COLUMN public.duration_context_policy_canary_candidates.runtime_mutation_policy IS 'Candidate gate only; rows do not activate runtime policy without explicit review and release wiring.';
COMMENT ON COLUMN public.duration_context_policy_canary_candidates.guardrails IS 'Guardrails that must remain satisfied before any canary enablement.';

NOTIFY pgrst, 'reload schema';

COMMIT;
