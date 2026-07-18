import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { buildExpectedSchemaFromMigrationSql } from '../services/schemaDriftExpectedSchemaParser.js'
import {
  T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION,
  T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION,
  T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES,
  type T2ScheduleRuntimeRetirementBackup,
  calculateT2ScheduleRuntimeBackupSha256,
  captureT2ScheduleRuntimeRetirementBackup,
  restoreT2ScheduleRuntimeRetirementBackup,
  serializeT2ScheduleRuntimeRetirementBackup,
  validateT2ScheduleRuntimeRetirementBackup,
} from '../scripts/t2ScheduleRuntimeRetirementSupport.js'

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

function serverPath(...segments: string[]) {
  return resolve(workspaceRoot, 'server', ...segments)
}

function readServer(...segments: string[]) {
  return readFileSync(serverPath(...segments), 'utf8')
}

function readWorkspace(...segments: string[]) {
  return readFileSync(resolve(workspaceRoot, ...segments), 'utf8')
}

function normalizeSqlWhitespace(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
  if (Array.isArray(value)) return value.map(normalizeSqlWhitespace)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeSqlWhitespace(child)]),
    )
  }
  return value
}

const sampleRows = {
  t2_rhythm_schedule_runtime_publications: [{
    id: '00000000-0000-4000-8000-000000000001',
    publication_key: 'retired-publication-1',
    runtime_publication_status: 'runtime_rolled_back',
  }],
  t2_rhythm_schedule_runtime_events: [{
    id: '00000000-0000-4000-8000-000000000002',
    source_publication_key: 'retired-publication-1',
  }],
} as unknown as T2ScheduleRuntimeRetirementBackup['rows']

