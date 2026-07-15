import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = join(__dirname, '..', '..')
const repoRoot = join(serverRoot, '..')

function listFiles(relativePath: string): string[] {
  const absolutePath = join(repoRoot, relativePath)
  if (!existsSync(absolutePath)) return []

  const stat = statSync(absolutePath)
  if (stat.isFile()) return [relativePath.replace(/\\/g, '/')]

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    return listFiles(join(relativePath, entry.name))
  })
}

function isExecutableRuntimeSource(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/')
  if (normalized.includes('/__tests__/')) return false
  if (/\.(?:test|spec)\.(?:ts|tsx|js|cjs|mjs)$/.test(normalized)) return false
  return /\.(?:ts|tsx|js|cjs|mjs)$/.test(normalized)
}

describe('delay legacy cleanup contract', () => {
  it('ships a migration that removes the obsolete task delay workflow', () => {
    const migration = readFileSync(
      join(serverRoot, 'migrations', '119_remove_delay_request_workflow.sql'),
      'utf8',
    )

    expect(migration).toContain('DROP TRIGGER IF EXISTS trigger_record_task_delay ON public.tasks;')
    expect(migration).toContain('DROP TABLE IF EXISTS public.task_delay_history CASCADE;')
    expect(migration).toContain('DROP TABLE IF EXISTS public.delay_requests CASCADE;')
  })

  it('keeps standalone initialization scripts aligned to the cleaned final schema', () => {
    const standaloneScripts = [
      'CLEAN_MIGRATION.sql',
      'CLEAN_MIGRATION_V2.sql',
      'CLEAN_MIGRATION_V3.sql',
      'CLEAN_MIGRATION_V4.sql',
      'FULL_MIGRATION_ALL_IN_ONE.sql',
      'FULL_MIGRATION_ALL_IN_ONE_FIXED.sql',
    ]

    for (const scriptName of standaloneScripts) {
      const script = readFileSync(join(serverRoot, 'migrations', scriptName), 'utf8')
      expect(script).toContain('DROP TRIGGER IF EXISTS trigger_record_task_delay ON public.tasks;')
      expect(script).toContain('DROP FUNCTION IF EXISTS public.approve_delay_request_atomic(UUID, UUID) CASCADE;')
      expect(script).toContain('DROP TABLE IF EXISTS public.task_delay_history CASCADE;')
      expect(script).toContain('DROP TABLE IF EXISTS public.delay_requests CASCADE;')
      expect(script, scriptName).not.toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?task_delay_history\b/i)
      expect(script, scriptName).not.toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?delay_requests\b/i)
      expect(script, scriptName).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?record_task_delay_history\b/i)
      expect(script, scriptName).not.toMatch(/CREATE\s+TRIGGER\s+trigger_record_task_delay\b/i)
      expect(script, scriptName).not.toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_task_delay_history_/i)
      expect(script, scriptName).not.toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_delay_requests_/i)
      expect(script, scriptName).not.toMatch(/ALTER\s+TABLE\s+IF\s+EXISTS\s+(?:public\.)?delay_requests\b/i)
      expect(script, scriptName).not.toMatch(/UPDATE\s+(?:public\.)?delay_requests\b/i)
      expect(script, scriptName).not.toMatch(/FROM\s+(?:public\.)?delay_requests\b/i)
    }
  })

  it('keeps early RLS reconciliation from recreating or requiring retired task_delay_history', () => {
    const migration = readFileSync(
      join(serverRoot, 'migrations', '006a_reconcile_phase1_rls_prerequisites.sql'),
      'utf8',
    )

    const guardIndex = migration.indexOf("to_regclass('public.task_delay_history') IS NOT NULL")
    const guardedAlterIndex = migration.indexOf('ALTER TABLE public.task_delay_history')

    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(guardedAlterIndex).toBeGreaterThan(guardIndex)
    expect(migration).not.toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?task_delay_history\b/i)
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+task_delay_history\b/i)
  })

  it('keeps retired delay approval workflow channels out of runtime source and executable scripts', () => {
    const files = [
      'server/src',
      'client/src',
      'scripts',
    ]
      .flatMap(listFiles)
      .filter(isExecutableRuntimeSource)

    const forbiddenPatterns: Array<[string, RegExp]> = [
      ['old delay-requests API', /\/api\/delay-requests/],
      ['old delay-requests route', /\bdelay-requests\b/],
      ['old task-delays route', /\btask-delays\b/],
      ['old delayRequests service facade', /\bdelayRequests\b/],
      ['old task_delay_history table', /\btask_delay_history\b/],
      ['old delay_requests table', /\bdelay_requests\b/],
    ]
    const offenders: string[] = []

    for (const relativePath of files) {
      const source = readFileSync(join(repoRoot, relativePath), 'utf8')
      for (const [label, pattern] of forbiddenPatterns) {
        if (pattern.test(source)) {
          offenders.push(`${relativePath}: ${label}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
