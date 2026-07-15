-- Ensure the concrete production runtime login can execute RLS helper functions.
-- This is intentionally additive and idempotent: it only grants privileges when
-- the expected roles/functions already exist.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_active_company_member'
      AND pg_get_function_identity_arguments(p.oid) = 'UUID, TEXT[]'
  ) THEN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
      EXECUTE 'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS';

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
        EXECUTE 'GRANT workbuddy_runtime TO workbuddy_runtime_login';
      END IF;

      EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime_login';
    END IF;
  END IF;
END $$;

COMMIT;
