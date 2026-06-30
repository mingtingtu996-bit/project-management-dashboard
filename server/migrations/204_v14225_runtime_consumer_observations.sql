-- 204_v14225_runtime_consumer_observations.sql
-- v1.4.22.5: production evidence source for runtime consumer observations.
-- This table records read-side observations only. It does not write algorithm
-- seeds, task facts, baseline, monthly plan, or runtime artifact tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.runtime_consumer_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key TEXT NOT NULL,
  publication_key TEXT NOT NULL,
  consumer_key TEXT NOT NULL,
  consumer_surface TEXT NOT NULL,
  observation_status TEXT NOT NULL
    CHECK (observation_status IN ('observed', 'rejected')),
  observation_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  writes_runtime_directly BOOLEAN NOT NULL DEFAULT false,
  writes_fact_directly BOOLEAN NOT NULL DEFAULT false,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT runtime_consumer_observations_no_runtime_writes CHECK (
    writes_runtime_directly = false
    AND writes_fact_directly = false
  )
);

CREATE INDEX IF NOT EXISTS idx_runtime_consumer_observations_asset
  ON public.runtime_consumer_observations(asset_key, observation_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_consumer_observations_publication
  ON public.runtime_consumer_observations(publication_key, consumer_key, observed_at DESC);

ALTER TABLE public.runtime_consumer_observations ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS runtime_consumer_observations_write_service_role
  ON public.runtime_consumer_observations;
CREATE POLICY runtime_consumer_observations_write_service_role
  ON public.runtime_consumer_observations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (
    auth.role() = 'service_role'
    AND writes_runtime_directly = false
    AND writes_fact_directly = false
  );

COMMENT ON TABLE public.runtime_consumer_observations IS
  'v1.4.22.5 read-side production evidence that a runtime consumer observed a published/canary learnable duration artifact; this table is not a runtime writer or fact writer.';

COMMENT ON CONSTRAINT runtime_consumer_observations_no_runtime_writes
  ON public.runtime_consumer_observations IS
  'Runtime consumer observations prove consumption only. They cannot directly write runtime artifacts, task facts, baseline, monthly plan, or seed tables.';

NOTIFY pgrst, 'reload schema';

COMMIT;
