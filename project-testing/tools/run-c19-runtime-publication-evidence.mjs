#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkReleaseHandoffReadiness,
} from './check-release-handoff-readiness.mjs';

const __filename = fileURLToPath(import.meta.url);
const C19_GATE_ID = 'c19-runtime-publication-release-rollback';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoffFile: null,
    artifactRoot: null,
    includeLive: false,
    confirmLiveHandoff: false,
    allowWrite: false,
    releaseArtifactFile: null,
    releaseVerificationFile: null,
    phase1EvaluationFile: null,
    runtimeInputFile: null,
    migrationGovernanceFile: null,
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
    } else if (arg === '--release-artifact-file') {
      options.releaseArtifactFile = path.resolve(nextValue());
    } else if (arg === '--release-verification-file') {
      options.releaseVerificationFile = path.resolve(nextValue());
    } else if (arg === '--phase1-evaluation-file') {
      options.phase1EvaluationFile = path.resolve(nextValue());
    } else if (arg === '--runtime-input-file') {
      options.runtimeInputFile = path.resolve(nextValue());
    } else if (arg === '--migration-governance-file') {
      options.migrationGovernanceFile = path.resolve(nextValue());
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

export async function runC19RuntimePublicationEvidence({
  handoffFile,
  artifactRoot,
  includeLive = false,
  confirmLiveHandoff = false,
  allowWrite = false,
  releaseArtifactFile = null,
  releaseVerificationFile = null,
  phase1EvaluationFile = null,
  runtimeInputFile = null,
  migrationGovernanceFile = null,
  outputSummary = null,
  now = new Date(),
  runtimeWriter = null,
  queryExec = null,
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
  const c19 = handoff.gates?.[C19_GATE_ID] ?? {};
  const metadata = c19Metadata(c19);
  const metadataReasons = c19MetadataMissingReasons(metadata);

  if (!allowWrite) {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      reasons: ['missing-runtime-apply', 'missing-impact-monitoring', 'missing-rollback-or-saved-outcome'],
      metadataReasons,
      outputSummary,
    });
  }

  const readiness = await checkReleaseHandoffReadiness({
    handoffFile,
    gateIds: [C19_GATE_ID],
    now,
  });
  if (!includeLive || !confirmLiveHandoff || !handoff.unlockFlags?.includeLive || !handoff.unlockFlags?.confirmLiveHandoff || !readiness.readyToRun) {
    throw new Error('C19 handoff is not ready for live runtime publication writes');
  }

  if (!runtimeWriter) {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      reasons: [
        'C19_DIRECT_RUNTIME_WRITER_RETIRED_USE_CANONICAL_WIZARD_WBS_SMOKE',
        'canonical_wizard_wbs_smoke_required',
      ],
      metadataReasons,
      outputSummary,
    });
  }

  const missingInputs = [
    releaseArtifactFile ? '' : 'release_artifact_file_required',
    releaseVerificationFile ? '' : 'release_verification_file_required',
    phase1EvaluationFile ? '' : 'phase1_evaluation_file_required',
    runtimeInputFile ? '' : 'runtime_input_file_required',
    migrationGovernanceFile ? '' : 'migration_governance_file_required',
  ].filter(Boolean);

  if (missingInputs.length > 0) {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      reasons: ['missing-runtime-apply', 'missing-impact-monitoring', 'missing-rollback-or-saved-outcome', ...missingInputs],
      metadataReasons,
      outputSummary,
    });
  }

  if (metadataReasons.length > 0) {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      reasons: ['missing-runtime-apply', 'missing-impact-monitoring', 'missing-rollback-or-saved-outcome', ...metadataReasons],
      metadataReasons,
      outputSummary,
    });
  }

  const migrationGovernance = await readJson(migrationGovernanceFile);
  const migrationGovernanceAssessment = assessC19RuntimePublicationMigrationGovernance(migrationGovernance);
  if (migrationGovernanceAssessment.status !== 'pass') {
    return writeBlockedEvidence({
      root,
      metadata,
      now,
      reasons: [
        'missing-runtime-apply',
        'missing-impact-monitoring',
        'missing-rollback-or-saved-outcome',
        ...migrationGovernanceAssessment.reasons,
      ],
      metadataReasons,
      outputSummary,
    });
  }

  const writerResult = await runtimeWriter({
    metadata,
    files: {
      releaseArtifactFile,
      releaseVerificationFile,
      phase1EvaluationFile,
      runtimeInputFile,
      migrationGovernanceFile,
    },
    now,
    queryExec,
  });

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
  const runtimePublicationId = 'blocked-runtime-publication-not-applied';
  const replay = {
    schemaVersion: 'workbuddy-c19-t2-rhythm-live-replay-evidence/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    missingReplaySamples: true,
    metadataReasons,
    reasons,
    boundary: 'No live T2 rhythm replay evidence was archived. This artifact preserves the blocker and must remain a reject marker.',
  };
  const releaseArtifact = {
    schemaVersion: 'workbuddy-c19-release-closure-artifact-evidence/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    generatedPackageOnly: true,
    missingReleaseClosureArtifact: true,
    metadataReasons,
    reasons,
    boundary: 'No release closure artifact was archived. This artifact preserves the blocker and must remain a reject marker.',
  };
  const releaseVerification = {
    schemaVersion: 'workbuddy-c19-release-closure-verification-evidence/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    generatedPackageOnly: true,
    missingReleaseClosureVerification: true,
    metadataReasons,
    reasons,
    boundary: 'No release closure verification pass was archived. This artifact preserves the blocker and must remain a reject marker.',
  };
  const manualApproval = {
    schemaVersion: 'workbuddy-c19-manual-approval-preflight-evidence/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    missingManualApproval: true,
    metadataReasons,
    reasons,
    boundary: 'No manual approval preflight or approval reference was archived. This artifact preserves the blocker and must remain a reject marker.',
  };
  const apply = {
    schemaVersion: 'workbuddy-c19-runtime-publication-apply-evidence/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    missingRuntimeApply: true,
    metadataReasons,
    reasons,
    boundary: 'No runtime apply was executed. This artifact preserves the blocker and must remain a reject marker.',
  };
  const monitoring = {
    schemaVersion: 'workbuddy-c19-impact-monitoring-observation-evidence/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    missingImpactMonitoring: true,
    metadataReasons,
    reasons,
    boundary: 'No impact monitoring event was recorded. This artifact preserves the blocker and must remain a reject marker.',
  };
  const rollback = {
    schemaVersion: 'workbuddy-c19-runtime-rollback-saved-outcome-evidence/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    missingRollbackOrSavedOutcome: true,
    metadataReasons,
    reasons,
    boundary: 'No rollback or saved outcome was executed. This artifact preserves the blocker and must remain a reject marker.',
  };
  const constructionOrganization = {
    schemaVersion: 'workbuddy-c19-construction-organization-e1-e3-e5-evidence/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    missingConstructionOrganizationRuntimeEvidence: true,
    metadataReasons,
    reasons,
    boundary: 'No construction organization E1/E3/E5 runtime evidence was archived. This artifact preserves the blocker and must remain a reject marker.',
  };
  const summaryDocument = {
    schemaVersion: 'workbuddy-c19-live-evidence-summary/v1',
    status: 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: false,
    dbMutation: false,
    generatedPackageOnly: true,
    missingReplaySamples: true,
    missingReleaseClosureArtifact: true,
    missingReleaseClosureVerification: true,
    missingManualApproval: true,
    missingRuntimeApply: true,
    missingImpactMonitoring: true,
    missingRollbackOrSavedOutcome: true,
    missingConstructionOrganizationRuntimeEvidence: true,
    metadataReasons,
    reasons,
    boundary: 'C19 still lacks release closure, runtime apply, monitoring, rollback, and construction-organization runtime evidence.',
  };

  const outputs = await writeC19RuntimeArtifacts(root, {
    replay,
    releaseArtifact,
    releaseVerification,
    manualApproval,
    apply,
    monitoring,
    rollback,
    constructionOrganization,
    summary: summaryDocument,
  });
  const summary = {
    schemaVersion: 'workbuddy-c19-runtime-publication-evidence-run/v1',
    status: 'blocked',
    generatedAt,
    gateId: C19_GATE_ID,
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
  const applyResult = writerResult?.apply ?? {};
  const monitoringResult = writerResult?.monitoring ?? {};
  const rollbackResult = writerResult?.rollback ?? {};
  const runtimePublicationId = normalizeText(applyResult.publicationKey)
    || normalizeText(writerResult?.runtimePublicationId)
    || 'runtime-publication-id-missing';
  const metadataReady = metadataReasons.length === 0;
  const runtimeApplyReady = metadataReady && applyResult.status === 'runtime_apply_ready';
  const impactMonitoringReady = metadataReady && monitoringResult.status === 'runtime_event_recorded';
  const rollbackReady = metadataReady && rollbackResult.status === 'runtime_rollback_ready';

  const apply = {
    schemaVersion: 'workbuddy-c19-runtime-publication-apply-evidence/v1',
    status: runtimeApplyReady ? 'pass' : 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: runtimeApplyReady,
    dbMutation: runtimeApplyReady,
    missingRuntimeApply: !runtimeApplyReady,
    metadataReasons,
    result: applyResult,
  };
  const monitoring = {
    schemaVersion: 'workbuddy-c19-impact-monitoring-observation-evidence/v1',
    status: impactMonitoringReady ? 'pass' : 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: impactMonitoringReady,
    dbMutation: impactMonitoringReady,
    missingImpactMonitoring: !impactMonitoringReady,
    metadataReasons,
    result: monitoringResult,
  };
  const rollback = {
    schemaVersion: 'workbuddy-c19-runtime-rollback-saved-outcome-evidence/v1',
    status: rollbackReady ? 'pass' : 'blocked',
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: rollbackReady,
    dbMutation: rollbackReady,
    missingRollbackOrSavedOutcome: !rollbackReady,
    metadataReasons,
    result: rollbackResult,
  };
  const summaryDocument = {
    schemaVersion: 'workbuddy-c19-live-evidence-summary/v1',
    status: statusFromBooleans(runtimeApplyReady, impactMonitoringReady, rollbackReady),
    generatedAt,
    ...metadata,
    runtimePublicationId,
    liveMutation: runtimeApplyReady && impactMonitoringReady && rollbackReady,
    dbMutation: runtimeApplyReady && impactMonitoringReady && rollbackReady,
    generatedPackageOnly: !(runtimeApplyReady && impactMonitoringReady && rollbackReady),
    missingRuntimeApply: !runtimeApplyReady,
    missingImpactMonitoring: !impactMonitoringReady,
    missingRollbackOrSavedOutcome: !rollbackReady,
    metadataReasons,
  };

  const outputs = await writeC19RuntimeArtifacts(root, {
    apply,
    monitoring,
    rollback,
    summary: summaryDocument,
  });
  const status = runtimeApplyReady && impactMonitoringReady && rollbackReady ? 'pass' : 'blocked';
  const summary = {
    schemaVersion: 'workbuddy-c19-runtime-publication-evidence-run/v1',
    status,
    generatedAt,
    gateId: C19_GATE_ID,
    liveMutation: status === 'pass',
    dbMutation: status === 'pass',
    outputs,
  };
  if (outputSummary) {
    await writeJson(outputSummary, summary);
  }
  return summary;
}

