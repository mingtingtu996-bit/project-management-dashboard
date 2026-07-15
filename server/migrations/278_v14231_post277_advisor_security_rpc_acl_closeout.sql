-- v1.4.23.1 post-277 Supabase Advisor security RPC ACL closeout.
--
-- Public exposed SECURITY DEFINER helpers must not be executable through
-- PostgREST RPC by anon/authenticated roles. Keep RLS predicates functional by
-- moving their callable surface to a non-exposed private schema, then revoke
-- public RPC execution and hide the legacy dashboard materialized view from API
-- roles.

BEGIN;

CREATE SCHEMA IF NOT EXISTS workbuddy_private;

REVOKE ALL ON SCHEMA workbuddy_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION workbuddy_private.is_active_company_member(
  p_company_id UUID,
  p_allowed_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND cm.status = 'active'
      AND (
        p_allowed_roles IS NULL
        OR cm.role = ANY(p_allowed_roles)
      )
  );
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.is_active_project_member(
  p_project_id UUID,
  p_allowed_permission_levels TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND COALESCE(pm.is_active, true) = true
      AND (
        p_allowed_permission_levels IS NULL
        OR pm.permission_level = ANY(p_allowed_permission_levels)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = auth.uid()
      AND (
        p_allowed_permission_levels IS NULL
        OR p_allowed_permission_levels && ARRAY['owner', 'project_owner', 'editor', 'project_editor']::TEXT[]
      )
  );
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.is_project_member(
  project_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = project_uuid
      AND user_id = user_uuid
      AND COALESCE(is_active, true) = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.is_project_owner(
  project_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = project_uuid
      AND owner_id = user_uuid
  );
END;
$$;

CREATE OR REPLACE FUNCTION workbuddy_private.has_project_edit_permission(
  project_uuid UUID,
  user_uuid UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = project_uuid
      AND user_id = user_uuid
      AND COALESCE(is_active, true) = true
      AND permission_level IN ('owner', 'project_owner', 'editor', 'project_editor')
  ) OR EXISTS (
    SELECT 1
    FROM public.projects
    WHERE id = project_uuid
      AND owner_id = user_uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION workbuddy_private.is_active_project_member(UUID, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION workbuddy_private.is_project_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION workbuddy_private.is_project_owner(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION workbuddy_private.has_project_edit_permission(UUID, UUID) FROM PUBLIC;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'workbuddy_runtime',
    'workbuddy_runtime_login'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT USAGE ON SCHEMA workbuddy_private TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_company_member(UUID, TEXT[]) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.is_active_project_member(UUID, TEXT[]) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.is_project_member(UUID, UUID) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.is_project_owner(UUID, UUID) TO %I', role_name);
      EXECUTE format('GRANT EXECUTE ON FUNCTION workbuddy_private.has_project_edit_permission(UUID, UUID) TO %I', role_name);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  policy_record RECORD;
  role_text TEXT;
  command_text TEXT;
  using_expr TEXT;
  check_expr TEXT;
  create_sql TEXT;
BEGIN
  FOR policy_record IN
    SELECT n.nspname,
           c.relname,
           p.polname,
           p.polcmd,
           p.polpermissive,
           p.polroles,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND (
         COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ~* '(^|[^[:alnum:]_.])(public\.)?(is_active_company_member|is_active_project_member|is_project_member|is_project_owner|has_project_edit_permission)\s*\('
         OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* '(^|[^[:alnum:]_.])(public\.)?(is_active_company_member|is_active_project_member|is_project_member|is_project_owner|has_project_edit_permission)\s*\('
       )
  LOOP
    SELECT string_agg(
             CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE quote_ident(r.rolname) END,
             ', '
             ORDER BY role_oid
           )
      INTO role_text
      FROM unnest(policy_record.polroles) AS role_oid
      LEFT JOIN pg_roles r ON r.oid = role_oid;

    role_text := COALESCE(NULLIF(role_text, ''), 'PUBLIC');

    command_text := CASE policy_record.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
      ELSE 'ALL'
    END;

    using_expr := policy_record.using_expr;
    check_expr := policy_record.check_expr;

    IF using_expr IS NOT NULL THEN
      using_expr := regexp_replace(using_expr, 'public\.is_active_company_member\s*\(', 'workbuddy_private.is_active_company_member(', 'gi');
      using_expr := regexp_replace(using_expr, 'public\.is_active_project_member\s*\(', 'workbuddy_private.is_active_project_member(', 'gi');
      using_expr := regexp_replace(using_expr, 'public\.is_project_member\s*\(', 'workbuddy_private.is_project_member(', 'gi');
      using_expr := regexp_replace(using_expr, 'public\.is_project_owner\s*\(', 'workbuddy_private.is_project_owner(', 'gi');
      using_expr := regexp_replace(using_expr, 'public\.has_project_edit_permission\s*\(', 'workbuddy_private.has_project_edit_permission(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])is_active_company_member\s*\(', '\1workbuddy_private.is_active_company_member(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])is_active_project_member\s*\(', '\1workbuddy_private.is_active_project_member(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])is_project_member\s*\(', '\1workbuddy_private.is_project_member(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])is_project_owner\s*\(', '\1workbuddy_private.is_project_owner(', 'gi');
      using_expr := regexp_replace(using_expr, '(^|[^.[:alnum:]_])has_project_edit_permission\s*\(', '\1workbuddy_private.has_project_edit_permission(', 'gi');
    END IF;

    IF check_expr IS NOT NULL THEN
      check_expr := regexp_replace(check_expr, 'public\.is_active_company_member\s*\(', 'workbuddy_private.is_active_company_member(', 'gi');
      check_expr := regexp_replace(check_expr, 'public\.is_active_project_member\s*\(', 'workbuddy_private.is_active_project_member(', 'gi');
      check_expr := regexp_replace(check_expr, 'public\.is_project_member\s*\(', 'workbuddy_private.is_project_member(', 'gi');
      check_expr := regexp_replace(check_expr, 'public\.is_project_owner\s*\(', 'workbuddy_private.is_project_owner(', 'gi');
      check_expr := regexp_replace(check_expr, 'public\.has_project_edit_permission\s*\(', 'workbuddy_private.has_project_edit_permission(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])is_active_company_member\s*\(', '\1workbuddy_private.is_active_company_member(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])is_active_project_member\s*\(', '\1workbuddy_private.is_active_project_member(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])is_project_member\s*\(', '\1workbuddy_private.is_project_member(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])is_project_owner\s*\(', '\1workbuddy_private.is_project_owner(', 'gi');
      check_expr := regexp_replace(check_expr, '(^|[^.[:alnum:]_])has_project_edit_permission\s*\(', '\1workbuddy_private.has_project_edit_permission(', 'gi');
    END IF;

    create_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      policy_record.polname,
      policy_record.nspname,
      policy_record.relname,
      CASE WHEN policy_record.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      command_text,
      role_text
    );

    IF using_expr IS NOT NULL AND command_text IN ('SELECT', 'UPDATE', 'DELETE', 'ALL') THEN
      create_sql := create_sql || format(' USING (%s)', using_expr);
    END IF;

    IF check_expr IS NOT NULL AND command_text IN ('INSERT', 'UPDATE', 'ALL') THEN
      create_sql := create_sql || format(' WITH CHECK (%s)', check_expr);
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_record.polname, policy_record.nspname, policy_record.relname);
    EXECUTE create_sql;
  END LOOP;
END $$;

DO $$
DECLARE
  function_identity TEXT;
  role_name TEXT;
BEGIN
  FOREACH function_identity IN ARRAY ARRAY[
    'public.has_project_edit_permission(uuid, uuid)',
    'public.is_active_company_member(uuid, text[])',
    'public.is_active_project_member(uuid, text[])',
    'public.is_project_member(uuid, uuid)',
    'public.is_project_owner(uuid, uuid)'
  ] LOOP
    IF to_regprocedure(function_identity) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', function_identity);

      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', function_identity, role_name);
        END IF;
      END LOOP;

      FOREACH role_name IN ARRAY ARRAY['service_role', 'workbuddy_runtime', 'workbuddy_runtime_login'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', function_identity, role_name);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  IF to_regclass('public.mv_project_dashboard') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.mv_project_dashboard FROM PUBLIC;

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.mv_project_dashboard FROM %I', role_name);
      END IF;
    END LOOP;

    FOREACH role_name IN ARRAY ARRAY['service_role', 'workbuddy_runtime', 'workbuddy_runtime_login'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('GRANT SELECT ON TABLE public.mv_project_dashboard TO %I', role_name);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
