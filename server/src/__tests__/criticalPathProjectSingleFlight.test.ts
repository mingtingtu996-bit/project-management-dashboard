import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readService() {
  return readFileSync(resolve(serverRoot, 'src', 'services', 'projectCriticalPathService.ts'), 'utf8')
}

describe('critical path project single-flight guard', () => {
  it('deduplicates project-level recalculation entrypoints before CPM projection writes', () => {
    const source = readService()
    const exportedFunction = source.slice(
      source.indexOf('export async function recalculateProjectCriticalPath'),
      source.indexOf('export async function refreshActiveProjectCriticalPathSnapshots'),
    )

    expect(source).toContain('criticalPathRecalculationByProject')
    expect(source).toContain('async function recalculateProjectCriticalPathInternal')
    expect(exportedFunction).toContain('criticalPathRecalculationByProject.get(projectId)')
    expect(exportedFunction).toContain('criticalPathRecalculationByProject.set(projectId, recalculation)')
    expect(exportedFunction).toContain('criticalPathRecalculationByProject.delete(projectId)')
    expect(exportedFunction.indexOf('criticalPathRecalculationByProject.set')).toBeLessThan(
      exportedFunction.indexOf('return await recalculation'),
    )
  })

  it('takes a project-scoped PostgreSQL advisory lock for cross-process recalculations', () => {
    const source = readService()
    const exportedFunction = source.slice(
      source.indexOf('export async function recalculateProjectCriticalPath'),
      source.indexOf('export async function refreshActiveProjectCriticalPathSnapshots'),
    )

    expect(source).toContain('getClient')
    expect(source).toContain('runWithCriticalPathProjectLease')
    expect(source).toContain('pg_advisory_lock')
    expect(source).toContain('pg_advisory_unlock')
    expect(source).toContain("'workbuddy_critical_path_project'")
    expect(exportedFunction).toContain('runWithCriticalPathProjectLease(projectId')
    expect(exportedFunction.indexOf('criticalPathRecalculationByProject.set')).toBeLessThan(
      exportedFunction.indexOf('return await recalculation'),
    )
  })

  it('serves read-only critical-path snapshots from the full snapshot cache before rebuilding', () => {
    const source = readService()
    const exportedFunction = source.slice(
      source.indexOf('export async function getProjectCriticalPathSnapshot'),
      source.indexOf('async function loadCriticalPathDependencyRows'),
    )

    expect(source).toContain('clearProjectCriticalPathSnapshotCache')
    expect(exportedFunction).toContain('getCachedCriticalPathSnapshot(projectId)')
    expect(exportedFunction.indexOf('getCachedCriticalPathSnapshot(projectId)')).toBeLessThan(
      exportedFunction.indexOf('loadCriticalPathTaskRows(projectId)'),
    )
    expect(exportedFunction).toContain('if (cached) return cached')
  })
})
