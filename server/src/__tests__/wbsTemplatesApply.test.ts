import { beforeEach, describe, expect, it, vi } from 'vitest'

const learningMocks = vi.hoisted(() => ({
  callOrder: [] as string[],
  runtimePublicationFixtures: [] as Array<Record<string, unknown>>,
  persistRuntimeConsumptions: vi.fn(async (_input: unknown) => ({ requestedCount: 0, insertedCount: 0, records: [] })),
  enqueueEvidence: vi.fn(async ({ events }: { events: unknown[] }) => ({
    requestedCount: events.length,
    persistedCount: events.length,
    eventKeys: events.map((_, index) => `outbox-event-${index + 1}`),
  })),
  buildWbsCandidateEvent: vi.fn((input: any) => ({
    eventType: 'wbs_candidate',
    companyId: input.companyId,
    projectId: input.projectId,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    publicationKey: null,
    artifactKey: input.candidate?.templateId ?? null,
    inputTaskIds: [],
    payload: input.candidate,
  })),
  buildSpecialWorkDurationCandidateNodes: vi.fn(() => []),
}))

const mocks = vi.hoisted(() => {
  const insertedTasks: any[][] = []
  const insertedSupabaseRows: Record<string, any[]> = {
    task_baselines: [],
    task_baseline_items: [],
  }
  const generatedRowCalls: any[] = []
  const transactionEvents: string[] = []
  let failTransactionInsertTableName: string | null = null
  const latestBaselineVersions = [7]
  const sqlCalls: Array<{ query: string; params: any[] }> = []
  const rowsFor = (tableName: string) => {
    insertedSupabaseRows[tableName] ??= []
    return insertedSupabaseRows[tableName]
  }
  const cloneTableLengths = () => Object.fromEntries(
    Object.entries(insertedSupabaseRows).map(([tableName, rows]) => [tableName, rows.length]),
  )
  const restoreTableLengths = (lengths: Record<string, number>) => {
    for (const [tableName, length] of Object.entries(lengths)) {
      rowsFor(tableName).length = length
    }
  }
  const parseTransactionInsert = (sql: string, params: unknown[]) => {
    const match = sql.match(/^INSERT INTO "([^"]+)" \(([^)]+)\) VALUES/i)
    if (!match) return null
    const tableName = match[1]
    const columns = match[2].split(',').map((column) => column.trim().replace(/^"|"$/g, ''))
    const rowCount = columns.length > 0 ? Math.floor(params.length / columns.length) : 0
    const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
      const row: Record<string, unknown> = {}
      columns.forEach((column, columnIndex) => {
        row[column] = params[rowIndex * columns.length + columnIndex]
      })
      return row
    })
    return { tableName, rows }
  }
  const createTransactionClient = () => {
    let snapshot: Record<string, number> | null = null
    return {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = String(sql).trim().toUpperCase()
        if (normalized === 'BEGIN') {
          snapshot = cloneTableLengths()
          transactionEvents.push('BEGIN')
          learningMocks.callOrder.push('BEGIN')
          return { rows: [], rowCount: null }
        }
        if (normalized === 'COMMIT') {
          snapshot = null
          transactionEvents.push('COMMIT')
          learningMocks.callOrder.push('COMMIT')
          return { rows: [], rowCount: null }
        }
        if (normalized === 'ROLLBACK') {
          if (snapshot) restoreTableLengths(snapshot)
          snapshot = null
          transactionEvents.push('ROLLBACK')
          learningMocks.callOrder.push('ROLLBACK')
          return { rows: [], rowCount: null }
        }

        const insert = parseTransactionInsert(String(sql), params)
        if (insert) {
          if (failTransactionInsertTableName === insert.tableName) {
            throw new Error(`simulated ${insert.tableName} transaction insert failure`)
          }
          rowsFor(insert.tableName).push(...insert.rows)
          return { rows: insert.rows, rowCount: insert.rows.length }
        }

        return { rows: [], rowCount: 0 }
      }),
      release: vi.fn(),
    }
  }
  const createSupabaseQuery = (tableName = '') => {
    const filters: Array<{ column: string; value: unknown }> = []
    let selectedColumns = ''
    const resolveRows = async () => {
      if (tableName === 'wbs_templates') {
        const templateId = String(filters.find((filter) => filter.column === 'id')?.value ?? 'template-1')
        if (templateId === 'template-hospital') {
          return {
            data: [
              {
                id: templateId,
                project_id: null,
                company_id: null,
                catalog_scope: 'system',
                is_builtin: true,
                standard_catalog_code: 'hospital_master_plan_entry',
                is_default: false,
                deleted_at: null,
                template_name: '医院工程默认主计划模板',
                name: '医院工程默认主计划模板',
                description: '医院项目默认主计划入口模板',
                template_type: 'hospital',
                category: '医院',
                status: 'published',
                wbs_nodes: [
                  {
                    id: 'node-hospital-root',
                    name: '医院工程主计划入口',
                    description: '用于验证医院项目不再走 legacy 串行模板路径',
                    reference_days: 240,
                  },
                ],
              },
            ],
            error: null,
          }
        }

        if (templateId === 'template-school') {
          return {
            data: [
              {
                id: templateId,
                project_id: null,
                company_id: null,
                catalog_scope: 'system',
                is_builtin: true,
                standard_catalog_code: 'school_master_plan_entry',
                is_default: false,
                deleted_at: null,
                template_name: '学校默认主计划入口模板',
                name: '学校默认主计划入口模板',
                description: '学校项目默认主计划入口模板',
                template_type: '公共建筑',
                category: '学校',
                status: 'published',
                wbs_nodes: [
                  {
                    id: 'node-school-root',
                    name: '学校工程主计划入口',
                    description: '用于验证向导项目事实可进入默认主计划',
                    reference_days: 180,
                  },
                ],
              },
            ],
            error: null,
          }
        }

        if (templateId === 'template-legacy-simple') {
          return {
            data: [
              {
                id: templateId,
                project_id: 'project-1',
                company_id: null,
                template_name: '历史两级任务模板',
                name: '历史两级任务模板',
                description: '旧模板接管验证',
                template_type: 'custom',
                category: '历史模板',
                status: 'published',
                wbs_nodes: [
                  {
                    id: 'legacy-root',
                    name: '一级任务',
                    description: '旧模板一级任务',
                    reference_days: 10,
                    children: [
                      {
                        id: 'legacy-child',
                        name: '二级任务',
                        description: '旧模板二级任务',
                        reference_days: 5,
                      },
                    ],
                  },
                ],
              },
            ],
            error: null,
          }
        }

        if (templateId === 'template-conflicting-hospital') {
          return {
            data: [
              {
                id: templateId,
                project_id: null,
                company_id: null,
                catalog_scope: 'system',
                is_builtin: true,
                standard_catalog_code: 'hospital_master_plan_entry',
                is_default: false,
                deleted_at: null,
                template_name: '医院工程旧模板',
                name: '医院工程旧模板',
                description: '与住宅项目业态冲突的旧模板',
                template_type: 'hospital',
                category: '医院',
                status: 'published',
                wbs_nodes: [
                  {
                    id: 'conflicting-root',
                    name: '医院工程任务',
                    description: '冲突模板一级任务',
                    reference_days: 120,
                  },
                ],
              },
          ],
          error: null,
        }
      }

      if (templateId === 'template-residential-ordinary') {
        return {
          data: [
            {
              id: templateId,
              project_id: 'project-1',
              company_id: null,
              template_name: '普通住宅模板',
              name: '普通住宅模板',
              description: '普通住宅模板，不是显式默认主计划入口',
              template_type: 'residential',
              category: '住宅',
              status: 'published',
              wbs_nodes: [
                {
                  id: 'ordinary-root',
                  name: '普通住宅任务',
                  description: '普通住宅一级任务',
                  reference_days: 30,
                },
              ],
            },
          ],
          error: null,
        }
      }

      if (templateId === 'template-system-standard') {
        return {
          data: [
            {
              id: templateId,
              project_id: null,
              company_id: null,
              catalog_scope: 'national',
              is_builtin: true,
              standard_catalog_code: 'china-gb55032-2022',
              is_default: false,
              deleted_at: null,
              template_name: '住宅工程国家标准模板',
              name: '住宅工程国家标准模板',
              description: '系统标准模板，但不是默认主计划入口',
              template_type: 'residential',
              category: '住宅',
              status: 'published',
              wbs_nodes: [
                {
                  id: 'standard-root',
                  name: '标准条文任务',
                  description: '普通系统标准模板任务',
                  reference_days: 30,
                },
              ],
            },
          ],
          error: null,
        }
      }

      if (templateId === 'template-generic-default-entry') {
        return {
          data: [
            {
              id: templateId,
              project_id: null,
              company_id: null,
              catalog_scope: 'system',
              is_builtin: true,
              standard_catalog_code: 'default_master_plan_generic_entry',
              is_default: false,
              deleted_at: null,
              template_name: '通用默认主计划入口',
              name: '通用默认主计划入口',
              description: '缺少可识别业态的默认主计划入口',
              template_type: 'custom',
              category: '通用',
              status: 'published',
              wbs_nodes: [
                {
                  id: 'generic-root',
                  name: '通用默认主计划任务',
                  description: '通用入口不应由项目事实托底',
                  reference_days: 30,
                },
              ],
            },
          ],
          error: null,
        }
      }

      if (templateId === 'template-generic-residential-default-entry') {
        return {
          data: [
            {
              id: templateId,
              project_id: null,
              company_id: null,
              catalog_scope: 'system',
              is_builtin: true,
              standard_catalog_code: 'default_master_plan_generic_entry',
              is_default: false,
              deleted_at: null,
              template_name: '住宅默认主计划泛入口',
              name: '住宅默认主计划泛入口',
              description: '泛入口即使带住宅文本，也不能替代显式住宅主计划入口',
              template_type: 'residential',
              category: '住宅',
              status: 'published',
              wbs_nodes: [
                {
                  id: 'generic-residential-root',
                  name: '住宅默认主计划泛入口任务',
                  description: '泛入口不应通过文字匹配进入生成链',
                  reference_days: 30,
                },
              ],
            },
          ],
          error: null,
        }
      }

      if (templateId === 'template-draft-default-entry') {
        return {
          data: [
            {
              id: templateId,
              project_id: null,
              company_id: null,
              catalog_scope: 'system',
              is_builtin: true,
              standard_catalog_code: 'residential_master_plan_v2',
              is_default: true,
              deleted_at: null,
              template_name: '住宅默认主计划草稿入口',
              name: '住宅默认主计划草稿入口',
              description: '草稿入口不能进入默认主计划生成链',
              template_type: 'residential',
              category: '住宅',
              status: 'draft',
              wbs_nodes: [
                {
                  id: 'draft-root',
                  name: '草稿默认主计划入口任务',
                  description: '草稿入口应直接失败',
                  reference_days: 30,
                },
              ],
            },
          ],
          error: null,
        }
      }

      if (templateId === 'template-draft-status-default-entry') {
        return {
          data: [
            {
              id: templateId,
              project_id: null,
              company_id: null,
              catalog_scope: 'system',
              is_builtin: true,
              standard_catalog_code: 'residential_master_plan_v2',
              is_default: false,
              deleted_at: null,
              template_name: '住宅默认主计划状态草稿入口',
              name: '住宅默认主计划状态草稿入口',
              description: 'status=draft 的入口不能进入默认主计划生成链',
              template_type: 'residential',
              category: '住宅',
              status: 'draft',
              wbs_nodes: [
                {
                  id: 'draft-status-root',
                  name: '状态草稿默认主计划入口任务',
                  description: '状态草稿入口应直接失败',
                  reference_days: 30,
                },
              ],
            },
          ],
          error: null,
        }
      }

        return {
          data: [
            {
              id: templateId,
              project_id: null,
              company_id: null,
              catalog_scope: 'system',
              is_builtin: true,
              standard_catalog_code: 'residential_master_plan_v2',
              is_default: false,
              deleted_at: null,
              template_name: '高层住宅（地库+塔楼）WBS模板',
              name: '高层住宅（地库+塔楼）WBS模板',
              description: '住宅模板',
              template_type: 'residential',
              category: '住宅',
              status: 'published',
              wbs_nodes: [
                {
                  id: 'node-root',
                  name: '主体结构',
                  description: '住宅主体结构',
                  reference_days: 120,
                },
              ],
            },
          ],
          error: null,
        }
      }

      if (tableName === 'task_baselines' && selectedColumns.includes('version')) {
        return {
          data: latestBaselineVersions.map((version) => ({ version })),
          error: null,
        }
      }

      return { data: [], error: null }
    }
    const query: any = {
      select: vi.fn((columns?: string) => {
        selectedColumns = String(columns ?? '')
        return query
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value })
        return query
      }),
      is: vi.fn(() => query),
      in: vi.fn(() => query),
      not: vi.fn(() => query),
      gte: vi.fn(() => query),
      lte: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      insert: vi.fn(async (payload: any) => {
        rowsFor(tableName).push(...(Array.isArray(payload) ? payload : [payload]))
        return { data: payload, error: null }
      }),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      single: vi.fn(async () => {
        const id = filters.find((filter) => filter.column === 'id')?.value
        const row = id
          ? rowsFor(tableName).find((item) => item.id === id)
          : rowsFor(tableName)[0]
        return { data: row ?? null, error: null }
      }),
      then: (resolve: any, reject: any) => resolveRows().then(resolve, reject),
    }
    return query
  }

  return {
    insertedTasks,
    insertedSupabaseRows,
    generatedRowCalls,
    transactionEvents,
    latestBaselineVersions,
    sqlCalls,
    setFailTransactionInsertTableName: (tableName: string | null) => {
      failTransactionInsertTableName = tableName
    },
    createSupabaseQuery,
    createTransactionClient,
    getTask: vi.fn(),
    executeSQL: vi.fn(async (query: string, params: any[] = []) => {
      sqlCalls.push({ query, params })

      if (query.includes('SELECT id FROM tasks WHERE project_id = ?')) {
        return [{ id: 'old-task-1' }]
      }

      if (query.includes('DELETE FROM tasks WHERE project_id = ?')) {
        return []
      }

      if (query.includes('INSERT INTO tasks')) {
        insertedTasks.push(params)
        return []
      }

      if (query.includes('UPDATE wbs_templates SET usage_count = ?')) {
        return []
      }

      return []
    }),
    executeSQLOne: vi.fn(async (query: string, params: any[] = []) => {
      if (query.includes('FROM wbs_templates WHERE id = ?')) {
        return {
          id: params[0],
          template_name: '商业综合体WBS模板',
          usage_count: 2,
          deleted_at: null,
          wbs_nodes: [
            {
              name: '一级任务',
              description: '根节点',
              children: [
                {
                  name: '二级任务',
                  description: '子节点',
                },
              ],
            },
          ],
        }
      }

      if (query.includes('FROM projects WHERE id = ?')) {
        if (params[0] === 'project-hospital') {
          return {
            id: params[0],
            company_id: '10000000-0000-4000-8000-000000000001',
            name: '三栋医院综合楼测试项目',
            status: 'planning',
            project_type: '医院建设',
            building_type: '医院',
            structure_type: '框架核心筒',
            building_count: 3,
            above_ground_floors: 18,
            underground_floors: 2,
            total_area: 120000,
            planned_start_date: '2026-07-01',
            planned_end_date: '2028-03-31',
            start_date: null,
            actual_start_date: null,
            current_phase: 'planning',
            default_wbs_generated: false,
            metadata: {
              businessType: 'hospital',
              projectTypeCode: 'hospital',
              structureTypeCode: 'frame_core',
              methodVariantCodes: ['pile_foundation', 'vertical_retaining_support', 'no_horizontal_strut'],
              buildingPatternCodes: ['multi_tower_shared_podium'],
              functionalUsageCodes: ['hospital'],
              functionalCategoryCodes: ['cleanroom'],
              specialRoomTypeCodes: ['cleanroom', 'operating_room'],
              physicalZoneTypeCodes: ['tower', 'basement'],
              hardConstraintCodes: [],
              projectFeatures: {
                foundationFormCodes: ['bored_pile', 'diaphragm_wall'],
              },
            },
          }
        }

        if (params[0] === 'project-school-wizard') {
          return {
            id: params[0],
            company_id: '10000000-0000-4000-8000-000000000001',
            name: '向导学校测试项目',
            status: 'planning',
            project_type: null,
            building_type: null,
            structure_type: null,
            building_count: null,
            above_ground_floors: null,
            underground_floors: null,
            total_area: null,
            planned_start_date: '2026-07-01',
            planned_end_date: '2027-03-31',
            start_date: null,
            actual_start_date: null,
            current_phase: 'planning',
            default_wbs_generated: false,
            metadata: {
              wizard_business_type: 'school',
              wizard_detail_level: 'overview',
              projectGenerationFacts: {
                businessType: 'school',
                detailLevel: 'overview',
                buildingCount: 1,
                totalAreaM2: 8000,
                basementAreaM2: 800,
                aboveGroundAreaM2: 7200,
                basementLevelCount: 1,
                standardFloorCount: 3,
                highestBuildingFloorCount: 3,
                structureTypeCode: 'frame',
                methodVariantCodes: ['cast_in_situ'],
                functionalUsageCodes: ['教学楼'],
                physicalZoneTypeCodes: ['outdoor_site_plan', 'substation'],
                projectFeatures: {
                  structureTypeCode: 'frame',
                  methodVariantCodes: ['cast_in_situ'],
                  functionalUsageCodes: ['教学楼'],
                  physicalZoneTypeCodes: ['outdoor_site_plan', 'substation'],
                },
              },
            },
          }
        }

        return {
          id: params[0],
          company_id: '10000000-0000-4000-8000-000000000001',
          name: '三栋高层住宅测试项目',
          status: 'planning',
          project_type: '住宅开发',
          building_type: '住宅',
          structure_type: '框架剪力墙',
          building_count: 3,
          above_ground_floors: 26,
          underground_floors: 1,
          total_area: 90000,
          planned_start_date: '2026-07-01',
          planned_end_date: '2027-12-31',
          start_date: null,
          actual_start_date: null,
          current_phase: 'planning',
          default_wbs_generated: false,
          metadata: {
            businessType: 'general_civil',
            businessSubtype: 'civil_residential',
            projectTypeCode: 'residential',
            structureTypeCode: 'frame_shear',
            methodVariantCodes: ['cast_in_situ', 'bored_pile', 'diaphragm_wall'],
            projectFeatures: {
              foundationFormCodes: ['bored_pile', 'diaphragm_wall'],
            },
          },
        }
      }

      return null
    }),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock('../services/dbService.js', () => ({
  registerDbServiceBusinessSideEffectAdapters: vi.fn(),
  assertDbServiceBusinessSideEffectAdaptersRegistered: vi.fn(),
  executeSQL: mocks.executeSQL,
  executeSQLOne: mocks.executeSQLOne,
  supabase: {
    from: (tableName: string) => mocks.createSupabaseQuery(tableName),
  },
  SupabaseService: class {},
  getProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  getTasks: vi.fn(),
  getTask: mocks.getTask,
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  getRisks: vi.fn(),
  getRisk: vi.fn(),
  createRisk: vi.fn(),
  updateRisk: vi.fn(),
  deleteRisk: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: vi.fn(async () => mocks.createTransactionClient()),
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
}))

vi.mock('../services/durationLearningRuntimeConsumptionService.js', () => ({
  persistDurationLearningRuntimeConsumptions: learningMocks.persistRuntimeConsumptions,
}))

vi.mock('../services/durationLearningRuntimeEvidenceOutboxService.js', () => ({
  buildWbsCandidateOutboxEvent: learningMocks.buildWbsCandidateEvent,
  enqueueDurationLearningRuntimeEvidenceBatch: learningMocks.enqueueEvidence,
}))

vi.mock('../services/wbsTemplateCandidateEventService.js', () => ({
  buildSpecialWorkDurationCandidateNodes: learningMocks.buildSpecialWorkDurationCandidateNodes,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
  requestLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  optionalAuthenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'owner-1' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: class {
    getProjects = vi.fn(async () => [])
    getProject = vi.fn(async () => null)
    createProject = vi.fn(async () => null)
    updateProject = vi.fn(async () => null)
    deleteProject = vi.fn(async () => true)
    getTasks = vi.fn(async () => [])
    getTask = vi.fn(async () => null)
    createTask = vi.fn(async () => null)
    updateTask = vi.fn(async () => null)
    deleteTask = vi.fn(async () => true)
    getRisks = vi.fn(async () => [])
    getRisk = vi.fn(async () => null)
    createRisk = vi.fn(async () => null)
    updateRisk = vi.fn(async () => null)
    deleteRisk = vi.fn(async () => true)
  },
}))

vi.mock('../services/wbsTemplateGenerationService.js', () => {
  const buildRow = (overrides: {
    id: string
    title: string
    source?: string
    start?: string
    end?: string
    sortOrder?: number
    predecessorDependencies?: any[]
    templateNodeId?: string | null
  }) => {
    const source = overrides.source ?? 'asset_backed_default_master_plan'
    const isAssetBackedDefaultMasterPlan = source === 'asset_backed_default_master_plan'
      || source === 'managed_frontier_default_master_plan'
    const sortOrder = overrides.sortOrder ?? 0
    return {
      clientRowId: overrides.id,
      parentClientRowId: null,
      rowProjectionMode: 'schedule_row',
      scheduleParticipation: 'primary_schedule',
      planItemKind: 'work_task',
      executionPhase: 'mock_phase',
      executionLane: 'mock_lane',
      sortOrder,
      predecessorClientRowIds: [],
      predecessorDependencies: overrides.predecessorDependencies ?? [],
      values: {
        title: overrides.title,
        template_id: 'china-gb55032-2022',
        template_node_id: overrides.templateNodeId ?? null,
        row_projection_mode: 'schedule_row',
        schedule_participation: 'primary_schedule',
        sort_order: sortOrder,
        planned_start_date: overrides.start ?? '2026-07-01',
        planned_end_date: overrides.end ?? '2026-07-07',
        duration_evidence_source: 'candidate_default_master_plan_baseline',
        duration_calibration_source: isAssetBackedDefaultMasterPlan
          ? 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence'
          : 'cold_start_baseline',
        duration_review_gate: 'GENERATION_DEPTH_TRUST_REVIEW_REQUIRED',
        duration_suggestion: {
          recommendedDurationDays: 7,
          durationOutputCode: 'governed_duration_candidate',
          planDurationTruthSource: isAssetBackedDefaultMasterPlan
            ? 'asset_backed_candidate_master_plan'
            : 'candidate_default_master_plan_baseline',
          factorAvailability: isAssetBackedDefaultMasterPlan
            ? {
                standard_work_duration_seed: true,
                t2_division_rhythm_template_seed: true,
                external_real_plan_evidence: true,
              }
            : undefined,
          dataUpgradeBlockedBy: ['GENERATION_DEPTH_TRUST_REVIEW_REQUIRED'],
        },
        standard_task_metadata: {
          source,
          rowProjectionMode: 'schedule_row',
          scheduleParticipation: 'primary_schedule',
          planItemKind: 'work_task',
          ...(isAssetBackedDefaultMasterPlan
            ? {
                masterPlanGeneration: {
                  source: 'real_plan_evidence_asset_backed_master_plan_v1',
                  entryTemplateCode: source === 'asset_backed_default_master_plan'
                    ? 'residential_master_plan_v2'
                    : 'managed_frontier_default_master_plan',
                  generatorAssetPolicy: 'real_plan_skeleton_plus_duration_rhythm_dependency_assets',
                },
                durationAssetMapping: {
                  source: 'real_plan_evidence_asset_backed_master_plan_v1',
                  standardWorkDurationSeedStableCode: 'site_setup_temp_works',
                  standardWorkDurationSeedVersion: 'v1.4.23-standard-work-duration-20260526',
                  t2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
                  t2RhythmTemplateVersion: 'v1.4.23.1-t2-division-rhythm-cold-start-20260622',
                  externalPlanEvidenceRefs: [
                    'project-search/logs/2026-06-30-real-construction-schedule-shape.md',
                  ],
                },
              }
            : {}),
          ...(source === 'managed_frontier_default_master_plan'
            ? {
                businessTypeMasterPlan: {
                  source: 'managed_frontier_default_master_plan',
                  profileSourceType: overrides.id.includes('row-nonres-base-')
                    ? 'business_type_base_master_plan_profile_v1'
                    : 'business_type_master_plan_profile_v1',
                },
              }
            : {}),
          generationDepthPolicy: {
            governance: {
              mutationBoundary: {
                writesTasks: false,
                writesTaskDependencies: false,
                writesCriticalPathFacts: false,
                writesRuntimePublication: false,
              },
            },
          },
        },
      },
    }
  }

  const residentialTitles = [
    '场地移交与测量控制网复核',
    '围挡大门与临时道路施工',
    '临建办公生活区搭设',
    '施工用水用电接入与临电验收',
    '塔吊基础施工',
    '塔吊安装验收与投入使用',
    '基坑支护与降排水准备',
    '钻孔灌注桩施工',
    '土方开挖与边坡监测',
    '基坑验槽与垫层施工',
    '地下室底板防水与钢筋施工',
    '地下室结构施工',
    '地下室结构验收与出正负零',
    '1#楼首层及转换层结构',
    '1#楼主体结构标准层循环',
    '1#楼屋面层与机房结构',
    '1#楼主体结构验收',
    '2#楼首层及转换层结构',
    '2#楼主体结构标准层循环',
    '2#楼屋面层与机房结构',
    '2#楼主体结构验收',
    '3#楼首层及转换层结构',
    '3#楼主体结构标准层循环',
    '3#楼屋面层与机房结构',
    '3#楼主体结构验收',
    '1#楼砌体与二次结构穿插',
    '2#楼砌体与二次结构穿插',
    '3#楼砌体与二次结构穿插',
    '1#楼机电预留预埋与管井立管',
    '2#楼机电预留预埋与管井立管',
    '3#楼机电预留预埋与管井立管',
    '地下室机电管线综合与设备基础',
    '消防给排水与通风系统安装',
    '屋面防水保温与屋面工程',
    '外立面与门窗封闭',
    '外立面收口与外架拆除',
    '施工电梯安装与楼层运输保障',
    '正式电梯安装',
    '电梯调试与监督检验',
    '1#楼室内抹灰地坪与粗装修',
    '2#楼室内抹灰地坪与粗装修',
    '3#楼室内抹灰地坪与粗装修',
    '1#楼户内精装与公共部位装修',
    '2#楼户内精装与公共部位装修',
    '3#楼户内精装与公共部位装修',
    '室外管网施工',
    '道路场坪与景观绿化',
    '室外综合验收准备',
    '机电系统单机调试',
    '消防联动与系统联合调试',
    '分户验收与质量问题销项',
    '规划消防人防节能专项验收',
    '竣工预验收与资料归档',
    '竣工验收与交付移交',
  ]

  const buildResidentialRows = () => residentialTitles.map((title, index) => {
    const isTowerStructure = /主体结构标准层循环/.test(title)
    const isTradeOverlap = /砌体与二次结构穿插|机电预留预埋|户内精装/.test(title)
    return buildRow({
      id: `row-residential-${index + 1}`,
      title,
      sortOrder: index,
      start: isTradeOverlap ? '2027-02-01' : '2026-07-01',
      end: isTowerStructure ? '2027-09-30' : isTradeOverlap ? '2027-08-30' : '2026-07-07',
    })
  })

  const nonResidentialBaseTitles = [
    '施工准备与现场临设完成',
    '基坑支护降水与土方开挖',
    '桩基基础与检测验收',
    '地下结构施工与出正负零',
    '主体结构施工与分区验收',
    '二次结构与砌体穿插施工',
    '屋面防水与外围护封闭',
    '机电安装与管线综合施工',
    '装饰装修与功能区样板确认',
    '电梯安装与专项检验',
    '室外管网道路与景观施工',
    '系统调试与专项验收准备',
    '竣工验收与移交准备',
  ]

  const nonResidentialProfileTitles = [
    '教学楼主体结构与功能区移交',
    '实验室通风与专业机电安装',
    '操场道路与校园室外配套',
    '竣工验收与开学移交准备',
  ]

  const buildHospitalRows = () => [
    ...nonResidentialBaseTitles.map((title, index) => buildRow({
      id: `row-nonres-base-${index + 1}`,
      title,
      source: 'managed_frontier_default_master_plan',
      sortOrder: index,
    })),
    ...nonResidentialProfileTitles.map((title, index) => buildRow({
      id: `row-nonres-profile-${index + 1}`,
      title,
      source: 'managed_frontier_default_master_plan',
      sortOrder: nonResidentialBaseTitles.length + index,
      predecessorDependencies: index === 1
        ? [{ clientRowId: 'row-nonres-base-5', dependencyType: 'FS', lagDays: 0, intentCode: 'business_type_profile_phase_anchor' }]
        : [],
    })),
  ]

  const buildPreviewRows = (operation: any) => [
    buildRow({
      id: 'row-preview-1',
      title: '模板预览计划项',
      source: 'managed_frontier_default_master_plan',
      sortOrder: 0,
    }),
  ].map((row) => ({
    ...row,
    values: {
      ...row.values,
      template_id: operation?.templateId ?? 'china-gb55032-2022',
      building_object_id: operation?.scope?.building_object_id ?? null,
    },
  }))

  const buildMockDurationAssetUtilizationSummary = (rows: any[]) => ({
    source: 'default_master_plan_duration_asset_utilization_summary',
    evidenceLevel: 'candidate_duration_asset_utilization_l1',
    mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
    scheduleRowCount: rows.length,
    standardWorkDurationSeedRowCount: rows.length,
    t2RhythmTemplateRowCount: rows.length,
    projectScaleQuantityProxyRowCount: Math.max(1, Math.floor(rows.length / 3)),
    dependencyAssetConsumedRowCount: Math.max(1, Math.floor(rows.length / 4)),
    dependencyTimingAssetConsumedRowCount: Math.max(1, Math.floor(rows.length / 4)),
    processSeasonalDurationAssetRowCount: 0,
    runtimeReferenceDaysRowCount: 0,
    constructionCalendarRowCount: rows.length,
    rowsMissingDurationAssetCount: 0,
    rowsMissingT2RhythmTemplateCount: 0,
    uniqueStandardWorkDurationSeedStableCodes: ['site_setup_temp_works'],
    uniqueT2RhythmTemplateIds: ['t2-residential-standard-floor-structure-rhythm-v1'],
    uniqueDependencyAssetStableCodes: ['mock_cross_item_workflow_asset'],
    durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
    productionWritePolicy: 'candidate_only_no_task_dependencies_write',
  })

  const buildMockCandidateNetworkEvaluation = (rows: any[]) => ({
    source: 'generated_wbs_row_candidate_network_cpm',
    networkBasis: 'generated_wbs_rows_and_candidate_dependency_preview_edges',
    projectedNetworkSpanDays: 326,
    previewEdgeCount: Math.max(1, Math.floor(rows.length / 2)),
    processConstraintRoutingCandidateEdgeCount: 1,
    unresolvedEdgeCount: 0,
    criticalGeneratedRowIds: rows.slice(0, 3).map((row) => row.clientRowId),
    materializationStatus: 'fully_mapped_read_only',
    rowSchedule: rows.slice(0, 3).map((row, index) => ({
      generatedRowId: row.clientRowId,
      startDay: index * 10,
      finishDay: index * 10 + 10,
      durationDays: 10,
      totalFloatDays: index === 0 ? 0 : 2,
      isCritical: index === 0,
    })),
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
  })

  const generateWbsTemplateRows = vi.fn(async (params: any) => {
    mocks.generatedRowCalls.push(params)
    if (Array.isArray(params.runtimeArtifactPublications)) {
      params.runtimeArtifactPublications.push(...learningMocks.runtimePublicationFixtures)
    }
    const operation = params.operation
    const generationMode = operation?.clientContext?.generationMode
    const rows = generationMode === 'residential_master_plan_v2'
      ? buildResidentialRows()
      : generationMode === 'managed_frontier_default_master_plan'
        ? buildHospitalRows()
        : buildPreviewRows(operation)
    return {
      generationBatchId: operation?.generationBatchId ?? 'batch-test',
      templateId: operation?.templateId ?? 'china-gb55032-2022',
      templateIds: operation?.templateIds ?? [operation?.templateId ?? 'china-gb55032-2022'],
      generationDepth: operation?.generationDepth ?? 'managed_frontier',
      defaultPlanOutput: operation?.projectFacts?.defaultPlanOutput ?? operation?.clientContext?.defaultPlanOutput,
      masterPlanProfile: operation?.projectFacts?.masterPlanProfile ?? operation?.clientContext?.masterPlanProfile ?? null,
      rows,
      scopeCombos: [],
      rowLimit: 200,
      rowLimitPolicy: { mode: 'test' },
      splitByPhaseApplied: false,
      generationBatches: [{ generationBatchId: operation?.generationBatchId ?? 'batch-test', scopeIndexes: [0] }],
      suppressedCoreQualityCodes: [],
      governanceWarnings: [],
      scheduleTrustGate: { status: 'candidate_review_required' },
      phaseWindows: [],
      ...(generationMode
        ? {
            durationAssetUtilizationSummary: buildMockDurationAssetUtilizationSummary(rows),
            candidateNetworkEvaluation: buildMockCandidateNetworkEvaluation(rows),
          }
        : {}),
    }
  })

  return {
    CHINA_GB55032_TEMPLATE_ID: 'china-gb55032-2022',
    CHINA_GB55032_TEMPLATE_CODE: 'china-gb55032-2022',
    CHINA_GB55032_TEMPLATE_NAME: 'GB55032 模板',
    CHINA_GB55032_TEMPLATE_SOURCE_STANDARD: 'GB55032',
    CHINA_GB55032_TEMPLATE_SOURCE_VERSION: '2022',
    buildTemplateGenerateCreateOperations: vi.fn((rows: any[]) => rows.map((row) => ({ type: 'create_row', row }))),
    generateWbsTemplatePhaseChainRows: vi.fn(async ({ operations }: any) => generateWbsTemplateRows({ operation: operations?.[0] ?? {} })),
    generateWbsTemplateRows,
    getWbsTemplateCatalogItem: vi.fn(async () => ({ id: 'china-gb55032-2022', nodes: [] })),
    listWbsTemplateCatalog: vi.fn(async () => []),
    loadWbsTemplateNodes: vi.fn(async () => []),
    validateChinaGb50300Seed: vi.fn(() => ({ valid: true, errors: [] })),
  }
})

vi.mock('uuid', () => {
  let index = 0
  const ids = ['task-root-1', 'task-child-1', 'task-extra-1']

  return {
    v4: () => ids[index++] ?? `task-${index}`,
  }
})

import { request } from './testSetup.js'

describe('wbs template apply route governance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    learningMocks.callOrder.length = 0
    learningMocks.runtimePublicationFixtures.length = 0
    learningMocks.persistRuntimeConsumptions.mockImplementation(async ({ build }: any) => {
      learningMocks.callOrder.push('TRUSTED_CONSUMPTION')
      const count = Array.isArray(build?.runtimeArtifactPublications)
        ? build.runtimeArtifactPublications.length
        : 0
      return { requestedCount: count, insertedCount: count, records: [] }
    })
    learningMocks.enqueueEvidence.mockImplementation(async ({ events }: { events: unknown[] }) => {
      learningMocks.callOrder.push('OUTBOX')
      return {
        requestedCount: events.length,
        persistedCount: events.length,
        eventKeys: events.map((_, index) => `outbox-event-${index + 1}`),
      }
    })
    mocks.insertedTasks.length = 0
    Object.values(mocks.insertedSupabaseRows).forEach((rows) => {
      rows.length = 0
    })
    mocks.generatedRowCalls.length = 0
    mocks.transactionEvents.length = 0
    mocks.setFailTransactionInsertTableName(null)
    mocks.latestBaselineVersions.splice(0, mocks.latestBaselineVersions.length, 7)
    mocks.sqlCalls.length = 0
    mocks.getTask.mockResolvedValue(null)
  })

  it('removes the direct template apply write route', async () => {
    const response = await request.post('/api/wbs-templates/template-1/apply').send({
      projectId: 'project-1',
      overwrite: true,
      engineering_object_id: 'scope-object-1',
    })

    expect(response.status).toBe(404)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('NOT_FOUND')
    expect(mocks.insertedTasks).toHaveLength(0)
  })

  it('does not mount template generation preview on the retired API path', async () => {
    const response = await request.post('/api/wbs-templates/generate-preview').send({
      projectId: 'project-1',
      selectedNodeIds: ['node-1'],
    })

    expect(response.status).toBe(404)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('NOT_FOUND')
  })

  it('serves template generation preview only from the planning template route', async () => {
    const response = await request.post('/api/planning/wbs-templates/generate-preview').send({
      projectId: 'project-1',
      templateId: 'china-gb55032-2022',
      selectedNodeIds: ['02-01-01'],
      plannedStartDate: '2026-06-01',
      scope: {
        building_object_id: 'building-1',
      },
    })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.writeMode).toBe('preview_only')
    expect(response.body.data.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'create_row' }),
      ]),
    )
    expect(response.body.data.previewRows[0]).toEqual(expect.objectContaining({
      clientRowId: expect.any(String),
      values: expect.objectContaining({
        template_id: 'china-gb55032-2022',
        building_object_id: 'building-1',
      }),
    }))
  })

  it('rebuilds attached drilldown scope and depth from the persisted parent task', async () => {
    const parentTaskId = '00000000-0000-4000-8000-000000000101'
    mocks.getTask.mockResolvedValue({
      id: parentTaskId,
      project_id: 'project-1',
      title: '主体结构施工',
      planned_start_date: '2026-07-10',
      planned_end_date: '2027-02-20',
      building_object_id: 'building-authoritative',
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'master_control' },
      },
    })

    const response = await request.post('/api/planning/wbs-templates/generate-preview').send({
      projectId: 'project-1',
      templateId: 'china-gb55032-2022',
      selectedNodeIds: ['02-01-01'],
      attachUnderRowId: parentTaskId,
      plannedStartDate: '2039-01-01',
      generationDepth: 'activity_step',
      includeActivitySteps: true,
      scope: { building_object_id: 'building-forged' },
    })

    expect(response.status).toBe(200)
    const operation = mocks.generatedRowCalls.at(-1)?.operation
    expect(operation).toEqual(expect.objectContaining({
      attachUnderRowId: parentTaskId,
      sourceParentTaskId: parentTaskId,
      plannedStartDate: '2026-07-10',
      projectPlannedEndDate: '2027-02-20',
      generationDepth: 'process',
      includeActivitySteps: false,
      drilldownMode: 'selected_children',
      drilldownGenerationLevel: 'process_detail',
      scope: { building_object_id: 'building-authoritative' },
    }))
  })

  it('rejects an attached drilldown parent from another project', async () => {
    mocks.getTask.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000102',
      project_id: 'project-2',
      building_object_id: 'building-2',
    })

    const response = await request.post('/api/planning/wbs-templates/generate-preview').send({
      projectId: 'project-1',
      templateId: 'china-gb55032-2022',
      selectedNodeIds: ['02-01-01'],
      attachUnderRowId: '00000000-0000-4000-8000-000000000102',
    })

    expect(response.status).toBe(409)
    expect(response.body.error.code).toBe('TASK_PLAN_DRILLDOWN_PROJECT_MISMATCH')
    expect(mocks.generatedRowCalls).toHaveLength(0)
  })

  it('serves public preview duration rows from governed plan-generation outputs', async () => {
    const response = await request.post('/api/planning/wbs-templates/generate-preview').send({
      projectId: 'project-1',
      operations: [
        {
          type: 'template_generate',
          generationBatchId: 'batch-public-governed-duration-output',
          templateId: 'china-gb55032-2022',
          selectedNodeIds: ['02-01-01'],
          plannedStartDate: '2026-06-01',
          scope: {
            building_object_id: 'building-1',
          },
        },
      ],
    })

    if (response.status !== 200) {
      throw new Error(`unexpected preview response: ${JSON.stringify(response.body)}`)
    }
    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    const durationRows = response.body.data.previewRows.filter((row: any) => row.values?.duration_suggestion)
    expect(durationRows.length).toBeGreaterThan(0)
    expect(durationRows.every((row: any) => row.values.duration_suggestion.durationOutputCode !== 'template_fast_estimate')).toBe(true)
  })

  it('creates template baseline drafts without consuming business version numbers', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-residential',
    })

    expect(response.status, JSON.stringify({
      body: response.body,
      warnings: mocks.logger.warn.mock.calls,
      errors: mocks.logger.error.mock.calls,
    })).toBe(201)
    expect(response.body.success).toBe(true)

    const [insertedBaseline] = mocks.insertedSupabaseRows.task_baselines
    expect(insertedBaseline).toMatchObject({
      project_id: 'project-1',
      status: 'draft',
      version: null,
    })
    expect(response.body.data.baseline.version).toBeNull()
  })

  it('routes residential default master-plan drafts through managed-frontier initial-plan rows', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-residential',
    })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data.generation_mode).toBe('residential_master_plan_v2')
    expect(response.body.data.mutation_boundary).toEqual(expect.objectContaining({
      writesProductionDependencies: false,
      writesProductionDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(response.body.data.generation_quality).toEqual(expect.objectContaining({
      status: 'initial_plan_ready',
      ready_for_user_confirmation: true,
      runtime_approval_required: false,
      generation_quality_review: expect.objectContaining({
        mode: 'offline_development_calibration',
        blocks_plan_generation: false,
        blocks_baseline_publication: false,
        unresolved_dependency_count: 0,
      }),
      mutation_boundary: expect.objectContaining({
        writesTasks: false,
        writesTaskDependencies: false,
        writesCriticalPathFacts: false,
        writesRuntimePublication: false,
      }),
    }))
    expect(response.body.data.generation_quality.duration_evidence).toEqual(expect.objectContaining({
      source: 'candidate_default_master_plan_baseline',
      calibration_source: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
      generation_source: 'real_plan_evidence_asset_backed_master_plan_v1',
      maturity: 'asset_backed_cold_start',
      covered_row_count: expect.any(Number),
      runtime_approval_required: false,
    }))
    expect(response.body.data.generation_quality.duration_evidence.covered_row_count).toBeGreaterThan(0)
    const insertedItems = mocks.insertedSupabaseRows.task_baseline_items
    expect(response.body.data.duration_asset_utilization_summary).toEqual(expect.objectContaining({
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'candidate_duration_asset_utilization_l1',
      mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
      scheduleRowCount: insertedItems.length,
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    }))
    expect(response.body.data.duration_asset_utilization_summary.standardWorkDurationSeedRowCount).toBe(insertedItems.length)
    expect(response.body.data.duration_asset_utilization_summary.t2RhythmTemplateRowCount).toBe(insertedItems.length)
    expect(response.body.data.duration_asset_utilization_summary.dependencyAssetConsumedRowCount).toBeGreaterThan(0)
    expect(response.body.data.generation_quality.duration_asset_utilization_summary).toEqual(
      response.body.data.duration_asset_utilization_summary,
    )
    expect(response.body.data.candidate_network_evaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      projectedNetworkSpanDays: 326,
      processConstraintRoutingCandidateEdgeCount: 1,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(response.body.data.generation_quality.candidate_network_evaluation).toEqual(
      response.body.data.candidate_network_evaluation,
    )
    const [insertedBaseline] = mocks.insertedSupabaseRows.task_baselines
    const insertedGovernanceMetadata = typeof insertedBaseline.governance_metadata === 'string'
      ? JSON.parse(insertedBaseline.governance_metadata)
      : insertedBaseline.governance_metadata
    expect(insertedGovernanceMetadata).toEqual(expect.objectContaining({
      source: 'generated_initial_plan_draft',
      planLifecycleStatus: 'draft_ready_for_user_confirmation',
      runtimeApprovalRequired: false,
      generationQuality: response.body.data.generation_quality,
      durationAssetUtilizationSummary: response.body.data.duration_asset_utilization_summary,
      candidateNetworkEvaluation: response.body.data.candidate_network_evaluation,
      mutationBoundary: expect.objectContaining({
        writesTasks: false,
        writesTaskDependencies: false,
        writesCriticalPathFacts: false,
        writesRuntimePublication: false,
      }),
    }))
    expect(mocks.generatedRowCalls.at(-1)?.diagnosticDurationSuggestionMode).toBe('benchmark_plan_reference')

    const titles = insertedItems.map((item) => String(item.title ?? ''))
    const titleIncludes = (keyword: string) => titles.some((title) => title.includes(keyword))
    const dateMs = (value: unknown) => new Date(String(value)).getTime()

    expect(insertedItems.length).toBeGreaterThanOrEqual(45)
    expect(insertedItems.length).toBeLessThanOrEqual(90)
    expect(titles.filter((title) => /[1-3]#楼主体结构标准层循环/.test(title))).toHaveLength(3)
    for (const keyword of ['场地移交', '塔吊', '土方开挖', '地下室结构', '砌体与二次结构穿插', '机电预留预埋', '户内精装', '室外管网', '竣工验收与交付移交']) {
      expect(titleIncludes(keyword), keyword).toBe(true)
    }
    expect(titleIncludes('危大工程识别与清单确认')).toBe(false)

    const towerStructureRows = insertedItems.filter((item) => /[1-3]#楼主体结构标准层循环/.test(String(item.title ?? '')))
    const latestTowerStructureEnd = Math.max(...towerStructureRows.map((item) => dateMs(item.planned_end_date)))
    const firstTradeOverlapStart = Math.min(
      ...insertedItems
        .filter((item) => /砌体与二次结构穿插|机电预留预埋|户内精装/.test(String(item.title ?? '')))
        .map((item) => dateMs(item.planned_start_date)),
    )

    expect(firstTradeOverlapStart).toBeLessThan(latestTowerStructureEnd)
    expect(insertedItems.every((item) => item.generation_metadata?.source === 'asset_backed_default_master_plan')).toBe(true)
    expect(insertedItems.every((item) => (
      item.generation_metadata?.masterPlanGeneration?.source === 'real_plan_evidence_asset_backed_master_plan_v1'
    ))).toBe(true)
  })

  it('fails directly for matching-business-type templates that are not explicit system entries', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-residential-ordinary',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(response.body.error.details).toEqual(expect.objectContaining({
      requiredGenerationPath: 'explicit_default_master_plan_template',
      legacyFallbackRemoved: true,
      managedFallbackRemoved: true,
    }))
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })

  it('fails directly for system templates that are not explicit default master-plan entries', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-system-standard',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(response.body.error.details).toEqual(expect.objectContaining({
      requiredGenerationPath: 'explicit_default_master_plan_template',
      legacyFallbackRemoved: true,
      managedFallbackRemoved: true,
    }))
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })

  it('fails directly for explicit entry templates that do not identify a matching business type', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-generic-default-entry',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(response.body.error.details).toEqual(expect.objectContaining({
      requiredGenerationPath: 'explicit_default_master_plan_template',
      legacyFallbackRemoved: true,
      managedFallbackRemoved: true,
    }))
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })

  it('fails directly for generic default master-plan entries even when their text matches the project business type', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-generic-residential-default-entry',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(response.body.error.details).toEqual(expect.objectContaining({
      requiredGenerationPath: 'explicit_default_master_plan_template',
      legacyFallbackRemoved: true,
      managedFallbackRemoved: true,
    }))
    expect(mocks.generatedRowCalls).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })

  it('fails directly for draft explicit default master-plan entries instead of treating low-information drafts as managed fallbacks', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-draft-default-entry',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(response.body.error.details).toEqual(expect.objectContaining({
      requiredGenerationPath: 'explicit_default_master_plan_template',
      directFailure: true,
      legacyFallbackRemoved: true,
      managedFallbackRemoved: true,
    }))
    expect(mocks.generatedRowCalls).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })

  it('fails directly for status draft explicit default master-plan entries even when legacy draft flags are false', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-draft-status-default-entry',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(response.body.error.details).toEqual(expect.objectContaining({
      requiredGenerationPath: 'explicit_default_master_plan_template',
      directFailure: true,
      legacyFallbackRemoved: true,
      managedFallbackRemoved: true,
    }))
    expect(mocks.generatedRowCalls).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })

  it('routes non-residential formal business types through managed-frontier initial-plan drafts', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-hospital',
      template_id: 'template-hospital',
    })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data.generation_mode).toBe('managed_frontier_default_master_plan')
    expect(response.body.data.default_plan_output).toBe('master_plan')
    expect(response.body.data.mutation_boundary).toEqual(expect.objectContaining({
      writesProductionDependencies: false,
      writesProductionDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(response.body.data.generation_quality).toEqual(expect.objectContaining({
      status: 'initial_plan_ready',
      ready_for_user_confirmation: true,
      runtime_approval_required: false,
      generation_quality_review: expect.objectContaining({
        mode: 'offline_development_calibration',
        blocks_plan_generation: false,
        blocks_baseline_publication: false,
        unresolved_dependency_count: 0,
      }),
    }))
    expect(response.body.data.generation_quality.duration_evidence).toEqual(expect.objectContaining({
      source: 'candidate_default_master_plan_baseline',
      calibration_source: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
      generation_source: 'real_plan_evidence_asset_backed_master_plan_v1',
      maturity: 'asset_backed_cold_start',
      runtime_approval_required: false,
    }))
    expect(response.body.data.generation_quality.duration_evidence.covered_row_count).toBeGreaterThan(0)
    const insertedItems = mocks.insertedSupabaseRows.task_baseline_items
    expect(response.body.data.duration_asset_utilization_summary).toEqual(expect.objectContaining({
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'candidate_duration_asset_utilization_l1',
      mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
      scheduleRowCount: insertedItems.length,
      standardWorkDurationSeedRowCount: insertedItems.length,
      t2RhythmTemplateRowCount: insertedItems.length,
      projectScaleQuantityProxyRowCount: expect.any(Number),
      dependencyAssetConsumedRowCount: expect.any(Number),
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    }))
    expect(response.body.data.duration_asset_utilization_summary.projectScaleQuantityProxyRowCount).toBeGreaterThan(0)
    expect(response.body.data.duration_asset_utilization_summary.dependencyAssetConsumedRowCount).toBeGreaterThan(0)
    expect(response.body.data.generation_quality.duration_asset_utilization_summary).toEqual(
      response.body.data.duration_asset_utilization_summary,
    )
    expect(response.body.data.candidate_network_evaluation).toEqual(expect.objectContaining({
      source: 'generated_wbs_row_candidate_network_cpm',
      projectedNetworkSpanDays: 326,
      processConstraintRoutingCandidateEdgeCount: 1,
      writesTaskDependencies: false,
      writesPlanDates: false,
      writesCriticalPathFacts: false,
    }))
    expect(response.body.data.generation_quality.candidate_network_evaluation).toEqual(
      response.body.data.candidate_network_evaluation,
    )
    const [insertedBaseline] = mocks.insertedSupabaseRows.task_baselines
    const insertedGovernanceMetadata = typeof insertedBaseline.governance_metadata === 'string'
      ? JSON.parse(insertedBaseline.governance_metadata)
      : insertedBaseline.governance_metadata
    expect(insertedGovernanceMetadata).toEqual(expect.objectContaining({
      source: 'generated_initial_plan_draft',
      planLifecycleStatus: 'draft_ready_for_user_confirmation',
      runtimeApprovalRequired: false,
      generationQuality: response.body.data.generation_quality,
      durationAssetUtilizationSummary: response.body.data.duration_asset_utilization_summary,
      candidateNetworkEvaluation: response.body.data.candidate_network_evaluation,
      draftWritePolicy: 'baseline_draft_only_no_task_dependency_write',
      mutationBoundary: expect.objectContaining({
        writesTasks: false,
        writesTaskDependencies: false,
        writesCriticalPathFacts: false,
        writesRuntimePublication: false,
      }),
    }))
    expect(mocks.generatedRowCalls.at(-1)?.diagnosticDurationSuggestionMode).toBe('benchmark_plan_reference')
    expect(response.body.data.generation_quality.dependency_anchors).toEqual(expect.objectContaining({
      source: 'business_type_profile_phase_anchor',
      projection_only: true,
      writes_task_dependencies: false,
      anchored_row_count: expect.any(Number),
    }))
    expect(response.body.data.generation_quality.dependency_anchors.anchored_row_count).toBeGreaterThan(0)

    expect(insertedItems.length).toBeGreaterThanOrEqual(15)
    expect(insertedItems.length).toBeLessThanOrEqual(60)
    expect(insertedItems.some((item) => /危大工程识别与清单确认/.test(String(item.title ?? '')))).toBe(false)
    expect(insertedItems.every((item) => item.generation_metadata?.candidateOnly === true)).toBe(true)
    expect(insertedItems.every((item) => item.generation_metadata?.writesTasks === false)).toBe(true)
    expect(new Set(insertedItems.map((item) => item.generation_metadata?.source))).toEqual(new Set([
      'managed_frontier_default_master_plan',
    ]))
    expect(insertedItems.some((item) => [
      'business_type_base_master_plan_profile_v1',
      'business_type_master_plan_profile_v1',
    ].includes(String(item.generation_metadata?.source ?? '')))).toBe(false)
    expect(new Set(insertedItems.map((item) => item.generation_metadata?.businessTypeMasterPlan?.profileSourceType))).toEqual(new Set([
      'business_type_base_master_plan_profile_v1',
      'business_type_master_plan_profile_v1',
    ]))
    expect(insertedItems.every((item) => (
      item.duration_calibration_source === 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence'
    ))).toBe(true)
    expect(insertedItems.every((item) => (
      item.generation_metadata?.masterPlanGeneration?.source === 'real_plan_evidence_asset_backed_master_plan_v1'
    ))).toBe(true)
    expect(insertedItems.every((item) => (
      item.generation_metadata?.durationAssetMapping?.source === 'real_plan_evidence_asset_backed_master_plan_v1'
      && item.generation_metadata?.durationAssetMapping?.standardWorkDurationSeedStableCode
      && item.generation_metadata?.durationAssetMapping?.t2RhythmTemplateId
    ))).toBe(true)
    expect(insertedItems.some((item) => item.generation_metadata?.source === 'template')).toBe(false)
  })

  it('uses wizard projectGenerationFacts when top-level project business fields are empty', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-school-wizard',
      template_id: 'template-school',
    })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.data.generation_mode).toBe('managed_frontier_default_master_plan')

    const insertedItems = mocks.insertedSupabaseRows.task_baseline_items
    expect(insertedItems.length).toBeGreaterThanOrEqual(15)
    expect(insertedItems.length).toBeLessThanOrEqual(60)
    expect(insertedItems.every((item) => item.generation_metadata?.candidateOnly === true)).toBe(true)
    expect(new Set(insertedItems.map((item) => item.generation_metadata?.source))).toEqual(new Set([
      'managed_frontier_default_master_plan',
    ]))
    expect(new Set(insertedItems.map((item) => item.generation_metadata?.businessTypeMasterPlan?.profileSourceType))).toEqual(new Set([
      'business_type_base_master_plan_profile_v1',
      'business_type_master_plan_profile_v1',
    ]))
    expect(insertedItems.some((item) => item.generation_metadata?.source === 'template')).toBe(false)
  })

  it('commits builtin cold-start baseline assets with zero trusted consumptions and a durable candidate event', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-school-wizard',
      template_id: 'template-school',
    })

    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect(learningMocks.runtimePublicationFixtures).toHaveLength(0)
    expect(learningMocks.persistRuntimeConsumptions).toHaveBeenCalledWith(expect.objectContaining({
      build: expect.objectContaining({
        consumerSurface: 'default_master_plan_baseline_draft',
        subjectType: 'baseline_item',
        runtimeArtifactPublications: [],
      }),
    }))
    expect(learningMocks.enqueueEvidence).toHaveBeenCalledWith(expect.objectContaining({
      events: [expect.objectContaining({
        eventType: 'wbs_candidate',
        subjectType: 'baseline_item',
        publicationKey: null,
        payload: expect.objectContaining({
          metadata: expect.objectContaining({
            sourceAssetLineage: expect.objectContaining({
              assetKind: 'builtin_default_master_plan',
              canonicalPublicationCount: 0,
            }),
          }),
        }),
      })],
    }))
    expect(learningMocks.callOrder).toEqual([
      'BEGIN',
      'TRUSTED_CONSUMPTION',
      'OUTBOX',
      'COMMIT',
    ])
  })

  it('persists exact canonical publication lineage and outbox evidence before the same baseline commit', async () => {
    learningMocks.runtimePublicationFixtures.push({
      assetKey: 'special_work_duration_seed',
      publicationKey: 'duration_learning_runtime:special_work_duration_seed:project-school',
      publicationStatus: 'published',
      sourceEvidenceRefs: [
        'duration_learning_runtime_publications:duration_learning_runtime:special_work_duration_seed:project-school',
      ],
      observationContext: { artifactKey: 'template-school', scopeLevel: 'project' },
    })

    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-school-wizard',
      template_id: 'template-school',
    })

    expect(response.status, JSON.stringify(response.body)).toBe(201)
    expect(learningMocks.persistRuntimeConsumptions).toHaveBeenCalledWith(expect.objectContaining({
      build: expect.objectContaining({
        companyId: '10000000-0000-4000-8000-000000000001',
        projectId: 'project-school-wizard',
        runtimeArtifactPublications: [expect.objectContaining({
          publicationKey: 'duration_learning_runtime:special_work_duration_seed:project-school',
          observationContext: expect.objectContaining({ artifactKey: 'template-school' }),
        })],
      }),
    }))
    expect(learningMocks.callOrder.indexOf('TRUSTED_CONSUMPTION')).toBeLessThan(
      learningMocks.callOrder.indexOf('OUTBOX'),
    )
    expect(learningMocks.callOrder.indexOf('OUTBOX')).toBeLessThan(
      learningMocks.callOrder.indexOf('COMMIT'),
    )
  })

  it('rolls back baseline rows when durable evidence enqueue fails', async () => {
    learningMocks.enqueueEvidence.mockImplementationOnce(async () => {
      learningMocks.callOrder.push('OUTBOX')
      throw new Error('simulated duration learning outbox failure')
    })

    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-school-wizard',
      template_id: 'template-school',
    })

    expect(response.status).toBe(500)
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
    expect(learningMocks.callOrder).toEqual([
      'BEGIN',
      'TRUSTED_CONSUMPTION',
      'OUTBOX',
      'ROLLBACK',
    ])
  })

  it('rolls back the default master-plan draft when baseline item persistence fails', async () => {
    mocks.setFailTransactionInsertTableName('task_baseline_items')

    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-school-wizard',
      template_id: 'template-school',
    })

    expect(response.status).toBe(500)
    expect(response.body.success).toBe(false)
    expect(mocks.transactionEvents).toEqual(['BEGIN', 'ROLLBACK'])
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })

  it('fails directly for low-information legacy templates instead of accepting a managed fallback', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-legacy-simple',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(response.body.error.details).toEqual(expect.objectContaining({
      requiredGenerationPath: 'explicit_default_master_plan_template',
      directFailure: true,
      legacyFallbackRemoved: true,
      managedFallbackRemoved: true,
    }))
    expect(response.body.error.details).not.toEqual(expect.objectContaining({
      controlledDegradation: expect.anything(),
    }))
    expect(response.body.error.details).not.toEqual(expect.objectContaining({
      fallbackApplied: expect.anything(),
    }))
    expect(response.body.error.details).not.toEqual(expect.objectContaining({
      handoffGenerationMode: expect.anything(),
    }))
    expect(mocks.generatedRowCalls).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })

  it('fails directly when a legacy template conflicts with the project business type', async () => {
    const response = await request.post('/api/planning/wbs-templates/bootstrap/from-template').send({
      project_id: 'project-1',
      template_id: 'template-conflicting-hospital',
    })

    expect(response.status).toBe(422)
    expect(response.body.success).toBe(false)
    expect(response.body.error.code).toBe('DEFAULT_MASTER_PLAN_PROFILE_REQUIRED')
    expect(response.body.error.details).toEqual(expect.objectContaining({
      requiredGenerationPath: 'explicit_default_master_plan_template',
      directFailure: true,
      legacyFallbackRemoved: true,
      managedFallbackRemoved: true,
    }))
    expect(response.body.error.details).not.toEqual(expect.objectContaining({
      controlledDegradation: expect.anything(),
    }))
    expect(response.body.error.details).not.toEqual(expect.objectContaining({
      fallbackApplied: expect.anything(),
    }))
    expect(response.body.error.details).not.toEqual(expect.objectContaining({
      handoffGenerationMode: expect.anything(),
    }))
    expect(mocks.generatedRowCalls).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baselines).toHaveLength(0)
    expect(mocks.insertedSupabaseRows.task_baseline_items).toHaveLength(0)
  })
})
