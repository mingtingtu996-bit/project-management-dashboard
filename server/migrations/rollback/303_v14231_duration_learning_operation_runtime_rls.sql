-- Restore the pre-303 runtime boundary. The service_role grants created by
-- migrations 281 and 283 remain unchanged.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    IF to_regclass('public.duration_context_policy_learning_checkpoints') IS NOT NULL THEN
      DROP POLICY IF EXISTS duration_context_learning_checkpoints_backend_runtime
        ON public.duration_context_policy_learning_checkpoints;
    END IF;

    IF to_regclass('public.duration_asset_baseline_revision_operations') IS NOT NULL THEN
      DROP POLICY IF EXISTS duration_asset_baseline_revision_ops_backend_runtime
        ON public.duration_asset_baseline_revision_operations;
    END IF;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
