import { beforeEach, describe, expect, it, vi } from 'vitest'

const databaseMocks = vi.hoisted(() => ({
  query: vi.fn(async () => ({ rowCount: 1 })),
}))

const pgMocks = vi.hoisted(() => {
  const query = vi.fn(async () => ({ rowCount: 1, rows: [] }))
  const connect = vi.fn(async () => undefined)
  const end = vi.fn(async () => undefined)
  const client = { connect, query, end }

  return {
    Client: vi.fn(() => client),
    connect,
    query,
    end,
  }
})

vi.mock('../database.js', () => ({
  query: databaseMocks.query,
}))

vi.mock('pg', () => ({
  default: {
    Client: pgMocks.Client,
  },
}))

import {
  buildAcceptanceStatusConcurrencyLiveDiagnosticReport,
  parseAcceptanceStatusConcurrencyLiveDiagnosticOptionsFromArgs,
  shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport,
} from '../scripts/diagnose-acceptance-status-concurrency-live.js'
import type {
  AcceptancePlanReadbackRequest,
  DisposableAcceptancePlanCleanupRequester,
  DisposableAcceptancePlanCreator,
} from '../scripts/diagnose-acceptance-status-concurrency-live.js'

describe('acceptance status concurrency live diagnostic', () => {
  beforeEach(() => {
    databaseMocks.query.mockClear()
    databaseMocks.query.mockResolvedValue({ rowCount: 1 })
    pgMocks.Client.mockClear()
    pgMocks.connect.mockClear()
    pgMocks.query.mockClear()
    pgMocks.end.mockClear()
    pgMocks.query.mockResolvedValue({ rowCount: 1, rows: [] })
    delete process.env.WORKBUDDY_DIAGNOSTIC_CLEANUP_DATABASE_URL
    delete process.env.SUPABASE_MIGRATION_URL
  })

  it('blocks by default so the diagnostic cannot mutate acceptance plans accidentally', async () => {
    const requestStatusChange = vi.fn()

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:00:00.000+08:00'),
      requestStatusChange,
    })

    expect(report.reportCode).toBe('c18_l08_acceptance_status_concurrency_live_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowWrite).toBe(false)
    expect(report.planId).toBeNull()
    expect(report.liveEvidenceChecklist).toEqual([
      'Run against a real DB/API environment using a disposable acceptance plan.',
      'Send two concurrent status writes to the same plan and require one stale-write conflict.',
      'Read back the final acceptance plan state after the race.',
      'Verify no illegal status jump, lost update, or stale actual date survived.',
      'Archive the full JSON diagnostic output before closing C-18.L08.',
    ])
    expect(report.runtimeEvidenceGap).toEqual({
      missingAllowWrite: true,
      missingBaseUrl: true,
      missingAuthToken: true,
      missingPlanId: true,
      missingDisposablePlanEvidence: true,
      missingLiveConcurrentRun: true,
      missingFinalPlanReadback: true,
      missingArchivedJson: true,
    })
    expect(requestStatusChange).not.toHaveBeenCalled()
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails without disposable plan evidence even when concurrent status writes produce one success and one stale conflict', async () => {
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 404,
        success: false,
        status: null,
        actualDate: null,
        projectId: null,
        errorCode: 'NOT_FOUND',
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:00.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      requestStatusChange,
      requestPlanReadback,
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json')
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingAllowWrite: false,
      missingBaseUrl: false,
      missingAuthToken: false,
      missingPlanId: false,
      missingDisposablePlanEvidence: true,
      missingLiveConcurrentRun: false,
      missingFinalPlanReadback: false,
      missingArchivedJson: false,
    }))
    expect(report.checks.concurrentStatusWrite).toEqual(expect.objectContaining({
      attemptCount: 2,
      successCount: 1,
      conflictCount: 1,
      unexpectedFailureCount: 0,
      status: 'fail',
    }))
    expect(report.checks.concurrentStatusWrite.finalPlanReadback).toEqual(expect.objectContaining({
      status: 'pass',
      planStatus: 'in_progress',
      actualDate: '2026-06-21',
      projectId: 'project-live',
    }))
    expect(report.checks.concurrentStatusWrite.reason).toContain('disposable plan evidence')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('passes only when concurrent writes, final readback, and disposable plan evidence all pass', async () => {
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 404,
        success: false,
        status: null,
        actualDate: null,
        projectId: null,
        errorCode: 'NOT_FOUND',
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:05.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      disposablePlanEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan.json',
      disposablePlanEvidence: {
        planId: 'plan-live',
        disposable: true,
        createdForDiagnostic: 'C-18.L08',
        diagnosticRunId: 'c18-l08-2026-06-20T22-01-05-000Z',
        routeInvocationId: 'route-plan-live-1',
        requestId: 'request-plan-live-1',
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan.json',
        cleanup: {
          strategy: 'physical_delete',
          status: 'pass',
        },
      },
      requestStatusChange,
      requestPlanReadback,
      diagnosticRunId: 'c18-l08-2026-06-20T22-01-05-000Z',
    })

    expect(report.status).toBe('pass')
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingDisposablePlanEvidence: false,
      missingLiveConcurrentRun: false,
      missingFinalPlanReadback: false,
      missingArchivedJson: false,
    }))
    expect(report.disposablePlanEvidenceFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan.json')
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      evidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan.json',
      status: 'pass',
      planIdMatches: true,
      disposable: true,
      cleanupEvidencePresent: true,
      diagnosticRunIdPresent: true,
      diagnosticRunIdMatches: true,
      requestCorrelationPresent: true,
      missingSignals: [],
    }))
    expect(requestStatusChange).toHaveBeenCalledTimes(2)
    expect(requestStatusChange.mock.calls[0][0]).toMatchObject({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      status: 'in_progress',
      actualDate: '2026-06-21',
    })
    expect(requestPlanReadback).toHaveBeenCalledTimes(1)
    expect(requestPlanReadback).toHaveBeenCalledWith({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
    })
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(false)
  })

  it('fails when external disposable plan evidence is not tied to the current diagnostic run', async () => {
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:05.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      disposablePlanEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan.json',
      disposablePlanEvidence: {
        planId: 'plan-live',
        disposable: true,
        createdForDiagnostic: 'C-18.L08',
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan.json',
        cleanup: {
          strategy: 'physical_delete',
          status: 'pass',
        },
      },
      requestStatusChange,
      requestPlanReadback,
    })

    expect(report.status).toBe('fail')
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      diagnosticRunIdPresent: false,
      requestCorrelationPresent: false,
      missingSignals: expect.arrayContaining([
        'diagnostic_run_id',
        'route_correlation',
      ]),
    }))
    expect(report.runtimeEvidenceGap.missingDisposablePlanEvidence).toBe(true)
    expect(report.checks.concurrentStatusWrite.reason).toContain('disposable plan evidence')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('can create and clean up a disposable acceptance plan for the live concurrency probe', async () => {
    const createDisposablePlan: DisposableAcceptancePlanCreator = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      planId: 'plan-disposable',
      projectId: 'project-live',
      errorCode: null,
    }))
    const cleanupDisposablePlan: DisposableAcceptancePlanCleanupRequester = vi.fn(async () => ({
      httpStatus: 200,
      success: true,
      errorCode: null,
    }))
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 404,
        success: false,
        status: null,
        actualDate: null,
        projectId: null,
        errorCode: 'NOT_FOUND',
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:06.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createDisposablePlan: true,
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      createDisposableAcceptancePlan: createDisposablePlan,
      cleanupDisposableAcceptancePlan: cleanupDisposablePlan,
      requestStatusChange,
      requestPlanReadback,
    })

    expect(report.status).toBe('pass')
    expect(report.planId).toBe('plan-disposable')
    expect(report.projectId).toBe('project-live')
    expect(report.createdDisposablePlan).toBe(true)
    expect(report.disposablePlanCleanup).toEqual({
      status: 'pass',
      httpStatus: 200,
      errorCode: null,
      errorMessage: null,
      deletionReadback: {
        attempted: true,
        status: 'pass',
        httpStatus: 404,
        success: false,
        planStillReadable: false,
        errorCode: 'NOT_FOUND',
      },
    })
    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingPlanId: false,
      missingDisposablePlanEvidence: false,
      missingLiveConcurrentRun: false,
      missingFinalPlanReadback: false,
      missingArchivedJson: false,
    }))
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      evidenceFile: null,
      status: 'pass',
      planIdMatches: true,
      disposable: true,
      cleanupEvidencePresent: true,
      environment: 'live_http_probe',
      evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      missingEvidenceMetadata: false,
      missingSignals: [],
    }))
    expect(createDisposablePlan).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
    }))
    expect(cleanupDisposablePlan).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-disposable',
    }))
    expect(requestStatusChange).toHaveBeenCalledTimes(2)
    expect(requestPlanReadback).toHaveBeenCalledTimes(2)
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(false)
  })

  it('uses guarded direct cleanup for disposable acceptance plans created by the diagnostic', async () => {
    const createDisposablePlan: DisposableAcceptancePlanCreator = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      planId: 'plan-disposable',
      projectId: 'project-live',
      errorCode: null,
    }))
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'preparing',
        actualDate: null,
        projectId: 'project-live',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 404,
        success: false,
        status: null,
        actualDate: null,
        projectId: null,
        errorCode: 'NOT_FOUND',
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:06.100+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createDisposablePlan: true,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      createDisposableAcceptancePlan: createDisposablePlan,
      requestStatusChange,
      requestPlanReadback,
    })

    expect(report.status).toBe('pass')
    expect(report.disposablePlanCleanup.status).toBe('pass')
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      cleanupEvidencePresent: true,
      status: 'pass',
    }))
    expect(databaseMocks.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM acceptance_plans'),
      ['plan-disposable', 'project-live'],
    )
    const cleanupSql = String((databaseMocks.query.mock.calls as unknown[][])[0]?.[0] ?? '')
    expect(cleanupSql).toContain("notes LIKE '%createdForDiagnostic=C-18.L08%'")
    expect(cleanupSql).toContain("notes LIKE '%disposable=true%'")
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(false)
  })

  it('prefers diagnostic cleanup database connection over runtime cleanup for disposable plans', async () => {
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=require'
    databaseMocks.query.mockResolvedValue({ rowCount: 0 })
    const createDisposablePlan: DisposableAcceptancePlanCreator = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      planId: 'plan-disposable',
      projectId: 'project-live',
      errorCode: null,
    }))
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'preparing',
        actualDate: null,
        projectId: 'project-live',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 404,
        success: false,
        status: null,
        actualDate: null,
        projectId: null,
        errorCode: 'NOT_FOUND',
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:06.110+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createDisposablePlan: true,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      createDisposableAcceptancePlan: createDisposablePlan,
      requestStatusChange,
      requestPlanReadback,
    })

    expect(report.status).toBe('pass')
    expect(report.disposablePlanCleanup.status).toBe('pass')
    expect(databaseMocks.query).not.toHaveBeenCalled()
    expect(pgMocks.Client).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
      ssl: { rejectUnauthorized: false },
    }))
    expect(pgMocks.connect).toHaveBeenCalled()
    expect(pgMocks.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM acceptance_plans'),
      ['plan-disposable', 'project-live'],
    )
    expect(pgMocks.end).toHaveBeenCalled()
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      cleanupEvidencePresent: true,
      status: 'pass',
    }))
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(false)
  })

  it('sends the disposable plan initial status as the expected status for stale-write detection', async () => {
    const createDisposablePlan: DisposableAcceptancePlanCreator = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      planId: 'plan-disposable',
      projectId: 'project-live',
      status: 'draft',
      errorCode: null,
    }))
    const cleanupDisposablePlan: DisposableAcceptancePlanCleanupRequester = vi.fn(async () => ({
      httpStatus: 200,
      success: true,
      errorCode: null,
    }))
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'preparing',
        actualDate: null,
        projectId: 'project-live',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 404,
        success: false,
        status: null,
        actualDate: null,
        projectId: null,
        errorCode: 'NOT_FOUND',
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:06.125+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createDisposablePlan: true,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      createDisposableAcceptancePlan: createDisposablePlan,
      cleanupDisposableAcceptancePlan: cleanupDisposablePlan,
      requestStatusChange,
      requestPlanReadback,
    })

    expect(report.status).toBe('pass')
    expect(requestStatusChange).toHaveBeenCalledTimes(2)
    expect(requestStatusChange.mock.calls[0][0]).toMatchObject({
      planId: 'plan-disposable',
      status: 'preparing',
      expectedStatus: 'draft',
    })
    expect(requestStatusChange.mock.calls[1][0]).toMatchObject({
      planId: 'plan-disposable',
      status: 'preparing',
      expectedStatus: 'draft',
    })
  })

  it('fails when cleanup reports success but the disposable plan remains readable afterward', async () => {
    const createDisposablePlan: DisposableAcceptancePlanCreator = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      planId: 'plan-disposable',
      projectId: 'project-live',
      errorCode: null,
    }))
    const cleanupDisposablePlan: DisposableAcceptancePlanCleanupRequester = vi.fn(async () => ({
      httpStatus: 200,
      success: true,
      errorCode: null,
    }))
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:06.250+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createDisposablePlan: true,
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      createDisposableAcceptancePlan: createDisposablePlan,
      cleanupDisposableAcceptancePlan: cleanupDisposablePlan,
      requestStatusChange,
      requestPlanReadback,
    })

    expect(report.status).toBe('fail')
    expect(report.disposablePlanCleanup).toEqual(expect.objectContaining({
      status: 'fail',
      deletionReadback: expect.objectContaining({
        attempted: true,
        status: 'fail',
        httpStatus: 200,
        planStillReadable: true,
      }),
    }))
    expect(report.runtimeEvidenceGap.missingDisposablePlanEvidence).toBe(true)
    expect(report.checks.concurrentStatusWrite.reason).toContain('disposable plan evidence')
    expect(requestPlanReadback).toHaveBeenCalledTimes(2)
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('accepts the route guard missing-project response as deleted after cleanup', async () => {
    const createDisposablePlan: DisposableAcceptancePlanCreator = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      planId: 'plan-disposable',
      projectId: 'project-live',
      errorCode: null,
    }))
    const cleanupDisposablePlan: DisposableAcceptancePlanCleanupRequester = vi.fn(async () => ({
      httpStatus: 200,
      success: true,
      errorCode: null,
    }))
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const requestPlanReadback = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 200,
        success: true,
        status: 'preparing',
        actualDate: null,
        projectId: 'project-live',
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 400,
        success: false,
        status: null,
        actualDate: null,
        projectId: null,
        errorCode: 'BAD_REQUEST',
        errorMessage: '缺少项目ID',
      })

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:06.300+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createDisposablePlan: true,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      createDisposableAcceptancePlan: createDisposablePlan,
      cleanupDisposableAcceptancePlan: cleanupDisposablePlan,
      requestStatusChange,
      requestPlanReadback,
    })

    expect(report.status).toBe('pass')
    expect(report.disposablePlanCleanup).toEqual(expect.objectContaining({
      status: 'pass',
      deletionReadback: expect.objectContaining({
        attempted: true,
        status: 'pass',
        httpStatus: 400,
        planStillReadable: false,
        errorCode: 'BAD_REQUEST',
      }),
    }))
    expect(report.runtimeEvidenceGap.missingDisposablePlanEvidence).toBe(false)
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(false)
  })

  it('fails when the final readback belongs to a different project than the disposable probe project', async () => {
    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:06.500+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createDisposablePlan: true,
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      createDisposableAcceptancePlan: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        planId: 'plan-disposable',
        projectId: 'project-live',
        errorCode: null,
      })),
      cleanupDisposableAcceptancePlan: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        errorCode: null,
      })),
      requestStatusChange: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' }),
      requestPlanReadback: vi.fn()
        .mockResolvedValueOnce({
          httpStatus: 200,
          success: true,
          status: 'in_progress',
          actualDate: '2026-06-21',
          projectId: 'other-project',
          errorCode: null,
        })
        .mockResolvedValueOnce({
          httpStatus: 404,
          success: false,
          status: null,
          actualDate: null,
          projectId: null,
          errorCode: 'NOT_FOUND',
        }),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentStatusWrite.finalPlanReadback).toEqual(expect.objectContaining({
      status: 'fail',
      projectId: 'other-project',
      expectedProjectId: 'project-live',
      reason: expect.stringContaining('final_plan_project_id_mismatch'),
    }))
    expect(report.checks.concurrentStatusWrite.reason).toContain('final acceptance plan readback')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails before concurrent writes when created disposable plan belongs to a different project', async () => {
    const requestStatusChange = vi.fn()
      .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
      .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' })
    const cleanupDisposablePlan: DisposableAcceptancePlanCleanupRequester = vi.fn(async () => ({
      httpStatus: 200,
      success: true,
      errorCode: null,
    }))

    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:06.750+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      createDisposablePlan: true,
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      createDisposableAcceptancePlan: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        planId: 'plan-disposable',
        projectId: 'other-project',
        errorCode: null,
      })),
      cleanupDisposableAcceptancePlan: cleanupDisposablePlan,
      requestStatusChange,
      requestPlanReadback: vi.fn()
        .mockResolvedValueOnce({
          httpStatus: 404,
          success: false,
          status: null,
          actualDate: null,
          projectId: null,
          errorCode: 'NOT_FOUND',
        }),
    })

    expect(report.status).toBe('fail')
    expect(report.planId).toBe('plan-disposable')
    expect(report.createdDisposablePlan).toBe(true)
    expect(report.disposablePlanCleanup.status).toBe('pass')
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      planIdMatches: true,
      createdProjectIdMatches: false,
      missingSignals: ['created_project_id_match'],
    }))
    expect(report.runtimeEvidenceGap.missingDisposablePlanEvidence).toBe(true)
    expect(report.checks.concurrentStatusWrite.reason).toContain('Created disposable acceptance plan project mismatch')
    expect(requestStatusChange).not.toHaveBeenCalled()
    expect(cleanupDisposablePlan).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'plan-disposable',
    }))
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('blocks before mutating when all live parameters are present but no diagnostic JSON is archived', async () => {
    const requestStatusChange = vi.fn()
    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:07.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      status: 'in_progress',
      actualDate: '2026-06-21',
      disposablePlanEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan.json',
      disposablePlanEvidence: {
        planId: 'plan-live',
        disposable: true,
        createdForDiagnostic: 'C-18.L08',
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan.json',
        cleanup: {
          strategy: 'physical_delete',
          status: 'pass',
        },
      },
      requestStatusChange,
      requestPlanReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })),
    })

    expect(report.runtimeEvidenceGap).toEqual(expect.objectContaining({
      missingArchivedJson: true,
    }))
    expect(report.status).toBe('blocked')
    expect(requestStatusChange).not.toHaveBeenCalled()
    expect(report.checks.concurrentStatusWrite.reason).toContain('Archive')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('keeps the probe failed when disposable evidence belongs to a different plan or lacks cleanup evidence', async () => {
    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:10.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      disposablePlanEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan-wrong.json',
      disposablePlanEvidence: {
        planId: 'other-plan',
        disposable: true,
        createdForDiagnostic: 'C-18.L08',
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan-wrong.json',
      },
      requestStatusChange: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' }),
      requestPlanReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        status: 'preparing',
        actualDate: null,
        projectId: 'project-live',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingDisposablePlanEvidence).toBe(true)
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      planIdMatches: false,
      cleanupEvidencePresent: false,
      missingSignals: expect.arrayContaining([
        'plan_id_match',
        'cleanup_evidence',
        'diagnostic_run_id',
        'route_correlation',
      ]),
    }))
    expect(report.checks.concurrentStatusWrite.reason).toContain('disposable plan evidence')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when disposable evidence does not declare the C-18.L08 diagnostic scope', async () => {
    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:20.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      disposablePlanEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan-generic.json',
      disposablePlanEvidence: {
        planId: 'plan-live',
        disposable: true,
        environment: 'staging',
        evidenceRef: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan-generic.json',
        cleanup: {
          strategy: 'physical_delete',
          status: 'pass',
        },
      },
      requestStatusChange: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' }),
      requestPlanReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingDisposablePlanEvidence).toBe(true)
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      missingSignals: expect.arrayContaining([
        'diagnostic_scope',
        'diagnostic_run_id',
        'route_correlation',
      ]),
    }))
    expect(report.checks.concurrentStatusWrite.reason).toContain('disposable plan evidence')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when disposable evidence lacks environment or artifact reference metadata', async () => {
    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:25.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      disposablePlanEvidenceFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-disposable-plan-missing-ref.json',
      disposablePlanEvidence: {
        planId: 'plan-live',
        disposable: true,
        createdForDiagnostic: 'C-18.L08',
        cleanup: {
          strategy: 'physical_delete',
          status: 'pass',
        },
      },
      requestStatusChange: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' }),
      requestPlanReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        status: 'in_progress',
        actualDate: '2026-06-21',
        projectId: 'project-live',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.runtimeEvidenceGap.missingDisposablePlanEvidence).toBe(true)
    expect(report.disposablePlanEvidenceAssessment).toEqual(expect.objectContaining({
      status: 'fail',
      environment: null,
      evidenceRef: null,
      missingEvidenceMetadata: true,
      missingSignals: expect.arrayContaining([
        'diagnostic_run_id',
        'route_correlation',
        'evidence_metadata',
      ]),
    }))
    expect(report.checks.concurrentStatusWrite.reason).toContain('disposable plan evidence')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when the final plan readback does not match the target status', async () => {
    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:01:30.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      requestStatusChange: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 200, success: true, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 409, success: false, errorCode: 'ACCEPTANCE_STATUS_CONFLICT' }),
      requestPlanReadback: vi.fn(async () => ({
        httpStatus: 200,
        success: true,
        status: 'draft',
        actualDate: null,
        projectId: 'project-live',
        errorCode: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentStatusWrite.finalPlanReadback).toEqual(expect.objectContaining({
      status: 'fail',
      planStatus: 'draft',
      expectedStatus: 'in_progress',
    }))
    expect(report.checks.concurrentStatusWrite.reason).toContain('final acceptance plan readback')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when both concurrent writes succeed', async () => {
    const report = await buildAcceptanceStatusConcurrencyLiveDiagnosticReport({
      now: new Date('2026-06-21T06:02:00.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      planId: 'plan-live',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l08-acceptance.json',
      requestStatusChange: vi.fn(async () => ({ httpStatus: 200, success: true, errorCode: null })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.concurrentStatusWrite.reason).toContain('Expected exactly one successful status write')
    expect(shouldFailAcceptanceStatusConcurrencyLiveDiagnosticReport(report)).toBe(true)
  })

  it('parses live diagnostic CLI flags', () => {
    expect(parseAcceptanceStatusConcurrencyLiveDiagnosticOptionsFromArgs([
      '--allow-write',
      '--base-url=http://127.0.0.1:3001',
      '--auth-token=token',
      '--project-id=project-1',
      '--plan-id=plan-1',
      '--create-disposable-plan',
      '--status=in_progress',
      '--actual-date=2026-06-21',
      '--output-file=artifacts/test-runs/c18-l08.json',
      '--disposable-plan-evidence-file=artifacts/test-runs/c18-l08-disposable-plan.json',
      '--diagnostic-run-id=c18-l08-manual-1',
    ])).toEqual({
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-1',
      planId: 'plan-1',
      createDisposablePlan: true,
      status: 'in_progress',
      actualDate: '2026-06-21',
      outputFile: 'artifacts/test-runs/c18-l08.json',
      disposablePlanEvidenceFile: 'artifacts/test-runs/c18-l08-disposable-plan.json',
      diagnosticRunId: 'c18-l08-manual-1',
    })
  })
})
