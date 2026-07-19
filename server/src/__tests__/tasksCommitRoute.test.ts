import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PROJECT_ID = '00000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  supabaseService: {
    getTask: vi.fn(),
    getTasks: vi.fn(),
    deleteTask: vi.fn(),
  },
  createTaskInMainChain: vi.fn(),
  createTasksInWizardBatch: vi.fn(),
  updateTaskInMainChain: vi.fn(),
  deleteTaskInMainChain: vi.fn(),
  replaceTaskDependencies: vi.fn(),
  replaceWizardGeneratedTaskDependenciesBatch: vi.fn(),
  transactionEvents: [] as string[],
  transactionClient: {
    query: vi.fn(async (sql: string) => {
      const normalized = String(sql).trim().toUpperCase()
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        mocks.transactionEvents.push(normalized)
      }
      return { rows: [], rowCount: 0 }
    }),
    release: vi.fn(),
  },
  getClient: vi.fn(),
  withDatabaseTransaction: vi.fn(),
  rawQuery: vi.fn(),
  executeRetention: vi.fn(),
  executeSQL: vi.fn(),
  writeChangeLog: vi.fn(),
  broadcastProjectTasksChanged: vi.fn(),
  broadcastTaskChanged: vi.fn(),
  broadcastPlanningTableChanged: vi.fn(),
  getProjectCriticalPathSnapshot: vi.fn(),
  recalculateProjectCriticalPath: vi.fn(),
  generateWbsTemplateRows: vi.fn(),
  recordWbsTemplateGenerationRuntimeConsumption: vi.fn(),
  persistDurationLearningRuntimeConsumptions: vi.fn(),
  getProjectCompanyId: vi.fn(),
  listWbsTemplateCatalog: vi.fn(),
  buildSpecialWorkDurationCandidateNodes: vi.fn(() => []),
  recordWbsTemplateCandidateEvent: vi.fn(async () => undefined),
  buildTaskCommitReplaySummary: vi.fn((input: {
    changedTaskIds: Set<string>
    deletedTaskIds: Set<string>
    tempIdMap: Map<string, string>
    deletionResults: Array<Record<string, unknown>>
  }) => ({
    createdRowCount: input.tempIdMap.size,
    deletedRowCount: input.deletedTaskIds.size,
    changedRowCount: input.changedTaskIds.size + input.deletedTaskIds.size,
    tempIdMap: Object.fromEntries(input.tempIdMap.entries()),
    deletionResults: input.deletionResults,
  })),
  buildTaskCommitRequestHash: vi.fn(() => 'commit-request-hash'),
  reserveTaskCommitRequest: vi.fn(),
  completeTaskCommitRequest: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: () => void) => {
    req.user = { id: 'user-1' }
    next()
  }),
  requireProjectEditor: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
}))