export function assessC19RuntimePublicationMigrationGovernance(governance) {
  if (!governance || typeof governance !== 'object') {
    return {
      status: 'blocked',
      reasons: ['migration_governance_file_required'],
    };
  }

  const gates = Array.isArray(governance.gates) ? governance.gates : [];
  const mg07 = gates.find((gate) => gate?.id === 'MG-07');
  const reasons = [];
  if (governance.status !== 'closed') {
    reasons.push('production_migration_governance_closed_evidence_required');
  }
  if (mg07?.status !== 'pass') {
    reasons.push('production_migration_governance_mg07_pass_required');
  }
  if (governance.allowScheduler !== true) {
    reasons.push('production_migration_governance_runtime_writes_not_allowed');
  }

  return {
    status: reasons.length === 0 ? 'pass' : 'blocked',
    reasons,
  };
}

async function writeC19RuntimeArtifacts(root, {
  replay,
  releaseArtifact,
  releaseVerification,
  manualApproval,
  apply,
  monitoring,
  rollback,
  constructionOrganization,
  summary,
}) {
  const files = [
    ['c19-t2-rhythm-live-replay.json', replay],
    ['c19-release-closure-artifact.json', releaseArtifact],
    ['c19-release-closure-verification.json', releaseVerification],
    ['c19-manual-approval-preflight.json', manualApproval],
    ['c19-runtime-publication-apply.json', apply],
    ['c19-impact-monitoring-observation.json', monitoring],
    ['c19-runtime-rollback-saved-outcome.json', rollback],
    ['c19-construction-organization-e1-e3-e5.json', constructionOrganization],
    ['c19-live-evidence-summary.json', summary],
  ].filter(([, document]) => document);
  const outputs = [];

  for (const [filename, document] of files) {
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

function statusFromBooleans(...values) {
  return values.every(Boolean) ? 'pass' : 'blocked';
}

function c19Metadata(c19) {
  const release = c19.release ?? {};
  return {
    environment: normalizeText(c19.live?.environmentOwner),
    companyId: normalizeText(c19.targets?.companyId),
    projectId: normalizeText(c19.targets?.projectId),
    releasePackageId: normalizeText(release.releaseClosureArtifactRef),
    phase1L5Ref: normalizeText(release.phase1L5Ref),
    approvalRef: normalizeText(c19.approvals?.manualApprovalRef),
    monitoringWindow: normalizeText(release.monitoringWindow),
    rollbackRef: normalizeText(release.rollbackTargetRef) || normalizeText(c19.owners?.rollbackOwner),
    consumerObservationRef: normalizeText(c19.owners?.consumerObservationOwner),
  };
}

function c19MetadataMissingReasons(metadata) {
  return [
    normalizeText(metadata.environment) ? '' : 'environment_required',
    normalizeText(metadata.projectId) ? '' : 'project_id_required',
    normalizeText(metadata.releasePackageId) ? '' : 'release_package_id_required',
    normalizeText(metadata.phase1L5Ref) ? '' : 'phase1_l5_ref_required',
    normalizeText(metadata.approvalRef) ? '' : 'approval_ref_required',
    normalizeText(metadata.monitoringWindow) ? '' : 'monitoring_window_required',
    normalizeText(metadata.rollbackRef) ? '' : 'rollback_ref_required',
    normalizeText(metadata.consumerObservationRef) ? '' : 'consumer_observation_ref_required',
  ].filter(Boolean);
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
  node project-testing/tools/run-c19-runtime-publication-evidence.mjs --handoff-file <handoff.json> --artifact-root <dir>

The duplicate C19 direct runtime writer is retired. This compatibility command
only emits fail-closed evidence. Use run-wizard-baseline-revision-staging.mjs
for canonical wizard/WBS task, dependency, CPM, baseline, revision, and rollback smoke.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const summary = await runC19RuntimePublicationEvidence(options);
    console.log(`C19 runtime publication evidence: ${summary.status}`);
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
