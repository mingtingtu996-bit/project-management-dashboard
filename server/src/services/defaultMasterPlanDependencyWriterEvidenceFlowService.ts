import type { TaskBaseline, TaskBaselineItem } from '../types/db.js'
import {
  buildDefaultMasterPlanDependencyWriterDraft,
  type BuildDefaultMasterPlanDependencyWriterDraftInput,
  type DefaultMasterPlanDependencyWriterDraftResult,
} from './constructionOrganizationPlanNetworkDraftService.js'
import {
  applyConstructionOrganizationPlanNetworkApprovedDraft,
  type ApplyConstructionOrganizationPlanNetworkApprovedDraftResult,
  type ConstructionOrganizationPlanNetworkDomainWriterQueryExec,
} from './constructionOrganizationPlanNetworkDomainWriter.js'

type DefaultMasterPlanDependencyWriterEvidenceFlowMode = 'dry_run' | 'execute'
type DefaultMasterPlanDependencyWriterEvidenceFlowStatus = 'dry_run_ready' | 'executed' | 'blocked'

type CriticalPathRecalculationEvidence = {
  status?: string | null
  evidence_ref?: string | null
  evidenceRef?: string | null
}

type DryRunDomainWriterResult = {
  source: 'construction_organization_plan_network_domain_writer'
  status: 'dry_run_not_executed'
  canMaterializeRuntime: false
  draftNetworkKey: string | null
  releaseHandoffCandidateEventId: string | null
  releaseRecordTarget: string | null
  rollbackTarget: string | null
  insertedDependencyCount: 0
  skippedDependencyCount: number
  appliedDependencies: []
  releaseRecordPersisted: false
  writesTaskDependencies: false
  writesPlanDates: false
  writesSeed: false
  writesBaseline: false
  writesCriticalPathFacts: false
  writesAccelerationDraft: false
  reasons: string[]
  boundaryPolicy: string[]
}

type DefaultMasterPlanDependencyWriterEvidence = {
  schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1'
  generatedAt: string
  baselineId: string | null
  projectId: string | null
  execution_mode: DefaultMasterPlanDependencyWriterEvidenceFlowMode
  sourceEvidenceRef: string | null
  candidate_default_master_plan: {
    generation_mode: string | null
    source_version_label: string | null
    candidate_default_master_plan_baseline: boolean
  }
  task_mapping: {
    status: 'runtime_task_mapping_verified' | 'blocked'
    mapped_generated_row_count: number
    mapped_task_count: number
    unresolved_generated_row_ids: string[]
  }
  domain_writer_handoff: {
    status: DefaultMasterPlanDependencyWriterDraftResult['status']
    draft_network_key: string | null
    dependency_intent_count: number
    mapped_dependency_intent_count: number
    missing_requirements: string[]
    domain_writer_key: DefaultMasterPlanDependencyWriterDraftResult['domainWriterKey']
  }
  domain_writer_result: ApplyConstructionOrganizationPlanNetworkApprovedDraftResult | DryRunDomainWriterResult
  critical_path_recalculation: {
    status: string
    evidence_ref: string | null
  }
  production_ready: false
}

const RETIRED_OR_LOW_INFORMATION_DEFAULT_MASTER_PLAN_SOURCE_PATTERNS = [
  /legacy/i,
  /fallback/i,
  /reverse[_-]?inference/i,
  /old[_-]?template/i,
  /low[_-]?information/i,
  /low[_-]?info/i,
  /template[_-]?draft/i,
  /manual[_-]?comparison/i,
  /human[_-]?comparison/i,
  /option[_-]?comparison/i,
  /plan[_-]?option[_-]?comparison/i,
  /comparison[_-]?scenario/i,
  /controlled[_-]?degradation/i,
  /fallback[_-]?applied/i,
]

const ALLOWED_PROFILE_LINEAGE_DEFAULT_MASTER_PLAN_SOURCE_LABELS = new Set([
  'business_type_base_master_plan_profile_v1',
  'business_type_master_plan_profile_v1',
])

