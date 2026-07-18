import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  getTaskActualEndDate,
  getTaskPlannedEndDate,
  isTaskDelayedByPeriodEnd,
} from '../routes/task-summaries.js'
import type { ConstructionCalendarContext } from '../services/constructionCalendar.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const SPRING_FESTIVAL_SHUTDOWN: ConstructionCalendarContext = {
  basis: 'official_construction_calendar_seed',
  windows: [{
    holidayCode: 'spring-festival-shutdown',
    holidayName: 'Spring Festival shutdown',
    startDate: '2026-02-11',
    endDate: '2026-02-24',
    counts_as_construction_shutdown: true,
  }],
}

describe('task-summary production delay semantics', () => {
  it('uses the shared task attribution projection instead of a route-local WBS resolver', () => {
    const source = readFileSync(resolve(serverRoot, 'src/routes/task-summaries.ts'), 'utf8')

    expect(source).toContain('buildProjectTaskAttributionProjection(taskRows')
    expect(source).not.toContain('const resolveWbsAttribution =')
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
})
