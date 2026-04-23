import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverSrcRoot = join(__dirname, '..')
const serverRoot = join(__dirname, '..', '..')

function readServerFile(...segments: string[]) {
  return readFileSync(join(serverSrcRoot, ...segments), 'utf8')
}

describe('task progress snapshot upsert contract', () => {
  it('keeps a runtime fallback when the unique snapshot index is missing', () => {
    const source = readServerFile('services', 'dbService.ts')

    expect(source).toContain('no unique or exclusion constraint matching the ON CONFLICT specification')
    expect(source).toContain('task_progress_snapshots missing unique upsert index')
    expect(source).toContain('snapshotTable.insert({')
    expect(source).toContain("const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows")
  })

  it('ships a canonical migration that creates the unique snapshot event index', () => {
    const migration = readFileSync(join(serverRoot, 'migrations', '097_reconcile_task_snapshot_upsert_index.sql'), 'utf8')

    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_task_progress_snapshots_daily_event')
    expect(migration).toContain('PARTITION BY task_id, snapshot_date, event_type, event_source')
    expect(migration).toContain('ALTER COLUMN event_type SET NOT NULL')
  })
})
