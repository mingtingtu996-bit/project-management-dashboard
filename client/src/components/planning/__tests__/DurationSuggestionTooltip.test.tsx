import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DurationSuggestionTooltip } from '@/components/planning/DurationSuggestionTooltip'

describe('DurationSuggestionTooltip', () => {
  it('shows the concise business-facing duration sentence', async () => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 5,
          conservativeDurationDays: 8,
          confidenceLevel: 'medium',
          confidenceScore: 60,
          forecastSource: 'standard_work_duration_seed',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: '当前项目同类样本较少',
          displaySummary: 'ο 5 죬Ԥ 8 죻ŶеȣΪǰĿͬ١',
          sampleSize: 0,
        }}
      />,
    )

    const trigger = screen.getByText('参考工期 5 天')
    expect(trigger).toBeTruthy()

    fireEvent.pointerMove(trigger)
    await waitFor(() => {
      expect(screen.getAllByText('工期智能参考 · 标准参考工期').length).toBeGreaterThan(0)
      expect(screen.getAllByText('ο 5 죬Ԥ 8 죻ŶеȣΪǰĿͬ١').length).toBeGreaterThan(0)
    })
  })

  it('does not mark a live reference calculation as a frozen snapshot', async () => {
    const { container } = render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 5,
          conservativeDurationDays: 6,
          confidenceLevel: 'medium',
          confidenceScore: 60,
          forecastSource: 'standard_work_duration_seed',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: 'live reference calculation',
          displaySummary: 'live-summary-token',
          generatedAt: '2026-05-01T00:00:00.000Z',
          sampleSize: 0,
        } as any}
      />,
    )

    const trigger = container.querySelector('span')
    expect(trigger).toBeTruthy()
    fireEvent.pointerMove(trigger!)

    await waitFor(() => {
      expect(screen.getAllByText('live-summary-token').length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByTestId('duration-reference-freeze-trigger')).toHaveLength(0)
    expect(screen.queryAllByTestId('duration-reference-freeze-indicator')).toHaveLength(0)
  })

  it('does not render the retired frozen-reference lock even if legacy fields are present', async () => {
    const { container } = render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 5,
          conservativeDurationDays: 6,
          confidenceLevel: 'medium',
          confidenceScore: 60,
          forecastSource: 'standard_work_duration_seed',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: 'frozen reference calculation',
          displaySummary: 'frozen-summary-token',
          generatedAt: '2026-05-01T00:00:00.000Z',
          isReferenceFrozen: true,
          referenceFrozenAt: '2026-05-01T00:00:00.000Z',
          sampleSize: 0,
        } as any}
      />,
    )

    const trigger = container.querySelector('span')
    expect(trigger).toBeTruthy()
    expect(screen.queryAllByTestId('duration-reference-freeze-trigger')).toHaveLength(0)
    fireEvent.pointerMove(trigger!)

    await waitFor(() => {
      expect(screen.getAllByText('frozen-summary-token').length).toBeGreaterThan(0)
    })
    expect(screen.queryAllByTestId('duration-reference-freeze-indicator')).toHaveLength(0)
  })

  it('labels project rhythm references separately from standard references', async () => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 9,
          conservativeDurationDays: 12,
          confidenceLevel: 'medium',
          confidenceScore: 62,
          forecastSource: 'standard_work_duration_seed+project_execution_context',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: '本项目同类已完成任务显示当前生产节奏偏慢',
          sampleSize: 3,
          factorAvailability: {
            project_execution_context: true,
          },
        }}
      />,
    )

    const trigger = screen.getByText('项目节奏参考 · 参考工期 9 天')
    fireEvent.pointerMove(trigger)

    await waitFor(() => {
      expect(screen.getAllByText('工期智能参考 · 项目节奏参考').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/已参考本项目施工节奏/).length).toBeGreaterThan(0)
    })
  })

  it('surfaces a plain-language reserve and mutation boundary without percentile terminology', async () => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 18,
          conservativeDurationDays: 24,
          riskP20DurationDays: 15,
          riskP50DurationDays: 18,
          riskP80DurationDays: 24,
          durationRiskRange: {
            source: 'default_master_plan_duration_asset_risk_range',
            evidenceLevel: 'candidate_duration_asset_utilization_l1',
            p20Days: 15,
            p50Days: 18,
            p80Days: 24,
            mutationBoundary: 'candidate_only_no_runtime_write',
          },
          confidenceLevel: 'medium',
          confidenceScore: 64,
          forecastSource: 'standard_work_duration_seed+default_master_plan',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: '资产样本存在波动，先作为候选区间复核。',
          sampleSize: 6,
        }}
      />,
    )

    const trigger = screen.getByText('参考工期 18 天')
    fireEvent.pointerMove(trigger)

    await waitFor(() => {
      expect(screen.getAllByText('工期风险 建议预留 6 天').length).toBeGreaterThan(0)
      expect(screen.getAllByText('候选证据，不自动写生产运行层').length).toBeGreaterThan(0)
      expect(screen.queryByText(/P20|P50|P80/)).not.toBeInTheDocument()
    })
  })

  it('labels package child durations as reference durations inside the parent package', async () => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 4,
          conservativeDurationDays: 7,
          confidenceLevel: 'medium',
          confidenceScore: 62,
          forecastSource: 'standard_work_duration_seed+package_child_window',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: '该工序位于父级包内，计划工期以父级包窗口为约束',
          businessReasonCode: 'PACKAGE_CHILD_DURATION_WINDOW',
          businessReasonCodes: ['PACKAGE_CHILD_DURATION_WINDOW'],
          businessReasonParams: {
            nonAdditiveWithParentDuration: true,
            parentTaskTitle: '标准层主体结构流水施工',
            parentReferenceDurationDays: 6,
            rhythmWindowStartDay: 4,
            rhythmWindowEndDay: 5,
          },
          sampleSize: 0,
          factorAvailability: {
            package_child_duration_window: true,
          },
        }}
      />,
    )

    const trigger = screen.getByText('参考工期 4 天')
    fireEvent.pointerMove(trigger)

    await waitFor(() => {
      expect(screen.getAllByText('工期智能参考 · 标准参考工期').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/第 4-5 天/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/计划表以父级包窗口为约束/).length).toBeGreaterThan(0)
    })
  })

  it('uses the agreed monthly target window wording', async () => {
    render(
      <DurationSuggestionTooltip
        query={{ suggestionPurpose: 'monthly_commitment_window' }}
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 4,
          conservativeDurationDays: 5,
          confidenceLevel: 'medium',
          confidenceScore: 58,
          forecastSource: 'standard_work_duration_seed+monthly_commitment_window',
          durationCalibrationSource: 'standard_work_duration_seed',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: '本月目标窗口基本匹配',
          sampleSize: 0,
        }}
      />,
    )

    const trigger = screen.getByText('本月目标需 4 天')
    fireEvent.pointerMove(trigger)

    await waitFor(() => {
      expect(screen.getAllByText('工期智能参考 · 目标窗口参考').length).toBeGreaterThan(0)
    })
  })

  it('keeps an unavailable duration suggestion visible as business text', async () => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          conservativeDurationDays: null,
          confidenceLevel: 'unavailable',
          confidenceScore: 0,
          forecastSource: 'unavailable',
          durationCalibrationSource: 'unavailable',
          durationProvenance: 'unavailable',
          businessReason: 'ȱ࣬޷οڽ顣',
          displaySummary: '暂无参考工期；缺少任务分类，先由用户填写。',
          sampleSize: 0,
        }}
      />,
    )

    const trigger = screen.getByText('暂无参考工期')
    fireEvent.pointerMove(trigger)

    await waitFor(() => {
      expect(screen.getAllByText('暂无参考工期；缺少任务分类，先由用户填写。').length).toBeGreaterThan(0)
    })
  })

  it('does not display ungoverned recommended days as a user-facing reference', () => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          recommendedDurationDays: 9,
          conservativeDurationDays: 12,
          confidenceLevel: 'medium',
          confidenceScore: 60,
          forecastSource: 'legacy_recommended_only',
          durationCalibrationSource: 'legacy',
          durationProvenance: 'legacy',
          businessReason: 'Ungoverned recommended days should stay hidden.',
          sampleSize: 0,
        } as any}
      />,
    )

    expect(screen.queryByText(/9/)).toBeNull()
    expect(screen.getByText((content) => content.includes('暂无') || content.includes('鏆傛棤'))).toBeTruthy()
  })
})
