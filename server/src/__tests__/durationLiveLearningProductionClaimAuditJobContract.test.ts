import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..', '..')

function readServerFile(...parts: string[]) {
  return readFileSync(resolve(workspaceRoot, 'server', ...parts), 'utf8')
}

describe('durationLiveLearningProductionClaimAuditJob contract', () => {
  it('is scheduled, stoppable, and manually executable from the jobs route', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(schedulerSource).toContain("import { durationLiveLearningProductionClaimAuditJob } from './jobs/durationLiveLearningProductionClaimAuditJob.js'")
    expect(schedulerSource).toContain('durationLiveLearningProductionClaimAuditJob.start()')
    expect(schedulerSource).toContain('durationLiveLearningProductionClaimAuditJob.stop()')

    expect(jobsRouteSource).toContain("name: 'durationLiveLearningProductionClaimAuditJob'")
    expect(jobsRouteSource).toContain("schedule: '45 6 * * *'")
    expect(jobsRouteSource).toContain("case 'durationLiveLearningProductionClaimAuditJob'")
    expect(jobsRouteSource).toMatch(/result:\s+await durationLiveLearningProductionClaimAuditJob\.executeNow\(\)/)
  })

  it('keeps the production claim audit read-only and separate from runtime publishing or fact rewrites', () => {
    const jobSource = readServerFile('src', 'jobs', 'durationLiveLearningProductionClaimAuditJob.ts')

    expect(jobSource).toContain('buildDurationLiveLearningProductionClaimAuditFromDb')
    expect(jobSource).toContain("runtimeMutationPolicy: 'none_audit_only'")
    expect(jobSource).toContain("factMutationPolicy: 'fact_and_commitment_assets_locked'")
    expect(jobSource).toContain('requestedFactRewriteAssetKeys: []')
    expect(jobSource).not.toContain('writeDurationLearningScopeEvidence')
    expect(jobSource).not.toContain('autoGovernAlgorithmSeedUpgradeCandidate')
    expect(jobSource).not.toMatch(/\binsert\s+into\b/i)
    expect(jobSource).not.toMatch(/\bupdate\s+public\./i)
  })
})
