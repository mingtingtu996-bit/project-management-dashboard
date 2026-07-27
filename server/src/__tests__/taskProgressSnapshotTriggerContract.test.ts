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
  it('retires the legacy db writer and adds auditable reconcile rollback state', () => {
    const migration = readServerFile('migrations', '316_task_fact_write_integrity.sql')

    expect(migration).toContain('DROP TRIGGER IF EXISTS trigger_auto_record_snapshot ON public.tasks')
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.auto_record_progress_snapshot()')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ')
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS rolled_back_by UUID')
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS rollback_result JSONB NOT NULL DEFAULT '{}'::jsonb")
  })

  it('keeps the canonical clean bundle final state on the application-owned writer', () => {
    const source = readServerFile('migrations', 'CLEAN_MIGRATION_V4.sql')
    const finalDrop = source.lastIndexOf('DROP TRIGGER IF EXISTS trigger_auto_record_snapshot ON public.tasks')
    const lastCreate = source.lastIndexOf('CREATE TRIGGER trigger_auto_record_snapshot')

    expect(finalDrop).toBeGreaterThan(lastCreate)
    expect(source.slice(finalDrop)).toContain('DROP FUNCTION IF EXISTS public.auto_record_progress_snapshot()')
    expect(source.slice(finalDrop)).toContain('ADD COLUMN IF NOT EXISTS rolled_back_at TIMESTAMPTZ')
  })

  it('keeps migration 316 byte-equivalent in the canonical clean bundle', () => {
    const migrationName = '316_task_fact_write_integrity.sql'
    const migration = readServerFile('migrations', migrationName)
      .replace(/\r\n/g, '\n')
      .trim()
    const cleanBundle = readServerFile('migrations', 'CLEAN_MIGRATION_V4.sql')
      .replace(/\r\n/g, '\n')
    const header = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = cleanBundle.indexOf(header)

    expect(sourceIndex).toBeGreaterThan(-1)
    const bodyStart = sourceIndex + header.length
    const nextSourceIndex = cleanBundle.indexOf(
      '\n-- ============================================================\n-- Source:',
      bodyStart,
    )
    const bundledBody = cleanBundle.slice(
      bodyStart,
      nextSourceIndex >= 0 ? nextSourceIndex : undefined,
    ).trim()

    expect(bundledBody).toBe(migration)
  })

  it('provides an explicit rollback for the trigger retirement', () => {
    const rollback = readServerFile('migrations', 'rollback', '316_task_fact_write_integrity.sql')

    expect(rollback).toContain('CREATE OR REPLACE FUNCTION public.auto_record_progress_snapshot()')
    expect(rollback).toContain('CREATE TRIGGER trigger_auto_record_snapshot')
    expect(rollback).toContain('DROP COLUMN IF EXISTS rollback_result')
  })
})
