import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('../', import.meta.url))

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : productionTypeScriptFiles(path)
    }
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

function importDeclarations(path: string) {
  const source = readFileSync(path, 'utf8')
  const scriptKind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind)
  return sourceFile.statements.filter(ts.isImportDeclaration)
}

function importedModule(declaration: ts.ImportDeclaration) {
  return ts.isStringLiteral(declaration.moduleSpecifier) ? declaration.moduleSpecifier.text : ''
}

const progressDeviationRegistryInventoryAllowlist = new Set([
  'services/algorithmSeedRegistry.ts',
])

describe('canonical cause consumer boundary', () => {
  it('limits actual progress deviation registry imports to the inventory allowlist', () => {
    const consumers = productionTypeScriptFiles(sourceRoot).flatMap((path) => {
      const importsRegistry = importDeclarations(path).some((declaration) => (
        importedModule(declaration).endsWith('/progressDeviationCauseRegistry.js')
      ))
      return importsRegistry ? [relative(sourceRoot, path).replaceAll('\\', '/')] : []
    })

    expect(consumers.sort()).toEqual([...progressDeviationRegistryInventoryAllowlist].sort())
  }, 30_000)

  it('requires deviation consumers to translate legacy factors through the canonical domain', () => {
    for (const relativePath of [
      'services/progressDeviationService.ts',
      'services/projectHealthDeviationSummaryService.ts',
    ]) {
      const path = join(sourceRoot, relativePath)
      const imports = importDeclarations(path)
      const canonicalImport = imports.find((declaration) => (
        importedModule(declaration).endsWith('/domain/structuredCauseTaxonomy.js')
      ))
      const namedImports = canonicalImport?.importClause?.namedBindings
      const importedNames = namedImports && ts.isNamedImports(namedImports)
        ? namedImports.elements.map((element) => element.name.text)
        : []

      expect(importedNames).toContain('translateLegacyProgressFactor')
      expect(imports.some((declaration) => (
        importedModule(declaration).endsWith('/progressDeviationCauseRegistry.js')
      ))).toBe(false)
    }
  })
})
