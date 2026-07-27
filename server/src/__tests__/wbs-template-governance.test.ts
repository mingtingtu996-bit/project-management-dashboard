import express from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import supertest from 'supertest'

import {
  CHINA_GB55032_TEMPLATE_CATALOG,
  collectStandardInternalFlowGovernanceReport,
  flattenChinaTemplateCatalog,
  resolveStandardInternalFlowRule,
} from '../seeds/chinaGb50300TemplateCatalog.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS } from '../seeds/domainWbsTemplateCatalogs.js'
import { inferControlRoles } from '../seeds/controlRoles.js'
import { inferDurationContributionMode } from '../seeds/durationContributionMode.js'
import { inferExecutionNature } from '../seeds/executionNature.js'
import { DEPENDENCY_INTENT_REFERENCE_FIELDS } from '../seeds/v1475DependencyIntentTemplates.js'
import { V1475_CROSS_ITEM_WORKFLOW_SEED } from '../seeds/v1475CrossItemWorkflowSeed.js'

vi.setConfig({ testTimeout: 300000 })

const state = vi.hoisted(() => {
  const templateTree = [
    {
      title: 'Preparation',
      source_id: 'node-prep',
      reference_days: 12,
      children: [
        { title: 'Survey', source_id: 'node-survey', reference_days: 4 },
        { title: 'Drawings', source_id: 'node-drawings', reference_days: 15 },
      ],
    },
    {
      title: 'Structure',
      source_id: 'node-structure',
      reference_days: 30,
      children: [
        { title: 'Typical floor cycle', source_id: 'node-standard', reference_days: 24 },
      ],
    },
  ]

  return {
    rawQuery: vi.fn(async () => ({ rows: [] })),
    globalRole: 'regular',
    template: {
      id: 'template-1',
      project_id: 'project-1',
      template_name: 'Sample WBS Template',
      template_data: JSON.parse(JSON.stringify(templateTree)),
      wbs_nodes: JSON.parse(JSON.stringify(templateTree)),
      reference_days: null as number | null,
      is_public: true,
      updated_at: '2026-04-01T00:00:00.000Z',
    },
    baselineTemplate: JSON.parse(JSON.stringify(templateTree)),
    projects: [
      { id: 'project-1', name: 'Completed project A', status: 'completed' },
      { id: 'project-2', name: 'Completed project B', status: 'done' },
      { id: 'project-3', name: 'Active project', status: 'active' },
      { id: 'project-4', name: 'Completed but unmapped project', status: 'completed' },
    ],
    tasks: [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'Survey',
        baseline_item_id: 'baseline-survey-1',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-07T00:00:00.000Z',
      },
      {
        id: 'task-2',
        project_id: 'project-2',
        title: 'Survey',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-09T00:00:00.000Z',
      },
      {
        id: 'task-3',
        project_id: 'project-1',
        title: 'Drawings',
        baseline_item_id: 'baseline-drawings-1',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-22T00:00:00.000Z',
      },
      {
        id: 'task-4',
        project_id: 'project-2',
        title: 'Drawings',
        baseline_item_id: 'baseline-drawings-2',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-24T00:00:00.000Z',
      },
      {
        id: 'task-5',
        project_id: 'project-1',
        title: 'Typical floor cycle',
        baseline_item_id: 'baseline-standard-1',
        status: 'completed',
        actual_start_date: '2026-04-01T00:00:00.000Z',
        actual_end_date: '2026-04-21T00:00:00.000Z',
      },
      {
        id: 'task-6',
        project_id: 'project-2',
        title: 'Typical floor cycle',
        baseline_item_id: 'baseline-standard-2',
        status: 'completed',
        actual_start_date: '2026-04-01T00:00:00.000Z',
        actual_end_date: '2026-04-23T00:00:00.000Z',
      },
      {
        id: 'task-7',
        project_id: 'project-3',
        title: 'Typical floor cycle',
        status: 'in_progress',
        actual_start_date: null,
        actual_end_date: null,
      },
      {
        id: 'task-8',
        project_id: 'project-1',
        title: 'Survey',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-04-10T00:00:00.000Z',
      },
      {
        id: 'task-9',
        project_id: 'project-4',
        title: 'Free-form finished task',
        status: 'completed',
        actual_start_date: '2026-03-05T00:00:00.000Z',
        actual_end_date: '2026-03-12T00:00:00.000Z',
      },
    ] as Array<{
      id: string
      project_id: string
      title: string
      status: string
      actual_start_date: string | null
      actual_end_date: string | null
      baseline_item_id?: string
      task_source?: string | null
    }>,
    baselineItems: [
      { id: 'baseline-survey-1', source_task_id: 'node-survey' },
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
      { id: 'baseline-drawings-1', source_task_id: 'node-drawings' },
      { id: 'baseline-drawings-2', source_task_id: 'node-drawings' },
      { id: 'baseline-standard-1', source_task_id: 'node-standard' },
      { id: 'baseline-standard-2', source_task_id: 'node-standard' },
    ] as Array<{ id: string; source_task_id?: string | null }>,
  }
})

const dbMock = vi.hoisted(() => ({
  supabase: {
    from: vi.fn((tableName: string) => {
      if (tableName === 'wbs_template_candidate_aggregations') {
        const query = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn(async () => ({
            data: [
              {
                project_id: 'project-1',
                template_id: 'china-gb55032-2022',
                period_month: '2026-05',
                total_candidates: 10,
                accepted_candidates: 8,
                rejected_candidates: 1,
                pending_candidates: 1,
                acceptance_rate: 0.8,
                metadata: { acceptance_rate_basis: 'retained_rows_divided_by_generated_rows' },
                updated_at: '2026-05-22T00:00:00.000Z',
              },
            ],
            error: null,
          })),
        }
        return query
      }
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn(async () => ({ data: [], error: null })),
      }
    }),
  },
  executeSQL: vi.fn(async (query: string, params: any[] = []) => {
    if (query.includes('SELECT id, name, status FROM projects')) {
      return state.projects
    }

    if (query.includes('SELECT * FROM tasks')) {
      return state.tasks
    }

    if (query.includes('FROM task_baseline_items')) {
      return state.baselineItems
    }

    if (query.includes('UPDATE wbs_templates')) {
      const [wbsNodesJson, templateDataJson, referenceDays] = params
      state.template.wbs_nodes = JSON.parse(String(wbsNodesJson))
      state.template.template_data = JSON.parse(String(templateDataJson))
      state.template.reference_days = referenceDays
      state.template.updated_at = String(params[3] ?? new Date().toISOString())
      return []
    }

    return []
  }),
  executeSQLOne: vi.fn(async (query: string, params: any[] = []) => {
    if (query.includes('FROM wbs_templates') && query.includes('WHERE id = ?')) {
      return params[0] === state.template.id ? state.template : null
    }

    return null
  }),
}))

vi.mock('../services/dbService.js', () => dbMock)
vi.mock('../services/constructionCalendar.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/constructionCalendar.js')>()
  return {
    ...actual,
    resolveConstructionCalendarContext: vi.fn(async () => ({
      basis: 'official_construction_calendar_seed',
      availability: 'available',
      calendarRef: 'cn-work-calendar',
      calendarVersion: '2026.07',
      timezone: 'Asia/Shanghai',
      windows: [],
    })),
  }
})
vi.mock('../database.js', () => ({
  query: state.rawQuery,
}))
vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: state.globalRole }
    next()
  }),
}))
vi.mock('../auth/access.js', () => ({
  getCurrentCompanyMembership: vi.fn(async () => ({ companyId: 'company-1', role: 'regular' })),
  getVisibleProjectIds: vi.fn(async () => ['project-1', 'project-2']),
  getProjectPermissionLevel: vi.fn(async () => 'owner'),
  isCompanyAdminRole: vi.fn((role?: string | null) => role === 'company_admin'),
}))
vi.mock('../auth/companyContext.js', () => ({
  getRequestCompanyId: vi.fn(() => 'company-1'),
}))
vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import wbsTemplateGovernanceRouter from '../routes/wbs-template-governance.js'
import { getCurrentCompanyMembership } from '../auth/access.js'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/wbs-template-governance', wbsTemplateGovernanceRouter)
  return app
}

