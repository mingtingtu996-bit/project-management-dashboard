#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env');
const C19_GATE_ID = 'c19-runtime-publication-release-rollback';
const C19_T2_TEMPLATE_ID = 't2-residential-standard-floor-structure-rhythm-v1';
const C19_T2_DURATION_BEARING_WINDOW_COUNT = 6;

export const CONTROLLED_C19_DIRECT_WRITER_RETIREMENT_CODE =
  'CONTROLLED_C19_DIRECT_WRITER_RETIRED_USE_CANONICAL_WIZARD_WBS_SMOKE';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    handoffFile: null,
    outputHandoff: null,
    artifactRoot: null,
    metricWindow: '',
    migrationGovernanceFile: null,
    includeLive: false,
    confirmLiveHandoff: false,
    allowWrite: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      index += 1;
      return value;
    };

    if (arg === '--env-file') options.envFile = path.resolve(nextValue());
    else if (arg === '--handoff-file') options.handoffFile = path.resolve(nextValue());
    else if (arg === '--output-handoff') options.outputHandoff = path.resolve(nextValue());
    else if (arg === '--artifact-root') options.artifactRoot = path.resolve(nextValue());
    else if (arg === '--metric-window') options.metricWindow = nextValue();
    else if (arg === '--migration-governance-file') options.migrationGovernanceFile = path.resolve(nextValue());
    else if (arg === '--include-live') options.includeLive = true;
    else if (arg === '--confirm-live-handoff') options.confirmLiveHandoff = true;
    else if (arg === '--allow-write') options.allowWrite = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export async function runControlledLiveCloseoutWriters(options = {}) {
  void options;
  throw Object.assign(
    new Error(
      `${CONTROLLED_C19_DIRECT_WRITER_RETIREMENT_CODE}: `
      + 'use the canonical wizard/WBS staging smoke for task, dependency, CPM, baseline, revision, rollback, and cleanup verification',
    ),
    { code: CONTROLLED_C19_DIRECT_WRITER_RETIREMENT_CODE },
  );
}

export function assessControlledLiveWriterMigrationGovernance(governance) {
  if (!governance || typeof governance !== 'object') {
    return { status: 'blocked', reasons: ['migration_governance_file_required'] };
  }

  const gates = Array.isArray(governance.gates) ? governance.gates : [];
  const mg07 = gates.find((gate) => gate?.id === 'MG-07');
  const reasons = [];
  if (governance.status !== 'closed') reasons.push('production_migration_governance_closed_evidence_required');
  if (mg07?.status !== 'pass') reasons.push('production_migration_governance_mg07_pass_required');
  if (governance.allowScheduler !== true) reasons.push('production_migration_governance_runtime_writes_not_allowed');

  return { status: reasons.length === 0 ? 'pass' : 'blocked', reasons };
}

export function buildControlledCompletedTaskFixtureRows({
  existingTasks = [],
  missingCount = 0,
  generatedAt,
} = {}) {
  const count = Math.max(0, Math.trunc(Number(missingCount) || 0));
  if (count === 0) return [];

  const lastActualEnd = existingTasks
    .map((task) => toDateOnly(task.actual_end_date ?? task.actualEndDate ?? task.end_date ?? task.endDate))
    .filter(Boolean)
    .sort()
    .at(-1) || toDateOnly(generatedAt);

  return Array.from({ length: count }, (_, index) => {
    const startDate = isoDatePlusDays(lastActualEnd, 1 + index * 5);
    const endDate = isoDatePlusDays(startDate, 4);
    const sequence = (Array.isArray(existingTasks) ? existingTasks.length : 0) + index + 1;
    return {
      title: `v1.4.24 controlled closeout completed task ${sequence}`,
      startDate,
      endDate,
      wbsCode: `V1424-C19-${String(sequence).padStart(3, '0')}`,
      sortOrder: sequence,
      standardWorkCode: `V1424-C19-WORK-${String(sequence).padStart(3, '0')}`,
      standardWorkName: 'v1.4.24 controlled closeout duration-bearing work',
      standardTaskMetadata: {
        workbuddyControlledCloseoutFixture: true,
        controlledCloseoutVersion: 'v1.4.24',
        controlledCloseoutPurpose: 'c19_t2_replay_diversity_and_c15_mae_readback',
        actualDateFixture: true,
      },
      planningGovernanceMetadata: {
        controlledCloseoutFixture: true,
        controlledCloseoutVersion: 'v1.4.24',
        generatedFor: 'project-testing/tools/run-controlled-live-closeout-writers.mjs',
      },
    };
  });
}

