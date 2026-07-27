#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export const REQUIRED_SOURCE_ROLES = [
  'archived_live_replay',
  'c19_13_phase1_multinetwork_selection',
  'l5_canary_handoff',
];

const SOURCE_CANDIDATES = {
  archived_live_replay: [
    'c19-t2-rhythm-live-replay.json',
    'c19-t2-rhythm-live-replay-current.json',
  ],
  c19_13_phase1_multinetwork_selection: [
    'phase1-evaluation.json',
    'c19-phase1-evaluation.json',
    'c19-phase1-selection-gate.json',
    'phase1-selection-gate.json',
  ],
  l5_canary_handoff: [
    'l5-release-gate.json',
    'c19-phase1-l5-handoff.json',
    'phase1-l5.json',
  ],
};

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    artifactRoot: null,
    output: null,
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
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
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

export async function checkC19ReleaseClosureSources({
  artifactRoot,
  output = null,
  now = new Date(),
} = {}) {
  if (!artifactRoot) throw new Error('artifactRoot is required');
  const root = path.resolve(artifactRoot);
  const sources = {};

  for (const role of REQUIRED_SOURCE_ROLES) {
    sources[role] = await inspectSourceRole(root, role);
  }

  const readySources = Object.values(sources).filter((source) => source.usable);
  const missingSourceFileRoles = REQUIRED_SOURCE_ROLES.filter((role) => !sources[role].present);
  const invalidSourceFileRoles = REQUIRED_SOURCE_ROLES.filter((role) => sources[role].present && !sources[role].usable);
  const templateScope = buildTemplateScopeAssessment(sources);
  const reasonCodes = unique([
    missingSourceFileRoles.length > 0 ? 'release_closure_source_files_missing' : '',
    invalidSourceFileRoles.length > 0 ? 'release_closure_source_files_not_usable' : '',
    templateScope.status === 'mismatch' ? 'release_closure_template_scope_mismatch' : '',
  ]);
  const readyToGenerateReleaseClosure = reasonCodes.length === 0
    && readySources.length === REQUIRED_SOURCE_ROLES.length;

  const report = {
    schemaVersion: 'workbuddy-c19-release-closure-sources-preflight/v1',
    checkedAt: now.toISOString(),
    artifactRoot: root,
    status: readyToGenerateReleaseClosure ? 'ready' : 'blocked',
    readyToGenerateReleaseClosure,
    requiredRoles: REQUIRED_SOURCE_ROLES,
    missingSourceFileRoles,
    invalidSourceFileRoles,
    reasonCodes,
    sources,
    templateScope,
    generationCommand: 'npm run generate:t2-rhythm-release-closure --workspace=server -- --live-replay-evidence-file=<artifact-root>/c19-t2-rhythm-live-replay.json --phase1-selection-gate-file=<artifact-root>/phase1-evaluation.json --l5-release-gate-file=<artifact-root>/l5-release-gate.json --output-file=<artifact-root>/c19-release-closure-artifact.json',
    boundary: {
      dbMutation: false,
      liveMutation: false,
      note: 'Read-only source preflight. It checks whether the current artifact root contains generator-consumable C19 release-closure source evidence; it does not query DB, publish runtime, monitor, rollback, or write task dependencies.',
    },
  };

  if (output) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

async function inspectSourceRole(root, role) {
  const candidates = SOURCE_CANDIDATES[role] ?? [];
  const inspections = [];

  for (const name of candidates) {
    const filePath = path.join(root, name);
    const inspection = await inspectCandidate(filePath, name, role);
    inspections.push(inspection);
    if (inspection.present && inspection.usable) {
      return {
        role,
        present: true,
        usable: true,
        artifact: name,
        path: filePath,
        candidateNames: candidates,
        inspectedCandidates: inspections,
        selectedTemplateIds: inspection.selectedTemplateIds,
        evidenceRefCount: inspection.evidenceRefCount,
        status: inspection.status,
        reasonCodes: [],
      };
    }
  }

  const presentCandidates = inspections.filter((inspection) => inspection.present);
  const selected = presentCandidates[0] ?? null;
  return {
    role,
    present: presentCandidates.length > 0,
    usable: false,
    artifact: selected?.artifact ?? null,
    path: selected?.path ?? null,
    candidateNames: candidates,
    inspectedCandidates: inspections,
    selectedTemplateIds: selected?.selectedTemplateIds ?? [],
    evidenceRefCount: selected?.evidenceRefCount ?? 0,
    status: selected?.status ?? 'missing',
    reasonCodes: unique([
      presentCandidates.length === 0 ? `${role}_missing` : '',
      ...(selected?.reasonCodes ?? []),
    ]),
  };
}

async function inspectCandidate(filePath, artifact, role) {
  const base = {
    artifact,
    path: filePath,
    present: false,
    parseable: false,
    usable: false,
    status: 'missing',
    selectedTemplateIds: [],
    evidenceRefCount: 0,
    reasonCodes: [],
  };

  let document;
  try {
    const raw = await readFile(filePath, 'utf8');
    document = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error?.code === 'ENOENT') return base;
    return {
      ...base,
      present: true,
      status: 'invalid_json',
      reasonCodes: ['json_parse_failed'],
    };
  }

  const blockingStatusReasons = documentBlockedReasons(document);
  const source = extractRoleSource(document, role);
  const sourceAssessment = assessRoleSource(source, role);
  return {
    ...base,
    present: true,
    parseable: true,
    usable: blockingStatusReasons.length === 0 && sourceAssessment.usable,
    status: normalizeText(sourceAssessment.status || document?.status || 'unknown'),
    selectedTemplateIds: sourceAssessment.selectedTemplateIds,
    evidenceRefCount: sourceAssessment.evidenceRefCount,
    reasonCodes: unique([
      ...blockingStatusReasons,
      ...sourceAssessment.reasonCodes,
    ]),
  };
}

