import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const {
  evaluateSummaryServiceAggregationGuard,
} = await import('../../scripts/guard-summary-service-aggregation.mjs')

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()
const summaryServiceAggregationGuardCliPath = resolve(
  workspaceRoot,
  'server',
  'scripts',
  'guard-summary-service-aggregation.mjs',
)

const tempRoots: string[] = []

function createServiceFixture(relativePath: string, source: string) {
  const root = join(tmpdir(), `summary-service-aggregation-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`)
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

describe('summary service aggregation guard', () => {
  it('scans staged public summary services with the service-specific approval mark', () => {
    const { root, filePath } = createServiceFixture('server/src/services/companySummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          delayedTaskCount: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const result = evaluateSummaryServiceAggregationGuard(root, [filePath])

    expect(result.files).toEqual([filePath])
    expect(result.violations).toEqual([])
    expect(result.total).toBe(1)
    expect(result.approved).toBe(1)
  })

  it('resolves default staged summary service files from a repository root', () => {
    const { root, filePath: companyFilePath } = createServiceFixture('server/src/services/companySummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          delayedTaskCount: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)
    const projectExecutionFilePath = join(root, 'server', 'src', 'services', 'projectExecutionSummaryService.ts')
    writeFileSync(projectExecutionFilePath, `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          overdueTaskCount: items.filter((item) => item.status === 'overdue').length,
        }
      }
    `)
    const taskSummaryFilePath = join(root, 'server', 'src', 'services', 'taskSummaryService.ts')
    writeFileSync(taskSummaryFilePath, `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          completedTaskCount: items.filter((item) => item.status === 'completed').length,
        }
      }
    `)
    const projectTrendFilePath = join(root, 'server', 'src', 'services', 'projectTrendAnalyticsService.ts')
    writeFileSync(projectTrendFilePath, `
      export function summarize(items: Array<{ status: string }>) {
        return items.map((item) => item.status)
      }
    `)
    const riskStatisticsFilePath = join(root, 'server', 'src', 'services', 'riskStatisticsService.ts')
    writeFileSync(riskStatisticsFilePath, `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          criticalRiskCount: items.filter((item) => item.status === 'critical').length,
        }
      }
    `)
    const responsibilityInsightFilePath = join(root, 'server', 'src', 'services', 'responsibilityInsightService.ts')
    writeFileSync(responsibilityInsightFilePath, `
      export function summarize(items: Array<{ status: string }>) {
        let delayedTaskCount = 0
        for (const item of items) {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          if (item.status === 'delayed') delayedTaskCount += 1
        }
        return { delayedTaskCount }
      }
    `)

    const result = evaluateSummaryServiceAggregationGuard(root)

    expect(result.files).toEqual([
      companyFilePath,
      projectExecutionFilePath,
      taskSummaryFilePath,
      projectTrendFilePath,
      riskStatisticsFilePath,
      responsibilityInsightFilePath,
    ])
    expect(result.violations).toEqual([])
    expect(result.total).toBe(5)
    expect(result.approved).toBe(5)
  })

  it('auto-discovers public summary and analytics services added after the initial staged list', () => {
    const { root, filePath } = createServiceFixture('server/src/services/companySummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        return items.map((item) => item.status)
      }
    `)
    const analyticsFilePath = join(root, 'server', 'src', 'services', 'companyPortfolioAnalyticsService.ts')
    writeFileSync(analyticsFilePath, `
      export function summarizePortfolio(items: Array<{ status: string }>) {
        return {
          delayedProjectCount: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const result = evaluateSummaryServiceAggregationGuard(root)

    expect(result.files).toEqual(expect.arrayContaining([filePath, analyticsFilePath]))
    expect(result.violations).toEqual([
      expect.objectContaining({
        filePath: analyticsFilePath,
        kind: 'filter.length',
        line: 4,
      }),
    ])
  })

  it('auto-discovers readiness and workbench summary surfaces beyond analytics naming', () => {
    const { root, filePath } = createServiceFixture('server/src/services/companySummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        return items.map((item) => item.status)
      }
    `)
    const readinessFilePath = join(root, 'server', 'src', 'services', 'ruleAssetWorkbenchReadinessService.ts')
    writeFileSync(readinessFilePath, `
      export function summarizeReadiness(gates: Array<{ status: string }>) {
        return {
          readyGateCount: gates.filter((item) => item.status === 'ready').length,
        }
      }
    `)

    const result = evaluateSummaryServiceAggregationGuard(root)

    expect(result.files).toEqual(expect.arrayContaining([filePath, readinessFilePath]))
    expect(result.violations).toEqual([
      expect.objectContaining({
        filePath: readinessFilePath,
        kind: 'filter.length',
        line: 4,
      }),
    ])
  })

  it('blocks multiline summary-service KPI aggregation without approval', () => {
    const { root, filePath } = createServiceFixture('server/src/services/companySummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        return {
          delayedTaskCount: items
            .filter((item) => item.status === 'delayed')
            .length,
        }
      }
    `)

    const result = evaluateSummaryServiceAggregationGuard(root, [filePath])

    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'filter.length',
        line: 4,
      }),
    ])
  })

  it('requires approved summary-service aggregations to declare an SSOT source marker', () => {
    const { root, filePath } = createServiceFixture('server/src/services/projectExecutionSummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved
          delayedTaskCount: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const missingSsotResult = evaluateSummaryServiceAggregationGuard(root, [filePath])

    expect(missingSsotResult.violations).toEqual([
      expect.objectContaining({
        filePath,
        kind: 'filter.length',
        line: 5,
      }),
    ])

    writeFileSync(filePath, `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          delayedTaskCount: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const approvedResult = evaluateSummaryServiceAggregationGuard(root, [filePath])

    expect(approvedResult.violations).toEqual([])
    expect(approvedResult.approved).toBe(1)
  })

  it('blocks unapproved staged public summary service aggregation', () => {
    const { root, filePath } = createServiceFixture('server/src/services/companySummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        let delayedTaskCount = 0
        for (const item of items) {
          if (item.status === 'delayed') delayedTaskCount += 1
        }
        return { delayedTaskCount }
      }
    `)

    const result = evaluateSummaryServiceAggregationGuard(root, [filePath])

    expect(result.files).toEqual([filePath])
    expect(result.violations).toEqual([
      expect.objectContaining({
        kind: 'counter-loop',
        line: 5,
      }),
    ])
  })

  it('accepts a single staged summary service file path from the CLI', () => {
    const { filePath } = createServiceFixture('server/src/services/projectExecutionSummaryService.ts', `
      export function summarize(items: Array<{ status: string }>) {
        return {
          // eslint-disable-next-line -- summary-service-aggregation-approved; ssot: service-owned-summary
          delayedTaskCount: items.filter((item) => item.status === 'delayed').length,
        }
      }
    `)

    const output = execFileSync(
      process.execPath,
      [summaryServiceAggregationGuardCliPath, filePath],
      {
        cwd: workspaceRoot,
        encoding: 'utf8',
      },
    )

    expect(output).toContain('scanned 1 summary service files')
    expect(output).toContain('1/1 aggregation sites approved')
  })
})
