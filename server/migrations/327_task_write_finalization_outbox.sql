BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 327';
  END IF;
  IF to_regnamespace('workbuddy_private') IS NULL THEN
    RAISE EXCEPTION 'workbuddy_private schema is required before applying migration 327';
  END IF;
END
$$;

-- BEGIN MIGRATION 327
CREATE TABLE IF NOT EXISTS public.task_write_finalization_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  previous_task JSONB NOT NULL CHECK (jsonb_typeof(previous_task) = 'object'),
  next_task JSONB NOT NULL CHECK (jsonb_typeof(next_task) = 'object'),
  actor_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','failed','completed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (project_id, company_id)
    REFERENCES public.projects(id, company_id) ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_write_finalization_outbox_claim
  ON public.task_write_finalization_outbox (
    processing_status,
    next_attempt_at,
    lease_expires_at,
    sequence_id
  )
  WHERE processing_status IN ('pending','processing','failed');

CREATE INDEX IF NOT EXISTS idx_task_write_finalization_outbox_task_order
  ON public.task_write_finalization_outbox (task_id, sequence_id)
  WHERE processing_status <> 'completed';

CREATE OR REPLACE FUNCTION workbuddy_private.enqueue_task_write_finalization_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  project_company_id UUID;
BEGIN
  IF pg_catalog.current_setting('workbuddy.task_finalization_outbox_mode', TRUE)
       IS NOT DISTINCT FROM 'canonical_inline' THEN
    RETURN NEW;
  END IF;

  SELECT project.company_id
    INTO project_company_id
    FROM public.projects project
   WHERE project.id = NEW.project_id;

  IF project_company_id IS NULL THEN
    RAISE EXCEPTION 'task finalization outbox project company scope is missing';
  END IF;

  INSERT INTO public.task_write_finalization_outbox (
    company_id,
    project_id,
    task_id,
    previous_task,
    next_task,
    actor_user_id,
    processing_status,
    next_attempt_at,
    created_at,
    updated_at
  ) VALUES (
    project_company_id,
    NEW.project_id,
    NEW.id,
    to_jsonb(OLD),
    to_jsonb(NEW),
    NEW.updated_by,
    'pending',
    NOW(),
    NOW(),
    NOW()
  );

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS enqueue_task_write_finalization_outbox_trigger
  ON public.tasks;
CREATE TRIGGER enqueue_task_write_finalization_outbox_trigger
AFTER UPDATE ON public.tasks
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.progress IS DISTINCT FROM NEW.progress
  OR OLD.actual_start_date IS DISTINCT FROM NEW.actual_start_date
  OR OLD.actual_end_date IS DISTINCT FROM NEW.actual_end_date
  OR OLD.first_progress_at IS DISTINCT FROM NEW.first_progress_at
)
EXECUTE FUNCTION workbuddy_private.enqueue_task_write_finalization_outbox();

REVOKE ALL ON FUNCTION workbuddy_private.enqueue_task_write_finalization_outbox()
  FROM PUBLIC, anon, authenticated, workbuddy_runtime;

ALTER TABLE public.task_write_finalization_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_write_finalization_outbox FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.task_write_finalization_outbox FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS task_write_finalization_outbox_runtime
  ON public.task_write_finalization_outbox;
CREATE POLICY task_write_finalization_outbox_runtime
  ON public.task_write_finalization_outbox
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_write_finalization_outbox TO workbuddy_runtime;

COMMENT ON TABLE public.task_write_finalization_outbox IS
  'Durable transactional handoff for canonical task write finalization side effects.';
-- END MIGRATION 327

NOTIFY pgrst, 'reload schema';

COMMIT;
