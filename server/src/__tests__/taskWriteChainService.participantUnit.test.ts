import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  createTaskInMainChain as createTaskInMainChainFn,
  createTasksInWizardBatch as createTasksInWizardBatchFn,
  finalizeTaskWriteFromLegacyMutation as finalizeTaskWriteFromLegacyMutationFn,
  reopenTaskInMainChain as reopenTaskInMainChainFn,
  updateTaskInMainChain as updateTaskInMainChainFn,
} from '../services/taskWriteChainService.js'

const state = vi.hoisted(() => {
  let participantUnitRow = {
    id: 'unit-1',
    unit_name: 'responsible-unit',
    project_id: 'project-1',
    unit_status: 'active',
  }

  const taskUpdateProjectEq = vi.fn(async () => ({ error: null }))
  const taskUpdateEq = vi.fn(() => ({ eq: taskUpdateProjectEq }))
  const taskUpdate = vi.fn(() => ({ eq: taskUpdateEq }))
  const participantUnitSingle = vi.fn(async () => ({ data: participantUnitRow, error: null }))
  const participantUnitProjectEq = vi.fn(() => ({ single: participantUnitSingle }))
  const participantUnitEq = vi.fn(() => ({ eq: participantUnitProjectEq }))
  const participantUnitSelect = vi.fn(() => ({ eq: participantUnitEq }))
  const engineeringObjectRow = {
    id: 'building-1',
    project_id: 'project-1',
    object_type: 'building',
    status: 'active',
    path: '/building-1',
  }
  const engineeringObjectMaybeSingle = vi.fn(async () => ({ data: engineeringObjectRow, error: null }))
  const engineeringObjectSecondEq = vi.fn(() => ({ maybeSingle: engineeringObjectMaybeSingle }))
  const engineeringObjectFirstEq = vi.fn(() => ({ eq: engineeringObjectSecondEq }))
  const engineeringObjectProjectEq = vi.fn(async () => ({ data: [engineeringObjectRow], error: null }))
  const engineeringObjectIn = vi.fn(() => ({ eq: engineeringObjectProjectEq }))
  const engineeringObjectSelect = vi.fn((columns: string) => {
    if (columns.includes('id, project_id')) {
      return { in: engineeringObjectIn }
    }
    return { eq: engineeringObjectFirstEq }
  })
  const engineeringCategoryRows = [
    {
      id: 'category-1',
      project_id: 'project-1',
      category_type: 'process',
      category_name: '钢筋绑扎',
      enabled: true,
      standard_work_code: 'REBAR',
      standard_work_name: '钢筋绑扎',
    },
  ]
  const engineeringCategoryMaybeSingle = vi.fn(async () => ({ data: engineeringCategoryRows[0], error: null }))
  const engineeringCategoryIn = vi.fn(async () => ({ data: engineeringCategoryRows, error: null }))
  const engineeringCategoryEq = vi.fn((column: string) => {
    if (column === 'project_id') return { in: engineeringCategoryIn }
    return { maybeSingle: engineeringCategoryMaybeSingle }
  })
  const engineeringCategorySelect = vi.fn(() => ({ eq: engineeringCategoryEq }))
  const from = vi.fn((table: string) => {
    if (table === 'participant_units') {
      return { select: participantUnitSelect }
    }
    if (table === 'engineering_objects') {
      return { select: engineeringObjectSelect }
    }
    if (table === 'engineering_categories') {
      return { select: engineeringCategorySelect }
    }
    if (table === 'tasks') {
      return { update: taskUpdate }
    }
    throw new Error(`unexpected table: ${table}`)
  })

  return {
    createTask: vi.fn(async (_input?: unknown) => ({
      id: 'task-1',
      project_id: 'project-1',
      title: '带责任单位的任务',
      status: 'in_progress',
      progress: 20,
      is_milestone: false,
    })),
    executeSQL: vi.fn(async (_sql?: string, _params?: unknown[]) => []),
    getMembers: vi.fn(async () => []),
    getTask: vi.fn(async () => null),
    recordTaskProgressSnapshot: vi.fn(async () => undefined),
    reopenTask: vi.fn(async (_taskId: string, updates: Record<string, unknown>) => ({
      id: 'task-1',
      project_id: 'project-1',
      title: 'reopened task',
      status: 'in_progress',
      progress: updates.progress ?? 80,
      actual_end_date: null,
      building_object_id: 'building-1',
    })),
    updateTask: vi.fn(async () => null),
    createTasksWithCodeInWizardBatchTransaction: vi.fn(async (inputs: Array<Record<string, unknown>>) => inputs.map((input) => ({
      task: {
        id: input.id,
        project_id: input.project_id,
        title: input.title,
        status: input.status ?? 'todo',
        progress: input.progress ?? 0,
        building_object_id: input.building_object_id ?? 'building-1',
        engineering_category_id: input.engineering_category_id ?? null,
        standard_work_code: input.standard_work_code ?? null,
        standard_work_name: input.standard_work_name ?? null,
        standard_task_metadata: input.standard_task_metadata ?? {},
      },
    }))),
    updateTaskWithCodeInTransaction: vi.fn(async (_taskId: string, updates: Record<string, unknown>) => ({
      task: {
        id: 'task-1',
        project_id: 'project-1',
        title: 'updated task',
        status: 'in_progress',
        progress: updates.progress ?? 20,
        building_object_id: 'building-1',
        ...updates,
      },
    })),
    reopenTaskWithCodeInTransaction: vi.fn(async (_taskId: string, progress: number) => ({
      task: {
        id: 'task-1',
        project_id: 'project-1',
        title: 'reopened task',
        status: 'in_progress',
        progress,
        actual_end_date: null,
        building_object_id: 'building-1',
      },
    })),
    databaseQuery: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    syncExecutionGateSeedTemplatesForTask: vi.fn(async () => ({
      createdConditionCount: 0,
      createdAcceptanceGateCount: 0,
      skippedConditionCount: 0,
      skippedAcceptanceGateCount: 0,
    })),
    inferAndPersistTaskStructuredCauseAttributions: vi.fn(async () => []),
    collectDurationExperienceSampleFromTask: vi.fn(async () => true),
    collectDurationExperienceSampleWithTaskLock: vi.fn(async () => true),
    retireDurationExperienceSampleForTask: vi.fn(async () => true),
    enqueueDurationExperienceCollectionFailure: vi.fn(async () => undefined),
    applyTaskMaterialLifecycleFeedback: vi.fn(async () => undefined),
    enqueuePassiveReorderDetection: vi.fn(async () => undefined),
    supabase: { from },
    from,
    participantUnitSelect,
    participantUnitEq,
    participantUnitSingle,
    setParticipantUnitRow: (row: typeof participantUnitRow) => {
      participantUnitRow = row
    },
    engineeringCategorySelect,
    engineeringCategoryEq,
    engineeringCategoryIn,
    engineeringCategoryMaybeSingle,
    engineeringObjectSelect,
    engineeringObjectIn,
    taskUpdate,
    taskUpdateEq,
    taskUpdateProjectEq,
  }
})

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/systemAnomalyService.js', () => ({
  SystemAnomalyService: class {
    enqueuePassiveReorderDetection = state.enqueuePassiveReorderDetection
  },
}))

