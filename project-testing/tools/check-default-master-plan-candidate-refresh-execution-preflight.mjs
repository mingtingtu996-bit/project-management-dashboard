#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  isApprovedDefaultMasterPlanNonProductionTarget,
  readDefaultMasterPlanEnvTarget,
  sameDefaultMasterPlanDatabaseTarget,
} from './default-master-plan-env-target.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_REFRESH_PACKAGE = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-package.json')
const DEFAULT_CANDIDATE_DISCOVERY = path.join(DEFAULT_REPORT_ROOT, 'candidate-discovery.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-execution-preflight.json')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy', 'env', 'staging.env')
const REQUIRED_UNLOCK = 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH'
const EXPECTED_REFRESH_BLOCKERS = new Set([
  'selected_candidate_export_profile_shape_mismatch',
  'candidate_baseline_refresh_required_before_runtime_publication',
])
const ALLOWED_ENVIRONMENTS = new Set(['local', 'staging'])
const AUTOMATION_ACTOR_PATTERNS = [
  /^codex\b/i,
  /^automation\b/i,
  /^bot\b/i,
  /^system\b/i,
]

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    refreshPackage: DEFAULT_REFRESH_PACKAGE,
    candidateDiscovery: DEFAULT_CANDIDATE_DISCOVERY,
    output: DEFAULT_OUTPUT,
    envFile: DEFAULT_ENV_FILE,
    environment: 'staging',
    operatorApprovalRef: '',
    refreshedBy: '',
    mode: '',
    failOnBlocked: false,
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

    if (arg === '--refresh-package') {
      args.refreshPackage = path.resolve(nextValue())
    } else if (arg === '--candidate-discovery') {
      args.candidateDiscovery = path.resolve(nextValue())
    } else if (arg === '--output') {
      args.output = path.resolve(nextValue())
    } else if (arg === '--env-file') {
      args.envFile = path.resolve(nextValue())
    } else if (arg === '--environment') {
      args.environment = text(nextValue()) || args.environment
    } else if (arg === '--operator-approval-ref') {
      args.operatorApprovalRef = text(nextValue())
    } else if (arg === '--refreshed-by') {
      args.refreshedBy = text(nextValue())
    } else if (arg === '--mode') {
      args.mode = text(nextValue())
    } else if (arg === '--fail-on-blocked') {
      args.failOnBlocked = true
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

export async function checkDefaultMasterPlanCandidateRefreshExecutionPreflight({
  refreshPackage = DEFAULT_REFRESH_PACKAGE,
  candidateDiscovery = '',
  output = DEFAULT_OUTPUT,
  envFile = DEFAULT_ENV_FILE,
  environment = 'staging',
  operatorApprovalRef = '',
  refreshedBy = '',
  mode = '',
  env = process.env,
  expectedStagingProjectRef = DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  now = new Date(),
} = {}) {
  const refreshPackagePath = path.resolve(refreshPackage)
  const candidateDiscoveryPath = candidateDiscovery ? path.resolve(candidateDiscovery) : ''
  const outputPath = path.resolve(output)
  const executionTarget = await readDefaultMasterPlanEnvTarget(path.resolve(envFile), { repoRoot: REPO_ROOT })
  const refreshPackageRaw = await readFile(refreshPackagePath, 'utf8')
  const refreshPackageSha256 = createHash('sha256').update(refreshPackageRaw).digest('hex')
  const payload = JSON.parse(refreshPackageRaw)
  const packageBlockers = readArray(payload.blockers).map(text).filter(Boolean)
  const packageHardBlockers = packageBlockers.filter((blocker) => !EXPECTED_REFRESH_BLOCKERS.has(blocker))
  const targetRows = readArray(payload.targetReplacementRows)
  const targetRowsSafe = targetRows.every(isSafeTargetReplacementRow)
  const targetRowsWithDurationAssetLineage = targetRows.filter(hasDurationAssetLineage).length
  const targetRowsDurationAssetLineageReady = targetRows.length > 0
    && targetRowsWithDurationAssetLineage === targetRows.length
  const baselineId = firstText(payload.baselineId, payload.baseline_id)
  const projectId = firstText(payload.projectId, payload.project_id)
  const businessType = firstText(payload.businessType, payload.business_type)
  const refreshRequired = payload.refreshRequired === true
  const status = text(payload.status)
  const unlockPresent = text(env?.[REQUIRED_UNLOCK]) === '1'
  const normalizedEnvironment = text(environment) || 'staging'
  const normalizedMode = text(mode)
  const normalizedApproval = text(operatorApprovalRef)
  const normalizedActor = text(refreshedBy)
  const candidateDiscoveryReport = candidateDiscoveryPath
    ? await loadCandidateDiscoveryForRefresh({
      candidateDiscoveryPath,
      baselineId,
      projectId,
      businessType,
      environment: normalizedEnvironment,
    })
    : null

  if (status === 'no_refresh_required' && refreshRequired === false) {
    const report = buildReport({
      generatedAt: now.toISOString(),
      refreshPackagePath,
      refreshPackageSha256,
      payload,
      baselineId,
      projectId,
      businessType,
      status: 'already_current',
      alreadyCurrent: true,
      mayExecuteCandidateRefresh: false,
      blockers: [],
      packageBlockers,
      packageHardBlockers,
      targetRows,
      targetRowsSafe,
      targetRowsWithDurationAssetLineage,
      targetRowsDurationAssetLineageReady,
      candidateDiscoveryReport,
      executionTarget,
      environment: normalizedEnvironment,
      operatorApprovalRef: normalizedApproval,
      refreshedBy: normalizedActor,
      mode: normalizedMode,
      unlockPresent,
    })
    await writeReport(outputPath, report)
    return report
  }

  const blockers = unique([
    status === 'refresh_required' ? null : 'candidate_refresh_package_not_refresh_required',
    refreshRequired ? null : 'candidate_refresh_required_flag_missing',
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    businessType ? null : 'business_type_required',
    targetRows.length > 0 ? null : 'candidate_refresh_target_replacement_rows_required',
    targetRowsSafe ? null : 'candidate_refresh_target_rows_must_be_candidate_only_no_runtime_writes',
    targetRowsDurationAssetLineageReady ? null : 'candidate_refresh_target_rows_duration_asset_lineage_required',
    packageHardBlockers.length === 0 ? null : 'candidate_refresh_package_has_unresolved_hard_blockers',
    normalizedMode === 'execute' && !candidateDiscoveryReport
      ? 'candidate_refresh_candidate_discovery_required'
      : null,
    normalizedMode === 'execute' && executionTarget.readable !== true
      ? 'candidate_refresh_execution_target_unreadable'
      : null,
    normalizedMode === 'execute' && candidateDiscoveryReport && candidateDiscoveryReport.target?.readable !== true
      ? 'candidate_refresh_candidate_discovery_target_required'
      : null,
    normalizedMode === 'execute'
      && candidateDiscoveryReport?.target?.readable === true
      && executionTarget.readable === true
      && !sameDefaultMasterPlanDatabaseTarget(candidateDiscoveryReport.target, executionTarget)
      ? 'candidate_refresh_candidate_discovery_target_mismatch'
      : null,
    ...(candidateDiscoveryReport?.blockers ?? []),
    payload.productionReady === false ? null : 'candidate_refresh_package_must_not_mark_production_ready',
    ALLOWED_ENVIRONMENTS.has(normalizedEnvironment) ? null : 'candidate_refresh_environment_must_be_local_or_staging',
    normalizedMode === 'execute' && !isApprovedDefaultMasterPlanNonProductionTarget(executionTarget, {
      environment: normalizedEnvironment,
      expectedStagingProjectRef,
    })
      ? 'candidate_refresh_target_not_approved_non_production'
      : null,
    unlockPresent ? null : 'candidate_refresh_unlock_required',
    normalizedApproval ? null : 'candidate_refresh_operator_approval_required',
    normalizedActor ? null : 'candidate_refresh_refreshed_by_required',
    normalizedActor && isHumanActor(normalizedActor) ? null : normalizedActor ? 'human_candidate_refresh_actor_required' : null,
    normalizedMode === 'execute' ? null : 'candidate_refresh_execute_mode_required',
  ])
  const mayExecuteCandidateRefresh = blockers.length === 0
  const report = buildReport({
    generatedAt: now.toISOString(),
    refreshPackagePath,
    refreshPackageSha256,
    payload,
    baselineId,
    projectId,
    businessType,
    status: mayExecuteCandidateRefresh ? 'ready_for_execute' : 'blocked',
    alreadyCurrent: false,
    mayExecuteCandidateRefresh,
    blockers,
    packageBlockers,
    packageHardBlockers,
    targetRows,
    targetRowsSafe,
    targetRowsWithDurationAssetLineage,
    targetRowsDurationAssetLineageReady,
    candidateDiscoveryReport,
    executionTarget,
    environment: normalizedEnvironment,
    operatorApprovalRef: normalizedApproval,
    refreshedBy: normalizedActor,
    mode: normalizedMode,
    unlockPresent,
  })

  await writeReport(outputPath, report)
  return report
}

async function loadCandidateDiscoveryForRefresh({ candidateDiscoveryPath, ...context }) {
  try {
    return evaluateCandidateDiscoveryForRefresh({
      payload: JSON.parse(await readFile(candidateDiscoveryPath, 'utf8')),
      candidateDiscoveryPath,
      ...context,
    })
  } catch (error) {
    return {
      artifactRef: `candidate_discovery:${repoRelative(candidateDiscoveryPath)}`,
      schemaVersion: null,
      status: 'unavailable',
      candidateCount: 0,
      matchingBaselineFound: false,
      matchedBaselineId: null,
      filters: {
        projectId: context.projectId || null,
        environment: context.environment || null,
      },
      sourceBlockers: [],
      blockers: ['candidate_refresh_candidate_discovery_unreadable'],
      readError: text(error?.code || error?.message || error),
      mutationBoundary: {
        readsCandidateDiscoveryReport: true,
        readsDatabaseDirectly: false,
        writesProductionTables: false,
        writesTasks: false,
        writesTaskDependencies: false,
        writesRuntimePublication: false,
      },
    }
  }
}

function buildReport({
  generatedAt,
  refreshPackagePath,
  refreshPackageSha256,
  payload,
  baselineId,
  projectId,
  businessType,
  status,
  alreadyCurrent,
  mayExecuteCandidateRefresh,
  blockers,
  packageBlockers,
  packageHardBlockers,
  targetRows,
  targetRowsSafe,
  targetRowsWithDurationAssetLineage,
  targetRowsDurationAssetLineageReady,
  candidateDiscoveryReport,
  executionTarget,
  environment,
  operatorApprovalRef,
  refreshedBy,
  mode,
  unlockPresent,
}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-preflight/v1',
    generatedAt,
    source: 'check-default-master-plan-candidate-refresh-execution-preflight',
    status,
    productionReady: false,
    baselineId,
    projectId,
    businessType,
    refreshPackageRef: `candidate_refresh_package:${repoRelative(refreshPackagePath)}#sha256=${refreshPackageSha256}`,
    refreshPlan: {
      refreshRequired: payload.refreshRequired === true,
      operationMode: text(payload.operationPlan?.mode),
      targetReplacementRowCount: targetRows.length,
      targetRowsSafe,
      targetRowsDurationAssetLineageReady,
      targetRowsWithDurationAssetLineage,
      diff: {
        currentRowCount: readNumber(payload.diff?.currentRowCount),
        targetRowCount: readNumber(payload.diff?.targetRowCount),
        missingTargetRowCount: readArray(payload.diff?.missingTargetRows).length,
        extraCurrentRowCount: readArray(payload.diff?.extraCurrentRows).length,
        codeChangedRowCount: readArray(payload.diff?.codeChangedRows).length,
        dateOrDurationChangedRowCount: readArray(payload.diff?.dateOrDurationChangedRows).length,
      },
    },
    alreadyCurrent,
    mayExecuteCandidateRefresh,
    candidateDiscovery: candidateDiscoveryReport,
    executionTarget,
    packageBlockers,
    packageHardBlockers,
    blockers,
    executionPlan: {
      mode,
      environment,
      refreshedBy,
      operatorApprovalRef,
      requiredUnlock: REQUIRED_UNLOCK,
      unlockPresent,
      allowedCommand: mayExecuteCandidateRefresh
        ? [
            'node project-testing/tools/run-default-master-plan-candidate-refresh-execution.mjs',
            `--refresh-package ${repoRelative(refreshPackagePath)}`,
            `--env-file ${quoteArg(executionTarget.envFileRef)}`,
            `--environment ${environment}`,
            `--refreshed-by ${quoteArg(refreshedBy)}`,
            `--operator-approval-ref ${quoteArg(operatorApprovalRef)}`,
            '--mode execute',
            '--allow-refresh',
          ].join(' ')
        : null,
    },
    mutationBoundary: {
      readsCandidateRefreshPackage: true,
      readsExecutionEnvTargetFingerprint: true,
      readsEnvUnlockFlags: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTaskBaselineItems: false,
      writesCandidateBaselines: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      performsRollback: false,
      invokesRuntimeWriters: false,
    },
  }
}

