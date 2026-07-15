export type CrossScopeReplayEvidenceSurface =
  | 'anchor_upgrade_strategy_cross_scope_gate'
  | 'cross_project_replay_threshold_evidence'
  | 'cross_company_replay_threshold_evidence'
  | 'scenario_diversity_replay_threshold_evidence'
  | 'manual_anchor_single_replay_blocker'
  | 'replay_evidence_only_no_publish_rights'

export type CrossScopeReplayEvidence = {
  surface: CrossScopeReplayEvidenceSurface | string
  status: 'verified' | 'not_applicable'
  evidenceRefs?: string[]
  reason?: string
}

export type CrossScopeReplayEvidenceMatrixInput = {
  evidence: CrossScopeReplayEvidence[]
}

export type CrossScopeReplayEvidenceMatrixRow = {
  surface: string
  status: 'confirmed' | 'incomplete'
  missingReasons: string[]
}

export type CrossScopeReplayEvidenceMatrix = {
  status: 'cross_scope_replay_evidence_confirmed' | 'cross_scope_replay_evidence_incomplete'
  canDeclareCrossScopeReplayEvidenceComplete: boolean
  requiredSurfaces: string[]
  rows: CrossScopeReplayEvidenceMatrixRow[]
  boundaryPolicy: string[]
}

const REQUIRED_CROSS_SCOPE_REPLAY_EVIDENCE_SURFACES = [
  'anchor_upgrade_strategy_cross_scope_gate',
  'cross_project_replay_threshold_evidence',
  'cross_company_replay_threshold_evidence',
  'scenario_diversity_replay_threshold_evidence',
  'manual_anchor_single_replay_blocker',
  'replay_evidence_only_no_publish_rights',
] as const

const CROSS_SCOPE_REPLAY_EVIDENCE_BOUNDARY_POLICY = [
  'cross_scope_replay_matrix_is_current_snapshot_only',
  'cross_scope_replay_evidence_does_not_grant_publish_rights',
  'single_candidate_or_single_replay_cannot_upgrade_manual_anchor',
  'anchor_upgrade_still_requires_versioned_strategy_audit_and_rollback_target',
  'new_replay_scope_or_asset_type_must_reenter_review_required',
] as const

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEvidenceRef(evidence: CrossScopeReplayEvidence) {
  return (evidence.evidenceRefs ?? []).some(hasText)
}

function reasonsForSurface(
  surface: typeof REQUIRED_CROSS_SCOPE_REPLAY_EVIDENCE_SURFACES[number],
  evidence: CrossScopeReplayEvidence | undefined,
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
  surface: CrossScopeReplayEvidenceSurface,
  evidenceRefs: string[],
): CrossScopeReplayEvidence {
  return {
    surface,
    status: 'verified',
    evidenceRefs,
  }
}

export function buildCrossScopeReplayEvidenceMatrix(
  input: CrossScopeReplayEvidenceMatrixInput,
): CrossScopeReplayEvidenceMatrix {
  const rows = REQUIRED_CROSS_SCOPE_REPLAY_EVIDENCE_SURFACES.map((surface) => {
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
  const canDeclareCrossScopeReplayEvidenceComplete = rows.every((row) => row.status === 'confirmed')

  return {
    status: canDeclareCrossScopeReplayEvidenceComplete
      ? 'cross_scope_replay_evidence_confirmed'
      : 'cross_scope_replay_evidence_incomplete',
    canDeclareCrossScopeReplayEvidenceComplete,
    requiredSurfaces: [...REQUIRED_CROSS_SCOPE_REPLAY_EVIDENCE_SURFACES],
    rows,
    boundaryPolicy: [...CROSS_SCOPE_REPLAY_EVIDENCE_BOUNDARY_POLICY],
  }
}

export function buildV14223CrossScopeReplayEvidenceMatrix(): CrossScopeReplayEvidenceMatrix {
  return buildCrossScopeReplayEvidenceMatrix({
    evidence: [
      verified('anchor_upgrade_strategy_cross_scope_gate', [
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts requires crossCompanyReplayPassed and impactScope for versioned anchor upgrades',
        'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts',
      ]),
      verified('cross_project_replay_threshold_evidence', [
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts requires impactScope.projectCount >= 2',
        'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts',
        'server/src/__tests__/standardWorkDurationSeedReplayService.test.ts',
        'server/src/__tests__/wbsTemplateGoldenBenchmarkReplayService.test.ts',
      ]),
      verified('cross_company_replay_threshold_evidence', [
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts requires impactScope.companyCount >= 2 and crossCompanyReplayPassed=true',
        'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts',
        'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts',
      ]),
      verified('scenario_diversity_replay_threshold_evidence', [
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts requires impactScope.scenarioCount >= 2',
        'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts',
        'server/src/__tests__/wbsTemplateGoldenBenchmarkReplayService.test.ts',
        'server/src/__tests__/wbsTemplateRecommendationAccuracyMatrixService.test.ts',
      ]),
      verified('manual_anchor_single_replay_blocker', [
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts blocks singleCandidateOnly with collect_cross_project_or_cross_company_replay',
        'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts',
        'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts',
      ]),
      verified('replay_evidence_only_no_publish_rights', [
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts returns canModifyPublishAnchor=false and canWriteRuntime=false for upgrade candidates',
        'server/src/services/algorithmAssetGovernanceProtocolService.ts still requires publish anchor, automation maturity, release-exit, writer, consumer, monitoring, and rollback gates',
        'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts',
        'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts',
      ]),
    ],
  })
}
