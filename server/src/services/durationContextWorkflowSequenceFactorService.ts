import {
  inferWorkEnvironmentFromResolver,
  resolveV1474BuildingPatternMatches,
  resolveV1475CrossItemWorkflow,
  type AlgorithmSeedResolveContext,
} from './algorithmSeedResolver.js'
import { readDurationContextActiveTaskDependencies } from './durationContextFactReadModelService.js'
import type {
  DurationContextFactor,
  DurationContextInput,
} from '../types/durationContext.js'

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readTaskWorkMetadata(task: Record<string, unknown>) {
  return readRecord(
    task.standard_task_metadata
      ?? task.standardTaskMetadata
      ?? task.metadata,
  )
}

function readTaskWorkflowFacts(task: Record<string, unknown>) {
  const metadata = readTaskWorkMetadata(task)
  const internalFlow = readRecord(metadata.internalFlow ?? metadata.internal_flow)
  const crossItemWorkflow = Array.isArray(metadata.crossItemWorkflow)
    ? metadata.crossItemWorkflow
    : Array.isArray(metadata.cross_item_workflow)
      ? metadata.cross_item_workflow
      : []
  return {
    internalFlow,
    crossItemWorkflow,
  }
}

function hasWorkflowFacts(facts: ReturnType<typeof readTaskWorkflowFacts>) {
  return Object.keys(facts.internalFlow).length > 0 || facts.crossItemWorkflow.length > 0
}

function compactFactorText(input: DurationContextInput) {
  const metadata = readRecord(input.standardTaskMetadata)
  return [
    input.taskTitle,
    input.standardWorkName,
    input.standardWorkCode,
    input.wbsNodeType,
    input.engineeringCategoryId,
    input.projectTypeCode,
    input.structureTypeCode,
    metadata.workEnvironment,
    metadata.work_environment,
    ...(Array.isArray(input.methodVariantCodes) ? input.methodVariantCodes : []),
    ...(Array.isArray(input.elementVariantCodes) ? input.elementVariantCodes : []),
  ].map(normalizeText).filter(Boolean).join(' ')
}

function buildSeedResolveContext(input: DurationContextInput): AlgorithmSeedResolveContext {
  const metadata = readRecord(input.standardTaskMetadata)
  const buildingPatternObservation = readRecord(metadata.buildingPatternObservation ?? metadata.building_pattern_observation)
  const observedPrimaryWorkfaceType = normalizeText(buildingPatternObservation.primaryWorkfaceType ?? buildingPatternObservation.primary_workface_type)
  const observedPhaseWindow = normalizeText(buildingPatternObservation.phaseWindow ?? buildingPatternObservation.phase_window)
  const observedExpansionStrategy = normalizeText(buildingPatternObservation.expansionStrategy ?? buildingPatternObservation.expansion_strategy)
  const scopeDimensions = [
    input.buildingObjectId ? 'building' : null,
    input.floorObjectId ? 'floor' : null,
    input.zoneObjectId ? 'zone' : null,
  ].filter((item): item is string => Boolean(item))
  const rhythmDrivers = [
    input.floorObjectId ? 'floor_count' : null,
    input.buildingObjectId ? 'building_count' : null,
    input.zoneObjectId ? 'zone_count' : null,
    (input.methodVariantCodes?.length ?? 0) > 0 ? 'method_variant' : null,
    input.acceptanceRequired ? 'acceptance_gate' : null,
    input.materialRequired ? 'readiness_gate' : null,
    input.responsibleUnitId ? 'resource_capacity' : null,
  ].filter((item): item is string => Boolean(item))
  return {
    projectId: input.projectId,
    standardWorkCode: input.standardWorkCode,
    standardWorkCodes: input.standardWorkCode ? [input.standardWorkCode] : [],
    templateNodeId: input.templateNodeId,
    methodVariantCodes: input.methodVariantCodes ?? [],
    elementVariantCodes: input.elementVariantCodes ?? [],
    projectTypeCode: input.projectTypeCode ?? null,
    structureTypeCode: input.structureTypeCode ?? null,
    applicableGranularity: input.applicableGranularity ?? null,
    workEnvironment: inferWorkEnvironmentFromResolver(compactFactorText(input), metadata),
    scopeDimensions,
    rhythmDrivers,
    primaryWorkfaceType: observedPrimaryWorkfaceType || (scopeDimensions.includes('floor')
      ? 'standard_floor'
      : scopeDimensions.includes('zone')
        ? 'building_zone'
        : scopeDimensions.includes('building')
          ? 'building_zone'
          : null),
    phaseWindow: observedPhaseWindow || (scopeDimensions.includes('floor') ? 'superstructure' : null),
    expansionStrategy: observedExpansionStrategy || (scopeDimensions.includes('floor')
      ? 'floor_ordered'
      : scopeDimensions.includes('zone')
        ? 'zone_ordered'
        : scopeDimensions.includes('building')
          ? 'building'
          : null),
  }
}

