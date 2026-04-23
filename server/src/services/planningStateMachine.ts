import {
  PLANNING_EVENTS,
  PLANNING_STATUSES,
  type PlanningContractsSnapshot,
  type PlanningErrorCode,
  type PlanningEvent,
  type PlanningStatus,
  type PlanningTransitionContext,
} from '../types/planning.js'

type TransitionOutcome =
  | { allowed: true }
  | { allowed: false; code: PlanningErrorCode; message: string }

export interface PlanningTransitionRule {
  source: PlanningStatus
  event: PlanningEvent
  target: PlanningStatus
  guardName: string
  guard: (context: PlanningTransitionContext) => TransitionOutcome
}

export class PlanningStateTransitionError extends Error {
  code: PlanningErrorCode

  constructor(code: PlanningErrorCode, message: string) {
    super(message)
    this.name = 'PlanningStateTransitionError'
    this.code = code
  }
}

const allow = (): TransitionOutcome => ({ allowed: true })
const deny = (code: PlanningErrorCode, message: string): TransitionOutcome => ({
  allowed: false,
  code,
  message,
})

const versionMatches = (context: PlanningTransitionContext): TransitionOutcome => {
  if (typeof context.version === 'number' && typeof context.expected_version === 'number') {
    if (context.version !== context.expected_version) {
      return deny('VERSION_CONFLICT', '版本号不一致，当前状态已被其他提交推进')
    }
  }
  return allow()
}

const noBlockingIssues = (context: PlanningTransitionContext): TransitionOutcome => {
  const blockingIssueCount = context.blocking_issue_count ?? 0
  if (context.has_blocking_issues || blockingIssueCount > 0) {
    return deny('BLOCKING_ISSUES_EXIST', '存在阻塞性问题，当前操作被拒绝')
  }
  return allow()
}

const revisionReady = (context: PlanningTransitionContext): TransitionOutcome => {
  if (context.revision_ready === false) {
    return deny('INVALID_STATE', '当前草稿尚未准备好进入修订')
  }
  return allow()
}

const realignmentRequired = (context: PlanningTransitionContext): TransitionOutcome => {
  if (context.realignment_required !== true) {
    return deny('REQUIRES_REALIGNMENT', '当前状态不需要重整')
  }
  return allow()
}

const realignmentResolved = (context: PlanningTransitionContext): TransitionOutcome => {
  if (context.realignment_resolved !== true) {
    return deny('INVALID_STATE', '重整尚未完成，无法回到已确认状态')
  }
  return allow()
}

export const planningTransitionRules: readonly PlanningTransitionRule[] = [
  {
    source: 'draft',
    event: 'CONFIRM',
    target: 'confirmed',
    guardName: 'version_matches_and_no_blocking_issues',
    guard: (context) => {
      const versionCheck = versionMatches(context)
      if (!versionCheck.allowed) return versionCheck
      return noBlockingIssues(context)
    },
  },
  {
    source: 'confirmed',
    event: 'CLOSE_MONTH',
    target: 'closed',
    guardName: 'no_blocking_issues',
    guard: noBlockingIssues,
  },
  {
    source: 'confirmed',
    event: 'START_REVISION',
    target: 'revising',
    guardName: 'revision_ready',
    guard: revisionReady,
  },
  {
    source: 'closed',
    event: 'START_REVISION',
    target: 'revising',
    guardName: 'revision_ready',
    guard: revisionReady,
  },
  {
    source: 'pending_realign',
    event: 'START_REVISION',
    target: 'revising',
    guardName: 'revision_ready',
    guard: revisionReady,
  },
  {
    source: 'revising',
    event: 'SUBMIT_REVISION',
    target: 'confirmed',
    guardName: 'revision_ready',
    guard: revisionReady,
  },
  {
    source: 'confirmed',
    event: 'QUEUE_REALIGNMENT',
    target: 'pending_realign',
    guardName: 'realignment_required',
    guard: realignmentRequired,
  },
  {
    source: 'revising',
    event: 'QUEUE_REALIGNMENT',
    target: 'pending_realign',
    guardName: 'realignment_required',
    guard: realignmentRequired,
  },
  {
    source: 'pending_realign',
    event: 'RESOLVE_REALIGNMENT',
    target: 'confirmed',
    guardName: 'realignment_resolved',
    guard: realignmentResolved,
  },
]

