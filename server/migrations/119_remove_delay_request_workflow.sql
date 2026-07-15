-- 119_remove_delay_request_workflow.sql
-- Delay requests are no longer a business workflow. Current schedule edits,
-- automatic delay signals, progress snapshots, and change logs are the source
-- of truth.

BEGIN;

DROP TRIGGER IF EXISTS trigger_record_task_delay ON public.tasks;
DROP FUNCTION IF EXISTS public.record_task_delay_history() CASCADE;
DROP FUNCTION IF EXISTS public.approve_delay_request_atomic(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.reject_delay_request_atomic(UUID, UUID) CASCADE;

ALTER TABLE IF EXISTS public.notifications
  DROP COLUMN IF EXISTS delay_request_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_daily_snapshot'
      AND column_name = 'active_delay_requests'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'project_daily_snapshot'
        AND column_name = 'active_delayed_tasks'
    ) THEN
      ALTER TABLE public.project_daily_snapshot
        RENAME COLUMN active_delay_requests TO active_delayed_tasks;
    ELSE
      UPDATE public.project_daily_snapshot
      SET active_delayed_tasks = COALESCE(active_delayed_tasks, active_delay_requests)
      WHERE active_delayed_tasks IS NULL
        AND active_delay_requests IS NOT NULL;

      ALTER TABLE public.project_daily_snapshot
        DROP COLUMN active_delay_requests;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.delay_requests CASCADE;
DROP TABLE IF EXISTS public.task_delay_history CASCADE;

COMMIT;
