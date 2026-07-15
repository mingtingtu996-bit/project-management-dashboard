-- v1.4.23.1 C-18.L03 follow-up: runtime role must be able to execute
-- helper functions referenced by FORCE RLS policies.
--
-- 227 created public.is_active_company_member(...) for tenant predicates and
-- 228 moved the backend runtime connection to the non-bypass workbuddy_runtime
-- role. Without EXECUTE on the helper, normal runtime reads can fail with
-- "permission denied for function is_active_company_member" before policy
-- predicates resolve.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime';
  END IF;
END $$;

COMMIT;
