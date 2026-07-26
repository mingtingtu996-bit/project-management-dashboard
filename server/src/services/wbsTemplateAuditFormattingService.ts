import {
isDurationBearingContributionMode
} from '../seeds/durationContributionMode.js'
import {
inclusivePlanDuration as daysInclusive
} from './wbsPlanRollupService.js'
import {
type DefaultMasterPlanAssetConsumptionResult
} from './defaultMasterPlanAssetConsumptionService.js'

import {
normalizeText,
readGeneratedDurationSuggestion,
readOptionalNumber,
readPlanReferenceDurationNumber,
readPositiveNumber,
readRecord,
uniqueStringArray,
} from './wbsTemplateGenerationFoundation.js'
import type {
BusinessTypeDurationAssetCoverageAccumulator,
GeneratedBusinessTypeDurationAssetCoverage,
GeneratedDurationAssetUtilizationSummary,
GeneratedMasterPlanProfile,
GeneratedTemplateDependency,
GeneratedTemplateGovernanceWarning,
GeneratedTemplateRow,
} from './wbsTemplateGenerationFoundation.js'
import {
syncGeneratedRowDurationOutput,
} from './wbsTemplateOutputProjectionService.js'
import {
comparePlanDates,
getRowDurationContributionMode,
getRowProjectionMode,
readGeneratedRowPlanEnd,
readGeneratedRowPlanStart,
readRowMetadata,
readRowStableCode,
} from './wbsTemplateDependencyCandidateService.js'
import {
BUSINESS_TYPE_SPECIALTY_DURATION_ASSETS,
findT2RhythmTemplate,
} from './wbsTemplateAssetStrategyService.js'



export function sortGeneratedRowsBySchedule(rows: GeneratedTemplateRow[]) {
  rows.sort((left, right) => {
    const byStart = comparePlanDates(readGeneratedRowPlanStart(left), readGeneratedRowPlanStart(right))
    if (byStart) return byStart
    const byExecutionSort = Number(left.values.execution_sort_key ?? left.executionSortKey ?? 0)
      - Number(right.values.execution_sort_key ?? right.executionSortKey ?? 0)
    if (byExecutionSort) return byExecutionSort
    const byOriginalSort = left.sortOrder - right.sortOrder
    if (byOriginalSort) return byOriginalSort
    return readRowStableCode(left).localeCompare(readRowStableCode(right), 'zh-Hans-CN')
  })
  rows.forEach((row, index) => {
    row.sortOrder = index
    row.values = {
      ...row.values,
      sort_order: index,
    }
  })
  return rows
}



export function buildMasterPlanCompactionKey(row: GeneratedTemplateRow) {
  return [
    normalizeText(row.values.standard_work_code),
    normalizeText(row.values.title ?? row.values.name),
    normalizeText(row.values.execution_phase ?? row.executionPhase),
    normalizeText(row.values.execution_lane ?? row.executionLane),
  ].join('|')
}



export function rowIsInferredBuildingLane(row: GeneratedTemplateRow) {
  return normalizeText(row.values.building_sequence_source) === 'inferred_building_count'
    || normalizeText(row.values.building_sequence_source) === 'inferred_building_count_compacted'
    || normalizeText(row.values.organization_lane_role) === 'primary_building_lane'
    || normalizeText(row.values.organization_lane).startsWith('tower_lane_')
    || normalizeText(row.values.organization_lane).startsWith('lowrise_lane_')
}



export function remapGeneratedRowDependencies(
  row: GeneratedTemplateRow,
  replacementByClientRowId: Map<string, string>,
) {
  const rowId = row.clientRowId
  const predecessorIds = uniqueStringArray(
    row.predecessorClientRowIds
      .map((id) => replacementByClientRowId.get(id) ?? id)
      .filter((id) => id && id !== rowId),
  )
  const dependenciesByKey = new Map<string, GeneratedTemplateDependency>()
  for (const dependency of row.predecessorDependencies) {
    const clientRowId = replacementByClientRowId.get(dependency.clientRowId) ?? dependency.clientRowId
    if (!clientRowId || clientRowId === rowId) continue
    const key = [
      clientRowId,
      dependency.dependencyType,
      dependency.lagDays,
      dependency.intentCode ?? '',
      dependency.source ?? '',
    ].join('|')
    if (!dependenciesByKey.has(key)) dependenciesByKey.set(key, { ...dependency, clientRowId })
  }
  row.predecessorClientRowIds = predecessorIds
  row.predecessorDependencies = [...dependenciesByKey.values()]
}



