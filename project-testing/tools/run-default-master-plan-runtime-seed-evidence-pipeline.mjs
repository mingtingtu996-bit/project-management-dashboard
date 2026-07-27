#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_REPORT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-profiles')
const DEFAULT_PROFILE_REPORT = path.join(DEFAULT_REPORT_ROOT, 'default-master-plan-profile-samples.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-evidence-pipeline.json')

const DEFAULT_REPORTS = {
  governancePreflight: path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-governance-preflight.json'),
  preflight: path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-evidence-preflight.json'),
  environment: path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-environment.json'),
  coverage: path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-coverage-package.json'),
  importGate: path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-import-gate.json'),
  postImport: path.join(DEFAULT_REPORT_ROOT, 'runtime-seed-post-import-verification.json'),
}

const PIPELINE_STEPS = [
  {
    id: 'runtime_seed_governance_preflight',
    command: ['node', 'node_modules/tsx/dist/cli.mjs', 'project-testing/tools/check-default-master-plan-runtime-seed-governance-preflight.mjs'],
    reportKey: 'governancePreflight',
  },
  {
    id: 'runtime_seed_preflight',
    command: ['node', 'project-testing/tools/build-default-master-plan-runtime-seed-evidence-preflight.mjs'],
    reportKey: 'preflight',
  },
  {
    id: 'runtime_seed_environment',
    command: ['node', 'project-testing/tools/check-default-master-plan-runtime-seed-environment.mjs'],
    reportKey: 'environment',
  },
  {
    id: 'runtime_seed_coverage',
    command: ['node', 'project-testing/tools/build-default-master-plan-runtime-seed-coverage-package.mjs'],
    reportKey: 'coverage',
  },
  {
    id: 'runtime_seed_import_gate',
    command: ['node', 'project-testing/tools/build-default-master-plan-runtime-seed-import-gate.mjs'],
    reportKey: 'importGate',
  },
]

export function parseArgs(argv) {
  const args = {
    profileReport: DEFAULT_PROFILE_REPORT,
    outputRoot: DEFAULT_REPORT_ROOT,
    output: DEFAULT_OUTPUT,
    skipRun: false,
    failOnBlocked: false,
    envFiles: [],
    operatorApprovalRef: null,
    skipTcp: false,
  }
  let outputExplicit = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--profile-report') {
      args.profileReport = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--output-root') {
      args.outputRoot = path.resolve(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      outputExplicit = true
      index += 1
      continue
    }
    if (arg === '--skip-run') {
      args.skipRun = true
      continue
    }
    if (arg === '--env-file') {
      args.envFiles.push(argv[index + 1] ?? '')
      index += 1
      continue
    }
    if (arg === '--operator-approval-ref') {
      args.operatorApprovalRef = text(argv[index + 1])
      index += 1
      continue
    }
    if (arg === '--skip-tcp') {
      args.skipTcp = true
      continue
    }
    if (arg === '--fail-on-blocked') {
      args.failOnBlocked = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node project-testing/tools/run-default-master-plan-runtime-seed-evidence-pipeline.mjs [--profile-report <json>] [--output-root <dir>] [--output <json>] [--env-file <path>] [--operator-approval-ref <ref>] [--skip-tcp] [--skip-run] [--fail-on-blocked]')
      process.exit(0)
    }
  }
  if (!outputExplicit) {
    args.output = path.join(args.outputRoot, 'runtime-seed-evidence-pipeline.json')
  }
  return args
}

export function buildReportPaths(args = {}) {
  const outputRoot = args.outputRoot ? path.resolve(args.outputRoot) : DEFAULT_REPORT_ROOT
  return {
    governancePreflight: path.join(outputRoot, 'runtime-seed-governance-preflight.json'),
    preflight: path.join(outputRoot, 'runtime-seed-evidence-preflight.json'),
    environment: path.join(outputRoot, 'runtime-seed-environment.json'),
    coverage: path.join(outputRoot, 'runtime-seed-coverage-package.json'),
    importGate: path.join(outputRoot, 'runtime-seed-import-gate.json'),
    postImport: path.join(outputRoot, 'runtime-seed-post-import-verification.json'),
  }
}

function optionalFlagPairs(flag, values) {
  return readArray(values)
    .map(text)
    .filter(Boolean)
    .flatMap((value) => [flag, value])
}

