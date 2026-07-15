/**
 * PostgreSQL 数据库直连配置
 * 使用 pg 库直连数据库，绕过 RLS 限制
 */

import dns from 'dns/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'crypto';
import { isIP } from 'net';
import { Pool, type PoolClient } from 'pg';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

import { getJobLeaseFenceRequestHeaders } from './services/jobLeaseFenceContext.js';

// 确保环境变量在 Pool 创建前加载
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, '../.env') });

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNonNegativeIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

const DB_POOL_MAX = readPositiveIntEnv('DB_POOL_MAX', 8);
const DB_IDLE_TIMEOUT_MS = readPositiveIntEnv('DB_IDLE_TIMEOUT_MS', 300000);
const DB_CONNECTION_TIMEOUT_MS = readPositiveIntEnv('DB_CONNECTION_TIMEOUT_MS', 8000);
const DB_QUERY_TIMEOUT_MS = readPositiveIntEnv('DB_QUERY_TIMEOUT_MS', 4000);
const DB_STATEMENT_TIMEOUT_MS = readPositiveIntEnv('DB_STATEMENT_TIMEOUT_MS', DB_QUERY_TIMEOUT_MS);
const DB_POOL_WARM_CONNECTIONS = Math.min(
  readNonNegativeIntEnv('DB_POOL_WARM_CONNECTIONS', Math.min(2, DB_POOL_MAX)),
  DB_POOL_MAX,
);

const PRODUCTION_LIKE_ENV_VALUES = new Set(['production', 'prod', 'staging', 'stage']);
const BYPASS_RLS_RUNTIME_ROLES = new Set([
  'postgres',
  'service_role',
  'supabase_admin',
]);

type RuntimeDatabaseConnectionConfig = {
  connectionString?: string;
  user?: string;
};

type RuntimeEnv = Record<string, string | undefined>;

type ConnectedRuntimeDatabaseRole = {
  current_user?: string | null;
  rolsuper?: boolean | null;
  rolbypassrls?: boolean | null;
};

