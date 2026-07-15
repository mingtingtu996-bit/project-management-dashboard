-- Ensure every role that can evaluate project RLS can execute the non-exposed
-- active-company helper. Keep the legacy public helper backend-only so PostgREST
-- cannot expose its SECURITY DEFINER surface to anon/authenticated callers.

BEGIN;

DO $$
DECLARE
  target_role text;
BEGIN
  IF to_regprocedure('workbuddy_private.is_active_company_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private.is_active_company_member(uuid,text[]) is required before migration 313';
  END IF;

  FOREACH target_role IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'workbuddy_runtime',
    'workbuddy_runtime_login'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA workbuddy_private TO %I', target_role);
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO %I',
        target_role
      );
    END IF;
  END LOOP;

  IF to_regprocedure('public.is_active_company_member(uuid,text[])') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM PUBLIC';

    FOREACH target_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
        EXECUTE format(
          'REVOKE ALL ON FUNCTION public.is_active_company_member(UUID, TEXT[]) FROM %I',
          target_role
        );
      END IF;
    END LOOP;

    FOREACH target_role IN ARRAY ARRAY['service_role', 'workbuddy_runtime', 'workbuddy_runtime_login'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO %I',
          target_role
        );
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT workbuddy_runtime TO workbuddy_runtime_login';
    END IF;
  END IF;
END $$;

COMMIT;
