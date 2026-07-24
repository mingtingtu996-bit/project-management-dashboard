import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

const workspaceRoot = resolve(process.cwd().endsWith('server') ? join(process.cwd(), '..') : process.cwd())
const guardPath = resolve(workspaceRoot, 'server', 'scripts', 'guard-system-surface-ownership.mjs')

function writeFixtureFile(root: string, relativePath: string, source: string) {
  const fullPath = join(root, relativePath)
  mkdirSync(join(fullPath, '..'), { recursive: true })
  writeFileSync(fullPath, source)
}

describe('system surface ownership guard', () => {
  it('blocks new page and migration table surfaces that cannot be assigned to a v1.4.23.1 architecture unit', async () => {
    const { evaluateSystemSurfaceOwnershipGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-surface-unknown-'))

    writeFixtureFile(fixtureRoot, 'client/src/App.tsx', [
      "const Dashboard = lazy(() => import('@/pages/Dashboard'))",
      "const UnownedPortal = lazy(() => import('@/pages/UnownedPortal'))",
    ].join('\n'))
    writeFixtureFile(fixtureRoot, 'client/src/pages/Dashboard.tsx', 'export default function Dashboard() { return null }\n')
    writeFixtureFile(fixtureRoot, 'client/src/pages/UnownedPortal.tsx', 'export default function UnownedPortal() { return null }\n')
    writeFixtureFile(fixtureRoot, 'server/migrations/001_fixture.sql', [
      'CREATE TABLE IF NOT EXISTS tasks (id uuid);',
      'CREATE TABLE IF NOT EXISTS mystery_orbit_records (id uuid);',
      'CREATE VIEW mystery_orbit_rollup_view AS SELECT id FROM mystery_orbit_records;',
      'CREATE FUNCTION mystery_orbit_rollup() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;',
      'ALTER TABLE mystery_orbit_records ENABLE ROW LEVEL SECURITY;',
      'CREATE POLICY mystery_orbit_records_policy ON mystery_orbit_records FOR SELECT USING (true);',
    ].join('\n'))

    const result = evaluateSystemSurfaceOwnershipGuard(fixtureRoot)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'unassigned_surface', kind: 'page', id: 'UnownedPortal' }),
      expect.objectContaining({ reason: 'unassigned_surface', kind: 'table', id: 'mystery_orbit_records' }),
      expect.objectContaining({ reason: 'unassigned_surface', kind: 'view', id: 'mystery_orbit_rollup_view' }),
      expect.objectContaining({ reason: 'unassigned_surface', kind: 'function', id: 'mystery_orbit_rollup' }),
      expect.objectContaining({ reason: 'unassigned_surface', kind: 'rls', id: 'mystery_orbit_records_enable_row_level_security' }),
      expect.objectContaining({ reason: 'unassigned_surface', kind: 'policy', id: 'mystery_orbit_records_policy' }),
    ]))
  })

  it('blocks page surfaces whose lazy import target is missing', async () => {
    const { evaluateSystemSurfaceOwnershipGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-surface-missing-page-'))

    writeFixtureFile(fixtureRoot, 'client/src/App.tsx', "const Dashboard = lazy(() => import('@/pages/Dashboard'))\n")
    writeFixtureFile(fixtureRoot, 'server/migrations/001_fixture.sql', 'CREATE TABLE IF NOT EXISTS tasks (id uuid);\n')

    const result = evaluateSystemSurfaceOwnershipGuard(fixtureRoot)

    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'missing_page_import_target', kind: 'page', id: 'Dashboard' }),
    ]))
  })

  it('assigns DurationAssetsAdmin to learning governance without accepting unrelated admin pages', async () => {
    const { evaluateSystemSurfaceOwnershipGuard } = await import(pathToFileURL(guardPath).href)
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'workbuddy-system-surface-duration-assets-'))

    writeFixtureFile(fixtureRoot, 'client/src/App.tsx', [
      "const DurationAssetsAdmin = lazy(() => import('@/pages/DurationAssetsAdmin'))",
      "const UnownedAdminPortal = lazy(() => import('@/pages/UnownedAdminPortal'))",
    ].join('\n'))
    writeFixtureFile(fixtureRoot, 'client/src/pages/DurationAssetsAdmin.tsx', 'export default function DurationAssetsAdmin() { return null }\n')
    writeFixtureFile(fixtureRoot, 'client/src/pages/UnownedAdminPortal.tsx', 'export default function UnownedAdminPortal() { return null }\n')
    writeFixtureFile(fixtureRoot, 'server/migrations/001_fixture.sql', 'CREATE TABLE IF NOT EXISTS tasks (id uuid);\n')

    const result = evaluateSystemSurfaceOwnershipGuard(fixtureRoot)

    expect(result.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'page',
        id: 'DurationAssetsAdmin',
        assignment: expect.objectContaining({
          architectureUnit: '学习治理环',
          runtimeScope: 'governance',
        }),
      }),
    ]))
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'unassigned_surface', kind: 'page', id: 'UnownedAdminPortal' }),
    ]))
  })

  it('assigns all current client page and migration table surfaces', async () => {
    const { evaluateSystemSurfaceOwnershipGuard } = await import(pathToFileURL(guardPath).href)

    const result = evaluateSystemSurfaceOwnershipGuard(workspaceRoot)

    expect(result.violations).toEqual([])
    expect(result.pageCount).toBeGreaterThanOrEqual(20)
    expect(result.tableCount).toBeGreaterThanOrEqual(150)
    expect(result.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'page',
        id: 'Dashboard',
        assignment: expect.objectContaining({ architectureUnit: '主执行环：描述分析' }),
      }),
      expect.objectContaining({
        kind: 'page',
        id: 'BillingSettings',
        assignment: expect.objectContaining({
          architectureUnit: '底座：组织权限',
          runtimeScope: 'commercial_foundation',
        }),
      }),
      expect.objectContaining({
        kind: 'table',
        id: 'tasks',
        assignment: expect.objectContaining({ architectureUnit: '主执行环：执行事实' }),
      }),
      expect.objectContaining({
        kind: 'table',
        id: 'algorithm_asset_candidate_events',
        assignment: expect.objectContaining({ architectureUnit: '学习治理环' }),
      }),
      expect.objectContaining({
        kind: 'table',
        id: 'structured_cause_attributions',
        assignment: expect.objectContaining({ architectureUnit: '主执行环：描述分析' }),
      }),
    ]))
  })
})
