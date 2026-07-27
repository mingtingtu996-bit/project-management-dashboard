#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_INPUT = path.join(DEFAULT_OUTPUT_ROOT, 'real-evidence-gap-summary.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'blocked-gate-action-checklist.json')
const DEFAULT_MARKDOWN = path.join(DEFAULT_OUTPUT_ROOT, 'blocked-gate-action-checklist.md')

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    markdown: DEFAULT_MARKDOWN,
    json: false,
    help: false,
  }

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
    } else if (arg === '--markdown') {
      args.markdown = path.resolve(nextValue())
    } else if (arg === '--json') {
      args.json = true
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return args
}

export function buildBlockedGateActionChecklist(sourceReport, {
  inputPath = DEFAULT_INPUT,
  inputDigest,
  now = new Date(),
} = {}) {
  const source = readObject(sourceReport)
  const actionGroups = arrayOfObjects(source.prioritizedNextActionGroups ?? source.prioritized_next_action_groups)
    .map(normalizeActionGroup)
    .sort((a, b) => a.priority - b.priority)
  const coverageEntries = arrayOfObjects(source.blockedGateActionCoverage ?? source.blocked_gate_action_coverage)
    .map(normalizeCoverageEntry)
  const requirementMatrix = arrayOfObjects(source.operatorUnblockRequirementMatrix ?? source.operator_unblock_requirement_matrix)
    .map(normalizeRequirementMatrixRow)
  const queues = normalizeCommandQueues(source.operatorCommandExecutionQueues ?? source.operator_command_execution_queues)

  const actionChecklist = actionGroups.map((group) => {
    const matrix = requirementMatrix.find((entry) => entry.actionGroupId === group.id) ?? emptyRequirementRow(group)
    const coveredGateIds = coverageEntries
      .filter((entry) => entry.coveredByActionGroupIds.includes(group.id))
      .map((entry) => entry.gateId)
      .filter(Boolean)
    const queueForGroup = {
      readOnlyEvidence: commandsForActionGroup(queues.readOnlyEvidence, group.id),
      manualPrerequisite: commandsForActionGroup(queues.manualPrerequisite, group.id),
      guardedWriteOrLive: commandsForActionGroup(queues.guardedWriteOrLive, group.id),
    }

    return {
      actionGroupId: group.id,
      priority: group.priority,
      status: group.status,
      nextAction: group.nextAction,
      coveredGateIds,
      operatorRequirementActionIds: matrix.operatorRequirementActionIds,
      envUnlockVariables: matrix.envUnlockVariables,
      requiredFlags: matrix.requiredFlags,
      operatorFields: matrix.operatorFields,
      evidenceInputArtifacts: matrix.evidenceInputArtifacts,
      requiredEnvironmentTargets: matrix.requiredEnvironmentTargets,
      verificationCommands: matrix.verificationCommands,
      repairRequiredStepIds: matrix.repairRequiredStepIds,
      dbRepairRequiredStepIds: matrix.dbRepairRequiredStepIds,
      blockedPlanStepIds: matrix.blockedPlanStepIds,
      commandQueues: queueForGroup,
      blockers: uniqueStrings(group.operatorRequirements.flatMap((requirement) => requirement.blockers)),
      mutationBoundary: 'checklist only; commands are listed for operator sequencing and are not executed',
    }
  })

  const gateSummary = readObject(source.gateSummary ?? source.gate_summary)
  const coverageSummary = readObject(source.blockedGateActionCoverageSummary ?? source.blocked_gate_action_coverage_summary)
  const summary = {
    blockedGateCount: readNumber(coverageSummary.totalBlockedGateCount ?? coverageSummary.total_blocked_gate_count ?? gateSummary.blocked),
    coveredBlockedGateCount: readNumber(coverageSummary.coveredBlockedGateCount ?? coverageSummary.covered_blocked_gate_count),
    uncoveredBlockedGateCount: readNumber(coverageSummary.uncoveredBlockedGateCount ?? coverageSummary.uncovered_blocked_gate_count),
    actionGroupCount: actionChecklist.length,
    blockedActionGroupCount: actionChecklist.filter((entry) => entry.status === 'blocked').length,
    deferredActionGroupCount: actionChecklist.filter((entry) => entry.status === 'deferred').length,
    readOnlyEvidenceCommandCount: queues.readOnlyEvidence.length,
    manualPrerequisiteCommandCount: queues.manualPrerequisite.length,
    guardedWriteOrLiveCommandCount: queues.guardedWriteOrLive.length,
    autoRunnableCommandCount: queues.readOnlyEvidence.filter((entry) => entry.autoRunAllowed).length,
    productionClosingCommandCount: 0,
  }

  return {
    schemaVersion: 'workbuddy-default-master-plan-blocked-gate-action-checklist/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-blocked-gate-action-checklist',
    input: inputPath,
    inputDigest: normalizeInputDigest(inputDigest),
    status: String(source.status ?? '').trim() || (summary.blockedGateCount > 0 ? 'blocked' : 'pass'),
    productionReady: false,
    sourceProductionReady: source.productionReady === true || source.production_ready === true,
    gateSummary,
    blockedGateActionCoverageSummary: coverageSummary,
    summary,
    actionChecklist,
    evidenceBoundary: {
      evidenceTier: 'operator_unblock_planning_only',
      canCloseProductionReadinessGates: false,
      nonClosingEvidenceBoundary: [
        'This checklist is generated from existing gap and handoff reports only.',
        'It does not execute commands, connect to databases, import seeds, publish runtime, export live sources, run smoke, perform rollback, or close production readiness gates.',
      ],
    },
    mutationBoundary: [
      'Reads existing real-evidence gap summary only.',
      'Writes checklist JSON and Markdown reports only.',
      'does not run commands, spawn shells, connect to DB, run source exports, import seeds, publish runtime, run smoke, or perform rollback.',
      'Manual prerequisite and guarded write/live commands remain operator-controlled and are listed only for sequencing.',
    ],
  }
}

