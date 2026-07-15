import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import {
  buildAlgorithmAssetGovernanceWorkbenchReadiness,
  AlgorithmAssetGovernanceWorkbenchReadiness,
} from './algorithmAssetGovernanceWorkbenchReadinessService.js'
import { listAlgorithmAssetLearnableParameters } from './algorithmAssetLearnableParameterRegistryService.js'
import {
  getAlgorithmRuleAssetInventoryDiagnostics,
  type AlgorithmRuleAssetInventoryDiagnostics,
} from './algorithmRuleAssetInventoryService.js'
import {
  buildV14223RuntimeAssetIsolationMatrix,
  type AlgorithmAssetIsolationMatrix,
} from './algorithmAssetIsolationMatrixService.js'
import type {
  ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim,
} from './constructionOrganizationPlanNetworkDraftService.js'
import type {
  ConstructionOrganizationProductOutcomeCloseoutMatrix,
} from './constructionOrganizationProductOutcomeCloseoutMatrixService.js'
import {
  buildConstructionOrganizationPrecisionReplayMatrix,
  type ConstructionOrganizationPrecisionReplayMatrix,
} from './constructionOrganizationPrecisionReplayMatrixService.js'
import {
  buildV14223DomainReleaseRuntimeClosureMatrix,
  DomainReleaseRuntimeClosureMatrix,
  DomainReleaseRuntimeClosureSurface,
} from './domainReleaseRuntimeClosureMatrixService.js'
import {
  buildV14223FutureAssetRediscoveryGateRerunMatrix,
  type FutureAssetRediscoveryGateRerunMatrix,
} from './futureAssetRediscoveryGateRerunMatrixService.js'
import {
  buildV14223CrossScopeReplayEvidenceMatrix,
  type CrossScopeReplayEvidenceMatrix,
} from './crossScopeReplayEvidenceMatrixService.js'
import {
  buildV14223MetricConsumerPathCoverageMatrix,
  type MetricConsumerPathCoverageMatrix,
} from './metricConsumerPathCoverageMatrixService.js'
import {
  buildV14223MetricProductionSnapshotPublicationRollbackMatrix,
  type MetricProductionSnapshotPublicationRollbackMatrix,
} from './metricProductionSnapshotPublicationRollbackMatrixService.js'
import { buildV14223OperableGovernanceFrontendMatrix } from './operableGovernanceFrontendMatrixService.js'
import {
  buildV14223OrdinaryBusinessDtoExposureMatrix,
  type OrdinaryBusinessDtoExposureMatrix,
} from './ordinaryBusinessDtoExposureMatrixService.js'
import {
  buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix,
  type TemplateWriteSurfaceLegacyScopeSanitizerMatrix,
} from './templateWriteSurfaceLegacyScopeSanitizerMatrixService.js'
import {
  evaluateV14AssetAdmissionAutomation,
  type V14AssetAdmissionAutomationReport,
} from './v14AssetAdmissionAutomationService.js'
import {
  buildV14223CurrentAcceptanceCriteriaAudit,
  buildV14223CurrentHardDecisionTableAudit,
  buildV14223CurrentMachineExecutionGuardrailAudit,
  buildV14223CurrentRequirementCoverageAudit,
  type V14223AcceptanceCriterionAssetInstanceCompletionInput,
  type V14223AcceptanceCriteriaAudit,
  type V14223HardDecisionTableAudit,
  type V14223HardDecisionTableSourceRow,
  type V14223MachineExecutionGuardrailAudit,
  type V14223RequirementCoverageAudit,
} from './v14223RequirementCoverageAuditService.js'

export type V14223CompletionDeclarationStatus =
  | 'current_snapshot_gate_passed'
  | 'evidence_layer_ready'
  | 'runtime_surface_closed'
  | 'chapter_completion_candidate'
  | 'v14223_governance_complete_current_snapshot'
  | 'review_required'

export type V14223CompletionOperationClassification =
  | 'historical_evidence_needs_refresh'
  | 'evidence_layer_only'
  | 'candidate_governance'
  | 'release_exit_handoff'
  | 'delegated_domain_operation'
  | 'runtime_canary'
  | 'runtime_published'
  | 'runtime_rollback_confirmed'
  | 'review_required'
  | 'platform_exception_review'
  | 'blocked'

export type V14223CompletionEvidenceFreshness =
  | 'current_verified'
  | 'historical_evidence_needs_refresh'
  | 'coverage_mapping_only'

export type V14223CompletionEvidenceLevel =
  | 'coverage_mapping_only'
  | 'evidence_layer_only'
  | 'asset_instance_completion_evidence'
  | 'runtime_operation_evidence'

export type V14223CompletionRequirementSurface =
  | 'machine_execution_boundaries'
  | 'asset_inventory_and_admission'
  | 'automation_anchor_policy'
  | 'company_project_isolation'
  | 'runtime_writer_consumer_monitoring_rollback'
  | 'old_object_handling'
  | 'llm_candidate_gate_rerun'
  | 'ordinary_business_dto_boundary'
  | 'metric_and_snapshot_governance'
  | 'ci_governance_gate'

export type V14223CompletionEvidenceRecord = {
  surface: V14223CompletionRequirementSurface | string
  status: 'verified' | 'incomplete'
  sentenceClassification:
    | 'boundary_rule'
    | 'current_evidence'
    | 'target_state'
    | 'pending_gap'
    | 'acceptance_gate'
    | 'historical_snapshot'
  evidenceFreshness: V14223CompletionEvidenceFreshness
  evidenceLevel: V14223CompletionEvidenceLevel
  assetIdentity: {
    assetKey: string
    assetType: string
    version: string
    scope: string
    targetSurface: string
    consumer: string
  }
  currentEvidenceRefs: string[]
  fourFieldDecision: {
    learningTarget: string
    learningMaturity: string
    publishAnchor: string
    automationMaturity: string
  }
  operationClassification: V14223CompletionOperationClassification
  writerEvidenceRefs: string[]
  consumerEvidenceRefs: string[]
  monitoringEvidenceRefs: string[]
  rollbackEvidenceRefs: string[]
  forbiddenPathEvidenceRefs: string[]
  oldObjectHandling: {
    classification:
      | 'active_runtime_or_contract'
      | 'negative_protection_evidence'
      | 'allowed_business_semantics_or_rename_debt'
      | 'not_applicable_to_surface'
    evidenceRefs: string[]
  }
  remainingGaps: string[]
}

export type V14223CompletionAuditInput = {
  workbenchReadiness: Pick<
    AlgorithmAssetGovernanceWorkbenchReadiness,
    | 'canDeclareGovernanceWorkbenchComplete'
    | 'completionScope'
    | 'canDeclareV14223GovernanceComplete'
    | 'remainingClosureGaps'
    | 'gates'
  >
  currentSnapshotGatePassed: boolean
  futureAssetRediscoveryGateRerunComplete: boolean
  requirementCoverageAudit?: Pick<V14223RequirementCoverageAudit, 'status' | 'missingReasons'>
  acceptanceCriteriaAudit?: Pick<
    V14223AcceptanceCriteriaAudit,
    'status' | 'missingReasons' | 'completionEvidenceLevel' | 'canUseForChapterCompletionCandidate'
  >
  machineExecutionGuardrailAudit?: Pick<V14223MachineExecutionGuardrailAudit, 'status' | 'missingReasons'>
  hardDecisionTableAudit?: Pick<V14223HardDecisionTableAudit, 'status' | 'missingReasons'>
  evidenceRecords: V14223CompletionEvidenceRecord[]
}

export type V14223CurrentCompletionAuditInput = Omit<
  V14223CompletionAuditInput,
  | 'evidenceRecords'
  | 'workbenchReadiness'
  | 'futureAssetRediscoveryGateRerunComplete'
  | 'requirementCoverageAudit'
  | 'machineExecutionGuardrailAudit'
> & {
  workbenchReadiness?: V14223CompletionAuditInput['workbenchReadiness']
  futureAssetRediscoveryGateRerunComplete?: boolean
  documentHeadings?: string[]
  documentAcceptanceCriteria?: string[]
  documentMachineExecutionGuardrails?: string[]
  documentHardDecisionRows?: V14223HardDecisionTableSourceRow[]
  domainReleaseRuntimeClosureMatrix?: DomainReleaseRuntimeClosureMatrix
  runtimeIsolationMatrix?: AlgorithmAssetIsolationMatrix
  algorithmRuleAssetInventoryDiagnostics?: AlgorithmRuleAssetInventoryDiagnostics
  assetAdmissionAutomationReport?: V14AssetAdmissionAutomationReport
  futureAssetRediscoveryGateRerunMatrix?: FutureAssetRediscoveryGateRerunMatrix
  crossScopeReplayEvidenceMatrix?: CrossScopeReplayEvidenceMatrix
  ordinaryBusinessDtoExposureMatrix?: OrdinaryBusinessDtoExposureMatrix
  templateWriteSurfaceLegacyScopeSanitizerMatrix?: TemplateWriteSurfaceLegacyScopeSanitizerMatrix
  metricProductionSnapshotPublicationRollbackMatrix?: MetricProductionSnapshotPublicationRollbackMatrix
  metricConsumerPathCoverageMatrix?: MetricConsumerPathCoverageMatrix
  constructionOrganizationPrecisionReplayMatrix?: ConstructionOrganizationPrecisionReplayMatrix
  constructionOrganizationRuntimeCloseoutClaim?: ConstructionOrganizationPlanNetworkRuntimeCloseoutClaim
  constructionOrganizationProductOutcomeCloseoutMatrix?: ConstructionOrganizationProductOutcomeCloseoutMatrix
  requirementCoverageAudit?: Pick<V14223RequirementCoverageAudit, 'status' | 'missingReasons'>
  acceptanceCriteriaAudit?: Pick<
    V14223AcceptanceCriteriaAudit,
    'status' | 'missingReasons' | 'completionEvidenceLevel' | 'canUseForChapterCompletionCandidate'
  >
  machineExecutionGuardrailAudit?: Pick<V14223MachineExecutionGuardrailAudit, 'status' | 'missingReasons'>
  hardDecisionTableAudit?: Pick<V14223HardDecisionTableAudit, 'status' | 'missingReasons'>
}

export type V14223CompletionAuditRecordResult = {
  surface: string
  status: 'verified' | 'incomplete'
  missingReasons: string[]
}

export type V14223CompletionAudit = {
  reportCode: 'v14223_completion_audit'
  declarationStatus: V14223CompletionDeclarationStatus
  canDeclareChapterCompletionCandidate: boolean
  canDeclareV14223GovernanceComplete: boolean
  missingReasons: string[]
  requiredSurfaces: V14223CompletionRequirementSurface[]
  recordResults: V14223CompletionAuditRecordResult[]
  boundaryPolicy: string[]
}

export const V14223_COMPLETION_REQUIRED_SURFACES: V14223CompletionRequirementSurface[] = [
  'machine_execution_boundaries',
  'asset_inventory_and_admission',
  'automation_anchor_policy',
  'company_project_isolation',
  'runtime_writer_consumer_monitoring_rollback',
  'old_object_handling',
  'llm_candidate_gate_rerun',
  'ordinary_business_dto_boundary',
  'metric_and_snapshot_governance',
  'ci_governance_gate',
]

const V14223_COMPLETION_OPERATION_CLASSIFICATIONS: V14223CompletionOperationClassification[] = [
  'historical_evidence_needs_refresh',
  'evidence_layer_only',
  'candidate_governance',
  'release_exit_handoff',
  'delegated_domain_operation',
  'runtime_canary',
  'runtime_published',
  'runtime_rollback_confirmed',
  'review_required',
  'platform_exception_review',
  'blocked',
]

const V14223_COMPLETION_EVIDENCE_FRESHNESS: V14223CompletionEvidenceFreshness[] = [
  'current_verified',
  'historical_evidence_needs_refresh',
  'coverage_mapping_only',
]

const V14223_COMPLETION_EVIDENCE_LEVELS: V14223CompletionEvidenceLevel[] = [
  'coverage_mapping_only',
  'evidence_layer_only',
  'asset_instance_completion_evidence',
  'runtime_operation_evidence',
]

const V14223_COMPLETION_OLD_OBJECT_CLASSIFICATIONS: V14223CompletionEvidenceRecord['oldObjectHandling']['classification'][] = [
  'active_runtime_or_contract',
  'negative_protection_evidence',
  'allowed_business_semantics_or_rename_debt',
  'not_applicable_to_surface',
]

const V14223_COMPLETION_NON_COMPLETION_OPERATION_CLASSIFICATIONS: V14223CompletionOperationClassification[] = [
  'historical_evidence_needs_refresh',
  'review_required',
  'platform_exception_review',
  'blocked',
]

const V14223_RUNTIME_SURFACE_CLOSURE_REQUIRED_SURFACES: V14223CompletionRequirementSurface[] = [
  'runtime_writer_consumer_monitoring_rollback',
]

const V14223_RUNTIME_SURFACE_CLOSURE_OPERATION_CLASSIFICATIONS: V14223CompletionOperationClassification[] = [
  'runtime_canary',
  'runtime_published',
  'runtime_rollback_confirmed',
]

const V14223_NO_RUNTIME_BOUNDARY_REF_PATTERN =
  /evidence-layer audit does not write runtime|evidence-layer audit is not runtime consumer proof|governance verification is evidence-only|completion audit does not grant publish rights/i

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEveryText(values: readonly unknown[] | undefined) {
  return Boolean(values?.length) && values.every(hasText)
}

function uniqueText(values: readonly string[]) {
  return [...new Set(values.filter(hasText))]
}

const V14223_COMPLETION_EVIDENCE_REF_ALLOWED_PREFIXES = [
  'client/src/',
  'docs/plans/',
  'scripts/',
  'server/migrations/',
  'server/src/',
]

const V14223_COMPLETION_EVIDENCE_REF_FORBIDDEN_PATTERN =
  /manual note|todo|tbd|synthetic|historical_evidence_needs_refresh/i

const V14223_COMPLETION_EVIDENCE_REF_GENERIC_DETAIL_PATTERN =
  /^(service exists|test file|matrix ready|see section)$/i

const V14223_COMPLETION_EXISTING_WORKSPACE_REF_REASONS = {
  current_evidence_refs: 'current_evidence_refs_must_reference_existing_workspace_files',
  writer_evidence_refs: 'writer_evidence_refs_must_reference_existing_workspace_files',
  consumer_evidence_refs: 'consumer_evidence_refs_must_reference_existing_workspace_files',
  monitoring_evidence_refs: 'monitoring_evidence_refs_must_reference_existing_workspace_files',
  rollback_evidence_refs: 'rollback_evidence_refs_must_reference_existing_workspace_files',
  forbidden_path_evidence_refs: 'forbidden_path_evidence_refs_must_reference_existing_workspace_files',
  old_object_handling_evidence_refs: 'old_object_handling_evidence_refs_must_reference_existing_workspace_files',
} as const

const V14223_COMPLETION_SPECIFIC_ASSERTION_REF_REASONS = {
  current_evidence_refs: 'current_evidence_refs_must_reference_specific_assertions',
  writer_evidence_refs: 'writer_evidence_refs_must_reference_specific_assertions',
  consumer_evidence_refs: 'consumer_evidence_refs_must_reference_specific_assertions',
  monitoring_evidence_refs: 'monitoring_evidence_refs_must_reference_specific_assertions',
  rollback_evidence_refs: 'rollback_evidence_refs_must_reference_specific_assertions',
  forbidden_path_evidence_refs: 'forbidden_path_evidence_refs_must_reference_specific_assertions',
  old_object_handling_evidence_refs: 'old_object_handling_evidence_refs_must_reference_specific_assertions',
} as const

function workspaceRootPath() {
  return process.cwd().endsWith(`${sep}server`)
    ? resolve(process.cwd(), '..')
    : process.cwd()
}

function evidenceRefPath(ref: string) {
  return ref
    .split(' forbids ')[0]
    .split(' :: ')[0]
    .trim()
}

function evidenceRefDetail(ref: string) {
  const detail = ref.split(' :: ').slice(1).join(' :: ').trim()
  return detail
}

function isExistingWorkspaceEvidenceRef(ref: string) {
  if (!hasText(ref)) return false
  if (V14223_COMPLETION_EVIDENCE_REF_FORBIDDEN_PATTERN.test(ref)) return false

  const refPath = evidenceRefPath(ref)
  if (!V14223_COMPLETION_EVIDENCE_REF_ALLOWED_PREFIXES.some((prefix) => refPath.startsWith(prefix))) {
    return false
  }

  return existsSync(resolve(workspaceRootPath(), refPath))
}

function hasSpecificEvidenceRefDetail(ref: string) {
  const detail = evidenceRefDetail(ref)
  return hasText(detail) && !V14223_COMPLETION_EVIDENCE_REF_GENERIC_DETAIL_PATTERN.test(detail)
}

function missingGroundedEvidenceRefReasons(refs: readonly string[] | undefined, field: string) {
  if (!refs || !hasEveryText(refs)) return []

  const existingWorkspaceReason =
    V14223_COMPLETION_EXISTING_WORKSPACE_REF_REASONS[
      field as keyof typeof V14223_COMPLETION_EXISTING_WORKSPACE_REF_REASONS
    ] ?? `${field}_must_reference_existing_workspace_files`
  const specificAssertionReason =
    V14223_COMPLETION_SPECIFIC_ASSERTION_REF_REASONS[
      field as keyof typeof V14223_COMPLETION_SPECIFIC_ASSERTION_REF_REASONS
    ] ?? `${field}_must_reference_specific_assertions`

  const reasons: string[] = []
  if (!refs.every(isExistingWorkspaceEvidenceRef)) {
    reasons.push(existingWorkspaceReason)
  }
  if (!refs.every(hasSpecificEvidenceRefDetail)) {
    reasons.push(specificAssertionReason)
  }
  return reasons
}

const V14223_COMPLETION_PLAN_REF =
  'docs/plans/v1.4.22.3规则资产公司隔离与自学习体系执行方案.md'
const V14223_COMPLETION_AUDIT_REF = 'server/src/services/v14223CompletionAuditService.ts'

function readCurrentV14223PlanLines() {
  const planPath = resolve(workspaceRootPath(), V14223_COMPLETION_PLAN_REF)
  if (!existsSync(planPath)) return undefined
  return readFileSync(planPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\uFEFF/, ''))
}

