#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_MATRIX_PATH = path.join(REPO_ROOT, 'project-testing/matrix/release-test-matrix.json');
const C15_GATE_ID = 'c15-live-learning-closeout';
const C15_REWARD_MAE_ARTIFACT = 'c15-reward-mae-quality-readback.json';
const C15_SUMMARY_ARTIFACT = 'c15-live-evidence-summary.json';
const C19_GATE_ID = 'c19-runtime-publication-release-rollback';
const C19_APPLY_ARTIFACT = 'c19-runtime-publication-apply.json';
const C19_MONITORING_ARTIFACT = 'c19-impact-monitoring-observation.json';
const C19_ROLLBACK_ARTIFACT = 'c19-runtime-rollback-saved-outcome.json';
const C19_CONSTRUCTION_ORGANIZATION_ARTIFACT = 'c19-construction-organization-e1-e3-e5.json';
const C19_SUMMARY_ARTIFACT = 'c19-live-evidence-summary.json';
const OLD_OBJECT_GATE_ID = 'old-object-physical-drop-closeout';
const OLD_OBJECT_NO_SAFE_CLOSEOUT = 'old-object-no-safe-candidate-closeout.json';
const OLD_OBJECT_FULL_DISCOVERY = 'old-object-candidate-discovery.all.json';
const OLD_OBJECT_NAME_HINT_DISCOVERY = 'old-object-candidate-discovery.json';
const OLD_OBJECT_GUARD = 'legacy-object-drop-guard.initial.json';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    gateId: null,
    evidenceRoot: null,
    matrixPath: DEFAULT_MATRIX_PATH,
    outputPath: null,
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

    if (arg === '--gate') {
      options.gateId = nextValue();
    } else if (arg === '--evidence-root') {
      options.evidenceRoot = path.resolve(nextValue());
    } else if (arg === '--matrix') {
      options.matrixPath = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.outputPath = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.gateId) {
    throw new Error('--gate is required');
  }

  if (!options.help && !options.evidenceRoot) {
    throw new Error('--evidence-root is required');
  }

  return options;
}

export async function loadMatrix(matrixPath = DEFAULT_MATRIX_PATH) {
  const raw = await readFile(matrixPath, 'utf8');
  const matrix = JSON.parse(raw);

  if (!Array.isArray(matrix.gateGroups)) {
    throw new Error(`Invalid matrix: gateGroups must be an array in ${matrixPath}`);
  }

  return matrix;
}

