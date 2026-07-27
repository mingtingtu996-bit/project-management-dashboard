BEGIN;

DROP VIEW IF EXISTS public.current_execution_facts;
DROP POLICY IF EXISTS execution_fact_events_member_read ON public.execution_fact_events;
DROP POLICY IF EXISTS execution_fact_events_backend_runtime_read ON public.execution_fact_events;
DROP POLICY IF EXISTS execution_fact_events_backend_runtime_insert ON public.execution_fact_events;
DROP TRIGGER IF EXISTS ensure_execution_fact_event_scope_trigger ON public.execution_fact_events;
DROP TRIGGER IF EXISTS reject_execution_fact_event_mutation_trigger ON public.execution_fact_events;
DROP TABLE IF EXISTS public.execution_fact_events;
DROP FUNCTION IF EXISTS workbuddy_private.ensure_execution_fact_event_scope();
DROP FUNCTION IF EXISTS workbuddy_private.reject_execution_fact_event_mutation();

NOTIFY pgrst, 'reload schema';

COMMIT;
