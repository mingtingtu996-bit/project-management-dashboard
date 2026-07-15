import {
  buildTaskPlanDrilldownParentContext,
  resolveTaskPlanRhythmRecommendation,
} from './taskPlanDrilldownRhythmService.js'

export const TASK_PLAN_DRILLDOWN_ROW_LIMIT = 80

export type TaskPlanDrilldownLevel = 'master_control' | 'process_detail' | 'activity_step'

type DrilldownGenerationDepth = 'process' | 'activity_step'

type TaskPlanDrilldownTask = Record<string, unknown> & {
  id?: string | null
  project_id?: string | null
  title?: string | null
  wbs_node_type?: string | null
  template_node_id?: string | null
  standard_work_code?: string | null
  standard_work_name?: string | null
  planned_start_date?: string | null
  planned_end_date?: string | null
  start_date?: string | null
  end_date?: string | null
  standard_task_metadata?: Record<string, unknown> | null
}

type DrilldownCatalogNode = {
  id: string
  stableCode?: string | null
  name?: string | null
  categoryType?: string | null
  standardWorkCode?: string | null
  standardWorkName?: string | null
  children?: DrilldownCatalogNode[]
}

type DrilldownCatalog = {
  id: string
  name?: string | null
  templateGroup?: string | null
  nodes?: DrilldownCatalogNode[]
}

export type TaskPlanDrilldownRecommendation = {
  templateId: string
  templateName: string | null
  selectedNodeIds: string[]
  selectedNodeNames: string[]
  resolutionSource: 'rhythm_asset_match' | 'lineage_match' | 'standard_work_match' | 'semantic_match'
  confidence: 'high' | 'medium'
}

const DRILLDOWN_LEVELS = new Set<TaskPlanDrilldownLevel>([
  'master_control',
  'process_detail',
  'activity_step',
])

const SCOPE_OBJECT_KEYS = [
  'engineering_object_id',
  'phase_object_id',
  'section_object_id',
  'building_object_id',
  'basement_object_id',
  'floor_object_id',
  'physical_zone_object_id',
  'functional_area_object_id',
] as const

const CONSTRUCTION_MATCH_TERMS = [
  '施工准备', '临建', '临水', '临电', '塔吊', '施工电梯',
  '基坑', '支护', '降水', '桩基', '土方', '垫层', '基础',
  '地下室', '底板', '防水', '回填', '主体结构', '钢筋', '模板', '混凝土',
  '砌体', '二次结构', '门窗', '屋面', '幕墙', '外立面',
  '给排水', '电气', '暖通', '通风', '消防', '智能化', '电梯',
  '装修', '精装', '地坪', '吊顶', '涂饰', '园林', '道路', '市政',
  '调试', '验收', '备案', '移交', '交付',
] as const

function text(value: unknown) {
  return String(value ?? '').trim()
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[\s\-_/（）()、，,。.:：]+/g, '')
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function drilldownError(code: string, message: string, statusCode: number, details?: Record<string, unknown>) {
  return Object.assign(new Error(message), { code, statusCode, ...(details ? { details } : {}) })
}

function readMetadata(task: TaskPlanDrilldownTask) {
  return record(task.standard_task_metadata)
}

function readLineage(metadata: Record<string, unknown>) {
  return record(metadata.drilldownGenerationLineage ?? metadata.drilldown_generation_lineage)
}

function isMasterPlanMetadata(metadata: Record<string, unknown>) {
  return Object.keys(record(metadata.executableDefaultMasterPlan ?? metadata.executable_default_master_plan)).length > 0
    || Object.keys(record(metadata.residentialMasterPlan ?? metadata.residential_master_plan)).length > 0
    || Object.keys(record(metadata.businessTypeMasterPlan ?? metadata.business_type_master_plan)).length > 0
    || Object.keys(record(metadata.masterPlanGeneration ?? metadata.master_plan_generation)).length > 0
}

export function resolveTaskPlanDrilldownLevel(task: TaskPlanDrilldownTask): TaskPlanDrilldownLevel {
  const metadata = readMetadata(task)
  const lineageLevel = text(readLineage(metadata).level ?? readLineage(metadata).generationLevel)
  if (DRILLDOWN_LEVELS.has(lineageLevel as TaskPlanDrilldownLevel)) {
    return lineageLevel as TaskPlanDrilldownLevel
  }
  if (isMasterPlanMetadata(metadata)) return 'master_control'
  if (text(task.wbs_node_type) === 'activity_step') return 'activity_step'
  if (text(task.wbs_node_type) === 'process') return 'process_detail'
  return 'master_control'
}

export function buildTaskPlanDrilldownScope(task: TaskPlanDrilldownTask) {
  return Object.fromEntries(
    SCOPE_OBJECT_KEYS
      .map((key) => [key, text(task[key])] as const)
      .filter(([, value]) => Boolean(value)),
  )
}

