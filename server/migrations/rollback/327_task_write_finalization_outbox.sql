BEGIN;

DROP TRIGGER IF EXISTS enqueue_task_write_finalization_outbox_trigger ON public.tasks;
DROP FUNCTION IF EXISTS workbuddy_private.enqueue_task_write_finalization_outbox();
DROP TABLE IF EXISTS public.task_write_finalization_outbox;

NOTIFY pgrst, 'reload schema';

COMMIT;
