import { executeSQL, getTasks } from './dbService.js'
import {
  evaluateRuntimeDelayRecoveryWithCriticalPath,
  type ScheduleAccelerationContext,
  type ScheduleAccelerationDependency,
  type ScheduleAccelerationMode,
  type ScheduleAccelerationProposal,
  type ScheduleAccelerationRow,
  type ScheduleTargetFeasibility,
} from './scheduleAccelerationService.js'
import { loadEffectiveProjectScheduleState } from './projectScheduleStateService.js'
import {
  buildProjectRemainingDurationForecast,
  buildProjectRemainingForecastPredictionEvent,
  type ProjectMonthlyCommitmentSummary,
  type ProjectRemainingDurationForecast,
} from './projectRemainingDurationForecastService.js'
import { getProjectCriticalPathSnapshot } from './projectCriticalPathService.js'
import { listCurrentTaskDurationForecasts } from './taskDurationForecastService.js'
import { getTaskDurationSuggestion } from './durationSuggestionService.js'
import { buildRuntimeExecutionInference } from './runtimeExecutionInferenceService.js'
import { resolveConstructionCalendarContext, type ConstructionCalendarContext } from './constructionCalendar.js'
import {
  backtestEarliestPendingDurationAccuracyPrediction,
  recordDurationAccuracyPrediction,
} from './durationAlgorithmAccuracyService.js'
import {
  recordScheduleAccelerationRuntimeConsumedArtifacts,
  type DurationRuntimeConsumerFacadeArtifactsResult,
} from './durationRuntimeConsumerObservationAdapterService.js'
import { assembleDurationInput } from './durationInputAssemblerService.js'
import { buildDownstreamDurationAssetConsumption } from './durationAssetDownstreamConsumptionService.js'
import type {
  DurationAssetConsumptionReceipt,
  DurationAssetConsumptionSummary,
} from './durationAssetConsumptionReceiptService.js'
import type {
  DurationRuntimeConsumerObservationQueryExec,
  DurationRuntimeConsumerObservedArtifact,
} from './durationRuntimeConsumerObservationService.js'
import type { Task, TaskDependency } from '../types/db.js'
import { logger } from '../middleware/logger.js'
import { normalizeDateOnlyText, signedDurationDayDelta } from '../utils/durationDays.js'
import { businessDateKey } from './durationMetricService.js'
import {
  mergeConstructionOrganizationLineageIntoContext,
  readConstructionOrganizationPlanNetworkRuntimeLineage,
  CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
  type ConstructionOrganizationPlanNetworkRuntimeLineage,
} from './constructionOrganizationRuntimeLineageService.js'
import { withDatabaseTransaction } from '../database.js'
import {
  authorizeScheduleAccelerationRecommendationAdoption,
  issueScheduleAccelerationRecommendation,
} from './scheduleAccelerationRecommendationService.js'

const CURRENT_EXECUTION_BASELINE_STATUSES = new Set(['confirmed', 'pending_realign'])

export interface ScheduleAccelerationRuntimeArtifactPublication {
  assetKey: DurationRuntimeConsumerObservedArtifact['assetKey']
  publicationKey: string
  publicationStatus?: string | null
  sourceEvidenceRefs?: string[] | null
  observationContext?: Record<string, unknown> | null
}

export interface RecordScheduleAccelerationRuntimeConsumptionInput {
  queryExec: DurationRuntimeConsumerObservationQueryExec
  runtimeArtifactPublications: readonly ScheduleAccelerationRuntimeArtifactPublication[]
  projectId?: string | null
  runtimeEntryRef?: string
  observedAt?: string
}

export interface RecordScheduleAccelerationRecommendationAdoptionInput {
  projectId?: string | null
  adoptedBy?: string | null
  recommendationId?: string | null
  recommendationHash?: string | null
  taskCommitRequestId?: string | null
  adoptedAt?: string | null
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
}

export interface ScheduleAccelerationRecommendationAdoptionResult {
  adopted: boolean
  recommendationKey: string
  adoptedAt: string
  constructionOrganizationRecommendationDecision: {
    source: 'construction_organization_plan_network_runtime_evidence_service'
    status: 'recommendation_decision_recorded' | 'recommendation_decision_blocked'
    recommendationKind: 'construction_organization_plan_network'
    recommendationKey: string | null
    actionType: string | null
    decisionPersisted: boolean
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
    reasons: string[]
    boundaryPolicy: string[]
  } | null
  constructionOrganizationSavedOutcome: {
    source: 'construction_organization_plan_network_runtime_evidence_service'
    status: 'saved_network_outcome_recorded' | 'saved_network_outcome_blocked'
    publicationKey: string | null
    outcomeStatus: string | null
    outcomePersisted: boolean
    writesTaskDependencies: false
    writesPlanDates: false
    writesSeed: false
    writesBaseline: false
    writesCriticalPathFacts: false
    writesAccelerationDraft: false
    reasons: string[]
    boundaryPolicy: string[]
  } | null
}

type ProjectRemainingForecastRuntimeResult = {
  rowsEvaluated: number
  projectRemainingForecast: ProjectRemainingDurationForecast
}

const SCHEDULE_ACCELERATION_RUNTIME_CONSUMER_ASSET_KEYS = new Set([
  'critical_path_rule_candidate',
  CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
])
const CONSTRUCTION_ORGANIZATION_ACCELERATION_USE_CASE = 'accelerationRecovery'
const PROJECT_REMAINING_FORECAST_CACHE_TTL_MS = 30_000
const DEFAULT_RUNTIME_ROWS_READ_TIMEOUT_MS = 1_500
const DEFAULT_RUNTIME_OPTIONAL_READ_TIMEOUT_MS = 500
const DEFAULT_RUNTIME_SUGGESTION_TIMEOUT_MS = 500
const DEFAULT_RUNTIME_TASK_FORECAST_MAX_AGE_MS = 36 * 60 * 60 * 1000
const projectRemainingForecastRuntimeCache = new Map<string, {
  expiresAt: number
  promise: Promise<ProjectRemainingForecastRuntimeResult>
}>()

export class ProjectRemainingForecastUnavailableError extends Error {
  readonly code = 'PROJECT_REMAINING_FORECAST_UNAVAILABLE'
  readonly degradationReason = 'runtime_evidence_unavailable'

  constructor(message: string, readonly operation: string) {
    super(message)
    this.name = 'ProjectRemainingForecastUnavailableError'
  }
}

