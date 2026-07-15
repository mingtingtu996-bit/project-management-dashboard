import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ENGINEERING_OBJECT_TYPES } from '../types/db.js'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server') ? process.cwd() : resolve(process.cwd(), 'server')
const repoRoot = resolve(serverRoot, '..')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

function collectScriptFiles(root: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(root)) {
    const fullPath = resolve(root, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...collectScriptFiles(fullPath))
      continue
    }
    if (/\.(?:mjs|cjs|js|ts|tsx)$/.test(entry)) {
      files.push(fullPath)
    }
  }
  return files
}

describe('scope dimensions contract (v1.4.22.1 final engineering objects)', () => {
  it('removes the old scope-dimensions route and keeps engineering-objects as the range-tree API', () => {
    expect(existsSync(resolve(serverRoot, 'src', 'routes', 'scope-dimensions.ts'))).toBe(false)
    expect(readServerFile('src', 'index.ts')).not.toContain('/api/scope-dimensions')
    expect(readServerFile('src', 'index.ts')).toContain('/api/engineering-objects')
  })

  it('uses the seven final engineering object types through the shared db.ts constant', () => {
    expect([...ENGINEERING_OBJECT_TYPES]).toEqual([
      'phase',
      'section',
      'building',
      'basement',
      'floor',
      'physical_zone',
      'functional_area',
    ])

    const routeSource = readServerFile('src', 'routes', 'engineering-objects.ts')
    expect(routeSource).toContain('ENGINEERING_OBJECT_TYPES')
    expect(routeSource).not.toContain('const VALID_ENGINEERING_OBJECT_TYPES = [')
    expect(routeSource).not.toContain("'zone'")
    expect(routeSource).not.toContain("'professional'")
    expect(routeSource).not.toContain("'subproject'")
  })

  it('does not keep executable script adapters for the deleted scope-dimensions channel', () => {
    const scriptRoot = resolve(repoRoot, 'scripts')
    const forbiddenPatterns: Array<[string, RegExp]> = [
      ['old scope-dimensions API', /\/api\/scope-dimensions/],
      ['old scope_dimensions table', /\bscope_dimensions\b/],
      ['old project_scope_dimensions table', /\bproject_scope_dimensions\b/],
    ]
    const offenders: string[] = []

    for (const filePath of collectScriptFiles(scriptRoot)) {
      const content = readFileSync(filePath, 'utf8')
      for (const [label, pattern] of forbiddenPatterns) {
        if (pattern.test(content)) {
          offenders.push(`${filePath.replace(repoRoot, '')}: ${label}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
