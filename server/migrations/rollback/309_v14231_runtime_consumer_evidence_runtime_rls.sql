-- Restore the pre-309 runtime-consumer evidence access boundary.

BEGIN;

DROP POLICY IF EXISTS runtime_consumer_runtime_calls_backend_runtime_read
  ON public.runtime_consumer_runtime_calls;
DROP POLICY IF EXISTS runtime_consumer_runtime_calls_backend_runtime_append
  ON public.runtime_consumer_runtime_calls;
GRANT UPDATE, DELETE ON TABLE public.runtime_consumer_runtime_calls TO workbuddy_runtime;
GRANT ALL PRIVILEGES ON TABLE public.runtime_consumer_runtime_calls TO anon, authenticated;
DROP POLICY IF EXISTS runtime_consumer_runtime_calls_select_admin
  ON public.runtime_consumer_runtime_calls;
CREATE POLICY runtime_consumer_runtime_calls_select_admin
  ON public.runtime_consumer_runtime_calls
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS runtime_consumer_observations_backend_runtime_read
  ON public.runtime_consumer_observations;
DROP POLICY IF EXISTS runtime_consumer_observations_backend_runtime_append
  ON public.runtime_consumer_observations;
GRANT UPDATE, DELETE ON TABLE public.runtime_consumer_observations TO workbuddy_runtime;
GRANT ALL PRIVILEGES ON TABLE public.runtime_consumer_observations TO anon, authenticated;
DROP POLICY IF EXISTS runtime_consumer_observations_select_admin
  ON public.runtime_consumer_observations;
CREATE POLICY runtime_consumer_observations_select_admin
  ON public.runtime_consumer_observations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
