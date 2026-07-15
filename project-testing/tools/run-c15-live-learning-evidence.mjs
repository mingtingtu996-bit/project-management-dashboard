#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkReleaseHandoffReadiness,
} from './check-release-handoff-readiness.mjs';

const __filename = fileURLToPath(import.meta.url);
const C15_GATE_ID = 'c15-live-learning-closeout';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoffFile: null,
    artifactRoot: null,
    includeLive: false,
    confirmLiveHandoff: false,
    allowWrite: false,
    metricWindow: null,
    writerResultFile: null,
    outputSummary: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--handoff-file') {
      options.handoffFile = path.resolve(nextValue());
    } else if (arg === '--artifact-root') {
      options.artifactRoot = path.resolve(nextValue());
    } else if (arg === '--include-live') {
      options.includeLive = true;
    } else if (arg === '--confirm-live-handoff') {
      options.confirmLiveHandoff = true;
    } else if (arg === '--allow-write') {
      options.allowWrite = true;
    } else if (arg === '--metric-window') {
      options.metricWindow = nextValue();
    } else if (arg === '--writer-result-file') {
      options.writerResultFile = path.resolve(nextValue());
    } else if (arg === '--output-summary') {
      options.outputSummary = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.handoffFile) {
    throw new Error('--handoff-file is required');
  }

  if (!options.help && !options.artifactRoot) {
    throw new Error('--artifact-root is required');
  }

  return options;
}

export async function runC15LiveLearningEvidence({
  handoffFile,
  artifactRoot,
  includeLive = false,
  confirmLiveHandoff = false,
  allowWrite = false,
  metricWindow = null,
  writerResultFile = null,
  outputSummary = null,
  now = new Date(),
  canaryWriter = null,
} = {}) {
  if (!handoffFile) {
    throw new Error('handoffFile is required');
  }
  if (!artifactRoot) {
    throw new Error('artifactRoot is required');
  }

  const root = path.resolve(artifactRoot);
  await mkdir(root, { recursive: true });
  const handoff = await readJson(handoffFile);
  const c15 = handoff.gates?.[C15_GATE_ID] ?? {};
  const metadata = c15Metadata(c15, metricWindow);
  const metadataReasons = c15MetadataMissingReasons(metadata);

  if (!allowWrite) {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      reasons: [
        'missing-real-sample-cohort',
        'missing-tenant-isolation-readback',
        'local-scheduler-only-not-accepted',
      ],
      metadataReasons,
      outputSummary,
    });
  }

  const readiness = await checkReleaseHandoffReadiness({
    handoffFile,
    gateIds: [C15_GATE_ID],
    now,
  });
  if (!includeLive || !confirmLiveHandoff || !handoff.unlockFlags?.includeLive || !handoff.unlockFlags?.confirmLiveHandoff || !readiness.readyToRun) {
    throw new Error('C15 handoff is not ready for live learning writes');
  }

  const writer = canaryWriter ?? (writerResultFile ? readWriterResultFile : defaultCanaryWriter);
  const writerResult = await writer({ metadata, now, writerResultFile });

  return writeWriterEvidence({
    root,
    metadata,
    now,
    writerResult,
    metadataReasons,
    outputSummary,
  });
}

