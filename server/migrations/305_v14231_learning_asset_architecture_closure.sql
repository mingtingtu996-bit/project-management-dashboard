-- v1.4.23.1 learning/calibration asset architecture closure.
--
-- This migration makes raw duration evidence tenant-identifiable, provides a
-- durable missed-sample recovery queue, and supplies the tenant-filtered
-- atomic approval/rollback functions consumed by the governance service.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 305';
  END IF;
END
$$;

-- --------------------------------------------------------------------------
-- Raw duration evidence identity and lineage
-- --------------------------------------------------------------------------

ALTER TABLE public.duration_experience_samples
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS experience_tier TEXT NULL,
  ADD COLUMN IF NOT EXISTS reuse_scope TEXT NULL,
  ADD COLUMN IF NOT EXISTS fact_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS evidence_fingerprint TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_lineage JSONB NULL;

UPDATE public.duration_experience_samples sample
SET company_id = project.company_id
FROM public.projects project
WHERE sample.project_id = project.id
  AND sample.company_id IS NULL;

UPDATE public.duration_experience_samples
SET experience_tier = COALESCE(NULLIF(experience_tier, ''), 'T1'),
    reuse_scope = COALESCE(NULLIF(reuse_scope, ''), NULLIF(learning_scope, ''), 'project'),
    fact_source = COALESCE(NULLIF(fact_source, ''), 'actual_outcome'),
    evidence_fingerprint = COALESCE(NULLIF(evidence_fingerprint, ''), 'legacy-md5:' || md5(id::TEXT)),
    source_lineage = COALESCE(source_lineage, '{}'::jsonb) || jsonb_strip_nulls(
      jsonb_build_object(
        'schemaVersion', 'duration_experience.legacy_backfill.v1',
        'sourceService', '305_v14231_learning_asset_architecture_closure',
        'sampleId', id,
        'companyId', company_id,
        'projectId', project_id,
        'taskId', task_id,
        'sourceType', source_type
      )
    );