export function extractCurrentV14223PlanSectionHeadings() {
  const lines = readCurrentV14223PlanLines()
  if (!lines) return undefined
  return lines
    .filter((line) => /^#{2,3}\s/.test(line))
    .map((line) => line.replace(/^#{2,3}\s+/, '').trim())
}

export function extractCurrentV14223AcceptanceCriteria() {
  const lines = readCurrentV14223PlanLines()
  if (!lines) return undefined

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

export function extractCurrentV14223MachineExecutionGuardrails() {
  const lines = readCurrentV14223PlanLines()
  if (!lines) return undefined

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

export function extractCurrentV14223HardDecisionTableRows(): V14223HardDecisionTableSourceRow[] | undefined {
  const lines = readCurrentV14223PlanLines()
  if (!lines) return undefined

  const rows: V14223HardDecisionTableSourceRow[] = []
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

type V14223DefaultCompletionSurfaceEvidence = {
  sentenceClassification: V14223CompletionEvidenceRecord['sentenceClassification']
  operationClassification: V14223CompletionOperationClassification
  evidenceFreshness?: V14223CompletionEvidenceFreshness
  evidenceLevel?: V14223CompletionEvidenceLevel
  currentEvidenceRefs: string[]
  writerEvidenceRefs: string[]
  consumerEvidenceRefs: string[]
  monitoringEvidenceRefs: string[]
  rollbackEvidenceRefs: string[]
  forbiddenPathEvidenceRefs: string[]
  oldObjectHandling: V14223CompletionEvidenceRecord['oldObjectHandling']
}

const NO_RUNTIME_WRITER_BOUNDARY = `${V14223_COMPLETION_AUDIT_REF} :: evidence-layer audit does not write runtime`
const NO_RUNTIME_CONSUMER_BOUNDARY = `${V14223_COMPLETION_AUDIT_REF} :: evidence-layer audit is not runtime consumer proof`
const NO_RUNTIME_MONITORING_BOUNDARY = 'scripts/check-v14223-governance-gate.mjs :: governance verification is evidence-only'
const NO_RUNTIME_ROLLBACK_BOUNDARY = `${V14223_COMPLETION_AUDIT_REF} :: completion audit does not grant publish rights`

const V14223_COMPLETION_DEFAULT_SURFACE_EVIDENCE: Record<
  V14223CompletionRequirementSurface,
  V14223DefaultCompletionSurfaceEvidence
> = {
  machine_execution_boundaries: {
    sentenceClassification: 'boundary_rule',
    operationClassification: 'evidence_layer_only',
    currentEvidenceRefs: [
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: locks LLM over-execution guardrails',
    ],
    writerEvidenceRefs: [NO_RUNTIME_WRITER_BOUNDARY],
    consumerEvidenceRefs: [NO_RUNTIME_CONSUMER_BOUNDARY],
    monitoringEvidenceRefs: [NO_RUNTIME_MONITORING_BOUNDARY],
    rollbackEvidenceRefs: [NO_RUNTIME_ROLLBACK_BOUNDARY],
    forbiddenPathEvidenceRefs: [
      `${V14223_COMPLETION_PLAN_REF} :: 0.1-0.4 machine execution hard guardrails`,
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: no gate result may be read as publish permission',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/services/legacyScopeObjectSanitizer.ts :: old scope fields are sanitized before reuse',
        'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: legacy write surfaces require negative evidence',
      ],
    },
  },
  asset_inventory_and_admission: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'evidence_layer_only',
    currentEvidenceRefs: [
      'server/src/services/algorithmRuleAssetInventoryService.ts :: rule asset inventory current source',
      'server/src/services/v14AssetDiscoveryService.ts :: discovery source',
      'server/src/services/v14AssetAdmissionAutomationService.ts :: admission defaults source',
      'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts :: inventory contract',
      'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts :: admission conservative defaults',
    ],
    writerEvidenceRefs: [NO_RUNTIME_WRITER_BOUNDARY],
    consumerEvidenceRefs: [
      'server/src/services/algorithmAssetGovernanceWorkbenchReadinessService.ts :: workbench consumes inventory/admission evidence only',
    ],
    monitoringEvidenceRefs: [NO_RUNTIME_MONITORING_BOUNDARY],
    rollbackEvidenceRefs: [NO_RUNTIME_ROLLBACK_BOUNDARY],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts :: missing governance fields default to candidate or shadow',
      'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts :: inventory metadata does not grant publish rights',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/services/legacyScopeObjectSanitizer.ts :: legacy fields cannot become current scope by name',
        'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: legacy objects require explicit handling',
      ],
    },
  },
  automation_anchor_policy: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'candidate_governance',
    currentEvidenceRefs: [
      'server/src/services/algorithmAssetGovernanceProtocolService.ts :: four-field protocol gate',
      'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: versioned anchor upgrade strategy',
      'server/src/services/algorithmAssetAutomationMaturityService.ts :: manual anchors remain hard gates',
      'server/src/services/policyOpsAutoPublishGateService.ts :: policy auto-publish gate',
      'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: governance protocol forbidden paths',
      'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts :: anchor upgrade cannot self-approve',
      'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: manual/no-unattended anchors block runtime writes',
      'server/src/__tests__/policyOpsAutoPublishGateService.test.ts :: policy gate requires explicit automation maturity',
    ],
    writerEvidenceRefs: [NO_RUNTIME_WRITER_BOUNDARY],
    consumerEvidenceRefs: [NO_RUNTIME_CONSUMER_BOUNDARY],
    monitoringEvidenceRefs: [NO_RUNTIME_MONITORING_BOUNDARY],
    rollbackEvidenceRefs: [
      'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: anchor upgrade requires rollback target',
    ],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts :: single candidate or replay cannot upgrade manual anchors',
      'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: automation goal does not override current anchor',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: old active/published names require re-evidence',
      ],
    },
  },
  company_project_isolation: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'evidence_layer_only',
    currentEvidenceRefs: [
      'server/src/services/algorithmAssetIsolationMatrixService.ts :: company/project isolation matrix',
      'server/src/__tests__/algorithmAssetIsolationMatrixService.test.ts :: isolation matrix contract',
    ],
    writerEvidenceRefs: [NO_RUNTIME_WRITER_BOUNDARY],
    consumerEvidenceRefs: [
      'server/src/services/algorithmAssetGovernanceWorkbenchReadinessService.ts :: isolation matrix is consumed by readiness only',
    ],
    monitoringEvidenceRefs: [NO_RUNTIME_MONITORING_BOUNDARY],
    rollbackEvidenceRefs: [NO_RUNTIME_ROLLBACK_BOUNDARY],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/algorithmAssetIsolationMatrixService.test.ts :: missing company/project scope blocks surface readiness',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/services/legacyScopeObjectSanitizer.ts :: legacy company/project fields cannot be inferred',
      ],
    },
  },
  runtime_writer_consumer_monitoring_rollback: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'release_exit_handoff',
    currentEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime closure matrix',
      'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts :: writer/consumer/monitoring/release/rollback all required',
      'server/src/services/algorithmAssetGovernanceWorkbenchReadinessService.ts :: closure gaps remain unless matrices are ready',
      'server/src/__tests__/algorithmAssetGovernanceWorkbenchReadinessService.test.ts :: domain runtime closure alone does not declare chapter completion',
    ],
    writerEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: asset_type_domain_writer surface',
    ],
    consumerEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime_consumer_verification surface',
      'server/src/__tests__/baseDurationBenchmarkLiveLearningEvidenceService.test.ts :: runtime consumer publication key must match release key',
      'server/src/__tests__/constructionDependencyReplayCalibrationService.test.ts :: runtime consumer publication mismatch blocks readiness',
      'server/src/__tests__/criticalPathRulePublicationReadinessService.test.ts :: release key alone is not consumer proof',
    ],
    monitoringEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: impact_monitoring surface',
    ],
    rollbackEvidenceRefs: [
      'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: rollback_writer_and_target surface',
    ],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts :: not_applicable cannot replace runtime closure evidence',
      'server/src/__tests__/baseDurationBenchmarkLiveLearningEvidenceService.test.ts :: runtime_consumer_publication_required blocks missing consumer proof',
      'server/src/__tests__/constructionDependencyReplayCalibrationService.test.ts :: runtime_consumer_publication_mismatch blocks mismatched consumer proof',
      'server/src/__tests__/criticalPathRulePublicationReadinessService.test.ts :: missing runtime consumer observation blocks publication readiness',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts :: old active/published state is not runtime closure',
      ],
    },
  },
  old_object_handling: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'evidence_layer_only',
    currentEvidenceRefs: [
      'server/src/services/legacyScopeObjectSanitizer.ts :: old object sanitizer',
      'server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts :: legacy write surface matrix',
      'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: legacy object handling matrix',
    ],
    writerEvidenceRefs: [NO_RUNTIME_WRITER_BOUNDARY],
    consumerEvidenceRefs: [NO_RUNTIME_CONSUMER_BOUNDARY],
    monitoringEvidenceRefs: [NO_RUNTIME_MONITORING_BOUNDARY],
    rollbackEvidenceRefs: [NO_RUNTIME_ROLLBACK_BOUNDARY],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: old fields require explicit negative tests',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/services/legacyScopeObjectSanitizer.ts :: legacy scope fields stripped or blocked',
        'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: every legacy write surface must be verified',
      ],
    },
  },
  llm_candidate_gate_rerun: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'candidate_governance',
    currentEvidenceRefs: [
      'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: future asset and LLM candidate rerun matrix',
      'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts :: rerun matrix contract',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: LLM over-execution guardrails',
    ],
    writerEvidenceRefs: [NO_RUNTIME_WRITER_BOUNDARY],
    consumerEvidenceRefs: [NO_RUNTIME_CONSUMER_BOUNDARY],
    monitoringEvidenceRefs: [NO_RUNTIME_MONITORING_BOUNDARY],
    rollbackEvidenceRefs: [NO_RUNTIME_ROLLBACK_BOUNDARY],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts :: future asset changes must rerun gate',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: LLM cannot infer publish rights from wording',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: old objects and LLM candidates require rerun',
      ],
    },
  },
  ordinary_business_dto_boundary: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'evidence_layer_only',
    currentEvidenceRefs: [
      'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts :: ordinary business DTO exposure matrix',
      'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: DTO boundary contract',
    ],
    writerEvidenceRefs: [NO_RUNTIME_WRITER_BOUNDARY],
    consumerEvidenceRefs: [
      'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts :: ordinary pages do not consume governance technical fields',
    ],
    monitoringEvidenceRefs: [NO_RUNTIME_MONITORING_BOUNDARY],
    rollbackEvidenceRefs: [NO_RUNTIME_ROLLBACK_BOUNDARY],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: not_applicable cannot replace DTO exposure evidence',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: old governance fields stay out of ordinary business DTOs',
      ],
    },
  },
  metric_and_snapshot_governance: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'evidence_layer_only',
    currentEvidenceRefs: [
      'server/src/services/metricProductionSnapshotPublicationRollbackMatrixService.ts :: metric production/snapshot publication rollback matrix',
      'server/src/services/metricConsumerPathCoverageMatrixService.ts :: metric consumer path coverage matrix',
      'server/src/__tests__/metricProductionSnapshotPublicationRollbackMatrixService.test.ts :: metric producer/snapshot/rollback contract',
      'server/src/__tests__/metricConsumerPathCoverageMatrixService.test.ts :: metric consumers do not grant publication rights',
    ],
    writerEvidenceRefs: [
      'server/src/services/metricProductionSnapshotPublicationRollbackMatrixService.ts :: metric producer contract surface',
    ],
    consumerEvidenceRefs: [
      'server/src/services/metricConsumerPathCoverageMatrixService.ts :: metric consumer path coverage surface',
    ],
    monitoringEvidenceRefs: [
      'server/src/services/metricProductionSnapshotPublicationRollbackMatrixService.ts :: snapshot and dashboard monitoring evidence',
    ],
    rollbackEvidenceRefs: [
      'server/src/services/metricProductionSnapshotPublicationRollbackMatrixService.ts :: metric rollback target surface',
    ],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/metricProductionSnapshotPublicationRollbackMatrixService.test.ts :: metric readiness is not all metric auto-publish',
      'server/src/__tests__/metricConsumerPathCoverageMatrixService.test.ts :: consumer path ready does not grant publish rights',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/__tests__/metricProductionSnapshotPublicationRollbackMatrixService.test.ts :: old metric state requires publication rollback evidence',
      ],
    },
  },
  ci_governance_gate: {
    sentenceClassification: 'current_evidence',
    operationClassification: 'evidence_layer_only',
    currentEvidenceRefs: [
      'scripts/check-v14223-governance-gate.mjs :: focused governance gate',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: gate file coverage contract',
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: coverage audit contract',
      'server/src/__tests__/v14223CompletionAuditService.test.ts :: completion audit contract',
    ],
    writerEvidenceRefs: [NO_RUNTIME_WRITER_BOUNDARY],
    consumerEvidenceRefs: [NO_RUNTIME_CONSUMER_BOUNDARY],
    monitoringEvidenceRefs: [NO_RUNTIME_MONITORING_BOUNDARY],
    rollbackEvidenceRefs: [NO_RUNTIME_ROLLBACK_BOUNDARY],
    forbiddenPathEvidenceRefs: [
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: gate pass alone is not chapter completion',
      'server/src/__tests__/v14223CompletionAuditService.test.ts :: current-snapshot completion keeps publish rights blocked',
    ],
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: [
        'server/src/__tests__/v14223CompletionAuditService.test.ts :: old object refs required in completion evidence',
      ],
    },
  },
}

function completionPlanEvidenceRef(surface: V14223CompletionRequirementSurface) {
  return `${V14223_COMPLETION_PLAN_REF} :: completion surface ${surface}`
}

export function buildV14223DefaultCompletionEvidenceRecords(): V14223CompletionEvidenceRecord[] {
  return V14223_COMPLETION_REQUIRED_SURFACES.map((surface) => {
    const surfaceEvidence = V14223_COMPLETION_DEFAULT_SURFACE_EVIDENCE[surface]
    return {
      surface,
      status: 'verified',
      sentenceClassification: surfaceEvidence.sentenceClassification,
      assetIdentity: {
        assetKey: `v14223.${surface}`,
        assetType: 'v14223_completion_surface',
        version: 'current-snapshot',
        scope: 'system_governance_evidence_only',
        targetSurface: surface,
        consumer: 'v14223CompletionAuditService',
      },
      currentEvidenceRefs: uniqueText([
        completionPlanEvidenceRef(surface),
        `${V14223_COMPLETION_AUDIT_REF} :: default current completion evidence matrix`,
        ...surfaceEvidence.currentEvidenceRefs,
      ]),
      evidenceFreshness: surfaceEvidence.evidenceFreshness ?? 'current_verified',
      evidenceLevel: surfaceEvidence.evidenceLevel ?? 'evidence_layer_only',
      fourFieldDecision: {
        learningTarget: 'governance_report',
        learningMaturity: 'shadow_report_only',
        publishAnchor: 'manual_governance_required',
        automationMaturity: 'auto_review_package',
      },
      operationClassification: surfaceEvidence.operationClassification,
      writerEvidenceRefs: uniqueText(surfaceEvidence.writerEvidenceRefs),
      consumerEvidenceRefs: uniqueText(surfaceEvidence.consumerEvidenceRefs),
      monitoringEvidenceRefs: uniqueText(surfaceEvidence.monitoringEvidenceRefs),
      rollbackEvidenceRefs: uniqueText(surfaceEvidence.rollbackEvidenceRefs),
      forbiddenPathEvidenceRefs: uniqueText(surfaceEvidence.forbiddenPathEvidenceRefs),
      oldObjectHandling: {
        classification: surfaceEvidence.oldObjectHandling.classification,
        evidenceRefs: uniqueText(surfaceEvidence.oldObjectHandling.evidenceRefs),
      },
      remainingGaps: [],
    }
  })
}

const V14223_RUNTIME_CLOSURE_MATRIX_REF =
  'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: current registered runtime closure rows require writer consumer monitoring release record and rollback evidence'

const V14223_RUNTIME_CLOSURE_SURFACE_REFS: Record<DomainReleaseRuntimeClosureSurface, string> = {
  asset_type_domain_writer:
    'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: asset_type_domain_writer rows must be verified per asset type',
  runtime_consumer_verification:
    'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime_consumer_verification rows must be verified per asset type',
  impact_monitoring:
    'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: impact_monitoring rows must be verified per asset type',
  release_record:
    'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: release_record rows must be verified per asset type',
  rollback_writer_and_target:
    'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: rollback_writer_and_target rows must be verified per asset type',
}

function runtimeClosureRowEvidenceRef(row: { assetType: string; surface: string }, ref: string) {
  const refPath = evidenceRefPath(ref)
  const detail = evidenceRefDetail(ref)
  if (hasText(detail)) return ref
  return `${refPath} :: ${row.assetType}.${row.surface} runtime closure evidence verified by domain matrix`
}

function runtimeClosureEvidenceRefs(
  matrix: DomainReleaseRuntimeClosureMatrix,
  surface: DomainReleaseRuntimeClosureSurface,
) {
  const refs = matrix.rows
    .filter((row) => row.surface === surface && row.status === 'confirmed')
    .flatMap((row) => row.evidenceRefs.map((ref) => runtimeClosureRowEvidenceRef(row, ref)))
    .filter((ref) => isExistingWorkspaceEvidenceRef(ref) && hasSpecificEvidenceRefDetail(ref))

  if (refs.length === 0) return []
  return uniqueText([
    ...refs,
    V14223_RUNTIME_CLOSURE_SURFACE_REFS[surface],
  ])
}

function buildRuntimeClosureCompletionEvidenceRecord(
  baseRecord: V14223CompletionEvidenceRecord,
  matrix: DomainReleaseRuntimeClosureMatrix | undefined,
): V14223CompletionEvidenceRecord | null {
  if (!matrix?.canDeclareDomainReleaseRuntimeClosureComplete) return null
  if (matrix.rows.some((row) => row.status !== 'confirmed')) return null

  const writerEvidenceRefs = runtimeClosureEvidenceRefs(matrix, 'asset_type_domain_writer')
  const consumerEvidenceRefs = runtimeClosureEvidenceRefs(matrix, 'runtime_consumer_verification')
  const monitoringEvidenceRefs = runtimeClosureEvidenceRefs(matrix, 'impact_monitoring')
  const releaseRecordEvidenceRefs = runtimeClosureEvidenceRefs(matrix, 'release_record')
  const rollbackEvidenceRefs = runtimeClosureEvidenceRefs(matrix, 'rollback_writer_and_target')
  if (![
    writerEvidenceRefs,
    consumerEvidenceRefs,
    monitoringEvidenceRefs,
    releaseRecordEvidenceRefs,
    rollbackEvidenceRefs,
  ].every((refs) => refs.length > 0)) {
    return null
  }

  return {
    ...baseRecord,
    evidenceLevel: 'runtime_operation_evidence',
    operationClassification: 'runtime_published',
    assetIdentity: {
      assetKey: 'v14223.runtime_writer_consumer_monitoring_rollback.current_registered_assets',
      assetType: 'v14223_domain_release_runtime_closure',
      version: 'current-snapshot',
      scope: 'current_registered_domain_release_asset_types',
      targetSurface: 'runtime_writer_consumer_monitoring_rollback',
      consumer: 'v14223CompletionAuditService',
    },
    currentEvidenceRefs: uniqueText([
      ...baseRecord.currentEvidenceRefs,
      V14223_RUNTIME_CLOSURE_MATRIX_REF,
      ...releaseRecordEvidenceRefs,
    ]),
    fourFieldDecision: {
      learningTarget: 'runtime_closure_evidence',
      learningMaturity: 'asset_instance_completion_evidence',
      publishAnchor: 'domain_release_runtime_closure_matrix',
      automationMaturity: 'not_publish_rights',
    },
    writerEvidenceRefs,
    consumerEvidenceRefs,
    monitoringEvidenceRefs,
    rollbackEvidenceRefs,
    forbiddenPathEvidenceRefs: uniqueText([
      ...baseRecord.forbiddenPathEvidenceRefs,
      'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts :: not_applicable cannot replace runtime closure evidence',
      'server/src/__tests__/v14223CompletionAuditService.test.ts :: runtime closure matrix evidence does not grant chapter completion alone',
    ]),
    oldObjectHandling: {
      classification: 'negative_protection_evidence',
      evidenceRefs: uniqueText([
        ...baseRecord.oldObjectHandling.evidenceRefs,
        'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts :: old active published state is not runtime closure evidence',
      ]),
    },
  }
}

