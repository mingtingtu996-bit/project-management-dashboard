-- v1.4.22.5: external/internal progress knowledge sources and candidate assets.
-- This migration stores extracted progress knowledge as governed candidates.
-- It does not write duration_experience_samples, tasks, baselines, monthly plans,
-- task_dependencies, or any business fact table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.progress_knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  connector_type TEXT NOT NULL
    CHECK (connector_type IN (
      'external_pdf',
      'public_quota',
      'enterprise_manual',
      'internal_knowledge_base',
      'web_knowledge_base',
      'api_connector',
      'spreadsheet'
    )),
  access_level TEXT NOT NULL DEFAULT 'public'
    CHECK (access_level IN ('public', 'internal', 'confidential', 'unknown')),
  source_trust_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (source_trust_level IN ('high', 'medium', 'low', 'unknown')),
  source_url TEXT,
  sync_policy TEXT NOT NULL DEFAULT 'manual_snapshot'
    CHECK (sync_policy IN ('manual_snapshot', 'scheduled_pull', 'webhook', 'internal_catalog_snapshot')),
  governance_status TEXT NOT NULL DEFAULT 'active'
    CHECK (governance_status IN ('active', 'paused', 'revoked', 'candidate_only')),
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.progress_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.progress_knowledge_sources(id) ON DELETE CASCADE,
  document_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL
    CHECK (document_type IN ('pdf', 'doc', 'docx', 'html', 'spreadsheet', 'api_record', 'database_snapshot')),
  document_url TEXT,
  storage_path TEXT,
  content_hash TEXT,
  version_label TEXT,
  published_at DATE,
  page_count INTEGER,
  extraction_status TEXT NOT NULL DEFAULT 'indexed'
    CHECK (extraction_status IN ('indexed', 'text_extracted', 'table_extracted', 'needs_ocr', 'needs_table_extraction_review', 'failed')),
  extraction_quality TEXT NOT NULL DEFAULT 'medium'
    CHECK (extraction_quality IN ('high', 'medium', 'low', 'unknown')),
  document_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.progress_asset_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_key TEXT NOT NULL UNIQUE,
  source_id UUID NOT NULL REFERENCES public.progress_knowledge_sources(id) ON DELETE RESTRICT,
  document_id UUID REFERENCES public.progress_knowledge_documents(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL
    CHECK (asset_type IN (
      'duration_seed_candidate',
      'process_interleaving_rule',
      'wbs_template_candidate',
      'context_correction_factor',
      'business_type_schedule_model',
      'resource_assumption'
    )),
  candidate_title TEXT NOT NULL,
  business_type TEXT,
  phase_code TEXT,
  wbs_path TEXT,
  process_name TEXT,
  region_code TEXT,
  structure_type TEXT,
  method_code TEXT,
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_locator JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.500
    CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  governance_status TEXT NOT NULL DEFAULT 'candidate_only'
    CHECK (governance_status IN (
      'candidate_only',
      'governed_candidate',
      'auto_review_package',
      'manual_governance_required',
      'rejected'
    )),
  promotion_target TEXT NOT NULL
    CHECK (promotion_target IN (
      'standard_work_duration_seed',
      'process_constraint_rule',
      'wbs_reference_days',
      'duration_context_factor',
      'business_type_schedule_model',
      'construction_organization_assumption'
    )),
  mutation_boundary TEXT NOT NULL DEFAULT 'candidate_only_no_business_fact_write',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT progress_asset_candidates_no_history_sample_promotion
    CHECK (promotion_target <> 'duration_experience_samples'),
  CONSTRAINT progress_asset_candidates_candidate_boundary
    CHECK (mutation_boundary LIKE '%no_business_fact_write%')
);

