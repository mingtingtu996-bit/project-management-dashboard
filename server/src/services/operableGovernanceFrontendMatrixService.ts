export type OperableGovernanceFrontendSurface =
  | 'company_admin_operation_ui'
  | 'frontend_operation_api_contract'
  | 'operation_permission_boundary'
  | 'forbidden_action_states'
  | 'domain_handoff_result_display'

export type OperableGovernanceFrontendEvidence = {
  surface: OperableGovernanceFrontendSurface | string
  status: 'verified' | 'not_applicable'
  evidenceRefs?: string[]
  reason?: string
}

export type OperableGovernanceFrontendMatrixInput = {
  evidence: OperableGovernanceFrontendEvidence[]
}

export type OperableGovernanceFrontendMatrixRow = {
  surface: string
  status: 'confirmed' | 'incomplete'
  missingReasons: string[]
}

export type OperableGovernanceFrontendMatrix = {
  status: 'operable_governance_frontend_confirmed' | 'operable_governance_frontend_incomplete'
  canDeclareOperableGovernanceFrontendComplete: boolean
  requiredSurfaces: string[]
  rows: OperableGovernanceFrontendMatrixRow[]
  boundaryPolicy: string[]
}

const REQUIRED_OPERABLE_GOVERNANCE_FRONTEND_SURFACES = [
  'company_admin_operation_ui',
  'frontend_operation_api_contract',
  'operation_permission_boundary',
  'forbidden_action_states',
  'domain_handoff_result_display',
] as const

const OPERABLE_GOVERNANCE_FRONTEND_BOUNDARY_POLICY = [
  'operable_frontend_does_not_grant_publish_rights',
  'operation_ui_only_calls_controlled_handoff_api',
  'operation_result_must_display_blocked_or_delegated_boundary',
  'manual_no_unattended_anchors_remain_hard_blockers',
  'complete_operable_frontend_is_not_all_domain_writer_completion',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: OperableGovernanceFrontendEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForSurface(
  surface: typeof REQUIRED_OPERABLE_GOVERNANCE_FRONTEND_SURFACES[number],
  evidence: OperableGovernanceFrontendEvidence | undefined,
) {
  if (!evidence) return [`${surface}_evidence_required`]

  const reasons: string[] = []
  if (evidence.status !== 'verified') reasons.push(`${surface}_verified_status_required`)
  if (!hasEvidenceRef(evidence)) reasons.push(`${surface}_evidence_ref_required`)
  if (evidence.status === 'not_applicable' && !hasText(evidence.reason)) {
    reasons.push(`${surface}_not_applicable_requires_reason`)
  }
  return reasons
}

function verified(
  surface: OperableGovernanceFrontendSurface,
  evidenceRefs: string[],
): OperableGovernanceFrontendEvidence {
  return {
    surface,
    status: 'verified',
    evidenceRefs,
  }
}

export function buildOperableGovernanceFrontendMatrix(
  input: OperableGovernanceFrontendMatrixInput,
): OperableGovernanceFrontendMatrix {
  const rows = REQUIRED_OPERABLE_GOVERNANCE_FRONTEND_SURFACES.map((surface) => {
    const missingReasons = reasonsForSurface(
      surface,
      input.evidence.find((evidence) => evidence.surface === surface),
    )
    return {
      surface,
      status: missingReasons.length > 0 ? 'incomplete' as const : 'confirmed' as const,
      missingReasons,
    }
  })
  const canDeclareOperableGovernanceFrontendComplete = rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareOperableGovernanceFrontendComplete
      ? 'operable_governance_frontend_confirmed'
      : 'operable_governance_frontend_incomplete',
    canDeclareOperableGovernanceFrontendComplete,
    requiredSurfaces: [...REQUIRED_OPERABLE_GOVERNANCE_FRONTEND_SURFACES],
    rows,
    boundaryPolicy: [...OPERABLE_GOVERNANCE_FRONTEND_BOUNDARY_POLICY],
  }
}

export function buildV14223OperableGovernanceFrontendMatrix(): OperableGovernanceFrontendMatrix {
  return buildOperableGovernanceFrontendMatrix({
    evidence: [
      verified('company_admin_operation_ui', [
        'client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx renders a company-admin controlled operation panel',
        'client/src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx',
      ]),
      verified('frontend_operation_api_contract', [
        'client/src/services/ruleAssetGovernanceWorkbenchApi.ts posts to governance-workbench/operations',
        'client/src/services/__tests__/ruleAssetGovernanceWorkbenchApi.test.ts',
      ]),
      verified('operation_permission_boundary', [
        'server/src/routes/algorithm-seeds.ts requires company admin for governance-workbench operations',
        'server/src/__tests__/algorithmSeedRoutes.test.ts',
      ]),
      verified('forbidden_action_states', [
        'RuleAssetGovernanceWorkbenchAdmin displays blocked operation reasons from operation service',
        'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
      ]),
      verified('domain_handoff_result_display', [
        'RuleAssetGovernanceWorkbenchAdmin displays delegated status, writer key, direct runtime write policy, and boundary policy',
        'client/src/pages/__tests__/RuleAssetGovernanceWorkbenchAdmin.test.tsx',
      ]),
    ],
  })
}