function isSafeTargetReplacementRow(row) {
  const record = readRecord(row)
  return record.candidateOnly === true
    && record.writesTasks === false
    && record.writesTaskDependencies === false
    && record.writesProductionDependencies === false
    && record.writesRuntimePublication === false
}

function hasDurationAssetLineage(row) {
  const record = readRecord(row)
  const systemStandardNoReviewGate = (record.durationReviewRequired ?? record.duration_review_required) === false
    && text(record.durationTruthSource ?? record.duration_truth_source).startsWith('system_standard_')
  return Boolean(
    text(record.profileSourceType ?? record.profile_source_type)
    && text(record.durationAssetStableCode ?? record.duration_asset_stable_code)
    && text(record.t2RhythmTemplateId ?? record.t2_rhythm_template_id)
    && hasNumber(record.standardWorkDurationSeedP50Days ?? record.standard_work_duration_seed_p50_days)
    && hasNumber(record.t2RhythmTemplateP50Days ?? record.t2_rhythm_template_p50_days)
    && hasBoolean(record.runtimeReferenceDaysConsumed ?? record.runtime_reference_days_consumed)
    && text(record.quantityProxySource ?? record.quantity_proxy_source)
    && hasNumber(record.quantityProxyValue ?? record.quantity_proxy_value)
    && hasNumber(record.productivityDerivedDurationDays ?? record.productivity_derived_duration_days)
    && text(record.selectionRule ?? record.selection_rule)
    && text(record.durationCalibrationSource ?? record.duration_calibration_source)
    && text(record.durationMaturity ?? record.duration_maturity)
    && (text(record.durationReviewGate ?? record.duration_review_gate) || systemStandardNoReviewGate)
    && text(record.durationTruthSource ?? record.duration_truth_source)
  )
}

