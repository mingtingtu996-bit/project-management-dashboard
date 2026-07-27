import type { ConstructionOrganizationScenarioSelection } from './constructionOrganizationScenarioSelector.js'
import {
  type DurationAlgorithmHydratableInput,
  type DurationAlgorithmHydrationPurpose,
  hydrateDurationAlgorithmInput,
} from './durationAlgorithmInputHydrationService.js'
import type { ExperienceTier } from './experienceTierRegistryService.js'
import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import type { T2RhythmProductionCapacityEvidence } from './t2RhythmProductionCapacityEvidenceService.js'
import type { T2RhythmScheduleCandidateNetwork } from './t2RhythmScheduleCandidateNetworkService.js'
import type { T2RhythmScheduleCandidateNetworkPhase1Evaluation } from './t2RhythmScheduleCandidateNetworkEvaluationService.js'
import type { T2RhythmSchedulePhase1Selection } from './t2RhythmSchedulePhase1SelectionService.js'
import type { T2RhythmStandardLibraryTrustGate } from './t2RhythmStandardLibraryTrustGateService.js'
import {
  summarizeDurationAssetConsumption,
  type DurationAssetConsumptionReceipt,
  type DurationAssetConsumptionSummary,
} from './durationAssetConsumptionReceiptService.js'

export type DurationInputChannelName =
  | 'projectGenerationFacts'
  | 'constructionOrganizationScenario'
  | 'actualExecutionFacts'
  | 'durationExperienceSignals'
  | 'criticalPathEvidence'
  | 't2RhythmScheduleCandidatePackage'
  | 't2RhythmProductionCapacityEvidence'
  | 't2RhythmScheduleCandidateNetwork'
  | 't2RhythmScheduleCandidateNetworkEvaluation'
  | 't2RhythmSchedulePhase1Selection'
  | 't2RhythmStandardLibraryTrustGate'

export type DurationInputChannelSource = 'explicit_input' | 'project_metadata' | 'missing'

export type DurationInputChannelStatus = 'ready' | 'missing' | 'candidate_conflict'

export type DurationInputChannelSummary = {
  source: DurationInputChannelSource
  status: DurationInputChannelStatus
  tier?: ExperienceTier
  candidateId?: string
  selectedTemplateIds?: string[]
  selectionReceiptCount?: number
  selectorReceiptAuditStatus?: 'ready' | 'missing'
  assetSource?: string
  canTrustForRealScheduleCalibration?: boolean
  trustBoundary?: T2RhythmStandardLibraryTrustGate['trustBoundary']
}

export type DurationInputSourceLineage = DurationInputChannelSummary & {
  channel: DurationInputChannelName
}

export type DurationInputAssemblyGate = {
  status: 'compatible_candidate' | 'candidate_conflict' | 'not_applicable'
  canEnterC1913Phase1Selection: boolean
  requiresManualReview: boolean
  canWriteTaskDependencies: false
  canWritePlanDates: false
  priorityOverrideBlocked: boolean
  conflictCodes: string[]
  productionCapacityEvidenceStatus: T2RhythmProductionCapacityEvidence['status'] | null
  productionCapacityMissingEvidenceCodes: string[]
  standardLibraryTrustGateStatus: T2RhythmStandardLibraryTrustGate['status'] | 'missing' | null
  standardLibraryTrustBoundary: T2RhythmStandardLibraryTrustGate['trustBoundary'] | null
  standardLibraryTrustBlockingReasons: string[]
}

export type DurationInputMutationBoundary = {
  writesTaskDependencies: false
  writesPlanDates: false
  writesCriticalPathFacts: false
  writesSeed: false
  writesBaseline: false
  writesRuntimePublications: false
}

export type DurationInputAssemblerInput = DurationAlgorithmHydratableInput & {
  assetConsumptionReceipts?: DurationAssetConsumptionReceipt[] | null
}

