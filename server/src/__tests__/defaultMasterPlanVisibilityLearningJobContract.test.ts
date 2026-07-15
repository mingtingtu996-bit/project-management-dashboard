import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readServerFile(...parts: string[]) {
  return readFileSync(resolve(process.cwd(), ...parts), 'utf8')
}

describe('default master-plan visibility learning job contract', () => {
  it('runs daily and participates in scheduler startup and shutdown', () => {
    const jobSource = readServerFile('src', 'jobs', 'defaultMasterPlanVisibilityLearningJob.ts')
    const schedulerSource = readServerFile('src', 'scheduler.ts')

    expect(jobSource).toContain('nextDailyRunAt(6, 35)')
    expect(jobSource).toContain("trigger: 'daily_06_35'")
    expect(jobSource).toContain('runDefaultMasterPlanVisibilityLearningSweep({})')
    expect(schedulerSource).toContain("import { defaultMasterPlanVisibilityLearningJob } from './jobs/defaultMasterPlanVisibilityLearningJob.js'")
    expect(schedulerSource).toContain('defaultMasterPlanVisibilityLearningJob.start()')
    expect(schedulerSource).toContain('defaultMasterPlanVisibilityLearningJob.stop()')
  })

  it('is visible and manually executable through the guarded jobs route', () => {
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(jobsRouteSource).toContain("name: 'defaultMasterPlanVisibilityLearningJob'")
    expect(jobsRouteSource).toContain("schedule: '35 6 * * *'")
    expect(jobsRouteSource).toContain("case 'defaultMasterPlanVisibilityLearningJob'")
    expect(jobsRouteSource).toContain('result: await defaultMasterPlanVisibilityLearningJob.executeNow()')
  })

  it('keeps automated learning behind governed seed publication', () => {
    const serviceSource = readServerFile('src', 'services', 'defaultMasterPlanVisibilityLearningService.ts')

    expect(serviceSource).toContain("publishAnchor: 'manual_governance_required'")
    expect(serviceSource).toContain("requestedRuntimeEffect: 'candidate_only'")
    expect(serviceSource).toContain('writesRuntimePolicy: false')
    expect(serviceSource).toContain('writesTasksOrDependencies: false')
  })
})
