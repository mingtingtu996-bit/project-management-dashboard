import { describe, expect, it } from 'vitest'

import {
  buildCompanySummarySyntheticPressureReport,
  parseCompanySummaryPressureOptionsFromArgs,
  shouldFailCompanySummarySyntheticPressureReport,
} from '../scripts/profile-company-summary'

function routeScenario(
  projectCount: number,
  p50Ms: number,
  p95Ms: number,
  p99Ms: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    projectCount,
    diagnosticRunId: 'c18-l14-route-run-1',
    routeInvocationId: `route-invocation-${projectCount}`,
    requestId: `request-${projectCount}`,
    method: 'GET',
    routePath: '/api/company/dashboard/company-summary',
    p50Ms,
    p95Ms,
    p99Ms,
    dbQueryLogCaptured: true,
    cacheHitEvidenceCaptured: true,
    networkLatencyCaptured: true,
    dbQueryLog: {
      coldRequestQueryCount: 8,
      warmRequestQueryCount: 1,
      tableNames: ['project_execution_summary', 'project_daily_snapshot'],
    },
    cacheEvidence: {
      cacheKey: `company-summary:${projectCount}`,
      coldCacheHit: false,
      warmCacheHit: true,
    },
    responseShape: {
      projectCount,
      rankingCount: projectCount,
      healthHistoryPeriods: 2,
    },
    ...overrides,
  }
}