export type RunDefaultMasterPlanDependencyWriterEvidenceFlowInput =
  BuildDefaultMasterPlanDependencyWriterDraftInput & {
    mode?: DefaultMasterPlanDependencyWriterEvidenceFlowMode
    companyId?: string | null
    projectId?: string | null
    executedByUserId?: string | null
    queryExec?: ConstructionOrganizationPlanNetworkDomainWriterQueryExec
    taskDependenciesExportEvidenceRef?: string | null
    criticalPathRecalculation?: CriticalPathRecalculationEvidence | null
  }

export type RunDefaultMasterPlanDependencyWriterEvidenceFlowResult = {
  source: 'default_master_plan_dependency_writer_evidence_flow'
  status: DefaultMasterPlanDependencyWriterEvidenceFlowStatus
  executionMode: DefaultMasterPlanDependencyWriterEvidenceFlowMode
  baselineId: string | null
  projectId: string | null
  draftResult: DefaultMasterPlanDependencyWriterDraftResult
  evidence: DefaultMasterPlanDependencyWriterEvidence
  writesProductionTables: boolean
  productionReady: false
  blockers: string[]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function sourceVersionLabel(input: {
  baseline?: TaskBaseline | null
  items?: TaskBaselineItem[] | null
}) {
  const baselineLabel = normalizeText(input.baseline?.source_version_label)
  if (baselineLabel) return baselineLabel
  for (const item of input.items ?? []) {
    const metadata = readRecord(item.generation_metadata)
    const source = normalizeText(metadata.source ?? metadata.source_type)
    if (source) return source
  }
  return null
}

function isDefaultMasterPlanLabel(value: string | null) {
  return value === 'residential_master_plan_v2' || value === 'managed_frontier_default_master_plan'
}

function defaultMasterPlanFallbackAppliedSourceSignal(value: unknown) {
  if (value === true) return 'fallback_applied'
  const label = normalizeText(value)
  if (!label || label.toLowerCase() === 'false') return ''
  if (label.toLowerCase() === 'true') return 'fallback_applied'
  return label
}

function defaultMasterPlanStructuredSourceSignals(value: unknown, depth = 0): string[] {
  if (depth > 4) return []
  if (typeof value === 'string') {
    try {
      return defaultMasterPlanStructuredSourceSignals(JSON.parse(value), depth + 1)
    } catch {
      return []
    }
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (
        typeof item === 'string'
        || typeof item === 'boolean'
        || typeof item === 'number'
      ) {
        return [normalizeText(item)]
      }
      return defaultMasterPlanStructuredSourceSignals(item, depth + 1)
    })
  }

  const record = readRecord(value)
  return Object.entries(record).flatMap(([key, nestedValue]) => {
    const normalizedKey = key.replace(/[_-]/g, '').toLowerCase()
    if (!isDefaultMasterPlanSourceSignalKey(normalizedKey)) return []
    if (normalizedKey === 'fallbackapplied') {
      return [
        defaultMasterPlanFallbackAppliedSourceSignal(nestedValue),
        ...defaultMasterPlanStructuredSourceSignals(nestedValue, depth + 1),
      ]
    }
    if (
      (normalizedKey === 'originalsource' || normalizedKey === 'profilesourcetype')
      && ALLOWED_PROFILE_LINEAGE_DEFAULT_MASTER_PLAN_SOURCE_LABELS.has(normalizeText(nestedValue))
    ) {
      return []
    }
    if (normalizedKey === 'controlleddegradation' && nestedValue === true) return ['controlled_degradation']
    if (
      typeof nestedValue === 'string'
      || typeof nestedValue === 'boolean'
      || typeof nestedValue === 'number'
    ) {
      return [normalizeText(nestedValue)]
    }
    return defaultMasterPlanStructuredSourceSignals(nestedValue, depth + 1)
  })
}

