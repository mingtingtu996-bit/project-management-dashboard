import { describe, expect, it, vi } from 'vitest'

import * as executionFactGovernance from '../services/executionFactGovernanceService.js'

import {
  buildExecutionFactIdempotencyKey,
  recordExecutionFact,
  runExecutionFactProjection,
  type ExecutionFactQueryExecutor,
  type ExecutionFactTransactionRunner,
  type RecordExecutionFactInput,
} from '../services/executionFactGovernanceService.js'

const companyId = '22222222-2222-4222-8222-222222222222'
const projectId = '11111111-1111-4111-8111-111111111111'
const taskId = '33333333-3333-4333-8333-333333333333'

type Row = Record<string, unknown>

function baseInput(overrides: Partial<RecordExecutionFactInput> = {}): RecordExecutionFactInput {
  const sourceModule = 'taskWriteChainService'
  const sourceEventId = 'task:33333333-3333-4333-8333-333333333333:version:7:progress'
  return {
    companyId,
    projectId,
    entityType: 'task',
    entityId: taskId,
    factType: 'task.progress',
    value: 35,
    effectiveAt: '2026-07-24T10:00:00.000Z',
    observedAt: '2026-07-24T10:00:01.000Z',
    sourceModule,
    sourceEventId,
    actorUserId: null,
    evidenceRefs: ['task-version:7'],
    confidence: 1,
    idempotencyKey: buildExecutionFactIdempotencyKey({
      companyId,
      projectId,
      entityType: 'task',
      entityId: taskId,
      factType: 'task.progress',
      sourceModule,
      sourceEventId,
    }),
    ...overrides,
  }
}

function eventRow(input: RecordExecutionFactInput, overrides: Row = {}): Row {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    company_id: companyId,
    project_id: input.projectId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    fact_type: input.factType,
    fact_value: input.value,
    effective_at: input.effectiveAt,
    observed_at: input.observedAt,
    source_module: input.sourceModule,
    source_event_id: input.sourceEventId,
    actor_user_id: input.actorUserId ?? null,
    evidence_refs: input.evidenceRefs ?? [],
    confidence: input.confidence ?? 1,
    supersedes_event_id: null,
    supersession_kind: 'initial',
    correction_reason: null,
    idempotency_key: input.idempotencyKey,
    created_at: input.observedAt,
    ...overrides,
  }
}

function createHarness(options: {
  idempotentRow?: Row | null
  currentRow?: Row | null
  insertError?: Error | null
  projectCompanyId?: string | null
  entityExists?: boolean
} = {}) {
  let active = true
  const insertedRows: Row[] = []
  const queryExec = vi.fn(async (sql: string, params: unknown[] = []): Promise<Row[]> => {
    const normalized = sql.toLowerCase().replace(/\s+/g, ' ')
    if (normalized.includes('from public.projects project')) {
      return options.projectCompanyId === null
        ? []
        : [{ company_id: options.projectCompanyId ?? companyId }]
    }
    if (normalized.includes('from public.tasks entity')) {
      return options.entityExists === false ? [] : [{ project_id: projectId }]
    }
    if (normalized.includes('idempotency_key = $2')) {
      return options.idempotentRow ? [options.idempotentRow] : []
    }
    if (normalized.includes('successor.supersedes_event_id = event.id')) {
      return options.currentRow ? [options.currentRow] : []
    }
    if (normalized.includes('insert into public.execution_fact_events')) {
      if (options.insertError) throw options.insertError
      const row: Row = {
        id: '55555555-5555-4555-8555-555555555555',
        company_id: params[0],
        project_id: params[1],
        entity_type: params[2],
        entity_id: params[3],
        fact_type: params[4],
        fact_value: JSON.parse(String(params[5])),
        effective_at: params[6],
        observed_at: params[7],
        source_module: params[8],
        source_event_id: params[9],
        actor_user_id: params[10],
        evidence_refs: JSON.parse(String(params[11])),
        confidence: params[12],
        supersedes_event_id: params[13],
        supersession_kind: params[14],
        correction_reason: params[15],
        idempotency_key: params[16],
        created_at: params[7],
      }
      insertedRows.push(row)
      return [row]
    }
    throw new Error(`unexpected SQL: ${sql}`)
  }) as ExecutionFactQueryExecutor & ReturnType<typeof vi.fn>

  const transactionEvents: string[] = []
  const transactionRunner = vi.fn(async <T>(work: () => Promise<T>) => {
    transactionEvents.push('begin')
    active = true
    try {
      const result = await work()
      transactionEvents.push('commit')
      return result
    } catch (error) {
      transactionEvents.push('rollback')
      throw error
    } finally {
      active = false
    }
  }) as ExecutionFactTransactionRunner & ReturnType<typeof vi.fn>

  return {
    insertedRows,
    queryExec,
    transactionEvents,
    transactionRunner,
    dependencies: {
      queryExec,
      isTransactionActive: () => active,
    },
    setActive(value: boolean) {
      active = value
    },
  }
}

