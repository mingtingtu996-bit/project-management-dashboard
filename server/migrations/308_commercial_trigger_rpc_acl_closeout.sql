-- Close the Supabase Advisor RPC ACL findings for commercial trigger functions.
-- Trigger execution remains unchanged; only direct function invocation is narrowed.

BEGIN;

DO $migration$
DECLARE
  function_identity TEXT;
  role_name TEXT;
BEGIN
  FOREACH function_identity IN ARRAY ARRAY[
    'public.workbuddy_initialize_company_commercial()',
    'public.workbuddy_meter_company_projects()'
  ] LOOP
    IF to_regprocedure(function_identity) IS NULL THEN
      RAISE EXCEPTION 'required commercial trigger function is missing: %', function_identity;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', function_identity);

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', function_identity, role_name);
      END IF;
    END LOOP;

    FOREACH role_name IN ARRAY ARRAY[
      'service_role',
      'workbuddy_runtime',
      'workbuddy_runtime_login'
    ] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', function_identity, role_name);
      END IF;
    END LOOP;
  END LOOP;
END
$migration$;

NOTIFY pgrst, 'reload schema';

COMMIT;
