import { resolve } from 'node:path'

import pg from 'pg'

import {
  applyMigration,
  discoverMigrationFiles,
  ensureSchemaMigrationsTable,
  getPendingMigrations,
  listExistingBaselineTables,
  listAppliedMigrations,
  resolveMigrationConnectionConfig,
  shouldBlockUnsafeMigrationReplay,
} from '../services/migrationRunner.js'

const { Client } = pg

const migrationsDir = resolve(process.cwd(), 'migrations')
const args = new Set(process.argv.slice(2))
const isPlanMode = args.has('--plan') || args.has('--dry-run')

async function main() {
  const discovered = await discoverMigrationFiles(migrationsDir)

  const client = new Client(resolveMigrationConnectionConfig())
  await client.connect()

  try {
    await ensureSchemaMigrationsTable(client)
    const applied = await listAppliedMigrations(client)
    const existingBaselineTables = await listExistingBaselineTables(client)

    if (shouldBlockUnsafeMigrationReplay(applied, existingBaselineTables)) {
      throw new Error(
        `检测到现有业务库但 migration ledger 为空（基线表: ${existingBaselineTables.join(', ')}）。请先执行 npm run migrate:adopt-baseline --workspace=server，再继续跑 pending migrations。`,
      )
    }

    const pending = getPendingMigrations(discovered, applied)

    if (isPlanMode) {
      console.log(`发现 ${discovered.length} 个正式 migration 文件。`)
      console.log(`已记录 migration: ${applied.length}`)
      console.log(`待执行 migration: ${pending.length}`)

      if (pending.length > 0) {
        console.log('待执行清单:')
        pending.forEach((migration) => {
          console.log(`- ${migration.filename}`)
        })
      } else {
        console.log('没有待执行 migration。')
      }
      return
    }

    console.log(`已记录 migration: ${applied.length}`)
    console.log(`待执行 migration: ${pending.length}`)

    for (const migration of pending) {
      console.log(`开始执行 ${migration.filename}`)
      await applyMigration(client, migration)
      console.log(`已完成 ${migration.filename}`)
    }

    if (pending.length === 0) {
      console.log('没有待执行 migration。')
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('执行 migration 失败:', error)
  process.exitCode = 1
})