export async function validateReleaseEvidence({
  gateId,
  evidenceRoot,
  matrixPath = DEFAULT_MATRIX_PATH,
  now = new Date(),
} = {}) {
  if (!gateId) {
    throw new Error('gateId is required');
  }

  if (!evidenceRoot) {
    throw new Error('evidenceRoot is required');
  }

  const matrix = await loadMatrix(matrixPath);
  const gate = matrix.gateGroups.find((group) => group.id === gateId);

  if (!gate) {
    throw new Error(`Unknown gate: ${gateId}`);
  }

  const root = path.resolve(evidenceRoot);
  const files = await listFiles(root);
  const evidenceCandidateFiles = files.filter((file) => !isReleaseValidationOutputFile(file));
  const filesByBasename = new Map(evidenceCandidateFiles.map((file) => [file.basename, file]));
  const policy = gate.artifactValidationPolicy ?? {};
  const noSafeCandidateMode = gateId === OLD_OBJECT_GATE_ID && filesByBasename.has(OLD_OBJECT_NO_SAFE_CLOSEOUT);
  const effectiveExpectedArtifacts = noSafeCandidateMode
    ? [OLD_OBJECT_NO_SAFE_CLOSEOUT, OLD_OBJECT_FULL_DISCOVERY]
    : gate.expectedArtifacts ?? [];
  const effectiveRequiredPatterns = noSafeCandidateMode
    ? []
    : policy.requiredArtifactPatterns ?? [];
  const effectiveRequiredMetadata = noSafeCandidateMode
    ? [
        'databaseTarget',
        'generatedAt',
        'candidateCount',
        'inspectedCount',
        'discoveryRef',
        'physicalDropExecuted',
        'boundary',
      ]
    : policy.requiredMetadata ?? [];
  const effectiveRejectIf = noSafeCandidateMode
    ? [
        'dry-run-only',
        'local-only',
        'synthetic-only',
        'manual-assisted-only',
        'retired-object-audit-only',
      ]
    : policy.rejectIf ?? [];
  const exactArtifacts = validateExactArtifacts(effectiveExpectedArtifacts, filesByBasename);
  const patternArtifacts = validatePatternArtifacts(effectiveRequiredPatterns, evidenceCandidateFiles);
  const evidenceFiles = selectEvidenceFiles({
    files: evidenceCandidateFiles,
    exactArtifacts: effectiveExpectedArtifacts,
    patternMatches: patternArtifacts.matches,
    gateId,
  });
  const jsonArtifacts = await readJsonArtifacts(evidenceFiles.filter((file) => file.basename.endsWith('.json')));
  const contentChecks = await validateGateSpecificContent({
    gateId,
    evidenceFiles,
    filesByBasename,
    noSafeCandidateMode,
  });
  const summaryContext = await readSummaryContext(filesByBasename.get('summary.json'));
  const metadataChecks = validateRequiredMetadata(effectiveRequiredMetadata, jsonArtifacts.documents);
  const rejectionChecks = validateRejectMarkers(effectiveRejectIf, jsonArtifacts.documents, summaryContext);
  const expectedJsonStatusChecks = validateExpectedJsonStatuses(jsonArtifacts.documents, new Set(effectiveExpectedArtifacts));
  const failures = [
    ...exactArtifacts.missing.map((item) => ({
      code: 'expected-artifact-missing',
      detail: item,
    })),
    ...patternArtifacts.missing.map((item) => ({
      code: 'required-pattern-missing',
      detail: item,
    })),
    ...metadataChecks.missing.map((item) => ({
      code: 'required-metadata-missing',
      detail: item,
    })),
    ...rejectionChecks.matches.map((item) => ({
      code: 'reject-marker-present',
      detail: item.marker,
      artifact: item.path,
    })),
    ...jsonArtifacts.errors.map((item) => ({
      code: 'json-parse-failed',
      detail: item.path,
      message: item.message,
    })),
    ...expectedJsonStatusChecks.failures,
    ...contentChecks.failures,
  ];

  return {
    schemaVersion: 'workbuddy-release-evidence-validation/v1',
    gateId: gate.id,
    gateTier: gate.tier,
    gateStatus: gate.status,
    closeoutTargets: gate.closeoutTargets ?? [],
    evidenceRoot: root,
    validatedAt: now.toISOString(),
    status: failures.length === 0 ? 'pass' : 'fail',
    counts: {
      filesScanned: files.length,
      validationOutputFilesExcluded: files.length - evidenceCandidateFiles.length,
      evidenceFiles: evidenceFiles.length,
      jsonArtifacts: jsonArtifacts.documents.length,
      expectedArtifacts: exactArtifacts.items.length,
      expectedArtifactsPresent: exactArtifacts.present.length,
      requiredPatterns: patternArtifacts.items.length,
      requiredPatternsMatched: patternArtifacts.present.length,
      requiredMetadata: metadataChecks.items.length,
      requiredMetadataPresent: metadataChecks.present.length,
      rejectMarkers: rejectionChecks.items.length,
      rejectMarkersMatched: rejectionChecks.matches.length,
      contentChecks: contentChecks.items.length,
      contentCheckFailures: contentChecks.failures.length,
      failures: failures.length,
    },
    checks: {
      expectedArtifacts: exactArtifacts,
      requiredArtifactPatterns: patternArtifacts,
      requiredMetadata: metadataChecks,
      rejectMarkers: rejectionChecks,
      expectedJsonStatuses: expectedJsonStatusChecks,
      jsonArtifacts,
      content: contentChecks,
      alternateCloseout: noSafeCandidateMode
        ? {
            mode: 'no_safe_candidate',
            artifact: OLD_OBJECT_NO_SAFE_CLOSEOUT,
            physicalDropExecuted: false,
          }
        : null,
    },
    failures,
  };
}

async function listFiles(root) {
  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) {
      return [];
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const results = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(root, fullPath).replaceAll(path.sep, '/');
        results.push({
          path: fullPath,
          relativePath,
          basename: path.basename(fullPath),
        });
      }
    }
  }

  await walk(root);
  return results;
}

function isReleaseValidationOutputFile(file) {
  const basename = file.basename.toLowerCase();
  return basename.endsWith('-evidence-validation.json')
    || basename.includes('-evidence-validation.')
    || basename.endsWith('-evidence-validation.md')
    || basename === 'closeout-decision.json'
    || basename === 'closeout-decision.md'
    || basename === 'closeout-status-index.json';
}

async function readJsonArtifacts(files) {
  const documents = [];
  const errors = [];

  for (const file of files) {
    try {
      const raw = await readFile(file.path, 'utf8');
      documents.push({
        path: file.relativePath,
        basename: file.basename,
        document: JSON.parse(raw),
      });
    } catch (error) {
      errors.push({
        path: file.relativePath,
        message: error.message,
      });
    }
  }

  return {
    documents,
    errors,
  };
}

