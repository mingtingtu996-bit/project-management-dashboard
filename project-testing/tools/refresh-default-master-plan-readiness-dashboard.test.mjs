import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  parseArgs,
  refreshDefaultMasterPlanReadinessDashboard,
} from './refresh-default-master-plan-readiness-dashboard.mjs'

test('parseArgs accepts explicit output and report roots', () => {
  const args = parseArgs([
    '--output-root',
    'tmp/default-master-plan',
    '--report-root',
    'tmp/reports',
    '--source-root',
    'tmp/source-evidence',
    '--json',
  ])

  assert.equal(args.outputRoot.endsWith(path.join('tmp', 'default-master-plan')), true)
  assert.equal(args.reportRoot.endsWith(path.join('tmp', 'reports')), true)
  assert.equal(args.sourceRoot.endsWith(path.join('tmp', 'source-evidence')), true)
  assert.equal(args.json, true)
})

test('buildRefreshCliSummary preserves read-only execution evidence boundary', async () => {
  const module = await import('./refresh-default-master-plan-readiness-dashboard.mjs')

  assert.equal(typeof module.buildRefreshCliSummary, 'function')

  const summary = module.buildRefreshCliSummary({
    status: 'blocked',
    productionReady: false,
    gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
    completionRate: 54.5,
    blockedGateActionCoverageSummary: {},
    operatorUnblockRequirementSummary: {},
    operatorCommandPlanSummary: {},
    operatorCommandExecutionPlanSummary: {},
    operatorCommandExecutionQueueSummary: {},
    readOnlyEvidenceQueuePlanStatus: 'planned',
    readOnlyEvidenceQueuePlanSummary: {},
    readOnlyEvidenceQueueExecutionEvidenceBoundary: {
      evidenceTier: 'tooling_readiness_supporting_only',
      canCloseProductionReadinessGates: false,
      nonClosingEvidenceBoundary: [
        'Read-only queue execution may support tooling readiness only.',
      ],
      cannotCloseGateIds: ['runtime_source_export_provenance'],
    },
    sourceInputSummary: {},
    failedStepCount: 0,
    outputs: {},
  })

  assert.deepEqual(summary.readOnlyEvidenceQueueExecutionEvidenceBoundary, {
    evidenceTier: 'tooling_readiness_supporting_only',
    canCloseProductionReadinessGates: false,
    nonClosingEvidenceBoundary: [
      'Read-only queue execution may support tooling readiness only.',
    ],
    cannotCloseGateIds: ['runtime_source_export_provenance'],
  })
})

