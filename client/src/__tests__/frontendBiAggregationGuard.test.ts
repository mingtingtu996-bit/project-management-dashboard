import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

type FrontendBiAggregationViolation = {
  kind: string
  line: number
}

type FrontendBiAggregationGuardResult = {
  files: string[]
  total: number
  approved: number
  violations: FrontendBiAggregationViolation[]
}

// @ts-expect-error Vitest loads this repository script at runtime; the .mjs script is covered by focused guard tests.
const frontendBiAggregationGuardModule = await import('../../scripts/guard-frontend-bi-aggregation.mjs')
const { evaluateFrontendBiAggregationGuard } = frontendBiAggregationGuardModule as {
  evaluateFrontendBiAggregationGuard: (root: string, files?: string[]) => FrontendBiAggregationGuardResult
}

const tempRoots: string[] = []
const workspaceRoot = basename(process.cwd()) === 'client'
  ? resolve(process.cwd(), '..')
  : process.cwd()
const guardCliPath = resolve(workspaceRoot, 'client', 'scripts', 'guard-frontend-bi-aggregation.mjs')

function createFrontendFixture(relativePath: string, source: string) {
  const root = join(tmpdir(), `frontend-bi-aggregation-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const filePath = join(root, relativePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, source)
  tempRoots.push(root)
  return { root, filePath }
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe('frontend BI aggregation guard', () => {
  it('blocks unapproved frontend KPI filter length aggregation', () => {
    const { root, filePath } = createFrontendFixture('client/src/pages/Dashboard.tsx', `
      export function Dashboard({ rows }: { rows: Array<{ delayed: boolean }> }) {
        const delayedTaskCount = rows.filter((row) => row.delayed).length
        return <span>{delayedTaskCount}</span>
      }
    `)

    const result = evaluateFrontendBiAggregationGuard(root, [filePath])

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'filter.length',
        line: 3,
      }),
    ])
  })

  it('blocks unapproved frontend reduce, Set.size, and counter loop aggregations', () => {
    const { root, filePath } = createFrontendFixture('client/src/pages/TaskSummary.tsx', `
      export function TaskSummary({ rows }: { rows: Array<{ delayed: boolean; taskId: string }> }) {
        const delayedTaskCount = rows.reduce((sum, row) => sum + (row.delayed ? 1 : 0), 0)
        const taskCount = new Set(rows.map((row) => row.taskId)).size
        let overdueWarningCount = 0
        for (const row of rows) {
          if (row.delayed) overdueWarningCount += 1
        }
        return <span>{delayedTaskCount + taskCount + overdueWarningCount}</span>
      }
    `)

    const result = evaluateFrontendBiAggregationGuard(root, [filePath])

    expect(result.violations.map((violation) => violation.kind)).toEqual([
      'reduce',
      'set.size',
      'counter-loop',
    ])
  })

  it('allows explicitly approved frontend aggregation while keeping it visible in counts', () => {
    const { root, filePath } = createFrontendFixture('client/src/pages/CompanyCockpit.tsx', `
      export function CompanyCockpit({ rows }: { rows: Array<{ unread: number }> }) {
        // eslint-disable-next-line -- frontend-bi-aggregation-approved
        const totalUnreadWarnings = rows.reduce((sum, row) => sum + row.unread, 0)
        return <span>{totalUnreadWarnings}</span>
      }
    `)

    const result = evaluateFrontendBiAggregationGuard(root, [filePath])

    expect(result.violations).toEqual([])
    expect(result.total).toBe(1)
    expect(result.approved).toBe(1)
  })

  it('keeps non-metric UI filtering outside the aggregation guard', () => {
    const { root, filePath } = createFrontendFixture('client/src/pages/Reports.tsx', `
      export function Reports({ tabs }: { tabs: Array<{ visible: boolean }> }) {
        return tabs.filter((tab) => tab.visible).map((tab) => <span>{String(tab.visible)}</span>)
      }
    `)

    const result = evaluateFrontendBiAggregationGuard(root, [filePath])

    expect(result.violations).toEqual([])
  })

  it('blocks multiline frontend BI aggregation without approval', () => {
    const { root, filePath } = createFrontendFixture('client/src/pages/Dashboard.tsx', `
      export function Dashboard({ rows }: { rows: Array<{ delayed: boolean }> }) {
        const delayedTaskCount = rows
          .filter((row) => row.delayed)
          .length
        return <span>{delayedTaskCount}</span>
      }
    `)

    const result = evaluateFrontendBiAggregationGuard(root, [filePath])

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'filter.length',
        line: 3,
      }),
    ])
  })

  it('accepts a single .tsx file path from the CLI', () => {
    const { filePath } = createFrontendFixture('client/src/pages/Dashboard.tsx', `
      export function Dashboard({ rows }: { rows: Array<{ delayed: boolean }> }) {
        return {
          // eslint-disable-next-line -- frontend-bi-aggregation-approved
          delayedTaskCount: rows.filter((row) => row.delayed).length,
        }
      }
    `)

    const output = execFileSync(
      process.execPath,
      [guardCliPath, filePath],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    )

    expect(output).toContain('scanned 1 frontend BI files')
    expect(output).toContain('1/1 aggregation sites approved')
  })

  it('runs the default CLI scope from the client workspace directory', () => {
    const root = join(tmpdir(), `frontend-bi-default-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    const appPath = join(root, 'client/src/App.tsx')
    const dashboardPath = join(root, 'client/src/pages/Dashboard.tsx')
    const clientWorkspacePath = join(root, 'client')
    mkdirSync(dirname(appPath), { recursive: true })
    mkdirSync(dirname(dashboardPath), { recursive: true })
    writeFileSync(appPath, `
      import { lazy } from 'react'

      const Dashboard = lazy(() => import('@/pages/Dashboard'))

      export function App() {
        return <Dashboard />
      }
    `)
    writeFileSync(dashboardPath, `
      export function Dashboard({ rows }: { rows: Array<{ delayed: boolean }> }) {
        return {
          // eslint-disable-next-line -- frontend-bi-aggregation-approved
          delayedTaskCount: rows.filter((row) => row.delayed).length,
        }
      }
    `)
    tempRoots.push(root)

    const output = execFileSync(
      process.execPath,
      [guardCliPath],
      {
        cwd: clientWorkspacePath,
        encoding: 'utf8',
      },
    )

    expect(output).toContain('frontend BI files')
    expect(output).toContain('aggregation sites approved')
  })

  it('includes admin and workspace workbench consumers in the default scope', () => {
    const result = evaluateFrontendBiAggregationGuard(process.cwd())

    expect(result.files.map((file) => file.replace(/\\/g, '/'))).toEqual(expect.arrayContaining([
      expect.stringContaining('client/src/pages/RuleAssetGovernanceWorkbenchAdmin.tsx'),
      expect.stringContaining('client/src/pages/WorkspacePage.tsx'),
      expect.stringContaining('client/src/pages/workspace/WorkspaceSections.tsx'),
      expect.stringContaining('client/src/pages/Materials.tsx'),
      expect.stringContaining('client/src/pages/Drawings/DrawingsPage.tsx'),
      expect.stringContaining('client/src/pages/AcceptanceTimeline.tsx'),
      expect.stringContaining('client/src/pages/DurationAccuracyAdmin.tsx'),
      expect.stringContaining('client/src/pages/Notifications.tsx'),
      expect.stringContaining('client/src/pages/Milestones.tsx'),
      expect.stringContaining('client/src/pages/PreMilestones.tsx'),
      expect.stringContaining('client/src/pages/planning/MonthlyPlanPage.tsx'),
    ]))
  })

  it('auto-discovers BI-like route consumers from App lazy route imports', () => {
    const root = join(tmpdir(), `frontend-bi-route-discovery-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    const appPath = join(root, 'client/src/App.tsx')
    const pagePath = join(root, 'client/src/pages/RiskInsights.tsx')
    mkdirSync(dirname(appPath), { recursive: true })
    mkdirSync(dirname(pagePath), { recursive: true })
    writeFileSync(appPath, `
      import { lazy } from 'react'
      import { Route, Routes } from 'react-router-dom'

      const RiskInsights = lazy(() => import('@/pages/RiskInsights'))

      export function App() {
        return (
          <Routes>
            <Route path="/projects/:id/risk-insights" element={<RiskInsights />} />
          </Routes>
        )
      }
    `)
    writeFileSync(pagePath, `
      export function RiskInsights({ rows }: { rows: Array<{ delayed: boolean }> }) {
        // eslint-disable-next-line -- frontend-bi-aggregation-approved
        const delayedRiskCount = rows.filter((row) => row.delayed).length
        return <span>{delayedRiskCount}</span>
      }
    `)
    tempRoots.push(root)

    const result = evaluateFrontendBiAggregationGuard(root)

    expect(result.files.map((file) => file.replace(/\\/g, '/'))).toContain(
      pagePath.replace(/\\/g, '/'),
    )
    expect(result.total).toBe(1)
    expect(result.approved).toBe(1)
  })
})
