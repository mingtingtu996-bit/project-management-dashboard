import { describe, expect, it, vi } from 'vitest'

const databaseMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
}))

vi.mock('../database.js', () => ({
  getClient: databaseMocks.getClient,
  query: vi.fn(async () => ({ rows: [] })),
  registerDatabasePostCommitEffect: vi.fn(),
  withDatabaseTransaction: vi.fn(),
}))

import {
  promoteDurationBenchmarkRuntimeCanaryAtomically,
  stageDurationBenchmarkCandidateAtomically,
} from '../services/durationLearningAssetAtomicStoreService.js'
import { reconcileDurationExperienceSamples } from '../services/durationExperienceReconciliationService.js'
import { rebuildDurationExperienceSampleForTask } from '../services/durationExperienceReconciliationService.js'
import { recordUserConfirmedStructuredCauseAttribution } from '../services/structuredCauseAttributionService.js'
import {
  buildDurationBenchmarkCandidatePersistenceRow,
  buildDurationBenchmarkCandidates,
  type DurationExperienceSampleRow,
} from '../services/templateDurationGovernanceService.js'
import type {
  DurationExperienceReconciliationQueueItem,
  DurationExperienceReconciliationStore,
} from '../services/durationExperienceReconciliationService.js'

const companyId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const taskId = '33333333-3333-4333-8333-333333333333'
const attributionId = '44444444-4444-4444-8444-444444444444'
const sampleId = '55555555-5555-4555-8555-555555555555'
const benchmarkId = '66666666-6666-4666-8666-666666666666'
const queueId = '77777777-7777-4777-8777-777777777777'
const canarySampleId = '88888888-8888-4888-8888-888888888888'
const publicationKey = 'duration-learning:wave-3:frozen-lineage'
const queueGenerationA = '2026-07-23 08:00:00.000001+00'
const queueGenerationB = '2026-07-23 08:00:00.000002+00'

function sample(input: Partial<DurationExperienceSampleRow> & Pick<DurationExperienceSampleRow, 'id' | 'task_id'>) {
  return {
    company_id: companyId,
    project_id: projectId,
    completed_at: '2026-07-10T00:00:00.000Z',
    created_at: '2026-07-10T01:00:00.000Z',
    updated_at: '2026-07-10T02:00:00.000Z',
    standard_work_code: 'SW-WAVE-3',
    wbs_node_type: 'process',
    actual_duration_production_days: 6,
    duration_day_basis: 'construction_production_day',
    evidence_fingerprint: `fingerprint:${input.id}`,
    source_lineage: { schemaVersion: 'duration-experience-sample/v1', completionId: `completion:${input.id}` },
    metadata: {
      construction_calendar_ref: 'cn-work-calendar',
      construction_calendar_version: '2026.07',
      construction_calendar_basis: 'official_construction_calendar_seed',
      construction_calendar_availability: 'available',
      construction_calendar_timezone: 'Asia/Shanghai',
      structured_cause_snapshot: { confirmed_causes: [] },
    },
    ...input,
  } satisfies DurationExperienceSampleRow
}

