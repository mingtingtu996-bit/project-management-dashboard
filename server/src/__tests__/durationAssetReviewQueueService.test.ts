import { describe, expect, it, vi } from 'vitest'
import type {
  BuildDurationAssetReviewDecisionFingerprintInput,
  BuildDurationAssetReviewPayloadInput,
  BuildDurationAssetReviewSourceKeyInput,
  DurationAssetReviewQueryExec,
  DurationAssetReviewTransactionRunner,
  UpsertDurationAssetReviewItemInput,
} from '../services/durationAssetReviewQueueService.js'

type QueryExecMock = DurationAssetReviewQueryExec & ReturnType<typeof vi.fn>
type TransactionRunnerMock = DurationAssetReviewTransactionRunner & ReturnType<typeof vi.fn>

const moduleMocks = vi.hoisted(() => ({
  executeSQL: vi.fn() as QueryExecMock,
  withDatabaseTransaction: vi.fn() as TransactionRunnerMock,
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: moduleMocks.executeSQL,
}))

vi.mock('../database.js', () => ({
  withDatabaseTransaction: moduleMocks.withDatabaseTransaction,
}))

import {
  DURATION_ASSET_REVIEW_KEYS,
  buildDurationAssetReviewDecisionFingerprint,
  buildDurationAssetReviewPayload,
  buildDurationAssetReviewSourceKey,
  createDatabaseDurationAssetReviewQueueStore,
  listDurationAssetReviewItems,
  listSharedDurationAssetReviewItems,
  requireDurationAssetReviewKey,
  type DurationAssetReviewItem,
} from '../services/durationAssetReviewQueueService.js'

const companyId = '22222222-2222-4222-8222-222222222222'
const projectId = '11111111-1111-4111-8111-111111111111'
const otherCompanyId = '33333333-3333-4333-8333-333333333333'

const fingerprintInput: BuildDurationAssetReviewDecisionFingerprintInput = {
  runtimePayload: { p50Days: 12, benchmarkVersion: 'v7' },
  sourceCandidateRefs: ['candidate:b', 'candidate:a'],
  sourceEvidenceRefs: ['evidence:2', 'evidence:1'],
  conflictState: { conflictCount: 0 },
  replayState: { replayPassed: true },
  policyEvidence: {
    evaluationRequired: true,
    stage: 'manual_canary',
    autoPromotionAllowed: false,
    manualReviewRequired: true,
    reasonCodes: ['manual_review_required'],
    evidence: { holdoutSampleCount: 12, maeBefore: 8, maeAfter: 6 },
  },
  reasonCodes: ['manual_review_required'],
  monitoringEvidence: null,
}

const decisionFingerprint = buildDurationAssetReviewDecisionFingerprint(fingerprintInput)
const sourceInput: BuildDurationAssetReviewSourceKeyInput = {
  reviewKind: 'candidate_publication',
  assetKey: 'base_duration_benchmark',
  artifactKey: 'benchmark:task:process:all',
  proposalKey: 'proposal-1',
  publicationKey: null,
  decisionFingerprint,
  scope: { level: 'project', companyId, projectId },
}

function reviewPayload() {
  return buildDurationAssetReviewPayload({
    stableKeys: { artifactKey: sourceInput.artifactKey, proposalKey: sourceInput.proposalKey },
    stage: 'manual_canary',
    scope: sourceInput.scope,
    reasonCodes: ['manual_review_required', 'manual_review_required'],
    sourceCandidateRefs: fingerprintInput.sourceCandidateRefs,
    sourceEvidenceRefs: fingerprintInput.sourceEvidenceRefs,
    counts: { candidateCount: 2, evidenceCount: 2, conflictCount: 0 },
    monitoringEvidence: null,
  })
}

function upsertInput(overrides: Record<string, unknown> = {}): UpsertDurationAssetReviewItemInput {
  return {
    ...sourceInput,
    reasonCodes: ['manual_review_required', 'manual_review_required'],
    reviewPayload: reviewPayload(),
    ...overrides,
  } as UpsertDurationAssetReviewItemInput
}

type Row = Record<string, unknown>

function asQueryExecMock(mock: ReturnType<typeof vi.fn>): QueryExecMock {
  return mock as QueryExecMock
}