function extractRoleSource(document, role) {
  if (!document || typeof document !== 'object') return null;
  if (role === 'archived_live_replay') {
    if (document.releaseEvidenceInput) return document.releaseEvidenceInput;
    if (document.liveReplayReleaseEvidenceInput) return document.liveReplayReleaseEvidenceInput;
    if (document.source === 't2_live_replay_release_evidence_input') return document;
    return null;
  }
  if (role === 'c19_13_phase1_multinetwork_selection') {
    if (document.phase1MultiNetworkSelectionTrustGate) return document.phase1MultiNetworkSelectionTrustGate;
    if (document.source === 't2_rhythm_phase1_multinetwork_selection_trust_gate') return document;
    return null;
  }
  if (role === 'l5_canary_handoff') {
    if (document.l5ReleaseGate) return document.l5ReleaseGate;
    if (document.source === 't2_rhythm_standard_library_l5_release_gate') return document;
    return null;
  }
  return null;
}

function assessRoleSource(source, role) {
  if (!source || typeof source !== 'object') {
    return {
      usable: false,
      status: 'missing',
      selectedTemplateIds: [],
      evidenceRefCount: 0,
      reasonCodes: [`${role}_source_contract_missing`],
    };
  }
  if (role === 'archived_live_replay') return assessLiveReplaySource(source);
  if (role === 'c19_13_phase1_multinetwork_selection') return assessPhase1Source(source);
  if (role === 'l5_canary_handoff') return assessL5Source(source);
  return {
    usable: false,
    status: 'unknown',
    selectedTemplateIds: [],
    evidenceRefCount: 0,
    reasonCodes: [`${role}_unsupported`],
  };
}

