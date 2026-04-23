import { executeSQL, executeSQLOne } from './dbService.js'
import type {
  WbsTemplateFeedbackReport,
  WbsTemplateReferenceDayFeedbackNode,
} from '../types/planning.js'

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
  reference_duration?: number | null
  ai_duration?: number | null
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
    ? Math.ceil((new Date(task.actual_end_date).getTime() - new Date(task.actual_start_date).getTime()) / 86400000)
    : null
  if (fromActual !== null && Number.isFinite(fromActual) && fromActual >= 0) return fromActual

  const fromPlanned = task.planned_start_date && task.planned_end_date
    ? Math.ceil((new Date(task.planned_end_date).getTime() - new Date(task.planned_start_date).getTime()) / 86400000)
    : null
  if (fromPlanned !== null && Number.isFinite(fromPlanned) && fromPlanned >= 0) return fromPlanned

  const fallback = Number(task.reference_duration ?? task.ai_duration ?? 0)
  return Number.isFinite(fallback) && fallback > 0 ? fallback : null
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

export async function collectWbsTemplateFeedback(templateId: string): Promise<WbsTemplateFeedbackReport> {
  const template = await executeSQLOne<any>('SELECT * FROM wbs_templates WHERE id = ? LIMIT 1', [templateId])
  if (!template) {
    throw new Error('WBS 模板不存在')
  }

  const [projects, tasks, baselineItems] = await Promise.all([
    executeSQL<CompletedProjectRow>('SELECT id, name, status FROM projects ORDER BY created_at ASC'),
    executeSQL<TaskRow>('SELECT * FROM tasks ORDER BY created_at ASC'),
    executeSQL<BaselineItemRow>('SELECT id, source_task_id FROM task_baseline_items ORDER BY created_at ASC'),
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
  const sampleMaps = collectSamplesByStructuredSource({
    tasks: completedTasks,
    baselineItems,
    knownTemplateSourceIds,
    templateTitleLookup,
    templateSourceCandidates,
  })
  const flattenedRows = aggregateTreeFeedback(templateNodes, sampleMaps)
  const nodeCount = flattenTree(templateNodes).length

  return {
    template_id: String(template.id),
    template_name: String(template.template_name ?? template.name ?? 'WBS 妯℃澘'),
    completed_project_count: sampleMaps.matchedProjectIds.size,
    sample_task_count: sampleMaps.matchedTaskCount,
    matched_ad_hoc_task_count: sampleMaps.matchedAdHocTaskCount,
    node_count: nodeCount,
    nodes: flattenedRows,
  }
}
