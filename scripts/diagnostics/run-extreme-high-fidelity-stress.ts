import {
  generateMiniHighFidelitySyntheticDataset,
  runMiniHighFidelitySyntheticStressTest,
  writeMiniHighFidelityStressArtifacts,
} from '../../server/src/services/highFidelitySyntheticStressService.js'
import { buildDurationContext } from '../../server/src/services/durationContextService.js'
import {
  clearAlgorithmSeedResolverCache,
  resolveV1474BuildingPatternMatches,
} from '../../server/src/services/algorithmSeedResolver.js'
import { installHighFidelityInMemorySupabase } from './high-fidelity-in-memory-supabase.js'

async function main() {
  clearAlgorithmSeedResolverCache()
  const dataset = generateMiniHighFidelitySyntheticDataset({
    projectId: 'synthetic-yuntaifu-extreme',
    taskCount: 2_500,
    startDate: '2026-04-01',
    months: 36,
    progressSnapshotMode: 'daily',
    durationExperienceSampleCount: 5_000,
  })
  installHighFidelityInMemorySupabase(dataset.tables)
  const result = await runMiniHighFidelitySyntheticStressTest(dataset, {
    buildDurationContext,
    resolveBuildingPatternMatches: resolveV1474BuildingPatternMatches,
  }, {
    maxCases: 2_500,
    concurrency: 16,
    asOfDate: '2029-03-20T08:00:00.000Z',
  })
  const artifacts = await writeMiniHighFidelityStressArtifacts(result, {
    fileBase: `high-fidelity-synthetic-stress-extreme-${new Date().toISOString().slice(0, 10)}`,
  })
  console.log(JSON.stringify({
    ok: true,
    phase: 'extreme',
    projectId: result.projectId,
    executedCaseCount: result.executedCaseCount,
    datasetProfile: result.datasetProfile,
    monthlyProductivity: result.monthlyProductivity,
    monthlyProductivityIndependent: result.monthlyProductivityIndependent,
    monthlyProductivityCompensated: result.monthlyProductivityCompensated,
    monthlyProductivityStats: result.monthlyProductivityStats,
    monthlyCompensationUplift: result.monthlyCompensationUplift,
    ruleCoverage: result.ruleCoverage,
    observations: result.observations,
    performance: result.performance,
    artifacts,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    phase: 'extreme',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