CREATE TABLE IF NOT EXISTS public.progress_asset_calibration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key TEXT NOT NULL UNIQUE,
  run_status TEXT NOT NULL DEFAULT 'completed'
    CHECK (run_status IN ('queued', 'running', 'completed', 'failed', 'blocked')),
  source_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_system_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  coverage_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  deviation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_publication_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.progress_asset_calibration_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.progress_asset_calibration_runs(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES public.progress_asset_candidates(id) ON DELETE CASCADE,
  mapping_status TEXT NOT NULL
    CHECK (mapping_status IN ('matched_existing_asset', 'gap_no_current_asset', 'ambiguous_mapping', 'blocked_conflict')),
  current_asset_ref TEXT,
  current_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  candidate_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  deviation_ratio NUMERIC(8, 4),
  deviation_days NUMERIC(10, 2),
  replay_status TEXT NOT NULL DEFAULT 'not_run'
    CHECK (replay_status IN ('not_run', 'shadow_passed', 'shadow_failed', 'needs_runtime_sample', 'not_applicable')),
  recommended_action TEXT NOT NULL
    CHECK (recommended_action IN (
      'auto_canary_ready',
      'manual_governance_required',
      'candidate_only',
      'blocked',
      'reject'
    )),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT progress_asset_calibration_results_unique_candidate
    UNIQUE (run_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS public.progress_asset_publication_readiness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.progress_asset_candidates(id) ON DELETE CASCADE,
  calibration_result_id UUID REFERENCES public.progress_asset_calibration_results(id) ON DELETE SET NULL,
  readiness_status TEXT NOT NULL
    CHECK (readiness_status IN (
      'candidate_only',
      'auto_review_package',
      'auto_canary_ready',
      'auto_canary_active',
      'auto_published',
      'manual_governance_required',
      'blocked',
      'runtime_rolled_back'
    )),
  publish_anchor TEXT NOT NULL DEFAULT 'candidate_only'
    CHECK (publish_anchor IN (
      'candidate_only',
      'manual_governance_required',
      'trusted_source_auto_publish',
      'guarded_runtime_auto_publish',
      'system_curated_publish'
    )),
  automation_maturity TEXT NOT NULL DEFAULT 'manual_required'
    CHECK (automation_maturity IN ('manual_required', 'auto_review_package', 'auto_shadow', 'auto_canary', 'auto_publish')),
  human_review_policy TEXT NOT NULL DEFAULT 'not_publishable'
    CHECK (human_review_policy IN (
      'zero_human_review_when_gate_passes',
      'batch_manual_approval_required',
      'not_publishable'
    )),
  release_job_policy TEXT NOT NULL DEFAULT 'retain_candidate_evidence_only'
    CHECK (release_job_policy IN (
      'enqueue_guarded_canary_release',
      'monitor_canary_and_maybe_promote',
      'monitor_published_and_keep_rollback_ready',
      'hold_for_governance_batch',
      'retain_candidate_evidence_only'
    )),
  target_runtime_surface TEXT NOT NULL,
  target_writer_ref TEXT,
  consumer_refs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  observation_window_days INTEGER NOT NULL DEFAULT 0
    CHECK (observation_window_days >= 0),
  publication_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  impact_monitoring_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  rollback_target JSONB NOT NULL DEFAULT '{}'::jsonb,
  readiness_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progress_knowledge_documents_source
  ON public.progress_knowledge_documents(source_id, extraction_status, extraction_quality);

CREATE INDEX IF NOT EXISTS idx_progress_asset_candidates_source_type
  ON public.progress_asset_candidates(source_id, asset_type, governance_status);

CREATE INDEX IF NOT EXISTS idx_progress_asset_candidates_promotion
  ON public.progress_asset_candidates(promotion_target, region_code, business_type);

CREATE INDEX IF NOT EXISTS idx_progress_asset_calibration_results_run_action
  ON public.progress_asset_calibration_results(run_id, recommended_action, mapping_status);

CREATE INDEX IF NOT EXISTS idx_progress_asset_publication_readiness_status
  ON public.progress_asset_publication_readiness(readiness_status, publish_anchor, automation_maturity);

CREATE INDEX IF NOT EXISTS idx_progress_asset_publication_readiness_release_job
  ON public.progress_asset_publication_readiness(human_review_policy, release_job_policy, target_runtime_surface);

ALTER TABLE public.progress_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_asset_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_asset_calibration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_asset_calibration_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress_asset_publication_readiness ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS progress_knowledge_sources_select_admins
  ON public.progress_knowledge_sources;
CREATE POLICY progress_knowledge_sources_select_admins
  ON public.progress_knowledge_sources
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS progress_knowledge_documents_select_admins
  ON public.progress_knowledge_documents;
CREATE POLICY progress_knowledge_documents_select_admins
  ON public.progress_knowledge_documents
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS progress_asset_candidates_select_admins
  ON public.progress_asset_candidates;
CREATE POLICY progress_asset_candidates_select_admins
  ON public.progress_asset_candidates
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS progress_asset_calibration_runs_select_admins
  ON public.progress_asset_calibration_runs;
CREATE POLICY progress_asset_calibration_runs_select_admins
  ON public.progress_asset_calibration_runs
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS progress_asset_calibration_results_select_admins
  ON public.progress_asset_calibration_results;
CREATE POLICY progress_asset_calibration_results_select_admins
  ON public.progress_asset_calibration_results
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS progress_asset_publication_readiness_select_admins
  ON public.progress_asset_publication_readiness;
CREATE POLICY progress_asset_publication_readiness_select_admins
  ON public.progress_asset_publication_readiness
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS progress_knowledge_sources_write_service_role
  ON public.progress_knowledge_sources;
CREATE POLICY progress_knowledge_sources_write_service_role
  ON public.progress_knowledge_sources
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS progress_knowledge_documents_write_service_role
  ON public.progress_knowledge_documents;
CREATE POLICY progress_knowledge_documents_write_service_role
  ON public.progress_knowledge_documents
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS progress_asset_candidates_write_service_role
  ON public.progress_asset_candidates;
CREATE POLICY progress_asset_candidates_write_service_role
  ON public.progress_asset_candidates
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS progress_asset_calibration_runs_write_service_role
  ON public.progress_asset_calibration_runs;
CREATE POLICY progress_asset_calibration_runs_write_service_role
  ON public.progress_asset_calibration_runs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS progress_asset_calibration_results_write_service_role
  ON public.progress_asset_calibration_results;
CREATE POLICY progress_asset_calibration_results_write_service_role
  ON public.progress_asset_calibration_results
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS progress_asset_publication_readiness_write_service_role
  ON public.progress_asset_publication_readiness;
CREATE POLICY progress_asset_publication_readiness_write_service_role
  ON public.progress_asset_publication_readiness
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.progress_asset_candidates IS
  'Candidate-only external/internal progress assets extracted from manuals, quotas, knowledge bases, APIs or spreadsheets. These rows are not duration history samples and must pass calibration and release gates before any runtime effect.';

COMMENT ON TABLE public.progress_asset_publication_readiness IS
  'Auto-publication readiness for candidate progress assets. Low-risk candidates may enter guarded canary/published runtime artifacts; high-risk candidates stay manual-governance-required.';

NOTIFY pgrst, 'reload schema';

COMMIT;
