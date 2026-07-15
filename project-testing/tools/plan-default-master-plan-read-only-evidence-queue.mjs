#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_INPUT = path.join(DEFAULT_OUTPUT_ROOT, 'readiness-dashboard-refresh.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'read-only-evidence-queue-plan.json')
const DEFAULT_MARKDOWN = path.join(DEFAULT_OUTPUT_ROOT, 'read-only-evidence-queue-plan.md')
const READ_ONLY_EXECUTION_EVIDENCE_TIER = 'tooling_readiness_supporting_only'
const DEFAULT_CANNOT_CLOSE_GATE_IDS = [
  'runtime_source_export_provenance',
  'runtime_seed_and_reference_days_evidence',
  'duration_sample_collection_package',
  'runtime_duration_calibration_evidence',
  'runtime_evidence_lineage_consistency',
]
const NON_CLOSING_EVIDENCE_BOUNDARY = [
  'Read-only queue execution may support tooling readiness only.',
  'It cannot close candidate refresh, materialization, runtime seed import, runtime publication, smoke, rollback, live outcome, or production-ready gates.',
]

const FORBIDDEN_WRITE_OR_LIVE_MARKERS = [
  '--allow-write',
  '--allow-import',
  '--allow-drop',
  '--include-live',
  '--include-db',
  '--include-staging',
  '--confirm-live-handoff',
  '--confirm-db-ready',
  '--confirm-staging-handoff',
  'run-default-master-plan-candidate-refresh-execution.mjs',
  'run-default-master-plan-candidate-baseline-materialization.mjs',
  'run-default-master-plan-runtime-seed-import-execution.mjs',
  'run-default-master-plan-staging-runtime-evidence.mjs',
  'export-default-master-plan-production-sources.mjs',
  'build-default-master-plan-production-evidence-pipeline.mjs',
  'evidence:default-master-plan:candidate-refresh-execution',
  'evidence:default-master-plan:candidate-baseline-materialization',
  'evidence:default-master-plan:runtime-seed-import-execution',
  'evidence:default-master-plan:staging-runtime',
  'evidence:default-master-plan:export-sources',
]

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    markdown: DEFAULT_MARKDOWN,
    execute: false,
    confirmReadOnlyExecution: false,
    json: false,
    help: false,
  }
  let outputProvided = false
  let markdownProvided = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`)
      }
      index += 1
      return value
    }

    if (arg === '--input') {
      args.input = path.resolve(nextValue())
    } else if (arg === '--output') {
      args.output = path.resolve(nextValue())
      outputProvided = true
    } else if (arg === '--markdown') {
      args.markdown = path.resolve(nextValue())
      markdownProvided = true
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--plan-only') {
      // Default behavior; accepted so operator runbooks can be explicit.
    } else if (arg === '--execute') {
      args.execute = true
    } else if (arg === '--confirm-read-only-execution') {
      args.confirmReadOnlyExecution = true
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (outputProvided && !markdownProvided) {
    args.markdown = deriveMarkdownPath(args.output)
  }

  return args
}

function deriveMarkdownPath(outputPath) {
  const parsed = path.parse(outputPath)
  const baseName = parsed.name || parsed.base
  return path.join(parsed.dir, `${baseName}.md`)
}

export function buildReadOnlyEvidenceQueuePlan(sourceReport, {
  inputPath = DEFAULT_INPUT,
  now = new Date(),
} = {}) {
  const source = readObject(sourceReport)
  const queues = readObject(source.operatorCommandExecutionQueues ?? source.operator_command_execution_queues)
  const readOnlyQueue = arrayOfObjects(queues.readOnlyEvidence ?? queues.read_only_evidence)
  const manualQueue = arrayOfObjects(queues.manualPrerequisite ?? queues.manual_prerequisite)
  const guardedQueue = arrayOfObjects(queues.guardedWriteOrLive ?? queues.guarded_write_or_live)
  const rejectedReadOnlyQueueEntries = []
  const readOnlyQueuePlan = []

  for (const entry of readOnlyQueue) {
    const normalized = normalizeQueueEntry(entry)
    const rejectionReason = readOnlyQueueRejectionReason(normalized)
    if (rejectionReason) {
      rejectedReadOnlyQueueEntries.push({
        ...normalized,
        reason: rejectionReason,
      })
      continue
    }

    readOnlyQueuePlan.push({
      sequence: readOnlyQueuePlan.length + 1,
      command: normalized.command,
      executionReadiness: normalized.executionReadiness,
      commandKind: normalized.commandKind,
      actionGroupIds: normalized.actionGroupIds,
      commandSources: normalized.commandSources,
      duplicateCount: normalized.duplicateCount,
      queueId: normalized.queueId,
      autoRunAllowed: normalized.autoRunAllowed,
      executionMode: 'plan_only',
      mutationBoundary: 'read-only evidence command is planned only; this tool does not execute commands',
    })
  }

  const status = rejectedReadOnlyQueueEntries.length > 0 ? 'blocked' : 'planned'
  const summary = {
    sourceReadOnlyEvidenceCommandCount: readOnlyQueue.length,
    plannedCommandCount: readOnlyQueuePlan.length,
    rejectedReadOnlyQueueCommandCount: rejectedReadOnlyQueueEntries.length,
    excludedManualPrerequisiteCommandCount: manualQueue.length,
    excludedGuardedWriteOrLiveCommandCount: guardedQueue.length,
    excludedForbiddenCommandCount: manualQueue.length + guardedQueue.length,
    executionRequested: false,
    executionAllowed: false,
    planOnly: true,
  }
  const executionEvidenceBoundary = buildExecutionEvidenceBoundary(source)

  return {
    schemaVersion: 'workbuddy-default-master-plan-read-only-evidence-queue-plan/v1',
    generatedAt: now.toISOString(),
    status,
    productionReady: false,
    planOnly: true,
    input: inputPath,
    sourceStatus: String(source.status ?? '').trim() || 'unknown',
    sourceProductionReady: source.productionReady === true || source.production_ready === true,
    gateSummary: readObject(source.gateSummary ?? source.gate_summary),
    summary,
    executionEvidenceBoundary,
    readOnlyQueuePlan,
    rejectedReadOnlyQueueEntries,
    excludedQueues: {
      manualPrerequisite: manualQueue.map(normalizeQueueEntry),
      guardedWriteOrLive: guardedQueue.map(normalizeQueueEntry),
    },
    mutationBoundary: [
      'Reads existing readiness dashboard or real-evidence gap summary only.',
      'Plans only operatorCommandExecutionQueues.readOnlyEvidence entries that are still autoRunAllowed read_only_evidence commands.',
      'does not execute commands, spawn shells, connect to DB, run source exports, import seeds, publish runtime, run smoke, or perform rollback.',
      'Manual prerequisite and guarded write/live queues remain excluded from auto-run planning.',
    ],
  }
}

export async function planDefaultMasterPlanReadOnlyEvidenceQueue({
  argv = process.argv.slice(2),
  now = new Date(),
  cwd = REPO_ROOT,
  runCommand = runCommandDefault,
} = {}) {
  const args = parseArgs(argv)
  if (args.help) {
    return {
      status: 'help',
      productionReady: false,
      help: renderHelp(),
    }
  }

  const sourceReport = JSON.parse(await readFile(args.input, 'utf8'))
  const basePlan = buildReadOnlyEvidenceQueuePlan(sourceReport, {
    inputPath: args.input,
    now,
  })
  const plan = await maybeExecuteReadOnlyQueuePlan(basePlan, {
    execute: args.execute,
    confirmReadOnlyExecution: args.confirmReadOnlyExecution,
    cwd,
    runCommand,
  })

  await mkdir(path.dirname(args.output), { recursive: true })
  await mkdir(path.dirname(args.markdown), { recursive: true })
  await writeFile(args.output, `${JSON.stringify({
    ...plan,
    jsonOutput: args.output,
    markdownOutput: args.markdown,
  }, null, 2)}\n`)
  await writeFile(args.markdown, renderMarkdown({
    ...plan,
    jsonOutput: args.output,
    markdownOutput: args.markdown,
  }))

  return {
    ...plan,
    jsonOutput: args.output,
    markdownOutput: args.markdown,
  }
}

function normalizeQueueEntry(entry) {
  const source = readObject(entry)
  return {
    command: normalizeCommand(source.command),
    executionReadiness: String(source.executionReadiness ?? source.execution_readiness ?? '').trim() || 'unknown',
    commandKind: String(source.commandKind ?? source.command_kind ?? '').trim() || 'unknown',
    actionGroupIds: arrayOfStrings(source.actionGroupIds ?? source.action_group_ids),
    commandSources: arrayOfStrings(source.commandSources ?? source.command_sources),
    duplicateCount: numberValue(source.duplicateCount ?? source.duplicate_count),
    queueId: String(source.queueId ?? source.queue_id ?? '').trim() || 'unknown',
    autoRunAllowed: source.autoRunAllowed === true || source.auto_run_allowed === true,
  }
}

async function maybeExecuteReadOnlyQueuePlan(plan, {
  execute = false,
  confirmReadOnlyExecution = false,
  cwd = REPO_ROOT,
  runCommand = runCommandDefault,
} = {}) {
  const executionRequested = execute === true
  const executionBlockers = []
  const executionResults = []

  if (!executionRequested) {
    return {
      ...plan,
      executionBlockers,
      executionSummary: emptyExecutionSummary(),
      executionResults,
    }
  }

  if (!confirmReadOnlyExecution) executionBlockers.push('confirm_read_only_execution_required')
  if (plan.rejectedReadOnlyQueueEntries.length > 0) executionBlockers.push('read_only_queue_contains_rejected_entries')
  for (const entry of plan.readOnlyQueuePlan) {
    const rejectionReason = readOnlyQueueRejectionReason(entry)
    if (rejectionReason) executionBlockers.push(`planned_command_rejected:${entry.sequence}:${rejectionReason}`)
  }

  if (executionBlockers.length > 0) {
    return {
      ...plan,
      status: 'blocked',
      summary: {
        ...plan.summary,
        executionRequested,
        executionAllowed: false,
      },
      executionBlockers,
      executionSummary: emptyExecutionSummary(),
      executionResults,
    }
  }

  for (const entry of plan.readOnlyQueuePlan) {
    const startedAt = new Date().toISOString()
    const result = await runCommand(entry.command, { cwd })
    const finishedAt = new Date().toISOString()
    executionResults.push({
      sequence: entry.sequence,
      command: entry.command,
      commandHash: sha256(entry.command),
      cwd: path.resolve(cwd),
      evidenceTier: READ_ONLY_EXECUTION_EVIDENCE_TIER,
      canCloseProductionReadinessGates: false,
      status: numberValue(result.exitCode) === 0 ? 'pass' : 'fail',
      exitCode: numberValue(result.exitCode),
      durationMs: numberValue(result.durationMs),
      startedAt,
      finishedAt,
      stdoutTail: tailText(result.stdout),
      stderrTail: tailText(result.stderr),
    })
  }

  const executionSummary = {
    commandCount: executionResults.length,
    passedCommandCount: executionResults.filter((entry) => entry.status === 'pass').length,
    failedCommandCount: executionResults.filter((entry) => entry.status === 'fail').length,
    skippedCommandCount: 0,
  }

  return {
    ...plan,
    status: executionSummary.failedCommandCount > 0 ? 'failed' : 'executed',
    planOnly: false,
    summary: {
      ...plan.summary,
      executionRequested,
      executionAllowed: true,
      planOnly: false,
    },
    executionBlockers,
    executionSummary,
    executionResults,
  }
}

function emptyExecutionSummary() {
  return {
    commandCount: 0,
    passedCommandCount: 0,
    failedCommandCount: 0,
    skippedCommandCount: 0,
  }
}

function buildExecutionEvidenceBoundary(sourceReport) {
  const source = readObject(sourceReport)
  const coverage = readObject(source.blockedGateActionCoverageSummary ?? source.blocked_gate_action_coverage_summary)
  const cannotCloseGateIds = arrayOfStrings(
    coverage.coveredBlockedGateIds
      ?? coverage.covered_blocked_gate_ids
      ?? source.blockedGateIds
      ?? source.blocked_gate_ids,
  )

  return {
    evidenceTier: READ_ONLY_EXECUTION_EVIDENCE_TIER,
    canCloseProductionReadinessGates: false,
    nonClosingEvidenceBoundary: [...NON_CLOSING_EVIDENCE_BOUNDARY],
    cannotCloseGateIds: cannotCloseGateIds.length ? cannotCloseGateIds : [...DEFAULT_CANNOT_CLOSE_GATE_IDS],
  }
}

function runCommandDefault(command, { cwd = REPO_ROOT } = {}) {
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      windowsHide: true,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${stderr ? '\n' : ''}${error.message}`,
        durationMs: Date.now() - started,
      })
    })
    child.on('close', (exitCode) => {
      resolve({
        exitCode: numberValue(exitCode),
        stdout,
        stderr,
        durationMs: Date.now() - started,
      })
    })
  })
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex')
}

