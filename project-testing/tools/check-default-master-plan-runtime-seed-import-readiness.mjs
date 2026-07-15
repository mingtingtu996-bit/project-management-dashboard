#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-profiles')
const DEFAULT_IMPORT_GATE = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-import-gate.json')
const DEFAULT_EXECUTION = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-import-execution.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-import-readiness-seal.json')
const DEFAULT_IMPORT_COMMAND = 'npx.cmd tsx project-testing/tools/generate-default-master-plan-profile-report.mjs --import-active-duration-asset-seeds-smoke'
const AUTOMATION_ACTOR_PATTERNS = [
  /^codex\b/i,
  /^automation\b/i,
  /^bot\b/i,
  /^system\b/i,
]

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    importGate: DEFAULT_IMPORT_GATE,
    execution: DEFAULT_EXECUTION,
    output: DEFAULT_OUTPUT,
    allowImport: false,
    seedSmokeUserId: '',
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
    if (arg === '--import-gate') options.importGate = path.resolve(nextValue())
    else if (arg === '--execution') options.execution = path.resolve(nextValue())
    else if (arg === '--output') options.output = path.resolve(nextValue())
    else if (arg === '--allow-import') options.allowImport = true
    else if (arg === '--seed-smoke-user-id') options.seedSmokeUserId = text(nextValue())
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

