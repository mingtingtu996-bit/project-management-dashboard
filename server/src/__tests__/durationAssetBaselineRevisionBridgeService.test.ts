import { describe, expect, it, vi } from 'vitest'
import {
  buildDurationAssetBaselineProjection,
  createInMemoryDurationAssetBaselineRevisionOperationStore,
  runDurationAssetBaselineRevisionBridge,
  scanStableDurationPublicationBaselineImpacts,
  type DurationAssetBaselineProjection,
} from '../services/durationAssetBaselineRevisionBridgeService.js'

const baseline = {
  id: 'baseline-1',
  project_id: 'project-1',
  title: 'Execution baseline v1',
  status: 'confirmed' as const,
  source_type: 'current_schedule' as const,
}

const publication = {
  publicationKey: 'publication-stable-1',
  publicationStatus: 'published' as const,
  parameterKey: 'duration.benchmark_blend_weight',
  companyId: 'company-1',
  projectId: 'project-1',
  publishedAt: '2026-07-11T06:20:00.000Z',
  rollbackTarget: 'duration.benchmark_blend_weight.default',
}

function beforeProjection(): DurationAssetBaselineProjection {
  return {
    tasks: [
      {
        taskId: 'task-1',
        title: '主体结构',
        durationDays: 30,
        plannedStartDate: '2026-07-01',
        plannedEndDate: '2026-07-30',
      },
      {
        taskId: 'task-2',
        title: '二次结构',
        durationDays: 20,
        plannedStartDate: '2026-07-31',
        plannedEndDate: '2026-08-19',
      },
    ],
    dependencies: [{ predecessorId: 'task-1', successorId: 'task-2', type: 'FS', lagDays: 0 }],
  }
}

function dependencies() {
  return {
    markPendingRealign: vi.fn(async () => ({ status: 'pending_realign' as const })),
    submitObservationPoolItems: vi.fn(async () => ({
      submitted_count: 1,
      candidate_ids: ['candidate-1'],
    })),
    startRevisionFromBaseline: vi.fn(async () => ({
      revision_id: 'revision-1',
      status: 'revising' as const,
      source_version_id: baseline.id,
      created_at: '2026-07-11T07:00:00.000Z',
    })),
  }
}

