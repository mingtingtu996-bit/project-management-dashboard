import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { buildExpectedSchemaFromMigrationSql } from '../services/schemaDriftExpectedSchemaParser.js'
import {
  PROGRESS_KNOWLEDGE_RETIREMENT_CONFIRMATION,
  PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION,
  PROGRESS_KNOWLEDGE_RETIREMENT_TABLES,
  type ProgressKnowledgeRetirementBackup,
  calculateProgressKnowledgeBackupSha256,
  captureProgressKnowledgeRetirementBackup,
  restoreProgressKnowledgeRetirementBackup,
  serializeProgressKnowledgeRetirementBackup,
  validateProgressKnowledgeRetirementBackup,
} from '../scripts/progressKnowledgeRetirementSupport.js'

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const sampleRows = Object.fromEntries(
  PROGRESS_KNOWLEDGE_RETIREMENT_TABLES.map((tableName) => [
    tableName,
    [{ id: `${tableName}-id`, created_at: '2026-07-15T00:00:00.000Z' }],
  ]),
) as unknown as ProgressKnowledgeRetirementBackup['rows']

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

describe('progress knowledge runtime retirement', () => {
  it('locks, verifies and drops only the six product-runtime candidate governance tables', () => {
    const migration = readFileSync(
      resolve(workspaceRoot, 'server/migrations', PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION),
      'utf8',
    )
    const rollback = readFileSync(
      resolve(workspaceRoot, 'server/migrations/rollback', PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION),
      'utf8',
    )
    const sourceMigration = readFileSync(
      resolve(workspaceRoot, 'server/migrations/226_v14225_progress_knowledge_assets.sql'),
      'utf8',
    )
    const workflow = readFileSync(resolve(workspaceRoot, '.github/workflows/deploy.yml'), 'utf8')

    expect(migration).toContain("current_setting('workbuddy.progress_knowledge_retirement_backup_sha256', true)")
    expect(migration).toContain("current_setting('workbuddy.progress_knowledge_retirement_data_fingerprint', true)")
    expect(migration).toContain('progress_knowledge_retirement_backup_required')
    expect(migration).toContain('progress_knowledge_retirement_data_changed_after_backup')
    expect(migration).toContain("readiness_status IN ('auto_canary_active', 'auto_published')")
    expect(migration).not.toMatch(/DROP TABLE[\s\S]*CASCADE/i)
    const dropGuardStart = workflow.indexOf('drop_guard_args=()')
    const dropGuardEnd = workflow.indexOf('npm run guard:pending-migration-drop-targets', dropGuardStart)
    const dropGuardBlock = workflow.slice(dropGuardStart, dropGuardEnd)

    expect(dropGuardStart).toBeGreaterThan(-1)
    expect(dropGuardEnd).toBeGreaterThan(dropGuardStart)
    expect(dropGuardBlock).toContain('311_retire_product_runtime_progress_knowledge_governance.sql')
    expect(dropGuardBlock).toContain('321_retire_duplicate_t2_schedule_runtime.sql')
    expect(dropGuardBlock).toContain('grep -Fqx -- "- $migration"')
    expect(dropGuardBlock).toContain(
      'drop_guard_args+=(--approve-existing-drop-targets-for "$migration")',
    )
    expect(workflow).toContain('npm run backup:progress-knowledge-retirement -- --if-pending')
    expect(workflow.indexOf('npm run backup:progress-knowledge-retirement -- --if-pending')).toBeLessThan(
      workflow.indexOf('npm run migrate:pending'),
    )
    expect(normalizeSqlWhitespace(buildExpectedSchemaFromMigrationSql(rollback))).toEqual(
      normalizeSqlWhitespace(buildExpectedSchemaFromMigrationSql(sourceMigration)),
    )

    for (const tableName of PROGRESS_KNOWLEDGE_RETIREMENT_TABLES) {
      expect(migration).toContain(`LOCK TABLE public.${tableName} IN ACCESS EXCLUSIVE MODE`)
      expect(migration).toContain(`DROP TABLE public.${tableName};`)
      expect(rollback).toContain(`CREATE TABLE public.${tableName}`)
      expect(rollback).toContain(`ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY`)
    }
  })

  it('captures a repeatable-read, read-only backup and rejects changed bytes', async () => {
    const queries: string[] = []
    const query = vi.fn(async (sql: string) => {
      queries.push(sql)
      if (sql.includes('AS snapshot')) {
        return {
          rows: [{
            snapshot: sampleRows,
            data_fingerprint: 'a'.repeat(64),
          }],
        }
      }
      if (sql.includes('current_database()')) {
        return { rows: [{ database_name: 'staging', current_user_name: 'migration_user' }] }
      }
      if (sql.includes('FROM public.schema_migrations')) {
        return { rows: [{ filename: '226_v14225_progress_knowledge_assets.sql', checksum: '226-hash' }] }
      }
      return { rows: [] }
    })

    const backup = await captureProgressKnowledgeRetirementBackup(query, {
      generatedAt: '2026-07-15T00:00:00.000Z',
    })
    const serialized = serializeProgressKnowledgeRetirementBackup(backup)
    const sha256 = calculateProgressKnowledgeBackupSha256(serialized)

    expect(queries[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(queries.at(-1)).toBe('COMMIT')
    expect(backup.counts.progress_asset_candidates).toBe(1)
    expect(validateProgressKnowledgeRetirementBackup(serialized, sha256)).toEqual(backup)
    expect(() => validateProgressKnowledgeRetirementBackup(`${serialized} `, sha256)).toThrow(
      'PROGRESS_KNOWLEDGE_BACKUP_CHECKSUM_MISMATCH',
    )
  })

  it('restores data only with explicit confirmation and verifies the restored fingerprint', async () => {
    const backup: ProgressKnowledgeRetirementBackup = {
      schemaVersion: 'workbuddy/progress-knowledge-retirement-backup/v1' as const,
      migrationFilename: PROGRESS_KNOWLEDGE_RETIREMENT_MIGRATION,
      generatedAt: '2026-07-15T00:00:00.000Z',
      databaseIdentity: { database_name: 'staging', current_user_name: 'migration_user' },
      sourceMigrationLedger: [{ filename: '226_v14225_progress_knowledge_assets.sql', checksum: '226-hash' }],
      counts: Object.fromEntries(
        PROGRESS_KNOWLEDGE_RETIREMENT_TABLES.map((name) => [name, 1]),
      ) as ProgressKnowledgeRetirementBackup['counts'],
      dataFingerprint: 'a'.repeat(64),
      rows: sampleRows,
    }
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('AS relation_state')) {
        return {
          rows: [{ relation_state: Object.fromEntries(
            PROGRESS_KNOWLEDGE_RETIREMENT_TABLES.map((name) => [name, { exists: true, count: 0 }]),
          ) }],
        }
      }
      if (sql.includes('AS snapshot')) {
        return { rows: [{ snapshot: sampleRows, data_fingerprint: 'a'.repeat(64) }] }
      }
      return { rows: [] }
    })

    await expect(restoreProgressKnowledgeRetirementBackup(query, backup, 'wrong')).rejects.toThrow(
      'PROGRESS_KNOWLEDGE_RESTORE_CONFIRMATION_REQUIRED',
    )
    expect(query).not.toHaveBeenCalled()

    await restoreProgressKnowledgeRetirementBackup(
      query,
      backup,
      PROGRESS_KNOWLEDGE_RETIREMENT_CONFIRMATION,
    )

    const sql = query.mock.calls.map(([statement]) => statement).join('\n')
    expect(sql).toContain('BEGIN')
    expect(sql).toContain('jsonb_populate_recordset')
    expect(sql).toContain('COMMIT')
    expect(sql).not.toContain('DELETE FROM')
  })
})