async function writeBlockedEvidence({
  root,
  metadata,
  now,
  reasons,
  metadataReasons = [],
  outputSummary,
}) {
  const generatedAt = now.toISOString();
  const common = {
    generatedAt,
    ...metadata,
    liveMutation: false,
    dbMutation: false,
    tenantIsolationReadback: null,
    reasons,
    metadataReasons,
  };
  const documents = {
    'c15-sample-cohort-readback.json': {
      schemaVersion: 'workbuddy-c15-sample-cohort-readback-evidence/v1',
      status: 'blocked',
      ...common,
      missingRealSampleCohort: true,
    },
    'c15-reward-mae-quality-readback.json': {
      schemaVersion: 'workbuddy-c15-reward-mae-quality-readback-evidence/v1',
      status: 'blocked',
      ...common,
      rewardMaeReadbackReady: false,
      missingRealSampleCohort: true,
    },
    'c15-pending-prediction-closure.json': {
      schemaVersion: 'workbuddy-c15-pending-prediction-closure-evidence/v1',
      status: 'blocked',
      ...common,
      pendingPredictionClosureReady: false,
      missingRealSampleCohort: true,
    },
    'c15-policy-version-tenant-isolation.json': {
      schemaVersion: 'workbuddy-c15-policy-version-tenant-isolation-evidence/v1',
      status: 'blocked',
      ...common,
      policyVersionUnique: false,
      missingTenantIsolationReadback: true,
    },
    'c15-canary-approval-monitoring.json': {
      schemaVersion: 'workbuddy-c15-canary-approval-monitoring-evidence/v1',
      status: 'blocked',
      ...common,
      canaryApprovalReady: false,
      monitoringReady: false,
      missingRealSampleCohort: true,
    },
    'c15-rollback-or-supersede.json': {
      schemaVersion: 'workbuddy-c15-rollback-or-supersede-evidence/v1',
      status: 'blocked',
      ...common,
      rollbackOrSupersedeReady: false,
      missingTenantIsolationReadback: true,
    },
    'c15-live-evidence-summary.json': {
      schemaVersion: 'workbuddy-c15-live-evidence-summary/v1',
      status: 'blocked',
      ...common,
      missingRealSampleCohort: true,
      missingTenantIsolationReadback: true,
      manualAssistedOnly: false,
      boundary: 'No live C15 learning closeout write/readback was executed. This summary preserves blockers and must not be counted as pass.',
    },
  };
  const outputs = await writeNamedDocuments(root, documents);
  const summary = {
    schemaVersion: 'workbuddy-c15-live-learning-evidence-run/v1',
    status: 'blocked',
    generatedAt,
    gateId: C15_GATE_ID,
    liveMutation: false,
    dbMutation: false,
    outputs,
    reasons,
  };
  if (outputSummary) {
    await writeJson(outputSummary, summary);
  }
  return summary;
}

async function writeWriterEvidence({
  root,
  metadata,
  now,
  writerResult,
  metadataReasons = [],
  outputSummary,
}) {
  const generatedAt = now.toISOString();
  const passEvidence = normalizeWriterPassEvidence(writerResult, metadataReasons);
  const ready = passEvidence.ready;
  const tenantIsolationReadback = passEvidence.tenantIsolationReadback;
  const common = {
    generatedAt,
    ...metadata,
    tenantIsolationReadback,
    liveMutation: ready,
    dbMutation: ready,
    result: writerResult,
    reasons: ready ? [] : passEvidence.reasons,
  };
  const documents = {
    'c15-sample-cohort-readback.json': {
      schemaVersion: 'workbuddy-c15-sample-cohort-readback-evidence/v1',
      status: ready ? 'pass' : 'blocked',
      ...common,
      missingRealSampleCohort: !ready,
      sampleCohortReadback: passEvidence.sampleCohortReadback,
    },
    'c15-reward-mae-quality-readback.json': {
      schemaVersion: 'workbuddy-c15-reward-mae-quality-readback-evidence/v1',
      status: ready ? 'pass' : 'blocked',
      ...common,
      missingRealSampleCohort: !ready,
      rewardMaeQualityReadback: passEvidence.rewardMaeQualityReadback,
    },
    'c15-pending-prediction-closure.json': {
      schemaVersion: 'workbuddy-c15-pending-prediction-closure-evidence/v1',
      status: ready ? 'pass' : 'blocked',
      ...common,
      missingRealSampleCohort: !ready,
      pendingPredictionClosure: passEvidence.pendingPredictionClosure,
    },
    'c15-policy-version-tenant-isolation.json': {
      schemaVersion: 'workbuddy-c15-policy-version-tenant-isolation-evidence/v1',
      status: ready ? 'pass' : 'blocked',
      ...common,
      missingTenantIsolationReadback: !ready,
      policyVersionUniqueness: passEvidence.policyVersionUniqueness,
    },
    'c15-canary-approval-monitoring.json': {
      schemaVersion: 'workbuddy-c15-canary-approval-monitoring-evidence/v1',
      status: ready ? 'pass' : 'blocked',
      ...common,
      missingRealSampleCohort: !ready,
      canaryApprovalMonitoring: passEvidence.canaryApprovalMonitoring,
    },
    'c15-rollback-or-supersede.json': {
      schemaVersion: 'workbuddy-c15-rollback-or-supersede-evidence/v1',
      status: ready ? 'pass' : 'blocked',
      ...common,
      missingTenantIsolationReadback: !ready,
      rollbackOrSupersede: passEvidence.rollbackOrSupersede,
    },
    'c15-live-evidence-summary.json': {
      schemaVersion: 'workbuddy-c15-live-evidence-summary/v1',
      status: ready ? 'pass' : 'blocked',
      ...common,
      missingRealSampleCohort: !ready,
      missingTenantIsolationReadback: !ready,
      liveLearningCloseoutEvidence: ready ? {
        sampleCohortReadback: passEvidence.sampleCohortReadback,
        rewardMaeQualityReadback: passEvidence.rewardMaeQualityReadback,
        pendingPredictionClosure: passEvidence.pendingPredictionClosure,
        policyVersionUniqueness: passEvidence.policyVersionUniqueness,
        canaryApprovalMonitoring: passEvidence.canaryApprovalMonitoring,
        rollbackOrSupersede: passEvidence.rollbackOrSupersede,
      } : null,
    },
  };
  const outputs = await writeNamedDocuments(root, documents);
  const summary = {
    schemaVersion: 'workbuddy-c15-live-learning-evidence-run/v1',
    status: ready ? 'pass' : 'blocked',
    generatedAt,
    gateId: C15_GATE_ID,
    liveMutation: ready,
    dbMutation: ready,
    outputs,
    reasons: ready ? [] : passEvidence.reasons,
  };
  if (outputSummary) {
    await writeJson(outputSummary, summary);
  }
  return summary;
}

