import type { T2RhythmScheduleCandidatePackage } from './t2DivisionRhythmTemplateRegistryService.js'
import {
  buildT2RhythmProductionCapacityCoverage,
  type T2RhythmProductionCapacity,
  type T2RhythmProductionCapacityCoverage,
  type T2RhythmProductionCapacityEvidence,
} from './t2RhythmProductionCapacityEvidenceService.js'
import {
  checkTemplateAssemblyCompatibility,
  type TemplateAssemblyCompatibilityInput,
  type TemplateAssemblyCompatibilityReceipt,
  type TemplateAssemblyCompatibilityResult,
} from './templateAssemblyCompatibilityCheckService.js'

export type T2RhythmScheduleCandidateNetworkInput = {
  candidateId: string
  candidatePackage: T2RhythmScheduleCandidatePackage
  constructionOrganization?: TemplateAssemblyCompatibilityInput['constructionOrganization']
  productionCapacity?: TemplateAssemblyCompatibilityInput['productionCapacity']
  productionCapacityEvidence?: T2RhythmProductionCapacityEvidence | null
  priorityAdjudication?: TemplateAssemblyCompatibilityInput['priorityAdjudication']
}

export type T2RhythmScheduleCandidateNetworkNode = {
  nodeId: string
  templateId: string
  windowCode: string
  role: string
  startDay: number
  finishDay: number
  durationDays: number
  durationSource: 'parent_package_rhythm_window'
  tier: 'T2'
  confidence: T2RhythmScheduleCandidatePackage['packageWindows'][number]['confidence']
  durationBearing: boolean
  autoApply: false
}

export type T2RhythmScheduleCandidateNetworkEdge = {
  edgeId: string
  sourceTemplateId: string
  predecessorNodeId: string
  successorNodeId: string
  predecessorWindowCode: string
  successorWindowCode: string
  relation: 'FS' | 'SS' | 'FF'
  lagDays: number
  mandatory: boolean
  edgeType: T2RhythmScheduleCandidatePackage['dependencyCandidates'][number]['edgeType']
  tier: 'T2'
  autoApply: false
}

export type T2RhythmScheduleCandidateNetworkGate = T2RhythmScheduleCandidatePackage['hardGates'][number] & {
  nodeIds: string[]
}

