#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_PROFILE_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_REFRESH_PACKAGE = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-package.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'duration-asset-utilization-report.json')
const DEFAULT_RUNTIME_SEED_POST_IMPORT_VERIFICATION = path.join(
  DEFAULT_PROFILE_REPORT_ROOT,
  'runtime-seed-post-import-verification.json',
)

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    candidateRefreshPackage: DEFAULT_REFRESH_PACKAGE,
    runtimeSeedPostImportVerification: '',
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

    if (arg === '--candidate-refresh-package') {
      options.candidateRefreshPackage = path.resolve(nextValue())
    } else if (arg === '--runtime-seed-post-import-verification') {
      options.runtimeSeedPostImportVerification = path.resolve(nextValue())
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

export async function buildDefaultMasterPlanDurationAssetUtilizationReport({
  candidateRefreshPackage = DEFAULT_REFRESH_PACKAGE,
  runtimeSeedPostImportVerification = '',
  output = DEFAULT_OUTPUT,
  now = new Date(),
} = {}) {
  const refreshPath = path.resolve(candidateRefreshPackage)
  const runtimeSeedPostImportVerificationPath = runtimeSeedPostImportVerification
    ? path.resolve(runtimeSeedPostImportVerification)
    : ''
  const outputPath = path.resolve(output)
  const refreshPackage = await readJsonIfPresent(refreshPath)
  const runtimeSeedPostImportVerificationRecord = runtimeSeedPostImportVerificationPath
    ? await readJsonIfPresent(runtimeSeedPostImportVerificationPath)
    : {}
  const sourceRows = readArray(refreshPackage.targetReplacementRows)
  const packageBusinessType = text(refreshPackage.businessType ?? refreshPackage.business_type)
  const constructionCalendar = normalizeConstructionCalendarContext(
    refreshPackage.constructionCalendar
      ?? refreshPackage.construction_calendar
      ?? readObject(refreshPackage.targetProfile ?? refreshPackage.target_profile).constructionCalendar
      ?? readObject(refreshPackage.targetProfile ?? refreshPackage.target_profile).construction_calendar,
  )
  const rows = sourceRows.map((row, index) => normalizeAssetRow(row, index, packageBusinessType, constructionCalendar))
  const assetCoverage = summarizeAssetCoverage(rows)
  const runtimeSeedPostImportVerificationSummary = summarizeRuntimeSeedPostImportVerification({
    verification: runtimeSeedPostImportVerificationRecord,
    sourcePath: runtimeSeedPostImportVerificationPath,
  })
  const refreshGate = buildRefreshGate(refreshPackage)
  const targetProfile = readObject(refreshPackage.targetProfile ?? refreshPackage.target_profile)
  const generatorDurationAssetUtilizationSummary = normalizeGeneratorDurationAssetUtilizationSummary(
    targetProfile.generatorDurationAssetUtilizationSummary
      ?? targetProfile.generator_duration_asset_utilization_summary
      ?? refreshPackage.generatorDurationAssetUtilizationSummary
      ?? refreshPackage.generator_duration_asset_utilization_summary,
    assetCoverage,
  )
  const businessTypeSpecialtyAssetCoverage = summarizeBusinessTypeSpecialtyAssetCoverage(generatorDurationAssetUtilizationSummary)
  const businessTypeAssetCoverage = summarizeBusinessTypeAssetCoverage(generatorDurationAssetUtilizationSummary)
  const blockers = unique([
    Object.keys(refreshPackage).length === 0 ? 'candidate_refresh_package_file_required' : null,
    refreshGate.refreshRequired ? 'candidate_baseline_refresh_required_before_asset_utilization_review' : null,
    rows.length === 0 ? 'target_replacement_rows_required' : null,
    assetCoverage.rowsMissingStandardWorkSeedCount > 0 ? 'standard_work_duration_seed_missing_for_some_rows' : null,
    assetCoverage.rowsWithStandardWorkSeedCount > 0
      && assetCoverage.rowsWithActiveStandardWorkSeedCount < assetCoverage.rowsWithStandardWorkSeedCount
      && !runtimeSeedPostImportVerificationSummary.activeStandardWorkDurationSeedReady
      ? 'active_standard_work_duration_seed_missing_for_some_rows'
      : null,
    assetCoverage.rowsMissingT2RhythmTemplateCount > 0 ? 't2_rhythm_template_missing_for_some_rows' : null,
    assetCoverage.rowsWithT2RhythmTemplateCount > 0
      && assetCoverage.rowsWithActiveT2RhythmTemplateCount < assetCoverage.rowsWithT2RhythmTemplateCount
      && !runtimeSeedPostImportVerificationSummary.activeT2RhythmTemplateReady
      ? 'active_t2_rhythm_template_missing_for_some_rows'
      : null,
    assetCoverage.rowsWithT2BusinessTypeMismatchCount > 0 ? 't2_business_type_mismatch_for_some_rows' : null,
    assetCoverage.rowsWithT2PhaseMismatchCount > 0 ? 't2_phase_mismatch_for_some_rows' : null,
    assetCoverage.rowsWithDurationAssetPhaseMismatchCount > 0 ? 'duration_asset_phase_mismatch_for_some_rows' : null,
    assetCoverage.rowsWithConstructionCalendarBoundaryViolationCount > 0 ? 'construction_calendar_boundary_violation_for_some_rows' : null,
    assetCoverage.rowsMissingDurationRiskRangeCount > 0 ? 'duration_risk_range_missing_for_some_rows' : null,
    assetCoverage.rowsWithInvalidDurationRiskRangeCount > 0 ? 'duration_risk_range_invalid_for_some_rows' : null,
    assetCoverage.rowsMissingCriticalPathEvidenceCount > 0 ? 'critical_path_evidence_missing_for_some_rows' : null,
    assetCoverage.rowsMissingRuntimeReferenceDaysCount > 0 ? 'runtime_reference_days_missing_for_some_rows' : null,
    assetCoverage.rowsMissingQuantityOrProductivityCount > 0 ? 'quantity_or_productivity_missing_for_some_rows' : null,
    assetCoverage.rowsWithMutationBoundaryViolationsCount > 0 ? 'candidate_rows_with_write_boundary_violation' : null,
    businessTypeSpecialtyAssetCoverage.rowsMissingSpecialtyDurationAssetCount > 0 ? 'business_type_specialty_duration_asset_gap_for_some_rows' : null,
    businessTypeSpecialtyAssetCoverage.rowsMissingSpecificT2RhythmTemplateCount > 0 ? 'business_type_specific_t2_rhythm_gap_for_some_rows' : null,
    businessTypeAssetCoverage.some((coverage) => coverage.rowsMissingSpecialtyDurationAssetCount > 0) ? 'business_type_asset_coverage_specialty_seed_gap_for_some_types' : null,
    businessTypeAssetCoverage.some((coverage) => coverage.rowsMissingSpecificT2RhythmTemplateCount > 0) ? 'business_type_asset_coverage_specific_t2_gap_for_some_types' : null,
    ...runtimeSeedPostImportVerificationSummary.blockers,
  ].filter(Boolean))

  const report = {
    schemaVersion: 'workbuddy-default-master-plan-duration-asset-utilization-report/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-duration-asset-utilization-report',
    status: refreshGate.refreshRequired
      ? 'candidate_refresh_required_before_asset_utilization_review'
      : 'candidate_asset_utilization_review_required',
    productionReady: false,
    baselineId: text(refreshPackage.baselineId ?? refreshPackage.baseline_id),
    projectId: text(refreshPackage.projectId ?? refreshPackage.project_id),
    businessType: text(refreshPackage.businessType ?? refreshPackage.business_type),
    inputs: {
      candidateRefreshPackage: repoRelative(refreshPath),
      runtimeSeedPostImportVerification: repoRelative(runtimeSeedPostImportVerificationPath),
    },
    rowCount: rows.length,
    refreshGate,
    generatorDurationAssetUtilizationSummary,
    businessTypeSpecialtyAssetCoverage,
    businessTypeAssetCoverage,
    assetCoverage,
    runtimeSeedPostImportVerification: runtimeSeedPostImportVerificationSummary,
    blockers,
    rows,
    reviewPolicy: {
      purpose: 'per_row_duration_asset_traceability',
      requiredFor: [
        'duration_reference_days_evidence_review',
        'candidate_default_master_plan_pm_review',
        'runtime_publication_preflight',
      ],
      noWriteBoundary: 'Reads candidate refresh package rows and writes report files only; does not write candidate baselines, task_baseline_items, tasks, task_dependencies, duration samples, runtime publications, critical-path facts, rollback records, or production tables.',
    },
    mutationBoundary: {
      readsCandidateRefreshPackage: true,
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

function normalizeAssetRow(row, index, packageBusinessType = '', constructionCalendarContext = { windows: [] }) {
  const code = text(row.code ?? row.stableCode ?? row.standardWorkCode)
  const businessType = text(row.businessType ?? row.business_type) || packageBusinessType
  const standardWorkSeed = {
    stableCode: text(row.durationAssetStableCode ?? row.standardWorkDurationSeedStableCode),
    resolverSource: text(row.standardWorkDurationSeedResolverSource),
    resolverVersionId: text(row.standardWorkDurationSeedResolverVersionId),
    p50Days: numberOrNull(row.standardWorkDurationSeedP50Days),
    productivityP50PerDay: numberOrNull(row.standardWorkDurationSeedProductivityP50PerDay),
  }
  const t2RhythmTemplate = {
    templateId: text(row.t2RhythmTemplateId),
    resolverSource: text(row.t2RhythmTemplateResolverSource),
    resolverVersionId: text(row.t2RhythmTemplateResolverVersionId),
    p50Days: numberOrNull(row.t2RhythmTemplateP50Days),
  }
  const runtimeReferenceDays = {
    flaggedConsumed: row.runtimeReferenceDaysConsumed === true,
    evidenceLevel: text(row.runtimeReferenceDaysEvidenceLevel),
    p50Days: numberOrNull(row.runtimeReferenceDaysP50Days),
    p80Days: numberOrNull(row.runtimeReferenceDaysP80Days),
    sampleCount: numberOrNull(row.runtimeReferenceDaysSampleCount),
    source: text(row.runtimeReferenceDaysSource),
  }
  runtimeReferenceDays.consumed = runtimeReferenceDays.flaggedConsumed
    && runtimeReferenceDays.evidenceLevel === 'runtime_calibrated_l2'
    && Number(runtimeReferenceDays.p50Days) > 0
    && Number(runtimeReferenceDays.sampleCount) > 0
    && runtimeReferenceDays.source === 'accepted_real_project_outcome'
  const quantityOrProductivity = {
    source: text(row.quantityProxySource),
    value: numberOrNull(row.quantityProxyValue),
    unit: text(row.quantityProxyUnit),
    basis: text(row.quantityProxyBasis),
    productivityDerivedDurationDays: numberOrNull(row.productivityDerivedDurationDays),
  }
  const dependencyEvidence = {
    ruleSource: text(row.dependencyRuleSource),
    layerStack: text(row.dependencyRuleLayerStack),
    productionWritePolicy: text(row.dependencyProductionWritePolicy),
    phaseAnchorDependencyCount: numberOrNull(row.phaseAnchorDependencyCount),
    startAnchor: isProjectStartAnchorRow(row, index, code),
    anchorType: isProjectStartAnchorRow(row, index, code) ? 'project_start_anchor' : '',
  }
  const dependencyAsset = {
    consumed: row.dependencyAssetConsumed === true,
    stableCode: text(row.dependencyAssetStableCode),
  }
  const dependencyTimingAsset = {
    consumed: row.dependencyTimingAssetConsumed === true,
    selectedLagDays: numberOrNull(row.dependencyTimingSelectedLagDays),
  }
  const processSeasonalAsset = {
    consumed: row.processSeasonalDurationAssetConsumed === true,
    multiplier: numberOrNull(row.processSeasonalMultiplier),
    source: text(row.processSeasonalSource),
  }
  const constructionCalendarBasis = text(row.calendarBasis)
  const constructionCalendarWindowCount = numberOrNull(row.constructionCalendarWindowCount)
  const constructionCalendarMetadata = {
    consumed: constructionCalendarBasis === 'official_construction_calendar_seed'
      && Number(constructionCalendarWindowCount ?? 0) > 0,
    basis: constructionCalendarBasis,
    windowCount: constructionCalendarWindowCount,
  }
  const calendarBoundary = evaluateConstructionCalendarBoundary(row, constructionCalendarContext)
  const constructionCalendarSelection = {
    ...constructionCalendarMetadata,
    boundaryViolation: calendarBoundary.boundaryViolation,
    boundaryViolationFields: calendarBoundary.boundaryViolationFields,
    boundaryViolationWindows: calendarBoundary.boundaryViolationWindows,
  }
  const durationRiskRange = normalizeDurationRiskRange(row)
  const criticalPathEvidence = normalizeCriticalPathEvidence(row)
  const durationSelection = {
    durationDays: numberOrNull(row.durationDays),
    selectedDurationDays: numberOrNull(row.selectedDurationDays),
    selectionRule: text(row.selectionRule),
    calibrationSource: text(row.durationCalibrationSource),
    maturity: text(row.durationMaturity),
    reviewGate: text(row.durationReviewGate),
    truthSource: text(row.durationTruthSource),
    standardWorkSeed,
    t2RhythmTemplate,
    runtimeReferenceDays,
    quantityOrProductivity,
    dependencyEvidence,
    dependencyAsset,
    dependencyTimingAsset,
    processSeasonalAsset,
    constructionCalendar: constructionCalendarSelection,
    durationRiskRange,
    criticalPathEvidence,
  }
  const writeBoundary = {
    writesTasks: row.writesTasks === true,
    writesTaskDependencies: row.writesTaskDependencies === true || row.writesProductionDependencies === true,
    writesRuntimePublication: row.writesRuntimePublication === true,
  }
  const assetGaps = findAssetGaps({ row: { ...row, businessType }, durationSelection, writeBoundary })

  return {
    index: numberOrNull(row.index) ?? index + 1,
    code,
    title: text(row.title),
    executionPhase: text(row.executionPhase),
    executionLane: text(row.executionLane),
    profileSourceType: text(row.profileSourceType),
    businessType,
    utilizationStatus: resolveUtilizationStatus(durationSelection, assetGaps),
    assetGaps,
    durationSelection,
    writeBoundary,
  }
}

function findAssetGaps({ row, durationSelection, writeBoundary }) {
  const gaps = []
  if (!durationSelection.standardWorkSeed.stableCode && durationSelection.standardWorkSeed.p50Days == null) {
    gaps.push('standard_work_duration_seed_missing')
  }
  if (!durationSelection.t2RhythmTemplate.templateId && durationSelection.t2RhythmTemplate.p50Days == null) {
    gaps.push('t2_rhythm_template_missing')
  }
  if (hasT2BusinessTypeMismatch(row, durationSelection.t2RhythmTemplate.templateId)) {
    gaps.push('t2_business_type_mismatch')
  }
  if (hasT2PhaseMismatch(row, durationSelection.t2RhythmTemplate.templateId)) {
    gaps.push('t2_phase_mismatch')
  }
  if (hasDurationAssetPhaseMismatch(row, durationSelection.standardWorkSeed.stableCode)) {
    gaps.push('duration_asset_phase_mismatch')
  }
  if (!durationSelection.runtimeReferenceDays.consumed) {
    gaps.push(durationSelection.runtimeReferenceDays.flaggedConsumed
      ? 'runtime_reference_days_incomplete'
      : 'runtime_reference_days_missing')
  }
  if (
    durationSelection.quantityOrProductivity.value == null
    && durationSelection.quantityOrProductivity.productivityDerivedDurationDays == null
    && durationSelection.standardWorkSeed.productivityP50PerDay == null
  ) {
    gaps.push('quantity_or_productivity_missing')
  }
  if (writeBoundary.writesTasks || writeBoundary.writesTaskDependencies || writeBoundary.writesRuntimePublication) {
    gaps.push('mutation_boundary_violation')
  }
  if (!hasDependencyEvidence(durationSelection.dependencyEvidence)) {
    gaps.push('dependency_evidence_missing')
  }
  if (durationSelection.constructionCalendar.boundaryViolation === true) {
    gaps.push('construction_calendar_boundary_violation')
  }
  if (!hasDurationRiskRange(durationSelection.durationRiskRange)) {
    gaps.push('duration_risk_range_missing')
  } else if (!hasValidDurationRiskRange(durationSelection.durationRiskRange)) {
    gaps.push('duration_risk_range_invalid')
  }
  if (!hasCriticalPathEvidence(durationSelection.criticalPathEvidence)) {
    gaps.push('critical_path_evidence_missing')
  }
  return gaps
}

function normalizeCriticalPathEvidence(row) {
  const criticalPathCandidate = row.criticalPathCandidate ?? row.critical_path_candidate
  const totalFloatDays = numberOrNull(row.totalFloatDays ?? row.total_float_days)
  const earlyStartOffsetDays = numberOrNull(row.earlyStartOffsetDays ?? row.early_start_offset_days)
  const earlyFinishOffsetDays = numberOrNull(row.earlyFinishOffsetDays ?? row.early_finish_offset_days)
  const lateStartOffsetDays = numberOrNull(row.lateStartOffsetDays ?? row.late_start_offset_days)
  const lateFinishOffsetDays = numberOrNull(row.lateFinishOffsetDays ?? row.late_finish_offset_days)
  if (
    criticalPathCandidate !== true
    && criticalPathCandidate !== false
    && totalFloatDays == null
    && earlyStartOffsetDays == null
    && earlyFinishOffsetDays == null
    && lateStartOffsetDays == null
    && lateFinishOffsetDays == null
  ) {
    return null
  }
  return {
    criticalPathCandidate: criticalPathCandidate === true,
    totalFloatDays,
    earlyStartOffsetDays,
    earlyFinishOffsetDays,
    lateStartOffsetDays,
    lateFinishOffsetDays,
  }
}

function hasCriticalPathEvidence(value) {
  const record = readObject(value)
  return (record.criticalPathCandidate === true || record.criticalPathCandidate === false)
    && Number.isFinite(Number(record.totalFloatDays))
}


function normalizeDurationRiskRange(row) {
  const direct = readObject(row.durationRiskRange ?? row.duration_risk_range)
  const p20Days = numberOrNull(direct.p20Days ?? direct.p20_days ?? row.riskP20DurationDays ?? row.risk_p20_duration_days)
  const p50Days = numberOrNull(direct.p50Days ?? direct.p50_days ?? row.riskP50DurationDays ?? row.risk_p50_duration_days)
  const p80Days = numberOrNull(direct.p80Days ?? direct.p80_days ?? row.riskP80DurationDays ?? row.risk_p80_duration_days)
  if (p20Days == null && p50Days == null && p80Days == null) return null
  return {
    p20Days,
    p50Days,
    p80Days,
    uncertaintyBandDays: numberOrNull(direct.uncertaintyBandDays ?? direct.uncertainty_band_days)
      ?? (p20Days != null && p80Days != null ? Math.max(0, p80Days - p20Days) : null),
  }
}

function hasDurationRiskRange(range) {
  const record = readObject(range)
  return Number(record.p20Days) > 0 && Number(record.p50Days) > 0 && Number(record.p80Days) > 0
}

function hasValidDurationRiskRange(range) {
  if (!hasDurationRiskRange(range)) return false
  return Number(range.p20Days) <= Number(range.p50Days) && Number(range.p50Days) <= Number(range.p80Days)
}
function normalizeConstructionCalendarContext(value) {
  const record = readObject(value)
  return {
    basis: text(record.basis),
    windows: readArray(record.windows).map(normalizeConstructionCalendarWindow).filter((window) => window.startDate && window.endDate),
  }
}

function normalizeConstructionCalendarWindow(value) {
  const record = readObject(value)
  return {
    stableCode: text(record.stableCode ?? record.stable_code ?? record.holidayCode ?? record.holiday_code),
    holidayName: text(record.holidayName ?? record.holiday_name ?? record.name),
    startDate: normalizeDate(record.startDate ?? record.start_date),
    endDate: normalizeDate(record.endDate ?? record.end_date),
    countsAsConstructionShutdown: record.countsAsConstructionShutdown === true
      || record.counts_as_construction_shutdown === true
      || text(record.type).includes('shutdown')
      || text(record.calendarKind ?? record.calendar_kind).includes('shutdown'),
  }
}

function evaluateConstructionCalendarBoundary(row, constructionCalendar) {
  const startDate = normalizeDate(row.startDate ?? row.start_date ?? row.plannedStartDate ?? row.planned_start_date)
  const endDate = normalizeDate(row.endDate ?? row.end_date ?? row.plannedEndDate ?? row.planned_end_date)
  const shutdownWindows = readArray(constructionCalendar.windows).filter((window) => window.countsAsConstructionShutdown === true)
  const startViolations = startDate ? shutdownWindows.filter((window) => dateWithinRange(startDate, window.startDate, window.endDate)) : []
  const endViolations = endDate ? shutdownWindows.filter((window) => dateWithinRange(endDate, window.startDate, window.endDate)) : []
  const boundaryViolationFields = unique([
    startViolations.length > 0 ? 'startDate' : null,
    endViolations.length > 0 ? 'endDate' : null,
  ].filter(Boolean))

  return {
    boundaryViolation: boundaryViolationFields.length > 0,
    boundaryViolationFields,
    boundaryViolationWindows: unique([...startViolations, ...endViolations]
      .map((window) => window.stableCode || window.holidayName || `${window.startDate}_${window.endDate}`)
      .filter(Boolean)),
  }
}

function dateWithinRange(date, startDate, endDate) {
  if (!date || !startDate || !endDate) return false
  return date >= startDate && date <= endDate
}

function isProjectStartAnchorRow(row, index, code) {
  if (index !== 0) return false
  const normalizedCode = text(code || row.code || row.standardWorkCode).toUpperCase()
  const executionPhase = text(row.executionPhase)
  const executionLane = text(row.executionLane)
  return normalizedCode === 'BTMP-BASE-01'
    || executionPhase === 'startup_site_setup'
    || executionLane === 'site_preparation'
}

function hasDependencyEvidence(dependencyEvidence) {
  return Boolean(dependencyEvidence.ruleSource)
    || Number(dependencyEvidence.phaseAnchorDependencyCount ?? 0) > 0
    || dependencyEvidence.startAnchor === true
}

function hasT2BusinessTypeMismatch(row, templateId) {
  const businessType = text(row.businessType)
  const id = text(templateId).toLowerCase()
  if (!businessType || !id) return false
  if (businessType === 'residential') return false
  if (id.includes(`t2-${businessType}-`)) return false
  if (id.includes('standard-library')) return false
  return id.includes('t2-residential-')
}

function hasT2PhaseMismatch(row, templateId) {
  const executionPhase = text(row.executionPhase)
  const id = text(templateId).toLowerCase()
  if (!executionPhase || !id) return false
  if (executionPhase === 'startup_site_setup') return !/(startup|site|foundation|basement|readiness|decanting|cutover|factory|lot|assembly)/i.test(id)
  if (executionPhase === 'foundation_pit_pile') return !/(foundation|basement|pile|pit)/i.test(id)
  if (executionPhase === 'basement_structure') return !/(basement|foundation)/i.test(id)
  if (executionPhase === 'superstructure_rhythm') return !/(structure|tower|floor|superstructure|plant|longspan|assembly|transfer|shell|readiness|renovation|retrofit|decanting|cutover|occupied)/i.test(id)
  if (executionPhase === 'secondary_structure_fitout_roughin') return !/(secondary|fitout|decoration|room|campus|occupied|assembly)/i.test(id)
  if (executionPhase === 'envelope_roof_facade') return !/(envelope|facade|roof|plant|longspan|campus|utility|interface|transfer|system)/i.test(id)
  if (executionPhase === 'mep_roughin') return !/(mep|system|utility|power|cooling|commissioning|equipment|campus)/i.test(id)
  if (executionPhase === 'elevator_installation') return !/(elevator|vertical|structure|mep|commissioning|floor|equipment|shell|readiness|factory|lot|assembly)/i.test(id)
  if (executionPhase === 'interior_fitout_terminal') return !/(fitout|decoration|room|interior|podium|campus|occupied|white|cutover|power|cooling|commissioning|readiness)/i.test(id)
  if (executionPhase === 'outdoor_municipal_landscape') return !/(outdoor|municipal|landscape|campus|utility|site)/i.test(id)
  if (executionPhase === 'commissioning') return !/(commissioning|handover|opening|trial|load|system|equipment|cutover|factory|lot|assembly|site)/i.test(id)
  if (executionPhase === 'acceptance_handover') return !/(handover|commissioning|opening|trial|load|acceptance|transfer|campus|cutover|factory|lot|assembly|site)/i.test(id)
  return false
}

function hasDurationAssetPhaseMismatch(row, stableCode) {
  const executionPhase = text(row.executionPhase)
  const code = text(stableCode).toLowerCase()
  if (!executionPhase || !code) return false
  if (executionPhase === 'acceptance_handover') {
    return !/(commissioning|handover|acceptance|closeout|elevator_traction_final_acceptance)/i.test(code)
  }
  if (executionPhase === 'commissioning') {
    return !/(commissioning|system|test|trial|intelligent_data_center_commissioning)/i.test(code)
  }
  if (executionPhase === 'foundation_pit_pile') {
    return !/(foundation|pile|pit|earthwork|cushion|blinding|support)/i.test(code)
  }
  if (executionPhase === 'basement_structure') {
    return !/(basement|concrete|waterproof|backfill|structure)/i.test(code)
  }
  if (executionPhase === 'superstructure_rhythm') {
    return !/(formwork|concrete|steel|structure|hoisting|roof|finish|renovation|retrofit|public|expert_domain_renovation_retrofit)/i.test(code)
  }
  if (executionPhase === 'mep_roughin') {
    return !/(mep|plumbing|pipe|power|air|hvac|system|equipment|intelligent)/i.test(code)
  }
  return false
}

function resolveUtilizationStatus(durationSelection, assetGaps) {
  if (assetGaps.includes('mutation_boundary_violation')) return 'invalid_write_boundary'
  if (durationSelection.runtimeReferenceDays.consumed) return 'runtime_calibrated_candidate_l2'
  if (
    !assetGaps.includes('standard_work_duration_seed_missing')
    && !assetGaps.includes('t2_rhythm_template_missing')
    && durationSelection.calibrationSource === 'standard_work_duration_seed+t2_rhythm_template+real_plan_evidence'
  ) {
    return 'asset_backed_candidate_l1'
  }
  return 'insufficient_asset_mapping'
}

function summarizeAssetCoverage(rows) {
  const rowsWithStandardWorkSeedCount = rows.filter((row) => !row.assetGaps.includes('standard_work_duration_seed_missing')).length
  const rowsWithActiveStandardWorkSeedCount = rows.filter((row) => hasActiveStandardWorkSeed(row.durationSelection.standardWorkSeed)).length
  const rowsWithFallbackStandardWorkSeedCount = rows.filter((row) => hasFallbackStandardWorkSeed(row.durationSelection.standardWorkSeed)).length
  const rowsWithT2RhythmTemplateCount = rows.filter((row) => !row.assetGaps.includes('t2_rhythm_template_missing')).length
  const rowsWithActiveT2RhythmTemplateCount = rows.filter((row) => hasActiveT2RhythmTemplate(row.durationSelection.t2RhythmTemplate)).length
  const rowsWithFallbackT2RhythmTemplateCount = rows.filter((row) => hasFallbackT2RhythmTemplate(row.durationSelection.t2RhythmTemplate)).length
  const rowsWithRuntimeReferenceDaysCount = rows.filter((row) => row.durationSelection.runtimeReferenceDays.consumed).length
  const rowsWithQuantityOrProductivityCount = rows.filter((row) => !row.assetGaps.includes('quantity_or_productivity_missing')).length
  const rowsWithDependencyEvidenceCount = rows.filter((row) => (
    hasDependencyEvidence(row.durationSelection.dependencyEvidence)
  )).length
  const rowsWithDependencyAssetCount = rows.filter((row) => row.durationSelection.dependencyAsset.consumed).length
  const rowsWithDependencyTimingAssetCount = rows.filter((row) => row.durationSelection.dependencyTimingAsset.consumed).length
  const rowsWithProcessSeasonalDurationAssetCount = rows.filter((row) => row.durationSelection.processSeasonalAsset.consumed).length
  const rowsWithConstructionCalendarCount = rows.filter((row) => row.durationSelection.constructionCalendar.consumed).length
  const rowsWithConstructionCalendarBoundaryViolationCount = rows.filter((row) => row.assetGaps.includes('construction_calendar_boundary_violation')).length
  const rowsWithDurationRiskRangeCount = rows.filter((row) => hasDurationRiskRange(row.durationSelection.durationRiskRange)).length
  const rowsWithInvalidDurationRiskRangeCount = rows.filter((row) => row.assetGaps.includes('duration_risk_range_invalid')).length
  const rowsWithCriticalPathEvidenceCount = rows.filter((row) => hasCriticalPathEvidence(row.durationSelection.criticalPathEvidence)).length
  const rowsWithFloatCalculatedCount = rows.filter((row) => Number.isFinite(Number(row.durationSelection.criticalPathEvidence?.totalFloatDays))).length
  const criticalPathCandidateRowCount = rows.filter((row) => row.durationSelection.criticalPathEvidence?.criticalPathCandidate === true).length
  const rowsWithMutationBoundaryViolationsCount = rows.filter((row) => row.assetGaps.includes('mutation_boundary_violation')).length
  const rowsWithT2BusinessTypeMismatchCount = rows.filter((row) => row.assetGaps.includes('t2_business_type_mismatch')).length
  const rowsWithT2PhaseMismatchCount = rows.filter((row) => row.assetGaps.includes('t2_phase_mismatch')).length
  const rowsWithDurationAssetPhaseMismatchCount = rows.filter((row) => row.assetGaps.includes('duration_asset_phase_mismatch')).length

  return {
    rowsWithStandardWorkSeedCount,
    rowsMissingStandardWorkSeedCount: rows.length - rowsWithStandardWorkSeedCount,
    rowsWithActiveStandardWorkSeedCount,
    rowsWithFallbackStandardWorkSeedCount,
    rowsWithT2RhythmTemplateCount,
    rowsMissingT2RhythmTemplateCount: rows.length - rowsWithT2RhythmTemplateCount,
    rowsWithActiveT2RhythmTemplateCount,
    rowsWithFallbackT2RhythmTemplateCount,
    rowsWithRuntimeReferenceDaysCount,
    rowsMissingRuntimeReferenceDaysCount: rows.length - rowsWithRuntimeReferenceDaysCount,
    rowsWithQuantityOrProductivityCount,
    rowsMissingQuantityOrProductivityCount: rows.length - rowsWithQuantityOrProductivityCount,
    rowsWithDependencyEvidenceCount,
    rowsMissingDependencyEvidenceCount: rows.length - rowsWithDependencyEvidenceCount,
    rowsWithDependencyAssetCount,
    rowsMissingDependencyAssetCount: rows.length - rowsWithDependencyAssetCount,
    rowsWithDependencyTimingAssetCount,
    rowsMissingDependencyTimingAssetCount: rows.length - rowsWithDependencyTimingAssetCount,
    rowsWithProcessSeasonalDurationAssetCount,
    rowsWithConstructionCalendarCount,
    rowsMissingConstructionCalendarCount: rows.length - rowsWithConstructionCalendarCount,
    rowsWithConstructionCalendarBoundaryViolationCount,
    rowsWithDurationRiskRangeCount,
    rowsMissingDurationRiskRangeCount: rows.length - rowsWithDurationRiskRangeCount,
    rowsWithInvalidDurationRiskRangeCount,
    rowsWithCriticalPathEvidenceCount,
    rowsWithFloatCalculatedCount,
    rowsMissingCriticalPathEvidenceCount: rows.length - rowsWithCriticalPathEvidenceCount,
    criticalPathCandidateRowCount,
    rowsWithMutationBoundaryViolationsCount,
    rowsWithT2BusinessTypeMismatchCount,
    rowsWithT2PhaseMismatchCount,
    rowsWithDurationAssetPhaseMismatchCount,
  }
}

function normalizeGeneratorDurationAssetUtilizationSummary(value, assetCoverage) {
  const summary = readObject(value)
  if (Object.keys(summary).length === 0) return summary
  return {
    ...summary,
    constructionCalendarRowCount: countOrZero(assetCoverage.rowsWithConstructionCalendarCount),
    criticalPathCandidateRowCount: countOrZero(assetCoverage.criticalPathCandidateRowCount),
    floatCalculatedRowCount: countOrZero(assetCoverage.rowsWithFloatCalculatedCount),
  }
}

function summarizeRuntimeSeedPostImportVerification({ verification, sourcePath }) {
  const record = readObject(verification)
  const provided = Boolean(sourcePath)
  const mutationBoundary = readObject(record.mutationBoundary)
  const mutationBoundaryProvided = Object.keys(mutationBoundary).length > 0
  const writeBoundaryViolationFields = runtimeSeedPostImportWriteBoundaryFields()
    .filter((field) => mutationBoundary[field] === true)
  const noWriteMutationBoundary = mutationBoundaryProvided && writeBoundaryViolationFields.length === 0
  const sourceBlockers = readArray(record.blockers).map(text).filter(Boolean)
  const runtimeSeedEvidence = readObject(record.runtimeSeedEvidence)
  const runtimeT2Evidence = readObject(record.runtimeT2Evidence)
  const status = text(record.status) || (provided ? 'runtime_seed_post_import_verification_missing' : 'not_provided')
  const verified = status === 'runtime_seed_post_import_verified'
    && sourceBlockers.length === 0
    && noWriteMutationBoundary

  const activeStandardWorkDurationSeedReady = verified
    && runtimeSeedEvidence.allProfileRowsRuntime === true
    && countOrZero(runtimeSeedEvidence.fallbackOrMissingSeedRowCount) === 0
    && countOrZero(runtimeSeedEvidence.profileRowCount) > 0
  const activeT2RhythmTemplateReady = verified
    && runtimeT2Evidence.allProfileT2RowsRuntime === true
    && countOrZero(runtimeT2Evidence.fallbackOrMissingT2RowCount) === 0
    && countOrZero(runtimeT2Evidence.profileRowCount) > 0
  const blockers = provided
    ? unique([
        Object.keys(record).length === 0 ? 'runtime_seed_post_import_verification_file_required' : null,
        status === 'runtime_seed_post_import_verified' ? null : 'runtime_seed_post_import_verification_not_verified',
        sourceBlockers.length > 0 ? 'runtime_seed_post_import_verification_blockers_not_empty' : null,
        mutationBoundaryProvided ? null : 'runtime_seed_post_import_mutation_boundary_missing',
        writeBoundaryViolationFields.length > 0 ? 'runtime_seed_post_import_mutation_boundary_write_violation' : null,
        activeStandardWorkDurationSeedReady ? null : 'runtime_seed_post_import_active_standard_work_seed_not_ready',
        activeT2RhythmTemplateReady ? null : 'runtime_seed_post_import_active_t2_rhythm_template_not_ready',
      ].filter(Boolean))
    : []

  return {
    sourceEvidencePath: repoRelative(sourcePath),
    provided,
    status,
    activeStandardWorkDurationSeedReady,
    activeT2RhythmTemplateReady,
    blockers,
    sourceBlockers,
    runtimeSeedEvidence: {
      profileRowCount: countOrZero(runtimeSeedEvidence.profileRowCount),
      runtimeSeedRowCount: countOrZero(runtimeSeedEvidence.runtimeSeedRowCount),
      fallbackOrMissingSeedRowCount: countOrZero(runtimeSeedEvidence.fallbackOrMissingSeedRowCount),
      allProfileRowsRuntime: runtimeSeedEvidence.allProfileRowsRuntime === true,
      importControlEvidenceReady: runtimeSeedEvidence.importControlEvidenceReady === true,
      preflightReady: runtimeSeedEvidence.preflightReady === true,
      coverageComplete: runtimeSeedEvidence.coverageComplete === true,
      missingRuntimeStableCodeCount: countOrZero(runtimeSeedEvidence.missingRuntimeStableCodeCount),
    },
    runtimeT2Evidence: {
      profileRowCount: countOrZero(runtimeT2Evidence.profileRowCount),
      runtimeT2RowCount: countOrZero(runtimeT2Evidence.runtimeT2RowCount),
      fallbackOrMissingT2RowCount: countOrZero(runtimeT2Evidence.fallbackOrMissingT2RowCount),
      allProfileT2RowsRuntime: runtimeT2Evidence.allProfileT2RowsRuntime === true,
    },
    mutationBoundary: {
      provided: mutationBoundaryProvided,
      noWriteBoundary: noWriteMutationBoundary,
      writeBoundaryViolationFields,
    },
  }
}

function runtimeSeedPostImportWriteBoundaryFields() {
  return [
    'writesProductionTables',
    'writesAlgorithmSeedVersions',
    'writesAlgorithmSeedRecords',
    'writesAlgorithmSeedImportLogs',
    'writesTasks',
    'writesTaskDependencies',
    'writesRuntimePublication',
    'writesBaselines',
    'invokesRuntimeWriters',
  ]
}

function hasAnyStandardWorkSeed(standardWorkSeed) {
  return Boolean(standardWorkSeed.stableCode) || standardWorkSeed.p50Days != null
}

function hasAnyT2RhythmTemplate(t2RhythmTemplate) {
  return Boolean(t2RhythmTemplate.templateId) || t2RhythmTemplate.p50Days != null
}

function isActiveResolverSource(value) {
  const source = text(value)
  return Boolean(source) && source !== 'ts_seed_fallback'
}

function hasActiveStandardWorkSeed(standardWorkSeed) {
  return hasAnyStandardWorkSeed(standardWorkSeed) && isActiveResolverSource(standardWorkSeed.resolverSource)
}

function hasFallbackStandardWorkSeed(standardWorkSeed) {
  return hasAnyStandardWorkSeed(standardWorkSeed) && !hasActiveStandardWorkSeed(standardWorkSeed)
}

function hasActiveT2RhythmTemplate(t2RhythmTemplate) {
  return hasAnyT2RhythmTemplate(t2RhythmTemplate) && isActiveResolverSource(t2RhythmTemplate.resolverSource)
}

function hasFallbackT2RhythmTemplate(t2RhythmTemplate) {
  return hasAnyT2RhythmTemplate(t2RhythmTemplate) && !hasActiveT2RhythmTemplate(t2RhythmTemplate)
}

function summarizeBusinessTypeSpecialtyAssetCoverage(generatorSummary) {
  const summary = readObject(generatorSummary)
  const profileScheduleRowCount = countOrZero(summary.businessTypeProfileScheduleRowCount)
  const specialtyDurationAssetRowCount = countOrZero(summary.businessTypeSpecialtyDurationAssetRowCount)
  const specificT2RhythmTemplateRowCount = countOrZero(summary.businessTypeSpecificT2RhythmTemplateRowCount)
  const rowsMissingSpecialtyDurationAssetCount = countOrZero(summary.businessTypeRowsMissingSpecialtyDurationAssetCount)
  const rowsMissingSpecificT2RhythmTemplateCount = countOrZero(summary.businessTypeRowsMissingSpecificT2RhythmTemplateCount)
  const status = Object.keys(summary).length === 0
    ? 'not_reported'
    : profileScheduleRowCount <= 0
      ? 'not_applicable'
      : rowsMissingSpecialtyDurationAssetCount > 0 || rowsMissingSpecificT2RhythmTemplateCount > 0
        ? 'has_gaps'
        : 'covered'

  return {
    source: 'generator_duration_asset_utilization_summary',
    status,
    profileScheduleRowCount,
    specialtyDurationAssetRowCount,
    specificT2RhythmTemplateRowCount,
    rowsMissingSpecialtyDurationAssetCount,
    rowsMissingSpecificT2RhythmTemplateCount,
    profileBusinessTypeCodes: readArray(summary.businessTypeProfileBusinessTypeCodes).map(text).filter(Boolean),
    specialtyDurationAssetBusinessTypeCodes: readArray(summary.businessTypeSpecialtyDurationAssetBusinessTypeCodes).map(text).filter(Boolean),
    specificT2RhythmBusinessTypeCodes: readArray(summary.businessTypeSpecificT2RhythmBusinessTypeCodes).map(text).filter(Boolean),
  }
}

function summarizeBusinessTypeAssetCoverage(generatorSummary) {
  const summary = readObject(generatorSummary)
  return readArray(summary.businessTypeAssetCoverage ?? summary.business_type_asset_coverage)
    .map((item) => normalizeBusinessTypeAssetCoverage(item))
    .filter((item) => item.businessType)
    .sort((left, right) => left.businessType.localeCompare(right.businessType))
}

function normalizeBusinessTypeAssetCoverage(item) {
  const record = readObject(item)
  const profileScheduleRowCount = countOrZero(record.profileScheduleRowCount ?? record.profile_schedule_row_count)
  const rowsMissingSpecialtyDurationAssetCount = countOrZero(
    record.rowsMissingSpecialtyDurationAssetCount ?? record.rows_missing_specialty_duration_asset_count,
  )
  const rowsMissingSpecificT2RhythmTemplateCount = countOrZero(
    record.rowsMissingSpecificT2RhythmTemplateCount ?? record.rows_missing_specific_t2_rhythm_template_count,
  )
  const status = profileScheduleRowCount <= 0
    ? 'not_applicable'
    : rowsMissingSpecialtyDurationAssetCount > 0 || rowsMissingSpecificT2RhythmTemplateCount > 0
      ? 'has_gaps'
      : 'covered'

  return {
    source: 'generator_duration_asset_utilization_summary',
    status,
    businessType: text(record.businessType ?? record.business_type),
    profileScheduleRowCount,
    specialtyDurationAssetRowCount: countOrZero(
      record.specialtyDurationAssetRowCount ?? record.specialty_duration_asset_row_count,
    ),
    specificT2RhythmTemplateRowCount: countOrZero(
      record.specificT2RhythmTemplateRowCount ?? record.specific_t2_rhythm_template_row_count,
    ),
    rowsMissingSpecialtyDurationAssetCount,
    rowsMissingSpecificT2RhythmTemplateCount,
    activeStandardWorkDurationSeedRowCount: countOrZero(
      record.activeStandardWorkDurationSeedRowCount ?? record.active_standard_work_duration_seed_row_count,
    ),
    fallbackStandardWorkDurationSeedRowCount: countOrZero(
      record.fallbackStandardWorkDurationSeedRowCount ?? record.fallback_standard_work_duration_seed_row_count,
    ),
    activeT2RhythmTemplateRowCount: countOrZero(
      record.activeT2RhythmTemplateRowCount ?? record.active_t2_rhythm_template_row_count,
    ),
    fallbackT2RhythmTemplateRowCount: countOrZero(
      record.fallbackT2RhythmTemplateRowCount ?? record.fallback_t2_rhythm_template_row_count,
    ),
    uniqueStandardWorkDurationSeedStableCodes: readArray(
      record.uniqueStandardWorkDurationSeedStableCodes ?? record.unique_standard_work_duration_seed_stable_codes,
    ).map(text).filter(Boolean),
    uniqueT2RhythmTemplateIds: readArray(
      record.uniqueT2RhythmTemplateIds ?? record.unique_t2_rhythm_template_ids,
    ).map(text).filter(Boolean),
    productionWritePolicy: text(record.productionWritePolicy ?? record.production_write_policy)
      || 'candidate_only_no_task_dependencies_write',
  }
}

function buildRefreshGate(refreshPackage) {
  const diff = readObject(refreshPackage.diff)
  const refreshRequired = refreshPackage.refreshRequired === true
    || text(refreshPackage.status) === 'refresh_required'
    || readArray(refreshPackage.blockers).map(text).includes('candidate_baseline_refresh_required_before_runtime_publication')
  return {
    status: text(refreshPackage.status),
    refreshRequired,
    missingTargetRowCount: readArray(diff.missingTargetRows).length,
    extraCurrentRowCount: readArray(diff.extraCurrentRows).length,
    codeChangedRowCount: readArray(diff.codeChangedRows).length,
    dateOrDurationChangedRowCount: readArray(diff.dateOrDurationChangedRows).length,
    sourceBlockers: readArray(refreshPackage.blockers).map(text).filter(Boolean),
    reviewPolicy: refreshRequired
      ? 'refresh_candidate_baseline_before_using_asset_utilization_report_for_runtime_publication'
      : 'candidate_refresh_package_current_for_asset_utilization_review',
  }
}

function renderMarkdown(report) {
  const lines = []
  lines.push('# Default Master Plan Duration Asset Utilization Report')
  lines.push('')
  lines.push(`- status: ${report.status}`)
  lines.push(`- productionReady: ${report.productionReady}`)
  lines.push(`- businessType: ${report.businessType || 'unknown'}`)
  lines.push(`- rowCount: ${report.rowCount}`)
  lines.push(`- rowsWithRuntimeReferenceDays: ${report.assetCoverage.rowsWithRuntimeReferenceDaysCount}`)
  lines.push(`- rowsMissingRuntimeReferenceDays: ${report.assetCoverage.rowsMissingRuntimeReferenceDaysCount}`)
  lines.push(`- rowsWithActiveStandardWorkSeed: ${report.assetCoverage.rowsWithActiveStandardWorkSeedCount}`)
  lines.push(`- rowsWithFallbackStandardWorkSeed: ${report.assetCoverage.rowsWithFallbackStandardWorkSeedCount}`)
  lines.push(`- rowsWithActiveT2RhythmTemplate: ${report.assetCoverage.rowsWithActiveT2RhythmTemplateCount}`)
  lines.push(`- rowsWithFallbackT2RhythmTemplate: ${report.assetCoverage.rowsWithFallbackT2RhythmTemplateCount}`)
  lines.push(`- generatorDurationAssetUtilizationSummary: ${formatGeneratorDurationAssetUtilizationSummary(report.generatorDurationAssetUtilizationSummary)}`)
  lines.push(`- businessTypeSpecialtyAssetCoverage: ${formatBusinessTypeSpecialtyAssetCoverage(report.businessTypeSpecialtyAssetCoverage)}`)
  lines.push(`- businessTypeAssetCoverage: ${formatBusinessTypeAssetCoverageList(report.businessTypeAssetCoverage)}`)
  lines.push(`- runtimeSeedPostImportVerification: ${formatRuntimeSeedPostImportVerification(report.runtimeSeedPostImportVerification)}`)
  lines.push(`- refreshRequired: ${report.refreshGate.refreshRequired}`)
  lines.push(`- refreshDiff: missingTargetRows=${report.refreshGate.missingTargetRowCount}, extraCurrentRows=${report.refreshGate.extraCurrentRowCount}, codeChangedRows=${report.refreshGate.codeChangedRowCount}, dateOrDurationChangedRows=${report.refreshGate.dateOrDurationChangedRowCount}`)
  lines.push(`- mutationBoundary: report-only, no production writes`)
  if (report.blockers.length > 0) {
    lines.push(`- blockers: ${report.blockers.join(', ')}`)
  }
  lines.push('')
  lines.push('| # | Code | Title | Status | Selected Days | Risk P20/P50/P80 | Critical Path | Total Float | Seed | T2 | Runtime Ref | Gaps |')
  lines.push('|---:|---|---|---|---:|---|---|---:|---|---|---|---|')
  for (const row of report.rows) {
    lines.push([
      row.index,
      row.code,
      row.title,
      row.utilizationStatus,
      row.durationSelection.selectedDurationDays ?? row.durationSelection.durationDays ?? '',
      formatDurationRiskRange(row.durationSelection.durationRiskRange),
      row.durationSelection.criticalPathEvidence?.criticalPathCandidate === true ? 'yes' : 'no',
      formatScalar(row.durationSelection.criticalPathEvidence?.totalFloatDays),
      row.durationSelection.standardWorkSeed.stableCode || row.durationSelection.standardWorkSeed.p50Days || '',
      row.durationSelection.t2RhythmTemplate.templateId || row.durationSelection.t2RhythmTemplate.p50Days || '',
      row.durationSelection.runtimeReferenceDays.consumed ? row.durationSelection.runtimeReferenceDays.evidenceLevel || 'yes' : 'missing',
      row.assetGaps.join(', '),
    ].map(markdownCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }
  lines.push('')
  lines.push('This report is candidate evidence only. It does not write tasks, task dependencies, duration samples, runtime publications, critical-path facts, rollback records, or production tables.')
  lines.push('')
  return `${lines.join('\n')}\n`
}


function formatDurationRiskRange(range) {
  const record = readObject(range)
  if (!hasDurationRiskRange(record)) return ''
  return `${record.p20Days}/${record.p50Days}/${record.p80Days}`
}
function formatGeneratorDurationAssetUtilizationSummary(summary) {
  const record = readObject(summary)
  if (Object.keys(record).length === 0) return 'missing'
  return [
    `scheduleRowCount=${formatScalar(record.scheduleRowCount)}`,
    `standardWorkDurationSeedRowCount=${formatScalar(record.standardWorkDurationSeedRowCount)}`,
    `t2RhythmTemplateRowCount=${formatScalar(record.t2RhythmTemplateRowCount)}`,
    `projectScaleQuantityProxyRowCount=${formatScalar(record.projectScaleQuantityProxyRowCount)}`,
    `dependencyAssetConsumedRowCount=${formatScalar(record.dependencyAssetConsumedRowCount)}`,
    `dependencyTimingAssetConsumedRowCount=${formatScalar(record.dependencyTimingAssetConsumedRowCount)}`,
    `runtimeReferenceDaysRowCount=${formatScalar(record.runtimeReferenceDaysRowCount)}`,
    `runtimeReferenceDaysConsumedRowCount=${formatScalar(record.runtimeReferenceDaysConsumedRowCount)}`,
    `rowsMissingRuntimeReferenceDaysCount=${formatScalar(record.rowsMissingRuntimeReferenceDaysCount)}`,
    `processSeasonalDurationAssetRowCount=${formatScalar(record.processSeasonalDurationAssetRowCount)}`,
    `constructionCalendarRowCount=${formatScalar(record.constructionCalendarRowCount)}`,
    `durationRiskRangeRowCount=${formatScalar(record.durationRiskRangeRowCount)}`,
    `durationRiskP20MinDays=${formatScalar(record.durationRiskP20MinDays)}`,
    `durationRiskP50MedianDays=${formatScalar(record.durationRiskP50MedianDays)}`,
    `durationRiskP80MaxDays=${formatScalar(record.durationRiskP80MaxDays)}`,
    `criticalPathCandidateRowCount=${formatScalar(record.criticalPathCandidateRowCount)}`,
    `floatCalculatedRowCount=${formatScalar(record.floatCalculatedRowCount)}`,
    `businessTypeProfileScheduleRowCount=${formatScalar(record.businessTypeProfileScheduleRowCount)}`,
    `businessTypeSpecialtyDurationAssetRowCount=${formatScalar(record.businessTypeSpecialtyDurationAssetRowCount)}`,
    `businessTypeSpecificT2RhythmTemplateRowCount=${formatScalar(record.businessTypeSpecificT2RhythmTemplateRowCount)}`,
    `rowsMissingDurationAssetCount=${formatScalar(record.rowsMissingDurationAssetCount)}`,
    `rowsMissingT2RhythmTemplateCount=${formatScalar(record.rowsMissingT2RhythmTemplateCount)}`,
  ].join(', ')
}

function formatBusinessTypeSpecialtyAssetCoverage(coverage) {
  const record = readObject(coverage)
  if (Object.keys(record).length === 0) return 'missing'
  return [
    `status=${formatScalar(record.status)}`,
    `profileScheduleRowCount=${formatScalar(record.profileScheduleRowCount)}`,
    `specialtyDurationAssetRowCount=${formatScalar(record.specialtyDurationAssetRowCount)}`,
    `specificT2RhythmTemplateRowCount=${formatScalar(record.specificT2RhythmTemplateRowCount)}`,
    `rowsMissingSpecialtyDurationAssetCount=${formatScalar(record.rowsMissingSpecialtyDurationAssetCount)}`,
    `rowsMissingSpecificT2RhythmTemplateCount=${formatScalar(record.rowsMissingSpecificT2RhythmTemplateCount)}`,
    `profileBusinessTypeCodes=${readArray(record.profileBusinessTypeCodes).map(text).filter(Boolean).join(',') || '-'}`,
    `specialtyDurationAssetBusinessTypeCodes=${readArray(record.specialtyDurationAssetBusinessTypeCodes).map(text).filter(Boolean).join(',') || '-'}`,
    `specificT2RhythmBusinessTypeCodes=${readArray(record.specificT2RhythmBusinessTypeCodes).map(text).filter(Boolean).join(',') || '-'}`,
  ].join(', ')
}

function formatBusinessTypeAssetCoverageList(coverageList) {
  const items = readArray(coverageList)
  if (items.length === 0) return 'missing'
  return items.map((item) => formatBusinessTypeAssetCoverage(item)).join(' | ')
}

function formatBusinessTypeAssetCoverage(coverage) {
  const record = readObject(coverage)
  if (Object.keys(record).length === 0) return 'missing'
  return [
    `${formatScalar(record.businessType)}: status=${formatScalar(record.status)}`,
    `profileScheduleRowCount=${formatScalar(record.profileScheduleRowCount)}`,
    `specialtyDurationAssetRowCount=${formatScalar(record.specialtyDurationAssetRowCount)}`,
    `specificT2RhythmTemplateRowCount=${formatScalar(record.specificT2RhythmTemplateRowCount)}`,
    `rowsMissingSpecialtyDurationAssetCount=${formatScalar(record.rowsMissingSpecialtyDurationAssetCount)}`,
    `rowsMissingSpecificT2RhythmTemplateCount=${formatScalar(record.rowsMissingSpecificT2RhythmTemplateCount)}`,
    `activeStandardWorkDurationSeedRowCount=${formatScalar(record.activeStandardWorkDurationSeedRowCount)}`,
    `fallbackStandardWorkDurationSeedRowCount=${formatScalar(record.fallbackStandardWorkDurationSeedRowCount)}`,
    `activeT2RhythmTemplateRowCount=${formatScalar(record.activeT2RhythmTemplateRowCount)}`,
    `fallbackT2RhythmTemplateRowCount=${formatScalar(record.fallbackT2RhythmTemplateRowCount)}`,
    `uniqueStandardWorkDurationSeedStableCodes=${readArray(record.uniqueStandardWorkDurationSeedStableCodes).map(text).filter(Boolean).join(',') || '-'}`,
    `uniqueT2RhythmTemplateIds=${readArray(record.uniqueT2RhythmTemplateIds).map(text).filter(Boolean).join(',') || '-'}`,
  ].join(', ')
}

function formatRuntimeSeedPostImportVerification(summary) {
  const record = readObject(summary)
  if (Object.keys(record).length === 0 || !record.provided) return 'not_provided'
  return [
    `status=${formatScalar(record.status)}`,
    `activeStandardWorkDurationSeedReady=${formatScalar(record.activeStandardWorkDurationSeedReady)}`,
    `activeT2RhythmTemplateReady=${formatScalar(record.activeT2RhythmTemplateReady)}`,
    `source=${formatScalar(record.sourceEvidencePath)}`,
    `blockers=${readArray(record.blockers).map(text).filter(Boolean).join(',') || '-'}`,
  ].join(', ')
}

function countOrZero(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

function formatScalar(value) {
  return value === null || value === undefined || value === '' ? '-' : String(value)
}

function markdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

async function readJsonIfPresent(file) {
  if (!file) return {}
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function numberOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeDate(value) {
  const raw = text(value)
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : ''
}

function text(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function unique(values) {
  return [...new Set(values)]
}

function repoRelative(file) {
  if (!file) return ''
  const relative = path.relative(REPO_ROOT, path.resolve(file)).replace(/\\/g, '/')
  return relative.startsWith('..') ? path.resolve(file).replace(/\\/g, '/') : relative
}

function markdownPathFor(file) {
  return file.replace(/\.json$/i, '.md')
}

function printHelp() {
  console.log(`Usage: node project-testing/tools/build-default-master-plan-duration-asset-utilization-report.mjs [options]

Options:
  --candidate-refresh-package <path>  Candidate refresh package JSON.
  --runtime-seed-post-import-verification <path>
                                      Optional runtime seed/T2 post-import verification JSON.
  --output <path>                     Output JSON path.
  --json                              Print JSON report to stdout.
  -h, --help                          Show this help.
`)
}

async function main() {
  const options = parseArgs()
  if (options.help) {
    printHelp()
    return
  }
  const report = await buildDefaultMasterPlanDurationAssetUtilizationReport({
    candidateRefreshPackage: options.candidateRefreshPackage,
    runtimeSeedPostImportVerification: options.runtimeSeedPostImportVerification,
    output: options.output,
  })
  if (options.json) console.log(JSON.stringify(report, null, 2))
  else console.log(`Wrote ${repoRelative(options.output)}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error))
    process.exit(1)
  })
}