async function readWriterResultFile({ writerResultFile }) {
  return readJson(writerResultFile);
}

async function defaultCanaryWriter() {
  throw new Error('Live C15 learning writer is not wired in this Node harness. Provide canaryWriter from a controlled runner or keep --allow-write unset.');
}

function normalizeWriterPassEvidence(writerResult, initialReasons = []) {
  const reasons = [...initialReasons];
  if (!writerResult || writerResult.status !== 'pass') {
    reasons.push(...normalizeReasonArray(writerResult?.reasons, 'writer_result_not_pass'));
  }

  const sampleCohortReadback = firstEvidenceReady(
    writerResult?.sampleCohortReadback,
    writerResult?.sampleCohort,
    writerResult?.sample_cohort_readback,
  );
  if (!sampleCohortReadback) reasons.push('sample_cohort_readback_required');

  const rewardMaeQualityReadback = firstEvidenceReady(
    writerResult?.rewardMaeQualityReadback,
    writerResult?.rewardMaeReadback,
    writerResult?.reward_mae_quality_readback,
  );
  if (!rewardMaeQualityReadback) reasons.push('reward_mae_quality_readback_required');
  const rewardMaeQuality = assessRewardMaeQuality(rewardMaeQualityReadback);
  reasons.push(...rewardMaeQuality.reasons);

  const pendingPredictionClosure = firstEvidenceReady(
    writerResult?.pendingPredictionClosure,
    writerResult?.pending_prediction_closure,
  );
  if (!pendingPredictionClosure) reasons.push('pending_prediction_closure_required');

  const policyVersionUniqueness = firstEvidenceReady(
    writerResult?.policyVersionUniqueness,
    writerResult?.policyVersionUnique,
    writerResult?.policy_version_uniqueness,
  );
  if (!policyVersionUniqueness) reasons.push('policy_version_uniqueness_required');

  const tenantIsolationReadback = firstEvidenceReady(
    writerResult?.tenantIsolationReadback,
    writerResult?.tenantIsolation,
    writerResult?.tenant_isolation_readback,
  );
  if (!tenantIsolationReadback) reasons.push('tenant_isolation_readback_required');

  const canaryApprovalMonitoring = firstEvidenceReady(
    writerResult?.canaryApprovalMonitoring,
    writerResult?.canaryMonitoring,
    writerResult?.canary_approval_monitoring,
  );
  if (!canaryApprovalMonitoring) reasons.push('canary_approval_monitoring_required');

  const rollbackOrSupersede = firstEvidenceReady(
    writerResult?.rollbackOrSupersede,
    writerResult?.rollback,
    writerResult?.supersede,
    writerResult?.rollback_or_supersede,
  );
  if (!rollbackOrSupersede) reasons.push('rollback_or_supersede_required');

  return {
    ready: reasons.length === 0,
    reasons,
    sampleCohortReadback,
    rewardMaeQualityReadback,
    pendingPredictionClosure,
    policyVersionUniqueness,
    tenantIsolationReadback,
    canaryApprovalMonitoring,
    rollbackOrSupersede,
  };
}

