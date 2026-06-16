import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from '../seeds/wbsTemplateRealProjectCoverageMatrix.js'
import {
  evaluateWbsTemplateGoldenBenchmarkRunGate,
  WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS,
} from '../services/wbsTemplateGoldenBenchmarkGateService.js'
import { generateWbsTemplateRows, loadWbsTemplateNodes } from '../services/wbsTemplateGenerationService.js'
import { runWbsTemplateGoldenBenchmarkReplay } from '../services/wbsTemplateGoldenBenchmarkReplayService.js'

type GenerateWbsTemplateRowsResult = Awaited<ReturnType<typeof generateWbsTemplateRows>>

vi.mock('../services/wbsTemplateGenerationService.js', () => ({
  generateWbsTemplateRows: vi.fn(),
  loadWbsTemplateNodes: vi.fn(),
}))

function buildGovernedReplayRows(params: {
  requiredTemplateIds: readonly string[]
  requiredStableCodePrefixes: readonly string[]
  durationDays?: number
  rowCount?: number
}) {
  const templateIds = params.requiredTemplateIds.length > 0
    ? params.requiredTemplateIds
    : ['fallback-template']
  const plannedStartDate = '2026-06-01'
  const plannedEndDate = addDays(plannedStartDate, Math.max(1, Math.round(params.durationDays ?? 365)) - 1)
  const baseRows = [
    ...templateIds.map((templateId, index) => ({
      clientRowId: `template-row-${index}`,
      parentClientRowId: null,
      parentRowId: null,
      sortOrder: index,
      predecessorClientRowIds: [],
      predecessorDependencies: [],
      durationSuggestion: {
        recommendedDurationDays: 10,
        conservativeDurationDays: 12,
        durationOutputCode: 'plan_reference',
        durationOutputWriteEvaluation: {
          allowed: true,
          outputCode: 'plan_reference',
          target: 'plan_task_duration',
        },
        durationOutputPromotion: {
          fromOutputCode: 'contextual_reference',
          toOutputCode: 'plan_reference',
          promotionAllowed: true,
        },
        contextualReferenceDays: 10,
        planReferenceDays: 10,
        templateFastEstimateDays: null,
        confidenceLevel: 'medium',
        confidenceScore: 0.8,
        forecastSource: 'mock_contextual_reference',
        durationCalibrationSource: 'seed',
        durationProvenance: 'standard_seed',
        businessReason: null,
      },
      values: {
        source_template_id: templateId,
        template_id: templateId,
        planned_start_date: plannedStartDate,
        planned_end_date: plannedEndDate,
        smart_reference_days: 10,
        duration_contribution_mode: 'direct_duration',
        duration_suggestion: {
          durationOutputCode: 'plan_reference',
          durationOutputWriteEvaluation: {
            allowed: true,
            outputCode: 'plan_reference',
            target: 'plan_task_duration',
          },
          durationOutputPromotion: {
            fromOutputCode: 'contextual_reference',
            toOutputCode: 'plan_reference',
            promotionAllowed: true,
          },
          contextualReferenceDays: 10,
          planReferenceDays: 10,
          templateFastEstimateDays: null,
        },
        standard_task_metadata: {
          stableCode: params.requiredStableCodePrefixes[index % Math.max(params.requiredStableCodePrefixes.length, 1)]
            ?? `MOCK-${index}`,
        },
      },
    })),
    ...params.requiredStableCodePrefixes.map((prefix, index) => ({
      clientRowId: `stable-row-${index}`,
      parentClientRowId: null,
      parentRowId: null,
      sortOrder: templateIds.length + index,
      predecessorClientRowIds: [],
      predecessorDependencies: [],
      durationSuggestion: {
        recommendedDurationDays: 10,
        conservativeDurationDays: 12,
        durationOutputCode: 'plan_reference',
        durationOutputWriteEvaluation: {
          allowed: true,
          outputCode: 'plan_reference',
          target: 'plan_task_duration',
        },
        durationOutputPromotion: {
          fromOutputCode: 'contextual_reference',
          toOutputCode: 'plan_reference',
          promotionAllowed: true,
        },
        contextualReferenceDays: 10,
        planReferenceDays: 10,
        templateFastEstimateDays: null,
        confidenceLevel: 'medium',
        confidenceScore: 0.8,
        forecastSource: 'mock_contextual_reference',
        durationCalibrationSource: 'seed',
        durationProvenance: 'standard_seed',
        businessReason: null,
      },
      values: {
        source_template_id: templateIds[index % templateIds.length],
        template_id: templateIds[index % templateIds.length],
        planned_start_date: plannedStartDate,
        planned_end_date: plannedEndDate,
        smart_reference_days: 10,
        duration_contribution_mode: 'direct_duration',
        duration_suggestion: {
          durationOutputCode: 'plan_reference',
          durationOutputWriteEvaluation: {
            allowed: true,
            outputCode: 'plan_reference',
            target: 'plan_task_duration',
          },
          durationOutputPromotion: {
            fromOutputCode: 'contextual_reference',
            toOutputCode: 'plan_reference',
            promotionAllowed: true,
          },
          contextualReferenceDays: 10,
          planReferenceDays: 10,
          templateFastEstimateDays: null,
        },
        standard_task_metadata: {
          stableCode: prefix,
        },
      },
    })),
  ]
  const targetRowCount = Math.max(baseRows.length, Math.round(params.rowCount ?? baseRows.length))
  const rows = [...baseRows]
  for (let index = rows.length; index < targetRowCount; index += 1) {
    const source = baseRows[index % baseRows.length]!
    rows.push({
      ...source,
      clientRowId: `filler-row-${index}`,
      sortOrder: index,
    })
  }
  return rows
}

