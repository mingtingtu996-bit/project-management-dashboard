-- v1.4.23.2: duration-context canary candidate tenant scope hardening.
--
-- Canary candidates are produced from learned-policy replay evidence. Keep the
-- candidate identity aligned with learned parameters so low-risk canary review
-- rows cannot blend evidence across companies that happen to share a state bucket.

BEGIN;

ALTER TABLE public.duration_context_policy_canary_candidates
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.duration_context_policy_canary_candidates c
SET company_id = p.company_id
FROM public.projects p
WHERE c.project_id = p.id
  AND c.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_canary_candidates_company
  ON public.duration_context_policy_canary_candidates(company_id, project_id, candidate_status, state_bucket);

DROP POLICY IF EXISTS duration_context_policy_canary_candidate_select_member ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidate_select_member ON public.duration_context_policy_canary_candidates
  FOR SELECT
  USING (
    (
      company_id IS NOT NULL
      AND public.is_active_company_member(duration_context_policy_canary_candidates.company_id, NULL::TEXT[])
    )
    OR (
      project_id IS NOT NULL
      AND public.is_project_member(duration_context_policy_canary_candidates.project_id, auth.uid())
    )
    OR (
      company_id IS NULL
      AND project_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.id = auth.uid()
          AND u.global_role = 'company_admin'
      )
    )
  );

COMMENT ON COLUMN public.duration_context_policy_canary_candidates.company_id IS
  'Tenant boundary for learned-policy canary candidates; prevents cross-company replay evidence from sharing a canary row.';

NOTIFY pgrst, 'reload schema';

COMMIT;
