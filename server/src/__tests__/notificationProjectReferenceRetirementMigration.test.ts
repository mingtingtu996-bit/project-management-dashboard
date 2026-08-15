import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()
const serverRoot = resolve(workspaceRoot, 'server')
const migrationName = '339_notification_project_reference_retirement.sql'

function readIfPresent(...parts: string[]) {
  const path = resolve(...parts)
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : ''
}

describe('notification project reference retirement migration', () => {
  it('preserves orphan notifications while retiring their deleted-project scope', () => {
    const forward = readIfPresent(serverRoot, 'migrations', migrationName)

    expect(forward).not.toBe('')
    expect(forward).toContain('LOCK TABLE public.projects IN SHARE MODE')
    expect(forward).toContain('LOCK TABLE public.notifications IN SHARE ROW EXCLUSIVE MODE')
    expect(forward).toContain("'{retired_project_reference}'")
    expect(forward).toMatch(/'project_id',\s*notification_row\.project_id::text/i)
    expect(forward).toContain("'reason', 'source_project_deleted'")
    expect(forward).toContain("lifecycle_status = 'archived'")
    expect(forward).toContain('is_broadcast = FALSE')
    expect(forward).toContain('project_id = NULL')
    expect(forward).toContain('CONSTRAINT notifications_project_id_fkey')
    expect(forward).toContain('REFERENCES public.projects(id) ON DELETE SET NULL')
    expect(forward).toContain('VALIDATE CONSTRAINT notifications_project_id_fkey')
    expect(forward).toContain('FUNCTION public.retire_notifications_before_project_delete()')
    expect(forward).toContain('BEFORE DELETE ON public.projects')
    expect(forward).toContain('SET search_path = public, pg_temp')
    expect(forward).toContain('REVOKE ALL ON FUNCTION public.retire_notifications_before_project_delete() FROM PUBLIC')
    expect(forward).toContain('notification_project_reference_retirement_postcondition_failed')
    expect(forward).toContain('MIGRATION_339_NOTIFICATION_PROJECT_REFERENCE_RETIREMENT_READBACK_COMPLETE')
    expect(forward).not.toMatch(/DELETE\s+FROM\s+public\.notifications/i)
  })

  it('provides a non-destructive rollback for the new foreign-key boundary', () => {
    const rollback = readIfPresent(serverRoot, 'migrations', 'rollback', migrationName)

    expect(rollback).not.toBe('')
    expect(rollback).toContain('DROP TRIGGER IF EXISTS trigger_retire_notifications_before_project_delete')
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.retire_notifications_before_project_delete()')
    expect(rollback).toContain('DROP CONSTRAINT IF EXISTS notifications_project_id_fkey')
    expect(rollback).toContain("metadata -> 'retired_project_reference' ->> 'project_id'")
    expect(rollback).toContain('JOIN public.projects project_row')
    expect(rollback).not.toMatch(/DELETE\s+FROM\s+public\.notifications/i)
    expect(rollback).toContain('MIGRATION_339_NOTIFICATION_PROJECT_REFERENCE_RETIREMENT_ROLLBACK_COMPLETE')
  })

  it('keeps clean bootstrap and the system registry synchronized through migration 339', () => {
    const forward = readFileSync(resolve(serverRoot, 'migrations', migrationName), 'utf8')
      .replace(/\r\n/g, '\n')
      .trim()
    const cleanBundle = readFileSync(resolve(serverRoot, 'migrations', 'CLEAN_MIGRATION_V4.sql'), 'utf8')
      .replace(/\r\n/g, '\n')
    const registry = JSON.parse(
      readFileSync(resolve(serverRoot, 'src', 'registry', 'system-domain-registry.json'), 'utf8'),
    ) as { entries?: Array<{ kind?: string; id?: string }> }

    expect(cleanBundle).toContain('CANONICAL: current clean bootstrap bundle, synchronized through migration 339')
    const sourceHeader = [
      '-- ============================================================',
      `-- Source: ${migrationName}`,
      '-- ============================================================',
    ].join('\n')
    const sourceIndex = cleanBundle.indexOf(sourceHeader)
    const nextSourceIndex = cleanBundle.indexOf(
      '\n-- ============================================================\n-- Source:',
      sourceIndex + sourceHeader.length,
    )
    const bundledForward = cleanBundle
      .slice(sourceIndex + sourceHeader.length, nextSourceIndex >= 0 ? nextSourceIndex : undefined)
      .trim()
    expect(sourceIndex).toBeGreaterThanOrEqual(0)
    expect(bundledForward).toBe(forward)
    expect(registry.entries).toContainEqual(expect.objectContaining({
      kind: 'migration',
      id: '339_notification_project_reference_retirement',
    }))
  })
})
