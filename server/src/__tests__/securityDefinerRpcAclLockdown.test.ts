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

describe('security definer RPC ACL lockdown', () => {
  it('does not leave replace_task_dependencies executable by default PUBLIC grants on fresh installs', () => {
    const migration = executableSql(readMigration('122_create_construction_task_standard_model.sql'))

    expect(migration).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.replace_task_dependencies/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.replace_task_dependencies\(UUID,\s*JSONB\)\s+FROM\s+PUBLIC/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.replace_task_dependencies\(UUID,\s*JSONB\)\s+FROM\s+anon/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.replace_task_dependencies\(UUID,\s*JSONB\)\s+FROM\s+authenticated/i)
  })

  it('does not leave task-code SECURITY DEFINER helpers publicly executable on fresh installs', () => {
    const migration = executableSql(readMigration('123_create_task_code_rules.sql'))

    expect(migration).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.nextval\(TEXT\)/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.increment_task_code_sequence\(UUID,\s*UUID,\s*TEXT,\s*INTEGER\)\s+FROM\s+PUBLIC/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.increment_task_code_sequence\(UUID,\s*UUID,\s*TEXT,\s*INTEGER\)\s+FROM\s+anon/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.increment_task_code_sequence\(UUID,\s*UUID,\s*TEXT,\s*INTEGER\)\s+FROM\s+authenticated/i)
  })

  it('ships a post-fix migration that revokes legacy RPC grants and removes dynamic nextval', () => {
    const migration = executableSql(readMigration('216_v14231_lockdown_security_definer_rpcs.sql'))

    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.replace_task_dependencies\(UUID,\s*JSONB\)\s+FROM\s+PUBLIC/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.replace_task_dependencies\(UUID,\s*JSONB\)\s+FROM\s+anon/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.replace_task_dependencies\(UUID,\s*JSONB\)\s+FROM\s+authenticated/i)
    expect(migration).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.nextval\(TEXT\)/i)
    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.nextval/i)
  })
})
