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
    projectId: 'synthetic-yuntaifu-medium',
    taskCount: 500,
    startDate: '2026-04-01',
    months: 36,
    progressSnapshotMode: 'daily',
    durationExperienceSampleCount: 512,
  })
  installHighFidelityInMemorySupabase(dataset.tables)
  const result = await runMiniHighFidelitySyntheticStressTest(dataset, {
    buildDurationContext,
    resolveBuildingPatternMatches: resolveV1474BuildingPatternMatches,
  }, {
    maxCases: 160,
    concurrency: 12,
    asOfDate: '2028-03-20T08:00:00.000Z',
  })
  const artifacts = await writeMiniHighFidelityStressArtifacts(result, {
    fileBase: `high-fidelity-synthetic-stress-medium-${new Date().toISOString().slice(0, 10)}`,
  })
  console.log(JSON.stringify({
    ok: true,
    phase: 'medium',
    projectId: result.projectId,
    executedCaseCount: result.executedCaseCount,
    datasetProfile: result.datasetProfile,
    monthlyProductivity: result.monthlyProductivity,
    monthlyProductivityIndependent: result.monthlyProductivityIndependent,
    monthlyProductivityCompensated: result.monthlyProductivityCompensated,
    ruleCoverage: result.ruleCoverage,
    observations: result.observations,
    performance: result.performance,
    artifacts,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    phase: 'medium',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
