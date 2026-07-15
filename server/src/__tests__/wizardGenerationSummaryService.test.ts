import { describe, expect, it } from 'vitest'
import {
  resolveNextWizardGeneratedSortOrder,
  summarizeWizardDurationAssetCandidates,
  summarizeWizardExecutablePreviewRows,
} from '../services/wizardGenerationSummaryService.js'

describe('wizardGenerationSummaryService', () => {
  it('summarizes executable preview rows with one plan-window contract', () => {
    const summary = summarizeWizardExecutablePreviewRows([
      {
        isExecutable: false,
        isWbsSummary: true,
        predecessors: [],
        plannedStartDate: '2026-01-01',
        plannedEndDate: '2027-12-31',
      },
      {
        isExecutable: true,
        isWbsSummary: false,
        predecessors: [{ clientRowId: 'a' }],
        plannedStartDate: '2026-02-01',
        plannedEndDate: '2026-05-01',
      },
      {
        isExecutable: true,
        isWbsSummary: false,
        predecessors: [{ clientRowId: 'b' }, { clientRowId: 'c' }],
        plannedStartDate: '2026-03-01',
        plannedEndDate: '2026-08-01',
      },
    ])

    expect(summary).toEqual({
      scheduleRowCount: 3,
      executableRowCount: 2,
      summaryRowCount: 1,
      visibleDependencyCount: 3,
      projectStartDate: '2026-02-01',
      projectEndDate: '2026-08-01',
    })
  })

  it('summarizes every duration-asset consumer dimension in one service', () => {
    const emptyCandidate = {
      riskP20DurationDays: null,
      riskP50DurationDays: null,
      riskP80DurationDays: null,
      processSeasonalDurationAssetConsumed: false,
      calendarBasis: null,
      constructionCalendarWindowCount: 0,
      durationAssetPlanDateApplied: false,
      dependencyAssetConsumed: false,
      dependencyAssetStableCode: null,
      dependencyAssetType: null,
      dependencyAssetEvidenceSourceKeys: [] as string[],
      dependencyTimingAssetConsumed: false,
      dependencyTimingSelectedLagDays: null,
      dependencyRuleSource: null,
      dependencyLayerStack: null,
      dependencyProductionWritePolicy: null,
      phaseAnchorDependencyCount: null,
      dependencyStartAnchor: false,
      dependencyAnchorType: null,
      criticalPathCandidate: false,
      totalFloatDays: null,
      earlyStartOffsetDays: null,
      earlyFinishOffsetDays: null,
      lateStartOffsetDays: null,
      lateFinishOffsetDays: null,
      projectScaleQuantityProxyApplied: false,
      candidateNetworkPlanDateApplied: false,
      businessTypeSpecialtyDurationAssetApplied: false,
      businessTypeSpecificT2RhythmTemplateApplied: false,
      durationSelectionRule: null,
      durationCalibrationSource: null,
      durationMaturity: null,
      durationReviewGate: null,
      durationTruthSource: null,
      standardWorkDurationSeedP50Days: null,
      t2RhythmTemplateP50Days: null,
      realPlanSkeletonDurationDays: null,
      realPlanSkeletonFloorApplied: null,
      maxNonSkeletonAssetDays: null,
    }
    const summary = summarizeWizardDurationAssetCandidates([
      emptyCandidate,
      {
        ...emptyCandidate,
        riskP50DurationDays: 30,
        processSeasonalDurationAssetConsumed: true,
        calendarBasis: 'construction_calendar',
        durationAssetPlanDateApplied: true,
        dependencyAssetStableCode: 'dep.seed.1',
        dependencyTimingSelectedLagDays: 2,
        criticalPathCandidate: true,
        totalFloatDays: 0,
        projectScaleQuantityProxyApplied: true,
        candidateNetworkPlanDateApplied: true,
        businessTypeSpecialtyDurationAssetApplied: true,
        businessTypeSpecificT2RhythmTemplateApplied: true,
        durationSelectionRule: 'asset_first',
      },
    ])

    expect(summary).toEqual({
      riskRangeCount: 1,
      processSeasonalAdjustmentCount: 1,
      constructionCalendarCount: 1,
      durationAssetPlanDateApplicationCount: 1,
      dependencyAssetCount: 1,
      dependencySequenceEvidenceCount: 1,
      criticalPathCandidateCount: 1,
      floatCalculatedCount: 1,
      projectScaleQuantityProxyCount: 1,
      candidateNetworkPlanDateApplicationCount: 1,
      businessTypeSpecialtyDurationAssetCount: 1,
      businessTypeSpecificT2RhythmTemplateCount: 1,
      durationSelectionBasisCount: 1,
    })
  })

  it('allocates the next generated sort order from numeric row values', () => {
    expect(resolveNextWizardGeneratedSortOrder([
      { sortOrder: 2 },
      { sortOrder: '7' },
      { sortOrder: 'invalid' },
    ])).toBe(8)
    expect(resolveNextWizardGeneratedSortOrder([])).toBeNull()
  })
})
