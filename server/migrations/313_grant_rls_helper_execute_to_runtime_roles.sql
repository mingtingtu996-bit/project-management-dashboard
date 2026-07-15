-- Ensure every production runtime role that can trigger project RLS can execute
-- the active-company membership helper. Migration 312 granted the concrete
-- runtime login role, but production startup still failed through the Supabase
-- anon read path with permission denied on this function.

BEGIN;

DO $$
DECLARE
  target_function regprocedure;
  target_role text;
BEGIN
  FOR target_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_active_company_member'
  LOOP
    FOREACH target_role IN ARRAY ARRAY[
      'anon',
      'authenticated',
      'service_role',
      'workbuddy_runtime',
      'workbuddy_runtime_login'
    ]
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', target_function, target_role);
      END IF;
    END LOOP;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT workbuddy_runtime TO workbuddy_runtime_login';
    END IF;
  END IF;
END $$;

COMMIT;