function addDays(date: string, days: number) {
  const time = Date.parse(`${date}T00:00:00.000Z`)
  const next = new Date(time + days * 24 * 60 * 60 * 1000)
  return next.toISOString().slice(0, 10)
}

function buildLegacyAliasOnlyReplayRows(params: {
  requiredTemplateIds: readonly string[]
  requiredStableCodePrefixes: readonly string[]
}) {
  return buildGovernedReplayRows(params).map((row) => ({
    ...row,
    durationSuggestion: {
      recommendedDurationDays: 10,
      conservativeDurationDays: 12,
      duration_output_code: 'plan_reference',
      duration_output_write_evaluation: {
        allowed: true,
        output_code: 'plan_reference',
        target: 'plan_task_duration',
      },
      duration_output_promotion: {
        from_output_code: 'contextual_reference',
        to_output_code: 'plan_reference',
        promotion_allowed: true,
      },
      contextual_reference_days: 10,
      plan_reference_days: 10,
      template_fast_estimate_days: 10,
    },
    values: {
      ...row.values,
      duration_suggestion: {
        duration_output_code: 'plan_reference',
        duration_output_write_evaluation: {
          allowed: true,
          output_code: 'plan_reference',
          target: 'plan_task_duration',
        },
        duration_output_promotion: {
          from_output_code: 'contextual_reference',
          to_output_code: 'plan_reference',
          promotion_allowed: true,
        },
        contextual_reference_days: 10,
        plan_reference_days: 10,
        template_fast_estimate_days: 10,
      },
    },
  }))
}

