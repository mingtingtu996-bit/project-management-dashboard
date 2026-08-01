-- Restore the pre-reconciliation execution-fact projection and staging index state.

BEGIN;

DROP INDEX IF EXISTS public.uq_projects_id_company_id_for_duration_benchmarks;

CREATE OR REPLACE VIEW public.current_execution_facts
WITH (security_invoker = true)
AS
SELECT event.*
FROM public.execution_fact_events event
WHERE NOT EXISTS (
  SELECT 1
  FROM public.execution_fact_events successor
  WHERE successor.supersedes_event_id = event.id
);

NOTIFY pgrst, 'reload schema';

COMMIT;
