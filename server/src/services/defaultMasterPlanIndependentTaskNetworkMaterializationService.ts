import { getClient } from '../database.js'
import {
  createTasksInWizardBatch,
  type WizardBatchTaskCreateItem,
} from './taskWriteChainService.js'
import type { IndependentDefaultMasterPlanTaskNetworkPlan } from './defaultMasterPlanIndependentTaskNetworkService.js'

type TransactionClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows?: Array<Record<string, unknown>>; rowCount?: number }>
  release?: () => void
}

type CreatedTaskResult = {
  task: {
    id: string
    project_id: string
  }
  participantUnit?: unknown
}

export type IndependentDefaultMasterPlanTaskNetworkMaterializationInput = {
  projectId: string
  baselineId: string
  actorUserId: string
  plan: IndependentDefaultMasterPlanTaskNetworkPlan
  clientFactory?: () => Promise<TransactionClient>
  createTasks?: (
    items: WizardBatchTaskCreateItem[],
    actorUserId: string,
    options: Record<string, unknown>,
  ) => Promise<CreatedTaskResult[]>
  executedAt?: string
}

export type IndependentDefaultMasterPlanTaskNetworkMaterializationResult = {
  source: 'default_master_plan_independent_task_network_materialization'
  baselineId: string
  projectId: string
  createdTaskIds: string[]
  createdDependencyCount: number
  mappedCandidateItemCount: number
  auditLogId: string | null
  runtimePublicationCreated: false
  durationScheduleRealignmentApplied: false
  mutationBoundary: {
    writesTasks: true
    writesExistingTasks: false
    writesTaskDependencies: true
    writesRuntimePublication: false
    appliesDurationScheduleRealignment: false
  }
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function requireReadyPlan(plan: IndependentDefaultMasterPlanTaskNetworkPlan) {
  if (plan.status !== 'ready' || plan.blockers.length > 0 || plan.tasks.length === 0) {
    throw Object.assign(new Error('Independent default master-plan task network is not ready to materialize'), {
      code: 'INDEPENDENT_TASK_NETWORK_PLAN_NOT_READY',
      statusCode: 409,
    })
  }
}

function requireCreatedTaskIds(
  plan: IndependentDefaultMasterPlanTaskNetworkPlan,
  created: CreatedTaskResult[],
  projectId: string,
) {
  if (created.length !== plan.tasks.length) {
    throw Object.assign(new Error('Task creation count does not match independent network plan'), {
      code: 'INDEPENDENT_TASK_NETWORK_TASK_COUNT_MISMATCH',
      statusCode: 409,
    })
  }

  const createdByPlannedTaskId = new Map<string, string>()
  plan.tasks.forEach((taskPlan, index) => {
    const task = created[index]?.task
    if (!task?.id || task.project_id !== projectId) {
      throw Object.assign(new Error('Task creation returned an invalid project-scoped task'), {
        code: 'INDEPENDENT_TASK_NETWORK_TASK_SCOPE_INVALID',
        statusCode: 409,
      })
    }
    createdByPlannedTaskId.set(taskPlan.id, task.id)
  })
  return createdByPlannedTaskId
}

async function insertPlannedDependency(params: {
  client: TransactionClient
  projectId: string
  baselineId: string
  successorTaskId: string
  predecessorTaskId: string
  dependencyType: string
  lagDays: number
  successorBaselineItemId: string
  predecessorBaselineItemId: string
  executedAt: string
}) {
  await params.client.query(
    `INSERT INTO public.task_dependencies (
       project_id,
       task_id,
       dependency_task_id,
       dependency_type,
       lag_days,
       required_for_start,
       source_type,
       source_ref_id,
       inference_confidence,
       inference_reason,
       metadata,
       status,
       created_at,
       updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, true, 'template_generated', $6, 'medium', $7, $8::jsonb, 'active', $9::timestamptz, $9::timestamptz
     )
     ON CONFLICT (project_id, task_id, dependency_task_id, dependency_type)
     WHERE status = 'active'
     DO UPDATE SET
       lag_days = EXCLUDED.lag_days,
       required_for_start = EXCLUDED.required_for_start,
       source_ref_id = EXCLUDED.source_ref_id,
       inference_confidence = EXCLUDED.inference_confidence,
       inference_reason = EXCLUDED.inference_reason,
       metadata = EXCLUDED.metadata,
       updated_at = EXCLUDED.updated_at
     WHERE public.task_dependencies.source_type = 'template_generated'`,
    [
      params.projectId,
      params.successorTaskId,
      params.predecessorTaskId,
      params.dependencyType,
      params.lagDays,
      params.baselineId,
      'Approved independent default master-plan candidate dependency',
      JSON.stringify({
        source: 'default_master_plan_independent_task_network_materialization',
        baselineId: params.baselineId,
        successorBaselineItemId: params.successorBaselineItemId,
        predecessorBaselineItemId: params.predecessorBaselineItemId,
        writesExistingTasks: false,
      }),
      params.executedAt,
    ],
  )
}

async function mapCandidateItemToCreatedTask(params: {
  client: TransactionClient
  projectId: string
  baselineId: string
  candidateItemId: string
  taskId: string
  executedAt: string
}) {
  const result = await params.client.query(
    `UPDATE public.task_baseline_items
        SET source_task_id = $4::uuid,
            mapping_status = 'mapped',
            generation_metadata = COALESCE(generation_metadata, '{}'::jsonb)
              || $5::jsonb,
            updated_at = $6::timestamptz
      WHERE id = $1::uuid
        AND baseline_version_id = $2::uuid
        AND project_id = $3::uuid
        AND source_task_id IS NULL
        AND COALESCE(mapping_status, 'pending') = 'pending'
      RETURNING id`,
    [
      params.candidateItemId,
      params.baselineId,
      params.projectId,
      params.taskId,
      JSON.stringify({
        independentTaskMaterialization: {
          taskId: params.taskId,
          materializedAt: params.executedAt,
          writesExistingTasks: false,
        },
      }),
      params.executedAt,
    ],
  )
  if ((result.rows ?? []).length !== 1) {
    throw Object.assign(new Error('Candidate baseline item mapping guard rejected the write'), {
      code: 'CANDIDATE_BASELINE_MAPPING_GUARD_FAILED',
      statusCode: 409,
    })
  }
}

async function markBaselineMaterialized(params: {
  client: TransactionClient
  projectId: string
  baselineId: string
  actorUserId: string
  plan: IndependentDefaultMasterPlanTaskNetworkPlan
  taskIds: string[]
  executedAt: string
}) {
  const update = await params.client.query(
    `UPDATE public.task_baselines
        SET governance_metadata = COALESCE(governance_metadata, '{}'::jsonb)
              || $3::jsonb,
            updated_at = $4::timestamptz
      WHERE id = $1::uuid
        AND project_id = $2::uuid
        AND status = 'draft'
      RETURNING id`,
    [
      params.baselineId,
      params.projectId,
      JSON.stringify({
        independentTaskNetworkMaterialization: {
          materializedAt: params.executedAt,
          materializedBy: params.actorUserId,
          createdTaskCount: params.taskIds.length,
          createdDependencyCount: params.plan.dependencies.length,
          durationCalibration: params.plan.durationCalibration,
          runtimePublicationCreated: false,
          writesExistingTasks: false,
          writesTaskDependencies: true,
        },
      }),
      params.executedAt,
    ],
  )
  if ((update.rows ?? []).length !== 1) {
    throw Object.assign(new Error('Baseline is no longer an eligible draft for materialization'), {
      code: 'INDEPENDENT_TASK_NETWORK_BASELINE_GUARD_FAILED',
      statusCode: 409,
    })
  }
}

async function writeMaterializationAuditLog(params: {
  client: TransactionClient
  projectId: string
  baselineId: string
  actorUserId: string
  plan: IndependentDefaultMasterPlanTaskNetworkPlan
  taskIds: string[]
  executedAt: string
}): Promise<string | null> {
  const result = await params.client.query(
    `INSERT INTO public.change_logs (
       project_id,
       entity_type,
       entity_id,
       field_name,
       old_value,
       new_value,
       changed_by,
       changed_at,
       change_source,
       action_type,
       action_group,
       after_snapshot,
       metadata,
       visibility,
       retention_policy
     ) VALUES (
       $1::uuid, 'baseline', $2::uuid, 'independent_default_master_plan_task_network', NULL,
       'materialized_independent_task_network', $3::uuid, $4::timestamptz, 'manual_adjusted',
       'independent_default_master_plan_task_network_materialization', 'plan_materialization', $5::jsonb, $6::jsonb,
       'governance', 'project_lifecycle'
     ) RETURNING id`,
    [
      params.projectId,
      params.baselineId,
      params.actorUserId,
      params.executedAt,
      JSON.stringify({
        independentTaskNetworkMaterialization: {
          createdTaskIds: params.taskIds,
          createdDependencyCount: params.plan.dependencies.length,
          durationCalibration: params.plan.durationCalibration,
          runtimePublicationCreated: false,
          durationScheduleRealignmentApplied: false,
        },
      }),
      JSON.stringify({
        createdTaskCount: params.taskIds.length,
        createdDependencyCount: params.plan.dependencies.length,
        mappedCandidateItemCount: params.plan.candidateToTaskMappings.length,
        durationCalibration: params.plan.durationCalibration,
        mutationBoundary: {
          writesTasks: true,
          writesExistingTasks: false,
          writesTaskDependencies: true,
          writesRuntimePublication: false,
          appliesDurationScheduleRealignment: false,
        },
      }),
    ],
  )
  return text(result.rows?.[0]?.id) || null
}

export async function materializeIndependentDefaultMasterPlanTaskNetwork(
  input: IndependentDefaultMasterPlanTaskNetworkMaterializationInput,
): Promise<IndependentDefaultMasterPlanTaskNetworkMaterializationResult> {
  requireReadyPlan(input.plan)

  const projectId = text(input.projectId)
  const baselineId = text(input.baselineId)
  const actorUserId = text(input.actorUserId)
  if (!projectId || !baselineId || !actorUserId) {
    throw Object.assign(new Error('Project, baseline, and actor are required for independent task materialization'), {
      code: 'INDEPENDENT_TASK_NETWORK_IDENTITY_REQUIRED',
      statusCode: 400,
    })
  }

  const client = await (input.clientFactory ? input.clientFactory() : getClient())
  const createTasks = input.createTasks ?? createTasksInWizardBatch
  const executedAt = text(input.executedAt) || new Date().toISOString()

  try {
    await client.query('BEGIN')
    const createItems = input.plan.tasks.map((task) => ({
      clientRowId: task.sourceClientRowId,
      payload: {
        ...task.payload,
        created_by: actorUserId,
      },
    })) as WizardBatchTaskCreateItem[]
    const created = await createTasks(createItems, actorUserId, {
      transactionClient: client,
      deferPostCreateEffects: true,
      postCreateEffectReason: 'independent_default_master_plan_materialization',
      skipStandardInference: true,
    })
    const createdByPlannedTaskId = requireCreatedTaskIds(input.plan, created, projectId)
    const createdTaskIds = input.plan.tasks.map((task) => createdByPlannedTaskId.get(task.id) ?? '')

    for (const dependency of input.plan.dependencies) {
      const successorTaskId = createdByPlannedTaskId.get(dependency.taskId)
      const predecessorTaskId = createdByPlannedTaskId.get(dependency.dependencyTaskId)
      if (!successorTaskId || !predecessorTaskId) {
        throw Object.assign(new Error('Independent dependency does not resolve to a newly created task'), {
          code: 'INDEPENDENT_TASK_NETWORK_DEPENDENCY_MAPPING_FAILED',
          statusCode: 409,
        })
      }
      await insertPlannedDependency({
        client,
        projectId,
        baselineId,
        successorTaskId,
        predecessorTaskId,
        dependencyType: dependency.dependencyType,
        lagDays: dependency.lagDays,
        successorBaselineItemId: dependency.sourceSuccessorBaselineItemId,
        predecessorBaselineItemId: dependency.sourcePredecessorBaselineItemId,
        executedAt,
      })
    }

    for (const mapping of input.plan.candidateToTaskMappings) {
      const taskId = createdByPlannedTaskId.get(mapping.taskId)
      if (!taskId) {
        throw Object.assign(new Error('Candidate item does not resolve to a newly created task'), {
          code: 'INDEPENDENT_TASK_NETWORK_CANDIDATE_MAPPING_FAILED',
          statusCode: 409,
        })
      }
      await mapCandidateItemToCreatedTask({
        client,
        projectId,
        baselineId,
        candidateItemId: mapping.candidateItemId,
        taskId,
        executedAt,
      })
    }

    await markBaselineMaterialized({
      client,
      projectId,
      baselineId,
      actorUserId,
      plan: input.plan,
      taskIds: createdTaskIds,
      executedAt,
    })
    const auditLogId = await writeMaterializationAuditLog({
      client,
      projectId,
      baselineId,
      actorUserId,
      plan: input.plan,
      taskIds: createdTaskIds,
      executedAt,
    })
    await client.query('COMMIT')

    return {
      source: 'default_master_plan_independent_task_network_materialization',
      baselineId,
      projectId,
      createdTaskIds,
      createdDependencyCount: input.plan.dependencies.length,
      mappedCandidateItemCount: input.plan.candidateToTaskMappings.length,
      auditLogId,
      runtimePublicationCreated: false,
      durationScheduleRealignmentApplied: false,
      mutationBoundary: {
        writesTasks: true,
        writesExistingTasks: false,
        writesTaskDependencies: true,
        writesRuntimePublication: false,
        appliesDurationScheduleRealignment: false,
      },
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release?.()
  }
}
