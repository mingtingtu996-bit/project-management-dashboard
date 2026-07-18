import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  writeChangeLog: vi.fn(async () => '44444444-4444-4444-8444-444444444444'),
  query: vi.fn(async () => ({ rows: [], rowCount: 1 })),
  supabase: {
    from: vi.fn((_table: string) => ({
      insert: vi.fn(async () => ({ error: null })),
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    })),
  },
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../database.js', () => ({
  isDatabaseTransactionActive: vi.fn(() => false),
  query: mocks.query,
}))

vi.mock('../services/dbService.js', () => ({
  supabase: mocks.supabase,
}))

vi.mock('../services/changeAuditService.js', () => ({
  writeChangeLog: mocks.writeChangeLog,
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

import {
  buildRetentionBlockedApiError,
  buildRetentionBlockedHttpStatus,
  createRetentionConfirmationTransactionBoundary,
  executeRetention,
  executeRetentionConfirmationTransactionBoundary,
  getRetentionCoverageMatrix,
  getRetentionExecutorRegistry,
  getRetentionGovernanceDiagnostics,
  getRetentionGovernanceDiagnosticsSync,
  previewRetentionConfirmedAction,
  runRetentionGovernedAction,
} from '../services/deletionRetentionGovernanceService.js'

describe('deletionRetentionGovernanceService governance contracts', () => {
  it('exports a coverage matrix for delete, close, archive, and source-deleted handling', () => {
    const matrix = getRetentionCoverageMatrix()

    expect(matrix.version).toBe('v1.4.15-retention-governance')
    expect(matrix.coveredEntityTypes).toEqual(expect.arrayContaining([
      'task',
      'risk',
      'issue',
      'acceptance_plan',
      'notification',
      'project_material',
      'construction_drawing',
      'certificate_work_item',
      'participant_unit',
    ]))
    expect(matrix.entries.find((entry) => entry.entityType === 'task')).toMatchObject({
      deletePolicy: 'physical_delete_when_unreferenced_else_close_or_soft_delete',
      closePolicy: 'close_retained',
      archivePolicy: 'archive_retained',
      supportsConfirmation: true,
      sourceDeletedPolicy: 'mark_downstream_source_deleted',
    })
    expect(matrix.entries.find((entry) => entry.entityType === 'risk')?.referenceChecks).toEqual(expect.arrayContaining([
      'upgrade_chain',
      'linked_issue',
      'notifications',
      'change_logs',
    ]))
  })

  it('exports executor registry coverage for confirmation actions', () => {
    const registry = getRetentionExecutorRegistry()

    expect(registry.version).toBe('v1.4.15-retention-executors')
    expect(registry.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'task', supportedResolvedActions: expect.arrayContaining(['close', 'soft_delete']), idempotent: true }),
      expect.objectContaining({ entityType: 'risk', supportedResolvedActions: expect.arrayContaining(['close', 'soft_delete']), transactionMode: 'service_call' }),
      expect.objectContaining({ entityType: 'issue', supportedResolvedActions: expect.arrayContaining(['close', 'soft_delete']), idempotent: true, transactionMode: 'service_call' }),
      expect.objectContaining({ entityType: 'task_obstacle', supportedResolvedActions: expect.arrayContaining(['close', 'soft_delete']), idempotent: true }),
      expect.objectContaining({ entityType: 'acceptance_plan', supportedResolvedActions: expect.arrayContaining(['close', 'archive']), idempotent: true }),
      expect.objectContaining({ entityType: 'project_material', supportedResolvedActions: expect.arrayContaining(['archive', 'soft_delete']), dryRunSupported: true }),
      expect.objectContaining({ entityType: 'construction_drawing', supportedResolvedActions: expect.arrayContaining(['archive', 'deactivate']), transactionMode: 'single_table_update' }),
      expect.objectContaining({ entityType: 'certificate_work_item', supportedResolvedActions: expect.arrayContaining(['archive', 'deactivate']), idempotent: true }),
      expect.objectContaining({ entityType: 'participant_unit', supportedResolvedActions: expect.arrayContaining(['archive', 'soft_delete']), idempotent: true }),
    ]))
    expect(registry.summary).toMatchObject({
      idempotentExecutorCount: registry.entries.length,
      transactionReadyExecutorCount: 0,
    })
    expect(registry.summary.dryRunSupportedCount).toBeGreaterThan(0)
  })

  it('keeps every confirmable coverage entry backed by an executor registry entry', () => {
    const matrix = getRetentionCoverageMatrix()
    const registry = getRetentionExecutorRegistry()
    const executableEntityTypes = new Set(registry.entries.map((entry) => entry.entityType))
    const confirmableEntityTypes = matrix.entries
      .filter((entry) => entry.supportsConfirmation)
      .map((entry) => entry.entityType)

    expect(confirmableEntityTypes.filter((entityType) => !executableEntityTypes.has(entityType))).toEqual([])
  })

  it('normalizes dangerous actions through one public governance entry point', async () => {
    const result = await runRetentionGovernedAction({
      entityType: 'task',
      entityId: 'task-1',
      projectId: 'project-1',
      userAction: 'restore',
      actorId: 'owner-1',
    })

    expect(result).toMatchObject({
      action: 'restore',
      blocked: true,
      error: expect.objectContaining({
        code: 'RETENTION_REJECTED',
      }),
    })
  })

  it('checks acceptance plan dependency references through source and target plan ids', async () => {
    const countQueries: Array<{
      table: string
      eq: Array<[string, unknown]>
      or: string[]
    }> = []

    ;(mocks.supabase.from as any).mockImplementation((table: string) => {
      const query = {
        table,
        eq: [] as Array<[string, unknown]>,
        or: [] as string[],
      }
      const select = vi.fn(() => {
        countQueries.push(query)
        const chain: any = {
          eq: vi.fn((field: string, value: unknown) => {
            query.eq.push([field, value])
            return chain
          }),
          or: vi.fn((expression: string) => {
            query.or.push(expression)
            return chain
          }),
          then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(resolve),
        }
        return chain
      })

      return {
        insert: vi.fn(async () => ({ error: null })),
        select,
      }
    })

    const result = await executeRetention({
      entityType: 'acceptance_plan',
      entityId: 'plan-1',
      projectId: 'project-1',
      userId: 'owner-1',
      userAction: 'delete',
    })

    const dependencyQuery = countQueries.find((query) => query.table === 'acceptance_dependencies')
    expect(result.resolvedAction).toBe('physical_delete')
    expect(dependencyQuery?.or).toEqual(['source_plan_id.eq.plan-1,target_plan_id.eq.plan-1'])
    expect(dependencyQuery?.eq).toContainEqual(['project_id', 'project-1'])
    expect(dependencyQuery?.eq.some(([field]) => field === 'plan_id')).toBe(false)
  })

  it('scopes risk and issue reference reads to the requested project', async () => {
    const referenceQueries: Array<{
      table: string
      eq: Array<[string, unknown]>
    }> = []

    ;(mocks.supabase.from as any).mockImplementation((table: string) => {
      const query = { table, eq: [] as Array<[string, unknown]> }
      const chain: any = {
        eq: vi.fn((field: string, value: unknown) => {
          query.eq.push([field, value])
          return chain
        }),
        maybeSingle: vi.fn(async () => ({ data: {}, error: null })),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(resolve),
      }

      return {
        insert: vi.fn(async () => ({ error: null })),
        select: vi.fn(() => {
          referenceQueries.push(query)
          return chain
        }),
      }
    })

    await executeRetention({
      entityType: 'risk',
      entityId: 'risk-1',
      projectId: 'project-1',
      userAction: 'delete',
    })
    await executeRetention({
      entityType: 'issue',
      entityId: 'issue-1',
      projectId: 'project-1',
      userAction: 'delete',
    })

    const tenantReferenceQueries = referenceQueries.filter((query) => (
      ['risks', 'issues', 'notifications', 'change_logs'].includes(query.table)
    ))
    expect(tenantReferenceQueries.length).toBeGreaterThan(0)
    for (const query of tenantReferenceQueries) {
      expect(query.eq).toContainEqual(['project_id', 'project-1'])
    }
  })

  it('archives referenced participant units through the shared retention decision path', async () => {
    const countQueries: Array<{
      table: string
      eq: Array<[string, unknown]>
      contains: Array<[string, unknown]>
    }> = []

    ;(mocks.supabase.from as any).mockImplementation((table: string) => {
      const query = {
        table,
        eq: [] as Array<[string, unknown]>,
        contains: [] as Array<[string, unknown]>,
      }
      const select = vi.fn(() => {
        countQueries.push(query)
        const chain: any = {
          eq: vi.fn((field: string, value: unknown) => {
            query.eq.push([field, value])
            return chain
          }),
          contains: vi.fn((field: string, value: unknown) => {
            query.contains.push([field, value])
            return chain
          }),
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ count: table === 'tasks' ? 1 : 0, error: null }).then(resolve),
        }
        return chain
      })

      return {
        insert: vi.fn(async () => ({ error: null })),
        select,
      }
    })

    const result = await executeRetention({
      entityType: 'participant_unit',
      entityId: 'unit-1',
      projectId: 'project-1',
      userId: 'owner-1',
      userAction: 'delete',
    })

    expect(result).toMatchObject({
      resolvedAction: 'archive',
      executionMode: 'auto_execute',
      reasonCode: 'participant_unit_reference_archive',
      referenceSummary: { tasks: 1 },
    })
    expect(countQueries.find((query) => query.table === 'tasks')?.eq).toContainEqual(['participant_unit_id', 'unit-1'])
    expect(countQueries.find((query) => query.table === 'task_baseline_items')?.contains).toContainEqual([
      'task_fact_snapshot',
      { participant_unit_id: 'unit-1' },
    ])
  })

  it('reports diagnostics from coverage and event aggregates', async () => {
    const diagnostics = await getRetentionGovernanceDiagnostics({
      eventRows: [
        { entity_type: 'task', execution_status: 'pending_confirmation', reason_code: 'history_consumer_retained' },
        { entity_type: 'risk', execution_status: 'rejected', reason_code: 'upgrade_chain_protected' },
        { entity_type: 'task', execution_status: 'executed', reason_code: 'active_reference_close' },
        {
          entity_type: 'project_material',
          execution_status: 'confirming',
          reason_code: 'active_reference_close',
          confirmation_metadata: { reserved_at: '2026-05-27T00:00:00.000Z' },
        },
        { entity_type: 'construction_drawing', execution_status: 'failed', reason_code: 'confirm_executor_failed' },
      ],
      now: new Date('2026-05-27T00:15:01.000Z'),
    })

    expect(diagnostics.summary).toMatchObject({
      totalEvents: 5,
      pendingConfirmationCount: 1,
      rejectedCount: 1,
      executedCount: 1,
      confirmingCount: 1,
      staleConfirmingCount: 1,
      failedCount: 1,
    })
    expect(diagnostics.byEntityType.task).toBe(2)
    expect(diagnostics.byReasonCode.upgrade_chain_protected).toBe(1)
    expect(diagnostics.coverage.coveredEntityTypes).toContain('task')
    expect(diagnostics.executorRegistry.entries.length).toBeGreaterThan(0)
  })

  it('reports diagnostics gaps when confirmable coverage lacks an executor', () => {
    const diagnostics = getRetentionGovernanceDiagnosticsSync({
      coverageEntries: [
        {
          entityType: 'custom_entity',
          deletePolicy: 'close_retained',
          closePolicy: 'close_retained',
          archivePolicy: 'archive_retained',
          referenceChecks: ['change_logs'],
          supportsConfirmation: true,
          sourceDeletedPolicy: 'mark_downstream_source_deleted',
          primaryConsumers: ['custom route'],
        },
      ],
      executorEntries: [],
      eventRows: [],
    })

    expect(diagnostics.gaps.missingExecutorEntityTypes).toEqual(['custom_entity'])
    expect(diagnostics.summary.missingExecutorCount).toBe(1)
  })

  it('reports route and frontend contract gaps from source coverage diagnostics', () => {
    const diagnostics = getRetentionGovernanceDiagnosticsSync({
      eventRows: [],
      routeContracts: [
        {
          routeFile: 'risks.ts',
          entityTypes: ['risk'],
          guardMarkers: ['enforceRetentionOrBlock('],
          errorBuilderMarker: 'buildRetentionBlockedApiError',
        },
        {
          routeFile: 'issues.ts',
          entityTypes: ['issue'],
          guardMarkers: ['enforceRetentionOrBlock('],
          errorBuilderMarker: 'buildRetentionBlockedApiError',
        },
        {
          routeFile: 'participant-units.ts',
          entityTypes: ['participant_unit'],
          guardMarkers: ['executeRetention('],
          errorBuilderMarker: 'participant_unit_reference_aware_delete_or_archive',
        },
      ],
      routeSourceByFile: {
        'risks.ts': "const retention = await enforceRetentionOrBlock(input); return res.status(409).json({ error: { code: 'RETENTION_CONFIRMATION_REQUIRED' } })",
        'issues.ts': "return res.json({ success: true })",
        'participant-units.ts': "const classification = 'participant_unit_reference_aware_delete_or_archive'; await executeRetention(input)",
      },
      frontendConsumerContracts: [
        {
          consumerFile: 'RiskManagement.tsx',
          requiredMarkers: ["from '@/lib/retentionError'", "apiPost('/api/deletion-retention/confirm'"],
        },
      ],
      frontendSourceByFile: {
        'RiskManagement.tsx': "apiPost('/api/deletion-retention/confirm', payload)",
      },
    } as any)

    expect(diagnostics.summary.routeCoverageGapCount).toBe(1)
    expect(diagnostics.summary.unifiedErrorResponseGapCount).toBe(1)
    expect(diagnostics.summary.frontendConsumerGapCount).toBe(1)
    expect(diagnostics.gaps.routeCoverageGaps).toEqual([
      expect.objectContaining({ routeFile: 'issues.ts', missingMarkers: ['enforceRetentionOrBlock('] }),
    ])
    expect(diagnostics.gaps.unifiedErrorResponseRouteGaps).toEqual([
      expect.objectContaining({ routeFile: 'risks.ts', missingMarkers: ['buildRetentionBlockedApiError'] }),
    ])
    expect(diagnostics.gaps.frontendConsumerGaps).toEqual([
      expect.objectContaining({ consumerFile: 'RiskManagement.tsx', missingMarkers: ["from '@/lib/retentionError'"] }),
    ])
  })

  it('builds one shared blocked response and HTTP status contract', () => {
    const confirmable = {
      requiresUserConfirmation: true,
      executionMode: 'require_user_confirm',
      reason: 'Needs explicit confirmation.',
      referenceSummary: { change_logs: 1 },
    } as any
    const rejected = {
      requiresUserConfirmation: false,
      executionMode: 'reject',
      reason: 'Cannot delete escalation chain.',
      referenceSummary: { upgrade_chain: 1 },
    } as any

    expect(buildRetentionBlockedHttpStatus(confirmable)).toBe(409)
    expect(buildRetentionBlockedHttpStatus(rejected)).toBe(422)
    expect(buildRetentionBlockedApiError('Task retained.', confirmable, {
      details: { entity_type: 'task', decisionToken: 'token-1' },
    })).toEqual({
      code: 'RETENTION_CONFIRMATION_REQUIRED',
      message: 'Task retained.',
      details: { entity_type: 'task', decisionToken: 'token-1' },
    })
  })

  it('reports failed and stale confirming events that need operator attention', async () => {
    const diagnostics = await getRetentionGovernanceDiagnostics({
      eventRows: [
        {
          entity_type: 'project_material',
          execution_status: 'confirming',
          reason_code: 'active_reference_close',
          confirmation_metadata: {
            reserved_at: '2026-05-27T00:00:00.000Z',
            recovery_attempts: 2,
          },
        },
        {
          entity_type: 'construction_drawing',
          execution_status: 'failed',
          reason_code: 'confirm_executor_failed',
          confirmation_metadata: {
            last_error_code: 'CONFIRMED_RETENTION_ACTION_FAILED',
            last_error_message: 'update failed',
          },
        },
      ],
      now: new Date('2026-05-27T00:15:01.000Z'),
    })

    expect(diagnostics.operatorAttention).toEqual([
      expect.objectContaining({
        entityType: 'project_material',
        executionStatus: 'confirming',
        stale: true,
        recoveryAttempts: 2,
      }),
      expect.objectContaining({
        entityType: 'construction_drawing',
        executionStatus: 'failed',
        lastErrorCode: 'CONFIRMED_RETENTION_ACTION_FAILED',
      }),
    ])
  })

  it('scopes diagnostics event aggregates to visible project ids', async () => {
    const diagnostics = await getRetentionGovernanceDiagnostics({
      visibleProjectIds: ['project-visible'],
      eventRows: [
        { project_id: 'project-visible', entity_type: 'task', execution_status: 'pending_confirmation', reason_code: 'history_consumer_retained' },
        { project_id: 'project-hidden', entity_type: 'risk', execution_status: 'failed', reason_code: 'confirm_executor_failed' },
      ],
    })

    expect(diagnostics.summary.totalEvents).toBe(1)
    expect(diagnostics.byEntityType).toEqual({ task: 1 })
    expect(diagnostics.byReasonCode).toEqual({ history_consumer_retained: 1 })
    expect(diagnostics.scope).toMatchObject({
      visibleProjectScoped: true,
      visibleProjectCount: 1,
    })
  })

  it('previews confirmed retention executor mutations without applying them', async () => {
    mocks.supabase.from.mockClear()

    const preview = await previewRetentionConfirmedAction({
      projectId: 'project-1',
      entityType: 'project_material',
      entityId: 'material-1',
      resolvedAction: 'archive',
      actorId: 'owner-1',
    })

    expect(preview).toMatchObject({
      previewOnly: true,
      applied: false,
      supported: true,
      entityType: 'project_material',
      entityId: 'material-1',
      resolvedAction: 'archive',
      mutations: [
        expect.objectContaining({
          table: 'project_materials',
          filters: { id: 'material-1', project_id: 'project-1' },
          patch: expect.objectContaining({
            record_status: 'inactive',
            lifecycle_status: 'archived',
            deleted_by: 'owner-1',
          }),
        }),
      ],
    })
    expect(mocks.supabase.from).not.toHaveBeenCalledWith('project_materials')
  })

  it('previews risk and issue retention closure with a complete structured outcome', async () => {
    for (const entityType of ['risk', 'issue'] as const) {
      const preview = await previewRetentionConfirmedAction({
        projectId: 'project-1',
        entityType,
        entityId: `${entityType}-1`,
        resolvedAction: 'close',
        actorId: 'owner-1',
      })

      expect(preview.mutations).toEqual([
        expect.objectContaining({
          table: entityType === 'risk' ? 'risks' : 'issues',
          filters: { id: `${entityType}-1`, project_id: 'project-1' },
          patch: expect.objectContaining({
            status: 'closed',
            pending_manual_close: false,
            closed_reason: 'retention_close',
            closure_result_code: 'retention_close',
            closure_result_summary: expect.any(String),
            closure_effectiveness: 'undetermined',
            closure_evidence_refs: [],
            closure_cause_attribution_id: null,
            closed_by: 'owner-1',
            closure_recorded_at: expect.any(String),
          }),
        }),
      ])
    }
  })

  it('previews participant unit archival through the shared retention executor registry', async () => {
    mocks.supabase.from.mockClear()

    const preview = await previewRetentionConfirmedAction({
      projectId: 'project-1',
      entityType: 'participant_unit',
      entityId: 'unit-1',
      resolvedAction: 'archive',
      actorId: 'owner-1',
    })

    expect(preview).toMatchObject({
      previewOnly: true,
      supported: true,
      entityType: 'participant_unit',
      entityId: 'unit-1',
      mutations: [
        expect.objectContaining({
          table: 'participant_units',
          filters: { id: 'unit-1', project_id: 'project-1' },
          patch: expect.objectContaining({
            unit_status: 'archived',
          }),
        }),
      ],
    })
    expect(mocks.supabase.from).not.toHaveBeenCalledWith('participant_units')
  })

  it('exposes a concrete transaction boundary contract for future atomic confirmation execution', () => {
    const boundary = createRetentionConfirmationTransactionBoundary({
      eventId: 'event-1',
      projectId: 'project-1',
      entityType: 'project_material',
      entityId: 'material-1',
      resolvedAction: 'archive',
    })

    expect(boundary).toMatchObject({
      boundaryId: 'retention_confirmation_transaction_boundary',
      eventId: 'event-1',
      transactionReady: false,
      requiresTransactionClient: true,
      canExecuteAtomically: false,
      executorRegistered: true,
      executorTransactionMode: 'single_table_update',
      steps: [
        'reserve_decision_event',
        'execute_domain_lifecycle_action',
        'persist_confirmation_audit',
      ],
    })
  })

  it('executes the transaction boundary through one injected transaction client when available', async () => {
    const steps: string[] = []
    const boundaryResult = await executeRetentionConfirmationTransactionBoundary({
      eventId: 'event-1',
      projectId: 'project-1',
      entityType: 'project_material',
      entityId: 'material-1',
      resolvedAction: 'archive',
      transactionClient: {
        reserveDecisionEvent: async (input: any) => {
          steps.push(`reserve:${input.eventId}`)
          return { reserved: true }
        },
        executeDomainLifecycleAction: async (input: any) => {
          steps.push(`mutate:${input.entityType}:${input.entityId}`)
          return { applied: true }
        },
        persistConfirmationAudit: async (input: any) => {
          steps.push(`audit:${input.eventId}`)
          return { audited: true }
        },
      },
    })

    expect(steps).toEqual([
      'reserve:event-1',
      'mutate:project_material:material-1',
      'audit:event-1',
    ])
    expect(boundaryResult).toMatchObject({
      executedAtomically: true,
      transactionReady: true,
      results: {
        reserveDecisionEvent: { reserved: true },
        executeDomainLifecycleAction: { applied: true },
        persistConfirmationAudit: { audited: true },
      },
    })
  })
})
