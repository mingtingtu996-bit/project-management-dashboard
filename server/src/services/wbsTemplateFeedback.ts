import { executeSQL, executeSQLOne } from './dbService.js'
import type {
  WbsTemplateFeedbackReport,
  WbsTemplateReferenceDayFeedbackNode,
} from '../types/planning.js'
import { query as rawQuery, withDatabaseTransaction } from '../database.js'
import { logger } from '../middleware/logger.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'
import {
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import {
  createAndPersistAlgorithmAssetCandidateEvent,
} from './algorithmAssetCandidateEventAdapterService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'

interface TemplateNode {
  title: string
  description?: string | null
  reference_days?: number | null
  duration?: number | null
  is_milestone?: boolean
  source_id?: string | null
  children?: TemplateNode[]
}

interface CompletedProjectRow {
  id: string
  name?: string | null
  status?: string | null
}

interface TaskRow {
  id: string
  project_id: string
  title?: string | null
  status?: string | null
  task_source?: string | null
  baseline_item_id?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  source_template_id?: string | null
  template_id?: string | null
  generation_batch_id?: string | null
}

interface TrustedWbsRuntimeConsumptionRow {
  company_id?: string | null
  project_id?: string | null
  task_id?: string | null
  consumption_key?: string | null
  publication_key?: string | null
  asset_key?: string | null
  artifact_key?: string | null
  generation_batch_id?: string | null
  template_id?: string | null
  source_evidence_refs?: unknown
  consumption_context?: unknown
  publication_stage?: string | null
  monitoring_status?: string | null
  publication_scope_level?: string | null
  publication_company_id?: string | null
  publication_project_id?: string | null
  publication_industry_key?: string | null
  consumed_at?: string | null
}

interface WbsReferenceRuntimeLineage {
  status:
    | 'linked'
    | 'unlinked_no_trusted_consumption'
    | 'unlinked_incomplete_task_coverage'
    | 'ambiguous_trusted_consumption'
  publicationKeys: string[]
  publicationKey: string | null
  artifactKey: string | null
  generationBatchId: string | null
  inputTaskIds: string[]
  consumptionKeys: string[]
  consumedAtStart: string | null
  consumedAtEnd: string | null
}

interface TemplateTreeNode {
  path: string
  title: string
  source_id: string | null
  reference_days: number | null
  children: TemplateTreeNode[]
}

interface BaselineItemRow {
  id: string
  source_task_id?: string | null
}

interface TemplateSourceCandidate {
  sourceId: string
  normalizedTitle: string
  compactTitle: string
  isLeaf: boolean
}

export interface CollectWbsTemplateFeedbackOptions {
  projectIds?: string[] | null
  companyId?: string | null
  governanceQueryExec?: AlgorithmAssetGovernanceQueryExec
  constructionCalendarResolver?: typeof resolveConstructionCalendarContext
  constructionCalendarsByProjectId?: Record<string, ConstructionCalendarContext>
  runtimePublicationLineage?: WbsReferenceRuntimeLineage
  sourceTaskIds?: string[]
  observationStartedAt?: string | null
  observationEndedAt?: string | null
  observationWindowDays?: number
}

export type WbsTemplateFeedbackTargetQueryExec = (
  sql: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>

export interface WbsTemplateFeedbackGovernanceSweepOptions {
  companyId?: string | null
  pageSize?: number
  targetQueryExec?: WbsTemplateFeedbackTargetQueryExec
  governanceQueryExec?: AlgorithmAssetGovernanceQueryExec
}

export interface WbsTemplateFeedbackProducerTarget {
  companyId: string
  projectId: string
  templateId: string
}

function normalizeText(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase()
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return readJsonRecord(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readJsonStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    try {
      return readJsonStringArray(JSON.parse(value))
    } catch {
      return value.trim() ? [normalizeText(value)] : []
    }
  }
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => normalizeText(String(item))).filter(Boolean)))
    : []
}

function normalizeCompactText(value?: string | null): string {
  return normalizeText(value).replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
}

const COMPLETED_PROJECT_STATUSES = new Set([
  'completed',
  'done',
  'closed',
  'finished',
  '已完成',
  '完成',
])

const WBS_REFERENCE_DAYS_ASSET_KEY = 'wbs_reference_days'
const WBS_REFERENCE_DAYS_ACCEPTED_SAMPLE_THRESHOLD = 5
const WBS_REFERENCE_DAYS_DAY_COUNT_BASIS = 'construction_production_day'
const WBS_REFERENCE_DAYS_REFERENCE_DAY_BASIS = 'wbs_template_reference_days'
const WBS_REFERENCE_DAYS_CONSTRUCTION_CALENDAR_BASIS = 'per_project_resolved_construction_calendar'

function isCompletedProjectStatus(status?: string | null): boolean {
  return COMPLETED_PROJECT_STATUSES.has(normalizeText(status))
}

function parseTemplateNodes(raw: any): TemplateNode[] {
  const source = raw?.wbs_nodes ?? raw?.template_data ?? raw?.nodes ?? raw ?? []
  if (typeof source === 'string') {
    try {
      return parseTemplateNodes(JSON.parse(source))
    } catch {
      return []
    }
  }

  if (!Array.isArray(source)) return []

  return source.map((node: any) => ({
    title: String(node.title ?? node.name ?? '未命名节点'),
    description: node.description ?? null,
    reference_days: typeof node.reference_days === 'number' ? node.reference_days : (typeof node.duration === 'number' ? node.duration : null),
    duration: node.duration ?? null,
    is_milestone: Boolean(node.is_milestone),
    source_id: node.source_id ?? node.id ?? null,
    children: parseTemplateNodes(node.children ?? []),
  }))
}

function buildTemplateTree(nodes: TemplateNode[], parentPath = ''): TemplateTreeNode[] {
  return nodes.map((node, index) => {
    const title = String(node.title ?? '').trim() || '未命名节点'
    const path = parentPath ? `${parentPath}/${index}:${normalizeText(title)}` : `${index}:${normalizeText(title)}`
    return {
      path,
      title,
      source_id: normalizeText(node.source_id),
      reference_days: typeof node.reference_days === 'number' ? node.reference_days : (typeof node.duration === 'number' ? node.duration : null),
      children: buildTemplateTree(node.children ?? [], path),
    }
  })
}

function flattenTree(nodes: TemplateTreeNode[]): TemplateTreeNode[] {
  const result: TemplateTreeNode[] = []
  const visit = (node: TemplateTreeNode) => {
    result.push(node)
    for (const child of node.children) {
      visit(child)
    }
  }
  for (const node of nodes) {
    visit(node)
  }
  return result
}

