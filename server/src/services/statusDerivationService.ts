import { deriveTaskUnifiedStatus, type TaskUnifiedStatusInput } from './taskStatusDerivationService.js'

// v1.4.5: Status derivation service - compute derived statuses from primary fields.
// Every derived result includes reason, evidence, and sourceFields for auditability.

export interface DerivationResult {
  status: string
  label: string
  reason: string
  evidence: Record<string, unknown>
  sourceFields: string[]
}

export interface TaskBusinessStatusInput extends TaskUnifiedStatusInput {}

export function deriveTaskBusinessStatus(input: TaskBusinessStatusInput): DerivationResult {
  return deriveTaskUnifiedStatus(input).businessStatus
}

export function deriveTaskLagStatus(input: {
  planned_start_date?: string | null
  start_date?: string | null
  end_date?: string | null
  planned_end_date?: string | null
  actual_end_date?: string | null
  progress?: number | null
  status?: string | null
  lagLevel?: unknown
  lagStatus?: unknown
}): DerivationResult {
  const unified = deriveTaskUnifiedStatus(input)
  return {
    status: unified.lagLevel,
    label: unified.lagStatus,
    reason: unified.lagLevel === 'none' ? '任务未触发滞后判定' : `任务${unified.lagStatus}`,
    evidence: unified.lagStatusEvidence,
    sourceFields: unified.lagStatusEvidence.sourceFields,
  }
}

export function deriveDueStatus(input: {
  planned_end_date?: string | null
  status?: string | null
}): DerivationResult {
  const due = deriveTaskUnifiedStatus(input).dueStatus
  return {
    status: due.status,
    label: due.label,
    reason: due.reason,
    evidence: due.evidence,
    sourceFields: due.sourceFields,
  }
}

export function deriveMaterialStatus(input: {
  expected_arrival_date?: string | null
  actual_arrival_date?: string | null
  requires_sample_confirmation?: boolean
  sample_confirmed?: boolean
  requires_inspection?: boolean
  inspection_done?: boolean
}): DerivationResult {
  if (input.actual_arrival_date) {
    if (input.requires_inspection && !input.inspection_done) {
      return {
        status: 'pending_inspection',
        label: '待验收',
        reason: '已到场待验收',
        evidence: {
          actual_arrival_date: input.actual_arrival_date,
          requires_inspection: true,
          inspection_done: false,
        },
        sourceFields: ['actual_arrival_date', 'requires_inspection', 'inspection_done'],
      }
    }
    return {
      status: 'completed',
      label: '已完成',
      reason: '已到场并验收完成',
      evidence: { actual_arrival_date: input.actual_arrival_date },
      sourceFields: ['actual_arrival_date'],
    }
  }
  if (input.requires_sample_confirmation && !input.sample_confirmed) {
    return {
      status: 'pending_sample',
      label: '待封样',
      reason: '需要封样确认',
      evidence: { requires_sample_confirmation: true, sample_confirmed: false },
      sourceFields: ['requires_sample_confirmation', 'sample_confirmed'],
    }
  }
  if (input.expected_arrival_date) {
    const planned = new Date(input.expected_arrival_date)
    if (!Number.isNaN(planned.getTime()) && planned < new Date()) {
      return {
        status: 'overdue_arrival',
        label: '逾期未到',
        reason: `预计 ${input.expected_arrival_date} 到场，已逾期`,
        evidence: { expected_arrival_date: input.expected_arrival_date },
        sourceFields: ['expected_arrival_date'],
      }
    }
  }
  return {
    status: 'pending_arrival',
    label: '待到场',
    reason: '等待材料到场',
    evidence: {},
    sourceFields: ['expected_arrival_date'],
  }
}

export function deriveProjectHealthStatus(input: {
  on_time_rate?: number | null
  completion_rate?: number | null
  active_risk_count?: number
  active_issue_count?: number
}): DerivationResult {
  const onTime = input.on_time_rate ?? 100
  if (input.active_issue_count && input.active_issue_count > 3) {
    return {
      status: 'danger',
      label: '危险',
      reason: `活跃问题数 ${input.active_issue_count} > 3`,
      evidence: { active_issue_count: input.active_issue_count },
      sourceFields: ['active_issue_count'],
    }
  }
  if (input.active_risk_count && input.active_risk_count > 5) {
    return {
      status: 'critical',
      label: '预警',
      reason: `活跃风险数 ${input.active_risk_count} > 5`,
      evidence: { active_risk_count: input.active_risk_count },
      sourceFields: ['active_risk_count'],
    }
  }
  if (onTime < 50) {
    return {
      status: 'critical',
      label: '预警',
      reason: `按时完成率 ${onTime}% < 50%`,
      evidence: { on_time_rate: onTime },
      sourceFields: ['on_time_rate'],
    }
  }
  if (onTime < 80) {
    return {
      status: 'warning',
      label: '亚健康',
      reason: `按时完成率 ${onTime}% < 80%`,
      evidence: { on_time_rate: onTime },
      sourceFields: ['on_time_rate'],
    }
  }
  return {
    status: 'healthy',
    label: '健康',
    reason: '指标正常',
    evidence: { on_time_rate: onTime },
    sourceFields: ['on_time_rate'],
  }
}

export function derivePlanningDisplayStatus(
  backendStatus: string | null | undefined,
  hasDirtyChanges?: boolean,
  isPendingRealign?: boolean,
): string {
  const status = String(backendStatus ?? '').trim()
  if (status === 'confirmed' && isPendingRealign) return '当前生效，系统待吸收调整'
  if (status === 'confirmed' || status === 'pending_realign') return '当前生效'
  if (status === 'draft' || status === 'revising') return hasDirtyChanges ? '编辑中' : '待发布'
  if (status === 'closed' || status === 'archived') return '历史版本'
  return '待处理'
}
