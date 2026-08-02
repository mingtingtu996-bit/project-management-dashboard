-- Harden functions exposed by the staging migration chain against Advisor findings.

BEGIN;

ALTER FUNCTION public.ensure_structured_cause_attribution_tenant()
  SET search_path = public;
ALTER FUNCTION public.validate_risk_issue_closure_cause_attribution()
  SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone()
  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete()
  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.persist_duration_learning_runtime_consumptions(JSONB)
  FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_duration_learning_runtime_evidence_outbox_tombstone()
  TO workbuddy_runtime, service_role;
REVOKE ALL ON FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_duration_learning_runtime_evidence_before_subject_delete()
  TO workbuddy_runtime, service_role;
REVOKE ALL ON FUNCTION public.persist_duration_learning_runtime_consumptions(JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_duration_learning_runtime_consumptions(JSONB)
  TO workbuddy_runtime, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
