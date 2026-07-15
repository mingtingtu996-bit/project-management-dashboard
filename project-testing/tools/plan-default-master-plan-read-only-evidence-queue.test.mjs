import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  parseArgs,
  buildReadOnlyEvidenceQueuePlan,
  planDefaultMasterPlanReadOnlyEvidenceQueue,
} from './plan-default-master-plan-read-only-evidence-queue.mjs'

function readOnlyEntry(command, overrides = {}) {
  return {
    command,
    executionReadiness: 'blocked',
    commandKind: 'read_only_evidence',
    actionGroupIds: ['runtime_task_alignment_and_duration_samples'],
    commandSources: ['execution_gate_plan:preflight:command'],
    duplicateCount: 1,
    queueId: 'read_only_evidence',
    autoRunAllowed: true,
    ...overrides,
  }
}

function sourceReport(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-readiness-dashboard-refresh/v1',
    status: 'blocked',
    productionReady: false,
    gateSummary: {
      total: 11,
      pass: 6,
      blocked: 5,
      fail: 0,
      completionRate: 54.5,
    },
    operatorCommandExecutionQueues: {
      readOnlyEvidence: [
        readOnlyEntry('npm.cmd run evidence:default-master-plan:candidate-hygiene'),
        readOnlyEntry('npm run evidence:default-master-plan:real-evidence-gaps'),
      ],
      manualPrerequisite: [
        readOnlyEntry('$env:WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_REFRESH_EXECUTION="1"', {
          commandKind: 'manual_prerequisite',
          queueId: 'manual_prerequisite',
          autoRunAllowed: false,
        }),
      ],
      guardedWriteOrLive: [
        readOnlyEntry('npm.cmd run evidence:default-master-plan:runtime-seed-import-execution', {
          commandKind: 'guarded_write_or_db_dependent',
          queueId: 'guarded_write_or_live',
          autoRunAllowed: false,
        }),
      ],
    },
    ...overrides,
  }
}

test('parseArgs derives Markdown next to custom output when markdown is omitted', () => {
  const output = path.join(tmpdir(), 'workbuddy-read-only-queue-custom', 'queue.json')
  const args = parseArgs(['--output', output])

  assert.equal(args.output, path.resolve(output))
  assert.equal(args.markdown, path.resolve(path.join(tmpdir(), 'workbuddy-read-only-queue-custom', 'queue.md')))
})

test('buildReadOnlyEvidenceQueuePlan plans only read-only evidence commands and keeps production readiness false', () => {
  const plan = buildReadOnlyEvidenceQueuePlan(sourceReport(), {
    inputPath: 'project-testing/reports/default-master-plan-production-readiness/readiness-dashboard-refresh.json',
    now: new Date('2026-07-08T09:30:00.000Z'),
  })

  assert.equal(plan.schemaVersion, 'workbuddy-default-master-plan-read-only-evidence-queue-plan/v1')
  assert.equal(plan.status, 'planned')
  assert.equal(plan.productionReady, false)
  assert.equal(plan.planOnly, true)
  assert.equal(plan.summary.plannedCommandCount, 2)
  assert.equal(plan.summary.rejectedReadOnlyQueueCommandCount, 0)
  assert.equal(plan.summary.excludedManualPrerequisiteCommandCount, 1)
  assert.equal(plan.summary.excludedGuardedWriteOrLiveCommandCount, 1)
  assert.equal(plan.summary.executionAllowed, false)
  assert.deepEqual(plan.readOnlyQueuePlan.map((entry) => entry.sequence), [1, 2])
  assert.deepEqual(plan.readOnlyQueuePlan.map((entry) => entry.command), [
    'npm.cmd run evidence:default-master-plan:candidate-hygiene',
    'npm run evidence:default-master-plan:real-evidence-gaps',
  ])
  assert.deepEqual(plan.rejectedReadOnlyQueueEntries, [])
  assert.match(plan.mutationBoundary.join('\n'), /does not execute commands/)
})

test('buildReadOnlyEvidenceQueuePlan blocks if the read-only queue contains manual or guarded commands', () => {
  const plan = buildReadOnlyEvidenceQueuePlan(sourceReport({
    operatorCommandExecutionQueues: {
      readOnlyEvidence: [
        readOnlyEntry('npm.cmd run evidence:default-master-plan:candidate-hygiene'),
        readOnlyEntry('npm.cmd run evidence:default-master-plan:runtime-seed-import-execution', {
          commandKind: 'guarded_write_or_db_dependent',
          autoRunAllowed: true,
        }),
        readOnlyEntry('$env:WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT="1"', {
          commandKind: 'manual_prerequisite',
          autoRunAllowed: true,
        }),
      ],
      manualPrerequisite: [],
      guardedWriteOrLive: [],
    },
  }))

  assert.equal(plan.status, 'blocked')
  assert.equal(plan.summary.plannedCommandCount, 1)
  assert.equal(plan.summary.rejectedReadOnlyQueueCommandCount, 2)
  assert.deepEqual(plan.rejectedReadOnlyQueueEntries.map((entry) => entry.reason), [
    'command_kind_not_read_only_evidence',
    'command_kind_not_read_only_evidence',
  ])
})