function evaluateCandidateDiscoveryForRefresh({
  payload,
  candidateDiscoveryPath,
  baselineId,
  projectId,
  businessType,
  environment,
}) {
  const filters = readRecord(payload.filters)
  const target = readRecord(payload.target)
  const rootBlockers = readArray(payload.blockers).map(text).filter(Boolean)
  const candidates = [
    ...readArray(payload.candidates),
    readRecord(payload.recommendedCandidate),
  ].filter((candidate) => Object.keys(readRecord(candidate)).length > 0)
  const matchingBaseline = candidates.find((candidate) => {
    const candidateBaselineId = firstText(candidate.baselineId, candidate.baseline_id, candidate.id)
    const candidateProjectId = firstText(candidate.projectId, candidate.project_id)
    const candidateBusinessType = firstText(candidate.businessType, candidate.business_type)
    return candidateBaselineId === baselineId
      && (!projectId || !candidateProjectId || candidateProjectId === projectId)
      && (!businessType || !candidateBusinessType || candidateBusinessType === businessType)
  }) ?? null
  const filterProjectId = firstText(filters.projectId, filters.project_id)
  const filterEnvironment = firstText(filters.environment)
  const blockers = unique([
    filterProjectId && projectId && filterProjectId !== projectId
      ? 'candidate_refresh_candidate_discovery_project_mismatch'
      : null,
    filterEnvironment && environment && filterEnvironment !== environment
      ? 'candidate_refresh_candidate_discovery_environment_mismatch'
      : null,
    rootBlockers.includes('candidate_default_master_plan_baseline_not_found') || !matchingBaseline
      ? 'candidate_refresh_target_baseline_not_found'
      : null,
  ])

  return {
    artifactRef: `candidate_discovery:${repoRelative(candidateDiscoveryPath)}`,
    schemaVersion: text(payload.schemaVersion),
    status: text(payload.status),
    candidateCount: readNumber(payload.candidateCount),
    matchingBaselineFound: Boolean(matchingBaseline),
    matchedBaselineId: matchingBaseline ? firstText(matchingBaseline.baselineId, matchingBaseline.baseline_id, matchingBaseline.id) : null,
    filters: {
      projectId: filterProjectId || null,
      environment: filterEnvironment || null,
    },
    target: {
      envFileRef: text(target.envFileRef) || null,
      envFileSha256: text(target.envFileSha256) || null,
      connectionCredentialSha256: text(target.connectionCredentialSha256) || null,
      supabaseProjectRef: text(target.supabaseProjectRef) || null,
      databaseHost: text(target.databaseHost) || null,
      databasePort: text(target.databasePort) || null,
      databaseName: text(target.databaseName) || null,
      databaseUser: text(target.databaseUser) || null,
      targetFingerprint: text(target.targetFingerprint) || null,
      connectionSource: text(target.connectionSource) || null,
      readable: target.readable === true,
    },
    sourceBlockers: rootBlockers,
    blockers,
    mutationBoundary: {
      readsCandidateDiscoveryReport: true,
      readsDatabaseDirectly: false,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
    },
  }
}

