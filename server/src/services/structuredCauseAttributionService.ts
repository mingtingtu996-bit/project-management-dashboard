import { createHash, randomUUID } from 'node:crypto'

import { query as rawQuery, withDatabaseTransaction } from '../database.js'
import {
  CANONICAL_STRUCTURED_CAUSE_CODES,
  isStructuredCauseCode,
  STRUCTURED_CAUSE_TAXONOMY_VERSION,
  translateLegacyProgressFactor,
  type StructuredCauseCode,
} from '../domain/structuredCauseTaxonomy.js'
import { delayDayDelta } from '../utils/durationDays.js'

export { STRUCTURED_CAUSE_TAXONOMY_VERSION, type StructuredCauseCode }
export const STRUCTURED_CAUSE_RULE_VERSION = 'structured-cause-rules-v1'
export const STRUCTURED_CAUSE_QUALITY_POLICY = Object.freeze({
  minimumSampleCount: 20,
  otherRateRevisionThresholdPercent: 20,
  prefillModificationRateRevisionThresholdPercent: 30,
})

export type CauseRole = 'primary' | 'contributing' | 'transmitted'
export type CauseStatus = 'candidate' | 'confirmed' | 'rejected' | 'superseded'
export type StructuredCauseAvailability = 'available' | 'review_required' | 'unavailable'
export type CanonicalCauseResolution = {
  availability: StructuredCauseAvailability
  causeCode: StructuredCauseCode | null
  taxonomyVersion: typeof STRUCTURED_CAUSE_TAXONOMY_VERSION
  reviewReasonCodes: string[]
}
export type ContractualResponsibilityClass =
  | 'owner_attributable'
  | 'contractor_attributable'
  | 'force_majeure'
  | 'shared'
  | 'undetermined'

export type StructuredCauseEvidenceSource =
  | 'task_obstacle'
  | 'task_condition'
  | 'task_dependency'
  | 'material_arrival'
  | 'drawing_package'
  | 'weather_signal'
  | 'change_log'
  | 'forecast_factor'
  | 'manual_text'
  | 'user_confirmation'

const STRUCTURED_CAUSE_EVIDENCE_SOURCES = new Set<StructuredCauseEvidenceSource>([
  'task_obstacle',
  'task_condition',
  'task_dependency',
  'material_arrival',
  'drawing_package',
  'weather_signal',
  'change_log',
  'forecast_factor',
  'manual_text',
  'user_confirmation',
])

export type StructuredCauseTaxonomyEntry = {
  code: StructuredCauseCode
  label: string
  category: 'resource' | 'design' | 'quality' | 'external' | 'sequence' | 'site' | 'fallback'
  linkedDeviationReasonTypes: string[]
  priority: number
}

const STRUCTURED_CAUSE_TAXONOMY_DETAILS: Record<StructuredCauseCode, Omit<StructuredCauseTaxonomyEntry, 'code'>> = {
  predecessor_delay: { label: 'Predecessor transmission delay', category: 'sequence', linkedDeviationReasonTypes: ['workflow_sequence'], priority: 92 },
  material_shortage: { label: 'Material shortage or late arrival', category: 'resource', linkedDeviationReasonTypes: ['external_readiness', 'site_capacity_pressure'], priority: 90 },
  labor_shortage: { label: 'Labor shortage', category: 'resource', linkedDeviationReasonTypes: ['site_capacity_pressure'], priority: 86 },
  equipment_unavailable: { label: 'Equipment unavailable', category: 'resource', linkedDeviationReasonTypes: ['site_capacity_pressure'], priority: 84 },
  design_change: { label: 'Design change', category: 'design', linkedDeviationReasonTypes: ['external_readiness', 'process_constraint'], priority: 88 },
  drawing_delay: { label: 'Drawing or approval delay', category: 'design', linkedDeviationReasonTypes: ['external_readiness'], priority: 89 },
  quality_rework: { label: 'Quality rework', category: 'quality', linkedDeviationReasonTypes: ['process_constraint'], priority: 87 },
  weather_impact: { label: 'Weather impact', category: 'external', linkedDeviationReasonTypes: ['calendar_productivity'], priority: 82 },
  owner_decision: { label: 'Owner decision delay', category: 'external', linkedDeviationReasonTypes: ['external_readiness'], priority: 83 },
  government_inspection: { label: 'Government inspection or approval', category: 'external', linkedDeviationReasonTypes: ['external_readiness'], priority: 81 },
  site_capacity_pressure: { label: 'Site capacity pressure', category: 'site', linkedDeviationReasonTypes: ['site_capacity_pressure'], priority: 80 },
  workflow_sequence: { label: 'Workflow sequence deviation', category: 'sequence', linkedDeviationReasonTypes: ['workflow_sequence'], priority: 78 },
  external_readiness: { label: 'External readiness not met', category: 'external', linkedDeviationReasonTypes: ['external_readiness'], priority: 76 },
  other: { label: 'Other or unclassified', category: 'fallback', linkedDeviationReasonTypes: [], priority: 1 },
}

export const STRUCTURED_CAUSE_TAXONOMY: StructuredCauseTaxonomyEntry[] = CANONICAL_STRUCTURED_CAUSE_CODES.map((code) => ({
  code,
  ...STRUCTURED_CAUSE_TAXONOMY_DETAILS[code],
}))

const TAXONOMY_BY_CODE = new Map(STRUCTURED_CAUSE_TAXONOMY.map((entry) => [entry.code, entry]))
const AUTO_CONFIRM_MIN_CONFIDENCE = 0.94
const AUTO_CONFIRM_MIN_SOURCE_TYPES = 2
const AUTO_CONFIRM_MAX_IMPACT_DAYS = 14
const ALWAYS_REVIEW_CODES = new Set<StructuredCauseCode>([
  'design_change',
  'quality_rework',
  'owner_decision',
  'government_inspection',
  'other',
])

export type StructuredCauseEvidence = {
  sourceType: StructuredCauseEvidenceSource
  sourceId: string
  occurredAt?: string | null
  resolvedAt?: string | null
  attributes?: Record<string, unknown>
}

export type StructuredCauseCandidateInput = {
  companyId: string
  projectId: string
  subjectType: 'task' | 'risk' | 'issue' | 'baseline_change'
  subjectId: string
  eventType: 'delay' | 'completion' | 'closure' | 'baseline_change'
  impactDays?: number | null
  windowStart?: string | null
  windowEnd?: string | null
  rawText?: string | null
  evidence: StructuredCauseEvidence[]
}