async function validateGateSpecificContent({
  gateId,
  evidenceFiles,
  filesByBasename,
  noSafeCandidateMode = false,
}) {
  if (gateId === C15_GATE_ID) {
    return validateC15LearningCloseoutEvidence(filesByBasename);
  }

  if (gateId === C19_GATE_ID) {
    return validateC19RuntimePublicationEvidence(filesByBasename);
  }

  if (gateId !== OLD_OBJECT_GATE_ID) {
    return {
      items: [],
      passed: [],
      failures: [],
    };
  }

  if (noSafeCandidateMode) {
    return validateOldObjectNoSafeCandidateEvidence(filesByBasename);
  }

  return validateOldObjectSqlEvidence(evidenceFiles);
}

async function validateC15LearningCloseoutEvidence(filesByBasename) {
  const items = [
    'reward-mae-readback-present',
    'reward-mae-decision-count',
    'reward-mae-improvement',
    'live-db-mutation-recorded',
  ];
  const passed = [];
  const failures = [];
  const rewardFile = filesByBasename.get(C15_REWARD_MAE_ARTIFACT);
  const summaryFile = filesByBasename.get(C15_SUMMARY_ARTIFACT);
  const rewardDoc = await readJsonFileForContent(rewardFile, C15_REWARD_MAE_ARTIFACT, failures);
  const summaryDoc = await readJsonFileForContent(summaryFile, C15_SUMMARY_ARTIFACT, failures);
  const rewardReadbacks = [
    ...extractRewardMaeReadbacks(rewardDoc),
    ...extractRewardMaeReadbacks(summaryDoc),
  ];
  const usableReadback = rewardReadbacks.find((item) => {
    const maeBefore = Number(item?.maeBefore);
    const maeAfter = Number(item?.maeAfter);
    const evaluatedDecisionCount = Number(item?.evaluatedDecisionCount);
    return Number.isFinite(maeBefore)
      && Number.isFinite(maeAfter)
      && Number.isFinite(evaluatedDecisionCount)
      && evaluatedDecisionCount > 0;
  });

  expectEqual(failures, passed, {
    condition: Boolean(usableReadback),
    detail: 'reward-mae-readback-present',
    artifact: C15_REWARD_MAE_ARTIFACT,
    message: 'C-15 closeout requires numeric maeBefore, maeAfter, and evaluatedDecisionCount in reward/MAE readback evidence.',
  });

  const evaluatedDecisionCount = Number(usableReadback?.evaluatedDecisionCount);
  expectEqual(failures, passed, {
    condition: Number.isFinite(evaluatedDecisionCount) && evaluatedDecisionCount > 0,
    detail: 'reward-mae-decision-count',
    artifact: C15_REWARD_MAE_ARTIFACT,
    message: 'C-15 reward/MAE readback must evaluate at least one real decision.',
  });

  const maeBefore = Number(usableReadback?.maeBefore);
  const maeAfter = Number(usableReadback?.maeAfter);
  expectEqual(failures, passed, {
    condition: Number.isFinite(maeBefore) && Number.isFinite(maeAfter) && maeAfter < maeBefore,
    detail: 'reward-mae-improvement',
    artifact: C15_REWARD_MAE_ARTIFACT,
    message: 'C-15 learning closeout requires maeAfter to be strictly lower than maeBefore; flat or worse MAE only proves readback, not learning improvement.',
  });
  expectEqual(failures, passed, {
    condition: [rewardDoc, summaryDoc].every((doc) => doc?.liveMutation === true && doc?.dbMutation === true),
    detail: 'live-db-mutation-recorded',
    artifact: C15_SUMMARY_ARTIFACT,
    message: 'C-15 learning closeout requires liveMutation=true and dbMutation=true on reward/MAE and summary evidence; local readback alone cannot close the live gate.',
  });

  return {
    items,
    passed,
    failures,
  };
}

