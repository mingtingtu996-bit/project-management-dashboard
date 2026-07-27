import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationName = '327_task_write_finalization_outbox.sql'
const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readSql(...parts: string[]) {
  return readFileSync(resolve(serverRoot, ...parts), 'utf8')
}

function extractMarkedSegment(sql: string) {
  const start = sql.indexOf('-- BEGIN MIGRATION 327')
  const end = sql.indexOf('-- END MIGRATION 327')
  return start >= 0 && end > start ? sql.slice(start, end + '-- END MIGRATION 327'.length) : ''
}

function extractTransactionalMigration(sql: string) {
  const marker = sql.indexOf('-- BEGIN MIGRATION 327')
  const start = sql.lastIndexOf('BEGIN;', marker)
  const end = sql.indexOf('COMMIT;', marker)
  return { start, end }
}

describe('task write finalization outbox migration', () => {
  it('atomically enqueues governed task fact mutations and skips canonical inline writes', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('CREATE TABLE IF NOT EXISTS public.task_write_finalization_outbox')
    expect(forward).toContain("RAISE EXCEPTION 'workbuddy_runtime role is required before applying migration 327'")
    expect(forward).toContain("RAISE EXCEPTION 'workbuddy_private schema is required before applying migration 327'")
    expect(forward).toContain('previous_task JSONB NOT NULL')
    expect(forward).toContain('next_task JSONB NOT NULL')
    expect(forward).toContain('sequence_id BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL')
    expect(forward).toContain("processing_status IN ('pending','processing','failed','completed')")
    expect(forward).toContain('CREATE TRIGGER enqueue_task_write_finalization_outbox_trigger')
    expect(forward).toContain('AFTER UPDATE ON public.tasks')
    expect(forward).toContain("current_setting('workbuddy.task_finalization_outbox_mode', TRUE)")
    expect(forward).toContain("IS NOT DISTINCT FROM 'canonical_inline'")
    for (const column of ['status', 'progress', 'actual_start_date', 'actual_end_date', 'first_progress_at']) {
      expect(forward).toContain(`OLD.${column} IS DISTINCT FROM NEW.${column}`)
    }
  })

  it('restricts outbox mutation to the runtime role and mirrors clean install exactly', () => {
    const forward = readSql('migrations', migrationName)
    const clean = readSql('migrations', 'CLEAN_MIGRATION_V4.sql')

    expect(forward).toContain('ALTER TABLE public.task_write_finalization_outbox FORCE ROW LEVEL SECURITY')
    expect(forward).toContain('REVOKE ALL ON TABLE public.task_write_finalization_outbox FROM PUBLIC, anon, authenticated')
    expect(forward).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_write_finalization_outbox TO workbuddy_runtime')
    expect(extractMarkedSegment(forward)).not.toBe('')
    expect(extractMarkedSegment(clean)).toBe(extractMarkedSegment(forward))
    expect(extractTransactionalMigration(forward).start).toBeGreaterThanOrEqual(0)
    expect(extractTransactionalMigration(forward).end).toBeGreaterThan(extractTransactionalMigration(forward).start)
    expect(extractTransactionalMigration(clean).start).toBeGreaterThanOrEqual(0)
    expect(extractTransactionalMigration(clean).end).toBeGreaterThan(extractTransactionalMigration(clean).start)
    expect(clean.indexOf('-- BEGIN MIGRATION 327')).toBeGreaterThan(clean.indexOf('-- END MIGRATION 326'))
  })

  it('provides a scoped rollback', () => {
    const rollback = readSql('migrations', 'rollback', migrationName)

    expect(rollback).toContain('DROP TRIGGER IF EXISTS enqueue_task_write_finalization_outbox_trigger ON public.tasks')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS workbuddy_private.enqueue_task_write_finalization_outbox()')
    expect(rollback).toContain('DROP TABLE IF EXISTS public.task_write_finalization_outbox')
    expect(rollback).not.toContain('DROP TABLE IF EXISTS public.tasks')
  })
})
