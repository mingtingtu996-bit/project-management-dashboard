#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_IMPORT_GATE = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-import-gate.json')
const DEFAULT_POST_IMPORT_VERIFICATION = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-post-import-verification.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-import-execution.json')

const IMPORT_COMMAND_BASE = [
  'npx.cmd',
  'tsx',
  'project-testing/tools/generate-default-master-plan-profile-report.mjs',
  '--import-active-standard-duration-seed-smoke',
]

const POST_IMPORT_STEPS = [
  {
    id: 'regenerate_profile_report',
    command: ['npx.cmd', 'tsx', 'project-testing/tools/generate-default-master-plan-profile-report.mjs'],
  },
  {
    id: 'runtime_seed_preflight',
    command: ['npm.cmd', 'run', 'evidence:default-master-plan:runtime-seed-preflight'],
  },
  {
    id: 'runtime_seed_post_import',
    command: ['npm.cmd', 'run', 'evidence:default-master-plan:runtime-seed-post-import'],
  },
]

export function parseArgs(argv) {
  const args = {
    importGate: DEFAULT_IMPORT_GATE,
    postImportVerification: DEFAULT_POST_IMPORT_VERIFICATION,
    output: DEFAULT_OUTPUT,
    allowImport: false,
    seedSmokeUserId: null,
    skipRun: false,
    failOnBlocked: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--import-gate') {
      args.importGate = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--post-import-verification') {
      args.postImportVerification = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--allow-import') {
      args.allowImport = true
      continue
    }
    if (arg === '--seed-smoke-user-id') {
      args.seedSmokeUserId = text(argv[index + 1]) || null
      index += 1
      continue
    }
    if (arg === '--skip-run') {
      args.skipRun = true
      continue
    }
    if (arg === '--fail-on-blocked') {
      args.failOnBlocked = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/run-default-master-plan-runtime-seed-import-execution.mjs [--import-gate <json>] [--post-import-verification <json>] [--output <json>] [--allow-import] [--seed-smoke-user-id <id>] [--skip-run] [--fail-on-blocked]')
      process.exit(0)
    }
  }

  return args
}

