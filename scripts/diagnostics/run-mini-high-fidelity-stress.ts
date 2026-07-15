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
    projectId: 'synthetic-yuntaifu-mini',
    taskCount: 96,
    startDate: '2026-04-01',
    months: 18,
  })
  installHighFidelityInMemorySupabase(dataset.tables)
  const result = await runMiniHighFidelitySyntheticStressTest(dataset, {
    buildDurationContext,
    resolveBuildingPatternMatches: resolveV1474BuildingPatternMatches,
  }, {
    maxCases: 36,
    asOfDate: '2027-09-20T08:00:00.000Z',
  })
  const artifacts = await writeMiniHighFidelityStressArtifacts(result)
  console.log(JSON.stringify({
    ok: true,
    projectId: result.projectId,
    executedCaseCount: result.executedCaseCount,
    monthlyProductivity: result.monthlyProductivity,
    observations: result.observations,
    performance: result.performance,
    artifacts,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
})
