import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BuildingPatternScheduleRuntimeBenchmarkResult } from './buildingPatternScheduleCalibrationService.js'
import {
  evaluateWbsTemplateGoldenBenchmarkRunGate,
  type WbsTemplateGoldenBenchmarkRunResult,
} from './wbsTemplateGoldenBenchmarkGateService.js'

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)))

export const BUILDING_PATTERN_SCHEDULE_RUNTIME_BENCHMARK_ARTIFACT_PATH = resolve(
  repoRoot,
  'artifacts/reports/wbs-template-golden-benchmark-runtime-results.json',
)

function readRuntimeResultsPayload(value: unknown): WbsTemplateGoldenBenchmarkRunResult[] | null {
  if (Array.isArray(value)) return value as WbsTemplateGoldenBenchmarkRunResult[]
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).runtimeResults)) {
    return (value as { runtimeResults: WbsTemplateGoldenBenchmarkRunResult[] }).runtimeResults
  }
  return null
}

export function loadBuildingPatternScheduleRuntimeBenchmarkResults(
  options: { artifactPath?: string | null } = {},
): BuildingPatternScheduleRuntimeBenchmarkResult[] | null {
  const artifactPath = options.artifactPath || BUILDING_PATTERN_SCHEDULE_RUNTIME_BENCHMARK_ARTIFACT_PATH
  if (!existsSync(artifactPath)) return null

  try {
    const parsed = JSON.parse(readFileSync(artifactPath, 'utf8'))
    const runtimeResults = readRuntimeResultsPayload(parsed)
    if (!runtimeResults) return null

    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(runtimeResults)
    return gate.status === 'pass' ? runtimeResults : null
  } catch {
    return null
  }
}