vi.mock('../services/warningService.js', () => ({
  WarningService: class {
    evaluate = vi.fn(async () => undefined)
  },
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: vi.fn(async () => null),
}))

vi.mock('../services/statusDictionaryService.js', () => ({
  assertTransition: vi.fn(async () => undefined),
}))

vi.mock('../services/executionGateSeedService.js', () => ({
  syncExecutionGateSeedTemplatesForTask: state.syncExecutionGateSeedTemplatesForTask,
}))

vi.mock('../services/structuredCauseAttributionService.js', () => ({
  inferAndPersistTaskStructuredCauseAttributions: state.inferAndPersistTaskStructuredCauseAttributions,
}))

vi.mock('../services/durationExperienceService.js', () => ({
  collectDurationExperienceSampleFromTask: state.collectDurationExperienceSampleFromTask,
  retireDurationExperienceSampleForTask: state.retireDurationExperienceSampleForTask,
}))

vi.mock('../services/durationExperienceReconciliationService.js', () => ({
  collectDurationExperienceSampleWithTaskLock: state.collectDurationExperienceSampleWithTaskLock,
  enqueueDurationExperienceCollectionFailure: state.enqueueDurationExperienceCollectionFailure,
}))

vi.mock('../services/materialTaskFeedbackService.js', () => ({
  applyTaskMaterialLifecycleFeedback: state.applyTaskMaterialLifecycleFeedback,
}))

