import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function sourcePath(relativePath: string) {
  return join(clientRoot, relativePath)
}

function readSource(relativePath: string) {
  return readFileSync(sourcePath(relativePath), 'utf8')
}

describe('PlanningWorkspace retirement contract', () => {
  it('removes PlanningWorkspace from the application route graph', () => {
    const appSource = readSource('src/App.tsx')

    expect(appSource).not.toMatch(/import\(['"]@\/pages\/planning\/PlanningWorkspace['"]\)/)
    expect(appSource).not.toMatch(/<PlanningWorkspace\b/)
    expect(appSource).not.toMatch(/path=["']planning\/\*["']/)
  })

  it('redirects the explicit planning root to the baseline page', () => {
    const appSource = readSource('src/App.tsx')

    expect(appSource).toContain(
      '<Route path="planning" element={<Navigate to="baseline" replace />} />',
    )
  })

  it('retires the legacy workspace and its workspace-only governance panels', () => {
    const retiredSources = [
      'src/pages/planning/PlanningWorkspace.tsx',
      'src/pages/planning/components/PlanningGovernanceBanner.tsx',
      'src/pages/planning/components/PlanningHealthPanel.tsx',
      'src/pages/planning/components/PlanningIntegrityPanel.tsx',
      'src/pages/planning/components/PlanningAnomalyPanel.tsx',
    ]

    const remainingSources = retiredSources.filter((relativePath) =>
      existsSync(sourcePath(relativePath)),
    )

    expect(remainingSources).toEqual([])
  })

  it('retains the shared planning layout under its product-neutral name', () => {
    const layoutPath = 'src/components/planning/PlanningPageLayout.tsx'
    const consumers = [
      'src/pages/planning/BaselinePage.tsx',
      'src/pages/planning/MonthlyPlanPage.tsx',
      'src/pages/planning/CloseoutPage.tsx',
    ]

    expect(existsSync(sourcePath(layoutPath)), layoutPath).toBe(true)
    expect(readSource(layoutPath)).toContain('export function PlanningPageLayout')
    expect(
      existsSync(sourcePath('src/components/planning/PlanningWorkspaceLayers.tsx')),
      'the legacy layout filename should be retired, not the shared layout itself',
    ).toBe(false)

    for (const consumer of consumers) {
      const source = readSource(consumer)
      expect(source, consumer).toContain('@/components/planning/PlanningPageLayout')
      expect(source, consumer).toContain('<PlanningPageLayout')
    }
  })
})
