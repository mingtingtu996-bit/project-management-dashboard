-- 205_v14225_runtime_consumer_runtime_calls.sql
-- v1.4.22.5: production evidence source for runtime consumer facade calls.
-- This table records runtime-path call evidence only. It does not write
-- algorithm seeds, task facts, baseline, monthly plan, or runtime artifact tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.runtime_consumer_runtime_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_key TEXT NOT NULL,
  runtime_entry_ref TEXT NOT NULL,
  call_status TEXT NOT NULL
    CHECK (call_status IN ('called', 'rejected')),
  call_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  writes_runtime_directly BOOLEAN NOT NULL DEFAULT false,
  writes_fact_directly BOOLEAN NOT NULL DEFAULT false,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT runtime_consumer_runtime_calls_no_runtime_writes CHECK (
    writes_runtime_directly = false
    AND writes_fact_directly = false
  )
);

CREATE INDEX IF NOT EXISTS idx_runtime_consumer_runtime_calls_consumer
  ON public.runtime_consumer_runtime_calls(consumer_key, call_status, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_consumer_runtime_calls_entry
  ON public.runtime_consumer_runtime_calls(runtime_entry_ref, consumer_key, called_at DESC);

ALTER TABLE public.runtime_consumer_runtime_calls ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS runtime_consumer_runtime_calls_write_service_role
  ON public.runtime_consumer_runtime_calls;
CREATE POLICY runtime_consumer_runtime_calls_write_service_role
  ON public.runtime_consumer_runtime_calls
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (
    auth.role() = 'service_role'
    AND writes_runtime_directly = false
    AND writes_fact_directly = false
  );

COMMENT ON TABLE public.runtime_consumer_runtime_calls IS
  'v1.4.22.5 read-side production evidence that a facade-backed duration runtime consumer was called on the live runtime path; this table is not a runtime writer or fact writer.';

COMMENT ON CONSTRAINT runtime_consumer_runtime_calls_no_runtime_writes
  ON public.runtime_consumer_runtime_calls IS
  'Runtime consumer call evidence proves runtime-path invocation only. It cannot directly write runtime artifacts, task facts, baseline, monthly plan, or seed tables.';

NOTIFY pgrst, 'reload schema';

COMMIT;