const V14223_COMPLETION_ASSET_INSTANCE_OPERATION_BY_SURFACE: Partial<Record<
  V14223CompletionRequirementSurface,
  V14223CompletionOperationClassification
>> = {
  machine_execution_boundaries: 'candidate_governance',
  asset_inventory_and_admission: 'candidate_governance',
  automation_anchor_policy: 'candidate_governance',
  company_project_isolation: 'delegated_domain_operation',
  old_object_handling: 'delegated_domain_operation',
  llm_candidate_gate_rerun: 'candidate_governance',
  ordinary_business_dto_boundary: 'delegated_domain_operation',
  metric_and_snapshot_governance: 'delegated_domain_operation',
  ci_governance_gate: 'candidate_governance',
}

function buildAssetInstanceCompletionEvidenceRecord(
  baseRecord: V14223CompletionEvidenceRecord,
): V14223CompletionEvidenceRecord {
  const surface = baseRecord.surface as V14223CompletionRequirementSurface
  return {
    ...baseRecord,
    evidenceLevel: 'asset_instance_completion_evidence',
    operationClassification:
      V14223_COMPLETION_ASSET_INSTANCE_OPERATION_BY_SURFACE[surface]
      ?? 'candidate_governance',
    assetIdentity: {
      ...baseRecord.assetIdentity,
      assetKey: `v14223.${surface}.current_asset_instance_completion`,
      assetType: 'v14223_completion_surface_asset_instance',
      scope: 'current_snapshot_asset_instance_completion',
      targetSurface: surface,
      consumer: 'v14223CompletionAuditService',
    },
    fourFieldDecision: {
      learningTarget: 'governance_completion_surface',
      learningMaturity: 'asset_instance_completion_evidence',
      publishAnchor: 'manual_governance_required',
      automationMaturity: 'auto_review_package',
    },
    currentEvidenceRefs: uniqueText([
      ...baseRecord.currentEvidenceRefs,
      `${V14223_COMPLETION_AUDIT_REF} :: current-source completion prerequisites verified for ${surface}`,
    ]),
    forbiddenPathEvidenceRefs: uniqueText([
      ...baseRecord.forbiddenPathEvidenceRefs,
      'server/src/__tests__/v14223CompletionAuditService.test.ts :: current-source completion does not grant publish rights',
    ]),
  }
}

export function buildV14223CurrentCompletionEvidenceRecords(input: {
  domainReleaseRuntimeClosureMatrix?: DomainReleaseRuntimeClosureMatrix
  allCurrentCompletionPrerequisitesReady?: boolean
} = {}): V14223CompletionEvidenceRecord[] {
  const records = buildV14223DefaultCompletionEvidenceRecords()
  const runtimeClosureBaseRecord = records.find((record) =>
    record.surface === 'runtime_writer_consumer_monitoring_rollback')
  const runtimeClosureRecord = runtimeClosureBaseRecord
    ? buildRuntimeClosureCompletionEvidenceRecord(
      runtimeClosureBaseRecord,
      input.domainReleaseRuntimeClosureMatrix,
    )
    : null

  return records.map((record) => {
    if (record.surface === 'runtime_writer_consumer_monitoring_rollback') {
      return runtimeClosureRecord ?? record
    }
    return input.allCurrentCompletionPrerequisitesReady
      ? buildAssetInstanceCompletionEvidenceRecord(record)
      : record
  })
}

const V14223_ACCEPTANCE_RUNTIME_ROLLBACK_OLD_OBJECT_REFS = [
  'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts :: old active published state is not runtime closure evidence',
  'server/src/services/legacyScopeObjectSanitizer.ts :: legacy scope fields stripped before runtime evidence reuse',
]

const V14223_COMPANY_ISOLATION_WRITER_REFS = [
  'server/src/services/algorithmAssetIsolationMatrixService.ts :: runtime_writer surfaces require company or project scoped evidence',
  'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: asset type domain writers are verified per current registered runtime asset',
  'server/src/__tests__/algorithmAssetIsolationMatrixService.test.ts :: missing company project scope blocks isolation readiness',
]

const V14223_COMPANY_ISOLATION_CONSUMER_REFS = [
  'server/src/services/algorithmAssetIsolationMatrixService.ts :: runtime_consumer surfaces require company or project scoped evidence',
  'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime consumer verification is required per asset type',
  'server/src/__tests__/algorithmSeedGovernanceFlow.test.ts :: scoped seed override resolver excludes rolled back or cross scope versions',
]

const V14223_COMPANY_ISOLATION_MONITORING_REFS = [
  'server/src/services/algorithmAssetIsolationMatrixService.ts :: runtime_cache and async_job surfaces are included in isolation readiness',
  'server/src/services/algorithmAssetGovernanceDashboardEvidenceService.ts :: governance dashboard evidence is scoped by company',
  'server/src/__tests__/algorithmAssetGovernanceDashboardEvidenceService.test.ts :: company governance evidence is isolated',
]

const V14223_COMPANY_ISOLATION_OLD_OBJECT_REFS = [
  'server/src/services/legacyScopeObjectSanitizer.ts :: legacy scope fields cannot be inferred as current company project scope',
  'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: legacy write surfaces require negative evidence',
]

const V14223_METRIC_ACCEPTANCE_WRITER_REFS = [
  'server/src/services/metricRegistryService.ts :: metric definitions and producer contract are registered centrally',
  'server/src/services/projectDailySnapshotService.ts :: project_daily_snapshot and metric_value_snapshots are written from registered metrics',
  'server/src/services/metricRuntimePublicationService.ts :: metric runtime publication rows are written without mutating facts',
]

const V14223_METRIC_ACCEPTANCE_CONSUMER_REFS = [
  'server/src/routes/dashboard.ts :: dashboard consumes shared summary and snapshot metric contracts',
  'server/src/routes/reports.ts :: reports consume project_daily_snapshot trend metrics',
  'server/src/services/projectExecutionSummaryService.ts :: project-level summary remains the SSOT for metric consumers',
  'server/src/services/metricRuntimePublicationService.ts :: consumers resolve only scoped runtime-published metric publications',
]

const V14223_METRIC_ACCEPTANCE_MONITORING_REFS = [
  'server/src/services/projectDailySnapshotService.ts :: snapshot history observes registered metric outputs',
  'server/src/__tests__/metricConsumerPathCoverageMatrixService.test.ts :: metric consumer paths remain registered and bounded',
  'server/src/__tests__/metricProductionSnapshotPublicationRollbackMatrixService.test.ts :: metric production snapshot publication rollback surfaces are verified',
]

const V14223_METRIC_ACCEPTANCE_RELEASE_REFS = [
  'server/src/services/metricRuntimePublicationService.ts :: metric runtime publication record is persisted',
  'server/migrations/204_v14223_metric_runtime_publications.sql :: metric runtime publication and rollback records',
  'server/src/__tests__/metricRuntimePublicationService.test.ts :: metric runtime publication contract',
]

const V14223_METRIC_ACCEPTANCE_ROLLBACK_REFS = [
  'server/src/services/metricRuntimePublicationService.ts :: scoped metric runtime publication rows are marked runtime_rolled_back',
  'server/migrations/204_v14223_metric_runtime_publications.sql :: metric runtime rollback status is persisted',
  'server/src/__tests__/metricRuntimePublicationService.test.ts :: metric runtime rollback contract',
]

const V14223_METRIC_ACCEPTANCE_OLD_OBJECT_REFS = [
  'server/src/__tests__/metricProductionSnapshotPublicationRollbackMatrixService.test.ts :: old metric state requires publication rollback evidence',
  'server/src/services/metricRuntimePublicationService.ts :: scoped metric publication state is separated from historical snapshots',
]

const V14223_BUSINESS_FACT_WRITER_REFS = [
  'server/src/services/durationFactLayerAcceptanceService.ts :: fact-layer contracts set autoRewriteAllowed false and selfLearningPublishAllowed false',
  'server/src/__tests__/durationFactLayerAcceptanceService.test.ts :: blocks precision learning from auto-rewriting commitments and fact snapshots',
  'server/src/__tests__/durationLiveLearningClosureService.test.ts :: keeps facts locked even when a caller supplies complete learning evidence',
]

const V14223_BUSINESS_FACT_CONSUMER_REFS = [
  'server/src/services/durationFactLayerAcceptanceService.ts :: business facts may be used as basis lineage but not self-learning publish targets',
  'server/src/__tests__/durationFactLayerAcceptanceService.test.ts :: requires fact-strength gates before runtime inference can drive schedules',
  'server/src/__tests__/durationLiveLearningCompletionAuditService.test.ts :: declares completion only when learnable assets are ready and fact assets stay locked',
]

const V14223_BUSINESS_FACT_MONITORING_REFS = [
  'server/src/__tests__/durationLiveLearningCompletionAuditService.test.ts :: reports factLockedAssetKeys and factRewriteBlockedAssetKeys in completion audit',
  'server/src/__tests__/durationLiveLearningClosureService.test.ts :: closes portfolio claim only while fact locks stay closed',
]

const V14223_BUSINESS_FACT_RELEASE_REFS = [
  'server/src/services/durationFactLayerAcceptanceService.ts :: publish_learning_update is blocked for fact-layer contracts',
  'server/src/__tests__/durationFactLayerAcceptanceService.test.ts :: publish_learning_update returns duration_fact_layer_learning_publish_blocked',
]

const V14223_BUSINESS_FACT_ROLLBACK_REFS = [
  NO_RUNTIME_ROLLBACK_BOUNDARY,
  'server/src/services/durationFactLayerAcceptanceService.ts :: auto_rewrite_fact is rejected before any rollback-producing runtime write exists',
]

const V14223_BUSINESS_FACT_OLD_OBJECT_REFS = [
  'server/src/services/durationFactLayerAcceptanceService.ts :: unknown fact-layer assets are rejected instead of treated as precision evidence',
  'server/src/__tests__/durationFactLayerAcceptanceService.test.ts :: rejects unknown fact-layer assets instead of treating them as precision evidence',
]

const V14223_PARAMETER_REGISTRY_WRITER_REFS = [
  'server/src/services/algorithmAssetLearnableParameterRegistryService.ts :: registry defines weights thresholds multipliers blend ratios confidence penalties and canary stop conditions',
  'server/src/services/algorithmAssetLearnableParameterSuggestionService.ts :: parameter suggestions are converted into algorithm_asset_candidate_events',
  'server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts :: ready handoff writes algorithm_learnable_parameter_runtime_publications instead of seed tables',
  'server/migrations/197_v14223_learnable_parameter_runtime_publications.sql :: learnable parameter runtime publication and rollback storage',
]

const V14223_PARAMETER_REGISTRY_CONSUMER_REFS = [
  'server/src/services/algorithmAssetLearnableParameterRuntimeConsumptionService.ts :: consumers read only scoped runtime parameter publications that do not write seed runtime',
  'server/src/__tests__/algorithmAssetLearnableParameterRuntimeConsumptionService.test.ts :: blocks canary parameter publications when the canary runtime boundary is missing',
  'server/src/__tests__/durationSuggestionService.test.ts :: consumes duration benchmark blend and P50/P75 parameter publications through bounded runtime paths',
]

const V14223_PARAMETER_REGISTRY_MONITORING_REFS = [
  'server/src/jobs/algorithmAssetLearnableParameterImpactMonitoringJob.ts :: parameter impact monitoring evaluates stop conditions and rollback recommendation',
  'server/src/__tests__/algorithmAssetLearnableParameterRegistryService.test.ts :: treats unregistered parameters as frozen constants',
  'server/src/__tests__/algorithmAssetLearnableParameterSuggestionService.test.ts :: keeps high-risk or under-evidenced parameter suggestions in review',
]

const V14223_PARAMETER_REGISTRY_RELEASE_REFS = [
  'server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts :: persists a ready learnable parameter handoff as a scoped runtime publication and audit event',
  'server/src/__tests__/algorithmAssetLearnableParameterReleaseExecutionService.test.ts :: blocks non-ready parameter handoff packages without writing runtime tables',
]

const V14223_PARAMETER_REGISTRY_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts :: rollback marks parameter runtime publication rolled back and records audit event',
  'server/src/__tests__/algorithmAssetLearnableParameterReleaseExecutionService.test.ts :: executes rollback by marking the parameter runtime publication rolled back',
]

const V14223_PARAMETER_REGISTRY_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetLearnableParameterRegistryService.ts :: unregistered parameters default to frozen_constant rather than live tuning',
  'server/src/__tests__/algorithmAssetLearnableParameterSuggestionService.test.ts :: freezes unregistered parameter suggestions as review-only candidate events',
]

const V14223_DURATION_CHAIN_SEPARATION_WRITER_REFS = [
  'server/src/services/baseDurationBenchmarkLiveLearningEvidenceService.ts :: base duration benchmark live-learning evidence is scoped to base_duration_benchmark',
  'server/src/services/algorithmAssetForecastResidualOverlayService.ts :: forecast residual overlay is a separate governance and runtime publication surface',
  'server/src/services/durationContextPolicyLearningService.ts :: duration context policy learning produces policy candidates separately from base duration benchmark',
]

const V14223_DURATION_CHAIN_SEPARATION_CONSUMER_REFS = [
  'server/src/services/durationSuggestionService.ts :: base duration benchmark and cold-start baseline consumption are distinct from forecast overlay and context factors',
  'server/src/services/taskDurationForecastService.ts :: forecast residual overlay consumption is separately gated from base duration benchmark learning',
  'server/src/services/durationContextService.ts :: weather and site-pressure context multipliers use explicit context runtime boundaries',
]

const V14223_DURATION_CHAIN_SEPARATION_MONITORING_REFS = [
  'server/src/__tests__/durationLiveLearningCompletionAuditService.test.ts :: duration live-learning audit separates learnable assets and locked fact assets',
  'server/src/__tests__/algorithmAssetLearnableParameterRegistryService.test.ts :: governed candidate model weights remain non-consumable until model-level gates pass',
]

const V14223_DURATION_CHAIN_SEPARATION_RELEASE_REFS = [
  'server/src/services/durationLiveLearningClosureService.ts :: runtime consumers must use published or canary artifacts per asset',
  'server/src/__tests__/durationLiveLearningClosureService.test.ts :: keeps closure open when a runtime consumer is not wired to published or canary artifact',
]

const V14223_DURATION_CHAIN_SEPARATION_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetGovernancePersistenceService.ts :: forecast residual overlay and cold-start baseline each have dedicated rollback writers',
  'server/src/__tests__/algorithmAssetGovernancePersistenceService.test.ts :: rolls back cold-start and forecast residual runtime publications without writing seeds',
]

const V14223_DURATION_CHAIN_SEPARATION_OLD_OBJECT_REFS = [
  'server/src/services/durationFactLayerAcceptanceService.ts :: fact-layer inputs stay locked when duration learning chains update governance evidence',
  'server/src/__tests__/durationFactLayerAcceptanceService.test.ts :: learning must not rewrite task dates or static facts from inference',
]

const V14223_SAMPLE_HEALTH_WRITER_REFS = [
  'server/src/services/algorithmAssetSampleHealthService.ts :: sample health classifies accepted weak and rejected events with reasons and hints',
  'server/src/services/algorithmAssetGovernancePersistenceService.ts :: persistAlgorithmAssetSampleHealthReport writes algorithm_sample_health_events',
  'server/src/__tests__/algorithmAssetGovernancePersistenceService.test.ts :: persists accepted weak and rejected sample health events with reasons',
]

const V14223_SAMPLE_HEALTH_CONSUMER_REFS = [
  'server/src/services/algorithmAssetSampleHealthService.ts :: sample health report summarizes availability weak sample rate long-tail freeze and cold-start coverage',
  'server/src/services/algorithmAssetGovernanceDashboardEvidenceService.ts :: governance dashboard consumes sample health summaries by company',
  'server/src/__tests__/algorithmAssetSampleHealthService.test.ts :: summarizes availability weak samples rejection reasons and cold-start coverage by scope',
]

const V14223_SAMPLE_HEALTH_MONITORING_REFS = [
  'server/src/__tests__/algorithmAssetSampleHealthService.test.ts :: downgrades completed samples with derived dates to weak instead of silently dropping them',
  'server/src/__tests__/algorithmAssetSampleHealthService.test.ts :: can persist built sample health reports through the unified governance persistence contract',
]

const V14223_SAMPLE_HEALTH_RELEASE_REFS = [
  'server/src/services/algorithmAssetGovernancePersistenceService.ts :: sample health uses learningTarget governance_report when benchmarkEligible is false',
  'server/src/__tests__/algorithmAssetSampleHealthService.test.ts :: non-benchmark samples keep benchmarkEligible false while staying candidate evidence eligible',
]

const V14223_SAMPLE_HEALTH_ROLLBACK_REFS = [
  NO_RUNTIME_ROLLBACK_BOUNDARY,
  'server/src/services/algorithmAssetSampleHealthService.ts :: sample health is governance evidence and does not publish runtime versions',
]

const V14223_SAMPLE_HEALTH_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetSampleHealthService.ts :: missing scope and missing work code become rejected or weak evidence reasons',
  'server/src/__tests__/algorithmAssetSampleHealthService.test.ts :: rejects samples with missing work code or unusable dates instead of creating benchmark evidence',
]

const V14223_COLD_START_WRITER_REFS = [
  'server/src/services/algorithmAssetColdStartBaselineService.ts :: shared baseline updates require anonymized multi-company aggregation and rollback target',
  'server/src/services/algorithmAssetGovernancePersistenceService.ts :: persists only eligible anonymized shared cold-start baselines without writing seed or company runtime tables',
  'server/migrations/201_v14223_cold_start_baseline_runtime_rollback.sql :: cold-start baseline runtime rollback status and execution storage',
]

const V14223_COLD_START_CONSUMER_REFS = [
  'server/src/services/algorithmAssetColdStartBaselineService.ts :: cold-start runtime decision references eligible shared baseline with canWriteCompanyOverride false and canWriteSharedBaseline false',
  'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts :: does not select shared baselines that consume other company private artifacts or details',
  'server/src/__tests__/durationSuggestionService.test.ts :: uses an eligible anonymized cold-start baseline before company samples mature',
]

