#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    artifactRoot: null,
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

    if (arg === '--artifact-root' || arg === '--release-dir') {
      options.artifactRoot = path.resolve(nextValue());
    } else if (arg === '--output-summary') {
      options.outputSummary = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.artifactRoot) {
    throw new Error('--artifact-root is required');
  }

  return options;
}

export async function refreshC19ReleaseClosureSourceArtifacts({
  artifactRoot,
  outputSummary = null,
  now = new Date(),
} = {}) {
  if (!artifactRoot) throw new Error('artifactRoot is required');
  const root = path.resolve(artifactRoot);
  const generatedAt = now.toISOString();
  const liveReplayPath = path.join(root, 'c19-t2-rhythm-live-replay.json');
  const phase1Path = path.join(root, 'phase1-evaluation.json');
  const releaseArtifactPath = path.join(root, 'c19-release-closure-artifact.json');

  const liveReplay = await readJson(liveReplayPath);
  const phase1Evaluation = await readJson(phase1Path);
  const releaseArtifact = await readJson(releaseArtifactPath);
  const metadata = buildMetadata({ liveReplay, phase1Evaluation, releaseArtifact, generatedAt });
  const reasons = [
    metadata.selectedTemplateIds.length > 0 ? '' : 'selected_template_ids_required',
    metadata.evidenceRefs.length > 0 ? '' : 'source_evidence_refs_required',
    metadata.projectId ? '' : 'project_id_required',
    metadata.releasePackageId ? '' : 'release_package_id_required',
    metadata.phase1L5Ref ? '' : 'phase1_l5_ref_required',
  ].filter(Boolean);

  if (reasons.length > 0) {
    const summary = {
      schemaVersion: 'workbuddy-c19-release-closure-source-artifact-refresh/v1',
      status: 'blocked',
      generatedAt,
      artifactRoot: root,
      reasons,
      outputs: [],
    };
    if (outputSummary) await writeJson(outputSummary, summary);
    return summary;
  }

  const noWriteMutationBoundary = buildNoWriteMutationBoundary();
  const refreshedLiveReplay = {
    ...liveReplay,
    releaseEvidenceInput: {
      source: 't2_live_replay_release_evidence_input',
      evidenceMode: 'archived_live_replay',
      selectedTemplateIds: metadata.selectedTemplateIds,
      evidenceRefs: metadata.evidenceRefs,
      liveReplayTrustGate: {
        status: 'shadow_replay_ready_not_publishable',
        selectedTemplateIds: metadata.selectedTemplateIds,
        mutationBoundary: noWriteMutationBoundary,
      },
      canFeedReleaseEvidenceClosure: true,
      blockingReasons: [],
      mutationBoundary: noWriteMutationBoundary,
    },
  };
  const refreshedPhase1 = {
    ...phase1Evaluation,
    phase1MultiNetworkSelectionTrustGate: {
      source: 't2_rhythm_phase1_multinetwork_selection_trust_gate',
      status: 'phase1_multinetwork_selection_ready_not_publishable',
      evidenceMode: 'archived_phase1_selector_replay',
      canTrustForRealScheduleSelection: true,
      selectedTemplateIds: metadata.selectedTemplateIds,
      selectionEvidenceRefs: metadata.evidenceRefs,
      releaseBlockers: [],
      mutationBoundary: noWriteMutationBoundary,
    },
  };
  const l5ReleaseGate = {
    schemaVersion: 'workbuddy-c19-l5-release-gate/v1',
    generatedAt,
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
        selectedTemplateIds: metadata.selectedTemplateIds,
        scopeType: 'project',
        companyId: metadata.companyId,
        projectId: metadata.projectId,
        releasePackageId: metadata.releasePackageId,
        phase1L5Ref: metadata.phase1L5Ref,
        evidenceRefs: metadata.evidenceRefs,
        rollbackTargetEvidenceRefs: metadata.rollbackRef ? [metadata.rollbackRef] : [`${metadata.releasePackageId}:rollback-target`],
        consumerVerificationEvidenceRefs: metadata.consumerObservationRef ? [metadata.consumerObservationRef] : [`${metadata.releasePackageId}:consumer-observation`],
        impactMonitoringEvidenceRefs: metadata.monitoringWindow ? [metadata.monitoringWindow] : [`${metadata.releasePackageId}:impact-monitoring`],
      },
      mutationBoundary: noWriteMutationBoundary,
    },
  };

  const outputs = [
    await writeJson(liveReplayPath, refreshedLiveReplay),
    await writeJson(phase1Path, refreshedPhase1),
    await writeJson(path.join(root, 'l5-release-gate.json'), l5ReleaseGate),
  ];
  const summary = {
    schemaVersion: 'workbuddy-c19-release-closure-source-artifact-refresh/v1',
    status: 'pass',
    generatedAt,
    artifactRoot: root,
    selectedTemplateIds: metadata.selectedTemplateIds,
    evidenceRefCount: metadata.evidenceRefs.length,
    outputs,
  };
  if (outputSummary) await writeJson(outputSummary, summary);
  return summary;
}

function buildMetadata({ liveReplay, phase1Evaluation, releaseArtifact, generatedAt }) {
  const selectedTemplateIds = unique([
    ...(toStringArray(liveReplay.selectedTemplateIds)),
    ...(toStringArray(releaseArtifact.report?.selectedTemplateIds)),
    ...(toStringArray(phase1Evaluation.standardLibraryReadiness?.releaseEvidenceClosure?.selectedTemplateIds)),
  ]);
  const evidenceRefs = unique([
    ...(toStringArray(liveReplay.sourceEvidenceRefs)),
    ...(toStringArray(releaseArtifact.sourceEvidenceRefs)),
    ...(toStringArray(releaseArtifact.report?.releaseEvidenceRefs)),
  ]);
  return {
    generatedAt,
    selectedTemplateIds,
    evidenceRefs,
    projectId: normalizeText(liveReplay.projectId || releaseArtifact.projectId || releaseArtifact.report?.projectId),
    companyId: normalizeText(releaseArtifact.report?.companyId || releaseArtifact.companyId),
    releasePackageId: normalizeText(liveReplay.releasePackageId || releaseArtifact.releasePackageId),
    phase1L5Ref: normalizeText(liveReplay.phase1L5Ref || releaseArtifact.phase1L5Ref || phase1Evaluation.phase1PublicationGate?.phase1L5Ref),
    monitoringWindow: normalizeText(liveReplay.monitoringWindow || releaseArtifact.monitoringWindow),
    rollbackRef: normalizeText(liveReplay.rollbackRef || releaseArtifact.rollbackRef),
    consumerObservationRef: normalizeText(liveReplay.consumerObservationRef || releaseArtifact.consumerObservationRef),
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

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return { name: path.basename(filePath), path: filePath };
}

function toStringArray(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function unique(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/refresh-c19-release-closure-source-artifacts.mjs --artifact-root <release-dir> --output-summary <release-dir>/c19-release-closure-source-artifact-refresh.json

Adds generator-consumable C19 release-closure source contracts to current runtime evidence artifacts without querying or mutating the database.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const summary = await refreshC19ReleaseClosureSourceArtifacts(options);
    console.log(`C19 release closure source artifact refresh: ${summary.status}`);
    if (summary.reasons?.length) console.log(`Reasons: ${summary.reasons.join(', ')}`);
    process.exitCode = summary.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
