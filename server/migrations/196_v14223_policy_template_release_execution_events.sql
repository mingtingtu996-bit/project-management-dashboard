-- v1.4.22.3: policy template release execution, rollback, and impact-monitoring audit events.
-- Runtime preview still consumes stable certificate/acceptance auto-publish runs; this table records execution closure.

BEGIN;

CREATE TABLE IF NOT EXISTS public.policy_template_release_execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN ('release_publication', 'rollback_execution', 'impact_monitoring')),
  event_status TEXT NOT NULL
    CHECK (event_status IN (
      'runtime_stable_published',
      'candidate_record_only',
      'rollback_executed',
      'rollback_blocked',
      'monitoring_passed',
      'monitoring_failed'
    )),
  source_run_id TEXT NOT NULL,
  target_table TEXT NOT NULL
    CHECK (target_table IN (
      'certificate_template_policy_auto_publish_runs',
      'acceptance_template_policy_auto_publish_runs'
    )),
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  record_visibility_policy TEXT NOT NULL DEFAULT 'backend_admin_audit_only',
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policy_template_release_execution_events_run
  ON public.policy_template_release_execution_events(source_run_id, event_type, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_template_release_execution_events_target
  ON public.policy_template_release_execution_events(target_table, event_status, executed_at DESC);

ALTER TABLE public.policy_template_release_execution_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_template_release_execution_events_select_admin
  ON public.policy_template_release_execution_events;
CREATE POLICY policy_template_release_execution_events_select_admin
  ON public.policy_template_release_execution_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS policy_template_release_execution_events_write_service_role
  ON public.policy_template_release_execution_events;
CREATE POLICY policy_template_release_execution_events_write_service_role
  ON public.policy_template_release_execution_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.policy_template_release_execution_events IS
  'Backend-admin audit trail for v1.4.22.3 policy template release publication, rollback closure, and impact monitoring events.';

COMMENT ON COLUMN public.policy_template_release_execution_events.event_payload IS
  'Includes releaseExecution, runtimePublication, rollbackExecution, impactMonitoring, rollback result, or monitoring result payloads. This table is audit-only and does not replace stable auto-publish run consumption.';

NOTIFY pgrst, 'reload schema';

COMMIT;