describe('Wave 3 frozen lineage and durable rebuild chain', () => {
  it('recovers confirmed evidence durably and promotes only the frozen pre-canary sample set', async () => {
    const confirmation = {
      attribution_id: attributionId,
      cause_code: 'material_shortage',
      taxonomy_version: 'v1.0.0',
      event_type: 'completion',
      cause_role: 'primary',
      confirmed_at: '2026-07-20T00:00:00.000Z',
    }
    let completionSample = sample({
      id: sampleId,
      task_id: taskId,
      completed_at: '2026-07-18T00:00:00.000Z',
      created_at: '2026-07-18T01:00:00.000Z',
      updated_at: '2026-07-18T02:00:00.000Z',
      actual_duration_production_days: 6,
    })
    const peerSamples = [
      sample({
        id: '99999999-9999-4999-8999-999999999991',
        task_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        actual_duration_production_days: 7,
      }),
      sample({
        id: '99999999-9999-4999-8999-999999999992',
        task_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        actual_duration_production_days: 8,
      }),
    ]
    let queueStatus: 'pending' | 'completed' | null = null
    let queuedItem: DurationExperienceReconciliationQueueItem | null = null
    let currentQueueGeneration = ''
    let enqueueCount = 0
    const postCommitEffects: Array<() => Promise<void>> = []
    const enqueueDurationExperienceRebuild = vi.fn(async (input: Record<string, unknown>) => {
      const generationToken = enqueueCount++ === 0 ? queueGenerationA : queueGenerationB
      currentQueueGeneration = generationToken
      queueStatus = 'pending'
      queuedItem = {
        id: queueId,
        companyId,
        projectId,
        taskId,
        actorId: String(input.actorId),
        trigger: String(input.trigger),
        sourceType: 'structured_cause_confirmation',
        generationToken,
        attemptCount: 0,
        maxAttempts: 5,
        task: { id: taskId, project_id: projectId, status: 'completed' } as DurationExperienceReconciliationQueueItem['task'],
      }
      return { id: queueId, generationToken }
    })
    const completeDurationExperienceRebuild = vi.fn(async (generation: {
      id: string
      generationToken: string
    }) => {
      expect(generation.id).toBe(queueId)
      if (generation.generationToken !== currentQueueGeneration) return false
      queueStatus = 'completed'
      return true
    })
    const confirmationQuery = vi.fn(async (sql: string) => {
      if (sql.includes('FROM public.projects')) return { rows: [{ company_id: companyId }], rowCount: 1 }
      if (sql.includes('FROM public.tasks')) return { rows: [{ id: taskId }], rowCount: 1 }
      if (sql.includes('INSERT INTO public.structured_cause_attributions')) {
        return { rows: [{ id: attributionId, status: 'confirmed', ...confirmation }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    })
    const failedPostCommitCollect = vi.fn(async () => {
      throw new Error('simulated rebuild outage')
    })

    await recordUserConfirmedStructuredCauseAttribution({
      companyId,
      projectId,
      subjectType: 'task',
      subjectId: taskId,
      eventType: 'completion',
      causeCode: 'material_shortage',
      causeRole: 'primary',
      rawText: 'Material delivery caused the completed-task variance.',
      actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }, {
      queryExec: confirmationQuery,
      withTransaction: async (work) => work(),
      enqueueDurationExperienceRebuild,
      completeDurationExperienceRebuild,
      registerPostCommitEffect: async (_label, effect) => { postCommitEffects.push(effect) },
      rebuildTaskDurationExperienceSample: (input) => rebuildDurationExperienceSampleForTask(input, {
        queryExec: async () => ({ rows: [{ id: taskId, project_id: projectId, status: 'completed' }] }),
        withTransaction: async (work) => work(),
        collectSample: failedPostCommitCollect,
      }),
    })

    expect(enqueueDurationExperienceRebuild).toHaveBeenCalledOnce()
    expect(queueStatus).toBe('pending')
    expect(postCommitEffects).toHaveLength(1)
    await expect(postCommitEffects[0]()).rejects.toThrow('simulated rebuild outage')
    expect(queueStatus).toBe('pending')
    expect(completeDurationExperienceRebuild).not.toHaveBeenCalled()

    const generationB = await enqueueDurationExperienceRebuild({
      actorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      trigger: 'structured_cause_user_confirmation',
    })
    expect(generationB).toEqual({ id: queueId, generationToken: queueGenerationB })
    await expect(completeDurationExperienceRebuild({
      id: queueId, generationToken: queueGenerationA,
    })).resolves.toBe(false)
    expect(queueStatus).toBe('pending')

    const workerStore = {
      enqueue: vi.fn(),
      registerMissingCompletedTasks: vi.fn(async () => 0),
      listDue: vi.fn(async () => queuedItem ? [queuedItem] : []),
      markCompleted: vi.fn(async (id: string, generation) => {
        expect(id).toBe(queueId)
        expect(generation).toEqual({
          generationToken: queueGenerationB,
          expectedStatus: 'retrying',
        })
        queueStatus = 'completed'
        return true
      }),
      markDeferred: vi.fn(async () => true),
      markFailed: vi.fn(async () => true),
    } satisfies DurationExperienceReconciliationStore
    const recoveryCollect = vi.fn(async (_task, options) => {
      expect(options).toEqual({
        actorId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        trigger: 'structured_cause_user_confirmation',
      })
      completionSample = sample({
        ...completionSample,
        updated_at: '2026-07-20T01:00:00.000Z',
        evidence_fingerprint: 'fingerprint:confirmed-completion',
        source_lineage: { schemaVersion: 'duration-experience-sample/v1', completionId: `completion:${sampleId}` },
        metadata: {
          ...completionSample.metadata,
          structured_cause_snapshot: { confirmed_causes: [confirmation] },
        },
      })
      return true
    })
    await expect(reconcileDurationExperienceSamples({ projectIds: [projectId] }, {
      store: workerStore,
      queryExec: async () => ({ rows: [queuedItem!.task], rowCount: 1 }),
      withTransaction: async (work) => work(),
      collectSample: recoveryCollect,
    })).resolves.toEqual(expect.objectContaining({ recovered: 1, retrying: 0, deadLettered: 0 }))
    expect(queueStatus).toBe('completed')

    const [candidate] = buildDurationBenchmarkCandidates(
      [completionSample, ...peerSamples],
      { generatedAt: '2026-07-21T00:00:00.000Z' },
    )
    const dayOneRow = {
      ...buildDurationBenchmarkCandidatePersistenceRow(candidate, '2026-07-21T00:00:00.000Z'),
      id: benchmarkId,
    }
    const dayTwoRow = buildDurationBenchmarkCandidatePersistenceRow(candidate, '2026-07-22T00:00:00.000Z')
    let stagedBenchmark: Record<string, any> | null = null
    let publication: Record<string, any> | null = null
    let persistedSegment: Record<string, any> | null = null
    const canaryOnlySample = sample({
      id: canarySampleId,
      task_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      completed_at: '2026-07-12T00:00:00.000Z',
      created_at: '2026-07-22T01:00:00.000Z',
      updated_at: '2026-07-22T02:00:00.000Z',
      evidence_fingerprint: 'fingerprint:canary-only',
      actual_duration_production_days: 30,
      metadata: {
        construction_calendar_ref: 'cn-work-calendar',
        construction_calendar_version: '2026.07',
        structured_cause_snapshot: { confirmed_causes: [{
          ...confirmation,
          attribution_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        }] },
      },
    })

    const databaseRow = (source: DurationExperienceSampleRow, cause?: Record<string, unknown>) => ({
      sample_id: source.id,
      sample_task_id: source.task_id,
      sample_completed_at: source.completed_at,
      sample_created_at: source.created_at,
      sample_updated_at: source.updated_at,
      sample_evidence_fingerprint: source.evidence_fingerprint,
      sample_source_lineage: source.source_lineage,
      actual_duration_production_days: source.actual_duration_production_days,
      sample_company_id: source.company_id,
      sample_project_id: source.project_id,
      attribution_company_id: cause ? companyId : null,
      attribution_project_id: cause ? projectId : null,
      attribution_status: cause ? 'confirmed' : null,
      attribution_subject_type: cause ? 'task' : null,
      attribution_subject_id: cause ? source.task_id : null,
      attribution_id: cause?.attribution_id ?? null,
      cause_code: cause?.cause_code ?? null,
      taxonomy_version: cause?.taxonomy_version ?? null,
      attribution_event_type: cause?.event_type ?? null,
      cause_role: cause?.cause_role ?? null,
      confirmed_at: cause?.confirmed_at ?? null,
      source_type: 'task_completion',
      snapshot_attribution_id: cause?.attribution_id ?? null,
      snapshot_cause_code: cause?.cause_code ?? null,
      snapshot_taxonomy_version: cause?.taxonomy_version ?? null,
      snapshot_event_type: cause?.event_type ?? null,
      snapshot_cause_role: cause?.cause_role ?? null,
      snapshot_confirmed_at: cause?.confirmed_at ?? null,
      snapshot_primary_count: cause ? 1 : 0,
      included_in_benchmark: true,
      sample_strength: 'strong',
      duration_day_basis: 'construction_production_day',
      calendar_ref: 'cn-work-calendar',
      calendar_version: '2026.07',
    })
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
        if (['begin', 'commit', 'rollback'].includes(normalized)) return { rows: [], rowCount: 0 }
        if (normalized.includes('from public.projects')) return { rows: [{ company_id: companyId }], rowCount: 1 }
        if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 }
        if (normalized.includes("metadata ->> 'candidate_operation_id'")) {
          return { rows: stagedBenchmark ? [stagedBenchmark] : [], rowCount: stagedBenchmark ? 1 : 0 }
        }
        if (normalized.includes('insert into public.duration_benchmarks')) {
          stagedBenchmark = { ...dayOneRow, is_current: false, is_active: true }
          return { rows: [stagedBenchmark], rowCount: 1 }
        }
        if (normalized.includes('from public.duration_learning_runtime_publications')) {
          return { rows: publication ? [publication] : [], rowCount: publication ? 1 : 0 }
        }
        if (normalized.includes('from public.duration_benchmarks') && normalized.includes('where id = $1::uuid')) {
          return { rows: stagedBenchmark ? [stagedBenchmark] : [], rowCount: stagedBenchmark ? 1 : 0 }
        }
        if (normalized.includes('promote_duration_learning_runtime_canary')) {
          publication!.publication_stage = 'stable'
          return { rows: [{ target_previous_publication_key: null }], rowCount: 1 }
        }
        if (normalized.includes('update public.duration_benchmarks') && normalized.includes('id <>')) {
          return { rows: [], rowCount: 0 }
        }
        if (normalized.includes('update public.duration_benchmarks') && normalized.includes('runtime_publication_status')) {
          stagedBenchmark = { ...stagedBenchmark, is_current: true }
          return { rows: [stagedBenchmark], rowCount: 1 }
        }
        if (normalized.includes('from public.duration_experience_samples sample')) {
          if (normalized.includes('sample.id = any')) {
            return {
              rows: [
                databaseRow(completionSample, confirmation),
                ...peerSamples.map((item) => databaseRow(item)),
              ],
              rowCount: 3,
            }
          }
          return {
            rows: [
              databaseRow(completionSample, confirmation),
              databaseRow(
                canaryOnlySample,
                (canaryOnlySample.metadata?.structured_cause_snapshot as {
                  confirmed_causes?: Record<string, unknown>[]
                } | undefined)?.confirmed_causes?.[0],
              ),
            ],
            rowCount: 2,
          }
        }
        if (normalized.includes('update public.duration_benchmark_cause_segments')) return { rows: [], rowCount: 0 }
        if (normalized.includes('insert into public.duration_benchmark_cause_segments')) {
          persistedSegment = {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', benchmark_id: params[0], company_id: params[1],
            project_id: params[2], cause_code: params[3], taxonomy_version: params[4], sample_count: params[5],
            p50_days: params[6], p75_days: params[7], p80_days: params[8], mean_days: params[9], variance: params[10],
            generated_at: params[11], source_window_start: params[12], source_as_of: params[13],
            duration_day_basis: 'construction_production_day', calendar_ref: params[14], calendar_version: params[15],
            lineage: JSON.parse(String(params[16])),
          }
          return { rows: [persistedSegment], rowCount: 1 }
        }
        if (normalized.includes('cause_segments_publication_key')) return { rows: [{ id: benchmarkId }], rowCount: 1 }
        throw new Error(`Unexpected Wave 3 SQL: ${normalized}`)
      }),
    }
    databaseMocks.getClient.mockResolvedValue(client)

    const stagedDayOne = await stageDurationBenchmarkCandidateAtomically(dayOneRow)
    const stagedDayTwo = await stageDurationBenchmarkCandidateAtomically(dayTwoRow)
    expect(stagedDayTwo).toEqual(stagedDayOne)
    expect(stagedDayTwo.generated_at).toBe('2026-07-21T00:00:00.000Z')

    publication = {
      publication_key: publicationKey,
      asset_key: 'base_duration_benchmark',
      artifact_key: candidate.benchmarkKey,
      scope_level: 'project',
      company_id: companyId,
      project_id: projectId,
      publication_stage: 'canary',
      monitoring_status: 'passed',
      runtime_payload: {
        benchmarkId,
        benchmarkVersion: dayOneRow.benchmark_version,
        p50Days: candidate.p50Days,
        p75Days: candidate.p75Days,
        p80Days: candidate.p80Days,
        meanDays: candidate.meanDays,
        variance: candidate.variance,
        coefficientOfVariation: candidate.coefficientOfVariation,
        sampleCount: candidate.sampleCount,
        confidenceLevel: candidate.confidenceLevel,
        confidenceScore: candidate.confidenceScore,
        durationDayBasis: candidate.durationDayBasis,
        generatedAt: dayOneRow.generated_at,
        sourceWindowStart: dayOneRow.source_window_start,
        sourceAsOf: dayOneRow.source_as_of,
        calendarRef: candidate.calendarRef,
        calendarVersion: candidate.calendarVersion,
      },
    }
    await expect(promoteDurationBenchmarkRuntimeCanaryAtomically({ publicationKey, companyId, projectId }))
      .resolves.toMatchObject({ status: 'stable_promoted' })

    expect(persistedSegment).toMatchObject({ cause_code: 'material_shortage', sample_count: 1 })
    expect(JSON.stringify(persistedSegment?.lineage)).toContain(sampleId)
    expect(JSON.stringify(persistedSegment?.lineage)).toContain(attributionId)
    expect(JSON.stringify(persistedSegment?.lineage)).not.toContain(canarySampleId)
  })
})