async function validateC19RuntimePublicationEvidence(filesByBasename) {
  const items = [
    'runtime-apply-ready',
    'impact-monitoring-recorded',
    'runtime-rollback-ready',
    'consumer-observation-archived',
    'runtime-mutation-recorded',
    'construction-organization-runtime-evidence',
  ];
  const passed = [];
  const failures = [];
  const applyDoc = await readJsonFileForContent(filesByBasename.get(C19_APPLY_ARTIFACT), C19_APPLY_ARTIFACT, failures);
  const monitoringDoc = await readJsonFileForContent(filesByBasename.get(C19_MONITORING_ARTIFACT), C19_MONITORING_ARTIFACT, failures);
  const rollbackDoc = await readJsonFileForContent(filesByBasename.get(C19_ROLLBACK_ARTIFACT), C19_ROLLBACK_ARTIFACT, failures);
  const constructionOrganizationDoc = await readJsonFileForContent(filesByBasename.get(C19_CONSTRUCTION_ORGANIZATION_ARTIFACT), C19_CONSTRUCTION_ORGANIZATION_ARTIFACT, failures);
  const summaryDoc = await readJsonFileForContent(filesByBasename.get(C19_SUMMARY_ARTIFACT), C19_SUMMARY_ARTIFACT, failures);

  expectEqual(failures, passed, {
    condition: hasStatus(applyDoc, 'runtime_apply_ready') || hasStatus(summaryDoc?.result?.apply, 'runtime_apply_ready'),
    detail: 'runtime-apply-ready',
    artifact: C19_APPLY_ARTIFACT,
    message: 'C-19 runtime publication closeout requires nested result.status=runtime_apply_ready in apply evidence or summary.result.apply.',
  });
  expectEqual(failures, passed, {
    condition: hasStatus(monitoringDoc, 'runtime_event_recorded') || hasStatus(summaryDoc?.result?.monitoring, 'runtime_event_recorded'),
    detail: 'impact-monitoring-recorded',
    artifact: C19_MONITORING_ARTIFACT,
    message: 'C-19 runtime publication closeout requires nested result.status=runtime_event_recorded in monitoring evidence or summary.result.monitoring.',
  });
  expectEqual(failures, passed, {
    condition: hasStatus(rollbackDoc, 'runtime_rollback_ready') || hasStatus(summaryDoc?.result?.rollback, 'runtime_rollback_ready'),
    detail: 'runtime-rollback-ready',
    artifact: C19_ROLLBACK_ARTIFACT,
    message: 'C-19 runtime publication closeout requires nested result.status=runtime_rollback_ready in rollback evidence or summary.result.rollback.',
  });
  expectEqual(failures, passed, {
    condition: hasNonEmptyText(applyDoc?.consumerObservationRef)
      && hasNonEmptyText(monitoringDoc?.consumerObservationRef)
      && hasNonEmptyText(rollbackDoc?.consumerObservationRef)
      && hasNonEmptyText(summaryDoc?.consumerObservationRef),
    detail: 'consumer-observation-archived',
    artifact: C19_SUMMARY_ARTIFACT,
    message: 'C-19 runtime publication closeout requires archived consumerObservationRef on apply, monitoring, rollback, and summary evidence.',
  });
  expectEqual(failures, passed, {
    condition: [applyDoc, monitoringDoc, rollbackDoc, summaryDoc].every((doc) => doc?.liveMutation === true && doc?.dbMutation === true),
    detail: 'runtime-mutation-recorded',
    artifact: C19_SUMMARY_ARTIFACT,
    message: 'C-19 runtime publication closeout requires liveMutation=true and dbMutation=true on runtime apply, monitoring, rollback, and summary evidence.',
  });
  expectEqual(failures, passed, {
    condition: hasConstructionOrganizationRuntimeEvidence(constructionOrganizationDoc)
      && hasStatus(summaryDoc?.result?.constructionOrganization, 'pass'),
    detail: 'construction-organization-runtime-evidence',
    artifact: C19_CONSTRUCTION_ORGANIZATION_ARTIFACT,
    message: 'C-19 construction organization closeout requires pass status plus E1/E3/E5 runtime evidence details, not metadata-only artifacts.',
  });

  return {
    items,
    passed,
    failures,
  };
}

function hasConstructionOrganizationRuntimeEvidence(value) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidates = [
    value.result,
    value.constructionOrganization,
    value.runtimeEvidence,
  ].filter(Boolean);

  return hasStatus(value, 'pass')
    && candidates.some((item) => hasEvidenceForKey(item, 'e1RuntimeEvidence'))
    && candidates.some((item) => hasEvidenceForKey(item, 'e3RuntimeEvidence'))
    && candidates.some((item) => hasEvidenceForKey(item, 'e5RuntimeEvidence'));
}

function hasEvidenceForKey(value, key) {
  if (Array.isArray(value)) {
    return value.some((item) => hasEvidenceForKey(item, key));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(value, key)) {
    const evidence = value[key];
    return evidence && typeof evidence === 'object'
      && (hasStatus(evidence, 'pass') || hasNonEmptyText(evidence.evidenceRef) || hasNonEmptyText(evidence.artifactRef));
  }

  return Object.values(value).some((item) => hasEvidenceForKey(item, key));
}

function hasStatus(value, status) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (normalizeToken(value.status) === normalizeToken(status)) {
    return true;
  }

  return hasStatus(value.result, status);
}

function hasNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function extractRewardMaeReadbacks(value) {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const direct = value.rewardMaeQualityReadback && typeof value.rewardMaeQualityReadback === 'object'
    ? [value.rewardMaeQualityReadback]
    : [];
  return [
    ...direct,
    ...extractRewardMaeReadbacks(value.result),
    ...extractRewardMaeReadbacks(value.liveLearningCloseoutEvidence),
  ];
}