class ScheduleAccelerationRuntimeReadTimeoutError extends Error {
  constructor(readonly operation: string, readonly timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`)
    this.name = 'ScheduleAccelerationRuntimeReadTimeoutError'
  }
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

async function withRuntimeReadBudget<T>(
  operation: string,
  promiseLike: PromiseLike<T>,
  timeoutMs: number,
): Promise<T> {
  if (timeoutMs <= 0) return Promise.resolve(promiseLike)
  let timeout: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      Promise.resolve(promiseLike),
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new ScheduleAccelerationRuntimeReadTimeoutError(operation, timeoutMs))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

async function withRuntimeOptionalRead<T>(
  operation: string,
  promiseLike: PromiseLike<T>,
  fallback: T,
  timeoutMs = readPositiveIntegerEnv('SCHEDULE_ACCELERATION_RUNTIME_OPTIONAL_READ_TIMEOUT_MS', DEFAULT_RUNTIME_OPTIONAL_READ_TIMEOUT_MS),
): Promise<T> {
  try {
    return await withRuntimeReadBudget(operation, promiseLike, timeoutMs)
  } catch (error) {
    logger.warn('[scheduleAccelerationRuntimeService] optional runtime forecast input skipped', {
      operation,
      error: error instanceof Error ? error.message : String(error),
    })
    return fallback
  }
}

export function clearProjectRemainingForecastRuntimeCacheForTest() {
  projectRemainingForecastRuntimeCache.clear()
}

const RUNTIME_TASK_COLUMNS = [
  'id',
  'project_id',
  'parent_id',
  'title',
  'planned_start_date',
  'planned_end_date',
  'start_date',
  'end_date',
  'status',
  'progress',
  'actual_start_date',
  'actual_end_date',
  'wbs_level',
  'sort_order',
  'engineering_category_id',
  'specialty_type',
  'engineering_object_id',
  'building_object_id',
  'basement_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
  'phase_object_id',
  'section_object_id',
  'floor_object_id',
  'wbs_node_type',
  'is_wbs_summary',
  'is_executable',
  'duration_contribution_mode',
  'standard_work_code',
  'standard_work_name',
  'is_milestone',
  'is_critical',
  'total_float_days',
  'free_float_days',
  'standard_task_metadata',
] as const

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function buildScheduleAccelerationRuntimeConsumedArtifacts(input: {
  runtimeArtifactPublications: readonly ScheduleAccelerationRuntimeArtifactPublication[]
  projectId?: string | null
}): DurationRuntimeConsumerObservedArtifact[] {
  const projectId = normalizeText(input.projectId)
  return input.runtimeArtifactPublications
    .filter((publication) => SCHEDULE_ACCELERATION_RUNTIME_CONSUMER_ASSET_KEYS.has(publication.assetKey))
    .filter((publication) => normalizeText(publication.publicationKey))
    .map((publication) => ({
      assetKey: publication.assetKey,
      publicationKey: normalizeText(publication.publicationKey),
      publicationStatus: publication.publicationStatus,
      sourceEvidenceRefs: publication.sourceEvidenceRefs,
      observationContext: {
        ...(publication.observationContext ?? {}),
        projectId: projectId || null,
        runtimeConsumer: 'scheduleAccelerationRuntimeService',
      },
    }))
}

export function recordScheduleAccelerationRuntimeConsumption(
  input: RecordScheduleAccelerationRuntimeConsumptionInput,
): Promise<DurationRuntimeConsumerFacadeArtifactsResult> {
  const projectId = normalizeText(input.projectId)
  return recordScheduleAccelerationRuntimeConsumedArtifacts({
    queryExec: input.queryExec,
    runtimeEntryRef: input.runtimeEntryRef,
    observedAt: input.observedAt,
    callContext: {
      projectId: projectId || null,
      runtimeConsumer: 'scheduleAccelerationRuntimeService',
    },
    sourceEvidenceRefs: [
      ['schedule_acceleration_runtime', projectId || 'no_project'].join(':'),
    ],
    artifacts: buildScheduleAccelerationRuntimeConsumedArtifacts({
      runtimeArtifactPublications: input.runtimeArtifactPublications,
      projectId,
    }),
  })
}

function normalizeDependencyType(value: unknown): ScheduleAccelerationDependency['dependencyType'] {
  const dependencyType = normalizeText(value).toUpperCase()
  if (dependencyType === 'SS' || dependencyType === 'FF' || dependencyType === 'SF') return dependencyType
  return 'FS'
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hasObjectValue(value: unknown) {
  return Object.keys(readRecord(value)).length > 0
}

function stableCacheValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null) return null
  if (typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => stableCacheValue(item, seen))
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      const nextValue = (value as Record<string, unknown>)[key]
      if (typeof nextValue !== 'undefined') {
        result[key] = stableCacheValue(nextValue, seen)
      }
      return result
    }, {})
}

function buildProjectRemainingForecastCacheKey(params: {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  context?: ScheduleAccelerationContext
}) {
  const projectId = normalizeText(params.projectId)
  if (!projectId) return null
  return JSON.stringify(stableCacheValue({
    projectId,
    targetEndDate: normalizeDate(params.targetEndDate),
    asOfDate: normalizeDate(params.asOfDate),
    context: params.context ?? null,
  }))
}

function buildRuntimeDurationInputAssemblyEvidenceRef(projectId: string, runtimeContext?: Record<string, unknown> | null) {
  const t2Evidence = readRecord(runtimeContext?.t2RhythmScheduleEvidence ?? runtimeContext?.t2_rhythm_schedule_evidence)
  const assembly = readRecord(t2Evidence.durationInputAssembly ?? t2Evidence.duration_input_assembly)
  if (!hasObjectValue(assembly)) return null
  return ['duration_input_assembly', projectId || 'no_project', 'schedule_acceleration'].join(':')
}

function buildScheduleAccelerationRuntimeSourceEvidenceRefs(
  projectId: string,
  runtimeContext?: Record<string, unknown> | null,
) {
  return [
    ['schedule_acceleration_runtime', projectId || 'no_project'].join(':'),
    buildRuntimeDurationInputAssemblyEvidenceRef(projectId, runtimeContext),
  ].filter((ref): ref is string => Boolean(ref))
}

function buildRuntimeDurationInputAssemblyEvidence(
  assembled: Awaited<ReturnType<typeof assembleDurationInput>>,
  existingEvidence?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const assemblyGate = readRecord(assembled.assemblyGate)
  const hasT2AssemblyEvidence = assembled.sourceLineage.some((lineage) => normalizeText(lineage.channel).startsWith('t2Rhythm'))
    || hasObjectValue(existingEvidence)
    || normalizeText(assemblyGate.status) !== 'not_applicable'
    || assembled.assetConsumptionReceipts.length > 0
  if (!hasT2AssemblyEvidence) return existingEvidence && hasObjectValue(existingEvidence) ? existingEvidence : null

  return {
    ...readRecord(existingEvidence),
    source: 'schedule_acceleration_runtime_duration_input_assembly',
    durationInputAssembly: {
      inputChannels: assembled.inputChannels,
      sourceLineage: assembled.sourceLineage,
      assemblyGate: assembled.assemblyGate,
      assetConsumptionReceipts: assembled.assetConsumptionReceipts,
      assetConsumptionSummary: assembled.assetConsumptionSummary,
      mutationBoundary: assembled.mutationBoundary,
    },
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesRuntimePublications: false,
  }
}

function readRuntimeRowProjectionMode(task: Task, metadata: Record<string, unknown>) {
  const mode = normalizeText(metadata.rowProjectionMode ?? metadata.row_projection_mode)
  return mode || 'schedule_row'
}

function readRuntimeDurationContributionMode(task: Task, metadata: Record<string, unknown>) {
  if (task.is_wbs_summary === true || task.is_executable === false) return 'summary_only'
  const mode = normalizeText(
    task.duration_contribution_mode
      ?? metadata.durationContributionMode
      ?? metadata.duration_contribution_mode,
  )
  if (mode) return mode
  if (task.is_milestone) return 'handover_marker'
  return 'duration_bearing'
}

function mapDependencySourceType(sourceType: unknown): ScheduleAccelerationDependency['source'] {
  const source = normalizeText(sourceType)
  if (source === 'cross_item_workflow' || source === 'dependency_intent_template' || source === 'sibling_sequence' || source === 'phase_chain') {
    return source
  }
  return source || 'manual'
}

function normalizeDate(value: unknown) {
  return normalizeDateOnlyText(typeof value === 'string' || value instanceof Date ? value : null)
}

function latestDate(dates: Array<string | null | undefined>) {
  return dates
    .map(normalizeDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(-1) ?? null
}

function addInclusiveRemainingDays(anchorDate: string | null | undefined, days: number | null | undefined) {
  const anchor = normalizeDate(anchorDate)
  const normalizedDays = Math.max(0, Math.ceil(Number(days ?? 0)))
  if (!anchor || normalizedDays <= 0) return anchor
  const next = new Date(`${anchor}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + normalizedDays - 1)
  return next.toISOString().slice(0, 10)
}

function earliestDate(dates: Array<string | null | undefined>) {
  return dates
    .map(normalizeDate)
    .filter((date): date is string => Boolean(date))
    .sort()
    .at(0) ?? null
}

function readOptionalNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function uniqueText(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) return uniqueText(value.map((item) => normalizeText(item)))
  const text = normalizeText(value)
  return text ? [text] : []
}

function firstRecord(...values: unknown[]) {
  return values.find((value): value is Record<string, unknown> => {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  }) ?? null
}

function readNestedRecord(record: Record<string, unknown> | null | undefined, ...keys: string[]) {
  let current: unknown = record
  for (const key of keys) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[key]
  }
  return current && typeof current === 'object' && !Array.isArray(current)
    ? current as Record<string, unknown>
    : null
}

export function buildScheduleAccelerationRecommendationKey(input: {
  recommendationId?: string | null
  taskCommitRequestId?: string | null
}) {
  const recommendationId = normalizeText(input.recommendationId)
  const taskCommitRequestId = normalizeText(input.taskCommitRequestId)
  if (!recommendationId || !taskCommitRequestId) {
    throw Object.assign(new Error('Recommendation and task commit identities are required.'), {
      code: 'ACCELERATION_ADOPTION_IDENTITY_REQUIRED',
      statusCode: 400,
    })
  }
  return ['schedule_acceleration', recommendationId, taskCommitRequestId].join(':')
}

function isUniqueRecommendationActionConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /23505|duplicate key|unique constraint|recommendation_actions_unique_action/i.test(message)
}

function buildConstructionOrganizationRecommendationKey(input: {
  publicationKey?: string | null
  draftNetworkKey?: string | null
  optionId?: string | null
  useCase?: string | null
}) {
  const scopedIdentity = [
    normalizeText(input.publicationKey),
    normalizeText(input.draftNetworkKey),
    normalizeText(input.optionId),
    normalizeText(input.useCase),
  ].filter(Boolean).join(':')
  const identity = scopedIdentity || normalizeText(input.publicationKey)
    || normalizeText(input.draftNetworkKey)
    || normalizeText(input.optionId)
  return identity ? `${CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY}:${identity}` : null
}

function buildConstructionOrganizationOutcomeId(input: {
  publicationKey?: string | null
  draftNetworkKey?: string | null
  optionId?: string | null
  useCase?: string | null
}) {
  const scopedIdentity = [
    normalizeText(input.publicationKey),
    normalizeText(input.draftNetworkKey),
    normalizeText(input.optionId),
    normalizeText(input.useCase),
  ].filter(Boolean).join(':')
  const identity = scopedIdentity || normalizeText(input.publicationKey)
  return identity ? `construction-organization-plan-network-outcome:${identity}` : null
}

function extractConstructionOrganizationRecommendationDecisionFromAccelerationProposal(
  proposal: Partial<ScheduleAccelerationProposal> | null | undefined,
) {
  const proposalRecord = readRecord(proposal)
  const calculationBasis = readRecord(proposalRecord.calculationBasis)
  const scenario = readRecord(calculationBasis.constructionOrganizationScenario)
  const draftRecommendations = readRecord(scenario.planNetworkDraftRecommendations)
  const accelerationDraftRecommendation = readRecord(draftRecommendations.accelerationRecovery)
  const organizationDecisionReport = readRecord(scenario.organizationDecisionReport)
  const selectedByUseCase = readRecord(organizationDecisionReport.selectedByUseCase)
  const accelerationUseCaseDecision = readRecord(selectedByUseCase.accelerationRecovery)
  const recommendedPlanOption = readRecord(scenario.recommendedPlanOption)
  const source = firstRecord(
    accelerationDraftRecommendation,
    accelerationUseCaseDecision,
    recommendedPlanOption,
    scenario,
  )
  if (!source) return null

  const optionId = normalizeText(
    accelerationDraftRecommendation.optionId
      ?? accelerationUseCaseDecision.optionId
      ?? recommendedPlanOption.optionId
      ?? source.optionId,
  )
  const draftNetworkKey = normalizeText(
    accelerationDraftRecommendation.draftNetworkKey
      ?? recommendedPlanOption.draftNetworkKey
      ?? source.draftNetworkKey,
  )
  const publicationKey = normalizeText(
    accelerationDraftRecommendation.publicationKey
      ?? recommendedPlanOption.publicationKey
      ?? source.publicationKey,
  )
  const businessType = normalizeText(
    accelerationDraftRecommendation.businessType
      ?? recommendedPlanOption.businessType
      ?? readNestedRecord(organizationDecisionReport, 'decisionSignals')?.businessType
      ?? scenario.businessType,
  )
  const recommendationKey = buildConstructionOrganizationRecommendationKey({
    publicationKey,
    draftNetworkKey,
    optionId,
    useCase: CONSTRUCTION_ORGANIZATION_ACCELERATION_USE_CASE,
  })

  if (!recommendationKey || !businessType) return null

  const selectedScenarioIds = uniqueText([
    ...readStringArray(accelerationDraftRecommendation.selectedScenarioIds),
    ...readStringArray(accelerationUseCaseDecision.selectedScenarioIds),
    ...readStringArray(recommendedPlanOption.selectedScenarioIds),
    ...readStringArray(scenario.recommendedScenarioIds),
  ])

  return {
    optionId: optionId || null,
    draftNetworkKey: draftNetworkKey || null,
    publicationKey: publicationKey || null,
    recommendationKey,
    businessType,
    selectedScenarioIds,
  }
}

