-- v1.4.23.1 follow-up: planning write-path RLS closeout.
--
-- The backend runtime login inherits workbuddy_runtime. These policies allow
-- the application runtime to persist governed baseline and monthly-plan writes
-- while keeping RLS enabled for direct client access.

BEGIN;

ALTER TABLE IF EXISTS public.task_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.task_baseline_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.monthly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.monthly_plan_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.task_baseline_items
  ADD COLUMN IF NOT EXISTS source_chip TEXT,
  ADD COLUMN IF NOT EXISTS source_reason TEXT,
  ADD COLUMN IF NOT EXISTS missing_process_in_baseline BOOLEAN,
  ADD COLUMN IF NOT EXISTS manual_override_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.monthly_plan_items
  ADD COLUMN IF NOT EXISTS source_chip TEXT,
  ADD COLUMN IF NOT EXISTS source_reason TEXT,
  ADD COLUMN IF NOT EXISTS missing_process_in_baseline BOOLEAN,
  ADD COLUMN IF NOT EXISTS manual_override_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS generation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    IF to_regclass('public.task_baselines') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_baselines TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS task_baselines_backend_runtime_policy ON public.task_baselines';
      EXECUTE $policy$
        CREATE POLICY task_baselines_backend_runtime_policy
          ON public.task_baselines
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.task_baseline_items') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_baseline_items TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS task_baseline_items_backend_runtime_policy ON public.task_baseline_items';
      EXECUTE $policy$
        CREATE POLICY task_baseline_items_backend_runtime_policy
          ON public.task_baseline_items
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.monthly_plans') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.monthly_plans TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS monthly_plans_backend_runtime_policy ON public.monthly_plans';
      EXECUTE $policy$
        CREATE POLICY monthly_plans_backend_runtime_policy
          ON public.monthly_plans
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;

    IF to_regclass('public.monthly_plan_items') IS NOT NULL THEN
      EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.monthly_plan_items TO workbuddy_runtime';
      EXECUTE 'DROP POLICY IF EXISTS monthly_plan_items_backend_runtime_policy ON public.monthly_plan_items';
      EXECUTE $policy$
        CREATE POLICY monthly_plan_items_backend_runtime_policy
          ON public.monthly_plan_items
          FOR ALL
          TO workbuddy_runtime
          USING (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
          WITH CHECK (
            current_user = 'workbuddy_runtime'
            OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
          )
      $policy$;
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