describe('durationAssetBaselineRevisionBridgeService', () => {
  it('does not create a revision when no-write recalculation has no material diff', async () => {
    const effects = dependencies()
    const result = await runDurationAssetBaselineRevisionBridge({
      publication,
      baseline,
      beforeProjection: beforeProjection(),
      recalculateNoWrite: async () => beforeProjection(),
      operationStore: createInMemoryDurationAssetBaselineRevisionOperationStore(),
      dependencies: effects,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'no_revision_required',
      changedFields: [],
      revisionId: null,
      confirmationRequired: false,
    }))
    expect(effects.markPendingRealign).not.toHaveBeenCalled()
    expect(effects.submitObservationPoolItems).not.toHaveBeenCalled()
    expect(effects.startRevisionFromBaseline).not.toHaveBeenCalled()
  })

  it('creates one revising draft for duration/date/dependency changes and never confirms it', async () => {
    const effects = dependencies()
    const store = createInMemoryDurationAssetBaselineRevisionOperationStore()
    const changedProjection: DurationAssetBaselineProjection = {
      tasks: [
        {
          taskId: 'task-1',
          title: '主体结构',
          durationDays: 27,
          plannedStartDate: '2026-07-01',
          plannedEndDate: '2026-07-27',
        },
        {
          taskId: 'task-2',
          title: '二次结构',
          durationDays: 20,
          plannedStartDate: '2026-07-29',
          plannedEndDate: '2026-08-17',
        },
      ],
      dependencies: [{ predecessorId: 'task-1', successorId: 'task-2', type: 'FS', lagDays: 1 }],
    }
    const input = {
      publication,
      baseline,
      beforeProjection: beforeProjection(),
      recalculateNoWrite: async () => changedProjection,
      operationStore: store,
      dependencies: effects,
    }

    const first = await runDurationAssetBaselineRevisionBridge(input)
    const retried = await runDurationAssetBaselineRevisionBridge(input)

    expect(first).toEqual(expect.objectContaining({
      status: 'revision_draft_created',
      revisionId: 'revision-1',
      revisionStatus: 'revising',
      confirmationRequired: true,
      autoConfirmed: false,
      changedFields: expect.arrayContaining(['duration', 'dates', 'dependency']),
      idempotencyKey: 'publication-stable-1:baseline-1',
    }))
    expect(retried).toEqual(first)
    expect(effects.markPendingRealign).toHaveBeenCalledTimes(1)
    expect(effects.markPendingRealign).toHaveBeenCalledWith(expect.objectContaining({
      baseline,
      publication,
    }))
    expect(effects.submitObservationPoolItems).toHaveBeenCalledTimes(1)
    expect(effects.submitObservationPoolItems).toHaveBeenCalledWith(expect.objectContaining({
      baseline: expect.objectContaining({ ...baseline, status: 'pending_realign' }),
      idempotencyKey: 'publication-stable-1:baseline-1:revision_pool',
      payload: expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({
            source_id: 'publication-stable-1:baseline-1',
            source_type: 'deviation',
          }),
        ]),
      }),
    }))
    expect(effects.startRevisionFromBaseline).toHaveBeenCalledTimes(1)
    expect(effects.startRevisionFromBaseline).toHaveBeenCalledWith(expect.objectContaining({
      baseline: expect.objectContaining({ ...baseline, status: 'pending_realign' }),
      actorUserId: null,
      idempotencyKey: 'publication-stable-1:baseline-1:revision_draft',
      sourceCandidateIds: ['candidate-1'],
    }))
  })

  it('blocks candidate and canary publications from changing a confirmed baseline', async () => {
    const effects = dependencies()
    const result = await runDurationAssetBaselineRevisionBridge({
      publication: { ...publication, publicationStatus: 'canary' },
      baseline,
      beforeProjection: beforeProjection(),
      recalculateNoWrite: async () => beforeProjection(),
      operationStore: createInMemoryDurationAssetBaselineRevisionOperationStore(),
      dependencies: effects,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: ['stable_publication_required'],
      revisionId: null,
    }))
    expect(effects.markPendingRealign).not.toHaveBeenCalled()
  })

  it('blocks a stable publication without a rollback target from changing a baseline', async () => {
    const effects = dependencies()
    const result = await runDurationAssetBaselineRevisionBridge({
      publication: { ...publication, rollbackTarget: null },
      baseline,
      beforeProjection: beforeProjection(),
      recalculateNoWrite: async () => beforeProjection(),
      operationStore: createInMemoryDurationAssetBaselineRevisionOperationStore(),
      dependencies: effects,
    })

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      reasonCodes: ['rollback_target_required'],
    }))
    expect(effects.markPendingRealign).not.toHaveBeenCalled()
  })

  it('scans only stable duration publications and their affected execution baselines', async () => {
    const effects = dependencies()
    const currentItems = [
      {
        id: 'item-1',
        project_id: 'project-1',
        baseline_version_id: baseline.id,
        source_task_id: 'task-1',
        title: 'main structure',
        planned_start_date: '2026-07-01',
        planned_end_date: '2026-07-30',
        sort_order: 1,
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T00:00:00.000Z',
      },
    ]
    const loadStablePublications = vi.fn(async () => [publication])
    const listAffectedProjectIds = vi.fn(async () => ['project-1'])
    const getCurrentExecutionBaseline = vi.fn(async () => ({
      ...baseline,
      version: 1,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    }))
    const getBaselineItems = vi.fn(async () => currentItems)
    const loadProjectDependencies = vi.fn(async () => [])
    const isPublicationEffectiveForProject = vi.fn(async () => true)
    const recalculateBaselineNoWrite = vi.fn(async ({ beforeProjection }: any) => ({
      ...beforeProjection,
      tasks: beforeProjection.tasks.map((task: any) => ({
        ...task,
        durationDays: 27,
        plannedEndDate: '2026-07-27',
      })),
    }))

    const reports = await scanStableDurationPublicationBaselineImpacts({
      projectIds: ['project-1'],
      operationStore: createInMemoryDurationAssetBaselineRevisionOperationStore(),
      dependencies: {
        loadStablePublications,
        listAffectedProjectIds,
        getCurrentExecutionBaseline,
        getBaselineItems,
        loadProjectDependencies,
        isPublicationEffectiveForProject,
        recalculateBaselineNoWrite,
        revision: effects,
      },
    })

    expect(reports).toEqual([
      expect.objectContaining({
        status: 'revision_draft_created',
        publicationKey: publication.publicationKey,
        projectId: 'project-1',
        baselineId: baseline.id,
        confirmationRequired: true,
      }),
    ])
    expect(loadStablePublications).toHaveBeenCalledTimes(1)
    expect(listAffectedProjectIds).toHaveBeenCalledWith(publication, ['project-1'])
    expect(isPublicationEffectiveForProject).toHaveBeenCalledWith(publication, 'project-1')
    expect(recalculateBaselineNoWrite).toHaveBeenCalledWith(expect.objectContaining({
      publication,
      baseline: expect.objectContaining({ id: baseline.id }),
      beforeProjection: buildDurationAssetBaselineProjection(currentItems, []),
    }))
  })
})