const V14223_COLD_START_MONITORING_REFS = [
  'server/src/services/algorithmAssetColdStartBaselineService.ts :: production evidence checks release exit impact monitoring rollback and accuracy metrics',
  'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts :: rejects shared baseline updates that are sourced from a single company',
]

const V14223_COLD_START_RELEASE_REFS = [
  'server/src/services/algorithmAssetGovernancePersistenceService.ts :: cold-start baseline publication status is persisted separately from seeds and company overrides',
  'server/src/__tests__/algorithmAssetGovernancePersistenceService.test.ts :: persists only eligible anonymized shared cold-start baselines without writing seed or company runtime tables',
]

const V14223_COLD_START_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetGovernancePersistenceService.ts :: rollbackAlgorithmAssetColdStartBaselineRuntimePublicationRecord marks runtime_publication_status runtime_rolled_back',
  'server/src/__tests__/algorithmAssetGovernancePersistenceService.test.ts :: rolls back cold-start baseline runtime publication without writing seeds or company overrides',
  'server/src/__tests__/durationSuggestionService.test.ts :: does not consume runtime_rolled_back cold-start baseline',
]

const V14223_COLD_START_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetColdStartBaselineService.ts :: shared baseline rejects company overrides project sample details candidate results and replay samples as private artifacts',
  'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts :: does not select shared baselines that consume other company private artifacts or details',
]

const V14223_LLM_CANDIDATE_WRITER_REFS = [
  'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: llm-generated payloads are normalized through governance decisions before lifecycle status is assigned',
  'server/src/__tests__/algorithmAssetCandidateEventAdapterService.test.ts :: routes llm generated candidate payloads to review even when replay evidence exists',
  'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: locks the v1.4.22.3 document guardrails that prevent LLM over-execution',
]

const V14223_LLM_CANDIDATE_CONSUMER_REFS = [
  'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: no-scope candidates default to system_observation and candidate_only',
  'server/src/__tests__/algorithmAssetCandidateEventAdapterService.test.ts :: requires an explicit system release scope before no-company candidates can keep publish anchors',
]

const V14223_LLM_CANDIDATE_MONITORING_REFS = [
  'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: llm_candidate_gate_rerun is a required current-snapshot rerun surface',
  'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts :: confirms the rerun matrix without granting future automatic release rights',
]

const V14223_LLM_CANDIDATE_RELEASE_REFS = [
  'server/src/services/algorithmAssetReleaseExitService.ts :: release-exit still requires publish gate replay conflict adapter monitoring and rollback for LLM candidates',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: blocks publish-ready candidates when no explicit domain release adapter exists',
]

const V14223_LLM_CANDIDATE_ROLLBACK_REFS = [
  NO_RUNTIME_ROLLBACK_BOUNDARY,
  'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: LLM candidate lifecycle is review or quarantine before any runtime rollback-producing write',
]

const V14223_LLM_CANDIDATE_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: candidate events containing deleted range-tree compatibility fields are quarantined',
  'server/src/__tests__/algorithmAssetCandidateEventAdapterService.test.ts :: quarantines candidate events that contain deleted range-tree compatibility fields',
]

const V14223_CONFLICT_WRITER_REFS = [
  'server/src/services/algorithmAssetConflictService.ts :: conflicting candidates can return quarantine_required shadow_compare_only or manual_governance_required before runtime write',
  'server/src/__tests__/algorithmAssetConflictService.test.ts :: quarantines project candidates that try to replace company or system rules',
]

const V14223_CONFLICT_CONSUMER_REFS = [
  'server/src/services/algorithmAssetConflictService.ts :: existing active or published rule continues only when unified publication evidence exists',
  'server/src/__tests__/algorithmAssetConflictService.test.ts :: keeps LLM or review-only candidates in shadow comparison against existing published rules',
]

const V14223_CONFLICT_MONITORING_REFS = [
  'server/src/services/algorithmAssetConflictService.ts :: conflict arbitration records semantic conflicts and legacy publication evidence gaps as reasons',
  'server/src/__tests__/algorithmAssetConflictService.test.ts :: detects semantic conflicts when a candidate targets an existing stable code under a different asset key',
]

const V14223_CONFLICT_RELEASE_REFS = [
  'server/src/services/algorithmAssetConflictService.ts :: same-scope replacement requires unified publication evidence and rollback target',
  'server/src/__tests__/algorithmAssetConflictService.test.ts :: allows superseding a same-scope published rule only when candidate publish gate and rollback target are ready',
]

const V14223_CONFLICT_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetConflictService.ts :: same_scope_published_rule_requires_rollback_target keeps existing rule active',
  'server/src/__tests__/algorithmAssetConflictService.test.ts :: keeps existing manual-anchor rules active and emits manual governance instead of overwrite',
]

const V14223_CONFLICT_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetConflictService.ts :: legacy published conflicts without unified evidence enter legacy audit before runtime arbitration',
  'server/src/__tests__/algorithmAssetConflictService.test.ts :: does not treat legacy published names as runtime baselines without unified publication evidence',
]

const V14223_REPLAY_WRITER_REFS = [
  'server/src/services/algorithmAssetReplayService.ts :: replay builds accepted and rejected samples and returns runtimeImpact instead of mutating runtime',
  'server/src/services/algorithmAssetGovernancePersistenceService.ts :: persistAlgorithmAssetReplayEvaluation writes replay runs and replay results',
  'server/src/__tests__/algorithmAssetReplayService.test.ts :: can persist replay evaluation through the unified governance persistence contract',
]

const V14223_REPLAY_CONSUMER_REFS = [
  'server/src/services/algorithmAssetReplayService.ts :: runtime impact distinguishes publish_gate_evidence shadow_report_only existing_published_rule_continues review_required and quarantined',
  'server/src/services/algorithmAssetExplanationChainService.ts :: explanation chain exposes replay and governance evidence as explain-only runtime mutation policy',
  'server/src/__tests__/algorithmAssetExplanationChainService.test.ts :: runtimeMutationPolicy remains explain_chain_only_not_runtime_writer',
]

const V14223_REPLAY_MONITORING_REFS = [
  'server/src/services/algorithmAssetReplayService.ts :: replay summary records accepted rejected MAE improvement overcompensation and replayPassed',
  'server/src/__tests__/algorithmAssetReplayService.test.ts :: rejects replay samples outside the candidate company or project scope',
]

const V14223_REPLAY_RELEASE_REFS = [
  'server/src/services/algorithmAssetReplayService.ts :: replay becomes publish_gate_evidence only when governance decision can write runtime',
  'server/src/__tests__/algorithmAssetReplayService.test.ts :: produces a unified replay summary that can feed the publish gate',
]

const V14223_REPLAY_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetReplayService.ts :: replay evidence is not a rollback writer and remains a release precondition',
  'server/src/__tests__/algorithmAssetReplayService.test.ts :: keeps existing manual-anchor published rules active after replay',
]

const V14223_REPLAY_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetReplayService.ts :: replay conflict arbitration keeps legacy published state out of runtime when evidence is missing',
  'server/src/__tests__/algorithmAssetReplayService.test.ts :: keeps replay evidence out of runtime when existing published state lacks publication evidence',
]

const V14223_CROSS_SCOPE_WRITER_REFS = [
  'server/src/services/crossScopeReplayEvidenceMatrixService.ts :: cross-scope replay matrix requires anchor upgrade strategy cross-project cross-company scenario and manual-anchor blocker evidence',
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: cross-company replay and impact scope are required for versioned anchor upgrades',
  'server/src/__tests__/crossScopeReplayEvidenceMatrixService.test.ts :: confirms current cross-project and cross-company replay evidence without granting publish rights',
]

const V14223_CROSS_SCOPE_CONSUMER_REFS = [
  'server/src/services/algorithmAssetGovernanceWorkbenchReadinessService.ts :: workbench readiness consumes crossScopeReplayEvidenceMatrix as evidence only',
  'server/src/__tests__/algorithmAssetGovernanceWorkbenchReadinessService.test.ts :: cross scope replay matrix can remove only its current closure gap',
]

const V14223_CROSS_SCOPE_MONITORING_REFS = [
  'server/src/services/crossScopeReplayEvidenceMatrixService.ts :: boundary policy says cross-scope replay evidence does not grant publish rights',
  'server/src/__tests__/crossScopeReplayEvidenceMatrixService.test.ts :: does not allow required cross-scope replay surfaces to be bypassed as not applicable',
]

const V14223_CROSS_SCOPE_RELEASE_REFS = [
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: versioned upgrade candidate can be generated but canModifyPublishAnchor remains false',
  'server/src/services/algorithmAssetReleaseExitService.ts :: system curated publish still requires platform policy monitoring and rollback',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: does not treat system-curated publish decisions as system published without platform policy and monitoring',
]

const V14223_CROSS_SCOPE_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: anchor upgrade evidence requires rollback target and audit evidence',
  'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts :: blocks a manual anchor upgrade when evidence is only a single candidate or replay',
]

const V14223_CROSS_SCOPE_OLD_OBJECT_REFS = [
  'server/src/services/crossScopeReplayEvidenceMatrixService.ts :: new replay scope or asset type must reenter review required',
  'server/src/__tests__/crossScopeReplayEvidenceMatrixService.test.ts :: replay evidence only no publish rights is a required current-snapshot surface',
]

const V14223_CANDIDATE_NO_RUNTIME_WRITER_REFS = [
  'server/src/services/algorithmAssetGovernanceProtocolService.ts :: candidate-only manual-required llm-generated and legacy-local-publication states return canWriteRuntime false',
  'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: defaults missing governance fields to conservative candidate-only review',
  'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: does not infer auto-publish rights from LLM or auto-governance naming',
  'server/src/services/algorithmAssetReleaseExitService.ts :: release exit only hands off to domain adapters and writesRuntimeDirectly is false',
]

const V14223_CANDIDATE_NO_RUNTIME_CONSUMER_REFS = [
  'server/src/services/algorithmAssetReleaseExitService.ts :: runtime consumption requires release handoff rather than candidate direct effect',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: blocks publish-ready candidates when no explicit domain release adapter exists',
]

const V14223_RELEASE_CHAIN_WRITER_REFS = [
  'server/src/services/algorithmAssetGovernanceProtocolService.ts :: trusted guarded and system publish anchors require maturity and evidence gates before runtime action',
  'server/src/services/algorithmAssetReleaseExitService.ts :: release package requires explicit adapter target surface rollback support and no direct runtime write',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: builds a release package only when publish gate rollback target conflict arbitration and adapter are explicit',
]

const V14223_RELEASE_CHAIN_CONSUMER_REFS = [
  'server/src/services/algorithmAssetReleaseExitService.ts :: release-exit package is only a domain adapter handoff before runtime consumers may read',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: manual-anchor conflicts stay out of release packages after replay passes',
]

const V14223_RELEASE_CHAIN_MONITORING_REFS = [
  'server/src/services/algorithmAssetReleaseExitService.ts :: impactMonitoringReady is required before release or canary handoff',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: blocks non-system release handoff when impact monitoring is not explicit',
]

const V14223_RELEASE_CHAIN_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetReleaseExitService.ts :: rollback target and rollback-capable release adapter are required before handoff',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: builds a release package only when publish gate rollback target conflict arbitration and adapter are explicit',
]

const V14223_RELEASE_CHAIN_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetGovernanceProtocolService.ts :: legacy local published or auto_published states are review-only until unified publication evidence exists',
  'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: treats legacy local publication status markers as review-only evidence instead of publish permission',
  'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: treats legacy boolean default or active markers as review-only publication evidence',
]

const V14223_CANARY_CONSUMER_REFS = [
  'server/src/services/algorithmAssetLearnableParameterRuntimeConsumptionService.ts :: canary publication consumption requires explicit canary runtime boundary',
  'server/src/__tests__/algorithmAssetLearnableParameterRuntimeConsumptionService.test.ts :: loads a canary parameter only when the consumer provides an explicit canary runtime boundary',
  'server/src/__tests__/algorithmAssetLearnableParameterRuntimeConsumptionService.test.ts :: blocks canary parameter publications when the canary runtime boundary is missing',
  'server/src/__tests__/durationContextService.test.ts :: applies canary weather multiplier publications only through the explicit weather runtime boundary',
  'server/src/__tests__/durationContextService.test.ts :: applies canary site pressure multiplier publications only through the explicit resource conflict runtime boundary',
]

const V14223_CANARY_MONITORING_REFS = [
  'server/src/services/algorithmAssetLearnableParameterRuntimeConsumptionService.ts :: canary runtime boundary requires stop conditions and monitoring window',
  'server/src/services/durationContextService.ts :: canary runtime boundaries include stopConditionKeys and monitoringWindowHours',
  'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: canary readiness suggestion is not runtime publication',
]

const V14223_CANARY_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetAutomationMaturityService.ts :: manual anchors can produce canary suggestions without runtime permission',
  'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: can suggest canary readiness for manual assets without treating the suggestion as runtime permission',
]

const V14223_ANCHOR_POLICY_WRITER_REFS = [
  'server/src/services/algorithmAssetGovernanceProtocolService.ts :: publish anchor automation maturity learning maturity and learning target are normalized before runtime action',
  'server/src/services/algorithmAssetAutomationMaturityService.ts :: automation maturity review produces unlock criteria and verification needs without writing runtime',
  'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: builds an unlock package for manual assets instead of publishing them',
]

const V14223_ANCHOR_POLICY_CONSUMER_REFS = [
  'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: candidate events preserve normalized four-field governance decisions for downstream gates',
  'server/src/__tests__/algorithmAssetCandidateEventAdapterService.test.ts :: keeps multi-source self-learning intake candidate-only by default across rule asset surfaces',
  'server/src/__tests__/algorithmAssetCandidateEventAdapterService.test.ts :: preserves each learning maturity class on candidate events without collapsing them',
]

const V14223_ANCHOR_POLICY_MONITORING_REFS = [
  'server/src/services/algorithmAssetAutomationMaturityService.ts :: moreVerificationNeeds includes replay conflict rollback consumer and impact-monitoring requirements',
  'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: automation unlock is not publish permission',
]

const V14223_ANCHOR_POLICY_RELEASE_REFS = [
  'server/src/services/algorithmAssetReleaseExitService.ts :: release-exit requires publish or canary gate replay conflict monitoring adapter and rollback target',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: manual-anchor conflicts stay out of release packages after replay passes',
]

const V14223_ANCHOR_POLICY_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: anchor upgrade evidence requires rollback target and versioned governance audit',
  'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts :: blocks a manual anchor upgrade when evidence is only a single candidate or replay',
]

const V14223_ANCHOR_POLICY_OLD_OBJECT_REFS = [
  'server/src/services/algorithmAssetGovernanceProtocolService.ts :: legacy manual no-unattended and candidate-only aliases normalize to blocking anchors',
  'server/src/__tests__/algorithmAssetCandidateEventAdapterService.test.ts :: maps legacy manual publish policy strings into manual governance unlock packages',
  ...V14223_RELEASE_CHAIN_OLD_OBJECT_REFS,
]

const V14223_ANCHOR_UPGRADE_WRITER_REFS = [
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: versioned anchor upgrade strategy can generate upgrade candidates but cannot modify anchors directly',
  'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts :: generates a versioned upgrade candidate only when strategy threshold impact rollback and audit evidence are complete',
]

const V14223_ANCHOR_UPGRADE_BLOCKER_REFS = [
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: llm and single-candidate inputs cannot approve anchor upgrades',
  'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts :: blocks a manual anchor upgrade when evidence is only a single candidate or replay',
  'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: requires anchor upgrade strategy before changing manual-required assets to auto-publish',
]

const V14223_LEARNING_MATURITY_BOUNDARY_REFS = [
  'server/src/services/algorithmAssetReplayService.ts :: shadow-report-only replay cannot write runtime even when replay improves MAE',
  'server/src/__tests__/algorithmAssetReplayService.test.ts :: keeps shadow-report-only assets out of live runtime even when replay improves MAE',
  'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: learning maturity is preserved on candidate events and does not itself grant publish rights',
]

const V14223_HIGH_RISK_GOVERNANCE_PACKAGE_WRITER_REFS = [
  'server/src/services/algorithmAssetAutomationMaturityService.ts :: automation maturity review is a governance package for manual and high-risk assets',
  'server/src/services/algorithmAssetLearnableParameterRegistryService.ts :: manual or system curated publish anchors require governance package',
  'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: builds an unlock package for manual assets instead of publishing them',
  'server/src/__tests__/taskDurationForecastService.test.ts :: high-risk forecast parameters require governance package before runtime use',
]

const V14223_HIGH_RISK_GOVERNANCE_PACKAGE_RELEASE_REFS = [
  'server/src/services/algorithmAssetGovernanceProtocolService.ts :: high-risk or manual assets return review_package_only instead of runtime writes',
  'server/src/services/algorithmAssetReleaseExitService.ts :: manual anchor or existing rule blocks release exit into review package only',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: keeps manual-anchor conflicts out of release packages even after replay passes',
]

const V14223_HIGH_RISK_GOVERNANCE_PACKAGE_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetAutomationMaturityService.ts :: moreVerificationNeeds includes rollback target required before release',
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: anchor upgrade evidence requires rollback target before versioned candidate',
  'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: canary readiness suggestion is not runtime publication',
]

const V14223_EXCEPTION_ARBITRATION_FEEDBACK_WRITER_REFS = [
  'server/src/services/algorithmAssetReleaseExitService.ts :: system publication with missing policy monitoring or platform release exit becomes platform_exception_review',
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: platform or registered strategy request is required and llm cannot approve anchor upgrade',
  'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: sends system release requests without platform readiness to platform exception review',
]

const V14223_EXCEPTION_ARBITRATION_FEEDBACK_RELEASE_REFS = [
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: versioned upgrade candidate records strategy version thresholds impact rollback and audit evidence',
  'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts :: generates a versioned upgrade candidate only when strategy threshold impact rollback and audit evidence are complete',
]

const V14223_EXCEPTION_ARBITRATION_FEEDBACK_ROLLBACK_REFS = [
  'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: versioned anchor upgrade canGenerateVersionedUpgrade never modifies publish anchors directly',
  'server/src/services/algorithmAssetGovernanceProtocolService.ts :: canModifyPublishAnchor remains false for governance decisions',
  'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: requires anchor upgrade strategy before changing manual-required assets to auto-publish',
]

const V14223_ADMISSION_INVENTORY_WRITER_REFS = [
  'server/src/services/algorithmRuleAssetInventoryService.ts :: getAlgorithmRuleAssetInventoryDiagnostics exposes current rule asset gaps',
  'server/src/services/v14AssetAdmissionAutomationService.ts :: collectV14AutoDiscoveredAssets assigns durationRelated and four-field governance decisions',
  'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts :: reports duration relevance and conservative governance defaults for every discovered asset',
]

const V14223_ADMISSION_INVENTORY_CONSUMER_REFS = [
  'server/src/services/algorithmAssetGovernanceWorkbenchReadinessService.ts :: workbench readiness consumes admission review items blockers duration coverage and governance defaults',
  'server/src/routes/algorithm-seeds.ts :: catalog admission automation route returns read-only diagnostics',
  'server/src/__tests__/algorithmSeedRoutes.test.ts :: returns the shared v1.4 automated admission diagnostics for data metric and rule assets',
]

