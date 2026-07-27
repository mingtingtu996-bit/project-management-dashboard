import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, any>

const mocks = vi.hoisted(() => {
  const state = {
    canaryCandidates: [] as Row[],
    policyVersions: [] as Row[],
    failNextVersionInsert: false,
    changeCandidateBeforeAtomicApproval: false,
    transactionSnapshot: null as { canaryCandidates: Row[]; policyVersions: Row[] } | null,
  }

  function rowsFor(table: string) {
    if (table === 'duration_context_policy_canary_candidates') return state.canaryCandidates
    if (table === 'duration_context_policy_versions') return state.policyVersions
    return []
  }

  function createBuilder(table: string) {
    const rows = rowsFor(table)
    const filters: Array<{ column: string; value: unknown }> = []
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push({ column, value })
        return builder
      }),
      maybeSingle: vi.fn(async () => {
        const row = rows.find((item) => filters.every((filter) => item[filter.column] === filter.value))
        return { data: row ?? null, error: null }
      }),
      update: vi.fn((patch: Row) => ({
        eq: vi.fn(),
      })),
      insert: vi.fn((payload: Row | Row[]) => {
        if (table === 'duration_context_policy_versions' && state.failNextVersionInsert) {
          state.failNextVersionInsert = false
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: { message: 'version insert failed' },
              })),
            })),
          }
        }
        const payloadRows = Array.isArray(payload) ? payload : [payload]
        const inserted = payloadRows.map((item) => {
          const row = { id: item.id ?? `${table}-${rows.length + 1}`, ...item }
          rows.push(row)
          return row
        })
        return {
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: inserted[0] ?? null, error: null })),
          })),
        }
      }),
    }
    return builder
  }

  function attachUpdateBuilder(builder: any, rows: Row[]) {
    builder.update.mockImplementation((patch: Row) => {
      const updateFilters: Array<{ column: string; value: unknown }> = []
      const updateBuilder: any = {
        eq: vi.fn((column: string, value: unknown) => {
          updateFilters.push({ column, value })
          return updateBuilder
        }),
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            const updatedRows = rows
              .filter((item) => updateFilters.every((filter) => item[filter.column] === filter.value))
              .map((item) => Object.assign(item, patch))
            return { data: updatedRows[0] ?? null, error: null }
          }),
        })),
      }
      return updateBuilder
    })
    return builder
  }

  const defaultFromImplementation = (table: string) => {
      const rows = rowsFor(table)
      return attachUpdateBuilder(createBuilder(table), rows)
    }
  const from = vi.fn(defaultFromImplementation)
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
    if (normalized === 'begin') {
      state.transactionSnapshot = {
        canaryCandidates: structuredClone(state.canaryCandidates),
        policyVersions: structuredClone(state.policyVersions),
      }
      return { rows: [], rowCount: 0 }
    }
    if (normalized === 'commit') {
      state.transactionSnapshot = null
      return { rows: [], rowCount: 0 }
    }
    if (normalized === 'rollback') {
      if (state.transactionSnapshot) {
        state.canaryCandidates.splice(0, state.canaryCandidates.length, ...state.transactionSnapshot.canaryCandidates)
        state.policyVersions.splice(0, state.policyVersions.length, ...state.transactionSnapshot.policyVersions)
      }
      state.transactionSnapshot = null
      return { rows: [], rowCount: 0 }
    }
    if (normalized.includes('approve_duration_context_policy_canary_candidate_atomic')) {
      const [companyId, candidateId, approvedBy, scope, reason, expiresAt, reviewMetadata] = params as any[]
      const parsedScope = typeof scope === 'string' ? JSON.parse(scope) : scope
      const parsedReviewMetadata = typeof reviewMetadata === 'string' ? JSON.parse(reviewMetadata) : reviewMetadata
      if (state.changeCandidateBeforeAtomicApproval) {
        const stale = state.canaryCandidates.find((row) => row.id === candidateId)
        if (stale) stale.candidate_status = 'approved_for_canary'
        state.changeCandidateBeforeAtomicApproval = false
      }
      const candidate = state.canaryCandidates.find((row) => (
        row.id === candidateId && row.company_id === companyId && row.candidate_status === 'candidate'
      ))
      if (!candidate) throw new Error('Duration context policy canary candidate not found for tenant or already changed.')
      const projectIds = Array.isArray(parsedScope?.projectIds) ? parsedScope.projectIds : []
      if (projectIds.some((projectId: string) => !state.canaryCandidates.some((row) => (
        row.project_id === projectId && row.company_id === companyId
      )))) {
        throw new Error('Canary scope includes a project outside the current tenant.')
      }
      const previous = state.policyVersions.find((row) => (
        row.company_id === companyId
        && row.project_id === candidate.project_id
        && row.state_bucket === candidate.state_bucket
        && row.action_key === candidate.action_key
        && ['canary', 'published'].includes(row.version_status)
      ))
      if (previous) {
        previous.version_status = 'expired'
        previous.rollback_metadata = {
          ...(previous.rollback_metadata ?? {}),
          supersededByCandidateId: candidateId,
        }
      }
      candidate.candidate_status = 'approved_for_canary'
      candidate.runtime_auto_publish_eligible = false
      candidate.review_metadata = {
        reviewedBy: approvedBy ?? null,
        reviewReason: reason ?? null,
        ...(parsedReviewMetadata ?? {}),
      }
      if (state.failNextVersionInsert) {
        state.failNextVersionInsert = false
        throw new Error('version insert failed')
      }
      const version = {
        id: `duration_context_policy_versions-${state.policyVersions.length + 1}`,
        company_id: companyId,
        project_id: candidate.project_id,
        model_family: candidate.model_family,
        model_version: candidate.model_version,
        source_candidate_id: candidateId,
        version_status: 'canary',
        activation_mode: 'review_required_canary',
        runtime_mutation_policy: 'none_version_registry_only',
        runtime_auto_publish_eligible: false,
        rollback_policy: 'manual_rollback_required_before_runtime_disablement',
        state_bucket: candidate.state_bucket,
        action_key: candidate.action_key,
        canary_scope: parsedScope,
        approved_by: approvedBy ?? null,
        expires_at: expiresAt ?? null,
        approval_reason: reason ?? null,
        approved_at: new Date().toISOString(),
      }
      state.policyVersions.push(version)
      return {
        rows: [{
          candidate_row: structuredClone(candidate),
          version_row: structuredClone(version),
          superseded_version_id: previous?.id ?? null,
        }],
        rowCount: 1,
      }
    }
    if (normalized.includes('rollback_duration_context_policy_version_atomic')) {
      const [companyId, versionId, rolledBackBy, reason] = params as any[]
      const version = state.policyVersions.find((row) => row.id === versionId && row.company_id === companyId)
      if (!version) throw new Error('Duration context policy version not found for tenant.')
      version.version_status = 'rolled_back'
      version.runtime_auto_publish_eligible = false
      version.rollback_metadata = { rolledBackBy, rollbackReason: reason }
      const restored = state.policyVersions.find((row) => (
        row.id !== version.id
        && row.company_id === companyId
        && row.project_id === version.project_id
        && row.state_bucket === version.state_bucket
        && row.action_key === version.action_key
        && row.version_status === 'expired'
        && row.rollback_metadata?.supersededByCandidateId === version.source_candidate_id
      )) ?? null
      if (restored) restored.version_status = 'published'
      return {
        rows: [{
          rolled_back_version_row: structuredClone(version),
          restored_version_row: restored ? structuredClone(restored) : null,
        }],
        rowCount: 1,
      }
    }
    throw new Error(`Unexpected transaction SQL: ${normalized}`)
  })
  const release = vi.fn()
  const getClient = vi.fn(async () => ({ query, release }))

  return {
    state,
    from,
    attachUpdateBuilder,
    resetFromMock: () => {
      from.mockImplementation(defaultFromImplementation)
    },
    query,
    release,
    getClient,
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: mocks.from,
  },
}))

