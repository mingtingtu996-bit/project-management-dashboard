import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  assertConnectedRuntimeDatabaseRoleAllowed,
  assertRuntimeDatabaseRoleAllowed,
  resolveDatabaseRoleName,
} from '../database.js'

describe('runtime database connection role guard', () => {
  it('extracts the database role from a connection string', () => {
    expect(resolveDatabaseRoleName({
      connectionString: 'postgresql://app_runtime:secret@db.example.supabase.co:5432/postgres',
    })).toBe('app_runtime')
  })

  it('blocks postgres as the runtime database role in production-like environments', () => {
    expect(() => assertRuntimeDatabaseRoleAllowed(
      { user: 'postgres' },
      { NODE_ENV: 'production' },
    )).toThrow(/runtime database role.*postgres.*bypass RLS/i)
  })

  it('blocks postgres when it is embedded in DATABASE_URL for staging', () => {
    expect(() => assertRuntimeDatabaseRoleAllowed(
      { connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres' },
      { APP_ENV: 'staging' },
    )).toThrow(/runtime database role.*postgres.*bypass RLS/i)
  })

  it('blocks Supabase pooler postgres.<project-ref> usernames in production', () => {
    expect(() => assertRuntimeDatabaseRoleAllowed(
      {
        connectionString: 'postgresql://postgres.wwdrkjnbvcbfytwnnyvs:secret@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres',
      },
      { NODE_ENV: 'production' },
    )).toThrow(/runtime database role.*postgres\.wwdrkjnbvcbfytwnnyvs.*bypass RLS/i)
  })

  it.each([
    { current_user: 'alias_runtime', rolsuper: true, rolbypassrls: false },
    { current_user: 'alias_runtime', rolsuper: false, rolbypassrls: true },
  ])('blocks the connected role when live privileges can bypass RLS: %j', (identity) => {
    expect(() => assertConnectedRuntimeDatabaseRoleAllowed(
      identity,
      { DEPLOY_ENV: 'production' },
    )).toThrow(/connected runtime database role.*alias_runtime.*bypass RLS/i)
  })

  it('allows local development to keep using postgres for diagnostics and migration repair', () => {
    expect(() => assertRuntimeDatabaseRoleAllowed(
      { user: 'postgres' },
      { NODE_ENV: 'development' },
    )).not.toThrow()
  })

  it('keeps production env examples from putting the migration role in the runtime pool', () => {
    const root = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'), '..')
    const example = readFileSync(resolve(root, 'deploy/env/server.production.example'), 'utf8')

    expect(example).toContain('SUPABASE_USER=workbuddy_runtime_login')
    expect(example).toContain('DB_CONNECTION_STRING=postgresql://workbuddy_runtime_login')
    expect(example).toContain('GRANT workbuddy_runtime TO workbuddy_runtime_login')
    expect(example).toContain('SUPABASE_MIGRATION_URL=postgresql://postgres')
    expect(example).not.toMatch(/^DB_CONNECTION_STRING=postgresql:\/\/postgres/m)
  })

  it('keeps the persistent API on the IPv4 session pooler and prewarms health-read concurrency', () => {
    const root = resolve(process.cwd().endsWith('server') ? process.cwd() : resolve(process.cwd(), 'server'), '..')
    const example = readFileSync(resolve(root, 'deploy/env/server.production.example'), 'utf8')

    expect(example).toMatch(/^DB_CONNECTION_STRING=.*\.pooler\.supabase\.com:5432\/postgres/m)
    expect(example).toMatch(/^SUPABASE_MIGRATION_URL=.*\.pooler\.supabase\.com:5432\/postgres/m)
    expect(example).toContain('DB_POOL_MAX=8')
    expect(example).toContain('DB_POOL_WARM_CONNECTIONS=4')
    expect(example).toContain('PROJECT_HEALTH_READ_CONCURRENCY=4')
    expect(example).toContain('TASK_READ_DIRECT_FIRST=false')
  })
})
