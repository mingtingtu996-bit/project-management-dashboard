import { resolve } from 'node:path'

import pg from 'pg'

import {
  calculateMigrationChecksum,
  discoverMigrationFiles,
  ensureSchemaMigrationsTable,
  listAppliedMigrations,
  listExistingBaselineTables,
  readMigrationSql,
  resolveMigrationConnectionConfig,
  selectMigrationsThroughVersion,
} from '../services/migrationRunner.js'

const { Client } = pg

const migrationsDir = resolve(process.cwd(), 'migrations')

type ScriptArgs = {
  dryRun: boolean
  throughVersion: string
}

function parseArgs(argv: string[]): ScriptArgs {
  const args = new Set(argv)
  const throughFlagIndex = argv.findIndex((arg) => arg === '--through')
  const throughVersion = throughFlagIndex >= 0 ? argv[throughFlagIndex + 1]?.trim().toLowerCase() : '084'

  if (!throughVersion) {
    throw new Error('baseline 认领需要明确 through version，例如 --through 084')
  }

  return {
    dryRun: args.has('--plan') || args.has('--dry-run'),
    throughVersion,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const discovered = await discoverMigrationFiles(migrationsDir)
  const baseline = selectMigrationsThroughVersion(discovered, args.throughVersion)

  if (baseline.length === 0) {
    throw new Error(`没有找到 <= ${args.throughVersion} 的正式 migration 文件`)
  }

  const client = new Client(resolveMigrationConnectionConfig())
  await client.connect()

  try {
    await ensureSchemaMigrationsTable(client)

    const [applied, existingBaselineTables] = await Promise.all([
      listAppliedMigrations(client),
      listExistingBaselineTables(client),
    ])

    if (existingBaselineTables.length === 0) {
      throw new Error(
        '当前数据库看起来像空库，拒绝 baseline adoption。请直接执行 migrate:pending 初始化空库。',
      )
    }

    const appliedSet = new Set(applied.map((migration) => migration.filename))
    const missingBaseline = baseline.filter((migration) => !appliedSet.has(migration.filename))

    console.log(`baseline 目标版本: ${args.throughVersion}`)
    console.log(`命中正式 migration: ${baseline.length}`)
    console.log(`已记录 migration: ${applied.length}`)
    console.log(`识别到现有基线表: ${existingBaselineTables.join(', ')}`)
    console.log(`待认领 migration: ${missingBaseline.length}`)

    if (missingBaseline.length === 0) {
      console.log('没有需要补记的 baseline migration。')
      return
    }

    missingBaseline.forEach((migration) => {
      console.log(`- ${migration.filename}`)
    })

    if (args.dryRun) {
      console.log('当前为 plan 模式，未写入 schema_migrations。')
      return
    }

    await client.query('BEGIN')

    for (const migration of missingBaseline) {
      const sql = await readMigrationSql(migration)
      const checksum = calculateMigrationChecksum(sql)

      await client.query(
        `
          INSERT INTO public.schema_migrations (filename, version, checksum)
          VALUES ($1, $2, $3)
          ON CONFLICT (filename) DO UPDATE
          SET version = EXCLUDED.version,
              checksum = EXCLUDED.checksum
        `,
        [migration.filename, migration.version, checksum],
      )
    }

    await client.query('COMMIT')
    console.log(`baseline 认领完成，共写入 ${missingBaseline.length} 条 migration 记录。`)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('baseline 认领失败:', error)
  process.exitCode = 1
})
