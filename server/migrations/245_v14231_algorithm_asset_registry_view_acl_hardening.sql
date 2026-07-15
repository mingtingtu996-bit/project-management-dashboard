-- v1.4.23.1 follow-up: harden algorithm_asset_registry_view so ordinary
-- consumers cannot read the governance registry directly.

BEGIN;

DO $$
DECLARE
  role_name text;
BEGIN
  IF to_regclass('public.algorithm_asset_registry_view') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.algorithm_asset_registry_view SET (security_invoker = true, security_barrier = true)';
    EXECUTE 'REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM PUBLIC';

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'workbuddy_runtime'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM %I', role_name);
      END IF;
    END LOOP;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