export function compactGeneratedMasterPlanInferredBuildingLanes(
  rows: GeneratedTemplateRow[],
  masterPlanProfile: GeneratedMasterPlanProfile | null,
): GeneratedTemplateGovernanceWarning | null {
  if (!masterPlanProfile) return null

  const groups = new Map<string, GeneratedTemplateRow[]>()
  for (const row of rows) {
    if (getRowProjectionMode(row) !== 'schedule_row') continue
    const key = buildMasterPlanCompactionKey(row)
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }

  const replacementByClientRowId = new Map<string, string>()
  const removedClientRowIds = new Set<string>()
  const compactedGroups: Array<{
    stableCode: string
    title: string
    keptClientRowId: string
    compactedRowCount: number
    organizationLanes: string[]
    plannedStartDate: string | null
    plannedEndDate: string | null
  }> = []

  for (const group of groups.values()) {
    if (group.length <= 1) continue
    if (!group.some(rowIsInferredBuildingLane)) continue
    const sorted = [...group].sort((left, right) => {
      const byStart = comparePlanDates(readGeneratedRowPlanStart(left), readGeneratedRowPlanStart(right))
      if (byStart) return byStart
      return left.sortOrder - right.sortOrder
    })
    const representative = sorted[0]
    const removed = sorted.slice(1)
    for (const row of removed) {
      replacementByClientRowId.set(row.clientRowId, representative.clientRowId)
      removedClientRowIds.add(row.clientRowId)
    }

    const plannedStartDate = sorted
      .map(readGeneratedRowPlanStart)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)[0] ?? readGeneratedRowPlanStart(representative)
    const plannedEndDates = sorted
      .map(readGeneratedRowPlanEnd)
      .filter((date): date is string => Boolean(date))
      .sort(comparePlanDates)
    const latestPlannedEndDate = plannedEndDates[plannedEndDates.length - 1] ?? readGeneratedRowPlanEnd(representative)
    const smartReferenceDays = plannedStartDate && latestPlannedEndDate
      ? daysInclusive(plannedStartDate, latestPlannedEndDate)
      : readPlanReferenceDurationNumber(representative.values.smart_reference_days)
    const metadata = readRowMetadata(representative)
    const organizationLanes = uniqueStringArray(sorted
      .map((row) => normalizeText(row.values.organization_lane))
      .filter(Boolean))
    const buildingSequenceNumbers = uniqueStringArray(sorted
      .map((row) => normalizeText(row.values.building_sequence_number))
      .filter(Boolean))
    const originalWindows = sorted.map((row) => ({
      clientRowId: row.clientRowId,
      organizationLane: normalizeText(row.values.organization_lane) || null,
      buildingSequenceNumber: row.values.building_sequence_number ?? null,
      plannedStartDate: readGeneratedRowPlanStart(row),
      plannedEndDate: readGeneratedRowPlanEnd(row),
      smartReferenceDays: readPlanReferenceDurationNumber(row.values.smart_reference_days),
    }))
    const compactionMetadata = {
      source: 'master_plan_inferred_building_lane_compaction',
      reasonCode: 'MASTER_PLAN_PROJECT_LEVEL_WINDOW_FOR_INFERRED_BUILDING_LANES',
      compactedRowCount: sorted.length,
      compactedOrganizationLanes: organizationLanes,
      buildingSequenceNumbers,
      originalWindows,
      mutationBoundary: masterPlanProfile.mutationBoundary,
    }
    representative.values = {
      ...representative.values,
      building_object_id: null,
      building_sequence_source: 'inferred_building_count_compacted',
      building_sequence_index: null,
      building_sequence_number: null,
      organization_lane: 'project_level_window',
      organization_lane_role: 'project_level_aggregate',
      organization_lane_index: null,
      organization_scope_group: 'master_plan_project_level_window',
      planned_start_date: plannedStartDate,
      planned_end_date: latestPlannedEndDate,
      smart_reference_days: smartReferenceDays,
      standard_task_metadata: {
        ...metadata,
        masterPlanCompaction: compactionMetadata,
      },
    }
    if (representative.durationSuggestion) {
      representative.durationSuggestion = {
        ...representative.durationSuggestion,
        planReferenceDays: smartReferenceDays ?? representative.durationSuggestion.planReferenceDays,
      }
    }
    syncGeneratedRowDurationOutput(representative)
    compactedGroups.push({
      stableCode: readRowStableCode(representative),
      title: normalizeText(representative.values.title ?? representative.values.name),
      keptClientRowId: representative.clientRowId,
      compactedRowCount: sorted.length,
      organizationLanes,
      plannedStartDate,
      plannedEndDate: latestPlannedEndDate,
    })
  }

  if (removedClientRowIds.size === 0) return null

  const keptRows = rows.filter((row) => !removedClientRowIds.has(row.clientRowId))
  for (const row of keptRows) remapGeneratedRowDependencies(row, replacementByClientRowId)
  rows.splice(0, rows.length, ...keptRows)

  return {
    code: 'MASTER_PLAN_INFERRED_BUILDING_LANE_COMPACTED',
    severity: 'warning',
    nodeCode: 'master_plan_profile',
    message: 'Inferred multi-building lanes were compacted into project-level master-plan windows; building-lane detail remains drill-down evidence instead of duplicate default Gantt rows.',
    details: {
      compactedGroupCount: compactedGroups.length,
      removedScheduleRowCount: removedClientRowIds.size,
      groups: compactedGroups.slice(0, 30),
      mutationBoundary: masterPlanProfile.mutationBoundary,
    },
  }
}



