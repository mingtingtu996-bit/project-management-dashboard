import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { afterEach } from 'vitest'

const dbServiceMocks = vi.hoisted(() => {
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn'

  const emptyResult = { data: [], error: null, count: 0 }
  const singleResult = { data: null, error: null }

  const createQuery = () => {
    const query: Record<string, any> = {}
    const chain = () => query
    for (const method of [
      'select',
      'eq',
      'neq',
      'in',
      'not',
      'is',
      'gte',
      'lte',
      'gt',
      'lt',
      'ilike',
      'like',
      'or',
      'order',
      'limit',
      'range',
      'contains',
      'overlaps',
      'match',
      'insert',
      'update',
      'upsert',
      'delete',
      'returns',
      'throwOnError',
    ]) {
      query[method] = vi.fn(chain)
    }
    query.single = vi.fn(async () => singleResult)
    query.maybeSingle = vi.fn(async () => singleResult)
    query.abortSignal = vi.fn(async () => emptyResult)
    query.then = (resolve: (value: typeof emptyResult) => unknown, reject?: (reason: unknown) => unknown) => (
      Promise.resolve(emptyResult).then(resolve, reject)
    )
    query.catch = (reject: (reason: unknown) => unknown) => Promise.resolve(emptyResult).catch(reject)
    query.finally = (onFinally: () => void) => Promise.resolve(emptyResult).finally(onFinally)
    return query
  }

  class SupabaseService {
    async query() { return [] }
    async create() { return {} }
    async update() { return {} }
    async delete() { return null }
  }

  return {
    supabase: {
      from: vi.fn(() => createQuery()),
    },
    executeSQL: vi.fn(async () => []),
    executeSQLOne: vi.fn(async () => null),
    SupabaseService,
  }
})
vi.mock('../services/dbService.js', () => dbServiceMocks)

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: vi.fn(async () => null),
  isUuidLike: (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '').trim()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  applyProcessConstraintEffects,
  buildCandidateNetworkEvaluationForGeneratedRows,
  buildTemplateGenerateCreateOperations,
  CHINA_GB55032_TEMPLATE_ID,
  generateWbsTemplatePhaseChainRows as generateWbsTemplatePhaseChainRowsRaw,
  generateWbsTemplateRows as generateWbsTemplateRowsRaw,
  getWbsTemplateCatalogItem,
  listWbsTemplateCatalog,
  loadWbsTemplateNodes,
  recordWbsTemplateGenerationRuntimeConsumption,
  validateChinaGb50300Seed,
} from '../services/wbsTemplateGenerationService.js'
import {
  collectStandardInternalFlowGovernanceReport,
  flattenChinaTemplateCatalog,
  resolveStandardInternalFlowRule,
  type ChinaTemplateCatalogNode,
} from '../seeds/chinaGb50300TemplateCatalog.js'
import { STANDARD_INTERNAL_FLOW_RULE_SEED } from '../seeds/standardInternalFlowSeed.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS, WBS_TEMPLATE_PROJECT_TYPE_CODES } from '../seeds/domainWbsTemplateCatalogs.js'
import { inferControlRoles } from '../seeds/controlRoles.js'
import { inferDurationContributionMode } from '../seeds/durationContributionMode.js'
import { inferExecutionNature } from '../seeds/executionNature.js'
import { getScopeAssignmentRules } from '../services/scopeAssignmentRulesService.js'
import {
  calculateWbsParentPlanRollup,
  contributesToWbsPlannedWindow,
  distributePlanDurationAcrossActivitySteps,
} from '../services/wbsPlanRollupService.js'
import { buildSpecialWorkDurationCandidateNodes } from '../services/wbsTemplateCandidateEventService.js'

const previousDisablePermissionSystem = process.env.DISABLE_PERMISSION_SYSTEM

beforeAll(() => {
  process.env.DISABLE_PERMISSION_SYSTEM = 'true'
})

afterAll(() => {
  if (previousDisablePermissionSystem == null) {
    delete process.env.DISABLE_PERMISSION_SYSTEM
    return
  }
  process.env.DISABLE_PERMISSION_SYSTEM = previousDisablePermissionSystem
})

afterEach(() => {
  vi.clearAllMocks()
})

function flattenDomainNodes(nodes: ChinaTemplateCatalogNode[] = []): ChinaTemplateCatalogNode[] {
  return nodes.flatMap((node) => [node, ...flattenDomainNodes(node.children ?? [])])
}

function getDomainTemplate(templateId: string) {
  const template = DOMAIN_WBS_TEMPLATE_CATALOGS.find((item) => item.templateId === templateId)
  expect(template).toBeTruthy()
  return template!
}

function createRecordingQueryExec() {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
    calls.push({ sql, params })
    return [] as T[]
  }
  return { calls, queryExec }
}

function callsForTable(calls: Array<{ sql: string, params: unknown[] }>, tableName: string) {
  return calls.filter((call) => call.sql.toLowerCase().includes(tableName))
}

function parseJsonParam<T>(call: { params: unknown[] }, index: number): T {
  return JSON.parse(String(call.params[index] ?? 'null')) as T
}

const IDENTIFIED_TEST_CONSTRUCTION_CALENDAR = {
  basis: 'official_construction_calendar_seed' as const,
  calendarRef: 'work_calendar',
  calendarVersion: 'test-calendar-v1',
  timezone: 'Asia/Shanghai',
  availability: 'available' as const,
  unavailableReason: null,
  windows: [],
}

function generateWbsTemplateRows(
  params: Parameters<typeof generateWbsTemplateRowsRaw>[0],
) {
  const operation = params.operation as Record<string, unknown>
  const clientContext = (operation.clientContext ?? {}) as Record<string, unknown>
  const hasExplicitDepth = Boolean(
    params.detailLevel
    || operation.detailLevel
    || operation.detail_level
    || operation.generationDepth
    || operation.generation_depth
    || clientContext.detailLevel
    || clientContext.detail_level
    || clientContext.generationDepth
    || clientContext.generation_depth
    || operation.includeActivitySteps
    || operation.include_activity_steps
    || clientContext.includeActivitySteps
    || clientContext.include_activity_steps,
  )
  const normalizedParams = hasExplicitDepth ? params : {
    ...params,
    detailLevel: 'standard' as const,
  }
  return generateWbsTemplateRowsRaw({
    ...normalizedParams,
    diagnosticDurationSuggestionMode: normalizedParams.diagnosticDurationSuggestionMode ?? 'fast_template',
  })
}

function generateWbsTemplatePhaseChainRows(
  params: Parameters<typeof generateWbsTemplatePhaseChainRowsRaw>[0],
) {
  return generateWbsTemplatePhaseChainRowsRaw({
    ...params,
    diagnosticDurationSuggestionMode: params.diagnosticDurationSuggestionMode ?? 'fast_template',
  })
}

function expectCatalogTemplateSummary(
  catalog: Awaited<ReturnType<typeof listWbsTemplateCatalog>>,
  templateId: string,
  expected: {
    packType: string
    templateGroup: string
    generationPolicy: string
    evidenceSummary: {
      itemWorkCount: number
      processCount: number
      activityStepCount: number
      reviewNeededCount: number
      webVerifiedFalseCount: number
    }
  },
) {
  const template = catalog.templates.find((item) => item.id === templateId)
  expect(template, `${templateId} should be registered in the WBS template catalog`).toBeTruthy()
  expect({
    packType: template?.packType,
    templateGroup: template?.templateGroup,
    generationPolicy: template?.generationPolicy,
    evidenceSummary: template?.evidenceSummary
      ? {
          itemWorkCount: template.evidenceSummary.itemWorkCount,
          processCount: template.evidenceSummary.processCount,
          activityStepCount: template.evidenceSummary.activityStepCount,
          reviewNeededCount: template.evidenceSummary.reviewNeededCount,
          webVerifiedFalseCount: template.evidenceSummary.webVerifiedFalseCount,
        }
      : null,
  }).toEqual(expected)
}

function durationDaysOf(row: { values: Record<string, unknown> }) {
  const start = new Date(`${String(row.values.planned_start_date).slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${String(row.values.planned_end_date).slice(0, 10)}T00:00:00Z`)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
}

function durationDaysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate.slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${endDate.slice(0, 10)}T00:00:00Z`)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
}

function projectDurationDays(rows: Array<{ values: Record<string, unknown> }>) {
  const starts = rows
    .map((row) => Date.parse(`${String(row.values.planned_start_date).slice(0, 10)}T00:00:00Z`))
    .filter(Number.isFinite)
  const ends = rows
    .map((row) => Date.parse(`${String(row.values.planned_end_date).slice(0, 10)}T00:00:00Z`))
    .filter(Number.isFinite)
  if (starts.length === 0 || ends.length === 0) return 0
  return Math.max(1, Math.round((Math.max(...ends) - Math.min(...starts)) / 86_400_000) + 1)
}

function stableCodeOf(row: { values: Record<string, unknown> }) {
  return String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '')
}

function assertGeneratedDependencyNetworkIsClosed(
  generated: Awaited<ReturnType<typeof generateWbsTemplateRows>>,
) {
  const rowIds = new Set(generated.rows.map((row) => row.clientRowId))
  const seenDependencies = new Set<string>()
  const directedPairs = new Set<string>()
  const dependencySources = new Set<string>()

  for (const row of generated.rows) {
    for (const dependency of row.predecessorDependencies) {
      expect(rowIds.has(dependency.clientRowId)).toBe(true)
      expect(dependency.clientRowId).not.toBe(row.clientRowId)
      const signature = [
        row.clientRowId,
        dependency.clientRowId,
        dependency.dependencyType,
        dependency.lagDays,
      ].join('|')
      expect(seenDependencies.has(signature)).toBe(false)
      seenDependencies.add(signature)

      const pair = `${dependency.clientRowId}->${row.clientRowId}`
      const reversePair = `${row.clientRowId}->${dependency.clientRowId}`
      expect(directedPairs.has(reversePair)).toBe(false)
      directedPairs.add(pair)

      dependencySources.add(String(dependency.source ?? ''))
      expect(['sibling_sequence', 'cross_item_workflow', 'dependency_intent_template']).toContain(dependency.source)
      if (dependency.source === 'cross_item_workflow') {
        expect(dependency.relationRole).toBe('workflow')
        expect(String(dependency.intentCode ?? '')).toMatch(/^cross-item:/)
      }
      if (dependency.source === 'dependency_intent_template') {
        expect(dependency.relationRole).not.toBe('workflow')
      }
    }

    expect(row.predecessorClientRowIds).toEqual(
      Array.from(new Set(row.predecessorDependencies.map((dependency) => dependency.clientRowId))),
    )
  }

  expect([...dependencySources].sort()).toEqual([
    'cross_item_workflow',
    'dependency_intent_template',
    'sibling_sequence',
  ])
}

describe('v1.4.7.2 WBS template generation service', () => {
  it('materializes only the selected task next-level process frontier for drilldown', async () => {
    const parentTaskId = '00000000-0000-4000-8000-000000000101'
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-task-process-drilldown',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: { building_object_id: 'building-1' },
        attachUnderRowId: parentTaskId,
        generationDepth: 'process',
        includeActivitySteps: false,
        drilldownMode: 'selected_children',
        drilldownGenerationLevel: 'process_detail',
        sourceParentTaskId: parentTaskId,
      },
    })

    expect(generated.rows).toHaveLength(3)
    expect(generated.rows.some((row) => stableCodeOf(row) === '02-01-01')).toBe(false)
    expect(generated.rows.every((row) => row.values.wbs_node_type === 'process')).toBe(true)
    expect(generated.rows.every((row) => row.values.row_projection_mode === 'schedule_row')).toBe(true)
    expect(generated.rows.map((row) => row.values.title)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/深化配模|承载复核|成型验收/),
    ]))
    expect(generated.rows.filter((row) => !row.parentClientRowId).every((row) => row.parentRowId === parentTaskId)).toBe(true)
    expect(generated.rows.every((row) => (
      (row.values.standard_task_metadata as any)?.drilldownGenerationLineage?.level === 'process_detail'
    ))).toBe(true)
    expect(generated.rowLimit).toBe(80)
  }, 30_000)

  it('uses the parent T2 rhythm asset to materialize ordered standard-floor cycle rows', async () => {
    const parentTaskId = '00000000-0000-4000-8000-000000000101'
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-t2-floor-cycle-drilldown',
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedNodeIds: ['t2-residential-standard-floor-structure-rhythm-v1:floor-cycles'],
        plannedStartDate: '2027-08-19',
        projectPlannedEndDate: '2028-03-17',
        scope: { building_object_id: 'building-1' },
        attachUnderRowId: parentTaskId,
        generationDepth: 'process',
        includeActivitySteps: false,
        drilldownMode: 'selected_children',
        drilldownGenerationLevel: 'process_detail',
        sourceParentTaskId: parentTaskId,
        drilldownParentContext: {
          parentTaskId,
          parentTitle: '1#楼主体结构标准层循环',
          plannedStartDate: '2027-08-19',
          plannedEndDate: '2028-03-17',
          currentLevel: 'master_control',
          standardFloorCount: 24,
          t2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
          cycleIndex: null,
          cycleCount: null,
          buildingLabel: '1#楼',
          executionPhase: 'superstructure_rhythm',
          executionLane: 'tower_1',
          sourceStandardWorkCode: 'RMP-04-01-02',
          sortOrder: 20,
        },
      },
    })

    expect(generated.rows).toHaveLength(24)
    expect(generated.rows.every((row) => row.values.wbs_node_type === 'process')).toBe(true)
    expect(generated.rows.every((row) => row.values.row_projection_mode === 'schedule_row')).toBe(true)
    expect(generated.rows.map((row) => row.values.title)).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/进场检验|大体积测温|后浇带|抗渗试压/),
    ]))
    expect(generated.rows[0]?.values).toEqual(expect.objectContaining({
      title: '1#楼标准层第01施工循环',
      planned_start_date: '2027-08-19',
    }))
    expect(generated.rows.at(-1)?.values).toEqual(expect.objectContaining({
      title: '1#楼标准层第24施工循环',
      planned_end_date: '2028-03-17',
    }))
    expect((generated as any).taskPlanRhythmAssetSummary).toEqual(expect.objectContaining({
      role: 'system_bootstrap',
      effectiveSource: 'system_bootstrap',
    }))
    expect((generated as any).taskPlanRhythmParentWindowFit).toEqual(expect.objectContaining({
      decision: 'controlled_compression_to_parent_boundary',
      cycleCount: 24,
    }))
    expect((generated as any).durationAssetConsumptionReceipts).toEqual([
      expect.objectContaining({
        consumer: 'task_plan_drilldown_rhythm',
        status: 'effective_applied',
        changedFields: expect.arrayContaining(['task_selection', 'duration', 'dates', 'dependency']),
      }),
    ])
    expect((generated as any).durationAssetConsumptionSummary).toEqual(expect.objectContaining({
      effectiveAppliedCount: 1,
      blockedByConflictCount: 0,
    }))
    expect(generated.rows.every((row) => (
      (row.values.standard_task_metadata as any)?.taskStructureGovernance?.pipeline
        === 'wbs_task_structure_governance_pipeline'
    ))).toBe(true)
    expect(generated.rows.slice(1).every((row) => row.predecessorDependencies.every((dependency) => (
      (dependency as any).dependencyRuleEvidence?.relationLayerKey === 'same_parent_internal_flow'
    )))).toBe(true)
    expect(generated.rowLimit).toBe(80)
  }, 30_000)

  it('blocks a T2 drilldown when the parent window is shorter than the governed P20 minimum', async () => {
    const parentTaskId = '00000000-0000-4000-8000-000000000101'
    await expect(generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-t2-short-parent-conflict',
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
        selectedNodeIds: ['t2-residential-standard-floor-structure-rhythm-v1:floor-cycles'],
        scope: { building_object_id: 'building-1' },
        attachUnderRowId: parentTaskId,
        drilldownMode: 'selected_children',
        drilldownGenerationLevel: 'process_detail',
        drilldownParentContext: {
          parentTaskId,
          parentTitle: '1#楼主体结构标准层循环',
          plannedStartDate: '2027-08-19',
          plannedEndDate: '2027-10-31',
          currentLevel: 'master_control',
          standardFloorCount: 24,
          t2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
          cycleIndex: null,
          cycleCount: null,
          buildingLabel: '1#楼',
          executionPhase: 'superstructure_rhythm',
          executionLane: 'tower_1',
          sourceStandardWorkCode: 'RMP-04-01-02',
          sortOrder: 20,
        },
      },
    })).rejects.toMatchObject({
      code: 'TASK_PLAN_DRILLDOWN_PARENT_WINDOW_CONFLICT',
      statusCode: 422,
      details: expect.objectContaining({
        decision: 'blocked_by_minimum_rhythm_conflict',
        minimumRequiredProductionDays: 120,
        mutationBoundary: 'rejected_before_task_or_dependency_write',
        assetConsumptionReceipts: [expect.objectContaining({ status: 'blocked_by_conflict' })],
      }),
    })
  }, 30_000)

  it('rejects an attached drilldown that would materialize more than 80 schedule rows', async () => {
    await expect(generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-task-drilldown-row-limit',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          buildings: Array.from({ length: 41 }, (_value, index) => `building-${index + 1}`),
        },
        attachUnderRowId: '00000000-0000-4000-8000-000000000101',
        generationDepth: 'process',
        drilldownMode: 'selected_children',
        drilldownGenerationLevel: 'process_detail',
      },
    })).rejects.toMatchObject({
      code: 'TASK_PLAN_DRILLDOWN_ROW_LIMIT_EXCEEDED',
      statusCode: 413,
      details: expect.objectContaining({ rowLimit: 80 }),
    })
  }, 30_000)

  it('records v1.4.22.5 runtime consumer evidence for WBS template generation artifacts', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const result = await recordWbsTemplateGenerationRuntimeConsumption({
      queryExec,
      projectId: 'project-1',
      generation: {
        generationBatchId: 'batch-1',
        templateId: 'tpl-specialty',
        templateIds: ['tpl-specialty', 'tpl-core'],
        generationDepth: 'process',
        rows: [],
      },
      observedAt: '2026-06-15T12:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'special_work_duration_seed',
          publicationKey: 'duration_learning_runtime:special_work_duration_seed:special-v9',
          publicationStatus: 'published',
          observationContext: { artifactKey: 'tpl-specialty' },
        },
        {
          assetKey: 'wbs_reference_days',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:reference-v9',
          publicationStatus: 'runtime_published',
          observationContext: { artifactKey: 'tpl-specialty' },
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'duration_learning_runtime:dependency_rule_candidate:dependency-v9',
          publicationStatus: 'canary',
          observationContext: { artifactKey: 'dependency-v9' },
        },
        {
          assetKey: 'forecast_confidence_weight',
          publicationKey: 'forecast_confidence_weight_runtime:weight-v9',
          publicationStatus: 'published',
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'runtime_consumer_observations_recorded',
      recordedCount: 3,
      blockedCount: 0,
      reasons: [],
    }))
    expect(result.runtimeCallResult).toEqual(expect.objectContaining({
      status: 'runtime_consumer_runtime_call_recorded',
      canPersist: true,
    }))
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'special_work_duration_seed',
        'duration_learning_runtime:special_work_duration_seed:special-v9',
        'wbsTemplateGenerationService',
        'wbs_template_generation',
      ],
      [
        'wbs_reference_days',
        'duration_learning_runtime:wbs_reference_days:reference-v9',
        'wbsTemplateGenerationService',
        'wbs_template_generation',
      ],
      [
        'dependency_rule_candidate',
        'duration_learning_runtime:dependency_rule_candidate:dependency-v9',
        'wbsTemplateGenerationService',
        'wbs_template_generation',
      ],
    ])
  })

  it('records runtime consumer evidence from generateWbsTemplateRows when published artifacts are consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-runtime-consumption',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
      runtimeConsumerObservedAt: '2026-06-15T12:00:00.000Z',
      runtimeArtifactPublications: [
        {
          assetKey: 'special_work_duration_seed',
          publicationKey: 'duration_learning_runtime:special_work_duration_seed:special-v9',
          publicationStatus: 'published',
          observationContext: { artifactKey: 'tpl-specialty' },
        },
        {
          assetKey: 'wbs_reference_days',
          publicationKey: 'duration_learning_runtime:wbs_reference_days:reference-v9',
          publicationStatus: 'runtime_published',
          observationContext: { artifactKey: 'tpl-specialty' },
        },
        {
          assetKey: 'dependency_rule_candidate',
          publicationKey: 'duration_learning_runtime:dependency_rule_candidate:dependency-v9',
          publicationStatus: 'canary',
          observationContext: { artifactKey: 'dependency-v9' },
        },
        {
          assetKey: 'forecast_confidence_weight',
          publicationKey: 'forecast_confidence_weight_runtime:weight-v9',
          publicationStatus: 'published',
        },
      ],
    })

    expect(generated.generationBatchId).toBe('batch-runtime-consumption')
    expect(generated.rows.length).toBeGreaterThan(0)
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toEqual([
      [
        'special_work_duration_seed',
        'duration_learning_runtime:special_work_duration_seed:special-v9',
        'wbsTemplateGenerationService',
        'wbs_template_generation',
      ],
      [
        'wbs_reference_days',
        'duration_learning_runtime:wbs_reference_days:reference-v9',
        'wbsTemplateGenerationService',
        'wbs_template_generation',
      ],
      [
        'dependency_rule_candidate',
        'duration_learning_runtime:dependency_rule_candidate:dependency-v9',
        'wbsTemplateGenerationService',
        'wbs_template_generation',
      ],
    ])
  }, 30000)

  it('keeps non-UUID preview identities out of every duration learning UUID query', async () => {
    const placeholderProjectId = 'wizard-preview:general-civil'
    const companyId = '00000000-0000-4000-8000-000000000010'
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (params.some((value) => value === placeholderProjectId)) {
        throw new Error('preview placeholder reached a UUID-cast runtime query')
      }
      return [] as T[]
    }

    const generated = await generateWbsTemplateRowsRaw({
      projectId: placeholderProjectId,
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-non-uuid-preview-runtime',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-01-01'],
        plannedStartDate: '2026-06-01',
        projectFacts: {
          businessType: 'general_civil',
          projectTypeCode: 'civil_residential',
          companyId,
        },
        scope: { building_object_id: 'building-1' },
      },
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
    } as any)

    expect(generated.rows.length).toBeGreaterThan(0)
    expect(calls.some((call) => call.sql.includes('from public.projects'))).toBe(false)
    const publicationCalls = calls.filter((call) => call.sql.includes('from public.duration_learning_runtime_publications'))
    expect(publicationCalls).toHaveLength(3)
    expect(publicationCalls.every((call) => !call.params.includes(placeholderProjectId))).toBe(true)
    expect(publicationCalls.every((call) => call.params.includes(companyId))).toBe(true)
  }, 30000)

  it('keeps the project lookup and project-scoped duration overlays for a real UUID project', async () => {
    const projectId = '00000000-0000-4000-8000-000000000001'
    const companyId = '00000000-0000-4000-8000-000000000010'
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (sql.includes('from public.projects')) return [{ company_id: companyId }] as T[]
      return [] as T[]
    }

    await generateWbsTemplateRowsRaw({
      projectId,
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-real-project-runtime',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-01-01'],
        plannedStartDate: '2026-06-01',
        projectFacts: { businessType: 'general_civil', projectTypeCode: 'civil_residential' },
        scope: { building_object_id: 'building-1' },
      },
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
    } as any)

    expect(calls).toContainEqual(expect.objectContaining({
      sql: expect.stringContaining('from public.projects'),
      params: [projectId],
    }))
    const publicationCalls = calls.filter((call) => call.sql.includes('from public.duration_learning_runtime_publications'))
    expect(publicationCalls).toHaveLength(3)
    expect(publicationCalls.every((call) => call.params.includes(companyId))).toBe(true)
    expect(publicationCalls.every((call) => call.params.includes(projectId))).toBe(true)
  }, 30000)

  it('lets offline simulation disable runtime publication resolution outside the test environment', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'staging'
    dbServiceMocks.executeSQL.mockImplementation(async (sql?: string) => {
      if (String(sql).includes('duration_learning_runtime_publications') || String(sql).includes('from public.projects')) {
        throw new Error('offline simulation attempted a runtime database query')
      }
      return []
    })
    try {
      const generated = await generateWbsTemplateRowsRaw({
        projectId: 'wizard-preview:offline-simulation',
        surface: 'task_list',
        detailLevel: 'standard',
        diagnosticDurationSuggestionMode: 'fast_template',
        runtimePublicationResolution: 'disabled',
        operation: {
          type: 'template_generate',
          generationBatchId: 'batch-offline-simulation',
          templateId: CHINA_GB55032_TEMPLATE_ID,
          selectedNodeIds: ['01-01-01'],
          plannedStartDate: '2026-06-01',
          projectFacts: { businessType: 'general_civil', projectTypeCode: 'civil_residential' },
          scope: { building_object_id: 'building-1' },
        },
      } as any)

      expect(generated.rows.length).toBeGreaterThan(0)
      expect(dbServiceMocks.executeSQL).not.toHaveBeenCalled()
    } finally {
      if (previousNodeEnv == null) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
  }, 30000)

  it('applies a scoped WBS reference-days publication before schedule rows are generated', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (
        sql.includes('from public.duration_learning_runtime_publications')
        && params[0] === 'wbs_reference_days'
        && params[1] === 'china-facade-curtain-wall'
      ) {
        return [{
          publication_key: 'duration_learning_runtime:wbs_reference_days:facade-company-canary',
          asset_key: 'wbs_reference_days',
          artifact_key: 'china-facade-curtain-wall',
          scope_level: 'company',
          company_id: '00000000-0000-4000-8000-000000000010',
          project_id: null,
          industry_key: null,
          publication_stage: 'canary',
          runtime_payload: {
            nodes: [{ sourceId: 'FAC-01-01-01-P04', referenceDays: 99 }],
            durationDayBasis: 'construction_production_day',
          },
          previous_publication_key: 'duration_learning_runtime:wbs_reference_days:facade-v1',
          traffic_percent: 100,
          monitoring_status: 'collecting',
          published_at: '2026-07-17T00:00:00.000Z',
        }] as T[]
      }
      return [] as T[]
    }

    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-learned-reference-days',
        templateId: 'china-facade-curtain-wall',
        selectedNodeIds: ['FAC-01-01-01'],
        plannedStartDate: '2026-06-01',
        projectFacts: {
          businessType: 'commercial',
          projectTypeCode: 'commercial',
          companyId: '00000000-0000-4000-8000-000000000010',
        },
        scope: { building_object_id: 'building-1' },
      },
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
    } as any)

    const target = generated.rows.find((row) => (
      String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '')
        === 'FAC-01-01-01-P04'
    ))
    expect(calls.some((call) => (
      call.sql.includes('from public.duration_learning_runtime_publications')
      && call.params[0] === 'wbs_reference_days'
      && call.params[1] === 'china-facade-curtain-wall'
    ))).toBe(true)
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 4))).toContainEqual([
      'wbs_reference_days',
      'duration_learning_runtime:wbs_reference_days:facade-company-canary',
      'wbsTemplateGenerationService',
      'wbs_template_generation',
    ])
    expect(target?.values.standard_task_metadata).toEqual(expect.objectContaining({
      durationLearningPublicationKey: 'duration_learning_runtime:wbs_reference_days:facade-company-canary',
    }))
    expect(target?.values.duration_suggestion).toEqual(expect.objectContaining({
      durationOutputCode: 'plan_reference',
      planReferenceDays: 99,
    }))
    expect(target?.values.smart_reference_days).toBe(99)
  }, 30000)

  it('preserves both special-work and WBS-reference publication lineage when both affect one generated task', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (
        sql.includes('from public.duration_learning_runtime_publications')
        && params[1] === 'china-facade-curtain-wall'
      ) {
        if (params[0] === 'special_work_duration_seed') {
          return [{
            publication_key: 'duration_learning_runtime:special_work_duration_seed:facade-v2',
            asset_key: 'special_work_duration_seed',
            artifact_key: 'china-facade-curtain-wall',
            scope_level: 'company',
            company_id: '00000000-0000-4000-8000-000000000010',
            project_id: null,
            industry_key: null,
            publication_stage: 'stable',
            runtime_payload: {
              nodes: [{ sourceId: 'FAC-01-01-01-P04', p50Days: 77 }],
              durationDayBasis: 'construction_production_day',
            },
            traffic_percent: 100,
            monitoring_status: 'passed',
            published_at: '2026-07-17T00:00:00.000Z',
          }] as T[]
        }
        if (params[0] === 'wbs_reference_days') {
          return [{
            publication_key: 'duration_learning_runtime:wbs_reference_days:facade-v3',
            asset_key: 'wbs_reference_days',
            artifact_key: 'china-facade-curtain-wall',
            scope_level: 'company',
            company_id: '00000000-0000-4000-8000-000000000010',
            project_id: null,
            industry_key: null,
            publication_stage: 'stable',
            runtime_payload: {
              nodes: [{ sourceId: 'FAC-01-01-01-P04', referenceDays: 99 }],
              durationDayBasis: 'construction_production_day',
            },
            traffic_percent: 100,
            monitoring_status: 'passed',
            published_at: '2026-07-18T00:00:00.000Z',
          }] as T[]
        }
      }
      return [] as T[]
    }

    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-dual-duration-lineage',
        templateId: 'china-facade-curtain-wall',
        selectedNodeIds: ['FAC-01-01-01'],
        plannedStartDate: '2026-06-01',
        projectFacts: {
          companyId: '00000000-0000-4000-8000-000000000010',
          businessType: 'commercial',
          projectTypeCode: 'commercial',
        },
        scope: { building_object_id: 'building-1' },
      },
      runtimeConsumerObservationQueryExec: queryExec,
    } as any)

    const target = generated.rows.find((row) => (
      String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '')
        === 'FAC-01-01-01-P04'
    ))
    const metadata = target?.values.standard_task_metadata as Record<string, unknown> | undefined

    expect(metadata?.durationLearningConsumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetKey: 'special_work_duration_seed',
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:facade-v2',
        artifactKey: 'china-facade-curtain-wall',
        durationDayBasis: 'construction_production_day',
        appliedDurationDays: 77,
      }),
      expect.objectContaining({
        assetKey: 'wbs_reference_days',
        publicationKey: 'duration_learning_runtime:wbs_reference_days:facade-v3',
        artifactKey: 'china-facade-curtain-wall',
        durationDayBasis: 'construction_production_day',
        appliedDurationDays: 99,
      }),
    ]))
    expect(buildSpecialWorkDurationCandidateNodes(generated.rows)).toContainEqual(expect.objectContaining({
      sourceId: 'FAC-01-01-01-P04',
      p50Days: 77,
      runtimePublicationKey: 'duration_learning_runtime:special_work_duration_seed:facade-v2',
    }))
  }, 30000)

  it('carries a consumed special-work publication from generated rows into learning candidate nodes', async () => {
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (
        sql.includes('from public.duration_learning_runtime_publications')
        && params[0] === 'special_work_duration_seed'
        && params[1] === 'china-facade-curtain-wall'
      ) {
        return [{
          publication_key: 'duration_learning_runtime:special_work_duration_seed:facade-company-canary',
          asset_key: 'special_work_duration_seed',
          artifact_key: 'china-facade-curtain-wall',
          scope_level: 'company',
          company_id: '00000000-0000-4000-8000-000000000010',
          project_id: null,
          industry_key: null,
          publication_stage: 'canary',
          runtime_payload: {
            nodes: [{ sourceId: 'FAC-01-01-01-P04', p50Days: 77, p80Days: 93 }],
            durationDayBasis: 'construction_production_day',
          },
          previous_publication_key: null,
          traffic_percent: 100,
          monitoring_status: 'collecting',
          published_at: '2026-07-17T00:00:00.000Z',
        }] as T[]
      }
      return [] as T[]
    }

    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-learned-special-work',
        templateId: 'china-facade-curtain-wall',
        selectedNodeIds: ['FAC-01-01-01'],
        plannedStartDate: '2026-06-01',
        projectFacts: {
          businessType: 'commercial',
          projectTypeCode: 'commercial',
          companyId: '00000000-0000-4000-8000-000000000010',
        },
        scope: { building_object_id: 'building-1' },
      },
      runtimeConsumerObservationQueryExec: queryExec,
    } as any)

    const candidate = buildSpecialWorkDurationCandidateNodes(generated.rows)
      .find((node) => node.sourceId === 'FAC-01-01-01-P04')

    expect(candidate).toEqual(expect.objectContaining({
      sourceId: 'FAC-01-01-01-P04',
      stableCode: 'FAC-01-01-01-P04',
      p50Days: 77,
      durationDayBasis: 'construction_production_day',
      runtimePublicationKey: 'duration_learning_runtime:special_work_duration_seed:facade-company-canary',
    }))
  }, 30000)

  it('applies a published dependency rule to the matching generated scope without cartesian edges', async () => {
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      if (
        sql.includes('from public.duration_learning_runtime_publications')
        && params[0] === 'dependency_rule_candidate'
      ) {
        return [{
          publication_key: 'duration_learning_runtime:dependency_rule_candidate:facade-p04-p05',
          asset_key: 'dependency_rule_candidate',
          artifact_key: 'facade-p04-p05',
          scope_level: 'project',
          company_id: '00000000-0000-4000-8000-000000000010',
          project_id: '00000000-0000-4000-8000-000000000001',
          industry_key: null,
          publication_stage: 'stable',
          runtime_payload: {
            predecessorCode: 'FAC-01-01-01-P04',
            successorCode: 'FAC-01-01-01-P05',
            dependencyType: 'SS',
            lagDays: 13,
            scopeRule: 'same_scope_instance',
          },
          previous_publication_key: null,
          traffic_percent: 100,
          monitoring_status: 'passed',
          published_at: '2026-07-17T00:00:00.000Z',
        }] as T[]
      }
      return [] as T[]
    }

    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'benchmark_plan_reference',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-learned-dependency',
        templateId: 'china-facade-curtain-wall',
        selectedNodeIds: ['FAC-01-01-01'],
        plannedStartDate: '2026-06-01',
        projectFacts: {
          businessType: 'commercial',
          projectTypeCode: 'commercial',
          companyId: '00000000-0000-4000-8000-000000000010',
        },
        scope: {
          scope_expansion_mode: 'explicit',
          scope_combos: [
            { building_object_id: 'building-1' },
            { building_object_id: 'building-2' },
          ],
        },
      },
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
    } as any)

    const rowsByStableCode = new Map<string, typeof generated.rows>()
    for (const row of generated.rows) {
      const stableCode = String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '')
      rowsByStableCode.set(stableCode, [...(rowsByStableCode.get(stableCode) ?? []), row])
    }
    const predecessors = rowsByStableCode.get('FAC-01-01-01-P04') ?? []
    const successors = rowsByStableCode.get('FAC-01-01-01-P05') ?? []
    expect(predecessors).toHaveLength(2)
    expect(successors).toHaveLength(2)
    for (const successor of successors) {
      const learned = successor.predecessorDependencies.filter((dependency) => (
        dependency.source === 'duration_learning_runtime_publication'
      ))
      expect(learned).toHaveLength(1)
      expect(learned[0]).toEqual(expect.objectContaining({
        dependencyType: 'SS',
        lagDays: 13,
        publicationKey: 'duration_learning_runtime:dependency_rule_candidate:facade-p04-p05',
        artifactKey: 'facade-p04-p05',
      }))
      const predecessor = predecessors.find((row) => row.clientRowId === learned[0]?.clientRowId)
      expect(predecessor?.values.building_object_id).toBe(successor.values.building_object_id)
    }
    expect(callsForTable(calls, 'runtime_consumer_observations').map((call) => call.params.slice(0, 2))).toContainEqual([
      'dependency_rule_candidate',
      'duration_learning_runtime:dependency_rule_candidate:facade-p04-p05',
    ])
  }, 30000)

  it('keeps display semantics separate from duration and dependency semantics', () => {
    expect(inferDurationContributionMode({ name: 'document archive', planItemKind: 'document_task' })).toBe('record_only')
    expect(inferDurationContributionMode({ name: 'quantity measurement report', planItemKind: 'commercial_task' })).toBe('record_only')
    expect(inferDurationContributionMode({ name: 'quality inspection', planItemKind: 'inspection_task' })).toBe('quality_gate')
    expect(inferDurationContributionMode({ name: 'handover milestone', planItemKind: 'linked_projection' })).toBe('handover_marker')
    expect(inferDurationContributionMode({ name: 'wall installation', planItemKind: 'work_task' })).toBe('duration_bearing')
    expect(inferDurationContributionMode({ name: 'document record closeout' })).toBe('record_only')
    expect(inferDurationContributionMode({ name: 'acceptance handover record' })).toBe('handover_marker')
    expect(inferDurationContributionMode({ name: '管道试压和渗漏整改复验' })).toBe('duration_bearing')
    expect(inferDurationContributionMode({ name: '系统联动调试' })).toBe('duration_bearing')
    expect(inferDurationContributionMode({ name: '试运行记录归档' })).toBe('record_only')
  })

  it('separates physical execution nature from duration contribution mode', () => {
    expect(inferExecutionNature({ name: 'structural concrete pouring', durationContributionMode: 'duration_bearing' })).toBe('physical_work')
    expect(inferExecutionNature({ name: 'installation method statement approval', durationContributionMode: 'duration_bearing' })).toBe('management_action')
    expect(inferExecutionNature({ name: 'third party inspection test', durationContributionMode: 'duration_bearing' })).toBe('inspection_test')
    expect(inferExecutionNature({ name: 'settlement monitoring observation', durationContributionMode: 'duration_bearing' })).toBe('monitoring_wait')
    expect(inferExecutionNature({ name: 'document archive', planItemKind: 'document_task' })).toBe('document_record')
    expect(inferExecutionNature({ name: 'dangerous work special plan', planItemKind: 'safety_control' })).toBe('management_action')
    expect(inferExecutionNature({ name: 'handover milestone', planItemKind: 'linked_projection' })).toBe('handover_milestone')
    expect(inferExecutionNature({ name: 'installation quality inspection', planItemKind: 'inspection_task', durationContributionMode: 'quality_gate' })).toBe('inspection_test')
    expect(inferExecutionNature({ name: 'operation surface readiness confirmation' })).toBe('technical_preparation')
    expect(inferExecutionNature({ name: 'water pressure test' })).toBe('physical_work')
    expect(inferExecutionNature({ name: 'handover document record' })).toBe('document_record')
  })

  it('keeps physical execution separate from cross-cutting control roles', () => {
    expect(inferExecutionNature({ name: 'high formwork erection', planItemKind: 'safety_control' })).toBe('physical_work')
    expect(inferControlRoles({
      name: 'high formwork erection',
      metadata: {
        safetyControlRole: 'hazardous_work',
        qualityControlRole: 'none',
      },
      packType: 'danger_control',
      planItemKind: 'safety_control',
      executionNature: 'physical_work',
    })).toEqual(expect.objectContaining({
      safetyControlRole: 'hazardous_work',
      qualityControlRole: 'none',
    }))

    expect(inferControlRoles({
      name: 'commercial measurement report',
      planItemKind: 'commercial_task',
      relationRole: 'commercial',
    })).toEqual(expect.objectContaining({
      commercialControlRole: 'quantity_measurement',
      documentEvidenceRole: 'commercial_document',
    }))

    expect(inferControlRoles({
      name: 'hidden acceptance record',
      metadata: {
        qualityControlRole: 'hidden_control',
        safetyControlRole: 'none',
        inspectionAcceptanceRole: 'hidden_acceptance',
      },
    })).toEqual(expect.objectContaining({
      qualityControlRole: 'hidden_control',
      safetyControlRole: 'none',
      inspectionAcceptanceRole: 'hidden_acceptance',
    }))

    expect(inferControlRoles({
      name: 'special plan approval',
      packType: 'danger_control',
    })).toEqual(expect.objectContaining({
      qualityControlRole: 'none',
      safetyControlRole: 'special_plan_control',
      documentEvidenceRole: 'approval_document',
    }))

    expect(inferControlRoles({
      name: 'handover signoff',
      metadata: {
        documentEvidenceRole: 'handover_document',
        managementControlRole: 'handover_control',
      },
    })).toEqual(expect.objectContaining({
      documentEvidenceRole: 'handover_document',
      managementControlRole: 'handover_control',
    }))
  })

  it('keeps the China GB55032 seed executable down to process rows', () => {
    const result = validateChinaGb50300Seed()

    expect(result.ok).toBe(true)
    expect(result.divisionCount).toBe(10)
    expect(result.subDivisionCount).toBe(99)
    expect(result.itemWorkCount).toBe(609)
    expect(result.processCount).toBeGreaterThanOrEqual(4_600)
    expect(result.activityStepCount).toBeGreaterThan(result.processCount)
    expect(result.reviewNeededCount).toBe(0)
    expect(result.webVerifiedFalseCount).toBe(0)
    expect(result.issues.filter((issue) => issue.code === 'CATALOG_REFERENCE_FIELD_GROUP_MISMATCH')).toEqual([])
    expect(result.issues.filter((issue) => issue.code === 'SPECIAL_ACCEPTANCE_EXECUTION_REFERENCE_MISSING' && issue.severity === 'error')).toEqual([])
    expect(result.disciplineProcessCount).toBe(result.processCount)
    expect(result.genericFallbackProcessCount).toBe(0)
    expect(result.disciplineActivityStepCount).toBe(result.activityStepCount)
    expect(result.genericActivityStepCount).toBe(0)
    expect(result.uniqueProcessNameCount).toBeGreaterThanOrEqual(1900)
    expect(result.uniqueActivityStepNameCount).toBeGreaterThanOrEqual(7300)
    expect(result.catalogGroupCounts).toEqual(expect.objectContaining({
      core_quality: 1,
      site_management: 1,
      danger_control: 1,
      quality_responsibility: 1,
      project_milestone: 1,
      document_commercial_support: 1,
      specialty: expect.any(Number),
    }))
    expect(result.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0)

    const nodes = flattenChinaTemplateCatalog()
    const itemProcessCounts = nodes
      .filter((node) => node.categoryType === 'item_work')
      .map((node) => (node.children ?? []).filter((child) => child.categoryType === 'process').length)
    const processStepCounts = nodes
      .filter((node) => node.categoryType === 'process')
      .map((node) => (node.children ?? []).filter((child) => child.categoryType === 'activity_step').length)
    expect(Math.min(...itemProcessCounts)).toBeGreaterThanOrEqual(6)
    expect(itemProcessCounts.filter((count) => count > 1)).toHaveLength(609)
    expect(Math.min(...processStepCounts)).toBeGreaterThanOrEqual(1)
    const processStepCountViolations = nodes
      .filter((node) => node.categoryType === 'process')
      .filter((node) => {
        const mode = String((node.metadata as Record<string, unknown> | undefined)?.durationContributionMode ?? 'duration_bearing')
        const stepCount = (node.children ?? []).filter((child) => child.categoryType === 'activity_step').length
        return stepCount < (mode === 'duration_bearing' ? 2 : 1)
      })
    expect(processStepCountViolations).toHaveLength(0)

    const processNamesOfCode = (stableCode: string) => {
      const item = nodes.find((node) => node.categoryType === 'item_work' && node.stableCode === stableCode)
      return (item?.children ?? []).filter((node) => node.categoryType === 'process').map((node) => node.name)
    }
    for (const stableCode of [
      '01-01-05',
      '01-01-09',
      '03-05-01',
      '03-10-01',
      '05-01-09',
      '05-03-01',
      '05-01-05',
      '08-15-02',
    ]) {
      expect(processNamesOfCode(stableCode).length).toBeGreaterThan(0)
    }

    const nonBearingAdministrativeProcessModes = nodes
      .filter((node) => node.categoryType === 'process')
      .filter((node) => /参数确认|测量放线|进场复验|检测|复核|验收复核|记录|归档|资料|方案|审批/.test(node.name))
      .filter((node) => ['embedded_check', 'external_wait', 'quality_gate', 'record_only', 'handover_marker'].includes(String((node.metadata as Record<string, unknown> | undefined)?.durationContributionMode ?? '')))
      .map((node) => (node.metadata as Record<string, unknown> | undefined)?.durationContributionMode)

    expect(nonBearingAdministrativeProcessModes.length).toBeGreaterThan(0)
    expect(nonBearingAdministrativeProcessModes.every((mode) => mode && mode !== 'duration_bearing')).toBe(true)

    const repeatedMechanicalProcessNames = nodes
      .filter((node) => node.categoryType === 'process')
      .map((node) => node.name)
      .filter((name) => /系统系统|安装安装|给水给水|排水排水|专业施工专业施工|记录记录/.test(name))

    expect(repeatedMechanicalProcessNames).toEqual([])

    const exactItemNameProcessNames = nodes
      .filter((node) => node.categoryType === 'item_work')
      .flatMap((item) => (item.children ?? [])
        .filter((child) => child.categoryType === 'process' && child.name === item.name)
        .map((child) => `${item.stableCode}:${child.name}`))

    expect(exactItemNameProcessNames).toEqual([])

    expect(validateChinaGb50300Seed({ strict: true }).ok).toBe(true)
  }, 30000)

  it('keeps default template generation at itemPack-level planning rows', async () => {
    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-1',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01', '02-01-02', '02-01-03'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    expect(generated.rows.length).toBeGreaterThan(0)
    expect(generated.generationDepth).toBe('item_work')
    expect(generated.rows[0]).toEqual(expect.objectContaining({
      clientRowId: expect.stringContaining('batch-1'),
      parentClientRowId: null,
    }))
    expect(generated.rows.map((row) => row.values.wbs_node_type)).toEqual(expect.arrayContaining(['item_work']))
    expect(generated.rows.map((row) => row.values.wbs_node_type)).not.toContain('process')
    expect(generated.rows.map((row) => row.values.wbs_node_type)).not.toContain('activity_step')
    expect(generated.rows.every((row) => row.values.building_object_id === 'building-1')).toBe(true)
    expect(generated.rows.every((row) => row.values.template_id === CHINA_GB55032_TEMPLATE_ID)).toBe(true)

    const createOperations = buildTemplateGenerateCreateOperations(generated.rows)
      .filter((operation) => operation.type === 'create_row')
    expect(createOperations).toHaveLength(generated.rows.length)
    expect(createOperations.every((operation) => operation.type === 'create_row')).toBe(true)
  }, 30000)

  it('classifies starting-line generated rows into history, in-progress and future stages', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-starting-line-main-structure',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-gb55032-2022-outdoor'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-02-01', '01-03-01', '02-01-01', '02-01-03', '02-02-01', '03-02-01', '07-05'],
          'china-gb55032-2022-outdoor': ['OUT-02-01-01'],
        },
        plannedStartDate: '2026-03-01',
        scope: {
          phase_object_id: 'phase-starting-line',
          section_object_id: 'section-starting-line',
          building_object_id: 'building-starting-line',
          basement_object_id: 'basement-starting-line',
          physical_zone_object_id: 'outdoor-starting-line',
          project_type_code: 'civil_residential',
          totalAreaM2: 165000,
          buildingCount: 4,
          highestBuildingFloorCount: 32,
          standardFloorCount: 29,
          basementLevelCount: 2,
          siteAreaM2: 26000,
          towerCraneCount: 4,
        },
        projectFacts: {
          mode: 'starting_line',
          businessType: 'general_civil',
          businessSubtype: 'civil_residential',
          projectTypeCode: 'civil_residential',
          methodVariantCodes: ['cast_in_situ'],
          actualStartDate: '2026-03-01',
          onboardingSubstage: 'main_structure',
          onboardingPhaseProgress: {
            'building-starting-line': { buildingName: '1#楼', floor: 'L12' },
          },
          onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance', 'basement_structure_acceptance'],
          totalAreaM2: 165000,
          aboveGroundAreaM2: 124000,
          basementAreaM2: 41000,
          siteAreaM2: 26000,
          buildingCount: 4,
          highestBuildingFloorCount: 32,
          standardFloorCount: 29,
          basementLevelCount: 2,
          towerCraneCount: 4,
          hasCivilDefense: true,
        },
      },
      onboardingSubstage: 'main_structure',
      duplicatePolicy: 'preserve_historical_skip_future',
    })

    expect(generated.onboardingSummary).toEqual(expect.objectContaining({
      history: expect.any(Number),
      in_progress: expect.any(Number),
      future: expect.any(Number),
    }))
    expect(generated.onboardingSummary?.history).toBeGreaterThan(0)
    expect(generated.onboardingSummary?.in_progress).toBeGreaterThan(0)
    expect(generated.onboardingSummary?.future).toBeGreaterThan(0)

    const historyRows = generated.rows.filter((row) => row.values.onboarding_stage_classification === 'history')
    const inProgressRows = generated.rows.filter((row) => row.values.onboarding_stage_classification === 'in_progress')
    const futureRows = generated.rows.filter((row) => row.values.onboarding_stage_classification === 'future')
    expect(historyRows.every((row) => row.values.is_historical === true)).toBe(true)
    expect(inProgressRows.some((row) => row.values.execution_phase === 'superstructure_rhythm')).toBe(true)
    expect(futureRows.some((row) => !['foundation_pit_pile', 'basement_structure', 'basement_waterproof_handover', 'superstructure_rhythm'].includes(String(row.values.execution_phase ?? '')))).toBe(true)
  }, 30000)

  it('reports target end feasibility without compressing generated schedule dates', async () => {
    const natural = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-target-natural',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01', '02-01-02', '02-01-03'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })
    const naturalEndDate = natural.targetFeasibility?.naturalEndDate
      ?? natural.rows.reduce((latest, row) => (
        String(row.values.planned_end_date ?? '') > latest ? String(row.values.planned_end_date) : latest
      ), '')
    expect(naturalEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const targetEndDate = '2026-06-01'
    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-target-feasibility',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01', '02-01-02', '02-01-03'],
        plannedStartDate: '2026-06-01',
        constructionCalendar: IDENTIFIED_TEST_CONSTRUCTION_CALENDAR,
        clientContext: {
          projectPlannedEndDate: targetEndDate,
          targetConstraintMode: 'compare_only',
        },
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    expect(generated.rows.map((row) => row.values.planned_end_date)).toEqual(
      natural.rows.map((row) => row.values.planned_end_date),
    )
    expect(generated.targetFeasibility).toEqual(expect.objectContaining({
      mode: 'compare_only',
      targetEndDate,
      naturalEndDate,
      verdict: expect.stringMatching(/tight|overshoot|requires_scope_change|infeasible/),
    }))
    expect(generated.targetFeasibility?.overshootDays).toBeGreaterThan(0)
    expect(generated.targetFeasibility?.strategies.map((strategy) => strategy.type)).toEqual(expect.arrayContaining([
      'fast_track',
      'crashing',
      'scope_reduction',
    ]))
    expect(generated.governanceWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'TARGET_END_OVERSHOOT',
        severity: 'warning',
        details: expect.objectContaining({
          targetEndDate,
          naturalEndDate,
          mode: 'compare_only',
        }),
      }),
    ]))
  }, 30000)

  it('records the real WBS generation runtime call without fabricating observations when no published artifact was consumed', async () => {
    const { calls, queryExec } = createRecordingQueryExec()

    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-runtime-call-only',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
      runtimeConsumerObservedAt: '2026-06-15T12:00:00.000Z',
      runtimeArtifactPublications: [],
    })

    expect(generated.generationBatchId).toBe('batch-runtime-call-only')
    expect(callsForTable(calls, 'runtime_consumer_runtime_calls')).toHaveLength(1)
    const runtimeCall = callsForTable(calls, 'runtime_consumer_runtime_calls')[0]
    expect(runtimeCall.params.slice(0, 3)).toEqual([
      'wbsTemplateGenerationService',
      'wbsTemplateGenerationService:generateWbsTemplateRows',
      'called',
    ])
    expect(parseJsonParam(runtimeCall, 3)).toEqual(expect.objectContaining({
      projectId: '00000000-0000-4000-8000-000000000001',
      generationBatchId: 'batch-runtime-call-only',
      runtimeAssetMode: 'no_published_artifact',
      runtimeArtifactCount: 0,
    }))
    expect(parseJsonParam(runtimeCall, 4)).toEqual([
      expect.stringContaining('wbs_template_generation:00000000-0000-4000-8000-000000000001:batch-runtime-call-only:'),
    ])
    expect(runtimeCall.params.slice(5)).toEqual([
      false,
      false,
      '2026-06-15T12:00:00.000Z',
    ])
    expect(callsForTable(calls, 'runtime_consumer_observations')).toHaveLength(0)
  }, 30000)

  it('evaluates target feasibility after final rollups so natural end matches generated rows', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-target-final-rollup-natural-end',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-industrial-cleanroom-specialty'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-02-01', '02-01-01', '02-01-03'],
          'china-industrial-cleanroom-specialty': ['ICR-01-01-01', 'ICR-02-01-01', 'ICR-03-01-01', 'ICR-04-01-01', 'ICR-05-01-05'],
        },
        plannedStartDate: '2026-09-01',
        clientContext: {
          projectPlannedEndDate: '2026-12-16',
          targetConstraintMode: 'compression_preview',
        },
        scope: {
          phase_object_id: 'phase-industrial-cleanroom',
          section_object_id: 'section-industrial-cleanroom',
          building_object_id: 'building-industrial-cleanroom',
          physical_zone_object_id: 'zone-industrial-cleanroom',
          project_type_code: 'industrial_cleanroom',
          totalAreaM2: 120000,
          buildingCount: 4,
          highestBuildingFloorCount: 6,
          siteAreaM2: 60000,
          maxSpanM: 36,
          supportHeightM: 10,
        },
        projectFacts: {
          businessType: 'industrial',
          businessSubtype: 'industrial_cleanroom',
          projectTypeCode: 'industrial_cleanroom',
          methodVariantCodes: ['steel_frame'],
          totalAreaM2: 120000,
          aboveGroundAreaM2: 105000,
          basementAreaM2: 15000,
          siteAreaM2: 60000,
          buildingCount: 4,
          highestBuildingFloorCount: 6,
          cleanroom_grade: 1000,
          process_pure_water: 20,
          voc_treatment: true,
          chemical_waste: 1,
          maxSpanM: 36,
          supportHeightM: 10,
        },
      },
    })

    const latestGeneratedEnd = generated.rows
      .map((row) => String(row.values.planned_end_date ?? '').slice(0, 10))
      .filter(Boolean)
      .sort()
      .at(-1)

    expect(generated.targetFeasibility?.naturalEndDate).toBe(latestGeneratedEnd)
  }, 30000)

  it('builds a preview-only acceleration proposal without mutating the natural schedule', async () => {
    const natural = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-target-proposal-natural',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01', '02-01-02', '02-01-03'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
        operation: {
          type: 'template_generate',
          generationBatchId: 'batch-target-proposal',
          templateId: CHINA_GB55032_TEMPLATE_ID,
          selectedNodeIds: ['02-01-01', '02-01-02', '02-01-03'],
        plannedStartDate: '2026-06-01',
        constructionCalendar: IDENTIFIED_TEST_CONSTRUCTION_CALENDAR,
        clientContext: {
          projectPlannedEndDate: '2026-06-01',
          targetConstraintMode: 'compression_preview',
        },
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    expect(generated.rows.map((row) => row.values.planned_start_date)).toEqual(
      natural.rows.map((row) => row.values.planned_start_date),
    )
    expect(generated.rows.map((row) => row.values.planned_end_date)).toEqual(
      natural.rows.map((row) => row.values.planned_end_date),
    )

    const proposal = generated.targetFeasibility?.accelerationProposal
    expect(proposal).toEqual(expect.objectContaining({
      mode: 'preview_only',
      source: 'target_end_compression',
      targetEndDate: '2026-06-01',
      naturalEndDate: generated.targetFeasibility?.naturalEndDate,
      overshootDays: generated.targetFeasibility?.overshootDays,
    }))
    expect(proposal?.totalRecoverDays).toBeGreaterThan(0)
    expect(proposal?.remainingGapDays).toBeGreaterThanOrEqual(0)
    expect(proposal?.actions.map((action) => action.type)).toEqual(expect.arrayContaining([
      'fast_track',
      'crashing',
      'scope_reduction',
    ]))

    const fastTrack = proposal?.actions.find((action) => action.type === 'fast_track')
    expect(fastTrack?.recoverDays).toEqual(expect.any(Number))
    expect(fastTrack?.dependencyAdjustments.length).toBeGreaterThanOrEqual(0)
    if (fastTrack?.dependencyAdjustments.length) {
      expect(fastTrack.dependencyAdjustments).toEqual(expect.arrayContaining([
        expect.objectContaining({
          fromDependencyType: expect.any(String),
          toDependencyType: 'SS',
          lagDaysBefore: expect.any(Number),
          lagDaysAfter: expect.any(Number),
        }),
      ]))
    }

    const crashing = proposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.recoverDays).toEqual(expect.any(Number))
    expect(crashing?.durationAdjustments.length).toBeGreaterThanOrEqual(0)
    if (crashing?.durationAdjustments.length) {
      expect(crashing.durationAdjustments).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: expect.any(String),
          currentDurationDays: expect.any(Number),
          proposedDurationDays: expect.any(Number),
          minDurationDays: expect.any(Number),
          recoverDays: expect.any(Number),
        }),
      ]))
    }
    expect(crashing?.durationAdjustments?.every((adjustment) => adjustment.proposedDurationDays >= adjustment.minDurationDays)).toBe(true)

    expect(proposal?.protectedConstraints).toEqual(expect.any(Array))
  }, 30000)

  it('prioritizes explicit workflow dependencies and duration-bearing rows in acceleration proposals', async () => {
    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-target-proposal-priority',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-01-01'],
        plannedStartDate: '2026-06-01',
        constructionCalendar: IDENTIFIED_TEST_CONSTRUCTION_CALENDAR,
        clientContext: {
          projectPlannedEndDate: '2026-06-01',
          targetConstraintMode: 'compression_preview',
        },
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const proposal = generated.targetFeasibility?.accelerationProposal
    const fastTrack = proposal?.actions.find((action) => action.type === 'fast_track')
    const crashing = proposal?.actions.find((action) => action.type === 'crashing')
    expect(fastTrack).toBeTruthy()
    expect(crashing).toBeTruthy()

    const rowById = new Map(generated.rows.map((row) => [row.clientRowId, row]))
    for (const adjustment of fastTrack?.dependencyAdjustments ?? []) {
      const successor = rowById.get(adjustment.successorClientRowId)
      const original = successor?.predecessorDependencies.find((dependency) => dependency.clientRowId === adjustment.predecessorClientRowId)
      expect(original?.source).toMatch(/sibling_sequence|cross_item_workflow|dependency_intent_template/)
      expect(adjustment.lagDaysAfter).toBeLessThanOrEqual(0)
    }

    for (const adjustment of crashing?.durationAdjustments ?? []) {
      const row = rowById.get(adjustment.clientRowId)
      const metadata = row?.values.standard_task_metadata as Record<string, unknown> | undefined
      expect(row?.values.duration_contribution_mode ?? metadata?.durationContributionMode).toBe('duration_bearing')
      expect(adjustment.proposedDurationDays).toBeGreaterThanOrEqual(adjustment.minDurationDays)
    }
  }, 30000)

  it('keeps target acceleration budgets conservative for critical resources, hard waits, season and project type', async () => {
    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-target-proposal-conservative',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-01-01', '02-01-01', '02-01-02', '02-01-03', '06-01-01', '07-01-01'],
        plannedStartDate: '2026-06-01',
        constructionCalendar: IDENTIFIED_TEST_CONSTRUCTION_CALENDAR,
        clientContext: {
          projectPlannedEndDate: '2026-06-01',
          targetConstraintMode: 'compression_preview',
        },
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'hospital',
          monthly_climate_signal: 'winter_restricted',
          weather_impact_bands: ['winter_wet_trade', 'rain_blocks_work'],
        },
      },
    })

    const feasibility = generated.targetFeasibility
    const proposal = feasibility?.accelerationProposal
    expect(feasibility).toBeTruthy()
    expect(proposal).toBeTruthy()

    const naturalStartDate = generated.rows
      .map((row) => String(row.values.planned_start_date ?? ''))
      .filter(Boolean)
      .sort()[0]
    const naturalDurationDays = durationDaysOf({
      values: {
        planned_start_date: naturalStartDate,
        planned_end_date: feasibility?.naturalEndDate,
      },
    })
    expect(feasibility?.recoverableDays).toBeLessThanOrEqual(Math.ceil(naturalDurationDays * 0.15))
    expect(proposal?.totalRecoverDays).toBeLessThanOrEqual(feasibility?.recoverableDays ?? 0)

    const rowById = new Map(generated.rows.map((row) => [row.clientRowId, row]))
    const protectedRowIds = new Set(proposal?.protectedConstraints.map((item) => item.clientRowId) ?? [])
    const crashing = proposal?.actions.find((action) => action.type === 'crashing')
    expect(crashing?.durationAdjustments.some((adjustment) => protectedRowIds.has(adjustment.clientRowId))).toBe(false)

    const crashResources = new Set<string>()
    for (const adjustment of crashing?.durationAdjustments ?? []) {
      const row = rowById.get(adjustment.clientRowId)
      const metadata = row?.values.standard_task_metadata as Record<string, unknown> | undefined
      const resourceProfile = metadata?.resourceProfile as Record<string, unknown> | undefined
      const resourceClass = String(resourceProfile?.resourceClass ?? resourceProfile?.resource_class ?? metadata?.executionLane ?? 'unknown')
      expect(crashResources.has(resourceClass)).toBe(false)
      crashResources.add(resourceClass)
    }

    const fastTrack = proposal?.actions.find((action) => action.type === 'fast_track')
    expect(proposal?.calculationBasis).toEqual(expect.objectContaining({
      projectTypeProfile: 'hospital_cleanroom_conservative',
      seasonalFactor: 0.8,
    }))
    expect(proposal?.calculationBasis?.totalRecoverCapRatio).toBeLessThanOrEqual(0.12)
    for (const adjustment of fastTrack?.dependencyAdjustments ?? []) {
      const overlapDays = Math.max(0, adjustment.lagDaysBefore - adjustment.lagDaysAfter)
      expect(overlapDays).toBeLessThanOrEqual(8)
    }
  }, 30000)

  it('limits acceleration commitments by project profile and only crashes critical candidates', async () => {
    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-target-proposal-critical-only',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-01-01', '02-01-01', '02-01-02', '02-01-03', '06-01-01', '07-01-01'],
        plannedStartDate: '2026-06-01',
        constructionCalendar: IDENTIFIED_TEST_CONSTRUCTION_CALENDAR,
        clientContext: {
          projectPlannedEndDate: '2026-06-01',
          targetConstraintMode: 'compression_preview',
        },
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'hospital',
          monthly_climate_signal: 'winter_restricted',
          weather_impact_bands: ['winter_wet_trade'],
        },
      },
    })

    const proposal = generated.targetFeasibility?.accelerationProposal
    expect(proposal?.calculationBasis).toEqual(expect.objectContaining({
      projectTypeProfile: 'hospital_cleanroom_conservative',
    }))
    expect(proposal?.calculationBasis?.totalRecoverCapRatio).toBeLessThanOrEqual(0.12)
    expect(proposal?.calculationBasis?.fastTrackBudgetDays).toBeLessThanOrEqual(
      Math.ceil((proposal?.calculationBasis?.naturalDurationDays ?? 0) * 0.027 * 0.8),
    )
    expect(proposal?.commitmentDisclaimer).toMatch(/模板和算法估算|现场资源到位|协同施工约束/)

    const rowById = new Map(generated.rows.map((row) => [row.clientRowId, row]))
    const crashing = proposal?.actions.find((action) => action.type === 'crashing')
    for (const adjustment of crashing?.durationAdjustments ?? []) {
      const row = rowById.get(adjustment.clientRowId)
      const metadata = row?.values.standard_task_metadata as Record<string, unknown> | undefined
      const isCritical = metadata?.criticalPathEligible === true
        || String(metadata?.criticalPathEligible ?? '').toLowerCase() === 'true'
        || row?.predecessorDependencies.some((dependency) => ['cross_item_workflow', 'dependency_intent_template'].includes(String(dependency.source ?? '')))
      expect(isCritical).toBe(true)
    }
  }, 30000)

  it('attaches contextual plan-reference duration suggestions to generated row values and create operations', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-duration-suggestion',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const durationRows = generated.rows.filter((row) => (
      row.values.wbs_node_type === 'process'
      && Number(row.values.smart_reference_days ?? 0) > 0
    ))
    expect(durationRows.length).toBeGreaterThan(0)

    const p50Distribution = durationRows.map((row) => Number(row.values.smart_reference_days))
    expect(p50Distribution.every((days) => Number.isFinite(days) && days > 0)).toBe(true)

    const durationRow = durationRows[0]
    expect((durationRow.durationSuggestion as any)?.recommendedDurationDays).toBeUndefined()
    expect(durationRow.durationSuggestion?.durationOutputCode).toBe('plan_reference')
    expect(durationRow.durationSuggestion?.planReferenceDays).toBe(durationRow.values.smart_reference_days)
    expect(durationRow.durationSuggestion?.contextualReferenceDays).toBe(durationRow.values.smart_reference_days)
    expect(durationRow.durationSuggestion?.templateFastEstimateDays).toBeNull()
    expect(durationRow.durationSuggestion?.forecastSource).not.toContain('sync_fast_template')
    expect(durationRow.durationSuggestion?.businessReasonParams?.dbQuerySkipped).not.toBe(true)
    expect(durationRow.durationSuggestion?.durationOutputPromotion).toEqual(expect.objectContaining({
      promotionAllowed: true,
      fromOutputCode: 'contextual_reference',
      toOutputCode: 'plan_reference',
      policyCode: 'contextual_reference_to_plan_reference_on_explicit_plan_generation',
      writeTarget: 'plan_task_duration',
      promotedByService: 'wbsTemplateGenerationService',
      directWriteEvaluation: expect.objectContaining({
        allowed: false,
        outputCode: 'contextual_reference',
        target: 'plan_task_duration',
      }),
      promotedWriteEvaluation: expect.objectContaining({
        allowed: true,
        outputCode: 'plan_reference',
        target: 'plan_task_duration',
      }),
    }))
    expect(durationRow.durationSuggestion?.durationOutputWriteEvaluation).toEqual(expect.objectContaining({
      allowed: true,
      outputCode: 'plan_reference',
      target: 'plan_task_duration',
    }))
    expect((durationRow.values.duration_suggestion as any)?.recommendedDurationDays).toBeUndefined()
    expect((durationRow.values.duration_suggestion as any)?.planReferenceDays).toBe(durationRow.values.smart_reference_days)
    expect((durationRow.values.duration_suggestion as any)?.durationOutputCode).toBe('plan_reference')
    expect((durationRow.values.duration_suggestion as any)?.durationOutputContract?.code).toBe('plan_reference')
    expect((durationRow.values.duration_suggestion as any)?.durationOutputPromotion).toEqual(expect.objectContaining({
      promotionAllowed: true,
      fromOutputCode: 'contextual_reference',
      toOutputCode: 'plan_reference',
      policyCode: 'contextual_reference_to_plan_reference_on_explicit_plan_generation',
      writeTarget: 'plan_task_duration',
    }))
    expect((durationRow.values.duration_suggestion as any)?.durationOutputWriteEvaluation).toEqual(expect.objectContaining({
      allowed: true,
      outputCode: 'plan_reference',
      target: 'plan_task_duration',
    }))
    expect((durationRow.values.duration_suggestion as any)?.durationProvenance).toBe(durationRow.values.duration_provenance)
    expect((durationRow.values.standard_task_metadata as any)?.durationSuggestion?.recommendedDurationDays).toBeUndefined()
    expect((durationRow.values.standard_task_metadata as any)?.durationSuggestion?.planReferenceDays).toBe(durationRow.values.smart_reference_days)
    expect((durationRow.values.standard_task_metadata as any)?.durationSuggestion?.durationOutputCode).toBe('plan_reference')
    expect((durationRow.values.standard_task_metadata as any)?.durationSuggestion?.durationOutputPromotion).toEqual(expect.objectContaining({
      promotionAllowed: true,
      fromOutputCode: 'contextual_reference',
      toOutputCode: 'plan_reference',
      policyCode: 'contextual_reference_to_plan_reference_on_explicit_plan_generation',
    }))

    const createOperations = buildTemplateGenerateCreateOperations(generated.rows)
      .filter((operation) => operation.type === 'create_row')
    const durationCreateOperation = createOperations.find((operation) => (
      operation.clientRowId === durationRow.clientRowId
    )) as { values?: Record<string, unknown> } | undefined
    expect((durationCreateOperation?.values?.duration_suggestion as any)?.recommendedDurationDays).toBeUndefined()
    expect((durationCreateOperation?.values?.duration_suggestion as any)?.planReferenceDays).toBe(durationRow.values.smart_reference_days)
    expect((durationCreateOperation?.values?.duration_suggestion as any)?.durationOutputCode).toBe('plan_reference')
    expect((durationCreateOperation?.values?.duration_suggestion as any)?.durationOutputPromotion).toEqual(expect.objectContaining({
      promotionAllowed: true,
      fromOutputCode: 'contextual_reference',
      toOutputCode: 'plan_reference',
      policyCode: 'contextual_reference_to_plan_reference_on_explicit_plan_generation',
    }))
    expect((durationCreateOperation?.values?.duration_suggestion as any)?.durationOutputWriteEvaluation).toEqual(expect.objectContaining({
      allowed: true,
      outputCode: 'plan_reference',
      target: 'plan_task_duration',
    }))
    expect((durationCreateOperation?.values?.duration_suggestion as any)?.durationProvenance).toBe(durationRow.values.duration_provenance)
  }, 30000)

  it('keeps explicit DB-free fast template duration suggestions diagnostic-only', async () => {
    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-fast-template-duration',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          method_variant_codes: ['aluminum_formwork'],
        },
      },
    })

    const processRows = generated.rows.filter((row) => row.values.wbs_node_type === 'process')
    const durationBearingProcessRows = processRows.filter((row) => row.values.duration_contribution_mode === 'duration_bearing')
    expect(processRows.length).toBeGreaterThan(0)
    expect(durationBearingProcessRows.length).toBeGreaterThan(0)
    expect(durationBearingProcessRows.some((row) => row.durationSuggestion?.businessReasonParams?.dbQuerySkipped === true)).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.forecastSource.includes('sync_fast_template'))).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.durationOutputCode === 'template_fast_estimate')).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.durationOutputWriteEvaluation?.allowed === false)).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.durationOutputPromotion?.promotionAllowed === false)).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.durationOutputPromotion?.policyCode === 'fast_template_promotion_denied_to_plan_reference')).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.values.smart_reference_days == null)).toBe(true)
    expect(durationBearingProcessRows.some((row) => Number(row.durationSuggestion?.templateFastEstimateDays ?? 0) > 1)).toBe(true)
    expect(durationBearingProcessRows.every((row) => (row.values.duration_suggestion as any)?.durationOutputCode === 'template_fast_estimate')).toBe(true)
    expect(durationBearingProcessRows.every((row) => (row.values.duration_suggestion as any)?.planReferenceDays == null)).toBe(true)
  }, 30000)

  it('supports DB-free benchmark plan-reference suggestions for governed runtime replay', async () => {
    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'benchmark_plan_reference',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-benchmark-plan-reference-duration',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          method_variant_codes: ['aluminum_formwork'],
        },
      },
    })

    const durationBearingProcessRows = generated.rows.filter((row) => (
      row.values.wbs_node_type === 'process'
      && row.values.duration_contribution_mode === 'duration_bearing'
    ))

    expect(durationBearingProcessRows.length).toBeGreaterThan(0)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.durationOutputCode === 'plan_reference')).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.durationOutputWriteEvaluation?.allowed === true)).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.durationOutputPromotion?.promotionAllowed === true)).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.businessReasonParams?.dbQuerySkipped === true)).toBe(true)
    expect(durationBearingProcessRows.every((row) => row.durationSuggestion?.forecastSource.includes('benchmark_plan_reference'))).toBe(true)
    expect(durationBearingProcessRows.every((row) => Number(row.values.smart_reference_days ?? 0) > 0)).toBe(true)
    expect(durationBearingProcessRows.every((row) => (row.values.duration_suggestion as any)?.durationOutputCode === 'plan_reference')).toBe(true)
  }, 30000)

  it('schedules WBS template rows by construction production days instead of raw calendar days', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-template-construction-calendar',
        templateId: 'china-building-site-management',
        selectedNodeIds: ['SITE-01-01-02'],
        plannedStartDate: '2026-06-01',
        constructionCalendar: {
          basis: 'official_construction_calendar_seed',
          windows: [{
            holidayCode: 'local_shutdown',
            holidayName: 'Local shutdown',
            startDate: '2026-06-02',
            endDate: '2026-06-03',
            countsAsConstructionShutdown: true,
          }],
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          availability: 'available',
          unavailableReason: null,
        },
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const rowsByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const roadBase = rowsByStableCode.get('SITE-01-01-02-P02')
    expect(roadBase, 'fixture should include a multi-day duration-bearing generated process row').toBeTruthy()
    expect(roadBase!.values.planned_start_date).toBe('2026-06-01')
    expect(roadBase!.values.planned_end_date).toBe('2026-06-06')
    expect(durationDaysOf(roadBase!)).toBe(6)
    expect((roadBase!.values.standard_task_metadata as Record<string, unknown>).calendarBasis).toBe('official_construction_calendar_seed')
  }, 30000)

  it('keeps dependency schedule inside the guardrail after pruning generated hierarchy self-dependencies', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'benchmark_plan_reference',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-dependency-schedule-convergence',
        templateIds: [
          CHINA_GB55032_TEMPLATE_ID,
          'china-project-milestone-handover',
          'china-waterproof-insulation',
          'china-jgj-tianjin-decoration',
        ],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['03-04'],
          'china-project-milestone-handover': ['MS-01'],
          'china-waterproof-insulation': ['WPI-02'],
          'china-jgj-tianjin-decoration': ['DEC-04'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          engineering_object_id: 'project-1',
          phase_object_id: 'phase-1',
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
          business_type: 'general_civil',
          business_subtype: 'civil_residential',
          project_type_code: 'residential',
          buildingCount: 3,
          totalAreaM2: 180_000,
          standardFloorCount: 24,
          highestBuildingFloorCount: 26,
          basementLevelCount: 2,
        },
      },
    })

    const plannedYears = generated.rows
      .flatMap((row) => [row.values.planned_start_date, row.values.planned_end_date])
      .map((value) => Number(String(value ?? '').slice(0, 4)))
      .filter((year) => Number.isFinite(year))
    expect(Math.max(...plannedYears)).toBeLessThanOrEqual(2036)
    expect(generated.governanceWarnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DEPENDENCY_SCHEDULE_NON_CONVERGENT' }),
    ]))
  }, 45000)

  it('prunes generated dependencies where a rollup row depends on its own descendant before scheduling', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'benchmark_plan_reference',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-dependency-hierarchy-prune',
        templateIds: [
          CHINA_GB55032_TEMPLATE_ID,
          'china-project-milestone-handover',
          'china-waterproof-insulation',
          'china-jgj-tianjin-decoration',
        ],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['03-04'],
          'china-project-milestone-handover': ['MS-01'],
          'china-waterproof-insulation': ['WPI-02'],
          'china-jgj-tianjin-decoration': ['DEC-04'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          engineering_object_id: 'project-1',
          phase_object_id: 'phase-1',
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
          business_type: 'general_civil',
          business_subtype: 'civil_residential',
          project_type_code: 'residential',
          buildingCount: 3,
          totalAreaM2: 180_000,
          standardFloorCount: 24,
          highestBuildingFloorCount: 26,
          basementLevelCount: 2,
        },
      },
    })

    const rowById = new Map(generated.rows.map((row) => [row.clientRowId, row]))
    const isAncestor = (ancestorId: string, descendantId: string) => {
      let current = rowById.get(descendantId)
      const seen = new Set<string>()
      while (current?.parentClientRowId && !seen.has(current.clientRowId)) {
        if (current.parentClientRowId === ancestorId) return true
        seen.add(current.clientRowId)
        current = rowById.get(current.parentClientRowId)
      }
      return false
    }
    const ancestorDependsOnDescendantEdges = generated.rows.flatMap((row) => (
      row.predecessorDependencies
        .filter((dependency) => isAncestor(row.clientRowId, dependency.clientRowId))
        .map((dependency) => ({ row, dependency }))
    ))

    expect(ancestorDependsOnDescendantEdges).toEqual([])
    expect(generated.governanceWarnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DEPENDENCY_SCHEDULE_NON_CONVERGENT' }),
    ]))
  }, 45000)

  it('does not relabel unapproved duration outputs as plan_reference during rollup sync', async () => {
    const row = {
      clientRowId: 'row-unapproved-output',
      parentClientRowId: null,
      parentRowId: null,
      sortOrder: 1,
      predecessorClientRowIds: [],
      predecessorDependencies: [],
      values: {
        wbs_node_type: 'process',
        category_type: 'process',
        title: 'unapproved output row',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-10',
        start_date: '2026-06-01',
        end_date: '2026-06-10',
        duration_contribution_mode: 'duration_bearing',
        smart_reference_days: 10,
        duration_suggestion: {
          recommendedDurationDays: 10,
          conservativeDurationDays: 12,
          durationOutputCode: 'remaining_forecast',
          durationOutputSemanticFieldName: 'remainingForecastDays',
          remainingForecastDays: 10,
          forecastSource: 'runtime_remaining_forecast',
          durationCalibrationSource: 'runtime_forecast',
          durationProvenance: 'runtime_execution_facts',
          confidenceLevel: 'medium',
          confidenceScore: 60,
          dataMaturity: 'runtime',
        },
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
        },
      },
      durationSuggestion: {
        recommendedDurationDays: 10,
        conservativeDurationDays: 12,
        durationOutputCode: 'remaining_forecast',
        durationOutputSemanticFieldName: 'remainingForecastDays',
        remainingForecastDays: 10,
        forecastSource: 'runtime_remaining_forecast',
        durationCalibrationSource: 'runtime_forecast',
        durationProvenance: 'runtime_execution_facts',
        confidenceLevel: 'medium',
        confidenceScore: 60,
        dataMaturity: 'runtime',
      },
    }

    const operation = buildTemplateGenerateCreateOperations([row as any])
      .find((item) => item.type === 'create_row') as { values?: Record<string, unknown> } | undefined
    const suggestion = operation?.values?.duration_suggestion as Record<string, unknown>

    expect(operation?.values?.smart_reference_days).toBeNull()
    expect(suggestion.durationOutputCode).toBe('remaining_forecast')
    expect(suggestion.planReferenceDays).toBeNull()
    expect(suggestion.remainingForecastDays).toBe(10)
    expect(suggestion.durationOutputWriteEvaluation).toEqual(expect.objectContaining({
      allowed: false,
      outputCode: 'remaining_forecast',
      target: 'plan_task_duration',
    }))
    expect(suggestion.durationOutputPromotion).toEqual(expect.objectContaining({
      promotionAllowed: false,
      fromOutputCode: 'remaining_forecast',
      toOutputCode: 'plan_reference',
    }))
  })

  it('threads the injected runtime evidence writer through full duration suggestion assembly', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }

    await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'full',
      runtimeConsumerObservationQueryExec: queryExec,
      runtimeEvidenceMode: 'record',
      runtimeArtifactPublications: [],
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-full-duration-runtime-writer',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['03-02-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          project_type_code: 'residential',
          structure_type_code: 'shear_wall',
        },
        projectFacts: {
          totalAreaM2: 140000,
          buildingCount: 5,
          standardFloorCount: 22,
        },
      } as any,
    })

    expect(calls.some((call) => call.params[0] === 'durationSuggestionService')).toBe(true)
    expect(calls.some((call) => call.params[0] === 'wbsTemplateGenerationService')).toBe(true)
  }, 15000)

  it('does not write plan reference days without a governed duration suggestion contract', async () => {
    const row = {
      clientRowId: 'row-missing-duration-contract',
      parentClientRowId: null,
      parentRowId: null,
      sortOrder: 1,
      predecessorClientRowIds: [],
      predecessorDependencies: [],
      values: {
        wbs_node_type: 'process',
        category_type: 'process',
        title: 'missing duration contract row',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-05',
        start_date: '2026-06-01',
        end_date: '2026-06-05',
        duration_contribution_mode: 'duration_bearing',
        smart_reference_days: 5,
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
        },
      },
      durationSuggestion: null,
    }

    const operation = buildTemplateGenerateCreateOperations([row as any])
      .find((item) => item.type === 'create_row') as { values?: Record<string, unknown> } | undefined

    expect(operation?.values?.smart_reference_days).toBeNull()
    expect(operation?.values?.duration_suggestion).toBeNull()
    expect((operation?.values?.standard_task_metadata as any)?.durationSuggestion).toBeNull()
  })

  it('does not write naked recommended duration when plan reference semantic days are missing', async () => {
    const row = {
      clientRowId: 'row-plan-reference-without-semantic-days',
      parentClientRowId: null,
      parentRowId: null,
      sortOrder: 1,
      predecessorClientRowIds: [],
      predecessorDependencies: [],
      values: {
        wbs_node_type: 'process',
        category_type: 'process',
        title: 'plan reference without semantic days row',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-08',
        start_date: '2026-06-01',
        end_date: '2026-06-08',
        duration_contribution_mode: 'duration_bearing',
        smart_reference_days: null,
        duration_suggestion: {
          recommendedDurationDays: 7,
          conservativeDurationDays: 9,
          durationOutputCode: 'plan_reference',
          durationOutputSemanticFieldName: 'planReferenceDays',
          planReferenceDays: null,
          contextualReferenceDays: null,
          forecastSource: 'test_plan_reference_without_semantic_days',
          durationCalibrationSource: 'test',
          durationProvenance: 'test',
          confidenceLevel: 'medium',
          confidenceScore: 60,
          dataMaturity: 'L1',
        },
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
        },
      },
      durationSuggestion: {
        recommendedDurationDays: 7,
        conservativeDurationDays: 9,
        durationOutputCode: 'plan_reference',
        durationOutputSemanticFieldName: 'planReferenceDays',
        planReferenceDays: null,
        contextualReferenceDays: null,
        forecastSource: 'test_plan_reference_without_semantic_days',
        durationCalibrationSource: 'test',
        durationProvenance: 'test',
        confidenceLevel: 'medium',
        confidenceScore: 60,
        dataMaturity: 'L1',
      },
    }

    const operation = buildTemplateGenerateCreateOperations([row as any])
      .find((item) => item.type === 'create_row') as { values?: Record<string, unknown> } | undefined
    const suggestion = operation?.values?.duration_suggestion as Record<string, unknown>

    expect(operation?.values?.smart_reference_days).toBeNull()
    expect(suggestion.durationOutputCode).toBe('plan_reference')
    expect(suggestion.planReferenceDays).toBeNull()
  })

  it('writes plan reference days from the semantic field instead of the internal recommended duration', async () => {
    const row = {
      clientRowId: 'row-plan-reference-semantic-days',
      parentClientRowId: null,
      parentRowId: null,
      sortOrder: 1,
      predecessorClientRowIds: [],
      predecessorDependencies: [],
      values: {
        wbs_node_type: 'process',
        category_type: 'process',
        title: 'plan reference semantic days row',
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-05',
        start_date: '2026-06-01',
        end_date: '2026-06-05',
        duration_contribution_mode: 'duration_bearing',
        smart_reference_days: null,
        duration_suggestion: {
          recommendedDurationDays: 7,
          conservativeDurationDays: 9,
          durationOutputCode: 'plan_reference',
          durationOutputSemanticFieldName: 'planReferenceDays',
          planReferenceDays: 5,
          contextualReferenceDays: null,
          forecastSource: 'test_plan_reference_semantic_days',
          durationCalibrationSource: 'test',
          durationProvenance: 'test',
          confidenceLevel: 'medium',
          confidenceScore: 60,
          dataMaturity: 'L1',
        },
        standard_task_metadata: {
          durationContributionMode: 'duration_bearing',
        },
      },
      durationSuggestion: {
        recommendedDurationDays: 7,
        conservativeDurationDays: 9,
        durationOutputCode: 'plan_reference',
        durationOutputSemanticFieldName: 'planReferenceDays',
        planReferenceDays: 5,
        contextualReferenceDays: null,
        forecastSource: 'test_plan_reference_semantic_days',
        durationCalibrationSource: 'test',
        durationProvenance: 'test',
        confidenceLevel: 'medium',
        confidenceScore: 60,
        dataMaturity: 'L1',
      },
    }

    const operation = buildTemplateGenerateCreateOperations([row as any])
      .find((item) => item.type === 'create_row') as { values?: Record<string, unknown> } | undefined

    expect(operation?.values?.smart_reference_days).toBe(5)
    expect((operation?.values?.duration_suggestion as any)?.planReferenceDays).toBe(5)
    expect((operation?.values?.standard_task_metadata as any)?.durationSuggestion?.planReferenceDays).toBe(5)
  })

  it('keeps ordinary aggregate item packs child-driven in the generated plan truth', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-ordinary-aggregate-duration-truth',
        templateId: 'china-building-site-management',
        selectedNodeIds: ['SITE-01-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const parent = rowByStableCode.get('SITE-01-01-02')
    const roadBase = rowByStableCode.get('SITE-01-01-02-P02')
    const signage = rowByStableCode.get('SITE-01-01-02-P03')

    expect(parent).toBeTruthy()
    expect(roadBase).toBeTruthy()
    expect(signage).toBeTruthy()
    const parentRollup = (parent?.values.standard_task_metadata as Record<string, any> | undefined)?.planRollup
    expect(parentRollup).toEqual(expect.objectContaining({
      source: 'child_plan_window',
      appliedToPlanWindow: true,
      protectedByDurationBoundaryPolicy: null,
      plannedDurationDays: durationDaysOf(parent!),
      referenceDurationDays: durationDaysOf(parent!),
      referenceDurationPolicy: 'date_window',
    }))
    expect(parent?.values.planned_start_date).toBe(roadBase?.values.planned_start_date)
    expect(parent?.values.planned_end_date).toBe(signage?.values.planned_end_date)
    expect(parentRollup.childReferenceDurationTotal).toBe(durationDaysOf(roadBase!) + durationDaysOf(signage!))
    expect(parent?.values.duration_suggestion).toEqual(expect.objectContaining({
      planDurationTruthSource: 'child_plan_window_rollup',
      durationBoundaryRole: 'aggregate_parent_duration',
      businessReasonCodes: expect.arrayContaining(['CHILD_PLAN_WINDOW_ROLLUP']),
      factorAvailability: expect.objectContaining({
        child_plan_window_rollup: true,
      }),
    }))
    expect(roadBase?.values.duration_suggestion).toEqual(expect.objectContaining({
      templateFastEstimateDays: 4,
      durationBoundaryRole: null,
      planDurationTruthSource: null,
    }))
    expect(signage?.values.duration_suggestion).toEqual(expect.objectContaining({
      templateFastEstimateDays: 3,
      durationBoundaryRole: null,
      planDurationTruthSource: null,
    }))
    expect(durationDaysOf(roadBase!)).toBe(4)
    expect(durationDaysOf(signage!)).toBe(3)
    expect(durationDaysOf(parent!)).toBe(7)
    expect(parent?.values.smart_reference_days ?? null).toBeNull()
    expect(roadBase?.values.smart_reference_days ?? null).toBeNull()
    expect(signage?.values.smart_reference_days ?? null).toBeNull()
  }, 30000)

  it('maps overview detailLevel to itemPack depth without expanding process rows', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-overview',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    expect(generated.generationDepth).toBe('item_work')
    expect(generated.rows.length).toBeGreaterThan(0)
    expect(generated.rows.map((row) => row.values.wbs_node_type)).toEqual(expect.arrayContaining(['item_work']))
    expect(generated.rows.map((row) => row.values.wbs_node_type)).not.toContain('process')
    expect(generated.rows.map((row) => row.values.wbs_node_type)).not.toContain('activity_step')
  }, 30000)

  it('treats templateIds as authoritative and does not expand the primary catalog for a scoped specialty phase', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-specialty-scoped-selection',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        templateIds: ['china-foundation-pit-pile'],
        selectedNodesByTemplate: {
          'china-foundation-pit-pile': ['FND-01-01-01', 'FND-02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
          project_type_code: 'civil_residential',
        },
      },
    })

    const templateIds = new Set(generated.rows.map((row) => row.values.template_id))
    const stableCodes = generated.rows.map(stableCodeOf)

    expect(generated.templateIds).toEqual(['china-foundation-pit-pile'])
    expect(templateIds).toEqual(new Set(['china-foundation-pit-pile']))
    expect(stableCodes).toEqual(expect.arrayContaining(['FND-01-01-01', 'FND-02-01-01']))
    expect(stableCodes.every((code) => code.startsWith('FND-01-01-01') || code.startsWith('FND-02-01-01'))).toBe(true)
    expect(generated.rows.length).toBeLessThan(20)
    expect(generated.rows.some((row) => row.values.template_id === CHINA_GB55032_TEMPLATE_ID)).toBe(false)
  }, 30000)

  it('creates overview itemPack sibling dependencies between duration-bearing schedule anchors', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-overview-itempack-flow',
        templateIds: ['china-foundation-pit-pile'],
        selectedNodesByTemplate: {
          'china-foundation-pit-pile': ['FND-01-01-01', 'FND-02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
          project_type_code: 'civil_residential',
        },
      },
    })

    const itemRows = generated.rows.filter((row) => row.values.wbs_node_type === 'item_work')
    const first = itemRows.find((row) => stableCodeOf(row) === 'FND-01-01-01')
    const second = itemRows.find((row) => stableCodeOf(row) === 'FND-02-01-01')

    expect(first?.values.duration_contribution_mode).toBe('duration_bearing')
    expect(second?.values.duration_contribution_mode).toBe('duration_bearing')
    expect(second?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: first?.clientRowId,
        source: 'sibling_sequence',
        dependencyType: 'FS',
        relationRole: 'workflow',
      }),
    ]))
    expect((second?.values.standard_task_metadata as any)?.internalFlow).toEqual(expect.objectContaining({
      sourceType: 'sibling_sequence',
      createsDependency: true,
      durationContributionModePolicy: 'overview_item_work_dependencies_use_duration_bearing_gate_or_handover_anchors',
    }))
    expect(Date.parse(String(second?.values.planned_start_date))).toBeGreaterThan(Date.parse(String(first?.values.planned_end_date)))
  }, 30000)

  it('recalculates generated dates from confirmed predecessor dependencies after workflow rules are attached', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-post-schedule-dependency-dates',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01', '01-02-01', '02-01-03', '02-02-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
        },
      },
    })

    const rowsByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const pitSupport = rowsByStableCode.get('01-03-01')
    const foundation = rowsByStableCode.get('01-02-01')
    const mainStructure = rowsByStableCode.get('02-01-03')
    const masonry = rowsByStableCode.get('02-02-01')

    expect(pitSupport).toBeTruthy()
    expect(foundation).toBeTruthy()
    expect(mainStructure).toBeTruthy()
    expect(masonry).toBeTruthy()
    expect(foundation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: pitSupport?.clientRowId,
        source: 'cross_item_workflow',
        dependencyType: 'FS',
      }),
    ]))
    expect(masonry?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: mainStructure?.clientRowId,
        dependencyType: 'FS',
      }),
    ]))
    expect(Date.parse(String(foundation?.values.planned_start_date))).toBeGreaterThan(Date.parse(String(pitSupport?.values.planned_end_date)))
    expect(Date.parse(String(masonry?.values.planned_start_date))).toBeGreaterThan(Date.parse(String(mainStructure?.values.planned_end_date)))
    expect((foundation?.values.standard_task_metadata as any)?.dependencySchedule).toEqual(expect.objectContaining({
      source: 'generated_dependency_network',
      adjusted: true,
    }))
  }, 30000)

  it('applies construction production calendar when dependency scheduling shifts generated rows', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-dependency-calendar-shift',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01', '01-02-01', '02-01-03', '02-02-01'],
        },
        plannedStartDate: '2026-06-01',
        constructionCalendar: {
          basis: 'official_construction_calendar_seed',
          windows: [{
            holidayCode: 'mid_phase_shutdown',
            holidayName: 'Mid phase shutdown',
            startDate: '2026-06-23',
            endDate: '2026-06-26',
            countsAsConstructionShutdown: true,
          }],
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          timezone: 'Asia/Shanghai',
          availability: 'available',
          unavailableReason: null,
        },
        scope: {
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
        },
      },
    })

    const rowsByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const concrete = rowsByStableCode.get('02-01-03')
    const foundation = rowsByStableCode.get('01-02-01')

    expect(concrete).toBeTruthy()
    expect(foundation).toBeTruthy()
    expect(concrete?.values.planned_start_date).toBe('2026-06-27')
    expect(foundation?.values.planned_start_date).toBe('2026-06-28')
    expect((concrete?.values.standard_task_metadata as any)?.dependencySchedule).toEqual(expect.objectContaining({
      source: 'generated_dependency_network',
      adjusted: true,
      calendarBasis: 'official_construction_calendar_seed',
      constructionCalendarWindowCount: 1,
    }))
    expect((foundation?.values.standard_task_metadata as any)?.dependencySchedule).toEqual(expect.objectContaining({
      source: 'generated_dependency_network',
      adjusted: true,
      calendarBasis: 'official_construction_calendar_seed',
      constructionCalendarWindowCount: 1,
    }))
  }, 30000)

  it('does not project overview non-duration control item packs as ordinary schedule rows', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-overview-control-projection',
        templateIds: [
          CHINA_GB55032_TEMPLATE_ID,
          'china-quality-responsibility-acceptance',
        ],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['10-01'],
          'china-quality-responsibility-acceptance': ['QR-01-01-03'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const overviewRows = generated.rows.filter((row) => row.values.wbs_node_type === 'item_work')
    const nonDurationOverviewRows = overviewRows.filter((row) => row.values.duration_contribution_mode !== 'duration_bearing')
    expect(nonDurationOverviewRows.length).toBeGreaterThan(0)
    expect(nonDurationOverviewRows.every((row) => row.values.smart_reference_days == null)).toBe(true)
    expect(nonDurationOverviewRows.every((row) => row.values.row_projection_mode !== 'schedule_row')).toBe(true)

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    expect(rowByStableCode.get('10-01-01')?.values.row_projection_mode).toBe('gate_marker')
    expect(rowByStableCode.get('10-01-02')?.values.row_projection_mode).toBe('gate_marker')
    expect(rowByStableCode.get('QR-01-01-03')?.values.row_projection_mode).toBe('gate_marker')
  }, 30000)

  it('keeps mixed physical overview item packs duration-bearing instead of downgrading by title control words', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-overview-mixed-physical-semantics',
        templateIds: [
          CHINA_GB55032_TEMPLATE_ID,
          'china-waterproof-insulation',
          'china-cecs-fire-system',
        ],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['07-04-02'],
          'china-waterproof-insulation': ['WPI-01-01-01', 'WPI-02-01-01'],
          'china-cecs-fire-system': ['FIR-02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )

    for (const stableCode of ['WPI-01-01-01', 'FIR-02-01-01']) {
      const row = rowByStableCode.get(stableCode)
      expect(row?.values.wbs_node_type).toBe('item_work')
      expect(row?.values.duration_contribution_mode).toBe('duration_bearing')
      expect(row?.values.row_projection_mode).toBe('schedule_row')
      expect(row?.values.smart_reference_days).toEqual(expect.any(Number))
    }
    expect(rowByStableCode.get('WPI-02-01-01')?.values.duration_contribution_mode).toBe('handover_marker')
    expect(rowByStableCode.get('07-04-02')?.values.row_projection_mode).toBe('schedule_row')
  }, 30000)

  it('rejects oversized single-batch WBS generation before materializing rows', async () => {
    const buildings = Array.from({ length: 501 }, (_, index) => `building-${index + 1}`)
    await expect(generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-render-budget',
        templateId: 'china-building-site-management',
        selectedNodeIds: ['SITE-01-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          buildings,
        },
      },
    })).rejects.toMatchObject({
      statusCode: 413,
      code: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
      details: expect.objectContaining({
        generatedMainPlanRowCount: 501,
        rowLimit: 500,
        generationBatches: [
          expect.objectContaining({
            rowCount: 501,
            rowLimit: 500,
            rowLimitExceeded: true,
          }),
        ],
      }),
    })
  }, 30000)

  it('preflights a 200 by 200 scope expansion before duration suggestions or row materialization', async () => {
    const buildings = Array.from({ length: 200 }, (_, index) => `building-${index + 1}`)
    const floors = Array.from({ length: 200 }, (_, index) => `floor-${index + 1}`)

    await expect(generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-200-by-200-preflight',
        templateId: 'china-building-site-management',
        selectedNodeIds: ['SITE-01-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          buildings,
          floors,
        },
      },
    })).rejects.toMatchObject({
      statusCode: 413,
      code: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
      details: expect.objectContaining({
        generatedMainPlanRowCount: 40000,
        rowLimit: 500,
        preflightStage: 'scope_cardinality',
        generationBatches: [
          expect.objectContaining({
            rowCount: 40000,
            rowLimit: 500,
            rowLimitExceeded: true,
          }),
        ],
      }),
    })
  }, 30000)

  it('auto-expands schedule-critical item packs to process rows under overview detail', async () => {
    const generated = await generateWbsTemplateRowsRaw({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-overview-dynamic-depth',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-01-01-04'],
        plannedStartDate: '2026-06-01',
        scope: {
          physical_zone_object_id: 'basement-zone',
        },
      },
    })

    expect(generated.generationDepth).toBe('item_work')
    expect(generated.rows.map((row) => row.values.wbs_node_type)).toEqual(expect.arrayContaining(['item_work', 'process']))
    expect(generated.rows.map((row) => row.values.wbs_node_type)).not.toContain('activity_step')
    expect(generated.rows.map(stableCodeOf)).toEqual(expect.arrayContaining(['BDT-01-01-04-P02', 'BDT-01-01-04-P04']))
  }, 30000)

  it('can explicitly expand selected standard nodes into process-level planning rows', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-process',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    expect(generated.rows.length).toBeGreaterThan(1)
    expect(generated.generationDepth).toBe('process')
    expect(generated.rows.map((row) => row.values.wbs_node_type)).toEqual(expect.arrayContaining(['item_work', 'process']))
    expect(generated.rows.map((row) => row.values.wbs_node_type)).not.toContain('activity_step')
    expect(generated.rows.some((row) => row.values.wbs_node_type === 'process' && row.predecessorClientRowIds.length > 0)).toBe(true)
  }, 30000)

  it('keeps template generated rows out of final task code fields until the write chain', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-code-finalization-boundary',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const forbiddenTaskCodeFields = [
      'task_code',
      'task_code_version',
      'task_code_rule_id',
      'task_code_generated_at',
    ]
    for (const row of generated.rows) {
      for (const field of forbiddenTaskCodeFields) {
        expect(row.values).not.toHaveProperty(field)
      }
    }

    const operations = buildTemplateGenerateCreateOperations([
      {
        ...generated.rows[0],
        values: {
          ...generated.rows[0].values,
          task_code: 'SHOULD-NOT-PASS',
          task_code_version: 'v0',
          task_code_rule_id: 'rule-preview',
          task_code_generated_at: '2026-06-01T00:00:00.000Z',
        },
      },
    ])
    const createOperation = operations.find((operation) => operation.type === 'create_row')
    expect(createOperation).toBeTruthy()
    for (const field of forbiddenTaskCodeFields) {
      expect(createOperation?.values).not.toHaveProperty(field)
    }
    expect((createOperation?.values.standard_task_metadata as any)?.taskStructureGovernance).toEqual(expect.objectContaining({
      taskCodeFinalization: 'write_chain_only',
      taskCodeFinalized: false,
    }))
  }, 30000)

  it('can explicitly expand activity steps for disclosure and quality-check drafts', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-activity',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-01'],
        plannedStartDate: '2026-06-01',
        generationDepth: 'activity_step',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    expect(generated.generationDepth).toBe('activity_step')
    expect(generated.rows.map((row) => row.values.wbs_node_type)).toEqual(expect.arrayContaining(['item_work', 'process', 'activity_step']))
    expect(generated.rows.some((row) => (
      row.values.wbs_node_type === 'activity_step'
      && Boolean((row.values.standard_task_metadata as any)?.internalFlow)
    ))).toBe(true)

    const processRows = generated.rows.filter((row) => row.values.wbs_node_type === 'process')
    const processWithSteps = processRows.find((row) => (
      row.values.duration_contribution_mode === 'duration_bearing'
      && generated.rows.some((child) => child.parentClientRowId === row.clientRowId && child.values.wbs_node_type === 'activity_step')
    ))
    expect(processWithSteps).toBeTruthy()
    const childSteps = generated.rows.filter((row) => row.parentClientRowId === processWithSteps!.clientRowId && row.values.wbs_node_type === 'activity_step')
    const durationBearingChildSteps = childSteps.filter((row) => row.values.duration_contribution_mode === 'duration_bearing')
    const nonDurationChildSteps = childSteps.filter((row) => row.values.duration_contribution_mode !== 'duration_bearing')
    const processDuration = durationDaysOf(processWithSteps!)
    const childDurationTotal = durationBearingChildSteps.reduce((sum, row) => sum + durationDaysOf(row), 0)
    expect(childDurationTotal).toBeLessThanOrEqual(processDuration)
    const childReferenceDurationTotal = durationBearingChildSteps.reduce((sum, row) => sum + Number(row.values.smart_reference_days ?? 0), 0)
    expect(processWithSteps!.values.smart_reference_days).toBe(childReferenceDurationTotal)
    expect(childReferenceDurationTotal).toBeLessThanOrEqual(processDuration)
    expect(nonDurationChildSteps.length).toBeGreaterThan(0)
    expect(nonDurationChildSteps.every((row) => String(row.values.planned_end_date) >= String(row.values.planned_start_date))).toBe(true)
    expect(nonDurationChildSteps.every((row) => row.values.smart_reference_days == null)).toBe(true)
    expect(nonDurationChildSteps.every((row) => row.durationSuggestion?.businessReasonCode === 'NON_DURATION_BEARING_STANDARD_WORK')).toBe(true)
    const referenceOnlyChildSteps = nonDurationChildSteps.filter((row) => (
      ['embedded_check', 'external_wait', 'record_only', 'quality_gate', 'handover_marker'].includes(String(row.values.duration_contribution_mode))
    ))
    expect(referenceOnlyChildSteps.length).toBeGreaterThan(0)
    const referenceOnlyRowsWithInternalFlow = referenceOnlyChildSteps.filter((row) => (
      Boolean((row.values.standard_task_metadata as any)?.internalFlow)
    ))
    expect(referenceOnlyRowsWithInternalFlow.length).toBeGreaterThan(0)
    const dependencyBlockedReferenceOnlyRows = referenceOnlyChildSteps.filter((row) => {
      const internalFlow = (row.values.standard_task_metadata as any)?.internalFlow
      return internalFlow?.createsDependency === false
        || internalFlow?.durationContributionModePolicy === 'reference_only_not_sibling_dependency'
    })
    expect(dependencyBlockedReferenceOnlyRows.every((row) => row.predecessorClientRowIds.length === 0)).toBe(true)
    const dependencyBlockedReferenceOnlyIds = new Set(dependencyBlockedReferenceOnlyRows.map((row) => row.clientRowId))
    expect(generated.rows.every((row) => row.predecessorClientRowIds.every((id) => !dependencyBlockedReferenceOnlyIds.has(id)))).toBe(true)

    const summaryRows = generated.rows.filter((row) => !['process', 'activity_step'].includes(String(row.values.wbs_node_type)))
    expect(summaryRows.length).toBeGreaterThan(0)
    const summaryWithChildren = summaryRows.find((row) => {
      const planRollup = (row.values.standard_task_metadata as any)?.planRollup
      return planRollup?.appliedToPlanWindow === true
        && generated.rows.some((child) => child.parentClientRowId === row.clientRowId)
    })
    expect(summaryWithChildren).toBeTruthy()
    const summaryChildren = generated.rows.filter((row) => row.parentClientRowId === summaryWithChildren!.clientRowId)
    const windowContributingChildren = summaryChildren.filter((row) => (
      contributesToWbsPlannedWindow(row.values.duration_contribution_mode)
    ))
    const excludedWindowChildren = summaryChildren.filter((row) => (
      !contributesToWbsPlannedWindow(row.values.duration_contribution_mode)
    ))
    expect(windowContributingChildren.length).toBeGreaterThan(0)
    expect(excludedWindowChildren.length).toBeGreaterThan(0)
    expect(excludedWindowChildren.every((row) => (
      String(row.values.planned_end_date) >= String(row.values.planned_start_date)
    ))).toBe(true)
    const childStarts = windowContributingChildren.map((row) => String(row.values.planned_start_date)).sort()
    const childEnds = windowContributingChildren.map((row) => String(row.values.planned_end_date)).sort()
    const childStart = childStarts[0]
    const childEnd = childEnds[childEnds.length - 1]
    expect(summaryWithChildren!.values.planned_start_date).toBe(childStart)
    expect(summaryWithChildren!.values.planned_end_date).toBe(childEnd)
    expect(summaryWithChildren!.values.smart_reference_days).toBe(durationDaysOf(summaryWithChildren!))
    expect(summaryWithChildren!.values.standard_task_metadata).toEqual(expect.objectContaining({
      planRollup: expect.objectContaining({
        source: 'child_plan_window',
        referenceDurationPolicy: 'date_window',
        diagnostics: expect.objectContaining({
          excludedWindowChildCount: excludedWindowChildren.length,
          windowContributorCount: windowContributingChildren.length,
        }),
      }),
      taskStructureGovernance: expect.objectContaining({
        pipeline: 'wbs_task_structure_governance_pipeline',
        source: 'template_generate',
        rollupApplied: true,
        taskCodeFinalization: 'write_chain_only',
        taskCodeFinalized: false,
        downstreamAlgorithmsCanRewriteStructure: false,
      }),
    }))
  }, 30000)

  it('centralizes parent-child plan rollup rules for date windows and activity-step splitting', () => {
    expect(distributePlanDurationAcrossActivitySteps(7, 3)).toEqual([3, 2, 2])

    expect(calculateWbsParentPlanRollup('item_work', [
      { plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-03', referenceDuration: 3, wbsNodeType: 'process' },
      { plannedStartDate: '2026-06-02', plannedEndDate: '2026-06-06', referenceDuration: 5, wbsNodeType: 'process' },
    ])).toEqual(expect.objectContaining({
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-06',
      plannedDurationDays: 6,
      referenceDurationDays: 6,
      childReferenceDurationTotal: 8,
      referenceDurationPolicy: 'date_window',
    }))

    expect(calculateWbsParentPlanRollup('process', [
      { plannedStartDate: '2026-06-01', plannedEndDate: '2026-06-03', referenceDuration: 3, wbsNodeType: 'activity_step' },
      { plannedStartDate: '2026-06-04', plannedEndDate: '2026-06-05', referenceDuration: 2, wbsNodeType: 'activity_step' },
    ])).toEqual(expect.objectContaining({
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-05',
      plannedDurationDays: 5,
      referenceDurationDays: 5,
      childReferenceDurationTotal: 5,
      referenceDurationPolicy: 'activity_step_sum',
    }))
  })

  it('registers v1.4.7.2 domain templates and expands multiple templates as one generation batch', async () => {
    const catalog = await listWbsTemplateCatalog({ includeNodes: true })
    expect(catalog.templates.map((template) => template.id)).toEqual(expect.arrayContaining([
      CHINA_GB55032_TEMPLATE_ID,
      'china-building-site-management',
      'china-dangerous-subproject-control',
      'china-quality-responsibility-acceptance',
      'china-project-milestone-handover',
      'china-document-commercial-support',
      'china-building-fine-detail',
      'china-gb55032-2022-outdoor',
      'china-gb55032-2022-municipal',
      'china-jgj-tianjin-decoration',
      'china-mep-coordination',
      'china-cecs-fire-system',
      'china-facade-curtain-wall',
      'china-elevator-installation',
      'china-intelligent-building-system',
      'china-hvac-system',
      'china-plumbing-heating-system',
      'china-electrical-system',
      'china-foundation-pit-pile',
      'china-steel-structure-specialty',
      'china-prefabricated-assembly',
      'china-waterproof-insulation',
      'china-civil-defense-specialty',
      'china-cleanroom-medical-specialty',
      'china-data-center-specialty',
      'china-industrial-cleanroom-specialty',
      'china-renovation-retrofit-specialty',
      'china-heritage-preservation-specialty',
      'china-campus-specialty',
      'china-tod-upper-cover-specialty',
      'china-modular-mic-specialty',
      'china-prefab-bathroom-specialty',
      'china-prefab-kitchen-specialty',
      'china-hotel-specialty',
    ]))
    const specialtyTemplateIds = [
      'china-building-fine-detail',
      'china-gb55032-2022-outdoor',
      'china-gb55032-2022-municipal',
      'china-jgj-tianjin-decoration',
      'china-mep-coordination',
      'china-cecs-fire-system',
      'china-facade-curtain-wall',
      'china-elevator-installation',
      'china-intelligent-building-system',
      'china-hvac-system',
      'china-plumbing-heating-system',
      'china-electrical-system',
      'china-foundation-pit-pile',
      'china-steel-structure-specialty',
      'china-prefabricated-assembly',
      'china-waterproof-insulation',
      'china-civil-defense-specialty',
      'china-cleanroom-medical-specialty',
      'china-data-center-specialty',
      'china-industrial-cleanroom-specialty',
      'china-renovation-retrofit-specialty',
      'china-heritage-preservation-specialty',
      'china-campus-specialty',
      'china-tod-upper-cover-specialty',
      'china-modular-mic-specialty',
      'china-prefab-bathroom-specialty',
      'china-prefab-kitchen-specialty',
      'china-hotel-specialty',
    ]
    expect(catalog.templates.filter((template) => specialtyTemplateIds.includes(template.id))).toHaveLength(specialtyTemplateIds.length)
    for (const templateId of specialtyTemplateIds) {
      expect(catalog.templates.find((template) => template.id === templateId)).toEqual(expect.objectContaining({
        packType: 'specialty',
      }))
    }
    expect(catalog.templates.find((template) => template.id === 'china-cecs-fire-system')).toEqual(expect.objectContaining({
      packType: 'specialty',
      templateGroup: 'mep',
      generationPolicy: 'triggered',
      triggerKeywords: expect.arrayContaining(['fire_system', 'sprinkler']),
      domainScope: '消防深化专项工程',
      evidenceSummary: expect.objectContaining({
        evidenceStatus: 'verified',
        reviewNeededCount: 0,
        webVerifiedFalseCount: 0,
      }),
    }))
    const facadeTemplate = catalog.templates.find((template) => template.id === 'china-facade-curtain-wall')
    expect(facadeTemplate).toEqual(expect.objectContaining({
      templateGroup: 'facade',
      domainScope: '幕墙外立面专项工程',
      evidenceSummary: expect.objectContaining({
        reviewNeededCount: 0,
        webVerifiedFalseCount: 0,
      }),
    }))
    expect(facadeTemplate?.evidenceSummary.processCount).toBeGreaterThanOrEqual(38)
    expect(facadeTemplate?.evidenceSummary.activityStepCount).toBeGreaterThanOrEqual(114)
    expect(catalog.templates.find((template) => template.id === 'china-building-fine-detail')).toEqual(expect.objectContaining({
      packType: 'specialty',
      templateGroup: 'building_main',
      generationPolicy: 'explicit',
      domainScope: '房建主干精细补充工程',
      triggerKeywords: expect.arrayContaining(['basement_structure', 'secondary_structure']),
    }))
    expect(catalog.templates.find((template) => template.id === 'china-mep-coordination')).toEqual(expect.objectContaining({
      packType: 'specialty',
      templateGroup: 'mep',
      generationPolicy: 'triggered',
      domainScope: '机电综合深化专项工程',
      triggerKeywords: expect.arrayContaining(['mep_coordination', 'bim_coordination']),
    }))

    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-domain',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-cecs-fire-system'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-03'],
          'china-cecs-fire-system': ['FIR-01-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    expect(generated.templateIds).toEqual([CHINA_GB55032_TEMPLATE_ID, 'china-cecs-fire-system'])
    expect(generated.generationBatchId).toBe('batch-domain')
    expect(generated.rows.map((row) => row.values.template_id)).toEqual(expect.arrayContaining([
      CHINA_GB55032_TEMPLATE_ID,
      'china-cecs-fire-system',
    ]))
    expect(generated.rows.every((row) => row.values.generation_batch_id === 'batch-domain')).toBe(true)
    expect(generated.rows.find((row) => row.values.template_id === CHINA_GB55032_TEMPLATE_ID)?.values).toEqual(expect.objectContaining({
      pack_type: 'core_quality',
      template_group: 'building_main',
      generation_policy: 'default_selected',
    }))
    expect(generated.rows.find((row) => row.values.template_id === 'china-cecs-fire-system')?.values).toEqual(expect.objectContaining({
      pack_type: 'specialty',
      template_group: 'mep',
      generation_policy: 'triggered',
    }))
    expect(generated.rows.map(stableCodeOf)).toEqual(expect.arrayContaining([
      '02-01-03',
      'FIR-01-01-01',
    ]))
  }, 30000)

  it('suppresses core process rows when a selected specialty pack replaces their coarse core scope', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-specialty-replacement',
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-facade-curtain-wall'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['03-09-01'],
          'china-facade-curtain-wall': ['FAC-01-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const stableCodeOf = (row: { values: Record<string, unknown> }) => (
      String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '')
    )
    const stableCodes = generated.rows.map(stableCodeOf)
    const facadeProcess = generated.rows.find((row) => stableCodeOf(row) === 'FAC-01-01-01-P01')

    expect(stableCodes).toContain('03-09-01')
    expect(stableCodes.some((code) => code.startsWith('03-09-01-P'))).toBe(false)
    expect(stableCodes.some((code) => code.startsWith('FAC-01-01-01-P'))).toBe(true)
    expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith('03-09-01-P'))).toBe(true)
    expect(facadeProcess?.values.standard_task_metadata).toEqual(expect.objectContaining({
      processGranularity: 'specialty_detail',
      generationMode: 'replace_core_when_selected',
      replacesCoreQualityCodes: expect.arrayContaining(['03-09']),
      extendsCoreQualityCodes: expect.arrayContaining(['03-09']),
    }))
  }, 30000)

  it('suppresses core exterior-wall wet-work rows when selected PCF exterior-panel packs replace them', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-pcf-core-replacement',
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-prefabricated-assembly'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-06', '03-02-01', '03-03-01', '03-10-01'],
          'china-prefabricated-assembly': ['PFB-04-01-10'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated',
          method_variant_codes: ['pcf_facade_panel'],
        },
      },
    })

    const stableCodes = generated.rows.map(stableCodeOf)
    const pcfProcesses = generated.rows
      .filter((row) => stableCodeOf(row).startsWith('PFB-04-01-10-P'))
      .map((row) => row.values.standard_task_metadata as Record<string, unknown>)

    expect(stableCodes.some((code) => code.startsWith('PFB-04-01-10-P'))).toBe(true)
    for (const replacedCoreCode of ['02-01-06', '03-02-01', '03-03-01', '03-10-01']) {
      expect(stableCodes.some((code) => code.startsWith(`${replacedCoreCode}-P`)), `${replacedCoreCode} core process rows`).toBe(false)
      expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith(`${replacedCoreCode}-P`)), `${replacedCoreCode} suppressed rows`).toBe(true)
    }
    expect(pcfProcesses.length).toBeGreaterThan(0)
    expect(pcfProcesses.every((metadata) => metadata.generationMode === 'replace_core_when_selected')).toBe(true)
    expect(pcfProcesses.every((metadata) => {
      const replacementCodes = metadata.replacesCoreQualityCodes
      return Array.isArray(replacementCodes)
        && ['02-01-06', '03-02-01', '03-03-01', '03-10-01'].every((code) => replacementCodes.includes(code))
    })).toBe(true)
  }, 30000)

  it('carries ALC lightweight-partition replacement metadata across prefab interior depth processes', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-alc-core-replacement',
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-prefabricated-assembly'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-06', '02-02-05'],
          'china-prefabricated-assembly': ['PFB-02-01-05'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated',
          method_variant_codes: ['prefab_interior_alc'],
        },
      },
    })

    const stableCodes = generated.rows.map(stableCodeOf)
    const prefabInteriorProcesses = generated.rows
      .filter((row) => stableCodeOf(row).startsWith('PFB-02-01-05-P'))
      .map((row) => row.values.standard_task_metadata as Record<string, unknown>)

    expect(stableCodes.some((code) => code.startsWith('PFB-02-01-05-P'))).toBe(true)
    for (const replacedCoreCode of ['02-01-06', '02-02-05']) {
      expect(stableCodes.some((code) => code.startsWith(`${replacedCoreCode}-P`)), `${replacedCoreCode} core process rows`).toBe(false)
      expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith(`${replacedCoreCode}-P`)), `${replacedCoreCode} suppressed rows`).toBe(true)
    }
    expect(prefabInteriorProcesses.length).toBeGreaterThan(0)
    expect(prefabInteriorProcesses.every((metadata) => metadata.generationMode === 'replace_core_when_selected')).toBe(true)
    expect(prefabInteriorProcesses.every((metadata) => {
      const replacementCodes = metadata.replacesCoreQualityCodes
      return Array.isArray(replacementCodes)
        && ['02-01-06', '02-02-05'].every((code) => replacementCodes.includes(code))
    })).toBe(true)
  }, 30000)

  it('keeps core door-window rows when PCF panels only close the opening interface', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-pcf-opening-interface-not-door-window-replacement',
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-prefabricated-assembly'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['03-02-01', '03-03-01', '03-04-02', '03-10-01'],
          'china-prefabricated-assembly': ['PFB-01-01-07'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated',
          method_variant_codes: ['pcf_facade_panel'],
        },
      },
    })

    const stableCodes = generated.rows.map(stableCodeOf)
    const openingInterfaceProcess = generated.rows.find((row) => (
      stableCodeOf(row) === 'PFB-01-01-07-P11'
    ))

    expect(stableCodes.some((code) => code.startsWith('PFB-01-01-07-P'))).toBe(true)
    for (const replacedCoreCode of ['03-02-01', '03-03-01', '03-10-01']) {
      expect(stableCodes.some((code) => code.startsWith(`${replacedCoreCode}-P`)), `${replacedCoreCode} core process rows`).toBe(false)
      expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith(`${replacedCoreCode}-P`)), `${replacedCoreCode} suppressed rows`).toBe(true)
    }
    expect(stableCodes.some((code) => code.startsWith('03-04-02-P')), 'core metal door-window process rows').toBe(true)
    expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith('03-04-02-P')), 'core metal door-window suppressed rows').toBe(false)
    expect(openingInterfaceProcess?.values.standard_task_metadata).toEqual(expect.objectContaining({
      referencedCoreQualityCodes: expect.arrayContaining(['03-04']),
      relationRole: 'workflow',
    }))
    expect(openingInterfaceProcess?.values.standard_task_metadata).not.toEqual(expect.objectContaining({
      replacesCoreQualityCodes: expect.arrayContaining(['03-04']),
    }))
  }, 30000)

  it('keeps core special-door rows when facade window-railing-louver pack only replaces exterior-window scope', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-facade-window-louver-not-special-door-replacement',
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-facade-curtain-wall'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['03-04-02', '03-04-04', '09-01-03'],
          'china-facade-curtain-wall': ['FAC-03-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const stableCodes = generated.rows.map(stableCodeOf)
    const facadeWindowProcesses = generated.rows
      .filter((row) => stableCodeOf(row).startsWith('FAC-03-01-01-P'))
      .map((row) => row.values.standard_task_metadata as Record<string, unknown>)

    expect(stableCodes.some((code) => code.startsWith('FAC-03-01-01-P'))).toBe(true)
    for (const replacedCoreCode of ['03-04-02', '09-01-03']) {
      expect(stableCodes.some((code) => code.startsWith(`${replacedCoreCode}-P`)), `${replacedCoreCode} core process rows`).toBe(false)
      expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith(`${replacedCoreCode}-P`)), `${replacedCoreCode} suppressed rows`).toBe(true)
    }
    expect(stableCodes.some((code) => code.startsWith('03-04-04-P')), 'core special-door process rows').toBe(true)
    expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith('03-04-04-P')), 'core special-door suppressed rows').toBe(false)
    expect(facadeWindowProcesses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        replacesCoreQualityCodes: expect.arrayContaining(['03-04-02', '09-01-03']),
        referencedCoreQualityCodes: expect.arrayContaining(['03-04']),
        relationRole: 'workflow',
      }),
    ]))
    expect(facadeWindowProcesses.every((metadata) => {
      const replacementCodes = metadata.replacesCoreQualityCodes
      return !Array.isArray(replacementCodes) || !replacementCodes.includes('03-04')
    })).toBe(true)
  }, 30000)

  it('keeps core door-window rows when basement fine-detail flooring only replaces building-floor scope', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-basement-flooring-not-door-window-replacement',
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-building-fine-detail'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['03-01-02', '03-04-02', '03-04-04'],
          'china-building-fine-detail': ['BDT-01-01-06'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const stableCodes = generated.rows.map(stableCodeOf)
    const basementFineDetailProcesses = generated.rows
      .filter((row) => stableCodeOf(row).startsWith('BDT-01-01-06-P'))
      .map((row) => row.values.standard_task_metadata as Record<string, unknown>)

    expect(stableCodes.some((code) => code.startsWith('BDT-01-01-06-P'))).toBe(true)
    expect(stableCodes.some((code) => code.startsWith('03-01-02-P')), 'core building-floor process rows').toBe(false)
    expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith('03-01-02-P')), 'core building-floor suppressed rows').toBe(true)
    for (const retainedCoreCode of ['03-04-02', '03-04-04']) {
      expect(stableCodes.some((code) => code.startsWith(`${retainedCoreCode}-P`)), `${retainedCoreCode} core process rows`).toBe(true)
      expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith(`${retainedCoreCode}-P`)), `${retainedCoreCode} suppressed rows`).toBe(false)
    }
    expect(basementFineDetailProcesses).toEqual(expect.arrayContaining([
      expect.objectContaining({
        replacesCoreQualityCodes: expect.arrayContaining(['03-01']),
      }),
    ]))
    expect(basementFineDetailProcesses.every((metadata) => {
      const replacementCodes = metadata.replacesCoreQualityCodes
      return !Array.isArray(replacementCodes) || !replacementCodes.includes('03-04')
    })).toBe(true)
  }, 30000)

  it('does not suppress core construction rows for offsite specialty design or factory packs', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-mic-offsite-no-core-suppression',
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-modular-mic-specialty'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-06'],
          'china-modular-mic-specialty': ['MIC-01-01-01', 'MIC-02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'modular_construction',
          method_variant_codes: ['modular_mic'],
        },
      },
    })

    const stableCodeOf = (row: { values: Record<string, unknown> }) => (
      String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '')
    )
    const stableCodes = generated.rows.map(stableCodeOf)
    const micFactoryProcessMetadata = generated.rows
      .filter((row) => stableCodeOf(row).startsWith('MIC-02-01-01-P'))
      .map((row) => row.values.standard_task_metadata as Record<string, unknown>)

    expect(stableCodes.some((code) => code.startsWith('02-01-06-P'))).toBe(true)
    expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith('02-01-06-P'))).toBe(false)
    expect(micFactoryProcessMetadata.length).toBeGreaterThan(0)
    expect(micFactoryProcessMetadata.every((metadata) => metadata.generationMode === 'additive_specialty_scope')).toBe(true)
    expect(micFactoryProcessMetadata.every((metadata) => !Array.isArray(metadata.replacesCoreQualityCodes) || metadata.replacesCoreQualityCodes.length === 0)).toBe(true)
  }, 30000)

  it('suppresses only the core rows replaced by selected onsite MiC interface packs', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-mic-onsite-targeted-core-suppression',
        templateIds: [CHINA_GB55032_TEMPLATE_ID, 'china-modular-mic-specialty'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-06', '05-01-01', '02-01-03'],
          'china-modular-mic-specialty': ['MIC-04-01-01', 'MIC-05-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'modular_construction',
          method_variant_codes: ['modular_mic'],
        },
      },
    })

    const stableCodeOf = (row: { values: Record<string, unknown> }) => (
      String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '')
    )
    const stableCodes = generated.rows.map(stableCodeOf)

    expect(stableCodes.some((code) => code.startsWith('MIC-04-01-01-P'))).toBe(true)
    expect(stableCodes.some((code) => code.startsWith('MIC-05-01-01-P'))).toBe(true)
    expect(stableCodes.some((code) => code.startsWith('02-01-06-P'))).toBe(false)
    expect(stableCodes.some((code) => code.startsWith('05-01-01-P'))).toBe(false)
    expect(stableCodes.some((code) => code.startsWith('02-01-03-P'))).toBe(true)
    expect(generated.suppressedCoreQualityCodes).toEqual(expect.arrayContaining([
      expect.stringMatching(/^02-01-06-P/),
      expect.stringMatching(/^05-01-01-P/),
    ]))
    expect(generated.suppressedCoreQualityCodes.some((code) => code.startsWith('02-01-03-P'))).toBe(false)
  }, 30000)

  it('marks specialty depth packs as core-replacement detail packs', () => {
    const replacementTemplateIds = [
      'china-building-fine-detail',
      'china-waterproof-insulation',
      'china-steel-structure-specialty',
      'china-facade-curtain-wall',
      'china-plumbing-heating-system',
      'china-electrical-system',
      'china-hvac-system',
      'china-jgj-tianjin-decoration',
      'china-prefabricated-assembly',
      'china-foundation-pit-pile',
      'china-cecs-fire-system',
      'china-mep-coordination',
      'china-intelligent-building-system',
      'china-elevator-installation',
      'china-civil-defense-specialty',
      'china-cleanroom-medical-specialty',
    ]

    for (const templateId of replacementTemplateIds) {
      const template = getDomainTemplate(templateId)
      const processes = flattenDomainNodes(template.divisions).filter((node) => node.categoryType === 'process')
      expect(processes.length).toBeGreaterThan(0)
      expect(processes.every((node) => node.metadata?.processGranularity === 'specialty_detail')).toBe(true)
      expect(processes.every((node) => node.metadata?.generationMode === 'replace_core_when_selected')).toBe(true)
      expect(processes.every((node) => Array.isArray(node.metadata?.replacesCoreQualityCodes) && node.metadata.replacesCoreQualityCodes.length > 0)).toBe(true)
      expect(processes.every((node) => Array.isArray(node.metadata?.extendsCoreQualityCodes) && node.metadata.extendsCoreQualityCodes.length > 0)).toBe(true)
    }

    const waterproofProcesses = flattenDomainNodes(getDomainTemplate('china-waterproof-insulation').divisions)
      .filter((node) => node.categoryType === 'process')
    expect(waterproofProcesses.every((node) => {
      const replacementCodes = node.metadata?.replacesCoreQualityCodes
      return Array.isArray(replacementCodes) && replacementCodes.includes('04-02')
    })).toBe(true)
    const basementExternalWallItem = flattenDomainNodes(getDomainTemplate('china-waterproof-insulation').divisions)
      .find((node) => node.categoryType === 'item_work' && node.stableCode === 'WPI-01-01-04')
    expect(basementExternalWallItem).toEqual(expect.objectContaining({
      stableCode: 'WPI-01-01-04',
      sourceStandard: 'GB50108 / GB50208 / GB50202',
    }))
    expect((basementExternalWallItem?.children ?? []).filter((node) => node.categoryType === 'process').length).toBeGreaterThanOrEqual(5)

    const decorationItemCodes = flattenDomainNodes(getDomainTemplate('china-jgj-tianjin-decoration').divisions)
      .filter((node) => node.categoryType === 'item_work')
      .map((node) => node.stableCode)
    expect(decorationItemCodes.length).toBeGreaterThanOrEqual(6)

    const allDomainItemCodes = DOMAIN_WBS_TEMPLATE_CATALOGS
      .flatMap((template) => flattenDomainNodes(template.divisions))
      .filter((node) => node.categoryType === 'item_work')
      .map((node) => node.stableCode)
    expect(allDomainItemCodes).toEqual(expect.arrayContaining([
      'WPI-01-01-04',
      'BDT-04-01-01',
      'PFB-01-01-07',
      'PFB-02-01-01',
      'CLN-04-01-29',
      'DTC-04-01-07',
      'ICR-05-01-17',
      'FND-04-01-04',
    ]))

    const processCountOf = (templateId: string, stableCode: string) => {
      const item = flattenDomainNodes(getDomainTemplate(templateId).divisions)
        .find((node) => node.categoryType === 'item_work' && node.stableCode === stableCode)
      expect(item).toBeTruthy()
      return (item?.children ?? []).filter((child) => child.categoryType === 'process').length
    }
    const processMetadataOf = (templateId: string, stableCode: string) => {
      const item = flattenDomainNodes(getDomainTemplate(templateId).divisions)
        .find((node) => node.categoryType === 'item_work' && node.stableCode === stableCode)
      return (item?.children ?? [])
        .filter((child) => child.categoryType === 'process')
        .map((child) => child.metadata ?? {})
    }
    const itemMetadataOf = (templateId: string, stableCode: string) => {
      const item = flattenDomainNodes(getDomainTemplate(templateId).divisions)
        .find((node) => node.categoryType === 'item_work' && node.stableCode === stableCode)
      return item?.metadata ?? {}
    }

    expect(processCountOf('china-facade-curtain-wall', 'FAC-02-01-01')).toBeGreaterThanOrEqual(10)
    expect(processCountOf('china-hvac-system', 'HVA-02-01-02')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-waterproof-insulation', 'WPI-01-01-01')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-steel-structure-specialty', 'STL-02-01-01')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-building-fine-detail', 'BDT-01-01-04')).toBeGreaterThanOrEqual(8)
    expect(processCountOf('china-building-fine-detail', 'BDT-01-01-05')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-building-fine-detail', 'BDT-06-01-01')).toBeGreaterThanOrEqual(8)
    expect(processCountOf('china-building-fine-detail', 'BDT-07-01-03')).toBeGreaterThanOrEqual(8)
    expect(processCountOf('china-prefabricated-assembly', 'PFB-00-01-02')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-prefabricated-assembly', 'PFB-01-01-07')).toBeGreaterThanOrEqual(8)
    expect(processCountOf('china-prefabricated-assembly', 'PFB-01-01-09')).toBeGreaterThanOrEqual(8)
    expect(processCountOf('china-prefabricated-assembly', 'PFB-02-01-01')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-cleanroom-medical-specialty', 'CLN-02-01-01')).toBeGreaterThanOrEqual(10)
    expect(processCountOf('china-cleanroom-medical-specialty', 'CLN-04-01-29')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-data-center-specialty', 'DTC-04-01-07')).toBeGreaterThanOrEqual(8)
    expect(processCountOf('china-industrial-cleanroom-specialty', 'ICR-05-01-17')).toBeGreaterThanOrEqual(7)
    expect(processCountOf('china-foundation-pit-pile', 'FND-04-01-04')).toBeGreaterThanOrEqual(8)
    expect(processCountOf('china-electrical-system', 'ELE-03-02-01')).toBe(8)
    expect(itemMetadataOf('china-electrical-system', 'ELE-03-02-01')).toEqual(expect.objectContaining({
      applicableProjectTypes: ['residential'],
      projectTypeBindingPolicy: 'by_project_type',
    }))
    expect(processCountOf('china-gb55032-2022-outdoor', 'OUT-04-03-01')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-gb55032-2022-outdoor', 'OUT-04-03-02')).toBeGreaterThanOrEqual(9)
    expect(processCountOf('china-gb55032-2022-outdoor', 'OUT-04-01-02')).toBeGreaterThanOrEqual(9)
    expect(processMetadataOf('china-prefabricated-assembly', 'PFB-01-01-07')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        replacesCoreQualityCodes: expect.arrayContaining(['03-02-01', '03-03-01', '03-10-01']),
      }),
    ]))
    expect(processMetadataOf('china-prefabricated-assembly', 'PFB-02-01-01')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        weatherImpactBands: expect.arrayContaining(['cold_below_5c']),
        climateConstraintPolicy: 'consume_regional_climate_seed_not_template_duration_rule',
      }),
    ]))
    expect(processMetadataOf('china-prefabricated-assembly', 'PFB-02-01-05')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        replacesCoreQualityCodes: expect.arrayContaining(['02-02-05']),
      }),
    ]))
    expect(processMetadataOf('china-prefabricated-assembly', 'PFB-01-01-09')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        semanticReferencedDangerControlCodes: expect.arrayContaining(['DANGER-01-01-14']),
        relationRole: 'inspection',
      }),
      expect.objectContaining({
        semanticReferencedDangerControlCodes: expect.arrayContaining(['DANGER-01-01-14']),
        relationRole: 'workflow',
      }),
    ]))
    expect(processMetadataOf('china-building-fine-detail', 'BDT-06-01-04')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        semanticReferencedSpecialtyCodes: expect.arrayContaining(['WPI-01-01-01']),
        relationRole: 'workflow',
      }),
    ]))
    expect(itemMetadataOf('china-building-fine-detail', 'BDT-04-01-01')).toEqual(expect.objectContaining({
      prefabIntegrationMode: 'mixed_in-situ_and_prefab_ready',
      prefabIntegrationOrder: ['pc_component_install', 'cast_in_situ_rebar', 'cast_in_situ_formwork', 'cast_in_situ_concrete'],
      floorDurationCurve: expect.objectContaining({
        firstFloor: 7,
        midFloors: 5,
        lastFloors: 6,
      }),
      floorDurationCurveByMethod: expect.objectContaining({
        aluminum_formwork: expect.objectContaining({
          firstFloor: 7,
          midFloors: 5,
          lastFloors: 6,
        }),
      }),
    }))
    const civilDefenseMetadata = processMetadataOf('china-civil-defense-specialty', 'CDF-02-01-02')
    expect(civilDefenseMetadata.find((metadata) => metadata.relationRole === 'evidence')).toEqual(expect.objectContaining({
      semanticReferencedSpecialtyCodes: expect.arrayContaining(['CDF-01-01-01', 'CDF-01-01-02', 'CDF-02-01-01']),
      relationRole: 'evidence',
    }))
    expect(civilDefenseMetadata.find((metadata) => metadata.relationRole === 'handover')).toEqual(expect.objectContaining({
      semanticReferencedSpecialtyCodes: expect.arrayContaining(['CDF-01-01-01', 'CDF-01-01-02', 'CDF-02-01-01']),
      relationRole: 'handover',
    }))
    expect(processMetadataOf('china-building-fine-detail', 'BDT-06-01-01')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        referencedQualityResponsibilityCodes: expect.arrayContaining(['QR-01-01-14-P01']),
        relationRole: 'prerequisite',
      }),
      expect.objectContaining({
        referencedQualityResponsibilityCodes: expect.arrayContaining(['QR-01-01-14-P02']),
        relationRole: 'workflow',
      }),
      expect.objectContaining({
        referencedQualityResponsibilityCodes: expect.arrayContaining(['QR-01-01-14-P03']),
        relationRole: 'workflow',
      }),
    ]))
    expect(processMetadataOf('china-facade-curtain-wall', 'FAC-02-01-01')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        depthProfileSource: 'v1.4.7.2-field_management_depth_profile',
        processComplexity: 'critical',
      }),
    ]))

    const mechanicalDepthProfileNames = DOMAIN_WBS_TEMPLATE_CATALOGS
      .flatMap((template) => flattenDomainNodes(template.divisions))
      .filter((node) => node.categoryType === 'process' && node.metadata?.depthProfileSource === 'v1.4.7.2-field_management_depth_profile')
      .filter((node) => {
        const metadata = node.metadata ?? {}
        return metadata.durationContributionMode === 'record_only'
          || metadata.durationContributionMode === 'handover_marker'
          || metadata.relationRole === 'handover'
      })
      .map((node) => `${node.stableCode}:${node.metadata?.durationContributionMode ?? 'unknown'}:${node.metadata?.relationRole ?? 'unknown'}`)

    expect(mechanicalDepthProfileNames).toEqual([])

    const ungovernedSpecialtyClosureNames = DOMAIN_WBS_TEMPLATE_CATALOGS
      .filter((template) => template.packType === 'specialty')
      .flatMap((template) => flattenDomainNodes(template.divisions))
      .filter((node) => node.categoryType === 'process')
      .filter((node) => {
        const metadata = node.metadata ?? {}
        const isClosureLike = metadata.durationContributionMode === 'record_only'
          || metadata.durationContributionMode === 'handover_marker'
          || metadata.relationRole === 'handover'
          || metadata.documentEvidenceRole === 'handover_document'
        if (!isClosureLike) return false
        return !(
          metadata.coverageSupplementSemanticGovernance === 'field_semantic_thickness_v1'
          || metadata.coverageProcessSemanticRole === 'handover_closeout'
          || metadata.relationRole === 'handover'
          || metadata.documentEvidenceRole === 'handover_document'
          || metadata.inspectionAcceptanceRole === 'special_acceptance'
        )
      })
      .map((node) => node.name)

    expect(ungovernedSpecialtyClosureNames).toEqual([])

    const realProjectNativeDepthTemplateIds = new Set([
      'china-foundation-pit-pile',
      'china-cleanroom-medical-specialty',
      'china-data-center-specialty',
      'china-industrial-cleanroom-specialty',
      'china-steel-structure-specialty',
      'china-renovation-retrofit-specialty',
      'china-heritage-preservation-specialty',
      'china-campus-specialty',
      'china-tod-upper-cover-specialty',
      'china-modular-mic-specialty',
      'china-prefab-bathroom-specialty',
      'china-prefab-kitchen-specialty',
      'china-hotel-specialty',
    ])
    const promotedFallbackItemPacks = DOMAIN_WBS_TEMPLATE_CATALOGS
      .filter((template) => realProjectNativeDepthTemplateIds.has(template.templateId))
      .flatMap((template) => flattenDomainNodes(template.divisions).map((node) => ({ template, node })))
      .filter(({ node }) => node.categoryType === 'item_work')
      .filter(({ node }) => node.metadata?.realProjectCoveragePromoted === true)
      .filter(({ node }) => node.metadata?.coverageProcessDepthSource !== 'native_differentiated_real_project_processes')
      .map(({ template, node }) => `${template.templateId}:${node.stableCode}:${node.name}`)

    expect(promotedFallbackItemPacks).toEqual([])

    const processNames = (templateId: string, stableCode: string) => {
      const item = flattenDomainNodes(getDomainTemplate(templateId).divisions)
        .find((node) => node.categoryType === 'item_work' && node.stableCode === stableCode)
      return (item?.children ?? []).filter((child) => child.categoryType === 'process').map((child) => child.name)
    }
    expect(processNames('china-cleanroom-medical-specialty', 'CLN-04-01-29').length).toBeGreaterThanOrEqual(9)
    expect(processNames('china-cleanroom-medical-specialty', 'CLN-04-01-29').some((name) => name.includes('专锟斤拷锟筋化锟酵洁净锟饺硷拷锟斤拷锟斤拷'))).toBe(false)
    expect(processNames('china-data-center-specialty', 'DTC-04-01-07').length).toBeGreaterThanOrEqual(8)
    expect(processNames('china-industrial-cleanroom-specialty', 'ICR-05-01-17').length).toBeGreaterThanOrEqual(7)
    expect(processNames('china-foundation-pit-pile', 'FND-04-01-04').length).toBeGreaterThanOrEqual(8)
  })

  it('resolves one-click catalog group selections without expanding untriggered packs', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-group-selection',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        groupSelections: {
          site_management: 'all',
          danger_control: 'auto_by_trigger',
          document_commercial_support: 'default_selected',
          project_milestone: 'by_project_type',
        },
        specialtyCatalogIds: ['china-cecs-fire-system'],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-03'],
          'china-building-site-management': ['SITE-01-01-01'],
          'china-dangerous-subproject-control': ['DANGER-01-01-01'],
          'china-project-milestone-handover': ['MS-01-01-01'],
          'china-document-commercial-support': ['DCS-01-01-01'],
          'china-cecs-fire-system': ['FIR-01-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'general_civil',
          foundationDepthM: 5,
        },
      },
    })

    expect(generated.templateIds).toEqual([
      CHINA_GB55032_TEMPLATE_ID,
      'china-building-site-management',
      'china-dangerous-subproject-control',
      'china-project-milestone-handover',
      'china-document-commercial-support',
      'china-cecs-fire-system',
    ])
    expect(generated.rows.length).toBeGreaterThan(0)
    expect(generated.rows.length).toBeLessThanOrEqual(500)
    expect(generated.rows.map((row) => row.values.pack_type)).toEqual(expect.arrayContaining([
      'core_quality',
      'site_management',
      'danger_control',
      'project_milestone',
      'document_commercial_support',
      'specialty',
    ]))
  }, 30000)

  it('narrows danger auto-trigger generation to matched danger item packs', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-danger-auto-trigger',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        groupSelections: {
          danger_control: 'auto_by_trigger',
        },
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-03'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          foundationDepthM: 5,
        },
      },
    })

    const dangerStableCodes = generated.rows
      .filter((row) => row.values.pack_type === 'danger_control')
      .map((row) => String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''))

    expect(generated.templateIds).toContain('china-dangerous-subproject-control')
    expect(dangerStableCodes.some((code) => code.startsWith('DANGER-01-01-01'))).toBe(true)
    expect(dangerStableCodes.some((code) => code.startsWith('DANGER-01-01-02'))).toBe(false)
    expect(dangerStableCodes.some((code) => code.startsWith('DANGER-01-01-03'))).toBe(false)
  }, 30000)

  it('keeps danger-control entity execution as schedule rows while retaining safety controls', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-danger-execution-semantics',
        templateIds: ['china-dangerous-subproject-control'],
        selectedNodesByTemplate: {
          'china-dangerous-subproject-control': ['DANGER-02-01-04'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          supportHeightM: 8.4,
        },
      },
    })

    const dangerRows = generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith('DANGER-02-01-04-P')
    })
    const frameErection = dangerRows.find((row) => (
      row.values.row_projection_mode === 'schedule_row'
      && row.values.duration_contribution_mode === 'duration_bearing'
      && row.values.execution_nature === 'physical_work'
      && row.values.safety_control_role === 'hazardous_work'
    ))
    expect(frameErection?.values.row_projection_mode).toBe('schedule_row')
    expect(frameErection?.values.duration_contribution_mode).toBe('duration_bearing')
    expect(frameErection?.values.execution_nature).toBe('physical_work')
    expect(frameErection?.values.smart_reference_days).toEqual(expect.any(Number))
    expect(frameErection?.values.safety_control_role).toBe('hazardous_work')
    expect((frameErection?.values.standard_task_metadata as Record<string, unknown> | undefined)?.planItemTags)
      .toEqual(expect.arrayContaining(['危大']))

    const concreteMonitoring = dangerRows.find((row) => (
      row.values.row_projection_mode === 'schedule_row'
      && row.values.duration_contribution_mode === 'duration_bearing'
      && String(row.values.safety_control_role ?? '').match(/hazardous_work|monitoring_control/)
      && row.clientRowId !== frameErection?.clientRowId
    ))
    expect(concreteMonitoring?.values.row_projection_mode).toBe('schedule_row')
    expect(concreteMonitoring?.values.duration_contribution_mode).toBe('duration_bearing')
    expect(concreteMonitoring?.values.smart_reference_days).toEqual(expect.any(Number))
    expect(concreteMonitoring?.values.safety_control_role).toEqual(expect.stringMatching(/hazardous_work|monitoring_control/))

    const conditionConfirmation = dangerRows.find((row) => (
      row.values.row_projection_mode !== 'schedule_row'
      && row.values.duration_contribution_mode !== 'duration_bearing'
      && row.values.document_evidence_role !== 'none'
    ))
    expect(conditionConfirmation?.values.row_projection_mode).not.toBe('schedule_row')
    expect(conditionConfirmation?.values.duration_contribution_mode).not.toBe('duration_bearing')
    expect(conditionConfirmation?.values.smart_reference_days).toBeNull()
    expect(conditionConfirmation?.values.document_evidence_role).not.toBe('none')
  }, 30000)

  it('applies v1.4.7.5 dependency intents across catalog groups without duplicating core rows', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cross-dependency',
        templateIds: [
          CHINA_GB55032_TEMPLATE_ID,
          'china-quality-responsibility-acceptance',
          'china-project-milestone-handover',
        ],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-03'],
          'china-quality-responsibility-acceptance': ['QR-01-01-03'],
          'china-project-milestone-handover': ['MS-01-01-07'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'general_civil',
        },
      },
    })

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const concreteMaterialReview = rowByStableCode.get('02-01-03-P01')
    const concreteMixReview = rowByStableCode.get('02-01-03-P02')
    const concretePreparation = rowByStableCode.get('02-01-03-P03')
    const concreteEmbedReview = rowByStableCode.get('02-01-03-P04')
    const concreteArrivalAcceptance = rowByStableCode.get('02-01-03-P05')
    const concretePour = rowByStableCode.get('02-01-03-P07')
    const postCastStripClose = rowByStableCode.get('02-01-03-P12')
    const concreteEntityQuality = rowByStableCode.get('02-01-03-P16')
    const witnessSampling = rowByStableCode.get('QR-01-01-03-P02')
    const mainStructureAcceptance = rowByStableCode.get('MS-01-01-07-P01')

    expect(concreteMaterialReview?.values.duration_contribution_mode).toBe('quality_gate')
    expect(concreteMaterialReview?.values.smart_reference_days).toBeNull()
    expect(concreteMixReview?.values.duration_contribution_mode).toBe('embedded_check')
    expect(concreteMixReview?.values.smart_reference_days).toBeNull()
    expect(concreteMixReview?.predecessorDependencies).toHaveLength(0)
    expect(concreteMixReview?.values.standard_task_metadata).toEqual(expect.objectContaining({
      internalFlow: expect.objectContaining({
        curationStatus: 'system_resolved',
        curationMethod: 'duration_contribution_mode_guard',
        relationKind: 'parallel_allowed',
        createsDependency: false,
        reasonCode: 'DURATION_CONTRIBUTION_MODE_REFERENCE_ONLY',
        durationContributionMode: 'embedded_check',
        durationContributionModePolicy: 'reference_only_not_sibling_dependency',
      }),
    }))
    expect(concretePreparation?.values.duration_contribution_mode).toBe('embedded_check')
    expect(concretePreparation?.values.smart_reference_days).toBeNull()
    expect(concretePreparation?.predecessorDependencies).toHaveLength(0)
    expect(concretePreparation?.values.standard_task_metadata).toEqual(expect.objectContaining({
      internalFlow: expect.objectContaining({
        curationStatus: 'system_resolved',
        curationMethod: 'duration_contribution_mode_guard',
        relationKind: 'parallel_allowed',
        createsDependency: false,
        reasonCode: 'DURATION_CONTRIBUTION_MODE_REFERENCE_ONLY',
        durationContributionMode: 'embedded_check',
        durationContributionModePolicy: 'reference_only_not_sibling_dependency',
      }),
    }))
    expect(concreteEmbedReview?.values.duration_contribution_mode).toBe('quality_gate')
    expect(concreteEmbedReview?.values.smart_reference_days).toBeNull()
    expect(concreteArrivalAcceptance).toBeTruthy()
    expect(concreteArrivalAcceptance?.values.duration_contribution_mode).toBe('quality_gate')
    expect(concreteArrivalAcceptance?.values.smart_reference_days).toBeNull()
    expect(concreteArrivalAcceptance?.values.standard_task_metadata).toEqual(expect.objectContaining({
      internalFlow: expect.objectContaining({
        source: 'v1.4.7.2_internal_flow',
        sourceType: 'sibling_sequence',
        ruleSource: 'china_gb50300_template_catalog',
        seedRuleId: expect.stringContaining('internal-flow:'),
        curationStatus: 'curated',
        curationMethod: 'manual_registry',
        scope: 'same_parent',
        relationKind: 'acceptance_gate',
        createsDependency: true,
        requiresAllPreviousSiblings: true,
        predecessorClientRowId: concreteEmbedReview?.clientRowId,
        predecessorClientRowIds: expect.arrayContaining([
          concreteMaterialReview?.clientRowId,
          concreteEmbedReview?.clientRowId,
        ]),
        skippedSiblingClientRowIds: expect.arrayContaining([
          concreteMixReview?.clientRowId,
          concretePreparation?.clientRowId,
        ]),
        dependencyType: 'FS',
        lagDays: 0,
      }),
    }))
    expect(concreteArrivalAcceptance?.predecessorClientRowIds).toEqual(expect.arrayContaining([
      concreteMaterialReview?.clientRowId,
      concreteEmbedReview?.clientRowId,
    ]))
    expect(concreteArrivalAcceptance?.predecessorClientRowIds).not.toContain(concreteMixReview?.clientRowId)
    expect(concreteArrivalAcceptance?.predecessorClientRowIds).not.toContain(concretePreparation?.clientRowId)
    expect(postCastStripClose?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: concretePour?.clientRowId,
        dependencyType: 'FS',
        lagDays: 60,
        source: 'sibling_sequence',
      }),
    ]))
    expect((postCastStripClose?.values.standard_task_metadata as any)?.internalFlow).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      lagDays: 60,
      seedRuleId: expect.stringContaining('curing-protection-to-post-cast-strip-close-guidance'),
      predecessorNames: expect.arrayContaining([concretePour?.values.title]),
      predecessorStableCodes: expect.arrayContaining(['02-01-03-P07']),
    }))
    expect(concreteArrivalAcceptance?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: witnessSampling?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'dependency_intent_template',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplateCode=concrete_specimen_witness_sampling_to_pour_quality_release',
          'materializeDirection=target_depends_on_source',
        ]),
      }),
    ]))
    expect(witnessSampling?.predecessorClientRowIds).not.toContain(concretePreparation?.clientRowId)
    expect(witnessSampling?.predecessorClientRowIds).not.toContain(concreteEmbedReview?.clientRowId)
    expect(concreteEntityQuality?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: mainStructureAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'dependency_intent_template',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplateCode=main_structure_acceptance_milestone_to_entity_quality_release',
          'materializeDirection=target_depends_on_source',
        ]),
      }),
    ]))
    expect(witnessSampling?.values.standard_task_metadata).toEqual(expect.objectContaining({
      referencedCoreQualityCodes: expect.arrayContaining(['02-01-03-P05', '02-01-03-P06']),
      relationRole: 'evidence',
    }))
    expect(mainStructureAcceptance?.values.standard_task_metadata).toEqual(expect.objectContaining({
      planItemKind: 'linked_projection',
      scheduleParticipation: 'read_only_projection',
      progressMode: 'inherited',
      isAcceptanceMilestone: true,
      acceptanceLinkRule: expect.objectContaining({
        referencedTable: 'acceptance_plans',
        bindingMode: 'read_only_projection',
      }),
    }))
  }, 30000)

  it('materializes civil lag review fixes as generated process dependencies', async () => {
    const concreteGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-civil-lag-concrete-strength',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-03'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          element_variant_codes: ['cantilever'],
        },
      },
    })
    const concreteRowByStableCode = new Map(concreteGenerated.rows.map((row) => [stableCodeOf(row), row]))
    const sameConditionSpecimen = concreteRowByStableCode.get('02-01-03-P14')
    const removalStrengthReview = concreteRowByStableCode.get('02-01-03-P15')

    expect(sameConditionSpecimen).toBeTruthy()
    expect(removalStrengthReview?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: sameConditionSpecimen?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'sibling_sequence',
      }),
    ]))
    const removalStrengthInternalFlow = (removalStrengthReview?.values.standard_task_metadata as any)?.internalFlow
    expect(removalStrengthInternalFlow).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      seedRuleId: expect.stringContaining('same-condition-specimen-to-removal-strength-report'),
      lagDays: 1,
      reasonCode: 'FORMWORK_REMOVAL_CANTILEVER_REQUIRES_100_PERCENT_STRENGTH',
      appliedConditionalEffectIds: expect.arrayContaining(['formwork-removal-strength-cantilever-member']),
    }))
    expect((removalStrengthInternalFlow?.evidenceCodes ?? []).map((code: unknown) => String(code).toUpperCase())).toEqual(expect.arrayContaining(['GB50204', 'GB50300']))

    const makePileGenerated = (methodVariantCodes: string[]) => generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: `batch-civil-lag-pile-${methodVariantCodes.join('-') || 'base'}`,
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['01-02-08'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          method_variant_codes: methodVariantCodes,
        },
      },
    })

    const basePileGenerated = await makePileGenerated([])
    const staticLoadPileGenerated = await makePileGenerated(['static_load'])
    const basePileRowByStableCode = new Map(basePileGenerated.rows.map((row) => [stableCodeOf(row), row]))
    const staticLoadPileRowByStableCode = new Map(staticLoadPileGenerated.rows.map((row) => [stableCodeOf(row), row]))
    const basePileIntegrity = basePileRowByStableCode.get('01-02-08-P10')
    const basePileAcceptance = basePileRowByStableCode.get('01-02-08-P11')
    const staticLoadPileIntegrity = staticLoadPileRowByStableCode.get('01-02-08-P10')
    const staticLoadPileAcceptance = staticLoadPileRowByStableCode.get('01-02-08-P11')

    expect(basePileIntegrity).toBeTruthy()
    expect(basePileAcceptance?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: basePileIntegrity?.clientRowId,
        dependencyType: 'FS',
        lagDays: 7,
        source: 'sibling_sequence',
      }),
    ]))
    const basePileInternalFlow = (basePileAcceptance?.values.standard_task_metadata as any)?.internalFlow
    expect(basePileInternalFlow).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      seedRuleId: expect.stringContaining('pile-integrity-test-to-pile-foundation-acceptance'),
      lagDays: 7,
    }))
    expect((basePileInternalFlow?.evidenceCodes ?? []).map((code: unknown) => String(code).toUpperCase())).toEqual(expect.arrayContaining(['GB50202', 'JGJ106', 'GB50300']))
    expect(staticLoadPileIntegrity).toBeTruthy()
    expect(staticLoadPileAcceptance?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: staticLoadPileIntegrity?.clientRowId,
        dependencyType: 'FS',
        lagDays: 28,
        source: 'sibling_sequence',
      }),
    ]))
    const staticLoadPileInternalFlow = (staticLoadPileAcceptance?.values.standard_task_metadata as any)?.internalFlow
    expect(staticLoadPileInternalFlow).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      seedRuleId: expect.stringContaining('pile-integrity-test-to-pile-foundation-acceptance'),
      lagDays: 28,
      reasonCode: 'PILE_TEST_METHOD_REQUIRES_28_DAY_AGE_BEFORE_ACCEPTANCE',
      appliedConditionalEffectIds: expect.arrayContaining(['pile-integrity-static-high-strain-core-age-wait']),
    }))
    expect((staticLoadPileInternalFlow?.evidenceCodes ?? []).map((code: unknown) => String(code).toUpperCase())).toEqual(expect.arrayContaining(['GB50202', 'JGJ106', 'GB50300']))
  }, 30000)

  it('materializes hospital cleanroom cross-pack validation dependencies at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cleanroom-process-cross-pack',
        templateId: 'china-cleanroom-medical-specialty',
        selectedNodeIds: ['CLN-01-01-01', 'CLN-02-01-01', 'CLN-02-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'clean-zone-1',
          project_type_code: 'hospital',
          method_variant_codes: ['clean_surgery', 'cleanroom_third_party_validation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const enclosureAcceptance = rowByStableCode.get('CLN-01-01-01-P11')
    const cleanAirParticleTest = rowByStableCode.get('CLN-02-01-01-P05')
    const cleanHvacAcceptance = rowByStableCode.get('CLN-02-01-01-P11')
    const thirdPartyValidation = rowByStableCode.get('CLN-02-01-02-P04')

    expect(enclosureAcceptance).toBeTruthy()
    expect(cleanAirParticleTest?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: enclosureAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:cleanroom_enclosure_acceptance_to_air_particle_validation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(cleanAirParticleTest?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'cleanroom_enclosure_acceptance_to_air_particle_validation_process',
          predecessorStableCode: 'CLN-01-01-01-P11',
          successorStableCode: 'CLN-02-01-01-P05',
          scopeRule: 'same_zone',
        }),
      ]),
    }))

    expect(cleanHvacAcceptance).toBeTruthy()
    expect(thirdPartyValidation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: cleanHvacAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:cleanroom_air_acceptance_to_third_party_validation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(thirdPartyValidation?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'cleanroom_air_acceptance_to_third_party_validation_process',
          predecessorStableCode: 'CLN-02-01-01-P11',
          successorStableCode: 'CLN-02-01-02-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('applies L3 conditional lag profiles to emitted cross-item workflow dependencies', async () => {
    const makeGenerated = (variant: string, projectFacts: Record<string, unknown>) => generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: `batch-cleanroom-conditional-lag-${variant}`,
        templateId: 'china-cleanroom-medical-specialty',
        selectedNodeIds: ['CLN-02-01-01', 'CLN-02-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'clean-zone-1',
          project_type_code: 'hospital',
        },
        projectFacts: {
          projectTypeCode: 'hospital',
          ...projectFacts,
        },
      },
    })

    const findWorkflowEdge = (
      generated: Awaited<ReturnType<typeof generateWbsTemplateRows>>,
      expectedLagDays: number,
      expectedProfileCode: string | null,
    ) => {
      const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
      const cleanHvacAcceptance = rowByStableCode.get('CLN-02-01-01-P11')
      const thirdPartyValidation = rowByStableCode.get('CLN-02-01-02-P04')
      const dependency = thirdPartyValidation?.predecessorDependencies.find((candidate) => (
        candidate.source === 'cross_item_workflow'
        && candidate.intentCode === 'cross-item:cleanroom_air_acceptance_to_third_party_validation_process'
      ))
      const metadata = thirdPartyValidation?.values.standard_task_metadata as Record<string, any> | undefined
      const workflowEntry = (metadata?.crossItemWorkflow ?? []).find((entry: Record<string, unknown>) => (
        entry.ruleCode === 'cleanroom_air_acceptance_to_third_party_validation_process'
      ))

      expect(cleanHvacAcceptance).toBeTruthy()
      expect(thirdPartyValidation).toBeTruthy()
      expect(dependency).toEqual(expect.objectContaining({
        clientRowId: cleanHvacAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: expectedLagDays,
        baseLagDays: 1,
        effectiveLagDays: expectedLagDays,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:cleanroom_air_acceptance_to_third_party_validation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }))
      if (expectedProfileCode) {
        expect(dependency).toEqual(expect.objectContaining({
          conditionalLagProfileCode: expectedProfileCode,
          appliedConditionalLagProfileCode: expectedProfileCode,
          conditionalLagTriggerSignals: expect.arrayContaining(['third_party_validation_required']),
        }))
      } else {
        expect((dependency as Record<string, unknown> | undefined)?.conditionalLagProfileCode ?? null).toBeNull()
      }
      expect(workflowEntry).toEqual(expect.objectContaining({
        ruleCode: 'cleanroom_air_acceptance_to_third_party_validation_process',
        predecessorStableCode: 'CLN-02-01-01-P11',
        successorStableCode: 'CLN-02-01-02-P04',
        baseLagDays: 1,
        effectiveLagDays: expectedLagDays,
        lagDays: expectedLagDays,
        scopeRule: 'same_zone',
      }))
      return workflowEntry as Record<string, any>
    }

    const baseWorkflow = findWorkflowEdge(await makeGenerated('base', { hardConstraintCodes: [] }), 1, null)
    const triggeredWorkflow = findWorkflowEdge(
      await makeGenerated('hard-constraint', { hardConstraintCodes: ['third_party_validation_required'] }),
      5,
      'strict_cleanliness_or_data_center_integrated_validation',
    )
    const projectFeatureTriggeredWorkflow = findWorkflowEdge(
      await makeGenerated('project-feature', {
        projectFeatures: {
          third_party_validation_required: true,
        },
      }),
      5,
      'strict_cleanliness_or_data_center_integrated_validation',
    )
    const exposedProfileValues = [
      triggeredWorkflow.appliedConditionalLagProfileCode,
      triggeredWorkflow.appliedConditionalLagProfileConditionCode,
      triggeredWorkflow.conditionalLagProfileCode,
      triggeredWorkflow.appliedConditionalLagProfile?.conditionCode,
    ].filter(Boolean)

    expect(baseWorkflow.appliedConditionalLagProfileCode ?? baseWorkflow.conditionalLagProfileCode ?? null).toBeNull()
    if (exposedProfileValues.length > 0) {
      expect(exposedProfileValues).toContain('strict_cleanliness_or_data_center_integrated_validation')
    }
    expect(projectFeatureTriggeredWorkflow.conditionalLagTriggerSignals).toEqual(expect.arrayContaining([
      'third_party_validation_required',
    ]))
  }, 30000)

  it('materializes hospital medical-gas acceptance release to special-room functional commissioning at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cleanroom-medgas-special-room-process-release',
        templateId: 'china-cleanroom-medical-specialty',
        selectedNodeIds: ['CLN-01-01-02', 'CLN-03-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'clean-zone-1',
          project_type_code: 'hospital',
          method_variant_codes: ['medical_gas_commissioning', 'special_room_validation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const medicalGasAcceptance = rowByStableCode.get('CLN-01-01-02-P10')
    const specialRoomFunctionalCommissioning = rowByStableCode.get('CLN-03-01-01-P07')

    expect(medicalGasAcceptance).toBeTruthy()
    expect(specialRoomFunctionalCommissioning?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: medicalGasAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:medical_gas_acceptance_to_special_room_functional_commissioning_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(specialRoomFunctionalCommissioning?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'medical_gas_acceptance_to_special_room_functional_commissioning_process',
          predecessorStableCode: 'CLN-01-01-02-P10',
          successorStableCode: 'CLN-03-01-01-P07',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes hospital nurse-call alarm test release to special-room functional commissioning at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cleanroom-nurse-call-special-room-process-release',
        templateId: 'china-cleanroom-medical-specialty',
        selectedNodeIds: ['CLN-03-01-05', 'CLN-03-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'clean-zone-1',
          project_type_code: 'hospital',
          method_variant_codes: ['nurse_call_commissioning', 'special_room_validation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const nurseCallAlarmTest = rowByStableCode.get('CLN-03-01-05-P05')
    const specialRoomFunctionalCommissioning = rowByStableCode.get('CLN-03-01-01-P07')

    expect(nurseCallAlarmTest).toBeTruthy()
    expect(specialRoomFunctionalCommissioning?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: nurseCallAlarmTest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:nurse_call_alarm_test_to_special_room_functional_commissioning_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(specialRoomFunctionalCommissioning?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'nurse_call_alarm_test_to_special_room_functional_commissioning_process',
          predecessorStableCode: 'CLN-03-01-05-P05',
          successorStableCode: 'CLN-03-01-01-P07',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes hospital special-room functional commissioning release to medical process trial run at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cleanroom-special-room-medical-process-trial-run',
        templateId: 'china-cleanroom-medical-specialty',
        selectedNodeIds: ['CLN-03-01-01', 'CLN-02-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'clean-zone-1',
          project_type_code: 'hospital',
          method_variant_codes: ['special_room_validation', 'medical_process_trial_run'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const specialRoomFunctionalCommissioning = rowByStableCode.get('CLN-03-01-01-P07')
    const medicalProcessTrialRun = rowByStableCode.get('CLN-02-01-02-P06')

    expect(specialRoomFunctionalCommissioning).toBeTruthy()
    expect(medicalProcessTrialRun?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: specialRoomFunctionalCommissioning?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:special_room_functional_commissioning_to_medical_process_trial_run_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(medicalProcessTrialRun?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'special_room_functional_commissioning_to_medical_process_trial_run_process',
          predecessorStableCode: 'CLN-03-01-01-P07',
          successorStableCode: 'CLN-02-01-02-P06',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center process cross-pack commissioning dependencies', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-process-cross-pack',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-01-01-01', 'DTC-02-01-01', 'DTC-02-01-02', 'DTC-02-02-01', 'DTC-02-02-02', 'DTC-03-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'precision_cooling', 'environment_monitoring', 'gas_suppression_fire_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const envelopeAirtightRetest = rowByStableCode.get('DTC-01-01-01-P04')
    const precisionAcBalance = rowByStableCode.get('DTC-02-02-01-P04')
    const upsLoadTransferTest = rowByStableCode.get('DTC-02-01-01-P04')
    const generatorEmergencyRecoveryTest = rowByStableCode.get('DTC-02-01-02-P04')
    const fireLinkageEmergencySwitch = rowByStableCode.get('DTC-03-01-02-P04')
    const remoteAlarmMonitoring = rowByStableCode.get('DTC-02-02-02-P04')

    expect(envelopeAirtightRetest).toBeTruthy()
    expect(precisionAcBalance?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: envelopeAirtightRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_envelope_airtightness_to_precision_ac_balance_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(precisionAcBalance?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_envelope_airtightness_to_precision_ac_balance_process',
          predecessorStableCode: 'DTC-01-01-01-P04',
          successorStableCode: 'DTC-02-02-01-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))

    expect(upsLoadTransferTest).toBeTruthy()
    expect(remoteAlarmMonitoring?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: upsLoadTransferTest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_ups_transfer_to_environment_monitoring_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(remoteAlarmMonitoring?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_ups_transfer_to_environment_monitoring_process',
          predecessorStableCode: 'DTC-02-01-01-P04',
          successorStableCode: 'DTC-02-02-02-P04',
          scopeRule: 'same_system',
        }),
      ]),
    }))

    expect(generatorEmergencyRecoveryTest).toBeTruthy()
    expect(remoteAlarmMonitoring?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: generatorEmergencyRecoveryTest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_generator_recovery_to_environment_monitoring_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(remoteAlarmMonitoring?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_generator_recovery_to_environment_monitoring_process',
          predecessorStableCode: 'DTC-02-01-02-P04',
          successorStableCode: 'DTC-02-02-02-P04',
          scopeRule: 'same_system',
        }),
      ]),
    }))

    expect(precisionAcBalance).toBeTruthy()
    expect(remoteAlarmMonitoring?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: precisionAcBalance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_precision_cooling_balance_to_environment_monitoring_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(remoteAlarmMonitoring?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_precision_cooling_balance_to_environment_monitoring_process',
          predecessorStableCode: 'DTC-02-02-01-P04',
          successorStableCode: 'DTC-02-02-02-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))

    expect(fireLinkageEmergencySwitch).toBeTruthy()
    expect(remoteAlarmMonitoring?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: fireLinkageEmergencySwitch?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_fire_linkage_test_to_environment_monitoring_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(remoteAlarmMonitoring?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_fire_linkage_test_to_environment_monitoring_process',
          predecessorStableCode: 'DTC-03-01-02-P04',
          successorStableCode: 'DTC-02-02-02-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center very-early smoke alarm testing to gas suppression discharge interlock at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-vesda-gas-suppression-interlock',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-23', 'DTC-04-01-22'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'very_early_smoke_detection', 'gas_suppression_interlock'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const smokeAlarmSimulationTest = rowByStableCode.get('DTC-04-01-23-P09')
    const gasSuppressionDischargeInterlock = rowByStableCode.get('DTC-04-01-22-P09')

    expect(smokeAlarmSimulationTest).toBeTruthy()
    expect(gasSuppressionDischargeInterlock?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: smokeAlarmSimulationTest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_very_early_smoke_alarm_to_gas_suppression_discharge_interlock_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(gasSuppressionDischargeInterlock?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_very_early_smoke_alarm_to_gas_suppression_discharge_interlock_process',
          predecessorStableCode: 'DTC-04-01-23-P09',
          successorStableCode: 'DTC-04-01-22-P09',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center fuel-tank handover to generator emergency recovery at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-fuel-tank-generator-recovery',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-09', 'DTC-02-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'generator_backup_power'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const fuelTankSystemHandover = rowByStableCode.get('DTC-04-01-09-P10')
    const generatorEmergencyRecoveryTest = rowByStableCode.get('DTC-02-01-02-P04')

    expect(fuelTankSystemHandover).toBeTruthy()
    expect(generatorEmergencyRecoveryTest?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: fuelTankSystemHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_fuel_tank_handover_to_generator_recovery_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(generatorEmergencyRecoveryTest?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_fuel_tank_handover_to_generator_recovery_process',
          predecessorStableCode: 'DTC-04-01-09-P10',
          successorStableCode: 'DTC-02-01-02-P04',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center generator exhaust handover to exhaust-cooling continuous run at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-generator-exhaust-continuous-run',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-10', 'DTC-02-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'generator_backup_power', 'generator_exhaust_silencer'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const exhaustSilencerAcceptance = rowByStableCode.get('DTC-04-01-10-P10')
    const exhaustCoolingContinuousRun = rowByStableCode.get('DTC-02-01-02-P08')

    expect(exhaustSilencerAcceptance).toBeTruthy()
    expect(exhaustCoolingContinuousRun?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: exhaustSilencerAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_generator_exhaust_handover_to_continuous_run_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(exhaustCoolingContinuousRun?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_generator_exhaust_handover_to_continuous_run_process',
          predecessorStableCode: 'DTC-04-01-10-P10',
          successorStableCode: 'DTC-02-01-02-P08',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center high-voltage energization to UPS load-transfer commissioning at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-high-voltage-ups-load-transfer',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-11', 'DTC-02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'high_voltage', 'ups_parallel_system'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const highVoltageEnergization = rowByStableCode.get('DTC-04-01-11-P12')
    const upsLoadTransferCommissioning = rowByStableCode.get('DTC-02-01-01-P04')

    expect(highVoltageEnergization).toBeTruthy()
    expect(upsLoadTransferCommissioning?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: highVoltageEnergization?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_high_voltage_energization_to_ups_load_transfer_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(upsLoadTransferCommissioning?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_high_voltage_energization_to_ups_load_transfer_process',
          predecessorStableCode: 'DTC-04-01-11-P12',
          successorStableCode: 'DTC-02-01-01-P04',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center low-voltage ATS transfer to UPS load-transfer commissioning at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-ats-ups-load-transfer',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-12', 'DTC-02-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'dual_power_path', 'ats_transfer', 'ups_parallel_system'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const atsTransferTest = rowByStableCode.get('DTC-04-01-12-P09')
    const upsLoadTransferCommissioning = rowByStableCode.get('DTC-02-01-01-P04')

    expect(atsTransferTest).toBeTruthy()
    expect(upsLoadTransferCommissioning?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: atsTransferTest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_low_voltage_ats_transfer_to_ups_load_transfer_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(upsLoadTransferCommissioning?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_low_voltage_ats_transfer_to_ups_load_transfer_process',
          predecessorStableCode: 'DTC-04-01-12-P09',
          successorStableCode: 'DTC-02-01-01-P04',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center UPS load-transfer commissioning to IT load-simulation power run at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-ups-it-load-simulation',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-02-01-01', 'DTC-04-01-25'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'dual_power_path', 'load_bank_test', 'it_load_simulation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const upsLoadTransferCommissioning = rowByStableCode.get('DTC-02-01-01-P04')
    const itLoadSimulationPowerRun = rowByStableCode.get('DTC-04-01-25-P03')

    expect(upsLoadTransferCommissioning).toBeTruthy()
    expect(itLoadSimulationPowerRun?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: upsLoadTransferCommissioning?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_ups_load_transfer_to_it_load_simulation_power_run_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(itLoadSimulationPowerRun?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_ups_load_transfer_to_it_load_simulation_power_run_process',
          predecessorStableCode: 'DTC-02-01-01-P04',
          successorStableCode: 'DTC-04-01-25-P03',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center precision-cooling continuous run to IT load-simulation cooling run at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-cooling-it-load-simulation',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-02-02-01', 'DTC-04-01-25'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'precision_cooling', 'high_density_room', 'it_load_simulation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const precisionCoolingContinuousRun = rowByStableCode.get('DTC-02-02-01-P05')
    const itLoadSimulationCoolingRun = rowByStableCode.get('DTC-04-01-25-P04')

    expect(precisionCoolingContinuousRun).toBeTruthy()
    expect(itLoadSimulationCoolingRun?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: precisionCoolingContinuousRun?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_precision_cooling_continuous_run_to_it_load_simulation_cooling_run_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(itLoadSimulationCoolingRun?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_precision_cooling_continuous_run_to_it_load_simulation_cooling_run_process',
          predecessorStableCode: 'DTC-02-02-01-P05',
          successorStableCode: 'DTC-04-01-25-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center environment monitoring linkage to IT load-simulation data collection at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-monitoring-it-load-simulation',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-02-02-02', 'DTC-04-01-25'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'environment_monitoring', 'it_load_simulation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const environmentMonitoringLinkage = rowByStableCode.get('DTC-02-02-02-P04')
    const itLoadSimulationDataCollection = rowByStableCode.get('DTC-04-01-25-P05')

    expect(environmentMonitoringLinkage).toBeTruthy()
    expect(itLoadSimulationDataCollection?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: environmentMonitoringLinkage?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_environment_monitoring_linkage_to_it_load_simulation_data_collection_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(itLoadSimulationDataCollection?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_environment_monitoring_linkage_to_it_load_simulation_data_collection_process',
          predecessorStableCode: 'DTC-02-02-02-P04',
          successorStableCode: 'DTC-04-01-25-P05',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center water-leak alarm retest to DCIM alarm policy trial run at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-water-leak-dcim-alarm-policy',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-17', 'DTC-04-01-18'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'water_leak_detection', 'dcim_alarm_policy'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const waterLeakAlarmRetest = rowByStableCode.get('DTC-04-01-17-P09')
    const dcimAlarmPolicyTrialRun = rowByStableCode.get('DTC-04-01-18-P09')

    expect(waterLeakAlarmRetest).toBeTruthy()
    expect(dcimAlarmPolicyTrialRun?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: waterLeakAlarmRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_water_leak_alarm_retest_to_dcim_alarm_policy_trial_run_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(dcimAlarmPolicyTrialRun?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_water_leak_alarm_retest_to_dcim_alarm_policy_trial_run_process',
          predecessorStableCode: 'DTC-04-01-17-P09',
          successorStableCode: 'DTC-04-01-18-P09',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center DCIM point collection to BMS data-boundary validation at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-dcim-bms-data-boundary',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-18', 'DTC-04-01-19'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'dcim_point_collection', 'bms_interface'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const dcimPointCollection = rowByStableCode.get('DTC-04-01-18-P08')
    const bmsDataBoundaryValidation = rowByStableCode.get('DTC-04-01-19-P05')

    expect(dcimPointCollection).toBeTruthy()
    expect(bmsDataBoundaryValidation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: dcimPointCollection?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_dcim_point_collection_to_bms_data_boundary_validation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(bmsDataBoundaryValidation?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_dcim_point_collection_to_bms_data_boundary_validation_process',
          predecessorStableCode: 'DTC-04-01-18-P08',
          successorStableCode: 'DTC-04-01-19-P05',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center network link certification to BMS gateway/controller access at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-network-link-bms-gateway-access',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-24', 'DTC-04-01-19'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'network_link_certification', 'bms_gateway_controller'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const networkLinkCertification = rowByStableCode.get('DTC-04-01-24-P04')
    const bmsGatewayControllerAccess = rowByStableCode.get('DTC-04-01-19-P02')

    expect(networkLinkCertification).toBeTruthy()
    expect(bmsGatewayControllerAccess?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: networkLinkCertification?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_network_link_certification_to_bms_gateway_controller_access_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(bmsGatewayControllerAccess?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_network_link_certification_to_bms_gateway_controller_access_process',
          predecessorStableCode: 'DTC-04-01-24-P04',
          successorStableCode: 'DTC-04-01-19-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center network link certification to DCIM point collection at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-network-link-dcim-point-collection',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-24', 'DTC-04-01-18'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'network_link_certification', 'dcim_point_collection'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const networkLinkCertification = rowByStableCode.get('DTC-04-01-24-P04')
    const dcimPointCollection = rowByStableCode.get('DTC-04-01-18-P08')

    expect(networkLinkCertification).toBeTruthy()
    expect(dcimPointCollection?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: networkLinkCertification?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_network_link_certification_to_dcim_point_collection_integration_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(dcimPointCollection?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_network_link_certification_to_dcim_point_collection_integration_process',
          predecessorStableCode: 'DTC-04-01-24-P04',
          successorStableCode: 'DTC-04-01-18-P08',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center network link certification to security video storage access at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-network-link-security-video-storage',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-24', 'DTC-04-01-20'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'network_link_certification', 'security_video_storage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const networkLinkCertification = rowByStableCode.get('DTC-04-01-24-P04')
    const securityVideoStorageAccess = rowByStableCode.get('DTC-04-01-20-P03')

    expect(networkLinkCertification).toBeTruthy()
    expect(securityVideoStorageAccess?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: networkLinkCertification?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_network_link_certification_to_security_video_storage_access_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(securityVideoStorageAccess?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_network_link_certification_to_security_video_storage_access_process',
          predecessorStableCode: 'DTC-04-01-24-P04',
          successorStableCode: 'DTC-04-01-20-P03',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center network link certification to visitor registration terminal deployment at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-network-link-visitor-terminal',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-24', 'DTC-04-01-20'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'network_link_certification', 'visitor_registration_terminal'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const networkLinkCertification = rowByStableCode.get('DTC-04-01-24-P04')
    const visitorRegistrationTerminal = rowByStableCode.get('DTC-04-01-20-P04')

    expect(networkLinkCertification).toBeTruthy()
    expect(visitorRegistrationTerminal?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: networkLinkCertification?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_network_link_certification_to_visitor_registration_terminal_deployment_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(visitorRegistrationTerminal?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_network_link_certification_to_visitor_registration_terminal_deployment_process',
          predecessorStableCode: 'DTC-04-01-24-P04',
          successorStableCode: 'DTC-04-01-20-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center network link certification to perimeter alarm night-lighting linkage at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-network-link-perimeter-alarm-lighting',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-24', 'DTC-04-01-21'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'network_link_certification', 'perimeter_alarm_lighting_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const networkLinkCertification = rowByStableCode.get('DTC-04-01-24-P04')
    const perimeterAlarmNightLightingLinkage = rowByStableCode.get('DTC-04-01-21-P04')

    expect(networkLinkCertification).toBeTruthy()
    expect(perimeterAlarmNightLightingLinkage?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: networkLinkCertification?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_network_link_certification_to_perimeter_alarm_night_lighting_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(perimeterAlarmNightLightingLinkage?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_network_link_certification_to_perimeter_alarm_night_lighting_linkage_process',
          predecessorStableCode: 'DTC-04-01-24-P04',
          successorStableCode: 'DTC-04-01-21-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center IT load-simulation recovery to single-path failover drill at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-it-load-simulation-failover',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-25', 'DTC-04-01-26'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'it_load_simulation', 'dual_power_path', 'single_path_failover'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const itLoadSimulationRecovery = rowByStableCode.get('DTC-04-01-25-P11')
    const singlePathFailoverDrill = rowByStableCode.get('DTC-04-01-26-P08')

    expect(itLoadSimulationRecovery).toBeTruthy()
    expect(singlePathFailoverDrill?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: itLoadSimulationRecovery?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_it_load_simulation_recovery_to_single_path_failover_drill_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(singlePathFailoverDrill?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_it_load_simulation_recovery_to_single_path_failover_drill_process',
          predecessorStableCode: 'DTC-04-01-25-P11',
          successorStableCode: 'DTC-04-01-26-P08',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes data-center single-path failover record to full-site outage drill at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-data-center-failover-full-site-outage',
        templateId: 'china-data-center-specialty',
        selectedNodeIds: ['DTC-04-01-26', 'DTC-04-01-27'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'data-hall-1',
          project_type_code: 'data_center',
          method_variant_codes: ['tier3_data_center', 'dual_power_path', 'single_path_failover', 'full_site_outage_drill'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const criticalLoadNoBreakRecordReview = rowByStableCode.get('DTC-04-01-26-P09')
    const fullSiteOutageDrillExecution = rowByStableCode.get('DTC-04-01-27-P07')

    expect(criticalLoadNoBreakRecordReview).toBeTruthy()
    expect(criticalLoadNoBreakRecordReview?.values.duration_contribution_mode).toBe('quality_gate')
    expect(fullSiteOutageDrillExecution?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: criticalLoadNoBreakRecordReview?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:data_center_single_path_failover_record_to_full_site_outage_drill_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(fullSiteOutageDrillExecution?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'data_center_single_path_failover_record_to_full_site_outage_drill_process',
          predecessorStableCode: 'DTC-04-01-26-P09',
          successorStableCode: 'DTC-04-01-27-P07',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('creates cross-item workflow dependencies between package-level item works under the same division', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cross-item-workflow',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01', '01-02-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
        },
      },
    })

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const pitSupport = rowByStableCode.get('01-03-01')
    const foundationWorks = rowByStableCode.get('01-02-01')

    expect(pitSupport).toBeTruthy()
    expect(foundationWorks).toBeTruthy()
    expect(foundationWorks?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: pitSupport?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:foundation_pit_to_foundation_work',
        relationRole: 'workflow',
      }),
    ]))
    expect(foundationWorks?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          source: 'v1.4.7.5_cross_item_workflow',
          sourceType: 'cross_item_workflow',
          ruleCode: 'foundation_pit_to_foundation_work',
          predecessorStableCode: '01-03-01',
          successorStableCode: '01-02-01',
          autoApplyPolicy: 'confirmed_template_only',
        }),
      ]),
    }))
  }, 30000)

  it('applies cross-item workflow scope rules without leaking same-floor dependencies across floors', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cross-item-scope',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-03', '02-02-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floorIds: ['floor-1', 'floor-2'],
          project_type_code: 'residential',
        },
      },
    })

    const rowsByStableCode = (stableCode: string) => generated.rows.filter((row) => (
      String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '') === stableCode
    ))
    const structureRows = rowsByStableCode('02-01-03')
    const masonryRows = rowsByStableCode('02-02-01')

    expect(structureRows.map((row) => row.values.floor_object_id).sort()).toEqual(['floor-1', 'floor-2'])
    expect(masonryRows.map((row) => row.values.floor_object_id).sort()).toEqual(['floor-1', 'floor-2'])

    for (const masonryRow of masonryRows) {
      const sameFloorStructure = structureRows.find((row) => row.values.floor_object_id === masonryRow.values.floor_object_id)
      const otherFloorStructure = structureRows.find((row) => row.values.floor_object_id !== masonryRow.values.floor_object_id)

      expect(masonryRow.predecessorDependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: sameFloorStructure?.clientRowId,
          source: 'cross_item_workflow',
          intentCode: 'cross-item:main_structure_to_masonry_infill',
        }),
      ]))
      expect(masonryRow.predecessorDependencies).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: otherFloorStructure?.clientRowId,
          source: 'cross_item_workflow',
          intentCode: 'cross-item:main_structure_to_masonry_infill',
        }),
      ]))
    }
  }, 30000)

  it('applies P1 cross-item workflow rules for renovation, MiC, and industrial cleanroom package handoffs', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cross-item-p1',
        primaryCatalogId: 'china-renovation-retrofit-specialty',
        templateIds: [
          'china-renovation-retrofit-specialty',
          'china-modular-mic-specialty',
          'china-industrial-cleanroom-specialty',
        ],
        selectedNodesByTemplate: {
          'china-renovation-retrofit-specialty': ['RNV-01', 'RNV-02-01'],
          'china-modular-mic-specialty': ['MIC-03', 'MIC-04'],
          'china-industrial-cleanroom-specialty': ['ICR-02', 'ICR-03'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
        },
      },
    })

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const renovationSurvey = rowByStableCode.get('RNV-01')
    const renovationReinforcement = rowByStableCode.get('RNV-02-01')
    const micReceiving = rowByStableCode.get('MIC-03')
    const micHoist = rowByStableCode.get('MIC-04')
    const cleanroomEnvelope = rowByStableCode.get('ICR-02')
    const cleanroomProcess = rowByStableCode.get('ICR-03')

    expect(renovationReinforcement?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: renovationSurvey?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:renovation_survey_demolition_to_structural_reinforcement',
      }),
    ]))
    expect(micHoist?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: micReceiving?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mic_transport_receiving_to_site_hoist_connection',
      }),
    ]))
    expect(cleanroomProcess?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: cleanroomEnvelope?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:industrial_cleanroom_envelope_to_process_power_environment',
      }),
    ]))
  }, 30000)

  it('applies prefab package handoffs, next-floor grouting release, and PCF water-test gates', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cross-item-prefab',
        primaryCatalogId: 'china-prefabricated-assembly',
        selectedNodesByTemplate: {
          'china-prefabricated-assembly': [
            'PFB-00-01-01',
            'PFB-00-01-02',
            'PFB-00-01-03',
            'PFB-01-01-01',
            'PFB-01-01-03',
            'PFB-02-01-01',
            'PFB-02-01-04',
            'PFB-02-01-05',
            'PFB-03-01-01',
            'PFB-03-01-02',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [
            { id: 'floor-1', label: '1F', levelNumber: 1 },
            { id: 'floor-2', label: '2F', levelNumber: 2 },
          ],
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
        },
      },
    })

    const rowsByStableCode = (stableCode: string) => generated.rows.filter((row) => stableCodeOf(row) === stableCode)
    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const deepening = rowByStableCode.get('PFB-00-01-01')
    const production = rowByStableCode.get('PFB-00-01-02')
    const transport = rowByStableCode.get('PFB-00-01-03')
    const firstInspection = rowByStableCode.get('PFB-01-01-01')
    const wallHoists = rowsByStableCode('PFB-01-01-03')
    const groutingRows = rowsByStableCode('PFB-02-01-01')
    const jointWaterproofRows = rowsByStableCode('PFB-02-01-04')
    const prefabInteriorRows = rowsByStableCode('PFB-02-01-05')
    const entityTest = rowByStableCode.get('PFB-03-01-01')
    const assemblyRate = rowByStableCode.get('PFB-03-01-02')

    expect(production?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: deepening?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_deepening_freeze_to_factory_production',
      }),
    ]))
    expect(transport?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: production?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_factory_production_to_transport_receiving',
      }),
    ]))
    expect(firstInspection?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: transport?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_transport_receiving_to_first_batch_full_inspection',
      }),
    ]))

    const firstFloorWallHoist = wallHoists.find((row) => row.values.floor_object_id === 'floor-1')
    const secondFloorWallHoist = wallHoists.find((row) => row.values.floor_object_id === 'floor-2')
    const firstFloorGrouting = groutingRows.find((row) => row.values.floor_object_id === 'floor-1')
    const secondFloorGrouting = groutingRows.find((row) => row.values.floor_object_id === 'floor-2')

    expect(firstFloorWallHoist?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_first_batch_inspection_to_wall_column_hoist',
      }),
    ]))
    expect(secondFloorWallHoist?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: firstFloorGrouting?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_grouting_quality_to_next_floor_vertical_hoist',
      }),
    ]))
    expect(firstFloorWallHoist?.predecessorDependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: firstFloorGrouting?.clientRowId,
        intentCode: 'cross-item:prefab_grouting_quality_to_next_floor_vertical_hoist',
      }),
    ]))
    expect(secondFloorWallHoist?.predecessorDependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: secondFloorGrouting?.clientRowId,
        intentCode: 'cross-item:prefab_grouting_quality_to_next_floor_vertical_hoist',
      }),
    ]))

    const firstFloorJointWaterproof = jointWaterproofRows.find((row) => row.values.floor_object_id === 'floor-1')
    const firstFloorPrefabInterior = prefabInteriorRows.find((row) => row.values.floor_object_id === 'floor-1')
    expect(firstFloorPrefabInterior?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: firstFloorJointWaterproof?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_pcf_water_test_to_prefab_interior',
      }),
    ]))

    expect(assemblyRate?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: entityTest?.clientRowId,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_joint_quality_to_assembly_rate_assessment',
      }),
    ]))
  }, 30000)

  it('materializes prefab factory and yard release dependencies at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-process-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-00-01-02',
          'PFB-00-01-03',
          'PFB-01-01-01',
          'PFB-01-01-03',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'prefab-yard-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const factoryCertificate = rowByStableCode.get('PFB-00-01-02-P15')
    const siteUnloading = rowByStableCode.get('PFB-00-01-03-P03')
    const yardDefectClosure = rowByStableCode.get('PFB-00-01-03-P12')
    const firstBatchConnectionCheck = rowByStableCode.get('PFB-01-01-01-P05')
    const firstBatchDefectClosure = rowByStableCode.get('PFB-01-01-01-P10')
    const verticalComponentHoist = rowByStableCode.get('PFB-01-01-03-P10')

    expect(factoryCertificate).toBeTruthy()
    expect(siteUnloading?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: factoryCertificate?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_factory_certificate_to_site_unloading_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(siteUnloading?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'prefab_factory_certificate_to_site_unloading_process',
          predecessorStableCode: 'PFB-00-01-02-P15',
          successorStableCode: 'PFB-00-01-03-P03',
          scopeRule: 'same_floor',
        }),
      ]),
    }))

    expect(yardDefectClosure).toBeTruthy()
    expect(firstBatchConnectionCheck?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: yardDefectClosure?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_yard_defect_closure_to_first_batch_connection_check_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(firstBatchConnectionCheck?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'prefab_yard_defect_closure_to_first_batch_connection_check_process',
          predecessorStableCode: 'PFB-00-01-03-P12',
          successorStableCode: 'PFB-01-01-01-P05',
          scopeRule: 'same_floor',
        }),
      ]),
    }))

    expect(firstBatchDefectClosure).toBeTruthy()
    expect(verticalComponentHoist?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: firstBatchDefectClosure?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_first_batch_defect_closure_to_vertical_hoist_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(verticalComponentHoist?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'prefab_first_batch_defect_closure_to_vertical_hoist_process',
          predecessorStableCode: 'PFB-01-01-01-P10',
          successorStableCode: 'PFB-01-01-03-P10',
          scopeRule: 'same_floor',
        }),
      ]),
    }))
  }, 30000)

  it('materializes prefab follow-up batch handover releases to component-family hoist processes', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-followup-component-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-01-01-02',
          'PFB-01-01-04',
          'PFB-01-01-05',
          'PFB-01-01-06',
          'PFB-01-01-08',
          'PFB-01-01-09',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'prefab-yard-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const followupBatchHandover = rowByStableCode.get('PFB-01-01-02-P09')
    const expectedReleases = [
      {
        successorStableCode: 'PFB-01-01-04-P08',
        ruleCode: 'prefab_followup_batch_handover_to_slab_beam_hoist_process',
      },
      {
        successorStableCode: 'PFB-01-01-05-P05',
        ruleCode: 'prefab_followup_batch_handover_to_stair_hoist_process',
      },
      {
        successorStableCode: 'PFB-01-01-06-P06',
        ruleCode: 'prefab_followup_batch_handover_to_projecting_component_hoist_process',
      },
      {
        successorStableCode: 'PFB-01-01-08-P06',
        ruleCode: 'prefab_followup_batch_handover_to_parapet_hoist_process',
      },
      {
        successorStableCode: 'PFB-01-01-09-P10',
        ruleCode: 'prefab_followup_batch_handover_to_heavy_component_formal_hoist_process',
      },
    ]

    expect(followupBatchHandover).toBeTruthy()
    for (const { successorStableCode, ruleCode } of expectedReleases) {
      const successor = rowByStableCode.get(successorStableCode)
      expect(successor).toBeTruthy()
      expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: followupBatchHandover?.clientRowId,
          dependencyType: 'FS',
          lagDays: 1,
          source: 'cross_item_workflow',
          intentCode: `cross-item:${ruleCode}`,
          relationRole: 'workflow',
          strength: 'hard',
        }),
      ]))
      expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
        crossItemWorkflow: expect.arrayContaining([
          expect.objectContaining({
            ruleCode,
            predecessorStableCode: 'PFB-01-01-02-P09',
            successorStableCode,
            scopeRule: 'same_floor',
          }),
        ]),
      }))
    }
  }, 30000)

  it('materializes prefab entity inspection handover release to assembly-rate assessment at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-assembly-rate-process-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-03-01-01',
          'PFB-03-01-02',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const structureQualityHandover = rowByStableCode.get('PFB-03-01-01-P10')
    const assemblyRateModelReview = rowByStableCode.get('PFB-03-01-02-P01')

    expect(structureQualityHandover).toBeTruthy()
    expect(assemblyRateModelReview?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: structureQualityHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_entity_inspection_handover_to_assembly_rate_model_review_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(assemblyRateModelReview?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'prefab_entity_inspection_handover_to_assembly_rate_model_review_process',
          predecessorStableCode: 'PFB-03-01-01-P10',
          successorStableCode: 'PFB-03-01-02-P01',
          scopeRule: 'same_building',
        }),
      ]),
    }))
  }, 30000)

  it('materializes prefab assembly-rate conclusion release to traceability handover at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-traceability-handover-process-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-03-01-02',
          'PFB-03-01-03',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const assemblyRateConclusion = rowByStableCode.get('PFB-03-01-02-P10')
    const traceabilityHandover = rowByStableCode.get('PFB-03-01-03-P10')

    expect(assemblyRateConclusion).toBeTruthy()
    expect(traceabilityHandover?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: assemblyRateConclusion?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:prefab_assembly_rate_conclusion_to_traceability_handover_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(traceabilityHandover?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'prefab_assembly_rate_conclusion_to_traceability_handover_process',
          predecessorStableCode: 'PFB-03-01-02-P10',
          successorStableCode: 'PFB-03-01-03-P10',
          scopeRule: 'same_building',
        }),
      ]),
    }))
  }, 30000)

  it('materializes prefab expansion factory signed-document release to component hoist processes', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-expansion-hoist-process-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-04-01-04',
          'PFB-04-01-05',
          'PFB-04-01-06',
          'PFB-04-01-07',
          'PFB-04-01-08',
          'PFB-04-01-09',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const factorySignedRelease = rowByStableCode.get('PFB-04-01-04-P06')
    const expectedReleases = [
      'PFB-04-01-05-P03',
      'PFB-04-01-06-P03',
      'PFB-04-01-07-P02',
      'PFB-04-01-08-P02',
      'PFB-04-01-09-P02',
    ]
    const ruleCode = 'prefab_expansion_factory_signed_documents_to_component_hoist_process'

    expect(factorySignedRelease).toBeTruthy()
    for (const successorStableCode of expectedReleases) {
      const successor = rowByStableCode.get(successorStableCode)
      expect(successor).toBeTruthy()
      expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: factorySignedRelease?.clientRowId,
          dependencyType: 'FS',
          lagDays: 1,
          source: 'cross_item_workflow',
          intentCode: `cross-item:${ruleCode}`,
          relationRole: 'workflow',
          strength: 'hard',
        }),
      ]))
      expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
        crossItemWorkflow: expect.arrayContaining([
          expect.objectContaining({
            ruleCode,
            predecessorStableCode: 'PFB-04-01-04-P06',
            successorStableCode,
            scopeRule: 'same_floor',
          }),
        ]),
      }))
    }
  }, 30000)

  it('materializes prefab vertical component acceptance release to grouting process entries', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-vertical-grouting-process-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-01-01-03',
          'PFB-02-01-01',
          'PFB-02-01-02',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const verticalAcceptance = rowByStableCode.get('PFB-01-01-03-P14')
    const expectedReleases = [
      {
        successorStableCode: 'PFB-02-01-01-P04',
        ruleCode: 'prefab_vertical_acceptance_to_sleeve_grouting_process',
      },
      {
        successorStableCode: 'PFB-02-01-02-P04',
        ruleCode: 'prefab_vertical_acceptance_to_lap_anchor_grouting_process',
      },
    ]

    expect(verticalAcceptance).toBeTruthy()
    for (const { successorStableCode, ruleCode } of expectedReleases) {
      const successor = rowByStableCode.get(successorStableCode)
      expect(successor).toBeTruthy()
      expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: verticalAcceptance?.clientRowId,
          dependencyType: 'FS',
          lagDays: 1,
          source: 'cross_item_workflow',
          intentCode: `cross-item:${ruleCode}`,
          relationRole: 'workflow',
          strength: 'hard',
        }),
      ]))
      expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
        crossItemWorkflow: expect.arrayContaining([
          expect.objectContaining({
            ruleCode,
            predecessorStableCode: 'PFB-01-01-03-P14',
            successorStableCode,
            scopeRule: 'same_floor',
          }),
        ]),
      }))
    }
  }, 30000)

  it('materializes prefab composite slab acceptance release to cast-in-place closure pouring', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-composite-postcast-process-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-01-01-04',
          'PFB-02-01-03',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const compositePourReadiness = rowByStableCode.get('PFB-01-01-04-P12')
    const postcastConcretePour = rowByStableCode.get('PFB-02-01-03-P04')
    const ruleCode = 'prefab_composite_slab_acceptance_to_postcast_pouring_process'
    const compositePourReadinessMetadata = compositePourReadiness?.values.standard_task_metadata as Record<string, unknown> | undefined

    expect(compositePourReadiness).toBeTruthy()
    expect(compositePourReadiness?.values.duration_contribution_mode ?? compositePourReadinessMetadata?.durationContributionMode).toBe('quality_gate')
    expect(postcastConcretePour).toBeTruthy()
    expect(postcastConcretePour?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: compositePourReadiness?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: `cross-item:${ruleCode}`,
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(postcastConcretePour?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode,
          predecessorStableCode: 'PFB-01-01-04-P12',
          successorStableCode: 'PFB-02-01-03-P04',
          scopeRule: 'same_floor',
        }),
      ]),
    }))
  }, 30000)

  it('materializes prefab PCF panel water-test handover release to joint sealant construction', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-pcf-joint-sealant-process-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-01-01-07',
          'PFB-02-01-04',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'facade-zone-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const pcfWaterTestHandover = rowByStableCode.get('PFB-01-01-07-P12')
    const jointSealantConstruction = rowByStableCode.get('PFB-02-01-04-P03')
    const ruleCode = 'prefab_pcf_water_test_handover_to_joint_sealant_process'
    const pcfWaterTestMetadata = pcfWaterTestHandover?.values.standard_task_metadata as Record<string, unknown> | undefined

    expect(pcfWaterTestHandover).toBeTruthy()
    expect(pcfWaterTestHandover?.values.duration_contribution_mode ?? pcfWaterTestMetadata?.durationContributionMode).toBe('quality_gate')
    expect(jointSealantConstruction).toBeTruthy()
    expect(jointSealantConstruction?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: pcfWaterTestHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: `cross-item:${ruleCode}`,
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(jointSealantConstruction?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode,
          predecessorStableCode: 'PFB-01-01-07-P12',
          successorStableCode: 'PFB-02-01-04-P03',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes prefab interior hidden handover release to assembly-rate ledger summary', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-interior-assembly-rate-ledger-process-release',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: [
          'PFB-02-01-05',
          'PFB-03-01-02',
        ],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
          method_variant_codes: ['prefab_interior_alc', 'prefabricated_concrete_floor_cycle'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const interiorHiddenHandover = rowByStableCode.get('PFB-02-01-05-P09')
    const assemblyRateLedgerSummary = rowByStableCode.get('PFB-03-01-02-P06')
    const ruleCode = 'prefab_interior_hidden_handover_to_assembly_rate_ledger_process'
    const interiorHandoverMetadata = interiorHiddenHandover?.values.standard_task_metadata as Record<string, unknown> | undefined

    expect(interiorHiddenHandover).toBeTruthy()
    expect(interiorHiddenHandover?.values.duration_contribution_mode ?? interiorHandoverMetadata?.durationContributionMode).toBe('handover_marker')
    expect(assemblyRateLedgerSummary).toBeTruthy()
    expect(assemblyRateLedgerSummary?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: interiorHiddenHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: `cross-item:${ruleCode}`,
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(assemblyRateLedgerSummary?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode,
          predecessorStableCode: 'PFB-02-01-05-P09',
          successorStableCode: 'PFB-03-01-02-P06',
          scopeRule: 'same_building',
        }),
      ]),
    }))
  }, 30000)

  it('materializes industrial cleanroom validation release dependencies at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-industrial-cleanroom-process-release',
        primaryCatalogId: 'china-industrial-cleanroom-specialty',
        templateIds: ['china-industrial-cleanroom-specialty'],
        selectedNodesByTemplate: {
          'china-industrial-cleanroom-specialty': [
            'ICR-02-01-01',
            'ICR-03-01-01',
            'ICR-03-02-01',
            'ICR-04-02-01',
            'ICR-05-01-04',
            'ICR-05-01-05',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
          system_object_id: 'process-system-1',
          project_type_code: 'battery_factory',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const dryRoomDewPointRetest = rowByStableCode.get('ICR-02-01-01-P09')
    const highPurityBlowdown = rowByStableCode.get('ICR-03-01-01-P04')
    const airflowBalancing = rowByStableCode.get('ICR-03-02-01-P02')
    const cleanHvacRunConfirmation = rowByStableCode.get('ICR-03-02-01-P05')
    const oqReportSignoff = rowByStableCode.get('ICR-05-01-04-P07')
    const pqEnvironmentTest = rowByStableCode.get('ICR-05-01-05-P04')
    const factorySubsystemCommissioning = rowByStableCode.get('ICR-04-02-01-P02')
    const pqTrialReleaseSignoff = rowByStableCode.get('ICR-05-01-05-P10')
    const productionReleaseSignoff = rowByStableCode.get('ICR-04-02-01-P09')

    expect(dryRoomDewPointRetest).toBeTruthy()
    expect(highPurityBlowdown?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: dryRoomDewPointRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:industrial_cleanroom_dry_room_dewpoint_to_high_purity_blowdown_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(highPurityBlowdown?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'industrial_cleanroom_dry_room_dewpoint_to_high_purity_blowdown_process',
          predecessorStableCode: 'ICR-02-01-01-P09',
          successorStableCode: 'ICR-03-01-01-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))

    expect(airflowBalancing?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: dryRoomDewPointRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:industrial_cleanroom_dry_room_dewpoint_to_airflow_balance_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    expect(cleanHvacRunConfirmation).toBeTruthy()
    expect(factorySubsystemCommissioning?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: cleanHvacRunConfirmation?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:industrial_cleanroom_clean_hvac_run_to_factory_commissioning_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    expect(oqReportSignoff).toBeTruthy()
    expect(pqEnvironmentTest?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: oqReportSignoff?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:industrial_cleanroom_oq_report_to_pq_environment_test_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    expect(pqTrialReleaseSignoff).toBeTruthy()
    expect(productionReleaseSignoff?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: pqTrialReleaseSignoff?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:industrial_cleanroom_pq_trial_release_to_production_release_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(productionReleaseSignoff?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'industrial_cleanroom_pq_trial_release_to_production_release_process',
          predecessorStableCode: 'ICR-05-01-05-P10',
          successorStableCode: 'ICR-04-02-01-P09',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes MiC factory, receiving, hoist, and quick-connect releases at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-mic-process-release',
        primaryCatalogId: 'china-modular-mic-specialty',
        templateIds: ['china-modular-mic-specialty'],
        selectedNodesByTemplate: {
          'china-modular-mic-specialty': [
            'MIC-02-01-02',
            'MIC-03-01-02',
            'MIC-04-01-01',
            'MIC-04-01-02',
            'MIC-05-01-01',
            'MIC-05-01-02',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'module-zone-1',
          project_type_code: 'mic',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const factoryDefectClosure = rowByStableCode.get('MIC-02-01-02-P08')
    const receivingConfirmation = rowByStableCode.get('MIC-03-01-02-P05')
    const receivingDefectClosure = rowByStableCode.get('MIC-03-01-02-P08')
    const moduleHoist = rowByStableCode.get('MIC-04-01-01-P03')
    const hoistAcceptance = rowByStableCode.get('MIC-04-01-01-P11')
    const boltFinalTightening = rowByStableCode.get('MIC-04-01-02-P02')
    const nodeConnectionNdtRetest = rowByStableCode.get('MIC-04-01-02-P08')
    const mepQuickConnect = rowByStableCode.get('MIC-05-01-01-P08')
    const interfaceLinkageTest = rowByStableCode.get('MIC-05-01-01-P04')
    const handoverPreparation = rowByStableCode.get('MIC-05-01-02-P03')

    expect(factoryDefectClosure).toBeTruthy()
    expect(receivingConfirmation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: factoryDefectClosure?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mic_factory_fat_defect_closure_to_site_receiving_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(receivingConfirmation?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'mic_factory_fat_defect_closure_to_site_receiving_process',
          predecessorStableCode: 'MIC-02-01-02-P08',
          successorStableCode: 'MIC-03-01-02-P05',
          scopeRule: 'same_zone',
        }),
      ]),
    }))

    expect(receivingDefectClosure).toBeTruthy()
    expect(moduleHoist?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: receivingDefectClosure?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mic_receiving_defect_closure_to_module_hoist_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    expect(hoistAcceptance).toBeTruthy()
    expect(boltFinalTightening?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: hoistAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mic_hoist_acceptance_to_node_bolt_connection_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    expect(nodeConnectionNdtRetest).toBeTruthy()
    expect(mepQuickConnect?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: nodeConnectionNdtRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mic_node_connection_ndt_to_mep_quick_connect_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    expect(interfaceLinkageTest).toBeTruthy()
    expect(handoverPreparation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: interfaceLinkageTest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mic_interface_linkage_test_to_handover_preparation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(handoverPreparation?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'mic_interface_linkage_test_to_handover_preparation_process',
          predecessorStableCode: 'MIC-05-01-01-P04',
          successorStableCode: 'MIC-05-01-02-P03',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes hotel smart-system linkage release to trial-operation device testing at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hotel-smart-trial-release',
        primaryCatalogId: 'china-hotel-specialty',
        templateIds: ['china-hotel-specialty'],
        selectedNodesByTemplate: {
          'china-hotel-specialty': [
            'HTL-04-01-02',
            'HTL-05-01-02',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'hotel-building-1',
          physical_zone_object_id: 'guestroom-zone-1',
          project_type_code: 'hotel',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const roomControlScenarioRetest = rowByStableCode.get('HTL-04-01-02-P07')
    const trialOperationDeviceTest = rowByStableCode.get('HTL-05-01-02-P02')

    expect(roomControlScenarioRetest).toBeTruthy()
    expect(trialOperationDeviceTest?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: roomControlScenarioRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hotel_smart_room_control_retest_to_trial_operation_device_test_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(trialOperationDeviceTest?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hotel_smart_room_control_retest_to_trial_operation_device_test_process',
          predecessorStableCode: 'HTL-04-01-02-P07',
          successorStableCode: 'HTL-05-01-02-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes hotel kitchen linkage retest release to trial-operation device testing at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hotel-kitchen-trial-release',
        primaryCatalogId: 'china-hotel-specialty',
        templateIds: ['china-hotel-specialty'],
        selectedNodesByTemplate: {
          'china-hotel-specialty': [
            'HTL-03-01-01',
            'HTL-05-01-02',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'hotel-building-1',
          physical_zone_object_id: 'hotel-kitchen-zone-1',
          project_type_code: 'hotel',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const kitchenLinkageRetest = rowByStableCode.get('HTL-03-01-01-P04')
    const trialOperationDeviceTest = rowByStableCode.get('HTL-05-01-02-P02')

    expect(kitchenLinkageRetest).toBeTruthy()
    expect(trialOperationDeviceTest?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: kitchenLinkageRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hotel_kitchen_linkage_retest_to_trial_operation_device_test_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(trialOperationDeviceTest?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hotel_kitchen_linkage_retest_to_trial_operation_device_test_process',
          predecessorStableCode: 'HTL-03-01-01-P04',
          successorStableCode: 'HTL-05-01-02-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes hotel guestroom terminal installation to per-room MEP terminal review as a recommended process-level L3 handoff', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hotel-guestroom-terminal-install-room-mep-review',
        primaryCatalogId: 'china-hotel-specialty',
        templateIds: ['china-hotel-specialty'],
        selectedNodesByTemplate: {
          'china-hotel-specialty': [
            'HTL-01-01-02',
            'HTL-01-01-03',
          ],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'hotel-building-1',
          floor_object_id: 'hotel-guestroom-floor-1',
          floor_sequence: [{ id: 'hotel-guestroom-floor-1', label: '8F', levelNumber: 8 }],
          physical_zone_object_id: 'hotel-guestroom-zone-1',
          project_type_code: 'hotel',
          method_variant_codes: ['hotel_guestroom', 'guestroom_terminal_installation', 'room_mep_terminal_review'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const guestroomTerminalInstall = rowByStableCode.get('HTL-01-01-02-P07')
    const roomMepTerminalReview = rowByStableCode.get('HTL-01-01-03-P02')

    expect(guestroomTerminalInstall, 'HTL-01-01-02-P07 should be generated').toBeTruthy()
    expect(roomMepTerminalReview, 'HTL-01-01-03-P02 should be generated').toBeTruthy()
    expect(roomMepTerminalReview?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: guestroomTerminalInstall?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hotel_guestroom_terminal_install_to_room_mep_terminal_review_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(roomMepTerminalReview?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hotel_guestroom_terminal_install_to_room_mep_terminal_review_process',
          predecessorStableCode: 'HTL-01-01-02-P07',
          successorStableCode: 'HTL-01-01-03-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes hotel PMS door-lock room binding to per-room PMS network retest as a recommended process-level L3 handoff', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hotel-pms-door-lock-room-binding-pms-network-retest',
        primaryCatalogId: 'china-hotel-specialty',
        templateIds: ['china-hotel-specialty'],
        selectedNodesByTemplate: {
          'china-hotel-specialty': [
            'HTL-04-01-02',
            'HTL-01-01-03',
          ],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'hotel-building-1',
          floor_object_id: 'hotel-guestroom-floor-1',
          floor_sequence: [{ id: 'hotel-guestroom-floor-1', label: '8F', levelNumber: 8 }],
          physical_zone_object_id: 'hotel-guestroom-zone-1',
          project_type_code: 'hotel',
          method_variant_codes: ['hotel_pms', 'door_lock_room_binding', 'room_pms_network_retest'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const pmsDoorLockRoomBinding = rowByStableCode.get('HTL-04-01-02-P06')
    const roomPmsNetworkRetest = rowByStableCode.get('HTL-01-01-03-P04')
    const roomSceneRetest = rowByStableCode.get('HTL-04-01-02-P07')

    expect(pmsDoorLockRoomBinding, 'HTL-04-01-02-P06 should be generated').toBeTruthy()
    expect(roomPmsNetworkRetest, 'HTL-01-01-03-P04 should be generated').toBeTruthy()
    expect(roomPmsNetworkRetest?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: pmsDoorLockRoomBinding?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hotel_pms_door_lock_room_binding_to_room_pms_network_retest_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(roomPmsNetworkRetest?.predecessorDependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: roomSceneRetest?.clientRowId,
        intentCode: 'cross-item:hotel_pms_door_lock_room_binding_to_room_pms_network_retest_process',
      }),
    ]))
    expect(roomPmsNetworkRetest?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hotel_pms_door_lock_room_binding_to_room_pms_network_retest_process',
          predecessorStableCode: 'HTL-04-01-02-P06',
          successorStableCode: 'HTL-01-01-03-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes hotel kitchen exhaust interface review to grease-exhaust duct installation as a recommended process-level L3 handoff', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hotel-kitchen-exhaust-interface-grease-duct-process-release',
        primaryCatalogId: 'china-hotel-specialty',
        templateIds: ['china-hotel-specialty', 'china-hvac-system'],
        selectedNodesByTemplate: {
          'china-hotel-specialty': ['HTL-03-01-01'],
          'china-hvac-system': ['HVA-04-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'hotel-building-1',
          floor_object_id: 'hotel-kitchen-floor-1',
          floor_sequence: [{ id: 'hotel-kitchen-floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'hotel-kitchen-zone-1',
          system_object_id: 'hotel-kitchen-exhaust-system-1',
          project_type_code: 'hotel',
          method_variant_codes: ['hotel_kitchen', 'kitchen_exhaust_interface_review', 'grease_exhaust_duct_installation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const kitchenInterfaceReview = rowByStableCode.get('HTL-03-01-01-P01')
    const materialAcceptance = rowByStableCode.get('HVA-04-01-01-P03')
    const greaseExhaustDuctInstall = rowByStableCode.get('HVA-04-01-01-P04')
    const makeupAirBalancing = rowByStableCode.get('HVA-04-01-01-P05')

    expect(kitchenInterfaceReview, 'HTL-03-01-01-P01 should be generated').toBeTruthy()
    expect(greaseExhaustDuctInstall, 'HVA-04-01-01-P04 should be generated').toBeTruthy()
    expect(greaseExhaustDuctInstall?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: kitchenInterfaceReview?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hotel_kitchen_exhaust_interface_review_to_grease_exhaust_duct_install_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(greaseExhaustDuctInstall?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hotel_kitchen_exhaust_interface_review_to_grease_exhaust_duct_install_process',
          predecessorStableCode: 'HTL-03-01-01-P01',
          successorStableCode: 'HVA-04-01-01-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
    expect(materialAcceptance?.predecessorDependencies ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: kitchenInterfaceReview?.clientRowId,
        intentCode: 'cross-item:hotel_kitchen_exhaust_interface_review_to_grease_exhaust_duct_install_process',
      }),
    ]))
    expect(makeupAirBalancing?.predecessorDependencies ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: kitchenInterfaceReview?.clientRowId,
        intentCode: 'cross-item:hotel_kitchen_exhaust_interface_review_to_grease_exhaust_duct_install_process',
      }),
    ]))
  }, 30000)

  it('materializes campus one-card permission release to opening trial rectification at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-campus-one-card-opening-trial-release',
        primaryCatalogId: 'china-campus-specialty',
        templateIds: ['china-campus-specialty'],
        selectedNodesByTemplate: {
          'china-campus-specialty': [
            'CMP-05-01-15',
            'CMP-04-01-01',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          phase_object_id: 'campus-phase-1',
          building_object_id: 'campus-building-1',
          physical_zone_object_id: 'campus-zone-1',
          project_type_code: 'campus',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const oneCardPermissionReview = rowByStableCode.get('CMP-05-01-15-P08')
    const openingTrialRectification = rowByStableCode.get('CMP-04-01-01-P08')

    expect(oneCardPermissionReview).toBeTruthy()
    expect(openingTrialRectification?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: oneCardPermissionReview?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:campus_one_card_permission_review_to_opening_trial_rectification_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(openingTrialRectification?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'campus_one_card_permission_review_to_opening_trial_rectification_process',
          predecessorStableCode: 'CMP-05-01-15-P08',
          successorStableCode: 'CMP-04-01-01-P08',
          scopeRule: 'same_phase',
        }),
      ]),
    }))
  }, 30000)

  it('materializes steel main-frame acceptance release to deck installation at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-steel-main-frame-deck-release',
        primaryCatalogId: 'china-steel-structure-specialty',
        templateIds: ['china-steel-structure-specialty'],
        selectedNodesByTemplate: {
          'china-steel-structure-specialty': [
            'STL-02-01-01',
            'STL-03-01-01',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'steel-building-1',
          physical_zone_object_id: 'steel-bay-1',
          project_type_code: 'large_public',
          method_variant_codes: ['steel_assembly', 'large_span_steel'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const mainFrameAcceptance = rowByStableCode.get('STL-02-01-01-P10')
    const deckInstallation = rowByStableCode.get('STL-03-01-01-P02')

    expect(mainFrameAcceptance).toBeTruthy()
    expect(deckInstallation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: mainFrameAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:steel_main_frame_acceptance_to_deck_installation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(deckInstallation?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'steel_main_frame_acceptance_to_deck_installation_process',
          predecessorStableCode: 'STL-02-01-01-P10',
          successorStableCode: 'STL-03-01-01-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes standard building L3 release anchors for envelope, roof, elevator power, and gas interfaces', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-standard-building-l3-process-release-anchors',
        primaryCatalogId: 'china-building-fine-detail',
        templateIds: [
          'china-building-fine-detail',
          'china-facade-curtain-wall',
          'china-waterproof-insulation',
          'china-jgj-tianjin-decoration',
          'china-electrical-system',
          'china-elevator-installation',
          'china-hvac-system',
          'china-plumbing-heating-system',
        ],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-01-01-02'],
          'china-facade-curtain-wall': ['FAC-01-01-02', 'FAC-02-01-01', 'FAC-03-01-01'],
          'china-waterproof-insulation': ['WPI-01-01-02', 'WPI-01-01-03', 'WPI-02-01-02'],
          'china-jgj-tianjin-decoration': ['DEC-04-01-01'],
          'china-electrical-system': ['ELE-05-01-01'],
          'china-elevator-installation': ['ELV-02-01-02'],
          'china-hvac-system': ['HVA-04-01-01'],
          'china-plumbing-heating-system': ['PLU-06-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'system-1',
          project_type_code: 'civil_office_commercial',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const expectedReleases = [
      {
        ruleCode: 'masonry_opening_closeout_to_external_window_frame_release',
        predecessorStableCode: 'BDT-01-01-02-P08',
        successorStableCode: 'FAC-03-01-01-P03',
        scopeRule: 'same_floor',
      },
      {
        ruleCode: 'facade_frame_deviation_acceptance_to_panel_install_release',
        predecessorStableCode: 'FAC-01-01-02-P10',
        successorStableCode: 'FAC-02-01-01-P02',
        scopeRule: 'same_zone',
      },
      {
        ruleCode: 'facade_insulation_handover_to_external_coating_process',
        predecessorStableCode: 'WPI-02-01-02-P09',
        successorStableCode: 'DEC-04-01-01-P01',
        scopeRule: 'same_zone',
      },
      {
        ruleCode: 'roof_waterproof_recheck_to_roof_function_layer_release',
        predecessorStableCode: 'WPI-01-01-02-P10',
        successorStableCode: 'WPI-01-01-03-P09',
        scopeRule: 'same_zone',
      },
      {
        ruleCode: 'formal_power_load_trial_to_elevator_commissioning_release',
        predecessorStableCode: 'ELE-05-01-01-P10',
        successorStableCode: 'ELV-02-01-02-P01',
        scopeRule: 'same_building',
      },
      {
        ruleCode: 'kitchen_exhaust_gas_alarm_linkage_to_gas_acceptance_release',
        predecessorStableCode: 'HVA-04-01-01-P06',
        successorStableCode: 'PLU-06-01-01-P07',
        scopeRule: 'same_system',
      },
    ]

    for (const release of expectedReleases) {
      const predecessor = rowByStableCode.get(release.predecessorStableCode)
      const successor = rowByStableCode.get(release.successorStableCode)

      expect(predecessor, `${release.predecessorStableCode} should be generated`).toBeTruthy()
      expect(successor, `${release.successorStableCode} should be generated`).toBeTruthy()
      expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: predecessor?.clientRowId,
          dependencyType: 'FS',
          lagDays: 1,
          source: 'cross_item_workflow',
          intentCode: `cross-item:${release.ruleCode}`,
          relationRole: 'workflow',
          strength: 'hard',
        }),
      ]))
      expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
        crossItemWorkflow: expect.arrayContaining([
          expect.objectContaining({
            ruleCode: release.ruleCode,
            predecessorStableCode: release.predecessorStableCode,
            successorStableCode: release.successorStableCode,
            scopeRule: release.scopeRule,
          }),
        ]),
      }))
    }
  }, 30000)

  it('materializes masonry mockup handover to plaster base as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-building-detail-masonry-plaster-process-release',
        templateId: 'china-building-fine-detail',
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-06-01-02', 'BDT-06-01-03'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          project_type_code: 'civil_office_commercial',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('BDT-06-01-02-P08')
    const successor = rowByStableCode.get('BDT-06-01-03-P01')

    expect(predecessor, 'BDT-06-01-02-P08 should be generated').toBeTruthy()
    expect(successor, 'BDT-06-01-03-P01 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:masonry_mockup_handover_to_plaster_mockup_base_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'masonry_mockup_handover_to_plaster_mockup_base_process',
          predecessorStableCode: 'BDT-06-01-02-P08',
          successorStableCode: 'BDT-06-01-03-P01',
          scopeRule: 'same_floor',
        }),
      ]),
    }))
  }, 30000)

  it('materializes fire pump pressure test to fire-water linkage logic as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-fire-pump-pressure-linkage-logic-process-release',
        primaryCatalogId: 'china-cecs-fire-system',
        templateId: 'china-cecs-fire-system',
        selectedNodesByTemplate: {
          'china-cecs-fire-system': ['FIR-07-01-01', 'FIR-03-02-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
          system_object_id: 'fire-system-1',
          project_type_code: 'civil_office_commercial',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('FIR-07-01-01-P07')
    const successor = rowByStableCode.get('FIR-03-02-01-P03')

    expect(predecessor, 'FIR-07-01-01-P07 should be generated').toBeTruthy()
    expect(successor, 'FIR-03-02-01-P03 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:fire_pump_pressure_test_to_fire_water_linkage_logic_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'fire_pump_pressure_test_to_fire_water_linkage_logic_process',
          predecessorStableCode: 'FIR-07-01-01-P07',
          successorStableCode: 'FIR-03-02-01-P03',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes MEP coordination opening-sleeve review to MEP mockup layout freeze as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-mep-coordination-mockup-layout-freeze-process-release',
        primaryCatalogId: 'china-mep-coordination',
        templateIds: ['china-mep-coordination', 'china-building-fine-detail'],
        selectedNodesByTemplate: {
          'china-mep-coordination': ['MEP-01-01-01'],
          'china-building-fine-detail': ['BDT-06-01-07'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'mep-coordination-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['bim_coordination', 'mep_mockup_room'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('MEP-01-01-01-P04')
    const successor = rowByStableCode.get('BDT-06-01-07-P01')

    expect(predecessor, 'MEP-01-01-01-P04 should be generated').toBeTruthy()
    expect(successor, 'BDT-06-01-07-P01 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mep_coordination_opening_sleeve_review_to_mep_mockup_layout_freeze_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'mep_coordination_opening_sleeve_review_to_mep_mockup_layout_freeze_process',
          predecessorStableCode: 'MEP-01-01-01-P04',
          successorStableCode: 'BDT-06-01-07-P01',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes MEP coordination ceiling point layout to MEP mockup layout freeze as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-mep-coordination-ceiling-layout-mockup-freeze-process-release',
        primaryCatalogId: 'china-mep-coordination',
        templateIds: ['china-mep-coordination', 'china-building-fine-detail'],
        selectedNodesByTemplate: {
          'china-mep-coordination': ['MEP-01-01-01'],
          'china-building-fine-detail': ['BDT-06-01-07'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'mep-coordination-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['bim_coordination', 'mep_mockup_room'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('MEP-01-01-01-P03')
    const successor = rowByStableCode.get('BDT-06-01-07-P01')

    expect(predecessor, 'MEP-01-01-01-P03 should be generated').toBeTruthy()
    expect(successor, 'BDT-06-01-07-P01 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mep_coordination_ceiling_point_layout_to_mep_mockup_layout_freeze_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'mep_coordination_ceiling_point_layout_to_mep_mockup_layout_freeze_process',
          predecessorStableCode: 'MEP-01-01-01-P03',
          successorStableCode: 'BDT-06-01-07-P01',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes MEP hanger BIM layout to MEP mockup hanger installation as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-mep-hanger-bim-layout-mockup-hanger-install-process-release',
        primaryCatalogId: 'china-hvac-system',
        templateIds: ['china-hvac-system', 'china-building-fine-detail'],
        selectedNodesByTemplate: {
          'china-hvac-system': ['HVA-03-01-01'],
          'china-building-fine-detail': ['BDT-06-01-07'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'hanger-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['bim_coordination', 'mep_mockup_room', 'integrated_hanger'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('HVA-03-01-01-P01')
    const successor = rowByStableCode.get('BDT-06-01-07-P02')

    expect(predecessor, 'HVA-03-01-01-P01 should be generated').toBeTruthy()
    expect(successor, 'BDT-06-01-07-P02 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mep_hanger_bim_layout_to_mep_mockup_hanger_install_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'mep_hanger_bim_layout_to_mep_mockup_hanger_install_process',
          predecessorStableCode: 'HVA-03-01-01-P01',
          successorStableCode: 'BDT-06-01-07-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes MEP mockup standard handover to public-area terminal installation as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-mep-mockup-standard-handover-public-area-terminal-install-process-release',
        primaryCatalogId: 'china-building-fine-detail',
        templateIds: ['china-building-fine-detail', 'china-jgj-tianjin-decoration'],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-06-01-07'],
          'china-jgj-tianjin-decoration': ['DEC-05-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'public-area-terminal-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['mep_mockup_room', 'public_area_decoration', 'terminal_installation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('BDT-06-01-07-P08')
    const successor = rowByStableCode.get('DEC-05-01-01-P07')

    expect(predecessor, 'BDT-06-01-07-P08 should be generated').toBeTruthy()
    expect(successor, 'DEC-05-01-01-P07 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mep_mockup_standard_handover_to_public_area_terminal_install_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'mep_mockup_standard_handover_to_public_area_terminal_install_process',
          predecessorStableCode: 'BDT-06-01-07-P08',
          successorStableCode: 'DEC-05-01-01-P07',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes electrical terminal energization to public-area terminal commissioning as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-electrical-terminal-energization-public-area-terminal-commissioning-process-release',
        primaryCatalogId: 'china-electrical-system',
        templateIds: ['china-electrical-system', 'china-jgj-tianjin-decoration'],
        selectedNodesByTemplate: {
          'china-electrical-system': ['ELE-02-01-01'],
          'china-jgj-tianjin-decoration': ['DEC-05-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'public-area-terminal-power-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['public_area_decoration', 'terminal_commissioning', 'electrical_energization'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('ELE-02-01-01-P07')
    const successor = rowByStableCode.get('DEC-05-01-01-P08')

    expect(predecessor, 'ELE-02-01-01-P07 should be generated').toBeTruthy()
    expect(successor, 'DEC-05-01-01-P08 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:electrical_terminal_energization_to_public_area_terminal_commissioning_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'electrical_terminal_energization_to_public_area_terminal_commissioning_process',
          predecessorStableCode: 'ELE-02-01-01-P07',
          successorStableCode: 'DEC-05-01-01-P08',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes HVAC air-water balancing to public-area terminal commissioning as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hvac-air-water-balancing-public-area-terminal-commissioning-process-release',
        primaryCatalogId: 'china-hvac-system',
        templateIds: ['china-hvac-system', 'china-jgj-tianjin-decoration'],
        selectedNodesByTemplate: {
          'china-hvac-system': ['HVA-02-01-02'],
          'china-jgj-tianjin-decoration': ['DEC-05-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'public-area-terminal-hvac-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['public_area_decoration', 'terminal_commissioning', 'hvac_balancing'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('HVA-02-01-02-P02')
    const successor = rowByStableCode.get('DEC-05-01-01-P08')

    expect(predecessor, 'HVA-02-01-02-P02 should be generated').toBeTruthy()
    expect(successor, 'DEC-05-01-01-P08 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hvac_air_water_balancing_to_public_area_terminal_commissioning_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hvac_air_water_balancing_to_public_area_terminal_commissioning_process',
          predecessorStableCode: 'HVA-02-01-02-P02',
          successorStableCode: 'DEC-05-01-01-P08',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes public-area terminal commissioning to fire zone scenario linkage test as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-public-area-terminal-commissioning-fire-zone-linkage-process-release',
        primaryCatalogId: 'china-jgj-tianjin-decoration',
        templateIds: ['china-jgj-tianjin-decoration', 'china-cecs-fire-system'],
        selectedNodesByTemplate: {
          'china-jgj-tianjin-decoration': ['DEC-05-01-01'],
          'china-cecs-fire-system': ['FIR-03-02-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'fire-life-safety-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['public_area_decoration', 'terminal_commissioning', 'fire_zone_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('DEC-05-01-01-P08')
    const successor = rowByStableCode.get('FIR-03-02-01-P05')

    expect(predecessor, 'DEC-05-01-01-P08 should be generated').toBeTruthy()
    expect(successor, 'FIR-03-02-01-P05 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:public_area_terminal_commissioning_to_fire_zone_scenario_linkage_test_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'public_area_terminal_commissioning_to_fire_zone_scenario_linkage_test_process',
          predecessorStableCode: 'DEC-05-01-01-P08',
          successorStableCode: 'FIR-03-02-01-P05',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes fire compartment integrity acceptance to MEP opening trim closeout as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-fire-compartment-integrity-mep-opening-trim-closeout-process-release',
        primaryCatalogId: 'china-cecs-fire-system',
        templateIds: ['china-cecs-fire-system', 'china-jgj-tianjin-decoration'],
        selectedNodesByTemplate: {
          'china-cecs-fire-system': ['FIR-04-01-02'],
          'china-jgj-tianjin-decoration': ['DEC-06-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'fire-compartment-trim-closeout-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['fire_compartment', 'opening_trim_closeout', 'mep_terminal_closure'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('FIR-04-01-02-P09')
    const successor = rowByStableCode.get('DEC-06-01-01-P05')

    expect(predecessor, 'FIR-04-01-02-P09 should be generated').toBeTruthy()
    expect(successor, 'DEC-06-01-01-P05 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:fire_compartment_integrity_acceptance_to_mep_opening_trim_closeout_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'fire_compartment_integrity_acceptance_to_mep_opening_trim_closeout_process',
          predecessorStableCode: 'FIR-04-01-02-P09',
          successorStableCode: 'DEC-06-01-01-P05',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes fire shutter descent test to access and elevator forced-landing linkage as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-fire-shutter-descent-access-elevator-linkage-process-release',
        primaryCatalogId: 'china-cecs-fire-system',
        templateIds: ['china-cecs-fire-system'],
        selectedNodesByTemplate: {
          'china-cecs-fire-system': ['FIR-04-01-01', 'FIR-03-02-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'fire-life-safety-linkage-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['fire_shutter', 'access_control_linkage', 'elevator_forced_landing'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('FIR-04-01-01-P08')
    const successor = rowByStableCode.get('FIR-03-02-01-P04')

    expect(predecessor, 'FIR-04-01-01-P08 should be generated').toBeTruthy()
    expect(successor, 'FIR-03-02-01-P04 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:fire_shutter_descent_test_to_shutter_access_elevator_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'fire_shutter_descent_test_to_shutter_access_elevator_linkage_process',
          predecessorStableCode: 'FIR-04-01-01-P08',
          successorStableCode: 'FIR-03-02-01-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes emergency power load-transfer test to fire cross-system linkage as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-emergency-power-fire-cross-system-linkage-process-release',
        primaryCatalogId: 'china-electrical-system',
        templateIds: ['china-electrical-system', 'china-cecs-fire-system'],
        selectedNodesByTemplate: {
          'china-electrical-system': ['ELE-04-01-01'],
          'china-cecs-fire-system': ['FIR-03-02-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'fire-life-safety-zone-1',
          system_object_id: 'emergency-power-fire-linkage-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['emergency_power', 'generator_load_transfer', 'fire_cross_system_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('ELE-04-01-01-P06')
    const successor = rowByStableCode.get('FIR-03-02-01-P04')

    expect(predecessor, 'ELE-04-01-01-P06 should be generated').toBeTruthy()
    expect(successor, 'FIR-03-02-01-P04 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:emergency_power_load_transfer_test_to_fire_cross_system_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'emergency_power_load_transfer_test_to_fire_cross_system_linkage_process',
          predecessorStableCode: 'ELE-04-01-01-P06',
          successorStableCode: 'FIR-03-02-01-P04',
          scopeRule: 'same_building',
        }),
      ]),
    }))
  }, 30000)

  it('materializes elevator fire recall test to fire access and elevator linkage as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-elevator-fire-recall-access-elevator-linkage-process-release',
        primaryCatalogId: 'china-elevator-installation',
        templateIds: ['china-elevator-installation', 'china-cecs-fire-system'],
        selectedNodesByTemplate: {
          'china-elevator-installation': ['ELV-02-01-02'],
          'china-cecs-fire-system': ['FIR-03-02-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'fire-life-safety-zone-1',
          system_object_id: 'elevator-fire-linkage-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['elevator_fire_recall', 'five_way_intercom', 'fire_access_elevator_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('ELV-02-01-02-P05')
    const successor = rowByStableCode.get('FIR-03-02-01-P04')

    expect(predecessor, 'ELV-02-01-02-P05 should be generated').toBeTruthy()
    expect(successor, 'FIR-03-02-01-P04 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:elevator_fire_recall_test_to_fire_access_elevator_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'elevator_fire_recall_test_to_fire_access_elevator_linkage_process',
          predecessorStableCode: 'ELV-02-01-02-P05',
          successorStableCode: 'FIR-03-02-01-P04',
          scopeRule: 'same_building',
        }),
      ]),
    }))
  }, 30000)

  it('materializes HVAC equipment control access to BAS single-point commissioning as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hvac-equipment-control-bas-single-point-process-release',
        primaryCatalogId: 'china-hvac-system',
        templateIds: ['china-hvac-system', 'china-intelligent-building-system'],
        selectedNodesByTemplate: {
          'china-hvac-system': ['HVA-02-01-01'],
          'china-intelligent-building-system': ['INT-02-01-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'bas-zone-1',
          system_object_id: 'bas-hvac-equipment-control-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['hvac_equipment_control_access', 'bas_single_point_commissioning'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const incorrectArrivalAcceptance = rowByStableCode.get('HVA-02-01-01-P04')
    const predecessor = rowByStableCode.get('HVA-02-01-01-P06')
    const successor = rowByStableCode.get('INT-02-01-02-P04')

    expect(predecessor, 'HVA-02-01-01-P06 should be generated').toBeTruthy()
    expect(successor, 'INT-02-01-02-P04 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hvac_equipment_control_access_to_bas_single_point_commissioning_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hvac_equipment_control_access_to_bas_single_point_commissioning_process',
          predecessorStableCode: 'HVA-02-01-01-P06',
          successorStableCode: 'INT-02-01-02-P04',
          scopeRule: 'same_system',
        }),
      ]),
    }))
    expect(successor?.predecessorDependencies ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: incorrectArrivalAcceptance?.clientRowId,
        intentCode: 'cross-item:hvac_equipment_control_access_to_bas_single_point_commissioning_process',
      }),
    ]))
  }, 30000)

  it('materializes HVAC automatic-control linkage test to BAS integrated scene as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hvac-automatic-control-bas-integrated-scene-process-release',
        primaryCatalogId: 'china-hvac-system',
        templateIds: ['china-hvac-system', 'china-intelligent-building-system'],
        selectedNodesByTemplate: {
          'china-hvac-system': ['HVA-02-01-02'],
          'china-intelligent-building-system': ['INT-02-01-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'bas-zone-1',
          system_object_id: 'bas-hvac-integrated-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['hvac_automatic_control', 'bas_integrated_commissioning', 'ibms_linkage_scene'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('HVA-02-01-02-P04')
    const successor = rowByStableCode.get('INT-02-01-02-P05')

    expect(predecessor, 'HVA-02-01-02-P04 should be generated').toBeTruthy()
    expect(successor, 'INT-02-01-02-P05 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hvac_automatic_control_linkage_test_to_bas_integrated_scene_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hvac_automatic_control_linkage_test_to_bas_integrated_scene_process',
          predecessorStableCode: 'HVA-02-01-02-P04',
          successorStableCode: 'INT-02-01-02-P05',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes security access-video alarm linkage test to BAS integrated scene as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-security-access-video-alarm-bas-integrated-scene-process-release',
        primaryCatalogId: 'china-intelligent-building-system',
        templateIds: ['china-intelligent-building-system'],
        selectedNodesByTemplate: {
          'china-intelligent-building-system': ['INT-02-01-01', 'INT-02-01-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'security-bas-zone-1',
          system_object_id: 'security-bas-integrated-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['security_access_video_alarm', 'bas_integrated_commissioning', 'ibms_linkage_scene'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('INT-02-01-01-P05')
    const successor = rowByStableCode.get('INT-02-01-02-P05')

    expect(predecessor, 'INT-02-01-01-P05 should be generated').toBeTruthy()
    expect(successor, 'INT-02-01-02-P05 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:security_access_video_alarm_linkage_test_to_bas_integrated_scene_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'security_access_video_alarm_linkage_test_to_bas_integrated_scene_process',
          predecessorStableCode: 'INT-02-01-01-P05',
          successorStableCode: 'INT-02-01-02-P05',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes pump-room automatic-switch alarm test to BAS integrated scene as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-pump-room-automatic-switch-alarm-bas-integrated-scene-process-release',
        primaryCatalogId: 'china-plumbing-heating-system',
        templateIds: ['china-plumbing-heating-system', 'china-intelligent-building-system'],
        selectedNodesByTemplate: {
          'china-plumbing-heating-system': ['PLU-02-01-02'],
          'china-intelligent-building-system': ['INT-02-01-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'pump-bas-zone-1',
          system_object_id: 'pump-bas-integrated-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['pump_room_automatic_switch_alarm', 'bas_integrated_commissioning', 'ibms_linkage_scene'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('PLU-02-01-02-P07')
    const successor = rowByStableCode.get('INT-02-01-02-P05')

    expect(predecessor, 'PLU-02-01-02-P07 should be generated').toBeTruthy()
    expect(successor, 'INT-02-01-02-P05 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:pump_room_automatic_switch_alarm_test_to_bas_integrated_scene_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'pump_room_automatic_switch_alarm_test_to_bas_integrated_scene_process',
          predecessorStableCode: 'PLU-02-01-02-P07',
          successorStableCode: 'INT-02-01-02-P05',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes fire alarm point-table review to IBMS alarm graphics configuration as a process-level L3 guidance anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-fire-alarm-point-table-ibms-alarm-graphics-process-release',
        primaryCatalogId: 'china-cecs-fire-system',
        templateIds: ['china-cecs-fire-system', 'china-intelligent-building-system'],
        selectedNodesByTemplate: {
          'china-cecs-fire-system': ['FIR-03-01-01'],
          'china-intelligent-building-system': ['INT-02-01-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'fire-ibms-zone-1',
          system_object_id: 'fire-ibms-alarm-platform-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['fire_alarm_point_table', 'ibms_alarm_graphics', 'platform_permission_configuration'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('FIR-03-01-01-P07')
    const successor = rowByStableCode.get('INT-02-01-02-P06')

    expect(predecessor, 'FIR-03-01-01-P07 should be generated').toBeTruthy()
    expect(successor, 'INT-02-01-02-P06 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:fire_alarm_point_table_review_to_ibms_alarm_graphics_configuration_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'fire_alarm_point_table_review_to_ibms_alarm_graphics_configuration_process',
          predecessorStableCode: 'FIR-03-01-01-P07',
          successorStableCode: 'INT-02-01-02-P06',
          scopeRule: 'same_building',
        }),
      ]),
    }))
  }, 30000)

  it('materializes network connectivity security-policy test to IBMS platform configuration as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-network-connectivity-security-policy-ibms-platform-configuration-process-release',
        primaryCatalogId: 'china-intelligent-building-system',
        templateIds: ['china-intelligent-building-system'],
        selectedNodesByTemplate: {
          'china-intelligent-building-system': ['INT-01-01-02', 'INT-02-01-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'int-network-ibms-zone-1',
          system_object_id: 'ibms-platform-network-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['network_connectivity_security_policy', 'ibms_platform_configuration', 'smart_building_commissioning'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('INT-01-01-02-P05')
    const successor = rowByStableCode.get('INT-02-01-02-P06')

    expect(predecessor, 'INT-01-01-02-P05 should be generated').toBeTruthy()
    expect(successor, 'INT-02-01-02-P06 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:int_network_connectivity_security_policy_test_to_ibms_platform_configuration_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'int_network_connectivity_security_policy_test_to_ibms_platform_configuration_process',
          predecessorStableCode: 'INT-01-01-02-P05',
          successorStableCode: 'INT-02-01-02-P06',
          scopeRule: 'same_system',
        }),
      ]),
    }))
  }, 30000)

  it('materializes emergency power load-transfer test to basement flood-drainage linkage as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-emergency-power-basement-flood-drainage-linkage-process-release',
        primaryCatalogId: 'china-electrical-system',
        templateIds: ['china-electrical-system', 'china-plumbing-heating-system'],
        selectedNodesByTemplate: {
          'china-electrical-system': ['ELE-04-01-01'],
          'china-plumbing-heating-system': ['PLU-07-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-flood-zone-1',
          system_object_id: 'basement-flood-drainage-emergency-power-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['emergency_power', 'basement_flood_control', 'storm_drainage_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('ELE-04-01-01-P06')
    const successor = rowByStableCode.get('PLU-07-01-01-P06')

    expect(predecessor, 'ELE-04-01-01-P06 should be generated').toBeTruthy()
    expect(successor, 'PLU-07-01-01-P06 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:emergency_power_load_transfer_test_to_basement_flood_drainage_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'emergency_power_load_transfer_test_to_basement_flood_drainage_linkage_process',
          predecessorStableCode: 'ELE-04-01-01-P06',
          successorStableCode: 'PLU-07-01-01-P06',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes gas suppression simulated discharge to fire zone scenario linkage as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-gas-suppression-simulated-discharge-fire-zone-linkage-process-release',
        primaryCatalogId: 'china-cecs-fire-system',
        templateIds: ['china-cecs-fire-system'],
        selectedNodesByTemplate: {
          'china-cecs-fire-system': ['FIR-04-02-01', 'FIR-03-02-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'gas-suppression-fire-linkage-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['gas_suppression', 'simulated_discharge', 'fire_zone_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('FIR-04-02-01-P08')
    const successor = rowByStableCode.get('FIR-03-02-01-P05')

    expect(predecessor, 'FIR-04-02-01-P08 should be generated').toBeTruthy()
    expect(successor, 'FIR-03-02-01-P05 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:gas_suppression_simulated_discharge_to_fire_zone_scenario_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'gas_suppression_simulated_discharge_to_fire_zone_scenario_linkage_process',
          predecessorStableCode: 'FIR-04-02-01-P08',
          successorStableCode: 'FIR-03-02-01-P05',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes smoke-control airflow tightness test to smoke linkage logic as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-smoke-control-airflow-tightness-smoke-linkage-logic-process-release',
        primaryCatalogId: 'china-cecs-fire-system',
        templateIds: ['china-cecs-fire-system'],
        selectedNodesByTemplate: {
          'china-cecs-fire-system': ['FIR-02-01-01', 'FIR-03-02-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'zone-1',
          system_object_id: 'smoke-control-fire-linkage-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['smoke_control', 'airflow_tightness_test', 'fire_linkage_logic'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('FIR-02-01-01-P05')
    const successor = rowByStableCode.get('FIR-03-02-01-P02')

    expect(predecessor, 'FIR-02-01-01-P05 should be generated').toBeTruthy()
    expect(successor, 'FIR-03-02-01-P02 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:smoke_control_airflow_tightness_test_to_smoke_linkage_logic_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'smoke_control_airflow_tightness_test_to_smoke_linkage_logic_process',
          predecessorStableCode: 'FIR-02-01-01-P05',
          successorStableCode: 'FIR-03-02-01-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes basement MEP commissioning-condition confirmation to flood-drainage linkage as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-basement-mep-commissioning-condition-flood-drainage-linkage-process-release',
        primaryCatalogId: 'china-building-fine-detail',
        templateIds: ['china-building-fine-detail', 'china-plumbing-heating-system'],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-01-01-05'],
          'china-plumbing-heating-system': ['PLU-07-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-flood-zone-1',
          system_object_id: 'basement-mep-flood-drainage-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['basement_mep_commissioning_condition', 'flood_drainage_linkage_commissioning', 'storm_condition_simulation'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('BDT-01-01-05-P09')
    const successor = rowByStableCode.get('PLU-07-01-01-P06')

    expect(predecessor, 'BDT-01-01-05-P09 should be generated').toBeTruthy()
    expect(successor, 'PLU-07-01-01-P06 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:basement_mep_commissioning_condition_to_flood_drainage_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'basement_mep_commissioning_condition_to_flood_drainage_linkage_process',
          predecessorStableCode: 'BDT-01-01-05-P09',
          successorStableCode: 'PLU-07-01-01-P06',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes basement MEP workface handover to floor-base preparation as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-basement-mep-workface-handover-floor-base-process-release',
        primaryCatalogId: 'china-building-fine-detail',
        templateIds: ['china-building-fine-detail'],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-01-01-05', 'BDT-01-01-06'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-finish-zone-1',
          system_object_id: 'basement-mep-finish-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['basement_mep_workface_handover', 'floor_base_preparation', 'basement_finish_closeout'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('BDT-01-01-05-P10')
    const successor = rowByStableCode.get('BDT-01-01-06-P04')

    expect(predecessor, 'BDT-01-01-05-P10 should be generated').toBeTruthy()
    expect(successor, 'BDT-01-01-06-P04 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:basement_mep_workface_handover_to_floor_base_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'basement_mep_workface_handover_to_floor_base_process',
          predecessorStableCode: 'BDT-01-01-05-P10',
          successorStableCode: 'BDT-01-01-06-P04',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes basement MEP workface handover to garage floor interface treatment as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-basement-mep-workface-handover-garage-floor-interface-treatment-release',
        primaryCatalogId: 'china-building-fine-detail',
        templateIds: ['china-building-fine-detail', 'china-jgj-tianjin-decoration'],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-01-01-05'],
          'china-jgj-tianjin-decoration': ['DEC-02-02-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-garage-floor-zone-1',
          system_object_id: 'basement-mep-garage-floor-interface-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['basement_mep_workface_handover', 'garage_floor_interface_treatment', 'wear_resistant_floor'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('BDT-01-01-05-P10')
    const successor = rowByStableCode.get('DEC-02-02-02-P02')
    const markerSuccessor = rowByStableCode.get('DEC-02-02-02-P01')
    const curingSuccessor = rowByStableCode.get('DEC-02-02-02-P06')

    expect(predecessor, 'BDT-01-01-05-P10 should be generated').toBeTruthy()
    expect(successor, 'DEC-02-02-02-P02 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:basement_mep_workface_handover_to_garage_floor_interface_treatment_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(markerSuccessor?.predecessorDependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        intentCode: 'cross-item:basement_mep_workface_handover_to_garage_floor_interface_treatment_process',
      }),
    ]))
    expect(curingSuccessor?.predecessorDependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        intentCode: 'cross-item:basement_mep_workface_handover_to_garage_floor_interface_treatment_process',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'basement_mep_workface_handover_to_garage_floor_interface_treatment_process',
          predecessorStableCode: 'BDT-01-01-05-P10',
          successorStableCode: 'DEC-02-02-02-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes basement charging-pile reserved interface to EV charger foundation installation as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-basement-charging-pile-interface-to-ev-foundation-release',
        primaryCatalogId: 'china-building-fine-detail',
        templateIds: ['china-building-fine-detail', 'china-electrical-system'],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-01-01-06'],
          'china-electrical-system': ['ELE-03-02-01', 'ELE-03-02-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-charging-pile-zone-1',
          system_object_id: 'basement-ev-charger-system-1',
          project_type_code: 'residential',
          method_variant_codes: ['charging_pile_civil_mep_interface_handover', 'ev_charger_foundation_install'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('BDT-01-01-06-P06')
    const successor = rowByStableCode.get('ELE-03-02-01-P03')
    const operationSuccessor = rowByStableCode.get('ELE-03-02-02-P01')

    expect(predecessor, 'BDT-01-01-06-P06 should be generated').toBeTruthy()
    expect(successor, 'ELE-03-02-01-P03 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:basement_charging_pile_reserved_interface_to_ev_charger_foundation_install_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(operationSuccessor?.predecessorDependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        intentCode: 'cross-item:basement_charging_pile_reserved_interface_to_ev_charger_foundation_install_process',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'basement_charging_pile_reserved_interface_to_ev_charger_foundation_install_process',
          predecessorStableCode: 'BDT-01-01-06-P06',
          successorStableCode: 'ELE-03-02-01-P03',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes basement MEP workface handover to equipment-room interface review as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-basement-mep-workface-equipment-room-interface-process-release',
        primaryCatalogId: 'china-building-fine-detail',
        templateIds: ['china-building-fine-detail'],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-01-01-05', 'BDT-01-01-06'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-equipment-room-zone-1',
          system_object_id: 'basement-mep-equipment-room-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['basement_mep_workface_handover', 'equipment_room_interface_review', 'fire_door_equipment_room_finish'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('BDT-01-01-05-P10')
    const successor = rowByStableCode.get('BDT-01-01-06-P01')

    expect(predecessor, 'BDT-01-01-05-P10 should be generated').toBeTruthy()
    expect(successor, 'BDT-01-01-06-P01 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:basement_mep_workface_handover_to_equipment_room_interface_review_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'basement_mep_workface_handover_to_equipment_room_interface_review_process',
          predecessorStableCode: 'BDT-01-01-05-P10',
          successorStableCode: 'BDT-01-01-06-P01',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes basement masonry-plaster handover to MEP coordination freeze as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-basement-masonry-plaster-mep-coordination-freeze-process-release',
        primaryCatalogId: 'china-building-fine-detail',
        templateIds: ['china-building-fine-detail'],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-01-01-04', 'BDT-01-01-05'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-mep-zone-1',
          system_object_id: 'basement-integrated-mep-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['basement_masonry_plaster_handover', 'mep_coordination_freeze', 'basement_integrated_mep'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('BDT-01-01-04-P08')
    const successor = rowByStableCode.get('BDT-01-01-05-P01')

    expect(predecessor, 'BDT-01-01-04-P08 should be generated').toBeTruthy()
    expect(successor, 'BDT-01-01-05-P01 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:basement_masonry_plaster_handover_to_mep_coordination_freeze_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'basement_masonry_plaster_handover_to_mep_coordination_freeze_process',
          predecessorStableCode: 'BDT-01-01-04-P08',
          successorStableCode: 'BDT-01-01-05-P01',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes wet-area waterproof handover to product-install condition as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-wet-area-waterproof-product-install-condition-process-release',
        primaryCatalogId: 'china-jgj-tianjin-decoration',
        templateIds: ['china-jgj-tianjin-decoration'],
        selectedNodesByTemplate: {
          'china-jgj-tianjin-decoration': ['DEC-03-01-01', 'DEC-03-01-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-3',
          floor_sequence: [{ id: 'floor-3', label: '3F', levelNumber: 3 }],
          physical_zone_object_id: 'wet-area-zone-1',
          system_object_id: 'wet-area-product-system-1',
          project_type_code: 'residential_highrise',
          method_variant_codes: ['wet_area_waterproof_handover', 'kitchen_bathroom_product_install'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('DEC-03-01-01-P09')
    const successor = rowByStableCode.get('DEC-03-01-02-P01')

    expect(predecessor, 'DEC-03-01-01-P09 should be generated').toBeTruthy()
    expect(successor, 'DEC-03-01-02-P01 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:wet_area_waterproof_handover_to_product_install_condition_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'wet_area_waterproof_handover_to_product_install_condition_process',
          predecessorStableCode: 'DEC-03-01-01-P09',
          successorStableCode: 'DEC-03-01-02-P01',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes HVAC environment performance test to basement MEP commissioning-condition as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-hvac-environment-performance-basement-mep-condition-process-release',
        primaryCatalogId: 'china-hvac-system',
        templateIds: ['china-hvac-system', 'china-building-fine-detail'],
        selectedNodesByTemplate: {
          'china-hvac-system': ['HVA-02-01-02'],
          'china-building-fine-detail': ['BDT-01-01-05'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-hvac-mep-zone-1',
          system_object_id: 'basement-hvac-mep-commissioning-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['hvac_environment_performance_test', 'basement_mep_commissioning_condition', 'single_machine_commissioning_readiness'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('HVA-02-01-02-P03')
    const successor = rowByStableCode.get('BDT-01-01-05-P09')

    expect(predecessor, 'HVA-02-01-02-P03 should be generated').toBeTruthy()
    expect(successor, 'BDT-01-01-05-P09 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:hvac_environment_performance_test_to_basement_mep_commissioning_condition_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'hvac_environment_performance_test_to_basement_mep_commissioning_condition_process',
          predecessorStableCode: 'HVA-02-01-02-P03',
          successorStableCode: 'BDT-01-01-05-P09',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes fire cross-system linkage test to basement MEP commissioning-condition as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-fire-cross-system-linkage-basement-mep-commissioning-condition-process-release',
        primaryCatalogId: 'china-cecs-fire-system',
        templateIds: ['china-cecs-fire-system', 'china-building-fine-detail'],
        selectedNodesByTemplate: {
          'china-cecs-fire-system': ['FIR-03-02-01'],
          'china-building-fine-detail': ['BDT-01-01-05'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'basement-fire-mep-zone-1',
          system_object_id: 'basement-fire-mep-commissioning-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['fire_cross_system_linkage', 'basement_mep_commissioning_condition', 'integrated_mep_commissioning'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('FIR-03-02-01-P04')
    const successor = rowByStableCode.get('BDT-01-01-05-P09')

    expect(predecessor, 'FIR-03-02-01-P04 should be generated').toBeTruthy()
    expect(successor, 'BDT-01-01-05-P09 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:fire_cross_system_linkage_test_to_basement_mep_commissioning_condition_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'fire_cross_system_linkage_test_to_basement_mep_commissioning_condition_process',
          predecessorStableCode: 'FIR-03-02-01-P04',
          successorStableCode: 'BDT-01-01-05-P09',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes civil-defense embed handover to protective door install as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-civil-defense-embed-handover-protective-door-install-process-release',
        primaryCatalogId: 'china-civil-defense-specialty',
        templateIds: ['china-civil-defense-specialty'],
        selectedNodesByTemplate: {
          'china-civil-defense-specialty': ['CDF-01-01-01', 'CDF-01-01-02'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'civil-defense-zone-1',
          system_object_id: 'civil-defense-protective-door-system-1',
          project_type_code: 'civil_defense_basement',
          method_variant_codes: ['civil_defense', 'civil_defense_embed', 'protective_door_install', 'airtight_sleeve_handover'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const embeddedStructure = rowByStableCode.get('CDF-01-01-01')
    const protectiveEquipment = rowByStableCode.get('CDF-01-01-02')
    const predecessor = rowByStableCode.get('CDF-01-01-01-P10')
    const successor = rowByStableCode.get('CDF-01-01-02-P08')

    expect(embeddedStructure?.values.execution_phase).toBe('basement_structure')
    expect(protectiveEquipment?.values.execution_phase).toBe('secondary_structure_fitout_roughin')
    expect(predecessor, 'CDF-01-01-01-P10 should be generated').toBeTruthy()
    expect(successor, 'CDF-01-01-02-P08 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:civil_defense_embed_handover_to_protective_door_install_release',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'civil_defense_embed_handover_to_protective_door_install_release',
          predecessorStableCode: 'CDF-01-01-01-P10',
          successorStableCode: 'CDF-01-01-02-P08',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes civil-defense protective equipment handover to ventilation filter install as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-civil-defense-protective-equipment-ventilation-filter-process-release',
        primaryCatalogId: 'china-civil-defense-specialty',
        templateIds: ['china-civil-defense-specialty'],
        selectedNodesByTemplate: {
          'china-civil-defense-specialty': ['CDF-01-01-02', 'CDF-02-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'basement-b1',
          floor_sequence: [{ id: 'basement-b1', label: 'B1', levelNumber: -1 }],
          physical_zone_object_id: 'civil-defense-zone-1',
          system_object_id: 'civil-defense-ventilation-filter-system-1',
          project_type_code: 'civil_defense_basement',
          method_variant_codes: ['civil_defense', 'protective_equipment_interface', 'ventilation_filter_install', 'blast_wave_valve_handover'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('CDF-01-01-02-P11')
    const successor = rowByStableCode.get('CDF-02-01-01-P08')

    expect(predecessor, 'CDF-01-01-02-P11 should be generated').toBeTruthy()
    expect(successor, 'CDF-02-01-01-P08 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:civil_defense_protective_equipment_to_ventilation_filter_release',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'civil_defense_protective_equipment_to_ventilation_filter_release',
          predecessorStableCode: 'CDF-01-01-02-P11',
          successorStableCode: 'CDF-02-01-01-P08',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes commercial kitchen gas interface review to HVAC gas-alarm accident-ventilation linkage as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-commercial-kitchen-gas-interface-hvac-alarm-ventilation-process-release',
        primaryCatalogId: 'china-plumbing-heating-system',
        templateIds: ['china-plumbing-heating-system', 'china-hvac-system'],
        selectedNodesByTemplate: {
          'china-plumbing-heating-system': ['PLU-06-01-01'],
          'china-hvac-system': ['HVA-04-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'kitchen-zone-1',
          system_object_id: 'commercial-kitchen-gas-ventilation-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['commercial_kitchen', 'gas_interface_review', 'gas_alarm_ventilation_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('PLU-06-01-01-P04')
    const makeupAirBalancing = rowByStableCode.get('HVA-04-01-01-P05')
    const successor = rowByStableCode.get('HVA-04-01-01-P06')
    const oilFumePurifier = rowByStableCode.get('HVA-04-01-01-P07')

    expect(predecessor, 'PLU-06-01-01-P04 should be generated').toBeTruthy()
    expect(successor, 'HVA-04-01-01-P06 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:commercial_kitchen_gas_interface_review_to_gas_alarm_ventilation_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'commercial_kitchen_gas_interface_review_to_gas_alarm_ventilation_linkage_process',
          predecessorStableCode: 'PLU-06-01-01-P04',
          successorStableCode: 'HVA-04-01-01-P06',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
    expect(makeupAirBalancing?.predecessorDependencies ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        intentCode: 'cross-item:commercial_kitchen_gas_interface_review_to_gas_alarm_ventilation_linkage_process',
      }),
    ]))
    expect(oilFumePurifier?.predecessorDependencies ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        intentCode: 'cross-item:commercial_kitchen_gas_interface_review_to_gas_alarm_ventilation_linkage_process',
      }),
    ]))
  }, 30000)

  it('materializes kitchen makeup-air balancing to gas alarm ventilation linkage as a process-level L3 release anchor', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-kitchen-makeup-air-gas-alarm-ventilation-linkage-process-release',
        primaryCatalogId: 'china-hvac-system',
        templateIds: ['china-hvac-system', 'china-plumbing-heating-system'],
        selectedNodesByTemplate: {
          'china-hvac-system': ['HVA-04-01-01'],
          'china-plumbing-heating-system': ['PLU-06-01-01'],
        },
        generationDepth: 'process',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'kitchen-zone-1',
          system_object_id: 'commercial-kitchen-gas-ventilation-system-1',
          project_type_code: 'civil_office_commercial',
          method_variant_codes: ['commercial_kitchen', 'makeup_air_balancing', 'gas_alarm_ventilation_linkage'],
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const predecessor = rowByStableCode.get('HVA-04-01-01-P05')
    const successor = rowByStableCode.get('PLU-06-01-01-P05')

    expect(predecessor, 'HVA-04-01-01-P05 should be generated').toBeTruthy()
    expect(successor, 'PLU-06-01-01-P05 should be generated').toBeTruthy()
    expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: predecessor?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:kitchen_makeup_air_balancing_to_gas_alarm_ventilation_linkage_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'kitchen_makeup_air_balancing_to_gas_alarm_ventilation_linkage_process',
          predecessorStableCode: 'HVA-04-01-01-P05',
          successorStableCode: 'PLU-06-01-01-P05',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes prefab bathroom and kitchen factory-unit L3 release anchors at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-factory-unit-l3-process-release-anchors',
        primaryCatalogId: 'china-prefab-bathroom-specialty',
        templateIds: [
          'china-prefab-bathroom-specialty',
          'china-prefab-kitchen-specialty',
        ],
        selectedNodesByTemplate: {
          'china-prefab-bathroom-specialty': ['IBU-01-02-01', 'IBU-02-01-01'],
          'china-prefab-kitchen-specialty': ['IKU-01-02-01', 'IKU-02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floor_object_id: 'floor-1',
          floor_sequence: [{ id: 'floor-1', label: '1F', levelNumber: 1 }],
          physical_zone_object_id: 'unit-1',
          system_object_id: 'factory-unit-system',
          project_type_code: 'hotel',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const expectedReleases = [
      {
        ruleCode: 'integrated_bathroom_factory_trial_to_site_hoist_positioning_process',
        predecessorStableCode: 'IBU-01-02-01-P05',
        successorStableCode: 'IBU-02-01-01-P01',
      },
      {
        ruleCode: 'integrated_kitchen_factory_trial_to_site_hoist_positioning_process',
        predecessorStableCode: 'IKU-01-02-01-P05',
        successorStableCode: 'IKU-02-01-01-P01',
      },
    ] as const

    for (const release of expectedReleases) {
      const predecessor = rowByStableCode.get(release.predecessorStableCode)
      const successor = rowByStableCode.get(release.successorStableCode)

      expect(predecessor, `${release.predecessorStableCode} should be generated`).toBeTruthy()
      expect(successor, `${release.successorStableCode} should be generated`).toBeTruthy()
      expect(successor?.predecessorDependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: predecessor?.clientRowId,
          dependencyType: 'FS',
          lagDays: 1,
          source: 'cross_item_workflow',
          intentCode: `cross-item:${release.ruleCode}`,
          relationRole: 'workflow',
          strength: 'hard',
        }),
      ]))
      expect(successor?.values.standard_task_metadata).toEqual(expect.objectContaining({
        crossItemWorkflow: expect.arrayContaining([
          expect.objectContaining({
            ruleCode: release.ruleCode,
            predecessorStableCode: release.predecessorStableCode,
            successorStableCode: release.successorStableCode,
            scopeRule: 'same_project',
          }),
        ]),
      }))
    }
  }, 30000)

  it('materializes renovation structure-connection release to MEP cutover at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-renovation-structure-connection-mep-cutover',
        primaryCatalogId: 'china-renovation-retrofit-specialty',
        templateIds: ['china-renovation-retrofit-specialty'],
        selectedNodesByTemplate: {
          'china-renovation-retrofit-specialty': [
            'RNV-02-01-02',
            'RNV-02-02-01',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'renovation-building-1',
          physical_zone_object_id: 'renovation-zone-2',
          project_type_code: 'renovation',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const connectionRetest = rowByStableCode.get('RNV-02-01-02-P09')
    const mepCutoverDiscovery = rowByStableCode.get('RNV-02-02-01-P06')

    expect(connectionRetest).toBeTruthy()
    expect(mepCutoverDiscovery?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: connectionRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:renovation_structure_connection_retest_to_mep_cutover_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(mepCutoverDiscovery?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'renovation_structure_connection_retest_to_mep_cutover_process',
          predecessorStableCode: 'RNV-02-01-02-P09',
          successorStableCode: 'RNV-02-02-01-P06',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes TOD protection monitoring release to upper-cover support at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-tod-protection-monitoring-upper-cover-support',
        primaryCatalogId: 'china-tod-upper-cover-specialty',
        templateIds: ['china-tod-upper-cover-specialty'],
        selectedNodesByTemplate: {
          'china-tod-upper-cover-specialty': [
            'TOD-04-01-02',
            'TOD-04-01-03',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'tod-building-1',
          physical_zone_object_id: 'tod-live-line-zone-1',
          project_type_code: 'tod',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const protectionMonitoringAcceptance = rowByStableCode.get('TOD-04-01-02-P09')
    const upperCoverSupport = rowByStableCode.get('TOD-04-01-03-P06')

    expect(protectionMonitoringAcceptance).toBeTruthy()
    expect(upperCoverSupport?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: protectionMonitoringAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:tod_protection_monitoring_acceptance_to_upper_cover_support_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(upperCoverSupport?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'tod_protection_monitoring_acceptance_to_upper_cover_support_process',
          predecessorStableCode: 'TOD-04-01-02-P09',
          successorStableCode: 'TOD-04-01-03-P06',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes TOD metro interface and non-stop operation releases at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-tod-process-release',
        primaryCatalogId: 'china-tod-upper-cover-specialty',
        templateIds: ['china-tod-upper-cover-specialty'],
        selectedNodesByTemplate: {
          'china-tod-upper-cover-specialty': [
            'TOD-01-01-01',
            'TOD-01-01-02',
            'TOD-02-01-01',
            'TOD-02-01-02',
            'TOD-03-01-01',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'tod-zone-1',
          project_type_code: 'tod',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const stationInterfaceRiskCloseout = rowByStableCode.get('TOD-01-01-01-P09')
    const liveLineProtectionSetup = rowByStableCode.get('TOD-01-01-02-P06')
    const liveLineWindowCloseout = rowByStableCode.get('TOD-01-01-02-P09')
    const transferStructureSupport = rowByStableCode.get('TOD-02-01-01-P02')
    const transferStructureAcceptance = rowByStableCode.get('TOD-02-01-01-P09')
    const vibrationIsolationInstall = rowByStableCode.get('TOD-02-01-02-P06')
    const vibrationAcceptance = rowByStableCode.get('TOD-02-01-02-P09')
    const commercialTieIn = rowByStableCode.get('TOD-03-01-01-P06')

    expect(stationInterfaceRiskCloseout).toBeTruthy()
    expect(liveLineProtectionSetup?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: stationInterfaceRiskCloseout?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:tod_station_interface_closeout_to_live_line_protection_setup_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(liveLineProtectionSetup?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'tod_station_interface_closeout_to_live_line_protection_setup_process',
          predecessorStableCode: 'TOD-01-01-01-P09',
          successorStableCode: 'TOD-01-01-02-P06',
          scopeRule: 'same_zone',
        }),
      ]),
    }))

    expect(liveLineWindowCloseout).toBeTruthy()
    expect(transferStructureSupport?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: liveLineWindowCloseout?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:tod_live_line_window_closeout_to_transfer_structure_support_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    expect(transferStructureAcceptance).toBeTruthy()
    expect(vibrationIsolationInstall?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: transferStructureAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:tod_transfer_structure_acceptance_to_vibration_isolation_install_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    expect(vibrationAcceptance).toBeTruthy()
    expect(commercialTieIn?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: vibrationAcceptance?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:tod_vibration_acceptance_to_commercial_tie_in_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
  }, 30000)

  it('materializes renovation and heritage expert-release dependencies at process level', async () => {
    const renovationGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-renovation-process-release',
        primaryCatalogId: 'china-renovation-retrofit-specialty',
        templateIds: ['china-renovation-retrofit-specialty'],
        selectedNodesByTemplate: {
          'china-renovation-retrofit-specialty': [
            'RNV-01-01-01',
            'RNV-01-01-02',
            'RNV-02-01-01',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'renovation-zone-1',
          project_type_code: 'renovation',
        },
      },
    })

    const renovationByStableCode = new Map(renovationGenerated.rows.map((row) => [stableCodeOf(row), row]))
    const renovationRiskCloseout = renovationByStableCode.get('RNV-01-01-01-P09')
    const demolitionBoundaryConfirmation = renovationByStableCode.get('RNV-01-01-02-P01')
    const demolitionSupportCloseout = renovationByStableCode.get('RNV-01-01-02-P09')
    const anchoringDrilling = renovationByStableCode.get('RNV-02-01-01-P06')

    expect(renovationRiskCloseout).toBeTruthy()
    expect(demolitionBoundaryConfirmation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: renovationRiskCloseout?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:renovation_risk_closeout_to_demolition_boundary_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(demolitionBoundaryConfirmation?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'renovation_risk_closeout_to_demolition_boundary_process',
          predecessorStableCode: 'RNV-01-01-01-P09',
          successorStableCode: 'RNV-01-01-02-P01',
          scopeRule: 'same_zone',
        }),
      ]),
    }))

    expect(demolitionSupportCloseout).toBeTruthy()
    expect(anchoringDrilling?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: demolitionSupportCloseout?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:renovation_demolition_support_closeout_to_anchoring_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))

    const heritageGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-heritage-process-release',
        primaryCatalogId: 'china-heritage-preservation-specialty',
        templateIds: ['china-heritage-preservation-specialty'],
        selectedNodesByTemplate: {
          'china-heritage-preservation-specialty': [
            'HRT-01-01-02',
            'HRT-02-01-01',
            'HRT-02-02-01',
            'HRT-03-01-01',
            'HRT-03-01-02',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'heritage-building-1',
          physical_zone_object_id: 'heritage-zone-1',
          project_type_code: 'heritage',
        },
      },
    })

    const heritageByStableCode = new Map(heritageGenerated.rows.map((row) => [stableCodeOf(row), row]))
    const expertReviewCloseout = heritageByStableCode.get('HRT-01-01-02-P09')
    const traditionalRestoration = heritageByStableCode.get('HRT-02-01-01-P03')
    const repairQualityRetest = heritageByStableCode.get('HRT-02-02-01-P09')
    const monitoringReview = heritageByStableCode.get('HRT-03-01-01-P09')
    const openingFacilitySetup = heritageByStableCode.get('HRT-03-01-02-P06')

    expect(expertReviewCloseout).toBeTruthy()
    expect(traditionalRestoration?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: expertReviewCloseout?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:heritage_expert_review_closeout_to_traditional_restoration_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(traditionalRestoration?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'heritage_expert_review_closeout_to_traditional_restoration_process',
          predecessorStableCode: 'HRT-01-01-02-P09',
          successorStableCode: 'HRT-02-01-01-P03',
          scopeRule: 'same_zone',
        }),
      ]),
    }))

    expect(repairQualityRetest).toBeTruthy()
    expect(monitoringReview).toBeTruthy()
    expect(openingFacilitySetup?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: repairQualityRetest?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:heritage_repair_retest_to_opening_setup_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
      expect.objectContaining({
        clientRowId: monitoringReview?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:heritage_monitoring_review_to_opening_setup_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
  }, 30000)

  it('materializes deep foundation dewatering, monitoring, and protection releases at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-deep-foundation-process-release',
        primaryCatalogId: 'china-foundation-pit-pile',
        templateIds: ['china-foundation-pit-pile'],
        selectedNodesByTemplate: {
          'china-foundation-pit-pile': [
            'FND-02-01-01',
            'FND-02-01-02',
            'FND-05-01-01',
            'FND-06-01-01',
            'FND-06-01-04',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'pit-zone-1',
          project_type_code: 'deep_foundation',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const supportDewateringHandover = rowByStableCode.get('FND-02-01-01-P13')
    const tubeWellDewateringHandover = rowByStableCode.get('FND-05-01-01-P08')
    const monitoringHandover = rowByStableCode.get('FND-06-01-01-P09')
    const metroProtectionHandover = rowByStableCode.get('FND-06-01-04-P08')
    const zonedLayeredExcavation = rowByStableCode.get('FND-02-01-02-P02')

    expect(zonedLayeredExcavation).toBeTruthy()
    expect(supportDewateringHandover).toBeTruthy()
    expect(tubeWellDewateringHandover).toBeTruthy()
    expect(monitoringHandover).toBeTruthy()
    expect(metroProtectionHandover).toBeTruthy()

    expect(zonedLayeredExcavation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: supportDewateringHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:foundation_support_dewatering_handover_to_zoned_excavation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
      expect.objectContaining({
        clientRowId: tubeWellDewateringHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:foundation_tube_well_dewatering_handover_to_zoned_excavation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
      expect.objectContaining({
        clientRowId: monitoringHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:foundation_monitoring_handover_to_zoned_excavation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
      expect.objectContaining({
        clientRowId: metroProtectionHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:foundation_metro_protection_handover_to_zoned_excavation_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(zonedLayeredExcavation?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'foundation_support_dewatering_handover_to_zoned_excavation_process',
          predecessorStableCode: 'FND-02-01-01-P13',
          successorStableCode: 'FND-02-01-02-P02',
          scopeRule: 'same_zone',
        }),
        expect.objectContaining({
          ruleCode: 'foundation_tube_well_dewatering_handover_to_zoned_excavation_process',
          predecessorStableCode: 'FND-05-01-01-P08',
          successorStableCode: 'FND-02-01-02-P02',
          scopeRule: 'same_zone',
        }),
        expect.objectContaining({
          ruleCode: 'foundation_monitoring_handover_to_zoned_excavation_process',
          predecessorStableCode: 'FND-06-01-01-P09',
          successorStableCode: 'FND-02-01-02-P02',
          scopeRule: 'same_zone',
        }),
        expect.objectContaining({
          ruleCode: 'foundation_metro_protection_handover_to_zoned_excavation_process',
          predecessorStableCode: 'FND-06-01-04-P08',
          successorStableCode: 'FND-02-01-02-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('materializes foundation pit base handover to cap-raft cushion construction at process level', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-foundation-pit-base-cap-raft-review',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        templateIds: [
          CHINA_GB55032_TEMPLATE_ID,
          'china-foundation-pit-pile',
        ],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-02-03'],
          'china-foundation-pit-pile': ['FND-02-01-02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'pit-zone-1',
          project_type_code: 'deep_foundation',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const pitBaseHandover = rowByStableCode.get('FND-02-01-02-P12')
    const capRaftBaseReview = rowByStableCode.get('01-02-03-P01')
    const capRaftCushionConstruction = rowByStableCode.get('01-02-03-P02')

    expect(pitBaseHandover).toBeTruthy()
    expect(capRaftBaseReview).toBeTruthy()
    expect(capRaftCushionConstruction?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: pitBaseHandover?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:foundation_pit_base_handover_to_cap_raft_cushion_process',
        relationRole: 'workflow',
        strength: 'hard',
      }),
    ]))
    expect(capRaftCushionConstruction?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'foundation_pit_base_handover_to_cap_raft_cushion_process',
          predecessorStableCode: 'FND-02-01-02-P12',
          successorStableCode: '01-02-03-P02',
          scopeRule: 'same_zone',
        }),
      ]),
    }))
  }, 30000)

  it('hard-wires the assembly-rate three-piece evidence chain inside prefab assessment packs', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-prefab-assembly-rate-internal',
        primaryCatalogId: 'china-prefabricated-assembly',
        selectedNodesByTemplate: {
          'china-prefabricated-assembly': ['PFB-03-01-02', 'PFB-04-01-13'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const officialBoundary = rowByStableCode.get('PFB-03-01-02-P01')
    const officialLedger = rowByStableCode.get('PFB-03-01-02-P02')
    const officialSiteCheck = rowByStableCode.get('PFB-03-01-02-P04')
    const promotedBoundary = rowByStableCode.get('PFB-04-01-13-P01')
    const promotedLedger = rowByStableCode.get('PFB-04-01-13-P02')
    const promotedSiteCheck = rowByStableCode.get('PFB-04-01-13-P10')
    const promotedReport = rowByStableCode.get('PFB-04-01-13-P11')

    expect(officialLedger?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: officialBoundary?.clientRowId,
        source: 'sibling_sequence',
        dependencyType: 'FS',
        relationRole: 'workflow',
      }),
    ]))
    expect(officialSiteCheck?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: officialBoundary?.clientRowId,
        source: 'sibling_sequence',
        dependencyType: 'FS',
        relationRole: 'inspection',
      }),
      expect.objectContaining({
        clientRowId: officialLedger?.clientRowId,
        source: 'sibling_sequence',
        dependencyType: 'FS',
        relationRole: 'inspection',
      }),
    ]))
    expect(promotedLedger?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: promotedBoundary?.clientRowId,
        source: 'sibling_sequence',
        dependencyType: 'FS',
      }),
    ]))
    expect(promotedSiteCheck?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: promotedBoundary?.clientRowId,
        source: 'sibling_sequence',
        dependencyType: 'FS',
        relationRole: 'inspection',
      }),
      expect.objectContaining({
        clientRowId: promotedLedger?.clientRowId,
        source: 'sibling_sequence',
        dependencyType: 'FS',
        relationRole: 'inspection',
      }),
    ]))
    expect(promotedReport?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: promotedSiteCheck?.clientRowId,
        source: 'sibling_sequence',
        dependencyType: 'FS',
        relationRole: 'workflow',
      }),
    ]))
  }, 30000)

  it('keeps the five-layer dependency system closed in generated dependency networks', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-dependency-system-closeout',
        templateIds: [
          CHINA_GB55032_TEMPLATE_ID,
          'china-project-milestone-handover',
          'china-quality-responsibility-acceptance',
          'china-waterproof-insulation',
          'china-cecs-fire-system',
          'china-civil-defense-specialty',
          'china-elevator-installation',
          'china-renovation-retrofit-specialty',
          'china-modular-mic-specialty',
          'china-industrial-cleanroom-specialty',
        ],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01', '01-02-01', '02-01-03', '02-02-01'],
          'china-project-milestone-handover': ['MS-01-01-07', 'MS-01-01-10'],
          'china-quality-responsibility-acceptance': ['QR-01-01-03', 'QR-01-01-09', 'QR-01-01-10'],
          'china-waterproof-insulation': ['WPI-02-01-02'],
          'china-cecs-fire-system': ['FIR-05-01-02'],
          'china-civil-defense-specialty': ['CDF-02-01-02'],
          'china-elevator-installation': ['ELV-02-01-02'],
          'china-renovation-retrofit-specialty': ['RNV-01', 'RNV-02-01'],
          'china-modular-mic-specialty': ['MIC-03', 'MIC-04'],
          'china-industrial-cleanroom-specialty': ['ICR-02', 'ICR-03'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
          project_type_code: 'civil_office_commercial',
        },
      },
    })

    assertGeneratedDependencyNetworkIsClosed(generated)

    const rowsByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    expect(rowsByStableCode.get('01-02-01')?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:foundation_pit_to_foundation_work',
        relationRole: 'workflow',
      }),
    ]))
    expect(rowsByStableCode.get('02-02-01')?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:main_structure_to_masonry_infill',
        relationRole: 'workflow',
      }),
    ]))
    expect(rowsByStableCode.get('QR-01-01-09-P03')?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: rowsByStableCode.get('MS-01-01-10-P01')?.clientRowId,
        source: 'dependency_intent_template',
        relationRole: 'inspection',
      }),
    ]))
  }, 30000)

  it('applies dependency intent scope rules while allowing building-level acceptance projections to summarize scoped work', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-dependency-intent-scope',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        templateIds: [
          CHINA_GB55032_TEMPLATE_ID,
          'china-project-milestone-handover',
        ],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-03'],
          'china-project-milestone-handover': ['MS-01-01-07'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          floorIds: ['floor-1', 'floor-2'],
          project_type_code: 'general_civil',
        },
      },
    })

    const rowsByStableCode = (stableCode: string) => generated.rows.filter((row) => (
      String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '') === stableCode
    ))
    const concreteRows = rowsByStableCode('02-01-03-P16')
    const acceptanceRows = rowsByStableCode('MS-01-01-07-P01')

    expect(concreteRows.map((row) => row.values.floor_object_id).sort()).toEqual(['floor-1', 'floor-2'])
    expect(acceptanceRows.map((row) => row.values.floor_object_id).sort()).toEqual(['floor-1', 'floor-2'])

    for (const acceptanceRow of acceptanceRows) {
      const sameFloorConcrete = concreteRows.find((row) => row.values.floor_object_id === acceptanceRow.values.floor_object_id)
      const otherFloorConcrete = concreteRows.find((row) => row.values.floor_object_id !== acceptanceRow.values.floor_object_id)
      const otherFloorAcceptance = acceptanceRows.find((row) => row.values.floor_object_id !== acceptanceRow.values.floor_object_id)

      expect(sameFloorConcrete?.predecessorDependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: acceptanceRow.clientRowId,
          source: 'dependency_intent_template',
        }),
      ]))
      expect(sameFloorConcrete?.predecessorDependencies).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: otherFloorAcceptance?.clientRowId,
          source: 'dependency_intent_template',
        }),
      ]))
      expect(acceptanceRow.values.standard_task_metadata).toEqual(expect.objectContaining({
        dependencyIntentTemplates: expect.arrayContaining([
          expect.objectContaining({
            toReferencedCode: '02-01-03-P16',
            relationRole: 'inspection',
            scopeRule: 'same_floor',
            confidenceLevel: 'high',
            auditReasonCode: 'accepted_business_constraint_confirmed_template_only',
            matchedReferenceField: 'referencedCoreQualityCodes',
          }),
        ]),
        dependencyIntentAuditSummary: expect.objectContaining({
          acceptedRuntimeEligibleCount: expect.any(Number),
          rejectedPhysicalMainlineCount: expect.any(Number),
          confidenceScoreAverage: expect.any(Number),
        }),
      }))
      const sameFloorDependency = sameFloorConcrete?.predecessorDependencies.find((dependency) => (
        dependency.clientRowId === acceptanceRow.clientRowId
        && dependency.source === 'dependency_intent_template'
      ))
      expect(sameFloorDependency).toEqual(expect.objectContaining({
        confidenceLevel: 'high',
        auditReasonCode: 'accepted_business_constraint_confirmed_template_only',
        matchedReferenceField: 'referencedCoreQualityCodes',
        auditTrace: expect.arrayContaining([
          'decision=accepted',
          'autoApplyPolicy=confirmed_template_only',
          'materializeDirection=target_depends_on_source',
        ]),
      }))
      expect(otherFloorConcrete).toBeTruthy()
    }
  }, 30000)

  it('materializes L4 statutory acceptance and residential delivery release gates in dependency direction', async () => {
    const commercialGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-l4-occupancy-release-direction',
        templateIds: ['china-project-milestone-handover'],
        selectedNodesByTemplate: {
          'china-project-milestone-handover': [
            'MS-FIRE-ACCEPTANCE',
            'MS-OCCUPANCY-USE',
            'MS-01-01-11',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'civil_office_commercial',
        },
      },
    })
    const residentialGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-l4-residential-delivery-direction',
        templateIds: ['china-project-milestone-handover'],
        selectedNodesByTemplate: {
          'china-project-milestone-handover': [
            'MS-01-01-11',
            'MS-HOUSEHOLD-ACCEPTANCE',
            'MS-DELIVERY-HANDOVER',
          ],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
        },
      },
    })

    const commercialRowsByStableCode = new Map(commercialGenerated.rows.map((row) => [stableCodeOf(row), row]))
    const residentialRowsByStableCode = new Map(residentialGenerated.rows.map((row) => [stableCodeOf(row), row]))
    const fireAcceptance = commercialRowsByStableCode.get('MS-FIRE-ACCEPTANCE-P01')
    const occupancyUse = commercialRowsByStableCode.get('MS-OCCUPANCY-USE-P01')
    const commercialCompletionFiling = commercialRowsByStableCode.get('MS-01-01-11-P01')
    const residentialCompletionFiling = residentialRowsByStableCode.get('MS-01-01-11-P01')
    const householdAcceptance = residentialRowsByStableCode.get('MS-HOUSEHOLD-ACCEPTANCE-P01')
    const deliveryHandover = residentialRowsByStableCode.get('MS-DELIVERY-HANDOVER-P01')

    expect(fireAcceptance).toBeTruthy()
    expect(occupancyUse).toBeTruthy()
    expect(commercialCompletionFiling).toBeTruthy()
    expect(residentialCompletionFiling).toBeTruthy()
    expect(householdAcceptance).toBeTruthy()
    expect(deliveryHandover).toBeTruthy()

    expect(occupancyUse?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: fireAcceptance?.clientRowId,
        source: 'dependency_intent_template',
        dependencyType: 'FS',
        lagDays: 1,
        relationRole: 'handover',
        strength: 'hard',
        matchedReferenceField: 'referencedMilestoneCodes',
        auditReasonCode: 'accepted_business_constraint_confirmed_template_only',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplate=true',
          'explicitBusinessGateTemplateCode=fire_acceptance_to_occupancy_use_release',
        ]),
      }),
      expect.objectContaining({
        clientRowId: commercialCompletionFiling?.clientRowId,
        source: 'dependency_intent_template',
        dependencyType: 'FS',
        lagDays: 1,
        relationRole: 'handover',
        strength: 'hard',
        matchedReferenceField: 'referencedMilestoneCodes',
        auditReasonCode: 'accepted_business_constraint_confirmed_template_only',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplate=true',
          'explicitBusinessGateTemplateCode=completion_filing_to_occupancy_use_release',
        ]),
      }),
    ]))
    expect(fireAcceptance?.predecessorClientRowIds).not.toContain(occupancyUse?.clientRowId)

    expect(deliveryHandover?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: householdAcceptance?.clientRowId,
        source: 'dependency_intent_template',
        dependencyType: 'FS',
        lagDays: 1,
        relationRole: 'handover',
        strength: 'hard',
        matchedReferenceField: 'referencedMilestoneCodes',
        auditReasonCode: 'accepted_business_constraint_confirmed_template_only',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplate=true',
          'explicitBusinessGateTemplateCode=household_acceptance_to_delivery_release',
        ]),
      }),
      expect.objectContaining({
        clientRowId: residentialCompletionFiling?.clientRowId,
        source: 'dependency_intent_template',
        dependencyType: 'FS',
        lagDays: 1,
        relationRole: 'handover',
        strength: 'hard',
        matchedReferenceField: 'referencedMilestoneCodes',
        auditReasonCode: 'accepted_business_constraint_confirmed_template_only',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplate=true',
          'explicitBusinessGateTemplateCode=completion_filing_to_owner_delivery_release',
        ]),
      }),
    ]))
    expect(householdAcceptance?.predecessorClientRowIds).not.toContain(deliveryHandover?.clientRowId)

    expect(occupancyUse?.values.standard_task_metadata).toEqual(expect.objectContaining({
      dependencyIntentTemplates: expect.arrayContaining([
        expect.objectContaining({
          fromReferencedCode: 'MS-OCCUPANCY-USE-P01',
          toReferencedCode: 'MS-FIRE-ACCEPTANCE-P01',
          relationRole: 'handover',
          relationshipDomain: 'business_constraint',
          sourceSeedRuleIds: expect.arrayContaining([
            'v1.4.7.5:dependencyIntentTemplates',
            'v1.4.22.2:explicit_business_gate_templates',
          ]),
        }),
      ]),
    }))
    expect(deliveryHandover?.values.standard_task_metadata).toEqual(expect.objectContaining({
      dependencyIntentTemplates: expect.arrayContaining([
        expect.objectContaining({
          fromReferencedCode: 'MS-DELIVERY-HANDOVER-P01',
          toReferencedCode: 'MS-HOUSEHOLD-ACCEPTANCE-P01',
          relationRole: 'handover',
          relationshipDomain: 'business_constraint',
          sourceSeedRuleIds: expect.arrayContaining([
            'v1.4.7.5:dependencyIntentTemplates',
            'v1.4.22.2:explicit_business_gate_templates',
          ]),
        }),
        expect.objectContaining({
          fromReferencedCode: 'MS-DELIVERY-HANDOVER-P01',
          toReferencedCode: 'MS-01-01-11-P01',
          relationRole: 'handover',
          relationshipDomain: 'business_constraint',
          sourceSeedRuleIds: expect.arrayContaining([
            'v1.4.7.5:dependencyIntentTemplates',
            'v1.4.22.2:explicit_business_gate_templates',
          ]),
        }),
      ]),
    }))
  }, 30000)

  it('materializes L4 operation handover dossier before warranty-start release in dependency direction', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-l4-operation-handover-warranty-direction',
        primaryCatalogId: 'china-document-commercial-support',
        templateIds: [
          'china-document-commercial-support',
          'china-project-milestone-handover',
        ],
        selectedNodesByTemplate: {
          'china-document-commercial-support': ['DCS-01-01-06'],
          'china-project-milestone-handover': ['MS-01-01-12'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'civil_office_commercial',
        },
      },
    })

    const rowsByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const handoverDossierCloseout = rowsByStableCode.get('DCS-01-01-06-P06')
    const warrantyStart = rowsByStableCode.get('MS-01-01-12-P01')

    expect(handoverDossierCloseout).toBeTruthy()
    expect(warrantyStart).toBeTruthy()

    expect(warrantyStart?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: handoverDossierCloseout?.clientRowId,
        source: 'dependency_intent_template',
        dependencyType: 'FS',
        lagDays: 1,
        relationRole: 'handover',
        strength: 'hard',
        matchedReferenceField: 'referencedMilestoneCodes',
        auditReasonCode: 'accepted_business_constraint_confirmed_template_only',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplate=true',
          'explicitBusinessGateTemplateCode=operation_handover_dossier_to_warranty_start_release',
        ]),
      }),
    ]))
    expect(handoverDossierCloseout?.predecessorDependencies).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: warrantyStart?.clientRowId,
        source: 'dependency_intent_template',
        auditTrace: expect.arrayContaining([
          'explicitBusinessGateTemplateCode=operation_handover_dossier_to_warranty_start_release',
        ]),
      }),
    ]))
  }, 30000)

  it('creates package-level waterproof-to-backfill dependencies without duplicating waterproof internals', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-cross-item-waterproof-backfill',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-07-01', '01-05-02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          physical_zone_object_id: 'zone-1',
          project_type_code: 'residential',
        },
      },
    })

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const undergroundWaterproof = rowByStableCode.get('01-07-01')
    const earthworkBackfill = rowByStableCode.get('01-05-02')

    expect(undergroundWaterproof).toBeTruthy()
    expect(earthworkBackfill).toBeTruthy()
    expect(earthworkBackfill?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: undergroundWaterproof?.clientRowId,
        dependencyType: 'FS',
        lagDays: 1,
        source: 'cross_item_workflow',
        intentCode: 'cross-item:underground_waterproof_to_backfill',
        relationRole: 'workflow',
      }),
    ]))
    expect(earthworkBackfill?.values.standard_task_metadata).toEqual(expect.objectContaining({
      crossItemWorkflow: expect.arrayContaining([
        expect.objectContaining({
          source: 'v1.4.7.5_cross_item_workflow',
          sourceType: 'cross_item_workflow',
          ruleCode: 'underground_waterproof_to_backfill',
          predecessorStableCode: '01-07-01',
          successorStableCode: '01-05-02',
          autoApplyPolicy: 'confirmed_template_only',
        }),
      ]),
    }))
    expect(undergroundWaterproof?.predecessorDependencies ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
      }),
    ]))
  }, 30000)

  it('summarizes standard internal-flow manual governance without exposing it to ordinary generation pages', () => {
    const report = collectStandardInternalFlowGovernanceReport(12)

    expect(report.scope).toBe('same_parent_standard_internal_flow')
    expect(report.summary.catalogCount).toBeGreaterThan(20)
    expect(report.summary.totalRules).toBeGreaterThan(15_000)
    expect(report.summary.curated).toBeGreaterThan(5_000)
    expect(report.summary.reviewRequired).toBeGreaterThan(0)
    expect(report.summary.byCatalogGroup.core_quality).toBeGreaterThan(11_000)
    expect(report.summary.byCatalogGroup.specialty).toBeGreaterThan(2_000)
    expect(report.summary.byCatalogSource.china_gb50300_template_catalog).toBeGreaterThan(11_000)
    expect(report.summary.byCatalogSource.domain_wbs_template_catalog).toBeGreaterThan(3_000)
    expect(report.summary.byCatalogGroupCurationStatus.specialty.review_required).toBeGreaterThan(0)
    expect(report.summary.byCatalogGroupCurationStatus.specialty.curated).toBeGreaterThan(400)
    expect(report.summary.byCatalogGroupCurationStatus.specialty.curated).toBeLessThan(report.summary.byCatalogGroup.specialty)
    expect(report.summary.byCurationMethod.manual_registry).toBeGreaterThan(0)
    expect(report.summary.byCurationMethod.stable_code_backfill).toBeGreaterThan(0)
    expect(report.summary.byCurationMethod.soft_fallback).toBe(report.summary.reviewRequired)
    expect(report.summary.stableCodeBackfillCount).toBeGreaterThan(0)
    expect(report.summary.conditionalRuleCount).toBeGreaterThan(0)
    expect(report.summary.rulesWithEvidenceRefs).toBeGreaterThan(0)
    expect(report.summary.curatedCoverageRatio).toBeGreaterThan(0.2)
    expect(report.summary.reviewRequiredRatio).toBeGreaterThan(0)
    expect(report.summary.evidenceRefCoverageRatio).toBeGreaterThan(0)
    expect(report.summary.parallelScheduleRatio).toBeGreaterThan(0)
    expect(report.summary.byEvidenceRefLevel.standard).toBeGreaterThan(0)
    expect(report.summary.byEvidenceRefLevel.clause).toBeGreaterThan(0)
    expect(report.summary.byEvidenceRefLevel.process).toBeGreaterThan(0)
    expect(report.summary.byEvidenceRefLevel.enterprise_method).toBeGreaterThan(0)
    expect(report.summary.byGovernancePriority.P0).toBeGreaterThan(0)
    expect(report.summary.byEvidenceCode.GB50300).toBeGreaterThan(0)
    expect(report.qualitySignals).toEqual(expect.objectContaining({
      needsManualRuleCuration: true,
      runtimeBlockingPolicy: 'no_user_facing_block; generated order changes only feed backend evidence',
    }))
    expect(report.governancePolicy.reviewRequiredCreatesDependency).toBe(false)
    expect(report.governancePolicy.ordinaryBusinessPagesExposeTechnicalSeedNames).toBe(false)
    expect(report.governancePolicy.hardSequenceMustBeExplicit).toBe(true)
    expect(report.backValidationWorkflow).toEqual(expect.objectContaining({
      backendOnly: true,
      candidateOutput: 'algorithm_seed_candidates.seed_type=standard_internal_flow',
      manualConfirmationScope: expect.arrayContaining(['hard_sequence', 'acceptance_gate']),
      autoPublishForbiddenFor: expect.arrayContaining(['hard_sequence', 'acceptance_gate', 'rules_that_create_task_dependencies']),
    }))
    expect(report.releaseImpactPreview).toEqual(expect.objectContaining({
      backendOnly: true,
      affectedConfirmedPlansPolicy: 'report_only_do_not_mutate_confirmed_baselines_or_monthly_plans',
      runtimeConstraintPolicy: 'do_not_block_task_save_progress_update_baseline_confirm_or_monthly_confirm',
      releaseWorkflow: expect.arrayContaining(['write_audit_snapshot', 'publish_seed_version_without_mutating_confirmed_history']),
      rollbackWorkflow: expect.arrayContaining(['restore_previous_seed_version', 'do_not_mutate_confirmed_history']),
    }))
    expect(report.stableCodeGeneralizationCandidates[0]).toEqual(expect.objectContaining({
      reason: expect.stringContaining('stable_code'),
      impactScope: expect.objectContaining({ backendOnly: true }),
    }))
    expect(report.highPriorityReviewRequiredPairs).toEqual([])
    expect(report.releaseImpactPreview.highPriorityReviewRequiredRules).toBe(0)
    expect(report.executionBaselineGate.status).toBe('runtime_execution_baseline_ready_with_p2_governance_tail')
    expect(report.executionBaselineGate.runtimeImpactStatus).toBe('runtime_impact_ready')
    expect(report.executionBaselineGate.coverageSprintStatus).toBe('coverage_sprint_pending')
    expect(report.executionBaselineGate.scheduleTrustCoverageStatus)
      .toBe('schedule_trust_closed_with_classified_non_l2_tail')
    expect(report.executionBaselineGate.runtimeBlockingReviewRequiredRuleCount).toBe(0)
    expect(report.executionBaselineGate.operatingMode).toBe('freeze_runtime_impact_tail_and_continue_backend_back_validation')
    expect(report.topReviewRequiredPairs[0]).toEqual(expect.objectContaining({
      curationStatus: 'review_required',
      relationKind: 'soft_sequence',
      impactScope: expect.objectContaining({
        backendOnly: true,
        catalogGroups: expect.any(Object),
      }),
    }))
    expect(report.topCuratedPairs[0]).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      governancePriority: expect.stringMatching(/^P[0-2]$/),
      curationMethods: expect.any(Object),
      evidenceRefLevels: expect.any(Object),
      impactScope: expect.objectContaining({ backendOnly: true }),
      examples: expect.any(Array),
    }))
    expect(report.evidenceSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ standardCode: 'GB50300-2013' }),
      expect.objectContaining({ standardCode: 'GB50204-2015' }),
    ]))
  }, 60000)

  it('resolves manually curated same-parent internal-flow rules from the dedicated rule seed', () => {
    flattenChinaTemplateCatalog()
    const resolveSeedRule = (id: string) => {
      const seedRule = STANDARD_INTERNAL_FLOW_RULE_SEED.find((rule) => rule.id === id)
      expect(seedRule, `standard internal flow rule ${id} should exist`).toBeTruthy()
      return resolveStandardInternalFlowRule({
        predecessorStableCode: `test-prev-${id}`,
        predecessorName: seedRule!.predecessorName,
        successorStableCode: `test-next-${id}`,
        successorName: seedRule!.successorName,
        successorCategoryType: 'process',
      })
    }

    expect(resolveSeedRule('ground-improve-pile-position-to-equipment')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'hard_sequence',
      createsDependency: true,
      evidenceCodes: expect.arrayContaining(['GB50202', 'GB50300']),
    }))
    expect(resolveSeedRule('ground-improve-test-pile-to-layer-pile')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'acceptance_gate',
      createsDependency: true,
    }))
    expect(resolveSeedRule('mechanical-water-route-review-to-equipment-arrival')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      relationKind: 'acceptance_gate',
      createsDependency: true,
    }))
    expect(resolveSeedRule('system-flush-pressure-run-to-water-sampling')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'acceptance_gate',
      requiresAllPreviousSiblings: true,
      evidenceRefs: expect.arrayContaining([
        expect.objectContaining({ level: 'enterprise_method' }),
      ]),
    }))
    expect(resolveSeedRule('mechanical-water-hydraulic-balance-to-system-acceptance')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      relationKind: 'acceptance_gate',
      createsDependency: true,
      evidenceCodes: expect.arrayContaining(['GB50243', 'GB50300']),
    }))
    expect(resolveSeedRule('mechanical-water-pipe-install-to-pump-install')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      relationKind: 'parallel_allowed',
      createsDependency: false,
      conditionalEffects: expect.arrayContaining([
        expect.objectContaining({ id: 'pump-room-final-tie-in-after-pipe-install' }),
      ]),
    }))
  })

  it('keeps internal-flow governance parameters for climate, lag days, and specialized generic rules', () => {
    const ruleById = (id: string) => STANDARD_INTERNAL_FLOW_RULE_SEED.find((rule) => rule.id === id)

    expect(ruleById('roofing-water-test-to-protection-acceptance')).toEqual(expect.objectContaining({
      lagDays: 1,
      conditionalEffects: expect.arrayContaining([
        expect.objectContaining({
          id: 'roofing-water-test-rain-window-protection-lag',
          relationKind: 'acceptance_gate',
          lagDays: 2,
          when: expect.arrayContaining([
            expect.objectContaining({ field: 'climate_signal', values: expect.arrayContaining(['rainy_season']) }),
            expect.objectContaining({ field: 'weather_impact_band', values: expect.arrayContaining(['rain_blocks_work']) }),
          ]),
        }),
      ]),
    }))
    expect(ruleById('test-block-curing-to-demold-strength-report-review')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      lagDays: 0,
    }))
    expect(ruleById('pressure-flush-to-pipe-equipment-insulation')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      lagDays: 1,
    }))
    expect(ruleById('generic-structural-hidden-check-to-concrete-pour')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
    }))
    expect(ruleById('generic-finishing-sample-to-appearance-measurement')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
    }))
  })

  it('keeps MEP dependency review fixes for fire pump, duct insulation, and high-voltage switchgear', () => {
    const ruleById = (id: string) => STANDARD_INTERNAL_FLOW_RULE_SEED.find((rule) => rule.id === id)

    expect(ruleById('fire-pump-install-to-flow-pressure-test')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50974', 'GB50261']),
      additionalPredecessorStableCodes: expect.arrayContaining(['FIR-07-01-01-P03']),
    }))
    expect(ruleById('duct-tightness-test-to-insulation')).toEqual(expect.objectContaining({
      relationKind: 'hard_sequence',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['GB50243', 'GB50300']),
    }))
    expect(ruleById('duct-tightness-test-to-insulation-corrosion')).toEqual(expect.objectContaining({
      relationKind: 'hard_sequence',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['GB50243', 'GB50300']),
    }))
    expect(ruleById('duct-tightness-test-to-duct-insulation-handover')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['GB50243', 'GB50300']),
    }))
    expect(ruleById('hv-switchgear-to-partial-discharge-test')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['GB50150', 'GB50303']),
      conditionalEffects: expect.arrayContaining([
        expect.objectContaining({
          id: 'hv-switchgear-partial-discharge-10kv-plus-condition',
          when: expect.arrayContaining([
            expect.objectContaining({
              field: 'method_variant_code',
              values: expect.arrayContaining(['10kv', 'high_voltage']),
            }),
          ]),
        }),
      ]),
    }))
    expect(ruleById('generic-hv-switchgear-to-partial-discharge-test')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['GB50150']),
    }))
    expect(ruleById('hv-switchgear-relay-single-test-to-partial-discharge-test')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['GB50150', 'GB50303']),
      additionalPredecessorStableCodes: expect.arrayContaining(['ELE-01-01-01-P03', 'ELE-01-01-01-P04']),
    }))
    expect(ruleById('hv-partial-discharge-test-to-protection-function-test')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50150', 'GB50303']),
    }))
  })

  it('generates MEP dependency review fixes as real process dependencies', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-mep-review-fixes',
        templateIds: [
          'china-cecs-fire-system',
          'china-hvac-system',
          'china-electrical-system',
        ],
        selectedNodesByTemplate: {
          'china-cecs-fire-system': ['FIR-07-01-01'],
          'china-hvac-system': ['HVA-01-01-01'],
          'china-electrical-system': ['ELE-01-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const firePumpInstall = rowByStableCode.get('FIR-07-01-01-P03')
    const firePumpPressureTest = rowByStableCode.get('FIR-07-01-01-P07')
    const ductTightness = rowByStableCode.get('HVA-01-01-01-P07')
    const ductInsulation = rowByStableCode.get('HVA-01-01-01-P08')
    const relaySingleTest = rowByStableCode.get('ELE-01-01-01-P07')
    const partialDischarge = rowByStableCode.get('ELE-01-01-01-P08')

    expect(firePumpPressureTest).toBeTruthy()
    expect(firePumpPressureTest?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: firePumpInstall?.clientRowId,
        source: 'sibling_sequence',
      }),
    ]))
    expect((firePumpPressureTest?.values.standard_task_metadata as any)?.internalFlow).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      curationStatus: 'curated',
      curationMethod: 'stable_code_backfill',
      governancePriority: 'P2',
      seedRuleId: expect.stringContaining('stable-code-FIR-07-01-01-P06-to-FIR-07-01-01-P07'),
      requiresAllPreviousSiblings: true,
      predecessorStableCodes: expect.arrayContaining(['FIR-07-01-01-P03', 'FIR-07-01-01-P06']),
      evidenceCodes: expect.arrayContaining(['GB55037-2022', 'GB50300']),
    }))

    expect(ductInsulation).toBeTruthy()
    expect(ductInsulation?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: ductTightness?.clientRowId,
        source: 'sibling_sequence',
      }),
    ]))
    expect((ductInsulation?.values.standard_task_metadata as any)?.internalFlow).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      governancePriority: 'P1',
      seedRuleId: expect.stringContaining('duct-tightness-test-to-duct-insulation-handover'),
      requiresAllPreviousSiblings: true,
      predecessorStableCodes: expect.arrayContaining(['HVA-01-01-01-P06', 'HVA-01-01-01-P07']),
      evidenceCodes: expect.arrayContaining(['GB50243', 'GB50300']),
    }))

    expect(partialDischarge?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: relaySingleTest?.clientRowId,
        source: 'sibling_sequence',
      }),
    ]))
    expect((partialDischarge?.values.standard_task_metadata as any)?.internalFlow).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      governancePriority: 'P1',
      seedRuleId: expect.stringContaining('hv-switchgear-relay-single-test-to-partial-discharge-test'),
      predecessorStableCodes: expect.arrayContaining(['ELE-01-01-01-P05', 'ELE-01-01-01-P07']),
      evidenceCodes: expect.arrayContaining(['GB50150', 'GB50303']),
    }))
  }, 15000)

  it('promotes high-voltage partial discharge review gap into core catalog dependencies', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-core-hv-partial-discharge-review-gap',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['07-02-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const rowByStableCode = new Map(generated.rows.map((row) => [stableCodeOf(row), row]))
    const partialDischarge = rowByStableCode.get('07-02-02-P07')
    const protectionFunctionTest = rowByStableCode.get('07-02-02-P08')

    expect(String(partialDischarge?.values.title)).toContain('局部放电')
    expect(String(protectionFunctionTest?.values.title)).toContain('保护整定')
    expect(protectionFunctionTest?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clientRowId: partialDischarge?.clientRowId,
        dependencyType: 'FS',
        source: 'sibling_sequence',
      }),
    ]))
    expect((protectionFunctionTest?.values.standard_task_metadata as any)?.internalFlow).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      curationMethod: 'stable_code_backfill',
      governancePriority: 'P2',
      seedRuleId: expect.stringContaining('stable-code-07-02-02-P07-to-07-02-02-P08'),
      evidenceCodes: expect.arrayContaining(['GB50303']),
    }))
  }, 15000)

  it('keeps civil-structure dependency review fixes for lag, basement waterproofing, and evidence gaps', () => {
    const ruleById = (id: string) => STANDARD_INTERNAL_FLOW_RULE_SEED.find((rule) => rule.id === id)

    expect(ruleById('curing-protection-to-post-cast-strip-close-guidance')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      lagDays: 60,
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50204', 'GB50300']),
      additionalPredecessorStableCodes: expect.arrayContaining(['02-01-03-P07', '02-01-05-P07']),
      conditionalEffects: expect.arrayContaining([
        expect.objectContaining({
          id: 'post-cast-strip-close-high-rise-age-wait',
          lagDays: 90,
        }),
        expect.objectContaining({
          id: 'post-cast-strip-close-super-high-rise-age-wait',
          lagDays: 120,
        }),
      ]),
    }))
    expect(ruleById('post-cast-strip-pour-wait-to-close')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      lagDays: 60,
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50204', 'GB50300']),
      additionalPredecessorStableCodes: expect.arrayContaining(['02-01-03-P11', '02-01-05-P11']),
      conditionalEffects: expect.arrayContaining([
        expect.objectContaining({
          id: 'post-cast-strip-pour-wait-high-rise-age-wait',
          lagDays: 90,
        }),
        expect.objectContaining({
          id: 'post-cast-strip-pour-wait-super-high-rise-age-wait',
          lagDays: 120,
        }),
      ]),
    }))
    expect(ruleById('post-cast-strip-close-to-impermeability-test')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      lagDays: 60,
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50204', 'GB50300']),
    }))
    expect(ruleById('same-condition-specimen-to-removal-strength-report')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      lagDays: 1,
      governancePriority: 'P0',
      conditionalEffects: expect.arrayContaining([
        expect.objectContaining({
          id: 'formwork-removal-strength-slab-span-le-2m',
          reasonCode: 'FORMWORK_REMOVAL_SLAB_LE_2M_REQUIRES_50_PERCENT_STRENGTH',
        }),
        expect.objectContaining({
          id: 'formwork-removal-strength-slab-span-2m-to-8m',
          reasonCode: 'FORMWORK_REMOVAL_SLAB_2_TO_8M_REQUIRES_75_PERCENT_STRENGTH',
        }),
        expect.objectContaining({
          id: 'formwork-removal-strength-slab-span-gt-8m',
          reasonCode: 'FORMWORK_REMOVAL_SLAB_GT_8M_REQUIRES_100_PERCENT_STRENGTH',
        }),
        expect.objectContaining({
          id: 'formwork-removal-strength-beam-arch-shell-span-le-8m',
          reasonCode: 'FORMWORK_REMOVAL_BEAM_ARCH_SHELL_LE_8M_REQUIRES_75_PERCENT_STRENGTH',
        }),
        expect.objectContaining({
          id: 'formwork-removal-strength-beam-arch-shell-span-gt-8m',
          reasonCode: 'FORMWORK_REMOVAL_BEAM_ARCH_SHELL_GT_8M_REQUIRES_100_PERCENT_STRENGTH',
        }),
        expect.objectContaining({
          id: 'formwork-removal-strength-cantilever-member',
          reasonCode: 'FORMWORK_REMOVAL_CANTILEVER_REQUIRES_100_PERCENT_STRENGTH',
        }),
      ]),
    }))
    expect(ruleById('pile-integrity-test-to-pile-foundation-acceptance')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      lagDays: 7,
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50202', 'JGJ106', 'GB50300']),
      conditionalEffects: expect.arrayContaining([
        expect.objectContaining({
          id: 'pile-integrity-static-high-strain-core-age-wait',
          lagDays: 28,
        }),
      ]),
    }))

    for (const id of [
      'r15-basement-external-wall-form-removal-to-waterproof-base',
      'r15-basement-external-wall-base-to-waterproof-layer',
      'r15-basement-external-wall-waterproof-to-protection-board-wall',
      'r15-basement-external-wall-protection-to-backfill',
    ]) {
      expect(ruleById(id)).toEqual(expect.objectContaining({
        relationKind: 'acceptance_gate',
        governancePriority: 'P0',
        evidenceCodes: expect.arrayContaining(['GB50300']),
      }))
    }
    expect(ruleById('r15-basement-external-wall-form-removal-to-waterproof-base')?.evidenceCodes).toEqual(expect.arrayContaining(['GB50108', 'GB50208', 'GB50204']))
    expect(ruleById('r15-basement-external-wall-base-to-waterproof-layer')?.evidenceCodes).toEqual(expect.arrayContaining(['GB50108', 'GB50208']))
    expect(ruleById('r15-basement-external-wall-waterproof-to-protection-board-wall')?.evidenceCodes).toEqual(expect.arrayContaining(['GB50108', 'GB50208']))
    expect(ruleById('r15-basement-external-wall-protection-to-backfill')?.evidenceCodes).toEqual(expect.arrayContaining(['GB50202']))

    expect(ruleById('r15-light-pole-base-review-to-pole-luminaire-install')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['CJJ45', 'GB50303']),
    }))
    expect(ruleById('r15-light-pole-install-to-power-on-test')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['CJJ45', 'GB50303']),
    }))

    expect(ruleById('batch5-curtain-wall-four-property-to-handover')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['JGJ102', 'GB/T21086']),
    }))

    expect(ruleById('batch5-tod-station-structure-to-waterproof-backfill')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50299', 'GB50157']),
    }))
    expect(ruleById('batch5-tod-track-area-to-mep-handover')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50299', 'GB50157']),
    }))
    expect(ruleById('batch5-tod-ancillary-structure-to-entrance-decoration')).toEqual(expect.objectContaining({
      relationKind: 'hard_sequence',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['GB50299', 'GB50157']),
    }))
    expect(ruleById('batch5-tod-connection-passage-waterproof-acceptance')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P1',
      evidenceCodes: expect.arrayContaining(['GB50299', 'GB50157']),
    }))

    expect(ruleById('batch5-cleanroom-hepa-to-air-cleanliness-acceptance')).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['GB50333', 'JGJ312', 'GB50591']),
    }))

    for (const id of [
      'moisture-layer-to-protection-close',
      'pipe-quality-check-to-leak-rectification',
      'pressure-record-to-leak-retest',
      'leak-test-zone-seal-to-record',
      'leak-test-record-to-retest',
      'leak-tightness-to-system-commission',
      'pipe-groove-thread-to-prefab-review',
      'hoisting-rigging-to-route-clearance',
      'hoisting-route-to-trial-lift',
      'settingout-to-hoisting-preparation',
      'pipe-segment-review-to-groove-thread',
      'steel-node-clean-to-fastener',
      'steel-fastener-to-node-review',
      'appearance-defect-to-ndt',
      'ndt-to-report-close',
    ]) {
      const rule = ruleById(id)
      expect(rule?.evidenceCodes?.length ?? 0).toBeGreaterThan(0)
      expect(rule?.governancePriority).toBe('P2')
    }
  })

  it('keeps batch5 B-minus evidence and priority governance closed', () => {
    const rulesMissingGovernance = STANDARD_INTERNAL_FLOW_RULE_SEED.filter((rule) => (
      !rule.evidenceCodes?.length || !rule.governancePriority
    ))

    expect(rulesMissingGovernance).toEqual([])

    const ruleById = (id: string) => STANDARD_INTERNAL_FLOW_RULE_SEED.find((rule) => rule.id === id)
    for (const id of [
      'generic-condition-to-briefing',
      'generic-workface-to-execution',
      'commission-condition-to-plan',
      'pressure-plan-to-pressure-record',
      'software-parameter-write-to-backup',
      'air-water-balance-to-linkage-test',
    ]) {
      expect(ruleById(id)).toEqual(expect.objectContaining({
        evidenceCodes: expect.arrayContaining(['GB50300']),
        governancePriority: 'P2',
      }))
    }
  })

  it('keeps batch5 management dependency review fix for attached climbing scaffold expert review', () => {
    const rule = STANDARD_INTERNAL_FLOW_RULE_SEED.find((item) => item.id === 'attached-climbing-scaffold-plan-to-expert-review')

    expect(rule).toEqual(expect.objectContaining({
      relationKind: 'acceptance_gate',
      governancePriority: 'P0',
      evidenceCodes: expect.arrayContaining(['JGJ202', 'JGJ59-2011']),
      applicableCategoryTypes: expect.arrayContaining(['process']),
      applicableWhen: expect.arrayContaining([
        expect.objectContaining({
          field: 'predecessor_name',
          values: expect.any(Array),
        }),
        expect.objectContaining({
          field: 'successor_name',
          values: expect.any(Array),
        }),
      ]),
    }))
    expect(rule?.applicableWhen?.every((condition) => Array.isArray(condition.values) && condition.values.length > 0)).toBe(true)
  })

  it('resolves batch5 attached climbing scaffold expert review as a P0 dependency', () => {
    const rule = STANDARD_INTERNAL_FLOW_RULE_SEED.find((item) => item.id === 'attached-climbing-scaffold-plan-to-expert-review')
    expect(rule).toBeTruthy()

    const internalFlow = resolveStandardInternalFlowRule({
      predecessorStableCode: 'DANGER-01-01-04-P03',
      predecessorName: String(rule?.predecessorName ?? ''),
      successorStableCode: 'DANGER-01-01-04-P04',
      successorName: String(rule?.successorName ?? ''),
      successorCategoryType: 'process',
      catalogSource: 'domain_wbs_template_catalog',
    })

    expect(internalFlow).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'acceptance_gate',
      createsDependency: true,
      dependencyType: 'FS',
      lagDays: 0,
      governancePriority: 'P0',
      seedRuleId: 'internal-flow:attached-climbing-scaffold-plan-to-expert-review:DANGER-01-01-04-P03:DANGER-01-01-04-P04',
      evidenceCodes: expect.arrayContaining(['JGJ202', 'JGJ59-2011', 'GB50300']),
    }))
  })

  it('keeps non-duration conditional same-parent rows reference-only without user-facing seed fields', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-internal-flow-conditional',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-06'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          method_variant_codes: ['precast_hoisting'],
        },
      },
    })

    const hoistBriefing = generated.rows.find((row) => stableCodeOf(row) === '02-01-06-P02')
    expect(hoistBriefing?.predecessorDependencies).toHaveLength(0)
    expect(hoistBriefing?.values).not.toHaveProperty('internal_flow')
    expect(hoistBriefing?.values.standard_task_metadata).toEqual(expect.objectContaining({
      internalFlow: expect.objectContaining({
        curationStatus: 'system_resolved',
        curationMethod: 'duration_contribution_mode_guard',
        relationKind: 'parallel_allowed',
        createsDependency: false,
        reasonCode: 'DURATION_CONTRIBUTION_MODE_REFERENCE_ONLY',
        durationContributionModePolicy: 'reference_only_not_sibling_dependency',
      }),
    }))
  }, 15000)


  it('registers the v1.4.7.2 site, danger, quality responsibility, milestone, and document packs with required metadata depth', async () => {
    const catalog = await listWbsTemplateCatalog({ includeNodes: true })
    const assertTemplateDepth = (
      templateId: string,
      expected: {
        packType: string
        templateGroup: string
        generationPolicy: string
        minItemWorkCount: number
        minProcessCount: number
        minActivityStepCount: number
      },
    ) => {
      const template = catalog.templates.find((item) => item.id === templateId)
      expect(template, `${templateId} should be registered in the WBS template catalog`).toBeTruthy()
      expect(template).toEqual(expect.objectContaining({
        packType: expected.packType,
        templateGroup: expected.templateGroup,
        generationPolicy: expected.generationPolicy,
      }))
      expect(template?.evidenceSummary.itemWorkCount).toBeGreaterThanOrEqual(expected.minItemWorkCount)
      expect(template?.evidenceSummary.processCount).toBeGreaterThanOrEqual(expected.minProcessCount)
      expect(template?.evidenceSummary.activityStepCount).toBeGreaterThanOrEqual(expected.minActivityStepCount)
      expect(template?.evidenceSummary.reviewNeededCount).toBe(0)
      expect(template?.evidenceSummary.webVerifiedFalseCount).toBe(0)
    }

    assertTemplateDepth('china-building-site-management', {
      packType: 'site_management',
      templateGroup: 'site_management',
      generationPolicy: 'default_selected',
      minItemWorkCount: 20,
      minProcessCount: 95,
      minActivityStepCount: 395,
    })
    assertTemplateDepth('china-dangerous-subproject-control', {
      packType: 'danger_control',
      templateGroup: 'danger_control',
      generationPolicy: 'triggered',
      minItemWorkCount: 25,
      minProcessCount: 190,
      minActivityStepCount: 760,
    })
    const dangerTriggerKeywords = catalog.templates.find((template) => template.id === 'china-dangerous-subproject-control')?.triggerKeywords
    expect(Array.isArray(dangerTriggerKeywords)).toBe(true)
    expect(dangerTriggerKeywords?.length).toBeGreaterThanOrEqual(3)
    assertTemplateDepth('china-quality-responsibility-acceptance', {
      packType: 'quality_responsibility',
      templateGroup: 'quality_responsibility',
      generationPolicy: 'default_selected',
      minItemWorkCount: 21,
      minProcessCount: 103,
      minActivityStepCount: 424,
    })
    assertTemplateDepth('china-project-milestone-handover', {
      packType: 'project_milestone',
      templateGroup: 'project_milestone',
      generationPolicy: 'default_selected',
      minItemWorkCount: 103,
      minProcessCount: 103,
      minActivityStepCount: 380,
    })
    assertTemplateDepth('china-document-commercial-support', {
      packType: 'document_commercial_support',
      templateGroup: 'document_commercial_support',
      generationPolicy: 'default_selected',
      minItemWorkCount: 11,
      minProcessCount: 53,
      minActivityStepCount: 139,
    })

    const siteNodes = flattenDomainNodes(getDomainTemplate('china-building-site-management').divisions)
    const siteItemProcessCounts = siteNodes
      .filter((node) => node.categoryType === 'item_work')
      .map((node) => (node.children ?? []).filter((child) => child.categoryType === 'process').length)
    const siteProcesses = siteNodes.filter((node) => node.categoryType === 'process')
    expect(siteItemProcessCounts.length).toBeGreaterThanOrEqual(20)
    expect(siteItemProcessCounts.filter((count) => count >= 4).length).toBeGreaterThanOrEqual(20)
    expect(siteItemProcessCounts.filter((count) => count === 1).length).toBeLessThanOrEqual(1)
    expect(Math.max(...siteItemProcessCounts)).toBeLessThanOrEqual(6)
    expect(siteProcesses.every((node) => node.metadata?.generationMode === 'default_selected_project_scope')).toBe(true)
    expect(siteProcesses.every((node) => node.metadata?.scopeRecommendation === 'whole_project_first')).toBe(true)
    expect(siteProcesses.filter((node) => node.metadata?.safetyManagementLoop === true).length).toBeGreaterThanOrEqual(20)

    const dangerProcesses = flattenDomainNodes(getDomainTemplate('china-dangerous-subproject-control').divisions)
      .filter((node) => node.categoryType === 'process')
    expect(dangerProcesses.length).toBeGreaterThanOrEqual(190)
    const dangerApprovalProcesses = dangerProcesses.filter((node) => node.metadata?.relationRole === 'approval')
    const triggeredDangerProcesses = dangerProcesses.filter((node) => node.metadata?.relationRole !== 'approval')
    expect(dangerApprovalProcesses).toEqual(expect.arrayContaining([
      expect.objectContaining({ stableCode: 'DANGER-DEEP-PIT-APPROVAL-P01' }),
      expect.objectContaining({ stableCode: 'DANGER-MAJOR-WORKS-PLAN-APPROVAL-P04' }),
    ]))
    expect(dangerApprovalProcesses.every((node) => Array.isArray(node.metadata?.acceptanceCheckpoints) && node.metadata.acceptanceCheckpoints.length >= 3)).toBe(true)
    expect(dangerApprovalProcesses.every((node) => Array.isArray(node.metadata?.evidenceRefs) && node.metadata.evidenceRefs.length > 0)).toBe(true)
    expect(triggeredDangerProcesses.length).toBeGreaterThanOrEqual(190)
    expect(triggeredDangerProcesses.every((node) => Array.isArray(node.metadata?.dangerTriggers) && node.metadata.dangerTriggers.length > 0)).toBe(true)
    expect(triggeredDangerProcesses.every((node) => Array.isArray(node.metadata?.triggerConditions) && node.metadata.triggerConditions.length > 0)).toBe(true)
    expect(triggeredDangerProcesses.every((node) => node.metadata?.generationMode === 'auto_by_trigger_only')).toBe(true)
    expect(triggeredDangerProcesses.every((node) => node.metadata?.triggerClosureRequired === true)).toBe(true)
    expect(triggeredDangerProcesses.flatMap((node) => node.metadata?.triggerConditions ?? []).every((condition: any) => condition.sourceField && condition.operator)).toBe(true)
    expect(dangerProcesses.some((node) => node.stableCode.startsWith('DANGER-01'))).toBe(true)
    expect(dangerProcesses.some((node) => node.stableCode.startsWith('DANGER-02'))).toBe(true)
    expect(dangerProcesses.some((node) => node.stableCode.startsWith('DANGER-DEEP'))).toBe(true)
    expect(dangerProcesses.some((node) => node.stableCode.startsWith('DANGER-MAJOR'))).toBe(true)
    expect(dangerProcesses.some((node) => node.metadata?.dangerLawScope === false)).toBe(true)
    const highFormworkTriggerConditions = dangerProcesses
      .flatMap((node) => node.metadata?.triggerConditions ?? [])
      .filter((condition: any) => String(condition.sourceField ?? '').includes('support'))
    expect(highFormworkTriggerConditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceField: 'engineeringObject.metadata.supportHeightM', operator: '>=', value: 5 }),
      expect.objectContaining({ sourceField: 'engineeringObject.metadata.supportHeightM', operator: '>=', value: 8 }),
      expect.objectContaining({ sourceField: 'engineeringObject.metadata.supportSpanM', operator: '>=', value: 10 }),
      expect.objectContaining({ sourceField: 'engineeringObject.metadata.supportSpanM', operator: '>=', value: 18 }),
    ]))

    const qualityProcesses = flattenDomainNodes(getDomainTemplate('china-quality-responsibility-acceptance').divisions)
      .filter((node) => node.categoryType === 'process')
    expect(qualityProcesses.length).toBeGreaterThanOrEqual(103)
    expect(qualityProcesses.every((node) => Array.isArray(node.metadata?.acceptanceCheckpoints) && node.metadata.acceptanceCheckpoints.length >= 3)).toBe(true)
    expect(qualityProcesses.every((node) => node.metadata?.checkpointExpansionPolicy === 'metadata_only')).toBe(true)
    expect(qualityProcesses.every((node) => node.metadata?.duplicateBoundary === 'reference_core_quality_not_duplicate_work')).toBe(true)
    expect(qualityProcesses.every((node) => node.metadata?.branchFamily && node.metadata?.branchSelectionMode)).toBe(true)
    const residentialOnlyProcesses = qualityProcesses.filter((node) => (
      (node.metadata?.applicableProjectTypes as string[] | undefined)?.includes('residential')
    ))
    expect(residentialOnlyProcesses.length).toBeGreaterThan(0)
    expect(residentialOnlyProcesses.every((node) => (node.metadata?.applicableProjectTypes as string[] | undefined)?.includes('residential'))).toBe(true)
    expect(qualityProcesses.some((node) => node.metadata?.branchFamily === 'quality_responsibility_medical_cleanroom')).toBe(true)
    expect(qualityProcesses.some((node) => node.metadata?.branchFamily === 'quality_responsibility_data_center')).toBe(true)
    expect(qualityProcesses.some((node) => node.metadata?.branchFamily === 'quality_responsibility_industrial_cleanroom')).toBe(true)
    expect(qualityProcesses.some((node) => node.metadata?.branchFamily === 'quality_responsibility_prefab')).toBe(true)

    const milestoneProcesses = flattenDomainNodes(getDomainTemplate('china-project-milestone-handover').divisions)
      .filter((node) => node.categoryType === 'process')
    expect(milestoneProcesses.length).toBeGreaterThanOrEqual(103)
    expect(milestoneProcesses.every((node) => ['milestone', 'linked_projection'].includes(String(node.metadata?.planItemKind)) && node.metadata?.baselineCandidate === true)).toBe(true)
    expect(milestoneProcesses.every((node) => node.metadata?.branchFamily && node.metadata?.branchSelectionMode)).toBe(true)
    expect(milestoneProcesses.filter((node) => node.metadata?.planItemKind === 'linked_projection').length).toBeGreaterThanOrEqual(4)
    expect(milestoneProcesses.filter((node) => node.metadata?.planItemKind === 'linked_projection').every((node) => node.metadata?.scheduleParticipation === 'read_only_projection')).toBe(true)
    expect(milestoneProcesses.every((node) => node.metadata?.projectTypeBindingPolicy === 'by_project_type')).toBe(true)
    expect(milestoneProcesses.every((node) => node.metadata?.generationMode === 'read_only_milestone_projection')).toBe(true)
    expect(milestoneProcesses.filter((node) => node.metadata?.isAcceptanceMilestone === true).length).toBeGreaterThanOrEqual(4)
    const specialAcceptanceMilestone = milestoneProcesses.find((node) => node.stableCode === 'MS-01-01-10-P01')
    expect(specialAcceptanceMilestone?.metadata?.acceptanceLinkRule).toEqual(expect.objectContaining({
      referencedTable: 'acceptance_plans',
      bindingMode: 'read_only_projection',
    }))
    expect(specialAcceptanceMilestone?.metadata).toEqual(expect.objectContaining({
      relationRole: 'inspection',
      referencedQualityResponsibilityCodes: expect.arrayContaining(['QR-01-01-09-P03', 'QR-01-01-10-P01', 'QR-01-01-10-P02']),
      referencedSpecialtyCodes: expect.arrayContaining([
        'WPI-02-01-02-P06',
        'FIR-05-01-02-P06',
        'CDF-02-01-02-P06',
        'ELV-02-01-02-P07',
      ]),
    }))
    expect(milestoneProcesses.find((node) => node.stableCode === 'MS-01-01-23-P01')?.metadata).toEqual(expect.objectContaining({
      applicableProjectTypes: ['residential'],
      referencedSpecialtyCodes: ['ELE-03-02-01-P08-S04'],
      semanticReferencedSpecialtyCodes: ['ELE-03-02-01-P08'],
      relationRole: 'inspection',
      isAcceptanceMilestone: true,
    }))
    expect(milestoneProcesses.find((node) => node.stableCode === 'MS-01-01-24-P01')?.metadata).toEqual(expect.objectContaining({
      applicableProjectTypes: ['residential', 'public'],
      referencedSpecialtyCodes: expect.arrayContaining(['PFB-03-01-02-P08', 'PFB-03-01-03-P06']),
      relationRole: 'inspection',
      isAcceptanceMilestone: true,
    }))
    expect(milestoneProcesses.find((node) => node.stableCode === 'MS-01-01-27-P01')?.metadata?.applicableProjectTypes).toEqual(['hospital'])
    expect(milestoneProcesses.find((node) => node.stableCode === 'MS-01-01-37-P01')?.metadata?.applicableProjectTypes).toEqual(expect.arrayContaining(['industrial', 'data_center', 'idc']))
    for (const projectType of WBS_TEMPLATE_PROJECT_TYPE_CODES) {
      expect(milestoneProcesses.some((node) => (node.metadata?.applicableProjectTypes as string[] | undefined)?.includes(projectType))).toBe(true)
    }

    const documentProcesses = flattenDomainNodes(getDomainTemplate('china-document-commercial-support').divisions)
      .filter((node) => node.categoryType === 'process')
    expect(documentProcesses.length).toBeGreaterThanOrEqual(53)
    expect(documentProcesses.some((node) => Array.isArray(node.metadata?.referencedQualityResponsibilityCodes))).toBe(true)
    expect(documentProcesses.every((node) => node.metadata?.drawingBoundary === 'exclude_drawing_version_truth')).toBe(true)
    expect(documentProcesses.every((node) => node.metadata?.generationMode === 'evidence_chain_task')).toBe(true)
    expect(documentProcesses.some((node) => node.stableCode.startsWith('DCS-01-01-01'))).toBe(true)
    expect(documentProcesses.some((node) => node.metadata?.relationRole === 'evidence')).toBe(true)
    expect(documentProcesses.some((node) => node.metadata?.relationRole === 'commercial')).toBe(true)
    expect(documentProcesses.some((node) => node.metadata?.relationRole === 'handover')).toBe(true)
  }, 15000)
  it('carries v1.4.7.4 process constraint seed facts in generated task metadata without adding user-facing fields', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-constraint',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-03'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const constrainedRow = generated.rows.find((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return Array.isArray(metadata?.processConstraintRules) && metadata.processConstraintRules.length > 0
    })
    expect(constrainedRow).toBeTruthy()
    expect(constrainedRow?.values).not.toHaveProperty('process_constraint_rules')
  }, 15000)

  it('projects v1.4.7.4 process constraint effects into row metadata through applyProcessConstraintEffects', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-constraint-effect',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-03'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const rows = generated.rows.map((row) => ({
      ...row,
      values: {
        ...row.values,
        standard_task_metadata: {
          ...((row.values.standard_task_metadata as Record<string, unknown> | undefined) ?? {}),
          processConstraintEffect: undefined,
          processConstraintEffects: undefined,
          durationContext: undefined,
        },
      },
    }))

    applyProcessConstraintEffects(rows)

    const constrainedRow = rows.find((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return Boolean(metadata?.processConstraintEffect) && Boolean(metadata?.durationContext)
    })
    const metadata = constrainedRow?.values.standard_task_metadata as Record<string, any> | undefined

    expect(constrainedRow).toBeTruthy()
    expect(metadata?.processConstraintEffect).toEqual(expect.objectContaining({
      source: 'v1.4.7.4_process_constraint',
      sourceType: 'process_constraint',
      relationInputPolicy: 'requires_existing_relation',
      dependencyCreationPolicy: 'never_create_dependency',
      durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
      durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
    }))
    expect(metadata?.processConstraintEffects.length).toBeGreaterThan(0)
    expect(metadata?.durationContext).toEqual(expect.objectContaining({
      source: 'v1.4.7.4_process_constraint',
      processConstraintRuleCount: expect.any(Number),
      processConstraintPolicy: expect.objectContaining({
        createsDependency: false,
        requiresExistingRelation: true,
        userFacingFieldsAdded: false,
      }),
    }))
    expect(constrainedRow?.values).not.toHaveProperty('process_constraint_effect')
    expect(constrainedRow?.values).not.toHaveProperty('duration_context')
  }, 15000)

  it('routes v1.4.7.4 process constraints onto existing dependency candidates without creating edges', () => {
    const rows = [
      {
        clientRowId: 'row-waterproof',
        parentClientRowId: null,
        parentRowId: null,
        sortOrder: 1,
        predecessorClientRowIds: [],
        predecessorDependencies: [],
        values: {
          wbs_node_type: 'process',
          category_type: 'process',
          title: '卫生间防水及闭水试验',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-10',
          start_date: '2026-06-01',
          end_date: '2026-06-10',
          standard_task_metadata: { stableCode: 'WTR-01' },
        },
        durationSuggestion: null,
      },
      {
        clientRowId: 'row-tile',
        parentClientRowId: null,
        parentRowId: null,
        sortOrder: 2,
        predecessorClientRowIds: ['row-waterproof'],
        predecessorDependencies: [{
          clientRowId: 'row-waterproof',
          dependencyType: 'FS',
          lagDays: 0,
          source: 'sibling_sequence',
          relationRole: 'workflow',
          strength: 'recommended',
        }],
        values: {
          wbs_node_type: 'process',
          category_type: 'process',
          title: '卫生间墙地砖铺贴',
          planned_start_date: '2026-06-11',
          planned_end_date: '2026-06-15',
          start_date: '2026-06-11',
          end_date: '2026-06-15',
          standard_task_metadata: {
            stableCode: 'TIL-01',
            processConstraintRules: [{
              stableCode: 'bathroom_waterproof_to_tile_room_overlap',
              constraintType: 'overlap_allowed',
              applicationMode: 'edge_overlap',
              impactMode: 'overlap_ratio',
              runtimeActionPolicy: 'candidate_only',
              timeSourcePolicy: 'explicit_carrier_or_standard_work_duration',
              durationLookupPolicy: 'route_to_standard_work_duration_seed',
              durationLookupKeys: ['waterproof_water_test', 'tile_laying'],
              carrierProcessHints: ['防水施工', '闭水试验', '墙地砖铺贴'],
              durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
              durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
              partialOverlapRatio: 0.3,
              startAfterPercent: 70,
              scopeGranularity: 'room',
              releaseQuantityPolicy: 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy',
              minReleaseQuantityPercent: 90,
              quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
              quantityProxyRiskLevel: 'high',
              quantitySourcePriority: ['task_planned_completed_quantity'],
              insufficientQuantityPolicy: 'candidate_only_until_real_quantity_or_scope_release',
              quantityDoubleCountPolicy: 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
              sourceStandard: 'national_standard',
              sourceVersion: 'GB50207-2012 + GB50210-2018',
              sourceClauseRef: 'Bathroom tile work can be released room by room after waterproof test and base acceptance.',
              confidence: 'medium',
            }],
          },
        },
        durationSuggestion: null,
      },
    ]

    applyProcessConstraintEffects(rows as any)

    expect(rows[1].predecessorDependencies).toHaveLength(1)
    expect(rows[1].predecessorDependencies[0]).toEqual(expect.objectContaining({
      clientRowId: 'row-waterproof',
      dependencyType: 'FS',
      lagDays: 0,
      processConstraintRoutingCandidates: [
        expect.objectContaining({
          source: 'v1.4.7.4_process_constraint',
          ruleCode: 'bathroom_waterproof_to_tile_room_overlap',
          applicationMode: 'edge_overlap',
          runtimeActionPolicy: 'candidate_only',
          mutationBoundary: 'candidate_only_existing_dependency_no_auto_mutation',
          dependencyCreationPolicy: 'never_create_dependency',
          proposedDependencyType: 'SS',
          proposedLagDays: 7,
          proposedStartAfterPercent: 70,
          proposedPartialOverlapRatio: 0.3,
          releaseQuantityPolicy: 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy',
          minReleaseQuantityPercent: 90,
        }),
      ],
    }))
    expect((rows[1].values.standard_task_metadata as any).durationContext.processConstraintPolicy).toEqual(expect.objectContaining({
      createsDependency: false,
      routesExistingDependencies: true,
      autoMutatesDependencies: false,
      edgeRoutingCandidateCount: 1,
    }))
  })

  it('uses process-constraint routing candidates in read-only candidate CPM without mutating dependencies', () => {
    const rows = [
      {
        clientRowId: 'row-waterproof',
        parentClientRowId: null,
        parentRowId: null,
        sortOrder: 1,
        predecessorClientRowIds: [],
        predecessorDependencies: [],
        rowProjectionMode: 'schedule_row',
        values: {
          wbs_node_type: 'process',
          category_type: 'process',
          title: '卫生间防水及闭水试验',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-10',
          start_date: '2026-06-01',
          end_date: '2026-06-10',
          standard_task_metadata: { stableCode: 'WTR-01' },
        },
        durationSuggestion: null,
      },
      {
        clientRowId: 'row-tile',
        parentClientRowId: null,
        parentRowId: null,
        sortOrder: 2,
        predecessorClientRowIds: ['row-waterproof'],
        predecessorDependencies: [{
          clientRowId: 'row-waterproof',
          dependencyType: 'FS',
          lagDays: 0,
          source: 'sibling_sequence',
          relationRole: 'workflow',
          strength: 'recommended',
        }],
        rowProjectionMode: 'schedule_row',
        values: {
          wbs_node_type: 'process',
          category_type: 'process',
          title: '卫生间墙地砖铺贴',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-06-05',
          start_date: '2026-06-01',
          end_date: '2026-06-05',
          standard_task_metadata: {
            stableCode: 'TIL-01',
            processConstraintRules: [{
              stableCode: 'bathroom_waterproof_to_tile_room_overlap',
              constraintType: 'overlap_allowed',
              applicationMode: 'edge_overlap',
              impactMode: 'overlap_ratio',
              runtimeActionPolicy: 'candidate_only',
              timeSourcePolicy: 'explicit_carrier_or_standard_work_duration',
              durationLookupPolicy: 'route_to_standard_work_duration_seed',
              durationLookupKeys: ['waterproof_water_test', 'tile_laying'],
              carrierProcessHints: ['防水施工', '闭水试验', '墙地砖铺贴'],
              durationAuthorityPolicy: 'no_duration_values_in_process_constraint',
              durationDoubleCountPolicy: 'standard_work_duration_owns_all_day_values_process_constraint_owns_edge_routing',
              partialOverlapRatio: 0.3,
              startAfterPercent: 70,
              scopeGranularity: 'room',
              releaseQuantityPolicy: 'real_task_quantity_then_standard_duration_quantity_proxy_then_scope_proxy',
              minReleaseQuantityPercent: 90,
              quantityEvidenceRequirement: 'real_quantity_required_for_auto_release',
              quantityProxyRiskLevel: 'high',
              quantitySourcePriority: ['task_planned_completed_quantity'],
              insufficientQuantityPolicy: 'candidate_only_until_real_quantity_or_scope_release',
              quantityDoubleCountPolicy: 'standard_work_duration_owns_default_quantity_process_constraint_owns_release_threshold',
              sourceStandard: 'national_standard',
              sourceVersion: 'GB50207-2012 + GB50210-2018',
              sourceClauseRef: 'Bathroom tile work can be released room by room after waterproof test and base acceptance.',
              confidence: 'medium',
            }],
          },
        },
        durationSuggestion: null,
      },
    ]

    applyProcessConstraintEffects(rows as any)
    const evaluation = buildCandidateNetworkEvaluationForGeneratedRows(rows as any)
    const tileSchedule = evaluation?.rowSchedule.find((item) => item.generatedRowId === 'row-tile')

    expect(rows[1].predecessorDependencies).toHaveLength(1)
    expect(rows[1].predecessorDependencies[0]).toEqual(expect.objectContaining({
      clientRowId: 'row-waterproof',
      dependencyType: 'FS',
      lagDays: 0,
    }))
    expect(evaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      projectedNetworkSpanDays: 12,
      previewEdgeCount: 1,
      processConstraintRoutingCandidateEdgeCount: 1,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(tileSchedule).toEqual(expect.objectContaining({
      startDay: 7,
      finishDay: 12,
      durationDays: 5,
    }))
  })

  it('projects descendant process constraints onto collapsed overview itemPack rows', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-overview-constraint-effect',
        templateIds: ['china-foundation-pit-pile'],
        selectedNodesByTemplate: {
          'china-foundation-pit-pile': ['FND-02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          physical_zone_object_id: 'zone-1',
        },
      },
    })

    const row = generated.rows.find((candidate) => stableCodeOf(candidate) === 'FND-02-01-01')
    const metadata = row?.values.standard_task_metadata as Record<string, any> | undefined

    expect(row?.values.wbs_node_type).toBe('item_work')
    expect(metadata?.processConstraintEffect).toEqual(expect.objectContaining({
      source: 'v1.4.7.4_process_constraint',
      sourceType: 'process_constraint',
      dependencyCreationPolicy: 'never_create_dependency',
    }))
    expect(metadata?.processConstraintEffects.length).toBeGreaterThan(0)
    expect(metadata?.durationContext).toEqual(expect.objectContaining({
      source: 'v1.4.7.4_process_constraint',
      processConstraintPolicy: expect.objectContaining({
        createsDependency: false,
        userFacingFieldsAdded: false,
      }),
    }))
  }, 15000)

  it('uses engineering features to split supported process rows by existing element variants', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-feature',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['02-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
          structure_type_code: 'shear_wall',
          method_variant_codes: ['aluminum_formwork'],
          element_variant_codes: ['beam', 'slab'],
        },
      },
    })

    const elementRows = generated.rows.filter((row) => row.values.element_variant_code)
    expect(elementRows.length).toBeGreaterThan(0)
    expect(elementRows.map((row) => row.values.element_variant_code)).toEqual(expect.arrayContaining(['beam', 'slab']))
    expect(elementRows.some((row) => String(row.values.title).includes('梁'))).toBe(true)
    expect(elementRows.some((row) => String(row.values.title).includes('板'))).toBe(true)

    const metadata = elementRows[0].values.standard_task_metadata as Record<string, any>
    expect(metadata.projectGenerationFacts).toEqual(expect.objectContaining({
      businessType: 'residential',
      structureTypeCode: 'shear_wall',
      methodVariantCodes: ['aluminum_formwork'],
      elementVariantCodes: ['beam', 'slab'],
    }))
    expect(metadata.elementVariant).toEqual(expect.objectContaining({
      code: expect.stringMatching(/beam|slab/),
      source: 'explicit_engineering_feature',
      confidence: 'high',
    }))
  }, 15000)

  it('does not turn method variants into cartesian-expanded rows', async () => {
    const baseOperation = {
      type: 'template_generate' as const,
      templateId: CHINA_GB55032_TEMPLATE_ID,
      selectedNodeIds: ['02-01-01'],
      plannedStartDate: '2026-06-01',
      scope: {
        building_object_id: 'building-1',
      },
    }
    const baseGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-method-base',
      },
    })
    const methodGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-method-feature',
        scope: {
          ...baseOperation.scope,
          method_variant_codes: ['aluminum_formwork'],
        },
      },
    })

    expect(methodGenerated.rows).toHaveLength(baseGenerated.rows.length)
    expect(methodGenerated.scopeCombos).toHaveLength(baseGenerated.scopeCombos.length)
    expect(methodGenerated.rows.every((row) => row.values.element_variant_code == null)).toBe(true)
    expect(methodGenerated.rows.every((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, any>
      return metadata.projectGenerationFacts?.methodVariantCodes?.[0] === 'aluminum_formwork'
        && row.values.standard_task_metadata != null
    })).toBe(true)
  }, 15000)

  it('uses method variant metadata to include specialty supplement processes only when matched', async () => {
    const baseOperation = {
      type: 'template_generate' as const,
      templateId: 'china-building-fine-detail',
      selectedNodeIds: ['BDT-04-01-01'],
      plannedStartDate: '2026-06-01',
      scope: {
        building_object_id: 'building-1',
      },
    }
    const baseGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-method-filter-base',
      },
    })
    const methodGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-method-filter-aluminum',
        scope: {
          ...baseOperation.scope,
          method_variant_codes: ['aluminum_formwork'],
        },
      },
    })

    expect(baseGenerated.rows.some((row) => String(row.values.title).includes('铝模深化配模'))).toBe(false)
    const aluminumRow = methodGenerated.rows.find((row) => String(row.values.title).includes('铝模深化配模'))
    expect(aluminumRow).toBeTruthy()
    expect(methodGenerated.rows.length).toBeGreaterThan(baseGenerated.rows.length)
    expect(aluminumRow?.values.standard_task_metadata).toEqual(expect.objectContaining({
      applicableMethodVariantCodes: ['aluminum_formwork'],
      methodVariantExpansionPolicy: 'supplement_process_pack',
      historyFeedbackPolicy: expect.objectContaining({
        mode: 'candidate_only',
        directSeedMutation: false,
      }),
    }))
  }, 15000)

  it('applies floor rhythm curves when generating explicit floor arrays for standard floor packs', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          scopeExpansionMode: 'explicit_instances',
          floors: ['L5', 'L6', 'L25'],
          method_variant_codes: ['aluminum_formwork'],
        },
        generationBatchId: 'batch-floor-rhythm',
      } as any,
      diagnosticDurationSuggestionMode: 'fast_template',
    })

    const processRows = generated.rows.filter((row) => row.values.wbs_node_type === 'process')
    expect(processRows.length).toBeGreaterThan(0)

    const parentRows = generated.rows.filter((row) => (
      row.values.wbs_node_type === 'item_work'
      && String((row.values.standard_task_metadata as Record<string, any>)?.stableCode ?? row.values.standard_work_code ?? '') === 'BDT-04-01-01'
    ))
    expect(parentRows).toHaveLength(3)
    expect(parentRows.map(durationDaysOf)).toEqual([7, 5, 6])
    expect(parentRows.map((row) => (row.values.duration_suggestion as Record<string, any>)?.templateFastEstimateDays)).toEqual([7, 5, 6])
    expect(parentRows.map((row) => (row.values.duration_suggestion as Record<string, any>)?.businessReasonCode)).toEqual([
      'STANDARD_FLOOR_RHYTHM_WINDOW',
      'STANDARD_FLOOR_RHYTHM_WINDOW',
      'STANDARD_FLOOR_RHYTHM_WINDOW',
    ])
    expect(parentRows[0].values.planned_start_date).toBe('2026-06-01')
    expect(parentRows[1].values.planned_start_date).not.toBe('2026-06-01')
    expect(parentRows[2].values.planned_start_date).not.toBe('2026-06-01')

    const groupedByFloor = new Map<string, typeof processRows>()
    for (const row of processRows) {
      const floor = String(row.values.floor_object_id ?? '')
      const group = groupedByFloor.get(floor) ?? []
      group.push(row)
      groupedByFloor.set(floor, group)
    }

    expect(groupedByFloor.size).toBe(3)

    const floorDurations = [...groupedByFloor.entries()].map(([floor, rows]) => ({
      floor,
      total: rows.reduce((sum, row) => {
        const start = new Date(`${String(row.values.planned_start_date).slice(0, 10)}T00:00:00Z`)
        const end = new Date(`${String(row.values.planned_end_date).slice(0, 10)}T00:00:00Z`)
        return sum + Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
      }, 0),
      start: String(rows[0]?.values.planned_start_date ?? ''),
      span: (() => {
        const starts = rows.map((row) => String(row.values.planned_start_date).slice(0, 10)).filter(Boolean).sort()
        const ends = rows.map((row) => String(row.values.planned_end_date).slice(0, 10)).filter(Boolean).sort()
        const first = starts[0]
        const last = ends[ends.length - 1]
        if (!first || !last) return 0
        const start = new Date(`${first}T00:00:00Z`)
        const end = new Date(`${last}T00:00:00Z`)
        return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
      })(),
    }))

    expect(floorDurations.map((item) => item.span)).toEqual(parentRows.map(durationDaysOf))
    floorDurations.forEach((item, index) => {
      expect(item.span).toBeLessThanOrEqual(durationDaysOf(parentRows[index]))
      expect(item.start).toBe(String(parentRows[index].values.planned_start_date))
    })
    const rhythmAdjustments = processRows
      .map((row) => {
        const meta = row.values.standard_task_metadata as Record<string, any>
        return meta?.floorRhythm ?? meta?.durationSuggestion?.floorRhythmAdjustment
      })
      .filter((adjustment): adjustment is Record<string, any> => (
        adjustment?.source === 'template_duration_truth_asset'
        && adjustment?.adjustmentKind === 'floor_duration_curve'
      ))
    expect(rhythmAdjustments.length).toBeGreaterThan(0)
    expect(rhythmAdjustments.every((adjustment) => (
      adjustment.allocationPolicy === 'overlapped_package_child_rhythm_window'
      && adjustment.adjustedDurationDays <= adjustment.floorCurveDays
    ))).toBe(true)
  }, 15000)

  it('falls back to child plan-window rollup when floor rhythm metadata has no explicit boundary asset', async () => {
    const templateRoots = await loadWbsTemplateNodes('china-building-fine-detail')
    const flattenTemplateNodes = (nodes: any[]): any[] => nodes.flatMap((node) => [node, ...flattenTemplateNodes(node.children ?? [])])
    const sourceNode = flattenTemplateNodes(templateRoots).find((node) => node.stableCode === 'BDT-04-01-01')
    expect(sourceNode).toBeTruthy()
    const metadata = sourceNode!.metadata as Record<string, unknown>
    const originalBoundary = {
      durationBoundaryPolicy: metadata.durationBoundaryPolicy,
      durationBoundaryPolicySource: metadata.durationBoundaryPolicySource,
      planDurationTruthSource: metadata.planDurationTruthSource,
      parentDurationTruthRole: metadata.parentDurationTruthRole,
      parentDurationTruthBoundary: metadata.parentDurationTruthBoundary,
    }

    let generated: Awaited<ReturnType<typeof generateWbsTemplateRowsRaw>>
    delete metadata.durationBoundaryPolicy
    delete metadata.durationBoundaryPolicySource
    delete metadata.planDurationTruthSource
    delete metadata.parentDurationTruthRole
    delete metadata.parentDurationTruthBoundary
    try {
      generated = await generateWbsTemplateRowsRaw({
        projectId: '00000000-0000-4000-8000-000000000001',
        surface: 'task_list',
        detailLevel: 'standard',
        diagnosticDurationSuggestionMode: 'fast_template',
        operation: {
          type: 'template_generate',
          generationBatchId: 'batch-floor-rhythm-without-boundary-asset',
          templateId: 'china-building-fine-detail',
          selectedNodeIds: ['BDT-04-01-01'],
          plannedStartDate: '2026-06-01',
          scope: {
            building_object_id: 'building-1',
            scopeExpansionMode: 'explicit_instances',
            floors: ['L6'],
            method_variant_codes: ['aluminum_formwork'],
          },
        } as any,
      })
    } finally {
      Object.assign(metadata, originalBoundary)
    }

    const rowsByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const parent = rowsByStableCode.get('BDT-04-01-01')
    const concrete = rowsByStableCode.get('BDT-04-01-01-P07')

    expect(parent).toBeTruthy()
    expect(concrete).toBeTruthy()
    expect(parent?.values.duration_suggestion).toEqual(expect.objectContaining({
      planDurationTruthSource: 'child_plan_window_rollup',
      durationBoundaryRole: 'aggregate_parent_duration',
      businessReasonCodes: expect.arrayContaining(['CHILD_PLAN_WINDOW_ROLLUP']),
      factorAvailability: expect.objectContaining({
        child_plan_window_rollup: true,
      }),
    }))
    expect(parent?.values.standard_task_metadata).not.toEqual(expect.objectContaining({
      durationBoundaryPolicy: 'rhythm_package_window',
      planDurationTruthSource: 'parent_package_rhythm_window',
    }))
    expect(concrete?.values.duration_suggestion).toEqual(expect.objectContaining({
      planDurationTruthSource: null,
    }))
    expect((concrete?.values.duration_suggestion as Record<string, unknown>)?.durationBoundaryRole ?? null).toBeNull()
    expect((concrete?.values.standard_task_metadata as Record<string, unknown>)?.scheduleAuthorityPolicy ?? null).toBeNull()
  }, 15000)

  it('uses realistic package-child rhythm work durations instead of raw overlap spans inside standard floor packs', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'standard',
        scope: {
          building_object_id: 'building-1',
          scopeExpansionMode: 'explicit_instances',
          floors: ['L6'],
          method_variant_codes: ['aluminum_formwork'],
        },
        generationBatchId: 'batch-floor-rhythm-child-windows',
      } as any,
      diagnosticDurationSuggestionMode: 'fast_template',
    })

    const processRows = generated.rows
      .filter((row) => row.values.wbs_node_type === 'process')
      .map((row) => ({
        row,
        stableCode: String((row.values.standard_task_metadata as Record<string, any>).stableCode ?? row.values.standard_work_code ?? ''),
        title: String(row.values.title ?? ''),
        duration: durationDaysOf(row),
        suggestion: row.values.duration_suggestion as Record<string, any>,
        metadata: row.values.standard_task_metadata as Record<string, any>,
      }))

    expect(processRows.length).toBeGreaterThan(0)
    const parentRows = generated.rows.filter((row) => String((row.values.standard_task_metadata as Record<string, any>).stableCode ?? row.values.standard_work_code) === 'BDT-04-01-01')
    expect(parentRows.map(durationDaysOf)).toEqual([5])
    const parentStart = String(parentRows[0].values.planned_start_date).slice(0, 10)
    const dateFromWindowDay = (day: number) => {
      const date = new Date(`${parentStart}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() + day - 1)
      return date.toISOString().slice(0, 10)
    }

    const concrete = processRows.find((item) => item.stableCode === 'BDT-04-01-01-P07')
    expect(concrete).toBeTruthy()
    expect(concrete?.duration).toBe(1)
    expect(concrete?.suggestion).toEqual(expect.objectContaining({
      packageChildPlanDurationDays: 1,
      independentReferenceDurationDays: expect.any(Number),
      planDurationTruthSource: 'parent_package_rhythm_window',
    }))
    expect(concrete?.suggestion.independentReferenceDurationDays).toBeGreaterThan(1)
    expect(concrete?.suggestion.businessReasonParams).toEqual(expect.objectContaining({
      rhythmWindowStartDay: 5,
      rhythmWindowEndDay: 5,
      rhythmWindowRole: 'concrete_pour',
      rhythmWindowSource: 'template_duration_truth_asset',
      parentReferenceDurationDays: 5,
      packageChildPlanDurationDays: 1,
    }))
    expect(concrete?.metadata.floorRhythm).toEqual(expect.objectContaining({
      source: 'template_duration_truth_asset',
      adjustmentKind: 'floor_duration_curve',
      allocationPolicy: 'overlapped_package_child_rhythm_window',
      rhythmWindowStartDay: 5,
      rhythmWindowEndDay: 5,
      rhythmWindowSource: 'template_duration_truth_asset',
      adjustedDurationDays: 1,
      originalDurationDays: expect.any(Number),
    }))

    const expectedWindows = new Map([
      ['BDT-04-01-01-P02', { start: 1, end: 2, duration: 2, role: 'wall_column_rebar' }],
      ['BDT-04-01-01-P04', { start: 2, end: 2, duration: 1, role: 'wall_column_formwork' }],
      ['BDT-04-01-01-P05', { start: 2, end: 3, duration: 2, role: 'beam_slab_formwork' }],
      ['BDT-04-01-01-P06', { start: 3, end: 4, duration: 2, role: 'beam_slab_rebar' }],
      ['BDT-04-01-01-P07', { start: 5, end: 5, duration: 1, role: 'concrete_pour' }],
    ])
    for (const [stableCode, expected] of expectedWindows) {
      const item = processRows.find((candidate) => candidate.stableCode === stableCode)
      expect(item, `${stableCode} should be generated`).toBeTruthy()
      expect(item?.duration).toBe(expected.duration)
      expect(item?.row.values.planned_start_date).toBe(dateFromWindowDay(expected.start))
      expect(item?.row.values.planned_end_date).toBe(dateFromWindowDay(expected.end))
      expect(item?.suggestion).toEqual(expect.objectContaining({
        packageChildPlanDurationDays: expected.duration,
        planDurationTruthSource: 'parent_package_rhythm_window',
        packageChildRhythmWindowStartDay: expected.start,
        packageChildRhythmWindowEndDay: expected.end,
        packageChildRhythmWindowRole: expected.role,
      }))
      expect(item?.metadata.scheduleAuthorityPolicy).toBe('package_child_rhythm_window')
      expect(item?.row.predecessorDependencies.filter((dependency) => dependency.source === 'sibling_sequence')).toHaveLength(0)
      if (item?.metadata.internalFlow) {
        expect(item.metadata.internalFlow).toEqual(expect.objectContaining({
          createsDependency: false,
          dependencyMaterializationPolicy: 'metadata_only_parent_package_window_authority',
        }))
      }
    }

    const longestChildDuration = Math.max(...processRows.map((item) => item.duration))
    expect(longestChildDuration).toBeLessThanOrEqual(2)
    const activeConstructionRows = processRows.filter((item) => (
      ['duration_bearing', 'quality_gate', 'handover_marker'].includes(String(item.metadata.durationContributionMode ?? ''))
    ))
    const spanStart = activeConstructionRows.map((item) => String(item.row.values.planned_start_date).slice(0, 10)).sort()[0]
    const spanEnd = activeConstructionRows.map((item) => String(item.row.values.planned_end_date).slice(0, 10)).sort().at(-1)
    expect(durationDaysBetween(spanStart, spanEnd)).toBe(5)
  }, 15000)

  it('keeps first-assembly aluminum-formwork gates out of repeated middle standard floors', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'standard',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'standard',
        scope: {
          building_object_id: 'building-1',
          scopeExpansionMode: 'explicit_instances',
          floors: ['L5', 'L6', 'L25'],
          method_variant_codes: ['aluminum_formwork'],
        },
        generationBatchId: 'batch-floor-rhythm-first-assembly-gate',
      } as any,
      diagnosticDurationSuggestionMode: 'fast_template',
    })

    const aluminumFirstAssemblyRows = generated.rows.filter((row) => (
      String((row.values.standard_task_metadata as Record<string, any>)?.stableCode ?? '') === 'BDT-04-01-01-P03'
    ))

    expect(aluminumFirstAssemblyRows).toHaveLength(1)
    expect(aluminumFirstAssemblyRows[0].values.floor_sequence_position).toBe('first')
    expect(Date.parse(`${String(aluminumFirstAssemblyRows[0].values.planned_start_date).slice(0, 10)}T00:00:00Z`)).toBeGreaterThanOrEqual(Date.parse('2026-06-01T00:00:00Z'))
    expect(Date.parse(`${String(aluminumFirstAssemblyRows[0].values.planned_end_date).slice(0, 10)}T00:00:00Z`)).toBeLessThanOrEqual(Date.parse('2026-06-07T00:00:00Z'))
    expect(generated.rows.filter((row) => (
      row.values.floor_sequence_position === 'middle'
      && String((row.values.standard_task_metadata as Record<string, any>)?.stableCode ?? '') === 'BDT-04-01-01-P03'
    ))).toHaveLength(0)
  }, 15000)

  it('compacts standard floor rhythm scopes into one rhythm schedule row per building', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'standard',
        scope: {
          buildings: ['building-1', 'building-2', 'building-3'],
          floors: Array.from({ length: 26 }, (_, index) => `L${index + 1}`),
          method_variant_codes: ['aluminum_formwork'],
        },
        generationBatchId: 'batch-floor-rhythm-compact',
      } as any,
    })

    expect(generated.scopeCombos).toHaveLength(3)
    expect(generated.rows).toHaveLength(3)
    expect(generated.rows.every((row) => row.values.wbs_node_type === 'item_work')).toBe(true)
    expect(generated.rows.every((row) => row.values.floor_object_id == null)).toBe(true)
    expect(generated.rows.map((row) => row.values.building_object_id)).toEqual([
      'building-1',
      'building-2',
      'building-3',
    ])
    expect(generated.rows.map(durationDaysOf)).toEqual([133, 133, 133])

    for (const row of generated.rows) {
      const metadata = row.values.standard_task_metadata as Record<string, any>
      expect(row.scopeExpansionMode).toBe('building_rhythm_series')
      expect(metadata.scopeExpansionMode).toBe('building_rhythm_series')
      expect(metadata.floorRhythm).toEqual(expect.objectContaining({
        source: 'template_duration_truth_asset',
        adjustmentKind: 'floor_duration_curve_series',
        rhythmPatternCode: 'high_rise_core_and_floor_cycle',
        floorCount: 26,
        totalRhythmDurationDays: 133,
        workfaceInstanceMode: 'floor_cycle_matrix',
      }))
      expect(metadata.floorRhythm.floors).toHaveLength(26)
      expect(metadata.floorRhythm.floorDurationDays.slice(0, 3)).toEqual([7, 5, 5])
      expect(metadata.floorRhythm.floorDurationDays.at(-1)).toBe(6)
    }
  }, 15000)

  it('treats standard floor rhythm rows as itemPack-level duration seed consumers', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'standard',
        scope: {
          buildings: ['building-1'],
          floors: ['L5', 'L6', 'L7', 'L8'],
          method_variant_codes: ['aluminum_formwork'],
        },
        generationBatchId: 'batch-floor-rhythm-duration-seed',
      } as any,
    })

    expect(generated.rows).toHaveLength(1)
    const row = generated.rows[0]
    const metadata = row.values.standard_task_metadata as Record<string, any>
    const durationSuggestion = row.values.duration_suggestion as Record<string, any>

    expect(row.values.wbs_node_type).toBe('item_work')
    expect(durationDaysOf(row)).toBe(23)
    expect(row.values.smart_reference_days).toBeNull()
    expect(row.values.duration_provenance).toBe('standard_work_duration_seed')
    expect(durationSuggestion).toEqual(expect.objectContaining({
      durationOutputCode: 'template_fast_estimate',
      templateFastEstimateDays: 23,
      durationProvenance: 'standard_work_duration_seed',
      durationCalibrationSource: 'standard_work_duration_seed',
      businessReasonCodes: expect.arrayContaining(['STANDARD_FLOOR_RHYTHM_SERIES']),
      businessReasonParams: expect.objectContaining({
        seedStableCode: 'rhythm_itempack:BDT-04-01-01',
        floorRhythmSeries: true,
        floorCount: 4,
      }),
      factorAvailability: expect.objectContaining({
        standard_work_duration_seed: true,
        standard_floor_rhythm_series: true,
      }),
      durationOutputWriteEvaluation: expect.objectContaining({
        allowed: false,
        outputCode: 'template_fast_estimate',
        target: 'plan_task_duration',
      }),
    }))
    expect(metadata.floorRhythm).toEqual(expect.objectContaining({
      source: 'template_duration_truth_asset',
      adjustmentKind: 'floor_duration_curve_series',
      durationSeedStableCode: 'rhythm_itempack:BDT-04-01-01',
      durationSeedScope: 'itempack_floor_rhythm_series',
      floorDurationDays: [7, 5, 5, 6],
    }))
  }, 15000)

  it('infers rhythm rows and duration from project facts without floor cartesian expansion', async () => {
    const makeGenerated = (facts: Record<string, unknown>) => generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          project_type_code: 'residential',
          structure_type_code: 'shear_wall',
          method_variant_codes: ['aluminum_formwork'],
        },
        projectFacts: facts,
      } as any,
    })

    const small = await makeGenerated({ buildingCount: 1, standardFloorCount: 18, totalAreaM2: 60000 })
    const large = await makeGenerated({ buildingCount: 5, standardFloorCount: 33, totalAreaM2: 280000 })

    expect(small.rows).toHaveLength(1)
    expect(large.rows).toHaveLength(5)
    expect(small.scopeCombos).toHaveLength(1)
    expect(large.scopeCombos).toHaveLength(5)
    expect(durationDaysOf(small.rows[0])).toBe(93)
    expect(durationDaysOf(large.rows[0])).toBe(168)
    expect(large.rows.every((row) => row.values.floor_object_id == null)).toBe(true)
    expect(large.rows.every((row) => row.scopeExpansionMode === 'building_rhythm_series')).toBe(true)
    expect((large.rows[0].values.standard_task_metadata as Record<string, any>).floorRhythm).toEqual(expect.objectContaining({
      floorCount: 33,
      source: 'template_duration_truth_asset',
      adjustmentKind: 'floor_duration_curve_series',
    }))
  }, 15000)

  it('uses operation project facts as the single generation fact source for project-scope template generation', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          project_type_code: 'residential',
        },
        projectFacts: {
          totalAreaM2: 139300,
          buildingCount: 24,
          standardFloorCount: 10,
          highestBuildingFloorCount: 13,
          basementLevelCount: 0,
          structureTypeCode: 'frame',
          buildingPatternCodes: ['multi_building_parallel_flow'],
        },
      } as any,
    })

    expect(generated.rows).toHaveLength(1)
    expect(generated.scopeCombos).toHaveLength(1)
    expect(generated.scopeCombos[0]).toEqual(expect.objectContaining({
      building_count: 24,
      standard_floor_count: 10,
      highest_building_floor_count: 13,
      basement_level_count: 0,
      building_pattern_codes: ['multi_building_parallel_flow'],
    }))
    expect(generated.rows[0].scopeExpansionMode).toBe('building_rhythm_series')
    expect(generated.rows[0].values.building_object_id).toBeNull()
    expect(generated.rows[0].values.standard_task_metadata).toEqual(expect.objectContaining({
      projectGenerationFacts: expect.objectContaining({
        totalAreaM2: 139300,
        buildingCount: 24,
        standardFloorCount: 10,
        highestBuildingFloorCount: 13,
        basementLevelCount: 0,
        structureTypeCode: 'frame',
        buildingPatternCodes: ['multi_building_parallel_flow'],
      }),
    }))
    expect(durationDaysOf(generated.rows[0])).toBeGreaterThanOrEqual(45)
    expect(durationDaysOf(generated.rows[0])).toBeLessThanOrEqual(65)
  }, 15000)

  it('uses canonical project fact names during template generation', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          project_type_code: 'residential',
          hasCivilDefense: true,
        },
        projectFacts: {
          buildingCount: 1,
          standardFloorCount: 18,
          totalAreaM2: 60000,
          hasCivilDefense: true,
          prefabRate: 0.8,
        },
      },
    })

    expect(generated.scopeCombos).toHaveLength(1)
    expect(generated.scopeCombos[0]).toEqual(expect.objectContaining({
      hasCivilDefense: true,
      prefab_rate: 0.8,
    }))
    const metadata = generated.rows[0].values.standard_task_metadata as Record<string, any>
    expect(metadata.projectGenerationFacts).toEqual(expect.objectContaining({
      businessType: 'residential',
      buildingCount: 1,
      standardFloorCount: 18,
      totalAreaM2: 60000,
      hasCivilDefense: true,
      prefabRate: 0.8,
    }))
  }, 15000)

  it('preserves special floor usage facts in generated row metadata and scope snapshots', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-07-01-03'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          building_object_id: 'building-1',
          floorUsageCodes: ['transfer', 'refuge'],
        },
        projectFacts: {
          businessType: 'general_civil',
          buildingCount: 1,
          standardFloorCount: 26,
          floorUsageCodes: ['transfer', 'refuge'],
        },
      },
    })

    expect(generated.scopeCombos[0]).toEqual(expect.objectContaining({
      floor_usage_codes: ['transfer', 'refuge'],
    }))
    const metadata = generated.rows[0].values.standard_task_metadata as Record<string, any>
    expect(metadata.projectGenerationFacts).toEqual(expect.objectContaining({
      floorUsageCodes: ['transfer', 'refuge'],
    }))
    expect(generated.rows[0].values.standard_task_metadata).toEqual(expect.objectContaining({
      projectGenerationFacts: expect.objectContaining({
        floorUsageCodes: ['transfer', 'refuge'],
      }),
    }))
  }, 15000)

  it('staggers inferred multi-building rhythm rows without expanding floors', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          project_type_code: 'residential',
          structure_type_code: 'shear_wall',
          method_variant_codes: ['aluminum_formwork'],
        },
        projectFacts: {
          buildingCount: 5,
          standardFloorCount: 33,
          totalAreaM2: 280000,
        },
      } as any,
    })

    expect(generated.rows).toHaveLength(5)
    expect(generated.rows.every((row) => row.scopeExpansionMode === 'building_rhythm_series')).toBe(true)
    expect(generated.rows.every((row) => row.values.floor_object_id == null)).toBe(true)

    const startDates = generated.rows.map((row) => String(row.values.planned_start_date).slice(0, 10))
    expect(new Set(startDates).size).toBeGreaterThan(1)
    expect(startDates).toEqual([...startDates].sort())
  }, 15000)

  it('uses project facts to scale area-based durations and PC rate without changing row count', async () => {
    const runtimeConsumerObservationQueryExec = async <T = Record<string, unknown>>(): Promise<T[]> => [] as T[]
    const makeGenerated = (facts: Record<string, unknown>) => generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      runtimeConsumerObservationQueryExec,
      runtimeArtifactPublications: [],
      operation: {
        type: 'template_generate',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodeIds: ['03-02-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          project_type_code: 'residential',
          structure_type_code: 'shear_wall',
        },
        projectFacts: facts,
      } as any,
    })

    const small = await makeGenerated({ totalAreaM2: 60000, buildingCount: 1, standardFloorCount: 18 })
    const large = await makeGenerated({ totalAreaM2: 280000, buildingCount: 5, standardFloorCount: 33 })
    const prefabLow = await makeGenerated({ totalAreaM2: 140000, buildingCount: 5, standardFloorCount: 22, prefabRate: 0.3 })
    const prefabHigh = await makeGenerated({ totalAreaM2: 140000, buildingCount: 5, standardFloorCount: 22, prefabRate: 0.7 })

    expect(small.rows.length).toBe(large.rows.length)
    expect(Number(large.rows[0].values.smart_reference_days)).toBeGreaterThan(Number(small.rows[0].values.smart_reference_days))
    expect(Number(prefabHigh.rows[0].values.smart_reference_days)).toBeLessThanOrEqual(Number(prefabLow.rows[0].values.smart_reference_days))
    expect((large.rows[0].values.duration_suggestion as Record<string, any>).factorAvailability).toEqual(expect.objectContaining({
      task_scale_proxy: true,
      engineering_object_quantity_proxy: true,
    }))
  }, 15000)

  it('treats high prefab rate as heavier factory and connection-control duration instead of a blanket shortcut', async () => {
    const makeGenerated = (prefabRate: number) => generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        templateId: 'china-prefabricated-assembly',
        selectedNodeIds: ['PFB-00-01-02', 'PFB-02-01-01'],
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          project_type_code: 'residential',
          structure_type_code: 'prefabricated_concrete',
        },
        projectFacts: {
          totalAreaM2: 140000,
          buildingCount: 5,
          standardFloorCount: 22,
          prefabRate,
        },
      } as any,
    })

    const low = await makeGenerated(0.3)
    const high = await makeGenerated(0.7)
    const lowByCode = new Map(low.rows.map((row) => [stableCodeOf(row), row]))
    const highByCode = new Map(high.rows.map((row) => [stableCodeOf(row), row]))

    expect(high.rows).toHaveLength(low.rows.length)
    expect(durationDaysOf(highByCode.get('PFB-00-01-02')!)).toBeGreaterThan(durationDaysOf(lowByCode.get('PFB-00-01-02')!))
    expect(durationDaysOf(highByCode.get('PFB-02-01-01')!)).toBeGreaterThan(durationDaysOf(lowByCode.get('PFB-02-01-01')!))
  }, 30000)

  it('anchors standard-floor rhythm cross-item dependencies at building level without floor cartesian edges', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-floor-rhythm-cross-item-anchor',
        templateIds: ['china-building-fine-detail', 'china-electrical-system'],
        selectedNodesByTemplate: {
          'china-building-fine-detail': ['BDT-04-01-01'],
          'china-electrical-system': ['ELE-03-02-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          buildings: ['building-1', 'building-2'],
          floors: ['L5', 'L6', 'L7'],
          method_variant_codes: ['aluminum_formwork'],
        },
      } as any,
    })

    const rhythmRows = generated.rows.filter((row) => stableCodeOf(row) === 'BDT-04-01-01')
    const chargingRows = generated.rows.filter((row) => stableCodeOf(row) === 'ELE-03-02-01')

    expect(rhythmRows).toHaveLength(2)
    expect(chargingRows).toHaveLength(6)
    expect(rhythmRows.every((row) => row.values.floor_object_id == null)).toBe(true)

    for (const chargingRow of chargingRows) {
      expect(chargingRow.values.floor_object_id).toBeTruthy()
      expect(chargingRow.predecessorDependencies).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          source: 'cross_item_workflow',
          intentCode: 'cross-item:commercial_podium_transfer_to_residential_tower_interface',
        }),
      ]))
      const metadata = chargingRow.values.standard_task_metadata as Record<string, any>
      expect(metadata.crossItemWorkflow ?? []).not.toEqual(expect.arrayContaining([
        expect.objectContaining({
          ruleCode: 'commercial_podium_transfer_to_residential_tower_interface',
        }),
      ]))
    }
  }, 15000)

  it('expands inferred floor sequences from project floor counts without faking floor object ids', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-building-fine-detail',
        selectedNodeIds: ['BDT-04-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          scopeExpansionMode: 'explicit_instances',
          floor_sequence: [
            { label: 'B1', levelNumber: -1, isBasement: true },
            { label: '1F', levelNumber: 1, isBasement: false },
            { label: '2F', levelNumber: 2, isBasement: false },
          ],
          method_variant_codes: ['aluminum_formwork'],
        },
        generationBatchId: 'batch-floor-sequence-inferred',
      } as any,
    })

    const processRows = generated.rows.filter((row) => row.values.wbs_node_type === 'process')
    expect(processRows.length).toBeGreaterThan(0)
    expect(processRows.every((row) => row.values.floor_object_id == null)).toBe(true)
    expect(processRows.some((row) => String(row.values.title).startsWith('1F '))).toBe(true)
    expect(processRows.some((row) => String(row.values.title).startsWith('2F '))).toBe(true)

    const floorSequenceMetadata = processRows
      .map((row) => (row.values.standard_task_metadata as Record<string, any>)?.floorSequence)
      .find((meta) => meta?.objectBinding === 'inferred_sequence_only')

    expect(floorSequenceMetadata).toEqual(expect.objectContaining({
      source: 'inferred_floor_count',
      number: 1,
      total: 3,
      position: 'first',
      label: 'B1',
      objectBinding: 'inferred_sequence_only',
    }))
  }, 15000)

  it('filters residential-only quality responsibility nodes by project type', async () => {
    const baseOperation = {
      type: 'template_generate' as const,
      templateId: 'china-quality-responsibility-acceptance',
      selectedNodeIds: ['QR-01-01-11'],
      plannedStartDate: '2026-06-01',
      scope: {
        building_object_id: 'building-1',
      },
    }
    const commercialGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-qr-commercial',
        scope: {
          ...baseOperation.scope,
          project_type_code: 'civil_office_commercial',
        },
      },
    })
    const residentialGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-qr-residential',
        scope: {
          ...baseOperation.scope,
          project_type_code: 'residential',
        },
      },
    })

    expect(commercialGenerated.rows).toHaveLength(0)
    expect(residentialGenerated.rows.some((row) => String(row.values.title).includes('住宅'))).toBe(true)
    expect(residentialGenerated.rows.every((row) => row.values.project_type_code === 'residential')).toBe(true)
  }, 15000)

  it('filters quality responsibility specialty branches by project type and carries branch metadata', async () => {
    const baseOperation = {
      type: 'template_generate' as const,
      templateId: 'china-quality-responsibility-acceptance',
      selectedNodeIds: ['QR-01-01-18', 'QR-01-01-19', 'QR-01-01-20', 'QR-01-01-21'],
      plannedStartDate: '2026-06-01',
      scope: {
        building_object_id: 'building-1',
      },
    }
    const hospitalGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-qr-hospital-branch',
        scope: {
          ...baseOperation.scope,
          project_type_code: 'hospital',
        },
      },
    })
    const residentialGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-qr-residential-branch',
        scope: {
          ...baseOperation.scope,
          project_type_code: 'residential',
        },
      },
    })

    const hospitalProcessRows = hospitalGenerated.rows.filter((row) => row.values.wbs_node_type === 'process')
    const residentialProcessRows = residentialGenerated.rows.filter((row) => row.values.wbs_node_type === 'process')

    expect(hospitalProcessRows.length).toBeGreaterThan(0)
    expect(hospitalProcessRows.every((row) => stableCodeOf(row).startsWith('QR-01-01-18'))).toBe(true)
    expect(hospitalProcessRows.every((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown>
      return metadata.branchFamily === 'quality_responsibility_medical_cleanroom'
    })).toBe(true)
    expect(residentialProcessRows.length).toBeGreaterThan(0)
    expect(residentialProcessRows.every((row) => stableCodeOf(row).startsWith('QR-01-01-21'))).toBe(true)
    expect(residentialProcessRows.every((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown>
      return metadata.branchFamily === 'quality_responsibility_prefab'
    })).toBe(true)
  }, 15000)

  it('keeps quality responsibility branches selectable by specialty template even when project type does not match', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        templateId: 'china-quality-responsibility-acceptance',
        specialtyCatalogIds: ['china-cleanroom-medical-specialty'],
        selectedNodeIds: ['QR-01-01-18'],
        generationBatchId: 'batch-qr-specialty-branch',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
        },
      },
    })

    const qrProcessRows = generated.rows.filter((row) => (
      row.values.wbs_node_type === 'process'
      && String((row.values.standard_task_metadata as Record<string, unknown>)?.stableCode ?? '').startsWith('QR-01-01-18')
    ))

    expect(qrProcessRows).toHaveLength(6)
    expect(qrProcessRows.every((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown>
      return metadata.branchFamily === 'quality_responsibility_medical_cleanroom'
        && metadata.branchSelectionMode === 'by_project_type_or_specialty_selection'
    })).toBe(true)
  }, 15000)

  it('keeps specialty milestone branches selectable by referenced specialty template even when project type does not match', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'china-project-milestone-handover',
        specialtyCatalogIds: ['china-cleanroom-medical-specialty'],
        selectedNodeIds: ['MS-01-01-27'],
        generationBatchId: 'batch-milestone-specialty-branch',
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
        },
      },
    })

    const milestoneProcessRows = generated.rows.filter((row) => (
      row.values.wbs_node_type === 'process'
      && String((row.values.standard_task_metadata as Record<string, unknown>)?.stableCode ?? '').startsWith('MS-01-01-27')
    ))

    expect(milestoneProcessRows).toHaveLength(5)
    expect(milestoneProcessRows.every((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown>
      return metadata.branchFamily === 'project_milestone'
        && metadata.branchSelectionMode === 'by_project_type_or_specialty_selection'
        && metadata.isAcceptanceMilestone === true
    })).toBe(true)
  }, 15000)

  it('does not use project type as a cartesian expansion dimension', async () => {
    const baseOperation = {
      type: 'template_generate' as const,
      templateId: CHINA_GB55032_TEMPLATE_ID,
      selectedNodeIds: ['02-01-01'],
      plannedStartDate: '2026-06-01',
      scope: {
        building_object_id: 'building-1',
      },
    }
    const baseGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-project-type-base',
      },
    })
    const projectTypeGenerated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        ...baseOperation,
        generationBatchId: 'batch-project-type-feature',
        scope: {
          ...baseOperation.scope,
          project_type_code: 'hospital',
        },
      },
    })

    expect(projectTypeGenerated.rows).toHaveLength(baseGenerated.rows.length)
    expect(projectTypeGenerated.scopeCombos).toHaveLength(baseGenerated.scopeCombos.length)
    expect(projectTypeGenerated.rows.every((row) => row.values.project_type_code === 'hospital')).toBe(true)
    expect(projectTypeGenerated.rows.every((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, any>
      return metadata.projectGenerationFacts?.businessType === 'hospital'
        && row.values.standard_task_metadata != null
    })).toBe(true)
  }, 15000)

  it('returns commercial evidence summary and node evidence fields through the catalog API service', async () => {
    const catalog = await listWbsTemplateCatalog({ includeNodes: true })
    expect(catalog.builtIn.templateName).toEqual(expect.stringContaining('GB55032'))
    expect(catalog.builtIn.evidenceSummary).toEqual(expect.objectContaining({
      domainScope: expect.any(String),
      evidenceStatus: expect.stringMatching(/^(verified|needs_review)$/),
      reviewNeededCount: 0,
      webVerifiedFalseCount: 0,
      divisionCount: 10,
      itemWorkCount: 609,
      genericFallbackProcessCount: 0,
      uniqueActivityStepNameCount: expect.any(Number),
    }))
    expect(catalog.builtIn.evidenceSummary.processCount).toBeGreaterThanOrEqual(4_600)
    expect(catalog.builtIn.evidenceSummary.activityStepCount).toBeGreaterThan(catalog.builtIn.evidenceSummary.processCount)
    expect(catalog.builtIn.evidenceSummary.disciplineProcessCount).toBe(catalog.builtIn.evidenceSummary.processCount)
    expect(catalog.builtIn.evidenceSummary.disciplineActivityStepCount).toBe(catalog.builtIn.evidenceSummary.activityStepCount)
    expect(catalog.builtIn).toEqual(expect.objectContaining({
      packType: 'core_quality',
      templateGroup: 'building_main',
      generationPolicy: 'default_selected',
    }))
    expect(catalog.templates[0]).toEqual(expect.objectContaining({
      id: CHINA_GB55032_TEMPLATE_ID,
      packType: 'core_quality',
      templateGroup: 'building_main',
      generationPolicy: 'default_selected',
      evidenceSummary: catalog.builtIn.evidenceSummary,
    }))
    expect(catalog.builtIn.nodes?.[0]).toEqual(expect.objectContaining({
      stableCode: expect.any(String),
      categoryType: expect.any(String),
      reviewNeeded: false,
      webVerified: true,
      evidenceLevel: 'A',
      verificationStatus: 'verified',
      applicableScope: expect.any(String),
    }))
  })

  it('links special acceptance milestone to energy, fire, civil-defense, and elevator execution chains through dependency intents', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-special-acceptance',
        templateIds: [
          'china-project-milestone-handover',
          'china-quality-responsibility-acceptance',
          'china-waterproof-insulation',
          'china-cecs-fire-system',
          'china-civil-defense-specialty',
          'china-elevator-installation',
        ],
        selectedNodesByTemplate: {
          'china-project-milestone-handover': ['MS-01-01-10'],
          'china-quality-responsibility-acceptance': ['QR-01-01-09', 'QR-01-01-10'],
          'china-waterproof-insulation': ['WPI-02-01-02'],
          'china-cecs-fire-system': ['FIR-05-01-02'],
          'china-civil-defense-specialty': ['CDF-02-01-02'],
          'china-elevator-installation': ['ELV-02-01-02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'civil_office_commercial',
        },
      },
    })

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const acceptanceMilestone = rowByStableCode.get('MS-01-01-10-P01')
    expect(acceptanceMilestone).toBeTruthy()
    const assertTargetDependsOnAcceptanceMilestone = (stableCode: string) => {
      expect(rowByStableCode.get(stableCode)?.predecessorDependencies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          clientRowId: acceptanceMilestone?.clientRowId,
          source: 'dependency_intent_template',
          relationRole: 'inspection',
        }),
      ]))
    }

    for (const stableCode of [
      'QR-01-01-09-P03',
      'QR-01-01-10-P01',
      'QR-01-01-10-P02',
      'WPI-02-01-02-P06',
      'FIR-05-01-02-P06',
      'CDF-02-01-02-P06',
      'ELV-02-01-02-P07',
    ]) {
      assertTargetDependsOnAcceptanceMilestone(stableCode)
    }
    expect((acceptanceMilestone?.values.standard_task_metadata as Record<string, unknown> | undefined)?.dependencyIntentTemplates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromReferencedCode: 'MS-01-01-10-P01',
        toReferencedCode: 'QR-01-01-09-P03',
        matchedReferenceField: 'referencedQualityResponsibilityCodes',
        materializeDirection: 'target_depends_on_source',
      }),
      expect.objectContaining({
        fromReferencedCode: 'MS-01-01-10-P01',
        toReferencedCode: 'WPI-02-01-02-P06',
        matchedReferenceField: 'referencedSpecialtyCodes',
        materializeDirection: 'target_depends_on_source',
      }),
    ]))
    expect(generated.governanceWarnings.filter((warning) => (
      warning.code === 'DEPENDENCY_INTENT_TARGET_NOT_GENERATED'
      && ['WPI-02-01-02-P06', 'FIR-05-01-02-P06', 'CDF-02-01-02-P06', 'ELV-02-01-02-P07'].includes(String(warning.details?.targetCode))
    ))).toEqual([])
  })

  it('warns when special acceptance milestones are generated without their execution targets', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-special-acceptance-target-missing',
        templateIds: ['china-project-milestone-handover'],
        selectedNodesByTemplate: {
          'china-project-milestone-handover': ['MS-01-01-10'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'civil_office_commercial',
        },
      },
    })

    expect(generated.governanceWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'DEPENDENCY_INTENT_TARGET_NOT_GENERATED',
        nodeCode: 'MS-01-01-10-P01',
      }),
    ]))
  })

  it('splits large multi-phase template generation instead of failing the 500 row project total', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-phase-split-large',
        templateIds: ['china-building-site-management'],
        plannedStartDate: '2026-06-01',
        scope: {
          phases: ['phase-1', 'phase-2', 'phase-3', 'phase-4', 'phase-5', 'phase-6'],
          building_object_id: 'building-1',
        },
      },
    })

    expect(generated.rows.length).toBeGreaterThan(500)
    expect(generated.rowLimit).toBe(500)
    expect(generated.rowLimitPolicy).toBe('split_by_phase')
    expect(generated.splitByPhaseApplied).toBe(true)
    expect(generated.generationBatches).toHaveLength(6)
    expect(generated.generationBatches.every((batch) => batch.rowCount <= 500)).toBe(true)
  }, 90_000)

  it('chains dates across scope phase batches within a single template generation operation', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-phase-chain',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          phases: ['phase-1', 'phase-2'],
          building_object_id: 'building-1',
          project_type_code: 'residential',
        },
      },
    })

    const rowsByPhase = new Map<string, typeof generated.rows>()
    for (const row of generated.rows) {
      const phaseId = String(row.values.phase_object_id ?? '')
      rowsByPhase.set(phaseId, [...(rowsByPhase.get(phaseId) ?? []), row])
    }
    const firstPhaseEnd = rowsByPhase.get('phase-1')
      ?.map((row) => String(row.values.planned_end_date))
      .sort()
      .at(-1)
    const secondPhaseStart = rowsByPhase.get('phase-2')
      ?.map((row) => String(row.values.planned_start_date))
      .sort()[0]
    expect(firstPhaseEnd).toBeTruthy()
    expect(secondPhaseStart).toBeTruthy()
    expect(Date.parse(String(secondPhaseStart))).toBeGreaterThan(Date.parse(String(firstPhaseEnd)))
    expect(generated.splitByPhaseApplied).toBe(true)
  }, 30_000)

  it('keeps explicit phase-chain dependency edges when one operation expands multiple phases', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-phase-chain-dependency',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          phases: ['phase-1', 'phase-2'],
          building_object_id: 'building-1',
          project_type_code: 'residential',
        },
      },
    })

    const secondPhaseRows = generated.rows.filter((row) => row.values.phase_object_id === 'phase-2')
    const phaseChainDependencies = secondPhaseRows.flatMap((row) => row.predecessorDependencies)
      .filter((dependency) => dependency.source === 'phase_chain')
    expect(phaseChainDependencies.length).toBeGreaterThan(0)
  }, 30_000)

  it('chains phase template generation dates instead of starting every phase from the same project date', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-chain-p1',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-pit',
            building_object_id: 'building-1',
            project_type_code: 'residential',
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-chain-p2',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            building_object_id: 'building-1',
            project_type_code: 'residential',
          },
        },
      ],
    })

    const rowsByPhaseId = new Map<string, typeof generated.rows>()
    for (const row of generated.rows) {
      const phaseId = String(row.values.phase_object_id ?? '')
      rowsByPhaseId.set(phaseId, [...(rowsByPhaseId.get(phaseId) ?? []), row])
    }
    const pitStart = rowsByPhaseId.get('phase-pit')?.map((row) => String(row.values.planned_start_date)).sort()[0]
    const pitEnd = rowsByPhaseId.get('phase-pit')?.map((row) => String(row.values.planned_end_date)).sort().at(-1)
    const foundationStart = rowsByPhaseId.get('phase-foundation')?.map((row) => String(row.values.planned_start_date)).sort()[0]
    expect(pitStart).toBeTruthy()
    expect(pitEnd).toBeTruthy()
    expect(foundationStart).toBeTruthy()
    expect(Date.parse(String(foundationStart))).toBeGreaterThan(Date.parse(String(pitStart)))
    expect(Date.parse(String(foundationStart))).toBeLessThanOrEqual(Date.parse(String(pitEnd)))
    expect(generated.splitByPhaseApplied).toBe(true)
    expect(generated.generationBatches.length).toBeGreaterThanOrEqual(2)
  }, 30_000)

  it('honors explicit phase release policies instead of forcing strict finish-start chaining', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'full',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-release-p1',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-pit',
            physical_zone_object_id: 'zone-1',
            project_type_code: 'residential',
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-release-p2',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          phaseReleasePolicy: {
            mode: 'overlap_after_days',
            afterDays: 21,
          },
          scope: {
            phase_object_id: 'phase-foundation',
            physical_zone_object_id: 'zone-1',
            project_type_code: 'residential',
          },
        },
      ],
    })

    const rowsByPhaseId = new Map<string, typeof generated.rows>()
    for (const row of generated.rows) {
      const phaseId = String(row.values.phase_object_id ?? '')
      rowsByPhaseId.set(phaseId, [...(rowsByPhaseId.get(phaseId) ?? []), row])
    }
    const firstStart = rowsByPhaseId.get('phase-pit')?.map((row) => String(row.values.planned_start_date)).sort()[0]
    const firstEnd = rowsByPhaseId.get('phase-pit')?.map((row) => String(row.values.planned_end_date)).sort().at(-1)
    const secondStart = rowsByPhaseId.get('phase-foundation')?.map((row) => String(row.values.planned_start_date)).sort()[0]
    expect(firstStart).toBeTruthy()
    expect(firstEnd).toBeTruthy()
    expect(secondStart).toBeTruthy()
    expect(secondStart).toBe('2026-06-22')
    expect(Date.parse(String(secondStart))).toBeLessThan(Date.parse(String(firstEnd)))

    const secondPhaseDependencies = rowsByPhaseId.get('phase-foundation')?.flatMap((row) => row.predecessorDependencies) ?? []
    const phaseChain = secondPhaseDependencies.find((dependency) => dependency.source === 'phase_chain')
    expect(phaseChain).toEqual(expect.objectContaining({
      dependencyType: 'SS',
      lagDays: 21,
      intentCode: 'phase-chain:phase-pit->phase-foundation',
    }))
    expect((generated as any).phaseWindows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phaseId: 'phase-pit',
        durationOutputCode: 'phase_window',
        durationOutputSemanticFieldName: 'phaseWindowDays',
        phaseWindowDays: expect.any(Number),
        durationOutputContract: expect.objectContaining({
          code: 'phase_window',
          semanticFieldName: 'phaseWindowDays',
        }),
      }),
      expect.objectContaining({
        phaseId: 'phase-foundation',
        durationOutputCode: 'phase_window',
        durationOutputSemanticFieldName: 'phaseWindowDays',
        phaseWindowDays: expect.any(Number),
        durationOutputContract: expect.objectContaining({
          code: 'phase_window',
          semanticFieldName: 'phaseWindowDays',
        }),
      }),
    ]))
  }, 30_000)

  it('honors explicit start-finish dependency type in phase release policies', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-release-sf-p1',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-pit-sf',
            physical_zone_object_id: 'zone-sf',
            project_type_code: 'residential',
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-release-sf-p2',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          phaseReleasePolicy: {
            mode: 'overlap_after_days',
            afterDays: 7,
            dependencyType: 'SF',
            lagDays: -2,
          },
          scope: {
            phase_object_id: 'phase-finish-sf',
            physical_zone_object_id: 'zone-sf',
            project_type_code: 'residential',
          },
        },
      ],
    })

    const secondPhaseRows = generated.rows.filter((row) => row.values.phase_object_id === 'phase-finish-sf')
    const phaseChain = secondPhaseRows
      .flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')
    expect(phaseChain).toEqual(expect.objectContaining({
      dependencyType: 'SF',
      lagDays: -2,
      intentCode: 'phase-chain:phase-pit-sf->phase-finish-sf',
    }))
  }, 30_000)

  it('anchors start-start phase release to the predecessor phase start instead of its latest tail row', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-ss-anchor-p1',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['03-01', '03-02', '03-04', '03-05', '03-09', '04-01', '04-03', '04-05'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-finishing-core',
            project_type_code: 'residential',
            totalAreaM2: 120000,
            buildingCount: 3,
            standardFloorCount: 26,
            highestBuildingFloorCount: 26,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-ss-anchor-p2',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['07-05'],
          },
          plannedStartDate: '2026-06-01',
          phaseReleasePolicy: {
            mode: 'overlap_after_days',
            afterDays: 14,
          },
          scope: {
            phase_object_id: 'phase-mep-lighting',
            project_type_code: 'residential',
            totalAreaM2: 120000,
            buildingCount: 3,
            standardFloorCount: 26,
            highestBuildingFloorCount: 26,
          },
        },
      ],
    })

    const secondRows = generated.rows.filter((row) => row.values.phase_object_id === 'phase-mep-lighting')
    const secondStart = secondRows.map((row) => String(row.values.planned_start_date).slice(0, 10)).sort()[0]
    expect(secondStart).toBe('2026-06-15')

    const phaseChain = secondRows.flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')
    expect(phaseChain).toEqual(expect.objectContaining({
      dependencyType: 'SS',
      lagDays: 14,
      intentCode: 'phase-chain:phase-finishing-core->phase-mep-lighting',
    }))
  }, 30_000)

  it('does not reduce before-finish phase overlap for small residential projects', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-small-overlap-p1',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-basement',
            project_type_code: 'residential',
            totalAreaM2: 60000,
            buildingCount: 1,
            standardFloorCount: 18,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-small-overlap-p2',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          phaseReleasePolicy: {
            mode: 'overlap_before_finish_days',
            beforeFinishDays: 30,
          },
          scope: {
            phase_object_id: 'phase-finishing',
            project_type_code: 'residential',
            totalAreaM2: 60000,
            buildingCount: 1,
            standardFloorCount: 18,
          },
        },
      ],
    })

    const secondPhaseRows = generated.rows.filter((row) => row.values.phase_object_id === 'phase-finishing')
    const phaseChain = secondPhaseRows.flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')

    expect(phaseChain).toEqual(expect.objectContaining({
      dependencyType: 'FF',
    }))
    expect(Math.abs(Number(phaseChain?.lagDays ?? 0))).toBeGreaterThanOrEqual(30)
  }, 30_000)

  it('keeps inferred residential finish and commissioning phases as before-finish overlaps', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-residential-inferred-basement',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-basement',
            project_type_code: 'residential',
            business_type: 'general_civil',
            business_subtype: 'civil_residential',
            totalAreaM2: 98100,
            buildingCount: 3,
            standardFloorCount: 26,
            highestBuildingFloorCount: 33,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-residential-inferred-finishing',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['03-02-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-finishing',
            project_type_code: 'residential',
            business_type: 'general_civil',
            business_subtype: 'civil_residential',
            totalAreaM2: 98100,
            buildingCount: 3,
            standardFloorCount: 26,
            highestBuildingFloorCount: 33,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-residential-inferred-commission',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['10-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-commission',
            project_type_code: 'residential',
            business_type: 'general_civil',
            business_subtype: 'civil_residential',
            totalAreaM2: 98100,
            buildingCount: 3,
            standardFloorCount: 26,
            highestBuildingFloorCount: 33,
          },
        },
      ],
    })

    const phaseChainByPhase = (phaseId: string) => generated.rows
      .filter((row) => row.values.phase_object_id === phaseId)
      .flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')

    expect(phaseChainByPhase('phase-finishing')).toEqual(expect.objectContaining({
      dependencyType: 'FF',
    }))
    expect(phaseChainByPhase('phase-commission')).toEqual(expect.objectContaining({
      dependencyType: 'FF',
    }))
  }, 30_000)

  it('does not move before-finish phase releases before the project start date', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-release-clamp-foundation',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            project_type_code: 'residential',
            structure_type_code: 'steel_assembly',
            method_variant_codes: ['steel_assembly'],
            building_pattern_codes: ['steel_structure_bay_zone_flow', 'multi_building_parallel_flow'],
            totalAreaM2: 31700,
            buildingCount: 4,
            standardFloorCount: 12,
            highestBuildingFloorCount: 16,
            basementLevelCount: 0,
            prefabRate: 0.85,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-release-clamp-basement',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-07'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-basement',
            project_type_code: 'residential',
            structure_type_code: 'steel_assembly',
            method_variant_codes: ['steel_assembly'],
            building_pattern_codes: ['steel_structure_bay_zone_flow', 'multi_building_parallel_flow'],
            totalAreaM2: 31700,
            buildingCount: 4,
            standardFloorCount: 12,
            highestBuildingFloorCount: 16,
            basementLevelCount: 0,
            prefabRate: 0.85,
          },
        },
      ],
    })

    const starts = generated.rows
      .map((row) => String(row.values.planned_start_date ?? '').slice(0, 10))
      .filter(Boolean)
      .sort()
    expect(starts[0]).toBe('2026-06-01')
  }, 30_000)

  it('compresses low-rise multi-building residential phase release instead of treating it as a high-rise tower', async () => {
    const makeGenerated = (facts: Record<string, unknown>) => generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-archetype-foundation',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            project_type_code: 'residential',
            ...facts,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-archetype-superstructure',
          templateIds: ['china-building-fine-detail'],
          selectedNodesByTemplate: {
            'china-building-fine-detail': ['BDT-04-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-superstructure',
            project_type_code: 'residential',
            ...facts,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-archetype-finishing',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['03-02-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-finishing',
            project_type_code: 'residential',
            ...facts,
          },
        },
      ],
    })

    const highRise = await makeGenerated({
      totalAreaM2: 98100,
      buildingCount: 3,
      standardFloorCount: 26,
      highestBuildingFloorCount: 33,
      basementLevelCount: 2,
      structureTypeCode: 'shear_wall',
    })
    const lowRise = await makeGenerated({
      totalAreaM2: 139300,
      buildingCount: 24,
      standardFloorCount: 10,
      highestBuildingFloorCount: 13,
      basementLevelCount: 0,
      structureTypeCode: 'frame',
    })

    const highRiseDays = projectDurationDays(highRise.rows)
    const lowRiseDays = projectDurationDays(lowRise.rows)
    expect(lowRiseDays).toBeLessThan(Math.round(highRiseDays * 0.7))

    const lowRiseDependencies = lowRise.rows.flatMap((row) => row.predecessorDependencies)
      .filter((dependency) => dependency.source === 'phase_chain')
    expect(lowRiseDependencies.some((dependency) => dependency.dependencyType === 'SS')).toBe(true)
  }, 30_000)

  it('keeps low-rise workface compression when residential projects also use prefab concrete', async () => {
    const makeGenerated = (facts: Record<string, unknown>) => generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-composite-foundation',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            project_type_code: 'residential',
            structure_type_code: 'prefabricated_concrete',
            prefabRate: 0.5,
            ...facts,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-composite-superstructure',
          templateIds: ['china-building-fine-detail'],
          selectedNodesByTemplate: {
            'china-building-fine-detail': ['BDT-04-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-superstructure',
            project_type_code: 'residential',
            structure_type_code: 'prefabricated_concrete',
            prefabRate: 0.5,
            ...facts,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-composite-finishing',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['03-02-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-finishing',
            project_type_code: 'residential',
            structure_type_code: 'prefabricated_concrete',
            prefabRate: 0.5,
            ...facts,
          },
        },
      ],
    })

    const highRisePrefab = await makeGenerated({
      totalAreaM2: 140000,
      buildingCount: 5,
      standardFloorCount: 22,
      highestBuildingFloorCount: 22,
      basementLevelCount: 2,
    })
    const lowRisePrefab = await makeGenerated({
      totalAreaM2: 139300,
      buildingCount: 24,
      standardFloorCount: 10,
      highestBuildingFloorCount: 13,
      basementLevelCount: 0,
    })

    expect(projectDurationDays(lowRisePrefab.rows)).toBeLessThan(Math.round(projectDurationDays(highRisePrefab.rows) * 0.75))
    const superstructureRows = lowRisePrefab.rows.filter((row) => row.values.phase_object_id === 'phase-superstructure')
    expect(superstructureRows).toHaveLength(1)
    expect(superstructureRows[0].scopeExpansionMode).toBe('building_rhythm_series')
    expect(superstructureRows[0].values.building_object_id).toBeNull()
  }, 30_000)

  it('runs prefab factory supply phases as parallel lanes instead of serially extending onsite schedule', async () => {
    const makeGenerated = (includeFactory: boolean) => generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        ...(includeFactory
          ? [{
              type: 'template_generate',
              generationBatchId: 'batch-prefab-factory',
              templateIds: ['china-prefabricated-assembly'],
              selectedNodesByTemplate: {
                'china-prefabricated-assembly': ['PFB-00-01-01', 'PFB-00-01-02', 'PFB-00-01-03'],
              },
              plannedStartDate: '2026-06-01',
              scope: {
                phase_object_id: 'phase-prefab-factory',
                project_type_code: 'residential',
                structure_type_code: 'prefabricated_concrete',
                totalAreaM2: 140000,
                buildingCount: 5,
                standardFloorCount: 22,
                prefabRate: 0.3,
              },
            }]
          : []),
        {
          type: 'template_generate',
          generationBatchId: 'batch-prefab-foundation',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            project_type_code: 'residential',
            structure_type_code: 'prefabricated_concrete',
            totalAreaM2: 140000,
            buildingCount: 5,
            standardFloorCount: 22,
            prefabRate: 0.3,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-prefab-site',
          templateIds: ['china-prefabricated-assembly'],
          selectedNodesByTemplate: {
            'china-prefabricated-assembly': ['PFB-01-01-01', 'PFB-01-01-03', 'PFB-02-01-01', 'PFB-03-01-02'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-prefab-site',
            project_type_code: 'residential',
            structure_type_code: 'prefabricated_concrete',
            totalAreaM2: 140000,
            buildingCount: 5,
            standardFloorCount: 22,
            prefabRate: 0.3,
          },
        },
      ] as any,
    })

    const onsiteOnly = await makeGenerated(false)
    const withFactory = await makeGenerated(true)
    expect(projectDurationDays(withFactory.rows)).toBeLessThanOrEqual(projectDurationDays(onsiteOnly.rows) + 14)

    const siteRows = withFactory.rows.filter((row) => row.values.phase_object_id === 'phase-prefab-site')
    const factoryDependency = siteRows.flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain' && dependency.intentCode === 'phase-chain:phase-prefab-factory->phase-foundation')
    expect(factoryDependency).toBeUndefined()
  }, 30_000)

  it('keeps low-rise parallel release when building patterns also identify prefab construction', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-pattern-composite-foundation',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            project_type_code: 'residential',
            structure_type_code: 'prefabricated_concrete',
            building_pattern_codes: ['prefabricated_concrete_floor_cycle', 'multi_building_parallel_flow'],
            totalAreaM2: 139300,
            buildingCount: 24,
            standardFloorCount: 10,
            highestBuildingFloorCount: 13,
            basementLevelCount: 0,
            prefabRate: 0.5,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-pattern-composite-superstructure',
          templateIds: ['china-building-fine-detail'],
          selectedNodesByTemplate: {
            'china-building-fine-detail': ['BDT-04-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-superstructure',
            project_type_code: 'residential',
            structure_type_code: 'prefabricated_concrete',
            building_pattern_codes: ['prefabricated_concrete_floor_cycle', 'multi_building_parallel_flow'],
            totalAreaM2: 139300,
            buildingCount: 24,
            standardFloorCount: 10,
            highestBuildingFloorCount: 13,
            basementLevelCount: 0,
            prefabRate: 0.5,
          },
        },
      ],
    })

    const superstructureRows = generated.rows.filter((row) => row.values.phase_object_id === 'phase-superstructure')
    const phaseChain = superstructureRows.flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')
    expect(phaseChain).toEqual(expect.objectContaining({
      dependencyType: 'SS',
      lagDays: expect.any(Number),
    }))
    expect(Number(phaseChain?.lagDays ?? 0)).toBeGreaterThanOrEqual(14)
    expect(Number(phaseChain?.lagDays ?? 99)).toBeLessThanOrEqual(35)
  }, 30_000)

  it('does not add multi-building finish-start lag for low-rise steel assembly fast-track projects', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-steel-lowrise-foundation',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            project_type_code: 'residential',
            structure_type_code: 'steel_assembly',
            method_variant_codes: ['steel_assembly'],
            building_pattern_codes: ['steel_structure_bay_zone_flow', 'multi_building_parallel_flow'],
            totalAreaM2: 31700,
            buildingCount: 4,
            standardFloorCount: 12,
            highestBuildingFloorCount: 16,
            basementLevelCount: 0,
            prefabRate: 0.85,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-steel-lowrise-superstructure',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-superstructure',
            project_type_code: 'residential',
            structure_type_code: 'steel_assembly',
            method_variant_codes: ['steel_assembly'],
            building_pattern_codes: ['steel_structure_bay_zone_flow', 'multi_building_parallel_flow'],
            totalAreaM2: 31700,
            buildingCount: 4,
            standardFloorCount: 12,
            highestBuildingFloorCount: 16,
            basementLevelCount: 0,
            prefabRate: 0.85,
          },
        },
      ],
    })

    const superstructureRows = generated.rows.filter((row) => row.values.phase_object_id === 'phase-superstructure')
    const phaseChain = superstructureRows.flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')
    expect(phaseChain).toEqual(expect.objectContaining({
      dependencyType: 'SS',
    }))
    expect(Number(phaseChain?.lagDays ?? 0)).toBeLessThanOrEqual(21)
  }, 30_000)

  it('compresses downstream MEP and commissioning release for steel assembly fast-track projects only', async () => {
    const makeGenerated = (scope: Record<string, unknown>) => generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-steel-downstream-structure',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-superstructure',
            project_type_code: 'residential',
            ...scope,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-steel-downstream-mep',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['07-05'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-mep-core',
            project_type_code: 'residential',
            ...scope,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-steel-downstream-commission',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['10-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-commission',
            project_type_code: 'residential',
            ...scope,
          },
        },
      ],
    })

    const highRiseCastInPlace = await makeGenerated({
      structure_type_code: 'shear_wall',
      method_variant_codes: ['cast_in_place'],
      building_pattern_codes: ['high_rise_core_and_floor_cycle'],
      totalAreaM2: 98100,
      buildingCount: 3,
      standardFloorCount: 26,
      highestBuildingFloorCount: 33,
      basementLevelCount: 2,
    })
    const steelAssembly = await makeGenerated({
      structure_type_code: 'steel_assembly',
      method_variant_codes: ['steel_assembly'],
      building_pattern_codes: ['steel_structure_bay_zone_flow', 'multi_building_parallel_flow'],
      totalAreaM2: 31700,
      buildingCount: 4,
      standardFloorCount: 12,
      highestBuildingFloorCount: 16,
      basementLevelCount: 0,
      prefabRate: 0.85,
    })

    const phaseChainOf = (rows: typeof steelAssembly.rows, phaseId: string) => rows
      .filter((row) => row.values.phase_object_id === phaseId)
      .flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')

    expect(phaseChainOf(steelAssembly.rows, 'phase-mep-core')).toEqual(expect.objectContaining({
      dependencyType: 'SS',
      lagDays: expect.any(Number),
    }))
    expect(Number(phaseChainOf(steelAssembly.rows, 'phase-mep-core')?.lagDays ?? 99)).toBeLessThanOrEqual(21)
    expect(Number(phaseChainOf(steelAssembly.rows, 'phase-commission')?.lagDays ?? 99)).toBeLessThanOrEqual(21)
    expect(projectDurationDays(steelAssembly.rows)).toBeLessThan(Math.round(projectDurationDays(highRiseCastInPlace.rows) * 0.65))
  }, 30_000)

  it('applies business scenario schedule profiles to phase-chain release policies', async () => {
    const makeGenerated = (scope: Record<string, unknown>, phaseId = 'phase-mep-core') => generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      diagnosticDurationSuggestionMode: 'fast_template',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: `batch-scenario-profile-foundation-${phaseId}`,
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            ...scope,
          },
        },
        {
          type: 'template_generate',
          generationBatchId: `batch-scenario-profile-current-${phaseId}`,
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['07-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: phaseId,
            ...scope,
          },
        },
      ],
    })

    const hospital = await makeGenerated({
      business_type: 'hospital',
      project_type_code: 'hospital',
      totalAreaM2: 90000,
      buildingCount: 3,
      standardFloorCount: 26,
    })
    const dataCenter = await makeGenerated({
      business_type: 'data_center',
      project_type_code: 'data_center',
      totalAreaM2: 70000,
      buildingCount: 3,
      standardFloorCount: 26,
    })
    const mic = await makeGenerated({
      business_type: 'modular_building',
      project_type_code: 'modular_construction',
      method_variant_codes: ['modular_mic'],
      totalAreaM2: 60000,
      buildingCount: 4,
      standardFloorCount: 16,
      prefabRate: 0.85,
    }, 'phase-module-site')
    const deepFoundation = await makeGenerated({
      business_type: 'general_civil',
      business_subtype: 'civil_residential',
      project_type_code: 'residential',
      foundationDepthM: 12,
      totalAreaM2: 90000,
      buildingCount: 3,
      standardFloorCount: 26,
    }, 'phase-basement')

    const phaseChainOf = (rows: typeof hospital.rows, phaseId: string) => rows
      .filter((row) => row.values.phase_object_id === phaseId)
      .flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')

    expect(phaseChainOf(hospital.rows, 'phase-mep-core')).toEqual(expect.objectContaining({
      dependencyType: 'SS',
      lagDays: 45,
    }))
    expect(phaseChainOf(dataCenter.rows, 'phase-mep-core')).toEqual(expect.objectContaining({
      dependencyType: 'SS',
      lagDays: 21,
    }))
    expect(phaseChainOf(mic.rows, 'phase-module-site')).toBeUndefined()
    expect(mic.rows
      .filter((row) => row.values.phase_object_id === 'phase-module-site')
      .map((row) => row.values.planned_start_date)
      .sort()[0]).toBe('2026-06-01')
    expect(phaseChainOf(deepFoundation.rows, 'phase-basement')).toEqual(expect.objectContaining({
      dependencyType: 'SS',
      lagDays: 45,
    }))
  }, 30_000)

  it('applies high-prefab steel and MiC wet-work replacement to cast-in-place duration', async () => {
    const makeGenerated = (methodVariantCodes: string[], templateIds: string[] = [CHINA_GB55032_TEMPLATE_ID]) => generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        templateIds,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          project_type_code: 'residential',
          structure_type_code: methodVariantCodes.includes('steel_assembly') ? 'steel_assembly' : 'shear_wall',
          method_variant_codes: methodVariantCodes,
        },
        projectFacts: {
          totalAreaM2: 31700,
          buildingCount: 4,
          standardFloorCount: 12,
          prefabRate: methodVariantCodes.includes('cast_in_place') ? 0 : 0.85,
        },
      } as any,
    })

    const castInPlace = await makeGenerated(['cast_in_place'])
    const steelAssembly = await makeGenerated(['steel_assembly', 'prefab'])
    const micAssembly = await makeGenerated(['mic', 'modular_construction', 'prefab'])

    expect(durationDaysOf(steelAssembly.rows[0])).toBeLessThanOrEqual(Math.round(durationDaysOf(castInPlace.rows[0]) * 0.58))
    expect(durationDaysOf(micAssembly.rows[0])).toBeLessThanOrEqual(Math.round(durationDaysOf(castInPlace.rows[0]) * 0.45))
  }, 15_000)

  it('accepts phase release policy maps for phase operation batches', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      phaseReleasePolicies: {
        'phase-foundation': {
          mode: 'overlap_after_days',
          afterDays: 10,
        },
      },
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-release-map-p1',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-pit',
            physical_zone_object_id: 'zone-1',
            project_type_code: 'residential',
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-release-map-p2',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            physical_zone_object_id: 'zone-1',
            project_type_code: 'residential',
          },
        },
      ],
    })

    const secondPhaseRows = generated.rows.filter((row) => row.values.phase_object_id === 'phase-foundation')
    const secondStart = secondPhaseRows.map((row) => String(row.values.planned_start_date)).sort()[0]
    const phaseChain = secondPhaseRows.flatMap((row) => row.predecessorDependencies)
      .find((dependency) => dependency.source === 'phase_chain')
    expect(secondStart).toBe('2026-06-11')
    expect(phaseChain).toEqual(expect.objectContaining({
      dependencyType: 'SS',
      lagDays: 10,
    }))
  }, 30_000)

  it('rebuilds the cross-phase dependency network after chaining phase operations', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-network-p1',
          templateIds: ['china-modular-mic-specialty'],
          selectedNodesByTemplate: {
            'china-modular-mic-specialty': ['MIC-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'factory',
            physical_zone_object_id: 'zone-1',
            project_type_code: 'modular_construction',
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-network-p2',
          templateIds: ['china-modular-mic-specialty'],
          selectedNodesByTemplate: {
            'china-modular-mic-specialty': ['MIC-03'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'site',
            physical_zone_object_id: 'zone-1',
            project_type_code: 'modular_construction',
          },
        },
      ],
    })

    const siteRows = generated.rows.filter((row) => row.values.phase_object_id === 'site')
    const networkDependencies = siteRows.flatMap((row) => row.predecessorDependencies)
      .filter((dependency) => dependency.source === 'cross_item_workflow')
    expect(networkDependencies.some((dependency) => dependency.intentCode === 'cross-item:mic_factory_integration_to_transport_receiving')).toBe(true)
  }, 30_000)

  it('can disable phase chaining for independent phase operation previews', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      chainMode: 'none',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-chain-none-p1',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-pit',
            building_object_id: 'building-1',
            project_type_code: 'residential',
          },
        },
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-chain-none-p2',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-02-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            phase_object_id: 'phase-foundation',
            building_object_id: 'building-1',
            project_type_code: 'residential',
          },
        },
      ],
    })

    const phaseStarts = new Set(generated.rows.map((row) => String(row.values.planned_start_date)))
    expect(phaseStarts.has('2026-06-01')).toBe(true)
    const phaseChainDependencies = generated.rows.flatMap((row) => row.predecessorDependencies)
      .filter((dependency) => dependency.source === 'phase_chain')
    expect(phaseChainDependencies).toHaveLength(0)
  }, 30_000)

  it('warns when a phase-chain operation cannot find required scope assignment targets', async () => {
    const generated = await generateWbsTemplatePhaseChainRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'overview',
      chainMode: 'none',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-phase-chain-missing-scope-target',
          templateIds: ['china-gb55032-2022-outdoor'],
          selectedNodesByTemplate: {
            'china-gb55032-2022-outdoor': ['OUT-02-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scopeAssignmentRules: getScopeAssignmentRules('general_civil'),
          scope: {
            project_type_code: 'residential',
            scope_objects: [
              {
                id: 'building-1',
                type: 'building',
                name: '1#楼',
                metadata: { functionalUsage: 'residential_tower' },
              },
            ],
          },
        },
      ],
    })

    expect(generated.governanceWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
        details: expect.objectContaining({
          targetObjectType: 'physical_zone',
          missingObjectLabel: expect.any(String),
        }),
      }),
    ]))
  }, 30_000)


  it('creates deeper system commissioning gates for mechanical and safety packages', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-system-commissioning-gates',
        templateIds: [
          'china-plumbing-heating-system',
          'china-hvac-system',
          'china-electrical-system',
          'china-cecs-fire-system',
          'china-intelligent-building-system',
        ],
        selectedNodesByTemplate: {
          'china-plumbing-heating-system': ['PLU-01-01-01', 'PLU-06-01-01'],
          'china-hvac-system': ['HVA-01-01-01', 'HVA-02-01-01', 'HVA-02-01-02'],
          'china-electrical-system': ['ELE-01-01-01', 'ELE-05-01-01'],
          'china-cecs-fire-system': ['FIR-01-01-01', 'FIR-03-01-01', 'FIR-03-02-01', 'FIR-05-01-01', 'FIR-05-01-02'],
          'china-intelligent-building-system': ['INT-01-01-01', 'INT-04-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const rowByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )

    const hvacCommissioning = rowByStableCode.get('HVA-02-01-02')
    const fireCommissioning = rowByStableCode.get('FIR-03-02-01')
    const fireHandover = rowByStableCode.get('FIR-05-01-02')
    const intelligentCore = rowByStableCode.get('INT-04-01-01')
    const electricalHandover = rowByStableCode.get('ELE-05-01-01')

    expect(hvacCommissioning?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mechanical_services_to_system_commissioning',
      }),
    ]))
    expect(electricalHandover?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mechanical_services_to_system_commissioning',
      }),
    ]))
    expect(intelligentCore?.predecessorDependencies ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:mechanical_services_to_system_commissioning',
      }),
    ]))
    expect(fireCommissioning?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:fire_intelligent_to_safety_system_commissioning',
      }),
    ]))
    expect(fireHandover?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:fire_intelligent_to_safety_system_commissioning',
      }),
    ]))
    expect(intelligentCore?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cross_item_workflow',
        intentCode: 'cross-item:fire_intelligent_to_safety_system_commissioning',
      }),
    ]))
  }, 15000)

  it('uses template-authored system package windows as the single duration truth for commissioning children', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-system-package-window-truth',
        templateId: 'china-hvac-system',
        selectedNodeIds: ['HVA-02-01-02'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })

    const rowsByStableCode = new Map(
      generated.rows.map((row) => [
        String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? ''),
        row,
      ]),
    )
    const parent = rowsByStableCode.get('HVA-02-01-02')
    const firstChild = rowsByStableCode.get('HVA-02-01-02-P01')
    const balancingChild = rowsByStableCode.get('HVA-02-01-02-P02')
    const closeoutChild = rowsByStableCode.get('HVA-02-01-02-P06')

    expect(parent).toBeTruthy()
    expect(firstChild).toBeTruthy()
    expect(balancingChild).toBeTruthy()
    expect(closeoutChild).toBeTruthy()

    expect(durationDaysOf(parent!)).toBe(8)
    expect(parent?.values.duration_suggestion).toEqual(expect.objectContaining({
      templateFastEstimateDays: 8,
      parentDurationBoundaryPolicy: 'system_package_window',
      planDurationTruthSource: 'parent_package_rhythm_window',
    }))
    expect(parent?.values.standard_task_metadata).toEqual(expect.objectContaining({
      durationBoundaryPolicy: 'system_package_window',
      planDurationTruthSource: 'parent_package_rhythm_window',
    }))
    expect((parent?.values.standard_task_metadata as Record<string, any>)?.planRollup).toEqual(expect.objectContaining({
      source: 'child_plan_window',
      appliedToPlanWindow: false,
      protectedByDurationBoundaryPolicy: 'system_package_window',
      plannedDurationDays: 7,
      referenceDurationDays: 7,
    }))

    expect(durationDaysOf(firstChild!)).toBe(1)
    expect(firstChild?.values.duration_suggestion).toEqual(expect.objectContaining({
      packageChildPlanDurationDays: 1,
      durationBoundaryRole: 'package_child_window',
      parentDurationBoundaryPolicy: 'system_package_window',
      planDurationTruthSource: 'parent_package_rhythm_window',
      packageChildRhythmWindowStartDay: 1,
      packageChildRhythmWindowEndDay: 1,
      packageChildRhythmWindowRole: 'system_commissioning_preparation',
    }))
    expect(firstChild?.values.standard_task_metadata).toEqual(expect.objectContaining({
      scheduleAuthorityPolicy: 'package_child_rhythm_window',
    }))

    expect(durationDaysOf(balancingChild!)).toBe(3)
    expect(balancingChild?.values.duration_suggestion).toEqual(expect.objectContaining({
      packageChildPlanDurationDays: 3,
      packageChildRhythmWindowStartDay: 2,
      packageChildRhythmWindowEndDay: 4,
      packageChildRhythmWindowRole: 'system_balancing',
    }))

    expect(durationDaysOf(closeoutChild!)).toBe(1)
    expect(closeoutChild?.values.duration_suggestion).toEqual(expect.objectContaining({
      packageChildPlanDurationDays: 1,
      packageChildRhythmWindowStartDay: 8,
      packageChildRhythmWindowEndDay: 8,
      packageChildRhythmWindowRole: 'system_handover_closeout',
    }))

    const childRows = generated.rows.filter((row) => (
      String((row.values.standard_task_metadata as Record<string, unknown> | undefined)?.stableCode ?? '').startsWith('HVA-02-01-02-P')
    ))
    expect(childRows.every((row) => row.predecessorDependencies.every((dependency) => dependency.source !== 'sibling_sequence'))).toBe(true)
    const childStartDates = childRows.map((row) => String(row.values.planned_start_date).slice(0, 10)).sort()
    const childEndDates = childRows.map((row) => String(row.values.planned_end_date).slice(0, 10)).sort()
    expect(durationDaysBetween(childStartDates[0], childEndDates.at(-1)!)).toBe(8)
  }, 15000)

  it('keeps the catalog summary lightweight and lazy-loads a single template tree', async () => {
    const catalog = await listWbsTemplateCatalog({ includeNodes: false })
    expect(catalog.builtIn.nodes).toBeUndefined()
    expect(catalog.templates[0]).toEqual(expect.objectContaining({
      id: CHINA_GB55032_TEMPLATE_ID,
      nodeCount: expect.any(Number),
      evidenceSummary: catalog.builtIn.evidenceSummary,
    }))
    expect(catalog.templates[0].nodes).toBeUndefined()

    const coreTemplate = await getWbsTemplateCatalogItem(CHINA_GB55032_TEMPLATE_ID)
    expect(coreTemplate.nodes?.[0]).toEqual(expect.objectContaining({
      name: '地基与基础',
      stableCode: '01',
      categoryType: 'division',
    }))
    expect(coreTemplate.evidenceSummary).toEqual(catalog.builtIn.evidenceSummary)
  }, 30_000)

  it('rejects removed legacy template ids as unavailable catalogs', async () => {
    await expect(generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        templateId: 'removed-legacy-template',
        selectedNodeIds: ['01-01-01'],
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
        },
      },
    })).rejects.toMatchObject({
      code: 'WBS_TEMPLATE_CATALOG_NOT_FOUND',
    })
  })

  it('allows explicit whole-project scope mode for one-click generation', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-scope-mode',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-03'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
        },
      },
    })

    expect(generated.rows.length).toBeGreaterThan(0)
    expect(generated.scopeCombos).toHaveLength(1)
  }, 15000)

  it('applies wizard scope assignment rules to generated rows using materialized scope objects', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-rules',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            {
              id: 'phase-1',
              type: 'phase',
              name: 'Phase 1',
              parentId: null,
              metadata: {},
            },
            {
              id: 'section-1',
              type: 'section',
              name: 'Section 1',
              parentId: 'phase-1',
              metadata: {},
            },
            {
              id: 'building-ward',
              type: 'building',
              name: 'Ward Building',
              parentId: 'section-1',
              metadata: { functionalUsage: 'ward' },
            },
            {
              id: 'building-medical-tech',
              type: 'building',
              name: 'Medical Technology Building',
              parentId: 'section-1',
              metadata: { functionalUsage: 'medical_technology' },
            },
            {
              id: 'functional-area-or',
              type: 'functional_area',
              name: 'Operating Room Center',
              parentId: 'building-medical-tech',
              metadata: { functionalCategory: 'operating_room' },
            },
          ],
        },
      },
      scopeAssignmentRules: [
        {
          itemPackPattern: '02-01-01',
          effect: 'assign_to_matching_buildings',
          matchFunctionalUsage: 'medical_technology',
          priority: 1,
        },
        {
          itemPackPattern: '02-01-01',
          effect: 'assign_to_functional_area',
          functionalAreaCategory: 'operating_room',
          priority: 2,
        },
      ],
    })

    expect(generated.rows.length).toBeGreaterThan(0)
    expect(generated.rows.every((row) => row.values.building_object_id === 'building-medical-tech')).toBe(true)
    expect(generated.rows.every((row) => row.values.functional_area_object_id === 'functional-area-or')).toBe(true)
    expect(generated.rows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(generated.rows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)
    expect(generated.rows.every((row) => row.values.building_object_id !== 'building-ward')).toBe(true)
  }, 15000)

  it('expands matching-building assignments across every matching building instead of collapsing to the first one', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-multi-medical-tech',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-medical-tech-1', type: 'building', name: '1#医技楼', parentId: 'section-1', metadata: { functionalUsage: 'medical_technology' } },
            { id: 'building-medical-tech-2', type: 'building', name: '2#医技楼', parentId: 'section-1', metadata: { functionalUsage: 'medical_technology' } },
            { id: 'building-ward', type: 'building', name: '住院楼', parentId: 'section-1', metadata: { functionalUsage: 'ward' } },
          ],
        },
      },
      scopeAssignmentRules: [
        {
          itemPackPattern: '02-01-01',
          effect: 'assign_to_matching_buildings',
          matchFunctionalUsage: 'medical_technology',
          priority: 1,
        },
      ],
    })

    const buildingIds = new Set(generated.rows.map((row) => row.values.building_object_id))
    expect(buildingIds).toEqual(new Set(['building-medical-tech-1', 'building-medical-tech-2']))
    expect(generated.rows.some((row) => row.values.building_object_id === 'building-ward')).toBe(false)
  }, 15000)

  it('expands assign-to-all-building rules across every materialized building', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-all-buildings',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-1', type: 'building', name: '1#楼', parentId: 'section-1', metadata: { functionalUsage: 'ward' } },
            { id: 'building-2', type: 'building', name: '2#楼', parentId: 'section-1', metadata: { functionalUsage: 'medical_technology' } },
            { id: 'building-3', type: 'building', name: '3#楼', parentId: 'section-1', metadata: { functionalUsage: 'office' } },
          ],
        },
      },
      scopeAssignmentRules: [
        {
          itemPackPattern: '02-01-01',
          effect: 'assign_to_all_buildings',
          priority: 1,
        },
      ],
    })

    expect(new Set(generated.rows.map((row) => row.values.building_object_id)))
      .toEqual(new Set(['building-1', 'building-2', 'building-3']))
    expect(generated.rows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(generated.rows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)
  }, 15000)

  it('does not hard-block optional matching-building rules when the project has no matching usage fact', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-optional-building-usage',
        templateIds: ['china-jgj-tianjin-decoration'],
        selectedNodesByTemplate: {
          'china-jgj-tianjin-decoration': ['DEC-05-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          project_type_code: 'general_civil',
          functional_usage_codes: ['住宅楼'],
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-1', type: 'building', name: '1#楼', parentId: 'section-1', metadata: { functionalUsage: '住宅楼' } },
          ],
        },
      },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'DEC-05',
          effect: 'assign_to_matching_buildings',
          matchFunctionalUsage: '商业',
          priority: 1,
        },
      ],
      diagnosticDurationSuggestionMode: 'fast_template',
    })

    expect(generated.rows.some((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? row.values.standard_work_code ?? '').startsWith('DEC-05')
    })).toBe(false)
    expect(generated.governanceWarnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
        details: expect.objectContaining({
          itemPackPattern: 'DEC-05',
          missingObjectLabel: '楼栋',
        }),
      }),
    ]))
  }, 30000)

  it('expands standard template rows across materialized building scope objects', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-standard-building-scope-expansion',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          phase_object_id: 'phase-1',
          section_object_id: 'section-1',
          building_object_id: 'building-1',
          buildings: ['building-1', 'building-2'],
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-1', type: 'building', name: '1#楼', parentId: 'section-1', metadata: { functionalUsage: 'residential_tower' } },
            { id: 'building-2', type: 'building', name: '2#楼', parentId: 'section-1', metadata: { functionalUsage: 'residential_tower' } },
          ],
        },
      },
    })

    const buildingIds = new Set(generated.rows.map((row) => row.values.building_object_id))
    expect(generated.scopeCombos.map((scope) => scope.building_object_id)).toEqual(['building-1', 'building-2'])
    expect(buildingIds).toEqual(new Set(['building-1', 'building-2']))
    expect(generated.rows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(generated.rows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)
  }, 15000)

  it('expands standard template rows across shared podium physical scope objects', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-standard-shared-podium-scope-expansion',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          phase_object_id: 'phase-1',
          section_object_id: 'section-1',
          building_object_id: 'tower-1',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'tower-1', type: 'building', name: '1#塔楼', parentId: 'section-1', metadata: { functionalUsage: 'residential_tower' } },
            { id: 'tower-zone-1', type: 'physical_zone', name: '塔楼区', parentId: 'tower-1', metadata: { structuralRole: 'tower', childrenComplete: true } },
            {
              id: 'shared-podium-1',
              type: 'physical_zone',
              name: '共享裙房',
              parentId: 'section-1',
              metadata: {
                physicalSpaceKind: 'shared_podium',
                physicalCategory: 'shared_podium',
                structuralRole: 'podium',
                sharedScopeCandidate: true,
                serviceTargetObjectIds: ['tower-1'],
                serviceTargetNames: ['1#塔楼'],
                childrenComplete: true,
              },
            },
          ],
        },
      },
    })

    expect(generated.rows.length).toBeGreaterThan(0)
    expect(generated.scopeCombos.map((scope) => scope.physical_zone_object_id)).toEqual(['shared-podium-1'])
    expect(generated.rows.every((row) => row.values.physical_zone_object_id === 'shared-podium-1')).toBe(true)
    expect(generated.rows.some((row) => row.values.physical_zone_object_id === 'tower-zone-1')).toBe(false)
    expect(generated.rows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(generated.rows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)
  }, 15000)

  it('uses explicit materialized scope combos without crossing buildings and floors', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-materialized-scope-combos',
        primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          phases: ['phase-1'],
          sections: ['section-1', 'section-2'],
          buildings: ['building-1', 'building-2'],
          floors: ['building-1-l1', 'building-2-l1'],
          scope_combos: [
            {
              phase_object_id: 'phase-1',
              section_object_id: 'section-1',
              building_object_id: 'building-1',
              floor_object_id: 'building-1-l1',
            },
            {
              phase_object_id: 'phase-1',
              section_object_id: 'section-2',
              building_object_id: 'building-2',
              floor_object_id: 'building-2-l1',
            },
          ],
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '1期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '1标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-1', type: 'building', name: '1#楼', parentId: 'section-1', metadata: { functionalUsage: 'residential_tower' } },
            { id: 'building-1-l1', type: 'floor', name: '1#楼-L1', parentId: 'building-1', metadata: { floorOrder: 1 } },
            { id: 'section-2', type: 'section', name: '2标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-2', type: 'building', name: '2#楼', parentId: 'section-2', metadata: { functionalUsage: 'residential_tower' } },
            { id: 'building-2-l1', type: 'floor', name: '2#楼-L1', parentId: 'building-2', metadata: { floorOrder: 1 } },
          ],
        },
      },
    })

    const scopePairs = new Set(generated.scopeCombos.map((scope) => [
      scope.building_object_id,
      scope.floor_object_id,
      scope.section_object_id,
    ].join('|')))
    expect(scopePairs).toEqual(new Set([
      'building-1|building-1-l1|section-1',
      'building-2|building-2-l1|section-2',
    ]))
    expect(scopePairs.has('building-1|building-2-l1|section-1')).toBe(false)
    expect(scopePairs.has('building-2|building-1-l1|section-2')).toBe(false)
  }, 15000)

  it('anchors specialty packs to materialized basement, outdoor and special-floor scope objects', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-specialty-objects',
        templateIds: [
          'china-waterproof-insulation',
          'china-gb55032-2022-outdoor',
          'china-ultra-high-rise-specialty',
        ],
        selectedNodesByTemplate: {
          'china-waterproof-insulation': ['WPI-01-01-01'],
          'china-gb55032-2022-outdoor': ['OUT-02-01-01'],
          'china-ultra-high-rise-specialty': ['UHR-03-01-02'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-tower', type: 'building', name: '1#塔楼', parentId: 'section-1', metadata: { functionalUsage: 'residential_tower' } },
            { id: 'floor-refuge-13', type: 'floor', name: 'L13', parentId: 'building-tower', metadata: { floorOrder: 13, floorUsage: 'refuge' } },
            { id: 'basement-1', type: 'basement', name: '1号地下室', parentId: 'section-1', metadata: { basementLevelCount: 3 } },
            { id: 'outdoor-site', type: 'physical_zone', name: '室外总平', parentId: 'section-1', metadata: { physicalSpaceKind: 'outdoor_site', physicalCategory: 'outdoor_site_plan' } },
          ],
        },
      },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'WPI-01-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'basement',
          priority: 1,
        },
        {
          itemPackPattern: 'OUT-02-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: { physicalSpaceKind: 'outdoor_site' },
          priority: 1,
        },
        {
          itemPackPattern: 'UHR-03-01-02',
          effect: 'assign_to_scope_object',
          targetObjectType: 'floor',
          matchMetadata: { floorUsage: 'refuge' },
          priority: 1,
        },
      ],
    })

    const rowsForStableCode = (stableCode: string) => generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith(stableCode)
    })

    const basementRows = rowsForStableCode('WPI-01-01-01')
    const outdoorRows = rowsForStableCode('OUT-02-01-01')
    const refugeRows = rowsForStableCode('UHR-03-01-02')

    expect(basementRows.length).toBeGreaterThan(0)
    expect(outdoorRows.length).toBeGreaterThan(0)
    expect(refugeRows.length).toBeGreaterThan(0)

    expect(basementRows.every((row) => row.values.basement_object_id === 'basement-1')).toBe(true)
    expect(basementRows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(basementRows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)

    expect(outdoorRows.every((row) => row.values.physical_zone_object_id === 'outdoor-site')).toBe(true)
    expect(outdoorRows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(outdoorRows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)

    expect(refugeRows.every((row) => row.values.floor_object_id === 'floor-refuge-13')).toBe(true)
    expect(refugeRows.every((row) => row.values.building_object_id === 'building-tower')).toBe(true)
    expect(refugeRows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(refugeRows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)
  }, 30000)

  it('anchors utility packs to matching independent engineering zones', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-independent-zones',
        templateIds: [
          'china-electrical-system',
          'china-plumbing-heating-system',
        ],
        selectedNodesByTemplate: {
          'china-electrical-system': ['ELE-05-01-01'],
          'china-plumbing-heating-system': ['PLU-02-01-02'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            {
              id: 'switching-station-1',
              type: 'physical_zone',
              name: '开闭所',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'switching_station' },
            },
            {
              id: 'fire-pump-room-1',
              type: 'physical_zone',
              name: '消防水池泵房',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'fire_pump_room' },
            },
          ],
        },
      },
      scopeAssignmentRules: getScopeAssignmentRules('general_civil'),
    })

    const rowsForStableCode = (stableCode: string) => generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith(stableCode)
    })
    const switchingRows = rowsForStableCode('ELE-05-01-01')
    const pumpRows = rowsForStableCode('PLU-02-01-02')

    expect(switchingRows.length).toBeGreaterThan(0)
    expect(pumpRows.length).toBeGreaterThan(0)
    expect(switchingRows.every((row) => row.values.physical_zone_object_id === 'switching-station-1')).toBe(true)
    expect(pumpRows.every((row) => row.values.physical_zone_object_id === 'fire-pump-room-1')).toBe(true)
    expect(generated.rows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(generated.rows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)
  }, 30000)

  it('anchors specialty independent-zone packs to matching physical zones', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-specialty-independent-zones',
        templateIds: [
          'china-cleanroom-medical-specialty',
          'china-data-center-specialty',
          'china-tod-upper-cover-specialty',
        ],
        selectedNodesByTemplate: {
          'china-cleanroom-medical-specialty': ['CLN-04-01-06', 'CLN-04-01-33'],
          'china-data-center-specialty': ['DTC-02-01-02', 'DTC-04-01-16'],
          'china-tod-upper-cover-specialty': ['TOD-01-01-02', 'TOD-04-01-13'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            {
              id: 'oxygen-station-1',
              type: 'physical_zone',
              name: '液氧站',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'liquid_oxygen_station' },
            },
            {
              id: 'sewage-station-1',
              type: 'physical_zone',
              name: '污水处理站',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'sewage_treatment_station' },
            },
            {
              id: 'generator-yard-1',
              type: 'physical_zone',
              name: '柴发区',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'generator_yard' },
            },
            {
              id: 'cooling-plant-1',
              type: 'physical_zone',
              name: '冷站',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'cooling_plant' },
            },
            {
              id: 'railway-operation-zone-1',
              type: 'physical_zone',
              name: '轨行区',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'railway_operation_zone' },
            },
            {
              id: 'transfer-passage-1',
              type: 'physical_zone',
              name: '换乘通道',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'transfer_passage' },
            },
          ],
        },
      },
      scopeAssignmentRules: getScopeAssignmentRules('hospital'),
    })

    const rowsForStableCode = (stableCode: string) => generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith(stableCode)
    })

    expect(rowsForStableCode('CLN-04-01-06').length).toBeGreaterThan(0)
    expect(rowsForStableCode('CLN-04-01-33').length).toBeGreaterThan(0)
    expect(rowsForStableCode('DTC-02-01-02').length).toBeGreaterThan(0)
    expect(rowsForStableCode('DTC-04-01-16').length).toBeGreaterThan(0)
    expect(rowsForStableCode('TOD-01-01-02').length).toBeGreaterThan(0)
    expect(rowsForStableCode('TOD-04-01-13').length).toBeGreaterThan(0)
    expect(rowsForStableCode('CLN-04-01-06').every((row) => row.values.physical_zone_object_id === 'oxygen-station-1')).toBe(true)
    expect(rowsForStableCode('CLN-04-01-33').every((row) => row.values.physical_zone_object_id === 'sewage-station-1')).toBe(true)
    expect(rowsForStableCode('DTC-02-01-02').every((row) => row.values.physical_zone_object_id === 'generator-yard-1')).toBe(true)
    expect(rowsForStableCode('DTC-04-01-16').every((row) => row.values.physical_zone_object_id === 'cooling-plant-1')).toBe(true)
    expect(rowsForStableCode('TOD-01-01-02').every((row) => row.values.physical_zone_object_id === 'railway-operation-zone-1')).toBe(true)
    expect(rowsForStableCode('TOD-04-01-13').every((row) => row.values.physical_zone_object_id === 'transfer-passage-1')).toBe(true)
  }, 30000)

  it('clones shared specialty packs when different supported spaces use the same template pack', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-shared-specialty-pack-zones',
        templateIds: ['china-electrical-system'],
        selectedNodesByTemplate: {
          'china-electrical-system': ['ELE-05-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            {
              id: 'switching-station-1',
              type: 'physical_zone',
              name: '开闭所',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'switching_station' },
            },
            {
              id: 'substation-1',
              type: 'physical_zone',
              name: '变电站',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'substation' },
            },
          ],
        },
      },
      scopeAssignmentRules: getScopeAssignmentRules('data_center'),
    })

    const electricalRows = generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith('ELE-05-01-01')
    })
    const rowsByZone = new Map<string, number>()
    for (const row of electricalRows) {
      const zoneId = String(row.values.physical_zone_object_id ?? '')
      rowsByZone.set(zoneId, (rowsByZone.get(zoneId) ?? 0) + 1)
    }

    expect(electricalRows.length).toBeGreaterThan(0)
    expect(rowsByZone.get('switching-station-1')).toBeGreaterThan(0)
    expect(rowsByZone.get('substation-1')).toBeGreaterThan(0)
    expect([...rowsByZone.keys()].filter(Boolean).sort()).toEqual(['substation-1', 'switching-station-1'])
  }, 30000)

  it('does not block optional independent engineering zones once the triggered pack has a declared target', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-optional-independent-zones',
        templateIds: ['china-electrical-system'],
        selectedNodesByTemplate: {
          'china-electrical-system': ['ELE-05-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            {
              id: 'switching-station-1',
              type: 'physical_zone',
              name: '开闭所',
              parentId: 'section-1',
              metadata: { physicalSpaceKind: 'independent_engineering_zone', physicalCategory: 'switching_station' },
            },
          ],
        },
      },
      scopeAssignmentRules: getScopeAssignmentRules('general_civil'),
      diagnosticDurationSuggestionMode: 'fast_template',
    })

    const electricalRows = generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith('ELE-05-01-01')
    })

    expect(electricalRows.length).toBeGreaterThan(0)
    expect(electricalRows.every((row) => row.values.physical_zone_object_id === 'switching-station-1')).toBe(true)
    expect(generated.governanceWarnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
        details: expect.objectContaining({
          itemPackPattern: 'ELE-05-01-01',
          missingObjectLabel: '变配电所',
        }),
      }),
    ]))
  }, 30000)

  it('assigns materialized basement and outdoor specialty rows without leaking building-floor anchors', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-materialized-specialty-clean-lineage',
        templateIds: [
          'china-waterproof-insulation',
          'china-gb55032-2022-outdoor',
        ],
        selectedNodesByTemplate: {
          'china-waterproof-insulation': ['WPI-01-01-01'],
          'china-gb55032-2022-outdoor': ['OUT-02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_combos: [
            {
              phase_object_id: 'phase-1',
              section_object_id: 'section-1',
              building_object_id: 'building-1',
              floor_object_id: 'building-1-l1',
            },
          ],
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-1', type: 'building', name: '1#楼', parentId: 'section-1', metadata: { functionalUsage: 'residential_tower' } },
            { id: 'building-1-l1', type: 'floor', name: 'L1', parentId: 'building-1', metadata: { floorOrder: 1 } },
            { id: 'basement-1', type: 'basement', name: '地下室', parentId: 'section-1', metadata: { basementLevelCount: 2 } },
            { id: 'outdoor-site', type: 'physical_zone', name: '室外总平', parentId: 'section-1', metadata: { physicalSpaceKind: 'outdoor_site', physicalCategory: 'outdoor_site_plan' } },
          ],
        },
      },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'WPI-01-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'basement',
          priority: 1,
        },
        {
          itemPackPattern: 'OUT-02-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: { physicalSpaceKind: 'outdoor_site' },
          priority: 1,
        },
      ],
    })

    const rowsForStableCode = (stableCode: string) => generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith(stableCode)
    })
    const basementRows = rowsForStableCode('WPI-01-01-01')
    const outdoorRows = rowsForStableCode('OUT-02-01-01')

    expect(basementRows.length).toBeGreaterThan(0)
    expect(outdoorRows.length).toBeGreaterThan(0)

    expect(basementRows.every((row) => row.values.basement_object_id === 'basement-1')).toBe(true)
    expect(basementRows.every((row) => !row.values.building_object_id && !row.values.floor_object_id && !row.values.physical_zone_object_id)).toBe(true)
    expect(basementRows.every((row) => row.values.section_object_id === 'section-1' && row.values.phase_object_id === 'phase-1')).toBe(true)

    expect(outdoorRows.every((row) => row.values.physical_zone_object_id === 'outdoor-site')).toBe(true)
    expect(outdoorRows.every((row) => !row.values.building_object_id && !row.values.floor_object_id && !row.values.basement_object_id)).toBe(true)
    expect(outdoorRows.every((row) => row.values.section_object_id === 'section-1' && row.values.phase_object_id === 'phase-1')).toBe(true)
  }, 30000)

  it('keeps shared-basement scope facts on the shared-basement tower-lane strategy instead of low-rise heuristics', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-shared-basement-fact-strategy',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-03-01', '02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          buildingCount: 6,
          standardFloorCount: 8,
          highestBuildingFloorCount: 8,
          basementLevelCount: 1,
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: 'Phase 1', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: 'Section 1', parentId: 'phase-1', metadata: {} },
            { id: 'building-1', type: 'building', name: '1#', parentId: 'section-1', metadata: {} },
            { id: 'building-2', type: 'building', name: '2#', parentId: 'section-1', metadata: {} },
            { id: 'building-3', type: 'building', name: '3#', parentId: 'section-1', metadata: {} },
            { id: 'building-4', type: 'building', name: '4#', parentId: 'section-1', metadata: {} },
            { id: 'building-5', type: 'building', name: '5#', parentId: 'section-1', metadata: {} },
            { id: 'building-6', type: 'building', name: '6#', parentId: 'section-1', metadata: {} },
            {
              id: 'basement-common',
              type: 'basement',
              name: 'Shared basement',
              parentId: 'section-1',
              metadata: {
                basementKind: 'common_basement',
                serviceTargetObjectIds: ['building-1', 'building-2', 'building-3', 'building-4', 'building-5', 'building-6'],
              },
            },
          ],
        },
      },
      diagnosticDurationSuggestionMode: 'fast_template',
    })

    const organizedRows = generated.rows.filter((row) => row.values.project_organization_policy_id)
    expect(organizedRows.length).toBeGreaterThan(0)
    expect(new Set(organizedRows.map((row) => row.values.project_organization_strategy))).toEqual(new Set([
      'shared_basement_podium_then_multi_tower_lane_network',
    ]))
    expect(new Set(organizedRows.map((row) => row.values.organization_lane).filter(Boolean))).toEqual(new Set([
      'shared_works',
      'tower_lane_1',
      'tower_lane_2',
      'tower_lane_3',
      'tower_lane_4',
      'tower_lane_5',
      'tower_lane_6',
    ]))
    expect(new Set(organizedRows.map((row) => row.values.organization_lane).filter(Boolean))).not.toContain('lowrise_lane_1')

    const organization = (organizedRows[0].values.standard_task_metadata as Record<string, any>).projectOrganization
    expect(organization.inputBasis.scopeOrganizationFacts).toEqual(expect.objectContaining({
      organizationSignals: expect.arrayContaining([
        'shared_basement_service_range',
        'shared_basement_serves_multiple_buildings',
      ]),
      sharedBasementServiceTargetCount: 6,
      sharedBasementServiceTargetKindCounts: expect.objectContaining({ building: 6 }),
    }))
  }, 30000)

  it('does not backfill direct scope anchors into explicit scope combos from legacy wizard payloads', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-legacy-direct-scope-anchor-isolation',
        templateIds: ['china-electrical-system'],
        selectedNodesByTemplate: {
          'china-electrical-system': ['ELE-05-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          building_object_id: 'building-1',
          floor_object_id: 'building-1-l1',
          physical_zone_object_id: 'outdoor-site',
          scope_combos: [
            {
              phase_object_id: 'phase-1',
              section_object_id: 'section-1',
              building_object_id: 'building-1',
              floor_object_id: 'building-1-l1',
            },
          ],
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-1', type: 'building', name: '1#楼', parentId: 'section-1', metadata: { functionalUsage: 'residential_tower' } },
            { id: 'building-1-l1', type: 'floor', name: 'L1', parentId: 'building-1', metadata: { floorOrder: 1 } },
            { id: 'outdoor-site', type: 'physical_zone', name: '室外总平', parentId: 'section-1', metadata: { physicalSpaceKind: 'outdoor_site' } },
          ],
        },
      },
    })

    expect(generated.scopeCombos).toEqual([
      expect.objectContaining({
        phase_object_id: 'phase-1',
        section_object_id: 'section-1',
        building_object_id: 'building-1',
        floor_object_id: 'building-1-l1',
        physical_zone_object_id: null,
      }),
    ])

    const electricalRows = generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith('ELE-05-01-01')
    })
    expect(electricalRows.length).toBeGreaterThan(0)
    expect(electricalRows.every((row) => row.values.building_object_id === 'building-1')).toBe(true)
    expect(electricalRows.every((row) => row.values.floor_object_id === 'building-1-l1')).toBe(true)
    expect(electricalRows.every((row) => !row.values.physical_zone_object_id)).toBe(true)
  }, 30000)

  it('expands matching specialty rows across multiple materialized basement scope objects', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-multi-basement',
        templateIds: ['china-waterproof-insulation'],
        selectedNodesByTemplate: {
          'china-waterproof-insulation': ['WPI-01-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'basement-1', type: 'basement', name: '1号地下室', parentId: 'section-1', metadata: { basementLevelCount: 3 } },
            { id: 'basement-2', type: 'basement', name: '2号地下室', parentId: 'section-1', metadata: { basementLevelCount: 5 } },
          ],
        },
      },
      scopeAssignmentRules: [
        {
          itemPackPattern: 'WPI-01-01-01',
          effect: 'assign_to_scope_object',
          targetObjectType: 'basement',
          priority: 1,
        },
      ],
    })

    const basementRows = generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith('WPI-01-01-01')
    })
    const basementIds = new Set(basementRows.map((row) => row.values.basement_object_id))

    expect(basementRows.length).toBeGreaterThan(0)
    expect(basementIds).toEqual(new Set(['basement-1', 'basement-2']))
    expect(basementRows.every((row) => row.values.section_object_id === 'section-1')).toBe(true)
    expect(basementRows.every((row) => row.values.phase_object_id === 'phase-1')).toBe(true)
  }, 30000)

  it('emits a blocking error when a selected template cannot find the required physical scope object', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-missing-outdoor',
        templateIds: ['china-gb55032-2022-outdoor'],
        selectedNodesByTemplate: {
          'china-gb55032-2022-outdoor': ['OUT-02-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'section-1', type: 'section', name: '一标段', parentId: 'phase-1', metadata: {} },
            { id: 'building-1', type: 'building', name: '1#楼', parentId: 'section-1', metadata: { functionalUsage: 'residential_tower' } },
          ],
        },
      },
      scopeAssignmentRules: getScopeAssignmentRules('general_civil'),
    })

    const outdoorRows = generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith('OUT-02-01-01')
    })

    expect(outdoorRows.length).toBeGreaterThan(0)
    expect(outdoorRows.every((row) => !row.values.physical_zone_object_id)).toBe(true)
    expect(generated.governanceWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
        severity: 'error',
        nodeCode: 'OUT-02-01-01',
        details: expect.objectContaining({
          targetObjectType: 'physical_zone',
          missingObjectLabel: '室外总平',
        }),
      }),
    ]))
  }, 30000)

  it('emits a blocking error when a selected basement specialty template cannot find a basement scope object', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-scope-assignment-missing-basement',
        templateIds: ['china-waterproof-insulation'],
        selectedNodesByTemplate: {
          'china-waterproof-insulation': ['WPI-01-01-01'],
        },
        plannedStartDate: '2026-06-01',
        detailLevel: 'overview',
        scope: {
          scopeExpansionMode: 'project',
          scope_objects: [
            { id: 'phase-1', type: 'phase', name: '一期', parentId: null, metadata: {} },
            { id: 'building-1', type: 'building', name: '1#楼', parentId: 'phase-1', metadata: { functionalUsage: 'residential_tower' } },
          ],
        },
      },
      scopeAssignmentRules: getScopeAssignmentRules('general_civil'),
    })

    const basementRows = generated.rows.filter((row) => {
      const metadata = row.values.standard_task_metadata as Record<string, unknown> | undefined
      return String(metadata?.stableCode ?? '').startsWith('WPI-01-01-01')
    })

    expect(basementRows.length).toBeGreaterThan(0)
    expect(basementRows.every((row) => !row.values.basement_object_id)).toBe(true)
    expect(generated.governanceWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'SCOPE_ASSIGNMENT_TARGET_NOT_FOUND',
        severity: 'error',
        nodeCode: 'WPI-01-01-01',
        details: expect.objectContaining({
          targetObjectType: 'basement',
          missingObjectLabel: '地下室',
        }),
      }),
    ]))
  }, 30000)

  it('blocks template generation on the monthly plan surface', async () => {
    await expect(generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'monthly_plan',
      operation: {
        type: 'template_generate',
        templateId: CHINA_GB55032_TEMPLATE_ID,
        scope: {},
      },
    })).rejects.toMatchObject({
      code: 'TEMPLATE_GENERATE_NOT_ALLOWED_ON_MONTHLY_PLAN',
    })
  })
})