export type DurationInputAssemblerResult<T extends DurationInputAssemblerInput> = T & {
  projectGenerationFacts?: Record<string, unknown> | null
  constructionOrganizationScenario?: ConstructionOrganizationScenarioSelection | null
  actualExecutionFacts?: Record<string, unknown> | null
  durationExperienceSignals?: Record<string, unknown> | null
  criticalPathEvidence?: Record<string, unknown> | null
  t2RhythmScheduleCandidatePackage?: T2RhythmScheduleCandidatePackage | null
  t2RhythmProductionCapacityEvidence?: T2RhythmProductionCapacityEvidence | null
  t2RhythmScheduleCandidateNetwork?: T2RhythmScheduleCandidateNetwork | null
  t2RhythmScheduleCandidateNetworkEvaluation?: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null
  t2RhythmSchedulePhase1Selection?: T2RhythmSchedulePhase1Selection | null
  t2RhythmStandardLibraryTrustGate?: T2RhythmStandardLibraryTrustGate | null
  inputChannels: Record<DurationInputChannelName, DurationInputChannelSummary>
  sourceLineage: DurationInputSourceLineage[]
  assemblyGate: DurationInputAssemblyGate
  assetConsumptionReceipts: DurationAssetConsumptionReceipt[]
  assetConsumptionSummary: DurationAssetConsumptionSummary
  mutationBoundary: DurationInputMutationBoundary
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stripTemplateAssetsFromFacts(value: unknown) {
  const facts = { ...readRecord(value) }
  delete facts.t2RhythmScheduleCandidatePackage
  delete facts.t2_rhythm_schedule_candidate_package
  delete facts.t2RhythmProductionCapacityEvidence
  delete facts.t2_rhythm_production_capacity_evidence
  delete facts.t2RhythmScheduleCandidateNetwork
  delete facts.t2_rhythm_schedule_candidate_network
  delete facts.t2RhythmScheduleCandidateNetworkEvaluation
  delete facts.t2_rhythm_schedule_candidate_network_evaluation
  delete facts.t2_rhythm_schedule_candidate_network_phase1_evaluation
  delete facts.t2RhythmSchedulePhase1Selection
  delete facts.t2_rhythm_schedule_phase1_selection
  delete facts.t2RhythmStandardLibraryTrustGate
  delete facts.t2_rhythm_standard_library_trust_gate
  delete facts.t2_rhythm_standard_library_live_replay_trust_gate
  delete facts.actualExecutionFacts
  delete facts.actual_execution_facts
  delete facts.durationExperienceSignals
  delete facts.duration_experience_signals
  delete facts.criticalPathEvidence
  delete facts.critical_path_evidence
  return facts
}

function hasFacts(value: unknown) {
  return Object.keys(stripTemplateAssetsFromFacts(value)).length > 0
}

function sourceFor<T>(
  original: T | null | undefined,
  assembled: T | null | undefined,
  isValid: (value: T | null | undefined) => boolean,
): DurationInputChannelSource {
  if (isValid(original)) return 'explicit_input'
  if (isValid(assembled)) return 'project_metadata'
  return 'missing'
}

function isConstructionOrganizationScenario(value: unknown): value is ConstructionOrganizationScenarioSelection {
  return readRecord(value).source === 'construction_organization_scenario_selector'
}

function isT2Package(value: unknown): value is T2RhythmScheduleCandidatePackage {
  return readRecord(value).source === 't2_division_rhythm_schedule_candidate_package'
}

function isT2ProductionCapacityEvidence(value: unknown): value is T2RhythmProductionCapacityEvidence {
  return readRecord(value).source === 't2_rhythm_production_capacity_evidence'
}

function isT2Network(value: unknown): value is T2RhythmScheduleCandidateNetwork {
  return readRecord(value).source === 't2_rhythm_schedule_candidate_network'
}

function isT2Evaluation(value: unknown): value is T2RhythmScheduleCandidateNetworkPhase1Evaluation {
  return readRecord(value).source === 't2_rhythm_schedule_candidate_network_phase1_evaluation'
}

function isT2Phase1Selection(value: unknown): value is T2RhythmSchedulePhase1Selection {
  return readRecord(value).source === 't2_rhythm_schedule_phase1_selection'
}

function isT2StandardLibraryTrustGate(value: unknown): value is T2RhythmStandardLibraryTrustGate {
  return readRecord(value).source === 't2_rhythm_standard_library_live_replay_trust_gate'
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return Object.keys(readRecord(value)).length > 0
}

function isDurationAssetConsumptionReceipt(value: unknown): value is DurationAssetConsumptionReceipt {
  const candidate = readRecord(value)
  return typeof candidate.consumer === 'string'
    && typeof candidate.assetType === 'string'
    && typeof candidate.stableCode === 'string'
    && typeof candidate.role === 'string'
    && typeof candidate.effectiveSource === 'string'
    && typeof candidate.status === 'string'
    && Array.isArray(candidate.changedFields)
    && Array.isArray(candidate.targetRowIds)
    && Array.isArray(candidate.reasonCodes)
}

function readProjectAssetConsumptionReceipts(projectGenerationFacts: Record<string, unknown>) {
  const candidates = [
    projectGenerationFacts.wizard_generation_duration_asset_consumption_receipts,
    projectGenerationFacts.durationAssetConsumptionReceipts,
    projectGenerationFacts.duration_asset_consumption_receipts,
  ]
  const selected = candidates.find(Array.isArray)
  return Array.isArray(selected)
    ? selected.filter(isDurationAssetConsumptionReceipt)
    : []
}

function normalizeExperienceTier(value: unknown): ExperienceTier | undefined {
  const tier = String(value ?? '').trim().toUpperCase()
  return tier === 'T1' || tier === 'T2' || tier === 'T3' ? tier : undefined
}

function statusFromT2Status(value: { status?: string } | null | undefined): DurationInputChannelStatus {
  if (!value) return 'missing'
  return value.status === 'candidate_conflict' ? 'candidate_conflict' : 'ready'
}

function buildProjectFactsChannel(
  source: DurationInputChannelSource,
  facts: Record<string, unknown>,
): DurationInputChannelSummary {
  return {
    source,
    status: Object.keys(facts).length > 0 ? 'ready' : 'missing',
  }
}

function buildConstructionOrganizationChannel(
  source: DurationInputChannelSource,
  scenario: ConstructionOrganizationScenarioSelection | null | undefined,
): DurationInputChannelSummary {
  return {
    source,
    status: scenario ? 'ready' : 'missing',
    assetSource: scenario?.source,
  }
}

function buildRecordChannel(
  source: DurationInputChannelSource,
  record: Record<string, unknown> | null | undefined,
): DurationInputChannelSummary {
  const facts = readRecord(record)
  return {
    source,
    status: Object.keys(facts).length > 0 ? 'ready' : 'missing',
    assetSource: typeof facts.source === 'string' ? facts.source : undefined,
  }
}

function buildDurationExperienceSignalsChannel(
  source: DurationInputChannelSource,
  record: Record<string, unknown> | null | undefined,
): DurationInputChannelSummary {
  const facts = readRecord(record)
  return {
    ...buildRecordChannel(source, record),
    tier: normalizeExperienceTier(facts.experienceTier ?? facts.tier),
  }
}

function buildT2PackageChannel(
  source: DurationInputChannelSource,
  candidatePackage: T2RhythmScheduleCandidatePackage | null | undefined,
): DurationInputChannelSummary {
  const selectionReceipts = Array.isArray(candidatePackage?.selectionReceipts)
    ? candidatePackage.selectionReceipts
    : []
  const selectedTemplateIds = Array.isArray(candidatePackage?.selectedTemplateIds)
    ? candidatePackage.selectedTemplateIds
    : []
  const selectionReceiptCount = candidatePackage ? selectionReceipts.length : undefined
  const selectorReceiptAuditStatus = candidatePackage
    ? (
        selectionReceipts.length > 0
        && selectionReceipts.length === selectedTemplateIds.length
        && selectionReceipts.every((receipt) => (
          receipt.selectorPurity.allExplicitDimensionsMatched
          && receipt.selectorPurity.noT1T3Leakage
        ))
      )
        ? 'ready'
        : 'missing'
    : undefined
  return {
    source,
    status: statusFromT2Status(candidatePackage),
    tier: candidatePackage ? 'T2' : undefined,
    selectedTemplateIds,
    ...(selectionReceiptCount != null ? { selectionReceiptCount } : {}),
    ...(selectorReceiptAuditStatus ? { selectorReceiptAuditStatus } : {}),
    assetSource: candidatePackage?.source,
  }
}

function statusFromT2ProductionCapacityEvidence(
  value: T2RhythmProductionCapacityEvidence | null | undefined,
): DurationInputChannelStatus {
  if (!value) return 'missing'
  return value.status === 'ready' ? 'ready' : 'candidate_conflict'
}

function buildT2ProductionCapacityEvidenceChannel(
  source: DurationInputChannelSource,
  evidence: T2RhythmProductionCapacityEvidence | null | undefined,
): DurationInputChannelSummary {
  return {
    source,
    status: statusFromT2ProductionCapacityEvidence(evidence),
    tier: evidence ? 'T2' : undefined,
    assetSource: evidence?.source,
  }
}

function buildT2NetworkChannel(
  source: DurationInputChannelSource,
  network: T2RhythmScheduleCandidateNetwork | null | undefined,
): DurationInputChannelSummary {
  return {
    source,
    status: statusFromT2Status(network),
    tier: network ? 'T2' : undefined,
    candidateId: network?.candidateId,
    selectedTemplateIds: network?.selectedTemplateIds ?? [],
    ...(network ? { selectionReceiptCount: network.scheduleTrustEvidence.selectionReceiptCount } : {}),
    ...(network ? { selectorReceiptAuditStatus: network.scheduleTrustEvidence.selectorReceiptAuditStatus } : {}),
    assetSource: network?.source,
  }
}

function buildT2EvaluationChannel(
  source: DurationInputChannelSource,
  evaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null | undefined,
): DurationInputChannelSummary {
  return {
    source,
    status: statusFromT2Status(evaluation),
    tier: evaluation ? 'T2' : undefined,
    candidateId: evaluation?.candidateId,
    selectedTemplateIds: evaluation?.scheduleTrustEvidence?.selectedTemplateIds ?? [],
    ...(evaluation ? { selectionReceiptCount: evaluation.scheduleTrustEvidence.selectionReceiptCount } : {}),
    ...(evaluation ? { selectorReceiptAuditStatus: evaluation.scheduleTrustEvidence.selectorReceiptAuditStatus } : {}),
    assetSource: evaluation?.source,
  }
}

function buildT2Phase1SelectionChannel(
  source: DurationInputChannelSource,
  selection: T2RhythmSchedulePhase1Selection | null | undefined,
): DurationInputChannelSummary {
  return {
    source,
    status: selection
      ? selection.status === 'phase1_selection_ready' ? 'ready' : 'candidate_conflict'
      : 'missing',
    tier: selection ? 'T2' : undefined,
    candidateId: selection?.selectedCandidateId ?? undefined,
    assetSource: selection?.source,
  }
}

function buildT2StandardLibraryTrustGateChannel(
  source: DurationInputChannelSource,
  trustGate: T2RhythmStandardLibraryTrustGate | null | undefined,
): DurationInputChannelSummary {
  const trusted = trustGate?.canTrustForRealScheduleCalibration === true
    && trustGate.status === 'shadow_replay_ready_not_publishable'
  return {
    source,
    status: trustGate
      ? trusted ? 'ready' : 'candidate_conflict'
      : 'missing',
    tier: trustGate ? 'T2' : undefined,
    assetSource: trustGate?.source,
    ...(trustGate
      ? {
          canTrustForRealScheduleCalibration: trustGate.canTrustForRealScheduleCalibration,
          trustBoundary: trustGate.trustBoundary,
        }
      : {}),
  }
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function buildAssemblyGate(
  candidatePackage: T2RhythmScheduleCandidatePackage | null | undefined,
  productionCapacityEvidence: T2RhythmProductionCapacityEvidence | null | undefined,
  network: T2RhythmScheduleCandidateNetwork | null | undefined,
  evaluation: T2RhythmScheduleCandidateNetworkPhase1Evaluation | null | undefined,
  phase1Selection: T2RhythmSchedulePhase1Selection | null | undefined,
  standardLibraryTrustGate: T2RhythmStandardLibraryTrustGate | null | undefined,
): DurationInputAssemblyGate {
  if (!candidatePackage && !network && !evaluation && !phase1Selection && !standardLibraryTrustGate) {
    return {
      status: 'not_applicable',
      canEnterC1913Phase1Selection: false,
      requiresManualReview: false,
      canWriteTaskDependencies: false,
      canWritePlanDates: false,
      priorityOverrideBlocked: false,
      conflictCodes: [],
      productionCapacityEvidenceStatus: null,
      productionCapacityMissingEvidenceCodes: [],
      standardLibraryTrustGateStatus: null,
      standardLibraryTrustBoundary: null,
      standardLibraryTrustBlockingReasons: [],
    }
  }

  const productionCapacityEvidenceStatus = (
    candidatePackage || network || evaluation || phase1Selection
      ? productionCapacityEvidence?.status ?? null
      : null
  )
  const hasT2ScheduleAssets = Boolean(candidatePackage || network || evaluation || phase1Selection)
  const productionCapacityEvidenceMissing = hasT2ScheduleAssets && !productionCapacityEvidence
  const productionCapacityMissingEvidenceCodes = unique([
    ...(productionCapacityEvidence?.missingEvidenceCodes ?? []),
    ...(productionCapacityEvidenceMissing ? ['production_capacity_evidence_missing'] : []),
  ])
  const productionCapacityConflictCodes = (
    productionCapacityEvidenceMissing
    || (productionCapacityEvidence && productionCapacityEvidence.status !== 'ready')
  )
    ? ['production_capacity_evidence_missing']
    : []
  const standardLibraryTrustGateStatus = standardLibraryTrustGate?.status ?? null
  const standardLibraryTrustGateMissing = hasT2ScheduleAssets && !standardLibraryTrustGate
  const standardLibraryTrustBoundary = standardLibraryTrustGate?.trustBoundary
    ?? (standardLibraryTrustGateMissing ? 'blocked_live_replay_evidence' : null)
  const standardLibraryTrustBlockingReasons = standardLibraryTrustGate?.blockingReasons
    ?? (standardLibraryTrustGateMissing
      ? ['t2_standard_library_live_replay_trust_gate_missing', 'archived_live_replay_required']
      : [])
  const standardLibraryTrustGateTrusted = standardLibraryTrustGate
    ? standardLibraryTrustGate.canTrustForRealScheduleCalibration === true
      && standardLibraryTrustGate.status === 'shadow_replay_ready_not_publishable'
    : !hasT2ScheduleAssets
  const standardLibraryTrustConflictCodes = hasT2ScheduleAssets
    && !standardLibraryTrustGateTrusted
    ? [
        standardLibraryTrustGate
          ? 't2_standard_library_live_replay_not_trustworthy'
          : 't2_standard_library_live_replay_trust_gate_missing',
      ]
    : []
  const phase1SelectionCandidateMismatch = Boolean(
    phase1Selection?.status === 'phase1_selection_ready'
    && evaluation
    && phase1Selection.selectedCandidateId
    && phase1Selection.selectedCandidateId !== evaluation.candidateId,
  )
  const conflictCodes = unique([
    ...(candidatePackage?.compatibility?.conflicts ?? []).map((conflict) => conflict.conflictCode),
    ...(network?.conflictSummary?.conflictCodes ?? []),
    ...(evaluation?.conflictSummary?.conflictCodes ?? []),
    ...(phase1Selection?.rejectedCandidates ?? []).flatMap((candidate) => candidate.conflictCodes),
    ...productionCapacityConflictCodes,
    ...standardLibraryTrustConflictCodes,
    ...(phase1SelectionCandidateMismatch ? ['phase1_selection_candidate_mismatch'] : []),
  ])
  const priorityOverrideBlocked = Boolean(
    candidatePackage?.compatibility?.priorityAdjudication?.priorityOverrideBlocked
    || network?.conflictSummary?.priorityOverrideBlocked
    || evaluation?.conflictSummary?.priorityOverrideBlocked
    || (phase1Selection?.rejectedCandidates ?? []).some((candidate) => candidate.priorityOverrideBlocked),
  )
  const canEnterC1913Phase1Selection = Boolean(
    candidatePackage?.status === 'schedulable_candidate'
    && network?.status === 'schedulable_network_candidate'
    && network.canEnterC1913Phase1Selection
    && evaluation?.status === 'phase1_readonly_evaluation_ready'
    && evaluation.canEnterC1913Phase1Selection
    && phase1Selection?.status === 'phase1_selection_ready'
    && phase1Selection.selectedCandidateId === evaluation.candidateId
    && phase1Selection.combinationConsistencyGate.status !== 'blocked'
    && productionCapacityEvidence?.status === 'ready'
    && standardLibraryTrustGateTrusted
    && conflictCodes.length === 0,
  )

  return {
    status: canEnterC1913Phase1Selection ? 'compatible_candidate' : 'candidate_conflict',
    canEnterC1913Phase1Selection,
    requiresManualReview: !canEnterC1913Phase1Selection,
    canWriteTaskDependencies: false,
    canWritePlanDates: false,
    priorityOverrideBlocked,
    conflictCodes,
    productionCapacityEvidenceStatus,
    productionCapacityMissingEvidenceCodes,
    standardLibraryTrustGateStatus: standardLibraryTrustGateStatus ?? (standardLibraryTrustGateMissing ? 'missing' : null),
    standardLibraryTrustBoundary,
    standardLibraryTrustBlockingReasons,
  }
}

function buildSourceLineage(inputChannels: Record<DurationInputChannelName, DurationInputChannelSummary>) {
  return (Object.entries(inputChannels) as Array<[DurationInputChannelName, DurationInputChannelSummary]>)
    .filter(([, channel]) => channel.status !== 'missing')
    .map(([channel, summary]) => ({
      channel,
      ...summary,
    }))
}

export async function assembleDurationInput<T extends DurationInputAssemblerInput>(
  input: T,
  options: {
    purpose?: DurationAlgorithmHydrationPurpose
    allowLiveProjectReread?: boolean
  } = {},
): Promise<DurationInputAssemblerResult<T>> {
  const hydrated = await hydrateDurationAlgorithmInput(input, options)
  const projectGenerationFacts = stripTemplateAssetsFromFacts(hydrated.projectGenerationFacts)
  const constructionOrganizationScenario = hydrated.constructionOrganizationScenario ?? null
  const actualExecutionFacts = hydrated.actualExecutionFacts ?? null
  const durationExperienceSignals = hydrated.durationExperienceSignals ?? null
  const criticalPathEvidence = hydrated.criticalPathEvidence ?? null
  const t2RhythmScheduleCandidatePackage = hydrated.t2RhythmScheduleCandidatePackage ?? null
  const t2RhythmProductionCapacityEvidence = hydrated.t2RhythmProductionCapacityEvidence ?? null
  const t2RhythmScheduleCandidateNetwork = hydrated.t2RhythmScheduleCandidateNetwork ?? null
  const t2RhythmScheduleCandidateNetworkEvaluation = hydrated.t2RhythmScheduleCandidateNetworkEvaluation ?? null
  const t2RhythmSchedulePhase1Selection = hydrated.t2RhythmSchedulePhase1Selection ?? null
  const t2RhythmStandardLibraryTrustGate = hydrated.t2RhythmStandardLibraryTrustGate ?? null
  const assetConsumptionReceipts = Array.isArray(input.assetConsumptionReceipts)
    ? input.assetConsumptionReceipts
    : readProjectAssetConsumptionReceipts(projectGenerationFacts)

  const inputChannels: Record<DurationInputChannelName, DurationInputChannelSummary> = {
    projectGenerationFacts: buildProjectFactsChannel(
      hasFacts(input.projectGenerationFacts) ? 'explicit_input' : Object.keys(projectGenerationFacts).length > 0 ? 'project_metadata' : 'missing',
      projectGenerationFacts,
    ),
    constructionOrganizationScenario: buildConstructionOrganizationChannel(
      sourceFor(input.constructionOrganizationScenario, constructionOrganizationScenario, isConstructionOrganizationScenario),
      constructionOrganizationScenario,
    ),
    actualExecutionFacts: buildRecordChannel(
      sourceFor(input.actualExecutionFacts, actualExecutionFacts, isNonEmptyRecord),
      actualExecutionFacts,
    ),
    durationExperienceSignals: buildDurationExperienceSignalsChannel(
      sourceFor(input.durationExperienceSignals, durationExperienceSignals, isNonEmptyRecord),
      durationExperienceSignals,
    ),
    criticalPathEvidence: buildRecordChannel(
      sourceFor(input.criticalPathEvidence, criticalPathEvidence, isNonEmptyRecord),
      criticalPathEvidence,
    ),
    t2RhythmScheduleCandidatePackage: buildT2PackageChannel(
      sourceFor(input.t2RhythmScheduleCandidatePackage, t2RhythmScheduleCandidatePackage, isT2Package),
      t2RhythmScheduleCandidatePackage,
    ),
    t2RhythmProductionCapacityEvidence: buildT2ProductionCapacityEvidenceChannel(
      sourceFor(input.t2RhythmProductionCapacityEvidence, t2RhythmProductionCapacityEvidence, isT2ProductionCapacityEvidence),
      t2RhythmProductionCapacityEvidence,
    ),
    t2RhythmScheduleCandidateNetwork: buildT2NetworkChannel(
      sourceFor(input.t2RhythmScheduleCandidateNetwork, t2RhythmScheduleCandidateNetwork, isT2Network),
      t2RhythmScheduleCandidateNetwork,
    ),
    t2RhythmScheduleCandidateNetworkEvaluation: buildT2EvaluationChannel(
      sourceFor(input.t2RhythmScheduleCandidateNetworkEvaluation, t2RhythmScheduleCandidateNetworkEvaluation, isT2Evaluation),
      t2RhythmScheduleCandidateNetworkEvaluation,
    ),
    t2RhythmSchedulePhase1Selection: buildT2Phase1SelectionChannel(
      sourceFor(input.t2RhythmSchedulePhase1Selection, t2RhythmSchedulePhase1Selection, isT2Phase1Selection),
      t2RhythmSchedulePhase1Selection,
    ),
    t2RhythmStandardLibraryTrustGate: buildT2StandardLibraryTrustGateChannel(
      sourceFor(input.t2RhythmStandardLibraryTrustGate, t2RhythmStandardLibraryTrustGate, isT2StandardLibraryTrustGate),
      t2RhythmStandardLibraryTrustGate,
    ),
  }

  return {
    ...hydrated,
    projectGenerationFacts,
    ...(constructionOrganizationScenario ? { constructionOrganizationScenario } : {}),
    ...(actualExecutionFacts ? { actualExecutionFacts } : {}),
    ...(durationExperienceSignals ? { durationExperienceSignals } : {}),
    ...(criticalPathEvidence ? { criticalPathEvidence } : {}),
    ...(t2RhythmScheduleCandidatePackage ? { t2RhythmScheduleCandidatePackage } : {}),
    ...(t2RhythmProductionCapacityEvidence ? { t2RhythmProductionCapacityEvidence } : {}),
    ...(t2RhythmScheduleCandidateNetwork ? { t2RhythmScheduleCandidateNetwork } : {}),
    ...(t2RhythmScheduleCandidateNetworkEvaluation ? { t2RhythmScheduleCandidateNetworkEvaluation } : {}),
    ...(t2RhythmSchedulePhase1Selection ? { t2RhythmSchedulePhase1Selection } : {}),
    ...(t2RhythmStandardLibraryTrustGate ? { t2RhythmStandardLibraryTrustGate } : {}),
    inputChannels,
    sourceLineage: buildSourceLineage(inputChannels),
    assemblyGate: buildAssemblyGate(
      t2RhythmScheduleCandidatePackage,
      t2RhythmProductionCapacityEvidence,
      t2RhythmScheduleCandidateNetwork,
      t2RhythmScheduleCandidateNetworkEvaluation,
      t2RhythmSchedulePhase1Selection,
      t2RhythmStandardLibraryTrustGate,
    ),
    assetConsumptionReceipts,
    assetConsumptionSummary: summarizeDurationAssetConsumption(assetConsumptionReceipts),
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
      writesRuntimePublications: false,
    },
  }
}
