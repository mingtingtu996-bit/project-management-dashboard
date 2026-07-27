import { describe, expect, it } from 'vitest'

import {
  buildWbsGenerationSyntheticPressureReport,
  parseWbsGenerationPressureOptionsFromArgs,
  shouldFailWbsGenerationSyntheticPressureReport,
  type WbsGenerationPressureGenerator,
} from '../scripts/profile-wbs-generation'

function makeExpectedFuseError(generatedMainPlanRowCount: number, rowLimit = 500) {
  return {
    statusCode: 413,
    code: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
    details: {
      generatedMainPlanRowCount,
      rowLimit,
      preflightStage: 'scope_cardinality',
      generationBatches: [
        {
          rowCount: generatedMainPlanRowCount,
          rowLimit,
          rowLimitExceeded: true,
        },
      ],
    },
  }
}

describe('WBS generation synthetic pressure harness', () => {
  it('records row-fuse evidence for 501-row and 200x200 scope generation without closing live pressure', async () => {
    const calls: Array<{ buildingCount: number; floorCount: number }> = []
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      calls.push({ buildingCount: buildings.length, floorCount: floors.length })
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      now: new Date('2026-06-21T00:00:00.000Z'),
      scenarios: ['single_batch_501', 'scope_200x200'],
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-wbs-generation.json',
    })

    expect(report.reportCode).toBe('c18_l10_wbs_generation_synthetic_pressure')
    expect(report.evidenceKind).toBe('synthetic_local_row_fuse')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l10-wbs-generation.json')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.liveEvidenceRequiredReason).toContain('real environment')
    expect(report.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'single_batch_501',
        status: 'pass',
        expectedGeneratedMainPlanRowCount: 501,
        generatedMainPlanRowCount: 501,
        rowLimit: 500,
        materializedRows: 0,
        httpStatusCode: 413,
        errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
        preflightStage: 'scope_cardinality',
        elapsedBudgetMs: 1000,
        withinElapsedBudget: true,
        fuseResponseShape: expect.objectContaining({
          hasExpectedHttpStatus: true,
          hasExpectedErrorCode: true,
          hasRowLimit: true,
          hasPreflightStage: true,
          generationBatchCount: 1,
          rowLimitExceededBatchCount: 1,
        }),
      }),
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'pass',
        expectedGeneratedMainPlanRowCount: 40000,
        generatedMainPlanRowCount: 40000,
        rowLimit: 500,
        materializedRows: 0,
        httpStatusCode: 413,
        errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
        preflightStage: 'scope_cardinality',
        elapsedBudgetMs: 1000,
        withinElapsedBudget: true,
        fuseResponseShape: expect.objectContaining({
          hasExpectedHttpStatus: true,
          hasExpectedErrorCode: true,
          hasRowLimit: true,
          hasPreflightStage: true,
          generationBatchCount: 1,
          rowLimitExceededBatchCount: 1,
        }),
      }),
    ])
    expect(calls).toEqual([
      { buildingCount: 501, floorCount: 0 },
      { buildingCount: 200, floorCount: 200 },
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(false)
  })

  it('accepts archived route pressure evidence only when runtime resource and fuse evidence are complete', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      diagnosticRunId: 'c18-l10-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence.json',
        diagnosticRunId: 'c18-l10-route-run-1',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          diagnosticRunId: 'c18-l10-route-run-1',
          routeInvocationId: 'route-invocation-1',
          requestId: 'request-1',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          buildingCount: 200,
          floorCount: 200,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 850,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.routeEvidenceFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence.json')
    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence.json',
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence.json',
      diagnosticRunId: 'c18-l10-route-run-1',
      missingEvidenceMetadata: false,
      requiredScenarioCodes: ['scope_200x200'],
      missingScenarioCodes: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'pass',
        runtimeEvidenceGap: {
          missingMemoryObservation: false,
          missingConnectionPoolObservation: false,
          missingTimeoutBudgetEvidence: false,
          missingUserVisibleFuseResponse: false,
          missingRowLimitConfigurationEvidence: false,
          missingProductionLikeP95: false,
          missingTimingSanityEvidence: false,
          missingRouteInvocationEvidence: false,
          missingScopeCardinalityEvidence: false,
          missingRouteCorrelationEvidence: false,
        },
      }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(false)
  })

  it('fails closeout mode when route pressure evidence passes but the report JSON is not archived', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      requireLiveEvidence: true,
      diagnosticRunId: 'c18-l10-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence.json',
        diagnosticRunId: 'c18-l10-route-run-1',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          diagnosticRunId: 'c18-l10-route-run-1',
          routeInvocationId: 'route-invocation-1',
          requestId: 'request-1',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          buildingCount: 200,
          floorCount: 200,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 850,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.requireLiveEvidence).toBe(true)
    expect(report.outputFile).toBeNull()
    expect(report.missingArchivedJson).toBe(true)
    expect(report.routeEvidenceAssessment?.status).toBe('pass')
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when metadata identifies sample or local evidence', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      diagnosticRunId: 'c18-l10-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-sample.json',
      routeEvidence: {
        environment: 'local',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-sample.json',
        diagnosticRunId: 'c18-l10-route-run-1',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          diagnosticRunId: 'c18-l10-route-run-1',
          routeInvocationId: 'route-invocation-1',
          requestId: 'request-1',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          buildingCount: 200,
          floorCount: 200,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 850,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingEvidenceMetadata: false,
      nonLiveEvidenceMetadata: true,
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({ scenarioCode: 'scope_200x200', status: 'pass' }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when environment or evidence reference metadata is missing', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-sample.json',
      routeEvidence: {
        scenarios: [{
          scenarioCode: 'scope_200x200',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          buildingCount: 200,
          floorCount: 200,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 850,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      environment: null,
      evidenceRef: null,
      missingEvidenceMetadata: true,
      missingScenarioCodes: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingRouteCorrelationEvidence: true,
        }),
      }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails closeout mode when live route pressure evidence is missing', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      requireLiveEvidence: true,
    } as Parameters<typeof buildWbsGenerationSyntheticPressureReport>[0] & { requireLiveEvidence: true })

    expect((report as typeof report & { requireLiveEvidence?: boolean }).requireLiveEvidence).toBe(true)
    expect(report.missingArchivedJson).toBe(true)
    expect(report.routeEvidenceAssessment).toBeNull()
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when runtime resource proof is incomplete', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      diagnosticRunId: 'c18-l10-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-fail.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-fail.json',
        diagnosticRunId: 'c18-l10-route-run-1',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          diagnosticRunId: 'c18-l10-route-run-1',
          routeInvocationId: 'route-invocation-1',
          requestId: 'request-1',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 1800,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: false,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: false,
        }],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingScenarioCodes: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingConnectionPoolObservation: true,
          missingRowLimitConfigurationEvidence: true,
          missingProductionLikeP95: true,
        }),
      }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when timing values are physically impossible', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      diagnosticRunId: 'c18-l10-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-negative-timing.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-negative-timing.json',
        diagnosticRunId: 'c18-l10-route-run-1',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          diagnosticRunId: 'c18-l10-route-run-1',
          routeInvocationId: 'route-invocation-1',
          requestId: 'request-1',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          buildingCount: 200,
          floorCount: 200,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: -1,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingTimingSanityEvidence: true,
        }),
      }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when 200x200 scope cardinality proof is missing', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      diagnosticRunId: 'c18-l10-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-missing-cardinality.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-missing-cardinality.json',
        diagnosticRunId: 'c18-l10-route-run-1',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          diagnosticRunId: 'c18-l10-route-run-1',
          routeInvocationId: 'route-invocation-1',
          requestId: 'request-1',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 850,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingScopeCardinalityEvidence: true,
        }),
      }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when it does not prove the canonical generate-preview route was exercised', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      diagnosticRunId: 'c18-l10-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-wrong-route.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-wrong-route.json',
        diagnosticRunId: 'c18-l10-route-run-1',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          diagnosticRunId: 'c18-l10-route-run-1',
          routeInvocationId: 'route-invocation-1',
          requestId: 'request-1',
          method: 'POST',
          routePath: '/api/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          buildingCount: 200,
          floorCount: 200,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 850,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingScenarioCodes: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingRouteInvocationEvidence: true,
        }),
      }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when the route call cannot be correlated to a diagnostic run', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-uncorrelated.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-uncorrelated.json',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          buildingCount: 200,
          floorCount: 200,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 850,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingRouteCorrelationEvidence: true,
        }),
      }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when it is from a previous diagnostic run', async () => {
    const generator: WbsGenerationPressureGenerator = async (operation) => {
      const buildings = operation.operation.scope?.buildings ?? []
      const floors = operation.operation.scope?.floors ?? []
      const generatedCount = floors.length > 0 ? buildings.length * floors.length : buildings.length
      throw makeExpectedFuseError(generatedCount)
    }

    const report = await buildWbsGenerationSyntheticPressureReport({
      generator,
      scenarios: ['scope_200x200'],
      diagnosticRunId: 'c18-l10-current-run',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-old-run.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l10-route-evidence-old-run.json',
        diagnosticRunId: 'c18-l10-old-run',
        scenarios: [{
          scenarioCode: 'scope_200x200',
          diagnosticRunId: 'c18-l10-old-run',
          routeInvocationId: 'route-invocation-old',
          requestId: 'request-old',
          method: 'POST',
          routePath: '/api/planning/wbs-templates/generate-preview',
          httpStatusCode: 413,
          errorCode: 'WBS_TEMPLATE_GENERATION_ROW_LIMIT_EXCEEDED',
          generatedMainPlanRowCount: 40000,
          buildingCount: 200,
          floorCount: 200,
          rowLimit: 500,
          materializedRows: 0,
          p95Ms: 850,
          elapsedBudgetMs: 1200,
          memoryObserved: true,
          connectionPoolObserved: true,
          timeoutBudgetObserved: true,
          userVisibleFuseResponseObserved: true,
          rowLimitConfigurationObserved: true,
        }],
      },
    })

    expect(report.diagnosticRunId).toBe('c18-l10-current-run')
    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      diagnosticRunId: 'c18-l10-old-run',
      expectedDiagnosticRunId: 'c18-l10-current-run',
      diagnosticRunIdMatches: false,
      status: 'fail',
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'scope_200x200',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingRouteCorrelationEvidence: true,
        }),
      }),
    ])
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('fails when an oversized scenario reaches row materialization instead of the fuse', async () => {
    const report = await buildWbsGenerationSyntheticPressureReport({
      generator: async () => ({ rows: Array.from({ length: 501 }, (_, index) => ({ id: String(index) })) }),
      scenarios: ['single_batch_501'],
    })

    expect(report.scenarios[0]).toEqual(expect.objectContaining({
      status: 'fail',
      materializedRows: 501,
    }))
    expect(report.scenarios[0].reason).toContain('Expected row fuse')
    expect(shouldFailWbsGenerationSyntheticPressureReport(report)).toBe(true)
  })

  it('parses scenario filters from CLI args', () => {
    expect(parseWbsGenerationPressureOptionsFromArgs([
      'node',
      'profile-wbs-generation.ts',
      '--scenarios=single_batch_501,scope_200x200',
      '--output-file=artifacts/test-runs/c18-l10.json',
      '--route-evidence-file=artifacts/test-runs/c18-l10-route-evidence.json',
      '--diagnostic-run-id=c18-l10-current-run',
      '--require-live-evidence',
    ])).toEqual({
      scenarios: ['single_batch_501', 'scope_200x200'],
      outputFile: 'artifacts/test-runs/c18-l10.json',
      routeEvidenceFile: 'artifacts/test-runs/c18-l10-route-evidence.json',
      diagnosticRunId: 'c18-l10-current-run',
      requireLiveEvidence: true,
    })
  })
})
