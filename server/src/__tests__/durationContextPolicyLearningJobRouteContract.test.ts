import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..', '..')

function readServerFile(...parts: string[]) {
  return readFileSync(resolve(workspaceRoot, 'server', ...parts), 'utf8')
}

describe('durationContextPolicyLearningJob jobs route contract', () => {
  it('is scheduled, observable, and manually executable within the visible project scope', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(schedulerSource).toContain(
      "import { durationContextPolicyLearningJob } from './jobs/durationContextPolicyLearningJob.js'",
    )
    expect(schedulerSource).toContain('durationContextPolicyLearningJob.start()')
    expect(schedulerSource).toContain('durationContextPolicyLearningJob.stop()')

    expect(jobsRouteSource).toContain(
      "import { durationContextPolicyLearningJob } from '../jobs/durationContextPolicyLearningJob.js'",
    )
    expect(jobsRouteSource).toContain("name: 'durationContextPolicyLearningJob'")
    expect(jobsRouteSource).toContain("schedule: '20 6 * * *'")
    expect(jobsRouteSource).toContain("case 'durationContextPolicyLearningJob'")
    expect(jobsRouteSource).toContain(
      'result: await durationContextPolicyLearningJob.executeNow(projectScope)',
    )
  })
})
