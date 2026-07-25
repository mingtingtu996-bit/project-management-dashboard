import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '326_task_write_finalization_outbox.sql'

function readOptional(...segments: string[]) {
  const filePath = resolve(serverRoot, ...segments)
  return existsSync(filePath) ? readFileSync(filePath, 'utf8').toLowerCase() : ''
}

describe('task write finalization outbox migration', () => {
  it('atomically records canonical finalization work from task execution-fact updates', () => {
    const sql = readOptional('migrations', migrationName)

    expect(sql).toContain('create table if not exists public.task_write_finalization_outbox')
    expect(sql).toContain('previous_task jsonb not null')
    expect(sql).toContain('next_task jsonb not null')
    expect(sql).toContain('processing_status text not null')
    expect(sql).toContain('lease_owner text')
    expect(sql).toContain('lease_expires_at timestamptz')
    expect(sql).toContain('create or replace function public.enqueue_task_write_finalization_outbox()')
    expect(sql).toContain('after update of progress, status, actual_start_date, actual_end_date, first_progress_at')
    expect(sql).toContain('old.progress is distinct from new.progress')
    expect(sql).toContain('old.status is distinct from new.status')
    expect(sql).toContain('old.actual_start_date is distinct from new.actual_start_date')
    expect(sql).toContain('old.actual_end_date is distinct from new.actual_end_date')
    expect(sql).toContain('old.first_progress_at is distinct from new.first_progress_at')
    expect(sql).toContain('to_jsonb(old)')
    expect(sql).toContain('to_jsonb(new)')
    expect(sql).not.toContain('dblink')
  })

  it('ships bounded claim indexes and runtime/service-role access without public mutation', () => {
    const sql = readOptional('migrations', migrationName)

    expect(sql).toContain('idx_task_write_finalization_outbox_claim')
    expect(sql).toContain('idx_task_write_finalization_outbox_task_order')
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('force row level security')
    expect(sql).toContain('revoke all on table public.task_write_finalization_outbox from public')
    expect(sql).toContain('to workbuddy_runtime')
    expect(sql).toContain('to service_role')
  })

  it('removes the trigger and function before dropping the outbox on rollback', () => {
    const rollback = readOptional('migrations', 'rollback', migrationName)
    const triggerDrop = rollback.indexOf('drop trigger if exists task_write_finalization_outbox_on_update')
    const functionDrop = rollback.indexOf('drop function if exists public.enqueue_task_write_finalization_outbox()')
    const tableDrop = rollback.indexOf('drop table if exists public.task_write_finalization_outbox')

    expect(triggerDrop).toBeGreaterThanOrEqual(0)
    expect(functionDrop).toBeGreaterThan(triggerDrop)
    expect(tableDrop).toBeGreaterThan(functionDrop)
  })
})
