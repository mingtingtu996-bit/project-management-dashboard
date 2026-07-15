-- v1.4.23.1 security hardening: lock down legacy SECURITY DEFINER RPCs.
--
-- SECURITY DEFINER functions inherit owner privileges, so they must not keep
-- PostgreSQL's default PUBLIC execute grant. Runtime access should go through
-- backend services that enforce project/company membership.

DO $$
BEGIN
  IF to_regprocedure('public.replace_task_dependencies(uuid,jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.replace_task_dependencies(UUID, JSONB) FROM authenticated';
    END IF;
  END IF;

  IF to_regprocedure('public.increment_task_code_sequence(uuid,uuid,text,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.increment_task_code_sequence(UUID, UUID, TEXT, INTEGER) FROM authenticated';
    END IF;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.nextval(TEXT);
