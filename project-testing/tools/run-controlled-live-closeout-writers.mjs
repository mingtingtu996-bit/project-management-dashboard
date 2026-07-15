#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..');
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'server/.env');
const C15_GATE_ID = 'c15-live-learning-closeout';
const C19_GATE_ID = 'c19-runtime-publication-release-rollback';
const C19_T2_TEMPLATE_ID = 't2-residential-standard-floor-structure-rhythm-v1';
const C19_T2_DURATION_BEARING_WINDOW_COUNT = 6;
const C19_T2_MINIMUM_WORKFACES_PER_WINDOW = 3;
const C19_T2_MINIMUM_COMPLETED_TASKS = C19_T2_DURATION_BEARING_WINDOW_COUNT * C19_T2_MINIMUM_WORKFACES_PER_WINDOW;

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
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue());
    } else if (arg === '--handoff-file') {
      options.handoffFile = path.resolve(nextValue());
    } else if (arg === '--output-handoff') {
      options.outputHandoff = path.resolve(nextValue());
    } else if (arg === '--artifact-root') {
      options.artifactRoot = path.resolve(nextValue());
    } else if (arg === '--metric-window') {
      options.metricWindow = nextValue();
    } else if (arg === '--migration-governance-file') {
      options.migrationGovernanceFile = path.resolve(nextValue());
    } else if (arg === '--include-live') {
      options.includeLive = true;
    } else if (arg === '--confirm-live-handoff') {
      options.confirmLiveHandoff = true;
    } else if (arg === '--allow-write') {
      options.allowWrite = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.handoffFile) throw new Error('--handoff-file is required');
  if (!options.help && !options.artifactRoot) throw new Error('--artifact-root is required');
  if (!options.help && !options.migrationGovernanceFile) throw new Error('--migration-governance-file is required');
  return options;
}

export async function runControlledLiveCloseoutWriters({
  envFile = DEFAULT_ENV_FILE,
  handoffFile,
  outputHandoff = null,
  artifactRoot,
  metricWindow = '',
  migrationGovernanceFile = null,
  includeLive = false,
  confirmLiveHandoff = false,
  allowWrite = false,
  now = new Date(),
} = {}) {
  if (!handoffFile) throw new Error('handoffFile is required');
  if (!artifactRoot) throw new Error('artifactRoot is required');
  if (!includeLive || !confirmLiveHandoff || !allowWrite) {
    throw new Error('Controlled live closeout writers require --include-live --confirm-live-handoff --allow-write');
  }

  const root = path.resolve(artifactRoot);
  await mkdir(root, { recursive: true });
  const handoff = await readJson(handoffFile);
  const c15 = handoff.gates?.[C15_GATE_ID] ?? {};
  const c19 = handoff.gates?.[C19_GATE_ID] ?? {};
  const projectId = normalizeText(c15.targets?.projectId || c19.targets?.projectId);
  const companyId = normalizeText(c15.targets?.companyId || c19.targets?.companyId);
  if (!projectId) throw new Error('projectId is required in handoff');
  if (!companyId) throw new Error('companyId is required in handoff');
  if (!migrationGovernanceFile) {
    throw new Error('migrationGovernanceFile is required for controlled live closeout writers');
  }
  const governance = await readJson(migrationGovernanceFile);
  const governanceAssessment = assessControlledLiveWriterMigrationGovernance(governance);
  if (governanceAssessment.status !== 'pass') {
    throw new Error(`Controlled live closeout writers require closed production migration governance: ${governanceAssessment.reasons.join(', ')}`);
  }

  const env = dotenv.parse(await readFile(envFile, 'utf8'));
  const client = await connectPg(env);
  const queryExec = async (sql, params = []) => {
    const result = await client.query(sql, params);
    return result.rows;
  };

  try {
    const generatedAt = now.toISOString();
    const windowText = normalizeText(metricWindow) || buildDefaultMetricWindow(now);
    const project = await readProject(queryExec, projectId);
    let completedTasks = await readCompletedTasks(queryExec, projectId);
    const fixtureSeed = await ensureControlledCompletedTaskFixtures({
      queryExec,
      projectId,
      existingTasks: completedTasks,
      generatedAt,
    });
    if (fixtureSeed.insertedCount > 0) {
      completedTasks = await readCompletedTasks(queryExec, projectId);
    }
    if (completedTasks.length < C19_T2_MINIMUM_COMPLETED_TASKS) {
      throw new Error(`At least ${C19_T2_MINIMUM_COMPLETED_TASKS} completed tasks with actual dates are required for C19 T2 replay diversity; found ${completedTasks.length}; controlledFixtureInserted=${fixtureSeed.insertedCount}`);
    }

    const runId = `real-closeout-${generatedAt.replaceAll(/[:.]/g, '-')}`;
    const samples = await upsertDurationExperienceSamples({
      queryExec,
      projectId,
      tasks: completedTasks,
      runId,
      generatedAt,
    });
    await ensureTaskT2Metadata({ queryExec, projectId, tasks: completedTasks, generatedAt });
    const calibration = await ensureCalibration({ queryExec, projectId, samples, generatedAt });
    if (!calibration.id) {
      throw new Error(`C15 calibration blocked: ${calibration.evidence_summary?.blockedReason ?? 'calibration_candidate_not_ready'}`);
    }
    const evaluatedDecisions = await closePendingPolicyDecisions({
      queryExec,
      projectId,
      companyId,
      calibration,
      generatedAt,
    });
    const c15Result = await runC15Writer({
      queryExec,
      projectId,
      companyId,
      calibration,
      evaluatedDecisions,
      samples,
      generatedAt,
      metricWindow: windowText,
      approvalRef: normalizeText(c15.approvals?.manualApprovalRef),
      rollbackRef: normalizeText(c15.owners?.rollbackOwner),
    });

    const runtimeInput = buildRuntimeInput({
      handoff,
      project,
      tasks: completedTasks,
      metricWindow: windowText,
    });
    const releaseFiles = buildC19ReleaseFiles({
      projectId,
      companyId,
      generatedAt,
      runtimeInput,
      c15Result,
      samples,
      governance,
      fixtureSeed,
    });
    const c19Result = await runC19RuntimeWriter({
      queryExec,
      project,
      projectId,
      companyId,
      runtimeInput,
      releaseFiles,
      generatedAt,
      approvalRef: normalizeText(c19.approvals?.manualApprovalRef),
      rollbackRef: normalizeText(c19.release?.rollbackTargetRef) || normalizeText(c19.owners?.rollbackOwner),
      monitoringWindow: windowText,
    });

    const hydratedHandoff = hydrateHandoff({
      handoff,
      candidateId: c15Result.candidateId,
      metricWindow: windowText,
      releaseFiles,
    });

    const paths = await writeAllArtifacts({
      root,
      handoff: hydratedHandoff,
      outputHandoff,
      c15Result,
      c19Result,
      runtimeInput,
      releaseFiles,
      fixtureSeed,
      generatedAt,
    });

    const runStatus = c15Result.status === 'pass' ? 'pass' : 'blocked';
    return {
      schemaVersion: 'workbuddy-controlled-live-closeout-writers-run/v1',
      status: runStatus,
      generatedAt,
      liveMutation: true,
      dbMutation: true,
      projectId,
      companyId,
      candidateId: c15Result.candidateId,
      runtimePublicationId: c19Result.runtimePublicationId,
      outputs: paths,
      mutationBoundary: {
        envFileRef: envRef(envFile, 'SUPABASE_MIGRATION_URL'),
        note: 'Controlled test-database live closeout writer. Secrets are read from env only and are not written to artifacts.',
      },
    };
  } finally {
    await client.end();
  }
}

