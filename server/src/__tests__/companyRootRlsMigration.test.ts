import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readMigration(filename: string) {
  return readFileSync(resolve(serverRoot, 'migrations', filename), 'utf8')
}

function executableSql(source: string) {
  return source
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

function expectCompanyRootRls(sql: string) {
  expect(sql).toMatch(/ALTER\s+TABLE\s+public\.companies\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
  expect(sql).toMatch(/ALTER\s+TABLE\s+public\.company_members\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i)
  expect(sql).toMatch(/CREATE\s+POLICY\s+companies_select_policy\s+ON\s+public\.companies/i)
  expect(sql).toMatch(/CREATE\s+POLICY\s+companies_write_policy\s+ON\s+public\.companies/i)
  expect(sql).toMatch(/CREATE\s+POLICY\s+company_members_select_policy\s+ON\s+public\.company_members/i)
  expect(sql).toMatch(/CREATE\s+POLICY\s+company_members_write_policy\s+ON\s+public\.company_members/i)
  expect(sql).toMatch(/auth\.uid\(\)/i)
  expect(sql).toMatch(/current_setting\('role',\s*true\)\s*=\s*'service_role'/i)
}

describe('company root table RLS migrations', () => {
  it('enables RLS and policies for companies and company_members on fresh installs', () => {
    expectCompanyRootRls(executableSql(readMigration('137_company_workspace_isolation.sql')))
  })

  it('ships a post-fix migration that enables RLS and policies on live company roots', () => {
    expectCompanyRootRls(executableSql(readMigration('217_v14231_company_root_rls.sql')))
  })
})
