import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const {
  evaluateRouteAggregationGuard,
  formatRouteAggregationGuardFailure,
} = await import('../../scripts/guard-route-aggregation.mjs')

const serverRoot = process.cwd().split(/[\\/]/).pop()?.toLowerCase() === 'server'
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const tempRoots: string[] = []

function createRouteFixture(source: string) {
  const root = join(tmpdir(), `route-aggregation-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const routeDir = join(root, 'src', 'routes')
  mkdirSync(routeDir, { recursive: true })
  writeFileSync(join(routeDir, 'sample.ts'), source)
  tempRoots.push(root)
  return routeDir
}

function createSingleFileFixture(relativePath: string, source: string) {
  const root = join(tmpdir(), `route-aggregation-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, source)
  tempRoots.push(root)
  return filePath
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('route aggregation guard', () => {
  it('blocks route-level filter length KPI aggregation without approval', () => {
    const routeDir = createRouteFixture(`
      export function handler(items: Array<{ status: string }>) {
        return {
          delayedTasks: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const result = evaluateRouteAggregationGuard(routeDir)

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'filter.length',
        line: 4,
      }),
    ])
    expect(formatRouteAggregationGuardFailure(result.violations, routeDir)).toContain('.filter')
  })

  it('blocks route-level counter loop KPI aggregation without approval', () => {
    const routeDir = createRouteFixture(`
      export function handler(items: Array<{ status: string }>) {
        let delayedTaskCount = 0
        for (const item of items) {
          if (item.status === 'delayed') delayedTaskCount += 1
        }
        return { delayedTaskCount }
      }
    `)

    const result = evaluateRouteAggregationGuard(routeDir)

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'counter-loop',
        line: 5,
      }),
    ])
    expect(formatRouteAggregationGuardFailure(result.violations, routeDir)).toContain('counter')
  })

  it('keeps non-metric request parsing filters outside the aggregation guard', () => {
    const routeDir = createRouteFixture(`
      export function handler(ids: string[]) {
        return ids.map((id) => id.trim()).filter(Boolean)
      }
    `)

    expect(evaluateRouteAggregationGuard(routeDir).violations).toEqual([])
  })

  it('blocks multiline route KPI aggregation without approval', () => {
    const routeDir = createRouteFixture(`
      export function handler(items: Array<{ status: string }>) {
        return {
          delayedTasks: items
            .filter((item) => item.status === 'delayed')
            .length,
        }
      }
    `)

    const result = evaluateRouteAggregationGuard(routeDir)

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'filter.length',
        line: 4,
      }),
    ])
  })

  it('allows explicitly approved route aggregation while keeping it visible in counts', () => {
    const routeDir = createRouteFixture(`
      export function handler(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- route-level-aggregation-approved
          delayedTasks: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const result = evaluateRouteAggregationGuard(routeDir)

    expect(result.violations).toEqual([])
    expect(result.total).toBe(1)
    expect(result.approved).toBe(1)
  })

  it('can scan a single selected service file for staged summary-service adoption', () => {
    const serviceFile = createSingleFileFixture('src/services/publicSummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        let delayedTaskCount = 0
        for (const item of items) {
          if (item.status === 'delayed') delayedTaskCount += 1
        }
        return { delayedTaskCount }
      }
    `)

    const result = evaluateRouteAggregationGuard(serviceFile)

    expect(result.files).toEqual([serviceFile])
    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'counter-loop',
        line: 5,
      }),
    ])
  })

  it('accepts a single .ts file path from the CLI', () => {
    const routeFile = createSingleFileFixture('src/routes/approved.ts', `
      export function handler(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- route-level-aggregation-approved
          delayedTaskCount: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const output = execFileSync(
      process.execPath,
      [resolve(serverRoot, 'scripts', 'guard-route-aggregation.mjs'), routeFile],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    )

    expect(output).toContain('scanned 1 route files')
    expect(output).toContain('1/1 aggregation sites approved')
  })

  it('supports custom approval marks for staged summary-service adoption', () => {
    const serviceFile = createSingleFileFixture('src/services/companySummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved
          delayedTaskCount: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const result = evaluateRouteAggregationGuard(serviceFile, {
      approvalMarks: ['summary-service-aggregation-approved'],
    })

    expect(result.violations).toEqual([])
    expect(result.total).toBe(1)
    expect(result.approved).toBe(1)
  })
})