describe('duration runtime orphan retirement', () => {
  it('removes duplicate task and evidence writers from product source and contracts', () => {
    expect(existsSync(serverPath('src/services/t2RhythmScheduleRuntimePublicationService.ts'))).toBe(false)
    expect(existsSync(serverPath('src/services/defaultMasterPlanIndependentTaskNetworkService.ts'))).toBe(false)
    expect(existsSync(serverPath('src/services/defaultMasterPlanIndependentTaskNetworkMaterializationService.ts'))).toBe(false)
    expect(existsSync(serverPath('src/services/durationLearningScopeEvidenceWriterService.ts'))).toBe(false)

    const baselineRoute = readServer('src/routes/task-baselines.ts')
    const planningStateMachine = readServer('src/services/planningStateMachine.ts')
    const registry = readServer('src/registry/system-domain-registry.json')
    const domainMatrix = readServer('src/services/domainReleaseRuntimeClosureMatrixService.ts')
    const writerRegistry = readWorkspace('project-data/lineage/writers.json')

    expect(baselineRoute).not.toContain('materialize-independent-task-network')
    expect(planningStateMachine).not.toContain('materialize-independent-task-network')
    expect(registry).not.toContain('t2RhythmScheduleRuntimePublicationService')
    expect(registry).not.toContain('defaultMasterPlanIndependentTaskNetworkService')
    expect(registry).not.toContain('defaultMasterPlanIndependentTaskNetworkMaterializationService')
    expect(registry).not.toContain('durationLearningScopeEvidenceWriterService')
    expect(domainMatrix).not.toContain('t2RhythmScheduleRuntimePublicationService')
    expect(domainMatrix).toContain('wbsTemplateGenerationService.ts')
    expect(writerRegistry).not.toContain('default_master_plan_independent_task_network_materialization')
    expect(writerRegistry).not.toContain('duration_learning_scope_evidence_writer')
    expect(writerRegistry).not.toContain('t2_rhythm_schedule_runtime_publication_service')
    expect(writerRegistry).not.toContain('controlled_live_closeout_writers')
  })

  it('retires direct T2 runtime writers from development tools in favor of canonical wizard/WBS smoke', () => {
    const runtimeEvidenceRunner = readWorkspace(
      'project-testing/tools/run-c19-runtime-publication-evidence.mjs',
    )
    const controlledWriter = readWorkspace(
      'project-testing/tools/run-controlled-live-closeout-writers.mjs',
    )
    const runtimePreflight = readWorkspace(
      'project-testing/tools/check-c19-runtime-preflight.mjs',
    )
    const handoffSignals = readWorkspace(
      'project-testing/tools/collect-release-handoff-signals.mjs',
    )
    const testLedger = readWorkspace(
      'project-testing/tools/build-v1424-test-case-ledger.mjs',
    )
    const releaseMatrix = readWorkspace(
      'project-testing/matrix/release-test-matrix.json',
    )
    const retiredRuntimeTokens = [
      't2RhythmScheduleRuntimePublicationService',
      't2_rhythm_schedule_runtime_publications',
      't2_rhythm_schedule_runtime_events',
      "source_type = 't2_rhythm_schedule_runtime'",
    ]

    for (const [name, source] of [
      ['runtime evidence runner', runtimeEvidenceRunner],
      ['controlled writer', controlledWriter],
      ['runtime preflight', runtimePreflight],
      ['handoff signal collector', handoffSignals],
    ] as const) {
      for (const token of retiredRuntimeTokens) {
        expect(source, `${name} still references retired token ${token}`).not.toContain(token)
      }
    }

    expect(runtimeEvidenceRunner).toContain(
      'C19_DIRECT_RUNTIME_WRITER_RETIRED_USE_CANONICAL_WIZARD_WBS_SMOKE',
    )
    expect(controlledWriter).toContain(
      'CONTROLLED_C19_DIRECT_WRITER_RETIRED_USE_CANONICAL_WIZARD_WBS_SMOKE',
    )
    expect(runtimePreflight).toContain('canonicalWizardSmokeFile')
    expect(runtimePreflight).toContain('commitWizardGeneration')
    expect(runtimePreflight).toContain('taskDependencyReadback')
    expect(runtimePreflight).toContain('rollbackRevisionDraft')
    expect(testLedger).not.toContain('t2RhythmScheduleRuntimePublicationService.test.ts')
    expect(testLedger).toContain('run-wizard-baseline-revision-staging-contract.test.mjs')
    expect(releaseMatrix).not.toContain('run-c19-runtime-publication-evidence.mjs')
    expect(releaseMatrix).toContain('run-wizard-baseline-revision-staging.mjs')
  })

  it('backs up and drops only the duplicate T2 runtime tables with fail-closed active-write checks', () => {
    const migration = readServer('migrations', T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION)
    const rollback = readServer('migrations/rollback', T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION)
    const sourceMigration = readServer('migrations/241_v14231_t2_rhythm_schedule_runtime_publications.sql')
    const cleanBundle = readServer('migrations/CLEAN_MIGRATION_V4.sql')
    const deployWorkflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')

    expect(migration).toContain("current_setting('workbuddy.t2_schedule_runtime_retirement_backup_sha256', true)")
    expect(migration).toContain("current_setting('workbuddy.t2_schedule_runtime_retirement_data_fingerprint', true)")
    expect(migration).toContain('t2_schedule_runtime_retirement_active_publication_present')
    expect(migration).toContain("source_type = 't2_rhythm_schedule_runtime'")
    expect(migration).not.toMatch(/DROP TABLE[\s\S]*CASCADE/i)
    expect(deployWorkflow).toContain('321_retire_duplicate_t2_schedule_runtime.sql; do')
    expect(deployWorkflow).toContain('if grep -Fqx -- "- $migration" <<< "$plan_output"; then')
    expect(deployWorkflow).toContain(
      'drop_guard_args+=(--approve-existing-drop-targets-for "$migration")',
    )
    expect(deployWorkflow).toContain('npm run backup:t2-schedule-runtime-retirement -- --if-pending')
    const cleanMarker = '-- Source: 321_retire_duplicate_t2_schedule_runtime.sql\n-- ============================================================\n'
    const cleanStart = cleanBundle.indexOf(cleanMarker)
    expect(cleanStart).toBeGreaterThan(-1)
    expect(cleanBundle.slice(cleanStart + cleanMarker.length).trim()).toBe(migration.trim())
    expect(normalizeSqlWhitespace(buildExpectedSchemaFromMigrationSql(rollback))).toEqual(
      normalizeSqlWhitespace(buildExpectedSchemaFromMigrationSql(sourceMigration)),
    )

    for (const tableName of T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES) {
      expect(migration).toContain(`LOCK TABLE public.${tableName} IN ACCESS EXCLUSIVE MODE`)
      expect(migration).toContain(`DROP TABLE public.${tableName};`)
      expect(rollback).toContain(`CREATE TABLE IF NOT EXISTS public.${tableName}`)
    }
  })

  it('captures a repeatable-read backup and restores only into empty recreated tables', async () => {
    const queries: string[] = []
    const query = vi.fn(async (sql: string) => {
      queries.push(sql)
      if (sql.includes('AS snapshot')) {
        return { rows: [{ snapshot: sampleRows, data_fingerprint: 'a'.repeat(64) }] }
      }
      if (sql.includes('current_database()')) {
        return { rows: [{ database_name: 'staging', current_user_name: 'migration_user' }] }
      }
      if (sql.includes('FROM public.schema_migrations')) {
        return { rows: [{ filename: '241_v14231_t2_rhythm_schedule_runtime_publications.sql', checksum: '241-hash' }] }
      }
      if (sql.includes('AS relation_state')) {
        return {
          rows: [{ relation_state: Object.fromEntries(
            T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES.map((name) => [name, { exists: true, count: 0 }]),
          ) }],
        }
      }
      return { rows: [] }
    })

    const backup = await captureT2ScheduleRuntimeRetirementBackup(query, {
      generatedAt: '2026-07-17T00:00:00.000Z',
    })
    const serialized = serializeT2ScheduleRuntimeRetirementBackup(backup)
    const sha256 = calculateT2ScheduleRuntimeBackupSha256(serialized)

    expect(queries[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(queries).toContain('COMMIT')
    expect(validateT2ScheduleRuntimeRetirementBackup(serialized, sha256)).toEqual(backup)
    expect(() => validateT2ScheduleRuntimeRetirementBackup(`${serialized} `, sha256)).toThrow(
      'T2_SCHEDULE_RUNTIME_BACKUP_CHECKSUM_MISMATCH',
    )

    await expect(restoreT2ScheduleRuntimeRetirementBackup(query, backup, 'wrong')).rejects.toThrow(
      'T2_SCHEDULE_RUNTIME_RESTORE_CONFIRMATION_REQUIRED',
    )
    await restoreT2ScheduleRuntimeRetirementBackup(
      query,
      backup,
      T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION,
    )
    const sql = queries.join('\n')
    expect(sql).toContain('jsonb_populate_recordset')
    expect(sql).not.toContain('DELETE FROM')
  })
})
