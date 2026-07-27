-- v1.4.22.2: duration context policy canary approval and version registry.
-- Records review-approved canary policy versions without runtime mutation authority.

BEGIN;

ALTER TABLE public.duration_context_policy_canary_candidates
  ADD COLUMN IF NOT EXISTS review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.duration_context_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_family TEXT NOT NULL DEFAULT 'contextual_bandit_v1',
  model_version TEXT NOT NULL DEFAULT 'contextual_bandit_v1',
  source_candidate_id UUID NOT NULL REFERENCES public.duration_context_policy_canary_candidates(id) ON DELETE CASCADE,
  version_status TEXT NOT NULL DEFAULT 'canary'
    CHECK (version_status IN ('canary', 'published', 'rolled_back', 'expired')),
  activation_mode TEXT NOT NULL DEFAULT 'review_required_canary'
    CHECK (activation_mode IN ('review_required_canary', 'manual_publish')),
  runtime_mutation_policy TEXT NOT NULL DEFAULT 'none_version_registry_only',
  runtime_auto_publish_eligible BOOLEAN NOT NULL DEFAULT false,
  rollback_policy TEXT NOT NULL DEFAULT 'manual_rollback_required_before_runtime_disablement',
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  state_bucket TEXT NOT NULL,
  action_key TEXT NOT NULL,
  canary_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,
  replay_case_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_case_count >= 0),
  average_projected_reward_delta NUMERIC(8,4) NOT NULL DEFAULT 0,
  source_decision_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  guardrails JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_reason TEXT NULL,
  rollback_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_versions_status
  ON public.duration_context_policy_versions(version_status, approved_at DESC);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_versions_source_candidate
  ON public.duration_context_policy_versions(source_candidate_id);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_versions_project
  ON public.duration_context_policy_versions(project_id, version_status);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_versions_bucket
  ON public.duration_context_policy_versions(model_family, model_version, state_bucket);

ALTER TABLE public.duration_context_policy_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duration_context_policy_version_select_member ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_version_select_member ON public.duration_context_policy_versions
  FOR SELECT
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
    OR public.is_project_member(duration_context_policy_versions.project_id, auth.uid())
  );

DROP POLICY IF EXISTS duration_context_policy_version_write_service_role ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_version_write_service_role ON public.duration_context_policy_versions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.duration_context_policy_versions IS 'Review-approved duration-context policy canary or published versions. Registry only; runtime selectors must opt in separately.';
COMMENT ON COLUMN public.duration_context_policy_versions.runtime_mutation_policy IS 'Version rows do not mutate deterministic duration-context runtime behavior by themselves.';
COMMENT ON COLUMN public.duration_context_policy_versions.canary_scope IS 'Explicit project/date/traffic scope for review-required canary observation.';
COMMENT ON COLUMN public.duration_context_policy_versions.rollback_policy IS 'Rollback requirement before any future runtime canary disablement.';

NOTIFY pgrst, 'reload schema';

COMMIT;
