import { promises as fs } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildProductionMigrationGovernanceReport,
  type ProductionMigrationGovernanceInput,
  type ProductionMigrationGovernanceReport,
} from '../services/migrationProductionGovernanceService.js'
import {
  discoverMigrationFiles,
} from '../services/migrationRunner.js'

const migrationsDir = resolve(process.cwd(), 'migrations')

type ScriptArgs = {
  evidenceFile?: string
  outputFile?: string
}

function parseArgs(argv: string[]): ScriptArgs {
  const evidenceFileIndex = argv.findIndex((arg) => arg === '--evidence-file')
  const outputFileIndex = argv.findIndex((arg) => arg === '--output')
  return {
    evidenceFile: evidenceFileIndex >= 0 ? argv[evidenceFileIndex + 1] : undefined,
    outputFile: outputFileIndex >= 0 ? argv[outputFileIndex + 1] : undefined,
  }
}

export type ProductionMigrationGovernanceCheckResult = {
  report: ProductionMigrationGovernanceReport
  exitCode: 0 | 1
}

export async function runProductionMigrationGovernanceCheck(
  argv: string[] = process.argv.slice(2),
  options: {
    migrationsDirectory?: string
    writeOutput?: (message: string) => void
  } = {},
): Promise<ProductionMigrationGovernanceCheckResult> {
  const args = parseArgs(argv)
  const baseMigrationsDir = options.migrationsDirectory ?? migrationsDir
  const evidenceInput = args.evidenceFile ? await readEvidenceFile(args.evidenceFile) : {}
  const localMigrations = await discoverMigrationFiles(baseMigrationsDir).catch(() => [])
  const cleanBundlePresent = await fileExists(resolve(baseMigrationsDir, 'CLEAN_MIGRATION_V4.sql'))
  const localInventory = {
    localMigrations: localMigrations.map((migration) => ({
      filename: migration.filename,
      version: migration.version,
    })),
    cleanBundle: {
      ...evidenceInput.cleanBundle,
      present: cleanBundlePresent,
      filename: 'CLEAN_MIGRATION_V4.sql',
    },
  }

  const report = buildProductionMigrationGovernanceReport({
    inventoryFrozen: false,
    ledger: {
      available: false,
      rowCount: null,
      rows: [],
    },
    liveCatalog: {
      baselineObjectCount: 0,
      baselineObjects: [],
    },
    ...evidenceInput,
    ...localInventory,
  })

  options.writeOutput?.(JSON.stringify(report, null, 2))
  if (args.outputFile) {
    const outputPath = resolve(args.outputFile)
    await fs.mkdir(dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }

  return {
    report,
    exitCode: report.status === 'closed' ? 0 : 1,
  }
}

async function main() {
  const result = await runProductionMigrationGovernanceCheck(process.argv.slice(2), {
    writeOutput: (message) => console.log(message),
  })
  process.exitCode = result.exitCode
}

async function readEvidenceFile(path: string): Promise<ProductionMigrationGovernanceInput> {
  const raw = await fs.readFile(resolve(path), 'utf8')
  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('production migration governance evidence file must be a JSON object')
  }

  return parsed as ProductionMigrationGovernanceInput
}

async function fileExists(path: string) {
  return fs.stat(path).then((stat) => stat.isFile()).catch(() => false)
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : ''
const modulePath = fileURLToPath(import.meta.url)

if (executedPath && resolve(modulePath) === executedPath) {
  main().catch((error) => {
    console.error('Production migration governance check failed:', error)
    process.exitCode = 1
  })
}