export function applyGeneratedMasterPlanProfileLimit(
  rows: GeneratedTemplateRow[],
  masterPlanProfile: GeneratedMasterPlanProfile | null,
): GeneratedTemplateGovernanceWarning | null {
  if (!masterPlanProfile) return null
  const upperLimit = masterPlanProfile.rowCountRange[1]
  if (!Number.isFinite(upperLimit) || upperLimit <= 0) return null

  const scheduleRows = rows.filter((row) => getRowProjectionMode(row) === 'schedule_row')
  if (scheduleRows.length <= upperLimit) return null

  const overflowRows = scheduleRows.slice(upperLimit)
  for (const row of overflowRows) {
    const metadata = readRowMetadata(row)
    row.rowProjectionMode = 'linked_projection'
    row.scheduleParticipation = 'read_only_projection'
    row.linkedProjectionSource = {
      source: 'master_plan_profile_row_count_limit',
      profileLayer: masterPlanProfile.layer,
      rowCountUpperLimit: upperLimit,
      originalRowProjectionMode: 'schedule_row',
    }
    row.values = {
      ...row.values,
      row_projection_mode: 'linked_projection',
      schedule_participation: 'read_only_projection',
      linked_projection_source: row.linkedProjectionSource,
      standard_task_metadata: {
        ...metadata,
        rowProjectionMode: 'linked_projection',
        row_projection_mode: 'linked_projection',
        scheduleParticipation: 'read_only_projection',
        schedule_participation: 'read_only_projection',
        linkedProjectionSource: row.linkedProjectionSource,
        masterPlanProjectionPolicy: {
          source: 'master_plan_profile_row_count_limit',
          originalRowProjectionMode: 'schedule_row',
          rowCountUpperLimit: upperLimit,
        },
      },
    }
  }

  return {
    code: 'MASTER_PLAN_ROW_COUNT_LIMIT_APPLIED',
    severity: 'warning',
    nodeCode: 'master_plan_profile',
    message: 'Master-plan profile row-count limit was applied; overflow schedule rows were retained as linked projection evidence instead of default Gantt rows.',
    details: {
      rowCountUpperLimit: upperLimit,
      originalScheduleRowCount: scheduleRows.length,
      projectedEvidenceRowCount: overflowRows.length,
      projectedEvidenceStableCodes: overflowRows.slice(0, 30).map(readRowStableCode),
      mutationBoundary: masterPlanProfile.mutationBoundary,
    },
  }
}



export function readGeneratedRowDurationAssetCalculation(row: GeneratedTemplateRow) {
  const metadata = readRecord(row.values.standard_task_metadata)
  return readRecord(metadata.durationAssetCalculation ?? row.values.duration_asset_calculation)
}



export function readGeneratedRowDurationAssetMapping(row: GeneratedTemplateRow) {
  const metadata = readRecord(row.values.standard_task_metadata)
  return readRecord(metadata.durationAssetMapping ?? row.values.duration_asset_mapping)
}



export function readTruthyGeneratedAssetFlag(value: unknown) {
  return value === true || normalizeText(value).toLowerCase() === 'true'
}



export function generatedRowConsumedOfficialConstructionCalendar(
  row: GeneratedTemplateRow,
  metadata: Record<string, unknown>,
) {
  const basis = normalizeText(row.values.calendar_basis ?? metadata.calendarBasis ?? metadata.calendar_basis)
  const windowCount = readOptionalNumber(
    row.values.construction_calendar_window_count
      ?? metadata.constructionCalendarWindowCount
      ?? metadata.construction_calendar_window_count,
  ) ?? 0
  const calendarRef = normalizeText(
    row.values.construction_calendar_ref
      ?? metadata.constructionCalendarRef
      ?? metadata.construction_calendar_ref,
  )
  const calendarVersion = normalizeText(
    row.values.construction_calendar_version
      ?? metadata.constructionCalendarVersion
      ?? metadata.construction_calendar_version,
  )
  const timezone = normalizeText(
    row.values.construction_calendar_timezone
      ?? metadata.constructionCalendarTimezone
      ?? metadata.construction_calendar_timezone,
  )
  const availability = normalizeText(
    row.values.construction_calendar_availability
      ?? metadata.constructionCalendarAvailability
      ?? metadata.construction_calendar_availability,
  )
  return basis === 'official_construction_calendar_seed'
    && windowCount > 0
    && Boolean(calendarRef && calendarVersion && timezone)
    && availability === 'available'
}



