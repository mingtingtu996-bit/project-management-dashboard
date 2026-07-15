-- v1.4.7.4: project productivity compensation self-calibration.
-- Keeps shadow-run evidence, candidate parameters, published policy overlays, and rollback audit.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_productivity_compensation_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  calibration_key TEXT NOT NULL DEFAULT 'productivity_compensation',
  status TEXT NOT NULL DEFAULT 'shadow'
    CHECK (status IN ('shadow', 'candidate', 'published', 'superseded', 'rejected', 'rolled_back')),
  action_policy TEXT NOT NULL DEFAULT 'shadow_run'
    CHECK (action_policy IN ('shadow_run', 'candidate_only', 'auto_publish')),
  window_start_date DATE NULL,
  window_end_date DATE NOT NULL DEFAULT CURRENT_DATE,
  window_days INTEGER NOT NULL DEFAULT 30 CHECK (window_days > 0 AND window_days <= 180),
  sample_count INTEGER NOT NULL DEFAULT 0,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  maturity_days INTEGER NOT NULL DEFAULT 0,
  base_productivity NUMERIC(6,3) NOT NULL DEFAULT 1,
  observed_productivity NUMERIC(6,3) NULL,
  adjusted_productivity NUMERIC(6,3) NULL,
  bias_before NUMERIC(8,4) NULL,
  bias_after NUMERIC(8,4) NULL,
  mae_before NUMERIC(8,4) NULL,
  mae_after NUMERIC(8,4) NULL,
  overcompensation_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  recommended_cap NUMERIC(6,3) NULL,
  recommended_min_uplift NUMERIC(6,3) NULL,
  parameter_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ NULL,
  superseded_by UUID NULL REFERENCES public.project_productivity_compensation_calibrations(id) ON DELETE SET NULL,
  rollback_of UUID NULL REFERENCES public.project_productivity_compensation_calibrations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_productivity_calibration_project_status
  ON public.project_productivity_compensation_calibrations(project_id, status, window_end_date DESC);

CREATE INDEX IF NOT EXISTS idx_project_productivity_calibration_key
  ON public.project_productivity_compensation_calibrations(calibration_key, status, window_end_date DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_project_productivity_calibration_published
  ON public.project_productivity_compensation_calibrations(project_id, calibration_key)
  WHERE status = 'published';

ALTER TABLE public.project_productivity_compensation_calibrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_productivity_calibration_select_member ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_select_member ON public.project_productivity_compensation_calibrations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.global_role = 'company_admin'
    )
    OR public.is_project_member(project_productivity_compensation_calibrations.project_id, auth.uid())
  );

DROP POLICY IF EXISTS project_productivity_calibration_write_service_role ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_write_service_role ON public.project_productivity_compensation_calibrations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.project_productivity_compensation_calibrations IS 'Shadow-run and governed policy overlays for project productivity compensation.';
COMMENT ON COLUMN public.project_productivity_compensation_calibrations.parameter_payload IS 'Published policy overlay consumed by projectProductivityCompensationService.';
COMMENT ON COLUMN public.project_productivity_compensation_calibrations.evidence_summary IS 'Backtest evidence: sample maturity, bias, MAE, overcompensation, and source contribution signals.';

NOTIFY pgrst, 'reload schema';

COMMIT;
