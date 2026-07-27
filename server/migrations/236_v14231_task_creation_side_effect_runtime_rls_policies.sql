-- v1.4.23.1 C-18.L09 follow-up: task creation writes runtime side-effect
-- rows inside the main transaction. Under the non-bypass runtime DB role,
-- task_timeline_events and operation_logs need explicit backend policies.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_timeline_events TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.operation_logs TO workbuddy_runtime';
  END IF;
END $$;

ALTER TABLE public.task_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_timeline_events_backend_runtime_policy ON public.task_timeline_events;
CREATE POLICY task_timeline_events_backend_runtime_policy ON public.task_timeline_events
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS operation_logs_backend_runtime_policy ON public.operation_logs;
CREATE POLICY operation_logs_backend_runtime_policy ON public.operation_logs
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMIT;
