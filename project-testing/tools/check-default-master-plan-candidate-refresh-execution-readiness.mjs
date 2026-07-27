#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness')
const DEFAULT_AUTHORIZATION_PACKAGE = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-authorization-package.json')
const DEFAULT_PREFLIGHT = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-execution-preflight.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'candidate-refresh-execution-readiness-seal.json')
const REQUIRED_UNLOCK = 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH'

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    authorizationPackage: DEFAULT_AUTHORIZATION_PACKAGE,
    preflight: DEFAULT_PREFLIGHT,
    output: DEFAULT_OUTPUT,
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
    if (arg === '--authorization-package') options.authorizationPackage = path.resolve(nextValue())
    else if (arg === '--preflight') options.preflight = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function checkDefaultMasterPlanCandidateRefreshExecutionReadiness({
  authorizationPackage = DEFAULT_AUTHORIZATION_PACKAGE,
  preflight = DEFAULT_PREFLIGHT,
  output = DEFAULT_OUTPUT,
  env = process.env,
  now = new Date(),
} = {}) {
  const authorizationPackagePath = path.resolve(authorizationPackage)
  const preflightPath = path.resolve(preflight)
  const outputPath = path.resolve(output)
  const [loadedAuthorization, loadedPreflight] = await Promise.all([
    readJsonWithHashIfPresent(authorizationPackagePath),
    readJsonWithHashIfPresent(preflightPath),
  ])
  const authorizationPayload = loadedAuthorization.json
  const preflightPayload = loadedPreflight.json

  const authorizationMutationBoundary = readRecord(authorizationPayload.mutationBoundary)
  const preflightExecutionPlan = readRecord(preflightPayload.executionPlan)
  const command = text(readRecord(authorizationPayload.nextCommands).executeCandidateRefresh)
  const commandArgs = splitCommand(command)
  const commandArgSummary = summarizeExecutionCommandArgs(commandArgs, {
    authorizationPackagePath,
    preflightPath,
    readinessSealPath: outputPath,
  })
  const unlockValue = text(env?.[REQUIRED_UNLOCK])
  const packageReadinessBlockers = arrayOfStrings(authorizationPayload.packageReadinessBlockers)
  const packageStatus = text(authorizationPayload.status)
  const preflightStatus = text(preflightPayload.status)
  const baselineId = firstText(authorizationPayload.baselineId, preflightPayload.baselineId)
  const projectId = firstText(authorizationPayload.projectId, preflightPayload.projectId)
  const businessType = firstText(authorizationPayload.businessType, preflightPayload.businessType)
  const environment = firstText(authorizationPayload.environment, preflightExecutionPlan.environment)
  const identityBlockers = unique([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    text(authorizationPayload.baselineId) && text(preflightPayload.baselineId) && text(authorizationPayload.baselineId) !== text(preflightPayload.baselineId)
      ? 'candidate_refresh_readiness_baseline_id_mismatch'
      : null,
    text(authorizationPayload.projectId) && text(preflightPayload.projectId) && text(authorizationPayload.projectId) !== text(preflightPayload.projectId)
      ? 'candidate_refresh_readiness_project_id_mismatch'
      : null,
    businessType && text(authorizationPayload.businessType) && text(preflightPayload.businessType) && text(authorizationPayload.businessType) !== text(preflightPayload.businessType)
      ? 'candidate_refresh_readiness_business_type_mismatch'
      : null,
  ])
  const authorizationBlockers = unique([
    Object.keys(authorizationPayload).length > 0 ? null : 'candidate_refresh_authorization_package_required',
    packageStatus === 'authorization_package_ready' ? null : 'candidate_refresh_authorization_package_not_ready',
    authorizationPayload.productionReady === false ? null : 'candidate_refresh_authorization_package_must_not_mark_production_ready',
    packageReadinessBlockers.length === 0 ? null : 'candidate_refresh_authorization_package_readiness_blockers_present',
    authorizationMutationBoundary.packageOnly === true ? null : 'candidate_refresh_authorization_package_only_required',
    authorizationMutationBoundary.doesNotMutateDatabase === true ? null : 'candidate_refresh_authorization_package_no_db_mutation_required',
  ])
  const preflightBlockers = unique([
    Object.keys(preflightPayload).length > 0 ? null : 'candidate_refresh_execution_preflight_required',
    preflightStatus === 'ready_for_execute' ? null : 'candidate_refresh_preflight_not_ready_for_execute',
    preflightPayload.mayExecuteCandidateRefresh === true ? null : 'candidate_refresh_preflight_execute_flag_required',
    arrayOfStrings(preflightPayload.blockers).length === 0 ? null : 'candidate_refresh_preflight_blockers_present',
    authPreflightRefMatches(authorizationPayload.preflightRef, preflightPath) ? null : 'candidate_refresh_authorization_preflight_ref_mismatch',
  ])
  const commandBlockers = unique([
    command ? null : 'candidate_refresh_execution_command_required',
    ...commandArgSummary.blockers,
    commandArgSummary.mode === 'execute' ? null : 'candidate_refresh_execution_command_execute_mode_required',
    commandArgSummary.allowRefresh === true ? null : 'candidate_refresh_execution_command_allow_refresh_required',
    commandArgSummary.environment === environment ? null : 'candidate_refresh_execution_command_environment_mismatch',
    commandArgSummary.refreshedBy && commandArgSummary.refreshedBy === text(preflightExecutionPlan.refreshedBy)
      ? null
      : 'candidate_refresh_execution_command_refreshed_by_mismatch',
    commandArgSummary.operatorApprovalRef && commandArgSummary.operatorApprovalRef === text(preflightExecutionPlan.operatorApprovalRef)
      ? null
      : 'candidate_refresh_execution_command_operator_approval_ref_mismatch',
    containsPlaceholder(command) ? 'candidate_refresh_execution_command_contains_placeholders' : null,
  ])
  const unlockBlockers = [
    unlockValue === '1' ? null : 'candidate_refresh_execution_unlock_not_present',
  ].filter(Boolean)
  const blockers = unique([
    ...identityBlockers,
    ...authorizationBlockers,
    ...preflightBlockers,
    ...commandBlockers,
    ...unlockBlockers,
  ])
  const status = blockers.length === 0 ? 'ready_for_candidate_refresh_execution' : 'blocked'
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-candidate-refresh-execution-readiness-seal/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-candidate-refresh-execution-readiness',
    status,
    productionReady: false,
    baselineId,
    projectId,
    businessType,
    environment,
    executionTarget: normalizeTarget(preflightPayload.executionTarget),
    authorizationPackageRef: `candidate_refresh_authorization_package:${repoRelative(authorizationPackagePath)}#sha256=${loadedAuthorization.sha256 || 'missing'}`,
    preflightRef: `candidate_refresh_execution_preflight:${repoRelative(preflightPath)}#sha256=${loadedPreflight.sha256 || 'missing'}`,
    authorizationPackageStatus: packageStatus || 'not_generated',
    preflightStatus: preflightStatus || 'not_generated',
    preflightReady: preflightStatus === 'ready_for_execute' && preflightPayload.mayExecuteCandidateRefresh === true,
    executionCommand: command,
    executionCommandReady: commandBlockers.length === 0,
    commandArgumentSummary: {
      refreshPackage: commandArgSummary.refreshPackage,
      preflight: commandArgSummary.preflight,
      authorizationPackage: commandArgSummary.authorizationPackage,
      readinessSeal: commandArgSummary.readinessSeal,
      environment: commandArgSummary.environment,
      refreshedBy: commandArgSummary.refreshedBy,
      operatorApprovalRef: commandArgSummary.operatorApprovalRef,
      mode: commandArgSummary.mode,
      allowRefresh: commandArgSummary.allowRefresh,
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
      executeReady: status === 'ready_for_candidate_refresh_execution',
      operatorMustRunManually: true,
      candidateRefreshExecutionMayWriteCandidateTaskBaselineItemsOnly: true,
      doesNotRunCandidateRefresh: true,
    },
    nextCommands: {
      setUnlockPowerShell: `$env:${REQUIRED_UNLOCK}='1'`,
      executeCandidateRefresh: command,
      refreshOperatorHandoff: 'npm.cmd run evidence:default-master-plan:operator-handoff',
      refreshOperatorHandoffPreflight: 'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
      refreshRealEvidenceGaps: 'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
    },
    mutationBoundary: {
      readsAuthorizationPackage: true,
      readsPreflight: true,
      checksEnvironmentUnlock: true,
      commandsExecuted: 0,
      doesNotRunCandidateRefresh: true,
      doesNotConnectDatabase: true,
      writesReportFiles: true,
      writesProductionTables: false,
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

function summarizeExecutionCommandArgs(args, { authorizationPackagePath, preflightPath, readinessSealPath }) {
  const refreshPackage = flagValue(args, '--refresh-package')
  const preflight = flagValue(args, '--preflight')
  const authorizationPackage = flagValue(args, '--authorization-package')
  const readinessSeal = flagValue(args, '--readiness-seal')
  const environment = flagValue(args, '--environment')
  const refreshedBy = flagValue(args, '--refreshed-by')
  const operatorApprovalRef = flagValue(args, '--operator-approval-ref')
  const mode = flagValue(args, '--mode')
  const allowRefresh = args.includes('--allow-refresh')
  const blockers = unique([
    refreshPackage ? null : 'candidate_refresh_execution_command_refresh_package_flag_required',
    preflight ? null : 'candidate_refresh_execution_command_preflight_flag_required',
    authorizationPackage ? null : 'candidate_refresh_execution_command_authorization_package_flag_required',
    readinessSeal ? null : 'candidate_refresh_execution_command_readiness_seal_flag_required',
    environment ? null : 'candidate_refresh_execution_command_environment_flag_required',
    refreshedBy ? null : 'candidate_refresh_execution_command_refreshed_by_flag_required',
    operatorApprovalRef ? null : 'candidate_refresh_execution_command_operator_approval_ref_flag_required',
    mode ? null : 'candidate_refresh_execution_command_mode_flag_required',
    allowRefresh ? null : 'candidate_refresh_execution_command_allow_refresh_flag_required',
    preflight && sameResolvedPath(preflight, preflightPath) ? null : preflight ? 'candidate_refresh_execution_command_preflight_path_mismatch' : null,
    authorizationPackage && sameResolvedPath(authorizationPackage, authorizationPackagePath)
      ? null
      : authorizationPackage ? 'candidate_refresh_execution_command_authorization_package_path_mismatch' : null,
    readinessSeal && sameResolvedPath(readinessSeal, readinessSealPath)
      ? null
      : readinessSeal ? 'candidate_refresh_execution_command_readiness_seal_path_mismatch' : null,
  ])
  return {
    refreshPackage,
    preflight,
    authorizationPackage,
    readinessSeal,
    environment,
    refreshedBy,
    operatorApprovalRef,
    mode,
    allowRefresh,
    blockers,
  }
}

function authPreflightRefMatches(ref, preflightPath) {
  const raw = text(ref)
  if (!raw) return false
  const match = raw.match(/^candidate_refresh_execution_preflight:(.+?)(?:#sha256=[a-f0-9]{64})?$/)
  if (!match) return false
  return sameResolvedPath(match[1], preflightPath)
}

function sameResolvedPath(commandPath, expectedPath) {
  return path.resolve(REPO_ROOT, commandPath) === path.resolve(expectedPath)
}

function flagValue(args, flag) {
  const index = args.indexOf(flag)
  if (index < 0) return ''
  const value = args[index + 1]
  return value && !value.startsWith('--') ? value : ''
}

function splitCommand(command) {
  const input = text(command)
  const args = []
  let current = ''
  let quote = ''
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quote) {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (current) args.push(current)
  return args
}

function renderMarkdown(report) {
  const lines = [
    '# Candidate Refresh Execution Readiness Seal',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady ? 'yes' : 'no'}`,
    `- baselineId: ${report.baselineId || 'missing'}`,
    `- projectId: ${report.projectId || 'missing'}`,
    `- businessType: ${report.businessType || 'missing'}`,
    `- environment: ${report.environment || 'missing'}`,
    `- authorizationPackageStatus: ${report.authorizationPackageStatus}`,
    `- preflightStatus: ${report.preflightStatus}`,
    `- executionCommandReady: ${report.executionCommandReady ? 'yes' : 'no'}`,
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
    `- writesProductionTables: ${report.mutationBoundary.writesProductionTables ? 'yes' : 'no'}`,
    `- writesRuntimePublication: ${report.mutationBoundary.writesRuntimePublication ? 'yes' : 'no'}`,
    '',
    '## Next Commands',
    '',
    `- setUnlockPowerShell: ${report.nextCommands.setUnlockPowerShell}`,
    `- executeCandidateRefresh: ${report.nextCommands.executeCandidateRefresh || 'missing'}`,
    `- refreshOperatorHandoff: ${report.nextCommands.refreshOperatorHandoff}`,
    `- refreshOperatorHandoffPreflight: ${report.nextCommands.refreshOperatorHandoffPreflight}`,
    `- refreshRealEvidenceGaps: ${report.nextCommands.refreshRealEvidenceGaps}`,
  ]
  return `${lines.join('\n')}\n`
}

async function readJsonWithHashIfPresent(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8')
    return {
      json: JSON.parse(raw),
      sha256: createHash('sha256').update(raw).digest('hex'),
    }
  } catch {
    return { json: {}, sha256: null }
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

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
  return typeof value === 'string' ? value.trim() : ''
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function containsPlaceholder(value) {
  return /<[^>]+>/.test(text(value))
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replaceAll('\\', '/')
}

function markdownPathFor(filePath) {
  return filePath.replace(/\.json$/i, '.md')
}

async function main() {
  const args = parseArgs()
  if (args.help) {
    console.log([
      'Usage: node project-testing/tools/check-default-master-plan-candidate-refresh-execution-readiness.mjs',
      '  [--authorization-package <candidate-refresh-authorization-package.json>]',
      '  [--preflight <candidate-refresh-execution-preflight.json>]',
      '  [--output <candidate-refresh-execution-readiness-seal.json>]',
    ].join('\n'))
    return
  }
  const report = await checkDefaultMasterPlanCandidateRefreshExecutionReadiness(args)
  console.log(JSON.stringify({
    status: report.status,
    productionReady: report.productionReady,
    executionCommandReady: report.executionCommandReady,
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
