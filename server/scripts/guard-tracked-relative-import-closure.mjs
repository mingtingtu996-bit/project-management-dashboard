import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import ts from 'typescript'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
const DEFAULT_SCAN_ROOTS = [
  'server/src',
  'server/scripts',
  'client/src',
  'client/scripts',
]

function normalizeRepoPath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '')
}

function isRelativeImport(value) {
  return value.startsWith('./') || value.startsWith('../')
}

function readStringLiteral(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : null
}

export function collectRelativeImportSpecifiers(sourceText, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') || fileName.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const imports = new Set()

  const add = (value) => {
    if (value && isRelativeImport(value)) imports.add(value)
  }

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(readStringLiteral(node.moduleSpecifier))
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(readStringLiteral(node.moduleReference.expression))
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (isDynamicImport || isRequire) add(readStringLiteral(node.arguments[0]))
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...imports]
}

function sourceCandidates(importerAbsolutePath, specifier) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0]
  const target = resolve(dirname(importerAbsolutePath), cleanSpecifier)
  const extension = extname(target).toLowerCase()

  if (extension === '.js') {
    const base = target.slice(0, -3)
    return [`${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, target]
  }
  if (extension === '.mjs') {
    const base = target.slice(0, -4)
    return [`${base}.mts`, `${base}.ts`, target]
  }
  if (extension === '.cjs') {
    const base = target.slice(0, -4)
    return [`${base}.cts`, `${base}.ts`, target]
  }
  if (extension) return [target]

  const direct = [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.mts`,
    `${target}.cts`,
    `${target}.js`,
    `${target}.jsx`,
    `${target}.mjs`,
    `${target}.cjs`,
    `${target}.json`,
  ]
  const indexes = ['index.ts', 'index.tsx', 'index.mts', 'index.cts', 'index.js', 'index.mjs', 'index.cjs']
    .map((name) => resolve(target, name))
  return [...direct, ...indexes]
}

function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function isUnderScanRoot(path, scanRoots) {
  return scanRoots.some((root) => path === root || path.startsWith(`${root}/`))
}

export function auditTrackedRelativeImports({
  repoRoot,
  trackedFiles,
  scanRoots = DEFAULT_SCAN_ROOTS,
}) {
  const normalizedRoots = scanRoots.map(normalizeRepoPath)
  const tracked = new Set(trackedFiles.map(normalizeRepoPath))
  const sourceFiles = [...tracked]
    .filter((path) => isUnderScanRoot(path, normalizedRoots))
    .filter((path) => SOURCE_EXTENSIONS.has(extname(path).toLowerCase()))
    .filter((path) => !path.endsWith('.d.ts'))
    .sort()
  const violations = []
  let relativeImportCount = 0

  for (const importer of sourceFiles) {
    const importerAbsolutePath = resolve(repoRoot, importer)
    if (!existsSync(importerAbsolutePath)) {
      violations.push({
        importer,
        specifier: null,
        resolvedPath: importer,
        reason: 'importer_missing',
      })
      continue
    }

    const specifiers = collectRelativeImportSpecifiers(
      readFileSync(importerAbsolutePath, 'utf8'),
      importer,
    )
    relativeImportCount += specifiers.length

    for (const specifier of specifiers) {
      const candidates = sourceCandidates(importerAbsolutePath, specifier)
      const existingCandidates = candidates.filter(isFile)
      const selected = existingCandidates.find((candidate) => tracked.has(normalizeRepoPath(relative(repoRoot, candidate))))
        ?? existingCandidates[0]
        ?? candidates[0]
      const resolvedPath = normalizeRepoPath(relative(repoRoot, selected))

      if (existingCandidates.length === 0) {
        violations.push({ importer, specifier, resolvedPath, reason: 'target_missing' })
      } else if (!tracked.has(resolvedPath)) {
        violations.push({ importer, specifier, resolvedPath, reason: 'target_untracked' })
      }
    }
  }

  return {
    scannedFileCount: sourceFiles.length,
    relativeImportCount,
    violations,
  }
}

function readTrackedFiles(repoRoot) {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return output.split('\0').filter(Boolean)
}

function main() {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const result = auditTrackedRelativeImports({
    repoRoot,
    trackedFiles: readTrackedFiles(repoRoot),
  })

  if (result.violations.length > 0) {
    console.error(`[tracked-relative-import-closure] ${result.violations.length} violation(s) found`)
    for (const violation of result.violations) {
      console.error(
        `${violation.importer}: ${violation.specifier ?? '<source>'} -> ${violation.resolvedPath} (${violation.reason})`,
      )
    }
    process.exitCode = 1
    return
  }

  console.log(
    `[tracked-relative-import-closure] scanned ${result.scannedFileCount} tracked source files and ${result.relativeImportCount} relative imports; violations 0`,
  )
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main()
}
