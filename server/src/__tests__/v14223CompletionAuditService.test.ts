import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildV14223CompletionAudit,
  buildV14223CurrentAcceptanceAssetInstanceCompletionEvidence,
  buildV14223CurrentCompletionEvidenceRecords,
  buildV14223CurrentCompletionAudit,
  buildV14223DefaultCompletionEvidenceRecords,
  extractCurrentV14223AcceptanceCriteria,
  extractCurrentV14223HardDecisionTableRows,
  extractCurrentV14223MachineExecutionGuardrails,
  extractCurrentV14223PlanSectionHeadings,
  V14223_COMPLETION_REQUIRED_SURFACES,
  type V14223CompletionEvidenceRecord,
  type V14223CompletionOperationClassification,
  type V14223CompletionRequirementSurface,
} from '../services/v14223CompletionAuditService.js'
import {
  buildDomainReleaseRuntimeClosureMatrix,
  buildV14223DomainReleaseRuntimeClosureMatrix,
} from '../services/domainReleaseRuntimeClosureMatrixService.js'
import {
  buildV14223FutureAssetRediscoveryGateRerunMatrix,
} from '../services/futureAssetRediscoveryGateRerunMatrixService.js'
import {
  buildV14223CrossScopeReplayEvidenceMatrix,
} from '../services/crossScopeReplayEvidenceMatrixService.js'
import {
  buildV14223MetricConsumerPathCoverageMatrix,
} from '../services/metricConsumerPathCoverageMatrixService.js'
import {
  buildV14223MetricProductionSnapshotPublicationRollbackMatrix,
} from '../services/metricProductionSnapshotPublicationRollbackMatrixService.js'
import {
  buildV14223OrdinaryBusinessDtoExposureMatrix,
} from '../services/ordinaryBusinessDtoExposureMatrixService.js'
import {
  buildV14223RuntimeAssetIsolationMatrix,
} from '../services/algorithmAssetIsolationMatrixService.js'
import type {
  ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim,
} from '../services/constructionOrganizationPlanNetworkDraftService.js'
import {
  buildConstructionOrganizationProductOutcomeCloseoutMatrix,
} from '../services/constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import {
  buildConstructionOrganizationPrecisionReplayMatrix,
} from '../services/constructionOrganizationPrecisionReplayMatrixService.js'
import {
  getAlgorithmRuleAssetInventoryDiagnostics,
} from '../services/algorithmRuleAssetInventoryService.js'
import {
  buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix,
} from '../services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.js'
import {
  evaluateV14AssetAdmissionAutomation,
} from '../services/v14AssetAdmissionAutomationService.js'
import {
  buildV14223AcceptanceCriteriaAudit,
  buildV14223CurrentHardDecisionTableAudit,
  buildV14223CurrentMachineExecutionGuardrailAudit,
  buildV14223CurrentAcceptanceCriteriaAudit,
  buildV14223CurrentRequirementCoverageAudit,
  buildV14223DefaultAcceptanceCriterionEvidenceRecords,
  buildV14223HardDecisionTableAudit,
  buildV14223MachineExecutionGuardrailAudit,
} from '../services/v14223RequirementCoverageAuditService.js'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function extractPlanSectionHeadings() {
  const planDoc = readFileSync(
    resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
    'utf8',
  )
  return planDoc
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, ''))
    .filter((line) => /^#{2,3}\s/.test(line))
    .map((line) => line.replace(/^#{2,3}\s+/, '').trim())
}

function extractAcceptanceCriteria() {
  const planDoc = readFileSync(
    resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
    'utf8',
  )
  const lines = planDoc.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, ''))
  const criteria: string[] = []
  let inAcceptance = false
  for (const line of lines) {
    if (/^## 14\.\s/.test(line)) {
      inAcceptance = true
      continue
    }
    if (inAcceptance && /^---\s*$/.test(line)) break
    if (inAcceptance && /^- /.test(line)) criteria.push(line.replace(/^- /, '').trim())
  }
  return criteria
}

function extractMachineExecutionGuardrails() {
  const planDoc = readFileSync(
    resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
    'utf8',
  )
  const lines = planDoc.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, ''))
  const guardrails: string[] = []
  let section: '0.1' | '0.7' | '15' | null = null
  for (const line of lines) {
    if (/^## 0\.1\s/.test(line)) {
      section = '0.1'
      continue
    }
    if (/^## 0\.7\s/.test(line)) {
      section = '0.7'
      continue
    }
    if (/^## 15\.\s/.test(line)) {
      section = '15'
      continue
    }
    if (/^##\s/.test(line)) {
      section = null
      continue
    }
    if ((section === '0.1' || section === '0.7') && /^\d+\.\s/.test(line)) {
      guardrails.push(line.replace(/^\d+\.\s+/, '').trim())
    }
    if (section === '15' && /^- /.test(line)) {
      guardrails.push(line.replace(/^- /, '').trim())
    }
  }
  return guardrails
}

function extractHardDecisionTableRows() {
  const planDoc = readFileSync(
    resolve(workspaceRoot, 'docs', 'plans', 'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'),
    'utf8',
  )
  const lines = planDoc.split(/\r?\n/).map((line) => line.replace(/^\uFEFF/, ''))
  const rows: Array<{
    discoveryCondition: string
    allowedAction: string
    forbiddenAction: string
  }> = []
  let inHardDecisionTable = false
  for (const line of lines) {
    if (/^## 0\.2\s/.test(line)) {
      inHardDecisionTable = true
      continue
    }
    if (inHardDecisionTable && /^##\s/.test(line)) break
    if (!inHardDecisionTable || !/^\| .+ \| .+ \| .+ \|$/.test(line)) continue
    if (line.includes('发现情况') || line.includes('---')) continue
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim())
    rows.push({
      discoveryCondition: cells[0] ?? '',
      allowedAction: cells[1] ?? '',
      forbiddenAction: cells[2] ?? '',
    })
  }
  return rows
}

function evidenceRefPath(ref: string) {
  return ref
    .split(' forbids ')[0]
    .split(' :: ')[0]
    .trim()
}