async function recordLinkedConstructionOrganizationRecommendationDecision(input: {
  projectId: string
  adoptedBy: string | null
  adoptedAt: string
  proposal: Partial<ScheduleAccelerationProposal> | null | undefined
  scheduleAccelerationRecommendationKey: string
}): Promise<ScheduleAccelerationRecommendationAdoptionResult['constructionOrganizationRecommendationDecision']> {
  const decision = extractConstructionOrganizationRecommendationDecisionFromAccelerationProposal(input.proposal)
  if (!decision) return null

  const actionContext = {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    decisionSource: 'schedule_acceleration_recommendation_adoption',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    projectId: input.projectId,
    businessType: decision.businessType,
    useCase: CONSTRUCTION_ORGANIZATION_ACCELERATION_USE_CASE,
    optionId: decision.optionId,
    draftNetworkKey: decision.draftNetworkKey,
    publicationKey: decision.publicationKey,
    selectedScenarioIds: decision.selectedScenarioIds,
    linkedScheduleAccelerationRecommendationKey: input.scheduleAccelerationRecommendationKey,
    decisionAction: 'adopted',
    decidedBy: input.adoptedBy,
    decidedAt: input.adoptedAt,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'runtime_evidence_service_records_observation_followup_only',
      'plan_network_runtime_apply_is_owned_by_domain_writer',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_fact_acceleration_draft_or_critical_path_facts',
      'linked_from_user_adopted_schedule_acceleration_proposal_with_plan_network_identity',
    ],
  }

  try {
    await executeSQL(
      `INSERT INTO recommendation_actions (
          project_id,
          recommendation_kind,
          recommendation_key,
          action_type,
          target_end_date,
          natural_end_date,
          total_recover_days,
          acceleration_target_days,
          adopted_at,
          adopted_by,
          action_context,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.projectId,
        CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
        decision.recommendationKey,
        'adopted',
        null,
        null,
        null,
        null,
        input.adoptedAt,
        input.adoptedBy,
        actionContext,
        input.adoptedAt,
      ],
    )
  } catch (error) {
    if (!isUniqueRecommendationActionConflict(error)) {
      throw error
    }
    await executeSQL(
      `UPDATE recommendation_actions
          SET adopted_at = ?,
              adopted_by = ?,
              action_context = ?
        WHERE project_id = ?
          AND recommendation_kind = ?
          AND recommendation_key = ?
          AND action_type = ?`,
      [
        input.adoptedAt,
        input.adoptedBy,
        actionContext,
        input.projectId,
        CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
        decision.recommendationKey,
        'adopted',
      ],
    )
  }

  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'recommendation_decision_recorded',
    recommendationKind: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    recommendationKey: decision.recommendationKey,
    actionType: 'adopted',
    decisionPersisted: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: actionContext.boundaryPolicy,
  }
}

async function recordLinkedConstructionOrganizationSavedOutcome(input: {
  projectId: string
  adoptedBy: string | null
  adoptedAt: string
  proposal: Partial<ScheduleAccelerationProposal> | null | undefined
  scheduleAccelerationRecommendationKey: string
  outcomeRef?: string | null
  outcomeMetadata?: Record<string, unknown> | null
}): Promise<ScheduleAccelerationRecommendationAdoptionResult['constructionOrganizationSavedOutcome']> {
  const decision = extractConstructionOrganizationRecommendationDecisionFromAccelerationProposal(input.proposal)
  const outcomeRef = normalizeText(input.outcomeRef)
  if (!decision?.publicationKey || !decision.businessType || !outcomeRef) return null

  const metadata = {
    ...(input.outcomeMetadata ?? {}),
    source: 'construction_organization_plan_network_runtime_evidence_service',
    outcomeSource: 'schedule_acceleration_reschedule_commit',
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    duration_day_unit: 'construction_production_day',
    durationDayUnit: 'construction_production_day',
    projectId: input.projectId,
    businessType: decision.businessType,
    useCase: CONSTRUCTION_ORGANIZATION_ACCELERATION_USE_CASE,
    optionId: decision.optionId,
    draftNetworkKey: decision.draftNetworkKey,
    publicationKey: decision.publicationKey,
    selectedScenarioIds: decision.selectedScenarioIds,
    linkedScheduleAccelerationRecommendationKey: input.scheduleAccelerationRecommendationKey,
    adoptedBy: input.adoptedBy,
    adoptedAt: input.adoptedAt,
    writesRuntimeDirectly: false,
    writesFactDirectly: false,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    boundaryPolicy: [
      'saved_outcome_requires_published_plan_network_identity',
      'saved_outcome_requires_real_task_list_commit_ref',
      'runtime_evidence_service_records_observation_followup_only',
      'does_not_write_task_dependencies_or_plan_dates',
      'does_not_write_seed_baseline_task_fact_acceleration_draft_or_critical_path_facts',
    ],
  }

  const outcomeId = buildConstructionOrganizationOutcomeId({
    publicationKey: decision.publicationKey,
    draftNetworkKey: decision.draftNetworkKey,
    optionId: decision.optionId,
    useCase: CONSTRUCTION_ORGANIZATION_ACCELERATION_USE_CASE,
  })
  if (!outcomeId) return null
  const existingOutcomes = await executeSQL<{ id?: string | null }>(
    `SELECT id
       FROM duration_plan_network_outcomes
      WHERE id = ?
      LIMIT 1`,
    [outcomeId],
  )
  const existingOutcomeId = normalizeText(existingOutcomes[0]?.id)
  const persistedValues = [
    'accepted',
    outcomeRef,
    'project',
    'schedule_acceleration_reschedule_commit',
    null,
    input.projectId,
    decision.publicationKey,
    metadata,
    input.adoptedAt,
    false,
    false,
  ]

  if (existingOutcomeId) {
    await executeSQL(
      `UPDATE duration_plan_network_outcomes
          SET outcome_status = ?,
              outcome_ref = ?,
              learning_scope = ?,
              learning_scope_source = ?,
              company_id = ?,
              project_id = ?,
              publication_key = ?,
              metadata = ?,
              observed_at = ?,
              writes_runtime_directly = ?,
              writes_fact_directly = ?
        WHERE id = ?`,
      [...persistedValues, outcomeId],
    )
  } else {
    await executeSQL(
      `INSERT INTO duration_plan_network_outcomes (
          id,
          asset_key,
          outcome_status,
          outcome_ref,
          learning_scope,
          learning_scope_source,
          company_id,
          project_id,
          publication_key,
          metadata,
          observed_at,
          writes_runtime_directly,
          writes_fact_directly
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        outcomeId,
      CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
        ...persistedValues,
      ],
    )
  }

  return {
    source: 'construction_organization_plan_network_runtime_evidence_service',
    status: 'saved_network_outcome_recorded',
    publicationKey: decision.publicationKey,
    outcomeStatus: 'accepted',
    outcomePersisted: true,
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesSeed: false,
    writesBaseline: false,
    writesCriticalPathFacts: false,
    writesAccelerationDraft: false,
    reasons: [],
    boundaryPolicy: metadata.boundaryPolicy,
  }
}

async function recordLinkedConstructionOrganizationRuntimeConsumerObservation(input: {
  projectId: string
  adoptedAt: string
  proposal: Partial<ScheduleAccelerationProposal> | null | undefined
  scheduleAccelerationRecommendationKey: string
  savedOutcome: ScheduleAccelerationRecommendationAdoptionResult['constructionOrganizationSavedOutcome']
  outcomeRef?: string | null
  queryExec?: DurationRuntimeConsumerObservationQueryExec | null
}) {
  if (!input.queryExec || input.savedOutcome?.status !== 'saved_network_outcome_recorded') return

  const decision = extractConstructionOrganizationRecommendationDecisionFromAccelerationProposal(input.proposal)
  const outcomeRef = normalizeText(input.outcomeRef)
  if (!decision?.publicationKey || !decision.businessType || !outcomeRef) return

  await recordScheduleAccelerationRuntimeConsumedArtifacts({
    queryExec: input.queryExec,
    runtimeEntryRef: 'scheduleAccelerationRuntimeService:recordScheduleAccelerationRecommendationAdoption',
    observedAt: input.adoptedAt,
    callContext: {
      projectId: input.projectId,
      runtimeConsumer: 'scheduleAccelerationRuntimeService',
      consumerTrigger: 'schedule_acceleration_recommendation_adoption',
      linkedScheduleAccelerationRecommendationKey: input.scheduleAccelerationRecommendationKey,
    },
    sourceEvidenceRefs: [
      `schedule_acceleration_adoption:${input.projectId}`,
      `duration_plan_network_outcomes:${decision.publicationKey}`,
      outcomeRef,
    ],
    artifacts: [
      {
        assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
        publicationKey: decision.publicationKey,
        publicationStatus: 'runtime_published',
        sourceEvidenceRefs: [
          `duration_plan_network_outcomes:${decision.publicationKey}`,
          outcomeRef,
        ],
        observationContext: {
          projectId: input.projectId,
          runtimeConsumer: 'scheduleAccelerationRuntimeService',
          consumerTrigger: 'schedule_acceleration_recommendation_adoption',
          businessType: decision.businessType,
          useCase: CONSTRUCTION_ORGANIZATION_ACCELERATION_USE_CASE,
          optionId: decision.optionId,
          draftNetworkKey: decision.draftNetworkKey,
          selectedScenarioIds: decision.selectedScenarioIds,
          outcomeRef,
          outcomeSource: 'schedule_acceleration_reschedule_commit',
          linkedScheduleAccelerationRecommendationKey: input.scheduleAccelerationRecommendationKey,
        },
      },
    ],
  })
}