vi.mock('../services/upgradeChainService.js', () => ({
  closeDelaySourceRisksForCompletedTask: vi.fn(async () => []),
}))

vi.mock('../services/taskStandardInferenceService.js', () => ({
  applyTaskStandardInferenceForWrite: vi.fn(async () => ({
    standardMapped: false,
    scopeCoverageMapped: false,
  })),
  attachTitleWeakFalsePositiveFeedback: vi.fn(),
  buildTitleWeakFalsePositiveFeedback: vi.fn(() => null),
}))

vi.mock('../services/taskCodeTransactionService.js', () => ({
  createTaskWithCodeInTransaction: vi.fn(async (input) => ({
    task: {
      ...(await state.createTask(input)),
      standard_task_metadata: input?.standard_task_metadata ?? {},
    },
  })),
  createTasksWithCodeInWizardBatchTransaction: state.createTasksWithCodeInWizardBatchTransaction,
  reopenTaskWithCodeInTransaction: state.reopenTaskWithCodeInTransaction,
  updateTaskWithCodeInTransaction: state.updateTaskWithCodeInTransaction,
}))

vi.mock('../services/dbService.js', () => ({
  createTask: state.createTask,
  executeSQL: state.executeSQL,
  getMembers: state.getMembers,
  getTask: state.getTask,
  recordTaskProgressSnapshot: state.recordTaskProgressSnapshot,
  reopenTask: state.reopenTask,
  supabase: state.supabase,
  updateTask: state.updateTask,
}))

vi.mock('../database.js', () => ({
  query: state.databaseQuery,
  isDatabaseTransactionActive: vi.fn(() => false),
  registerDatabasePostCommitEffect: vi.fn(async (_label: string, effect: () => Promise<void>) => effect()),
}))