function assessRewardMaeQuality(rewardMaeQualityReadback) {
  if (!rewardMaeQualityReadback || typeof rewardMaeQualityReadback !== 'object') {
    return {
      reasons: [],
    };
  }

  const maeBefore = Number(rewardMaeQualityReadback.maeBefore);
  const maeAfter = Number(rewardMaeQualityReadback.maeAfter);
  const evaluatedDecisionCount = Number(rewardMaeQualityReadback.evaluatedDecisionCount);
  const reasons = [];

  if (!Number.isFinite(maeBefore) || !Number.isFinite(maeAfter)) {
    reasons.push('reward_mae_numeric_readback_required');
  }

  if (!Number.isFinite(evaluatedDecisionCount) || evaluatedDecisionCount <= 0) {
    reasons.push('reward_mae_decision_count_required');
  }

  if (Number.isFinite(maeBefore) && Number.isFinite(maeAfter) && maeAfter >= maeBefore) {
    reasons.push('reward_mae_improvement_required');
  }

  return {
    reasons,
  };
}

function normalizeReasonArray(value, fallback) {
  const items = Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
  return items.length > 0 ? items : [fallback];
}

function firstEvidenceReady(...values) {
  return values.find(evidenceReady) ?? null;
}

function evidenceReady(value) {
  if (!value) return false;
  if (value === true) return true;
  if (typeof value !== 'object') return false;
  if (value.status === 'pass' || value.ready === true) return true;
  return false;
}

async function writeNamedDocuments(root, documents) {
  const outputs = [];
  for (const [filename, document] of Object.entries(documents)) {
    const filePath = path.join(root, filename);
    await writeJson(filePath, document);
    outputs.push({
      name: filename,
      path: filePath,
      status: document.status,
    });
  }
  return outputs;
}

function c15Metadata(c15, metricWindow) {
  return {
    environment: normalizeText(c15.live?.environmentOwner),
    companyId: normalizeText(c15.targets?.companyId),
    projectId: normalizeText(c15.targets?.projectId),
    candidateId: normalizeText(c15.targets?.candidateId),
    sampleCohortRef: normalizeText(c15.targets?.sampleCohortRef),
    metricWindow: normalizeText(metricWindow) || defaultMetricWindow(),
    approvalRef: normalizeText(c15.approvals?.manualApprovalRef),
    rollbackRef: normalizeText(c15.owners?.rollbackOwner),
  };
}

function c15MetadataMissingReasons(metadata) {
  return [
    normalizeText(metadata.environment) ? '' : 'environment_required',
    normalizeText(metadata.companyId) ? '' : 'company_id_required',
    normalizeText(metadata.projectId) ? '' : 'project_id_required',
    normalizeText(metadata.candidateId) ? '' : 'candidate_id_required',
    normalizeText(metadata.sampleCohortRef) ? '' : 'sample_cohort_ref_required',
    normalizeText(metadata.metricWindow) ? '' : 'metric_window_required',
    normalizeText(metadata.approvalRef) ? '' : 'approval_ref_required',
    normalizeText(metadata.rollbackRef) ? '' : 'rollback_ref_required',
  ].filter(Boolean);
}

function defaultMetricWindow() {
  return '';
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/run-c15-live-learning-evidence.mjs --handoff-file <handoff.json> --artifact-root <dir>

Defaults to fail-closed evidence generation. To enter guarded write mode, pass:
  --include-live --confirm-live-handoff --allow-write

To archive an already controlled live writer/readback result, pass:
  --writer-result-file <json>
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const summary = await runC15LiveLearningEvidence(options);
    console.log(`C15 live learning evidence: ${summary.status}`);
    console.log(`Live mutation: ${summary.liveMutation ? 'yes' : 'no'}`);
    console.log(`DB mutation: ${summary.dbMutation ? 'yes' : 'no'}`);
    process.exitCode = summary.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
