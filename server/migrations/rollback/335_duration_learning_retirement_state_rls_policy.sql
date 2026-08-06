-- Remove only the explicit deny-all policy; the table's pre-existing RLS boundary remains.

BEGIN;

DROP POLICY IF EXISTS duration_learning_legacy_runtime_retirement_state_deny_all
  ON public.duration_learning_legacy_runtime_retirement_state;

COMMIT;