const getRule = (source: PlanningStatus, event: PlanningEvent) =>
  planningTransitionRules.find((rule) => rule.source === source && rule.event === event)

export const planningStateMachine = {
  states: PLANNING_STATUSES,
  events: PLANNING_EVENTS,
  transitions: planningTransitionRules,
  canTransition(source: PlanningStatus, event: PlanningEvent, context: PlanningTransitionContext = {}) {
    const rule = getRule(source, event)
    if (!rule) return false
    return rule.guard(context).allowed
  },
  transition(source: PlanningStatus, event: PlanningEvent, context: PlanningTransitionContext = {}) {
    const rule = getRule(source, event)
    if (!rule) {
      throw new PlanningStateTransitionError(
        'INVALID_STATE',
        `不支持从 ${source} 执行 ${event} 的状态转换`
      )
    }

    const outcome = rule.guard(context)
    if (outcome.allowed === false) {
      throw new PlanningStateTransitionError(outcome.code, outcome.message)
    }

    return rule.target
  },
  describeTransition(source: PlanningStatus, event: PlanningEvent) {
    return getRule(source, event)
  },
}

export const planningContracts: PlanningContractsSnapshot = {
  types: [
    'BaselineVersion',
    'BaselineItem',
    'MonthlyPlanVersion',
    'MonthlyPlanItem',
    'CarryoverItem',
    'RevisionPoolCandidate',
    'PlanningStatus',
    'PlanningEvent',
  ],
  endpoints: [
    {
      method: 'GET',
      path: '/api/task-baselines',
      requestShape: '{ project_id?: string }',
      responseShape: '{ items: TaskBaseline[] }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines',
      requestShape: '{ project_id: string, title?: string, items?: [...] }',
      responseShape: "{ id: string, status: 'draft' }",
      errorCodes: ['VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/confirm',
      requestShape: '{ version: number }',
      responseShape: "{ id: string, status: 'confirmed' }",
      errorCodes: ['VERSION_CONFLICT', 'BLOCKING_ISSUES_EXIST', 'VALIDATION_ERROR', 'REQUIRES_REALIGNMENT'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/queue-realignment',
      requestShape: '{ version: number, reason?: string }',
      responseShape: "{ id: string, status: 'pending_realign' }",
      errorCodes: ['VERSION_CONFLICT', 'INVALID_STATE', 'REQUIRES_REALIGNMENT', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/resolve-realignment',
      requestShape: '{ version: number, reason?: string }',
      responseShape: "{ id: string, status: 'confirmed' }",
      errorCodes: ['VERSION_CONFLICT', 'INVALID_STATE', 'NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/task-baselines/:id/lock',
      requestShape: '{ id: string }',
      responseShape: '{ lock: PlanningDraftLock | null }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/lock',
      requestShape: '{ project_id?: string }',
      responseShape: '{ lock: PlanningDraftLock }',
      errorCodes: ['LOCK_HELD', 'LOCK_EXPIRED'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/force-unlock',
      requestShape: '{ reason?: string }',
      responseShape: '{ lock: PlanningDraftLock }',
      errorCodes: ['FORBIDDEN', 'NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/monthly-plans',
      requestShape: '{ project_id?: string }',
      responseShape: '{ items: MonthlyPlan[] }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans',
      requestShape: '{ project_id: string, month: string, title?: string, items?: [...] }',
      responseShape: "{ id: string, status: 'draft' }",
      errorCodes: ['VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/confirm',
      requestShape: '{ version: number, month: string }',
      responseShape: "{ id: string, status: 'confirmed' }",
      errorCodes: ['VERSION_CONFLICT', 'BLOCKING_ISSUES_EXIST'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/revoke',
      requestShape: '{ version: number, reason?: string }',
      responseShape: "{ id: string, status: 'revoked', removed_item_count: number }",
      errorCodes: ['VERSION_CONFLICT', 'INVALID_STATE', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/void',
      requestShape: '{ version: number, reason?: string }',
      responseShape: "{ id: string, status: 'revoked', removed_item_count: number }",
      errorCodes: ['VERSION_CONFLICT', 'INVALID_STATE', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/queue-realignment',
      requestShape: '{ version: number, reason?: string }',
      responseShape: "{ id: string, status: 'pending_realign' }",
      errorCodes: ['VERSION_CONFLICT', 'INVALID_STATE', 'REQUIRES_REALIGNMENT', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/resolve-realignment',
      requestShape: '{ version: number, reason?: string }',
      responseShape: "{ id: string, status: 'confirmed' }",
      errorCodes: ['VERSION_CONFLICT', 'INVALID_STATE', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/close',
      requestShape: '{ month: string, version: number }',
      responseShape: "{ month: string, status: 'closed' }",
      errorCodes: ['VERSION_CONFLICT', 'BLOCKING_ISSUES_EXIST'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/force-close',
      requestShape: '{ reason?: string }',
      responseShape: "{ id: string, status: 'closed' }",
      errorCodes: ['FORBIDDEN', 'INVALID_STATE', 'NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/monthly-plans/:id/lock',
      requestShape: '{ id: string }',
      responseShape: '{ lock: PlanningDraftLock | null }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/lock',
      requestShape: '{ project_id?: string }',
      responseShape: '{ lock: PlanningDraftLock }',
      errorCodes: ['LOCK_HELD', 'LOCK_EXPIRED'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/force-unlock',
      requestShape: '{ reason?: string }',
      responseShape: '{ lock: PlanningDraftLock }',
      errorCodes: ['FORBIDDEN', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/items/batch-scope',
      requestShape: "{ item_ids?: string[], range?: { start_sort_order: number, end_sort_order: number }, action: 'move_in' | 'move_out' }",
      responseShape: '{ plan: MonthlyPlan, items: MonthlyPlanItem[], touched_count: number }',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR', 'FORBIDDEN'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/items/batch-shift-dates',
      requestShape: '{ item_ids?: string[], range?: { start_sort_order: number, end_sort_order: number }, shift_days: number }',
      responseShape: '{ plan: MonthlyPlan, items: MonthlyPlanItem[], touched_count: number }',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR', 'FORBIDDEN'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/:id/items/batch-target-progress',
      requestShape: '{ item_ids?: string[], range?: { start_sort_order: number, end_sort_order: number }, target_progress: number }',
      responseShape: '{ plan: MonthlyPlan, items: MonthlyPlanItem[], touched_count: number }',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR', 'FORBIDDEN'],
    },
    {
      method: 'POST',
      path: '/api/planning-governance/:projectId/start-reorder',
      requestShape: "{ reorder_mode?: 'sequence' | 'date_shift' | 'scope_change' | 'mixed', note?: string }",
      responseShape: "{ kind: 'manual_reorder_session', status: 'active' }",
      errorCodes: ['FORBIDDEN', 'MANUAL_REORDER_ALREADY_ACTIVE'],
    },
    {
      method: 'POST',
      path: '/api/planning-governance/:projectId/end-reorder',
      requestShape: '{ note?: string }',
      responseShape: "{ kind: 'manual_reorder_session', status: 'resolved' }",
      errorCodes: ['FORBIDDEN', 'MANUAL_REORDER_NOT_ACTIVE'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/revisions',
      requestShape: '{ baseline_version_id: string, reason: string }',
      responseShape: "{ revision_id: string, status: 'revising' }",
      errorCodes: ['INVALID_STATE', 'LOCK_HELD'],
    },
    {
      method: 'GET',
      path: '/api/task-baselines/:id/revision-pool',
      requestShape: '{ project_id: string, baseline_version_id?: string }',
      responseShape: '{ items: RevisionPoolCandidate[], total: number }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/revision-pool',
      requestShape: '{ project_id: string, baseline_version_id?: string, items: [...] }',
      responseShape: '{ submitted_count: number, candidate_ids: string[] }',
      errorCodes: ['VALIDATION_ERROR'],
    },
    {
      method: 'GET',
      path: '/api/progress-deviation',
      requestShape: '{ project_id: string, baseline_version_id: string }',
      responseShape: '{ summary: {...}, rows: [...] }',
      errorCodes: ['NOT_FOUND', 'DEVIATION_ANALYSIS_UNAVAILABLE'],
    },
    {
      method: 'GET',
      path: '/api/milestones/:id/planning',
      requestShape: '{ id: string }',
      responseShape: '{ baseline_date: string | null, current_plan_date: string | null, actual_date: string | null }',
      errorCodes: ['NOT_FOUND'],
    },
  ],
  stateMachine: {
    states: [...PLANNING_STATUSES],
    events: [...PLANNING_EVENTS],
    transitions: planningTransitionRules.map(
      (rule) => `${rule.source} + ${rule.event} -> ${rule.target}`
    ),
  },
}