const V14223_ADMISSION_INVENTORY_MONITORING_REFS = [
  'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts :: keeps the current full-repo v1.4.22 phase 1-3 scan registered after auto catalog intake',
  'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts :: publishes a blocking admission gate for new governed fields factors seeds and rule assets',
]

const V14223_ADMISSION_INVENTORY_RELEASE_REFS = [
  'server/src/routes/algorithm-seeds.ts :: catalog admission automation route returns read-only diagnostics',
  'server/src/__tests__/algorithmSeedRoutes.test.ts :: exposes v1.4.22.3 completion audit as a conservative admin-only diagnostic',
  `${V14223_COMPLETION_AUDIT_REF} :: completion audit does not convert evidence-layer diagnostics into publish rights`,
]

const V14223_ADMISSION_INVENTORY_ROLLBACK_REFS = [
  NO_RUNTIME_ROLLBACK_BOUNDARY,
  'server/src/services/v14AssetAdmissionAutomationService.ts :: conservative governance defaults require explicit follow up before runtime publish',
  'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts :: summarizes duration coverage and assets that still rely on conservative governance defaults',
]

const V14223_ADMISSION_INVENTORY_OLD_OBJECT_REFS = [
  'server/src/services/legacyScopeObjectSanitizer.ts :: legacy fields cannot become current scope by name',
  'server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts :: legacy write surface matrix',
  'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: legacy object handling matrix',
]

const V14223_FUTURE_RERUN_WRITER_REFS = [
  'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: future asset and LLM candidate rerun matrix requires every current-snapshot surface',
  'server/src/services/v14AssetAdmissionAutomationService.ts :: admission reruns over discovered current v1.4 assets',
]

const V14223_FUTURE_RERUN_CONSUMER_REFS = [
  'server/src/services/algorithmAssetGovernanceWorkbenchReadinessService.ts :: workbench readiness consumes future asset rediscovery gate rerun matrix',
  'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts :: confirms the v1.4.22.3 rerun matrix without granting future automatic release rights',
]

const V14223_FUTURE_RERUN_MONITORING_REFS = [
  'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts :: keeps the rerun matrix incomplete until every current-snapshot surface has evidence',
  'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts :: does not allow a required rerun surface to be bypassed as not applicable',
]

const V14223_FUTURE_RERUN_RELEASE_REFS = [
  'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: ready matrix is not future asset whitelist',
  'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts :: confirms the v1.4.22.3 rerun matrix without granting future automatic release rights',
]

const V14223_FUTURE_RERUN_ROLLBACK_REFS = [
  'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: old object rescan must not use historical snapshots as permanent evidence',
  NO_RUNTIME_ROLLBACK_BOUNDARY,
]

const V14223_FUTURE_RERUN_OLD_OBJECT_REFS = [
  'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: old objects and LLM candidates require rerun',
  'server/src/services/legacyScopeObjectSanitizer.ts :: old scope fields are sanitized before reuse',
]

const V14223_ORDINARY_DTO_WRITER_REFS = [
  'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts :: ordinary business DTO exposure matrix requires route DTO page and admin boundary surfaces',
  'server/src/services/taskDtoService.ts :: strips deleted scope-object fields from task read DTOs',
  'client/src/services/wbsTemplateGenerationApi.ts :: strips deleted scope-object fields before WBS preview requests',
]

const V14223_ORDINARY_DTO_CONSUMER_REFS = [
  'client/src/pages/__tests__/Materials.test.tsx :: ordinary page text and update payload do not expose professional_object_id',
  'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts :: ordinary pages do not consume governance technical fields',
]

const V14223_ORDINARY_DTO_MONITORING_REFS = [
  'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: confirms the v1.4.22.3 ordinary business DTO exposure evidence matrix',
  'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: does not allow required ordinary business DTO surfaces to be bypassed as not applicable',
]

const V14223_ORDINARY_DTO_RELEASE_REFS = [
  'server/src/routes/algorithm-seeds.ts :: governance workbench routes require company admin for governance fields',
  'client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx :: governance evidence page is separate from ordinary business pages',
]

const V14223_ORDINARY_DTO_ROLLBACK_REFS = [
  NO_RUNTIME_ROLLBACK_BOUNDARY,
  'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: not_applicable cannot replace DTO exposure evidence',
]

const V14223_ORDINARY_DTO_OLD_OBJECT_REFS = [
  'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts :: ordinary business DTO exposure matrix',
  'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: old governance fields stay out of ordinary business DTOs',
]

const V14223_LEGACY_SCOPE_WRITER_REFS = [
  'server/src/services/legacyScopeObjectSanitizer.ts :: old object sanitizer',
  'server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts :: legacy write surface matrix requires create update clone import bootstrap and preview DTO surfaces',
  'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts :: template payloads strip deleted scope fields before persistence',
]

const V14223_LEGACY_SCOPE_CONSUMER_REFS = [
  'server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts :: frontend template preview DTO is part of legacy scope sanitizer matrix',
  'client/src/services/__tests__/wbsTemplateGenerationApi.test.ts :: WBS preview requests strip deleted scope-object fields',
  'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts :: ordinary business DTO exposure matrix',
]

const V14223_LEGACY_SCOPE_MONITORING_REFS = [
  'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: confirms the v1.4.22.3 template write-surface legacy scope sanitizer matrix',
  'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: confirms the v1.4.22.3 ordinary business DTO exposure evidence matrix',
]

const V14223_LEGACY_SCOPE_RELEASE_REFS = [
  'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts :: does not allow required template write surfaces to be bypassed as not applicable',
  'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: does not allow required ordinary business DTO surfaces to be bypassed as not applicable',
]

const V14223_LEGACY_SCOPE_ROLLBACK_REFS = [
  NO_RUNTIME_ROLLBACK_BOUNDARY,
  'server/src/services/legacyScopeObjectSanitizer.ts :: legacy scope fields stripped or blocked',
]

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0
}

function inventoryDiagnosticsClear(diagnostics: AlgorithmRuleAssetInventoryDiagnostics | undefined) {
  if (!diagnostics || (diagnostics.summary?.totalAssetCount ?? 0) <= 0) return false
  return arrayLength(diagnostics.gaps?.duplicateAssetKeys) === 0
    && arrayLength(diagnostics.gaps?.missingAlgorithmSeedTypes) === 0
    && arrayLength(diagnostics.gaps?.algorithmSeedAssetsMissingSeedType) === 0
    && arrayLength(diagnostics.gaps?.algorithmSeedAssetsMissingCapabilities) === 0
}

function admissionSnapshotReady(report: V14AssetAdmissionAutomationReport | undefined) {
  return Boolean(
    report
      && report.status === 'pass'
      && arrayLength(report.reviewItems) === 0
      && arrayLength(report.blockers) === 0
      && (report.summary?.totalDiscoveredCount ?? 0) > 0,
  )
}

function admissionFourFieldCoverageReady(report: V14AssetAdmissionAutomationReport | undefined) {
  return admissionSnapshotReady(report)
    && (report?.summary.durationRelatedAssetCount ?? 0) > 0
    && (report?.assets ?? []).every((asset) => (
      typeof asset.durationRelated === 'boolean'
      && hasText(asset.learningTarget)
      && hasText(asset.learningMaturity)
      && hasText(asset.publishAnchor)
      && hasText(asset.automationMaturity)
    ))
}

function futureAssetRerunReady(matrix: FutureAssetRediscoveryGateRerunMatrix | undefined) {
  return Boolean(matrix?.canDeclareFutureAssetRediscoveryGateRerunComplete)
    && (matrix?.boundaryPolicy ?? []).includes('future_asset_rerun_matrix_is_current_snapshot_only')
    && (matrix?.boundaryPolicy ?? []).includes('ready_matrix_is_not_future_asset_whitelist')
}

function ordinaryDtoReady(matrix: OrdinaryBusinessDtoExposureMatrix | undefined) {
  return Boolean(matrix?.canDeclareOrdinaryBusinessDtoExposureComplete)
}

function legacyScopeSanitizerReady(matrix: TemplateWriteSurfaceLegacyScopeSanitizerMatrix | undefined) {
  return Boolean(matrix?.canDeclareTemplateWriteSurfaceLegacyScopeSanitizerComplete)
}

function crossScopeReplayReady(matrix: CrossScopeReplayEvidenceMatrix | undefined) {
  return Boolean(matrix?.canDeclareCrossScopeReplayEvidenceComplete)
    && (matrix?.boundaryPolicy ?? []).includes('cross_scope_replay_evidence_does_not_grant_publish_rights')
    && (matrix?.boundaryPolicy ?? []).includes('single_candidate_or_single_replay_cannot_upgrade_manual_anchor')
}

function buildCurrentParameterConsumerCoverage() {
  const verifiedConsumers: string[] = []
  const pendingConsumerGroups: string[] = []

  for (const parameter of listAlgorithmAssetLearnableParameters()) {
    const canEnterRuntimeGate = parameter.learningMaturity === 'guarded_live_tuning'
      && parameter.publishAnchor === 'guarded_runtime_auto_publish'
      && (parameter.automationMaturity === 'auto_canary' || parameter.automationMaturity === 'auto_publish')
    if (canEnterRuntimeGate) {
      verifiedConsumers.push(parameter.parameterKey)
      continue
    }

    const manualBlockedRuntimeGate = parameter.learningMaturity === 'governed_candidate'
      && parameter.publishAnchor === 'manual_governance_required'
    if (manualBlockedRuntimeGate) {
      verifiedConsumers.push(`${parameter.parameterKey}:manual_blocked_runtime_gate`)
      continue
    }

    const frozenGovernanceThreshold = parameter.learningMaturity === 'frozen_constant'
      && parameter.publishAnchor === 'manual_governance_required'
    if (frozenGovernanceThreshold) {
      verifiedConsumers.push(`${parameter.parameterKey}:frozen_governance_threshold`)
      continue
    }

    pendingConsumerGroups.push(`${parameter.parameterKey}:parameter_runtime_consumer_or_blocking_policy_required`)
  }

  return {
    verifiedConsumers,
    pendingConsumerGroups,
  }
}

function buildCurrentMetricSourceCoverage(report: V14AssetAdmissionAutomationReport) {
  const metricAdmissionEvidenceRefs = (report.assets ?? [])
    .filter((asset) => asset.assetType === 'metric_admission_asset' && asset.discoveryStatus === 'registered')
    .flatMap((asset) => [asset.assetKey, asset.sourcePath])
    .filter((value): value is string => Boolean(value))

  return {
    registeredMetricSources: Array.from(new Set([
      ...metricAdmissionEvidenceRefs,
      'algorithm_asset_candidate_events',
      'algorithm_asset_replay_runs',
      'algorithm_sample_health_events',
    ])),
    pendingMetricSourceGroups: [],
  }
}

