import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const servicesRoot = resolve(serverRoot, 'src/services')
const facadeName = 'wbsTemplateGenerationService.ts'
const moduleNames = [
  'wbsTemplateGenerationFoundation.ts',
  'wbsTemplateScopeClassificationService.ts',
  'wbsTemplateDurationAssemblyService.ts',
  'wbsTemplateOutputProjectionService.ts',
  'wbsTemplateDependencyCandidateService.ts',
  'wbsTemplateAssetStrategyService.ts',
  'wbsTemplateCloseoutChainService.ts',
  'wbsTemplateAuditFormattingService.ts',
  'wbsTemplateGenerationOrchestrator.ts',
] as const

function readService(name: string) {
  return readFileSync(resolve(servicesRoot, name), 'utf8')
}

function parseService(name: string) {
  return ts.createSourceFile(name, readService(name), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function localWbsModuleImports(name: string) {
  return parseService(name).statements
    .filter(ts.isImportDeclaration)
    .map((statement) => String((statement.moduleSpecifier as ts.StringLiteral).text))
    .filter((specifier) => specifier.startsWith('./wbsTemplate'))
    .map((specifier) => `${specifier.slice(2).replace(/\.js$/, '')}.ts`)
    .filter((specifier): specifier is typeof moduleNames[number] => moduleNames.includes(specifier as typeof moduleNames[number]))
}

describe('WBS template generation modularity guard', () => {
  it('keeps the compatibility facade small and free of domain declarations', () => {
    const facade = readService(facadeName)
    const sourceFile = parseService(facadeName)

    expect(facade.split(/\r?\n/).length).toBeLessThanOrEqual(1_500)
    expect(sourceFile.statements.every(ts.isExportDeclaration)).toBe(true)
  })

  it('keeps every cohesive implementation module present and independent of the facade', () => {
    for (const moduleName of moduleNames) {
      expect(existsSync(resolve(servicesRoot, moduleName)), moduleName).toBe(true)
      const source = readService(moduleName)
      expect(source).not.toMatch(/from ['"]\.\/wbsTemplateGenerationService\.js['"]/)
    }
  })

  it('keeps the extracted module dependency graph acyclic', () => {
    const graph = new Map(moduleNames.map((moduleName) => [moduleName, localWbsModuleImports(moduleName)]))
    const visiting = new Set<string>()
    const visited = new Set<string>()

    const visit = (moduleName: string, path: string[]): string[] | null => {
      if (visiting.has(moduleName)) return [...path, moduleName]
      if (visited.has(moduleName)) return null
      visiting.add(moduleName)
      for (const dependency of graph.get(moduleName as typeof moduleNames[number]) ?? []) {
        const cycle = visit(dependency, [...path, moduleName])
        if (cycle) return cycle
      }
      visiting.delete(moduleName)
      visited.add(moduleName)
      return null
    }

    for (const moduleName of moduleNames) {
      expect(visit(moduleName, []), moduleName).toBeNull()
    }
  })
})
