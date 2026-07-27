import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as ts from 'typescript'

export type DiscoveredAlgorithmTunable = {
  sourcePath: string
  sourceSymbol: string
  kind: 'declaration' | 'inline_call_option'
  line: number
}

export const ALGORITHM_TUNABLE_DISCOVERY_POLICY = Object.freeze({
  runtimeRoot: 'server/src/services',
  declarationRule: 'top_level_const_with_uppercase_default_or_tuning_name_and_static_numeric_content',
  inlineRule: 'numeric_tuning_property_in_call_object_argument',
  excludedDeclarationSuffixes: ['_CONSUMER_KEY', '_VERSION'],
})

const servicesRoot = fileURLToPath(new URL('../../services/', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const uppercaseConstantPattern = /^[_A-Z][_A-Z0-9]*$/
const excludedDeclarationSuffixPattern = /_(?:CONSUMER_KEY|VERSION)$/
const structuredTuningContainerSuffixPattern = /_(?:CAPS|CONFIG|DEFAULTS|FLOORS|OPTIONS|POLICY|PROFILE|SETTINGS|THRESHOLDS|WEIGHTS)$/
const directTuningTokens = new Set([
  'blend',
  'blending',
  'correction',
  'correlation',
  'multiplier',
  'multipliers',
  'penalties',
  'penalty',
  'ratio',
  'ratios',
  'threshold',
  'thresholds',
  'tolerance',
  'weight',
  'weights',
])

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

function nameTokens(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function hasAlgorithmTuningName(value: string) {
  const tokens = nameTokens(value)
  const tokenSet = new Set(tokens)
  if (tokens.some((token) => directTuningTokens.has(token))) return true
  if (tokenSet.has('simulation') && tokenSet.has('count')) return true
  if (tokenSet.has('scenario') && tokenSet.has('correlation')) return true
  if (
    tokenSet.has('sample')
    && tokenSet.has('count')
    && ['default', 'defaults', 'min', 'minimum', 'max', 'maximum'].some((token) => tokenSet.has(token))
  ) return true
  if (tokenSet.has('stop') && (tokenSet.has('condition') || tokenSet.has('conditions'))) return true
  if (tokenSet.has('safety') && (tokenSet.has('min') || tokenSet.has('max'))) return true
  return tokenSet.has('confidence')
    && tokenSet.has('delta')
    && (tokenSet.has('min') || tokenSet.has('max'))
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isParenthesizedExpression(expression)
    || ts.isTypeAssertionExpression(expression)
  ) {
    return unwrapExpression(expression.expression)
  }
  return expression
}

function isStaticNumericExpression(expression: ts.Expression): boolean {
  const unwrapped = unwrapExpression(expression)
  if (ts.isNumericLiteral(unwrapped)) return true
  if (ts.isPrefixUnaryExpression(unwrapped)) return isStaticNumericExpression(unwrapped.operand)
  return ts.isBinaryExpression(unwrapped)
    && isStaticNumericExpression(unwrapped.left)
    && isStaticNumericExpression(unwrapped.right)
}

function containsStaticNumericValue(
  expression: ts.Expression,
  topLevelInitializers: ReadonlyMap<string, ts.Expression>,
  seenIdentifiers = new Set<string>(),
): boolean {
  const unwrapped = unwrapExpression(expression)
  if (isStaticNumericExpression(unwrapped)) return true
  if (ts.isIdentifier(unwrapped)) {
    if (seenIdentifiers.has(unwrapped.text)) return false
    const initializer = topLevelInitializers.get(unwrapped.text)
    if (!initializer) return false
    const nextSeen = new Set(seenIdentifiers)
    nextSeen.add(unwrapped.text)
    return containsStaticNumericValue(initializer, topLevelInitializers, nextSeen)
  }
  if (ts.isPrefixUnaryExpression(unwrapped)) {
    return containsStaticNumericValue(unwrapped.operand, topLevelInitializers, seenIdentifiers)
  }
  if (ts.isBinaryExpression(unwrapped)) {
    return containsStaticNumericValue(unwrapped.left, topLevelInitializers, seenIdentifiers)
      && containsStaticNumericValue(unwrapped.right, topLevelInitializers, seenIdentifiers)
  }
  if (ts.isArrayLiteralExpression(unwrapped)) {
    return unwrapped.elements.some((element) => (
      ts.isSpreadElement(element)
        ? containsStaticNumericValue(element.expression, topLevelInitializers, seenIdentifiers)
        : containsStaticNumericValue(element, topLevelInitializers, seenIdentifiers)
    ))
  }
  if (ts.isObjectLiteralExpression(unwrapped)) {
    return unwrapped.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return containsStaticNumericValue(property.initializer, topLevelInitializers, seenIdentifiers)
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return containsStaticNumericValue(property.name, topLevelInitializers, seenIdentifiers)
      }
      if (ts.isSpreadAssignment(property)) {
        return containsStaticNumericValue(property.expression, topLevelInitializers, seenIdentifiers)
      }
      return false
    })
  }
  if (
    ts.isCallExpression(unwrapped)
    && ts.isPropertyAccessExpression(unwrapped.expression)
    && ts.isIdentifier(unwrapped.expression.expression)
    && unwrapped.expression.expression.text === 'Object'
    && unwrapped.expression.name.text === 'freeze'
  ) {
    return unwrapped.arguments.some((argument) => (
      containsStaticNumericValue(argument, topLevelInitializers, seenIdentifiers)
    ))
  }
  return false
}

