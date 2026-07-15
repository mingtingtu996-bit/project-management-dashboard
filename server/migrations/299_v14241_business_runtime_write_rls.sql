-- Complete the backend runtime RLS path exercised by the controlled staging
-- business-loop UAT. The API has already authenticated and authorized project
-- scope before these tables are accessed through the low-privilege DB role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 299';
  END IF;

  IF to_regclass('public.task_conditions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_conditions TO workbuddy_runtime;
    DROP POLICY IF EXISTS task_conditions_backend_runtime_policy ON public.task_conditions;
    CREATE POLICY task_conditions_backend_runtime_policy
      ON public.task_conditions
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
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notifications TO workbuddy_runtime;
    DROP POLICY IF EXISTS notifications_backend_runtime_policy ON public.notifications;
    CREATE POLICY notifications_backend_runtime_policy
      ON public.notifications
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
  END IF;
END
$$;
