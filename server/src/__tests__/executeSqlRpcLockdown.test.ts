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

describe('execute_sql RPC lockdown', () => {
  it('does not recreate the historical SECURITY DEFINER arbitrary SQL RPC', () => {
    const migration = executableSql(readMigration('execute_sql_rpc.sql'))

    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.execute_sql/i)
    expect(migration).not.toMatch(/SECURITY\s+DEFINER/i)
    expect(migration).not.toMatch(/GRANT\s+EXECUTE[\s\S]+public\.execute_sql[\s\S]+TO\s+anon/i)
    expect(migration).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.execute_sql\(text,\s*jsonb\)/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.execute_sql\(text,jsonb\)\s+FROM\s+PUBLIC/i)
  })

  it('ships a canonical migration that drops existing live execute_sql overloads', () => {
    const migration = executableSql(readMigration('215_v14231_drop_execute_sql_rpc.sql'))

    expect(migration).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.execute_sql\(text,\s*jsonb\)/i)
    expect(migration).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.execute_sql\(text,\s*anyarray\)/i)
    expect(migration).toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.execute_sql\(text,jsonb\)\s+FROM\s+PUBLIC/i)
    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.execute_sql/i)
    expect(migration).not.toMatch(/GRANT\s+EXECUTE[\s\S]+public\.execute_sql[\s\S]+TO\s+anon/i)
  })
})
