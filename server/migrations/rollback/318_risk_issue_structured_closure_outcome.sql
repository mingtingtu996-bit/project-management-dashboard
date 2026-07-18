BEGIN;

DROP TRIGGER IF EXISTS validate_risk_closure_cause_attribution_trigger ON public.risks;
DROP TRIGGER IF EXISTS validate_issue_closure_cause_attribution_trigger ON public.issues;
DROP FUNCTION IF EXISTS public.validate_risk_issue_closure_cause_attribution();

ALTER TABLE public.risks
  DROP COLUMN IF EXISTS closure_recorded_at,
  DROP COLUMN IF EXISTS closed_by,
  DROP COLUMN IF EXISTS closure_cause_attribution_id,
  DROP COLUMN IF EXISTS closure_evidence_refs,
  DROP COLUMN IF EXISTS closure_effectiveness,
  DROP COLUMN IF EXISTS closure_result_summary,
  DROP COLUMN IF EXISTS closure_result_code;

ALTER TABLE public.issues
  DROP COLUMN IF EXISTS closure_recorded_at,
  DROP COLUMN IF EXISTS closed_by,
  DROP COLUMN IF EXISTS closure_cause_attribution_id,
  DROP COLUMN IF EXISTS closure_evidence_refs,
  DROP COLUMN IF EXISTS closure_effectiveness,
  DROP COLUMN IF EXISTS closure_result_summary,
  DROP COLUMN IF EXISTS closure_result_code;

NOTIFY pgrst, 'reload schema';

COMMIT;