export function getBusinessTypeDurationAssetCoverageAccumulator(
  accumulators: Map<string, BusinessTypeDurationAssetCoverageAccumulator>,
  businessType: string,
) {
  const normalizedBusinessType = normalizeText(businessType)
  let accumulator = accumulators.get(normalizedBusinessType)
  if (!accumulator) {
    accumulator = {
      businessType: normalizedBusinessType,
      profileScheduleRowCount: 0,
      t2ApplicableProfileScheduleRowCount: 0,
      t2NotApplicableProfileScheduleRowCount: 0,
      profileMappedDurationAssetRowCount: 0,
      specialtyDurationAssetRowCount: 0,
      specificT2RhythmTemplateRowCount: 0,
      rowsMissingProfileDurationAssetCount: 0,
      rowsMissingSpecialtyDurationAssetCount: 0,
      rowsMissingSpecificT2RhythmTemplateCount: 0,
      activeStandardWorkDurationSeedRowCount: 0,
      fallbackStandardWorkDurationSeedRowCount: 0,
      activeT2RhythmTemplateRowCount: 0,
      fallbackT2RhythmTemplateRowCount: 0,
      standardSeedCodes: new Set<string>(),
      activeStandardSeedCodes: new Set<string>(),
      activeStandardSeedVersionIds: new Set<string>(),
      t2TemplateIds: new Set<string>(),
      activeT2TemplateIds: new Set<string>(),
      activeT2TemplateVersionIds: new Set<string>(),
    }
    accumulators.set(normalizedBusinessType, accumulator)
  }
  return accumulator
}



export function serializeBusinessTypeDurationAssetCoverage(
  accumulator: BusinessTypeDurationAssetCoverageAccumulator,
): GeneratedBusinessTypeDurationAssetCoverage {
  return {
    businessType: accumulator.businessType,
    profileScheduleRowCount: accumulator.profileScheduleRowCount,
    t2ApplicableProfileScheduleRowCount: accumulator.t2ApplicableProfileScheduleRowCount,
    t2NotApplicableProfileScheduleRowCount: accumulator.t2NotApplicableProfileScheduleRowCount,
    profileMappedDurationAssetRowCount: accumulator.profileMappedDurationAssetRowCount,
    specialtyDurationAssetRowCount: accumulator.specialtyDurationAssetRowCount,
    specificT2RhythmTemplateRowCount: accumulator.specificT2RhythmTemplateRowCount,
    rowsMissingProfileDurationAssetCount: accumulator.rowsMissingProfileDurationAssetCount,
    rowsMissingSpecialtyDurationAssetCount: accumulator.rowsMissingSpecialtyDurationAssetCount,
    rowsMissingSpecificT2RhythmTemplateCount: accumulator.rowsMissingSpecificT2RhythmTemplateCount,
    activeStandardWorkDurationSeedRowCount: accumulator.activeStandardWorkDurationSeedRowCount,
    fallbackStandardWorkDurationSeedRowCount: accumulator.fallbackStandardWorkDurationSeedRowCount,
    activeT2RhythmTemplateRowCount: accumulator.activeT2RhythmTemplateRowCount,
    fallbackT2RhythmTemplateRowCount: accumulator.fallbackT2RhythmTemplateRowCount,
    uniqueStandardWorkDurationSeedStableCodes: [...accumulator.standardSeedCodes].sort(),
    activeStandardWorkDurationSeedStableCodes: [...accumulator.activeStandardSeedCodes].sort(),
    activeStandardWorkDurationSeedVersionIds: [...accumulator.activeStandardSeedVersionIds].sort(),
    uniqueT2RhythmTemplateIds: [...accumulator.t2TemplateIds].sort(),
    activeT2RhythmTemplateIds: [...accumulator.activeT2TemplateIds].sort(),
    activeT2RhythmTemplateVersionIds: [...accumulator.activeT2TemplateVersionIds].sort(),
    productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
  }
}



export function medianPositiveInteger(values: number[]) {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right)
  if (sorted.length === 0) return 0
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}