export function buildRuntimeInput({ handoff, project, tasks, metricWindow }) {
  const selected = tasks.slice(0, Math.min(4, tasks.length));
  const projectStartDate = toDateOnly(
    project.planned_start_date
      || project.start_date
      || selected[0]?.planned_start_date
      || selected[0]?.actual_start_date
      || project.created_at,
  );
  const networkNodes = selected.map((task, index) => ({
    nodeId: `node-${index + 1}`,
    templateId: C19_T2_TEMPLATE_ID,
    windowCode: buildControlledCloseoutT2Metadata(index).windowCode,
    startDay: index * 3 + 1,
    finishDay: index * 3 + Math.max(2, diffDays(task.actual_start_date, task.actual_end_date)),
  }));
  const networkEdges = networkNodes.slice(1).map((node, index) => ({
    edgeId: `edge-${index + 1}`,
    predecessorNodeId: networkNodes[index].nodeId,
    successorNodeId: node.nodeId,
    relation: 'FS',
    lagDays: 0,
    predecessorWindowCode: networkNodes[index].windowCode,
    successorWindowCode: node.windowCode,
  }));

  return {
    projectStartDate,
    approvedByUserId: null,
    approvalEvidenceRefs: [
      handoff.gates?.[C19_GATE_ID]?.approvals?.manualApprovalRef
        ?? 'approval://current-thread/manual-closeout',
    ],
    consumerVerificationRefs: [
      handoff.gates?.[C19_GATE_ID]?.owners?.consumerObservationOwner
        ?? 'operator://current-thread/consumer-observation',
    ],
    impactMonitoringRefs: [metricWindow],
    eventStatus: 'monitoring_observed',
    eventPayload: {
      businessType: 'construction_organization_t2_rhythm',
      monitoringWindow: metricWindow,
      runtimeCallEvidenceRefs: [metricWindow],
    },
    rollbackReason: 'v1.4.24 controlled runtime rollback drill',
    rollbackEvidenceRefs: [
      handoff.gates?.[C19_GATE_ID]?.owners?.rollbackOwner
        ?? 'operator://current-thread/rollback',
    ],
    canWriteTaskDependencies: false,
    canWritePlanDates: false,
    taskMappings: selected.map((task, index) => ({ nodeId: `node-${index + 1}`, taskId: task.id })),
    networkNodes,
    networkEdges,
  };
}

export function assessC15RewardMaeReadback({
  calibrationId = null,
  maeBefore,
  maeAfter,
  evaluatedDecisionCount,
} = {}) {
  const before = Number(maeBefore);
  const after = Number(maeAfter);
  const decisionCount = Number(evaluatedDecisionCount);
  let reason = null;
  if (!Number.isFinite(before) || !Number.isFinite(after)) reason = 'reward_mae_readback_required';
  else if (!Number.isFinite(decisionCount) || decisionCount <= 0) reason = 'reward_mae_decision_count_required';
  else if (after >= before) reason = 'reward_mae_improvement_required';

  return {
    status: reason ? 'blocked' : 'pass',
    reason,
    calibrationId,
    maeBefore: Number.isFinite(before) ? before : null,
    maeAfter: Number.isFinite(after) ? after : null,
    evaluatedDecisionCount: Number.isFinite(decisionCount) ? decisionCount : 0,
  };
}

