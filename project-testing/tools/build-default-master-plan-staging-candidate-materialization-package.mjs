#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  isApprovedDefaultMasterPlanNonProductionTarget,
  readDefaultMasterPlanEnvTarget,
} from './default-master-plan-env-target.mjs'

const __filename = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(__filename)
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_SOURCE_PACKAGE = path.join(DEFAULT_REPORT_ROOT, 'candidate-refresh-package.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'staging-candidate-materialization-package.json')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy', 'env', 'staging.env')
const EXPECTED_OPERATION_MODE = 'full_replace_candidate_baseline_items_from_profile_report'
const EXPECTED_SOURCE_BLOCKERS = new Set([
  'selected_candidate_export_profile_shape_mismatch',
  'candidate_baseline_refresh_required_before_runtime_publication',
])

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    sourcePackage: DEFAULT_SOURCE_PACKAGE,
    output: DEFAULT_OUTPUT,
    envFile: DEFAULT_ENV_FILE,
    environment: 'staging',
    companyId: '',
    projectId: '',
    operatorId: '',
    operatorApprovalRef: '',
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

    if (arg === '--source-package') args.sourcePackage = path.resolve(nextValue())
    else if (arg === '--output') args.output = path.resolve(nextValue())
    else if (arg === '--env-file') args.envFile = path.resolve(nextValue())
    else if (arg === '--environment') args.environment = text(nextValue()) || args.environment
    else if (arg === '--company-id') args.companyId = text(nextValue())
    else if (arg === '--project-id') args.projectId = text(nextValue())
    else if (arg === '--operator-id') args.operatorId = text(nextValue())
    else if (arg === '--operator-approval-ref') args.operatorApprovalRef = text(nextValue())
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

export async function buildDefaultMasterPlanStagingCandidateMaterializationPackage({
  sourcePackage = DEFAULT_SOURCE_PACKAGE,
  output = DEFAULT_OUTPUT,
  envFile = DEFAULT_ENV_FILE,
  environment = 'staging',
  companyId = '',
  projectId = '',
  operatorId = '',
  operatorApprovalRef = '',
  expectedStagingProjectRef = DEFAULT_STAGING_SUPABASE_PROJECT_REF,
  baselineIdFactory = () => randomUUID(),
  targetReader = null,
  now = new Date(),
} = {}) {
  const source = await readJsonWithHash(path.resolve(sourcePackage))
  const sourcePayload = source.json
  const target = await (targetReader ?? ((file) => readDefaultMasterPlanEnvTarget(file, { repoRoot: REPO_ROOT })))(path.resolve(envFile))
  const baselineId = text(baselineIdFactory())
  const targetRows = readArray(sourcePayload.targetReplacementRows)
  const sourceBlockers = uniqueStrings(readArray(sourcePayload.blockers))
  const unexpectedSourceBlockers = sourceBlockers.filter((blocker) => !EXPECTED_SOURCE_BLOCKERS.has(blocker))
  const blockers = uniqueStrings([
    text(environment) === 'staging' ? null : 'staging_materialization_environment_must_be_staging',
    text(sourcePayload.status) === 'refresh_required' ? null : 'staging_materialization_source_package_not_refresh_required',
    sourcePayload.refreshRequired === true ? null : 'staging_materialization_source_refresh_required_flag_missing',
    sourcePayload.productionReady === false ? null : 'staging_materialization_source_package_must_not_mark_production_ready',
    isUuid(firstText(sourcePayload.baselineId, sourcePayload.baseline_id)) ? null : 'staging_materialization_source_baseline_id_required',
    isUuid(firstText(sourcePayload.projectId, sourcePayload.project_id)) ? null : 'staging_materialization_source_project_id_required',
    firstText(sourcePayload.businessType, sourcePayload.business_type) ? null : 'staging_materialization_business_type_required',
    readRecord(sourcePayload.operationPlan).mode === EXPECTED_OPERATION_MODE ? null : 'staging_materialization_source_operation_mode_invalid',
    targetRows.length > 0 ? null : 'staging_materialization_target_rows_required',
    targetRows.every(isSafeCandidateRow) ? null : 'staging_materialization_target_rows_must_be_candidate_only',
    isUuid(companyId) ? null : 'staging_materialization_company_id_required',
    isUuid(projectId) ? null : 'staging_materialization_project_id_required',
    isUuid(operatorId) ? null : 'staging_materialization_operator_id_required',
    isUuid(baselineId) ? null : 'staging_materialization_baseline_id_invalid',
    text(operatorApprovalRef) ? null : 'staging_materialization_operator_approval_required',
    isApprovedDefaultMasterPlanNonProductionTarget(target, {
      environment,
      expectedStagingProjectRef,
    }) ? null : 'staging_materialization_target_not_approved_staging_project',
    unexpectedSourceBlockers.length === 0 ? null : 'staging_materialization_source_package_has_unexpected_blockers',
  ])
  const status = blockers.length === 0 ? 'refresh_required' : 'blocked'
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-package/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-staging-candidate-materialization-package',
    status,
    productionReady: false,
    refreshRequired: status === 'refresh_required',
    baselineId: status === 'refresh_required' ? baselineId : null,
    projectId: status === 'refresh_required' ? text(projectId) : null,
    businessType: firstText(sourcePayload.businessType, sourcePayload.business_type) || null,
    targetProfile: sourcePayload.targetProfile ?? null,
    targetReplacementRows: targetRows,
    diff: buildStagingDiff(targetRows),
    blockers: uniqueStrings([
      ...sourceBlockers,
      ...blockers,
    ]),
    operationPlan: {
      ...readRecord(sourcePayload.operationPlan),
      mode: EXPECTED_OPERATION_MODE,
      targetArtifactOnly: true,
      proposedExecutionCommand: [
        'Run the candidate baseline materialization writer with an explicit staging unlock.',
        'The writer rechecks target identity, project company ownership, and active operator memberships inside the transaction.',
      ],
    },
    stagingMaterialization: {
      environment: text(environment),
      companyId: text(companyId),
      projectId: text(projectId),
      baselineId,
      operatorId: text(operatorId),
      operatorApprovalRef: text(operatorApprovalRef),
      target: normalizeTarget(target),
    },
    sourceLineage: {
      sourcePackageRef: repoRelative(source.path),
      sourcePackageSha256: source.sha256,
      sourceBaselineId: firstText(sourcePayload.baselineId, sourcePayload.baseline_id) || null,
      sourceProjectId: firstText(sourcePayload.projectId, sourcePayload.project_id) || null,
      sourceGeneratedAt: text(sourcePayload.generatedAt) || null,
      sourceStatus: text(sourcePayload.status) || null,
      sourceBlockers,
    },
    mutationBoundary: {
      readsSourceCandidateRefreshPackage: true,
      readsStagingEnvTarget: true,
      writesReportFiles: true,
      writesCandidateBaselines: false,
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesProductionTables: false,
      invokesDatabaseWriter: false,
    },
    nextActions: status === 'refresh_required'
      ? ['Run the guarded materialization writer only with the matching staging target and approved operator context.']
      : ['Resolve the listed source, target, or binding blockers before using this package.'],
  }

  await writeReport(path.resolve(output), report)
  return report
}

