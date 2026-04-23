import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('responsibility alert scheduler contract', () => {
  it('registers the responsibility alert job in scheduler and jobs routes', () => {
    const schedulerSource = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'scheduler.ts'),
      'utf8',
    )
    const jobsRouteSource = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'routes', 'jobs.ts'),
      'utf8',
    )

    expect(schedulerSource).toContain(
      "import { responsibilityAlertJob } from './jobs/responsibilityAlertJob.js'",
    )
    expect(schedulerSource).toContain('responsibilityAlertJob.start()')
    expect(schedulerSource).toContain('responsibilityAlertJob.stop()')

    expect(jobsRouteSource).toContain("name: 'responsibilityAlertJob'")
    expect(jobsRouteSource).toContain('result: await responsibilityAlertJob.executeNow()')
  })
})
