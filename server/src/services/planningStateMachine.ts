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
      method: 'GET',
      path: '/api/task-baselines/:id',
      requestShape: '{ project_id?: string }',
      responseShape: '{ id: string, items: BaselineItem[] }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/task-baselines/:id/diff',
      requestShape: '{ compareTo?: string }',
      responseShape: '{ fromVersionLabel: string, toVersionLabel: string, items: BaselineDiffItem[] }',
      errorCodes: ['NOT_FOUND', 'COMPARISON_BASELINE_UNAVAILABLE', 'PROJECT_MISMATCH'],
    },
    {
      method: 'GET',
      path: '/api/task-baselines/:id/generation-candidate',
      requestShape: '{ project_id?: string }',
      responseShape: '{ recommended: boolean, reasons: BaselineGenerationCandidateReason[], diffCounts: {...}, diffItems: BaselineDiffItem[] }',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/generate',
      requestShape: '{ project_id: string }',
      responseShape: "{ id: string, status: 'draft' | 'revising', items: BaselineItem[] }",
      errorCodes: ['VALIDATION_ERROR', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines',
      requestShape: '{ project_id: string, title?: string, items?: [...] }',
      responseShape: "{ id: string, status: 'draft' }",
      errorCodes: ['VALIDATION_ERROR'],
    },
    {
      method: 'PUT',
      path: '/api/task-baselines/:id',
      requestShape: '{ title?: string, items?: [...] }',
      responseShape: "{ id: string, status: 'draft' | 'revising' }",
      errorCodes: ['INVALID_STATE', 'NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/commit',
      requestShape: 'PlanningTableCommitRequest<baseline>',
      responseShape: 'PlanningTableCommitResponse<BaselineItem>',
      errorCodes: ['FIELD_REGISTRY_STALE', 'INVALID_STATE', 'NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/materialize-independent-task-network',
      requestShape: '{ mode?: dry_run | execute, scope_assignment?: ScopeAssignment, scope_assignments_by_candidate_item_id?: Record<string, ScopeAssignment>, allow_independent_task_network_materialization?: boolean, approved_duration_mappings?: [...] }',
      responseShape: '{ mode: dry_run | execute, plan: IndependentDefaultMasterPlanTaskNetworkPlan, materialization?: {...} }',
      errorCodes: [
        'NOT_FOUND',
        'INVALID_STATE',
        'INDEPENDENT_TASK_NETWORK_PLAN_BLOCKED',
        'INDEPENDENT_TASK_NETWORK_SCOPE_INVALID',
        'INDEPENDENT_TASK_NETWORK_EXECUTION_NOT_AUTHORIZED',
        'APPROVED_DURATION_MAPPING_SAMPLE_INVALID',
      ],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/publish',
      requestShape: '{ project_id?: string, version?: number | null }',
      responseShape: "{ id: string, status: 'confirmed' }",
      errorCodes: ['VERSION_CONFLICT', 'BLOCKING_ISSUES_EXIST', 'VALIDATION_ERROR', 'REQUIRES_REALIGNMENT'],
    },
    {
      method: 'POST',
      path: '/api/task-baselines/:id/confirm',
      requestShape: '{ version?: number | null }',
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
      method: 'GET',
      path: '/api/monthly-plans',
      requestShape: '{ project_id?: string }',
      responseShape: '{ items: MonthlyPlan[] }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/monthly-plans/:id',
      requestShape: '{ project_id?: string }',
      responseShape: '{ id: string, items: MonthlyPlanItem[] }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/monthly-plans/:id/change-summary',
      requestShape: '{ project_id?: string }',
      responseShape: '{ addedItems: number, removedItems: number, changedItems: number }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/monthly-plans/:id/closeout-summary',
      requestShape: '{ project_id?: string }',
      responseShape: '{ totalItems: number, carryoverItems: number, completedItems: number }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/monthly-plans/generate',
      requestShape: '{ project_id: string, month: string, title?: string }',
      responseShape: "{ id: string, status: 'draft', items: MonthlyPlanItem[] }",
      errorCodes: ['VALIDATION_ERROR', 'NOT_FOUND'],
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
      path: '/api/monthly-plans/:id/commit',
      requestShape: 'PlanningTableCommitRequest<monthly_plan>',
      responseShape: 'PlanningTableCommitResponse<MonthlyPlanItem>',
      errorCodes: ['FIELD_REGISTRY_STALE', 'INVALID_STATE', 'NOT_FOUND', 'VALIDATION_ERROR'],
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
      method: 'GET',
      path: '/api/tasks',
      requestShape: '{ projectId: string }',
      responseShape: '{ items: Task[] }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/tasks/progress-snapshots',
      requestShape: '{ projectId: string }',
      responseShape: '{ items: TaskProgressSnapshot[] }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'GET',
      path: '/api/tasks/:id',
      requestShape: '{ id: string }',
      responseShape: '{ id: string }',
      errorCodes: ['NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/tasks/commit',
      requestShape: 'PlanningTableCommitRequest<task_list>',
      responseShape: 'PlanningTableCommitResponse<Task>',
      errorCodes: ['FIELD_REGISTRY_STALE', 'VALIDATION_ERROR', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/tasks/:id/close',
      requestShape: '{ reason?: string }',
      responseShape: "{ id: string, status: 'completed' | 'closed' }",
      errorCodes: ['INVALID_STATE', 'NOT_FOUND'],
    },
    {
      method: 'POST',
      path: '/api/tasks/:id/reopen',
      requestShape: '{ reason?: string }',
      responseShape: "{ id: string, status: 'todo' | 'in_progress' }",
      errorCodes: ['INVALID_STATE', 'NOT_FOUND'],
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
  ],
  stateMachine: {
    states: [...PLANNING_STATUSES],
    events: [...PLANNING_EVENTS],
    transitions: planningTransitionRules.map(
      (rule) => `${rule.source} + ${rule.event} -> ${rule.target}`
    ),
  },
}
