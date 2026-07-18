-- Structured business-cause attribution with evidence-first inference and
-- explicit separation between business cause and contractual responsibility.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workbuddy_runtime') THEN
    RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 317';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.structured_cause_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL
    CHECK (subject_type IN ('task', 'risk', 'issue', 'baseline_change')),
  subject_id TEXT NOT NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('delay', 'completion', 'closure', 'baseline_change')),
  cause_code TEXT NOT NULL
    CHECK (cause_code IN (
      'predecessor_delay', 'material_shortage', 'labor_shortage',
      'equipment_unavailable', 'design_change', 'drawing_delay',
      'quality_rework', 'weather_impact', 'owner_decision',
      'government_inspection', 'site_capacity_pressure',
       'workflow_sequence', 'external_readiness', 'other'
     )),
  prefilled_cause_code TEXT NULL
    CHECK (prefilled_cause_code IS NULL OR prefilled_cause_code IN (
      'predecessor_delay', 'material_shortage', 'labor_shortage',
      'equipment_unavailable', 'design_change', 'drawing_delay',
      'quality_rework', 'weather_impact', 'owner_decision',
      'government_inspection', 'site_capacity_pressure',
      'workflow_sequence', 'external_readiness', 'other'
    )),
  prefill_modified BOOLEAN NULL,
  cause_role TEXT NOT NULL
    CHECK (cause_role IN ('primary', 'contributing', 'transmitted')),
  taxonomy_version TEXT NOT NULL,
  responsibility_class TEXT NULL
    CHECK (responsibility_class IS NULL OR responsibility_class IN (
      'owner_attributable', 'contractor_attributable', 'force_majeure',
      'shared', 'undetermined'
    )),
  responsibility_basis TEXT NULL,
  raw_text TEXT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence_refs) = 'array'),
  evidence_source_types JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(evidence_source_types) = 'array'),
  overlap_start TIMESTAMPTZ NULL,
  overlap_end TIMESTAMPTZ NULL,
  rule_version TEXT NULL,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0
    CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'confirmed', 'rejected', 'superseded')),
  auto_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmation_source TEXT NOT NULL DEFAULT 'candidate'
    CHECK (confirmation_source IN ('candidate', 'deterministic_policy', 'user_confirmed')),
  review_reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(review_reason_codes) = 'array'),
  confirmed_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ NULL,
  rejected_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ NULL,
  rejection_reason TEXT NULL,
  dedupe_key TEXT NOT NULL,
  created_by UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, dedupe_key),
  CHECK (overlap_end IS NULL OR overlap_start IS NULL OR overlap_end >= overlap_start),
  CHECK (responsibility_class IS NULL OR status = 'confirmed'),
  CHECK (prefill_modified IS NULL OR prefilled_cause_code IS NOT NULL),
  CHECK (NOT auto_confirmed OR (status = 'confirmed' AND responsibility_class IS NULL))
);

ALTER TABLE public.structured_cause_attributions
  ADD COLUMN IF NOT EXISTS prefilled_cause_code TEXT NULL
    CHECK (prefilled_cause_code IS NULL OR prefilled_cause_code IN (
      'predecessor_delay', 'material_shortage', 'labor_shortage',
      'equipment_unavailable', 'design_change', 'drawing_delay',
      'quality_rework', 'weather_impact', 'owner_decision',
      'government_inspection', 'site_capacity_pressure',
      'workflow_sequence', 'external_readiness', 'other'
    )),
  ADD COLUMN IF NOT EXISTS prefill_modified BOOLEAN NULL;

UPDATE public.structured_cause_attributions
   SET prefilled_cause_code = cause_code
 WHERE prefilled_cause_code IS NULL
   AND confirmation_source IN ('candidate', 'deterministic_policy');

ALTER TABLE public.structured_cause_attributions
  DROP CONSTRAINT IF EXISTS structured_cause_prefill_modified_requires_prefill;
