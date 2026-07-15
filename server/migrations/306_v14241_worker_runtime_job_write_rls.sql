-- v1.4.24.1: allow the non-bypass worker role to persist and inspect its
-- backend-only drawing-package iteration audit runs.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    GRANT SELECT, INSERT ON TABLE public.drawing_package_experience_iteration_runs TO workbuddy_runtime;
  END IF;
END $$;

DROP POLICY IF EXISTS drawing_package_experience_iteration_runs_runtime_select
  ON public.drawing_package_experience_iteration_runs;
CREATE POLICY drawing_package_experience_iteration_runs_runtime_select
  ON public.drawing_package_experience_iteration_runs
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS drawing_package_experience_iteration_runs_runtime_insert
  ON public.drawing_package_experience_iteration_runs;
CREATE POLICY drawing_package_experience_iteration_runs_runtime_insert
  ON public.drawing_package_experience_iteration_runs
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;