test('buildReadOnlyEvidenceQueuePlan blocks dangerous write flags even when an entry is mislabeled read-only', () => {
  const plan = buildReadOnlyEvidenceQueuePlan(sourceReport({
    operatorCommandExecutionQueues: {
      readOnlyEvidence: [
        readOnlyEntry('node project-testing/tools/run-default-master-plan-staging-runtime-evidence.mjs --include-staging --confirm-staging-handoff --allow-write'),
      ],
      manualPrerequisite: [],
      guardedWriteOrLive: [],
    },
  }))

  assert.equal(plan.status, 'blocked')
  assert.equal(plan.summary.plannedCommandCount, 0)
  assert.equal(plan.summary.rejectedReadOnlyQueueCommandCount, 1)
  assert.equal(plan.rejectedReadOnlyQueueEntries[0].reason, 'forbidden_write_or_live_command_marker')
})

test('planDefaultMasterPlanReadOnlyEvidenceQueue writes plan-only JSON and Markdown artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-read-only-queue-plan-'))
  const input = path.join(root, 'readiness-dashboard-refresh.json')
  const output = path.join(root, 'read-only-evidence-queue-plan.json')
  const markdown = path.join(root, 'read-only-evidence-queue-plan.md')
  await writeFile(input, JSON.stringify(sourceReport(), null, 2))

  try {
    const result = await planDefaultMasterPlanReadOnlyEvidenceQueue({
      argv: [
        '--input',
        input,
        '--output',
        output,
        '--markdown',
        markdown,
        '--json',
      ],
      now: new Date('2026-07-08T09:35:00.000Z'),
    })

    assert.equal(result.status, 'planned')
    assert.equal(result.jsonOutput, output)
    assert.equal(result.markdownOutput, markdown)

    const persisted = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(persisted.summary.plannedCommandCount, 2)
    assert.equal(persisted.productionReady, false)

    const markdownText = await readFile(markdown, 'utf8')
    assert.match(markdownText, /# Default Master Plan Read-only Evidence Queue Plan/)
    assert.match(markdownText, /- status: planned/)
    assert.match(markdownText, /- plannedCommandCount: 2/)
    assert.match(markdownText, /queue_command: 1 \| blocked \| npm\.cmd run evidence:default-master-plan:candidate-hygiene/)
    assert.match(markdownText, /does not execute commands/)
    assert.match(markdownText, /## Execution Evidence Boundary/)
    assert.match(markdownText, /- evidenceTier: tooling_readiness_supporting_only/)
    assert.match(markdownText, /- canCloseProductionReadinessGates: no/)
    assert.match(markdownText, /- cannotCloseGateIds: runtime_source_export_provenance, runtime_seed_and_reference_days_evidence, duration_sample_collection_package, runtime_duration_calibration_evidence, runtime_evidence_lineage_consistency/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('planDefaultMasterPlanReadOnlyEvidenceQueue refuses execution without explicit read-only confirmation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-read-only-queue-exec-refuse-'))
  const input = path.join(root, 'real-evidence-gap-summary.json')
  const output = path.join(root, 'read-only-evidence-queue-plan.json')
  const calls = []
  await writeFile(input, JSON.stringify(sourceReport(), null, 2))

  try {
    const result = await planDefaultMasterPlanReadOnlyEvidenceQueue({
      argv: [
        '--input',
        input,
        '--output',
        output,
        '--execute',
      ],
      runCommand: async (command) => {
        calls.push(command)
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 }
      },
      now: new Date('2026-07-08T09:40:00.000Z'),
    })

    assert.equal(result.status, 'blocked')
    assert.deepEqual(result.executionBlockers, ['confirm_read_only_execution_required'])
    assert.equal(result.summary.executionRequested, true)
    assert.equal(result.summary.executionAllowed, false)
    assert.deepEqual(calls, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('planDefaultMasterPlanReadOnlyEvidenceQueue executes only confirmed plan-safe read-only commands through runner', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-read-only-queue-exec-'))
  const input = path.join(root, 'real-evidence-gap-summary.json')
  const output = path.join(root, 'read-only-evidence-queue-plan.json')
  const calls = []
  await writeFile(input, JSON.stringify(sourceReport(), null, 2))

  try {
    const result = await planDefaultMasterPlanReadOnlyEvidenceQueue({
      argv: [
        '--input',
        input,
        '--output',
        output,
        '--execute',
        '--confirm-read-only-execution',
      ],
      runCommand: async (command) => {
        calls.push(command)
        return {
          exitCode: 0,
          stdout: `ok:${command}`,
          stderr: '',
          durationMs: 7,
        }
      },
      now: new Date('2026-07-08T09:45:00.000Z'),
    })

    assert.equal(result.status, 'executed')
    assert.equal(result.productionReady, false)
    assert.equal(result.summary.executionRequested, true)
    assert.equal(result.summary.executionAllowed, true)
    assert.deepEqual(calls, [
      'npm.cmd run evidence:default-master-plan:candidate-hygiene',
      'npm run evidence:default-master-plan:real-evidence-gaps',
    ])
    assert.deepEqual(result.executionSummary, {
      commandCount: 2,
      passedCommandCount: 2,
      failedCommandCount: 0,
      skippedCommandCount: 0,
    })
    assert.deepEqual(result.executionResults.map((entry) => ({
      command: entry.command,
      exitCode: entry.exitCode,
      status: entry.status,
    })), [
      {
        command: 'npm.cmd run evidence:default-master-plan:candidate-hygiene',
        exitCode: 0,
        status: 'pass',
      },
      {
        command: 'npm run evidence:default-master-plan:real-evidence-gaps',
        exitCode: 0,
        status: 'pass',
      },
    ])
    assert.deepEqual(result.executionEvidenceBoundary, {
      evidenceTier: 'tooling_readiness_supporting_only',
      canCloseProductionReadinessGates: false,
      nonClosingEvidenceBoundary: [
        'Read-only queue execution may support tooling readiness only.',
        'It cannot close candidate refresh, materialization, runtime seed import, runtime publication, smoke, rollback, live outcome, or production-ready gates.',
      ],
      cannotCloseGateIds: [
        'runtime_source_export_provenance',
        'runtime_seed_and_reference_days_evidence',
        'duration_sample_collection_package',
        'runtime_duration_calibration_evidence',
        'runtime_evidence_lineage_consistency',
      ],
    })
    assert.equal(result.executionResults[0].evidenceTier, 'tooling_readiness_supporting_only')
    assert.equal(result.executionResults[0].canCloseProductionReadinessGates, false)
    assert.match(result.executionResults[0].commandHash, /^[a-f0-9]{64}$/)
    assert.equal(result.executionResults[0].cwd, process.cwd())
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('planDefaultMasterPlanReadOnlyEvidenceQueue records failed read-only execution without production-ready evidence', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-read-only-queue-exec-fail-'))
  const input = path.join(root, 'real-evidence-gap-summary.json')
  const output = path.join(root, 'read-only-evidence-queue-plan.json')
  await writeFile(input, JSON.stringify(sourceReport(), null, 2))

  try {
    const result = await planDefaultMasterPlanReadOnlyEvidenceQueue({
      argv: [
        '--input',
        input,
        '--output',
        output,
        '--execute',
        '--confirm-read-only-execution',
      ],
      runCommand: async (command) => ({
        exitCode: command.includes('real-evidence-gaps') ? 2 : 0,
        stdout: '',
        stderr: command.includes('real-evidence-gaps') ? 'synthetic read-only failure' : '',
        durationMs: 5,
      }),
      now: new Date('2026-07-08T09:50:00.000Z'),
    })

    assert.equal(result.status, 'failed')
    assert.equal(result.productionReady, false)
    assert.equal(result.executionEvidenceBoundary.evidenceTier, 'tooling_readiness_supporting_only')
    assert.equal(result.executionEvidenceBoundary.canCloseProductionReadinessGates, false)
    assert.deepEqual(result.executionSummary, {
      commandCount: 2,
      passedCommandCount: 1,
      failedCommandCount: 1,
      skippedCommandCount: 0,
    })
    assert.deepEqual(result.executionResults.map((entry) => entry.status), ['pass', 'fail'])
    assert.equal(result.executionResults[1].canCloseProductionReadinessGates, false)
    assert.match(result.executionResults[1].stderrTail, /synthetic read-only failure/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('planDefaultMasterPlanReadOnlyEvidenceQueue refuses execution when the read-only queue is contaminated', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-read-only-queue-exec-contaminated-'))
  const input = path.join(root, 'real-evidence-gap-summary.json')
  const output = path.join(root, 'read-only-evidence-queue-plan.json')
  const markdown = path.join(root, 'read-only-evidence-queue-plan.md')
  const calls = []
  await writeFile(input, JSON.stringify(sourceReport({
    operatorCommandExecutionQueues: {
      readOnlyEvidence: [
        readOnlyEntry('npm.cmd run evidence:default-master-plan:runtime-seed-import-execution', {
          commandKind: 'guarded_write_or_db_dependent',
          autoRunAllowed: true,
        }),
      ],
      manualPrerequisite: [],
      guardedWriteOrLive: [],
    },
  }), null, 2))

  try {
    const result = await planDefaultMasterPlanReadOnlyEvidenceQueue({
      argv: [
        '--input',
        input,
        '--output',
        output,
        '--markdown',
        markdown,
        '--execute',
        '--confirm-read-only-execution',
      ],
      runCommand: async (command) => {
        calls.push(command)
        return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 }
      },
    })

    assert.equal(result.status, 'blocked')
    assert.deepEqual(result.executionBlockers, ['read_only_queue_contains_rejected_entries'])
    assert.deepEqual(calls, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
