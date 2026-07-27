import type { MonthlyPlanItem } from '../types/db.js'

type CloseoutTaskRow = {
  id: string
  progress?: number | null
  status?: string | null
  actual_end_date?: string | null
  title?: string | null
  name?: string | null
}

export type MonthlyCloseoutClassification = 'completed' | 'carryover' | 'cancelled' | 'needs_attention'

export interface MonthlyCloseoutDecision {
  itemId: string
  classification: MonthlyCloseoutClassification
  commitmentStatus: MonthlyPlanItem['commitment_status']
  reasonCode: string
  businessReason: string
  currentProgress: number
  targetProgress: number
  attentionRequired: boolean
}

export interface MonthlyCloseoutClassificationResult {
  items: MonthlyPlanItem[]
  decisions: MonthlyCloseoutDecision[]
  summary: {
    totalCount: number
    processedCount: number
    remainingCount: number
    autoAdoptableCount: number
    completedCount: number
    carryoverCount: number
    cancelledCount: number
    attentionCount: number
  }
}

function clampProgress(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function isCompletedStatus(status: unknown) {
  return ['completed', 'done', 'finished'].includes(normalizeStatus(status))
}

function isInactiveStatus(status: unknown) {
  return ['cancelled', 'canceled', 'closed', 'deleted', 'removed'].includes(normalizeStatus(status))
}

function isConstrainedStatus(status: unknown) {
  return ['blocked', 'paused', 'on_hold', 'hold'].includes(normalizeStatus(status))
}

function hasManualCommitmentOverride(item: MonthlyPlanItem) {
  return item.manual_override_fields?.commitment_status === true
}

function getCloseoutDecision(item: MonthlyPlanItem, task: CloseoutTaskRow | null): MonthlyCloseoutDecision {
  const targetProgress = clampProgress(item.target_progress, 100)
  const currentProgress = Math.max(
    clampProgress(item.current_progress, 0),
    task ? clampProgress(task.progress, 0) : 0,
  )
  const existingStatus = item.commitment_status ?? 'planned'

  if (hasManualCommitmentOverride(item) && existingStatus !== 'planned') {
    const classification: MonthlyCloseoutClassification =
      existingStatus === 'completed' ? 'completed'
        : existingStatus === 'carried_over' ? 'carryover'
          : existingStatus === 'cancelled' ? 'cancelled'
            : 'needs_attention'
    return {
      itemId: item.id,
      classification,
      commitmentStatus: existingStatus,
      reasonCode: 'manual_commitment_override',
      businessReason: 'User adjusted the monthly closeout result before confirmation.',
      currentProgress,
      targetProgress,
      attentionRequired: classification === 'needs_attention',
    }
  }

  if (existingStatus === 'cancelled' || (task && isInactiveStatus(task.status))) {
    return {
      itemId: item.id,
      classification: 'cancelled',
      commitmentStatus: 'cancelled',
      reasonCode: 'execution_no_longer_active',
      businessReason: 'The related execution item is no longer active, so the monthly commitment is closed without carryover.',
      currentProgress,
      targetProgress,
      attentionRequired: false,
    }
  }

  if (existingStatus === 'completed' || isCompletedStatus(task?.status) || task?.actual_end_date || currentProgress >= targetProgress) {
    return {
      itemId: item.id,
      classification: 'completed',
      commitmentStatus: 'completed',
      reasonCode: 'monthly_target_reached',
      businessReason: 'The monthly target has been reached, so the commitment is closed as completed.',
      currentProgress,
      targetProgress,
      attentionRequired: false,
    }
  }

  if (hasManualCommitmentOverride(item) && existingStatus === 'planned') {
    return {
      itemId: item.id,
      classification: 'needs_attention',
      commitmentStatus: 'planned',
      reasonCode: 'manual_pending_closeout',
      businessReason: 'The item was intentionally left pending and needs explicit closeout handling.',
      currentProgress,
      targetProgress,
      attentionRequired: true,
    }
  }

  return {
    itemId: item.id,
    classification: 'carryover',
    commitmentStatus: 'carried_over',
    reasonCode: task && isConstrainedStatus(task.status) ? 'active_execution_constraint' : 'monthly_target_unfinished',
    businessReason: task && isConstrainedStatus(task.status)
      ? 'The related execution item is constrained, so the unfinished commitment is carried into the next month.'
      : 'The monthly target is unfinished, so the commitment is carried into the next month.',
    currentProgress,
    targetProgress,
    attentionRequired: task ? isConstrainedStatus(task.status) : false,
  }
}

function withCloseoutMetadata(item: MonthlyPlanItem, decision: MonthlyCloseoutDecision, classifiedAt: string): MonthlyPlanItem {
  const generationMetadata = typeof item.generation_metadata === 'object' && item.generation_metadata !== null
    ? item.generation_metadata
    : {}

  return {
    ...item,
    commitment_status: decision.commitmentStatus,
    current_progress: decision.currentProgress,
    generation_metadata: {
      ...generationMetadata,
      closeout_classification: {
        category: decision.classification,
        commitmentStatus: decision.commitmentStatus,
        reasonCode: decision.reasonCode,
        businessReason: decision.businessReason,
        source: 'system',
        classifiedAt,
      },
      closeout_attention_required: decision.attentionRequired,
    },
    updated_at: classifiedAt,
  }
}

export function classifyMonthlyPlanCloseout(
  items: MonthlyPlanItem[],
  tasks: CloseoutTaskRow[] = [],
  classifiedAt = new Date().toISOString(),
): MonthlyCloseoutClassificationResult {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const decisions = items.map((item) => getCloseoutDecision(
    item,
    item.source_task_id ? taskById.get(item.source_task_id) ?? null : null,
  ))
  const decisionById = new Map(decisions.map((decision) => [decision.itemId, decision]))
  const classifiedItems = items.map((item) => withCloseoutMetadata(item, decisionById.get(item.id)!, classifiedAt))
  const completedCount = decisions.filter((decision) => decision.classification === 'completed').length
  const carryoverCount = decisions.filter((decision) => decision.classification === 'carryover').length
  const cancelledCount = decisions.filter((decision) => decision.classification === 'cancelled').length
  const attentionCount = decisions.filter((decision) => decision.classification === 'needs_attention').length
  const processedCount = completedCount + carryoverCount + cancelledCount

  return {
    items: classifiedItems,
    decisions,
    summary: {
      totalCount: items.length,
      processedCount,
      remainingCount: Math.max(items.length - processedCount, 0),
      autoAdoptableCount: processedCount,
      completedCount,
      carryoverCount,
      cancelledCount,
      attentionCount,
    },
  }
}