describe('company-summary synthetic pressure harness', () => {
  it('measures 50, 100, and 500 project synthetic company-summary budgets without closing live evidence', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      scenarios: [50, 100, 500],
      iterations: 5,
      budgetMs: {
        50: 50,
        100: 75,
        500: 150,
      },
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-company-summary.json',
    })

    expect(report.evidenceKind).toBe('synthetic_local_budget')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l14-company-summary.json')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.liveEvidenceRequiredReason).toContain('real DB')
    expect(report.liveDbEvidenceChecklist).toEqual([
      'real /api/company/dashboard/company-summary p50/p95/p99 for 50, 100, and 500 visible projects',
      'DB query count and table grouping for cold cache and warm cache requests',
      'cache hit evidence for repeated reads with the same scoped cache key',
      'timeout budget and error fallback behavior under production-like network latency',
    ])
    expect(report.scenarios.map((scenario) => scenario.projectCount)).toEqual([50, 100, 500])
    expect(report.scenarios).toEqual([
      expect.objectContaining({
        projectCount: 50,
        iterations: 5,
        cacheSimulation: 'cold_build_only',
        dbQueryCount: 0,
        runtimeEvidenceGap: expect.objectContaining({
          missingRealDbQueryLog: true,
          missingRouteCacheHitEvidence: true,
          missingNetworkLatency: true,
          missingProductionLikeP95: true,
        }),
        status: 'pass',
      }),
      expect.objectContaining({
        projectCount: 100,
        iterations: 5,
        status: 'pass',
      }),
      expect.objectContaining({
        projectCount: 500,
        iterations: 5,
        status: 'pass',
      }),
    ])
    for (const scenario of report.scenarios) {
      expect(scenario.p50Ms).toBeGreaterThanOrEqual(0)
      expect(scenario.p95Ms).toBeGreaterThanOrEqual(scenario.p50Ms)
      expect(scenario.p99Ms).toBeGreaterThanOrEqual(scenario.p95Ms)
      expect(scenario.resultShape).toEqual(expect.objectContaining({
        projectCount: scenario.projectCount,
        rankingCount: scenario.projectCount,
      }))
    }
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(false)
  })

  it('fails when any synthetic budget is exceeded', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      scenarios: [50],
      iterations: 2,
      budgetMs: {
        50: -1,
      },
    })

    expect(report.scenarios[0].status).toBe('fail')
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('accepts archived route pressure evidence and passes only when p95, DB logs, and cache hit evidence are present', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      diagnosticRunId: 'c18-l14-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence.json',
        diagnosticRunId: 'c18-l14-route-run-1',
        scenarios: [
          routeScenario(50, 80, 140, 180),
          routeScenario(100, 110, 210, 260),
          routeScenario(500, 260, 740, 880),
        ],
      },
    })

    expect(report.routeEvidenceFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence.json')
    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence.json',
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence.json',
      diagnosticRunId: 'c18-l14-route-run-1',
      missingEvidenceMetadata: false,
      requiredProjectCounts: [50, 100, 500],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        projectCount: 50,
        status: 'pass',
        runtimeEvidenceGap: {
          missingRealDbQueryLog: false,
          missingRouteCacheHitEvidence: false,
          missingNetworkLatency: false,
          missingProductionLikeP95: false,
          missingRouteInvocationEvidence: false,
          missingLatencyPercentileOrder: false,
          missingTimingSanityEvidence: false,
          missingDbQueryLogDetail: false,
          missingCacheHitDetail: false,
          missingResponseShapeEvidence: false,
          missingRouteCorrelationEvidence: false,
        },
      }),
      expect.objectContaining({ projectCount: 100, status: 'pass' }),
      expect.objectContaining({ projectCount: 500, status: 'pass' }),
    ])
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(false)
  })

  it('fails archived route pressure evidence when DB and cache evidence are only boolean flags', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      diagnosticRunId: 'c18-l14-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-booleans-only.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-booleans-only.json',
        diagnosticRunId: 'c18-l14-route-run-1',
        scenarios: [
          { projectCount: 50, method: 'GET', routePath: '/api/company/dashboard/company-summary', p50Ms: 80, p95Ms: 140, p99Ms: 180, dbQueryLogCaptured: true, cacheHitEvidenceCaptured: true, networkLatencyCaptured: true },
          { projectCount: 100, method: 'GET', routePath: '/api/company/dashboard/company-summary', p50Ms: 110, p95Ms: 210, p99Ms: 260, dbQueryLogCaptured: true, cacheHitEvidenceCaptured: true, networkLatencyCaptured: true },
          { projectCount: 500, method: 'GET', routePath: '/api/company/dashboard/company-summary', p50Ms: 260, p95Ms: 740, p99Ms: 880, dbQueryLogCaptured: true, cacheHitEvidenceCaptured: true, networkLatencyCaptured: true },
        ],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios[0]).toEqual(expect.objectContaining({
      projectCount: 50,
      status: 'fail',
      runtimeEvidenceGap: expect.objectContaining({
        missingDbQueryLogDetail: true,
        missingCacheHitDetail: true,
        missingResponseShapeEvidence: true,
      }),
    }))
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails closeout mode when route pressure evidence passes but the report JSON is not archived', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      requireLiveEvidence: true,
      diagnosticRunId: 'c18-l14-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence.json',
        diagnosticRunId: 'c18-l14-route-run-1',
        scenarios: [
          routeScenario(50, 80, 140, 180),
          routeScenario(100, 110, 210, 260),
          routeScenario(500, 260, 740, 880),
        ],
      },
    })

    expect(report.requireLiveEvidence).toBe(true)
    expect(report.outputFile).toBeNull()
    expect(report.missingArchivedJson).toBe(true)
    expect(report.routeEvidenceAssessment?.status).toBe('pass')
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when metadata identifies sample or local evidence', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      diagnosticRunId: 'c18-l14-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-sample.json',
      routeEvidence: {
        environment: 'local',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-sample.json',
        diagnosticRunId: 'c18-l14-route-run-1',
        scenarios: [
          routeScenario(50, 80, 140, 180),
          routeScenario(100, 110, 210, 260),
          routeScenario(500, 260, 740, 880),
        ],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingEvidenceMetadata: false,
      nonLiveEvidenceMetadata: true,
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({ projectCount: 50, status: 'pass' }),
      expect.objectContaining({ projectCount: 100, status: 'pass' }),
      expect.objectContaining({ projectCount: 500, status: 'pass' }),
    ])
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when environment or evidence reference metadata is missing', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-sample.json',
      routeEvidence: {
        scenarios: [
          routeScenario(50, 80, 140, 180),
          routeScenario(100, 110, 210, 260),
          routeScenario(500, 260, 740, 880),
        ],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      environment: null,
      evidenceRef: null,
      missingEvidenceMetadata: true,
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        projectCount: 50,
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingRouteCorrelationEvidence: true,
        }),
      }),
      expect.objectContaining({ projectCount: 100, status: 'fail' }),
      expect.objectContaining({ projectCount: 500, status: 'fail' }),
    ])
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails closeout mode when live route pressure evidence is missing', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      scenarios: [50, 100, 500],
      iterations: 2,
      requireLiveEvidence: true,
    } as Parameters<typeof buildCompanySummarySyntheticPressureReport>[0] & { requireLiveEvidence: true })

    expect((report as typeof report & { requireLiveEvidence?: boolean }).requireLiveEvidence).toBe(true)
    expect(report.missingArchivedJson).toBe(true)
    expect(report.routeEvidenceAssessment).toBeNull()
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when production-like route proof is incomplete', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      diagnosticRunId: 'c18-l14-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-fail.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-fail.json',
        diagnosticRunId: 'c18-l14-route-run-1',
        scenarios: [
          routeScenario(50, 80, 140, 180),
          routeScenario(100, 110, 210, 260, { cacheHitEvidenceCaptured: false }),
          routeScenario(500, 260, 1300, 1500),
        ],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({ projectCount: 50, status: 'pass' }),
      expect.objectContaining({
        projectCount: 100,
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({ missingRouteCacheHitEvidence: true }),
      }),
      expect.objectContaining({
        projectCount: 500,
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({ missingProductionLikeP95: true }),
      }),
    ])
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when latency percentiles are internally inconsistent', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      diagnosticRunId: 'c18-l14-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-impossible-percentiles.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-impossible-percentiles.json',
        diagnosticRunId: 'c18-l14-route-run-1',
        scenarios: [
          routeScenario(50, 180, 140, 181),
          routeScenario(100, 110, 210, 260),
          routeScenario(500, 260, 740, 880),
        ],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios[0]).toEqual(expect.objectContaining({
      projectCount: 50,
      status: 'fail',
      runtimeEvidenceGap: expect.objectContaining({
        missingLatencyPercentileOrder: true,
      }),
    }))
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when latency values are impossible even if ordered', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      diagnosticRunId: 'c18-l14-route-run-1',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-negative-latency.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-negative-latency.json',
        diagnosticRunId: 'c18-l14-route-run-1',
        scenarios: [
          routeScenario(50, -30, -20, -10),
          routeScenario(100, 110, 210, 260),
          routeScenario(500, 260, 740, 880),
        ],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios[0]).toEqual(expect.objectContaining({
      projectCount: 50,
      status: 'fail',
      runtimeEvidenceGap: expect.objectContaining({
        missingTimingSanityEvidence: true,
      }),
    }))
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when it does not prove the company-summary route was exercised', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-wrong-route.json',
      routeEvidence: {
        scenarios: [
          routeScenario(50, 80, 140, 180, { routePath: '/api/company/dashboard/projects-summary' }),
          routeScenario(100, 110, 210, 260, { routePath: '/api/company/dashboard/projects-summary' }),
          routeScenario(500, 260, 740, 880, { routePath: '/api/company/dashboard/projects-summary' }),
        ],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        projectCount: 50,
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingRouteInvocationEvidence: true,
        }),
      }),
      expect.objectContaining({ projectCount: 100, status: 'fail' }),
      expect.objectContaining({ projectCount: 500, status: 'fail' }),
    ])
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when route calls cannot be correlated to the diagnostic run', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-uncorrelated.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-uncorrelated.json',
        scenarios: [
          routeScenario(50, 80, 140, 180),
          routeScenario(100, 110, 210, 260),
          routeScenario(500, 260, 740, 880),
        ],
      },
    })

    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        projectCount: 50,
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingRouteCorrelationEvidence: true,
        }),
      }),
      expect.objectContaining({ projectCount: 100, status: 'fail' }),
      expect.objectContaining({ projectCount: 500, status: 'fail' }),
    ])
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived route pressure evidence when it is from a previous diagnostic run', () => {
    const report = buildCompanySummarySyntheticPressureReport({
      diagnosticRunId: 'c18-l14-current-run',
      routeEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-old-run.json',
      routeEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l14-route-evidence-old-run.json',
        diagnosticRunId: 'c18-l14-old-run',
        scenarios: [
          routeScenario(50, 80, 140, 180, { diagnosticRunId: 'c18-l14-old-run' }),
          routeScenario(100, 110, 210, 260, { diagnosticRunId: 'c18-l14-old-run' }),
          routeScenario(500, 260, 740, 880, { diagnosticRunId: 'c18-l14-old-run' }),
        ],
      },
    })

    expect(report.diagnosticRunId).toBe('c18-l14-current-run')
    expect(report.routeEvidenceAssessment).toEqual(expect.objectContaining({
      diagnosticRunId: 'c18-l14-old-run',
      expectedDiagnosticRunId: 'c18-l14-current-run',
      diagnosticRunIdMatches: false,
      status: 'fail',
      missingProjectCounts: [],
    }))
    expect(report.routeEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        projectCount: 50,
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingRouteCorrelationEvidence: true,
        }),
      }),
      expect.objectContaining({ projectCount: 100, status: 'fail' }),
      expect.objectContaining({ projectCount: 500, status: 'fail' }),
    ])
    expect(shouldFailCompanySummarySyntheticPressureReport(report)).toBe(true)
  })

  it('keeps omitted CLI iterations on the default multi-sample budget', () => {
    expect(parseCompanySummaryPressureOptionsFromArgs(['node', 'profile-company-summary.ts'])).toEqual({})
    expect(parseCompanySummaryPressureOptionsFromArgs([
      'node',
      'profile-company-summary.ts',
      '--iterations=7',
      '--output-file=artifacts/test-runs/c18-l14.json',
      '--route-evidence-file=artifacts/test-runs/c18-l14-route-evidence.json',
      '--diagnostic-run-id=c18-l14-current-run',
      '--require-live-evidence',
    ])).toEqual({
      iterations: 7,
      outputFile: 'artifacts/test-runs/c18-l14.json',
      routeEvidenceFile: 'artifacts/test-runs/c18-l14-route-evidence.json',
      diagnosticRunId: 'c18-l14-current-run',
      requireLiveEvidence: true,
    })
  })
})
