-- v1.4.23.1 C-18.L03 follow-up: the backend runtime role must be able to
-- read and maintain users during authentication/session freshness checks.
--
-- The application enforces user-facing auth in Express. The runtime database
-- role is intentionally non-BYPASSRLS, so it still needs an explicit users
-- table policy; otherwise login, /auth/me and token-version revocation checks
-- can see zero users and reject valid sessions.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS users_backend_runtime_policy ON public.users;
CREATE POLICY users_backend_runtime_policy ON public.users
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;