function buildTemplateTitleLookup(nodes: TemplateTreeNode[]) {
  const lookup = new Map<string, string[]>()
  for (const node of flattenTree(nodes)) {
    const normalizedTitle = normalizeText(node.title)
    if (!normalizedTitle || !node.source_id) continue
    const bucket = lookup.get(normalizedTitle) ?? []
    bucket.push(node.source_id)
    lookup.set(normalizedTitle, bucket)
  }
  return lookup
}

function buildTemplateSourceCandidates(nodes: TemplateTreeNode[]): TemplateSourceCandidate[] {
  return flattenTree(nodes)
    .filter((node) => Boolean(node.source_id))
    .map((node) => ({
      sourceId: node.source_id!,
      normalizedTitle: normalizeText(node.title),
      compactTitle: normalizeCompactText(node.title),
      isLeaf: node.children.length === 0,
    }))
}

function findUniqueAdHocSourceId(params: {
  title: string | null | undefined
  templateTitleLookup: Map<string, string[]>
  templateSourceCandidates: TemplateSourceCandidate[]
}) {
  const normalizedTitle = normalizeText(params.title)
  const exactSourceIds = params.templateTitleLookup.get(normalizedTitle) ?? []
  if (exactSourceIds.length === 1) {
    return exactSourceIds[0]!
  }

  const compactTitle = normalizeCompactText(params.title)
  if (!compactTitle) return ''

  const findUniqueCandidate = (candidates: TemplateSourceCandidate[]) => {
    const sourceIds = new Set(
      candidates
        .filter((candidate) => {
          if (!candidate.compactTitle) return false
          if (compactTitle === candidate.compactTitle) return true
          if (compactTitle.length >= candidate.compactTitle.length && compactTitle.includes(candidate.compactTitle)) return true
          if (candidate.compactTitle.length >= compactTitle.length && candidate.compactTitle.includes(compactTitle)) return true
          return false
        })
        .map((candidate) => candidate.sourceId),
    )
    return sourceIds.size === 1 ? [...sourceIds][0]! : ''
  }

  return findUniqueCandidate(params.templateSourceCandidates.filter((candidate) => candidate.isLeaf))
    || findUniqueCandidate(params.templateSourceCandidates)
}

