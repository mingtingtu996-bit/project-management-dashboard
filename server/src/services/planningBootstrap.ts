import { v4 as uuidv4 } from 'uuid'
import type { Milestone, Task, TaskBaselineItem, WBSTemplate } from '../types/db.js'

export const PLANNING_BOOTSTRAP_PATHS = [
  'template_to_baseline',
  'completed_project_to_template',
  'ongoing_project_to_baseline',
] as const

export type PlanningBootstrapPath = (typeof PLANNING_BOOTSTRAP_PATHS)[number]

export interface PlanningBootstrapProjectLike {
  id?: string | null
  name?: string | null
  status?: string | null
  current_phase?: string | null
  default_wbs_generated?: boolean | null
  project_type?: string | null
  building_type?: string | null
  structure_type?: string | null
  planned_start_date?: string | null
  start_date?: string | null
  actual_start_date?: string | null
}

export interface PlanningBootstrapNode {
  title: string
  description?: string | null
  reference_days?: number | null
  is_milestone?: boolean
  source_id?: string | null
  children?: PlanningBootstrapNode[]
}

export interface PlanningBootstrapChecklistItem {
  key: string
  title: string
  detail: string
}

export interface PlanningBootstrapLearnMoreSection {
  heading: string
  body: string
}

export interface PlanningBootstrapLearnMore {
  title: string
  sections: PlanningBootstrapLearnMoreSection[]
}

export interface PlanningBootstrapGuide {
  project_id: string
  project_name: string
  status_label: string
  mode: PlanningBootstrapPath
  title: string
  subtitle: string
  quickActions: Array<{ path: PlanningBootstrapPath; label: string; description: string }>
  checklist: PlanningBootstrapChecklistItem[]
  learnMore: PlanningBootstrapLearnMore
}

export interface PlanningBootstrapContext {
  guide: PlanningBootstrapGuide
  project: PlanningBootstrapProjectLike
  taskCount: number
  milestoneCount: number
}

function normalizeProjectStatus(status?: string | null): string {
  switch (String(status ?? '').trim()) {
    case '进行中':
    case 'in_progress':
    case 'active':
      return '进行中'
    case '已完成':
    case 'completed':
    case 'done':
      return '已完成'
    case '已暂停':
    case 'paused':
    case 'archived':
      return '已暂停'
    case '未开始':
    case 'planning':
    case 'pending':
    case 'not_started':
    default:
      return '未开始'
  }
}

function normalizeProjectName(project: PlanningBootstrapProjectLike): string {
  return String(project.name ?? '').trim() || '未命名项目'
}

function projectPhaseLabel(project: PlanningBootstrapProjectLike): string {
  const currentPhase = String(project.current_phase ?? '').trim()
  if (currentPhase === 'construction') return '施工阶段'
  if (currentPhase === 'completion') return '收尾阶段'
  if (currentPhase === 'delivery') return '交付阶段'
  if (currentPhase === 'pre-construction') return '前期阶段'
  return '计划编制'
}

export function resolvePlanningBootstrapMode(project: PlanningBootstrapProjectLike): PlanningBootstrapPath {
  const status = normalizeProjectStatus(project.status)
  if (status === '已完成') return 'completed_project_to_template'
  if (status === '进行中') return 'ongoing_project_to_baseline'
  return 'template_to_baseline'
}

function buildQuickActions(): PlanningBootstrapGuide['quickActions'] {
  return [
    {
      path: 'template_to_baseline',
      label: 'WBS 模板 -> 项目基线',
      description: '把可复用的结构整理成可直接确认的项目基线。',
    },
    {
      path: 'completed_project_to_template',
      label: '已完成项目 -> WBS 模板',
      description: '把已跑通的项目沉淀成可复用的模板资产。',
    },
    {
      path: 'ongoing_project_to_baseline',
      label: '在建项目 -> 初始化基线',
      description: '自动补建初始基线，并把待确认项一次性列出来。',
    },
  ]
}

function buildLearnMore(): PlanningBootstrapLearnMore {
  return {
    title: '四层时间线怎么理解',
    sections: [
      {
        heading: '项目基线',
        body: '先定下来的主计划骨架，用来作为后续确认、变更和对比的基准。',
      },
      {
        heading: '月度计划',
        body: '每个月要真正推进的具体安排，通常比基线更细。',
      },
      {
        heading: '当前项目计划时间',
        body: '系统整理后的最新计划时间，反映当前认可的排期。',
      },
      {
        heading: '项目实际执行时间',
        body: '现场真实发生的时间，后续复盘和偏差分析都会看这层。',
      },
    ],
  }
}