async function validateOldObjectNoSafeCandidateEvidence(filesByBasename) {
  const items = [
    'no-safe-candidate-closeout',
    'full-catalog-discovery',
    'candidate-inventory-empty',
    'scan-inventory-nonempty',
    'no-mutation-boundary',
    'guard-supporting-evidence',
  ];
  const passed = [];
  const failures = [];
  const closeoutFile = filesByBasename.get(OLD_OBJECT_NO_SAFE_CLOSEOUT);
  const fullDiscoveryFile = filesByBasename.get(OLD_OBJECT_FULL_DISCOVERY);
  const nameHintDiscoveryFile = filesByBasename.get(OLD_OBJECT_NAME_HINT_DISCOVERY);
  const guardFile = filesByBasename.get(OLD_OBJECT_GUARD);
  const closeout = await readJsonFileForContent(closeoutFile, OLD_OBJECT_NO_SAFE_CLOSEOUT, failures);
  const fullDiscovery = await readJsonFileForContent(fullDiscoveryFile, OLD_OBJECT_FULL_DISCOVERY, failures);
  const nameHintDiscovery = nameHintDiscoveryFile
    ? await readJsonFileForContent(nameHintDiscoveryFile, OLD_OBJECT_NAME_HINT_DISCOVERY, failures)
    : null;
  const guard = guardFile
    ? await readJsonFileForContent(guardFile, OLD_OBJECT_GUARD, failures)
    : null;

  if (closeout) {
    expectEqual(failures, passed, {
      condition: closeout.schemaVersion === 'workbuddy-old-object-no-safe-candidate-closeout/v1',
      detail: 'no-safe-candidate-closeout',
      artifact: OLD_OBJECT_NO_SAFE_CLOSEOUT,
      message: 'Closeout artifact schemaVersion must be workbuddy-old-object-no-safe-candidate-closeout/v1.',
    });
    expectEqual(failures, passed, {
      condition: closeout.status === 'pass',
      detail: 'no-safe-candidate-closeout',
      artifact: OLD_OBJECT_NO_SAFE_CLOSEOUT,
      message: 'Closeout artifact status must be pass.',
    });
    expectEqual(failures, passed, {
      condition: closeout.closeoutMode === 'no_safe_candidate',
      detail: 'no-safe-candidate-closeout',
      artifact: OLD_OBJECT_NO_SAFE_CLOSEOUT,
      message: 'Closeout artifact closeoutMode must be no_safe_candidate.',
    });
    expectEmptyCandidateInventory({
      value: closeout,
      artifact: OLD_OBJECT_NO_SAFE_CLOSEOUT,
      failures,
      passed,
    });
    expectScanInventory({
      value: closeout,
      artifact: OLD_OBJECT_NO_SAFE_CLOSEOUT,
      failures,
      passed,
      allowMissingInspectedArray: true,
    });
    expectNoMutationBoundary({
      value: closeout,
      artifact: OLD_OBJECT_NO_SAFE_CLOSEOUT,
      failures,
      passed,
    });
    expectEqual(failures, passed, {
      condition: normalizeText(closeout.discoveryRef).endsWith(OLD_OBJECT_FULL_DISCOVERY)
        || normalizeText(closeout.fullCatalogDiscoveryRef).endsWith(OLD_OBJECT_FULL_DISCOVERY),
      detail: 'full-catalog-discovery',
      artifact: OLD_OBJECT_NO_SAFE_CLOSEOUT,
      message: `Closeout artifact must reference ${OLD_OBJECT_FULL_DISCOVERY}.`,
    });
  }

  if (fullDiscovery) {
    expectDiscoveryIsNoSafeCandidate({
      value: fullDiscovery,
      artifact: OLD_OBJECT_FULL_DISCOVERY,
      requireFullCatalog: true,
      failures,
      passed,
    });
  }

  if (nameHintDiscovery) {
    expectDiscoveryIsNoSafeCandidate({
      value: nameHintDiscovery,
      artifact: OLD_OBJECT_NAME_HINT_DISCOVERY,
      requireFullCatalog: false,
      failures,
      passed,
    });
  }

  if (!guard) {
    failures.push({
      code: 'content-check-failed',
      detail: 'guard-supporting-evidence',
      artifact: OLD_OBJECT_GUARD,
      message: 'Legacy drop guard supporting evidence is required for no_safe_candidate closeout.',
    });
  } else {
    const candidates = Array.isArray(guard.candidates) ? guard.candidates : [];
    expectEqual(failures, passed, {
      condition: candidates.length === 0,
      detail: 'guard-supporting-evidence',
      artifact: OLD_OBJECT_GUARD,
      message: 'Legacy drop guard supporting evidence must not include physical DROP candidates.',
    });
  }

  return {
    items,
    passed,
    failures,
  };
}

