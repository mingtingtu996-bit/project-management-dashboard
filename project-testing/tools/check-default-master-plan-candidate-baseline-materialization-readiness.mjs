#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness')
const DEFAULT_REFRESH_PACKAGE = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-package.json')
const DEFAULT_MATERIALIZATION = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-baseline-materialization.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-baseline-materialization-readiness-seal.json')
const REQUIRED_UNLOCK = 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION'
const EXPECTED_OPERATION_MODE = 'full_replace_candidate_baseline_items_from_profile_report'
const ALLOWED_ENVIRONMENTS = new Set(['local', 'staging'])
const EXPECTED_REFRESH_BLOCKERS = new Set([
  'selected_candidate_export_profile_shape_mismatch',
  'candidate_baseline_refresh_required_before_runtime_publication',
])
const AUTOMATION_ACTOR_PATTERNS = [
  /^codex\b/i,
  /^automation\b/i,
  /^bot\b/i,
  /^system\b/i,
]

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    refreshPackage: DEFAULT_REFRESH_PACKAGE,
    materialization: DEFAULT_MATERIALIZATION,
    output: DEFAULT_OUTPUT,
    environment: '',
    operatorApprovalRef: '',
    materializedBy: '',
    mode: '',
    allowMaterialization: false,
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
    if (arg === '--refresh-package') options.refreshPackage = path.resolve(nextValue())
    else if (arg === '--materialization') options.materialization = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--environment') options.environment = text(nextValue())
    else if (arg === '--operator-approval-ref') options.operatorApprovalRef = text(nextValue())
    else if (arg === '--materialized-by') options.materializedBy = text(nextValue())
    else if (arg === '--mode') options.mode = text(nextValue())
    else if (arg === '--allow-materialization') options.allowMaterialization = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function checkDefaultMasterPlanCandidateBaselineMaterializationReadiness({
  refreshPackage = DEFAULT_REFRESH_PACKAGE,
  materialization = DEFAULT_MATERIALIZATION,
  output = DEFAULT_OUTPUT,
  environment = '',
  operatorApprovalRef = '',
  materializedBy = '',
  mode = '',
  allowMaterialization = false,
  env = process.env,
  now = new Date(),
} = {}) {
  const refreshPackagePath = path.resolve(refreshPackage)
  const materializationPath = path.resolve(materialization)
  const outputPath = path.resolve(output)
  const [loadedRefreshPackage, materializationPayload] = await Promise.all([
    readJsonWithHashIfPresent(refreshPackagePath),
    readJsonIfPresent(materializationPath),
  ])
  const refreshPayload = loadedRefreshPackage.json
  const refreshPackageSha256 = loadedRefreshPackage.sha256

  const materializationControl = readRecord(materializationPayload.executionControl)
  const effectiveEnvironment = firstText(environment, materializationControl.environment, 'staging')
  const effectiveMode = firstText(mode, materializationControl.mode, 'dry-run')
  const effectiveOperatorApprovalRef = firstText(operatorApprovalRef, materializationControl.operatorApprovalRef)
  const effectiveMaterializedBy = firstText(materializedBy, materializationControl.materializedBy)
  const effectiveAllowMaterialization = allowMaterialization === true
    || (allowMaterialization !== false && materializationControl.allowMaterialization === true)
  const unlockValue = text(env?.[REQUIRED_UNLOCK])

  const baselineId = firstText(refreshPayload.baselineId, refreshPayload.baseline_id, materializationPayload.baselineId, materializationPayload.baseline_id)
  const projectId = firstText(refreshPayload.projectId, refreshPayload.project_id, materializationPayload.projectId, materializationPayload.project_id)
  const businessType = firstText(refreshPayload.businessType, refreshPayload.business_type, materializationPayload.businessType, materializationPayload.business_type)
  const targetRows = readArray(refreshPayload.targetReplacementRows)
  const refreshBlockers = arrayOfStrings(refreshPayload.blockers)
  const refreshHardBlockers = unique(refreshBlockers.filter((blocker) => !EXPECTED_REFRESH_BLOCKERS.has(blocker)))
  const packageHardBlockers = unique([
    ...refreshHardBlockers,
    ...arrayOfStrings(materializationPayload.packageHardBlockers),
  ])
  const materializationPlan = readRecord(materializationPayload.materializationPlan)
  const command = buildMaterializationCommand({
    refreshPackagePath,
    materializationPath,
    environment: effectiveEnvironment,
    operatorApprovalRef: effectiveOperatorApprovalRef,
    materializedBy: effectiveMaterializedBy,
    mode: effectiveMode,
    allowMaterialization: effectiveAllowMaterialization,
  })
  const commandBlockers = unique([
    effectiveEnvironment ? null : 'candidate_baseline_materialization_command_environment_required',
    ALLOWED_ENVIRONMENTS.has(effectiveEnvironment) ? null : 'candidate_baseline_materialization_environment_must_be_local_or_staging',
    effectiveMode === 'execute' ? null : 'candidate_baseline_materialization_execute_mode_required',
    effectiveAllowMaterialization ? null : 'candidate_baseline_materialization_allow_flag_required',
    effectiveOperatorApprovalRef ? null : 'candidate_baseline_materialization_operator_approval_ref_required',
    effectiveMaterializedBy ? null : 'candidate_baseline_materialized_by_required',
  ])

  const identityBlockers = unique([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    businessType ? null : 'business_type_required',
    text(refreshPayload.baselineId) && text(materializationPayload.baselineId) && text(refreshPayload.baselineId) !== text(materializationPayload.baselineId)
      ? 'candidate_baseline_materialization_baseline_id_mismatch'
      : null,
    text(refreshPayload.projectId) && text(materializationPayload.projectId) && text(refreshPayload.projectId) !== text(materializationPayload.projectId)
      ? 'candidate_baseline_materialization_project_id_mismatch'
      : null,
    text(refreshPayload.businessType) && text(materializationPayload.businessType) && text(refreshPayload.businessType) !== text(materializationPayload.businessType)
      ? 'candidate_baseline_materialization_business_type_mismatch'
      : null,
  ])
  const refreshPackageBlockers = unique([
    Object.keys(refreshPayload).length > 0 ? null : 'candidate_refresh_package_required',
    text(refreshPayload.status) === 'refresh_required' ? null : 'candidate_refresh_package_not_refresh_required',
    refreshPayload.refreshRequired === true ? null : 'candidate_refresh_required_flag_missing',
    refreshPayload.productionReady === false ? null : 'candidate_refresh_package_must_not_mark_production_ready',
    readRecord(refreshPayload.operationPlan).mode === EXPECTED_OPERATION_MODE ? null : 'candidate_refresh_operation_mode_invalid',
    packageHardBlockers.length === 0 ? null : 'candidate_baseline_materialization_refresh_package_has_unresolved_hard_blockers',
    targetRows.length > 0 ? null : 'candidate_baseline_materialization_target_rows_required',
    targetRows.every(isSafeReplacementRow) ? null : 'candidate_baseline_materialization_rows_must_be_candidate_only_no_runtime_writes',
  ])
  const materializationReportBlockers = unique([
    Object.keys(materializationPayload).length > 0 ? null : 'candidate_baseline_materialization_report_required',
    materializationPayload.productionReady === false ? null : 'candidate_baseline_materialization_report_must_not_mark_production_ready',
    refreshRefMatches(materializationPayload.evidence?.refreshPackageRef, refreshPackagePath, refreshPackageSha256) ? null : 'candidate_baseline_materialization_refresh_package_ref_mismatch',
    readNumber(materializationPlan.targetReplacementRowCount ?? materializationPlan.target_replacement_row_count) > 0
      ? null
      : 'candidate_baseline_materialization_target_replacement_rows_required',
    materializationPlan.wouldInsertCandidateBaseline === true || materializationPlan.would_insert_candidate_baseline === true
      ? null
      : 'candidate_baseline_materialization_candidate_baseline_insert_plan_required',
    materializationPlan.wouldInsertCandidateBaselineItems === true || materializationPlan.would_insert_candidate_baseline_items === true
      ? null
      : 'candidate_baseline_materialization_candidate_baseline_items_insert_plan_required',
  ])
  const unlockBlockers = [
    unlockValue === '1' ? null : 'candidate_baseline_materialization_unlock_not_present',
  ].filter(Boolean)
  const actorBlockers = unique([
    effectiveMaterializedBy && isHumanActor(effectiveMaterializedBy) ? null : effectiveMaterializedBy ? 'human_candidate_baseline_materialization_actor_required' : null,
  ])
  const blockers = unique([
    ...identityBlockers,
    ...refreshPackageBlockers,
    ...materializationReportBlockers,
    ...commandBlockers,
    ...unlockBlockers,
    ...actorBlockers,
  ])
  const status = blockers.length === 0 ? 'ready_for_candidate_baseline_materialization' : 'blocked'
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-candidate-baseline-materialization-readiness-seal/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-candidate-baseline-materialization-readiness',
    status,
    productionReady: false,
    baselineId,
    projectId,
    businessType,
    environment: effectiveEnvironment,
    refreshPackageRef: `candidate_refresh_package:${repoRelative(refreshPackagePath)}${refreshPackageSha256 ? `#sha256=${refreshPackageSha256}` : ''}`,
    materializationRef: `candidate_baseline_materialization:${repoRelative(materializationPath)}`,
    refreshPackageStatus: text(refreshPayload.status) || 'not_generated',
    materializationStatus: text(materializationPayload.status) || 'not_generated',
    materializationCommand: command,
    materializationCommandReady: commandBlockers.length === 0,
    commandArgumentSummary: {
      refreshPackage: repoRelative(refreshPackagePath),
      output: repoRelative(materializationPath),
      environment: effectiveEnvironment,
      operatorApprovalRef: effectiveOperatorApprovalRef,
      materializedBy: effectiveMaterializedBy,
      mode: effectiveMode,
      allowMaterialization: effectiveAllowMaterialization,
      blockers: commandBlockers,
    },
    unlock: {
      variable: REQUIRED_UNLOCK,
      requiredValue: '1',
      present: unlockValue === '1',
      storagePolicy: 'environment_only_not_repository_or_report_secret',
    },
    blockers,
    executionControl: {
      executeReady: status === 'ready_for_candidate_baseline_materialization',
      operatorMustRunManually: true,
      candidateBaselineMaterializationMayWriteCandidateBaselineTablesOnly: true,
      doesNotRunCandidateBaselineMaterialization: true,
    },
    nextCommands: {
      setUnlockPowerShell: `$env:${REQUIRED_UNLOCK}='1'`,
      executeCandidateBaselineMaterialization: command,
      refreshOperatorHandoff: 'npm.cmd run evidence:default-master-plan:operator-handoff',
      refreshOperatorHandoffPreflight: 'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
      refreshRealEvidenceGaps: 'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
    },
    mutationBoundary: {
      readsRefreshPackage: true,
      readsMaterializationReport: true,
      checksEnvironmentUnlock: true,
      commandsExecuted: 0,
      doesNotRunCandidateBaselineMaterialization: true,
      doesNotConnectDatabase: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesCandidateBaselines: false,
      writesTaskBaselineItems: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function buildMaterializationCommand({
  refreshPackagePath,
  materializationPath,
  environment,
  operatorApprovalRef,
  materializedBy,
  mode,
  allowMaterialization,
}) {
  const parts = [
    'node',
    'project-testing/tools/run-default-master-plan-candidate-baseline-materialization.mjs',
    '--refresh-package',
    repoRelative(refreshPackagePath),
    '--output',
    repoRelative(materializationPath),
    '--environment',
    environment || '<environment>',
  ]
  if (operatorApprovalRef) parts.push('--operator-approval-ref', operatorApprovalRef)
  if (materializedBy) parts.push('--materialized-by', materializedBy)
  if (mode) parts.push('--mode', mode)
  if (allowMaterialization) parts.push('--allow-materialization')
  return parts.map((part) => needsQuoting(part) ? JSON.stringify(part) : part).join(' ')
}

function refreshRefMatches(ref, refreshPackagePath, expectedSha256 = '') {
  const raw = text(ref)
  if (!raw) return false
  const match = raw.match(/^candidate_refresh_package:(.+?)(?:#sha256=([a-f0-9]{64}))?$/)
  if (!match) return false
  if (!sameResolvedPath(match[1], refreshPackagePath)) return false
  const refSha256 = text(match[2]).toLowerCase()
  const expected = text(expectedSha256).toLowerCase()
  return !refSha256 || !expected || refSha256 === expected
}

function sameResolvedPath(candidatePath, expectedPath) {
  return path.resolve(REPO_ROOT, candidatePath) === path.resolve(expectedPath)
}

function isSafeReplacementRow(row) {
  const record = readRecord(row)
  return record.candidateOnly === true
    && record.writesTasks === false
    && record.writesTaskDependencies === false
    && record.writesProductionDependencies !== true
    && record.writesRuntimePublication !== true
}

function isHumanActor(value) {
  const actor = text(value)
  return Boolean(actor) && !AUTOMATION_ACTOR_PATTERNS.some((pattern) => pattern.test(actor))
}

function renderMarkdown(report) {
  const lines = [
    '# Candidate Baseline Materialization Readiness Seal',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady ? 'yes' : 'no'}`,
    `- baselineId: ${report.baselineId || 'missing'}`,
    `- projectId: ${report.projectId || 'missing'}`,
    `- businessType: ${report.businessType || 'missing'}`,
    `- environment: ${report.environment || 'missing'}`,
    `- refreshPackageStatus: ${report.refreshPackageStatus}`,
    `- materializationStatus: ${report.materializationStatus}`,
    `- materializationCommandReady: ${report.materializationCommandReady ? 'yes' : 'no'}`,
    `- unlockPresent: ${report.unlock.present ? 'yes' : 'no'}`,
    `- executeReady: ${report.executionControl.executeReady ? 'yes' : 'no'}`,
    '',
    '## Blockers',
    '',
    ...(report.blockers.length > 0 ? report.blockers.map((blocker) => `- ${blocker}`) : ['- none']),
    '',
    '## Mutation Boundary',
    '',
    `- commandsExecuted: ${report.mutationBoundary.commandsExecuted}`,
    `- doesNotConnectDatabase: ${report.mutationBoundary.doesNotConnectDatabase ? 'yes' : 'no'}`,
    `- writesCandidateBaselines: ${report.mutationBoundary.writesCandidateBaselines ? 'yes' : 'no'}`,
    `- writesTaskBaselineItems: ${report.mutationBoundary.writesTaskBaselineItems ? 'yes' : 'no'}`,
    `- writesTasks: ${report.mutationBoundary.writesTasks ? 'yes' : 'no'}`,
    `- writesRuntimePublication: ${report.mutationBoundary.writesRuntimePublication ? 'yes' : 'no'}`,
    '',
    '## Next Commands',
    '',
    `- setUnlockPowerShell: ${report.nextCommands.setUnlockPowerShell}`,
    `- executeCandidateBaselineMaterialization: ${report.nextCommands.executeCandidateBaselineMaterialization || 'missing'}`,
    `- refreshOperatorHandoff: ${report.nextCommands.refreshOperatorHandoff}`,
    `- refreshOperatorHandoffPreflight: ${report.nextCommands.refreshOperatorHandoffPreflight}`,
    `- refreshRealEvidenceGaps: ${report.nextCommands.refreshRealEvidenceGaps}`,
  ]
  return `${lines.join('\n')}\n`
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return {}
  }
}

async function readJsonWithHashIfPresent(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8')
    const { createHash } = await import('node:crypto')
    return {
      json: JSON.parse(raw),
      sha256: createHash('sha256').update(raw).digest('hex'),
    }
  } catch {
    return {
      json: {},
      sha256: null,
    }
  }
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : []
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return ''
}

function text(value) {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replaceAll('\\', '/')
}

function markdownPathFor(filePath) {
  return filePath.replace(/\.json$/i, '.md')
}

function needsQuoting(value) {
  return /\s/.test(String(value))
}

async function main() {
  const args = parseArgs()
  if (args.help) {
    console.log([
      'Usage: node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs',
      '  [--refresh-package <candidate-refresh-package.json>]',
      '  [--materialization <candidate-baseline-materialization.json>]',
      '  [--output <candidate-baseline-materialization-readiness-seal.json>]',
      '  [--environment local|staging]',
      '  [--operator-approval-ref <ref>]',
      '  [--materialized-by <user-id-or-name>]',
      '  [--mode dry-run|execute]',
      '  [--allow-materialization]',
    ].join('\n'))
    return
  }
  const report = await checkDefaultMasterPlanCandidateBaselineMaterializationReadiness(args)
  console.log(JSON.stringify({
    status: report.status,
    productionReady: report.productionReady,
    materializationCommandReady: report.materializationCommandReady,
    unlockPresent: report.unlock.present,
    blockerCount: report.blockers.length,
    output: args.output,
  }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error))
    process.exitCode = 1
  })
}
