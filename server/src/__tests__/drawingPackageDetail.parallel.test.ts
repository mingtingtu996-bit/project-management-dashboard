import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('drawing package detail route parallelization', () => {
  it('reuses centralized package loading helpers instead of route-level OR/JOIN SQL', () => {
    const source = readFileSync(new URL('../routes/drawing-packages.ts', import.meta.url), 'utf8')

    expect(source).toContain('const projectData = dataProjectId')
    expect(source).toContain('await loadProjectPackages(dataProjectId)')
    expect(source).toContain('selectPackageScopedDrawings(projectData.drawings, packageLookup, packageRow)')
    expect(source).not.toContain('SELECT dv.*, cd.drawing_name FROM drawing_versions dv LEFT JOIN construction_drawings cd ON cd.id = dv.drawing_id')
  })
})
