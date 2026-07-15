import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith('server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const migrationNames = [
  '306_v14241_worker_runtime_job_write_rls.sql',
  '307_v14231_learning_asset_private_rls_helper_reconciliation.sql',
  '308_commercial_trigger_rpc_acl_closeout.sql',
  '309_v14231_runtime_consumer_evidence_runtime_rls.sql',
  '310_v14231_project_entity_links_runtime_rls.sql',
]

function normalizeSql(value: string) {
  return value.replace(/\r\n/g, '\n').trim()
}

describe('late v1.4 migration clean bundle', () => {
  it('contains exact 306-310 migration bodies in canonical order', () => {
    const cleanBundle = normalizeSql(readFileSync(
      resolve(serverRoot, 'migrations', 'CLEAN_MIGRATION_V4.sql'),
      'utf8',
    ))
    let previousHeaderIndex = -1

    for (const migrationName of migrationNames) {
      const migration = normalizeSql(readFileSync(
        resolve(serverRoot, 'migrations', migrationName),
        'utf8',
      ))
      const sourceHeader = [
        '-- ============================================================',
        `-- Source: ${migrationName}`,
        '-- ============================================================',
      ].join('\n')
      const sourceHeaderIndex = cleanBundle.indexOf(sourceHeader)

      expect(sourceHeaderIndex).toBeGreaterThan(previousHeaderIndex)

      const sourceBodyStart = sourceHeaderIndex + sourceHeader.length
      const nextSourceIndex = cleanBundle.indexOf(
        '\n-- ============================================================\n-- Source:',
        sourceBodyStart,
      )
      const bundledMigration = normalizeSql(cleanBundle.slice(
        sourceBodyStart,
        nextSourceIndex >= 0 ? nextSourceIndex : undefined,
      ))

      expect(bundledMigration).toBe(migration)
      previousHeaderIndex = sourceHeaderIndex
    }
  })
})
