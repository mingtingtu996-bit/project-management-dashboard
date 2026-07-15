-- v1.4.23.1 C-15/C-15.2 local schema guard.
--
-- A canary/published duration-context policy version is active for its
-- company/project/state-bucket/action identity, not only for its source
-- candidate row. This prevents two different candidates from publishing
-- conflicting active versions for the same governed scope.
--
-- Local migration contract only; applying this to live databases remains a
-- separate release/migration gate.

BEGIN;

ALTER TABLE public.duration_context_policy_versions
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.duration_context_policy_versions v
SET company_id = COALESCE(
  c.company_id,
  (SELECT p.company_id FROM public.projects p WHERE p.id = c.project_id),
  (SELECT p.company_id FROM public.projects p WHERE p.id = v.project_id)
)
FROM public.duration_context_policy_canary_candidates c
WHERE v.source_candidate_id = c.id
  AND v.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_duration_context_policy_versions_company
  ON public.duration_context_policy_versions(company_id, project_id, version_status, state_bucket);

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_context_policy_versions_active_scope_action
  ON public.duration_context_policy_versions (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    state_bucket,
    action_key
  )
  WHERE version_status IN ('canary', 'published');

COMMENT ON COLUMN public.duration_context_policy_versions.company_id IS
  'Tenant boundary for active learned duration-context policy versions; active canary/published uniqueness is scoped by company/project/state/action.';

NOTIFY pgrst, 'reload schema';

COMMIT;
