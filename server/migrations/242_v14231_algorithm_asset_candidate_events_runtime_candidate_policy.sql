-- v1.4.23.1 follow-up: allow the non-bypass backend runtime role to persist
-- governed candidate-only algorithm asset events.
--
-- The backend runtime connection intentionally cannot use service_role/postgres
-- in production-like environments. This policy keeps candidate evidence writable
-- for governance read models and wizard/backfill anchors, while still blocking
-- candidate rows from becoming runtime publication records through this table.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.algorithm_asset_candidate_events TO workbuddy_runtime';
  END IF;
END $$;

DROP POLICY IF EXISTS algorithm_asset_candidate_events_backend_runtime_select
  ON public.algorithm_asset_candidate_events;
CREATE POLICY algorithm_asset_candidate_events_backend_runtime_select
  ON public.algorithm_asset_candidate_events
  FOR SELECT
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

DROP POLICY IF EXISTS algorithm_asset_candidate_events_backend_runtime_candidate_write
  ON public.algorithm_asset_candidate_events;
CREATE POLICY algorithm_asset_candidate_events_backend_runtime_candidate_write
  ON public.algorithm_asset_candidate_events
  FOR ALL
  TO workbuddy_runtime
  USING (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND event_status IN ('observed', 'candidate', 'replay_ready', 'review_required', 'quarantined', 'rejected', 'superseded')
    AND publish_anchor IN ('candidate_only', 'manual_governance_required')
    AND learning_maturity IN ('shadow_report_only', 'governed_candidate')
    AND runtime_effect NOT IN ('guarded_runtime_auto_publish', 'system_curated_publish', 'runtime_published')
  )
  WITH CHECK (
    (
      current_user = 'workbuddy_runtime'
      OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
    )
    AND event_status IN ('observed', 'candidate', 'replay_ready', 'review_required', 'quarantined', 'rejected', 'superseded')
    AND publish_anchor IN ('candidate_only', 'manual_governance_required')
    AND learning_maturity IN ('shadow_report_only', 'governed_candidate')
    AND runtime_effect NOT IN ('guarded_runtime_auto_publish', 'system_curated_publish', 'runtime_published')
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
