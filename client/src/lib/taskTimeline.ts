import type { Task, TaskCondition, TaskObstacle } from './supabase'
import {
  buildProjectTaskProgressSnapshot,
  getTaskBusinessStatus,
  isActiveObstacle,
  isPendingCondition,
} from './taskBusinessStatus'

export type TaskTimelineEventKind = 'task' | 'milestone' | 'condition' | 'obstacle'

export interface TaskTimelineEvent {
  id: string
  kind: TaskTimelineEventKind
  title: string
  description: string
  occurredAt: string
  taskId?: string
  statusLabel?: string
}

export interface TaskTimelineSummary {
  total: number
  taskCount: number
  milestoneCount: number
  conditionCount: number
  obstacleCount: number
}

export interface TaskTimelineDigest extends TaskTimelineSummary {
  taskId: string
  firstOccurredAt: string
  lastOccurredAt: string
}

export interface TaskTimelineNarrative {
  headline: string
  summaryLines: string[]
  supplementalLine: string
}

export interface TaskTimelineDetailSnapshot {
  taskEvents: TaskTimelineEvent[]
  taskSummary: TaskTimelineDigest
  narrative: TaskTimelineNarrative
}

function normalizeTimestamp(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim()
    if (value) return value
  }
  return ''
}

function formatTimelineMoment(value: string): string {
  return value ? new Date(value).toLocaleString('zh-CN') : '时间未知'
}

function formatTaskTitle(task: Pick<Task, 'title' | 'name'>): string {
  return String(task.title || task.name || '未命名任务').trim() || '未命名任务'
}

function compareEvents(a: TaskTimelineEvent, b: TaskTimelineEvent): number {
  const timeDiff = new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime()
  if (timeDiff !== 0) return timeDiff

  const kindOrder: Record<TaskTimelineEventKind, number> = {
    condition: 0,
    obstacle: 1,
    milestone: 2,
    task: 3,
  }

  const kindDiff = kindOrder[a.kind] - kindOrder[b.kind]
  if (kindDiff !== 0) return kindDiff

  return a.title.localeCompare(b.title, 'zh-Hans-CN')
}

export function buildTaskTimelineEvents(
  tasks: Task[] = [],
  conditions: TaskCondition[] = [],
  obstacles: TaskObstacle[] = [],
): TaskTimelineEvent[] {
  const snapshot = buildProjectTaskProgressSnapshot(tasks, conditions, obstacles)
  const events: TaskTimelineEvent[] = []

  for (const task of tasks) {
    const taskId = String(task.id ?? '').trim()
    if (!taskId) continue

    const status = getTaskBusinessStatus(task, {
      conditionSummary: snapshot.taskConditionMap[taskId],
      activeObstacleCount: snapshot.obstacleCountMap[taskId] ?? 0,
    })

    const occurredAt = normalizeTimestamp(
      task.updated_at,
      task.actual_end_date,
      task.actual_start_date,
      task.first_progress_at,
      task.created_at,
    )

    const segments = [`状态：${status.label}`]
    if (task.progress != null) segments.push(`进度：${Number(task.progress)}%`)
    if (task.assignee) segments.push(`责任人：${task.assignee}`)
    if (task.planned_end_date || task.end_date) {
      segments.push(`计划完成：${task.planned_end_date || task.end_date}`)
    }

    events.push({
      id: `task-${taskId}`,
      kind: 'task',
      title: formatTaskTitle(task),
      description: segments.join('；'),
      occurredAt,
      taskId,
      statusLabel: status.label,
    })

    if (task.is_milestone) {
      events.push({
        id: `milestone-${taskId}`,
        kind: 'milestone',
        title: `${formatTaskTitle(task)} · 里程碑`,
        description: `里程碑节点已纳入时间线，当前任务状态：${status.label}`,
        occurredAt,
        taskId,
        statusLabel: status.label,
      })
    }
  }

  for (const condition of conditions) {
    if (!condition.task_id || !isPendingCondition(condition)) continue
    const taskId = String(condition.task_id)
    events.push({
      id: `condition-${String(condition.id ?? taskId)}`,
      kind: 'condition',
      title: condition.condition_name || '开工条件',
      description: condition.description
        ? `开工条件未满足：${condition.description}`
        : '开工条件未满足，需关注。',
      occurredAt: normalizeTimestamp(condition.updated_at, condition.confirmed_at, condition.created_at),
      taskId,
    })
  }

  for (const obstacle of obstacles) {
    if (!obstacle.task_id || !isActiveObstacle(obstacle)) continue
    const taskId = String(obstacle.task_id)
    events.push({
      id: `obstacle-${String(obstacle.id ?? taskId)}`,
      kind: 'obstacle',
      title: obstacle.description || '阻碍事项',
      description: obstacle.description
        ? `现场阻碍仍未解除：${obstacle.description}`
        : '现场存在未解除的阻碍，需要关注。',
      occurredAt: normalizeTimestamp(obstacle.updated_at, obstacle.resolved_at, obstacle.created_at),
      taskId,
    })
  }

  return events.sort(compareEvents)
}

