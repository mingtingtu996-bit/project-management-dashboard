#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function pathOf(relativePath) {
  return join(repoRoot, relativePath)
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathOf(relativePath), 'utf8'))
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'failed', message, ...details }, null, 2))
  process.exit(1)
}

async function main() {
  const writers = await readJson('project-data/lineage/writers.json')
  const forbidden = await readJson('project-data/boundaries/forbidden-writes.json')
  const tableCatalog = await readJson('project-data/catalog/tables.json')
  const knownTables = new Set(tableCatalog.tables.map((table) => table.id))
  const forbiddenTables = new Set(forbidden.forbiddenDirectExternalWrites)
  const seen = new Set()

  for (const writer of writers.writers) {
    if (!writer.id) fail('Writer id is missing', { writer })
    if (seen.has(writer.id)) fail(`Duplicate writer id: ${writer.id}`)
    seen.add(writer.id)
    if (!writer.path || !existsSync(pathOf(writer.path))) fail(`Writer path is missing: ${writer.id}`, { path: writer.path })
    if (!Array.isArray(writer.allowedTables)) fail(`Writer allowedTables must be an array: ${writer.id}`)
    for (const table of writer.allowedTables) {
      if (table === 'runtime_publication_tables') continue
      if (!knownTables.has(table)) fail(`Writer references unknown allowed table: ${table}`, { writer: writer.id })
      if (writer.defaultMode === 'candidate_only' && forbiddenTables.has(table)) {
        fail(`Candidate-only writer may not allow forbidden business table: ${table}`, { writer: writer.id })
      }
    }
    if (writer.defaultMode === 'candidate_only' && !writer.requiresUnlock) {
      fail(`Candidate-only DB apply writer must require unlock: ${writer.id}`)
    }
  }

  console.log(JSON.stringify({
    status: 'passed',
    writers: writers.writers.length,
    mutationBoundary: 'read-only writer registry check; no database connection or data mutation',
  }, null, 2))
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
