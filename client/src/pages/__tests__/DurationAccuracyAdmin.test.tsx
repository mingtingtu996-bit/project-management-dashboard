import { render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  fetchV14231ActionableSurface: vi.fn(),
}))

vi.mock('@/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  getApiErrorMessage: (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
}))

vi.mock('@/services/v14231ReadinessApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/v14231ReadinessApi')>('@/services/v14231ReadinessApi')
  return {
    ...actual,
    fetchV14231ActionableSurface: mocks.fetchV14231ActionableSurface,
  }
})

const { default: DurationAccuracyAdmin } = await import('../DurationAccuracyAdmin')

function readClientSource(relativePath: string) {
  for (const candidate of [join(process.cwd(), relativePath), join(process.cwd(), 'client', relativePath)]) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Continue through the workspace-root candidates.
    }
  }
  throw new Error(`Unable to locate ${relativePath}`)
}

const summary = {
  projectId: null,
  engineCode: null,
  engineCount: 2,
  generatedAt: '2026-07-18T00:00:00.000Z',
  metrics: [
    {
      engineCode: 'standard_duration_reference',
      outputKind: 'standard_work_duration_reference',
      metricBasis: 'standard_work_duration_seed_replay',
      predictionBasis: 'seed_replay_report_only',
      modelVersion: 'standard_duration_seed_replay',
      sampleCount: 18,
      maeDays: null,
      biasDays: null,
      mape: 12.5,
      status: 'report_only_replay_backtested',
      lastBacktestedAt: '2026-07-17T00:00:00.000Z',
      source: 'standard_work_duration_seed_replay',
    },
    {
      engineCode: 'critical_path_cpm',
      outputKind: 'critical_path_project_duration',
      metricBasis: 'duration_algorithm_accuracy_events.signed_error_days',
      predictionBasis: 'runtime_snapshot',
      modelVersion: 'critical_path_cpm_v1',
      sampleCount: 1,
      maeDays: 3,
      biasDays: 3,
      mape: 7.5,
      status: 'backtested',
      lastBacktestedAt: '2026-07-17T00:00:00.000Z',
      source: 'duration_algorithm_accuracy_events',
    },
  ],
}

const governanceReadModel = {
  source: 'duration_accuracy_governance_read_model',
  generatedAt: '2026-07-18T00:00:00.000Z',
  scope: { companyId: 'company-1', projectId: null, projectIds: ['project-1'] },
  samples: [{
    id: 'sample-1',
    projectId: 'project-1',
    engineCode: 'critical_path_cpm',
    outputKind: 'critical_path_project_duration',
    predictionBasis: 'runtime_snapshot',
    modelVersion: 'critical_path_cpm_v1',
    predictedDurationDays: 40,
    actualDurationDays: 43,
    signedErrorDays: 3,
    backtestStatus: 'backtested',
    backtestedAt: '2026-07-17T00:00:00.000Z',
  }],
  publications: [{
    publicationKey: 'duration-learning:one',
    assetKey: 'base_duration_benchmark',
    scopeLevel: 'project',
    companyId: 'company-1',
    projectId: 'project-1',
    publicationStage: 'canary',
    trafficPercent: 10,
    monitoringStatus: 'collecting',
    publishedAt: '2026-07-17T01:00:00.000Z',
  }],
  runtimeCalls: [{
    id: 'call-1',
    consumerKey: 'durationSuggestionService',
    runtimeEntryRef: 'durationSuggestionService:getTaskDurationSuggestion',
    callStatus: 'called',
    calledAt: '2026-07-17T02:00:00.000Z',
  }],
  observations: [{
    id: 'observation-1',
    assetKey: 'base_duration_benchmark',
    publicationKey: 'duration-learning:one',
    consumerKey: 'durationSuggestionService',
    consumerSurface: 'duration_suggestion',
    observationStatus: 'observed',
    observedAt: '2026-07-17T02:01:00.000Z',
  }],
  sourceStatus: {
    samples: 'available',
    publications: 'available',
    runtimeCalls: 'available',
    observations: 'available',
  },
  sourceErrors: {},
}

