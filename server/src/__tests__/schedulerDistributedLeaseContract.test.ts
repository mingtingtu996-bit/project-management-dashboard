import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

function readServerSource(...segments: string[]) {
  const cwd = process.cwd()
  const serverRoot = fs.existsSync(path.resolve(cwd, 'src', 'scheduler.ts'))
    ? cwd
    : path.resolve(cwd, 'server')
  return fs.readFileSync(path.resolve(serverRoot, ...segments), 'utf8')
}

function classSection(source: string, className: string, nextClassName?: string) {
  const start = source.indexOf(`class ${className}`)
  const end = nextClassName ? source.indexOf(`class ${nextClassName}`, start + 1) : source.length
  expect(start, `${className} must exist`).toBeGreaterThanOrEqual(0)
  expect(end, `${className} boundary must exist`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('scheduler distributed job leases', () => {
  const schedulerSource = readServerSource('src', 'scheduler.ts')
  const scheduledJobs = [
    ['ProjectDailySnapshotJob', 'DailyTaskDurationForecastJob', 'projectDailySnapshotJob'],
    ['PlanningGovernanceJob', 'OperationalNotificationJob', 'planningGovernanceJob'],
    ['OperationalNotificationJob', 'NotificationLifecycleJob', 'operationalNotificationJob'],
    ['NotificationLifecycleJob', 'NotificationReconciliationJob', 'notificationLifecycleJob'],
    ['NotificationReconciliationJob', 'WeeklyDigestJob', 'notificationReconciliationJob'],
    ['WeeklyDigestJob', 'MaterialArrivalReminderJob', 'weeklyDigestJob'],
    ['MaterialArrivalReminderJob', undefined, 'materialArrivalReminderJob'],
  ] as const

  it.each(scheduledJobs)('%s holds its own distributed lease around retry and side effects', (
    className,
    nextClassName,
    jobName,
  ) => {
    const section = classSection(schedulerSource, className, nextClassName)
    const leaseIndex = section.indexOf('runWithJobLease(')
    const retryIndex = section.indexOf('runJobWithRetry(')

    expect(section).toContain(`jobName: '${jobName}'`)
    expect(leaseIndex).toBeGreaterThanOrEqual(0)
    expect(retryIndex).toBeGreaterThan(leaseIndex)
    expect(section).toContain('lease.assertActive()')
    expect(section).toContain('if (!lease.acquired)')
    expect(section).toContain("reason: 'lease_not_acquired'")
  })

  it('projectDailySnapshotJob reconciles task progress snapshots inside the same leased retry', () => {
    const section = classSection(
      schedulerSource,
      'ProjectDailySnapshotJob',
      'DailyTaskDurationForecastJob',
    )

    expect(schedulerSource).toContain('reconcileAllProjectTaskProgressSnapshots')
    expect(section).toContain('runScheduledProjectDailySnapshotCycle({')
    expect(section).toContain('reconcileTaskProgressSnapshots: () => reconcileAllProjectTaskProgressSnapshots()')
    expect(section).toContain('assertLeaseActive: lease.assertActive')
    expect(section).toContain('writeProjectDailySnapshots: () => recordProjectDailySnapshots()')
  })

  it('warning impact governance holds a dedicated lease around its retry and sweep', () => {
    const source = readServerSource('src', 'jobs', 'warningImpactSignalGovernanceJob.ts')
    const leaseIndex = source.indexOf('runWithJobLease(')
    const retryIndex = source.indexOf('runJobWithRetry(')

    expect(source).toContain("jobName: 'warningImpactSignalGovernanceJob'")
    expect(leaseIndex).toBeGreaterThanOrEqual(0)
    expect(retryIndex).toBeGreaterThan(leaseIndex)
    expect(source).toContain('lease.assertActive()')
    expect(source).toContain('if (!lease.acquired)')
    expect(source).toContain("reason: 'lease_not_acquired'")
  })
})
