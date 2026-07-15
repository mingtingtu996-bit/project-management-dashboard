import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readServerFile(...segments: string[]) {
  const cwd = process.cwd()
  const root = cwd.split(/[\\/]/).pop()?.toLowerCase() === 'server'
    ? resolve(cwd, '..')
    : cwd
  return readFileSync(resolve(root, 'server', ...segments), 'utf8')
}

describe('conditionAlertJob distributed lease contract', () => {
  it('wraps execution in a PostgreSQL advisory job lease', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')
    const conditionAlertJobSource = schedulerSource.slice(
      schedulerSource.indexOf('class ConditionAlertJob'),
      schedulerSource.indexOf('class ProjectDailySnapshotJob'),
    )

    expect(schedulerSource).toContain('runWithJobLease')
    expect(conditionAlertJobSource).toContain('runWithJobLease(')
    expect(conditionAlertJobSource).toContain("jobName: 'conditionAlertJob'")
    expect(conditionAlertJobSource).toContain('lease_not_acquired')
    expect(conditionAlertJobSource).toContain('lease.assertActive()')
    expect(conditionAlertJobSource.match(/lease\.assertActive\(\)/g)?.length).toBeGreaterThanOrEqual(6)
    expect(jobsRouteSource).toContain('runWithJobLease')
    expect(jobsRouteSource).toContain("runApiJob('conditionAlertJob'")
    expect(jobsRouteSource).toContain('useLease: true')
    expect(jobsRouteSource).toContain("reason: 'lease_not_acquired'")
    expect(jobsRouteSource).toContain('lease?.assertActive()')
    expect(jobsRouteSource).toContain('runConditionAlertScope(warningService, projectId, lease)')
  })
})