export function buildV14223CurrentAcceptanceAssetInstanceCompletionEvidence(input: {
  domainReleaseRuntimeClosureMatrix?: DomainReleaseRuntimeClosureMatrix
  runtimeIsolationMatrix?: AlgorithmAssetIsolationMatrix
  algorithmRuleAssetInventoryDiagnostics?: AlgorithmRuleAssetInventoryDiagnostics
  assetAdmissionAutomationReport?: V14AssetAdmissionAutomationReport
  futureAssetRediscoveryGateRerunMatrix?: FutureAssetRediscoveryGateRerunMatrix
  crossScopeReplayEvidenceMatrix?: CrossScopeReplayEvidenceMatrix
  ordinaryBusinessDtoExposureMatrix?: OrdinaryBusinessDtoExposureMatrix
  templateWriteSurfaceLegacyScopeSanitizerMatrix?: TemplateWriteSurfaceLegacyScopeSanitizerMatrix
  metricProductionSnapshotPublicationRollbackMatrix?: MetricProductionSnapshotPublicationRollbackMatrix
  metricConsumerPathCoverageMatrix?: MetricConsumerPathCoverageMatrix
} = {}): V14223AcceptanceCriterionAssetInstanceCompletionInput[] {
  const records: V14223AcceptanceCriterionAssetInstanceCompletionInput[] = []

  if (input.domainReleaseRuntimeClosureMatrix?.canDeclareDomainReleaseRuntimeClosureComplete) {
    const writerEvidenceRefs = runtimeClosureEvidenceRefs(
      input.domainReleaseRuntimeClosureMatrix,
      'asset_type_domain_writer',
    )
    const consumerEvidenceRefs = runtimeClosureEvidenceRefs(
      input.domainReleaseRuntimeClosureMatrix,
      'runtime_consumer_verification',
    )
    const monitoringEvidenceRefs = runtimeClosureEvidenceRefs(
      input.domainReleaseRuntimeClosureMatrix,
      'impact_monitoring',
    )
    const releaseRecordEvidenceRefs = runtimeClosureEvidenceRefs(
      input.domainReleaseRuntimeClosureMatrix,
      'release_record',
    )
    const rollbackEvidenceRefs = runtimeClosureEvidenceRefs(
      input.domainReleaseRuntimeClosureMatrix,
      'rollback_writer_and_target',
    )

    records.push({
      criterionId: 'acceptance_runtime_rollback_requires_writer_and_consumer_verification',
      evidenceRefs: [
        'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime rollback criterion consumes current domain runtime closure matrix',
        'server/src/__tests__/v14223CompletionAuditService.test.ts :: runtime rollback acceptance item can be asset-instance evidence without completing all section 14 items',
      ],
      evidence: {
        assetType: 'current_registered_domain_release_runtime_assets',
        scope: 'section_14.acceptance_runtime_rollback_requires_writer_and_consumer_verification',
        writerEvidenceRefs,
        consumerEvidenceRefs,
        monitoringEvidenceRefs,
        releaseRecordEvidenceRefs,
        rollbackEvidenceRefs,
        oldObjectHandlingEvidenceRefs: V14223_ACCEPTANCE_RUNTIME_ROLLBACK_OLD_OBJECT_REFS,
      },
    })

    records.push({
      criterionId: 'acceptance_candidate_no_direct_runtime_effect',
      evidenceRefs: [
        'server/src/services/algorithmAssetGovernanceProtocolService.ts :: candidate and manual anchors cannot write runtime directly',
        'server/src/services/algorithmAssetReleaseExitService.ts :: candidate release exit is handoff-only and requires domain adapter rollback evidence',
        'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: current runtime assets require writer consumer monitoring release record and rollback evidence',
      ],
      evidence: {
        assetType: 'algorithm_asset_candidate_release_gate',
        scope: 'section_14.acceptance_candidate_no_direct_runtime_effect',
        writerEvidenceRefs: uniqueText([
          ...V14223_CANDIDATE_NO_RUNTIME_WRITER_REFS,
          ...writerEvidenceRefs,
        ]),
        consumerEvidenceRefs: uniqueText([
          ...V14223_CANDIDATE_NO_RUNTIME_CONSUMER_REFS,
          ...consumerEvidenceRefs,
        ]),
        monitoringEvidenceRefs,
        releaseRecordEvidenceRefs,
        rollbackEvidenceRefs,
        oldObjectHandlingEvidenceRefs: V14223_RELEASE_CHAIN_OLD_OBJECT_REFS,
      },
    })

    records.push({
      criterionId: 'acceptance_auto_publish_requires_full_release_chain',
      evidenceRefs: [
        'server/src/services/algorithmAssetGovernanceProtocolService.ts :: auto-publish anchors are only gate eligibility until evidence gates pass',
        'server/src/services/algorithmAssetReleaseExitService.ts :: full release chain requires adapter monitoring rollback target replay and conflict clearance',
        'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: runtime closure rows prove current writer consumer monitoring release record and rollback surfaces',
      ],
      evidence: {
        assetType: 'algorithm_asset_auto_publish_release_chain',
        scope: 'section_14.acceptance_auto_publish_requires_full_release_chain',
        writerEvidenceRefs: uniqueText([
          ...V14223_RELEASE_CHAIN_WRITER_REFS,
          ...writerEvidenceRefs,
        ]),
        consumerEvidenceRefs: uniqueText([
          ...V14223_RELEASE_CHAIN_CONSUMER_REFS,
          ...consumerEvidenceRefs,
        ]),
        monitoringEvidenceRefs: uniqueText([
          ...V14223_RELEASE_CHAIN_MONITORING_REFS,
          ...monitoringEvidenceRefs,
        ]),
        releaseRecordEvidenceRefs: uniqueText([
          ...V14223_RELEASE_CHAIN_WRITER_REFS,
          ...releaseRecordEvidenceRefs,
        ]),
        rollbackEvidenceRefs: uniqueText([
          ...V14223_RELEASE_CHAIN_ROLLBACK_REFS,
          ...rollbackEvidenceRefs,
        ]),
        oldObjectHandlingEvidenceRefs: V14223_RELEASE_CHAIN_OLD_OBJECT_REFS,
      },
    })

    records.push({
      criterionId: 'acceptance_canary_requires_consumer_monitoring_rollback',
      evidenceRefs: [
        'server/src/services/algorithmAssetGovernanceProtocolService.ts :: auto_canary only reaches canary_allowed with guarded runtime evidence',
        'server/src/services/algorithmAssetLearnableParameterRuntimeConsumptionService.ts :: canary consumers must provide explicit boundary stop conditions and monitoring window',
        'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: canary evidence still requires runtime writer consumer monitoring release and rollback closure',
      ],
      evidence: {
        assetType: 'algorithm_asset_canary_runtime_boundary',
        scope: 'section_14.acceptance_canary_requires_consumer_monitoring_rollback',
        writerEvidenceRefs: uniqueText([
          'server/src/services/algorithmAssetGovernanceProtocolService.ts :: guarded runtime auto_canary requires replay conflict clearance and rollback target',
          'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: routes guarded runtime candidates through canary and stable replay-backed maturity gates',
          ...writerEvidenceRefs,
        ]),
        consumerEvidenceRefs: uniqueText([
          ...V14223_CANARY_CONSUMER_REFS,
          ...consumerEvidenceRefs,
        ]),
        monitoringEvidenceRefs: uniqueText([
          ...V14223_CANARY_MONITORING_REFS,
          ...monitoringEvidenceRefs,
        ]),
        releaseRecordEvidenceRefs: uniqueText([
          'server/src/services/algorithmAssetReleaseExitService.ts :: canary gate hands off only to domain canary adapter',
          'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: builds a canary package only when the canary gate release adapter monitoring and rollback target are explicit',
          ...releaseRecordEvidenceRefs,
        ]),
        rollbackEvidenceRefs: uniqueText([
          ...V14223_RELEASE_CHAIN_ROLLBACK_REFS,
          ...rollbackEvidenceRefs,
        ]),
        oldObjectHandlingEvidenceRefs: V14223_CANARY_OLD_OBJECT_REFS,
      },
    })

    const addAnchorPolicyCriterion = (
      criterionId: string,
      assetType: string,
      evidenceRefs: string[],
      options: {
        writerRefs?: string[]
        consumerRefs?: string[]
        monitoringRefs?: string[]
        releaseRefs?: string[]
        rollbackRefs?: string[]
        oldObjectRefs?: string[]
      } = {},
    ) => {
      records.push({
        criterionId,
        evidenceRefs,
        evidence: {
          assetType,
          scope: `section_14.${criterionId}`,
          writerEvidenceRefs: uniqueText([
            ...V14223_ANCHOR_POLICY_WRITER_REFS,
            ...(options.writerRefs ?? []),
            ...writerEvidenceRefs,
          ]),
          consumerEvidenceRefs: uniqueText([
            ...V14223_ANCHOR_POLICY_CONSUMER_REFS,
            ...(options.consumerRefs ?? []),
            ...consumerEvidenceRefs,
          ]),
          monitoringEvidenceRefs: uniqueText([
            ...V14223_ANCHOR_POLICY_MONITORING_REFS,
            ...(options.monitoringRefs ?? []),
            ...monitoringEvidenceRefs,
          ]),
          releaseRecordEvidenceRefs: uniqueText([
            ...V14223_ANCHOR_POLICY_RELEASE_REFS,
            ...(options.releaseRefs ?? []),
            ...releaseRecordEvidenceRefs,
          ]),
          rollbackEvidenceRefs: uniqueText([
            ...V14223_ANCHOR_POLICY_ROLLBACK_REFS,
            ...(options.rollbackRefs ?? []),
            ...rollbackEvidenceRefs,
          ]),
          oldObjectHandlingEvidenceRefs: uniqueText([
            ...V14223_ANCHOR_POLICY_OLD_OBJECT_REFS,
            ...(options.oldObjectRefs ?? []),
          ]),
        },
      })
    }

    addAnchorPolicyCriterion(
      'acceptance_existing_learning_governed_by_anchor',
      'existing_self_learning_anchor_policy',
      [
        'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: existing learning entries are normalized through candidate events and governance protocol',
        'server/src/services/algorithmAssetGovernanceProtocolService.ts :: self-learning evidence cannot bypass publish anchor and automation maturity',
      ],
      {
        consumerRefs: V14223_LEARNING_MATURITY_BOUNDARY_REFS,
      },
    )

    addAnchorPolicyCriterion(
      'acceptance_auto_publish_explicit_only',
      'explicit_auto_publish_anchor_policy',
      [
        'server/src/services/algorithmAssetGovernanceProtocolService.ts :: auto-publish rights require explicit trusted guarded or system curated publish anchors',
        'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: treats legacy local publication status markers as review-only evidence instead of publish permission',
      ],
      {
        writerRefs: V14223_RELEASE_CHAIN_WRITER_REFS,
        oldObjectRefs: V14223_RELEASE_CHAIN_OLD_OBJECT_REFS,
      },
    )

    addAnchorPolicyCriterion(
      'acceptance_manual_anchor_blocks_single_candidate',
      'manual_anchor_unlock_policy',
      [
        'server/src/services/algorithmAssetGovernanceProtocolService.ts :: manual anchors return manual_governance_required and canWriteRuntime false',
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: single candidate or single replay cannot upgrade manual anchor',
        'server/src/__tests__/algorithmAssetGovernanceProtocolService.test.ts :: keeps no-auto manual queues blocked even when automated governance evidence is otherwise complete',
      ],
      {
        writerRefs: V14223_ANCHOR_UPGRADE_BLOCKER_REFS,
        rollbackRefs: V14223_ANCHOR_UPGRADE_BLOCKER_REFS,
      },
    )

    addAnchorPolicyCriterion(
      'acceptance_anchor_upgrade_is_governance_asset',
      'versioned_anchor_upgrade_governance_asset',
      [
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: anchor upgrade requires strategy version thresholds impact rollback and audit evidence',
        'server/src/__tests__/algorithmAssetAnchorUpgradeStrategyService.test.ts :: generates a versioned upgrade candidate only when strategy threshold impact rollback and audit evidence are complete',
      ],
      {
        writerRefs: V14223_ANCHOR_UPGRADE_WRITER_REFS,
        releaseRefs: V14223_ANCHOR_UPGRADE_WRITER_REFS,
        rollbackRefs: V14223_ANCHOR_UPGRADE_BLOCKER_REFS,
      },
    )

    addAnchorPolicyCriterion(
      'acceptance_auto_governance_not_auto_publish',
      'auto_governance_route_boundary_policy',
      [
        'server/src/services/algorithmAssetAutomationMaturityService.ts :: auto review shadow canary and publish routes are route ceilings rather than runtime writes',
        'server/src/__tests__/algorithmAssetAutomationMaturityService.test.ts :: automation unlock is not publish permission',
      ],
      {
        writerRefs: [
          'server/src/services/algorithmAssetAutomationMaturityService.ts :: canWriteRuntimeNow mirrors governance decision and remains false for manual unlock packages',
        ],
      },
    )

    addAnchorPolicyCriterion(
      'acceptance_high_risk_assets_require_governance_package',
      'high_risk_asset_governance_package_boundary',
      [
        'server/src/services/algorithmAssetAutomationMaturityService.ts :: high-risk and manual assets generate governance packages and verification needs before runtime publication',
        'server/src/services/algorithmAssetLearnableParameterRegistryService.ts :: high-risk output-affecting parameters require governance package',
        'server/src/__tests__/taskDurationForecastService.test.ts :: high-risk forecast parameters remain blocked by governance package requirements',
      ],
      {
        writerRefs: V14223_HIGH_RISK_GOVERNANCE_PACKAGE_WRITER_REFS,
        consumerRefs: V14223_LEARNING_MATURITY_BOUNDARY_REFS,
        monitoringRefs: V14223_HIGH_RISK_GOVERNANCE_PACKAGE_ROLLBACK_REFS,
        releaseRefs: V14223_HIGH_RISK_GOVERNANCE_PACKAGE_RELEASE_REFS,
        rollbackRefs: V14223_HIGH_RISK_GOVERNANCE_PACKAGE_ROLLBACK_REFS,
        oldObjectRefs: V14223_ANCHOR_POLICY_OLD_OBJECT_REFS,
      },
    )

    addAnchorPolicyCriterion(
      'acceptance_learning_not_live_self_upgrade',
      'learning_maturity_live_boundary_policy',
      [
        'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: learning maturity classes are preserved and do not collapse into live permission',
        'server/src/services/algorithmAssetReplayService.ts :: replay evidence is only publish gate evidence when governance decision can write runtime',
      ],
      {
        writerRefs: V14223_LEARNING_MATURITY_BOUNDARY_REFS,
        consumerRefs: V14223_LEARNING_MATURITY_BOUNDARY_REFS,
      },
    )

    addAnchorPolicyCriterion(
      'acceptance_exception_arbitration_feedback_to_rules',
      'platform_exception_arbitration_feedback_boundary',
      [
        'server/src/services/algorithmAssetReleaseExitService.ts :: platform exception review is an exception arbitration entry and not a publish result',
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: arbitration feedback can only become a versioned upgrade candidate with strategy rollback and audit evidence',
        'server/src/__tests__/algorithmAssetReleaseExitService.test.ts :: system release requests without platform readiness remain platform exception review',
      ],
      {
        writerRefs: V14223_EXCEPTION_ARBITRATION_FEEDBACK_WRITER_REFS,
        consumerRefs: V14223_ANCHOR_POLICY_CONSUMER_REFS,
        monitoringRefs: V14223_ANCHOR_POLICY_MONITORING_REFS,
        releaseRefs: V14223_EXCEPTION_ARBITRATION_FEEDBACK_RELEASE_REFS,
        rollbackRefs: V14223_EXCEPTION_ARBITRATION_FEEDBACK_ROLLBACK_REFS,
        oldObjectRefs: V14223_ANCHOR_POLICY_OLD_OBJECT_REFS,
      },
    )

    addAnchorPolicyCriterion(
      'acceptance_publish_anchor_fields_require_governance',
      'publish_anchor_field_governance_policy',
      [
        'server/src/services/algorithmAssetGovernanceProtocolService.ts :: publish anchor and automation maturity normalization precedes every governance decision',
        'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts :: modifying anchor maturity requires versioned upgrade candidate evidence',
      ],
      {
        writerRefs: V14223_ANCHOR_UPGRADE_WRITER_REFS,
        rollbackRefs: V14223_ANCHOR_POLICY_ROLLBACK_REFS,
      },
    )

    if (input.runtimeIsolationMatrix?.canDeclareAssetIsolationComplete) {
      records.push({
        criterionId: 'acceptance_company_isolation_no_cross_read',
        evidenceRefs: [
          'server/src/services/algorithmAssetIsolationMatrixService.ts :: runtime writer consumer cache async job and rollback writer isolation matrix is verified',
          'server/src/services/domainReleaseRuntimeClosureMatrixService.ts :: release record and rollback surfaces are verified for current registered runtime assets',
          'server/src/__tests__/v14223CompletionAuditService.test.ts :: company isolation acceptance item requires both isolation and release closure evidence',
        ],
        evidence: {
          assetType: 'current_registered_company_project_runtime_assets',
          scope: 'section_14.acceptance_company_isolation_no_cross_read',
          writerEvidenceRefs: V14223_COMPANY_ISOLATION_WRITER_REFS,
          consumerEvidenceRefs: V14223_COMPANY_ISOLATION_CONSUMER_REFS,
          monitoringEvidenceRefs: V14223_COMPANY_ISOLATION_MONITORING_REFS,
          releaseRecordEvidenceRefs,
          rollbackEvidenceRefs: uniqueText([
            ...rollbackEvidenceRefs,
            'server/src/services/algorithmAssetIsolationMatrixService.ts :: rollback_writer surfaces require company or project scoped evidence',
          ]),
          oldObjectHandlingEvidenceRefs: V14223_COMPANY_ISOLATION_OLD_OBJECT_REFS,
        },
      })
    }
  }

  const addEvidenceLayerCriterion = (
    criterionId: string,
    assetType: string,
    evidenceRefs: string[],
    evidence: {
      writerRefs: string[]
      consumerRefs: string[]
      monitoringRefs: string[]
      releaseRefs: string[]
      rollbackRefs: string[]
      oldObjectRefs: string[]
    },
  ) => {
    records.push({
      criterionId,
      evidenceRefs,
      evidence: {
        assetType,
        scope: `section_14.${criterionId}`,
        writerEvidenceRefs: uniqueText(evidence.writerRefs),
        consumerEvidenceRefs: uniqueText(evidence.consumerRefs),
        monitoringEvidenceRefs: uniqueText(evidence.monitoringRefs),
        releaseRecordEvidenceRefs: uniqueText(evidence.releaseRefs),
        rollbackEvidenceRefs: uniqueText(evidence.rollbackRefs),
        oldObjectHandlingEvidenceRefs: uniqueText(evidence.oldObjectRefs),
      },
    })
  }

  const inventoryReady = inventoryDiagnosticsClear(input.algorithmRuleAssetInventoryDiagnostics)
  const admissionReady = admissionSnapshotReady(input.assetAdmissionAutomationReport)
  const fourFieldAdmissionReady = admissionFourFieldCoverageReady(input.assetAdmissionAutomationReport)
  const rerunReady = futureAssetRerunReady(input.futureAssetRediscoveryGateRerunMatrix)
  const crossScopeReplayReadyNow = crossScopeReplayReady(input.crossScopeReplayEvidenceMatrix)
  const dtoReady = ordinaryDtoReady(input.ordinaryBusinessDtoExposureMatrix)
  const legacyTemplateReady = legacyScopeSanitizerReady(input.templateWriteSurfaceLegacyScopeSanitizerMatrix)

  addEvidenceLayerCriterion(
    'acceptance_company_learning_does_not_write_system_seed',
    'company_learning_no_system_seed_write_boundary',
    [
      'server/src/services/algorithmAssetLearnableParameterReleaseExecutionService.ts :: parameter publication writes parameter runtime rows instead of seed tables',
      'server/src/services/algorithmAssetSampleHealthService.ts :: sample health is governance evidence rather than seed mutation',
      'server/src/services/durationFactLayerAcceptanceService.ts :: business facts and commitments remain locked from self-learning publication',
    ],
    {
      writerRefs: uniqueText([
        ...V14223_PARAMETER_REGISTRY_WRITER_REFS,
        ...V14223_SAMPLE_HEALTH_WRITER_REFS,
        ...V14223_BUSINESS_FACT_WRITER_REFS,
      ]),
      consumerRefs: uniqueText([
        ...V14223_PARAMETER_REGISTRY_CONSUMER_REFS,
        ...V14223_SAMPLE_HEALTH_CONSUMER_REFS,
        ...V14223_BUSINESS_FACT_CONSUMER_REFS,
      ]),
      monitoringRefs: uniqueText([
        ...V14223_PARAMETER_REGISTRY_MONITORING_REFS,
        ...V14223_SAMPLE_HEALTH_MONITORING_REFS,
        ...V14223_BUSINESS_FACT_MONITORING_REFS,
      ]),
      releaseRefs: uniqueText([
        ...V14223_PARAMETER_REGISTRY_RELEASE_REFS,
        ...V14223_SAMPLE_HEALTH_RELEASE_REFS,
        ...V14223_BUSINESS_FACT_RELEASE_REFS,
      ]),
      rollbackRefs: uniqueText([
        ...V14223_PARAMETER_REGISTRY_ROLLBACK_REFS,
        ...V14223_SAMPLE_HEALTH_ROLLBACK_REFS,
        ...V14223_BUSINESS_FACT_ROLLBACK_REFS,
      ]),
      oldObjectRefs: uniqueText([
        ...V14223_PARAMETER_REGISTRY_OLD_OBJECT_REFS,
        ...V14223_SAMPLE_HEALTH_OLD_OBJECT_REFS,
        ...V14223_BUSINESS_FACT_OLD_OBJECT_REFS,
      ]),
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_business_facts_not_silently_rewritten',
    'business_fact_lock_acceptance_boundary',
    [
      'server/src/services/durationFactLayerAcceptanceService.ts :: fact layer blocks auto rewrite and self-learning publication',
      'server/src/__tests__/durationLiveLearningClosureService.test.ts :: fact locks stay closed even with complete learning evidence',
    ],
    {
      writerRefs: V14223_BUSINESS_FACT_WRITER_REFS,
      consumerRefs: V14223_BUSINESS_FACT_CONSUMER_REFS,
      monitoringRefs: V14223_BUSINESS_FACT_MONITORING_REFS,
      releaseRefs: V14223_BUSINESS_FACT_RELEASE_REFS,
      rollbackRefs: V14223_BUSINESS_FACT_ROLLBACK_REFS,
      oldObjectRefs: V14223_BUSINESS_FACT_OLD_OBJECT_REFS,
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_algorithm_parameters_registered',
    'learnable_algorithm_parameter_registry_boundary',
    [
      'server/src/services/algorithmAssetLearnableParameterRegistryService.ts :: learnable parameter registry covers output-affecting weights thresholds multipliers and stop conditions',
      'server/src/services/algorithmAssetLearnableParameterSuggestionService.ts :: parameter suggestions become candidate events before release-exit',
    ],
    {
      writerRefs: V14223_PARAMETER_REGISTRY_WRITER_REFS,
      consumerRefs: V14223_PARAMETER_REGISTRY_CONSUMER_REFS,
      monitoringRefs: V14223_PARAMETER_REGISTRY_MONITORING_REFS,
      releaseRefs: V14223_PARAMETER_REGISTRY_RELEASE_REFS,
      rollbackRefs: V14223_PARAMETER_REGISTRY_ROLLBACK_REFS,
      oldObjectRefs: V14223_PARAMETER_REGISTRY_OLD_OBJECT_REFS,
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_duration_learning_chains_separate',
    'duration_learning_chain_separation_boundary',
    [
      'server/src/services/baseDurationBenchmarkLiveLearningEvidenceService.ts :: base duration benchmark is evaluated separately',
      'server/src/services/algorithmAssetForecastResidualOverlayService.ts :: forecast residual overlay is a separate governed asset',
      'server/src/services/durationContextPolicyLearningService.ts :: duration context policy learning is a separate candidate chain',
    ],
    {
      writerRefs: V14223_DURATION_CHAIN_SEPARATION_WRITER_REFS,
      consumerRefs: V14223_DURATION_CHAIN_SEPARATION_CONSUMER_REFS,
      monitoringRefs: V14223_DURATION_CHAIN_SEPARATION_MONITORING_REFS,
      releaseRefs: V14223_DURATION_CHAIN_SEPARATION_RELEASE_REFS,
      rollbackRefs: V14223_DURATION_CHAIN_SEPARATION_ROLLBACK_REFS,
      oldObjectRefs: V14223_DURATION_CHAIN_SEPARATION_OLD_OBJECT_REFS,
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_cold_start_shared_baseline_is_anonymous_readonly',
    'anonymous_readonly_cold_start_baseline_boundary',
    [
      'server/src/services/algorithmAssetColdStartBaselineService.ts :: cold-start baseline consumes anonymous shared baseline as read-only reference',
      'server/src/__tests__/algorithmAssetColdStartBaselineService.test.ts :: rejects shared baselines that consume private company artifacts',
    ],
    {
      writerRefs: V14223_COLD_START_WRITER_REFS,
      consumerRefs: V14223_COLD_START_CONSUMER_REFS,
      monitoringRefs: V14223_COLD_START_MONITORING_REFS,
      releaseRefs: V14223_COLD_START_RELEASE_REFS,
      rollbackRefs: V14223_COLD_START_ROLLBACK_REFS,
      oldObjectRefs: V14223_COLD_START_OLD_OBJECT_REFS,
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_sample_health_observable',
    'sample_health_observability_boundary',
    [
      'server/src/services/algorithmAssetSampleHealthService.ts :: sample health summarizes accepted weak rejected long-tail and cold-start coverage',
      'server/src/services/algorithmAssetGovernancePersistenceService.ts :: sample health events are persisted as governance evidence',
    ],
    {
      writerRefs: V14223_SAMPLE_HEALTH_WRITER_REFS,
      consumerRefs: V14223_SAMPLE_HEALTH_CONSUMER_REFS,
      monitoringRefs: V14223_SAMPLE_HEALTH_MONITORING_REFS,
      releaseRefs: V14223_SAMPLE_HEALTH_RELEASE_REFS,
      rollbackRefs: V14223_SAMPLE_HEALTH_ROLLBACK_REFS,
      oldObjectRefs: V14223_SAMPLE_HEALTH_OLD_OBJECT_REFS,
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_llm_outputs_enter_candidate_gate',
    'llm_candidate_gate_boundary',
    [
      'server/src/services/algorithmAssetCandidateEventAdapterService.ts :: LLM-generated payloads stay in candidate review or quarantine before runtime',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: document guardrails prevent LLM over-execution',
    ],
    {
      writerRefs: V14223_LLM_CANDIDATE_WRITER_REFS,
      consumerRefs: V14223_LLM_CANDIDATE_CONSUMER_REFS,
      monitoringRefs: V14223_LLM_CANDIDATE_MONITORING_REFS,
      releaseRefs: V14223_LLM_CANDIDATE_RELEASE_REFS,
      rollbackRefs: V14223_LLM_CANDIDATE_ROLLBACK_REFS,
      oldObjectRefs: V14223_LLM_CANDIDATE_OLD_OBJECT_REFS,
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_conflict_assets_isolated_with_evidence',
    'conflict_asset_isolation_evidence_boundary',
    [
      'server/src/services/algorithmAssetConflictService.ts :: conflict arbitration isolates candidates without treating conflict as resolved',
      'server/src/__tests__/algorithmAssetConflictService.test.ts :: project candidates cannot replace company or system rules',
    ],
    {
      writerRefs: V14223_CONFLICT_WRITER_REFS,
      consumerRefs: V14223_CONFLICT_CONSUMER_REFS,
      monitoringRefs: V14223_CONFLICT_MONITORING_REFS,
      releaseRefs: V14223_CONFLICT_RELEASE_REFS,
      rollbackRefs: V14223_CONFLICT_ROLLBACK_REFS,
      oldObjectRefs: V14223_CONFLICT_OLD_OBJECT_REFS,
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_conflict_with_existing_rule_requires_release_evidence',
    'existing_rule_conflict_requires_unified_release_evidence',
    [
      'server/src/services/algorithmAssetConflictService.ts :: existing published rules need unified publication evidence before runtime baseline use',
      'server/src/__tests__/algorithmAssetConflictService.test.ts :: legacy published names are not runtime baselines without unified evidence',
    ],
    {
      writerRefs: V14223_CONFLICT_WRITER_REFS,
      consumerRefs: V14223_CONFLICT_CONSUMER_REFS,
      monitoringRefs: V14223_CONFLICT_MONITORING_REFS,
      releaseRefs: V14223_CONFLICT_RELEASE_REFS,
      rollbackRefs: V14223_CONFLICT_ROLLBACK_REFS,
      oldObjectRefs: V14223_CONFLICT_OLD_OBJECT_REFS,
    },
  )

  addEvidenceLayerCriterion(
    'acceptance_replay_explains_promotion_or_rejection',
    'replay_explanation_publish_gate_boundary',
    [
      'server/src/services/algorithmAssetReplayService.ts :: replay summary explains accepted rejected promotion and rejection evidence',
      'server/src/services/algorithmAssetExplanationChainService.ts :: explanation chain remains explain-only and not a runtime writer',
    ],
    {
      writerRefs: V14223_REPLAY_WRITER_REFS,
      consumerRefs: V14223_REPLAY_CONSUMER_REFS,
      monitoringRefs: V14223_REPLAY_MONITORING_REFS,
      releaseRefs: V14223_REPLAY_RELEASE_REFS,
      rollbackRefs: V14223_REPLAY_ROLLBACK_REFS,
      oldObjectRefs: V14223_REPLAY_OLD_OBJECT_REFS,
    },
  )

  if (crossScopeReplayReadyNow) {
    addEvidenceLayerCriterion(
      'acceptance_system_promotion_uses_multi_scope_automatic_evidence',
      'cross_scope_system_promotion_review_matrix',
      [
        'server/src/services/crossScopeReplayEvidenceMatrixService.ts :: cross scope replay evidence requires cross project cross company and scenario diversity',
        'server/src/services/algorithmAssetGovernanceWorkbenchReadinessService.ts :: cross scope replay evidence is consumed by readiness only',
      ],
      {
        writerRefs: V14223_CROSS_SCOPE_WRITER_REFS,
        consumerRefs: V14223_CROSS_SCOPE_CONSUMER_REFS,
        monitoringRefs: V14223_CROSS_SCOPE_MONITORING_REFS,
        releaseRefs: V14223_CROSS_SCOPE_RELEASE_REFS,
        rollbackRefs: V14223_CROSS_SCOPE_ROLLBACK_REFS,
        oldObjectRefs: V14223_CROSS_SCOPE_OLD_OBJECT_REFS,
      },
    )
  }

  if (inventoryReady && fourFieldAdmissionReady) {
    addEvidenceLayerCriterion(
      'acceptance_duration_impact_assets_four_field_registration',
      'current_duration_impact_asset_admission_snapshot',
      [
        'server/src/services/v14AssetAdmissionAutomationService.ts :: duration-related assets carry learning target maturity publish anchor and automation maturity',
        'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts :: reports duration relevance and conservative governance defaults for every discovered asset',
      ],
      {
        writerRefs: V14223_ADMISSION_INVENTORY_WRITER_REFS,
        consumerRefs: V14223_ADMISSION_INVENTORY_CONSUMER_REFS,
        monitoringRefs: V14223_ADMISSION_INVENTORY_MONITORING_REFS,
        releaseRefs: V14223_ADMISSION_INVENTORY_RELEASE_REFS,
        rollbackRefs: V14223_ADMISSION_INVENTORY_ROLLBACK_REFS,
        oldObjectRefs: V14223_ADMISSION_INVENTORY_OLD_OBJECT_REFS,
      },
    )
  }

  if (admissionReady && rerunReady) {
    addEvidenceLayerCriterion(
      'acceptance_future_duration_assets_auto_discovered',
      'future_duration_asset_rediscovery_gate',
      [
        'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: ready matrix is current snapshot only and not a future asset whitelist',
        'server/src/services/v14AssetAdmissionAutomationService.ts :: auto discovery is the default for new v1.4 assets',
      ],
      {
        writerRefs: uniqueText([
          ...V14223_FUTURE_RERUN_WRITER_REFS,
          ...V14223_ADMISSION_INVENTORY_WRITER_REFS,
        ]),
        consumerRefs: uniqueText([
          ...V14223_FUTURE_RERUN_CONSUMER_REFS,
          ...V14223_ADMISSION_INVENTORY_CONSUMER_REFS,
        ]),
        monitoringRefs: V14223_FUTURE_RERUN_MONITORING_REFS,
        releaseRefs: V14223_FUTURE_RERUN_RELEASE_REFS,
        rollbackRefs: V14223_FUTURE_RERUN_ROLLBACK_REFS,
        oldObjectRefs: uniqueText([
          ...V14223_FUTURE_RERUN_OLD_OBJECT_REFS,
          ...V14223_ADMISSION_INVENTORY_OLD_OBJECT_REFS,
        ]),
      },
    )
  }

  if (inventoryReady && admissionReady) {
    addEvidenceLayerCriterion(
      'acceptance_discovery_review_items_and_blockers_clear_for_phase',
      'current_asset_inventory_admission_snapshot',
      [
        'server/src/services/algorithmRuleAssetInventoryService.ts :: current inventory diagnostics have no duplicate missing seed type or missing capability gaps',
        'server/src/services/v14AssetAdmissionAutomationService.ts :: current admission report has no review items or blockers',
      ],
      {
        writerRefs: V14223_ADMISSION_INVENTORY_WRITER_REFS,
        consumerRefs: V14223_ADMISSION_INVENTORY_CONSUMER_REFS,
        monitoringRefs: V14223_ADMISSION_INVENTORY_MONITORING_REFS,
        releaseRefs: V14223_ADMISSION_INVENTORY_RELEASE_REFS,
        rollbackRefs: V14223_ADMISSION_INVENTORY_ROLLBACK_REFS,
        oldObjectRefs: V14223_ADMISSION_INVENTORY_OLD_OBJECT_REFS,
      },
    )

    addEvidenceLayerCriterion(
      'acceptance_readonly_inventory_routes_are_evidence_layer_only',
      'readonly_rule_asset_inventory_diagnostics_route',
      [
        'server/src/routes/algorithm-seeds.ts :: rule asset diagnostics and catalog admission automation routes are evidence-layer diagnostics',
        'server/src/__tests__/algorithmSeedRoutes.test.ts :: exposes v1.4.22.3 completion audit as a conservative admin-only diagnostic',
      ],
      {
        writerRefs: V14223_ADMISSION_INVENTORY_WRITER_REFS,
        consumerRefs: uniqueText([
          ...V14223_ADMISSION_INVENTORY_CONSUMER_REFS,
          'server/src/__tests__/algorithmSeedRoutes.test.ts :: returns algorithm catalog diagnostics without ordinary frontend exposure',
        ]),
        monitoringRefs: V14223_ADMISSION_INVENTORY_MONITORING_REFS,
        releaseRefs: V14223_ADMISSION_INVENTORY_RELEASE_REFS,
        rollbackRefs: V14223_ADMISSION_INVENTORY_ROLLBACK_REFS,
        oldObjectRefs: V14223_ADMISSION_INVENTORY_OLD_OBJECT_REFS,
      },
    )
  }

  if (admissionReady && rerunReady) {
    addEvidenceLayerCriterion(
      'acceptance_review_items_zero_is_snapshot_only',
      'current_snapshot_admission_zero_review_boundary',
      [
        'server/src/services/v14AssetAdmissionAutomationService.ts :: reviewItems and blockers are current admission snapshot fields',
        'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: fresh rerun must be repeated for new assets or changed asset keys',
      ],
      {
        writerRefs: uniqueText([
          ...V14223_ADMISSION_INVENTORY_WRITER_REFS,
          ...V14223_FUTURE_RERUN_WRITER_REFS,
        ]),
        consumerRefs: uniqueText([
          ...V14223_ADMISSION_INVENTORY_CONSUMER_REFS,
          ...V14223_FUTURE_RERUN_CONSUMER_REFS,
        ]),
        monitoringRefs: uniqueText([
          ...V14223_ADMISSION_INVENTORY_MONITORING_REFS,
          ...V14223_FUTURE_RERUN_MONITORING_REFS,
        ]),
        releaseRefs: uniqueText([
          ...V14223_ADMISSION_INVENTORY_RELEASE_REFS,
          ...V14223_FUTURE_RERUN_RELEASE_REFS,
        ]),
        rollbackRefs: uniqueText([
          ...V14223_ADMISSION_INVENTORY_ROLLBACK_REFS,
          ...V14223_FUTURE_RERUN_ROLLBACK_REFS,
        ]),
        oldObjectRefs: uniqueText([
          ...V14223_ADMISSION_INVENTORY_OLD_OBJECT_REFS,
          ...V14223_FUTURE_RERUN_OLD_OBJECT_REFS,
        ]),
      },
    )
  }

  if (rerunReady) {
    addEvidenceLayerCriterion(
      'acceptance_future_asset_rerun_matrix_ready_is_snapshot_only',
      'future_asset_rediscovery_current_snapshot_matrix',
      [
        'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: future asset rerun matrix is current snapshot only',
        'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts :: confirms the v1.4.22.3 rerun matrix without granting future automatic release rights',
      ],
      {
        writerRefs: V14223_FUTURE_RERUN_WRITER_REFS,
        consumerRefs: V14223_FUTURE_RERUN_CONSUMER_REFS,
        monitoringRefs: V14223_FUTURE_RERUN_MONITORING_REFS,
        releaseRefs: V14223_FUTURE_RERUN_RELEASE_REFS,
        rollbackRefs: V14223_FUTURE_RERUN_ROLLBACK_REFS,
        oldObjectRefs: V14223_FUTURE_RERUN_OLD_OBJECT_REFS,
      },
    )
  }

  if (dtoReady) {
    addEvidenceLayerCriterion(
      'acceptance_ordinary_business_pages_hide_technical_fields',
      'ordinary_business_dto_exposure_boundary',
      [
        'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts :: ordinary business DTO exposure matrix is verified',
        'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts :: confirms the v1.4.22.3 ordinary business DTO exposure evidence matrix',
      ],
      {
        writerRefs: V14223_ORDINARY_DTO_WRITER_REFS,
        consumerRefs: V14223_ORDINARY_DTO_CONSUMER_REFS,
        monitoringRefs: V14223_ORDINARY_DTO_MONITORING_REFS,
        releaseRefs: V14223_ORDINARY_DTO_RELEASE_REFS,
        rollbackRefs: V14223_ORDINARY_DTO_ROLLBACK_REFS,
        oldObjectRefs: V14223_ORDINARY_DTO_OLD_OBJECT_REFS,
      },
    )
  }

  if (dtoReady && legacyTemplateReady && rerunReady) {
    addEvidenceLayerCriterion(
      'acceptance_legacy_scope_fields_blocked',
      'legacy_scope_object_negative_protection_matrix',
      [
        'server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts :: template write surface legacy scope sanitizer matrix is verified',
        'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts :: ordinary business DTO exposure matrix is verified',
        'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts :: old object rescan must rerun for current snapshot',
      ],
      {
        writerRefs: V14223_LEGACY_SCOPE_WRITER_REFS,
        consumerRefs: V14223_LEGACY_SCOPE_CONSUMER_REFS,
        monitoringRefs: V14223_LEGACY_SCOPE_MONITORING_REFS,
        releaseRefs: V14223_LEGACY_SCOPE_RELEASE_REFS,
        rollbackRefs: V14223_LEGACY_SCOPE_ROLLBACK_REFS,
        oldObjectRefs: uniqueText([
          ...V14223_LEGACY_SCOPE_WRITER_REFS,
          ...V14223_LEGACY_SCOPE_CONSUMER_REFS,
          ...V14223_ORDINARY_DTO_OLD_OBJECT_REFS,
          ...V14223_FUTURE_RERUN_OLD_OBJECT_REFS,
        ]),
      },
    )
  }

  const metricProductionReady =
    input.metricProductionSnapshotPublicationRollbackMatrix?.canDeclareMetricProductionSnapshotPublicationRollbackComplete
  const metricConsumerReady =
    input.metricConsumerPathCoverageMatrix?.canDeclareMetricConsumerPathCoverageComplete
  if (metricProductionReady && metricConsumerReady) {
    records.push({
      criterionId: 'acceptance_governance_metrics_registered',
      evidenceRefs: [
        'server/src/services/metricProductionSnapshotPublicationRollbackMatrixService.ts :: metric producer snapshot publication rollback matrix is verified',
        'server/src/services/metricConsumerPathCoverageMatrixService.ts :: metric consumer path matrix is verified',
        'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: section 14 partial asset-instance evidence remains non-completion until every criterion is proven',
      ],
      evidence: {
        assetType: 'metric_runtime_governance',
        scope: 'section_14.acceptance_governance_metrics_registered',
        writerEvidenceRefs: V14223_METRIC_ACCEPTANCE_WRITER_REFS,
        consumerEvidenceRefs: V14223_METRIC_ACCEPTANCE_CONSUMER_REFS,
        monitoringEvidenceRefs: V14223_METRIC_ACCEPTANCE_MONITORING_REFS,
        releaseRecordEvidenceRefs: V14223_METRIC_ACCEPTANCE_RELEASE_REFS,
        rollbackEvidenceRefs: V14223_METRIC_ACCEPTANCE_ROLLBACK_REFS,
        oldObjectHandlingEvidenceRefs: V14223_METRIC_ACCEPTANCE_OLD_OBJECT_REFS,
      },
    })
  }

  return records
}

function missingRecordTemplateReasons(record: V14223CompletionEvidenceRecord) {
  const reasons: string[] = []
  if (record.status !== 'verified') reasons.push('record_verified_status_required')
  if (record.sentenceClassification !== 'current_evidence' && record.sentenceClassification !== 'boundary_rule') {
    reasons.push('record_must_be_current_evidence_or_boundary_rule')
  }
  if (!V14223_COMPLETION_EVIDENCE_FRESHNESS.includes(record.evidenceFreshness)) {
    reasons.push('evidence_freshness_required')
  } else if (record.evidenceFreshness !== 'current_verified') {
    reasons.push(`evidence_freshness_not_current_verified:${record.evidenceFreshness}`)
  }
  if (!V14223_COMPLETION_EVIDENCE_LEVELS.includes(record.evidenceLevel)) {
    reasons.push('evidence_level_required')
  } else if (record.evidenceLevel === 'coverage_mapping_only' || record.evidenceLevel === 'evidence_layer_only') {
    reasons.push(`evidence_level_not_completion_ready:${record.evidenceLevel}`)
  }
  if (
    V14223_RUNTIME_SURFACE_CLOSURE_OPERATION_CLASSIFICATIONS.includes(record.operationClassification)
    && record.evidenceLevel !== 'runtime_operation_evidence'
  ) {
    reasons.push('runtime_operation_evidence_level_required')
  }

  const identity = (record.assetIdentity ?? {}) as Partial<V14223CompletionEvidenceRecord['assetIdentity']>
  if (!hasText(identity.assetKey)) reasons.push('asset_key_required')
  if (!hasText(identity.assetType)) reasons.push('asset_type_required')
  if (!hasText(identity.version)) reasons.push('asset_version_required')
  if (!hasText(identity.scope)) reasons.push('asset_scope_required')
  if (!hasText(identity.targetSurface)) reasons.push('asset_target_surface_required')
  if (!hasText(identity.consumer)) reasons.push('asset_consumer_required')

  const fourField = (record.fourFieldDecision ?? {}) as Partial<V14223CompletionEvidenceRecord['fourFieldDecision']>
  if (!hasText(fourField.learningTarget)) reasons.push('learning_target_required')
  if (!hasText(fourField.learningMaturity)) reasons.push('learning_maturity_required')
  if (!hasText(fourField.publishAnchor)) reasons.push('publish_anchor_required')
  if (!hasText(fourField.automationMaturity)) reasons.push('automation_maturity_required')

  if (!V14223_COMPLETION_OPERATION_CLASSIFICATIONS.includes(record.operationClassification)) {
    reasons.push('operation_classification_required')
  } else if (V14223_COMPLETION_NON_COMPLETION_OPERATION_CLASSIFICATIONS.includes(record.operationClassification)) {
    reasons.push(`operation_classification_not_completion_ready:${record.operationClassification}`)
  }
  if (!hasEveryText(record.currentEvidenceRefs)) reasons.push('current_evidence_refs_required')
  reasons.push(...missingGroundedEvidenceRefReasons(record.currentEvidenceRefs, 'current_evidence_refs'))
  if (!hasEveryText(record.writerEvidenceRefs)) reasons.push('writer_evidence_refs_required')
  reasons.push(...missingGroundedEvidenceRefReasons(record.writerEvidenceRefs, 'writer_evidence_refs'))
  if (!hasEveryText(record.consumerEvidenceRefs)) reasons.push('consumer_evidence_refs_required')
  reasons.push(...missingGroundedEvidenceRefReasons(record.consumerEvidenceRefs, 'consumer_evidence_refs'))
  if (!hasEveryText(record.monitoringEvidenceRefs)) reasons.push('monitoring_evidence_refs_required')
  reasons.push(...missingGroundedEvidenceRefReasons(record.monitoringEvidenceRefs, 'monitoring_evidence_refs'))
  if (!hasEveryText(record.rollbackEvidenceRefs)) reasons.push('rollback_evidence_refs_required')
  reasons.push(...missingGroundedEvidenceRefReasons(record.rollbackEvidenceRefs, 'rollback_evidence_refs'))
  if (!hasEveryText(record.forbiddenPathEvidenceRefs)) reasons.push('forbidden_path_evidence_refs_required')
  reasons.push(...missingGroundedEvidenceRefReasons(record.forbiddenPathEvidenceRefs, 'forbidden_path_evidence_refs'))
  if (!record.oldObjectHandling) {
    reasons.push('old_object_handling_required')
  } else {
    if (!V14223_COMPLETION_OLD_OBJECT_CLASSIFICATIONS.includes(record.oldObjectHandling.classification)) {
      reasons.push('old_object_handling_classification_required')
    }
    if (!hasEveryText(record.oldObjectHandling.evidenceRefs)) reasons.push('old_object_handling_evidence_refs_required')
    reasons.push(...missingGroundedEvidenceRefReasons(
      record.oldObjectHandling.evidenceRefs,
      'old_object_handling_evidence_refs',
    ))
  }
  if ((record.remainingGaps ?? []).length > 0) {
    reasons.push(...record.remainingGaps.map((gap) => `remaining_gap:${gap}`))
  }
  return reasons
}

function resultForSurface(
  surface: V14223CompletionRequirementSurface,
  record: V14223CompletionEvidenceRecord | undefined,
): V14223CompletionAuditRecordResult {
  if (!record) {
    return {
      surface,
      status: 'incomplete',
      missingReasons: [`${surface}_evidence_record_required`],
    }
  }

  const missingReasons = missingRecordTemplateReasons(record)
  return {
    surface,
    status: missingReasons.length > 0 ? 'incomplete' : 'verified',
    missingReasons,
  }
}

function hasRuntimeClosureOperation(record: V14223CompletionEvidenceRecord | undefined) {
  return Boolean(
    record
    && V14223_RUNTIME_SURFACE_CLOSURE_OPERATION_CLASSIFICATIONS.includes(record.operationClassification),
  )
}

function hasNoRuntimeBoundaryRefs(record: V14223CompletionEvidenceRecord | undefined) {
  if (!record) return false
  const refs = [
    ...record.currentEvidenceRefs,
    ...record.writerEvidenceRefs,
    ...record.consumerEvidenceRefs,
    ...record.monitoringEvidenceRefs,
    ...record.rollbackEvidenceRefs,
    ...record.forbiddenPathEvidenceRefs,
    ...(record.oldObjectHandling?.evidenceRefs ?? []),
  ]
  return refs.length > 0 && refs.every((ref) => !V14223_NO_RUNTIME_BOUNDARY_REF_PATTERN.test(ref))
}

function hasRuntimeSurfaceClosureEvidence(
  records: readonly V14223CompletionEvidenceRecord[],
  recordResults: readonly V14223CompletionAuditRecordResult[],
) {
  return V14223_RUNTIME_SURFACE_CLOSURE_REQUIRED_SURFACES.every((surface) => {
    const record = records.find((item) => item.surface === surface)
    const result = recordResults.find((item) => item.surface === surface)
    return result?.status === 'verified'
      && hasRuntimeClosureOperation(record)
      && hasNoRuntimeBoundaryRefs(record)
  })
}

function chooseDeclarationStatus(input: {
  currentSnapshotGatePassed: boolean
  workbenchReady: boolean
  outputTemplateReady: boolean
  runtimeClosurePrerequisitesReady: boolean
  runtimeSurfaceClosureEvidenceReady: boolean
  canDeclareChapterCompletionCandidate: boolean
  canDeclareV14223GovernanceComplete: boolean
}): V14223CompletionDeclarationStatus {
  if (!input.currentSnapshotGatePassed) return 'review_required'
  if (input.canDeclareV14223GovernanceComplete) {
    return 'v14223_governance_complete_current_snapshot'
  }
  if (input.canDeclareChapterCompletionCandidate) return 'chapter_completion_candidate'
  if (
    input.runtimeClosurePrerequisitesReady
    && input.outputTemplateReady
    && input.runtimeSurfaceClosureEvidenceReady
  ) {
    return 'runtime_surface_closed'
  }
  if (input.workbenchReady) return 'evidence_layer_ready'
  if (input.currentSnapshotGatePassed) return 'current_snapshot_gate_passed'
  return 'review_required'
}

export function buildV14223CompletionAudit(input: V14223CompletionAuditInput): V14223CompletionAudit {
  const workbenchReady = input.workbenchReadiness.canDeclareGovernanceWorkbenchComplete
  const requirementCoverageReady = input.requirementCoverageAudit?.status === 'document_requirement_coverage_ready'
  const acceptanceCriteriaReady = input.acceptanceCriteriaAudit?.status === 'acceptance_criteria_coverage_ready'
  const machineExecutionGuardrailReady =
    input.machineExecutionGuardrailAudit?.status === 'machine_execution_guardrail_coverage_ready'
  const hardDecisionTableReady =
    input.hardDecisionTableAudit?.status === 'hard_decision_table_coverage_ready'
  const acceptanceCriteriaCompletionEvidenceLevelReady =
    input.acceptanceCriteriaAudit?.completionEvidenceLevel === 'asset_instance_completion_evidence'
  const acceptanceCriteriaCompletionEvidenceReady =
    acceptanceCriteriaCompletionEvidenceLevelReady
    && input.acceptanceCriteriaAudit?.canUseForChapterCompletionCandidate === true
  const remainingClosureGaps = input.workbenchReadiness.remainingClosureGaps ?? []
  const recordResults = V14223_COMPLETION_REQUIRED_SURFACES.map((surface) =>
    resultForSurface(surface, input.evidenceRecords.find((record) => record.surface === surface)),
  )
  const outputTemplateReady = recordResults.every((record) => record.status === 'verified')
  const incompleteRecordReasons = recordResults.flatMap((record) =>
    record.missingReasons.map((reason) => `${record.surface}:${reason}`),
  )
  const workbenchGateReasons = input.workbenchReadiness.gates
    .filter((gate) => gate.status !== 'ready')
    .flatMap((gate) => gate.missingReasons.map((reason) => `${gate.key}:${reason}`))
  const runtimeSurfaceClosureEvidenceReady = hasRuntimeSurfaceClosureEvidence(input.evidenceRecords, recordResults)
  const runtimeClosurePrerequisitesReady = input.currentSnapshotGatePassed
    && workbenchReady
    && remainingClosureGaps.length === 0
    && input.futureAssetRediscoveryGateRerunComplete
  const runtimeSurfacesClosed = runtimeClosurePrerequisitesReady
    && outputTemplateReady
    && runtimeSurfaceClosureEvidenceReady
  const canDeclareChapterCompletionCandidate = input.currentSnapshotGatePassed
    && runtimeSurfacesClosed
    && requirementCoverageReady
    && acceptanceCriteriaReady
    && acceptanceCriteriaCompletionEvidenceReady
    && machineExecutionGuardrailReady
    && hardDecisionTableReady
  const canDeclareV14223GovernanceComplete = canDeclareChapterCompletionCandidate

  const missingReasons = [
    ...(input.currentSnapshotGatePassed ? [] : ['current_snapshot_gate_rerun_required']),
    ...(workbenchReady ? [] : ['workbench_readiness_gates_must_all_be_ready']),
    ...(requirementCoverageReady ? [] : ['document_requirement_coverage_audit_required']),
    ...(input.requirementCoverageAudit?.missingReasons ?? [])
      .map((reason) => `document_requirement_coverage:${reason}`),
    ...(machineExecutionGuardrailReady ? [] : ['machine_execution_guardrail_audit_required']),
    ...(input.machineExecutionGuardrailAudit?.missingReasons ?? [])
      .map((reason) => `machine_execution_guardrail:${reason}`),
    ...(hardDecisionTableReady ? [] : ['hard_decision_table_audit_required']),
    ...(input.hardDecisionTableAudit?.missingReasons ?? [])
      .map((reason) => `hard_decision_table:${reason}`),
    ...(acceptanceCriteriaReady ? [] : ['section_14_acceptance_criteria_audit_required']),
    ...(acceptanceCriteriaCompletionEvidenceLevelReady
      ? []
      : ['section_14_acceptance_criteria_completion_evidence_level_required']),
    ...(acceptanceCriteriaCompletionEvidenceReady
      ? []
      : ['section_14_acceptance_criteria_completion_evidence_required']),
    ...(input.acceptanceCriteriaAudit?.missingReasons ?? [])
      .map((reason) => `section_14_acceptance_criteria:${reason}`),
    ...workbenchGateReasons,
    ...remainingClosureGaps.map((gap) => `remaining_closure_gap:${gap.key}`),
    ...(input.futureAssetRediscoveryGateRerunComplete ? [] : ['future_asset_rediscovery_gate_rerun_required']),
    ...(runtimeClosurePrerequisitesReady && !runtimeSurfaceClosureEvidenceReady
      ? ['runtime_surface_closure_evidence_required']
      : []),
    ...incompleteRecordReasons,
  ]

  return {
    reportCode: 'v14223_completion_audit',
    declarationStatus: chooseDeclarationStatus({
      currentSnapshotGatePassed: input.currentSnapshotGatePassed,
      workbenchReady,
      outputTemplateReady,
      runtimeClosurePrerequisitesReady,
      runtimeSurfaceClosureEvidenceReady,
      canDeclareChapterCompletionCandidate,
      canDeclareV14223GovernanceComplete,
    }),
    canDeclareChapterCompletionCandidate,
    canDeclareV14223GovernanceComplete,
    missingReasons,
    requiredSurfaces: [...V14223_COMPLETION_REQUIRED_SURFACES],
    recordResults,
    boundaryPolicy: [
      'completion_audit_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_does_not_grant_publish_rights',
      'v14223_governance_complete_current_snapshot_is_not_future_asset_whitelist',
      'workbench_readiness_is_evidence_layer_only',
      'each_required_surface_must_use_v14223_output_template',
      'operation_classification_and_forbidden_paths_are_required_for_completion_audit',
      'runtime_surface_closed_requires_complete_current_output_template',
      'runtime_surface_closed_requires_runtime_closure_operation_evidence',
      'chapter_completion_candidate_requires_document_requirement_coverage_audit',
      'chapter_completion_candidate_requires_machine_execution_guardrail_audit',
      'chapter_completion_candidate_requires_hard_decision_table_audit',
      'chapter_completion_candidate_requires_section_14_acceptance_criteria_audit',
      'chapter_completion_candidate_requires_asset_instance_acceptance_completion_evidence',
      'chapter_completion_candidate_display_is_not_completion_declaration',
      'completion_declaration_is_current_snapshot_governance_only',
      'future_asset_or_llm_candidate_changes_must_rerun_completion_audit',
    ],
  }
}

export function buildV14223CurrentCompletionAudit(
  input: V14223CurrentCompletionAuditInput,
): V14223CompletionAudit {
  const documentHeadings = input.documentHeadings ?? extractCurrentV14223PlanSectionHeadings()
  const documentAcceptanceCriteria = input.documentAcceptanceCriteria ?? extractCurrentV14223AcceptanceCriteria()
  const documentMachineExecutionGuardrails =
    input.documentMachineExecutionGuardrails ?? extractCurrentV14223MachineExecutionGuardrails()
  const documentHardDecisionRows = input.documentHardDecisionRows ?? extractCurrentV14223HardDecisionTableRows()
  const runtimeIsolationMatrix = input.runtimeIsolationMatrix ?? buildV14223RuntimeAssetIsolationMatrix()
  const algorithmRuleAssetInventoryDiagnostics =
    input.algorithmRuleAssetInventoryDiagnostics ?? getAlgorithmRuleAssetInventoryDiagnostics()
  const assetAdmissionAutomationReport =
    input.assetAdmissionAutomationReport ?? evaluateV14AssetAdmissionAutomation()
  const futureAssetRediscoveryGateRerunMatrix =
    input.futureAssetRediscoveryGateRerunMatrix ?? buildV14223FutureAssetRediscoveryGateRerunMatrix()
  const crossScopeReplayEvidenceMatrix =
    input.crossScopeReplayEvidenceMatrix ?? buildV14223CrossScopeReplayEvidenceMatrix()
  const ordinaryBusinessDtoExposureMatrix =
    input.ordinaryBusinessDtoExposureMatrix ?? buildV14223OrdinaryBusinessDtoExposureMatrix()
  const templateWriteSurfaceLegacyScopeSanitizerMatrix =
    input.templateWriteSurfaceLegacyScopeSanitizerMatrix ?? buildV14223TemplateWriteSurfaceLegacyScopeSanitizerMatrix()
  const metricProductionSnapshotPublicationRollbackMatrix =
    input.metricProductionSnapshotPublicationRollbackMatrix
    ?? buildV14223MetricProductionSnapshotPublicationRollbackMatrix()
  const metricConsumerPathCoverageMatrix =
    input.metricConsumerPathCoverageMatrix ?? buildV14223MetricConsumerPathCoverageMatrix()
  const domainReleaseRuntimeClosureMatrix =
    input.domainReleaseRuntimeClosureMatrix ?? buildV14223DomainReleaseRuntimeClosureMatrix()
  const constructionOrganizationPrecisionReplayMatrix =
    input.constructionOrganizationPrecisionReplayMatrix ?? buildConstructionOrganizationPrecisionReplayMatrix()
  const explicitWorkbenchReadiness = input.workbenchReadiness
  const workbenchReadiness = input.workbenchReadiness ?? buildAlgorithmAssetGovernanceWorkbenchReadiness({
    companyId: 'v14223-current-completion-audit',
    inventorySummary: algorithmRuleAssetInventoryDiagnostics.summary,
    admissionStatus: assetAdmissionAutomationReport.status,
    admissionSummary: assetAdmissionAutomationReport.summary,
    reviewItems: assetAdmissionAutomationReport.reviewItems,
    blockers: assetAdmissionAutomationReport.blockers,
    governanceDefaultReviewItems: assetAdmissionAutomationReport.governanceDefaultReviewItems,
    governanceEvidence: {
      candidateEvents: { totalCount: 0, reviewRequiredCount: 0, quarantinedCount: 0, replayReadyCount: 0 },
      replayRuns: { totalCount: 0, passedCount: 0, blockedCount: 0, failedCount: 0 },
      sampleHealth: { totalCount: 0, acceptedCount: 0, weakCount: 0, rejectedCount: 0, benchmarkEligibleCount: 0 },
    },
    backendWorkbenchEvidenceRefs: [
      'GET /api/planning/algorithm-seeds/rule-assets/governance-workbench',
      'GET /api/planning/algorithm-seeds/rule-assets/governance-completion-audit',
      'algorithmAssetGovernanceWorkbenchReadinessService',
      'v14223CompletionAuditService',
    ],
    frontendAdminPageEvidenceRefs: [
      'client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx',
      'client/src/services/ruleAssetGovernanceWorkbenchApi.ts',
      'GET /admin/rule-assets/governance-workbench',
    ],
    ordinaryBusinessDtoExposureMatrix,
    templateWriteSurfaceLegacyScopeSanitizerMatrix,
    metricProductionSnapshotPublicationRollbackMatrix,
    metricConsumerPathCoverageMatrix,
    futureAssetRediscoveryGateRerunMatrix,
    operableGovernanceFrontendMatrix: buildV14223OperableGovernanceFrontendMatrix(),
    domainReleaseRuntimeClosureMatrix,
    crossScopeReplayEvidenceMatrix,
    constructionOrganizationPrecisionReplayMatrix,
    constructionOrganizationRuntimeCloseoutClaim: input.constructionOrganizationRuntimeCloseoutClaim,
    constructionOrganizationProductOutcomeCloseoutMatrix: input.constructionOrganizationProductOutcomeCloseoutMatrix,
    runtimeIsolationMatrix,
    parameterConsumerCoverage: buildCurrentParameterConsumerCoverage(),
    metricSourceCoverage: buildCurrentMetricSourceCoverage(assetAdmissionAutomationReport),
  })

  const requirementCoverageAudit = input.requirementCoverageAudit ?? buildV14223CurrentRequirementCoverageAudit({
    currentSnapshotGatePassed: input.currentSnapshotGatePassed,
    documentHeadings,
  })
  const acceptanceCriteriaAudit = input.acceptanceCriteriaAudit ?? buildV14223CurrentAcceptanceCriteriaAudit({
    currentSnapshotGatePassed: input.currentSnapshotGatePassed,
    documentAcceptanceCriteria,
    assetInstanceCompletionEvidence: buildV14223CurrentAcceptanceAssetInstanceCompletionEvidence({
      domainReleaseRuntimeClosureMatrix,
      runtimeIsolationMatrix,
      algorithmRuleAssetInventoryDiagnostics,
      assetAdmissionAutomationReport,
      futureAssetRediscoveryGateRerunMatrix,
      crossScopeReplayEvidenceMatrix,
      ordinaryBusinessDtoExposureMatrix,
      templateWriteSurfaceLegacyScopeSanitizerMatrix,
      metricProductionSnapshotPublicationRollbackMatrix,
      metricConsumerPathCoverageMatrix,
    }),
  })
  const machineExecutionGuardrailAudit = input.machineExecutionGuardrailAudit
    ?? buildV14223CurrentMachineExecutionGuardrailAudit({
      currentSnapshotGatePassed: input.currentSnapshotGatePassed,
      documentMachineExecutionGuardrails,
    })
  const hardDecisionTableAudit = input.hardDecisionTableAudit
    ?? buildV14223CurrentHardDecisionTableAudit({
      currentSnapshotGatePassed: input.currentSnapshotGatePassed,
      documentHardDecisionRows,
    })
  const effectiveWorkbenchReadiness = explicitWorkbenchReadiness ?? workbenchReadiness
  const allCurrentCompletionPrerequisitesReady = input.currentSnapshotGatePassed
    && effectiveWorkbenchReadiness.canDeclareGovernanceWorkbenchComplete
    && effectiveWorkbenchReadiness.remainingClosureGaps.length === 0
    && (input.futureAssetRediscoveryGateRerunComplete
      ?? futureAssetRediscoveryGateRerunMatrix.canDeclareFutureAssetRediscoveryGateRerunComplete)
    && requirementCoverageAudit.status === 'document_requirement_coverage_ready'
    && acceptanceCriteriaAudit.status === 'acceptance_criteria_coverage_ready'
    && acceptanceCriteriaAudit.completionEvidenceLevel === 'asset_instance_completion_evidence'
    && acceptanceCriteriaAudit.canUseForChapterCompletionCandidate === true
    && machineExecutionGuardrailAudit.status === 'machine_execution_guardrail_coverage_ready'
    && hardDecisionTableAudit.status === 'hard_decision_table_coverage_ready'

  return buildV14223CompletionAudit({
    ...input,
    workbenchReadiness: effectiveWorkbenchReadiness,
    futureAssetRediscoveryGateRerunComplete:
      input.futureAssetRediscoveryGateRerunComplete
      ?? futureAssetRediscoveryGateRerunMatrix.canDeclareFutureAssetRediscoveryGateRerunComplete,
    requirementCoverageAudit,
    acceptanceCriteriaAudit,
    machineExecutionGuardrailAudit,
    hardDecisionTableAudit,
    evidenceRecords: buildV14223CurrentCompletionEvidenceRecords({
      domainReleaseRuntimeClosureMatrix,
      allCurrentCompletionPrerequisitesReady,
    }),
  })
}
