BEGIN;

DROP TABLE IF EXISTS public.duration_learning_runtime_publications;

NOTIFY pgrst, 'reload schema';

COMMIT;