function readMethodBucketDays(record: Record<string, unknown>, input: DurationContextInput) {
  const buckets = record.defaultDaysByMethod ?? record.default_days_by_method
  const methods = Array.isArray(input.methodVariantCodes) ? input.methodVariantCodes.map((item) => normalizeText(item)) : []
  if (!buckets || typeof buckets !== 'object' || methods.length === 0) return null
  for (const method of methods) {
    const value = Number((buckets as Record<string, unknown>)[method])
    if (Number.isFinite(value) && value >= 0) return value
  }
  return null
}

function readSeedDays(record: Record<string, unknown>, input: DurationContextInput, fallback = 0) {
  const runtimeRole = normalizeText(record.runtimeRole ?? record.runtime_role).toLowerCase()
  const canCreateDependencies = record.canCreateDependencies ?? record.can_create_dependencies
  const governanceTarget = normalizeText(record.governanceTarget ?? record.governance_target).toLowerCase()
  const recognitionOnlyWorkflowSignal = runtimeRole === 'recognition_signal'
    || canCreateDependencies === false
    || governanceTarget === 'workflow_dictionary'
  if (recognitionOnlyWorkflowSignal) return 0
  const minimum = Number(record.minimumDays ?? record.minimum_days ?? 0)
  const candidates = [
    record.externalCalendarDays ?? record.external_calendar_days,
    record.learnedDays ?? record.learned_days,
    readMethodBucketDays(record, input),
    record.defaultDaysP50 ?? record.default_days_p50,
    record.defaultDays ?? record.default_days,
    recognitionOnlyWorkflowSignal ? 0 : (record.lagDays ?? record.lag_days),
    recognitionOnlyWorkflowSignal ? 0 : (record.defaultLagDays ?? record.default_lag_days),
    record.mandatoryLagDays,
    fallback,
  ]
  const selected = candidates
    .map((value) => Number(value))
    .find((value) => Number.isFinite(value) && value >= 0) ?? fallback
  return Math.max(Number.isFinite(minimum) ? minimum : 0, selected)
}

