import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  buildTaskSummaryDelayRecords,
  getTaskActualEndDate,
  getTaskPlannedEndDate,
  isTaskDelayedByPeriodEnd,
  resolveTaskSummaryDurationAsOf,
} from '../routes/task-summaries.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'
import type { DurationMetricDto } from '../services/durationMetricService.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const SPRING_FESTIVAL_SHUTDOWN: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  calendarRef: 'work_calendar',
  calendarVersion: 'calendar-v1',
  timezone: 'Asia/Shanghai',
  availability: 'available',
  unavailableReason: null,
  windows: [{
    holidayCode: 'spring-festival-shutdown',
    holidayName: 'Spring Festival shutdown',
    startDate: '2026-02-11',
    endDate: '2026-02-24',
    counts_as_construction_shutdown: true,
  }],
}

const AVAILABLE_DELAY_METRIC: DurationMetricDto = {
  value: 2,
  unit: 'construction_production_day',
  calendarRef: 'official-construction-calendar',
  calendarVersion: '2026.1',
  timezone: 'Asia/Shanghai',
  asOf: '2026-04-12',
  availability: 'available',
  unavailableReason: null,
}

describe('task-summary production delay semantics', () => {
  it('keeps derived delay text display-only and exposes only tasks.delay_reason as confirmable raw evidence', () => {
    expect(buildTaskSummaryDelayRecords({
      isDelayed: true,
      delayDays: 2,
      delayMetric: AVAILABLE_DELAY_METRIC,
      recordedAt: '2026-04-12T00:00:00.000Z',
      rawDelayReason: null,
    })).toEqual([{
      delay_days: 2,
      delay: AVAILABLE_DELAY_METRIC,
      reason: null,
      reason_source: null,
      display_reason: '实际完成时间晚于计划完成时间',
      display_reason_source: 'derived_completion_variance',
      recorded_at: '2026-04-12T00:00:00.000Z',
    }])

    expect(buildTaskSummaryDelayRecords({
      isDelayed: true,
      delayDays: 2,
      delayMetric: AVAILABLE_DELAY_METRIC,
      recordedAt: '2026-04-12T00:00:00.000Z',
      rawDelayReason: '材料到场延后',
    })[0]).toEqual(expect.objectContaining({
      reason: '材料到场延后',
      reason_source: 'tasks.delay_reason',
      display_reason: '实际完成时间晚于计划完成时间',
      display_reason_source: 'derived_completion_variance',
    }))
  })

  it('loads the authoritative task delay_reason and passes it into the response mapper', () => {
    const routeSource = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')
    const serviceSource = readFileSync(resolve(serverRoot, 'src/services/taskSummaryService.ts'), 'utf8')

    expect(routeSource).toMatch(/\.select\('[^']*delay_reason[^']*'\)/)
    expect(serviceSource).toContain('rawDelayReason: task.delay_reason')
  })

  it('uses the shared task attribution projection instead of a route-local WBS resolver', () => {
    const routeSource = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')
    const serviceSource = readFileSync(resolve(serverRoot, 'src/services/taskSummaryService.ts'), 'utf8')

    expect(serviceSource).toContain('buildProjectTaskAttributionProjection(input.taskRows)')
    expect(routeSource).not.toContain('const resolveWbsAttribution =')
  })

  it('does not keep a generic rawQuery wrapper in the task summary route', () => {
    const source = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')

    expect(source).not.toContain('query as rawQuery')
  })

  it('keeps production SQL from privately calculating on-time and delayed counts', () => {
    const routeSource = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')
    const serviceSource = readFileSync(resolve(serverRoot, 'src/services/taskSummaryCompareService.ts'), 'utf8')

    expect(routeSource).not.toContain('end_date::date AS planned_end_date')
    expect(routeSource).not.toContain('completed_at <= planned_end_date')
    expect(routeSource).not.toContain('completed_at > planned_end_date')
    expect(routeSource).not.toContain('actual_end_date > t.planned_end_date')
    expect(serviceSource).toContain('isTaskDelayedByPeriodEnd(task, period.to, input.workCalendar)')
  })

  it('delegates period and daily metrics to the task-summary service without fake progress fallback', () => {
    const source = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')
    const compareAndDailySource = source.slice(source.indexOf("router.get('/projects/:id/task-summary/compare'"))

    expect(compareAndDailySource).toContain('buildTaskSummaryCompareResults({')
    expect(compareAndDailySource).toContain('buildDailyTaskProgressSummary({')
    expect(compareAndDailySource).not.toContain('currentProgress - 10')
    expect(compareAndDailySource).not.toContain('falling back to tasks table')
    expect(compareAndDailySource).not.toContain('route-level-aggregation-approved')
  })

  it('uses project business-day boundaries for daily progress queries', () => {
    const source = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')
    const dailySource = source.slice(source.indexOf("router.get('/projects/:id/daily-progress'"))

    expect(dailySource).toContain('resolveConstructionCalendarContext({ projectId })')
    expect(dailySource).toContain('resolveDailyTaskProgressWindow({')
    expect(dailySource).toContain(".gte('updated_at', dayStartInclusive)")
    expect(dailySource).toContain(".lt('updated_at', dayEndExclusive)")
    expect(dailySource).not.toContain("new Date().toISOString().slice(0, 10)")
    expect(dailySource).not.toContain('`${targetDate} 00:00:00`')
    expect(dailySource).not.toContain('`${targetDate} 23:59:59`')
  })

  it('delegates trend, assignee, and monthly-plan aggregation to the project summary authority', () => {
    const routeSource = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')
    const summarySource = readFileSync(resolve(serverRoot, 'src/services/projectExecutionSummaryService.ts'), 'utf8')

    expect(routeSource).toContain('resolveTaskSummaryTrendWindow({ months: 6, asOf })')
    expect(routeSource).toContain('getTaskSummaryCompletionTrend(projectId, { months: 6, asOf })')
    expect(routeSource).not.toContain('sixMonthsAgo.setMonth(')
    expect(routeSource).not.toContain('sixMonthsAgo.setDate(')
    expect(routeSource).toContain('getTaskSummaryAssigneeRows(projectId)')
    expect(routeSource).toContain('getTaskSummaryMonthlyPlanFulfillmentTrend(projectId)')
    expect(routeSource).not.toContain('async function loadTaskSummaryTrendRows(')
    expect(routeSource).not.toContain('async function loadTaskSummaryAssignees(')
    expect(routeSource).not.toContain('async function loadMonthlyFulfillmentTrend(')
    expect(routeSource).not.toContain('const monthMap: Record<string, TaskSummaryTrendResultRow>')
    expect(routeSource).not.toContain(".from('monthly_plan_items')")

    expect(summarySource).toContain('export async function getTaskSummaryCompletionTrend(')
    expect(summarySource).toContain('export function resolveTaskSummaryTrendWindow(')
    expect(summarySource).toContain('export async function getTaskSummaryAssigneeRows(')
    expect(summarySource).toContain('export async function getTaskSummaryMonthlyPlanFulfillmentTrend(')
    expect(summarySource).toContain('return getMonthlyPlanFulfillmentTrend(projectId, safeMonths)')
  })

  it('delegates project summary filtering, grouping, DTO assembly, and counts to the read-model service', () => {
    const routeSource = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')
    const serviceSource = readFileSync(resolve(serverRoot, 'src/services/taskSummaryService.ts'), 'utf8')
    const projectSummarySource = routeSource.slice(
      routeSource.indexOf("router.get('/projects/:id/task-summary'"),
      routeSource.indexOf("router.get('/projects/:id/task-summary/trend'"),
    )

    expect(projectSummarySource).toContain('buildProjectTaskSummaryReadModel({')
    expect(projectSummarySource).not.toContain('buildProjectTaskAttributionProjection(')
    expect(projectSummarySource).not.toContain('const normalizedTaskById = new Map(')
    expect(projectSummarySource).not.toContain('const groups =')
    expect(projectSummarySource).not.toContain('onTimeCount')
    expect(projectSummarySource).not.toContain('delayedCount')
    expect(projectSummarySource).not.toContain('completedMilestoneCount')
    expect(serviceSource).toContain('export async function buildProjectTaskSummaryReadModel(')
  })

  it('uses planned_end_date before legacy end_date when deciding whether a task is overdue by a period end', () => {
    const task = {
      status: 'in_progress',
      progress: 80,
      planned_end_date: '2026-05-20',
      end_date: '2026-05-01',
    }

    expect(getTaskPlannedEndDate(task)).toBe('2026-05-20')
    expect(isTaskDelayedByPeriodEnd(task, '2026-05-10')).toBe(false)
  })

  it('does not use updated_at as a fake actual completion date', () => {
    const task = {
      status: 'completed',
      progress: 100,
      planned_end_date: '2026-05-10',
      end_date: '2026-05-10',
      actual_end_date: null,
      updated_at: '2026-05-20T10:00:00.000Z',
    }

    expect(getTaskActualEndDate(task)).toBe('')
    expect(isTaskDelayedByPeriodEnd(task, '2026-05-31')).toBe(false)
  })

  it('deducts construction shutdown days for completed-task delay decisions', () => {
    const task = {
      status: 'completed',
      progress: 100,
      planned_end_date: '2026-02-10',
      end_date: '2026-02-01',
      actual_end_date: '2026-02-24',
    }

    expect(isTaskDelayedByPeriodEnd(task, '2026-02-28', SPRING_FESTIVAL_SHUTDOWN)).toBe(false)
  })

  it('derives fallback as-of from the construction-calendar timezone at a UTC date boundary', () => {
    expect(resolveTaskSummaryDurationAsOf({}, {
      ...SPRING_FESTIVAL_SHUTDOWN,
      timezone: 'Asia/Shanghai',
    }, new Date('2026-07-19T18:00:00.000Z'))).toBe('2026-07-20')
  })
})
