import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('scheduler lifecycle contract', () => {
  it('has no import-time scheduler start or scheduler-owned process exit', () => {
    const scheduler = readFileSync(resolve(workspaceRoot, 'server/src/scheduler.ts'), 'utf8')

    expect(scheduler).toContain('export async function startAllJobs')
    expect(scheduler).toContain('export async function stopAllJobs')
    expect(scheduler).not.toMatch(/\nstartAllJobs\(\)\s*$/)
    expect(scheduler).not.toContain('process.exit(0)')
    expect(scheduler).not.toContain("process.on('SIGTERM'")
    expect(scheduler).not.toContain("process.on('SIGINT'")
  })

  it('lets the server bootstrap own scheduler readiness and graceful shutdown', () => {
    const index = readFileSync(resolve(workspaceRoot, 'server/src/index.ts'), 'utf8')

    expect(index).toContain('await schedulerModule.startAllJobs')
    expect(index).toContain('markRuntimeSchedulerReady(schedulerStarted)')
    expect(index).toContain('beginJobRuntimeShutdown()')
    expect(index).toContain('waitForActiveJobsToDrain')
    expect(index).toContain('releaseSchedulerLeadership')
    expect(index).toContain('closeDatabasePool')
    expect(index).toContain('server.close(')

    const shutdownSection = index.slice(
      index.indexOf('function registerGracefulShutdown'),
      index.indexOf('// 应用初始化'),
    )
    expect(shutdownSection.indexOf('waitForActiveJobsToDrain')).toBeLessThan(
      shutdownSection.indexOf('releaseSchedulerLeadership'),
    )
  })

  it('propagates planning-governance branch failures and reschedules weekly work by wall clock', () => {
    const scheduler = readFileSync(resolve(workspaceRoot, 'server/src/scheduler.ts'), 'utf8')
    const planningSection = scheduler.slice(
      scheduler.indexOf('class PlanningGovernanceJob'),
      scheduler.indexOf('class OperationalNotificationJob'),
    )
    const weeklySection = scheduler.slice(
      scheduler.indexOf('class WeeklyDigestJob'),
      scheduler.indexOf('class MaterialArrivalReminderJob'),
    )

    expect(planningSection).toContain('ScopedBatchOperationError')
    expect(planningSection).toContain('planningGovernanceFailures')
    expect(weeklySection).toContain("schedule: { kind: 'weekly', dayOfWeek: 1, hour: 9, minute: 0 }")
    expect(weeklySection).toContain("jobName: 'weeklyDigestJob'")
    expect(weeklySection).not.toContain('setInterval')
  })

  it('reschedules central non-duration jobs from wall-clock slots after every run', () => {
    const scheduler = readFileSync(resolve(workspaceRoot, 'server/src/scheduler.ts'), 'utf8')
    const classNames = [
      'ConditionAlertJob',
      'ProjectDailySnapshotJob',
      'DailyTaskDurationForecastJob',
      'DataQualityJob',
      'PlanningGovernanceJob',
      'OperationalNotificationJob',
      'NotificationLifecycleJob',
      'NotificationReconciliationJob',
      'WeeklyDigestJob',
      'MaterialArrivalReminderJob',
    ]

    for (const className of classNames) {
      const start = scheduler.indexOf(`class ${className}`)
      const nextClassStart = scheduler.indexOf('\nclass ', start + 1)
      const section = scheduler.slice(start, nextClassStart === -1 ? undefined : nextClassStart)

      expect(start, `${className} should exist`).toBeGreaterThan(-1)
      expect(section, `${className} should use a persistent wall-clock timer`).toContain('PersistentWallClockJobTimer')
      expect(section, `${className} should not use a drifting interval`).not.toContain('setInterval')
      expect(section, `${className} should keep an explicit wall-clock schedule`).toContain('schedule: { kind:')
    }

    const durationForecastSection = scheduler.slice(
      scheduler.indexOf('class DailyTaskDurationForecastJob'),
      scheduler.indexOf('class DataQualityJob'),
    )
    expect(durationForecastSection).toContain("if (triggeredBy === 'scheduler') throw error")
  })

  it('fails scheduler readiness when the persistent slot ledger is unavailable', () => {
    const scheduler = readFileSync(resolve(workspaceRoot, 'server/src/scheduler.ts'), 'utf8')
    const startSection = scheduler.slice(
      scheduler.indexOf('export async function startAllJobs'),
      scheduler.indexOf('function stopScheduledJobTimers'),
    )

    expect(startSection).toContain('await assertPersistentJobScheduleReady()')
    expect(startSection.indexOf('await assertPersistentJobScheduleReady()')).toBeLessThan(
      startSection.indexOf('schedulerStarted = true'),
    )
  })
})