function text(value) {
  return String(value ?? '').trim()
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function uniqueStrings(values) {
  return [...new Set(readArray(values).map(text).filter(Boolean))]
}

function repoRelative(filePath) {
  return filePath ? path.relative(REPO_ROOT, filePath).replace(/\\/g, '/') : null
}

function sha256Text(content) {
  return createHash('sha256').update(content).digest('hex')
}

async function readJsonWithHash(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return {
    path: filePath,
    sha256: sha256Text(raw),
    json: JSON.parse(raw),
  }
}

function splitCommandLine(command) {
  const input = text(command)
  const args = []
  let current = ''
  let quote = ''
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    if (quote) {
      if (char === quote) quote = ''
      else if (char === '\\' && quote === '"' && input[index + 1]) {
        current += input[index + 1]
        index += 1
      } else current += char
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

function normalizeCommandForPlatform(command) {
  if (command[0] === 'node') return [process.execPath, ...command.slice(1)]
  if (process.platform !== 'win32') {
    if (command[0] === 'npx.cmd') return ['npx', ...command.slice(1)]
    if (command[0] === 'npm.cmd') return ['npm', ...command.slice(1)]
  }
  return command
}

export function shouldRunCommandThroughShell(command) {
  const executable = Array.isArray(command) ? command[0] : command
  return process.platform === 'win32' && /\.cmd$/i.test(text(executable))
}

export function buildRuntimeSeedImportExecutionSteps({ seedSmokeUserId, importCommandBase = null }) {
  const baseCommand = splitCommandLine(importCommandBase)
  const importCommandBaseParts = baseCommand.length > 0 ? baseCommand : IMPORT_COMMAND_BASE
  const bindingFlags = [
    '--env-file',
    '--expected-env-file-sha256',
    '--expected-target-fingerprint',
  ].flatMap((flag) => {
    const index = importCommandBaseParts.indexOf(flag)
    return index >= 0 && importCommandBaseParts[index + 1]
      ? [flag, importCommandBaseParts[index + 1]]
      : []
  })
  const importCommand = [
    ...importCommandBaseParts,
    '--seed-smoke-user-id',
    seedSmokeUserId,
  ]
  return [
    {
      id: 'runtime_seed_import',
      command: importCommand,
      mayWriteAlgorithmSeeds: true,
    },
    ...POST_IMPORT_STEPS.map((step) => ({
      ...step,
      command: step.id === 'regenerate_profile_report'
        ? [...step.command, ...bindingFlags]
        : step.command,
      mayWriteAlgorithmSeeds: false,
    })),
  ]
}

function summarizeImportGate(importGateReport) {
  const record = readRecord(importGateReport)
  const gate = readRecord(record.importGate)
  const target = readRecord(record.target)
  const allowedCommand = text(gate.allowedCommand) || null
  const commandParts = splitCommandLine(allowedCommand)
  const flagValue = (flag) => {
    const index = commandParts.indexOf(flag)
    return index >= 0 ? text(commandParts[index + 1]) : ''
  }
  return {
    status: text(record.status),
    importAllowed: gate.importAllowed === true,
    importMode: text(gate.importMode),
    allowedCommand,
    targetFingerprint: text(target.targetFingerprint),
    envFileRef: text(target.envFileRef),
    envFileSha256: text(target.envFileSha256),
    commandTargetFingerprint: flagValue('--expected-target-fingerprint'),
    commandEnvFileRef: flagValue('--env-file'),
    commandEnvFileSha256: flagValue('--expected-env-file-sha256'),
    blockers: uniqueStrings(record.blockers),
    manualActions: uniqueStrings(record.manualActions),
  }
}

export function evaluateRuntimeSeedImportExecutionGate({
  importGateReport,
  allowImport = false,
  seedSmokeUserId = null,
}) {
  const importGate = summarizeImportGate(importGateReport)
  const blockers = uniqueStrings([
    importGate.importAllowed ? null : 'runtime_seed_import_gate_not_allowed',
    !importGate.importAllowed || importGate.targetFingerprint ? null : 'runtime_seed_import_gate_target_fingerprint_required',
    !importGate.importAllowed || (importGate.targetFingerprint && importGate.commandTargetFingerprint === importGate.targetFingerprint)
      ? null
      : 'runtime_seed_import_command_target_fingerprint_mismatch',
    importGate.importAllowed && importGate.envFileRef && importGate.commandEnvFileRef !== importGate.envFileRef
      ? 'runtime_seed_import_command_env_file_mismatch'
      : null,
    importGate.importAllowed && importGate.envFileSha256 && importGate.commandEnvFileSha256 !== importGate.envFileSha256
      ? 'runtime_seed_import_command_env_file_hash_mismatch'
      : null,
    allowImport ? null : 'runtime_seed_import_execution_allow_import_required',
    seedSmokeUserId ? null : 'runtime_seed_import_seed_smoke_user_id_required',
  ])
  return {
    executionAllowed: blockers.length === 0,
    importGate,
    blockers,
  }
}

export async function runExecutionStep(step, options = {}) {
  const cwd = options.cwd ?? REPO_ROOT
  const startedAt = Date.now()
  const command = normalizeCommandForPlatform(step.command)
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env ?? process.env,
      shell: shouldRunCommandThroughShell(command),
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      resolve({
        id: step.id,
        command: step.command.join(' '),
        mayWriteAlgorithmSeeds: step.mayWriteAlgorithmSeeds === true,
        exitCode: null,
        status: 'execution_error',
        durationMs: Date.now() - startedAt,
        stdout: stdout.slice(-4000),
        stderr: (stderr || error.message).slice(-4000),
      })
    })
    child.on('close', (code) => {
      resolve({
        id: step.id,
        command: step.command.join(' '),
        mayWriteAlgorithmSeeds: step.mayWriteAlgorithmSeeds === true,
        exitCode: code,
        status: code === 0 ? 'completed' : 'failed',
        durationMs: Date.now() - startedAt,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
      })
    })
  })
}

