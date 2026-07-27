-- v1.4.23.1 duration-context policy tenant scope hardening.
--
-- Learned parameters must never mix samples across companies.  Add explicit
-- company scope to the decision and parameter tables, backfill it from
-- projects, and make the current learned-parameter identity company-aware.

ALTER TABLE public.duration_context_policy_decisions
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.duration_context_policy_parameters
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.duration_context_policy_decisions d
SET company_id = p.company_id
FROM public.projects p
WHERE d.project_id = p.id
  AND d.company_id IS NULL;

UPDATE public.duration_context_policy_parameters p0
SET company_id = p.company_id
FROM public.projects p
WHERE p0.project_id = p.id
  AND p0.company_id IS NULL;

DROP INDEX IF EXISTS public.uq_duration_context_policy_parameters_current_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_context_policy_parameters_current_key
  ON public.duration_context_policy_parameters (
    model_family,
    model_version,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    parameter_status,
    state_bucket,
    action_key
  );

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_decisions_company
  ON public.duration_context_policy_decisions(company_id, project_id, reward_status, decision_date DESC);

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_parameters_company
  ON public.duration_context_policy_parameters(company_id, project_id, parameter_status, state_bucket);

COMMENT ON COLUMN public.duration_context_policy_decisions.company_id IS
  'Tenant boundary for duration-context learning samples; prevents cross-company parameter learning.';
COMMENT ON COLUMN public.duration_context_policy_parameters.company_id IS
  'Tenant boundary for learned duration-context parameters; part of the current-parameter identity.';

NOTIFY pgrst, 'reload schema';
