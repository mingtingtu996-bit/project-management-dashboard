import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const pgMock = vi.hoisted(() => ({
  Client: vi.fn(),
  clients: [] as Array<{
    config: unknown
    connect: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
    end: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock('pg', () => ({
  default: {
    Client: pgMock.Client,
  },
}))

import {
  buildSpreadsheetMigrationLiveDiagnosticReport,
  parseSpreadsheetMigrationLiveDiagnosticOptionsFromArgs,
  shouldFailSpreadsheetMigrationLiveDiagnosticReport,
} from '../scripts/diagnose-spreadsheet-migration-live.js'
import type {
  SpreadsheetImportPressureUploader,
  SpreadsheetMigrationReplayEvidenceReader,
} from '../scripts/diagnose-spreadsheet-migration-live.js'

const L15_DIAGNOSTIC_RUN_ID = 'c18-l15-run-1'

function importPressureEvidence(overrides: Record<string, unknown> = {}) {
  return {
    diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
    projectId: 'project-live',
    workbookFile: 'tmp/l15.xlsx',
    iterationCount: 2,
    importRoutePath: '/api/planning/wbs-templates/import-excel',
    importRouteMethod: 'POST',
    environment: 'staging',
    evidenceRef: 'artifacts/c18-l15-import-pressure.json',
    memoryObserved: true,
    cpuObserved: true,
    timeoutBudgetObserved: true,
    cleanupObserved: true,
    cleanupTemplateIds: ['template-live-1', 'template-live-2'],
    attemptEvidence: [
      { iteration: 1, requestId: 'request-1', routeInvocationId: 'route-1', templateId: 'template-live-1' },
      { iteration: 2, requestId: 'request-2', routeInvocationId: 'route-2', templateId: 'template-live-2' },
    ],
    ...overrides,
  }
}

function migrationReplayEvidence(overrides: Record<string, unknown> = {}) {
  return {
    diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
    status: 'pass',
    idempotentReplay: true,
    environment: 'staging',
    replayRunCount: 2,
    evidenceRef: 'artifacts/c18-l15-migration-replay.json',
    ...overrides,
  }
}

describe('spreadsheet import and migration replay live diagnostic', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    delete process.env.WORKBUDDY_DIAGNOSTIC_CLEANUP_DATABASE_URL
    delete process.env.SUPABASE_MIGRATION_URL
    pgMock.clients.length = 0
    pgMock.Client.mockReset()
    pgMock.Client.mockImplementation((config: unknown) => {
      const client = {
        config,
        connect: vi.fn(async () => undefined),
        query: vi.fn(async () => ({ rowCount: 1 })),
        end: vi.fn(async () => undefined),
      }
      pgMock.clients.push(client)
      return client
    })
  })

  it('blocks by default so the diagnostic cannot upload live spreadsheets accidentally', async () => {
    const uploadWorkbook = vi.fn()
    const readMigrationReplayEvidence = vi.fn()

    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:00:00.000+08:00'),
      uploadWorkbook,
      readMigrationReplayEvidence,
    })

    expect(report.reportCode).toBe('c18_l15_spreadsheet_migration_live_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowWrite).toBe(false)
    expect(report.missingArchivedJson).toBe(true)
    expect(uploadWorkbook).not.toHaveBeenCalled()
    expect(readMigrationReplayEvidence).not.toHaveBeenCalled()
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('keeps import pressure evidence assessment visible even when upload is blocked', async () => {
    const uploadWorkbook = vi.fn()

    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:00:30.000+08:00'),
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
      importPressureEvidence: {
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 2,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'staging',
        evidenceRef: 'artifacts/c18-l15-import-pressure.json',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
        cleanupTemplateIds: ['template-live'],
      },
      uploadWorkbook,
    })

    expect(report.status).toBe('blocked')
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'blocked',
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
      runtimeEvidenceGap: {
        missingMemoryObservation: false,
        missingCpuObservation: false,
        missingTimeoutBudgetEvidence: false,
        missingCleanupEvidence: false,
        missingDiagnosticScopeEvidence: true,
        missingEvidenceMetadata: false,
        missingCreatedTemplateEvidence: true,
        missingImportedNodeEvidence: true,
        missingDiagnosticCorrelationEvidence: true,
      },
    }))
    expect(uploadWorkbook).not.toHaveBeenCalled()
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('passes only when import pressure succeeds and migration replay evidence is archived as pass', async () => {
    const uploadWorkbook: SpreadsheetImportPressureUploader = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      templateId: 'template-live',
      nodeCount: 3,
      errorCode: null,
    }))
    const readMigrationReplayEvidence: SpreadsheetMigrationReplayEvidenceReader = vi.fn(async () =>
      migrationReplayEvidence(),
    )

    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:01:00.000+08:00'),
      diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
      importPressureEvidence: importPressureEvidence({
        cleanupTemplateIds: ['template-live'],
        attemptEvidence: [
          { iteration: 1, requestId: 'request-1', routeInvocationId: 'route-1', templateId: 'template-live' },
          { iteration: 2, requestId: 'request-2', routeInvocationId: 'route-2', templateId: 'template-live' },
        ],
      }),
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook,
      readMigrationReplayEvidence,
    })

    expect(report.status).toBe('pass')
    expect(report.diagnosticRunId).toBe(L15_DIAGNOSTIC_RUN_ID)
    expect(report.expectedDiagnosticRunId).toBe(L15_DIAGNOSTIC_RUN_ID)
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.liveEvidenceChecklist).toEqual([
      'live/staging WBS spreadsheet import attempts with node counts and elapsed timing',
      'memory, CPU, and request timeout observations for the import process',
      'archived migration replay JSON with at least two idempotent runs',
      'post-run cleanup or retention decision for imported diagnostic templates',
    ])
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'pass',
      attemptCount: 2,
      successCount: 2,
      unexpectedFailureCount: 0,
      totalImportedNodeCount: 6,
      averageElapsedMsPerAttempt: expect.any(Number),
      runtimeEvidenceGap: {
        missingMemoryObservation: false,
        missingCpuObservation: false,
        missingTimeoutBudgetEvidence: false,
        missingCleanupEvidence: false,
        missingDiagnosticScopeEvidence: false,
        missingEvidenceMetadata: false,
        missingCreatedTemplateEvidence: false,
        missingImportedNodeEvidence: false,
        missingDiagnosticCorrelationEvidence: false,
      },
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
    }))
    expect(report.checks.migrationReplayEvidence).toEqual(expect.objectContaining({
      status: 'pass',
      idempotentReplay: true,
      replayRunCount: 2,
    }))
    expect(uploadWorkbook).toHaveBeenCalledTimes(2)
    expect(uploadWorkbook).toHaveBeenCalledWith(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(false)
  })

  it('archives import pressure evidence from upload responses when no prebuilt evidence exists', async () => {
    const archiveImportPressureEvidence = vi.fn()
    const cleanupImportedTemplate = vi.fn(async ({ templateId }: { templateId: string }) => ({
      templateId,
      success: true,
      httpStatus: 200,
    }))
    const uploadWorkbook: SpreadsheetImportPressureUploader = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 201,
        success: true,
        templateId: 'template-live-1',
        nodeCount: 3,
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 201,
        success: true,
        templateId: 'template-live-2',
        nodeCount: 4,
        errorCode: null,
      })

    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:01:05.000+08:00'),
      diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure-generated.json',
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook,
      readMigrationReplayEvidence: vi.fn(async () => migrationReplayEvidence()),
      archiveImportPressureEvidence,
      cleanupImportedTemplate,
    } as any)

    expect(report.status).toBe('pass')
    expect(report.checks.spreadsheetImportPressure.status).toBe('pass')
    expect(archiveImportPressureEvidence).toHaveBeenCalledWith(
      'artifacts/c18-l15-import-pressure-generated.json',
      expect.objectContaining({
        diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 2,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'current-live',
        evidenceRef: 'artifacts/c18-l15-import-pressure-generated.json',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
        cleanupTemplateIds: ['template-live-1', 'template-live-2'],
        attemptEvidence: [
          {
            iteration: 1,
            requestId: `${L15_DIAGNOSTIC_RUN_ID}-request-1`,
            routeInvocationId: `${L15_DIAGNOSTIC_RUN_ID}-route-1`,
            templateId: 'template-live-1',
          },
          {
            iteration: 2,
            requestId: `${L15_DIAGNOSTIC_RUN_ID}-request-2`,
            routeInvocationId: `${L15_DIAGNOSTIC_RUN_ID}-route-2`,
            templateId: 'template-live-2',
          },
        ],
      }),
    )
    expect(cleanupImportedTemplate).toHaveBeenCalledTimes(2)
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(false)
  })

  it('falls back to guarded direct cleanup when the route cannot delete diagnostic templates', async () => {
    process.env.SUPABASE_MIGRATION_URL = 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres?sslmode=require'
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({
        success: false,
        error: { message: '服务器内部错误' },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const archiveImportPressureEvidence = vi.fn()
    const uploadWorkbook: SpreadsheetImportPressureUploader = vi.fn(async () => ({
      httpStatus: 201,
      success: true,
      templateId: 'template-live-1',
      nodeCount: 3,
      errorCode: null,
    }))

    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:01:06.000+08:00'),
      diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 1,
      namePrefix: 'C18L15',
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure-generated.json',
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook,
      readMigrationReplayEvidence: vi.fn(async () => migrationReplayEvidence({
        replayRunCount: 2,
        evidenceRef: 'artifacts/c18-l15-migration-replay.json',
      })),
      archiveImportPressureEvidence,
    })

    expect(report.status).toBe('pass')
    expect(report.cleanupReadback).toEqual(expect.objectContaining({
      status: 'pass',
      cleanupTemplateIds: ['template-live-1'],
      cleanupAttempts: [
        expect.objectContaining({
          templateId: 'template-live-1',
          success: true,
          cleanupStrategy: 'guarded_direct_delete',
        }),
      ],
    }))
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/planning/wbs-templates/template-live-1',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(pgMock.Client).toHaveBeenCalledWith(expect.objectContaining({
      connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
      ssl: { rejectUnauthorized: false },
    }))
    expect(pgMock.clients[0].query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM public.wbs_templates'),
      ['template-live-1', 'project-live', 'C18L15'],
    )
    expect(archiveImportPressureEvidence).toHaveBeenCalledWith(
      'artifacts/c18-l15-import-pressure-generated.json',
      expect.objectContaining({
        cleanupObserved: true,
        cleanupTemplateIds: ['template-live-1'],
      }),
    )
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(false)
  })

  it('regenerates file-based import pressure evidence on rerun and cleans newly imported templates', async () => {
    const staleEvidenceFile = join(mkdtempSync(join(tmpdir(), 'workbuddy-c18-l15-')), 'import-pressure.json')
    writeFileSync(staleEvidenceFile, JSON.stringify({
      ...importPressureEvidence({
        cleanupObserved: false,
        cleanupTemplateIds: [],
        attemptEvidence: [
          { iteration: 1, requestId: `${L15_DIAGNOSTIC_RUN_ID}-request-1`, routeInvocationId: `${L15_DIAGNOSTIC_RUN_ID}-route-1`, templateId: null },
          { iteration: 2, requestId: `${L15_DIAGNOSTIC_RUN_ID}-request-2`, routeInvocationId: `${L15_DIAGNOSTIC_RUN_ID}-route-2`, templateId: null },
        ],
      }),
      evidenceRef: staleEvidenceFile,
    }), 'utf8')

    const archiveImportPressureEvidence = vi.fn()
    const cleanupImportedTemplate = vi.fn(async ({ templateId }: { templateId: string }) => ({
      templateId,
      success: true,
      httpStatus: 200,
    }))
    const uploadWorkbook: SpreadsheetImportPressureUploader = vi.fn()
      .mockResolvedValueOnce({
        httpStatus: 201,
        success: true,
        templateId: 'template-rerun-1',
        nodeCount: 3,
        errorCode: null,
      })
      .mockResolvedValueOnce({
        httpStatus: 201,
        success: true,
        templateId: 'template-rerun-2',
        nodeCount: 4,
        errorCode: null,
      })

    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:01:07.000+08:00'),
      diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: staleEvidenceFile,
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook,
      readMigrationReplayEvidence: vi.fn(async () => migrationReplayEvidence()),
      archiveImportPressureEvidence,
      cleanupImportedTemplate,
    } as any)

    expect(report.status).toBe('pass')
    expect(report.checks.spreadsheetImportPressure.runtimeEvidenceGap).toEqual({
      missingMemoryObservation: false,
      missingCpuObservation: false,
      missingTimeoutBudgetEvidence: false,
      missingCleanupEvidence: false,
      missingDiagnosticScopeEvidence: false,
      missingEvidenceMetadata: false,
      missingCreatedTemplateEvidence: false,
      missingImportedNodeEvidence: false,
      missingDiagnosticCorrelationEvidence: false,
    })
    expect(cleanupImportedTemplate).toHaveBeenCalledTimes(2)
    expect(archiveImportPressureEvidence).toHaveBeenCalledWith(
      staleEvidenceFile,
      expect.objectContaining({
        cleanupObserved: true,
        cleanupTemplateIds: ['template-rerun-1', 'template-rerun-2'],
        attemptEvidence: [
          expect.objectContaining({ iteration: 1, templateId: 'template-rerun-1' }),
          expect.objectContaining({ iteration: 2, templateId: 'template-rerun-2' }),
        ],
      }),
    )
  })

  it('fails when cleanup evidence does not cover the templates created by this diagnostic run', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:01:10.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure-missing-cleanup-ids.json',
      importPressureEvidence: importPressureEvidence({
        evidenceRef: 'artifacts/c18-l15-import-pressure-missing-cleanup-ids.json',
        cleanupTemplateIds: ['template-live'],
      }),
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 201, success: true, templateId: 'template-live-1', nodeCount: 3, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 201, success: true, templateId: 'template-live-2', nodeCount: 4, errorCode: null }),
      readMigrationReplayEvidence: vi.fn(async () => migrationReplayEvidence()),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'fail',
      successCount: 2,
      runtimeEvidenceGap: expect.objectContaining({
        missingCleanupEvidence: true,
      }),
      reason: expect.stringContaining('cleanup'),
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails closeout when spreadsheet and migration evidence pass but no diagnostic JSON is archived', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:01:30.000+08:00'),
      diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
      importPressureEvidence: importPressureEvidence({
        cleanupTemplateIds: ['template-live'],
        attemptEvidence: [
          { iteration: 1, requestId: 'request-1', routeInvocationId: 'route-1', templateId: 'template-live' },
          { iteration: 2, requestId: 'request-2', routeInvocationId: 'route-2', templateId: 'template-live' },
        ],
      }),
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      uploadWorkbook: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        templateId: 'template-live',
        nodeCount: 3,
        errorCode: null,
      })),
      readMigrationReplayEvidence: vi.fn(async () => migrationReplayEvidence()),
    })

    expect(report.checks.spreadsheetImportPressure.status).toBe('pass')
    expect(report.checks.migrationReplayEvidence.status).toBe('pass')
    expect(report.outputFile).toBeNull()
    expect(report.missingArchivedJson).toBe(true)
    expect(report.status).toBe('fail')
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when import and migration evidence cannot be correlated to the same diagnostic run', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:01:40.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure-uncorrelated.json',
      importPressureEvidence: {
        diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 2,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'staging',
        evidenceRef: 'artifacts/c18-l15-import-pressure-uncorrelated.json',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
        cleanupTemplateIds: ['template-live-1', 'template-live-2'],
      },
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay-uncorrelated.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 201, success: true, templateId: 'template-live-1', nodeCount: 3, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 201, success: true, templateId: 'template-live-2', nodeCount: 4, errorCode: null }),
      readMigrationReplayEvidence: vi.fn(async () => ({
        status: 'pass',
        idempotentReplay: true,
        environment: 'staging',
        replayRunCount: 2,
        evidenceRef: 'artifacts/c18-l15-migration-replay-uncorrelated.json',
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'fail',
      runtimeEvidenceGap: expect.objectContaining({
        missingDiagnosticCorrelationEvidence: true,
      }),
    }))
    expect(report.checks.migrationReplayEvidence).toEqual(expect.objectContaining({
      status: 'fail',
      reason: expect.stringContaining('diagnosticRunId'),
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when archived import and migration evidence belong to an older diagnostic run', async () => {
    const oldRunId = 'c18-l15-old-run'
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:01:50.000+08:00'),
      diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure-old-run.json',
      importPressureEvidence: importPressureEvidence({
        diagnosticRunId: oldRunId,
        cleanupTemplateIds: ['template-live-1', 'template-live-2'],
        attemptEvidence: [
          { iteration: 1, requestId: 'old-request-1', routeInvocationId: 'old-route-1', templateId: 'template-live-1' },
          { iteration: 2, requestId: 'old-request-2', routeInvocationId: 'old-route-2', templateId: 'template-live-2' },
        ],
      }),
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay-old-run.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 201, success: true, templateId: 'template-live-1', nodeCount: 3, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 201, success: true, templateId: 'template-live-2', nodeCount: 4, errorCode: null }),
      readMigrationReplayEvidence: vi.fn(async () => migrationReplayEvidence({
        diagnosticRunId: oldRunId,
        evidenceRef: 'artifacts/c18-l15-migration-replay-old-run.json',
      })),
    })

    expect(report.diagnosticRunId).toBe(L15_DIAGNOSTIC_RUN_ID)
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'fail',
      runtimeEvidenceGap: expect.objectContaining({
        missingDiagnosticCorrelationEvidence: true,
      }),
      reason: expect.stringContaining('diagnosticRunId'),
    }))
    expect(report.checks.migrationReplayEvidence).toEqual(expect.objectContaining({
      status: 'fail',
      reason: expect.stringContaining('diagnosticRunId'),
    }))
    expect(report.status).toBe('fail')
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when import pressure passes but migration replay evidence is missing', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:02:00.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
      importPressureEvidence: {
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 1,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'staging',
        evidenceRef: 'artifacts/c18-l15-import-pressure.json',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
        cleanupTemplateIds: ['template-live'],
      },
      uploadWorkbook: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        templateId: 'template-live',
        nodeCount: 3,
        errorCode: null,
      })),
      readMigrationReplayEvidence: vi.fn(),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.migrationReplayEvidence.status).toBe('blocked')
    expect(report.checks.migrationReplayEvidence.reason).toContain('--migration-replay-evidence-file')
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when import pressure succeeds but runtime evidence observations are incomplete', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:03:00.000+08:00'),
      diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure-incomplete.json',
      importPressureEvidence: {
        diagnosticRunId: L15_DIAGNOSTIC_RUN_ID,
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 1,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'staging',
        evidenceRef: 'artifacts/c18-l15-import-pressure-incomplete.json',
        memoryObserved: true,
        cpuObserved: false,
        timeoutBudgetObserved: true,
        cleanupObserved: false,
        attemptEvidence: [
          { iteration: 1, requestId: 'request-1', routeInvocationId: 'route-1', templateId: 'template-live' },
        ],
      },
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      uploadWorkbook: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        templateId: 'template-live',
        nodeCount: 3,
        errorCode: null,
      })),
      readMigrationReplayEvidence: vi.fn(async () => ({
        status: 'pass',
        idempotentReplay: true,
        environment: 'staging',
        replayRunCount: 2,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'fail',
      runtimeEvidenceGap: {
        missingMemoryObservation: false,
        missingCpuObservation: true,
        missingTimeoutBudgetEvidence: false,
        missingCleanupEvidence: true,
        missingDiagnosticScopeEvidence: false,
        missingEvidenceMetadata: false,
        missingCreatedTemplateEvidence: false,
        missingImportedNodeEvidence: false,
        missingDiagnosticCorrelationEvidence: false,
      },
      reason: expect.stringContaining('Import pressure runtime evidence is incomplete'),
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when spreadsheet imports return 2xx but do not prove created templates and imported nodes', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:03:20.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
      importPressureEvidence: {
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 2,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'staging',
        evidenceRef: 'artifacts/c18-l15-import-pressure.json',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
      },
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook: vi.fn()
        .mockResolvedValueOnce({ httpStatus: 201, success: true, templateId: null, nodeCount: 0, errorCode: null })
        .mockResolvedValueOnce({ httpStatus: 201, success: true, templateId: null, nodeCount: null, errorCode: null }),
      readMigrationReplayEvidence: vi.fn(async () => ({
        status: 'pass',
        idempotentReplay: true,
        environment: 'staging',
        replayRunCount: 2,
        evidenceRef: 'artifacts/c18-l15-migration-replay.json',
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'fail',
      successCount: 2,
      runtimeEvidenceGap: expect.objectContaining({
        missingCreatedTemplateEvidence: true,
        missingImportedNodeEvidence: true,
      }),
      reason: expect.stringContaining('created template ids and imported node counts'),
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when import pressure evidence belongs to a different project or workbook scope', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:03:30.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 2,
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure-wrong-scope.json',
      importPressureEvidence: {
        projectId: 'other-project',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 2,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'staging',
        evidenceRef: 'artifacts/c18-l15-import-pressure-wrong-scope.json',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
      },
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        templateId: 'template-live',
        nodeCount: 3,
        errorCode: null,
      })),
      readMigrationReplayEvidence: vi.fn(async () => ({
        status: 'pass',
        idempotentReplay: true,
        environment: 'staging',
        replayRunCount: 2,
        evidenceRef: 'artifacts/c18-l15-migration-replay.json',
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'fail',
      runtimeEvidenceGap: expect.objectContaining({
        missingDiagnosticScopeEvidence: true,
        missingEvidenceMetadata: false,
      }),
      reason: expect.stringContaining('Import pressure runtime evidence is incomplete'),
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when import pressure evidence lacks environment or artifact reference metadata', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:03:40.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure-missing-ref.json',
      importPressureEvidence: {
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 1,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
      },
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        templateId: 'template-live',
        nodeCount: 3,
        errorCode: null,
      })),
      readMigrationReplayEvidence: vi.fn(async () => ({
        status: 'pass',
        idempotentReplay: true,
        environment: 'staging',
        replayRunCount: 2,
        evidenceRef: 'artifacts/c18-l15-migration-replay.json',
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.spreadsheetImportPressure).toEqual(expect.objectContaining({
      status: 'fail',
      runtimeEvidenceGap: expect.objectContaining({
        missingDiagnosticScopeEvidence: false,
        missingEvidenceMetadata: true,
      }),
      reason: expect.stringContaining('environment'),
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when migration replay evidence lacks an environment or artifact reference', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:03:45.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
      importPressureEvidence: {
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 1,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'staging',
        evidenceRef: 'artifacts/c18-l15-import-pressure.json',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
      },
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay-missing-ref.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        templateId: 'template-live',
        nodeCount: 3,
        errorCode: null,
      })),
      readMigrationReplayEvidence: vi.fn(async () => ({
        status: 'pass',
        idempotentReplay: true,
        replayRunCount: 2,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.migrationReplayEvidence).toEqual(expect.objectContaining({
      status: 'fail',
      idempotentReplay: true,
      replayRunCount: 2,
      environment: null,
      evidenceRef: null,
      reason: expect.stringContaining('environment'),
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails when migration replay evidence uses a non-finite replay run count', async () => {
    const report = await buildSpreadsheetMigrationLiveDiagnosticReport({
      now: new Date('2026-06-21T10:03:50.000+08:00'),
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-live',
      workbookFile: 'tmp/l15.xlsx',
      importPressureEvidenceFile: 'artifacts/c18-l15-import-pressure.json',
      importPressureEvidence: {
        projectId: 'project-live',
        workbookFile: 'tmp/l15.xlsx',
        iterationCount: 1,
        importRoutePath: '/api/planning/wbs-templates/import-excel',
        importRouteMethod: 'POST',
        environment: 'staging',
        evidenceRef: 'artifacts/c18-l15-import-pressure.json',
        memoryObserved: true,
        cpuObserved: true,
        timeoutBudgetObserved: true,
        cleanupObserved: true,
      },
      migrationReplayEvidenceFile: 'artifacts/c18-l15-migration-replay-non-finite.json',
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l15-spreadsheet-migration.json',
      uploadWorkbook: vi.fn(async () => ({
        httpStatus: 201,
        success: true,
        templateId: 'template-live',
        nodeCount: 3,
        errorCode: null,
      })),
      readMigrationReplayEvidence: vi.fn(async () => ({
        status: 'pass',
        idempotentReplay: true,
        environment: 'staging',
        replayRunCount: Number.POSITIVE_INFINITY,
        evidenceRef: 'artifacts/c18-l15-migration-replay-non-finite.json',
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.migrationReplayEvidence).toEqual(expect.objectContaining({
      status: 'fail',
      idempotentReplay: true,
      replayRunCount: null,
      environment: 'staging',
      evidenceRef: 'artifacts/c18-l15-migration-replay-non-finite.json',
      reason: expect.stringContaining('finite replayRunCount'),
    }))
    expect(shouldFailSpreadsheetMigrationLiveDiagnosticReport(report)).toBe(true)
  })

  it('parses live diagnostic CLI flags', () => {
    expect(parseSpreadsheetMigrationLiveDiagnosticOptionsFromArgs([
      '--allow-write',
      '--base-url=http://127.0.0.1:3001',
      '--auth-token=token',
      '--project-id=project-1',
      '--workbook-file=tmp/l15.xlsx',
      '--iterations=3',
      '--name-prefix=C18L15',
      '--import-pressure-evidence-file=artifacts/import-pressure.json',
      '--migration-replay-evidence-file=artifacts/replay.json',
      '--diagnostic-run-id=c18-l15-run-1',
      '--output-file=artifacts/test-runs/c18-l15.json',
    ])).toEqual({
      allowWrite: true,
      baseUrl: 'http://127.0.0.1:3001',
      authToken: 'token',
      projectId: 'project-1',
      workbookFile: 'tmp/l15.xlsx',
      iterations: 3,
      namePrefix: 'C18L15',
      importPressureEvidenceFile: 'artifacts/import-pressure.json',
      migrationReplayEvidenceFile: 'artifacts/replay.json',
      diagnosticRunId: 'c18-l15-run-1',
      outputFile: 'artifacts/test-runs/c18-l15.json',
    })
  })
})
