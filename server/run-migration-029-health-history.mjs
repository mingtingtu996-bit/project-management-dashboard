import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

function getDatabaseHost() {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('缺少 SUPABASE_URL，无法推导数据库主机地址');
  }

  const hostname = new URL(supabaseUrl).hostname;
  return hostname.startsWith('db.') ? hostname : `db.${hostname}`;
}

const { Client } = pg;
const client = new Client({
  host: getDatabaseHost(),
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  if (!process.env.DB_PASSWORD) {
    throw new Error('缺少 DB_PASSWORD，无法执行数据库迁移');
  }

  const sql = readFileSync(join(__dirname, 'migrations', '029_add_project_health_history.sql'), 'utf-8');

  await client.connect();
  console.log('🚀 开始执行迁移 029：project_health_history');

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    const tableCheck = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'project_health_history'
    `);

    const constraintCheck = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'project_health_history'
        AND c.conname = 'project_health_history_health_status_check'
    `);

    console.log(`✅ project_health_history 表已就绪：${tableCheck.rows[0].count === 1 ? '是' : '否'}`);
    console.log(`✅ 健康状态约束已就绪：${constraintCheck.rows[0].count === 1 ? '是' : '否'}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('❌ 迁移 029 执行失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
