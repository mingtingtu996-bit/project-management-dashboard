import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

const outbox = await import('../services/durationLearningRuntimeEvidenceOutboxService.js')
const candidateEvents = await import('../services/wbsTemplateCandidateEventService.js')

const companyId = '10000000-0000-4000-8000-000000000001'
const projectId = '00000000-0000-4000-8000-000000000001'

function publication(
  publicationKey: string,
  artifactKey: string,
  scopeLevel: 'project' | 'company' | 'industry' | 'global' = 'project',
  industryKey: string | null = null,
) {
  return {
    assetKey: 'special_work_duration_seed' as const,
    publicationKey,
    publicationStatus: 'published' as const,
    sourceEvidenceRefs: [`duration_learning_runtime_publications:${publicationKey}`],
    observationContext: { artifactKey, scopeLevel, industryKey, templateId: artifactKey },
  }
}

function candidate(subjectType: 'task' | 'baseline_item', ids: string[]) {
  return {
    companyId,
    projectId,
    surface: 'task_list' as const,
    generationBatchId: 'batch-1',
    templateId: 'template-1',
    generatedEntityIds: ids,
    durationCandidateNodes: ids.map((id, index) => ({
      sourceId: `node-${id}`,
      stableCode: `SPECIAL-${index}`,
      p50Days: 8,
      durationDayBasis: 'construction_production_day' as const,
      runtimePublicationKey: index === 0 ? 'pub-a' : 'pub-b',
    })),
    materializationSubjectType: subjectType,
    materializationSubjectId: ids[0],
  }
}

function trustedRow(
  publicationKey: string,
  artifactKey: string,
  subjectType: 'task' | 'baseline_item',
  subjectId: string,
  scopeLevel: 'project' | 'company' | 'industry' | 'global' = 'project',
  industryKey: string | null = null,
) {
  return {
    company_id: companyId,
    project_id: projectId,
    consumption_key: `consumption-${publicationKey}-${subjectId}`,
    publication_key: publicationKey,
    asset_key: 'special_work_duration_seed',
    artifact_key: artifactKey,
    task_id: subjectType === 'task' ? subjectId : null,
    baseline_item_id: subjectType === 'baseline_item' ? subjectId : null,
    generation_batch_id: 'batch-1',
    source_evidence_refs: [`duration_learning_runtime_publications:${publicationKey}`],
    consumption_context: {
      authoritySource: 'runtime_resolver_publication_set',
      industryKey,
    },
    publication_stage: 'canary',
    monitoring_status: 'passed',
    publication_scope_level: scopeLevel,
    publication_company_id: scopeLevel === 'project' || scopeLevel === 'company' ? companyId : null,
    publication_project_id: scopeLevel === 'project' ? projectId : null,
    publication_industry_key: scopeLevel === 'industry' ? industryKey : null,
  }
}

