-- v1.4.23.1 C-18.L09 follow-up: task creation bootstraps project
-- task-code rules inside the main write transaction. After runtime moved to a
-- non-bypass RLS role, the legacy service_role-only policies on these tables
-- block normal task creation with 42501.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.project_task_code_rules TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.task_code_sequences TO workbuddy_runtime';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.task_code_history TO workbuddy_runtime';
  END IF;
END $$;

ALTER TABLE public.project_task_code_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_code_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_code_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_task_code_rules_backend_runtime_policy ON public.project_task_code_rules;
CREATE POLICY project_task_code_rules_backend_runtime_policy ON public.project_task_code_rules
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

DROP POLICY IF EXISTS task_code_sequences_backend_runtime_policy ON public.task_code_sequences;
CREATE POLICY task_code_sequences_backend_runtime_policy ON public.task_code_sequences
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

DROP POLICY IF EXISTS task_code_history_backend_runtime_policy ON public.task_code_history;
CREATE POLICY task_code_history_backend_runtime_policy ON public.task_code_history
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
