-- Allow the low-privilege backend runtime role to maintain the two durable
-- operation ledgers used by the duration learning and baseline-revision jobs.
-- Client roles remain unable to read or mutate these system-job internals.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 303';
  END IF;
END
$$;

ALTER TABLE public.duration_context_policy_learning_checkpoints ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_context_policy_learning_checkpoints TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_context_learning_checkpoints_backend_runtime
  ON public.duration_context_policy_learning_checkpoints;
CREATE POLICY duration_context_learning_checkpoints_backend_runtime
  ON public.duration_context_policy_learning_checkpoints
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

ALTER TABLE public.duration_asset_baseline_revision_operations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_asset_baseline_revision_operations TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_asset_baseline_revision_ops_backend_runtime
  ON public.duration_asset_baseline_revision_operations;
CREATE POLICY duration_asset_baseline_revision_ops_backend_runtime
  ON public.duration_asset_baseline_revision_operations
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

COMMENT ON POLICY duration_context_learning_checkpoints_backend_runtime
  ON public.duration_context_policy_learning_checkpoints IS
  'Backend scheduler access to durable duration-policy learning checkpoints; client roles remain excluded.';
COMMENT ON POLICY duration_asset_baseline_revision_ops_backend_runtime
  ON public.duration_asset_baseline_revision_operations IS
  'Backend scheduler access to idempotent duration-asset baseline revision operations; client roles remain excluded.';

NOTIFY pgrst, 'reload schema';

COMMIT;
