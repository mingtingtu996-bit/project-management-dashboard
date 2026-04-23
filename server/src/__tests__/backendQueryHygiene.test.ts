import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const selectStarProtectedFiles = [
  ['src', 'services', 'acceptanceFlowService.ts'],
  ['src', 'routes', 'pre-milestones.ts'],
  ['src', 'routes', 'acceptance-plans.ts'],
  ['src', 'routes', 'acceptance-nodes.ts'],
  ['src', 'routes', 'construction-drawings.ts'],
  ['src', 'routes', 'drawing-packages.ts'],
  ['src', 'routes', 'wbs-templates.ts'],
] as const

const loggerProtectedFiles = [
  ['src', 'index.ts'],
  ...selectStarProtectedFiles,
] as const

function readServerFile(...segments: readonly string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('backend query hygiene', () => {
  it('keeps hot-path SQL readers free from SELECT *', () => {
    for (const segments of selectStarProtectedFiles) {
      const source = readServerFile(...segments)
      expect(source, segments.join('/')).not.toContain('SELECT *')
    }
  })

  it('loads drawing package rows from live columns instead of the legacy drawing_type field', () => {
    const source = readServerFile('src', 'routes', 'drawing-packages.ts')

    expect(source).toContain('NULL AS drawing_type')
    expect(source).not.toContain('DRAWING_PACKAGE_COLUMNS')
  })

  it('keeps startup and hot-path modules on logger instead of console', () => {
    for (const segments of loggerProtectedFiles) {
      const source = readServerFile(...segments)
      expect(source, segments.join('/')).not.toContain('console.')
    }
  })
})