export async function buildDefaultMasterPlanBlockedGateActionChecklist({
  argv = process.argv.slice(2),
  now = new Date(),
} = {}) {
  const args = parseArgs(argv)
  if (args.help) {
    return {
      status: 'help',
      productionReady: false,
      help: renderHelp(),
    }
  }

  const inputText = await readFile(args.input, 'utf8')
  const sourceReport = JSON.parse(inputText)
  const checklist = buildBlockedGateActionChecklist(sourceReport, {
    inputPath: args.input,
    inputDigest: {
      algorithm: 'sha256',
      sha256: sha256(inputText),
      sizeBytes: Buffer.byteLength(inputText),
    },
    now,
  })
  const output = {
    ...checklist,
    jsonOutput: args.output,
    markdownOutput: args.markdown,
  }

  await mkdir(path.dirname(args.output), { recursive: true })
  await mkdir(path.dirname(args.markdown), { recursive: true })
  await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  await writeFile(args.markdown, renderMarkdown(output), 'utf8')

  return output
}

function normalizeActionGroup(group) {
  const source = readObject(group)
  return {
    id: String(source.id ?? source.actionGroupId ?? source.action_group_id ?? '').trim(),
    status: String(source.status ?? '').trim() || 'unknown',
    priority: readNumber(source.priority),
    nextAction: String(source.nextAction ?? source.next_action ?? '').trim(),
    operatorRequirements: arrayOfObjects(source.operatorRequirements ?? source.operator_requirements)
      .map(normalizeOperatorRequirement),
  }
}

function normalizeOperatorRequirement(requirement) {
  const source = readObject(requirement)
  return {
    actionId: String(source.actionId ?? source.action_id ?? '').trim(),
    gate: String(source.gate ?? '').trim(),
    blockers: arrayOfStrings(source.blockers),
    nextRequirements: readObject(source.nextRequirements ?? source.next_requirements),
  }
}

function normalizeCoverageEntry(entry) {
  const source = readObject(entry)
  return {
    gateId: String(source.gateId ?? source.gate_id ?? '').trim(),
    tier: String(source.tier ?? '').trim(),
    status: String(source.status ?? '').trim(),
    blockerCount: readNumber(source.blockerCount ?? source.blocker_count),
    covered: source.covered === true,
    coveredByActionGroupIds: arrayOfStrings(source.coveredByActionGroupIds ?? source.covered_by_action_group_ids),
    uncoveredBlockers: arrayOfStrings(source.uncoveredBlockers ?? source.uncovered_blockers),
  }
}

