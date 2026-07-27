-- v1.4.23.1 / C-18.01
-- Remove the historical arbitrary SQL RPC. It was SECURITY DEFINER, built SQL
-- from caller-supplied text, and had been granted to public API roles.

DO $$
DECLARE
  role_name text;
BEGIN
  IF to_regprocedure('public.execute_sql(text,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.execute_sql(text,jsonb) FROM PUBLIC';
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.execute_sql(text,jsonb) FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;

  IF to_regprocedure('public.execute_sql(text,anyarray)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.execute_sql(text,anyarray) FROM PUBLIC';
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.execute_sql(text,anyarray) FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.execute_sql(text, jsonb);
DROP FUNCTION IF EXISTS public.execute_sql(text, anyarray);