function assessLiveReplaySource(source) {
  const selectedTemplateIds = toStringArray(source.selectedTemplateIds);
  const evidenceRefs = toStringArray(source.evidenceRefs);
  const trustGate = source.liveReplayTrustGate ?? {};
  const reasonCodes = unique([
    source.source === 't2_live_replay_release_evidence_input' ? '' : 'archived_live_replay_source_invalid',
    source.evidenceMode === 'archived_live_replay' ? '' : 'archived_live_replay_mode_invalid',
    source.canFeedReleaseEvidenceClosure === true ? '' : 'archived_live_replay_not_feedable',
    selectedTemplateIds.length > 0 ? '' : 'archived_live_replay_template_scope_missing',
    evidenceRefs.length > 0 ? '' : 'archived_live_replay_evidence_refs_missing',
    Array.isArray(source.blockingReasons) && source.blockingReasons.length > 0 ? 'archived_live_replay_blocking_reasons_present' : '',
    trustGate?.mutationBoundary && hasNoWriteBoundary(trustGate.mutationBoundary) ? '' : 'archived_live_replay_no_write_boundary_missing',
  ]);
  return {
    usable: reasonCodes.length === 0,
    status: source.canFeedReleaseEvidenceClosure === true ? 'feedable' : 'blocked',
    selectedTemplateIds,
    evidenceRefCount: evidenceRefs.length,
    reasonCodes,
  };
}

function assessPhase1Source(source) {
  const selectedTemplateIds = toStringArray(source.selectedTemplateIds);
  const evidenceRefs = toStringArray(source.selectionEvidenceRefs);
  const reasonCodes = unique([
    source.source === 't2_rhythm_phase1_multinetwork_selection_trust_gate' ? '' : 'phase1_selection_source_invalid',
    source.canTrustForRealScheduleSelection === true ? '' : 'phase1_selection_not_trusted_for_real_selection',
    selectedTemplateIds.length > 0 ? '' : 'phase1_selection_template_scope_missing',
    evidenceRefs.length > 0 ? '' : 'phase1_selection_evidence_refs_missing',
    Array.isArray(source.releaseBlockers) && source.releaseBlockers.length > 0 ? 'phase1_selection_release_blockers_present' : '',
    source.mutationBoundary && hasNoWriteBoundary(source.mutationBoundary) ? '' : 'phase1_selection_no_write_boundary_missing',
  ]);
  return {
    usable: reasonCodes.length === 0,
    status: normalizeText(source.status) || 'unknown',
    selectedTemplateIds,
    evidenceRefCount: evidenceRefs.length,
    reasonCodes,
  };
}

function assessL5Source(source) {
  const releasePackage = source.releasePackage ?? {};
  const selectedTemplateIds = toStringArray(releasePackage.selectedTemplateIds);
  const evidenceRefs = unique([
    ...toStringArray(releasePackage.evidenceRefs),
    ...toStringArray(releasePackage.rollbackTargetEvidenceRefs),
    ...toStringArray(releasePackage.consumerVerificationEvidenceRefs),
    ...toStringArray(releasePackage.impactMonitoringEvidenceRefs),
  ]);
  const reasonCodes = unique([
    source.source === 't2_rhythm_standard_library_l5_release_gate' ? '' : 'l5_canary_handoff_source_invalid',
    source.status === 'l5_canary_handoff_ready' ? '' : 'l5_canary_handoff_not_ready',
    source.canEnterCanary === true ? '' : 'l5_canary_handoff_cannot_enter_canary',
    source.canAutoPublishRuntimeExperience === false ? '' : 'l5_canary_handoff_auto_publish_not_allowed',
    source.canMaterializeTaskDependencies === false || source.canMaterializeTaskDependencies === undefined ? '' : 'l5_canary_handoff_auto_materialize_not_allowed',
    releasePackage.packageType === 't2_standard_library_canary_handoff' ? '' : 'l5_canary_handoff_package_type_invalid',
    releasePackage.releaseMode === 'canary_only' ? '' : 'l5_canary_handoff_release_mode_invalid',
    selectedTemplateIds.length > 0 ? '' : 'l5_canary_handoff_template_scope_missing',
    evidenceRefs.length > 0 ? '' : 'l5_canary_handoff_evidence_refs_missing',
    Array.isArray(source.releaseBlockers) && source.releaseBlockers.length > 0 ? 'l5_canary_handoff_release_blockers_present' : '',
    source.mutationBoundary && hasNoWriteBoundary(source.mutationBoundary) ? '' : 'l5_canary_handoff_no_write_boundary_missing',
  ]);
  return {
    usable: reasonCodes.length === 0,
    status: normalizeText(source.status) || 'unknown',
    selectedTemplateIds,
    evidenceRefCount: evidenceRefs.length,
    reasonCodes,
  };
}