test('refreshes readiness, operator handoff, real evidence gaps, and release dashboard in no-write order', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-refresh-dashboard-'))
  const outputRoot = path.join(root, 'default-master-plan-production-readiness')
  const reportRoot = path.join(root, 'reports')
  const calls = []

  const fakeRunCommand = async (command, args) => {
    calls.push([command, ...args])
    const joined = [command, ...args].join(' ')
    if (joined.includes('check-default-master-plan-production-readiness.mjs')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          jsonPath: path.join(outputRoot, 'readiness.json'),
          markdownPath: path.join(outputRoot, 'readiness.md'),
          gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
        }),
        stderr: '',
        durationMs: 10,
      }
    }
    if (joined.includes('build-default-master-plan-production-operator-handoff.mjs')) {
      assert.equal(joined.includes('--readiness'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'readiness.json')), true)
      assert.equal(joined.includes('--output'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'operator-handoff.json')), true)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          output: path.join(outputRoot, 'operator-handoff.json'),
          currentBlockers: ['production_runtime_source_export_required'],
        }),
        stderr: '',
        durationMs: 11,
      }
    }
    if (joined.includes('check-default-master-plan-operator-handoff-preflight.mjs')) {
      assert.equal(joined.includes('--handoff'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'operator-handoff.json')), true)
      assert.equal(joined.includes('--output'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'operator-handoff-preflight.json')), true)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          output: path.join(outputRoot, 'operator-handoff-preflight.json'),
          runnableActionIds: [],
          blockedActionIds: ['source_export_collect'],
          deferredActionIds: [],
          blockers: ['production_or_live_source_export_required_for_production_ready'],
        }),
        stderr: '',
        durationMs: 12,
      }
    }
    if (joined.includes('summarize-default-master-plan-real-evidence-gaps.mjs')) {
      assert.equal(joined.includes('--operator-handoff'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'operator-handoff.json')), true)
      assert.equal(joined.includes('--operator-handoff-preflight'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'operator-handoff-preflight.json')), true)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          jsonOutput: path.join(outputRoot, 'real-evidence-gap-summary.json'),
          output: path.join(outputRoot, 'real-evidence-gap-summary.md'),
          gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
          blockedRealGateCount: 5,
          blockedGateActionCoverageSummary: {
            totalBlockedGateCount: 5,
            coveredBlockedGateCount: 5,
            uncoveredBlockedGateCount: 0,
            coverageRate: 100,
            coveredBlockedGateIds: [
              'runtime_source_export_provenance',
              'runtime_seed_and_reference_days_evidence',
              'duration_sample_collection_package',
              'runtime_duration_calibration_evidence',
              'runtime_evidence_lineage_consistency',
            ],
            uncoveredBlockedGateIds: [],
            coveringActionGroupIds: [
              'runtime_task_alignment_and_duration_samples',
              'production_live_outcome_evidence',
              'runtime_seed_local_environment_and_import',
            ],
          },
          operatorUnblockRequirementSummary: {
            actionGroupCount: 5,
            blockedActionGroupCount: 4,
            deferredActionGroupCount: 1,
            operatorRequirementActionCount: 5,
            envUnlockCount: 2,
            requiredFlagCount: 1,
            operatorFieldCount: 2,
            evidenceInputCount: 6,
            environmentTargetCount: 1,
            verificationCommandCount: 5,
            repairRequiredStepCount: 3,
            dbRepairRequiredStepCount: 2,
            blockedPlanStepCount: 2,
            envUnlockVariables: [
              'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
              'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
            ],
            requiredFlags: ['--allow-import'],
            operatorFields: ['--seed-smoke-user-id', '--checked-by'],
            evidenceInputArtifacts: [
              'runtime-seed-post-import-verification.json',
              'real-duration-sample-material-preflight.json',
              'real-duration-sample-material.json',
              'real-production-outcome.json',
              'operator-handoff.json',
              'readiness.json',
            ],
            requiredEnvironmentTargets: ['production_or_live'],
            verificationCommands: [
              'node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs',
              'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
              'npm run evidence:default-master-plan:real-duration-sample-preflight',
              'npm run evidence:default-master-plan:operator-handoff-preflight',
              'npm run evidence:default-master-plan:real-evidence-gaps',
            ],
            repairRequiredStepIds: [
              'install_or_start_docker',
              'install_supabase_cli',
              'start_local_supabase',
            ],
            dbRepairRequiredStepIds: [
              'confirm_candidate_refresh_target_identity',
              'repair_or_rotate_candidate_refresh_db_credentials',
            ],
            blockedPlanStepIds: [
              'rerun_candidate_refresh_execution',
              'rerun_runtime_seed_pipeline',
            ],
          },
          operatorCommandPlanSummary: {
            actionGroupCount: 5,
            totalCommandCount: 18,
            blockedCommandCount: 10,
            deferredCommandCount: 4,
            readOnlyEvidenceCommandCount: 11,
            guardedWriteOrLiveCommandCount: 7,
            manualPrerequisiteCommandCount: 0,
          },
          operatorCommandExecutionPlanSummary: {
            actionGroupCount: 5,
            rawCommandCount: 18,
            uniqueCommandCount: 14,
            duplicateCommandCount: 4,
            blockedCommandCount: 8,
            deferredCommandCount: 4,
            readOnlyEvidenceCommandCount: 9,
            guardedWriteOrLiveCommandCount: 5,
            manualPrerequisiteCommandCount: 0,
          },
          operatorCommandExecutionPlan: [{
            command: 'npm run evidence:default-master-plan:runtime-seed-pipeline',
            executionReadiness: 'blocked',
            commandKind: 'read_only_evidence',
            actionGroupIds: ['runtime_seed_local_environment_and_import'],
            commandSources: ['action_group_command', 'repair_plan:rerun_runtime_seed_pipeline:command'],
            duplicateCount: 2,
          }],
          operatorCommandExecutionQueueSummary: {
            totalUniqueCommandCount: 1,
            readOnlyEvidenceCommandCount: 1,
            manualPrerequisiteCommandCount: 0,
            guardedWriteOrLiveCommandCount: 0,
            autoRunAllowedCommandCount: 1,
            autoRunForbiddenCommandCount: 0,
            queueIds: [
              'read_only_evidence',
              'manual_prerequisite',
              'guarded_write_or_live',
            ],
          },
          operatorCommandExecutionQueues: {
            readOnlyEvidence: [{
              queueId: 'read_only_evidence',
              autoRunAllowed: true,
              command: 'npm run evidence:default-master-plan:runtime-seed-pipeline',
              executionReadiness: 'blocked',
              commandKind: 'read_only_evidence',
              actionGroupIds: ['runtime_seed_local_environment_and_import'],
              commandSources: ['action_group_command', 'repair_plan:rerun_runtime_seed_pipeline:command'],
              duplicateCount: 2,
            }],
            manualPrerequisite: [],
            guardedWriteOrLive: [],
          },
          prioritizedNextActionGroupCount: 5,
        }),
        stderr: '',
        durationMs: 13,
      }
    }
    if (joined.includes('plan-default-master-plan-read-only-evidence-queue.mjs')) {
      assert.equal(joined.includes('--input'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'real-evidence-gap-summary.json')), true)
      assert.equal(joined.includes('--output'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'read-only-evidence-queue-plan.json')), true)
      assert.equal(joined.includes('--markdown'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'read-only-evidence-queue-plan.md')), true)
      assert.equal(joined.includes('--plan-only'), true)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'planned',
          productionReady: false,
          planOnly: true,
          jsonOutput: path.join(outputRoot, 'read-only-evidence-queue-plan.json'),
          markdownOutput: path.join(outputRoot, 'read-only-evidence-queue-plan.md'),
          summary: {
            sourceReadOnlyEvidenceCommandCount: 1,
            plannedCommandCount: 1,
            rejectedReadOnlyQueueCommandCount: 0,
            excludedManualPrerequisiteCommandCount: 0,
            excludedGuardedWriteOrLiveCommandCount: 0,
            excludedForbiddenCommandCount: 0,
            executionRequested: false,
            executionAllowed: false,
            planOnly: true,
          },
          executionEvidenceBoundary: {
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
          },
        }),
        stderr: '',
        durationMs: 14,
      }
    }
    if (joined.includes('build-default-master-plan-blocked-gate-action-checklist.mjs')) {
      assert.equal(joined.includes('--input'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'real-evidence-gap-summary.json')), true)
      assert.equal(joined.includes('--output'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'blocked-gate-action-checklist.json')), true)
      assert.equal(joined.includes('--markdown'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'blocked-gate-action-checklist.md')), true)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          jsonOutput: path.join(outputRoot, 'blocked-gate-action-checklist.json'),
          markdownOutput: path.join(outputRoot, 'blocked-gate-action-checklist.md'),
          summary: {
            blockedGateCount: 5,
            coveredBlockedGateCount: 5,
            uncoveredBlockedGateCount: 0,
            actionGroupCount: 5,
            blockedActionGroupCount: 4,
            deferredActionGroupCount: 1,
            readOnlyEvidenceCommandCount: 1,
            manualPrerequisiteCommandCount: 0,
            guardedWriteOrLiveCommandCount: 0,
            autoRunnableCommandCount: 1,
            productionClosingCommandCount: 0,
          },
          inputDigest: {
            algorithm: 'sha256',
            sha256: 'f'.repeat(64),
            sizeBytes: 12345,
          },
          actionChecklist: [{
            actionGroupId: 'runtime_seed_local_environment_and_import',
            priority: 1,
            status: 'blocked',
            nextAction: 'Recover local runtime seed environment and rerun readiness seals.',
            coveredGateIds: [
              'runtime_seed_and_reference_days_evidence',
              'runtime_evidence_lineage_consistency',
            ],
            envUnlockVariables: ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'],
            requiredFlags: ['--allow-import'],
            operatorFields: ['--seed-smoke-user-id'],
            evidenceInputArtifacts: ['runtime-seed-post-import-verification.json'],
            requiredEnvironmentTargets: ['production_or_live'],
            blockers: [
              'runtime_seed_import_unlock_not_present',
              'runtime_seed_post_import_verification_missing',
            ],
            commandQueues: {
              readOnlyEvidence: [{
                command: 'npm.cmd run evidence:default-master-plan:runtime-seed-env',
              }, {
                command: 'npm.cmd run evidence:default-master-plan:runtime-seed-pipeline',
              }],
              manualPrerequisite: [{
                command: 'Set WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT=1 outside repo',
              }],
              guardedWriteOrLive: [{
                command: 'npm.cmd run evidence:default-master-plan:runtime-seed-import-execution -- --allow-import --seed-smoke-user-id <auditable-operator-id>',
              }],
            },
          }],
          evidenceBoundary: {
            evidenceTier: 'operator_unblock_planning_only',
            canCloseProductionReadinessGates: false,
            nonClosingEvidenceBoundary: [
              'This checklist is generated from existing gap and handoff reports only.',
              'It does not execute commands, connect to databases, import seeds, publish runtime, export live sources, run smoke, perform rollback, or close production readiness gates.',
            ],
          },
        }),
        stderr: '',
        durationMs: 15,
      }
    }
    if (joined.includes('check-default-master-plan-blocked-gate-action-checklist-freshness.mjs')) {
      assert.equal(joined.includes('--gap-summary'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'real-evidence-gap-summary.json')), true)
      assert.equal(joined.includes('--checklist'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'blocked-gate-action-checklist.json')), true)
      assert.equal(joined.includes('--output'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'blocked-gate-action-checklist-freshness.json')), true)
      assert.equal(joined.includes('--markdown'), true)
      assert.equal(joined.includes(path.join(outputRoot, 'blocked-gate-action-checklist-freshness.md')), true)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'fresh',
          productionReady: false,
          jsonOutput: path.join(outputRoot, 'blocked-gate-action-checklist-freshness.json'),
          markdownOutput: path.join(outputRoot, 'blocked-gate-action-checklist-freshness.md'),
          currentGapSummaryDigest: {
            algorithm: 'sha256',
            sha256: 'f'.repeat(64),
            sizeBytes: 12345,
          },
          checklistInputDigest: {
            algorithm: 'sha256',
            sha256: 'f'.repeat(64),
            sizeBytes: 12345,
          },
          summary: {
            fresh: true,
            digestAvailable: true,
            algorithmMatches: true,
            sha256Matches: true,
            sizeBytesMatches: true,
          },
          blockers: [],
          evidenceBoundary: {
            evidenceTier: 'checklist_freshness_only',
            canCloseProductionReadinessGates: false,
            nonClosingEvidenceBoundary: [
              'This freshness check only compares the checklist input digest with the current gap summary file.',
              'It does not execute commands, connect to databases, import seeds, publish runtime, run smoke, perform rollback, or close production readiness gates.',
            ],
          },
        }),
        stderr: '',
        durationMs: 16,
      }
    }
    if (joined.includes('run-release-dashboard.mjs')) {
      return {
        exitCode: 0,
        stdout: `Release dashboard report: ${path.join(reportRoot, 'release-20260708-000000')}\n`,
        stderr: '',
        durationMs: 17,
      }
    }
    throw new Error(`Unexpected command: ${joined}`)
  }

  try {
    const report = await refreshDefaultMasterPlanReadinessDashboard({
      argv: [
        '--output-root',
        outputRoot,
        '--report-root',
        reportRoot,
      ],
      now: new Date('2026-07-08T12:34:56.000Z'),
      runCommand: fakeRunCommand,
    })

    assert.deepEqual(calls.map((call) => path.basename(call[1])), [
      'check-default-master-plan-production-readiness.mjs',
      'build-default-master-plan-production-operator-handoff.mjs',
      'check-default-master-plan-operator-handoff-preflight.mjs',
      'summarize-default-master-plan-real-evidence-gaps.mjs',
      'plan-default-master-plan-read-only-evidence-queue.mjs',
      'build-default-master-plan-blocked-gate-action-checklist.mjs',
      'check-default-master-plan-blocked-gate-action-checklist-freshness.mjs',
      'run-release-dashboard.mjs',
    ])
    assert.deepEqual(report.gateSummary, { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 })
    assert.deepEqual(report.blockedGateActionCoverageSummary, {
      totalBlockedGateCount: 5,
      coveredBlockedGateCount: 5,
      uncoveredBlockedGateCount: 0,
      coverageRate: 100,
      coveredBlockedGateIds: [
        'runtime_source_export_provenance',
        'runtime_seed_and_reference_days_evidence',
        'duration_sample_collection_package',
        'runtime_duration_calibration_evidence',
        'runtime_evidence_lineage_consistency',
      ],
      uncoveredBlockedGateIds: [],
      coveringActionGroupIds: [
        'runtime_task_alignment_and_duration_samples',
        'production_live_outcome_evidence',
        'runtime_seed_local_environment_and_import',
      ],
    })
    assert.deepEqual(report.operatorUnblockRequirementSummary, {
      actionGroupCount: 5,
      blockedActionGroupCount: 4,
      deferredActionGroupCount: 1,
      operatorRequirementActionCount: 5,
      envUnlockCount: 2,
      requiredFlagCount: 1,
      operatorFieldCount: 2,
      evidenceInputCount: 6,
      environmentTargetCount: 1,
      verificationCommandCount: 5,
      repairRequiredStepCount: 3,
      dbRepairRequiredStepCount: 2,
      blockedPlanStepCount: 2,
      envUnlockVariables: [
        'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
        'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
      ],
      requiredFlags: ['--allow-import'],
      operatorFields: ['--seed-smoke-user-id', '--checked-by'],
      evidenceInputArtifacts: [
        'runtime-seed-post-import-verification.json',
        'real-duration-sample-material-preflight.json',
        'real-duration-sample-material.json',
        'real-production-outcome.json',
        'operator-handoff.json',
        'readiness.json',
      ],
      requiredEnvironmentTargets: ['production_or_live'],
      verificationCommands: [
        'node project-testing/tools/check-default-master-plan-candidate-baseline-materialization-readiness.mjs',
        'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
        'npm run evidence:default-master-plan:real-duration-sample-preflight',
        'npm run evidence:default-master-plan:operator-handoff-preflight',
        'npm run evidence:default-master-plan:real-evidence-gaps',
      ],
      repairRequiredStepIds: [
        'install_or_start_docker',
        'install_supabase_cli',
        'start_local_supabase',
      ],
      dbRepairRequiredStepIds: [
        'confirm_candidate_refresh_target_identity',
        'repair_or_rotate_candidate_refresh_db_credentials',
      ],
      blockedPlanStepIds: [
        'rerun_candidate_refresh_execution',
        'rerun_runtime_seed_pipeline',
      ],
    })
    assert.deepEqual(report.operatorCommandPlanSummary, {
      actionGroupCount: 5,
      totalCommandCount: 18,
      blockedCommandCount: 10,
      deferredCommandCount: 4,
      readOnlyEvidenceCommandCount: 11,
      guardedWriteOrLiveCommandCount: 7,
      manualPrerequisiteCommandCount: 0,
    })
    assert.deepEqual(report.operatorCommandExecutionPlanSummary, {
      actionGroupCount: 5,
      rawCommandCount: 18,
      uniqueCommandCount: 14,
      duplicateCommandCount: 4,
      blockedCommandCount: 8,
      deferredCommandCount: 4,
      readOnlyEvidenceCommandCount: 9,
      guardedWriteOrLiveCommandCount: 5,
      manualPrerequisiteCommandCount: 0,
    })
    assert.deepEqual(report.operatorCommandExecutionPlan, [{
      command: 'npm run evidence:default-master-plan:runtime-seed-pipeline',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['runtime_seed_local_environment_and_import'],
      commandSources: ['action_group_command', 'repair_plan:rerun_runtime_seed_pipeline:command'],
      duplicateCount: 2,
    }])
    assert.deepEqual(report.operatorCommandExecutionQueueSummary, {
      totalUniqueCommandCount: 1,
      readOnlyEvidenceCommandCount: 1,
      manualPrerequisiteCommandCount: 0,
      guardedWriteOrLiveCommandCount: 0,
      autoRunAllowedCommandCount: 1,
      autoRunForbiddenCommandCount: 0,
      queueIds: [
        'read_only_evidence',
        'manual_prerequisite',
        'guarded_write_or_live',
      ],
    })
    assert.deepEqual(report.operatorCommandExecutionQueues.readOnlyEvidence.map((entry) => ({
      queueId: entry.queueId,
      autoRunAllowed: entry.autoRunAllowed,
      command: entry.command,
    })), [{
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:runtime-seed-pipeline',
    }])
    assert.deepEqual(report.operatorCommandExecutionQueues.manualPrerequisite, [])
    assert.deepEqual(report.operatorCommandExecutionQueues.guardedWriteOrLive, [])
    assert.equal(report.status, 'blocked')
    assert.equal(report.productionReady, false)
    assert.equal(report.readOnlyEvidenceQueuePlanStatus, 'planned')
    assert.deepEqual(report.readOnlyEvidenceQueuePlanSummary, {
      sourceReadOnlyEvidenceCommandCount: 1,
      plannedCommandCount: 1,
      rejectedReadOnlyQueueCommandCount: 0,
      excludedManualPrerequisiteCommandCount: 0,
      excludedGuardedWriteOrLiveCommandCount: 0,
      excludedForbiddenCommandCount: 0,
      executionRequested: false,
      executionAllowed: false,
      planOnly: true,
    })
    assert.deepEqual(report.readOnlyEvidenceQueueExecutionEvidenceBoundary, {
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
    assert.equal(report.blockedGateActionChecklistStatus, 'blocked')
    assert.deepEqual(report.blockedGateActionChecklistSummary, {
      blockedGateCount: 5,
      coveredBlockedGateCount: 5,
      uncoveredBlockedGateCount: 0,
      actionGroupCount: 5,
      blockedActionGroupCount: 4,
      deferredActionGroupCount: 1,
      readOnlyEvidenceCommandCount: 1,
      manualPrerequisiteCommandCount: 0,
      guardedWriteOrLiveCommandCount: 0,
      autoRunnableCommandCount: 1,
      productionClosingCommandCount: 0,
    })
    assert.deepEqual(report.blockedGateActionChecklistInputDigest, {
      algorithm: 'sha256',
      sha256: 'f'.repeat(64),
      sizeBytes: 12345,
    })
    assert.deepEqual(report.blockedGateActionChecklistEvidenceBoundary, {
      evidenceTier: 'operator_unblock_planning_only',
      canCloseProductionReadinessGates: false,
      nonClosingEvidenceBoundary: [
        'This checklist is generated from existing gap and handoff reports only.',
        'It does not execute commands, connect to databases, import seeds, publish runtime, export live sources, run smoke, perform rollback, or close production readiness gates.',
      ],
    })
    assert.deepEqual(report.blockedGateActionChecklistCompactActionItems, [{
      actionGroupId: 'runtime_seed_local_environment_and_import',
      priority: 1,
      status: 'blocked',
      coveredGateIds: [
        'runtime_seed_and_reference_days_evidence',
        'runtime_evidence_lineage_consistency',
      ],
      nextAction: 'Recover local runtime seed environment and rerun readiness seals.',
      envUnlockVariables: ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'],
      requiredFlags: ['--allow-import'],
      operatorFields: ['--seed-smoke-user-id'],
      evidenceInputArtifacts: ['runtime-seed-post-import-verification.json'],
      requiredEnvironmentTargets: ['production_or_live'],
      blockerCount: 2,
      blockers: [
        'runtime_seed_import_unlock_not_present',
        'runtime_seed_post_import_verification_missing',
      ],
      commandCounts: {
        readOnlyEvidence: 2,
        manualPrerequisite: 1,
        guardedWriteOrLive: 1,
      },
    }])
    assert.equal(report.blockedGateActionChecklistFreshnessStatus, 'fresh')
    assert.deepEqual(report.blockedGateActionChecklistFreshnessSummary, {
      fresh: true,
      digestAvailable: true,
      algorithmMatches: true,
      sha256Matches: true,
      sizeBytesMatches: true,
    })
    assert.deepEqual(report.blockedGateActionChecklistFreshnessCurrentGapSummaryDigest, {
      algorithm: 'sha256',
      sha256: 'f'.repeat(64),
      sizeBytes: 12345,
    })
    assert.deepEqual(report.blockedGateActionChecklistFreshnessEvidenceBoundary, {
      evidenceTier: 'checklist_freshness_only',
      canCloseProductionReadinessGates: false,
      nonClosingEvidenceBoundary: [
        'This freshness check only compares the checklist input digest with the current gap summary file.',
        'It does not execute commands, connect to databases, import seeds, publish runtime, run smoke, perform rollback, or close production readiness gates.',
      ],
    })
    assert.equal(report.steps.every((step) => step.exitCode === 0), true)
    assert.equal(report.mutationBoundary.writesProductionTables, false)
    assert.equal(report.mutationBoundary.invokesRuntimeWriters, false)

    const persisted = JSON.parse(await readFile(path.join(outputRoot, 'readiness-dashboard-refresh.json'), 'utf8'))
    assert.equal(persisted.schemaVersion, 'workbuddy-default-master-plan-readiness-dashboard-refresh/v1')
    assert.deepEqual(persisted.gateSummary, report.gateSummary)
    assert.deepEqual(persisted.blockedGateActionCoverageSummary, report.blockedGateActionCoverageSummary)
    assert.deepEqual(persisted.operatorUnblockRequirementSummary, report.operatorUnblockRequirementSummary)
    assert.deepEqual(persisted.operatorCommandPlanSummary, report.operatorCommandPlanSummary)
    assert.deepEqual(persisted.operatorCommandExecutionPlanSummary, report.operatorCommandExecutionPlanSummary)
    assert.deepEqual(persisted.operatorCommandExecutionPlan, report.operatorCommandExecutionPlan)
    assert.deepEqual(persisted.operatorCommandExecutionQueueSummary, report.operatorCommandExecutionQueueSummary)
    assert.deepEqual(persisted.operatorCommandExecutionQueues, report.operatorCommandExecutionQueues)
    assert.equal(persisted.outputs.readOnlyEvidenceQueuePlanJson, path.relative(process.cwd(), path.join(outputRoot, 'read-only-evidence-queue-plan.json')).replace(/\\/g, '/'))
    assert.equal(persisted.outputs.readOnlyEvidenceQueuePlanMarkdown, path.relative(process.cwd(), path.join(outputRoot, 'read-only-evidence-queue-plan.md')).replace(/\\/g, '/'))
    assert.equal(persisted.outputs.blockedGateActionChecklistJson, path.relative(process.cwd(), path.join(outputRoot, 'blocked-gate-action-checklist.json')).replace(/\\/g, '/'))
    assert.equal(persisted.outputs.blockedGateActionChecklistMarkdown, path.relative(process.cwd(), path.join(outputRoot, 'blocked-gate-action-checklist.md')).replace(/\\/g, '/'))
    assert.equal(persisted.outputs.blockedGateActionChecklistFreshnessJson, path.relative(process.cwd(), path.join(outputRoot, 'blocked-gate-action-checklist-freshness.json')).replace(/\\/g, '/'))
    assert.equal(persisted.outputs.blockedGateActionChecklistFreshnessMarkdown, path.relative(process.cwd(), path.join(outputRoot, 'blocked-gate-action-checklist-freshness.md')).replace(/\\/g, '/'))
    assert.deepEqual(persisted.readOnlyEvidenceQueuePlanSummary, report.readOnlyEvidenceQueuePlanSummary)
    assert.deepEqual(persisted.readOnlyEvidenceQueueExecutionEvidenceBoundary, report.readOnlyEvidenceQueueExecutionEvidenceBoundary)
    assert.deepEqual(persisted.blockedGateActionChecklistSummary, report.blockedGateActionChecklistSummary)
    assert.deepEqual(persisted.blockedGateActionChecklistInputDigest, report.blockedGateActionChecklistInputDigest)
    assert.deepEqual(persisted.blockedGateActionChecklistEvidenceBoundary, report.blockedGateActionChecklistEvidenceBoundary)
    assert.deepEqual(persisted.blockedGateActionChecklistCompactActionItems, report.blockedGateActionChecklistCompactActionItems)
    assert.equal(persisted.blockedGateActionChecklistFreshnessStatus, 'fresh')
    assert.deepEqual(persisted.blockedGateActionChecklistFreshnessSummary, report.blockedGateActionChecklistFreshnessSummary)
    assert.deepEqual(persisted.blockedGateActionChecklistFreshnessCurrentGapSummaryDigest, report.blockedGateActionChecklistFreshnessCurrentGapSummaryDigest)
    assert.deepEqual(persisted.blockedGateActionChecklistFreshnessEvidenceBoundary, report.blockedGateActionChecklistFreshnessEvidenceBoundary)

    const markdown = await readFile(path.join(outputRoot, 'readiness-dashboard-refresh.md'), 'utf8')
    assert.match(markdown, /Blocked gate action coverage: 5\/5 \(100%\), uncovered=0/)
    assert.match(markdown, /Operator unblock requirements: actions=5, env_unlocks=2, flags=1, operator_fields=2, evidence_inputs=6, environment_targets=1, verification_commands=5/)
    assert.match(markdown, /Operator command plan: total=18, blocked=10, deferred=4, read_only=11, guarded=7, manual_prerequisite=0/)
    assert.match(markdown, /Operator command execution plan: raw=18, unique=14, duplicates=4, blocked=8, deferred=4, read_only=9, guarded=5, manual_prerequisite=0/)
    assert.match(markdown, /Operator command execution queues: read_only=1, manual_prerequisite=0, guarded=0, auto_allowed=1, auto_forbidden=0/)
    assert.match(markdown, /Read-only evidence queue plan: status=planned, planned=1, rejected=0, manual_excluded=0, guarded_excluded=0, execution_allowed=no/)
    assert.match(markdown, /Read-only execution evidence boundary: tier=tooling_readiness_supporting_only, can_close_production_gates=no/)
    assert.match(markdown, /Read-only queue cannot close gates: runtime_source_export_provenance, runtime_seed_and_reference_days_evidence, duration_sample_collection_package, runtime_duration_calibration_evidence, runtime_evidence_lineage_consistency/)
    assert.match(markdown, /Blocked gate action checklist: status=blocked, action_groups=5, blocked_groups=4, deferred_groups=1, read_only=1, manual_prerequisite=0, guarded=0/)
    assert.match(markdown, /Blocked gate checklist action items: count=1/)
    assert.match(markdown, /action_group: 1 \| blocked \| runtime_seed_local_environment_and_import/)
    assert.match(markdown, /commands: read_only=2, manual_prerequisite=1, guarded=1/)
    assert.match(markdown, /env_unlocks: WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT/)
    assert.match(markdown, /Blocked gate action checklist input: sha256=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff, size_bytes=12345/)
    assert.match(markdown, /Blocked gate checklist evidence boundary: tier=operator_unblock_planning_only, can_close_production_gates=no/)
    assert.match(markdown, /Blocked gate checklist freshness: status=fresh, fresh=yes, digest_available=yes, sha256_match=yes, size_match=yes/)
    assert.match(markdown, /Blocked gate checklist current gap digest: sha256=ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff, size_bytes=12345/)
    assert.match(markdown, /Blocked gate checklist freshness boundary: tier=checklist_freshness_only, can_close_production_gates=no/)
    assert.match(markdown, /## Source Inputs/)
    assert.match(markdown, new RegExp(`reviewEvidence: ${escapeRegExp(path.join('project-testing', 'reports', 'default-master-plan-production-readiness', 'pm-review-evidence.json').replace(/\\/g, '/'))}`))
    assert.match(markdown, new RegExp(`sourceManifest: ${escapeRegExp(path.join('project-testing', 'reports', 'default-master-plan-production-readiness', 'source-exports', 'source-exports-manifest.json').replace(/\\/g, '/'))}`))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('binds upstream evidence inputs to source root when explicitly provided', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-refresh-dashboard-source-root-'))
  const outputRoot = path.join(root, 'default-master-plan-production-readiness')
  const sourceRoot = path.join(root, 'source-evidence')
  const reportRoot = path.join(root, 'reports')

  const assertIncludes = (joined, entries) => {
    for (const [flag, expectedPath] of entries) {
      assert.equal(joined.includes(flag), true, `${flag} missing in ${joined}`)
      assert.equal(joined.includes(expectedPath), true, `${expectedPath} missing in ${joined}`)
    }
  }

  const sourceEvidenceArgs = [
    ['--review-evidence', path.join(sourceRoot, 'pm-review-evidence.json')],
    ['--duration-calibration-evidence', path.join(sourceRoot, 'duration-calibration-evidence.json')],
    ['--runtime-seed-evidence-pipeline', path.join(sourceRoot, 'runtime-seed-evidence-pipeline.json')],
    ['--duration-sample-collection-package', path.join(sourceRoot, 'duration-sample-collection-package.json')],
    ['--duration-sample-coverage-evidence', path.join(sourceRoot, 'duration-sample-coverage-evidence.json')],
    ['--source-manifest', path.join(sourceRoot, 'source-exports', 'source-exports-manifest.json')],
  ]

  const handoffSourceArgs = [
    ['--discovery', path.join(sourceRoot, 'candidate-discovery.json')],
    ['--duration-gap-plan', path.join(sourceRoot, 'duration-sample-gap-plan-school.json')],
    ['--evidence-bundle', path.join(sourceRoot, 'evidence-bundle.json')],
    ['--review-package', path.join(sourceRoot, 'pm-review-package.json')],
    ['--review-record-preflight', path.join(sourceRoot, 'pm-review-record-preflight.json')],
    ['--candidate-hygiene', path.join(sourceRoot, 'candidate-export-hygiene.json')],
    ['--candidate-refresh-package', path.join(sourceRoot, 'candidate-refresh-package.json')],
    ['--candidate-refresh-execution', path.join(sourceRoot, 'candidate-refresh-execution.json')],
    ['--candidate-baseline-materialization', path.join(sourceRoot, 'candidate-baseline-materialization.json')],
    ['--runtime-seed-import-execution', path.join(sourceRoot, 'runtime-seed-import-execution.json')],
    ['--runtime-task-alignment-review-evidence', path.join(sourceRoot, 'runtime-task-alignment-review-evidence.json')],
    ['--runtime-material-package', path.join(sourceRoot, 'runtime-material-package.json')],
    ['--staging-authorization', path.join(sourceRoot, 'staging-runtime', 'staging-authorization.json')],
  ]

  const gapSourceEvidenceArgs = [
    ['--evidence-sources', path.join(sourceRoot, 'evidence-sources-report.json')],
    ['--runtime-seed-import-readiness-seal', path.join(path.dirname(sourceRoot), 'default-master-plan-profiles', 'runtime-seed-import-readiness-seal.json')],
    ['--real-duration-sample-material-template', path.join(sourceRoot, 'real-duration-sample-material.template.json')],
    ['--real-duration-sample-collection-kit', path.join(sourceRoot, 'real-duration-sample-collection-kit.json')],
    ['--real-duration-sample-collection-kit-preflight', path.join(sourceRoot, 'real-duration-sample-collection-kit-preflight.json')],
    ['--real-duration-sample-material-preflight', path.join(sourceRoot, 'real-duration-sample-material-preflight.json')],
    ['--real-duration-sample-source-export', path.join(sourceRoot, 'source-exports', 'duration-experience-samples-export.json')],
    ['--real-duration-sample-source-export-report', path.join(sourceRoot, 'source-exports', 'duration-experience-samples-export.report.json')],
    ['--duration-asset-utilization', path.join(sourceRoot, 'duration-asset-utilization-report.json')],
    ['--completed-task-export-report', path.join(sourceRoot, 'source-exports', 'completed-task-export.report.json')],
    ['--runtime-candidate-alignment-preflight', path.join(sourceRoot, 'runtime-candidate-alignment-preflight.json')],
    ['--runtime-task-alignment-refresh-package', path.join(sourceRoot, 'runtime-task-alignment-refresh-package.json')],
    ['--candidate-refresh-authorization-package', path.join(sourceRoot, 'candidate-refresh-authorization-package.json')],
    ['--candidate-refresh-execution-readiness-seal', path.join(sourceRoot, 'candidate-refresh-execution-readiness-seal.json')],
    ['--candidate-baseline-materialization-readiness-seal', path.join(sourceRoot, 'candidate-baseline-materialization-readiness-seal.json')],
    ['--real-production-outcome-package', path.join(sourceRoot, 'real-production-outcome-package.json')],
  ]

  const fakeRunCommand = async (command, args) => {
    const joined = [command, ...args].join(' ')
    if (joined.includes('check-default-master-plan-production-readiness.mjs')) {
      assertIncludes(joined, sourceEvidenceArgs)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
        }),
        stderr: '',
        durationMs: 10,
      }
    }
    if (joined.includes('build-default-master-plan-production-operator-handoff.mjs')) {
      assertIncludes(joined, [
        ['--readiness', path.join(outputRoot, 'readiness.json')],
        ...sourceEvidenceArgs.slice(0, 5),
        ...handoffSourceArgs,
        ...gapSourceEvidenceArgs.filter(([flag]) => [
          '--duration-asset-utilization',
          '--completed-task-export-report',
          '--runtime-candidate-alignment-preflight',
          '--runtime-task-alignment-refresh-package',
          '--candidate-refresh-authorization-package',
          '--real-production-outcome-package',
        ].includes(flag)),
      ])
      return {
        exitCode: 0,
        stdout: JSON.stringify({ status: 'blocked', productionReady: false }),
        stderr: '',
        durationMs: 11,
      }
    }
    if (joined.includes('check-default-master-plan-operator-handoff-preflight.mjs')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ status: 'blocked', blockers: [] }),
        stderr: '',
        durationMs: 12,
      }
    }
    if (joined.includes('summarize-default-master-plan-real-evidence-gaps.mjs')) {
      assertIncludes(joined, [
        ...sourceEvidenceArgs.slice(0, 4),
        ...gapSourceEvidenceArgs,
      ])
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
        }),
        stderr: '',
        durationMs: 13,
      }
    }
    if (joined.includes('plan-default-master-plan-read-only-evidence-queue.mjs')) {
      assertIncludes(joined, [
        ['--input', path.join(outputRoot, 'real-evidence-gap-summary.json')],
        ['--output', path.join(outputRoot, 'read-only-evidence-queue-plan.json')],
        ['--markdown', path.join(outputRoot, 'read-only-evidence-queue-plan.md')],
      ])
      assert.equal(joined.includes('--plan-only'), true)
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'planned',
          productionReady: false,
          summary: {
            sourceReadOnlyEvidenceCommandCount: 0,
            plannedCommandCount: 0,
            rejectedReadOnlyQueueCommandCount: 0,
            excludedManualPrerequisiteCommandCount: 0,
            excludedGuardedWriteOrLiveCommandCount: 0,
            excludedForbiddenCommandCount: 0,
            executionRequested: false,
            executionAllowed: false,
            planOnly: true,
          },
        }),
        stderr: '',
        durationMs: 14,
      }
    }
    if (joined.includes('build-default-master-plan-blocked-gate-action-checklist.mjs')) {
      assertIncludes(joined, [
        ['--input', path.join(outputRoot, 'real-evidence-gap-summary.json')],
        ['--output', path.join(outputRoot, 'blocked-gate-action-checklist.json')],
        ['--markdown', path.join(outputRoot, 'blocked-gate-action-checklist.md')],
      ])
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          summary: {
            blockedGateCount: 5,
            coveredBlockedGateCount: 5,
            uncoveredBlockedGateCount: 0,
            actionGroupCount: 5,
            blockedActionGroupCount: 4,
            deferredActionGroupCount: 1,
            readOnlyEvidenceCommandCount: 0,
            manualPrerequisiteCommandCount: 0,
            guardedWriteOrLiveCommandCount: 0,
            autoRunnableCommandCount: 0,
            productionClosingCommandCount: 0,
          },
          evidenceBoundary: {
            evidenceTier: 'operator_unblock_planning_only',
            canCloseProductionReadinessGates: false,
            nonClosingEvidenceBoundary: [],
          },
        }),
        stderr: '',
        durationMs: 15,
      }
    }
    if (joined.includes('check-default-master-plan-blocked-gate-action-checklist-freshness.mjs')) {
      assertIncludes(joined, [
        ['--gap-summary', path.join(outputRoot, 'real-evidence-gap-summary.json')],
        ['--checklist', path.join(outputRoot, 'blocked-gate-action-checklist.json')],
        ['--output', path.join(outputRoot, 'blocked-gate-action-checklist-freshness.json')],
        ['--markdown', path.join(outputRoot, 'blocked-gate-action-checklist-freshness.md')],
      ])
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'fresh',
          productionReady: false,
          summary: {
            fresh: true,
            digestAvailable: true,
            algorithmMatches: true,
            sha256Matches: true,
            sizeBytesMatches: true,
          },
          currentGapSummaryDigest: {
            algorithm: 'sha256',
            sha256: 'f'.repeat(64),
            sizeBytes: 12345,
          },
          evidenceBoundary: {
            evidenceTier: 'checklist_freshness_only',
            canCloseProductionReadinessGates: false,
            nonClosingEvidenceBoundary: [],
          },
        }),
        stderr: '',
        durationMs: 16,
      }
    }
    if (joined.includes('run-release-dashboard.mjs')) {
      return {
        exitCode: 0,
        stdout: `Release dashboard report: ${path.join(reportRoot, 'release-20260708-000000')}\n`,
        stderr: '',
        durationMs: 17,
      }
    }
    throw new Error(`Unexpected command: ${joined}`)
  }

  try {
    await refreshDefaultMasterPlanReadinessDashboard({
      argv: [
        '--output-root',
        outputRoot,
        '--source-root',
        sourceRoot,
        '--report-root',
        reportRoot,
      ],
      runCommand: fakeRunCommand,
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('records source input existence and hashes for auditability', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-default-master-plan-refresh-dashboard-source-checks-'))
  const outputRoot = path.join(root, 'default-master-plan-production-readiness')
  const sourceRoot = path.join(root, 'source-evidence')
  const reportRoot = path.join(root, 'reports')
  await mkdir(sourceRoot, { recursive: true })
  await writeFile(
    path.join(sourceRoot, 'pm-review-evidence.json'),
    JSON.stringify({ status: 'accepted', reviewedBy: 'pm' }, null, 2),
    'utf8',
  )

  const fakeRunCommand = async (command, args) => {
    const joined = [command, ...args].join(' ')
    if (joined.includes('check-default-master-plan-production-readiness.mjs')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
        }),
        stderr: '',
        durationMs: 10,
      }
    }
    if (joined.includes('build-default-master-plan-production-operator-handoff.mjs')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ status: 'blocked', productionReady: false }),
        stderr: '',
        durationMs: 11,
      }
    }
    if (joined.includes('check-default-master-plan-operator-handoff-preflight.mjs')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ status: 'blocked', blockers: [] }),
        stderr: '',
        durationMs: 12,
      }
    }
    if (joined.includes('summarize-default-master-plan-real-evidence-gaps.mjs')) {
      const jsonOutputPath = args[args.indexOf('--json-output') + 1]
      await mkdir(path.dirname(jsonOutputPath), { recursive: true })
      await writeFile(jsonOutputPath, JSON.stringify({
        status: 'blocked',
        productionReady: false,
        gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
      }, null, 2), 'utf8')
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
        }),
        stderr: '',
        durationMs: 13,
      }
    }
    if (joined.includes('plan-default-master-plan-read-only-evidence-queue.mjs')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'planned',
          productionReady: false,
          summary: {
            sourceReadOnlyEvidenceCommandCount: 0,
            plannedCommandCount: 0,
            rejectedReadOnlyQueueCommandCount: 0,
            excludedManualPrerequisiteCommandCount: 0,
            excludedGuardedWriteOrLiveCommandCount: 0,
            excludedForbiddenCommandCount: 0,
            executionRequested: false,
            executionAllowed: false,
            planOnly: true,
          },
        }),
        stderr: '',
        durationMs: 14,
      }
    }
    if (joined.includes('build-default-master-plan-blocked-gate-action-checklist.mjs')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'blocked',
          productionReady: false,
          summary: {
            blockedGateCount: 5,
            coveredBlockedGateCount: 5,
            uncoveredBlockedGateCount: 0,
            actionGroupCount: 5,
            blockedActionGroupCount: 4,
            deferredActionGroupCount: 1,
            readOnlyEvidenceCommandCount: 0,
            manualPrerequisiteCommandCount: 0,
            guardedWriteOrLiveCommandCount: 0,
            autoRunnableCommandCount: 0,
            productionClosingCommandCount: 0,
          },
          evidenceBoundary: {
            evidenceTier: 'operator_unblock_planning_only',
            canCloseProductionReadinessGates: false,
            nonClosingEvidenceBoundary: [],
          },
        }),
        stderr: '',
        durationMs: 15,
      }
    }
    if (joined.includes('check-default-master-plan-blocked-gate-action-checklist-freshness.mjs')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          status: 'fresh',
          productionReady: false,
          summary: {
            fresh: true,
            digestAvailable: true,
            algorithmMatches: true,
            sha256Matches: true,
            sizeBytesMatches: true,
          },
          currentGapSummaryDigest: {
            algorithm: 'sha256',
            sha256: 'f'.repeat(64),
            sizeBytes: 12345,
          },
          evidenceBoundary: {
            evidenceTier: 'checklist_freshness_only',
            canCloseProductionReadinessGates: false,
            nonClosingEvidenceBoundary: [],
          },
        }),
        stderr: '',
        durationMs: 16,
      }
    }
    if (joined.includes('run-release-dashboard.mjs')) {
      const gapSummaryPath = args[args.indexOf('--default-master-plan-gap-summary') + 1]
      const dashboardGapSummary = JSON.parse(await readFile(gapSummaryPath, 'utf8'))
      assert.equal(dashboardGapSummary.sourceInputSummary.present, 1)
      assert.equal(dashboardGapSummary.sourceInputSummary.hashed, 1)
      assert.equal(dashboardGapSummary.sourceInputSummary.ready, false)
      return {
        exitCode: 0,
        stdout: `Release dashboard report: ${path.join(reportRoot, 'release-20260708-000000')}\n`,
        stderr: '',
        durationMs: 17,
      }
    }
    throw new Error(`Unexpected command: ${joined}`)
  }

  try {
    const report = await refreshDefaultMasterPlanReadinessDashboard({
      argv: [
        '--output-root',
        outputRoot,
        '--source-root',
        sourceRoot,
        '--report-root',
        reportRoot,
      ],
      runCommand: fakeRunCommand,
    })

    assert.equal(report.sourceInputChecks.reviewEvidence.exists, true)
    assert.equal(report.sourceInputChecks.reviewEvidence.sizeBytes > 0, true)
    assert.match(report.sourceInputChecks.reviewEvidence.sha256, /^[a-f0-9]{64}$/)
    assert.equal(report.sourceInputChecks.sourceManifest.exists, false)
    assert.equal(report.sourceInputChecks.sourceManifest.sha256, '')
    assert.equal(report.sourceInputSummary.total, Object.keys(report.sourceInputChecks).length)
    assert.equal(report.sourceInputSummary.present, 1)
    assert.equal(report.sourceInputSummary.missing, report.sourceInputSummary.total - 1)
    assert.equal(report.sourceInputSummary.hashed, 1)
    assert.equal(report.sourceInputSummary.ready, false)
    assert.deepEqual(report.sourceInputSummary.missingKeys.includes('sourceManifest'), true)

    const persisted = JSON.parse(await readFile(path.join(outputRoot, 'readiness-dashboard-refresh.json'), 'utf8'))
    assert.deepEqual(persisted.sourceInputSummary, report.sourceInputSummary)
    const markdown = await readFile(path.join(outputRoot, 'readiness-dashboard-refresh.md'), 'utf8')
    assert.match(markdown, new RegExp(`Source input coverage: ${report.sourceInputSummary.present}/${report.sourceInputSummary.total}`))
    assert.match(markdown, /## Source Input Checks/)
    assert.match(markdown, /\| reviewEvidence \| .* \| yes \| [0-9]+ \| [a-f0-9]{64} \|/)
    assert.match(markdown, /\| sourceManifest \| .* \| no \| 0 \|  \|/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