describe('wbs template governance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.globalRole = 'regular'
    state.template.project_id = 'project-1'
    ;(state.template as any).company_id = null
    ;(state.template as any).catalog_scope = null
    ;(state.template as any).is_builtin = false
    ;(state.template as any).is_public = true
    ;(state.template as any).standard_catalog_code = null
    state.template.template_data = JSON.parse(JSON.stringify(state.baselineTemplate))
    state.template.wbs_nodes = JSON.parse(JSON.stringify(state.baselineTemplate))
    state.template.reference_days = null
    state.template.updated_at = '2026-04-01T00:00:00.000Z'
    state.tasks = [
      {
        id: 'task-1',
        project_id: 'project-1',
        title: 'Survey',
        baseline_item_id: 'baseline-survey-1',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-07T00:00:00.000Z',
      },
      {
        id: 'task-2',
        project_id: 'project-2',
        title: 'Survey',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-09T00:00:00.000Z',
      },
      {
        id: 'task-3',
        project_id: 'project-1',
        title: 'Drawings',
        baseline_item_id: 'baseline-drawings-1',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-22T00:00:00.000Z',
      },
      {
        id: 'task-4',
        project_id: 'project-2',
        title: 'Drawings',
        baseline_item_id: 'baseline-drawings-2',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-24T00:00:00.000Z',
      },
      {
        id: 'task-5',
        project_id: 'project-1',
        title: 'Typical floor cycle',
        baseline_item_id: 'baseline-standard-1',
        status: 'completed',
        actual_start_date: '2026-04-01T00:00:00.000Z',
        actual_end_date: '2026-04-21T00:00:00.000Z',
      },
      {
        id: 'task-6',
        project_id: 'project-2',
        title: 'Typical floor cycle',
        baseline_item_id: 'baseline-standard-2',
        status: 'completed',
        actual_start_date: '2026-04-01T00:00:00.000Z',
        actual_end_date: '2026-04-23T00:00:00.000Z',
      },
      {
        id: 'task-7',
        project_id: 'project-3',
        title: 'Typical floor cycle',
        status: 'in_progress',
        actual_start_date: null,
        actual_end_date: null,
      },
      {
        id: 'task-8',
        project_id: 'project-1',
        title: 'Survey',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-04-10T00:00:00.000Z',
      },
      {
        id: 'task-9',
        project_id: 'project-4',
        title: 'Free-form finished task',
        status: 'completed',
        actual_start_date: '2026-03-05T00:00:00.000Z',
        actual_end_date: '2026-03-12T00:00:00.000Z',
      },
    ]
    state.baselineItems = [
      { id: 'baseline-survey-1', source_task_id: 'node-survey' },
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
      { id: 'baseline-drawings-1', source_task_id: 'node-drawings' },
      { id: 'baseline-drawings-2', source_task_id: 'node-drawings' },
      { id: 'baseline-standard-1', source_task_id: 'node-standard' },
      { id: 'baseline-standard-2', source_task_id: 'node-standard' },
    ]
  })

  it('keeps built-in same-parent internal-flow wiring attached across core and domain templates', () => {
    const catalogs = [
      CHINA_GB55032_TEMPLATE_CATALOG,
      ...DOMAIN_WBS_TEMPLATE_CATALOGS,
    ]
    const findings: Array<Record<string, unknown>> = []
    let adjacentPairCount = 0

    const visit = (catalog: any, node: any) => {
      const siblingNodes = (node.children ?? []).filter((child: any) => (
        child.categoryType === 'process' || child.categoryType === 'activity_step'
      ))
      for (let index = 1; index < siblingNodes.length; index += 1) {
        adjacentPairCount += 1
        const predecessor = siblingNodes[index - 1]
        const successor = siblingNodes[index]
        const rule = resolveStandardInternalFlowRule({
          catalogSource: catalog.templateId === CHINA_GB55032_TEMPLATE_CATALOG.templateId
            ? 'china_gb50300_template_catalog'
            : 'domain_wbs_template_catalog',
          predecessorStableCode: predecessor.stableCode,
          predecessorName: predecessor.name,
          successorStableCode: successor.stableCode,
          successorName: successor.name,
          successorCategoryType: successor.categoryType,
        })
        if (
          rule.predecessorName !== predecessor.name
          || rule.successorName !== successor.name
          || rule.predecessorStableCode !== predecessor.stableCode
          || rule.successorStableCode !== successor.stableCode
        ) {
          findings.push({
            code: 'INTERNAL_FLOW_RULE_MISMATCH',
            catalogId: catalog.templateId,
            parentStableCode: node.stableCode,
            expected: {
              predecessorStableCode: predecessor.stableCode,
              successorStableCode: successor.stableCode,
              predecessorName: predecessor.name,
              successorName: successor.name,
            },
            actual: {
              predecessorStableCode: rule.predecessorStableCode,
              successorStableCode: rule.successorStableCode,
              predecessorName: rule.predecessorName,
              successorName: rule.successorName,
            },
          })
        }
      }
      for (const child of node.children ?? []) visit(catalog, child)
    }

    for (const catalog of catalogs) {
      for (const root of catalog.divisions ?? []) visit(catalog, root)
    }

    const report = collectStandardInternalFlowGovernanceReport(5)
    expect(catalogs.length).toBeGreaterThanOrEqual(43)
    expect(new Set(catalogs.map((catalog) => catalog.templateId)).size).toBe(catalogs.length)
    expect(adjacentPairCount).toBeGreaterThan(23_000)
    expect(report.summary.totalRules).toBe(adjacentPairCount)
    expect(findings).toEqual([])
    expect(report.summary.reviewRequired).toBeLessThanOrEqual(20_000)
    expect(report.executionBaselineGate.highPriorityReviewRequiredRuleCount).toBeLessThanOrEqual(120)
    expect(report.executionBaselineGate.status)
      .toMatch(/execution_baseline_ready|runtime_execution_baseline_ready_with_p2_governance_tail|needs_curated_rule_sprint/)
    expect(report.executionBaselineGate.runtimeImpactStatus).toMatch(/runtime_impact_ready|runtime_impact_review_required/)
    expect(report.executionBaselineGate.coverageSprintStatus).toMatch(/coverage_sprint_closed|coverage_sprint_pending/)
    expect(report.executionBaselineGate.runtimeBlockingReviewRequiredRuleCount).toBeGreaterThanOrEqual(0)
  })

  it('resolves the newly supplemented same-parent internal-flow rules from the dedicated rule seed', () => {
    flattenChinaTemplateCatalog()
    const findInternalFlow = (predecessorName: string, successorName: string, successorCategoryType: 'process' | 'activity_step') => resolveStandardInternalFlowRule({
      predecessorStableCode: `test-prev-${predecessorName}`,
      predecessorName,
      successorStableCode: `test-next-${successorName}`,
      successorName,
      successorCategoryType,
    })

    expect(findInternalFlow('方案或条件确认', '仪器和测试点复核', 'activity_step')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'hard_sequence',
      createsDependency: true,
    }))
    expect(findInternalFlow('支吊架套管和坡度复核', '管段预制与接口连接', 'activity_step')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'hard_sequence',
      createsDependency: true,
    }))
    expect(findInternalFlow('专项深化和材料设备复核', '安装施工和接口连接', 'activity_step')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'hard_sequence',
      createsDependency: true,
    }))
    expect(findInternalFlow('构件资料和编号复核', '吊装定位或连接施工', 'activity_step')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'hard_sequence',
      createsDependency: true,
    }))
    expect(findInternalFlow('资料条件核查', '现场或接口复核', 'activity_step')).toEqual(expect.objectContaining({
      curationStatus: 'curated',
      curationMethod: 'manual_registry',
      relationKind: 'hard_sequence',
      createsDependency: true,
    }))
  })

  it('keeps cross-item workflow predecessor and successor anchors disjoint', () => {
    const catalogs = [
      CHINA_GB55032_TEMPLATE_CATALOG,
      ...DOMAIN_WBS_TEMPLATE_CATALOGS,
    ]
    const packageLikeNodes: Array<{ stableCode: string; name: string; categoryType: string }> = []
    const visit = (node: any) => {
      if (['division', 'sub_division', 'item_work'].includes(String(node.categoryType))) {
        packageLikeNodes.push({
          stableCode: String(node.stableCode),
          name: String(node.name),
          categoryType: String(node.categoryType),
        })
      }
      for (const child of node.children ?? []) visit(child)
    }
    for (const catalog of catalogs) {
      for (const root of catalog.divisions ?? []) visit(root)
    }

    const matchesPrefix = (stableCode: string, prefix: string) => (
      stableCode === prefix || stableCode.startsWith(`${prefix}-`) || stableCode.startsWith(`${prefix}:`)
    )
    const matchesAnyPrefix = (stableCode: string, prefixes: string[]) => prefixes.some((prefix) => matchesPrefix(stableCode, prefix))
    const matchesCategory = (categoryType: string, categories?: string[]) => (
      !categories || categories.length === 0 || categories.includes(categoryType)
    )

    const overlaps = V1475_CROSS_ITEM_WORKFLOW_SEED.flatMap((rule) => {
      const predecessorNodes = packageLikeNodes.filter((node) => (
        matchesAnyPrefix(node.stableCode, rule.predecessorCodePrefixes)
        && matchesCategory(node.categoryType, rule.predecessorCategoryTypes)
      ))
      const successorNodes = packageLikeNodes.filter((node) => (
        matchesAnyPrefix(node.stableCode, rule.successorCodePrefixes)
        && matchesCategory(node.categoryType, rule.successorCategoryTypes)
      ))
      const successorCodes = new Set(successorNodes.map((node) => node.stableCode))
      return predecessorNodes
        .filter((node) => successorCodes.has(node.stableCode))
        .map((node) => ({
          ruleCode: rule.stableCode,
          stableCode: node.stableCode,
          name: node.name,
        }))
    })

    expect(overlaps).toEqual([])
  })

  it('keeps the supplemented cross-item workflow coverage packs wired to the new package-level anchors', () => {
    const ruleById = new Map(V1475_CROSS_ITEM_WORKFLOW_SEED.map((rule) => [rule.stableCode, rule]))

    expect(ruleById.get('basement_masonry_plaster_to_basement_mep_handoff')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['BDT-01-01-04']),
      successorCodePrefixes: expect.arrayContaining(['BDT-01-01-05']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('basement_mep_to_basement_equipment_finish_handoff')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['BDT-01-01-05']),
      successorCodePrefixes: expect.arrayContaining(['BDT-01-01-06']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('prefab_factory_to_site_hoist_handoff')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-00']),
      successorCodePrefixes: expect.arrayContaining(['PFB-01']),
      dependencyType: 'FS',
      autoApplyPolicy: 'manual_confirm',
    }))
    expect(ruleById.get('prefab_deepening_freeze_to_factory_production')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-00-01-01']),
      successorCodePrefixes: expect.arrayContaining(['PFB-00-01-02']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('prefab_factory_production_to_transport_receiving')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-00-01-02']),
      successorCodePrefixes: expect.arrayContaining(['PFB-00-01-03']),
      dependencyType: 'SS',
      lagDays: 7,
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('prefab_transport_receiving_to_first_batch_full_inspection')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-00-01-03']),
      successorCodePrefixes: expect.arrayContaining(['PFB-01-01-01']),
      dependencyType: 'SS',
      lagDays: 1,
      strength: 'hard',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('prefab_first_batch_inspection_to_wall_column_hoist')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-01-01-01']),
      successorCodePrefixes: expect.arrayContaining(['PFB-01-01-03']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('prefab_vertical_components_to_grout_connection')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-01-01-03']),
      successorCodePrefixes: expect.arrayContaining(['PFB-02-01-01', 'PFB-02-01-02']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('prefab_grouting_quality_to_next_floor_vertical_hoist')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-02-01-01', 'PFB-02-01-02']),
      successorCodePrefixes: expect.arrayContaining(['PFB-01-01-03']),
      dependencyType: 'FS',
      scopeRule: 'next_floor',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('prefab_pcf_water_test_to_prefab_interior')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-02-01-04', 'PFB-04-01-10']),
      successorCodePrefixes: expect.arrayContaining(['PFB-02-01-05']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('prefab_joint_quality_to_assembly_rate_assessment')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['PFB-02-01-01', 'PFB-02-01-02', 'PFB-03-01-01']),
      successorCodePrefixes: expect.arrayContaining(['PFB-03-01-02', 'PFB-04-01-13']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('mep_rough_in_to_ceiling_wall_close')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['05', '06', '07', '08']),
      successorCodePrefixes: expect.arrayContaining(['03-02', '03-05', 'DEC-02-01']),
      excludedPredecessorCodePrefixes: expect.arrayContaining(['07-01-06', '07-03-06', '07-04-07', '07-05-04', '07-06-07']),
      dependencyType: 'FS',
      lagDays: 1,
      scopeRule: 'same_floor',
      strength: 'hard',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('mep_rough_in_to_public_room_finish_close')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['05', '06', '07', '08']),
      successorCodePrefixes: expect.arrayContaining(['DEC-05-01']),
      excludedPredecessorCodePrefixes: expect.arrayContaining(['06-03-03', '06-03-05', '07-01-06', '07-03-06', '07-04-07', '07-05-04', '07-06-07']),
      dependencyType: 'FS',
      lagDays: 1,
      scopeRule: 'same_floor',
      strength: 'hard',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('main_structure_to_facade_start')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['02-01', '02-03', '02-04', '02-05']),
      successorCodePrefixes: expect.arrayContaining(['03-09', 'FAC-01']),
      dependencyType: 'FS',
      lagDays: 1,
      scopeRule: 'same_zone',
      strength: 'hard',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('cleanroom_envelope_medgas_to_clean_air_validation')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['CLN-01']),
      successorCodePrefixes: expect.arrayContaining(['CLN-02']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('data_center_envelope_to_power_cooling_install')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['DTC-01']),
      successorCodePrefixes: expect.arrayContaining(['DTC-02']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('renovation_survey_demolition_to_structural_reinforcement')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['RNV-01']),
      successorCodePrefixes: expect.arrayContaining(['RNV-02-01']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('mic_transport_receiving_to_site_hoist_connection')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['MIC-03']),
      successorCodePrefixes: expect.arrayContaining(['MIC-04']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
    expect(ruleById.get('hotel_guestroom_mockup_to_batch_rooms')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['HTL-01-01-01']),
      successorCodePrefixes: expect.arrayContaining(['HTL-01-01-02']),
      dependencyType: 'FS',
      autoApplyPolicy: 'manual_confirm',
    }))
    expect(ruleById.get('industrial_cleanroom_envelope_to_process_power_environment')).toEqual(expect.objectContaining({
      predecessorCodePrefixes: expect.arrayContaining(['ICR-02']),
      successorCodePrefixes: expect.arrayContaining(['ICR-03']),
      dependencyType: 'FS',
      autoApplyPolicy: 'confirmed_template_only',
    }))
  })

  it('promotes real-project coverage packs into formal specialty depth instead of active *-90 supplements', () => {
    const targets: Record<string, number> = {
      'china-foundation-pit-pile': 36,
      'china-prefabricated-assembly': 33,
      'china-cleanroom-medical-specialty': 45,
      'china-data-center-specialty': 38,
      'china-industrial-cleanroom-specialty': 42,
      'china-steel-structure-specialty': 34,
      'china-renovation-retrofit-specialty': 32,
      'china-heritage-preservation-specialty': 22,
      'china-campus-specialty': 38,
      'china-tod-upper-cover-specialty': 30,
      'china-modular-mic-specialty': 32,
      'china-prefab-bathroom-specialty': 9,
      'china-prefab-kitchen-specialty': 9,
      'china-hotel-specialty': 38,
    }

    const collectItemWorks = (catalog: any) => {
      const itemWorks: any[] = []
      const visit = (node: any) => {
        if (node.categoryType === 'item_work') itemWorks.push(node)
        for (const child of node.children ?? []) visit(child)
      }
      for (const root of catalog.divisions ?? []) visit(root)
      return itemWorks
    }

    for (const [templateId, expectedItemPacks] of Object.entries(targets)) {
      const catalog = DOMAIN_WBS_TEMPLATE_CATALOGS.find((item) => item.templateId === templateId)
      expect(catalog, `missing template ${templateId}`).toBeTruthy()

      const itemWorks = collectItemWorks(catalog)
      const activeLegacySupplements = itemWorks.filter((node) => (
        String(node.stableCode).includes('-90')
        || node.metadata?.coverageSupplement === true
      ))
      const formalItemWorks = itemWorks.filter((node) => (
        !String(node.stableCode).includes('-90')
        && node.metadata?.coverageSupplement !== true
      ))
      const promotedItemWorks = formalItemWorks.filter((node) => node.metadata?.realProjectCoveragePromoted === true)

      expect(activeLegacySupplements, `${templateId} still exposes legacy coverage supplement itemPacks`).toEqual([])
      expect(formalItemWorks.length, `${templateId} formal itemPack depth`).toBeGreaterThanOrEqual(expectedItemPacks)
      expect(promotedItemWorks.length, `${templateId} promoted real-project packs`).toBeGreaterThan(0)
      for (const promoted of promotedItemWorks) {
        expect(promoted.metadata).toEqual(expect.objectContaining({
          nativeSpecialtyDepth: true,
          realProjectCoveragePromoted: true,
          coverageSupplement: false,
          promotionPolicy: 'coverage_supplement_promoted_to_formal_specialty_division',
        }))
        expect(String(promoted.metadata.promotedFromCoverageCode)).toContain('-90')
      }
    }
  })

  it('keeps standard internal-flow governance report backend/admin-only', async () => {
    const app = buildApp()

    const forbidden = await supertest(app).get('/api/wbs-template-governance/internal-flow-rules/report')
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    vi.mocked(getCurrentCompanyMembership).mockResolvedValueOnce({ companyId: 'company-1', role: 'company_admin' })
    const allowed = await supertest(app).get('/api/wbs-template-governance/internal-flow-rules/report?limit=5')
    expect(allowed.status).toBe(200)
    expect(allowed.body.data.summary.curated).toBeGreaterThan(5000)
    expect(allowed.body.data.summary.reviewRequired).toBeGreaterThanOrEqual(0)
    expect(allowed.body.data.summary.byCurationMethod.manual_registry).toBeGreaterThan(0)
    expect(allowed.body.data.summary.byCurationMethod.stable_code_backfill).toBeGreaterThan(0)
    expect(allowed.body.data.summary.rawCreatesDependency).toBe(allowed.body.data.summary.createsDependency)
    expect(allowed.body.data.summary.effectiveCreatesDependency).toBeGreaterThan(0)
    expect(allowed.body.data.summary.effectiveCreatesDependency).toBeLessThan(allowed.body.data.summary.rawCreatesDependency)
    expect(allowed.body.data.summary.dependencySkippedByDurationContributionMode).toBeGreaterThan(0)
    expect(allowed.body.data.releaseImpactPreview).toEqual(expect.objectContaining({
      rawSeedCreatesDependencyRules: allowed.body.data.summary.rawCreatesDependency,
      effectiveGeneratedDependencyRules: allowed.body.data.summary.effectiveCreatesDependency,
      dependencyRulesSkippedByDurationContributionMode: allowed.body.data.summary.dependencySkippedByDurationContributionMode,
    }))
    expect(allowed.body.data.governancePolicy.reviewRequiredCreatesDependency).toBe(false)
    expect(allowed.body.data.executionBaselineGate).toEqual(expect.objectContaining({
      status: expect.stringMatching(/execution_baseline_ready|runtime_execution_baseline_ready_with_p2_governance_tail|needs_curated_rule_sprint/),
      runtimeImpactStatus: expect.stringMatching(/runtime_impact_ready|runtime_impact_review_required/),
      coverageSprintStatus: expect.stringMatching(/coverage_sprint_closed|coverage_sprint_pending/),
      runtimeBlockingReviewRequiredRuleCount: expect.any(Number),
      p2TailPolicy: expect.stringContaining('Do not chase every low-frequency P2'),
      runtimePolicy: expect.stringContaining('No ordinary task save'),
    }))
    expect(Array.isArray(allowed.body.data.topReviewRequiredPairs)).toBe(true)
  })

  it('does not trust JWT globalRole for WBS seed governance without admin membership', async () => {
    state.globalRole = 'company_admin'
    vi.mocked(getCurrentCompanyMembership).mockResolvedValueOnce({ companyId: 'company-1', role: 'regular' })

    const response = await supertest(buildApp())
      .get('/api/wbs-template-governance/internal-flow-rules/report')
      .expect(403)

    expect(response.body.error.code).toBe('FORBIDDEN')
  })

  it('keeps the unified dependency rule system report backend/admin-only', async () => {
    const app = buildApp()

    const forbidden = await supertest(app).get('/api/wbs-template-governance/dependency-rule-system/report')
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    vi.mocked(getCurrentCompanyMembership).mockResolvedValueOnce({ companyId: 'company-1', role: 'company_admin' })
    const allowed = await supertest(app).get('/api/wbs-template-governance/dependency-rule-system/report?limit=5')
    expect(allowed.status).toBe(200)
    expect(allowed.body.data.systemCode).toBe('construction_task_dependency_constraint_rule_system')
    expect(allowed.body.data.layers.map((layer: any) => layer.key)).toEqual([
      'workflow_sequence_dictionary',
      'same_parent_internal_flow',
      'cross_item_workflow',
      'cross_business_domain_dependency_intent',
      'process_constraint',
    ])
    expect(allowed.body.data.governancePolicy.ordinaryFrontendExposesSeedNames).toBe(false)
    expect(allowed.body.data.governancePolicy.explicitTaskDependenciesWin).toBe(true)
    expect(allowed.body.data.governancePolicy.sameParentHardSequenceMustBeExplicit).toBe(true)
    expect(allowed.body.data.dependencySystemCloseout).toEqual(expect.objectContaining({
      status: 'dependency_rule_system_closeout_ready',
      runtimeCloseoutStatus: 'runtime_dependency_generation_ready',
      scheduleTrustCoverageStatus: 'schedule_trust_closed_with_classified_non_l2_tail',
      governanceCoverageStatus: 'coverage_sprint_pending',
      allDependencyGovernanceComplete: false,
      backendOnly: true,
      ordinaryFrontendExposureBlocked: true,
      generationSourceOrder: [
        'sibling_sequence',
        'cross_item_workflow',
        'dependency_intent_template',
      ],
    }))
    expect(allowed.body.data.dependencySystemCloseout.remainingP1Risks)
      .not.toContain('standard_internal_flow_execution_baseline_gate_not_ready')
    expect(allowed.body.data.dependencySystemCloseout.statusMeaning)
      .toMatch(/schedule trust may already be closed/i)
    expect(allowed.body.data.dependencySystemCloseout.layerReadiness).toEqual(expect.objectContaining({
      workflow_sequence_dictionary: expect.objectContaining({ ready: true, runtimeDecisionSource: false }),
      same_parent_internal_flow: expect.objectContaining({
        ready: true,
        executionBaselineStatus: 'runtime_execution_baseline_ready_with_p2_governance_tail',
        runtimeImpactStatus: 'runtime_impact_ready',
        coverageSprintStatus: 'coverage_sprint_pending',
      }),
      cross_item_workflow: expect.objectContaining({ ready: true, zeroMatchRuleCount: 0 }),
      cross_business_domain_dependency_intent: expect.objectContaining({
        ready: true,
        defaultProjectWideScopeAllowed: false,
      }),
      process_constraint: expect.objectContaining({
        ready: true,
        generationChainStatus: 'process_constraint_generation_chain_ready',
        keywordFallbackMatchedEdgeCount: 0,
      }),
    }))
    expect(allowed.body.data.dependencySystemCloseout.nonBlockingGovernanceBacklog).toEqual(expect.objectContaining({
      same_parent_internal_flow: expect.objectContaining({
        status: 'coverage_sprint_pending',
        scheduleTrustCoverageStatus: 'schedule_trust_closed_with_classified_non_l2_tail',
        currentCuratedCoverageRatio: expect.any(Number),
        minimumCuratedCoverageRatio: 0.88,
        runtimeBlockingReviewRequiredRuleCount: 0,
        policy: expect.stringMatching(/does not block runtime scheduling/i),
      }),
    }))
    expect(allowed.body.data.dependencySystemCloseout.runtimeBoundaries).toEqual(expect.objectContaining({
      workflowDictionaryRuntimeDisabled: true,
      workflowDictionaryOnlyProducesGovernanceEvidence: true,
      sameParentInternalFlowOwnsLocalSiblingSequence: true,
      crossItemWorkflowOwnsPackageMainlineDependencies: true,
      dependencyIntentTemplatesOwnCrossBusinessDomainConstraints: true,
      dependencyIntentTemplatesRejectPhysicalMainline: true,
      processConstraintCreatesDependency: false,
      processConstraintStoresDayValues: false,
      processConstraintRequiresExistingRelation: true,
      explicitTaskDependenciesWin: true,
      generatedDependenciesDoNotOverwriteActiveTaskDependencies: true,
      candidateOrManualConfirmRulesCreateRuntimeDependencies: false,
    }))
    expect(allowed.body.data.dependencySystemCloseout.qualityGates).toEqual(expect.objectContaining({
      crossItemZeroMatchRuleCount: 0,
      dependencyIntentPhysicalMainlineRejectedCount: expect.any(Number),
      processConstraintKeywordFallbackMatchedEdgeCount: 0,
      processConstraintGenerationChainStatus: 'process_constraint_generation_chain_ready',
    }))
    expect(allowed.body.data.dependencySystemCloseout.qualityGates.dependencyIntentPhysicalMainlineRejectedCount)
      .toBeGreaterThan(0)
    expect(allowed.body.data.layers.find((layer: any) => layer.key === 'same_parent_internal_flow')?.technicalSources)
      .toContain('server/src/seeds/domainWbsTemplateCatalogs.ts')
    expect(allowed.body.data.sameParentInternalFlowGovernance).toEqual(expect.objectContaining({
      noOrdinaryFrontendConfirmationUi: true,
      hardRulePromotionPolicy: 'hard_sequence_and_acceptance_gate_require_curated_seed_promotion',
      executionBaselineGate: expect.objectContaining({
        backValidationEntryPoint: 'algorithm_seed_candidates.seed_type=standard_internal_flow via algorithmSeedCandidateDiscoveryService',
      }),
    }))
    expect(allowed.body.data.runtimeMetrics.workflow_dictionary.activeRuleCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.cross_item_workflow.activeRuleCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.cross_item_workflow.runtimeSource)
      .toBe('cross_item_workflow predecessorDependencies')
    expect(allowed.body.data.runtimeMetrics.cross_item_workflow.p1EnhancementRuleCount).toBeGreaterThanOrEqual(15)
    expect(allowed.body.data.runtimeMetrics.cross_item_workflow.confirmedTemplateOnlyCount).toBeGreaterThan(30)
    expect(allowed.body.data.runtimeMetrics.cross_item_workflow.manualConfirmCount).toBeGreaterThanOrEqual(10)
    expect(allowed.body.data.runtimeMetrics.cross_item_workflow.zeroMatchRuleCount).toBe(0)
    expect(allowed.body.data.runtimeMetrics.cross_item_workflow.noLagOrDurationAuthority).toBe(true)
    expect(allowed.body.data.crossItemWorkflowCoverage.scope).toBe('cross_item_workflow_package_mainline_coverage')
    expect(allowed.body.data.crossItemWorkflowCoverage.coveragePolicy.confirmedTemplateOnlyMayGeneratePackageDependencies).toBe(true)
    expect(allowed.body.data.crossItemWorkflowCoverage.coveragePolicy.manualConfirmRulesStayGovernanceSignals).toBe(true)
    expect(allowed.body.data.crossItemWorkflowCoverage.coveragePolicy.noOrdinaryFrontendExposure).toBe(true)
    expect(allowed.body.data.crossItemWorkflowCoverage.summary.zeroMatchRuleCount).toBe(0)
    expect(allowed.body.data.crossItemWorkflowCoverage.summary.byAutoApplyPolicy.confirmed_template_only).toBeGreaterThan(30)
    expect(allowed.body.data.crossItemWorkflowCoverage.summary.byAutoApplyPolicy.manual_confirm).toBeGreaterThanOrEqual(10)
    expect(allowed.body.data.crossItemWorkflowCoverage.summary.byScopeRule.same_zone).toBeGreaterThan(20)
    expect(allowed.body.data.crossItemWorkflowCoverage.summary.byScopeRule.next_floor).toBeGreaterThanOrEqual(1)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.referenceFieldCount).toBe(7)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.scopeRuleBacked).toBe(true)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.defaultProjectWideScopeAllowed).toBe(false)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.candidateAndManualCoverageBacked).toBe(true)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.metadataScopeOverrideSupported).toBe(true)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.documentCommercialDefaultsCandidateOnly).toBe(true)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.siteManagementDefaultsManualConfirm).toBe(true)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.referencedNodeCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.auditedReferenceCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.acceptedRuntimeEligibleCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.acceptedCandidateOnlyCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.rejectedPhysicalMainlineCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.confidenceScoreAverage).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.byConfidenceLevel.high).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.dependency_intent_template.supportedScopeRules).toEqual(expect.arrayContaining([
      'same_floor',
      'same_zone',
      'same_system',
    ]))
    expect(allowed.body.data.dependencyIntentCoverage.scope).toBe('dependency_intent_template_business_constraint_coverage')
    expect(allowed.body.data.dependencyIntentCoverage.coveragePolicy.noOrdinaryFrontendExposure).toBe(true)
    expect(allowed.body.data.dependencyIntentCoverage.coveragePolicy.physicalConstructionMainlineRoutedToStandardInternalOrCrossItemWorkflow).toBe(true)
    expect(allowed.body.data.dependencyIntentCoverage.coveragePolicy.defaultProjectWideScopeAllowed).toBe(false)
    expect(allowed.body.data.dependencyIntentCoverage.coveragePolicy.documentCommercialDefaultsCandidateOnly).toBe(true)
    expect(allowed.body.data.dependencyIntentCoverage.coveragePolicy.siteManagementDefaultsManualConfirm).toBe(true)
    expect(allowed.body.data.dependencyIntentCoverage.coveragePolicy.metadataScopeOverrideSupported).toBe(true)
    expect(allowed.body.data.dependencyIntentCoverage.summary.acceptedRuntimeEligibleCount).toBeGreaterThan(0)
    expect(allowed.body.data.dependencyIntentCoverage.summary.acceptedCandidateOnlyCount).toBeGreaterThan(0)
    expect(allowed.body.data.dependencyIntentCoverage.summary.rejectedPhysicalMainlineCount).toBeGreaterThan(0)
    expect(allowed.body.data.dependencyIntentCoverage.samples.acceptedRuntimeEligible.length).toBeGreaterThan(0)
    expect(allowed.body.data.dependencyIntentCoverage.samples.acceptedCandidateOrManual.length).toBeGreaterThan(0)
    expect(allowed.body.data.dependencyIntentCoverage.samples.rejectedPhysicalMainline.length).toBeGreaterThan(0)
    expect(allowed.body.data.dependencyIntentCoverage.samples.rejectedPhysicalMainline[0].auditTrace)
      .toEqual(expect.arrayContaining(['routing=standard_internal_flow_or_cross_item_workflow']))
    expect(allowed.body.data.runtimeMetrics.standard_internal_flow.curatedRuleCount).toBeGreaterThan(5000)
    expect(allowed.body.data.runtimeMetrics.standard_internal_flow.rawCreatesDependencyCount)
      .toBe(allowed.body.data.internalFlowGovernance.summary.rawCreatesDependency)
    expect(allowed.body.data.runtimeMetrics.standard_internal_flow.effectiveCreatesDependencyCount)
      .toBe(allowed.body.data.internalFlowGovernance.summary.effectiveCreatesDependency)
    expect(allowed.body.data.internalFlowGovernance.summary.byCatalogSource.domain_wbs_template_catalog).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.process_constraint.activeRuleCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.process_constraint.generationChainGate).toEqual(expect.objectContaining({
      status: 'process_constraint_generation_chain_ready',
      backendOnly: true,
      runtimePolicy: expect.stringContaining('never creates dependencies'),
      candidatePolicy: expect.stringContaining('candidate_only'),
    }))
    expect(allowed.body.data.runtimeMetrics.process_constraint.generationChainGate.checks).toEqual(expect.objectContaining({
      existingRelationOnly: true,
      noKeywordFallbackRuntimeMatch: true,
    }))
    expect(allowed.body.data.runtimeMetrics.process_constraint.backValidationCandidateEligibleEdgeCount).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.process_constraint.keywordFallbackMatchedEdgeCount).toBe(0)
    expect(allowed.body.data.runtimeMetrics.process_constraint.unmatchedExistingRelationEdgeCount).toBeGreaterThanOrEqual(0)
    expect(allowed.body.data.processConstraintCoverage.scope).toBe('process_constraint_edge_enhancement_coverage')
    expect(allowed.body.data.processConstraintCoverage.coveragePolicy.mode)
      .toBe('selective_edge_enhancement_not_full_dependency_coverage')
    expect(allowed.body.data.processConstraintCoverage.coveragePolicy.noOrdinaryFrontendExposure).toBe(true)
    expect(allowed.body.data.processConstraintCoverage.coveragePolicy.processConstraintRequiresExistingRelation).toBe(true)
    expect(allowed.body.data.processConstraintCoverage.coveragePolicy.parallelAllowedIsExcludedBecauseItHasNoTimingEdge).toBe(true)
    expect(allowed.body.data.processConstraintCoverage.coveragePolicy.backValidationCandidatesAreCandidateOnly).toBe(true)
    expect(allowed.body.data.processConstraintCoverage.coveragePolicy.keywordFallbackPairsRequireGovernanceFollowUp).toBe(true)
    expect(allowed.body.data.processConstraintCoverage.generationChainGate).toEqual(expect.objectContaining({
      status: 'process_constraint_generation_chain_ready',
      backendOnly: true,
    }))
    expect(allowed.body.data.processConstraintBackValidation.automaticGovernanceBoundary).toEqual({
      autoDiscover: true,
      autoScore: true,
      autoGroup: true,
      autoGenerateGovernanceSuggestion: true,
      autoPublishRuntimeRule: false,
      curatedSeedPromotionRequired: true,
      ordinaryFrontendExposure: false,
    })
    expect(allowed.body.data.processConstraintCoverage.summary.adjacentInternalFlowPairCount).toBeGreaterThan(20_000)
    expect(allowed.body.data.processConstraintCoverage.summary.curatedExistingRelationEdgeCount).toBeGreaterThan(5_000)
    expect(allowed.body.data.processConstraintCoverage.summary.generatedDependencyEdgeCount).toBeGreaterThan(4_000)
    expect(allowed.body.data.processConstraintCoverage.summary.processConstraintMatchedEdgeCount).toBeGreaterThan(5_000)
    expect(allowed.body.data.processConstraintCoverage.summary.processConstraintMatchedGeneratedDependencyEdgeCount).toBeGreaterThan(4_500)
    expect(allowed.body.data.processConstraintCoverage.summary.structuredCodeMatchedEdgeCount).toBeGreaterThan(5_000)
    expect(allowed.body.data.processConstraintCoverage.summary.keywordFallbackMatchedEdgeCount).toBe(0)
    expect(allowed.body.data.processConstraintCoverage.summary.backValidationCandidateEligibleEdgeCount).toBeGreaterThan(300)
    expect(allowed.body.data.processConstraintCoverage.summary.unmatchedExistingRelationEdgeCount).toBeGreaterThanOrEqual(0)
    expect(allowed.body.data.processConstraintCoverage.summary.selectiveCoverageRatio).toBeGreaterThan(0.14)
    expect(allowed.body.data.processConstraintCoverage.summary.generatedDependencyMatchedRatio).toBeGreaterThan(0.18)
    expect(allowed.body.data.processConstraintCoverage.summary.sameParentSelectiveCoverageRatio).toBeGreaterThan(0.14)
    expect(allowed.body.data.processConstraintCoverage.summary.sameParentGeneratedDependencyMatchedRatio).toBeGreaterThan(0.20)
    expect(allowed.body.data.processConstraintCoverage.summary.byMatchedApplicationMode.edge_overlap).toBeGreaterThan(200)
    expect(allowed.body.data.processConstraintCoverage.summary.byMatchedApplicationMode.gate_wait).toBeGreaterThan(4_800)
    expect(allowed.body.data.processConstraintCoverage.summary.byMatchQuality.structured_code).toBeGreaterThan(5_000)
    expect(allowed.body.data.processConstraintCoverage.summary.byMatchQuality.keyword_fallback ?? 0).toBe(0)
    expect(allowed.body.data.processConstraintCoverage.summary.byQuantityEvidenceRequirement.real_quantity_required_for_auto_release).toBeGreaterThan(90)
    expect(allowed.body.data.processConstraintCoverage.summary.byQuantityProxyRiskLevel.high).toBeGreaterThan(90)
    expect(allowed.body.data.processConstraintCoverage.summary.conditionalEffectMatchedEdgeCount).toBeGreaterThan(0)
    expect(allowed.body.data.processConstraintCoverage.summary.backValidationCandidateEligibleRuleCount).toBeGreaterThan(300)
    expect(allowed.body.data.processConstraintCoverage.summary.byCatalogGroup.specialty).toBeGreaterThan(0)
    expect(allowed.body.data.processConstraintCoverage.summary.byCatalogGroupMatched.specialty).toBeGreaterThan(0)
    expect(allowed.body.data.runtimeMetrics.process_constraint.coverage)
      .toEqual(allowed.body.data.processConstraintCoverage.summary)
    expect(allowed.body.data.processConstraintCoverage.topKeywordFallbackPairs).toEqual([])
    expect(allowed.body.data.processConstraintCoverage.topBackValidationCandidatePairs.length).toBeGreaterThan(0)
    expect(allowed.body.data.processConstraintCoverage.topUnmatchedExistingRelationEdges.length).toBeLessThanOrEqual(
      allowed.body.data.processConstraintCoverage.summary.unmatchedExistingRelationEdgeCount,
    )
  })

  it('keeps semantic precision governance backend/admin-only', async () => {
    const app = buildApp()

    const forbidden = await supertest(app).get('/api/wbs-template-governance/semantic-precision/report')
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    vi.mocked(getCurrentCompanyMembership).mockResolvedValueOnce({ companyId: 'company-1', role: 'company_admin' })
    const allowed = await supertest(app).get('/api/wbs-template-governance/semantic-precision/report?limit=5&sample_limit=2')
    expect(allowed.status).toBe(200)
    expect(allowed.body.data.reportCode).toBe('wbs_seed_semantic_precision_governance')
    expect(allowed.body.data.businessTypeRegistryAudit).toEqual(expect.objectContaining({
      status: 'ready',
      unmappedLegacyWbsTemplateTypes: [],
    }))
    expect(allowed.body.data.summary.totalProcessLikeNodes).toBeGreaterThan(20000)
    expect(allowed.body.data.summary.byCatalogGroup.core_quality).toBeGreaterThan(0)
    expect(allowed.body.data.summary.byCatalogGroup.specialty).toBeGreaterThan(0)
    expect(allowed.body.data.summary.p0Open).toBeGreaterThan(0)
    expect(allowed.body.data.summary.p0Open).toBeLessThanOrEqual(80)
    expect(allowed.body.data.summary.p1Open).toBeGreaterThan(100)
    expect(allowed.body.data.summary.p1Open).toBeLessThanOrEqual(700)
    expect(allowed.body.data.summary.p2Open).toBeLessThanOrEqual(10)
    expect(allowed.body.data.summary.findings.bySeverity.P0).toBe(allowed.body.data.summary.p0Open)
    expect(allowed.body.data.summary.findings.bySeverity.P1).toBe(allowed.body.data.summary.p1Open)
    expect(allowed.body.data.summary.findings.bySeverity.P2).toBe(allowed.body.data.summary.p2Open)
    expect(allowed.body.data.summary.findings.byRuleCode.non_physical_text_marked_physical).toBeGreaterThan(0)
    expect(allowed.body.data.governancePolicy.broadKeywordRuleExpansionAllowed).toBe(false)
    expect(allowed.body.data.governancePolicy.projectFeedbackCreatesCandidateOnly).toBe(true)
    expect(allowed.body.data.governancePolicy.physicalWorkDecisionSource).toBe('executionNature_only')
    expect(allowed.body.data.governancePolicy.dependencyAnchorModes).toEqual([
      'duration_bearing',
      'quality_gate',
      'handover_marker',
    ])
    expect(Array.isArray(allowed.body.data.samplingBuckets)).toBe(true)
    expect(allowed.body.data.findings.length).toBeLessThanOrEqual(5)
    expect((allowed.body.data.samplingBuckets[0]?.samples ?? []).length).toBeLessThanOrEqual(2)
  })

  it('keeps seed architecture governance backend/admin-only', async () => {
    const app = buildApp()

    const forbidden = await supertest(app).get('/api/wbs-template-governance/seed-architecture/report')
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.error.code).toBe('FORBIDDEN')

    vi.mocked(getCurrentCompanyMembership).mockResolvedValueOnce({ companyId: 'company-1', role: 'company_admin' })
    const allowed = await supertest(app).get('/api/wbs-template-governance/seed-architecture/report')
    expect(allowed.status).toBe(200)
    expect(allowed.body.data.reportCode).toBe('wbs_template_seed_architecture_governance')
    expect(allowed.body.data.governancePolicy.templateSeedsAreFoundationFactsOnly).toBe(true)
    expect(allowed.body.data.governancePolicy.ordinaryFrontendExposesTechnicalSeedReports).toBe(false)
    expect(allowed.body.data.version).toBe('v1.4.22.10')
    expect(allowed.body.data.catalogIndex.nodeCount).toBeGreaterThan(20000)
    expect(allowed.body.data.catalogIndex.stableCodeCount).toBeGreaterThan(20000)
    expect(allowed.body.data.authoringRules.ruleCount).toBeGreaterThanOrEqual(8)
    expect(allowed.body.data.authoringRules.rulesMissingRequiredFieldsCount).toBe(0)
    expect(allowed.body.data.authoringRules.rulesMissingValidationSignalsCount).toBe(0)
    expect(allowed.body.data.authoringRules.ordinaryFrontendTechnicalExposureCount).toBe(0)
    expect(allowed.body.data.catalogIndex.semanticOverrideCount).toBeGreaterThanOrEqual(30)
    expect(allowed.body.data.semanticOverrides.precedence[0]).toBe('stableCode semantic override')
    expect(allowed.body.data.semanticRiskBuckets.bucketCount).toBeGreaterThanOrEqual(10)
    expect(allowed.body.data.semanticRiskBuckets.highPriorityBucketCount).toBeGreaterThanOrEqual(4)
    expect(allowed.body.data.goldenCases.caseCount).toBeGreaterThanOrEqual(24)
    expect(allowed.body.data.goldenCases.expectedOutputCaseCount).toBe(allowed.body.data.goldenCases.caseCount)
    expect(allowed.body.data.goldenCases.stableCodeExpectationCaseCount).toBe(allowed.body.data.goldenCases.caseCount)
    expect(allowed.body.data.goldenCases.strongAssertionCaseCount).toBeGreaterThanOrEqual(12)
    expect(allowed.body.data.goldenCases.failedCaseCount).toBe(0)
    expect(allowed.body.data.goldenCases.stableCodeExpectationGapCount).toBe(0)
    expect(allowed.body.data.goldenCases.strongAssertionGapCount).toBe(0)
    expect(allowed.body.data.goldenCases.cases.every((item: any) => item.expectedOutputCompleteness.requiredKeywordGroupCount >= 3)).toBe(true)
    expect(allowed.body.data.goldenCases.cases.every((item: any) => item.expectedOutputGapCount === 0)).toBe(true)
    expect(allowed.body.data.goldenCases.cases.every((item: any) => item.stableCodeExpectation.requiredStableCodeCount >= 2)).toBe(true)
    expect(allowed.body.data.goldenCases.cases.every((item: any) => item.stableCodeExpectationGapCount === 0)).toBe(true)
    expect(allowed.body.data.generatedResultAssertions.assertionCount).toBeGreaterThanOrEqual(12)
    expect(allowed.body.data.generatedResultAssertions.failedAssertionCount).toBe(0)
    expect(allowed.body.data.generatedResultAssertions.unresolvedReferenceCount).toBe(0)
    expect(allowed.body.data.generatedResultAssertions.policy.ordinaryFrontendExposesAssertionDetails).toBe(false)
    expect(allowed.body.data.replacementSuppression.replacementNodeCount).toBeGreaterThan(0)
    expect(allowed.body.data.replacementSuppression.policy.ordinaryFrontendExposesTechnicalReplacementDiff).toBe(false)
    expect(allowed.body.data.evidenceRefs.missingEvidenceRefsCount).toBe(0)
    expect(allowed.body.data.evidenceRefs.exactNodeOverrides.overrideCount).toBeGreaterThanOrEqual(45)
    expect(allowed.body.data.evidenceRefs.exactNodeOverrides.unresolvedOverrideCount).toBe(0)
    expect(allowed.body.data.evidenceQuality.policyCount).toBeGreaterThanOrEqual(4)
    expect(allowed.body.data.evidenceQuality.policies.every((policy: any) => policy.missingRequiredEvidenceCount === 0)).toBe(true)
    expect(allowed.body.data.evidenceQuality.policies.every((policy: any) => policy.missingPreferredEvidenceCount === 0)).toBe(true)
    expect(allowed.body.data.evidenceQuality.policies.every((policy: any) => policy.preferredEvidenceCoverageRatio === 1)).toBe(true)
    expect(allowed.body.data.evidenceQuality.policies.every((policy: any) => policy.requiredDeliverableCount >= 5)).toBe(true)
    expect(allowed.body.data.evidenceQuality.policies.every((policy: any) => policy.completionSignalCount >= 4)).toBe(true)
    expect(allowed.body.data.applicabilityMatrix.policy.applicabilityDoesNotCreateDurationOrDependencyRules).toBe(true)
    expect(allowed.body.data.applicabilityProfiles.profileCount).toBeGreaterThanOrEqual(9)
    expect(allowed.body.data.applicabilityProfiles.playbookCount).toBe(allowed.body.data.applicabilityProfiles.profileCount)
    expect(allowed.body.data.applicabilityProfiles.preciseCombinationCount).toBe(allowed.body.data.applicabilityProfiles.profileCount)
    expect(allowed.body.data.applicabilityProfiles.scenarioCombinationCount).toBeGreaterThanOrEqual(16)
    expect(allowed.body.data.applicabilityProfiles.unresolvedCombinationReferenceCount).toBe(0)
    expect(allowed.body.data.applicabilityProfiles.unresolvedScenarioReferenceCount).toBe(0)
    expect(allowed.body.data.applicabilityProfiles.profiles.every((profile: any) => profile.playbookCompleteness.recommendationRuleCount >= 3)).toBe(true)
    expect(allowed.body.data.applicabilityProfiles.profiles.every((profile: any) => profile.playbookCompleteness.requiredFeatureFieldCount >= 5)).toBe(true)
    expect(allowed.body.data.applicabilityProfiles.profiles.every((profile: any) => profile.preciseTemplateCombination.requiredTemplateCount >= 3)).toBe(true)
    expect(allowed.body.data.methodVariantProfiles.profileCount).toBeGreaterThanOrEqual(10)
    expect(allowed.body.data.methodVariantProfiles.playbookCount).toBe(allowed.body.data.methodVariantProfiles.profileCount)
    expect(allowed.body.data.methodVariantProfiles.preciseRuleCount).toBe(allowed.body.data.methodVariantProfiles.profileCount)
    expect(allowed.body.data.methodVariantProfiles.extensionRuleCount).toBeGreaterThanOrEqual(12)
    expect(allowed.body.data.methodVariantProfiles.unresolvedPreciseRuleReferenceCount).toBe(0)
    expect(allowed.body.data.methodVariantProfiles.unresolvedExtensionRuleReferenceCount).toBe(0)
    expect(allowed.body.data.methodVariantProfiles.profiles.every((profile: any) => profile.playbookCompleteness.recommendedActionCount >= 3)).toBe(true)
    expect(allowed.body.data.methodVariantProfiles.profiles.every((profile: any) => profile.playbookCompleteness.hasNonAutoExpansionReason)).toBe(true)
    expect(allowed.body.data.methodVariantProfiles.profiles.every((profile: any) => profile.preciseRule.confirmationFieldCount >= 3)).toBe(true)
    expect(allowed.body.data.feedbackCandidatePolicies.policyCount).toBeGreaterThanOrEqual(7)
    expect(allowed.body.data.feedbackCandidatePolicies.metricPolicyCount).toBe(allowed.body.data.feedbackCandidatePolicies.policyCount)
    expect(allowed.body.data.feedbackCandidatePolicies.eventPolicyCount).toBe(allowed.body.data.feedbackCandidatePolicies.policyCount)
    expect(allowed.body.data.feedbackCandidatePolicies.orphanMetricPolicyCount).toBe(0)
    expect(allowed.body.data.feedbackCandidatePolicies.orphanEventPolicyCount).toBe(0)
    expect(allowed.body.data.feedbackCandidatePolicies.policiesMissingMetricCount).toBe(0)
    expect(allowed.body.data.feedbackCandidatePolicies.policiesMissingEventCount).toBe(0)
    expect(allowed.body.data.feedbackCandidatePolicies.policies.every((policy: any) => policy.minimumSampleSize >= 4)).toBe(true)
    expect(allowed.body.data.feedbackCandidatePolicies.policies.every((policy: any) => policy.hasCandidateOutput)).toBe(true)
    expect(allowed.body.data.feedbackCandidatePolicies.policies.every((policy: any) => policy.metricCount >= 1)).toBe(true)
    expect(allowed.body.data.candidateCalibration.available).toBe(true)
    expect(allowed.body.data.candidateCalibration.summary.acceptanceRate).toBe(0.8)
    expect(allowed.body.data.candidateCalibration.policy.acceptanceRateUsesRetainedRowsOnly).toBe(true)
    expect(allowed.body.data.candidateCalibration.policy.generatedRowsAreNotImplicitlyAccepted).toBe(true)
    expect(allowed.body.data.candidateCalibration.rows[0].calibrationStatus).toBe('upgrade_candidate_ready')
    expect(allowed.body.data.commercialQualityScore.score).toBeGreaterThan(85)
    expect(allowed.body.data.commercialQualityScore.level).toBe('commercial_ready')
    expect(allowed.body.data.commercialQualityScore.policy.scoreIsGovernanceSignalNotRuntimeBlocker).toBe(true)
    expect(allowed.body.data.versionDiff.currentSnapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(allowed.body.data.versionDiff.policy.reportIsForBackendGovernanceAndCi).toBe(true)
  })

  it('keeps P2 semantic refinements for retest documents and executable dependency references', () => {
    for (const name of [
      '砖材和砂浆配合比复验资料核验',
      '复验报告归档（混凝土小型空心砌块砌体/材料复验与砂浆试配）',
      '检测报告归档',
      '试验报告归档',
    ]) {
      const durationContributionMode = inferDurationContributionMode({ name })
      const executionNature = inferExecutionNature({ name, durationContributionMode })
      const roles = inferControlRoles({ name, durationContributionMode, executionNature })

      expect(durationContributionMode).toBe('record_only')
      expect(executionNature).toBe('document_record')
      expect(roles.documentEvidenceRole).toBe('test_report')
    }

    for (const name of [
      '砖材和砂浆配合比复验资料核验',
      '复验报告归档（混凝土小型空心砌块砌体/材料复验与砂浆试配）',
      '连接副批次复验',
      '紧固件进场复验和试装',
      '龙骨或板材进场复验',
    ]) {
      const durationContributionMode = inferDurationContributionMode({ name })
      const executionNature = inferExecutionNature({ name, durationContributionMode })
      const roles = inferControlRoles({ name, durationContributionMode, executionNature })

      expect(roles.inspectionAcceptanceRole).toBe('material_retest')
    }

    const broadDependencyReferences: Array<{ stableCode: string; field: string; code: string }> = []
    const semanticReferences: string[] = []
    const visit = (node: any) => {
      for (const { field } of DEPENDENCY_INTENT_REFERENCE_FIELDS) {
        const codes = Array.isArray(node.metadata?.[field]) ? node.metadata[field] : []
        for (const code of codes) {
          if (!/-P\d{2}(?:-S\d{2})?$/.test(String(code))) {
            broadDependencyReferences.push({ stableCode: node.stableCode, field, code })
          }
        }

        const semanticField = `semantic${field[0]?.toUpperCase() ?? ''}${field.slice(1)}`
        const semanticCodes = Array.isArray(node.metadata?.[semanticField]) ? node.metadata[semanticField] : []
        semanticReferences.push(...semanticCodes.map(String))
      }

      for (const child of node.children ?? []) visit(child)
    }

    for (const catalog of DOMAIN_WBS_TEMPLATE_CATALOGS) {
      for (const division of catalog.divisions) visit(division)
    }

    expect(broadDependencyReferences).toEqual([])
    expect(semanticReferences.some((code) => !/-P\d{2}(?:-S\d{2})?$/.test(code))).toBe(true)
  })

  it('aggregates only structurally mapped samples into reference day suggestions', async () => {
    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.completed_project_count).toBe(2)
    expect(response.body.data.sample_task_count).toBe(6)
    expect(response.body.data.matched_ad_hoc_task_count).toBe(0)
    expect(response.body.data.node_count).toBe(5)
    const baselineItemQuery = dbMock.executeSQL.mock.calls.find(([query]) => String(query).includes('FROM task_baseline_items'))
    expect(String(baselineItemQuery?.[0] ?? '')).toContain('project_id IN')

    const nodes = response.body.data.nodes
    expect(nodes.find((node: any) => node.path === '0:preparation')).toMatchObject({
      is_leaf: false,
      sample_count: 4,
      current_reference_days: 12,
      suggested_reference_days: 11,
    })
    expect(nodes.find((node: any) => node.path === '0:preparation/0:survey')).toMatchObject({
      is_leaf: true,
      sample_count: 2,
      mean_days: 8,
      median_days: 8,
      current_reference_days: 4,
      suggested_reference_days: 8,
    })
    expect(nodes.find((node: any) => node.path === '0:preparation/1:drawings')).toMatchObject({
      sample_count: 2,
      mean_days: 14,
      median_days: 14,
      current_reference_days: 15,
      suggested_reference_days: 14,
    })

    const inferenceRes = await supertest(app).get('/api/wbs-template-governance/template-1/reference-days')
    expect(inferenceRes.status).toBe(200)
    expect(inferenceRes.body.success).toBe(true)
    expect(inferenceRes.body.data.updated_count).toBe(3)
    expect(inferenceRes.body.data.feedback.nodes.find((node: any) => node.path === '1:structure')).toMatchObject({
      sample_count: 2,
      suggested_reference_days: 22,
    })
    expect(inferenceRes.body.data.nodes.some((node: any) => node.path === '0:preparation')).toBe(false)
    expect(inferenceRes.body.data.nodes.find((node: any) => node.path === '1:structure/0:typical floor cycle')).toMatchObject({
      is_leaf: true,
      suggested_reference_days: 22,
    })
  })

  it('does not collapse multi-project feedback into a project-scoped reference-days outcome', async () => {
    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    const rawQueryCalls = state.rawQuery.mock.calls as unknown as Array<[string, unknown[]]>
    const outcomeInsert = rawQueryCalls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.duration_plan_network_outcomes'),
    )
    expect(outcomeInsert).toBeUndefined()
  })

  it('rejects company-scoped templates outside the current company', async () => {
    state.template.project_id = null as any
    ;(state.template as any).company_id = 'company-2'
    ;(state.template as any).catalog_scope = 'company'
    ;(state.template as any).is_builtin = false
    ;(state.template as any).standard_catalog_code = null

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(403)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('FORBIDDEN')

    state.template.project_id = 'project-1'
    ;(state.template as any).company_id = null
    ;(state.template as any).catalog_scope = null
  })

  it('allows company-scoped templates in the current company', async () => {
    state.template.project_id = null as any
    ;(state.template as any).company_id = 'company-1'
    ;(state.template as any).catalog_scope = 'company'
    ;(state.template as any).is_builtin = false
    ;(state.template as any).standard_catalog_code = null

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.completed_project_count).toBe(2)

    state.template.project_id = 'project-1'
    ;(state.template as any).company_id = null
    ;(state.template as any).catalog_scope = null
  })

  it('allows public unscoped templates to load reference-days as read-only quality data', async () => {
    state.template.project_id = null as any
    ;(state.template as any).company_id = null
    ;(state.template as any).catalog_scope = 'project'
    ;(state.template as any).is_builtin = false
    ;(state.template as any).is_public = true
    ;(state.template as any).standard_catalog_code = null

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/reference-days')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.updated_count).toBe(3)

    const writeResponse = await supertest(app)
      .post('/api/wbs-template-governance/template-1/reference-days/confirm')
      .send({ apply_all: true })

    expect(writeResponse.status).toBe(403)
    expect(writeResponse.body.error.code).toBe('GLOBAL_TEMPLATE_WRITE_FORBIDDEN')

    state.template.project_id = 'project-1'
    ;(state.template as any).catalog_scope = null
  })

  it('allows published unscoped project catalog templates returned by the list API to load reference-days as read-only quality data', async () => {
    state.template.project_id = null as any
    ;(state.template as any).company_id = null
    ;(state.template as any).catalog_scope = 'project'
    ;(state.template as any).is_builtin = false
    ;(state.template as any).is_public = false
    ;(state.template as any).standard_catalog_code = null
    ;(state.template as any).status = 'published'
    ;(state.template as any).deleted_at = null

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/reference-days')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.updated_count).toBe(3)

    const writeResponse = await supertest(app)
      .post('/api/wbs-template-governance/template-1/reference-days/confirm')
      .send({ apply_all: true })

    expect(writeResponse.status).toBe(403)
    expect(writeResponse.body.error.code).toBe('GLOBAL_TEMPLATE_WRITE_FORBIDDEN')

    state.template.project_id = 'project-1'
    ;(state.template as any).catalog_scope = null
    ;(state.template as any).status = undefined
    ;(state.template as any).deleted_at = undefined
  })

  it('confirms reference days and writes them back into template JSON', async () => {
    const app = buildApp()
    const response = await supertest(app)
      .post('/api/wbs-template-governance/template-1/reference-days/confirm')
      .send({ apply_all: true })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.updated_count).toBe(3)
    expect(response.body.data.reference_days).toBe(44)
    const updateCall = dbMock.executeSQL.mock.calls.find(([query]) => String(query).includes('UPDATE wbs_templates'))
    expect(String(updateCall?.[0] ?? '')).toContain('WHERE id = ? AND project_id = ?')

    const template = state.template
    expect(template.reference_days).toBe(44)
    const root = template.template_data[0]
    expect(root.reference_days).toBe(12)
    expect(root.children[0].reference_days).toBe(8)
    expect(root.children[1].reference_days).toBe(14)
    expect(template.template_data[1].reference_days).toBe(30)
    expect(template.template_data[1].children[0].reference_days).toBe(22)

    expect(template.template_data).toEqual([
      expect.objectContaining({
        title: 'Preparation',
        reference_days: 12,
        children: [
          expect.objectContaining({ title: 'Survey', reference_days: 8 }),
          expect.objectContaining({ title: 'Drawings', reference_days: 14 }),
        ],
      }),
      expect.objectContaining({
        title: 'Structure',
        reference_days: 30,
        children: [
          expect.objectContaining({ title: 'Typical floor cycle', reference_days: 22 }),
        ],
      }),
    ])
  })

  it('can confirm only selected paths', async () => {
    const app = buildApp()
    await supertest(app)
      .post('/api/wbs-template-governance/template-1/reference-days/confirm')
      .send({ apply_all: false, selected_paths: ['0:preparation/1:drawings'] })

    expect(state.template.template_data[0].reference_days).toBe(12)
    expect(state.template.template_data[0].children[0].reference_days).toBe(4)
    expect(state.template.template_data[0].children[1].reference_days).toBe(14)
  })

  it('rejects invalid selected_paths payloads before mutation', async () => {
    const app = buildApp()
    const beforeTemplate = JSON.stringify(state.template.template_data)

    const response = await supertest(app)
      .post('/api/wbs-template-governance/template-1/reference-days/confirm')
      .send({ apply_all: false, selected_paths: '0:preparation/1:drawings' })

    expect(response.status).toBe(400)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('VALIDATION_ERROR')
    expect(JSON.stringify(state.template.template_data)).toBe(beforeTemplate)
  })

  it('uses baseline mapping even when project task names are noisy', async () => {
    state.template.template_data = [
      {
        title: 'Preparation',
        source_id: 'node-prep',
        reference_days: 12,
        children: [
          { title: 'Survey', source_id: 'node-survey', reference_days: 4 },
          { title: 'Drawings', source_id: 'node-drawings', reference_days: 15 },
        ],
      },
    ]
    state.template.wbs_nodes = JSON.parse(JSON.stringify(state.template.template_data))
    state.tasks = [
      {
        id: 'task-survey-1',
        project_id: 'project-1',
        title: 'Field batch A',
        baseline_item_id: 'baseline-survey-1',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-06T00:00:00.000Z',
      },
      {
        id: 'task-survey-2',
        project_id: 'project-2',
        title: 'Onsite renamed survey execution',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'task-drawings-1',
        project_id: 'project-1',
        title: 'Design package round 1',
        baseline_item_id: 'baseline-drawings-1',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-20T00:00:00.000Z',
      },
      {
        id: 'task-drawings-2',
        project_id: 'project-2',
        title: 'Second issue package',
        baseline_item_id: 'baseline-drawings-2',
        status: 'completed',
        actual_start_date: '2026-03-10T00:00:00.000Z',
        actual_end_date: '2026-03-24T00:00:00.000Z',
      },
    ]
    state.baselineItems = [
      { id: 'baseline-survey-1', source_task_id: 'node-survey' },
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
      { id: 'baseline-drawings-1', source_task_id: 'node-drawings' },
      { id: 'baseline-drawings-2', source_task_id: 'node-drawings' },
    ]

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.sample_task_count).toBe(4)
    expect(response.body.data.matched_ad_hoc_task_count).toBe(0)

    const nodes = response.body.data.nodes
    expect(nodes.find((node: any) => node.path === '0:preparation/0:survey')).toMatchObject({
      sample_count: 2,
      mean_days: 7,
      median_days: 7,
      suggested_reference_days: 7,
    })
    expect(nodes.find((node: any) => node.path === '0:preparation/1:drawings')).toMatchObject({
      sample_count: 2,
      mean_days: 13,
      median_days: 13,
      suggested_reference_days: 13,
    })
  })

  it('includes completed ad_hoc tasks when they map cleanly to a template node title', async () => {
    state.tasks = [
      {
        id: 'task-ad-hoc-survey',
        project_id: 'project-1',
        title: 'Survey',
        task_source: 'ad_hoc',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-06T00:00:00.000Z',
      },
      {
        id: 'task-structured-survey',
        project_id: 'project-2',
        title: 'Field batch',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-09T00:00:00.000Z',
      },
    ]
    state.baselineItems = [
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
    ]

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.sample_task_count).toBe(2)
    expect(response.body.data.matched_ad_hoc_task_count).toBe(1)
    expect(response.body.data.nodes.find((node: any) => node.path === '0:preparation/0:survey')).toMatchObject({
      sample_count: 2,
      suggested_reference_days: 8,
    })
  })

  it('includes completed ad_hoc tasks when the title loosely matches a unique template leaf', async () => {
    state.tasks = [
      {
        id: 'task-ad-hoc-survey-loose',
        project_id: 'project-1',
        title: 'Site survey temporary follow-up',
        task_source: 'ad_hoc',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-05T00:00:00.000Z',
      },
      {
        id: 'task-structured-survey',
        project_id: 'project-2',
        title: 'Field batch',
        baseline_item_id: 'baseline-survey-2',
        status: 'completed',
        actual_start_date: '2026-03-01T00:00:00.000Z',
        actual_end_date: '2026-03-09T00:00:00.000Z',
      },
    ]
    state.baselineItems = [
      { id: 'baseline-survey-2', source_task_id: 'node-survey' },
    ]

    const app = buildApp()
    const response = await supertest(app).get('/api/wbs-template-governance/template-1/feedback')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.sample_task_count).toBe(2)
    expect(response.body.data.matched_ad_hoc_task_count).toBe(1)
    expect(response.body.data.nodes.find((node: any) => node.path === '0:preparation/0:survey')).toMatchObject({
      sample_count: 2,
      suggested_reference_days: 7,
    })
  })
})