function documentBlockedReasons(document) {
  if (!document || typeof document !== 'object') return ['json_document_missing'];
  return unique([
    document.status === 'blocked' ? 'artifact_status_blocked' : '',
    document.status === 'fail' ? 'artifact_status_fail' : '',
    document.templateOnly === true ? 'artifact_template_only' : '',
    document.generatedPackageOnly === true ? 'artifact_generated_package_only' : '',
    document.missingRuntimeApply === true ? 'artifact_missing_runtime_apply' : '',
    document.missingManualApproval === true ? 'artifact_missing_manual_approval' : '',
    document.missingImpactMonitoring === true ? 'artifact_missing_impact_monitoring' : '',
    document.missingRollbackOrSavedOutcome === true ? 'artifact_missing_rollback_or_saved_outcome' : '',
  ]);
}

function buildTemplateScopeAssessment(sources) {
  const usableEntries = REQUIRED_SOURCE_ROLES
    .map((role) => sources[role])
    .filter((source) => source?.usable);
  if (usableEntries.length !== REQUIRED_SOURCE_ROLES.length) {
    return {
      status: 'not-assessed',
      reason: 'all_source_roles_must_be_usable_before_template_scope_can_be_assessed',
      selectedTemplateIdsByRole: Object.fromEntries(
        REQUIRED_SOURCE_ROLES.map((role) => [role, sources[role]?.selectedTemplateIds ?? []]),
      ),
      commonTemplateIds: [],
      mismatchRoles: [],
    };
  }

  const selectedTemplateIdsByRole = Object.fromEntries(
    REQUIRED_SOURCE_ROLES.map((role) => [role, sources[role]?.selectedTemplateIds ?? []]),
  );
  const [firstRole] = REQUIRED_SOURCE_ROLES;
  const expected = new Set(selectedTemplateIdsByRole[firstRole]);
  const mismatchRoles = REQUIRED_SOURCE_ROLES.filter((role) => !sameSet(expected, selectedTemplateIdsByRole[role]));
  const commonTemplateIds = [...expected].filter((templateId) =>
    REQUIRED_SOURCE_ROLES.every((role) => selectedTemplateIdsByRole[role].includes(templateId)),
  );

  return {
    status: mismatchRoles.length === 0 && commonTemplateIds.length > 0 ? 'ready' : 'mismatch',
    selectedTemplateIdsByRole,
    commonTemplateIds,
    mismatchRoles,
  };
}

function hasNoWriteBoundary(boundary) {
  return boundary.writesTaskDependencies === false
    && boundary.writesPlanDates === false
    && boundary.writesCriticalPathFacts === false
    && boundary.writesSeed === false
    && boundary.writesBaseline === false
    && boundary.writesRuntimePublications === false;
}

function sameSet(expectedSet, values) {
  const actual = new Set(values);
  if (expectedSet.size !== actual.size) return false;
  for (const value of expectedSet) {
    if (!actual.has(value)) return false;
  }
  return true;
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
  node project-testing/tools/check-c19-release-closure-sources.mjs --artifact-root <release-dir> --output <release-dir>/c19-release-closure-sources-preflight.json

This read-only preflight checks whether the current release directory contains generator-consumable C19 release-closure source evidence.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const report = await checkC19ReleaseClosureSources(options);
    console.log(`C19 release closure sources: ${report.status}`);
    if (report.reasonCodes.length > 0) {
      console.log(`Reasons: ${report.reasonCodes.join(', ')}`);
    }
    process.exitCode = report.status === 'ready' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