vi.mock('../middleware/validation.js', () => ({
  validate: vi.fn(() => (_req: any, _res: any, next: () => void) => next()),
  validateIdParam: vi.fn((_req: any, _res: any, next: () => void) => next()),
  taskSchema: {},
  taskUpdateSchema: {},
  validateTaskDateWindow: vi.fn(() => ({
    valid: true,
    issues: [],
  })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

vi.mock('../services/supabaseService.js', () => ({
  SupabaseService: vi.fn().mockImplementation(() => mocks.supabaseService),
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: mocks.executeSQL,
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('../services/changeAuditService.js', () => ({
  writeChangeLog: mocks.writeChangeLog,
}))

vi.mock('../services/taskWriteChainService.js', () => ({
  closeTaskInMainChain: vi.fn(),
  createTaskInMainChain: mocks.createTaskInMainChain,
  createTasksInWizardBatch: mocks.createTasksInWizardBatch,
  deleteTaskInMainChain: mocks.deleteTaskInMainChain,
  reopenTaskInMainChain: vi.fn(),
  updateTaskInMainChain: mocks.updateTaskInMainChain,
}))

vi.mock('../services/taskStandardModelService.js', () => ({
  buildStandardDTO: vi.fn(async (task: Record<string, unknown>) => task),
  replaceTaskDependencies: mocks.replaceTaskDependencies,
  replaceWizardGeneratedTaskDependenciesBatch: mocks.replaceWizardGeneratedTaskDependenciesBatch,
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
  query: mocks.rawQuery,
  withDatabaseTransaction: mocks.withDatabaseTransaction,
  registerDatabasePostCommitEffect: vi.fn(async (_label: string, effect: () => Promise<void>) => effect()),
  isDatabaseTransactionActive: vi.fn(() => false),
}))

vi.mock('../services/taskDtoService.js', () => ({
  sanitizeTaskForClient: vi.fn((task: Record<string, unknown>) => task),
}))

vi.mock('../services/taskCodeTransactionService.js', () => ({
  rejectTaskCodeFields: vi.fn(() => null),
}))

vi.mock('../services/taskLagStatusService.js', () => ({
  attachTaskLagStatus: vi.fn((task: Record<string, unknown>) => task),
  attachTasksLagStatus: vi.fn((tasks: Array<Record<string, unknown>>) => tasks),
}))

vi.mock('../services/requestBudgetService.js', () => ({
  REQUEST_TIMEOUT_BUDGETS: {},
  runWithRequestBudget: vi.fn(async (_budget: unknown, fn: () => Promise<unknown>) => fn()),
}))

vi.mock('../services/planningRealtimeEventService.js', () => ({
  broadcastPlanningTableChanged: mocks.broadcastPlanningTableChanged,
  broadcastProjectTasksChanged: mocks.broadcastProjectTasksChanged,
  broadcastTaskChanged: mocks.broadcastTaskChanged,
}))

vi.mock('../services/wbsTemplateGenerationService.js', () => ({
  generateWbsTemplateRows: mocks.generateWbsTemplateRows,
  recordWbsTemplateGenerationRuntimeConsumption: mocks.recordWbsTemplateGenerationRuntimeConsumption,
  listWbsTemplateCatalog: mocks.listWbsTemplateCatalog,
}))

vi.mock('../services/durationLearningRuntimeConsumptionService.js', () => ({
  persistDurationLearningRuntimeConsumptions: mocks.persistDurationLearningRuntimeConsumptions,
}))

vi.mock('../auth/access.js', () => ({
  getProjectCompanyId: mocks.getProjectCompanyId,
}))

vi.mock('../services/wbsTemplateCandidateEventService.js', () => ({
  buildSpecialWorkDurationCandidateNodes: mocks.buildSpecialWorkDurationCandidateNodes,
  recordWbsTemplateCandidateEvent: mocks.recordWbsTemplateCandidateEvent,
}))

vi.mock('../services/taskCommitIdempotencyService.js', () => ({
  buildTaskCommitReplaySummary: mocks.buildTaskCommitReplaySummary,
  buildTaskCommitRequestHash: mocks.buildTaskCommitRequestHash,
  reserveTaskCommitRequest: mocks.reserveTaskCommitRequest,
  completeTaskCommitRequest: mocks.completeTaskCommitRequest,
}))

vi.mock('../services/projectCriticalPathService.js', () => ({
  getProjectCriticalPathSnapshot: mocks.getProjectCriticalPathSnapshot,
  recalculateProjectCriticalPath: mocks.recalculateProjectCriticalPath,
}))

vi.mock('../services/deletionRetentionGovernanceService.js', () => ({
  executeRetention: mocks.executeRetention,
  buildRetentionBlockedApiError: vi.fn((reason: string, result: Record<string, unknown>, options?: { details?: unknown }) => ({
    code: result.requiresUserConfirmation ? 'RETENTION_CONFIRMATION_REQUIRED' : 'RETENTION_REJECTED',
    message: reason || String(result.reason ?? ''),
    details: options?.details ?? result,
  })),
  buildRetentionBlockedHttpStatus: vi.fn((result: Record<string, unknown>) => (
    result.requiresUserConfirmation ? 409 : 422
  )),
}))

const { default: tasksRouter } = await import('../routes/tasks.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/tasks', tasksRouter)
  return app
}

function buildTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    project_id: PROJECT_ID,
    title: 'Task',
    status: 'todo',
    progress: 0,
    version: 1,
    start_date: '2026-05-01',
    end_date: '2026-05-03',
    planned_start_date: '2026-05-01',
    planned_end_date: '2026-05-03',
    participant_unit_id: null,
    participant_unit_name: null,
    responsible_unit: null,
    assignee_unit: null,
    sort_order: 1,
    wbs_level: 1,
    ...overrides,
  }
}

function buildRetentionDecision(overrides: Record<string, unknown> = {}) {
  return {
    requestedAction: 'delete',
    resolvedAction: 'physical_delete',
    decision: 'physical_delete',
    requestedAllowed: true,
    resolvedAllowed: true,
    executionMode: 'auto_execute',
    executionStatus: 'decided',
    requiresUserConfirmation: false,
    reasonCode: 'no_reference_physical_delete',
    reason: 'The record has no references and can be deleted.',
    canPhysicalDelete: true,
    referenceSummary: {},
    affectedEntityIds: ['task-1'],
    suggestedAction: {},
    changeSummary: {},
    ...overrides,
  }
}

describe('tasks commit route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transactionEvents.length = 0
    mocks.getClient.mockResolvedValue(mocks.transactionClient)
    mocks.withDatabaseTransaction.mockImplementation(async (work: () => Promise<unknown>) => {
      await mocks.transactionClient.query('BEGIN')
      try {
        const result = await work()
        await mocks.transactionClient.query('COMMIT')
        return result
      } catch (error) {
        await mocks.transactionClient.query('ROLLBACK')
        throw error
      }
    })
    mocks.rawQuery.mockResolvedValue({ rows: [], rowCount: 0 })
    mocks.getProjectCompanyId.mockResolvedValue('company-1')
    mocks.recordWbsTemplateGenerationRuntimeConsumption.mockResolvedValue(undefined)
    mocks.persistDurationLearningRuntimeConsumptions.mockResolvedValue({ requestedCount: 0, insertedCount: 0 })
    mocks.executeSQL.mockResolvedValue([])
    mocks.writeChangeLog.mockResolvedValue('change-log-1')
    mocks.reserveTaskCommitRequest.mockResolvedValue({
      kind: 'reserved',
      id: 'commit-request-1',
    })
    mocks.completeTaskCommitRequest.mockResolvedValue(undefined)
    mocks.supabaseService.getTask.mockResolvedValue(buildTask())
    mocks.supabaseService.getTasks.mockResolvedValue([buildTask()])
    mocks.createTaskInMainChain.mockImplementation(async (input: Record<string, unknown>) => ({
      task: buildTask({ id: 'created-task-1', ...input }),
      participantUnit: null,
    }))
    mocks.createTasksInWizardBatch.mockImplementation(async (items: Array<{ payload: Record<string, unknown> }>) => (
      items.map((item, index) => ({
        task: buildTask({ id: `batch-created-${index + 1}`, ...item.payload }),
        participantUnit: null,
      }))
    ))
    mocks.updateTaskInMainChain.mockImplementation(async (taskId: string, patch: Record<string, unknown>) => ({
      task: buildTask({ id: taskId, ...patch, version: 2 }),
      participantUnit: null,
    }))
    mocks.deleteTaskInMainChain.mockResolvedValue(undefined)
    mocks.replaceTaskDependencies.mockResolvedValue({ taskId: 'task-1' })
    mocks.replaceWizardGeneratedTaskDependenciesBatch.mockResolvedValue([])
    mocks.generateWbsTemplateRows.mockResolvedValue({
      generationBatchId: 'batch-1',
      templateId: 'china-gb55032-2022',
      scopeCombos: [{ building_object_id: 'building-1' }],
      rows: [
        {
          clientRowId: 'batch-1:02-01-01:0',
          parentClientRowId: null,
          parentRowId: null,
          sortOrder: 0,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '模板',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-02',
            wbs_node_type: 'item_work',
            template_id: 'china-gb55032-2022',
            template_node_id: '02-01-01',
            standard_work_code: '02-01-01',
            standard_work_name: '模板',
            building_object_id: 'building-1',
          },
        },
        {
          clientRowId: 'batch-1:02-01-01-P01:1',
          parentClientRowId: 'batch-1:02-01-01:0',
          parentRowId: null,
          sortOrder: 1,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '模板安装',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-01',
            wbs_node_type: 'process',
            template_id: 'china-gb55032-2022',
            template_node_id: '02-01-01-P01',
            standard_work_code: '02-01-01-P01',
            standard_work_name: '模板安装',
            building_object_id: 'building-1',
          },
        },
        {
          clientRowId: 'batch-1:02-01-01-P02:2',
          parentClientRowId: 'batch-1:02-01-01:0',
          parentRowId: null,
          sortOrder: 2,
          predecessorClientRowIds: ['batch-1:02-01-01-P01:1'],
          predecessorDependencies: [{
            clientRowId: 'batch-1:02-01-01-P01:1',
            dependencyType: 'SS',
            lagDays: 0,
            source: 'dependency_intent_template',
          }],
          values: {
            title: '模板验收',
            planned_start_date: '2026-06-02',
            planned_end_date: '2026-06-02',
            wbs_node_type: 'process',
            template_id: 'china-gb55032-2022',
            template_node_id: '02-01-01-P02',
            standard_work_code: '02-01-01-P02',
            standard_work_name: '模板验收',
            building_object_id: 'building-1',
          },
        },
      ],
    })
    mocks.listWbsTemplateCatalog.mockResolvedValue({
      builtIn: {
        templateId: 'china-building-main',
        templateCode: 'building-main',
        templateName: '房建主体模板',
        sourceStandard: 'GB 50300',
        sourceVersion: '2026',
        divisionCount: 1,
        nodeCount: 3,
        evidenceSummary: {},
        nodes: [{
          id: 'STR-01-01',
          stableCode: 'STR-01-01',
          name: '钢筋混凝土主体结构',
          categoryType: 'item_work',
          standardWorkName: '主体结构施工',
          children: [{
            id: 'STR-01-01-P01',
            stableCode: 'STR-01-01-P01',
            name: '墙柱钢筋绑扎',
            categoryType: 'process',
            children: [],
          }],
        }],
      },
      templates: [{
        id: 'china-building-main',
        name: '房建主体模板',
        source: 'builtin_seed',
        nodeCount: 3,
        templateGroup: 'building_main',
      }],
    })
    mocks.executeRetention.mockResolvedValue(buildRetentionDecision())
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      displayTaskIds: ['task-1'],
    })
    mocks.recalculateProjectCriticalPath.mockResolvedValue({
      snapshot: {
        displayTaskIds: ['task-1'],
      },
    })
  })

  it('commits create, update, and predecessor operations through the main write chain', async () => {
    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'create_row',
            tempId: 'tmp-1',
            parentId: 'parent-task-1',
            sortOrder: 12,
            values: {
              title: 'New task',
              planned_start_date: '2026-06-01',
              planned_end_date: '2026-06-03',
              progress: 0,
            },
          },
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'progress',
            value: 35,
          },
          {
            type: 'set_predecessors',
            rowId: 'task-1',
            predecessorTaskIds: ['pre-task-1'],
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.createTaskInMainChain).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        title: 'New task',
        start_date: '2026-06-01',
        end_date: '2026-06-03',
        parent_id: 'parent-task-1',
        sort_order: 12,
        created_by: 'user-1',
      }),
      'user-1',
    )
    expect(mocks.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        progress: 35,
        status: 'in_progress',
        updated_by: 'user-1',
      }),
      1,
    )
    expect(mocks.replaceTaskDependencies).toHaveBeenCalledWith('task-1', [
      {
        dependencyTaskId: 'pre-task-1',
        dependencyType: 'FS',
        lagDays: 0,
        sourceType: 'manual',
        metadata: {
          source: 'planning_table_manual_predecessor_edit',
          learningSignal: 'manual_dependency_correction',
          candidatePolicy: 'candidate_only_no_runtime_rule_mutation',
        },
      },
    ], {
      projectId: PROJECT_ID,
      preserveCurrentTaskFacts: false,
    })
    expect(response.body.data.tempIdMap).toEqual({ 'tmp-1': 'created-task-1' })
    expect(response.body.data.governanceSummary).toMatchObject({
      progressAdjustmentCount: 1,
      dependencyChangeCount: 1,
    })
    expect(mocks.writeChangeLog).toHaveBeenCalledTimes(1)
    expect(mocks.writeChangeLog).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      entityType: 'task_list',
      entityId: PROJECT_ID,
      actionType: 'task_list_commit',
      actionGroup: 'edit',
      fieldName: 'planning_table_commit',
      changeSource: 'user_save',
      changedBy: 'user-1',
      visibility: 'user',
      metadata: expect.objectContaining({
        source: 'task_list_commit',
        operationCount: 3,
        changedTaskIds: expect.arrayContaining(['created-task-1', 'task-1']),
        governanceSummary: expect.objectContaining({
          createdRowCount: 1,
          progressAdjustmentCount: 1,
          dependencyChangeCount: 1,
        }),
        mergeGroupSummary: expect.objectContaining({
          identity: expect.objectContaining({
            fields: expect.arrayContaining(['title']),
          }),
          schedule: expect.objectContaining({
            fields: expect.arrayContaining(['planned_start_date', 'planned_end_date']),
          }),
          dependency: expect.objectContaining({
            fields: ['predecessor_task_ids'],
          }),
          progress_status: expect.objectContaining({
            fields: expect.arrayContaining(['progress']),
          }),
        }),
      }),
    }))
    expect(mocks.broadcastProjectTasksChanged).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      source: 'task_list_commit',
    }))
    expect(mocks.broadcastPlanningTableChanged).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      surface: 'task_list',
      resourceId: null,
      source: 'task_list_commit',
    }))
    expect(mocks.completeTaskCommitRequest).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      requestHash: 'commit-request-hash',
      summary: expect.objectContaining({
        createdRowCount: 1,
        changedRowCount: 2,
      }),
    }))
  })

  it('replays an already completed commit without repeating writes, audit, or realtime effects', async () => {
    mocks.reserveTaskCommitRequest.mockResolvedValueOnce({
      kind: 'replay',
      id: 'commit-request-1',
      summary: {
        createdRowCount: 1,
        deletedRowCount: 0,
        changedRowCount: 1,
        tempIdMap: { 'tmp-1': 'created-task-1' },
        deletionResults: [],
      },
    })

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .set('Idempotency-Key', 'request-1')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        clientContext: { requestId: 'request-1' },
        operations: [{
          type: 'create_row',
          tempId: 'tmp-1',
          values: {
            title: 'Do not create twice',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-03',
          },
        }],
      })

    expect(response.status).toBe(200)
    expect(response.body.data).toMatchObject({
      requestId: 'request-1',
      idempotentReplay: true,
      tempIdMap: { 'tmp-1': 'created-task-1' },
      governanceSummary: {
        createdRowCount: 1,
        changedRowCount: 1,
      },
    })
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.updateTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.deleteTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.writeChangeLog).not.toHaveBeenCalled()
    expect(mocks.completeTaskCommitRequest).not.toHaveBeenCalled()
    expect(mocks.recalculateProjectCriticalPath).not.toHaveBeenCalled()
    expect(mocks.broadcastProjectTasksChanged).not.toHaveBeenCalled()
    expect(mocks.broadcastPlanningTableChanged).not.toHaveBeenCalled()
    expect(mocks.broadcastTaskChanged).not.toHaveBeenCalled()
  })

  it('rolls back the entire commit when a later operation fails and emits no post-commit effects', async () => {
    mocks.updateTaskInMainChain.mockRejectedValueOnce(Object.assign(
      new Error('VERSION_MISMATCH: stale task'),
      { code: 'VERSION_MISMATCH', statusCode: 409 },
    ))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'create_row',
            clientRowId: 'new-task',
            values: {
              title: 'Created before failure',
              planned_start_date: '2026-06-01',
              planned_end_date: '2026-06-02',
            },
          },
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'progress',
            value: 40,
          },
        ],
      })

    expect(response.status).toBe(409)
    expect(mocks.createTaskInMainChain).toHaveBeenCalledTimes(1)
    expect(mocks.transactionEvents).toEqual(['BEGIN', 'ROLLBACK'])
    expect(mocks.writeChangeLog).not.toHaveBeenCalled()
    expect(mocks.broadcastProjectTasksChanged).not.toHaveBeenCalled()
    expect(mocks.broadcastPlanningTableChanged).not.toHaveBeenCalled()
    expect(mocks.broadcastTaskChanged).not.toHaveBeenCalled()
  })

  it('broadcasts a successful commit only after the database commit', async () => {
    const events: string[] = []
    mocks.transactionClient.query.mockImplementation(async (sql: string) => {
      const normalized = String(sql).trim().toUpperCase()
      if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') {
        mocks.transactionEvents.push(normalized)
        events.push(normalized)
      }
      return { rows: [], rowCount: 0 }
    })
    mocks.broadcastProjectTasksChanged.mockImplementation(() => events.push('BROADCAST'))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [{
          type: 'update_cell',
          rowId: 'task-1',
          field: 'progress',
          value: 20,
        }],
      })

    expect(response.status).toBe(200)
    expect(events.indexOf('COMMIT')).toBeGreaterThan(events.indexOf('BEGIN'))
    expect(events.indexOf('BROADCAST')).toBeGreaterThan(events.indexOf('COMMIT'))
  })

  it('resolves draft-created parent ids when saving pasted task hierarchies', async () => {
    mocks.createTaskInMainChain
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'created-parent', ...input }),
        participantUnit: null,
      }))
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'created-child', ...input }),
        participantUnit: null,
      }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'create_row',
            clientRowId: 'local-parent',
            parentId: null,
            sortOrder: 0,
            values: {
              title: 'Parent task',
              planned_start_date: '2026-06-01',
              planned_end_date: '2026-06-03',
            },
          },
          {
            type: 'create_row',
            clientRowId: 'local-child',
            parentId: 'local-parent',
            sortOrder: 0,
            values: {
              title: 'Child task',
              planned_start_date: '2026-06-01',
              planned_end_date: '2026-06-03',
            },
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.createTaskInMainChain).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: 'Child task',
        parent_id: 'created-parent',
      }),
      'user-1',
    )
    expect(response.body.data.tempIdMap).toEqual({
      'local-parent': 'created-parent',
      'local-child': 'created-child',
    })
  })

  it('executes template_generate as backend-owned task creation and dependency wiring', async () => {
    mocks.createTaskInMainChain
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'generated-item', ...input }),
        participantUnit: null,
      }))
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'generated-process-1', ...input }),
        participantUnit: null,
      }))
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'generated-process-2', ...input }),
        participantUnit: null,
      }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'template_generate',
            generationBatchId: 'batch-1',
            templateId: 'china-gb55032-2022',
            selectedNodeIds: ['02-01-01'],
            scope: { building_object_id: 'building-1' },
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      surface: 'task_list',
    }))
    expect(mocks.createTaskInMainChain).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: '模板',
        template_id: 'china-gb55032-2022',
        template_node_id: '02-01-01',
        standard_work_code: '02-01-01',
        building_object_id: 'building-1',
        task_source: 'template',
      }),
      'user-1',
    )
    expect(mocks.createTaskInMainChain).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        title: '模板安装',
        parent_id: 'generated-item',
      }),
      'user-1',
    )
    expect(mocks.replaceTaskDependencies).toHaveBeenCalledWith('generated-process-2', [
      {
        dependencyTaskId: 'generated-process-1',
        dependencyType: 'SS',
        lagDays: 0,
        sourceType: 'template_dependency_intent',
        metadata: expect.objectContaining({
          source: 'dependency_intent_template',
          learningPolicy: 'published_or_template_generated_dependency',
        }),
      },
    ], { projectId: PROJECT_ID })
    expect(response.body.data.tempIdMap).toEqual({
      'batch-1:02-01-01:0': 'generated-item',
      'batch-1:02-01-01-P01:1': 'generated-process-1',
      'batch-1:02-01-01-P02:2': 'generated-process-2',
    })
  })

  it('commits selected-task drilldown tasks and dependencies in one transaction', async () => {
    const parentTaskId = '00000000-0000-4000-8000-000000000101'
    const parentTask = buildTask({
      id: parentTaskId,
      wbs_node_type: 'process',
      wbs_code: '4.2',
      wbs_path: `/root/${parentTaskId}`,
      building_object_id: 'building-authoritative',
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'master_control' },
      },
    })
    mocks.supabaseService.getTask.mockResolvedValue(parentTask)
    mocks.supabaseService.getTasks.mockResolvedValue([
      parentTask,
      buildTask({ id: 'existing-child', parent_id: parentTaskId }),
    ])
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      generationBatchId: 'batch-drilldown',
      templateId: 'china-gb55032-2022',
      generationDepth: 'process',
      scopeCombos: [{ building_object_id: 'building-authoritative' }],
      rows: [
        {
          clientRowId: 'drilldown-process-1',
          parentClientRowId: null,
          parentRowId: parentTaskId,
          sortOrder: 0,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '墙柱钢筋绑扎',
            planned_start_date: '2026-05-01',
            planned_end_date: '2026-05-05',
            wbs_node_type: 'process',
            building_object_id: 'building-authoritative',
          },
        },
        {
          clientRowId: 'drilldown-process-2',
          parentClientRowId: null,
          parentRowId: parentTaskId,
          sortOrder: 1,
          predecessorClientRowIds: ['drilldown-process-1'],
          predecessorDependencies: [{
            clientRowId: 'drilldown-process-1',
            dependencyType: 'FS',
            lagDays: 0,
            source: 'dependency_intent_template',
          }],
          values: {
            title: '墙柱模板安装',
            planned_start_date: '2026-05-06',
            planned_end_date: '2026-05-08',
            wbs_node_type: 'process',
            building_object_id: 'building-authoritative',
          },
        },
      ],
    })

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [{
          type: 'template_generate',
          generationBatchId: 'batch-drilldown',
          templateId: 'china-gb55032-2022',
          selectedNodeIds: ['02-01-01'],
          attachUnderRowId: parentTaskId,
          generationDepth: 'activity_step',
          scope: { building_object_id: 'building-forged' },
        }],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(mocks.generateWbsTemplateRows).toHaveBeenCalledWith(expect.objectContaining({
      operation: expect.objectContaining({
        attachUnderRowId: parentTaskId,
        generationDepth: 'process',
        drilldownMode: 'selected_children',
        scope: { building_object_id: 'building-authoritative' },
      }),
    }))
    expect(mocks.createTasksInWizardBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          clientRowId: 'drilldown-process-1',
          parentClientRowId: parentTaskId,
          payload: expect.objectContaining({ parent_id: parentTaskId }),
        }),
      ]),
      'user-1',
      expect.objectContaining({
        transactionClient: mocks.transactionClient,
        externalParentContext: expect.objectContaining({
          id: parentTaskId,
          wbsNodeType: 'item_work',
          childCount: 1,
        }),
      }),
    )
    expect(mocks.replaceWizardGeneratedTaskDependenciesBatch).toHaveBeenCalledWith(expect.objectContaining({
      projectId: PROJECT_ID,
      transactionClient: mocks.transactionClient,
      dependencies: [{
        taskId: 'batch-created-2',
        dependencyTaskId: 'batch-created-1',
        dependencyType: 'FS',
        lagDays: 0,
        sourceType: 'template_dependency_intent',
        metadata: expect.objectContaining({
          source: 'dependency_intent_template',
          learningPolicy: 'published_or_template_generated_dependency',
        }),
      }],
    }))
    expect(mocks.transactionEvents).toEqual(['BEGIN', 'COMMIT'])
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })

  it('rolls back selected-task drilldown tasks when dependency materialization fails', async () => {
    const parentTaskId = '00000000-0000-4000-8000-000000000103'
    mocks.supabaseService.getTask.mockResolvedValue(buildTask({
      id: parentTaskId,
      wbs_node_type: 'item_work',
      wbs_code: '4.3',
      wbs_path: `/root/${parentTaskId}`,
      building_object_id: 'building-1',
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'master_control' },
      },
    }))
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      generationBatchId: 'batch-drilldown-rollback',
      templateId: 'china-gb55032-2022',
      generationDepth: 'process',
      scopeCombos: [{ building_object_id: 'building-1' }],
      rows: [{
        clientRowId: 'drilldown-process-rollback',
        parentClientRowId: null,
        parentRowId: parentTaskId,
        sortOrder: 0,
        predecessorClientRowIds: [],
        predecessorDependencies: [],
        values: {
          title: '主体结构工序',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-05',
          wbs_node_type: 'process',
          building_object_id: 'building-1',
        },
      }],
    })
    mocks.replaceWizardGeneratedTaskDependenciesBatch.mockRejectedValueOnce(
      Object.assign(new Error('dependency insert failed'), {
        code: 'TASK_DEPENDENCY_WRITE_FAILED',
        statusCode: 500,
      }),
    )

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [{
          type: 'template_generate',
          templateId: 'china-gb55032-2022',
          selectedNodeIds: ['02-01-01'],
          attachUnderRowId: parentTaskId,
        }],
      })

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('TASK_DEPENDENCY_WRITE_FAILED')
    expect(mocks.transactionEvents).toEqual(['BEGIN', 'ROLLBACK'])
    expect(mocks.recordWbsTemplateCandidateEvent).not.toHaveBeenCalled()
  })

  it('rolls back selected-task drilldown tasks when template link materialization fails', async () => {
    const parentTaskId = '00000000-0000-4000-8000-000000000104'
    mocks.supabaseService.getTask.mockResolvedValue(buildTask({
      id: parentTaskId,
      wbs_node_type: 'item_work',
      wbs_code: '4.4',
      wbs_path: `/root/${parentTaskId}`,
      building_object_id: 'building-1',
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'master_control' },
      },
    }))
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      generationBatchId: 'batch-drilldown-link-rollback',
      templateId: 'china-gb55032-2022',
      generationDepth: 'process',
      scopeCombos: [{ building_object_id: 'building-1' }],
      rows: [{
        clientRowId: 'drilldown-process-link-rollback',
        parentClientRowId: null,
        parentRowId: parentTaskId,
        sortOrder: 0,
        predecessorClientRowIds: [],
        predecessorDependencies: [],
        values: {
          title: '主体结构条件工序',
          planned_start_date: '2026-05-01',
          planned_end_date: '2026-05-05',
          wbs_node_type: 'process',
          building_object_id: 'building-1',
          precondition_templates: ['drawing_approved'],
        },
      }],
    })
    mocks.executeSQL.mockRejectedValueOnce(Object.assign(
      new Error('task condition insert failed'),
      { code: 'TASK_CONDITION_WRITE_FAILED', statusCode: 500 },
    ))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [{
          type: 'template_generate',
          templateId: 'china-gb55032-2022',
          selectedNodeIds: ['02-01-01'],
          attachUnderRowId: parentTaskId,
        }],
      })

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('TASK_CONDITION_WRITE_FAILED')
    expect(mocks.transactionEvents).toEqual(['BEGIN', 'ROLLBACK'])
    expect(mocks.completeTaskCommitRequest).not.toHaveBeenCalled()
    expect(mocks.recordWbsTemplateCandidateEvent).not.toHaveBeenCalled()
  })

  it('carries default master-plan duration asset utilization summary into task candidate event metadata', async () => {
    const durationAssetUtilizationSummary = {
      source: 'default_master_plan_duration_asset_utilization_summary',
      evidenceLevel: 'candidate_duration_asset_utilization_l1',
      mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
      scheduleRowCount: 1,
      standardWorkDurationSeedRowCount: 1,
      t2RhythmTemplateRowCount: 1,
      projectScaleQuantityProxyRowCount: 1,
      dependencyAssetConsumedRowCount: 1,
      dependencyTimingAssetConsumedRowCount: 1,
      processSeasonalDurationAssetRowCount: 0,
      runtimeReferenceDaysRowCount: 0,
      constructionCalendarRowCount: 1,
      rowsMissingDurationAssetCount: 0,
      rowsMissingT2RhythmTemplateCount: 0,
      uniqueStandardWorkDurationSeedStableCodes: ['cast_in_place_formwork'],
      uniqueT2RhythmTemplateIds: ['t2-residential-standard-floor-rhythm-v1'],
      uniqueDependencyAssetStableCodes: ['asset_backed_residential_trade_interleave'],
      durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence',
      productionWritePolicy: 'candidate_only_no_task_dependencies_write',
    }
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      generationBatchId: 'batch-duration-assets',
      templateId: 'managed-frontier-default-master-plan',
      generationDepth: 'managed_frontier',
      scopeCombos: [{ building_object_id: 'building-1' }],
      durationAssetUtilizationSummary,
      rows: [{
        clientRowId: 'batch-duration-assets:row-1',
        parentClientRowId: null,
        parentRowId: null,
        sortOrder: 0,
        predecessorClientRowIds: [],
        predecessorDependencies: [],
        values: {
          title: '1#楼主体结构标准层循环',
          planned_start_date: '2026-06-01',
          planned_end_date: '2026-12-31',
          wbs_node_type: 'item_work',
          template_id: 'managed-frontier-default-master-plan',
          template_node_id: 'RMP-04-01-02',
          standard_work_code: 'RMP-04-01-02',
        },
      }],
    })
    mocks.createTaskInMainChain.mockImplementationOnce(async (input: Record<string, unknown>) => ({
      task: buildTask({ id: 'generated-master-plan-row', ...input }),
      participantUnit: null,
    }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'template_generate',
            generationBatchId: 'batch-duration-assets',
            templateId: 'managed-frontier-default-master-plan',
            selectedNodeIds: ['RMP-04-01-02'],
            scope: { building_object_id: 'building-1' },
          },
        ],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(mocks.recordWbsTemplateCandidateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        surface: 'task_list',
        metadata: expect.objectContaining({
          source: 'task_list_commit',
          durationAssetUtilizationSummary,
        }),
      }),
    )
  })

  it('commits oversized template generations as a render-budget concern instead of a hard row limit', async () => {
    const oversizedRows = Array.from({ length: 501 }, (_, index) => ({
      clientRowId: `batch-large:row-${index + 1}`,
      parentClientRowId: null,
      parentRowId: null,
      sortOrder: index,
      predecessorClientRowIds: [],
      predecessorDependencies: [],
      values: {
        title: `Generated task ${index + 1}`,
        planned_start_date: '2026-06-01',
        planned_end_date: '2026-06-02',
        wbs_node_type: 'item_work',
        template_id: 'china-building-site-management',
        template_node_id: `SITE-ROW-${index + 1}`,
        standard_work_code: `SITE-ROW-${index + 1}`,
      },
    }))
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      generationBatchId: 'batch-large',
      templateId: 'china-building-site-management',
      scopeCombos: [{ building_object_id: 'building-1' }],
      rowLimit: 500,
      rowLimitPolicy: 'single_batch',
      generationBatches: [{
        batchId: 'batch-large',
        scopeIndexes: [0],
        rowCount: 501,
        rowLimit: 500,
        rowLimitExceeded: true,
        templateIds: ['china-building-site-management'],
      }],
      rows: oversizedRows,
    })
    mocks.createTaskInMainChain.mockImplementation(async (input: Record<string, unknown>) => ({
      task: buildTask({ id: `created-${String(input.template_node_id)}`, ...input }),
      participantUnit: null,
    }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'template_generate',
            generationBatchId: 'batch-large',
            templateId: 'china-building-site-management',
            selectedNodeIds: ['SITE-01-01-01'],
            rowLimitPolicy: 'single_batch',
            generationBatches: [{
              batchId: 'batch-large',
              scopeIndexes: [0],
              rowCount: 501,
              rowLimit: 500,
              rowLimitExceeded: true,
            }],
          },
        ],
      })

    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(mocks.createTaskInMainChain).toHaveBeenCalledTimes(501)
    expect(response.body.data.governanceSummary.createdRowCount).toBe(501)
    expect(response.body.data.tempIdMap['batch-large:row-501']).toBe('created-SITE-ROW-501')
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[tasks.commit] template generation exceeds render budget; committing full generated rows',
      expect.objectContaining({
        projectId: PROJECT_ID,
        generatedRowCount: 501,
        rowLimit: 500,
      }),
    )
  })

  it('only promotes major acceptance template rows to acceptance timeline plans', async () => {
    mocks.generateWbsTemplateRows.mockResolvedValueOnce({
      generationBatchId: 'batch-acceptance',
      templateId: 'china-gb55032-2022',
      scopeCombos: [{ building_object_id: 'building-1' }],
      rows: [
        {
          clientRowId: 'batch-acceptance:ordinary:1',
          parentClientRowId: null,
          parentRowId: null,
          sortOrder: 1,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '普通检验批验收复核',
            planned_start_date: '2026-06-01',
            planned_end_date: '2026-06-01',
            wbs_node_type: 'process',
            building_object_id: 'building-1',
            standard_task_metadata: {
              acceptanceCheckpoints: ['自检', '复核', '签认'],
            },
          },
        },
        {
          clientRowId: 'batch-acceptance:major:2',
          parentClientRowId: null,
          parentRowId: null,
          sortOrder: 2,
          predecessorClientRowIds: [],
          predecessorDependencies: [],
          values: {
            title: '消防专项验收',
            planned_start_date: '2026-06-05',
            planned_end_date: '2026-06-05',
            wbs_node_type: 'process',
            building_object_id: 'building-1',
            completion_rule: 'acceptance_passed',
            standard_task_metadata: {
              planItemKind: 'linked_projection',
              isAcceptanceMilestone: true,
              acceptanceCheckpoints: ['资料齐套', '联动测试', '消防专项验收'],
            },
          },
        },
      ],
    })
    mocks.createTaskInMainChain
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'ordinary-task', ...input }),
        participantUnit: null,
      }))
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'major-acceptance-task', ...input }),
        participantUnit: null,
      }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [{
          type: 'template_generate',
          generationBatchId: 'batch-acceptance',
          templateId: 'china-gb55032-2022',
          selectedNodeIds: ['acceptance'],
          scope: { building_object_id: 'building-1' },
        }],
      })

    expect(response.status).toBe(200)
    const acceptancePlanInserts = mocks.executeSQL.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT INTO acceptance_plans')
    ))
    expect(acceptancePlanInserts).toHaveLength(1)
    expect(acceptancePlanInserts[0]?.[1]).toEqual(expect.arrayContaining([
      PROJECT_ID,
      '消防专项验收',
      'fire_acceptance',
      '2026-06-05',
    ]))
    const acceptanceLinkInserts = mocks.executeSQL.mock.calls.filter(([sql]) => (
      String(sql).includes('INSERT INTO project_entity_links')
      && String(sql).includes("'covers_task'")
    ))
    expect(acceptanceLinkInserts).toHaveLength(1)
    expect(acceptanceLinkInserts[0]?.[1]).toEqual(expect.arrayContaining([
      PROJECT_ID,
      acceptancePlanInserts[0]?.[1]?.[0],
      'major-acceptance-task',
    ]))
  })

  it('resolves draft-created task ids before saving predecessor links in the same commit', async () => {
    mocks.createTaskInMainChain
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'created-parent', ...input }),
        participantUnit: null,
      }))
      .mockImplementationOnce(async (input: Record<string, unknown>) => ({
        task: buildTask({ id: 'created-child', ...input }),
        participantUnit: null,
      }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'create_row',
            clientRowId: 'local-parent',
            values: {
              title: 'Parent task',
              planned_start_date: '2026-06-01',
              planned_end_date: '2026-06-03',
            },
          },
          {
            type: 'create_row',
            clientRowId: 'local-child',
            values: {
              title: 'Child task',
              planned_start_date: '2026-06-04',
              planned_end_date: '2026-06-05',
            },
          },
          {
            type: 'set_predecessors',
            rowId: 'local-child',
            predecessorTaskIds: ['local-parent'],
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.replaceTaskDependencies).toHaveBeenCalledWith('created-child', [
      {
        dependencyTaskId: 'created-parent',
        dependencyType: 'FS',
        lagDays: 0,
        sourceType: 'manual',
        metadata: {
          source: 'planning_table_manual_predecessor_edit',
          learningSignal: 'manual_dependency_correction',
          candidatePolicy: 'candidate_only_no_runtime_rule_mutation',
        },
      },
    ], {
      projectId: PROJECT_ID,
      preserveCurrentTaskFacts: false,
    })
  })

  it('returns authoritative selected-task drilldown context without mutating tasks', async () => {
    mocks.supabaseService.getTask.mockResolvedValue(buildTask({
      id: '00000000-0000-4000-8000-000000000101',
      title: '主体结构施工',
      building_object_id: '00000000-0000-4000-8000-000000000201',
      phase_object_id: '00000000-0000-4000-8000-000000000202',
      standard_work_name: '主体结构施工',
      wbs_node_type: 'process',
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'master_control' },
      },
    }))
    mocks.supabaseService.getTasks.mockResolvedValue(Array.from({ length: 501 }, (_value, index) => buildTask({ id: `task-${index + 1}` })))

    const response = await supertest(buildApp())
      .get('/api/tasks/00000000-0000-4000-8000-000000000101/plan-drilldown-context')

    expect(response.status).toBe(200)
    expect(response.body.data).toEqual(expect.objectContaining({
      currentLevel: 'master_control',
      nextLevel: 'process_detail',
      generationDepth: 'process',
      rowLimit: 80,
      projectTaskCount: 501,
      projectRowLimitExceeded: false,
      scope: {
        phase_object_id: '00000000-0000-4000-8000-000000000202',
        building_object_id: '00000000-0000-4000-8000-000000000201',
      },
      recommendation: expect.objectContaining({
        templateId: 'china-building-main',
        selectedNodeIds: ['STR-01-01'],
      }),
    }))
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.generateWbsTemplateRows).not.toHaveBeenCalled()
  })

  it('returns the parent-bound T2 rhythm recommendation before generic WBS matching', async () => {
    mocks.supabaseService.getTask.mockResolvedValue(buildTask({
      id: '00000000-0000-4000-8000-000000000101',
      title: '1#楼主体结构标准层循环',
      building_object_id: '00000000-0000-4000-8000-000000000201',
      standard_work_name: '主体结构标准层循环',
      standard_task_metadata: {
        drilldownGenerationLineage: { level: 'master_control' },
        durationAssetMapping: {
          t2RhythmTemplateId: 't2-residential-standard-floor-structure-rhythm-v1',
        },
        residentialMasterPlan: { standardFloorCount: 24 },
      },
    }))

    const response = await supertest(buildApp())
      .get('/api/tasks/00000000-0000-4000-8000-000000000101/plan-drilldown-context')

    expect(response.status).toBe(200)
    expect(response.body.data.recommendation).toEqual(expect.objectContaining({
      templateId: 't2-residential-standard-floor-structure-rhythm-v1',
      selectedNodeIds: ['t2-residential-standard-floor-structure-rhythm-v1:floor-cycles'],
      resolutionSource: 'rhythm_asset_match',
    }))
  })

  it('returns read-only acceptance impact summaries on task list rows', async () => {
    mocks.supabaseService.getTasks.mockResolvedValue([
      buildTask({ id: 'task-1' }),
      buildTask({ id: 'task-2' }),
    ])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM project_entity_links')) {
        return [
          {
            source_entity_id: 'acceptance-direct',
            target_entity_id: 'task-1',
          },
          {
            source_entity_id: 'acceptance-linked',
            target_entity_id: 'task-1',
          },
        ]
      }
      if (sql.includes('FROM acceptance_plans') && sql.includes('id IN')) {
        return [
          {
            id: 'acceptance-direct',
            acceptance_name: '消防专项验收',
            status: 'inspecting',
          },
          {
            id: 'acceptance-linked',
            plan_name: '单位工程竣工验收',
            status: 'submitted',
          },
        ]
      }
      return []
    })

    const response = await supertest(buildApp())
      .get('/api/tasks')
      .query({ projectId: PROJECT_ID })

    expect(response.status).toBe(200)
    expect(response.body.data[0]).toMatchObject({
      id: 'task-1',
      acceptance_impact_count: 2,
      acceptance_impact_summary: [
        {
          id: 'acceptance-direct',
          name: '消防专项验收',
          status: 'inspecting',
          statusLabel: '验收中',
        },
        {
          id: 'acceptance-linked',
          name: '单位工程竣工验收',
          status: 'submitted',
          statusLabel: '已申报',
        },
      ],
    })
    expect(response.body.data[1]).toMatchObject({
      id: 'task-2',
      acceptance_impact_count: 0,
      acceptance_impact_summary: [],
    })
  })

  it('keeps task list available when optional acceptance impact lookup fails', async () => {
    mocks.supabaseService.getTasks.mockResolvedValue([
      buildTask({ id: 'task-1' }),
    ])
    mocks.executeSQL.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM project_entity_links')) {
        throw new Error('Query read timeout')
      }
      return []
    })

    const response = await supertest(buildApp())
      .get('/api/tasks')
      .query({ projectId: PROJECT_ID })

    expect(response.status).toBe(200)
    expect(response.body.data[0]).toMatchObject({
      id: 'task-1',
      acceptance_impact_count: 0,
      acceptance_impact_summary: [],
    })
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      '[tasks] failed to attach acceptance impact summaries',
      expect.objectContaining({
        projectId: PROJECT_ID,
        taskCount: 1,
        error: 'Query read timeout',
      }),
    )
  })

  it('uses project-scoped acceptance impact lookups for large task lists', async () => {
    const tasks = Array.from({ length: 401 }, (_value, index) => buildTask({ id: `task-${index + 1}` }))
    mocks.supabaseService.getTasks.mockResolvedValue(tasks)
    mocks.executeSQL.mockResolvedValue([])

    const response = await supertest(buildApp())
      .get('/api/tasks')
      .query({ projectId: PROJECT_ID })

    expect(response.status).toBe(200)
    expect(response.body.data).toHaveLength(401)

    const directImpactCalls = mocks.executeSQL.mock.calls.filter(([sql]) => (
      String(sql).includes('FROM acceptance_plans')
    ))
    const linkedImpactCalls = mocks.executeSQL.mock.calls.filter(([sql]) => (
      String(sql).includes('FROM project_entity_links')
    ))

    expect(directImpactCalls).toHaveLength(1)
    expect(linkedImpactCalls).toHaveLength(1)
    for (const [, params] of [...directImpactCalls, ...linkedImpactCalls]) {
      expect(params).toEqual([PROJECT_ID])
    }
    expect(String(directImpactCalls[0]?.[0])).not.toContain('task_id IN')
    expect(String(linkedImpactCalls[0]?.[0])).not.toContain('target_entity_id IN')
  })

  it('returns CPM task projection fields on task-list surface rows', async () => {
    mocks.supabaseService.getTasks.mockResolvedValue([
      buildTask({
        id: 'task-critical',
        is_critical: true,
        total_float_days: 0,
        free_float_days: 0,
        criticality_weight: 1.35,
      }),
    ])

    const response = await supertest(buildApp())
      .get('/api/tasks')
      .query({ projectId: PROJECT_ID, surface: 'task_list', acceptance_impact: 'false' })

    expect(response.status).toBe(200)
    expect(mocks.supabaseService.getTasks).toHaveBeenCalledWith(PROJECT_ID, expect.objectContaining({
      columns: expect.arrayContaining([
        'is_critical',
        'total_float_days',
        'free_float_days',
        'criticality_weight',
      ]),
    }))
    expect(response.body.data[0]).toMatchObject({
      id: 'task-critical',
      is_critical: true,
      total_float_days: 0,
      free_float_days: 0,
      criticality_weight: 1.35,
    })
  })

  it('returns generated duration risk range fields on task-list surface rows', async () => {
    mocks.supabaseService.getTasks.mockResolvedValue([
      buildTask({
        id: 'task-duration-risk',
        duration_risk_p20_days: 210,
        duration_risk_p50_days: 240,
        duration_risk_p80_days: 285,
        duration_risk_range: {
          p20_days: 210,
          p50_days: 240,
          p80_days: 285,
        },
      }),
    ])

    const response = await supertest(buildApp())
      .get('/api/tasks')
      .query({ projectId: PROJECT_ID, surface: 'task_list', acceptance_impact: 'false' })

    expect(response.status).toBe(200)
    expect(response.body.data[0]).toMatchObject({
      id: 'task-duration-risk',
      duration_risk_p20_days: 210,
      duration_risk_p50_days: 240,
      duration_risk_p80_days: 285,
      duration_risk_range: {
        p20_days: 210,
        p50_days: 240,
        p80_days: 285,
      },
    })
  })

  it('strips system-generated progress fact fields from create-row commit payloads', async () => {
    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'create_row',
            tempId: 'tmp-1',
            values: {
              title: 'New task',
              planned_start_date: '2026-06-01',
              planned_end_date: '2026-06-03',
              progress: 10,
              actual_start_date: '2026-05-01',
              actual_end_date: '2026-05-03',
              first_progress_at: '2026-05-01T00:00:00.000Z',
              acceptance_impact_summary: [{ id: 'acceptance-1' }],
              is_critical: true,
              validation_hint: 'missing owner',
            },
          },
        ],
      })

    expect(response.status).toBe(200)
    const createPayload = mocks.createTaskInMainChain.mock.calls[0]?.[0] as Record<string, unknown>
    expect(createPayload).toMatchObject({
      project_id: PROJECT_ID,
      title: 'New task',
      progress: 10,
      status: 'in_progress',
    })
    expect(createPayload).not.toHaveProperty('actual_start_date')
    expect(createPayload).not.toHaveProperty('actual_end_date')
    expect(createPayload).not.toHaveProperty('first_progress_at')

    const createdBroadcast = mocks.broadcastTaskChanged.mock.calls.find(([payload]) => {
      return (payload as { taskId?: string }).taskId === 'created-task-1'
    })?.[0] as { changedFields?: string[] } | undefined
    expect(createdBroadcast).toBeDefined()
    expect(createdBroadcast?.changedFields).not.toContain('actual_start_date')
    expect(createdBroadcast?.changedFields).not.toContain('actual_end_date')
    expect(createdBroadcast?.changedFields).not.toContain('first_progress_at')
  })

  it('strips system-generated progress fact fields from update-row commit payloads', async () => {
    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_row',
            rowId: 'task-1',
            values: {
              progress: 100,
              actual_start_date: '2026-05-01',
              actual_end_date: '2026-05-03',
              first_progress_at: '2026-05-01T00:00:00.000Z',
            },
          },
        ],
      })

    expect(response.status).toBe(200)
    const updatePayload = mocks.updateTaskInMainChain.mock.calls[0]?.[1] as Record<string, unknown>
    expect(updatePayload).toMatchObject({
      progress: 100,
      status: 'completed',
      updated_by: 'user-1',
    })
    expect(updatePayload).not.toHaveProperty('actual_start_date')
    expect(updatePayload).not.toHaveProperty('actual_end_date')
    expect(updatePayload).not.toHaveProperty('first_progress_at')
    expect(updatePayload).not.toHaveProperty('acceptance_impact_summary')
    expect(updatePayload).not.toHaveProperty('is_critical')
    expect(updatePayload).not.toHaveProperty('validation_hint')
  })

  it('ignores forbidden single-cell progress fact and readonly derived edits instead of writing them', async () => {
    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'actual_start_date',
            value: '2026-05-01',
          },
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'actual_end_date',
            value: '2026-05-03',
          },
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'first_progress_at',
            value: '2026-05-01T00:00:00.000Z',
          },
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'acceptance_impact_summary',
            value: [{ id: 'acceptance-1' }],
          },
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'is_critical',
            value: true,
          },
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'validation_hint',
            value: 'missing owner',
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.updateTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.broadcastTaskChanged).not.toHaveBeenCalled()
  })

  it('exposes actual-time correction as a controlled system backfill route', async () => {
    const response = await supertest(buildApp())
      .post('/api/tasks/task-1/actual-time-correction')
      .send({
        version: 1,
        actual_start_date: '2026-05-02',
        actual_end_date: '2026-05-04',
        reason: 'Backfill verified site record',
      })

    expect(response.status).toBe(200)
    expect(mocks.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        actual_start_date: '2026-05-02',
        actual_end_date: '2026-05-04',
        updated_by: 'user-1',
      }),
      1,
      expect.objectContaining({
        executionFactIntent: 'system_backfill',
        executionFactEventDate: '2026-05-04',
        allowManualActualDates: true,
      }),
    )
  })

  it('rejects free-text responsible units while still allowing free-text assignees', async () => {
    const invalid = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_row',
            rowId: 'task-1',
            values: {
              responsible_unit: 'Free text unit',
            },
          },
        ],
      })

    expect(invalid.status).toBe(400)
    expect(invalid.body.error).toMatchObject({
      code: 'RESPONSIBLE_UNIT_LOOKUP_REQUIRED',
    })
    expect(invalid.body.error.details.issues).toContainEqual(expect.objectContaining({
      code: 'RESPONSIBLE_UNIT_LOOKUP_REQUIRED',
      field: 'responsible_unit',
      severity: 'block_save',
      details: expect.objectContaining({ canonicalField: 'participant_unit_id' }),
    }))
    expect(mocks.updateTaskInMainChain).not.toHaveBeenCalled()

    const valid = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_row',
            rowId: 'task-1',
            values: {
              assignee_name: 'Free text assignee',
              participant_unit_id: 'unit-1',
            },
          },
        ],
      })

    expect(valid.status).toBe(200)
    expect(mocks.updateTaskInMainChain).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({
        assignee_name: 'Free text assignee',
        participant_unit_id: 'unit-1',
        updated_by: 'user-1',
      }),
      1,
    )
  })

  it('returns a critical path change summary after saving task-list edits', async () => {
    mocks.getProjectCriticalPathSnapshot.mockResolvedValue({
      displayTaskIds: ['task-1', 'task-old'],
    })
    mocks.recalculateProjectCriticalPath.mockResolvedValue({
      snapshot: {
        displayTaskIds: ['task-1', 'task-2'],
      },
    })

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'planned_end_date',
            value: '2026-05-06',
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.getProjectCriticalPathSnapshot).toHaveBeenCalledWith(PROJECT_ID)
    expect(mocks.recalculateProjectCriticalPath).toHaveBeenCalledWith(PROJECT_ID)
    expect(response.body.data.criticalPathChangeSummary).toEqual({
      changed: true,
      enteredTaskIds: ['task-2'],
      leftTaskIds: ['task-old'],
    })
  })

  it('propagates predecessor cycle protection from the dependency service', async () => {
    mocks.replaceTaskDependencies.mockRejectedValue(Object.assign(
      new Error('Cyclic dependency: task-1 -> task-2'),
      {
        code: 'TASK_DEPENDENCY_CYCLE',
        statusCode: 400,
      },
    ))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'set_predecessors',
            rowId: 'task-1',
            predecessorTaskIds: ['task-2'],
          },
        ],
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject({
      code: 'TASK_DEPENDENCY_CYCLE',
    })
    expect(mocks.recalculateProjectCriticalPath).not.toHaveBeenCalled()
    expect(mocks.broadcastProjectTasksChanged).not.toHaveBeenCalled()
  })

  it('refuses protected row deletes and leaves the task untouched', async () => {
    mocks.supabaseService.getTask.mockResolvedValue(buildTask({ progress: 20, status: 'in_progress' }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'delete_row',
            rowId: 'task-1',
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.deleteTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.executeRetention).not.toHaveBeenCalled()
    expect(response.body.data.deletionResults).toEqual([
      expect.objectContaining({
        rowId: 'task-1',
        action: 'refused',
        reasonCode: 'TASK_DELETE_PROTECTED',
      }),
    ])
  })

  it('passes unprotected task-list deletes through retention before physical deletion', async () => {
    mocks.supabaseService.getTask.mockResolvedValue(buildTask({ title: 'Deletable task' }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        clientContext: {
          requestId: 'request-delete-1',
        },
        operations: [
          {
            type: 'delete_row',
            rowId: 'task-1',
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.executeRetention).toHaveBeenCalledWith(expect.objectContaining({
      entityType: 'task',
      entityId: 'task-1',
      projectId: PROJECT_ID,
      entityNameSnapshot: 'Deletable task',
      userId: 'user-1',
      actorId: 'user-1',
      userAction: 'delete',
      requestId: 'request-delete-1',
      metadata: {
        source: 'task_list_commit',
        surface: 'task_list',
      },
    }))
    expect(mocks.deleteTaskInMainChain).toHaveBeenCalledWith(
      'task-1',
      '00000000-0000-4000-8000-000000000001',
      'user-1',
    )
    expect(response.body.data.deletionResults).toEqual([
      {
        rowId: 'task-1',
        action: 'deleted',
        retention: {
          reasonCode: 'no_reference_physical_delete',
          resolvedAction: 'physical_delete',
          executionMode: 'auto_execute',
        },
      },
    ])
  })

  it('refuses task-list deletes when retention requires confirmation', async () => {
    mocks.supabaseService.getTask.mockResolvedValue(buildTask({ title: 'History task' }))
    mocks.executeRetention.mockResolvedValue(buildRetentionDecision({
      resolvedAction: 'soft_delete',
      decision: 'soft_delete',
      requestedAllowed: false,
      executionMode: 'require_user_confirm',
      executionStatus: 'pending_confirmation',
      requiresUserConfirmation: true,
      reasonCode: 'history_consumer_retained',
      reason: 'The record has history consumers and will be retained.',
      canPhysicalDelete: false,
      referenceSummary: {
        task_baseline_items: 1,
        monthly_plan_items: 1,
      },
    }))

    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'delete_row',
            rowId: 'task-1',
          },
        ],
      })

    expect(response.status).toBe(200)
    expect(mocks.deleteTaskInMainChain).not.toHaveBeenCalled()
    expect(response.body.data.deletionResults).toEqual([
      expect.objectContaining({
        rowId: 'task-1',
        action: 'refused',
        reasonCode: 'RETENTION_CONFIRMATION_REQUIRED',
        message: 'The record has history consumers and will be retained.',
        summary: expect.objectContaining({
          entity_type: 'task',
          entity_id: 'task-1',
          reason_code: 'history_consumer_retained',
          resolved_action: 'soft_delete',
          execution_mode: 'require_user_confirm',
          requires_user_confirmation: true,
          has_baseline_link: true,
          reference_summary: {
            task_baseline_items: 1,
            monthly_plan_items: 1,
          },
          close_action: {
            method: 'POST',
            endpoint: '/api/tasks/task-1/close',
            label: '关闭此记录',
          },
        }),
      }),
    ])
  })

  it('rejects stale task-list commits when the field registry version is missing or old', async () => {
    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.6',
        operations: [
          {
            type: 'update_cell',
            rowId: 'task-1',
            field: 'progress',
            value: 25,
          },
        ],
      })

    expect(response.status).toBe(409)
    expect(response.body.error).toMatchObject({
      code: 'FIELD_REGISTRY_STALE',
      details: {
        expectedVersion: 'v1.4.7.6',
        receivedVersion: 'v1.4.6',
      },
    })
    expect(mocks.updateTaskInMainChain).not.toHaveBeenCalled()
  })

  it('rejects invalid task-list commit operations before writing', async () => {
    const response = await supertest(buildApp())
      .post('/api/tasks/commit')
      .send({
        projectId: PROJECT_ID,
        surface: 'task_list',
        fieldRegistryVersion: 'v1.4.7.6',
        operations: [
          {
            type: 'update_cell',
            field: 'progress',
            value: 25,
          },
        ],
      })

    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject({
      code: 'TASK_COMMIT_INVALID_REQUEST',
      details: {
        issues: [
          expect.objectContaining({
            code: 'PLANNING_OPERATION_ROW_ID_REQUIRED',
          }),
        ],
      },
    })
    expect(mocks.updateTaskInMainChain).not.toHaveBeenCalled()
    expect(mocks.createTaskInMainChain).not.toHaveBeenCalled()
  })
})
