#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_RELEASE_DIR = path.join(REPO_ROOT, 'project-testing/reports/release-v1.4.24-20260702-125254');
const DEFAULT_DIAGNOSTIC_FILE = path.join(DEFAULT_RELEASE_DIR, 'c19-t2-rhythm-live-replay.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_RELEASE_DIR, 'c19-t2-replay-metadata-remediation-plan.json');
const TEMPLATE_ID = 't2-residential-standard-floor-structure-rhythm-v1';
const LEGACY_COARSE_CODES = ['T2-STRUCTURE', 'T2-MEP', 'T2-FACADE', 'T2-FINISH'];
const MINIMUM_WORKFACES_PER_WINDOW = 3;
const DURATION_BEARING_WINDOWS = Array.from({ length: 6 }, (_, index) => `${TEMPLATE_ID}:W${String(index + 1).padStart(2, '0')}`);

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    diagnosticFile: DEFAULT_DIAGNOSTIC_FILE,
    output: DEFAULT_OUTPUT,
    projectId: null,
    dryRun: true,
    allowWrite: false,
    confirmStagingRemediation: false,
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

    if (arg === '--diagnostic-file') {
      options.diagnosticFile = path.resolve(nextValue());
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--project-id') {
      options.projectId = nextValue();
    } else if (arg === '--allow-write') {
      options.allowWrite = true;
      options.dryRun = false;
    } else if (arg === '--confirm-staging-remediation') {
      options.confirmStagingRemediation = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function planC19T2ReplayMetadataRemediation({
  diagnosticFile = DEFAULT_DIAGNOSTIC_FILE,
  output = DEFAULT_OUTPUT,
  projectId = null,
  dryRun = true,
  allowWrite = false,
  confirmStagingRemediation = false,
  now = new Date(),
} = {}) {
  if (allowWrite && !confirmStagingRemediation) {
    throw new Error('C19 T2 replay remediation execute mode requires --confirm-staging-remediation');
  }
  if (allowWrite) {
    throw new Error('C19 T2 replay remediation execute mode is intentionally not implemented in this planner; use the controlled writer after reviewing the dry-run plan.');
  }

  const diagnostic = await readJson(diagnosticFile);
  const effectiveProjectId = normalizeText(projectId) || normalizeText(diagnostic.projectId) || null;
  const taskUnknownCodes = diagnostic.checks?.taskActualReplay?.unknownWindowCodeSamples ?? [];
  const durationUnknownCodes = diagnostic.checks?.durationExperienceReplay?.unknownWindowCodeSamples ?? [];
  const unknownCodes = unique([...taskUnknownCodes, ...durationUnknownCodes]);
  const legacyCoarseCodeCount = unknownCodes.filter((code) => LEGACY_COARSE_CODES.includes(code)).length;
  const unsupportedCodes = unknownCodes.filter((code) => !LEGACY_COARSE_CODES.includes(code));
  const canPlan = Boolean(effectiveProjectId) && unknownCodes.length > 0 && unsupportedCodes.length === 0;
  const reasonCodes = unique([
    effectiveProjectId ? '' : 'project_id_required',
    unknownCodes.length > 0 ? '' : 'unknown_window_code_samples_required',
    unsupportedCodes.length === 0 ? '' : 'unsupported_unknown_window_codes_present',
    dryRun ? 'dry_run_only_not_evidence_of_repair' : '',
  ]);

  const updatePlan = canPlan ? buildUpdatePlan(effectiveProjectId) : [];
  const report = {
    schemaVersion: 'workbuddy-c19-t2-replay-metadata-remediation-plan/v1',
    status: canPlan ? 'dry-run-plan-ready' : 'blocked',
    generatedAt: now.toISOString(),
    diagnosticFile: repoRel(diagnosticFile),
    dryRun: true,
    liveMutation: false,
    dbMutation: false,
    projectId: effectiveProjectId,
    sourceDiagnostic: {
      status: diagnostic.status ?? null,
      taskUnknownWindowCodeSamples: taskUnknownCodes,
      durationUnknownWindowCodeSamples: durationUnknownCodes,
      replayCoverageStatus: diagnostic.replayCoverage?.status ?? null,
      sampleAvailabilityStatus: diagnostic.sampleAvailability?.status ?? null,
    },
    legacyCoarseCodes: LEGACY_COARSE_CODES,
    unknownCodes,
    unsupportedCodes,
    legacyCoarseCodeCount,
    targetTemplateId: TEMPLATE_ID,
    requiredDurationBearingWindows: DURATION_BEARING_WINDOWS,
    minimumWorkfacesPerWindow: MINIMUM_WORKFACES_PER_WINDOW,
    plannedUpdateCount: updatePlan.length,
    updatePlan,
    sqlPreview: canPlan ? buildSqlPreview(effectiveProjectId) : null,
    reasonCodes,
    nextActions: canPlan
      ? [
          'review_c19_t2_replay_metadata_remediation_plan',
          'run_controlled_live_closeout_writer_or_explicit_staging_remediation_with_write_approval',
          'rerun_diagnose_t2_rhythm_live_replay_after_write',
        ]
      : [
          'fix_project_id_or_unsupported_unknown_window_codes_before_remediation',
        ],
    mutationBoundary: {
      writesTasks: false,
      writesDurationExperienceSamples: false,
      writesRuntimePublications: false,
      writesTaskDependencies: false,
      note: 'Dry-run planner only. It does not connect to Supabase or mutate staging data.',
    },
  };

  await writeJson(output, report);
  return report;
}

export function buildUpdatePlan(projectId) {
  return DURATION_BEARING_WINDOWS.flatMap((windowCode, windowIndex) => (
    Array.from({ length: MINIMUM_WORKFACES_PER_WINDOW }, (_, workfaceIndex) => ({
      projectId,
      templateId: TEMPLATE_ID,
      windowCode,
      workfaceKey: `controlled-live-closeout:workface-${workfaceIndex + 1}:W${String(windowIndex + 1).padStart(2, '0')}`,
      taskOrdinal: (workfaceIndex * DURATION_BEARING_WINDOWS.length) + windowIndex + 1,
    }))
  ));
}

function buildSqlPreview(projectId) {
  return {
    warning: 'Preview only; do not paste into production without explicit staging remediation approval and cleanup/readback plan.',
    tasks: [
      'Select completed task ids for the project ordered by actual_start_date, actual_end_date, id.',
      'For the first 18 rows, merge standard_task_metadata with t2RhythmTemplateId, t2RhythmWindowCode, rhythmWindowCode, windowCode, workfaceKey, scopeKey.',
    ],
    durationExperienceSamples: [
      'For duration_experience_samples where project_id and task_id match those 18 tasks and metadata.workbuddyRealCloseoutSample=true, merge metadata with the same canonical T2 fields.',
      'If samples do not exist, run the controlled live closeout writer instead of manually inventing duration samples.',
    ],
    parameters: {
      projectId,
      templateId: TEMPLATE_ID,
      requiredRows: DURATION_BEARING_WINDOWS.length * MINIMUM_WORKFACES_PER_WINDOW,
    },
  };
}

function unique(values) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)));
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function repoRel(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/');
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/plan-c19-t2-replay-metadata-remediation.mjs --diagnostic-file <c19-t2-rhythm-live-replay.json> --output <plan.json>

Default mode is dry-run. This planner does not write Supabase data.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const report = await planC19T2ReplayMetadataRemediation(options);
    console.log(`C19 T2 replay remediation plan: ${report.status}`);
    console.log(`Planned updates: ${report.plannedUpdateCount}`);
    process.exitCode = report.status === 'blocked' ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
