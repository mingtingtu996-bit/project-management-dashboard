import { describe, expect, it, vi } from 'vitest'

import {
  buildExecuteSqlAnonPocLiveDiagnosticReport,
  parseExecuteSqlAnonPocLiveDiagnosticOptionsFromArgs,
  shouldFailExecuteSqlAnonPocLiveDiagnosticReport,
} from '../scripts/diagnose-execute-sql-anon-poc-live.js'
import type { ExecuteSqlAnonPocCaller } from '../scripts/diagnose-execute-sql-anon-poc-live.js'

describe('execute_sql anon PoC live diagnostic', () => {
  it('blocks by default so anon RPC probing cannot run accidentally', async () => {
    const callExecuteSqlAsAnon = vi.fn()

    const report = await buildExecuteSqlAnonPocLiveDiagnosticReport({
      now: new Date('2026-06-21T11:00:00.000+08:00'),
      callExecuteSqlAsAnon,
    })

    expect(report.reportCode).toBe('c18_l04_execute_sql_anon_poc_live_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowLive).toBe(false)
    expect(report.anonKeyProvided).toBe(false)
    expect(callExecuteSqlAsAnon).not.toHaveBeenCalled()
    expect(shouldFailExecuteSqlAnonPocLiveDiagnosticReport(report)).toBe(true)
  })

  it('passes when anon cannot execute execute_sql because the RPC is absent or denied', async () => {
    const callExecuteSqlAsAnon: ExecuteSqlAnonPocCaller = vi.fn(async () => ({
      success: false,
      errorCode: '42501',
      errorMessage: 'permission denied for function execute_sql',
      dataReturned: false,
      rowCount: null,
    }))

    const report = await buildExecuteSqlAnonPocLiveDiagnosticReport({
      now: new Date('2026-06-21T11:01:00.000+08:00'),
      allowLive: true,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l04-execute-sql-anon-poc-live.json',
      supabaseUrl: 'https://example.supabase.co',
      anonKey: 'anon-key',
      callExecuteSqlAsAnon,
    })

    expect(report.status).toBe('pass')
    expect(report.diagnosticRunId).toBe('c18-l04-anon-poc-2026-06-21T03-01-00-000Z')
    expect(report.evidenceRef).toBe('artifacts/test-runs/20260621-c18-live/c18-l04-execute-sql-anon-poc-live.json')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l04-execute-sql-anon-poc-live.json')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.checks.anonExecuteSqlPoc).toEqual(expect.objectContaining({
      status: 'pass',
      denied: true,
      errorCode: '42501',
      dataReturned: false,
    }))
    expect(callExecuteSqlAsAnon).toHaveBeenCalledWith(expect.objectContaining({
      supabaseUrl: 'https://example.supabase.co',
      anonKey: 'anon-key',
      probeSql: expect.stringContaining('public.companies'),
    }))
    expect(shouldFailExecuteSqlAnonPocLiveDiagnosticReport(report)).toBe(false)
  })

  it('fails a denied anon PoC when the diagnostic JSON is not archived', async () => {
    const report = await buildExecuteSqlAnonPocLiveDiagnosticReport({
      now: new Date('2026-06-21T11:01:30.000+08:00'),
      allowLive: true,
      supabaseUrl: 'https://example.supabase.co',
      anonKey: 'anon-key',
      callExecuteSqlAsAnon: vi.fn(async () => ({
        success: false,
        errorCode: 'PGRST202',
        errorMessage: 'Could not find the function public.execute_sql',
        dataReturned: false,
        rowCount: null,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBeNull()
    expect(report.missingArchivedJson).toBe(true)
    expect(shouldFailExecuteSqlAnonPocLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails as critical when anon can execute execute_sql and receive data', async () => {
    const report = await buildExecuteSqlAnonPocLiveDiagnosticReport({
      now: new Date('2026-06-21T11:02:00.000+08:00'),
      allowLive: true,
      supabaseUrl: 'https://example.supabase.co',
      anonKey: 'anon-key',
      callExecuteSqlAsAnon: vi.fn(async () => ({
        success: true,
        errorCode: null,
        errorMessage: null,
        dataReturned: true,
        rowCount: 1,
      })),
    })

    expect(report.status).toBe('fail')
    expect(report.checks.anonExecuteSqlPoc).toEqual(expect.objectContaining({
      status: 'fail',
      severity: 'critical',
      denied: false,
      dataReturned: true,
      rowCount: 1,
    }))
    expect(report.checks.anonExecuteSqlPoc.reason).toContain('anon key executed')
    expect(shouldFailExecuteSqlAnonPocLiveDiagnosticReport(report)).toBe(true)
  })

  it('parses live diagnostic CLI flags without exposing the anon key in the report contract', () => {
    expect(parseExecuteSqlAnonPocLiveDiagnosticOptionsFromArgs([
      '--allow-live',
      '--supabase-url=https://example.supabase.co',
      '--anon-key=anon-key',
      '--probe-sql=select 1',
      '--output-file=artifacts/test-runs/c18-l04.json',
      '--diagnostic-run-id=c18-l04-manual-1',
    ])).toEqual({
      allowLive: true,
      supabaseUrl: 'https://example.supabase.co',
      anonKey: 'anon-key',
      probeSql: 'select 1',
      outputFile: 'artifacts/test-runs/c18-l04.json',
      diagnosticRunId: 'c18-l04-manual-1',
    })
  })
})
