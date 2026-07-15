import { getClient, query } from '../database.js'
import { logger } from '../middleware/logger.js'
import type { WizardPostCommitDerivationState } from './wizardPostCommitDerivationRecoveryService.js'

const PROJECT_DRAFT_STATUS = 'wizard_drafting'
const WIZARD_GENERATION_STATE_QUEUED = 'queued'
const WIZARD_GENERATION_STATE_RUNNING = 'running'
const WIZARD_GENERATION_STATE_FAILED = 'failed'
const DEFAULT_STALE_WINDOW_MS = 15 * 60 * 1000
const DEFAULT_RECOVERY_LIMIT = 25

type WizardProjectRow = {
  id: string
  metadata?: unknown
}

type WizardPostCommitProjectRow = WizardProjectRow & {
  company_id: string
}

type WizardGenerationCleanupTarget = {
  projectId: string
  generationBatchId?: string | null
  generatedBaselineIds?: string[]
  createdTaskIds?: string[]
  materializedObjectIds?: string[]
  generatedAcceptancePlanIds?: string[]
  passedAcceptancePlanIds?: string[]
}

export type WizardGenerationRecoveryResult = {
  scanned: number
  recovered: number
  failed: number
  cutoff: string
  recoveredProjectIds: string[]
}

export type WizardPostCommitDerivationRecoveryResult = {
  scanned: number
  recovered: number
  pending: number
  failed: number
  recoveredProjectIds: string[]
  pendingProjectIds: string[]
  failedProjectIds: string[]
}

function readRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return {}
}

function readText(value: unknown) {
  return String(value ?? '').trim()
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => readText(item)).filter(Boolean)
}

function readGenerationBatchId(metadata: Record<string, unknown>) {
  return readText(metadata.wizard_generation_batch_id || metadata.wizard_generation_last_failed_batch_id) || null
}

function mergeWizardAcceptancePlanIds(params: {
  generatedAcceptancePlanIds?: string[]
  passedAcceptancePlanIds?: string[]
}) {
  return [...new Set([
    ...(params.generatedAcceptancePlanIds ?? []),
    ...(params.passedAcceptancePlanIds ?? []),
  ])].filter(Boolean)
}