function containsStaticTuningProperty(node: ts.Node, sourceFile: ts.SourceFile) {
  let found = false
  function visit(current: ts.Node) {
    if (found) return
    if (
      ts.isPropertyAssignment(current)
      && hasAlgorithmTuningName(propertyName(current, sourceFile))
      && isStaticNumericExpression(current.initializer)
    ) {
      found = true
      return
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

function propertyName(node: ts.ObjectLiteralElementLike, sourceFile: ts.SourceFile) {
  const name = node.name
  if (!name) return ''
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return name.getText(sourceFile)
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

function lineFor(node: ts.Node, sourceFile: ts.SourceFile) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

export function discoverAlgorithmTunablesInSource(source: string, sourcePath: string): DiscoveredAlgorithmTunable[] {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const discovered: DiscoveredAlgorithmTunable[] = []
  const topLevelDeclarations = sourceFile.statements.flatMap((statement) => (
    ts.isVariableStatement(statement) && (statement.declarationList.flags & ts.NodeFlags.Const)
      ? [...statement.declarationList.declarations]
      : []
  ))
  const topLevelInitializers = new Map<string, ts.Expression>()
  for (const declaration of topLevelDeclarations) {
    if (ts.isIdentifier(declaration.name) && declaration.initializer) {
      topLevelInitializers.set(declaration.name.text, declaration.initializer)
    }
  }

  for (const declaration of topLevelDeclarations) {
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
    const sourceSymbol = declaration.name.text
    if (!uppercaseConstantPattern.test(sourceSymbol) || excludedDeclarationSuffixPattern.test(sourceSymbol)) continue
    if (!containsStaticNumericValue(declaration.initializer, topLevelInitializers)) continue
    const tokens = new Set(nameTokens(sourceSymbol))
    const structuredTuningContainer = structuredTuningContainerSuffixPattern.test(sourceSymbol)
      && containsStaticTuningProperty(declaration.initializer, sourceFile)
    if (
      !tokens.has('default')
      && !tokens.has('defaults')
      && !hasAlgorithmTuningName(sourceSymbol)
      && !structuredTuningContainer
    ) continue
    discovered.push({
      sourcePath,
      sourceSymbol,
      kind: 'declaration',
      line: lineFor(declaration.name, sourceFile),
    })
  }

  const inlineOptions: Array<DiscoveredAlgorithmTunable & { baseSymbol: string }> = []
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      for (const argument of node.arguments) {
        const unwrapped = unwrapExpression(argument)
        if (!ts.isObjectLiteralExpression(unwrapped)) continue
        for (const property of unwrapped.properties) {
          if (!ts.isPropertyAssignment(property)) continue
          const optionName = propertyName(property, sourceFile)
          if (!hasAlgorithmTuningName(optionName) || !isStaticNumericExpression(property.initializer)) continue
          inlineOptions.push({
            sourcePath,
            sourceSymbol: '',
            baseSymbol: `${enclosingFunctionName(node, sourceFile)}.${optionName}`,
            kind: 'inline_call_option',
            line: lineFor(property.name, sourceFile),
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  const totals = new Map<string, number>()
  for (const option of inlineOptions) {
    totals.set(option.baseSymbol, (totals.get(option.baseSymbol) ?? 0) + 1)
  }
  const occurrences = new Map<string, number>()
  for (const option of inlineOptions) {
    const occurrence = (occurrences.get(option.baseSymbol) ?? 0) + 1
    occurrences.set(option.baseSymbol, occurrence)
    discovered.push({
      sourcePath: option.sourcePath,
      sourceSymbol: (totals.get(option.baseSymbol) ?? 0) > 1
        ? `${option.baseSymbol}#${occurrence}`
        : option.baseSymbol,
      kind: option.kind,
      line: option.line,
    })
  }

  return discovered
}

function discoverInModule(path: string) {
  return discoverAlgorithmTunablesInSource(
    readFileSync(path, 'utf8'),
    slash(relative(repoRoot, path)),
  )
}

export function discoverAlgorithmTunablesFromRuntimeSource() {
  return productionTypeScriptFiles(servicesRoot)
    .sort()
    .flatMap(discoverInModule)
    .sort((left, right) => (
      left.sourcePath.localeCompare(right.sourcePath)
      || left.sourceSymbol.localeCompare(right.sourceSymbol)
      || left.line - right.line
    ))
}
