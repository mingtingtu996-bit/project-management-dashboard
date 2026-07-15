const CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_PROJECTION_ONLY_EVIDENCE_ACTIONS = new Set([
  'collect_runtime_closeout_claim_for_business_type',
  'collect_runtime_ready_option_closeout_claim_evidence_for_business_type',
  'collect_runtime_ready_use_case_option_closeout_claim_evidence_for_business_type',
  'resolve_runtime_business_type_attribution_for_business_type',
  'resolve_runtime_business_type_conflict_for_business_type',
])

export const CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_PROJECTION_EVIDENCE_RUNTIME_WRITE_REASON =
  'product_outcome_projection_evidence_action_must_not_write_runtime_evidence'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function isConstructionOrganizationProductOutcomeProjectionOnlyEvidenceAction(value: unknown) {
  const evidenceAction = normalizeText(value)
  return evidenceAction
    ? CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_PROJECTION_ONLY_EVIDENCE_ACTIONS.has(evidenceAction)
    : false
}

export function constructionOrganizationProductOutcomeProjectionOnlyEvidenceActionReasons(value: unknown) {
  return isConstructionOrganizationProductOutcomeProjectionOnlyEvidenceAction(value)
    ? [CONSTRUCTION_ORGANIZATION_PRODUCT_OUTCOME_PROJECTION_EVIDENCE_RUNTIME_WRITE_REASON]
    : []
}

export function constructionOrganizationProductOutcomeProjectionOnlyContextReasons(
  context: Record<string, unknown> | null | undefined,
) {
  return constructionOrganizationProductOutcomeProjectionOnlyEvidenceActionReasons(context?.evidenceAction)
}