CREATE OR REPLACE FUNCTION public.ensure_duration_experience_sample_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  project_company_id UUID;
BEGIN
  IF NEW.project_id IS NOT NULL THEN
    SELECT project.company_id
      INTO project_company_id
      FROM public.projects project
     WHERE project.id = NEW.project_id;

    IF project_company_id IS NULL THEN
      RAISE EXCEPTION 'duration experience sample project does not exist: %', NEW.project_id;
    END IF;
    IF NEW.company_id IS NOT NULL AND NEW.company_id <> project_company_id THEN
      RAISE EXCEPTION 'duration experience sample company does not own project %', NEW.project_id;
    END IF;
    NEW.company_id := project_company_id;
  END IF;

  NEW.experience_tier := COALESCE(NULLIF(NEW.experience_tier, ''), 'T1');
  NEW.reuse_scope := COALESCE(NULLIF(NEW.reuse_scope, ''), NULLIF(NEW.learning_scope, ''), 'project');
  NEW.learning_scope := NEW.reuse_scope;
  NEW.fact_source := COALESCE(NULLIF(NEW.fact_source, ''), 'actual_outcome');
  NEW.evidence_fingerprint := COALESCE(
    NULLIF(NEW.evidence_fingerprint, ''),
    'legacy-md5:' || md5(NEW.id::TEXT)
  );
  NEW.source_lineage := COALESCE(NEW.source_lineage, '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
      'schemaVersion', 'duration_experience.identity_guard.v1',
      'sampleId', NEW.id,
      'companyId', NEW.company_id,
      'projectId', NEW.project_id,
      'taskId', NEW.task_id,
      'sourceType', NEW.source_type
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_duration_experience_sample_identity_trigger
  ON public.duration_experience_samples;
CREATE TRIGGER ensure_duration_experience_sample_identity_trigger
  BEFORE INSERT OR UPDATE OF company_id, project_id, learning_scope, reuse_scope,
    experience_tier, fact_source, evidence_fingerprint, source_lineage
  ON public.duration_experience_samples
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_duration_experience_sample_identity();

ALTER TABLE public.duration_experience_samples
  ALTER COLUMN experience_tier SET DEFAULT 'T1',
  ALTER COLUMN experience_tier SET NOT NULL,
  ALTER COLUMN reuse_scope SET DEFAULT 'project',
  ALTER COLUMN reuse_scope SET NOT NULL,
  ALTER COLUMN fact_source SET DEFAULT 'actual_outcome',
  ALTER COLUMN fact_source SET NOT NULL,
  ALTER COLUMN source_lineage SET DEFAULT '{}'::jsonb,
  ALTER COLUMN source_lineage SET NOT NULL,
  ALTER COLUMN evidence_fingerprint SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_experience_tier_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_experience_tier_check
      CHECK (experience_tier IN ('T1', 'T2', 'T3')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_reuse_scope_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_reuse_scope_check
      CHECK (reuse_scope IN ('project', 'company', 'industry', 'global')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_fact_source_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_fact_source_check
      CHECK (fact_source IN ('actual_outcome', 'behavioral_change', 'replay', 'hybrid')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_scope_alignment_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_scope_alignment_check
      CHECK (reuse_scope = learning_scope) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_company_scope_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_company_scope_check
      CHECK (company_id IS NOT NULL OR reuse_scope IN ('industry', 'global')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.duration_experience_samples'::regclass
      AND conname = 'duration_experience_samples_project_scope_check'
  ) THEN
    ALTER TABLE public.duration_experience_samples
      ADD CONSTRAINT duration_experience_samples_project_scope_check
      CHECK (reuse_scope <> 'project' OR (company_id IS NOT NULL AND project_id IS NOT NULL)) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_experience_tier_check;
ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_reuse_scope_check;
ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_fact_source_check;
ALTER TABLE public.duration_experience_samples
  VALIDATE CONSTRAINT duration_experience_samples_scope_alignment_check;

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_experience_samples_company_fingerprint
  ON public.duration_experience_samples (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::UUID),
    evidence_fingerprint
  );

CREATE INDEX IF NOT EXISTS idx_duration_experience_samples_asset_identity
  ON public.duration_experience_samples (
    company_id,
    project_id,
    experience_tier,
    reuse_scope,
    fact_source,
    completed_at DESC
  );

ALTER TABLE public.duration_experience_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_experience_samples FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duration_experience_samples_auth_read_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_auth_read_policy
  ON public.duration_experience_samples
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND duration_experience_samples.company_id IS NOT NULL
    AND public.is_active_company_member(duration_experience_samples.company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS duration_experience_samples_auth_write_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_auth_write_policy
  ON public.duration_experience_samples
  FOR ALL
  TO authenticated
  USING (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND public.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
  )
  WITH CHECK (
    duration_experience_samples.company_id IS NOT NULL
    AND duration_experience_samples.project_id IS NOT NULL
    AND duration_experience_samples.reuse_scope = 'project'
    AND public.is_active_company_member(
      duration_experience_samples.company_id,
      ARRAY['company_admin', 'editor']::TEXT[]
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = duration_experience_samples.project_id
        AND project.company_id = duration_experience_samples.company_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_samples TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_experience_samples_backend_runtime_policy
  ON public.duration_experience_samples;
CREATE POLICY duration_experience_samples_backend_runtime_policy
  ON public.duration_experience_samples
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON COLUMN public.duration_experience_samples.company_id IS
  'Explicit tenant owner for project/company raw duration evidence; shared upper-scope aggregates remain tenant-null and are not client-readable.';
COMMENT ON COLUMN public.duration_experience_samples.evidence_fingerprint IS
  'Stable dedupe identity for traceable raw evidence. New writers use SHA-256; migration backfill uses deterministic legacy-md5 identifiers.';
COMMENT ON COLUMN public.duration_experience_samples.source_lineage IS
  'Structured source and collection lineage required before learning-governance admission.';

-- --------------------------------------------------------------------------
-- Project calibration tenant identity
-- --------------------------------------------------------------------------

ALTER TABLE public.project_productivity_compensation_calibrations
  ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE;

UPDATE public.project_productivity_compensation_calibrations calibration
SET company_id = project.company_id
FROM public.projects project
WHERE calibration.project_id = project.id
  AND calibration.company_id IS NULL;

CREATE OR REPLACE FUNCTION public.ensure_project_productivity_calibration_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  project_company_id UUID;
BEGIN
  SELECT project.company_id
    INTO project_company_id
    FROM public.projects project
   WHERE project.id = NEW.project_id;
  IF project_company_id IS NULL THEN
    RAISE EXCEPTION 'project productivity calibration project does not exist: %', NEW.project_id;
  END IF;
  IF NEW.company_id IS NOT NULL AND NEW.company_id <> project_company_id THEN
    RAISE EXCEPTION 'project productivity calibration company does not own project %', NEW.project_id;
  END IF;
  NEW.company_id := project_company_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_project_productivity_calibration_tenant_trigger
  ON public.project_productivity_compensation_calibrations;
CREATE TRIGGER ensure_project_productivity_calibration_tenant_trigger
  BEFORE INSERT OR UPDATE OF company_id, project_id
  ON public.project_productivity_compensation_calibrations
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_project_productivity_calibration_tenant();

ALTER TABLE public.project_productivity_compensation_calibrations
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_productivity_calibration_tenant_status
  ON public.project_productivity_compensation_calibrations(
    company_id,
    project_id,
    calibration_key,
    status,
    window_end_date DESC
  );

ALTER TABLE public.project_productivity_compensation_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_productivity_compensation_calibrations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_productivity_calibration_select_member
  ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_select_member
  ON public.project_productivity_compensation_calibrations
  FOR SELECT
  TO authenticated
  USING (
    company_id IS NOT NULL
    AND public.is_active_company_member(company_id, NULL::TEXT[])
  );

DROP POLICY IF EXISTS project_productivity_calibration_write_service_role
  ON public.project_productivity_compensation_calibrations;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.project_productivity_compensation_calibrations
  TO workbuddy_runtime;
DROP POLICY IF EXISTS project_productivity_calibration_backend_runtime
  ON public.project_productivity_compensation_calibrations;
CREATE POLICY project_productivity_calibration_backend_runtime
  ON public.project_productivity_compensation_calibrations
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON COLUMN public.project_productivity_compensation_calibrations.company_id IS
  'Explicit tenant owner used by candidate replacement, publication and rollback transactions.';

-- --------------------------------------------------------------------------
-- Missed task-completion sample recovery
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.duration_experience_collection_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  trigger TEXT NOT NULL DEFAULT 'task_completion',
  source_type TEXT NOT NULL DEFAULT 'task_completion',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'retrying', 'waiting_for_facts', 'completed', 'dead_letter')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0 AND max_attempts <= 20),
  next_attempt_at TIMESTAMPTZ NULL DEFAULT now(),
  last_error TEXT NULL,
  completed_at TIMESTAMPTZ NULL,
  dead_lettered_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duration_experience_collection_queue_unique_task_source
    UNIQUE (company_id, task_id, source_type)
);

CREATE OR REPLACE FUNCTION public.ensure_duration_experience_collection_queue_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  project_company_id UUID;
  task_project_id UUID;
BEGIN
  SELECT project.company_id
    INTO project_company_id
    FROM public.projects project
   WHERE project.id = NEW.project_id;
  IF project_company_id IS NULL OR project_company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'duration experience queue company does not own project %', NEW.project_id;
  END IF;

  SELECT task.project_id
    INTO task_project_id
    FROM public.tasks task
   WHERE task.id = NEW.task_id;
  IF task_project_id IS NULL OR task_project_id <> NEW.project_id THEN
    RAISE EXCEPTION 'duration experience queue task does not belong to project %', NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_duration_experience_collection_queue_tenant_trigger
  ON public.duration_experience_collection_queue;
CREATE TRIGGER ensure_duration_experience_collection_queue_tenant_trigger
  BEFORE INSERT OR UPDATE OF company_id, project_id, task_id
  ON public.duration_experience_collection_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_duration_experience_collection_queue_tenant();

CREATE INDEX IF NOT EXISTS idx_duration_experience_collection_queue_due
  ON public.duration_experience_collection_queue(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retrying', 'waiting_for_facts');

CREATE INDEX IF NOT EXISTS idx_duration_experience_collection_queue_project
  ON public.duration_experience_collection_queue(company_id, project_id, status, updated_at DESC);

ALTER TABLE public.duration_experience_collection_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_experience_collection_queue FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_experience_collection_queue TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_experience_collection_queue_backend_runtime
  ON public.duration_experience_collection_queue;
CREATE POLICY duration_experience_collection_queue_backend_runtime
  ON public.duration_experience_collection_queue
  FOR ALL
  TO workbuddy_runtime
  USING (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  )
  WITH CHECK (
    current_user = 'workbuddy_runtime'
    OR pg_has_role(current_user, 'workbuddy_runtime', 'member')
  );

COMMENT ON TABLE public.duration_experience_collection_queue IS
  'Backend-only retry/dead-letter queue for task completions whose duration experience sample was not collected.';

-- --------------------------------------------------------------------------
-- Tenant-safe candidate/version state and atomic canary approval/rollback
-- --------------------------------------------------------------------------

ALTER TABLE public.duration_context_policy_versions
  ADD COLUMN IF NOT EXISTS supersedes_version_id UUID NULL
    REFERENCES public.duration_context_policy_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rollback_target_version_id UUID NULL
    REFERENCES public.duration_context_policy_versions(id) ON DELETE SET NULL;

UPDATE public.duration_context_policy_canary_candidates candidate
SET company_id = project.company_id
FROM public.projects project
WHERE candidate.project_id = project.id
  AND candidate.company_id IS NULL;

UPDATE public.duration_context_policy_versions version
SET company_id = COALESCE(candidate.company_id, project.company_id)
FROM public.duration_context_policy_canary_candidates candidate
LEFT JOIN public.projects project ON project.id = candidate.project_id
WHERE version.source_candidate_id = candidate.id
  AND version.company_id IS NULL;

ALTER TABLE public.duration_context_policy_canary_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_context_policy_canary_candidates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.duration_context_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duration_context_policy_versions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidate_select_member
  ON public.duration_context_policy_canary_candidates
  FOR SELECT
  TO authenticated
  USING (company_id IS NOT NULL AND public.is_active_company_member(company_id, NULL::TEXT[]));

DROP POLICY IF EXISTS duration_context_policy_version_select_member
  ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_version_select_member
  ON public.duration_context_policy_versions
  FOR SELECT
  TO authenticated
  USING (company_id IS NOT NULL AND public.is_active_company_member(company_id, NULL::TEXT[]));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_context_policy_canary_candidates TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_context_policy_canary_candidates_backend_runtime
  ON public.duration_context_policy_canary_candidates;
CREATE POLICY duration_context_policy_canary_candidates_backend_runtime
  ON public.duration_context_policy_canary_candidates
  FOR ALL
  TO workbuddy_runtime
  USING (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
  WITH CHECK (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.duration_context_policy_versions TO workbuddy_runtime;
DROP POLICY IF EXISTS duration_context_policy_versions_backend_runtime
  ON public.duration_context_policy_versions;
CREATE POLICY duration_context_policy_versions_backend_runtime
  ON public.duration_context_policy_versions
  FOR ALL
  TO workbuddy_runtime
  USING (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'))
  WITH CHECK (current_user = 'workbuddy_runtime' OR pg_has_role(current_user, 'workbuddy_runtime', 'member'));

CREATE OR REPLACE FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  p_company_id UUID,
  p_candidate_id UUID,
  p_approved_by UUID,
  p_scope JSONB,
  p_reason TEXT,
  p_expires_at TIMESTAMPTZ,
  p_review_metadata JSONB
)
RETURNS TABLE (candidate_row JSONB, version_row JSONB, superseded_version_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_candidate public.duration_context_policy_canary_candidates%ROWTYPE;
  selected_previous public.duration_context_policy_versions%ROWTYPE;
  inserted_version public.duration_context_policy_versions%ROWTYPE;
  previous_version_id UUID;
  previous_version_status TEXT;
BEGIN
  IF p_company_id IS NULL OR p_candidate_id IS NULL THEN
    RAISE EXCEPTION 'company and candidate identity are required';
  END IF;

  SELECT candidate.*
    INTO selected_candidate
    FROM public.duration_context_policy_canary_candidates candidate
   WHERE candidate.id = p_candidate_id
     AND candidate.company_id = p_company_id
     AND candidate.candidate_status = 'candidate'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration context policy canary candidate not found for tenant or already changed';
  END IF;

  IF selected_candidate.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects project
    WHERE project.id = selected_candidate.project_id
      AND project.company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'candidate project does not belong to the current tenant';
  END IF;

  IF jsonb_typeof(COALESCE(p_scope, '{}'::jsonb)->'projectIds') = 'array' AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(p_scope, '{}'::jsonb)->'projectIds') scoped(project_id_text)
    LEFT JOIN public.projects project
      ON project.id = CASE
        WHEN scoped.project_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN scoped.project_id_text::UUID
        ELSE NULL
      END
    WHERE project.id IS NULL OR project.company_id <> p_company_id
  ) THEN
    RAISE EXCEPTION 'canary scope includes a project outside the current tenant';
  END IF;

  SELECT version.*
    INTO selected_previous
    FROM public.duration_context_policy_versions version
   WHERE version.company_id = p_company_id
     AND version.project_id IS NOT DISTINCT FROM selected_candidate.project_id
     AND version.state_bucket = selected_candidate.state_bucket
     AND version.action_key = selected_candidate.action_key
     AND version.version_status IN ('canary', 'published')
   ORDER BY version.approved_at DESC, version.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    previous_version_id := selected_previous.id;
    previous_version_status := selected_previous.version_status;
    UPDATE public.duration_context_policy_versions
       SET version_status = 'expired',
           runtime_auto_publish_eligible = FALSE,
           rollback_metadata = COALESCE(rollback_metadata, '{}'::jsonb) || jsonb_build_object(
             'supersededByCandidateId', p_candidate_id::TEXT,
             'previousVersionStatus', previous_version_status,
             'supersededAt', now()
           ),
           updated_at = now()
     WHERE id = previous_version_id
       AND company_id = p_company_id;
  END IF;

  UPDATE public.duration_context_policy_canary_candidates candidate
     SET candidate_status = 'approved_for_canary',
         runtime_auto_publish_eligible = FALSE,
         requires_review = FALSE,
         review_metadata = COALESCE(p_review_metadata, '{}'::jsonb) || jsonb_build_object(
           'reviewedBy', p_approved_by,
           'reviewedAt', now(),
           'reviewReason', p_reason,
           'approvalMode', 'tenant_atomic_canary'
         ),
         updated_at = now()
   WHERE candidate.id = p_candidate_id
     AND candidate.company_id = p_company_id
     AND candidate.candidate_status = 'candidate'
   RETURNING candidate.* INTO selected_candidate;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration context policy canary candidate changed during approval';
  END IF;

  INSERT INTO public.duration_context_policy_versions (
    company_id, model_family, model_version, source_candidate_id, version_status,
    activation_mode, runtime_mutation_policy, runtime_auto_publish_eligible,
    rollback_policy, project_id, state_bucket, action_key, canary_scope,
    approved_by, approved_at, expires_at, replay_case_count,
    average_projected_reward_delta, source_decision_ids, guardrails,
    approval_reason, supersedes_version_id, rollback_target_version_id,
    created_at, updated_at
  ) VALUES (
    p_company_id, selected_candidate.model_family, selected_candidate.model_version,
    selected_candidate.id, 'canary', 'review_required_canary',
    'none_version_registry_only', FALSE,
    'manual_rollback_required_before_runtime_disablement', selected_candidate.project_id,
    selected_candidate.state_bucket, selected_candidate.action_key,
    COALESCE(p_scope, '{}'::jsonb), p_approved_by, now(), p_expires_at,
    selected_candidate.replay_case_count, selected_candidate.average_projected_reward_delta,
    selected_candidate.source_decision_ids, selected_candidate.guardrails, p_reason,
    previous_version_id, previous_version_id, now(), now()
  )
  RETURNING * INTO inserted_version;

  RETURN QUERY
  SELECT to_jsonb(selected_candidate), to_jsonb(inserted_version), previous_version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_duration_context_policy_version_atomic(
  p_company_id UUID,
  p_version_id UUID,
  p_rolled_back_by UUID,
  p_reason TEXT
)
RETURNS TABLE (rolled_back_version_row JSONB, restored_version_row JSONB)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_version public.duration_context_policy_versions%ROWTYPE;
  rolled_back_version public.duration_context_policy_versions%ROWTYPE;
  restore_target public.duration_context_policy_versions%ROWTYPE;
  restored_version public.duration_context_policy_versions%ROWTYPE;
  restore_target_id UUID;
  restore_status TEXT;
BEGIN
  IF p_company_id IS NULL OR p_version_id IS NULL THEN
    RAISE EXCEPTION 'company and version identity are required';
  END IF;

  SELECT version.*
    INTO selected_version
    FROM public.duration_context_policy_versions version
   WHERE version.id = p_version_id
     AND version.company_id = p_company_id
     AND version.version_status IN ('canary', 'published')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duration context policy version not found for tenant or is not active';
  END IF;

  restore_target_id := COALESCE(
    selected_version.rollback_target_version_id,
    selected_version.supersedes_version_id
  );

  IF restore_target_id IS NULL THEN
    SELECT previous.id
      INTO restore_target_id
      FROM public.duration_context_policy_versions previous
     WHERE previous.company_id = p_company_id
       AND previous.project_id IS NOT DISTINCT FROM selected_version.project_id
       AND previous.state_bucket = selected_version.state_bucket
       AND previous.action_key = selected_version.action_key
       AND previous.version_status = 'expired'
       AND previous.rollback_metadata->>'supersededByCandidateId' = selected_version.source_candidate_id::TEXT
     ORDER BY previous.updated_at DESC, previous.approved_at DESC
     LIMIT 1;
  END IF;

  IF restore_target_id IS NOT NULL THEN
    SELECT previous.*
      INTO restore_target
      FROM public.duration_context_policy_versions previous
     WHERE previous.id = restore_target_id
       AND previous.company_id = p_company_id
       AND previous.version_status = 'expired'
     FOR UPDATE;
    IF FOUND THEN
      restore_status := CASE
        WHEN restore_target.rollback_metadata->>'previousVersionStatus' IN ('canary', 'published')
        THEN restore_target.rollback_metadata->>'previousVersionStatus'
        ELSE 'published'
      END;
    ELSE
      restore_target_id := NULL;
    END IF;
  END IF;

  UPDATE public.duration_context_policy_versions version
     SET version_status = 'rolled_back',
         runtime_auto_publish_eligible = FALSE,
         rollback_metadata = COALESCE(version.rollback_metadata, '{}'::jsonb) || jsonb_build_object(
           'rolledBackBy', p_rolled_back_by,
           'rollbackReason', p_reason,
           'rolledBackAt', now(),
           'restoredVersionId', restore_target_id
         ),
         updated_at = now()
   WHERE version.id = p_version_id
     AND version.company_id = p_company_id
     AND version.version_status IN ('canary', 'published')
   RETURNING version.* INTO rolled_back_version;

  IF restore_target_id IS NOT NULL THEN
    UPDATE public.duration_context_policy_versions previous
       SET version_status = restore_status,
           runtime_auto_publish_eligible = FALSE,
           rollback_metadata = COALESCE(previous.rollback_metadata, '{}'::jsonb) || jsonb_build_object(
             'restoredFromVersionId', p_version_id,
             'restoredAt', now()
           ),
           updated_at = now()
     WHERE previous.id = restore_target_id
       AND previous.company_id = p_company_id
       AND previous.version_status = 'expired'
     RETURNING previous.* INTO restored_version;
  END IF;

  RETURN QUERY
  SELECT to_jsonb(rolled_back_version),
         CASE WHEN restore_target_id IS NULL THEN NULL ELSE to_jsonb(restored_version) END;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_duration_context_policy_version_atomic(
  UUID, UUID, UUID, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, JSONB
) TO workbuddy_runtime;
GRANT EXECUTE ON FUNCTION public.rollback_duration_context_policy_version_atomic(
  UUID, UUID, UUID, TEXT
) TO workbuddy_runtime;

COMMENT ON FUNCTION public.approve_duration_context_policy_canary_candidate_atomic(
  UUID, UUID, UUID, JSONB, TEXT, TIMESTAMPTZ, JSONB
) IS 'Tenant-filtered atomic canary approval: lock candidate, expire predecessor, persist lineage, and activate one canary version.';
COMMENT ON FUNCTION public.rollback_duration_context_policy_version_atomic(
  UUID, UUID, UUID, TEXT
) IS 'Tenant-filtered atomic rollback that restores the exact superseded canary/published predecessor when available.';

NOTIFY pgrst, 'reload schema';

COMMIT;
