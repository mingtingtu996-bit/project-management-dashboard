import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(),
    insert: vi.fn(() => Promise.resolve({ error: null })),
  }
  return {
    from: vi.fn(() => query),
    rawQuery: vi.fn(() => Promise.resolve({ rows: [{ id: 'certificate-candidate-event-1' }] })),
    query,
  }
})

vi.mock('../services/dbService.js', () => ({
  supabase: {
    from: state.from,
  },
}))

vi.mock('../database.js', () => ({
  query: state.rawQuery,
}))

const {
  loadLatestCertificatePolicyAutoPublishRun,
  mapCertificatePolicyAutoPublishRunToRecord,
  persistCertificatePolicyAutoPublishRun,
  publishCertificatePolicyAutoPublishPlan,
} = await import('../services/certificateTemplatePolicyUpdateService.js')

describe('certificate template policy update persistence', () => {
  beforeEach(() => {
    state.from.mockClear()
    state.query.select.mockClear()
    state.query.eq.mockClear()
    state.query.order.mockClear()
    state.query.limit.mockClear()
    state.query.maybeSingle.mockReset()
    state.query.insert.mockClear()
    state.rawQuery.mockClear()
    state.rawQuery.mockResolvedValue({ rows: [{ id: 'certificate-candidate-event-1' }] })
  })

  it('loads the latest persisted automatic policy publication run for runtime preview fallback', async () => {
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })
    const record = mapCertificatePolicyAutoPublishRunToRecord(run)
    state.query.maybeSingle.mockResolvedValueOnce({ data: record, error: null })

    const latestRun = await loadLatestCertificatePolicyAutoPublishRun()

    expect(state.from).toHaveBeenCalledWith('certificate_template_policy_auto_publish_runs')
    expect(state.query.eq).toHaveBeenCalledWith('publication_status', 'published')
    expect(state.query.order).toHaveBeenCalledWith('published_at', { ascending: false })
    expect(latestRun).toMatchObject({
      runId: run.runId,
      publicationStatus: 'published',
      runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
      summary: run.summary,
    })
  })

  it('bridges certificate policy publication updates into unified governance candidate events', async () => {
    const run = publishCertificatePolicyAutoPublishPlan({ asOfDate: '2026-09-01' })

    await persistCertificatePolicyAutoPublishRun(run)

    expect(state.from).toHaveBeenCalledWith('certificate_template_policy_auto_publish_runs')
    const rawQueryCalls = state.rawQuery.mock.calls as unknown as Array<[string, unknown[]?]>
    const candidateInsert = rawQueryCalls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_asset_candidate_events') &&
      Array.isArray(call[1]) &&
      call[1].includes('certificate.policy_update.province_profile:guangdong'),
    )
    expect(candidateInsert).toBeTruthy()
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      'certificate.policy_update.province_profile:guangdong',
      'certificateTemplatePolicyUpdateService',
      'system',
      'template_structure',
      'governed_candidate',
      'candidate_only',
      'manual_required',
      'review_required',
      'candidate_only',
    ]))
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        candidateCode: expect.stringContaining('province_profile:guangdong'),
        assetCode: 'province_profile:guangdong',
        publishStatus: 'auto_published',
        runtimeConsumptionPolicy: 'auto_published_seed',
      }),
    ]))
  })
})
