import {
  T2_DIVISION_RHYTHM_TEMPLATE_SEED,
  type T2DivisionRhythmTemplate,
} from '../seeds/t2DivisionRhythmTemplateSeed.js'
import {
  resolveT2DivisionRhythmTemplateByTemplateId,
  type AlgorithmSeedResolveContext,
  type T2DivisionRhythmTemplateResolverRecord,
} from './algorithmSeedResolver.js'
import {
  addConstructionProductionDays,
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  resolveConstructionCalendarContext,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'
import {
  buildConstructionDependencyRuleEvidence,
  type ConstructionDependencyRuleEvidence,
} from './constructionDependencyRuleEvidenceService.js'
import {
  buildDurationAssetConsumptionReceipt,
  summarizeDurationAssetConsumption,
  type DurationAssetConsumptionReceipt,
  type DurationAssetConsumptionSummary,
} from './durationAssetConsumptionReceiptService.js'
import {
  classifyAlgorithmSeedRuntimeRole,
  mapAlgorithmSeedResolverSource,
  type DurationAssetRole,
  type EffectiveDurationAssetResolution,
  type EffectiveDurationAssetSource,
} from './durationAssetRuntimeContractService.js'

export const RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID = 't2-residential-standard-floor-structure-rhythm-v1'

export type TaskPlanRhythmDrilldownLevel = 'master_control' | 'process_detail' | 'activity_step'

export type TaskPlanDrilldownParentContext = {
  parentTaskId: string | null
  parentTitle: string
  plannedStartDate: string | null
  plannedEndDate: string | null
  currentLevel: TaskPlanRhythmDrilldownLevel
  standardFloorCount: number | null
  t2RhythmTemplateId: string | null
  cycleIndex: number | null
  cycleCount: number | null
  buildingLabel: string | null
  executionPhase: string | null
  executionLane: string | null
  sourceStandardWorkCode: string | null
  sortOrder: number
}

export type TaskPlanRhythmGeneratedRow = {
  clientRowId: string
  parentClientRowId: string | null
  parentRowId: string | null
  sortOrder: number
  values: Record<string, unknown>
  predecessorClientRowIds: string[]
  predecessorDependencies: Array<{
    clientRowId: string
    dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
    lagDays: number
    source: 'internal_flow'
    intentCode: string
    relationRole: 'workflow'
    dependencyRuleEvidence: ConstructionDependencyRuleEvidence
  }>
  rowProjectionMode: 'schedule_row'
  executionPhase: string | null
  executionLane: string | null
  executionSortKey: number
  workfaceId: string | null
  planItemKind: 'work_task'
  progressMode: 'manual'
  scheduleParticipation: 'normal'
  executionNature: 'physical_work'
}

export type TaskPlanRhythmParentWindowFit = {
  decision:
    | 'p80_boundary_fit'
    | 'p80_with_boundary_buffer'
    | 'controlled_compression_to_parent_boundary'
    | 'blocked_by_minimum_rhythm_conflict'
    | 'activity_window_fit'
  calendarBasis: ConstructionCalendarContext['basis']
  availableProductionDays: number
  cycleCount: number | null
  minimumRequiredProductionDays: number | null
  targetRequiredProductionDays: number | null
  p80RequiredProductionDays: number | null
  selectedCycleProductionDays: number | null
  allocatedProductionDays: number
  bufferProductionDays: number
  compressionProductionDays: number
  conflictCodes: string[]
}

export type TaskPlanRhythmDrilldownResult = {
  templateId: string
  generationDepth: 'process' | 'activity_step'
  rows: TaskPlanRhythmGeneratedRow[]
  assetSummary: {
    source: 't2_division_rhythm_template_seed'
    templateId: string
    sourceVersion: string
    governanceStatus: string
    manualReviewRequired: true
    cycleCount: number | null
    mutationBoundary: 'preview_candidate_then_explicit_user_commit'
    role: DurationAssetRole
    effectiveSource: EffectiveDurationAssetSource
    versionId: string | null
    resolverSource: T2DivisionRhythmTemplateResolverRecord['__resolverSource']
  }
  parentWindowFit: TaskPlanRhythmParentWindowFit
  constructionCalendar: ConstructionCalendarContext
  assetConsumptionReceipts: DurationAssetConsumptionReceipt[]
  assetConsumptionSummary: DurationAssetConsumptionSummary
}

type ResolvedTaskPlanRhythmTemplate = T2DivisionRhythmTemplate & {
  __resolverSource: T2DivisionRhythmTemplateResolverRecord['__resolverSource']
  __resolverVersionId: string | null
  __runtimeRole: DurationAssetRole
  __effectiveRuntimeSource: EffectiveDurationAssetSource
}

type TaskPlanRhythmTemplateResolver = (
  templateId: string | null | undefined,
  context?: AlgorithmSeedResolveContext,
) => Promise<T2DivisionRhythmTemplateResolverRecord | null>

const T2_WINDOW_LABELS: Record<string, string> = {
  floor_control_line: '楼层测量放线与控制线复核',
  vertical_rebar_embed: '竖向钢筋绑扎及预留预埋',
  vertical_formwork: '墙柱模板安装与加固',
  horizontal_formwork_support: '梁板模板及支撑体系',
  horizontal_rebar_embed: '梁板钢筋绑扎及机电预埋',
  concrete_pour: '隐蔽验收完成及混凝土浇筑',
  early_curing_strip_gate: '混凝土养护及早拆条件确认',
  floor_handover_quality_closeout: '本层质量检查与上层工作面移交',
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function positiveInteger(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed)
  }
  return null
}