function buildWorkflowSequenceMetadata(input: {
  crossItemWorkflowFact: Record<string, unknown> | null
  crossItemWorkflowRule: Record<string, unknown> | null
  workflowEvidenceSource: 'cross_item_workflow' | 'internal_flow'
  buildingPatternMatch: Record<string, unknown>
  buildingPatternCodes: unknown[]
  buildingPatternSecondaryCodes: unknown[]
  buildingPatternRecord: Record<string, unknown>
  buildingPatternConfidence: number
  controlChainCount: number
  durationCurveProfile: Record<string, unknown>
  buildingPatternDurationProfiles: Array<Record<string, unknown>>
  buildingPatternContribution: Record<string, unknown> | null
}) {
  return {
    stableCode: input.crossItemWorkflowFact?.ruleCode ?? input.crossItemWorkflowRule?.stableCode ?? null,
    dependencyType: input.crossItemWorkflowFact?.dependencyType ?? input.crossItemWorkflowRule?.dependencyType ?? null,
    scopeHint: input.crossItemWorkflowFact?.scopeRule ?? input.crossItemWorkflowRule?.scopeHint ?? null,
    resolverSource: input.crossItemWorkflowFact ? 'task_metadata' : input.crossItemWorkflowRule?.__resolverSource ?? null,
    workflowEvidenceSource: input.workflowEvidenceSource,
    buildingPatternCode: input.buildingPatternMatch.patternCode,
    buildingPatternCodes: input.buildingPatternCodes,
    buildingPatternSecondaryCodes: input.buildingPatternSecondaryCodes,
    buildingPatternConfidence: input.buildingPatternConfidence,
    buildingPatternActionPolicy: input.buildingPatternMatch.actionPolicy,
    buildingPatternMatchWeight: input.buildingPatternMatch.matchWeight ?? null,
    buildingPatternSecondaryMatches: input.buildingPatternMatch.secondaryMatches ?? [],
    buildingPatternRole: input.buildingPatternRecord.patternRole ?? input.buildingPatternRecord.pattern_role ?? null,
    buildingPatternPriority: input.buildingPatternRecord.patternPriority ?? input.buildingPatternRecord.pattern_priority ?? null,
    controlChainCount: input.controlChainCount,
    durationCurveProfile: input.durationCurveProfile,
    buildingPatternDurationProfiles: input.buildingPatternDurationProfiles,
    buildingPatternDurationProfileContributions: input.buildingPatternMatch.durationProfileContributions ?? [],
    buildingPatternWeightedTypicalCycleDays: input.buildingPatternMatch.weightedTypicalCycleDays ?? null,
    buildingPatternTypicalCycleDayContributions: input.buildingPatternMatch.typicalCycleDayContributions ?? [],
    buildingPatternMergedStaggerRules: input.buildingPatternMatch.mergedStaggerRules ?? [],
    buildingPatternStaggerRuleContributions: input.buildingPatternMatch.staggerRuleContributions ?? [],
    buildingPatternStaggerMergePolicy: input.buildingPatternMatch.staggerMergePolicy ?? null,
    buildingPatternHardDeadlinePriority: input.buildingPatternMatch.hardDeadlinePriority ?? 0,
    buildingPatternContribution: input.buildingPatternContribution,
  }
}

