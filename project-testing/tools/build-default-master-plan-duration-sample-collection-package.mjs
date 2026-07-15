#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultMasterPlanSourceBlockers,
  defaultMasterPlanStructuredSourceSignals,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness')
const DEFAULT_GAP_PLAN = path.join(DEFAULT_OUTPUT_ROOT, 'duration-sample-gap-plan-school.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'duration-sample-collection-package.json')
const DEFAULT_PROFILE_REPORT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-profiles/default-master-plan-profile-samples.json')
const DEFAULT_DURATION_ASSET_UTILIZATION_REPORT = path.join(DEFAULT_OUTPUT_ROOT, 'duration-asset-utilization-report.json')
const DEFAULT_REAL_DURATION_SAMPLE_MATERIAL = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.json'
const DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_TEMPLATE = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material.template.json'
const DEFAULT_REAL_DURATION_SAMPLE_COLLECTION_KIT = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-collection-kit.json'
const DEFAULT_REAL_EVIDENCE_GAP_SUMMARY = 'project-testing/reports/default-master-plan-production-readiness/real-evidence-gap-summary.json'
const DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_PREFLIGHT = 'project-testing/reports/default-master-plan-production-readiness/real-duration-sample-material-preflight.json'
const DEFAULT_RAW_COMPLETED_TASKS = 'project-testing/reports/default-master-plan-production-readiness/source-exports/raw-completed-tasks.json'
const DEFAULT_COMPLETED_TASK_EXPORT = 'project-testing/reports/default-master-plan-production-readiness/source-exports/completed-task-export.json'
const DEFAULT_DURATION_SAMPLE_SOURCE_EXPORT = 'project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json'
const REQUIRED_SOURCE_FIELDS = [
  'project_id',
  'task_id or runtime_task_id',
  'standard_work_code or stableCode',
  'actual_duration',
  'sample_status=active|accepted',
  'included_in_benchmark=true',
  'source_type=completed_task',
]
const REAL_DURATION_SAMPLE_MATERIAL_REQUIRED_FIELDS = [
  'id',
  'stableCode or standard_work_code',
  'title or standard_work_name',
  'actualDurationDays or actual_duration',
  'projectId',
  'taskId or runtime_task_id',
  'sourceType=completed_task',
  'sampleStatus=accepted|active',
  'includedInBenchmark=true',
  'evidenceRef',
]
const BUSINESS_TYPE_ALIASES = [
  { canonical: 'general_civil_residential', aliases: ['general_civil_residential', 'residential'] },
  { canonical: 'hotel', aliases: ['hotel', 'htl'] },
  { canonical: 'hospital', aliases: ['hospital', 'hsp'] },
  { canonical: 'school', aliases: ['school', 'sch'] },
  { canonical: 'industrial', aliases: ['industrial', 'ind'] },
  { canonical: 'data_center', aliases: ['data_center', 'data-centre', 'dtc'] },
  { canonical: 'transportation_hub', aliases: ['transportation_hub', 'transportation-hub', 'trh'] },
  { canonical: 'sports_culture', aliases: ['sports_culture', 'sports-culture', 'spc'] },
  { canonical: 'tod_upper_cover', aliases: ['tod_upper_cover', 'tod-upper-cover', 'tod'] },
  { canonical: 'renovation', aliases: ['renovation', 'rnv'] },
  { canonical: 'modular_building', aliases: ['modular_building', 'modular-building', 'mod'] },
]
const BUSINESS_TYPE_BY_STABLE_CODE_PREFIX = new Map([
  ['HTL', 'hotel'],
  ['HSP', 'hospital'],
  ['SCH', 'school'],
  ['IND', 'industrial'],
  ['DTC', 'data_center'],
  ['TRH', 'transportation_hub'],
  ['SPC', 'sports_culture'],
  ['TOD', 'tod_upper_cover'],
  ['RNV', 'renovation'],
  ['MOD', 'modular_building'],
])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    durationGapPlan: DEFAULT_GAP_PLAN,
    profileReport: DEFAULT_PROFILE_REPORT,
    durationAssetUtilizationReport: DEFAULT_DURATION_ASSET_UTILIZATION_REPORT,
    output: DEFAULT_OUTPUT,
    environment: 'staging',
    exportedBy: '',
    baselineId: '',
    projectId: '',
    businessTypes: [],
    profileScope: 'all',
    useDurationGapPlanRows: false,
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
    if (arg === '--duration-gap-plan') {
      options.durationGapPlan = path.resolve(nextValue())
    } else if (arg === '--profile-report') {
      options.profileReport = path.resolve(nextValue())
    } else if (arg === '--duration-asset-utilization-report') {
      options.durationAssetUtilizationReport = path.resolve(nextValue())
    } else if (arg === '--no-duration-asset-utilization-report') {
      options.durationAssetUtilizationReport = ''
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--environment') {
      options.environment = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--baseline-id') {
      options.baselineId = nextValue()
    } else if (arg === '--project-id') {
      options.projectId = nextValue()
    } else if (arg === '--business-type' || arg === '--business-types') {
      options.businessTypes.push(...readBusinessTypeList(nextValue()))
    } else if (arg === '--profile-scope') {
      const value = nextValue()
      if (!['target', 'all'].includes(value)) throw new Error('--profile-scope must be target or all')
      options.profileScope = value
    } else if (arg === '--profile-only') {
      options.useDurationGapPlanRows = false
      options.profileScope = 'all'
      options.durationAssetUtilizationReport = ''
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function buildDefaultMasterPlanDurationSampleCollectionPackage({
  durationGapPlan = DEFAULT_GAP_PLAN,
  profileReport = '',
  durationAssetUtilizationReport = '',
  output = DEFAULT_OUTPUT,
  environment = 'staging',
  exportedBy = '',
  baselineId: explicitBaselineId = '',
  projectId: explicitProjectId = '',
  businessTypes = [],
  profileScope = 'target',
  useDurationGapPlanRows = true,
  now = new Date(),
} = {}) {
  const gapPlanPath = path.resolve(durationGapPlan)
  const outputPath = path.resolve(output)
  let gapPlanExists = true
  let gapPlan
  try {
    gapPlan = JSON.parse(await readFile(gapPlanPath, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT' || useDurationGapPlanRows || profileScope !== 'all') {
      throw error
    }
    gapPlanExists = false
    gapPlan = {
      schemaVersion: 'workbuddy-default-master-plan-duration-sample-gap-plan/profile-only-missing-gap-plan-context-v1',
      status: 'profile_only_runtime_reference_days',
      rows: [],
      blockers: [],
      mutationBoundary: {
        readsDurationGapPlan: false,
        writesProductionTables: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    }
  }
  const profileReportPath = profileReport ? path.resolve(profileReport) : ''
  const profileReportPayload = profileReportPath ? JSON.parse(await readFile(profileReportPath, 'utf8')) : null
  const durationAssetUtilizationReportPath = durationAssetUtilizationReport
    ? path.resolve(durationAssetUtilizationReport)
    : ''
  const durationAssetUtilizationPayload = durationAssetUtilizationReportPath
    ? JSON.parse(await readFile(durationAssetUtilizationReportPath, 'utf8'))
    : null
  const rows = useDurationGapPlanRows && Array.isArray(gapPlan.rows) ? gapPlan.rows : []
  const targetBusinessTypes = profileScope === 'all'
    ? []
    : inferDefaultMasterPlanTargetBusinessTypes({
    gapPlan,
    gapPlanPath,
    explicitBusinessTypes: businessTypes,
  })
  const gapPlanSampleRequests = rows
    .filter((row) => readNumber(row.missingSampleCount) > 0 || text(row.coverageStatus) === 'missing_samples')
    .map((row, index) => ({
      index: readNumber(row.index) || index + 1,
      source: 'duration_sample_gap_plan',
      candidateRowId: text(row.id),
      stableCode: text(row.stableCode ?? row.standardWorkCode ?? row.standard_work_code),
      title: text(row.title),
      executionLane: text(row.executionLane ?? row.execution_lane),
      executionPhase: text(row.executionPhase ?? row.execution_phase),
      candidateReferenceDays: readNumber(row.candidateReferenceDays ?? row.referenceDays ?? row.reference_days),
      acceptedSampleCount: readNumber(row.acceptedSampleCount),
      requiredAcceptedSampleCount: Math.max(readNumber(row.missingSampleCount), readNumber(row.requiredAcceptedSampleCount) - readNumber(row.acceptedSampleCount), 1),
      collectionRequirement: text(row.sampleCollectionRequirement)
        || `Collect accepted completed-task duration sample(s) for ${text(row.stableCode ?? row.standardWorkCode)} (${text(row.title)}).`,
    }))
  const profileSampleRequestScope = buildProfileRuntimeReferenceSampleRequests(profileReportPayload, {
    targetBusinessTypes,
    candidateRows: rows,
    durationAssetUtilizationRows: readDurationAssetUtilizationMissingRows(durationAssetUtilizationPayload).rows,
  })
  const profileSampleRequests = profileSampleRequestScope.requests
  const durationAssetUtilizationSampleRequestScope = buildDurationAssetUtilizationSampleRequests(
    durationAssetUtilizationPayload,
    { targetBusinessTypes },
  )
  const durationAssetUtilizationSampleRequests = durationAssetUtilizationSampleRequestScope.requests
  const sampleRequests = mergeSampleRequestsByStableCode([
    ...gapPlanSampleRequests,
    ...profileSampleRequests,
    ...durationAssetUtilizationSampleRequests,
  ])
  const preferExplicitIdentity = !useDurationGapPlanRows || profileScope === 'all'
  const baselineId = preferExplicitIdentity
    ? (text(explicitBaselineId) || text(gapPlan.baselineId ?? gapPlan.baseline_id))
    : (text(gapPlan.baselineId ?? gapPlan.baseline_id) || text(explicitBaselineId))
  const projectId = preferExplicitIdentity
    ? (text(explicitProjectId) || text(gapPlan.projectId ?? gapPlan.project_id))
    : (text(gapPlan.projectId ?? gapPlan.project_id) || text(explicitProjectId))
  const environmentText = text(environment) || 'staging'
  const exportedByText = text(exportedBy) || '<real-release-operator>'
  const totalRequiredAcceptedSampleCount = sampleRequests.reduce((sum, row) => sum + row.requiredAcceptedSampleCount, 0)
  const rawGapPlanSourceGuard = gapPlanExists
    ? defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(gapPlan))
    : { blockers: [], labels: [], unsupportedDefaultPlanLabels: [], retiredOrLowInformationLabels: [] }
  const gapPlanSourceGuard = useDurationGapPlanRows
    ? rawGapPlanSourceGuard
    : {
        ...rawGapPlanSourceGuard,
        ignoredForProfileOnlyAllScope: true,
        ...(gapPlanExists ? {} : { missingForProfileOnlyAllScope: true }),
      }
  const gapPlanSourceBlockers = useDurationGapPlanRows
    ? gapPlanSourceGuard.blockers.map((blocker) => `duration_gap_plan_${blocker}`)
    : []
  const profileReportSourceGuard = profileReportPayload
    ? defaultMasterPlanSourceBlockers(profileReportGovernanceSourceSignals(profileReportPayload))
    : { blockers: [], labels: [], unsupportedDefaultPlanLabels: [], retiredOrLowInformationLabels: [] }
  const profileReportSourceBlockers = profileReportSourceGuard.blockers.map((blocker) => `profile_report_${blocker}`)
  const durationAssetUtilizationReportBlockers = durationAssetUtilizationPayload
    ? durationAssetUtilizationReportMutationBlockers(durationAssetUtilizationPayload)
    : []
  const blockers = [
    ...gapPlanSourceBlockers,
    ...profileReportSourceBlockers,
    ...durationAssetUtilizationReportBlockers,
    ...(sampleRequests.length > 0 ? ['accepted_real_duration_samples_required'] : []),
  ]
  const status = [
    ...gapPlanSourceBlockers,
    ...profileReportSourceBlockers,
    ...durationAssetUtilizationReportBlockers,
  ].length > 0
    ? 'blocked'
    : sampleRequests.length > 0
      ? 'samples_required'
      : 'covered'
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-duration-sample-collection-package/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-duration-sample-collection-package',
    status,
    productionReady: false,
    baselineId,
    projectId,
    durationGapPlanRef: gapPlanExists ? `duration_sample_gap_plan:${repoRelative(gapPlanPath)}` : null,
    profileReportRef: profileReportPath ? `default_master_plan_profile_report:${repoRelative(profileReportPath)}` : null,
    durationAssetUtilizationReportRef: durationAssetUtilizationReportPath
      ? `duration_asset_utilization_report:${repoRelative(durationAssetUtilizationReportPath)}`
      : null,
    sourceVersionLabel: text(gapPlan.sourceVersionLabel ?? gapPlan.source_version_label),
    targetBusinessTypes,
    profileScope,
    profileRuntimeReferenceScopePolicy: targetBusinessTypes.length > 0
      ? 'target_business_type_only'
      : 'all_profile_business_types',
    useDurationGapPlanRows,
    requiredStableCodeCount: sampleRequests.length,
    totalRequiredAcceptedSampleCount,
    durationGapPlanSampleRequestCount: gapPlanSampleRequests.length,
    profileRuntimeReferenceSampleRequestCount: profileSampleRequests.length,
    profileRuntimeReferenceExcludedCount: profileSampleRequestScope.excludedCount,
    profileRuntimeReferenceTotalGapCount: profileSampleRequestScope.totalCount,
    durationAssetUtilizationSampleRequestCount: durationAssetUtilizationSampleRequests.length,
    durationAssetUtilizationMissingRuntimeReferenceRowCount: durationAssetUtilizationSampleRequestScope.totalCount,
    durationAssetUtilizationExcludedCount: durationAssetUtilizationSampleRequestScope.excludedCount,
    sourceGuards: {
      durationGapPlan: gapPlanSourceGuard,
      profileReport: profileReportPath ? profileReportSourceGuard : null,
      durationAssetUtilizationReport: durationAssetUtilizationReportPath
        ? { blockers: durationAssetUtilizationReportBlockers }
        : null,
    },
    sampleRequests,
    requiredSourceFields: REQUIRED_SOURCE_FIELDS,
    realDurationSampleMaterialContract: {
      schemaVersion: 'workbuddy-real-duration-sample-material/v1',
      path: DEFAULT_REAL_DURATION_SAMPLE_MATERIAL,
      samplesArrayKey: 'samples',
      requiredFields: REAL_DURATION_SAMPLE_MATERIAL_REQUIRED_FIELDS,
      requestedStableCodes: sampleRequests.map((request) => request.stableCode),
      noWriteBoundary: 'operator_supplied_material_only_no_db_write',
      rejectedMarkers: [
        'stagingControlledReplay=true',
        'notRealProductionOutcome=true',
        'metadata.source=default_master_plan_staging_runtime_writer',
      ],
    },
    blockers,
    nextCommands: {
      reviewDurationSourceExport: `npm run evidence:default-master-plan:export-sources -- --phase review-duration --baseline-id ${baselineId || '<baseline-id>'} --project-id ${projectId || '<project-id>'} --environment ${environmentText} --exported-by ${exportedByText} # writes source-exports-manifest.review-duration.json only`,
      rebuildFullSourceManifestFromExistingExports: `npm run evidence:default-master-plan:export-sources -- --phase all --baseline-id ${baselineId || '<baseline-id>'} --project-id ${projectId || '<project-id>'} --publication-key <publication-key> --environment ${environmentText} --exported-by ${exportedByText} --review-export project-testing/reports/default-master-plan-production-readiness/source-exports/candidate-default-master-plan-review-export.json --duration-samples project-testing/reports/default-master-plan-production-readiness/source-exports/duration-experience-samples-export.json --raw-completed-tasks project-testing/reports/default-master-plan-production-readiness/source-exports/raw-completed-tasks.json --task-dependencies project-testing/reports/default-master-plan-production-readiness/source-exports/task-dependencies-export.json --runtime-publications project-testing/reports/default-master-plan-production-readiness/source-exports/wbs-template-runtime-publications-export.json --writer-result <dependency-writer-result.json> --critical-path-readback <critical-path-readback.json> --api-read-smoke <api-read-smoke.json> --ui-consumption-smoke <ui-consumption-smoke.json> --rollback-verification <rollback-verification.json>`,
      buildRealDurationSampleMaterialTemplate: `npm run evidence:default-master-plan:real-duration-sample-template -- --collection-package ${repoRelative(outputPath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --real-evidence-gap-summary ${DEFAULT_REAL_EVIDENCE_GAP_SUMMARY} --collection-kit-output ${DEFAULT_REAL_DURATION_SAMPLE_COLLECTION_KIT} --output ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_TEMPLATE} --prepared-by ${exportedByText}`,
      buildCompletedTaskExport: `npm run evidence:default-master-plan:completed-task-export -- --collection-package ${repoRelative(outputPath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --raw-tasks ${DEFAULT_RAW_COMPLETED_TASKS} --output ${DEFAULT_COMPLETED_TASK_EXPORT} --source-name <raw-completed-task-source-name> --evidence-ref <operator-reviewed-raw-task-evidence-ref> --operator-review-ref <pm-review-ref> --exported-by ${exportedByText}`,
      buildRealDurationSampleMaterialFromTaskExport: `npm run evidence:default-master-plan:real-duration-sample-from-task-export -- --collection-package ${repoRelative(outputPath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --completed-task-export ${DEFAULT_COMPLETED_TASK_EXPORT} --output ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL} --source-name <completed-task-source-name> --evidence-ref <operator-reviewed-evidence-ref> --operator-review-ref <pm-review-ref> --prepared-by ${exportedByText}`,
      buildRealDurationSampleSourceExport: `npm run evidence:default-master-plan:real-duration-sample-export -- --collection-package ${repoRelative(outputPath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-collection-package.json'} --sample-material ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL} --material-preflight ${DEFAULT_REAL_DURATION_SAMPLE_MATERIAL_PREFLIGHT} --output ${DEFAULT_DURATION_SAMPLE_SOURCE_EXPORT} --environment ${environmentText} --exported-by ${exportedByText}`,
      refreshGapPlan: `npm run evidence:default-master-plan:duration-gaps -- --candidate-baseline project-testing/reports/default-master-plan-production-readiness/candidate-baseline-${baselineId || '<baseline-id>'}-school-items.json --samples ${DEFAULT_DURATION_SAMPLE_SOURCE_EXPORT} --output ${repoRelative(gapPlanPath) || 'project-testing/reports/default-master-plan-production-readiness/duration-sample-gap-plan-school.json'}`,
      buildDurationCalibrationEvidence: `node project-testing/tools/build-default-master-plan-duration-calibration-evidence.mjs --baseline-id ${baselineId || '<baseline-id>'} --project-id ${projectId || '<project-id>'} --samples ${DEFAULT_DURATION_SAMPLE_SOURCE_EXPORT} --coverage-evidence project-testing/reports/default-master-plan-production-readiness/duration-sample-coverage-evidence.json --output project-testing/reports/default-master-plan-production-readiness/duration-calibration-evidence.json`,
    },
    mutationBoundary: {
      readsDurationGapPlan: gapPlanExists,
      readsProfileReport: Boolean(profileReportPath),
      readsDurationAssetUtilizationReport: Boolean(durationAssetUtilizationReportPath),
      writesDurationSamples: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Duration Sample Collection Package',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- requiredStableCodeCount: ${report.requiredStableCodeCount}`,
    `- totalRequiredAcceptedSampleCount: ${report.totalRequiredAcceptedSampleCount}`,
    `- targetBusinessTypes: ${report.targetBusinessTypes.length > 0 ? report.targetBusinessTypes.join(', ') : 'all'}`,
    `- profileRuntimeReferenceScopePolicy: ${report.profileRuntimeReferenceScopePolicy}`,
    `- durationGapPlanSampleRequestCount: ${report.durationGapPlanSampleRequestCount}`,
    `- profileRuntimeReferenceSampleRequestCount: ${report.profileRuntimeReferenceSampleRequestCount}`,
    `- profileRuntimeReferenceExcludedCount: ${report.profileRuntimeReferenceExcludedCount}`,
    `- durationAssetUtilizationSampleRequestCount: ${report.durationAssetUtilizationSampleRequestCount}`,
    `- durationAssetUtilizationMissingRuntimeReferenceRowCount: ${report.durationAssetUtilizationMissingRuntimeReferenceRowCount}`,
    `- durationAssetUtilizationExcludedCount: ${report.durationAssetUtilizationExcludedCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    `- mutationBoundary: writesDurationSamples=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false`,
    '',
    '## Required Source Fields',
    '',
    ...report.requiredSourceFields.map((field) => `- ${field}`),
    '',
    '## Real Duration Sample Material Contract',
    '',
    `- path: ${report.realDurationSampleMaterialContract.path}`,
    `- schemaVersion: ${report.realDurationSampleMaterialContract.schemaVersion}`,
    `- samplesArrayKey: ${report.realDurationSampleMaterialContract.samplesArrayKey}`,
    `- noWriteBoundary: ${report.realDurationSampleMaterialContract.noWriteBoundary}`,
    `- rejectedMarkers: ${report.realDurationSampleMaterialContract.rejectedMarkers.join(', ')}`,
    '',
    ...report.realDurationSampleMaterialContract.requiredFields.map((field) => `- ${field}`),
    '',
    '## Sample Requests',
    '',
    '| # | source | code | title | lane | phase | required samples | reference days | business types |',
    '|---:|---|---|---|---|---|---:|---:|---|',
  ]
  for (const row of report.sampleRequests) {
    lines.push(`| ${row.index} | ${escapeTable((row.requestSources ?? [row.source]).join(', '))} | ${escapeTable(row.stableCode)} | ${escapeTable(row.title)} | ${escapeTable(row.executionLane)} | ${escapeTable(row.executionPhase)} | ${row.requiredAcceptedSampleCount} | ${row.candidateReferenceDays} | ${escapeTable((row.businessTypes ?? []).join(', '))} |`)
  }
  if (report.sampleRequests.length === 0) lines.push('| 0 | none | none | none | none | none | 0 | 0 | none |')
  lines.push(
    '',
    '## Next Commands',
    '',
    '```powershell',
    report.nextCommands.reviewDurationSourceExport,
    report.nextCommands.buildRealDurationSampleMaterialTemplate,
    report.nextCommands.buildCompletedTaskExport,
    report.nextCommands.buildRealDurationSampleMaterialFromTaskExport,
    report.nextCommands.buildRealDurationSampleSourceExport,
    report.nextCommands.refreshGapPlan,
    report.nextCommands.buildDurationCalibrationEvidence,
    '```',
    '',
  )
  return `${lines.join('\n')}\n`
}

function buildProfileRuntimeReferenceSampleRequests(
  profileReport,
  { targetBusinessTypes = [], candidateRows = [], durationAssetUtilizationRows = [] } = {},
) {
  const businessTypes = Array.isArray(profileReport?.businessTypes) ? profileReport.businessTypes : []
  const targetSet = new Set(targetBusinessTypes)
  const candidateStableCodeByWorkIdentity = buildCandidateStableCodeByWorkIdentity(candidateRows)
  const assetStableCodeByWorkIdentity = buildAssetUtilizationStableCodeByWorkIdentity(durationAssetUtilizationRows)
  const requests = []
  let excludedCount = 0
  let totalCount = 0
  for (const businessTypeRecord of businessTypes) {
    const recordBusinessType = canonicalBusinessType(businessTypeRecord?.businessType)
    const rows = Array.isArray(businessTypeRecord?.profileRuntimeReferenceDayGapRows)
      ? businessTypeRecord.profileRuntimeReferenceDayGapRows
      : []
    for (const [index, row] of rows.entries()) {
      totalCount += 1
      const businessType = canonicalBusinessType(row.businessType ?? row.business_type ?? recordBusinessType)
      if (targetSet.size > 0 && !targetSet.has(businessType)) {
        excludedCount += 1
        continue
      }
      const profileRuntimeReferenceStableCode = text(row.requiredRuntimeReferenceStableCode ?? row.code ?? row.durationAssetStableCode)
      const assetUtilizationStableCode = assetStableCodeByWorkIdentity.get(workIdentityKey({
        businessType,
        executionPhase: row.executionPhase ?? row.execution_phase,
        executionLane: row.executionLane ?? row.execution_lane,
        title: row.title,
      })) ?? assetStableCodeByWorkIdentity.get(workIdentityKey({
        businessType: '',
        executionPhase: row.executionPhase ?? row.execution_phase,
        executionLane: row.executionLane ?? row.execution_lane,
        title: row.title,
      }))
      const candidateStableCode = candidateStableCodeByWorkIdentity.get(workIdentityKey({
        businessType,
        executionPhase: row.executionPhase ?? row.execution_phase,
        executionLane: row.executionLane ?? row.execution_lane,
        title: row.title,
      })) ?? candidateStableCodeByWorkIdentity.get(workIdentityKey({
        businessType: '',
        executionPhase: row.executionPhase ?? row.execution_phase,
        executionLane: row.executionLane ?? row.execution_lane,
        title: row.title,
      }))
      const stableCode = assetUtilizationStableCode || candidateStableCode || profileRuntimeReferenceStableCode
      const stableCodeResolution = assetUtilizationStableCode
        ? 'duration_asset_utilization_row_match'
        : candidateStableCode && candidateStableCode !== profileRuntimeReferenceStableCode
        ? 'candidate_gap_plan_row_match'
        : 'profile_runtime_reference_day_gap'
      const collectionRequirement = stableCodeResolution === 'duration_asset_utilization_row_match'
        ? `Collect accepted real completed-project duration sample(s) for duration asset utilization row ${stableCode} (profile reference ${profileRuntimeReferenceStableCode}; ${text(row.title) || 'untitled profile row'}).`
        : stableCodeResolution === 'candidate_gap_plan_row_match'
        ? `Collect accepted real completed-project duration sample(s) for candidate stableCode ${stableCode} (profile reference ${profileRuntimeReferenceStableCode}; ${text(row.title) || 'untitled profile row'}).`
        : text(row.sampleCollectionRequirement)
          || `Collect accepted real completed-project duration sample(s) for ${stableCode || 'missing stable code'} (${text(row.title) || 'untitled profile row'}).`
      requests.push({
        index: index + 1,
        source: 'profile_runtime_reference_day_gap',
        candidateRowId: text(row.code),
        stableCode,
        title: text(row.title),
        executionLane: text(row.executionLane),
        executionPhase: text(row.executionPhase),
        candidateReferenceDays: readNumber(row.selectedDurationDays),
        acceptedSampleCount: 0,
        requiredAcceptedSampleCount: 1,
        collectionRequirement,
        businessType,
        rowGroup: text(row.rowGroup) || 'profile',
        durationAssetStableCode: text(row.durationAssetStableCode),
        t2RhythmTemplateId: text(row.t2RhythmTemplateId),
        profileRuntimeReferenceStableCode,
        stableCodeResolution,
      })
    }
  }
  return { requests, excludedCount, totalCount }
}

function buildDurationAssetUtilizationSampleRequests(payload, { targetBusinessTypes = [] } = {}) {
  const { rows } = readDurationAssetUtilizationMissingRows(payload)
  const targetSet = new Set(targetBusinessTypes)
  const requests = []
  let excludedCount = 0
  for (const [index, row] of rows.entries()) {
    const businessType = canonicalBusinessType(row.businessType)
    if (targetSet.size > 0 && businessType && !targetSet.has(businessType)) {
      excludedCount += 1
      continue
    }
    const code = text(row.code)
    const title = text(row.title)
    requests.push({
      index: index + 1,
      source: 'duration_asset_utilization_runtime_reference_day_gap',
      candidateRowId: code,
      stableCode: code,
      title,
      executionLane: text(row.executionLane),
      executionPhase: text(row.executionPhase),
      candidateReferenceDays: readNumber(row.selectedDurationDays),
      acceptedSampleCount: 0,
      requiredAcceptedSampleCount: 1,
      collectionRequirement: `Collect accepted real completed-project duration sample(s) for duration asset utilization row ${code || 'missing stable code'} (${title || 'untitled candidate row'}).`,
      businessType,
      rowGroup: 'duration_asset_utilization',
      durationAssetStableCode: text(row.durationAssetStableCode),
      t2RhythmTemplateId: text(row.t2RhythmTemplateId),
      profileRuntimeReferenceStableCode: code,
      stableCodeResolution: 'duration_asset_utilization_row',
    })
  }
  return { requests, excludedCount, totalCount: rows.length }
}

function readDurationAssetUtilizationMissingRows(payload) {
  const root = readObject(payload)
  const businessType = canonicalBusinessType(root.businessType ?? root.business_type)
  const rows = (Array.isArray(root.rows) ? root.rows : [])
    .map((row) => {
      const record = readObject(row)
      const durationSelection = readObject(record.durationSelection ?? record.duration_selection)
      const runtimeReferenceDays = readObject(durationSelection.runtimeReferenceDays ?? durationSelection.runtime_reference_days)
      const standardWorkSeed = readObject(durationSelection.standardWorkSeed ?? durationSelection.standard_work_seed)
      const t2RhythmTemplate = readObject(durationSelection.t2RhythmTemplate ?? durationSelection.t2_rhythm_template)
      return {
        code: text(record.code ?? record.stableCode ?? record.stable_code),
        title: text(record.title),
        businessType: canonicalBusinessType(record.businessType ?? record.business_type ?? businessType),
        executionLane: text(record.executionLane ?? record.execution_lane),
        executionPhase: text(record.executionPhase ?? record.execution_phase),
        selectedDurationDays: readNumber(durationSelection.selectedDurationDays ?? durationSelection.selected_duration_days ?? durationSelection.durationDays ?? durationSelection.duration_days),
        durationAssetStableCode: text(standardWorkSeed.stableCode ?? standardWorkSeed.stable_code ?? record.durationAssetStableCode ?? record.duration_asset_stable_code),
        t2RhythmTemplateId: text(t2RhythmTemplate.templateId ?? t2RhythmTemplate.template_id ?? record.t2RhythmTemplateId ?? record.t2_rhythm_template_id),
        runtimeReferenceDaysConsumed: runtimeReferenceDays.consumed === true,
        assetGaps: Array.isArray(record.assetGaps ?? record.asset_gaps) ? (record.assetGaps ?? record.asset_gaps).map(text) : [],
      }
    })
    .filter((row) => row.code && (
      row.runtimeReferenceDaysConsumed !== true
      || row.assetGaps.includes('runtime_reference_days_missing')
    ))
  return { rows }
}

function buildAssetUtilizationStableCodeByWorkIdentity(rows) {
  const byKey = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const stableCode = text(row.code)
    if (!stableCode) continue
    const key = workIdentityKey({
      businessType: row.businessType,
      executionPhase: row.executionPhase,
      executionLane: row.executionLane,
      title: row.title,
    })
    if (key && !byKey.has(key)) byKey.set(key, stableCode)
    const genericKey = workIdentityKey({
      businessType: '',
      executionPhase: row.executionPhase,
      executionLane: row.executionLane,
      title: row.title,
    })
    if (genericKey && !byKey.has(genericKey)) byKey.set(genericKey, stableCode)
  }
  return byKey
}

function durationAssetUtilizationReportMutationBlockers(payload) {
  const mutationBoundary = readObject(payload?.mutationBoundary ?? payload?.mutation_boundary)
  return [
    ...readArray(payload?.blockers)
      .map(text)
      .filter(Boolean)
      .map((blocker) => `duration_asset_utilization_report_${blocker}`),
    mutationBoundary.writesProductionTables === true ? 'duration_asset_utilization_report_writes_production_tables' : null,
    mutationBoundary.writesTasks === true ? 'duration_asset_utilization_report_writes_tasks' : null,
    mutationBoundary.writesTaskDependencies === true ? 'duration_asset_utilization_report_writes_task_dependencies' : null,
    mutationBoundary.writesDurationSamples === true ? 'duration_asset_utilization_report_writes_duration_samples' : null,
    mutationBoundary.writesRuntimePublication === true ? 'duration_asset_utilization_report_writes_runtime_publication' : null,
    mutationBoundary.invokesRuntimeWriters === true ? 'duration_asset_utilization_report_invokes_runtime_writers' : null,
  ].filter(Boolean)
}

function profileReportGovernanceSourceSignals(profileReport) {
  const root = readObject(profileReport)
  const businessTypes = Array.isArray(root.businessTypes) ? root.businessTypes : []
  return [
    ...defaultMasterPlanStructuredSourceSignals(defaultPlanGovernanceSourceFields(root)),
    ...businessTypes.flatMap((item) => {
      return defaultMasterPlanStructuredSourceSignals(defaultPlanGovernanceSourceFields(readObject(item)))
    }),
  ]
}

function defaultPlanGovernanceSourceFields(record) {
  return {
    sourceVersionLabel: record.sourceVersionLabel,
    source_version_label: record.source_version_label,
    generationMode: record.generationMode,
    generation_mode: record.generation_mode,
    handoffGenerationMode: record.handoffGenerationMode,
    handoff_generation_mode: record.handoff_generation_mode,
    originalSource: record.originalSource,
    original_source: record.original_source,
    profileSourceType: record.profileSourceType,
    profile_source_type: record.profile_source_type,
    sourceLineage: record.sourceLineage,
    source_lineage: record.source_lineage,
    sourceMetadata: record.sourceMetadata,
    source_metadata: record.source_metadata,
    generationMetadata: record.generationMetadata,
    generation_metadata: record.generation_metadata,
    comparisonBasis: record.comparisonBasis,
    comparison_basis: record.comparison_basis,
    boundaryPolicy: record.boundaryPolicy,
    boundary_policy: record.boundary_policy,
    reviewProof: record.reviewProof,
    review_proof: record.review_proof,
    fallbackApplied: record.fallbackApplied,
    fallback_applied: record.fallback_applied,
    controlledDegradation: record.controlledDegradation,
    controlled_degradation: record.controlled_degradation,
    scenarioType: record.scenarioType,
    scenario_type: record.scenario_type,
    comparisonScenario: record.comparisonScenario,
    comparison_scenario: record.comparison_scenario,
    templateSource: record.templateSource,
    template_source: record.template_source,
    sourceLabels: record.sourceLabels,
    source_labels: record.source_labels,
    sourceAliases: record.sourceAliases,
    source_aliases: record.source_aliases,
    generationMarkers: record.generationMarkers,
    generation_markers: record.generation_markers,
    evidenceTags: record.evidenceTags,
    evidence_tags: record.evidence_tags,
  }
}

function mergeSampleRequestsByStableCode(requests) {
  const byStableCode = new Map()
  for (const request of requests) {
    const stableCode = text(request.stableCode)
    if (!stableCode) continue
    const existing = byStableCode.get(stableCode)
    if (!existing) {
      byStableCode.set(stableCode, {
        ...request,
        stableCode,
        requestSources: uniqueText([request.source]),
        businessTypes: uniqueText([request.businessType]),
        sourceRows: [{
          source: text(request.source),
          businessType: text(request.businessType),
          rowGroup: text(request.rowGroup),
          candidateRowId: text(request.candidateRowId),
          title: text(request.title),
        }],
      })
      continue
    }
    existing.requiredAcceptedSampleCount = Math.max(
      readNumber(existing.requiredAcceptedSampleCount),
      readNumber(request.requiredAcceptedSampleCount),
      1,
    )
    existing.acceptedSampleCount = Math.max(readNumber(existing.acceptedSampleCount), readNumber(request.acceptedSampleCount))
    existing.requestSources = uniqueText([...(existing.requestSources ?? []), request.source])
    existing.businessTypes = uniqueText([...(existing.businessTypes ?? []), request.businessType])
    existing.sourceRows = [
      ...(Array.isArray(existing.sourceRows) ? existing.sourceRows : []),
      {
        source: text(request.source),
        businessType: text(request.businessType),
        rowGroup: text(request.rowGroup),
        candidateRowId: text(request.candidateRowId),
        title: text(request.title),
      },
    ]
    if (!text(existing.collectionRequirement) && text(request.collectionRequirement)) {
      existing.collectionRequirement = text(request.collectionRequirement)
    }
    for (const field of [
      'durationAssetStableCode',
      't2RhythmTemplateId',
      'profileRuntimeReferenceStableCode',
      'stableCodeResolution',
    ]) {
      if (!text(existing[field]) && text(request[field])) existing[field] = text(request[field])
    }
  }
  return [...byStableCode.values()].map((request, index) => ({
    ...request,
    index: index + 1,
  }))
}

function inferDefaultMasterPlanTargetBusinessTypes({ gapPlan, gapPlanPath, explicitBusinessTypes = [] }) {
  const rows = Array.isArray(gapPlan?.rows) ? gapPlan.rows : []
  const directBusinessTypes = uniqueText([
    ...readBusinessTypeList(explicitBusinessTypes),
    ...readBusinessTypeList(gapPlan?.targetBusinessTypes ?? gapPlan?.target_business_types),
    ...readBusinessTypeList(gapPlan?.businessTypes ?? gapPlan?.business_types),
    gapPlan?.targetBusinessType,
    gapPlan?.target_business_type,
    gapPlan?.businessType,
    gapPlan?.business_type,
    gapPlan?.candidateBusinessType,
    gapPlan?.candidate_business_type,
    ...rows.flatMap((row) => readBusinessTypeList(row.businessTypes ?? row.business_types)),
    ...rows.map((row) => row.businessType ?? row.business_type),
  ].map(canonicalBusinessType))
  if (directBusinessTypes.length > 0) return directBusinessTypes

  const stableCodeBusinessTypes = uniqueText(rows.map((row) => businessTypeFromStableCode(
    row.stableCode ?? row.stable_code ?? row.standardWorkCode ?? row.standard_work_code,
  )))
  if (stableCodeBusinessTypes.length > 0) return stableCodeBusinessTypes

  const references = [
    gapPlan?.candidateBaselineRef,
    gapPlan?.candidate_baseline_ref,
    gapPlan?.durationGapPlanRef,
    gapPlan?.duration_gap_plan_ref,
    gapPlanPath,
  ]
  return uniqueText(references.flatMap(inferBusinessTypesFromReferenceText))
}

function buildCandidateStableCodeByWorkIdentity(rows) {
  const byKey = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = workIdentityKey({
      businessType: row.businessType ?? row.business_type,
      executionPhase: row.executionPhase ?? row.execution_phase,
      executionLane: row.executionLane ?? row.execution_lane,
      title: row.title,
    })
    const stableCode = text(row.stableCode ?? row.stable_code ?? row.standardWorkCode ?? row.standard_work_code)
    if (key && stableCode && !byKey.has(key)) byKey.set(key, stableCode)
    const genericKey = workIdentityKey({
      businessType: '',
      executionPhase: row.executionPhase ?? row.execution_phase,
      executionLane: row.executionLane ?? row.execution_lane,
      title: row.title,
    })
    if (genericKey && stableCode && !byKey.has(genericKey)) byKey.set(genericKey, stableCode)
  }
  return byKey
}

function workIdentityKey({ businessType, executionPhase, executionLane, title }) {
  const normalizedTitle = normalizeWorkIdentityText(title)
  const normalizedLane = normalizeWorkIdentityText(executionLane)
  const normalizedPhase = normalizeWorkIdentityText(executionPhase)
  if (!normalizedTitle || !normalizedLane || !normalizedPhase) return ''
  return [
    canonicalBusinessType(businessType),
    normalizedPhase,
    normalizedLane,
    normalizedTitle,
  ].join('|')
}

function inferBusinessTypesFromReferenceText(value) {
  const normalized = normalizeBusinessTypeText(value)
  if (!normalized) return []
  const matches = []
  for (const entry of BUSINESS_TYPE_ALIASES) {
    if (entry.aliases.some((alias) => normalized.includes(normalizeBusinessTypeText(alias)))) {
      matches.push(entry.canonical)
    }
  }
  return matches
}

function businessTypeFromStableCode(value) {
  const match = /^BTMP-([A-Z]{3})-/i.exec(text(value))
  if (!match) return ''
  return BUSINESS_TYPE_BY_STABLE_CODE_PREFIX.get(match[1].toUpperCase()) ?? ''
}

function canonicalBusinessType(value) {
  const normalized = normalizeBusinessTypeText(value)
  if (!normalized) return ''
  for (const entry of BUSINESS_TYPE_ALIASES) {
    if (entry.aliases.some((alias) => normalizeBusinessTypeText(alias) === normalized)) return entry.canonical
  }
  return normalized
}

function readBusinessTypeList(value) {
  if (Array.isArray(value)) return value.flatMap(readBusinessTypeList)
  return text(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeBusinessTypeText(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeWorkIdentityText(value) {
  return text(value).toLowerCase().replace(/\s+/g, '')
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/build-default-master-plan-duration-sample-collection-package.mjs',
    '  [--duration-gap-plan <duration-sample-gap-plan.json>]',
    `  [--profile-report <profile-report.json>] # default reference: ${repoRelative(DEFAULT_PROFILE_REPORT)}`,
    `  [--duration-asset-utilization-report <duration-asset-utilization-report.json>] # default reference: ${repoRelative(DEFAULT_DURATION_ASSET_UTILIZATION_REPORT)}`,
    '  [--no-duration-asset-utilization-report] # ignore default utilization report when collecting profile-only reference-day gaps',
    '  [--output <duration-sample-collection-package.json>]',
    '  [--business-type <business-type>] # optional, repeatable; otherwise inferred from the gap plan',
    '  [--baseline-id <baseline-id>] [--project-id <project-id>] # fallback identity when using profile-only scope',
    '  [--environment staging] [--exported-by <actor>]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanDurationSampleCollectionPackage(options)
    console.log(JSON.stringify({
      status: report.status,
      productionReady: report.productionReady,
      baselineId: report.baselineId,
      projectId: report.projectId,
      requiredStableCodeCount: report.requiredStableCodeCount,
      totalRequiredAcceptedSampleCount: report.totalRequiredAcceptedSampleCount,
      durationGapPlanSampleRequestCount: report.durationGapPlanSampleRequestCount,
      profileRuntimeReferenceSampleRequestCount: report.profileRuntimeReferenceSampleRequestCount,
      profileRuntimeReferenceExcludedCount: report.profileRuntimeReferenceExcludedCount,
      targetBusinessTypes: report.targetBusinessTypes,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
