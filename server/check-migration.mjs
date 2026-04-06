import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

const { Pool } = pg;
const pool = new Pool({
  host: 'db.wwdrkjnbvcbfytwnnyvs.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

try {
  // 1. 检查 job_execution_logs 的字段
  const r1 = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='job_execution_logs'
    ORDER BY ordinal_position
  `);
  console.log('job_execution_logs columns:', r1.rows.map(r => r.column_name).join(', '));

  // 2. 检查所有已创建的表
  const r2 = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name
  `);
  console.log('\n所有表 (' + r2.rows.length + '):');
  r2.rows.forEach(r => console.log(' -', r.table_name));

  // 3. 检查 notifications 字段
  const r3 = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='notifications'
    ORDER BY ordinal_position
  `);
  console.log('\nnotifications columns:', r3.rows.map(r => r.column_name).join(', '));

  // 4. 检查 standard_processes 是否有数据
  const r4 = await pool.query('SELECT COUNT(*) FROM standard_processes');
  console.log('\nstandard_processes count:', r4.rows[0].count);

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}
