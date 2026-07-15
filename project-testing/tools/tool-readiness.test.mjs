import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadToolInventory,
  runToolReadinessCheck,
} from './check-testing-tools.mjs';
import {
  loadMatrix,
  parseArgs,
  planReleaseRun,
  runDashboard,
} from './run-release-dashboard.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inventoryPath = path.join(repoRoot, 'project-testing/plugins/testing-tool-inventory.json');
const matrixPath = path.join(repoRoot, 'project-testing/matrix/release-test-matrix.json');

test('tool inventory classifies CloakBrowser, Yingdao, and phase four additions without production mutation', async () => {
  const inventory = await loadToolInventory(inventoryPath);

  const byId = new Map(inventory.tools.map((tool) => [tool.id, tool]));

  assert.equal(byId.get('cloakbrowser').layer, 'browser-runtime');
  assert.equal(byId.get('yingdao-rpa').layer, 'uat-rpa');
  assert.equal(byId.get('playwright-mcp').releaseEvidencePolicy, 'exploratory-only');
  assert.equal(byId.get('schemathesis').stage, 'future');
  assert.ok(inventory.tools.every((tool) => tool.productionMutation === false));
});

test('tool-readiness profile selects only the local read-only tool gate', async () => {
  const matrix = await loadMatrix(matrixPath);
  const plan = planReleaseRun(matrix, parseArgs(['--profile', 'tool-readiness', '--dry-run']));

  assert.deepEqual(plan.selectedGroups.map((group) => group.id), ['testing-tool-readiness']);
  assert.equal(plan.selectedGroups[0].tier, 'tooling_readiness');
  assert.equal(plan.selectedGroups[0].status, 'ready');
});

