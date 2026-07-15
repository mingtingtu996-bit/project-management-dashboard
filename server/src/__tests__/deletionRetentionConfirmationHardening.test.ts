import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tableQueues: new Map<string, any[]>(),
  insertedRows: [] as Array<Record<string, any>>,
  updateCalls: [] as Array<{ table: string; patch: Record<string, any>; filters: Array<[string, unknown]> }>,
  queryFilters: [] as Array<{ table: string; field: string; value: unknown }>,
  writeChangeLog: vi.fn(async () => 'change-1'),
  query: vi.fn(async (_sql: string, params: unknown[] = []) => {
    mocks.insertedRows.push({
      execution_status: params[11],
      decision_token_hash: params[15],
      token_hash_version: params[16],
    })
    return []
  }),
}))

function queueTable(table: string, responses: any[]) {
  mocks.tableQueues.set(table, [...responses])
}

function dequeue(table: string) {
  const queue = mocks.tableQueues.get(table) ?? []
  if (queue.length === 0) return {}
  const response = queue.shift()
  mocks.tableQueues.set(table, queue)
  return response
}

function makeBuilder(table: string) {
  const state = {
    table,
    patch: null as Record<string, any> | null,
    filters: [] as Array<[string, unknown]>,
  }
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((field: string, value: unknown) => {
      state.filters.push([field, value])
      mocks.queryFilters.push({ table, field, value })
      return builder
    }),
    in: vi.fn((field: string, values: unknown[]) => {
      state.filters.push([field, values])
      mocks.queryFilters.push({ table, field, value: values })
      return builder
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    lt: vi.fn((field: string, value: unknown) => {
      state.filters.push([field, value])
      return builder
    }),
    then: vi.fn((resolve: (value: any) => unknown, reject: (reason: any) => unknown) => {
      Promise.resolve(dequeue(table)).then(resolve, reject)
    }),
    maybeSingle: vi.fn(async () => dequeue(table)),
    insert: vi.fn(async (row: Record<string, any>) => {
      mocks.insertedRows.push(row)
      return dequeue(table)
    }),
    update: vi.fn((patch: Record<string, any>) => {
      state.patch = patch
      mocks.updateCalls.push({ table, patch, filters: state.filters })
      return builder
    }),
  }
  return builder
}

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: vi.fn((table: string) => makeBuilder(table)),
  },
}))

