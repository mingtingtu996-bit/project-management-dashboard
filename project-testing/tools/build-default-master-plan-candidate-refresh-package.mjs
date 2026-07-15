#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_PROFILE_REPORT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles', 'default-master-plan-profile-samples.json')
const DEFAULT_HYGIENE = path.join(DEFAULT_REPORT_ROOT, 'candidate-export-hygiene.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-package.json')
const REQUIRED_UNLOCK = 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH'
const BASE_PROFILE_SOURCE_TYPE = 'business_type_base_master_plan_profile_v1'
const BUSINESS_TYPE_PROFILE_SOURCE_TYPE = 'business_type_master_plan_profile_v1'
const DEPENDENCY_ANCHOR_PROFILE_SOURCE_TYPE = 'dependency_anchor_master_plan_profile_v1'

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    candidateExport: '',
    profileReport: DEFAULT_PROFILE_REPORT,
    hygiene: DEFAULT_HYGIENE,
    output: DEFAULT_OUTPUT,
    json: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }

    if (arg === '--candidate-export') {
      options.candidateExport = path.resolve(nextValue())
    } else if (arg === '--profile-report') {
      options.profileReport = path.resolve(nextValue())
    } else if (arg === '--hygiene') {
      options.hygiene = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--json') {
      options.json = true
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export async function buildDefaultMasterPlanCandidateRefreshPackage({
  candidateExport = '',
  profileReport = DEFAULT_PROFILE_REPORT,
  hygiene = DEFAULT_HYGIENE,
  output = DEFAULT_OUTPUT,
  now = new Date(),
} = {}) {
  const hygienePath = path.resolve(hygiene)
  const profileReportPath = path.resolve(profileReport)
  const outputPath = path.resolve(output)
  const hygienePayload = await readJsonIfPresent(hygienePath)
  const candidateExportPath = resolveArtifactPath(firstText(
    candidateExport,
    hygienePayload.selectedCandidateArtifact,
    hygienePayload.currentCandidate?.artifact,
  ))
  const candidatePayload = await readJsonIfPresent(candidateExportPath)
  const profilePayload = await readJsonIfPresent(profileReportPath)

  const baselineId = firstText(
    candidatePayload.baselineId,
    candidatePayload.baseline_id,
    hygienePayload.currentCandidate?.baselineId,
    hygienePayload.currentCandidate?.baseline_id,
  )
  const projectId = firstText(
    candidatePayload.projectId,
    candidatePayload.project_id,
    hygienePayload.currentCandidate?.projectId,
    hygienePayload.currentCandidate?.project_id,
  )
  const businessType = firstText(
    hygienePayload.profileComparison?.businessType,
    hygienePayload.currentCandidate?.businessType,
    hygienePayload.currentCandidate?.business_type,
    candidatePayload.businessType,
    candidatePayload.business_type,
    inferBusinessTypeFromCandidatePath(candidateExportPath),
  )
  const profile = selectProfile(profilePayload, businessType)
  const constructionCalendar = normalizeConstructionCalendarContext(
    profile?.constructionCalendar
      ?? profile?.construction_calendar
      ?? profile?.defaultPlanOutput?.constructionCalendar
      ?? profile?.default_plan_output?.construction_calendar,
  )
  const currentRows = readCandidateRows(candidatePayload).map((row, index) => normalizeCandidateRow(row, index))
  const targetRows = profile
    ? [
      ...readArray(profile.baseRows ?? profile.base_rows)
        .map((row) => ({ row, profileSourceType: BASE_PROFILE_SOURCE_TYPE })),
      ...readArray(profile.profileRows ?? profile.profile_rows)
        .map((row) => ({ row, profileSourceType: BUSINESS_TYPE_PROFILE_SOURCE_TYPE })),
      ...readArray(profile.dependencyAnchorRows ?? profile.dependency_anchor_rows)
        .map((row) => ({ row, profileSourceType: DEPENDENCY_ANCHOR_PROFILE_SOURCE_TYPE })),
    ].map((entry, index) => normalizeProfileRow(entry.row, index, businessType, entry.profileSourceType))
    : []
  const profileDurationAssetSummary = profile ? normalizeGeneratorDurationAssetUtilizationSummary(profile, targetRows) : {}
  const diff = buildDiff({ currentRows, targetRows })
  const hygieneBlockers = readArray(hygienePayload.blockers).map(text).filter(Boolean)
  const missingInputs = unique([
    !candidateExportPath ? 'candidate_export_required' : null,
    candidateExportPath && Object.keys(candidatePayload).length === 0 ? 'candidate_export_file_required' : null,
    !profileReportPath ? 'profile_report_required' : null,
    Object.keys(profilePayload).length === 0 ? 'profile_report_file_required' : null,
    !businessType ? 'business_type_required' : null,
    businessType && !profile ? 'business_type_profile_required' : null,
    !baselineId ? 'baseline_id_required' : null,
    !projectId ? 'project_id_required' : null,
  ].filter(Boolean))
  const refreshRequired = missingInputs.length === 0 && (
    hygieneBlockers.length > 0
    || diff.missingTargetRows.length > 0
    || diff.extraCurrentRows.length > 0
    || diff.codeChangedRows.length > 0
    || diff.dateOrDurationChangedRows.length > 0
    || diff.dependencyChangedRows.length > 0
    || currentRows.length !== targetRows.length
  )
  const status = missingInputs.length > 0
    ? 'blocked'
    : refreshRequired
      ? 'refresh_required'
      : 'no_refresh_required'

  const report = {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-candidate-refresh-package',
    status,
    productionReady: false,
    refreshRequired,
    baselineId,
    projectId,
    businessType,
    constructionCalendar,
    inputs: {
      candidateExport: repoRelative(candidateExportPath),
      profileReport: repoRelative(profileReportPath),
      hygiene: repoRelative(hygienePath),
    },
    currentCandidate: {
      baselineId,
      projectId,
      businessType,
      sourceVersionLabel: firstText(candidatePayload.sourceVersionLabel, candidatePayload.source_version_label),
      rowCount: readNumber(candidatePayload.rowCount ?? candidatePayload.row_count ?? currentRows.length),
      normalizedRowCount: currentRows.length,
      status: firstText(candidatePayload.status),
      artifact: repoRelative(candidateExportPath),
    },
    targetProfile: profile
      ? {
        businessType,
        scheduleRowCount: readNumber(profile.scheduleRowCount ?? profile.schedule_row_count ?? targetRows.length),
        baseRowCount: readNumber(profile.baseRowCount ?? profile.base_row_count ?? readArray(profile.baseRows ?? profile.base_rows).length),
        profileRowCount: readNumber(profile.profileRowCount ?? profile.profile_row_count ?? readArray(profile.profileRows ?? profile.profile_rows).length),
        dependencyAnchorRowCount: readNumber(
          profile.dependencyAnchorRowCount
            ?? profile.dependency_anchor_row_count
            ?? readArray(profile.dependencyAnchorRows ?? profile.dependency_anchor_rows).length,
        ),
        targetRowCount: targetRows.length,
        constructionCalendar,
        generatorDurationAssetUtilizationSummary: profileDurationAssetSummary,
      }
      : null,
    targetReplacementRows: targetRows.map(toReplacementRow),
    diff,
    hygiene: {
      status: firstText(hygienePayload.status),
      blockers: hygieneBlockers,
      profileComparisonStatus: firstText(hygienePayload.profileComparison?.status),
      profileComparisonReason: firstText(hygienePayload.profileComparison?.reason),
    },
    blockers: unique([
      ...missingInputs,
      ...hygieneBlockers,
      refreshRequired ? 'candidate_baseline_refresh_required_before_runtime_publication' : null,
    ].filter(Boolean)),
    operationPlan: {
      mode: 'full_replace_candidate_baseline_items_from_profile_report',
      executeAllowed: false,
      requiredUnlock: REQUIRED_UNLOCK,
      targetArtifactOnly: true,
      proposedExecutionCommand: [
        `set ${REQUIRED_UNLOCK}=1`,
        'then run a separately reviewed guarded writer; this package does not execute it',
      ],
      noWriteBoundary: 'Reads local candidate/profile/hygiene reports and writes refresh package files only; does not write candidate baselines, task_baseline_items, tasks, task_dependencies, duration samples, runtime publications, critical-path facts, rollback records, or production tables.',
    },
    mutationBoundary: {
      readsCandidateExport: true,
      readsProfileReport: true,
      readsCandidateHygiene: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function buildDiff({ currentRows, targetRows }) {
  const currentByIdentity = mapRowsByIdentity(currentRows)
  const targetByIdentity = mapRowsByIdentity(targetRows)
  const missingTargetRows = targetRows
    .filter((row) => !currentByIdentity.has(row.identityKey))
    .map(publicRow)
  const extraCurrentRows = currentRows
    .filter((row) => !targetByIdentity.has(row.identityKey))
    .map(publicRow)
  const codeChangedRows = []
  const dateOrDurationChangedRows = []
  const dependencyChangedRows = []

  for (const target of targetRows) {
    const current = currentByIdentity.get(target.identityKey)
    if (!current) continue
    if (current.code !== target.code) {
      codeChangedRows.push({
        fromCode: current.code,
        toCode: target.code,
        title: target.title,
        executionPhase: target.executionPhase,
        executionLane: target.executionLane,
      })
    }
    if (
      current.startDate !== target.startDate
      || current.endDate !== target.endDate
      || current.durationDays !== target.durationDays
    ) {
      dateOrDurationChangedRows.push({
        code: target.code,
        title: target.title,
        fromStartDate: current.startDate,
        toStartDate: target.startDate,
        fromEndDate: current.endDate,
        toEndDate: target.endDate,
        fromDurationDays: current.durationDays,
        toDurationDays: target.durationDays,
      })
    }
    if (!sameDependencyLineage(current, target)) {
      dependencyChangedRows.push({
        code: target.code,
        title: target.title,
        fromClientRowId: current.clientRowId || null,
        toClientRowId: target.clientRowId || null,
        fromPredecessorCount: current.predecessorDependencies.length,
        toPredecessorCount: target.predecessorDependencies.length,
      })
    }
  }

  return {
    currentRowCount: currentRows.length,
    targetRowCount: targetRows.length,
    missingTargetRows,
    extraCurrentRows,
    codeChangedRows,
    dateOrDurationChangedRows,
    dependencyChangedRows,
  }
}

function mapRowsByIdentity(rows) {
  const map = new Map()
  for (const row of rows) {
    if (!row.identityKey || map.has(row.identityKey)) continue
    map.set(row.identityKey, row)
  }
  return map
}

function normalizeCandidateRow(row, index) {
  const record = readRecord(row)
  return normalizeCommonRow({
    index,
    code: firstText(record.standardWorkCode, record.standard_work_code, record.code, record.stableCode, record.stable_code),
    title: firstText(record.title, record.name, record.standardWorkName, record.standard_work_name),
    executionPhase: firstText(record.executionPhase, record.execution_phase),
    executionLane: firstText(record.executionLane, record.execution_lane),
    startDate: firstDate(record.plannedStart, record.planned_start, record.planned_start_date, record.startDate, record.start_date),
    endDate: firstDate(record.plannedEnd, record.planned_end, record.planned_end_date, record.endDate, record.end_date),
    durationDays: readNumber(record.smartReferenceDays ?? record.smart_reference_days ?? record.durationDays ?? record.duration_days),
    profileSourceType: firstText(record.profileSourceType, record.profile_source_type, record.originalSource, record.original_source),
    businessType: firstText(record.businessType, record.business_type),
    source: firstText(record.source),
    ...normalizeDependencyLineage(record),
    ...normalizeDurationAssetLineage(record),
  })
}

function normalizeProfileRow(row, index, businessType, profileSourceTypeFallback = '') {
  const record = readRecord(row)
  return normalizeCommonRow({
    index,
    code: firstText(record.code, record.standardWorkCode, record.standard_work_code, record.stableCode, record.stable_code),
    title: firstText(record.title, record.name, record.standardWorkName, record.standard_work_name),
    executionPhase: firstText(record.executionPhase, record.execution_phase),
    executionLane: firstText(record.executionLane, record.execution_lane),
    startDate: firstDate(record.startDate, record.start_date, record.plannedStart, record.planned_start, record.planned_start_date),
    endDate: firstDate(record.endDate, record.end_date, record.plannedEnd, record.planned_end, record.planned_end_date),
    durationDays: readNumber(record.durationDays ?? record.duration_days ?? record.selectedDurationDays ?? record.selected_duration_days),
    profileSourceType: firstText(profileSourceTypeFallback, record.profileSourceType, record.profile_source_type),
    businessType,
    source: 'profile_report',
    ...normalizeDependencyLineage(record),
    ...normalizeDurationAssetLineage(record),
  })
}

function normalizeCommonRow(row) {
  const identityKey = rowWorkIdentityKey(row)
  return {
    ...row,
    identityKey,
    durationDays: readNumber(row.durationDays),
  }
}

function normalizeDependencyLineage(record) {
  const predecessorDependencies = readArray(record.predecessorDependencies ?? record.predecessor_dependencies)
    .map((dependency) => readRecord(dependency))
    .map((dependency) => ({
      clientRowId: firstText(
        dependency.clientRowId,
        dependency.client_row_id,
        dependency.predecessorClientRowId,
        dependency.predecessor_client_row_id,
      ),
      dependencyType: firstText(dependency.dependencyType, dependency.dependency_type, 'FS').toUpperCase(),
      lagDays: readOptionalNumber(dependency.lagDays ?? dependency.lag_days) ?? 0,
      intentCode: firstText(dependency.intentCode, dependency.intent_code, dependency.intent),
    }))
    .filter((dependency) => dependency.clientRowId)

  return {
    clientRowId: firstText(record.clientRowId, record.client_row_id),
    predecessorDependencies,
  }
}

function dependencyLineageForOutput(row) {
  return omitUndefined({
    clientRowId: optionalText(row.clientRowId),
    predecessorDependencies: row.predecessorDependencies.length > 0 ? row.predecessorDependencies : undefined,
  })
}

function sameDependencyLineage(left, right) {
  return JSON.stringify(canonicalDependencyLineage(left)) === JSON.stringify(canonicalDependencyLineage(right))
}

function canonicalDependencyLineage(row) {
  return {
    clientRowId: text(row.clientRowId),
    predecessorDependencies: readArray(row.predecessorDependencies)
      .map((dependency) => ({
        clientRowId: text(dependency.clientRowId),
        dependencyType: text(dependency.dependencyType).toUpperCase() || 'FS',
        lagDays: readOptionalNumber(dependency.lagDays) ?? 0,
        intentCode: text(dependency.intentCode),
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  }
}

function toReplacementRow(row) {
  return {
    index: row.index + 1,
    code: row.code,
    title: row.title,
    executionPhase: row.executionPhase,
    executionLane: row.executionLane,
    startDate: row.startDate,
    endDate: row.endDate,
    durationDays: row.durationDays,
    profileSourceType: row.profileSourceType,
    businessType: row.businessType,
    ...dependencyLineageForOutput(row),
    ...durationAssetLineageForOutput(row),
    source: 'candidate_refresh_package_from_profile_report',
    candidateOnly: true,
    writesTasks: false,
    writesTaskDependencies: false,
    writesProductionDependencies: false,
    writesRuntimePublication: false,
  }
}

function publicRow(row) {
  return {
    code: row.code,
    title: row.title,
    executionPhase: row.executionPhase,
    executionLane: row.executionLane,
    startDate: row.startDate,
    endDate: row.endDate,
    durationDays: row.durationDays,
    profileSourceType: row.profileSourceType,
    businessType: row.businessType,
    ...dependencyLineageForOutput(row),
    ...durationAssetLineageForOutput(row),
  }
}

function normalizeDurationAssetLineage(record) {
  return {
    durationAssetStableCode: firstText(record.durationAssetStableCode, record.duration_asset_stable_code),
    t2RhythmTemplateId: firstText(record.t2RhythmTemplateId, record.t2_rhythm_template_id),
    selectedDurationDays: readOptionalNumber(record.selectedDurationDays ?? record.selected_duration_days),
    standardWorkDurationSeedResolverSource: firstText(record.standardWorkDurationSeedResolverSource, record.standard_work_duration_seed_resolver_source),
    standardWorkDurationSeedResolverVersionId: firstText(record.standardWorkDurationSeedResolverVersionId, record.standard_work_duration_seed_resolver_version_id),
    standardWorkDurationSeedP50Days: readOptionalNumber(record.standardWorkDurationSeedP50Days ?? record.standard_work_duration_seed_p50_days),
    t2RhythmTemplateP50Days: readOptionalNumber(record.t2RhythmTemplateP50Days ?? record.t2_rhythm_template_p50_days),
    riskP20DurationDays: readOptionalNumber(record.riskP20DurationDays ?? record.risk_p20_duration_days),
    riskP50DurationDays: readOptionalNumber(record.riskP50DurationDays ?? record.risk_p50_duration_days),
    riskP80DurationDays: readOptionalNumber(record.riskP80DurationDays ?? record.risk_p80_duration_days),
    durationRiskRange: normalizeDurationRiskRange(record.durationRiskRange ?? record.duration_risk_range),
    runtimeReferenceDaysConsumed: readOptionalBoolean(record.runtimeReferenceDaysConsumed ?? record.runtime_reference_days_consumed),
    runtimeReferenceDaysEvidenceLevel: firstText(record.runtimeReferenceDaysEvidenceLevel, record.runtime_reference_days_evidence_level),
    runtimeReferenceDaysP50Days: readOptionalNumber(record.runtimeReferenceDaysP50Days ?? record.runtime_reference_days_p50_days),
    runtimeReferenceDaysP80Days: readOptionalNumber(record.runtimeReferenceDaysP80Days ?? record.runtime_reference_days_p80_days),
    runtimeReferenceDaysSampleCount: readOptionalNumber(record.runtimeReferenceDaysSampleCount ?? record.runtime_reference_days_sample_count),
    runtimeReferenceDaysSource: firstText(record.runtimeReferenceDaysSource, record.runtime_reference_days_source),
    quantityProxySource: firstText(record.quantityProxySource, record.quantity_proxy_source),
    quantityProxyValue: readOptionalNumber(record.quantityProxyValue ?? record.quantity_proxy_value),
    quantityProxyUnit: firstText(record.quantityProxyUnit, record.quantity_proxy_unit),
    quantityProxyBasis: firstText(record.quantityProxyBasis, record.quantity_proxy_basis),
    standardWorkDurationSeedProductivityP50PerDay: readOptionalNumber(record.standardWorkDurationSeedProductivityP50PerDay ?? record.standard_work_duration_seed_productivity_p50_per_day),
    productivityDerivedDurationDays: readOptionalNumber(record.productivityDerivedDurationDays ?? record.productivity_derived_duration_days),
    selectionRule: firstText(record.selectionRule, record.selection_rule),
    dependencyRuleSource: firstText(record.dependencyRuleSource, record.dependency_rule_source),
    dependencyAssetConsumed: readOptionalBoolean(record.dependencyAssetConsumed ?? record.dependency_asset_consumed),
    dependencyAssetStableCode: firstText(record.dependencyAssetStableCode, record.dependency_asset_stable_code),
    dependencyTimingAssetConsumed: readOptionalBoolean(record.dependencyTimingAssetConsumed ?? record.dependency_timing_asset_consumed),
    dependencyTimingSelectedLagDays: readOptionalNumber(record.dependencyTimingSelectedLagDays ?? record.dependency_timing_selected_lag_days),
    dependencyRuleLayerStack: firstText(record.dependencyRuleLayerStack, record.dependency_rule_layer_stack),
    dependencyProductionWritePolicy: firstText(record.dependencyProductionWritePolicy, record.dependency_production_write_policy),
    processSeasonalDurationAssetConsumed: readOptionalBoolean(record.processSeasonalDurationAssetConsumed ?? record.process_seasonal_duration_asset_consumed),
    processSeasonalMultiplier: readOptionalNumber(record.processSeasonalMultiplier ?? record.process_seasonal_multiplier),
    processSeasonalSource: firstText(record.processSeasonalSource, record.process_seasonal_source),
    calendarBasis: firstText(record.calendarBasis, record.calendar_basis),
    constructionCalendarWindowCount: readOptionalNumber(record.constructionCalendarWindowCount ?? record.construction_calendar_window_count),
    durationCalibrationSource: firstText(record.durationCalibrationSource, record.duration_calibration_source),
    durationMaturity: firstText(record.durationMaturity, record.duration_maturity),
    durationReviewGate: firstText(record.durationReviewGate, record.duration_review_gate),
    durationReviewRequired: readOptionalBoolean(record.durationReviewRequired ?? record.duration_review_required),
    durationTruthSource: firstText(record.durationTruthSource, record.duration_truth_source),
    phaseAnchorDependencyCount: readOptionalNumber(record.phaseAnchorDependencyCount ?? record.phase_anchor_dependency_count),
    totalFloatDays: readOptionalNumber(record.totalFloatDays ?? record.total_float_days),
    criticalPathCandidate: readOptionalBoolean(record.criticalPathCandidate ?? record.critical_path_candidate),
    earlyStartOffsetDays: readOptionalNumber(record.earlyStartOffsetDays ?? record.early_start_offset_days),
    earlyFinishOffsetDays: readOptionalNumber(record.earlyFinishOffsetDays ?? record.early_finish_offset_days),
    lateStartOffsetDays: readOptionalNumber(record.lateStartOffsetDays ?? record.late_start_offset_days),
    lateFinishOffsetDays: readOptionalNumber(record.lateFinishOffsetDays ?? record.late_finish_offset_days),
  }
}

function durationAssetLineageForOutput(row) {
  return omitUndefined({
    durationAssetStableCode: optionalText(row.durationAssetStableCode),
    t2RhythmTemplateId: optionalText(row.t2RhythmTemplateId),
    selectedDurationDays: row.selectedDurationDays,
    standardWorkDurationSeedResolverSource: optionalText(row.standardWorkDurationSeedResolverSource),
    standardWorkDurationSeedResolverVersionId: optionalText(row.standardWorkDurationSeedResolverVersionId),
    standardWorkDurationSeedP50Days: row.standardWorkDurationSeedP50Days,
    t2RhythmTemplateP50Days: row.t2RhythmTemplateP50Days,
    riskP20DurationDays: row.riskP20DurationDays,
    riskP50DurationDays: row.riskP50DurationDays,
    riskP80DurationDays: row.riskP80DurationDays,
    durationRiskRange: row.durationRiskRange,
    runtimeReferenceDaysConsumed: row.runtimeReferenceDaysConsumed,
    runtimeReferenceDaysEvidenceLevel: optionalText(row.runtimeReferenceDaysEvidenceLevel),
    runtimeReferenceDaysP50Days: row.runtimeReferenceDaysP50Days,
    runtimeReferenceDaysP80Days: row.runtimeReferenceDaysP80Days,
    runtimeReferenceDaysSampleCount: row.runtimeReferenceDaysSampleCount,
    runtimeReferenceDaysSource: optionalText(row.runtimeReferenceDaysSource),
    quantityProxySource: optionalText(row.quantityProxySource),
    quantityProxyValue: row.quantityProxyValue,
    quantityProxyUnit: optionalText(row.quantityProxyUnit),
    quantityProxyBasis: optionalText(row.quantityProxyBasis),
    standardWorkDurationSeedProductivityP50PerDay: row.standardWorkDurationSeedProductivityP50PerDay,
    productivityDerivedDurationDays: row.productivityDerivedDurationDays,
    selectionRule: optionalText(row.selectionRule),
    dependencyRuleSource: optionalText(row.dependencyRuleSource),
    dependencyAssetConsumed: row.dependencyAssetConsumed,
    dependencyAssetStableCode: optionalText(row.dependencyAssetStableCode),
    dependencyTimingAssetConsumed: row.dependencyTimingAssetConsumed,
    dependencyTimingSelectedLagDays: row.dependencyTimingSelectedLagDays,
    dependencyRuleLayerStack: optionalText(row.dependencyRuleLayerStack),
    dependencyProductionWritePolicy: optionalText(row.dependencyProductionWritePolicy),
    processSeasonalDurationAssetConsumed: row.processSeasonalDurationAssetConsumed,
    processSeasonalMultiplier: row.processSeasonalMultiplier,
    processSeasonalSource: optionalText(row.processSeasonalSource),
    calendarBasis: optionalText(row.calendarBasis),
    constructionCalendarWindowCount: row.constructionCalendarWindowCount,
    durationCalibrationSource: optionalText(row.durationCalibrationSource),
    durationMaturity: optionalText(row.durationMaturity),
    durationReviewGate: optionalText(row.durationReviewGate),
    durationReviewRequired: row.durationReviewRequired,
    durationTruthSource: optionalText(row.durationTruthSource),
    phaseAnchorDependencyCount: row.phaseAnchorDependencyCount,
    totalFloatDays: row.totalFloatDays,
    criticalPathCandidate: row.criticalPathCandidate,
    earlyStartOffsetDays: row.earlyStartOffsetDays,
    earlyFinishOffsetDays: row.earlyFinishOffsetDays,
    lateStartOffsetDays: row.lateStartOffsetDays,
    lateFinishOffsetDays: row.lateFinishOffsetDays,
  })
}

function selectProfile(profilePayload, businessType) {
  const businessTypes = readArray(profilePayload.businessTypes ?? profilePayload.business_types)
  if (!businessType) return null
  return businessTypes.find((profile) => firstText(profile.businessType, profile.business_type) === businessType) ?? null
}

function readCandidateRows(payload) {
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

async function readJsonIfPresent(filePath) {
  if (!filePath) return {}
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Candidate Refresh Package',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Production ready: ${report.productionReady ? 'yes' : 'no'}`,
    `Refresh required: ${report.refreshRequired ? 'yes' : 'no'}`,
    `Baseline: ${report.baselineId || '-'}`,
    `Project: ${report.projectId || '-'}`,
    `Business type: ${report.businessType || '-'}`,
    '',
    '## Diff',
    '',
    `- current rows: ${report.diff.currentRowCount}`,
    `- target rows: ${report.diff.targetRowCount}`,
    `- missing target rows: ${report.diff.missingTargetRows.length}`,
    `- extra current rows: ${report.diff.extraCurrentRows.length}`,
    `- code changed rows: ${report.diff.codeChangedRows.length}`,
    `- date/duration changed rows: ${report.diff.dateOrDurationChangedRows.length}`,
    '',
    '## Missing Target Rows',
    '',
  ]

  if (report.diff.missingTargetRows.length === 0) {
    lines.push('- none')
  } else {
    for (const row of report.diff.missingTargetRows) {
      lines.push(`- ${row.code || '-'} ${row.title || '-'} (${row.executionPhase || '-'} / ${row.executionLane || '-'})`)
    }
  }

  lines.push('', '## Code Changes', '')
  if (report.diff.codeChangedRows.length === 0) {
    lines.push('- none')
  } else {
    for (const row of report.diff.codeChangedRows) {
      lines.push(`- ${row.fromCode || '-'} -> ${row.toCode || '-'} ${row.title || '-'}`)
    }
  }

  lines.push('', '## Blockers', '')
  if (report.blockers.length === 0) {
    lines.push('- none')
  } else {
    report.blockers.forEach((blocker) => lines.push(`- ${blocker}`))
  }

  lines.push(
    '',
    '## Operation Plan',
    '',
    `- mode: ${report.operationPlan.mode}`,
    `- executeAllowed: ${report.operationPlan.executeAllowed}`,
    `- requiredUnlock: ${report.operationPlan.requiredUnlock}`,
    '',
    'Mutation boundary: reads candidate/profile/hygiene reports and writes this local package only; it does not write candidate baselines, task_baseline_items, tasks, task_dependencies, runtime publication, rollback, or production tables.',
    '',
  )
  return lines.join('\n')
}

function resolveArtifactPath(filePath) {
  const normalized = text(filePath)
  if (!normalized) return ''
  return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(REPO_ROOT, normalized)
}

function inferBusinessTypeFromCandidatePath(filePath) {
  const fileName = path.basename(text(filePath))
  const match = /^candidate-baseline-.+-([a-z_]+)-items\.json$/i.exec(fileName)
  return match?.[1] ?? ''
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function rowWorkIdentityKey(row) {
  const phase = comparableText(row.executionPhase)
  const lane = comparableText(row.executionLane)
  const title = comparableText(row.title)
  if (!phase || !lane || !title) return ''
  return [phase, lane, title].join('|')
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function normalizeGeneratorDurationAssetUtilizationSummary(profile = {}, targetRows = []) {
  const existing = readRecord(
    profile.generatorDurationAssetUtilizationSummary
      ?? profile.generator_duration_asset_utilization_summary
      ?? profile.durationAssetUtilizationSummary
      ?? profile.duration_asset_utilization_summary,
  )
  if (Object.keys(existing).length > 0) return existing
  const rows = readArray(targetRows)
  const scheduleRowCount = readNumber(profile.scheduleRowCount ?? profile.schedule_row_count ?? rows.length)
  const standardWorkDurationSeedRowCount = firstPositiveNumber(
    profile.standardWorkDurationSeedRowCount,
    profile.standard_work_duration_seed_row_count,
    profile.durationAssetRowCount,
    profile.duration_asset_row_count,
    rows.filter((row) => text(row.durationAssetStableCode ?? row.duration_asset_stable_code)).length,
  )
  const t2RhythmTemplateRowCount = firstPositiveNumber(
    profile.t2RhythmTemplateRowCount,
    profile.t2_rhythm_template_row_count,
    rows.filter((row) => text(row.t2RhythmTemplateId ?? row.t2_rhythm_template_id)).length,
  )
  const projectScaleQuantityProxyRowCount = firstPositiveNumber(
    profile.projectScaleQuantityProxyRowCount,
    profile.project_scale_quantity_proxy_row_count,
    profile.quantityOrProductivityRowCount,
    profile.quantity_or_productivity_row_count,
    rows.filter((row) => text(row.quantityProxySource ?? row.quantity_proxy_source)).length,
  )
  const dependencyAssetConsumedRowCount = firstPositiveNumber(
    profile.dependencyAssetConsumedRowCount,
    profile.dependency_asset_consumed_row_count,
    profile.profileDependencyEvidenceRowCount,
    profile.profile_dependency_evidence_row_count,
    rows.filter((row) => text(row.dependencyRuleSource ?? row.dependency_rule_source)).length,
  )
  const dependencyTimingAssetConsumedRowCount = firstPositiveNumber(
    profile.dependencyTimingAssetConsumedRowCount,
    profile.dependency_timing_asset_consumed_row_count,
    rows.filter((row) => readOptionalBoolean(row.dependencyTimingAssetConsumed ?? row.dependency_timing_asset_consumed) === true).length,
  )
  const processSeasonalDurationAssetRowCount = firstPositiveNumber(
    profile.processSeasonalDurationAssetRowCount,
    profile.process_seasonal_duration_asset_row_count,
    rows.filter((row) => readOptionalBoolean(row.processSeasonalDurationAssetConsumed ?? row.process_seasonal_duration_asset_consumed) === true).length,
  )
  const constructionCalendarRowCount = firstPositiveNumber(
    profile.constructionCalendarRowCount,
    profile.construction_calendar_row_count,
    rows.filter((row) => text(row.calendarBasis ?? row.calendar_basis)).length,
  )
  const businessTypeProfileScheduleRowCount = firstPositiveNumber(
    profile.businessTypeProfileScheduleRowCount,
    profile.business_type_profile_schedule_row_count,
    rows.filter((row) => text(row.profileSourceType ?? row.profile_source_type) === BUSINESS_TYPE_PROFILE_SOURCE_TYPE).length,
  )
  const businessTypeSpecialtyDurationAssetRowCount = firstPositiveNumber(
    profile.businessTypeSpecialtyDurationAssetRowCount,
    profile.business_type_specialty_duration_asset_row_count,
  )
  const businessTypeSpecificT2RhythmTemplateRowCount = firstPositiveNumber(
    profile.businessTypeSpecificT2RhythmTemplateRowCount,
    profile.business_type_specific_t2_rhythm_template_row_count,
  )
  const businessTypeRowsMissingSpecialtyDurationAssetCount = readNumber(
    profile.businessTypeRowsMissingSpecialtyDurationAssetCount
      ?? profile.business_type_rows_missing_specialty_duration_asset_count,
  )
  const businessTypeRowsMissingSpecificT2RhythmTemplateCount = readNumber(
    profile.businessTypeRowsMissingSpecificT2RhythmTemplateCount
      ?? profile.business_type_rows_missing_specific_t2_rhythm_template_count,
  )
  const runtimeReferenceDaysConsumedRowCount = readNumber(
    profile.runtimeReferenceDaysConsumedRowCount
      ?? profile.runtime_reference_days_consumed_row_count
      ?? profile.runtimeReferenceDaysConsumedCount
      ?? profile.runtime_reference_days_consumed_count,
  )
  const rowsMissingRuntimeReferenceDaysCount = readNumber(
    profile.rowsMissingRuntimeReferenceDaysCount
      ?? profile.rows_missing_runtime_reference_days_count
      ?? profile.runtimeReferenceDaysMissingCount
      ?? profile.runtime_reference_days_missing_count,
  )
  const durationRiskRangeRowCount = readNumber(
    profile.durationRiskRangeRowCount
      ?? profile.duration_risk_range_row_count,
  )
  const durationRiskP20MinDays = readNumber(
    profile.durationRiskP20MinDays
      ?? profile.duration_risk_p20_min_days,
  )
  const durationRiskP50MedianDays = readNumber(
    profile.durationRiskP50MedianDays
      ?? profile.duration_risk_p50_median_days,
  )
  const durationRiskP80MaxDays = readNumber(
    profile.durationRiskP80MaxDays
      ?? profile.duration_risk_p80_max_days,
  )
  const activeStandardWorkDurationSeedRowCount = readNumber(
    profile.activeStandardWorkDurationSeedRowCount
      ?? profile.active_standard_work_duration_seed_row_count,
  )
  const fallbackStandardWorkDurationSeedRowCount = readNumber(
    profile.fallbackStandardWorkDurationSeedRowCount
      ?? profile.fallback_standard_work_duration_seed_row_count,
  )
  const activeT2RhythmTemplateRowCount = readNumber(
    profile.activeT2RhythmTemplateRowCount
      ?? profile.active_t2_rhythm_template_row_count,
  )
  const fallbackT2RhythmTemplateRowCount = readNumber(
    profile.fallbackT2RhythmTemplateRowCount
      ?? profile.fallback_t2_rhythm_template_row_count,
  )
  const uniqueStandardWorkDurationSeedStableCodes = readTextArray(
    profile.uniqueStandardWorkDurationSeedStableCodes
      ?? profile.unique_standard_work_duration_seed_stable_codes,
  )
  const uniqueT2RhythmTemplateIds = readTextArray(
    profile.uniqueT2RhythmTemplateIds
      ?? profile.unique_t2_rhythm_template_ids,
  )
  return {
    source: 'profile_duration_asset_count_fields',
    evidenceLevel: 'candidate_duration_asset_utilization_l1',
    mutationBoundary: 'summary_only_no_db_mutation_no_runtime_no_business_fact_write',
    scheduleRowCount,
    standardWorkDurationSeedRowCount,
    t2RhythmTemplateRowCount,
    projectScaleQuantityProxyRowCount,
    dependencyAssetConsumedRowCount,
    dependencyTimingAssetConsumedRowCount,
    processSeasonalDurationAssetRowCount,
    runtimeReferenceDaysConsumedRowCount,
    constructionCalendarRowCount,
    businessTypeProfileScheduleRowCount,
    businessTypeSpecialtyDurationAssetRowCount,
    businessTypeSpecificT2RhythmTemplateRowCount,
    businessTypeRowsMissingSpecialtyDurationAssetCount,
    businessTypeRowsMissingSpecificT2RhythmTemplateCount,
    rowsMissingDurationAssetCount: Math.max(0, scheduleRowCount - standardWorkDurationSeedRowCount),
    rowsMissingT2RhythmTemplateCount: Math.max(0, scheduleRowCount - t2RhythmTemplateRowCount),
    rowsMissingRuntimeReferenceDaysCount,
    durationRiskRangeRowCount,
    durationRiskP20MinDays,
    durationRiskP50MedianDays,
    durationRiskP80MaxDays,
    businessTypeAssetCoverage: buildFallbackBusinessTypeAssetCoverage({
      businessType: firstText(profile.businessType, profile.business_type),
      profileScheduleRowCount: businessTypeProfileScheduleRowCount,
      specialtyDurationAssetRowCount: businessTypeSpecialtyDurationAssetRowCount,
      specificT2RhythmTemplateRowCount: businessTypeSpecificT2RhythmTemplateRowCount,
      rowsMissingSpecialtyDurationAssetCount: businessTypeRowsMissingSpecialtyDurationAssetCount,
      rowsMissingSpecificT2RhythmTemplateCount: businessTypeRowsMissingSpecificT2RhythmTemplateCount,
      activeStandardWorkDurationSeedRowCount,
      fallbackStandardWorkDurationSeedRowCount,
      activeT2RhythmTemplateRowCount,
      fallbackT2RhythmTemplateRowCount,
      uniqueStandardWorkDurationSeedStableCodes,
      uniqueT2RhythmTemplateIds,
    }),
    businessTypeProfileBusinessTypeCodes: readTextArray(
      profile.businessTypeProfileBusinessTypeCodes
        ?? profile.business_type_profile_business_type_codes,
    ),
    businessTypeSpecialtyDurationAssetBusinessTypeCodes: readTextArray(
      profile.businessTypeSpecialtyDurationAssetBusinessTypeCodes
        ?? profile.business_type_specialty_duration_asset_business_type_codes,
    ),
    businessTypeSpecificT2RhythmBusinessTypeCodes: readTextArray(
      profile.businessTypeSpecificT2RhythmBusinessTypeCodes
        ?? profile.business_type_specific_t2_rhythm_business_type_codes,
    ),
  }
}

function buildFallbackBusinessTypeAssetCoverage(input) {
  if (!input.businessType || input.profileScheduleRowCount <= 0) return []
  return [{
    businessType: input.businessType,
    profileScheduleRowCount: input.profileScheduleRowCount,
    specialtyDurationAssetRowCount: input.specialtyDurationAssetRowCount,
    specificT2RhythmTemplateRowCount: input.specificT2RhythmTemplateRowCount,
    rowsMissingSpecialtyDurationAssetCount: input.rowsMissingSpecialtyDurationAssetCount,
    rowsMissingSpecificT2RhythmTemplateCount: input.rowsMissingSpecificT2RhythmTemplateCount,
    activeStandardWorkDurationSeedRowCount: input.activeStandardWorkDurationSeedRowCount,
    fallbackStandardWorkDurationSeedRowCount: input.fallbackStandardWorkDurationSeedRowCount,
    activeT2RhythmTemplateRowCount: input.activeT2RhythmTemplateRowCount,
    fallbackT2RhythmTemplateRowCount: input.fallbackT2RhythmTemplateRowCount,
    uniqueStandardWorkDurationSeedStableCodes: input.uniqueStandardWorkDurationSeedStableCodes,
    uniqueT2RhythmTemplateIds: input.uniqueT2RhythmTemplateIds,
    productionWritePolicy: 'candidate_only_no_task_dependencies_write',
  }]
}

function normalizeConstructionCalendarContext(value) {
  const record = readRecord(value)
  return {
    basis: firstText(record.basis),
    windows: readArray(record.windows).map((window) => normalizeConstructionCalendarWindow(window))
      .filter((window) => window.startDate || window.endDate || window.stableCode || window.holidayName),
  }
}

function normalizeConstructionCalendarWindow(value) {
  const record = readRecord(value)
  return {
    stableCode: firstText(record.stableCode, record.stable_code, record.holidayCode, record.holiday_code),
    holidayName: firstText(record.holidayName, record.holiday_name, record.name),
    startDate: firstDate(record.startDate, record.start_date),
    endDate: firstDate(record.endDate, record.end_date),
    countsAsConstructionShutdown: record.countsAsConstructionShutdown === true
      || record.counts_as_construction_shutdown === true,
  }
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = readNumber(value)
    if (number > 0) return number
  }
  return 0
}

function firstDate(...values) {
  const value = firstText(...values)
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value)
  return match?.[0] ?? ''
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readTextArray(value) {
  return readArray(value).map(text).filter(Boolean)
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readOptionalNumber(value) {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}


function normalizeDurationRiskRange(value) {
  const record = readRecord(value)
  const p20Days = readOptionalNumber(record.p20Days ?? record.p20_days)
  const p50Days = readOptionalNumber(record.p50Days ?? record.p50_days)
  const p80Days = readOptionalNumber(record.p80Days ?? record.p80_days)
  if (p20Days === undefined || p50Days === undefined || p80Days === undefined) return undefined
  return {
    p20Days,
    p50Days,
    p80Days,
    uncertaintyBandDays: readOptionalNumber(record.uncertaintyBandDays ?? record.uncertainty_band_days) ?? Math.max(0, p80Days - p20Days),
  }
}
function readOptionalBoolean(value) {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (String(value).toLowerCase() === 'true') return true
  if (String(value).toLowerCase() === 'false') return false
  return undefined
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function text(value) {
  return String(value ?? '').trim()
}

function optionalText(value) {
  const normalized = text(value)
  return normalized || undefined
}

function omitUndefined(record) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function comparableText(value) {
  return text(value).replace(/\s+/g, '').toLowerCase()
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/build-default-master-plan-candidate-refresh-package.mjs',
    '  [--candidate-export <candidate-baseline-...json>]',
    '  [--profile-report <default-master-plan-profile-samples.json>]',
    '  [--hygiene <candidate-export-hygiene.json>]',
    '  [--output <candidate-refresh-package.json>]',
    '  [--json]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanCandidateRefreshPackage(options)
    const summary = {
      status: report.status,
      productionReady: report.productionReady,
      refreshRequired: report.refreshRequired,
      baselineId: report.baselineId,
      projectId: report.projectId,
      businessType: report.businessType,
      missingTargetRowCount: report.diff.missingTargetRows.length,
      codeChangedRowCount: report.diff.codeChangedRows.length,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }
    console.log(options.json ? JSON.stringify(summary, null, 2) : summary)
  } catch (error) {
    console.error(error?.stack ?? error)
    process.exit(1)
  }
}