export function buildPipelineSteps(args = {}) {
  const reportPaths = args.reportPaths ?? buildReportPaths(args)
  const profileReport = args.profileReport ? path.resolve(args.profileReport) : DEFAULT_PROFILE_REPORT
  const environmentArgs = [
    ...optionalFlagPairs('--env-file', args.envFiles),
    ...(args.skipTcp ? ['--skip-tcp'] : []),
  ]
  const importGateArgs = args.operatorApprovalRef
    ? ['--operator-approval-ref', args.operatorApprovalRef]
    : []

  return PIPELINE_STEPS.map((step) => {
    if (step.id === 'runtime_seed_governance_preflight') {
      return {
        ...step,
        command: [
          ...step.command,
          '--output',
          reportPaths.governancePreflight,
        ],
      }
    }
    if (step.id === 'runtime_seed_preflight') {
      return {
        ...step,
        command: [
          ...step.command,
          '--profile-report',
          profileReport,
          '--output',
          reportPaths.preflight,
        ],
      }
    }
    if (step.id === 'runtime_seed_environment' && environmentArgs.length > 0) {
      return {
        ...step,
        command: [
          ...step.command,
          '--profile-report',
          profileReport,
          '--runtime-seed-preflight',
          reportPaths.preflight,
          '--output',
          reportPaths.environment,
          ...environmentArgs,
        ],
      }
    }
    if (step.id === 'runtime_seed_environment') {
      return {
        ...step,
        command: [
          ...step.command,
          '--profile-report',
          profileReport,
          '--runtime-seed-preflight',
          reportPaths.preflight,
          '--output',
          reportPaths.environment,
        ],
      }
    }
    if (step.id === 'runtime_seed_coverage') {
      return {
        ...step,
        command: [
          ...step.command,
          '--runtime-seed-preflight',
          reportPaths.preflight,
          '--governance-preflight',
          reportPaths.governancePreflight,
          '--output',
          reportPaths.coverage,
        ],
      }
    }
    if (step.id === 'runtime_seed_import_gate' && importGateArgs.length > 0) {
      return {
        ...step,
        command: [
          ...step.command,
          '--environment-report',
          reportPaths.environment,
          '--coverage-package',
          reportPaths.coverage,
          '--output',
          reportPaths.importGate,
          ...importGateArgs,
        ],
      }
    }
    if (step.id === 'runtime_seed_import_gate') {
      return {
        ...step,
        command: [
          ...step.command,
          '--environment-report',
          reportPaths.environment,
          '--coverage-package',
          reportPaths.coverage,
          '--output',
          reportPaths.importGate,
        ],
      }
    }
    return step
  })
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
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

function sha256Text(content) {
  return createHash('sha256').update(content).digest('hex')
}

function normalizeCommandForPlatform(command) {
  if (command[0] === 'node') return [process.execPath, ...command.slice(1)]
  return command
}

export async function runPipelineStep(step, options = {}) {
  const cwd = options.cwd ?? REPO_ROOT
  const startedAt = Date.now()
  const command = normalizeCommandForPlatform(step.command)
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: options.env ?? process.env,
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
        reportKey: step.reportKey,
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
        reportKey: step.reportKey,
        exitCode: code,
        status: code === 0 ? 'completed' : 'failed',
        durationMs: Date.now() - startedAt,
        stdout: stdout.slice(-4000),
        stderr: stderr.slice(-4000),
      })
    })
  })
}

async function readJsonWithHash(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return {
    path: filePath,
    sha256: sha256Text(raw),
    json: JSON.parse(raw),
  }
}

