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

const pool = new Pool({
  host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
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