function buildChecklist(mode: PlanningBootstrapPath): PlanningBootstrapChecklistItem[] {
  if (mode === 'completed_project_to_template') {
    return [
      {
        key: 'collect',
        title: '整理成熟结构',
        detail: '把已完成项目里的有效任务骨架先收拢起来。',
      },
      {
        key: 'trim',
        title: '删掉无效细节',
        detail: '只保留能复用的主干，避免把临时事项一起沉淀进去。',
      },
      {
        key: 'publish',
        title: '发布为模板',
        detail: '把整理好的结构保存成新的模板，后续可直接复用。',
      },
    ]
  }

  if (mode === 'ongoing_project_to_baseline') {
    return [
      {
        key: 'scan',
        title: '先看现状',
        detail: '先识别当前项目已经推进到哪一步。',
      },
      {
        key: 'bootstrap',
        title: '自动补基线',
        detail: '系统自动补建初始基线，不需要手工一条条录。',
      },
      {
        key: 'review',
        title: '确认映射',
        detail: '把待确认项补齐后再正式启用。',
      },
    ]
  }

  return [
    {
      key: 'pick',
      title: '选择模板',
      detail: '先选一套可复用结构作为起点。',
    },
    {
      key: 'generate',
      title: '生成项目基线',
      detail: '把模板转成项目可直接使用的基线骨架。',
    },
    {
      key: 'confirm',
      title: '确认后启用',
      detail: '确认无误后再进入后续计划编制。',
    },
  ]
}

export function buildPlanningBootstrapGuide(params: {
  project: PlanningBootstrapProjectLike
  taskCount: number
  milestoneCount: number
}): PlanningBootstrapGuide {
  const mode = resolvePlanningBootstrapMode(params.project)
  const projectName = normalizeProjectName(params.project)
  const statusLabel = normalizeProjectStatus(params.project.status)
  const projectPhase = projectPhaseLabel(params.project)

  return {
    project_id: String(params.project.id ?? ''),
    project_name: projectName,
    status_label: statusLabel,
    mode,
    title: '计划编制启用与 WBS 模板',
    subtitle: `把 WBS 模板并入计划编制，统一处理 ${projectPhase} 的启用、冷启动和沉淀。`,
    quickActions: buildQuickActions(),
    checklist: buildChecklist(mode),
    learnMore: buildLearnMore(),
  }
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const leftOrder = Number(left.sort_order ?? Number.POSITIVE_INFINITY)
    const rightOrder = Number(right.sort_order ?? Number.POSITIVE_INFINITY)
    if (leftOrder !== rightOrder) return leftOrder - rightOrder

    const leftTitle = String(left.title ?? '')
    const rightTitle = String(right.title ?? '')
    return leftTitle.localeCompare(rightTitle)
  })
}

function sortMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((left, right) => {
    const leftTitle = String(left.title ?? left.name ?? '')
    const rightTitle = String(right.title ?? right.name ?? '')
    return leftTitle.localeCompare(rightTitle)
  })
}

export function buildTemplateNodesFromTasks(tasks: Array<Partial<Task> & Record<string, any>>): PlanningBootstrapNode[] {
  const normalized = sortTasks(tasks as Task[])
  const byParent = new Map<string | null, Array<Partial<Task> & Record<string, any>>>()

  for (const task of normalized) {
    const parentId = String(task.parent_id ?? task.parent_task_id ?? '') || null
    const bucket = byParent.get(parentId) ?? []
    bucket.push(task)
    byParent.set(parentId, bucket)
  }

  const buildLevel = (parentId: string | null): PlanningBootstrapNode[] => {
    const items = byParent.get(parentId) ?? []
    return items.map((task) => {
      const id = String(task.id ?? '')
      return {
        title: String(task.title ?? '未命名任务'),
        description: task.description ?? null,
        reference_days: task.reference_duration ?? task.ai_duration ?? null,
        is_milestone: Boolean(task.is_milestone),
        source_id: id || null,
        children: buildLevel(id || null),
      }
    })
  }

  const roots = buildLevel(null)
  if (roots.length > 0) return roots

  return normalized.map((task) => ({
    title: String(task.title ?? '未命名任务'),
    description: task.description ?? null,
    reference_days: task.reference_duration ?? task.ai_duration ?? null,
    is_milestone: Boolean(task.is_milestone),
    source_id: String(task.id ?? '') || null,
  }))
}

