import { createAndPersistAlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'
import {
  readDefaultMasterPlanVisibilityDecision,
  type DefaultMasterPlanVisibilityClass,
  type DefaultMasterPlanVisibilityDecision,
  type DefaultMasterPlanVisibilityRow,
} from './defaultMasterPlanVisibilityService.js'

export type DefaultMasterPlanVisibilityPmDecision = 'keep' | 'hide' | 'promote'

export type DefaultMasterPlanVisibilityFeedbackObservation = {
  stableCode: string
  title: string | null
  clientRowId: string
  pmDecision: DefaultMasterPlanVisibilityPmDecision
  desiredVisibleOnMasterPlan: boolean
  systemVisibleOnMasterPlan: boolean
  systemVisibilityClass: DefaultMasterPlanVisibilityClass
  protectedFromAutoHide: boolean
  policyStableCode: string
  policySource: string
}

export type DefaultMasterPlanVisibilityFeedback = {
  status: 'feedback_candidate_ready' | 'no_explicit_review' | 'no_actionable_feedback'
  projectId: string
  companyId: string | null
  businessType: string
  generationBatchId: string | null
  actorId: string | null
  source: 'explicit_preview_review' | 'task_adjustment'
  observations: DefaultMasterPlanVisibilityFeedbackObservation[]
  protectedDecisionRejectedCount: number
  mutationBoundary: 'candidate_only_no_runtime_or_task_mutation'
}

type BuildFeedbackInput = {
  projectId: string
  companyId?: string | null
  businessType: string
  generationBatchId?: string | null
  actorId?: string | null
  explicitReview: boolean
  generatedRows: readonly DefaultMasterPlanVisibilityRow[]
  retainedClientRowIds: readonly string[]
}

type TaskAdjustmentInput = {
  task: Record<string, unknown>
  companyId?: string | null
  businessType?: string
  actorId?: string | null
  adjustment: DefaultMasterPlanVisibilityPmDecision
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function nullableText(value: unknown) {
  return text(value) || null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function rowMetadata(row: Pick<DefaultMasterPlanVisibilityRow, 'values'>) {
  return record(row.values.standard_task_metadata ?? row.values.standardTaskMetadata)
}

function stableCodeOf(row: Pick<DefaultMasterPlanVisibilityRow, 'clientRowId' | 'values'>) {
  const metadata = rowMetadata(row)
  return text(row.values.standard_work_code ?? metadata.stableCode ?? row.clientRowId)
}

function titleOf(row: Pick<DefaultMasterPlanVisibilityRow, 'values'>) {
  return nullableText(row.values.title ?? row.values.name ?? row.values.standard_work_name)
}

function observationFor(
  row: DefaultMasterPlanVisibilityRow,
  decision: DefaultMasterPlanVisibilityDecision,
  pmDecision: DefaultMasterPlanVisibilityPmDecision,
): DefaultMasterPlanVisibilityFeedbackObservation {
  return {
    stableCode: stableCodeOf(row),
    title: titleOf(row),
    clientRowId: row.clientRowId,
    pmDecision,
    desiredVisibleOnMasterPlan: pmDecision !== 'hide',
    systemVisibleOnMasterPlan: decision.visibleOnMasterPlan,
    systemVisibilityClass: decision.visibilityClass,
    protectedFromAutoHide: decision.protectedFromAutoHide,
    policyStableCode: decision.policyStableCode,
    policySource: decision.policySource,
  }
}

export function buildDefaultMasterPlanVisibilityFeedback(
  input: BuildFeedbackInput,
): DefaultMasterPlanVisibilityFeedback {
  const base = {
    projectId: text(input.projectId),
    companyId: nullableText(input.companyId),
    businessType: text(input.businessType),
    generationBatchId: nullableText(input.generationBatchId),
    actorId: nullableText(input.actorId),
    source: 'explicit_preview_review' as const,
    protectedDecisionRejectedCount: 0,
    mutationBoundary: 'candidate_only_no_runtime_or_task_mutation' as const,
  }
  if (!input.explicitReview) {
    return { ...base, status: 'no_explicit_review', observations: [] }
  }

  const retainedIds = new Set(input.retainedClientRowIds.map(text).filter(Boolean))
  const observations: DefaultMasterPlanVisibilityFeedbackObservation[] = []
  let protectedDecisionRejectedCount = 0
  for (const row of input.generatedRows) {
    const decision = readDefaultMasterPlanVisibilityDecision(row)
    if (!decision) continue
    const retained = retainedIds.has(row.clientRowId)
    if (decision.visibleOnMasterPlan) {
      if (!retained && decision.protectedFromAutoHide) {
        protectedDecisionRejectedCount += 1
        continue
      }
      observations.push(observationFor(row, decision, retained ? 'keep' : 'hide'))
      continue
    }
    if (retained) observations.push(observationFor(row, decision, 'promote'))
  }

  return {
    ...base,
    status: observations.length > 0 ? 'feedback_candidate_ready' : 'no_actionable_feedback',
    observations,
    protectedDecisionRejectedCount,
  }
}

function feedbackFromTaskMetadata(input: TaskAdjustmentInput): DefaultMasterPlanVisibilityFeedback {
  const task = input.task
  const metadata = record(task.standard_task_metadata ?? task.standardTaskMetadata)
  const pseudoRow: DefaultMasterPlanVisibilityRow = {
    clientRowId: text(task.id) || 'unknown-task',
    parentClientRowId: null,
    sortOrder: 0,
    values: {
      ...task,
      standard_task_metadata: metadata,
    },
    predecessorClientRowIds: [],
    predecessorDependencies: [],
  }
  const decision = readDefaultMasterPlanVisibilityDecision(pseudoRow)
  const projectId = text(task.project_id ?? task.projectId)
  const businessType = text(input.businessType ?? decision?.businessType)
  const base: DefaultMasterPlanVisibilityFeedback = {
    status: 'no_actionable_feedback',
    projectId,
    companyId: nullableText(input.companyId),
    businessType,
    generationBatchId: nullableText(task.generation_batch_id ?? task.generationBatchId),
    actorId: nullableText(input.actorId),
    source: 'task_adjustment',
    observations: [],
    protectedDecisionRejectedCount: 0,
    mutationBoundary: 'candidate_only_no_runtime_or_task_mutation',
  }
  if (!decision) return base
  if (input.adjustment === 'hide' && decision.protectedFromAutoHide) {
    return { ...base, protectedDecisionRejectedCount: 1 }
  }
  if (input.adjustment === 'promote' && decision.visibleOnMasterPlan) return base
  if (input.adjustment === 'hide' && !decision.visibleOnMasterPlan) return base
  return {
    ...base,
    status: 'feedback_candidate_ready',
    observations: [observationFor(pseudoRow, decision, input.adjustment)],
  }
}

export function buildDefaultMasterPlanVisibilityTaskAdjustmentFeedback(
  input: TaskAdjustmentInput,
): DefaultMasterPlanVisibilityFeedback {
  return feedbackFromTaskMetadata(input)
}

export async function persistDefaultMasterPlanVisibilityFeedbackCandidate(
  feedback: DefaultMasterPlanVisibilityFeedback,
  queryExec?: AlgorithmAssetGovernanceQueryExec,
) {
  if (feedback.status !== 'feedback_candidate_ready' || feedback.observations.length === 0) {
    return { persisted: false, reason: feedback.status }
  }
  if (!feedback.companyId || !feedback.projectId || !feedback.businessType) {
    return { persisted: false, reason: 'company_project_business_scope_required' }
  }

  await createAndPersistAlgorithmAssetCandidateEvent({
    assetKey: `default_master_plan_visibility_feedback.${feedback.businessType}`,
    sourceSystem: 'defaultMasterPlanVisibilityFeedbackService',
    assetType: 'signal',
    companyId: feedback.companyId,
    projectId: feedback.projectId,
    candidatePayload: {
      source: feedback.source,
      businessType: feedback.businessType,
      generationBatchId: feedback.generationBatchId,
      actorId: feedback.actorId,
      observations: feedback.observations,
      protectedDecisionRejectedCount: feedback.protectedDecisionRejectedCount,
      experienceTier: 'T3',
      experienceAssetType: 'master_plan_visibility_feedback',
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePolicy: false,
      mutationBoundary: feedback.mutationBoundary,
    },
    publishAnchor: 'candidate_only',
    automationMaturity: 'auto_shadow',
    learningMaturity: 'governed_candidate',
    learningTarget: 'template_structure',
    requestedRuntimeEffect: 'candidate_only',
    generatedBy: 'service',
    queryExec,
  })
  return { persisted: true, reason: null }
}