function isDefaultMasterPlanSourceSignalKey(normalizedKey: string) {
  if (
    normalizedKey.includes('path')
    || normalizedKey.includes('ref')
    || normalizedKey.includes('url')
    || normalizedKey.includes('sha')
    || normalizedKey.includes('hash')
  ) {
    return false
  }
  return normalizedKey.includes('source')
    || normalizedKey.includes('lineage')
    || normalizedKey.includes('origin')
    || normalizedKey.includes('fallback')
    || normalizedKey.includes('degradation')
    || normalizedKey.includes('scenario')
    || normalizedKey.includes('template')
    || normalizedKey.includes('generationmode')
    || normalizedKey.includes('marker')
    || normalizedKey.includes('flag')
    || normalizedKey.includes('tag')
    || normalizedKey.includes('label')
    || normalizedKey.includes('alias')
    || normalizedKey.includes('basis')
    || normalizedKey.includes('policy')
    || normalizedKey.includes('reason')
    || normalizedKey.includes('evidence')
    || normalizedKey.includes('kind')
    || normalizedKey.includes('type')
    || normalizedKey.includes('status')
    || normalizedKey.includes('review')
    || normalizedKey.includes('handoff')
    || normalizedKey.includes('proof')
}

function isRetiredOrLowInformationDefaultMasterPlanSource(value: unknown) {
  const label = normalizeText(value)
  if (!label) return false
  return RETIRED_OR_LOW_INFORMATION_DEFAULT_MASTER_PLAN_SOURCE_PATTERNS.some((pattern) => pattern.test(label))
}

function itemDefaultMasterPlanSourceSignals(item: TaskBaselineItem) {
  const metadata = readRecord(item.generation_metadata)
  const businessTypeMasterPlan = readRecord(metadata.businessTypeMasterPlan ?? metadata.business_type_master_plan)
  return [
    ...defaultMasterPlanStructuredSourceSignals(metadata),
    metadata.source,
    metadata.source_type,
    metadata.sourceType,
    metadata.originalSource,
    metadata.original_source,
    metadata.handoffGenerationMode,
    metadata.handoff_generation_mode,
    metadata.scenarioType,
    metadata.scenario_type,
    metadata.comparisonScenario,
    metadata.comparison_scenario,
    metadata.controlledDegradation === true ? 'controlled_degradation' : metadata.controlledDegradation,
    metadata.controlled_degradation === true ? 'controlled_degradation' : metadata.controlled_degradation,
    defaultMasterPlanFallbackAppliedSourceSignal(metadata.fallbackApplied),
    defaultMasterPlanFallbackAppliedSourceSignal(metadata.fallback_applied),
    businessTypeMasterPlan.originalSource,
    businessTypeMasterPlan.original_source,
    businessTypeMasterPlan.profileSourceType,
    businessTypeMasterPlan.profile_source_type,
  ].map(normalizeText).filter(Boolean)
}

function retiredDefaultMasterPlanItemSourceLabels(items?: TaskBaselineItem[] | null) {
  return unique((items ?? [])
    .flatMap(itemDefaultMasterPlanSourceSignals)
    .filter(isRetiredOrLowInformationDefaultMasterPlanSource))
}

function unresolvedGeneratedRowIdsFromMissingRequirements(missingRequirements: string[]) {
  return unique(missingRequirements.flatMap((reason) => {
    const [code, suffix] = reason.split(':', 2)
    if (!suffix) return []
    if (code !== 'runtime_task_mapping_missing' && code !== 'dependency_intent_mapping_unresolved') return []
    return suffix
      .split(',')
      .flatMap((item) => item.split('->'))
      .map((item) => normalizeText(item))
      .filter(Boolean)
  }))
}

function buildDryRunDomainWriterResult(
  draftResult: DefaultMasterPlanDependencyWriterDraftResult,
): DryRunDomainWriterResult {
  return {
    source: 'construction_organization_plan_network_domain_writer',
    status: 'dry_run_not_executed',
    canMaterializeRuntime: false,
    draftNetworkKey: draftResult.draft?.draftNetworkKey ?? null,
    releaseHandoffCandidateEventId: draftResult.draft?.releaseExitHandoff?.candidateEventId ?? null,
    releaseRecordTarget: draftResult.draft?.releaseExitHandoff?.releaseRecordTarget ?? null,
    rollbackTarget: draftResult.draft?.releaseExitHandoff?.rollbackTarget ?? null,
    insertedDependencyCount: 0,
    skippedDependencyCount: draftResult.draft?.edges.length ?? 0,
    appliedDependencies: [],
    releaseRecordPersisted: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: ['dry_run_not_executed'],
    boundaryPolicy: [
      'dry_run_does_not_call_domain_writer',
      'execute_mode_required_for_task_dependencies',
      'critical_path_readback_required_after_execute',
    ],
  }
}

