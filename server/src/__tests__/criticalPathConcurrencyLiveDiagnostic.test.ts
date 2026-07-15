import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildCriticalPathConcurrencyLiveDiagnosticReport,
  parseCriticalPathConcurrencyLiveDiagnosticOptionsFromArgs,
  shouldFailCriticalPathConcurrencyLiveDiagnosticReport,
} from '../scripts/diagnose-critical-path-concurrency-live.js'
import { resolveEvidencePath } from '../scripts/jsonEvidenceUtils.js'
import type {
  CriticalPathFinalProjectionReadbackRequest,
  CriticalPathFinalProjectionReadbackResponse,
  CriticalPathRouteRefreshRequest,
  CriticalPathSweepRequest,
} from '../scripts/diagnose-critical-path-concurrency-live.js'

const workspaceRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)))
const serverRoot = resolve(workspaceRoot, 'server')
const tempArtifactRoot = resolve(workspaceRoot, 'artifacts', 'test-runs', 'critical-path-concurrency-diagnostic-test')
const tempProjectTestingRoot = resolve(workspaceRoot, 'project-testing', 'reports', '__path-resolution-test')
const tempServerProjectTestingRoot = resolve(serverRoot, 'project-testing', 'reports', '__path-resolution-test')

afterEach(() => {
  rmSync(tempArtifactRoot, { recursive: true, force: true })
  rmSync(tempProjectTestingRoot, { recursive: true, force: true })
  rmSync(tempServerProjectTestingRoot, { recursive: true, force: true })
})

function validLockTelemetryEvents(projectId = 'project-live', diagnosticRunId = 'diag-live-1') {
  const lockScope = `workbuddy_critical_path_project:${projectId}`

  return [
    { event: 'lock_acquired', projectId, diagnosticRunId, runId: 'sweep-1', lockScope },
    { event: 'lock_wait', projectId, diagnosticRunId, runId: 'route-wait-1', lockScope, waitMs: 12 },
    { event: 'lock_released', projectId, diagnosticRunId, runId: 'sweep-1', lockScope },
    { event: 'lock_acquired', projectId, diagnosticRunId, runId: 'route-error-1', lockScope },
    { event: 'lock_released_after_error', projectId, diagnosticRunId, runId: 'route-error-1', lockScope },
  ]
}