export function filterTaskTimelineEvents(events: TaskTimelineEvent[], taskId: string): TaskTimelineEvent[] {
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedTaskId) return []
  return events.filter((event) => String(event.taskId ?? '').trim() === normalizedTaskId)
}

export function summarizeTaskTimeline(events: TaskTimelineEvent[]): TaskTimelineSummary {
  return events.reduce<TaskTimelineSummary>((acc, event) => {
    acc.total += 1
    if (event.kind === 'task') acc.taskCount += 1
    if (event.kind === 'milestone') acc.milestoneCount += 1
    if (event.kind === 'condition') acc.conditionCount += 1
    if (event.kind === 'obstacle') acc.obstacleCount += 1
    return acc
  }, {
    total: 0,
    taskCount: 0,
    milestoneCount: 0,
    conditionCount: 0,
    obstacleCount: 0,
  })
}

export function summarizeTaskTimelineForTask(events: TaskTimelineEvent[], taskId: string): TaskTimelineDigest {
  const taskEvents = filterTaskTimelineEvents(events, taskId)
  const summary = summarizeTaskTimeline(taskEvents)
  const firstEvent = taskEvents[taskEvents.length - 1]
  const lastEvent = taskEvents[0]

  return {
    taskId: String(taskId ?? '').trim(),
    ...summary,
    firstOccurredAt: firstEvent?.occurredAt ?? '',
    lastOccurredAt: lastEvent?.occurredAt ?? '',
  }
}

export function summarizeTaskTimelineNarrative(
  events: TaskTimelineEvent[],
  taskTitle?: string,
): TaskTimelineNarrative {
  const summary = summarizeTaskTimeline(events)
  const latestEvent = events[0]
  const earliestEvent = events[events.length - 1]
  const title = String(taskTitle ?? latestEvent?.title ?? '任务').trim() || '任务'

  if (summary.total === 0) {
    return {
      headline: `${title} 暂无可沉淀的历程事实`,
      summaryLines: ['当前还没有可展示的时间线事件。'],
      supplementalLine: '如需说明特殊情况，可在补充说明中简要记录。',
    }
  }

  const summaryLines = [
    `共有 ${summary.total} 条事实，其中 ${summary.taskCount} 条任务状态变化、${summary.milestoneCount} 条里程碑、${summary.conditionCount} 条条件、${summary.obstacleCount} 条阻碍。`,
  ]

  if (earliestEvent?.occurredAt && latestEvent?.occurredAt) {
    summaryLines.push(`历程从 ${formatTimelineMoment(earliestEvent.occurredAt)} 开始，最近变化在 ${formatTimelineMoment(latestEvent.occurredAt)}。`)
  }

  const focusParts: string[] = []
  if (summary.conditionCount > 0) focusParts.push(`${summary.conditionCount} 条开工条件`)
  if (summary.obstacleCount > 0) focusParts.push(`${summary.obstacleCount} 条阻碍`)
  if (summary.milestoneCount > 0) focusParts.push(`${summary.milestoneCount} 个里程碑`)
  if (focusParts.length > 0) {
    summaryLines.push(`重点关注：${focusParts.join('、')}。`)
  }

  return {
    headline: `${title} 已沉淀 ${summary.total} 条可追踪事实`,
    summaryLines,
    supplementalLine: '人工补充说明只保留关键信息，不再作为主总结。',
  }
}

export function buildTaskTimelineDetailSnapshot(
  events: TaskTimelineEvent[],
  taskId: string,
  taskTitle?: string,
): TaskTimelineDetailSnapshot {
  const taskEvents = filterTaskTimelineEvents(events, taskId)
  return {
    taskEvents,
    taskSummary: summarizeTaskTimelineForTask(events, taskId),
    narrative: summarizeTaskTimelineNarrative(taskEvents, taskTitle),
  }
}