function normalizeRequirementMatrixRow(row) {
  const source = readObject(row)
  return {
    actionGroupId: String(source.actionGroupId ?? source.action_group_id ?? '').trim(),
    priority: readNumber(source.priority),
    status: String(source.status ?? '').trim() || 'unknown',
    operatorRequirementActionIds: arrayOfStrings(source.operatorRequirementActionIds ?? source.operator_requirement_action_ids),
    envUnlockVariables: arrayOfStrings(source.envUnlockVariables ?? source.env_unlock_variables),
    requiredFlags: arrayOfStrings(source.requiredFlags ?? source.required_flags),
    operatorFields: arrayOfStrings(source.operatorFields ?? source.operator_fields),
    evidenceInputArtifacts: arrayOfStrings(source.evidenceInputArtifacts ?? source.evidence_input_artifacts),
    requiredEnvironmentTargets: arrayOfStrings(source.requiredEnvironmentTargets ?? source.required_environment_targets),
    verificationCommands: arrayOfStrings(source.verificationCommands ?? source.verification_commands),
    repairRequiredStepIds: arrayOfStrings(source.repairRequiredStepIds ?? source.repair_required_step_ids),
    dbRepairRequiredStepIds: arrayOfStrings(source.dbRepairRequiredStepIds ?? source.db_repair_required_step_ids),
    blockedPlanStepIds: arrayOfStrings(source.blockedPlanStepIds ?? source.blocked_plan_step_ids),
  }
}

function emptyRequirementRow(group) {
  return {
    actionGroupId: group.id,
    priority: group.priority,
    status: group.status,
    operatorRequirementActionIds: uniqueStrings(group.operatorRequirements.map((entry) => entry.actionId)),
    envUnlockVariables: [],
    requiredFlags: [],
    operatorFields: [],
    evidenceInputArtifacts: [],
    requiredEnvironmentTargets: [],
    verificationCommands: [],
    repairRequiredStepIds: [],
    dbRepairRequiredStepIds: [],
    blockedPlanStepIds: [],
  }
}

function normalizeCommandQueues(value) {
  const queues = readObject(value)
  return {
    readOnlyEvidence: normalizeQueueEntries(queues.readOnlyEvidence ?? queues.read_only_evidence),
    manualPrerequisite: normalizeQueueEntries(queues.manualPrerequisite ?? queues.manual_prerequisite),
    guardedWriteOrLive: normalizeQueueEntries(queues.guardedWriteOrLive ?? queues.guarded_write_or_live),
  }
}

function normalizeQueueEntries(value) {
  return arrayOfObjects(value).map((entry) => {
    const source = readObject(entry)
    return {
      command: normalizeCommand(source.command),
      executionReadiness: String(source.executionReadiness ?? source.execution_readiness ?? '').trim() || 'unknown',
      commandKind: String(source.commandKind ?? source.command_kind ?? '').trim() || 'unknown',
      actionGroupIds: arrayOfStrings(source.actionGroupIds ?? source.action_group_ids),
      commandSources: arrayOfStrings(source.commandSources ?? source.command_sources),
      duplicateCount: readNumber(source.duplicateCount ?? source.duplicate_count),
      queueId: String(source.queueId ?? source.queue_id ?? '').trim() || 'unknown',
      autoRunAllowed: source.autoRunAllowed === true || source.auto_run_allowed === true,
    }
  }).filter((entry) => entry.command)
}

function commandsForActionGroup(entries, actionGroupId) {
  return entries.filter((entry) => entry.actionGroupIds.includes(actionGroupId))
}

