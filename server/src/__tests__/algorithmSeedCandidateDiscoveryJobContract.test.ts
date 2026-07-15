import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..', '..')

function readServerFile(...parts: string[]) {
  return readFileSync(resolve(workspaceRoot, 'server', ...parts), 'utf8')
}

describe('algorithmSeedCandidateDiscoveryJob contract', () => {
  it('is scheduled, stoppable, and manually executable from the jobs route', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(schedulerSource).toContain("import { algorithmSeedCandidateDiscoveryJob } from './jobs/algorithmSeedCandidateDiscoveryJob.js'")
    expect(schedulerSource).toContain('algorithmSeedCandidateDiscoveryJob.start()')
    expect(schedulerSource).toContain('algorithmSeedCandidateDiscoveryJob.stop()')

    expect(jobsRouteSource).toContain("name: 'algorithmSeedCandidateDiscoveryJob'")
    expect(jobsRouteSource).toContain("schedule: '40 5 * * *'")
    expect(jobsRouteSource).toContain("case 'algorithmSeedCandidateDiscoveryJob'")
    expect(jobsRouteSource).toContain('result: await algorithmSeedCandidateDiscoveryJob.executeNow(projectScope)')
  })

  it('keeps candidate discovery backend-only and tied to automatic governance', () => {
    const serviceSource = readServerFile('src', 'services', 'algorithmSeedCandidateDiscoveryService.ts')
    const routeSource = readServerFile('src', 'routes', 'algorithm-seeds.ts')

    expect(serviceSource).toContain('autoGovernAlgorithmSeedUpgradeCandidate')
    expect(serviceSource).toContain('metadata.process_constraint_observation')
    expect(serviceSource).toContain('duration_experience_samples.standard_internal_flow')
    expect(serviceSource).toContain('duration_experience_samples.cross_item_workflow')
    expect(serviceSource).toContain('process_constraint')
    const removedSeedType = ['acceptance', 'timeline', 'candidate'].join('_')
    expect(serviceSource).not.toContain(removedSeedType)
    expect(serviceSource).not.toContain("seedType: 'resource_class'")

    expect(routeSource).toContain("router.post('/upgrade-candidates/discover'")
    expect(routeSource).not.toContain('manualReview')
  })
})
