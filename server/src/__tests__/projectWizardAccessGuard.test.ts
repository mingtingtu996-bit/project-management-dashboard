import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const routeSource = readFileSync(join(__dirname, '../routes/projectWizard.ts'), 'utf8')

describe('project wizard access guard contract', () => {
  it('requires project editor permission before mutating an existing wizard project', () => {
    expect(routeSource).toContain('getProjectPermissionLevel')
    expect(routeSource).toContain('assertWizardProjectEditor')
    expect(routeSource).toContain('permissionLevel !==')
    expect(routeSource).toContain("permissionLevel !== 'owner'")
    expect(routeSource).toContain("permissionLevel !== 'editor'")
  })

  it('checks body projectId, draft params, and rollback params before project writes', () => {
    expect(routeSource).toContain('projectId: body.projectId')
    expect(routeSource).toContain('projectId: id')
    expect(routeSource).toMatch(/await assertWizardProjectEditor[\s\S]*?const updateResult = await rawQuery[\s\S]*?UPDATE projects/)
    expect(routeSource).toMatch(/await assertWizardProjectEditor[\s\S]*?DELETE FROM projects/)
    expect(routeSource).toMatch(/await assertWizardProjectEditor[\s\S]*?await rollbackWizardGeneratedArtifacts/)
  })
})