async function cleanupWizardGenerationArtifactsInTransaction(
  client: Awaited<ReturnType<typeof getClient>>,
  target: WizardGenerationCleanupTarget,
) {
  const baselineIds = [...new Set(target.generatedBaselineIds ?? [])].filter(Boolean)
  const taskIds = [...new Set(target.createdTaskIds ?? [])].filter(Boolean)
  const objectIds = [...new Set(target.materializedObjectIds ?? [])].filter(Boolean)
  const acceptancePlanIds = mergeWizardAcceptancePlanIds({
    generatedAcceptancePlanIds: target.generatedAcceptancePlanIds,
    passedAcceptancePlanIds: target.passedAcceptancePlanIds,
  })
  const generationBatchId = readText(target.generationBatchId)
  const acceptanceNotePattern = generationBatchId ? `%[wizard_generation_batch_id:${generationBatchId}]%` : ''

  if (baselineIds.length > 0 || generationBatchId) {
    await client.query(
      `DELETE FROM task_baselines
       WHERE project_id = $1
         AND status = 'draft'
         AND (
           id::text = ANY($3::text[])
           OR (
             $2::text <> ''
             AND COALESCE(governance_metadata, '{}'::jsonb)->'wizardGeneration'->>'generationBatchId' = $2
           )
         )`,
      [target.projectId, generationBatchId, baselineIds],
    )
  }

  if (acceptancePlanIds.length > 0 || taskIds.length > 0 || generationBatchId) {
    await client.query(
      `DELETE FROM project_entity_links link
       WHERE link.project_id = $1
         AND link.source_entity_type = 'acceptance_plan'
         AND link.target_entity_type = 'task'
         AND link.relation_type = 'covers_task'
         AND (
           link.source_entity_id = ANY($3::text[])
           OR link.target_entity_id = ANY($4::text[])
           OR (
             $2::text <> ''
             AND (
               COALESCE(link.metadata, '{}'::jsonb)->'wizardGeneration'->>'generationBatchId' = $2
               OR EXISTS (
                 SELECT 1
                   FROM acceptance_plans plan
                  WHERE plan.project_id = link.project_id
                    AND plan.id::text = link.source_entity_id
                    AND plan.notes LIKE $5
               )
               OR EXISTS (
                 SELECT 1
                   FROM tasks task
                  WHERE task.project_id = link.project_id
                    AND task.id::text = link.target_entity_id
                    AND (
                      COALESCE(task.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
                      OR COALESCE(task.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
                    )
               )
             )
           )
         )`,
      [target.projectId, generationBatchId, acceptancePlanIds, taskIds, acceptanceNotePattern],
    )
  }

  if (acceptancePlanIds.length > 0 || generationBatchId) {
    await client.query(
      `DELETE FROM acceptance_plans
       WHERE project_id = $1
         AND (
           id::text = ANY($3::text[])
           OR ($2::text <> '' AND notes LIKE $4)
         )`,
      [target.projectId, generationBatchId, acceptancePlanIds, acceptanceNotePattern],
    )
  }

  if (taskIds.length > 0) {
    await client.query(
      `DELETE FROM task_dependencies
       WHERE project_id = $1
         AND task_id::text = ANY($2::text[])`,
      [target.projectId, taskIds],
    )
    await client.query(
      `DELETE FROM task_dependencies
       WHERE project_id = $1
         AND dependency_task_id::text = ANY($2::text[])`,
      [target.projectId, taskIds],
    )
  }

  if (generationBatchId) {
    await client.query(
      `DELETE FROM task_dependencies td
       WHERE td.project_id = $1
         AND EXISTS (
           SELECT 1
             FROM tasks t
            WHERE t.project_id = td.project_id
              AND t.id = td.task_id
              AND (
                COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
                OR COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
              )
         )`,
      [target.projectId, generationBatchId],
    )
    await client.query(
      `DELETE FROM task_dependencies td
       WHERE td.project_id = $1
         AND EXISTS (
           SELECT 1
             FROM tasks t
            WHERE t.project_id = td.project_id
              AND t.id = td.dependency_task_id
              AND (
                COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
                OR COALESCE(t.standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
              )
         )`,
      [target.projectId, generationBatchId],
    )
  }

  if (taskIds.length > 0 || generationBatchId) {
    await client.query(
      `DELETE FROM tasks
       WHERE project_id = $1
         AND (
           id::text = ANY($3::text[])
           OR (
             $2::text <> ''
             AND (
               COALESCE(standard_task_metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
               OR COALESCE(standard_task_metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
             )
           )
         )`,
      [target.projectId, generationBatchId, taskIds],
    )
  }

  if (objectIds.length > 0 || generationBatchId) {
    await client.query(
      `DELETE FROM engineering_objects
       WHERE project_id = $1
         AND (
           id::text = ANY($3::text[])
           OR (
             $2::text <> ''
             AND (
               COALESCE(metadata, '{}'::jsonb)->>'wizardGenerationBatchId' = $2
               OR COALESCE(metadata, '{}'::jsonb)->>'wizard_generation_batch_id' = $2
             )
           )
         )`,
      [target.projectId, generationBatchId, objectIds],
    )
  }
}