export type BaselinePublicationStructuredCauseInput = {
  companyId: string
  projectId: string
  baselineId: string
  previousStatus: string
  nextStatus: string
  causeCode: StructuredCauseCode
  rawText: string
  actorId: string
}

export type StructuredCauseCandidate = {
  companyId: string
  projectId: string
  subjectType: StructuredCauseCandidateInput['subjectType']
  subjectId: string
  eventType: StructuredCauseCandidateInput['eventType']
  availability: Exclude<StructuredCauseAvailability, 'unavailable'>
  causeCode: StructuredCauseCode
  causeRole: CauseRole
  taxonomyVersion: string
  rawText: string | null
  evidenceRefs: string[]
  evidenceSourceTypes: StructuredCauseEvidenceSource[]
  windowStart: string | null
  windowEnd: string | null
  ruleVersion: string
  confidence: number
  status: CauseStatus
  autoConfirmed: boolean
  confirmationSource: 'candidate' | 'deterministic_policy'
  responsibilityClass: null
  responsibilityBasis: string | null
  requiresManualReview: boolean
  reviewReasonCodes: string[]
  dedupeKey: string
}

type CauseRuleMatch = {
  causeCode: StructuredCauseCode
  confidence: number
  transmitted?: boolean
  responsibilityBasis?: string | null
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[\s_-]+/g, '')
}

function normalizedManualTextIdentity(value: unknown) {
  return text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
}

function resolveManualRawText(input: StructuredCauseCandidateInput) {
  const directText = text(input.rawText)
  if (directText) return directText

  for (const evidence of input.evidence) {
    if (evidence.sourceType !== 'manual_text') continue
    const evidenceText = text(evidence.attributes?.text)
    if (evidenceText) return evidenceText
  }
  return null
}

function asFiniteNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function isCauseCode(value: unknown): value is StructuredCauseCode {
  return isStructuredCauseCode(text(value))
}

function resolveObstacleCause(attributes: Record<string, unknown>): CauseRuleMatch {
  const type = normalized(attributes.obstacleType ?? attributes.obstacle_type ?? attributes.type)
  if (/material|\u6750\u6599/.test(type)) return { causeCode: 'material_shortage', confidence: 0.88, responsibilityBasis: 'task_obstacle' }
  if (/personnel|labor|worker|\u4eba\u5458|\u52b3\u52a8\u529b/.test(type)) return { causeCode: 'labor_shortage', confidence: 0.86, responsibilityBasis: 'task_obstacle' }
  if (/equipment|machine|\u8bbe\u5907|\u673a\u68b0/.test(type)) return { causeCode: 'equipment_unavailable', confidence: 0.86, responsibilityBasis: 'task_obstacle' }
  if (/weather|environment|\u5929\u6c14|\u73af\u5883/.test(type)) return { causeCode: 'weather_impact', confidence: 0.84, responsibilityBasis: 'task_obstacle' }
  if (/drawing|design|\u56fe\u7eb8|\u8bbe\u8ba1/.test(type)) return { causeCode: 'design_change', confidence: 0.84, responsibilityBasis: 'task_obstacle' }
  if (/quality|rework|\u8d28\u91cf|\u8fd4\u5de5/.test(type)) return { causeCode: 'quality_rework', confidence: 0.88, responsibilityBasis: 'task_obstacle' }
  return { causeCode: 'other', confidence: 0.45, responsibilityBasis: 'task_obstacle' }
}

function resolveConditionCause(attributes: Record<string, unknown>): CauseRuleMatch {
  const type = normalized(attributes.conditionType ?? attributes.condition_type ?? attributes.type)
  const name = normalized(attributes.name ?? attributes.description)
  if (/drawing|\u56fe\u7eb8/.test(`${type}${name}`)) return { causeCode: 'drawing_delay', confidence: 0.9, responsibilityBasis: 'task_condition' }
  if (/material|\u6750\u6599/.test(type)) return { causeCode: 'material_shortage', confidence: 0.86, responsibilityBasis: 'task_condition' }
  if (/personnel|labor|\u4eba\u5458/.test(type)) return { causeCode: 'labor_shortage', confidence: 0.82, responsibilityBasis: 'task_condition' }
  if (/equipment|\u8bbe\u5907/.test(type)) return { causeCode: 'equipment_unavailable', confidence: 0.82, responsibilityBasis: 'task_condition' }
  if (/weather|\u5929\u6c14/.test(type)) return { causeCode: 'weather_impact', confidence: 0.82, responsibilityBasis: 'task_condition' }
  if (/designchange|design|\u8bbe\u8ba1\u53d8\u66f4/.test(type)) return { causeCode: 'design_change', confidence: 0.86, responsibilityBasis: 'task_condition' }
  if (/preceding|predecessor|\u524d\u7f6e/.test(type)) return { causeCode: 'predecessor_delay', confidence: 0.9, transmitted: true, responsibilityBasis: 'upstream_dependency' }
  return { causeCode: 'external_readiness', confidence: 0.68, responsibilityBasis: 'task_condition' }
}

function resolveForecastFactorCause(attributes: Record<string, unknown>): CauseRuleMatch | null {
  const key = text(attributes.factorKey ?? attributes.factor_key ?? attributes.key)
  const translation = translateLegacyProgressFactor(key)
  if (!translation) return null

  if (key === 'resource_conflict' || key === 'progress_velocity') return { causeCode: translation.causeCode, confidence: 0.78, responsibilityBasis: 'site_capacity' }
  if (key === 'external_readiness') return { causeCode: translation.causeCode, confidence: 0.76, responsibilityBasis: 'external_wait' }
  if (key === 'seasonal_productivity' || key === 'process_seasonal_sensitivity' || key === 'weather_forecast_impact' || key === 'productivity_compensation') return { causeCode: translation.causeCode, confidence: 0.74, responsibilityBasis: 'calendar_productivity' }
  return { causeCode: translation.causeCode, confidence: 0.74, responsibilityBasis: 'workflow' }
}

