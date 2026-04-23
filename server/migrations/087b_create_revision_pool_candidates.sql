BEGIN;

CREATE TABLE IF NOT EXISTS public.revision_pool_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  baseline_version_id UUID REFERENCES public.task_baselines(id) ON DELETE CASCADE,
  monthly_plan_version_id UUID REFERENCES public.monthly_plans(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL
    CHECK (source_type IN ('observation', 'deviation', 'manual')),
  source_id TEXT,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'submitted', 'accepted', 'rejected')),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revision_pool_candidates_project_id
  ON public.revision_pool_candidates(project_id);

CREATE INDEX IF NOT EXISTS idx_revision_pool_candidates_baseline_version_id
  ON public.revision_pool_candidates(baseline_version_id);

CREATE INDEX IF NOT EXISTS idx_revision_pool_candidates_status
  ON public.revision_pool_candidates(status);

COMMIT;
