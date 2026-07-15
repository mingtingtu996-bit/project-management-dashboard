export type WizardExecutablePreviewSummaryRow = {
  isExecutable: boolean
  isWbsSummary: boolean
  predecessors: readonly unknown[]
  plannedStartDate: string | null
  plannedEndDate: string | null
}

export function summarizeWizardExecutablePreviewRows(rows: readonly WizardExecutablePreviewSummaryRow[]) {
  const executableRows = rows.filter((row) => row.isExecutable)
  const planWindowRows = executableRows.length > 0 ? executableRows : rows
  const starts = planWindowRows
    .map((row) => row.plannedStartDate)
    .filter((value): value is string => Boolean(value))
    .sort()
  const ends = planWindowRows
    .map((row) => row.plannedEndDate)
    .filter((value): value is string => Boolean(value))
    .sort()

  return {
    scheduleRowCount: rows.length,
    executableRowCount: executableRows.length,
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    summaryRowCount: rows.filter((row) => row.isWbsSummary).length,
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    visibleDependencyCount: rows.reduce((sum, row) => sum + row.predecessors.length, 0),
    projectStartDate: starts[0] ?? null,
    projectEndDate: ends.at(-1) ?? null,
  }
}

export type WizardDurationAssetCandidateSummaryRow = {
  riskP20DurationDays: number | null
  riskP50DurationDays: number | null
  riskP80DurationDays: number | null
  processSeasonalDurationAssetConsumed: boolean
  calendarBasis: string | null
  constructionCalendarWindowCount: number
  durationAssetPlanDateApplied: boolean
  dependencyAssetConsumed: boolean
  dependencyAssetStableCode: string | null
  dependencyAssetType: string | null
  dependencyAssetEvidenceSourceKeys: readonly string[]
  dependencyTimingAssetConsumed: boolean
  dependencyTimingSelectedLagDays: number | null
  dependencyRuleSource: string | null
  dependencyLayerStack: string | null
  dependencyProductionWritePolicy: string | null
  phaseAnchorDependencyCount: number | null
  dependencyStartAnchor: boolean
  dependencyAnchorType: string | null
  criticalPathCandidate: boolean
  totalFloatDays: number | null
  earlyStartOffsetDays: number | null
  earlyFinishOffsetDays: number | null
  lateStartOffsetDays: number | null
  lateFinishOffsetDays: number | null
  projectScaleQuantityProxyApplied: boolean
  candidateNetworkPlanDateApplied: boolean
  businessTypeSpecialtyDurationAssetApplied: boolean
  businessTypeSpecificT2RhythmTemplateApplied: boolean
  durationSelectionRule: string | null
  durationCalibrationSource: string | null
  durationMaturity: string | null
  durationReviewGate: string | null
  durationTruthSource: string | null
  standardWorkDurationSeedP50Days: number | null
  t2RhythmTemplateP50Days: number | null
  realPlanSkeletonDurationDays: number | null
  realPlanSkeletonFloorApplied: boolean | null
  maxNonSkeletonAssetDays: number | null
}

export function summarizeWizardDurationAssetCandidates(
  candidates: readonly WizardDurationAssetCandidateSummaryRow[],
) {
  return {
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    riskRangeCount: candidates.filter((candidate) => (
      candidate.riskP20DurationDays !== null
      || candidate.riskP50DurationDays !== null
      || candidate.riskP80DurationDays !== null
    )).length,
    processSeasonalAdjustmentCount: candidates.filter((candidate) => (
      candidate.processSeasonalDurationAssetConsumed
    )).length,
    constructionCalendarCount: candidates.filter((candidate) => (
      (candidate.calendarBasis !== null && candidate.calendarBasis !== 'calendar_day')
      || candidate.constructionCalendarWindowCount > 0
    )).length,
    durationAssetPlanDateApplicationCount: candidates.filter((candidate) => (
      candidate.durationAssetPlanDateApplied
    )).length,
    dependencyAssetCount: candidates.filter((candidate) => (
      candidate.dependencyAssetConsumed
      || Boolean(candidate.dependencyAssetStableCode)
      || Boolean(candidate.dependencyAssetType)
      || candidate.dependencyAssetEvidenceSourceKeys.length > 0
    )).length,
    dependencySequenceEvidenceCount: candidates.filter((candidate) => (
      candidate.dependencyAssetConsumed
      || Boolean(candidate.dependencyAssetStableCode)
      || Boolean(candidate.dependencyAssetType)
      || candidate.dependencyAssetEvidenceSourceKeys.length > 0
      || candidate.dependencyTimingAssetConsumed
      || candidate.dependencyTimingSelectedLagDays !== null
      || Boolean(candidate.dependencyRuleSource)
      || Boolean(candidate.dependencyLayerStack)
      || Boolean(candidate.dependencyProductionWritePolicy)
      || candidate.phaseAnchorDependencyCount !== null
      || candidate.dependencyStartAnchor
      || Boolean(candidate.dependencyAnchorType)
    )).length,
    // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
    criticalPathCandidateCount: candidates.filter((candidate) => candidate.criticalPathCandidate).length,
    floatCalculatedCount: candidates.filter((candidate) => (
      candidate.totalFloatDays !== null
      || candidate.earlyStartOffsetDays !== null
      || candidate.earlyFinishOffsetDays !== null
      || candidate.lateStartOffsetDays !== null
      || candidate.lateFinishOffsetDays !== null
    )).length,
    projectScaleQuantityProxyCount: candidates.filter((candidate) => (
      candidate.projectScaleQuantityProxyApplied
    )).length,
    candidateNetworkPlanDateApplicationCount: candidates.filter((candidate) => (
      candidate.candidateNetworkPlanDateApplied
    )).length,
    businessTypeSpecialtyDurationAssetCount: candidates.filter((candidate) => (
      candidate.businessTypeSpecialtyDurationAssetApplied
    )).length,
    businessTypeSpecificT2RhythmTemplateCount: candidates.filter((candidate) => (
      candidate.businessTypeSpecificT2RhythmTemplateApplied
    )).length,
    durationSelectionBasisCount: candidates.filter((candidate) => (
      Boolean(candidate.durationSelectionRule)
      || Boolean(candidate.durationCalibrationSource)
      || Boolean(candidate.durationMaturity)
      || Boolean(candidate.durationReviewGate)
      || Boolean(candidate.durationTruthSource)
      || candidate.standardWorkDurationSeedP50Days !== null
      || candidate.t2RhythmTemplateP50Days !== null
      || candidate.realPlanSkeletonDurationDays !== null
      || candidate.realPlanSkeletonFloorApplied !== null
      || candidate.maxNonSkeletonAssetDays !== null
    )).length,
  }
}

function readNumericValue(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveNextWizardGeneratedSortOrder(rows: readonly { sortOrder?: unknown }[]) {
  // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
  const maxSortOrder = rows.reduce((max, row) => Math.max(max, readNumericValue(row.sortOrder) ?? 0), 0)
  return maxSortOrder > 0 ? maxSortOrder + 1 : null
}
