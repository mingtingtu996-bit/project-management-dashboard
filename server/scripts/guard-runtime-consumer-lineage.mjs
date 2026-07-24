import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const DEFAULT_ROOT = fs.existsSync(path.resolve(process.cwd(), 'server', 'src'))
  ? path.resolve(process.cwd(), 'server')
  : process.cwd()
const DEFAULT_ALLOWED_WRITERS = new Set([
  'src/services/durationRuntimeConsumerObservationService.ts',
])
const FORBIDDEN_WRITER_IMPORT_PATTERN =
  /(?:RuntimePublicationService|DomainWriter|PublicationService|EvidenceWriterService)\.js$/i
// Task 4 requires these existing publication writers inside one outer review-decision transaction.
// Keep the exception bound to the decision adapter and its exact writer module.
const TASK_4_REVIEW_DECISION_SERVICE = 'src/services/durationAssetReviewDecisionService.ts'
const TASK_4_REVIEW_WRITER_MODULE = './durationLearningRuntimePublicationService.js'
const TASK_4_REVIEW_WRITER_VALUE_IMPORTS = new Set([
  'durationLearningRuntimePublicationScopesMatch',
  'executeDurationLearningRuntimePublicationQuery',
  'persistDurationLearningRuntimePublication',
  'promoteDurationLearningRuntimeCanary',
  'recordDurationLearningRuntimeImpact',
])
const SCAN_DIRS = [
  'src/services',
  'src/jobs',
  'src/routes',
  'src/scripts',
]