function finiteInteger(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback
}

function normalizedDate(value: unknown) {
  const normalized = text(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function inclusiveDays(
  start: string,
  end: string,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  const parsedStart = parseConstructionCalendarDate(start)
  const parsedEnd = parseConstructionCalendarDate(end)
  if (!parsedStart || !parsedEnd) return 0
  return productionDaysBetweenInclusive(parsedStart, parsedEnd, constructionCalendar)
}

function addDays(
  start: string,
  offsetDays: number,
  constructionCalendar?: ConstructionCalendarContext | null,
) {
  const parsedStart = parseConstructionCalendarDate(start)
  if (!parsedStart) return start
  return addConstructionProductionDays(parsedStart, Math.max(0, offsetDays) + 1, constructionCalendar)
}

function readMetadata(task: Record<string, unknown>) {
  return record(task.standard_task_metadata ?? task.standardTaskMetadata)
}

function resolveLevel(task: Record<string, unknown>): TaskPlanRhythmDrilldownLevel {
  const metadata = readMetadata(task)
  const lineage = record(metadata.drilldownGenerationLineage ?? metadata.drilldown_generation_lineage)
  const level = text(lineage.level ?? lineage.generationLevel)
  if (level === 'master_control' || level === 'process_detail' || level === 'activity_step') return level
  if (text(task.wbs_node_type) === 'activity_step') return 'activity_step'
  if (text(task.wbs_node_type) === 'process') return 'process_detail'
  return 'master_control'
}

function resolveT2TemplateId(task: Record<string, unknown>, metadata: Record<string, unknown>) {
  const mapping = record(metadata.durationAssetMapping ?? task.duration_asset_mapping)
  const calculation = record(metadata.durationAssetCalculation ?? task.duration_asset_calculation)
  const rhythm = record(metadata.taskPlanRhythmDrilldown ?? metadata.task_plan_rhythm_drilldown)
  return text(
    rhythm.t2RhythmTemplateId
      ?? rhythm.t2_rhythm_template_id
      ?? mapping.t2RhythmTemplateId
      ?? mapping.t2_rhythm_template_id
      ?? calculation.t2RhythmTemplateId
      ?? calculation.t2_rhythm_template_id,
  ) || null
}

function resolveBuildingLabel(title: string) {
  const match = title.match(/^(.+?(?:#|号)?楼)/)
  return match?.[1]?.trim() || null
}

function getBootstrapTemplate(templateId: string | null) {
  if (!templateId) return null
  return T2_DIVISION_RHYTHM_TEMPLATE_SEED.find((template) => template.templateId === templateId) ?? null
}

function mergeResolvedTemplate(
  templateId: string,
  resolved: T2DivisionRhythmTemplateResolverRecord | null,
): ResolvedTaskPlanRhythmTemplate | null {
  const bootstrap = getBootstrapTemplate(templateId)
  if (!bootstrap) return null
  const resolverSource = resolved?.__resolverSource ?? 'ts_seed_fallback'
  const resolvedRecord = record(resolved)
  const resolvedRhythm = record(resolvedRecord.rhythm)
  const resolvedParentWindowDays = record(
    resolvedRhythm.parentWindowDays
      ?? resolvedRecord.parentWindowDays
      ?? resolvedRecord.parent_window_days,
  )
  return {
    ...bootstrap,
    ...(resolvedRecord as Partial<T2DivisionRhythmTemplate>),
    templateId: text(resolvedRecord.templateId ?? resolvedRecord.template_id) || bootstrap.templateId,
    sourceVersion: text(resolvedRecord.sourceVersion ?? resolvedRecord.source_version) || bootstrap.sourceVersion,
    rhythm: {
      ...bootstrap.rhythm,
      ...(resolvedRhythm as Partial<T2DivisionRhythmTemplate['rhythm']>),
      parentWindowDays: {
        ...bootstrap.rhythm.parentWindowDays,
        ...resolvedParentWindowDays,
      },
    },
    __resolverSource: resolverSource,
    __resolverVersionId: resolved?.__resolverVersionId ?? null,
    __runtimeRole: resolved?.__runtimeRole
      ?? classifyAlgorithmSeedRuntimeRole('t2_division_rhythm_template', resolverSource),
    __effectiveRuntimeSource: resolved?.__effectiveRuntimeSource
      ?? mapAlgorithmSeedResolverSource(resolverSource),
  } as ResolvedTaskPlanRhythmTemplate
}

async function resolveTaskPlanRhythmTemplate(params: {
  templateId: string
  projectId?: string | null
  companyId?: string | null
  resolveTemplate?: TaskPlanRhythmTemplateResolver
}) {
  const resolver = params.resolveTemplate ?? resolveT2DivisionRhythmTemplateByTemplateId
  const resolved = await resolver(params.templateId, {
    projectId: params.projectId ?? null,
    companyId: params.companyId ?? null,
    templateNodeId: params.templateId,
  })
  const template = mergeResolvedTemplate(params.templateId, resolved)
  if (!template) return null
  const resolution: EffectiveDurationAssetResolution<ResolvedTaskPlanRhythmTemplate> = {
    stableCode: template.templateId,
    assetType: 't2_division_rhythm_template',
    role: template.__runtimeRole,
    value: template,
    effectiveSource: template.__effectiveRuntimeSource,
    versionId: template.__resolverVersionId ?? template.sourceVersion,
    publicationKey: text(record(resolved).publicationKey ?? record(resolved).publication_key) || null,
    suppressedSources: [],
    conflictCodes: [],
    runtimeConsumable: true,
    rollbackTarget: text(record(resolved).rollbackTarget ?? record(resolved).rollback_target) || null,
  }
  return { template, resolution }
}

export function buildTaskPlanDrilldownParentContext(taskInput: Record<string, unknown>): TaskPlanDrilldownParentContext {
  const task = record(taskInput)
  const metadata = readMetadata(task)
  const residential = record(metadata.residentialMasterPlan ?? metadata.residential_master_plan)
  const businessTypeMaster = record(metadata.businessTypeMasterPlan ?? metadata.business_type_master_plan)
  const projectFacts = record(metadata.projectGenerationFacts ?? metadata.project_generation_facts)
  const rhythm = record(metadata.taskPlanRhythmDrilldown ?? metadata.task_plan_rhythm_drilldown)
  const title = text(task.title)
  return {
    parentTaskId: text(task.id) || null,
    parentTitle: title,
    plannedStartDate: normalizedDate(task.planned_start_date ?? task.start_date),
    plannedEndDate: normalizedDate(task.planned_end_date ?? task.end_date),
    currentLevel: resolveLevel(task),
    standardFloorCount: positiveInteger(
      residential.standardFloorCount,
      residential.standard_floor_count,
      businessTypeMaster.standardFloorCount,
      businessTypeMaster.standard_floor_count,
      projectFacts.standardFloorCount,
      projectFacts.standard_floor_count,
      task.standard_floor_count,
    ),
    t2RhythmTemplateId: resolveT2TemplateId(task, metadata),
    cycleIndex: positiveInteger(rhythm.cycleIndex, rhythm.cycle_index),
    cycleCount: positiveInteger(rhythm.cycleCount, rhythm.cycle_count),
    buildingLabel: text(rhythm.buildingLabel ?? rhythm.building_label) || resolveBuildingLabel(title),
    executionPhase: text(task.execution_phase ?? metadata.executionPhase) || null,
    executionLane: text(task.execution_lane ?? metadata.executionLane) || null,
    sourceStandardWorkCode: text(task.standard_work_code ?? metadata.standardWorkCode) || null,
    sortOrder: finiteInteger(task.sort_order),
  }
}

export function resolveTaskPlanRhythmRecommendation(task: Record<string, unknown>) {
  const context = buildTaskPlanDrilldownParentContext(task)
  if (context.t2RhythmTemplateId !== RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID) return null
  if (context.currentLevel === 'master_control') {
    return {
      templateId: RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID,
      templateName: '住宅标准层主体结构节奏（T2）',
      selectedNodeIds: [`${RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID}:floor-cycles`],
      selectedNodeNames: ['按标准层施工循环展开'],
      resolutionSource: 'rhythm_asset_match' as const,
      confidence: 'high' as const,
    }
  }
  if (context.currentLevel === 'process_detail') {
    return {
      templateId: RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID,
      templateName: '住宅标准层主体结构节奏（T2）',
      selectedNodeIds: [`${RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID}:child-windows`],
      selectedNodeNames: ['展开本循环作业步骤'],
      resolutionSource: 'rhythm_asset_match' as const,
      confidence: 'high' as const,
    }
  }
  return null
}

function buildParentWindowFit(params: {
  parentContext: TaskPlanDrilldownParentContext
  template: T2DivisionRhythmTemplate
  nextLevel: 'process_detail' | 'activity_step'
  constructionCalendar: ConstructionCalendarContext
}): TaskPlanRhythmParentWindowFit {
  const start = params.parentContext.plannedStartDate
  const end = params.parentContext.plannedEndDate
  const availableProductionDays = start && end
    ? inclusiveDays(start, end, params.constructionCalendar)
    : 0
  if (params.nextLevel === 'activity_step') {
    return {
      decision: 'activity_window_fit',
      calendarBasis: params.constructionCalendar.basis,
      availableProductionDays,
      cycleCount: params.parentContext.cycleCount,
      minimumRequiredProductionDays: null,
      targetRequiredProductionDays: null,
      p80RequiredProductionDays: null,
      selectedCycleProductionDays: null,
      allocatedProductionDays: availableProductionDays,
      bufferProductionDays: 0,
      compressionProductionDays: 0,
      conflictCodes: [],
    }
  }

  const p20 = positiveInteger(params.template.rhythm.parentWindowDays.p20) ?? 1
  const p50 = positiveInteger(params.template.rhythm.parentWindowDays.p50, p20) ?? p20
  const p80 = positiveInteger(params.template.rhythm.parentWindowDays.p80, p50) ?? p50
  const inferredCycleCount = Math.max(1, Math.round(availableProductionDays / p80))
  const cycleCount = params.parentContext.standardFloorCount ?? inferredCycleCount
  const minimumRequiredProductionDays = cycleCount * p20
  const targetRequiredProductionDays = cycleCount * p50
  const p80RequiredProductionDays = cycleCount * p80

  if (availableProductionDays < minimumRequiredProductionDays) {
    return {
      decision: 'blocked_by_minimum_rhythm_conflict',
      calendarBasis: params.constructionCalendar.basis,
      availableProductionDays,
      cycleCount,
      minimumRequiredProductionDays,
      targetRequiredProductionDays,
      p80RequiredProductionDays,
      selectedCycleProductionDays: null,
      allocatedProductionDays: 0,
      bufferProductionDays: 0,
      compressionProductionDays: Math.max(0, p80RequiredProductionDays - availableProductionDays),
      conflictCodes: ['parent_window_shorter_than_t2_p20_minimum'],
    }
  }

  if (availableProductionDays >= p80RequiredProductionDays) {
    const bufferProductionDays = availableProductionDays - p80RequiredProductionDays
    return {
      decision: bufferProductionDays > 0 ? 'p80_with_boundary_buffer' : 'p80_boundary_fit',
      calendarBasis: params.constructionCalendar.basis,
      availableProductionDays,
      cycleCount,
      minimumRequiredProductionDays,
      targetRequiredProductionDays,
      p80RequiredProductionDays,
      selectedCycleProductionDays: p80,
      allocatedProductionDays: p80RequiredProductionDays,
      bufferProductionDays,
      compressionProductionDays: 0,
      conflictCodes: [],
    }
  }

  return {
    decision: 'controlled_compression_to_parent_boundary',
    calendarBasis: params.constructionCalendar.basis,
    availableProductionDays,
    cycleCount,
    minimumRequiredProductionDays,
    targetRequiredProductionDays,
    p80RequiredProductionDays,
    selectedCycleProductionDays: null,
    allocatedProductionDays: availableProductionDays,
    bufferProductionDays: 0,
    compressionProductionDays: p80RequiredProductionDays - availableProductionDays,
    conflictCodes: [],
  }
}

function allocateCycleProductionDays(fit: TaskPlanRhythmParentWindowFit) {
  const cycleCount = fit.cycleCount ?? 0
  if (cycleCount <= 0 || fit.allocatedProductionDays <= 0) return []
  if (fit.selectedCycleProductionDays) {
    return Array.from({ length: cycleCount }, () => fit.selectedCycleProductionDays as number)
  }
  const base = Math.floor(fit.allocatedProductionDays / cycleCount)
  const remainder = fit.allocatedProductionDays % cycleCount
  return Array.from({ length: cycleCount }, (_value, index) => base + (index < remainder ? 1 : 0))
}

function buildBaseValues(params: {
  title: string
  startDate: string
  endDate: string
  nodeType: 'process' | 'activity_step'
  stableCode: string
  template: T2DivisionRhythmTemplate
  scope: Record<string, unknown>
  metadata: Record<string, unknown>
  constructionCalendar: ConstructionCalendarContext
}) {
  const durationDays = inclusiveDays(params.startDate, params.endDate, params.constructionCalendar)
  return {
    title: params.title,
    planned_start_date: params.startDate,
    planned_end_date: params.endDate,
    start_date: params.startDate,
    end_date: params.endDate,
    progress: 0,
    status: 'todo',
    priority: 'medium',
    is_milestone: false,
    is_wbs_summary: false,
    is_executable: true,
    wbs_node_type: params.nodeType,
    category_type: params.nodeType,
    template_id: params.template.templateId,
    template_node_id: params.stableCode,
    source_template_id: params.template.templateId,
    source_template_node_id: params.stableCode,
    standard_work_code: params.stableCode,
    standard_work_name: params.title,
    smart_reference_days: durationDays,
    duration_contribution_mode: 'duration_bearing',
    duration_authority: 'system_standard_t2_rhythm',
    duration_calibration_source: 't2_division_rhythm_template_seed',
    duration_provenance: params.template.sourceVersion,
    duration_review_gate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
    row_projection_mode: 'schedule_row',
    ...params.scope,
    standard_task_metadata: params.metadata,
  }
}

function buildAssetMetadata(params: {
  parentContext: TaskPlanDrilldownParentContext
  template: T2DivisionRhythmTemplate
  level: 'process_detail' | 'activity_step'
  generationBatchId: string
  attachUnderRowId: string
  stableCode: string
  cycleIndex: number | null
  cycleCount: number | null
  parentWindowFit: TaskPlanRhythmParentWindowFit
  resolution: EffectiveDurationAssetResolution<ResolvedTaskPlanRhythmTemplate>
  extra?: Record<string, unknown>
}) {
  return {
    stableCode: params.stableCode,
    rowProjectionMode: 'schedule_row',
    scheduleParticipation: 'normal',
    durationContributionMode: 'duration_bearing',
    planItemKind: 'work_task',
    progressMode: 'manual',
    executionNature: 'physical_work',
    executionPhase: params.parentContext.executionPhase,
    executionLane: params.parentContext.executionLane,
    generationDepthPolicy: {
      policyId: 'task_plan_t2_rhythm_controlled_frontier_v1',
      materializeDepth: params.level === 'process_detail' ? 'process' : 'activity_step',
      durationComputeDepth: params.level === 'process_detail' ? 'process' : 'activity_step',
      drillDownAvailable: params.level === 'process_detail',
      confidence: 'high',
      governance: {
        curationStatus: 'seeded',
        assetGovernanceStatus: params.resolution.role,
        reviewPolicy: 'preview_then_explicit_user_commit',
      },
    },
    durationAssetMapping: {
      t2RhythmTemplateId: params.template.templateId,
      t2RhythmTemplateVersion: params.template.sourceVersion,
      source: 't2_division_rhythm_template_seed',
      role: params.resolution.role,
      effectiveSource: params.resolution.effectiveSource,
      versionId: params.resolution.versionId,
      publicationKey: params.resolution.publicationKey,
    },
    taskPlanRhythmDrilldown: {
      t2RhythmTemplateId: params.template.templateId,
      t2RhythmTemplateVersion: params.template.sourceVersion,
      cycleIndex: params.cycleIndex,
      cycleCount: params.cycleCount,
      buildingLabel: params.parentContext.buildingLabel,
      workfaceUnit: params.template.rhythm.workfaceUnit,
      sourceGovernanceStatus: params.template.governance.governanceStatus,
      manualReviewRequired: true,
      materializationPolicy: 'preview_then_explicit_user_commit',
      floorIdentityPolicy: 'ordered_cycle_sequence_until_floor_object_is_bound',
      parentWindowFit: params.parentWindowFit,
      ...params.extra,
    },
    drilldownGenerationLineage: {
      level: params.level,
      sourceParentTaskId: params.attachUnderRowId,
      generationBatchId: params.generationBatchId,
      templateId: params.template.templateId,
      templateNodeId: params.stableCode,
      assetVersionId: params.resolution.versionId,
      assetEffectiveSource: params.resolution.effectiveSource,
      mutationBoundary: 'generated_row_metadata_only',
    },
  }
}

function buildGeneratedRow(params: {
  clientRowId: string
  parentRowId: string
  sortOrder: number
  values: Record<string, unknown>
  predecessorDependencies: TaskPlanRhythmGeneratedRow['predecessorDependencies']
  executionPhase: string | null
  executionLane: string | null
  workfaceId: string | null
}) : TaskPlanRhythmGeneratedRow {
  return {
    clientRowId: params.clientRowId,
    parentClientRowId: null,
    parentRowId: params.parentRowId,
    sortOrder: params.sortOrder,
    values: params.values,
    predecessorClientRowIds: params.predecessorDependencies.map((dependency) => dependency.clientRowId),
    predecessorDependencies: params.predecessorDependencies,
    rowProjectionMode: 'schedule_row',
    executionPhase: params.executionPhase,
    executionLane: params.executionLane,
    executionSortKey: params.sortOrder,
    workfaceId: params.workfaceId,
    planItemKind: 'work_task',
    progressMode: 'manual',
    scheduleParticipation: 'normal',
    executionNature: 'physical_work',
  }
}

function buildT2InternalFlowEvidence(params: {
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF'
  lagDays: number
  intentCode: string
}) {
  return buildConstructionDependencyRuleEvidence({
    relationLayerKey: 'same_parent_internal_flow',
    dependencyType: params.dependencyType,
    lagDays: params.lagDays,
    intentCode: params.intentCode,
    layerStack: [
      'same_parent_internal_flow',
      ...(params.dependencyType !== 'FS' || params.lagDays !== 0
        ? ['process_constraint' as const]
        : []),
    ],
    productionWritePolicy: 'task_plan_drilldown_commit_transactional_tasks_and_dependencies',
    mutationBoundary: 'preview_no_write_explicit_commit_transactional',
  })
}

function buildCycleRows(params: {
  parentContext: TaskPlanDrilldownParentContext
  template: T2DivisionRhythmTemplate
  generationBatchId: string
  attachUnderRowId: string
  scope: Record<string, unknown>
  constructionCalendar: ConstructionCalendarContext
  parentWindowFit: TaskPlanRhythmParentWindowFit
  resolution: EffectiveDurationAssetResolution<ResolvedTaskPlanRhythmTemplate>
}) {
  const { parentContext, template } = params
  if (!parentContext.plannedStartDate || !parentContext.plannedEndDate) return []
  const cycleDurations = allocateCycleProductionDays(params.parentWindowFit)
  const cycleCount = cycleDurations.length
  if (cycleCount === 0) return []
  const buildingLabel = parentContext.buildingLabel ? `${parentContext.buildingLabel}` : '本楼栋'
  const rows: TaskPlanRhythmGeneratedRow[] = []
  let startOffset = 0
  for (let index = 0; index < cycleCount; index += 1) {
    const cycleIndex = index + 1
    const durationDays = cycleDurations[index] ?? 1
    const startDate = addDays(parentContext.plannedStartDate, startOffset, params.constructionCalendar)
    const endDate = addDays(parentContext.plannedStartDate, startOffset + durationDays - 1, params.constructionCalendar)
    const stableCode = `${template.templateId}:F${String(cycleIndex).padStart(2, '0')}`
    const clientRowId = `${params.generationBatchId}:${stableCode}`
    const previous = rows.at(-1)
    const predecessorDependencies = previous
      ? [{
          clientRowId: previous.clientRowId,
          dependencyType: 'FS' as const,
          lagDays: 0,
          source: 'internal_flow' as const,
          intentCode: `${template.templateId}:floor-cycle-sequence`,
          relationRole: 'workflow' as const,
          dependencyRuleEvidence: buildT2InternalFlowEvidence({
            dependencyType: 'FS',
            lagDays: 0,
            intentCode: `${template.templateId}:floor-cycle-sequence`,
          }),
        }]
      : []
    const title = `${buildingLabel}标准层第${String(cycleIndex).padStart(2, '0')}施工循环`
    const metadata = buildAssetMetadata({
      parentContext,
      template,
      level: 'process_detail',
      generationBatchId: params.generationBatchId,
      attachUnderRowId: params.attachUnderRowId,
      stableCode,
      cycleIndex,
      cycleCount,
      parentWindowFit: params.parentWindowFit,
      resolution: params.resolution,
      extra: {
        allocatedCycleDays: durationDays,
        t2P20Days: template.rhythm.parentWindowDays.p20,
        t2P50Days: template.rhythm.parentWindowDays.p50,
        t2P80Days: template.rhythm.parentWindowDays.p80,
        cycleDurationOutsideT2Band: durationDays < template.rhythm.parentWindowDays.p20
          || durationDays > template.rhythm.parentWindowDays.p80,
      },
    })
    rows.push(buildGeneratedRow({
      clientRowId,
      parentRowId: params.attachUnderRowId,
      sortOrder: parentContext.sortOrder + cycleIndex,
      values: buildBaseValues({
        title,
        startDate,
        endDate,
        nodeType: 'process',
        stableCode,
        template,
        scope: params.scope,
        metadata,
        constructionCalendar: params.constructionCalendar,
      }),
      predecessorDependencies,
      executionPhase: parentContext.executionPhase,
      executionLane: parentContext.executionLane,
      workfaceId: text(params.scope.floor_object_id ?? params.scope.building_object_id) || null,
    }))
    startOffset += durationDays
  }
  return rows
}

function buildActivityRows(params: {
  parentContext: TaskPlanDrilldownParentContext
  template: T2DivisionRhythmTemplate
  generationBatchId: string
  attachUnderRowId: string
  scope: Record<string, unknown>
  constructionCalendar: ConstructionCalendarContext
  parentWindowFit: TaskPlanRhythmParentWindowFit
  resolution: EffectiveDurationAssetResolution<ResolvedTaskPlanRhythmTemplate>
}) {
  const { parentContext, template } = params
  if (!parentContext.plannedStartDate || !parentContext.plannedEndDate) return []
  const parentDays = inclusiveDays(
    parentContext.plannedStartDate,
    parentContext.plannedEndDate,
    params.constructionCalendar,
  )
  const maxTemplateDay = Math.max(...template.rhythm.childWindows.map((window) => window.endDay), 1)
  const rowByWindowCode = new Map<string, TaskPlanRhythmGeneratedRow>()
  const scaleDay = (templateDay: number) => {
    if (maxTemplateDay <= 1 || parentDays <= 1) return 1
    return Math.round(((templateDay - 1) / (maxTemplateDay - 1)) * (parentDays - 1)) + 1
  }
  const rows = template.rhythm.childWindows.map((window, index) => {
    const standardFloorWindow = template.templateId === RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID
      && parentDays >= template.rhythm.childWindows.length
    const startDay = standardFloorWindow
      ? window.role === 'floor_handover_quality_closeout'
        ? parentDays
        : window.role === 'early_curing_strip_gate'
          ? 7
          : index + 1
      : scaleDay(window.startDay)
    const endDay = standardFloorWindow
      ? window.role === 'floor_handover_quality_closeout'
        ? parentDays
        : window.role === 'early_curing_strip_gate'
          ? Math.max(7, parentDays - 1)
          : index + 1
      : scaleDay(window.endDay)
    const startDate = addDays(parentContext.plannedStartDate as string, startDay - 1, params.constructionCalendar)
    const endDate = addDays(parentContext.plannedStartDate as string, endDay - 1, params.constructionCalendar)
    const incomingEdges = template.dependencyEdges.filter((edge) => edge.successorWindowCode === window.windowCode)
    const predecessorDependencies = incomingEdges.flatMap((edge) => {
      const predecessor = rowByWindowCode.get(edge.predecessorWindowCode)
      return predecessor
        ? [{
            clientRowId: predecessor.clientRowId,
            dependencyType: edge.relation,
            lagDays: edge.lagDays,
            source: 'internal_flow' as const,
            intentCode: edge.edgeCode,
            relationRole: 'workflow' as const,
            dependencyRuleEvidence: buildT2InternalFlowEvidence({
              dependencyType: edge.relation,
              lagDays: edge.lagDays,
              intentCode: edge.edgeCode,
            }),
          }]
        : []
    })
    const stableCode = window.windowCode
    const metadata = buildAssetMetadata({
      parentContext,
      template,
      level: 'activity_step',
      generationBatchId: params.generationBatchId,
      attachUnderRowId: params.attachUnderRowId,
      stableCode,
      cycleIndex: parentContext.cycleIndex,
      cycleCount: parentContext.cycleCount,
      parentWindowFit: params.parentWindowFit,
      resolution: params.resolution,
      extra: {
        rhythmWindowCode: window.windowCode,
        rhythmWindowRole: window.role,
        durationBearing: window.durationBearing,
        hardGate: template.hardGates.find((gate) => (
          gate.label.replaceAll(' ', '_') === window.role
        ))?.gateCode ?? null,
      },
    })
    const clientRowId = `${params.generationBatchId}:${window.windowCode}`
    const row = buildGeneratedRow({
      clientRowId,
      parentRowId: params.attachUnderRowId,
      sortOrder: parentContext.sortOrder + index + 1,
      values: buildBaseValues({
        title: T2_WINDOW_LABELS[window.role] ?? window.label,
        startDate,
        endDate,
        nodeType: 'activity_step',
        stableCode,
        template,
        scope: params.scope,
        metadata,
        constructionCalendar: params.constructionCalendar,
      }),
      predecessorDependencies,
      executionPhase: parentContext.executionPhase,
      executionLane: parentContext.executionLane,
      workfaceId: text(params.scope.floor_object_id ?? params.scope.building_object_id) || null,
    })
    rowByWindowCode.set(window.windowCode, row)
    return row
  })
  return rows
}

export async function buildTaskPlanRhythmDrilldownRows(params: {
  parentContext: TaskPlanDrilldownParentContext
  nextLevel: 'process_detail' | 'activity_step'
  generationBatchId: string
  attachUnderRowId: string
  scope: Record<string, unknown>
  projectId?: string | null
  companyId?: string | null
  constructionCalendar?: ConstructionCalendarContext | null
  resolveTemplate?: TaskPlanRhythmTemplateResolver
}): Promise<TaskPlanRhythmDrilldownResult | null> {
  const templateId = params.parentContext.t2RhythmTemplateId
  if (!templateId || templateId !== RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID) return null
  const resolved = await resolveTaskPlanRhythmTemplate({
    templateId,
    projectId: params.projectId,
    companyId: params.companyId,
    resolveTemplate: params.resolveTemplate,
  })
  if (!resolved) return null
  const { template } = resolved
  if (!template || template.templateId !== RESIDENTIAL_STANDARD_FLOOR_T2_TEMPLATE_ID) return null
  const constructionCalendar = params.constructionCalendar ?? await resolveConstructionCalendarContext({
    projectId: params.projectId ?? null,
    standardWorkCode: params.parentContext.sourceStandardWorkCode,
    templateNodeId: template.templateId,
  })
  const parentWindowFit = buildParentWindowFit({
    parentContext: params.parentContext,
    template,
    nextLevel: params.nextLevel,
    constructionCalendar,
  })
  const effectiveResolution: EffectiveDurationAssetResolution<ResolvedTaskPlanRhythmTemplate> = {
    ...resolved.resolution,
    conflictCodes: parentWindowFit.conflictCodes,
    runtimeConsumable: resolved.resolution.runtimeConsumable && parentWindowFit.conflictCodes.length === 0,
  }
  const rows = params.nextLevel === 'process_detail'
    ? buildCycleRows({
        ...params,
        template,
        constructionCalendar,
        parentWindowFit,
        resolution: effectiveResolution,
      })
    : buildActivityRows({
        ...params,
        template,
        constructionCalendar,
        parentWindowFit,
        resolution: effectiveResolution,
      })
  const assetConsumptionReceipts = [buildDurationAssetConsumptionReceipt({
    consumer: 'task_plan_drilldown_rhythm',
    resolution: effectiveResolution,
    before: {
      taskSelection: [],
      durationDays: [],
      dates: [],
      dependencies: [],
      bufferDays: null,
    },
    after: {
      taskSelection: rows.map((row) => row.clientRowId),
      durationDays: rows.map((row) => row.values.smart_reference_days),
      dates: rows.map((row) => [row.values.planned_start_date, row.values.planned_end_date]),
      dependencies: rows.flatMap((row) => row.predecessorDependencies.map((dependency) => ({
        predecessor: dependency.clientRowId,
        successor: row.clientRowId,
        type: dependency.dependencyType,
        lagDays: dependency.lagDays,
      }))),
      bufferDays: parentWindowFit.bufferProductionDays,
    },
    targetRowIds: rows.map((row) => row.clientRowId),
    reasonCodes: parentWindowFit.conflictCodes.length > 0
      ? parentWindowFit.conflictCodes
      : ['governed_t2_rhythm_materialized'],
  })]
  return {
    templateId: template.templateId,
    generationDepth: params.nextLevel === 'process_detail' ? 'process' : 'activity_step',
    rows,
    assetSummary: {
      source: 't2_division_rhythm_template_seed',
      templateId: template.templateId,
      sourceVersion: template.sourceVersion,
      governanceStatus: template.governance.governanceStatus,
      manualReviewRequired: true,
      cycleCount: parentWindowFit.cycleCount,
      mutationBoundary: 'preview_candidate_then_explicit_user_commit',
      role: effectiveResolution.role,
      effectiveSource: effectiveResolution.effectiveSource,
      versionId: effectiveResolution.versionId,
      resolverSource: template.__resolverSource,
    },
    parentWindowFit,
    constructionCalendar,
    assetConsumptionReceipts,
    assetConsumptionSummary: summarizeDurationAssetConsumption(assetConsumptionReceipts),
  }
}