export type T2RhythmScheduleCandidateNetwork = {
  source: 't2_rhythm_schedule_candidate_network'
  candidateId: string
  tier: 'T2'
  status: 'schedulable_network_candidate' | 'candidate_conflict' | 'no_template_match'
  canEnterC1913Phase1Selection: boolean
  requiresManualReview: boolean
  selectedTemplateIds: string[]
  selectionReceipts: T2RhythmScheduleCandidatePackage['selectionReceipts']
  nodes: T2RhythmScheduleCandidateNetworkNode[]
  edges: T2RhythmScheduleCandidateNetworkEdge[]
  gates: T2RhythmScheduleCandidateNetworkGate[]
  assemblyCompatibility: TemplateAssemblyCompatibilityResult
  templateAssemblyCompatibilityReceipt: TemplateAssemblyCompatibilityReceipt
  productionCapacityEvidence: T2RhythmProductionCapacityEvidence | null
  conflictSummary: {
    conflictCount: number
    conflictCodes: string[]
    priorityOverrideBlocked: boolean
  }
  selectionCoverage: T2RhythmScheduleCandidatePackage['selectionCoverage']
  scheduleTrustEvidence: {
    selectedTemplateIds: string[]
    durationBearingNodeCount: number
    dependencyEdgeCount: number
    hardGateCount: number
    criticalPathRoles: string[]
    durationDrivers: string[]
    workfaceReadinessSignals: string[]
    assemblyRiskTags: string[]
    compatibilityStatus: TemplateAssemblyCompatibilityResult['status']
    replayRequiredBeforePublish: true
    standardLibraryReadinessStatus: T2RhythmScheduleCandidatePackage['standardLibraryReadiness']['status']
    standardLibraryPrecisionStatus: T2RhythmScheduleCandidatePackage['standardLibraryReadiness']['precisionStatus']
    standardLibraryBreadthStatus: T2RhythmScheduleCandidatePackage['standardLibraryReadiness']['breadthStatus']
    standardLibraryDepthStatus: T2RhythmScheduleCandidatePackage['standardLibraryReadiness']['depthStatus']
    standardLibraryTrustGateStatus: NonNullable<T2RhythmScheduleCandidatePackage['standardLibraryReadiness']['liveReplayTrustGate']>['status'] | 'missing'
    standardLibraryTrustBoundary: NonNullable<T2RhythmScheduleCandidatePackage['standardLibraryReadiness']['liveReplayTrustGate']>['trustBoundary'] | null
    canTrustForRealScheduleCalibration: boolean
    standardLibraryTrustGateReleaseBlockers: string[]
    selectionCoverageStatus: T2RhythmScheduleCandidatePackage['selectionCoverage']['status']
    selectionCoverageGapReasons: string[]
    selectionReceiptCount: number
    selectorReceiptAuditStatus: 'ready' | 'missing'
    productionFeasibility: {
      calendarBasis: 'working_day'
      workfaceUnits: string[]
      minimumParallelWorkfaces: number
      recommendedCrewStreams: number
      resourceReadinessSignals: string[]
      calendarConstraintSignals: string[]
      capacityRiskTags: string[]
    }
    productionCapacityCoverage: T2RhythmProductionCapacityCoverage
    releaseBlockers: string[]
  }
  standardLibraryReadiness: T2RhythmScheduleCandidatePackage['standardLibraryReadiness']
  mutationBoundary: {
    writesTaskDependencies: false
    writesPlanDates: false
    writesCriticalPathFacts: false
    writesSeed: false
    writesBaseline: false
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

function nodeIdForWindow(templateId: string, windowCode: string) {
  return `${templateId}::${windowCode}`
}

function buildNodes(candidatePackage: T2RhythmScheduleCandidatePackage): T2RhythmScheduleCandidateNetworkNode[] {
  return candidatePackage.packageWindows.map((window) => ({
    nodeId: nodeIdForWindow(window.templateId, window.windowCode),
    templateId: window.templateId,
    windowCode: window.windowCode,
    role: window.role,
    startDay: window.startDay,
    finishDay: window.endDay,
    durationDays: window.durationDays,
    durationSource: 'parent_package_rhythm_window',
    tier: 'T2',
    confidence: window.confidence,
    durationBearing: window.durationBearing,
    autoApply: false,
  }))
}

function buildNodeIdIndex(nodes: T2RhythmScheduleCandidateNetworkNode[]) {
  return new Map(nodes.map((node) => [node.windowCode, node.nodeId]))
}

function buildEdges(
  candidatePackage: T2RhythmScheduleCandidatePackage,
  nodeIdByWindowCode: Map<string, string>,
): T2RhythmScheduleCandidateNetworkEdge[] {
  return candidatePackage.dependencyCandidates.map((edge) => ({
    edgeId: edge.edgeCode,
    sourceTemplateId: edge.sourceTemplateId,
    predecessorNodeId: nodeIdByWindowCode.get(edge.predecessorWindowCode) ?? edge.predecessorWindowCode,
    successorNodeId: nodeIdByWindowCode.get(edge.successorWindowCode) ?? edge.successorWindowCode,
    predecessorWindowCode: edge.predecessorWindowCode,
    successorWindowCode: edge.successorWindowCode,
    relation: edge.relation,
    lagDays: edge.lagDays,
    mandatory: edge.mandatory,
    edgeType: edge.edgeType,
    tier: 'T2',
    autoApply: false,
  }))
}

function buildGates(
  candidatePackage: T2RhythmScheduleCandidatePackage,
  nodes: T2RhythmScheduleCandidateNetworkNode[],
): T2RhythmScheduleCandidateNetworkGate[] {
  return candidatePackage.hardGates.map((gate) => ({
    ...gate,
    nodeIds: nodes
      .filter((node) => node.templateId === gate.sourceTemplateId)
      .map((node) => node.nodeId),
  }))
}

function buildAssemblyCompatibility(input: T2RhythmScheduleCandidateNetworkInput) {
  return checkTemplateAssemblyCompatibility({
    candidateId: input.candidateId,
    t2RhythmScheduleCandidatePackage: input.candidatePackage,
    constructionOrganization: input.constructionOrganization,
    cpmNetwork: {
      edges: input.candidatePackage.dependencyCandidates.map((edge) => ({
        edgeId: edge.edgeCode,
        predecessorWindowCode: edge.predecessorWindowCode,
        successorWindowCode: edge.successorWindowCode,
        relation: edge.relation,
        lagDays: edge.lagDays,
        mandatory: edge.mandatory,
      })),
    },
    productionCapacity: input.productionCapacity,
    productionCapacityEvidence: input.productionCapacityEvidence,
    priorityAdjudication: input.priorityAdjudication,
  })
}

function normalizeProductionCapacity(
  productionCapacity: T2RhythmScheduleCandidateNetworkInput['productionCapacity'],
): T2RhythmProductionCapacity | null {
  return productionCapacity
    ? {
        ...(typeof productionCapacity.availableParallelWorkfaces === 'number'
          ? { availableParallelWorkfaces: productionCapacity.availableParallelWorkfaces }
          : {}),
        ...(typeof productionCapacity.availableCrewStreams === 'number'
          ? { availableCrewStreams: productionCapacity.availableCrewStreams }
          : {}),
        ...(productionCapacity.calendarBasis === 'working_day' || productionCapacity.calendarBasis === 'calendar_day'
          ? { calendarBasis: productionCapacity.calendarBasis }
          : {}),
      }
    : null
}

function buildScheduleTrustEvidence(
  candidatePackage: T2RhythmScheduleCandidatePackage,
  assemblyCompatibility: TemplateAssemblyCompatibilityResult,
  input: T2RhythmScheduleCandidateNetworkInput,
  productionCapacityCoverage: T2RhythmProductionCapacityCoverage,
): T2RhythmScheduleCandidateNetwork['scheduleTrustEvidence'] {
  const productionSummaries = candidatePackage.productionFeasibilitySummaries
  const liveReplayTrustGate = candidatePackage.standardLibraryReadiness.liveReplayTrustGate ?? null
  return {
    selectedTemplateIds: candidatePackage.selectedTemplateIds,
    durationBearingNodeCount: candidatePackage.durationBearingWindowCount,
    dependencyEdgeCount: candidatePackage.candidateDependencyEdgeCount,
    hardGateCount: candidatePackage.hardGateCount,
    criticalPathRoles: unique(candidatePackage.scheduleTrustSummaries.flatMap((summary) => summary.criticalPathRoles)),
    durationDrivers: unique(candidatePackage.scheduleTrustSummaries.flatMap((summary) => summary.durationDrivers)),
    workfaceReadinessSignals: unique(candidatePackage.scheduleTrustSummaries.flatMap((summary) => summary.workfaceReadinessSignals)),
    assemblyRiskTags: unique(candidatePackage.scheduleTrustSummaries.flatMap((summary) => summary.assemblyRiskTags)),
    compatibilityStatus: assemblyCompatibility.status,
    replayRequiredBeforePublish: true,
    standardLibraryReadinessStatus: candidatePackage.standardLibraryReadiness.status,
    standardLibraryPrecisionStatus: candidatePackage.standardLibraryReadiness.precisionStatus,
    standardLibraryBreadthStatus: candidatePackage.standardLibraryReadiness.breadthStatus,
    standardLibraryDepthStatus: candidatePackage.standardLibraryReadiness.depthStatus,
    standardLibraryTrustGateStatus: liveReplayTrustGate?.status ?? 'missing',
    standardLibraryTrustBoundary: liveReplayTrustGate?.trustBoundary ?? null,
    canTrustForRealScheduleCalibration: liveReplayTrustGate?.canTrustForRealScheduleCalibration === true,
    standardLibraryTrustGateReleaseBlockers: liveReplayTrustGate?.releaseBlockers ?? [],
    selectionCoverageStatus: candidatePackage.selectionCoverage.status,
    selectionCoverageGapReasons: candidatePackage.selectionCoverage.gapReasons,
    selectionReceiptCount: candidatePackage.selectionReceipts.length,
    selectorReceiptAuditStatus: candidatePackage.selectionReceipts.length === candidatePackage.selectedTemplateIds.length
      && candidatePackage.selectionReceipts.every((receipt) => (
        receipt.selectorPurity.allExplicitDimensionsMatched
        && receipt.selectorPurity.noT1T3Leakage
      ))
      ? 'ready'
      : 'missing',
    productionFeasibility: {
      calendarBasis: 'working_day',
      workfaceUnits: unique(productionSummaries.map((summary) => summary.workfaceUnit)),
      minimumParallelWorkfaces: Math.max(0, ...productionSummaries.map((summary) => summary.minimumParallelWorkfaces)),
      recommendedCrewStreams: Math.max(0, ...productionSummaries.map((summary) => summary.recommendedCrewStreams)),
      resourceReadinessSignals: unique(productionSummaries.flatMap((summary) => summary.resourceReadinessSignals)),
      calendarConstraintSignals: unique(productionSummaries.flatMap((summary) => summary.calendarConstraintSignals)),
      capacityRiskTags: unique(productionSummaries.flatMap((summary) => summary.capacityRiskTags)),
    },
    productionCapacityCoverage,
    releaseBlockers: candidatePackage.standardLibraryReadiness.releaseBlockers,
  }
}

export function buildT2RhythmScheduleCandidateNetwork(
  input: T2RhythmScheduleCandidateNetworkInput,
): T2RhythmScheduleCandidateNetwork {
  const nodes = buildNodes(input.candidatePackage)
  const nodeIdByWindowCode = buildNodeIdIndex(nodes)
  const edges = buildEdges(input.candidatePackage, nodeIdByWindowCode)
  const gates = buildGates(input.candidatePackage, nodes)
  const assemblyCompatibility = buildAssemblyCompatibility(input)
  const productionCapacityCoverage = buildT2RhythmProductionCapacityCoverage({
    candidatePackage: input.candidatePackage,
    productionCapacityEvidence: input.productionCapacityEvidence,
    productionCapacity: normalizeProductionCapacity(input.productionCapacity),
  })
  const canEnterC1913Phase1Selection = (
    input.candidatePackage.status === 'schedulable_candidate'
    && assemblyCompatibility.canEnterAutomaticSelection
    && productionCapacityCoverage.canEnterC1913Phase1Selection
  )
  const status = input.candidatePackage.status === 'no_template_match'
    ? 'no_template_match'
    : canEnterC1913Phase1Selection ? 'schedulable_network_candidate' : 'candidate_conflict'

  return {
    source: 't2_rhythm_schedule_candidate_network',
    candidateId: input.candidateId,
    tier: 'T2',
    status,
    canEnterC1913Phase1Selection,
    requiresManualReview: !canEnterC1913Phase1Selection,
    selectedTemplateIds: input.candidatePackage.selectedTemplateIds,
    selectionReceipts: input.candidatePackage.selectionReceipts,
    nodes,
    edges,
    gates,
    assemblyCompatibility,
    templateAssemblyCompatibilityReceipt: assemblyCompatibility.templateAssemblyCompatibilityReceipt,
    productionCapacityEvidence: input.productionCapacityEvidence ?? null,
    conflictSummary: {
      conflictCount: assemblyCompatibility.conflicts.length + productionCapacityCoverage.blockingReasons.length,
      conflictCodes: unique([
        ...assemblyCompatibility.conflicts.map((conflict) => conflict.conflictCode),
        ...productionCapacityCoverage.blockingReasons,
      ]),
      priorityOverrideBlocked: assemblyCompatibility.priorityOverrideBlocked,
    },
    selectionCoverage: input.candidatePackage.selectionCoverage,
    scheduleTrustEvidence: buildScheduleTrustEvidence(input.candidatePackage, assemblyCompatibility, input, productionCapacityCoverage),
    standardLibraryReadiness: input.candidatePackage.standardLibraryReadiness,
    mutationBoundary: {
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
      writesSeed: false,
      writesBaseline: false,
    },
  }
}
