import { describe, expect, it } from 'vitest'

import {
  buildRuntimeDatabaseLoginRoleRecoveryContext,
  buildRepairRuntimeDatabaseLoginRoleSql,
  classifyRuntimeLoginRepairFailure,
  withRuntimeLoginRepairTimeouts,
  resolveRuntimeDatabaseLoginRoleRepairConfig,
} from '../scripts/repair-runtime-database-login-role.js'

describe('repair runtime database login role', () => {
  it('derives the concrete login role and password from the runtime pooler connection string', () => {
    const config = resolveRuntimeDatabaseLoginRoleRepairConfig({
      SUPABASE_MIGRATION_URL: 'postgresql://postgres:migration-secret@db.example.supabase.co:5432/postgres',
      DB_CONNECTION_STRING:
        'postgresql://workbuddy_runtime_login.wwdrkjnbvcbfytwnnyvs:runtime-secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
    })

    expect(config).toEqual({
      roleName: 'workbuddy_runtime_login',
      rolePassword: 'runtime-secret',
      shouldVerifyRuntimeConnection: true,
    })
  })

  it('requires a privileged migration connection instead of trying to repair through the missing runtime role', () => {
    expect(() =>
      resolveRuntimeDatabaseLoginRoleRepairConfig({
        DATABASE_URL:
          'postgresql://workbuddy_runtime_login.wwdrkjnbvcbfytwnnyvs:runtime-secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
      }),
    ).toThrow(/SUPABASE_MIGRATION_URL/)
  })

  it('rejects unsafe role names before generating DDL', () => {
    expect(() =>
      resolveRuntimeDatabaseLoginRoleRepairConfig({
        SUPABASE_MIGRATION_URL: 'postgresql://postgres:migration-secret@db.example.supabase.co:5432/postgres',
        WORKBUDDY_RUNTIME_LOGIN_ROLE: 'workbuddy_runtime_login;drop role postgres',
        WORKBUDDY_RUNTIME_LOGIN_PASSWORD: 'runtime-secret',
      }),
    ).toThrow(/invalid runtime login role/)
  })

  it('generates idempotent SQL without logging the password in metadata', () => {
    const sql = buildRepairRuntimeDatabaseLoginRoleSql({
      roleName: 'workbuddy_runtime_login',
      rolePassword: "runtime'secret",
    })

    expect(sql).toContain("format('CREATE ROLE %I LOGIN INHERIT NOBYPASSRLS PASSWORD %L'")
    expect(sql).toContain("format('ALTER ROLE %I WITH LOGIN INHERIT NOBYPASSRLS PASSWORD %L'")
    expect(sql).toContain('GRANT workbuddy_runtime TO workbuddy_runtime_login')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.is_active_company_member(UUID, TEXT[]) TO workbuddy_runtime_login')
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.is_active_project_member(UUID, TEXT[]) TO workbuddy_runtime_login')
    expect(sql).toContain("'runtime''secret'")
  })

  it('adds bounded connection and statement timeouts to migration client config', () => {
    expect(
      withRuntimeLoginRepairTimeouts({
        connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
        ssl: { rejectUnauthorized: false },
      }, {
        RUNTIME_LOGIN_REPAIR_DB_CONNECTION_TIMEOUT_MS: '9000',
        RUNTIME_LOGIN_REPAIR_DB_QUERY_TIMEOUT_MS: '11000',
      }),
    ).toEqual({
      connectionString: 'postgresql://postgres:secret@db.example.supabase.co:5432/postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 9000,
      query_timeout: 11000,
      statement_timeout: 11000,
    })
  })

  it('does not pass statement_timeout to pooler migration connections', () => {
    expect(
      withRuntimeLoginRepairTimeouts({
        connectionString: 'postgresql://postgres:secret@db.example.supabase.co:6543/postgres',
        ssl: { rejectUnauthorized: false },
      }, {
        RUNTIME_LOGIN_REPAIR_DB_CONNECTION_TIMEOUT_MS: '9000',
        RUNTIME_LOGIN_REPAIR_DB_QUERY_TIMEOUT_MS: '11000',
      }),
    ).toEqual({
      connectionString: 'postgresql://postgres:secret@db.example.supabase.co:6543/postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 9000,
      query_timeout: 11000,
    })
  })

  it('classifies external connection failures into actionable categories', () => {
    expect(classifyRuntimeLoginRepairFailure(new Error('(ENOTFOUND) tenant/user postgres.project_ref not found'))).toBe(
      'migration_pooler_tenant_user_missing',
    )
    expect(classifyRuntimeLoginRepairFailure(new Error('timeout expired'))).toBe('migration_database_connection_timeout')
    expect(classifyRuntimeLoginRepairFailure(Object.assign(new Error('password authentication failed'), { code: '28P01' }))).toBe(
      'migration_database_auth_failed',
    )
  })

  it('builds a shareable recovery context without printing database secrets', () => {
    const context = buildRuntimeDatabaseLoginRoleRecoveryContext({
      SUPABASE_URL: 'https://wwdrkjnbvcbfytwnnyvs.supabase.co',
      SUPABASE_MIGRATION_URL:
        'postgresql://postgres.wwdrkjnbvcbfytwnnyvs:migration-secret@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require',
      DB_CONNECTION_STRING:
        'postgresql://workbuddy_runtime_login:runtime-secret@db.wwdrkjnbvcbfytwnnyvs.supabase.co:5432/postgres?sslmode=require',
    }, 'migration_pooler_tenant_user_missing')

    expect(context).toMatchObject({
      source: 'runtime_database_login_role_recovery_context',
      safeToShare: true,
      secretsPrinted: false,
      failureCategory: 'migration_pooler_tenant_user_missing',
      expectedRuntimePoolerUser: 'workbuddy_runtime_login.wwdrkjnbvcbfytwnnyvs',
      runtimeConnection: {
        source: 'DB_CONNECTION_STRING',
        user: 'workbuddy_runtime_login',
        host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
        port: '5432',
        connectionKind: 'supabase_direct',
        hasPassword: true,
      },
      migrationConnection: {
        source: 'SUPABASE_MIGRATION_URL',
        user: 'postgres.wwdrkjnbvcbfytwnnyvs',
        host: 'aws-0-ap-southeast-1.pooler.supabase.com',
        port: '6543',
        connectionKind: 'supabase_pooler',
        hasPassword: true,
      },
    })
    expect(context.operatorActions).toContain(
      'replace_pooler_migration_url_with_valid_supabase_pooler_credentials_or_direct_postgres_connection',
    )

    const serialized = JSON.stringify(context)
    expect(serialized).not.toContain('runtime-secret')
    expect(serialized).not.toContain('migration-secret')
    expect(serialized).not.toContain('postgresql://')
  })
})