function resolveEvidenceCause(evidence: StructuredCauseEvidence): CauseRuleMatch | null {
  const attributes = evidence.attributes ?? {}
  switch (evidence.sourceType) {
    case 'task_obstacle':
      return resolveObstacleCause(attributes)
    case 'task_condition':
      return resolveConditionCause(attributes)
    case 'task_dependency':
      return asFiniteNumber(attributes.upstreamDelayDays ?? attributes.upstream_delay_days) > 0
        ? { causeCode: 'predecessor_delay', confidence: 0.93, transmitted: true, responsibilityBasis: 'upstream_dependency' }
        : null
    case 'material_arrival':
      return { causeCode: 'material_shortage', confidence: 0.96, responsibilityBasis: 'material_arrival' }
    case 'drawing_package':
      return { causeCode: 'drawing_delay', confidence: 0.95, responsibilityBasis: 'drawing_package' }
    case 'weather_signal':
      return { causeCode: 'weather_impact', confidence: 0.93, responsibilityBasis: 'weather_signal' }
    case 'change_log':
      return { causeCode: 'design_change', confidence: 0.9, responsibilityBasis: 'change_log' }
    case 'forecast_factor':
      return resolveForecastFactorCause(attributes)
    case 'manual_text':
      return { causeCode: 'other', confidence: 0.3, responsibilityBasis: 'manual_text' }
    default:
      return null
  }
}

function buildDedupeKey(
  input: StructuredCauseCandidateInput,
  causeCode: StructuredCauseCode,
  role: CauseRole,
  sourceIdentity = '',
) {
  const identityParts = [
    input.projectId,
    input.subjectType,
    input.subjectId,
    input.eventType,
    causeCode,
    role,
    input.windowStart ?? '',
    input.windowEnd ?? '',
  ]
  if (sourceIdentity) identityParts.push(sourceIdentity)
  return createHash('sha256').update(identityParts.join('|')).digest('hex')
}

export function buildStructuredCauseCandidates(input: StructuredCauseCandidateInput): StructuredCauseCandidate[] {
  const grouped = new Map<StructuredCauseCode, {
    evidence: StructuredCauseEvidence[]
    confidence: number
    transmitted: boolean
    responsibilityBases: string[]
  }>()

  for (const evidence of input.evidence) {
    if (!STRUCTURED_CAUSE_EVIDENCE_SOURCES.has(evidence.sourceType)) {
      throw new Error(`CAUSE_EVIDENCE_SOURCE_UNSUPPORTED:${String(evidence.sourceType)}`)
    }
  }

  const resolvedManualRawText = resolveManualRawText(input)
  const evidenceItems = input.evidence.filter((item) => (
    item.sourceType !== 'manual_text' || resolvedManualRawText !== null
  ))
  if (resolvedManualRawText && !evidenceItems.some((item) => item.sourceType === 'manual_text')) {
    evidenceItems.push({
      sourceType: 'manual_text',
      sourceId: `manual:${input.subjectType}:${input.subjectId}:${input.eventType}`,
      attributes: { text: resolvedManualRawText },
    })
  }

  for (const evidence of evidenceItems) {
    const match = resolveEvidenceCause(evidence)
    if (!match) continue
    const existing = grouped.get(match.causeCode) ?? {
      evidence: [],
      confidence: 0,
      transmitted: false,
      responsibilityBases: [],
    }
    existing.evidence.push(evidence)
    existing.confidence = Math.max(existing.confidence, match.confidence)
    existing.transmitted ||= Boolean(match.transmitted)
    if (match.responsibilityBasis) existing.responsibilityBases.push(match.responsibilityBasis)
    grouped.set(match.causeCode, existing)
  }

  const ranked = [...grouped.entries()].sort((left, right) => {
    const leftTaxonomy = TAXONOMY_BY_CODE.get(left[0])!
    const rightTaxonomy = TAXONOMY_BY_CODE.get(right[0])!
    return Number(right[1].transmitted) - Number(left[1].transmitted)
      || right[1].confidence - left[1].confidence
      || rightTaxonomy.priority - leftTaxonomy.priority
      || left[0].localeCompare(right[0])
  })
  const firstDirectCause = ranked.find(([, value]) => !value.transmitted)?.[0] ?? null

  return ranked.map(([causeCode, value]) => {
    const sourceTypes = [...new Set(value.evidence.map((item) => item.sourceType))]
    const evidenceRefs = [...new Set(value.evidence.map((item) => `${item.sourceType}:${item.sourceId}`))]
    const confidence = Math.min(0.99, Number((value.confidence + Math.max(0, sourceTypes.length - 1) * 0.04).toFixed(3)))
    const causeRole: CauseRole = value.transmitted
      ? 'transmitted'
      : causeCode === firstDirectCause
        ? 'primary'
        : 'contributing'
    const hasManualTextSource = sourceTypes.includes('manual_text')
    const manualTextIdentity = hasManualTextSource
      ? normalizedManualTextIdentity(resolvedManualRawText)
      : ''
    const dedupeSourceIdentity = hasManualTextSource
      ? `manual_text/v1:${createHash('sha256').update(manualTextIdentity).digest('hex')}`
      : ''
    const reviewReasonCodes = hasManualTextSource
      ? ['manual_text_requires_user_confirmation']
      : [
          confidence < AUTO_CONFIRM_MIN_CONFIDENCE ? 'confidence_below_auto_confirm_threshold' : '',
          sourceTypes.length < AUTO_CONFIRM_MIN_SOURCE_TYPES ? 'insufficient_independent_evidence_sources' : '',
          asFiniteNumber(input.impactDays) > AUTO_CONFIRM_MAX_IMPACT_DAYS ? 'high_impact_requires_review' : '',
          ALWAYS_REVIEW_CODES.has(causeCode) ? 'cause_code_requires_review' : '',
          causeRole === 'transmitted' ? 'transmitted_cause_requires_chain_confirmation' : '',
        ].filter(Boolean)
    const autoConfirmed = reviewReasonCodes.length === 0

    return {
      companyId: input.companyId,
      projectId: input.projectId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      eventType: input.eventType,
      availability: autoConfirmed ? 'available' : 'review_required',
      causeCode,
      causeRole,
      taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
      rawText: hasManualTextSource ? resolvedManualRawText : text(input.rawText) || null,
      evidenceRefs,
      evidenceSourceTypes: sourceTypes,
      windowStart: text(input.windowStart) || null,
      windowEnd: text(input.windowEnd) || null,
      ruleVersion: STRUCTURED_CAUSE_RULE_VERSION,
      confidence,
      status: autoConfirmed ? 'confirmed' : 'candidate',
      autoConfirmed,
      confirmationSource: autoConfirmed ? 'deterministic_policy' : 'candidate',
      responsibilityClass: null,
      responsibilityBasis: hasManualTextSource
        ? null
        : [...new Set(value.responsibilityBases)].join('+') || null,
      requiresManualReview: !autoConfirmed,
      reviewReasonCodes,
      dedupeKey: buildDedupeKey(input, causeCode, causeRole, dedupeSourceIdentity),
    }
  })
}

