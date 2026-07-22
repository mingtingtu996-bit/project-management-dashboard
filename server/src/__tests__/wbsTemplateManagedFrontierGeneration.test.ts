import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbServiceMocks = vi.hoisted(() => {
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn'

  const emptyResult = { data: [], error: null, count: 0 }
  const singleResult = { data: null, error: null }
  const tables: Record<string, any[]> = {
    algorithm_seed_versions: [],
    algorithm_seed_records: [],
  }

  const createQuery = (table?: string) => {
    const query: Record<string, any> = {}
    const filters: Array<{ op: 'eq' | 'neq'; column: string; value: unknown }> = []
    const chain = () => query
    for (const method of [
      'select',
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
    query.eq = vi.fn((column: string, value: unknown) => {
      filters.push({ op: 'eq', column, value })
      return query
    })
    query.neq = vi.fn((column: string, value: unknown) => {
      filters.push({ op: 'neq', column, value })
      return query
    })
    const resolveRows = () => {
      const rows = table && tables[table] ? tables[table] : []
      return rows.filter((row) => filters.every((filter) => (
        filter.op === 'neq'
          ? row[filter.column] !== filter.value
          : row[filter.column] === filter.value
      )))
    }
    const resolveResult = async () => {
      const data = resolveRows()
      return table && tables[table] ? { data, error: null, count: data.length } : emptyResult
    }
    query.single = vi.fn(async () => {
      const rows = resolveRows()
      return table && tables[table] ? { data: rows[0] ?? null, error: null } : singleResult
    })
    query.maybeSingle = vi.fn(async () => {
      const rows = resolveRows()
      return table && tables[table] ? { data: rows[0] ?? null, error: null } : singleResult
    })
    query.abortSignal = vi.fn(resolveResult)
    query.then = (resolve: (value: typeof emptyResult) => unknown, reject?: (reason: unknown) => unknown) => (
      resolveResult().then(resolve, reject)
    )
    query.catch = (reject: (reason: unknown) => unknown) => resolveResult().catch(reject)
    query.finally = (onFinally: () => void) => resolveResult().finally(onFinally)
    return query
  }

  class SupabaseService {
    async query() { return [] }
    async create() { return {} }
    async update() { return {} }
    async delete() { return null }
  }

  return {
    tables,
    supabase: {
      from: vi.fn((table: string) => createQuery(table)),
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

const constructionCalendarMocks = vi.hoisted(() => ({
  resolveConstructionCalendarContext: vi.fn(async () => ({ basis: 'calendar_day', windows: [] })),
}))

vi.mock('../services/constructionCalendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/constructionCalendar.js')>()
  return {
    ...actual,
    resolveConstructionCalendarContext: constructionCalendarMocks.resolveConstructionCalendarContext,
  }
})

import {
  CHINA_GB55032_TEMPLATE_ID,
  generateWbsTemplateRows,
  WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
} from '../services/wbsTemplateGenerationService.js'
import { isExecutableDurationAssetSemanticallyCompatible } from '../services/defaultMasterPlanExecutableAssemblyService.js'
import { buildTemplateRecommendation } from '../services/projectFactsToTemplateService.js'
import { buildWizardTemplateSelection } from '../services/wizardTemplateSelectionService.js'
import {
  resolveWbsGenerationDepthPolicy,
} from '../seeds/wbsGenerationDepthPolicySeed.js'
import {
  listProjectConstructionOrganizationPolicies,
  resolveProjectConstructionOrganizationPolicy,
} from '../seeds/projectConstructionOrganizationPolicySeed.js'
import * as algorithmSeedResolver from '../services/algorithmSeedResolver.js'

function durationDaysOf(row: { values: Record<string, unknown> }) {
  const start = new Date(`${String(row.values.planned_start_date).slice(0, 10)}T00:00:00Z`)
  const end = new Date(`${String(row.values.planned_end_date).slice(0, 10)}T00:00:00Z`)
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
}

function rowMetadata(row: { values: Record<string, unknown> }) {
  return (row.values.standard_task_metadata ?? {}) as Record<string, unknown>
}

function rowDurationSuggestion(row: { values: Record<string, unknown> }) {
  return (row.values.duration_suggestion ?? {}) as Record<string, unknown>
}

function dateMs(value: unknown) {
  return Date.parse(`${String(value).slice(0, 10)}T00:00:00Z`)
}

function isoDate(value: unknown) {
  const text = String(value ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function addDaysIso(dateText: string, days: number) {
  const date = new Date(`${dateText}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function rowCode(row: { clientRowId?: string; values: Record<string, unknown> }) {
  return String(row.values.standard_work_code ?? row.values.template_node_id ?? row.clientRowId ?? '')
}

function collectProfileDependencyDateViolations(
  scheduleRows: Array<{ clientRowId?: string; values: Record<string, unknown>; predecessorDependencies?: Array<Record<string, unknown>> }>,
  profileRows: Array<{ clientRowId?: string; values: Record<string, unknown>; predecessorDependencies?: Array<Record<string, unknown>> }>,
) {
  const rowByClientId = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
  const violations: string[] = []

  for (const row of profileRows) {
    const rowStart = isoDate(row.values.planned_start_date)
    const rowEnd = isoDate(row.values.planned_end_date)
    for (const dependency of row.predecessorDependencies ?? []) {
      if (dependency.intentCode === 'business_type_profile_phase_anchor') continue
      const predecessor = rowByClientId.get(String(dependency.clientRowId ?? ''))
      if (!predecessor) {
        violations.push(`${rowCode(row)} missing predecessor ${String(dependency.clientRowId ?? '')}`)
        continue
      }
      const predecessorStart = isoDate(predecessor.values.planned_start_date)
      const predecessorEnd = isoDate(predecessor.values.planned_end_date)
      if (!rowStart || !rowEnd || !predecessorStart || !predecessorEnd) {
        violations.push(`${rowCode(row)} missing dependency date for ${rowCode(predecessor)}`)
        continue
      }
      const dependencyType = String(dependency.dependencyType ?? 'FS').toUpperCase()
      const lagDays = Number.isFinite(Number(dependency.lagDays)) ? Number(dependency.lagDays) : 0
      const expectedDate = dependencyType === 'SS'
        ? addDaysIso(predecessorStart, lagDays)
        : dependencyType === 'FF'
          ? addDaysIso(predecessorEnd, lagDays)
          : dependencyType === 'SF'
            ? addDaysIso(predecessorStart, lagDays)
            : addDaysIso(predecessorEnd, lagDays)
      const actualDate = dependencyType === 'FF' || dependencyType === 'SF' ? rowEnd : rowStart
      if (actualDate < expectedDate) {
        violations.push(`${rowCode(row)} ${dependencyType}+${lagDays} from ${rowCode(predecessor)} expected ${expectedDate} actual ${actualDate}`)
      }
    }
  }

  return violations
}

function hasDependencyIntent(row: { predecessorDependencies?: Array<Record<string, unknown>> }, intentCodePrefix: string) {
  return (row.predecessorDependencies ?? []).some((dependency) => (
    String(dependency.intentCode ?? '').startsWith(intentCodePrefix)
  ))
}

function dependencyConsumesCrossItemWorkflowRule(
  dependency: Record<string, unknown>,
  workflowRule: string,
) {
  return dependency.intentCode === `cross-item:${workflowRule}`
    || (Array.isArray(dependency.additionalIntentCodes)
      && dependency.additionalIntentCodes.includes(`cross-item:${workflowRule}`))
    || (Array.isArray(dependency.crossItemWorkflowRuleCodes)
      && dependency.crossItemWorkflowRuleCodes.includes(workflowRule))
}

function readConstructionOrganizationScenario(rows: Array<{ values: Record<string, unknown> }>) {
  for (const row of rows) {
    const projectOrganization = rowMetadata(row).projectOrganization as Record<string, any> | undefined
    const scenarioSelection = projectOrganization?.scenarioSelection as Record<string, any> | undefined
    if (scenarioSelection?.source === 'construction_organization_scenario_selector') return scenarioSelection
  }
  return null
}

function buildDefaultMasterPlanProbeFacts(probe: typeof PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES[number]) {
  const isRenovation = probe.businessType === 'renovation'
  return {
    businessType: probe.businessType,
    businessSubtype: probe.businessType,
    projectTypeCode: probe.projectTypeCode,
    structureTypeCode: probe.structureTypeCode,
    methodVariantCodes: probe.methodVariantCodes,
    buildingPatternCodes: probe.buildingPatternCodes,
    functionalUsageCodes: probe.functionalUsageCodes,
    functionalCategoryCodes: probe.functionalCategoryCodes,
    specialRoomTypeCodes: probe.specialRoomTypeCodes,
    physicalZoneTypeCodes: probe.physicalZoneTypeCodes,
    hardConstraintCodes: probe.hardConstraintCodes,
    projectFeatures: {
      foundationFormCodes: isRenovation ? [] : ['bored_pile', 'diaphragm_wall'],
    },
    detailLevel: 'standard',
    buildingCount: isRenovation ? 1 : 3,
    standardFloorCount: isRenovation ? 5 : 24,
    highestBuildingFloorCount: isRenovation ? 5 : 32,
    basementLevelCount: isRenovation ? 0 : 2,
    foundationDepthM: isRenovation ? 0 : 5,
    totalAreaM2: isRenovation ? 18000 : 120000,
  } as const
}

async function collectDefaultMasterPlanProbeFailures(
  probes: readonly (typeof PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES[number])[],
) {
  const failures: string[] = []

  for (const probe of probes) {
    const facts = buildDefaultMasterPlanProbeFacts(probe)
    const recommendation = buildTemplateRecommendation(facts as never)
    const templateSelection = buildWizardTemplateSelection(recommendation)

    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: `batch-default-master-plan-quality-${probe.businessType}`,
        templateIds: templateSelection.templateIds,
        selectedNodesByTemplate: templateSelection.selectedNodesByTemplate,
        selectedNodeIds: [],
        plannedStartDate: '2026-07-01',
        detailLevel: 'planning_skeleton',
        generationDepth: 'managed_frontier',
        includeActivitySteps: false,
        projectFacts: {
          ...facts,
          defaultPlanOutput: 'master_plan',
          masterPlanProfile: recommendation.masterPlanProfile,
          foundationMethodCandidates: recommendation.foundationMethodCandidates,
        },
        clientContext: {
          defaultPlanOutput: 'master_plan',
          planOutputLayer: 'master_plan',
          masterPlanProfile: recommendation.masterPlanProfile,
        },
        scope: {
          scopeExpansionMode: 'project',
          business_type: probe.businessType,
          project_type_code: probe.projectTypeCode,
          structure_type_code: probe.structureTypeCode,
          method_variant_codes: probe.methodVariantCodes,
          buildingPatternCodes: probe.buildingPatternCodes,
          functionalUsageCodes: probe.functionalUsageCodes,
          functionalCategoryCodes: probe.functionalCategoryCodes,
          specialRoomTypeCodes: probe.specialRoomTypeCodes,
          physicalZoneTypeCodes: probe.physicalZoneTypeCodes,
          hardConstraintCodes: probe.hardConstraintCodes,
          planScopeCaliber: 'full_project',
          deliveryStandard: 'completion_acceptance',
          terminalEvent: 'joint_acceptance',
          foundationMethodCandidates: recommendation.foundationMethodCandidates,
          building_count: facts.buildingCount,
          standard_floor_count: facts.standardFloorCount,
          highest_building_floor_count: facts.highestBuildingFloorCount,
          basement_level_count: facts.basementLevelCount,
          foundation_depth_m: facts.foundationDepthM,
          total_area_m2: facts.totalAreaM2,
          project_features: {
            ...facts.projectFeatures,
            foundationMethodCandidates: recommendation.foundationMethodCandidates,
          },
        },
      },
    })

    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const linkedProjectionRows = generated.rows.filter((row) => row.rowProjectionMode === 'linked_projection')
    const masterPlanLimitWarning = generated.governanceWarnings?.find((warning) => (
      warning.code === 'MASTER_PLAN_ROW_COUNT_LIMIT_APPLIED'
    ))
    const stageText = scheduleRows.map((row) => [
      row.values.standard_work_code,
      row.values.title,
      row.values.name,
      row.values.execution_phase,
      rowMetadata(row).executionPhase,
      rowMetadata(row).executionLane,
    ].join(' ')).join(' | ')
    const nonFieldRows = scheduleRows.filter((row) => {
      const metadata = rowMetadata(row)
      const kind = String(row.values.plan_item_kind ?? metadata.planItemKind ?? '')
      const participation = String(row.values.schedule_participation ?? metadata.scheduleParticipation ?? '')
      return ['management_task', 'document_task', 'safety_control', 'inspection_task', 'milestone'].includes(kind)
        || participation === 'reference_only'
        || participation === 'read_only_projection'
    })
    const managementOrDocumentRows = scheduleRows.filter((row) => {
      const metadata = rowMetadata(row)
      const kind = String(row.values.plan_item_kind ?? metadata.planItemKind ?? '')
      const participation = String(row.values.schedule_participation ?? metadata.scheduleParticipation ?? '')
      return ['management_task', 'document_task', 'safety_control'].includes(kind)
        || participation === 'reference_only'
        || participation === 'read_only_projection'
    })
    const fieldWorkRows = scheduleRows.filter((row) => {
      const metadata = rowMetadata(row)
      return String(row.values.duration_contribution_mode ?? metadata.durationContributionMode ?? '') === 'duration_bearing'
    })
    const fieldControlRows = scheduleRows.filter((row) => {
      const metadata = rowMetadata(row)
      const durationMode = String(row.values.duration_contribution_mode ?? metadata.durationContributionMode ?? '')
      const kind = String(row.values.plan_item_kind ?? metadata.planItemKind ?? '')
      return durationMode === 'duration_bearing'
        || row.values.is_wbs_summary === true
        || kind === 'milestone'
    })
    const shortDurationRows = scheduleRows.filter((row) => durationDaysOf(row) <= 1)
    const checks = [
      [generated.defaultPlanOutput === 'master_plan', 'missing defaultPlanOutput=master_plan'],
      [scheduleRows.length > 0, 'no schedule rows'],
      [
        scheduleRows.length <= recommendation.masterPlanProfile.rowCountRange[1],
        `schedule rows ${scheduleRows.length} exceed profile upper ${recommendation.masterPlanProfile.rowCountRange[1]}`,
      ],
      [
        scheduleRows.length <= WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
        `schedule rows ${scheduleRows.length} exceed render budget ${WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET}`,
      ],
      [
        !masterPlanLimitWarning || linkedProjectionRows.length > 0,
        'master-plan limit warning did not retain linked projection evidence',
      ],
      [
        nonFieldRows.length / Math.max(1, scheduleRows.length) <= 0.3,
        `non-field schedule ratio ${nonFieldRows.length}/${scheduleRows.length}`,
      ],
      [
        managementOrDocumentRows.length / Math.max(1, scheduleRows.length) <= 0.12,
        `management/document schedule ratio ${managementOrDocumentRows.length}/${scheduleRows.length}`,
      ],
      [
        fieldWorkRows.length / Math.max(1, scheduleRows.length) >= 0.6,
        `field-work schedule ratio ${fieldWorkRows.length}/${scheduleRows.length}`,
      ],
      [
        fieldControlRows.length / Math.max(1, scheduleRows.length) >= 0.9,
        `field/control schedule ratio ${fieldControlRows.length}/${scheduleRows.length}`,
      ],
      [
        shortDurationRows.length / Math.max(1, scheduleRows.length) <= 0.15,
        `<=1 day schedule ratio ${shortDurationRows.length}/${scheduleRows.length}`,
      ],
      [
        probe.businessType === 'renovation'
          ? /检测|鉴定|拆改|加固|改造|renovation|retrofit/i.test(stageText)
          : /01-|foundation|pile|pit|earthwork|地下|基础|基坑|土方/i.test(stageText),
        probe.businessType === 'renovation'
          ? 'missing renovation survey/retrofit stage signal'
          : 'missing foundation or earthwork stage signal',
      ],
      [
        /02-|structure|superstructure|steel|主体|结构|标准层|钢结构|模块/i.test(stageText),
        'missing superstructure stage signal',
      ],
      [
        /MEP|decoration|fitout|facade|机电|安装|装饰|装修|幕墙|洁净|客房|医技|数据|工艺/i.test(stageText),
        'missing MEP/fitout/domain systems stage signal',
      ],
      [
        /OUT|outdoor|municipal|landscape|acceptance|handover|室外|市政|园林|竣工|验收|移交/i.test(stageText),
        'missing outdoor or acceptance handoff stage signal',
      ],
    ] as const

    for (const [passed, message] of checks) {
      if (!passed) failures.push(`${probe.businessType}: ${message}`)
    }
  }

  return failures
}

async function generateDefaultMasterPlanForProbe(
  probe: typeof PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES[number],
  options: {
    constructionCalendar?: Record<string, unknown>
    companyId?: string
    defaultMasterPlanRuntimeReferenceDays?: Record<string, unknown>
    projectFactOverrides?: Record<string, unknown>
    scopeOverrides?: Record<string, unknown>
    clientContextOverrides?: Record<string, unknown>
  } = {},
) {
  const facts = {
    ...buildDefaultMasterPlanProbeFacts(probe),
    ...(options.projectFactOverrides ?? {}),
  }
  const recommendation = buildTemplateRecommendation(facts as never)
  const templateSelection = buildWizardTemplateSelection(recommendation)

  return generateWbsTemplateRows({
    projectId: '00000000-0000-4000-8000-000000000001',
    surface: 'task_list',
    detailLevel: 'planning_skeleton' as never,
    diagnosticDurationSuggestionMode: 'fast_template',
    operation: {
      type: 'template_generate',
      generationBatchId: `batch-default-master-plan-profile-${probe.businessType}`,
      templateIds: templateSelection.templateIds,
      selectedNodesByTemplate: templateSelection.selectedNodesByTemplate,
      selectedNodeIds: [],
      plannedStartDate: '2026-07-01',
      constructionCalendar: options.constructionCalendar,
      detailLevel: 'planning_skeleton',
      generationDepth: 'managed_frontier',
      includeActivitySteps: false,
      projectFacts: {
        ...facts,
        companyId: options.companyId,
        defaultPlanOutput: 'master_plan',
        masterPlanProfile: recommendation.masterPlanProfile,
        foundationMethodCandidates: recommendation.foundationMethodCandidates,
        defaultMasterPlanRuntimeReferenceDays: options.defaultMasterPlanRuntimeReferenceDays,
      },
      clientContext: {
        defaultPlanOutput: 'master_plan',
        planOutputLayer: 'master_plan',
        masterPlanProfile: recommendation.masterPlanProfile,
        constructionCalendar: options.constructionCalendar,
        companyId: options.companyId,
        defaultMasterPlanRuntimeReferenceDays: options.defaultMasterPlanRuntimeReferenceDays,
        ...(options.clientContextOverrides ?? {}),
      },
      scope: {
        scopeExpansionMode: 'project',
        company_id: options.companyId,
        business_type: probe.businessType,
        project_type_code: probe.projectTypeCode,
        structure_type_code: probe.structureTypeCode,
        method_variant_codes: probe.methodVariantCodes,
        buildingPatternCodes: probe.buildingPatternCodes,
        functionalUsageCodes: probe.functionalUsageCodes,
        functionalCategoryCodes: probe.functionalCategoryCodes,
        specialRoomTypeCodes: probe.specialRoomTypeCodes,
        physicalZoneTypeCodes: probe.physicalZoneTypeCodes,
        hardConstraintCodes: probe.hardConstraintCodes,
        planScopeCaliber: 'full_project_master',
        deliveryStandard: 'full_fitout',
        terminalEvent: 'owner_handover',
        foundationMethodCandidates: recommendation.foundationMethodCandidates,
        building_count: facts.buildingCount,
        standard_floor_count: facts.standardFloorCount,
        highest_building_floor_count: facts.highestBuildingFloorCount,
        basement_level_count: facts.basementLevelCount,
        foundation_depth_m: facts.foundationDepthM,
        total_area_m2: facts.totalAreaM2,
        project_features: {
          ...facts.projectFeatures,
          foundationMethodCandidates: recommendation.foundationMethodCandidates,
        },
        defaultMasterPlanRuntimeReferenceDays: options.defaultMasterPlanRuntimeReferenceDays,
        ...(options.scopeOverrides ?? {}),
      },
    },
  })
}

function scheduleRowTitles(rows: Array<{ rowProjectionMode?: string | null; values: Record<string, unknown> }>) {
  return rows
    .filter((row) => row.rowProjectionMode === 'schedule_row')
    .map((row) => String(row.values.title ?? row.values.name ?? ''))
}

function scheduleRowsForBusinessTypeProfile<T extends {
    clientRowId: string
    parentClientRowId?: string | null
    rowProjectionMode?: string | null
    values: Record<string, unknown>
    predecessorDependencies?: Array<Record<string, unknown>>
  }>(rows: T[]): T[] {
  return rows.filter((row) =>
    row.rowProjectionMode === 'schedule_row'
    && rowMetadata(row).businessTypeMasterPlan
    && row.values.generation_policy === 'business_type_default_master_plan_profile_v1')
}

const PROJECT_ORGANIZATION_BUSINESS_TYPES = [
  'general_civil',
  'hotel',
  'hospital',
  'school',
  'industrial',
  'data_center',
  'transportation_hub',
  'sports_culture',
  'tod_upper_cover',
  'renovation',
  'modular_building',
]

const PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES = [
  {
    businessType: 'general_civil',
    projectTypeCode: 'residential',
    structureTypeCode: 'frame_shear',
    functionalUsageCodes: ['residential'],
    functionalCategoryCodes: ['residential'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'hotel',
    projectTypeCode: 'hotel',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['hotel'],
    functionalCategoryCodes: ['hotel'],
    specialRoomTypeCodes: ['guestroom', 'lobby', 'kitchen'],
    physicalZoneTypeCodes: ['tower', 'basement', 'podium', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'hospital',
    projectTypeCode: 'hospital',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['hospital'],
    functionalCategoryCodes: ['cleanroom'],
    specialRoomTypeCodes: ['cleanroom', 'operating_room'],
    physicalZoneTypeCodes: ['tower', 'basement'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'school',
    projectTypeCode: 'school',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['school'],
    functionalCategoryCodes: ['education'],
    specialRoomTypeCodes: ['classroom', 'laboratory'],
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site', 'playground'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'industrial',
    projectTypeCode: 'industrial',
    structureTypeCode: 'steel_frame',
    functionalUsageCodes: ['industrial'],
    functionalCategoryCodes: ['factory'],
    specialRoomTypeCodes: ['workshop', 'equipment_foundation'],
    physicalZoneTypeCodes: ['tower', 'basement', 'outdoor_site', 'logistics_yard'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'industrial_superflat_floor'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'data_center',
    projectTypeCode: 'data_center',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['data_center'],
    functionalCategoryCodes: ['data_center'],
    specialRoomTypeCodes: ['computer_room', 'battery_room'],
    physicalZoneTypeCodes: ['tower', 'basement'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'transportation_hub',
    projectTypeCode: 'transportation_hub',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['transportation_hub'],
    functionalCategoryCodes: ['transportation'],
    specialRoomTypeCodes: ['concourse', 'platform_interface'],
    physicalZoneTypeCodes: ['tower', 'basement', 'metro_interface', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: ['non_stop_operation'],
  },
  {
    businessType: 'sports_culture',
    projectTypeCode: 'sports_culture',
    structureTypeCode: 'large_span_steel',
    functionalUsageCodes: ['sports_culture'],
    functionalCategoryCodes: ['large_span_public'],
    specialRoomTypeCodes: ['arena', 'auditorium'],
    physicalZoneTypeCodes: ['large_span_hall', 'basement', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'steel_frame', 'large_span_roof'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
  {
    businessType: 'tod_upper_cover',
    projectTypeCode: 'tod_upper_cover',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['tod_upper_cover'],
    functionalCategoryCodes: ['tod'],
    specialRoomTypeCodes: ['podium', 'metro_interface'],
    physicalZoneTypeCodes: ['tower', 'basement', 'metro_interface', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: ['non_stop_operation'],
  },
  {
    businessType: 'renovation',
    projectTypeCode: 'renovation',
    structureTypeCode: 'frame_core',
    functionalUsageCodes: ['renovation'],
    functionalCategoryCodes: ['renovation'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['renovation_zone', 'outdoor_site'],
    methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
    buildingPatternCodes: ['cluster'],
    hardConstraintCodes: ['occupied_renovation'],
  },
  {
    businessType: 'modular_building',
    projectTypeCode: 'modular_building',
    structureTypeCode: 'modular',
    functionalUsageCodes: ['modular_building'],
    functionalCategoryCodes: ['modular_building'],
    specialRoomTypeCodes: [],
    physicalZoneTypeCodes: ['tower', 'basement'],
    methodVariantCodes: ['modular_prefab', 'pile_foundation', 'vertical_retaining_support'],
    buildingPatternCodes: ['multi_tower_shared_podium'],
    hardConstraintCodes: [],
  },
] as const

describe('managed-frontier WBS generation', () => {
  beforeEach(() => {
    dbServiceMocks.tables.algorithm_seed_versions = []
    dbServiceMocks.tables.algorithm_seed_records = []
    constructionCalendarMocks.resolveConstructionCalendarContext.mockReset()
    constructionCalendarMocks.resolveConstructionCalendarContext.mockResolvedValue({ basis: 'calendar_day', windows: [] })
    algorithmSeedResolver.clearAlgorithmSeedResolverCache('standard_work_duration')
    algorithmSeedResolver.clearAlgorithmSeedResolverCache('t2_division_rhythm_template' as never)
  })

  it('resolves a governable depth policy instead of using a global hard-coded depth only', () => {
    const concretePolicy = resolveWbsGenerationDepthPolicy({
      stableCode: '02-01',
      categoryType: 'sub_division',
      templateId: CHINA_GB55032_TEMPLATE_ID,
      name: '混凝土结构',
      metadata: {},
    })

    expect(concretePolicy).toEqual(expect.objectContaining({
      materializeDepth: 'sub_division',
      durationComputeDepth: 'process',
      drillDownAvailable: true,
      source: 'wbs_generation_depth_policy_seed',
    }))
    expect(concretePolicy.reason).toContain('首屏')

    const earthworkPolicy = resolveWbsGenerationDepthPolicy({
      stableCode: '01-05',
      categoryType: 'sub_division',
      templateId: CHINA_GB55032_TEMPLATE_ID,
      name: '土方',
      metadata: {},
    })

    expect(earthworkPolicy).toEqual(expect.objectContaining({
      materializeDepth: 'item_work',
      durationComputeDepth: 'process',
      drillDownAvailable: true,
      governance: expect.objectContaining({
        assetType: 'generation_depth_policy',
        curationStatus: 'seeded',
        directSeedMutation: false,
      }),
    }))
    expect(earthworkPolicy.reason).toContain('土方')
  })

  it('uses explicit specialty-domain depth policy instead of falling back to core subdivision rules', () => {
    const mepPolicy = resolveWbsGenerationDepthPolicy({
      stableCode: 'MEP-01-01',
      categoryType: 'sub_division',
      templateId: 'china-mep-coordination',
      name: '管综天花和预留预埋协调',
      metadata: {
        packType: 'specialty',
        templateGroup: 'mep',
      },
    })

    expect(mepPolicy).toEqual(expect.objectContaining({
      policyId: 'specialty-domain-subdivision-managed-frontier',
      materializeDepth: 'item_work',
      durationComputeDepth: 'process',
      drillDownAvailable: true,
      confidence: 'high',
      governance: expect.objectContaining({
        curationStatus: 'seeded',
      }),
    }))
    expect(mepPolicy.policyId).not.toBe('core-building-subdivision-managed-frontier')
  })

  it('generates a production-ready managed skeleton with shallow rows and deep duration rollup in full mode', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-managed-frontier',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-05', '02-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
        },
      },
    })

    const mainPlanRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    expect(mainPlanRows.length).toBeGreaterThan(0)
    expect(mainPlanRows.length).toBeLessThanOrEqual(WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET)
    expect(generated.rowLimitPolicy).toBe('single_batch')
    expect(generated.splitByPhaseApplied).toBe(false)
    expect(generated.generationDepth).toBe('sub_division')

    const concreteStructure = generated.rows.find((row) => row.values.standard_work_code === '02-01')
    expect(concreteStructure).toBeTruthy()
    expect(concreteStructure?.values.wbs_node_type).toBe('sub_division')
    expect(concreteStructure?.values.is_wbs_summary).toBe(true)
    expect(concreteStructure?.values.is_executable).toBe(false)

    const concreteMetadata = rowMetadata(concreteStructure!)
    expect(concreteMetadata.generationDepthPolicy).toEqual(expect.objectContaining({
      materializeDepth: 'sub_division',
      durationComputeDepth: 'process',
      drillDownAvailable: true,
    }))
    expect(concreteMetadata.deepDurationRollup).toEqual(expect.objectContaining({
      source: 'contextual_descendant_rollup',
      durationComputeDepth: 'process',
    }))
    expect(concreteStructure?.values.duration_suggestion).toEqual(expect.objectContaining({
      durationOutputCode: 'plan_reference',
      planReferenceDays: expect.any(Number),
    }))
    expect(concreteStructure?.values.smart_reference_days).toBeGreaterThan(1)
    expect(durationDaysOf(concreteStructure!)).toBe(Number(concreteStructure?.values.smart_reference_days))

    const hiddenChild = generated.rows.find((row) => String(row.values.standard_work_code).startsWith('02-01-'))
    expect(hiddenChild).toBeUndefined()
    expect(concreteMetadata.drillDownAvailable).toBe(true)

    const earthworkSummary = generated.rows.find((row) => row.values.standard_work_code === '01-05')
    expect(earthworkSummary).toBeUndefined()

    const excavation = generated.rows.find((row) => row.values.standard_work_code === '01-05-01')
    expect(excavation).toBeTruthy()
    expect(excavation?.values.wbs_node_type).toBe('item_work')
    expect(rowMetadata(excavation!).generationDepthPolicy).toEqual(expect.objectContaining({
      materializeDepth: 'item_work',
      durationComputeDepth: 'process',
      drillDownAvailable: true,
    }))
    expect(rowMetadata(excavation!).deepDurationRollup).toEqual(expect.objectContaining({
      source: 'contextual_descendant_rollup',
      durationComputeDepth: 'process',
    }))
    expect(generated.rows.find((row) => String(row.values.standard_work_code).startsWith('01-05-01-P'))).toBeUndefined()
  }, 60_000)

  it('declares the default master-plan profile on generated results without opening production mutation boundaries', async () => {
    const masterPlanProfile = {
      layer: 'master_plan',
      detailLevel: 'planning_skeleton',
      generationDepth: 'managed_frontier',
      rowCountRange: [8, 12],
      rowProjectionMode: 'schedule_row',
      supportLayerPolicy: {
        gateMarkers: 'supporting_evidence_not_default_gantt_rows',
        inlineControls: 'embedded_under_schedule_rows',
        linkedProjections: 'review_reference_not_default_gantt_rows',
      },
      mutationBoundary: {
        writesProductionDependencies: false,
        writesProductionDates: false,
        writesCriticalPathFacts: false,
      },
    } as const

    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-generated-master-plan-profile',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01', '02'],
        },
        plannedStartDate: '2026-06-01',
        projectFacts: {
          defaultPlanOutput: 'master_plan',
          masterPlanProfile,
        },
        clientContext: {
          defaultPlanOutput: 'master_plan',
          planOutputLayer: 'master_plan',
          masterPlanProfile,
        },
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          building_count: 3,
          standard_floor_count: 26,
          basement_level_count: 1,
          methodVariantCodes: ['cast_in_situ', 'bored_pile', 'diaphragm_wall'],
          project_features: {
            foundationFormCodes: ['bored_pile', 'diaphragm_wall'],
          },
        },
      },
    })

    expect(generated.masterPlanProfile).toEqual(masterPlanProfile)
    expect(generated.defaultPlanOutput).toBe('master_plan')
    expect(generated.masterPlanProfile?.mutationBoundary).toEqual({
      writesProductionDependencies: false,
      writesProductionDates: false,
      writesCriticalPathFacts: false,
    })
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    expect(scheduleRows.length).toBeGreaterThan(0)
    expect(scheduleRows.length).toBeLessThanOrEqual(masterPlanProfile.rowCountRange[1])
    const projectedRows = generated.rows.filter((row) => row.rowProjectionMode === 'linked_projection')
    expect(projectedRows.length).toBeGreaterThan(0)
    expect(generated.governanceWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MASTER_PLAN_ROW_COUNT_LIMIT_APPLIED',
        severity: 'warning',
        details: expect.objectContaining({
          rowCountUpperLimit: masterPlanProfile.rowCountRange[1],
          mutationBoundary: masterPlanProfile.mutationBoundary,
        }),
      }),
    ]))
  }, 30_000)

  it('keeps a three-building residential default master plan under the row fuse before materialization', async () => {
    const facts = {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      structureTypeCode: 'frame_shear',
      methodVariantCodes: ['cast_in_situ', 'bored_pile', 'diaphragm_wall'],
      projectFeatures: {
        foundationFormCodes: ['bored_pile', 'diaphragm_wall'],
      },
      detailLevel: 'standard',
      buildingCount: 3,
      standardFloorCount: 26,
      highestBuildingFloorCount: 28,
      basementLevelCount: 1,
      foundationDepthM: 6,
      totalAreaM2: 90_000,
    } as const
    const recommendation = buildTemplateRecommendation(facts as never)
    const templateSelection = buildWizardTemplateSelection(recommendation)

    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-residential-default-master-plan',
        templateIds: templateSelection.templateIds,
        selectedNodesByTemplate: templateSelection.selectedNodesByTemplate,
        selectedNodeIds: [],
        plannedStartDate: '2026-07-01',
        detailLevel: 'planning_skeleton',
        generationDepth: 'managed_frontier',
        includeActivitySteps: false,
        projectFacts: {
          ...facts,
          defaultPlanOutput: 'master_plan',
          masterPlanProfile: recommendation.masterPlanProfile,
        },
        clientContext: {
          defaultPlanOutput: 'master_plan',
          planOutputLayer: 'master_plan',
          masterPlanProfile: recommendation.masterPlanProfile,
        },
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          method_variant_codes: facts.methodVariantCodes,
          building_count: facts.buildingCount,
          standard_floor_count: facts.standardFloorCount,
          highest_building_floor_count: facts.highestBuildingFloorCount,
          basement_level_count: facts.basementLevelCount,
          foundation_depth_m: facts.foundationDepthM,
          project_features: facts.projectFeatures,
        },
      },
    })

    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const linkedProjectionRows = generated.rows.filter((row) => row.rowProjectionMode === 'linked_projection')
    const scheduleCodes = new Set(scheduleRows.map((row) => String(row.values.standard_work_code ?? '')))

    expect(generated.defaultPlanOutput).toBe('master_plan')
    expect(scheduleRows.length).toBeGreaterThan(0)
    expect(scheduleRows.length).toBeLessThanOrEqual(recommendation.masterPlanProfile.rowCountRange[1])
    expect(scheduleRows.length).toBeLessThanOrEqual(WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET)
    expect(scheduleCodes.has('02-03')).toBe(false)
    expect(scheduleCodes.has('FND-03-01-03')).toBe(false)
    expect(scheduleCodes.has('FND-03-01-04')).toBe(false)
    expect(scheduleCodes.has('FND-03-01-06')).toBe(false)
    expect(scheduleCodes.has('FND-04-01-01')).toBe(false)
    expect(scheduleCodes.has('FND-04-01-02')).toBe(false)
    expect(scheduleCodes.has('BDT-04-01-02')).toBe(false)
    expect(scheduleCodes.has('BDT-04-01-03')).toBe(false)
    expect(scheduleCodes.has('BDT-05-01-01')).toBe(false)
    const indistinguishableDuplicateKeys = new Map<string, number>()
    for (const row of scheduleRows) {
      const key = [
        row.values.standard_work_code,
        row.values.title ?? row.values.name,
        row.values.execution_phase,
        row.values.execution_lane,
      ].map((value) => String(value ?? '')).join('|')
      indistinguishableDuplicateKeys.set(key, (indistinguishableDuplicateKeys.get(key) ?? 0) + 1)
    }
    expect([...indistinguishableDuplicateKeys.entries()].filter(([, count]) => count > 1)).toEqual([])
    const firstStartByPhase = new Map<string, number>()
    const lastStartByPhase = new Map<string, number>()
    for (const row of scheduleRows) {
      const phase = String(row.values.execution_phase ?? '')
      const start = dateMs(row.values.planned_start_date)
      if (!phase || !Number.isFinite(start)) continue
      firstStartByPhase.set(phase, Math.min(firstStartByPhase.get(phase) ?? start, start))
      lastStartByPhase.set(phase, Math.max(lastStartByPhase.get(phase) ?? start, start))
    }
    const firstSuperstructureStart = firstStartByPhase.get('superstructure_rhythm')
    const firstMepRoughinStart = firstStartByPhase.get('mep_roughin')
    const firstInteriorStart = firstStartByPhase.get('interior_fitout_terminal')
    const latestFoundationStart = lastStartByPhase.get('foundation_pit_pile')
    expect(firstSuperstructureStart).toBeLessThan(firstMepRoughinStart!)
    expect(firstSuperstructureStart).toBeLessThan(firstInteriorStart!)
    expect(latestFoundationStart).toBeLessThan(firstMepRoughinStart!)
    const masterPlanLimitWarning = generated.governanceWarnings?.find((warning) => (
      warning.code === 'MASTER_PLAN_ROW_COUNT_LIMIT_APPLIED'
    ))
    if (masterPlanLimitWarning) expect(linkedProjectionRows.length).toBeGreaterThan(0)
  }, 60_000)

  it('generates a field-usable asset-backed residential master plan from real-plan evidence, duration assets, and rhythm rules', async () => {
    const facts = {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'frame_shear',
      methodVariantCodes: ['cast_in_situ', 'bored_pile', 'precast_pile', 'cfg_pile', 'diaphragm_wall', 'smw_wall', 'trd_wall'],
      projectFeatures: {
        foundationFormCodes: ['bored_pile', 'precast_pile', 'cfg_pile', 'diaphragm_wall', 'smw_wall', 'trd_wall'],
      },
      detailLevel: 'standard',
      buildingCount: 3,
      standardFloorCount: 26,
      highestBuildingFloorCount: 28,
      basementLevelCount: 1,
      foundationDepthM: 6,
      totalAreaM2: 90_000,
    } as const
    const recommendation = buildTemplateRecommendation(facts as never)
    const templateSelection = buildWizardTemplateSelection(recommendation)

    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-residential-default-master-plan-v2',
        templateIds: templateSelection.templateIds,
        selectedNodesByTemplate: templateSelection.selectedNodesByTemplate,
        selectedNodeIds: [],
        plannedStartDate: '2026-07-01',
        detailLevel: 'planning_skeleton',
        generationDepth: 'managed_frontier',
        includeActivitySteps: false,
        projectFacts: {
          ...facts,
          defaultPlanOutput: 'master_plan',
          masterPlanProfile: recommendation.masterPlanProfile,
        },
        clientContext: {
          defaultPlanOutput: 'master_plan',
          planOutputLayer: 'master_plan',
          masterPlanProfile: recommendation.masterPlanProfile,
        },
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          method_variant_codes: facts.methodVariantCodes,
          building_count: facts.buildingCount,
          standard_floor_count: facts.standardFloorCount,
          highest_building_floor_count: facts.highestBuildingFloorCount,
          basement_level_count: facts.basementLevelCount,
          foundation_depth_m: facts.foundationDepthM,
          project_features: facts.projectFeatures,
        },
      },
    })

    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const linkedProjectionRows = generated.rows.filter((row) => row.rowProjectionMode === 'linked_projection')
    const titles = scheduleRows.map((row) => String(row.values.title ?? row.values.name ?? ''))
    const linkedProjectionTitles = linkedProjectionRows.map((row) => String(row.values.title ?? row.values.name ?? ''))
    const phases = new Set(scheduleRows.map((row) => String(row.values.execution_phase ?? '')))
    const titleIncludes = (keyword: string) => titles.some((title) => title.includes(keyword))
    const phaseRows = (phase: string) => scheduleRows.filter((row) => row.values.execution_phase === phase)

    expect(titleIncludes('塔吊')).toBe(false)
    expect(titleIncludes('施工电梯安装与楼层运输保障')).toBe(false)
    expect(linkedProjectionTitles.some((title) => title.includes('塔吊基础施工'))).toBe(true)
    expect(linkedProjectionTitles.some((title) => title.includes('塔吊安装与投入使用'))).toBe(true)
    expect((generated as any).masterPlanVisibilitySummary).toEqual(expect.objectContaining({
      source: 'default_master_plan_visibility_policy',
      businessType: 'general_civil',
      phaseCoverageRate: 1,
      policyCoverageRate: 1,
      danglingVisibleDependencyCount: 0,
    }))

    const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, unknown>
    expect(scheduleRows.length).toBeGreaterThanOrEqual(Number(assembly.minimumScheduleRowCount))
    expect(scheduleRows.length).toBeLessThanOrEqual(Number(assembly.maximumScheduleRowCount))
    expect(assembly.readyForWizardCommit).toBe(true)
    const summaryRows = scheduleRows.filter((row) => row.values.is_wbs_summary === true)
    expect(summaryRows.length).toBeGreaterThanOrEqual(20)
    expect(summaryRows.length).toBeLessThanOrEqual(24)
    expect(Number(assembly.executableScheduleRowCount) / (scheduleRows.length - summaryRows.length)).toBeGreaterThanOrEqual(0.8)
    expect(Number(assembly.summaryScheduleRowCount)).toBe(summaryRows.length)
    expect(assembly.assetInventoryExhausted).toBe(
      Number(assembly.scheduleRowCount) < Number(generated.masterPlanProfile?.rowCountRange[0]),
    )
    const rootRows = scheduleRows.filter((row) => !row.parentClientRowId)
    expect(rootRows).toHaveLength(1)
    expect(rootRows[0]?.values.is_wbs_summary).toBe(true)
    expect(scheduleRows.filter((row) => row !== rootRows[0]).every((row) => Boolean(row.parentClientRowId))).toBe(true)
    const scheduleRowById = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
    const scheduleIndexById = new Map(scheduleRows.map((row, index) => [row.clientRowId, index]))
    expect(scheduleRows.every((row, index) => (
      !row.parentClientRowId || Number(scheduleIndexById.get(row.parentClientRowId)) < index
    ))).toBe(true)
    const hierarchyDepth = (row: typeof scheduleRows[number]) => {
      let depth = 1
      let parentId = row.parentClientRowId
      const seen = new Set([row.clientRowId])
      while (parentId && scheduleRowById.has(parentId) && !seen.has(parentId)) {
        seen.add(parentId)
        depth += 1
        parentId = scheduleRowById.get(parentId)?.parentClientRowId ?? null
      }
      return depth
    }
    expect(Math.max(...scheduleRows.map(hierarchyDepth))).toBeGreaterThanOrEqual(4)
    const candidateNetworkRows = ((generated.candidateNetworkEvaluation?.rowSchedule ?? []) as Array<{ generatedRowId: string }>)
      .map((row) => row.generatedRowId)
    expect(candidateNetworkRows).toHaveLength(scheduleRows.length - summaryRows.length)
    expect(candidateNetworkRows.every((rowId) => scheduleRowById.get(rowId)?.values.is_wbs_summary !== true)).toBe(true)
    expect([...phases]).toEqual(expect.arrayContaining([
      'startup_site_setup',
      'foundation_pit_pile',
      'basement_structure',
      'superstructure_rhythm',
      'secondary_structure_fitout_roughin',
      'mep_roughin',
      'envelope_roof_facade',
      'elevator_installation',
      'interior_fitout_terminal',
      'outdoor_municipal_landscape',
      'commissioning',
      'acceptance_handover',
    ]))
    for (const keyword of ['场地移交', '土方开挖', '桩基', '地下室结构', '出正负零', '屋面', '外立面', '电梯', '室外管网', '竣工验收']) {
      expect(titleIncludes(keyword), keyword).toBe(true)
    }
    for (const mutuallyExclusiveMethod of ['SMW', 'TRD', 'CFG', '预制管桩']) {
      expect(titleIncludes(mutuallyExclusiveMethod), mutuallyExclusiveMethod).toBe(false)
    }

    const towerStructureRows = phaseRows('superstructure_rhythm')
      .filter((row) => /[1-3]#楼主体结构标准层循环/.test(String(row.values.title ?? row.values.name ?? '')))
    expect(towerStructureRows).toHaveLength(3)
    for (const row of towerStructureRows) {
      expect(durationDaysOf(row)).toBeGreaterThanOrEqual(180)
      expect(durationDaysOf(row)).toBeLessThanOrEqual(240)
    }
    for (const pattern of [
      /[1-3]#楼砌体样板验收与精装作业面移交/,
      /[1-3]#楼机电支管安装、试压与末端接驳/,
      /[1-3]#楼外窗塞缝淋水与外围护封闭验收/,
      /[1-3]#楼精装末端安装、成品保护与分户初验/,
    ]) {
      expect(titles.filter((title) => pattern.test(title)), pattern.source).toHaveLength(3)
    }
    const rowByStableCode = new Map(scheduleRows.map((row) => [
      String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? ''),
      row,
    ]))
    const predecessorStableCodesOf = (stableCode: string) => (
      rowByStableCode.get(stableCode)?.predecessorDependencies
        .map((dependency) => String(dependency.predecessorStableCode ?? ''))
        .filter(Boolean)
        .sort() ?? []
    )

    const towerElevatorInstallCodes = [1, 2, 3].map((buildingNumber) => (
      `RMP-10-02-${String(buildingNumber).padStart(2, '0')}`
    ))
    expect(towerElevatorInstallCodes.every((code) => rowByStableCode.has(code))).toBe(true)
    expect(rowByStableCode.has('RMP-10-02')).toBe(false)
    for (const [index, stableCode] of towerElevatorInstallCodes.entries()) {
      expect(predecessorStableCodesOf(stableCode)).toEqual([
        `RMP-04-${String(index + 1).padStart(2, '0')}-02`,
      ])
    }
    expect(predecessorStableCodesOf('RMP-10-03')).toEqual(towerElevatorInstallCodes)

    const towerFacadeCloseoutCodes = [1, 2, 3].map((buildingNumber) => (
      `RMP-08-${String(buildingNumber).padStart(2, '0')}-03`
    ))
    expect(towerFacadeCloseoutCodes.every((code) => rowByStableCode.has(code))).toBe(true)
    expect(rowByStableCode.has('RMP-08-90')).toBe(false)
    for (const [index, stableCode] of towerFacadeCloseoutCodes.entries()) {
      const facadeCode = `RMP-08-${String(index + 1).padStart(2, '0')}-01`
      expect(predecessorStableCodesOf(stableCode)).toEqual(expect.arrayContaining([facadeCode]))
      expect(dateMs(rowByStableCode.get(stableCode)?.values.planned_end_date)).toBeGreaterThanOrEqual(
        dateMs(rowByStableCode.get(facadeCode)?.values.planned_end_date),
      )
    }

    for (const buildingNumber of [1, 2, 3]) {
      const suffix = String(buildingNumber).padStart(2, '0')
      const sampleCode = `RMP-05-${suffix}-02`
      const fitoutCode = `RMP-09-${suffix}-02`
      expect(predecessorStableCodesOf(fitoutCode)).toEqual(expect.arrayContaining([sampleCode]))
      expect(dateMs(rowByStableCode.get(fitoutCode)?.values.planned_start_date)).toBeGreaterThan(
        dateMs(rowByStableCode.get(sampleCode)?.values.planned_end_date),
      )
    }

    const acceptanceTitlesByCode = new Map([
      ['RMP-13-01', '消防专项验收'],
      ['RMP-13-02', '人防专项验收'],
      ['RMP-13-03', '节能专项验收'],
      ['RMP-13-04', '规划核实'],
      ['RMP-13-05', '竣工预验收、问题整改与资料归档'],
      ['RMP-13-06', '竣工验收'],
      ['RMP-13-07', '竣工备案、档案及物业移交'],
      ['RMP-13-08', '项目交付完成'],
    ])
    for (const [stableCode, title] of acceptanceTitlesByCode) {
      expect(rowByStableCode.get(stableCode)?.values.title, stableCode).toBe(title)
    }
    expect(titleIncludes('规划消防人防节能专项验收')).toBe(false)
    expect(rowByStableCode.get('RMP-13-06')?.planItemKind).toBe('milestone')
    expect(rowByStableCode.get('RMP-13-08')?.planItemKind).toBe('milestone')
    expect(predecessorStableCodesOf('RMP-13-05')).toEqual([
      'RMP-13-01',
      'RMP-13-02',
      'RMP-13-03',
      'RMP-13-04',
    ])
    expect(predecessorStableCodesOf('RMP-13-08')).toEqual(['RMP-13-07'])
    const towerEntryRows = [1, 2, 3].map((buildingNumber) => (
      rowByStableCode.get(`RMP-04-${String(buildingNumber).padStart(2, '0')}-01`)
    ))
    const towerEntryStartDates = towerEntryRows.map((row) => String(row?.values.planned_start_date ?? ''))
    expect(towerEntryRows.every(Boolean)).toBe(true)
    expect(towerEntryStartDates).toEqual([...towerEntryStartDates].sort())
    expect(new Set(towerEntryStartDates).size).toBe(towerEntryStartDates.length)
    for (const [index, row] of towerEntryRows.entries()) {
      expect(row?.values.organization_lane).toBe(`tower_lane_${index + 1}`)
      expect(row?.values.building_sequence_number).toBe(index + 1)
      expect(rowMetadata(row!).projectOrganization).toEqual(expect.objectContaining({
        source: 'project_execution_organization_policy',
        organizationLane: `tower_lane_${index + 1}`,
        organizationLaneRole: 'primary_building_lane',
        networkPolicy: expect.objectContaining({
          sharedWorksRelease: 'before_primary_lanes',
          primaryLaneScheduling: 'staggered_lanes_with_interface_gates',
        }),
      }))
    }
    const projectStart = Math.min(...scheduleRows.map((row) => dateMs(row.values.planned_start_date)))
    const projectEnd = Math.max(...scheduleRows.map((row) => dateMs(row.values.planned_end_date)))
    const projectDurationDays = Math.max(1, Math.round((projectEnd - projectStart) / 86_400_000) + 1)
    expect(projectDurationDays).toBeGreaterThanOrEqual(720)
    expect(projectDurationDays).toBeLessThanOrEqual(960)

    const expectedNonFieldWorkRows = new Map([
      ['RMP-02-04', { planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test' }],
      ['RMP-03-05', { planItemKind: 'milestone', durationContributionMode: 'handover_marker', executionNature: 'handover_milestone' }],
      ['RMP-04-01-04', { planItemKind: 'milestone', durationContributionMode: 'quality_gate', executionNature: 'inspection_test' }],
      ['RMP-13-01', { planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test' }],
      ['RMP-13-02', { planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test' }],
      ['RMP-13-03', { planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test' }],
      ['RMP-13-04', { planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test' }],
      ['RMP-13-05', { planItemKind: 'inspection_task', durationContributionMode: 'quality_gate', executionNature: 'inspection_test' }],
      ['RMP-13-06', { planItemKind: 'milestone', durationContributionMode: 'handover_marker', executionNature: 'handover_milestone' }],
      ['RMP-13-07', { planItemKind: 'document_task', durationContributionMode: 'quality_gate', executionNature: 'document_record' }],
      ['RMP-13-08', { planItemKind: 'milestone', durationContributionMode: 'handover_marker', executionNature: 'handover_milestone' }],
    ])
    for (const [stableCode, expectedSemantics] of expectedNonFieldWorkRows) {
      const row = rowByStableCode.get(stableCode)
      expect(row, stableCode).toBeTruthy()
      expect(row?.planItemKind, stableCode).toBe(expectedSemantics.planItemKind)
      expect(row?.values.plan_item_kind, stableCode).toBe(expectedSemantics.planItemKind)
      expect(row?.values.duration_contribution_mode, stableCode).toBe(expectedSemantics.durationContributionMode)
      expect(row?.values.execution_nature, stableCode).toBe(expectedSemantics.executionNature)
      expect(rowDurationSuggestion(row!).durationContributionMode, stableCode).toBe(expectedSemantics.durationContributionMode)
    }
    const milestoneRows = scheduleRows.filter((row) => row.values.plan_item_kind === 'milestone')
    expect(milestoneRows.length).toBeGreaterThan(0)
    for (const row of milestoneRows) {
      const milestoneSuggestion = rowDurationSuggestion(row)
      expect(row.values.planned_end_date, String(row.values.standard_work_code ?? '')).toBe(row.values.planned_start_date)
      expect([null, 1], String(row.values.standard_work_code ?? '')).toContain(row.values.smart_reference_days)
      if (milestoneSuggestion.planReferenceDays != null) {
        expect(milestoneSuggestion.planReferenceDays, String(row.values.standard_work_code ?? '')).toBe(1)
      }
      if (milestoneSuggestion.conservativeDurationDays != null) {
        expect(milestoneSuggestion.conservativeDurationDays, String(row.values.standard_work_code ?? '')).toBe(1)
      }
      if (milestoneSuggestion.durationRiskRange != null) {
        expect(milestoneSuggestion.durationRiskRange, String(row.values.standard_work_code ?? '')).toEqual(expect.objectContaining({
          p20Days: 1,
          p50Days: 1,
          p80Days: 1,
          uncertaintyBandDays: 0,
        }))
      }
    }
    const expectedFieldWorkRows = new Map([
      ['RMP-01-01', { planItemKind: 'work_task', durationContributionMode: 'duration_bearing', executionNature: 'technical_preparation' }],
      ['RMP-02-06', { planItemKind: 'work_task', durationContributionMode: 'duration_bearing', executionNature: 'physical_work' }],
      ['RMP-10-03', { planItemKind: 'work_task', durationContributionMode: 'duration_bearing', executionNature: 'physical_work' }],
      ['RMP-03-06', { planItemKind: 'work_task', durationContributionMode: 'duration_bearing', executionNature: 'physical_work' }],
      ['RMP-06-92', { planItemKind: 'work_task', durationContributionMode: 'duration_bearing', executionNature: 'physical_work' }],
      ['RMP-11-03', { planItemKind: 'work_task', durationContributionMode: 'duration_bearing', executionNature: 'physical_work' }],
      ['RMP-12-03', { planItemKind: 'work_task', durationContributionMode: 'duration_bearing', executionNature: 'physical_work' }],
      ['RMP-12-04', { planItemKind: 'work_task', durationContributionMode: 'duration_bearing', executionNature: 'physical_work' }],
    ])
    for (const [stableCode, expectedSemantics] of expectedFieldWorkRows) {
      const row = rowByStableCode.get(stableCode)
      expect(row, stableCode).toBeTruthy()
      expect(row?.planItemKind, stableCode).toBe(expectedSemantics.planItemKind)
      expect(row?.values.plan_item_kind, stableCode).toBe(expectedSemantics.planItemKind)
      expect(row?.values.duration_contribution_mode, stableCode).toBe(expectedSemantics.durationContributionMode)
      expect(row?.values.execution_nature, stableCode).toBe(expectedSemantics.executionNature)
      expect(rowDurationSuggestion(row!).durationContributionMode, stableCode).toBe(expectedSemantics.durationContributionMode)
    }
    expect(rowByStableCode.has('RMP-13-07')).toBe(true)
    expect(scheduleRows.some((row) => row.values.plan_item_kind === 'document_task')).toBe(true)
    expect(scheduleRows.some((row) => row.values.plan_item_kind === 'management_task')).toBe(false)

    const standardFloorCycle = rowByStableCode.get('RMP-04-01-02')
    expect(standardFloorCycle).toBeTruthy()
    expect(standardFloorCycle?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        predecessorStableCode: 'RMP-04-01-01',
        predecessorStableCodes: ['RMP-04-01-01'],
        intentCode: 'asset_backed_residential_master_plan_sequence',
      }),
    ]))
    const standardFloorMetadata = rowMetadata(standardFloorCycle!)
    expect(standardFloorMetadata.source).toBe('asset_backed_default_master_plan')
    expect(standardFloorMetadata.masterPlanGeneration).toEqual(expect.objectContaining({
      source: 'system_standard_asset_backed_master_plan_v2',
      entryTemplateCode: 'residential_master_plan_v2',
      generatorAssetPolicy: 'real_plan_skeleton_plus_duration_rhythm_dependency_assets',
    }))
    expect(standardFloorMetadata.durationAssetMapping).toEqual(expect.objectContaining({
      standardWorkDurationSeedVersion: expect.any(String),
      standardWorkDurationSeedStableCode: expect.any(String),
      standardWorkDurationSeedResolverSource: expect.stringMatching(/project_override|company_override|active_seed|ts_seed_fallback/),
      t2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      t2RhythmTemplateVersion: expect.any(String),
      externalPlanEvidenceRefs: expect.arrayContaining([
        'source:real_construction_schedule_shape:2026-06-30:v1',
      ]),
    }))
    expect(standardFloorMetadata.durationAssetCalculation).toEqual(expect.objectContaining({
      source: 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
      selectedDurationDays: standardFloorCycle?.values.smart_reference_days,
      standardWorkDurationSeedStableCode: 'cast_in_place_formwork',
      standardWorkDurationSeedResolverSource: expect.stringMatching(/project_override|company_override|active_seed|ts_seed_fallback/),
      standardWorkDurationSeedP50Days: expect.any(Number),
      t2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      t2RhythmTemplateP50Days: expect.any(Number),
      quantityProxy: expect.objectContaining({
        value: facts.standardFloorCount,
        unit: 'floor',
        source: 'project_scale_facts',
      }),
      selectionRule: expect.stringContaining('asset_backed_candidate_l1'),
    }))
    expect(standardFloorCycle?.values.duration_asset_calculation).toEqual(standardFloorMetadata.durationAssetCalculation)
    expect(Number(generated.durationAssetUtilizationSummary?.projectScaleQuantityProxyRowCount ?? 0)).toBeGreaterThan(0)

    const assetMappings = scheduleRows
      .map((row) => rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined)
      .filter(Boolean)
    expect(assetMappings.some((mapping) => mapping?.standardWorkDurationSeedStableCode === 'bored_cast_in_place_pile_foundation')).toBe(true)
    expect(assetMappings.some((mapping) => mapping?.standardWorkDurationSeedStableCode === 'foundation_pit_diaphragm_wall')).toBe(true)
    expect(assetMappings.some((mapping) => mapping?.standardWorkDurationSeedStableCode === 'masonry_infill_wall')).toBe(true)
    expect(assetMappings.some((mapping) => mapping?.t2RhythmTemplateId === 't2-residential-secondary-structure-fitout-interleave-v1')).toBe(true)
    const pileWork = rowByStableCode.get('RMP-02-03')
    const supportWork = rowByStableCode.get('RMP-02-02')
    for (const row of [pileWork, supportWork]) {
      expect(row).toBeTruthy()
      const calculation = rowMetadata(row!).durationAssetCalculation as Record<string, unknown>
      expect(calculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedProductivityP50PerDay: expect.any(Number),
        productivityDerivedDurationDays: row?.values.smart_reference_days,
        selectedDurationDays: row?.values.smart_reference_days,
        selectionRule: expect.stringContaining('asset_backed_candidate_l1'),
      }))
    }
    expect(scheduleRows
      .filter((row) => row.values.duration_contribution_mode === 'duration_bearing')
      .every((row) => {
        const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown> | undefined
        return Number(calculation?.selectedDurationDays) === Number(row.values.smart_reference_days)
          && typeof calculation?.selectionRule === 'string'
      })).toBe(true)

    const nonFinishStartZeroDependencies = scheduleRows.flatMap((row) => row.predecessorDependencies ?? [])
      .filter((dependency) => dependency.dependencyType !== 'FS' || Number(dependency.lagDays ?? 0) !== 0)
    expect(nonFinishStartZeroDependencies.length).toBeGreaterThan(0)
    const secondaryStructure = rowByStableCode.get('RMP-05-01-01')
    expect(secondaryStructure?.predecessorDependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        predecessorStableCode: 'RMP-04-01-02',
        dependencyType: 'SS',
        lagDays: expect.any(Number),
        intentCode: 'asset_backed_residential_trade_interleave',
      }),
    ]))
    const secondaryDependencyRuleEvidence = (secondaryStructure?.predecessorDependencies ?? [])
      .find((dependency) => dependency.intentCode === 'asset_backed_residential_trade_interleave')
      ?.dependencyRuleEvidence as Record<string, unknown> | undefined
    expect(secondaryDependencyRuleEvidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      version: 'v1.4.22.2',
      evidenceLevel: 'system_standard_dependency_l1',
      relationLayerKey: 'cross_item_workflow',
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
    }))
    expect(secondaryDependencyRuleEvidence?.layerStack).toEqual(expect.arrayContaining([
      'cross_item_workflow',
      'process_constraint',
    ]))
    expect(secondaryDependencyRuleEvidence).toEqual(expect.objectContaining({
      dependencyAssetConsumed: true,
      dependencyAssetType: 'cross_item_workflow',
      dependencyAssetStableCode: 'main_structure_to_masonry_infill',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'structure_masonry_infill',
      dependencyAssetBoundaryPolicy: expect.stringContaining('Structural and masonry internal processes are not duplicated'),
    }))
    expect(secondaryDependencyRuleEvidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB55032_2022',
      'GB50203_2011',
    ]))
    expect(secondaryDependencyRuleEvidence).toEqual(expect.objectContaining({
      dependencyTimingAssetConsumed: true,
      dependencyTimingSource: 'default_master_plan_activity_offset',
      dependencyTimingPredecessorT2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      dependencyTimingSuccessorT2RhythmTemplateId: 't2-residential-secondary-structure-fitout-interleave-v1',
      dependencyTimingSelectedLagDays: secondaryDependencyRuleEvidence?.lagDays,
      dependencyTimingMutationBoundary: 'preview_no_write_wizard_commit_transactional',
    }))
    expect(secondaryDependencyRuleEvidence?.createsProductionTaskDependency).toBe(true)
    const commissioning = rowByStableCode.get('RMP-12-01')
    expect(commissioning).toBeTruthy()
    expect(commissioning?.values.title).toBe('机电系统单机调试')
    expect(commissioning?.predecessorDependencies?.map((dependency) => dependency.predecessorStableCode).sort()).toEqual([
      'RMP-06-91',
      'RMP-06-92',
      'RMP-10-03',
    ])

    const firstStructureStart = Math.min(...towerStructureRows.map((row) => dateMs(row.values.planned_start_date)))
    const latestStructureEnd = Math.max(...towerStructureRows.map((row) => dateMs(row.values.planned_end_date)))
    const firstSecondaryStart = Math.min(...phaseRows('secondary_structure_fitout_roughin').map((row) => dateMs(row.values.planned_start_date)))
    const firstMepStart = Math.min(...phaseRows('mep_roughin').map((row) => dateMs(row.values.planned_start_date)))
    const firstInteriorStart = Math.min(...phaseRows('interior_fitout_terminal').map((row) => dateMs(row.values.planned_start_date)))
    const firstOutdoorStart = Math.min(...phaseRows('outdoor_municipal_landscape').map((row) => dateMs(row.values.planned_start_date)))
    const firstAcceptanceStart = Math.min(...phaseRows('acceptance_handover').map((row) => dateMs(row.values.planned_start_date)))

    expect(firstSecondaryStart).toBeGreaterThan(firstStructureStart)
    expect(firstMepStart).toBeGreaterThan(firstStructureStart)
    expect(firstInteriorStart).toBeGreaterThan(firstStructureStart)
    expect(firstSecondaryStart).toBeLessThan(latestStructureEnd)
    expect(firstMepStart).toBeLessThan(latestStructureEnd)
    expect(firstInteriorStart).toBeLessThan(latestStructureEnd)
    expect(firstOutdoorStart).toBeGreaterThan(firstStructureStart)
    expect(firstAcceptanceStart).toBeGreaterThan(firstOutdoorStart)
    expect(scheduleRows.every((row) => row.values.source_type === 'asset_backed_default_master_plan')).toBe(true)
    expect(scheduleRows.every((row) => [
      'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
      'standard_work_duration_seed',
    ].includes(String(row.values.duration_calibration_source ?? '')))).toBe(true)
    const activityScheduleRows = scheduleRows.filter((row) => row.values.is_wbs_summary !== true)
    expect(activityScheduleRows.every((row) => row.values.duration_evidence_source === 'system_standard_default_master_plan')).toBe(true)
    expect(summaryRows.every((row) => (
      row.values.duration_evidence_source === 'child_plan_window_rollup'
        && row.values.duration_contribution_mode === 'record_only'
        && (row.predecessorDependencies ?? []).length === 0
    ))).toBe(true)
    expect(scheduleRows.every((row) => row.values.duration_evidence_maturity === 'L1')).toBe(true)
    expect(scheduleRows.every((row) => row.values.duration_review_required === false)).toBe(true)
    expect(scheduleRows.every((row) => !row.values.duration_review_gate)).toBe(true)
    expect(scheduleRows
      .filter((row) => row.values.duration_contribution_mode === 'duration_bearing')
      .every((row) => Number(row.values.smart_reference_days) > 0)).toBe(true)
    expect(activityScheduleRows.every((row) => rowDurationSuggestion(row).planDurationTruthSource === 'system_standard_executable_master_plan')).toBe(true)
    expect(activityScheduleRows.every((row) => {
      const suggestion = rowDurationSuggestion(row)
      const availability = suggestion.factorAvailability as Record<string, unknown> | undefined
      const mapping = rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined
      const t2RhythmRequired = mapping?.t2RhythmApplicability !== 'not_applicable_one_off_activity'
      return availability?.standard_work_duration_seed === true
        && availability?.t2_division_rhythm_template_seed === t2RhythmRequired
        && availability?.system_schedule_rules === true
        && availability?.external_real_plan_evidence === false
    })).toBe(true)
    expect(activityScheduleRows.every((row) => {
      const suggestion = rowDurationSuggestion(row)
      return Array.isArray(suggestion.dataUpgradeBlockedBy)
        && !suggestion.dataUpgradeBlockedBy.includes('GENERATION_DEPTH_TRUST_REVIEW_REQUIRED')
    })).toBe(true)
    expect(generated.governanceWarnings?.some((warning) => warning.code === 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED')).toBe(false)
  }, 60_000)

  it('generates bounded field-oriented default master plans for building and campus business types', async () => {
    expect(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => probe.businessType).sort()).toEqual(
      [...PROJECT_ORGANIZATION_BUSINESS_TYPES].sort(),
    )

    const businessTypes = new Set(['general_civil', 'hotel', 'hospital', 'school', 'industrial', 'data_center'])
    const failures = await collectDefaultMasterPlanProbeFailures(
      PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.filter((probe) => businessTypes.has(probe.businessType)),
    )

    expect(failures).toEqual([])
  }, 240_000)

  it('consumes existing campus specialty assets to satisfy the school executable master-plan floor', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const scheduleCodes = scheduleRows.map(rowCode)
    const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, any>
    const expectedCampusCodes = ['CMP-02-01-03', 'CMP-03-01-02', 'CMP-04-01-01']
    const expectedCampusPhaseByCode: Record<string, string> = {
      'CMP-02-01-03': 'mep_roughin',
      'CMP-03-01-02': 'outdoor_municipal_landscape',
      'CMP-04-01-01': 'acceptance_handover',
    }
    const campusDiagnostics = expectedCampusCodes.map((code) => {
      const row = generated.rows.find((candidate) => rowCode(candidate) === code)
      const metadata = row ? rowMetadata(row) : {}
      const eligibility = metadata.masterControlPromotionEligibility as Record<string, unknown> | undefined
      const durationMapping = metadata.durationAssetMapping as Record<string, unknown> | undefined
      const suggestion = row ? rowDurationSuggestion(row) : {}
      const reasonParams = (suggestion.businessReasonParams ?? {}) as Record<string, unknown>
      const descendantRollup = (reasonParams.descendantRollup ?? {}) as Record<string, unknown>
      return {
        code,
        exists: Boolean(row),
        projectionMode: row?.rowProjectionMode ?? null,
        executionPhase: row?.values.execution_phase ?? metadata.executionPhase ?? null,
        templateGroup: row?.values.template_group ?? metadata.templateGroup ?? null,
        promotionEligible: eligibility?.eligible ?? null,
        promotionReasonCodes: eligibility?.reasonCodes ?? [],
        durationSeedStableCode: durationMapping?.standardWorkDurationSeedStableCode ?? null,
        durationBusinessReasonCode: suggestion.businessReasonCode ?? null,
        durationSeedStableCodes: descendantRollup.durationSeedStableCodes ?? [],
        childProcessStableCodes: descendantRollup.childProcessStableCodes ?? [],
        factorAvailability: suggestion.factorAvailability ?? {},
      }
    })

    expect(campusDiagnostics).toEqual(expectedCampusCodes.map((code) => expect.objectContaining({
      code,
      exists: true,
      projectionMode: expect.stringMatching(/schedule_row|linked_projection/),
      executionPhase: expectedCampusPhaseByCode[code],
      promotionEligible: true,
      durationBusinessReasonCode: expect.stringMatching(/MANAGED_FRONTIER_DESCENDANT_ROLLUP|ITEM_PACK_DESCENDANT_ROLLUP/),
      factorAvailability: expect.objectContaining({ standard_work_duration_seed: true }),
    })))
    expect(campusDiagnostics.every((diagnostic) => (
      Array.isArray(diagnostic.durationSeedStableCodes)
      && diagnostic.durationSeedStableCodes.length > 0
    ))).toBe(true)
    expect(Number(assembly.promotionCandidateCountsByTemplateGroup?.campus ?? 0)).toBeGreaterThanOrEqual(3)
    expect(scheduleCodes).toEqual(expect.arrayContaining([
      'CMP-02-01-03',
      'CMP-03-01-02',
      'CMP-04-01-01',
    ]))
    expect(scheduleCodes.some((code) => code.startsWith('CDF-'))).toBe(false)
    expect(assembly).toEqual(expect.objectContaining({
      status: 'executable_default_master_plan_ready',
      readyForWizardCommit: true,
      businessType: 'school',
      operationalRowFloor: 60,
    }))
    const executableScheduleRows = scheduleRows.filter((row) => row.values.is_executable === true)
    const recordOnlyScheduleRows = scheduleRows.filter((row) => row.values.duration_contribution_mode === 'record_only')
    expect(executableScheduleRows.every((row) => (
      row.values.is_wbs_summary === false
      && row.values.wbs_node_type === 'process'
      && row.values.category_type === 'process'
    ))).toBe(true)
    expect(recordOnlyScheduleRows.every((row) => (
      row.values.is_wbs_summary === false
      && row.values.is_executable === true
      && row.values.wbs_node_type === 'process'
      && row.values.category_type === 'process'
    ))).toBe(true)
    expect(scheduleRows.length).toBeGreaterThanOrEqual(60)
  }, 120_000)

  it('builds executable default master plans from system duration assets for all 11 business types', async () => {
    expect(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => probe.businessType).sort()).toEqual(
      [...PROJECT_ORGANIZATION_BUSINESS_TYPES].sort(),
    )

    const terminalCodeByBusinessType: Record<string, string> = {
      hotel: 'BTMP-HTL-06',
      hospital: 'BTMP-HSP-07',
      school: 'BTMP-SCH-06',
      industrial: 'BTMP-IND-06',
      data_center: 'BTMP-DTC-07',
      transportation_hub: 'BTMP-TRH-06',
      sports_culture: 'BTMP-SPC-06',
      tod_upper_cover: 'BTMP-TOD-06',
      renovation: 'BTMP-RNV-06',
      modular_building: 'BTMP-MOD-10',
    }
    const handoverTitleByBusinessType: Record<string, string> = {
      hotel: '建设单位及酒店运营方移交与保修启动',
      hospital: '建设单位及医院使用单位移交与保修启动',
      school: '建设单位及学校使用单位移交与保修启动',
      industrial: '建设单位及生产运营单位移交与保修启动',
      data_center: '建设单位及数据中心运维单位移交与保修启动',
      transportation_hub: '建设单位及枢纽运营单位移交与保修启动',
      sports_culture: '建设单位及场馆运营单位移交与保修启动',
      tod_upper_cover: '建设单位、轨交及物业运营单位移交与保修启动',
      renovation: '建设单位及原运营使用单位移交与保修启动',
      modular_building: '建设单位及使用单位移交与保修启动',
    }
    const longLeadSuccessorsByBusinessType: Record<string, string[]> = {
      hotel: ['BTMP-HTL-02', 'BTMP-HTL-03', 'BTMP-HTL-04'],
      hospital: ['BTMP-HSP-03', 'BTMP-HSP-04', 'BTMP-HSP-05'],
      school: ['BTMP-SCH-03', 'BTMP-SCH-04'],
      industrial: ['BTMP-IND-01', 'BTMP-IND-04'],
      data_center: ['BTMP-DTC-03', 'BTMP-DTC-04'],
      transportation_hub: ['BTMP-TRH-01', 'BTMP-TRH-03'],
      sports_culture: ['BTMP-SPC-01', 'BTMP-SPC-03'],
      tod_upper_cover: ['BTMP-TOD-05'],
      renovation: ['BTMP-RNV-04'],
    }
    const businessTypePrefixByBusinessType: Record<string, string> = {
      hotel: 'HTL',
      hospital: 'HSP',
      school: 'SCH',
      industrial: 'IND',
      data_center: 'DTC',
      transportation_hub: 'TRH',
      sports_culture: 'SPC',
      tod_upper_cover: 'TOD',
      renovation: 'RNV',
    }
    const readinessFailures: Array<Record<string, unknown>> = []
    for (const probe of PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES) {
      const generated = await generateDefaultMasterPlanForProbe(probe)
      const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
      const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, any> | undefined
      const [minimumRowCount, maximumRowCount] = generated.masterPlanProfile?.rowCountRange ?? [0, 0]

      if (!assembly
        || assembly.status !== 'executable_default_master_plan_ready'
        || assembly.readyForWizardCommit !== true) {
        readinessFailures.push({
          businessType: probe.businessType,
          status: assembly?.status ?? null,
          scheduleRowCount: scheduleRows.length,
          minimumScheduleRowCount: assembly?.minimumScheduleRowCount ?? minimumRowCount,
          maximumScheduleRowCount: assembly?.maximumScheduleRowCount ?? maximumRowCount,
          availableScheduleRowCount: assembly?.availableScheduleRowCount ?? null,
          readinessReasonCodes: assembly?.readinessReasonCodes ?? ['assembly_summary_missing'],
          promotionCandidateMissingDurationAuthorityReasonCounts:
            assembly?.promotionCandidateMissingDurationAuthorityReasonCounts ?? {},
        })
        continue
      }

      expect(assembly, `${probe.businessType} assembly summary`).toEqual(expect.objectContaining({
        status: 'executable_default_master_plan_ready',
        businessType: probe.businessType,
        assetAuthority: 'system_standard_seed',
        calibrationPolicy: 'optional_runtime_overlay',
        scheduleRowCount: scheduleRows.length,
        readyForWizardCommit: true,
      }))
      expect(scheduleRows.length, `${probe.businessType} schedule row floor`)
        .toBeGreaterThanOrEqual(Number(assembly?.minimumScheduleRowCount ?? minimumRowCount))
      expect(scheduleRows.length, `${probe.businessType} governed wizard master-plan floor`).toBeGreaterThanOrEqual(60)
      expect(scheduleRows.length, `${probe.businessType} schedule row ceiling`).toBeLessThanOrEqual(maximumRowCount)
      expect(Number(assembly?.operationalRowFloor ?? 0), `${probe.businessType} operational floor`).toBeGreaterThanOrEqual(60)
      expect(assembly?.assetInventoryExhausted, `${probe.businessType} governed control inventory`).toBe(false)
      expect(Number(assembly?.assetInventoryShortfallRowCount ?? 0), `${probe.businessType} governed control inventory shortfall`).toBe(0)
      if (probe.businessType === 'general_civil') {
        expect(Number(assembly?.promotedLinkedProjectionRowCount ?? -1), 'residential uses its curated asset-backed field control profile')
          .toBe(0)
      } else {
        expect(Number(assembly?.promotedLinkedProjectionRowCount ?? 0), `${probe.businessType} consumes governed catalog controls beyond the coarse profile`)
          .toBeGreaterThan(0)
        expect(scheduleRows.every((row) => {
          const metadata = rowMetadata(row)
          const eligibility = metadata.masterControlPromotionEligibility as Record<string, unknown> | undefined
          return Boolean(metadata.businessTypeMasterPlan) || eligibility?.eligible === true
        }), `${probe.businessType} exposes only authored profiles or governed master-control projections`)
          .toBe(true)
        const rowById = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
        const filing = scheduleRows.find((row) => row.values.contractual_closeout_role === 'completion_filing')
        const propertyHandover = scheduleRows.find((row) => row.values.contractual_closeout_role === 'property_handover')
        const terminalCode = terminalCodeByBusinessType[probe.businessType]
        expect(filing, `${probe.businessType} completion filing`).toBeTruthy()
        expect(propertyHandover, `${probe.businessType} property handover`).toBeTruthy()
        expect(propertyHandover?.values.title, `${probe.businessType} business-facing handover title`)
          .toBe(handoverTitleByBusinessType[probe.businessType])
        expect(scheduleRows.filter((row) => (
          row.values.contractual_closeout_role !== 'property_handover'
          && /物业业主移交保修启动/.test(String(row.values.title ?? ''))
        )), `${probe.businessType} retired parallel property-handover milestones`).toEqual([])
        expect(filing?.values.contractual_terminal_control_code, `${probe.businessType} terminal contract`)
          .toBe(terminalCode)
        expect((filing?.predecessorDependencies ?? []).some((dependency) => (
          rowCode(rowById.get(dependency.clientRowId) as any) === terminalCode
        )), `${probe.businessType} terminal to filing`).toBe(true)
        expect((propertyHandover?.predecessorDependencies ?? []).some((dependency) => (
          dependency.clientRowId === filing?.clientRowId
        )), `${probe.businessType} filing to property handover`).toBe(true)
        const latestPhysicalEnd = Math.max(...scheduleRows
          .filter((row) => row.values.duration_contribution_mode === 'duration_bearing')
          .filter((row) => row.values.plan_item_kind === 'work_task')
          .map((row) => dateMs(row.values.planned_end_date)))
        expect(dateMs(filing?.values.planned_start_date), `${probe.businessType} filing after all physical work`)
          .toBeGreaterThan(latestPhysicalEnd)
        expect((filing?.predecessorDependencies ?? []).filter((dependency) => (
          dependency.intentCode === 'executable_default_master_plan_contractual_completion_convergence'
        )).length, `${probe.businessType} filing completion frontier stays phase-bounded`)
          .toBeLessThanOrEqual(Number(assembly?.coveredExecutionPhases?.length ?? 12))
        const authoredTradeControls = scheduleRows.filter((row) => {
          const businessProfile = rowMetadata(row).businessTypeMasterPlan as Record<string, unknown> | undefined
          return businessProfile?.source === 'managed_frontier_default_master_plan'
            && row.values.plan_item_kind === 'work_task'
            && row.values.duration_contribution_mode === 'duration_bearing'
        })
        expect(Math.max(...authoredTradeControls.map((row) => row.predecessorDependencies?.length ?? 0)), `${probe.businessType} authored control fan-in`)
          .toBeLessThanOrEqual(8)
        expect(authoredTradeControls.some((row) => (row.predecessorDependencies ?? []).some((dependency) => (
          dependency.intentCode === 'executable_default_master_plan_physical_handoff_convergence'
        ))), `${probe.businessType} does not absorb promoted terminal streams into an intermediate trade`).toBe(false)
        if (probe.businessType !== 'modular_building') {
          const profilePrefix = businessTypePrefixByBusinessType[probe.businessType]
          const designRelease = scheduleRows.find((row) => rowCode(row) === `BTMP-${profilePrefix}-P01`)
          const longLeadDelivery = scheduleRows.find((row) => rowCode(row) === `BTMP-${profilePrefix}-P02`)
          expect(designRelease, `${probe.businessType} specialist design/procurement release`).toBeTruthy()
          expect(longLeadDelivery, `${probe.businessType} long-lead manufacture/delivery`).toBeTruthy()
          expect((longLeadDelivery?.predecessorDependencies ?? []).some((dependency) => (
            dependency.clientRowId === designRelease?.clientRowId
            && dependency.dependencyType === 'FS'
            && Number(dependency.lagDays ?? 0) === 0
          )), `${probe.businessType} design release to long-lead delivery`).toBe(true)
          for (const successorCode of longLeadSuccessorsByBusinessType[probe.businessType] ?? []) {
            const successor = scheduleRows.find((row) => rowCode(row) === successorCode)
            expect(successor, `${probe.businessType}:${successorCode}`).toBeTruthy()
            expect((successor?.predecessorDependencies ?? []).some((dependency) => (
              dependency.clientRowId === longLeadDelivery?.clientRowId
              && dependency.dependencyType === 'FS'
              && Number(dependency.lagDays ?? 0) === 0
            )), `${probe.businessType}:${successorCode} long-lead release`).toBe(true)
          }
        }
      }
      expect(Number(assembly?.executableScheduleRowCount ?? 0), `${probe.businessType} executable control rows`)
        .toBeGreaterThan(0)
      expect(Number(assembly?.visibleDependencyCoverageRate ?? 0), `${probe.businessType} dependency coverage`)
        .toBeGreaterThanOrEqual(0.9)

      const durationRows = scheduleRows.filter((row) => row.values.duration_contribution_mode === 'duration_bearing')
      expect(durationRows.length, `${probe.businessType} duration-bearing rows`).toBeGreaterThan(0)
      const durationAssetSemanticMismatches = durationRows
        .filter((row) => !isExecutableDurationAssetSemanticallyCompatible(row))
        .map((row) => ({
          code: rowCode(row),
          title: row.values.title,
          seed: (rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined)
            ?.standardWorkDurationSeedStableCode,
        }))
      expect(durationAssetSemanticMismatches, `${probe.businessType} duration asset semantic compatibility`).toEqual([])
      const fieldExecutionRows = durationRows.filter((row) => row.values.plan_item_kind === 'work_task')
      const scheduleParentIds = new Set(scheduleRows.map((row) => row.parentClientRowId).filter(Boolean))
      const fieldExecutionLeafRows = fieldExecutionRows.filter((row) => !scheduleParentIds.has(row.clientRowId))
      expect(fieldExecutionLeafRows.length, `${probe.businessType} field execution rows`).toBeGreaterThan(0)
      expect(fieldExecutionLeafRows.every((row) => (
        row.values.is_executable === true && row.values.is_wbs_summary === false
      )), `${probe.businessType} field rows must be executable rather than candidate summaries`).toBe(true)
      expect(durationRows.every((row) => row.values.duration_authority === 'system_standard_seed')).toBe(true)
      expect(durationRows.every((row) => row.values.duration_review_required === false)).toBe(true)
      expect(durationRows.every((row) => !row.values.duration_review_gate)).toBe(true)
      expect(durationRows.every((row) => {
        const suggestion = rowDurationSuggestion(row)
        const dataUpgradeBlockedBy = Array.isArray(suggestion.dataUpgradeBlockedBy)
          ? suggestion.dataUpgradeBlockedBy
          : []
        const dataUpgradePath = Array.isArray(suggestion.dataUpgradePath)
          ? suggestion.dataUpgradePath
          : []
        return !dataUpgradeBlockedBy.includes('GENERATION_DEPTH_TRUST_REVIEW_REQUIRED')
          && dataUpgradePath.includes('optional_runtime_calibration')
          && !JSON.stringify(suggestion).includes('project_manager_review')
      }), `${probe.businessType} cold-start generation must not depend on runtime PM approval evidence`).toBe(true)
      expect(scheduleRows.every((row) => (
        (rowMetadata(row).drilldownGenerationLineage as Record<string, unknown> | undefined)?.level === 'master_control'
      )), `${probe.businessType} preserves an independent master-control drilldown lineage`).toBe(true)
      expect(durationRows.every((row) => {
        const suggestion = rowDurationSuggestion(row)
        const p20 = Number(suggestion.riskP20DurationDays)
        const p50 = Number(suggestion.riskP50DurationDays)
        const p80 = Number(suggestion.riskP80DurationDays)
        return p20 >= Math.ceil(p50 * 0.65) && p80 >= Math.ceil(p50 * 1.1)
      })).toBe(true)
      const receipts = (generated as any).durationAssetConsumptionReceipts as Array<Record<string, unknown>> | undefined
      const receiptSummary = (generated as any).durationAssetConsumptionSummary as Record<string, unknown> | undefined
      const legacySummary = generated.durationAssetUtilizationSummary as Record<string, unknown> | undefined
      const effectiveReceipts = receipts?.filter((receipt) => receipt.status === 'effective_applied') ?? []
      expect(receipts?.length ?? 0, `${probe.businessType} consumption receipts`).toBeGreaterThan(0)
      expect(effectiveReceipts.some((receipt) => (
        Array.isArray(receipt.changedFields) && receipt.changedFields.includes('duration')
      )), `${probe.businessType} effective duration receipt`).toBe(true)
      expect(effectiveReceipts.some((receipt) => (
        Array.isArray(receipt.changedFields) && receipt.changedFields.includes('dependency')
      )), `${probe.businessType} effective dependency receipt`).toBe(true)
      expect(receiptSummary).toEqual(expect.objectContaining({
        totalCount: receipts?.length,
        effectiveAppliedCount: effectiveReceipts.length,
      }))
      expect(legacySummary?.assetConsumptionSummary).toEqual(receiptSummary)
      expect(legacySummary?.effectiveAppliedAssetReceiptCount).toBe(effectiveReceipts.length)
      expect(generated.governanceWarnings?.some((warning) => (
        warning.code === 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'
      ))).toBe(false)
    }
    expect(readinessFailures, 'all business types must satisfy the same executable master-plan contract').toEqual([])
  }, 600_000)

  it('keeps the stadium subtype above the governed 60-row executable master-plan floor', async () => {
    const probe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((item) => (
      item.businessType === 'sports_culture'
    ))!
    const stadiumFacts = {
      businessSubtype: 'sports_stadium',
      projectTypeCode: 'sports_stadium',
      functionalUsageCodes: ['stadium'],
      functionalCategoryCodes: ['sports_venue'],
      specialRoomTypeCodes: ['stadium_bowl', 'competition_field'],
      physicalZoneTypeCodes: ['stadium_bowl', 'large_span_roof', 'outdoor_site'],
      totalAreaM2: 80_000,
      buildingCount: 1,
      standardFloorCount: 4,
      highestBuildingFloorCount: 6,
      basementLevelCount: 1,
      foundationDepthM: 4,
    }
    const generated = await generateDefaultMasterPlanForProbe(probe, {
      projectFactOverrides: stadiumFacts,
      scopeOverrides: {
        business_subtype: stadiumFacts.businessSubtype,
        project_type_code: stadiumFacts.projectTypeCode,
        functionalUsageCodes: stadiumFacts.functionalUsageCodes,
        functionalCategoryCodes: stadiumFacts.functionalCategoryCodes,
        specialRoomTypeCodes: stadiumFacts.specialRoomTypeCodes,
        physicalZoneTypeCodes: stadiumFacts.physicalZoneTypeCodes,
      },
    })
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, any>
    const stadiumControlCodes = [
      'BTMP-SPC-S01',
      'BTMP-SPC-S02',
      'BTMP-SPC-S03',
      'BTMP-SPC-S04',
      'BTMP-SPC-S05',
      'BTMP-SPC-S06',
      'BTMP-SPC-S07',
      'BTMP-SPC-S08',
      'BTMP-SPC-S09',
      'BTMP-SPC-S10',
      'BTMP-SPC-S11',
      'BTMP-SPC-S12',
      'BTMP-SPC-S13',
      'BTMP-SPC-S14',
    ]
    const stadiumControlRows = scheduleRows.filter((row) => stadiumControlCodes.includes(rowCode(row)))

    expect(scheduleRows.length).toBeGreaterThanOrEqual(Number(assembly.recommendedMinimumScheduleRowCount))
    expect(stadiumControlRows.map(rowCode).sort()).toEqual([...stadiumControlCodes].sort())
    for (const row of stadiumControlRows) {
      const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
      const businessTypeMasterPlan = rowMetadata(row).businessTypeMasterPlan as Record<string, unknown>
      expect(String(row.values.title ?? '')).not.toBe('')
      expect(row.values.is_executable).toBe(true)
      expect(row.values.duration_contribution_mode).toBe('duration_bearing')
      expect(calculation.standardWorkDurationSeedStableCode).toBe('expert_domain_sports_culture')
      expect(calculation.standardWorkDurationSeedCoverageMode).toBeTruthy()
      expect(calculation.standardWorkDurationSeedScaleBasis).toBeTruthy()
      expect(Number(calculation.standardWorkDurationSeedProductivityP50PerDay ?? 0)).toBeGreaterThan(0)
      expect(Number(calculation.productivityDerivedDurationDays ?? 0)).toBeGreaterThan(0)
      expect(calculation.t2RhythmTemplateId).toMatch(/^t2-sports-culture-/)
      expect(businessTypeMasterPlan).toEqual(expect.objectContaining({
        durationBaselineAuthority: 'project_organization_variant',
        projectOrganizationVariantCode: 'sports_culture_stadium',
      }))
    }
    expect(assembly).toEqual(expect.objectContaining({
      status: 'executable_default_master_plan_ready',
      businessType: 'sports_culture',
      operationalRowFloor: 60,
      assetInventoryExhausted: false,
      assetInventoryShortfallRowCount: 0,
      readyForWizardCommit: true,
    }))
  }, 180_000)

  it('separates hospital and data-center final handover from commissioning with an FS0 release', async () => {
    const probes = new Map(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => [probe.businessType, probe]))
    const cases = [
      { businessType: 'hospital', commissioningCode: 'BTMP-HSP-06', terminalCode: 'BTMP-HSP-07' },
      { businessType: 'data_center', commissioningCode: 'BTMP-DTC-06', terminalCode: 'BTMP-DTC-07' },
    ] as const

    for (const testCase of cases) {
      const generated = await generateDefaultMasterPlanForProbe(probes.get(testCase.businessType)!)
      const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
      const rowByCode = new Map(scheduleRows.map((row) => [rowCode(row), row]))
      const commissioning = rowByCode.get(testCase.commissioningCode)
      const terminal = rowByCode.get(testCase.terminalCode)

      expect(commissioning, `${testCase.businessType} commissioning`).toBeTruthy()
      expect(terminal, `${testCase.businessType} final handover`).toBeTruthy()
      expect(rowByCode.has('BTMP-BASE-13'), `${testCase.businessType} generic terminal must be overridden`).toBe(false)
      expect(terminal?.values.execution_phase).toBe('acceptance_handover')
      expect((terminal?.predecessorDependencies ?? []).some((dependency) => (
        dependency.clientRowId === commissioning?.clientRowId
        && dependency.dependencyType === 'FS'
        && Number(dependency.lagDays ?? 0) === 0
      )), `${testCase.businessType} commissioning to final handover FS0`).toBe(true)
      expect(dateMs(terminal?.values.planned_start_date)).toBeGreaterThan(
        dateMs(commissioning?.values.planned_end_date),
      )
    }
  }, 180_000)

  it('keeps promoted venue control windows aligned with the final governed reference duration', async () => {
    const sportsProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => (
      probe.businessType === 'sports_culture'
    ))
    expect(sportsProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(sportsProbe!, {
      constructionCalendar: { basis: 'calendar_day', windows: [] },
      projectFactOverrides: {
        totalAreaM2: 80_000,
        buildingCount: 1,
        standardFloorCount: 4,
        highestBuildingFloorCount: 6,
        basementLevelCount: 1,
        foundationDepthM: 4,
      },
      scopeOverrides: {
        total_area_m2: 80_000,
        building_count: 1,
        standard_floor_count: 4,
        highest_building_floor_count: 6,
        basement_level_count: 1,
        foundation_depth_m: 4,
      },
    })
    const concreteControl = generated.rows.find((row) => (
      row.rowProjectionMode === 'schedule_row'
      && rowCode(row) === '02-01'
    ))

    expect(concreteControl).toBeTruthy()
    expect(Number(concreteControl?.values.smart_reference_days)).toBeGreaterThanOrEqual(11)
    expect(durationDaysOf(concreteControl!)).toBe(Number(concreteControl?.values.smart_reference_days))
  }, 120_000)

  it('builds asset-backed and subtype-distinct office and mixed-use civil master plans', async () => {
    const baseProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')!
    const cases = [
      {
        subtype: 'civil_office_commercial',
        functionalUsageCodes: ['office', 'commercial'],
        functionalCategoryCodes: ['office_commercial'],
        specialRoomTypeCodes: ['office_floor', 'commercial_public_area'],
        expectedTitle: /办公|商业|幕墙|公区/,
      },
      {
        subtype: 'civil_complex',
        functionalUsageCodes: ['residential', 'office', 'commercial'],
        functionalCategoryCodes: ['mixed_use_complex'],
        specialRoomTypeCodes: ['podium', 'mixed_use_interface'],
        expectedTitle: /多业态|综合体|裙房|分期/,
      },
    ] as const
    const titleSignatures = new Set<string>()

    for (const testCase of cases) {
      const generated = await generateDefaultMasterPlanForProbe(baseProbe, {
        projectFactOverrides: {
          businessSubtype: testCase.subtype,
          projectTypeCode: testCase.subtype,
          functionalUsageCodes: testCase.functionalUsageCodes,
          functionalCategoryCodes: testCase.functionalCategoryCodes,
          specialRoomTypeCodes: testCase.specialRoomTypeCodes,
        },
        scopeOverrides: {
          business_subtype: testCase.subtype,
          project_type_code: testCase.subtype,
          functional_usage_codes: testCase.functionalUsageCodes,
          functional_category_codes: testCase.functionalCategoryCodes,
          special_room_type_codes: testCase.specialRoomTypeCodes,
        },
      })
      const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
      const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, any>
      const durationSummary = (generated as any).durationAssetUtilizationSummary as Record<string, any>
      const titleSignature = scheduleRows.map((row) => String(row.values.title ?? '')).join('|')

      expect(assembly.readyForWizardCommit, `${testCase.subtype}:${JSON.stringify({
        readinessReasonCodes: assembly.readinessReasonCodes,
        scheduleRowCount: assembly.scheduleRowCount,
        visibleDependencyCoverageRate: assembly.visibleDependencyCoverageRate,
        networkComponentCount: assembly.networkComponentCount,
        networkRootCount: assembly.networkRootCount,
        networkSinkCount: assembly.networkSinkCount,
      })}`).toBe(true)
      expect(assembly.status, testCase.subtype).toBe('executable_default_master_plan_ready')
      expect(scheduleRows.length, testCase.subtype).toBeGreaterThanOrEqual(Number(assembly.operationalRowFloor))
      expect(assembly.durationAssetSemanticMismatchCount, testCase.subtype).toBe(0)
      expect(durationSummary.standardWorkDurationSeedRowCount, testCase.subtype)
        .toBe(Number(durationSummary.durationBearingScheduleRowCount))
      expect(titleSignature, testCase.subtype).toMatch(testCase.expectedTitle)
      titleSignatures.add(titleSignature)
    }

    expect(titleSignatures.size).toBe(cases.length)
  }, 240_000)

  it('builds asset-backed and subtype-distinct seismic, energy and heritage renovation master plans', async () => {
    const baseProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'renovation')!
    const cases = [
      {
        subtype: 'renovation_seismic',
        functionalCategoryCodes: ['seismic_retrofit'],
        specialRoomTypeCodes: ['structural_reinforcement'],
        expectedTitle: /抗震|结构加固|承载复测/,
        expectedT2RhythmTemplateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1',
        expectedLanePrefix: 'seismic_reinforcement_zone_lane_',
        expectedLaneTotal: 3,
        expectedControlCodes: ['BTMP-RNV-S01', 'BTMP-RNV-S02', 'BTMP-RNV-S03'],
        expectedFsEdges: [
          ['BTMP-RNV-S02', 'BTMP-RNV-03'],
          ['BTMP-RNV-03', 'BTMP-RNV-S03'],
          ['BTMP-RNV-S03', 'BTMP-RNV-04'],
        ],
        expectedTimedEdges: [
          { predecessorCode: 'BTMP-RNV-P02', successorCode: 'BTMP-RNV-S02', dependencyType: 'SS', lagDays: 45 },
          { predecessorCode: 'BTMP-RNV-P02', successorCode: 'BTMP-RNV-03', dependencyType: 'FF', lagDays: 0 },
        ],
      },
      {
        subtype: 'renovation_energy',
        functionalCategoryCodes: ['energy_retrofit'],
        specialRoomTypeCodes: ['envelope_energy_retrofit'],
        expectedTitle: /节能|保温|外窗|能耗/,
        expectedT2RhythmTemplateId: 't2-renovation-energy-envelope-mep-verification-rhythm-v1',
        expectedLanePrefix: 'energy_retrofit_zone_lane_',
        expectedLaneTotal: 3,
        expectedControlCodes: ['BTMP-RNV-E01'],
        expectedFsEdges: [
          ['BTMP-RNV-E01', 'BTMP-RNV-05'],
        ],
        expectedTimedEdges: [
          { predecessorCode: 'BTMP-RNV-P02', successorCode: 'BTMP-RNV-03', dependencyType: 'SS', lagDays: 90 },
          { predecessorCode: 'BTMP-RNV-P02', successorCode: 'BTMP-RNV-E01', dependencyType: 'SS', lagDays: 90 },
          { predecessorCode: 'BTMP-RNV-P02', successorCode: 'BTMP-RNV-04', dependencyType: 'SS', lagDays: 90 },
        ],
      },
      {
        subtype: 'renovation_heritage',
        functionalCategoryCodes: ['heritage_conservation'],
        specialRoomTypeCodes: ['heritage_protection'],
        expectedTitle: /文保|传统材料|可逆|彩绘/,
        expectedT2RhythmTemplateId: 't2-renovation-heritage-craft-minimal-intervention-rhythm-v1',
        expectedLanePrefix: 'heritage_conservation_lane_',
        expectedLaneTotal: 4,
        expectedControlCodes: ['BTMP-RNV-H01', 'BTMP-RNV-H02'],
        expectedFsEdges: [
          ['BTMP-RNV-H01', 'BTMP-RNV-03'],
          ['BTMP-RNV-03', 'BTMP-RNV-H02'],
          ['BTMP-RNV-H02', 'BTMP-RNV-04'],
        ],
        expectedTimedEdges: [
          { predecessorCode: 'BTMP-RNV-P02', successorCode: 'BTMP-RNV-H01', dependencyType: 'SS', lagDays: 30 },
          { predecessorCode: 'BTMP-RNV-P02', successorCode: 'BTMP-RNV-03', dependencyType: 'FF', lagDays: 0 },
        ],
      },
    ] as const
    const titleSignatures = new Set<string>()

    for (const testCase of cases) {
      const generated = await generateDefaultMasterPlanForProbe(baseProbe, {
        projectFactOverrides: {
          businessSubtype: testCase.subtype,
          projectTypeCode: testCase.subtype,
          functionalUsageCodes: ['existing_building'],
          functionalCategoryCodes: testCase.functionalCategoryCodes,
          specialRoomTypeCodes: testCase.specialRoomTypeCodes,
        },
        scopeOverrides: {
          business_subtype: testCase.subtype,
          project_type_code: testCase.subtype,
          functional_usage_codes: ['existing_building'],
          functional_category_codes: testCase.functionalCategoryCodes,
          special_room_type_codes: testCase.specialRoomTypeCodes,
        },
      })
      const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
      const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, any>
      const titleSignature = scheduleRows.map((row) => String(row.values.title ?? '')).join('|')
      const renovationZoneLanes = [...new Set(generated.scopeCombos
        .filter((scope) => scope.organization_lane_role === 'renovation_zone_lane')
        .map((scope) => String(scope.organization_lane ?? '')))]
      const renovationT2TemplateIds = [...new Set(scheduleRows.flatMap((row) => {
        const metadata = rowMetadata(row)
        const mapping = (metadata.durationAssetMapping ?? {}) as Record<string, unknown>
        const calculation = (metadata.durationAssetCalculation ?? {}) as Record<string, unknown>
        const templateId = String(mapping.t2RhythmTemplateId ?? calculation.t2RhythmTemplateId ?? '')
        return templateId.startsWith('t2-renovation-') ? [templateId] : []
      }))]

      expect(assembly.readyForWizardCommit, `${testCase.subtype}:${JSON.stringify({
        readinessReasonCodes: assembly.readinessReasonCodes,
        scheduleRowCount: assembly.scheduleRowCount,
        visibleDependencyCoverageRate: assembly.visibleDependencyCoverageRate,
        networkComponentCount: assembly.networkComponentCount,
        networkRootCount: assembly.networkRootCount,
        networkSinkCount: assembly.networkSinkCount,
      })}`).toBe(true)
      expect(assembly.status, testCase.subtype).toBe('executable_default_master_plan_ready')
      expect(scheduleRows.length, testCase.subtype).toBeGreaterThanOrEqual(Number(assembly.operationalRowFloor))
      expect(assembly.durationAssetSemanticMismatchCount, testCase.subtype).toBe(0)
      expect(renovationZoneLanes, testCase.subtype).toHaveLength(testCase.expectedLaneTotal)
      expect(renovationZoneLanes, testCase.subtype).toEqual(expect.arrayContaining(
        Array.from({ length: testCase.expectedLaneTotal }, (_, index) => (
          `${testCase.expectedLanePrefix}${index + 1}`
        )),
      ))
      expect(renovationT2TemplateIds, testCase.subtype).toEqual([testCase.expectedT2RhythmTemplateId])
      expect(titleSignature, testCase.subtype).toMatch(testCase.expectedTitle)
      expect(scheduleRows.map(rowCode), testCase.subtype)
        .toEqual(expect.arrayContaining([...testCase.expectedControlCodes]))
      const scheduleRowByCode = new Map(scheduleRows.map((row) => [rowCode(row), row]))
      for (const [predecessorCode, successorCode] of testCase.expectedFsEdges) {
        const predecessor = scheduleRowByCode.get(predecessorCode)
        const successor = scheduleRowByCode.get(successorCode)
        expect(predecessor, `${testCase.subtype}:${predecessorCode}`).toBeTruthy()
        expect(successor, `${testCase.subtype}:${successorCode}`).toBeTruthy()
        expect(successor?.predecessorDependencies, `${testCase.subtype}:${predecessorCode}->${successorCode}`)
          .toEqual(expect.arrayContaining([
            expect.objectContaining({
              clientRowId: predecessor?.clientRowId,
              dependencyType: 'FS',
            }),
          ]))
      }
      for (const expectedEdge of testCase.expectedTimedEdges) {
        const predecessor = scheduleRowByCode.get(expectedEdge.predecessorCode)
        const successor = scheduleRowByCode.get(expectedEdge.successorCode)
        expect(predecessor, `${testCase.subtype}:${expectedEdge.predecessorCode}`).toBeTruthy()
        expect(successor, `${testCase.subtype}:${expectedEdge.successorCode}`).toBeTruthy()
        expect(
          successor?.predecessorDependencies,
          `${testCase.subtype}:${expectedEdge.predecessorCode}->${expectedEdge.successorCode}`,
        ).toEqual(expect.arrayContaining([
          expect.objectContaining({
            clientRowId: predecessor?.clientRowId,
            dependencyType: expectedEdge.dependencyType,
            lagDays: expectedEdge.lagDays,
          }),
        ]))
      }
      titleSignatures.add(titleSignature)
    }

    expect(titleSignatures.size).toBe(cases.length)
  }, 240_000)

  it('keeps renovation generation on the subtype construction-organization policy', async () => {
    const renovationProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => (
      probe.businessType === 'renovation'
    ))
    expect(renovationProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(renovationProbe!, {
      projectFactOverrides: {
        businessSubtype: 'renovation_seismic',
        projectTypeCode: 'renovation_seismic',
        functionalUsageCodes: ['existing_building'],
        functionalCategoryCodes: ['seismic_retrofit'],
        specialRoomTypeCodes: ['structural_reinforcement'],
      },
      scopeOverrides: {
        business_subtype: 'renovation_seismic',
        project_type_code: 'renovation_seismic',
        functional_usage_codes: ['existing_building'],
        functional_category_codes: ['seismic_retrofit'],
        special_room_type_codes: ['structural_reinforcement'],
      },
    })
    const organizationRows = generated.rows.filter((row) => (
      row.rowProjectionMode === 'schedule_row'
      && String(rowCode(row)).startsWith('RNV-')
      && rowMetadata(row).projectOrganization
    ))
    const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, any>
    const promotedOrganizationRows = organizationRows.filter((row) => (
      (row.linkedProjectionSource as Record<string, unknown> | null | undefined)
        ?.promotedToExecutableDefaultMasterPlan === true
    ))
    const renovationZoneLanes = [...new Set(generated.scopeCombos
      .filter((scope) => scope.organization_lane_role === 'renovation_zone_lane')
      .map((scope) => String(scope.organization_lane ?? '')))]
    const promotedLaneCounts = promotedOrganizationRows.reduce<Record<string, number>>((counts, row) => {
      const organization = rowMetadata(row).projectOrganization as Record<string, unknown>
      const lane = String(organization.organizationLane ?? '')
      counts[lane] = (counts[lane] ?? 0) + 1
      return counts
    }, {})

    expect(organizationRows.length).toBeGreaterThan(0)
    expect(renovationZoneLanes).toEqual([
      'seismic_reinforcement_zone_lane_1',
      'seismic_reinforcement_zone_lane_2',
      'seismic_reinforcement_zone_lane_3',
    ])
    expect(assembly.readyForWizardCommit, JSON.stringify({
      readinessReasonCodes: assembly.readinessReasonCodes,
      scheduleRowCount: assembly.scheduleRowCount,
      operationalRowFloor: assembly.operationalRowFloor,
      compactedPromotionCandidateRowCount: assembly.compactedPromotionCandidateRowCount,
      promotionCandidateCountsByScopeMode: assembly.promotionCandidateCountsByScopeMode,
    })).toBe(true)
    expect(assembly.operationalRowFloor).toBe(60)
    expect(assembly.scheduleRowCount).toBeGreaterThanOrEqual(60)
    expect(assembly.scheduleRowCount).toBeLessThanOrEqual(80)
    expect(assembly.networkComponentCount).toBe(1)
    expect(assembly.networkRootCount).toBe(1)
    expect(assembly.networkSinkCount).toBe(1)
    expect(Number(assembly.promotionCandidateCountsByScopeMode?.organization_lane_control ?? 0))
      .toBeGreaterThanOrEqual(30)
    for (const lane of renovationZoneLanes) {
      expect(promotedLaneCounts[lane] ?? 0, lane).toBeGreaterThanOrEqual(10)
    }
    for (const row of organizationRows) {
      const organization = rowMetadata(row).projectOrganization as Record<string, unknown>
      expect(organization.policyId, rowCode(row))
        .toBe('project-organization-renovation-seismic-reinforcement-v1')
      expect(organization.organizationLaneTotal, rowCode(row)).toBe(3)
      expect(organization.laneSizingPolicy, rowCode(row)).toEqual({
        basis: 'renovation_workface_proxy',
        minimumLaneTotal: 1,
        areaPerLaneM2: 6000,
        floorsPerLane: 5,
      })
      expect(String(organization.organizationLane ?? ''), rowCode(row)).not.toContain('modular_site_lane')
      expect(organization.organizationLaneRole, rowCode(row)).not.toBe('factory_site_lane')
    }
  }, 120_000)

  it('keeps authored venue controls executable instead of using them as promoted-row summary parents', async () => {
    const sportsProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => (
      probe.businessType === 'sports_culture'
    ))
    expect(sportsProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(sportsProbe!, {
      constructionCalendar: { basis: 'calendar_day', windows: [] },
      projectFactOverrides: {
        totalAreaM2: 80_000,
        buildingCount: 1,
        standardFloorCount: 4,
        highestBuildingFloorCount: 6,
        basementLevelCount: 1,
        foundationDepthM: 4,
      },
      scopeOverrides: {
        total_area_m2: 80_000,
        building_count: 1,
        standard_floor_count: 4,
        highest_building_floor_count: 6,
        basement_level_count: 1,
        foundation_depth_m: 4,
      },
    })
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const authoredProfileRows = scheduleRows.filter((row) => {
      const businessProfile = rowMetadata(row).businessTypeMasterPlan as Record<string, unknown> | undefined
      return businessProfile?.source === 'managed_frontier_default_master_plan'
        && row.values.plan_item_kind === 'work_task'
        && row.values.duration_contribution_mode === 'duration_bearing'
    })
    const authoredProfileIds = new Set(authoredProfileRows.map((row) => row.clientRowId))
    const promotedRows = scheduleRows.filter((row) => (
      (row.linkedProjectionSource as Record<string, unknown> | null | undefined)
        ?.promotedToExecutableDefaultMasterPlan === true
    ))

    expect(authoredProfileRows.length).toBeGreaterThan(0)
    expect(authoredProfileRows.every((row) => (
      row.values.is_wbs_summary === false && row.values.is_executable === true
    ))).toBe(true)
    expect(promotedRows.every((row) => !authoredProfileIds.has(String(row.parentClientRowId ?? '')))).toBe(true)
    expect(scheduleRows.some((row) => rowCode(row) === 'STL-01-01-01')).toBe(false)
    expect(scheduleRows.find((row) => rowCode(row) === '09-01')?.values.execution_phase)
      .toBe('envelope_roof_facade')

    for (const code of ['BTMP-SPC-01', 'BTMP-SPC-02', 'BTMP-SPC-03', 'BTMP-SPC-04', 'BTMP-SPC-05']) {
      const row = authoredProfileRows.find((candidate) => rowCode(candidate) === code)
      const suggestion = row ? rowDurationSuggestion(row) : {}
      expect(row, code).toBeTruthy()
      expect(Number(row?.values.smart_reference_days), `${code} reference duration remains bounded by governed P80`)
        .toBeLessThanOrEqual(Math.ceil(Number(suggestion.riskP80DurationDays) * 1.25))
    }

    const commissioning = scheduleRows.find((row) => rowCode(row) === 'BTMP-SPC-05')
    const rehearsal = scheduleRows.find((row) => rowCode(row) === 'SPC-04-01-01')
    const operationalHandover = scheduleRows.find((row) => rowCode(row) === 'BTMP-SPC-06')
    expect(commissioning).toBeTruthy()
    expect(rehearsal).toBeTruthy()
    expect(operationalHandover).toBeTruthy()
    expect((commissioning?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === rehearsal?.clientRowId
    ))).toBe(false)
    expect((rehearsal?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === commissioning?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((operationalHandover?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === rehearsal?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect(dateMs(rehearsal?.values.planned_start_date)).toBeGreaterThan(dateMs(commissioning?.values.planned_end_date))
    expect(dateMs(operationalHandover?.values.planned_start_date)).toBeGreaterThan(dateMs(rehearsal?.values.planned_end_date))
  }, 120_000)

  it('keeps hotel duration-bearing rows semantically compatible with their selected duration assets', async () => {
    const hotelProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'hotel')
    expect(hotelProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(hotelProbe!)
    const mismatches = generated.rows
      .filter((row) => row.rowProjectionMode === 'schedule_row')
      .filter((row) => String(row.values.duration_contribution_mode ?? rowMetadata(row).durationContributionMode) === 'duration_bearing')
      .filter((row) => !isExecutableDurationAssetSemanticallyCompatible(row))
      .map((row) => ({
        code: rowCode(row),
        title: row.values.title,
        seed: (rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined)
          ?.standardWorkDurationSeedStableCode,
      }))

    expect(mismatches).toEqual([])
  }, 120_000)

  it('keeps renovation startup rows semantically compatible with their selected duration assets', async () => {
    const renovationProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'renovation')
    expect(renovationProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(renovationProbe!)
    const mismatches = generated.rows
      .filter((row) => row.rowProjectionMode === 'schedule_row')
      .filter((row) => String(row.values.duration_contribution_mode ?? rowMetadata(row).durationContributionMode) === 'duration_bearing')
      .filter((row) => !isExecutableDurationAssetSemanticallyCompatible(row))
      .map((row) => ({
        code: rowCode(row),
        title: row.values.title,
        seed: (rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined)
          ?.standardWorkDurationSeedStableCode,
      }))

    expect(mismatches).toEqual([])
  }, 120_000)

  it('carries descendant process seed rollup lineage into fast-template master-control rows', async () => {
    const renovationProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'renovation')
    expect(renovationProbe).toBeTruthy()

    const publicationVersionId = 'runtime-process-rollup-publication-v-test'
    const originalResolve = algorithmSeedResolver.resolveStandardWorkDurationSeed
    const activeSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeed')
      .mockImplementation(async (matchText, options) => {
        const resolved = await originalResolve(matchText, options)
        return resolved
          ? {
              ...resolved,
              __resolverSource: 'active_seed',
              __resolverVersionId: publicationVersionId,
            }
          : null
      })
    try {
      const generated = await generateDefaultMasterPlanForProbe(renovationProbe!)
      const rollupRows = generated.rows
        .filter((row) => row.rowProjectionMode === 'schedule_row')
        .filter((row) => {
          const mapping = rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined
          return mapping?.standardWorkDurationAuthorityMode === 'descendant_process_seed_rollup'
        })

      expect(rollupRows.length).toBeGreaterThan(0)
      for (const row of rollupRows) {
        const mapping = rowMetadata(row).durationAssetMapping as Record<string, unknown>
        expect(mapping.standardWorkDurationSeedStableCode).toMatch(/^process_rollup:/)
        expect(mapping.standardWorkDurationSeedSourceStableCodes).toEqual(expect.arrayContaining([expect.any(String)]))
        expect(mapping.standardWorkDurationSeedResolverSource).toBe('active_seed')
        expect(mapping.standardWorkDurationSeedResolverVersionIds).toContain(publicationVersionId)
        expect(mapping.standardWorkDurationSeedResolutions).toEqual(expect.arrayContaining([
          expect.objectContaining({
            resolverSource: 'active_seed',
            resolverVersionId: publicationVersionId,
          }),
        ]))
        if (row.values.execution_phase !== 'startup_site_setup') {
          expect(mapping.t2RhythmTemplateId).toEqual(expect.any(String))
        }
      }
      const rollupReceipts = ((generated as any).durationAssetConsumptionReceipts as Array<Record<string, any>>)
        .filter((receipt) => receipt.assetType === 'standard_work_duration_process_rollup')
      expect(rollupReceipts.length).toBeGreaterThan(0)
      expect(rollupReceipts.every((receipt) => (
        receipt.versionId === publicationVersionId
          && receipt.lineage?.resolverVersionIds?.includes(publicationVersionId)
      ))).toBe(true)
    } finally {
      activeSeedSpy.mockRestore()
    }
  }, 120_000)

  it('classifies business-specific specialty controls into field execution phases', async () => {
    const probes = new Map(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => [probe.businessType, probe]))
    const hotel = await generateDefaultMasterPlanForProbe(probes.get('hotel')!)
    const renovation = await generateDefaultMasterPlanForProbe(probes.get('renovation')!)
    const tod = await generateDefaultMasterPlanForProbe(probes.get('tod_upper_cover')!)
    const modular = await generateDefaultMasterPlanForProbe(probes.get('modular_building')!)
    const dataCenter = await generateDefaultMasterPlanForProbe(probes.get('data_center')!)
    const industrial = await generateDefaultMasterPlanForProbe(probes.get('industrial')!)
    const transportationHub = await generateDefaultMasterPlanForProbe(probes.get('transportation_hub')!)
    const sportsCulture = await generateDefaultMasterPlanForProbe(probes.get('sports_culture')!)
    const phaseByCode = (rows: typeof hotel.rows) => new Map(rows.map((row) => [rowCode(row), row.values.execution_phase]))
    const hotelPhases = phaseByCode(hotel.rows)
    const renovationPhases = phaseByCode(renovation.rows)
    const todPhases = phaseByCode(tod.rows)
    const modularPhases = phaseByCode(modular.rows)
    const dataCenterPhases = phaseByCode(dataCenter.rows)
    const industrialPhases = phaseByCode(industrial.rows)
    const transportationHubPhases = phaseByCode(transportationHub.rows)
    const sportsCulturePhases = phaseByCode(sportsCulture.rows)

    expect(hotelPhases.get('HTL-01-01-02')).toBe('interior_fitout_terminal')
    expect(hotelPhases.get('HTL-04-01-02')).toBe('mep_roughin')
    expect(hotelPhases.get('HTL-05-01-02')).toBe('commissioning')
    expect(renovationPhases.get('RNV-01-01-02')).toBe('startup_site_setup')
    expect(renovationPhases.get('RNV-02-01-02')).toBe('superstructure_rhythm')
    expect(renovationPhases.get('RNV-04-01-18')).toBe('mep_roughin')
    expect(renovationPhases.get('RNV-04-01-23')).toBe('commissioning')
    expect(todPhases.get('TOD-02-01-01')).toBe('superstructure_rhythm')
    expect(todPhases.get('TOD-03-01-03')).toBe('mep_roughin')
    expect(todPhases.get('TOD-04-01-12')).toBe('outdoor_municipal_landscape')
    expect(todPhases.get('TOD-04-01-19')).toBe('envelope_roof_facade')
    expect(todPhases.get('TOD-04-01-23')).toBe('commissioning')
    expect(modularPhases.get('MIC-01-01-01')).toBe('startup_site_setup')
    expect(modularPhases.get('MIC-02-01-01')).toBe('superstructure_rhythm')
    expect(modularPhases.get('MIC-02-01-02')).toBe('superstructure_rhythm')
    expect(modularPhases.get('MIC-03-01-01')).toBe('startup_site_setup')
    expect(modularPhases.get('MIC-04-01-01')).toBe('superstructure_rhythm')
    expect(modularPhases.get('MIC-05-01-01')).toBe('envelope_roof_facade')
    expect(modularPhases.get('MIC-05-01-02')).toBe('acceptance_handover')
    expect(modularPhases.get('MIC-06-01-10')).toBe('commissioning')
    expect(modularPhases.get('MIC-06-01-18')).toBe('mep_roughin')
    expect(dataCenterPhases.get('DTC-02-01-01')).toBe('commissioning')
    expect(dataCenterPhases.get('DTC-02-01-02')).toBe('commissioning')
    expect(dataCenterPhases.get('DTC-04-01-07')).toBe('commissioning')
    expect(dataCenterPhases.get('DTC-04-01-12')).toBe('commissioning')
    expect(industrialPhases.get('IPL-01-01-01')).toBe('superstructure_rhythm')
    expect(industrialPhases.get('IPL-02-01-01')).toBe('foundation_pit_pile')
    expect(industrialPhases.get('IPL-03-01-02')).toBe('commissioning')
    expect(industrialPhases.get('IPL-04-01-01')).toBe('interior_fitout_terminal')
    expect(transportationHubPhases.get('TRH-01-01-01')).toBe('superstructure_rhythm')
    expect(transportationHubPhases.get('TRH-02-01-01')).toBe('elevator_installation')
    expect(transportationHubPhases.get('TRH-03-01-01')).toBe('outdoor_municipal_landscape')
    expect(transportationHubPhases.get('TRH-03-01-03')).toBe('acceptance_handover')
    expect(sportsCulturePhases.get('SPC-01-01-01')).toBe('superstructure_rhythm')
    expect(sportsCulturePhases.get('SPC-02-01-01')).toBe('interior_fitout_terminal')
    expect(sportsCulturePhases.get('SPC-03-01-01')).toBe('commissioning')
    expect(sportsCulturePhases.get('SPC-04-01-02')).toBe('acceptance_handover')
  }, 300_000)

  it('keeps modular factory FAT inside factory production and before onsite hoisting', async () => {
    const modularProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'modular_building')
    expect(modularProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(modularProbe!, {
      projectFactOverrides: {
        buildingCount: 1,
        basementLevelCount: 0,
        foundationDepthM: 2,
      },
      scopeOverrides: {
        building_count: 1,
        basement_level_count: 0,
        foundation_depth_m: 2,
      },
    })
    const factoryFatRows = generated.rows.filter((row) => rowCode(row) === 'MIC-02-01-02')
    const onsiteHoistRows = generated.rows.filter((row) => rowCode(row) === 'MIC-04-01-01')

    expect(factoryFatRows.length).toBeGreaterThan(0)
    expect(onsiteHoistRows.length).toBeGreaterThan(0)
    expect(factoryFatRows.every((row) => row.values.execution_phase === 'superstructure_rhythm')).toBe(true)
    const latestFactoryFatEnd = Math.max(...factoryFatRows.map((row) => dateMs(row.values.planned_end_date)))
    const earliestOnsiteHoistStart = Math.min(...onsiteHoistRows.map((row) => dateMs(row.values.planned_start_date)))
    expect(latestFactoryFatEnd).toBeLessThan(earliestOnsiteHoistStart)
  }, 120_000)

  it('does not apply cross-workface fast-track compression inside a modular item-pack process chain', async () => {
    const modularProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => (
      probe.businessType === 'modular_building'
    ))
    expect(modularProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(modularProbe!, {
      projectFactOverrides: {
        buildingCount: 4,
        standardFloorCount: 8,
        highestBuildingFloorCount: 10,
        basementLevelCount: 0,
        foundationDepthM: 2,
        totalAreaM2: 35_000,
      },
      scopeOverrides: {
        building_count: 4,
        standard_floor_count: 8,
        highest_building_floor_count: 10,
        basement_level_count: 0,
        foundation_depth_m: 2,
        total_area_m2: 35_000,
      },
    })
    const onsiteHoisting = generated.rows.find((row) => rowCode(row) === 'MIC-04-01-01')
    expect(onsiteHoisting).toBeTruthy()

    const suggestion = onsiteHoisting!.values.duration_suggestion as Record<string, any>
    const rollup = suggestion.businessReasonParams?.descendantRollup?.rollupAdjustment as Record<string, unknown>
    expect(Number(onsiteHoisting!.values.smart_reference_days)).toBeGreaterThanOrEqual(11)
    expect(rollup).toEqual(expect.objectContaining({
      profile: expect.stringContaining('sequential_specialty_item_pack_process_chain'),
      pipelineFactor: 1,
      replacementFactor: null,
    }))
  }, 120_000)

  it('uses the modular parallel-lane organization policy instead of serializing every building floor', async () => {
    const modularProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'modular_building')
    expect(modularProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(modularProbe!, {
      projectFactOverrides: {
        buildingCount: 4,
        standardFloorCount: 8,
        highestBuildingFloorCount: 10,
        basementLevelCount: 0,
        foundationDepthM: 2,
        totalAreaM2: 35_000,
      },
      scopeOverrides: {
        building_count: 4,
        standard_floor_count: 8,
        highest_building_floor_count: 10,
        basement_level_count: 0,
        foundation_depth_m: 2,
        total_area_m2: 35_000,
      },
    })
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const factoryProduction = profileRows.find((row) => rowMetadata(row).stableCode === 'BTMP-MOD-02')
    const siteHoisting = profileRows.find((row) => rowMetadata(row).stableCode === 'BTMP-MOD-04')
    const factoryFatRows = generated.rows.filter((row) => (
      row.rowProjectionMode === 'schedule_row' && rowCode(row) === 'MIC-02-01-02'
    ))

    expect(factoryProduction).toBeTruthy()
    expect(siteHoisting).toBeTruthy()
    expect(durationDaysOf(factoryProduction!)).toBeLessThanOrEqual(120)
    expect(durationDaysOf(siteHoisting!)).toBeLessThanOrEqual(120)
    expect(rowMetadata(siteHoisting!).durationAssetCalculation).toEqual(expect.objectContaining({
      quantityProxy: expect.objectContaining({
        value: 10,
        unit: 'parallel_floor_workface',
        source: 'project_scale_facts',
      }),
    }))
    expect(factoryFatRows.length).toBeGreaterThan(0)
    expect(factoryFatRows.every((row) => row.parentClientRowId === null)).toBe(true)
    expect(factoryFatRows.every((row) => (row.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === (factoryProduction as any).clientRowId
      && dependency.intentCode === 'executable_default_master_plan_logical_anchor_workface'
    )))).toBe(true)
    expect(generated.rows.filter((row) => (
      row.rowProjectionMode === 'schedule_row' && rowCode(row) === 'MIC-06-01-02'
    ))).toHaveLength(1)
    expect(factoryFatRows).toHaveLength(4)
  }, 120_000)

  it('lets active standard duration seeds drive residential startup work rows instead of fixed skeleton days', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'site_setup_temp_works') return null
        return {
          __stableCode: 'site_setup_temp_works',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-site-setup-v-test',
          stableCode: 'site_setup_temp_works',
          defaultDaysP20: 32,
          defaultDaysP50: 42,
          defaultDaysP80: 56,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'startup_workface',
          baselineProductivity: {
            p50PerDay: 0.25,
            unit: 'startup_workface/day',
            basis: 'active seed fixture for residential startup rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const temporaryFacility = generated.rows.find((row) => (
        String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-01-03'
      ))

      expect(temporaryFacility).toBeTruthy()
      expect(temporaryFacility!.rowProjectionMode).toBe('linked_projection')
      expect(rowMetadata(temporaryFacility!).masterPlanVisibilityDecision).toEqual(expect.objectContaining({
        policyStableCode: 'master-plan-hide-residential-startup-detail',
        visibleOnMasterPlan: false,
      }))
      expect(durationDaysOf(temporaryFacility!)).toBe(42)
      expect(temporaryFacility!.values.smart_reference_days).toBe(42)
      expect(rowMetadata(temporaryFacility!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'site_setup_temp_works',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-site-setup-v-test',
        standardWorkDurationSeedP50Days: 42,
        selectedDurationDays: 42,
      }))
      expect(String((rowMetadata(temporaryFacility!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('standard_seed_floor')
    } finally {
      activeSeedSpy.mockRestore()
    }
  }, 120_000)

  it('keeps basement MEP coordination from defining the formal residential MEP phase start', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const rowByCode = new Map(scheduleRows.map((row) => [String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? ''), row]))
    const basementMepCoordination = rowByCode.get('RMP-06-90')
    const towerStructureRows = scheduleRows
      .filter((row) => /[1-3]#楼主体结构标准层循环/.test(String(row.values.title ?? row.values.name ?? '')))
    const formalMepRows = scheduleRows.filter((row) => row.values.execution_phase === 'mep_roughin')

    expect(basementMepCoordination).toBeTruthy()
    expect(basementMepCoordination!.values.execution_phase).toBe('basement_structure')
    expect(basementMepCoordination!.values.execution_lane).toBe('basement_mep')
    expect(formalMepRows.some((row) => /楼机电预留预埋|消防给排水/.test(String(row.values.title ?? row.values.name ?? '')))).toBe(true)

    const firstStructureStart = Math.min(...towerStructureRows.map((row) => dateMs(row.values.planned_start_date)))
    const firstFormalMepStart = Math.min(...formalMepRows.map((row) => dateMs(row.values.planned_start_date)))
    expect(firstFormalMepStart).toBeGreaterThan(firstStructureStart)
  }, 120_000)

  it('uses site setup productivity assets for residential startup rows instead of fixed skeleton days', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeSiteSetupSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'site_setup_temp_works') return null
        return {
          __stableCode: 'site_setup_temp_works',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-site-startup-v-test',
          stableCode: 'site_setup_temp_works',
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
          durationCoverageMode: 'external_support',
          scaleBasis: 'startup_workface',
          baselineProductivity: {
            p50PerDay: 0.5,
            unit: 'startup_workface/day',
            basis: 'active seed fixture for residential startup productivity rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const rowsByCode = new Map(generated.rows
        .map((row) => [String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? ''), row]))
      const expectations = [
        ['RMP-01-01', 18, 7, 'startup_workface', 14, 4, 'site_mobilization_productivity_by_workface'],
        ['RMP-01-02', 24, 8, 'startup_workface', 16, 8, 'site_access_fencing_road_productivity_by_workface'],
        ['RMP-01-04', 26, 7, 'startup_workface', 14, 12, 'temporary_utilities_productivity_by_workface'],
        ['RMP-01-05', 18, 3, 'tower_crane', 6, 12, 'tower_crane_foundation_productivity_by_crane_count'],
        ['RMP-01-06', 16, 3, 'tower_crane', 6, 10, 'tower_crane_install_productivity_by_crane_count'],
      ] as const

      for (const [stableCode, expectedDuration, expectedQuantity, expectedUnit, expectedBaseDuration, expectedBuffer, expectedSelectionRule] of expectations) {
        const row = rowsByCode.get(stableCode)
        expect(row, stableCode).toBeTruthy()
        expect(row!.rowProjectionMode, stableCode).toBe(
          stableCode === 'RMP-01-01' ? 'schedule_row' : 'linked_projection',
        )
        if (stableCode !== 'RMP-01-01') {
          expect(rowMetadata(row!).masterPlanVisibilityDecision, stableCode).toEqual(expect.objectContaining({
            policyStableCode: 'master-plan-hide-residential-startup-detail',
            visibleOnMasterPlan: false,
          }))
        }
        expect(durationDaysOf(row!), stableCode).toBe(expectedDuration)
        expect(row!.values.smart_reference_days, stableCode).toBe(expectedDuration)
        expect(rowMetadata(row!).durationAssetCalculation, stableCode).toEqual(expect.objectContaining({
          standardWorkDurationSeedStableCode: 'site_setup_temp_works',
          standardWorkDurationSeedResolverSource: 'active_seed',
          standardWorkDurationSeedResolverVersionId: 'runtime-seed-site-startup-v-test',
          standardWorkDurationSeedProductivityP50PerDay: 0.5,
          productivityBaseDurationDays: expectedBaseDuration,
          productivityFixedBufferDays: expectedBuffer,
          productivityDerivedDurationDays: expectedDuration,
          selectedDurationDays: expectedDuration,
        }))
        if (stableCode === 'RMP-01-01') {
          expect(rowMetadata(row!).durationAssetCalculation, stableCode).toEqual(expect.objectContaining({
            t2RhythmTemplateId: null,
            t2RhythmApplicability: 'not_applicable_one_off_activity',
          }))
        }
        expect(rowMetadata(row!).durationAssetCalculation, stableCode).toEqual(expect.objectContaining({
          quantityProxy: expect.objectContaining({ value: expectedQuantity, unit: expectedUnit }),
        }))
        expect(String((rowMetadata(row!).durationAssetCalculation as Record<string, unknown>).selectionRule), stableCode).toContain(expectedSelectionRule)
      }
      expect((generated as any).durationAssetConsumptionReceipts).toContainEqual(expect.objectContaining({
        consumer: 'wizard_master_plan',
        stableCode: 'site_setup_temp_works',
        status: 'effective_applied',
        changedFields: expect.arrayContaining(['duration']),
      }))
    } finally {
      activeSiteSetupSeedSpy.mockRestore()
    }
  }, 120_000)

  it('keeps one-off residential startup activities asset-backed without requiring a T2 rhythm template', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
    const rowsByCode = new Map(generated.rows
      .map((row) => [String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? ''), row]))

    for (const stableCode of ['RMP-01-01', 'RMP-01-02', 'RMP-01-03', 'RMP-01-04', 'RMP-01-05', 'RMP-01-06']) {
      const row = rowsByCode.get(stableCode)
      expect(row, stableCode).toBeTruthy()
      expect(rowMetadata(row!).durationAssetCalculation, stableCode).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'site_setup_temp_works',
        t2RhythmTemplateId: null,
        t2RhythmApplicability: 'not_applicable_one_off_activity',
      }))
    }
  }, 120_000)

  it('uses elevator civil-handover productivity assets for residential vertical transport readiness rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeElevatorCivilHandoverSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'elevator_traction_civil_handover') return null
        return {
          __stableCode: 'elevator_traction_civil_handover',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-elevator-civil-handover-v-test',
          stableCode: 'elevator_traction_civil_handover',
          defaultDaysP20: 4,
          defaultDaysP50: 8,
          defaultDaysP80: 14,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'shaft',
          baselineProductivity: {
            p50PerDay: 0.2,
            unit: 'shaft/day',
            basis: 'active seed fixture for residential elevator civil handover rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const elevatorCivilHandover = generated.rows.find((row) => (
        String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-10-01'
      ))

      expect(elevatorCivilHandover).toBeTruthy()
      expect(elevatorCivilHandover?.rowProjectionMode).toBe('linked_projection')
      expect(durationDaysOf(elevatorCivilHandover!)).toBe(48)
      expect(elevatorCivilHandover!.values.smart_reference_days).toBe(48)
      expect(rowMetadata(elevatorCivilHandover!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'elevator_traction_civil_handover',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-elevator-civil-handover-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 0.2,
        productivityBaseDurationDays: 30,
        productivityFixedBufferDays: 18,
        productivityDerivedDurationDays: 48,
        selectedDurationDays: 48,
      }))
      expect(rowMetadata(elevatorCivilHandover!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 6,
          unit: 'shaft',
        }),
      }))
      expect(String((rowMetadata(elevatorCivilHandover!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('elevator_civil_handover_productivity_by_shaft')
    } finally {
      activeElevatorCivilHandoverSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses elevator productivity duration assets for residential formal elevator installation rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeElevatorSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'elevator_traction_installation') return null
        return {
          __stableCode: 'elevator_traction_installation',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-elevator-v-test',
          stableCode: 'elevator_traction_installation',
          defaultDaysP20: 16,
          defaultDaysP50: 20,
          defaultDaysP80: 28,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'shaft',
          baselineProductivity: {
            p50PerDay: 0.05,
            unit: 'shaft/day',
            basis: 'active seed fixture for residential elevator installation rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const formalElevatorInstallRows = generated.rows.filter((row) => (
        row.rowProjectionMode === 'schedule_row'
        && /^RMP-10-02-0[1-3]$/.test(String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? ''))
      ))

      expect(formalElevatorInstallRows).toHaveLength(3)
      for (const formalElevatorInstall of formalElevatorInstallRows) {
        expect(durationDaysOf(formalElevatorInstall)).toBe(90)
        expect(formalElevatorInstall.values.smart_reference_days).toBe(90)
        expect(rowMetadata(formalElevatorInstall).durationAssetCalculation).toEqual(expect.objectContaining({
          standardWorkDurationSeedStableCode: 'elevator_traction_installation',
          standardWorkDurationSeedResolverSource: 'active_seed',
          standardWorkDurationSeedResolverVersionId: 'runtime-seed-elevator-v-test',
          standardWorkDurationSeedProductivityP50PerDay: 0.05,
          productivityBaseDurationDays: 40,
          productivityFixedBufferDays: 45,
          productivityDerivedDurationDays: 85,
          selectedDurationDays: 90,
          quantityProxy: expect.objectContaining({ value: 2, unit: 'shaft' }),
        }))
        expect(String((rowMetadata(formalElevatorInstall).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('elevator_installation_productivity_by_tower_shaft')
      }
    } finally {
      activeElevatorSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses MEP productivity duration assets for residential common plumbing and fire installation rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeMepSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'mep_plumbing_fire_pipe') return null
        return {
          __stableCode: 'mep_plumbing_fire_pipe',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-mep-common-v-test',
          stableCode: 'mep_plumbing_fire_pipe',
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'effective_pipe_meter',
          baselineProductivity: {
            p50PerDay: 30,
            unit: 'm/day',
            basis: 'active seed fixture for residential common MEP installation rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const commonMepInstall = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-06-91'
      ))

      expect(commonMepInstall).toBeTruthy()
      expect(durationDaysOf(commonMepInstall!)).toBe(360)
      expect(commonMepInstall!.values.smart_reference_days).toBe(360)
      expect(rowMetadata(commonMepInstall!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'mep_plumbing_fire_pipe',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-mep-common-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 30,
        productivityBaseDurationDays: 320,
        productivityFixedBufferDays: 60,
        productivityDerivedDurationDays: 360,
        selectedDurationDays: 360,
      }))
      expect(rowMetadata(commonMepInstall!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 9600,
          unit: 'm',
        }),
      }))
      expect(String((rowMetadata(commonMepInstall!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('mep_common_pipe_productivity_by_effective_length')
    } finally {
      activeMepSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses MEP productivity duration assets for residential basement MEP coordination rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeMepSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'mep_plumbing_fire_pipe') return null
        return {
          __stableCode: 'mep_plumbing_fire_pipe',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-mep-basement-v-test',
          stableCode: 'mep_plumbing_fire_pipe',
          defaultDaysP20: 7,
          defaultDaysP50: 10,
          defaultDaysP80: 13,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'effective_pipe_meter',
          baselineProductivity: {
            p50PerDay: 15,
            unit: 'm/day',
            basis: 'active seed fixture for residential basement MEP coordination rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const basementMep = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-06-90'
      ))

      expect(basementMep).toBeTruthy()
      expect(durationDaysOf(basementMep!)).toBe(174)
      expect(basementMep!.values.smart_reference_days).toBe(174)
      expect(rowMetadata(basementMep!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'mep_plumbing_fire_pipe',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-mep-basement-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 15,
        productivityBaseDurationDays: 136,
        productivityFixedBufferDays: 38,
        productivityDerivedDurationDays: 174,
        selectedDurationDays: 174,
      }))
      expect(rowMetadata(basementMep!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 2040,
          unit: 'm',
        }),
      }))
      expect(String((rowMetadata(basementMep!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('basement_mep_pipe_productivity_by_effective_length')
    } finally {
      activeMepSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses basement waterproofing productivity assets for residential slab waterproofing and exterior backfill rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeBasementWaterproofSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'basement_waterproof_backfill') return null
        return {
          __stableCode: 'basement_waterproof_backfill',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-basement-waterproof-v-test',
          stableCode: 'basement_waterproof_backfill',
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'basement_waterproof_area_m2',
          baselineProductivity: {
            p50PerDay: 660,
            unit: 'm2/day',
            basis: 'active seed fixture for residential basement waterproofing rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const slabWaterproofing = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-03-01'
      ))
      const exteriorBackfill = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-03-04'
      ))

      expect(slabWaterproofing).toBeTruthy()
      expect(durationDaysOf(slabWaterproofing!)).toBe(46)
      expect(slabWaterproofing!.values.smart_reference_days).toBe(46)
      expect(rowMetadata(slabWaterproofing!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'basement_waterproof_backfill',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-basement-waterproof-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 660,
        productivityBaseDurationDays: 34,
        productivityFixedBufferDays: 12,
        productivityDerivedDurationDays: 46,
        selectedDurationDays: 46,
      }))
      expect(rowMetadata(slabWaterproofing!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 22440,
          unit: 'm2',
        }),
      }))
      expect(String((rowMetadata(slabWaterproofing!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('basement_slab_waterproof_productivity_by_area')

      expect(exteriorBackfill).toBeTruthy()
      expect(durationDaysOf(exteriorBackfill!)).toBe(33)
      expect(exteriorBackfill!.values.smart_reference_days).toBe(33)
      expect(rowMetadata(exteriorBackfill!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'basement_waterproof_backfill',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-basement-waterproof-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 660,
        productivityBaseDurationDays: 15,
        productivityFixedBufferDays: 18,
        productivityDerivedDurationDays: 33,
        selectedDurationDays: 33,
      }))
      expect(rowMetadata(exteriorBackfill!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 9792,
          unit: 'm2',
        }),
      }))
      expect(String((rowMetadata(exteriorBackfill!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('basement_exterior_waterproof_backfill_productivity_by_area')
    } finally {
      activeBasementWaterproofSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses basement structure productivity assets for residential basement structural work rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeBasementStructureSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'basement_structure') return null
        return {
          __stableCode: 'basement_structure',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-basement-structure-v-test',
          stableCode: 'basement_structure',
          defaultDaysP20: 16,
          defaultDaysP50: 23,
          defaultDaysP80: 30,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'basement_level',
          baselineProductivity: {
            p50PerDay: 0.1,
            unit: 'floor/day',
            basis: 'active seed fixture for residential basement structure rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const basementStructure = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-03-03'
      ))

      expect(basementStructure).toBeTruthy()
      expect(durationDaysOf(basementStructure!)).toBe(60)
      expect(basementStructure!.values.smart_reference_days).toBe(60)
      expect(rowMetadata(basementStructure!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'basement_structure',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-basement-structure-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 0.1,
        productivityBaseDurationDays: 20,
        productivityFixedBufferDays: 40,
        productivityDerivedDurationDays: 60,
        selectedDurationDays: 60,
      }))
      expect(rowMetadata(basementStructure!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 2,
          unit: 'basement_level',
        }),
      }))
      expect(String((rowMetadata(basementStructure!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('basement_structure_productivity_by_level')
    } finally {
      activeBasementStructureSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses cast-in-place concrete productivity assets for residential tower transfer and roof structure rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeConcreteSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'cast_in_place_concrete') return null
        return {
          __stableCode: 'cast_in_place_concrete',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-tower-concrete-v-test',
          stableCode: 'cast_in_place_concrete',
          defaultDaysP20: 3,
          defaultDaysP50: 4,
          defaultDaysP80: 5,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'concrete_volume_m3',
          baselineProductivity: {
            p50PerDay: 80,
            unit: 'm3/day',
            basis: 'active seed fixture for residential tower transfer and roof structure rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const rowsByCode = new Map(generated.rows
        .filter((row) => row.rowProjectionMode === 'schedule_row')
        .map((row) => [String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? ''), row]))
      const transferStructure = rowsByCode.get('RMP-04-01-01')
      const roofStructure = rowsByCode.get('RMP-04-01-03')

      expect(transferStructure).toBeTruthy()
      expect(durationDaysOf(transferStructure!)).toBe(30)
      expect(transferStructure!.values.smart_reference_days).toBe(30)
      expect(rowMetadata(transferStructure!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'cast_in_place_concrete',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-tower-concrete-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 80,
        productivityBaseDurationDays: 10,
        productivityFixedBufferDays: 20,
        productivityDerivedDurationDays: 30,
        selectedDurationDays: 30,
      }))
      expect(rowMetadata(transferStructure!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 738,
          unit: 'm3',
        }),
      }))
      expect(String((rowMetadata(transferStructure!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('tower_transfer_structure_concrete_productivity_by_volume')

      expect(roofStructure).toBeTruthy()
      expect(durationDaysOf(roofStructure!)).toBe(16)
      expect(roofStructure!.values.smart_reference_days).toBe(16)
      expect(rowMetadata(roofStructure!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'cast_in_place_concrete',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-tower-concrete-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 80,
        productivityBaseDurationDays: 4,
        productivityFixedBufferDays: 12,
        productivityDerivedDurationDays: 16,
        selectedDurationDays: 16,
      }))
      expect(rowMetadata(roofStructure!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({ value: 308, unit: 'm3' }),
      }))
      expect(String((rowMetadata(roofStructure!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('roof_plant_room_structure_concrete_productivity_by_volume')
    } finally {
      activeConcreteSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses foundation support productivity assets for residential pit support readiness rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeFoundationSupportSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'expert_foundation_pit_support') return null
        return {
          __stableCode: 'expert_foundation_pit_support',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-foundation-support-readiness-v-test',
          stableCode: 'expert_foundation_pit_support',
          defaultDaysP20: 16,
          defaultDaysP50: 24,
          defaultDaysP80: 36,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'foundation_support_frontage_m',
          baselineProductivity: {
            p50PerDay: 80,
            unit: 'm/day',
            basis: 'active seed fixture for residential foundation support readiness rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const supportReadiness = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-02-01'
      ))

      expect(supportReadiness).toBeTruthy()
      expect(durationDaysOf(supportReadiness!)).toBe(28)
      expect(supportReadiness!.values.smart_reference_days).toBe(28)
      expect(rowMetadata(supportReadiness!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'expert_foundation_pit_support',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-foundation-support-readiness-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 80,
        productivityBaseDurationDays: 14,
        productivityFixedBufferDays: 14,
        productivityDerivedDurationDays: 28,
        selectedDurationDays: 28,
      }))
      expect(rowMetadata(supportReadiness!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 1109,
          unit: 'm',
        }),
      }))
      expect(String((rowMetadata(supportReadiness!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('foundation_support_readiness_productivity_by_frontage')
    } finally {
      activeFoundationSupportSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses foundation cushion and basement concrete productivity assets for residential foundation handover rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeFoundationSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode === 'cushion_and_blinding') {
          return {
            __stableCode: 'cushion_and_blinding',
            __resolverSource: 'active_seed',
            __resolverVersionId: 'runtime-seed-cushion-v-test',
            stableCode: 'cushion_and_blinding',
            defaultDaysP20: 3,
            defaultDaysP50: 4,
            defaultDaysP80: 5,
            durationCoverageMode: 'activity_reference',
            scaleBasis: 'cushion_area_m2',
            baselineProductivity: { p50PerDay: 600, unit: 'm2/day', basis: 'active seed fixture for foundation cushion rows' },
          }
        }
        if (stableCode === 'cast_in_place_concrete') {
          return {
            __stableCode: 'cast_in_place_concrete',
            __resolverSource: 'active_seed',
            __resolverVersionId: 'runtime-seed-basement-slab-concrete-v-test',
            stableCode: 'cast_in_place_concrete',
            defaultDaysP20: 3,
            defaultDaysP50: 4,
            defaultDaysP80: 5,
            durationCoverageMode: 'activity_reference',
            scaleBasis: 'concrete_volume_m3',
            baselineProductivity: { p50PerDay: 220, unit: 'm3/day', basis: 'active seed fixture for basement slab concrete rows' },
          }
        }
        return null
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const rowsByCode = new Map(generated.rows
        .filter((row) => row.rowProjectionMode === 'schedule_row')
        .map((row) => [String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? ''), row]))
      const cushion = rowsByCode.get('RMP-02-06')
      const slabConcrete = rowsByCode.get('RMP-03-02')

      expect(cushion).toBeTruthy()
      expect(durationDaysOf(cushion!)).toBe(33)
      expect(rowMetadata(cushion!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'cushion_and_blinding',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-cushion-v-test',
        productivityBaseDurationDays: 23,
        productivityFixedBufferDays: 10,
        selectedDurationDays: 33,
      }))

      expect(slabConcrete).toBeTruthy()
      expect(durationDaysOf(slabConcrete!)).toBe(29)
      expect(rowMetadata(slabConcrete!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'cast_in_place_concrete',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-basement-slab-concrete-v-test',
        productivityBaseDurationDays: 15,
        productivityFixedBufferDays: 14,
        selectedDurationDays: 29,
      }))
    } finally {
      activeFoundationSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses single-system commissioning productivity assets for residential commissioning rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeCommissioningSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'single_system_commissioning') return null
        return {
          __stableCode: 'single_system_commissioning',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-single-commissioning-v-test',
          stableCode: 'single_system_commissioning',
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'system_zone',
          baselineProductivity: {
            p50PerDay: 0.5,
            unit: 'system/day',
            basis: 'active seed fixture for residential single-system commissioning rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const singleSystemCommissioning = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-12-01'
      ))

      expect(singleSystemCommissioning).toBeTruthy()
      expect(durationDaysOf(singleSystemCommissioning!)).toBe(40)
      expect(singleSystemCommissioning!.values.smart_reference_days).toBe(40)
      expect(rowMetadata(singleSystemCommissioning!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'single_system_commissioning',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-single-commissioning-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 0.5,
        productivityBaseDurationDays: 16,
        productivityFixedBufferDays: 24,
        productivityDerivedDurationDays: 40,
        selectedDurationDays: 40,
      }))
      expect(rowMetadata(singleSystemCommissioning!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 8,
          unit: 'system_zone',
        }),
      }))
      expect(String((rowMetadata(singleSystemCommissioning!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('single_system_commissioning_productivity_by_system_zone')
    } finally {
      activeCommissioningSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses integrated commissioning productivity assets for residential fire linkage and joint commissioning rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeIntegratedCommissioningSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'integrated_commissioning') return null
        return {
          __stableCode: 'integrated_commissioning',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-integrated-commissioning-v-test',
          stableCode: 'integrated_commissioning',
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'linkage_scenario',
          baselineProductivity: {
            p50PerDay: 0.2,
            unit: 'linkage_scenario/day',
            basis: 'active seed fixture for residential integrated commissioning rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const integratedCommissioning = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-12-02'
      ))

      expect(integratedCommissioning).toBeTruthy()
      expect(durationDaysOf(integratedCommissioning!)).toBe(63)
      expect(integratedCommissioning!.values.smart_reference_days).toBe(63)
      expect(rowMetadata(integratedCommissioning!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'integrated_commissioning',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-integrated-commissioning-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 0.2,
        productivityBaseDurationDays: 45,
        productivityFixedBufferDays: 18,
        productivityDerivedDurationDays: 63,
        selectedDurationDays: 63,
      }))
      expect(rowMetadata(integratedCommissioning!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 9,
          unit: 'linkage_scenario',
        }),
      }))
      expect(String((rowMetadata(integratedCommissioning!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('integrated_commissioning_productivity_by_linkage_scenario')
    } finally {
      activeIntegratedCommissioningSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses roof waterproofing productivity assets for residential roof work rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeRoofSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'roof_waterproof_insulation') return null
        return {
          __stableCode: 'roof_waterproof_insulation',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-roof-v-test',
          stableCode: 'roof_waterproof_insulation',
          defaultDaysP20: 6,
          defaultDaysP50: 8,
          defaultDaysP80: 10,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'roof_area_m2',
          baselineProductivity: {
            p50PerDay: 120,
            unit: 'm2/day',
            basis: 'active seed fixture for residential roof waterproofing rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const roofWork = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-07-01'
      ))

      expect(roofWork).toBeTruthy()
      expect(durationDaysOf(roofWork!)).toBe(65)
      expect(roofWork!.values.smart_reference_days).toBe(65)
      expect(rowMetadata(roofWork!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'roof_waterproof_insulation',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-roof-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 120,
        productivityBaseDurationDays: 40,
        productivityFixedBufferDays: 25,
        productivityDerivedDurationDays: 65,
        selectedDurationDays: 65,
      }))
      expect(rowMetadata(roofWork!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 4800,
          unit: 'm2',
        }),
      }))
      expect(String((rowMetadata(roofWork!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('roof_waterproof_productivity_by_roof_area')
    } finally {
      activeRoofSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses facade productivity assets for residential facade closeout and scaffold removal rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeFacadeSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'curtain_wall_installation') return null
        return {
          __stableCode: 'curtain_wall_installation',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-facade-closeout-v-test',
          stableCode: 'curtain_wall_installation',
          defaultDaysP20: 13,
          defaultDaysP50: 18,
          defaultDaysP80: 23,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'facade_closeout_area_m2',
          baselineProductivity: {
            p50PerDay: 180,
            unit: 'm2/day',
            basis: 'active seed fixture for residential facade closeout rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const facadeCloseoutRows = generated.rows.filter((row) => (
        row.rowProjectionMode === 'schedule_row'
        && /^RMP-08-0[1-3]-03$/.test(String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? ''))
      ))

      expect(facadeCloseoutRows).toHaveLength(3)
      for (const facadeCloseout of facadeCloseoutRows) {
        expect(durationDaysOf(facadeCloseout)).toBe(35)
        expect(facadeCloseout.values.smart_reference_days).toBe(35)
        expect(rowMetadata(facadeCloseout).durationAssetCalculation).toEqual(expect.objectContaining({
          standardWorkDurationSeedStableCode: 'curtain_wall_installation',
          standardWorkDurationSeedResolverSource: 'active_seed',
          standardWorkDurationSeedResolverVersionId: 'runtime-seed-facade-closeout-v-test',
          standardWorkDurationSeedProductivityP50PerDay: 180,
          productivityBaseDurationDays: 18,
          productivityFixedBufferDays: 15,
          productivityDerivedDurationDays: 33,
          selectedDurationDays: 35,
          quantityProxy: expect.objectContaining({ value: 3200, unit: 'm2' }),
        }))
        expect(String((rowMetadata(facadeCloseout).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('facade_closeout_productivity_by_tower_area')
      }
    } finally {
      activeFacadeSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses elevator final-acceptance productivity assets for residential elevator inspection rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeElevatorAcceptanceSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'elevator_traction_final_acceptance') return null
        return {
          __stableCode: 'elevator_traction_final_acceptance',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-elevator-acceptance-v-test',
          stableCode: 'elevator_traction_final_acceptance',
          defaultDaysP20: 8,
          defaultDaysP50: 15,
          defaultDaysP80: 26,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'shaft',
          baselineProductivity: {
            p50PerDay: 0.25,
            unit: 'shaft/day',
            basis: 'active seed fixture for residential elevator final acceptance rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const elevatorAcceptance = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-10-03'
      ))

      expect(elevatorAcceptance).toBeTruthy()
      expect(durationDaysOf(elevatorAcceptance!)).toBe(38)
      expect(elevatorAcceptance!.values.smart_reference_days).toBe(38)
      expect(rowMetadata(elevatorAcceptance!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'elevator_traction_final_acceptance',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-elevator-acceptance-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 0.25,
        productivityBaseDurationDays: 24,
        productivityFixedBufferDays: 14,
        productivityDerivedDurationDays: 38,
        selectedDurationDays: 38,
      }))
      expect(rowMetadata(elevatorAcceptance!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 6,
          unit: 'shaft',
        }),
      }))
      expect(String((rowMetadata(elevatorAcceptance!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('elevator_final_acceptance_productivity_by_all_tower_shafts_plus_supervision_buffer')
    } finally {
      activeElevatorAcceptanceSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses integrated commissioning productivity assets for residential handover defect closeout rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeIntegratedCommissioningSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'integrated_commissioning') return null
        return {
          __stableCode: 'integrated_commissioning',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-handover-defect-closeout-v-test',
          stableCode: 'integrated_commissioning',
          defaultDaysP20: 8,
          defaultDaysP50: 12,
          defaultDaysP80: 16,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'handover_defect_zone',
          baselineProductivity: {
            p50PerDay: 0.25,
            unit: 'handover_defect_zone/day',
            basis: 'active seed fixture for residential handover defect closeout rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const defectCloseout = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-12-03'
      ))

      expect(defectCloseout).toBeTruthy()
      expect(durationDaysOf(defectCloseout!)).toBe(58)
      expect(defectCloseout!.values.smart_reference_days).toBe(58)
      expect(rowMetadata(defectCloseout!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'integrated_commissioning',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-handover-defect-closeout-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 0.25,
        productivityBaseDurationDays: 40,
        productivityFixedBufferDays: 18,
        productivityDerivedDurationDays: 58,
        selectedDurationDays: 58,
      }))
      expect(rowMetadata(defectCloseout!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 10,
          unit: 'handover_defect_zone',
        }),
      }))
      expect(String((rowMetadata(defectCloseout!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('handover_defect_closeout_productivity_by_zone')
    } finally {
      activeIntegratedCommissioningSeedSpy.mockRestore()
    }
  }, 120_000)

  it('uses outdoor utility productivity assets for residential outdoor closeout rows', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    const activeOutdoorSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'outdoor_utilities') return null
        return {
          __stableCode: 'outdoor_utilities',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-outdoor-closeout-v-test',
          stableCode: 'outdoor_utilities',
          defaultDaysP20: 10,
          defaultDaysP50: 14,
          defaultDaysP80: 18,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'outdoor_closeout_frontage_m',
          baselineProductivity: {
            p50PerDay: 12,
            unit: 'm/day',
            basis: 'active seed fixture for residential outdoor closeout rows',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
      const outdoorCloseout = generated.rows.find((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-11-03'
      ))

      expect(outdoorCloseout).toBeTruthy()
      expect(durationDaysOf(outdoorCloseout!)).toBe(33)
      expect(outdoorCloseout!.values.smart_reference_days).toBe(33)
      expect(rowMetadata(outdoorCloseout!).durationAssetCalculation).toEqual(expect.objectContaining({
        standardWorkDurationSeedStableCode: 'outdoor_utilities',
        standardWorkDurationSeedResolverSource: 'active_seed',
        standardWorkDurationSeedResolverVersionId: 'runtime-seed-outdoor-closeout-v-test',
        standardWorkDurationSeedProductivityP50PerDay: 12,
        productivityBaseDurationDays: 19,
        productivityFixedBufferDays: 14,
        productivityDerivedDurationDays: 33,
        selectedDurationDays: 33,
      }))
      expect(rowMetadata(outdoorCloseout!).durationAssetCalculation).toEqual(expect.objectContaining({
        quantityProxy: expect.objectContaining({
          value: 218,
          unit: 'm',
        }),
      }))
      expect(String((rowMetadata(outdoorCloseout!).durationAssetCalculation as Record<string, unknown>).selectionRule)).toContain('outdoor_closeout_productivity_by_frontage')
    } finally {
      activeOutdoorSeedSpy.mockRestore()
    }
  }, 120_000)

  it('generates bounded field-oriented default master plans for infrastructure, renovation, and modular business types', async () => {
    const businessTypes = new Set(['transportation_hub', 'sports_culture', 'tod_upper_cover', 'renovation', 'modular_building'])
    const failures = await collectDefaultMasterPlanProbeFailures(
      PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.filter((probe) => businessTypes.has(probe.businessType)),
    )

    expect(failures).toEqual([])
  }, 240_000)

  it('does not inherit new-build foundation and basement base rows for renovation default master plans', async () => {
    const renovationProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'renovation')
    expect(renovationProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(renovationProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const titles = scheduleRows.map((row) => String(row.values.title ?? row.values.name ?? ''))
    const hasTitle = (pattern: RegExp) => titles.some((title) => pattern.test(title))


    expect(hasTitle(/既有结构检测鉴定/)).toBe(true)
    expect(hasTitle(/临时导改/)).toBe(true)
    expect(hasTitle(/结构加固/)).toBe(true)
    expect(hasTitle(/装修恢复/)).toBe(true)
    expect(hasTitle(/消防机电联调/)).toBe(true)
    expect(hasTitle(/运营恢复移交/)).toBe(true)

    for (const code of ['BTMP-RNV-01', 'BTMP-RNV-02']) {
      const activity = scheduleRows.find((row) => rowCode(row) === code)
      expect(activity, code).toBeTruthy()
      expect((rowMetadata(activity!).durationAssetMapping as Record<string, unknown>)
        .standardWorkDurationSeedStableCode, code).toBe('expert_domain_renovation_retrofit')
    }

    expect(scheduleRows.filter((row) => {
      const metadata = rowMetadata(row)
      const businessTypeMasterPlan = (metadata.businessTypeMasterPlan ?? {}) as Record<string, unknown>
      return businessTypeMasterPlan.profileSourceType === 'business_type_base_master_plan_profile_v1'
    })).toEqual([])
    expect(titles.filter((title) => /基坑|土方|桩基|地下结构|正负零|电梯安装/.test(title))).toEqual([])
  }, 120_000)

  it('does not inherit generic cast-in-place base rows for modular building default master plans', async () => {
    const modularProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'modular_building')
    expect(modularProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(modularProbe!, {
      projectFactOverrides: {
        basementLevelCount: 0,
        foundationDepthM: 2,
      },
      scopeOverrides: {
        basement_level_count: 0,
        foundation_depth_m: 2,
      },
    })
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const titles = scheduleRows.map((row) => String(row.values.title ?? row.values.name ?? ''))
    const hasTitle = (pattern: RegExp) => titles.some((title) => pattern.test(title))

    expect(hasTitle(/模块深化设计/)).toBe(true)
    expect(hasTitle(/工厂批量生产/)).toBe(true)
    expect(hasTitle(/模块基础与吊装道路准备/)).toBe(true)
    expect(hasTitle(/运输吊装与结构连接/)).toBe(true)
    expect(hasTitle(/围护防水与拼缝封闭/)).toBe(true)
    expect(hasTitle(/机电接驳与系统贯通/)).toBe(true)
    expect(hasTitle(/单体调试与系统联合调试/)).toBe(true)

    const siteFoundation = scheduleRows.find((row) => rowCode(row) === 'BTMP-MOD-03')
    expect(siteFoundation).toBeTruthy()
    expect((rowMetadata(siteFoundation!).durationAssetMapping as Record<string, unknown>)
      .standardWorkDurationSeedStableCode).toBe('shallow_foundation_concrete_structure')

    expect(scheduleRows.filter((row) => {
      const metadata = rowMetadata(row)
      const businessTypeMasterPlan = (metadata.businessTypeMasterPlan ?? {}) as Record<string, unknown>
      return businessTypeMasterPlan.profileSourceType === 'business_type_base_master_plan_profile_v1'
    })).toEqual([])
    expect(titles.filter((title) => /地下结构|正负零|主体结构施工与分区验收|二次结构与砌体|电梯安装/.test(title))).toEqual([])
  }, 120_000)

  it('uses shallow-foundation controls when an industrial wizard project has no basement', async () => {
    const industrialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'industrial')
    expect(industrialProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(industrialProbe!, {
      projectFactOverrides: {
        basementLevelCount: 0,
        foundationDepthM: 2,
        physicalZoneTypeCodes: ['tower', 'outdoor_site', 'logistics_yard'],
        projectFeatures: {
          foundationFormCodes: ['bored_pile'],
        },
      },
      scopeOverrides: {
        basement_level_count: 0,
        foundation_depth_m: 2,
        physicalZoneTypeCodes: ['tower', 'outdoor_site', 'logistics_yard'],
      },
    })
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const shallowFoundationControl = scheduleRows.find((row) => rowCode(row) === 'BTMP-BASE-04')
    const shallowEarthworkControl = scheduleRows.find((row) => rowCode(row) === 'BTMP-BASE-02')
    const titles = scheduleRows.map((row) => String(row.values.title ?? row.values.name ?? ''))

    expect(shallowFoundationControl).toBeTruthy()
    expect(shallowFoundationControl?.values.title).toBe('基础承台地梁施工与基础验收')
    expect(shallowFoundationControl?.values.execution_phase).toBe('foundation_pit_pile')
    expect((rowMetadata(shallowEarthworkControl!).durationAssetMapping as Record<string, unknown>)
      .standardWorkDurationSeedStableCode).toBe('earthwork_excavation_transport')
    expect((rowMetadata(shallowFoundationControl!).durationAssetMapping as Record<string, unknown>)
      .standardWorkDurationSeedStableCode).toBe('shallow_foundation_concrete_structure')
    expect(scheduleRows.filter((row) => row.values.execution_phase === 'basement_structure')).toEqual([])
    expect(titles.filter((title) => /地下结构施工与出正负零|地下连续墙导墙|基坑支护降水/.test(title))).toEqual([])
  }, 120_000)

  it('keeps interleaved industrial equipment packages in drilldown instead of presenting false whole-package order', async () => {
    const industrialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'industrial')
    expect(industrialProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(industrialProbe!, {
      projectFactOverrides: {
        basementLevelCount: 0,
        foundationDepthM: 2,
      },
      scopeOverrides: {
        basement_level_count: 0,
        foundation_depth_m: 2,
      },
    })
    const interleavedPackageCodes = new Set(['IPL-02-01-01', 'IPL-03-01-01', 'IPL-03-01-02'])
    const interleavedRows = generated.rows.filter((row) => interleavedPackageCodes.has(rowCode(row)))

    expect(new Set(interleavedRows.map((row) => rowCode(row)))).toEqual(interleavedPackageCodes)
    expect(interleavedRows.every((row) => row.rowProjectionMode === 'linked_projection')).toBe(true)
    expect(interleavedRows.every((row) => row.scheduleParticipation !== 'primary_schedule')).toBe(true)
    expect(generated.rows.some((row) => (
      row.rowProjectionMode === 'schedule_row'
      && rowCode(row) === 'BTMP-IND-04'
    ))).toBe(true)
  }, 120_000)

  it('does not invent a second building or label functional lanes as buildings for a single-building venue', async () => {
    const sportsProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'sports_culture')
    expect(sportsProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(sportsProbe!, {
      projectFactOverrides: {
        buildingCount: 1,
        totalAreaM2: 80_000,
        standardFloorCount: 4,
        highestBuildingFloorCount: 6,
      },
      scopeOverrides: {
        building_count: 1,
        total_area_m2: 80_000,
        standard_floor_count: 4,
        highest_building_floor_count: 6,
      },
    })
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const buildingObjectIds = new Set(scheduleRows
      .map((row) => String(row.values.building_object_id ?? '').trim())
      .filter(Boolean))
    const titles = scheduleRows.map((row) => String(row.values.title ?? row.values.name ?? ''))

    expect(buildingObjectIds.size).toBeLessThanOrEqual(1)
    expect(titles.some((title) => /2#楼/.test(title))).toBe(false)
    expect(titles.some((title) => /（1#楼）/.test(title))).toBe(false)
    for (const stableCode of ['BTMP-SPC-01', 'BTMP-SPC-02', 'BTMP-SPC-03', 'BTMP-SPC-04', 'BTMP-SPC-05', 'BTMP-SPC-06']) {
      expect(scheduleRows.filter((row) => rowCode(row) === stableCode), stableCode).toHaveLength(1)
    }
    expect(scheduleRows.some((row) => rowCode(row) === 'STL-01-01-01')).toBe(false)
    expect(generated.rows.some((row) => (
      rowCode(row) === 'STL-01-01-01' && row.rowProjectionMode === 'linked_projection'
    ))).toBe(true)
    for (const stableCode of ['STL-03-01-01', '09-01', '10-01', 'SPC-04-01-01']) {
      expect(scheduleRows.filter((row) => rowCode(row) === stableCode).length, stableCode).toBeLessThanOrEqual(1)
    }
  }, 120_000)

  it('keeps deep-foundation controls without inventing a basement for a zero-basement project', async () => {
    const industrialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'industrial')
    expect(industrialProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(industrialProbe!, {
      projectFactOverrides: {
        basementLevelCount: 0,
        foundationDepthM: 8,
        projectFeatures: { foundationFormCodes: ['bored_pile', 'diaphragm_wall'] },
      },
      scopeOverrides: {
        basement_level_count: 0,
        foundation_depth_m: 8,
      },
    })
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const supportControl = scheduleRows.find((row) => rowCode(row) === 'BTMP-BASE-02')
    const foundationHandover = scheduleRows.find((row) => rowCode(row) === 'BTMP-BASE-04')

    expect(supportControl?.values.title).toBe('基坑支护降水与土方开挖')
    expect(foundationHandover?.values.title).toBe('深基础承台地梁施工与基础验收')
    expect(foundationHandover?.values.execution_phase).toBe('foundation_pit_pile')
    expect((rowMetadata(foundationHandover!).durationAssetMapping as Record<string, unknown>)
      .standardWorkDurationSeedStableCode).toBe('shallow_foundation_concrete_structure')
    expect(scheduleRows.filter((row) => row.values.execution_phase === 'basement_structure')).toEqual([])
    expect(scheduleRows.some((row) => /地下结构施工与出正负零/.test(String(row.values.title ?? '')))).toBe(false)
  }, 120_000)

  it('keeps the dedicated modular master-plan sequence self-contained and date-feasible', async () => {
    const modularProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'modular_building')
    expect(modularProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(modularProbe!)
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const rowByClientId = new Map(profileRows.map((row) => [(row as any).clientRowId, row]))
    const firstProfileRow = profileRows.find((row) => rowCode(row) === 'BTMP-MOD-01')

    expect(firstProfileRow).toBeTruthy()
    expect((firstProfileRow!.predecessorDependencies ?? []).some((dependency) => (
      dependency.intentCode === 'business_type_profile_phase_anchor'
    ))).toBe(false)

    for (const row of profileRows) {
      for (const dependency of row.predecessorDependencies ?? []) {
        const predecessor = rowByClientId.get(dependency.clientRowId)
        if (!predecessor) continue
        const lagDays = Number(dependency.lagDays ?? 0)
        const rowStart = dateMs(row.values.planned_start_date)
        if (dependency.dependencyType === 'FS') {
          expect(rowStart).toBeGreaterThanOrEqual(dateMs(predecessor.values.planned_end_date) + (lagDays + 1) * 86_400_000)
        } else if (dependency.dependencyType === 'SS') {
          expect(rowStart).toBeGreaterThanOrEqual(dateMs(predecessor.values.planned_start_date) + lagDays * 86_400_000)
        }
      }
    }
  }, 120_000)

  it('anchors renovation procurement to existing-condition survey before long-lead release', async () => {
    const renovationProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'renovation')
    expect(renovationProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(renovationProbe!)
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const rowByCode = new Map(profileRows.map((row) => [rowCode(row), row]))
    const survey = rowByCode.get('BTMP-RNV-01')
    const designRelease = rowByCode.get('BTMP-RNV-P01')
    const longLeadDelivery = rowByCode.get('BTMP-RNV-P02')

    expect(survey).toBeTruthy()
    expect(designRelease).toBeTruthy()
    expect(longLeadDelivery).toBeTruthy()
    expect((designRelease?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === survey?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((longLeadDelivery?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === designRelease?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
  }, 120_000)

  it('gates modular factory production and onsite hoisting with procurement and logistics controls', async () => {
    const modularProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'modular_building')
    expect(modularProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(modularProbe!)
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const rowByCode = new Map(profileRows.map((row) => [rowCode(row), row]))
    const design = rowByCode.get('BTMP-MOD-01')
    const procurementRelease = rowByCode.get('BTMP-MOD-P01')
    const transportAndLiftingReadiness = rowByCode.get('BTMP-MOD-P02')
    const factoryProduction = rowByCode.get('BTMP-MOD-02')
    const onsiteHoisting = rowByCode.get('BTMP-MOD-04')

    expect(design).toBeTruthy()
    expect(procurementRelease).toBeTruthy()
    expect(transportAndLiftingReadiness).toBeTruthy()
    expect(factoryProduction).toBeTruthy()
    expect(onsiteHoisting).toBeTruthy()
    expect((procurementRelease?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === design?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((factoryProduction?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === procurementRelease?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((transportAndLiftingReadiness?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === design?.clientRowId
      && dependency.dependencyType === 'SS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((onsiteHoisting?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === transportAndLiftingReadiness?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, any>
    expect(assembly).toEqual(expect.objectContaining({
      status: 'executable_default_master_plan_ready',
      readyForWizardCommit: true,
      minimumScheduleRowCount: 60,
      operationalRowFloor: 60,
      assetInventoryExhausted: false,
    }))
    expect(assembly.scheduleRowCount).toBeGreaterThanOrEqual(60)
    expect(assembly.scheduleRowCount).toBeLessThanOrEqual(assembly.maximumScheduleRowCount)
    expect(assembly.promotedLinkedProjectionRowCount).toBeGreaterThan(0)
  }, 120_000)

  it('keeps TOD tower fitout and sectional handover after upper-cover tower structure completion', async () => {
    const todProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'tod_upper_cover')
    expect(todProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(todProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const rowByCode = new Map(scheduleRows.map((row) => [rowCode(row), row]))
    const towerStructure = rowByCode.get('BTMP-TOD-03')
    const basementStructure = rowByCode.get('BTMP-BASE-04')
    const transferDeck = rowByCode.get('BTMP-TOD-02')
    const towerSecondaryEnvelopeMep = rowByCode.get('BTMP-TOD-04A')
    const towerFitoutHandover = rowByCode.get('BTMP-TOD-04B')
    const finalInterfaceAcceptance = rowByCode.get('BTMP-TOD-06')
    const completionFiling = scheduleRows.find((row) => row.values.contractual_closeout_role === 'completion_filing')

    expect(towerStructure).toBeTruthy()
    expect(basementStructure).toBeTruthy()
    expect(transferDeck).toBeTruthy()
    expect(towerSecondaryEnvelopeMep).toBeTruthy()
    expect(towerFitoutHandover).toBeTruthy()
    expect(finalInterfaceAcceptance).toBeTruthy()
    expect(completionFiling).toBeTruthy()
    expect((transferDeck?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === basementStructure?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect(dateMs(transferDeck?.values.planned_start_date)).toBeGreaterThan(dateMs(basementStructure?.values.planned_end_date))
    expect((towerFitoutHandover?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === towerStructure?.clientRowId
      && dependency.dependencyType === 'FF'
      && Number(dependency.lagDays ?? 0) === 120
    ))).toBe(true)
    expect((finalInterfaceAcceptance?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === towerFitoutHandover?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect(dateMs(towerFitoutHandover?.values.planned_end_date)).toBeGreaterThan(dateMs(towerStructure?.values.planned_end_date))
    expect(dateMs(finalInterfaceAcceptance?.values.planned_start_date)).toBeGreaterThan(dateMs(towerFitoutHandover?.values.planned_end_date))
    expect(dateMs(completionFiling?.values.planned_start_date)).toBeGreaterThan(dateMs(finalInterfaceAcceptance?.values.planned_end_date))
  }, 120_000)

  it('releases industrial steel erection after fabrication delivery and lags enclosure from steel start', async () => {
    const industrialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'industrial')
    expect(industrialProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(industrialProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const rowByCode = new Map(scheduleRows.map((row) => [rowCode(row), row]))
    const fabricationDelivery = rowByCode.get('BTMP-IND-P02')
    const steelErection = rowByCode.get('BTMP-IND-01')
    const enclosure = rowByCode.get('BTMP-IND-02')

    expect(fabricationDelivery?.values.title).toMatch(/钢构件.*排产.*到货/)
    expect(steelErection).toBeTruthy()
    expect(enclosure).toBeTruthy()
    expect((steelErection?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === fabricationDelivery?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((enclosure?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === steelErection?.clientRowId
      && dependency.dependencyType === 'SS'
      && Number(dependency.lagDays ?? 0) === 60
    ))).toBe(true)
    expect(dateMs(enclosure?.values.planned_start_date)).toBeGreaterThan(dateMs(steelErection?.values.planned_start_date))
  }, 120_000)

  it('releases hotel fitout from a real workface and keeps promoted controls flat but date-linked', async () => {
    const hotelProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'hotel')
    expect(hotelProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(hotelProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const rowById = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
    const secondaryStructure = scheduleRows.find((row) => rowCode(row) === 'BTMP-BASE-06')
    const mockup = scheduleRows.find((row) => rowCode(row) === 'BTMP-HTL-01')
    const guestroomBatch = scheduleRows.find((row) => rowCode(row) === 'BTMP-HTL-02')
    const promotedGuestroom = scheduleRows.find((row) => rowCode(row) === 'HTL-01-01-02')

    expect(secondaryStructure).toBeTruthy()
    expect(mockup).toBeTruthy()
    expect(guestroomBatch).toBeTruthy()
    expect(promotedGuestroom).toBeTruthy()
    expect((mockup?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === secondaryStructure?.clientRowId
      && dependency.dependencyType === 'SS'
      && Number(dependency.lagDays ?? 0) === 30
      && dependency.intentCode === 'hotel_secondary_structure_to_mockup_workface_release'
    ))).toBe(true)
    expect((guestroomBatch?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === mockup?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect(dateMs(mockup?.values.planned_start_date)).toBeGreaterThan(dateMs(secondaryStructure?.values.planned_start_date))
    expect(dateMs(guestroomBatch?.values.planned_start_date)).toBeGreaterThan(dateMs(mockup?.values.planned_end_date))

    const promotedAnchorDependency = (promotedGuestroom?.predecessorDependencies ?? []).find((dependency) => (
      dependency.intentCode === 'executable_default_master_plan_logical_anchor_workface'
    ))
    const promotedAnchor = promotedAnchorDependency
      ? rowById.get(String(promotedAnchorDependency.clientRowId))
      : null
    expect(promotedGuestroom?.parentClientRowId).not.toBe(mockup?.clientRowId)
    expect(promotedAnchor).toBeTruthy()
    expect(promotedAnchor?.values.execution_phase).toBe(promotedGuestroom?.values.execution_phase)
    expect(dateMs(promotedGuestroom?.values.planned_start_date)).toBeGreaterThanOrEqual(
      dateMs(promotedAnchor?.values.planned_start_date),
    )
  }, 120_000)

  it('uses business-specific below-grade workface releases for hospital, school, and data-center structures', async () => {
    const probes = new Map(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => [probe.businessType, probe]))
    const cases = [
      { businessType: 'hospital', successorCode: 'BTMP-HSP-01', lagDays: 75, intentCode: 'hospital_below_grade_to_medical_block_workface_release' },
      { businessType: 'school', successorCode: 'BTMP-SCH-01', lagDays: 30, intentCode: 'school_below_grade_to_teaching_block_workface_release' },
      { businessType: 'data_center', successorCode: 'BTMP-DTC-01', lagDays: 60, intentCode: 'data_center_below_grade_to_data_hall_workface_release' },
    ] as const

    for (const testCase of cases) {
      const generated = await generateDefaultMasterPlanForProbe(probes.get(testCase.businessType)!)
      const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
      const belowGrade = scheduleRows.find((row) => rowCode(row) === 'BTMP-BASE-04')
      const successor = scheduleRows.find((row) => rowCode(row) === testCase.successorCode)
      expect(belowGrade, `${testCase.businessType}: below-grade control`).toBeTruthy()
      expect(successor, `${testCase.businessType}: specialty structure control`).toBeTruthy()
      expect((successor?.predecessorDependencies ?? []).some((dependency) => (
        dependency.clientRowId === belowGrade?.clientRowId
        && dependency.dependencyType === 'SS'
        && Number(dependency.lagDays ?? 0) === testCase.lagDays
        && dependency.intentCode === testCase.intentCode
      )), `${testCase.businessType}: governed workface release`).toBe(true)
      expect(dateMs(successor?.values.planned_start_date)).toBeGreaterThan(dateMs(belowGrade?.values.planned_start_date))
    }
  }, 180_000)

  it('keeps hospital clinical fitout and medical performance validation on the executable completion path', async () => {
    const hospitalProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'hospital')
    expect(hospitalProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(hospitalProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const envelope = scheduleRows.find((row) => rowCode(row) === 'BTMP-BASE-07')
    const outdoorCompletion = scheduleRows.find((row) => rowCode(row) === 'BTMP-BASE-11')
    const departmentRoughHandover = scheduleRows.find((row) => rowCode(row) === 'BTMP-HSP-02')
    const cleanroomFitout = scheduleRows.find((row) => rowCode(row) === 'BTMP-HSP-03')
    const clinicalFitout = scheduleRows.find((row) => rowCode(row) === 'BTMP-HSP-03B')
    const medicalEquipment = scheduleRows.find((row) => rowCode(row) === 'BTMP-HSP-05')
    const performanceValidation = scheduleRows.find((row) => rowCode(row) === 'BTMP-HSP-05A')
    const integratedCommissioning = scheduleRows.find((row) => rowCode(row) === 'BTMP-HSP-06')
    const finalHandover = scheduleRows.find((row) => rowCode(row) === 'BTMP-HSP-07')

    expect(envelope).toBeTruthy()
    expect(outdoorCompletion).toBeTruthy()
    expect(departmentRoughHandover).toBeTruthy()
    expect(cleanroomFitout).toBeTruthy()
    expect(clinicalFitout).toBeTruthy()
    expect(medicalEquipment).toBeTruthy()
    expect(performanceValidation).toBeTruthy()
    expect(integratedCommissioning).toBeTruthy()
    expect(finalHandover).toBeTruthy()
    expect(Number(clinicalFitout?.values.smart_reference_days)).toBeGreaterThanOrEqual(150)
    expect(Number(performanceValidation?.values.smart_reference_days)).toBeGreaterThanOrEqual(60)
    expect(rowMetadata(clinicalFitout!).durationAssetCalculation).toEqual(expect.objectContaining({
      standardWorkDurationSeedStableCode: 'interior_public_finish',
      t2RhythmTemplateId: 't2-hospital-clinical-department-fitout-rhythm-v1',
    }))
    expect((cleanroomFitout?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === envelope?.clientRowId
      && dependency.dependencyType === 'SS'
      && Number(dependency.lagDays ?? 0) === 45
      && dependency.intentCode === 'hospital_watertight_zone_to_cleanroom_fitout_release'
    ))).toBe(true)
    expect((clinicalFitout?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === departmentRoughHandover?.clientRowId
      && dependency.dependencyType === 'SS'
      && Number(dependency.lagDays ?? 0) === 60
    ))).toBe(true)
    expect((clinicalFitout?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === envelope?.clientRowId
      && dependency.dependencyType === 'SS'
      && Number(dependency.lagDays ?? 0) === 45
    ))).toBe(true)
    expect((medicalEquipment?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === clinicalFitout?.clientRowId
      && dependency.dependencyType === 'SS'
      && Number(dependency.lagDays ?? 0) === 120
    ))).toBe(true)
    expect((performanceValidation?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === medicalEquipment?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((integratedCommissioning?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === performanceValidation?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((finalHandover?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === integratedCommissioning?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)
    expect((finalHandover?.predecessorDependencies ?? []).some((dependency) => (
      dependency.intentCode === 'business_type_profile_phase_anchor'
    ))).toBe(false)
    expect((finalHandover?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === outdoorCompletion?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
      && dependency.intentCode === 'hospital_outdoor_completion_to_final_handover'
    ))).toBe(true)
    expect((finalHandover?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === outdoorCompletion?.clientRowId
      && dependency.intentCode === 'business_type_master_plan_profile_sequence'
    ))).toBe(false)
    expect(dateMs(clinicalFitout?.values.planned_start_date)).toBeGreaterThan(dateMs(envelope?.values.planned_start_date))
    expect(dateMs(performanceValidation?.values.planned_start_date)).toBeGreaterThan(dateMs(medicalEquipment?.values.planned_end_date))
    expect(dateMs(integratedCommissioning?.values.planned_start_date)).toBeGreaterThan(dateMs(performanceValidation?.values.planned_end_date))
    expect(dateMs(finalHandover?.values.planned_start_date)).toBeGreaterThan(dateMs(integratedCommissioning?.values.planned_end_date))
  }, 120_000)

  it('keeps transportation-hub platform readiness before peak-flow rehearsal and operation handover', async () => {
    const hubProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'transportation_hub')
    expect(hubProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(hubProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const platformReadiness = scheduleRows.find((row) => rowCode(row) === 'BTMP-TRH-05')
    const peakFlowRehearsal = scheduleRows.find((row) => rowCode(row) === 'BTMP-TRH-05A')
    const operationHandover = scheduleRows.find((row) => rowCode(row) === 'BTMP-TRH-06')

    expect(platformReadiness).toBeTruthy()
    expect(peakFlowRehearsal).toBeTruthy()
    expect(operationHandover).toBeTruthy()
    expect(rowMetadata(platformReadiness!).durationAssetCalculation).toEqual(expect.objectContaining({
      t2RhythmTemplateId: 't2-transport-hub-platform-canopy-trackside-interface-rhythm-v1',
    }))
    expect(rowMetadata(peakFlowRehearsal!).durationAssetCalculation).toEqual(expect.objectContaining({
      t2RhythmTemplateId: 't2-transportation-hub-public-system-transfer-rhythm-v1',
    }))
    expect((peakFlowRehearsal?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === platformReadiness?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
      && dependency.intentCode === 'hub_platform_readiness_to_peak_flow_rehearsal'
    ))).toBe(true)
    expect((operationHandover?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === peakFlowRehearsal?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
      && dependency.intentCode === 'hub_peak_flow_rehearsal_to_operation_handover'
    ))).toBe(true)
    expect(dateMs(peakFlowRehearsal?.values.planned_start_date)).toBeGreaterThan(dateMs(platformReadiness?.values.planned_end_date))
    expect(dateMs(operationHandover?.values.planned_start_date)).toBeGreaterThan(dateMs(peakFlowRehearsal?.values.planned_end_date))
  }, 120_000)

  it('converges hospital parallel completion streams at filing instead of over-constraining medical gas', async () => {
    const hospitalProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'hospital')
    expect(hospitalProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(hospitalProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const medicalGas = scheduleRows.find((row) => rowCode(row) === 'BTMP-HSP-04')
    const cleanroomEnvelope = scheduleRows.find((row) => rowCode(row) === 'CLN-01-01-01')
    const completionFiling = scheduleRows.find((row) => row.values.contractual_closeout_role === 'completion_filing')
    const latestPhysicalEnd = Math.max(...scheduleRows
      .filter((row) => row.values.duration_contribution_mode === 'duration_bearing')
      .filter((row) => row.values.plan_item_kind === 'work_task')
      .map((row) => dateMs(row.values.planned_end_date)))

    expect(medicalGas).toBeTruthy()
    expect(cleanroomEnvelope).toBeTruthy()
    expect(cleanroomEnvelope?.values.execution_phase).toBe('interior_fitout_terminal')
    expect(completionFiling).toBeTruthy()
    expect(medicalGas?.predecessorDependencies?.length ?? 0).toBeLessThanOrEqual(8)
    expect((medicalGas?.predecessorDependencies ?? []).some((dependency) => (
      dependency.intentCode === 'executable_default_master_plan_physical_handoff_convergence'
    ))).toBe(false)
    expect((completionFiling?.predecessorDependencies ?? []).some((dependency) => (
      dependency.intentCode === 'executable_default_master_plan_contractual_completion_convergence'
    ))).toBe(true)
    expect(dateMs(completionFiling?.values.planned_start_date)).toBeGreaterThan(latestPhysicalEnd)
  }, 120_000)

  it('adds hospital-specific master-plan rows instead of only generic building rows', async () => {
    const hospitalProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'hospital')
    expect(hospitalProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(hospitalProbe!)
    const titles = scheduleRowTitles(generated.rows)
    const hasTitle = (pattern: RegExp) => titles.some((title) => pattern.test(title))

    expect(hasTitle(/医技.*结构|医技楼/)).toBe(true)
    expect(hasTitle(/手术部|洁净/)).toBe(true)
    expect(hasTitle(/医疗气体/)).toBe(true)
    expect(hasTitle(/医疗专项.*调试|卫生.*验收|净化*调试/)).toBe(true)
    expect(titles.some((title) => /危大工程识别与清单确认/.test(title))).toBe(false)
  }, 120_000)

  it('adds data-center-specific master-plan rows instead of only generic building rows', async () => {
    const dataCenterProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'data_center')
    expect(dataCenterProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(dataCenterProbe!)
    const titles = scheduleRowTitles(generated.rows)
    const hasTitle = (pattern: RegExp) => titles.some((title) => pattern.test(title))

    expect(hasTitle(/机房.*白区|白区.*装修/)).toBe(true)
    expect(hasTitle(/供配电|UPS|柴油发电/)).toBe(true)
    expect(hasTitle(/制冷|冷冻水|精密空调/)).toBe(true)
    expect(hasTitle(/综合联调|负载测试|带载测试/)).toBe(true)
    expect(hasTitle(/投产|验收|移交/)).toBe(true)
    expect(titles.some((title) => /危大工程识别与清单确认/.test(title))).toBe(false)
  }, 120_000)

  it('connects data-center commissioning controls to physical installation and room handoff controls', async () => {
    const dataCenterProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'data_center')
    expect(dataCenterProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(dataCenterProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const powerInstallation = scheduleRows.find((row) => rowCode(row) === 'BTMP-DTC-03')
    const coolingInstallation = scheduleRows.find((row) => rowCode(row) === 'BTMP-DTC-04')
    const monitoringIntegration = scheduleRows.find((row) => rowCode(row) === 'BTMP-DTC-05')
    const integratedLoadTest = scheduleRows.find((row) => rowCode(row) === 'BTMP-DTC-06')
    const rowById = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
    expect(powerInstallation).toBeTruthy()
    expect(coolingInstallation).toBeTruthy()
    expect(monitoringIntegration).toBeTruthy()
    expect(integratedLoadTest).toBeTruthy()
    expect((monitoringIntegration?.predecessorDependencies ?? []).map((dependency) => dependency.clientRowId))
      .toEqual(expect.arrayContaining([powerInstallation!.clientRowId, coolingInstallation!.clientRowId]))
    expect((integratedLoadTest?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === monitoringIntegration!.clientRowId
      && dependency.dependencyType === 'FS'
    )), JSON.stringify((integratedLoadTest?.predecessorDependencies ?? []).map((dependency) => ({
      predecessorCode: rowCode(rowById.get(dependency.clientRowId) as any),
      dependencyType: dependency.dependencyType,
      lagDays: dependency.lagDays,
      intentCode: dependency.intentCode,
    })))).toBe(true)
    expect(generated.rows.some((row) => (
      rowCode(row) === 'DTC-02-01-01' && row.rowProjectionMode === 'linked_projection'
    ))).toBe(true)
  }, 120_000)

  it('releases renovation and modular trial-operation work from physical completion controls', async () => {
    for (const businessType of ['renovation', 'modular_building']) {
      const probe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((candidate) => (
        candidate.businessType === businessType
      ))
      expect(probe).toBeTruthy()
      const generated = await generateDefaultMasterPlanForProbe(probe!)
      const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
      const rowById = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
      const trialOperationRows = scheduleRows.filter((row) => (
        row.values.execution_phase === 'commissioning'
        && /试运行|联动调试|功能复测/.test(String(row.values.title ?? ''))
      ))

      expect(trialOperationRows.length, businessType).toBeGreaterThan(0)
      for (const row of trialOperationRows) {
        const seen = new Set<string>()
        const reachableRows: Array<Record<string, unknown>> = []
        const queue = [...(row.predecessorDependencies ?? [])]
        let reachesPhysicalCompletion = false
        const physicalExecutionPhases = new Set([
          'foundation_pit_pile',
          'basement_structure',
          'superstructure_rhythm',
          'secondary_structure_fitout_roughin',
          'envelope_roof_facade',
          'mep_roughin',
          'elevator_installation',
          'interior_fitout_terminal',
          'outdoor_municipal_landscape',
        ])
        while (queue.length > 0 && !reachesPhysicalCompletion) {
          const dependency = queue.shift()!
          const predecessor = rowById.get(dependency.clientRowId)
          if (!predecessor || seen.has(predecessor.clientRowId)) continue
          seen.add(predecessor.clientRowId)
          reachableRows.push({
            code: rowCode(predecessor),
            phase: predecessor.values.execution_phase,
            dependencyType: dependency.dependencyType,
            intentCode: dependency.intentCode,
          })
          reachesPhysicalCompletion = physicalExecutionPhases.has(String(predecessor.values.execution_phase ?? ''))
            && ['FS', 'FF'].includes(String(dependency.dependencyType ?? ''))
          queue.push(...(predecessor.predecessorDependencies ?? []))
        }
        expect(reachesPhysicalCompletion, (
          `${businessType}:${rowCode(row)}:${String(row.values.title ?? '')}:${JSON.stringify(reachableRows)}`
        )).toBe(true)
      }
    }
  }, 180_000)

  it('chains hub and venue contractual milestones after their business-type acceptance controls', async () => {
    const expectations = [
      { businessType: 'transportation_hub', terminalCode: 'BTMP-TRH-06' },
      { businessType: 'sports_culture', terminalCode: 'BTMP-SPC-06' },
    ] as const

    for (const expectation of expectations) {
      const probe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((candidate) => (
        candidate.businessType === expectation.businessType
      ))
      expect(probe).toBeTruthy()
      const generated = await generateDefaultMasterPlanForProbe(probe!)
      const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
      const rowById = new Map(scheduleRows.map((row) => [row.clientRowId, row]))
      const titles = scheduleRows.map((row) => String(row.values.title ?? row.values.name ?? ''))
      const completionFiling = scheduleRows.find((row) => /竣工验收备案完成/.test(String(row.values.title ?? '')))
      const propertyHandover = scheduleRows.find((row) => row.values.contractual_closeout_role === 'property_handover')

      expect(titles.some((title) => /整体提升专项验收通过/.test(title))).toBe(false)
      expect(completionFiling, expectation.businessType).toBeTruthy()
      expect(propertyHandover, expectation.businessType).toBeTruthy()
      expect((completionFiling?.predecessorDependencies ?? []).some((dependency) => (
        rowCode(rowById.get(dependency.clientRowId) as any) === expectation.terminalCode
      )), expectation.businessType).toBe(true)
      expect((propertyHandover?.predecessorDependencies ?? []).some((dependency) => (
        dependency.clientRowId === completionFiling?.clientRowId
      )), expectation.businessType).toBe(true)
    }
  }, 180_000)

  it('uses data-center domain quantity proxies for mission-critical profile durations', async () => {
    const dataCenterProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'data_center')
    expect(dataCenterProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(dataCenterProbe!)
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const rowByStableCode = new Map(profileRows.map((row) => [String(rowMetadata(row).stableCode ?? row.values.standard_work_code ?? ''), row]))
    const expectations = [
      { code: 'BTMP-DTC-02', unit: 'm2', basisSignal: 'data hall white-space area' },
      { code: 'BTMP-DTC-03', unit: 'power_module', basisSignal: 'critical power module' },
      { code: 'BTMP-DTC-04', unit: 'cooling_loop', basisSignal: 'cooling loop' },
      { code: 'BTMP-DTC-06', unit: 'load_test_scenario', basisSignal: 'load-test scenario' },
    ]

    for (const expectation of expectations) {
      const row = rowByStableCode.get(expectation.code)
      expect(row).toBeTruthy()
      const calculation = rowMetadata(row!).durationAssetCalculation as Record<string, unknown>
      const quantityProxy = (calculation.quantityProxy ?? {}) as Record<string, unknown>

      expect(quantityProxy).toEqual(expect.objectContaining({
        source: 'project_scale_facts',
        unit: expectation.unit,
        value: expect.any(Number),
      }))
      expect(Number(quantityProxy.value)).toBeGreaterThan(0)
      expect(String(quantityProxy.basis ?? '').toLowerCase()).toContain(expectation.basisSignal)
      expect(String(calculation.selectionRule ?? '')).toContain('project_scale')
      expect(calculation.productivityDerivedDurationDays).toEqual(expect.any(Number))
    }
  }, 120_000)

  it('gates data-center critical equipment installation with design release and long-lead delivery controls', async () => {
    const dataCenterProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => (
      probe.businessType === 'data_center'
    ))
    expect(dataCenterProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(dataCenterProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const rowByCode = new Map(scheduleRows.map((row) => [rowCode(row), row]))
    const designRelease = rowByCode.get('BTMP-DTC-P01')
    const longLeadDelivery = rowByCode.get('BTMP-DTC-P02')

    expect(designRelease?.values.title).toMatch(/选型|深化|采购释放/)
    expect(longLeadDelivery?.values.title).toMatch(/排产|FAT|到货/)
    expect((rowMetadata(designRelease!).durationAssetMapping as Record<string, unknown>)
      .standardWorkDurationSeedStableCode).toBe('specialist_design_procurement_release')
    expect((rowMetadata(longLeadDelivery!).durationAssetMapping as Record<string, unknown>)
      .standardWorkDurationSeedStableCode).toBe('long_lead_equipment_manufacture_delivery')
    expect((longLeadDelivery?.predecessorDependencies ?? []).some((dependency) => (
      dependency.clientRowId === designRelease?.clientRowId
      && dependency.dependencyType === 'FS'
      && Number(dependency.lagDays ?? 0) === 0
    ))).toBe(true)

    for (const installationCode of ['BTMP-DTC-03', 'BTMP-DTC-04']) {
      const installation = rowByCode.get(installationCode)
      expect(installation, installationCode).toBeTruthy()
      expect((installation?.predecessorDependencies ?? []).some((dependency) => (
        dependency.clientRowId === longLeadDelivery?.clientRowId
        && dependency.dependencyType === 'FS'
        && Number(dependency.lagDays ?? 0) === 0
      )), `${installationCode} must wait for governed long-lead delivery`).toBe(true)
    }
  }, 120_000)

  it('keeps one-off school procurement controls out of T2 workface rhythm coverage', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => (
      probe.businessType === 'school'
    ))
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const rowByCode = new Map(scheduleRows.map((row) => [rowCode(row), row]))

    for (const [code, stableCode] of [
      ['BTMP-SCH-P01', 'specialist_design_procurement_release'],
      ['BTMP-SCH-P02', 'long_lead_equipment_manufacture_delivery'],
    ] as const) {
      const row = rowByCode.get(code)
      const mapping = rowMetadata(row!).durationAssetMapping as Record<string, unknown>
      const calculation = rowMetadata(row!).durationAssetCalculation as Record<string, unknown>

      expect(row, code).toBeTruthy()
      expect(mapping.standardWorkDurationSeedStableCode).toBe(stableCode)
      expect(mapping.t2RhythmApplicability).toBe('not_applicable_one_off_activity')
      expect(mapping.t2RhythmTemplateId).toBeUndefined()
      expect(calculation.t2RhythmApplicability).toBe('not_applicable_one_off_activity')
      expect(calculation.t2RhythmTemplateId).toBeUndefined()
      expect(row?.values.duration_calibration_source).toBe('standard_work_duration_seed')
      const factorAvailability = rowDurationSuggestion(row!).factorAvailability as Record<string, unknown> | undefined
      expect(factorAvailability?.t2_division_rhythm_template_seed).toBe(false)
    }

    const laboratoryInstallation = rowByCode.get('BTMP-SCH-03')
    const installationMapping = rowMetadata(laboratoryInstallation!).durationAssetMapping as Record<string, unknown>
    expect(laboratoryInstallation).toBeTruthy()
    expect(installationMapping.t2RhythmApplicability).toBe('required_repetitive_or_workface_activity')
    expect(installationMapping.t2RhythmTemplateId).toBeTruthy()

    const summary = generated.durationAssetUtilizationSummary!
    expect(summary.t2NotApplicableDurationBearingScheduleRowCount).toBeGreaterThanOrEqual(2)
    expect(summary.t2RhythmTemplateRowCount).toBe(summary.t2ApplicableDurationBearingScheduleRowCount)
    expect(
      summary.t2ApplicableDurationBearingScheduleRowCount
      + summary.t2NotApplicableDurationBearingScheduleRowCount,
    ).toBe(summary.durationBearingScheduleRowCount)
  }, 120_000)

  it('uses hospital domain quantity proxies for cleanroom medical specialty profile durations', async () => {
    const hospitalProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'hospital')
    expect(hospitalProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(hospitalProbe!)
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const rowByStableCode = new Map(profileRows.map((row) => [String(rowMetadata(row).stableCode ?? row.values.standard_work_code ?? ''), row]))
    const expectations = [
      { code: 'BTMP-HSP-03', unit: 'terminal', basisSignal: 'cleanroom hepa terminal' },
      { code: 'BTMP-HSP-04', unit: 'medical_gas_zone', basisSignal: 'medical gas zone' },
      { code: 'BTMP-HSP-05', unit: 'medical_equipment_interface', basisSignal: 'medical equipment interface' },
      { code: 'BTMP-HSP-06', unit: 'medical_validation_scenario', basisSignal: 'medical validation scenario' },
    ]

    for (const expectation of expectations) {
      const row = rowByStableCode.get(expectation.code)
      expect(row).toBeTruthy()
      const calculation = rowMetadata(row!).durationAssetCalculation as Record<string, unknown>
      const quantityProxy = (calculation.quantityProxy ?? {}) as Record<string, unknown>

      expect(quantityProxy).toEqual(expect.objectContaining({
        source: 'project_scale_facts',
        unit: expectation.unit,
        value: expect.any(Number),
      }))
      expect(Number(quantityProxy.value)).toBeGreaterThan(0)
      expect(String(quantityProxy.basis ?? '').toLowerCase()).toContain(expectation.basisSignal)
      expect(String(calculation.selectionRule ?? '')).toContain('project_scale')
      expect(calculation.productivityDerivedDurationDays).toEqual(expect.any(Number))
    }
  }, 120_000)

  it('adds explicit profile lineage rows for every non-residential formal business type', async () => {
    const dedicatedOnlyBusinessTypes = new Set(['renovation', 'modular_building'])
    const expectedProfileSignals: Record<string, RegExp[]> = {
      hotel: [/酒店样板层/, /客房层/, /厨房洗衣房/, /大堂宴会厅/, /开业专项联调/, /试运营移交/],
      hospital: [/医技楼/, /病房楼二次结构/, /手术部洁净/, /医疗气体/, /医疗设备安装/, /卫生专项验收/],
      school: [/教学楼/, /教学楼二次结构/, /实验室通风/, /食堂宿舍/, /操场道路/, /开学移交/],
      industrial: [/主厂房钢结构/, /围护屋面封闭/, /工艺设备基础/, /设备安装单机试车/, /工业地坪/, /投产条件验收/],
      data_center: [/机房楼主体结构/, /机房白区/, /UPS/, /精密空调/, /动环监控联调/, /带载负载测试/],
      transportation_hub: [
        /枢纽主体结构|铁路站房.*营业线保护|既有地铁.*换乘通道|汽车客运站房.*停车坪/,
        /幕墙屋面封闭|站台雨棚.*营业线保护|换乘通道.*夜间窗口|站房.*停车坪/,
        /旅客服务系统|客运.*运营系统|票务.*跨线运营系统|车辆调度.*客运服务系统/,
        /旅客流线|站厅站台旅客流线|换乘厅通道|候车区.*人车分流/,
        /站台接口验收|站台门.*运营系统联调|系统改接恢复.*运营联调|充电.*调度.*运营联调/,
        /运营(?:单位)?移交/,
      ],
      sports_culture: [
        /大跨度钢结构|大跨度屋盖结构/,
        /屋面围护/,
        /声光电|灯光音响|计时计分.*广播电视|恒温恒湿.*环境监测/,
        /运动面层|比赛场地|声学装修|展陈承载/,
        /系统联调|声场调试|赛事系统联调|安防导览联调/,
        /赛事功能验收|演出条件验收|策展验收/,
      ],
      tod_upper_cover: [/运营线保护监测/, /轨交保护/, /上盖塔楼/, /商业公区装修/, /轨交接口机电/, /分区移交/],
      renovation: [/检测鉴定/, /临时导改/, /结构加固/, /装修恢复/, /消防机电联调/, /运营恢复移交/],
      modular_building: [/模块深化设计/, /工厂批量生产/, /吊装道路/, /运输吊装/, /围护防水/, /整体调试移交/],
    }

    for (const [businessType, titlePatterns] of Object.entries(expectedProfileSignals)) {
      const probe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((candidate) => candidate.businessType === businessType)
      expect(probe).toBeTruthy()

      const generated = await generateDefaultMasterPlanForProbe(probe!)
      const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
      const contractualCloseoutRows = profileRows.filter((row) => Boolean(row.values.contractual_closeout_role))
      const titles = profileRows.map((row) => String(row.values.title ?? row.values.name ?? ''))
      const trustGate = (generated as any).scheduleTrustGate

      expect(profileRows.length).toBeGreaterThanOrEqual(6)
      expect(profileRows.length - contractualCloseoutRows.length, `${businessType}:${profileRows.map((row) => rowCode(row)).join(',')}`)
        .toBeLessThanOrEqual(12)
      expect(contractualCloseoutRows.length).toBeLessThanOrEqual(2)
      expect(profileRows.every((row) => row.values.business_type === businessType)).toBe(true)
      expect(profileRows.every((row) => row.values.generation_policy === 'business_type_default_master_plan_profile_v1')).toBe(true)
      expect(profileRows.every((row) => [
        'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
        'standard_work_duration_seed',
      ].includes(String(row.values.duration_calibration_source ?? '')))).toBe(true)
      expect(profileRows.every((row) => row.values.duration_evidence_source === 'system_standard_default_master_plan')).toBe(true)
      expect(profileRows.every((row) => row.values.duration_evidence_maturity === 'L1')).toBe(true)
      expect(profileRows.every((row) => row.values.master_plan_generation_source === 'system_standard_asset_backed_master_plan_v2')).toBe(true)
      const lineageValidationRows = profileRows.filter((row) => {
        const metadata = rowMetadata(row)
        const durationAssetMapping = (metadata.durationAssetMapping ?? {}) as Record<string, unknown>
        const durationAssetCalculation = (metadata.durationAssetCalculation ?? {}) as Record<string, unknown>
        const masterPlanGeneration = (metadata.masterPlanGeneration ?? {}) as Record<string, unknown>
        const t2RhythmNotApplicable = durationAssetMapping.t2RhythmApplicability === 'not_applicable_one_off_activity'
        const t2LineageValid = t2RhythmNotApplicable
          ? !durationAssetMapping.t2RhythmTemplateId
            && !durationAssetCalculation.t2RhythmTemplateP50Days
          : Boolean(durationAssetMapping.t2RhythmTemplateId)
            && Number(durationAssetCalculation.t2RhythmTemplateP50Days) > 0
        const standardSeedDurationLineageValid = Number(durationAssetCalculation.standardWorkDurationSeedP50Days) > 0
          || (
            Number(durationAssetCalculation.standardWorkDurationSeedProductivityP50PerDay) > 0
            && Number(durationAssetCalculation.productivityDerivedDurationDays) > 0
          )
        return masterPlanGeneration.source === 'system_standard_asset_backed_master_plan_v2'
          && durationAssetMapping.source === 'system_standard_asset_backed_master_plan_v2'
          && Boolean(durationAssetMapping.standardWorkDurationSeedStableCode)
          && Boolean(durationAssetCalculation.standardWorkDurationSeedResolverSource)
          && Boolean(durationAssetCalculation.standardWorkDurationSeedCoverageMode)
          && Boolean(durationAssetCalculation.standardWorkDurationSeedScaleBasis)
          && t2LineageValid
          && [
            'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
            'standard_work_duration_seed',
          ].includes(String(durationAssetCalculation.source ?? ''))
          && Number(durationAssetCalculation.selectedDurationDays) === Number(row.values.smart_reference_days)
          && standardSeedDurationLineageValid
          && typeof durationAssetCalculation.selectionRule === 'string'
      })
      const lineageValidationRowIds = new Set(lineageValidationRows.map((row) => row.clientRowId))
      expect(profileRows
        .filter((row) => !lineageValidationRowIds.has(row.clientRowId))
        .map((row) => {
          const metadata = rowMetadata(row)
          const durationAssetMapping = (metadata.durationAssetMapping ?? {}) as Record<string, unknown>
          const durationAssetCalculation = (metadata.durationAssetCalculation ?? {}) as Record<string, unknown>
          const masterPlanGeneration = (metadata.masterPlanGeneration ?? {}) as Record<string, unknown>
          return {
            businessType,
            code: rowCode(row),
            masterPlanGenerationSource: masterPlanGeneration.source,
            seedStableCode: durationAssetMapping.standardWorkDurationSeedStableCode,
            seedResolverSource: durationAssetCalculation.standardWorkDurationSeedResolverSource,
            seedCoverageMode: durationAssetCalculation.standardWorkDurationSeedCoverageMode,
            seedScaleBasis: durationAssetCalculation.standardWorkDurationSeedScaleBasis,
            seedP50Days: durationAssetCalculation.standardWorkDurationSeedP50Days,
            seedProductivityP50PerDay: durationAssetCalculation.standardWorkDurationSeedProductivityP50PerDay,
            productivityDerivedDurationDays: durationAssetCalculation.productivityDerivedDurationDays,
            t2RhythmTemplateId: durationAssetMapping.t2RhythmTemplateId,
            t2RhythmTemplateP50Days: durationAssetCalculation.t2RhythmTemplateP50Days,
            selectedDurationDays: durationAssetCalculation.selectedDurationDays,
            smartReferenceDays: row.values.smart_reference_days,
          }
        })).toEqual([])
      expect(profileRows.every((row) => row.values.duration_review_required === false)).toBe(true)
      expect(profileRows.every((row) => !row.values.duration_review_gate)).toBe(true)
      expect(profileRows.every((row) => Number(row.values.smart_reference_days) > 0)).toBe(true)
        expect(trustGate.rowsMissingReferenceDuration).toBe(0)
        expect(trustGate.fallbackPolicyRowCount).toBe(0)
        expect(trustGate.reviewReasons).not.toContain('generation_depth_policy_fallback')
        expect(trustGate.status).toBe('trusted')
      expect(trustGate.reviewReasons).not.toContain('candidate_generation_depth_policy_review_required')
      expect(trustGate.reviewReasons).not.toContain('missing_plan_reference_duration')
      expect(profileRows.every((row) => rowDurationSuggestion(row).planDurationTruthSource === 'system_standard_executable_master_plan')).toBe(true)
      const rowsWithDependencies = profileRows.filter((row) => (row.predecessorDependencies ?? []).length > 0)
      const rowsWithoutDependencies = profileRows.filter((row) => (row.predecessorDependencies ?? []).length === 0)
      const requiresExternalProfileAnchor = !dedicatedOnlyBusinessTypes.has(businessType)
      const hasCandidateDependencyEvidence = (row: (typeof profileRows)[number]) => (
        (row.predecessorDependencies ?? []).some((dependency) => {
        const evidence = dependency.dependencyRuleEvidence as Record<string, unknown> | undefined
        return evidence?.source === 'construction_task_dependency_constraint_rule_system'
          && evidence.productionWritePolicy === 'wizard_commit_transactional_tasks_and_dependencies'
          && evidence.createsProductionTaskDependency === true
          && evidence.mutationBoundary === 'preview_no_write_wizard_commit_transactional'
        })
      )
      expect(rowsWithDependencies.every(hasCandidateDependencyEvidence)).toBe(true)
      if (requiresExternalProfileAnchor) {
        expect(rowsWithDependencies).toHaveLength(profileRows.length)
        expect(rowsWithoutDependencies).toHaveLength(0)
      } else {
        expect(rowsWithDependencies).toHaveLength(profileRows.length - 1)
        expect(rowsWithoutDependencies).toEqual([profileRows[0]])
      }
      const profileAnchorLineageRows = profileRows.filter((row) => (
        (row.values.profile_phase_anchor_dependency as Record<string, unknown> | undefined)?.source
          === 'business_type_profile_phase_anchor'
      ))
      const directProfileAnchorDependency = profileRows
        .flatMap((row) => row.predecessorDependencies ?? [])
        .find((dependency) => dependency.intentCode === 'business_type_profile_phase_anchor')
      const profileRowIds = new Set(profileRows.map((row) => row.clientRowId))
      const authoredExternalReleaseRows = profileRows.filter((row) => (
        (row.predecessorDependencies ?? []).some((dependency) => (
          !profileRowIds.has(String(dependency.clientRowId ?? ''))
        ))
      ))
      const visibleReleaseRows = profileAnchorLineageRows.filter((row) => (
        (row.predecessorDependencies ?? []).some((dependency) => (
          dependency.intentCode === 'executable_default_master_plan_component_release'
          || dependency.intentCode === 'executable_default_master_plan_primary_control_spine'
          || dependency.intentCode === 'executable_default_master_plan_physical_handoff'
          || dependency.intentCode === 'business_type_profile_phase_anchor'
        ))
      ))
      expect(collectProfileDependencyDateViolations(
        generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row'),
        profileRows,
      )).toEqual([])
      if (requiresExternalProfileAnchor) {
        expect(authoredExternalReleaseRows.length, businessType).toBeGreaterThan(0)
        if (profileAnchorLineageRows.length > 0) {
          expect(visibleReleaseRows.length, `${businessType}:${JSON.stringify(profileAnchorLineageRows.map((row) => ({
            code: rowCode(row),
            anchor: row.values.profile_phase_anchor_dependency,
            dependencies: row.predecessorDependencies,
          })))}`).toBeGreaterThan(0)
        }
      } else {
        expect(directProfileAnchorDependency, businessType).toBeUndefined()
        expect(profileAnchorLineageRows, businessType).toEqual([])
      }
      for (const pattern of titlePatterns) {
        expect(
          titles.some((title) => pattern.test(title)),
          `${businessType}:${String(pattern)}:${titles.join(' | ')}`,
        ).toBe(true)
      }
      expect(titles.some((title) => /危大工程识别与清单确认/.test(title))).toBe(false)
    }
  }, 180_000)

  it('consumes runtime-calibrated reference days as candidate duration input without claiming production writes', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!, {
      defaultMasterPlanRuntimeReferenceDays: {
        status: 'runtime_calibrated',
        evidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDays: [
          {
            stableCode: 'BTMP-SCH-01',
            p50Days: 160,
            p80Days: 176,
            sampleCount: 3,
            source: 'accepted_real_project_outcome',
            sourceSampleIds: [
              'sample-school-structure-001',
              'sample-school-structure-002',
              'sample-school-structure-003',
            ],
          },
        ],
      },
    })
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const row = profileRows.find((candidate) => rowCode(candidate) === 'BTMP-SCH-01')
    expect(row).toBeTruthy()

    const durationAssetCalculation = (row!.values.duration_asset_calculation ?? {}) as Record<string, unknown>
    const suggestion = rowDurationSuggestion(row!)
    const factorAvailability = suggestion.factorAvailability as Record<string, unknown>

    expect(row!.values.smart_reference_days).toBe(160)
    expect(durationAssetCalculation.selectedDurationDays).toBe(160)
    expect(durationAssetCalculation.runtimeReferenceDaysConsumed).toBe(true)
    expect(durationAssetCalculation.runtimeReferenceDaysEvidenceLevel).toBe('runtime_calibrated_l2')
    expect(durationAssetCalculation.runtimeReferenceDaysP50Days).toBe(160)
    expect(durationAssetCalculation.runtimeReferenceDaysP80Days).toBe(176)
    expect(durationAssetCalculation.runtimeReferenceDaysSampleCount).toBe(3)
    expect(durationAssetCalculation.runtimeReferenceDaysMutationBoundary).toBe('candidate_only_no_business_fact_write')
    expect(factorAvailability.accepted_project_duration_samples).toBe(true)
    expect(suggestion.dataUpgradeBlockedBy).not.toContain('GENERATION_DEPTH_TRUST_REVIEW_REQUIRED')
    expect(suggestion.dataUpgradePath).toEqual(['optional_runtime_calibration'])
    expect(row!.values.duration_evidence_maturity).toBe('L1')
  }, 120_000)

  it('preserves runtime reference-day lineage when seasonal assets adjust the same default master-plan row', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!, {
      defaultMasterPlanRuntimeReferenceDays: {
        status: 'runtime_calibrated',
        evidenceLevel: 'runtime_calibrated_l2',
        runtimeReferenceDays: [
          {
            stableCode: 'BTMP-BASE-02',
            p50Days: 70,
            p80Days: 84,
            sampleCount: 4,
            source: 'accepted_real_project_outcome',
            sourceSampleIds: ['sample-school-foundation-rain-001'],
          },
        ],
      },
      projectFactOverrides: {
        climateSignals: ['rainy_season'],
        weatherImpactBands: ['earthwork_rain_sensitive'],
        locationFacts: {
          climateSignals: ['plum_rain'],
          weatherImpactBands: ['earthwork_rain_sensitive'],
        },
      },
      scopeOverrides: {
        climate_signals: ['rainy_season'],
        monthly_climate_signal: 'rainy_season',
        weather_impact_bands: ['earthwork_rain_sensitive'],
        location_facts: {
          climateSignals: ['plum_rain'],
          weatherImpactBands: ['earthwork_rain_sensitive'],
        },
      },
    })

    const rainyFoundation = generated.rows
      .find((row) => row.rowProjectionMode === 'schedule_row' && rowMetadata(row).stableCode === 'BTMP-BASE-02')
    expect(rainyFoundation).toBeTruthy()

    const calculation = rowMetadata(rainyFoundation!).durationAssetCalculation as Record<string, unknown>
    const summary = (generated as any).durationAssetUtilizationSummary as Record<string, unknown>

    expect(Number(rainyFoundation!.values.smart_reference_days)).toBeGreaterThan(70)
    expect(calculation.runtimeReferenceDaysConsumed).toBe(true)
    expect(calculation.runtimeReferenceDaysP50Days).toBe(70)
    expect(calculation.runtimeReferenceDaysAdjustedByProcessSeasonal).toBe(true)
    expect(calculation.processSeasonalDurationAssetConsumed).toBe(true)
    expect(Number(summary.runtimeReferenceDaysRowCount)).toBeGreaterThanOrEqual(1)
    expect(Number(summary.processSeasonalDurationAssetRowCount)).toBeGreaterThanOrEqual(1)
  }, 120_000)

  it('uses explicit field master-plan rows as the non-residential schedule surface', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const titles = scheduleRows.map((row) => String(row.values.title ?? row.values.name ?? ''))
    const linkedProjectionTitles = generated.rows
      .filter((row) => row.rowProjectionMode === 'linked_projection')
      .map((row) => String(row.values.title ?? row.values.name ?? ''))
    const sourceTypes = new Set(scheduleRows.map((row) => String(row.values.source_type ?? '')))

    expect(sourceTypes).toEqual(new Set(['managed_frontier_default_master_plan']))
    expect(scheduleRows.some((row) => [
      'business_type_base_master_plan_profile_v1',
      'business_type_master_plan_profile_v1',
    ].includes(String(row.values.source_type ?? '')))).toBe(false)
    expect(scheduleRows.every((row) => {
      const metadata = rowMetadata(row)
      const businessTypeMasterPlan = (metadata.businessTypeMasterPlan ?? {}) as Record<string, unknown>
      const executableDefaultMasterPlan = (metadata.executableDefaultMasterPlan ?? {}) as Record<string, unknown>
      return (businessTypeMasterPlan.source === 'managed_frontier_default_master_plan'
        && [
          'business_type_base_master_plan_profile_v1',
          'business_type_master_plan_profile_v1',
        ].includes(String(businessTypeMasterPlan.profileSourceType ?? '')))
        || executableDefaultMasterPlan.status === 'executable_default_master_plan'
    })).toBe(true)
    const assembly = (generated as any).executableDefaultMasterPlanAssembly as Record<string, unknown>
    expect(scheduleRows.length).toBeGreaterThanOrEqual(Number(assembly.minimumScheduleRowCount))
    expect(scheduleRows.length).toBeLessThanOrEqual(Number(assembly.maximumScheduleRowCount))
    expect(titles).toEqual(expect.arrayContaining([
      '施工准备与现场临设完成',
      '基坑支护降水与土方开挖',
      '桩基基础与检测验收',
      '地下结构施工与出正负零',
      '主体结构施工与分区验收',
      '二次结构与砌体穿插施工',
      '机电安装与管线综合施工',
      '装饰装修与功能区样板确认',
      '室外管网道路与景观施工',
      '系统调试与专项验收准备',
      '教学楼主体结构与功能区移交',
      '实验室通风与专业机电安装',
      '操场道路与校园室外配套',
      '竣工验收与开学移交准备',
    ]))
    expect(titles).not.toContain('竣工验收与移交准备')
    expect(titles.indexOf('系统调试与专项验收准备')).toBeLessThan(titles.indexOf('竣工验收与开学移交准备'))
    const schoolHandover = scheduleRows.find((row) => row.values.title === '竣工验收与开学移交准备')
    expect(schoolHandover?.predecessorDependencies?.some((dependency) => {
      const predecessor = scheduleRows.find((row) => row.clientRowId === dependency.clientRowId)
      return predecessor?.values.title === '系统调试与专项验收准备'
    })).toBe(true)
    const unexpectedGenericTitles = titles.filter((title) => /土钉墙|橱柜|人防/.test(title))
    expect(unexpectedGenericTitles).toEqual([])
    for (const pattern of [/变配电室/, /电力驱动的曳引式或强制式电梯/]) {
      const promotedControl = scheduleRows.find((row) => pattern.test(String(row.values.title ?? '')))
      expect(promotedControl).toBeTruthy()
      expect(promotedControl?.parentClientRowId).toBe(null)
      expect((promotedControl?.linkedProjectionSource as Record<string, unknown> | undefined)
        ?.promotedToExecutableDefaultMasterPlan).toBe(true)
    }
    expect(linkedProjectionTitles.some((title) => /变配电室/.test(title))).toBe(false)
    const internalElevatorProjectionRows = generated.rows
      .filter((row) => row.rowProjectionMode === 'linked_projection')
      .filter((row) => /电力驱动的曳引式或强制式电梯/.test(String(row.values.title ?? '')))
    expect(internalElevatorProjectionRows).toHaveLength(1)
    expect(internalElevatorProjectionRows[0]?.linkedProjectionSource).toEqual(expect.objectContaining({
      source: 'business_type_default_master_plan_template_support_projection',
      originalRowProjectionMode: 'schedule_row',
      visibilityPolicyDemotion: true,
      retainedForInternalNetworkCalculation: true,
    }))
  }, 120_000)

  it('exposes a top-level duration asset utilization summary for default master-plan outputs', async () => {
    const dataCenterProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'data_center')
    expect(dataCenterProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(dataCenterProbe!)
    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const summary = (generated as any).durationAssetUtilizationSummary as Record<string, unknown> | undefined

    expect(summary).toEqual(expect.objectContaining({
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'system_standard_executable_plan_l1',
      mutationBoundary: 'summary_only_no_db_mutation_no_business_fact_write',
      scheduleRowCount: scheduleRows.length,
      durationBearingScheduleRowCount: expect.any(Number),
      projectScaleQuantityProxyRowCount: expect.any(Number),
      dependencyAssetConsumedRowCount: expect.any(Number),
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
    }))
    expect(Number(summary?.projectScaleQuantityProxyRowCount ?? 0)).toBeGreaterThan(0)
    expect(Number(summary?.dependencyAssetConsumedRowCount ?? 0)).toBeGreaterThan(0)
    expect(summary?.standardWorkDurationSeedRowCount).toBe(summary?.durationBearingScheduleRowCount)
    expect(summary?.t2RhythmTemplateRowCount).toBe(summary?.t2ApplicableDurationBearingScheduleRowCount)
    expect(
      Number(summary?.t2ApplicableDurationBearingScheduleRowCount ?? 0)
      + Number(summary?.t2NotApplicableDurationBearingScheduleRowCount ?? 0),
    ).toBe(summary?.durationBearingScheduleRowCount)
    expect(summary?.durationCalibrationSource).toBe('standard_work_duration_seed+t2_rhythm_template+system_schedule_rules')
    expect(summary?.calibrationPolicy).toBe('optional_runtime_overlay')
    expect(summary?.productionWritePolicy).toBe('wizard_commit_transactional_tasks_and_dependencies')
  }, 120_000)

  it('summarizes specialty duration asset coverage for every non-residential business-type profile', async () => {
    const nonResidentialProbes = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES
      .filter((probe) => probe.businessType !== 'general_civil')
    expect(nonResidentialProbes.length).toBeGreaterThan(0)

    const coverageGaps: Array<{
      businessType: string
      profileRows: number
      profileMappedSeedRows: number
      specialtySeedRows: number
      specificT2Rows: number
      t2ApplicableProfileRows: number
      t2NotApplicableProfileRows: number
      missingSpecialtySeedRows: number
      missingProfileMappedSeedRows: number
      missingSpecificT2Rows: number
      profileRowDiagnostics: Array<Record<string, unknown>>
    }> = []

    for (const probe of nonResidentialProbes) {
      const generated = await generateDefaultMasterPlanForProbe(probe)
      const summary = (generated as any).durationAssetUtilizationSummary as Record<string, unknown> | undefined
      const profileBusinessTypes = summary?.businessTypeProfileBusinessTypeCodes as string[] | undefined
      const specialtySeedBusinessTypes = summary?.businessTypeSpecialtyDurationAssetBusinessTypeCodes as string[] | undefined
      const specificT2BusinessTypes = summary?.businessTypeSpecificT2RhythmBusinessTypeCodes as string[] | undefined
      const profileRows = Number(summary?.businessTypeProfileScheduleRowCount ?? 0)
      const profileMappedSeedRows = Number(summary?.businessTypeProfileMappedDurationAssetRowCount ?? 0)
      const specialtySeedRows = Number(summary?.businessTypeSpecialtyDurationAssetRowCount ?? 0)
      const specificT2Rows = Number(summary?.businessTypeSpecificT2RhythmTemplateRowCount ?? 0)
      const businessTypeCoverage = (summary?.businessTypeAssetCoverage as Array<Record<string, unknown>> | undefined)
        ?.find((coverage) => coverage.businessType === probe.businessType)
      const t2ApplicableProfileRows = Number(businessTypeCoverage?.t2ApplicableProfileScheduleRowCount ?? 0)
      const t2NotApplicableProfileRows = Number(businessTypeCoverage?.t2NotApplicableProfileScheduleRowCount ?? 0)
      const missingSpecialtySeedRows = Number(summary?.businessTypeRowsMissingSpecialtyDurationAssetCount ?? 0)
      const missingProfileMappedSeedRows = Number(summary?.businessTypeRowsMissingProfileDurationAssetCount ?? 0)
      const missingSpecificT2Rows = Number(summary?.businessTypeRowsMissingSpecificT2RhythmTemplateCount ?? 0)

      expect(summary?.businessTypeProfileScheduleRowCount).toEqual(expect.any(Number))
      expect(profileRows).toBeGreaterThan(0)
      expect(profileBusinessTypes).toEqual(expect.arrayContaining([probe.businessType]))

      if (
        profileMappedSeedRows !== profileRows
        || specialtySeedRows <= 0
        || specialtySeedRows > profileRows
        || specificT2Rows !== t2ApplicableProfileRows
        || t2ApplicableProfileRows + t2NotApplicableProfileRows !== profileRows
        || missingProfileMappedSeedRows !== 0
        || missingSpecialtySeedRows !== profileRows - specialtySeedRows
        || missingSpecificT2Rows !== 0
        || !specialtySeedBusinessTypes?.includes(probe.businessType)
        || !specificT2BusinessTypes?.includes(probe.businessType)
      ) {
        coverageGaps.push({
          businessType: probe.businessType,
          profileRows,
          profileMappedSeedRows,
          specialtySeedRows,
          specificT2Rows,
          t2ApplicableProfileRows,
          t2NotApplicableProfileRows,
          missingSpecialtySeedRows,
          missingProfileMappedSeedRows,
          missingSpecificT2Rows,
          profileRowDiagnostics: scheduleRowsForBusinessTypeProfile(generated.rows).map((row) => {
            const mapping = rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined
            return {
              code: rowCode(row),
              phase: row.values.execution_phase,
              seed: mapping?.standardWorkDurationSeedStableCode,
              t2: mapping?.t2RhythmTemplateId,
              t2Applicability: mapping?.t2RhythmApplicability,
            }
          }),
        })
      }
    }

    expect(coverageGaps).toEqual([])
  }, 180_000)

  it('exposes row-level asset coverage diagnostics by business type for profile review', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const summary = (generated as any).durationAssetUtilizationSummary as Record<string, unknown> | undefined
    const byBusinessType = summary?.businessTypeAssetCoverage as Array<Record<string, unknown>> | undefined
    const schoolCoverage = byBusinessType?.find((coverage) => coverage.businessType === 'school')

    expect(schoolCoverage).toEqual(expect.objectContaining({
      businessType: 'school',
      profileScheduleRowCount: expect.any(Number),
      t2ApplicableProfileScheduleRowCount: expect.any(Number),
      t2NotApplicableProfileScheduleRowCount: expect.any(Number),
      profileMappedDurationAssetRowCount: expect.any(Number),
      specialtyDurationAssetRowCount: expect.any(Number),
      specificT2RhythmTemplateRowCount: expect.any(Number),
      rowsMissingProfileDurationAssetCount: 0,
      rowsMissingSpecialtyDurationAssetCount: expect.any(Number),
      rowsMissingSpecificT2RhythmTemplateCount: 0,
      activeStandardWorkDurationSeedRowCount: expect.any(Number),
      fallbackStandardWorkDurationSeedRowCount: expect.any(Number),
      activeT2RhythmTemplateRowCount: expect.any(Number),
      fallbackT2RhythmTemplateRowCount: expect.any(Number),
      uniqueStandardWorkDurationSeedStableCodes: expect.arrayContaining(['mep_plumbing_fire_pipe']),
      uniqueT2RhythmTemplateIds: expect.arrayContaining(['t2-school-campus-functional-phasing-rhythm-v1']),
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    }))
    expect(Number(schoolCoverage?.profileScheduleRowCount ?? 0)).toBeGreaterThan(0)
    expect(Number(schoolCoverage?.profileMappedDurationAssetRowCount ?? 0)).toBe(Number(schoolCoverage?.profileScheduleRowCount ?? -1))
    expect(Number(schoolCoverage?.specialtyDurationAssetRowCount ?? 0)).toBeGreaterThan(0)
    expect(Number(schoolCoverage?.rowsMissingSpecialtyDurationAssetCount ?? 0)).toBe(
      Number(schoolCoverage?.profileScheduleRowCount ?? 0) - Number(schoolCoverage?.specialtyDurationAssetRowCount ?? 0),
    )
    expect(Number(schoolCoverage?.specificT2RhythmTemplateRowCount ?? 0)).toBe(Number(schoolCoverage?.t2ApplicableProfileScheduleRowCount ?? -1))
    expect(
      Number(schoolCoverage?.t2ApplicableProfileScheduleRowCount ?? 0)
      + Number(schoolCoverage?.t2NotApplicableProfileScheduleRowCount ?? 0),
    ).toBe(Number(schoolCoverage?.profileScheduleRowCount ?? -1))
  }, 120_000)

  it('applies construction production calendar to non-residential default master-plan profile rows', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const withoutCalendar = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const withCalendar = await generateDefaultMasterPlanForProbe(schoolProbe!, {
      constructionCalendar: {
        basis: 'official_construction_calendar_seed',
        windows: [{
          stableCode: 'test_startup_shutdown',
          holidayName: 'default master plan startup shutdown',
          startDate: '2026-07-01',
          endDate: '2026-07-10',
          countsAsConstructionShutdown: true,
        }],
      },
    })

    const firstProfileWithoutCalendar = scheduleRowsForBusinessTypeProfile(withoutCalendar.rows)
      .sort((left, right) => dateMs(left.values.planned_start_date) - dateMs(right.values.planned_start_date))[0]
    const firstProfileWithCalendar = scheduleRowsForBusinessTypeProfile(withCalendar.rows)
      .sort((left, right) => dateMs(left.values.planned_start_date) - dateMs(right.values.planned_start_date))[0]

    expect(firstProfileWithoutCalendar).toBeTruthy()
    expect(firstProfileWithCalendar).toBeTruthy()
    expect(dateMs(firstProfileWithCalendar!.values.planned_start_date)).toBeGreaterThan(dateMs(firstProfileWithoutCalendar!.values.planned_start_date))
    expect(rowMetadata(firstProfileWithCalendar!).calendarBasis).toBe('official_construction_calendar_seed')
    expect(rowMetadata(firstProfileWithCalendar!).constructionCalendarWindowCount).toBe(1)
    expect(firstProfileWithCalendar!.values.calendar_basis).toBe('official_construction_calendar_seed')
    expect(firstProfileWithCalendar!.values.construction_calendar_window_count).toBe(1)
  }, 120_000)

  it('auto-resolves construction calendar for default master-plan profile rows when operation omits it', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()
    constructionCalendarMocks.resolveConstructionCalendarContext.mockResolvedValueOnce({
      basis: 'official_construction_calendar_seed',
      windows: [{
        stableCode: 'test_auto_startup_shutdown',
        holidayName: 'default master plan auto startup shutdown',
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        countsAsConstructionShutdown: true,
      }],
    })

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const firstProfileRow = scheduleRowsForBusinessTypeProfile(generated.rows)
      .sort((left, right) => dateMs(left.values.planned_start_date) - dateMs(right.values.planned_start_date))[0]

    expect(constructionCalendarMocks.resolveConstructionCalendarContext).toHaveBeenCalledWith({
      projectId: '00000000-0000-4000-8000-000000000001',
    })
    expect(firstProfileRow).toBeTruthy()
    expect(firstProfileRow!.values.planned_start_date).not.toBe('2026-07-01')
    expect(rowMetadata(firstProfileRow!).calendarBasis).toBe('official_construction_calendar_seed')
    expect(rowMetadata(firstProfileRow!).constructionCalendarWindowCount).toBe(1)
    expect(firstProfileRow!.values.calendar_basis).toBe('official_construction_calendar_seed')
    expect(firstProfileRow!.values.construction_calendar_window_count).toBe(1)
    expect((generated as any).constructionCalendar).toEqual(expect.objectContaining({
      basis: 'official_construction_calendar_seed',
      windows: [expect.objectContaining({
        stableCode: 'test_auto_startup_shutdown',
        startDate: '2026-07-01',
        endDate: '2026-07-10',
        countsAsConstructionShutdown: true,
      })],
    }))
    expect(generated.durationAssetUtilizationSummary?.constructionCalendarRowCount).toBeGreaterThan(0)
  }, 120_000)

  it('exposes system-standard duration risk ranges from P20/P50/P80 assets on default master-plan rows', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const teachingStructure = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => row.values.title === '教学楼主体结构与功能区移交')

    expect(teachingStructure).toBeTruthy()
    const suggestion = teachingStructure!.values.duration_suggestion as Record<string, unknown>
    const calculation = rowMetadata(teachingStructure!).durationAssetCalculation as Record<string, unknown>
    const riskRange = suggestion.durationRiskRange as Record<string, unknown> | undefined

    expect(riskRange).toEqual(expect.objectContaining({
      source: 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
      evidenceLevel: 'system_standard_asset_l1',
      p50Days: teachingStructure!.values.smart_reference_days,
    }))
    expect(Number(riskRange?.p20Days)).toBeGreaterThan(0)
    expect(Number(riskRange?.p20Days)).toBeLessThanOrEqual(Number(riskRange?.p50Days))
    expect(Number(riskRange?.p80Days)).toBeGreaterThanOrEqual(Number(riskRange?.p50Days))
    expect(suggestion.riskP20DurationDays).toBe(riskRange?.p20Days)
    expect(suggestion.riskP50DurationDays).toBe(riskRange?.p50Days)
    expect(suggestion.riskP80DurationDays).toBe(riskRange?.p80Days)
    expect(Number(riskRange?.p80Days)).toBeGreaterThanOrEqual(Number(calculation.t2RhythmTemplateP80Days ?? 0))
    expect(generated.durationAssetUtilizationSummary).toEqual(expect.objectContaining({
      durationRiskRangeRowCount: expect.any(Number),
      durationRiskP20MinDays: expect.any(Number),
      durationRiskP50MedianDays: expect.any(Number),
      durationRiskP80MaxDays: expect.any(Number),
    }))
    expect(Number(generated.durationAssetUtilizationSummary?.durationRiskRangeRowCount ?? 0)).toBeGreaterThan(0)
    expect(Number(generated.durationAssetUtilizationSummary?.durationRiskP20MinDays ?? 0)).toBeGreaterThan(0)
    expect(Number(generated.durationAssetUtilizationSummary?.durationRiskP80MaxDays ?? 0)).toBeGreaterThanOrEqual(
      Number(generated.durationAssetUtilizationSummary?.durationRiskP50MedianDays ?? 0),
    )
  }, 120_000)

  it('returns a no-write candidate CPM network summary for default master-plan generation', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)

    expect(generated.candidateNetworkEvaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(Number(generated.candidateNetworkEvaluation?.previewEdgeCount ?? 0)).toBeGreaterThan(0)
    expect(Number(generated.candidateNetworkEvaluation?.projectedNetworkSpanDays ?? 0)).toBeGreaterThan(0)
    expect(generated.candidateNetworkEvaluation?.criticalGeneratedRowIds.length).toBeGreaterThan(0)
    const criticalRowSummaries = (generated.candidateNetworkEvaluation as any)?.criticalRowSummaries
    expect(Array.isArray(criticalRowSummaries)).toBe(true)
    expect(criticalRowSummaries.length).toBeGreaterThan(0)
    expect(criticalRowSummaries[0]).toEqual(expect.objectContaining({
      generatedRowId: expect.any(String),
      title: expect.any(String),
      plannedStartDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      plannedEndDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      totalFloatDays: 0,
    }))
  }, 120_000)

  it('applies climate process-seasonal duration assets to default master-plan selected reference days', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const baseline = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const rainySeason = await generateDefaultMasterPlanForProbe(schoolProbe!, {
      projectFactOverrides: {
        climateSignals: ['rainy_season'],
        weatherImpactBands: ['earthwork_rain_sensitive'],
        locationFacts: {
          climateSignals: ['plum_rain'],
          weatherImpactBands: ['earthwork_rain_sensitive'],
        },
      },
      scopeOverrides: {
        climate_signals: ['rainy_season'],
        monthly_climate_signal: 'rainy_season',
        weather_impact_bands: ['earthwork_rain_sensitive'],
        location_facts: {
          climateSignals: ['plum_rain'],
          weatherImpactBands: ['earthwork_rain_sensitive'],
        },
      },
    })

    const baselinePit = baseline.rows
      .find((row) => row.rowProjectionMode === 'schedule_row' && row.values.title === '基坑支护降水与土方开挖')
    const rainyPit = rainySeason.rows
      .find((row) => row.rowProjectionMode === 'schedule_row' && row.values.title === '基坑支护降水与土方开挖')

    expect(baselinePit).toBeTruthy()
    expect(rainyPit).toBeTruthy()
    expect(Number(rainyPit!.values.smart_reference_days)).toBeGreaterThan(Number(baselinePit!.values.smart_reference_days))

    const calculation = rowMetadata(rainyPit!).durationAssetCalculation as Record<string, unknown>
    expect(calculation).toEqual(expect.objectContaining({
      selectedDurationDays: rainyPit!.values.smart_reference_days,
      processSeasonalDurationAssetConsumed: true,
      processSeasonalClimateSignal: 'rainy_season',
      processSeasonalMonthlyClimateSignal: 'rainy_season',
      processSeasonalSource: 'process_seasonal_sensitivity',
    }))
    expect(String(calculation.processSeasonalStableCode)).toMatch(/rainy_season/)
    expect(String(calculation.selectionRule)).toContain('process_seasonal_sensitivity')
  }, 120_000)

  it('uses project scale facts as quantity proxies for non-residential default master-plan profile durations', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()
    const facts = buildDefaultMasterPlanProbeFacts(schoolProbe!)

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const teachingStructure = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => row.values.title === '教学楼主体结构与功能区移交')

    expect(teachingStructure).toBeTruthy()
    const calculation = rowMetadata(teachingStructure!).durationAssetCalculation as Record<string, unknown>
    expect(calculation.quantityProxy).toEqual(expect.objectContaining({
      source: 'project_scale_facts',
      unit: 'floor_workface',
      value: facts.buildingCount * facts.standardFloorCount,
    }))
    expect(String((calculation.quantityProxy as Record<string, unknown>).basis ?? '')).toContain('building_count * standard_floor_count')
    expect(calculation.productivityDerivedDurationDays).toEqual(expect.any(Number))
    expect(calculation.selectionRule).toContain('project_scale')
  }, 120_000)

  it('lets project-scale duration assets drive non-residential default master-plan rows instead of preserving hardcoded fallback floors', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const assetDrivenRows = scheduleRowsForBusinessTypeProfile(generated.rows)
      .filter((row) => {
        const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown> | undefined
        return row.values.plan_item_kind === 'work_task'
          && row.values.duration_contribution_mode === 'duration_bearing'
          && typeof calculation?.selectionRule === 'string'
          && calculation.selectionRule.startsWith('project_scale_')
      })

    expect(assetDrivenRows.length).toBeGreaterThan(0)
    const invalidAssetDrivenRows = assetDrivenRows.filter((row) => {
      const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
      const assetDrivenDays = Math.max(
        Number(calculation.realPlanSkeletonDurationDays ?? 0) || 0,
        Number(calculation.productivityDerivedDurationDays ?? 0) || 0,
        Number(calculation.standardWorkDurationSeedP50Days ?? 0) || 0,
        Number(calculation.t2RhythmTemplateP50Days ?? 0) || 0,
      )
      return !(assetDrivenDays > 0
        && Number(calculation.selectedDurationDays) >= assetDrivenDays
        && Number(row.values.smart_reference_days) === Number(calculation.selectedDurationDays)
        && (
          Number(calculation.selectedDurationDays) === assetDrivenDays
          || (
            calculation.processSeasonalDurationAssetConsumed === true
            && Number(calculation.baseSelectedDurationDays) === assetDrivenDays
          )
        ))
    })
    expect(invalidAssetDrivenRows.map((row) => {
      const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
      return {
        code: rowCode(row),
        selectedDurationDays: calculation.selectedDurationDays,
        baseSelectedDurationDays: calculation.baseSelectedDurationDays,
        realPlanSkeletonDurationDays: calculation.realPlanSkeletonDurationDays,
        productivityDerivedDurationDays: calculation.productivityDerivedDurationDays,
        standardWorkDurationSeedP50Days: calculation.standardWorkDurationSeedP50Days,
        t2RhythmTemplateP50Days: calculation.t2RhythmTemplateP50Days,
        processSeasonalDurationAssetConsumed: calculation.processSeasonalDurationAssetConsumed,
      }
    })).toEqual([])
  }, 120_000)

  it('does not compress school default master-plan skeleton durations without runtime reference-day evidence', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const secondaryStructure = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => rowMetadata(row).stableCode === 'BTMP-SCH-02')

    expect(secondaryStructure).toBeTruthy()
    const calculation = rowMetadata(secondaryStructure!).durationAssetCalculation as Record<string, unknown>
    expect(calculation.realPlanSkeletonDurationDays).toBe(95)
    expect(calculation.realPlanSkeletonFloorApplied).toBe(true)
    expect(calculation.selectedDurationDays).toBe(95)
    expect(secondaryStructure!.values.smart_reference_days).toBe(95)
    expect(String(calculation.selectionRule)).toContain('real_plan_skeleton_floor')
  }, 120_000)

  it('selects phase-compatible duration assets for non-residential specialty profile rows', async () => {
    const probes = new Map(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => [probe.businessType, probe]))
    const hospital = await generateDefaultMasterPlanForProbe(probes.get('hospital')!)
    const industrial = await generateDefaultMasterPlanForProbe(probes.get('industrial')!)
    const school = await generateDefaultMasterPlanForProbe(probes.get('school')!)

    const hospitalStructure = scheduleRowsForBusinessTypeProfile(hospital.rows)
      .find((row) => row.values.title === '医技楼主体结构与医疗功能区移交')
    const industrialProcessMep = scheduleRowsForBusinessTypeProfile(industrial.rows)
      .find((row) => row.values.title === '工艺设备基础与动力管线综合')
    const schoolLaboratoryMep = scheduleRowsForBusinessTypeProfile(school.rows)
      .find((row) => row.values.title === '实验室通风与专业机电安装')

    expect(rowMetadata(hospitalStructure!).durationAssetCalculation).toEqual(expect.objectContaining({
      standardWorkDurationSeedStableCode: 'cast_in_place_formwork',
      t2RhythmTemplateId: 't2-hospital-ward-medical-tower-structure-rhythm-v1',
    }))
    expect(rowMetadata(industrialProcessMep!).durationAssetCalculation).toEqual(expect.objectContaining({
      standardWorkDurationSeedStableCode: 'mep_plumbing_fire_pipe',
      t2RhythmTemplateId: 't2-industrial-main-plant-utility-equipment-rhythm-v1',
    }))
    expect(rowMetadata(schoolLaboratoryMep!).durationAssetCalculation).toEqual(expect.objectContaining({
      standardWorkDurationSeedStableCode: 'mep_plumbing_fire_pipe',
      t2RhythmTemplateId: 't2-school-campus-functional-phasing-rhythm-v1',
    }))
  }, 120_000)

  it('selects business-type-compatible T2 rhythm assets for non-residential base profile rows', async () => {
    const mismatches: string[] = []
    for (const probe of PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.filter((candidate) => candidate.businessType !== 'general_civil')) {
      const generated = await generateDefaultMasterPlanForProbe(probe)
      const baseProfileRows = generated.rows.filter((row) => {
        const metadata = rowMetadata(row)
        const businessTypeMasterPlan = (metadata.businessTypeMasterPlan ?? {}) as Record<string, unknown>
        return row.rowProjectionMode === 'schedule_row'
          && businessTypeMasterPlan.profileSourceType === 'business_type_base_master_plan_profile_v1'
      })

      if (probe.businessType === 'renovation' || probe.businessType === 'modular_building') {
        expect(baseProfileRows).toEqual([])
        continue
      }

      expect(baseProfileRows.length).toBeGreaterThan(0)
      for (const row of baseProfileRows) {
        const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
        const templateId = String(calculation.t2RhythmTemplateId ?? '')
        if (!templateId || templateId.includes('t2-residential-')) {
          mismatches.push(`${probe.businessType}:${row.values.title}:${templateId}`)
        }
        const hasFixedDurationSeed = Number(calculation.standardWorkDurationSeedP50Days ?? 0) > 0
        const hasProductivityDurationSeed = Number(calculation.standardWorkDurationSeedProductivityP50PerDay ?? 0) > 0
          && Number(calculation.productivityDerivedDurationDays ?? 0) > 0
        expect(hasFixedDurationSeed || hasProductivityDurationSeed).toBe(true)
        expect(calculation.standardWorkDurationSeedCoverageMode).toBeTruthy()
        expect(calculation.standardWorkDurationSeedScaleBasis).toBeTruthy()
        expect(Number(calculation.productivityDerivedDurationDays ?? 0)).toBeGreaterThan(0)
      }
    }

    expect(mismatches).toEqual([])
  }, 120_000)

  it('consumes wizard subtype packs and organization-variant T2 assets in the generated master plan', async () => {
    const cases = [
      {
        businessType: 'industrial',
        businessSubtype: 'industrial_logistics',
        expectedVariant: 'industrial_logistics_automation',
        expectedPackCodes: ['IPL-05-01-01', 'IPL-05-01-02'],
        excludedPackPrefixes: ['IPL-05-02', 'IPL-05-03'],
        expectedT2: 't2-industrial-logistics-warehouse-mezzanine-fitout-rhythm-v1',
        expectedWorkflowRules: [
          'industrial_logistics_floor_to_automation_installation',
          'industrial_logistics_automation_to_operation_integration',
          'industrial_logistics_operation_to_trial_production',
        ],
        expectedProfileControls: [
          { code: 'BTMP-IND-03', title: '超平地坪、货架基础与自动化接口施工', durationSeed: 'expert_domain_industrial_logistics_automation' },
          { code: 'BTMP-IND-04', title: '高位货架、堆垛机、输送分拣及AGV系统安装联调', durationSeed: 'expert_domain_industrial_logistics_automation' },
        ],
      },
      {
        businessType: 'industrial',
        businessSubtype: 'industrial_cleanroom',
        expectedVariant: 'industrial_process_validation',
        expectedPackCodes: ['IPL-05-02-01', 'IPL-05-02-02'],
        excludedPackPrefixes: ['IPL-05-01', 'IPL-05-03'],
        expectedT2: 't2-industrial-clean-utility-validation-rhythm-v1',
        expectedWorkflowRules: [
          'industrial_process_envelope_to_controlled_environment',
          'industrial_controlled_environment_to_clean_utility_validation',
          'industrial_clean_utility_validation_to_trial_production',
        ],
        expectedProfileControls: [
          { code: 'BTMP-IND-03', title: '受控生产环境围护与工艺区封闭', durationSeed: 'expert_domain_industrial_process_validation' },
          { code: 'BTMP-IND-04', title: '高纯介质、洁净公用系统安装与工艺验证', durationSeed: 'expert_domain_industrial_process_validation' },
        ],
      },
      {
        businessType: 'industrial',
        businessSubtype: 'industrial_heavy',
        expectedVariant: 'industrial_heavy_equipment',
        expectedPackCodes: ['IPL-05-03-01', 'IPL-05-03-02'],
        excludedPackPrefixes: ['IPL-05-01', 'IPL-05-02'],
        expectedT2: 't2-industrial-heavy-equipment-lifting-rhythm-v1',
        expectedWorkflowRules: [
          'industrial_structure_to_heavy_lift_readiness',
          'industrial_heavy_lift_to_equipment_alignment_load_trial',
          'industrial_heavy_equipment_load_trial_to_trial_production',
        ],
        expectedProfileControls: [
          { code: 'BTMP-IND-03', title: '重型设备基础、吊装通道与起重系统投用', durationSeed: 'expert_domain_industrial_heavy_equipment' },
          { code: 'BTMP-IND-04', title: '重型设备吊装就位、精调灌浆与负荷试验', durationSeed: 'expert_domain_industrial_heavy_equipment' },
        ],
      },
      {
        businessType: 'transportation_hub',
        businessSubtype: 'transport_railway_station',
        expectedVariant: 'transportation_rail_station',
        expectedPackCodes: ['TRH-04-01-01', 'TRH-04-01-02'],
        excludedPackPrefixes: ['TRH-04-02', 'TRH-04-03'],
        expectedT2: 't2-transport-hub-platform-canopy-trackside-interface-rhythm-v1',
        expectedWorkflowRules: [
          'rail_station_envelope_to_trackside_window_work',
          'rail_trackside_window_to_platform_operation_interface',
          'rail_platform_operation_interface_to_hub_trial_operation',
        ],
        expectedProfileControls: [
          { code: 'BTMP-TRH-01', title: '铁路站房、站台雨棚与营业线保护施工', durationSeed: 'expert_domain_transportation_rail_station' },
          { code: 'BTMP-TRH-05', title: '站台门、客运设备与铁路运营系统联调', durationSeed: 'expert_domain_transportation_rail_station' },
        ],
      },
      {
        businessType: 'transportation_hub',
        businessSubtype: 'transport_metro_interchange',
        expectedVariant: 'transportation_metro_interchange',
        expectedPackCodes: ['TRH-04-02-01', 'TRH-04-02-02'],
        excludedPackPrefixes: ['TRH-04-01', 'TRH-04-03'],
        expectedT2: 't2-transport-hub-metro-night-window-transfer-rhythm-v1',
        expectedWorkflowRules: [
          'metro_structure_baseline_to_operation_protection',
          'metro_operation_protection_to_interchange_integration',
          'metro_interchange_integration_to_hub_trial_operation',
        ],
        expectedProfileControls: [
          { code: 'BTMP-TRH-01', title: '既有地铁运营保护、换乘通道与夜间窗口施工', durationSeed: 'expert_domain_transportation_metro_interchange' },
          { code: 'BTMP-TRH-05', title: '系统改接恢复与跨线换乘运营联调', durationSeed: 'expert_domain_transportation_metro_interchange' },
        ],
      },
      {
        businessType: 'transportation_hub',
        businessSubtype: 'transport_bus_terminal',
        expectedVariant: 'transportation_bus_terminal',
        expectedPackCodes: ['TRH-04-03-01', 'TRH-04-03-02'],
        excludedPackPrefixes: ['TRH-04-01', 'TRH-04-02'],
        expectedT2: 't2-transport-hub-bus-yard-charging-rhythm-v1',
        expectedWorkflowRules: [
          'hub_external_traffic_to_bus_yard_work',
          'bus_yard_to_charging_dispatch_integration',
          'bus_charging_dispatch_to_hub_trial_operation',
        ],
        expectedProfileControls: [
          { code: 'BTMP-TRH-01', title: '汽车客运站房、发车位与停车坪施工', durationSeed: 'expert_domain_transportation_bus_terminal' },
          { code: 'BTMP-TRH-05', title: '充电、调度、消防与人车分流运营联调', durationSeed: 'expert_domain_transportation_bus_terminal' },
        ],
      },
      {
        businessType: 'sports_culture',
        businessSubtype: 'sports_indoor_arena',
        expectedVariant: 'sports_culture_indoor_arena',
        expectedPackCodes: ['SPC-05-01-01', 'SPC-05-01-02'],
        excludedPackPrefixes: ['SPC-05-02', 'SPC-05-03'],
        expectedT2: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1',
        expectedWorkflowRules: [
          'venue_envelope_to_arena_field_system',
          'arena_field_system_to_conversion_equipment',
          'arena_conversion_equipment_to_full_rehearsal',
        ],
        expectedProfileControls: [
          { code: 'BTMP-SPC-04', title: '比赛场地、伸缩看台与场馆转换系统施工', durationSeed: 'expert_domain_sports_indoor_arena' },
          { code: 'BTMP-SPC-05', title: '赛事系统联调、多模式转换与满负荷演练', durationSeed: 'expert_domain_sports_indoor_arena' },
        ],
      },
      {
        businessType: 'sports_culture',
        businessSubtype: 'sports_theater',
        expectedVariant: 'sports_culture_theater',
        expectedPackCodes: ['SPC-05-02-01', 'SPC-05-02-02'],
        excludedPackPrefixes: ['SPC-05-01', 'SPC-05-03'],
        expectedT2: 't2-sports-culture-theater-stage-acoustic-rhythm-v1',
        expectedWorkflowRules: [
          'venue_envelope_to_theater_stage_machinery',
          'theater_stage_machinery_to_acoustic_performance_system',
          'theater_performance_system_to_full_rehearsal',
        ],
        expectedProfileControls: [
          { code: 'BTMP-SPC-04', title: '观众厅声学装修、舞台机械与演出系统安装', durationSeed: 'expert_domain_sports_theater' },
          { code: 'BTMP-SPC-05', title: '声场调试、舞台安全联锁与带妆排演', durationSeed: 'expert_domain_sports_theater' },
        ],
      },
      {
        businessType: 'sports_culture',
        businessSubtype: 'sports_exhibition',
        expectedVariant: 'sports_culture_exhibition',
        expectedPackCodes: ['SPC-05-03-01', 'SPC-05-03-02'],
        excludedPackPrefixes: ['SPC-05-01', 'SPC-05-02'],
        expectedT2: 't2-sports-culture-exhibition-environment-rhythm-v1',
        expectedWorkflowRules: [
          'venue_envelope_to_collection_environment',
          'collection_environment_to_exhibition_system',
          'exhibition_system_to_full_rehearsal',
        ],
        expectedProfileControls: [
          { code: 'BTMP-SPC-04', title: '藏品环境、展陈承载与专业照明施工', durationSeed: 'expert_domain_sports_exhibition' },
          { code: 'BTMP-SPC-05', title: '恒温恒湿、安防导览联调与试开放', durationSeed: 'expert_domain_sports_exhibition' },
        ],
      },
    ] as const
    const expectedExecutionPhaseByPackCode = new Map([
      ['IPL-05-01-01', 'mep_roughin'],
      ['IPL-05-01-02', 'commissioning'],
      ['IPL-05-02-01', 'interior_fitout_terminal'],
      ['IPL-05-02-02', 'commissioning'],
      ['IPL-05-03-01', 'mep_roughin'],
      ['IPL-05-03-02', 'commissioning'],
      ['TRH-04-01-01', 'envelope_roof_facade'],
      ['TRH-04-01-02', 'commissioning'],
      ['TRH-04-02-01', 'superstructure_rhythm'],
      ['TRH-04-02-02', 'commissioning'],
      ['TRH-04-03-01', 'outdoor_municipal_landscape'],
      ['TRH-04-03-02', 'commissioning'],
      ['SPC-05-01-01', 'interior_fitout_terminal'],
      ['SPC-05-01-02', 'commissioning'],
      ['SPC-05-02-01', 'interior_fitout_terminal'],
      ['SPC-05-02-02', 'commissioning'],
      ['SPC-05-03-01', 'mep_roughin'],
      ['SPC-05-03-02', 'interior_fitout_terminal'],
    ])
    const expectedProfileDurationDays = new Map([
      ['industrial_logistics:BTMP-IND-03', 110],
      ['industrial_logistics:BTMP-IND-04', 120],
      ['industrial_cleanroom:BTMP-IND-03', 120],
      ['industrial_cleanroom:BTMP-IND-04', 140],
      ['industrial_heavy:BTMP-IND-03', 130],
      ['industrial_heavy:BTMP-IND-04', 120],
      ['transport_railway_station:BTMP-TRH-01', 145],
      ['transport_railway_station:BTMP-TRH-05', 60],
      ['transport_metro_interchange:BTMP-TRH-01', 175],
      ['transport_metro_interchange:BTMP-TRH-05', 75],
      ['transport_bus_terminal:BTMP-TRH-01', 120],
      ['transport_bus_terminal:BTMP-TRH-05', 50],
      ['sports_indoor_arena:BTMP-SPC-04', 90],
      ['sports_indoor_arena:BTMP-SPC-05', 60],
      ['sports_theater:BTMP-SPC-04', 120],
      ['sports_theater:BTMP-SPC-05', 80],
      ['sports_exhibition:BTMP-SPC-04', 100],
      ['sports_exhibition:BTMP-SPC-05', 70],
    ])
    const probes = new Map(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => [probe.businessType, probe]))

    for (const testCase of cases) {
      const probe = probes.get(testCase.businessType)
      expect(probe, testCase.businessSubtype).toBeTruthy()
      const facts = {
        ...buildDefaultMasterPlanProbeFacts(probe!),
        businessSubtype: testCase.businessSubtype,
      }
      const recommendation = buildTemplateRecommendation(facts as never)
      const templateSelection = buildWizardTemplateSelection(recommendation)
      const selectedCodes = Object.values(templateSelection.selectedNodesByTemplate).flat()

      expect(recommendation.projectOrganizationVariantCode, testCase.businessSubtype).toBe(testCase.expectedVariant)
      expect(selectedCodes, testCase.businessSubtype).toEqual(expect.arrayContaining([...testCase.expectedPackCodes]))
      for (const excludedPrefix of testCase.excludedPackPrefixes) {
        expect(selectedCodes.some((code) => code.startsWith(excludedPrefix)), `${testCase.businessSubtype}:${excludedPrefix}`).toBe(false)
      }

      const generated = await generateDefaultMasterPlanForProbe(probe!, {
        projectFactOverrides: { businessSubtype: testCase.businessSubtype },
        scopeOverrides: { business_subtype: testCase.businessSubtype },
      })
      const generatedCodes = generated.rows.map(rowCode)
      for (const expectedControl of testCase.expectedProfileControls) {
        const profileRow = generated.rows.find((row) => rowCode(row) === expectedControl.code)
        expect(profileRow, `${testCase.businessSubtype}:${expectedControl.code}`).toBeTruthy()
        expect(String(profileRow?.values.title ?? ''), `${testCase.businessSubtype}:${expectedControl.code} title`)
          .toBe(expectedControl.title)
        const calculation = rowMetadata(profileRow!).durationAssetCalculation as Record<string, unknown>
        expect(
          calculation.standardWorkDurationSeedStableCode,
          `${testCase.businessSubtype}:${expectedControl.code} duration seed`,
        ).toBe(expectedControl.durationSeed)
        expect(
          calculation.standardWorkDurationSeedResolverSource,
          `${testCase.businessSubtype}:${expectedControl.code} resolved seed source`,
        ).toBeTruthy()
        expect(
          calculation.standardWorkDurationSeedCoverageMode,
          `${testCase.businessSubtype}:${expectedControl.code} seed coverage mode`,
        ).toBeTruthy()
        expect(
          calculation.standardWorkDurationSeedScaleBasis,
          `${testCase.businessSubtype}:${expectedControl.code} seed scale basis`,
        ).toBeTruthy()
        const hasFixedDurationSeed = Number(calculation.standardWorkDurationSeedP50Days ?? 0) > 0
        const hasProductivityDurationSeed = Number(calculation.standardWorkDurationSeedProductivityP50PerDay ?? 0) > 0
          && Number(calculation.productivityDerivedDurationDays ?? 0) > 0
        expect(
          hasFixedDurationSeed || hasProductivityDurationSeed,
          `${testCase.businessSubtype}:${expectedControl.code} fixed or productivity duration seed`,
        ).toBe(true)
        expect(
          Number(calculation.standardWorkDurationSeedProductivityP50PerDay ?? 0),
          `${testCase.businessSubtype}:${expectedControl.code} seed productivity`,
        ).toBeGreaterThan(0)
        expect(
          Number(calculation.productivityDerivedDurationDays ?? 0),
          `${testCase.businessSubtype}:${expectedControl.code} productivity-derived duration`,
        ).toBeGreaterThan(0)
        expect(
          Number(calculation.selectedDurationDays),
          `${testCase.businessSubtype}:${expectedControl.code} selected duration ${JSON.stringify({
            seedP50Days: calculation.standardWorkDurationSeedP50Days,
            seedProductivity: calculation.standardWorkDurationSeedProductivityP50PerDay,
            productivityDerivedDurationDays: calculation.productivityDerivedDurationDays,
            t2TemplateId: calculation.t2RhythmTemplateId,
            t2P50Days: calculation.t2RhythmTemplateP50Days,
            realPlanSkeletonDurationDays: calculation.realPlanSkeletonDurationDays,
            selectionRule: calculation.selectionRule,
          })}`,
        ).toBe(expectedProfileDurationDays.get(`${testCase.businessSubtype}:${expectedControl.code}`))
        const businessTypeMasterPlan = rowMetadata(profileRow!).businessTypeMasterPlan as Record<string, unknown>
        expect(
          businessTypeMasterPlan.durationBaselineAuthority,
          `${testCase.businessSubtype}:${expectedControl.code} duration baseline authority`,
        ).toBe('project_organization_variant')
        expect(
          businessTypeMasterPlan.projectOrganizationVariantCode,
          `${testCase.businessSubtype}:${expectedControl.code} organization variant lineage`,
        ).toBe(testCase.expectedVariant)
        if (
          (testCase.businessType === 'transportation_hub' && expectedControl.code === 'BTMP-TRH-05')
          || testCase.businessType === 'sports_culture'
        ) {
          expect(
            calculation.t2RhythmTemplateId,
            `${testCase.businessSubtype}:${expectedControl.code} T2`,
          ).toBe(testCase.expectedT2)
        }
      }
      if (testCase.businessSubtype === 'transport_railway_station') {
        for (const genericFitoutCode of ['BTMP-BASE-09', '03-09']) {
          const genericFitoutRow = generated.rows.find((row) => rowCode(row) === genericFitoutCode)
          expect(genericFitoutRow, `${testCase.businessSubtype}:${genericFitoutCode}`).toBeTruthy()
          expect(
            (rowMetadata(genericFitoutRow!).durationAssetCalculation as Record<string, unknown>).t2RhythmTemplateId,
            `${testCase.businessSubtype}:${genericFitoutCode} must not consume the platform-interface T2`,
          ).not.toBe(testCase.expectedT2)
        }
        for (const publicTransferCode of ['BTMP-TRH-05A', 'BTMP-TRH-06']) {
          const publicTransferRow = generated.rows.find((row) => rowCode(row) === publicTransferCode)
          expect(publicTransferRow, `${testCase.businessSubtype}:${publicTransferCode}`).toBeTruthy()
          expect(
            (rowMetadata(publicTransferRow!).durationAssetCalculation as Record<string, unknown>).t2RhythmTemplateId,
            `${testCase.businessSubtype}:${publicTransferCode} public-system transfer T2`,
          ).toBe('t2-transportation-hub-public-system-transfer-rhythm-v1')
        }
      }
      for (const expectedPackCode of testCase.expectedPackCodes) {
        expect(generatedCodes.some((code) => code.startsWith(expectedPackCode)), `${testCase.businessSubtype}:${expectedPackCode}`).toBe(true)
        const expectedExecutionPhase = expectedExecutionPhaseByPackCode.get(expectedPackCode)
        const generatedPackRows = generated.rows.filter((row) => rowCode(row).startsWith(expectedPackCode))
        expect(generatedPackRows.length, `${testCase.businessSubtype}:${expectedPackCode} generated rows`).toBeGreaterThan(0)
        expect(new Set(generatedPackRows.map((row) => String(row.values.execution_phase ?? ''))), `${testCase.businessSubtype}:${expectedPackCode} phase`)
          .toEqual(new Set([expectedExecutionPhase]))
      }
      for (const excludedPrefix of testCase.excludedPackPrefixes) {
        expect(generatedCodes.some((code) => code.startsWith(excludedPrefix)), `${testCase.businessSubtype}:${excludedPrefix}`).toBe(false)
      }
      const lateActivityManagementSupportRows = generated.rows.filter((row) => (
        row.rowProjectionMode === 'schedule_row'
        && String(row.values.execution_phase ?? '') === 'management_support'
        && /联调|调试|试车|试生产|试运营|排演|演练|投运|运营移交/.test(String(row.values.title ?? ''))
      ))
      expect(lateActivityManagementSupportRows.map((row) => ({
        code: rowCode(row),
        title: row.values.title,
      })), `${testCase.businessSubtype} late activities must not fall back to management_support`).toEqual([])

      const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
      const variantT2Rows = profileRows.filter((row) => {
        const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown> | undefined
        return calculation?.t2RhythmTemplateId === testCase.expectedT2
      })
      expect(variantT2Rows.length, `${testCase.businessSubtype}:${testCase.expectedT2}`).toBeGreaterThan(0)
      expect(variantT2Rows.every((row) => {
        const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
        return String(calculation.durationFormula ?? '').includes(testCase.expectedVariant)
      }), `${testCase.businessSubtype} variant lineage`).toBe(true)

      let visibleBoundaryWorkflowEdgeCount = 0
      for (const [workflowIndex, workflowRule] of testCase.expectedWorkflowRules.entries()) {
        const lineageRows = generated.rows.filter((row) => (
          ((rowMetadata(row).crossItemWorkflow as Array<Record<string, unknown>> | undefined) ?? [])
            .some((item) => item.ruleCode === workflowRule)
        ))
        expect(lineageRows.length, `${testCase.businessSubtype}:${workflowRule} runtime lineage`).toBeGreaterThan(0)

        const edgeRows = generated.rows.filter((row) => (
          (row.predecessorDependencies ?? []).some((dependency) => (
            dependencyConsumesCrossItemWorkflowRule(dependency as unknown as Record<string, unknown>, workflowRule)
          ))
        ))
        if (workflowIndex !== 1 && edgeRows.length > 0) {
          visibleBoundaryWorkflowEdgeCount += 1
        }
        if (workflowIndex === 1) {
          expect(lineageRows.some((row) => (
            ((rowMetadata(row).crossItemWorkflow as Array<Record<string, unknown>> | undefined) ?? [])
              .some((item) => (
                item.ruleCode === workflowRule
                && item.managedFrontierAnchorProjection === true
              ))
          )), `${testCase.businessSubtype}:${workflowRule} managed-frontier anchor lineage`).toBe(true)
        }
        expect(edgeRows.every((row) => (
          (row.predecessorDependencies ?? []).filter((dependency) => (
            dependencyConsumesCrossItemWorkflowRule(dependency as unknown as Record<string, unknown>, workflowRule)
          )).length === 1
        )), `${testCase.businessSubtype}:${workflowRule} bounded lane edge`).toBe(true)
      }
      expect(visibleBoundaryWorkflowEdgeCount, `${testCase.businessSubtype} visible ingress-or-egress edge`).toBeGreaterThanOrEqual(1)
    }
  }, 600_000)

  it('uses the executable generic pile-foundation seed for the school base-profile pile stage', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const pileFoundation = generated.rows.find((row) => (
      row.rowProjectionMode === 'schedule_row'
      && rowMetadata(row).stableCode === 'BTMP-BASE-03'
    ))

    expect(pileFoundation).toBeTruthy()
    const calculation = rowMetadata(pileFoundation!).durationAssetCalculation as Record<string, unknown>
    expect(calculation).toEqual(expect.objectContaining({
      standardWorkDurationSeedStableCode: 'pile_foundation',
      standardWorkDurationSeedP50Days: expect.any(Number),
      productivityDerivedDurationDays: expect.any(Number),
    }))
    expect(Number(calculation.standardWorkDurationSeedP50Days)).toBeGreaterThan(0)
    expect(Number(calculation.productivityDerivedDurationDays)).toBeGreaterThan(0)
  }, 120_000)

  it('selects commissioning or handover duration seeds for school acceptance-handover rows', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const handoverRows = scheduleRowsForBusinessTypeProfile(generated.rows)
      .filter((row) => {
        const metadata = rowMetadata(row)
        const businessTypeMasterPlan = (metadata.businessTypeMasterPlan ?? {}) as Record<string, unknown>
        return businessTypeMasterPlan.profileSourceType === 'business_type_master_plan_profile_v1'
          && row.values.execution_phase === 'acceptance_handover'
      })

    expect(handoverRows.length).toBeGreaterThan(0)
    expect(handoverRows.every((row) => {
      const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
      const stableCode = String(calculation.standardWorkDurationSeedStableCode ?? '')
      return /commissioning|handover|acceptance/i.test(stableCode)
    })).toBe(true)
    expect(handoverRows.some((row) => {
      const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
      return calculation.standardWorkDurationSeedStableCode === 'integrated_commissioning'
    })).toBe(true)
  }, 120_000)

  it('selects commissioning or handover duration seeds for every formal non-residential closeout row', async () => {
    const nonResidentialProbes = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES
      .filter((probe) => probe.businessType !== 'general_civil')
    expect(nonResidentialProbes.length).toBeGreaterThan(0)

    const mismatches: string[] = []
    for (const probe of nonResidentialProbes) {
      const generated = await generateDefaultMasterPlanForProbe(probe)
      const closeoutRows = scheduleRowsForBusinessTypeProfile(generated.rows)
        .filter((row) => ['commissioning', 'acceptance_handover'].includes(String(row.values.execution_phase ?? '')))
      expect(closeoutRows.length).toBeGreaterThan(0)

      for (const row of closeoutRows) {
        const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
        const stableCode = String(calculation.standardWorkDurationSeedStableCode ?? '')
        if (!isExecutableDurationAssetSemanticallyCompatible(row)) {
          mismatches.push(`${probe.businessType}:${row.values.title}:${stableCode}`)
        }
      }
    }

    expect(mismatches).toEqual([])
  }, 180_000)

  it('maps school profile rows to confirmed cross-item workflow dependency assets', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const secondaryStructure = profileRows.find((row) => rowMetadata(row).stableCode === 'BTMP-SCH-02')
    const cafeteriaFitout = profileRows.find((row) => rowMetadata(row).stableCode === 'BTMP-SCH-04')
    const summary = (generated as any).durationAssetUtilizationSummary as Record<string, unknown> | undefined

    expect(secondaryStructure).toBeTruthy()
    expect(cafeteriaFitout).toBeTruthy()

    const structureDependency = (secondaryStructure!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-SCH-01')
    const structureEvidence = structureDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined
    expect(structureEvidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      relationLayerKey: 'cross_item_workflow',
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetType: 'cross_item_workflow',
      dependencyAssetStableCode: 'main_structure_to_masonry_infill',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'structure_masonry_infill',
      dependencyTimingAssetConsumed: true,
    }))
    expect(structureDependency).toEqual(expect.objectContaining({
      dependencyType: structureEvidence?.dependencyAssetDependencyType,
      lagDays: structureEvidence?.dependencyAssetLagDays,
    }))
    expect(structureEvidence?.dependencyTimingSource).toBe('cross_item_workflow_asset')

    const masonryDependency = (cafeteriaFitout!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-SCH-02')
    const masonryEvidence = masonryDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined
    expect(masonryEvidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      relationLayerKey: 'cross_item_workflow',
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetType: 'cross_item_workflow',
      dependencyAssetStableCode: 'masonry_to_plaster_finish',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'structure_masonry_infill',
      dependencyTimingAssetConsumed: true,
    }))

    expect(Number(summary?.dependencyAssetConsumedRowCount ?? 0)).toBeGreaterThanOrEqual(2)
    expect(summary?.uniqueDependencyAssetStableCodes).toEqual(expect.arrayContaining([
      'main_structure_to_masonry_infill',
      'masonry_to_plaster_finish',
    ]))
  }, 120_000)

  it('records dependency-schedule evidence on business-type profile rows after dependency assets shape the candidate dates', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const teachingStructure = profileRows.find((row) => rowMetadata(row).stableCode === 'BTMP-SCH-01')
    const secondaryStructure = profileRows.find((row) => rowMetadata(row).stableCode === 'BTMP-SCH-02')

    expect(teachingStructure).toBeTruthy()
    expect(secondaryStructure).toBeTruthy()

    const structureDependency = (secondaryStructure!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-SCH-01')
    expect(structureDependency?.dependencyRuleEvidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      relationLayerKey: 'cross_item_workflow',
      dependencyAssetConsumed: true,
      dependencyTimingAssetConsumed: true,
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
    }))

    const dependencySchedule = rowMetadata(secondaryStructure!).dependencySchedule as Record<string, unknown> | undefined
    expect(dependencySchedule).toEqual(expect.objectContaining({
      source: 'generated_dependency_network',
      predecessorCount: expect.any(Number),
      invalidPredecessorCount: 0,
      convergence: expect.objectContaining({ status: 'converged' }),
    }))
    expect(Number(dependencySchedule?.predecessorCount ?? 0)).toBeGreaterThan(0)
    expect(dependencySchedule?.appliedSources).toEqual(expect.arrayContaining(['dependency_intent_template']))
    expect(dependencySchedule?.appliedDependencyTypes).toEqual(expect.arrayContaining([structureDependency?.dependencyType]))
    expect(dependencySchedule?.appliedDependencyAssetStableCodes).toEqual(expect.arrayContaining([
      'main_structure_to_masonry_infill',
    ]))
    expect(dependencySchedule?.appliedDependencyTimingSources).toEqual(expect.arrayContaining([
      'cross_item_workflow_asset',
    ]))
    expect(dependencySchedule?.appliedRelationLayerKeys).toEqual(expect.arrayContaining([
      'cross_item_workflow',
    ]))
  }, 120_000)

  it('maps non-residential profile codes to confirmed cross-item workflow dependency assets', async () => {
    const dataCenterProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'data_center')
    expect(dataCenterProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(dataCenterProbe!)
    const whiteSpaceFitout = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => row.values.title === '机房白区装修与架空地板施工')

    expect(whiteSpaceFitout).toBeTruthy()
    const structureDependency = (whiteSpaceFitout!.predecessorDependencies ?? [])
      .find((dependency) => dependency.intentCode === 'business_type_master_plan_profile_sequence')
    const evidence = structureDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined

    expect(structureDependency).toEqual(expect.objectContaining({
      predecessorStableCode: 'BTMP-DTC-01',
      dependencyType: expect.any(String),
      intentCode: 'business_type_master_plan_profile_sequence',
    }))
    expect(evidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      relationLayerKey: 'cross_item_workflow',
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetType: 'cross_item_workflow',
      dependencyAssetStableCode: 'data_center_envelope_to_power_cooling_install',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'data_center_cleanroom',
      dependencyTimingAssetConsumed: true,
      dependencyTimingMutationBoundary: 'preview_no_write_wizard_commit_transactional',
    }))
    expect(evidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB50174_2017',
      'GB50462_2015',
    ]))

    const precisionCooling = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => rowMetadata(row).stableCode === 'BTMP-DTC-04')
    expect(precisionCooling).toBeTruthy()
    const coolingEnvelopeDependency = (precisionCooling!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-DTC-01')
    const coolingEnvelopeEvidence = coolingEnvelopeDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined

    expect(coolingEnvelopeEvidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      relationLayerKey: 'cross_item_workflow',
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetType: 'cross_item_workflow',
      dependencyAssetStableCode: 'data_center_envelope_to_power_cooling_install',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'data_center_cleanroom',
    }))
    expect(coolingEnvelopeEvidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB50174_2017',
      'GB50462_2015',
    ]))
  }, 120_000)

  it('maps data-center power profile codes to confirmed monitoring-interface dependency assets', async () => {
    const dataCenterProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'data_center')
    expect(dataCenterProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(dataCenterProbe!)
    const monitoringIntegration = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => rowMetadata(row).stableCode === 'BTMP-DTC-05')

    expect(monitoringIntegration).toBeTruthy()
    const powerDependency = (monitoringIntegration!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-DTC-03')
    const evidence = powerDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined

    expect(evidence).toEqual(expect.objectContaining({
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetStableCode: 'data_center_power_to_common_building_monitoring_interface',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'mixed_use_interface',
    }))
    expect(evidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB50174_2017',
      'GB50339_2013',
      'GB50303_2015',
    ]))
  }, 120_000)

  it('maps hospital cleanroom profile codes to confirmed clean-air validation dependency assets', async () => {
    const hospitalProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'hospital')
    expect(hospitalProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(hospitalProbe!)
    const profileRows = scheduleRowsForBusinessTypeProfile(generated.rows)
    const singleSystemValidation = profileRows
      .find((row) => rowMetadata(row).stableCode === 'BTMP-HSP-05A')
    const medicalCommissioning = profileRows
      .find((row) => rowMetadata(row).stableCode === 'BTMP-HSP-06')

    expect(singleSystemValidation).toBeTruthy()
    expect(medicalCommissioning).toBeTruthy()
    expect(rowMetadata(medicalCommissioning!).durationAssetCalculation).toEqual(expect.objectContaining({
      standardWorkDurationSeedStableCode: 'integrated_commissioning',
      t2RhythmTemplateId: 't2-hospital-cleanroom-medical-system-commissioning-v1',
    }))
    const cleanroomDependency = (singleSystemValidation!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-HSP-03')
    const evidence = cleanroomDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined

    expect(evidence).toEqual(expect.objectContaining({
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetStableCode: 'cleanroom_envelope_medgas_to_clean_air_validation',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'data_center_cleanroom',
    }))
    expect(evidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB50333_2013',
      'GB50591_2010',
      'GB50751_2012',
    ]))

    const medicalGasDependency = (singleSystemValidation!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-HSP-04')
    const medicalGasEvidence = medicalGasDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined
    expect(medicalGasEvidence).toEqual(expect.objectContaining({
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetStableCode: 'medical_gas_validation_to_special_room_release',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'mep_system_commissioning',
    }))
    expect(medicalGasEvidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB50751_2012',
      'GB50333_2013',
      'GBZ130_2020',
    ]))

    const medicalEquipmentDependency = (singleSystemValidation!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-HSP-05')
    const medicalEquipmentEvidence = medicalEquipmentDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined
    expect(medicalEquipmentEvidence).toEqual(expect.objectContaining({
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetStableCode: 'medical_gas_validation_to_special_room_release',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'mep_system_commissioning',
    }))
    expect(medicalEquipmentEvidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB50751_2012',
      'GB50333_2013',
      'GBZ130_2020',
    ]))
    expect((medicalCommissioning!.predecessorDependencies ?? []).some((dependency) => (
      dependency.predecessorStableCode === 'BTMP-HSP-05A'
      && dependency.dependencyType === 'FS'
    ))).toBe(true)
  }, 120_000)

  it('maps modular profile codes to confirmed MiC cross-item workflow dependency assets', async () => {
    const modularProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'modular_building')
    expect(modularProbe).toBeTruthy()

    const generated = await generateDefaultMasterPlanForProbe(modularProbe!)
    const hoistConnection = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => rowMetadata(row).stableCode === 'BTMP-MOD-04')

    expect(hoistConnection).toBeTruthy()
    const sitePreparationDependency = (hoistConnection!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-MOD-03')
    const evidence = sitePreparationDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined

    expect(sitePreparationDependency).toEqual(expect.objectContaining({
      predecessorStableCode: 'BTMP-MOD-03',
      dependencyType: expect.any(String),
      intentCode: 'business_type_master_plan_profile_sequence',
    }))
    expect(evidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      relationLayerKey: 'cross_item_workflow',
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetType: 'cross_item_workflow',
      dependencyAssetStableCode: 'mic_transport_receiving_to_site_hoist_connection',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'prefab_modular',
      dependencyTimingAssetConsumed: true,
      dependencyTimingMutationBoundary: 'preview_no_write_wizard_commit_transactional',
    }))
    expect(evidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB55032_2022',
    ]))

    const factoryProductionDependency = (hoistConnection!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-MOD-02')
    const factoryEvidence = factoryProductionDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined
    expect(factoryEvidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      relationLayerKey: 'cross_item_workflow',
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetType: 'cross_item_workflow',
      dependencyAssetStableCode: 'mic_factory_integration_to_transport_receiving',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'recommended',
      dependencyAssetHandoffCategory: 'prefab_modular',
    }))
    expect(factoryEvidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB55032_2022',
    ]))

    const envelopeCloseout = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => rowMetadata(row).stableCode === 'BTMP-MOD-05')

    expect(envelopeCloseout).toBeTruthy()
    const connectionCloseoutDependency = (envelopeCloseout!.predecessorDependencies ?? [])
      .find((dependency) => dependency.predecessorStableCode === 'BTMP-MOD-04')
    const connectionCloseoutEvidence = connectionCloseoutDependency?.dependencyRuleEvidence as Record<string, unknown> | undefined
    expect(connectionCloseoutEvidence).toEqual(expect.objectContaining({
      source: 'construction_task_dependency_constraint_rule_system',
      relationLayerKey: 'cross_item_workflow',
      productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
      mutationBoundary: 'preview_no_write_wizard_commit_transactional',
      createsProductionTaskDependency: true,
      dependencyAssetConsumed: true,
      dependencyAssetType: 'cross_item_workflow',
      dependencyAssetStableCode: 'mic_site_connection_to_interface_closeout',
      dependencyAssetAutoApplyPolicy: 'confirmed_template_only',
      dependencyAssetStrength: 'hard',
      dependencyAssetHandoffCategory: 'prefab_modular',
    }))
    expect(connectionCloseoutEvidence?.dependencyAssetEvidenceSourceKeys).toEqual(expect.arrayContaining([
      'GB55032_2022',
      'GB50204_2015',
    ]))
  }, 120_000)

  it('selects phase-compatible seeds for hotel MEP and industrial commissioning rows', async () => {
    const probes = new Map(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => [probe.businessType, probe]))
    const hotel = await generateDefaultMasterPlanForProbe(probes.get('hotel')!)
    const industrial = await generateDefaultMasterPlanForProbe(probes.get('industrial')!)

    const hotelBackOfHouseMep = scheduleRowsForBusinessTypeProfile(hotel.rows)
      .find((row) => row.values.title === '厨房洗衣房与后勤机电安装')
    const industrialCommissioningRows = scheduleRowsForBusinessTypeProfile(industrial.rows)
      .filter((row) => ['commissioning', 'acceptance_handover'].includes(String(row.values.execution_phase ?? '')))

    expect(hotelBackOfHouseMep).toBeTruthy()
    expect(rowMetadata(hotelBackOfHouseMep!).durationAssetCalculation).toEqual(expect.objectContaining({
      standardWorkDurationSeedStableCode: 'mep_plumbing_fire_pipe',
    }))
    expect(industrialCommissioningRows.length).toBeGreaterThan(0)
    expect(industrialCommissioningRows.every((row) => {
      const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown>
      const stableCode = String(calculation.standardWorkDurationSeedStableCode ?? '')
      return /commissioning|handover|acceptance/i.test(stableCode)
    })).toBe(true)
  }, 120_000)

  it('passes company context to standard duration seed resolver for default master-plan profiles', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const originalResolve = algorithmSeedResolver.resolveStandardWorkDurationSeedByStableCode
    const seedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation((stableCode, context) => originalResolve(stableCode, context))
    try {
      await generateDefaultMasterPlanForProbe(schoolProbe!, {
        companyId: '22222222-2222-4222-8222-222222222222',
      })

      expect(seedSpy.mock.calls.some(([stableCode, context]) => (
        stableCode === 'cast_in_place_formwork'
        && context?.projectId === '00000000-0000-4000-8000-000000000001'
        && context?.companyId === '22222222-2222-4222-8222-222222222222'
      ))).toBe(true)
    } finally {
      seedSpy.mockRestore()
    }
  }, 120_000)

  it('serializes standard duration seed resolution for default master-plan profiles', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const originalResolve = algorithmSeedResolver.resolveStandardWorkDurationSeedByStableCode
    let activeLookups = 0
    let maximumConcurrentLookups = 0
    const seedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode, context) => {
        activeLookups += 1
        maximumConcurrentLookups = Math.max(maximumConcurrentLookups, activeLookups)
        try {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return originalResolve(stableCode, context)
        } finally {
          activeLookups -= 1
        }
      })

    try {
      await generateDefaultMasterPlanForProbe(schoolProbe!)
      expect(seedSpy).toHaveBeenCalled()
      expect(maximumConcurrentLookups).toBe(1)
    } finally {
      seedSpy.mockRestore()
    }
  }, 120_000)

  it('consumes active standard duration seeds in default master-plan profile rows', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    const activeSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeedByStableCode')
      .mockImplementation(async (stableCode) => {
        if (stableCode !== 'cast_in_place_formwork') return null
        return {
          __stableCode: 'cast_in_place_formwork',
          __resolverSource: 'active_seed',
          __resolverVersionId: 'runtime-seed-cast-in-place-v-test',
          stableCode: 'cast_in_place_formwork',
          defaultDaysP20: 4,
          defaultDaysP50: 6,
          defaultDaysP80: 8,
          durationCoverageMode: 'activity_reference',
          scaleBasis: 'floor_cycle',
          baselineProductivity: {
            p50PerDay: 0.25,
            unit: 'floor',
            basis: 'active seed fixture',
          },
        }
      })

    try {
      const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
      const activeSeedRows = scheduleRowsForBusinessTypeProfile(generated.rows)
        .filter((row) => {
          const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown> | undefined
          return calculation?.standardWorkDurationSeedStableCode === 'cast_in_place_formwork'
        })

      expect(activeSeedSpy).toHaveBeenCalledWith('cast_in_place_formwork', {
        projectId: '00000000-0000-4000-8000-000000000001',
      })
      expect(activeSeedRows.length).toBeGreaterThan(0)
      expect(activeSeedRows.every((row) => {
        const mapping = rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined
        const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown> | undefined
        return mapping?.standardWorkDurationSeedResolverSource === 'active_seed'
          && mapping?.standardWorkDurationSeedResolverVersionId === 'runtime-seed-cast-in-place-v-test'
          && calculation?.standardWorkDurationSeedResolverSource === 'active_seed'
          && calculation?.standardWorkDurationSeedResolverVersionId === 'runtime-seed-cast-in-place-v-test'
          && calculation?.standardWorkDurationSeedP50Days === 6
      })).toBe(true)
    } finally {
      activeSeedSpy.mockRestore()
    }
  }, 120_000)

  it('reads governed active standard duration seed records for default master-plan profile rows', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    dbServiceMocks.tables.algorithm_seed_versions.push({
      id: 'governed-standard-work-duration-version-test',
      seed_type: 'standard_work_duration',
      status: 'active',
      is_current: true,
    })
    dbServiceMocks.tables.algorithm_seed_records.push({
      seed_version_id: 'governed-standard-work-duration-version-test',
      seed_type: 'standard_work_duration',
      stable_code: 'cast_in_place_formwork',
      status: 'active',
      rule_payload: {
        stableCode: 'cast_in_place_formwork',
        defaultDaysP20: 11,
        defaultDaysP50: 12,
        defaultDaysP80: 13,
        durationCoverageMode: 'activity_reference',
        durationContributionMode: 'duration_bearing',
        baseDaysEligible: true,
        scaleBasis: 'floor_cycle',
        baselineProductivity: {
          p50PerDay: 0.5,
          unit: 'floor',
          basis: 'governed active seed test fixture',
        },
      },
    })

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const governedSeedRows = scheduleRowsForBusinessTypeProfile(generated.rows)
      .filter((row) => {
        const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown> | undefined
        return calculation?.standardWorkDurationSeedStableCode === 'cast_in_place_formwork'
      })

    expect(governedSeedRows.length).toBeGreaterThan(0)
    expect(governedSeedRows.every((row) => {
      const mapping = rowMetadata(row).durationAssetMapping as Record<string, unknown> | undefined
      const calculation = rowMetadata(row).durationAssetCalculation as Record<string, unknown> | undefined
      return mapping?.standardWorkDurationSeedResolverSource === 'active_seed'
        && mapping?.standardWorkDurationSeedResolverVersionId === 'governed-standard-work-duration-version-test'
        && calculation?.standardWorkDurationSeedResolverSource === 'active_seed'
        && calculation?.standardWorkDurationSeedResolverVersionId === 'governed-standard-work-duration-version-test'
        && calculation?.standardWorkDurationSeedP50Days === 12
    })).toBe(true)
  }, 120_000)

  it('reads governed active T2 rhythm records for residential default master-plan durations', async () => {
    const residentialProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'general_civil')
    expect(residentialProbe).toBeTruthy()

    dbServiceMocks.tables.algorithm_seed_versions.push({
      id: 'governed-t2-rhythm-version-test',
      seed_type: 't2_division_rhythm_template',
      status: 'active',
      is_current: true,
    })
    dbServiceMocks.tables.algorithm_seed_records.push({
      seed_version_id: 'governed-t2-rhythm-version-test',
      seed_type: 't2_division_rhythm_template',
      stable_code: 't2-residential-standard-floor-structure-rhythm-v1',
      status: 'active',
      rule_payload: {
        templateId: 't2-residential-standard-floor-structure-rhythm-v1',
        rhythm: {
          parentWindowDays: { p20: 7, p50: 8, p80: 10 },
          workfaceUnit: 'floor',
          overlapPolicy: 'sequential_with_controlled_overlap',
        },
      },
    })

    const generated = await generateDefaultMasterPlanForProbe(residentialProbe!)
    const standardFloorCycle = generated.rows.find((row) => (
      row.rowProjectionMode === 'schedule_row'
      && String(row.values.standard_work_code ?? rowMetadata(row).stableCode ?? '') === 'RMP-04-01-02'
    ))
    expect(standardFloorCycle).toBeTruthy()
    const calculation = rowMetadata(standardFloorCycle!).durationAssetCalculation as Record<string, unknown>

    expect(calculation).toEqual(expect.objectContaining({
      t2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
      t2RhythmTemplateP50Days: 8,
      t2RhythmTemplateResolverSource: 'active_seed',
      t2RhythmTemplateResolverVersionId: 'governed-t2-rhythm-version-test',
    }))
    expect(Number(standardFloorCycle!.values.smart_reference_days)).toBeGreaterThanOrEqual(236)
  }, 120_000)

  it('selects newly governed active T2 rhythm templates for non-residential default master-plan phases', async () => {
    const schoolProbe = PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.find((probe) => probe.businessType === 'school')
    expect(schoolProbe).toBeTruthy()

    dbServiceMocks.tables.algorithm_seed_versions.push({
      id: 'governed-school-t2-rhythm-version-test',
      seed_type: 't2_division_rhythm_template',
      status: 'active',
      is_current: true,
    })
    dbServiceMocks.tables.algorithm_seed_records.push({
      seed_version_id: 'governed-school-t2-rhythm-version-test',
      seed_type: 't2_division_rhythm_template',
      stable_code: 't2-school-governed-superstructure-rhythm-test',
      status: 'active',
      rule_payload: {
        templateId: 't2-school-governed-superstructure-rhythm-test',
        templateName: 'Governed school superstructure rhythm test fixture',
        tier: 'T2',
        sourceType: 'system_standard_library',
        sourceVersion: 'governed-school-t2-test',
        sourceRefs: ['test-fixture'],
        reuseScope: 'industry',
        maturity: 'seeded_cold_start',
        confidence: 'high',
        applicability: {
          businessTypeCodes: ['school'],
          phaseWindows: ['superstructure'],
          divisionFamilies: ['superstructure'],
          subdivisionFamilies: ['teaching_building_structure'],
          methodVariantCodes: ['teaching_building_cast_in_place'],
          structureTypeCodes: ['campus', 'frame_core'],
          requiredScopeDimensions: ['building', 'floor'],
        },
        rhythm: {
          parentWindowDays: { p20: 210, p50: 230, p80: 260 },
          workfaceUnit: 'floor',
          overlapPolicy: 'sequential_with_controlled_overlap',
        },
      },
    })

    const generated = await generateDefaultMasterPlanForProbe(schoolProbe!)
    const teachingStructure = scheduleRowsForBusinessTypeProfile(generated.rows)
      .find((row) => rowMetadata(row).stableCode === 'BTMP-SCH-01')
    expect(teachingStructure).toBeTruthy()
    const calculation = rowMetadata(teachingStructure!).durationAssetCalculation as Record<string, unknown>

    expect(calculation).toEqual(expect.objectContaining({
      t2RhythmTemplateId: 't2-school-governed-superstructure-rhythm-test',
      t2RhythmTemplateP50Days: 230,
      t2RhythmTemplateResolverSource: 'active_seed',
      t2RhythmTemplateResolverVersionId: 'governed-school-t2-rhythm-version-test',
    }))
    expect(teachingStructure!.values.smart_reference_days).toBe(230)
    const summary = (generated as any).durationAssetUtilizationSummary as Record<string, unknown> | undefined
    expect(Number(summary?.activeT2RhythmTemplateRowCount ?? 0)).toBeGreaterThan(0)
    expect(summary?.activeT2RhythmTemplateIds).toEqual(expect.arrayContaining([
      't2-school-governed-superstructure-rhythm-test',
    ]))
    expect(summary?.activeT2RhythmTemplateVersionIds).toEqual(expect.arrayContaining([
      'governed-school-t2-rhythm-version-test',
    ]))
  }, 120_000)

  it('keeps fast-template managed-frontier previews bounded while preserving descendant rollup authority', async () => {
    const diagnosticLogs: Array<Record<string, unknown>> = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
      if (typeof message !== 'string') return
      try {
        const parsed = JSON.parse(message)
        if (parsed.source === 'wbs_template_generation_stage_timing') {
          diagnosticLogs.push(parsed)
        }
      } catch {
        // Ignore unrelated console noise.
      }
    })

    let generated: Awaited<ReturnType<typeof generateWbsTemplateRows>>
    try {
      generated = await generateWbsTemplateRows({
        projectId: '00000000-0000-4000-8000-000000000001',
        surface: 'task_list',
        detailLevel: 'planning_skeleton' as never,
        diagnosticDurationSuggestionMode: 'fast_template',
        operation: {
          type: 'template_generate',
          generationBatchId: 'batch-managed-frontier-fast-template-bounded',
          diagnosticStageTimings: true,
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['02-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            building_object_id: 'building-1',
            project_type_code: 'residential',
            structure_type_code: 'frame_shear',
          },
        },
      })
    } finally {
      errorSpy.mockRestore()
    }

    const baseTiming = diagnosticLogs.find((item) => item.stage === 'duration_suggestion_base_targets_built')
    expect(baseTiming).toEqual(expect.objectContaining({
      suggestionCount: expect.any(Number),
    }))
    expect(Number(baseTiming?.rollupCacheSize ?? 0)).toBeGreaterThan(0)
    expect(Number(baseTiming?.rollupCacheSize ?? Number.POSITIVE_INFINITY)).toBeLessThanOrEqual(16)

    const concreteStructure = generated!.rows.find((row) => row.values.standard_work_code === '02-01')
    expect(concreteStructure).toBeTruthy()
    expect(rowMetadata(concreteStructure!).deepDurationRollup).toEqual(expect.objectContaining({
      source: 'contextual_descendant_rollup',
      childCount: expect.any(Number),
      durationSeedStableCodes: expect.arrayContaining([expect.any(String)]),
      childProcessStableCodes: expect.arrayContaining([expect.any(String)]),
    }))
    expect(concreteStructure?.values.duration_suggestion).toEqual(expect.objectContaining({
      durationOutputCode: 'plan_reference',
      businessReasonCode: 'MANAGED_FRONTIER_DESCENDANT_ROLLUP',
      durationOutputPromotion: expect.objectContaining({
        fromOutputCode: 'contextual_reference',
        toOutputCode: 'plan_reference',
        promotionAllowed: true,
      }),
    }))
    expect(generated!.rows.find((row) => String(row.values.standard_work_code).startsWith('02-01-'))).toBeUndefined()
  }, 30_000)

  it('builds fast-template duration suggestions from scoped generation contexts instead of global cartesian targets', async () => {
    const diagnosticLogs: Array<Record<string, unknown>> = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
      if (typeof message !== 'string') return
      try {
        const parsed = JSON.parse(message)
        if (parsed.source === 'wbs_template_generation_stage_timing') {
          diagnosticLogs.push(parsed)
        }
      } catch {
        // Ignore unrelated console noise.
      }
    })

    let generated: Awaited<ReturnType<typeof generateWbsTemplateRows>>
    try {
      generated = await generateWbsTemplateRows({
        projectId: '00000000-0000-4000-8000-000000000001',
        surface: 'task_list',
        detailLevel: 'planning_skeleton' as never,
        diagnosticDurationSuggestionMode: 'fast_template',
        operation: {
          type: 'template_generate',
          generationBatchId: 'batch-managed-frontier-scoped-duration-targets',
          diagnosticStageTimings: true,
          templateIds: [
            CHINA_GB55032_TEMPLATE_ID,
            'china-electrical-system',
          ],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01-03'],
            'china-electrical-system': ['ELE-05-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            scopeExpansionMode: 'project',
            business_type: 'data_center',
            project_type_code: 'data_center',
            building_count: 2,
            structure_type_code: 'frame_core',
          },
        },
      })
    } finally {
      errorSpy.mockRestore()
    }

    const targetTiming = diagnosticLogs.find((item) => item.stage === 'duration_suggestion_targets_collected')
    const rowEstimate = diagnosticLogs.find((item) => item.stage === 'row_counts_estimated')
    expect(targetTiming).toEqual(expect.objectContaining({
      targetCount: expect.any(Number),
      scopeCount: expect.any(Number),
    }))
    expect(rowEstimate).toEqual(expect.objectContaining({
      generatedRowCount: expect.any(Number),
      generatedMainPlanRowCount: expect.any(Number),
    }))
    expect(targetTiming!.targetCount).toBeLessThanOrEqual(rowEstimate!.generatedRowCount as number)
    expect(targetTiming!.targetCount).toBeLessThanOrEqual(generated!.rows.length)
  }, 30_000)

  it('reuses fast-template duration seed resolution for identical nodes and feature profiles within one generation batch', async () => {
    const durationSeedSpy = vi.spyOn(algorithmSeedResolver, 'resolveStandardWorkDurationSeed')
    try {
      const generated = await generateWbsTemplateRows({
        projectId: '00000000-0000-4000-8000-000000000001',
        surface: 'task_list',
        detailLevel: 'planning_skeleton' as never,
        diagnosticDurationSuggestionMode: 'fast_template',
        operation: {
          type: 'template_generate',
          generationBatchId: 'batch-fast-template-duration-cache',
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            scopeExpansionMode: 'explicit_instances',
            buildings: ['building-1', 'building-2', 'building-3'],
            project_type_code: 'residential',
            structure_type_code: 'frame_shear',
            method_variant_codes: ['aluminum_formwork'],
          },
        },
      })

      expect(generated.scopeCombos).toHaveLength(3)
      expect(generated.rows.length).toBeGreaterThan(0)
      expect(durationSeedSpy).toHaveBeenCalled()

      const callsByNodeContext = new Map<string, number>()
      for (const [matchText, context] of durationSeedSpy.mock.calls) {
        const record = context as Record<string, unknown>
        const key = JSON.stringify({
          matchText,
          standardWorkCode: record.standardWorkCode ?? null,
          standardWorkCodes: record.standardWorkCodes ?? [],
          templateNodeId: record.templateNodeId ?? null,
          methodVariantCodes: record.methodVariantCodes ?? [],
          elementVariantCodes: record.elementVariantCodes ?? [],
          projectTypeCode: record.projectTypeCode ?? null,
          structureTypeCode: record.structureTypeCode ?? null,
          applicableGranularity: record.applicableGranularity ?? null,
          featureProfile: record.featureProfile ?? null,
        })
        callsByNodeContext.set(key, (callsByNodeContext.get(key) ?? 0) + 1)
      }

      expect(Math.max(...callsByNodeContext.values())).toBe(1)
    } finally {
      durationSeedSpy.mockRestore()
    }
  }, 30_000)

  it('rebuilds assigned scope object lineage without retaining sibling anchors from the generation combo', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      scopeAssignmentRules: [
        {
          itemPackPattern: 'OUT-',
          effect: 'assign_to_scope_object',
          targetObjectType: 'physical_zone',
          matchMetadata: { physicalSpaceKind: 'outdoor_site' },
          priority: 1,
        },
      ],
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-managed-frontier-assigned-scope-lineage',
        templateIds: ['china-gb55032-2022-outdoor'],
        selectedNodesByTemplate: {
          'china-gb55032-2022-outdoor': ['OUT-02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          business_type: 'renovation',
          project_type_code: 'renovation',
          scope_objects: [
            { id: 'basement-1', type: 'basement', name: '地下室', parentId: null, metadata: { basementLevelCount: 1 } },
            { id: 'outdoor-1', type: 'physical_zone', name: '室外总平', parentId: null, metadata: { physicalSpaceKind: 'outdoor_site' } },
          ],
        },
      },
    })

    const outdoorRows = generated.rows.filter((row) => String(row.values.standard_work_code ?? '').startsWith('OUT-'))
    expect(outdoorRows.length).toBeGreaterThan(0)
    for (const row of outdoorRows) {
      expect(row.values.physical_zone_object_id).toBe('outdoor-1')
      expect(row.values.basement_object_id).toBeNull()
      expect(row.values.building_object_id).toBeNull()
      expect(row.values.floor_object_id).toBeNull()
    }
  }, 30_000)

  it('exposes a schedule trust gate for specialty managed-frontier generation in full mode', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'full',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-managed-frontier-specialty-trust',
        templateIds: ['china-mep-coordination'],
        selectedNodesByTemplate: {
          'china-mep-coordination': ['MEP-01-01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'commercial',
        },
      },
    })

    const trustGate = (generated as any).scheduleTrustGate
    expect(trustGate).toEqual(expect.objectContaining({
      generationDepth: 'sub_division',
      status: 'trusted',
      trustedForScheduling: true,
      fallbackPolicyRowCount: 0,
      missingDescendantRollupRowCount: 0,
      rowsMissingReferenceDuration: 0,
    }))
    expect(trustGate.totalScheduleRows).toBeGreaterThan(0)
    expect(trustGate.durationBearingScheduleRows).toBeGreaterThan(0)
    expect(trustGate.descendantRollupAppliedRowCount).toBeGreaterThan(0)
    expect(trustGate.policyConfidenceCounts.high).toBeGreaterThan(0)
    expect(generated.governanceWarnings.some((warning) => warning.code === 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED')).toBe(false)
  }, 30_000)

  it('orders generated skeleton rows by construction time and execution phase, not catalog insertion only', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-managed-frontier-order',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['03', '01', '02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          building_object_id: 'building-1',
          project_type_code: 'residential',
        },
      },
    })

    const visibleCodes = generated.rows
      .filter((row) => row.rowProjectionMode === 'schedule_row')
      .map((row) => String(row.values.standard_work_code))
    const firstFoundation = visibleCodes.findIndex((code) => code.startsWith('01'))
    const firstStructure = visibleCodes.findIndex((code) => code.startsWith('02'))
    const firstFinishing = visibleCodes.findIndex((code) => code.startsWith('03'))
    expect(firstFoundation).toBeGreaterThanOrEqual(0)
    expect(firstStructure).toBeGreaterThan(firstFoundation)
    expect(firstFinishing).toBeGreaterThan(firstStructure)

    const undergroundHandoverEnd = generated.rows
      .filter((row) => String(row.values.standard_work_code).startsWith('01-07'))
      .map((row) => String(row.values.planned_end_date).slice(0, 10))
      .sort()
      .at(-1)
    const structureStart = generated.rows
      .filter((row) => String(row.values.standard_work_code).startsWith('02'))
      .map((row) => String(row.values.planned_start_date).slice(0, 10))
      .sort()[0]
    const structureEnd = generated.rows
      .filter((row) => String(row.values.standard_work_code).startsWith('02'))
      .map((row) => String(row.values.planned_end_date).slice(0, 10))
      .sort()
      .at(-1)
    const finishingStart = generated.rows
      .filter((row) => String(row.values.standard_work_code).startsWith('03'))
      .map((row) => String(row.values.planned_start_date).slice(0, 10))
      .sort()[0]
    expect(Date.parse(`${structureStart}T00:00:00Z`)).toBeGreaterThan(Date.parse(`${undergroundHandoverEnd}T00:00:00Z`))
    expect(Date.parse(`${finishingStart}T00:00:00Z`)).toBeGreaterThan(Date.parse(`${structureStart}T00:00:00Z`))
    expect(Date.parse(`${finishingStart}T00:00:00Z`)).toBeLessThanOrEqual(Date.parse(`${structureEnd}T00:00:00Z`))
    expect(generated.rows.some((row) => {
      const metadata = rowMetadata(row)
      return metadata.summaryNetworkSchedule != null
        || metadata.executionPhaseSchedule != null
    })).toBe(true)

    const rowTimes = generated.rows.map((row) => ({
      start: Date.parse(`${String(row.values.planned_start_date).slice(0, 10)}T00:00:00Z`),
      executionSortKey: Number(row.values.execution_sort_key ?? row.executionSortKey ?? 0),
    }))
    for (let index = 1; index < rowTimes.length; index += 1) {
      const prev = rowTimes[index - 1]
      const current = rowTimes[index]
      expect(
        current.start > prev.start
          || (current.start === prev.start && current.executionSortKey >= prev.executionSortKey),
      ).toBe(true)
    }
  }, 30_000)

  it('uses project-level construction organization instead of collapsing multi-building project scope into one generic chain', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-organization-residential',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['03', '01', '02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          total_area_m2: 98100,
          building_count: 3,
          standard_floor_count: 26,
          highest_building_floor_count: 33,
          basement_level_count: 2,
          buildingPatternCodes: ['multi_tower_shared_podium'],
        },
      },
    })

    const summaryRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const organizationRows = summaryRows.filter((row) => {
      const organization = rowMetadata(row).projectOrganization as Record<string, unknown> | undefined
      return organization?.source === 'project_execution_organization_policy'
    })
    expect(organizationRows.length).toBeGreaterThan(0)

    const productionLaneRows = organizationRows.filter((row) => String((rowMetadata(row).projectOrganization as Record<string, unknown>).organizationLaneRole) !== 'shared_works')
    expect(new Set(productionLaneRows.map((row) => String((rowMetadata(row).projectOrganization as Record<string, unknown>).organizationLane))).size).toBe(3)

    const sharedWorkRows = organizationRows.filter((row) => (rowMetadata(row).projectOrganization as Record<string, unknown>).organizationLane === 'shared_works')
    expect(sharedWorkRows.length).toBeGreaterThan(0)

    const networkRows = organizationRows.filter((row) => {
      const schedule = rowMetadata(row).summaryNetworkSchedule as Record<string, unknown> | undefined
      return schedule?.basis === 'project_execution_organization_policy'
    })
    expect(networkRows.length).toBeGreaterThan(0)
    expect(networkRows.some((row) => {
      const schedule = rowMetadata(row).summaryNetworkSchedule as Record<string, unknown>
      return schedule.policy === 'project_organization_lane_network'
        && schedule.trustBasis === 'business_type_building_pattern_shared_work_interface_gate'
    })).toBe(true)
  }, 30_000)

  it('covers all supported business types with governed project construction organization policies', () => {
    const policies = listProjectConstructionOrganizationPolicies()
    expect(policies.length).toBeGreaterThanOrEqual(11)

    for (const businessType of PROJECT_ORGANIZATION_BUSINESS_TYPES) {
      const policy = resolveProjectConstructionOrganizationPolicy(businessType, businessType)
      expect(policy).toEqual(expect.objectContaining({
        source: 'project_construction_organization_policy_seed',
        strategy: expect.any(String),
        lanePrefix: expect.any(String),
        networkPolicy: expect.objectContaining({
          interfaceGatePolicy: 'business_type_governed_gate_network',
        }),
        governance: expect.objectContaining({
          assetType: 'project_construction_organization_policy',
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        }),
      }))
      expect(policy.businessTypeCodes).toContain(businessType)
    }
  })

  it('keeps project organization driven by project objects and business strategy, with resources only as sidecar feasibility signals', async () => {
    async function buildLaneSignature(towerCraneCount: number, constructionHoistCount: number) {
      const generated = await generateWbsTemplateRows({
        projectId: '00000000-0000-4000-8000-000000000001',
        surface: 'task_list',
        detailLevel: 'planning_skeleton' as never,
        diagnosticDurationSuggestionMode: 'fast_template',
        operation: {
          type: 'template_generate',
          generationBatchId: `batch-project-organization-resource-sidecar-${towerCraneCount}`,
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['02'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            scopeExpansionMode: 'project',
            business_type: 'general_civil',
            project_type_code: 'residential',
            structure_type_code: 'frame_shear',
            total_area_m2: 98100,
            building_count: 3,
            standard_floor_count: 26,
            basement_level_count: 2,
            towerCraneCount,
            constructionHoistCount,
            buildingPatternCodes: ['multi_tower_shared_podium'],
          },
        },
      })

      const organizationRows = generated.rows.filter((row) => {
        const organization = rowMetadata(row).projectOrganization as Record<string, unknown> | undefined
        return organization?.source === 'project_execution_organization_policy'
      })
      const lanes = [...new Set(organizationRows.map((row) => String((rowMetadata(row).projectOrganization as Record<string, unknown>).organizationLane)))].sort()
      const firstOrganization = rowMetadata(organizationRows[0]).projectOrganization as Record<string, unknown>
      return {
        lanes,
        laneRoles: [...new Set(organizationRows.map((row) => String((rowMetadata(row).projectOrganization as Record<string, unknown>).organizationLaneRole)))].sort(),
        strategy: firstOrganization.strategy,
        resourcePolicy: firstOrganization.resourcePolicy,
        networkPolicy: firstOrganization.networkPolicy,
      }
    }

    const oneCrane = await buildLaneSignature(1, 1)
    const threeCranes = await buildLaneSignature(3, 3)

    expect(oneCrane.lanes).toEqual(threeCranes.lanes)
    expect(oneCrane.laneRoles).toEqual(threeCranes.laneRoles)
    expect(oneCrane.strategy).toBe('shared_basement_podium_then_multi_tower_lane_network')
    expect(threeCranes.strategy).toBe('shared_basement_podium_then_multi_tower_lane_network')
    expect(oneCrane.resourcePolicy).toBe('resources_are_sidecar_feasibility_signals_not_primary_schedule_driver')
    expect(threeCranes.resourcePolicy).toBe('resources_are_sidecar_feasibility_signals_not_primary_schedule_driver')
    expect(oneCrane.networkPolicy).toEqual(threeCranes.networkPolicy)
  }, 60_000)

  it('does not let basement or shared-podium labels override the business organization policy strategy', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-organization-hotel-basement-label',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'hotel',
          project_type_code: 'hotel',
          structure_type_code: 'frame_shear',
          total_area_m2: 68000,
          building_count: 3,
          standard_floor_count: 22,
          basement_level_count: 2,
          basement_area_m2: 18000,
          buildingPatternCodes: ['multi_tower_shared_podium'],
        },
      },
    })

    const organizationRows = generated.rows.filter((row) => {
      const organization = rowMetadata(row).projectOrganization as Record<string, unknown> | undefined
      return organization?.source === 'project_execution_organization_policy'
    })
    const firstOrganization = rowMetadata(organizationRows[0]).projectOrganization as Record<string, unknown>

    expect(firstOrganization.policyId).toBe('project-organization-hotel-tower-fitout-v1')
    expect(firstOrganization.strategy).toBe('hotel_guestroom_tower_public_area_fitout_gate_network')
    expect(firstOrganization.strategy).not.toBe('shared_basement_podium_then_multi_tower_lane_network')
  }, 60_000)

  it('keeps all 11 supported business types wired through wizard generation to reviewable construction organization network evidence', async () => {
    expect(PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES.map((probe) => probe.businessType).sort()).toEqual(
      [...PROJECT_ORGANIZATION_BUSINESS_TYPES].sort(),
    )

    for (const probe of PROJECT_ORGANIZATION_REAL_WBS_PROBE_CASES) {
      const generated = await generateWbsTemplateRows({
        projectId: '00000000-0000-4000-8000-000000000001',
        surface: 'task_list',
        detailLevel: 'planning_skeleton' as never,
        diagnosticDurationSuggestionMode: 'fast_template',
        operation: {
          type: 'template_generate',
          generationBatchId: `batch-project-organization-real-wbs-${probe.businessType}`,
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01', '02'],
          },
          plannedStartDate: '2026-06-01',
          scope: {
            scopeExpansionMode: 'project',
            business_type: probe.businessType,
            project_type_code: probe.projectTypeCode,
            structure_type_code: probe.structureTypeCode,
            total_area_m2: probe.businessType === 'renovation' ? 18000 : 120000,
            aboveGroundAreaM2: probe.businessType === 'renovation' ? 15000 : 90000,
            building_count: probe.businessType === 'renovation' ? 1 : 3,
            standard_floor_count: probe.businessType === 'renovation' ? 5 : 24,
            basement_level_count: probe.businessType === 'renovation' ? 0 : 2,
            basement_area_m2: probe.businessType === 'renovation' ? 0 : 26000,
            foundation_depth_m: probe.businessType === 'renovation' ? 0 : 5,
            prefabRate: probe.businessType === 'modular_building' ? 0.55 : 0.12,
            methodVariantCodes: probe.methodVariantCodes,
            buildingPatternCodes: probe.buildingPatternCodes,
            functionalUsageCodes: probe.functionalUsageCodes,
            functionalCategoryCodes: probe.functionalCategoryCodes,
            specialRoomTypeCodes: probe.specialRoomTypeCodes,
            physicalZoneTypeCodes: probe.physicalZoneTypeCodes,
            hardConstraintCodes: probe.hardConstraintCodes,
            planScopeCaliber: 'full_project',
            deliveryStandard: 'completion_acceptance',
            terminalEvent: 'joint_acceptance',
            towerCraneCount: 2,
            constructionHoistCount: 3,
            scope_objects: probe.businessType === 'renovation'
              ? [
                  { id: 'renovation-zone-a', type: 'physical_zone', name: '改造一区', parentId: null, metadata: { physicalSpaceKind: 'renovation_zone' } },
                  { id: 'outdoor-site', type: 'physical_zone', name: '室外总平', parentId: null, metadata: { physicalSpaceKind: 'outdoor_site' } },
                ]
              : [
                  { id: 'building-a', type: 'building', name: 'A栋', parentId: null, metadata: { standardFloorCount: 24, functionalUsage: probe.businessType } },
                  { id: 'building-b', type: 'building', name: 'B栋', parentId: null, metadata: { standardFloorCount: 24, functionalUsage: probe.businessType } },
                  { id: 'building-c', type: 'building', name: 'C栋', parentId: null, metadata: { standardFloorCount: 22, functionalUsage: probe.businessType } },
                  {
                    id: 'basement-common',
                    type: 'basement',
                    name: '整体地下室',
                    parentId: null,
                    metadata: {
                      basementLevelCount: 2,
                      basementKind: 'common_basement',
                      serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
                    },
                  },
                  {
                    id: 'outdoor-site',
                    type: 'physical_zone',
                    name: '室外总平',
                    parentId: null,
                    metadata: {
                      physicalSpaceKind: 'outdoor_site',
                      serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
                    },
                  },
                ],
          },
        },
      })

      const organizationRows = generated.rows.filter((row) => {
        const organization = rowMetadata(row).projectOrganization as Record<string, unknown> | undefined
        return organization?.source === 'project_execution_organization_policy'
      })
      expect(organizationRows.length, probe.businessType).toBeGreaterThan(0)

      const scenarioSelection = (rowMetadata(organizationRows[0]).projectOrganization as Record<string, any>).scenarioSelection
      expect(scenarioSelection?.source, probe.businessType).toBe('construction_organization_scenario_selector')
      expect(scenarioSelection.factBasis.projectOrganizationPolicy, probe.businessType).toEqual(expect.objectContaining({
        source: 'project_construction_organization_policy_seed',
        policyId: expect.any(String),
      }))
      expect(scenarioSelection.recommendedPlanOption.evaluation.generatedRowProjection.generatedRowMatchCount, probe.businessType).toBeGreaterThan(0)
      expect(scenarioSelection.recommendedPlanOption.evaluation.generatedRowProjection.candidateDependencyPreview.previewEdges.length, probe.businessType).toBeGreaterThan(0)
      expect(scenarioSelection.planNetworkDraftRecommendations.newProjectPlanning, probe.businessType).toEqual(expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'new_project_planning',
        evaluationStatus: 'evaluation_ready',
        e3: expect.objectContaining({
          previewEdgeCount: expect.any(Number),
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
        e5: expect.objectContaining({
          writesAccelerationDraft: false,
        }),
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        }),
      }))
      expect(scenarioSelection.planNetworkDraftRecommendations.newProjectPlanning.e3.previewEdgeCount, probe.businessType).toBeGreaterThan(0)
      expect(scenarioSelection.planNetworkDraftRecommendations.startingLineOnboarding, probe.businessType).toEqual(expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'starting_line_onboarding',
        e3: expect.objectContaining({
          previewEdgeCount: expect.any(Number),
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
        e5: expect.objectContaining({
          writesAccelerationDraft: false,
        }),
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        }),
      }))
      expect(scenarioSelection.planNetworkDraftRecommendations.startingLineOnboarding.e3.previewEdgeCount, probe.businessType).toBeGreaterThan(0)
      expect(scenarioSelection.planNetworkDraftRecommendations.accelerationRecovery, probe.businessType).toEqual(expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'acceleration_recovery',
        e3: expect.objectContaining({
          previewEdgeCount: expect.any(Number),
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
        e5: expect.objectContaining({
          e5RecoverableSpanDays: expect.any(Number),
          writesAccelerationDraft: false,
        }),
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesSeed: false,
          writesBaseline: false,
          writesCriticalPathFacts: false,
          writesAccelerationDraft: false,
        }),
      }))
      expect(scenarioSelection.planNetworkDraftRecommendations.accelerationRecovery.e3.previewEdgeCount, probe.businessType).toBeGreaterThan(0)
    }
  }, 240_000)

  it('attaches construction organization scenario selection to generated project-scope rows', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-organization-scenario-selection',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01', '02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          total_area_m2: 98100,
          building_count: 3,
          standard_floor_count: 26,
          basement_level_count: 2,
          basement_area_m2: 26000,
          foundation_depth_m: 5,
          prefabRate: 0.32,
          maxSpanM: 21,
          supportHeightM: 9,
          hasCivilDefense: true,
          methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
          prefabSystemCodes: ['pc_facade'],
          elementVariantCodes: ['pcf_facade'],
          externalInterfaceCodes: ['metro_operation_interface'],
          hardConstraintCodes: ['non_stop_operation'],
          projectFeatures: {
            metro_interface: true,
            non_stop_operation: true,
          },
          climateSignals: ['rainy_season'],
          weatherImpactBands: ['earthwork_rain_sensitive'],
          buildingPatternCodes: ['multi_tower_shared_podium'],
          planScopeCaliber: 'general_contract',
          deliveryStandard: 'full_fitout',
          terminalEvent: 'owner_handover',
          onboardingMode: 'starting_line',
          onboardingSubstage: 'main_structure',
          onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance', 'basement_structure_acceptance'],
          onboardingPhaseProgress: {
            'building-a': { currentFloor: 'L12', progress: 42 },
          },
          locationFacts: {
            provinceCode: 'zhejiang',
            climateSignals: ['plum_rain'],
            weatherImpactBands: ['earthwork_rain_sensitive'],
          },
          towerCraneCount: 1,
          constructionHoistCount: 1,
          scope_objects: [
            { id: 'building-a', type: 'building', name: '1#楼', parentId: null, metadata: { standardFloorCount: 26, functionalUsage: 'residential' } },
            { id: 'building-b', type: 'building', name: '2#楼', parentId: null, metadata: { standardFloorCount: 26, functionalUsage: 'residential' } },
            { id: 'building-c', type: 'building', name: '3#楼', parentId: null, metadata: { standardFloorCount: 24, functionalUsage: 'residential' } },
            {
              id: 'basement-common',
              type: 'basement',
              name: '整体地下室',
              parentId: null,
              metadata: {
                basementLevelCount: 2,
                basementKind: 'common_basement',
                serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
              },
            },
            {
              id: 'shared-podium',
              type: 'physical_zone',
              name: '共享裙房',
              parentId: null,
              metadata: {
                physicalSpaceKind: 'shared_podium',
                structuralRole: 'podium',
                sharedScopeCandidate: true,
                serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
              },
            },
            {
              id: 'outdoor-site',
              type: 'physical_zone',
              name: '室外总平',
              parentId: null,
              metadata: {
                physicalSpaceKind: 'outdoor_site',
                physicalCategory: 'outdoor_site_plan',
                serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
              },
            },
          ],
        },
      },
    })

    const organizationRows = generated.rows.filter((row) => {
      const organization = rowMetadata(row).projectOrganization as Record<string, unknown> | undefined
      return organization?.source === 'project_execution_organization_policy'
    })
    expect(organizationRows.length).toBeGreaterThan(0)

    const projectOrganization = rowMetadata(organizationRows[0]).projectOrganization as Record<string, any>
    expect(projectOrganization.inputBasis).toEqual(expect.objectContaining({
      externalInterfaceCodes: ['metro_operation_interface'],
      hardConstraintCodes: ['non_stop_operation'],
      projectFeatures: expect.objectContaining({
        metro_interface: true,
        non_stop_operation: true,
      }),
      foundationDepthM: 5,
      prefabRate: 0.32,
      maxSpanM: 21,
      supportHeightM: 9,
      hasCivilDefense: true,
      elementVariantCodes: ['pcf_facade'],
      climateSignals: expect.arrayContaining(['rainy_season', 'plum_rain']),
      weatherImpactBands: expect.arrayContaining(['earthwork_rain_sensitive']),
      towerCraneCount: 1,
      constructionHoistCount: 1,
    }))
    const scenarioSelection = projectOrganization.scenarioSelection
    expect(scenarioSelection).toEqual(expect.objectContaining({
      source: 'construction_organization_scenario_selector',
      frontendInputRequired: false,
      recommendedScenarioIds: expect.arrayContaining([
        'pile_before_excavation',
        'tower_lane_early_release_after_core_basement',
        'outdoor_site_early_release_after_basement_backfill',
      ]),
      boundaryPolicy: expect.objectContaining({
        directSeedMutation: false,
        resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
      }),
    }))
    expect(scenarioSelection.factBasis).toEqual(expect.objectContaining({
      planScopeCaliber: 'general_contract',
      deliveryStandard: 'full_fitout',
      terminalEvent: 'owner_handover',
      prefabSystemCodes: ['pc_facade'],
      externalInterfaceCodes: ['metro_operation_interface'],
      hardConstraintCodes: ['non_stop_operation'],
      projectFeatures: expect.objectContaining({
        metro_interface: true,
        non_stop_operation: true,
      }),
      onboardingMode: 'starting_line',
      onboardingSubstage: 'main_structure',
      onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance', 'basement_structure_acceptance'],
      onboardingPhaseProgress: {
        'building-a': { currentFloor: 'L12', progress: 42 },
      },
      locationFacts: expect.objectContaining({
        provinceCode: 'zhejiang',
      }),
      scopeOrganizationFacts: expect.objectContaining({
        source: 'wizard_scope_objects',
        scopeObjectCount: 6,
        buildingObjectCount: 3,
        sharedBasementObjectCount: 1,
        sharedPodiumObjectCount: 1,
        outdoorSiteObjectCount: 1,
        sharedBasementServiceTargetCount: 3,
        organizationSignals: expect.arrayContaining([
          'multi_building_scope_objects',
          'shared_basement_service_range',
          'shared_podium_service_range',
          'outdoor_site_scope_present',
        ]),
      }),
    }))
    expect(scenarioSelection.recommendedPlanOption).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_option',
      selectedScenarioIds: expect.arrayContaining([
        'pile_before_excavation',
        'tower_lane_early_release_after_core_basement',
        'outdoor_site_early_release_after_basement_backfill',
      ]),
      evaluation: expect.objectContaining({
        evaluationRole: 'combined_plan_option_score_for_e1_e3_e5',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      combinedVirtualNetwork: expect.objectContaining({
        source: 'construction_organization_virtual_network',
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
    }))
    expect(scenarioSelection.candidates.map((candidate: any) => candidate.category)).toEqual(expect.arrayContaining([
      'foundation_sequence',
      'basement_tower_release',
      'outdoor_site_release',
    ]))
    expect(scenarioSelection.recommendedPlanOption.combinedVirtualNetwork.nodes.map((node: any) => node.phase)).toEqual(expect.arrayContaining([
      'foundation',
      'tower',
      'outdoor',
    ]))
    expect(scenarioSelection.recommendedPlanOption.combinedVirtualNetwork.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        intent: 'selected_basement_tower_release_before_selected_outdoor_site_release',
      }),
    ]))
    expect(scenarioSelection.recommendedPlanOption.evaluation.useCaseEvaluations).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({
        useCase: 'new_project_planning',
        actionability: 'actionable_candidate',
        factCoverage: expect.objectContaining({
          source: 'wizard_project_generation_fact_coverage',
          consumedFactKeys: expect.arrayContaining([
            'planScopeCaliber',
            'deliveryStandard',
            'terminalEvent',
            'scopeOrganizationFacts',
            'methodVariantCodes',
            'prefabSystemCodes',
            'externalInterfaceCodes',
            'hardConstraintCodes',
            'projectFeatures',
            'buildingPatternCodes',
            'buildingCount',
            'basementLevelCount',
            'foundationDepthM',
            'climateSignals',
            'weatherImpactBands',
            'locationFacts',
          ]),
          sidecarFactKeys: expect.arrayContaining(['towerCraneCount', 'constructionHoistCount']),
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        }),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      startingLineOnboarding: expect.objectContaining({
        useCase: 'starting_line_onboarding',
        actionability: 'not_actionable_after_current_phase',
        currentSubstage: 'main_structure',
        rankBasis: expect.arrayContaining([
          'starting_line_current_phase_past_foundation_or_basement',
          'starting_line_passed_milestones_present',
          'starting_line_phase_progress_present',
        ]),
      }),
      accelerationRecovery: expect.objectContaining({
        useCase: 'acceleration_recovery',
        rankBasis: expect.arrayContaining(['e5_recoverable_span_priority']),
        e5RecoverableSpanDays: expect.any(Number),
        recoveryFactorHint: expect.any(Number),
      }),
    }))
    expect(scenarioSelection.planOptions.length).toBeGreaterThanOrEqual(2)
    expect(scenarioSelection.planOptions[0]).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_option',
      selectedScenarioIds: expect.any(Array),
      combinedVirtualNetwork: expect.objectContaining({
        source: 'construction_organization_virtual_network',
        writesTaskDependencies: false,
        writesPlanDates: false,
      }),
      evaluation: expect.objectContaining({
        generatedRowProjection: expect.objectContaining({
          source: 'construction_organization_plan_option_generated_row_projection',
          optionId: expect.any(String),
          projectionBasis: 'generated_wbs_rows_mapped_to_virtual_plan_option_nodes',
          generatedScheduleSpanDays: expect.any(Number),
          virtualProjectDurationDays: expect.any(Number),
          spanDeltaDays: expect.any(Number),
          projectionConfidence: expect.stringMatching(/^(high|medium|low)$/),
          mappedNodeCount: expect.any(Number),
          generatedRowMatchCount: expect.any(Number),
          unmappedNodeIds: expect.any(Array),
          phaseCoverage: expect.any(Array),
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
      }),
    }))
    expect(scenarioSelection.recommendedPlanOption.evaluation.generatedRowProjection.generatedRowMatchCount).toBeGreaterThan(0)
    const recommendedProjection = scenarioSelection.recommendedPlanOption.evaluation.generatedRowProjection
    expect(recommendedProjection).toEqual(expect.objectContaining({
      candidateDependencyPreview: expect.objectContaining({
        source: 'construction_organization_candidate_dependency_preview',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
        materializationReadiness: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
      }),
      materializationDecision: expect.objectContaining({
        source: 'construction_organization_candidate_materialization_decision',
        allowManualMaterialization: expect.any(Boolean),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
      materializationReviewPackage: expect.objectContaining({
        source: 'construction_organization_candidate_materialization_review_package',
        reviewRequired: true,
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
      generatedRowReferenceDurationEvidence: expect.objectContaining({
        source: 'generated_wbs_row_reference_duration_projection',
        writesReferenceDuration: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      generatedRowNetworkEvaluation: expect.objectContaining({
        source: 'generated_wbs_row_candidate_network_cpm',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesCriticalPathFacts: false,
      }),
    }))
    expect(recommendedProjection.candidateDependencyPreview.previewEdges.length).toBeGreaterThan(0)
    expect(recommendedProjection.generatedRowNetworkEvaluation.previewEdgeCount).toBeGreaterThan(0)
    expect(scenarioSelection.planNetworkDraftRecommendations).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'new_project_planning',
        evaluationStatus: 'evaluation_ready',
        proposedDependencyEdgeCount: expect.any(Number),
        mutationBoundary: expect.objectContaining({
          writesTaskDependencies: false,
          writesPlanDates: false,
          writesCriticalPathFacts: false,
        }),
        e1: expect.objectContaining({ writesReferenceDuration: false }),
        e3: expect.objectContaining({
          writesTaskDependencies: false,
          writesCriticalPathFacts: false,
        }),
        e5: expect.objectContaining({ writesAccelerationDraft: false }),
      }),
      startingLineOnboarding: expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'starting_line_onboarding',
      }),
      accelerationRecovery: expect.objectContaining({
        source: 'construction_organization_plan_network_draft_recommendation',
        useCase: 'acceleration_recovery',
        e5: expect.objectContaining({
          e5RecoverableSpanDays: expect.any(Number),
          writesAccelerationDraft: false,
        }),
      }),
    }))
    expect(scenarioSelection.planNetworkDraftRecommendations.newProjectPlanning.e3.previewEdgeCount).toBeGreaterThan(0)
    expect(scenarioSelection.scenarioRecommendations).toEqual(expect.objectContaining({
      newProjectPlanning: expect.objectContaining({
        useCase: 'new_project_planning',
        optionId: expect.any(String),
        actionability: 'actionable_candidate',
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      startingLineOnboarding: expect.objectContaining({
        useCase: 'starting_line_onboarding',
        optionId: expect.any(String),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
      accelerationRecovery: expect.objectContaining({
        useCase: 'acceleration_recovery',
        optionId: expect.any(String),
        recommendationBasis: expect.arrayContaining(['e5_recoverable_span_priority']),
        writesTaskDependencies: false,
        writesPlanDates: false,
        writesSeed: false,
      }),
    }))
    expect(scenarioSelection.candidates.map((candidate: Record<string, unknown>) => candidate.scenarioId)).toEqual(expect.arrayContaining([
      'excavation_before_pile',
      'tower_lane_early_release_after_core_basement',
    ]))
    expect(scenarioSelection.candidates[0]).toEqual(expect.objectContaining({
      evaluation: expect.objectContaining({
        evaluationRole: 'candidate_network_score_for_e1_e3_e5',
      }),
      virtualNetwork: expect.objectContaining({
        source: 'construction_organization_virtual_network',
        writesTaskDependencies: false,
        writesPlanDates: false,
        totalSpanDays: expect.any(Number),
        criticalNodeIds: expect.any(Array),
      }),
    }))
  }, 60_000)

  it('aligns generated project-scope dates with the recommended construction organization network for core sequencing', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-organization-core-sequencing',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01', '02'],
        },
        plannedStartDate: '2026-07-01',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          total_area_m2: 98100,
          aboveGroundAreaM2: 72000,
          building_count: 3,
          standard_floor_count: 26,
          basement_level_count: 2,
          basement_area_m2: 26000,
          foundation_depth_m: 5,
          methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
          buildingPatternCodes: ['multi_tower_shared_podium'],
          planScopeCaliber: 'full_project',
          deliveryStandard: 'completion_acceptance',
          terminalEvent: 'joint_acceptance',
          towerCraneCount: 2,
          constructionHoistCount: 3,
          scope_objects: [
            { id: 'building-a', type: 'building', name: 'A栋', parentId: null, metadata: { standardFloorCount: 26 } },
            { id: 'building-b', type: 'building', name: 'B栋', parentId: null, metadata: { standardFloorCount: 26 } },
            { id: 'building-c', type: 'building', name: 'C栋', parentId: null, metadata: { standardFloorCount: 24 } },
            { id: 'basement-common', type: 'basement', name: '整体地下室', parentId: null, metadata: { basementLevelCount: 2, serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'] } },
          ],
        },
      },
    })

    const scenarioSelection = generated.rows
      .map((row) => rowMetadata(row).projectOrganization as Record<string, any> | undefined)
      .map((organization) => organization?.scenarioSelection as Record<string, any> | undefined)
      .find((selection) => selection?.source === 'construction_organization_scenario_selector')
    const projection = scenarioSelection?.recommendedPlanOption?.evaluation?.generatedRowProjection

    expect(projection).toEqual(expect.objectContaining({
      source: 'construction_organization_plan_option_generated_row_projection',
    }))
    const violationIntents = (projection.candidateMaterializationEvaluation?.violationDetails ?? [])
      .map((violation: Record<string, unknown>) => violation.intent)
    expect(violationIntents).not.toContain('pile_before_earthwork_bulk_excavation')
    expect(violationIntents).not.toContain('core_basement_release_before_tower_lane_start')
  }, 120_000)

  it('keeps construction organization wired through plan-reference generation into E5 compression preview', async () => {
    const baseScope = {
      scopeExpansionMode: 'project',
      business_type: 'general_civil',
      project_type_code: 'residential',
      structure_type_code: 'frame_shear',
      total_area_m2: 98100,
      aboveGroundAreaM2: 72000,
      building_count: 3,
      standard_floor_count: 26,
      basement_level_count: 2,
      basement_area_m2: 26000,
      foundation_depth_m: 5,
      methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
      buildingPatternCodes: ['multi_tower_shared_podium'],
      planScopeCaliber: 'full_project',
      deliveryStandard: 'completion_acceptance',
      terminalEvent: 'joint_acceptance',
      towerCraneCount: 2,
      constructionHoistCount: 3,
      scope_objects: [
        { id: 'building-a', type: 'building', name: 'A栋', parentId: null, metadata: { standardFloorCount: 26 } },
        { id: 'building-b', type: 'building', name: 'B栋', parentId: null, metadata: { standardFloorCount: 26 } },
        { id: 'building-c', type: 'building', name: 'C栋', parentId: null, metadata: { standardFloorCount: 24 } },
        { id: 'basement-common', type: 'basement', name: '整体地下室', parentId: null, metadata: { basementLevelCount: 2, serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'] } },
        { id: 'outdoor-site', type: 'physical_zone', name: '室外总平', parentId: null, metadata: { physicalSpaceKind: 'outdoor_site' } },
      ],
    }
    const scenarios = [
      {
        mode: 'new',
        batchId: 'batch-construction-org-product-goal-new',
        scope: baseScope,
        duplicatePolicy: undefined,
      },
      {
        mode: 'starting_line',
        batchId: 'batch-construction-org-product-goal-starting-line',
        scope: {
          ...baseScope,
          onboardingMode: 'starting_line',
          onboardingSubstage: 'main_structure',
          onboardingPassedMilestones: ['pile_foundation_acceptance', 'foundation_acceptance', 'basement_structure_acceptance'],
          onboardingPhaseProgress: {
            'building-a': { currentFloor: 'L12', progress: 42 },
          },
        },
        duplicatePolicy: 'preserve_historical_skip_future' as const,
      },
    ]

    for (const scenario of scenarios) {
      const generated = await generateWbsTemplateRows({
        projectId: scenario.mode === 'new'
          ? '00000000-0000-4000-8000-000000000101'
          : '00000000-0000-4000-8000-000000000103',
        surface: 'task_list',
        detailLevel: 'planning_skeleton' as never,
        diagnosticDurationSuggestionMode: 'benchmark_plan_reference',
        duplicatePolicy: scenario.duplicatePolicy,
        onboardingSubstage: scenario.mode === 'starting_line' ? 'main_structure' : null,
        operation: {
          type: 'template_generate',
          generationBatchId: scenario.batchId,
          constructionCalendar: {
            basis: 'official_construction_calendar_seed',
            windows: [],
            calendarRef: 'work_calendar',
            calendarVersion: 'calendar-v1',
            timezone: 'Asia/Shanghai',
            availability: 'available',
            unavailableReason: null,
          },
          templateIds: [CHINA_GB55032_TEMPLATE_ID],
          selectedNodesByTemplate: {
            [CHINA_GB55032_TEMPLATE_ID]: ['01', '02'],
          },
          plannedStartDate: '2026-07-01',
          clientContext: {
            projectPlannedEndDate: '2026-07-15',
            targetConstraintMode: 'compression_preview',
          },
          scope: scenario.scope,
        },
      })

      const scenarioSelection = readConstructionOrganizationScenario(generated.rows)
      const proposal = generated.targetFeasibility?.accelerationProposal
      const calculationBasis = proposal?.calculationBasis as Record<string, any> | undefined
      const consumedScenario = calculationBasis?.constructionOrganizationScenario as Record<string, any> | undefined

      expect(scenarioSelection, scenario.mode).toEqual(expect.objectContaining({
        source: 'construction_organization_scenario_selector',
        boundaryPolicy: expect.objectContaining({
          resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        }),
      }))
      expect(scenarioSelection?.scenarioRecommendations, scenario.mode).toEqual(expect.objectContaining({
        newProjectPlanning: expect.objectContaining({ useCase: 'new_project_planning' }),
        startingLineOnboarding: expect.objectContaining({ useCase: 'starting_line_onboarding' }),
        accelerationRecovery: expect.objectContaining({ useCase: 'acceleration_recovery' }),
      }))
      expect(generated.targetFeasibility, scenario.mode).toEqual(expect.objectContaining({
        scenario: 'baseline_target_alignment',
        verdict: expect.stringMatching(/^(tight|unrecoverable)$/),
        recoverable: expect.objectContaining({
          unit: 'construction_production_day',
          calendarRef: 'work_calendar',
          calendarVersion: 'calendar-v1',
          availability: 'available',
        }),
      }))
      expect(proposal, scenario.mode).toBeTruthy()
      expect(consumedScenario, scenario.mode).toEqual(expect.objectContaining({
        source: 'construction_organization_scenario_selector',
        recommendedScenarioIds: expect.arrayContaining(scenarioSelection?.recommendedScenarioIds ?? []),
        resourcePolicy: 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver',
        planOptionComparisonPackage: expect.objectContaining({
          source: 'construction_organization_plan_option_comparison_package',
          totalOptionCount: expect.any(Number),
          recommendedOptionIdsByUseCase: expect.objectContaining({
            newProjectPlanning: scenarioSelection?.scenarioRecommendations?.newProjectPlanning?.optionId,
            startingLineOnboarding: scenarioSelection?.scenarioRecommendations?.startingLineOnboarding?.optionId,
            accelerationRecovery: scenarioSelection?.scenarioRecommendations?.accelerationRecovery?.optionId,
          }),
          canAutoMaterializeSelectedOption: false,
          options: expect.arrayContaining([
            expect.objectContaining({
              optionId: scenarioSelection?.scenarioRecommendations?.accelerationRecovery?.optionId,
              e5: expect.objectContaining({
                writesAccelerationDraft: false,
              }),
              boundaryPolicy: expect.objectContaining({
                writesTaskDependencies: false,
                writesPlanDates: false,
                writesAccelerationDraft: false,
              }),
            }),
          ]),
        }),
        planNetworkDraftRecommendations: expect.objectContaining({
          newProjectPlanning: expect.objectContaining({
            source: 'construction_organization_plan_network_draft_recommendation',
            useCase: 'new_project_planning',
          }),
          startingLineOnboarding: expect.objectContaining({
            source: 'construction_organization_plan_network_draft_recommendation',
            useCase: 'starting_line_onboarding',
          }),
          accelerationRecovery: expect.objectContaining({
            source: 'construction_organization_plan_network_draft_recommendation',
            useCase: 'acceleration_recovery',
            e5: expect.objectContaining({
              writesAccelerationDraft: false,
            }),
          }),
        }),
      }))
      expect(calculationBasis?.constructionOrganizationRecoveryFactor, scenario.mode).toBeGreaterThanOrEqual(1)
    }
  }, 180_000)

  it('applies fine-grained cross-item workflow under project scope by organization-compatible fallback, not empty scope fields', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-scope-cross-item-workflow',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01-05', '01-02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          building_count: 3,
          standard_floor_count: 26,
          basement_level_count: 2,
          buildingPatternCodes: ['multi_tower_shared_podium'],
        },
      },
    })

    const workflowRows = generated.rows.filter((row) => (
      row.rowProjectionMode === 'schedule_row'
      && hasDependencyIntent(row, 'cross-item:')
    ))
    expect(workflowRows.length).toBeGreaterThan(0)
    expect(workflowRows.some((row) => {
      const workflow = (rowMetadata(row).crossItemWorkflow as Array<Record<string, unknown>> | undefined) ?? []
      return workflow.some((item) => item.organizationScopeFallback === true)
    })).toBe(true)

    const excavation = generated.rows.find((row) => String(row.values.standard_work_code).startsWith('01-05'))
    const structure = generated.rows.find((row) => String(row.values.standard_work_code).startsWith('01-02'))
    expect(excavation).toBeTruthy()
    expect(structure).toBeTruthy()
    expect(dateMs(structure!.values.planned_start_date)).toBeGreaterThanOrEqual(dateMs(excavation!.values.planned_start_date))
  }, 30_000)

  it('derives construction organization facts from top-level scope object relationship fields', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-organization-top-level-scope-fields',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01', '02'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          building_count: 3,
          basement_level_count: 2,
          foundation_depth_m: 5,
          methodVariantCodes: ['pile_foundation', 'vertical_retaining_support'],
          buildingPatternCodes: ['multi_tower_shared_podium'],
          scope_objects: [
            { id: 'building-a', type: 'building', name: '1#', servedByScopeObjectIds: ['basement-common'], metadata: { functionalUsage: 'residential' } },
            { id: 'building-b', type: 'building', name: '2#', served_by_scope_object_ids: ['basement-common'], metadata: { functionalUsage: 'residential' } },
            { id: 'building-c', type: 'building', name: '3#', servedByScopeObjectIds: ['basement-common'], metadata: { functionalUsage: 'residential' } },
            {
              id: 'basement-common',
              type: 'basement',
              name: '整体地下室',
              serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
              basementKind: 'common_basement',
            },
            {
              id: 'shared-podium',
              type: 'physical_zone',
              name: '共享裙房',
              physicalSpaceKind: 'shared_podium',
              structuralRole: 'podium',
              sharedScopeCandidate: true,
              serviceTargetObjectIds: ['building-a', 'building-b', 'building-c'],
            },
          ],
        },
      },
    })

    const organizationRows = generated.rows.filter((row) => {
      const organization = rowMetadata(row).projectOrganization as Record<string, unknown> | undefined
      return organization?.source === 'project_execution_organization_policy'
    })
    expect(organizationRows.length).toBeGreaterThan(0)

    const scenarioSelection = (rowMetadata(organizationRows[0]).projectOrganization as Record<string, any>).scenarioSelection
    expect(scenarioSelection.factBasis.scopeOrganizationFacts).toEqual(expect.objectContaining({
      scopeObjectCount: 5,
      buildingObjectCount: 3,
      sharedBasementObjectCount: 1,
      sharedPodiumObjectCount: 1,
      sharedBasementServiceTargetCount: 3,
      servedRelationCount: 3,
      organizationSignals: expect.arrayContaining([
        'multi_building_scope_objects',
        'shared_basement_service_range',
        'shared_podium_service_range',
        'served_by_scope_relation_present',
      ]),
    }))
    expect(scenarioSelection.recommendedPlanOption.evaluation.useCaseEvaluations.newProjectPlanning.factCoverage.consumedFactKeys).toEqual(
      expect.arrayContaining(['scopeOrganizationFacts']),
    )
    expect(scenarioSelection.boundaryPolicy.resourcePolicy).toBe('resources_are_sidecar_feasibility_signals_not_primary_schedule_driver')
  }, 60_000)

  it('actualizes project-scope catalog alternatives before schedule and dependency wiring', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-organization-alternative-actualization',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          total_area_m2: 98100,
          building_count: 3,
          standard_floor_count: 26,
          basement_level_count: 2,
          foundation_depth_m: 9,
          buildingPatternCodes: ['multi_tower_shared_podium'],
        },
      },
    })

    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const foundationAlternatives = scheduleRows.filter((row) => /^01-02-\d{2}$/.test(String(row.values.standard_work_code)))
    const foundationCodes = foundationAlternatives.map((row) => String(row.values.standard_work_code)).sort()

    expect(foundationCodes).toContain('01-02-03')
    expect(foundationCodes.length).toBeLessThanOrEqual(3)
    expect(foundationCodes).not.toEqual(expect.arrayContaining([
      '01-02-07',
      '01-02-08',
      '01-02-09',
      '01-02-10',
      '01-02-11',
      '01-02-12',
      '01-02-13',
      '01-02-14',
      '01-02-15',
    ]))
    const slopeCodes = scheduleRows
      .filter((row) => /^01-06-\d{2}$/.test(String(row.values.standard_work_code)))
      .map((row) => String(row.values.standard_work_code))
      .sort()
    expect(slopeCodes.length).toBeLessThanOrEqual(1)

    const actualizedRows = foundationAlternatives.filter((row) => {
      const actualization = rowMetadata(row).projectScopeCatalogActualization as Record<string, unknown> | undefined
      return actualization?.source === 'project_scope_catalog_actualization_policy'
    })
    expect(actualizedRows.length).toBeGreaterThan(0)
    expect(actualizedRows.every((row) => {
      const actualization = rowMetadata(row).projectScopeCatalogActualization as Record<string, unknown>
      return actualization.selectionStatus === 'actualized_schedule_carrier'
        && actualization.resourcePolicy === 'resources_are_sidecar_feasibility_signals_not_primary_schedule_driver'
    })).toBe(true)

    const waterproofRows = scheduleRows.filter((row) => /^01-07-\d{2}$/.test(String(row.values.standard_work_code)))
    expect(waterproofRows.length).toBeGreaterThan(0)
    for (const row of waterproofRows) {
      const foundationPredecessors = (row.predecessorDependencies ?? [])
        .map((dependency) => generated.rows.find((candidate) => candidate.clientRowId === dependency.clientRowId))
        .filter((predecessor): predecessor is typeof generated.rows[number] => Boolean(predecessor))
        .filter((predecessor) => /^01-02-\d{2}$/.test(String(predecessor.values.standard_work_code)))
      expect(foundationPredecessors.length).toBeLessThanOrEqual(2)
    }
  }, 60_000)

  it('uses selected foundation method candidates instead of noisy method variant alternatives', async () => {
    const generated = await generateWbsTemplateRows({
      projectId: '00000000-0000-4000-8000-000000000001',
      surface: 'task_list',
      detailLevel: 'planning_skeleton' as never,
      diagnosticDurationSuggestionMode: 'fast_template',
      operation: {
        type: 'template_generate',
        generationBatchId: 'batch-project-organization-selected-foundation-method-candidates',
        templateIds: [CHINA_GB55032_TEMPLATE_ID],
        selectedNodesByTemplate: {
          [CHINA_GB55032_TEMPLATE_ID]: ['01'],
        },
        plannedStartDate: '2026-06-01',
        scope: {
          scopeExpansionMode: 'project',
          business_type: 'general_civil',
          project_type_code: 'residential',
          structure_type_code: 'frame_shear',
          total_area_m2: 98100,
          building_count: 3,
          standard_floor_count: 26,
          basement_level_count: 2,
          foundation_depth_m: 9,
          method_variant_codes: ['smw', 'precast_pile', 'trd_wall'],
          buildingPatternCodes: ['multi_tower_shared_podium'],
          project_features: {
            foundationMethodCandidates: [
              { code: 'bored_pile', category: 'pile_foundation', selected: true },
              { code: 'diaphragm_wall', category: 'pit_support', selected: true },
              { code: 'smw_pile', category: 'pit_support', selected: false },
              { code: 'trd_wall', category: 'pit_support', selected: false },
              { code: 'precast_pile', category: 'pile_foundation', selected: false },
            ],
          },
        },
      },
    })

    const scheduleRows = generated.rows.filter((row) => row.rowProjectionMode === 'schedule_row')
    const scheduleCodes = scheduleRows.map((row) => String(row.values.standard_work_code)).sort()
    expect(scheduleCodes).toContain('01-02-08')
    expect(scheduleCodes).toContain('01-03-06')
    expect(scheduleCodes).not.toContain('01-03-04')
    expect(scheduleCodes).not.toContain('01-02-07')

    const pitSupport = scheduleRows.find((row) => row.values.standard_work_code === '01-03-06')
    const actualization = rowMetadata(pitSupport!).projectScopeCatalogActualization as Record<string, unknown>
    expect(actualization.selectedCodes).toEqual(expect.arrayContaining(['01-03-06']))
    expect(actualization.reasonCode).toBe('01_03_actual_carrier_selected_by_project_facts')
  }, 60_000)
})