function rowForInput(input: UpsertDurationAssetReviewItemInput, id: string): Row {
  const scope = input.scope
  return {
    id,
    source_key: buildDurationAssetReviewSourceKey(input),
    decision_fingerprint: input.decisionFingerprint,
    review_kind: input.reviewKind,
    asset_key: input.assetKey,
    artifact_key: input.artifactKey,
    scope_level: scope.level,
    company_id: 'companyId' in scope ? scope.companyId : null,
    project_id: scope.level === 'project' ? scope.projectId : null,
    industry_key: scope.level === 'industry' ? scope.industryKey : null,
    proposal_key: input.proposalKey,
    candidate_event_ref: input.candidateEventRef ?? null,
    conflict_ref: input.conflictRef ?? null,
    publication_key: input.publicationKey,
    resolved_publication_key: null,
    reason_codes: input.reasonCodes,
    review_payload: input.reviewPayload,
    status: 'open',
    assigned_to_user_id: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    decision_reason: null,
    resolution_source: null,
    created_at: '2026-07-23T00:00:00.000Z',
    updated_at: '2026-07-23T00:00:00.000Z',
  }
}

function createHarness(initialRows: Row[] = [], options: {
  leaveSourceOpenAfterUpdate?: boolean
  leaveDecisionOpenAfterUpdate?: boolean
} = {}) {
  const rows = new Map(initialRows.map((row) => [String(row.source_key), row]))
  let nextId = initialRows.length + 1
  const transactionEvents: string[] = []
  const transactionRunner = vi.fn(async <T>(work: () => Promise<T>) => {
    transactionEvents.push('transaction:start')
    try {
      return await work()
    } finally {
      transactionEvents.push('transaction:end')
    }
  }) as TransactionRunnerMock
  const queryExec = asQueryExecMock(vi.fn(async (sql: string, params: unknown[] = []): Promise<Row[]> => {
    if (sql.includes('from public.projects project')) return [{ scope_authorized: true }]
    if (sql.includes('insert into public.duration_asset_review_items')) {
      const sourceKey = String(params[8])
      const existing = rows.get(sourceKey)
      if (existing && existing.status !== 'open') return []
      if (existing) {
        existing.reason_codes = params[13]
        existing.review_payload = params[14]
        existing.candidate_event_ref = params[10] ?? existing.candidate_event_ref
        existing.conflict_ref = params[11] ?? existing.conflict_ref
        existing.publication_key = params[12] ?? existing.publication_key
        return [{ ...existing, was_created: false }]
      }
      const row: Row = {
        id: `review-${nextId++}`,
        scope_level: params[0], company_id: params[1], project_id: params[2], industry_key: params[3],
        asset_key: params[4], artifact_key: params[5], review_kind: params[6], decision_fingerprint: params[7],
        source_key: sourceKey, proposal_key: params[9], candidate_event_ref: params[10], conflict_ref: params[11],
        publication_key: params[12], reason_codes: params[13], review_payload: params[14], status: 'open',
        resolved_publication_key: null, assigned_to_user_id: null, reviewed_by_user_id: null, reviewed_at: null,
        decision_reason: null, resolution_source: null,
        created_at: '2026-07-23T00:00:00.000Z', updated_at: '2026-07-23T00:00:00.000Z',
      }
      rows.set(sourceKey, row)
      return [{ ...row, was_created: true }]
    }
    if (sql.includes('where source_key = $1') && sql.includes('for update')) {
      transactionEvents.push('lock:source')
      const row = rows.get(String(params[0]))
      return row ? [row] : []
    }
    if (sql.includes('where id = $1') && sql.includes('for update')) {
      transactionEvents.push('lock:id')
      const row = Array.from(rows.values()).find((item) => item.id === params[0])
      return row ? [row] : []
    }
    if (sql.includes('where source_key = $1') && sql.includes("status = 'open'") && sql.includes('resolved_publication_key')) {
      transactionEvents.push('update:source')
      const row = rows.get(String(params[0]))
      if (!row || row.status !== 'open') return []
      if (options.leaveSourceOpenAfterUpdate) return []
      Object.assign(row, {
        status: 'resolved_by_publication', resolved_publication_key: params[1], reviewed_at: params[2],
        resolution_source: params[3], reviewed_by_user_id: params[4], decision_reason: params[5],
      })
      return [row]
    }
    if (sql.includes('where review_kind = $1') && sql.includes("status = 'open'") && sql.includes('resolved_publication_key')) {
      const matches = Array.from(rows.values()).filter((row) => (
        row.status === 'open'
        && row.review_kind === params[0]
        && row.asset_key === params[1]
        && row.artifact_key === params[2]
        && row.scope_level === params[3]
        && row.company_id === params[4]
        && row.project_id === params[5]
        && row.industry_key === params[6]
        && (
          (params[0] === 'candidate_publication' && row.proposal_key === params[7])
          || (params[0] === 'stable_promotion' && row.proposal_key === null && row.publication_key === params[8])
        )
      ))
      for (const row of matches) {
        Object.assign(row, {
          status: 'resolved_by_publication', resolved_publication_key: params[9], reviewed_at: params[10],
          resolution_source: params[11], reviewed_by_user_id: null, decision_reason: params[12],
        })
      }
      return [{ resolved_count: matches.length }]
    }
    if (sql.includes('where id = $1') && sql.includes("status = 'open'") && sql.includes('resolution_source')) {
      transactionEvents.push('update:id')
      const row = Array.from(rows.values()).find((item) => item.id === params[0])
      if (!row || row.status !== 'open') return []
      if (options.leaveDecisionOpenAfterUpdate) return []
      Object.assign(row, {
        status: params[1], reviewed_by_user_id: params[2], reviewed_at: params[3],
        decision_reason: params[4], resolution_source: params[5],
      })
      return [row]
    }
    if (sql.includes('from public.duration_asset_review_items')) return Array.from(rows.values())
    return []
  }))
  return {
    queryExec,
    rows,
    store: createDatabaseDurationAssetReviewQueueStore(queryExec, transactionRunner),
    transactionEvents,
    transactionRunner,
  }
}

