-- Allow the private backend runtime JWT to assume the existing RLS-governed role.

BEGIN;

DO $$
DECLARE
  runtime_role_is_superuser BOOLEAN;
  runtime_role_can_login BOOLEAN;
  runtime_role_bypasses_rls BOOLEAN;
  forbidden_role TEXT;
BEGIN
  SELECT rolsuper, rolcanlogin, rolbypassrls
  INTO runtime_role_is_superuser, runtime_role_can_login, runtime_role_bypasses_rls
  FROM pg_roles
  WHERE rolname = 'workbuddy_runtime';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 336';
  END IF;
  IF runtime_role_is_superuser OR runtime_role_can_login OR runtime_role_bypasses_rls THEN
    RAISE EXCEPTION 'workbuddy_runtime must remain NOSUPERUSER NOLOGIN NOBYPASSRLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    RAISE EXCEPTION 'authenticator role is required before applying migration 336';
  END IF;

  FOREACH forbidden_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = forbidden_role) THEN
      IF pg_has_role(forbidden_role, 'workbuddy_runtime', 'member') THEN
        RAISE EXCEPTION '% must not inherit workbuddy_runtime', forbidden_role;
      END IF;
    END IF;
  END LOOP;
END $$;

GRANT workbuddy_runtime TO authenticator;
REVOKE ADMIN OPTION FOR workbuddy_runtime FROM authenticator;

DO $$
DECLARE
  forbidden_role TEXT;
BEGIN
  IF NOT pg_has_role('authenticator', 'workbuddy_runtime', 'member') THEN
    RAISE EXCEPTION 'migration 336 did not grant authenticator membership';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE granted_role.rolname = 'workbuddy_runtime'
      AND member_role.rolname = 'authenticator'
      AND membership.admin_option = false
  ) THEN
    RAISE EXCEPTION 'authenticator must have direct workbuddy_runtime membership without ADMIN OPTION';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE granted_role.rolname = 'workbuddy_runtime'
      AND member_role.rolname = 'authenticator'
      AND membership.admin_option = true
  ) THEN
    RAISE EXCEPTION 'authenticator must not retain ADMIN OPTION on workbuddy_runtime';
  END IF;

  FOREACH forbidden_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = forbidden_role) THEN
      IF pg_has_role(forbidden_role, 'workbuddy_runtime', 'member') THEN
        RAISE EXCEPTION '% must not inherit workbuddy_runtime', forbidden_role;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