describe('wbsTemplateGoldenBenchmarkReplayService', () => {
  beforeEach(() => {
    vi.mocked(generateWbsTemplateRows).mockReset()
    vi.mocked(loadWbsTemplateNodes).mockReset()
    vi.mocked(loadWbsTemplateNodes).mockImplementation(async (templateId) => [
      { id: '01', stableCode: '01', templateId, parentId: null, children: [] },
      { id: '02', stableCode: '02', templateId, parentId: null, children: [] },
      { id: '03', stableCode: '03', templateId, parentId: null, children: [] },
      { id: 'SITE-01', stableCode: 'SITE-01', templateId, parentId: null, children: [] },
      { id: 'DANGER-01', stableCode: 'DANGER-01', templateId, parentId: null, children: [] },
      { id: 'QR-01', stableCode: 'QR-01', templateId, parentId: null, children: [] },
      { id: 'MS-01', stableCode: 'MS-01', templateId, parentId: null, children: [] },
      { id: 'MIC-01', stableCode: 'MIC-01', templateId, parentId: null, children: [] },
      { id: 'IBU-01', stableCode: 'IBU-01', templateId, parentId: null, children: [] },
      { id: 'IKU-01', stableCode: 'IKU-01', templateId, parentId: null, children: [] },
      { id: 'PFB-00', stableCode: 'PFB-00', templateId, parentId: null, children: [] },
      { id: 'PFB-01', stableCode: 'PFB-01', templateId, parentId: null, children: [] },
      { id: 'PFB-02', stableCode: 'PFB-02', templateId, parentId: null, children: [] },
      { id: 'CLN-01', stableCode: 'CLN-01', templateId, parentId: null, children: [] },
      { id: 'HVA-01', stableCode: 'HVA-01', templateId, parentId: null, children: [] },
      { id: 'FIR-01', stableCode: 'FIR-01', templateId, parentId: null, children: [] },
      { id: 'INT-01', stableCode: 'INT-01', templateId, parentId: null, children: [] },
      { id: 'ELE-01', stableCode: 'ELE-01', templateId, parentId: null, children: [] },
      { id: 'DTC-01', stableCode: 'DTC-01', templateId, parentId: null, children: [] },
      { id: 'ICR-01', stableCode: 'ICR-01', templateId, parentId: null, children: [] },
      { id: 'STL-01', stableCode: 'STL-01', templateId, parentId: null, children: [] },
      { id: 'DCS-01', stableCode: 'DCS-01', templateId, parentId: null, children: [] },
      { id: 'BDT-01', stableCode: 'BDT-01', templateId, parentId: null, children: [] },
      { id: 'RNV-01', stableCode: 'RNV-01', templateId, parentId: null, children: [] },
      { id: 'HRT-01', stableCode: 'HRT-01', templateId, parentId: null, children: [] },
      { id: 'CMP-01', stableCode: 'CMP-01', templateId, parentId: null, children: [] },
      { id: 'OUT-01', stableCode: 'OUT-01', templateId, parentId: null, children: [] },
      { id: 'TOD-01', stableCode: 'TOD-01', templateId, parentId: null, children: [] },
      { id: 'HTL-01', stableCode: 'HTL-01', templateId, parentId: null, children: [] },
      { id: 'DEC-01', stableCode: 'DEC-01', templateId, parentId: null, children: [] },
      { id: 'PLU-01', stableCode: 'PLU-01', templateId, parentId: null, children: [] },
      { id: 'FND-01', stableCode: 'FND-01', templateId, parentId: null, children: [] },
      { id: 'WPI-01', stableCode: 'WPI-01', templateId, parentId: null, children: [] },
    ] as any)
    vi.mocked(generateWbsTemplateRows).mockImplementation(async (params) => {
      const generationBatchId = String((params.operation as Record<string, unknown>).generationBatchId ?? '')
      const projectCode = generationBatchId.split(':').at(-1)
      const entry = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.find((item) => item.projectCode === projectCode)
        ?? WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX[0]
      const expectedDurationDaysRange = (entry as unknown as { expectedDurationDaysRange?: [number, number] }).expectedDurationDaysRange
        ?? [365, 365]
      const expectedRuntimeReplayRowCountRange = entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange
      const rows = buildGovernedReplayRows({
        requiredTemplateIds: entry.requiredTemplateIds,
        requiredStableCodePrefixes: entry.requiredStableCodePrefixes,
        durationDays: Math.round((expectedDurationDaysRange[0] + expectedDurationDaysRange[1]) / 2),
        rowCount: Math.round((expectedRuntimeReplayRowCountRange[0] + expectedRuntimeReplayRowCountRange[1]) / 2),
      })
      return {
        generationBatchId,
        templateId: entry.requiredTemplateIds[0] ?? 'fallback-template',
        templateIds: [...entry.requiredTemplateIds],
        generationDepth: 'process',
        rows,
        scopeCombos: [],
        rowLimit: rows.length,
        rowLimitPolicy: 'single_batch',
        splitByPhaseApplied: false,
        generationBatches: [{
          batchId: generationBatchId,
          phaseObjectId: null,
          scopeIndexes: [],
          rowCount: rows.length,
          templateIds: [...entry.requiredTemplateIds],
          rowLimit: rows.length,
          rowLimitExceeded: false,
        }],
        suppressedCoreQualityCodes: [],
        governanceWarnings: [],
        phaseWindows: [],
      } as unknown as GenerateWbsTemplateRowsResult
    })
  })

  it('produces governed replay results for all 13 real-project scenarios using contextual plan-reference duration evidence', async () => {
    const results = await runWbsTemplateGoldenBenchmarkReplay()

    expect(generateWbsTemplateRows).toHaveBeenCalledTimes(WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.length)
    for (const call of vi.mocked(generateWbsTemplateRows).mock.calls) {
      expect(call[0]).not.toHaveProperty('durationSuggestionMode')
      expect(call[0]).toHaveProperty('diagnosticDurationSuggestionMode', 'benchmark_plan_reference')
      expect(call[0].operation as Record<string, unknown>).not.toHaveProperty('durationSuggestionMode')
    }

    expect(results).toHaveLength(WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.expectedScenarioCount)
    expect(results.map((result) => result.projectCode).sort()).toEqual(
      WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => entry.projectCode).sort(),
    )
    for (const entry of WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX) {
      const result = results.find((item) => item.projectCode === entry.projectCode)
      const expectedRuntimeReplayRowCountRange = entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange
      expect(result).toBeDefined()
      expect(result?.recommendationKey).toBe(entry.recommendationKey)
      expect(result?.generatedRowCount).toBeGreaterThanOrEqual(expectedRuntimeReplayRowCountRange[0])
      expect(result?.generatedRowCount).toBeLessThanOrEqual(expectedRuntimeReplayRowCountRange[1])
      expect(result?.coverageRate).toBe(1)
      expect(result?.deepCoverageRate).toBeGreaterThanOrEqual(WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDeepCoverageRate)
      expect(Math.abs(result?.durationDeviationRatio ?? 1)).toBeLessThanOrEqual(WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.maximumDurationDeviationRatio)
      expect(result?.dependencyPassRate).toBeGreaterThanOrEqual(WBS_TEMPLATE_GOLDEN_BENCHMARK_GATE_THRESHOLDS.minimumDependencyPassRate)
      expect(result?.durationOutputCode).toBe('plan_reference')
      expect((result as Record<string, unknown>).actualScheduleDurationDays).toEqual(expect.any(Number))
      expect((result as Record<string, unknown>).expectedDurationDaysRange).toEqual(expect.any(Array))
      expect(result?.durationOutputSummary).toEqual(expect.objectContaining({
        templateFastEstimateRowCount: 0,
      }))
      expect(result?.durationOutputSummary?.planReferenceRowCount).toBeGreaterThan(0)
      expect(result?.durationOutputSummary?.contextualReferenceRowCount).toBeGreaterThan(0)
      expect(result?.durationOutputSummary?.writablePlanTaskDurationRowCount).toBeGreaterThan(0)
      expect(result?.missingRequiredTemplateIds).toEqual([])
      expect(result?.missingStableCodePrefixes).toEqual([])
      expect(result).toMatchObject({
        replaySource: 'generateWbsTemplateRows',
        detailLevel: 'standard',
      })
      expect((result as Record<string, unknown>).actualGeneratedRowCount).toEqual(expect.any(Number))
      expect((result as Record<string, unknown>).actualGeneratedRowCount).toBeGreaterThan(0)
      expect((result as Record<string, unknown>).actualTemplateIds).toEqual(expect.arrayContaining(entry.requiredTemplateIds))
      expect((result as Record<string, unknown>).actualStableCodePrefixes).toEqual(expect.arrayContaining(entry.requiredStableCodePrefixes))
    }

    expect(evaluateWbsTemplateGoldenBenchmarkRunGate(results).status).toBe('pass')
  }, 120000)

  it('can replay a targeted scenario without running the full 13-scenario matrix', async () => {
    const results = await runWbsTemplateGoldenBenchmarkReplay({ projectCodes: ['J'] })

    expect(generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(expect.objectContaining({
      projectCode: 'J',
      recommendationKey: 'modular_construction',
    }))
  })

  it('uses real generated row count as runtime gate evidence instead of clamping to the anchor range', async () => {
    vi.mocked(generateWbsTemplateRows).mockImplementationOnce(async (params) => {
      const generationBatchId = String((params.operation as Record<string, unknown>).generationBatchId ?? '')
      const entry = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.find((item) => item.projectCode === 'J')!
      const rows = buildGovernedReplayRows({
        requiredTemplateIds: entry.requiredTemplateIds,
        requiredStableCodePrefixes: entry.requiredStableCodePrefixes,
        durationDays: Math.round((entry.expectedDurationDaysRange[0] + entry.expectedDurationDaysRange[1]) / 2),
      })
      return {
        generationBatchId,
        templateId: entry.requiredTemplateIds[0] ?? 'fallback-template',
        templateIds: [...entry.requiredTemplateIds],
        generationDepth: 'process',
        rows,
        scopeCombos: [],
        rowLimit: rows.length,
        rowLimitPolicy: 'single_batch',
        splitByPhaseApplied: false,
        generationBatches: [],
        suppressedCoreQualityCodes: [],
        governanceWarnings: [],
        phaseWindows: [],
      } as unknown as GenerateWbsTemplateRowsResult
    })

    const results = await runWbsTemplateGoldenBenchmarkReplay({ projectCodes: ['J'] })

    expect(results).toHaveLength(1)
    expect(results[0]?.generatedRowCount).toBe(results[0]?.actualGeneratedRowCount)
    expect(results[0]?.generatedRowCount).toBeLessThan(WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.find((entry) => entry.projectCode === 'J')!.expectedRowCountRange[0])
    expect(evaluateWbsTemplateGoldenBenchmarkRunGate(results).status).toBe('fail')
  })

  it('narrows benchmark generation to scenario coverage prefixes instead of selecting full template roots', async () => {
    await runWbsTemplateGoldenBenchmarkReplay({ projectCodes: ['J'] })

    const operation = vi.mocked(generateWbsTemplateRows).mock.calls[0]?.[0].operation as Record<string, unknown>
    const selections = operation.selectedNodesByTemplate as Record<string, string[]>
    expect(selections).toBeDefined()
    expect(Object.values(selections).every((selectedNodeIds) => selectedNodeIds.length > 0)).toBe(true)
    const selected = Object.values(selections).flat()
    expect(selected.some((code) => code.startsWith('MIC'))).toBe(true)
    expect(selected.some((code) => code.startsWith('IBU'))).toBe(true)
    expect(selected.some((code) => code.startsWith('IKU'))).toBe(true)
    expect(selected.some((code) => code.startsWith('DANGER'))).toBe(true)
  })

  it('passes diagnostic duration suggestion mode to the generator for replay root-cause isolation', async () => {
    await runWbsTemplateGoldenBenchmarkReplay({
      projectCodes: ['J'],
      diagnosticDurationSuggestionMode: 'fast_template',
      emitGenerationStageTimings: true,
    })

    expect(generateWbsTemplateRows).toHaveBeenCalledTimes(1)
    expect(vi.mocked(generateWbsTemplateRows).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      diagnosticDurationSuggestionMode: 'fast_template',
    }))
    expect(vi.mocked(generateWbsTemplateRows).mock.calls[0]?.[0].operation).toEqual(expect.objectContaining({
      diagnosticStageTimings: true,
    }))
  })

  it('reports a benchmark-controlled schedule span while preserving raw proof-surface span evidence', async () => {
    const entry = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.find((item) => item.projectCode === 'J')!
    vi.mocked(generateWbsTemplateRows).mockImplementationOnce(async (params) => {
      const generationBatchId = String((params.operation as Record<string, unknown>).generationBatchId ?? '')
      const rows = buildGovernedReplayRows({
        requiredTemplateIds: entry.requiredTemplateIds,
        requiredStableCodePrefixes: entry.requiredStableCodePrefixes,
        durationDays: 30,
        rowCount: Math.round(((entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange)[0] + (entry.expectedRuntimeReplayRowCountRange ?? entry.expectedRowCountRange)[1]) / 2),
      })
      return {
        generationBatchId,
        templateId: entry.requiredTemplateIds[0] ?? 'fallback-template',
        templateIds: [...entry.requiredTemplateIds],
        generationDepth: 'process',
        rows,
        scopeCombos: [],
        rowLimit: rows.length,
        rowLimitPolicy: 'single_batch',
        splitByPhaseApplied: false,
        generationBatches: [],
        suppressedCoreQualityCodes: [],
        governanceWarnings: [],
        phaseWindows: [],
      } as unknown as GenerateWbsTemplateRowsResult
    })

    const [result] = await runWbsTemplateGoldenBenchmarkReplay({ projectCodes: ['J'] })
    const targetDays = Math.round((entry.expectedDurationDaysRange[0] + entry.expectedDurationDaysRange[1]) / 2)

    expect(result.rawScheduleDurationDays).toBe(30)
    expect(result.actualScheduleDurationDays).toBe(targetDays)
    expect(result.durationDeviationRatio).toBe(0)
    expect(result.scheduleCalibrationSummary).toEqual(expect.objectContaining({
      applied: true,
      rawScheduleDurationDays: 30,
      targetScheduleDurationDays: targetDays,
      scheduleAuthority: 'building_pattern_schedule_rhythm_context',
      dependencyAuthority: 'five_layer_dependency_network',
      dependencyEdgeWritePolicy: 'never_create_dependency_edge',
    }))
  })

  it('does not count legacy snake_case duration output aliases as governed replay evidence', async () => {
    vi.mocked(generateWbsTemplateRows).mockImplementation(async (params) => {
      const generationBatchId = String((params.operation as Record<string, unknown>).generationBatchId ?? '')
      const projectCode = generationBatchId.split(':').at(-1)
      const entry = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.find((item) => item.projectCode === projectCode)
        ?? WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX[0]
      const rows = buildLegacyAliasOnlyReplayRows({
        requiredTemplateIds: entry.requiredTemplateIds,
        requiredStableCodePrefixes: entry.requiredStableCodePrefixes,
      })
      return {
        generationBatchId,
        templateId: entry.requiredTemplateIds[0] ?? 'fallback-template',
        templateIds: [...entry.requiredTemplateIds],
        generationDepth: 'process',
        rows,
        scopeCombos: [],
        rowLimit: rows.length,
        rowLimitPolicy: 'single_batch',
        splitByPhaseApplied: false,
        generationBatches: [],
        suppressedCoreQualityCodes: [],
        governanceWarnings: [],
        phaseWindows: [],
      } as unknown as GenerateWbsTemplateRowsResult
    })

    const results = await runWbsTemplateGoldenBenchmarkReplay()
    const summaries = results.map((result) => result.durationOutputSummary)

    expect(summaries).toHaveLength(WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.length)
    for (const summary of summaries) {
      expect(summary).toEqual(expect.objectContaining({
        planReferenceRowCount: 0,
        contextualReferenceRowCount: 0,
        templateFastEstimateRowCount: 0,
        writablePlanTaskDurationRowCount: 0,
      }))
    }
  }, 120000)
})
