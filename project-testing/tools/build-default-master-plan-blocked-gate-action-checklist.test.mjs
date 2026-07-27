import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildBlockedGateActionChecklist,
  buildDefaultMasterPlanBlockedGateActionChecklist,
} from './build-default-master-plan-blocked-gate-action-checklist.mjs'

function queueEntry(command, queueId, actionGroupIds, overrides = {}) {
  return {
    command,
    executionReadiness: 'blocked',
    commandKind: queueId === 'read_only_evidence'
      ? 'read_only_evidence'
      : queueId === 'manual_prerequisite'
        ? 'manual_prerequisite'
        : 'guarded_write_or_db_dependent',
    actionGroupIds,
    commandSources: ['unit-test'],
    duplicateCount: 1,
    queueId,
    autoRunAllowed: queueId === 'read_only_evidence',
    ...overrides,
  }
}

function gapSummary(overrides = {}) {
  return {
    schemaVersion: 'workbuddy-default-master-plan-real-evidence-gap-summary/v1',
    generatedAt: '2026-07-08T09:00:00.000Z',
    status: 'blocked',
    productionReady: false,
    gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
    blockedGateActionCoverageSummary: {
      totalBlockedGateCount: 2,
      coveredBlockedGateCount: 2,
      uncoveredBlockedGateCount: 0,
      coverageRate: 100,
      coveredBlockedGateIds: [
        'runtime_seed_and_reference_days_evidence',
        'duration_sample_collection_package',
      ],
      uncoveredBlockedGateIds: [],
      coveringActionGroupIds: [
        'runtime_seed_local_environment_and_import',
        'runtime_task_alignment_and_duration_samples',
      ],
    },
    blockedGateActionCoverage: [
      {
        gateId: 'runtime_seed_and_reference_days_evidence',
        tier: 'runtime_evidence',
        status: 'blocked',
        blockerCount: 13,
        covered: true,
        coveredByActionGroupIds: ['runtime_seed_local_environment_and_import'],
        uncoveredBlockers: [],
      },
      {
        gateId: 'duration_sample_collection_package',
        tier: 'runtime_evidence',
        status: 'blocked',
        blockerCount: 2,
        covered: true,
        coveredByActionGroupIds: ['runtime_task_alignment_and_duration_samples'],
        uncoveredBlockers: [],
      },
    ],
    prioritizedNextActionGroups: [
      {
        id: 'runtime_seed_local_environment_and_import',
        status: 'blocked',
        priority: 30,
        nextAction: 'Prepare the local runtime seed environment and rerun runtime seed import.',
        operatorRequirements: [{
          actionId: 'runtime_seed_import_execution',
          gate: 'runtime_seed_and_reference_days_evidence',
          blockers: [
            'runtime_seed_import_execution_allow_import_required',
            'runtime_seed_import_execution_seed_smoke_user_id_required',
          ],
          nextRequirements: {
            envUnlocks: [{ variable: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT', value: '1' }],
            requiredFlags: [{ flag: '--allow-import' }],
            operatorFields: [{ field: '--seed-smoke-user-id' }],
            evidenceInputs: [{ artifact: 'runtime-seed-post-import-verification.json', requiredStatus: 'runtime_seed_post_import_verified' }],
            requiredEnvironmentTargets: [],
            verificationCommands: ['node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs'],
          },
        }],
      },
      {
        id: 'runtime_task_alignment_and_duration_samples',
        status: 'deferred',
        priority: 40,
        nextAction: 'Collect accepted actual duration samples after candidate refresh is closed.',
        operatorRequirements: [{
          actionId: 'real_duration_sample_source_export',
          gate: 'duration_sample_collection_package',
          blockers: ['real_duration_sample_material_preflight_checked_by_required'],
          nextRequirements: {
            envUnlocks: [],
            requiredFlags: [],
            operatorFields: [{ field: '--checked-by' }],
            evidenceInputs: [{ artifact: 'real-duration-sample-material.json', requiredStatus: 'accepted_real_duration_sample_material_coverage_complete' }],
            requiredEnvironmentTargets: [],
            verificationCommands: ['npm run evidence:default-master-plan:real-duration-sample-preflight'],
          },
        }],
      },
    ],
    operatorUnblockRequirementMatrix: [
      {
        actionGroupId: 'runtime_seed_local_environment_and_import',
        priority: 30,
        status: 'blocked',
        operatorRequirementActionIds: ['runtime_seed_import_execution'],
        envUnlockVariables: ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'],
        requiredFlags: ['--allow-import'],
        operatorFields: ['--seed-smoke-user-id'],
        evidenceInputArtifacts: ['runtime-seed-post-import-verification.json'],
        requiredEnvironmentTargets: [],
        verificationCommands: ['node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs'],
        repairRequiredStepIds: ['install_or_start_docker'],
        dbRepairRequiredStepIds: [],
        blockedPlanStepIds: ['rerun_runtime_seed_pipeline'],
      },
      {
        actionGroupId: 'runtime_task_alignment_and_duration_samples',
        priority: 40,
        status: 'deferred',
        operatorRequirementActionIds: ['real_duration_sample_source_export'],
        envUnlockVariables: [],
        requiredFlags: [],
        operatorFields: ['--checked-by'],
        evidenceInputArtifacts: ['real-duration-sample-material.json'],
        requiredEnvironmentTargets: [],
        verificationCommands: ['npm run evidence:default-master-plan:real-duration-sample-preflight'],
        repairRequiredStepIds: [],
        dbRepairRequiredStepIds: [],
        blockedPlanStepIds: [],
      },
    ],
    operatorCommandExecutionQueues: {
      readOnlyEvidence: [
        queueEntry('node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs', 'read_only_evidence', ['runtime_seed_local_environment_and_import']),
        queueEntry('npm run evidence:default-master-plan:real-duration-sample-preflight', 'read_only_evidence', ['runtime_task_alignment_and_duration_samples']),
      ],
      manualPrerequisite: [
        queueEntry('$env:WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT="1"', 'manual_prerequisite', ['runtime_seed_local_environment_and_import']),
      ],
      guardedWriteOrLive: [
        queueEntry('npm run evidence:default-master-plan:runtime-seed-import-execution', 'guarded_write_or_live', ['runtime_seed_local_environment_and_import']),
      ],
    },
    ...overrides,
  }
}

test('buildBlockedGateActionChecklist summarizes blocked gates, requirements, and command queues without production mutation', () => {
  const checklist = buildBlockedGateActionChecklist(gapSummary(), {
    inputPath: 'project-testing/reports/default-master-plan-production-readiness/real-evidence-gap-summary.json',
    now: new Date('2026-07-08T10:00:00.000Z'),
  })

  assert.equal(checklist.schemaVersion, 'workbuddy-default-master-plan-blocked-gate-action-checklist/v1')
  assert.equal(checklist.status, 'blocked')
  assert.equal(checklist.productionReady, false)
  assert.equal(checklist.summary.blockedGateCount, 2)
  assert.equal(checklist.summary.actionGroupCount, 2)
  assert.equal(checklist.summary.blockedActionGroupCount, 1)
  assert.equal(checklist.summary.deferredActionGroupCount, 1)
  assert.equal(checklist.summary.readOnlyEvidenceCommandCount, 2)
  assert.equal(checklist.summary.manualPrerequisiteCommandCount, 1)
  assert.equal(checklist.summary.guardedWriteOrLiveCommandCount, 1)
  assert.equal(checklist.summary.autoRunnableCommandCount, 2)
  assert.equal(checklist.summary.productionClosingCommandCount, 0)
  assert.deepEqual(checklist.actionChecklist.map((entry) => entry.actionGroupId), [
    'runtime_seed_local_environment_and_import',
    'runtime_task_alignment_and_duration_samples',
  ])

  const seed = checklist.actionChecklist[0]
  assert.deepEqual(seed.coveredGateIds, ['runtime_seed_and_reference_days_evidence'])
  assert.deepEqual(seed.operatorRequirementActionIds, ['runtime_seed_import_execution'])
  assert.deepEqual(seed.envUnlockVariables, ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'])
  assert.deepEqual(seed.requiredFlags, ['--allow-import'])
  assert.deepEqual(seed.operatorFields, ['--seed-smoke-user-id'])
  assert.deepEqual(seed.evidenceInputArtifacts, ['runtime-seed-post-import-verification.json'])
  assert.deepEqual(seed.repairRequiredStepIds, ['install_or_start_docker'])
  assert.deepEqual(seed.blockedPlanStepIds, ['rerun_runtime_seed_pipeline'])
  assert.deepEqual(seed.commandQueues.readOnlyEvidence.map((entry) => entry.command), [
    'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
  ])
  assert.deepEqual(seed.commandQueues.manualPrerequisite.map((entry) => entry.command), [
    '$env:WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT="1"',
  ])
  assert.deepEqual(seed.commandQueues.guardedWriteOrLive.map((entry) => entry.command), [
    'npm run evidence:default-master-plan:runtime-seed-import-execution',
  ])
  assert.match(checklist.mutationBoundary.join('\n'), /does not run commands/)
  assert.equal(checklist.evidenceBoundary.canCloseProductionReadinessGates, false)
})

test('buildDefaultMasterPlanBlockedGateActionChecklist writes JSON and Markdown artifacts', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-blocked-gate-checklist-'))
  const input = path.join(root, 'real-evidence-gap-summary.json')
  const output = path.join(root, 'blocked-gate-action-checklist.json')
  const markdown = path.join(root, 'blocked-gate-action-checklist.md')
  const inputText = JSON.stringify(gapSummary(), null, 2)
  const expectedInputSha256 = createHash('sha256').update(inputText).digest('hex')
  await writeFile(input, inputText)

  try {
    const result = await buildDefaultMasterPlanBlockedGateActionChecklist({
      argv: [
        '--input',
        input,
        '--output',
        output,
        '--markdown',
        markdown,
        '--json',
      ],
      now: new Date('2026-07-08T10:05:00.000Z'),
    })

    assert.equal(result.status, 'blocked')
    assert.equal(result.productionReady, false)
    assert.equal(result.jsonOutput, output)
    assert.equal(result.markdownOutput, markdown)

    const persisted = JSON.parse(await readFile(output, 'utf8'))
    assert.equal(persisted.summary.actionGroupCount, 2)
    assert.equal(persisted.evidenceBoundary.canCloseProductionReadinessGates, false)
    assert.deepEqual(persisted.inputDigest, {
      algorithm: 'sha256',
      sha256: expectedInputSha256,
      sizeBytes: Buffer.byteLength(inputText),
    })

    const markdownText = await readFile(markdown, 'utf8')
    assert.match(markdownText, /# Default Master Plan Blocked Gate Action Checklist/)
    assert.match(markdownText, /- productionReady: no/)
    assert.match(markdownText, /- actionGroupCount: 2/)
    assert.match(markdownText, /## Action Checklist/)
    assert.match(markdownText, /runtime_seed_local_environment_and_import/)
    assert.match(markdownText, /guarded_write_or_live: npm run evidence:default-master-plan:runtime-seed-import-execution/)
    assert.match(markdownText, /does not run commands/)
    assert.match(markdownText, new RegExp(`inputSha256: ${expectedInputSha256}`))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