describe('execution fact governance service', () => {
  it('builds deterministic fact inputs only for changed compatibility projections', () => {
    const buildChangedExecutionFactInputs = (executionFactGovernance as any).buildChangedExecutionFactInputs
    expect(buildChangedExecutionFactInputs).toBeTypeOf('function')

    const facts = buildChangedExecutionFactInputs({
      companyId,
      projectId,
      entityType: 'task',
      entityId: taskId,
      sourceModule: 'taskWriteChainService',
      sourceMutationId: `task:${taskId}:version:7`,
      actorUserId: null,
      observedAt: '2026-07-24T10:00:01.000Z',
      correctionReason: 'Corrected from the signed site record.',
      changes: [
        {
          factType: 'task.status',
          previousValue: 'in_progress',
          nextValue: 'in_progress',
        },
        {
          factType: 'task.progress',
          previousValue: 20,
          nextValue: 35,
          evidenceRefs: ['task-version:7'],
        },
        {
          factType: 'task.actual_end_date',
          previousValue: null,
          nextValue: '2026-07-24',
          effectiveAt: '2026-07-24T00:00:00.000Z',
        },
        {
          factType: 'task.first_progress_at',
          previousValue: null,
          nextValue: null,
          force: true,
        },
      ],
    }) as RecordExecutionFactInput[]

    expect(facts).toHaveLength(3)
    expect(facts.map((fact) => fact.factType)).toEqual([
      'task.progress',
      'task.actual_end_date',
      'task.first_progress_at',
    ])
    expect(facts[0]).toEqual(expect.objectContaining({
      sourceEventId: `task:${taskId}:version:7:task.progress`,
      observedAt: '2026-07-24T10:00:01.000Z',
      correction: { reason: 'Corrected from the signed site record.' },
    }))
    expect(facts[1]?.effectiveAt).toBe('2026-07-24T00:00:00.000Z')
    expect(facts[0]?.idempotencyKey).toBe(buildExecutionFactIdempotencyKey({
      companyId,
      projectId,
      entityType: 'task',
      entityId: taskId,
      factType: 'task.progress',
      sourceModule: 'taskWriteChainService',
      sourceEventId: `task:${taskId}:version:7:task.progress`,
    }))
  })

  it('records changed projections in the caller transaction and skips unchanged projections', async () => {
    const recordChangedExecutionFacts = (executionFactGovernance as any).recordChangedExecutionFacts
    expect(recordChangedExecutionFacts).toBeTypeOf('function')
    const harness = createHarness()
    const baseProjection = {
      companyId,
      projectId,
      entityType: 'task' as const,
      entityId: taskId,
      sourceModule: 'taskWriteChainService',
      sourceMutationId: `task:${taskId}:version:7`,
      actorUserId: null,
      observedAt: '2026-07-24T10:00:01.000Z',
    }

    await expect(recordChangedExecutionFacts({
      ...baseProjection,
      changes: [{
        factType: 'task.progress',
        previousValue: 20,
        nextValue: 35,
      }],
    }, harness.dependencies)).resolves.toEqual([
      expect.objectContaining({ disposition: 'created' }),
    ])
    expect(harness.insertedRows).toHaveLength(1)

    const unchangedHarness = createHarness()
    await expect(recordChangedExecutionFacts({
      ...baseProjection,
      changes: [{
        factType: 'task.progress',
        previousValue: 35,
        nextValue: 35,
      }],
    }, unchangedHarness.dependencies)).resolves.toEqual([])
    expect(unchangedHarness.queryExec).not.toHaveBeenCalled()
  })

  it('requires an active transaction and a valid entity/fact contract', async () => {
    const harness = createHarness()
    harness.setActive(false)

    await expect(recordExecutionFact(baseInput(), harness.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_TRANSACTION_REQUIRED',
    })

    harness.setActive(true)
    await expect(recordExecutionFact(baseInput({
      entityType: 'risk',
      factType: 'task.progress',
    } as Partial<RecordExecutionFactInput>), harness.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_TYPE_MISMATCH',
    })
    await expect(recordExecutionFact(baseInput({ value: 101 }), harness.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_VALUE_INVALID',
    })
  })

  it('fails closed for missing or mismatched project and entity scope', async () => {
    const missingProject = createHarness({ projectCompanyId: null })
    await expect(recordExecutionFact(baseInput(), missingProject.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_PROJECT_NOT_FOUND',
    })

    const mismatchedCompany = createHarness({ projectCompanyId: '99999999-9999-4999-8999-999999999999' })
    await expect(recordExecutionFact(baseInput(), mismatchedCompany.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_TENANT_MISMATCH',
    })

    const missingEntity = createHarness({ entityExists: false })
    await expect(recordExecutionFact(baseInput(), missingEntity.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_ENTITY_SCOPE_MISMATCH',
    })
  })

  it('inserts the first fact as the initial stream head', async () => {
    const harness = createHarness()
    const input = baseInput()

    const result = await recordExecutionFact(input, harness.dependencies)

    expect(result.disposition).toBe('created')
    expect(result.event).toEqual(expect.objectContaining({
      companyId,
      projectId,
      entityType: 'task',
      factType: 'task.progress',
      value: 35,
      supersedesEventId: null,
      supersessionKind: 'initial',
    }))
    expect(harness.insertedRows).toHaveLength(1)
  })

  it('reuses an identical idempotency key and rejects a conflicting replay', async () => {
    const input = baseInput()
    const existing = eventRow(input)
    const reused = createHarness({ idempotentRow: existing })

    await expect(recordExecutionFact(input, reused.dependencies)).resolves.toMatchObject({
      disposition: 'reused',
    })
    expect(reused.insertedRows).toHaveLength(0)

    const conflict = createHarness({ idempotentRow: { ...existing, fact_value: 65 } })
    await expect(recordExecutionFact(input, conflict.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_IDEMPOTENCY_CONFLICT',
    })
    expect(conflict.insertedRows).toHaveLength(0)
  })

  it('supersedes the current head and requires exact correction lineage', async () => {
    const input = baseInput()
    const current = eventRow(input, {
      id: '66666666-6666-4666-8666-666666666666',
      fact_value: 20,
      source_event_id: 'task:version:6:progress',
      idempotency_key: 'previous-key',
    })
    const observation = createHarness({ currentRow: current })

    await expect(recordExecutionFact(input, observation.dependencies)).resolves.toMatchObject({
      event: expect.objectContaining({
        supersedesEventId: current.id,
        supersessionKind: 'new_observation',
      }),
    })

    const correction = createHarness({ currentRow: current })
    await expect(recordExecutionFact(baseInput({
      correction: {
        supersedesEventId: String(current.id),
        reason: 'The source inspection timestamp was corrected.',
      },
    }), correction.dependencies)).resolves.toMatchObject({
      event: expect.objectContaining({
        supersedesEventId: current.id,
        supersessionKind: 'correction',
        correctionReason: 'The source inspection timestamp was corrected.',
      }),
    })

    const implicitCurrentCorrection = createHarness({ currentRow: current })
    await expect(recordExecutionFact(baseInput({
      correction: {
        reason: 'The route corrected the current compatibility projection.',
      } as any,
    }), implicitCurrentCorrection.dependencies)).resolves.toMatchObject({
      event: expect.objectContaining({
        supersedesEventId: current.id,
        supersessionKind: 'correction',
        correctionReason: 'The route corrected the current compatibility projection.',
      }),
    })

    const missingCurrentCorrection = createHarness()
    await expect(recordExecutionFact(baseInput({
      correction: {
        reason: 'A correction must not become an unlinked initial event.',
      } as any,
    }), missingCurrentCorrection.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_CORRECTION_BASE_REQUIRED',
    })

    const staleCorrection = createHarness({ currentRow: current })
    await expect(recordExecutionFact(baseInput({
      correction: {
        supersedesEventId: '77777777-7777-4777-8777-777777777777',
        reason: 'stale correction',
      },
    }), staleCorrection.dependencies)).rejects.toMatchObject({
      code: 'EXECUTION_FACT_CORRECTION_STALE',
    })
  })

  it('fails the whole projection transaction when fact persistence fails', async () => {
    const harness = createHarness({ insertError: new Error('fact insert failed') })
    harness.setActive(false)
    const calls: string[] = []

    await expect(runExecutionFactProjection({
      applyProjection: async () => {
        calls.push('projection')
        return { version: 7 }
      },
      buildFacts: () => [baseInput()],
    }, {
      ...harness.dependencies,
      transactionRunner: harness.transactionRunner,
    })).rejects.toThrow('fact insert failed')

    expect(calls).toEqual(['projection'])
    expect(harness.transactionEvents).toEqual(['begin', 'rollback'])
  })
})
