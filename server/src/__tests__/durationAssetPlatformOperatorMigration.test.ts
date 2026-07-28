import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')
const migrationName = '328_duration_asset_platform_operator.sql'

function readSql(...segments: string[]) {
  const path = resolve(serverRoot, ...segments)
  return existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : ''
}

function markedSegment(sql: string) {
  const begin = sql.indexOf('-- BEGIN MIGRATION 328')
  const end = sql.indexOf('-- END MIGRATION 328')
  if (begin < 0 || end < begin) return ''
  return sql.slice(begin, end + '-- END MIGRATION 328'.length)
}

describe('duration asset platform operator migration', () => {
  it('adds a dedicated platform role without treating tenant company admins as operators', () => {
    const forward = readSql('migrations', migrationName)

    expect(forward).toContain('users_platform_role_check')
    expect(forward).toContain("'duration_governance_operator'")
    expect(forward).toContain("'commercial_operator'")
    expect(forward).not.toContain('global_role')
    expect(forward).not.toContain('company_members')
  })

  it('keeps clean install and rollback definitions explicit', () => {
    const forward = markedSegment(readSql('migrations', migrationName))
    const clean = markedSegment(readSql('migrations', 'CLEAN_MIGRATION_V4.sql'))
    const rollback = readSql('migrations', 'rollback', migrationName)

    expect(forward).not.toBe('')
    expect(clean).toBe(forward)
    expect(rollback).toContain("platform_role = 'none'")
    expect(rollback).toContain("CHECK (platform_role IN ('none', 'commercial_operator'))")
  })
})
