BEGIN;

DROP TABLE IF EXISTS public.algorithm_intervention_evaluations;

NOTIFY pgrst, 'reload schema';

COMMIT;