async function readJsonFileForContent(file, basename, failures) {
  if (!file) {
    failures.push({
      code: 'content-check-failed',
      detail: 'json-artifact',
      artifact: basename,
      message: 'Required JSON artifact is missing.',
    });
    return null;
  }

  try {
    const raw = await readFile(file.path, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    failures.push({
      code: 'content-check-failed',
      detail: 'json-artifact',
      artifact: file.relativePath,
      message: `Required JSON artifact cannot be parsed: ${error.message}`,
    });
    return null;
  }
}

function expectDiscoveryIsNoSafeCandidate({
  value,
  artifact,
  requireFullCatalog,
  failures,
  passed,
}) {
  expectEqual(failures, passed, {
    condition: value.schemaVersion === 'workbuddy-old-object-drop-candidate-discovery/v1',
    detail: 'full-catalog-discovery',
    artifact,
    message: 'Discovery schemaVersion must be workbuddy-old-object-drop-candidate-discovery/v1.',
  });
  expectEqual(failures, passed, {
    condition: value.status === 'no_safe_candidate',
    detail: 'full-catalog-discovery',
    artifact,
    message: 'Discovery status must be no_safe_candidate.',
  });
  if (requireFullCatalog) {
    expectEqual(failures, passed, {
      condition: value.minNameHint !== true && (!value.discoveryMode || value.discoveryMode === 'full_catalog'),
      detail: 'full-catalog-discovery',
      artifact,
      message: 'No-safe-candidate closeout requires full-catalog discovery, not a name-hint-only scan.',
    });
  }
  expectEmptyCandidateInventory({ value, artifact, failures, passed });
  expectScanInventory({ value, artifact, failures, passed });
  expectNoMutationBoundary({ value, artifact, failures, passed });
}

function expectEmptyCandidateInventory({
  value,
  artifact,
  failures,
  passed,
}) {
  const candidates = Array.isArray(value?.candidates) ? value.candidates : null;
  expectEqual(failures, passed, {
    condition: Number(value?.candidateCount) === 0,
    detail: 'candidate-inventory-empty',
    artifact,
    message: 'candidateCount must be 0 for no_safe_candidate closeout.',
  });
  expectEqual(failures, passed, {
    condition: Array.isArray(candidates) && candidates.length === 0,
    detail: 'candidate-inventory-empty',
    artifact,
    message: 'candidates must be an empty array for no_safe_candidate closeout.',
  });
}

function expectScanInventory({
  value,
  artifact,
  failures,
  passed,
  allowMissingInspectedArray = false,
}) {
  const inspectedCount = Number(value?.inspectedCount);
  const inspected = Array.isArray(value?.inspected) ? value.inspected : null;
  expectEqual(failures, passed, {
    condition: Number.isFinite(inspectedCount) && inspectedCount > 0,
    detail: 'scan-inventory-nonempty',
    artifact,
    message: 'inspectedCount must be greater than 0; an empty shell cannot prove no safe candidate.',
  });
  if (!allowMissingInspectedArray || inspected) {
    expectEqual(failures, passed, {
      condition: Array.isArray(inspected) && inspected.length === inspectedCount,
      detail: 'scan-inventory-nonempty',
      artifact,
      message: 'inspected array length must match inspectedCount.',
    });
  }
}

function expectNoMutationBoundary({
  value,
  artifact,
  failures,
  passed,
}) {
  expectEqual(failures, passed, {
    condition: value?.physicalDropExecuted === false,
    detail: 'no-mutation-boundary',
    artifact,
    message: 'physicalDropExecuted must be false for no_safe_candidate closeout.',
  });
  expectEqual(failures, passed, {
    condition: value?.dbMutation !== true && value?.liveMutation !== true
      && value?.boundary?.dbMutation === false && value?.boundary?.liveMutation === false,
    detail: 'no-mutation-boundary',
    artifact,
    message: 'No-safe-candidate closeout must explicitly record liveMutation=false and dbMutation=false.',
  });
}

function expectEqual(failures, passed, {
  condition,
  detail,
  artifact,
  message,
}) {
  if (condition) {
    passed.push({ detail, artifact });
    return;
  }
  failures.push({
    code: 'content-check-failed',
    detail,
    artifact,
    message,
  });
}

async function validateOldObjectSqlEvidence(files) {
  const expectations = [
    {
      basename: 'old-object-ddl-export.sql',
      kind: 'ddl-export',
      requiredPattern: /\bcreate\s+(table|view|function|trigger|policy|index)\b/i,
    },
    {
      basename: 'old-object-rollback-plan.sql',
      kind: 'rollback-plan',
      requiredPattern: /\b(create|insert|alter|comment\s+on)\b/i,
    },
    {
      basename: 'old-object-controlled-drop-migration.sql',
      kind: 'controlled-drop-migration',
      requiredPattern: /\bdrop\s+(table|view|function|trigger|policy|index)\b/i,
    },
  ];
  const filesByBasename = new Map(files.map((file) => [file.basename, file]));
  const passed = [];
  const failures = [];

  for (const expectation of expectations) {
    const file = filesByBasename.get(expectation.basename);
    if (!file) {
      failures.push({
        code: 'content-check-failed',
        detail: expectation.kind,
        artifact: expectation.basename,
        message: 'SQL artifact is missing.',
      });
      continue;
    }

    const raw = await readFile(file.path, 'utf8').catch(() => '');
    const executableSql = stripSqlComments(raw).trim();
    const normalized = normalizeToken(raw);
    if (!executableSql || normalized.includes('missing') || normalized.includes('not-authorized')) {
      failures.push({
        code: 'content-check-failed',
        detail: expectation.kind,
        artifact: file.relativePath,
        message: 'SQL artifact is empty, comment-only, or a missing-evidence placeholder.',
      });
      continue;
    }

    if (!expectation.requiredPattern.test(executableSql)) {
      failures.push({
        code: 'content-check-failed',
        detail: expectation.kind,
        artifact: file.relativePath,
        message: 'SQL artifact does not contain the expected DDL/rollback/drop structure.',
      });
      continue;
    }

    passed.push({
      detail: expectation.kind,
      artifact: file.relativePath,
    });
  }

  return {
    items: expectations.map((item) => item.kind),
    passed,
    failures,
  };
}

function stripSqlComments(sql) {
  return String(sql ?? '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function validateExactArtifacts(expectedArtifacts, filesByBasename) {
  const present = [];
  const missing = [];

  for (const item of expectedArtifacts) {
    if (filesByBasename.has(item)) {
      present.push(item);
    } else {
      missing.push(item);
    }
  }

  return {
    items: expectedArtifacts,
    present,
    missing,
  };
}

function validatePatternArtifacts(patterns, files) {
  const present = [];
  const missing = [];
  const matches = {};

  for (const pattern of patterns) {
    const regex = patternToRegex(pattern);
    const patternMatches = files
      .filter((file) => regex.test(file.basename) || regex.test(file.relativePath))
      .map((file) => file.relativePath);

    matches[pattern] = patternMatches;

    if (patternMatches.length > 0) {
      present.push(pattern);
    } else {
      missing.push(pattern);
    }
  }

  return {
    items: patterns,
    present,
    missing,
    matches,
  };
}

function selectEvidenceFiles({
  files,
  exactArtifacts,
  patternMatches,
  gateId,
}) {
  const selected = new Map();
  const exact = new Set(exactArtifacts);
  const matchedPaths = new Set(Object.values(patternMatches).flat());
  const manifestNames = new Set([
    'release-evidence-manifest.json',
    `${gateId}-evidence-manifest.json`,
  ]);

  for (const file of files) {
    if (exact.has(file.basename) || matchedPaths.has(file.relativePath) || manifestNames.has(file.basename)) {
      selected.set(file.relativePath, file);
    }
  }

  return [...selected.values()];
}

async function readSummaryContext(summaryFile) {
  if (!summaryFile) {
    return null;
  }

  try {
    const raw = await readFile(summaryFile.path, 'utf8');
    const summary = JSON.parse(raw);
    return {
      path: summaryFile.relativePath,
      dryRun: summary.dryRun === true,
      profile: summary.profile,
    };
  } catch {
    return null;
  }
}

function validateRequiredMetadata(requiredMetadata, documents) {
  const present = [];
  const missing = [];

  for (const key of requiredMetadata) {
    const artifacts = documents
      .filter((artifact) => hasMetadataValue(artifact.document, key))
      .map((artifact) => artifact.path);

    if (artifacts.length > 0) {
      present.push({ key, artifacts });
    } else {
      missing.push(key);
    }
  }

  return {
    items: requiredMetadata,
    present,
    missing,
  };
}

function validateRejectMarkers(markers, documents, summaryContext = null) {
  const matches = [];

  for (const marker of markers) {
    if (marker === 'dry-run-only' && summaryContext?.dryRun) {
      matches.push({
        marker,
        path: summaryContext.path,
      });
    }

    for (const artifact of documents) {
      if (matchesRejectMarker(marker, artifact.document)) {
        matches.push({
          marker,
          path: artifact.path,
        });
      }
    }
  }

  return {
    items: markers,
    matches,
  };
}

function validateExpectedJsonStatuses(documents, expectedArtifacts) {
  const checked = [];
  const failures = [];

  for (const artifact of documents) {
    if (!expectedArtifacts.has(artifact.basename)) {
      continue;
    }

    const status = normalizeToken(artifact.document?.status ?? '');
    if (!status) {
      continue;
    }

    checked.push({
      artifact: artifact.path,
      status,
    });

    if (['blocked', 'fail', 'failed', 'missing', 'unknown'].includes(status)) {
      failures.push({
        code: 'expected-json-status-not-pass',
        detail: status,
        artifact: artifact.path,
        message: 'Expected JSON artifacts cannot be blocked, failed, missing, or unknown.',
      });
    }
  }

  return {
    checked,
    failures,
  };
}

function hasMetadataValue(value, key) {
  if (Array.isArray(value)) {
    return value.some((item) => hasMetadataValue(item, key));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(value, key)) {
    const item = value[key];
    return item !== null
      && item !== undefined
      && item !== ''
      && !(Array.isArray(item) && item.length === 0);
  }

  return Object.values(value).some((item) => hasMetadataValue(item, key));
}

function matchesRejectMarker(marker, document) {
  const normalizedMarker = normalizeToken(marker);
  const tokens = collectEvidenceTokens(document);

  if (tokens.includes(normalizedMarker)) {
    return true;
  }

  if (normalizedMarker === 'dry-run-only') {
    return findTruthyByKey(document, 'dryRun') || tokens.includes('dry-run-only');
  }

  if (normalizedMarker === 'local-only') {
    return findTruthyByKey(document, 'localOnly')
      || tokens.includes('environment-local')
      || tokens.includes('source-type-local')
      || tokens.includes('mode-local')
      || tokens.includes('local-only');
  }

  if (normalizedMarker === 'synthetic-only') {
    return findTruthyByKey(document, 'synthetic')
      || findTruthyByKey(document, 'syntheticOnly')
      || tokens.includes('synthetic-only');
  }

  if (normalizedMarker === 'manual-assisted-only') {
    return findTruthyByKey(document, 'manualAssistedOnly')
      || tokens.includes('manual-assisted-only')
      || tokens.includes('evidence-boundary-manual-assisted-only')
      || tokens.includes('source-type-manual-assisted-only');
  }

  if (normalizedMarker === 'row-count-nonzero') {
    return findNumbersByKey(document, 'rowCount').some((value) => value > 0);
  }

  if (normalizedMarker === 'runtime-reference-present') {
    return findTruthyByKey(document, 'runtimeReferencePresent')
      || findArraysByKey(document, 'runtimeReferences').some((items) => items.length > 0);
  }

  if (normalizedMarker.endsWith('-missing')) {
    return findTruthyByKey(document, camelize(normalizedMarker));
  }

  return tokens.some((token) => token.includes(normalizedMarker));
}

function collectEvidenceTokens(value, key = '') {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectEvidenceTokens(item, key));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([entryKey, entryValue]) => {
      const tokens = [];
      if (entryValue === true) {
        tokens.push(normalizeToken(entryKey));
      }
      tokens.push(...collectEvidenceTokens(entryValue, entryKey));
      return tokens;
    });
  }

  if (typeof value === 'string') {
    return [
      normalizeToken(value),
      key ? normalizeToken(`${key}-${value}`) : normalizeToken(value),
    ];
  }

  if (typeof value === 'boolean' && value === true && key) {
    return [normalizeToken(key)];
  }

  return [];
}

