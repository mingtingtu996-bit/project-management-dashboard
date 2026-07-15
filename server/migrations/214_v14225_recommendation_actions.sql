-- v1.4.22.5: user recommendation-action facts for runtime duration engines.
-- This table records that a user adopted or declined an algorithm recommendation. It does
-- not write tasks, seeds, baselines, monthly plans, or forecast artifacts.

BEGIN;

CREATE TABLE IF NOT EXISTS public.recommendation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  recommendation_kind TEXT NOT NULL
    CHECK (recommendation_kind IN ('schedule_acceleration', 'construction_organization_plan_network')),
  recommendation_key TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('adopted', 'declined')),
  target_end_date DATE,
  natural_end_date DATE,
  total_recover_days INTEGER,
  acceleration_target_days INTEGER,
  adopted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  adopted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_actions_unique_action UNIQUE (
    project_id,
    recommendation_kind,
    recommendation_key,
    action_type
  )
);

CREATE INDEX IF NOT EXISTS idx_recommendation_actions_project_kind
  ON public.recommendation_actions(project_id, recommendation_kind, action_type, adopted_at DESC);

ALTER TABLE public.recommendation_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recommendation_actions_select_project_members
  ON public.recommendation_actions;
CREATE POLICY recommendation_actions_select_project_members
  ON public.recommendation_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_members pm
      WHERE pm.project_id = recommendation_actions.project_id
        AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS recommendation_actions_write_service_role
  ON public.recommendation_actions;
CREATE POLICY recommendation_actions_write_service_role
  ON public.recommendation_actions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.recommendation_actions IS
  'User decision facts for algorithm recommendations. schedule_acceleration adoption is the production signal that allows E5 recovery backtests to attribute actual recovery to a user-accepted acceleration recommendation; construction_organization_plan_network adopted/declined decisions record the project/site choice without automatically writing task dependencies or plan dates.';

COMMENT ON COLUMN public.recommendation_actions.recommendation_key IS
  'Stable key derived from recommendation kind and option identity; schedule acceleration uses target finish/natural finish/recoverable days, construction organization uses option/draft/publication identity to dedupe repeated decisions.';

NOTIFY pgrst, 'reload schema';

COMMIT;
