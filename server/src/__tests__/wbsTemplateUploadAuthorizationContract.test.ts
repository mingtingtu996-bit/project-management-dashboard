import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

describe('WBS template upload authorization contract', () => {
  it('authorizes the URL project before Multer allocates the uploaded file', () => {
    const source = readFileSync(resolve(workspaceRoot, 'server/src/routes/wbs-templates.ts'), 'utf8')
    const routeStart = source.indexOf("'/import-excel'")
    const routeEnd = source.indexOf("// ── F9: JSON", routeStart)
    const routeSource = source.slice(routeStart, routeEnd)

    expect(routeStart).toBeGreaterThan(-1)
    expect(routeSource.indexOf('requireProjectEditor(getSpreadsheetImportProjectId)'))
      .toBeLessThan(routeSource.indexOf("upload.single('file')"))
    expect(routeSource).toContain('const projectId = getSpreadsheetImportProjectId(req)')
    expect(routeSource).not.toContain('const projectId = String(req.body')
  })

  it('keeps live diagnostics and embedded generation clients on canonical planning endpoints', () => {
    const browserSource = readFileSync(
      resolve(workspaceRoot, 'client/src/services/wbsTemplateGenerationApi.ts'),
      'utf8',
    )
    const diagnosticSource = readFileSync(
      resolve(workspaceRoot, 'server/src/scripts/diagnose-spreadsheet-migration-live.ts'),
      'utf8',
    )

    expect(browserSource).toContain('/api/planning/wbs-templates/generate-preview')
    expect(browserSource).not.toContain('/api/wbs-templates')
    expect(diagnosticSource).toContain('/api/planning/wbs-templates/import-excel?project_id=')
  })
})
