/**
 * PostgreSQL 数据库直连配置
 * 使用 pg 库直连数据库，绕过 RLS 限制
 */

import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// 确保环境变量在 Pool 创建前加载
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnv({ path: path.resolve(__dirname, '../.env') });

function readPositiveIntEnv(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const DB_POOL_MAX = readPositiveIntEnv('DB_POOL_MAX', 20);
const DB_IDLE_TIMEOUT_MS = readPositiveIntEnv('DB_IDLE_TIMEOUT_MS', 30000);
const DB_CONNECTION_TIMEOUT_MS = readPositiveIntEnv('DB_CONNECTION_TIMEOUT_MS', 5000);

function resolveConnectionConfig() {
  if (process.env.DB_CONNECTION_STRING) {
    return {
      connectionString: process.env.DB_CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
      max: DB_POOL_MAX,
      idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
    };
  }

  const dbPassword = process.env.DB_PASSWORD || '';
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co$/)?.[1];

  return {
    host: projectRef ? `db.${projectRef}.supabase.co` : process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
    max: DB_POOL_MAX,
    idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
  };
}

const pool = new Pool({
  ...resolveConnectionConfig(),
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default pool;