export function buildTemplateNodesFromMilestones(
  milestones: Array<Partial<Milestone> & Record<string, any>>
): PlanningBootstrapNode[] {
  return sortMilestones(milestones as Milestone[]).map((milestone) => ({
    title: String(milestone.title ?? milestone.name ?? '未命名里程碑'),
    description: milestone.description ?? null,
    reference_days: null,
    is_milestone: true,
    source_id: String(milestone.id ?? '') || null,
  }))
}

export function buildDefaultBootstrapNodes(project: PlanningBootstrapProjectLike): PlanningBootstrapNode[] {
  const projectName = normalizeProjectName(project)
  return [
    {
      title: `${projectName} - 前期准备`,
      description: '先把准备动作摆平，方便后续统一启用。',
      reference_days: 14,
      children: [
        { title: '资料整理', description: '把现有资料先收齐。', reference_days: 7 },
        { title: '规则确认', description: '把确认口径先说清楚。', reference_days: 7 },
      ],
    },
    {
      title: '主体推进',
      description: '保留最核心的推进骨架。',
      reference_days: 30,
      children: [
        { title: '关键任务', description: '按当前项目现状自动补入。', reference_days: 15 },
        { title: '配套任务', description: '把辅助动作放在一起。', reference_days: 15 },
      ],
    },
    {
      title: '收尾交付',
      description: '把验收和交付动作统一收口。',
      reference_days: 14,
      children: [
        { title: '交付确认', description: '确认成果是否完整。', reference_days: 7 },
        { title: '问题收口', description: '把遗留事项收掉。', reference_days: 7 },
      ],
    },
  ]
}

export function buildProjectBootstrapNodes(params: {
  project: PlanningBootstrapProjectLike
  tasks: Array<Partial<Task> & Record<string, any>>
  milestones: Array<Partial<Milestone> & Record<string, any>>
}): PlanningBootstrapNode[] {
  if (params.tasks.length > 0) {
    return buildTemplateNodesFromTasks(params.tasks)
  }

  if (params.milestones.length > 0) {
    return buildTemplateNodesFromMilestones(params.milestones)
  }

  return buildDefaultBootstrapNodes(params.project)
}

function normalizeAnchorDate(value?: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function toDurationDays(node: PlanningBootstrapNode): number {
  const explicit = Number(node.reference_days)
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.round(explicit))
  }
  return 0
}

function normalizeSourceMapping(node: PlanningBootstrapNode): {
  sourceTaskId: string | null
  sourceMilestoneId: string | null
  mappingStatus: 'mapped' | 'pending'
} {
  const rawSourceId = String(node.source_id ?? '').trim()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawSourceId)

  if (!isUuid) {
    return {
      sourceTaskId: null,
      sourceMilestoneId: null,
      mappingStatus: 'pending',
    }
  }

  return node.is_milestone
    ? {
        sourceTaskId: null,
        sourceMilestoneId: rawSourceId,
        mappingStatus: 'mapped',
      }
    : {
        sourceTaskId: rawSourceId,
        sourceMilestoneId: null,
        mappingStatus: 'mapped',
      }
}

