-- Reconcile canonical staging index and execution-fact view projection drift.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_id_company_id_for_duration_benchmarks
  ON public.projects (id, company_id);

CREATE OR REPLACE VIEW public.current_execution_facts
WITH (security_invoker = true)
AS
SELECT
  event.id,
  event.company_id,
  event.project_id,
  event.entity_type,
  event.entity_id,
  event.fact_type,
  event.fact_value,
  event.effective_at,
  event.observed_at,
  event.source_module,
  event.source_event_id,
  event.actor_user_id,
  event.evidence_refs,
  event.confidence,
  event.supersedes_event_id,
  event.supersession_kind,
  event.correction_reason,
  event.idempotency_key,
  event.created_at
FROM public.execution_fact_events event
WHERE NOT EXISTS (
  SELECT 1
  FROM public.execution_fact_events successor
  WHERE successor.supersedes_event_id = event.id
);

NOTIFY pgrst, 'reload schema';

COMMIT;
