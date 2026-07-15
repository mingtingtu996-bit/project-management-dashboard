import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

const serverRoot = resolve(process.cwd().endsWith('server') ? process.cwd() : join(process.cwd(), 'server'))
const guardPath = resolve(serverRoot, 'scripts', 'guard-construction-organization-selector-hydration.mjs')
const tempRoots: string[] = []

function createFixture(files: Record<string, string>) {
  const root = join(tmpdir(), 'tmp', `construction-org-hydration-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = join(root, relativePath)
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, source)
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

describe('construction organization selector hydration guard', () => {
  it('blocks production selector calls that bypass project fact hydration', async () => {
    const { evaluateConstructionOrganizationSelectorHydrationGuard } = await import(pathToFileURL(guardPath).href)
    const root = createFixture({
      'src/routes/projectWizard.ts': `
        import { selectConstructionOrganizationScenario } from '../services/constructionOrganizationScenarioSelector.js'

        export function preview(facts: { businessType?: string }) {
          return selectConstructionOrganizationScenario({ businessType: facts.businessType })
        }
      `,
    })

    const result = evaluateConstructionOrganizationSelectorHydrationGuard(root)

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'missing_project_fact_hydration',
        file: expect.stringContaining('projectWizard.ts'),
        callLine: 5,
      }),
    ])
  })

  it('allows direct and nearby hydrated selector calls', async () => {
    const { evaluateConstructionOrganizationSelectorHydrationGuard } = await import(pathToFileURL(guardPath).href)
    const root = createFixture({
      'src/routes/projectWizard.ts': `
        import {
          buildConstructionOrganizationSelectorInputFromProjectFacts,
          selectConstructionOrganizationScenario,
        } from '../services/constructionOrganizationScenarioSelector.js'

        export function preview(facts: unknown) {
          return selectConstructionOrganizationScenario(buildConstructionOrganizationSelectorInputFromProjectFacts(facts))
        }
      `,
      'src/services/scheduleAccelerationService.ts': `
        import {
          buildConstructionOrganizationSelectorInputFromProjectFacts,
          selectConstructionOrganizationScenario,
        } from './constructionOrganizationScenarioSelector.js'

        export function derive(facts: unknown) {
          const selectorInput = buildConstructionOrganizationSelectorInputFromProjectFacts(facts)
          return selectConstructionOrganizationScenario(selectorInput)
        }
      `,
    })

    expect(evaluateConstructionOrganizationSelectorHydrationGuard(root).violations).toEqual([])
  })

  it('keeps the current production source on the shared wizard-fact hydration entry', async () => {
    const { evaluateConstructionOrganizationSelectorHydrationGuard } = await import(pathToFileURL(guardPath).href)

    expect(evaluateConstructionOrganizationSelectorHydrationGuard(serverRoot).violations).toEqual([])
  })
})
