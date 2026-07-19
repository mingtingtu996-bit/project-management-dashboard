import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..', '..')

function readServerFile(...parts: string[]) {
  return readFileSync(resolve(workspaceRoot, 'server', ...parts), 'utf8')
}

describe('standardWorkDurationSeedReplayJob contract', () => {
  it('is scheduled, stoppable, and manually executable from the jobs route', () => {
    const schedulerSource = readServerFile('src', 'scheduler.ts')
    const jobsRouteSource = readServerFile('src', 'routes', 'jobs.ts')

    expect(schedulerSource).toContain("import { standardWorkDurationSeedReplayJob } from './jobs/standardWorkDurationSeedReplayJob.js'")
    expect(schedulerSource).toContain('standardWorkDurationSeedReplayJob.start()')
    expect(schedulerSource).toContain('standardWorkDurationSeedReplayJob.stop()')

    expect(jobsRouteSource).toContain("name: 'standardWorkDurationSeedReplayJob'")
    expect(jobsRouteSource).toContain("schedule: '15 6 * * *'")
    expect(jobsRouteSource).toContain("case 'standardWorkDurationSeedReplayJob'")
    expect(jobsRouteSource).toMatch(/result:\s+await standardWorkDurationSeedReplayJob\.executeNow\((?:projectScope)?\)/)
  })

  it('keeps replay seed writes blocked while routing eligible project P50 candidates through governance', () => {
    const jobSource = readServerFile('src', 'jobs', 'standardWorkDurationSeedReplayJob.ts')
    const serviceSource = readServerFile('src', 'services', 'standardWorkDurationSeedReplayGovernanceService.ts')
    const bridgeSource = readServerFile('src', 'services', 'standardWorkDurationSeedReplayCandidateBridgeService.ts')

    expect(jobSource).toContain('buildStandardWorkDurationSeedReplayGovernanceReport')
    expect(jobSource).toContain('seedWritesBlocked')
    expect(jobSource).toContain('createStandardWorkDurationReplayUpgradeCandidates')
    expect(jobSource).not.toContain('createAlgorithmSeedUpgradeCandidate')
    expect(jobSource).not.toContain('autoGovernAlgorithmSeedUpgradeCandidate')
    expect(serviceSource).toContain("seedWritePolicy: 'never_write_seed_from_replay'")
    expect(serviceSource).toContain("allowedUse: 'backend_governance_report'")
    expect(bridgeSource).toContain('createAlgorithmSeedUpgradeCandidate')
    expect(bridgeSource).toContain("const autoGovernEligible = queueKind === 'p50_review' && Boolean(report.projectId)")
    expect(bridgeSource).toContain("actionPolicy: autoGovernEligible ? 'auto_govern' : 'candidate_only'")
    expect(bridgeSource).toContain("? 'auto_govern_only_through_duration_learning_lifecycle'")
    expect(bridgeSource).toContain(": 'candidate_only_no_runtime_effect_until_governed'")
    expect(bridgeSource).toContain("seedWritePolicy: 'never_write_seed_from_replay'")
    expect(bridgeSource).not.toContain('autoGovernAlgorithmSeedUpgradeCandidate')
  })
})
