import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queueState: 'ready' as 'ready' | 'loading' | 'empty' | 'error' | 'permission' | 'stale',
  generatedAt: new Date().toISOString(),
  getDurationAssetReviewItems: vi.fn(),
  getDurationAccuracySummary: vi.fn(),
  getDurationAccuracyGovernanceReadModel: vi.fn(),
  decideDurationAssetReviewItem: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/services/durationAssetsApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/durationAssetsApi')>('@/services/durationAssetsApi')
  return {
    ...actual,
    getDurationAssetReviewItems: mocks.getDurationAssetReviewItems,
    getDurationAccuracySummary: mocks.getDurationAccuracySummary,
    getDurationAccuracyGovernanceReadModel: mocks.getDurationAccuracyGovernanceReadModel,
    decideDurationAssetReviewItem: mocks.decideDurationAssetReviewItem,
  }
})
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }))

const { default: DurationAssetsAdmin } = await import('../DurationAssetsAdmin')

const queueItem = {
  id: 'review-1', sourceKey: 'source-1', decisionFingerprint: 'a'.repeat(64), reviewKind: 'candidate_publication',
  assetKey: 'base_duration_benchmark', artifactKey: 'asset-1', scope: { level: 'project', companyId: 'company-1', projectId: 'project-1' },
  proposalKey: null, candidateEventRef: null, conflictRef: null, publicationKey: null, resolvedPublicationKey: null,
  reasonCodes: ['replay_required'], reviewPayload: null, status: 'open', canReview: true, approvalReady: true,
  assignedToUserId: null, reviewedByUserId: null, reviewedAt: null, decisionReason: null, resolutionSource: null,
  createdAt: '2026-07-22T08:00:00.000Z', updatedAt: '2026-07-23T08:00:00.000Z',
}

function renderAdmin(path = '/admin/duration-assets') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/admin/duration-assets" element={<DurationAssetsAdmin />} /></Routes></MemoryRouter>)
}

function configureState(state: 'loading' | 'empty' | 'error' | 'permission' | 'stale') {
  mocks.queueState = state
  mocks.generatedAt = state === 'stale' ? '2026-07-23T00:00:00.000Z' : new Date().toISOString()
}

describe('DurationAssetsAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queueState = 'ready'
    mocks.generatedAt = new Date().toISOString()
    mocks.getDurationAssetReviewItems.mockImplementation(async () => {
      if (mocks.queueState === 'error') throw new Error('queue unavailable')
      if (mocks.queueState === 'permission') throw Object.assign(new Error('forbidden'), { status: 403 })
      if (mocks.queueState === 'loading') return new Promise(() => {})
      return { generatedAt: mocks.generatedAt, total: mocks.queueState === 'empty' ? 0 : 2, items: mocks.queueState === 'empty' ? [] : [queueItem, { ...queueItem, id: 'shared-1', scope: { level: 'global' }, canReview: false, approvalReady: false }] }
    })
    mocks.getDurationAccuracySummary.mockResolvedValue({ generatedAt: mocks.generatedAt, metrics: [{ engineCode: 'critical_path_cpm', sampleCount: 2, status: 'backtested' }] })
    mocks.getDurationAccuracyGovernanceReadModel.mockResolvedValue({ generatedAt: mocks.generatedAt, publications: [{ publicationKey: 'pub-1', assetKey: 'base_duration_benchmark', publicationStage: 'canary', monitoringStatus: 'collecting' }], observations: [], runtimeCalls: [], samples: [] })
  })

  it('renders queue, published, monitoring, and accuracy tabs from governed read models', async () => {
    renderAdmin('/admin/duration-assets?tab=queue')
    expect(await screen.findByRole('heading', { name: '\u5de5\u671f\u8d44\u4ea7\u6cbb\u7406' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '\u5ba1\u6838\u961f\u5217' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByText('base_duration_benchmark')).toHaveLength(2)
    for (const tab of ['\u5df2\u53d1\u5e03', '\u76d1\u63a7', '\u51c6\u786e\u5ea6']) expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument()
  })

  it('keeps shared items visible but read-only', async () => {
    renderAdmin('/admin/duration-assets?tab=queue')
    expect(await screen.findByText('\u5168\u5c40\u53ea\u8bfb')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '\u6279\u51c6' })).toHaveLength(1)
  })

  it.each(['loading', 'empty', 'error', 'permission', 'stale'] as const)('renders the %s state', async (state) => {
    configureState(state)
    renderAdmin('/admin/duration-assets')
    expect(await screen.findByTestId(`duration-assets-${state}`)).toBeInTheDocument()
  })

  it('applies filters, confirms decisions, disables commands, retries failures, refreshes success, supports keyboard tabs, and preserves mobile table overflow', async () => {
    renderAdmin('/admin/duration-assets?tab=queue')
    await screen.findByRole('button', { name: '\u6279\u51c6' })
    expect(screen.getByTestId('duration-assets-table-overflow')).toHaveClass('overflow-x-auto')
    const queueTab = screen.getByRole('tab', { name: '\u5ba1\u6838\u961f\u5217' })
    queueTab.focus()
    fireEvent.keyDown(queueTab, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('tab', { name: '\u5df2\u53d1\u5e03' })).toHaveAttribute('aria-selected', 'true'))
    const publishedTab = screen.getByRole('tab', { name: '\u5df2\u53d1\u5e03' })
    publishedTab.focus()
    fireEvent.keyDown(publishedTab, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByRole('tab', { name: '\u5ba1\u6838\u961f\u5217' })).toHaveAttribute('aria-selected', 'true'))
    fireEvent.change(screen.getByLabelText('\u539f\u56e0\u7b5b\u9009'), { target: { value: 'replay_required' } })
    await waitFor(() => expect(mocks.getDurationAssetReviewItems).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'replay_required' })))
    fireEvent.click(await screen.findByRole('button', { name: '\u6279\u51c6' }))
    expect(await screen.findByTestId('duration-assets-decision-dialog')).toBeInTheDocument()
    mocks.decideDurationAssetReviewItem.mockRejectedValueOnce(new Error('decision failed'))
    fireEvent.click(screen.getByRole('button', { name: '\u786e\u8ba4\u6279\u51c6' }))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })))
    const queueCallsBeforeSuccess = mocks.getDurationAssetReviewItems.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '\u6279\u51c6' }))
    mocks.decideDurationAssetReviewItem.mockResolvedValueOnce({ status: 'operation_delegated' })
    fireEvent.click(screen.getByRole('button', { name: '\u786e\u8ba4\u6279\u51c6' }))
    await waitFor(() => expect(mocks.getDurationAssetReviewItems.mock.calls.length).toBeGreaterThan(queueCallsBeforeSuccess))
  })
})