function getDurationDays(
  task: TaskRow,
  constructionCalendarsByProjectId: Record<string, ConstructionCalendarContext>,
): number | null {
  if (!task.actual_start_date || !task.actual_end_date) return null
  const start = parseConstructionCalendarDate(task.actual_start_date)
  const end = parseConstructionCalendarDate(task.actual_end_date)
  if (!start || !end) return null
  const duration = productionDaysBetweenInclusive(
    start,
    end,
    constructionCalendarsByProjectId[task.project_id] ?? null,
  )
  return Number.isFinite(duration) && duration >= 1 ? duration : null
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function roundSuggestedValue(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null
  return Math.max(1, Math.round(value))
}

function collectSamplesByStructuredSource(params: {
  tasks: TaskRow[]
  baselineItems: BaselineItemRow[]
  knownTemplateSourceIds: Set<string>
  templateTitleLookup: Map<string, string[]>
  templateSourceCandidates: TemplateSourceCandidate[]
  constructionCalendarsByProjectId: Record<string, ConstructionCalendarContext>
}) {
  const bySourceId = new Map<string, number[]>()
  let matchedTaskCount = 0
  let matchedAdHocTaskCount = 0
  const matchedProjectIds = new Set<string>()
  const matchedTasks: TaskRow[] = []
  const baselineItemById = new Map(
    params.baselineItems.map((item) => [String(item.id), normalizeText(item.source_task_id)]),
  )

  for (const task of params.tasks) {
    const duration = getDurationDays(task, params.constructionCalendarsByProjectId)
    if (duration === null) continue

    const baselineSourceId = task.baseline_item_id
      ? baselineItemById.get(String(task.baseline_item_id)) ?? ''
      : ''

    const directSourceId = normalizeText(task.id)
    const structuredSourceId = params.knownTemplateSourceIds.has(baselineSourceId)
      ? baselineSourceId
      : params.knownTemplateSourceIds.has(directSourceId)
        ? directSourceId
        : ''

    const isAdHocTask = normalizeText(task.task_source) === 'ad_hoc'
    const adHocFallbackSourceId =
      !structuredSourceId && isAdHocTask
        ? findUniqueAdHocSourceId({
            title: task.title,
            templateTitleLookup: params.templateTitleLookup,
            templateSourceCandidates: params.templateSourceCandidates,
          })
        : ''

    const matchedSourceId = structuredSourceId || adHocFallbackSourceId

    if (!matchedSourceId) continue

    const bucket = bySourceId.get(matchedSourceId) ?? []
    bucket.push(duration)
    bySourceId.set(matchedSourceId, bucket)
    matchedTaskCount += 1
    matchedTasks.push(task)
    if (adHocFallbackSourceId) matchedAdHocTaskCount += 1
    matchedProjectIds.add(task.project_id)
  }

  return { bySourceId, matchedTaskCount, matchedAdHocTaskCount, matchedProjectIds, matchedTasks }
}

function aggregateTreeFeedback(
  nodes: TemplateTreeNode[],
  sampleMaps: {
    bySourceId: Map<string, number[]>
  },
): WbsTemplateReferenceDayFeedbackNode[] {
  const rows: WbsTemplateReferenceDayFeedbackNode[] = []

  const visit = (node: TemplateTreeNode): number[] => {
    const structuredSamples = node.source_id ? sampleMaps.bySourceId.get(node.source_id) ?? [] : []
    const ownSamples = [...structuredSamples]
    const descendantSamples = node.children.flatMap((child) => visit(child))
    const sampleValues = [...ownSamples, ...descendantSamples]
    const currentReferenceDays = node.reference_days ?? null
    const medianDays = median(sampleValues)
    const meanDays = mean(sampleValues)
    const suggestedReferenceDays = roundSuggestedValue(sampleValues.length > 0 ? medianDays : currentReferenceDays)

    rows.push({
      path: node.path,
      title: node.title,
      is_leaf: node.children.length === 0,
      sample_count: sampleValues.length,
      mean_days: Number(meanDays.toFixed(2)),
      median_days: Number(medianDays.toFixed(2)),
      current_reference_days: currentReferenceDays,
      suggested_reference_days: suggestedReferenceDays,
      sample_values: sampleValues,
    })

    return sampleValues
  }

  for (const node of nodes) {
    visit(node)
  }

  return rows
}

function normalizeProjectScope(projectIds?: string[] | null) {
  if (!Array.isArray(projectIds)) return null
  return Array.from(new Set(projectIds.map((id) => normalizeText(id)).filter(Boolean)))
}

function normalizeId(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function buildProjectScopeClause(projectIds: string[] | null, columnName = 'id') {
  if (!projectIds) return { clause: '', params: [] as string[] }
  if (projectIds.length === 0) return { clause: ' WHERE 1 = 0', params: [] as string[] }
  return {
    clause: ` WHERE ${columnName} IN (${projectIds.map(() => '?').join(', ')})`,
    params: projectIds,
  }
}

function buildIdScopeClause(ids: string[], columnName = 'id') {
  if (ids.length === 0) return { clause: ' WHERE 1 = 0', params: [] as string[] }
  return {
    clause: ` WHERE ${columnName} IN (${ids.map(() => '?').join(', ')})`,
    params: ids,
  }
}

function buildBaselineItemScopeClause(ids: string[], projectIds: string[] | null) {
  const idScope = buildIdScopeClause(ids)
  if (!projectIds) return idScope
  if (projectIds.length === 0) return { clause: ' WHERE 1 = 0', params: [] as string[] }
  return {
    clause: `${idScope.clause} AND project_id IN (${projectIds.map(() => '?').join(', ')})`,
    params: [...idScope.params, ...projectIds],
  }
}

async function readOptionalFeedbackRows<T>(label: string, sql: string, params: string[]): Promise<T[]> {
  try {
    // execute-sql-dynamic-approved: optional WBS feedback readers use local fixed SELECT builders; scope values stay parameter-bound.
    return await executeSQL<T>(sql, params)
  } catch (error) {
    logger.warn('[wbs-template-feedback] optional feedback sample read failed; continuing with template-only inference', {
      label,
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

function mapFeedbackNodeForCandidate(node: WbsTemplateReferenceDayFeedbackNode) {
  return {
    path: node.path,
    title: node.title,
    isLeaf: node.is_leaf,
    sampleCount: node.sample_count,
    meanDays: node.mean_days,
    medianDays: node.median_days,
    currentReferenceDays: node.current_reference_days,
    suggestedReferenceDays: node.suggested_reference_days,
    sampleValues: node.sample_values,
    dayCountBasis: WBS_REFERENCE_DAYS_DAY_COUNT_BASIS,
    referenceDayBasis: WBS_REFERENCE_DAYS_REFERENCE_DAY_BASIS,
    constructionCalendarBasis: WBS_REFERENCE_DAYS_CONSTRUCTION_CALENDAR_BASIS,
    productionDayConversionApplied: true,
  }
}

// workspace-isolation-capability-read-approved: the global branch only accepts templates with both tenant scopes null; company and project branches bind the caller's authorized ids.
async function readVisibleWbsTemplate(
  templateId: string,
  companyId: string | null,
  projectIds: string[],
) {
  const globalTemplate = await executeSQLOne<any>(
    `SELECT *
       FROM wbs_templates
      WHERE id = ?
        AND project_id IS NULL
        AND company_id IS NULL
      LIMIT 1`,
    [templateId],
  )
  if (globalTemplate) return globalTemplate

  if (companyId) {
    const companyTemplate = await executeSQLOne<any>(
      `SELECT *
         FROM wbs_templates
        WHERE id = ?
          AND project_id IS NULL
          AND company_id = ?
        LIMIT 1`,
      [templateId, companyId],
    )
    if (companyTemplate) return companyTemplate
  }

  if (projectIds.length === 0) return null
  return await executeSQLOne<any>(
    `SELECT *
       FROM wbs_templates
      WHERE id = ?
        AND project_id = ANY(?::uuid[])
      LIMIT 1`,
    [templateId, projectIds],
  )
}

function getScopedProjectId(projectIds?: string[] | null) {
  const normalized = normalizeProjectScope(projectIds)
  return normalized?.length === 1 ? normalized[0]! : null
}

function getActionableReferenceDayFeedbackNodes(report: WbsTemplateFeedbackReport) {
  return report.nodes.filter((node) =>
    node.is_leaf
    && node.sample_count > 0
    && node.suggested_reference_days !== null
    && node.suggested_reference_days !== undefined
    && node.current_reference_days !== node.suggested_reference_days,
  )
}

function roundQualityMetric(value: number) {
  return Number(value.toFixed(6))
}

function buildWbsReferenceDaysHoldoutEvidence(report: WbsTemplateFeedbackReport) {
  const observations = getActionableReferenceDayFeedbackNodes(report).flatMap((node) => {
    const baselineDays = Number(node.current_reference_days)
    const samples = node.sample_values
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
    if (!Number.isFinite(baselineDays) || baselineDays <= 0 || samples.length < 4) return []
    return samples.map((actualDays, index) => ({
      actualDays,
      baselineDays,
      candidateDays: median(samples.filter((_, trainingIndex) => trainingIndex !== index)),
    }))
  })
  if (observations.length === 0) {
    return {
      qualityModel: 'numeric_holdout' as const,
      holdoutSampleCount: 0,
      maeBefore: null,
      maeAfter: null,
      conflictRate: null,
      overcompensationRate: null,
    }
  }
  const maeBefore = observations.reduce(
    (sum, item) => sum + Math.abs(item.baselineDays - item.actualDays),
    0,
  ) / observations.length
  const maeAfter = observations.reduce(
    (sum, item) => sum + Math.abs(item.candidateDays - item.actualDays),
    0,
  ) / observations.length
  const conflictCount = observations.filter((item) => (
    Math.abs(item.candidateDays - item.actualDays) > Math.abs(item.baselineDays - item.actualDays)
  )).length
  const overcompensationCount = observations.filter((item) => {
    const before = item.baselineDays - item.actualDays
    const after = item.candidateDays - item.actualDays
    return before !== 0
      && after !== 0
      && Math.sign(before) !== Math.sign(after)
      && Math.abs(after) >= Math.abs(before)
  }).length
  return {
    qualityModel: 'numeric_holdout' as const,
    holdoutSampleCount: observations.length,
    maeBefore: roundQualityMetric(maeBefore),
    maeAfter: roundQualityMetric(maeAfter),
    conflictRate: roundQualityMetric(conflictCount / observations.length),
    overcompensationRate: roundQualityMetric(overcompensationCount / observations.length),
  }
}

function wbsReferenceDaysOutcomeStatus(report: WbsTemplateFeedbackReport): 'accepted' | 'weak' | null {
  if (report.sample_task_count <= 0 || report.completed_project_count <= 0) return null
  const actionableNodes = getActionableReferenceDayFeedbackNodes(report)
  if (actionableNodes.length <= 0) return null

  return report.sample_task_count >= WBS_REFERENCE_DAYS_ACCEPTED_SAMPLE_THRESHOLD
    ? 'accepted'
    : 'weak'
}

async function recordWbsReferenceDaysPlanNetworkOutcome(
  report: WbsTemplateFeedbackReport,
  options: CollectWbsTemplateFeedbackOptions,
) {
  const outcomeStatus = wbsReferenceDaysOutcomeStatus(report)
  if (!outcomeStatus) return 0

  const projectId = getScopedProjectId(options.projectIds)
  if (!projectId) return 0
  const actionableNodes = getActionableReferenceDayFeedbackNodes(report)
  const quality = buildWbsReferenceDaysHoldoutEvidence(report)
  const sourceTaskIds = Array.from(new Set((options.sourceTaskIds ?? [])
    .map(normalizeId)
    .filter((value): value is string => Boolean(value))))
  const runtimeLineage = options.runtimePublicationLineage ?? emptyWbsReferenceRuntimeLineage()
  const consumedPublicationKeys = runtimeLineage.publicationKeys
  const runtimePublicationKey = runtimeLineage.status === 'linked'
    ? runtimeLineage.publicationKey
    : null
  const runtimePublicationInputTaskIds = runtimeLineage.status === 'linked'
    ? runtimeLineage.inputTaskIds
    : []
  const publicationLineageStatus = runtimeLineage.status
  const lineageIdentity = runtimePublicationKey
    ? `:${runtimePublicationKey}:${runtimeLineage.generationBatchId}`
    : `:${publicationLineageStatus}`
  const outcomeId = `wbs-reference-days:${report.template_id}:${projectId ?? 'multi-project'}${lineageIdentity}`
  const metadata = {
    source: 'wbs_template_feedback',
    template_id: report.template_id,
    template_name: report.template_name,
    sample_task_count: report.sample_task_count,
    completed_project_count: report.completed_project_count,
    matched_ad_hoc_task_count: report.matched_ad_hoc_task_count,
    node_count: report.node_count,
    actionable_node_count: actionableNodes.length,
    accepted_sample_threshold: WBS_REFERENCE_DAYS_ACCEPTED_SAMPLE_THRESHOLD,
    project_scope: normalizeProjectScope(options.projectIds),
    nodes: actionableNodes.map(mapFeedbackNodeForCandidate),
    day_count_basis: WBS_REFERENCE_DAYS_DAY_COUNT_BASIS,
    reference_day_basis: WBS_REFERENCE_DAYS_REFERENCE_DAY_BASIS,
    construction_calendar_basis: WBS_REFERENCE_DAYS_CONSTRUCTION_CALENDAR_BASIS,
    production_day_conversion_applied: true,
    construction_calendar_by_project: options.constructionCalendarsByProjectId ?? {},
    consumed_runtime_publication_keys: consumedPublicationKeys,
    publication_lineage_status: publicationLineageStatus,
    runtime_publication_key: runtimePublicationKey,
    runtime_publication_artifact_key: runtimePublicationKey ? runtimeLineage.artifactKey : null,
    runtime_publication_input_task_ids: runtimePublicationInputTaskIds,
    runtime_publication_generation_batch_id: runtimePublicationKey ? runtimeLineage.generationBatchId : null,
    generation_batch_id: runtimePublicationKey ? runtimeLineage.generationBatchId : null,
    runtime_publication_consumption_keys: runtimePublicationKey ? runtimeLineage.consumptionKeys : [],
    runtime_publication_consumed_at_start: runtimePublicationKey ? runtimeLineage.consumedAtStart : null,
    runtime_publication_consumed_at_end: runtimePublicationKey ? runtimeLineage.consumedAtEnd : null,
    source_task_ids: sourceTaskIds,
    source_evidence_refs: Array.from(new Set([
      ...sourceTaskIds.map((taskId) => `tasks:${taskId}:actual_duration`),
      ...(runtimePublicationKey
        ? [`duration_learning_runtime_publications:${runtimePublicationKey}`]
        : []),
      ...(runtimePublicationKey ? runtimeLineage.consumptionKeys.map((key) => `duration_learning_runtime_consumptions:${key}`) : []),
    ])),
    real_outcome_count: report.sample_task_count,
    replay_case_count: quality.holdoutSampleCount,
    observation_started_at: options.observationStartedAt ?? null,
    observation_ended_at: options.observationEndedAt ?? null,
    observation_window_days: options.observationWindowDays ?? 0,
    quality_model: quality.qualityModel,
    holdout_sample_count: quality.holdoutSampleCount,
    mae_before: quality.maeBefore,
    mae_after: quality.maeAfter,
    conflict_rate: quality.conflictRate,
    overcompensation_rate: quality.overcompensationRate,
    rollback_ready: true,
    tenant_scope_valid: Boolean(normalizeId(options.companyId) && projectId),
    writes_runtime_directly: false,
    writes_fact_directly: false,
  }
  const params = [
    outcomeId,
    WBS_REFERENCE_DAYS_ASSET_KEY,
    outcomeStatus,
    `wbs_template_feedback:${report.template_id}`,
    'project',
    'project_business_outcome_writer',
    normalizeId(options.companyId),
    projectId,
    runtimePublicationKey,
    metadata,
    false,
    false,
  ]

  if (options.governanceQueryExec) {
    await options.governanceQueryExec(
      `INSERT INTO public.duration_plan_network_outcomes (
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
        writes_runtime_directly,
        writes_fact_directly
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        outcome_status = EXCLUDED.outcome_status,
        outcome_ref = EXCLUDED.outcome_ref,
        learning_scope = EXCLUDED.learning_scope,
        learning_scope_source = EXCLUDED.learning_scope_source,
        company_id = EXCLUDED.company_id,
        project_id = EXCLUDED.project_id,
        publication_key = EXCLUDED.publication_key,
        observed_at = now(),
        metadata = EXCLUDED.metadata,
        writes_runtime_directly = false,
        writes_fact_directly = false`,
      params,
    )
    return 1
  }

  await rawQuery(
    `INSERT INTO public.duration_plan_network_outcomes (
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
        writes_runtime_directly,
        writes_fact_directly
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        outcome_status = EXCLUDED.outcome_status,
        outcome_ref = EXCLUDED.outcome_ref,
        learning_scope = EXCLUDED.learning_scope,
        learning_scope_source = EXCLUDED.learning_scope_source,
        company_id = EXCLUDED.company_id,
        project_id = EXCLUDED.project_id,
        publication_key = EXCLUDED.publication_key,
        observed_at = now(),
        metadata = EXCLUDED.metadata,
        writes_runtime_directly = false,
        writes_fact_directly = false`,
    params as any[],
  )
  return 1
}

const TRUSTED_WBS_REFERENCE_RUNTIME_CONSUMPTIONS_SQL = `SELECT
    consumption.company_id,
    consumption.project_id,
    consumption.task_id::text AS task_id,
    consumption.consumption_key,
    consumption.publication_key,
    consumption.asset_key,
    consumption.artifact_key,
    consumption.generation_batch_id,
    consumption.template_id,
    consumption.source_evidence_refs,
    consumption.consumption_context,
    publication.publication_stage,
    publication.monitoring_status,
    publication.scope_level AS publication_scope_level,
    publication.company_id AS publication_company_id,
    publication.project_id AS publication_project_id,
    publication.industry_key AS publication_industry_key,
    consumption.consumed_at
  FROM public.duration_learning_runtime_consumptions consumption
  JOIN public.projects project
    ON project.id = consumption.project_id
   AND project.company_id = consumption.company_id
  JOIN public.tasks materialized_task
    ON materialized_task.id = consumption.task_id
   AND materialized_task.project_id = consumption.project_id
   AND materialized_task.generation_batch_id IS NOT NULL
   AND materialized_task.generation_batch_id::text = consumption.generation_batch_id
   AND COALESCE(materialized_task.source_template_id, materialized_task.template_id)::text = consumption.artifact_key
  JOIN public.duration_learning_runtime_publications publication
    ON publication.publication_key = consumption.publication_key
   AND publication.asset_key = consumption.asset_key
   AND publication.artifact_key = consumption.artifact_key
  WHERE consumption.company_id = $1::uuid
    AND consumption.project_id = $2::uuid
    AND consumption.task_id = ANY($3::uuid[])
    AND consumption.asset_key = $4
    AND consumption.artifact_key = $5
    AND consumption.template_id = $5
    AND consumption.source_evidence_refs ? (
      'duration_learning_runtime_publications:' || consumption.publication_key
    )
    AND consumption.consumption_context ->> 'authoritySource'
          = 'runtime_resolver_publication_set'
    AND (
      (
        publication.publication_stage = 'canary'
        AND publication.monitoring_status IN ('pending', 'collecting', 'passed')
      )
      OR (
        publication.publication_stage = 'stable'
        AND publication.monitoring_status = 'passed'
      )
    )
    AND (
      (
        publication.scope_level = 'project'
        AND publication.company_id = consumption.company_id
        AND publication.project_id = consumption.project_id
        AND publication.industry_key IS NULL
      )
      OR (
        publication.scope_level = 'company'
        AND publication.company_id = consumption.company_id
        AND publication.project_id IS NULL
        AND publication.industry_key IS NULL
      )
      OR (
        publication.scope_level = 'industry'
        AND publication.company_id IS NULL
        AND publication.project_id IS NULL
        AND publication.industry_key = NULLIF(
          consumption.consumption_context ->> 'industryKey',
          ''
        )
      )
      OR (
        publication.scope_level = 'global'
        AND publication.company_id IS NULL
        AND publication.project_id IS NULL
        AND publication.industry_key IS NULL
      )
    )
  ORDER BY consumption.task_id, consumption.consumed_at, consumption.consumption_key`

function emptyWbsReferenceRuntimeLineage(
  status: WbsReferenceRuntimeLineage['status'] = 'unlinked_no_trusted_consumption',
  publicationKeys: string[] = [],
): WbsReferenceRuntimeLineage {
  return {
    status,
    publicationKeys,
    publicationKey: null,
    artifactKey: null,
    generationBatchId: null,
    inputTaskIds: [],
    consumptionKeys: [],
    consumedAtStart: null,
    consumedAtEnd: null,
  }
}

function resolveWbsReferenceRuntimeLineages(params: {
  tasks: readonly TaskRow[]
  rows: readonly TrustedWbsRuntimeConsumptionRow[]
  templateId: string
}) {
  const tasksById = new Map(params.tasks.map((task) => [normalizeId(task.id), task]))
  const eligibleRows = params.rows.filter((row) => {
    const taskId = normalizeId(row.task_id)
    const task = taskId ? tasksById.get(taskId) : null
    const generationBatchId = normalizeId(row.generation_batch_id)
    const taskGenerationBatchId = normalizeId(task?.generation_batch_id)
    const taskTemplateId = normalizeId(task?.source_template_id ?? task?.template_id)
    const publicationKey = normalizeId(row.publication_key)
    const sourceEvidenceRefs = readJsonStringArray(row.source_evidence_refs)
    const consumptionContext = readJsonRecord(row.consumption_context)
    const scopeLevel = normalizeId(row.publication_scope_level)
    const safePublicationState = (
      (normalizeId(row.publication_stage) === 'canary'
        && ['pending', 'collecting', 'passed'].includes(normalizeId(row.monitoring_status)))
      || (normalizeId(row.publication_stage) === 'stable'
        && normalizeId(row.monitoring_status) === 'passed')
    )
    const scopeMatches = scopeLevel === 'project'
      ? normalizeId(row.publication_company_id) === normalizeId(row.company_id)
        && normalizeId(row.publication_project_id) === normalizeId(row.project_id)
        && !normalizeId(row.publication_industry_key)
      : scopeLevel === 'company'
        ? normalizeId(row.publication_company_id) === normalizeId(row.company_id)
          && !normalizeId(row.publication_project_id)
          && !normalizeId(row.publication_industry_key)
        : scopeLevel === 'industry'
          ? !normalizeId(row.publication_company_id)
            && !normalizeId(row.publication_project_id)
            && normalizeId(row.publication_industry_key) === normalizeId(String(consumptionContext.industryKey ?? ''))
          : scopeLevel === 'global'
            ? !normalizeId(row.publication_company_id)
              && !normalizeId(row.publication_project_id)
              && !normalizeId(row.publication_industry_key)
            : false
    return Boolean(
      task
      && normalizeId(row.asset_key) === WBS_REFERENCE_DAYS_ASSET_KEY
      && normalizeId(row.artifact_key) === params.templateId
      && normalizeId(row.template_id) === params.templateId
      && publicationKey
      && normalizeId(row.consumption_key)
      && sourceEvidenceRefs.includes(`duration_learning_runtime_publications:${publicationKey}`)
      && normalizeId(String(consumptionContext.authoritySource ?? '')) === 'runtime_resolver_publication_set'
      && safePublicationState
      && scopeMatches
      && generationBatchId
      && generationBatchId === taskGenerationBatchId
      && taskTemplateId === params.templateId,
    )
  })
  const publicationKeys = Array.from(new Set(eligibleRows
    .map((row) => normalizeId(row.publication_key))
    .filter((value): value is string => Boolean(value))))
    .sort()
  if (eligibleRows.length === 0) {
    return [emptyWbsReferenceRuntimeLineage('unlinked_no_trusted_consumption')]
  }

  const rowsByIdentity = new Map<string, {
    publicationKey: string
    artifactKey: string
    generationBatchId: string
    rows: TrustedWbsRuntimeConsumptionRow[]
  }>()
  const identitiesByTaskId = new Map<string, Set<string>>()
  for (const row of eligibleRows) {
    const publicationKey = normalizeId(row.publication_key)
    const artifactKey = normalizeId(row.artifact_key)
    const generationBatchId = normalizeId(row.generation_batch_id)
    const taskId = normalizeId(row.task_id)
    if (!publicationKey || !artifactKey || !generationBatchId || !taskId) continue
    const identityKey = `${publicationKey}\u0000${artifactKey}\u0000${generationBatchId}`
    const identity = rowsByIdentity.get(identityKey) ?? {
      publicationKey,
      artifactKey,
      generationBatchId,
      rows: [],
    }
    identity.rows.push(row)
    rowsByIdentity.set(identityKey, identity)
    const taskIdentities = identitiesByTaskId.get(taskId) ?? new Set<string>()
    taskIdentities.add(identityKey)
    identitiesByTaskId.set(taskId, taskIdentities)
  }
  if ([...identitiesByTaskId.values()].some((identities) => identities.size > 1)) {
    return [emptyWbsReferenceRuntimeLineage('ambiguous_trusted_consumption', publicationKeys)]
  }

  const lineages = [...rowsByIdentity.values()].map((identity): WbsReferenceRuntimeLineage => {
    const inputTaskIds = Array.from(new Set(identity.rows
      .map((row) => normalizeId(row.task_id))
      .filter((value): value is string => Boolean(value))))
      .sort()
    const consumptionKeys = Array.from(new Set(identity.rows
      .map((row) => normalizeId(row.consumption_key))
      .filter((value): value is string => Boolean(value))))
      .sort()
    const consumedAt = identity.rows
      .map((row) => normalizeId(row.consumed_at))
      .filter((value): value is string => Boolean(value))
      .sort()
    return {
      status: 'linked',
      publicationKeys: [identity.publicationKey],
      publicationKey: identity.publicationKey,
      artifactKey: identity.artifactKey,
      generationBatchId: identity.generationBatchId,
      inputTaskIds,
      consumptionKeys,
      consumedAtStart: consumedAt[0] ?? null,
      consumedAtEnd: consumedAt[consumedAt.length - 1] ?? null,
    }
  }).filter((lineage) => lineage.inputTaskIds.length > 0 && lineage.consumptionKeys.length > 0)
    .sort((left, right) => [left.publicationKey, left.artifactKey, left.generationBatchId]
      .join(':')
      .localeCompare([right.publicationKey, right.artifactKey, right.generationBatchId].join(':')))

  if (lineages.length === 0) {
    return [emptyWbsReferenceRuntimeLineage('unlinked_incomplete_task_coverage', publicationKeys)]
  }
  return lineages
}

async function loadWbsReferenceRuntimeLineages(params: {
  companyId: string | null
  projectId: string | null
  templateId: string
  tasks: readonly TaskRow[]
  queryExec?: AlgorithmAssetGovernanceQueryExec
}) {
  const taskIds = Array.from(new Set(params.tasks
    .map((task) => normalizeId(task.id))
    .filter((value): value is string => Boolean(value))))
  if (!params.companyId || !params.projectId || taskIds.length === 0) {
    return [emptyWbsReferenceRuntimeLineage()]
  }
  const queryParams = [
    params.companyId,
    params.projectId,
    taskIds,
    WBS_REFERENCE_DAYS_ASSET_KEY,
    params.templateId,
  ]
  let rows: TrustedWbsRuntimeConsumptionRow[]
  if (params.queryExec) {
    rows = await params.queryExec<TrustedWbsRuntimeConsumptionRow>(
      TRUSTED_WBS_REFERENCE_RUNTIME_CONSUMPTIONS_SQL,
      queryParams,
    )
  } else {
    // database-query-dynamic-approved: this module owns the fixed trusted-consumption SELECT; company/project/task/artifact values remain parameter-bound.
    rows = (await rawQuery(
      TRUSTED_WBS_REFERENCE_RUNTIME_CONSUMPTIONS_SQL,
      queryParams as any[],
    )).rows as TrustedWbsRuntimeConsumptionRow[]
  }
  return resolveWbsReferenceRuntimeLineages({
    tasks: params.tasks,
    rows,
    templateId: params.templateId,
  })
}

async function persistWbsTemplateFeedbackCandidateEvent(
  report: WbsTemplateFeedbackReport,
  options: CollectWbsTemplateFeedbackOptions,
) {
  const actionableNodes = getActionableReferenceDayFeedbackNodes(report)
  if (actionableNodes.length === 0) return 0
  const projectId = getScopedProjectId(options.projectIds)
  if (!projectId) return 0

  await createAndPersistAlgorithmAssetCandidateEvent({
    assetKey: `wbs.template_feedback.${report.template_id}`,
    sourceSystem: 'wbsTemplateFeedback',
    assetType: 'calibration',
    companyId: options.companyId,
    projectId,
    candidatePayload: {
      templateId: report.template_id,
      templateName: report.template_name,
      completedProjectCount: report.completed_project_count,
      sampleTaskCount: report.sample_task_count,
      matchedAdHocTaskCount: report.matched_ad_hoc_task_count,
      nodeCount: report.node_count,
      automationLifecycle: 'duration_learning_runtime_candidate',
      humanFallbackPolicy: 'conflict_or_exception_only',
      nodes: actionableNodes.map(mapFeedbackNodeForCandidate),
      projectIds: [projectId],
    },
    learningTarget: 'base_duration',
    learningMaturity: 'governed_candidate',
    publishAnchor: 'candidate_only',
    automationMaturity: 'auto_shadow',
    requestedRuntimeEffect: 'candidate_only',
    generatedBy: 'service',
    queryExec: options.governanceQueryExec,
  })
  return 1
}

async function collectWbsTemplateFeedbackWithContext(
  templateId: string,
  options: CollectWbsTemplateFeedbackOptions = {},
) {
  const normalizedProjectScope = normalizeProjectScope(options.projectIds) ?? []
  const companyId = normalizeId(options.companyId)
  const template = await readVisibleWbsTemplate(templateId, companyId, normalizedProjectScope)
  if (!template) {
    throw new Error('WBS 模板不存在')
  }

  const projectScope = buildProjectScopeClause(normalizedProjectScope, 'id')
  const taskProjectScope = buildProjectScopeClause(normalizedProjectScope, 'project_id')

  const [projects, tasks] = await Promise.all([
    readOptionalFeedbackRows<CompletedProjectRow>(
      'projects',
      `SELECT id, name, status FROM projects${projectScope.clause} ORDER BY created_at ASC`,
      projectScope.params,
    ),
    readOptionalFeedbackRows<TaskRow>(
      'tasks',
      `SELECT * FROM tasks${taskProjectScope.clause} ORDER BY created_at ASC`,
      taskProjectScope.params,
    ),
  ])

  const completedProjectIds = new Set(
    projects
      .filter((project) => isCompletedProjectStatus(project.status))
      .map((project) => project.id),
  )
  const constructionCalendarResolver = options.constructionCalendarResolver ?? resolveConstructionCalendarContext
  const constructionCalendarsByProjectId = Object.fromEntries(await Promise.all(
    [...completedProjectIds].map(async (projectId) => [
      projectId,
      await constructionCalendarResolver({ projectId }),
    ] as const),
  ))
  const effectiveOptions: CollectWbsTemplateFeedbackOptions = {
    ...options,
    constructionCalendarsByProjectId,
  }

  const templateNodes = buildTemplateTree(parseTemplateNodes(template.wbs_nodes ?? template.template_data ?? []))
  const templateTitleLookup = buildTemplateTitleLookup(templateNodes)
  const templateSourceCandidates = buildTemplateSourceCandidates(templateNodes)
  const knownTemplateSourceIds = new Set(
    flattenTree(templateNodes)
      .map((node) => node.source_id)
      .filter((value): value is string => Boolean(value)),
  )
  const completedTasks = tasks.filter((task) => (
    completedProjectIds.has(task.project_id)
    && getDurationDays(task, constructionCalendarsByProjectId) !== null
  ))
  const baselineItemIds = Array.from(new Set(completedTasks.map((task) => normalizeText(task.baseline_item_id)).filter(Boolean)))
  const baselineItemScope = buildBaselineItemScopeClause(baselineItemIds, normalizedProjectScope)
  const baselineItems = await readOptionalFeedbackRows<BaselineItemRow>(
    'task_baseline_items',
    `SELECT id, project_id, source_task_id FROM task_baseline_items${baselineItemScope.clause} ORDER BY created_at ASC`,
    baselineItemScope.params,
  )

  const sampleMaps = collectSamplesByStructuredSource({
    tasks: completedTasks,
    baselineItems,
    knownTemplateSourceIds,
    templateTitleLookup,
    templateSourceCandidates,
    constructionCalendarsByProjectId,
  })
  const runtimePublicationLineages = await loadWbsReferenceRuntimeLineages({
    companyId,
    projectId: getScopedProjectId(normalizedProjectScope),
    templateId: String(template.id),
    tasks: sampleMaps.matchedTasks,
    queryExec: options.governanceQueryExec,
  })
  const nodeCount = flattenTree(templateNodes).length
  const buildReport = (
    maps: ReturnType<typeof collectSamplesByStructuredSource>,
  ): WbsTemplateFeedbackReport => ({
    template_id: String(template.id),
    template_name: String(template.template_name ?? template.name ?? 'WBS 妯℃澘'),
    completed_project_count: maps.matchedProjectIds.size,
    sample_task_count: maps.matchedTaskCount,
    matched_ad_hoc_task_count: maps.matchedAdHocTaskCount,
    node_count: nodeCount,
    nodes: aggregateTreeFeedback(templateNodes, maps),
  })
  const writeOptionsForTasks = (
    lineageTasks: readonly TaskRow[],
    lineage: WbsReferenceRuntimeLineage,
  ): CollectWbsTemplateFeedbackOptions => {
    const observationDates = lineageTasks
      .map((task) => String(task.actual_end_date ?? '').trim())
      .filter(Boolean)
      .sort()
    const observationStartedAt = observationDates[0] ?? null
    const observationEndedAt = observationDates[observationDates.length - 1] ?? null
    return {
      ...effectiveOptions,
      runtimePublicationLineage: lineage,
      sourceTaskIds: lineageTasks.map((task) => task.id),
      observationStartedAt,
      observationEndedAt,
      observationWindowDays: observationStartedAt && observationEndedAt
        ? inclusiveDurationDays(observationStartedAt, observationEndedAt) ?? 0
        : 0,
    }
  }

  const report = buildReport(sampleMaps)
  const linkedLineages = runtimePublicationLineages.filter((lineage) => lineage.status === 'linked')
  const outcomeWrites = linkedLineages.length > 0
    ? linkedLineages.map((lineage) => {
      const lineageTaskIds = new Set(lineage.inputTaskIds)
      const lineageTasks = sampleMaps.matchedTasks.filter((task) => lineageTaskIds.has(normalizeId(task.id) ?? ''))
      const lineageSampleMaps = collectSamplesByStructuredSource({
        tasks: lineageTasks,
        baselineItems,
        knownTemplateSourceIds,
        templateTitleLookup,
        templateSourceCandidates,
        constructionCalendarsByProjectId,
      })
      return {
        report: buildReport(lineageSampleMaps),
        options: writeOptionsForTasks(lineageSampleMaps.matchedTasks, lineage),
      }
    })
    : [{
        report,
        options: writeOptionsForTasks(
          sampleMaps.matchedTasks,
          runtimePublicationLineages[0] ?? emptyWbsReferenceRuntimeLineage(),
        ),
      }]

  return { report, effectiveOptions, outcomeWrites }
}

export async function collectWbsTemplateFeedback(
  templateId: string,
  options: CollectWbsTemplateFeedbackOptions = {},
): Promise<WbsTemplateFeedbackReport> {
  const collected = await collectWbsTemplateFeedbackWithContext(templateId, options)
  return collected.report
}

async function persistWbsTemplateFeedbackGovernanceWrites(
  report: WbsTemplateFeedbackReport,
  options: CollectWbsTemplateFeedbackOptions,
  outcomeWrites: ReadonlyArray<{
    report: WbsTemplateFeedbackReport
    options: CollectWbsTemplateFeedbackOptions
  }> = [{ report, options }],
) {
  const candidateEventCount = await persistWbsTemplateFeedbackCandidateEvent(report, options)
  let recordedOutcomeCount = 0
  for (const outcomeWrite of outcomeWrites) {
    recordedOutcomeCount += await recordWbsReferenceDaysPlanNetworkOutcome(
      outcomeWrite.report,
      outcomeWrite.options,
    )
  }
  return { candidateEventCount, recordedOutcomeCount }
}

export async function produceWbsTemplateFeedback(
  templateId: string,
  options: CollectWbsTemplateFeedbackOptions = {},
) {
  const companyId = normalizeId(options.companyId)
  const projectIds = normalizeProjectScope(options.projectIds) ?? []
  if (!companyId) {
    throw Object.assign(new Error('WBS template feedback producer requires company scope'), {
      code: 'WBS_TEMPLATE_FEEDBACK_COMPANY_SCOPE_REQUIRED',
    })
  }
  if (projectIds.length !== 1) {
    throw Object.assign(new Error('WBS template feedback producer requires exactly one project scope'), {
      code: 'WBS_TEMPLATE_FEEDBACK_PROJECT_SCOPE_REQUIRED',
    })
  }

  const effectiveOptions: CollectWbsTemplateFeedbackOptions = {
    ...options,
    companyId,
    projectIds,
  }
  const collected = await collectWbsTemplateFeedbackWithContext(templateId, effectiveOptions)
  const report = collected.report
  const writeOptions = collected.effectiveOptions
  const writeResult = options.governanceQueryExec
    ? await persistWbsTemplateFeedbackGovernanceWrites(report, writeOptions, collected.outcomeWrites)
    : await withDatabaseTransaction(async () => persistWbsTemplateFeedbackGovernanceWrites(
      report,
      writeOptions,
      collected.outcomeWrites,
    ))

  return {
    report,
    ...writeResult,
  }
}

const WBS_TEMPLATE_FEEDBACK_TARGET_PAGE_SQL = `SELECT DISTINCT
    p.company_id::text AS company_id,
    p.id::text AS project_id,
    COALESCE(t.source_template_id, t.template_id)::text AS template_id
  FROM public.tasks t
  JOIN public.projects p
    ON p.id = t.project_id
  JOIN public.wbs_templates wt
    ON wt.id = COALESCE(t.source_template_id, t.template_id)
  WHERE p.deleted_at IS NULL
    AND t.deleted_at IS NULL
    AND wt.deleted_at IS NULL
    AND p.company_id IS NOT NULL
    AND ($1::uuid IS NULL OR p.company_id = $1::uuid)
    AND lower(trim(COALESCE(p.status, ''))) = ANY($2::text[])
    AND t.actual_end_date IS NOT NULL
    AND COALESCE(t.source_template_id, t.template_id) IS NOT NULL
    AND (wt.company_id IS NULL OR wt.company_id = p.company_id)
    AND (wt.project_id IS NULL OR wt.project_id = p.id)
    AND (
      $3::text IS NULL
      OR (p.company_id::text, p.id::text, COALESCE(t.source_template_id, t.template_id)::text)
        > ($3::text, $4::text, $5::text)
    )
  ORDER BY company_id, project_id, template_id
  LIMIT $6`

async function defaultWbsTemplateFeedbackTargetQueryExec(_sql: string, params: unknown[] = []) {
  // database-query-dynamic-approved: this producer executes only the local fixed target-page SELECT above; every cursor and scope value remains parameter-bound.
  const result = await rawQuery(WBS_TEMPLATE_FEEDBACK_TARGET_PAGE_SQL, params as any[])
  return result.rows as Record<string, unknown>[]
}

function feedbackProducerTargetFromRow(row: Record<string, unknown>): WbsTemplateFeedbackProducerTarget {
  const companyId = normalizeId(String(row.company_id ?? ''))
  const projectId = normalizeId(String(row.project_id ?? ''))
  const templateId = normalizeId(String(row.template_id ?? ''))
  if (!companyId || !projectId || !templateId) {
    throw Object.assign(new Error('WBS template feedback producer target is missing a required scope'), {
      code: 'WBS_TEMPLATE_FEEDBACK_TARGET_SCOPE_INVALID',
    })
  }
  return { companyId, projectId, templateId }
}

export async function loadWbsTemplateFeedbackProducerTargets(
  options: Pick<WbsTemplateFeedbackGovernanceSweepOptions, 'companyId' | 'pageSize' | 'targetQueryExec'> = {},
) {
  const pageSize = Math.max(1, Math.min(1000, Math.floor(options.pageSize ?? 200)))
  const queryExec = options.targetQueryExec ?? defaultWbsTemplateFeedbackTargetQueryExec
  const targets: WbsTemplateFeedbackProducerTarget[] = []
  const seen = new Set<string>()
  let cursor: WbsTemplateFeedbackProducerTarget | null = null

  while (true) {
    const rows = await queryExec(WBS_TEMPLATE_FEEDBACK_TARGET_PAGE_SQL, [
      normalizeId(options.companyId),
      [...COMPLETED_PROJECT_STATUSES],
      cursor?.companyId ?? null,
      cursor?.projectId ?? null,
      cursor?.templateId ?? null,
      pageSize,
    ])
    if (rows.length === 0) break

    const pageTargets = rows.map(feedbackProducerTargetFromRow)
    for (const target of pageTargets) {
      const key = `${target.companyId}:${target.projectId}:${target.templateId}`
      if (!seen.has(key)) {
        seen.add(key)
        targets.push(target)
      }
    }

    const nextCursor = pageTargets[pageTargets.length - 1]!
    if (cursor
      && nextCursor.companyId === cursor.companyId
      && nextCursor.projectId === cursor.projectId
      && nextCursor.templateId === cursor.templateId) {
      throw Object.assign(new Error('WBS template feedback target cursor did not advance'), {
        code: 'WBS_TEMPLATE_FEEDBACK_TARGET_CURSOR_STALLED',
      })
    }
    cursor = nextCursor
    if (rows.length < pageSize) break
  }

  return targets
}

export async function runWbsTemplateFeedbackGovernanceSweep(
  options: WbsTemplateFeedbackGovernanceSweepOptions = {},
) {
  const targets = await loadWbsTemplateFeedbackProducerTargets(options)
  const result = {
    targetCount: targets.length,
    completedTargetCount: 0,
    failedTargetCount: 0,
    candidateEventCount: 0,
    recordedOutcomeCount: 0,
    failures: [] as Array<{ target: WbsTemplateFeedbackProducerTarget; error: string }>,
  }

  for (const target of targets) {
    try {
      const produced = await produceWbsTemplateFeedback(target.templateId, {
        companyId: target.companyId,
        projectIds: [target.projectId],
        governanceQueryExec: options.governanceQueryExec,
      })
      result.completedTargetCount += 1
      result.candidateEventCount += produced.candidateEventCount
      result.recordedOutcomeCount += produced.recordedOutcomeCount
    } catch (error) {
      result.failedTargetCount += 1
      result.failures.push({
        target,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (result.failedTargetCount > 0) {
    throw Object.assign(new Error('WBS template feedback governance sweep partially failed'), {
      code: 'WBS_TEMPLATE_FEEDBACK_SWEEP_PARTIAL_FAILURE',
      result,
    })
  }
  return result
}
