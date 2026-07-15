import { describe, expect, it, vi } from 'vitest'

import {
  buildCriticalPathSyntheticPressureReport,
  parseCriticalPathSyntheticPressureOptionsFromArgs,
  shouldFailCriticalPathSyntheticPressureReport,
} from '../scripts/profile-critical-path-network.js'

describe('critical path synthetic pressure harness', () => {
  it('profiles a large local CPM network and keeps live evidence explicit', async () => {
    const runSyntheticNetworkProfile = vi.fn(() => ({
      taskCount: 1000,
      explicitDependencyCount: 0,
      totalDependencyEdgeCount: 999,
      resourceConstraintEdgeCount: 999,
      criticalPathLength: 1000,
      projectDurationDays: 1000,
    }))

    const report = await buildCriticalPathSyntheticPressureReport({
      now: new Date('2026-06-21T05:30:00.000+08:00'),
      scenarios: ['resource_chain_1000'],
      runSyntheticNetworkProfile,
      budgetMs: { resource_chain_1000: 250 },
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-critical-path-network.json',
    })

    expect(report.reportCode).toBe('c18_l12_critical_path_synthetic_pressure')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l12-critical-path-network.json')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.liveDbEvidenceChecklist).toEqual([
      'real large-network project with persisted tasks, dependencies, and resource constraints',
      'concurrent sweep plus route recalculation against the same project',
      'DB write timing for critical path snapshot and task float projection',
      'connection-pool, lock wait, and final projection readback evidence',
    ])
    expect(report.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'pass',
        taskCount: 1000,
        resourceConstraintEdgeCount: 999,
        totalDependencyEdgeCount: 999,
        criticalPathLength: 1000,
        runtimeEvidenceGap: {
          missingPersistedNetworkData: true,
          missingConcurrentSweepAndRouteRun: true,
          missingDbWriteTiming: true,
          missingConnectionPoolEvidence: true,
          missingFinalProjectionReadback: true,
          missingProjectRouteEvidence: true,
        },
      }),
    ])
    expect(runSyntheticNetworkProfile).toHaveBeenCalledWith({
      taskCount: 1000,
      resourceCapacity: 1,
      resourceBucketCount: 1,
    })
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(false)
  })

  it('fails when the synthetic CPM run exceeds the local budget', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      now: new Date('2026-06-21T05:31:00.000+08:00'),
      scenarios: ['resource_chain_1000'],
      budgetMs: { resource_chain_1000: 0 },
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
    })

    expect(report.scenarios[0].status).toBe('fail')
    expect(report.scenarios[0].reason).toContain('exceeded local budget')
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('accepts archived DB pressure evidence only when concurrency, write timing, and final readback are complete', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      diagnosticRunId: 'c18-l12-db-run-1',
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence.json',
      dbEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence.json',
        diagnosticRunId: 'c18-l12-db-run-1',
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          diagnosticRunId: 'c18-l12-db-run-1',
          refreshRequestId: 'refresh-request-1',
          readbackRequestId: 'readback-request-1',
          dbWriteTraceId: 'db-write-trace-1',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/project-live/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/project-live/critical-path',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: 420,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectionReadbackProjectId: 'project-live',
          finalProjectedFloatTaskCount: 1000,
          finalCriticalTaskCount: 1000,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.dbEvidenceFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence.json')
    expect(report.dbEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence.json',
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence.json',
      diagnosticRunId: 'c18-l12-db-run-1',
      missingEvidenceMetadata: false,
      requiredScenarioCodes: ['resource_chain_1000'],
      missingScenarioCodes: [],
    }))
    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'pass',
        runtimeEvidenceGap: {
          missingPersistedNetworkData: false,
          missingConcurrentSweepAndRouteRun: false,
          missingDbWriteTiming: false,
          missingConnectionPoolEvidence: false,
          missingFinalProjectionReadback: false,
          missingProjectRouteEvidence: false,
          missingDiagnosticRunCorrelationEvidence: false,
        },
      }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(false)
  })

  it('fails closeout mode when DB pressure evidence passes but the report JSON is not archived', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      requireLiveEvidence: true,
      diagnosticRunId: 'c18-l12-db-run-1',
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence.json',
      dbEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence.json',
        diagnosticRunId: 'c18-l12-db-run-1',
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          diagnosticRunId: 'c18-l12-db-run-1',
          refreshRequestId: 'refresh-request-1',
          readbackRequestId: 'readback-request-1',
          dbWriteTraceId: 'db-write-trace-1',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/project-live/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/project-live/critical-path',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: 420,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectionReadbackProjectId: 'project-live',
          finalProjectedFloatTaskCount: 1000,
          finalCriticalTaskCount: 1000,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.requireLiveEvidence).toBe(true)
    expect(report.outputFile).toBeNull()
    expect(report.missingArchivedJson).toBe(true)
    expect(report.dbEvidenceAssessment?.status).toBe('pass')
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived DB pressure evidence when metadata identifies sample or local evidence', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      diagnosticRunId: 'c18-l12-db-run-1',
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-sample.json',
      dbEvidence: {
        environment: 'local',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-sample.json',
        diagnosticRunId: 'c18-l12-db-run-1',
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          diagnosticRunId: 'c18-l12-db-run-1',
          refreshRequestId: 'refresh-request-1',
          readbackRequestId: 'readback-request-1',
          dbWriteTraceId: 'db-write-trace-1',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/project-live/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/project-live/critical-path',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: 420,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectionReadbackProjectId: 'project-live',
          finalProjectedFloatTaskCount: 1000,
          finalCriticalTaskCount: 1000,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.dbEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingEvidenceMetadata: false,
      nonLiveEvidenceMetadata: true,
    }))
    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({ scenarioCode: 'resource_chain_1000', status: 'pass' }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived DB pressure evidence when environment or evidence reference metadata is missing', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      diagnosticRunId: 'c18-l12-db-run-1',
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-sample.json',
      dbEvidence: {
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/project-live/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/project-live/critical-path',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: 420,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectionReadbackProjectId: 'project-live',
          finalProjectedFloatTaskCount: 1000,
          finalCriticalTaskCount: 1000,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.dbEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      environment: null,
      evidenceRef: null,
      missingEvidenceMetadata: true,
      missingScenarioCodes: [],
    }))
    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingDiagnosticRunCorrelationEvidence: true,
        }),
      }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails closeout mode when live DB pressure evidence is missing', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      requireLiveEvidence: true,
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
    } as Parameters<typeof buildCriticalPathSyntheticPressureReport>[0] & { requireLiveEvidence: true })

    expect((report as typeof report & { requireLiveEvidence?: boolean }).requireLiveEvidence).toBe(true)
    expect(report.missingArchivedJson).toBe(true)
    expect(report.dbEvidenceAssessment).toBeNull()
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived DB pressure evidence when persisted-network or final-readback proof is incomplete', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      diagnosticRunId: 'c18-l12-db-run-1',
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-fail.json',
      dbEvidence: {
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          persistedTaskCount: 500,
          persistedDependencyEdgeCount: 499,
          concurrentSweepAndRouteRunObserved: false,
          dbWriteP95Ms: 1400,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: false,
          finalProjectionReadbackObserved: false,
          finalProjectedFloatTaskCount: 0,
          finalCriticalTaskCount: 0,
          finalProjectDurationDays: 0,
        }],
      },
    })

    expect(report.dbEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingScenarioCodes: [],
    }))
    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingPersistedNetworkData: true,
          missingConcurrentSweepAndRouteRun: true,
          missingDbWriteTiming: true,
          missingConnectionPoolEvidence: true,
          missingFinalProjectionReadback: true,
        }),
      }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived DB pressure evidence when timing or readback cardinality is impossible', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      diagnosticRunId: 'c18-l12-db-run-1',
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-impossible-readback.json',
      dbEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-impossible-readback.json',
        diagnosticRunId: 'c18-l12-db-run-1',
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          diagnosticRunId: 'c18-l12-db-run-1',
          refreshRequestId: 'refresh-request-1',
          readbackRequestId: 'readback-request-1',
          dbWriteTraceId: 'db-write-trace-1',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/project-live/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/project-live/critical-path',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: -1,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectionReadbackProjectId: 'project-live',
          finalProjectedFloatTaskCount: 1001,
          finalCriticalTaskCount: 1001,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingDbWriteTiming: true,
          missingFinalProjectionReadback: true,
        }),
      }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived DB pressure evidence when it does not prove the critical-path route and project scope', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-wrong-scope.json',
      dbEvidence: {
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/other-project/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/other-project/critical-path',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: 420,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectionReadbackProjectId: 'project-live',
          finalProjectedFloatTaskCount: 1000,
          finalCriticalTaskCount: 1000,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.dbEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingScenarioCodes: [],
    }))
    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingProjectRouteEvidence: true,
        }),
      }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived DB pressure evidence when final projection readback belongs to another project', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-wrong-final-readback-project.json',
      dbEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-wrong-final-readback-project.json',
        diagnosticRunId: 'c18-l12-db-run-1',
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          diagnosticRunId: 'c18-l12-db-run-1',
          refreshRequestId: 'refresh-request-1',
          readbackRequestId: 'readback-request-1',
          dbWriteTraceId: 'db-write-trace-1',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/project-live/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/project-live/critical-path',
          finalProjectionReadbackProjectId: 'other-project',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: 420,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectedFloatTaskCount: 1000,
          finalCriticalTaskCount: 1000,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.dbEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingScenarioCodes: [],
    }))
    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingFinalProjectionReadback: true,
        }),
      }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived DB pressure evidence when route, readback, and write proof cannot be correlated to one diagnostic run', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-uncorrelated.json',
      dbEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-uncorrelated.json',
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/project-live/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/project-live/critical-path',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: 420,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectionReadbackProjectId: 'project-live',
          finalProjectedFloatTaskCount: 1000,
          finalCriticalTaskCount: 1000,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.dbEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingScenarioCodes: [],
    }))
    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingDiagnosticRunCorrelationEvidence: true,
        }),
      }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('fails archived DB pressure evidence when it is from a previous diagnostic run', async () => {
    const report = await buildCriticalPathSyntheticPressureReport({
      scenarios: ['resource_chain_1000'],
      diagnosticRunId: 'c18-l12-current-run',
      runSyntheticNetworkProfile: () => ({
        taskCount: 1000,
        explicitDependencyCount: 0,
        totalDependencyEdgeCount: 999,
        resourceConstraintEdgeCount: 999,
        criticalPathLength: 1000,
        projectDurationDays: 1000,
      }),
      dbEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-old-run.json',
      dbEvidence: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l12-db-evidence-old-run.json',
        diagnosticRunId: 'c18-l12-old-run',
        scenarios: [{
          scenarioCode: 'resource_chain_1000',
          diagnosticRunId: 'c18-l12-old-run',
          refreshRequestId: 'refresh-request-old',
          readbackRequestId: 'readback-request-old',
          dbWriteTraceId: 'db-write-trace-old',
          projectId: 'project-live',
          routeMethod: 'POST',
          routePath: '/api/projects/project-live/critical-path/refresh',
          readbackRouteMethod: 'GET',
          readbackRoutePath: '/api/projects/project-live/critical-path',
          persistedTaskCount: 1000,
          persistedDependencyEdgeCount: 999,
          concurrentSweepAndRouteRunObserved: true,
          dbWriteP95Ms: 420,
          dbWriteBudgetMs: 1000,
          connectionPoolObserved: true,
          lockWaitObserved: true,
          finalProjectionReadbackObserved: true,
          finalProjectionReadbackProjectId: 'project-live',
          finalProjectedFloatTaskCount: 1000,
          finalCriticalTaskCount: 1000,
          finalProjectDurationDays: 1000,
        }],
      },
    })

    expect(report.diagnosticRunId).toBe('c18-l12-current-run')
    expect(report.dbEvidenceAssessment).toEqual(expect.objectContaining({
      diagnosticRunId: 'c18-l12-old-run',
      expectedDiagnosticRunId: 'c18-l12-current-run',
      diagnosticRunIdMatches: false,
      status: 'fail',
      missingScenarioCodes: [],
    }))
    expect(report.dbEvidenceAssessment?.scenarios).toEqual([
      expect.objectContaining({
        scenarioCode: 'resource_chain_1000',
        status: 'fail',
        runtimeEvidenceGap: expect.objectContaining({
          missingDiagnosticRunCorrelationEvidence: true,
        }),
      }),
    ])
    expect(shouldFailCriticalPathSyntheticPressureReport(report)).toBe(true)
  })

  it('parses scenario filters from CLI args', () => {
    expect(parseCriticalPathSyntheticPressureOptionsFromArgs([
      '--scenarios=resource_chain_1000',
      '--output-file=artifacts/test-runs/c18-l12.json',
      '--db-evidence-file=artifacts/test-runs/c18-l12-db-evidence.json',
      '--diagnostic-run-id=c18-l12-current-run',
      '--require-live-evidence',
    ])).toEqual({
      scenarios: ['resource_chain_1000'],
      outputFile: 'artifacts/test-runs/c18-l12.json',
      dbEvidenceFile: 'artifacts/test-runs/c18-l12-db-evidence.json',
      diagnosticRunId: 'c18-l12-current-run',
      requireLiveEvidence: true,
    })
  })
})
