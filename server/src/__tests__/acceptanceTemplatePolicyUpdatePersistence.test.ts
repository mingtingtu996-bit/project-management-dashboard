import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const query = {
    insert: vi.fn(() => Promise.resolve({ error: null })),
  }
  return {
    from: vi.fn(() => query),
    rawQuery: vi.fn(() => Promise.resolve({ rows: [{ id: 'acceptance-candidate-event-1' }] })),
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
  persistAcceptancePolicyAutoPublishRun,
  publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots,
} = await import('../services/acceptanceTemplatePolicyUpdateService.js')

describe('acceptance template policy update persistence', () => {
  beforeEach(() => {
    state.from.mockClear()
    state.query.insert.mockClear()
    state.rawQuery.mockClear()
    state.rawQuery.mockResolvedValue({ rows: [{ id: 'acceptance-candidate-event-1' }] })
  })

  it('bridges acceptance policy publication updates into unified governance candidate events', async () => {
    const run = await publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots({ asOfDate: '2026-09-01' })
    const targetUpdate = run.autoPublishedUpdates[0]
    expect(targetUpdate).toBeTruthy()
    const candidateAssetKey = `acceptance.policy_update.${targetUpdate.assetCode}`

    await persistAcceptancePolicyAutoPublishRun(run)

    expect(state.from).toHaveBeenCalledWith('acceptance_template_policy_auto_publish_runs')
    const rawQueryCalls = state.rawQuery.mock.calls as unknown as Array<[string, unknown[]?]>
    const candidateInsert = rawQueryCalls.find((call) =>
      String(call[0]).toLowerCase().includes('insert into public.algorithm_asset_candidate_events') &&
      Array.isArray(call[1]) &&
      call[1].includes(candidateAssetKey),
    )
    expect(candidateInsert).toBeTruthy()
    expect(candidateInsert?.[1]).toEqual(expect.arrayContaining([
      candidateAssetKey,
      'acceptanceTemplatePolicyUpdateService',
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
        candidateCode: targetUpdate.candidateCode,
        assetCode: targetUpdate.assetCode,
        publishStatus: 'auto_published',
        runtimeConsumptionPolicy: 'auto_published_seed',
      }),
    ]))
  })
})
