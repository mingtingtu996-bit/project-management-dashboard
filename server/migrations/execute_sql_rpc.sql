-- ============================================================
-- Deprecated RPC lockdown: execute_sql
--
-- This file used to create a SECURITY DEFINER helper that accepted arbitrary
-- SQL text and granted it to anon/authenticated. Keep the historical filename
-- as a lockdown script so manual re-runs remove the unsafe RPC instead of
-- recreating it.
-- ============================================================

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