function normalizeEnvValue(value: string | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

function stripConnectionStringSslMode(url: URL) {
  url.searchParams.delete('sslmode');
  return url;
}

function isSupabasePoolerConnection(url: URL) {
  return url.hostname.endsWith('.pooler.supabase.com') || url.port === '6543';
}

function withStatementTimeoutWhenSupported<T extends Record<string, unknown>>(
  config: T,
  supportsStatementTimeout: boolean,
) {
  if (!supportsStatementTimeout) {
    return config;
  }

  return {
    ...config,
    statement_timeout: DB_STATEMENT_TIMEOUT_MS,
  };
}

function isProductionLikeRuntime(env: RuntimeEnv) {
  return [
    env.NODE_ENV,
    env.APP_ENV,
    env.DEPLOY_ENV,
    env.RUNTIME_ENV,
    env.VERCEL_ENV,
  ].some((value) => PRODUCTION_LIKE_ENV_VALUES.has(normalizeEnvValue(value)));
}

function isKnownBypassRoleName(roleName: string) {
  return BYPASS_RLS_RUNTIME_ROLES.has(roleName)
    || Array.from(BYPASS_RLS_RUNTIME_ROLES).some((baseRole) => roleName.startsWith(`${baseRole}.`));
}

export function resolveDatabaseRoleName(config: RuntimeDatabaseConnectionConfig) {
  if (config.connectionString) {
    try {
      return decodeURIComponent(new URL(config.connectionString).username || '');
    } catch {
      return '';
    }
  }

  return config.user ?? '';
}

export function assertRuntimeDatabaseRoleAllowed(
  config: RuntimeDatabaseConnectionConfig,
  env: RuntimeEnv = process.env,
) {
  if (!isProductionLikeRuntime(env)) {
    return;
  }

  const roleName = normalizeEnvValue(resolveDatabaseRoleName(config));
  if (!isKnownBypassRoleName(roleName)) {
    return;
  }

  throw new Error(
    `Unsafe runtime database role "${roleName}": this role can bypass RLS in production-like environments. Configure DB_CONNECTION_STRING or DB_USER to a non-bypass application role, and reserve postgres/service_role credentials for migrations and diagnostics.`,
  );
}

export function assertConnectedRuntimeDatabaseRoleAllowed(
  identity: ConnectedRuntimeDatabaseRole,
  env: RuntimeEnv = process.env,
) {
  if (!isProductionLikeRuntime(env)) {
    return;
  }

  const roleName = normalizeEnvValue(identity.current_user ?? undefined);
  if (!identity.rolsuper && !identity.rolbypassrls && !isKnownBypassRoleName(roleName)) {
    return;
  }

  throw new Error(
    `Unsafe connected runtime database role "${roleName || 'unknown'}": live privileges can bypass RLS in production-like environments. Configure the application pool with a non-superuser, NOBYPASSRLS login role.`,
  );
}

async function resolveIPv4Host(host: string) {
  if (!host || isIP(host)) {
    return host;
  }

  try {
    const { address } = await dns.lookup(host, { family: 4 });
    return address;
  } catch (error) {
    console.warn('IPv4 host lookup failed, falling back to original host', { host, error });
    return host;
  }
}

async function resolveConnectionConfig() {
  const connectionString = process.env.DB_CONNECTION_STRING;
  if (connectionString) {
    const parsed = stripConnectionStringSslMode(new URL(connectionString));
    const supportsStatementTimeout = !isSupabasePoolerConnection(parsed);
    parsed.hostname = await resolveIPv4Host(parsed.hostname);

    const config = withStatementTimeoutWhenSupported({
      connectionString: parsed.toString(),
      ssl: { rejectUnauthorized: false },
      max: DB_POOL_MAX,
      idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
      query_timeout: DB_QUERY_TIMEOUT_MS,
    }, supportsStatementTimeout);
    assertRuntimeDatabaseRoleAllowed(config);
    return config;
  }

  const supabaseUrl = process.env.SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co$/)?.[1];
  const host = process.env.DB_HOST || process.env.SUPABASE_HOST || (projectRef ? `db.${projectRef}.supabase.co` : '127.0.0.1');

  const config = withStatementTimeoutWhenSupported({
    host: await resolveIPv4Host(host),
    port: Number(process.env.DB_PORT || process.env.SUPABASE_PORT || 5432),
    database: process.env.DB_NAME || process.env.SUPABASE_DATABASE || 'postgres',
    user: process.env.DB_USER || process.env.SUPABASE_USER || 'postgres',
    password: process.env.DB_PASSWORD || process.env.SUPABASE_PASSWORD || '',
    ssl: { rejectUnauthorized: false },
    max: DB_POOL_MAX,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    query_timeout: DB_QUERY_TIMEOUT_MS,
  }, Number(process.env.DB_PORT || process.env.SUPABASE_PORT || 5432) !== 6543);
  assertRuntimeDatabaseRoleAllowed(config);
  return config;
}

let poolPromise: Promise<Pool> | null = null;

type DatabaseTransactionClientLike = {
  query: (...args: any[]) => Promise<any>;
  release?: () => void;
};

type DatabasePostCommitEffect = {
  label: string;
  effect: () => Promise<void>;
};

type DatabaseTransactionContext = {
  client: DatabaseTransactionClientLike;
  nestedClient: PoolClient;
  rollbackOnly: boolean;
  postCommitEffects: DatabasePostCommitEffect[];
};

const databaseTransactionStorage = new AsyncLocalStorage<DatabaseTransactionContext>();

async function setJobLeaseFenceRequestHeaders(client: DatabaseTransactionClientLike) {
  const headers = getJobLeaseFenceRequestHeaders();
  if (!headers) return;

  await client.query(
    "SELECT set_config('request.headers', $1, TRUE)",
    [JSON.stringify(headers)],
  );
}

function emptyQueryResult() {
  return {
    command: '',
    rowCount: 0,
    oid: 0,
    fields: [],
    rows: [],
  };
}

function createNestedTransactionClient(context: DatabaseTransactionContext): PoolClient {
  return {
    query: async (textOrConfig: unknown, values?: unknown[]) => {
      const sql = typeof textOrConfig === 'string'
        ? textOrConfig
        : String((textOrConfig as { text?: unknown } | null)?.text ?? '');
      const normalized = sql.trim().replace(/;$/, '').toUpperCase();
      if (normalized === 'BEGIN' || normalized === 'COMMIT') {
        return emptyQueryResult();
      }
      if (normalized === 'ROLLBACK') {
        context.rollbackOnly = true;
        return emptyQueryResult();
      }
      return context.client.query(textOrConfig as any, values as any);
    },
    release: () => undefined,
  } as unknown as PoolClient;
}

export function isDatabaseTransactionActive(): boolean {
  return Boolean(databaseTransactionStorage.getStore());
}