test('tool readiness check reports present, manual, future, and configured states', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-tool-readiness-'));

  try {
    const summary = await runToolReadinessCheck({
      inventoryPath,
      outputPath: path.join(reportRoot, 'summary.json'),
      cwd: repoRoot,
      env: {
        ...process.env,
        CLOAK_BROWSER_EXECUTABLE: process.env.CLOAK_BROWSER_EXECUTABLE
          ?? 'C:\\Users\\jjj64\\.codex\\tools\\CloakBrowser-release\\chromium-v146.0.7680.177.4\\chrome.exe',
      },
    });

    assert.equal(summary.schemaVersion, 'workbuddy-testing-tool-readiness/v1');
    assert.ok(summary.tools.some((tool) => tool.id === 'cloakbrowser' && ['present', 'missing'].includes(tool.status)));
    assert.ok(summary.tools.some((tool) => tool.id === 'yingdao-rpa' && tool.status === 'manual'));
    assert.ok(summary.tools.some((tool) => tool.id === 'schemathesis' && tool.status === 'future'));
    assert.ok(summary.tools.some((tool) => tool.id === 'playwright-mcp' && ['configured', 'missing'].includes(tool.status)));

    await access(path.join(reportRoot, 'summary.json'), constants.R_OK);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('release dashboard includes default master-plan action handoff when source-kit gate is selected', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-default-master-plan-'));
  const gapSummaryPath = path.join(reportRoot, 'real-evidence-gap-summary.json');
  const sourceInputSummary = {
    total: 38,
    present: 38,
    missing: 0,
    hashed: 38,
    ready: true,
    missingKeys: [],
  };

  await writeFile(gapSummaryPath, JSON.stringify({
    schemaVersion: 'workbuddy-default-master-plan-real-evidence-gap-summary/v1',
    status: 'blocked',
    productionReady: false,
    gateSummary: {
      total: 11,
      pass: 6,
      blocked: 5,
      fail: 0,
      completionRate: 54.5,
    },
    blockedGateActionCoverageSummary: {
      totalBlockedGateCount: 2,
      coveredBlockedGateCount: 2,
      uncoveredBlockedGateCount: 0,
      coverageRate: 100,
      coveredBlockedGateIds: [
        'runtime_seed_and_reference_days_evidence',
        'production_readiness',
      ],
      uncoveredBlockedGateIds: [],
      coveringActionGroupIds: [
        'runtime_seed_local_environment_and_import',
        'production_live_outcome_evidence',
      ],
    },
    blockedGateActionCoverage: [{
      gateId: 'runtime_seed_and_reference_days_evidence',
      tier: 'runtime_evidence',
      status: 'blocked',
      blockerCount: 1,
      covered: true,
      coveredByActionGroupIds: ['runtime_seed_local_environment_and_import'],
      uncoveredBlockers: [],
    }, {
      gateId: 'production_readiness',
      tier: 'production_or_live_outcome',
      status: 'blocked',
      blockerCount: 1,
      covered: true,
      coveredByActionGroupIds: ['production_live_outcome_evidence'],
      uncoveredBlockers: [],
    }],
    sourceInputSummary,
    prioritizedNextActionGroups: [{
      id: 'runtime_seed_local_environment_and_import',
      priority: 30,
      status: 'blocked',
      blockedBy: ['runtime_seed_import_execution_allow_import_required'],
      deferredBy: [],
      nextAction: 'Prepare runtime seed import unlock and operator identity.',
      commands: ['npm run evidence:default-master-plan:runtime-seed-import-execution'],
      mutationBoundary: 'local active seed smoke import only; no production seed write.',
      repairPlan: {
        status: 'blocked',
        orderedSteps: [{
          id: 'rerun_runtime_seed_pipeline',
          status: 'blocked',
          commands: ['npm.cmd run evidence:default-master-plan:runtime-seed-import-execution'],
          verificationCommands: [
            'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
          ],
        }],
      },
      operatorRequirements: [{
        actionId: 'runtime_seed_import_execution',
        gate: 'runtime_seed_and_reference_days_evidence',
        blockers: ['runtime_seed_import_execution_allow_import_required'],
        nextRequirements: {
          envUnlocks: [{
            variable: 'WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT',
            value: '1',
            blockerCodes: ['runtime_seed_import_execution_local_duration_asset_seed_import_unlock_required'],
          }],
          requiredFlags: [{
            flag: '--allow-import',
            blockerCodes: ['runtime_seed_import_execution_allow_import_required'],
          }],
          operatorFields: [{
            field: '--seed-smoke-user-id',
            blockerCodes: ['runtime_seed_import_execution_seed_smoke_user_id_required'],
          }],
          evidenceInputs: [{
            artifact: 'runtime-seed-post-import-verification.json',
            requiredStatus: 'runtime_seed_post_import_verified',
            blockerCodes: ['runtime_seed_import_execution_post_import_verification_file_required'],
          }],
          requiredEnvironmentTargets: [],
          verificationCommands: [
            'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
          ],
        },
      }],
    }, {
      id: 'production_live_outcome_evidence',
      priority: 50,
      status: 'blocked',
      blockedBy: ['production_or_live_source_export_required_for_production_ready'],
      nextAction: 'Collect real production/live outcome evidence.',
      commands: ['npm run evidence:default-master-plan:real-outcome-package'],
      mutationBoundary: 'production/live evidence only after explicit environment ownership.',
      productionOutcomePlan: {
        realProductionOutcomePackage: {
          status: 'real_production_outcome_required',
          productionReady: false,
          targetEnvironment: 'production',
          realProductionOutcomePath: '<real-production-outcome.json>',
          requiredFields: [
            'schemaVersion',
            'status',
            'environment',
            'target',
            'baselineId',
            'projectId',
            'publicationKey',
            'evidenceRef',
            'acceptedBy',
            'acceptedAt',
            'approvalRef',
            'runtimePublicationEvidenceRef',
            'apiReadSmokeEvidenceRef',
            'uiConsumptionSmokeEvidenceRef',
            'criticalPathReadbackEvidenceRef',
            'rollbackEvidenceRef',
          ],
          requiredFieldCount: 16,
          blockers: ['real_production_outcome_file_required'],
          validationBlockers: [],
        },
        operatorHandoff: {
          productionSourceExportBlockers: ['production_or_live_source_export_required_for_production_ready'],
          realProductionOutcomeEvidenceBlockers: [
            'production_or_live_target_required_for_real_production_outcome_evidence',
            'real_production_outcome_material_required',
          ],
          mayRunProductionSourceExport: false,
          mayAcceptRealProductionOutcomeEvidence: false,
          mayRunProductionEvidencePipeline: false,
          blockedActionIds: ['production_evidence_pipeline'],
        },
      },
      operatorRequirements: [{
        actionId: 'production_evidence_pipeline',
        gate: 'five_evidence_builders',
        blockers: ['production_or_live_source_export_required_for_production_ready'],
        nextRequirements: {
          evidenceInputs: [{
            artifact: 'real-production-outcome.json',
            requiredStatus: 'pass',
            blockerCodes: ['production_or_live_source_export_required_for_production_ready'],
          }],
          requiredEnvironmentTargets: [{
            target: 'production_or_live',
            blockerCodes: ['production_or_live_source_export_required_for_production_ready'],
          }],
          verificationCommands: ['npm run evidence:default-master-plan:real-evidence-gaps'],
        },
      }],
    }],
  }, null, 2) + '\n', 'utf8');

  try {
    const result = await runDashboard({
      argv: [
        '--profile',
        'release-local',
        '--gate',
        'default-master-plan-evidence-source-kit',
        '--dry-run',
        '--report-root',
        reportRoot,
        '--default-master-plan-gap-summary',
        gapSummaryPath,
      ],
      cwd: repoRoot,
      now: new Date('2026-07-08T10:11:12+08:00'),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.summary.defaultMasterPlanActionHandoff.status, 'blocked');
    assert.equal(result.summary.defaultMasterPlanActionHandoff.productionReady, false);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.gateSummary, {
      total: 11,
      pass: 6,
      blocked: 5,
      fail: 0,
      completionRate: 54.5,
    });
    assert.equal(result.summary.defaultMasterPlanActionHandoff.completionRate, 54.5);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.blockedGateActionCoverageSummary, {
      totalBlockedGateCount: 2,
      coveredBlockedGateCount: 2,
      uncoveredBlockedGateCount: 0,
      coverageRate: 100,
      coveredBlockedGateIds: [
        'runtime_seed_and_reference_days_evidence',
        'production_readiness',
      ],
      uncoveredBlockedGateIds: [],
      coveringActionGroupIds: [
        'runtime_seed_local_environment_and_import',
        'production_live_outcome_evidence',
      ],
    });
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.blockedGateActionCoverage.map((entry) => ({
      gateId: entry.gateId,
      coveredByActionGroupIds: entry.coveredByActionGroupIds,
      covered: entry.covered,
    })), [{
      gateId: 'runtime_seed_and_reference_days_evidence',
      coveredByActionGroupIds: ['runtime_seed_local_environment_and_import'],
      covered: true,
    }, {
      gateId: 'production_readiness',
      coveredByActionGroupIds: ['production_live_outcome_evidence'],
      covered: true,
    }]);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorUnblockRequirementSummary, {
      actionGroupCount: 2,
      blockedActionGroupCount: 2,
      deferredActionGroupCount: 0,
      operatorRequirementActionCount: 2,
      envUnlockCount: 1,
      requiredFlagCount: 1,
      operatorFieldCount: 1,
      evidenceInputCount: 2,
      environmentTargetCount: 1,
      verificationCommandCount: 2,
      repairRequiredStepCount: 0,
      dbRepairRequiredStepCount: 0,
      blockedPlanStepCount: 0,
      envUnlockVariables: ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'],
      requiredFlags: ['--allow-import'],
      operatorFields: ['--seed-smoke-user-id'],
      evidenceInputArtifacts: [
        'runtime-seed-post-import-verification.json',
        'real-production-outcome.json',
      ],
      requiredEnvironmentTargets: ['production_or_live'],
      verificationCommands: [
        'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
        'npm run evidence:default-master-plan:real-evidence-gaps',
      ],
      repairRequiredStepIds: [],
      dbRepairRequiredStepIds: [],
      blockedPlanStepIds: [],
    });
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorCommandPlanSummary, {
      actionGroupCount: 2,
      totalCommandCount: 4,
      blockedCommandCount: 4,
      deferredCommandCount: 0,
      readOnlyEvidenceCommandCount: 2,
      guardedWriteOrLiveCommandCount: 2,
      manualPrerequisiteCommandCount: 0,
    });
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorCommandPlan.map((entry) => ({
      actionGroupId: entry.actionGroupId,
      commandKind: entry.commandKind,
      executionReadiness: entry.executionReadiness,
      command: entry.command,
    })), [{
      actionGroupId: 'runtime_seed_local_environment_and_import',
      commandKind: 'guarded_write_or_db_dependent',
      executionReadiness: 'blocked',
      command: 'npm run evidence:default-master-plan:runtime-seed-import-execution',
    }, {
      actionGroupId: 'runtime_seed_local_environment_and_import',
      commandKind: 'guarded_write_or_db_dependent',
      executionReadiness: 'blocked',
      command: 'npm.cmd run evidence:default-master-plan:runtime-seed-import-execution',
    }, {
      actionGroupId: 'runtime_seed_local_environment_and_import',
      commandKind: 'read_only_evidence',
      executionReadiness: 'blocked',
      command: 'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
    }, {
      actionGroupId: 'production_live_outcome_evidence',
      commandKind: 'read_only_evidence',
      executionReadiness: 'blocked',
      command: 'npm run evidence:default-master-plan:real-outcome-package',
    }]);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionPlanSummary, {
      actionGroupCount: 2,
      rawCommandCount: 4,
      uniqueCommandCount: 3,
      duplicateCommandCount: 1,
      blockedCommandCount: 3,
      deferredCommandCount: 0,
      readOnlyEvidenceCommandCount: 2,
      guardedWriteOrLiveCommandCount: 1,
      manualPrerequisiteCommandCount: 0,
    });
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionPlan.map((entry) => ({
      command: entry.command,
      executionReadiness: entry.executionReadiness,
      commandKind: entry.commandKind,
      actionGroupIds: entry.actionGroupIds,
      commandSources: entry.commandSources,
      duplicateCount: entry.duplicateCount,
    })), [{
      command: 'npm.cmd run evidence:default-master-plan:runtime-seed-import-execution',
      executionReadiness: 'blocked',
      commandKind: 'guarded_write_or_db_dependent',
      actionGroupIds: ['runtime_seed_local_environment_and_import'],
      commandSources: [
        'action_group_command',
        'repair_plan:rerun_runtime_seed_pipeline:command',
      ],
      duplicateCount: 2,
    }, {
      command: 'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['runtime_seed_local_environment_and_import'],
      commandSources: [
        'repair_plan:rerun_runtime_seed_pipeline:verification',
      ],
      duplicateCount: 1,
    }, {
      command: 'npm run evidence:default-master-plan:real-outcome-package',
      executionReadiness: 'blocked',
      commandKind: 'read_only_evidence',
      actionGroupIds: ['production_live_outcome_evidence'],
      commandSources: ['action_group_command'],
      duplicateCount: 1,
    }]);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionQueueSummary, {
      totalUniqueCommandCount: 3,
      readOnlyEvidenceCommandCount: 2,
      manualPrerequisiteCommandCount: 0,
      guardedWriteOrLiveCommandCount: 1,
      autoRunAllowedCommandCount: 2,
      autoRunForbiddenCommandCount: 1,
      queueIds: [
        'read_only_evidence',
        'manual_prerequisite',
        'guarded_write_or_live',
      ],
    });
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionQueues.readOnlyEvidence.map((entry) => ({
      queueId: entry.queueId,
      autoRunAllowed: entry.autoRunAllowed,
      command: entry.command,
    })), [{
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'node project-testing/tools/check-default-master-plan-runtime-seed-import-readiness.mjs',
    }, {
      queueId: 'read_only_evidence',
      autoRunAllowed: true,
      command: 'npm run evidence:default-master-plan:real-outcome-package',
    }]);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionQueues.manualPrerequisite, []);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionQueues.guardedWriteOrLive.map((entry) => ({
      queueId: entry.queueId,
      autoRunAllowed: entry.autoRunAllowed,
      command: entry.command,
    })), [{
      queueId: 'guarded_write_or_live',
      autoRunAllowed: false,
      command: 'npm.cmd run evidence:default-master-plan:runtime-seed-import-execution',
    }]);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.compactActionItems, [{
      actionGroupId: 'runtime_seed_local_environment_and_import',
      priority: 30,
      status: 'blocked',
      coveredGateIds: ['runtime_seed_and_reference_days_evidence'],
      nextAction: 'Prepare runtime seed import unlock and operator identity.',
      envUnlockVariables: ['WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT'],
      requiredFlags: ['--allow-import'],
      operatorFields: ['--seed-smoke-user-id'],
      evidenceInputArtifacts: ['runtime-seed-post-import-verification.json'],
      requiredEnvironmentTargets: [],
      blockerCount: 1,
      blockers: ['runtime_seed_import_execution_allow_import_required'],
      commandCounts: {
        readOnlyEvidence: 1,
        manualPrerequisite: 0,
        guardedWriteOrLive: 1,
      },
    }, {
      actionGroupId: 'production_live_outcome_evidence',
      priority: 50,
      status: 'blocked',
      coveredGateIds: ['production_readiness'],
      nextAction: 'Collect real production/live outcome evidence.',
      envUnlockVariables: [],
      requiredFlags: [],
      operatorFields: [],
      evidenceInputArtifacts: ['real-production-outcome.json'],
      requiredEnvironmentTargets: ['production_or_live'],
      blockerCount: 1,
      blockers: ['production_or_live_source_export_required_for_production_ready'],
      commandCounts: {
        readOnlyEvidence: 1,
        manualPrerequisite: 0,
        guardedWriteOrLive: 0,
      },
    }]);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.sourceInputSummary, sourceInputSummary);
    assert.equal(result.summary.defaultMasterPlanActionHandoff.actionGroupCount, 2);
    assert.equal(result.summary.defaultMasterPlanActionHandoff.blockedActionGroupCount, 2);
    assert.deepEqual(
      result.summary.defaultMasterPlanActionHandoff.actionGroups.map((group) => group.id),
      ['runtime_seed_local_environment_and_import', 'production_live_outcome_evidence'],
    );
    assert.equal(
      result.summary.defaultMasterPlanActionHandoff.actionGroups[0].requirementSummary.envUnlockCount,
      1,
    );
    assert.deepEqual(
      result.summary.defaultMasterPlanActionHandoff.actionGroups[0].operatorRequirements[0].nextRequirements.requiredFlags,
      [{
        flag: '--allow-import',
        blockerCodes: ['runtime_seed_import_execution_allow_import_required'],
      }],
    );
    assert.match(
      result.summary.defaultMasterPlanActionHandoff.mutationBoundary,
      /read-only/i,
    );

    const markdown = await readFile(path.join(result.reportDir, 'summary.md'), 'utf8');
    assert.match(markdown, /Default Master Plan Action Handoff/);
    assert.match(markdown, /Gate completion: 6\/11 \(54\.5%\)/);
    assert.match(markdown, /Blocked gate action coverage: 2\/2 \(100%\), uncovered=0/);
    assert.match(markdown, /runtime_seed_and_reference_days_evidence -> runtime_seed_local_environment_and_import/);
    assert.match(markdown, /production_readiness -> production_live_outcome_evidence/);
    assert.match(markdown, /Operator unblock requirements: actions=2, env_unlocks=1, flags=1, operator_fields=1, evidence_inputs=2, environment_targets=1, verification_commands=2/);
    assert.match(markdown, /operator_unblock_env_unlock: WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT/);
    assert.match(markdown, /operator_unblock_evidence_input: runtime-seed-post-import-verification\.json/);
    assert.match(markdown, /operator_unblock_evidence_input: real-production-outcome\.json/);
    assert.match(markdown, /Operator command plan: total=4, blocked=4, deferred=0, read_only=2, guarded=2, manual_prerequisite=0/);
    assert.match(markdown, /Operator command execution plan: raw=4, unique=3, duplicates=1, blocked=3, deferred=0, read_only=2, guarded=1, manual_prerequisite=0/);
    assert.match(markdown, /Operator command execution queues: read_only=2, manual_prerequisite=0, guarded=1, auto_allowed=2, auto_forbidden=1/);
    assert.match(markdown, /Compact action items: 2/);
    assert.match(markdown, /compact_action_item: 30 \| blocked \| runtime_seed_local_environment_and_import/);
    assert.match(markdown, /compact_action_item_commands: runtime_seed_local_environment_and_import \| read_only=1, manual_prerequisite=0, guarded=1/);
    assert.match(markdown, /compact_action_item_env_unlocks: runtime_seed_local_environment_and_import \| WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT/);
    assert.match(markdown, /operator_command_plan: runtime_seed_local_environment_and_import \| blocked \| guarded_write_or_db_dependent \| npm run evidence:default-master-plan:runtime-seed-import-execution/);
    assert.match(markdown, /operator_command_execution_plan: blocked \| guarded_write_or_db_dependent \| dup=2 \| npm\.cmd run evidence:default-master-plan:runtime-seed-import-execution/);
    assert.match(markdown, /operator_command_execution_queue: guarded_write_or_live \| manual \| npm\.cmd run evidence:default-master-plan:runtime-seed-import-execution/);
    assert.match(markdown, /Source input coverage: 38\/38 \(hashed 38, missing 0, ready yes\)/);
    assert.match(markdown, /runtime_seed_local_environment_and_import/);
    assert.match(markdown, /runtime_seed_import_execution/);
    assert.match(markdown, /WORKBUDDY_ALLOW_DURATION_ASSET_SEED_SMOKE_IMPORT=1/);
    assert.match(markdown, /real-production-outcome\.json => pass/);
    assert.match(markdown, /production_outcome_target_environment: production/);
    assert.match(markdown, /production_outcome_required_field_count: 16/);
    assert.match(markdown, /production_outcome_may_run_production_source_export: no/);

    const stableJsonPath = path.join(reportRoot, 'default-master-plan-production-readiness', 'default-master-plan-action-handoff.json');
    const stableMarkdownPath = path.join(reportRoot, 'default-master-plan-production-readiness', 'default-master-plan-action-handoff.md');
    assert.equal(result.summary.defaultMasterPlanActionHandoff.stableOutputJson, stableJsonPath);
    assert.equal(result.summary.defaultMasterPlanActionHandoff.stableOutputMarkdown, stableMarkdownPath);

    const stableHandoff = JSON.parse(await readFile(stableJsonPath, 'utf8'));
    assert.equal(stableHandoff.schemaVersion, 'workbuddy-default-master-plan-action-handoff/v1');
    assert.equal(stableHandoff.sourceDashboardReportDir, result.reportDir);
    assert.deepEqual(stableHandoff.gateSummary, result.summary.defaultMasterPlanActionHandoff.gateSummary);
    assert.deepEqual(stableHandoff.blockedGateActionCoverageSummary, result.summary.defaultMasterPlanActionHandoff.blockedGateActionCoverageSummary);
    assert.deepEqual(stableHandoff.blockedGateActionCoverage, result.summary.defaultMasterPlanActionHandoff.blockedGateActionCoverage);
    assert.deepEqual(stableHandoff.operatorUnblockRequirementSummary, result.summary.defaultMasterPlanActionHandoff.operatorUnblockRequirementSummary);
    assert.deepEqual(stableHandoff.operatorCommandPlanSummary, result.summary.defaultMasterPlanActionHandoff.operatorCommandPlanSummary);
    assert.deepEqual(stableHandoff.operatorCommandPlan, result.summary.defaultMasterPlanActionHandoff.operatorCommandPlan);
    assert.deepEqual(stableHandoff.operatorCommandExecutionPlanSummary, result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionPlanSummary);
    assert.deepEqual(stableHandoff.operatorCommandExecutionPlan, result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionPlan);
    assert.deepEqual(stableHandoff.operatorCommandExecutionQueueSummary, result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionQueueSummary);
    assert.deepEqual(stableHandoff.operatorCommandExecutionQueues, result.summary.defaultMasterPlanActionHandoff.operatorCommandExecutionQueues);
    assert.deepEqual(stableHandoff.compactActionItems, result.summary.defaultMasterPlanActionHandoff.compactActionItems);
    assert.deepEqual(stableHandoff.sourceInputSummary, sourceInputSummary);
    assert.equal(stableHandoff.actionGroupCount, 2);
    assert.equal(stableHandoff.actionGroups[0].id, 'runtime_seed_local_environment_and_import');
    assert.equal(stableHandoff.actionGroups[1].productionOutcomePlan.realProductionOutcomePackage.requiredFieldCount, 16);
    assert.equal(stableHandoff.actionGroups[1].productionOutcomePlan.operatorHandoff.mayRunProductionEvidencePipeline, false);

    const stableMarkdown = await readFile(stableMarkdownPath, 'utf8');
    assert.match(stableMarkdown, /Default Master Plan Action Handoff/);
    assert.match(stableMarkdown, /Gate completion: 6\/11 \(54\.5%\)/);
    assert.match(stableMarkdown, /Blocked gate action coverage: 2\/2 \(100%\), uncovered=0/);
    assert.match(stableMarkdown, /Operator unblock requirements: actions=2, env_unlocks=1, flags=1, operator_fields=1, evidence_inputs=2, environment_targets=1, verification_commands=2/);
    assert.match(stableMarkdown, /Operator command plan: total=4, blocked=4, deferred=0, read_only=2, guarded=2, manual_prerequisite=0/);
    assert.match(stableMarkdown, /Operator command execution plan: raw=4, unique=3, duplicates=1, blocked=3, deferred=0, read_only=2, guarded=1, manual_prerequisite=0/);
    assert.match(stableMarkdown, /Operator command execution queues: read_only=2, manual_prerequisite=0, guarded=1, auto_allowed=2, auto_forbidden=1/);
    assert.match(stableMarkdown, /Compact action items: 2/);
    assert.match(stableMarkdown, /compact_action_item: 50 \| blocked \| production_live_outcome_evidence/);
    assert.match(stableMarkdown, /compact_action_item_evidence_inputs: production_live_outcome_evidence \| real-production-outcome\.json/);
    assert.match(stableMarkdown, /Source input coverage: 38\/38 \(hashed 38, missing 0, ready yes\)/);
    assert.match(stableMarkdown, /production_live_outcome_evidence/);
    assert.match(stableMarkdown, /production_outcome_required_field: rollbackEvidenceRef/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('release dashboard writes a missing default master-plan handoff when gap summary is absent', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-missing-default-master-plan-'));
  const missingGapSummaryPath = path.join(reportRoot, 'missing-real-evidence-gap-summary.json');

  try {
    const result = await runDashboard({
      argv: [
        '--profile',
        'release-local',
        '--gate',
        'default-master-plan-evidence-source-kit',
        '--dry-run',
        '--report-root',
        reportRoot,
        '--default-master-plan-gap-summary',
        missingGapSummaryPath,
      ],
      cwd: repoRoot,
      now: new Date('2026-07-08T11:11:12+08:00'),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.summary.defaultMasterPlanActionHandoff.status, 'missing');
    assert.equal(result.summary.defaultMasterPlanActionHandoff.productionReady, false);
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.gateSummary, {
      total: 0,
      pass: 0,
      blocked: 0,
      fail: 0,
      completionRate: 0,
    });
    assert.deepEqual(result.summary.defaultMasterPlanActionHandoff.sourceInputSummary, {
      total: 0,
      present: 0,
      missing: 0,
      hashed: 0,
      ready: false,
      missingKeys: [],
    });

    const markdown = await readFile(path.join(result.reportDir, 'summary.md'), 'utf8');
    assert.match(markdown, /Default Master Plan Action Handoff/);
    assert.match(markdown, /Gate completion: 0\/0 \(0%\)/);
    assert.match(markdown, /Source input coverage: not available/);
    assert.match(markdown, /default_master_plan_real_evidence_gap_summary_missing/);

    const stableJsonPath = path.join(reportRoot, 'default-master-plan-production-readiness', 'default-master-plan-action-handoff.json');
    const stableHandoff = JSON.parse(await readFile(stableJsonPath, 'utf8'));
    assert.equal(stableHandoff.status, 'missing');
    assert.deepEqual(stableHandoff.sourceInputSummary, result.summary.defaultMasterPlanActionHandoff.sourceInputSummary);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('release dashboard preserves default master-plan candidate refresh DB repair plan', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-db-repair-plan-'));
  const gapSummaryPath = path.join(reportRoot, 'real-evidence-gap-summary.json');

  await writeFile(gapSummaryPath, JSON.stringify({
    schemaVersion: 'workbuddy-default-master-plan-real-evidence-gap-summary/v1',
    status: 'blocked',
    productionReady: false,
    gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
    prioritizedNextActionGroups: [{
      id: 'candidate_refresh_db_execution',
      priority: 10,
      status: 'blocked',
      blockedBy: ['candidate_refresh_db_connection_failed', 'candidate_refresh_db_execution_failed'],
      deferredBy: [],
      nextAction: 'Restore or confirm the candidate-refresh database connection.',
      commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
      mutationBoundary: 'candidate refresh execution is DB-dependent and must remain behind execute/unlock controls.',
      operatorRequirements: [],
      dbRepairPlan: {
        status: 'blocked',
        failureClass: 'authentication_failed',
        noAutoCredentialRotation: true,
        requiredStepIds: ['confirm_candidate_refresh_target_identity', 'repair_or_rotate_candidate_refresh_db_credentials'],
        blockedStepIds: ['rerun_candidate_refresh_execution'],
        orderedStepCount: 3,
        orderedSteps: [{
          id: 'confirm_candidate_refresh_target_identity',
          status: 'required',
          blockerCodes: ['candidate_refresh_db_connection_failed'],
          title: 'Confirm the candidate refresh DB target is the intended staging/local Supabase project.',
          commands: [
            'npm.cmd run evidence:default-master-plan:candidate-refresh-db-repair-readiness',
            'npm.cmd run evidence:default-master-plan:candidate-refresh-preflight',
          ],
          verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
          notes: ['supabaseProjectRef=wwdrkjnbvcbfytwnnyvs'],
        }, {
          id: 'repair_or_rotate_candidate_refresh_db_credentials',
          status: 'required',
          blockerCodes: ['candidate_refresh_db_connection_failed'],
          title: 'Repair or rotate the candidate refresh database credential outside repository files.',
          commands: ['update SUPABASE_MIGRATION_URL outside generated reports'],
          verificationCommands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
          notes: ['Do not write raw passwords, tokens, or connection strings into project-testing reports.'],
        }, {
          id: 'rerun_candidate_refresh_execution',
          status: 'blocked_by_previous_steps',
          blockerCodes: ['candidate_refresh_db_connection_failed', 'candidate_refresh_db_execution_failed'],
          title: 'Rerun the guarded candidate refresh execution after target identity and DB access are repaired.',
          commands: ['npm.cmd run evidence:default-master-plan:candidate-refresh-execution'],
          verificationCommands: ['npm.cmd run evidence:default-master-plan:real-evidence-gaps'],
          notes: ['Writer remains limited to candidate task_baseline_items.'],
        }],
      },
    }],
  }, null, 2) + '\n', 'utf8');

  try {
    const result = await runDashboard({
      argv: [
        '--profile',
        'release-local',
        '--gate',
        'default-master-plan-evidence-source-kit',
        '--dry-run',
        '--report-root',
        reportRoot,
        '--default-master-plan-gap-summary',
        gapSummaryPath,
      ],
      cwd: repoRoot,
      now: new Date('2026-07-08T11:21:12+08:00'),
    });

    const [group] = result.summary.defaultMasterPlanActionHandoff.actionGroups;
    assert.equal(group.id, 'candidate_refresh_db_execution');
    assert.equal(group.dbRepairPlan.status, 'blocked');
    assert.equal(group.dbRepairPlan.failureClass, 'authentication_failed');
    assert.equal(group.dbRepairPlan.noAutoCredentialRotation, true);
    assert.deepEqual(group.dbRepairPlan.requiredStepIds, [
      'confirm_candidate_refresh_target_identity',
      'repair_or_rotate_candidate_refresh_db_credentials',
    ]);
    assert.equal(group.dbRepairPlan.orderedSteps[0].id, 'confirm_candidate_refresh_target_identity');
    assert.equal(
      group.dbRepairPlan.orderedSteps[0].commands[0],
      'npm.cmd run evidence:default-master-plan:candidate-refresh-db-repair-readiness',
    );
    assert.equal(group.dbRepairPlan.orderedSteps[1].commands[0], 'update SUPABASE_MIGRATION_URL outside generated reports');

    const stableJsonPath = path.join(reportRoot, 'default-master-plan-production-readiness', 'default-master-plan-action-handoff.json');
    const stableHandoff = JSON.parse(await readFile(stableJsonPath, 'utf8'));
    assert.equal(stableHandoff.actionGroups[0].dbRepairPlan.failureClass, 'authentication_failed');

    const markdown = await readFile(path.join(result.reportDir, 'summary.md'), 'utf8');
    assert.match(markdown, /db_repair_plan_status: blocked/);
    assert.match(markdown, /db_repair_failure_class: authentication_failed/);
    assert.match(markdown, /db_repair_step: confirm_candidate_refresh_target_identity \| required/);
    assert.match(markdown, /db_repair_step_command: confirm_candidate_refresh_target_identity \| npm\.cmd run evidence:default-master-plan:candidate-refresh-db-repair-readiness/);
    assert.match(markdown, /db_repair_step_command: repair_or_rotate_candidate_refresh_db_credentials \| update SUPABASE_MIGRATION_URL outside generated reports/);
    assert.match(markdown, /db_repair_step_note: repair_or_rotate_candidate_refresh_db_credentials \| Do not write raw passwords/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('release dashboard preserves default master-plan candidate baseline materialization readiness plan', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-materialization-plan-'));
  const gapSummaryPath = path.join(reportRoot, 'real-evidence-gap-summary.json');

  await writeFile(gapSummaryPath, JSON.stringify({
    schemaVersion: 'workbuddy-default-master-plan-real-evidence-gap-summary/v1',
    status: 'blocked',
    productionReady: false,
    gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
    prioritizedNextActionGroups: [{
      id: 'candidate_baseline_materialization_unlock',
      priority: 20,
      status: 'blocked',
      blockedBy: ['candidate_baseline_materialization_unlock_required'],
      deferredBy: [],
      nextAction: 'Run candidate baseline materialization only with explicit unlock.',
      commands: ['npm.cmd run evidence:default-master-plan:candidate-baseline-materialization'],
      mutationBoundary: 'DB write path; do not run without explicit materialization approval and unlock.',
      operatorRequirements: [],
      materializationReadinessPlan: {
        status: 'blocked',
        productionReady: false,
        baselineId: 'baseline-1',
        projectId: 'project-1',
        businessType: 'school',
        environment: 'staging',
        materializationCommandReady: true,
        unlockVariable: 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION',
        unlockPresent: false,
        executeReady: false,
        operatorMustRunManually: true,
        blockers: ['candidate_baseline_materialization_unlock_not_present'],
        doesNotConnectDatabase: true,
        commandsExecuted: 0,
        writesCandidateBaselines: false,
        writesTaskBaselineItems: false,
        nextCommands: {
          setUnlockPowerShell: "$env:WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION='1'",
          executeCandidateBaselineMaterialization: 'node project-testing/tools/run-default-master-plan-candidate-baseline-materialization.mjs --mode execute --allow-materialization',
          refreshOperatorHandoff: 'npm.cmd run evidence:default-master-plan:operator-handoff',
          refreshOperatorHandoffPreflight: 'npm.cmd run evidence:default-master-plan:operator-handoff-preflight',
          refreshRealEvidenceGaps: 'npm.cmd run evidence:default-master-plan:real-evidence-gaps',
        },
      },
    }],
  }, null, 2) + '\n', 'utf8');

  try {
    const result = await runDashboard({
      argv: [
        '--profile',
        'release-local',
        '--gate',
        'default-master-plan-evidence-source-kit',
        '--dry-run',
        '--report-root',
        reportRoot,
        '--default-master-plan-gap-summary',
        gapSummaryPath,
      ],
      cwd: repoRoot,
      now: new Date('2026-07-08T11:31:12+08:00'),
    });

    const [group] = result.summary.defaultMasterPlanActionHandoff.actionGroups;
    assert.equal(group.id, 'candidate_baseline_materialization_unlock');
    assert.equal(group.materializationReadinessPlan.status, 'blocked');
    assert.equal(group.materializationReadinessPlan.materializationCommandReady, true);
    assert.equal(group.materializationReadinessPlan.unlockVariable, 'WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION');
    assert.equal(group.materializationReadinessPlan.unlockPresent, false);
    assert.equal(group.materializationReadinessPlan.nextCommands.refreshRealEvidenceGaps, 'npm.cmd run evidence:default-master-plan:real-evidence-gaps');

    const stableJsonPath = path.join(reportRoot, 'default-master-plan-production-readiness', 'default-master-plan-action-handoff.json');
    const stableHandoff = JSON.parse(await readFile(stableJsonPath, 'utf8'));
    assert.equal(stableHandoff.actionGroups[0].materializationReadinessPlan.nextCommands.refreshOperatorHandoff, 'npm.cmd run evidence:default-master-plan:operator-handoff');

    const markdown = await readFile(path.join(result.reportDir, 'summary.md'), 'utf8');
    assert.match(markdown, /materialization_readiness_plan_status: blocked/);
    assert.match(markdown, /materialization_readiness_unlock_variable: WORKBUDDY_ALLOW_DEFAULT_MASTER_PLAN_CANDIDATE_BASELINE_MATERIALIZATION/);
    assert.match(markdown, /materialization_next_command: setUnlockPowerShell/);
    assert.match(markdown, /materialization_next_command: executeCandidateBaselineMaterialization/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('release dashboard preserves default master-plan runtime seed environment repair plan', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-runtime-seed-repair-plan-'));
  const gapSummaryPath = path.join(reportRoot, 'real-evidence-gap-summary.json');

  await writeFile(gapSummaryPath, JSON.stringify({
    schemaVersion: 'workbuddy-default-master-plan-real-evidence-gap-summary/v1',
    status: 'blocked',
    productionReady: false,
    gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
    prioritizedNextActionGroups: [{
      id: 'runtime_seed_local_environment_and_import',
      priority: 30,
      status: 'blocked',
      blockedBy: [
        'local_supabase_endpoint_unreachable',
        'supabase_cli_missing_for_local_seed_setup',
        'docker_cli_missing_for_local_supabase',
      ],
      deferredBy: [],
      nextAction: 'Prepare the local runtime seed environment.',
      commands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
      mutationBoundary: 'local active seed smoke import only; no production seed write.',
      operatorRequirements: [],
      repairPlan: {
        status: 'blocked',
        targetClass: 'local_supabase',
        noAutoInstall: true,
        requiredStepIds: ['install_or_start_docker', 'install_supabase_cli', 'start_local_supabase'],
        blockedStepIds: ['rerun_runtime_seed_pipeline'],
        orderedStepCount: 4,
        orderedSteps: [{
          id: 'install_or_start_docker',
          status: 'required',
          blockerCodes: ['docker_cli_missing_for_local_supabase'],
          title: 'Docker must be available before local Supabase can be started or repaired.',
          commands: ['docker version'],
          verificationCommands: ['docker version'],
          notes: ['Install or start Docker Desktop outside this script if unavailable.'],
        }, {
          id: 'install_supabase_cli',
          status: 'required',
          blockerCodes: ['supabase_cli_missing_for_local_seed_setup'],
          title: 'Supabase CLI must be available before local Supabase can be started or inspected.',
          commands: ['supabase --version'],
          verificationCommands: ['supabase --version'],
          notes: ['Do not commit tokens or local secrets.'],
        }, {
          id: 'start_local_supabase',
          status: 'required',
          blockerCodes: ['local_supabase_endpoint_unreachable'],
          title: 'Start local Supabase and make 127.0.0.1:54321 reachable.',
          commands: ['supabase status', 'supabase start'],
          verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-env'],
          notes: ['This is local-only setup evidence; it is not production runtime evidence.'],
        }, {
          id: 'rerun_runtime_seed_pipeline',
          status: 'blocked_by_previous_steps',
          blockerCodes: ['local_supabase_endpoint_unreachable'],
          title: 'Rerun runtime seed evidence pipeline after the local environment is reachable.',
          commands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
          verificationCommands: ['npm.cmd run evidence:default-master-plan:runtime-seed-pipeline'],
          notes: [],
        }],
      },
    }],
  }, null, 2) + '\n', 'utf8');

  try {
    const result = await runDashboard({
      argv: [
        '--profile',
        'release-local',
        '--gate',
        'default-master-plan-evidence-source-kit',
        '--dry-run',
        '--report-root',
        reportRoot,
        '--default-master-plan-gap-summary',
        gapSummaryPath,
      ],
      cwd: repoRoot,
      now: new Date('2026-07-08T11:41:12+08:00'),
    });

    const [group] = result.summary.defaultMasterPlanActionHandoff.actionGroups;
    assert.equal(group.id, 'runtime_seed_local_environment_and_import');
    assert.equal(group.repairPlan.status, 'blocked');
    assert.equal(group.repairPlan.targetClass, 'local_supabase');
    assert.equal(group.repairPlan.noAutoInstall, true);
    assert.deepEqual(group.repairPlan.requiredStepIds, [
      'install_or_start_docker',
      'install_supabase_cli',
      'start_local_supabase',
    ]);
    assert.equal(group.repairPlan.orderedSteps[2].id, 'start_local_supabase');
    assert.equal(group.repairPlan.orderedSteps[2].commands[1], 'supabase start');

    const stableJsonPath = path.join(reportRoot, 'default-master-plan-production-readiness', 'default-master-plan-action-handoff.json');
    const stableHandoff = JSON.parse(await readFile(stableJsonPath, 'utf8'));
    assert.equal(stableHandoff.actionGroups[0].repairPlan.orderedSteps[0].commands[0], 'docker version');

    const markdown = await readFile(path.join(result.reportDir, 'summary.md'), 'utf8');
    assert.match(markdown, /repair_plan_status: blocked/);
    assert.match(markdown, /repair_target_class: local_supabase/);
    assert.match(markdown, /repair_no_auto_install: yes/);
    assert.match(markdown, /repair_step: start_local_supabase \| required/);
    assert.match(markdown, /repair_step_command: start_local_supabase \| supabase start/);
    assert.match(markdown, /repair_step_verification_command: start_local_supabase \| npm\.cmd run evidence:default-master-plan:runtime-seed-env/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('release dashboard preserves default master-plan runtime task and duration sample alignment plan', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-duration-alignment-plan-'));
  const gapSummaryPath = path.join(reportRoot, 'real-evidence-gap-summary.json');

  await writeFile(gapSummaryPath, JSON.stringify({
    schemaVersion: 'workbuddy-default-master-plan-real-evidence-gap-summary/v1',
    status: 'blocked',
    productionReady: false,
    gateSummary: { total: 11, pass: 6, blocked: 5, fail: 0, completionRate: 54.5 },
    prioritizedNextActionGroups: [{
      id: 'runtime_task_alignment_and_duration_samples',
      priority: 40,
      status: 'deferred',
      blockedBy: [
        'runtime_candidate_title_mismatch_rows_present',
        'accepted_real_duration_samples_required',
      ],
      deferredBy: ['candidate_refresh_db_connection_failed'],
      nextAction: 'Review runtime task drift and collect accepted actual-date samples.',
      commands: ['npm.cmd run evidence:default-master-plan:runtime-candidate-alignment'],
      mutationBoundary: 'source material and report chain only until governed writers are explicitly unlocked.',
      operatorRequirements: [],
      durationAlignmentPlan: {
        completedTaskExport: {
          requiredStableCodeCount: 18,
          exportedTaskCount: 0,
          invalidTaskCount: 3,
          missingStableCodeCount: 5,
          missingStableCodes: ['BTMP-SCH-02'],
          invalidTaskExamples: [{
            id: 'task-1',
            stableCode: 'BTMP-SCH-04',
            title: 'bad title',
            expectedTitle: 'expected title',
            recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
            blockers: ['completed_task_title_mismatch'],
          }],
        },
        runtimeCandidateAlignment: {
          candidateRowCount: 18,
          runtimeTaskCount: 16,
          missingRuntimeTaskCount: 2,
          titleMismatchCount: 3,
          rowsMissingActualDateRangeCount: 3,
          driftExamples: [{
            stableCode: 'BTMP-SCH-02',
            runtimeTaskId: 'runtime-task-2',
            alignmentStatus: 'title_mismatch',
            recommendedAction: 'refresh_runtime_task_stable_code_or_collect_current_completed_task',
            blockers: ['runtime_task_title_mismatch'],
          }],
        },
        runtimeTaskAlignmentRefreshPackage: {
          status: 'runtime_task_alignment_refresh_review_required',
          actionCount: 5,
          stableCodeRefreshReviewActionCount: 3,
          missingRuntimeTaskActionCount: 2,
          actualDateRangeCollectionActionCount: 2,
          executeAllowed: false,
          actionExamples: [{
            stableCode: 'BTMP-SCH-02',
            runtimeTaskId: 'runtime-task-2',
            actionKind: 'review_runtime_task_stable_code_refresh',
            proposedStableCode: 'BTMP-SCH-03',
            blockers: ['human_project_manager_review_required'],
          }],
        },
        realDurationSampleMaterialPreflight: {
          status: 'blocked',
          checkedBy: 'release-operator-1',
          requiredStableCodeCount: 2,
          readyStableCodeCount: 1,
          missingStableCodeCount: 1,
          nextSampleCollectionTargets: [{
            priority: 1,
            businessType: 'hospital',
            stableCode: 'BTMP-HSP-01',
            requiredAcceptedSampleCount: 1,
            readySampleCount: 0,
            missingSampleCount: 1,
            invalidSampleCount: 1,
            nextAction: 'collect_accepted_real_duration_sample',
          }],
          readySampleExamples: [{
            stableCode: 'BTMP-SCH-01',
            readySampleCount: 1,
            readySampleIds: ['sample-sch-01'],
          }],
          blockers: ['accepted_real_duration_sample_material_coverage_incomplete'],
          writesDurationSamples: false,
          writesRuntimePublication: false,
        },
      },
    }],
  }, null, 2) + '\n', 'utf8');

  try {
    const result = await runDashboard({
      argv: [
        '--profile',
        'release-local',
        '--gate',
        'default-master-plan-evidence-source-kit',
        '--dry-run',
        '--report-root',
        reportRoot,
        '--default-master-plan-gap-summary',
        gapSummaryPath,
      ],
      cwd: repoRoot,
      now: new Date('2026-07-08T11:51:12+08:00'),
    });

    const [group] = result.summary.defaultMasterPlanActionHandoff.actionGroups;
    assert.equal(group.id, 'runtime_task_alignment_and_duration_samples');
    assert.equal(group.durationAlignmentPlan.completedTaskExport.requiredStableCodeCount, 18);
    assert.equal(group.durationAlignmentPlan.runtimeCandidateAlignment.titleMismatchCount, 3);
    assert.equal(group.durationAlignmentPlan.runtimeTaskAlignmentRefreshPackage.actionCount, 5);
    assert.equal(group.durationAlignmentPlan.realDurationSampleMaterialPreflight.nextSampleCollectionTargets[0].stableCode, 'BTMP-HSP-01');

    const stableJsonPath = path.join(reportRoot, 'default-master-plan-production-readiness', 'default-master-plan-action-handoff.json');
    const stableHandoff = JSON.parse(await readFile(stableJsonPath, 'utf8'));
    assert.equal(stableHandoff.actionGroups[0].durationAlignmentPlan.realDurationSampleMaterialPreflight.readySampleExamples[0].stableCode, 'BTMP-SCH-01');

    const markdown = await readFile(path.join(result.reportDir, 'summary.md'), 'utf8');
    assert.match(markdown, /duration_alignment_completed_task_export_required_stable_codes: 18/);
    assert.match(markdown, /duration_alignment_runtime_candidate_title_mismatches: 3/);
    assert.match(markdown, /duration_alignment_refresh_package_actions: 5/);
    assert.match(markdown, /duration_alignment_sample_preflight_status: blocked/);
    assert.match(markdown, /duration_alignment_next_sample_target: 1 \| hospital \| BTMP-HSP-01 \| 1 missing/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});

test('release dashboard includes tool readiness summary in dry-run reports', async () => {
  const reportRoot = await mkdtemp(path.join(tmpdir(), 'workbuddy-release-dashboard-tools-'));

  try {
    const result = await runDashboard({
      argv: ['--profile', 'tool-readiness', '--dry-run', '--report-root', reportRoot],
      cwd: repoRoot,
      now: new Date('2026-06-29T02:03:04+08:00'),
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.summary.toolReadiness.profile, 'tool-readiness');

    const markdown = await readFile(path.join(result.reportDir, 'summary.md'), 'utf8');
    assert.match(markdown, /Tool Readiness/);
    assert.match(markdown, /cloakbrowser/);
    assert.match(markdown, /yingdao-rpa/);
  } finally {
    await rm(reportRoot, { recursive: true, force: true });
  }
});
