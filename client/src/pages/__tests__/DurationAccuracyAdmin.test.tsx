import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DurationAccuracyAdmin from '../DurationAccuracyAdmin'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  getApiErrorMessage: (error: unknown, fallback = 'request failed') => error instanceof Error ? error.message : fallback,
}))

function buildSummary(dataStatus: 'ok' | 'partial' | 'unavailable') {
  return {
    projectId: null,
    engineCode: null,
    engineCount: 0,
    generatedAt: '2026-07-15T00:00:00.000Z',
    metrics: [],
    dataStatus,
    sourceErrors: dataStatus === 'ok'
      ? []
      : [{ source: 'duration_algorithm_accuracy_events', code: 'duration_accuracy_events_read_failed' }],
    step2Readiness: {
      readyForStep2: false,
      structuralReady: false,
      directionalBiasesCorrected: false,
      classABlockerCount: 1,
      gates: [],
      parameterDataStatus: {
        status: 'data_collection_open',
        minimumBacktestSampleCount: 5,
        enginesWithAccuracySamples: [],
        missingSampleEngineCodes: ['standard_duration_reference'],
      },
    },
  }
}

describe('DurationAccuracyAdmin', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset()
  })

  it('loads as a stable read-only page without a page-level readiness request', async () => {
    mocks.apiGet.mockResolvedValue(buildSummary('ok'))

    render(<DurationAccuracyAdmin />)

    await waitFor(() => expect(mocks.apiGet).toHaveBeenCalledWith(
      '/api/admin/duration-accuracy/summary',
      { runtimeCache: 'off' },
    ))
    expect(mocks.apiGet.mock.calls.map(([url]) => url)).toEqual([
      '/api/admin/duration-accuracy/summary',
    ])
    expect(screen.queryByTestId('v14231-page-readiness-boundary')).not.toBeInTheDocument()
  })

  it('shows a partial-data state instead of presenting source failure as zero samples', async () => {
    mocks.apiGet.mockResolvedValue(buildSummary('partial'))

    render(<DurationAccuracyAdmin />)

    const status = await screen.findByTestId('duration-accuracy-data-status')
    expect(status).toHaveAttribute('data-status', 'partial')
    expect(status).toHaveAttribute('role', 'alert')
  })

  it('shows an unavailable state when all accuracy sources fail', async () => {
    mocks.apiGet.mockResolvedValue(buildSummary('unavailable'))

    render(<DurationAccuracyAdmin />)

    const status = await screen.findByTestId('duration-accuracy-data-status')
    expect(status).toHaveAttribute('data-status', 'unavailable')
  })
})
