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
  resolveT2ScheduleRuntimeRetirementTargetIdentity,
  serializeT2ScheduleRuntimeRetirementBackup,
  validateT2ScheduleRuntimeRetirementBackup,
} from '../scripts/t2ScheduleRuntimeRetirementSupport.js'

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const targetIdentity = {
  supabaseProjectRef: 'xemqmqpifsstkovbkatp',
  targetEnvironment: 'staging' as const,
}

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
  task_dependencies: [{
    id: '00000000-0000-4000-8000-000000000003',
    project_id: '00000000-0000-4000-8000-000000000010',
    task_id: '00000000-0000-4000-8000-000000000011',
    dependency_task_id: '00000000-0000-4000-8000-000000000012',
    dependency_type: 'FS',
    required_for_start: true,
    status: 'inactive',
    source_type: 't2_rhythm_schedule_runtime',
    source_ref_id: null,
    metadata: {
      edgeId: 'edge-1',
      publicationKey: 't2-rhythm-schedule-runtime:00000000-0000-4000-8000-000000000010:real-closeout:2026-06-29T00:00:00.000Z',
    },
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

  it('keeps production livegate execution independent from retired T2 runtime relations', () => {
    const productionLivegate = readWorkspace(
      'project-testing/tools/run-production-livegate-evidence.mjs',
    )
    const productionLivegateTest = readWorkspace(
      'project-testing/tools/run-production-livegate-evidence.test.mjs',
    )
    const productionWorkflow = readWorkspace(
      '.github/workflows/production-livegate-execution.yml',
    )
    const releaseMatrix = readWorkspace(
      'project-testing/matrix/release-test-matrix.json',
    )
    const retiredRelations = [
      't2_rhythm_schedule_runtime_publications',
      't2_rhythm_schedule_runtime_events',
    ]

    for (const [name, source] of [
      ['production livegate', productionLivegate],
      ['production livegate contract', productionLivegateTest],
      ['production livegate workflow', productionWorkflow],
      ['release matrix', releaseMatrix],
    ] as const) {
      for (const relation of retiredRelations) {
        expect(source, `${name} still references retired relation ${relation}`).not.toContain(relation)
      }
    }

    expect(productionLivegate).toContain('session_temp_only')
    expect(productionLivegate).toContain('checkC19RuntimePreflight')
    expect(productionLivegate).toContain('canonicalWizardSmokeFile')
    expect(productionLivegate).not.toContain('production_livegate_minimal_runtime_publication')
  })

  it('backs up eligible inactive dependency residue before dropping duplicate T2 runtime tables', () => {
    const migration = readServer('migrations', T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION)
    const rollback = readServer('migrations/rollback', T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION)
    const sourceMigration = readServer('migrations/241_v14231_t2_rhythm_schedule_runtime_publications.sql')
    const cleanBundle = readServer('migrations/CLEAN_MIGRATION_V4.sql')
    const legacyDropGuard = readServer('src/scripts/check-legacy-object-drop-guard.ts')
    const deployWorkflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')

    expect(migration).toContain("current_setting('workbuddy.t2_schedule_runtime_retirement_backup_sha256', true)")
    expect(migration).toContain("current_setting('workbuddy.t2_schedule_runtime_retirement_data_fingerprint', true)")
    expect(migration).toContain('t2_schedule_runtime_retirement_active_publication_present')
    expect(migration).toContain('LOCK TABLE public.task_dependencies IN SHARE ROW EXCLUSIVE MODE')
    expect(migration).toContain("source_type = 't2_rhythm_schedule_runtime'")
    expect(migration).toContain("status = 'inactive'")
    expect(migration).toContain("dependency_type = 'FS'")
    expect(migration).toContain('required_for_start IS TRUE')
    expect(migration).toContain('source_ref_id IS NULL')
    expect(migration).toContain("metadata ->> 'edgeId'")
    expect(migration).toContain("metadata ->> 'publicationKey'")
    expect(migration).toContain('publication.publication_key = dependency.metadata ->> \'publicationKey\'')
    expect(migration).toContain("publication.runtime_publication_status = 'runtime_rolled_back'")
    expect(migration).toContain('publication.project_id = dependency.project_id')
    expect(migration).toContain('t2_schedule_runtime_retirement_ineligible_dependency_residue_present')
    expect(migration).toContain('DELETE FROM public.task_dependencies')
    expect(migration).not.toMatch(/DROP TABLE[\s\S]*CASCADE/i)
    expect(deployWorkflow).toContain('321_retire_duplicate_t2_schedule_runtime.sql; do')
    expect(deployWorkflow).toContain('if grep -Fqx -- "- $migration" <<< "$plan_output"; then')
    expect(deployWorkflow).toContain(
      'drop_guard_args+=(--approve-existing-drop-targets-for "$migration")',
    )
    expect(deployWorkflow).toContain('npm run backup:t2-schedule-runtime-retirement -- --if-pending')
    expect(legacyDropGuard).toContain('strictly eligible inactive real-closeout task_dependencies')
    const cleanMarker = '-- Source: 321_retire_duplicate_t2_schedule_runtime.sql\n-- ============================================================\n'
    const cleanStart = cleanBundle.indexOf(cleanMarker)
    expect(cleanStart).toBeGreaterThan(-1)
    const cleanBodyStart = cleanStart + cleanMarker.length
    const nextCleanMarker = cleanBundle.indexOf(
      '\n-- ============================================================\n-- Source: ',
      cleanBodyStart,
    )
    expect(nextCleanMarker).toBeGreaterThan(cleanBodyStart)
    expect(cleanBundle.slice(cleanBodyStart, nextCleanMarker).trim()).toBe(migration.trim())
    expect(normalizeSqlWhitespace(buildExpectedSchemaFromMigrationSql(rollback))).toEqual(
      normalizeSqlWhitespace(buildExpectedSchemaFromMigrationSql(sourceMigration)),
    )

    for (const tableName of T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES) {
      expect(migration).toContain(`LOCK TABLE public.${tableName} IN ACCESS EXCLUSIVE MODE`)
      expect(migration).toContain(`DROP TABLE public.${tableName};`)
      expect(rollback).toContain(`CREATE TABLE IF NOT EXISTS public.${tableName}`)
    }
  })

  it('binds only the 321 apply session to the selected T2 retirement target identity', () => {
    const runner = readServer('src/scripts/run-pending-migrations.ts')
    const progressStart = runner.indexOf('if (migration.filename === PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION)')
    const notificationStart = runner.indexOf(
      'if (migration.filename === NOTIFICATION_TASK_REFERENCE_RETIREMENT_MIGRATION)',
      progressStart,
    )
    const t2Start = runner.indexOf(
      'if (migration.filename === T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION)',
      notificationStart,
    )
    const applyStart = runner.indexOf('await applyMigration(client, migration)', t2Start)

    expect(progressStart).toBeGreaterThan(-1)
    expect(notificationStart).toBeGreaterThan(progressStart)
    expect(t2Start).toBeGreaterThan(notificationStart)
    expect(applyStart).toBeGreaterThan(t2Start)
    expect(runner.slice(progressStart, notificationStart)).not.toContain(
      'resolveT2ScheduleRuntimeRetirementTargetIdentity()',
    )
    expect(runner.slice(t2Start, applyStart)).toContain(
      'resolveT2ScheduleRuntimeRetirementTargetIdentity()',
    )
  })

  it('passes the expected Supabase project identity to the 321 backup and apply steps', () => {
    const deployWorkflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')
    const stepSource = (stepName: string, nextStepName: string) => {
      const start = deployWorkflow.indexOf(`      - name: ${stepName}`)
      const end = deployWorkflow.indexOf(`      - name: ${nextStepName}`, start + 1)
      expect(start).toBeGreaterThan(-1)
      expect(end).toBeGreaterThan(start)
      return deployWorkflow.slice(start, end)
    }
    const expectedSupabaseUrlSecret =
      "SUPABASE_URL: ${{ secrets[format('{0}_SUPABASE_URL', github.event.inputs.environment == 'staging' && 'STAGING' || 'PRODUCTION')] }}"

    expect(stepSource(
      'Backup retired T2 schedule runtime data',
      'Upload retired T2 schedule runtime backup',
    )).toContain(expectedSupabaseUrlSecret)
    expect(stepSource(
      'Apply pending migrations',
      'Check migration pending zero after apply',
    )).toContain(expectedSupabaseUrlSecret)
  })

  it('captures a v2 repeatable-read backup and restores complete dependency rows without rewriting lineage', async () => {
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
      targetIdentity,
    })
    const serialized = serializeT2ScheduleRuntimeRetirementBackup(backup)
    const sha256 = calculateT2ScheduleRuntimeBackupSha256(serialized)

    expect(queries[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(queries).toContain('COMMIT')
    expect(backup.schemaVersion).toBe('workbuddy/t2-schedule-runtime-retirement-backup/v2')
    expect(backup.counts.task_dependencies).toBe(1)
    expect(validateT2ScheduleRuntimeRetirementBackup(serialized, sha256)).toEqual(backup)
    expect(() => validateT2ScheduleRuntimeRetirementBackup(`${serialized} `, sha256)).toThrow(
      'T2_SCHEDULE_RUNTIME_BACKUP_CHECKSUM_MISMATCH',
    )

    await expect(restoreT2ScheduleRuntimeRetirementBackup(query, backup, 'wrong', targetIdentity)).rejects.toThrow(
      'T2_SCHEDULE_RUNTIME_RESTORE_CONFIRMATION_REQUIRED',
    )
    await restoreT2ScheduleRuntimeRetirementBackup(
      query,
      backup,
      T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION,
      targetIdentity,
    )
    const sql = queries.join('\n')
    expect(sql).toContain('jsonb_populate_recordset')
    expect(sql).toContain('NULL::public.task_dependencies')
    expect(sql).not.toContain('DELETE FROM')
  })

  it('rejects v1 backups and refuses to restore over T2 dependency residue or occupied ids', async () => {
    const backup = {
      schemaVersion: 'workbuddy/t2-schedule-runtime-retirement-backup/v2',
      migrationFilename: T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION,
      generatedAt: '2026-07-17T00:00:00.000Z',
      databaseIdentity: {
        database_name: 'staging',
        current_user_name: 'migration_user',
        supabase_project_ref: targetIdentity.supabaseProjectRef,
        target_environment: targetIdentity.targetEnvironment,
      },
      sourceMigrationLedger: [{
        filename: '241_v14231_t2_rhythm_schedule_runtime_publications.sql',
        checksum: '241-hash',
      }],
      counts: {
        t2_rhythm_schedule_runtime_publications: 1,
        t2_rhythm_schedule_runtime_events: 1,
        task_dependencies: 1,
      },
      dataFingerprint: 'a'.repeat(64),
      rows: sampleRows,
    } as T2ScheduleRuntimeRetirementBackup
    const serialized = serializeT2ScheduleRuntimeRetirementBackup(backup)
    const sha256 = calculateT2ScheduleRuntimeBackupSha256(serialized)
    const v1 = serialized.replace(
      'workbuddy/t2-schedule-runtime-retirement-backup/v2',
      'workbuddy/t2-schedule-runtime-retirement-backup/v1',
    )
    const v1Sha256 = calculateT2ScheduleRuntimeBackupSha256(v1)

    expect(() => validateT2ScheduleRuntimeRetirementBackup(v1, v1Sha256)).toThrow(
      'T2_SCHEDULE_RUNTIME_BACKUP_SCHEMA_VERSION_MISMATCH',
    )

    const query = vi.fn(async (sql: string) => {
      if (sql.includes('AS relation_state')) {
        return {
          rows: [{ relation_state: Object.fromEntries(
            T2_SCHEDULE_RUNTIME_RETIREMENT_TABLES.map((name) => [name, { exists: true, count: 0 }]),
          ) }],
        }
      }
      if (sql.includes('t2_dependency_restore_conflicts')) {
        return { rows: [{ source_count: 1, id_conflict_count: 1 }] }
      }
      return { rows: [] }
    })

    await expect(restoreT2ScheduleRuntimeRetirementBackup(
      query,
      backup,
      T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION,
      targetIdentity,
    )).rejects.toThrow('T2_SCHEDULE_RUNTIME_RESTORE_DEPENDENCY_TARGET_NOT_EMPTY')
  })

  it('rejects a backup from another Supabase project before issuing any restore query', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const backup = {
      schemaVersion: 'workbuddy/t2-schedule-runtime-retirement-backup/v2',
      migrationFilename: T2_SCHEDULE_RUNTIME_RETIREMENT_MIGRATION,
      generatedAt: '2026-07-17T00:00:00.000Z',
      databaseIdentity: {
        database_name: 'postgres',
        current_user_name: 'postgres',
        supabase_project_ref: 'wwdrkjnbvcbfytwnnyvs',
        target_environment: 'production',
      },
      sourceMigrationLedger: [{
        filename: '241_v14231_t2_rhythm_schedule_runtime_publications.sql',
        checksum: '241-hash',
      }],
      counts: {
        t2_rhythm_schedule_runtime_publications: 1,
        t2_rhythm_schedule_runtime_events: 1,
        task_dependencies: 1,
      },
      dataFingerprint: 'a'.repeat(64),
      rows: sampleRows,
    } as T2ScheduleRuntimeRetirementBackup

    await expect(restoreT2ScheduleRuntimeRetirementBackup(
      query,
      backup,
      T2_SCHEDULE_RUNTIME_RETIREMENT_CONFIRMATION,
      targetIdentity,
    )).rejects.toThrow('T2_SCHEDULE_RUNTIME_RETIREMENT_BACKUP_PROJECT_MISMATCH')
    expect(query).not.toHaveBeenCalled()
  })

  it('derives the immutable target identity from the migration runner selected target', () => {
    expect(resolveT2ScheduleRuntimeRetirementTargetIdentity({
      DATABASE_URL: 'postgresql://postgres.xemqmqpifsstkovbkatp:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
      SUPABASE_URL: 'https://xemqmqpifsstkovbkatp.supabase.co',
      DEPLOY_TARGET: 'staging',
    })).toEqual(targetIdentity)

    expect(resolveT2ScheduleRuntimeRetirementTargetIdentity({
      SUPABASE_MIGRATION_URL: 'postgresql://postgres.xemqmqpifsstkovbkatp:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
      DATABASE_URL: 'postgresql://postgres:secret@external.example.com:5432/postgres',
      SUPABASE_URL: 'https://xemqmqpifsstkovbkatp.supabase.co',
      DEPLOY_TARGET: 'staging',
    })).toEqual(targetIdentity)

    expect(() => resolveT2ScheduleRuntimeRetirementTargetIdentity({
      DATABASE_URL: 'postgresql://postgres.wwdrkjnbvcbfytwnnyvs:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres',
      SUPABASE_URL: 'https://xemqmqpifsstkovbkatp.supabase.co',
      DEPLOY_TARGET: 'staging',
    })).toThrow('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_PROJECT_MISMATCH')

    expect(() => resolveT2ScheduleRuntimeRetirementTargetIdentity({
      DATABASE_URL: 'postgresql://postgres:secret@external.example.com:5432/postgres',
      SUPABASE_URL: 'https://xemqmqpifsstkovbkatp.supabase.co',
      DEPLOY_TARGET: 'staging',
    })).toThrow('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_PROJECT_UNRESOLVED')

    expect(() => resolveT2ScheduleRuntimeRetirementTargetIdentity({
      DATABASE_URL: 'postgresql://postgres.xemqmqpifsstkovbkatp:secret@external.example.com:5432/postgres',
      SUPABASE_URL: 'https://xemqmqpifsstkovbkatp.supabase.co',
      DEPLOY_TARGET: 'staging',
    })).toThrow('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_PROJECT_UNRESOLVED')

    expect(() => resolveT2ScheduleRuntimeRetirementTargetIdentity({
      PGHOST: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
      PGUSER: 'postgres',
      PGPASSWORD: 'secret',
      SUPABASE_URL: 'https://xemqmqpifsstkovbkatp.supabase.co',
      DEPLOY_TARGET: 'staging',
    })).toThrow('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_PROJECT_MISMATCH')

    expect(() => resolveT2ScheduleRuntimeRetirementTargetIdentity({
      PGHOST: 'aws-1-ap-southeast-1.pooler.supabase.com',
      PGUSER: 'postgres.wwdrkjnbvcbfytwnnyvs',
      PGPASSWORD: 'secret',
      SUPABASE_URL: 'https://xemqmqpifsstkovbkatp.supabase.co',
      DEPLOY_TARGET: 'staging',
    })).toThrow('T2_SCHEDULE_RUNTIME_RETIREMENT_TARGET_PROJECT_MISMATCH')
  })
})