export function resolveTaskPlanDrilldownStep(level: TaskPlanDrilldownLevel): {
  nextLevel: Exclude<TaskPlanDrilldownLevel, 'master_control'>
  generationDepth: DrilldownGenerationDepth
  includeActivitySteps: boolean
} | null {
  if (level === 'master_control') {
    return { nextLevel: 'process_detail', generationDepth: 'process', includeActivitySteps: false }
  }
  if (level === 'process_detail') {
    return { nextLevel: 'activity_step', generationDepth: 'activity_step', includeActivitySteps: true }
  }
  return null
}

type FlattenedNode = {
  template: DrilldownCatalog
  node: DrilldownCatalogNode
  ancestors: DrilldownCatalogNode[]
}

function flattenCatalogs(catalogs: DrilldownCatalog[]) {
  const flattened: FlattenedNode[] = []
  const visit = (template: DrilldownCatalog, node: DrilldownCatalogNode, ancestors: DrilldownCatalogNode[]) => {
    flattened.push({ template, node, ancestors })
    for (const child of node.children ?? []) visit(template, child, [...ancestors, node])
  }
  for (const template of catalogs) {
    for (const node of template.nodes ?? []) visit(template, node, [])
  }
  return flattened
}

function hasDescendantCategory(node: DrilldownCatalogNode, category: 'process' | 'activity_step'): boolean {
  return (node.children ?? []).some((child) => (
    text(child.categoryType) === category || hasDescendantCategory(child, category)
  ))
}

function constructionTerms(value: unknown) {
  const source = text(value)
  return CONSTRUCTION_MATCH_TERMS.filter((term) => source.includes(term))
}

function nodeMatchText(node: DrilldownCatalogNode, ancestors: DrilldownCatalogNode[]) {
  return [
    node.name,
    node.standardWorkName,
    node.standardWorkCode,
    node.stableCode,
    ...ancestors.flatMap((ancestor) => [ancestor.name, ancestor.standardWorkName]),
  ].map(text).filter(Boolean).join(' ')
}

function resolveConcreteStructureCycleRecommendation(
  task: TaskPlanDrilldownTask,
  candidates: FlattenedNode[],
): TaskPlanDrilldownRecommendation | null {
  const taskText = [task.title, task.standard_work_name].map(text).join(' ')
  if (!/主体结构/.test(taskText) || !/(标准层|循环)/.test(taskText)) return null

  const requiredItemWorkNames = ['模板', '钢筋', '混凝土']
  const candidateTemplates = [...new Set(candidates.map(({ template }) => template.id))]
  for (const templateId of candidateTemplates) {
    const templateCandidates = candidates.filter(({ template, node, ancestors }) => (
      template.id === templateId
      && text(node.categoryType) === 'item_work'
      && ancestors.some((ancestor) => text(ancestor.name) === '混凝土结构')
      && hasDescendantCategory(node, 'process')
    ))
    const selected = requiredItemWorkNames.map((name) => (
      templateCandidates.find(({ node }) => text(node.name) === name)
    ))
    if (selected.some((candidate) => !candidate)) continue

    const resolved = selected as FlattenedNode[]
    return {
      templateId,
      templateName: text(resolved[0]?.template.name) || null,
      selectedNodeIds: resolved.map(({ node }) => node.id),
      selectedNodeNames: resolved.map(({ node }) => text(node.name) || node.id),
      resolutionSource: 'semantic_match',
      confidence: 'high',
    }
  }
  return null
}