export function buildDurationAssetUtilizationSummary(
  rows: GeneratedTemplateRow[],
  assetConsumption: DefaultMasterPlanAssetConsumptionResult,
): GeneratedDurationAssetUtilizationSummary {
  const scheduleRows = rows.filter((row) => row.rowProjectionMode === 'schedule_row')
  const durationBearingScheduleRowCount = scheduleRows.filter((row) => (
    isDurationBearingContributionMode(getRowDurationContributionMode(row))
  )).length
  const standardSeedCodes = new Set<string>()
  const activeStandardSeedCodes = new Set<string>()
  const activeStandardSeedVersionIds = new Set<string>()
  const t2TemplateIds = new Set<string>()
  const activeT2TemplateIds = new Set<string>()
  const activeT2TemplateVersionIds = new Set<string>()
  const dependencyAssetCodes = new Set<string>()
  const businessTypeProfileBusinessTypes = new Set<string>()
  const businessTypeProfileMappedDurationAssetBusinessTypes = new Set<string>()
  const businessTypeSpecialtyDurationAssetBusinessTypes = new Set<string>()
  const businessTypeSpecificT2RhythmBusinessTypes = new Set<string>()
  const businessTypeCoverageAccumulators = new Map<string, BusinessTypeDurationAssetCoverageAccumulator>()
  let standardWorkDurationSeedRowCount = 0
  let activeStandardWorkDurationSeedRowCount = 0
  let fallbackStandardWorkDurationSeedRowCount = 0
  let t2ApplicableDurationBearingScheduleRowCount = 0
  let t2NotApplicableDurationBearingScheduleRowCount = 0
  let t2RhythmTemplateRowCount = 0
  let activeT2RhythmTemplateRowCount = 0
  let fallbackT2RhythmTemplateRowCount = 0
  let projectScaleQuantityProxyRowCount = 0
  let dependencyAssetConsumedRowCount = 0
  let dependencyTimingAssetConsumedRowCount = 0
  let processSeasonalDurationAssetRowCount = 0
  let runtimeReferenceDaysRowCount = 0
  let constructionCalendarRowCount = 0
  let businessTypeProfileScheduleRowCount = 0
  let businessTypeProfileMappedDurationAssetRowCount = 0
  let businessTypeSpecialtyDurationAssetRowCount = 0
  let businessTypeSpecificT2RhythmTemplateRowCount = 0
  let businessTypeRowsMissingProfileDurationAssetCount = 0
  let businessTypeRowsMissingSpecialtyDurationAssetCount = 0
  let businessTypeRowsMissingSpecificT2RhythmTemplateCount = 0
  let rowsMissingDurationAssetCount = 0
  let rowsMissingT2RhythmTemplateCount = 0
  const durationRiskP20Days: number[] = []
  const durationRiskP50Days: number[] = []
  const durationRiskP80Days: number[] = []

  for (const row of scheduleRows) {
    const durationBearing = isDurationBearingContributionMode(getRowDurationContributionMode(row))
    const calculation = readGeneratedRowDurationAssetCalculation(row)
    const mapping = readGeneratedRowDurationAssetMapping(row)
    const metadata = readRecord(row.values.standard_task_metadata)
    const suggestion = readGeneratedDurationSuggestion(row.durationSuggestion ?? row.values.duration_suggestion)
    const riskRange = readRecord(suggestion?.durationRiskRange)
    const riskP20Days = readPositiveNumber(
      suggestion?.riskP20DurationDays
        ?? riskRange.p20Days
        ?? riskRange.p20_days,
    )
    const riskP50Days = readPositiveNumber(
      suggestion?.riskP50DurationDays
        ?? riskRange.p50Days
        ?? riskRange.p50_days,
    )
    const riskP80Days = readPositiveNumber(
      suggestion?.riskP80DurationDays
        ?? riskRange.p80Days
        ?? riskRange.p80_days,
    )
    if (riskP20Days && riskP50Days && riskP80Days) {
      durationRiskP20Days.push(riskP20Days)
      durationRiskP50Days.push(riskP50Days)
      durationRiskP80Days.push(riskP80Days)
    }
    const standardSeedCode = normalizeText(
      calculation.standardWorkDurationSeedStableCode
        ?? calculation.standard_work_duration_seed_stable_code
        ?? mapping.standardWorkDurationSeedStableCode
        ?? mapping.standard_work_duration_seed_stable_code,
    )
    const t2TemplateId = normalizeText(
      calculation.t2RhythmTemplateId
        ?? calculation.t2_rhythm_template_id
        ?? mapping.t2RhythmTemplateId
        ?? mapping.t2_rhythm_template_id,
    )
    const t2RhythmApplicability = normalizeText(
      calculation.t2RhythmApplicability
        ?? calculation.t2_rhythm_applicability
        ?? mapping.t2RhythmApplicability
        ?? mapping.t2_rhythm_applicability,
    ) || 'required_repetitive_or_workface_activity'
    const t2RhythmApplicable = t2RhythmApplicability !== 'not_applicable_one_off_activity'
    const standardSeedResolverSource = normalizeText(
      calculation.standardWorkDurationSeedResolverSource
        ?? calculation.standard_work_duration_seed_resolver_source
        ?? mapping.standardWorkDurationSeedResolverSource
        ?? mapping.standard_work_duration_seed_resolver_source,
    )
    const standardSeedResolverVersionId = normalizeText(
      calculation.standardWorkDurationSeedResolverVersionId
        ?? calculation.standard_work_duration_seed_resolver_version_id
        ?? mapping.standardWorkDurationSeedResolverVersionId
        ?? mapping.standard_work_duration_seed_resolver_version_id,
    )
    const t2ResolverSource = normalizeText(
      calculation.t2RhythmTemplateResolverSource
        ?? calculation.t2_rhythm_template_resolver_source
        ?? mapping.t2RhythmTemplateResolverSource
        ?? mapping.t2_rhythm_template_resolver_source,
    )
    const t2ResolverVersionId = normalizeText(
      calculation.t2RhythmTemplateResolverVersionId
        ?? calculation.t2_rhythm_template_resolver_version_id
        ?? mapping.t2RhythmTemplateResolverVersionId
        ?? mapping.t2_rhythm_template_resolver_version_id,
    )
    if (durationBearing && standardSeedCode) {
      standardWorkDurationSeedRowCount += 1
      standardSeedCodes.add(standardSeedCode)
      if (standardSeedResolverSource && standardSeedResolverSource !== 'ts_seed_fallback') {
        activeStandardWorkDurationSeedRowCount += 1
        activeStandardSeedCodes.add(standardSeedCode)
        if (standardSeedResolverVersionId) activeStandardSeedVersionIds.add(standardSeedResolverVersionId)
      } else {
        fallbackStandardWorkDurationSeedRowCount += 1
      }
    } else if (durationBearing) {
      rowsMissingDurationAssetCount += 1
    }
    if (durationBearing && t2RhythmApplicable) {
      t2ApplicableDurationBearingScheduleRowCount += 1
    } else if (durationBearing) {
      t2NotApplicableDurationBearingScheduleRowCount += 1
    }
    if (durationBearing && t2RhythmApplicable && t2TemplateId) {
      t2RhythmTemplateRowCount += 1
      t2TemplateIds.add(t2TemplateId)
      if (t2ResolverSource && t2ResolverSource !== 'ts_seed_fallback') {
        activeT2RhythmTemplateRowCount += 1
        activeT2TemplateIds.add(t2TemplateId)
        if (t2ResolverVersionId) activeT2TemplateVersionIds.add(t2ResolverVersionId)
      } else {
        fallbackT2RhythmTemplateRowCount += 1
      }
    } else if (durationBearing && t2RhythmApplicable) {
      rowsMissingT2RhythmTemplateCount += 1
    }

    const quantityProxy = readRecord(calculation.quantityProxy ?? calculation.quantity_proxy)
    if (normalizeText(quantityProxy.source) === 'project_scale_facts') projectScaleQuantityProxyRowCount += 1
    if (readTruthyGeneratedAssetFlag(calculation.processSeasonalDurationAssetConsumed)) processSeasonalDurationAssetRowCount += 1
    if (readTruthyGeneratedAssetFlag(calculation.runtimeReferenceDaysConsumed)) runtimeReferenceDaysRowCount += 1
    if (generatedRowConsumedOfficialConstructionCalendar(row, metadata)) constructionCalendarRowCount += 1

    const businessTypeMasterPlan = readRecord(metadata.businessTypeMasterPlan ?? metadata.business_type_master_plan)
    const businessType = normalizeText(businessTypeMasterPlan.businessType ?? businessTypeMasterPlan.business_type)
    const profileSourceType = normalizeText(businessTypeMasterPlan.profileSourceType ?? businessTypeMasterPlan.profile_source_type)
    if (businessType && profileSourceType === 'business_type_master_plan_profile_v1') {
      businessTypeProfileScheduleRowCount += 1
      businessTypeProfileBusinessTypes.add(businessType)
      const businessTypeCoverage = getBusinessTypeDurationAssetCoverageAccumulator(
        businessTypeCoverageAccumulators,
        businessType,
      )
      businessTypeCoverage.profileScheduleRowCount += 1
      if (t2RhythmApplicable) {
        businessTypeCoverage.t2ApplicableProfileScheduleRowCount += 1
      } else {
        businessTypeCoverage.t2NotApplicableProfileScheduleRowCount += 1
      }
      if (standardSeedCode) {
        businessTypeProfileMappedDurationAssetRowCount += 1
        businessTypeProfileMappedDurationAssetBusinessTypes.add(businessType)
        businessTypeCoverage.profileMappedDurationAssetRowCount += 1
        businessTypeCoverage.standardSeedCodes.add(standardSeedCode)
        if (standardSeedResolverSource && standardSeedResolverSource !== 'ts_seed_fallback') {
          businessTypeCoverage.activeStandardWorkDurationSeedRowCount += 1
          businessTypeCoverage.activeStandardSeedCodes.add(standardSeedCode)
          if (standardSeedResolverVersionId) businessTypeCoverage.activeStandardSeedVersionIds.add(standardSeedResolverVersionId)
        } else {
          businessTypeCoverage.fallbackStandardWorkDurationSeedRowCount += 1
        }
      } else {
        businessTypeRowsMissingProfileDurationAssetCount += 1
        businessTypeCoverage.rowsMissingProfileDurationAssetCount += 1
      }
      if (t2TemplateId) {
        businessTypeCoverage.t2TemplateIds.add(t2TemplateId)
        if (t2ResolverSource && t2ResolverSource !== 'ts_seed_fallback') {
          businessTypeCoverage.activeT2RhythmTemplateRowCount += 1
          businessTypeCoverage.activeT2TemplateIds.add(t2TemplateId)
          if (t2ResolverVersionId) businessTypeCoverage.activeT2TemplateVersionIds.add(t2ResolverVersionId)
        } else {
          businessTypeCoverage.fallbackT2RhythmTemplateRowCount += 1
        }
      }
      const specialtyAssets = BUSINESS_TYPE_SPECIALTY_DURATION_ASSETS[businessType] ?? []
      const specialtySeedCodes = new Set(specialtyAssets.map((asset) => normalizeText(asset.durationAssetStableCode)).filter(Boolean))
      const specialtyT2TemplateIds = new Set(specialtyAssets.map((asset) => normalizeText(asset.t2RhythmTemplateId)).filter(Boolean))
      const usesSpecialtySeed = specialtySeedCodes.has(standardSeedCode)
        || standardSeedCode.startsWith('expert_domain_')
      const businessTypeT2Prefixes = uniqueStringArray([
        `t2-${businessType}-`,
        `t2-${businessType.replace(/_/g, '-')}-`,
      ])
      const registeredT2BusinessTypeCodes = new Set(
        (findT2RhythmTemplate(t2TemplateId)?.applicability.businessTypeCodes ?? [])
          .map((code) => normalizeText(code)),
      )
      const usesSpecificT2 = specialtyT2TemplateIds.has(t2TemplateId)
        || Boolean(t2TemplateId && businessTypeT2Prefixes.some((prefix) => t2TemplateId.includes(prefix)))
        || registeredT2BusinessTypeCodes.has(businessType)
      if (usesSpecialtySeed) {
        businessTypeSpecialtyDurationAssetRowCount += 1
        businessTypeSpecialtyDurationAssetBusinessTypes.add(businessType)
        businessTypeCoverage.specialtyDurationAssetRowCount += 1
      } else {
        businessTypeRowsMissingSpecialtyDurationAssetCount += 1
        businessTypeCoverage.rowsMissingSpecialtyDurationAssetCount += 1
      }
      if (t2RhythmApplicable && usesSpecificT2) {
        businessTypeSpecificT2RhythmTemplateRowCount += 1
        businessTypeSpecificT2RhythmBusinessTypes.add(businessType)
        businessTypeCoverage.specificT2RhythmTemplateRowCount += 1
      } else if (t2RhythmApplicable) {
        businessTypeRowsMissingSpecificT2RhythmTemplateCount += 1
        businessTypeCoverage.rowsMissingSpecificT2RhythmTemplateCount += 1
      }
    }

    let rowConsumedDependencyAsset = false
    let rowConsumedDependencyTimingAsset = false
    for (const dependency of row.predecessorDependencies ?? []) {
      const dependencyRecord = dependency as unknown as Record<string, unknown>
      const evidence = readRecord(dependency.dependencyRuleEvidence ?? dependencyRecord.dependency_rule_evidence)
      if (readTruthyGeneratedAssetFlag(evidence.dependencyAssetConsumed)) {
        rowConsumedDependencyAsset = true
        const dependencyAssetCode = normalizeText(evidence.dependencyAssetStableCode ?? evidence.dependency_asset_stable_code)
        if (dependencyAssetCode) dependencyAssetCodes.add(dependencyAssetCode)
      }
      if (readTruthyGeneratedAssetFlag(evidence.dependencyTimingAssetConsumed)) rowConsumedDependencyTimingAsset = true
    }
    if (rowConsumedDependencyAsset) dependencyAssetConsumedRowCount += 1
    if (rowConsumedDependencyTimingAsset) dependencyTimingAssetConsumedRowCount += 1
  }

  return {
    source: 'default_master_plan_duration_asset_utilization_summary',
    evidenceLevel: 'system_standard_executable_plan_l1',
    mutationBoundary: 'summary_only_no_db_mutation_no_business_fact_write',
    scheduleRowCount: scheduleRows.length,
    durationBearingScheduleRowCount,
    standardWorkDurationSeedRowCount,
    systemStandardWorkDurationSeedRowCount: standardWorkDurationSeedRowCount,
    activeStandardWorkDurationSeedRowCount,
    fallbackStandardWorkDurationSeedRowCount,
    t2ApplicableDurationBearingScheduleRowCount,
    t2NotApplicableDurationBearingScheduleRowCount,
    t2RhythmTemplateRowCount,
    systemStandardT2RhythmTemplateRowCount: t2RhythmTemplateRowCount,
    activeT2RhythmTemplateRowCount,
    fallbackT2RhythmTemplateRowCount,
    projectScaleQuantityProxyRowCount,
    dependencyAssetConsumedRowCount,
    dependencyTimingAssetConsumedRowCount,
    processSeasonalDurationAssetRowCount,
    runtimeReferenceDaysRowCount,
    constructionCalendarRowCount,
    businessTypeProfileScheduleRowCount,
    businessTypeProfileMappedDurationAssetRowCount,
    businessTypeSpecialtyDurationAssetRowCount,
    businessTypeSpecificT2RhythmTemplateRowCount,
    businessTypeRowsMissingProfileDurationAssetCount,
    businessTypeRowsMissingSpecialtyDurationAssetCount,
    businessTypeRowsMissingSpecificT2RhythmTemplateCount,
    rowsMissingDurationAssetCount,
    rowsMissingT2RhythmTemplateCount,
    uniqueStandardWorkDurationSeedStableCodes: [...standardSeedCodes].sort(),
    activeStandardWorkDurationSeedStableCodes: [...activeStandardSeedCodes].sort(),
    activeStandardWorkDurationSeedVersionIds: [...activeStandardSeedVersionIds].sort(),
    uniqueT2RhythmTemplateIds: [...t2TemplateIds].sort(),
    activeT2RhythmTemplateIds: [...activeT2TemplateIds].sort(),
    activeT2RhythmTemplateVersionIds: [...activeT2TemplateVersionIds].sort(),
    uniqueDependencyAssetStableCodes: [...dependencyAssetCodes].sort(),
    businessTypeAssetCoverage: [...businessTypeCoverageAccumulators.values()]
      .map(serializeBusinessTypeDurationAssetCoverage)
      .sort((left, right) => left.businessType.localeCompare(right.businessType)),
    businessTypeProfileBusinessTypeCodes: [...businessTypeProfileBusinessTypes].sort(),
    businessTypeProfileMappedDurationAssetBusinessTypeCodes: [...businessTypeProfileMappedDurationAssetBusinessTypes].sort(),
    businessTypeSpecialtyDurationAssetBusinessTypeCodes: [...businessTypeSpecialtyDurationAssetBusinessTypes].sort(),
    businessTypeSpecificT2RhythmBusinessTypeCodes: [...businessTypeSpecificT2RhythmBusinessTypes].sort(),
    durationRiskRangeRowCount: durationRiskP50Days.length,
    durationRiskP20MinDays: durationRiskP20Days.length > 0 ? Math.min(...durationRiskP20Days) : 0,
    durationRiskP50MedianDays: medianPositiveInteger(durationRiskP50Days),
    durationRiskP80MaxDays: durationRiskP80Days.length > 0 ? Math.max(...durationRiskP80Days) : 0,
    assetConsumptionSummary: assetConsumption.summary,
    effectiveAppliedAssetReceiptCount: assetConsumption.summary.effectiveAppliedCount,
    advisoryUsedAssetReceiptCount: assetConsumption.summary.advisoryUsedCount,
    evidenceOnlyAssetReceiptCount: assetConsumption.summary.evidenceOnlyCount,
    notApplicableAssetReceiptCount: assetConsumption.summary.notApplicableCount,
    blockedByConflictAssetReceiptCount: assetConsumption.summary.blockedByConflictCount,
    durationCalibrationSource: 'standard_work_duration_seed+t2_rhythm_template+system_schedule_rules',
    calibrationPolicy: 'optional_runtime_overlay',
    productionWritePolicy: 'wizard_commit_transactional_tasks_and_dependencies',
  }
}
