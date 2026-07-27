-- v1.4.23.1 learned duration-context parameter de-duplication guard.
--
-- The learning job can refresh the same candidate weight window repeatedly.
-- Keep one current row per project/state/action/status so old duplicate
-- candidate rows cannot permanently outvote fresher windows.

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_context_policy_parameters_current_key
  ON public.duration_context_policy_parameters (
    model_family,
    model_version,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    parameter_status,
    state_bucket,
    action_key
  );