function buildStagingDiff(targetRows) {
  return {
    currentRowCount: 0,
    targetRowCount: targetRows.length,
    missingTargetRows: targetRows.map((row) => ({
      code: text(row?.code) || null,
      title: text(row?.title) || null,
    })),
    extraCurrentRows: [],
    codeChangedRows: [],
    dateOrDurationChangedRows: [],
  }
}

function normalizeTarget(value) {
  const target = readRecord(value)
  return {
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
  }
}

function isSafeCandidateRow(row) {
  const record = readRecord(row)
  return record.candidateOnly === true
    && record.writesTasks === false
    && record.writesTaskDependencies === false
    && record.writesProductionDependencies === false
    && record.writesRuntimePublication === false
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

async function readJsonWithHash(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return {
    path: filePath,
    sha256: createHash('sha256').update(raw).digest('hex'),
    json: JSON.parse(raw),
  }
}

async function writeReport(outputPath, report) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value) {
  return String(value ?? '').trim()
}

function firstText(...values) {
  return text(values.find((value) => text(value)) ?? '')
}

function uniqueStrings(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/build-default-master-plan-staging-candidate-materialization-package.mjs',
    '  --company-id <uuid> --project-id <uuid> --operator-id <uuid> --operator-approval-ref <ref>',
    '  [--source-package <candidate-refresh-package.json>]',
    '  [--output <staging-candidate-materialization-package.json>]',
    '  [--env-file <staging.env>] [--environment staging] [--json]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const args = parseArgs()
    if (args.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanStagingCandidateMaterializationPackage(args)
    const summary = {
      status: report.status,
      productionReady: report.productionReady,
      baselineId: report.baselineId,
      projectId: report.projectId,
      blockers: report.blockers,
      output: repoRelative(path.resolve(args.output)),
    }
    console.log(args.json ? JSON.stringify(summary, null, 2) : summary)
    if (report.status === 'blocked') process.exitCode = 1
  } catch (error) {
    console.error(error?.stack ?? error)
    process.exit(1)
  }
}
