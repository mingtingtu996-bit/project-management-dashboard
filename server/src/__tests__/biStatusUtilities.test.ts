import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calculateOverallProgress,
  calculateWeightedProgress,
} from '../utils/progressCalculation.js'
import { isActiveIssue } from '../utils/issueStatus.js'
import { isActiveObstacle } from '../utils/obstacleStatus.js'
import { isActiveRisk } from '../utils/riskStatus.js'
import {
  COMPLETED_TASK_STATUS_SQL_LIST,
  isCompletedMilestone,
  isCompletedTask,
  isInProgressTask,
} from '../utils/taskStatus.js'
import { isActiveWarning } from '../utils/warningStatus.js'
import { isPendingCondition } from '../utils/conditionStatus.js'

const testDir = dirname(fileURLToPath(import.meta.url))
const sourcePath = (...segments: string[]) => join(testDir, '..', ...segments)

describe('BI status utilities', () => {
  it('normalizes task completion and milestone completion consistently', () => {
    expect(isCompletedTask({ status: 'done' })).toBe(true)
    expect(isCompletedTask({ status: '已完成' })).toBe(true)
    expect(isCompletedTask({ status: 'in_progress', progress: 100 })).toBe(true)
    expect(isCompletedTask({ status: 'active', progress: 80 })).toBe(false)

    expect(isCompletedMilestone({ is_milestone: true, status: 'completed' })).toBe(true)
    expect(isCompletedMilestone({ is_milestone: false, status: 'completed' })).toBe(false)
  })

  it('keeps in-progress status detection aligned with shared task status', () => {
    expect(isInProgressTask({ status: 'in_progress' })).toBe(true)
    expect(isInProgressTask({ status: '进行中' })).toBe(true)
    expect(isInProgressTask({ status: 'completed' })).toBe(false)
  })

  it('treats only closed risks as inactive', () => {
    expect(isActiveRisk({ status: 'open' })).toBe(true)
    expect(isActiveRisk({ status: 'closed' })).toBe(false)
    expect(isActiveRisk({ status: '已关闭' })).toBe(false)
  })

  it('treats resolved issues and warnings as inactive', () => {
    expect(isActiveIssue({ status: 'open' })).toBe(true)
    expect(isActiveIssue({ status: 'resolved' })).toBe(false)
    expect(isActiveIssue({ status: '已关闭' })).toBe(false)

    expect(isActiveWarning({ status: 'warning' })).toBe(true)
    expect(isActiveWarning({ status: 'closed' })).toBe(false)
    expect(isActiveWarning({ status: '已解决' })).toBe(false)
  })

  it('treats satisfied conditions and resolved obstacles as inactive', () => {
    expect(isPendingCondition({ status: '未满足' })).toBe(true)
    expect(isPendingCondition({ status: '已确认' })).toBe(false)
    expect(isPendingCondition({ is_satisfied: 1 })).toBe(false)

    expect(isActiveObstacle({ status: '处理中' })).toBe(true)
    expect(isActiveObstacle({ status: 'resolved' })).toBe(false)
    expect(isActiveObstacle({ is_resolved: 1 })).toBe(false)
  })

  it('calculates weighted progress from the leaf task set', () => {
    const tasks = [
      { id: 'parent', progress: 100, planned_start_date: '2026-04-01', planned_end_date: '2026-04-10' },
      { id: 'child-a', parent_id: 'parent', progress: 20, planned_start_date: '2026-04-01', planned_end_date: '2026-04-03' },
      { id: 'child-b', parent_id: 'parent', progress: 80, planned_start_date: '2026-04-01', planned_end_date: '2026-04-11' },
    ]

    expect(calculateWeightedProgress(tasks)).toBe(67)
    expect(calculateOverallProgress(tasks)).toBe(67)
  })

  it('keeps completion checks delegated to the shared taskStatus utility', () => {
    const dbServiceSource = readFileSync(sourcePath('services/dbService.ts'), 'utf8')
    const taskSummarySource = readFileSync(sourcePath('routes/task-summaries.ts'), 'utf8')
    const taskSummaryServiceSource = readFileSync(sourcePath('services/taskSummaryService.ts'), 'utf8')
    const taskSummaryCompareSource = readFileSync(sourcePath('services/taskSummaryCompareService.ts'), 'utf8')
    const taskAttributionSummarySource = readFileSync(sourcePath('services/taskAttributionSummaryService.ts'), 'utf8')

    expect(dbServiceSource).toContain("from '../utils/taskStatus.js'")
    expect(dbServiceSource).not.toContain('function isCompletedTaskLike')
    expect(dbServiceSource).not.toContain('function isCompletedState')

    const completionSources = [
      taskSummarySource,
      taskSummaryServiceSource,
      taskSummaryCompareSource,
      taskAttributionSummarySource,
    ]
    completionSources.forEach((source) => {
      expect(source).toContain("from '../utils/taskStatus.js'")
    })
    expect(COMPLETED_TASK_STATUS_SQL_LIST).toContain("'已完成'")
    expect(taskSummarySource).not.toContain("IN ('completed', 'done')")
    expect(taskSummarySource).not.toContain('COMPLETED_TASK_STATUS_SQL_LIST')
    expect(completionSources.reduce(
      (count, source) => count + (source.match(/\bisCompletedTask\(/g) ?? []).length,
      0,
    )).toBeGreaterThanOrEqual(8)
    expect((taskSummarySource.match(/\bisCompletedMilestone\(/g) ?? []).length).toBeGreaterThanOrEqual(1)
    expect(taskSummaryServiceSource).not.toContain("String(task.status ?? '').toLowerCase() === 'completed'")
    expect(taskAttributionSummarySource).not.toContain("['completed', 'done', 'finished', 'on_time', 'delayed'].includes(status)")
    expect(taskSummarySource).not.toContain("status === '已完成' ||")
    expect(taskSummarySource).not.toContain("status === 'completed' ||")
    expect(taskSummarySource).not.toContain(".in('status', ['已完成', 'completed'])")
  })
})
