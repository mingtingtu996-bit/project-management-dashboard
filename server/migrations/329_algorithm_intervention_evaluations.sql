BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 329';
  END IF;
END
$$;

-- BEGIN MIGRATION 329
CREATE TABLE IF NOT EXISTS public.algorithm_intervention_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_publication_key TEXT NOT NULL CHECK (NULLIF(BTRIM(source_publication_key), '') IS NOT NULL),
  asset_key TEXT NOT NULL CHECK (NULLIF(BTRIM(asset_key), '') IS NOT NULL),
  parameter_key TEXT NOT NULL CHECK (NULLIF(BTRIM(parameter_key), '') IS NOT NULL),
  owner_algorithm TEXT NULL,
  scope_level TEXT NOT NULL CHECK (scope_level IN ('system','company','project','industry_baseline','segment_baseline')),
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NULL,
  intervention_at TIMESTAMPTZ NOT NULL,
  evaluation_window_start TIMESTAMPTZ NULL,
  evaluation_window_end TIMESTAMPTZ NULL,
  evaluation_status TEXT NOT NULL CHECK (evaluation_status IN ('insufficient_evidence','observational_estimate','counterfactual_supported')),
  causal_estimate_status TEXT NOT NULL CHECK (causal_estimate_status IN ('not_estimable','observational_before_after','observational_difference_in_differences')),
  treatment_sample_count INTEGER NOT NULL CHECK (treatment_sample_count >= 0),
  control_sample_count INTEGER NOT NULL CHECK (control_sample_count >= 0),
  treated_baseline_mae_days NUMERIC NULL,
  treated_post_mae_days NUMERIC NULL,
  control_baseline_mae_days NUMERIC NULL,
  control_post_mae_days NUMERIC NULL,
  counterfactual_effect_days NUMERIC NULL,
  post_intervention_error_rate_inflection_days NUMERIC NULL,
  rollback_review_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  limitations TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(evidence) = 'object' AND pg_column_size(evidence) <= 32768),
  evaluation_fingerprint TEXT NOT NULL CHECK (evaluation_fingerprint ~ '^[a-f0-9]{64}$'),
  evaluated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id, company_id) REFERENCES public.projects(id, company_id) ON UPDATE RESTRICT ON DELETE CASCADE,
  UNIQUE (evaluation_fingerprint),
  CHECK (evaluation_window_start IS NULL OR evaluation_window_start >= intervention_at),
  CHECK (evaluation_window_end IS NULL OR evaluation_window_start IS NULL OR evaluation_window_end >= evaluation_window_start),
  CHECK (
    (scope_level = 'project' AND company_id IS NOT NULL AND project_id IS NOT NULL)
    OR (scope_level = 'company' AND company_id IS NOT NULL AND project_id IS NULL)
    OR (scope_level IN ('system','industry_baseline','segment_baseline') AND project_id IS NULL)
  ),
  CHECK (
    (evaluation_status = 'insufficient_evidence' AND causal_estimate_status = 'not_estimable' AND counterfactual_effect_days IS NULL)
    OR (evaluation_status = 'observational_estimate' AND causal_estimate_status = 'observational_before_after' AND counterfactual_effect_days IS NULL)
    OR (evaluation_status = 'counterfactual_supported' AND causal_estimate_status = 'observational_difference_in_differences' AND counterfactual_effect_days IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_algorithm_intervention_evaluations_publication
  ON public.algorithm_intervention_evaluations (source_publication_key, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_algorithm_intervention_evaluations_scope
  ON public.algorithm_intervention_evaluations (company_id, project_id, parameter_key, evaluated_at DESC);

ALTER TABLE public.algorithm_intervention_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.algorithm_intervention_evaluations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.algorithm_intervention_evaluations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.algorithm_intervention_evaluations TO workbuddy_runtime;

DROP POLICY IF EXISTS algorithm_intervention_evaluations_backend_runtime_read
  ON public.algorithm_intervention_evaluations;
CREATE POLICY algorithm_intervention_evaluations_backend_runtime_read
  ON public.algorithm_intervention_evaluations
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS algorithm_intervention_evaluations_backend_runtime_insert
  ON public.algorithm_intervention_evaluations;
CREATE POLICY algorithm_intervention_evaluations_backend_runtime_insert
  ON public.algorithm_intervention_evaluations
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON TABLE public.algorithm_intervention_evaluations IS
  'Append-only observational intervention evaluations. Difference-in-differences estimates are evidence, not randomized causal proof.';

-- END MIGRATION 329
NOTIFY pgrst, 'reload schema';

COMMIT;
