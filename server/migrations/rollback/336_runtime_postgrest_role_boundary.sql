-- Remove the PostgREST ability to assume the private backend runtime role.

BEGIN;

REVOKE workbuddy_runtime FROM authenticator;

DO $$
BEGIN
  IF pg_has_role('authenticator', 'workbuddy_runtime', 'member') THEN
    RAISE EXCEPTION 'migration 336 rollback did not revoke authenticator membership';
  END IF;
END $$;

COMMIT;