async function writeReport(outputPath, report) {
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Candidate Refresh Execution Preflight',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Production ready: ${report.productionReady ? 'yes' : 'no'}`,
    `May execute candidate refresh: ${report.mayExecuteCandidateRefresh ? 'yes' : 'no'}`,
    `Already current: ${report.alreadyCurrent ? 'yes' : 'no'}`,
    `Baseline: ${report.baselineId || '-'}`,
    `Project: ${report.projectId || '-'}`,
    `Business type: ${report.businessType || '-'}`,
    '',
    '## Refresh Plan',
    '',
    `- operation mode: ${report.refreshPlan.operationMode || '-'}`,
    `- target replacement rows: ${report.refreshPlan.targetReplacementRowCount}`,
    `- target rows safe: ${report.refreshPlan.targetRowsSafe ? 'yes' : 'no'}`,
    `- target rows duration asset lineage: ${report.refreshPlan.targetRowsWithDurationAssetLineage}/${report.refreshPlan.targetReplacementRowCount}`,
    `- missing target rows: ${report.refreshPlan.diff.missingTargetRowCount}`,
    `- code changed rows: ${report.refreshPlan.diff.codeChangedRowCount}`,
    '',
    '## Execution Gate',
    '',
    `- environment: ${report.executionPlan.environment || '-'}`,
    `- mode: ${report.executionPlan.mode || '-'}`,
    `- refreshedBy: ${report.executionPlan.refreshedBy || '-'}`,
    `- operatorApprovalRef: ${report.executionPlan.operatorApprovalRef || '-'}`,
    `- unlock: ${report.executionPlan.requiredUnlock}`,
    `- unlock present: ${report.executionPlan.unlockPresent ? 'yes' : 'no'}`,
    '',
    '## Blockers',
    '',
  ]

  if (report.blockers.length === 0) {
    lines.push('- none')
  } else {
    for (const blocker of report.blockers) lines.push(`- ${blocker}`)
  }

  lines.push('', '## Package Hard Blockers', '')
  if (report.packageHardBlockers.length === 0) {
    lines.push('- none')
  } else {
    for (const blocker of report.packageHardBlockers) lines.push(`- ${blocker}`)
  }

  lines.push('', '## Candidate Discovery', '')
  if (!report.candidateDiscovery) {
    lines.push('- not supplied')
  } else {
    lines.push(
      `- artifact: ${report.candidateDiscovery.artifactRef}`,
      `- status: ${report.candidateDiscovery.status || '-'}`,
      `- candidate count: ${report.candidateDiscovery.candidateCount}`,
      `- matching baseline found: ${report.candidateDiscovery.matchingBaselineFound ? 'yes' : 'no'}`,
      `- matched baseline: ${report.candidateDiscovery.matchedBaselineId || '-'}`,
    )
    if (report.candidateDiscovery.blockers.length === 0) {
      lines.push('- discovery blockers: none')
    } else {
      for (const blocker of report.candidateDiscovery.blockers) lines.push(`- discovery blocker: ${blocker}`)
    }
  }

  lines.push(
    '',
    'Mutation boundary: this preflight reads the candidate refresh package and environment unlock flags, then writes report files only; it does not write candidate baselines, task_baseline_items, tasks, task_dependencies, duration samples, runtime publication, rollback, or production tables.',
    '',
  )
  return lines.join('\n')
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function isHumanActor(value) {
  const actor = text(value)
  return Boolean(actor) && !AUTOMATION_ACTOR_PATTERNS.some((pattern) => pattern.test(actor))
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function hasNumber(value) {
  if (value === null || value === undefined || value === '') return false
  return Number.isFinite(Number(value))
}

function hasBoolean(value) {
  if (typeof value === 'boolean') return true
  if (value === null || value === undefined || value === '') return false
  return ['true', 'false'].includes(String(value).toLowerCase())
}

function text(value) {
  return String(value ?? '').trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function quoteArg(value) {
  const stringValue = text(value)
  if (!stringValue) return '""'
  return /\s/.test(stringValue) ? `"${stringValue.replace(/"/g, '\\"')}"` : stringValue
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/check-default-master-plan-candidate-refresh-execution-preflight.mjs',
    '  [--refresh-package <candidate-refresh-package.json>]',
    '  [--candidate-discovery <candidate-discovery.json>]',
    '  [--env-file <deploy/env/staging.env>]',
    '  [--output <candidate-refresh-execution-preflight.json>]',
    '  [--environment local|staging]',
    '  [--operator-approval-ref <ref>]',
    '  [--refreshed-by <user-id-or-name>]',
    '  [--mode execute]',
    '  [--fail-on-blocked]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = parseArgs()
    if (args.help) {
      printHelp()
      process.exit(0)
    }
    const report = await checkDefaultMasterPlanCandidateRefreshExecutionPreflight(args)
    const summary = {
      status: report.status,
      productionReady: report.productionReady,
      mayExecuteCandidateRefresh: report.mayExecuteCandidateRefresh,
      alreadyCurrent: report.alreadyCurrent,
      baselineId: report.baselineId,
      projectId: report.projectId,
      businessType: report.businessType,
      blockers: report.blockers,
      output: repoRelative(path.resolve(args.output)),
    }
    console.log(JSON.stringify(summary, null, 2))
    if (args.failOnBlocked && report.status === 'blocked') process.exit(1)
  } catch (error) {
    console.error(error?.stack ?? error)
    process.exit(1)
  }
}
