-- Ensure the concrete production runtime login can execute the non-exposed RLS
-- helper. Public helper RPCs remain unavailable to browser-facing roles.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('workbuddy_private.is_active_company_member(uuid,text[])') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private.is_active_company_member(uuid,text[]) is required before migration 312';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA workbuddy_private TO workbuddy_runtime';
    EXECUTE 'GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime_login') THEN
    EXECUTE 'ALTER ROLE workbuddy_runtime_login WITH INHERIT NOBYPASSRLS';

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
      EXECUTE 'GRANT workbuddy_runtime TO workbuddy_runtime_login';
    END IF;

    EXECUTE 'GRANT USAGE ON SCHEMA workbuddy_private TO workbuddy_runtime_login';
    EXECUTE 'GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime_login';
  END IF;
END $$;

COMMIT;