function readOnlyQueueRejectionReason(entry) {
  if (entry.commandKind !== 'read_only_evidence') return 'command_kind_not_read_only_evidence'
  if (entry.queueId !== 'read_only_evidence') return 'queue_id_not_read_only_evidence'
  if (entry.autoRunAllowed !== true) return 'auto_run_not_allowed'
  if (hasForbiddenWriteOrLiveMarker(entry.command)) return 'forbidden_write_or_live_command_marker'
  if (entry.command.includes('<') || entry.command.includes('>')) return 'placeholder_command_requires_operator'
  if (!entry.command) return 'missing_command'
  return null
}

function hasForbiddenWriteOrLiveMarker(command) {
  const text = command.toLowerCase()
  return FORBIDDEN_WRITE_OR_LIVE_MARKERS.some((marker) => text.includes(marker.toLowerCase()))
}

function renderMarkdown(plan) {
  const lines = [
    '# Default Master Plan Read-only Evidence Queue Plan',
    '',
    `- generatedAt: ${plan.generatedAt}`,
    `- status: ${plan.status}`,
    `- productionReady: ${plan.productionReady ? 'yes' : 'no'}`,
    `- planOnly: ${plan.planOnly ? 'yes' : 'no'}`,
    `- input: ${plan.input}`,
    `- jsonOutput: ${plan.jsonOutput || 'not-written'}`,
    `- markdownOutput: ${plan.markdownOutput || 'not-written'}`,
    '',
    '## Summary',
    '',
    `- sourceReadOnlyEvidenceCommandCount: ${plan.summary.sourceReadOnlyEvidenceCommandCount}`,
    `- plannedCommandCount: ${plan.summary.plannedCommandCount}`,
    `- rejectedReadOnlyQueueCommandCount: ${plan.summary.rejectedReadOnlyQueueCommandCount}`,
    `- excludedManualPrerequisiteCommandCount: ${plan.summary.excludedManualPrerequisiteCommandCount}`,
    `- excludedGuardedWriteOrLiveCommandCount: ${plan.summary.excludedGuardedWriteOrLiveCommandCount}`,
    `- executionRequested: ${plan.summary.executionRequested ? 'yes' : 'no'}`,
    `- executionAllowed: ${plan.summary.executionAllowed ? 'yes' : 'no'}`,
    `- executionCommandCount: ${plan.executionSummary?.commandCount ?? 0}`,
    `- executionFailedCommandCount: ${plan.executionSummary?.failedCommandCount ?? 0}`,
    '',
    '## Read-only Queue Plan',
    '',
  ]

  if (!plan.readOnlyQueuePlan.length) {
    lines.push('- No read-only evidence commands are plan-safe.')
  } else {
    for (const entry of plan.readOnlyQueuePlan) {
      lines.push(`- queue_command: ${entry.sequence} | ${entry.executionReadiness} | ${entry.command}`)
      lines.push(`  - action_groups: ${entry.actionGroupIds.length ? entry.actionGroupIds.join(', ') : 'unknown'}`)
      lines.push(`  - sources: ${entry.commandSources.length ? entry.commandSources.join(', ') : 'unknown'}`)
    }
  }

  lines.push('')
  lines.push('## Rejected Read-only Queue Entries')
  lines.push('')
  if (!plan.rejectedReadOnlyQueueEntries.length) {
    lines.push('- none')
  } else {
    for (const entry of plan.rejectedReadOnlyQueueEntries) {
      lines.push(`- rejected_queue_command: ${entry.reason} | ${entry.command}`)
    }
  }

  lines.push('')
  lines.push('## Mutation Boundary')
  lines.push('')
  for (const boundary of plan.mutationBoundary) {
    lines.push(`- ${boundary}`)
  }

  lines.push('')
  lines.push('## Execution Evidence Boundary')
  lines.push('')
  lines.push(`- evidenceTier: ${plan.executionEvidenceBoundary.evidenceTier}`)
  lines.push(`- canCloseProductionReadinessGates: ${plan.executionEvidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`)
  lines.push(`- cannotCloseGateIds: ${plan.executionEvidenceBoundary.cannotCloseGateIds.length ? plan.executionEvidenceBoundary.cannotCloseGateIds.join(', ') : 'not available'}`)
  for (const boundary of plan.executionEvidenceBoundary.nonClosingEvidenceBoundary) {
    lines.push(`- nonClosingEvidenceBoundary: ${boundary}`)
  }

  lines.push('')
  lines.push('## Execution Results')
  lines.push('')
  if (!plan.executionResults?.length) {
    lines.push('- none')
  } else {
    for (const entry of plan.executionResults) {
      lines.push(`- execution_result: ${entry.sequence} | ${entry.status} | exit=${entry.exitCode} | ${entry.command}`)
    }
  }
  for (const blocker of plan.executionBlockers ?? []) {
    lines.push(`- execution_blocker: ${blocker}`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

function renderHelp() {
  return [
    'Usage: node project-testing/tools/plan-default-master-plan-read-only-evidence-queue.mjs [options]',
    '',
    'Options:',
    '  --input <json>       readiness-dashboard-refresh.json or real-evidence-gap-summary.json',
    '  --output <json>      output JSON path',
    '  --markdown <md>      output Markdown path',
    '  --plan-only          explicit no-execution mode; this is always the behavior',
    '  --execute            run only plan-safe read-only evidence commands',
    '  --confirm-read-only-execution  required with --execute',
    '  --json               print JSON summary',
    '  --help               show help',
  ].join('\n')
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function arrayOfObjects(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : []
}

function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean)
    : []
}

function normalizeCommand(command) {
  return String(command ?? '').trim().replace(/\s+/g, ' ')
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function tailText(value, maxLength = 4000) {
  const text = String(value ?? '')
  return text.length > maxLength ? text.slice(-maxLength) : text
}

async function main() {
  const result = await planDefaultMasterPlanReadOnlyEvidenceQueue()
  if (result.help) {
    console.log(result.help)
    return
  }
  if (parseArgs().json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Default master-plan read-only evidence queue plan: ${result.status}`)
    console.log(`JSON: ${result.jsonOutput}`)
    console.log(`Markdown: ${result.markdownOutput}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
