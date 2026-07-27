import { describe, expect, it, vi } from 'vitest'

import {
  buildRlsProaclLiveDiagnosticReport,
  parseRlsProaclLiveDiagnosticOptionsFromArgs,
  runRlsProaclLiveDiagnosticCli,
  shouldFailRlsProaclLiveDiagnosticReport,
} from '../scripts/diagnose-rls-proacl-live.js'
import type { RlsProaclCatalogReader } from '../scripts/diagnose-rls-proacl-live.js'

describe('RLS/proacl live diagnostic', () => {
  function safeCatalogReader(): RlsProaclCatalogReader {
    return {
      readRlsPolicyRows: vi.fn(async () => [
        {
          tablename: 'projects',
          rowsecurity: true,
          force_rowsecurity: true,
          policy_count: 1,
          policy_definition: 'company_id = current_setting(\'app.company_id\')::uuid',
        },
      ]),
      readCurrentRoleBypass: vi.fn(async () => ({
        rolname: 'app_user',
        rolbypassrls: false,
      })),
      readExecuteSqlPrivileges: vi.fn(async () => []),
    }
  }

  it('blocks by default so catalog checks are explicitly targeted at live/staging', async () => {
    const reader = safeCatalogReader()

    const report = await buildRlsProaclLiveDiagnosticReport({
      now: new Date('2026-06-21T09:00:00.000+08:00'),
      reader,
    })

    expect(report.reportCode).toBe('c18_l01_l04_rls_proacl_live_diagnostic')
    expect(report.liveEvidenceRequired).toBe(true)
    expect(report.status).toBe('blocked')
    expect(report.allowLive).toBe(false)
    expect(reader.readRlsPolicyRows).not.toHaveBeenCalled()
    expect(shouldFailRlsProaclLiveDiagnosticReport(report)).toBe(true)
  })

  it('passes catalog checks when RLS, tenant policies, backend role, and execute_sql privileges are safe', async () => {
    const reader = safeCatalogReader()

    const report = await buildRlsProaclLiveDiagnosticReport({
      now: new Date('2026-06-21T09:01:00.000+08:00'),
      allowLive: true,
      outputFile: 'artifacts/test-runs/20260621-c18-live/c18-l01-l04-rls-proacl-live.json',
      tables: ['projects'],
      reader,
    })

    expect(report.status).toBe('pass')
    expect(report.diagnosticRunId).toBe('c18-l01-l04-2026-06-21T01-01-00-000Z')
    expect(report.evidenceRef).toBe('artifacts/test-runs/20260621-c18-live/c18-l01-l04-rls-proacl-live.json')
    expect(report.outputFile).toBe('artifacts/test-runs/20260621-c18-live/c18-l01-l04-rls-proacl-live.json')
    expect(report.missingArchivedJson).toBe(false)
    expect(report.checks.publicRls.status).toBe('pass')
    expect(report.checks.currentRoleBypass.status).toBe('pass')
    expect(report.checks.executeSqlPrivileges.status).toBe('pass')
    expect(report.checks.executeSqlPrivileges.anonPocRequired).toBe(true)
    expect(shouldFailRlsProaclLiveDiagnosticReport(report)).toBe(false)
  })

  it('fails passing catalog checks when the diagnostic JSON is not archived', async () => {
    const report = await buildRlsProaclLiveDiagnosticReport({
      now: new Date('2026-06-21T09:01:30.000+08:00'),
      allowLive: true,
      tables: ['projects'],
      reader: safeCatalogReader(),
    })

    expect(report.status).toBe('fail')
    expect(report.outputFile).toBeNull()
    expect(report.missingArchivedJson).toBe(true)
    expect(shouldFailRlsProaclLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails disabled RLS, missing tenant policies, bypass roles, and executable execute_sql ACLs', async () => {
    const report = await buildRlsProaclLiveDiagnosticReport({
      now: new Date('2026-06-21T09:02:00.000+08:00'),
      allowLive: true,
      tables: ['companies', 'tasks'],
      reader: {
        readRlsPolicyRows: vi.fn(async () => [
          {
            tablename: 'companies',
            rowsecurity: false,
            force_rowsecurity: false,
            policy_count: 0,
            policy_definition: '',
          },
          {
            tablename: 'tasks',
            rowsecurity: true,
            force_rowsecurity: false,
            policy_count: 1,
            policy_definition: 'true',
          },
        ]),
        readCurrentRoleBypass: vi.fn(async () => ({
          rolname: 'postgres',
          rolbypassrls: true,
        })),
        readExecuteSqlPrivileges: vi.fn(async () => [
          {
            schema_name: 'public',
            function_name: 'execute_sql',
            public_can_execute: true,
            anon_can_execute: true,
            authenticated_can_execute: true,
            proacl: '{=X/postgres}',
          },
        ]),
      },
    })

    expect(report.status).toBe('fail')
    expect(report.checks.publicRls.disabledTables).toEqual(['companies'])
    expect(report.checks.publicRls.tablesWithoutTenantPredicate).toEqual(['tasks'])
    expect(report.checks.currentRoleBypass.bypassRole).toBe('postgres')
    expect(report.checks.executeSqlPrivileges.executableByUntrustedRoles).toEqual(['public.execute_sql'])
    expect(shouldFailRlsProaclLiveDiagnosticReport(report)).toBe(true)
  })

  it('fails with a diagnostic timeout instead of hanging on a slow live catalog reader', async () => {
    const reader = safeCatalogReader()
    reader.readRlsPolicyRows = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
      return [
        {
          tablename: 'projects',
          rowsecurity: true,
          force_rowsecurity: true,
          policy_count: 1,
          policy_definition: 'company_id = current_setting(\'app.company_id\')::uuid',
        },
      ]
    })

    const report = await buildRlsProaclLiveDiagnosticReport({
      now: new Date('2026-06-21T09:03:00.000+08:00'),
      allowLive: true,
      timeoutMs: 1,
      tables: ['projects'],
      reader,
    })

    expect(report.status).toBe('fail')
    expect(report.checks.publicRls.status).toBe('fail')
    expect(report.checks.publicRls.reason).toContain('timed out')
    expect(shouldFailRlsProaclLiveDiagnosticReport(report)).toBe(true)
  })

  it('parses live diagnostic CLI flags', () => {
    expect(parseRlsProaclLiveDiagnosticOptionsFromArgs([
      '--allow-live',
      '--tables=companies,company_members,projects,tasks',
      '--output-file=artifacts/test-runs/c18-l01-l04.json',
      '--diagnostic-run-id=c18-l01-l04-manual-1',
    ])).toEqual({
      allowLive: true,
      tables: ['companies', 'company_members', 'projects', 'tasks'],
      outputFile: 'artifacts/test-runs/c18-l01-l04.json',
      diagnosticRunId: 'c18-l01-l04-manual-1',
    })
  })

  it('closes the database pool after the CLI writes a passing diagnostic report', async () => {
    const closeDatabasePool = vi.fn(async () => undefined)
    const write = vi.fn()

    const exitCode = await runRlsProaclLiveDiagnosticCli({
      args: [
        'node',
        'diagnose-rls-proacl-live.ts',
        '--allow-live',
        '--tables=projects',
        '--output-file=artifacts/test-runs/c18-l01-l04.json',
      ],
      now: new Date('2026-06-21T09:04:00.000+08:00'),
      reader: safeCatalogReader(),
      write,
      closeDatabasePool,
    })

    expect(exitCode).toBe(0)
    expect(write).toHaveBeenCalledWith(expect.stringContaining('"status": "pass"'))
    expect(closeDatabasePool).toHaveBeenCalledOnce()
  })
})
