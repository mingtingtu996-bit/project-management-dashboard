BEGIN;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_task_id_fkey;

NOTIFY pgrst, 'reload schema';

COMMIT;