function completeRecord(surface: V14223CompletionRequirementSurface): V14223CompletionEvidenceRecord {
  return {
    surface,
    status: 'verified',
    sentenceClassification: surface === 'machine_execution_boundaries' ? 'boundary_rule' : 'current_evidence',
    evidenceFreshness: 'current_verified',
    evidenceLevel: 'asset_instance_completion_evidence',
    assetIdentity: {
      assetKey: `v14223.${surface}`,
      assetType: 'v14223_completion_surface',
      version: 'current-snapshot',
      scope: 'system',
      targetSurface: surface,
      consumer: 'v14223CompletionAuditService',
    },
    currentEvidenceRefs: [
      `docs/plans/v1.4.22.3规则资产公司隔离与自学习体系执行方案.md :: completion surface ${surface}`,
      'scripts/check-v14223-governance-gate.mjs :: focused v1.4.22.3 governance gate',
    ],
    fourFieldDecision: {
      learningTarget: 'governance_report',
      learningMaturity: 'shadow_report_only',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
    },
    operationClassification: 'evidence_layer_only',
    writerEvidenceRefs: ['server/src/services/v14223CompletionAuditService.ts :: no-runtime writer boundary verified'],
    consumerEvidenceRefs: ['server/src/services/v14223CompletionAuditService.ts :: no-runtime consumer boundary verified'],
    monitoringEvidenceRefs: ['scripts/check-v14223-governance-gate.mjs :: no-runtime monitoring boundary verified'],
    rollbackEvidenceRefs: ['server/src/services/v14223CompletionAuditService.ts :: no-runtime rollback boundary verified'],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/v14223CompletionAuditService.test.ts :: manual anchor missing writer old object conflict and rollback blockers verified',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/services/legacyScopeObjectSanitizer.ts :: legacy scope object sanitizer contract verified',
      ],
    },
    remainingGaps: [],
  }
}

function runtimeClosureRecord(surface: V14223CompletionRequirementSurface): V14223CompletionEvidenceRecord {
  const record = completeRecord(surface)
  if (surface !== 'runtime_writer_consumer_monitoring_rollback') return record

  return {
    ...record,
    operationClassification: 'runtime_published',
    evidenceLevel: 'runtime_operation_evidence',
    writerEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: asset type runtime writer verified',
    ],
    consumerEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime consumer verified',
    ],
    monitoringEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime impact monitoring verified',
    ],
    rollbackEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime rollback writer and target verified',
    ],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts :: not_applicable cannot replace runtime closure evidence',
    ],
  }
}

function readyWorkbench() {
  return {
    canDeclareGovernanceWorkbenchComplete: true,
    completionScope: 'workbench_readiness_evidence_only' as const,
    canDeclareV14223GovernanceComplete: false as const,
    remainingClosureGaps: [],
    gates: [{
      key: 'all_workbench_gates',
      status: 'ready' as const,
      evidenceRefs: [
        'server/src/services/algorithmAssetGovernanceWorkbenchReadinessService.ts :: workbench readiness evidence gate',
      ],
      missingReasons: [],
    }],
  }
}

function readyConstructionOrganizationRuntimeCloseoutClaim(): ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim {
  return {
    source: 'construction_organization_plan_network_runtime_closeout_claim',
    status: 'runtime_closeout_claim_ready',
    canClaimRuntimeCloseout: true,
    canMaterializeRuntime: false,
    totalDraftCount: 1,
    claimBasis: [
      'release_exit_handoff_linked_for_every_draft',
      'domain_writer_runtime_publication_linked_for_every_draft',
      'runtime_consumer_observation_linked_for_every_draft',
      'impact_monitoring_passed_for_every_draft',
      'rollback_execution_verified_for_every_draft',
      'saved_network_outcome_linked_for_every_draft',
      'true_per_option_E1_E3_E5_runtime_evidence_linked_for_every_draft',
      'site_adoption_of_runtime_recommended_option_linked',
    ],
    missingBeforeClaim: [],
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesSeed: false,
      writesBaseline: false,
      writesCriticalPathFacts: false,
      writesAccelerationDraft: false,
    },
    boundaryPolicy: [
      'runtime_closeout_claim_is_a_read_only_audit_projection',
      'requires_site_adoption_of_runtime_recommended_option',
    ],
  }
}

function readyConstructionOrganizationProductOutcomeCloseoutMatrix() {
  const precisionReplayMatrix = buildConstructionOrganizationPrecisionReplayMatrix()
  return buildConstructionOrganizationProductOutcomeCloseoutMatrix({
    precisionReplayMatrix,
    runtimeEvidenceContextsByBusinessType: Object.fromEntries(
      precisionReplayMatrix.businessTypes.map((row, index) => [
        row.businessType,
        {
          projectIds: [`project-${index + 1}`],
          draftNetworkKeys: [
            `draft-${row.businessType}-recommended`,
            `draft-${row.businessType}-foundation-alt`,
            `draft-${row.businessType}-release-alt`,
          ],
          optionIds: [
            `option-${row.businessType}-recommended`,
            `option-${row.businessType}-foundation-alt`,
            `option-${row.businessType}-release-alt`,
          ],
          publicationKeys: [`construction-org-plan-network:project-${index + 1}:option-${row.businessType}`],
          evidenceSources: ['runtime'],
          useCases: ['newProjectPlanning', 'startingLineOnboarding', 'accelerationRecovery'],
          optionCount: 3,
          runtimeReadyOptionCount: 3,
          runtimeReadyOptionCloseoutClaimCount: 3,
          runtimeReadyUseCaseOptionCounts: {
            newProjectPlanning: 3,
            startingLineOnboarding: 3,
            accelerationRecovery: 3,
          },
          runtimeReadyUseCaseOptionCloseoutClaimCounts: {
            newProjectPlanning: 3,
            startingLineOnboarding: 3,
            accelerationRecovery: 3,
          },
          runtimeCloseoutClaim: readyConstructionOrganizationRuntimeCloseoutClaim(),
        },
      ]),
    ),
    runtimeCloseoutClaimsByBusinessType: Object.fromEntries(
      precisionReplayMatrix.businessTypes.map((row) => [
        row.businessType,
        readyConstructionOrganizationRuntimeCloseoutClaim(),
      ]),
    ),
  })
}

function readyRequirementCoverageAudit() {
  return buildV14223CurrentRequirementCoverageAudit({
    currentSnapshotGatePassed: true,
  })
}

function readyAcceptanceCriteriaAudit() {
  return buildV14223CurrentAcceptanceCriteriaAudit({
    currentSnapshotGatePassed: true,
  })
}

