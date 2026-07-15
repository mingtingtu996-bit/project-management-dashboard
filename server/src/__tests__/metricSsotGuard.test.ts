import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const {
  evaluateMetricSsotGuard,
  formatMetricSsotGuardFailure,
} = await import('../../scripts/guard-metric-ssot.mjs')

const workspaceRoot = process.cwd().endsWith('server')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const tempRoots: string[] = []

function createMetricFixture(files: Record<string, string>) {
  const root = join(tmpdir(), `metric-ssot-guard-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  for (const [relativePath, source] of Object.entries(files)) {
    const fullPath = join(root, relativePath)
    mkdirSync(fullPath.slice(0, Math.max(fullPath.lastIndexOf('\\'), fullPath.lastIndexOf('/'))), { recursive: true })
    writeFileSync(fullPath, source)
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

describe('metric SSOT guard', () => {
  it('blocks metric_value snapshot keys that are not registered in the metric registry', () => {
    const root = createMetricFixture({
      'server/src/services/metricRegistryService.ts': `
        export const METRIC_REGISTRY = [
          { metricKey: 'overall_progress' },
        ]
      `,
      'server/src/services/projectDailySnapshotService.ts': `
        export function buildSnapshotRow() {
          return {
            metric_values: {
              overall_progress: 70,
              orphan_metric: 1,
            },
          }
        }
      `,
    })

    const result = evaluateMetricSsotGuard(root)

    expect(result.violations).toEqual([
      expect.objectContaining({
        metricKey: 'orphan_metric',
        surface: 'project_daily_snapshot.metric_values',
      }),
    ])
    expect(formatMetricSsotGuardFailure(result.violations, root)).toContain('orphan_metric')
  })

  it('blocks report metric options that are not registered in the metric registry', () => {
    const root = createMetricFixture({
      'server/src/services/metricRegistryService.ts': `
        export const METRIC_REGISTRY = [
          { metricKey: 'overall_progress' },
        ]
      `,
      'client/src/pages/Reports.tsx': `
        const DEFAULT_REPORT_METRIC_OPTIONS = [
          { value: 'overall_progress', label: 'Progress' },
          { value: 'rogue_report_metric', label: 'Rogue' },
        ]
      `,
    })

    const result = evaluateMetricSsotGuard(root)

    expect(result.violations).toEqual([
      expect.objectContaining({
        metricKey: 'rogue_report_metric',
        surface: 'reports.default_metric_options',
      }),
    ])
  })

  it('blocks dynamic metric route surfaces that do not validate against the metric registry', () => {
    const root = createMetricFixture({
      'server/src/services/metricRegistryService.ts': `
        export const METRIC_REGISTRY = [
          { metricKey: 'overall_progress' },
        ]
      `,
      'server/src/routes/metrics.ts': `
        export function validateMetricAndOptions(metric) {
          return { metric }
        }
      `,
      'server/src/services/metricRuntimePublicationService.ts': `
        import { isRegisteredMetric } from './metricRegistryService.js'
        export function validate(lineage) {
          return isRegisteredMetric(lineage.metricKey)
        }
      `,
      'server/src/services/companyTrendAnalyticsService.ts': `
        import { getMetricRegistryEntry } from './metricRegistryService.js'
        export function defaults(metric) {
          return getMetricRegistryEntry(metric)
        }
      `,
    })

    const result = evaluateMetricSsotGuard(root)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metricKey: 'isRegisteredMetric',
        surface: 'metrics.route_dynamic_metric_validation',
      }),
      expect.objectContaining({
        metricKey: 'getMetricRegistryEntry',
        surface: 'metrics.route_dynamic_metric_validation',
      }),
    ]))
  })

  it('allows registered snapshot, trend, and report metric keys', () => {
    const root = createMetricFixture({
      'server/src/services/metricRegistryService.ts': `
        export const METRIC_REGISTRY = [
          { metricKey: 'overall_progress' },
          { metricKey: 'health_score', deprecatedAliases: ['legacy_health_score'] },
        ]
      `,
      'server/src/services/projectDailySnapshotService.ts': `
        export function buildSnapshotRow() {
          return {
            metric_values: {
              overall_progress: 70,
              legacy_health_score: 82,
            },
          }
        }
      `,
      'server/src/services/projectTrendAnalyticsService.ts': `
        export function resolveTrendMetricValue(row, metric) {
          switch (metric) {
            case 'overall_progress':
              return row.overall_progress
            case 'health_score':
              return row.health_score
            default:
              return null
          }
        }
      `,
      'client/src/pages/Reports.tsx': `
        const DEFAULT_REPORT_METRIC_OPTIONS = [
          { value: 'overall_progress', label: 'Progress' },
          { value: 'health_score', label: 'Health' },
        ]
      `,
    })

    const result = evaluateMetricSsotGuard(root)

    expect(result.violations).toEqual([])
    expect(result.discovered.map((item) => item.metricKey)).toEqual(expect.arrayContaining([
      'overall_progress',
      'legacy_health_score',
      'health_score',
    ]))
  })

  it('keeps dynamic metric consumers wired through metric registry validation in the current codebase', () => {
    const result = evaluateMetricSsotGuard(workspaceRoot)

    expect(result.violations).toEqual([])
    expect(result.discovered.length).toBeGreaterThan(0)
  })
})
