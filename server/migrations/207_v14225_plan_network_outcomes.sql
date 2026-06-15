-- v1.4.22.5: canonical production evidence source for learnable plan-network outcomes.

CREATE TABLE IF NOT EXISTS public.duration_plan_network_outcomes (
  id TEXT PRIMARY KEY,
  asset_key TEXT NOT NULL,
  outcome_status TEXT NOT NULL,
  outcome_ref TEXT,
  company_id UUID,
  project_id UUID,
  publication_key TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  writes_runtime_directly BOOLEAN NOT NULL DEFAULT false,
  writes_fact_directly BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT duration_plan_network_outcomes_asset_key_check
    CHECK (asset_key IN (
      'special_work_duration_seed',
      'wbs_reference_days',
      'dependency_rule_candidate',
      'critical_path_rule_candidate'
    )),
  CONSTRAINT duration_plan_network_outcomes_status_check
    CHECK (outcome_status IN ('accepted', 'weak', 'rejected')),
  CONSTRAINT duration_plan_network_outcomes_no_runtime_writes
    CHECK (writes_runtime_directly = false),
  CONSTRAINT duration_plan_network_outcomes_no_fact_writes
    CHECK (writes_fact_directly = false)
);

CREATE INDEX IF NOT EXISTS idx_duration_plan_network_outcomes_asset
  ON public.duration_plan_network_outcomes (asset_key, outcome_status, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_duration_plan_network_outcomes_project
  ON public.duration_plan_network_outcomes (project_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_duration_plan_network_outcomes_publication
  ON public.duration_plan_network_outcomes (publication_key, observed_at DESC);

ALTER TABLE public.duration_plan_network_outcomes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.duration_plan_network_outcomes IS
  'v1.4.22.5 read-side production evidence that a learnable plan-network artifact has an accepted or weak observed network outcome; this table is not a runtime writer or fact writer.';
