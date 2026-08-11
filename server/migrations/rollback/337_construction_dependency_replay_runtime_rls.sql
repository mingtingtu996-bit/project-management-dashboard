-- Restore the pre-337 runtime ACL established by migration 228.

BEGIN;

DROP POLICY IF EXISTS construction_dependency_replay_report_backend_runtime_select
  ON public.construction_dependency_replay_calibration_reports;
DROP POLICY IF EXISTS construction_dependency_replay_report_backend_runtime_insert
  ON public.construction_dependency_replay_calibration_reports;

GRANT UPDATE, DELETE
  ON TABLE public.construction_dependency_replay_calibration_reports
  TO workbuddy_runtime;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'construction_dependency_replay_calibration_reports'
      AND policyname IN (
        'construction_dependency_replay_report_backend_runtime_select',
        'construction_dependency_replay_report_backend_runtime_insert'
      )
  ) THEN
    RAISE EXCEPTION 'migration 337 rollback did not remove runtime replay report policies';
  END IF;

  IF NOT has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'SELECT'
  ) OR NOT has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'INSERT'
  ) OR NOT has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'UPDATE'
  ) OR NOT has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'DELETE'
  ) THEN
    RAISE EXCEPTION 'migration 337 rollback did not restore the pre-337 runtime table ACL';
  END IF;

  RAISE NOTICE 'MIGRATION_337_CONSTRUCTION_DEPENDENCY_REPLAY_RUNTIME_RLS_ROLLBACK_COMPLETE';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
