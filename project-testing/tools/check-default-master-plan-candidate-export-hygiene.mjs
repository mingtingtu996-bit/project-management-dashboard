#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  defaultMasterPlanCandidateQualityBlockers,
  defaultMasterPlanSourceBlockers,
  defaultMasterPlanStructuredSourceSignals,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_PROFILE_REPORT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles', 'default-master-plan-profile-samples.json')
const DEFAULT_HANDOFF = path.join(DEFAULT_REPORT_ROOT, 'operator-handoff.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'candidate-export-hygiene.json')
const CANDIDATE_EXPORT_PATTERN = /^candidate-baseline-.+-school-items\.json$/

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    reportRoot: DEFAULT_REPORT_ROOT,
    candidateExport: '',
    profileReport: DEFAULT_PROFILE_REPORT,
    handoff: DEFAULT_HANDOFF,
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
    if (arg === '--report-root') {
      options.reportRoot = path.resolve(nextValue())
    } else if (arg === '--candidate-export') {
      options.candidateExport = path.resolve(nextValue())
    } else if (arg === '--profile-report') {
      options.profileReport = path.resolve(nextValue())
    } else if (arg === '--handoff') {
      options.handoff = path.resolve(nextValue())
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

export async function buildDefaultMasterPlanCandidateExportHygieneReport({
  reportRoot = DEFAULT_REPORT_ROOT,
  candidateExport = '',
  profileReport = DEFAULT_PROFILE_REPORT,
  handoff = DEFAULT_HANDOFF,
  output = DEFAULT_OUTPUT,
  now = new Date(),
} = {}) {
  const reportRootPath = path.resolve(reportRoot)
  const outputPath = path.resolve(output)
  const handoffPath = path.resolve(handoff)
  const profileReportPath = profileReport ? path.resolve(profileReport) : ''
  const handoffPayload = await readJsonIfPresent(handoffPath)
  const explicitCandidatePath = text(candidateExport) ? path.resolve(candidateExport) : ''
  const selectedCandidatePath = explicitCandidatePath || resolveArtifactPath(
    firstText(
      handoffPayload.artifacts?.candidateBaseline,
      handoffPayload.candidate?.artifact,
    ),
  )
  const candidateFiles = await findCandidateExportFiles(reportRootPath)
  const candidateExports = await Promise.all(candidateFiles.map(async (file) => {
    const payload = await readJsonIfPresent(file.filePath)
    const rawRows = readCandidateRawRows(payload)
    const rows = rawRows.map(normalizeScheduleRow)
    const quality = defaultMasterPlanCandidateQualityBlockers({
      rows: rawRows,
      sourceVersionLabel: text(payload.sourceVersionLabel ?? payload.source_version_label),
      status: text(payload.status),
    })
    const rootSourceGuard = defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(payload))
    const productionCandidateEligible = quality.productionCandidateEligible && rootSourceGuard.blockers.length === 0
    const qualityBlockers = unique([
      ...quality.blockers,
      ...rootSourceGuard.blockers,
    ])
    const selected = selectedCandidatePath
      ? samePath(file.filePath, selectedCandidatePath)
      : false
    return {
      filePath: file.filePath,
      fileName: path.basename(file.filePath),
      artifact: repoRelative(file.filePath),
      rows,
      businessType: inferCandidateBusinessType({
        fileName: path.basename(file.filePath),
        payload,
        rows,
        handoffPayload,
      }),
      baselineId: firstText(payload.baselineId, payload.baseline_id),
      projectId: firstText(payload.projectId, payload.project_id),
      rowCount: readNumber(payload.rowCount ?? payload.row_count ?? payload.rows?.length),
      sourceVersionLabel: text(payload.sourceVersionLabel ?? payload.source_version_label),
      productionCandidateEligible,
      selected,
      reasonCodes: productionCandidateEligible
        ? []
        : unique(['ineligible_candidate_export', ...qualityBlockers]),
      blockedSourceLabels: unique([
        ...quality.sourceGuard.retiredOrLowInformationLabels,
        ...rootSourceGuard.retiredOrLowInformationLabels,
      ]),
      unsupportedSourceVersionLabels: unique([
        ...quality.sourceGuard.unsupportedDefaultPlanLabels,
        ...rootSourceGuard.unsupportedDefaultPlanLabels,
      ]),
      mtimeMs: file.mtimeMs,
    }
  }))

  const currentCandidate = candidateExports.find((candidate) => candidate.selected) ?? null
  const profileComparison = await buildSelectedCandidateProfileComparison({
    currentCandidate,
    profileReportPath,
  })
  if (currentCandidate && profileComparison.status === 'mismatch') {
    currentCandidate.reasonCodes = unique([
      ...currentCandidate.reasonCodes,
      'selected_candidate_export_profile_shape_mismatch',
    ])
  }
  const ignoredCandidateExports = candidateExports
    .filter((candidate) => !candidate.selected && !candidate.productionCandidateEligible)
    .map(publicCandidateSummary)
  const extraEligibleCandidateExports = candidateExports
    .filter((candidate) => !candidate.selected && candidate.productionCandidateEligible)
    .map(publicCandidateSummary)

  const blockers = unique([
    !selectedCandidatePath ? 'handoff_candidate_artifact_required' : null,
    selectedCandidatePath && !currentCandidate ? 'selected_candidate_export_missing_from_report_root' : null,
    currentCandidate && !currentCandidate.productionCandidateEligible ? 'selected_candidate_export_ineligible' : null,
    profileComparison.status === 'mismatch' ? 'selected_candidate_export_profile_shape_mismatch' : null,
    profileComparison.status === 'profile_report_missing' ? 'selected_candidate_export_profile_report_required' : null,
    profileComparison.status === 'business_type_missing' ? 'selected_candidate_business_type_required' : null,
    profileComparison.status === 'business_type_profile_missing' ? 'selected_candidate_business_type_profile_required' : null,
    extraEligibleCandidateExports.length > 0 ? 'extra_eligible_candidate_exports_present' : null,
  ].filter(Boolean))

  const report = {
    schemaVersion: 'workbuddy-default-master-plan-candidate-export-hygiene/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-candidate-export-hygiene',
    status: blockers.length > 0
      ? 'blocked'
      : ignoredCandidateExports.length > 0
        ? 'pass_with_ignored_exports'
        : 'pass',
    productionReady: false,
    reportRoot: repoRelative(reportRootPath),
    profileReport: repoRelative(profileReportPath),
    handoff: repoRelative(handoffPath),
    candidateSelectionSource: explicitCandidatePath ? 'explicit_candidate_export' : 'operator_handoff',
    selectedCandidateArtifact: repoRelative(selectedCandidatePath),
    totalCandidateExportCount: candidateExports.length,
    currentCandidate: currentCandidate ? publicCandidateSummary(currentCandidate) : null,
    profileComparison,
    ignoredCandidateExports,
    extraEligibleCandidateExports,
    blockers,
    mutationBoundary: {
      readsLocalReports: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

async function findCandidateExportFiles(reportRoot) {
  let entries = []
  try {
    entries = await readdir(reportRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }

  const files = await Promise.all(entries
    .filter((entry) => entry.isFile() && CANDIDATE_EXPORT_PATTERN.test(entry.name))
    .map(async (entry) => {
      const filePath = path.join(reportRoot, entry.name)
      const info = await stat(filePath)
      return { filePath, mtimeMs: info.mtimeMs }
    }))
  return files.sort((left, right) => right.mtimeMs - left.mtimeMs || left.filePath.localeCompare(right.filePath))
}

async function buildSelectedCandidateProfileComparison({ currentCandidate, profileReportPath }) {
  if (!currentCandidate) {
    return {
      status: 'not_checked',
      reason: 'selected_candidate_missing',
      businessType: '',
      profileReport: repoRelative(profileReportPath),
      candidateRowCount: 0,
      profileScheduleRowCount: 0,
      profileRowCount: 0,
      candidateProfileMatchedRowCount: 0,
      missingProfileRows: [],
    }
  }
  if (!profileReportPath) {
    return {
      status: 'not_checked',
      reason: 'profile_report_not_configured',
      businessType: currentCandidate.businessType,
      profileReport: '',
      candidateRowCount: currentCandidate.rowCount,
      profileScheduleRowCount: 0,
      profileRowCount: 0,
      candidateProfileMatchedRowCount: 0,
      missingProfileRows: [],
    }
  }

  const profilePayload = await readJsonIfPresent(profileReportPath)
  const businessTypes = Array.isArray(profilePayload.businessTypes) ? profilePayload.businessTypes : []
  if (businessTypes.length === 0) {
    return {
      status: 'profile_report_missing',
      reason: 'profile_report_has_no_business_types',
      businessType: currentCandidate.businessType,
      profileReport: repoRelative(profileReportPath),
      candidateRowCount: currentCandidate.rowCount,
      profileScheduleRowCount: 0,
      profileRowCount: 0,
      candidateProfileMatchedRowCount: 0,
      missingProfileRows: [],
    }
  }

  const businessType = currentCandidate.businessType
  if (!businessType) {
    return {
      status: 'business_type_missing',
      reason: 'candidate_business_type_not_inferable',
      businessType: '',
      profileReport: repoRelative(profileReportPath),
      candidateRowCount: currentCandidate.rowCount,
      profileScheduleRowCount: 0,
      profileRowCount: 0,
      candidateProfileMatchedRowCount: 0,
      missingProfileRows: [],
    }
  }

  const businessTypeProfile = businessTypes
    .map(readRecord)
    .find((item) => text(item.businessType ?? item.business_type) === businessType)
  if (!businessTypeProfile) {
    return {
      status: 'business_type_profile_missing',
      reason: 'profile_report_missing_candidate_business_type',
      businessType,
      profileReport: repoRelative(profileReportPath),
      candidateRowCount: currentCandidate.rowCount,
      profileScheduleRowCount: 0,
      profileRowCount: 0,
      candidateProfileMatchedRowCount: 0,
      missingProfileRows: [],
    }
  }

  const profileRows = readProfileRows(businessTypeProfile)
  const candidateIdentities = new Set(currentCandidate.rows.map(rowWorkIdentityKey).filter(Boolean))
  const missingProfileRows = profileRows.filter((row) => !candidateIdentities.has(rowWorkIdentityKey(row)))
  const candidateRowCount = currentCandidate.rowCount || currentCandidate.rows.length
  const profileScheduleRowCount = readNumber(
    businessTypeProfile.reviewScheduleRowCount
      ?? businessTypeProfile.review_schedule_row_count
      ?? businessTypeProfile.scheduleRowCount
      ?? businessTypeProfile.schedule_row_count
      ?? ((Array.isArray(businessTypeProfile.baseRows) ? businessTypeProfile.baseRows.length : 0) + profileRows.length),
  )
  const profileRowCount = readNumber(
    businessTypeProfile.profileRowCount
      ?? businessTypeProfile.profile_row_count
      ?? profileRows.length,
  )
  const mismatch = missingProfileRows.length > 0 || (profileScheduleRowCount > 0 && candidateRowCount !== profileScheduleRowCount)
  return {
    status: mismatch ? 'mismatch' : 'matched',
    reason: mismatch ? 'selected_candidate_rows_do_not_match_current_profile_shape' : 'selected_candidate_matches_current_profile_shape',
    businessType,
    profileReport: repoRelative(profileReportPath),
    candidateRowCount,
    profileScheduleRowCount,
    profileRowCount,
    candidateProfileMatchedRowCount: profileRows.length - missingProfileRows.length,
    missingProfileRowCount: missingProfileRows.length,
    missingProfileRows,
    mutationBoundary: {
      readsCandidateExportRows: true,
      readsProfileReport: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
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

function readCandidateRawRows(payload) {
  if (Array.isArray(payload?.rows)) return payload.rows
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function readProfileRows(profile) {
  const rows = Array.isArray(profile.profileRows)
    ? profile.profileRows
    : Array.isArray(profile.profile_rows)
      ? profile.profile_rows
      : []
  return rows.map(normalizeScheduleRow)
}

function normalizeScheduleRow(row) {
  const record = readRecord(row)
  const values = readRecord(record.values)
  const metadata = readRecord(record.standardTaskMetadata ?? record.standard_task_metadata ?? values.standardTaskMetadata ?? values.standard_task_metadata)
  const businessTypeMasterPlan = readRecord(metadata.businessTypeMasterPlan ?? metadata.business_type_master_plan)
  return {
    code: firstText(
      record.code,
      record.standardWorkCode,
      record.standard_work_code,
      record.stableCode,
      record.stable_code,
      values.standard_work_code,
      values.template_node_id,
    ),
    title: firstText(record.title, record.name, values.title, values.name, record.standardWorkName, record.standard_work_name),
    executionPhase: firstText(record.executionPhase, record.execution_phase, values.execution_phase),
    executionLane: firstText(record.executionLane, record.execution_lane, values.execution_lane),
    profileSourceType: firstText(
      record.profileSourceType,
      record.profile_source_type,
      values.profile_source_type,
      businessTypeMasterPlan.profileSourceType,
      businessTypeMasterPlan.profile_source_type,
    ),
    businessType: firstText(record.businessType, record.business_type, values.business_type, businessTypeMasterPlan.businessType, businessTypeMasterPlan.business_type),
  }
}

function rowWorkIdentityKey(row) {
  const normalized = normalizeScheduleRow(row)
  const titleKey = comparableText(normalized.title)
  const phaseKey = comparableText(normalized.executionPhase)
  const laneKey = comparableText(normalized.executionLane)
  if (!titleKey || !phaseKey || !laneKey) return ''
  return [phaseKey, laneKey, titleKey].join('|')
}

function inferCandidateBusinessType({ fileName, payload, rows, handoffPayload }) {
  const direct = firstText(
    payload.businessType,
    payload.business_type,
    payload.candidateBusinessType,
    payload.candidate_business_type,
    handoffPayload.businessType,
    handoffPayload.business_type,
    handoffPayload.candidate?.businessType,
    handoffPayload.candidate?.business_type,
  )
  if (direct) return direct
  const fileMatch = /^candidate-baseline-.+-([a-z_]+)-items\.json$/i.exec(fileName)
  if (fileMatch?.[1]) return fileMatch[1]
  const rowBusinessType = rows.map((row) => text(row.businessType)).find(Boolean)
  if (rowBusinessType) return rowBusinessType
  const prefixes = rows
    .map((row) => /^BTMP-([A-Z]{3})-/i.exec(text(row.code))?.[1]?.toUpperCase())
    .filter(Boolean)
    .filter((prefix) => prefix !== 'BASE')
  for (const prefix of prefixes) {
    const businessType = BUSINESS_TYPE_BY_STABLE_CODE_PREFIX[prefix]
    if (businessType) return businessType
  }
  return ''
}

const BUSINESS_TYPE_BY_STABLE_CODE_PREFIX = {
  HTL: 'hotel',
  HSP: 'hospital',
  SCH: 'school',
  IND: 'industrial',
  DTC: 'data_center',
  TRH: 'transportation_hub',
  SPC: 'sports_culture',
  TOD: 'tod_upper_cover',
  RNV: 'renovation',
  MOD: 'modular_building',
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function publicCandidateSummary(candidate) {
  return {
    fileName: candidate.fileName,
    artifact: candidate.artifact,
    baselineId: candidate.baselineId,
    projectId: candidate.projectId,
    rowCount: candidate.rowCount,
    businessType: candidate.businessType,
    sourceVersionLabel: candidate.sourceVersionLabel,
    productionCandidateEligible: candidate.productionCandidateEligible,
    reasonCodes: candidate.reasonCodes,
    blockedSourceLabels: candidate.blockedSourceLabels,
    unsupportedSourceVersionLabels: candidate.unsupportedSourceVersionLabels,
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Candidate Export Hygiene',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Production ready: ${report.productionReady ? 'yes' : 'no'}`,
    `Candidate exports: ${report.totalCandidateExportCount}`,
    `Current candidate: ${report.currentCandidate?.fileName ?? 'none'}`,
    '',
    '## Blockers',
    '',
  ]

  if (report.blockers.length === 0) {
    lines.push('- none')
  } else {
    report.blockers.forEach((blocker) => lines.push(`- ${blocker}`))
  }

  lines.push('', '## Selected Candidate Profile Comparison', '')
  const comparison = report.profileComparison ?? {}
  lines.push(`- status: ${comparison.status ?? 'not_checked'}`)
  lines.push(`- businessType: ${comparison.businessType ?? '-'}`)
  lines.push(`- candidateRows: ${comparison.candidateRowCount ?? '-'}`)
  lines.push(`- profileScheduleRows: ${comparison.profileScheduleRowCount ?? '-'}`)
  lines.push(`- profileRows: ${comparison.profileRowCount ?? '-'}`)
  lines.push(`- matchedProfileRows: ${comparison.candidateProfileMatchedRowCount ?? '-'}`)
  if ((comparison.missingProfileRows ?? []).length === 0) {
    lines.push('- missingProfileRows: none')
  } else {
    lines.push('- missingProfileRows:')
    comparison.missingProfileRows.forEach((row) => {
      lines.push(`  - ${row.code || '-'} ${row.title || '-'} (${row.executionPhase || '-'} / ${row.executionLane || '-'})`)
    })
  }

  lines.push('', '## Ignored Candidate Exports', '')
  if (report.ignoredCandidateExports.length === 0) {
    lines.push('- none')
  } else {
    report.ignoredCandidateExports.forEach((candidate) => {
      lines.push(`- ignored: ${candidate.fileName} (${candidate.reasonCodes.join(', ') || 'no_reason'})`)
    })
  }

  lines.push('', '## Extra Eligible Candidate Exports', '')
  if (report.extraEligibleCandidateExports.length === 0) {
    lines.push('- none')
  } else {
    report.extraEligibleCandidateExports.forEach((candidate) => {
      lines.push(`- ${candidate.fileName} (${candidate.baselineId || 'unknown-baseline'})`)
    })
  }

  lines.push(
    '',
    'Mutation boundary: reads local reports and writes this hygiene report only; it does not write tasks, task_dependencies, runtime publication, production seed, rollback, or database state.',
    '',
  )
  return lines.join('\n')
}

function resolveArtifactPath(filePath) {
  const normalized = text(filePath)
  if (!normalized) return ''
  return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(REPO_ROOT, normalized)
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function text(value) {
  return String(value ?? '').trim()
}

function comparableText(value) {
  return text(value).replace(/\s+/g, '').toLowerCase()
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/check-default-master-plan-candidate-export-hygiene.mjs',
    '  [--report-root <default-master-plan-production-readiness-dir>]',
    '  [--candidate-export <candidate-baseline-...-school-items.json>]',
    '  [--profile-report <default-master-plan-profile-samples.json>]',
    '  [--handoff <operator-handoff.json>]',
    '  [--output <candidate-export-hygiene.json>]',
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
    const report = await buildDefaultMasterPlanCandidateExportHygieneReport(options)
    const summary = {
      status: report.status,
      productionReady: report.productionReady,
      candidateSelectionSource: report.candidateSelectionSource,
      totalCandidateExportCount: report.totalCandidateExportCount,
      ignoredCandidateExportCount: report.ignoredCandidateExports.length,
      extraEligibleCandidateExportCount: report.extraEligibleCandidateExports.length,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }
    console.log(JSON.stringify(summary, null, 2))
    process.exit(report.blockers.length > 0 ? 1 : 0)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
