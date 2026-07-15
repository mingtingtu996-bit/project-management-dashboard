import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const {
  evaluateServerRawDateMathGuard,
  formatServerRawDateMathGuardFailure,
} = await import('../../scripts/guard-server-raw-date-math.mjs')

const tempRoots: string[] = []

function createServerFixture(files: Record<string, string>) {
  const root = join(tmpdir(), `server-raw-date-math-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const srcDir = join(root, 'src')
  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(srcDir, relativePath)
    mkdirSync(fullPath.slice(0, fullPath.lastIndexOf('\\') > -1 ? fullPath.lastIndexOf('\\') : fullPath.lastIndexOf('/')), { recursive: true })
    writeFileSync(fullPath, source)
  }
  tempRoots.push(root)
  return srcDir
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('server raw date math guard', () => {
  it('blocks business services from using raw millisecond day thresholds', () => {
    const srcDir = createServerFixture({
      'services/riskIssueWarningGovernanceService.ts': `
        export function threshold(days: number) {
          return new Date(Date.now() - days * 86400000).toISOString()
        }
      `,
    })

    const result = evaluateServerRawDateMathGuard(srcDir)

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'raw-day-ms',
        line: 3,
      }),
    ])
    expect(formatServerRawDateMathGuardFailure(result.violations, srcDir)).toContain('86400000')
  })

  it('allows shared duration utilities and scheduler cadence files', () => {
    const srcDir = createServerFixture({
      'utils/durationDays.ts': `
        const DAY_MS = 86_400_000
        export function inclusive(start: Date, end: Date) {
          return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1
        }
      `,
      'jobs/exampleJob.ts': `
        const DAY_IN_MS = 24 * 60 * 60 * 1000
        export function nextRun(startedAt: Date) {
          return new Date(startedAt.getTime() + DAY_IN_MS)
        }
      `,
    })

    const result = evaluateServerRawDateMathGuard(srcDir)

    expect(result.violations).toEqual([])
    expect(result.allowed).toBe(4)
    expect(result.total).toBe(4)
  })

  it('ignores tests while still scanning route and service code', () => {
    const srcDir = createServerFixture({
      '__tests__/fixture.test.ts': `
        const tomorrow = new Date(Date.now() + 86400000)
      `,
      'routes/reports.ts': `
        export function sort(left: Date, right: Date) {
          return left.getTime() - right.getTime()
        }
      `,
    })

    const result = evaluateServerRawDateMathGuard(srcDir)

    expect(result.files.length).toBe(1)
    expect(result.violations).toEqual([])
  })
})