describe('taskWriteChainService participant unit lookup', () => {
  let createTaskInMainChain: typeof createTaskInMainChainFn
  let createTasksInWizardBatch: typeof createTasksInWizardBatchFn
  let finalizeTaskWriteFromLegacyMutation: typeof finalizeTaskWriteFromLegacyMutationFn
  let reopenTaskInMainChain: typeof reopenTaskInMainChainFn
  let updateTaskInMainChain: typeof updateTaskInMainChainFn

  beforeAll(async () => {
    ;({
      createTaskInMainChain,
      createTasksInWizardBatch,
      finalizeTaskWriteFromLegacyMutation,
      reopenTaskInMainChain,
      updateTaskInMainChain,
    } = await import('../services/taskWriteChainService.js'))
  }, 180_000)

  beforeEach(() => {
    vi.clearAllMocks()
    state.setParticipantUnitRow({
      id: 'unit-1',
      unit_name: 'responsible-unit',
      project_id: 'project-1',
      unit_status: 'active',
    })
    state.getTask.mockResolvedValue(null)
    state.recordTaskProgressSnapshot.mockResolvedValue(undefined)
    state.enqueuePassiveReorderDetection.mockResolvedValue(undefined)
    state.createTasksWithCodeInWizardBatchTransaction.mockClear()
    state.reopenTask.mockImplementation(async (_taskId: string, updates: Record<string, unknown>) => ({
      id: 'task-1',
      project_id: 'project-1',
      title: 'reopened task',
      status: 'in_progress',
      progress: updates.progress ?? 80,
      actual_end_date: null,
      building_object_id: 'building-1',
    }))
    state.updateTaskWithCodeInTransaction.mockImplementation(async (_taskId: string, updates: Record<string, unknown>) => ({
      task: {
        id: 'task-1',
        project_id: 'project-1',
        title: 'updated task',
        status: 'in_progress',
        progress: updates.progress ?? 20,
        building_object_id: 'building-1',
        ...updates,
      },
    }))
  })

  it('syncs seed-backed execution gates after ordinary task creation', async () => {
    await createTaskInMainChain({
      project_id: 'project-1',
      title: 'seed-backed task',
      status: 'todo',
      priority: 'medium',
      progress: 0,
      building_object_id: 'building-1',
      template_id: 'china-gb55032-2022',
      template_node_id: '04-01-01-P07',
      standard_task_metadata: {
        stableCode: '04-01-01-P07',
        sourceStandard: 'GB50300-2013',
        preconditionTemplates: ['working_face_released'],
        acceptanceCheckpoints: ['self_check'],
      },
    }, 'user-1')

    expect(state.syncExecutionGateSeedTemplatesForTask).toHaveBeenCalledWith({
      task: expect.objectContaining({
        id: 'task-1',
        project_id: 'project-1',
      }),
      actorId: 'user-1',
    })
  })

  it('can defer per-task post-create effects for wizard batch generation', async () => {
    await createTaskInMainChain({
      project_id: 'project-1',
      title: 'wizard generated task',
      status: 'todo',
      priority: 'medium',
      progress: 0,
      building_object_id: 'building-1',
      template_id: 'china-gb55032-2022',
      template_node_id: '04-01-01-P07',
      standard_task_metadata: {
        wizardGenerated: true,
        wizardSource: 'project_wizard',
      },
    }, 'user-1', {
      deferPostCreateEffects: true,
      postCreateEffectReason: 'project_wizard_batch_generation',
    })

    expect(state.createTask).toHaveBeenCalled()
    expect(state.syncExecutionGateSeedTemplatesForTask).not.toHaveBeenCalled()
    expect(state.recordTaskProgressSnapshot).not.toHaveBeenCalled()
  })

  it('creates tasks with participant_unit_id without using unsupported OR SQL filters', async () => {
    const result = await createTaskInMainChain({
      project_id: 'project-1',
      title: '带责任单位的任务',
      status: 'in_progress',
      priority: 'medium',
      progress: 20,
      building_object_id: 'building-1',
      participant_unit_id: 'unit-1',
    }, 'user-1')

    expect(result?.participantUnit).toEqual({
      id: 'unit-1',
      unit_name: 'responsible-unit',
    })
    expect(state.executeSQL.mock.calls.map(([sql]) => String(sql))).not.toEqual(
      expect.arrayContaining([expect.stringContaining('participant_units')]),
    )
    expect(state.from).toHaveBeenCalledWith('participant_units')
    expect(state.from).toHaveBeenCalledWith('tasks')
    expect(state.taskUpdate).toHaveBeenCalledWith({
      participant_unit_id: 'unit-1',
      updated_by: 'user-1',
    })
    expect(state.taskUpdateEq).toHaveBeenCalledWith('id', 'task-1')
    expect(state.taskUpdateProjectEq).toHaveBeenCalledWith('project_id', 'project-1')
  })

  it('infers duration_contribution_mode before creating ordinary task rows', async () => {
    await createTaskInMainChain({
      project_id: 'project-1',
      title: '钢筋绑扎安装',
      status: 'todo',
      priority: 'medium',
      progress: 0,
      building_object_id: 'building-1',
      wbs_node_type: 'process',
    }, 'user-1')

    expect(state.createTask).toHaveBeenCalledWith(expect.objectContaining({
      duration_contribution_mode: 'duration_bearing',
      standard_task_metadata: expect.objectContaining({
        durationContributionMode: 'duration_bearing',
      }),
    }))
  })

  it('preloads engineering categories once for wizard batch task creation', async () => {
    await createTasksInWizardBatch([
      {
        clientRowId: 'row-1',
        payload: {
          id: 'task-1',
          project_id: 'project-1',
          title: '钢筋绑扎',
          status: 'todo',
          priority: 'medium',
          progress: 0,
          building_object_id: 'building-1',
          engineering_category_id: 'category-1',
          wbs_node_type: 'process',
        },
      },
      {
        clientRowId: 'row-2',
        payload: {
          id: 'task-2',
          project_id: 'project-1',
          title: '钢筋复核',
          status: 'todo',
          priority: 'medium',
          progress: 0,
          building_object_id: 'building-1',
          engineering_category_id: 'category-1',
          wbs_node_type: 'activity_step',
        },
      },
    ], 'user-1', {
      trustPrevalidatedScope: true,
      skipStandardInference: true,
      deferPostCreateEffects: true,
    })

    expect(state.from).toHaveBeenCalledWith('engineering_categories')
    expect(state.engineeringCategoryIn).toHaveBeenCalledTimes(1)
    expect(state.engineeringCategoryIn).toHaveBeenCalledWith('id', ['category-1'])
    expect(state.engineeringCategoryMaybeSingle).not.toHaveBeenCalled()
    expect(state.createTasksWithCodeInWizardBatchTransaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task-1',
          standard_work_code: 'REBAR',
          standard_work_name: '钢筋绑扎',
        }),
        expect.objectContaining({
          id: 'task-2',
          standard_work_code: 'REBAR',
          standard_work_name: '钢筋绑扎',
        }),
      ]),
      'user-1',
      undefined,
    )
  })

  it('derives child WBS fields from an authoritative external drilldown parent', async () => {
    await createTasksInWizardBatch([{
      clientRowId: 'generated-process-1',
      parentClientRowId: 'existing-parent-task',
      payload: {
        id: 'generated-task-1',
        project_id: 'project-1',
        parent_id: 'existing-parent-task',
        title: '墙柱钢筋绑扎',
        status: 'todo',
        priority: 'medium',
        progress: 0,
        building_object_id: 'building-1',
        template_id: 'china-gb55032-2022',
        template_node_id: '02-01-01-P01',
        wbs_node_type: 'process',
      },
    }], 'user-1', {
      trustPrevalidatedScope: true,
      skipStandardInference: true,
      deferPostCreateEffects: true,
      externalParentContext: {
        id: 'existing-parent-task',
        clientRowId: 'existing-parent-task',
        wbsNodeType: 'item_work',
        wbsCode: '4.2',
        wbsPath: '/root/existing-parent-task',
        childCount: 3,
      },
    })

    expect(state.createTasksWithCodeInWizardBatchTransaction).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'generated-task-1',
        parent_id: 'existing-parent-task',
        wbs_node_type: 'process',
        wbs_code: '4.2.4',
        wbs_path: '/root/existing-parent-task/generated-task-1',
        wbs_level: 3,
        is_executable: true,
        is_wbs_summary: false,
      }),
    ], 'user-1', undefined)
  })

  it('derives execution facts before creating an already completed task', async () => {
    await createTaskInMainChain({
      project_id: 'project-1',
      title: 'completed from project modeling',
      status: 'completed',
      priority: 'medium',
      progress: 0,
      building_object_id: 'building-1',
    }, 'user-1')

    expect(state.createTask).toHaveBeenCalledWith(expect.objectContaining({
      status: 'completed',
      progress: 100,
      actual_start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      actual_end_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      first_progress_at: expect.any(String),
    }))
  })

  it('keeps the committed task update successful when a post-commit snapshot side effect fails', async () => {
    state.getTask.mockResolvedValue({
      id: 'task-1',
      project_id: 'project-1',
      title: 'previous task',
      status: 'in_progress',
      progress: 0,
      building_object_id: 'building-1',
      version: 1,
    })
    state.recordTaskProgressSnapshot.mockRejectedValueOnce(new Error('snapshot write failed'))

    await expect(updateTaskInMainChain(
      'task-1',
      { progress: 20, updated_by: 'user-1' },
      1,
    )).resolves.toMatchObject({
      task: expect.objectContaining({
        id: 'task-1',
        progress: 20,
      }),
    })

    expect(state.updateTaskWithCodeInTransaction).toHaveBeenCalled()
    expect(state.recordTaskProgressSnapshot).toHaveBeenCalled()
  })

  it('keeps the committed task creation successful when the create snapshot side effect fails', async () => {
    state.recordTaskProgressSnapshot.mockRejectedValueOnce(new Error('snapshot write failed'))

    await expect(createTaskInMainChain({
      project_id: 'project-1',
      title: 'snapshot failure tolerant create',
      status: 'in_progress',
      priority: 'medium',
      progress: 20,
      building_object_id: 'building-1',
    }, 'user-1')).resolves.toMatchObject({
      task: expect.objectContaining({
        id: 'task-1',
      }),
    })

    expect(state.createTask).toHaveBeenCalled()
    expect(state.recordTaskProgressSnapshot).toHaveBeenCalled()
  })

  it('keeps reopen progress below 100 and clears actual end through the main chain', async () => {
    state.getTask.mockResolvedValue({
      id: 'task-1',
      project_id: 'project-1',
      title: 'completed task',
      status: 'completed',
      progress: 100,
      actual_start_date: '2026-05-01',
      actual_end_date: '2026-05-05',
      building_object_id: 'building-1',
      version: 3,
    })

    const result = await reopenTaskInMainChain('task-1', 80, 3, 'user-1')

    expect(state.reopenTask).not.toHaveBeenCalled()
    expect(state.reopenTaskWithCodeInTransaction).toHaveBeenCalledWith(
      'task-1',
      80,
      3,
      'user-1',
      'project-1',
    )
    expect(result?.task).toMatchObject({
      id: 'task-1',
      status: 'in_progress',
      progress: 80,
      actual_end_date: null,
    })
    expect(state.recordTaskProgressSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        progress: 80,
        actual_end_date: null,
      }),
      expect.objectContaining({ recordedBy: 'user-1' }),
      expect.objectContaining({ progress: 100 }),
    )
  })

  it('infers structured task causes before collecting the completion learning sample', async () => {
    const previousTask = {
      id: 'task-1',
      project_id: 'project-1',
      title: 'material-delayed task',
      status: 'in_progress',
      progress: 80,
      planned_start_date: '2026-04-01',
      planned_end_date: '2026-04-10',
      actual_start_date: '2026-04-01',
      building_object_id: 'building-1',
      version: 3,
    } as any
    const completedTask = {
      ...previousTask,
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-04-18',
      updated_by: 'user-1',
      version: 4,
    } as any

    await finalizeTaskWriteFromLegacyMutation(completedTask, previousTask, 'user-1')

    expect(state.inferAndPersistTaskStructuredCauseAttributions).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: 'task-1', status: 'completed' }),
    })
    expect(state.collectDurationExperienceSampleWithTaskLock).toHaveBeenCalledWith({
      projectId: 'project-1',
      taskId: 'task-1',
      previousTask: expect.objectContaining({ id: 'task-1', status: 'in_progress' }),
      actorId: 'user-1',
      trigger: 'task_completion',
    })
    expect(state.inferAndPersistTaskStructuredCauseAttributions.mock.invocationCallOrder[0])
      .toBeLessThan(state.collectDurationExperienceSampleWithTaskLock.mock.invocationCallOrder[0])
  })

  it('passes the controlled correction reason into the transactional task writer', async () => {
    state.getTask.mockResolvedValue({
      id: 'task-1',
      project_id: 'project-1',
      title: 'corrected task',
      status: 'in_progress',
      progress: 40,
      actual_start_date: '2026-06-01',
      actual_end_date: null,
      first_progress_at: '2026-06-01T08:00:00.000Z',
      building_object_id: 'building-1',
      version: 3,
    })

    await updateTaskInMainChain(
      'task-1',
      { actual_end_date: '2026-06-05', updated_by: 'user-1' },
      3,
      {
        allowManualActualDates: true,
        executionFactCorrectionReason: 'Verified against signed site record',
      },
    )

    expect(state.updateTaskWithCodeInTransaction).toHaveBeenCalledWith(
      'task-1',
      expect.objectContaining({ actual_end_date: '2026-06-05' }),
      3,
      'user-1',
      'project-1',
      { correctionReason: 'Verified against signed site record' },
    )
  })

  it('reports partial canonical finalization failure after attempting later recoverable steps', async () => {
    const previousTask = {
      id: 'task-1',
      project_id: 'project-1',
      status: 'in_progress',
      progress: 80,
      building_object_id: 'building-1',
    } as any
    const completedTask = {
      ...previousTask,
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-04-18',
    } as any
    state.inferAndPersistTaskStructuredCauseAttributions.mockRejectedValueOnce(
      new Error('structured cause store unavailable'),
    )

    await expect(finalizeTaskWriteFromLegacyMutation(
      completedTask,
      previousTask,
      'user-1',
    )).rejects.toMatchObject({
      name: 'TaskWriteFinalizationIncompleteError',
      details: expect.objectContaining({
        taskId: 'task-1',
        failedSteps: expect.arrayContaining([
          expect.objectContaining({ step: 'infer_structured_causes' }),
        ]),
      }),
    })
    expect(state.collectDurationExperienceSampleWithTaskLock).toHaveBeenCalled()
    expect(state.applyTaskMaterialLifecycleFeedback).toHaveBeenCalled()
  })

  it('reports asynchronous passive reorder enqueue failure as retryable finalization work', async () => {
    const previousTask = {
      id: 'task-1',
      project_id: 'project-1',
      status: 'in_progress',
      progress: 80,
      building_object_id: 'building-1',
    } as any
    const completedTask = {
      ...previousTask,
      status: 'completed',
      progress: 100,
      actual_end_date: '2026-04-18',
    } as any
    state.enqueuePassiveReorderDetection.mockRejectedValueOnce(
      new Error('passive reorder queue unavailable'),
    )

    await expect(finalizeTaskWriteFromLegacyMutation(
      completedTask,
      previousTask,
      'user-1',
    )).rejects.toMatchObject({
      name: 'TaskWriteFinalizationIncompleteError',
      details: expect.objectContaining({
        taskId: 'task-1',
        failedSteps: expect.arrayContaining([
          expect.objectContaining({ step: 'queue_passive_reorder_detection' }),
        ]),
      }),
    })
  })

  it('rejects disabled participant units before creating the task row', async () => {
    state.setParticipantUnitRow({
      id: 'unit-1',
      unit_name: 'responsible-unit',
      project_id: 'project-1',
      unit_status: 'disabled',
    })

    await expect(createTaskInMainChain({
      project_id: 'project-1',
      title: 'disabled unit task',
      status: 'in_progress',
      priority: 'medium',
      progress: 20,
      building_object_id: 'building-1',
      participant_unit_id: 'unit-1',
    }, 'user-1')).rejects.toMatchObject({
      code: 'PARTICIPANT_UNIT_NOT_FOUND',
      statusCode: 400,
    })

    expect(state.createTask).not.toHaveBeenCalled()
    expect(state.taskUpdate).not.toHaveBeenCalled()
  })

  it('rejects active task creation without any engineering scope object before creating the task row', async () => {
    await expect(createTaskInMainChain({
      project_id: 'project-1',
      title: 'active task missing engineering scope',
      status: 'in_progress',
      priority: 'medium',
      progress: 20,
      participant_unit_id: 'unit-1',
    }, 'user-1')).rejects.toMatchObject({
      code: 'SCOPE_OBJECT_REQUIRED',
      statusCode: 400,
    })

    expect(state.createTask).not.toHaveBeenCalled()
    expect(state.taskUpdate).not.toHaveBeenCalled()
  })
})
