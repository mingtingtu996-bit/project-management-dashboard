-- Roll back the duration-learning committed-evidence outbox boundary.

BEGIN;

DROP TABLE IF EXISTS public.duration_learning_runtime_evidence_outbox;

NOTIFY pgrst, 'reload schema';

COMMIT;