function assetInstanceAcceptanceCompletionAudit() {
  return buildV14223AcceptanceCriteriaAudit({
    currentSnapshotGatePassed: true,
    documentAcceptanceCriteria: extractAcceptanceCriteria(),
    evidenceRecords: buildV14223DefaultAcceptanceCriterionEvidenceRecords().map((record) => ({
      ...record,
      completionEvidenceLevel: 'asset_instance_completion_evidence' as const,
      assetInstanceCompletionEvidence: {
        assetType: 'v14223_acceptance_criterion',
        scope: `section_14.${record.criterionId}`,
        writerEvidenceRefs: [
          'server/src/__tests__/v14223CompletionAuditService.test.ts :: writer evidence for asset-instance completion contract',
        ],
        consumerEvidenceRefs: [
          'server/src/__tests__/v14223CompletionAuditService.test.ts :: consumer evidence for asset-instance completion contract',
        ],
        monitoringEvidenceRefs: [
          'server/src/__tests__/v14223CompletionAuditService.test.ts :: monitoring evidence for asset-instance completion contract',
        ],
        releaseRecordEvidenceRefs: [
          'server/src/__tests__/v14223CompletionAuditService.test.ts :: release record evidence for asset-instance completion contract',
        ],
        rollbackEvidenceRefs: [
          'server/src/__tests__/v14223CompletionAuditService.test.ts :: rollback evidence for asset-instance completion contract',
        ],
        oldObjectHandlingEvidenceRefs: [
          'server/src/__tests__/v14223CompletionAuditService.test.ts :: old-object handling evidence for asset-instance completion contract',
        ],
      },
      evidenceRefs: [
        ...record.evidenceRefs,
        'server/src/__tests__/v14223CompletionAuditService.test.ts :: asset-instance completion proof for completion audit contract',
      ],
    })),
  })
}

function readyMachineExecutionGuardrailAudit() {
  return buildV14223CurrentMachineExecutionGuardrailAudit({
    currentSnapshotGatePassed: true,
    documentMachineExecutionGuardrails: extractMachineExecutionGuardrails(),
  })
}

function readyHardDecisionTableAudit() {
  return buildV14223CurrentHardDecisionTableAudit({
    currentSnapshotGatePassed: true,
    documentHardDecisionRows: extractHardDecisionTableRows(),
  })
}