describe('duration learning evidence outbox follow-up contracts', () => {
  it('splits multi-publication WBS evidence by physical trusted-consumption lineage', async () => {
    const base = outbox.buildWbsCandidateOutboxEvent({
      companyId,
      projectId,
      subjectType: 'task',
      subjectId: 'task-a',
      runtimeArtifactPublications: [publication('pub-a', 'artifact-a'), publication('pub-b', 'artifact-b')],
      candidate: candidate('task', ['task-a', 'task-b']),
    })
    const queryExec = vi.fn(async () => [
      trustedRow('pub-a', 'artifact-a', 'task', 'task-a'),
      trustedRow('pub-b', 'artifact-b', 'task', 'task-b'),
    ]) as any

    const events = await outbox.expandWbsCandidateOutboxEventsForTrustedConsumption({
      event: base,
      queryExec,
    })

    expect(events).toHaveLength(2)
    expect(events.map((event) => [event.publicationKey, event.inputTaskIds])).toEqual([
      ['pub-a', ['task-a']],
      ['pub-b', ['task-b']],
    ])
    expect(events.map((event) => (event.payload as Record<string, unknown>).runtimeConsumptionKeys)).toEqual([
      ['consumption-pub-a-task-a'],
      ['consumption-pub-b-task-b'],
    ])
    expect(events.every((event) => (event.payload as Record<string, unknown>).lineageResolution === 'physical_runtime_consumption')).toBe(true)
    expect(queryExec).toHaveBeenCalledWith(expect.stringContaining('duration_learning_runtime_consumptions'), expect.any(Array))
  })

  it('keeps a cold-start candidate unlinked when no trusted consumption exists', async () => {
    const base = outbox.buildWbsCandidateOutboxEvent({
      companyId,
      projectId,
      subjectType: 'task',
      subjectId: 'task-a',
      runtimeArtifactPublications: [publication('pub-a', 'artifact-a')],
      candidate: candidate('task', ['task-a', 'task-b']),
    })

    const events = await outbox.expandWbsCandidateOutboxEventsForTrustedConsumption({
      event: base,
      queryExec: vi.fn(async () => []) as any,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ publicationKey: null, inputTaskIds: [] })
    expect(events[0].payload).toMatchObject({ lineageResolution: 'no_trusted_consumption' })
  })

  it('uses baseline-item consumption subjects for baseline evidence', async () => {
    const base = outbox.buildWbsCandidateOutboxEvent({
      companyId,
      projectId,
      subjectType: 'baseline_item',
      subjectId: 'baseline-a',
      runtimeArtifactPublications: [publication('pub-a', 'artifact-a')],
      candidate: candidate('baseline_item', ['baseline-a', 'baseline-b']),
    })
    const events = await outbox.expandWbsCandidateOutboxEventsForTrustedConsumption({
      event: base,
      queryExec: vi.fn(async () => [
        trustedRow('pub-a', 'artifact-a', 'baseline_item', 'baseline-b'),
      ]) as any,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      subjectType: 'baseline_item',
      subjectId: 'baseline-b',
      inputSubjectIds: ['baseline-b'],
      inputTaskIds: [],
      publicationKey: 'pub-a',
    })
    expect(events[0].payload).toMatchObject({
      materializationSubjectType: 'baseline_item',
      lineageResolution: 'physical_runtime_consumption',
    })
  })

  it('does not attribute an unrelated task in the same generation batch', async () => {
    const base = outbox.buildWbsCandidateOutboxEvent({
      companyId,
      projectId,
      subjectType: 'task',
      subjectId: 'task-a',
      runtimeArtifactPublications: [publication('pub-a', 'artifact-a')],
      candidate: candidate('task', ['task-a', 'task-b']),
    })
    const events = await outbox.expandWbsCandidateOutboxEventsForTrustedConsumption({
      event: base,
      queryExec: vi.fn(async () => [
        trustedRow('pub-a', 'artifact-a', 'task', 'task-a'),
        trustedRow('pub-a', 'artifact-a', 'task', 'task-unrelated'),
      ]) as any,
    })

    expect(events).toHaveLength(1)
    expect(events[0]?.inputTaskIds).toEqual(['task-a'])
  })

  it('does not attribute a trusted row from a different replay generation batch', async () => {
    const base = outbox.buildWbsCandidateOutboxEvent({
      companyId,
      projectId,
      subjectType: 'task',
      subjectId: 'task-a',
      runtimeArtifactPublications: [publication('pub-a', 'artifact-a')],
      candidate: candidate('task', ['task-a']),
    })
    const differentBatch = trustedRow('pub-a', 'artifact-a', 'task', 'task-a')
    differentBatch.generation_batch_id = 'batch-from-another-replay'

    const events = await outbox.expandWbsCandidateOutboxEventsForTrustedConsumption({
      event: base,
      queryExec: vi.fn(async () => [differentBatch]) as any,
    })

    expect(events).toHaveLength(1)
    expect(events[0]?.publicationKey).toBeNull()
    expect((events[0]?.payload as Record<string, unknown>).lineageResolution).toBe('no_trusted_consumption')
  })

  it('keeps aggregation on the first consumed lineage, not the first declared publication', async () => {
    const base = outbox.buildWbsCandidateOutboxEvent({
      companyId,
      projectId,
      subjectType: 'task',
      subjectId: 'task-a',
      runtimeArtifactPublications: [publication('pub-a', 'artifact-a'), publication('pub-b', 'artifact-b')],
      candidate: candidate('task', ['task-a', 'task-b']),
    })
    const events = await outbox.expandWbsCandidateOutboxEventsForTrustedConsumption({
      event: base,
      queryExec: vi.fn(async () => [trustedRow('pub-b', 'artifact-b', 'task', 'task-b')]) as any,
    })

    expect(events).toHaveLength(1)
    expect(events[0]?.publicationKey).toBe('pub-b')
    expect((events[0]?.payload as Record<string, unknown>).aggregationMode).toBe('once')
  })

  it('fails closed for missing authority markers and unsafe publication state', async () => {
    const base = outbox.buildWbsCandidateOutboxEvent({
      companyId,
      projectId,
      subjectType: 'task',
      subjectId: 'task-a',
      runtimeArtifactPublications: [publication('pub-a', 'artifact-a')],
      candidate: candidate('task', ['task-a']),
    })
    const dirty = trustedRow('pub-a', 'artifact-a', 'task', 'task-a')
    dirty.source_evidence_refs = []
    dirty.monitoring_status = 'failed'
    const events = await outbox.expandWbsCandidateOutboxEventsForTrustedConsumption({
      event: base,
      queryExec: vi.fn(async () => [dirty]) as any,
    })

    expect(events).toHaveLength(1)
    expect(events[0]?.publicationKey).toBeNull()
    expect((events[0]?.payload as Record<string, unknown>).lineageResolution).toBe('no_trusted_consumption')
  })

  it('requires exact publication scope identity for project, company, industry and global rows', async () => {
    const cases = [
      ['project', null, companyId, projectId, null],
      ['company', null, companyId, null, null],
      ['industry', 'general_civil', null, null, 'general_civil'],
      ['global', null, null, null, null],
    ] as const
    for (const [scopeLevel, industryKey, publicationCompanyId, publicationProjectId, contextIndustryKey] of cases) {
      const base = outbox.buildWbsCandidateOutboxEvent({
        companyId,
        projectId,
        subjectType: 'task',
        subjectId: 'task-a',
        runtimeArtifactPublications: [publication('pub-a', 'artifact-a', scopeLevel, industryKey)],
        candidate: candidate('task', ['task-a']),
      })
      const row = trustedRow('pub-a', 'artifact-a', 'task', 'task-a', scopeLevel, contextIndustryKey)
      row.publication_company_id = publicationCompanyId
      row.publication_project_id = publicationProjectId
      const events = await outbox.expandWbsCandidateOutboxEventsForTrustedConsumption({
        event: base,
        queryExec: vi.fn(async () => [row]) as any,
      })
      expect(events[0]?.publicationKey, scopeLevel).toBe('pub-a')
    }
  })

  it('drains multiple bounded batches and reports remaining backlog evidence', async () => {
    const row = {
      event_key: 'event-1',
      event_type: 'wbs_candidate',
      company_id: companyId,
      project_id: projectId,
      subject_type: 'baseline_item',
      subject_id: 'baseline-a',
      input_subject_ids: ['baseline-a'],
      input_task_ids: [],
      payload: {
        companyId,
        projectId,
        generatedEntityIds: ['baseline-a'],
        authoritativeRuntimeLineage: null,
        authoritativeRuntimeLineages: [],
        lineageResolution: 'no_trusted_consumption',
      },
    }
    let claims = 0
    const queryExec = vi.fn(async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes(':quarantine-unsafe')) return [] as T[]
      if (sql.includes(':claim')) return (claims++ === 0 ? [row] : []) as T[]
      if (sql.includes(':authority')) return [{ authorized: true }] as T[]
      if (sql.includes(':complete')) return [{ event_key: row.event_key }] as T[]
      if (sql.includes(':backlog')) return [{ pending_count: 0, ready_pending_count: 0, failed_count: 0, expired_processing_count: 0, oldest_pending_at: null }] as T[]
      return [] as T[]
    }) as any

    const result = await outbox.drainDurationLearningRuntimeEvidenceOutbox({
      queryExec,
      ownerId: 'worker-1',
      limit: 1,
      maxBatches: 4,
      recordWbsCandidate: vi.fn(async () => undefined),
    })

    expect(result).toMatchObject({ batches: 2, claimed: 1, completed: 1, failed: 0, backlogCount: 0, readyBacklogCount: 0, expiredProcessingCount: 0 })
    expect(queryExec).toHaveBeenCalledWith(expect.stringContaining(':backlog'), expect.any(Array))
  })

  it('stops before the next bounded batch when the job attempt signal is aborted', async () => {
    const controller = new AbortController()
    const timeoutError = Object.assign(new Error('attempt deadline exceeded'), { code: 'JOB_ATTEMPT_TIMEOUT' })
    const row = {
      event_key: 'event-abort-between-batches',
      event_type: 'wbs_candidate',
      company_id: companyId,
      project_id: projectId,
      subject_type: 'baseline_item',
      subject_id: 'baseline-abort',
      input_subject_ids: ['baseline-abort'],
      input_task_ids: [],
      payload: {
        companyId,
        projectId,
        generatedEntityIds: ['baseline-abort'],
        authoritativeRuntimeLineage: null,
        authoritativeRuntimeLineages: [],
        lineageResolution: 'no_trusted_consumption',
      },
    }
    const secondRow = {
      ...row,
      event_key: 'event-abort-second-row',
      subject_id: 'baseline-abort-second',
      input_subject_ids: ['baseline-abort-second'],
      payload: {
        ...row.payload,
        generatedEntityIds: ['baseline-abort-second'],
      },
    }
    let claimCount = 0
    const queryExec = vi.fn(async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes(':quarantine-unsafe')) return [] as T[]
      if (sql.includes(':claim')) {
        claimCount += 1
        return [row, secondRow] as T[]
      }
      if (sql.includes(':authority')) return [{ authorized: true }] as T[]
      if (sql.includes(':complete')) {
        controller.abort(timeoutError)
        return [{ event_key: row.event_key }] as T[]
      }
      if (sql.includes(':backlog')) throw new Error('backlog must not be read after abort')
      return [] as T[]
    }) as any

    const recordWbsCandidate = vi.fn(async () => undefined)
    await expect(outbox.drainDurationLearningRuntimeEvidenceOutbox({
      queryExec,
      ownerId: 'worker-abort',
      maxBatches: 4,
      signal: controller.signal,
      recordWbsCandidate,
    })).rejects.toBe(timeoutError)

    expect(claimCount).toBe(1)
    expect(recordWbsCandidate).toHaveBeenCalledTimes(1)
    expect(queryExec.mock.calls.some(([sql]) => String(sql).includes(':backlog'))).toBe(false)
  })

  it('backs off a failed event instead of hot-retrying it through every drain batch', async () => {
    const row = {
      event_key: 'failed-event',
      event_type: 'wbs_candidate',
      company_id: companyId,
      project_id: projectId,
      subject_type: 'task',
      subject_id: 'task-a',
      input_subject_ids: ['task-a'],
      input_task_ids: [],
      payload: {
        companyId,
        projectId,
        generatedEntityIds: ['task-a'],
        authoritativeRuntimeLineage: null,
        authoritativeRuntimeLineages: [],
        lineageResolution: 'no_trusted_consumption',
      },
    }
    let claims = 0
    const queryExec = vi.fn(async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes(':quarantine-unsafe')) return [] as T[]
      if (sql.includes(':claim')) {
        claims += 1
        return (claims === 1 ? [row] : []) as T[]
      }
      if (sql.includes(':authority')) return [{ authorized: true }] as T[]
      if (sql.includes(':fail')) return [] as T[]
      if (sql.includes(':backlog')) return [{ pending_count: 1, ready_pending_count: 1, failed_count: 1, expired_processing_count: 0, oldest_pending_at: '2026-07-20T00:00:00.000Z' }] as T[]
      return [] as T[]
    }) as any
    const result = await outbox.drainDurationLearningRuntimeEvidenceOutbox({
      queryExec,
      ownerId: 'worker-1',
      limit: 1,
      maxBatches: 4,
      recordWbsCandidate: vi.fn(async () => { throw new Error('transient') }),
    })

    expect(claims).toBe(2)
    expect(result).toMatchObject({ batches: 2, failed: 1, backlogCount: 1, failedBacklogCount: 1 })
    expect(String(queryExec.mock.calls.find(([sql]) => String(sql).includes(':fail'))?.[0])).toContain("interval '1 minute'")
  })

  it('processes a multi-entity cold-start event without claim-lineage mismatch', async () => {
    const row = {
      event_key: 'cold-start-event',
      event_type: 'wbs_candidate',
      company_id: companyId,
      project_id: projectId,
      subject_type: 'task',
      subject_id: 'task-a',
      input_subject_ids: ['task-a', 'task-b'],
      input_task_ids: [],
      payload: {
        companyId,
        projectId,
        generatedEntityIds: ['task-a', 'task-b'],
        materializationSubjectType: 'task',
        materializationSubjectId: 'task-a',
        lineageResolution: 'no_trusted_consumption',
      },
    }
    const queryExec = vi.fn(async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes(':quarantine-unsafe')) return [] as T[]
      if (sql.includes(':claim')) return [row] as T[]
      if (sql.includes(':authority')) return [{ authorized: true }] as T[]
      if (sql.includes(':complete')) return [{ event_key: row.event_key }] as T[]
      return [] as T[]
    }) as any
    const recordWbsCandidate = vi.fn(async () => undefined)
    const result = await outbox.processDurationLearningRuntimeEvidenceOutbox({
      queryExec,
      ownerId: 'worker-1',
      now: '2026-07-20T00:00:00.000Z',
      recordWbsCandidate,
    })

    expect(result).toMatchObject({ claimed: 1, completed: 1, failed: 0 })
    expect(recordWbsCandidate).toHaveBeenCalledWith(expect.objectContaining({
      generatedEntityIds: ['task-a', 'task-b'],
      materializationSubjectId: 'task-a',
    }))
  })

  it('rejects an adapter-returned forged linked WBS row before the candidate writer', async () => {
    const lineage = {
      assetKey: 'special_work_duration_seed',
      publicationKey: 'pub-a',
      artifactKey: 'artifact-a',
      scopeLevel: 'project',
      industryKey: null,
      inputTaskIds: ['task-a'],
      inputSubjectIds: ['task-a'],
      consumptionKeys: ['consumption-a'],
      sourceEvidenceRefs: ['duration_learning_runtime_publications:pub-a'],
    }
    const row = {
      event_key: 'forged-linked-wbs',
      event_type: 'wbs_candidate',
      company_id: companyId,
      project_id: projectId,
      subject_type: 'task',
      subject_id: 'task-a',
      asset_key: 'special_work_duration_seed',
      publication_key: 'pub-a',
      artifact_key: 'artifact-a',
      scope_level: 'project',
      input_subject_ids: ['task-a'],
      input_task_ids: ['task-a'],
      payload: {
        companyId,
        projectId,
        generationBatchId: 'batch-1',
        generatedEntityIds: ['task-a'],
        materializationSubjectType: 'task',
        materializationSubjectId: 'task-a',
        lineageResolution: 'physical_runtime_consumption',
        authoritativeRuntimeLineage: lineage,
        authoritativeRuntimeLineages: [lineage],
        runtimeConsumptionKeys: ['consumption-a'],
        runtimeSourceEvidenceRefs: ['duration_learning_runtime_publications:pub-a'],
      },
    }
    const queryExec = vi.fn(async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes(':quarantine-unsafe')) return [] as T[]
      if (sql.includes(':claim')) return [row] as T[]
      if (sql.includes(':authority')) return [{ authorized: false }] as T[]
      if (sql.includes(':cancel-claimed')) return [{ event_key: row.event_key }] as T[]
      return [] as T[]
    }) as any
    const recordWbsCandidate = vi.fn(async () => undefined)

    const result = await outbox.processDurationLearningRuntimeEvidenceOutbox({
      queryExec,
      ownerId: 'worker-1',
      now: '2026-07-20T00:00:00.000Z',
      recordWbsCandidate,
    })

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 1 })
    expect(recordWbsCandidate).not.toHaveBeenCalled()
    expect(queryExec).toHaveBeenCalledWith(expect.stringContaining(':cancel-claimed'), expect.arrayContaining([
      row.event_key,
      'worker-1',
    ]))
  })

  it('rejects context-only prediction lineage without an exact physical consumption', async () => {
    const row = {
      event_key: 'forged-duration-prediction',
      event_type: 'duration_prediction',
      company_id: companyId,
      project_id: projectId,
      subject_type: 'task',
      subject_id: 'task-a',
      asset_key: 'special_work_duration_seed',
      publication_key: 'pub-a',
      artifact_key: 'artifact-a',
      scope_level: 'project',
      input_subject_ids: ['task-a'],
      input_task_ids: ['task-a'],
      payload: {
        companyId,
        projectId,
        taskId: 'task-a',
        generationBatchId: 'batch-1',
        recommendedDurationDays: 8,
        runtimeApplications: [{
          assetKey: 'special_work_duration_seed',
          publicationKey: 'pub-a',
          artifactKey: 'artifact-a',
          scopeLevel: 'project',
          inputTaskIds: ['task-a'],
        }],
      },
    }
    const queryExec = vi.fn(async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes(':quarantine-unsafe')) return [] as T[]
      if (sql.includes(':claim')) return [row] as T[]
      if (sql.includes(':authority')) return [{ authorized: false }] as T[]
      if (sql.includes(':cancel-claimed')) return [{ event_key: row.event_key }] as T[]
      return [] as T[]
    }) as any
    const recordDurationPrediction = vi.fn(async () => undefined)

    const result = await outbox.processDurationLearningRuntimeEvidenceOutbox({
      queryExec,
      ownerId: 'worker-1',
      now: '2026-07-20T00:00:00.000Z',
      recordDurationPrediction,
    })

    expect(result).toMatchObject({ claimed: 1, completed: 0, failed: 1 })
    expect(recordDurationPrediction).not.toHaveBeenCalled()
    expect(queryExec).toHaveBeenCalledWith(expect.stringContaining(':authority'), expect.any(Array))
  })

  it('quarantines a queued row after publication authority becomes unsafe without hiding backlog work', async () => {
    const queryExec = vi.fn(async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
      if (sql.includes(':quarantine-unsafe')) return [{ event_key: 'unsafe-event' }] as T[]
      if (sql.includes(':claim')) return [] as T[]
      if (sql.includes(':backlog')) {
        return [{
          pending_count: 0,
          ready_pending_count: 0,
          failed_count: 0,
          expired_processing_count: 0,
          oldest_pending_at: null,
        }] as T[]
      }
      return [] as T[]
    }) as any

    const result = await outbox.drainDurationLearningRuntimeEvidenceOutbox({
      queryExec,
      ownerId: 'worker-1',
      now: '2026-07-20T00:00:00.000Z',
      maxBatches: 1,
      recordWbsCandidate: vi.fn(async () => undefined),
    })

    expect(result).toMatchObject({ claimed: 0, completed: 0, failed: 0, backlogCount: 0 })
    const quarantineSql = String(queryExec.mock.calls.find(([sql]) => String(sql).includes(':quarantine-unsafe'))?.[0])
    expect(quarantineSql).toContain("processing_status = 'cancelled'")
    expect(quarantineSql).toContain('cancellation_scope_snapshot')
    expect(quarantineSql).toContain('not public.duration_learning_runtime_evidence_outbox_row_is_authorized')
  })

  it('uses the generated batch identity on real task-list and baseline routes', () => {
    const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
      ? process.cwd()
      : resolve(process.cwd(), 'server')
    const routesRoot = resolve(serverRoot, 'src', 'routes')
    const tasks = readFileSync(resolve(routesRoot, 'tasks.ts'), 'utf8')
    const baselines = readFileSync(resolve(routesRoot, 'task-baselines.ts'), 'utf8')
    const wizard = readFileSync(resolve(routesRoot, 'projectWizard.ts'), 'utf8')

    expect(tasks).toContain('generationBatchId: generated.generationBatchId')
    expect(baselines).toContain('generationBatchId: generated.generationBatchId')
    expect(wizard).toContain('generationBatchId,')
    expect(tasks).not.toContain('generationBatchId: String((generationOperation as Record<string, unknown>).generationBatchId ?? \'\')')
    expect(baselines).not.toContain('generationBatchId: String(operationRecord.generationBatchId ?? \'\')')
  })

  it('does not collapse unbatched repeated submissions to template or attachment identity', () => {
    const buildOutcomeId = candidateEvents.buildWbsTemplateCandidateOutcomeId
    expect(buildOutcomeId).toBeTypeOf('function')
    if (typeof buildOutcomeId !== 'function') return

    const first = buildOutcomeId({
      projectId,
      surface: 'task_list',
      templateId: 'template-1',
      attachUnderRowId: 'attach-1',
      generatedEntityIds: ['task-a'],
    })
    const second = buildOutcomeId({
      projectId,
      surface: 'task_list',
      templateId: 'template-1',
      attachUnderRowId: 'attach-1',
      generatedEntityIds: ['task-b'],
    })

    expect(first).toBeNull()
    expect(second).toBeNull()
  })

  it('gives split publication/artifact outcomes distinct stable identities', () => {
    const first = candidateEvents.buildWbsTemplateCandidateOutcomeId({
      projectId,
      surface: 'task_list',
      generationBatchId: 'batch-1',
      generatedEntityIds: ['task-a'],
      authoritativeRuntimeLineage: {
        assetKey: 'special_work_duration_seed',
        publicationKey: 'pub-a',
        artifactKey: 'artifact-a',
        scopeLevel: 'project',
        inputTaskIds: ['task-a'],
        inputSubjectIds: ['task-a'],
      },
    })
    const second = candidateEvents.buildWbsTemplateCandidateOutcomeId({
      projectId,
      surface: 'task_list',
      generationBatchId: 'batch-1',
      generatedEntityIds: ['task-b'],
      authoritativeRuntimeLineage: {
        assetKey: 'special_work_duration_seed',
        publicationKey: 'pub-b',
        artifactKey: 'artifact-b',
        scopeLevel: 'project',
        inputTaskIds: ['task-b'],
        inputSubjectIds: ['task-b'],
      },
    })

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first).not.toBe(second)
  })
})