describe('critical path concurrency live diagnostic', () => {
  it('blocks by default so the diagnostic cannot mutate live critical path state accidentally', async () => {
    const runSweep = vi.fn()
    const requestRouteRefresh = vi.fn()

    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:00:00.000+08:00'),
      runSweep,
      requestRouteRefresh,
    })

    expect(report.reportCode).toBe('c18_l07_critical_path_concurrency_live_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowWrite).toBe(false)
    expect(report.projectId).toBeNull()
    expect(report.liveEvidenceChecklist).toEqual([
      'Run against a real DB/API environment with the project-level CPM advisory lock enabled.',
      'Trigger one scheduler sweep and multiple user route refreshes for the same project concurrently.',
      'Capture lock acquire/wait/release evidence or equivalent job logs for the same project.',
      'Read back the final critical-path snapshot and task float projection after the race.',
      'Archive the full JSON diagnostic output before closing C-18.L07.',
    ])
    expect(report.runtimeEvidenceGap).toEqual({
      missingAllowWrite: true,
      missingBaseUrl: true,
      missingAuthToken: true,
      missingProjectId: true,
      missingLiveConcurrentRun: true,
      missingLockTelemetryEvidence: true,
      missingFinalProjectionReadback: true,
      missingArchivedJson: true,
    })
    expect(runSweep).not.toHaveBeenCalled()
    expect(requestRouteRefresh).not.toHaveBeenCalled()
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('passes the entrypoint only when sweep, every route refresh, and final projection readback complete without unexpected failures', async () => {
    const runSweep = vi.fn(async (_request: CriticalPathSweepRequest) => ({
      scannedProjects: 1,
      refreshedProjects: 1,
      failedProjects: 0,
      skippedProjects: 0,
      failures: [],
    }))
    const requestRouteRefresh = vi.fn(async (_request: CriticalPathRouteRefreshRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-live',
      taskCount: 12,
      criticalTaskCount: 4,
      projectDurationDays: 37,
      errorCode: null,
    }))
    const requestFinalProjectionReadback = vi.fn(async (_request: CriticalPathFinalProjectionReadbackRequest) => ({
      httpStatus: 200,
      success: true,
      projectId: 'project-live',
      taskCount: 12,
      criticalTaskCount: 4,
      projectedFloatTaskCount: 12,
      projectDurationDays: 37,
      networkLineagePresent: true,
      calculationStatus: 'fresh',
      errorCode: null,
    }))

    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:00.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      diagnosticRunId: 'diag-live-1',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
        events: validLockTelemetryEvents(),
      },
      routeRefreshCount: 2,
      runSweep,
      requestRouteRefresh,
      requestFinalProjectionReadback,
    })

    expect(report.status).toBe('pass')
    expect(report.diagnosticRunId).toBe('diag-live-1')
    expect(report.environment).toBeTruthy()
    expect(report.command).toContain('diagnose:critical-path-concurrency-live')
    expect(report.command).toContain('--auth-token=<redacted>')
    expect(report.command).not.toContain('--auth-token=token')
    expect(report.exitCode).toBe(0)
    expect(report.artifactPath).toBe('artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json')
    expect(report.targetIds).toEqual({ projectId: 'project-live' })
    expect(report.startedAt).toBe('2026-06-20T23:01:00.000Z')
    expect(report.finishedAt).toBeTruthy()
    expect(report.cleanupReadback).toEqual({
      status: 'not_required',
      disposableDataCreated: false,
      projectId: 'project-live',
      reason: 'C-18.L07 refreshes existing critical-path projections only; it does not create disposable rows, so cleanup readback is not required.',
    })
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json')
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingArchivedJson: false,
    }))
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingAllowWrite: false,
      missingBaseUrl: false,
      missingAuthToken: false,
      missingProjectId: false,
      missingLiveConcurrentRun: false,
      missingFinalProjectionReadback: false,
      missingLockTelemetryEvidence: false,
      missingArchivedJson: false,
    }))
    expect(report.lockTelemetryFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json')
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
      missingEvidenceMetadata: false,
      status: 'pass',
      acquiredCount: 2,
      waitCount: 1,
      releasedCount: 1,
      errorReleaseCount: 1,
      diagnosticRunIdMatch: true,
      lockScopeMatch: true,
      eventSequenceValid: true,
      coherentDiagnosticRunId: 'diag-live-1',
      coherentLockScope: 'workbuddy_critical_path_project:project-live',
      normalReleasePairCount: 1,
      errorReleasePairCount: 1,
      waitEvidenceCount: 1,
      missingSignals: [],
    }))
    expect(report.checks.concurrentSweepAndRoute).toEqual(expect.objectContaining({
      sweepAttemptCount: 1,
      routeAttemptCount: 2,
      successCount: 3,
      unexpectedFailureCount: 0,
      status: 'pass',
      finalProjectionEvidenceRequired: true,
    }))
    expect(report.checks.concurrentSweepAndRoute.finalProjectionReadback).toEqual(expect.objectContaining({
      status: 'pass',
      taskCount: 12,
      criticalTaskCount: 4,
      projectedFloatTaskCount: 12,
      projectDurationDays: 37,
      networkLineagePresent: true,
      consistencyStatus: 'pass',
    }))
    expect(runSweep).toHaveBeenCalledTimes(1)
    expect(runSweep).toHaveBeenCalledWith({ projectId: 'project-live' })
    expect(requestRouteRefresh).toHaveBeenCalledTimes(2)
    expect(requestRouteRefresh.mock.calls[0][0]).toMatchObject({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
    })
    expect(requestFinalProjectionReadback).toHaveBeenCalledTimes(1)
    expect(requestFinalProjectionReadback).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
    })
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(false)
  })

  it('fails closeout when lock telemetry belongs to a different diagnostic run than the report', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:02.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      diagnosticRunId: 'diag-current',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-old.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-old.json',
        events: validLockTelemetryEvents('project-live', 'diag-old'),
      },
      routeRefreshCount: 2,
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.diagnosticRunId).toBe('diag-current')
    expect(report.runtimeEvidenceGap.missingLockTelemetryEvidence).toBe(true)
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      coherentDiagnosticRunId: 'diag-old',
      diagnosticRunIdMatchesReport: false,
      expectedDiagnosticRunId: 'diag-current',
      missingSignals: ['diagnostic_run_id'],
    }))
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('lock telemetry')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails closeout when all live CPM evidence passes but no diagnostic JSON is archived', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:03.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      diagnosticRunId: 'diag-live-1',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
        events: validLockTelemetryEvents(),
      },
      routeRefreshCount: 2,
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingLiveConcurrentRun: false,
      missingLockTelemetryEvidence: false,
      missingFinalProjectionReadback: false,
      missingArchivedJson: true,
    }))
    expect(report.status).toBe('fail')
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('Archive')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('keeps the concurrency probe failed when provided lock telemetry is missing required signals', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:10.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-incomplete.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-incomplete.json',
        events: [
          { event: 'lock_acquired', projectId: 'project-live' },
          { event: 'lock_released', projectId: 'project-live' },
        ],
      },
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingLockTelemetryEvidence).toBe(true)
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingSignals: ['lock_wait', 'lock_released_after_error'],
    }))
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('lock telemetry')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('does not count wait-not-observed telemetry as lock wait evidence', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:11.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      diagnosticRunId: 'diag-live-1',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-wait-not-observed.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-wait-not-observed.json',
        events: [
          { event: 'advisory_lock_acquired', operationRunId: 'holder', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'advisory_lock_wait_not_observed', operationRunId: 'route', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'advisory_lock_released', operationRunId: 'holder', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'advisory_lock_acquired', operationRunId: 'error-release', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'advisory_lock_released_after_error', operationRunId: 'error-release', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
        ],
      },
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      waitCount: 0,
      missingSignals: expect.arrayContaining(['lock_wait']),
    }))
  })

  it('accepts route-pending-while-lock-held telemetry as equivalent lock wait evidence', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:12.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      diagnosticRunId: 'diag-live-1',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-route-pending.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-route-pending.json',
        events: [
          { event: 'advisory_lock_acquired', operationRunId: 'holder', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'route_refresh_waiting_while_lock_held', operationRunId: 'route', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'advisory_lock_released', operationRunId: 'holder', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'advisory_lock_acquired', operationRunId: 'error-release', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'advisory_lock_released_after_error', operationRunId: 'error-release', diagnosticRunId: 'diag-live-1', projectId: 'project-live', lockScope: 'workbuddy_critical_path_project:project-live' },
        ],
      },
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('pass')
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      waitCount: 1,
      coherentDiagnosticRunId: 'diag-live-1',
      coherentLockScope: 'workbuddy_critical_path_project:project-live',
      waitEvidenceCount: 1,
      missingSignals: [],
    }))
  })

  it('keeps the concurrency probe failed when lock telemetry belongs to a different project', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:15.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      diagnosticRunId: 'diag-live-1',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-wrong-project.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-wrong-project.json',
        events: [
          { event: 'lock_acquired', projectId: 'other-project' },
          { event: 'lock_wait', projectId: 'other-project', waitMs: 12 },
          { event: 'lock_released', projectId: 'other-project' },
          { event: 'lock_released_after_error', projectId: 'other-project' },
        ],
      },
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingLockTelemetryEvidence).toBe(true)
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      acquiredCount: 0,
      waitCount: 0,
      releasedCount: 0,
      errorReleaseCount: 0,
      missingSignals: [
        'project_id_match',
        'lock_acquired',
        'lock_wait',
        'lock_released',
        'lock_released_after_error',
      ],
    }))
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('lock telemetry')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('keeps the concurrency probe failed when lock telemetry signals are stitched from different runs or lock scopes', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:16.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-stitched.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-stitched.json',
        events: [
          { event: 'lock_acquired', projectId: 'project-live', diagnosticRunId: 'diag-a', runId: 'sweep-1', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'lock_wait', projectId: 'project-live', diagnosticRunId: 'diag-b', runId: 'route-1', lockScope: 'workbuddy_critical_path_project:other-project' },
          { event: 'lock_released', projectId: 'project-live', diagnosticRunId: 'diag-c', runId: 'route-2', lockScope: 'workbuddy_critical_path_project:project-live' },
          { event: 'lock_released_after_error', projectId: 'project-live', diagnosticRunId: 'diag-d', runId: 'error-1', lockScope: 'workbuddy_critical_path_project:project-live:error-path' },
        ],
      },
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingLockTelemetryEvidence).toBe(true)
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      acquiredCount: 1,
      waitCount: 1,
      releasedCount: 1,
      errorReleaseCount: 1,
      missingSignals: expect.arrayContaining([
        'diagnostic_run_id_match',
        'lock_scope_match',
        'lock_event_sequence',
      ]),
    }))
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('lock telemetry')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when lock telemetry has all signals but lacks environment or evidence reference metadata', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:18.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry-sample.json',
      lockTelemetry: {
        events: validLockTelemetryEvents(),
      },
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingLockTelemetryEvidence).toBe(true)
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      environment: null,
      evidenceRef: null,
      missingEvidenceMetadata: true,
      acquiredCount: 2,
      waitCount: 1,
      releasedCount: 1,
      errorReleaseCount: 1,
      missingSignals: ['evidence_metadata'],
    }))
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('lock telemetry')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('loads lock telemetry from workspace-root artifacts paths when npm workspace scripts run from server cwd', async () => {
    const artifactPath = resolve(tempArtifactRoot, 'c18-l07-lock-telemetry.json')
    mkdirSync(tempArtifactRoot, { recursive: true })
    writeFileSync(artifactPath, JSON.stringify({
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/critical-path-concurrency-diagnostic-test/c18-l07-lock-telemetry.json',
      events: validLockTelemetryEvents(),
    }), 'utf8')

    const previousCwd = process.cwd()
    process.chdir(serverRoot)
    let report
    try {
      report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
        now: new Date('2026-06-21T07:01:20.000+08:00'),
        projectId: 'project-live',
        diagnosticRunId: 'diag-live-1',
        lockTelemetryFile: 'artifacts/test-runs/critical-path-concurrency-diagnostic-test/c18-l07-lock-telemetry.json',
      })
    } finally {
      process.chdir(previousCwd)
    }

    expect(report.status).toBe('blocked')
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      environment: 'staging',
      evidenceRef: 'artifacts/test-runs/critical-path-concurrency-diagnostic-test/c18-l07-lock-telemetry.json',
      missingEvidenceMetadata: false,
      acquiredCount: 2,
      waitCount: 1,
      releasedCount: 1,
      errorReleaseCount: 1,
      diagnosticRunIdMatch: true,
      lockScopeMatch: true,
      eventSequenceValid: true,
      coherentDiagnosticRunId: 'diag-live-1',
      coherentLockScope: 'workbuddy_critical_path_project:project-live',
      normalReleasePairCount: 1,
      errorReleasePairCount: 1,
      waitEvidenceCount: 1,
      missingSignals: [],
    }))
    expect(report.runtimeEvidenceGap.missingLockTelemetryEvidence).toBe(false)
  })

  it('collects lock telemetry before reading a missing telemetry artifact file', async () => {
    const artifactPath = resolve(tempArtifactRoot, 'c18-l07-lock-telemetry-collected.json')
    const lockTelemetryFile = 'artifacts/test-runs/critical-path-concurrency-diagnostic-test/c18-l07-lock-telemetry-collected.json'
    const runLockTelemetryProbe = vi.fn(async () => {
      mkdirSync(tempArtifactRoot, { recursive: true })
      writeFileSync(artifactPath, JSON.stringify({
        environment: 'staging',
        evidenceRef: lockTelemetryFile,
        events: validLockTelemetryEvents('project-live', 'diag-collected'),
      }), 'utf8')
    })

    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:22.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      diagnosticRunId: 'diag-collected',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile,
      collectLockTelemetry: true,
      runLockTelemetryProbe,
      routeRefreshCount: 2,
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(runLockTelemetryProbe).toHaveBeenCalledTimes(1)
    expect(report.status).toBe('pass')
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'pass',
      environment: 'staging',
      evidenceRef: lockTelemetryFile,
      coherentDiagnosticRunId: 'diag-collected',
      coherentLockScope: 'workbuddy_critical_path_project:project-live',
      missingSignals: [],
    }))
  })

  it('archives failing lock telemetry probe evidence instead of aborting the diagnostic report', async () => {
    const lockTelemetryFile = 'artifacts/test-runs/critical-path-concurrency-diagnostic-test/c18-l07-lock-telemetry-probe-failed.json'
    const runLockTelemetryProbe = vi.fn(async () => {
      throw new Error('Query read timeout')
    })

    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:23.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      diagnosticRunId: 'diag-probe-timeout',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile,
      collectLockTelemetry: true,
      runLockTelemetryProbe,
      routeRefreshCount: 1,
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    const archivedTelemetry = JSON.parse(readFileSync(resolve(tempArtifactRoot, 'c18-l07-lock-telemetry-probe-failed.json'), 'utf8'))

    expect(runLockTelemetryProbe).toHaveBeenCalledTimes(1)
    expect(report.status).toBe('fail')
    expect(report.lockTelemetryAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      environment: 'test',
      evidenceRef: lockTelemetryFile,
      missingSignals: expect.arrayContaining(['lock_acquired', 'lock_wait', 'lock_released', 'lock_released_after_error']),
    }))
    expect(archivedTelemetry).toEqual(expect.objectContaining({
      environment: 'test',
      evidenceRef: lockTelemetryFile,
      evidenceKind: 'db_advisory_lock_probe_failure',
      diagnosticRunId: 'diag-probe-timeout',
      projectId: 'project-live',
    }))
    expect(archivedTelemetry.events).toEqual([
      expect.objectContaining({
        event: 'lock_telemetry_probe_failed',
        errorMessage: 'Query read timeout',
      }),
    ])
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('lock telemetry')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('keeps project-testing evidence paths anchored at the workspace root even when stale server-local files exist', () => {
    const relativeEvidencePath = 'project-testing/reports/__path-resolution-test/c18-l07.json'
    mkdirSync(tempProjectTestingRoot, { recursive: true })
    mkdirSync(tempServerProjectTestingRoot, { recursive: true })
    writeFileSync(resolve(tempServerProjectTestingRoot, 'c18-l07.json'), '{}\n', 'utf8')

    const previousCwd = process.cwd()
    process.chdir(serverRoot)
    try {
      expect(resolveEvidencePath(relativeEvidencePath)).toBe(resolve(workspaceRoot, relativeEvidencePath))
    } finally {
      process.chdir(previousCwd)
    }
  })

  it('fails when the final projection readback disagrees with successful route refresh responses', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:30.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      routeRefreshCount: 2,
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 11,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 11,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentSweepAndRoute.finalProjectionReadback).toEqual(expect.objectContaining({
      status: 'fail',
      taskCount: 11,
      routeResponseTaskCounts: [12, 12],
      consistencyStatus: 'fail',
    }))
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('final critical path projection readback')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when the final projection readback belongs to a different project than the diagnostic target', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:35.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
        events: validLockTelemetryEvents(),
      },
      routeRefreshCount: 2,
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectDurationDays: 37,
        errorCode: null,
      })),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'other-project',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      } as CriticalPathFinalProjectionReadbackResponse)),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentSweepAndRoute.finalProjectionReadback).toEqual(expect.objectContaining({
      status: 'fail',
      projectId: 'other-project',
      expectedProjectId: 'project-live',
      projectIdMatches: false,
      reason: expect.stringContaining('final_snapshot_project_id_mismatch'),
    }))
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('final critical path projection readback')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when any successful route refresh response belongs to a different project than the diagnostic target', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:01:40.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-critical-path.json',
      lockTelemetryFile: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
      lockTelemetry: {
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l07-lock-telemetry.json',
        events: validLockTelemetryEvents(),
      },
      routeRefreshCount: 2,
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn()
        .mockResolvedValueOnce({
          httpStatus: 200,
          success: true,
          projectId: 'project-live',
          taskCount: 12,
          criticalTaskCount: 4,
          projectDurationDays: 37,
          errorCode: null,
        })
        .mockResolvedValueOnce({
          httpStatus: 200,
          success: true,
          projectId: 'other-project',
          taskCount: 12,
          criticalTaskCount: 4,
          projectDurationDays: 37,
          errorCode: null,
        }),
      requestFinalProjectionReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        projectId: 'project-live',
        taskCount: 12,
        criticalTaskCount: 4,
        projectedFloatTaskCount: 12,
        projectDurationDays: 37,
        networkLineagePresent: true,
        calculationStatus: 'fresh',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentSweepAndRoute.routeResponseProjectIds).toEqual(['project-live', 'other-project'])
    expect(report.checks.concurrentSweepAndRoute.routeResponseProjectIdMatches).toBe(false)
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('route refresh project id')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when any concurrent route refresh returns an unexpected error', async () => {
    const report = await buildCriticalPathConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T07:02:00.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      routeRefreshCount: 2,
      runSweep: vi.fn(async () => ({
        scannedProjects: 1,
        refreshedProjects: 1,
        failedProjects: 0,
        skippedProjects: 0,
        failures: [],
      })),
      requestRouteRefresh: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 500, success: false, errorCode: 'CPM_REFRESH_FAILED' }),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentSweepAndRoute.reason).toContain('Expected sweep and all route refreshes to complete successfully')
    expect(shouldFailCriticalPathConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('parses live diagnostic CLI flags', () => {
    expect(parseCriticalPathConcurrencyLiveDiagnosticOptionsFromArgs([
      '--allow-write',
      '--base-url=http://127.0.0.1:3001',
      '--auth-token=token',
      '--project-id=project-1',
      '--diagnostic-run-id=diag-1',
      '--route-refresh-count=3',
      '--output-file=artifacts/test-runs/c18-l07.json',
      '--lock-telemetry-file=artifacts/test-runs/c18-l07-lock-telemetry.json',
    ])).toEqual({
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-1',
      diagnosticRunId: 'diag-1',
      routeRefreshCount: 3,
      outputFile: 'artifacts/test-runs/c18-l07.json',
      lockTelemetryFile: 'artifacts/test-runs/c18-l07-lock-telemetry.json',
    })
  })
})