function importGateRef(loadedImportGate) {
  const record = readRecord(loadedImportGate?.json)
  return {
    path: repoRelative(loadedImportGate?.path),
    sha256: loadedImportGate?.sha256 ?? null,
    schemaVersion: text(record.schemaVersion) || null,
    source: text(record.source) || null,
    status: text(record.status) || null,
  }
}

function postImportVerificationRef(loadedPostImportVerification) {
  const record = readRecord(loadedPostImportVerification?.json)
  return {
    path: repoRelative(loadedPostImportVerification?.path),
    sha256: loadedPostImportVerification?.sha256 ?? null,
    schemaVersion: text(record.schemaVersion) || null,
    source: text(record.source) || null,
    status: text(record.status) || null,
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

function summarizePostImportVerification(report) {
  const record = readRecord(report)
  const provided = Object.keys(record).length > 0
  const readError = text(record.__readError)
  const runtimeSeedEvidence = readRecord(record.runtimeSeedEvidence)
  const runtimeT2Evidence = readRecord(record.runtimeT2Evidence)
  const mutationBoundary = readRecord(record.mutationBoundary)
  const writeBoundaryViolationFields = runtimeSeedPostImportWriteBoundaryFields()
    .filter((field) => mutationBoundary[field] === true)
  const sourceBlockers = uniqueStrings(record.blockers)
  const status = readError || text(record.status) || (provided ? 'runtime_seed_post_import_verification_missing_status' : 'not_provided')
  const noWriteBoundary = provided && !readError && Object.keys(mutationBoundary).length > 0 && writeBoundaryViolationFields.length === 0
  const activeStandardWorkDurationSeedReady = status === 'runtime_seed_post_import_verified'
    && sourceBlockers.length === 0
    && noWriteBoundary
    && runtimeSeedEvidence.allProfileRowsRuntime === true
    && Number(runtimeSeedEvidence.profileRowCount ?? 0) > 0
    && Number(runtimeSeedEvidence.fallbackOrMissingSeedRowCount ?? 0) === 0
  const activeT2RhythmTemplateReady = status === 'runtime_seed_post_import_verified'
    && sourceBlockers.length === 0
    && noWriteBoundary
    && runtimeT2Evidence.allProfileT2RowsRuntime === true
    && Number(runtimeT2Evidence.profileRowCount ?? 0) > 0
    && Number(runtimeT2Evidence.fallbackOrMissingT2RowCount ?? 0) === 0
  const verified = activeStandardWorkDurationSeedReady && activeT2RhythmTemplateReady
  const blockers = provided
    ? uniqueStrings([
        readError ? 'runtime_seed_post_import_verification_file_read_failed' : null,
        ...sourceBlockers,
        status === 'runtime_seed_post_import_verified' ? null : 'runtime_seed_post_import_verification_not_verified',
        Object.keys(mutationBoundary).length > 0 ? null : 'runtime_seed_post_import_mutation_boundary_missing',
        writeBoundaryViolationFields.length > 0 ? 'runtime_seed_post_import_mutation_boundary_write_violation' : null,
        activeStandardWorkDurationSeedReady ? null : 'runtime_seed_post_import_active_standard_work_seed_not_ready',
        activeT2RhythmTemplateReady ? null : 'runtime_seed_post_import_active_t2_rhythm_template_not_ready',
      ])
    : ['runtime_seed_post_import_verification_file_required']

  return {
    provided,
    status,
    verified,
    activeStandardWorkDurationSeedReady,
    activeT2RhythmTemplateReady,
    blockers,
    runtimeSeedEvidence: {
      profileRowCount: Number(runtimeSeedEvidence.profileRowCount ?? 0),
      runtimeSeedRowCount: Number(runtimeSeedEvidence.runtimeSeedRowCount ?? 0),
      fallbackOrMissingSeedRowCount: Number(runtimeSeedEvidence.fallbackOrMissingSeedRowCount ?? 0),
      allProfileRowsRuntime: runtimeSeedEvidence.allProfileRowsRuntime === true,
    },
    runtimeT2Evidence: {
      profileRowCount: Number(runtimeT2Evidence.profileRowCount ?? 0),
      runtimeT2RowCount: Number(runtimeT2Evidence.runtimeT2RowCount ?? 0),
      fallbackOrMissingT2RowCount: Number(runtimeT2Evidence.fallbackOrMissingT2RowCount ?? 0),
      allProfileT2RowsRuntime: runtimeT2Evidence.allProfileT2RowsRuntime === true,
    },
    mutationBoundary: {
      noWriteBoundary,
      writeBoundaryViolationFields,
    },
  }
}

export function buildRuntimeSeedImportExecutionReport({
  importGateReport,
  loadedImportGate = null,
  postImportVerificationReport = {},
  loadedPostImportVerification = null,
  args = {},
  stepResults = [],
  generatedAt = new Date().toISOString(),
}) {
  const gate = evaluateRuntimeSeedImportExecutionGate({
    importGateReport,
    allowImport: args.allowImport === true,
    seedSmokeUserId: args.seedSmokeUserId,
  })
  const failedSteps = stepResults.filter((step) => step.status !== 'completed' && step.status !== 'skipped')
  const allStepsCompleted = stepResults.length > 0 && stepResults.every((step) => step.status === 'completed')
  const postImportStepCompleted = stepResults.some((step) => step.id === 'runtime_seed_post_import' && step.status === 'completed')
  const postImportVerification = summarizePostImportVerification(postImportVerificationReport)
  const postImportVerificationRequired = gate.executionAllowed && allStepsCompleted && postImportStepCompleted
  const postImportVerificationBlocked = postImportVerificationRequired && !postImportVerification.verified
  const status = !gate.executionAllowed
    ? 'runtime_seed_import_execution_blocked'
    : failedSteps.length > 0
      ? 'runtime_seed_import_execution_failed'
      : postImportVerificationBlocked
        ? 'runtime_seed_import_execution_post_import_blocked'
      : allStepsCompleted
        ? 'runtime_seed_import_execution_completed'
        : 'runtime_seed_import_execution_ready'
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-import-execution/v1',
    source: 'run-default-master-plan-runtime-seed-import-execution',
    generatedAt,
    status,
    importGate: gate.importGate,
    upstreamBlockers: gate.importGate.blockers,
    evidence: {
      importGate: importGateRef(loadedImportGate),
      postImportVerification: postImportVerificationRef(loadedPostImportVerification),
    },
    postImportVerification,
    executionControl: {
      executionAllowed: gate.executionAllowed,
      allowImportFlagPresent: args.allowImport === true,
      seedSmokeUserId: args.seedSmokeUserId ?? null,
      requiredExplicitFlags: ['--allow-import', '--seed-smoke-user-id'],
      governedImportCommand: args.seedSmokeUserId
        ? buildRuntimeSeedImportExecutionSteps({
            seedSmokeUserId: args.seedSmokeUserId,
            importCommandBase: gate.importGate.allowedCommand,
          })[0].command.join(' ')
        : (gate.importGate.allowedCommand || IMPORT_COMMAND_BASE.join(' ')),
    },
    steps: stepResults,
    blockers: uniqueStrings([
      ...gate.blockers,
      ...failedSteps.map((step) => `${step.id}_failed`),
      ...(postImportVerificationBlocked ? postImportVerification.blockers : []),
    ]),
    nextActions: !gate.executionAllowed
      ? uniqueStrings([
          ...gate.importGate.manualActions,
          gate.importGate.importAllowed ? null : 'rerun runtime seed evidence pipeline until import gate is allowed',
          args.allowImport === true ? null : 'rerun with --allow-import only after reviewing runtime-seed-import-gate.json',
          args.seedSmokeUserId ? null : 'provide --seed-smoke-user-id <auditable-operator-id>',
        ])
      : failedSteps.length > 0
        ? [
            `Fix failed runtime seed import execution step(s): ${failedSteps.map((step) => step.id).join(', ')}`,
            'Rerun runtime seed import execution after resolving the failed step.',
          ]
        : postImportVerificationBlocked
          ? [
              'Fix runtime seed post-import verification before treating import execution as completed.',
              'Rerun runtime seed import execution after profile rows consume active runtime standard duration seed and T2 rhythm sources.',
            ]
        : [
            'Review runtime-seed-post-import-verification.json for runtime_seed_post_import_verified.',
            'Proceed only after profile rows consume active_seed/project_override/company_override.',
          ],
    productionReady: false,
    mutationBoundary: {
      readsRuntimeSeedImportGate: true,
      readsRuntimeSeedPostImportVerification: postImportVerification.provided,
      writesEvidenceReportsOnly: true,
      mayWriteAlgorithmSeedVersionsOnlyWhenExecutionAllowed: true,
      mayWriteAlgorithmSeedRecordsOnlyWhenExecutionAllowed: true,
      mayWriteAlgorithmSeedImportLogsOnlyWhenExecutionAllowed: true,
      writesProductionTablesOutsideAlgorithmSeedImport: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
      executesRuntimeSeedImport: gate.executionAllowed,
    },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const loadedImportGate = await readJsonWithHash(args.importGate)
  const gate = evaluateRuntimeSeedImportExecutionGate({
    importGateReport: loadedImportGate.json,
    allowImport: args.allowImport,
    seedSmokeUserId: args.seedSmokeUserId,
  })
  const stepResults = []
  if (gate.executionAllowed) {
    const steps = buildRuntimeSeedImportExecutionSteps({
      seedSmokeUserId: args.seedSmokeUserId,
      importCommandBase: gate.importGate.allowedCommand,
    })
    if (args.skipRun) {
      stepResults.push(...steps.map((step) => ({
        id: step.id,
        command: step.command.join(' '),
        mayWriteAlgorithmSeeds: step.mayWriteAlgorithmSeeds === true,
        exitCode: null,
        status: 'skipped',
        durationMs: 0,
        stdout: '',
        stderr: '',
      })))
    } else {
      for (const step of steps) {
        const result = await runExecutionStep(step)
        stepResults.push(result)
        if (result.status !== 'completed') break
      }
    }
  }
  let loadedPostImportVerification = null
  if (stepResults.some((step) => step.id === 'runtime_seed_post_import' && step.status === 'completed')) {
    try {
      loadedPostImportVerification = await readJsonWithHash(args.postImportVerification)
    } catch (error) {
      loadedPostImportVerification = {
        path: args.postImportVerification,
        sha256: null,
        json: {
          __readError: error?.code === 'ENOENT'
            ? 'runtime_seed_post_import_verification_file_missing'
            : 'runtime_seed_post_import_verification_file_read_error',
        },
      }
    }
  }

  const report = buildRuntimeSeedImportExecutionReport({
    importGateReport: loadedImportGate.json,
    loadedImportGate,
    postImportVerificationReport: loadedPostImportVerification?.json ?? {},
    loadedPostImportVerification,
    args,
    stepResults,
  })
  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    output: repoRelative(args.output),
    executionAllowed: report.executionControl.executionAllowed,
    importAllowed: report.importGate.importAllowed,
    blockers: report.blockers,
    upstreamBlockers: report.upstreamBlockers,
    productionReady: false,
  }, null, 2))
  if (args.failOnBlocked && report.status !== 'runtime_seed_import_execution_completed') process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
