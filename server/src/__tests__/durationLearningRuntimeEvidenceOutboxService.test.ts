import { describe, expect, it, vi } from 'vitest'

const outboxModule = await import('../services/durationLearningRuntimeEvidenceOutboxService.js')
  .catch(() => ({} as Record<string, unknown>)) as Record<string, any>

describe('durationLearningRuntimeEvidenceOutboxService', () => {
  it('enqueues exact tenant and lineage payload through a parameterized idempotent writer', async () => {
    const enqueue = outboxModule.enqueueDurationLearningRuntimeEvidenceBatch
    expect(enqueue).toBeTypeOf('function')
    if (typeof enqueue !== 'function') return

    const calls: Array<{ sql: string, params: unknown[] }> = []
    const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => {
      calls.push({ sql, params })
      return [{ event_key: 'duration-learning-evidence:test' }] as T[]
    }
    const events = [{
      eventType: 'duration_prediction',
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      subjectType: 'task',
      subjectId: '20000000-0000-4000-8000-000000000001',
      assetKey: 'base_duration_benchmark',
      publicationKey: 'duration_learning_runtime:base_duration_benchmark:project-1',
      artifactKey: 'SW-CONCRETE:process:all',
      scopeLevel: 'project',
      inputSubjectIds: ['20000000-0000-4000-8000-000000000001'],
      inputTaskIds: ['20000000-0000-4000-8000-000000000001'],
      payload: { recommendedDurationDays: 8 },
    }]

    const result = await enqueue({ queryExec, events })

    expect(result).toEqual(expect.objectContaining({ requestedCount: 1, persistedCount: 1 }))
    expect(calls).toHaveLength(1)
    expect(calls[0].sql).toContain('duration_learning_runtime_evidence_outbox')
    expect(calls[0].sql.toLowerCase()).toContain('on conflict')
    expect(calls[0].sql).toContain("jsonb_array_elements(requested.payload->'runtimeApplications')")
    expect(calls[0].params).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.objectContaining({
        company_id: events[0].companyId,
        project_id: events[0].projectId,
        subject_type: 'task',
        subject_id: events[0].subjectId,
        publication_key: events[0].publicationKey,
        artifact_key: events[0].artifactKey,
        input_subject_ids: events[0].inputSubjectIds,
        input_task_ids: events[0].inputTaskIds,
      })]),
    ]))
  })

  it.each(['duration_prediction', 'wbs_candidate'] as const)(
    'retries a failed %s event on the next default sweep and completes it once',
    async (eventType) => {
      const processOutbox = outboxModule.processDurationLearningRuntimeEvidenceOutbox
      expect(processOutbox).toBeTypeOf('function')
      if (typeof processOutbox !== 'function') return

      const row = {
        event_key: `event-${eventType}`,
        event_type: eventType,
        company_id: '10000000-0000-4000-8000-000000000001',
        project_id: '00000000-0000-4000-8000-000000000001',
        subject_type: eventType === 'duration_prediction' ? 'task' : 'baseline_item',
        subject_id: eventType === 'duration_prediction'
          ? '20000000-0000-4000-8000-000000000001'
          : '30000000-0000-4000-8000-000000000001',
        asset_key: 'special_work_duration_seed',
        publication_key: 'duration_learning_runtime:special_work_duration_seed:project-1',
        artifact_key: 'china-gb55032-2022',
        scope_level: 'project',
        input_subject_ids: eventType === 'duration_prediction'
          ? ['20000000-0000-4000-8000-000000000001']
          : ['30000000-0000-4000-8000-000000000001'],
        input_task_ids: eventType === 'duration_prediction'
          ? ['20000000-0000-4000-8000-000000000001']
          : [],
        payload: eventType === 'duration_prediction'
          ? {
              companyId: '10000000-0000-4000-8000-000000000001',
              projectId: '00000000-0000-4000-8000-000000000001',
              taskId: '20000000-0000-4000-8000-000000000001',
              recommendedDurationDays: 8,
              runtimeApplications: [{
                assetKey: 'special_work_duration_seed',
                publicationKey: 'duration_learning_runtime:special_work_duration_seed:project-1',
                artifactKey: 'china-gb55032-2022',
                scopeLevel: 'project',
                inputTaskIds: ['20000000-0000-4000-8000-000000000001'],
              }],
            }
          : {
              companyId: '10000000-0000-4000-8000-000000000001',
              projectId: '00000000-0000-4000-8000-000000000001',
              surface: 'baseline',
              generationBatchId: 'batch-1',
              templateId: 'china-gb55032-2022',
              generatedRowCount: 1,
              retainedRowCount: 1,
              generatedEntityIds: ['30000000-0000-4000-8000-000000000001'],
            },
      }
      const sqlCalls: string[] = []
      const queryExec = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
        sqlCalls.push(sql)
        if (sql.includes('duration-learning-runtime-evidence-outbox:claim')) return [row] as T[]
        if (sql.includes('duration-learning-runtime-evidence-outbox:complete')) {
          return [{ event_key: row.event_key }] as T[]
        }
        return [] as T[]
      }
      const predictionWriter = vi.fn()
      const candidateWriter = vi.fn()
      const activeWriter = eventType === 'duration_prediction' ? predictionWriter : candidateWriter
      activeWriter.mockRejectedValueOnce(new Error('transient evidence writer failure'))
      activeWriter.mockResolvedValueOnce({ id: 'written-on-retry' })

      const first = await processOutbox({
        queryExec,
        ownerId: 'worker-1',
        recordDurationPrediction: predictionWriter,
        recordWbsCandidate: candidateWriter,
      })
      const retry = await processOutbox({
        queryExec,
        ownerId: 'worker-2',
        recordDurationPrediction: predictionWriter,
        recordWbsCandidate: candidateWriter,
      })

      expect(first).toEqual(expect.objectContaining({ claimed: 1, completed: 0, failed: 1 }))
      expect(retry).toEqual(expect.objectContaining({ claimed: 1, completed: 1, failed: 0 }))
      expect(activeWriter).toHaveBeenCalledTimes(2)
      expect(sqlCalls.join('\n')).toContain("status in ('pending', 'failed')")
      expect(sqlCalls.join('\n')).toContain('for update skip locked')
      expect(sqlCalls.join('\n')).toContain('duration-learning-runtime-evidence-outbox:complete')
      expect(sqlCalls.join('\n')).toContain('duration-learning-runtime-evidence-outbox:fail')
      if (eventType === 'wbs_candidate') {
        expect(candidateWriter).toHaveBeenLastCalledWith(expect.objectContaining({
          materializationSubjectType: 'baseline_item',
          materializationSubjectId: '30000000-0000-4000-8000-000000000001',
          generatedEntityIds: ['30000000-0000-4000-8000-000000000001'],
        }))
      }
    },
  )

  it('never converts a baseline item into task accuracy evidence', async () => {
    const buildEvents = outboxModule.buildGeneratedDurationPredictionOutboxEvents
    expect(buildEvents).toBeTypeOf('function')
    if (typeof buildEvents !== 'function') return

    const common = {
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      generationBatchId: 'batch-1',
      rows: [{
        clientRowId: 'row-1',
        predecessorClientRowIds: [],
        predecessorDependencies: [],
        values: {
          title: 'Concrete work',
          planned_start_date: '2026-07-01',
          planned_end_date: '2026-07-08',
          standard_work_code: 'SW-CONCRETE',
          standard_task_metadata: {
            durationLearningConsumptions: [{
              assetKey: 'base_duration_benchmark',
              publicationKey: 'duration_learning_runtime:base_duration_benchmark:project-1',
              artifactKey: 'SW-CONCRETE:process:all',
              appliedDurationDays: 8,
              durationDayBasis: 'construction_production_day',
            }],
          },
        },
        durationSuggestion: {
          recommendedDurationDays: 8,
          forecastSource: 'duration_learning_project',
          confidenceLevel: 'high',
          confidenceScore: 88,
        },
      }],
      runtimeArtifactPublications: [{
        assetKey: 'base_duration_benchmark',
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:project-1',
        publicationStatus: 'published',
        sourceEvidenceRefs: ['duration_learning_runtime_publications:duration_learning_runtime:base_duration_benchmark:project-1'],
        observationContext: { artifactKey: 'SW-CONCRETE:process:all', scopeLevel: 'project' },
      }],
      subjectIdByClientRowId: new Map([['row-1', '20000000-0000-4000-8000-000000000001']]),
    }

    expect(buildEvents({ ...common, subjectType: 'baseline_item' })).toEqual([])
    expect(buildEvents({ ...common, subjectType: 'task' })).toEqual([
      expect.objectContaining({
        eventType: 'duration_prediction',
        subjectType: 'task',
        subjectId: '20000000-0000-4000-8000-000000000001',
        assetKey: 'base_duration_benchmark',
        publicationKey: 'duration_learning_runtime:base_duration_benchmark:project-1',
        artifactKey: 'SW-CONCRETE:process:all',
        scopeLevel: 'project',
        inputTaskIds: ['20000000-0000-4000-8000-000000000001'],
      }),
    ])
  })

  it('builds a baseline candidate with exact canonical artifact lineage and baseline-item inputs', () => {
    const buildEvent = outboxModule.buildWbsCandidateOutboxEvent
    expect(buildEvent).toBeTypeOf('function')
    if (typeof buildEvent !== 'function') return

    const event = buildEvent({
      companyId: '10000000-0000-4000-8000-000000000001',
      projectId: '00000000-0000-4000-8000-000000000001',
      subjectType: 'baseline_item',
      subjectId: '30000000-0000-4000-8000-000000000001',
      runtimeArtifactPublications: [{
        assetKey: 'special_work_duration_seed',
        publicationKey: 'duration_learning_runtime:special_work_duration_seed:project-1',
        publicationStatus: 'published',
        sourceEvidenceRefs: [
          'duration_learning_runtime_publications:duration_learning_runtime:special_work_duration_seed:project-1',
        ],
        observationContext: {
          artifactKey: 'SPECIAL-WORK:concrete',
          scopeLevel: 'project',
        },
      }],
      candidate: {
        companyId: '10000000-0000-4000-8000-000000000001',
        projectId: '00000000-0000-4000-8000-000000000001',
        surface: 'baseline',
        templateId: 'china-gb55032-2022',
        generatedEntityIds: [
          '30000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000002',
        ],
        durationCandidateNodes: [{
          sourceId: 'node-1',
          stableCode: 'SPECIAL-WORK:concrete',
          p50Days: 8,
          durationDayBasis: 'construction_production_day',
          runtimePublicationKey: 'duration_learning_runtime:special_work_duration_seed:project-1',
        }],
      },
    })

    expect(event).toEqual(expect.objectContaining({
      subjectType: 'baseline_item',
      subjectId: '30000000-0000-4000-8000-000000000001',
      assetKey: 'special_work_duration_seed',
      publicationKey: 'duration_learning_runtime:special_work_duration_seed:project-1',
      artifactKey: 'SPECIAL-WORK:concrete',
      scopeLevel: 'project',
      inputSubjectIds: [
        '30000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000002',
      ],
      inputTaskIds: [],
    }))
  })
})