export async function registerDatabasePostCommitEffect(
  label: string,
  effect: () => Promise<void>,
): Promise<void> {
  const context = databaseTransactionStorage.getStore();
  if (!context) {
    await effect();
    return;
  }
  context.postCommitEffects.push({ label, effect });
}

export async function runWithDatabaseTransactionClient<T>(
  client: DatabaseTransactionClientLike,
  work: () => Promise<T>,
): Promise<T> {
  if (databaseTransactionStorage.getStore()) {
    return work();
  }

  await client.query('BEGIN');
  const context = {
    client,
    nestedClient: null as unknown as PoolClient,
    rollbackOnly: false,
    postCommitEffects: [],
  } satisfies DatabaseTransactionContext;
  context.nestedClient = createNestedTransactionClient(context);

  let result: T;
  try {
    await setJobLeaseFenceRequestHeaders(client);
    result = await databaseTransactionStorage.run(context, work);
    if (context.rollbackOnly) {
      throw Object.assign(new Error('Transaction was marked rollback-only by a nested operation'), {
        code: 'TRANSACTION_MARKED_ROLLBACK_ONLY',
        statusCode: 500,
      });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release?.();
  }

  for (const { label, effect } of context.postCommitEffects) {
    try {
      await effect();
    } catch (error) {
      console.error('Database post-commit effect failed', {
        label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}

export async function withDatabaseTransaction<T>(work: () => Promise<T>): Promise<T> {
  if (databaseTransactionStorage.getStore()) return work();
  const pool = await getPool();
  const client = await pool.connect();
  return runWithDatabaseTransactionClient(client, work);
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = resolveConnectionConfig().then(async (config) => {
      const pool = new Pool(config);
      pool.on('error', (error) => {
        console.warn('Database pool idle client error', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      try {
        if (isProductionLikeRuntime(process.env)) {
          const identityResult = await pool.query<ConnectedRuntimeDatabaseRole>(`
            SELECT current_user,
                   COALESCE(rolsuper, FALSE) AS rolsuper,
                   COALESCE(rolbypassrls, FALSE) AS rolbypassrls
              FROM pg_catalog.pg_roles
             WHERE rolname = current_user
          `);
          assertConnectedRuntimeDatabaseRoleAllowed(identityResult.rows[0] ?? {}, process.env);
        }
        return pool;
      } catch (error) {
        await pool.end();
        throw error;
      }
    });
  }

  return poolPromise;
}

export async function closeDatabasePool() {
  if (!poolPromise) {
    return;
  }

  const activePoolPromise = poolPromise;
  poolPromise = null;
  const pool = await activePoolPromise;
  await pool.end();
}

export async function warmDatabasePool() {
  if (DB_POOL_WARM_CONNECTIONS <= 0) {
    return { connections: 0, duration: 0 };
  }

  const start = Date.now();
  const pool = await getPool();
  await Promise.all(
    Array.from({ length: DB_POOL_WARM_CONNECTIONS }, () => pool.query('SELECT 1')),
  );
  const duration = Date.now() - start;

  console.log('Database pool warmed', { connections: DB_POOL_WARM_CONNECTIONS, duration });
  return { connections: DB_POOL_WARM_CONNECTIONS, duration };
}

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const queryFingerprint = createHash('sha256').update(text).digest('hex').slice(0, 16);
  try {
    const context = databaseTransactionStorage.getStore();
    const res = context
      ? await context.client.query(text, params)
      : getJobLeaseFenceRequestHeaders()
        ? await withDatabaseTransaction(async () => {
            const fencedContext = databaseTransactionStorage.getStore();
            if (!fencedContext) {
              throw new Error('Job lease fenced query did not establish a database transaction');
            }
            return fencedContext.client.query(text, params);
          })
        : await (await getPool()).query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', {
      queryFingerprint,
      duration,
      rows: res.rowCount,
    });
    return res;
  } catch (error) {
    console.error('Database query error', {
      queryFingerprint,
      duration: Date.now() - start,
      code: String((error as { code?: unknown } | null)?.code ?? 'UNKNOWN'),
      message: error instanceof Error ? error.message : 'database query failed',
    });
    throw error;
  }
}

export async function getClient() {
  const context = databaseTransactionStorage.getStore();
  if (context) return context.nestedClient;
  const pool = await getPool();
  const client = await pool.connect();
  return client;
}

export default getPool;
