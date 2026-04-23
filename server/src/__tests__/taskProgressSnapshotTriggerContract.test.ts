import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('task progress snapshot trigger contract', () => {
  it('ships a live migration that makes the legacy db trigger idempotent', () => {
    const migration = readServerFile('migrations', '105_make_task_progress_snapshot_trigger_idempotent.sql')

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.auto_record_progress_snapshot()')
    expect(migration).toContain('ON CONFLICT (task_id, snapshot_date, event_type, event_source)')
    expect(migration).toContain('recorded_by = COALESCE(EXCLUDED.recorded_by, public.task_progress_snapshots.recorded_by)')
  })

  it('keeps canonical clean and full bundles aligned with trigger upsert semantics', () => {
    const sources = [
      readServerFile('migrations', 'CLEAN_MIGRATION_V4.sql'),
      readServerFile('migrations', 'FULL_MIGRATION_ALL_IN_ONE.sql'),
      readServerFile('migrations', 'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql'),
    ]

    for (const source of sources) {
      expect(source).toContain('CREATE OR REPLACE FUNCTION auto_record_progress_snapshot()')
      expect(source).toContain('ON CONFLICT (task_id, snapshot_date, event_type, event_source)')
      expect(source).toContain('progress = EXCLUDED.progress')
      expect(source).toContain('notes = EXCLUDED.notes')
    }
  })
})