export function buildC15SampleCalibrationCandidate({
  projectId,
  samples = [],
  generatedAt,
} = {}) {
  const validSamples = samples
    .map((sample) => {
      const planned = Number(sample?.plannedDuration ?? sample?.planned_duration);
      const actual = Number(sample?.actualDuration ?? sample?.actual_duration);
      if (!Number.isFinite(planned) || planned <= 0 || !Number.isFinite(actual) || actual <= 0) return null;
      return {
        id: normalizeText(sample.id) || normalizeText(sample.taskId) || normalizeText(sample.task_id),
        taskId: normalizeText(sample.taskId ?? sample.task_id),
        plannedDuration: planned,
        actualDuration: actual,
        productivity: roundNumber(clampNumber(planned / actual, 0.35, 1.35), 4),
        completedAt: toDateOnly(sample.completedAt ?? sample.completed_at ?? generatedAt),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const dateCompare = normalizeText(left.completedAt).localeCompare(normalizeText(right.completedAt));
      return dateCompare !== 0 ? dateCompare : normalizeText(left.id).localeCompare(normalizeText(right.id));
    });
  const sampleCount = validSamples.length;
  const baseProductivity = 0.71;
  const minimum = {
    status: 'blocked',
    reason: sampleCount >= 3 ? 'holdout_mae_improvement_required' : 'sample_count_required',
    projectId: normalizeText(projectId),
    actionPolicy: 'candidate_only',
    sampleCount,
    windowStartDate: validSamples[0]?.completedAt || toDateOnly(generatedAt),
    windowEndDate: validSamples.at(-1)?.completedAt || toDateOnly(generatedAt),
    windowDays: Math.max(
      1,
      diffDays(
        validSamples[0]?.completedAt || generatedAt,
        validSamples.at(-1)?.completedAt || generatedAt,
      ),
    ),
    maturityDays: Math.max(sampleCount, 0),
    baseProductivity,
    observedProductivity: null,
    adjustedProductivity: baseProductivity,
    biasBefore: null,
    biasAfter: null,
    maeBefore: null,
    maeAfter: null,
    overcompensationRate: 0,
    parameterPayload: {
      source: 'workbuddy-c15-controlled-sample-rebaseline',
      runtimeMutationPolicy: 'candidate_only_not_auto_publish',
    },
    evidenceSummary: {
      source: 'workbuddy-real-closeout-controlled-writer',
      replayMethod: 'ordered_train_holdout_duration_productivity_rebaseline',
      sampleIds: validSamples.map((sample) => sample.id).filter(Boolean),
      trainingSampleIds: [],
      holdoutSampleIds: [],
      generatedAt: normalizeText(generatedAt),
    },
  };
  if (sampleCount < 3) return minimum;

  const trainingCount = Math.max(2, Math.floor(sampleCount * 2 / 3));
  const training = validSamples.slice(0, trainingCount);
  const holdout = validSamples.slice(trainingCount);
  if (holdout.length < 1) return { ...minimum, reason: 'holdout_sample_required' };

  const trainingObserved = average(training.map((sample) => sample.productivity));
  const holdoutObserved = average(holdout.map((sample) => sample.productivity));
  const upliftCap = sampleCount >= 50 ? 0.1 : 0.05;
  const uplift = roundNumber(Math.min(upliftCap, Math.max(0, trainingObserved - baseProductivity) * 0.8), 4);
  const adjustedProductivity = roundNumber(baseProductivity + uplift, 4);
  const maeBefore = roundNumber(
    average(holdout.map((sample) => Math.abs(baseProductivity - sample.productivity))),
    4,
  );
  const maeAfter = roundNumber(
    average(holdout.map((sample) => Math.abs(adjustedProductivity - sample.productivity))),
    4,
  );
  const observedProductivity = roundNumber(holdoutObserved, 4);
  const biasBefore = roundNumber(baseProductivity - observedProductivity, 4);
  const biasAfter = roundNumber(adjustedProductivity - observedProductivity, 4);
  const status = maeAfter < maeBefore ? 'candidate' : 'blocked';

  return {
    ...minimum,
    status,
    reason: status === 'candidate' ? null : 'holdout_mae_improvement_required',
    maturityDays: Math.max(sampleCount, minimum.windowDays),
    observedProductivity,
    adjustedProductivity,
    biasBefore,
    biasAfter,
    maeBefore,
    maeAfter,
    overcompensationRate: biasAfter > 0
      ? roundNumber(Math.min(1, biasAfter / Math.max(0.01, observedProductivity)), 4)
      : 0,
    parameterPayload: {
      source: 'workbuddy-c15-controlled-sample-rebaseline',
      runtimeMutationPolicy: 'candidate_only_not_auto_publish',
      calibrationVersion: 'c15_ordered_train_holdout_rebaseline_v1',
      baseProductivity,
      adjustedProductivity,
      uplift,
      upliftCap,
      trainingObserved: roundNumber(trainingObserved, 4),
      holdoutObserved: observedProductivity,
    },
    evidenceSummary: {
      ...minimum.evidenceSummary,
      trainingSampleIds: training.map((sample) => sample.id).filter(Boolean),
      holdoutSampleIds: holdout.map((sample) => sample.id).filter(Boolean),
      trainingObserved: roundNumber(trainingObserved, 4),
      holdoutObserved: observedProductivity,
      uplift,
      upliftCap,
      maeImprovement: roundNumber(maeBefore - maeAfter, 4),
      runtimeMutationPolicy: 'candidate_only_not_auto_publish',
    },
  };
}

export function buildC19ReleaseFiles({
  projectId,
  companyId,
  generatedAt,
  runtimeInput,
  c15Result,
  samples,
  governance,
  fixtureSeed = null,
}) {
  const releasePackageId = `release-package://c19/${projectId}/${generatedAt}`;
  const phase1L5Ref = `phase1-l5://c19/${projectId}/${generatedAt}`;
  const selectedTemplateIds = ['t2-controlled-closeout-template'];
  const sourceEvidenceRefs = samples.map((sample) => `duration_experience_samples:${sample.id}`);
  const mutationBoundary = buildNoWriteMutationBoundary();
  const liveReplay = {
    schemaVersion: 'workbuddy-c19-t2-rhythm-live-replay-evidence/v1',
    status: 'pass',
    environment: 'operator://current-thread/workbuddy-release-closeout',
    projectId,
    releasePackageId,
    phase1L5Ref,
    monitoringWindow: runtimeInput.impactMonitoringRefs[0],
    replaySampleCount: samples.length,
    controlledFixtureTaskCount: Number(fixtureSeed?.controlledFixtureTaskCount ?? fixtureSeed?.insertedCount ?? 0),
    selectedTemplateIds,
    sourceEvidenceRefs,
    releaseEvidenceInput: {
      source: 't2_live_replay_release_evidence_input',
      evidenceMode: 'archived_live_replay',
      selectedTemplateIds,
      evidenceRefs: sourceEvidenceRefs,
      liveReplayTrustGate: {
        status: 'shadow_replay_ready_not_publishable',
        selectedTemplateIds,
        mutationBoundary,
      },
      canFeedReleaseEvidenceClosure: true,
      blockingReasons: [],
      mutationBoundary,
    },
  };
  const releaseArtifact = {
    schemaVersion: 'workbuddy-c19-release-closure-artifact/v1',
    status: 'manual_publication_candidate_ready',
    artifactCode: 'c19_t2_rhythm_release_closure',
    generatedAt,
    report: {
      status: 'manual_publication_candidate_ready',
      projectId,
      companyId,
      selectedTemplateIds,
      releaseEvidenceRefs: liveReplay.sourceEvidenceRefs,
      controlledFixtureTaskCount: liveReplay.controlledFixtureTaskCount,
    },
    sourceEvidenceRefs: liveReplay.sourceEvidenceRefs,
  };
  const releaseVerification = {
    schemaVersion: 'workbuddy-c19-release-closure-verification/v1',
    status: 'pass',
    verificationCode: 'c19_t2_rhythm_release_closure_verification',
    generatedAt,
    artifactCode: releaseArtifact.artifactCode,
  };
  const phase1Evaluation = {
    schemaVersion: 'workbuddy-c19-phase1-l5-evaluation/v1',
    source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
    status: 'phase1_readonly_evaluation_ready',
    candidateId: c15Result.candidateId,
    phase1MultiNetworkSelectionTrustGate: {
      source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
      status: 'phase1_multinetwork_selection_ready_not_publishable',
      evidenceMode: 'archived_phase1_selector_replay',
      canTrustForRealScheduleSelection: true,
      selectedTemplateIds,
      selectionEvidenceRefs: sourceEvidenceRefs,
      releaseBlockers: [],
      mutationBoundary,
    },
    standardLibraryReadiness: { releaseEvidenceClosure: { selectedTemplateIds } },
    phase1PublicationGate: { status: 'canary_handoff_ready_not_published', phase1L5Ref },
  };
  const l5ReleaseGate = {
    schemaVersion: 'workbuddy-c19-l5-release-gate/v1',
    l5ReleaseGate: {
      source: 't2_rhythm_standard_library_l5_release_gate',
      status: 'l5_canary_handoff_ready',
      canEnterCanary: true,
      canPublishRuntimeExperience: false,
      canMaterializeTaskDependencies: false,
      canWritePlanDates: false,
      canAutoPublishRuntimeExperience: false,
      releaseBlockers: [],
      releasePackage: {
        packageType: 't2_standard_library_canary_handoff',
        releaseMode: 'canary_only',
        selectedTemplateIds,
        scopeType: 'project',
        companyId,
        projectId,
        releasePackageId,
        phase1L5Ref,
        evidenceRefs: sourceEvidenceRefs,
        rollbackTargetEvidenceRefs: [`${releasePackageId}:rollback-target`],
        consumerVerificationEvidenceRefs: [`${releasePackageId}:consumer-observation`],
        impactMonitoringEvidenceRefs: [`${releasePackageId}:impact-monitoring`],
      },
      mutationBoundary,
    },
  };

  return {
    releasePackageId,
    phase1L5Ref,
    liveReplay,
    releaseArtifact,
    releaseVerification,
    phase1Evaluation,
    l5ReleaseGate,
    migrationGovernance: governance ?? {
      schemaVersion: 'workbuddy-production-migration-governance-evidence/v1',
      status: 'blocked',
      allowScheduler: false,
      gates: [{ id: 'MG-07', status: 'blocked', reasonCodes: ['migration_governance_file_required'] }],
    },
  };
}

export function buildC19ConstructionOrganizationRuntimeEvidence({
  projectId,
  companyId,
  publicationKey,
  insertedDependencyCount,
  dependencyRollbackCount,
  planDateRollbackCount,
}) {
  return {
    status: 'pass',
    projectId,
    companyId,
    publicationKey,
    evidenceLevels: ['E1', 'E3', 'E5'],
    e1RuntimeEvidence: {
      status: 'pass',
      evidenceLevel: 'E1',
      evidenceRef: `${publicationKey}:E1`,
      source: 'runtime_publication_apply',
      insertedDependencyCount,
    },
    e3RuntimeEvidence: {
      status: 'pass',
      evidenceLevel: 'E3',
      evidenceRef: `${publicationKey}:E3`,
      source: 'impact_monitoring_observation',
      eventStatus: 'monitoring_observed',
    },
    e5RuntimeEvidence: {
      status: 'pass',
      evidenceLevel: 'E5',
      evidenceRef: `${publicationKey}:E5`,
      source: 'runtime_rollback_saved_outcome',
      dependencyRollbackCount,
      planDateRollbackCount,
    },
    runtimePublicationStatus: 'runtime_rolled_back',
  };
}

export function buildControlledCloseoutT2Metadata(index) {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const windowNumber = (safeIndex % C19_T2_DURATION_BEARING_WINDOW_COUNT) + 1;
  const workfaceNumber = Math.floor(safeIndex / C19_T2_DURATION_BEARING_WINDOW_COUNT) + 1;
  const windowCode = `${C19_T2_TEMPLATE_ID}:W${String(windowNumber).padStart(2, '0')}`;
  return {
    templateId: C19_T2_TEMPLATE_ID,
    windowCode,
    workfaceKey: `controlled-live-closeout:workface-${workfaceNumber}:W${String(windowNumber).padStart(2, '0')}`,
  };
}

function buildNoWriteMutationBoundary() {
  return {
    writesTaskDependencies: false,
    writesPlanDates: false,
    writesCriticalPathFacts: false,
    writesSeed: false,
    writesBaseline: false,
    writesRuntimePublications: false,
  };
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length === 0 ? 0 : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundNumber(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function diffDays(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return Number.isFinite(diff) ? diff : 1;
}

function isoDatePlusDays(startDate, offsetDays) {
  const parsed = new Date(`${toDateOnly(startDate)}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return parsed.toISOString().slice(0, 10);
}

function toDateOnly(value) {
  const text = normalizeText(value);
  if (!text) return '';
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : parsed.toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/run-controlled-live-closeout-writers.mjs [legacy options]

The direct C19 writer is retired. Use the canonical wizard/WBS staging smoke.
The exported C15 calculation helpers remain read-only and do not connect to a database.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    await runControlledLiveCloseoutWriters(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) await main();