export function buildBaselineItemsFromTemplateNodes(
  nodes: PlanningBootstrapNode[],
  params: {
    projectId: string
    baselineVersionId: string
    anchorDate?: string | null
  }
): TaskBaselineItem[] {
  const items: TaskBaselineItem[] = []
  const anchorDate = normalizeAnchorDate(params.anchorDate) ?? normalizeAnchorDate(new Date().toISOString())

  const visit = (children: PlanningBootstrapNode[] | undefined, parentItemId: string | null, currentStart: string | null): string | null => {
    if (!Array.isArray(children) || children.length === 0) return currentStart

    let cursor = currentStart ?? anchorDate

    for (const node of children) {
      const itemId = uuidv4()
      const sourceMapping = normalizeSourceMapping(node)
      const item: TaskBaselineItem = {
        id: itemId,
        project_id: params.projectId,
        baseline_version_id: params.baselineVersionId,
        parent_item_id: parentItemId,
        source_task_id: sourceMapping.sourceTaskId,
        source_milestone_id: sourceMapping.sourceMilestoneId,
        title: node.title,
        planned_start_date: null,
        planned_end_date: null,
        target_progress: null,
        sort_order: items.length,
        is_milestone: Boolean(node.is_milestone),
        is_critical: false,
        mapping_status: sourceMapping.mappingStatus,
        notes: node.description ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      items.push(item)

      const childCursor = visit(node.children, itemId, cursor)
      const childCount = Array.isArray(node.children) ? node.children.length : 0
      const ownDuration = toDurationDays(node)
      const descendantDuration = childCursor && cursor ? Math.max(1, Math.ceil((new Date(`${childCursor}T00:00:00.000Z`).getTime() - new Date(`${cursor}T00:00:00.000Z`).getTime()) / 86400000)) : 0
      const effectiveDuration = Math.max(ownDuration, descendantDuration || 0, childCount > 0 ? 1 : 0)

      if (cursor) {
        item.planned_start_date = cursor
        item.planned_end_date = addDays(cursor, Math.max(1, effectiveDuration) - 1)
        cursor = addDays(item.planned_end_date, 1)
      }
    }

    return cursor
  }

  visit(nodes, null, anchorDate)
  return items
}

export function buildTemplateSeedFromProject(params: {
  project: PlanningBootstrapProjectLike
  nodes: PlanningBootstrapNode[]
}): Pick<WBSTemplate, 'name' | 'description' | 'template_data' | 'is_public'> & {
  project_type: string | null
  building_type: string | null
  is_default: boolean
  is_construction_default: boolean
  category: string | null
  node_count: number
  reference_days: number | null
  tags: string[]
} {
  const templateName = `${normalizeProjectName(params.project)} 沉淀模板`
  const projectType = String(params.project.project_type ?? params.project.building_type ?? '').trim() || null
  const nodeCount = countNodes(params.nodes)

  return {
    name: templateName,
    description: '由已完成项目沉淀出来的 WBS 模板，可直接复用到新项目。',
    template_data: params.nodes,
    is_public: true,
    project_type: projectType,
    building_type: String(params.project.building_type ?? '').trim() || null,
    is_default: false,
    is_construction_default: false,
    category: projectType,
    node_count: nodeCount,
    reference_days: nodeCount > 0 ? nodeCount * 5 : null,
    tags: ['计划编制', '冷启动', '复用'],
  }
}

export function buildBaselineSeedFromProject(params: {
  project: PlanningBootstrapProjectLike
  nodes: PlanningBootstrapNode[]
}) {
  const baselineTitle = `${normalizeProjectName(params.project)} 项目基线`
  const anchorDate = normalizeAnchorDate(
    params.project.planned_start_date
      ?? params.project.start_date
      ?? params.project.actual_start_date
      ?? null,
  )
  return {
    title: baselineTitle,
    description: '由在建项目当前执行现状自动补建的初始基线。',
    source_type: 'current_schedule' as const,
    source_version_label: normalizeProjectStatus(params.project.status),
    items: buildBaselineItemsFromTemplateNodes(params.nodes, {
      projectId: String(params.project.id ?? ''),
      baselineVersionId: '',
      anchorDate,
    }),
  }
}

function countNodes(nodes: PlanningBootstrapNode[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (Array.isArray(node.children) && node.children.length > 0) {
      count += countNodes(node.children)
    }
  }
  return count
}

export class PlanningBootstrapService {
  buildContext(params: {
    project: PlanningBootstrapProjectLike
    tasks: Array<Partial<Task> & Record<string, any>>
    milestones: Array<Partial<Milestone> & Record<string, any>>
  }): PlanningBootstrapContext {
    const guide = buildPlanningBootstrapGuide({
      project: params.project,
      taskCount: params.tasks.length,
      milestoneCount: params.milestones.length,
    })

    return {
      guide,
      project: params.project,
      taskCount: params.tasks.length,
      milestoneCount: params.milestones.length,
    }
  }

  buildProjectNodes(params: {
    project: PlanningBootstrapProjectLike
    tasks: Array<Partial<Task> & Record<string, any>>
    milestones: Array<Partial<Milestone> & Record<string, any>>
  }): PlanningBootstrapNode[] {
    return buildProjectBootstrapNodes(params)
  }

  buildTemplateSeed(params: {
    project: PlanningBootstrapProjectLike
    nodes: PlanningBootstrapNode[]
  }) {
    return buildTemplateSeedFromProject(params)
  }

  buildBaselineSeed(params: {
    project: PlanningBootstrapProjectLike
    nodes: PlanningBootstrapNode[]
  }) {
    return buildBaselineSeedFromProject(params)
  }
}
