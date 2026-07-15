import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const {
  evaluateLegacyScopeRuntimeSurfaceGuard,
  formatLegacyScopeRuntimeSurfaceGuardFailure,
} = await import('../../scripts/guard-legacy-scope-runtime-surface.mjs')

const tempRoots: string[] = []

function createFixture(files: Record<string, string>) {
  const root = join(
    tmpdir(),
    `legacy-scope-runtime-surface-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, source)
  }

  tempRoots.push(root)
  return root
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('legacy scope runtime surface guard', () => {
  it('allows sanctioned sanitizers, template preview stripping, tests, migrations, and new engineering-object fields', () => {
    const root = createFixture({
      'server/src/routes/tasks.ts': `
        export function readTask() {
          return {
            physical_zone_object_id: 'zone-a',
            functional_area_object_id: 'fa-1',
            required_scope_dimensions: ['floor'],
          }
        }
      `,
      'server/src/jobs/replay.ts': `
        export const replayMetadata = {
          inferred_scope_dimensions: ['zone'],
        }
      `,
      'server/src/services/legacyScopeObjectSanitizer.ts': `
        export const LEGACY_SCOPE_OBJECT_FIELDS = ['zone_object_id', 'scope_dimensions']
      `,
      'server/src/services/taskDtoService.ts': `
        export const FORBIDDEN_TASK_FIELDS = ['professional_object_id', 'legacy_object_type']
      `,
      'client/src/services/wbsTemplateGenerationApi.ts': `
        export const LEGACY_SCOPE_OBJECT_FIELDS = ['zone_object_id', 'project_scope_dimensions']
      `,
      'client/src/pages/GanttView.tsx': `
        export const task = {
          physical_zone_object_id: 'zone-b',
          functional_area_object_id: 'fa-2',
        }
      `,
      'server/migrations/224_drop_legacy_scope.sql': `
        DROP TABLE IF EXISTS public.scope_dimensions CASCADE;
      `,
      'client/src/services/__tests__/wbsTemplateGenerationApi.test.ts': `
        expect('scope_dimensions').toBe('scope_dimensions')
      `,
      'docs/plans/legacy-scope.md': `
        scope_dimensions
      `,
      'tmp/runtime-scope.md': `
        project_scope_dimensions
      `,
    })

    const result = evaluateLegacyScopeRuntimeSurfaceGuard(root)

    expect(result.violations).toEqual([])
  })

  it('fails when runtime routes or client surfaces reintroduce legacy scope fields or tables', () => {
    const root = createFixture({
      'server/src/index.ts': `
        app.use('/api/scope-dimensions', legacyScopeRouter)
      `,
      'server/src/routes/legacyScope.ts': `
        export async function readLegacyScope(supabase) {
          return supabase.from('scope_dimensions').select('id, zone_object_id')
        }
      `,
      'client/src/pages/LegacyScopePanel.tsx': `
        export const legacyColumns = ['professional_object_id', 'legacy_object_type']
      `,
      'client/src/lib/legacyScope.ts': `
        export const projectScopeTable = 'project_scope_dimensions'
      `,
    })

    const result = evaluateLegacyScopeRuntimeSurfaceGuard(root)

    expect(result.violations).toEqual([
      expect.objectContaining({
        token: 'scope_dimensions',
        file: 'server/src/routes/legacyScope.ts',
      }),
      expect.objectContaining({
        token: 'zone_object_id',
        file: 'server/src/routes/legacyScope.ts',
      }),
      expect.objectContaining({
        token: '/api/scope-dimensions',
        file: 'server/src/index.ts',
      }),
      expect.objectContaining({
        token: 'professional_object_id',
        file: 'client/src/pages/LegacyScopePanel.tsx',
      }),
      expect.objectContaining({
        token: 'legacy_object_type',
        file: 'client/src/pages/LegacyScopePanel.tsx',
      }),
      expect.objectContaining({
        token: 'project_scope_dimensions',
        file: 'client/src/lib/legacyScope.ts',
      }),
    ])
    expect(formatLegacyScopeRuntimeSurfaceGuardFailure(result.violations)).toContain(
      'physical_zone_object_id / functional_area_object_id',
    )
  })
})
