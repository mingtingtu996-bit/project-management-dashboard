import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  type NotificationTaskReferenceRetirementBackup,
  calculateNotificationTaskReferenceRetirementBackupSha256,
  captureNotificationTaskReferenceRetirementBackup,
  prepareNotificationTaskReferenceRetirementApplySession,
  serializeNotificationTaskReferenceRetirementBackup,
  validateNotificationTaskReferenceRetirementBackup,
} from '../scripts/notificationTaskReferenceRetirementSupport.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const workspaceRoot = resolve(serverRoot, '..')
const migrationFilename = '320_notification_task_reference_retirement.sql'

function readOptional(...parts: string[]) {
  const target = resolve(...parts)
  return existsSync(target) ? readFileSync(target, 'utf8') : ''
}

describe('notification task reference retirement', () => {
  it('backs up and retires orphan task links without deleting retained notifications', () => {
    const migration = readOptional(serverRoot, 'migrations', migrationFilename)
    const rollback = readOptional(serverRoot, 'migrations', 'rollback', migrationFilename)

    expect(migration).toContain(
      "current_setting('workbuddy.notification_task_reference_retirement_backup_sha256', true)",
    )
    expect(migration).toContain(
      "current_setting('workbuddy.notification_task_reference_retirement_data_fingerprint', true)",
    )
    expect(migration).toContain('LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE')
    expect(migration).toContain('notification_task_reference_retirement_data_changed_after_backup')
    expect(migration).toContain("warning_lifecycle_status = 'resolved'")
    expect(migration).toContain("resolved_source = 'source_deleted'")
    expect(migration).toContain("'{retired_task_reference}'")
    expect(migration).toContain('task_id = NULL')
    expect(migration).toContain('CONSTRAINT notifications_task_id_fkey')
    expect(migration).toContain('REFERENCES public.tasks(id) ON DELETE SET NULL')
    expect(migration).toContain('notification_task_reference_retirement_postcondition_failed')
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.notifications/i)
    expect(rollback).toContain('DROP CONSTRAINT IF EXISTS notifications_task_id_fkey')
  })

  it('requires an immutable orphan backup immediately before migration apply', () => {
    const packageJson = JSON.parse(readFileSync(resolve(serverRoot, 'package.json'), 'utf8'))
    const workflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const runner = readFileSync(resolve(serverRoot, 'src', 'scripts', 'run-pending-migrations.ts'), 'utf8')
    const support = readOptional(serverRoot, 'src', 'scripts', 'notificationTaskReferenceRetirementSupport.ts')
    const backupScript = readOptional(serverRoot, 'src', 'scripts', 'backup-notification-task-reference-retirement.ts')

    expect(packageJson.scripts['backup:notification-task-reference-retirement']).toContain(
      'backup-notification-task-reference-retirement.ts',
    )
    expect(support).toContain("'workbuddy/notification-task-reference-retirement-backup/v1'")
    expect(support).toContain('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(support).toContain('NOTIFICATION_TASK_REFERENCE_RETIREMENT_PREFLIGHT_DATA_CHANGED')
    expect(backupScript).toContain("flag: 'wx'")
    expect(runner).toContain('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_FILE_REQUIRED')
    expect(runner).toContain('prepareNotificationTaskReferenceRetirementApplySession')

    const backupIndex = workflow.indexOf('Backup orphan notification task references')
    const uploadIndex = workflow.indexOf('Upload orphan notification task reference backup')
    const applyIndex = workflow.indexOf('Apply pending migrations')
    expect(backupIndex).toBeGreaterThan(-1)
    expect(uploadIndex).toBeGreaterThan(backupIndex)
    expect(applyIndex).toBeGreaterThan(uploadIndex)
    expect(workflow).toContain('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_FILE=$backup_file')
  })

  it('captures immutable bytes and prepares apply only for the same database snapshot', async () => {
    const rows = [{
      id: 'notification-1',
      task_id: 'missing-task-1',
      source_entity_type: 'warning',
    }]
    const dataFingerprint = 'a'.repeat(64)
    const captureQueries: string[] = []
    const captureQuery = vi.fn(async (sql: string) => {
      captureQueries.push(sql)
      if (sql.includes('current_database()')) {
        return { rows: [{ database_name: 'staging', current_user_name: 'migration_user' }] }
      }
      if (sql.includes('AS snapshot')) {
        return { rows: [{ snapshot: rows, row_count: rows.length, data_fingerprint: dataFingerprint }] }
      }
      return { rows: [] }
    })

    const backup = await captureNotificationTaskReferenceRetirementBackup(captureQuery, {
      generatedAt: '2026-07-17T00:00:00.000Z',
    })
    const serialized = serializeNotificationTaskReferenceRetirementBackup(backup)
    const backupSha256 = calculateNotificationTaskReferenceRetirementBackupSha256(serialized)

    expect(captureQueries[0]).toBe('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(captureQueries.at(-1)).toBe('COMMIT')
    expect(validateNotificationTaskReferenceRetirementBackup(serialized, backupSha256)).toEqual(backup)
    expect(() => validateNotificationTaskReferenceRetirementBackup(`${serialized} `, backupSha256)).toThrow(
      'NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_CHECKSUM_MISMATCH',
    )

    const applyQuery = vi.fn(async (sql: string) => {
      if (sql.includes('current_database()')) {
        return { rows: [{ database_name: 'staging', current_user_name: 'migration_user' }] }
      }
      if (sql.includes('AS snapshot')) {
        return { rows: [{ snapshot: rows, row_count: rows.length, data_fingerprint: dataFingerprint }] }
      }
      return { rows: [] }
    })
    await prepareNotificationTaskReferenceRetirementApplySession(
      applyQuery,
      backup,
      backupSha256,
    )

    const applySql = applyQuery.mock.calls.map(([sql]) => sql).join('\n')
    expect(applySql).toContain('notification_task_reference_retirement_backup_sha256')
    expect(applySql).toContain('notification_task_reference_retirement_data_fingerprint')
  })

  it('rejects a backup from another database identity before setting apply parameters', async () => {
    const backup: NotificationTaskReferenceRetirementBackup = {
      schemaVersion: 'workbuddy/notification-task-reference-retirement-backup/v1',
      migrationFilename: '320_notification_task_reference_retirement.sql',
      generatedAt: '2026-07-17T00:00:00.000Z',
      databaseIdentity: {
        database_name: 'staging',
        current_user_name: 'migration_user',
      },
      count: 0,
      dataFingerprint: 'a'.repeat(64),
      rows: [],
    }
    const query = vi.fn(async () => ({
      rows: [{ database_name: 'production', current_user_name: 'migration_user' }],
    }))

    await expect(
      prepareNotificationTaskReferenceRetirementApplySession(query, backup, 'b'.repeat(64)),
    ).rejects.toThrow('NOTIFICATION_TASK_REFERENCE_RETIREMENT_BACKUP_DATABASE_MISMATCH')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('treats registered technical audit rows as retained snapshots without masking notifications', () => {
    const diagnostic = readFileSync(
      resolve(workspaceRoot, 'scripts', 'diagnostics', 'live-workspace-isolation-regression.mjs'),
      'utf8',
    )
    const residuePolicy = readFileSync(
      resolve(workspaceRoot, 'project-testing', 'tools', 'project-residue-policy.mjs'),
      'utf8',
    )

    expect(diagnostic).toContain("from '../../project-testing/tools/project-residue-policy.mjs'")
    expect(diagnostic).toContain('!retainedHistoricalProjectReferenceTables.has(table)')
    expect(residuePolicy).toContain("'duration_learning_runtime_evidence_outbox_tombstones'")
    expect(residuePolicy).toContain("'operation_logs'")
    expect(residuePolicy).not.toContain('notifications')
    expect(diagnostic).toContain("recordCheck('retained historical project references', 'done'")
  })
})
