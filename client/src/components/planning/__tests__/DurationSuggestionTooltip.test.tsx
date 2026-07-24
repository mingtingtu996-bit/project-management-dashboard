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

  it('renders compact single-source benchmark provenance and summary dates', async () => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 5,
          conservativeDurationDays: 7,
          confidenceLevel: 'medium',
          confidenceScore: 60,
          forecastSource: 'standard_work_duration_seed',
          durationCalibrationSource: 'standard_work_duration_seed+company_history_sample',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: '已融合公司历史工期样本',
          sampleSize: 24,
          benchmarkGeneratedAt: '2026-07-01T08:00:00.000Z',
          benchmarkAsOf: '2026-06-30T23:59:59.000Z',
          benchmarkWindowStart: '2026-04-01T00:00:00.000Z',
          benchmarkVersion: 'v7',
          benchmarkSampleCount: 24,
          benchmarkDayBasis: 'construction_production_day',
          benchmarkScope: 'company',
          benchmarkProvenanceAvailability: 'available',
          benchmarkProvenanceReasonCodes: [],
          benchmarkProvenanceUnavailableReason: null,
          benchmarkProvenance: {
            mode: 'single',
            entries: [{
              source: 'persisted_benchmark',
              benchmarkId: 'benchmark-1',
              publicationKey: null,
              benchmarkVersion: 'v7',
              scope: 'company',
              generatedAt: '2026-07-01T08:00:00.000Z',
              sourceAsOf: '2026-06-30T23:59:59.000Z',
              sourceWindowStart: '2026-04-01T00:00:00.000Z',
              sampleCount: 24,
              dayBasis: 'construction_production_day',
              calendarRef: 'calendar-1',
              calendarVersion: 'calendar-v3',
              aggregateCalendarIdentities: [],
              causeSegment: null,
              blendWeight: null,
              availability: 'available',
              reasonCodes: [],
            }],
          },
        }}
      />,
    )

    const trigger = screen.getByText('参考工期 5 天')
    fireEvent.pointerMove(trigger)

    await waitFor(() => {
      expect(screen.getAllByText('数据截至 2026/06/30').length).toBeGreaterThan(0)
      expect(screen.getAllByText((content) => content.includes('公司基准 · 24 个样本 · v7 · 施工生产日')).length).toBeGreaterThan(0)
      expect(screen.getAllByText((content) => content.includes('统计窗口自 2026/04/01')).length).toBeGreaterThan(0)
    })
  })

  it('renders every exact source row for a blended benchmark', async () => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 8,
          conservativeDurationDays: 10,
          confidenceLevel: 'medium',
          confidenceScore: 66,
          forecastSource: 'standard_work_duration_seed',
          durationCalibrationSource: 'standard_work_duration_seed+mixed_history_sample',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: '已融合项目和行业历史工期样本',
          sampleSize: 120,
          benchmarkGeneratedAt: '2026-07-03T08:00:00.000Z',
          benchmarkAsOf: '2026-06-29T23:59:59.000Z',
          benchmarkWindowStart: '2026-04-01T00:00:00.000Z',
          benchmarkVersion: null,
          benchmarkSampleCount: 120,
          benchmarkDayBasis: 'construction_production_day',
          benchmarkScope: 'mixed',
          benchmarkProvenanceAvailability: 'available',
          benchmarkProvenanceReasonCodes: [],
          benchmarkProvenanceUnavailableReason: null,
          benchmarkProvenance: {
            mode: 'blended',
            entries: [{
              source: 'persisted_benchmark',
              benchmarkId: 'benchmark-project-1',
              publicationKey: null,
              benchmarkVersion: 'project-v3',
              scope: 'project',
              generatedAt: '2026-07-01T08:00:00.000Z',
              sourceAsOf: '2026-06-29T23:59:59.000Z',
              sourceWindowStart: '2026-05-01T00:00:00.000Z',
              sampleCount: 20,
              dayBasis: 'construction_production_day',
              calendarRef: 'project-calendar',
              calendarVersion: 'project-v2',
              aggregateCalendarIdentities: [],
              causeSegment: null,
              blendWeight: 0.5,
              availability: 'available',
              reasonCodes: [],
            }, {
              source: 'runtime_publication',
              benchmarkId: null,
              publicationKey: 'runtime-industry-mixed',
              benchmarkVersion: 'aggregate:industry:fedcba9876543210',
              scope: 'industry',
              generatedAt: '2026-07-03T08:00:00.000Z',
              sourceAsOf: '2026-06-30T23:59:59.000Z',
              sourceWindowStart: '2026-04-01T00:00:00.000Z',
              sampleCount: 100,
              dayBasis: 'construction_production_day',
              calendarRef: null,
              calendarVersion: null,
              aggregateCalendarIdentities: [{ calendarRef: 'industry-calendar', calendarVersion: 'industry-v4' }],
              causeSegment: null,
              blendWeight: 0.5,
              availability: 'available',
              reasonCodes: [],
            }],
          },
        }}
      />,
    )

    const trigger = screen.getByText('参考工期 8 天')
    fireEvent.pointerMove(trigger)

    await waitFor(() => {
      expect(screen.getAllByText((content) => content.includes('项目基准 · 20 个样本 · project-v3 · 施工生产日 · 50%')).length).toBeGreaterThan(0)
      expect(screen.getAllByText((content) => content.includes('行业基准 · 100 个样本 · aggregate:industry:fedcba9876543210 · 施工生产日 · 50%')).length).toBeGreaterThan(0)
    })
  })

  it.each([
    {
      availability: 'partial' as const,
      reasonCodes: ['benchmark_calendar_identity_missing'] as const,
      statusMessage: '基准数据来源不完整',
      reasonMessage: '基准日历身份不可用',
    },
    {
      availability: 'unavailable' as const,
      reasonCodes: ['benchmark_source_as_of_missing'] as const,
      statusMessage: null,
      reasonMessage: '基准数据截止时间不可用',
    },
    {
      availability: 'unavailable' as const,
      reasonCodes: ['benchmark_version_missing'] as const,
      statusMessage: null,
      reasonMessage: '基准版本不可用',
    },
  ])('keeps used source rows visible with a reason-specific $availability message', async ({
    availability,
    reasonCodes,
    statusMessage,
    reasonMessage,
  }) => {
    render(
      <DurationSuggestionTooltip
        suggestion={{
          durationOutputCode: 'contextual_reference',
          durationOutputSemanticFieldName: 'contextualReferenceDays',
          contextualReferenceDays: 6,
          conservativeDurationDays: 8,
          confidenceLevel: 'medium',
          confidenceScore: 60,
          forecastSource: 'standard_work_duration_seed',
          durationCalibrationSource: 'standard_work_duration_seed+company_history_sample',
          durationProvenance: 'standard_work_duration_seed',
          businessReason: '基准来源待补齐',
          sampleSize: 24,
          benchmarkGeneratedAt: null,
          benchmarkAsOf: null,
          benchmarkWindowStart: null,
          benchmarkVersion: null,
          benchmarkSampleCount: null,
          benchmarkDayBasis: null,
          benchmarkScope: null,
          benchmarkProvenanceAvailability: availability,
          benchmarkProvenanceReasonCodes: [...reasonCodes],
          benchmarkProvenanceUnavailableReason: reasonCodes[0],
          benchmarkProvenance: {
            mode: availability === 'partial' ? 'blended' : 'single',
            entries: [{
              source: 'persisted_benchmark',
              benchmarkId: 'benchmark-company-1',
              publicationKey: null,
              benchmarkVersion: 'v7',
              scope: 'company',
              generatedAt: availability === 'unavailable' ? null : '2026-07-01T08:00:00.000Z',
              sourceAsOf: availability === 'unavailable' ? null : '2026-06-30T23:59:59.000Z',
              sourceWindowStart: '2026-04-01T00:00:00.000Z',
              sampleCount: 24,
              dayBasis: 'construction_production_day',
              calendarRef: 'calendar-1',
              calendarVersion: 'calendar-v3',
              aggregateCalendarIdentities: [],
              causeSegment: null,
              blendWeight: availability === 'partial' ? 0.7 : null,
              availability: availability === 'partial' ? 'available' : 'unavailable',
              reasonCodes: availability === 'partial' ? [] : [...reasonCodes],
            }, ...(availability === 'partial' ? [{
              source: 'runtime_publication' as const,
              benchmarkId: 'runtime-industry-1',
              publicationKey: 'runtime-industry-1',
              benchmarkVersion: 'industry-v2',
              scope: 'industry' as const,
              generatedAt: '2026-07-01T08:00:00.000Z',
              sourceAsOf: '2026-06-30T23:59:59.000Z',
              sourceWindowStart: '2026-04-01T00:00:00.000Z',
              sampleCount: 40,
              dayBasis: 'construction_production_day' as const,
              calendarRef: null,
              calendarVersion: null,
              aggregateCalendarIdentities: [],
              causeSegment: null,
              blendWeight: 0.3,
              availability: 'unavailable' as const,
              reasonCodes: [...reasonCodes],
            }] : [])],
          },
        }}
      />,
    )

    const trigger = screen.getByText('参考工期 6 天')
    fireEvent.pointerMove(trigger)

    await waitFor(() => {
      if (statusMessage) expect(screen.getAllByText(statusMessage).length).toBeGreaterThan(0)
      expect(screen.getAllByText(reasonMessage).length).toBeGreaterThan(0)
      expect(screen.getAllByText((content) => content.includes('公司基准 · 24 个样本 · v7 · 施工生产日')).length).toBeGreaterThan(0)
      if (availability === 'partial') {
        expect(screen.getAllByText((content) => content.includes('行业基准 · 40 个样本 · industry-v2 · 施工生产日 · 30%')).length).toBeGreaterThan(0)
      }
    })
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
