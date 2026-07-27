import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readRoute() {
  return readFileSync(resolve(serverRoot, 'src', 'routes', 'wbs-templates.ts'), 'utf8')
}

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(serverRoot, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
}

function readPackageLock() {
  return readFileSync(resolve(serverRoot, 'package-lock.json'), 'utf8')
}

describe('WBS template Excel import guard', () => {
  it('does not depend on the vulnerable npm xlsx package for user supplied imports', () => {
    const packageJson = readPackageJson()
    const dependencies = packageJson.dependencies ?? {}
    const source = readRoute()
    const lockfile = readPackageLock()

    expect(dependencies).not.toHaveProperty('xlsx')
    expect(dependencies['@e965/xlsx']).toMatch(/^(\^|~)?0\.20\./)
    expect(source).toContain("from '@e965/xlsx'")
    expect(source).not.toContain("from 'xlsx'")
    expect(lockfile).not.toContain('"xlsx": "^0.18.5"')
    expect(lockfile).not.toContain('"node_modules/xlsx"')
    expect(lockfile).toContain('"node_modules/@e965/xlsx"')
  })

  it('bounds spreadsheet parsing and sanitizes imported template nodes before persistence', () => {
    const source = readRoute()
    const importExcelSource = source.slice(
      source.indexOf("'/import-excel'"),
      source.indexOf('// ── F9: JSON 导入'),
    )

    expect(importExcelSource).toContain('WBS_TEMPLATE_IMPORT_MAX_ROWS')
    expect(importExcelSource).toContain('WBS_TEMPLATE_IMPORT_MAX_COLUMNS')
    expect(importExcelSource).toContain('WBS_TEMPLATE_IMPORT_MAX_CELLS')
    expect(importExcelSource).toContain('sheetRows: WBS_TEMPLATE_IMPORT_MAX_ROWS + 1')
    expect(importExcelSource).toContain('WBS_TEMPLATE_IMPORT_TOO_LARGE')
    expect(importExcelSource).toContain('const sanitizedWbsNodes = sanitizeWbsTemplatePayload(wbsNodes)')
    expect(importExcelSource).toContain('JSON.stringify(sanitizedWbsNodes)')
  })
})
