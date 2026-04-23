ALTER TABLE public.monthly_plans
  ADD COLUMN IF NOT EXISTS data_confidence_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS data_confidence_flag TEXT,
  ADD COLUMN IF NOT EXISTS data_confidence_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'monthly_plans_data_confidence_flag_check'
  ) THEN
    ALTER TABLE public.monthly_plans
      ADD CONSTRAINT monthly_plans_data_confidence_flag_check
      CHECK (
        data_confidence_flag IS NULL
        OR data_confidence_flag IN ('high', 'medium', 'low')
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.data_quality_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_key TEXT NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('trend', 'anomaly', 'cross_check')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  dimension_key TEXT,
  summary TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'ignored'))
);

CREATE INDEX IF NOT EXISTS idx_data_quality_findings_project_status
  ON public.data_quality_findings(project_id, status, rule_type, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_quality_findings_task_status
  ON public.data_quality_findings(task_id, status);

CREATE INDEX IF NOT EXISTS idx_data_quality_findings_dimension
  ON public.data_quality_findings(project_id, dimension_key);

CREATE TABLE IF NOT EXISTS public.data_confidence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  period_month TEXT NOT NULL,
  confidence_score NUMERIC(5,2) NOT NULL,
  timeliness_score NUMERIC(5,2) NOT NULL,
  anomaly_score NUMERIC(5,2) NOT NULL,
  consistency_score NUMERIC(5,2) NOT NULL,
  coverage_score NUMERIC(5,2) NOT NULL,
  jumpiness_score NUMERIC(5,2) NOT NULL,
  weights_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_data_confidence_snapshots_project_month
  ON public.data_confidence_snapshots(project_id, period_month DESC);
