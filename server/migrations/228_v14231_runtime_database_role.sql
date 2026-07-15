-- v1.4.23.1 C-18.L03: introduce a non-BYPASSRLS runtime database role.
--
-- This migration intentionally creates only a NOLOGIN group role. A real
-- deployment should create a secret-bearing LOGIN role outside source control
-- and grant it membership in workbuddy_runtime.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'CREATE ROLE workbuddy_runtime NOLOGIN NOBYPASSRLS';
  ELSE
    EXECUTE 'ALTER ROLE workbuddy_runtime WITH NOLOGIN NOBYPASSRLS';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO workbuddy_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO workbuddy_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO workbuddy_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO workbuddy_runtime;

DROP POLICY IF EXISTS companies_backend_runtime_policy ON public.companies;
CREATE POLICY companies_backend_runtime_policy ON public.companies
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS company_members_backend_runtime_policy ON public.company_members;
CREATE POLICY company_members_backend_runtime_policy ON public.company_members
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS projects_backend_runtime_policy ON public.projects;
CREATE POLICY projects_backend_runtime_policy ON public.projects
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS tasks_backend_runtime_policy ON public.tasks;
CREATE POLICY tasks_backend_runtime_policy ON public.tasks
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS task_dependencies_backend_runtime_policy ON public.task_dependencies;
CREATE POLICY task_dependencies_backend_runtime_policy ON public.task_dependencies
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS engineering_objects_backend_runtime_policy ON public.engineering_objects;
CREATE POLICY engineering_objects_backend_runtime_policy ON public.engineering_objects
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS acceptance_plans_backend_runtime_policy ON public.acceptance_plans;
CREATE POLICY acceptance_plans_backend_runtime_policy ON public.acceptance_plans
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS project_daily_snapshot_backend_runtime_policy ON public.project_daily_snapshot;
CREATE POLICY project_daily_snapshot_backend_runtime_policy ON public.project_daily_snapshot
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;