vi.mock('../database.js', () => ({
  getClient: mocks.getClient,
}))

const {
  approveDurationContextPolicyCanaryCandidateBatch,
  approveDurationContextPolicyCanaryCandidate,
  rejectDurationContextPolicyCanaryCandidate,
  rollbackDurationContextPolicyVersion,
} = await import('../services/durationContextPolicyCanaryApprovalService.js')

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readMigration(filename: string) {
  return readFileSync(resolve(serverRoot, 'migrations', filename), 'utf8')
}

describe('durationContextPolicyCanaryApprovalService', () => {
  beforeEach(() => {
    mocks.state.canaryCandidates = [
      {
        id: 'candidate-1',
        company_id: 'company-1',
        model_family: 'contextual_bandit_v1',
        model_version: 'contextual_bandit_v1',
        candidate_status: 'candidate',
        runtime_mutation_policy: 'none_canary_candidate_only',
        runtime_auto_publish_eligible: false,
        requires_review: true,
        project_id: 'project-1',
        state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
        action_key: 'publish_low_risk_calibration_threshold',
        replay_case_count: 42,
        average_projected_reward_delta: 0.12,
        source_decision_ids: ['decision-1', 'decision-2'],
        guardrails: ['low_risk_canary_review_required'],
      },
      {
        id: 'candidate-high-risk',
        company_id: 'company-1',
        model_family: 'contextual_bandit_v1',
        model_version: 'contextual_bandit_v1',
        candidate_status: 'candidate',
        runtime_mutation_policy: 'none_canary_candidate_only',
        runtime_auto_publish_eligible: false,
        requires_review: true,
        project_id: 'project-1',
        state_bucket: 'mature_90d|risk:high|schedule:accelerating|hard:0',
        action_key: 'hold_high_risk_candidate_for_review',
        replay_case_count: 80,
        average_projected_reward_delta: 0.5,
        source_decision_ids: ['decision-high'],
        guardrails: ['manual_runtime_promotion_required'],
      },
      {
        id: 'candidate-2',
        company_id: 'company-1',
        model_family: 'contextual_bandit_v1',
        model_version: 'contextual_bandit_v1',
        candidate_status: 'candidate',
        runtime_mutation_policy: 'none_canary_candidate_only',
        runtime_auto_publish_eligible: false,
        requires_review: true,
        project_id: 'project-2',
        state_bucket: 'mature_90d|risk:low|schedule:stable|hard:0',
        action_key: 'publish_low_risk_calibration_threshold',
        replay_case_count: 38,
        average_projected_reward_delta: 0.09,
        source_decision_ids: ['decision-3'],
        guardrails: ['low_risk_canary_review_required'],
      },
    ]
    mocks.state.policyVersions = []
    mocks.state.failNextVersionInsert = false
    mocks.state.changeCandidateBeforeAtomicApproval = false
    mocks.state.transactionSnapshot = null
    mocks.resetFromMock()
    mocks.from.mockClear()
    mocks.query.mockClear()
    mocks.release.mockClear()
    mocks.getClient.mockClear()
  })

  it('approves multiple low-risk candidates through one weekly governance batch click', async () => {
    const result = await approveDurationContextPolicyCanaryCandidateBatch({
      companyId: 'company-1',
      batchId: 'weekly-2026-06-21',
      approvedBy: 'admin-1',
      reason: 'weekly governance batch',
      items: [
        {
          candidateId: 'candidate-1',
          scope: { projectIds: ['project-1'], trafficPercent: 5 },
        },
        {
          candidateId: 'candidate-2',
          scope: { projectIds: ['project-2'], trafficPercent: 5 },
          reason: 'second stable low-risk replay result',
        },
      ],
    })

    expect(result).toEqual(expect.objectContaining({
      approvalCode: 'duration_context_policy_canary_batch_approval',
      humanReviewMode: 'weekly_batch_single_click',
      runtimeMutationPolicy: 'none_batch_approval_record_only',
      batchId: 'weekly-2026-06-21',
      approvedCount: 2,
      failedCount: 0,
    }))
    expect(result.approvals.map((approval) => approval.candidateId)).toEqual(['candidate-1', 'candidate-2'])
    expect(result.failures).toEqual([])
    expect(mocks.state.policyVersions).toHaveLength(2)
    expect(mocks.state.policyVersions.map((version) => version.source_candidate_id)).toEqual([
      'candidate-1',
      'candidate-2',
    ])
    expect(mocks.state.canaryCandidates[0].review_metadata).toEqual(expect.objectContaining({
      batchId: 'weekly-2026-06-21',
      humanReviewMode: 'weekly_batch_single_click',
    }))
    expect(mocks.state.policyVersions[0].approval_reason).toContain('[batch:weekly-2026-06-21]')
  })

  it('approves a low-risk candidate into a review-scoped canary policy version without runtime auto-publish', async () => {
    const result = await approveDurationContextPolicyCanaryCandidate({
      companyId: 'company-1',
      candidateId: 'candidate-1',
      approvedBy: 'admin-1',
      scope: {
        projectIds: ['project-1'],
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        trafficPercent: 10,
      },
      reason: 'low-risk replay delta is stable',
      expiresAt: '2026-07-01T00:00:00.000Z',
    })

    expect(result).toEqual(expect.objectContaining({
      approvalCode: 'duration_context_policy_canary_approval',
      runtimeMutationPolicy: 'none_approval_record_only',
      candidateStatus: 'approved_for_canary',
      versionStatus: 'canary',
      runtimeAutoPublishEligible: false,
    }))
    expect(result.policyVersion).toEqual(expect.objectContaining({
      sourceCandidateId: 'candidate-1',
      status: 'canary',
      activationMode: 'review_required_canary',
      runtimeMutationPolicy: 'none_version_registry_only',
      rollbackPolicy: 'manual_rollback_required_before_runtime_disablement',
    }))
    expect(mocks.state.canaryCandidates[0]).toEqual(expect.objectContaining({
      candidate_status: 'approved_for_canary',
      runtime_auto_publish_eligible: false,
    }))
    expect(mocks.state.policyVersions).toHaveLength(1)
    expect(mocks.state.policyVersions[0]).toEqual(expect.objectContaining({
      source_candidate_id: 'candidate-1',
      version_status: 'canary',
      runtime_mutation_policy: 'none_version_registry_only',
      activation_mode: 'review_required_canary',
      rollback_policy: 'manual_rollback_required_before_runtime_disablement',
      runtime_auto_publish_eligible: false,
    }))
  })

  it('fails approval when the candidate status changed before the guarded update', async () => {
    mocks.state.changeCandidateBeforeAtomicApproval = true
    let staleUpdateInjected = false
    mocks.from.mockImplementation((table: string) => {
      const rows = table === 'duration_context_policy_canary_candidates'
        ? mocks.state.canaryCandidates
        : table === 'duration_context_policy_versions'
          ? mocks.state.policyVersions
          : []
      const filters: Array<{ column: string; value: unknown }> = []
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push({ column, value })
          return builder
        }),
        maybeSingle: vi.fn(async () => {
          const row = rows.find((item) => filters.every((filter) => item[filter.column] === filter.value))
          return { data: row ?? null, error: null }
        }),
        update: vi.fn((patch: Row) => {
          const updateFilters: Array<{ column: string; value: unknown }> = []
          const updateBuilder: any = {
            eq: vi.fn((column: string, value: unknown) => {
              updateFilters.push({ column, value })
              return updateBuilder
            }),
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                if (!staleUpdateInjected && table === 'duration_context_policy_canary_candidates') {
                  staleUpdateInjected = true
                  const idFilter = updateFilters.find((filter) => filter.column === 'id')
                  const row = rows.find((item) => item.id === idFilter?.value)
                  if (row) row.candidate_status = 'approved_for_canary'
                }
                const updatedRows = rows
                  .filter((item) => updateFilters.every((filter) => item[filter.column] === filter.value))
                  .map((item) => Object.assign(item, patch))
                return { data: updatedRows[0] ?? null, error: null }
              }),
            })),
          }
          return updateBuilder
        }),
        insert: vi.fn((payload: Row | Row[]) => {
          const payloadRows = Array.isArray(payload) ? payload : [payload]
          const inserted = payloadRows.map((item) => {
            const row = { id: item.id ?? `${table}-${rows.length + 1}`, ...item }
            rows.push(row)
            return row
          })
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: inserted[0] ?? null, error: null })),
            })),
          }
        }),
      }
      return builder
    })

    await expect(approveDurationContextPolicyCanaryCandidate({
      companyId: 'company-1',
      candidateId: 'candidate-1',
      approvedBy: 'admin-1',
      scope: { projectIds: ['project-1'], trafficPercent: 5 },
    })).rejects.toThrow(/already changed/i)
  })

  it('does not leave an approved orphan candidate when canary version persistence fails', async () => {
    mocks.state.failNextVersionInsert = true

    await expect(approveDurationContextPolicyCanaryCandidate({
      companyId: 'company-1',
      candidateId: 'candidate-1',
      approvedBy: 'admin-1',
      scope: { projectIds: ['project-1'], trafficPercent: 5 },
      reason: 'low-risk replay delta is stable',
    })).rejects.toThrow('version insert failed')

    expect(mocks.state.policyVersions).toHaveLength(0)
    expect(mocks.state.canaryCandidates[0]).toEqual(expect.objectContaining({
      candidate_status: 'candidate',
    }))
  })

  it('rejects high-risk canary approval while allowing explicit rejection records', async () => {
    await expect(approveDurationContextPolicyCanaryCandidate({
      companyId: 'company-1',
      candidateId: 'candidate-high-risk',
      approvedBy: 'admin-1',
      scope: { projectIds: ['project-1'], trafficPercent: 10 },
    })).rejects.toThrow(/cannot be approved for canary/i)

    const rejected = await rejectDurationContextPolicyCanaryCandidate({
      companyId: 'company-1',
      candidateId: 'candidate-high-risk',
      rejectedBy: 'admin-1',
      reason: 'high-risk climate/calendar state bucket stays manual',
    })

    expect(rejected).toEqual(expect.objectContaining({
      approvalCode: 'duration_context_policy_canary_rejection',
      candidateStatus: 'rejected',
      runtimeMutationPolicy: 'none_rejection_record_only',
    }))
    expect(mocks.state.canaryCandidates[1]).toEqual(expect.objectContaining({
      candidate_status: 'rejected',
      runtime_auto_publish_eligible: false,
    }))
    expect(mocks.state.policyVersions).toHaveLength(0)
  })

  it('rolls back a canary policy version as a registry event without touching runtime factors', async () => {
    mocks.state.policyVersions.push({
      id: 'previous-stable-version',
      company_id: 'company-1',
      project_id: 'project-1',
      model_family: 'contextual_bandit_v1',
      model_version: 'contextual_bandit_v1',
      source_candidate_id: 'previous-candidate',
      version_status: 'published',
      activation_mode: 'auto_publish_gate_canary',
      runtime_mutation_policy: 'none_version_registry_only',
      runtime_auto_publish_eligible: false,
      rollback_policy: 'auto_or_manual_rollback_on_mae_regression_or_guardrail_drift',
      state_bucket: 'mature_90d|risk:low|schedule:accelerating|hard:0',
      action_key: 'publish_low_risk_calibration_threshold',
      canary_scope: { projectIds: ['project-1'], trafficPercent: 100 },
      approved_at: '2026-05-01T00:00:00.000Z',
      rollback_metadata: {},
    })
    const approved = await approveDurationContextPolicyCanaryCandidate({
      companyId: 'company-1',
      candidateId: 'candidate-1',
      approvedBy: 'admin-1',
      scope: { projectIds: ['project-1'], trafficPercent: 5 },
    })
    expect(mocks.state.policyVersions[0].version_status).toBe('expired')

    const rollback = await rollbackDurationContextPolicyVersion({
      companyId: 'company-1',
      versionId: approved.policyVersion.id,
      rolledBackBy: 'admin-2',
      reason: 'guardrail drift in replay monitor',
    })

    expect(rollback).toEqual(expect.objectContaining({
      rollbackCode: 'duration_context_policy_version_rollback',
      versionStatus: 'rolled_back',
      runtimeMutationPolicy: 'none_version_registry_only',
    }))
    expect(mocks.state.policyVersions[0]).toEqual(expect.objectContaining({
      version_status: 'published',
    }))
    expect(mocks.state.policyVersions[1]).toEqual(expect.objectContaining({
      version_status: 'rolled_back',
      runtime_auto_publish_eligible: false,
    }))
    expect(rollback.restoredPolicyVersion).toEqual(expect.objectContaining({
      id: 'previous-stable-version',
      status: 'published',
    }))
  })

  it('requires an explicit company tenant for every governance mutation', async () => {
    await expect(approveDurationContextPolicyCanaryCandidate({
      candidateId: 'candidate-1',
      approvedBy: 'admin-1',
    } as any)).rejects.toThrow(/companyId is required/i)
    await expect(rejectDurationContextPolicyCanaryCandidate({
      candidateId: 'candidate-1',
      rejectedBy: 'admin-1',
    } as any)).rejects.toThrow(/companyId is required/i)
    await expect(rollbackDurationContextPolicyVersion({
      versionId: 'version-1',
      rolledBackBy: 'admin-1',
    } as any)).rejects.toThrow(/companyId is required/i)
  })

  it('rejects a candidate from another company without mutating it', async () => {
    await expect(approveDurationContextPolicyCanaryCandidate({
      companyId: 'company-other',
      candidateId: 'candidate-1',
      approvedBy: 'admin-other',
      scope: { projectIds: ['project-1'], trafficPercent: 5 },
    })).rejects.toThrow(/not found|tenant/i)

    expect(mocks.state.canaryCandidates[0].candidate_status).toBe('candidate')
    expect(mocks.state.policyVersions).toHaveLength(0)
  })

  it('ships a unique active-version guard for canary approvals', () => {
    const migration = readMigration('218_v14231_duration_context_canary_unique_active_version.sql')

    expect(migration).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_duration_context_policy_versions_active_candidate/i)
    expect(migration).toMatch(/ON\s+public\.duration_context_policy_versions\s*\(\s*source_candidate_id\s*\)/i)
    expect(migration).toMatch(/WHERE\s+version_status\s+IN\s+\('canary',\s*'published'\)/i)
  })

  it('ships a company-project bucket/action active-version guard across candidates', () => {
    const migration = readMigration('244_v14231_duration_context_policy_versions_active_scope_key.sql')

    expect(migration).toMatch(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_duration_context_policy_versions_active_scope_action/i)
    expect(migration).toMatch(/ON\s+public\.duration_context_policy_versions/i)
    expect(migration).toMatch(/COALESCE\s*\(\s*company_id\s*,\s*'00000000-0000-0000-0000-000000000000'::uuid\s*\)/i)
    expect(migration).toMatch(/COALESCE\s*\(\s*project_id\s*,\s*'00000000-0000-0000-0000-000000000000'::uuid\s*\)/i)
    expect(migration).not.toContain('COALESCE(c.project_id, v.project_id)')
    expect(migration).toMatch(/SELECT\s+p\.company_id\s+FROM\s+public\.projects\s+p\s+WHERE\s+p\.id\s*=\s*c\.project_id/i)
    expect(migration).toMatch(/SELECT\s+p\.company_id\s+FROM\s+public\.projects\s+p\s+WHERE\s+p\.id\s*=\s*v\.project_id/i)
    expect(migration).toMatch(/state_bucket/i)
    expect(migration).toMatch(/action_key/i)
    expect(migration).toMatch(/WHERE\s+version_status\s+IN\s+\('canary',\s*'published'\)/i)
  })
})
