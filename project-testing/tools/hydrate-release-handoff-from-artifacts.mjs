#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoffFile: null,
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

    if (arg === '--handoff-file') {
      options.handoffFile = path.resolve(nextValue());
    } else if (arg === '--artifact-root') {
      options.artifactRoot = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
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

export async function hydrateReleaseHandoffFromArtifacts({
  handoffFile,
  artifactRoot,
  output = null,
  now = new Date(),
} = {}) {
  if (!handoffFile) throw new Error('handoffFile is required');
  if (!artifactRoot) throw new Error('artifactRoot is required');

  const handoff = await readJson(handoffFile);
  const root = path.resolve(artifactRoot);
  const mutations = [];
  const skipped = [];

  await hydrateC19({ handoff, root, mutations, skipped });
  await hydrateOldObject({ handoff, root, mutations, skipped });

  const report = {
    schemaVersion: 'workbuddy-release-handoff-hydration/v1',
    hydratedAt: now.toISOString(),
    handoffFile,
    artifactRoot: root,
    output,
    mutationBoundary: {
      liveMutation: false,
      dbMutation: false,
      note: 'This tool only writes a hydrated handoff declaration from local artifact refs. It does not run live commands or mutate DB state.',
    },
    counts: {
      mutations: mutations.length,
      skipped: skipped.length,
    },
    mutations,
    skipped,
    handoff,
  };

  if (output) {
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
    await writeFile(`${output}.hydration.json`, `${JSON.stringify(stripEmbeddedHandoff(report), null, 2)}\n`, 'utf8');
  }

  return report;
}

async function hydrateC19({ handoff, root, mutations, skipped }) {
  const gate = ensureGate(handoff, 'c19-runtime-publication-release-rollback');
  gate.release ??= {};

  const phase1Candidates = [
    'phase1-evaluation.json',
    'c19-phase1-evaluation.json',
    'c19-phase1-l5-handoff.json',
  ];
  const phase1Ref = await firstUsableArtifact(root, phase1Candidates);
  setOrSkip({
    scope: gate.release,
    field: 'phase1L5Ref',
    value: phase1Ref,
    artifactRoot: root,
    mutations,
    skipped,
    reason: 'phase1_l5_artifact_missing_or_blocked',
  });

  const releaseArtifactRef = await firstUsableArtifact(root, ['c19-release-closure-artifact.json']);
  setOrSkip({
    scope: gate.release,
    field: 'releaseClosureArtifactRef',
    value: releaseArtifactRef,
    artifactRoot: root,
    mutations,
    skipped,
    reason: 'release_closure_artifact_missing_or_blocked',
  });

  const summary = await readOptionalJson(path.join(root, 'c19-live-evidence-summary.json'));
  const rollbackRef = normalizeText(summary?.rollbackRef);
  setOrSkip({
    scope: gate.release,
    field: 'rollbackTargetRef',
    value: rollbackRef,
    artifactRoot: root,
    mutations,
    skipped,
    reason: 'rollback_ref_missing_or_blocked',
  });

  const monitoringWindow = normalizeText(summary?.monitoringWindow);
  setOrSkip({
    scope: gate.release,
    field: 'monitoringWindow',
    value: monitoringWindow,
    artifactRoot: root,
    refType: 'literal',
    mutations,
    skipped,
    reason: 'monitoring_window_missing_or_blocked',
  });
}

async function hydrateOldObject({ handoff, root, mutations, skipped }) {
  const gate = ensureGate(handoff, 'old-object-physical-drop-closeout');
  gate.db ??= {};

  const noSafeCandidateRef = await firstUsableArtifact(root, ['old-object-no-safe-candidate-closeout.json']);
  if (noSafeCandidateRef) {
    setOrSkip({
      scope: gate.db,
      field: 'noSafeCandidateCloseoutRef',
      value: noSafeCandidateRef,
      artifactRoot: root,
      mutations,
      skipped,
      reason: 'no_safe_candidate_closeout_missing_or_blocked',
    });
    skipped.push({
      field: 'candidateBundleRef',
      reason: 'no_safe_candidate_closeout_present',
    });
    skipped.push({
      field: 'ddlExportRef',
      reason: 'no_safe_candidate_closeout_present',
    });
    skipped.push({
      field: 'rollbackPlanRef',
      reason: 'no_safe_candidate_closeout_present',
    });
    skipped.push({
      field: 'migrationWindow',
      reason: 'no_safe_candidate_closeout_present',
    });
    return;
  }

  const candidateRef = await firstUsableArtifact(root, ['old-object-drop-candidates.json']);
  setOrSkip({
    scope: gate.db,
    field: 'candidateBundleRef',
    value: candidateRef,
    artifactRoot: root,
    mutations,
    skipped,
    reason: 'candidate_bundle_missing_or_blocked',
  });

  const ddlRef = await firstUsableSql(root, 'old-object-ddl-export.sql', /\bcreate\s+(table|view|function|trigger|policy|index)\b/i);
  setOrSkip({
    scope: gate.db,
    field: 'ddlExportRef',
    value: ddlRef,
    artifactRoot: root,
    mutations,
    skipped,
    reason: 'ddl_export_missing_or_placeholder',
  });

  const rollbackRef = await firstUsableSql(root, 'old-object-rollback-plan.sql', /\b(create|insert|alter|comment\s+on)\b/i);
  setOrSkip({
    scope: gate.db,
    field: 'rollbackPlanRef',
    value: rollbackRef,
    artifactRoot: root,
    mutations,
    skipped,
    reason: 'rollback_plan_missing_or_placeholder',
  });

  const summary = await readOptionalJson(path.join(root, 'old-object-physical-drop-summary.json'));
  setOrSkip({
    scope: gate.db,
    field: 'migrationWindow',
    value: usableEvidence(summary) ? normalizeText(summary?.migrationWindow) : '',
    artifactRoot: root,
    refType: 'literal',
    mutations,
    skipped,
    reason: 'migration_window_missing_or_blocked',
  });

  const backupRef = usableEvidence(summary) ? normalizeText(summary?.backupLocationRef) : '';
  if (backupRef) {
    setOrSkip({
      scope: gate.db,
      field: 'backupLocationRef',
      value: backupRef,
      artifactRoot: root,
      mutations,
      skipped,
      reason: 'backup_ref_missing_or_blocked',
    });
  }
}

function ensureGate(handoff, gateId) {
  handoff.gates ??= {};
  handoff.gates[gateId] ??= {};
  return handoff.gates[gateId];
}

function setOrSkip({
  scope,
  field,
  value,
  artifactRoot,
  refType = 'artifact',
  mutations,
  skipped,
  reason,
}) {
  const normalized = normalizeText(value);
  if (!normalized) {
    skipped.push({ field, reason });
    return;
  }
  const previous = scope[field] ?? '';
  scope[field] = refType === 'literal' ? normalized : toRepoRelativeRef(normalized, artifactRoot);
  mutations.push({
    field,
    previous,
    value: scope[field],
  });
}

async function firstUsableArtifact(root, names) {
  for (const name of names) {
    const filePath = path.join(root, name);
    const doc = await readOptionalJson(filePath);
    if (doc && usableEvidence(doc)) {
      return filePath;
    }
  }
  return '';
}

async function firstUsableSql(root, name, pattern) {
  const filePath = path.join(root, name);
  if (!await exists(filePath)) return '';
  const raw = await readFile(filePath, 'utf8');
  const executable = stripSqlComments(raw).trim();
  const normalized = normalizeToken(raw);
  if (!executable || normalized.includes('missing') || normalized.includes('not-authorized')) return '';
  return pattern.test(executable) ? filePath : '';
}

function usableEvidence(document) {
  if (!document || typeof document !== 'object') return false;
  if (document.status === 'blocked' || document.status === 'fail') return false;
  if (document.generatedPackageOnly === true) return false;
  if (document.noPhysicalDropExecuted === true && document.postDropSmokeMissing === true) return false;
  if (document.missingRuntimeApply === true) return false;
  if (document.missingManualApproval === true) return false;
  if (document.missingImpactMonitoring === true) return false;
  if (document.missingRollbackOrSavedOutcome === true) return false;
  if (document.ddlExportMissing === true || document.rollbackPlanMissing === true) return false;
  return true;
}

async function readOptionalJson(filePath) {
  try {
    return await readJson(filePath);
  } catch {
    return null;
  }
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function exists(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

function stripSqlComments(sql) {
  return String(sql ?? '')
    .replaceAll(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

function normalizeToken(value) {
  return String(value ?? '')
    .replaceAll(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replaceAll(/[_\s./:]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .toLowerCase();
}

function toRepoRelativeRef(value, artifactRoot) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    return value;
  }
  const resolved = path.isAbsolute(value) ? value : path.resolve(artifactRoot, value);
  return path.relative(REPO_ROOT, resolved).replace(/\\/g, '/');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function stripEmbeddedHandoff(report) {
  const { handoff, ...rest } = report;
  return rest;
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/hydrate-release-handoff-from-artifacts.mjs --handoff-file <handoff.json> --artifact-root <dir> --output <hydrated-handoff.json>

This tool only fills handoff refs from usable local artifacts. Blocked, placeholder, or incomplete evidence is skipped.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const report = await hydrateReleaseHandoffFromArtifacts(options);
    console.log(`Handoff hydration mutations: ${report.counts.mutations}`);
    console.log(`Handoff hydration skipped: ${report.counts.skipped}`);
    process.exitCode = 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
