-- v1.4.23.1 C-18.L01/L02: force core RLS and restore tenant policies.
--
-- Live evidence showed core tables with RLS enabled but not forced, and
-- projects/tasks/acceptance_plans without active policies. Keep this
-- forward-only and idempotent so drifted databases can be repaired safely.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_active_company_member(
  p_company_id UUID,
  p_allowed_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
      AND (
        p_allowed_roles IS NULL
        OR cm.role = ANY(p_allowed_roles)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO service_role';
  END IF;
END $$;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members FORCE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.engineering_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engineering_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.acceptance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acceptance_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_daily_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_daily_snapshot FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select_policy ON public.companies;
CREATE POLICY companies_select_policy ON public.companies
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.companies.id, NULL::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS companies_write_policy ON public.companies;
CREATE POLICY companies_write_policy ON public.companies
  FOR ALL
  USING (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.companies.id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.companies.id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_members_select_policy ON public.company_members;
CREATE POLICY company_members_select_policy ON public.company_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_active_company_member(public.company_members.company_id, NULL::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS company_members_write_policy ON public.company_members;
CREATE POLICY company_members_write_policy ON public.company_members
  FOR ALL
  USING (
    public.is_active_company_member(public.company_members.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    public.is_active_company_member(public.company_members.company_id, ARRAY['company_admin']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS projects_read_policy ON public.projects;
DROP POLICY IF EXISTS projects_select_own ON public.projects;
CREATE POLICY projects_read_policy ON public.projects
  FOR SELECT
  USING (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.projects.company_id, NULL::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS projects_write_policy ON public.projects;
DROP POLICY IF EXISTS projects_insert_own ON public.projects;
DROP POLICY IF EXISTS projects_update_own ON public.projects;
DROP POLICY IF EXISTS projects_delete_own ON public.projects;
CREATE POLICY projects_write_policy ON public.projects
  FOR ALL
  USING (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.projects.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.is_active_company_member(public.projects.company_id, ARRAY['company_admin', 'editor']::TEXT[])
    OR (SELECT current_setting('role', true) = 'service_role')
  );

DROP POLICY IF EXISTS tasks_read_policy ON public.tasks;
DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_read_policy ON public.tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.tasks.project_id
        AND (
          public.is_active_company_member(p.company_id, NULL::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  );

DROP POLICY IF EXISTS tasks_write_policy ON public.tasks;
DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;
CREATE POLICY tasks_write_policy ON public.tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.tasks.project_id
        AND (
          public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.tasks.project_id
        AND (
          public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  );

DROP POLICY IF EXISTS acceptance_plans_read_policy ON public.acceptance_plans;
DROP POLICY IF EXISTS acceptance_plans_select_own ON public.acceptance_plans;
CREATE POLICY acceptance_plans_read_policy ON public.acceptance_plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.acceptance_plans.project_id
        AND (
          public.is_active_company_member(p.company_id, NULL::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  );

DROP POLICY IF EXISTS acceptance_plans_write_policy ON public.acceptance_plans;
DROP POLICY IF EXISTS acceptance_plans_insert_own ON public.acceptance_plans;
DROP POLICY IF EXISTS acceptance_plans_update_own ON public.acceptance_plans;
DROP POLICY IF EXISTS acceptance_plans_delete_own ON public.acceptance_plans;
CREATE POLICY acceptance_plans_write_policy ON public.acceptance_plans
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.acceptance_plans.project_id
        AND (
          public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = public.acceptance_plans.project_id
        AND (
          public.is_active_company_member(p.company_id, ARRAY['company_admin', 'editor']::TEXT[])
          OR (SELECT current_setting('role', true) = 'service_role')
        )
    )
  );

COMMIT;