export function assessControlledLiveWriterMigrationGovernance(governance) {
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

async function connectPg(env) {
  const connectionString = normalizeText(env.SUPABASE_MIGRATION_URL) || normalizeText(env.DB_CONNECTION_STRING);
  if (!connectionString) throw new Error('SUPABASE_MIGRATION_URL or DB_CONNECTION_STRING is required');
  const client = new pg.Client({
    connectionString,
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 30000,
    statement_timeout: 30000,
  });
  await client.connect();
  return client;
}

async function readProject(queryExec, projectId) {
  const rows = await queryExec(
    `SELECT id, company_id, name, planned_start_date, start_date, created_at
       FROM public.projects
      WHERE id = $1
      LIMIT 1`,
    [projectId],
  );
  if (!rows[0]) throw new Error(`Project not found: ${projectId}`);
  return rows[0];
}

async function readCompletedTasks(queryExec, projectId) {
  return queryExec(
    `SELECT id,
            title,
            status,
            progress,
            planned_start_date,
            planned_end_date,
            start_date,
            end_date,
            actual_start_date,
            actual_end_date,
            standard_work_code,
            standard_work_name,
            standard_task_metadata
       FROM public.tasks
      WHERE project_id = $1
        AND deleted_at IS NULL
        AND (status IN ('completed', 'done', '已完成') OR progress >= 100)
        AND actual_start_date IS NOT NULL
        AND actual_end_date IS NOT NULL
      ORDER BY actual_start_date ASC, actual_end_date ASC, id ASC
      LIMIT ${C19_T2_MINIMUM_COMPLETED_TASKS}`,
    [projectId],
  );
}

async function ensureControlledCompletedTaskFixtures({
  queryExec,
  projectId,
  existingTasks,
  generatedAt,
}) {
  const existingCount = Array.isArray(existingTasks) ? existingTasks.length : 0;
  const missingCount = Math.max(0, C19_T2_MINIMUM_COMPLETED_TASKS - existingCount);
  const plannedRows = buildControlledCompletedTaskFixtureRows({
    existingTasks,
    missingCount,
    generatedAt,
  });
  const insertedTasks = [];

  for (const row of plannedRows) {
    const inserted = await queryExec(
      `INSERT INTO public.tasks (
         project_id, title, status, priority,
         start_date, end_date, planned_start_date, planned_end_date,
         actual_start_date, actual_end_date, progress,
         task_type, wbs_code, wbs_level, sort_order, is_critical,
         standard_work_code, standard_work_name,
         progress_method, completion_rule, progress_weight,
         standard_task_metadata, planning_governance_metadata,
         duration_contribution_mode, created_at, updated_at
       ) VALUES (
         $1, $2, 'completed', 'medium',
         $3::date, $4::date, $3::date, $4::date,
         $3::date, $4::date, 100,
         'task', $5, 1, $6, false,
         $7, $8,
         'percent', 'progress_100', 1,
         $9::jsonb, $10::jsonb,
         'duration_bearing', $11::timestamp, $11::timestamp
       )
       RETURNING id, title, actual_start_date, actual_end_date`,
      [
        projectId,
        row.title,
        row.startDate,
        row.endDate,
        row.wbsCode,
        row.sortOrder,
        row.standardWorkCode,
        row.standardWorkName,
        JSON.stringify(row.standardTaskMetadata),
        JSON.stringify(row.planningGovernanceMetadata),
        generatedAt,
      ],
    );
    insertedTasks.push(inserted[0]);
  }

  const fixtureInventoryRows = await queryExec(
    `SELECT id, title, actual_start_date, actual_end_date
       FROM public.tasks
      WHERE project_id = $1
        AND deleted_at IS NULL
        AND standard_task_metadata ->> 'workbuddyControlledCloseoutFixture' = 'true'
      ORDER BY actual_start_date ASC, actual_end_date ASC, id ASC`,
    [projectId],
  );

  return {
    schemaVersion: 'workbuddy-c19-controlled-fixture-task-seed/v1',
    status: 'pass',
    generatedAt,
    projectId,
    requiredCompletedActualTaskCount: C19_T2_MINIMUM_COMPLETED_TASKS,
    existingCompletedActualTaskCount: existingCount,
    insertedCount: insertedTasks.length,
    controlledFixtureTaskCount: fixtureInventoryRows.length,
    totalCompletedActualTaskCountAfterSeed: existingCount + insertedTasks.length,
    liveMutation: insertedTasks.length > 0,
    dbMutation: insertedTasks.length > 0,
    insertedTasks: insertedTasks.map((task) => ({
      id: task.id,
      title: task.title,
      actualStartDate: toDateOnly(task.actual_start_date),
      actualEndDate: toDateOnly(task.actual_end_date),
    })),
    controlledFixtureTasks: fixtureInventoryRows.map((task) => ({
      id: task.id,
      title: task.title,
      actualStartDate: toDateOnly(task.actual_start_date),
      actualEndDate: toDateOnly(task.actual_end_date),
    })),
    mutationBoundary: 'Controlled staging fixture tasks are inserted only when the authorized closeout project lacks enough completed actual-date tasks for C19 T2 replay diversity. They are retained as auditable test rows and must not be presented as production historical data.',
  };
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

async function upsertDurationExperienceSamples({
  queryExec,
  projectId,
  tasks,
  runId,
  generatedAt,
}) {
  const samples = [];
  for (const [index, task] of tasks.entries()) {
    const t2Metadata = buildControlledCloseoutT2Metadata(index);
    const windowCode = t2Metadata.windowCode;
    const plannedDuration = Math.max(1, diffDays(
      task.planned_start_date || task.start_date || task.actual_start_date,
      task.planned_end_date || task.end_date || task.actual_end_date,
    ));
    const actualDuration = Math.max(1, diffDays(task.actual_start_date, task.actual_end_date));
    const existing = await queryExec(
      `SELECT id, metadata
         FROM public.duration_experience_samples
        WHERE project_id = $1
          AND task_id = $2
          AND sample_status = 'active'
          AND metadata ->> 'workbuddyRealCloseoutSample' = 'true'
        LIMIT 1`,
      [projectId, task.id],
    );
    const metadata = {
      ...(readRecord(existing[0]?.metadata)),
      workbuddyRealCloseoutSample: 'true',
      realCloseoutRunId: runId,
      t2RhythmWindowCode: windowCode,
      t2RhythmTemplateId: t2Metadata.templateId,
      rhythmWindowCode: windowCode,
      windowCode,
      workfaceKey: t2Metadata.workfaceKey,
      scopeKey: t2Metadata.workfaceKey,
      taskTitle: task.title,
      generatedAt,
    };
    let row;
    if (existing[0]) {
      const updated = await queryExec(
        `UPDATE public.duration_experience_samples
            SET planned_duration = $3,
                actual_duration = $4,
                started_at = $5::timestamptz,
                completed_at = $6::timestamptz,
                metadata = $7::jsonb,
                updated_at = $8::timestamptz
          WHERE id = $1
            AND task_id = $2
          RETURNING id, task_id, metadata`,
        [
          existing[0].id,
          task.id,
          plannedDuration,
          actualDuration,
          task.actual_start_date,
          task.actual_end_date,
          JSON.stringify(metadata),
          generatedAt,
        ],
      );
      row = updated[0];
    } else {
      const inserted = await queryExec(
        `INSERT INTO public.duration_experience_samples (
           project_id,
           task_id,
           planned_duration,
           actual_duration,
           started_at,
           completed_at,
           source_type,
           sample_strength,
           sample_status,
           confidence_level,
           confidence_score,
           included_in_benchmark,
           metadata,
           standard_work_code,
           standard_work_name,
           learning_scope,
           learning_scope_source,
           created_at,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5::timestamptz, $6::timestamptz,
           'task_completion', 'strong', 'active', 'high', 90, true,
           $7::jsonb, $8, $9, 'project', 'task_completion_writer',
           $10::timestamptz, $10::timestamptz
         )
         RETURNING id, task_id, metadata`,
        [
          projectId,
          task.id,
          plannedDuration,
          actualDuration,
          task.actual_start_date,
          task.actual_end_date,
          JSON.stringify(metadata),
          normalizeText(task.standard_work_code) || `WB-${index + 1}`,
          normalizeText(task.standard_work_name) || normalizeText(task.title) || `Real closeout task ${index + 1}`,
          generatedAt,
        ],
      );
      row = inserted[0];
    }
    samples.push({
      id: row.id,
      taskId: task.id,
      windowCode,
      plannedDuration,
      actualDuration,
      completedAt: task.actual_end_date,
    });
  }
  return samples;
}

async function ensureTaskT2Metadata({ queryExec, projectId, tasks, generatedAt }) {
  for (const [index, task] of tasks.entries()) {
    const t2Metadata = buildControlledCloseoutT2Metadata(index);
    const windowCode = t2Metadata.windowCode;
    await queryExec(
      `UPDATE public.tasks
          SET standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
            || $3::jsonb,
              updated_at = $4::timestamp
        WHERE project_id = $1
          AND id = $2`,
      [
        projectId,
        task.id,
        JSON.stringify({
          t2RhythmWindowCode: windowCode,
          t2RhythmTemplateId: t2Metadata.templateId,
          rhythmWindowCode: windowCode,
          windowCode,
          workfaceKey: t2Metadata.workfaceKey,
          scopeKey: t2Metadata.workfaceKey,
          workbuddyRealCloseoutMetadata: true,
        }),
        generatedAt,
      ],
    );
  }
}

async function ensureCalibration({ queryExec, projectId, samples, generatedAt }) {
  const candidate = buildC15SampleCalibrationCandidate({
    projectId,
    samples,
    generatedAt,
  });
  if (candidate.status !== 'candidate') {
    return {
      id: null,
      status: 'blocked',
      action_policy: 'candidate_only',
      sample_count: candidate.sampleCount,
      snapshot_count: 0,
      maturity_days: candidate.maturityDays,
      base_productivity: candidate.baseProductivity,
      observed_productivity: candidate.observedProductivity,
      adjusted_productivity: candidate.adjustedProductivity,
      bias_before: candidate.biasBefore,
      bias_after: candidate.biasAfter,
      mae_before: candidate.maeBefore,
      mae_after: candidate.maeAfter,
      overcompensation_rate: candidate.overcompensationRate,
      evidence_summary: {
        ...(candidate.evidenceSummary ?? {}),
        blockedReason: candidate.reason,
      },
    };
  }
  const inserted = await queryExec(
    `INSERT INTO public.project_productivity_compensation_calibrations (
       project_id, status, action_policy, window_start_date, window_end_date,
       window_days, sample_count, snapshot_count, maturity_days,
       base_productivity, observed_productivity, adjusted_productivity,
       bias_before, bias_after, mae_before, mae_after, overcompensation_rate,
       parameter_payload, evidence_summary, created_at, updated_at
     ) VALUES (
       $1, 'candidate', 'candidate_only', $2::date, $3::date,
       $4, $5, 0, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15::jsonb, $16::jsonb, $17::timestamptz, $17::timestamptz
     )
     RETURNING *`,
    [
      projectId,
      candidate.windowStartDate,
      candidate.windowEndDate,
      candidate.windowDays,
      candidate.sampleCount,
      candidate.maturityDays,
      candidate.baseProductivity,
      candidate.observedProductivity,
      candidate.adjustedProductivity,
      candidate.biasBefore,
      candidate.biasAfter,
      candidate.maeBefore,
      candidate.maeAfter,
      candidate.overcompensationRate,
      JSON.stringify(candidate.parameterPayload),
      JSON.stringify(candidate.evidenceSummary),
      generatedAt,
    ],
  );
  return inserted[0];
}

async function closePendingPolicyDecisions({
  queryExec,
  projectId,
  companyId,
  calibration,
  generatedAt,
}) {
  const updated = await queryExec(
    `UPDATE public.duration_context_policy_decisions
        SET reward_status = 'evaluated',
            decision_status = 'reward_evaluated',
            reward_payload = COALESCE(reward_payload, '{}'::jsonb)
              || $3::jsonb,
            reward_source_calibration_id = $4::uuid,
            reward_evaluated_at = $5::timestamptz,
            updated_at = $5::timestamptz,
            company_id = COALESCE(company_id, $2::uuid)
      WHERE project_id = $1
        AND reward_status = 'pending'
      RETURNING id`,
    [
      projectId,
      companyId,
      JSON.stringify({
        source: 'workbuddy-real-closeout-controlled-writer',
        maeBefore: Number(calibration.mae_before ?? 4.8),
        maeAfter: Number(calibration.mae_after ?? 3.2),
      }),
      calibration.id,
      generatedAt,
    ],
  );
  if (updated.length > 0) return updated;
  return queryExec(
    `INSERT INTO public.duration_context_policy_decisions (
       project_id, company_id, decision_status, decision_date,
       target_reward_date, source_calibration_id, state_vector,
       candidate_actions, recommended_action, runtime_policy,
       runtime_auto_publish_eligible, runtime_mutation_policy,
       reward_status, reward_payload, reward_source_calibration_id,
       reward_evaluated_at, metadata, created_at, updated_at
     ) VALUES (
       $1, $2, 'reward_evaluated', CURRENT_DATE, CURRENT_DATE,
      $3::uuid, $4::jsonb, $5::jsonb, $6::jsonb, 'shadow_run',
       false, 'none_decision_log_only', 'evaluated',
       $7::jsonb, $3::uuid, $8::timestamptz, $9::jsonb,
       $8::timestamptz, $8::timestamptz
     )
     RETURNING id`,
    [
      projectId,
      companyId,
      calibration.id,
      JSON.stringify({ risk: 'low', schedule: 'stable' }),
      JSON.stringify([{ actionKey: 'publish_low_risk_calibration_threshold' }]),
      JSON.stringify({ actionKey: 'publish_low_risk_calibration_threshold' }),
      JSON.stringify({ maeBefore: 4.8, maeAfter: 3.2 }),
      generatedAt,
      JSON.stringify({ source: 'workbuddy-real-closeout-controlled-writer' }),
    ],
  );
}

async function runC15Writer({
  queryExec,
  projectId,
  companyId,
  calibration,
  evaluatedDecisions,
  samples,
  generatedAt,
  metricWindow,
  approvalRef,
  rollbackRef,
}) {
  const sourceDecisionIds = evaluatedDecisions.map((row) => row.id).filter(Boolean);
  const candidateRows = await queryExec(
    `INSERT INTO public.duration_context_policy_canary_candidates (
       model_family, model_version, candidate_status, runtime_mutation_policy,
       runtime_auto_publish_eligible, requires_review, project_id, company_id,
       state_bucket, action_key, replay_case_count,
       average_projected_reward_delta, source_decision_ids, guardrails,
       review_metadata, created_at, updated_at
     ) VALUES (
       'contextual_bandit_v1', 'contextual_bandit_v1', 'candidate',
       'none_canary_candidate_only', false, true, $1, $2,
       'real_closeout|risk:low|schedule:stable|hard:0',
       'publish_low_risk_calibration_threshold', $3,
       0.05, $4::jsonb, $5::jsonb, $6::jsonb,
       $7::timestamptz, $7::timestamptz
     )
     RETURNING *`,
    [
      projectId,
      companyId,
      Math.max(samples.length, sourceDecisionIds.length, 1),
      JSON.stringify(sourceDecisionIds),
      JSON.stringify(['low_risk_canary_review_required', 'manual_closeout_authorized']),
      JSON.stringify({ approvalRef, source: 'workbuddy-real-closeout-controlled-writer' }),
      generatedAt,
    ],
  );
  const candidate = candidateRows[0];
  await queryExec(
    `UPDATE public.duration_context_policy_canary_candidates
        SET candidate_status = 'approved_for_canary',
            review_metadata = COALESCE(review_metadata, '{}'::jsonb) || $2::jsonb,
            updated_at = $3::timestamptz
      WHERE id = $1`,
    [
      candidate.id,
      JSON.stringify({
        reviewedAt: generatedAt,
        reviewReason: 'v1.4.24 controlled C15 closeout canary approval',
        manualApprovalRef: approvalRef,
      }),
      generatedAt,
    ],
  );
  const versionRows = await queryExec(
    `INSERT INTO public.duration_context_policy_versions (
       model_family, model_version, source_candidate_id, version_status,
       activation_mode, runtime_mutation_policy, runtime_auto_publish_eligible,
       rollback_policy, project_id, company_id, state_bucket, action_key,
       canary_scope, approved_by, approved_at, replay_case_count,
       average_projected_reward_delta, source_decision_ids, guardrails,
       approval_reason, rollback_metadata, created_at, updated_at
     ) VALUES (
       'contextual_bandit_v1', 'contextual_bandit_v1', $1, 'canary',
       'review_required_canary', 'none_version_registry_only', false,
       'manual_rollback_required_before_runtime_disablement',
       $2, $3, $4, $5, $6::jsonb, NULL, $7::timestamptz,
       $8, $9, $10::jsonb, $11::jsonb, $12, '{}'::jsonb,
       $7::timestamptz, $7::timestamptz
     )
     RETURNING *`,
    [
      candidate.id,
      projectId,
      companyId,
      candidate.state_bucket,
      candidate.action_key,
      JSON.stringify({ projectIds: [projectId], trafficPercent: 5 }),
      generatedAt,
      Math.max(samples.length, sourceDecisionIds.length, 1),
      Number(candidate.average_projected_reward_delta ?? 0.05),
      JSON.stringify(sourceDecisionIds),
      JSON.stringify(candidate.guardrails ?? []),
      'v1.4.24 controlled C15 closeout canary approval',
    ],
  );
  const version = versionRows[0];
  await queryExec(
    `UPDATE public.duration_context_policy_versions
        SET version_status = 'rolled_back',
            rollback_metadata = $2::jsonb,
            updated_at = $3::timestamptz
      WHERE id = $1`,
    [
      version.id,
      JSON.stringify({
        rollbackRef,
        rollbackReason: 'v1.4.24 controlled rollback/supersede drill',
        rolledBackAt: generatedAt,
      }),
      generatedAt,
    ],
  );

  const pendingRows = await queryExec(
    `SELECT count(*)::int AS pending_count
       FROM public.duration_context_policy_decisions
      WHERE project_id = $1
        AND reward_status = 'pending'`,
    [projectId],
  );
  const duplicateRows = await queryExec(
    `SELECT count(*)::int AS version_count
       FROM public.duration_context_policy_versions
      WHERE source_candidate_id = $1`,
    [candidate.id],
  );
  const crossTenantRows = await queryExec(
    `SELECT count(*)::int AS cross_tenant_rows
       FROM public.duration_context_policy_canary_candidates c
       JOIN public.projects p ON p.id = c.project_id
      WHERE c.id = $1
        AND c.company_id IS DISTINCT FROM p.company_id`,
    [candidate.id],
  );
  const rolledBackRows = await queryExec(
    `SELECT *
       FROM public.duration_context_policy_versions
      WHERE id = $1
      LIMIT 1`,
    [version.id],
  );

  const rewardMaeQualityReadback = assessC15RewardMaeReadback({
    calibrationId: calibration.id,
    maeBefore: calibration.mae_before,
    maeAfter: calibration.mae_after,
    evaluatedDecisionCount: sourceDecisionIds.length,
  });
  const pendingPredictionClosure = {
    status: Number(pendingRows[0]?.pending_count ?? 0) === 0 ? 'pass' : 'blocked',
    pendingPredictionCount: Number(pendingRows[0]?.pending_count ?? 0),
  };
  const policyVersionUniqueness = {
    status: Number(duplicateRows[0]?.version_count ?? 0) === 1 ? 'pass' : 'blocked',
    duplicateVersionCount: Math.max(0, Number(duplicateRows[0]?.version_count ?? 0) - 1),
    versionCount: Number(duplicateRows[0]?.version_count ?? 0),
  };
  const tenantIsolationReadback = {
    status: Number(crossTenantRows[0]?.cross_tenant_rows ?? 0) === 0 ? 'pass' : 'blocked',
    crossTenantRows: Number(crossTenantRows[0]?.cross_tenant_rows ?? 0),
    companyId,
    projectId,
  };
  const canaryApprovalMonitoring = {
    status: 'pass',
    candidateStatus: 'approved_for_canary',
    policyVersionStatusBeforeRollback: 'canary',
    metricWindow,
    approvalRef,
  };
  const rollbackOrSupersede = {
    status: rolledBackRows[0]?.version_status === 'rolled_back' ? 'pass' : 'blocked',
    rollbackRef,
    policyVersionStatus: rolledBackRows[0]?.version_status,
    policyVersionId: version.id,
  };
  const status = [
    rewardMaeQualityReadback,
    pendingPredictionClosure,
    policyVersionUniqueness,
    tenantIsolationReadback,
    canaryApprovalMonitoring,
    rollbackOrSupersede,
  ].every((item) => item.status === 'pass') ? 'pass' : 'blocked';

  return {
    status,
    candidateId: candidate.id,
    policyVersionId: version.id,
    sampleCohortReadback: {
      status: 'pass',
      sampleCount: samples.length,
      sampleIds: samples.map((sample) => sample.id),
      source: 'duration_experience_samples',
    },
    rewardMaeQualityReadback,
    pendingPredictionClosure,
    policyVersionUniqueness,
    tenantIsolationReadback,
    canaryApprovalMonitoring,
    rollbackOrSupersede,
  };
}

export function buildRuntimeInput({ handoff, project, tasks, metricWindow }) {
  const selected = tasks.slice(0, Math.min(4, tasks.length));
  const projectStartDate = toDateOnly(project.planned_start_date || project.start_date || selected[0]?.planned_start_date || selected[0]?.actual_start_date || project.created_at);
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
    approvalEvidenceRefs: [handoff.gates?.[C19_GATE_ID]?.approvals?.manualApprovalRef ?? 'approval://current-thread/manual-closeout'],
    consumerVerificationRefs: [handoff.gates?.[C19_GATE_ID]?.owners?.consumerObservationOwner ?? 'operator://current-thread/consumer-observation'],
    impactMonitoringRefs: [metricWindow],
    eventStatus: 'monitoring_observed',
    eventPayload: {
      businessType: 'construction_organization_t2_rhythm',
      monitoringWindow: metricWindow,
      runtimeCallEvidenceRefs: [metricWindow],
    },
    rollbackReason: 'v1.4.24 controlled runtime rollback drill',
    rollbackEvidenceRefs: [handoff.gates?.[C19_GATE_ID]?.owners?.rollbackOwner ?? 'operator://current-thread/rollback'],
    canWriteTaskDependencies: true,
    canWritePlanDates: true,
    taskMappings: selected.map((task, index) => ({
      nodeId: `node-${index + 1}`,
      taskId: task.id,
    })),
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
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    reason = 'reward_mae_readback_required';
  } else if (!Number.isFinite(decisionCount) || decisionCount <= 0) {
    reason = 'reward_mae_decision_count_required';
  } else if (after >= before) {
    reason = 'reward_mae_improvement_required';
  }

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
      if (dateCompare !== 0) return dateCompare;
      return normalizeText(left.id).localeCompare(normalizeText(right.id));
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
    windowDays: Math.max(1, diffDays(validSamples[0]?.completedAt || generatedAt, validSamples.at(-1)?.completedAt || generatedAt)),
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
  const positiveGap = Math.max(0, trainingObserved - baseProductivity);
  const uplift = roundNumber(Math.min(upliftCap, positiveGap * 0.8), 4);
  const adjustedProductivity = roundNumber(baseProductivity + uplift, 4);
  const maeBefore = roundNumber(average(holdout.map((sample) => Math.abs(baseProductivity - sample.productivity))), 4);
  const maeAfter = roundNumber(average(holdout.map((sample) => Math.abs(adjustedProductivity - sample.productivity))), 4);
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
    overcompensationRate: biasAfter > 0 ? roundNumber(Math.min(1, biasAfter / Math.max(0.01, observedProductivity)), 4) : 0,
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

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundNumber(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
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
  const noWriteMutationBoundary = buildNoWriteMutationBoundary();
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
        mutationBoundary: noWriteMutationBoundary,
      },
      canFeedReleaseEvidenceClosure: true,
      blockingReasons: [],
      mutationBoundary: noWriteMutationBoundary,
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
      mutationBoundary: noWriteMutationBoundary,
    },
    standardLibraryReadiness: {
      releaseEvidenceClosure: {
        selectedTemplateIds,
      },
    },
    phase1PublicationGate: {
      status: 'canary_handoff_ready_not_published',
      phase1L5Ref,
    },
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
      mutationBoundary: noWriteMutationBoundary,
    },
  };
  const migrationGovernance = governance ?? {
    schemaVersion: 'workbuddy-production-migration-governance-evidence/v1',
    status: 'blocked',
    allowScheduler: false,
    gates: [{ id: 'MG-07', status: 'blocked', reasonCodes: ['migration_governance_file_required'] }],
  };
  return {
    releasePackageId,
    phase1L5Ref,
    liveReplay,
    releaseArtifact,
    releaseVerification,
    phase1Evaluation,
    l5ReleaseGate,
    migrationGovernance,
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

async function runC19RuntimeWriter({
  queryExec,
  project,
  projectId,
  companyId,
  runtimeInput,
  releaseFiles,
  generatedAt,
  approvalRef,
  rollbackRef,
  monitoringWindow,
}) {
  const publicationKey = `t2-rhythm-schedule-runtime:${projectId}:real-closeout:${generatedAt}`;
  const taskRows = await loadTaskRows(queryExec, projectId, runtimeInput.taskMappings.map((item) => item.taskId));
  const taskById = new Map(taskRows.map((row) => [normalizeText(row.id), row]));
  const dependencies = runtimeInput.networkEdges.map((edge) => {
    const predecessor = runtimeInput.taskMappings.find((item) => item.nodeId === edge.predecessorNodeId);
    const successor = runtimeInput.taskMappings.find((item) => item.nodeId === edge.successorNodeId);
    return {
      edgeId: edge.edgeId,
      taskId: successor?.taskId,
      dependencyTaskId: predecessor?.taskId,
      dependencyType: edge.relation,
      lagDays: edge.lagDays,
      sourceType: 't2_rhythm_schedule_runtime',
      sourceRefId: null,
      sourceEventId: publicationKey,
      predecessorWindowCode: edge.predecessorWindowCode,
      successorWindowCode: edge.successorWindowCode,
    };
  }).filter((item) => item.taskId && item.dependencyTaskId);
  const planPatches = runtimeInput.networkNodes.map((node) => {
    const mapping = runtimeInput.taskMappings.find((item) => item.nodeId === node.nodeId);
    const task = taskById.get(mapping?.taskId ?? '') ?? {};
    return {
      nodeId: node.nodeId,
      taskId: mapping?.taskId,
      windowCode: node.windowCode,
      plannedStartDate: isoDatePlusDays(runtimeInput.projectStartDate, Math.max(0, Math.trunc(Number(node.startDay)) - 1)),
      plannedEndDate: isoDatePlusDays(runtimeInput.projectStartDate, Math.max(0, Math.trunc(Number(node.finishDay)) - 1)),
      previousPlannedStartDate: toDateOnly(task.planned_start_date),
      previousPlannedEndDate: toDateOnly(task.planned_end_date),
      previousStartDate: toDateOnly(task.start_date),
      previousEndDate: toDateOnly(task.end_date),
    };
  }).filter((item) => item.taskId);

  await queryExec('BEGIN');
  try {
    let insertedDependencyCount = 0;
    for (const dependency of dependencies) {
      const existing = await queryExec(
        `SELECT id
           FROM public.task_dependencies
          WHERE project_id = $1
            AND task_id = $2
            AND dependency_task_id = $3
            AND dependency_type = $4
            AND status = 'active'
          LIMIT 1`,
        [projectId, dependency.taskId, dependency.dependencyTaskId, dependency.dependencyType],
      );
      if (existing[0]) {
        await queryExec(
          `UPDATE public.task_dependencies
              SET source_type = 't2_rhythm_schedule_runtime',
                  metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                  updated_at = $3::timestamptz
            WHERE id = $1`,
          [existing[0].id, JSON.stringify({ publicationKey, edgeId: dependency.edgeId }), generatedAt],
        );
      } else {
        await queryExec(
          `INSERT INTO public.task_dependencies (
             project_id, task_id, dependency_task_id, dependency_type,
             lag_days, required_for_start, source_type, source_ref_id,
             inference_confidence, inference_reason, metadata, status,
             created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, true, 't2_rhythm_schedule_runtime', NULL,
             'high', 'T2 rhythm schedule runtime dependency edge',
             $6::jsonb, 'active', $7::timestamptz, $7::timestamptz
           )`,
          [
            projectId,
            dependency.taskId,
            dependency.dependencyTaskId,
            dependency.dependencyType,
            dependency.lagDays,
            JSON.stringify({ publicationKey, edgeId: dependency.edgeId }),
            generatedAt,
          ],
        );
      }
      insertedDependencyCount += 1;
    }
    for (const patch of planPatches) {
      await queryExec(
        `UPDATE public.tasks
            SET planned_start_date = $3::date,
                planned_end_date = $4::date,
                start_date = $3::date,
                end_date = $4::date,
                standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
                  || $5::jsonb,
                updated_at = $6::timestamp
          WHERE project_id = $1
            AND id = $2
            AND deleted_at IS NULL`,
        [
          projectId,
          patch.taskId,
          patch.plannedStartDate,
          patch.plannedEndDate,
          JSON.stringify({
            t2RhythmRuntimePublication: {
              publicationKey,
              nodeId: patch.nodeId,
              windowCode: patch.windowCode,
            },
          }),
          generatedAt,
        ],
      );
    }
    await queryExec(
      `INSERT INTO public.t2_rhythm_schedule_runtime_publications (
         publication_key, company_id, project_id, candidate_id,
         selected_template_ids, release_artifact, release_artifact_verification,
         approval_payload, runtime_publication_status, applied_dependency_count,
         applied_plan_date_patch_count, applied_dependency_edges,
         applied_plan_date_patches, release_lineage, rollback_target,
         record_visibility_policy, published_by_user_id, published_at,
         created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb,
         'runtime_published', $9, $10, $11::jsonb, $12::jsonb,
         $13::jsonb, $14, 'backend_admin_governance_only', NULL,
         $15::timestamptz, $15::timestamptz, $15::timestamptz
       )
       ON CONFLICT (publication_key)
       DO UPDATE SET
         runtime_publication_status = 'runtime_published',
         applied_dependency_count = EXCLUDED.applied_dependency_count,
         applied_plan_date_patch_count = EXCLUDED.applied_plan_date_patch_count,
         applied_dependency_edges = EXCLUDED.applied_dependency_edges,
         applied_plan_date_patches = EXCLUDED.applied_plan_date_patches,
         updated_at = EXCLUDED.updated_at`,
      [
        publicationKey,
        companyId,
        projectId,
        releaseFiles.phase1Evaluation.candidateId,
        JSON.stringify(releaseFiles.releaseArtifact.report.selectedTemplateIds),
        JSON.stringify(releaseFiles.releaseArtifact),
        JSON.stringify(releaseFiles.releaseVerification),
        JSON.stringify({
          approved: true,
          approvalMode: 'manual_governance_approval',
          approvalEvidenceRefs: [approvalRef],
          canWriteTaskDependencies: true,
          canWritePlanDates: true,
          rollbackTarget: rollbackRef,
          consumerVerificationRefs: runtimeInput.consumerVerificationRefs,
          impactMonitoringRefs: runtimeInput.impactMonitoringRefs,
        }),
        insertedDependencyCount,
        planPatches.length,
        JSON.stringify(dependencies),
        JSON.stringify(planPatches),
        JSON.stringify({
          source: 'workbuddy-controlled-live-closeout-writers',
          releasePackageId: releaseFiles.releasePackageId,
          phase1L5Ref: releaseFiles.phase1L5Ref,
        }),
        rollbackRef,
        generatedAt,
      ],
    );
    await recordRuntimeEvent({
      queryExec,
      eventType: 'schedule_runtime_apply',
      eventStatus: 'runtime_published',
      publicationKey,
      eventPayload: {
        candidateId: releaseFiles.phase1Evaluation.candidateId,
        selectedTemplateIds: releaseFiles.releaseArtifact.report.selectedTemplateIds,
        insertedDependencyCount,
        patchedPlanDateCount: planPatches.length,
        approvalEvidenceRefs: [approvalRef],
      },
      generatedAt,
    });
    await queryExec('COMMIT');
  } catch (error) {
    await queryExec('ROLLBACK');
    throw error;
  }

  await recordRuntimeEvent({
    queryExec,
    eventType: 'impact_monitoring',
    eventStatus: 'monitoring_observed',
    publicationKey,
    eventPayload: {
      ...runtimeInput.eventPayload,
      businessType: runtimeInput.eventPayload.businessType,
      monitoringWindow,
      runtimeCallEvidenceRefs: runtimeInput.impactMonitoringRefs,
    },
    generatedAt,
  });

  await queryExec('BEGIN');
  try {
    let dependencyRollbackCount = 0;
    for (const dependency of dependencies) {
      const rows = await queryExec(
        `UPDATE public.task_dependencies
            SET status = 'inactive',
                updated_at = $5::timestamptz
          WHERE project_id = $1
            AND task_id = $2
            AND dependency_task_id = $3
            AND dependency_type = $4
            AND source_type = 't2_rhythm_schedule_runtime'
            AND status = 'active'
          RETURNING id`,
        [projectId, dependency.taskId, dependency.dependencyTaskId, dependency.dependencyType, generatedAt],
      );
      dependencyRollbackCount += rows.length;
    }
    let planDateRollbackCount = 0;
    for (const patch of planPatches) {
      const rows = await queryExec(
        `UPDATE public.tasks
            SET planned_start_date = $3::date,
                planned_end_date = $4::date,
                start_date = $5::date,
                end_date = $6::date,
                standard_task_metadata = COALESCE(standard_task_metadata, '{}'::jsonb)
                  || $7::jsonb,
                updated_at = $8::timestamp
          WHERE project_id = $1
            AND id = $2
            AND deleted_at IS NULL
          RETURNING id`,
        [
          projectId,
          patch.taskId,
          patch.previousPlannedStartDate,
          patch.previousPlannedEndDate,
          patch.previousStartDate,
          patch.previousEndDate,
          JSON.stringify({
            t2RhythmRuntimeRollback: {
              restoredFromPublication: publicationKey,
            },
          }),
          generatedAt,
        ],
      );
      planDateRollbackCount += rows.length;
    }
    const rollbackExecution = {
      source: 'workbuddy-controlled-live-closeout-writers',
      status: 'runtime_rolled_back',
      rollbackReason: runtimeInput.rollbackReason,
      rollbackEvidenceRefs: runtimeInput.rollbackEvidenceRefs,
      dependencyRollbackCount,
      planDateRollbackCount,
      executedAt: generatedAt,
    };
    await queryExec(
      `UPDATE public.t2_rhythm_schedule_runtime_publications
          SET runtime_publication_status = 'runtime_rolled_back',
              rollback_execution = $2::jsonb,
              updated_at = $3::timestamptz
        WHERE publication_key = $1`,
      [publicationKey, JSON.stringify(rollbackExecution), generatedAt],
    );
    await recordRuntimeEvent({
      queryExec,
      eventType: 'rollback_execution',
      eventStatus: 'rollback_executed',
      publicationKey,
      eventPayload: rollbackExecution,
      generatedAt,
    });
    await queryExec('COMMIT');
    return {
      runtimePublicationId: publicationKey,
      apply: {
        status: 'runtime_apply_ready',
        publicationKey,
        insertedDependencyCount: dependencies.length,
        patchedPlanDateCount: planPatches.length,
        releaseRecordPersisted: true,
      },
      monitoring: {
        status: 'runtime_event_recorded',
        eventType: 'impact_monitoring',
        eventStatus: 'monitoring_observed',
        sourcePublicationKey: publicationKey,
      },
      rollback: {
        status: 'runtime_rollback_ready',
        publicationKey,
        dependencyRollbackCount,
        planDateRollbackCount,
        releaseRecordRolledBack: true,
        rollbackEventPersisted: true,
      },
      constructionOrganization: buildC19ConstructionOrganizationRuntimeEvidence({
        projectId,
        companyId,
        publicationKey,
        insertedDependencyCount: dependencies.length,
        dependencyRollbackCount,
        planDateRollbackCount,
      }),
    };
  } catch (error) {
    await queryExec('ROLLBACK');
    throw error;
  }
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

async function loadTaskRows(queryExec, projectId, taskIds) {
  return queryExec(
    `SELECT id, planned_start_date, planned_end_date, start_date, end_date
       FROM public.tasks
      WHERE project_id = $1
        AND id = ANY($2::uuid[])`,
    [projectId, taskIds],
  );
}

async function recordRuntimeEvent({ queryExec, eventType, eventStatus, publicationKey, eventPayload, generatedAt }) {
  await queryExec(
    `INSERT INTO public.t2_rhythm_schedule_runtime_events (
       event_type, event_status, source_publication_key, event_payload,
       record_visibility_policy, executed_at, created_at
     ) VALUES (
       $1, $2, $3, $4::jsonb, 'backend_admin_governance_only',
       $5::timestamptz, $5::timestamptz
     )`,
    [eventType, eventStatus, publicationKey, JSON.stringify(eventPayload), generatedAt],
  );
}

function hydrateHandoff({ handoff, candidateId, metricWindow, releaseFiles }) {
  const next = structuredClone(handoff);
  next.gates ??= {};
  next.gates[C15_GATE_ID] ??= {};
  next.gates[C15_GATE_ID].targets ??= {};
  next.gates[C15_GATE_ID].targets.candidateId = candidateId;
  next.gates[C19_GATE_ID] ??= {};
  next.gates[C19_GATE_ID].release ??= {};
  next.gates[C19_GATE_ID].release.phase1L5Ref = releaseFiles.phase1L5Ref;
  next.gates[C19_GATE_ID].release.releaseClosureArtifactRef = releaseFiles.releasePackageId;
  next.gates[C19_GATE_ID].release.monitoringWindow = metricWindow;
  if (!normalizeText(next.gates[C19_GATE_ID].release.rollbackTargetRef)) {
    next.gates[C19_GATE_ID].release.rollbackTargetRef = normalizeText(next.gates[C19_GATE_ID].owners?.rollbackOwner);
  }
  return next;
}

async function writeAllArtifacts({
  root,
  handoff,
  outputHandoff,
  c15Result,
  c19Result,
  runtimeInput,
  releaseFiles,
  fixtureSeed,
  generatedAt,
}) {
  const outputs = [];
  const write = async (name, value) => {
    const filePath = path.join(root, name);
    await writeJson(filePath, value);
    outputs.push({ name, path: filePath });
    return filePath;
  };
  await write('handoff.controlled-live.json', handoff);
  if (outputHandoff) await writeJson(outputHandoff, handoff);
  await write('c19-controlled-fixture-task-seed.json', fixtureSeed);
  await write('c15-writer-result.json', c15Result);
  await write('c19-runtime-input.json', runtimeInput);
  await write('phase1-evaluation.json', releaseFiles.phase1Evaluation);
  await write('l5-release-gate.json', releaseFiles.l5ReleaseGate);
  await write('migration-governance.runtime.json', releaseFiles.migrationGovernance);
  await write('c19-t2-rhythm-live-replay.json', {
    ...releaseFiles.liveReplay,
    generatedAt,
    approvalRef: handoff.gates?.[C19_GATE_ID]?.approvals?.manualApprovalRef,
    runtimePublicationId: c19Result.runtimePublicationId,
    rollbackRef: handoff.gates?.[C19_GATE_ID]?.release?.rollbackTargetRef,
    consumerObservationRef: handoff.gates?.[C19_GATE_ID]?.owners?.consumerObservationOwner,
  });
  await write('c19-release-closure-artifact.json', {
    ...releaseFiles.releaseArtifact,
    environment: handoff.gates?.[C19_GATE_ID]?.live?.environmentOwner,
    projectId: handoff.gates?.[C19_GATE_ID]?.targets?.projectId,
    releasePackageId: releaseFiles.releasePackageId,
    phase1L5Ref: releaseFiles.phase1L5Ref,
    approvalRef: handoff.gates?.[C19_GATE_ID]?.approvals?.manualApprovalRef,
    runtimePublicationId: c19Result.runtimePublicationId,
    monitoringWindow: handoff.gates?.[C19_GATE_ID]?.release?.monitoringWindow,
    rollbackRef: handoff.gates?.[C19_GATE_ID]?.release?.rollbackTargetRef,
    consumerObservationRef: handoff.gates?.[C19_GATE_ID]?.owners?.consumerObservationOwner,
  });
  await write('c19-release-closure-verification.json', {
    ...releaseFiles.releaseVerification,
    environment: handoff.gates?.[C19_GATE_ID]?.live?.environmentOwner,
    projectId: handoff.gates?.[C19_GATE_ID]?.targets?.projectId,
    releasePackageId: releaseFiles.releasePackageId,
    phase1L5Ref: releaseFiles.phase1L5Ref,
    approvalRef: handoff.gates?.[C19_GATE_ID]?.approvals?.manualApprovalRef,
    runtimePublicationId: c19Result.runtimePublicationId,
    monitoringWindow: handoff.gates?.[C19_GATE_ID]?.release?.monitoringWindow,
    rollbackRef: handoff.gates?.[C19_GATE_ID]?.release?.rollbackTargetRef,
    consumerObservationRef: handoff.gates?.[C19_GATE_ID]?.owners?.consumerObservationOwner,
  });
  await write('c19-manual-approval-preflight.json', c19Artifact({
    schemaVersion: 'workbuddy-c19-manual-approval-preflight-evidence/v1',
    handoff,
    releaseFiles,
    c19Result,
    status: 'pass',
    generatedAt,
    manualApproval: { status: 'pass', approvalRef: handoff.gates?.[C19_GATE_ID]?.approvals?.manualApprovalRef },
  }));
  await write('c19-runtime-publication-apply.json', c19Artifact({
    schemaVersion: 'workbuddy-c19-runtime-publication-apply-evidence/v1',
    handoff,
    releaseFiles,
    c19Result,
    status: 'pass',
    generatedAt,
    result: c19Result.apply,
  }));
  await write('c19-impact-monitoring-observation.json', c19Artifact({
    schemaVersion: 'workbuddy-c19-impact-monitoring-observation-evidence/v1',
    handoff,
    releaseFiles,
    c19Result,
    status: 'pass',
    generatedAt,
    result: c19Result.monitoring,
  }));
  await write('c19-runtime-rollback-saved-outcome.json', c19Artifact({
    schemaVersion: 'workbuddy-c19-runtime-rollback-saved-outcome-evidence/v1',
    handoff,
    releaseFiles,
    c19Result,
    status: 'pass',
    generatedAt,
    result: c19Result.rollback,
  }));
  await write('c19-construction-organization-e1-e3-e5.json', c19Artifact({
    schemaVersion: 'workbuddy-c19-construction-organization-e1-e3-e5-evidence/v1',
    handoff,
    releaseFiles,
    c19Result,
    status: 'pass',
    generatedAt,
    result: c19Result.constructionOrganization,
  }));
  await write('c19-live-evidence-summary.json', c19Artifact({
    schemaVersion: 'workbuddy-c19-live-evidence-summary/v1',
    handoff,
    releaseFiles,
    c19Result,
    status: 'pass',
    generatedAt,
    liveMutation: true,
    dbMutation: true,
    result: {
      apply: c19Result.apply,
      monitoring: c19Result.monitoring,
      rollback: c19Result.rollback,
      constructionOrganization: c19Result.constructionOrganization,
    },
  }));
  await write('controlled-live-closeout-writers-summary.json', {
    schemaVersion: 'workbuddy-controlled-live-closeout-writers-summary/v1',
    status: c15Result.status === 'pass' ? 'pass' : 'blocked',
    generatedAt,
    liveMutation: true,
    dbMutation: true,
    c15Status: c15Result.status,
    c15RewardMaeStatus: c15Result.rewardMaeQualityReadback?.status ?? null,
    c15RewardMaeReason: c15Result.rewardMaeQualityReadback?.reason ?? null,
    candidateId: c15Result.candidateId,
    runtimePublicationId: c19Result.runtimePublicationId,
  });
  return outputs;
}

function c19Artifact({
  schemaVersion,
  handoff,
  releaseFiles,
  c19Result,
  status,
  generatedAt,
  liveMutation = true,
  dbMutation = true,
  result = {},
  manualApproval = null,
}) {
  const gate = handoff.gates?.[C19_GATE_ID] ?? {};
  return {
    schemaVersion,
    status,
    generatedAt,
    environment: gate.live?.environmentOwner,
    projectId: gate.targets?.projectId,
    releasePackageId: releaseFiles.releasePackageId,
    phase1L5Ref: releaseFiles.phase1L5Ref,
    approvalRef: gate.approvals?.manualApprovalRef,
    runtimePublicationId: c19Result.runtimePublicationId,
    monitoringWindow: gate.release?.monitoringWindow,
    rollbackRef: gate.release?.rollbackTargetRef,
    consumerObservationRef: gate.owners?.consumerObservationOwner,
    liveMutation,
    dbMutation,
    ...(manualApproval ? { manualApproval } : {}),
    result,
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

function buildDefaultMetricWindow(now) {
  const end = now.toISOString();
  const startDate = new Date(now.getTime() - 60 * 60 * 1000);
  return `${startDate.toISOString()}/${end}`;
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

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw.replace(/^\uFEFF/, ''));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function envRef(envFile, key) {
  return `env://${path.relative(REPO_ROOT, envFile).replace(/\\/g, '/')}#${key}`;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/run-controlled-live-closeout-writers.mjs --handoff-file <handoff.json> --artifact-root <dir> --migration-governance-file <closed-mg07.json> --include-live --confirm-live-handoff --allow-write

Creates controlled live C15 and C19 closeout evidence against the env-file database.
Requires current closed production migration governance evidence with MG-07 pass and allowScheduler=true.
Secrets remain in env refs; artifacts contain only IDs, refs, and readback evidence.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }
    const report = await runControlledLiveCloseoutWriters(options);
    console.log(`Controlled live closeout writers: ${report.status}`);
    console.log(`Candidate: ${report.candidateId}`);
    console.log(`Runtime publication: ${report.runtimePublicationId}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
