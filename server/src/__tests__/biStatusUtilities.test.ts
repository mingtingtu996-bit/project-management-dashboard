import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  calculateOverallProgress,
  calculateWeightedProgress,
} from '../utils/progressCalculation.js'
import { isActiveIssue } from '../utils/issueStatus.js'
import { isActiveObstacle } from '../utils/obstacleStatus.js'
import { isActiveRisk } from '../utils/riskStatus.js'
import {
  isCompletedMilestone,
  isCompletedTask,
  isInProgressTask,
} from '../utils/taskStatus.js'
import { isActiveWarning } from '../utils/warningStatus.js'
import { isPendingCondition } from '../utils/conditionStatus.js'

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

    expect(calculateWeightedProgress(tasks)).toBe(70)
    expect(calculateOverallProgress(tasks)).toBe(70)
  })

  it('keeps completion checks delegated to the shared taskStatus utility', () => {
    const dbServiceSource = readFileSync(join(process.cwd(), 'src/services/dbService.ts'), 'utf8')
    const taskSummarySource = readFileSync(join(process.cwd(), 'src/routes/task-summaries.ts'), 'utf8')

    expect(dbServiceSource).toContain("from '../utils/taskStatus.js'")
    expect(dbServiceSource).not.toContain('function isCompletedTaskLike')
    expect(dbServiceSource).not.toContain('function isCompletedState')

    expect(taskSummarySource).toContain("from '../utils/taskStatus.js'")
    expect(taskSummarySource).not.toContain("status === '已完成' ||")
    expect(taskSummarySource).not.toContain("status === 'completed' ||")
    expect(taskSummarySource).not.toContain(".in('status', ['已完成', 'completed'])")
  })
})