describe('DurationAccuracyAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/api/admin/duration-accuracy/summary') return summary
      if (url === '/api/admin/duration-accuracy/governance-read-model?limit=25') return governanceReadModel
      throw new Error(`unexpected URL: ${url}`)
    })
    mocks.fetchV14231ActionableSurface.mockImplementation(async (key: string) => ({
      key,
      status: 'needs-gating',
      boundaryPolicy: {
        canUseAsStableAction: false,
        writesRuntimePublication: false,
        declaresProductionReady: false,
        requiresLiveEvidenceForUpgrade: true,
      },
    }))
  })

  it('keeps an explicit link to the unified duration assets accuracy tab', () => {
    expect(readClientSource('src/pages/DurationAccuracyAdmin.tsx')).toContain('/admin/duration-assets?tab=accuracy')
  })

  it('renders real samples, replay, publications, runtime calls and observations without exposing dangerous commands', async () => {
    render(<DurationAccuracyAdmin />)

    expect((await screen.findAllByText('duration-learning:one')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('critical_path_cpm_v1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('standard_duration_seed_replay').length).toBeGreaterThan(0)
    expect(screen.getAllByText('durationSuggestionService').length).toBeGreaterThan(0)
    expect(screen.getByText('duration_suggestion')).toBeInTheDocument()
    expect(screen.getByText('含样本指标').parentElement).toHaveTextContent('2')
    expect(screen.getByTestId('duration-accuracy-data-status')).toHaveAttribute('data-status', 'available')
    expect(screen.queryByText('已有回测样本')).not.toBeInTheDocument()

    const actionReadiness = screen.getByTestId('duration-accuracy-action-readiness')
    expect(within(actionReadiness).getByText('自动发布')).toBeInTheDocument()
    expect(within(actionReadiness).getByText('强制 Stable')).toBeInTheDocument()
    expect(within(actionReadiness).getByText('关闭回滚')).toBeInTheDocument()
    expect(within(actionReadiness).queryByRole('button')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(mocks.fetchV14231ActionableSurface).toHaveBeenCalledTimes(3)
    })
  })

  it('renders explicit empty states for each read-only section', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/api/admin/duration-accuracy/summary') return { ...summary, metrics: [] }
      return {
        ...governanceReadModel,
        samples: [],
        publications: [],
        runtimeCalls: [],
        observations: [],
      }
    })

    render(<DurationAccuracyAdmin />)

    expect(await screen.findByText('暂无预测快照或回测样本。')).toBeInTheDocument()
    expect(screen.getByTestId('duration-accuracy-data-status')).toHaveAttribute('data-status', 'empty')
    expect(screen.getByText('暂无准度样本。')).toBeInTheDocument()
    expect(screen.getByText('暂无回放结果。')).toBeInTheDocument()
    expect(screen.getByText('暂无运行发布。')).toBeInTheDocument()
    expect(screen.getByText('暂无运行调用。')).toBeInTheDocument()
    expect(screen.getByText('暂无消费观测。')).toBeInTheDocument()
  })

  it('keeps available sections visible when publication storage is unavailable', async () => {
    mocks.apiGet.mockImplementation(async (url: string) => {
      if (url === '/api/admin/duration-accuracy/summary') return summary
      return {
        ...governanceReadModel,
        publications: [],
        sourceStatus: { ...governanceReadModel.sourceStatus, publications: 'unavailable' },
        sourceErrors: { publications: 'duration_accuracy_publications_unavailable' },
      }
    })

    render(<DurationAccuracyAdmin />)

    expect(await screen.findByText('运行发布数据暂时不可用。')).toBeInTheDocument()
    expect(screen.getAllByText('critical_path_cpm_v1').length).toBeGreaterThan(0)
    expect(screen.getByText('duration_suggestion')).toBeInTheDocument()
  })
})
