import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  evaluateWbsTemplateGoldenBenchmarkRunGate,
  WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
  type WbsTemplateGoldenBenchmarkRunResult,
} from '../services/wbsTemplateGoldenBenchmarkGateService.js'

function buildPassingResults(): WbsTemplateGoldenBenchmarkRunResult[] {
  return WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => ({
    projectCode: entry.projectCode,
    recommendationKey: entry.recommendationKey,
    durationOutputCode: 'plan_reference',
    durationOutputSummary: {
      planReferenceRowCount: 1,
      templateFastEstimateRowCount: 0,
      contextualReferenceRowCount: 1,
      writablePlanTaskDurationRowCount: 1,
    },
    generatedRowCount: (entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange)[0],
    coverageRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumCoverageRate,
    deepCoverageRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDeepCoverageRate,
    expectedDurationDaysRange: entry.expectedDurationDaysRange,
    expectedRuntimeReplayRowCountRange: entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange,
    actualScheduleStartDate: '2026-06-01',
    actualScheduleEndDate: '2028-12-31',
    actualScheduleDurationDays: Math.round((entry.expectedDurationDaysRange[0] + entry.expectedDurationDaysRange[1]) / 2),
    durationDeviationRatio: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio,
    dependencyPassRate: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDependencyPassRate,
    missingRequiredTemplateIds: [],
    missingStableCodePrefixes: [],
  }))
}

describe('verify WBS template golden benchmark CLI', () => {
  it('resolves the tsx CLI from the server dependency installation', () => {
    const scriptPath = join(__dirname, '../../..', 'scripts/verify-wbs-template-golden-benchmark.mjs')
    const source = readFileSync(scriptPath, 'utf8')

    expect(source).toContain("createRequire(resolve(repoRoot, 'server/package.json'))")
    expect(source).toContain("serverRequire.resolve('tsx/cli')")
    expect(source).not.toContain("import.meta.resolve('tsx/cli')")
  })

  it('accepts a complete external runtime replay result file and blocks on the same commercial gate', () => {
    const runtimeOutputPath = join(
      __dirname,
      '../../..',
      'artifacts/reports/wbs-template-golden-benchmark-verification.json',
    )
    if (existsSync(runtimeOutputPath)) unlinkSync(runtimeOutputPath)
    const dir = mkdtempSync(join(tmpdir(), 'wbs-golden-'))
    const resultPath = join(dir, 'results.json')
    writeFileSync(resultPath, JSON.stringify(buildPassingResults()), 'utf8')

    const result = spawnSync(
      process.execPath,
      ['scripts/verify-wbs-template-golden-benchmark.mjs', resultPath],
      { cwd: join(__dirname, '../../..'), encoding: 'utf8' },
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('"status": "pass"')
    expect(result.stdout).toContain('"runtimeGate"')
    expect(result.stdout).toContain('"resultCount": 13')
    expect(existsSync(runtimeOutputPath)).toBe(true)
    const verification = JSON.parse(readFileSync(runtimeOutputPath, 'utf8')) as Record<string, unknown>
    expect(verification.status).toBe('pass')
  }, 60_000)

  it('accepts a complete runtime replay result file', () => {
    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(buildPassingResults())

    expect(gate.status).toBe('pass')
    expect(gate.resultCount).toBe(13)
  })

  it('accepts a large external runtime replay result file without embedding the payload in the tsx command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wbs-golden-large-'))
    const resultPath = join(dir, 'large-results.json')
    const results = buildPassingResults().map((result) => ({
      ...result,
      diagnosticPayload: 'x'.repeat(120_000),
    }))
    writeFileSync(resultPath, JSON.stringify(results), 'utf8')

    const result = spawnSync(
      process.execPath,
      ['scripts/verify-wbs-template-golden-benchmark.mjs', resultPath],
      { cwd: join(__dirname, '../../..'), encoding: 'utf8' },
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('"status": "pass"')
  }, 60_000)

  it('fails when a plan-reference runtime replay still contains fast-template evidence', () => {
    const results = buildPassingResults()
    results[0] = {
      ...results[0],
      durationOutputSummary: {
        planReferenceRowCount: 1,
        templateFastEstimateRowCount: 1,
        contextualReferenceRowCount: 1,
        writablePlanTaskDurationRowCount: 1,
      },
    }
    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(results)

    expect(gate.status).toBe('fail')
    expect(gate.findings.map((finding) => finding.code)).toContain('template_fast_estimate_in_plan_reference_replay')
  })

  it('fails when runtime replay duration deviation exceeds the commercial gate', () => {
    const results = buildPassingResults()
    results[0] = {
      ...results[0],
      durationDeviationRatio: WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio + 0.01,
    }
    const gate = evaluateWbsTemplateGoldenBenchmarkRunGate(results)

    expect(gate.status).toBe('fail')
    expect(gate.findings.map((finding) => finding.code)).toContain('duration_deviation_above_threshold')
  })
})