function summarizePreflight(report) {
  const record = readRecord(report)
  const runtimeSeedEvidence = readRecord(record.runtimeSeedEvidence)
  const runtimeReferenceDaysEvidence = readRecord(record.runtimeReferenceDaysEvidence)
  const seedSmokeImport = readRecord(record.seedSmokeImport)
  const requiredRuntimeReferenceStableCodes = uniqueStrings(runtimeReferenceDaysEvidence.requiredRuntimeReferenceStableCodes)
  return {
    status: text(record.status),
    blockers: uniqueStrings(record.blockers),
    readyBusinessTypeCount: Number(runtimeSeedEvidence.readyBusinessTypeCount ?? 0),
    missingBusinessTypeCount: Number(runtimeSeedEvidence.missingBusinessTypeCount ?? 0),
    requiredRuntimeSeedStableCodeCount: readArray(runtimeSeedEvidence.requiredRuntimeSeedStableCodes).length,
    runtimeReferenceDays: {
      readyBusinessTypeCount: Number(runtimeReferenceDaysEvidence.readyBusinessTypeCount ?? 0),
      missingBusinessTypeCount: Number(runtimeReferenceDaysEvidence.missingBusinessTypeCount ?? 0),
      missingBusinessTypes: uniqueStrings(runtimeReferenceDaysEvidence.missingBusinessTypes),
      requiredRuntimeReferenceStableCodes,
      requiredRuntimeReferenceStableCodeCount: requiredRuntimeReferenceStableCodes.length,
      evidenceLevelRequired: text(runtimeReferenceDaysEvidence.evidenceLevelRequired) || null,
    },
    seedSmokeImportStatus: text(seedSmokeImport.status),
  }
}

function summarizeEnvironment(report) {
  const record = readRecord(report)
  const target = readRecord(record.currentRuntimeTarget)
  const tcp = readRecord(record.localSupabaseTcp)
  const repairPlan = readRecord(record.repairPlan)
  const orderedSteps = readArray(repairPlan.orderedSteps).map((step) => summarizeRepairStep(step))
  return {
    status: text(record.status),
    targetClass: text(target.targetClass),
    localSupabaseReachable: tcp.reachable === true,
    environmentBlockers: uniqueStrings(record.environmentBlockers),
    upstreamEvidenceBlockers: uniqueStrings(record.upstreamEvidenceBlockers),
    repairPlan: {
      status: text(repairPlan.status),
      noAutoInstall: repairPlan.noAutoInstall === true,
      requiredStepIds: uniqueStrings(repairPlan.requiredStepIds),
      blockedStepIds: uniqueStrings(repairPlan.blockedStepIds),
      orderedStepCount: orderedSteps.length,
      orderedSteps,
    },
  }
}

function summarizeRepairStep(step) {
  const record = readRecord(step)
  return {
    id: text(record.id),
    status: text(record.status),
    blockerCodes: uniqueStrings(record.blockerCodes),
    title: text(record.title),
    commands: uniqueStrings(record.commands),
    verificationCommands: uniqueStrings(record.verificationCommands),
    notes: uniqueStrings(record.notes),
  }
}

function summarizeCoverage(report) {
  const record = readRecord(report)
  const coverage = readRecord(record.coverage)
  const seedSource = readRecord(record.standardWorkDurationSeedSource)
  const importReadiness = readRecord(record.importReadiness)
  return {
    status: text(record.status),
    seedVersion: text(seedSource.seedVersion),
    requiredStableCodeCount: readArray(coverage.requiredStableCodes).length,
    coveredStableCodeCount: Number(coverage.coveredStableCodeCount ?? 0),
    missingStableCodeCount: Number(coverage.missingStableCodeCount ?? 0),
    missingStableCodes: uniqueStrings(coverage.missingStableCodes),
    runtimeSeedImportRequired: importReadiness.runtimeSeedImportRequired !== false,
    runtimeSeedEvidenceAlreadyReady: importReadiness.runtimeSeedEvidenceAlreadyReady === true,
  }
}

