-- Allow the low-privilege backend runtime role to append and read duration
-- runtime-consumer evidence. The ledgers remain immutable to that role and
-- unavailable to browser-facing anon/authenticated roles.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 309';
  END IF;
END
$$;

ALTER TABLE public.runtime_consumer_runtime_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.runtime_consumer_runtime_calls FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.runtime_consumer_runtime_calls FROM anon, authenticated;
DROP POLICY IF EXISTS runtime_consumer_runtime_calls_select_admin
  ON public.runtime_consumer_runtime_calls;
GRANT SELECT, INSERT ON TABLE public.runtime_consumer_runtime_calls TO workbuddy_runtime;
REVOKE UPDATE, DELETE ON TABLE public.runtime_consumer_runtime_calls FROM workbuddy_runtime;
DROP POLICY IF EXISTS runtime_consumer_runtime_calls_backend_runtime_read
  ON public.runtime_consumer_runtime_calls;
CREATE POLICY runtime_consumer_runtime_calls_backend_runtime_read
  ON public.runtime_consumer_runtime_calls
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );
DROP POLICY IF EXISTS runtime_consumer_runtime_calls_backend_runtime_append
  ON public.runtime_consumer_runtime_calls;
CREATE POLICY runtime_consumer_runtime_calls_backend_runtime_append
  ON public.runtime_consumer_runtime_calls
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND writes_runtime_directly = false
    AND writes_fact_directly = false
  );

ALTER TABLE public.runtime_consumer_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.runtime_consumer_observations FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.runtime_consumer_observations FROM anon, authenticated;
DROP POLICY IF EXISTS runtime_consumer_observations_select_admin
  ON public.runtime_consumer_observations;
GRANT SELECT, INSERT ON TABLE public.runtime_consumer_observations TO workbuddy_runtime;
REVOKE UPDATE, DELETE ON TABLE public.runtime_consumer_observations FROM workbuddy_runtime;
DROP POLICY IF EXISTS runtime_consumer_observations_backend_runtime_read
  ON public.runtime_consumer_observations;
CREATE POLICY runtime_consumer_observations_backend_runtime_read
  ON public.runtime_consumer_observations
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );
DROP POLICY IF EXISTS runtime_consumer_observations_backend_runtime_append
  ON public.runtime_consumer_observations;
CREATE POLICY runtime_consumer_observations_backend_runtime_append
  ON public.runtime_consumer_observations
  FOR INSERT
  TO workbuddy_runtime
  WITH CHECK (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND writes_runtime_directly = false
    AND writes_fact_directly = false
  );

COMMENT ON POLICY runtime_consumer_runtime_calls_backend_runtime_append
  ON public.runtime_consumer_runtime_calls IS
  'Backend runtime may append read-side facade-call evidence but cannot update or delete ledger rows.';
COMMENT ON POLICY runtime_consumer_observations_backend_runtime_append
  ON public.runtime_consumer_observations IS
  'Backend runtime may append lineage-bearing published artifact observations but cannot update or delete ledger rows.';

NOTIFY pgrst, 'reload schema';

COMMIT;
