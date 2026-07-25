-- 326: Persist canonical task-write finalization work in the task mutation transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_write_finalization_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id TEXT,
  previous_task JSONB NOT NULL,
  next_task JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_write_finalization_outbox_previous_task_check
    CHECK (jsonb_typeof(previous_task) = 'object'),
  CONSTRAINT task_write_finalization_outbox_next_task_check
    CHECK (jsonb_typeof(next_task) = 'object'),
  CONSTRAINT task_write_finalization_outbox_status_check
    CHECK (processing_status IN ('pending', 'processing', 'failed', 'completed')),
  CONSTRAINT task_write_finalization_outbox_attempt_count_check
    CHECK (attempt_count >= 0),
  CONSTRAINT task_write_finalization_outbox_lease_check
    CHECK (
      (processing_status = 'processing' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR (processing_status <> 'processing' AND lease_owner IS NULL AND lease_expires_at IS NULL)
    ),
  CONSTRAINT task_write_finalization_outbox_completion_check
    CHECK (
      (processing_status = 'completed' AND completed_at IS NOT NULL)
      OR (processing_status <> 'completed' AND completed_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_task_write_finalization_outbox_claim
  ON public.task_write_finalization_outbox (
    processing_status,
    next_attempt_at,
    attempt_count,
    created_at,
    id
  );

CREATE INDEX IF NOT EXISTS idx_task_write_finalization_outbox_task_order
  ON public.task_write_finalization_outbox (task_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_task_write_finalization_outbox_expired_lease
  ON public.task_write_finalization_outbox (lease_expires_at, id)
  WHERE processing_status = 'processing';

CREATE OR REPLACE FUNCTION public.enqueue_task_write_finalization_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  INSERT INTO public.task_write_finalization_outbox (
    company_id,
    project_id,
    task_id,
    actor_id,
    previous_task,
    next_task
  )
  SELECT project.company_id,
         NEW.project_id,
         NEW.id,
         COALESCE(NEW.updated_by::text, NEW.created_by::text, OLD.updated_by::text, OLD.created_by::text),
         to_jsonb(OLD),
         to_jsonb(NEW)
    FROM public.projects project
   WHERE project.id = NEW.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'task_write_finalization_project_not_found:%:%', NEW.id, NEW.project_id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    ALTER FUNCTION public.enqueue_task_write_finalization_outbox() OWNER TO service_role;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.enqueue_task_write_finalization_outbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_task_write_finalization_outbox()
  TO workbuddy_runtime, service_role;

DROP TRIGGER IF EXISTS task_write_finalization_outbox_on_update ON public.tasks;
CREATE TRIGGER task_write_finalization_outbox_on_update
  AFTER UPDATE OF progress, status, actual_start_date, actual_end_date, first_progress_at
  ON public.tasks
  FOR EACH ROW
  WHEN (
    OLD.progress IS DISTINCT FROM NEW.progress
    OR OLD.status IS DISTINCT FROM NEW.status
    OR OLD.actual_start_date IS DISTINCT FROM NEW.actual_start_date
    OR OLD.actual_end_date IS DISTINCT FROM NEW.actual_end_date
    OR OLD.first_progress_at IS DISTINCT FROM NEW.first_progress_at
  )
  EXECUTE FUNCTION public.enqueue_task_write_finalization_outbox();

ALTER TABLE public.task_write_finalization_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_write_finalization_outbox FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.task_write_finalization_outbox FROM PUBLIC;
GRANT SELECT, UPDATE ON TABLE public.task_write_finalization_outbox
  TO workbuddy_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_write_finalization_outbox
  TO service_role;

DROP POLICY IF EXISTS task_write_finalization_outbox_runtime_policy
  ON public.task_write_finalization_outbox;
CREATE POLICY task_write_finalization_outbox_runtime_policy
  ON public.task_write_finalization_outbox
  FOR ALL
  TO workbuddy_runtime
  USING (
    (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
    AND EXISTS (
      SELECT 1
        FROM public.projects project
       WHERE project.id = task_write_finalization_outbox.project_id
         AND project.company_id = task_write_finalization_outbox.company_id
    )
  )
  WITH CHECK (
    (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
    AND EXISTS (
      SELECT 1
        FROM public.projects project
       WHERE project.id = task_write_finalization_outbox.project_id
         AND project.company_id = task_write_finalization_outbox.company_id
    )
  );

DROP POLICY IF EXISTS task_write_finalization_outbox_service_policy
  ON public.task_write_finalization_outbox;
CREATE POLICY task_write_finalization_outbox_service_policy
  ON public.task_write_finalization_outbox
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.task_write_finalization_outbox IS
  'Durable, ordered handoff from committed task execution-fact changes to canonical task-write finalization.';

NOTIFY pgrst, 'reload schema';

COMMIT;
