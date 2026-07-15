-- v1.4.23.2 / local data environment repair:
-- project_members participates in workspace aggregation. When RLS is enabled
-- without a backend runtime policy, workbuddy_runtime_login can read projects
-- and company_members but sees zero project membership rows.

BEGIN;

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_members TO workbuddy_runtime;

DROP POLICY IF EXISTS project_members_backend_runtime_policy ON public.project_members;
CREATE POLICY project_members_backend_runtime_policy ON public.project_members
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
