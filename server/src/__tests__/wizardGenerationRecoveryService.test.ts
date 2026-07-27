import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  clientQuery: vi.fn(),
  release: vi.fn(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('../database.js', () => ({
  query: mocks.query,
  getClient: vi.fn(async () => ({
    query: mocks.clientQuery,
    release: mocks.release,
  })),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: mocks.logger,
}))

describe('wizard generation recovery service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.mockReset()
    mocks.clientQuery.mockReset()
    mocks.query.mockResolvedValue({ rows: [] })
    mocks.clientQuery.mockResolvedValue({ rowCount: 1, rows: [] })
  })

  it('recovers stale queued/running wizard attempts and removes batch artifacts transactionally', async () => {
    const { recoverStaleWizardGenerationAttempts } = await import('../services/wizardGenerationRecoveryService.js')
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: 'project-1',
        metadata: {
          wizard_generation_state: 'running',
          wizard_generation_batch_id: 'batch-1',
          wizard_generation_attempt_id: 'attempt-1',
          wizard_generation_started_at: '2026-06-25T01:00:00.000Z',
          wizard_generated_baseline_ids: ['baseline-1'],
          wizard_created_task_ids: ['task-1'],
          wizard_materialized_object_ids: ['object-1'],
          wizard_generated_acceptance_plan_ids: ['acceptance-generated-1'],
          wizard_passed_acceptance_plan_ids: ['acceptance-1'],
        },
      }],
    })

    const result = await recoverStaleWizardGenerationAttempts({
      now: new Date('2026-06-25T01:30:00.000Z'),
      staleWindowMs: 15 * 60 * 1000,
      limit: 10,
    })

    expect(result).toEqual({
      scanned: 1,
      recovered: 1,
      failed: 0,
      cutoff: '2026-06-25T01:15:00.000Z',
      recoveredProjectIds: ['project-1'],
    })

    expect(mocks.clientQuery.mock.calls[0][0]).toBe('BEGIN')
    const deleteBaselineCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM task_baselines'))
    expect(deleteBaselineCall?.[1]).toEqual(['project-1', 'batch-1', ['baseline-1']])
    const deleteAcceptanceTaskLinksCall = mocks.clientQuery.mock.calls.find(([sql]) => (
      String(sql).includes('DELETE FROM project_entity_links')
    ))
    const deleteAcceptanceCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('DELETE FROM acceptance_plans'))
    expect(deleteAcceptanceTaskLinksCall?.[1]).toEqual([
      'project-1',
      'batch-1',
      ['acceptance-generated-1', 'acceptance-1'],
      ['task-1'],
      '%[wizard_generation_batch_id:batch-1]%',
    ])
    expect(String(deleteAcceptanceTaskLinksCall?.[0])).toContain("source_entity_type = 'acceptance_plan'")
    expect(String(deleteAcceptanceTaskLinksCall?.[0])).toContain("target_entity_type = 'task'")
    expect(String(deleteAcceptanceTaskLinksCall?.[0])).toContain("relation_type = 'covers_task'")
    expect(mocks.clientQuery.mock.calls.indexOf(deleteAcceptanceTaskLinksCall!))
      .toBeLessThan(mocks.clientQuery.mock.calls.indexOf(deleteAcceptanceCall!))
    expect(deleteAcceptanceCall?.[1]).toEqual([
      'project-1',
      'batch-1',
      ['acceptance-generated-1', 'acceptance-1'],
      '%[wizard_generation_batch_id:batch-1]%',
    ])
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM task_dependencies'))).toBe(true)
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM tasks'))).toBe(true)
    expect(mocks.clientQuery.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM engineering_objects'))).toBe(true)

    const updateCall = mocks.clientQuery.mock.calls.find(([sql]) => String(sql).includes('UPDATE projects'))
    expect(updateCall?.[1]).toEqual(expect.arrayContaining([
      'project-1',
      'wizard_drafting',
      expect.stringContaining('"wizard_generation_state":"failed"'),
      '2026-06-25T01:30:00.000Z',
    ]))
    expect(updateCall?.[1]?.[2]).toContain('WIZARD_GENERATION_STALE_ATTEMPT_RECOVERED')
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT')
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })

  it('selects only stale queued/running draft projects by business cutoff', async () => {
    const { recoverStaleWizardGenerationAttempts } = await import('../services/wizardGenerationRecoveryService.js')

    await recoverStaleWizardGenerationAttempts({
      now: new Date('2026-06-25T02:00:00.000Z'),
      staleWindowMs: 30 * 60 * 1000,
      limit: 5,
    })

    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("metadata->>'wizard_generation_state'"),
      [
        'wizard_drafting',
        ['running', 'queued'],
        '2026-06-25T01:30:00.000Z',
        5,
      ],
    )
    expect(mocks.clientQuery).not.toHaveBeenCalled()
  })

  it('rolls back one failed recovery and continues reporting the failure', async () => {
    const { recoverStaleWizardGenerationAttempts } = await import('../services/wizardGenerationRecoveryService.js')
    mocks.query.mockResolvedValueOnce({
      rows: [{
        id: 'project-1',
        metadata: {
          wizard_generation_state: 'queued',
          wizard_generation_batch_id: 'batch-1',
          wizard_generation_queued_at: '2026-06-25T01:00:00.000Z',
        },
      }],
    })
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE FROM tasks')) throw new Error('delete failed')
      return { rowCount: 1, rows: [] }
    })

    const result = await recoverStaleWizardGenerationAttempts({
      now: new Date('2026-06-25T01:30:00.000Z'),
    })

    expect(result.recovered).toBe(0)
    expect(result.failed).toBe(1)
    expect(mocks.clientQuery.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true)
    expect(mocks.logger.error).toHaveBeenCalledWith(
      '[wizardGenerationRecovery] failed to recover stale wizard generation',
      expect.objectContaining({ projectId: 'project-1' }),
    )
  })

  it('retries persisted post-commit derivations for completed projects and scopes every state write', async () => {
    const { recoverPendingWizardPostCommitDerivations } = await import('../services/wizardGenerationRecoveryService.js')
    const criticalPath = vi.fn(async () => ({ criticalTaskCount: 3 }))
    const durationEvidence = vi.fn(async () => ({ evidenceCount: 2 }))
    const state = {
      source: 'wizard_post_commit_derivation_recovery' as const,
      operationId: 'project-1:batch-1:wizard_post_commit_derivations',
      projectId: 'project-1',
      generationBatchId: 'batch-1',
      status: 'pending' as const,
      createdAt: '2026-07-12T08:00:00.000Z',
      updatedAt: '2026-07-12T08:00:00.000Z',
      maxAttempts: 3,
      stages: {
        critical_path: {
          status: 'pending' as const,
          attemptCount: 0,
          lastAttemptAt: null,
          succeededAt: null,
          failedAt: null,
          lastError: null,
          output: null,
        },
        duration_evidence: {
          status: 'pending' as const,
          attemptCount: 0,
          lastAttemptAt: null,
          succeededAt: null,
          failedAt: null,
          lastError: null,
          output: null,
        },
      },
      mutationBoundary: {
        transactionAlreadyCommitted: true as const,
        retriesDerivationsOnly: true as const,
        rewritesGeneratedTasks: false as const,
        rewritesTaskDependencies: false as const,
        rewritesPlanDates: false as const,
      },
    }
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, company_id, metadata')) {
        return {
          rows: [{
            id: 'project-1',
            company_id: 'company-1',
            metadata: {
              wizard_generation_post_commit_derivations: state,
              constructionOrganizationScenario: {
                source: 'construction_organization_scenario_selector',
                projectLevelSnapshot: { mode: 'new' },
              },
              constructionOrganizationScenarioSummary: { recommendedPlanOptionId: 'option-1' },
            },
          }],
        }
      }
      return { rowCount: 1, rows: [] }
    })

    const result = await recoverPendingWizardPostCommitDerivations({
      limit: 10,
      now: () => '2026-07-12T08:05:00.000Z',
      runDerivations: async ({ state: current, derivations, persistState }) => {
        const criticalPathOutput = await derivations.critical_path()
        const durationEvidenceOutput = await derivations.duration_evidence()
        const next = {
          ...current,
          status: 'succeeded' as const,
          updatedAt: '2026-07-12T08:05:00.000Z',
          stages: {
            critical_path: {
              ...current.stages.critical_path,
              status: 'succeeded' as const,
              attemptCount: 1,
              output: criticalPathOutput,
            },
            duration_evidence: {
              ...current.stages.duration_evidence,
              status: 'succeeded' as const,
              attemptCount: 1,
              output: durationEvidenceOutput,
            },
          },
        }
        await persistState(next)
        return next
      },
      executors: {
        refreshCriticalPath: criticalPath,
        recordDurationEvidence: durationEvidence,
      },
    })

    expect(result).toEqual({
      scanned: 1,
      recovered: 1,
      pending: 0,
      failed: 0,
      recoveredProjectIds: ['project-1'],
      pendingProjectIds: [],
      failedProjectIds: [],
    })
    expect(criticalPath).toHaveBeenCalledWith({
      projectId: 'project-1',
      generationBatchId: 'batch-1',
    })
    expect(durationEvidence).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      companyId: 'company-1',
      generationBatchId: 'batch-1',
      mode: 'new',
      capturedAt: '2026-07-12T08:00:00.000Z',
    }))
    const stateWrites = mocks.query.mock.calls.filter(([sql]) => String(sql).includes('wizard_generation_post_commit_derivations'))
    expect(stateWrites.length).toBeGreaterThan(1)
    for (const [, params] of stateWrites.slice(1)) {
      expect(params).toEqual(expect.arrayContaining(['project-1', 'company-1']))
    }
  })
})
