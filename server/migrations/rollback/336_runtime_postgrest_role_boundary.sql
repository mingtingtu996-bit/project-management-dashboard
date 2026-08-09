-- Remove the PostgREST ability to assume the private backend runtime role.

BEGIN;

REVOKE workbuddy_runtime FROM authenticator;

COMMIT;
