import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { V14231_READINESS_ROUTE_METADATA } from '@/config/v14231ReadinessRoutes'

function readClientSource(relativePath: string) {
  const candidates = [
    join(process.cwd(), relativePath),
    join(process.cwd(), 'client', relativePath),
  ]

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8')
    } catch {
      // Keep trying the alternate workspace root.
    }
  }

  throw new Error(`Unable to locate ${relativePath}`)
}

describe('v1.4.23.1 C-13 page readiness boundary coverage', () => {
  it('keeps every registered consumption route wired to the runtime boundary', () => {
    const appSource = readClientSource('src/App.tsx')

    for (const item of V14231_READINESS_ROUTE_METADATA) {
      expect(appSource).toContain(`const ${item.componentName}`)
      expect(appSource).toContain(`import('${item.importPath}')`)
      expect(appSource).toContain(`path="${item.routePath}"`)

      const source = readClientSource(item.sourcePath)

      if (item.readinessBinding === 'page-boundary') {
        expect(source).toContain('V14231PageReadinessBoundary')
        expect(source).toContain(`pageKey="${item.pageKey}"`)
      } else if (item.readinessBinding === 'domain-data-status') {
        expect(source).toContain('duration-accuracy-data-status')
        expect(source).not.toContain('V14231PageReadinessBoundary')
      } else {
        expect(source).toContain('workspace-normal')
        expect(source).not.toContain('V14231PageReadinessBoundary')
      }
    }
  })
})
