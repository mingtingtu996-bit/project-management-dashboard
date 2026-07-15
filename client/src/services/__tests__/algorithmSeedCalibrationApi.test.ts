import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
}))

const {
  autoGovernAlgorithmSeedCalibrationCandidate,
  discoverAlgorithmSeedCalibrationCandidates,
  listAlgorithmSeedCalibrationCandidates,
} = await import('../algorithmSeedCalibrationApi')

describe('algorithmSeedCalibrationApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists upgrade candidates with calibration dashboard filters', async () => {
    mocks.apiGet.mockResolvedValueOnce([
      {
        id: 'candidate-1',
        seed_type: 'seasonal_productivity',
        stable_code: 'north:month-01',
        candidate_payload: { multiplier: 1.08 },
        candidate_source: 'company_history',
        sample_count: 12,
        confidence_level: 'medium',
        evidence_summary: { sampleWindow: '2026-Q1' },
        action_policy: 'auto_govern',
        status: 'pending',
        created_at: '2026-05-20T00:00:00.000Z',
      },
    ])

    const rows = await listAlgorithmSeedCalibrationCandidates({
      seedType: 'seasonal_productivity',
      status: 'pending',
      projectId: 'project-1',
    })

    expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/upgrade-candidates?seedType=seasonal_productivity&status=pending&projectId=project-1',
      undefined,
    )
    expect(rows[0]).toEqual(expect.objectContaining({
      id: 'candidate-1',
      seedType: 'seasonal_productivity',
      stableCode: 'north:month-01',
      sampleCount: 12,
      evidenceSummary: { sampleWindow: '2026-Q1' },
    }))
  })

  it('discovers candidates with auto governance enabled by default', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      candidates: [],
      governed: [],
      created: 0,
    })

    await discoverAlgorithmSeedCalibrationCandidates({ projectId: 'project-1' })

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/upgrade-candidates/discover',
      { projectId: 'project-1', autoGovern: true },
      undefined,
    )
  })

  it('calls the auto-govern endpoint for a selected candidate', async () => {
    mocks.apiPost.mockResolvedValueOnce({
      candidate: { id: 'candidate-1', seed_type: 'work_calendar', stable_code: 'spring-festival' },
      decision: { status: 'auto_published' },
      override: null,
    })

    const result = await autoGovernAlgorithmSeedCalibrationCandidate('candidate-1')

    expect(mocks.apiPost).toHaveBeenCalledWith(
      '/api/planning/algorithm-seeds/upgrade-candidates/candidate-1/auto-govern',
      undefined,
      undefined,
    )
    expect(result.candidate).toEqual(expect.objectContaining({
      id: 'candidate-1',
      seedType: 'work_calendar',
      stableCode: 'spring-festival',
    }))
  })
})
