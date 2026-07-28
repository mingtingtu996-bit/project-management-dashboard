import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  queueState: 'ready' as 'ready' | 'loading' | 'empty' | 'error' | 'permission' | 'stale',
  accuracyState: 'ready' as 'ready' | 'loading' | 'error' | 'permission' | 'stale',
  governanceState: 'ready' as 'ready' | 'loading' | 'error' | 'permission' | 'stale',
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('DurationAssetsAdmin', () => {
  afterEach(() => vi.useRealTimers())

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    })
    mocks.queueState = 'ready'
    mocks.accuracyState = 'ready'
    mocks.governanceState = 'ready'
    mocks.generatedAt = new Date().toISOString()
    mocks.getDurationAssetReviewItems.mockImplementation(async () => {
      if (mocks.queueState === 'error') throw new Error('queue unavailable')
      if (mocks.queueState === 'permission') throw Object.assign(new Error('forbidden'), { status: 403 })
      if (mocks.queueState === 'loading') return new Promise(() => {})
      return { generatedAt: mocks.generatedAt, total: mocks.queueState === 'empty' ? 0 : 2, items: mocks.queueState === 'empty' ? [] : [queueItem, { ...queueItem, id: 'shared-1', scope: { level: 'global' }, canReview: false, approvalReady: false }] }
    })
    mocks.getDurationAccuracySummary.mockImplementation(async () => {
      if (mocks.accuracyState === 'error') throw new Error('accuracy unavailable')
      if (mocks.accuracyState === 'permission') throw Object.assign(new Error('forbidden'), { status: 403 })
      if (mocks.accuracyState === 'loading') return new Promise(() => {})
      return {
        generatedAt: mocks.accuracyState === 'stale' ? '2026-07-23T00:00:00.000Z' : mocks.generatedAt,
        dataStatus: 'ok', sourceErrors: [],
        metrics: [{ engineCode: 'critical_path_cpm', sampleCount: 2, status: 'backtested' }],
      }
    })
    mocks.getDurationAccuracyGovernanceReadModel.mockImplementation(async () => {
      if (mocks.governanceState === 'error') throw new Error('governance unavailable')
      if (mocks.governanceState === 'permission') throw Object.assign(new Error('forbidden'), { status: 403 })
      if (mocks.governanceState === 'loading') return new Promise(() => {})
      return {
        generatedAt: mocks.governanceState === 'stale' ? '2026-07-23T00:00:00.000Z' : mocks.generatedAt,
        publications: [{ publicationKey: 'pub-1', assetKey: 'base_duration_benchmark', publicationStage: 'canary', monitoringStatus: 'collecting' }],
        observations: [], runtimeCalls: [], samples: [],
        sourceStatus: { samples: 'available', publications: 'available', runtimeCalls: 'available', observations: 'available' }, sourceErrors: {},
      }
    })
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
    expect(screen.getAllByRole('button', { name: /批准 base_duration_benchmark asset-1/ })).toHaveLength(1)
  })

  it.each(['loading', 'empty', 'error', 'permission', 'stale'] as const)('renders the %s state', async (state) => {
    configureState(state)
    renderAdmin('/admin/duration-assets')
    expect(await screen.findByTestId(`duration-assets-${state}`)).toBeInTheDocument()
  })

  it.each([
    ['published', 'governanceState', 'loading', 'duration-assets-loading'],
    ['monitoring', 'governanceState', 'error', 'duration-assets-error'],
    ['accuracy', 'accuracyState', 'permission', 'duration-assets-permission'],
    ['published', 'governanceState', 'stale', 'duration-assets-stale'],
  ] as const)('renders %s direct-tab %s boundaries', async (tab, stateKey, state, testId) => {
    mocks[stateKey] = state
    renderAdmin(`/admin/duration-assets?tab=${tab}`)
    expect(await screen.findByTestId(testId)).toBeInTheDocument()
    if (state === 'stale') expect(screen.getByText('pub-1')).toBeInTheDocument()
  })

  it('clears prior governed read models after a failed reload instead of relabeling them empty', async () => {
    renderAdmin('/admin/duration-assets?tab=published')
    expect(await screen.findByText('pub-1')).toBeInTheDocument()
    mocks.governanceState = 'error'
    fireEvent.click(screen.getByRole('button', { name: '\u5237\u65b0' }))
    expect(await screen.findByTestId('duration-assets-error')).toBeInTheDocument()
    expect(screen.queryByText('pub-1')).not.toBeInTheDocument()
  })

  it('keeps partial and unavailable backend sources distinct from empty tables', async () => {
    mocks.getDurationAccuracySummary.mockResolvedValueOnce({
      generatedAt: new Date().toISOString(), dataStatus: 'partial',
      sourceErrors: [{ source: 'duration_algorithm_accuracy_events', code: 'metrics_unavailable' }], metrics: [],
    })
    const accuracyView = renderAdmin('/admin/duration-assets?tab=accuracy')
    expect(await screen.findByTestId('duration-assets-partial')).toHaveTextContent('duration_algorithm_accuracy_events:metrics_unavailable')
    expect(screen.queryByText('暂无后端准确度读模型。')).not.toBeInTheDocument()
    accuracyView.unmount()

    mocks.getDurationAccuracySummary.mockResolvedValueOnce({
      generatedAt: new Date().toISOString(), dataStatus: 'unavailable',
      sourceErrors: [{ source: 'duration_algorithm_accuracy_events', code: 'metrics_unavailable' }], metrics: [],
    })
    const unavailableAccuracyView = renderAdmin('/admin/duration-assets?tab=accuracy')
    expect(await screen.findByTestId('duration-assets-unavailable')).toBeInTheDocument()
    expect(screen.queryByText('暂无后端准确度读模型。')).not.toBeInTheDocument()
    unavailableAccuracyView.unmount()

    mocks.getDurationAccuracyGovernanceReadModel.mockResolvedValueOnce({
      generatedAt: new Date().toISOString(), publications: [], observations: [], runtimeCalls: [], samples: [],
      sourceStatus: { samples: 'available', publications: 'unavailable', runtimeCalls: 'available', observations: 'available' },
      sourceErrors: { publications: 'publication_source_unavailable' },
    })
    const publishedView = renderAdmin('/admin/duration-assets?tab=published')
    expect(await screen.findByTestId('duration-assets-unavailable')).toBeInTheDocument()
    expect(screen.queryByText('暂无后端发布记录。')).not.toBeInTheDocument()
    publishedView.unmount()

    mocks.getDurationAccuracyGovernanceReadModel.mockResolvedValueOnce({
      generatedAt: new Date().toISOString(), publications: [], samples: [], observations: [],
      runtimeCalls: [{ runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion', consumerKey: 'durationSuggestionService', callStatus: 'called' }],
      sourceStatus: { samples: 'available', publications: 'available', runtimeCalls: 'available', observations: 'unavailable' },
      sourceErrors: { observations: 'observation_source_unavailable' },
    })
    renderAdmin('/admin/duration-assets?tab=monitoring')
    expect(await screen.findByTestId('duration-assets-partial')).toBeInTheDocument()
    expect(screen.getByText('durationSuggestionService:getTaskDurationSuggestion')).toBeInTheDocument()
    expect(screen.queryByText('暂无后端监控记录。')).not.toBeInTheDocument()
  })

  it('completes each backend loader independently', async () => {
    const pendingAccuracy = deferred<unknown>()
    mocks.getDurationAccuracySummary.mockReturnValueOnce(pendingAccuracy.promise)
    mocks.getDurationAssetReviewItems.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }))
    renderAdmin('/admin/duration-assets?tab=queue')
    expect(await screen.findByTestId('duration-assets-permission')).toBeInTheDocument()

    const pendingQueue = deferred<unknown>()
    mocks.getDurationAssetReviewItems.mockReturnValueOnce(pendingQueue.promise)
    renderAdmin('/admin/duration-assets?tab=published')
    expect(await screen.findByText('pub-1')).toBeInTheDocument()
  })

  it('keeps source errors visible when stale supersedes a partial accuracy model', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T08:00:00.000Z'))
    mocks.getDurationAccuracySummary.mockResolvedValueOnce({
      generatedAt: '2026-07-23T08:00:00.000Z', dataStatus: 'partial',
      sourceErrors: [{ source: 'duration_algorithm_accuracy_events', code: 'metrics_unavailable' }],
      metrics: [{ engineCode: 'critical_path_cpm', sampleCount: 2, status: 'backtested' }],
    })
    renderAdmin('/admin/duration-assets?tab=accuracy')
    await act(async () => { await Promise.resolve() })
    expect(screen.getByTestId('duration-assets-partial')).toHaveTextContent('duration_algorithm_accuracy_events:metrics_unavailable')
    act(() => { vi.advanceTimersByTime(5 * 60 * 1000) })
    expect(screen.getByTestId('duration-assets-stale')).toHaveTextContent('duration_algorithm_accuracy_events:metrics_unavailable')
    expect(screen.queryByTestId('duration-assets-partial')).not.toBeInTheDocument()
  })

  it('allows refresh to supersede an unrelated hung loader generation', async () => {
    const pendingAccuracy = deferred<unknown>()
    mocks.getDurationAccuracySummary.mockReturnValueOnce(pendingAccuracy.promise)
    renderAdmin('/admin/duration-assets?tab=queue')
    expect(await screen.findAllByText('asset-1')).toHaveLength(2)
    const refresh = screen.getByRole('button', { name: '刷新' })
    expect(refresh).not.toBeDisabled()
    fireEvent.click(refresh)
    await waitFor(() => expect(mocks.getDurationAssetReviewItems).toHaveBeenCalledTimes(2))
  })

  it('marks a queue stale at five minutes and refuses a decision opened while it was fresh', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-23T08:00:00.000Z'))
    mocks.generatedAt = '2026-07-23T08:00:00.000Z'
    renderAdmin('/admin/duration-assets?tab=queue')
    await act(async () => { await Promise.resolve() })
    const notes = screen.getByLabelText('决策备注')
    fireEvent.change(notes, { target: { value: 'fresh evidence' } })
    fireEvent.click(screen.getByRole('button', { name: /批准 base_duration_benchmark asset-1/ }))
    expect(screen.getByTestId('duration-assets-decision-dialog')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(5 * 60 * 1000) })
    expect(screen.getByTestId('duration-assets-stale')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认批准' }))
    expect(mocks.decideDurationAssetReviewItem).not.toHaveBeenCalled()
    expect(notes).toHaveValue('fresh evidence')
    vi.useRealTimers()
  })

  it('treats operation_blocked as a retryable failure without clearing notes or refreshing', async () => {
    renderAdmin('/admin/duration-assets?tab=queue')
    const notes = await screen.findByLabelText('决策备注')
    fireEvent.change(notes, { target: { value: 'review evidence' } })
    fireEvent.click(screen.getByRole('button', { name: /批准 base_duration_benchmark asset-1/ }))
    mocks.decideDurationAssetReviewItem.mockResolvedValueOnce({ status: 'operation_blocked', reasons: ['replay_required', 'evidence_missing'] })
    const queueCalls = mocks.getDurationAssetReviewItems.mock.calls.length
    fireEvent.click(await screen.findByRole('button', { name: '确认批准' }))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: 'destructive', description: 'replay_required，evidence_missing',
    })))
    expect(mocks.getDurationAssetReviewItems).toHaveBeenCalledTimes(queueCalls)
    expect(notes).toHaveValue('review evidence')
    const retryAction = mocks.toast.mock.calls.at(-1)?.[0]?.action as { props: { onClick: () => void } }
    retryAction.props.onClick()
    expect(await screen.findByTestId('duration-assets-decision-dialog')).toBeInTheDocument()
  })

  it('applies filters, confirms decisions, disables commands, retries failures, refreshes success, supports keyboard tabs, and preserves mobile table overflow', async () => {
    renderAdmin('/admin/duration-assets?tab=queue')
    const initialDecisionNotes = await screen.findByLabelText('\u51b3\u7b56\u5907\u6ce8')
    const approve = screen.getByRole('button', { name: /批准 base_duration_benchmark asset-1/ })
    const reject = screen.getByRole('button', { name: /驳回 base_duration_benchmark asset-1/ })
    const supersede = screen.getByRole('button', { name: /替代 base_duration_benchmark asset-1/ })
    expect(initialDecisionNotes).toHaveValue('')
    expect(approve).toBeDisabled()
    expect(reject).toBeDisabled()
    expect(supersede).toBeDisabled()
    fireEvent.change(initialDecisionNotes, { target: { value: '   ' } })
    expect(approve).toBeDisabled()
    expect(reject).toBeDisabled()
    expect(supersede).toBeDisabled()
    expect(screen.getByTestId('duration-assets-table-overflow')).toHaveClass('overflow-x-auto')
    const queueTab = screen.getByRole('tab', { name: '\u5ba1\u6838\u961f\u5217' })
    queueTab.focus()
    fireEvent.keyDown(queueTab, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByRole('tab', { name: '\u5df2\u53d1\u5e03' })).toHaveAttribute('aria-selected', 'true'))
    const publishedTab = screen.getByRole('tab', { name: '\u5df2\u53d1\u5e03' })
    publishedTab.focus()
    fireEvent.keyDown(publishedTab, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByRole('tab', { name: '\u5ba1\u6838\u961f\u5217' })).toHaveAttribute('aria-selected', 'true'))
    const chooseOption = async (triggerId: string, optionName: string) => {
      fireEvent.click(document.getElementById(triggerId) as HTMLButtonElement)
      fireEvent.click(await screen.findByRole('option', { name: optionName }))
    }
    await chooseOption('duration-asset-family', 'base_duration_benchmark')
    await chooseOption('duration-asset-scope', '\u9879\u76ee')
    await chooseOption('duration-asset-status', '\u5df2\u7531\u53d1\u5e03\u89e3\u51b3')
    await chooseOption('duration-asset-age', '30 \u5929')
    fireEvent.change(screen.getByLabelText('\u9879\u76ee\u7b5b\u9009'), { target: { value: '550e8400-e29b-41d4-a716-446655440000' } })
    fireEvent.change(screen.getByLabelText('\u539f\u56e0\u7b5b\u9009'), { target: { value: 'replay_required' } })
    expect(mocks.getDurationAssetReviewItems).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }))
    await waitFor(() => expect(mocks.getDurationAssetReviewItems).toHaveBeenLastCalledWith({
      assetKey: 'base_duration_benchmark', scope: 'project', projectId: '550e8400-e29b-41d4-a716-446655440000',
      reason: 'replay_required', status: 'resolved_by_publication', age: '30d',
    }))
    const decisionNotes = await screen.findByLabelText('\u51b3\u7b56\u5907\u6ce8')
    fireEvent.change(decisionNotes, { target: { value: 'evidence reviewed' } })
    fireEvent.click(await screen.findByRole('button', { name: /批准 base_duration_benchmark asset-1/ }))
    expect(await screen.findByTestId('duration-assets-decision-dialog')).toBeInTheDocument()
    mocks.decideDurationAssetReviewItem.mockRejectedValueOnce(new Error('decision failed'))
    fireEvent.click(screen.getByRole('button', { name: '\u786e\u8ba4\u6279\u51c6' }))
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })))
    expect(decisionNotes).toHaveValue('evidence reviewed')
    expect(mocks.decideDurationAssetReviewItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'review-1' }), 'approve', 'evidence reviewed')
    const retryAction = mocks.toast.mock.calls.at(-1)?.[0]?.action as { props: { onClick: () => void } }
    retryAction.props.onClick()
    expect(await screen.findByTestId('duration-assets-decision-dialog')).toBeInTheDocument()
    const queueCallsBeforeSuccess = mocks.getDurationAssetReviewItems.mock.calls.length
    mocks.decideDurationAssetReviewItem.mockResolvedValueOnce({ status: 'operation_delegated' })
    fireEvent.click(screen.getByRole('button', { name: '\u786e\u8ba4\u6279\u51c6' }))
    await waitFor(() => expect(mocks.getDurationAssetReviewItems.mock.calls.length).toBeGreaterThan(queueCallsBeforeSuccess))
    await waitFor(() => expect(decisionNotes).toHaveValue(''))
    fireEvent.change(decisionNotes, { target: { value: 'alternative evidence' } })
    fireEvent.click(await screen.findByRole('button', { name: /驳回 base_duration_benchmark asset-1/ }))
    expect(await screen.findByRole('button', { name: '\u786e\u8ba4\u9a73\u56de' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '\u53d6\u6d88' }))
    fireEvent.click(await screen.findByRole('button', { name: /替代 base_duration_benchmark asset-1/ }))
    expect(await screen.findByRole('button', { name: '\u786e\u8ba4\u66ff\u4ee3' })).toBeInTheDocument()
  })

  it('rejects invalid project IDs and ignores an older queue response after a newer applied query', async () => {
    const older = deferred<{ generatedAt: string; total: number; items: typeof queueItem[] }>()
    const newer = deferred<{ generatedAt: string; total: number; items: typeof queueItem[] }>()
    mocks.getDurationAssetReviewItems.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise)
    renderAdmin('/admin/duration-assets?tab=queue')
    const reason = screen.getByLabelText('原因筛选')
    fireEvent.change(reason, { target: { value: 'new-query' } })
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }))
    await waitFor(() => expect(mocks.getDurationAssetReviewItems).toHaveBeenCalledTimes(2))
    newer.resolve({ generatedAt: new Date().toISOString(), total: 1, items: [{ ...queueItem, artifactKey: 'new-item' }] })
    expect(await screen.findByText('new-item')).toBeInTheDocument()
    older.resolve({ generatedAt: new Date().toISOString(), total: 1, items: [{ ...queueItem, artifactKey: 'old-item' }] })
    await act(async () => {})
    expect(screen.getByText('new-item')).toBeInTheDocument()
    expect(screen.queryByText('old-item')).not.toBeInTheDocument()

    const callsBeforeInvalidApply = mocks.getDurationAssetReviewItems.mock.calls.length
    fireEvent.change(screen.getByLabelText('项目筛选'), { target: { value: 'not-a-uuid' } })
    fireEvent.click(screen.getByRole('button', { name: '应用筛选' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('项目 ID 必须为 UUID')
    expect(mocks.getDurationAssetReviewItems).toHaveBeenCalledTimes(callsBeforeInvalidApply)
  })
})
