import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
}))

vi.mock('../database.js', () => ({
  query: mocks.rawQuery,
}))

describe('duration runtime consumer PostgreSQL query adapter', () => {
  beforeEach(() => {
    mocks.rawQuery.mockReset()
    mocks.rawQuery.mockResolvedValue({ rows: [] })
  })

  it('serializes JSONB parameters when a transaction query executor is injected', async () => {
    const {
      createDurationRuntimeConsumerObservationQueryExec,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const transactionQueryExec = async <T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }
    const queryExec = createDurationRuntimeConsumerObservationQueryExec(transactionQueryExec)

    await queryExec(`
      insert into public.runtime_consumer_runtime_calls (
        consumer_key,
        runtime_entry_ref,
        call_status,
        call_context,
        source_evidence_refs,
        writes_runtime_directly,
        writes_fact_directly,
        called_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      'projectWizard',
      'projectWizard:commitWizardGeneration',
      'called',
      { projectId: 'project-1', runtimeArtifactCount: 0 },
      ['project_wizard_commit:project-1:batch-1:newProjectPlanning'],
      false,
      false,
      '2026-07-14T08:00:00.000Z',
    ])

    expect(calls).toHaveLength(1)
    expect(calls[0]?.sql).toContain('$4::jsonb')
    expect(calls[0]?.sql).toContain('$5::jsonb')
    expect(calls[0]?.params[3]).toBe(JSON.stringify({
      projectId: 'project-1',
      runtimeArtifactCount: 0,
    }))
    expect(calls[0]?.params[4]).toBe(JSON.stringify([
      'project_wizard_commit:project-1:batch-1:newProjectPlanning',
    ]))
  })

  it('keeps the approved query executor idempotent across nested runtime consumers', async () => {
    const {
      createDurationRuntimeConsumerObservationQueryExec,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const calls: Array<{ sql: string, params: unknown[] }> = []
    const transactionQueryExec = async <T = Record<string, unknown>>(
      sql: string,
      params: unknown[] = [],
    ): Promise<T[]> => {
      calls.push({ sql, params })
      return [] as T[]
    }
    const firstQueryExec = createDurationRuntimeConsumerObservationQueryExec(transactionQueryExec)
    const nestedQueryExec = createDurationRuntimeConsumerObservationQueryExec(firstQueryExec)

    expect(nestedQueryExec).toBe(firstQueryExec)

    await nestedQueryExec(`
      insert into public.runtime_consumer_runtime_calls (
        consumer_key,
        runtime_entry_ref,
        call_status,
        call_context,
        source_evidence_refs,
        writes_runtime_directly,
        writes_fact_directly,
        called_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      'durationSuggestionService',
      'durationSuggestionService:getTaskDurationSuggestion',
      'called',
      { projectId: 'project-1' },
      ['duration_suggestion:project-1:task-1'],
      false,
      false,
      '2026-07-14T08:00:00.000Z',
    ])

    expect(calls).toHaveLength(1)
    expect(calls[0]?.sql).toContain('$4::jsonb')
    expect(calls[0]?.sql).toContain('$5::jsonb')
  })

  it('serializes runtime call JSONB parameters before invoking pg', async () => {
    const {
      createDurationRuntimeConsumerObservationQueryExec,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const queryExec = createDurationRuntimeConsumerObservationQueryExec()

    await queryExec(`
      insert into public.runtime_consumer_runtime_calls (
        consumer_key,
        runtime_entry_ref,
        call_status,
        call_context,
        source_evidence_refs,
        writes_runtime_directly,
        writes_fact_directly,
        called_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      'durationSuggestionService',
      'durationSuggestionService:getTaskDurationSuggestion',
      'called',
      { projectId: 'project-1', runtimeArtifactCount: 0 },
      ['duration_suggestion:project-1:task-1'],
      false,
      false,
      '2026-07-14T00:00:00.000Z',
    ])

    expect(mocks.rawQuery).toHaveBeenCalledTimes(1)
    expect(mocks.rawQuery.mock.calls[0]?.[1]).toEqual([
      'durationSuggestionService',
      'durationSuggestionService:getTaskDurationSuggestion',
      'called',
      JSON.stringify({ projectId: 'project-1', runtimeArtifactCount: 0 }),
      JSON.stringify(['duration_suggestion:project-1:task-1']),
      false,
      false,
      '2026-07-14T00:00:00.000Z',
    ])
  })

  it('serializes observation JSONB parameters before invoking pg', async () => {
    const {
      createDurationRuntimeConsumerObservationQueryExec,
    } = await import('../services/durationRuntimeConsumerObservationService.js')
    const queryExec = createDurationRuntimeConsumerObservationQueryExec()

    await queryExec(`
      insert into public.runtime_consumer_observations (
        asset_key,
        publication_key,
        consumer_key,
        consumer_surface,
        observation_status,
        observation_context,
        source_evidence_refs,
        writes_runtime_directly,
        writes_fact_directly,
        observed_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      'base_duration_benchmark',
      'duration-benchmark-runtime:base:p50',
      'durationSuggestionService',
      'duration_suggestion',
      'observed',
      { projectId: 'project-1', mode: 'published' },
      ['runtime_publication:duration-benchmark:base:p50'],
      false,
      false,
      '2026-07-14T00:00:00.000Z',
    ])

    expect(mocks.rawQuery).toHaveBeenCalledTimes(1)
    expect(mocks.rawQuery.mock.calls[0]?.[1]).toEqual([
      'base_duration_benchmark',
      'duration-benchmark-runtime:base:p50',
      'durationSuggestionService',
      'duration_suggestion',
      'observed',
      JSON.stringify({ projectId: 'project-1', mode: 'published' }),
      JSON.stringify(['runtime_publication:duration-benchmark:base:p50']),
      false,
      false,
      '2026-07-14T00:00:00.000Z',
    ])
  })
})
