import { describe, expect, it, vi } from 'vitest'

import {
  DURATION_ASSET_REVIEW_KEYS,
  buildDurationAssetReviewDecisionFingerprint,
  buildDurationAssetReviewPayload,
  buildDurationAssetReviewSourceKey,
  createDatabaseDurationAssetReviewQueueStore,
  listDurationAssetReviewItems,
  requireDurationAssetReviewKey,
  type DurationAssetReviewItem,
  type DurationAssetReviewQueueStore,
} from '../services/durationAssetReviewQueueService.js'

const companyId = '22222222-2222-4222-8222-222222222222'
const projectId = '11111111-1111-4111-8111-111111111111'
const otherCompanyId = '33333333-3333-4333-8333-333333333333'

const fingerprintInput = {
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
} as const

const decisionFingerprint = buildDurationAssetReviewDecisionFingerprint(fingerprintInput)
const sourceInput = {
  reviewKind: 'candidate_publication' as const,
  assetKey: 'base_duration_benchmark' as const,
  artifactKey: 'benchmark:task:process:all',
  proposalKey: 'proposal-1',
  publicationKey: null,
  decisionFingerprint,
  scope: { level: 'project' as const, companyId, projectId },
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

function upsertInput(overrides: Record<string, unknown> = {}) {
  return {
    ...sourceInput,
    reasonCodes: ['manual_review_required', 'manual_review_required'],
    reviewPayload: reviewPayload(),
    ...overrides,
  }
}

type Row = Record<string, unknown>

function rowForInput(input: ReturnType<typeof upsertInput>, id: string): Row {
  const scope = input.scope as typeof sourceInput.scope
  return {
    id,
    source_key: buildDurationAssetReviewSourceKey(input),
    decision_fingerprint: input.decisionFingerprint,
    review_kind: input.reviewKind,
    asset_key: input.assetKey,
    artifact_key: input.artifactKey,
    scope_level: scope.level,
    company_id: scope.companyId,
    project_id: scope.projectId,
    industry_key: null,
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

function createHarness(initialRows: Row[] = []) {
  const rows = new Map(initialRows.map((row) => [String(row.source_key), row]))
  let nextId = initialRows.length + 1
  const queryExec = vi.fn(async (sql: string, params: unknown[] = []) => {
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
      const row = rows.get(String(params[0]))
      return row ? [row] : []
    }
    if (sql.includes('where id = $1') && sql.includes('for update')) {
      const row = Array.from(rows.values()).find((item) => item.id === params[0])
      return row ? [row] : []
    }
    if (sql.includes('where source_key = $1') && sql.includes("status = 'open'") && sql.includes('resolved_publication_key')) {
      const row = rows.get(String(params[0]))
      if (!row || row.status !== 'open') return []
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
        && row.proposal_key === params[7]
        && (params[7] !== null || row.publication_key === params[8])
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
      const row = Array.from(rows.values()).find((item) => item.id === params[0])
      if (!row || row.status !== 'open') return []
      Object.assign(row, {
        status: params[1], reviewed_by_user_id: params[2], reviewed_at: params[3],
        decision_reason: params[4], resolution_source: params[5],
      })
      return [row]
    }
    if (sql.includes('from public.duration_asset_review_items')) return Array.from(rows.values())
    return []
  })
  return { queryExec, rows, store: createDatabaseDurationAssetReviewQueueStore(queryExec) }
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

  it('records automatic publication resolution without fabricating a reviewer', async () => {
    const { queryExec, store } = createHarness()
    await store.upsertOpen(upsertInput())
    await store.resolveByPublication({
      sourceKey: buildDurationAssetReviewSourceKey(sourceInput), publicationKey: 'publication-auto',
      reviewedAt: '2026-07-23T08:00:00.000Z', resolutionSource: 'automatic_publication',
      reviewerUserId: null, decisionReason: 'automatic_policy_approved',
    })
    expect(queryExec).toHaveBeenCalledWith(expect.stringContaining('reviewed_by_user_id = $'), expect.arrayContaining([null]))
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

  it('automatically resolves every open fingerprint for the same publication lineage', async () => {
    const old = upsertInput({ decisionFingerprint: 'a'.repeat(64) })
    const next = upsertInput({ decisionFingerprint: 'b'.repeat(64) })
    const { store } = createHarness([rowForInput(old, 'review-old'), rowForInput(next, 'review-new')])
    await expect(store.resolveOpenByPublicationIdentity({
      reviewKind: 'candidate_publication', assetKey: 'base_duration_benchmark', artifactKey: sourceInput.artifactKey,
      scope: { level: 'project', companyId, projectId }, proposalKey: 'proposal-1', publicationKey: 'publication-1',
      reviewedAt: '2026-07-23T08:00:00.000Z',
      resolutionSource: 'automatic_publication', reviewerUserId: null, decisionReason: 'automatic_stable_promotion',
    })).resolves.toBe(2)
  })

  it('sanitizes industry and global rows for company-admin reads', async () => {
    const sharedRows = [
      {
        ...rowForInput(upsertInput(), 'review-company'), scope_level: 'company', project_id: null,
        source_key: 'review-company', status: 'open',
      },
      {
        ...rowForInput(upsertInput(), 'review-global'), scope_level: 'global', company_id: null, project_id: null,
        source_key: 'review-global', proposal_key: 'proposal-hidden', candidate_event_ref: 'candidate-hidden',
        conflict_ref: 'conflict-hidden', review_payload: { stableKeys: { artifactKey: 'hidden' } },
      },
      {
        ...rowForInput(upsertInput(), 'review-industry'), scope_level: 'industry', company_id: null, project_id: null,
        industry_key: 'general_civil', source_key: 'review-industry', proposal_key: 'proposal-hidden',
        candidate_event_ref: 'candidate-hidden', conflict_ref: 'conflict-hidden', review_payload: { stableKeys: { artifactKey: 'hidden' } },
      },
    ]
    const { queryExec } = createHarness(sharedRows)
    const result = await listDurationAssetReviewItems({ companyId, projectIds: [projectId], queryExec })
    expect(result.items.find((item) => item.scope.level === 'global')).toEqual(expect.objectContaining({
      canReview: false, proposalKey: null, candidateEventRef: null, conflictRef: null, reviewPayload: null,
    }))
    expect(result.items.find((item) => item.scope.level === 'industry')).toEqual(expect.objectContaining({
      canReview: false, proposalKey: null, candidateEventRef: null, conflictRef: null, reviewPayload: null,
    }))
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
    expect(() => buildDurationAssetReviewPayload({ runtimePayload: { p50Days: 12 } })).toThrow('duration_asset_review_payload_key_forbidden')
    expect(() => buildDurationAssetReviewPayload({ stableKeys: { artifact: { raw: 'payload' } } }))
      .toThrow('duration_asset_review_payload_stable_key_invalid')
    expect(() => buildDurationAssetReviewPayload({ stableKeys: { source: 'x'.repeat(32769) } }))
      .toThrow('duration_asset_review_payload_too_large')
  })

  it('rejects invalid manual and automatic resolutions before mutation', async () => {
    const { queryExec, store } = createHarness()
    await store.upsertOpen(upsertInput())
    const sourceKey = buildDurationAssetReviewSourceKey(sourceInput)
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

  it('uses fixed list predicates and preserves the exact current-company boundary when visibility is disabled', async () => {
    const { queryExec, store } = createHarness()
    const list = await store.list({ companyId, projectIds: null, assetKey: 'base_duration_benchmark', scopeLevel: 'company', status: 'open', reason: 'manual_review_required', projectId, age: '7d' })
    expect(list.total).toBe(0)
    const [sql, params] = queryExec.mock.calls.at(-1) as [string, unknown[]]
    expect(sql).toContain('company_id = $1::uuid')
    expect(sql).toContain('any($2::uuid[])')
    expect(sql).toContain('is not distinct from $7::uuid')
    expect(params).toEqual(expect.arrayContaining([companyId, null, 'base_duration_benchmark', 'company', 'open', 'manual_review_required', projectId, '7d']))
  })
})