describe('durationAssetReviewQueueService', () => {
  it.each(DURATION_ASSET_REVIEW_KEYS)('accepts the registered asset %s', (assetKey) => {
    expect(requireDurationAssetReviewKey(assetKey)).toBe(assetKey)
  })

  it('builds a scope-specific deterministic source key', () => {
    const first = buildDurationAssetReviewSourceKey(sourceInput)
    expect(buildDurationAssetReviewSourceKey(sourceInput)).toBe(first)
    expect(buildDurationAssetReviewSourceKey({
      ...sourceInput,
      scope: { level: 'company', companyId },
    })).not.toBe(first)
  })

  it('canonicalizes reference order but changes identity for material evidence changes', () => {
    const reordered = buildDurationAssetReviewDecisionFingerprint({
      ...fingerprintInput,
      sourceCandidateRefs: ['candidate:a', 'candidate:b'],
      sourceEvidenceRefs: ['evidence:1', 'evidence:2'],
    })
    expect(reordered).toBe(decisionFingerprint)

    const changedPayload = buildDurationAssetReviewDecisionFingerprint({
      ...fingerprintInput,
      runtimePayload: { p50Days: 13, benchmarkVersion: 'v8' },
    })
    expect(buildDurationAssetReviewSourceKey({ ...sourceInput, decisionFingerprint: changedPayload }))
      .not.toBe(buildDurationAssetReviewSourceKey(sourceInput))
  })

  it('changes the fingerprint independently for every material decision dimension', () => {
    const variants = [
      buildDurationAssetReviewDecisionFingerprint({ ...fingerprintInput, conflictState: { conflictCount: 1 } }),
      buildDurationAssetReviewDecisionFingerprint({ ...fingerprintInput, replayState: { replayPassed: false } }),
      buildDurationAssetReviewDecisionFingerprint({
        ...fingerprintInput,
        policyEvidence: { ...fingerprintInput.policyEvidence, stage: 'blocked', evidence: { holdoutSampleCount: 13 } },
      }),
      buildDurationAssetReviewDecisionFingerprint({
        ...fingerprintInput,
        monitoringEvidence: {
          publicationKey: 'publication-monitoring', monitoringStatus: 'failed',
          monitoringMetrics: { mae: 7 }, stableDecision: { promoted: false },
        },
      }),
      buildDurationAssetReviewDecisionFingerprint({ ...fingerprintInput, reasonCodes: ['different_reason'] }),
    ]
    expect(new Set(variants).size).toBe(variants.length)
    for (const fingerprint of variants) expect(fingerprint).not.toBe(decisionFingerprint)
  })

  it('reuses an open row and does not reopen a terminal row', async () => {
    const { queryExec, store } = createHarness()
    const first = await store.upsertOpen(upsertInput())
    const insertCall = queryExec.mock.calls.find(([sql]) => String(sql).includes('insert into public.duration_asset_review_items'))
    expect(insertCall?.[1]).toEqual([
      'project', companyId, projectId, null, 'base_duration_benchmark', sourceInput.artifactKey,
      'candidate_publication', decisionFingerprint, buildDurationAssetReviewSourceKey(sourceInput),
      'proposal-1', null, null, null, ['manual_review_required'], reviewPayload(),
    ])
    const repeated = await store.upsertOpen(upsertInput())
    expect(repeated).toMatchObject({ item: { id: first.item.id }, disposition: 'reused' })
    await store.decide({
      id: first.item.id,
      status: 'rejected',
      reviewerUserId: 'user-1',
      reviewedAt: '2026-07-23T08:00:00.000Z',
      decisionReason: 'not applicable',
      resolutionSource: 'manual_rejection',
    })
    await expect(store.upsertOpen(upsertInput())).resolves.toMatchObject({
      item: { id: first.item.id, status: 'rejected' }, disposition: 'terminal_reused',
    })
    const changedFingerprint = buildDurationAssetReviewDecisionFingerprint({
      ...fingerprintInput,
      policyEvidence: { ...fingerprintInput.policyEvidence, reasonCodes: ['new_policy_reason'] },
      reasonCodes: ['new_policy_reason'],
    })
    await expect(store.upsertOpen(upsertInput({ decisionFingerprint: changedFingerprint }))).resolves.toMatchObject({
      item: { status: 'open' }, disposition: 'created',
    })
  })

  it('resolves only the locked source key on the single-source automatic path', async () => {
    const primary = upsertInput()
    const sibling = upsertInput({ decisionFingerprint: 'c'.repeat(64) })
    const primaryRow = rowForInput(primary, 'review-primary')
    const siblingRow = rowForInput(sibling, 'review-sibling')
    const { queryExec, rows, store } = createHarness([primaryRow, siblingRow])
    await store.resolveByPublication({
      sourceKey: buildDurationAssetReviewSourceKey(sourceInput), publicationKey: 'publication-auto',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_policy_approved',
    })
    expect(queryExec).toHaveBeenCalledWith(expect.stringContaining('reviewed_by_user_id = $'), expect.arrayContaining([null]))
    expect(rows.get(String(primaryRow.source_key))?.status).toBe('resolved_by_publication')
    expect(rows.get(String(siblingRow.source_key))?.status).toBe('open')
    const updateSql = queryExec.mock.calls.map(([sql]) => String(sql)).find((sql) => sql.includes('update public.duration_asset_review_items'))
    expect(updateSql).toContain('where source_key = $1')
    expect(updateSql).not.toContain('where review_kind = $1')
  })

  it('uses withDatabaseTransaction for default executeSQL locking mutations', async () => {
    const events: string[] = []
    const openRow = rowForInput(upsertInput(), 'review-default-transaction')
    moduleMocks.executeSQL.mockReset()
    moduleMocks.withDatabaseTransaction.mockReset()
    moduleMocks.withDatabaseTransaction.mockImplementation(async (work: () => Promise<unknown>) => {
      events.push('transaction:start')
      const result = await work()
      events.push('transaction:end')
      return result
    })
    moduleMocks.executeSQL.mockImplementation(async (sql: string, params: unknown[] = []): Promise<Row[]> => {
      if (sql.includes('for update')) {
        events.push('lock')
        return [openRow]
      }
      if (sql.includes('update public.duration_asset_review_items')) {
        events.push('update')
        return [{
          ...openRow,
          status: 'resolved_by_publication', resolved_publication_key: params[1], reviewed_at: params[2],
          resolution_source: params[3], reviewed_by_user_id: params[4], decision_reason: params[5],
        }]
      }
      return []
    })

    const store = createDatabaseDurationAssetReviewQueueStore()
    await expect(store.resolveByPublication({
      sourceKey: String(openRow.source_key), publicationKey: 'publication-default-transaction',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_policy_approved',
    })).resolves.toMatchObject({ disposition: 'resolved' })

    expect(moduleMocks.withDatabaseTransaction).toHaveBeenCalledOnce()
    expect(events).toEqual(['transaction:start', 'lock', 'update', 'transaction:end'])
  })

  it('requires a transaction runner before custom-adapter locking mutations', async () => {
    const queryExec = asQueryExecMock(vi.fn(async (): Promise<Row[]> => []))
    const store = createDatabaseDurationAssetReviewQueueStore(queryExec)

    await expect(store.resolveByPublication({
      sourceKey: buildDurationAssetReviewSourceKey(sourceInput), publicationKey: 'publication-custom',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_policy_approved',
    })).rejects.toThrow('duration_asset_review_transaction_runner_required')
    await expect(store.decide({
      id: 'review-custom', status: 'rejected', reviewerUserId: 'user-1',
      reviewedAt: '2026-07-23T08:00:00.000Z', decisionReason: 'not applicable',
      resolutionSource: 'manual_rejection',
    })).rejects.toThrow('duration_asset_review_transaction_runner_required')
    expect(queryExec).not.toHaveBeenCalled()
  })

  it('wraps lock then update in the injected transaction runner', async () => {
    const openRow = rowForInput(upsertInput(), 'review-injected-transaction')
    const { store, transactionEvents, transactionRunner } = createHarness([openRow])

    await store.resolveByPublication({
      sourceKey: String(openRow.source_key), publicationKey: 'publication-injected',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_policy_approved',
    })

    expect(transactionRunner).toHaveBeenCalledOnce()
    expect(transactionEvents).toEqual(['transaction:start', 'lock:source', 'update:source', 'transaction:end'])
  })

  it('keeps custom-adapter list and single-statement upsert usable without a transaction runner', async () => {
    const companyInput = upsertInput({ scope: { level: 'company', companyId }, reviewPayload: {} })
    const insertedRow: Row = {
      ...rowForInput(companyInput, 'review-custom-nonlocking'),
      scope_level: 'company', project_id: null, was_created: true,
    }
    const queryExec = asQueryExecMock(vi.fn(async (sql: string): Promise<Row[]> => {
      if (sql.includes('insert into public.duration_asset_review_items')) return [insertedRow]
      if (sql.includes('from public.duration_asset_review_items')) return [insertedRow]
      return []
    }))
    const store = createDatabaseDurationAssetReviewQueueStore(queryExec)

    await expect(store.upsertOpen(companyInput)).resolves.toMatchObject({ disposition: 'created' })
    await expect(store.list({ companyId, projectIds: null })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'review-custom-nonlocking' })],
    })
  })

  it('records the real reviewer and reason for manual approval', async () => {
    const { queryExec, store } = createHarness()
    await store.upsertOpen(upsertInput())
    await store.resolveByPublication({
      sourceKey: buildDurationAssetReviewSourceKey(sourceInput), publicationKey: 'publication-manual',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'manual_approval',
      reviewerUserId: 'user-1', decisionReason: 'validated against replay evidence',
    })
    expect(queryExec).toHaveBeenCalledWith(
      expect.stringContaining('resolution_source'),
      expect.arrayContaining(['manual_approval', 'user-1', 'validated against replay evidence']),
    )
  })

  it('bulk-resolves candidate fingerprints by an exact non-empty proposal lineage', async () => {
    const old = upsertInput({ decisionFingerprint: 'a'.repeat(64) })
    const next = upsertInput({ decisionFingerprint: 'b'.repeat(64) })
    const { queryExec, store } = createHarness([rowForInput(old, 'review-old'), rowForInput(next, 'review-new')])
    await expect(store.resolveOpenByPublicationIdentity({
      reviewKind: 'candidate_publication', assetKey: 'base_duration_benchmark', artifactKey: sourceInput.artifactKey,
      scope: { level: 'project', companyId, projectId }, proposalKey: 'proposal-1', publicationKey: 'publication-1',
      reviewedAt: '2026-07-23T08:00:00.000Z',
      resolutionSource: 'automatic_publication', reviewerUserId: null, decisionReason: 'automatic_stable_promotion',
    })).resolves.toBe(2)
    const [sql, params] = queryExec.mock.calls.at(-1) as [string, unknown[]]
    const normalizedSql = sql.replace(/\s+/g, ' ')
    expect(normalizedSql).toContain("$1 = 'candidate_publication' and proposal_key is not distinct from $8::text")
    expect(normalizedSql).toContain("$1 = 'stable_promotion' and proposal_key is null and publication_key is not distinct from $9::text")
    expect(params.slice(0, 10)).toEqual([
      'candidate_publication', 'base_duration_benchmark', sourceInput.artifactKey, 'project',
      companyId, projectId, null, 'proposal-1', 'publication-1', 'publication-1',
    ])
  })

  it('bulk-resolves stable fingerprints only by exact publication identity', async () => {
    const stableBase = upsertInput({
      reviewKind: 'stable_promotion', proposalKey: null, publicationKey: 'publication-stable',
      scope: { level: 'company', companyId }, decisionFingerprint: 'd'.repeat(64),
    })
    const stableNext = upsertInput({ ...stableBase, decisionFingerprint: 'e'.repeat(64) })
    const otherPublication = upsertInput({ ...stableBase, publicationKey: 'publication-other', decisionFingerprint: 'f'.repeat(64) })
    const stableRows: Row[] = [
      { ...rowForInput(stableBase, 'review-stable-1'), scope_level: 'company', project_id: null },
      { ...rowForInput(stableNext, 'review-stable-2'), scope_level: 'company', project_id: null },
      { ...rowForInput(otherPublication, 'review-stable-other'), scope_level: 'company', project_id: null },
    ]
    const { rows, store } = createHarness(stableRows)
    await expect(store.resolveOpenByPublicationIdentity({
      reviewKind: 'stable_promotion', assetKey: 'base_duration_benchmark', artifactKey: sourceInput.artifactKey,
      scope: { level: 'company', companyId }, publicationKey: 'publication-stable',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_stable_promotion',
    })).resolves.toBe(2)
    expect(rows.get(String(stableRows[2].source_key))?.status).toBe('open')
  })

  it('rejects missing candidate proposal lineage and any stable proposal before mutation', async () => {
    const { queryExec, store } = createHarness()
    await expect(store.resolveOpenByPublicationIdentity({
      reviewKind: 'candidate_publication', assetKey: 'base_duration_benchmark', artifactKey: sourceInput.artifactKey,
      scope: { level: 'company', companyId }, publicationKey: 'publication-1',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_candidate_publication',
    })).rejects.toThrow('duration_asset_review_candidate_proposal_key_required')
    await expect(store.resolveOpenByPublicationIdentity({
      reviewKind: 'stable_promotion', assetKey: 'base_duration_benchmark', artifactKey: sourceInput.artifactKey,
      scope: { level: 'company', companyId }, proposalKey: 'proposal-bypass', publicationKey: 'publication-1',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_stable_promotion',
    })).rejects.toThrow('duration_asset_review_stable_proposal_key_forbidden')
    expect(queryExec).not.toHaveBeenCalled()
  })

  it('sanitizes industry and global rows for company-admin reads', async () => {
    const sharedRows: Row[] = [
      {
        ...rowForInput(upsertInput(), 'review-company'), scope_level: 'company', project_id: null,
        source_key: 'review-company', status: 'open',
      },
      {
        ...rowForInput(upsertInput(), 'review-global'), scope_level: 'global', company_id: null, project_id: null,
        source_key: 'review-global', proposal_key: 'proposal-hidden', candidate_event_ref: 'candidate-hidden',
        conflict_ref: 'conflict-hidden', review_payload: { stableKeys: { artifactKey: 'hidden' } },
        assigned_to_user_id: 'global-assignee-hidden', reviewed_by_user_id: 'global-reviewer-hidden',
      },
      {
        ...rowForInput(upsertInput(), 'review-industry'), scope_level: 'industry', company_id: null, project_id: null,
        industry_key: 'general_civil', source_key: 'review-industry', proposal_key: 'proposal-hidden',
        candidate_event_ref: 'candidate-hidden', conflict_ref: 'conflict-hidden', review_payload: { stableKeys: { artifactKey: 'hidden' } },
        assigned_to_user_id: 'industry-assignee-hidden', reviewed_by_user_id: 'industry-reviewer-hidden',
      },
    ]
    const { queryExec } = createHarness(sharedRows)
    const result = await listDurationAssetReviewItems({ companyId, projectIds: [projectId], queryExec })
    expect(result.items.find((item) => item.scope.level === 'global')).toEqual(expect.objectContaining({
      canReview: false, proposalKey: null, candidateEventRef: null, conflictRef: null, reviewPayload: null,
      assignedToUserId: null, reviewedByUserId: null,
    }))
    expect(result.items.find((item) => item.scope.level === 'industry')).toEqual(expect.objectContaining({
      canReview: false, proposalKey: null, candidateEventRef: null, conflictRef: null, reviewPayload: null,
      assignedToUserId: null, reviewedByUserId: null,
    }))
  })

  it('returns only actionable unsanitized shared rows to the platform operator reader', async () => {
    const sharedRows: Row[] = [
      {
        ...rowForInput(upsertInput(), 'review-global'), scope_level: 'global', company_id: null, project_id: null,
        source_key: 'review-global', proposal_key: 'proposal-global', candidate_event_ref: 'candidate-global',
        review_payload: reviewPayload(), total_count: 1,
      },
    ]
    const { queryExec } = createHarness(sharedRows)

    const result = await listSharedDurationAssetReviewItems({
      scopeLevel: 'global',
      status: 'open',
      age: '7d',
      now: '2026-07-23T09:00:00.000Z',
      queryExec,
    })

    expect(result.items).toEqual([expect.objectContaining({
      scope: { level: 'global' },
      canReview: true,
      approvalReady: true,
      proposalKey: 'proposal-global',
      candidateEventRef: 'candidate-global',
      reviewPayload: expect.any(Object),
    })])
    const [sql, params] = queryExec.mock.calls.at(-1) as [string, unknown[]]
    expect(sql.replace(/\s+/g, ' ')).toContain("where scope_level in ('industry', 'global')")
    expect(params).toEqual([null, 'global', 'open', null, '7d', '2026-07-23T09:00:00.000Z', 100])
  })

  it('fails closed for unknown assets, invalid scopes, project/company mismatches, and invalid fingerprints', async () => {
    const { queryExec, store } = createHarness()
    await expect(store.upsertOpen(upsertInput({ assetKey: 'unknown_asset' }))).rejects.toThrow('duration_asset_review_key_invalid')
    await expect(store.upsertOpen(upsertInput({ scope: { level: 'project', companyId, projectId: '' } }))).rejects.toThrow('project_scope_project_id_required')
    await expect(store.upsertOpen(upsertInput({ scope: { level: 'global', companyId } }))).rejects.toThrow('duration_asset_review_scope_invalid')
    await expect(store.upsertOpen(upsertInput({ decisionFingerprint: 'not-a-fingerprint' }))).rejects.toThrow('duration_asset_review_decision_fingerprint_invalid')

    queryExec.mockImplementationOnce(async () => [{ scope_authorized: false }])
    await expect(store.upsertOpen(upsertInput({ scope: { level: 'project', companyId: otherCompanyId, projectId } })))
      .rejects.toThrow('project_scope_company_mismatch')
    expect(queryExec).toHaveBeenLastCalledWith(expect.stringContaining('project.company_id = $2::uuid'), [projectId, otherCompanyId])
  })

  it('normalizes reasons and rejects unsafe or oversized bounded payloads', () => {
    expect(reviewPayload().reasonCodes).toEqual(['manual_review_required'])
    expect(reviewPayload()).not.toHaveProperty('runtimePayload')
    expect(() => buildDurationAssetReviewPayload({
      runtimePayload: { p50Days: 12 },
    } as unknown as BuildDurationAssetReviewPayloadInput)).toThrow('duration_asset_review_payload_key_forbidden')
    expect(() => buildDurationAssetReviewPayload({ stableKeys: { artifact: { raw: 'payload' } } }))
      .toThrow('duration_asset_review_payload_stable_key_invalid')
    expect(() => buildDurationAssetReviewPayload({ stableKeys: { source: 'x'.repeat(32769) } }))
      .toThrow('duration_asset_review_payload_too_large')
    expect(() => buildDurationAssetReviewPayload({ stableKeys: { source: '界'.repeat(11000) } }))
      .toThrow('duration_asset_review_payload_too_large')
    expect(() => buildDurationAssetReviewPayload({ counts: { nestedCredentialCount: 1 } }))
      .toThrow('duration_asset_review_payload_key_forbidden')
    expect(buildDurationAssetReviewPayload({})).toMatchObject({
      stableKeys: {}, counts: {}, reasonCodes: [], sourceCandidateRefCount: 0, sourceEvidenceRefCount: 0,
    })
  })

  it.each([
    ['stableKeys null', { stableKeys: null }, 'duration_asset_review_payload_stable_keys_invalid'],
    ['stableKeys array', { stableKeys: [] }, 'duration_asset_review_payload_stable_keys_invalid'],
    ['counts string', { counts: '2' }, 'duration_asset_review_payload_counts_invalid'],
    ['counts array', { counts: [] }, 'duration_asset_review_payload_counts_invalid'],
    ['reason codes string', { reasonCodes: 'manual_review_required' }, 'duration_asset_review_payload_reason_codes_invalid'],
    ['candidate refs string', { sourceCandidateRefs: 'candidate-1' }, 'duration_asset_review_payload_source_candidate_refs_invalid'],
    ['evidence refs object', { sourceEvidenceRefs: { ref: 'evidence-1' } }, 'duration_asset_review_payload_source_evidence_refs_invalid'],
  ])('rejects malformed supplied payload field: %s', (_name, invalidInput, error) => {
    expect(() => buildDurationAssetReviewPayload(invalidInput as never)).toThrow(error)
  })

  it.each([
    ['boolean', true],
    ['string', '2'],
    ['fraction', 1.5],
  ])('rejects a %s count value', (_name, value) => {
    expect(() => buildDurationAssetReviewPayload({ counts: { candidateCount: value } })).toThrow(
      'duration_asset_review_payload_count_invalid',
    )
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'payload'],
    ['number', 1],
    ['boolean', true],
  ])('rejects a %s queue payload at the top level', async (_name, reviewPayload) => {
    const queryExec = asQueryExecMock(vi.fn(async (): Promise<Row[]> => []))
    const store = createDatabaseDurationAssetReviewQueueStore(queryExec)
    await expect(store.upsertOpen({
      ...upsertInput({ scope: { level: 'company', companyId } }),
      reviewPayload,
    } as never)).rejects.toThrow('duration_asset_review_payload_invalid')
    expect(queryExec).not.toHaveBeenCalled()
  })

  it('rejects invalid manual and automatic resolutions before mutation', async () => {
    const { queryExec, store } = createHarness()
    await store.upsertOpen(upsertInput())
    const sourceKey = buildDurationAssetReviewSourceKey(sourceInput)
    const callsBeforeInvalidSource = queryExec.mock.calls.length
    await expect(store.resolveByPublication({
      sourceKey, publicationKey: 'publication-invalid', reviewedAt: '2026-07-23T08:00:00.000Z',
      resolutionSource: 'unknown_resolution', reviewerUserId: null, decisionReason: 'invalid',
    } as never)).rejects.toThrow('duration_asset_review_resolution_source_invalid')
    expect(queryExec).toHaveBeenCalledTimes(callsBeforeInvalidSource)
    await expect(store.resolveByPublication({
      sourceKey, publicationKey: 'publication-auto', reviewedAt: '2026-07-23T08:00:00.000Z',
      resolutionSource: 'automatic_publication', reviewerUserId: 'fabricated-user', decisionReason: 'automatic',
    })).rejects.toThrow('automatic_publication_reviewer_forbidden')
    await expect(store.resolveByPublication({
      sourceKey, publicationKey: 'publication-manual', reviewedAt: '2026-07-23T08:00:00.000Z',
      resolutionSource: 'manual_approval', reviewerUserId: null, decisionReason: 'manual',
    })).rejects.toThrow('manual_approval_reviewer_required')
    const item = (await store.loadForUpdate((await store.upsertOpen(upsertInput())).item.id)) as DurationAssetReviewItem
    await expect(store.decide({
      id: item.id, status: 'rejected', reviewerUserId: 'user-1', reviewedAt: '2026-07-23T08:00:00.000Z',
      decisionReason: ' ', resolutionSource: 'manual_rejection',
    })).rejects.toThrow('duration_asset_review_decision_reason_required')
    expect(queryExec).toHaveBeenCalled()
  })

  it('rejects an unknown decision status before locking or mutation', async () => {
    const { queryExec, store } = createHarness([rowForInput(upsertInput(), 'review-invalid-status')])
    await expect(store.decide({
      id: 'review-invalid-status', status: 'archived', reviewerUserId: 'user-1',
      reviewedAt: '2026-07-23T08:00:00.000Z', decisionReason: 'invalid',
      resolutionSource: 'manual_supersession',
    } as never)).rejects.toThrow('duration_asset_review_decision_status_invalid')
    expect(queryExec).not.toHaveBeenCalled()
  })

  it('throws a deterministic resolution conflict when a no-row update reloads open', async () => {
    const open = upsertInput()
    const { store } = createHarness([rowForInput(open, 'review-resolution-race')], {
      leaveSourceOpenAfterUpdate: true,
    })
    await expect(store.resolveByPublication({
      sourceKey: buildDurationAssetReviewSourceKey(open), publicationKey: 'publication-race',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_policy_approved',
    })).rejects.toThrow('duration_asset_review_resolution_conflict')
  })

  it('throws a deterministic decision conflict when a no-row update reloads open', async () => {
    const openRow = rowForInput(upsertInput(), 'review-decision-race')
    const { store } = createHarness([openRow], { leaveDecisionOpenAfterUpdate: true })
    await expect(store.decide({
      id: 'review-decision-race', status: 'rejected', reviewerUserId: 'user-1',
      reviewedAt: '2026-07-23T08:00:00.000Z', decisionReason: 'not applicable',
      resolutionSource: 'manual_rejection',
    })).rejects.toThrow('duration_asset_review_decision_conflict')
  })

  it('keeps project rows when project visibility is disabled while preserving the company boundary', async () => {
    const projectRow = rowForInput(upsertInput(), 'review-visible-when-permission-disabled')
    const { queryExec, store } = createHarness([projectRow])
    const list = await store.list({
      companyId, projectIds: null, now: '2026-07-23T09:00:00.000Z',
    })
    expect(list.items).toEqual([expect.objectContaining({ id: projectRow.id, scope: sourceInput.scope })])
    const [sql, params] = queryExec.mock.calls.at(-1) as [string, unknown[]]
    const normalizedSql = sql.replace(/\s+/g, ' ')
    expect(normalizedSql).toContain("(scope_level in ('company', 'project') and company_id = $1::uuid) or scope_level in ('industry', 'global')")
    expect(normalizedSql).toContain("and (scope_level <> 'project' or $2::uuid[] is null or project_id = any($2::uuid[]))")
    expect(params).toEqual([companyId, null, null, null, null, null, null, '2026-07-23T09:00:00.000Z', 'all', 100])
  })
})
