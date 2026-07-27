import { existsSync, readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

const migrationName = '227_v14231_force_core_rls_and_project_policies.sql'
const migrationPath = resolve(serverRoot, 'migrations', migrationName)

function readMigration() {
  return readFileSync(migrationPath, 'utf8')
}

function executableSql(source: string) {
  return source
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('core RLS force and project policy migration', () => {
  it('ships a forward-only migration for the live C-18.L01/L02 blockers', () => {
    expect(existsSync(migrationPath)).toBe(true)
  })

  it('forces RLS on all tenant-root and core project fact tables', () => {
    const sql = executableSql(readMigration())

    for (const tableName of [
      'companies',
      'company_members',
      'projects',
      'tasks',
      'task_dependencies',
      'engineering_objects',
      'acceptance_plans',
      'project_daily_snapshot',
    ]) {
      expect(sql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${tableName}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'))
      expect(sql).toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${tableName}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'))
    }
  })

  it('recreates project policies using the company membership boundary', () => {
    const sql = executableSql(readMigration())

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.is_active_company_member\s*\(/i)
    expect(sql).toMatch(/SECURITY\s+DEFINER/i)
    expect(sql).toMatch(/SET\s+search_path\s*=\s*public,\s*pg_temp/i)
    expect(sql).toMatch(/FROM\s+public\.company_members\s+cm/i)
    expect(sql).toMatch(/cm\.company_id\s*=\s*p_company_id/i)
    expect(sql).toMatch(/cm\.user_id\s*=\s*auth\.uid\(\)/i)
    expect(sql).toMatch(/cm\.status\s*=\s*'active'/i)
    expect(sql).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.is_active_company_member\(UUID,\s*TEXT\[\]\)\s+FROM\s+PUBLIC/i)

    expect(sql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+projects_read_policy\s+ON\s+public\.projects/i)
    expect(sql).toMatch(/CREATE\s+POLICY\s+projects_read_policy\s+ON\s+public\.projects/i)
    expect(sql).toMatch(/CREATE\s+POLICY\s+projects_write_policy\s+ON\s+public\.projects/i)
    expect(sql).toMatch(/public\.is_active_company_member\(public\.projects\.company_id,\s*NULL::TEXT\[\]\)/i)
    expect(sql).toMatch(/public\.is_active_company_member\(public\.projects\.company_id,\s*ARRAY\['company_admin',\s*'editor'\]::TEXT\[\]\)/i)
  })

  it('recreates company member policies without self-recursive table scans', () => {
    const sql = executableSql(readMigration())

    expect(sql).toMatch(/DROP\s+POLICY\s+IF\s+EXISTS\s+company_members_select_policy\s+ON\s+public\.company_members/i)
    expect(sql).toMatch(/CREATE\s+POLICY\s+company_members_select_policy\s+ON\s+public\.company_members/i)
    expect(sql).toMatch(/CREATE\s+POLICY\s+company_members_write_policy\s+ON\s+public\.company_members/i)
    expect(sql).toMatch(/public\.is_active_company_member\(public\.company_members\.company_id,\s*NULL::TEXT\[\]\)/i)
    expect(sql).toMatch(/public\.is_active_company_member\(public\.company_members\.company_id,\s*ARRAY\['company_admin'\]::TEXT\[\]\)/i)
    expect(sql).not.toMatch(/FROM\s+public\.company_members\s+(viewer|admin_member)/i)
  })

  it('recreates task and acceptance policies through project company membership', () => {
    const sql = executableSql(readMigration())

    for (const [tableName, policyPrefix] of [
      ['tasks', 'tasks'],
      ['acceptance_plans', 'acceptance_plans'],
    ] as const) {
      expect(sql).toMatch(new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${policyPrefix}_read_policy\\s+ON\\s+public\\.${tableName}`, 'i'))
      expect(sql).toMatch(new RegExp(`CREATE\\s+POLICY\\s+${policyPrefix}_read_policy\\s+ON\\s+public\\.${tableName}`, 'i'))
      expect(sql).toMatch(new RegExp(`CREATE\\s+POLICY\\s+${policyPrefix}_write_policy\\s+ON\\s+public\\.${tableName}`, 'i'))
    }

    expect(sql).toMatch(/FROM\s+public\.projects\s+p/i)
    expect(sql).toMatch(/p\.id\s*=\s*public\.tasks\.project_id/i)
    expect(sql).toMatch(/p\.id\s*=\s*public\.acceptance_plans\.project_id/i)
    expect(sql).toMatch(/public\.is_active_company_member\(p\.company_id,\s*NULL::TEXT\[\]\)/i)
    expect(sql).toMatch(/public\.is_active_company_member\(p\.company_id,\s*ARRAY\['company_admin',\s*'editor'\]::TEXT\[\]\)/i)
  })
})
