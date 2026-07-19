import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..', '..')

function readServerFile(...parts: string[]) {
  return readFileSync(resolve(workspaceRoot, 'server', ...parts), 'utf8')
}

describe('constructionDependencyReplayCalibrationJob contract', () => {
  it('is scheduled, stoppable, and manually executable from the jobs route', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(schedulerSource).toContain("import { constructionDependencyReplayCalibrationJob } from './jobs/constructionDependencyReplayCalibrationJob.js'")
    expect(schedulerSource).toContain('constructionDependencyReplayCalibrationJob.start()')
    expect(schedulerSource).toContain('constructionDependencyReplayCalibrationJob.stop()')

    expect(jobsRouteSource).toContain("name: 'constructionDependencyReplayCalibrationJob'")
    expect(jobsRouteSource).toContain("schedule: '30 6 * * *'")
    expect(jobsRouteSource).toContain("case 'constructionDependencyReplayCalibrationJob'")
    expect(jobsRouteSource).toMatch(/result:\s+await constructionDependencyReplayCalibrationJob\.executeNow\((?:projectScope)?\)/)
  })

  it('runs the real candidate and network-outcome producer while keeping seed and task-dependency facts immutable', () => {
    const jobSource = readServerFile('src', 'jobs', 'constructionDependencyReplayCalibrationJob.ts')
    const serviceSource = readServerFile('src', 'services', 'constructionDependencyReplayCalibrationService.ts')

    expect(jobSource).toContain('collectConstructionDependencyReplayCalibrationReport')
    expect(jobSource).toContain('persistConstructionDependencyReplayCalibrationCandidatesFromReport')
    expect(jobSource).toContain('producerOutcomeCount')
    expect(jobSource).toContain('seedWritesBlocked')
    expect(jobSource).toContain('taskDependencyWritesBlocked')
    expect(jobSource).not.toContain('createAlgorithmSeedUpgradeCandidate')
    expect(jobSource).not.toContain('autoGovernAlgorithmSeedUpgradeCandidate')
    expect(jobSource).not.toContain('INSERT INTO task_dependencies')
    expect(jobSource).not.toContain('UPDATE task_dependencies')
    expect(serviceSource).toContain('INSERT INTO public.duration_plan_network_outcomes')
    expect(serviceSource).toContain('createAndPersistAlgorithmAssetCandidateEvent')
    expect(serviceSource).toContain("seedWritePolicy: 'never_write_seed_from_replay'")
    expect(serviceSource).toContain("taskDependencyWritePolicy: 'never_write_task_dependencies_from_replay'")
  })
})