function findNumbersByKey(value, key) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => findNumbersByKey(item, key));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([entryKey, entryValue]) => {
    const own = entryKey === key && typeof entryValue === 'number' ? [entryValue] : [];
    return [...own, ...findNumbersByKey(entryValue, key)];
  });
}

function findArraysByKey(value, key) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => findArraysByKey(item, key));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([entryKey, entryValue]) => {
    const own = entryKey === key && Array.isArray(entryValue) ? [entryValue] : [];
    return [...own, ...findArraysByKey(entryValue, key)];
  });
}

function findTruthyByKey(value, key) {
  if (Array.isArray(value)) {
    return value.some((item) => findTruthyByKey(item, key));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(([entryKey, entryValue]) => {
    return (entryKey === key && Boolean(entryValue)) || findTruthyByKey(entryValue, key);
  });
}

function camelize(token) {
  return token.replaceAll(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function patternToRegex(pattern) {
  const escaped = pattern
    .replaceAll(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll('*', '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function normalizeToken(value) {
  return String(value)
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/[_\s./:]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/validate-release-evidence.mjs --gate <gate-id> --evidence-root <dir> --output <summary.json>

This tool reads evidence artifacts only. It does not run live commands, mutate DB state, or execute release scripts.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const report = await validateReleaseEvidence({
      gateId: options.gateId,
      evidenceRoot: options.evidenceRoot,
      matrixPath: options.matrixPath,
    });

    if (options.outputPath) {
      await writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    console.log(`Evidence validation: ${report.status}`);
    console.log(`Gate: ${report.gateId}`);
    console.log(`Failures: ${report.counts.failures}`);
    process.exitCode = report.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