export function resolveTaskPlanDrilldownRecommendation(
  task: TaskPlanDrilldownTask,
  catalogs: DrilldownCatalog[],
): TaskPlanDrilldownRecommendation | null {
  const level = resolveTaskPlanDrilldownLevel(task)
  const next = resolveTaskPlanDrilldownStep(level)
  if (!next) return null

  const rhythmRecommendation = resolveTaskPlanRhythmRecommendation(task)
  if (rhythmRecommendation) return rhythmRecommendation

  const metadata = readMetadata(task)
  const lineage = readLineage(metadata)
  const lineageTemplateId = text(lineage.templateId ?? lineage.template_id)
  const lineageNodeId = text(lineage.templateNodeId ?? lineage.template_node_id ?? lineage.selectedTemplateNodeId)
  const taskTemplateNodeId = text(task.template_node_id)
  const taskStandardWorkCode = normalized(task.standard_work_code)
  const taskStandardWorkName = normalized(task.standard_work_name)
  const taskTitle = normalized(task.title)
  const taskTerms = new Set(constructionTerms([
    task.title,
    task.standard_work_name,
    task.standard_work_code,
  ].map(text).join(' ')))

  const flattenedCandidates = flattenCatalogs(catalogs)
  if (next.nextLevel === 'process_detail') {
    const concreteStructureCycle = resolveConcreteStructureCycleRecommendation(task, flattenedCandidates)
    if (concreteStructureCycle) return concreteStructureCycle
  }

  const candidates = flattenedCandidates
    .filter(({ node }) => {
      if (next.nextLevel === 'process_detail') {
        return text(node.categoryType) === 'item_work'
          && hasDescendantCategory(node, 'process')
      }
      return text(node.categoryType) === 'process' && hasDescendantCategory(node, 'activity_step')
    })
    .map((candidate) => {
      const { template, node, ancestors } = candidate
      const nodeId = text(node.id)
      const nodeStableCode = normalized(node.stableCode)
      const nodeStandardWorkCode = normalized(node.standardWorkCode)
      const nodeStandardWorkName = normalized(node.standardWorkName)
      const nodeName = normalized(node.name)
      const matchText = nodeMatchText(node, ancestors)
      const matchedTerms = constructionTerms(matchText).filter((term) => taskTerms.has(term))
      let score = matchedTerms.length * 30
      let resolutionSource: TaskPlanDrilldownRecommendation['resolutionSource'] = 'semantic_match'

      if (lineageTemplateId && lineageNodeId && template.id === lineageTemplateId && nodeId === lineageNodeId) {
        score += 1_000
        resolutionSource = 'lineage_match'
      } else if (taskTemplateNodeId && nodeId === taskTemplateNodeId) {
        score += 900
        resolutionSource = 'lineage_match'
      }
      if (taskStandardWorkCode && (taskStandardWorkCode === nodeStandardWorkCode || taskStandardWorkCode === nodeStableCode)) {
        score += 700
        resolutionSource = 'standard_work_match'
      }
      if (taskStandardWorkName && (taskStandardWorkName === nodeStandardWorkName || taskStandardWorkName === nodeName)) {
        score += 500
        resolutionSource = 'standard_work_match'
      }
      if (taskTitle && (taskTitle === nodeName || taskTitle === nodeStandardWorkName)) score += 420
      if (taskTitle && (nodeName.includes(taskTitle) || taskTitle.includes(nodeName))) score += 180
      if (taskStandardWorkName && (nodeName.includes(taskStandardWorkName) || taskStandardWorkName.includes(nodeName))) score += 160
      if (text(template.templateGroup) === 'building_main' && /主体|结构/.test(text(task.title))) score += 40

      return { ...candidate, score, resolutionSource }
    })
    .filter((candidate) => candidate.score >= 80)
    .sort((left, right) => right.score - left.score || left.node.id.localeCompare(right.node.id))

  const selected = candidates[0]
  if (!selected) return null
  return {
    templateId: selected.template.id,
    templateName: text(selected.template.name) || null,
    selectedNodeIds: [selected.node.id],
    selectedNodeNames: [text(selected.node.name) || selected.node.id],
    resolutionSource: selected.resolutionSource,
    confidence: selected.score >= 400 ? 'high' : 'medium',
  }
}

export function governTaskPlanDrilldownOperation(
  task: TaskPlanDrilldownTask,
  operation: Record<string, unknown>,
) {
  const taskId = text(task.id)
  const projectId = text(task.project_id)
  if (!taskId || !projectId) {
    throw drilldownError('TASK_PLAN_DRILLDOWN_PARENT_INVALID', '父任务缺少有效的任务或项目标识', 400)
  }
  const scope = buildTaskPlanDrilldownScope(task)
  if (Object.keys(scope).length === 0) {
    throw drilldownError(
      'TASK_PLAN_DRILLDOWN_SCOPE_REQUIRED',
      '父任务尚未归属工程范围对象，不能生成现场执行分项',
      422,
      { parentTaskId: taskId },
    )
  }
  const currentLevel = resolveTaskPlanDrilldownLevel(task)
  const next = resolveTaskPlanDrilldownStep(currentLevel)
  if (!next) {
    throw drilldownError(
      'TASK_PLAN_DRILLDOWN_MAX_DEPTH',
      '作业步骤已是最细执行层级，不能继续下钻',
      409,
      { parentTaskId: taskId, currentLevel },
    )
  }

  return {
    ...operation,
    attachUnderRowId: taskId,
    scope,
    plannedStartDate: text(task.planned_start_date ?? task.start_date) || null,
    projectPlannedEndDate: text(task.planned_end_date ?? task.end_date) || null,
    targetConstraintMode: 'compare_only',
    generationDepth: next.generationDepth,
    includeActivitySteps: next.includeActivitySteps,
    drilldownMode: 'selected_children',
    drilldownGenerationLevel: next.nextLevel,
    sourceParentTaskId: taskId,
    drilldownParentContext: buildTaskPlanDrilldownParentContext(task),
  }
}

export function summarizeProjectExecutionPlanRows(tasks: Array<unknown>) {
  const projectTaskCount = tasks.length
  return {
    projectTaskCount,
    projectRowLimitExceeded: projectTaskCount > 800,
    warningThreshold: 800,
    projectTotalBlockedByGenerationFuse: false,
  }
}