export async function checkDefaultMasterPlanRuntimeSeedImportReadiness({
  importGate = DEFAULT_IMPORT_GATE,
  execution = DEFAULT_EXECUTION,
  output = DEFAULT_OUTPUT,
  allowImport = false,
  seedSmokeUserId = '',
  env = process.env,
  now = new Date(),
} = {}) {
  const importGatePath = path.resolve(importGate)
  const executionPath = path.resolve(execution)
  const outputPath = path.resolve(output)
  const [loadedImportGate, loadedExecution] = await Promise.all([
    readJsonWithHashIfPresent(importGatePath),
    readJsonWithHashIfPresent(executionPath),
  ])
  const gatePayload = loadedImportGate.json
  const executionPayload = loadedExecution.json
  const gate = readRecord(gatePayload.importGate ?? gatePayload.import_gate)
  const target = readRecord(gatePayload.target)
  const activation = readRecord(gatePayload.activation)
  const coverage = readRecord(gatePayload.coverage)
  const executionControl = readRecord(executionPayload.executionControl ?? executionPayload.execution_control)
  const executionImportGate = readRecord(executionPayload.importGate ?? executionPayload.import_gate)
  const gateStatus = text(gatePayload.status)
  const executionStatus = text(executionPayload.status)
  const gateImportAllowed = gate.importAllowed === true || gate.import_allowed === true
  const gateBlockers = arrayOfStrings(gatePayload.blockers)
  const executionBlockers = arrayOfStrings(executionPayload.blockers)
  const importRequired = (gate.importRequired ?? gate.import_required) !== false
  const unlockVariable = selectUnlockVariable({
    gate,
    target,
  })
  const unlockPresent = Boolean(unlockVariable) && text(env?.[unlockVariable]) === '1'
  const operatorId = text(seedSmokeUserId)
  const governedImportCommand = firstText(
    executionControl.governedImportCommand,
    executionControl.governed_import_command,
    gate.allowedCommand,
    gate.allowed_command,
    DEFAULT_IMPORT_COMMAND,
  )
  const executeCommand = buildExecuteCommand({
    importGatePath,
    executionPath,
    outputPath: executionPath,
    seedSmokeUserId: operatorId,
    allowImport,
  })

  const gateBlockerSet = unique([
    Object.keys(gatePayload).length > 0 ? null : 'runtime_seed_import_gate_report_required',
    gateStatus === 'runtime_seed_import_allowed' ? null : 'runtime_seed_import_gate_not_allowed',
    gateImportAllowed ? null : 'runtime_seed_import_gate_not_allowed',
    importRequired ? null : 'runtime_seed_import_not_required',
    gateBlockers.length === 0 ? null : 'runtime_seed_import_gate_blockers_present',
    readNumber(coverage.missingStableCodeCount ?? coverage.missing_stable_code_count) === 0
      ? null
      : 'runtime_seed_import_coverage_missing_stable_codes',
    activation.readyForActivation === true || activation.ready_for_activation === true
      ? null
      : 'runtime_seed_import_activation_not_ready',
  ])
  const commandBlockers = unique([
    gateStatus === 'runtime_seed_import_allowed' && gateImportAllowed ? null : 'runtime_seed_import_command_gate_not_allowed',
    governedImportCommand ? null : 'runtime_seed_import_command_required',
    containsPlaceholder(governedImportCommand) ? 'runtime_seed_import_command_contains_placeholders' : null,
    isRecognizedImportCommand(governedImportCommand) ? null : 'runtime_seed_import_command_missing_seed_import_flag',
  ])
  const executionEvidenceBlockers = unique([
    Object.keys(executionPayload).length > 0 ? null : 'runtime_seed_import_execution_report_required',
    executionPayload.productionReady === false ? null : 'runtime_seed_import_execution_must_not_mark_production_ready',
    executionControl.executionAllowed === true ? 'runtime_seed_import_execution_report_already_allows_execution' : null,
    executionControl.allowImportFlagPresent === true ? 'runtime_seed_import_execution_report_already_has_allow_import' : null,
    text(executionControl.seedSmokeUserId ?? executionControl.seed_smoke_user_id) ? 'runtime_seed_import_execution_report_already_has_seed_smoke_user_id' : null,
    ...writeBoundaryBlockers(executionPayload),
  ])
  const alignmentBlockers = unique([
    text(executionImportGate.status) && gateStatus && text(executionImportGate.status) !== gateStatus
      ? 'runtime_seed_import_execution_gate_status_mismatch'
      : null,
    (executionImportGate.importAllowed === true || executionImportGate.import_allowed === true) !== gateImportAllowed
      ? 'runtime_seed_import_execution_gate_allowed_mismatch'
      : null,
  ])
  const operatorBlockers = unique([
    allowImport ? null : 'runtime_seed_import_execution_allow_import_required',
    operatorId ? null : 'runtime_seed_import_seed_smoke_user_id_required',
    operatorId && isHumanActor(operatorId) ? null : operatorId ? 'human_runtime_seed_import_actor_required' : null,
  ])
  const unlockBlockers = [
    unlockVariable ? null : 'runtime_seed_import_unlock_variable_required',
    unlockPresent ? null : 'runtime_seed_import_unlock_not_present',
  ].filter(Boolean)
  const blockers = unique([
    ...gateBlockerSet,
    ...commandBlockers,
    ...executionEvidenceBlockers,
    ...alignmentBlockers,
    ...operatorBlockers,
    ...unlockBlockers,
  ])
  const status = blockers.length === 0 ? 'ready_for_runtime_seed_import_execution' : 'blocked'

  const report = {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-readiness-seal/v1',
    generatedAt: now.toISOString(),
    source: 'check-default-master-plan-runtime-seed-import-readiness',
    status,
    productionReady: false,
    importGateRef: evidenceRef('runtime_seed_import_gate', loadedImportGate),
    executionRef: evidenceRef('runtime_seed_import_execution', loadedExecution),
    target: {
      targetClass: text(target.targetClass ?? target.target_class),
      host: text(target.host),
      port: readNumber(target.port),
    },
    importGateStatus: gateStatus || 'not_generated',
    executionStatus: executionStatus || 'not_generated',
    importMode: text(gate.importMode ?? gate.import_mode),
    importRequired,
    importAllowed: gateImportAllowed,
    importCommand: governedImportCommand,
    importCommandReady: commandBlockers.length === 0,
    commandArgumentSummary: {
      importGate: repoRelative(importGatePath),
      execution: repoRelative(executionPath),
      output: repoRelative(executionPath),
      allowImport: allowImport === true,
      seedSmokeUserId: operatorId || null,
      blockers: commandBlockers,
    },
    unlock: {
      variable: unlockVariable,
      requiredValue: '1',
      present: unlockPresent,
      storagePolicy: 'environment_only_not_repository_or_report_secret',
    },
    blockers,
    gateBlockers,
    executionBlockers,
    executionControl: {
      executeReady: status === 'ready_for_runtime_seed_import_execution',
      operatorMustRunManually: true,
      runtimeSeedImportMayWriteAlgorithmSeedTablesOnly: true,
      doesNotRunRuntimeSeedImport: true,
    },
    nextCommands: {
      setUnlockPowerShell: unlockVariable ? `$env:${unlockVariable}='1'` : '',
      executeRuntimeSeedImport: executeCommand,
      refreshRuntimeSeedPostImport: 'npm.cmd run evidence:default-master-plan:runtime-seed-post-import',
      refreshRuntimeSeedPipeline: 'npm.cmd run evidence:default-master-plan:runtime-seed-pipeline',
      refreshOperatorHandoff: 'npm.cmd run evidence:default-master-plan:operator-handoff',
      refreshOperatorHandoffPreflight: 'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
      refreshRealEvidenceGaps: 'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
    },
    mutationBoundary: {
      readsRuntimeSeedImportGate: true,
      readsRuntimeSeedImportExecution: true,
      checksEnvironmentUnlock: true,
      commandsExecuted: 0,
      doesNotRunRuntimeSeedImport: true,
      doesNotConnectDatabase: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function selectUnlockVariable({ gate, target }) {
  const targetClass = text(target.targetClass ?? target.target_class)
  const localUnlock = text(gate.localUnlockEnv ?? gate.local_unlock_env)
  const remoteUnlock = text(gate.remoteUnlockEnv ?? gate.remote_unlock_env)
  if (targetClass === 'local_supabase' && localUnlock) return localUnlock
  return localUnlock || remoteUnlock
}

function buildExecuteCommand({
  importGatePath,
  outputPath,
  seedSmokeUserId,
  allowImport,
}) {
  const parts = [
    'node',
    'project-testing/tools/run-default-master-plan-runtime-seed-import-execution.mjs',
    '--import-gate',
    repoRelative(importGatePath),
    '--post-import-verification',
    'project-testing/reports/default-master-plan-profiles/runtime-seed-post-import-verification.json',
    '--output',
    repoRelative(outputPath),
  ]
  if (allowImport) parts.push('--allow-import')
  if (seedSmokeUserId) parts.push('--seed-smoke-user-id', seedSmokeUserId)
  return parts.map((part) => needsQuoting(part) ? JSON.stringify(part) : part).join(' ')
}

function isRecognizedImportCommand(command) {
  const normalized = text(command)
  return normalized.includes('--import-active-duration-asset-seeds-smoke')
    || normalized.includes('--import-active-standard-duration-seed-smoke')
}

function writeBoundaryBlockers(payload) {
  const mutationBoundary = readRecord(payload.mutationBoundary ?? payload.mutation_boundary)
  return unique([
    mutationBoundary.writesProductionTables === true || mutationBoundary.writes_production_tables === true
      ? 'runtime_seed_import_readiness_writes_production_tables'
      : null,
    mutationBoundary.writesProductionTablesOutsideAlgorithmSeedImport === true || mutationBoundary.writes_production_tables_outside_algorithm_seed_import === true
      ? 'runtime_seed_import_readiness_write_boundary_violation'
      : null,
    mutationBoundary.writesTasks === true || mutationBoundary.writes_tasks === true
      ? 'runtime_seed_import_readiness_writes_tasks'
      : null,
    mutationBoundary.writesTaskDependencies === true || mutationBoundary.writes_task_dependencies === true
      ? 'runtime_seed_import_readiness_writes_task_dependencies'
      : null,
    mutationBoundary.writesRuntimePublication === true || mutationBoundary.writes_runtime_publication === true
      ? 'runtime_seed_import_readiness_writes_runtime_publication'
      : null,
    mutationBoundary.writesBaselines === true || mutationBoundary.writes_baselines === true
      ? 'runtime_seed_import_readiness_writes_baselines'
      : null,
  ])
}

function evidenceRef(prefix, loaded) {
  return `${prefix}:${repoRelative(loaded.path)}${loaded.sha256 ? `#sha256=${loaded.sha256}` : ''}`
}

function renderMarkdown(report) {
  const lines = [
    '# Runtime Seed Import Readiness Seal',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady ? 'yes' : 'no'}`,
    `- targetClass: ${report.target.targetClass || 'missing'}`,
    `- importGateStatus: ${report.importGateStatus}`,
    `- executionStatus: ${report.executionStatus}`,
    `- importMode: ${report.importMode || 'missing'}`,
    `- importAllowed: ${report.importAllowed ? 'yes' : 'no'}`,
    `- importCommandReady: ${report.importCommandReady ? 'yes' : 'no'}`,
    `- unlockVariable: ${report.unlock.variable || 'missing'}`,
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
    `- doesNotRunRuntimeSeedImport: ${report.mutationBoundary.doesNotRunRuntimeSeedImport ? 'yes' : 'no'}`,
    `- doesNotConnectDatabase: ${report.mutationBoundary.doesNotConnectDatabase ? 'yes' : 'no'}`,
    `- writesAlgorithmSeedVersions: ${report.mutationBoundary.writesAlgorithmSeedVersions ? 'yes' : 'no'}`,
    `- writesAlgorithmSeedRecords: ${report.mutationBoundary.writesAlgorithmSeedRecords ? 'yes' : 'no'}`,
    `- writesAlgorithmSeedImportLogs: ${report.mutationBoundary.writesAlgorithmSeedImportLogs ? 'yes' : 'no'}`,
    `- writesTasks: ${report.mutationBoundary.writesTasks ? 'yes' : 'no'}`,
    `- writesTaskDependencies: ${report.mutationBoundary.writesTaskDependencies ? 'yes' : 'no'}`,
    `- writesRuntimePublication: ${report.mutationBoundary.writesRuntimePublication ? 'yes' : 'no'}`,
    '',
    '## Next Commands',
    '',
    `- setUnlockPowerShell: ${report.nextCommands.setUnlockPowerShell || 'missing'}`,
    `- executeRuntimeSeedImport: ${report.nextCommands.executeRuntimeSeedImport}`,
    `- refreshRuntimeSeedPostImport: ${report.nextCommands.refreshRuntimeSeedPostImport}`,
    `- refreshRuntimeSeedPipeline: ${report.nextCommands.refreshRuntimeSeedPipeline}`,
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
      path: filePath,
      sha256: createHash('sha256').update(raw).digest('hex'),
      json: JSON.parse(raw),
    }
  } catch {
    return {
      path: filePath,
      sha256: '',
      json: {},
    }
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
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function containsPlaceholder(value) {
  return /<[^>]+>/.test(text(value))
}

function isHumanActor(value) {
  const actor = text(value)
  return Boolean(actor)
    && !containsPlaceholder(actor)
    && !AUTOMATION_ACTOR_PATTERNS.some((pattern) => pattern.test(actor))
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
      'Usage: node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
      '  [--import-gate <runtime-seed-import-gate.json>]',
      '  [--execution <runtime-seed-import-execution.json>]',
      '  [--output <runtime-seed-import-readiness-seal.json>]',
      '  [--allow-import]',
      '  [--seed-smoke-user-id <auditable-operator-id>]',
    ].join('\n'))
    return
  }
  const report = await checkDefaultMasterPlanRuntimeSeedImportReadiness(args)
  console.log(JSON.stringify({
    status: report.status,
    productionReady: report.productionReady,
    importCommandReady: report.importCommandReady,
    unlockPresent: report.unlock.present,
    executeReady: report.executionControl.executeReady,
    blockerCount: report.blockers.length,
    output: repoRelative(path.resolve(args.output)),
  }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error))
    process.exitCode = 1
  })
}