ALTER TABLE public.structured_cause_attributions
  ADD CONSTRAINT structured_cause_prefill_modified_requires_prefill
  CHECK (prefill_modified IS NULL OR prefilled_cause_code IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_structured_cause_confirmed_primary
  ON public.structured_cause_attributions (
    company_id, project_id, subject_type, subject_id, event_type
  )
  WHERE cause_role = 'primary' AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_structured_cause_project_subject
  ON public.structured_cause_attributions (
    company_id, project_id, subject_type, subject_id, created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_structured_cause_review_queue
  ON public.structured_cause_attributions (
    company_id, project_id, status, confidence DESC, created_at ASC
  )
  WHERE status = 'candidate';

CREATE INDEX IF NOT EXISTS idx_structured_cause_quality_metrics
  ON public.structured_cause_attributions (
    company_id, project_id, confirmed_at
  )
  WHERE confirmed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_structured_cause_attribution_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  project_company_id UUID;
BEGIN
  SELECT project.company_id
    INTO project_company_id
    FROM public.projects project
   WHERE project.id = NEW.project_id;

  IF project_company_id IS NULL THEN
    RAISE EXCEPTION 'structured cause attribution project not found';
  END IF;
  IF NEW.company_id IS DISTINCT FROM project_company_id THEN
    RAISE EXCEPTION 'structured cause attribution tenant mismatch';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS ensure_structured_cause_attribution_tenant_trigger
  ON public.structured_cause_attributions;
CREATE TRIGGER ensure_structured_cause_attribution_tenant_trigger
  BEFORE INSERT OR UPDATE OF company_id, project_id
  ON public.structured_cause_attributions
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_structured_cause_attribution_tenant();

ALTER TABLE public.structured_cause_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.structured_cause_attributions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.structured_cause_attributions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.structured_cause_attributions
  TO authenticated, workbuddy_runtime;

DROP POLICY IF EXISTS structured_cause_attributions_member_read
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_member_read
  ON public.structured_cause_attributions
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND workbuddy_private.is_active_company_member(structured_cause_attributions.company_id, NULL::TEXT[])
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        NULL::TEXT[]
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = structured_cause_attributions.project_id
        AND project.company_id = structured_cause_attributions.company_id
    )
  );

DROP POLICY IF EXISTS structured_cause_attributions_editor_insert
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_editor_insert
  ON public.structured_cause_attributions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workbuddy_private.is_active_company_member(
      structured_cause_attributions.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        ARRAY['owner', 'editor']::TEXT[]
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = structured_cause_attributions.project_id
        AND project.company_id = structured_cause_attributions.company_id
    )
  );

DROP POLICY IF EXISTS structured_cause_attributions_editor_update
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_editor_update
  ON public.structured_cause_attributions
  FOR UPDATE
  TO authenticated
  USING (
    workbuddy_private.is_active_company_member(
      structured_cause_attributions.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        ARRAY['owner', 'editor']::TEXT[]
      )
    )
  )
  WITH CHECK (
    workbuddy_private.is_active_company_member(
      structured_cause_attributions.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        ARRAY['owner', 'editor']::TEXT[]
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects project
      WHERE project.id = structured_cause_attributions.project_id
        AND project.company_id = structured_cause_attributions.company_id
    )
  );

DROP POLICY IF EXISTS structured_cause_attributions_editor_delete
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_editor_delete
  ON public.structured_cause_attributions
  FOR DELETE
  TO authenticated
  USING (
    workbuddy_private.is_active_company_member(
      structured_cause_attributions.company_id,
      NULL::TEXT[]
    )
    AND (
      workbuddy_private.is_active_company_member(
        structured_cause_attributions.company_id,
        ARRAY['company_admin']::TEXT[]
      )
      OR workbuddy_private.is_active_project_member(
        structured_cause_attributions.project_id,
        ARRAY['owner', 'editor']::TEXT[]
      )
    )
  );

DROP POLICY IF EXISTS structured_cause_attributions_backend_runtime
  ON public.structured_cause_attributions;
CREATE POLICY structured_cause_attributions_backend_runtime
  ON public.structured_cause_attributions
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

COMMENT ON TABLE public.structured_cause_attributions IS
  'Evidence-backed business causes. Contractual responsibility remains null until explicit user confirmation.';
COMMENT ON COLUMN public.structured_cause_attributions.raw_text IS
  'Original field wording retained for human context; aggregation uses cause_code and taxonomy_version.';
COMMENT ON COLUMN public.structured_cause_attributions.confirmation_source IS
  'Offline model labels remain candidate; deterministic policy may confirm causes but never contractual responsibility.';
COMMENT ON COLUMN public.structured_cause_attributions.prefilled_cause_code IS
  'Original inferred cause shown to the reviewer; retained when the confirmed cause is changed.';
COMMENT ON COLUMN public.structured_cause_attributions.prefill_modified IS
  'User-confirmed comparison result used only for inference-rule quality governance.';

NOTIFY pgrst, 'reload schema';

COMMIT;