function summarizeImportGate(report) {
  const record = readRecord(report)
  const importGate = readRecord(record.importGate)
  const coverage = readRecord(record.coverage)
  return {
    status: text(record.status),
    importAllowed: importGate.importAllowed === true,
    importRequired: importGate.importRequired !== false,
    runtimeSeedEvidenceAlreadyReady: importGate.runtimeSeedEvidenceAlreadyReady === true,
    importMode: text(importGate.importMode),
    localUnlockPresent: importGate.localUnlockPresent === true,
    remoteUnlockPresent: importGate.remoteUnlockPresent === true,
    coveredStableCodeCount: Number(coverage.coveredStableCodeCount ?? 0),
    missingStableCodeCount: Number(coverage.missingStableCodeCount ?? 0),
    blockers: uniqueStrings(record.blockers),
    manualActions: uniqueStrings(record.manualActions),
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

function summarizePostImport(report) {
  const record = readRecord(report)
  const provided = Object.keys(record).length > 0
  const runtimeSeedEvidence = readRecord(record.runtimeSeedEvidence)
  const runtimeT2Evidence = readRecord(record.runtimeT2Evidence)
  const mutationBoundary = readRecord(record.mutationBoundary)
  const writeBoundaryViolationFields = runtimeSeedPostImportWriteBoundaryFields()
    .filter((field) => mutationBoundary[field] === true)
  const sourceBlockers = uniqueStrings(record.blockers)
  const status = text(record.status) || (provided ? 'runtime_seed_post_import_verification_missing_status' : 'not_provided')
  const noWriteBoundary = provided && Object.keys(mutationBoundary).length > 0 && writeBoundaryViolationFields.length === 0
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
  const blockers = provided
    ? uniqueStrings([
        ...sourceBlockers,
        status === 'runtime_seed_post_import_verified' ? null : 'runtime_seed_post_import_verification_not_verified',
        Object.keys(mutationBoundary).length > 0 ? null : 'runtime_seed_post_import_mutation_boundary_missing',
        writeBoundaryViolationFields.length > 0 ? 'runtime_seed_post_import_mutation_boundary_write_violation' : null,
        activeStandardWorkDurationSeedReady ? null : 'runtime_seed_post_import_active_standard_work_seed_not_ready',
        activeT2RhythmTemplateReady ? null : 'runtime_seed_post_import_active_t2_rhythm_template_not_ready',
      ])
    : []

  return {
    provided,
    status,
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

function reportRef(key, loaded) {
  return {
    key,
    path: repoRelative(loaded.path),
    sha256: loaded.sha256,
    schemaVersion: text(loaded.json.schemaVersion),
    status: text(loaded.json.status),
    source: text(loaded.json.source),
  }
}

function buildRuntimeReferenceDaysNextActions(runtimeReferenceDays) {
  const requiredCodes = uniqueStrings(runtimeReferenceDays.requiredRuntimeReferenceStableCodes)
  const codeSummary = requiredCodes.length > 0
    ? requiredCodes.join(', ')
    : 'missing runtime reference-day stable codes'
  return [
    'Build or refresh duration sample collection package for missing runtime reference-days',
    `Collect accepted real completed-task duration samples for required stable codes: ${codeSummary}`,
    'Run duration sample coverage verification and build runtime_calibrated_l2 duration-calibration-evidence.json',
    'Rerun profile report with --duration-calibration-evidence before dependency writer or runtime publication',
  ]
}

export function buildRuntimeSeedEvidencePipelineReport({
  stepResults = [],
  loadedReports = {},
  generatedAt = new Date().toISOString(),
}) {
  const preflight = loadedReports.preflight?.json ?? {}
  const governancePreflight = loadedReports.governancePreflight?.json ?? {}
  const environment = loadedReports.environment?.json ?? {}
  const coverage = loadedReports.coverage?.json ?? {}
  const importGate = loadedReports.importGate?.json ?? {}
  const failedSteps = stepResults.filter((step) => step.status !== 'completed' && step.status !== 'skipped')
  const importSummary = summarizeImportGate(importGate)
  const importNotRequired = text(importGate.status) === 'runtime_seed_import_not_required'
    && importSummary.importRequired === false
    && uniqueStrings(importGate.blockers).length === 0
  const preflightSummary = summarizePreflight(preflight)
  const runtimeReferenceDaysMissing = preflightSummary.runtimeReferenceDays.missingBusinessTypeCount > 0
  const postImportSummary = summarizePostImport(loadedReports.postImport?.json)
  const postImportBlocked = postImportSummary.provided
    && importNotRequired
    && (!postImportSummary.activeStandardWorkDurationSeedReady || !postImportSummary.activeT2RhythmTemplateReady)
  const status = failedSteps.length > 0
    ? 'runtime_seed_evidence_pipeline_failed'
    : postImportBlocked
      ? 'runtime_seed_post_import_blocked'
    : importNotRequired && runtimeReferenceDaysMissing
      ? 'runtime_reference_days_evidence_required'
    : importNotRequired
      ? 'runtime_seed_import_not_required'
    : importSummary.importAllowed
      ? 'runtime_seed_import_allowed'
      : 'runtime_seed_import_blocked'
  const nextActions = failedSteps.length > 0
    ? [
        `Fix failed pipeline step(s): ${failedSteps.map((step) => step.id).join(', ')}`,
        'Rerun runtime seed evidence pipeline after step failures are resolved',
      ]
    : postImportBlocked
      ? [
          'Rerun runtime seed import execution and post-import verification until every profile row uses active runtime standard duration seed and T2 rhythm sources',
          'Do not continue to runtime calibration or publication while post-import profile rows still use fallback seed or T2 sources',
        ]
    : importNotRequired
      ? runtimeReferenceDaysMissing
        ? buildRuntimeReferenceDaysNextActions(preflightSummary.runtimeReferenceDays)
        : [
            'Runtime seed evidence is already ready; continue dependency writer, runtime publication, smoke, and rollback gates',
          ]
    : importSummary.importAllowed
      ? [
          'Run the allowed import command from runtime-seed-import-gate.json',
          'Rerun profile report and runtime seed evidence after import',
          'Run npm.cmd run evidence:default-master-plan:runtime-seed-post-import',
        ]
      : uniqueStrings([
          ...(runtimeReferenceDaysMissing
            ? buildRuntimeReferenceDaysNextActions(preflightSummary.runtimeReferenceDays)
            : []),
          ...importSummary.manualActions,
        ])
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-evidence-pipeline/v1',
    source: 'run-default-master-plan-runtime-seed-evidence-pipeline',
    generatedAt,
    status,
    steps: stepResults,
    reports: Object.fromEntries(Object.entries(loadedReports).map(([key, loaded]) => [key, reportRef(key, loaded)])),
    summary: {
      governancePreflight: {
        status: text(governancePreflight.status),
        readyForGovernedImport: governancePreflight.readyForGovernedImport === true,
        seedTypesReadyForImport: uniqueStrings(governancePreflight.seedTypesReadyForImport),
        blockers: uniqueStrings(governancePreflight.blockers),
      },
      preflight: summarizePreflight(preflight),
      environment: summarizeEnvironment(environment),
      coverage: summarizeCoverage(coverage),
      importGate: importSummary,
      postImport: postImportSummary,
    },
    blockers: uniqueStrings([
      runtimeReferenceDaysMissing ? 'runtime_reference_days_evidence_missing' : null,
      ...postImportSummary.blockers,
      ...readArray(importGate.blockers),
      ...failedSteps.map((step) => `${step.id}_failed`),
    ]),
    nextActions,
    productionReady: false,
    mutationBoundary: {
      runsReadOnlyEvidenceScripts: true,
      readsRuntimeSeedReports: true,
      writesEvidenceReportsOnly: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesDurationSamples: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
  }
}

async function loadReports(reportPaths = DEFAULT_REPORTS) {
  const entries = await Promise.all(Object.entries(reportPaths).map(async ([key, filePath]) => {
    try {
      return [
        key,
        await readJsonWithHash(filePath),
      ]
    } catch (error) {
      if (key === 'postImport' && error?.code === 'ENOENT') return null
      throw error
    }
  }))
  return Object.fromEntries(entries.filter(Boolean))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const reportPaths = buildReportPaths(args)
  const pipelineSteps = buildPipelineSteps({ ...args, reportPaths })
  const stepResults = []
  if (!args.skipRun) {
    for (const step of pipelineSteps) {
      const result = await runPipelineStep(step)
      stepResults.push(result)
      if (result.status !== 'completed') break
    }
  } else {
    stepResults.push(...pipelineSteps.map((step) => ({
      id: step.id,
      command: step.command.join(' '),
      reportKey: step.reportKey,
      exitCode: null,
      status: 'skipped',
      durationMs: 0,
      stdout: '',
      stderr: '',
    })))
  }
  const loadedReports = await loadReports(reportPaths)
  const report = buildRuntimeSeedEvidencePipelineReport({
    stepResults,
    loadedReports,
  })
  await fs.mkdir(path.dirname(args.output), { recursive: true })
  await fs.writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    output: repoRelative(args.output),
    importAllowed: report.summary.importGate.importAllowed,
    targetClass: report.summary.environment.targetClass,
    coverage: report.summary.coverage,
    blockers: report.blockers,
    productionReady: false,
  }, null, 2))
  if (args.failOnBlocked && report.status !== 'runtime_seed_import_allowed') process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
