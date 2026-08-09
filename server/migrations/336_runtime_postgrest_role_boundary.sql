-- Allow the private backend runtime JWT to assume the existing RLS-governed role.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 336';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    RAISE EXCEPTION 'authenticator role is required before applying migration 336';
  END IF;
END $$;

GRANT workbuddy_runtime TO authenticator;

COMMIT;
