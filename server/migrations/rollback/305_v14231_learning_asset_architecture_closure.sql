-- Data-preserving rollback for migration 305.
-- Identity columns and their compatibility trigger intentionally remain so an
-- older rolling application instance cannot create tenantless samples.

BEGIN;

REVOKE ALL ON FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_duration_context_policy_version_atomic(
  UUID, UUID, UUID, TEXT
) FROM PUBLIC;

DROP FUNCTION IF EXISTS public.approve_duration_context_policy_canary_candidate_atomic(
  UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, JSONB
);
DROP FUNCTION IF EXISTS public.rollback_duration_context_policy_version_atomic(
  UUID, UUID, UUID, TEXT
);

DROP TABLE IF EXISTS public.duration_experience_collection_queue;
DROP FUNCTION IF EXISTS public.ensure_duration_experience_collection_queue_tenant();

DROP POLICY IF EXISTS duration_context_policy_canary_candidates_backend_runtime
  ON public.duration_context_policy_canary_candidates;
DROP POLICY IF EXISTS duration_context_policy_versions_backend_runtime
  ON public.duration_context_policy_versions;
DROP POLICY IF EXISTS project_productivity_calibration_backend_runtime
  ON public.project_productivity_compensation_calibrations;
DROP POLICY IF EXISTS project_productivity_calibration_write_service_role
  ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_write_service_role
  ON public.project_productivity_compensation_calibrations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';

COMMIT;
