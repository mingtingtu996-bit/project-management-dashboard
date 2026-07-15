export type FutureAssetRediscoveryGateRerunSurface =
  | 'fresh_asset_discovery'
  | 'inventory_diagnostics_rerun'
  | 'admission_gate_rerun'
  | 'old_object_rescan'
  | 'llm_candidate_gate_rerun'
  | 'governance_gate_rerun'

export type FutureAssetRediscoveryGateRerunEvidence = {
  surface: FutureAssetRediscoveryGateRerunSurface | string
  status: 'verified' | 'not_applicable'
  evidenceRefs?: string[]
  reason?: string
}

export type FutureAssetRediscoveryGateRerunMatrixInput = {
  evidence: FutureAssetRediscoveryGateRerunEvidence[]
}

export type FutureAssetRediscoveryGateRerunMatrixRow = {
  surface: string
  status: 'confirmed' | 'incomplete'
  missingReasons: string[]
}

export type FutureAssetRediscoveryGateRerunMatrix = {
  status: 'future_asset_rediscovery_gate_rerun_confirmed' | 'future_asset_rediscovery_gate_rerun_incomplete'
  canDeclareFutureAssetRediscoveryGateRerunComplete: boolean
  requiredSurfaces: string[]
  rows: FutureAssetRediscoveryGateRerunMatrixRow[]
  boundaryPolicy: string[]
}

const REQUIRED_FUTURE_ASSET_REDISCOVERY_GATE_RERUN_SURFACES = [
  'fresh_asset_discovery',
  'inventory_diagnostics_rerun',
  'admission_gate_rerun',
  'old_object_rescan',
  'llm_candidate_gate_rerun',
  'governance_gate_rerun',
] as const

const CURRENT_SNAPSHOT_RERUN_BOUNDARY_POLICY = [
  'future_asset_rerun_matrix_is_current_snapshot_only',
  'ready_matrix_is_not_future_asset_whitelist',
  'fresh_rerun_must_be_repeated_for_new_assets_or_changed_asset_keys',
  'llm_generated_candidates_remain_candidate_only_until_gates_rerun',
  'old_object_rescan_must_not_use_historical_snapshots_as_permanent_evidence',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: FutureAssetRediscoveryGateRerunEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForSurface(
  surface: typeof REQUIRED_FUTURE_ASSET_REDISCOVERY_GATE_RERUN_SURFACES[number],
  evidence: FutureAssetRediscoveryGateRerunEvidence | undefined,
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
  surface: FutureAssetRediscoveryGateRerunSurface,
  evidenceRefs: string[],
): FutureAssetRediscoveryGateRerunEvidence {
  return {
    surface,
    status: 'verified',
    evidenceRefs,
  }
}

export function buildFutureAssetRediscoveryGateRerunMatrix(
  input: FutureAssetRediscoveryGateRerunMatrixInput,
): FutureAssetRediscoveryGateRerunMatrix {
  const rows = REQUIRED_FUTURE_ASSET_REDISCOVERY_GATE_RERUN_SURFACES.map((surface) => {
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
  const canDeclareFutureAssetRediscoveryGateRerunComplete = rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareFutureAssetRediscoveryGateRerunComplete
      ? 'future_asset_rediscovery_gate_rerun_confirmed'
      : 'future_asset_rediscovery_gate_rerun_incomplete',
    canDeclareFutureAssetRediscoveryGateRerunComplete,
    requiredSurfaces: [...REQUIRED_FUTURE_ASSET_REDISCOVERY_GATE_RERUN_SURFACES],
    rows,
    boundaryPolicy: [...CURRENT_SNAPSHOT_RERUN_BOUNDARY_POLICY],
  }
}

export function buildV14223FutureAssetRediscoveryGateRerunMatrix(): FutureAssetRediscoveryGateRerunMatrix {
  return buildFutureAssetRediscoveryGateRerunMatrix({
    evidence: [
      verified('fresh_asset_discovery', [
        'server/src/services/v14AssetDiscoveryService.ts discovers current v1.4 assets before admission',
        'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts',
      ]),
      verified('inventory_diagnostics_rerun', [
        'server/src/services/algorithmRuleAssetInventoryService.ts exposes current rule-asset inventory diagnostics',
        'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts',
      ]),
      verified('admission_gate_rerun', [
        'server/src/services/v14AssetAdmissionAutomationService.ts reruns admission over discovered assets',
        'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts',
      ]),
      verified('old_object_rescan', [
        'server/src/services/legacyScopeObjectSanitizer.ts strips deleted legacy scope-object fields',
        'server/src/__tests__/taskDtoService.test.ts',
        'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
        'client/src/services/__tests__/wbsTemplateGenerationApi.test.ts',
      ]),
      verified('llm_candidate_gate_rerun', [
        'server/src/services/algorithmAssetGovernanceProtocolService.ts blocks inferred LLM/auto publish rights without explicit governance fields',
        'server/src/services/algorithmAssetAutomationMaturityService.ts keeps manual/no-unattended anchors blocked until unlock criteria pass',
        'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts',
        'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts',
      ]),
      verified('governance_gate_rerun', [
        'scripts/check-v14223-governance-gate.mjs reruns focused v1.4.22.3 governance tests',
        'server/src/__tests__/v14223GovernanceCiGateContract.test.ts',
      ]),
    ],
  })
}
