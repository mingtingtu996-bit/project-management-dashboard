import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationsRoot = resolve(serverRoot, 'migrations')

function readMigration(name: string) {
  return readFileSync(resolve(migrationsRoot, name), 'utf8')
}

describe('warning escalation RPC migration', () => {
  it('patches confirm_warning_as_risk_atomic to use notifications.content instead of a non-existent message field', () => {
    const migration = readMigration('257_v14231_warning_escalation_rpc_content_field.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.confirm_warning_as_risk_atomic')
    expect(migration).toContain('v_notification.content')
    expect(migration).not.toContain('v_notification.message')
    expect(cleanMigration).toContain('Source: 257_v14231_warning_escalation_rpc_content_field.sql')
    expect(cleanMigration).not.toContain('v_notification.message')
  })

  it('adds a lint closeout migration that removes unused PL/pgSQL variables from live RPC definitions', () => {
    const migration = readMigration('258_v14231_db_lint_function_warning_closeout.sql')
    const cleanMigration = readMigration('CLEAN_MIGRATION_V4.sql')

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.delete_task_with_source_backfill_atomic')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.confirm_warning_as_risk_atomic')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.replace_task_dependencies')
    expect(migration).not.toContain('v_task RECORD')
    expect(migration).not.toContain('new_row task_dependencies')
    expect(migration).not.toContain('v_warning_token TEXT')
    expect(cleanMigration).toContain('Source: 258_v14231_db_lint_function_warning_closeout.sql')
    expect(cleanMigration).not.toContain('v_task RECORD')
    expect(cleanMigration).not.toContain('new_row task_dependencies')
    expect(cleanMigration).not.toContain('v_warning_token TEXT')
  })
})
