#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const scanRoots = [
  'server/src',
  'project-search/tools',
  'project-testing/tools',
  'scripts',
]

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.mjs'])
const skippedDirectories = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'tmp'])

function pathOf(relativePath) {
  return join(repoRoot, relativePath)
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(pathOf(relativePath), 'utf8'))
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'failed', message, ...details }, null, 2))
  process.exit(1)
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skippedDirectories.has(entry.name)) continue
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) walk(fullPath, out)
    else if (sourceExtensions.has(extname(entry.name))) out.push(fullPath)
  }
  return out
}

function isTestLike(relativePath) {
  return /(^|\/)(__tests__|test|tests)(\/|$)|\.test\.|\.spec\./.test(relativePath)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function detectMutatedTables(text, tableIds) {
  const tables = new Set()
  for (const table of tableIds) {
    const escaped = escapeRegExp(table)
    const sqlPattern = new RegExp(`\\b(insert\\s+into|update|delete\\s+from|merge\\s+into)\\s+(?:public\\.)?${escaped}\\b`, 'ig')
    if (sqlPattern.test(text)) tables.add(table)

    const fromPattern = new RegExp(`\\.from\\(\\s*['"]${escaped}['"]\\s*\\)`, 'g')
    for (const match of text.matchAll(fromPattern)) {
      const windowText = text.slice(match.index, match.index + 900)
      if (/\.(insert|upsert|update|delete)\s*\(/.test(windowText)) tables.add(table)
    }
  }
  return [...tables].sort()
}

function main() {
  const tableCatalog = readJson('project-data/catalog/tables.json')
  const writers = readJson('project-data/lineage/writers.json')
  const tableIds = tableCatalog.tables.map((table) => table.id)
  const writersByPath = new Map(writers.writers.map((writer) => [writer.path.replace(/\\/g, '/'), writer]))

  const writerLikeFiles = []
  for (const root of scanRoots) {
    for (const fullPath of walk(pathOf(root))) {
      const relativePath = relative(repoRoot, fullPath).replace(/\\/g, '/')
      if (isTestLike(relativePath)) continue

      const text = readFileSync(fullPath, 'utf8')
      const mutatedTables = detectMutatedTables(text, tableIds)
      if (mutatedTables.length === 0) continue

      const writer = writersByPath.get(relativePath)
      writerLikeFiles.push({
        path: relativePath,
        registered: Boolean(writer),
        tables: mutatedTables,
        writerId: writer?.id ?? null,
      })
    }
  }

  const unregistered = writerLikeFiles.filter((item) => !item.registered)
  if (unregistered.length > 0) {
    fail('Writer-like files are missing from project-data/lineage/writers.json', { unregistered })
  }

  const tableBoundaryViolations = []
  for (const item of writerLikeFiles) {
    const writer = writersByPath.get(item.path)
    const allowedTables = new Set(writer.allowedTables || [])
    const missing = item.tables.filter((table) => !allowedTables.has(table))
    if (missing.length > 0) {
      tableBoundaryViolations.push({
        writer: writer.id,
        path: item.path,
        detectedTables: item.tables,
        missingAllowedTables: missing,
      })
    }
  }

  if (tableBoundaryViolations.length > 0) {
    fail('Registered writer does not allow all detected mutation tables', { tableBoundaryViolations })
  }

  console.log(JSON.stringify({
    status: 'passed',
    writerLikeFiles: writerLikeFiles.length,
    registeredWriterLikeFiles: writerLikeFiles.filter((item) => item.registered).length,
    coverageRoots: scanRoots,
    mutationBoundary: 'read-only static writer coverage scan; no database connection or data mutation',
  }, null, 2))
}

try {
  main()
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
