#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function pathOf(relativePath) {
  return join(repoRoot, relativePath)
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(pathOf(relativePath), 'utf8'))
}

async function listContractFiles(relativeDir) {
  const entries = await readdir(pathOf(relativeDir), { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.contract.json'))
    .map((entry) => `${relativeDir}/${entry.name}`)
    .sort()
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ status: 'failed', message, ...details }, null, 2))
  process.exit(1)
}

async function main() {
  const tableCatalog = await readJson('project-data/catalog/tables.json')
  const writers = await readJson('project-data/lineage/writers.json')
  const quality = await readJson('project-data/quality/rules.json')
  const writerIds = new Set(writers.writers.map((writer) => writer.id))
  const qualityRuleIds = new Set(quality.rules.map((rule) => rule.id))

  let tableContractCount = 0
  for (const table of tableCatalog.tables) {
    if (!table.contractPath) continue
    if (!existsSync(pathOf(table.contractPath))) fail(`Table contract is missing: ${table.id}`, { path: table.contractPath })
    const contract = await readJson(table.contractPath)
    tableContractCount += 1
    if (contract.schemaVersion !== 'workbuddy-table-contract/v1') fail(`Unexpected table contract schema: ${table.id}`)
    if (contract.tableId !== table.id) fail(`Table contract id mismatch: ${table.id}`, { contractTableId: contract.tableId })
    for (const writerId of contract.allowedWriterRegistryIds || []) {
      if (!writerIds.has(writerId)) fail(`Table contract references unknown writer: ${writerId}`, { table: table.id })
    }
    for (const ruleId of contract.qualityRules || []) {
      if (!qualityRuleIds.has(ruleId)) fail(`Table contract references unknown quality rule: ${ruleId}`, { table: table.id })
    }
  }

  const runtimeContracts = [
    ...await listContractFiles('project-data/contracts/runtime-writers'),
    ...await listContractFiles('project-data/contracts/candidate-assets'),
  ]

  for (const contractPath of runtimeContracts) {
    if (!existsSync(pathOf(contractPath))) fail(`Runtime/candidate contract is missing: ${contractPath}`)
    const contract = await readJson(contractPath)
    if (!contract.schemaVersion || !contract.mutationBoundary) fail(`Contract metadata is incomplete: ${contractPath}`)
    if (contract.writerId && !writerIds.has(contract.writerId)) fail(`Runtime writer contract references unknown writer: ${contract.writerId}`)
  }

  for (const requiredPath of [
    'project-data/quality/datacontract/progress-knowledge-sources.datacontract.yaml',
    'project-data/quality/soda/project-daily-snapshot.soda.yml',
    'project-data/quality/soda/tasks.soda.yml',
  ]) {
    if (!existsSync(pathOf(requiredPath))) fail(`Quality template is missing: ${requiredPath}`)
  }

  console.log(JSON.stringify({
    status: 'passed',
    tableContracts: tableContractCount,
    runtimeContracts: runtimeContracts.length,
    qualityRules: quality.rules.length,
    mutationBoundary: 'read-only contract check; no database connection or data mutation',
  }, null, 2))
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)))