function buildBlockedDomainWriterResult(
  draftResult: DefaultMasterPlanDependencyWriterDraftResult,
  reasons: string[],
): DryRunDomainWriterResult {
  return {
    ...buildDryRunDomainWriterResult(draftResult),
    status: 'dry_run_not_executed',
    reasons: unique(reasons),
  }
}

function criticalPathEvidence(
  mode: DefaultMasterPlanDependencyWriterEvidenceFlowMode,
  input?: CriticalPathRecalculationEvidence | null,
) {
  const status = normalizeText(input?.status)
  const evidenceRef = normalizeText(input?.evidence_ref ?? input?.evidenceRef)
  if (status || evidenceRef) {
    return {
      status: status || 'provided',
      evidence_ref: evidenceRef || null,
    }
  }
  return {
    status: mode === 'execute' ? 'missing_after_execute' : 'not_run_dry_run',
    evidence_ref: null,
  }
}

function buildEvidence(input: {
  mode: DefaultMasterPlanDependencyWriterEvidenceFlowMode
  generatedAt: string
  baseline?: TaskBaseline | null
  items?: TaskBaselineItem[] | null
  draftResult: DefaultMasterPlanDependencyWriterDraftResult
  domainWriterResult: ApplyConstructionOrganizationPlanNetworkApprovedDraftResult | DryRunDomainWriterResult
  taskDependenciesExportEvidenceRef?: string | null
  criticalPathRecalculation?: CriticalPathRecalculationEvidence | null
}): DefaultMasterPlanDependencyWriterEvidence {
  const label = sourceVersionLabel({ baseline: input.baseline, items: input.items })
  const retiredItemSourceLabels = retiredDefaultMasterPlanItemSourceLabels(input.items)
  const evidenceLabel = retiredItemSourceLabels[0] ?? label
  const unresolvedGeneratedRowIds = unresolvedGeneratedRowIdsFromMissingRequirements(input.draftResult.missingRequirements)
  const mappedTaskIds = unique(input.draftResult.taskMappings.map((mapping) => mapping.taskId))
  return {
    schemaVersion: 'workbuddy-default-master-plan-dependency-writer-evidence/v1',
    generatedAt: input.generatedAt,
    baselineId: input.draftResult.baselineId,
    projectId: input.draftResult.projectId,
    execution_mode: input.mode,
    sourceEvidenceRef: normalizeText(input.taskDependenciesExportEvidenceRef) || null,
    candidate_default_master_plan: {
      generation_mode: retiredItemSourceLabels.length === 0 && isDefaultMasterPlanLabel(label) ? label : null,
      source_version_label: evidenceLabel,
      candidate_default_master_plan_baseline: retiredItemSourceLabels.length === 0 && isDefaultMasterPlanLabel(label),
    },
    task_mapping: {
      status: input.draftResult.status === 'domain_writer_draft_ready' && unresolvedGeneratedRowIds.length === 0
        ? 'runtime_task_mapping_verified'
        : 'blocked',
      mapped_generated_row_count: input.draftResult.taskMappings.length,
      mapped_task_count: mappedTaskIds.length,
      unresolved_generated_row_ids: unresolvedGeneratedRowIds,
    },
    domain_writer_handoff: {
      status: input.draftResult.status,
      draft_network_key: input.draftResult.draft?.draftNetworkKey ?? null,
      dependency_intent_count: input.draftResult.dependencyIntentCount,
      mapped_dependency_intent_count: input.draftResult.mappedDependencyIntentCount,
      missing_requirements: input.draftResult.missingRequirements,
      domain_writer_key: input.draftResult.domainWriterKey,
    },
    domain_writer_result: input.domainWriterResult,
    critical_path_recalculation: criticalPathEvidence(input.mode, input.criticalPathRecalculation),
    production_ready: false,
  }
}