export async function buildWorkflowSequenceFactor(input: DurationContextInput): Promise<DurationContextFactor | null> {
  const seedContext = buildSeedResolveContext(input)
  const workflowFacts = readTaskWorkflowFacts(input as Record<string, unknown>)
  const internalFlowFacts = readRecord(workflowFacts.internalFlow)
  const crossItemWorkflowFacts = Array.isArray(workflowFacts.crossItemWorkflow) ? workflowFacts.crossItemWorkflow : []
  const crossItemWorkflowFact = crossItemWorkflowFacts[0] as Record<string, unknown> | undefined
  const buildingPatternMatches = await resolveV1474BuildingPatternMatches(compactFactorText(input), seedContext)
  const buildingPatternMatch = (buildingPatternMatches[0] ?? {
    record: null,
    patternCode: null,
    matchScore: 0,
    confidenceScore: 0,
    confidenceLevel: 'low',
    matchedSignals: [],
    missingSignals: [],
    actionPolicy: 'candidate_only',
  }) as Record<string, unknown>
  const buildingPatternRecord = readRecord(buildingPatternMatch.record)
  const buildingPatternCodes = buildingPatternMatches.map((match) => match.patternCode).filter(Boolean)
  const buildingPatternSecondaryCodes = buildingPatternCodes.slice(1)
  const buildingPatternDurationProfiles = buildingPatternMatches
    .map((match) => readRecord(readRecord(match.record).durationCurveProfile ?? readRecord(match.record).duration_curve_profile))
    .filter((profile) => Object.keys(profile).length > 0)
  const durationCurveProfile = readRecord(
    buildingPatternMatch.mergedDurationCurveProfile
    ?? buildingPatternRecord.durationCurveProfile
    ?? buildingPatternRecord.duration_curve_profile,
  )
  const controlChains = Array.isArray(buildingPatternRecord.controlChains ?? buildingPatternRecord.control_chains)
    ? buildingPatternRecord.controlChains ?? buildingPatternRecord.control_chains
    : []
  const controlChainCount = Array.isArray(controlChains) ? controlChains.length : 0
  const buildingPatternConfidence = Number(buildingPatternMatch.confidenceScore ?? 0)
  const buildingPatternEvidence = Boolean(buildingPatternMatch.record)
  const buildingPatternAutoConsumable = buildingPatternMatch.actionPolicy === 'backend_consume'
  const crossItemWorkflowLag = crossItemWorkflowFact ? Math.max(0, Number(crossItemWorkflowFact.lagDays ?? crossItemWorkflowFact.lag_days ?? 0)) : 0
  const crossItemWorkflowRule = crossItemWorkflowFact
    ? null
    : await resolveV1475CrossItemWorkflow(compactFactorText(input), seedContext) as Record<string, unknown> | null
  const internalFlowLag = Math.max(
    0,
    Number(internalFlowFacts.lagDays ?? internalFlowFacts.lag_days ?? 0),
  )
  const workflowEvidenceDays = crossItemWorkflowLag > 0
    ? crossItemWorkflowLag
    : internalFlowLag > 0
      ? internalFlowLag
      : crossItemWorkflowRule
        ? readSeedDays(crossItemWorkflowRule, input, 0)
        : 0
  const hasWorkflowEvidence = Boolean(crossItemWorkflowFact)
    || hasWorkflowFacts(workflowFacts)
    || Boolean(crossItemWorkflowRule)
    || buildingPatternEvidence
  const buildingPatternExtraDays = buildingPatternAutoConsumable
    && normalizeText(durationCurveProfile.tailUnitBias ?? durationCurveProfile.tail_unit_bias) === 'higher'
    ? 1
    : 0
  const buildingPatternContribution = buildingPatternEvidence
    ? {
      factorKey: 'building_pattern',
      patternCode: buildingPatternMatch.patternCode,
      patternCodes: buildingPatternCodes,
      secondaryPatternCodes: buildingPatternSecondaryCodes,
      confidenceScore: buildingPatternConfidence,
      confidenceLevel: buildingPatternMatch.confidenceLevel,
      actionPolicy: buildingPatternMatch.actionPolicy,
      weightedTypicalCycleDays: buildingPatternMatch.weightedTypicalCycleDays ?? null,
      typicalCycleDayContributions: buildingPatternMatch.typicalCycleDayContributions ?? [],
      durationProfileContributions: buildingPatternMatch.durationProfileContributions ?? [],
      staggerRuleContributions: buildingPatternMatch.staggerRuleContributions ?? [],
      extraDays: buildingPatternExtraDays,
      contributionMode: 'workflow_sequence_sub_contribution',
    }
    : null
  const confidenceFromBuildingPattern = buildingPatternEvidence
    ? buildingPatternMatch.confidenceLevel === 'high'
      ? 4
      : buildingPatternMatch.confidenceLevel === 'medium'
        ? 2
        : -2
    : 0
  const workflowExtraDays = Math.max(workflowEvidenceDays, buildingPatternExtraDays)
  const workflowEvidenceSource = crossItemWorkflowFact || crossItemWorkflowRule ? 'cross_item_workflow' : 'internal_flow'
  const sharedMetadata = buildWorkflowSequenceMetadata({
    crossItemWorkflowFact: crossItemWorkflowFact ?? null,
    crossItemWorkflowRule,
    workflowEvidenceSource,
    buildingPatternMatch,
    buildingPatternCodes,
    buildingPatternSecondaryCodes,
    buildingPatternRecord,
    buildingPatternConfidence,
    controlChainCount,
    durationCurveProfile,
    buildingPatternDurationProfiles,
    buildingPatternContribution,
  })

  if (!input.taskId) {
    if (!hasWorkflowEvidence && workflowExtraDays <= 0) return null
    return {
      key: 'workflow_sequence',
      label: 'work sequence signal',
      multiplier: 1,
      extraDays: Math.min(10, Math.max(0, workflowExtraDays)),
      confidenceDelta: confidenceFromBuildingPattern || (hasWorkflowEvidence ? 2 : crossItemWorkflowRule?.confidence === 'low' ? -3 : 2),
      actionPolicy: workflowExtraDays > 0 ? 'auto_apply' : 'confidence_only',
      dataDependencies: crossItemWorkflowFact
        ? ['standard_task_metadata.crossItemWorkflow', 'standard_task_metadata.internalFlow']
        : ['algorithm_seed_records.cross_item_workflow', 'algorithm_seed_records.building_pattern'],
      reason: crossItemWorkflowFact
        ? 'This task has same-division or same-object package-level workflow evidence, so the forecast includes it as duration confidence context.'
        : buildingPatternEvidence
          ? 'The task matches a building pattern, so the forecast includes its control chain and duration curve as sequencing context.'
          : 'This task has recognized work-sequence evidence, so the forecast includes it as duration confidence context.',
      source: crossItemWorkflowFact ? 'task_fact' : 'v1.4.7.4_seed',
      metadata: sharedMetadata,
    }
  }

  const taskId = normalizeId(input.taskId)
  if (!taskId) return null
  const dependencies = await readDurationContextActiveTaskDependencies({ taskId })

  if (dependencies.length === 0) {
    if (!hasWorkflowEvidence && workflowExtraDays <= 0) return null
    return {
      key: 'workflow_sequence',
      label: 'work sequence signal',
      multiplier: 1,
      extraDays: Math.min(10, Math.max(0, workflowExtraDays)),
      confidenceDelta: confidenceFromBuildingPattern || (hasWorkflowEvidence ? 2 : crossItemWorkflowRule?.confidence === 'low' ? -3 : 2),
      actionPolicy: workflowExtraDays > 0 ? 'auto_apply' : 'confidence_only',
      dataDependencies: crossItemWorkflowFact
        ? ['standard_task_metadata.crossItemWorkflow', 'task_dependencies']
        : ['algorithm_seed_records.cross_item_workflow', 'algorithm_seed_records.building_pattern', 'task_dependencies'],
      reason: crossItemWorkflowFact
        ? 'This task has actual cross-item workflow evidence, so the forecast includes it even without explicit task dependencies.'
        : buildingPatternEvidence
          ? 'The task matches a building pattern, so the forecast includes its control chain and duration curve even without explicit task dependencies.'
          : 'This task has recognized work-sequence evidence, so the forecast includes it even without explicit task dependencies.',
      source: crossItemWorkflowFact ? 'task_fact' : 'v1.4.7.4_seed',
      metadata: sharedMetadata,
    }
  }

  const lagDays = dependencies.reduce((sum, row) => sum + Math.max(0, Number(row.lag_days ?? 0)), 0)
  if (lagDays <= 0) {
    return {
      key: 'workflow_sequence',
      label: 'workflow sequence',
      multiplier: 1,
      extraDays: 0,
      confidenceDelta: 2,
      actionPolicy: 'confidence_only',
      dataDependencies: ['task_dependencies', 'algorithm_seed_records.cross_item_workflow'],
      reason: crossItemWorkflowRule
        ? 'The task has predecessor relationships and recognized work-sequence evidence; the forecast keeps them as sequencing evidence.'
        : 'The task has predecessor relationships; the forecast keeps them as sequencing evidence.',
      source: crossItemWorkflowRule ? 'v1.4.7.4_seed' : 'task_fact',
      metadata: {
        dependencyCount: dependencies.length,
        ...sharedMetadata,
      },
    }
  }

  return {
    key: 'workflow_sequence',
    label: 'workflow sequence lag',
    multiplier: 1,
    extraDays: Math.min(10, lagDays),
    confidenceDelta: 0,
    actionPolicy: 'auto_apply',
    dataDependencies: ['task_dependencies', 'algorithm_seed_records.cross_item_workflow'],
    reason: 'The predecessor relationship includes waiting lag, so it was included in reference duration.',
    source: crossItemWorkflowRule ? 'v1.4.7.4_seed' : 'task_fact',
    metadata: {
      dependencyCount: dependencies.length,
      lagDays,
      ...sharedMetadata,
    },
  }
}
