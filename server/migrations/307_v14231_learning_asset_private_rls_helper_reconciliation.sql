-- v1.4.23.1: keep the learning-asset RLS policies on the private membership
-- helper introduced by migration 278. Migration 305 recreated these policies
-- with the retired public helper after the private-helper rewrite had run.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('workbuddy_private.is_active_company_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private.is_active_company_member(uuid,text[]) is required before migration 307';
  END IF;
END
$$;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'authenticated',
    'service_role',
    'workbuddy_runtime',
    'workbuddy_runtime_login'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA workbuddy_private TO %I', role_name);
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO %I',
        role_name
      );
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM PUBLIC;
DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM %I',
        role_name
      );
    END IF;
  END LOOP;
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
    AND workbuddy_private.is_active_company_member(
      duration_experience_samples.company_id,
      NULL::TEXT[]
    )
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
    AND workbuddy_private.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
  )
  WITH CHECK (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.project_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND workbuddy_private.is_active_company_member(
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
    AND workbuddy_private.is_active_company_member(company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND workbuddy_private.is_active_company_member(company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS duration_context_policy_version_select_member
  ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_version_select_member
  ON public.duration_context_policy_versions
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND workbuddy_private.is_active_company_member(company_id, NULL::TEXT[])
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