export class StructuredCauseAttributionError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
  ) {
    super(message)
    this.name = 'StructuredCauseAttributionError'
  }
}

type QueryResult = { rows: any[]; rowCount?: number | null }
type QueryExec = (sql: string, params?: unknown[]) => Promise<QueryResult>
type WithTransaction = <T>(work: () => Promise<T>) => Promise<T>
type StructuredCauseDependencies = {
  queryExec?: QueryExec
  withTransaction?: WithTransaction
}

function dependencies(input?: StructuredCauseDependencies) {
  return {
    queryExec: input?.queryExec ?? (rawQuery as QueryExec),
    withTransaction: input?.withTransaction ?? withDatabaseTransaction,
  }
}

async function assertProjectTenant(queryExec: QueryExec, companyId: string, projectId: string) {
  const result = await queryExec(
    'SELECT company_id FROM public.projects WHERE id = $1 LIMIT 1',
    [projectId],
  )
  const actualCompanyId = text(result.rows[0]?.company_id)
  if (!actualCompanyId) {
    throw new StructuredCauseAttributionError('CAUSE_ATTRIBUTION_PROJECT_NOT_FOUND', 'Project was not found.', 404)
  }
  if (actualCompanyId !== companyId) {
    throw new StructuredCauseAttributionError('CAUSE_ATTRIBUTION_TENANT_MISMATCH', 'Project does not belong to the requested company.', 403)
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export async function loadTaskStructuredCauseEvidence(input: {
  companyId: string
  projectId: string
  taskId: string
  windowStart?: string | null
  windowEnd?: string | null
}, dependencyOverrides?: Pick<StructuredCauseDependencies, 'queryExec'>): Promise<StructuredCauseEvidence[]> {
  const { queryExec } = dependencies(dependencyOverrides)
  await assertProjectTenant(queryExec, input.companyId, input.projectId)
  const scopeParams = [input.projectId, input.taskId]
  const windowedParams = [...scopeParams, text(input.windowStart) || null, text(input.windowEnd) || null]

  const [obstacles, conditions, dependenciesResult, materialArrivals, forecasts] = await Promise.all([
    queryExec(
      `SELECT id, obstacle_type, severity, status, description, created_at, updated_at,
              estimated_resolve_date, is_resolved
         FROM public.task_obstacles
        WHERE project_id = $1
          AND task_id = $2
          AND ($3::timestamptz IS NULL OR COALESCE(updated_at, created_at) >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR created_at <= $4::timestamptz)`,
      windowedParams,
    ),
    queryExec(
      `SELECT condition.id, condition.condition_type, condition.name, condition.description,
              condition.is_satisfied, condition.created_at, condition.updated_at, condition.confirmed_at
         FROM public.task_conditions condition
         JOIN public.tasks task_scope ON task_scope.id = condition.task_id
        WHERE task_scope.project_id = $1
          AND condition.task_id = $2
          AND ($3::timestamptz IS NULL OR COALESCE(condition.updated_at, condition.created_at) >= $3::timestamptz)
          AND ($4::timestamptz IS NULL OR condition.created_at <= $4::timestamptz)`,
      windowedParams,
    ),
    queryExec(
      `SELECT dependency.id, dependency.dependency_task_id, dependency.dependency_type,
              dependency.lag_days, dependency.status, dependency.required_for_start,
              GREATEST(
                0,
                COALESCE(upstream.actual_end_date, CURRENT_DATE)
                  - COALESCE(upstream.planned_end_date, upstream.end_date, CURRENT_DATE)
              )::integer AS upstream_delay_days
         FROM public.task_dependencies dependency
         JOIN public.tasks upstream ON upstream.id = dependency.dependency_task_id
        WHERE dependency.project_id = $1
          AND dependency.task_id = $2
          AND COALESCE(dependency.status, 'active') = 'active'`,
      scopeParams,
    ),
    queryExec(
      `SELECT bridge.id, bridge.material_id, material.material_name,
              material.expected_arrival_date, material.actual_arrival_date,
              bridge.unlocked_at, bridge.created_at
         FROM public.material_arrival_to_condition bridge
         JOIN public.project_materials material ON material.id = bridge.material_id
        WHERE bridge.project_id = $1
          AND bridge.task_id = $2
          AND material.actual_arrival_date IS NOT NULL
          AND material.actual_arrival_date > material.expected_arrival_date`,
      scopeParams,
    ),
    queryExec(
      `SELECT id, factor_summary, generated_at, created_at
         FROM public.task_duration_forecasts
        WHERE project_id = $1
          AND task_id = $2
          AND is_current IS TRUE
        ORDER BY COALESCE(generated_at, created_at) DESC
        LIMIT 1`,
      scopeParams,
    ),
  ])

  const evidence: StructuredCauseEvidence[] = []
  for (const row of obstacles.rows) {
    evidence.push({
      sourceType: 'task_obstacle',
      sourceId: text(row.id),
      occurredAt: text(row.created_at) || null,
      resolvedAt: text(row.estimated_resolve_date) || null,
      attributes: {
        obstacleType: row.obstacle_type,
        severity: row.severity,
        status: row.status,
        description: row.description,
        isResolved: row.is_resolved,
      },
    })
  }
  for (const row of conditions.rows) {
    evidence.push({
      sourceType: 'task_condition',
      sourceId: text(row.id),
      occurredAt: text(row.created_at) || null,
      resolvedAt: text(row.confirmed_at) || null,
      attributes: {
        conditionType: row.condition_type,
        name: row.name,
        description: row.description,
        isSatisfied: row.is_satisfied,
      },
    })
  }
  for (const row of dependenciesResult.rows) {
    evidence.push({
      sourceType: 'task_dependency',
      sourceId: text(row.id),
      attributes: {
        upstreamTaskId: row.dependency_task_id,
        upstreamDelayDays: row.upstream_delay_days,
        dependencyType: row.dependency_type,
        lagDays: row.lag_days,
        requiredForStart: row.required_for_start,
      },
    })
  }
  for (const row of materialArrivals.rows) {
    evidence.push({
      sourceType: 'material_arrival',
      sourceId: text(row.id),
      occurredAt: text(row.created_at) || null,
      resolvedAt: text(row.unlocked_at) || null,
      attributes: {
        materialId: row.material_id,
        materialName: row.material_name,
        expectedArrivalDate: row.expected_arrival_date,
        actualArrivalDate: row.actual_arrival_date,
      },
    })
  }
  for (const forecast of forecasts.rows) {
    const summary = record(forecast.factor_summary)
    for (const factorValue of list(summary.factors)) {
      const factor = record(factorValue)
      const factorKey = text(factor.key)
      if (!factorKey) continue
      evidence.push({
        sourceType: 'forecast_factor',
        sourceId: `${text(forecast.id)}:${factorKey}`,
        occurredAt: text(forecast.generated_at ?? forecast.created_at) || null,
        attributes: {
          factorKey,
          reason: factor.reason,
          source: factor.source,
          metadata: factor.metadata,
        },
      })
    }
  }

  return evidence.filter((item) => Boolean(item.sourceId))
}

export async function inferAndPersistTaskStructuredCauseAttributions(input: {
  task: Record<string, unknown>
}, dependencyOverrides?: StructuredCauseDependencies) {
  const { queryExec } = dependencies(dependencyOverrides)
  const taskId = text(input.task.id)
  const projectId = text(input.task.project_id)
  if (!taskId || !projectId) {
    throw new StructuredCauseAttributionError(
      'CAUSE_ATTRIBUTION_TASK_SCOPE_REQUIRED',
      'Task cause inference requires task and project identifiers.',
    )
  }

  const projectResult = await queryExec(
    'SELECT company_id FROM public.projects WHERE id = $1 LIMIT 1',
    [projectId],
  )
  const companyId = text(projectResult.rows[0]?.company_id)
  if (!companyId) {
    throw new StructuredCauseAttributionError(
      'CAUSE_ATTRIBUTION_PROJECT_NOT_FOUND',
      'Project was not found.',
      404,
    )
  }
  await assertCauseSubjectProject(queryExec, 'task', taskId, projectId)

  const windowStart = text(
    input.task.actual_start_date
      ?? input.task.planned_start_date
      ?? input.task.start_date,
  ) || null
  const windowEnd = text(
    input.task.actual_end_date
      ?? input.task.completed_at
      ?? input.task.updated_at,
  ) || null
  const plannedEnd = input.task.planned_end_date ?? input.task.end_date
  const impactDays = Math.max(0, delayDayDelta(plannedEnd as string | Date | null, windowEnd) ?? 0)
  const rawText = text(input.task.delay_reason) || null
  const evidence = await loadTaskStructuredCauseEvidence({
    companyId,
    projectId,
    taskId,
    windowStart,
    windowEnd,
  }, { queryExec })
  if (rawText) {
    evidence.push({
      sourceType: 'manual_text',
      sourceId: `task:${taskId}:delay_reason`,
      occurredAt: windowEnd,
      attributes: { text: rawText },
    })
  }
  if (evidence.length === 0) return []

  return persistStructuredCauseCandidates({
    companyId,
    projectId,
    subjectType: 'task',
    subjectId: taskId,
    eventType: impactDays > 0 ? 'delay' : 'completion',
    impactDays,
    windowStart,
    windowEnd,
    rawText,
    evidence,
  }, dependencyOverrides)
}

export async function persistStructuredCauseCandidates(
  input: StructuredCauseCandidateInput,
  dependencyOverrides?: StructuredCauseDependencies,
) {
  const { queryExec, withTransaction } = dependencies(dependencyOverrides)
  return withTransaction(async () => {
    await assertProjectTenant(queryExec, input.companyId, input.projectId)
    const candidates = buildStructuredCauseCandidates(input)
    const rows: Record<string, unknown>[] = []
    for (const candidate of candidates) {
      const result = await queryExec(
         `INSERT INTO public.structured_cause_attributions (
           company_id, project_id, subject_type, subject_id, event_type,
           cause_code, prefilled_cause_code, cause_role, taxonomy_version, responsibility_class,
           responsibility_basis, raw_text, evidence_refs, evidence_source_types,
           overlap_start, overlap_end, rule_version, confidence, status,
           auto_confirmed, confirmation_source, confirmed_at, review_reason_codes,
           dedupe_key, created_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $6, $7, $8, NULL,
           $9, $10, $11::jsonb, $12::jsonb,
           $13, $14, $15, $16, $17,
           $18, $19, CASE WHEN $17 = 'confirmed' THEN NOW() ELSE NULL END, $20::jsonb,
           $21, NULL
         )
         ON CONFLICT (company_id, dedupe_key) DO UPDATE SET
           cause_code = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.cause_code
             ELSE structured_cause_attributions.cause_code
           END,
           prefilled_cause_code = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.prefilled_cause_code
             ELSE structured_cause_attributions.prefilled_cause_code
           END,
           prefill_modified = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.prefill_modified
             ELSE structured_cause_attributions.prefill_modified
           END,
           evidence_refs = EXCLUDED.evidence_refs,
           evidence_source_types = EXCLUDED.evidence_source_types,
           confidence = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.confidence
             ELSE GREATEST(structured_cause_attributions.confidence, EXCLUDED.confidence)
           END,
           status = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.status
             WHEN structured_cause_attributions.status IN ('confirmed', 'rejected') THEN structured_cause_attributions.status
             ELSE EXCLUDED.status
           END,
           auto_confirmed = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.auto_confirmed
             ELSE structured_cause_attributions.auto_confirmed OR EXCLUDED.auto_confirmed
           END,
           confirmation_source = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.confirmation_source
             ELSE structured_cause_attributions.confirmation_source
           END,
           raw_text = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.raw_text
             ELSE structured_cause_attributions.raw_text
           END,
           review_reason_codes = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb
               THEN EXCLUDED.review_reason_codes
             ELSE structured_cause_attributions.review_reason_codes
           END,
           responsibility_class = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.responsibility_class
             ELSE structured_cause_attributions.responsibility_class
           END,
           responsibility_basis = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.responsibility_basis
             ELSE structured_cause_attributions.responsibility_basis
           END,
           confirmed_by = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.confirmed_by
             ELSE structured_cause_attributions.confirmed_by
           END,
           confirmed_at = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.confirmed_at
             ELSE structured_cause_attributions.confirmed_at
           END,
           rejected_by = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.rejected_by
             ELSE structured_cause_attributions.rejected_by
           END,
           rejected_at = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.rejected_at
             ELSE structured_cause_attributions.rejected_at
           END,
           rejection_reason = CASE
             WHEN EXCLUDED.evidence_source_types @> '["manual_text"]'::jsonb THEN EXCLUDED.rejection_reason
             ELSE structured_cause_attributions.rejection_reason
           END,
           updated_at = NOW()
         RETURNING *`,
        [
          candidate.companyId,
          candidate.projectId,
          candidate.subjectType,
          candidate.subjectId,
          candidate.eventType,
          candidate.causeCode,
          candidate.causeRole,
          candidate.taxonomyVersion,
          candidate.responsibilityBasis,
          candidate.rawText,
          JSON.stringify(candidate.evidenceRefs),
          JSON.stringify(candidate.evidenceSourceTypes),
          candidate.windowStart,
          candidate.windowEnd,
          candidate.ruleVersion,
          candidate.confidence,
          candidate.status,
          candidate.autoConfirmed,
          candidate.confirmationSource,
          JSON.stringify(candidate.reviewReasonCodes),
          candidate.dedupeKey,
        ],
      )
      rows.push(result.rows[0] ?? candidate)
    }
    return rows
  })
}

type UserConfirmedStructuredCauseInput = {
  companyId: string
  projectId: string
  subjectType: StructuredCauseCandidateInput['subjectType']
  subjectId: string
  eventType: StructuredCauseCandidateInput['eventType']
  causeCode: StructuredCauseCode
  causeRole?: CauseRole
  rawText: string
  actorId: string
  responsibilityClass?: ContractualResponsibilityClass | null
  responsibilityBasis?: string | null
}

async function assertCauseSubjectProject(
  queryExec: QueryExec,
  subjectType: StructuredCauseCandidateInput['subjectType'],
  subjectId: string,
  projectId: string,
) {
  const subjectResult = subjectType === 'task'
    ? await queryExec('SELECT id FROM public.tasks WHERE id = $1 AND project_id = $2 LIMIT 1', [subjectId, projectId])
    : subjectType === 'risk'
      ? await queryExec('SELECT id FROM public.risks WHERE id = $1 AND project_id = $2 LIMIT 1', [subjectId, projectId])
      : subjectType === 'issue'
        ? await queryExec('SELECT id FROM public.issues WHERE id = $1 AND project_id = $2 LIMIT 1', [subjectId, projectId])
        : await queryExec('SELECT id FROM public.change_logs WHERE id = $1 AND project_id = $2 LIMIT 1', [subjectId, projectId])

  if (!subjectResult.rows[0]) {
    throw new StructuredCauseAttributionError(
      'CAUSE_ATTRIBUTION_SUBJECT_NOT_FOUND',
      'The cause attribution subject was not found in the requested project.',
      404,
    )
  }
}

export async function recordUserConfirmedStructuredCauseAttribution(
  input: UserConfirmedStructuredCauseInput,
  dependencyOverrides?: StructuredCauseDependencies,
) {
  const { queryExec, withTransaction } = dependencies(dependencyOverrides)
  const causeRole = input.causeRole ?? 'primary'
  const rawText = text(input.rawText)
  const actorId = text(input.actorId)
  if (!rawText) {
    throw new StructuredCauseAttributionError(
      'CAUSE_ATTRIBUTION_RAW_TEXT_REQUIRED',
      'User-confirmed cause attribution requires the original field wording.',
    )
  }
  if (!actorId) {
    throw new StructuredCauseAttributionError(
      'CAUSE_ATTRIBUTION_ACTOR_REQUIRED',
      'User-confirmed cause attribution requires an authenticated actor.',
      403,
    )
  }

  return withTransaction(async () => {
    await assertProjectTenant(queryExec, input.companyId, input.projectId)
    await assertCauseSubjectProject(queryExec, input.subjectType, input.subjectId, input.projectId)

    if (causeRole === 'primary') {
      await queryExec(
        `UPDATE public.structured_cause_attributions
            SET status = 'superseded', updated_at = NOW()
          WHERE company_id = $1
            AND project_id = $2
            AND subject_type = $3
            AND subject_id = $4
            AND event_type = $5
            AND cause_role = 'primary'
            AND status = 'confirmed'`,
        [input.companyId, input.projectId, input.subjectType, input.subjectId, input.eventType],
      )
    }

    const dedupeKey = buildDedupeKey({
      companyId: input.companyId,
      projectId: input.projectId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      eventType: input.eventType,
      rawText,
      evidence: [],
    }, input.causeCode, causeRole)
    const result = await queryExec(
       `INSERT INTO public.structured_cause_attributions (
         company_id, project_id, subject_type, subject_id, event_type,
         cause_code, prefilled_cause_code, prefill_modified, cause_role, taxonomy_version, responsibility_class,
         responsibility_basis, raw_text, evidence_refs, evidence_source_types,
         rule_version, confidence, status, auto_confirmed, confirmation_source,
         review_reason_codes, confirmed_by, confirmed_at, dedupe_key, created_by
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, NULL, NULL, $7, $8, $9,
         NULLIF($10, ''), $11, $12::jsonb, $13::jsonb,
         $14, 1, 'confirmed', FALSE, 'user_confirmed',
         '[]'::jsonb, $15, NOW(), $16, $15
       )
       ON CONFLICT (company_id, dedupe_key) DO UPDATE SET
         cause_code = EXCLUDED.cause_code,
         prefill_modified = CASE
           WHEN structured_cause_attributions.prefilled_cause_code IS NULL THEN NULL
           ELSE structured_cause_attributions.prefilled_cause_code IS DISTINCT FROM EXCLUDED.cause_code
         END,
         cause_role = EXCLUDED.cause_role,
         taxonomy_version = EXCLUDED.taxonomy_version,
         responsibility_class = EXCLUDED.responsibility_class,
         responsibility_basis = EXCLUDED.responsibility_basis,
         raw_text = EXCLUDED.raw_text,
         evidence_refs = EXCLUDED.evidence_refs,
         evidence_source_types = EXCLUDED.evidence_source_types,
         rule_version = EXCLUDED.rule_version,
         confidence = 1,
         status = 'confirmed',
         auto_confirmed = FALSE,
         confirmation_source = 'user_confirmed',
         review_reason_codes = '[]'::jsonb,
         confirmed_by = EXCLUDED.confirmed_by,
         confirmed_at = NOW(),
         rejected_by = NULL,
         rejected_at = NULL,
         rejection_reason = NULL,
         updated_at = NOW()
       RETURNING *`,
      [
        input.companyId,
        input.projectId,
        input.subjectType,
        input.subjectId,
        input.eventType,
        input.causeCode,
        causeRole,
        STRUCTURED_CAUSE_TAXONOMY_VERSION,
        input.responsibilityClass ?? null,
        text(input.responsibilityBasis),
        rawText,
        JSON.stringify([`user_confirmation:${actorId}`]),
        JSON.stringify(['user_confirmation']),
        STRUCTURED_CAUSE_RULE_VERSION,
        actorId,
        dedupeKey,
      ],
    )
    return result.rows[0]
  })
}

export async function recordBaselinePublicationStructuredCause(
  input: BaselinePublicationStructuredCauseInput,
  dependencyOverrides?: StructuredCauseDependencies,
) {
  const { queryExec, withTransaction } = dependencies(dependencyOverrides)
  const rawText = text(input.rawText)
  const actorId = text(input.actorId)
  if (!TAXONOMY_BY_CODE.has(input.causeCode)) {
    throw new StructuredCauseAttributionError(
      'BASELINE_CHANGE_CAUSE_INVALID',
      'Baseline publication requires a valid controlled cause code.',
    )
  }
  if (!rawText) {
    throw new StructuredCauseAttributionError(
      'BASELINE_CHANGE_CAUSE_REQUIRED',
      'Baseline publication requires the original change-reason wording.',
    )
  }
  if (!actorId) {
    throw new StructuredCauseAttributionError(
      'CAUSE_ATTRIBUTION_ACTOR_REQUIRED',
      'Baseline publication cause requires an authenticated actor.',
      403,
    )
  }

  return withTransaction(async () => {
    await assertProjectTenant(queryExec, input.companyId, input.projectId)
    const changeLogId = randomUUID()
    await queryExec(
      `INSERT INTO public.change_logs (
         id, project_id, entity_type, entity_id, action_type, action_group,
         field_name, old_value, new_value, change_reason, change_source, changed_by, changed_at,
         before_snapshot, after_snapshot, metadata, request_id, visibility, retention_policy
       ) VALUES (
         $1, $2, 'baseline', $3, 'baseline_publish', 'confirm',
         'status', $4, $5, $6, 'user_confirm', $7, NOW(),
         $8::jsonb, $9::jsonb, $10::jsonb, NULL, 'user', 'project_lifecycle'
       )`,
      [
        changeLogId,
        input.projectId,
        input.baselineId,
        input.previousStatus,
        input.nextStatus,
        rawText,
        actorId,
        JSON.stringify({ status: input.previousStatus }),
        JSON.stringify({ status: input.nextStatus }),
        JSON.stringify({
          source: 'baseline_publication_structured_cause',
          causeCode: input.causeCode,
          taxonomyVersion: STRUCTURED_CAUSE_TAXONOMY_VERSION,
        }),
      ],
    )

    const attribution = await recordUserConfirmedStructuredCauseAttribution({
      companyId: input.companyId,
      projectId: input.projectId,
      subjectType: 'baseline_change',
      subjectId: changeLogId,
      eventType: 'baseline_change',
      causeCode: input.causeCode,
      causeRole: 'primary',
      rawText,
      actorId,
    }, {
      queryExec,
      withTransaction: async (work) => work(),
    })

    return { changeLogId, attribution }
  })
}

export async function confirmStructuredCauseAttribution(input: {
  attributionId: string
  companyId: string
  projectId: string
  actorId: string
  causeCode?: StructuredCauseCode | null
  responsibilityClass?: ContractualResponsibilityClass | null
  responsibilityBasis?: string | null
  rawText?: string | null
}, dependencyOverrides?: StructuredCauseDependencies) {
  const { queryExec, withTransaction } = dependencies(dependencyOverrides)
  return withTransaction(async () => {
    const currentResult = await queryExec(
      `SELECT *
         FROM public.structured_cause_attributions
        WHERE id = $1 AND company_id = $2 AND project_id = $3
        FOR UPDATE`,
      [input.attributionId, input.companyId, input.projectId],
    )
    const current = currentResult.rows[0]
    if (!current) {
      throw new StructuredCauseAttributionError('CAUSE_ATTRIBUTION_NOT_FOUND', 'Cause attribution was not found.', 404)
    }
    if (text(current.status) === 'rejected' || text(current.status) === 'superseded') {
      throw new StructuredCauseAttributionError('CAUSE_ATTRIBUTION_NOT_CONFIRMABLE', 'Rejected or superseded attribution cannot be confirmed.', 409)
    }
    const confirmedCauseCode = input.causeCode ?? current.cause_code
    if (!isCauseCode(confirmedCauseCode)) {
      throw new StructuredCauseAttributionError(
        'CAUSE_ATTRIBUTION_CAUSE_CODE_INVALID',
        'Cause confirmation requires a valid controlled cause code.',
      )
    }

    if (text(current.cause_role) === 'primary') {
      await queryExec(
        `UPDATE public.structured_cause_attributions
            SET status = 'superseded', updated_at = NOW()
          WHERE company_id = $1
            AND project_id = $2
            AND subject_type = $3
            AND subject_id = $4
            AND event_type = $5
            AND cause_role = 'primary'
            AND status = 'confirmed'
            AND id <> $6`,
        [
          input.companyId,
          input.projectId,
          current.subject_type,
          current.subject_id,
          current.event_type,
          input.attributionId,
        ],
      )
    }

    const updated = await queryExec(
      `UPDATE public.structured_cause_attributions
          SET cause_code = $8,
              prefill_modified = CASE
                WHEN prefilled_cause_code IS NULL THEN NULL
                ELSE prefilled_cause_code IS DISTINCT FROM $8
              END,
              status = 'confirmed',
              auto_confirmed = FALSE,
              confirmation_source = 'user_confirmed',
              confirmed_by = $4,
              confirmed_at = NOW(),
              responsibility_class = $5,
              responsibility_basis = NULLIF($6, ''),
              raw_text = COALESCE(NULLIF($7, ''), raw_text),
              updated_at = NOW()
        WHERE id = $1 AND company_id = $2 AND project_id = $3
        RETURNING *`,
      [
        input.attributionId,
        input.companyId,
        input.projectId,
        input.actorId,
        input.responsibilityClass ?? null,
        text(input.responsibilityBasis),
        text(input.rawText),
        confirmedCauseCode,
      ],
    )
    return updated.rows[0]
  })
}

type StructuredCauseQualityMetric = {
  metricKey: 'structured_cause_other_rate' | 'structured_cause_prefill_modification_rate'
  numerator: number
  denominator: number
  value: number | null
  availability: 'ready' | 'insufficient_data'
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

function percentageMetric(
  metricKey: StructuredCauseQualityMetric['metricKey'],
  numerator: number,
  denominator: number,
): StructuredCauseQualityMetric {
  return {
    metricKey,
    numerator,
    denominator,
    value: denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : null,
    availability: denominator > 0 ? 'ready' : 'insufficient_data',
  }
}

export async function getStructuredCauseAttributionQualityMetrics(input: {
  companyId: string
  projectId: string
}, dependencyOverrides?: Pick<StructuredCauseDependencies, 'queryExec'>) {
  const { queryExec } = dependencies(dependencyOverrides)
  await assertProjectTenant(queryExec, input.companyId, input.projectId)
  const result = await queryExec(
    `SELECT
       COUNT(*) FILTER (WHERE confirmed_at IS NOT NULL)::integer AS confirmed_count,
       COUNT(*) FILTER (
         WHERE confirmed_at IS NOT NULL AND cause_code = 'other'
       )::integer AS other_count,
       COUNT(*) FILTER (
         WHERE confirmed_at IS NOT NULL
           AND confirmation_source = 'user_confirmed'
           AND prefilled_cause_code IS NOT NULL
       )::integer AS prefill_reviewed_count,
       COUNT(*) FILTER (
         WHERE confirmed_at IS NOT NULL
           AND confirmation_source = 'user_confirmed'
           AND prefilled_cause_code IS NOT NULL
           AND prefill_modified IS TRUE
       )::integer AS prefill_modified_count
     FROM public.structured_cause_attributions
     WHERE company_id = $1
       AND project_id = $2`,
    [input.companyId, input.projectId],
  )
  const aggregate = result.rows[0] ?? {}
  const confirmedCount = nonNegativeInteger(aggregate.confirmed_count)
  const otherCount = Math.min(nonNegativeInteger(aggregate.other_count), confirmedCount)
  const prefillReviewedCount = nonNegativeInteger(aggregate.prefill_reviewed_count)
  const prefillModifiedCount = Math.min(
    nonNegativeInteger(aggregate.prefill_modified_count),
    prefillReviewedCount,
  )
  const otherRate = percentageMetric('structured_cause_other_rate', otherCount, confirmedCount)
  const prefillModificationRate = percentageMetric(
    'structured_cause_prefill_modification_rate',
    prefillModifiedCount,
    prefillReviewedCount,
  )
  const revisionSignals: Array<{
    candidateType: 'taxonomy_revision' | 'inference_rule_revision'
    reasonCode: string
    metricKey: StructuredCauseQualityMetric['metricKey']
    observedPercent: number
    thresholdPercent: number
    sampleCount: number
  }> = []

  if (
    confirmedCount >= STRUCTURED_CAUSE_QUALITY_POLICY.minimumSampleCount
    && otherRate.value != null
    && otherRate.value > STRUCTURED_CAUSE_QUALITY_POLICY.otherRateRevisionThresholdPercent
  ) {
    revisionSignals.push({
      candidateType: 'taxonomy_revision',
      reasonCode: 'structured_cause_other_rate_above_threshold',
      metricKey: otherRate.metricKey,
      observedPercent: otherRate.value,
      thresholdPercent: STRUCTURED_CAUSE_QUALITY_POLICY.otherRateRevisionThresholdPercent,
      sampleCount: confirmedCount,
    })
  }
  if (
    prefillReviewedCount >= STRUCTURED_CAUSE_QUALITY_POLICY.minimumSampleCount
    && prefillModificationRate.value != null
    && prefillModificationRate.value > STRUCTURED_CAUSE_QUALITY_POLICY.prefillModificationRateRevisionThresholdPercent
  ) {
    revisionSignals.push({
      candidateType: 'inference_rule_revision',
      reasonCode: 'structured_cause_prefill_modification_rate_above_threshold',
      metricKey: prefillModificationRate.metricKey,
      observedPercent: prefillModificationRate.value,
      thresholdPercent: STRUCTURED_CAUSE_QUALITY_POLICY.prefillModificationRateRevisionThresholdPercent,
      sampleCount: prefillReviewedCount,
    })
  }

  return {
    companyId: input.companyId,
    projectId: input.projectId,
    policy: STRUCTURED_CAUSE_QUALITY_POLICY,
    otherRate,
    prefillModificationRate,
    revisionSignals,
  }
}

export async function rejectStructuredCauseAttribution(input: {
  attributionId: string
  companyId: string
  projectId: string
  actorId: string
  rejectionReason: string
}, dependencyOverrides?: StructuredCauseDependencies) {
  const { queryExec, withTransaction } = dependencies(dependencyOverrides)
  return withTransaction(async () => {
    const updated = await queryExec(
      `UPDATE public.structured_cause_attributions
          SET status = 'rejected',
              rejected_by = $4,
              rejected_at = NOW(),
              rejection_reason = $5,
              updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
          AND project_id = $3
          AND status = 'candidate'
        RETURNING *`,
      [input.attributionId, input.companyId, input.projectId, input.actorId, text(input.rejectionReason)],
    )
    if (!updated.rows[0]) {
      throw new StructuredCauseAttributionError('CAUSE_ATTRIBUTION_NOT_REJECTABLE', 'Candidate attribution was not found.', 409)
    }
    return updated.rows[0]
  })
}

export async function listStructuredCauseAttributions(input: {
  companyId: string
  projectId: string
  subjectType?: StructuredCauseCandidateInput['subjectType'] | null
  subjectId?: string | null
  status?: CauseStatus | null
}, dependencyOverrides?: Pick<StructuredCauseDependencies, 'queryExec'>) {
  const { queryExec } = dependencies(dependencyOverrides)
  await assertProjectTenant(queryExec, input.companyId, input.projectId)
  const result = await queryExec(
    `SELECT *
       FROM public.structured_cause_attributions
      WHERE company_id = $1
        AND project_id = $2
        AND ($3::text IS NULL OR subject_type = $3)
        AND ($4::text IS NULL OR subject_id = $4)
        AND ($5::text IS NULL OR status = $5)
      ORDER BY created_at DESC, id DESC`,
    [input.companyId, input.projectId, input.subjectType ?? null, text(input.subjectId) || null, input.status ?? null],
  )
  return result.rows
}