export async function runDefaultMasterPlanDependencyWriterEvidenceFlow(
  input: RunDefaultMasterPlanDependencyWriterEvidenceFlowInput,
): Promise<RunDefaultMasterPlanDependencyWriterEvidenceFlowResult> {
  const mode = input.mode ?? 'dry_run'
  const executedAt = normalizeText(input.executedAt) || new Date().toISOString()
  const draftResult = buildDefaultMasterPlanDependencyWriterDraft({
    ...input,
    executedAt,
  })
  const projectId = normalizeText(input.projectId) || draftResult.projectId
  const blockers = [...draftResult.missingRequirements]
  const retiredItemSourceLabels = retiredDefaultMasterPlanItemSourceLabels(input.items)
  if (retiredItemSourceLabels.length > 0) {
    blockers.push('candidate_default_master_plan_retired_or_low_information_source_label')
  }
  if (mode === 'execute' && !input.queryExec) blockers.push('query_exec_required_for_execute_mode')

  if (draftResult.status !== 'domain_writer_draft_ready' || blockers.length > 0 || !draftResult.draft) {
    const domainWriterResult = buildBlockedDomainWriterResult(draftResult, blockers.length > 0 ? blockers : ['domain_writer_draft_not_ready'])
    const evidence = buildEvidence({
      mode,
      generatedAt: executedAt,
      baseline: input.baseline,
      items: input.items,
      draftResult,
      domainWriterResult,
      taskDependenciesExportEvidenceRef: input.taskDependenciesExportEvidenceRef,
      criticalPathRecalculation: input.criticalPathRecalculation,
    })
    return {
      source: 'default_master_plan_dependency_writer_evidence_flow',
      status: 'blocked',
      executionMode: mode,
      baselineId: draftResult.baselineId,
      projectId,
      draftResult,
      evidence,
      writesProductionTables: false,
      productionReady: false,
      blockers: unique(domainWriterResult.reasons),
    }
  }

  if (mode === 'dry_run') {
    const domainWriterResult = buildDryRunDomainWriterResult(draftResult)
    const evidence = buildEvidence({
      mode,
      generatedAt: executedAt,
      baseline: input.baseline,
      items: input.items,
      draftResult,
      domainWriterResult,
      taskDependenciesExportEvidenceRef: input.taskDependenciesExportEvidenceRef,
      criticalPathRecalculation: input.criticalPathRecalculation,
    })
    return {
      source: 'default_master_plan_dependency_writer_evidence_flow',
      status: 'dry_run_ready',
      executionMode: mode,
      baselineId: draftResult.baselineId,
      projectId,
      draftResult,
      evidence,
      writesProductionTables: false,
      productionReady: false,
      blockers: [],
    }
  }

  const domainWriterResult = await applyConstructionOrganizationPlanNetworkApprovedDraft({
    draft: draftResult.draft,
    companyId: input.companyId,
    projectId,
    queryExec: input.queryExec as ConstructionOrganizationPlanNetworkDomainWriterQueryExec,
    executedByUserId: input.executedByUserId ?? input.requestedByUserId,
    executedAt,
  })
  const evidence = buildEvidence({
    mode,
    generatedAt: executedAt,
    baseline: input.baseline,
    items: input.items,
    draftResult,
    domainWriterResult,
    taskDependenciesExportEvidenceRef: input.taskDependenciesExportEvidenceRef,
    criticalPathRecalculation: input.criticalPathRecalculation,
  })

  return {
    source: 'default_master_plan_dependency_writer_evidence_flow',
    status: domainWriterResult.status === 'runtime_apply_ready' ? 'executed' : 'blocked',
    executionMode: mode,
    baselineId: draftResult.baselineId,
    projectId,
    draftResult,
    evidence,
    writesProductionTables: domainWriterResult.status === 'runtime_apply_ready',
    productionReady: false,
    blockers: domainWriterResult.reasons,
  }
}
