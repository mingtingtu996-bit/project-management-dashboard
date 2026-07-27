-- v1.4.23.1 C-18.L03 follow-up: concrete runtime login role must be able
-- to execute helper functions referenced by FORCE RLS policies.
--
-- Migration 229 granted EXECUTE to the NOLOGIN group role workbuddy_runtime.
-- Real deployments connect as workbuddy_runtime_login, and a pre-existing
-- login role may not inherit the group role in every environment. Grant the
-- helper directly as a defensive live fix.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT workbuddy_runtime TO workbuddy_runtime_login';
    END IF;

    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime_login';
  END IF;
END $$;

COMMIT;
