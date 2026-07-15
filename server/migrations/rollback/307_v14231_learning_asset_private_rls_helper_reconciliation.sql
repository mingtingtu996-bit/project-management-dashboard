-- Emergency rollback for migration 307. This restores the migration-305
-- public-helper policy shape and therefore reopens authenticated EXECUTE on
-- that helper. Prefer fixing forward unless private-helper access itself fails.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO authenticated;
  END IF;
END
$$;

DROP POLICY IF EXISTS duration_experience_samples_auth_read_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_auth_read_policy
  ON public.duration_experience_samples
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND duration_experience_samples.company_id IS NOT NULL
    AND public.is_active_company_member(duration_experience_samples.company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS duration_experience_samples_auth_write_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_auth_write_policy
  ON public.duration_experience_samples
  FOR ALL
  TO authenticated
  USING (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND public.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
  )
  WITH CHECK (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.project_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND public.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_experience_samples.project_id
        AND project.company_id = duration_experience_samples.company_id
    )
  );

DROP POLICY IF EXISTS project_productivity_calibration_select_member
  ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_select_member
  ON public.project_productivity_compensation_calibrations
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND public.is_active_company_member(company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates
  FOR SELECT
  TO authenticated
  USING (company_id IS NOT NULL AND public.is_active_company_member(company_id, NULL::TEXT[]));

DROP POLICY IF EXISTS duration_context_policy_version_select_member
  ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_version_select_member
  ON public.duration_context_policy_versions
  FOR SELECT
  TO authenticated
  USING (company_id IS NOT NULL AND public.is_active_company_member(company_id, NULL::TEXT[]));

NOTIFY pgrst, 'reload schema';

COMMIT;