function walk(dir) {
  if (!fs.existsSync(dir)) return []
  const files = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['dist', 'node_modules', '__tests__', 'tmp'].includes(entry.name)) continue
      files.push(...walk(full))
      continue
    }
    if (!entry.isFile()) continue
    if (!full.endsWith('.ts')) continue
    if (full.endsWith('.test.ts') || full.endsWith('.spec.ts')) continue
    files.push(full)
  }
  return files
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function normalizeSqlLikeText(source) {
  return stripComments(source)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function lineFor(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function normalizeRelativePath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/')
}

function isCandidateOrReviewService(relativePath) {
  return /^src\/services\/.*(?:candidate|review).*\.ts$/i.test(relativePath)
}

function normalizeModuleSpecifier(specifier) {
  const raw = String(specifier ?? '').trim().replace(/\\/g, '/')
  const withoutQueryOrHash = raw.replace(/[?#].*$/, '')
  if (!withoutQueryOrHash) return ''

  const normalized = path.posix.normalize(withoutQueryOrHash)
  return withoutQueryOrHash.startsWith('./') && !normalized.startsWith('.')
    ? `./${normalized}`
    : normalized
}

function isWriterModuleSpecifier(specifier) {
  return FORBIDDEN_WRITER_IMPORT_PATTERN.test(normalizeModuleSpecifier(specifier))
}

function violationForNode(sourceFile, node, filePath, reason) {
  return {
    filePath,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    reason,
  }
}

function isRuntimeImportDeclaration(importDeclaration) {
  const importClause = importDeclaration.importClause
  if (!importClause) return true
  if (importClause.isTypeOnly) return false
  if (importClause.name) return true
  if (!importClause.namedBindings) return false
  if (ts.isNamespaceImport(importClause.namedBindings)) return true
  return importClause.namedBindings.elements.some((element) => !element.isTypeOnly)
}

function importedName(importSpecifier) {
  return (importSpecifier.propertyName ?? importSpecifier.name).text
}

function isRuntimeExportDeclaration(exportDeclaration) {
  if (exportDeclaration.isTypeOnly) return false
  if (!exportDeclaration.exportClause || !ts.isNamedExports(exportDeclaration.exportClause)) return true
  return exportDeclaration.exportClause.elements.some((element) => !element.isTypeOnly)
}

function isDirectRequireCall(callExpression) {
  return ts.isIdentifier(callExpression.expression) && callExpression.expression.text === 'require'
}

function isAllowedTask4ReviewWriterImport(relativePath, specifier, importDeclaration) {
  if (
    relativePath !== TASK_4_REVIEW_DECISION_SERVICE
    || normalizeModuleSpecifier(specifier) !== TASK_4_REVIEW_WRITER_MODULE
  ) {
    return false
  }

  const importClause = importDeclaration.importClause
  if (!importClause || importClause.isTypeOnly || importClause.name || !importClause.namedBindings) return false
  if (!ts.isNamedImports(importClause.namedBindings)) return false

  const valueImports = importClause.namedBindings.elements.filter((element) => !element.isTypeOnly)
  return valueImports.length > 0
    && valueImports.every((element) => TASK_4_REVIEW_WRITER_VALUE_IMPORTS.has(importedName(element)))
}

function collectSqlWriteViolations(source, filePath) {
  const normalized = normalizeSqlLikeText(source)
  const violations = []
  const directSqlWritePattern = /\b(?:insert\s+into|update|delete\s+from)\s+(?:public\.)?runtime_consumer_observations\b/g
  let match
  while ((match = directSqlWritePattern.exec(normalized)) !== null) {
    const rawIndex = source.toLowerCase().indexOf('runtime_consumer_observations')
    violations.push({
      filePath,
      line: rawIndex >= 0 ? lineFor(source, rawIndex) : 1,
      reason: 'runtime_consumer_observation_direct_sql_write_outside_helper',
    })
  }
  return violations
}

function collectSupabaseMutationViolations(source, filePath) {
  const stripped = stripComments(source)
  const violations = []
  const supabaseMutationPattern =
    /\.from\(\s*['"`](?:public\.)?runtime_consumer_observations['"`]\s*\)[\s\S]{0,500}?\.(?:insert|upsert|update|delete)\s*\(/gi
  let match
  while ((match = supabaseMutationPattern.exec(stripped)) !== null) {
    violations.push({
      filePath,
      line: lineFor(stripped, match.index),
      reason: 'runtime_consumer_observation_supabase_mutation_outside_helper',
    })
  }
  return violations
}

function collectCandidateReviewWriterImportViolations(source, filePath, relativePath) {
  if (!isCandidateOrReviewService(relativePath)) return []

  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const violations = []
  const checkWriterDependency = (node, specifier, allowed) => {
    if (!isWriterModuleSpecifier(specifier) || allowed) return
    violations.push(violationForNode(
      sourceFile,
      node,
      filePath,
      'candidate_review_direct_writer_import',
    ))
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      if (isRuntimeImportDeclaration(node)) {
        checkWriterDependency(
          node,
          node.moduleSpecifier.text,
          isAllowedTask4ReviewWriterImport(relativePath, node.moduleSpecifier.text, node),
        )
      }
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const moduleExpression = node.moduleReference.expression
      if (moduleExpression && ts.isStringLiteralLike(moduleExpression)) {
        checkWriterDependency(node, moduleExpression.text, false)
      }
    } else if (
      ts.isExportDeclaration(node)
      && isRuntimeExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      checkWriterDependency(node, node.moduleSpecifier.text, false)
    } else if (
      ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword || isDirectRequireCall(node))
    ) {
      const [argument] = node.arguments
      if (!argument || !ts.isStringLiteralLike(argument)) {
        violations.push(violationForNode(
          sourceFile,
          node,
          filePath,
          'candidate_review_unproven_dynamic_import',
        ))
      } else {
        checkWriterDependency(node, argument.text, false)
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return violations
}

function collectRuntimeConsumerLineageViolations(filePath, root, allowedWriters = DEFAULT_ALLOWED_WRITERS) {
  const relativePath = normalizeRelativePath(root, filePath)
  if (allowedWriters.has(relativePath)) return []

  const source = fs.readFileSync(filePath, 'utf8')
  return [
    ...collectSqlWriteViolations(source, filePath),
    ...collectSupabaseMutationViolations(source, filePath),
    ...collectCandidateReviewWriterImportViolations(source, filePath, relativePath),
  ]
}

export function evaluateRuntimeConsumerLineageGuard(root = DEFAULT_ROOT, options = {}) {
  const serverRoot = fs.existsSync(path.join(root, 'src')) ? root : path.join(root, 'server')
  const allowedWriters = new Set(options.allowedWriters ?? DEFAULT_ALLOWED_WRITERS)
  const files = SCAN_DIRS.flatMap((dir) => walk(path.join(serverRoot, dir)))
  if (files.length === 0) {
    throw new Error(`[runtime-consumer-lineage-guard] No server files found under ${serverRoot}`)
  }

  const violations = files.flatMap((filePath) =>
    collectRuntimeConsumerLineageViolations(filePath, serverRoot, allowedWriters),
  )

  return { files, violations, allowedWriters }
}

export function formatRuntimeConsumerLineageGuardFailure(result, cwd = process.cwd()) {
  const lines = ['[runtime-consumer-lineage-guard] Runtime consumer lineage must use controlled writers and keep candidate/review services out of writer imports:']
  for (const violation of result.violations) {
    lines.push(`- ${path.relative(cwd, violation.filePath)}:${violation.line} (${violation.reason})`)
  }
  return lines.join('\n')
}

function pathToFileUrl(filePath) {
  return new URL(`file://${path.resolve(filePath).replace(/\\/g, '/')}`).href
}

if (process.argv[1] && import.meta.url === pathToFileUrl(process.argv[1])) {
  const result = evaluateRuntimeConsumerLineageGuard()
  if (result.violations.length) {
    console.error(formatRuntimeConsumerLineageGuardFailure(result))
    process.exit(1)
  }
  console.log(`[runtime-consumer-lineage-guard] OK: scanned ${result.files.length} files; direct observation writers restricted to ${Array.from(result.allowedWriters).join(', ')}.`)
}
