-- v1.4.22.5: make learning-scope provenance schema-visible for duration
-- production evidence. Project/business writers may only produce project-scope
-- evidence; company / industry / global scopes require aggregate or shared
-- baseline provenance jobs.

ALTER TABLE public.duration_experience_samples
  ADD COLUMN IF NOT EXISTS learning_scope_source TEXT NOT NULL DEFAULT 'task_completion_writer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_learning_scope_source_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_learning_scope_source_check
      CHECK (
        learning_scope_source IN (
          'task_completion_writer',
          'company_aggregate_evidence_job',
          'industry_shared_baseline_job',
          'global_shared_baseline_job'
        )
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_learning_scope_source_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_learning_scope_source_scope_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_learning_scope_source_scope_check
      CHECK (
        (learning_scope = 'project' AND learning_scope_source = 'task_completion_writer')
        OR (learning_scope = 'company' AND learning_scope_source = 'company_aggregate_evidence_job')
        OR (learning_scope = 'industry' AND learning_scope_source = 'industry_shared_baseline_job')
        OR (learning_scope = 'global' AND learning_scope_source = 'global_shared_baseline_job')
      )
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_duration_experience_samples_learning_scope_source
  ON public.duration_experience_samples (
    learning_scope,
    learning_scope_source,
    sample_status,
    included_in_benchmark,
    completed_at DESC
  );

COMMENT ON COLUMN public.duration_experience_samples.learning_scope_source IS
  'Provenance for duration-outcome learning_scope. task_completion_writer is project-only; company, industry, and global scopes require explicit aggregate/shared-baseline evidence jobs.';

ALTER TABLE public.duration_plan_network_outcomes
  ADD COLUMN IF NOT EXISTS learning_scope_source TEXT NOT NULL DEFAULT 'project_business_outcome_writer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.duration_plan_network_outcomes'::regclass
      AND conname = 'duration_plan_network_outcomes_learning_scope_source_check'
  ) THEN
    ALTER TABLE public.duration_plan_network_outcomes
      ADD CONSTRAINT duration_plan_network_outcomes_learning_scope_source_check
      CHECK (
        learning_scope_source IN (
          'project_business_outcome_writer',
          'plan_network_company_aggregate_job',
          'plan_network_industry_baseline_job',
          'plan_network_global_baseline_job'
        )
      )
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.duration_plan_network_outcomes
  VALIDATE CONSTRAINT duration_plan_network_outcomes_learning_scope_source_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.duration_plan_network_outcomes'::regclass
      AND conname = 'duration_plan_network_outcomes_learning_scope_source_scope_check'
  ) THEN
    ALTER TABLE public.duration_plan_network_outcomes
      ADD CONSTRAINT duration_plan_network_outcomes_learning_scope_source_scope_check
      CHECK (
        (learning_scope = 'project' AND learning_scope_source = 'project_business_outcome_writer')
        OR (learning_scope = 'company' AND learning_scope_source = 'plan_network_company_aggregate_job')
        OR (learning_scope = 'industry' AND learning_scope_source = 'plan_network_industry_baseline_job')
        OR (learning_scope = 'global' AND learning_scope_source = 'plan_network_global_baseline_job')
      )
      NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_duration_plan_network_outcomes_learning_scope_source
  ON public.duration_plan_network_outcomes (
    learning_scope,
    learning_scope_source,
    asset_key,
    outcome_status,
    observed_at DESC
  );

COMMENT ON COLUMN public.duration_plan_network_outcomes.learning_scope_source IS
  'Provenance for plan-network learning_scope. project_business_outcome_writer is project-only; company, industry, and global scopes require explicit aggregate/shared-baseline jobs.';