vi.mock('../services/changeAuditService.js', () => ({
  writeChangeLog: mocks.writeChangeLog,
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
  isDatabaseTransactionActive: vi.fn(() => false),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('deletion retention confirmation hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tableQueues.clear()
    mocks.insertedRows = []
    mocks.updateCalls = []
    mocks.queryFilters = []
  })

  it('stores only a token hash for new pending confirmations while returning the raw token once', async () => {
    const { executeRetention, hashRetentionDecisionToken } = await import('../services/deletionRetentionGovernanceService.js')

    queueTable('project_entity_links', [{ count: 1, error: null }, { count: 1, error: null }])
    queueTable('data_lineage_links', [{ count: 0, error: null }, { count: 0, error: null }])
    queueTable('change_logs', [{ count: 0, error: null }, { count: 0, error: null }])
    queueTable('deletion_retention_events', [{ error: null }])

    const result = await executeRetention({
      entityType: 'project_material',
      entityId: 'material-1',
      projectId: 'project-1',
      userAction: 'delete',
      actorId: 'owner-1',
    })

    expect(result.decisionToken).toBeTruthy()
    expect(mocks.insertedRows[0]).toMatchObject({
      decision_token_hash: hashRetentionDecisionToken(result.decisionToken),
      execution_status: 'pending_confirmation',
    })
    expect(mocks.insertedRows[0]).not.toHaveProperty('decision_token')
  })

  it('looks up confirmation by token hash and persists action result plus confirmation metadata', async () => {
    const { confirmRetentionDecision, hashRetentionDecisionToken } = await import('../services/deletionRetentionGovernanceService.js')
    const token = 'event-1.raw-token'
    const event = {
      id: 'event-1',
      project_id: 'project-1',
      entity_type: 'project_material',
      entity_id: 'material-1',
      requested_action: 'delete',
      resolved_action: 'close',
      execution_status: 'pending_confirmation',
      requires_user_confirmation: true,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      reference_summary: { project_entity_links: 1 },
      suggested_action: {},
      request_id: 'request-1',
      decision_token_hash: hashRetentionDecisionToken(token),
    }

    queueTable('deletion_retention_events', [
      { data: event, error: null },
      { data: { id: 'event-1' }, error: null },
      {
        data: {
          id: 'event-1',
          project_id: 'project-1',
          entity_type: 'project_material',
          entity_id: 'material-1',
          requested_action: 'delete',
          resolved_action: 'close',
          execution_status: 'executed',
          confirmed_at: '2026-05-27T00:00:00.000Z',
          expires_at: event.expires_at,
          confirmed_action_result: { applied: true },
        },
        error: null,
      },
    ])
    queueTable('project_entity_links', [{ count: 1, error: null }])
    queueTable('data_lineage_links', [{ count: 0, error: null }])
    queueTable('change_logs', [{ count: 0, error: null }])
    queueTable('project_materials', [{ data: { id: 'material-1', record_status: 'inactive' }, error: null }])

    const result = await confirmRetentionDecision({
      projectId: 'project-1',
      decisionToken: token,
      actorId: 'owner-1',
    })

    const eventUpdate = mocks.updateCalls.find((call) => call.table === 'deletion_retention_events' && call.patch.execution_status === 'executed')
    expect(eventUpdate?.patch.confirmed_action_result).toMatchObject({ applied: true, entityType: 'project_material' })
    expect(eventUpdate?.patch.confirmation_metadata).toMatchObject({
      actor_id: 'owner-1',
      refs_signature_before: 'project_entity_links:1',
      refs_signature_after: 'project_entity_links:1',
      token_hash_version: 'sha256',
    })
    expect(result.actionResult).toMatchObject({ applied: true })
  })

  it('rejects confirmation when the decision token belongs to a different actor', async () => {
    const { confirmRetentionDecision, hashRetentionDecisionToken } = await import('../services/deletionRetentionGovernanceService.js')
    const token = 'event-actor.raw-token'

    queueTable('deletion_retention_events', [{
      data: {
        id: 'event-actor',
        project_id: 'project-1',
        entity_type: 'project_material',
        entity_id: 'material-1',
        requested_action: 'delete',
        resolved_action: 'close',
        execution_status: 'pending_confirmation',
        requires_user_confirmation: true,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        reference_summary: { project_entity_links: 1 },
        suggested_action: {},
        request_id: 'request-actor',
        actor_id: 'owner-original',
        decision_token_hash: hashRetentionDecisionToken(token),
      },
      error: null,
    }])

    await expect(confirmRetentionDecision({
      projectId: 'project-1',
      decisionToken: token,
      actorId: 'owner-other',
    })).rejects.toThrow('RETENTION_DECISION_ACTOR_MISMATCH')

    expect(mocks.updateCalls.some((call) => call.patch.execution_status === 'confirming')).toBe(false)
    expect(mocks.updateCalls.some((call) => call.table === 'project_materials')).toBe(false)
  })

  it('does not fall back to plaintext decision_token lookup after hash backfill', async () => {
    const { confirmRetentionDecision } = await import('../services/deletionRetentionGovernanceService.js')
    const token = 'event-legacy.raw-token'

    queueTable('deletion_retention_events', [
      { data: null, error: null },
    ])

    await expect(confirmRetentionDecision({
      projectId: 'project-1',
      decisionToken: token,
      actorId: 'owner-1',
    })).rejects.toThrow('RETENTION_DECISION_NOT_FOUND')

    expect(mocks.queryFilters.some((filter) => filter.field === 'decision_token')).toBe(false)
  })

  it('exposes a transaction planning hook for future atomic confirmation executors', async () => {
    const { createRetentionConfirmationTransactionPlan } = await import('../services/deletionRetentionGovernanceService.js')

    expect(createRetentionConfirmationTransactionPlan({
      eventId: 'event-1',
      projectId: 'project-1',
      entityType: 'project_material',
      entityId: 'material-1',
      resolvedAction: 'archive',
    })).toMatchObject({
      eventId: 'event-1',
      projectId: 'project-1',
      entityType: 'project_material',
      entityId: 'material-1',
      resolvedAction: 'archive',
      steps: [
        'reserve_decision_event',
        'execute_domain_lifecycle_action',
        'persist_confirmation_audit',
      ],
      atomicity: 'planned_transaction_boundary',
    })
  })

  it('treats already executed confirmations for the same token as idempotent success', async () => {
    const { confirmRetentionDecision, hashRetentionDecisionToken } = await import('../services/deletionRetentionGovernanceService.js')
    const token = 'event-1.raw-token'
    queueTable('deletion_retention_events', [{
      data: {
        id: 'event-1',
        project_id: 'project-1',
        entity_type: 'project_material',
        entity_id: 'material-1',
        requested_action: 'delete',
        resolved_action: 'close',
        execution_status: 'executed',
        requires_user_confirmation: true,
        confirmed_at: '2026-05-27T00:00:00.000Z',
        expires_at: null,
        confirmed_action_result: { applied: true, idempotent: false },
        decision_token_hash: hashRetentionDecisionToken(token),
      },
      error: null,
    }])

    const result = await confirmRetentionDecision({
      projectId: 'project-1',
      decisionToken: token,
      actorId: 'owner-1',
    })

    expect(result.executionStatus).toBe('executed')
    expect(result.actionResult).toMatchObject({ applied: true, idempotent: true })
  })

  it('recovers a stale confirming decision by retrying the retained lifecycle action', async () => {
    const { confirmRetentionDecision, hashRetentionDecisionToken } = await import('../services/deletionRetentionGovernanceService.js')
    const token = 'event-1.raw-token'
    const event = {
      id: 'event-1',
      project_id: 'project-1',
      entity_type: 'project_material',
      entity_id: 'material-1',
      requested_action: 'delete',
      resolved_action: 'close',
      execution_status: 'confirming',
      requires_user_confirmation: true,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      reference_summary: { project_entity_links: 1 },
      suggested_action: {},
      request_id: 'request-1',
      decision_token_hash: hashRetentionDecisionToken(token),
      confirmation_metadata: { reserved_at: '2026-05-27T00:00:00.000Z' },
    }

    queueTable('deletion_retention_events', [
      { data: event, error: null },
      {
        data: {
          id: 'event-1',
          project_id: 'project-1',
          entity_type: 'project_material',
          entity_id: 'material-1',
          requested_action: 'delete',
          resolved_action: 'close',
          execution_status: 'executed',
          confirmed_at: '2026-05-27T00:15:00.000Z',
          expires_at: event.expires_at,
          confirmed_action_result: { applied: true, recovered: true },
        },
        error: null,
      },
    ])
    queueTable('project_entity_links', [{ count: 1, error: null }])
    queueTable('data_lineage_links', [{ count: 0, error: null }])
    queueTable('change_logs', [{ count: 0, error: null }])
    queueTable('project_materials', [{ data: { id: 'material-1', record_status: 'inactive' }, error: null }])

    const result = await confirmRetentionDecision({
      projectId: 'project-1',
      decisionToken: token,
      actorId: 'owner-1',
    })

    const eventUpdate = mocks.updateCalls.find((call) => call.table === 'deletion_retention_events' && call.patch.execution_status === 'executed')
    expect(eventUpdate?.patch.confirmation_metadata).toMatchObject({
      recovered_from_confirming: true,
    })
    expect(result.executionStatus).toBe('executed')
  })

  it('marks stale confirming decisions as failed after too many recovery attempts', async () => {
    const { confirmRetentionDecision, hashRetentionDecisionToken } = await import('../services/deletionRetentionGovernanceService.js')
    const token = 'event-retry.raw-token'
    queueTable('deletion_retention_events', [{
      data: {
        id: 'event-retry',
        project_id: 'project-1',
        entity_type: 'project_material',
        entity_id: 'material-1',
        requested_action: 'delete',
        resolved_action: 'close',
        execution_status: 'confirming',
        requires_user_confirmation: true,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        reference_summary: { project_entity_links: 1 },
        suggested_action: {},
        request_id: 'request-retry',
        actor_id: 'owner-1',
        decision_token_hash: hashRetentionDecisionToken(token),
        confirmation_metadata: {
          reserved_at: '2026-05-27T00:00:00.000Z',
          recovery_attempts: 3,
        },
      },
      error: null,
    }])

    await expect(confirmRetentionDecision({
      projectId: 'project-1',
      decisionToken: token,
      actorId: 'owner-1',
    })).rejects.toThrow('RETENTION_DECISION_RECOVERY_LIMIT_EXCEEDED')

    const failedUpdate = mocks.updateCalls.find((call) => call.table === 'deletion_retention_events' && call.patch.execution_status === 'failed')
    expect(failedUpdate?.patch.confirmation_metadata).toMatchObject({
      recovery_attempts: 3,
      last_error_code: 'RETENTION_DECISION_RECOVERY_LIMIT_EXCEEDED',
    })
    expect(mocks.updateCalls.some((call) => call.table === 'project_materials')).toBe(false)
  })

  it('marks confirmation as failed with the executor error metadata when lifecycle mutation fails', async () => {
    const { confirmRetentionDecision, hashRetentionDecisionToken } = await import('../services/deletionRetentionGovernanceService.js')
    const token = 'event-fail.raw-token'
    const event = {
      id: 'event-fail',
      project_id: 'project-1',
      entity_type: 'project_material',
      entity_id: 'material-1',
      requested_action: 'delete',
      resolved_action: 'close',
      execution_status: 'pending_confirmation',
      requires_user_confirmation: true,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      reference_summary: { project_entity_links: 1 },
      suggested_action: {},
      request_id: 'request-fail',
      actor_id: 'owner-1',
      decision_token_hash: hashRetentionDecisionToken(token),
    }

    queueTable('deletion_retention_events', [
      { data: event, error: null },
      { data: { id: 'event-fail' }, error: null },
      { data: { id: 'event-fail' }, error: null },
    ])
    queueTable('project_entity_links', [{ count: 1, error: null }])
    queueTable('data_lineage_links', [{ count: 0, error: null }])
    queueTable('change_logs', [{ count: 0, error: null }])
    queueTable('project_materials', [{ data: null, error: new Error('material update failed') }])

    await expect(confirmRetentionDecision({
      projectId: 'project-1',
      decisionToken: token,
      actorId: 'owner-1',
    })).rejects.toThrow('material update failed')

    const failedUpdate = mocks.updateCalls.find((call) => call.table === 'deletion_retention_events' && call.patch.execution_status === 'failed')
    expect(failedUpdate?.patch.confirmation_metadata).toMatchObject({
      last_error_code: 'CONFIRMED_RETENTION_ACTION_FAILED',
      last_error_message: 'material update failed',
      recovery_attempts: 0,
    })
  })

  it('does not recover a fresh confirming decision that may still be executing', async () => {
    const { confirmRetentionDecision, hashRetentionDecisionToken } = await import('../services/deletionRetentionGovernanceService.js')
    const token = 'event-1.raw-token'
    queueTable('deletion_retention_events', [{
      data: {
        id: 'event-1',
        project_id: 'project-1',
        entity_type: 'project_material',
        entity_id: 'material-1',
        requested_action: 'delete',
        resolved_action: 'close',
        execution_status: 'confirming',
        requires_user_confirmation: true,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        reference_summary: { project_entity_links: 1 },
        suggested_action: {},
        request_id: 'request-1',
        decision_token_hash: hashRetentionDecisionToken(token),
        confirmation_metadata: { reserved_at: new Date().toISOString() },
      },
      error: null,
    }])

    await expect(confirmRetentionDecision({
      projectId: 'project-1',
      decisionToken: token,
      actorId: 'owner-1',
    })).rejects.toThrow('RETENTION_DECISION_CONFIRMING')

    expect(mocks.updateCalls.some((call) => call.table === 'project_materials')).toBe(false)
  })

  it('expires stale pending confirmation rows in a cleanup pass', async () => {
    const { expirePendingRetentionDecisions } = await import('../services/deletionRetentionGovernanceService.js')
    queueTable('deletion_retention_events', [{ data: [{ id: 'event-1' }, { id: 'event-2' }], error: null }])

    const result = await expirePendingRetentionDecisions(new Date('2026-05-27T00:00:00.000Z'))

    expect(result).toEqual({ expired: 2, cutoff: '2026-05-27T00:00:00.000Z' })
    expect(mocks.updateCalls[0]).toMatchObject({
      table: 'deletion_retention_events',
      patch: expect.objectContaining({
        execution_status: 'expired',
        expired_at: '2026-05-27T00:00:00.000Z',
      }),
    })
  })

  it('filters loaded diagnostics rows by visible project ids at query time', async () => {
    const { getRetentionGovernanceDiagnostics } = await import('../services/deletionRetentionGovernanceService.js')
    queueTable('deletion_retention_events', [{
      data: [
        { project_id: 'project-1', entity_type: 'task', execution_status: 'pending_confirmation', reason_code: 'history_consumer_retained' },
      ],
      error: null,
    }])

    const diagnostics = await getRetentionGovernanceDiagnostics({
      visibleProjectIds: ['project-1', 'project-2'],
      limit: 20,
    })

    expect(diagnostics.summary.totalEvents).toBe(1)
    expect(mocks.queryFilters).toContainEqual({
      table: 'deletion_retention_events',
      field: 'project_id',
      value: ['project-1', 'project-2'],
    })
  })

  it('resolves operator attention by marking failed events as handled without re-running domain mutation', async () => {
    const { resolveRetentionOperatorAttention } = await import('../services/deletionRetentionGovernanceService.js')
    queueTable('deletion_retention_events', [
      {
        data: {
          id: 'event-1',
          project_id: 'project-1',
          execution_status: 'failed',
          confirmation_metadata: {
            last_error_code: 'CONFIRMED_RETENTION_ACTION_FAILED',
            recovery_attempts: 2,
          },
        },
        error: null,
      },
      {
        data: {
          id: 'event-1',
          project_id: 'project-1',
          execution_status: 'cancelled_by_user',
          confirmation_metadata: {
            last_error_code: 'CONFIRMED_RETENTION_ACTION_FAILED',
            recovery_attempts: 2,
            operator_action: 'mark_handled',
            operator_status: 'handled',
          },
        },
        error: null,
      },
    ])

    const result = await resolveRetentionOperatorAttention({
      projectId: 'project-1',
      eventId: 'event-1',
      action: 'mark_handled',
      note: 'handled manually',
      actorId: 'operator-1',
    })

    expect(result).toMatchObject({
      eventId: 'event-1',
      projectId: 'project-1',
      action: 'mark_handled',
      executionStatus: 'cancelled_by_user',
    })
    const update = mocks.updateCalls.find((call) => call.table === 'deletion_retention_events')
    expect(update?.patch).toMatchObject({
      execution_status: 'cancelled_by_user',
      confirmation_metadata: expect.objectContaining({
        last_error_code: 'CONFIRMED_RETENTION_ACTION_FAILED',
        recovery_attempts: 2,
        operator_action: 'mark_handled',
        operator_status: 'handled',
        operator_note: 'handled manually',
        operator_actor_id: 'operator-1',
      }),
    })
    expect(mocks.updateCalls.some((call) => call.table === 'project_materials')).toBe(false)
  })

  it('rejects operator handling for already executed retention events', async () => {
    const { resolveRetentionOperatorAttention } = await import('../services/deletionRetentionGovernanceService.js')
    queueTable('deletion_retention_events', [{
      data: {
        id: 'event-executed',
        project_id: 'project-1',
        execution_status: 'executed',
        confirmation_metadata: {},
      },
      error: null,
    }])

    await expect(resolveRetentionOperatorAttention({
      projectId: 'project-1',
      eventId: 'event-executed',
      action: 'mark_handled',
      actorId: 'operator-1',
    })).rejects.toThrow('RETENTION_OPERATOR_ACTION_NOT_ATTENTION_STATUS')

    expect(mocks.updateCalls.some((call) => call.patch.execution_status === 'cancelled_by_user')).toBe(false)
  })
})
