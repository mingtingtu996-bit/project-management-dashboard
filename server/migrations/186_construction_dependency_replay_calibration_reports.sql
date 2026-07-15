-- v1.4.22.2: report-only persistence for L3/L4 construction dependency replay calibration.
-- Stores replay queue evidence for manual seed review without mutating seeds or task dependencies.

BEGIN;

CREATE TABLE IF NOT EXISTS public.construction_dependency_replay_calibration_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  triggered_by TEXT NOT NULL,
  report_code TEXT NOT NULL,
  report_generated_at TIMESTAMPTZ NOT NULL,
  governance_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  calibration_queues JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  runtime_mutation_policy TEXT NOT NULL DEFAULT 'none_report_only',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_construction_dependency_replay_reports_project
  ON public.construction_dependency_replay_calibration_reports(project_id, report_generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_construction_dependency_replay_reports_run
  ON public.construction_dependency_replay_calibration_reports(run_id, report_generated_at DESC);

ALTER TABLE public.construction_dependency_replay_calibration_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS construction_dependency_replay_report_select_member
  ON public.construction_dependency_replay_calibration_reports;
CREATE POLICY construction_dependency_replay_report_select_member
  ON public.construction_dependency_replay_calibration_reports
  FOR SELECT
  USING (
    project_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
    OR public.is_project_member(construction_dependency_replay_calibration_reports.project_id, auth.uid())
  );

DROP POLICY IF EXISTS construction_dependency_replay_report_write_service_role
  ON public.construction_dependency_replay_calibration_reports;
CREATE POLICY construction_dependency_replay_report_write_service_role
  ON public.construction_dependency_replay_calibration_reports
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.construction_dependency_replay_calibration_reports IS
  'Report-only L3/L4 construction dependency replay calibration snapshots for manual seed governance.';
COMMENT ON COLUMN public.construction_dependency_replay_calibration_reports.runtime_mutation_policy IS
  'Always none_report_only: replay reports and queue evidence never mutate seeds or task_dependencies.';

NOTIFY pgrst, 'reload schema';

COMMIT;
