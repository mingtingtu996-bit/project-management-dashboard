import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('\\server') ? process.cwd() : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('scope dimensions contract', () => {
  it('keeps region in the shared route and adds dictionary POST/DELETE endpoints', () => {
    const migration = readServerFile('migrations', '067_create_scope_dimensions_tables.sql')
    const routeSource = readServerFile('src', 'routes', 'scope-dimensions.ts')

    expect(migration).toContain("('region', '一区'")
    expect(routeSource).toContain("const SCOPE_KEYS: ScopeDimensionKey[] = ['building', 'specialty', 'phase', 'region']")
    expect(routeSource).toContain('router.post(')
    expect(routeSource).toContain('router.delete(')
    expect(routeSource).toContain('region: normalizeLabels')
  })

  it('seeds default dictionary rows without rewriting existing row ids', () => {
    const routeSource = readServerFile('src', 'routes', 'scope-dimensions.ts')
    const ensureDefaultSource = routeSource.slice(
      routeSource.indexOf('async function ensureDefaultScopeRows()'),
      routeSource.indexOf('async function loadScopeDictionary()'),
    )

    expect(ensureDefaultSource).toContain("onConflict: 'dimension_key,label', ignoreDuplicates: true")
    expect(ensureDefaultSource).not.toContain('id: uuidv4()')
  })
})
