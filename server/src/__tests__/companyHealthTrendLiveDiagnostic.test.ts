import { describe, expect, it } from 'vitest'

import {
  buildCompanyHealthTrendLiveDiagnosticReport,
  parseCompanyHealthTrendDiagnosticArgs,
  shouldFailCompanyHealthTrendLiveDiagnosticReport,
  type SnapshotPageFetchRequest,
} from '../scripts/diagnose-company-health-trend-live'

function makeRows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    project_id: `project-${offset + index}`,
    snapshot_date: '2026-06-01',
    health_score: 80,
  }))
}

describe('company health trend live diagnostic', () => {
  it('records the Supabase max-rows probe and paginated >1000 snapshot trend evidence', async () => {
    const requests: SnapshotPageFetchRequest[] = []
    const report = await buildCompanyHealthTrendLiveDiagnosticReport({
      now: new Date('2026-06-21T00:00:00.000Z'),
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l13-health-trend.json',
      pageSize: 1000,
      fetchSnapshotPage: async (request) => {
        requests.push(request)
        if (request.probe === 'max_rows') {
          return { rows: makeRows(1000), count: 1505, elapsedMs: 12 }
        }
        return {
          rows: request.from === 0 ? makeRows(1000) : makeRows(505, 1000),
          count: 1505,
          elapsedMs: request.from === 0 ? 18 : 9,
        }
      },
    })

    expect(report.reportCode).toBe('c18_l13_supabase_max_rows_snapshot_trend_diagnostic')
    expect(report.evidenceKind).toBe('live_supabase_diagnostic_entrypoint')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('pass')
    expect(report.diagnosticRunId).toBe('c18-l13-health-trend-2026-06-21T00-00-00-000Z')
    expect(report.evidenceRef).toBe('artifacts/test-runs/20260621-c18-live/c18-l13-health-trend.json')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l13-health-trend.json')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.table).toBe('project_daily_snapshot')
    expect(report.periodStart).toBe('2026-05-01')
    expect(report.periodEnd).toBe('2026-07-01')
    expect(report.checks.maxRowsProbe).toEqual(expect.objectContaining({
      status: 'pass',
      requestedRows: 1001,
      observedRows: 1000,
      reportedCount: 1505,
    }))
    expect(report.checks.snapshotTrendPagination).toEqual(expect.objectContaining({
      status: 'pass',
      pageSize: 1000,
      rangeCalls: 2,
      totalRows: 1505,
      reportedCount: 1505,
    }))
    expect(report.checks.snapshotTrendPagination.ranges).toEqual([
      { from: 0, to: 999, rows: 1000, elapsedMs: 18 },
      { from: 1000, to: 1999, rows: 505, elapsedMs: 9 },
    ])
    expect(requests.map((request) => request.probe)).toEqual([
      'max_rows',
      'snapshot_trend',
      'snapshot_trend',
    ])
    expect(shouldFailCompanyHealthTrendLiveDiagnosticReport(report)).toBe(false)
  })

  it('keeps the report blocked when there are not enough live snapshot rows to prove pagination', async () => {
    const report = await buildCompanyHealthTrendLiveDiagnosticReport({
      now: new Date('2026-06-21T00:00:00.000Z'),
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l13-health-trend-disposable.json',
      pageSize: 1000,
      fetchSnapshotPage: async () => ({ rows: makeRows(800), count: 800, elapsedMs: 7 }),
    })

    expect(report.status).toBe('blocked')
    expect(report.checks.maxRowsProbe.status).toBe('blocked')
    expect(report.checks.snapshotTrendPagination.status).toBe('blocked')
    expect(report.checks.snapshotTrendPagination.reason).toContain('at least 1001')
    expect(shouldFailCompanyHealthTrendLiveDiagnosticReport(report)).toBe(true)
  })

  it('can create and clean disposable snapshot evidence when explicitly allowed', async () => {
    const events: string[] = []
    const report = await buildCompanyHealthTrendLiveDiagnosticReport({
      now: new Date('2026-06-21T00:00:00.000Z'),
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l13-health-trend-disposable.json',
      pageSize: 1000,
      env: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_KEY: 'service-key' } as any,
      allowWrite: true,
      createDisposableSnapshots: true,
      createDisposableSnapshotEvidence: async (request) => {
        events.push(`create:${request.rowCount}:${request.snapshotDate}`)
        return {
          status: 'pass',
          rowCount: request.rowCount,
          projectIds: Array.from({ length: request.rowCount }, (_, index) => `diag-project-${index}`),
          cleanupToken: 'diag-token',
        }
      },
      cleanupDisposableSnapshotEvidence: async (evidence) => {
        events.push(`cleanup:${evidence.cleanupToken}:${evidence.projectIds.length}`)
        return {
          status: 'pass',
          deletedSnapshotRows: evidence.projectIds.length,
          deletedProjects: evidence.projectIds.length,
        }
      },
      fetchSnapshotPage: async (request) => {
        if (request.probe === 'max_rows') {
          return { rows: makeRows(1000), count: 1001, elapsedMs: 4 }
        }
        return {
          rows: request.from === 0 ? makeRows(1000) : makeRows(1, 1000),
          count: 1001,
          elapsedMs: request.from === 0 ? 5 : 2,
        }
      },
    })

    expect(report.status).toBe('pass')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.disposableSnapshotEvidence).toEqual(expect.objectContaining({
      enabled: true,
      projectIdFilterApplied: false,
      created: expect.objectContaining({
        status: 'pass',
        rowCount: 1001,
      }),
      cleanup: expect.objectContaining({
        status: 'pass',
        deletedSnapshotRows: 1001,
        deletedProjects: 1001,
      }),
    }))
    expect(report.projectIds).toBeNull()
    expect(report.disposableSnapshotEvidence?.created?.projectIds).toHaveLength(1001)
    expect(report.disposableSnapshotEvidence?.reason).toContain('skipping project_id IN filter')
    expect(events).toEqual(['create:1001:2026-06-01', 'cleanup:diag-token:1001'])
  })

  it('fails a passing pagination probe when the diagnostic JSON is not archived', async () => {
    const report = await buildCompanyHealthTrendLiveDiagnosticReport({
      now: new Date('2026-06-21T00:00:00.000Z'),
      pageSize: 1000,
      fetchSnapshotPage: async (request) => {
        if (request.probe === 'max_rows') {
          return { rows: makeRows(1000), count: 1001, elapsedMs: 4 }
        }
        return {
          rows: request.from === 0 ? makeRows(1000) : makeRows(1, 1000),
          count: 1001,
          elapsedMs: request.from === 0 ? 5 : 2,
        }
      },
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBeNull()
    expect(report.missingArchivedJson).toBe(true)
    expect(shouldFailCompanyHealthTrendLiveDiagnosticReport(report)).toBe(true)
  })

  it('parses page size and project id filters for live runs', () => {
    expect(parseCompanyHealthTrendDiagnosticArgs([
      'node',
      'diagnose-company-health-trend-live.ts',
      '--page-size=500',
      '--project-ids=p1,p2, p2',
      '--allow-write',
      '--create-disposable-snapshots',
      '--output-file=artifacts/test-runs/c18-l13.json',
      '--diagnostic-run-id=c18-l13-manual-1',
    ])).toEqual({
      pageSize: 500,
      projectIds: ['p1', 'p2'],
      allowWrite: true,
      createDisposableSnapshots: true,
      outputFile: 'artifacts/test-runs/c18-l13.json',
      diagnosticRunId: 'c18-l13-manual-1',
    })
  })
})
