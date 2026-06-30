import { executeSQL, executeSQLOne } from './dbService.js'
import type {
  WbsTemplateFeedbackReport,
  WbsTemplateReferenceDayFeedbackNode,
} from '../types/planning.js'
import { query as rawQuery } from '../database.js'
import { logger } from '../middleware/logger.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'
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

interface CollectWbsTemplateFeedbackOptions {
  projectIds?: string[] | null
  companyId?: string | null
  governanceQueryExec?: AlgorithmAssetGovernanceQueryExec
}

function normalizeText(value?: string | null): string {
  return String(value ?? '').trim().toLowerCase()
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

function getDurationDays(task: TaskRow): number | null {
  const fromActual = task.actual_start_date && task.actual_end_date
    ? inclusiveDurationDays(task.actual_start_date, task.actual_end_date)
    : null
  if (fromActual !== null && Number.isFinite(fromActual) && fromActual >= 1) return fromActual

  const fromPlanned = task.planned_start_date && task.planned_end_date
    ? inclusiveDurationDays(task.planned_start_date, task.planned_end_date)
    : null
  if (fromPlanned !== null && Number.isFinite(fromPlanned) && fromPlanned >= 1) return fromPlanned

  return null
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
}) {
  const bySourceId = new Map<string, number[]>()
  let matchedTaskCount = 0
  let matchedAdHocTaskCount = 0
  const matchedProjectIds = new Set<string>()
  const baselineItemById = new Map(
    params.baselineItems.map((item) => [String(item.id), normalizeText(item.source_task_id)]),
  )

  for (const task of params.tasks) {
    const duration = getDurationDays(task)
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
    if (adHocFallbackSourceId) matchedAdHocTaskCount += 1
    matchedProjectIds.add(task.project_id)
  }

  return { bySourceId, matchedTaskCount, matchedAdHocTaskCount, matchedProjectIds }
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

function buildDefaultGovernanceQueryExec(): AlgorithmAssetGovernanceQueryExec {
  return async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const result = await rawQuery(sql, params as any[])
    return result.rows as T[]
  }
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
  }
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
  if (!outcomeStatus) return

  const projectId = getScopedProjectId(options.projectIds)
  const actionableNodes = getActionableReferenceDayFeedbackNodes(report)
  const queryExec = options.governanceQueryExec ?? buildDefaultGovernanceQueryExec()
  const outcomeId = `wbs-reference-days:${report.template_id}:${projectId ?? 'multi-project'}`
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
    writes_runtime_directly: false,
    writes_fact_directly: false,
  }

  try {
    await queryExec(
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
      [
        outcomeId,
        WBS_REFERENCE_DAYS_ASSET_KEY,
        outcomeStatus,
        `wbs_template_feedback:${report.template_id}`,
        'project',
        'project_business_outcome_writer',
        normalizeId(options.companyId),
        projectId,
        null,
        metadata,
        false,
        false,
      ],
    )
  } catch (error) {
    logger.warn('[wbs-template-feedback] failed to record WBS reference-days network outcome', {
      templateId: report.template_id,
      companyId: options.companyId,
      projectId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function persistWbsTemplateFeedbackCandidateEvent(
  report: WbsTemplateFeedbackReport,
  options: CollectWbsTemplateFeedbackOptions,
) {
  try {
    await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: `wbs.template_feedback.${report.template_id}`,
      sourceSystem: 'wbsTemplateFeedback',
      assetType: 'calibration',
      companyId: options.companyId,
      candidatePayload: {
        templateId: report.template_id,
        templateName: report.template_name,
        completedProjectCount: report.completed_project_count,
        sampleTaskCount: report.sample_task_count,
        matchedAdHocTaskCount: report.matched_ad_hoc_task_count,
        nodeCount: report.node_count,
        nodes: report.nodes.map(mapFeedbackNodeForCandidate),
        projectIds: normalizeProjectScope(options.projectIds),
      },
      learningTarget: 'base_duration',
      learningMaturity: 'governed_candidate',
      publishAnchor: 'candidate_only',
      automationMaturity: 'manual_required',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'service',
      queryExec: options.governanceQueryExec,
    })
  } catch (error) {
    logger.warn('[wbs-template-feedback] failed to persist unified algorithm asset candidate event', {
      templateId: report.template_id,
      companyId: options.companyId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function collectWbsTemplateFeedback(
  templateId: string,
  options: CollectWbsTemplateFeedbackOptions = {},
): Promise<WbsTemplateFeedbackReport> {
  const template = await executeSQLOne<any>('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [templateId])
  if (!template) {
    throw new Error('WBS 模板不存在')
  }

  const projectScope = buildProjectScopeClause(normalizeProjectScope(options.projectIds), 'id')
  const taskProjectScope = buildProjectScopeClause(normalizeProjectScope(options.projectIds), 'project_id')

  const [projects, tasks] = await Promise.all([
    executeSQL<CompletedProjectRow>(
      `SELECT id, name, status FROM projects${projectScope.clause} ORDER BY created_at ASC`,
      projectScope.params,
    ),
    executeSQL<TaskRow>(
      `SELECT * FROM tasks${taskProjectScope.clause} ORDER BY created_at ASC`,
      taskProjectScope.params,
    ),
  ])

  const completedProjectIds = new Set(
    projects
      .filter((project) => isCompletedProjectStatus(project.status))
      .map((project) => project.id),
  )

  const templateNodes = buildTemplateTree(parseTemplateNodes(template.wbs_nodes ?? template.template_data ?? []))
  const templateTitleLookup = buildTemplateTitleLookup(templateNodes)
  const templateSourceCandidates = buildTemplateSourceCandidates(templateNodes)
  const knownTemplateSourceIds = new Set(
    flattenTree(templateNodes)
      .map((node) => node.source_id)
      .filter((value): value is string => Boolean(value)),
  )
  const completedTasks = tasks.filter((task) => completedProjectIds.has(task.project_id) && getDurationDays(task) !== null)
  const baselineItemIds = Array.from(new Set(completedTasks.map((task) => normalizeText(task.baseline_item_id)).filter(Boolean)))
  const normalizedProjectScope = normalizeProjectScope(options.projectIds)
  const baselineItemScope = buildBaselineItemScopeClause(baselineItemIds, normalizedProjectScope)
  const baselineItems = await executeSQL<BaselineItemRow>(
    `SELECT id, project_id, source_task_id FROM task_baseline_items${baselineItemScope.clause} ORDER BY created_at ASC`,
    baselineItemScope.params,
  )

  const sampleMaps = collectSamplesByStructuredSource({
    tasks: completedTasks,
    baselineItems,
    knownTemplateSourceIds,
    templateTitleLookup,
    templateSourceCandidates,
  })
  const flattenedRows = aggregateTreeFeedback(templateNodes, sampleMaps)
  const nodeCount = flattenTree(templateNodes).length

  const report = {
    template_id: String(template.id),
    template_name: String(template.template_name ?? template.name ?? 'WBS 妯℃澘'),
    completed_project_count: sampleMaps.matchedProjectIds.size,
    sample_task_count: sampleMaps.matchedTaskCount,
    matched_ad_hoc_task_count: sampleMaps.matchedAdHocTaskCount,
    node_count: nodeCount,
    nodes: flattenedRows,
  }

  await persistWbsTemplateFeedbackCandidateEvent(report, options)
  await recordWbsReferenceDaysPlanNetworkOutcome(report, options)

  return report
}
