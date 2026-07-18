-- Persist how a risk or issue was closed. Free text remains available for
-- context, while controlled result/effectiveness fields support reporting and learning.

BEGIN;

ALTER TABLE public.risks
  ADD COLUMN IF NOT EXISTS closure_result_code TEXT,
  ADD COLUMN IF NOT EXISTS closure_result_summary TEXT,
  ADD COLUMN IF NOT EXISTS closure_effectiveness TEXT,
  ADD COLUMN IF NOT EXISTS closure_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS closure_cause_attribution_id UUID
    REFERENCES public.structured_cause_attributions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_recorded_at TIMESTAMPTZ;

ALTER TABLE public.issues
  ADD COLUMN IF NOT EXISTS closure_result_code TEXT,
  ADD COLUMN IF NOT EXISTS closure_result_summary TEXT,
  ADD COLUMN IF NOT EXISTS closure_effectiveness TEXT,
  ADD COLUMN IF NOT EXISTS closure_evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS closure_cause_attribution_id UUID
    REFERENCES public.structured_cause_attributions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_recorded_at TIMESTAMPTZ;

UPDATE public.risks
   SET closure_result_code = COALESCE(closure_result_code, 'legacy_close'),
       closure_result_summary = COALESCE(NULLIF(closure_result_summary, ''), NULLIF(closed_reason, ''), 'Historical close record'),
       closure_effectiveness = COALESCE(closure_effectiveness, 'undetermined'),
       closure_recorded_at = COALESCE(closure_recorded_at, closed_at, updated_at)
 WHERE status = 'closed';

UPDATE public.issues
   SET closure_result_code = COALESCE(closure_result_code, 'legacy_close'),
       closure_result_summary = COALESCE(NULLIF(closure_result_summary, ''), NULLIF(closed_reason, ''), 'Historical close record'),
       closure_effectiveness = COALESCE(closure_effectiveness, 'undetermined'),
       closure_recorded_at = COALESCE(closure_recorded_at, closed_at, updated_at)
 WHERE status = 'closed';

ALTER TABLE public.risks
  DROP CONSTRAINT IF EXISTS risks_closure_result_code_check,
  DROP CONSTRAINT IF EXISTS risks_closure_effectiveness_check,
  DROP CONSTRAINT IF EXISTS risks_closure_evidence_refs_array_check,
  DROP CONSTRAINT IF EXISTS risks_closed_outcome_required_check;
ALTER TABLE public.risks
  ADD CONSTRAINT risks_closure_result_code_check
    CHECK (closure_result_code IS NULL OR closure_result_code IN ('resolved', 'mitigated', 'transferred', 'accepted', 'duplicate', 'invalidated', 'retention_close', 'legacy_close')),
  ADD CONSTRAINT risks_closure_effectiveness_check
    CHECK (closure_effectiveness IS NULL OR closure_effectiveness IN ('resolved', 'partially_resolved', 'transferred', 'accepted', 'undetermined')),
  ADD CONSTRAINT risks_closure_evidence_refs_array_check
    CHECK (jsonb_typeof(closure_evidence_refs) = 'array'),
  ADD CONSTRAINT risks_closed_outcome_required_check
    CHECK (status <> 'closed' OR (
      closure_result_code IS NOT NULL
      AND NULLIF(closure_result_summary, '') IS NOT NULL
      AND closure_effectiveness IS NOT NULL
      AND closure_recorded_at IS NOT NULL
    ));

ALTER TABLE public.issues
  DROP CONSTRAINT IF EXISTS issues_closure_result_code_check,
  DROP CONSTRAINT IF EXISTS issues_closure_effectiveness_check,
  DROP CONSTRAINT IF EXISTS issues_closure_evidence_refs_array_check,
  DROP CONSTRAINT IF EXISTS issues_closed_outcome_required_check;
ALTER TABLE public.issues
  ADD CONSTRAINT issues_closure_result_code_check
    CHECK (closure_result_code IS NULL OR closure_result_code IN ('resolved', 'mitigated', 'transferred', 'accepted', 'duplicate', 'invalidated', 'retention_close', 'legacy_close')),
  ADD CONSTRAINT issues_closure_effectiveness_check
    CHECK (closure_effectiveness IS NULL OR closure_effectiveness IN ('resolved', 'partially_resolved', 'transferred', 'accepted', 'undetermined')),
  ADD CONSTRAINT issues_closure_evidence_refs_array_check
    CHECK (jsonb_typeof(closure_evidence_refs) = 'array'),
  ADD CONSTRAINT issues_closed_outcome_required_check
    CHECK (status <> 'closed' OR (
      closure_result_code IS NOT NULL
      AND NULLIF(closure_result_summary, '') IS NOT NULL
      AND closure_effectiveness IS NOT NULL
      AND closure_recorded_at IS NOT NULL
    ));

CREATE OR REPLACE FUNCTION public.validate_risk_issue_closure_cause_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  attribution public.structured_cause_attributions%ROWTYPE;
BEGIN
  IF NEW.closure_cause_attribution_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO attribution
    FROM public.structured_cause_attributions
   WHERE id = NEW.closure_cause_attribution_id;

  IF attribution.id IS NULL
     OR attribution.status <> 'confirmed'
     OR attribution.project_id <> NEW.project_id
     OR attribution.subject_type <> TG_ARGV[0]
     OR attribution.subject_id <> NEW.id::TEXT THEN
    RAISE EXCEPTION 'closure cause attribution does not match the closed record';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS validate_risk_closure_cause_attribution_trigger ON public.risks;
CREATE TRIGGER validate_risk_closure_cause_attribution_trigger
  BEFORE INSERT OR UPDATE OF closure_cause_attribution_id, project_id
  ON public.risks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_risk_issue_closure_cause_attribution('risk');

DROP TRIGGER IF EXISTS validate_issue_closure_cause_attribution_trigger ON public.issues;
CREATE TRIGGER validate_issue_closure_cause_attribution_trigger
  BEFORE INSERT OR UPDATE OF closure_cause_attribution_id, project_id
  ON public.issues
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_risk_issue_closure_cause_attribution('issue');

CREATE INDEX IF NOT EXISTS idx_risks_closure_result
  ON public.risks(project_id, closure_result_code, closure_recorded_at DESC)
  WHERE status = 'closed';
CREATE INDEX IF NOT EXISTS idx_issues_closure_result
  ON public.issues(project_id, closure_result_code, closure_recorded_at DESC)
  WHERE status = 'closed';

NOTIFY pgrst, 'reload schema';

COMMIT;