async function persistScheduleAccelerationRecommendationAdoption(
  input: {
    projectId: string
    adoptedBy: string
    adoptedAt: string
    recommendationId: string
    recommendationHash: string
    operationsHash: string
    taskCommitLedgerId: string
    taskCommitRequestId: string
    taskCommitCompletedAt: string | null
    taskCommitResultSummary: Record<string, unknown>
    proposal: ScheduleAccelerationProposal
    outcomeRef: string
    outcomeMetadata: Record<string, unknown>
    runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  },
): Promise<ScheduleAccelerationRecommendationAdoptionResult> {
  const projectId = normalizeText(input.projectId)
  if (!projectId) {
    throw new Error('PROJECT_ID_REQUIRED')
  }
  const adoptedBy = normalizeText(input.adoptedBy) || null
  const adoptedAt = normalizeText(input.adoptedAt) || new Date().toISOString()
  const recommendationKey = buildScheduleAccelerationRecommendationKey({
    recommendationId: input.recommendationId,
    taskCommitRequestId: input.taskCommitRequestId,
  })
  const proposal = input.proposal
  const targetEndDate = normalizeDate(proposal.targetEndDate)
  const naturalEndDate = normalizeDate(proposal.naturalEndDate)
  const totalRecoverDays = readOptionalNumber(proposal.totalRecoverDays)
  const accelerationTargetDays = readOptionalNumber(proposal.accelerationTargetDays)
  const actionContext = {
    proposal,
    source: 'target_acceleration_review_panel',
    policy: 'user_adoption_required_for_acceleration_backtest',
    recommendationId: input.recommendationId,
    recommendationHash: input.recommendationHash,
    operationsHash: input.operationsHash,
    taskCommitLedgerId: input.taskCommitLedgerId,
    taskCommitRequestId: input.taskCommitRequestId,
    taskCommitCompletedAt: input.taskCommitCompletedAt,
    taskCommitResultSummary: input.taskCommitResultSummary,
  }

  const existingActions = await executeSQL<{ id?: string | null; adopted_at?: string | null }>(
    `SELECT id, adopted_at
       FROM recommendation_actions
      WHERE project_id = ?
        AND recommendation_kind = ?
        AND recommendation_key = ?
        AND action_type = ?
      LIMIT 1`,
    [projectId, 'schedule_acceleration', recommendationKey, 'adopted'],
  )
  const existingActionId = normalizeText(existingActions[0]?.id)
  if (existingActionId) {
    return {
      adopted: true,
      recommendationKey,
      adoptedAt: normalizeText(existingActions[0]?.adopted_at) || adoptedAt,
      constructionOrganizationRecommendationDecision: null,
      constructionOrganizationSavedOutcome: null,
    }
  }

  const updateParams = [
    targetEndDate,
    naturalEndDate,
    totalRecoverDays,
    accelerationTargetDays,
    adoptedAt,
    adoptedBy,
    actionContext,
  ]

  try {
    await executeSQL(
        `INSERT INTO recommendation_actions (
            project_id,
            recommendation_kind,
            recommendation_key,
            action_type,
            target_end_date,
            natural_end_date,
            total_recover_days,
            acceleration_target_days,
            adopted_at,
            adopted_by,
            action_context,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          'schedule_acceleration',
          recommendationKey,
          'adopted',
          ...updateParams,
          adoptedAt,
        ],
    )
  } catch (error) {
    if (!isUniqueRecommendationActionConflict(error)) {
      throw error
    }
    return {
      adopted: true,
      recommendationKey,
      adoptedAt,
      constructionOrganizationRecommendationDecision: null,
      constructionOrganizationSavedOutcome: null,
    }
  }

  const constructionOrganizationRecommendationDecision =
    await recordLinkedConstructionOrganizationRecommendationDecision({
      projectId,
      adoptedBy,
      adoptedAt,
      proposal,
      scheduleAccelerationRecommendationKey: recommendationKey,
    })
  const constructionOrganizationSavedOutcome =
    await recordLinkedConstructionOrganizationSavedOutcome({
      projectId,
      adoptedBy,
      adoptedAt,
      proposal,
      scheduleAccelerationRecommendationKey: recommendationKey,
      outcomeRef: input.outcomeRef,
      outcomeMetadata: input.outcomeMetadata,
    })
  await recordLinkedConstructionOrganizationRuntimeConsumerObservation({
    projectId,
    adoptedAt,
    proposal,
    scheduleAccelerationRecommendationKey: recommendationKey,
    savedOutcome: constructionOrganizationSavedOutcome,
    outcomeRef: input.outcomeRef,
    queryExec: input.runtimeConsumerObservationQueryExec,
  })

  return {
    adopted: true,
    recommendationKey,
    adoptedAt,
    constructionOrganizationRecommendationDecision,
    constructionOrganizationSavedOutcome,
  }
}

export async function recordScheduleAccelerationRecommendationAdoption(
  input: RecordScheduleAccelerationRecommendationAdoptionInput,
): Promise<ScheduleAccelerationRecommendationAdoptionResult> {
  const projectId = normalizeText(input.projectId)
  const adoptedBy = normalizeText(input.adoptedBy)
  const adoptedAt = normalizeText(input.adoptedAt) || new Date().toISOString()

  return withDatabaseTransaction(async () => {
    const authority = await authorizeScheduleAccelerationRecommendationAdoption({
      projectId,
      adoptedBy,
      recommendationId: normalizeText(input.recommendationId),
      recommendationHash: normalizeText(input.recommendationHash),
      taskCommitRequestId: normalizeText(input.taskCommitRequestId),
      now: new Date(adoptedAt),
    })
    const outcomeRef = `task-list-commit:${projectId}:${authority.taskCommitRequestId}:acceleration-reschedule`
    const outcomeMetadata = {
      source: 'authoritative_task_commit_ledger',
      taskCommitLedgerId: authority.taskCommitLedgerId,
      taskCommitRequestId: authority.taskCommitRequestId,
      taskCommitCompletedAt: authority.taskCommitCompletedAt,
      recommendationId: authority.recommendationId,
      recommendationHash: authority.recommendationHash,
      operationsHash: authority.operationsHash,
      operationCount: authority.proposal.rescheduleDraft?.operations.length ?? 0,
      taskCommitResultSummary: authority.taskCommitResultSummary,
    }

    return persistScheduleAccelerationRecommendationAdoption({
      projectId,
      adoptedBy,
      adoptedAt,
      recommendationId: authority.recommendationId,
      recommendationHash: authority.recommendationHash,
      operationsHash: authority.operationsHash,
      taskCommitLedgerId: authority.taskCommitLedgerId,
      taskCommitRequestId: authority.taskCommitRequestId,
      taskCommitCompletedAt: authority.taskCommitCompletedAt,
      taskCommitResultSummary: authority.taskCommitResultSummary,
      proposal: authority.proposal,
      outcomeRef,
      outcomeMetadata,
      runtimeConsumerObservationQueryExec: input.runtimeConsumerObservationQueryExec,
    })
  })
}

async function loadPersistedAccelerationRecommendationAdoption(projectId: string) {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return null
  try {
    const rows = await executeSQL<{
      id?: string | null
      recommendation_key?: string | null
      adopted_at?: string | null
      action_context?: Record<string, unknown> | null
    }>(
      `SELECT id, recommendation_key, adopted_at, action_context
         FROM recommendation_actions
        WHERE project_id = ?
          AND recommendation_kind = 'schedule_acceleration'
          AND action_type = 'adopted'
        ORDER BY adopted_at DESC, created_at DESC
        LIMIT 1`,
      [normalizedProjectId],
    )
    const row = rows[0]
    if (!row) return null
    return {
      id: normalizeText(row.id),
      recommendationKey: normalizeText(row.recommendation_key),
      adoptedAt: normalizeText(row.adopted_at),
      constructionOrganizationLineage: readConstructionOrganizationPlanNetworkRuntimeLineage(
        row.action_context,
        'scheduleAccelerationRuntimeService.persistedRecommendationAction',
      ),
    }
  } catch {
    return null
  }
}

type RuntimeTaskDependencyRead = {
  dependencies: TaskDependency[]
  degradationReasons: string[]
}

async function loadActiveTaskDependencies(projectId: string, taskIds: string[]): Promise<RuntimeTaskDependencyRead> {
  if (taskIds.length === 0) return { dependencies: [], degradationReasons: [] }
  const placeholders = taskIds.map(() => '?').join(', ')
  try {
    const dependencies = await executeSQL<TaskDependency>(
      `SELECT task_id, dependency_task_id, dependency_type, lag_days, required_for_start, source_type
         FROM task_dependencies
        WHERE project_id = ?
          AND status = 'active'
          AND task_id IN (${placeholders})
        ORDER BY created_at ASC, id ASC`,
      [projectId, ...taskIds],
    )
    return {
      dependencies: dependencies.filter((dependency) => dependency.required_for_start !== false),
      degradationReasons: [],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const recoverable = [
      'timed out after',
      'Query read timeout',
      'timeout exceeded',
      'Connection terminated',
      'connection timeout',
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
      'circuit is open',
    ].some((snippet) => message.includes(snippet))

    if (!recoverable) throw error

    logger.warn('[scheduleAccelerationRuntimeService] task dependency read skipped for project remaining forecast', {
      projectId,
      taskCount: taskIds.length,
      error: message,
      fallback: 'empty_dependencies',
    })
    return {
      dependencies: [],
      degradationReasons: ['task_dependencies_unavailable'],
    }
  }
}

export type RuntimeScheduleAccelerationRowsResult = {
  rows: ScheduleAccelerationRow[]
  degradationReasons: string[]
}

export async function buildRuntimeScheduleAccelerationRowsWithDiagnostics(
  projectId: string,
): Promise<RuntimeScheduleAccelerationRowsResult> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return { rows: [], degradationReasons: [] }

  const tasks = await getTasks(normalizedProjectId, { columns: RUNTIME_TASK_COLUMNS })
  const taskIds = tasks.map((task) => normalizeText(task.id)).filter(Boolean)
  const taskIdSet = new Set(taskIds)
  const dependencyRead = await loadActiveTaskDependencies(normalizedProjectId, taskIds)
  const dependenciesByTaskId = new Map<string, ScheduleAccelerationDependency[]>()

  for (const dependency of dependencyRead.dependencies) {
    const taskId = normalizeText(dependency.task_id)
    const dependencyTaskId = normalizeText(dependency.dependency_task_id)
    if (!taskId || !dependencyTaskId || !taskIdSet.has(taskId) || !taskIdSet.has(dependencyTaskId)) continue
    dependenciesByTaskId.set(taskId, [
      ...(dependenciesByTaskId.get(taskId) ?? []),
      {
        clientRowId: dependencyTaskId,
        dependencyType: normalizeDependencyType(dependency.dependency_type),
        lagDays: Number(dependency.lag_days ?? 0) || 0,
        source: mapDependencySourceType(dependency.source_type),
        relationRole: 'workflow',
      },
    ])
  }

  const rows = tasks.map((task) => {
    const metadata = readRecord(task.standard_task_metadata)
    return {
      clientRowId: normalizeText(task.id),
      values: {
        title: task.title,
        project_id: task.project_id ?? normalizedProjectId,
        parent_id: task.parent_id ?? null,
        planned_start_date: normalizeDate(task.planned_start_date ?? task.start_date),
        planned_end_date: normalizeDate(task.planned_end_date ?? task.end_date),
        start_date: normalizeDate(task.start_date),
        end_date: normalizeDate(task.end_date),
        actual_start_date: normalizeDate(task.actual_start_date),
        actual_end_date: normalizeDate(task.actual_end_date),
        status: task.status,
        progress: task.progress ?? 0,
        wbs_level: task.wbs_level ?? null,
        sort_order: task.sort_order ?? 0,
        engineering_category_id: task.engineering_category_id ?? null,
        engineering_category_name: task.engineering_category_name ?? null,
        specialty_type: task.specialty_type ?? null,
        engineering_object_id: task.engineering_object_id ?? null,
        building_object_id: task.building_object_id ?? null,
        basement_object_id: task.basement_object_id ?? null,
        physical_zone_object_id: task.physical_zone_object_id ?? null,
        functional_area_object_id: task.functional_area_object_id ?? null,
        duration_contribution_mode: readRuntimeDurationContributionMode(task, metadata),
        row_projection_mode: readRuntimeRowProjectionMode(task, metadata),
        standard_work_code: task.standard_work_code ?? null,
        standard_work_name: task.standard_work_name ?? null,
        wbs_node_type: task.wbs_node_type ?? null,
        is_wbs_summary: task.is_wbs_summary ?? null,
        is_executable: task.is_executable ?? null,
        is_milestone: task.is_milestone ?? false,
        is_critical: task.is_critical ?? false,
        phase_object_id: task.phase_object_id ?? null,
        section_object_id: task.section_object_id ?? null,
        floor_object_id: task.floor_object_id ?? null,
        total_float_days: readOptionalNumber(task.total_float_days),
        free_float_days: readOptionalNumber(task.free_float_days),
        standard_task_metadata: {
          ...metadata,
          criticalPathEligible: metadata.criticalPathEligible ?? metadata.critical_path_eligible ?? Boolean(task.is_critical),
        },
      },
      predecessorDependencies: dependenciesByTaskId.get(normalizeText(task.id)) ?? [],
      rowProjectionMode: readRuntimeRowProjectionMode(task, metadata) as ScheduleAccelerationRow['rowProjectionMode'],
      executionPhase: normalizeText(metadata.executionPhase ?? metadata.execution_phase) || null,
      executionLane: normalizeText(metadata.executionLane ?? metadata.execution_lane) || null,
    }
  })
  return { rows, degradationReasons: dependencyRead.degradationReasons }
}

export async function buildRuntimeScheduleAccelerationRows(projectId: string): Promise<ScheduleAccelerationRow[]> {
  return (await buildRuntimeScheduleAccelerationRowsWithDiagnostics(projectId)).rows
}

async function resolveRuntimeScheduleAccelerationContext(
  projectId: string,
  context?: ScheduleAccelerationContext,
): Promise<ScheduleAccelerationContext | undefined> {
  const assemblyInput = {
    projectId,
    projectGenerationFacts: context?.projectGenerationFacts ?? null,
    constructionOrganizationScenario: context?.constructionOrganizationScenario ?? null,
  }
  const assembled = await assembleDurationInput(
    assemblyInput,
    {
      purpose: 'schedule_acceleration',
      allowLiveProjectReread: true,
    },
  )
  const t2RhythmScheduleEvidence = buildRuntimeDurationInputAssemblyEvidence(
    assembled,
    readRecord(context?.runtime?.t2RhythmScheduleEvidence),
  )
  const projectGenerationFacts = hasObjectValue(assembled.projectGenerationFacts)
    ? assembled.projectGenerationFacts
    : null
  const hasResolvedEvidence = Boolean(
    projectGenerationFacts
      || assembled.constructionOrganizationScenario
      || t2RhythmScheduleEvidence,
  )
  if (!hasResolvedEvidence) return context
  const resolvedContext = {
    ...context,
    ...(projectGenerationFacts
      ? { projectGenerationFacts }
      : {}),
    constructionOrganizationScenario: context?.constructionOrganizationScenario
      ?? assembled.constructionOrganizationScenario
      ?? null,
    ...(t2RhythmScheduleEvidence
      ? {
          runtime: {
            ...(context?.runtime ?? {}),
            t2RhythmScheduleEvidence,
          },
        }
      : {}),
  } satisfies ScheduleAccelerationContext
  return resolvedContext
}

async function buildRuntimeForecastInputs(projectId: string, context?: ScheduleAccelerationContext, asOfDate?: string | null) {
  let rows: ScheduleAccelerationRow[]
  try {
    rows = await withRuntimeReadBudget(
      'runtime_schedule_rows',
      buildRuntimeScheduleAccelerationRows(projectId),
      readPositiveIntegerEnv('SCHEDULE_ACCELERATION_RUNTIME_ROWS_TIMEOUT_MS', DEFAULT_RUNTIME_ROWS_READ_TIMEOUT_MS),
    )
  } catch (error) {
    logger.warn('[scheduleAccelerationRuntimeService] runtime schedule rows unavailable for project remaining forecast', {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new ProjectRemainingForecastUnavailableError(
      'runtime schedule rows unavailable for project remaining forecast',
      'runtime_schedule_rows',
    )
  }
  if (rows.length === 0) {
    throw new ProjectRemainingForecastUnavailableError(
      'runtime schedule rows unavailable for project remaining forecast',
      'runtime_schedule_rows',
    )
  }
  const accelerationContext = await withRuntimeOptionalRead(
    'schedule_acceleration_context',
    resolveRuntimeScheduleAccelerationContext(projectId, context),
    context,
  )
  const hydrated = await withRuntimeOptionalRead(
    'runtime_engine_signals',
    hydrateRuntimeRowsWithEngineSignals(projectId, rows, asOfDate),
    {
      rows,
      criticalPathSnapshot: null as Awaited<ReturnType<typeof getProjectCriticalPathSnapshot>> | null,
    },
  )
  const runtimeContext = await withRuntimeOptionalRead(
    'runtime_recovery_context',
    buildRuntimeRecoveryContext(projectId, hydrated.rows),
    {},
  )
  const overrideRuntime = accelerationContext?.runtime ?? {}
  const overrideEvidenceCodes = (overrideRuntime.evidenceCodes ?? [])
    .filter((code) => normalizeText(code) !== 'acceleration_recommendation_adopted')
  const overrideEvidenceObjects = (overrideRuntime.evidenceObjects ?? [])
    .filter((item) => normalizeText(item?.code) !== 'acceleration_recommendation_adopted')
  const mergedRuntimeContext = {
    ...runtimeContext,
    ...overrideRuntime,
    accelerationRecommendationAdopted: runtimeContext.accelerationRecommendationAdopted === true,
    evidenceCodes: uniqueText([
      ...(runtimeContext.evidenceCodes ?? []),
      ...overrideEvidenceCodes,
    ]),
    evidenceObjects: [
      ...(runtimeContext.evidenceObjects ?? []),
      ...overrideEvidenceObjects,
    ],
  }
  const monthlyCommitments = await withRuntimeOptionalRead(
    'monthly_commitments',
    loadRuntimeMonthlyCommitmentSummary(projectId),
    {},
  )
  const constructionCalendar = await resolveRuntimeConstructionCalendar(projectId, accelerationContext)
  return {
    rows: hydrated.rows,
    criticalPathSnapshot: hydrated.criticalPathSnapshot,
    constructionCalendar,
    mergedRuntimeContext,
    monthlyCommitments,
    accelerationContext,
  }
}

async function resolveRuntimeConstructionCalendar(
  projectId: string,
  context?: ScheduleAccelerationContext,
): Promise<ConstructionCalendarContext | null> {
  const providedCalendar = context?.constructionCalendar ?? context?.workCalendar ?? null
  if (providedCalendar) return providedCalendar
  return withRuntimeOptionalRead(
    'construction_calendar',
    resolveConstructionCalendarContext({
      projectId,
      onError: (error) => {
        logger.warn('[scheduleAccelerationRuntimeService] failed to resolve construction calendar for runtime forecast', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        })
      },
    }),
    { basis: 'calendar_day', windows: [] },
  )
}

function isRuntimeDurationBearingRow(row: ScheduleAccelerationRow) {
  const mode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode)
  const contributionMode = normalizeText(row.values.duration_contribution_mode)
  return (!mode || mode === 'schedule_row') && contributionMode === 'duration_bearing'
}

function hasRuntimeRemainingForecastEvidence(rows: ScheduleAccelerationRow[]) {
  return rows.some((row) => {
    const mode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode)
    if (mode && mode !== 'schedule_row') return false
    const values = row.values
    return Boolean(
      normalizeDate(values.forecast_finish_date)
        ?? normalizeDate(values.planned_end_date ?? values.end_date)
        ?? normalizeDate(values.actual_end_date)
        ?? (readOptionalNumber(values.remaining_duration_days) != null ? 'remaining_duration_days' : null)
        ?? (readOptionalNumber(values.critical_path_span_days) != null ? 'critical_path_span_days' : null),
    )
  })
}

function assertRuntimeRemainingForecastEvidence(rows: ScheduleAccelerationRow[]) {
  if (hasRuntimeRemainingForecastEvidence(rows)) return
  throw new ProjectRemainingForecastUnavailableError(
    'runtime remaining forecast evidence unavailable',
    'runtime_remaining_forecast_evidence',
  )
}

async function loadRuntimeDurationSuggestion(projectId: string, row: ScheduleAccelerationRow) {
  if (!isRuntimeDurationBearingRow(row)) return null
  const taskId = normalizeText(row.clientRowId)
  if (!taskId) return null
  try {
    return await withRuntimeReadBudget(
      'task_duration_suggestion',
      getTaskDurationSuggestion({
        projectId,
        taskId,
        taskTitle: normalizeText(row.values.title) || null,
        standardWorkCode: normalizeText(row.values.standard_work_code) || null,
        standardWorkName: normalizeText(row.values.standard_work_name) || null,
        wbsNodeType: normalizeText(row.values.wbs_node_type) || null,
        plannedStartDate: normalizeDate(row.values.planned_start_date ?? row.values.start_date),
        plannedEndDate: normalizeDate(row.values.planned_end_date ?? row.values.end_date),
        actualStartDate: normalizeDate(row.values.actual_start_date),
        actualEndDate: normalizeDate(row.values.actual_end_date),
        progress: readOptionalNumber(row.values.progress),
        suggestionPurpose: 'execution_reference',
      }),
      readPositiveIntegerEnv(
        'SCHEDULE_ACCELERATION_RUNTIME_SUGGESTION_TIMEOUT_MS',
        DEFAULT_RUNTIME_SUGGESTION_TIMEOUT_MS,
      ),
    )
  } catch (error) {
    logger.warn('[scheduleAccelerationRuntimeService] task duration suggestion skipped for runtime forecast', {
      projectId,
      taskId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function hydrateRuntimeRowsWithEngineSignals(projectId: string, rows: ScheduleAccelerationRow[], asOfDate?: string | null) {
  const taskIds = rows.map((row) => normalizeText(row.clientRowId)).filter(Boolean)
  if (taskIds.length === 0) {
    return {
      rows,
      criticalPathSnapshot: null as Awaited<ReturnType<typeof getProjectCriticalPathSnapshot>> | null,
    }
  }

  const [criticalPathResult, forecastsResult] = await Promise.allSettled([
    withRuntimeOptionalRead('critical_path_snapshot', getProjectCriticalPathSnapshot(projectId), null),
    withRuntimeOptionalRead('task_duration_forecasts', listCurrentTaskDurationForecasts(taskIds, {
      projectId,
      maxAgeMs: readPositiveIntegerEnv(
        'SCHEDULE_ACCELERATION_RUNTIME_TASK_FORECAST_MAX_AGE_MS',
        DEFAULT_RUNTIME_TASK_FORECAST_MAX_AGE_MS,
      ),
    }), []),
  ])
  const criticalPath = criticalPathResult.status === 'fulfilled' ? criticalPathResult.value : null
  const forecasts = forecastsResult.status === 'fulfilled' ? forecastsResult.value : []
  const forecastByTaskId = new Map(forecasts.map((forecast) => [normalizeText(forecast.taskId), forecast]))
  const suggestionResults = await Promise.allSettled(rows.map(async (row) => ({
    taskId: normalizeText(row.clientRowId),
    suggestion: await loadRuntimeDurationSuggestion(projectId, row),
  })))
  const suggestionByTaskId = new Map<string, unknown>()
  for (const result of suggestionResults) {
    if (result.status !== 'fulfilled') continue
    if (!result.value.taskId || !result.value.suggestion) continue
    suggestionByTaskId.set(result.value.taskId, result.value.suggestion)
  }
  const criticalTaskIds = new Set([
    ...(criticalPath?.displayTaskIds ?? []),
    ...(criticalPath?.autoTaskIds ?? []),
  ].map(normalizeText).filter(Boolean))
  const criticalTaskById = new Map((criticalPath?.tasks ?? []).map((task) => [normalizeText(task.taskId), task]))
  const primaryChainTaskIds = new Set((criticalPath?.primaryChain?.taskIds ?? []).map(normalizeText).filter(Boolean))
  const primaryChainSpanDays = readOptionalNumber(criticalPath?.primaryChain?.totalDurationDays)
  const hasCriticalPathProjection = criticalTaskIds.size > 0 || criticalTaskById.size > 0

  const hydratedRows = rows.map((row) => {
    const taskId = normalizeText(row.clientRowId)
    const forecast = forecastByTaskId.get(taskId)
    const suggestion = suggestionByTaskId.get(taskId)
    const criticalTask = criticalTaskById.get(taskId)
    const p20RemainingDays = readOptionalNumber(forecast?.probabilityDuration?.p20RemainingDays)
    const p80RemainingDays = readOptionalNumber(forecast?.probabilityDuration?.p80RemainingDays)
    const values: ScheduleAccelerationRow['values'] = {
      ...row.values,
      ...(forecast?.forecastFinishDate ? { forecast_finish_date: forecast.forecastFinishDate } : {}),
      ...(forecast?.remainingDurationDays != null ? { remaining_duration_days: forecast.remainingDurationDays } : {}),
      ...(p20RemainingDays != null ? { forecast_p20_finish_date: addInclusiveRemainingDays(asOfDate, p20RemainingDays) } : {}),
      ...(p80RemainingDays != null ? { forecast_p80_finish_date: addInclusiveRemainingDays(asOfDate, p80RemainingDays) } : {}),
      ...(primaryChainTaskIds.has(taskId) && primaryChainSpanDays != null && primaryChainSpanDays > 0
        ? { critical_path_span_days: primaryChainSpanDays }
        : {}),
      ...(suggestion ? { duration_suggestion: suggestion } : {}),
    }
    if (hasCriticalPathProjection) {
      values.is_critical = criticalTaskIds.has(taskId)
      if (criticalTask?.floatDays != null) {
        values.total_float_days = criticalTask.floatDays
        if (criticalTaskIds.has(taskId)) values.free_float_days = 0
      }
    }
    return {
      ...row,
      values,
    }
  })

  return {
    rows: hydratedRows,
    criticalPathSnapshot: criticalPath,
  }
}

function isCompletedScheduleAccelerationRow(row: ScheduleAccelerationRow) {
  return normalizeText(row.values.status) === 'completed' ||
    normalizeDate(row.values.actual_end_date) !== null ||
    Number(row.values.progress ?? 0) >= 100
}

function buildCompletedProjectActualCompletion(rows: ScheduleAccelerationRow[]) {
  const scheduleRows = rows.filter((row) => {
    const mode = normalizeText(row.rowProjectionMode ?? row.values.row_projection_mode)
    return !mode || mode === 'schedule_row'
  })
  if (scheduleRows.length === 0) return null
  if (!scheduleRows.every(isCompletedScheduleAccelerationRow)) return null

  const actualFinishDate = latestDate(scheduleRows.map((row) => normalizeDate(row.values.actual_end_date)))
  if (!actualFinishDate) return null
  return { actualFinishDate }
}

function buildPredictionAnchoredActualContext(input: {
  source: string
  currentAsOfDate: string
  skippedCurrentDedupeKey: string
  extra?: Record<string, unknown>
}) {
  return {
    source: input.source,
    durationBasis: 'prediction_t0_to_actual_finish_window',
    currentAsOfDate: input.currentAsOfDate,
    skippedCurrentDedupeKey: input.skippedCurrentDedupeKey,
    ...(input.extra ?? {}),
  }
}

function isAccelerationRecommendationAdopted(runtime?: ScheduleAccelerationContext['runtime']) {
  return runtime?.accelerationRecommendationAdopted === true
}

async function recordProjectRemainingAccuracySnapshot(params: {
  projectId: string
  rows: ScheduleAccelerationRow[]
  forecast: ProjectRemainingDurationForecast
  constructionCalendar?: ConstructionCalendarContext | null
  asOfDate?: string | null
}) {
  const asOfDate = normalizeDate(params.asOfDate)
    ?? normalizeDate(params.forecast.projectRemainingForecast.asOf)
    ?? businessDateKey(new Date(), params.constructionCalendar?.timezone)
  const dedupeKey = `${params.projectId}:${asOfDate}:project_remaining_forecast`
  const actualCompletion = buildCompletedProjectActualCompletion(params.rows)
  if (actualCompletion) {
    await backtestEarliestPendingDurationAccuracyPrediction({
      projectId: params.projectId,
      engineCode: 'project_remaining_forecast',
      actualFinishDate: actualCompletion.actualFinishDate,
      actualContext: buildPredictionAnchoredActualContext({
        source: 'completed_runtime_schedule_rows',
        currentAsOfDate: asOfDate,
        skippedCurrentDedupeKey: dedupeKey,
      }),
    })
    return
  }

  if (
    params.forecast.projectRemainingForecast.availability !== 'available'
    || params.forecast.projectRemainingForecastDays === null
    || !params.forecast.forecastFinishDate
  ) {
    return
  }

  await recordDurationAccuracyPrediction(buildProjectRemainingForecastPredictionEvent({
    forecast: params.forecast,
    rows: params.rows,
    asOfDate,
    projectId: params.projectId,
    constructionCalendar: params.constructionCalendar,
  }))

}

async function recordAccelerationAccuracySnapshot(params: {
  projectId: string
  rows: ScheduleAccelerationRow[]
  targetFeasibility?: ScheduleTargetFeasibility
  runtimeContext?: ScheduleAccelerationContext['runtime']
  asOfDate?: string | null
  constructionOrganizationLineage?: ConstructionOrganizationPlanNetworkRuntimeLineage | null
  constructionCalendar?: ConstructionCalendarContext | null
}) {
  const proposal = params.targetFeasibility?.accelerationProposal
  const asOfDate = normalizeDate(params.asOfDate)
    ?? normalizeDate(params.targetFeasibility?.overshoot.asOf)
    ?? businessDateKey(new Date(), params.constructionCalendar?.timezone)
  const actualCompletion = buildCompletedProjectActualCompletion(params.rows)
  if (actualCompletion) {
    if (isAccelerationRecommendationAdopted(params.runtimeContext)) {
      const targetEndDate = normalizeDate(proposal?.targetEndDate)
      const naturalFinishDate = normalizeDate(proposal?.naturalEndDate)
      const actualRecoveryDays = naturalFinishDate
        ? Math.max(0, signedDurationDayDelta(actualCompletion.actualFinishDate, naturalFinishDate) ?? 0)
        : null
      await backtestEarliestPendingDurationAccuracyPrediction({
        projectId: params.projectId,
        engineCode: 'schedule_acceleration_target',
        actualFinishDate: actualCompletion.actualFinishDate,
        actualContext: mergeConstructionOrganizationLineageIntoContext(buildPredictionAnchoredActualContext({
          source: 'completed_runtime_schedule_rows',
          currentAsOfDate: asOfDate,
          skippedCurrentDedupeKey: `${params.projectId}:${asOfDate}:acceleration_target:${targetEndDate ?? 'no-target'}`,
          extra: {
            attribution: 'adopted_acceleration_recovery',
            naturalFinishDate,
            targetEndDate,
            actualRecoveryDays,
            targetHit: targetEndDate && actualCompletion.actualFinishDate ? actualCompletion.actualFinishDate <= targetEndDate : null,
          },
        }), params.constructionOrganizationLineage),
      })
    }
    return
  }

  if (!proposal?.accelerationTargetDays) return
  const targetEndDate = normalizeDate(proposal.targetEndDate)
  const dedupeKey = `${params.projectId}:${asOfDate}:acceleration_target:${targetEndDate ?? 'no-target'}`
  await recordDurationAccuracyPrediction({
    engineCode: 'schedule_acceleration_target',
    outputKind: 'acceleration_target',
    projectId: params.projectId,
    dedupeKey,
    predictionBasis: 'runtime_acceleration_target',
    modelVersion: 'schedule_acceleration_target_v1',
    predictedStartDate: earliestDate(params.rows.map((row) => normalizeDate(row.values.planned_start_date ?? row.values.start_date))) ?? asOfDate,
    predictedFinishDate: targetEndDate,
    predictedDurationDays: proposal.accelerationTargetDays,
    predictionContext: mergeConstructionOrganizationLineageIntoContext({
      durationDayUnit: 'construction_production_day',
      constructionCalendar: params.constructionCalendar,
      mode: proposal.mode,
      source: proposal.source,
      naturalEndDate: proposal.naturalEndDate,
      overshootDays: proposal.overshootDays,
      totalRecoverDays: proposal.totalRecoverDays,
      remainingGapDays: proposal.remainingGapDays,
      verdict: proposal.verdict,
      actionTypes: proposal.actions.map((action) => action.type),
    }, params.constructionOrganizationLineage),
  })

}

async function buildRuntimeRecoveryContext(projectId: string, rows: ScheduleAccelerationRow[]): Promise<ScheduleAccelerationContext['runtime']> {
  const taskRows = rows.map((row) => row.values)
  const [scheduleState, adoptedRecommendation] = await Promise.all([
    loadEffectiveProjectScheduleState({ projectId }).catch(() => null),
    loadPersistedAccelerationRecommendationAdoption(projectId),
  ])
  const facts = buildRuntimeExecutionInference({
    projectId,
    rows: taskRows,
    scheduleState,
  }).facts
  if (!adoptedRecommendation) return facts
  const constructionOrganizationLineage =
    adoptedRecommendation.constructionOrganizationLineage
      ? mergeConstructionOrganizationLineageIntoContext({}, adoptedRecommendation.constructionOrganizationLineage)
      : null
  return {
    ...facts,
    ...(constructionOrganizationLineage ?? {}),
    accelerationRecommendationAdopted: true,
    evidenceCodes: uniqueText([
      ...(facts.evidenceCodes ?? []),
      'acceleration_recommendation_adopted',
    ]),
    evidenceObjects: [
      ...(facts.evidenceObjects ?? []),
      {
        code: 'acceleration_recommendation_adopted',
        factType: 'direct',
        strength: 'direct',
        sourceType: 'recommendation_actions',
        sourceIds: [adoptedRecommendation.id || adoptedRecommendation.recommendationKey].filter(Boolean),
        scope: { type: 'project', id: normalizeText(projectId) },
        windowDays: 0,
        confidence: 1,
        value: true,
        contributions: [
          {
            code: 'acceleration_recommendation_adopted',
            label: 'acceleration recommendation adopted',
            weight: 1,
            value: adoptedRecommendation.recommendationKey,
            sourceType: 'recommendation_actions',
          },
        ],
        boundaryPolicy: [
          'user_adoption_required_for_acceleration_recovery_backtest',
          'recommendation_actions_do_not_write_tasks_or_duration_assets',
        ],
        ...(constructionOrganizationLineage
          ? { metadata: { constructionOrganizationPlanNetwork: constructionOrganizationLineage } }
          : {}),
      },
    ],
  }
}

async function loadRuntimeMonthlyCommitmentSummary(projectId: string): Promise<ProjectMonthlyCommitmentSummary> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return {}

  try {
    const confirmedPlans = await executeSQL<{ id?: string | null }>(
      'SELECT id FROM monthly_plans WHERE project_id = ? AND status = ?',
      [normalizedProjectId, 'confirmed'],
    )
    const confirmedPlanIds = new Set(confirmedPlans.map((row) => normalizeText(row.id)).filter(Boolean))
    if (confirmedPlanIds.size === 0) return {}

    const rows = await executeSQL<{
      monthly_plan_version_id?: string | null
      planned_end_date?: string | null
      commitment_status?: string | null
      carryover_from_item_id?: string | null
    }>(
      `SELECT monthly_plan_version_id, planned_end_date, commitment_status, carryover_from_item_id
         FROM monthly_plan_items
        WHERE project_id = ?`,
      [normalizedProjectId],
    )

    let activeCommitmentCount = 0
    let carryoverCommitmentCount = 0
    let latestCommitmentFinishDate: string | null = null
    for (const row of rows) {
      if (!confirmedPlanIds.has(normalizeText(row.monthly_plan_version_id))) continue
      const status = normalizeText(row.commitment_status || 'planned')
      if (status === 'completed' || status === 'cancelled') continue
      activeCommitmentCount += 1
      if (status === 'carried_over' || normalizeText(row.carryover_from_item_id)) {
        carryoverCommitmentCount += 1
      }
      const finishDate = normalizeDate(row.planned_end_date)
      if (finishDate && (!latestCommitmentFinishDate || finishDate > latestCommitmentFinishDate)) {
        latestCommitmentFinishDate = finishDate
      }
    }

    return {
      activeCommitmentCount,
      carryoverCommitmentCount,
      latestCommitmentFinishDate,
    }
  } catch {
    return {}
  }
}

function getNumericVersion(version: unknown) {
  const value = Number(version)
  return Number.isFinite(value) ? value : null
}

function chooseCurrentExecutionBaseline(rows: Array<Record<string, unknown>>) {
  return rows
    .filter((row) => CURRENT_EXECUTION_BASELINE_STATUSES.has(normalizeText(row.status)))
    .filter((row) => getNumericVersion(row.version) !== null)
    .sort((left, right) => {
      const versionDiff = (getNumericVersion(right.version) ?? 0) - (getNumericVersion(left.version) ?? 0)
      if (versionDiff !== 0) return versionDiff
      return normalizeText(right.confirmed_at ?? right.updated_at).localeCompare(normalizeText(left.confirmed_at ?? left.updated_at))
    })[0] ?? null
}

export async function loadFrozenBaselineTargetEndDate(projectId: string): Promise<string | null> {
  const normalizedProjectId = normalizeText(projectId)
  if (!normalizedProjectId) return null

  const baselines = await executeSQL<Record<string, unknown>>(
    'SELECT id, status, version, confirmed_at, updated_at FROM task_baselines WHERE project_id = ?',
    [normalizedProjectId],
  ).catch(() => [])
  const baseline = chooseCurrentExecutionBaseline(baselines)
  const baselineId = normalizeText(baseline?.id)
  if (!baselineId) return null

  const items = await executeSQL<{ planned_end_date?: string | null }>(
    'SELECT planned_end_date FROM task_baseline_items WHERE baseline_version_id = ?',
    [baselineId],
  ).catch(() => [])
  return latestDate(items.map((item) => item.planned_end_date))
}

async function resolveRuntimeTargetEndDate(projectId: string, explicitTargetEndDate?: string | null) {
  return normalizeDate(explicitTargetEndDate) ?? await loadFrozenBaselineTargetEndDate(projectId)
}

export async function evaluateRuntimeScheduleAcceleration(params: {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  mode?: ScheduleAccelerationMode
  context?: ScheduleAccelerationContext
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
  runtimeArtifactPublications?: readonly ScheduleAccelerationRuntimeArtifactPublication[] | null
  runtimeConsumerObservedAt?: string | null
  runtimeConsumerErrorHandler?: (error: unknown) => void
  issuedBy?: string | null
}): Promise<{
  rowsEvaluated: number
  projectRemainingForecast: ProjectRemainingDurationForecast
  targetFeasibility?: ScheduleTargetFeasibility
  durationAssetConsumptionReceipts: DurationAssetConsumptionReceipt[]
  durationAssetConsumptionSummary: DurationAssetConsumptionSummary
}> {
  const {
    rows,
    criticalPathSnapshot,
    constructionCalendar,
    mergedRuntimeContext,
    monthlyCommitments,
    accelerationContext,
  } = await buildRuntimeForecastInputs(params.projectId, params.context, params.asOfDate)
  assertRuntimeRemainingForecastEvidence(rows)
  const targetEndDate = await resolveRuntimeTargetEndDate(params.projectId, params.targetEndDate)
  const constructionOrganizationLineage = readConstructionOrganizationPlanNetworkRuntimeLineage(
    {
      ...mergedRuntimeContext,
      runtimeArtifactPublications: params.runtimeArtifactPublications,
      constructionOrganizationScenario: accelerationContext?.constructionOrganizationScenario,
      projectGenerationFacts: accelerationContext?.projectGenerationFacts,
      runtimeExecutionFacts: mergedRuntimeContext,
      runtime: mergedRuntimeContext,
    },
    'scheduleAccelerationRuntimeService.runtimeInput',
  )
  const projectRemainingForecast = buildProjectRemainingDurationForecast({
    rows,
    asOfDate: params.asOfDate,
    targetEndDate,
    criticalPathSnapshot,
    constructionCalendar,
    runtimeExecutionFacts: mergedRuntimeContext,
    monthlyCommitments,
    projectId: params.projectId,
    runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec,
    runtimeArtifactPublications: params.runtimeArtifactPublications,
    runtimeConsumerObservedAt: params.runtimeConsumerObservedAt,
    runtimeConsumerErrorHandler: params.runtimeConsumerErrorHandler,
  })
  let targetFeasibility = targetEndDate
    ? await evaluateRuntimeDelayRecoveryWithCriticalPath({
        projectId: params.projectId,
        rows,
        targetEndDate,
        mode: params.mode ?? 'compression_preview',
        context: {
          ...accelerationContext,
          constructionCalendar,
          asOfDate: normalizeDate(params.asOfDate),
          runtime: {
            ...mergedRuntimeContext,
            projectRemainingForecastFinishDate: projectRemainingForecast.forecastFinishDate,
          },
        },
        runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec,
        runtimeArtifactPublications: params.runtimeArtifactPublications,
        runtimeConsumerObservedAt: params.runtimeConsumerObservedAt,
        runtimeConsumerErrorHandler: params.runtimeConsumerErrorHandler,
      })
    : undefined
  if (targetFeasibility?.accelerationProposal && normalizeText(params.issuedBy)) {
    const accelerationRecommendation = await issueScheduleAccelerationRecommendation({
      projectId: params.projectId,
      issuedBy: params.issuedBy,
      proposal: targetFeasibility.accelerationProposal,
    })
    if (accelerationRecommendation) {
      targetFeasibility = {
        ...targetFeasibility,
        accelerationRecommendation,
      }
    }
  }
  const upstreamAssetConsumptionReceipts = (
    projectRemainingForecast.calculationContext.upstreamAssetConsumptionReceipts ?? []
  )
  const accelerationActions = targetFeasibility?.accelerationProposal?.actions ?? []
  const affectedRowIds = uniqueText(accelerationActions.flatMap((action) => action.affectedRowIds))
  const downstreamAssetConsumption = buildDownstreamDurationAssetConsumption({
    consumer: 'schedule_acceleration_runtime',
    upstreamReceipts: upstreamAssetConsumptionReceipts,
    before: {
      taskSelection: null,
      durationDays: null,
      dates: null,
      dependencies: null,
      confidence: null,
    },
    after: {
      taskSelection: affectedRowIds,
      durationDays: projectRemainingForecast.projectRemainingForecast.availability === 'available'
        ? {
            projectRemainingForecastDays: projectRemainingForecast.projectRemainingForecastDays,
            totalRecoverDays: targetFeasibility?.accelerationProposal?.totalRecoverDays ?? null,
          }
        : null,
      dates: {
        forecastFinishDate: projectRemainingForecast.forecastFinishDate,
        targetEndDate,
      },
      dependencies: accelerationActions.flatMap((action) => (
        action.type === 'fast_track' ? action.dependencyAdjustments : []
      )),
      confidence: targetFeasibility?.accelerationProposal?.recoverableDaysConfidenceBand ?? null,
    },
    targetRowIds: affectedRowIds,
  })
  await recordProjectRemainingAccuracySnapshot({
    projectId: params.projectId,
    rows,
    forecast: projectRemainingForecast,
    constructionCalendar,
    asOfDate: params.asOfDate,
  })
  await recordAccelerationAccuracySnapshot({
    projectId: params.projectId,
    rows,
    targetFeasibility,
    runtimeContext: mergedRuntimeContext,
    asOfDate: params.asOfDate,
    constructionOrganizationLineage,
    constructionCalendar,
  })
  const runtimeArtifactPublications = params.runtimeArtifactPublications ?? []
  const runtimeSourceEvidenceRefs = buildScheduleAccelerationRuntimeSourceEvidenceRefs(
    normalizeText(params.projectId),
    mergedRuntimeContext,
  )
  if (params.runtimeConsumerObservationQueryExec) {
    try {
      await recordScheduleAccelerationRuntimeConsumedArtifacts({
        queryExec: params.runtimeConsumerObservationQueryExec,
        observedAt: normalizeText(params.runtimeConsumerObservedAt) || undefined,
        callContext: {
          projectId: normalizeText(params.projectId) || null,
          runtimeConsumer: 'scheduleAccelerationRuntimeService',
        },
        sourceEvidenceRefs: runtimeSourceEvidenceRefs,
        artifacts: buildScheduleAccelerationRuntimeConsumedArtifacts({
          runtimeArtifactPublications,
          projectId: params.projectId,
        }),
      })
    } catch (error) {
      if (params.runtimeConsumerErrorHandler) {
        params.runtimeConsumerErrorHandler(error)
      } else {
        logger.warn('[scheduleAccelerationRuntimeService] failed to record schedule acceleration runtime consumer evidence', {
          projectId: params.projectId,
          error,
        })
      }
    }
  }
  return {
    rowsEvaluated: rows.length,
    projectRemainingForecast,
    targetFeasibility,
    durationAssetConsumptionReceipts: downstreamAssetConsumption.receipts,
    durationAssetConsumptionSummary: downstreamAssetConsumption.summary,
  }
}

async function computeRuntimeProjectRemainingDurationForecast(params: {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  context?: ScheduleAccelerationContext
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
}): Promise<ProjectRemainingForecastRuntimeResult> {
  const {
    rows,
    criticalPathSnapshot,
    constructionCalendar,
    mergedRuntimeContext,
    monthlyCommitments,
  } = await buildRuntimeForecastInputs(params.projectId, params.context, params.asOfDate)
  assertRuntimeRemainingForecastEvidence(rows)
  const targetEndDate = await resolveRuntimeTargetEndDate(params.projectId, params.targetEndDate)
  const projectRemainingForecast = buildProjectRemainingDurationForecast({
    rows,
    asOfDate: params.asOfDate,
    targetEndDate,
    criticalPathSnapshot,
    constructionCalendar,
    runtimeExecutionFacts: mergedRuntimeContext,
    monthlyCommitments,
    projectId: params.projectId,
    runtimeConsumerObservationQueryExec: params.runtimeConsumerObservationQueryExec,
  })
  await recordProjectRemainingAccuracySnapshot({
    projectId: params.projectId,
    rows,
    forecast: projectRemainingForecast,
    constructionCalendar,
    asOfDate: params.asOfDate,
  })
  return {
    rowsEvaluated: rows.length,
    projectRemainingForecast,
  }
}

export async function buildRuntimeProjectRemainingDurationForecast(params: {
  projectId: string
  targetEndDate?: string | null
  asOfDate?: string | null
  context?: ScheduleAccelerationContext
  runtimeConsumerObservationQueryExec?: DurationRuntimeConsumerObservationQueryExec | null
}): Promise<ProjectRemainingForecastRuntimeResult> {
  const cacheKey = buildProjectRemainingForecastCacheKey(params)
  if (!cacheKey) return computeRuntimeProjectRemainingDurationForecast(params)

  const now = Date.now()
  const cached = projectRemainingForecastRuntimeCache.get(cacheKey)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = computeRuntimeProjectRemainingDurationForecast(params)
  projectRemainingForecastRuntimeCache.set(cacheKey, {
    expiresAt: Number.POSITIVE_INFINITY,
    promise,
  })
  void promise.then(
    () => {
      const current = projectRemainingForecastRuntimeCache.get(cacheKey)
      if (current?.promise === promise) {
        current.expiresAt = Date.now() + PROJECT_REMAINING_FORECAST_CACHE_TTL_MS
      }
    },
    () => {
      const current = projectRemainingForecastRuntimeCache.get(cacheKey)
      if (current?.promise === promise) {
        projectRemainingForecastRuntimeCache.delete(cacheKey)
      }
    },
  )
  return promise
}
