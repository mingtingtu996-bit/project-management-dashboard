-- Make the intentional deny-all boundary explicit for the internal retirement state.

BEGIN;

ALTER TABLE public.duration_learning_legacy_runtime_retirement_state
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_learning_legacy_runtime_retirement_state
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.duration_learning_legacy_runtime_retirement_state
  FROM PUBLIC;

DROP POLICY IF EXISTS duration_learning_legacy_runtime_retirement_state_deny_all
  ON public.duration_learning_legacy_runtime_retirement_state;
CREATE POLICY duration_learning_legacy_runtime_retirement_state_deny_all
  ON public.duration_learning_legacy_runtime_retirement_state
  FOR ALL
  TO PUBLIC
  USING (false)
  WITH CHECK (false);

NOTIFY pgrst, 'reload schema';

COMMIT;