function renderMarkdown(checklist) {
  const lines = [
    '# Default Master Plan Blocked Gate Action Checklist',
    '',
    `- generatedAt: ${checklist.generatedAt}`,
    `- status: ${checklist.status}`,
    `- productionReady: ${checklist.productionReady ? 'yes' : 'no'}`,
    `- input: ${checklist.input}`,
    `- inputSha256: ${checklist.inputDigest.sha256 || 'not available'}`,
    `- inputSizeBytes: ${checklist.inputDigest.sizeBytes}`,
    `- jsonOutput: ${checklist.jsonOutput || 'not-written'}`,
    `- markdownOutput: ${checklist.markdownOutput || 'not-written'}`,
    '',
    '## Summary',
    '',
    `- blockedGateCount: ${checklist.summary.blockedGateCount}`,
    `- coveredBlockedGateCount: ${checklist.summary.coveredBlockedGateCount}`,
    `- uncoveredBlockedGateCount: ${checklist.summary.uncoveredBlockedGateCount}`,
    `- actionGroupCount: ${checklist.summary.actionGroupCount}`,
    `- blockedActionGroupCount: ${checklist.summary.blockedActionGroupCount}`,
    `- deferredActionGroupCount: ${checklist.summary.deferredActionGroupCount}`,
    `- readOnlyEvidenceCommandCount: ${checklist.summary.readOnlyEvidenceCommandCount}`,
    `- manualPrerequisiteCommandCount: ${checklist.summary.manualPrerequisiteCommandCount}`,
    `- guardedWriteOrLiveCommandCount: ${checklist.summary.guardedWriteOrLiveCommandCount}`,
    `- productionClosingCommandCount: ${checklist.summary.productionClosingCommandCount}`,
    '',
    '## Evidence Boundary',
    '',
    `- evidenceTier: ${checklist.evidenceBoundary.evidenceTier}`,
    `- canCloseProductionReadinessGates: ${checklist.evidenceBoundary.canCloseProductionReadinessGates ? 'yes' : 'no'}`,
  ]

  for (const boundary of checklist.evidenceBoundary.nonClosingEvidenceBoundary) {
    lines.push(`- nonClosingEvidenceBoundary: ${boundary}`)
  }

  lines.push('')
  lines.push('## Action Checklist')
  lines.push('')

  if (!checklist.actionChecklist.length) {
    lines.push('- No blocked action groups.')
  } else {
    for (const entry of checklist.actionChecklist) {
      lines.push(`- action_group: ${entry.priority} | ${entry.status} | ${entry.actionGroupId}`)
      lines.push(`  - covered_gates: ${entry.coveredGateIds.length ? entry.coveredGateIds.join(', ') : 'none'}`)
      lines.push(`  - next_action: ${entry.nextAction || 'not available'}`)
      if (entry.envUnlockVariables.length) lines.push(`  - env_unlocks: ${entry.envUnlockVariables.join(', ')}`)
      if (entry.requiredFlags.length) lines.push(`  - required_flags: ${entry.requiredFlags.join(', ')}`)
      if (entry.operatorFields.length) lines.push(`  - operator_fields: ${entry.operatorFields.join(', ')}`)
      if (entry.evidenceInputArtifacts.length) lines.push(`  - evidence_inputs: ${entry.evidenceInputArtifacts.join(', ')}`)
      if (entry.requiredEnvironmentTargets.length) lines.push(`  - environment_targets: ${entry.requiredEnvironmentTargets.join(', ')}`)
      if (entry.repairRequiredStepIds.length) lines.push(`  - repair_steps: ${entry.repairRequiredStepIds.join(', ')}`)
      if (entry.dbRepairRequiredStepIds.length) lines.push(`  - db_repair_steps: ${entry.dbRepairRequiredStepIds.join(', ')}`)
      if (entry.blockedPlanStepIds.length) lines.push(`  - blocked_plan_steps: ${entry.blockedPlanStepIds.join(', ')}`)
      for (const command of entry.commandQueues.readOnlyEvidence) lines.push(`  - read_only_evidence: ${command.command}`)
      for (const command of entry.commandQueues.manualPrerequisite) lines.push(`  - manual_prerequisite: ${command.command}`)
      for (const command of entry.commandQueues.guardedWriteOrLive) lines.push(`  - guarded_write_or_live: ${command.command}`)
    }
  }

  lines.push('')
  lines.push('## Mutation Boundary')
  lines.push('')
  for (const boundary of checklist.mutationBoundary) {
    lines.push(`- ${boundary}`)
  }
  lines.push('')

  return `${lines.join('\n')}\n`
}

function renderHelp() {
  return [
    'Usage: node project-testing/tools/build-default-master-plan-blocked-gate-action-checklist.mjs [options]',
    '',
    'Options:',
    '  --input <json>       real-evidence-gap-summary.json',
    '  --output <json>      output JSON path',
    '  --markdown <md>      output Markdown path',
    '  --json               print JSON summary',
    '  --help               show help',
  ].join('\n')
}

function normalizeInputDigest(value) {
  const digest = readObject(value)
  return {
    algorithm: String(digest.algorithm ?? '').trim() || 'sha256',
    sha256: String(digest.sha256 ?? '').trim(),
    sizeBytes: readNumber(digest.sizeBytes ?? digest.size_bytes),
  }
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

function uniqueStrings(values) {
  return [...new Set(arrayOfStrings(values))]
}

function normalizeCommand(command) {
  return String(command ?? '').trim().replace(/\s+/g, ' ')
}

function readNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function sha256(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex')
}

async function main() {
  const result = await buildDefaultMasterPlanBlockedGateActionChecklist()
  if (result.help) {
    console.log(result.help)
    return
  }
  if (parseArgs().json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`Default master-plan blocked gate action checklist: ${result.status}`)
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
