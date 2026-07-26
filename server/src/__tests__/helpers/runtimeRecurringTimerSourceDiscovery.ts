import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'

export type DiscoveredRuntimeRecurringTimer = {
  sourcePath: string
  sourceSymbol: string
  line: number
}

const sourceRoot = fileURLToPath(new URL('../../', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))

function slash(value: string) {
  return value.replaceAll('\\', '/')
}

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : productionTypeScriptFiles(path)
    }
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.(?:test|spec)\.tsx?$/.test(entry.name)) {
      return []
    }
    return [path]
  })
}

function importedSetIntervalAliases(sourceFile: ts.SourceFile) {
  const aliases = new Set(['setInterval'])
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    if (!['node:timers', 'timers'].includes(statement.moduleSpecifier.text)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 'setInterval') aliases.add(element.name.text)
    }
  }
  return aliases
}

function isSetIntervalCallee(expression: ts.LeftHandSideExpression, aliases: ReadonlySet<string>) {
  if (ts.isIdentifier(expression)) return aliases.has(expression.text)
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text === 'setInterval'
  }
  if (!ts.isElementAccessExpression(expression) || !expression.argumentExpression) return false
  return ts.isStringLiteral(expression.argumentExpression)
    && expression.argumentExpression.text === 'setInterval'
}

function enclosingFunctionName(node: ts.Node, sourceFile: ts.SourceFile) {
  let current = node.parent
  while (current && !ts.isSourceFile(current)) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text
    if (ts.isMethodDeclaration(current) && current.name) return current.name.getText(sourceFile)
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
      && ts.isVariableDeclaration(current.parent)
      && ts.isIdentifier(current.parent.name)
    ) return current.parent.name.text
    current = current.parent
  }
  return '<module>'
}

export function discoverRuntimeRecurringTimersInSource(source: string, sourcePath: string) {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const intervalAliases = importedSetIntervalAliases(sourceFile)
  const raw: Array<DiscoveredRuntimeRecurringTimer & { baseSymbol: string }> = []

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isSetIntervalCallee(node.expression, intervalAliases)) {
      raw.push({
        sourcePath,
        sourceSymbol: '',
        baseSymbol: `${enclosingFunctionName(node, sourceFile)}.setInterval`,
        line: sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile)).line + 1,
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const totals = new Map<string, number>()
  for (const timer of raw) totals.set(timer.baseSymbol, (totals.get(timer.baseSymbol) ?? 0) + 1)
  const occurrences = new Map<string, number>()
  return raw.map((timer) => {
    const occurrence = (occurrences.get(timer.baseSymbol) ?? 0) + 1
    occurrences.set(timer.baseSymbol, occurrence)
    return {
      sourcePath: timer.sourcePath,
      sourceSymbol: (totals.get(timer.baseSymbol) ?? 0) > 1
        ? `${timer.baseSymbol}#${occurrence}`
        : timer.baseSymbol,
      line: timer.line,
    }
  })
}

export function discoverRuntimeRecurringTimersFromRepositorySource() {
  return productionTypeScriptFiles(sourceRoot)
    .sort()
    .flatMap((path) => discoverRuntimeRecurringTimersInSource(
      readFileSync(path, 'utf8'),
      slash(relative(repoRoot, path)),
    ))
    .sort((left, right) => (
      left.sourcePath.localeCompare(right.sourcePath)
      || left.sourceSymbol.localeCompare(right.sourceSymbol)
      || left.line - right.line
    ))
}
