#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'project-testing',
  'reports',
  'default-master-plan-profiles',
  'runtime-seed-governance-preflight.json',
)
const VALIDATION_SERVICE = path.join(
  REPO_ROOT,
  'server',
  'src',
  'services',
  'algorithmSeedValidationService.ts',
)
const REQUIRED_SEED_TYPES = [
  'standard_work_duration',
  't2_division_rhythm_template',
]

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    output: DEFAULT_OUTPUT,
    failOnBlocked: false,
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--output') {
      args.output = path.resolve(argv[index + 1] ?? '')
      index += 1
    } else if (arg === '--fail-on-blocked') {
      args.failOnBlocked = true
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return args
}

export function buildRuntimeSeedGovernancePreflight({
  validationResults = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const resultBySeedType = new Map(
    validationResults
      .map((result) => readRecord(result))
      .map((result) => [text(result.seedType), readRecord(result.validation)]),
  )
  const validations = REQUIRED_SEED_TYPES.map((seedType) => {
    const validation = resultBySeedType.get(seedType) ?? null
    const entries = readArray(validation?.entries)
    const entry = entries.find((candidate) => text(candidate?.seedType) === seedType) ?? entries[0] ?? null
    const issues = readArray(validation?.issues)
      .filter((issue) => !text(issue?.seedType) || text(issue.seedType) === seedType)
    return {
      seedType,
      provided: Boolean(validation),
      strict: validation?.strict === true,
      ok: validation?.ok === true,
      seedVersion: text(entry?.seedVersion) || null,
      expectedCount: numberOrNull(entry?.expectedCount),
      actualCount: numberOrNull(entry?.actualCount),
      issueCodes: unique(issues.map((issue) => text(issue?.code))),
      issues: issues.map((issue) => ({
        severity: text(issue?.severity) || null,
        code: text(issue?.code) || null,
        message: text(issue?.message) || null,
      })),
    }
  })
  const seedTypesReadyForImport = validations
    .filter((validation) => validation.provided && validation.strict && validation.ok)
    .map((validation) => validation.seedType)
  const blockers = validations.flatMap((validation) => {
    if (!validation.provided) return [`runtime_seed_governance_validation_missing:${validation.seedType}`]
    if (!validation.strict || !validation.ok) return [`runtime_seed_governance_validation_failed:${validation.seedType}`]
    return []
  })
  const readyForGovernedImport = blockers.length === 0
  return {
    schemaVersion: 'workbuddy-default-master-plan-runtime-seed-governance-preflight/v1',
    source: 'check-default-master-plan-runtime-seed-governance-preflight',
    generatedAt,
    status: readyForGovernedImport
      ? 'runtime_seed_governance_preflight_ready'
      : 'runtime_seed_governance_preflight_blocked',
    requiredSeedTypes: [...REQUIRED_SEED_TYPES],
    seedTypesReadyForImport,
    readyForGovernedImport,
    validations,
    blockers,
    productionReady: false,
    mutationBoundary: {
      validatesStaticSeedRegistry: true,
      readsDatabase: false,
      writesReportFiles: true,
      writesProductionTables: false,
      writesAlgorithmSeedVersions: false,
      writesAlgorithmSeedRecords: false,
      writesAlgorithmSeedImportLogs: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      writesBaselines: false,
    },
  }
}

export async function checkDefaultMasterPlanRuntimeSeedGovernancePreflight({
  validator,
  output = DEFAULT_OUTPUT,
  now = new Date(),
} = {}) {
  if (typeof validator !== 'function') throw new Error('validator is required')
  const validationResults = REQUIRED_SEED_TYPES.map((seedType) => ({
    seedType,
    validation: validator({ strict: true, seedType }),
  }))
  const report = buildRuntimeSeedGovernancePreflight({
    validationResults,
    generatedAt: now.toISOString(),
  })
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

function readRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return String(value ?? '').trim()
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function numberOrNull(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/')
}

async function main() {
  const args = parseArgs()
  if (args.help) {
    console.log('Usage: npx tsx project-testing/tools/check-default-master-plan-runtime-seed-governance-preflight.mjs [--output <json>] [--fail-on-blocked]')
    return
  }
  const { validateV1474AlgorithmSeeds } = await import(pathToFileURL(VALIDATION_SERVICE).href)
  const report = await checkDefaultMasterPlanRuntimeSeedGovernancePreflight({
    validator: validateV1474AlgorithmSeeds,
    output: args.output,
  })
  console.log(JSON.stringify({
    status: report.status,
    output: repoRelative(args.output),
    readyForGovernedImport: report.readyForGovernedImport,
    seedTypesReadyForImport: report.seedTypesReadyForImport,
    blockers: report.blockers,
  }))
  if (args.failOnBlocked && !report.readyForGovernedImport) process.exitCode = 1
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  await main()
}