// workspace-isolation-system-job-approved: stale-wizard scheduler passes a project row selected by the scoped recovery scan; every cleanup write uses row.id as project scope.
async function recoverWizardProject(row: WizardProjectRow, recoveredAt: string) {
  const metadata = readRecord(row.metadata)
  const generationBatchId = readGenerationBatchId(metadata)
  const client = await getClient()

  try {
    await client.query('BEGIN')

    await cleanupWizardGenerationArtifactsInTransaction(client, {
      projectId: row.id,
      generationBatchId,
      generatedBaselineIds: readStringArray(metadata.wizard_generated_baseline_ids),
      createdTaskIds: readStringArray(metadata.wizard_created_task_ids),
      materializedObjectIds: readStringArray(metadata.wizard_materialized_object_ids),
      generatedAcceptancePlanIds: readStringArray(metadata.wizard_generated_acceptance_plan_ids),
      passedAcceptancePlanIds: readStringArray(metadata.wizard_passed_acceptance_plan_ids),
    })

    await client.query(
      `UPDATE projects
          SET status = $2,
              default_wbs_generated = FALSE,
              metadata = (
                COALESCE(metadata, '{}'::jsonb)
                  - 'wizard_generation_state'
                  - 'wizard_generation_attempt_id'
                  - 'wizard_generation_started_at'
                  - 'wizard_generation_queued_at'
                  - 'wizard_generated_baseline_ids'
                  - 'wizard_generation_candidate_baseline'
                  - 'wizard_created_task_ids'
                  - 'wizard_materialized_object_ids'
                  - 'wizard_generated_acceptance_plan_ids'
                  - 'wizard_passed_acceptance_plan_ids'
               ) || $3::jsonb,
              updated_at = $4
        WHERE id = $1
          AND status = $2
          AND default_wbs_generated IS NOT TRUE`,
      [
        row.id,
        PROJECT_DRAFT_STATUS,
        JSON.stringify({
          wizard_generation_state: WIZARD_GENERATION_STATE_FAILED,
          wizard_generation_failed_at: recoveredAt,
          ...(generationBatchId ? { wizard_generation_last_failed_batch_id: generationBatchId } : {}),
          wizard_generation_last_error: 'Recovered a stale wizard generation attempt and reset the draft for a fresh retry.',
          wizard_generation_last_error_code: 'WIZARD_GENERATION_STALE_ATTEMPT_RECOVERED',
          wizard_generation_last_error_details: {
            recoverySource: 'wizard_generation_recovery_job',
            staleState: readText(metadata.wizard_generation_state) || null,
          },
        }),
        recoveredAt,
      ],
    )

    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    logger.error('[wizardGenerationRecovery] failed to recover stale wizard generation', {
      projectId: row.id,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  } finally {
    client.release()
  }
}

// workspace-isolation-system-job-approved: service-role scheduler intentionally scans stale wizard drafts across projects and recovers each project transactionally.
export async function recoverStaleWizardGenerationAttempts(options: {
  now?: Date
  staleWindowMs?: number
  limit?: number
} = {}): Promise<WizardGenerationRecoveryResult> {
  const now = options.now ?? new Date()
  const staleWindowMs = options.staleWindowMs ?? DEFAULT_STALE_WINDOW_MS
  const limit = Math.max(1, Math.trunc(options.limit ?? DEFAULT_RECOVERY_LIMIT))
  const cutoffDate = new Date(now.getTime() - staleWindowMs)
  const cutoff = cutoffDate.toISOString()
  const recoveredAt = now.toISOString()

  const result = await query(
    `SELECT id, metadata
       FROM projects
      WHERE status = $1
        AND default_wbs_generated IS NOT TRUE
        AND COALESCE(metadata->>'wizard_generation_state', '') = ANY($2::text[])
        AND COALESCE(
              NULLIF(metadata->>'wizard_generation_started_at', '')::timestamptz,
              NULLIF(metadata->>'wizard_generation_queued_at', '')::timestamptz,
              '1970-01-01T00:00:00.000Z'::timestamptz
            ) <= $3::timestamptz
      ORDER BY updated_at ASC
      LIMIT $4`,
    [
      PROJECT_DRAFT_STATUS,
      [WIZARD_GENERATION_STATE_RUNNING, WIZARD_GENERATION_STATE_QUEUED],
      cutoff,
      limit,
    ],
  )

  const rows = (result.rows ?? []) as WizardProjectRow[]
  const recoveredProjectIds: string[] = []
  let failed = 0

  for (const row of rows) {
    const recovered = await recoverWizardProject(row, recoveredAt)
    if (recovered) {
      recoveredProjectIds.push(row.id)
    } else {
      failed += 1
    }
  }

  return {
    scanned: rows.length,
    recovered: recoveredProjectIds.length,
    failed,
    cutoff,
    recoveredProjectIds,
  }
}

function readWizardPostCommitDerivationState(
  row: WizardPostCommitProjectRow,
): WizardPostCommitDerivationState | null {
  const metadata = readRecord(row.metadata)
  const state = readRecord(metadata.wizard_generation_post_commit_derivations)
  const stages = readRecord(state.stages)
  if (
    state.source !== 'wizard_post_commit_derivation_recovery'
    || readText(state.projectId) !== row.id
    || !readText(state.generationBatchId)
    || state.status !== 'pending'
    || Object.keys(readRecord(stages.critical_path)).length === 0
    || Object.keys(readRecord(stages.duration_evidence)).length === 0
  ) {
    return null
  }
  return state as unknown as WizardPostCommitDerivationState
}

function readWizardPostCommitRecoveryContext(row: WizardPostCommitProjectRow) {
  const metadata = readRecord(row.metadata)
  const scenario = readRecord(metadata.constructionOrganizationScenario)
  const summary = readRecord(metadata.constructionOrganizationScenarioSummary)
  const projectLevelSnapshot = readRecord(scenario.projectLevelSnapshot)
  return {
    scenario: Object.keys(scenario).length > 0 ? scenario : null,
    summary: Object.keys(summary).length > 0 ? summary : null,
    mode: readText(projectLevelSnapshot.mode) || null,
    actorId: readText(metadata.wizard_generation_actor_id) || null,
  }
}

// workspace-isolation-system-job-approved: the recovery scan selects completed wizard projects globally, then every state write is constrained by both project and company plus the immutable operation id.
export async function recoverPendingWizardPostCommitDerivations(options: {
  limit?: number
  now?: () => string
  runDerivations?: (input: {
    state: WizardPostCommitDerivationState
    derivations: Record<'critical_path' | 'duration_evidence', () => Promise<unknown>>
    persistState: (state: WizardPostCommitDerivationState) => Promise<void>
    now?: () => string
  }) => Promise<WizardPostCommitDerivationState>
  executors?: {
    refreshCriticalPath?: (params: {
      projectId: string
      generationBatchId: string
    }) => Promise<unknown>
    recordDurationEvidence?: (params: {
      projectId: string
      companyId?: string | null
      scenario: Record<string, unknown> | null
      summary: Record<string, unknown> | null
      mode?: string | null
      generationBatchId: string
      capturedAt: string
      actorId?: string | null
    }) => Promise<unknown>
  }
} = {}): Promise<WizardPostCommitDerivationRecoveryResult> {
  const limit = Math.max(1, Math.trunc(options.limit ?? DEFAULT_RECOVERY_LIMIT))
  const candidateResult = await query(
    `SELECT id, company_id, metadata
       FROM projects
      WHERE default_wbs_generated IS TRUE
        AND COALESCE(metadata->>'wizard_generation_state', '') = 'completed'
        AND COALESCE(metadata->'wizard_generation_post_commit_derivations'->>'status', '') = 'pending'
      ORDER BY updated_at ASC
      LIMIT $1`,
    [limit],
  )
  const rows = (candidateResult.rows ?? []) as WizardPostCommitProjectRow[]
  if (rows.length === 0) {
    return {
      scanned: 0,
      recovered: 0,
      pending: 0,
      failed: 0,
      recoveredProjectIds: [],
      pendingProjectIds: [],
      failedProjectIds: [],
    }
  }
  const runtime = options.runDerivations
    && options.executors?.refreshCriticalPath
    && options.executors?.recordDurationEvidence
    ? null
    : await import('./wizardPostCommitDerivationRecoveryService.js')
  const runDerivations = options.runDerivations ?? runtime!.runWizardPostCommitDerivations
  const refreshCriticalPath = options.executors?.refreshCriticalPath
    ?? runtime!.refreshWizardCriticalPathAfterCommit
  const recordDurationEvidence = options.executors?.recordDurationEvidence
    ?? runtime!.recordWizardConstructionOrganizationRuntimeEvidence
  const recoveredProjectIds: string[] = []
  const pendingProjectIds: string[] = []
  const failedProjectIds: string[] = []

  for (const row of rows) {
    const state = readWizardPostCommitDerivationState(row)
    if (!state || !readText(row.company_id)) {
      failedProjectIds.push(row.id)
      logger.error('[wizardGenerationRecovery] invalid post-commit derivation state', {
        projectId: row.id,
      })
      continue
    }
    const context = readWizardPostCommitRecoveryContext(row)
    try {
      const recoveredState = await runDerivations({
        state,
        now: options.now,
        persistState: async (nextState) => {
          const persistedAt = options.now?.() ?? new Date().toISOString()
          const persisted = await query(
            `UPDATE projects
                SET metadata = jsonb_set(
                      COALESCE(metadata, '{}'::jsonb),
                      '{wizard_generation_post_commit_derivations}',
                      $3::jsonb,
                      TRUE
                    ),
                    updated_at = $4
              WHERE id = $1
                AND company_id = $2
                AND COALESCE(metadata->'wizard_generation_post_commit_derivations'->>'operationId', '') = $5`,
            [row.id, row.company_id, JSON.stringify(nextState), persistedAt, state.operationId],
          )
          if (Number(persisted.rowCount ?? 0) !== 1) {
            throw new Error('Wizard post-commit derivation state changed or left the expected company scope')
          }
        },
        derivations: {
          critical_path: async () => refreshCriticalPath({
            projectId: row.id,
            generationBatchId: state.generationBatchId,
          }),
          duration_evidence: async () => recordDurationEvidence({
            projectId: row.id,
            companyId: row.company_id,
            scenario: context.scenario,
            summary: context.summary,
            mode: context.mode,
            generationBatchId: state.generationBatchId,
            capturedAt: state.createdAt,
            actorId: context.actorId,
          }),
        },
      })
      if (recoveredState.status === 'succeeded') {
        recoveredProjectIds.push(row.id)
      } else if (recoveredState.status === 'pending') {
        pendingProjectIds.push(row.id)
      } else {
        failedProjectIds.push(row.id)
      }
    } catch (error) {
      failedProjectIds.push(row.id)
      logger.error('[wizardGenerationRecovery] failed to recover post-commit derivations', {
        projectId: row.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    scanned: rows.length,
    recovered: recoveredProjectIds.length,
    pending: pendingProjectIds.length,
    failed: failedProjectIds.length,
    recoveredProjectIds,
    pendingProjectIds,
    failedProjectIds,
  }
}
