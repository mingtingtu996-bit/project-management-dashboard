import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readRouteSource() {
  return readFileSync(resolve(process.cwd(), 'src', 'routes', 'drawing-packages.ts'), 'utf8')
}

describe('drawing package linked-context query contracts', () => {
  it('keeps UUID package ids separate from string package codes when querying linked rows', () => {
    const source = readRouteSource()

    expect(source).toContain('const taskPackageIds = uniqueNonEmpty([input.packageId])')
    expect(source).toContain('const taskPackageCodes = uniqueNonEmpty([input.packageCode])')
    expect(source).toContain('const requirementPackageIds = uniqueNonEmpty([input.packageId])')
    expect(source).toContain("WHERE project_id = ? AND drawing_package_id IN (${buildSqlPlaceholders(taskPackageIds.length)})")
    expect(source).toContain("WHERE project_id = ? AND drawing_package_code IN (${buildSqlPlaceholders(taskPackageCodes.length)})")
    expect(source).toContain("WHERE project_id = ? AND drawing_package_id IN (${buildSqlPlaceholders(requirementPackageIds.length)})")
    expect(source).toContain("WHERE project_id = ? AND source_entity_id IN (${buildSqlPlaceholders(requirementSourceEntityIds.length)})")
  })
})
