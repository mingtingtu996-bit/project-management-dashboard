BEGIN;

DROP TRIGGER IF EXISTS task_write_finalization_outbox_on_update ON public.tasks;
DROP FUNCTION IF EXISTS public.enqueue_task_write_finalization_outbox();
DROP TABLE IF EXISTS public.task_write_finalization_outbox;

NOTIFY pgrst, 'reload schema';

COMMIT;
