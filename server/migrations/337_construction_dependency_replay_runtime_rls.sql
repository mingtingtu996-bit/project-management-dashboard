-- Allow the non-bypass backend runtime to persist governed replay reports only.

BEGIN;

DO $$
DECLARE
  runtime_role_is_superuser BOOLEAN;
  runtime_role_can_login BOOLEAN;
  runtime_role_bypasses_rls BOOLEAN;
BEGIN
  IF to_regclass('public.construction_dependency_replay_calibration_reports') IS NULL THEN
    RAISE EXCEPTION 'construction_dependency_replay_calibration_reports is required before applying migration 337';
  END IF;

  SELECT rolsuper, rolcanlogin, rolbypassrls
  INTO runtime_role_is_superuser, runtime_role_can_login, runtime_role_bypasses_rls
  FROM pg_roles
  WHERE rolname = 'workbuddy_runtime';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 337';
  END IF;
  IF runtime_role_is_superuser OR runtime_role_can_login OR runtime_role_bypasses_rls THEN
    RAISE EXCEPTION 'workbuddy_runtime must remain NOSUPERUSER NOLOGIN NOBYPASSRLS';
  END IF;
END $$;

ALTER TABLE public.construction_dependency_replay_calibration_reports
  ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT
  ON TABLE public.construction_dependency_replay_calibration_reports
  TO workbuddy_runtime;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.construction_dependency_replay_calibration_reports
  FROM workbuddy_runtime;

DROP POLICY IF EXISTS construction_dependency_replay_report_backend_runtime_select
  ON public.construction_dependency_replay_calibration_reports;
CREATE POLICY construction_dependency_replay_report_backend_runtime_select
  ON public.construction_dependency_replay_calibration_reports
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS construction_dependency_replay_report_backend_runtime_insert
  ON public.construction_dependency_replay_calibration_reports;
CREATE POLICY construction_dependency_replay_report_backend_runtime_insert
  ON public.construction_dependency_replay_calibration_reports
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND project_id IS NOT NULL
    AND report_code = 'construction_dependency_replay_calibration'
    AND triggered_by = 'scheduled_or_manual_governance_job'
    AND runtime_mutation_policy = 'none_report_only'
    AND governance_policy ->> 'replayMode' = 'report_only'
    AND governance_policy ->> 'seedWritePolicy' = 'never_write_seed_from_replay'
    AND governance_policy ->> 'taskDependencyWritePolicy' = 'never_write_task_dependencies_from_replay'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'construction_dependency_replay_calibration_reports'
      AND relation.relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'migration 337 did not preserve RLS on the replay calibration report table';
  END IF;

  IF NOT has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'SELECT'
  ) OR NOT has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'migration 337 did not preserve runtime SELECT and INSERT table privileges';
  END IF;

  IF has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'UPDATE'
  ) OR has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'DELETE'
  ) OR has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'TRUNCATE'
  ) OR has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'REFERENCES'
  ) OR has_table_privilege(
    'workbuddy_runtime',
    'public.construction_dependency_replay_calibration_reports',
    'TRIGGER'
  ) THEN
    RAISE EXCEPTION 'migration 337 did not remove runtime mutation table privileges';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'construction_dependency_replay_calibration_reports'
      AND policyname = 'construction_dependency_replay_report_backend_runtime_select'
      AND cmd = 'SELECT'
      AND 'workbuddy_runtime' = ANY(roles)
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'construction_dependency_replay_calibration_reports'
      AND policyname = 'construction_dependency_replay_report_backend_runtime_insert'
      AND cmd = 'INSERT'
      AND 'workbuddy_runtime' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'migration 337 runtime replay report policies failed catalog readback';
  END IF;

  RAISE NOTICE 'MIGRATION_337_CONSTRUCTION_DEPENDENCY_REPLAY_RUNTIME_RLS_READBACK_COMPLETE';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