describe('v14223CompletionAuditService', () => {
  it('keeps asset-instance acceptance evidence bounded when no current matrices are provided', () => {
    const evidence = buildV14223CurrentAcceptanceAssetInstanceCompletionEvidence()

    expect(evidence.length).toBeGreaterThan(0)
    expect(evidence.map((record) => record.criterionId)).toEqual(expect.arrayContaining([
      'acceptance_company_learning_does_not_write_system_seed',
      'acceptance_llm_outputs_enter_candidate_gate',
    ]))
    expect(evidence.map((record) => record.criterionId)).not.toContain(
      'acceptance_runtime_rollback_requires_writer_and_consumer_verification',
    )
  })

  it('builds a default current completion evidence matrix for every required surface', () => {
    const defaultEvidence = buildV14223DefaultCompletionEvidenceRecords()

    expect(defaultEvidence).toHaveLength(V14223_COMPLETION_REQUIRED_SURFACES.length)
    expect(new Set(defaultEvidence.map((record) => record.surface)).size).toBe(defaultEvidence.length)

    for (const surface of V14223_COMPLETION_REQUIRED_SURFACES) {
      const record = defaultEvidence.find((candidate) => candidate.surface === surface)

      expect(record?.status).toBe('verified')
      expect(record?.assetIdentity.assetKey).toBe(`v14223.${surface}`)
      expect(record?.assetIdentity.scope).toBe('system_governance_evidence_only')
      expect(record?.currentEvidenceRefs.length).toBeGreaterThan(0)
      expect(record?.writerEvidenceRefs.length).toBeGreaterThan(0)
      expect(record?.consumerEvidenceRefs.length).toBeGreaterThan(0)
      expect(record?.monitoringEvidenceRefs.length).toBeGreaterThan(0)
      expect(record?.rollbackEvidenceRefs.length).toBeGreaterThan(0)
      expect(record?.forbiddenPathEvidenceRefs.length).toBeGreaterThan(0)
      expect(record?.oldObjectHandling.evidenceRefs.length).toBeGreaterThan(0)
      expect(record?.operationClassification).not.toBe('runtime_published')
      expect(record?.evidenceFreshness).toBe('current_verified')
      expect(record?.evidenceLevel).toBe('evidence_layer_only')
      expect(record?.remainingGaps).toEqual([])
    }
  })

  it('keeps the current completion audit incomplete until construction-organization runtime closeout is proven', () => {
    const audit = buildV14223CurrentCompletionAudit({
      currentSnapshotGatePassed: true,
    })

    expect(audit.reportCode).toBe('v14223_completion_audit')
    expect(audit.declarationStatus).toBe('current_snapshot_gate_passed')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'workbench_readiness_gates_must_all_be_ready',
      'construction_organization_runtime_closeout_claim:construction_organization_runtime_closeout_claim_required',
      'remaining_closure_gap:construction_organization_runtime_closeout_claim',
    ]))
    expect(audit.missingReasons).not.toContain('section_14_acceptance_criteria_completion_evidence_level_required')
    expect(audit.missingReasons).not.toContain('section_14_acceptance_criteria_completion_evidence_required')
    expect(audit.recordResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'runtime_writer_consumer_monitoring_rollback',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'machine_execution_boundaries',
        status: 'incomplete',
        missingReasons: expect.arrayContaining([
          'evidence_level_not_completion_ready:evidence_layer_only',
        ]),
      }),
    ]))
    expect(audit.recordResults.some((record) => record.status === 'incomplete')).toBe(true)
  })

  it('does not declare current-snapshot v1.4.22.3 governance completion from runtime closeout claim alone after the product outcome gate landed', () => {
    const audit = buildV14223CurrentCompletionAudit({
      currentSnapshotGatePassed: true,
      constructionOrganizationRuntimeCloseoutClaim: readyConstructionOrganizationRuntimeCloseoutClaim(),
    })

    expect(audit.declarationStatus).toBe('current_snapshot_gate_passed')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'workbench_readiness_gates_must_all_be_ready',
      'construction_organization_product_outcome_closeout_matrix:construction_organization_product_outcome_closeout_matrix_required',
      'remaining_closure_gap:construction_organization_product_outcome_closeout_matrix',
    ]))
  })

  it('can declare current-snapshot v1.4.22.3 governance completion only after construction-organization runtime closeout and product outcome closeout are proven', () => {
    const audit = buildV14223CurrentCompletionAudit({
      currentSnapshotGatePassed: true,
      constructionOrganizationRuntimeCloseoutClaim: readyConstructionOrganizationRuntimeCloseoutClaim(),
      constructionOrganizationProductOutcomeCloseoutMatrix: readyConstructionOrganizationProductOutcomeCloseoutMatrix(),
    })

    expect(audit.declarationStatus).toBe('v14223_governance_complete_current_snapshot')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(true)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(true)
    expect(audit.missingReasons).toEqual([])
    expect(audit.recordResults.every((record) => record.status === 'verified')).toBe(true)
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'completion_audit_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
      'runtime_surface_closed_requires_runtime_closure_operation_evidence',
      'future_asset_or_llm_candidate_changes_must_rerun_completion_audit',
    ]))
  })

  it('keeps default completion evidence references grounded in current workspace files', () => {
    const refs = buildV14223DefaultCompletionEvidenceRecords().flatMap((record) => [
      ...record.currentEvidenceRefs,
      ...record.writerEvidenceRefs,
      ...record.consumerEvidenceRefs,
      ...record.monitoringEvidenceRefs,
      ...record.rollbackEvidenceRefs,
      ...record.forbiddenPathEvidenceRefs,
      ...record.oldObjectHandling.evidenceRefs,
    ])

    expect(refs.length).toBeGreaterThan(V14223_COMPLETION_REQUIRED_SURFACES.length)
    for (const ref of refs) {
      expect(ref).not.toMatch(/manual note|todo|tbd|historical_evidence_needs_refresh/i)
      expect(existsSync(resolve(workspaceRoot, evidenceRefPath(ref))), ref).toBe(true)
    }
  })

  it('extracts the current v1.4.22.3 plan inputs used by current completion audit defaults', () => {
    expect(extractCurrentV14223PlanSectionHeadings()).toEqual(extractPlanSectionHeadings())
    expect(extractCurrentV14223AcceptanceCriteria()).toEqual(extractAcceptanceCriteria())
    expect(extractCurrentV14223MachineExecutionGuardrails()).toEqual(extractMachineExecutionGuardrails())
    expect(extractCurrentV14223HardDecisionTableRows()).toEqual(extractHardDecisionTableRows())
  })

  it('upgrades only the runtime closure surface from the current domain runtime closure matrix', () => {
    const evidence = buildV14223CurrentCompletionEvidenceRecords({
      domainReleaseRuntimeClosureMatrix: buildV14223DomainReleaseRuntimeClosureMatrix(),
    })
    const runtimeRecord = evidence.find((record) =>
      record.surface === 'runtime_writer_consumer_monitoring_rollback')
    const otherRecords = evidence.filter((record) =>
      record.surface !== 'runtime_writer_consumer_monitoring_rollback')

    expect(runtimeRecord).toEqual(expect.objectContaining({
      evidenceLevel: 'runtime_operation_evidence',
      operationClassification: 'runtime_published',
      assetIdentity: expect.objectContaining({
        assetType: 'v14223_domain_release_runtime_closure',
        scope: 'current_registered_domain_release_asset_types',
      }),
    }))
    expect(runtimeRecord?.writerEvidenceRefs).toEqual(expect.arrayContaining([
      expect.stringContaining('asset_type_domain_writer'),
    ]))
    expect(runtimeRecord?.consumerEvidenceRefs).toEqual(expect.arrayContaining([
      expect.stringContaining('runtime_consumer_verification'),
    ]))
    expect(runtimeRecord?.monitoringEvidenceRefs).toEqual(expect.arrayContaining([
      expect.stringContaining('impact_monitoring'),
    ]))
    expect(runtimeRecord?.currentEvidenceRefs).toEqual(expect.arrayContaining([
      expect.stringContaining('release_record'),
    ]))
    expect(runtimeRecord?.rollbackEvidenceRefs).toEqual(expect.arrayContaining([
      expect.stringContaining('rollback_writer_and_target'),
    ]))
    expect(runtimeRecord?.forbiddenPathEvidenceRefs).toEqual(expect.arrayContaining([
      'server/src/__tests__/v14223CompletionAuditService.test.ts :: runtime closure matrix evidence does not grant chapter completion alone',
    ]))
    expect(otherRecords.every((record) => record.evidenceLevel === 'evidence_layer_only')).toBe(true)
  })

  it('keeps runtime closure as evidence-layer only when the domain runtime closure matrix is incomplete', () => {
    const evidence = buildV14223CurrentCompletionEvidenceRecords({
      domainReleaseRuntimeClosureMatrix: buildDomainReleaseRuntimeClosureMatrix({
        evidence: [],
      }),
    })
    const runtimeRecord = evidence.find((record) =>
      record.surface === 'runtime_writer_consumer_monitoring_rollback')

    expect(runtimeRecord).toEqual(expect.objectContaining({
      evidenceLevel: 'evidence_layer_only',
      operationClassification: 'release_exit_handoff',
      assetIdentity: expect.objectContaining({
        scope: 'system_governance_evidence_only',
      }),
    }))
  })

  it('keeps completion in review when workbench readiness or current rerun evidence is missing', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: {
        canDeclareGovernanceWorkbenchComplete: false,
        completionScope: 'workbench_readiness_evidence_only',
        canDeclareV14223GovernanceComplete: false,
        remainingClosureGaps: [{
          key: 'all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
          status: 'not_proven_by_workbench_readiness',
          evidenceRequired: ['asset_type_domain_writer'],
          reason: 'runtime closure matrix missing',
        }],
        gates: [{
          key: 'domain_release_runtime_closure_matrix',
          status: 'needs_work',
          evidenceRefs: [],
          missingReasons: ['domain_release_runtime_closure_matrix_required'],
        }],
      },
      currentSnapshotGatePassed: false,
      futureAssetRediscoveryGateRerunComplete: false,
      evidenceRecords: [],
    })

    expect(audit.declarationStatus).toBe('review_required')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'current_snapshot_gate_rerun_required',
      'workbench_readiness_gates_must_all_be_ready',
      'domain_release_runtime_closure_matrix:domain_release_runtime_closure_matrix_required',
      'remaining_closure_gap:all_domain_release_adapters_runtime_writers_consumers_monitoring_rollback',
      'future_asset_rediscovery_gate_rerun_required',
      'machine_execution_boundaries:machine_execution_boundaries_evidence_record_required',
    ]))
  })

  it('does not elevate readiness when the current snapshot gate was not rerun', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: false,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord),
    })

    expect(audit.declarationStatus).toBe('review_required')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'current_snapshot_gate_rerun_required',
    ]))
  })

  it('does not declare runtime surface closed when the future asset rerun gate is missing', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: false,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(runtimeClosureRecord),
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'future_asset_rediscovery_gate_rerun_required',
    ]))
  })

  it('requires every required surface to satisfy the v1.4.22.3 output template', () => {
    const records = V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord)
    records[0] = {
      ...records[0],
      operationClassification: undefined as never,
      writerEvidenceRefs: [],
      forbiddenPathEvidenceRefs: [],
      remainingGaps: ['manual_anchor_upgrade_audit_missing'],
    }

    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      evidenceRecords: records,
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.recordResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'machine_execution_boundaries',
        status: 'incomplete',
        missingReasons: expect.arrayContaining([
          'operation_classification_required',
          'writer_evidence_refs_required',
          'forbidden_path_evidence_refs_required',
          'remaining_gap:manual_anchor_upgrade_audit_missing',
        ]),
      }),
    ]))
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'each_required_surface_must_use_v14223_output_template',
      'runtime_surface_closed_requires_complete_current_output_template',
    ]))
  })

  it('treats non-completion operation classifications as valid output but not completion-ready evidence', () => {
    const nonCompletionOperations: V14223CompletionOperationClassification[] = [
      'historical_evidence_needs_refresh',
      'review_required',
      'platform_exception_review',
      'blocked',
    ]

    for (const operationClassification of nonCompletionOperations) {
      const records = V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord)
      records[0] = {
        ...records[0],
        operationClassification,
      }

      const audit = buildV14223CompletionAudit({
        workbenchReadiness: readyWorkbench(),
        currentSnapshotGatePassed: true,
        futureAssetRediscoveryGateRerunComplete: true,
        requirementCoverageAudit: readyRequirementCoverageAudit(),
        evidenceRecords: records,
      })

      expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
      expect(audit.recordResults).toEqual(expect.arrayContaining([
        expect.objectContaining({
          surface: 'machine_execution_boundaries',
          status: 'incomplete',
          missingReasons: expect.arrayContaining([
            `operation_classification_not_completion_ready:${operationClassification}`,
          ]),
        }),
      ]))
    }
  })

  it('requires document requirement coverage before declaring a chapter completion candidate', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: {
        status: 'document_requirement_coverage_review_required',
        missingReasons: [
          '12:section_evidence_record_required',
          '14:section_forbidden_path_evidence_refs_required',
        ],
      },
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord),
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'document_requirement_coverage_audit_required',
      'runtime_surface_closure_evidence_required',
      'document_requirement_coverage:12:section_evidence_record_required',
      'document_requirement_coverage:14:section_forbidden_path_evidence_refs_required',
    ]))
  })

  it('requires section 14 acceptance item coverage before declaring a chapter completion candidate', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord),
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'runtime_surface_closure_evidence_required',
      'section_14_acceptance_criteria_audit_required',
    ]))
  })

  it('requires machine execution guardrail item coverage before declaring a chapter completion candidate', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: assetInstanceAcceptanceCompletionAudit(),
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(runtimeClosureRecord),
    })

    expect(audit.declarationStatus).toBe('runtime_surface_closed')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'machine_execution_guardrail_audit_required',
    ]))
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'chapter_completion_candidate_requires_machine_execution_guardrail_audit',
    ]))
  })

  it('keeps the completion audit blocked when machine execution guardrail coverage is stale or incomplete', () => {
    const machineGuardrailAudit = buildV14223MachineExecutionGuardrailAudit({
      currentSnapshotGatePassed: false,
      documentMachineExecutionGuardrails: extractMachineExecutionGuardrails(),
      evidenceRecords: [],
    })

    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: assetInstanceAcceptanceCompletionAudit(),
      machineExecutionGuardrailAudit: machineGuardrailAudit,
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(runtimeClosureRecord),
    })

    expect(audit.declarationStatus).toBe('runtime_surface_closed')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'machine_execution_guardrail_audit_required',
      'machine_execution_guardrail:current_snapshot_gate_rerun_required',
      'machine_execution_guardrail:machine_guardrail:machine_guardrail_001:machine_guardrail_evidence_record_required',
    ]))
  })

  it('requires hard-decision table row coverage before declaring a chapter completion candidate', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: assetInstanceAcceptanceCompletionAudit(),
      machineExecutionGuardrailAudit: readyMachineExecutionGuardrailAudit(),
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(runtimeClosureRecord),
    })

    expect(audit.declarationStatus).toBe('runtime_surface_closed')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'hard_decision_table_audit_required',
    ]))
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'chapter_completion_candidate_requires_hard_decision_table_audit',
    ]))
  })

  it('keeps the completion audit blocked when hard-decision table coverage is stale or incomplete', () => {
    const hardDecisionTableAudit = buildV14223HardDecisionTableAudit({
      currentSnapshotGatePassed: false,
      documentHardDecisionRows: extractHardDecisionTableRows(),
      evidenceRecords: [],
    })

    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: assetInstanceAcceptanceCompletionAudit(),
      machineExecutionGuardrailAudit: readyMachineExecutionGuardrailAudit(),
      hardDecisionTableAudit,
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(runtimeClosureRecord),
    })

    expect(audit.declarationStatus).toBe('runtime_surface_closed')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'hard_decision_table_audit_required',
      'hard_decision_table:current_snapshot_gate_rerun_required',
      'hard_decision_table:hard_decision_row:hard_decision_row_001:hard_decision_row_evidence_record_required',
    ]))
  })

  it('builds the current completion audit from current evidence as current-snapshot completion', () => {
    const audit = buildV14223CurrentCompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      documentHeadings: extractPlanSectionHeadings(),
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
    })

    expect(audit.declarationStatus).toBe('v14223_governance_complete_current_snapshot')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(true)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(true)
    expect(audit.missingReasons).toEqual([])
    expect(audit.missingReasons).not.toContain('section_14_acceptance_criteria_completion_evidence_level_required')
    expect(audit.missingReasons).not.toContain('section_14_acceptance_criteria_completion_evidence_required')
    expect(audit.missingReasons).not.toContain('runtime_surface_closure_evidence_required')
    expect(audit.recordResults.every((record) => record.status === 'verified')).toBe(true)
    expect(audit.recordResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'machine_execution_boundaries',
        status: 'verified',
        missingReasons: [],
      }),
    ]))
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'completion_audit_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
      'runtime_surface_closed_requires_runtime_closure_operation_evidence',
      'chapter_completion_candidate_requires_asset_instance_acceptance_completion_evidence',
      'future_asset_or_llm_candidate_changes_must_rerun_completion_audit',
    ]))
  })

  it('uses current runtime closure matrix evidence as part of bounded current-snapshot completion', () => {
    const audit = buildV14223CurrentCompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      documentHeadings: extractPlanSectionHeadings(),
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
      domainReleaseRuntimeClosureMatrix: buildV14223DomainReleaseRuntimeClosureMatrix(),
      crossScopeReplayEvidenceMatrix: buildV14223CrossScopeReplayEvidenceMatrix(),
    })

    expect(audit.declarationStatus).toBe('v14223_governance_complete_current_snapshot')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(true)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(true)
    expect(audit.missingReasons).not.toContain('runtime_surface_closure_evidence_required')
    expect(audit.missingReasons).toEqual([])
    expect(audit.missingReasons).not.toContain('section_14_acceptance_criteria_completion_evidence_required')
    expect(audit.missingReasons).not.toContain('section_14_acceptance_criteria_completion_evidence_level_required')
    expect(audit.recordResults).toEqual(expect.arrayContaining([
      expect.objectContaining({
        surface: 'runtime_writer_consumer_monitoring_rollback',
        status: 'verified',
        missingReasons: [],
      }),
      expect.objectContaining({
        surface: 'machine_execution_boundaries',
        status: 'verified',
        missingReasons: [],
      }),
    ]))
  })

  it('maps current runtime closure and evidence-layer matrices to section 14 asset-instance evidence without completing the chapter', () => {
    const assetInstanceEvidence = buildV14223CurrentAcceptanceAssetInstanceCompletionEvidence({
      domainReleaseRuntimeClosureMatrix: buildV14223DomainReleaseRuntimeClosureMatrix(),
      runtimeIsolationMatrix: buildV14223RuntimeAssetIsolationMatrix(),
      algorithmRuleAssetInventoryDiagnostics: getAlgorithmRuleAssetInventoryDiagnostics(),
      assetAdmissionAutomationReport: evaluateV14AssetAdmissionAutomation(),
      futureAssetRediscoveryGateRerunMatrix: buildV14223FutureAssetRediscoveryGateRerunMatrix(),
      crossScopeReplayEvidenceMatrix: buildV14223CrossScopeReplayEvidenceMatrix(),
      ordinaryBusinessDtoExposureMatrix: buildV14223OrdinaryBusinessDtoExposureMatrix(),
      templateWriteSurfaceLegacyScopeSanitizerMatrix: buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix(),
      metricProductionSnapshotPublicationRollbackMatrix: buildV14223MetricProductionSnapshotPublicationRollbackMatrix(),
      metricConsumerPathCoverageMatrix: buildV14223MetricConsumerPathCoverageMatrix(),
    })
    const criterionIds = assetInstanceEvidence.map((record) => record.criterionId)

    expect(assetInstanceEvidence).toHaveLength(34)
    expect(criterionIds).toEqual(expect.arrayContaining([
      'acceptance_runtime_rollback_requires_writer_and_consumer_verification',
      'acceptance_candidate_no_direct_runtime_effect',
      'acceptance_auto_publish_requires_full_release_chain',
      'acceptance_canary_requires_consumer_monitoring_rollback',
      'acceptance_high_risk_assets_require_governance_package',
      'acceptance_existing_learning_governed_by_anchor',
      'acceptance_auto_publish_explicit_only',
      'acceptance_manual_anchor_blocks_single_candidate',
      'acceptance_anchor_upgrade_is_governance_asset',
      'acceptance_auto_governance_not_auto_publish',
      'acceptance_learning_not_live_self_upgrade',
      'acceptance_publish_anchor_fields_require_governance',
      'acceptance_company_isolation_no_cross_read',
      'acceptance_company_learning_does_not_write_system_seed',
      'acceptance_business_facts_not_silently_rewritten',
      'acceptance_algorithm_parameters_registered',
      'acceptance_duration_learning_chains_separate',
      'acceptance_cold_start_shared_baseline_is_anonymous_readonly',
      'acceptance_sample_health_observable',
      'acceptance_llm_outputs_enter_candidate_gate',
      'acceptance_conflict_assets_isolated_with_evidence',
      'acceptance_conflict_with_existing_rule_requires_release_evidence',
      'acceptance_exception_arbitration_feedback_to_rules',
      'acceptance_system_promotion_uses_multi_scope_automatic_evidence',
      'acceptance_replay_explains_promotion_or_rejection',
      'acceptance_governance_metrics_registered',
      'acceptance_duration_impact_assets_four_field_registration',
      'acceptance_future_duration_assets_auto_discovered',
      'acceptance_discovery_review_items_and_blockers_clear_for_phase',
      'acceptance_review_items_zero_is_snapshot_only',
      'acceptance_future_asset_rerun_matrix_ready_is_snapshot_only',
      'acceptance_readonly_inventory_routes_are_evidence_layer_only',
      'acceptance_ordinary_business_pages_hide_technical_fields',
      'acceptance_legacy_scope_fields_blocked',
    ]))
    const evidenceByCriterion = new Map(assetInstanceEvidence.map((record) => [record.criterionId, record.evidence]))

    expect(evidenceByCriterion.get('acceptance_candidate_no_direct_runtime_effect')).toEqual(expect.objectContaining({
      assetType: 'algorithm_asset_candidate_release_gate',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('candidate-only manual-required'),
        expect.stringContaining('asset_type_domain_writer'),
      ]),
      releaseRecordEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('release_record'),
      ]),
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('rollback_writer_and_target'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_auto_publish_requires_full_release_chain')).toEqual(expect.objectContaining({
      assetType: 'algorithm_asset_auto_publish_release_chain',
      monitoringEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('impactMonitoringReady'),
        expect.stringContaining('impact_monitoring'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_canary_requires_consumer_monitoring_rollback')).toEqual(expect.objectContaining({
      assetType: 'algorithm_asset_canary_runtime_boundary',
      consumerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('canary runtime boundary'),
        expect.stringContaining('runtime_consumer_verification'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_manual_anchor_blocks_single_candidate')).toEqual(expect.objectContaining({
      assetType: 'manual_anchor_unlock_policy',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('single-candidate'),
        expect.stringContaining('manual assets'),
      ]),
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('single-candidate'),
        expect.stringContaining('rollback_writer_and_target'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_anchor_upgrade_is_governance_asset')).toEqual(expect.objectContaining({
      assetType: 'versioned_anchor_upgrade_governance_asset',
      releaseRecordEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('versioned upgrade candidate'),
        expect.stringContaining('release_record'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_learning_not_live_self_upgrade')).toEqual(expect.objectContaining({
      assetType: 'learning_maturity_live_boundary_policy',
      consumerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('shadow-report-only'),
        expect.stringContaining('runtime_consumer_verification'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_company_learning_does_not_write_system_seed')).toEqual(expect.objectContaining({
      assetType: 'company_learning_no_system_seed_write_boundary',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('algorithm_learnable_parameter_runtime_publications'),
        expect.stringContaining('fact-layer contracts set autoRewriteAllowed false'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_business_facts_not_silently_rewritten')).toEqual(expect.objectContaining({
      assetType: 'business_fact_lock_acceptance_boundary',
      releaseRecordEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('publish_learning_update returns duration_fact_layer_learning_publish_blocked'),
      ]),
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('auto_rewrite_fact is rejected before any rollback-producing runtime write exists'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_algorithm_parameters_registered')).toEqual(expect.objectContaining({
      assetType: 'learnable_algorithm_parameter_registry_boundary',
      monitoringEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('treats unregistered parameters as frozen constants'),
      ]),
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('marks parameter runtime publication rolled back'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_duration_learning_chains_separate')).toEqual(expect.objectContaining({
      assetType: 'duration_learning_chain_separation_boundary',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('base duration benchmark live-learning evidence is scoped to base_duration_benchmark'),
        expect.stringContaining('forecast residual overlay is a separate governance and runtime publication surface'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_cold_start_shared_baseline_is_anonymous_readonly')).toEqual(expect.objectContaining({
      assetType: 'anonymous_readonly_cold_start_baseline_boundary',
      consumerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('canWriteCompanyOverride false and canWriteSharedBaseline false'),
        expect.stringContaining('does not select shared baselines that consume other company private artifacts'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_sample_health_observable')).toEqual(expect.objectContaining({
      assetType: 'sample_health_observability_boundary',
      monitoringEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('downgrades completed samples with derived dates to weak'),
      ]),
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('sample health is governance evidence and does not publish runtime versions'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_llm_outputs_enter_candidate_gate')).toEqual(expect.objectContaining({
      assetType: 'llm_candidate_gate_boundary',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('routes llm generated candidate payloads to review'),
      ]),
      oldObjectHandlingEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('quarantines candidate events that contain deleted range-tree compatibility fields'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_conflict_assets_isolated_with_evidence')).toEqual(expect.objectContaining({
      assetType: 'conflict_asset_isolation_evidence_boundary',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('quarantines project candidates that try to replace company or system rules'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_conflict_with_existing_rule_requires_release_evidence')).toEqual(expect.objectContaining({
      assetType: 'existing_rule_conflict_requires_unified_release_evidence',
      oldObjectHandlingEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('legacy published names as runtime baselines without unified publication evidence'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_system_promotion_uses_multi_scope_automatic_evidence')).toEqual(expect.objectContaining({
      assetType: 'cross_scope_system_promotion_review_matrix',
      monitoringEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('cross-scope replay evidence does not grant publish rights'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_replay_explains_promotion_or_rejection')).toEqual(expect.objectContaining({
      assetType: 'replay_explanation_publish_gate_boundary',
      consumerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('runtime impact distinguishes publish_gate_evidence'),
        expect.stringContaining('explain_chain_only_not_runtime_writer'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_high_risk_assets_require_governance_package')).toEqual(expect.objectContaining({
      assetType: 'high_risk_asset_governance_package_boundary',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('automation maturity review is a governance package'),
        expect.stringContaining('high-risk'),
      ]),
      releaseRecordEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('review_package_only'),
      ]),
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('rollback target'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_exception_arbitration_feedback_to_rules')).toEqual(expect.objectContaining({
      assetType: 'platform_exception_arbitration_feedback_boundary',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('platform_exception_review'),
      ]),
      releaseRecordEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('versioned upgrade candidate'),
      ]),
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('never modifies publish anchors'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_duration_impact_assets_four_field_registration')).toEqual(expect.objectContaining({
      assetType: 'current_duration_impact_asset_admission_snapshot',
      writerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('durationRelated and four-field governance decisions'),
      ]),
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('conservative governance defaults require explicit follow up before runtime publish'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_future_duration_assets_auto_discovered')).toEqual(expect.objectContaining({
      assetType: 'future_duration_asset_rediscovery_gate',
      releaseRecordEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('not future asset whitelist'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_review_items_zero_is_snapshot_only')).toEqual(expect.objectContaining({
      assetType: 'current_snapshot_admission_zero_review_boundary',
      rollbackEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('completion audit does not grant publish rights'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_readonly_inventory_routes_are_evidence_layer_only')).toEqual(expect.objectContaining({
      assetType: 'readonly_rule_asset_inventory_diagnostics_route',
      releaseRecordEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('conservative admin-only diagnostic'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_ordinary_business_pages_hide_technical_fields')).toEqual(expect.objectContaining({
      assetType: 'ordinary_business_dto_exposure_boundary',
      consumerEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('ordinary page text'),
      ]),
    }))
    expect(evidenceByCriterion.get('acceptance_legacy_scope_fields_blocked')).toEqual(expect.objectContaining({
      assetType: 'legacy_scope_object_negative_protection_matrix',
      oldObjectHandlingEvidenceRefs: expect.arrayContaining([
        expect.stringContaining('old scope fields'),
        expect.stringContaining('WBS preview requests strip deleted scope-object fields'),
      ]),
    }))

    const acceptanceAudit = buildV14223CurrentAcceptanceCriteriaAudit({
      currentSnapshotGatePassed: true,
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
      assetInstanceCompletionEvidence: assetInstanceEvidence,
    })

    expect(acceptanceAudit.status).toBe('acceptance_criteria_coverage_ready')
    expect(acceptanceAudit.completionEvidenceLevel).toBe('asset_instance_completion_evidence')
    expect(acceptanceAudit.canUseForChapterCompletionCandidate).toBe(true)
    expect(acceptanceAudit.missingReasons).toEqual([])
  })

  it('keeps the current completion audit blocked when current document coverage drifts', () => {
    const audit = buildV14223CurrentCompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      documentHeadings: ['0.5 完成声明与重新门禁口径（强制）'],
      documentAcceptanceCriteria: extractAcceptanceCriteria(),
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'document_requirement_coverage_audit_required',
      'machine_execution_boundaries:evidence_level_not_completion_ready:evidence_layer_only',
    ]))
    expect(audit.missingReasons).not.toContain('section_14_acceptance_criteria_completion_evidence_required')
    expect(audit.missingReasons).not.toContain('runtime_surface_closure_evidence_required')
    expect(audit.missingReasons.some((reason) =>
      reason.startsWith('document_requirement_coverage:requirement_catalog_heading_not_in_document:')))
      .toBe(true)
  })

  it('does not declare a chapter completion candidate from section 14 coverage mapping alone', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: readyAcceptanceCriteriaAudit(),
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord),
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'runtime_surface_closure_evidence_required',
      'section_14_acceptance_criteria_completion_evidence_required',
    ]))
    expect(audit.recordResults.every((record) => record.status === 'verified')).toBe(true)
  })

  it('does not accept a bare chapter-candidate boolean without asset-instance acceptance evidence level', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: {
        ...readyAcceptanceCriteriaAudit(),
        canUseForChapterCompletionCandidate: true,
      },
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord),
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'runtime_surface_closure_evidence_required',
      'section_14_acceptance_criteria_completion_evidence_level_required',
    ]))
  })

  it('does not call evidence-only completion records runtime surface closed', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: assetInstanceAcceptanceCompletionAudit(),
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord),
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'runtime_surface_closure_evidence_required',
    ]))
  })

  it('rejects completion records whose evidence refs are only coarse file or service names', () => {
    const records = V14223_COMPLETION_REQUIRED_SURFACES.map(completeRecord)
    const runtimeRecord = runtimeClosureRecord('runtime_writer_consumer_monitoring_rollback')
    runtimeRecord.currentEvidenceRefs = [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts',
    ]
    runtimeRecord.writerEvidenceRefs = [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: service exists',
    ]

    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: assetInstanceAcceptanceCompletionAudit(),
      machineExecutionGuardrailAudit: readyMachineExecutionGuardrailAudit(),
      hardDecisionTableAudit: readyHardDecisionTableAudit(),
      evidenceRecords: records.map((record) =>
        record.surface === 'runtime_writer_consumer_monitoring_rollback' ? runtimeRecord : record,
      ),
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'runtime_surface_closure_evidence_required',
      'runtime_writer_consumer_monitoring_rollback:current_evidence_refs_must_reference_specific_assertions',
      'runtime_writer_consumer_monitoring_rollback:writer_evidence_refs_must_reference_specific_assertions',
    ]))
  })

  it('does not treat delegated domain operations as runtime surface closure evidence', () => {
    const records = V14223_COMPLETION_REQUIRED_SURFACES.map(runtimeClosureRecord)
      .map((record) => record.surface === 'runtime_writer_consumer_monitoring_rollback'
        ? {
            ...record,
            operationClassification: 'delegated_domain_operation' as const,
          }
        : record)

    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: assetInstanceAcceptanceCompletionAudit(),
      machineExecutionGuardrailAudit: readyMachineExecutionGuardrailAudit(),
      hardDecisionTableAudit: readyHardDecisionTableAudit(),
      evidenceRecords: records,
    })

    expect(audit.declarationStatus).toBe('evidence_layer_ready')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(false)
    expect(audit.missingReasons).toEqual(expect.arrayContaining([
      'runtime_surface_closure_evidence_required',
    ]))
  })

  it('can declare current-snapshot governance completion when all current-snapshot surfaces and asset-instance acceptance evidence are proven', () => {
    const audit = buildV14223CompletionAudit({
      workbenchReadiness: readyWorkbench(),
      currentSnapshotGatePassed: true,
      futureAssetRediscoveryGateRerunComplete: true,
      requirementCoverageAudit: readyRequirementCoverageAudit(),
      acceptanceCriteriaAudit: assetInstanceAcceptanceCompletionAudit(),
      machineExecutionGuardrailAudit: readyMachineExecutionGuardrailAudit(),
      hardDecisionTableAudit: readyHardDecisionTableAudit(),
      evidenceRecords: V14223_COMPLETION_REQUIRED_SURFACES.map(runtimeClosureRecord),
    })

    expect(audit.declarationStatus).toBe('v14223_governance_complete_current_snapshot')
    expect(audit.canDeclareChapterCompletionCandidate).toBe(true)
    expect(audit.canDeclareV14223GovernanceComplete).toBe(true)
    expect(audit.missingReasons).toEqual([])
    expect(audit.recordResults.every((record) => record.status === 'verified')).toBe(true)
    expect(audit.boundaryPolicy).toEqual(expect.arrayContaining([
      'completion_audit_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
      'operation_classification_and_forbidden_paths_are_required_for_completion_audit',
      'chapter_completion_candidate_requires_document_requirement_coverage_audit',
      'chapter_completion_candidate_requires_section_14_acceptance_criteria_audit',
      'chapter_completion_candidate_requires_asset_instance_acceptance_completion_evidence',
      'future_asset_or_llm_candidate_changes_must_rerun_completion_audit',
    ]))
  })
})
