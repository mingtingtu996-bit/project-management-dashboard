-- Roll back only the runtime RLS policies. The table privileges predate this
-- migration through the shared workbuddy_runtime grant baseline.

BEGIN;

DROP POLICY IF EXISTS drawing_package_experience_iteration_runs_runtime_insert
  ON public.drawing_package_experience_iteration_runs;
DROP POLICY IF EXISTS drawing_package_experience_iteration_runs_runtime_select
  ON public.drawing_package_experience_iteration_runs;

COMMIT;
