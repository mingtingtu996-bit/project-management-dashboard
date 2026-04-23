// run-migration.js — 指向规范 CLEAN bundle 的人工执行指引
// 用法: node run-migration.js
// 前提: .env 中有 SUPABASE_URL 和 SUPABASE_SERVICE_KEY

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const CANONICAL_CLEAN_BUNDLE = 'CLEAN_MIGRATION_V4.sql';

// 从 .env 读取配置
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
});

const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
const DB_PASSWORD = env.DB_PASSWORD;

console.log('Supabase URL:', SUPABASE_URL);
console.log('Service Key:', SERVICE_KEY ? SERVICE_KEY.substring(0, 15) + '...' : 'NOT FOUND');
console.log('DB Password:', DB_PASSWORD ? '***found***' : 'NOT FOUND');

// 读取迁移 SQL
const sqlPath = path.join(__dirname, 'migrations', CANONICAL_CLEAN_BUNDLE);
const sql = fs.readFileSync(sqlPath, 'utf-8');
console.log(`\nMigration SQL loaded: ${sql.length} chars, ${sql.split('\n').length} lines`);

// 提取项目 ID
const projectId = new URL(SUPABASE_URL).hostname.split('.')[0];
console.log('Project ID:', projectId);

// Supabase pg query endpoint (使用 service role 通过 REST API 执行 SQL)
// POST https://[project-ref].supabase.co/rest/v1/rpc/... 不行，只能调函数
// 用 pg 直连: postgres://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
// 但我们没有 pg 模块

// 最终方案：用 Supabase Management API 的 SQL endpoint
// 这个需要 project access token，不是 service role key

console.log('\n---');
console.log('注意: Supabase 没有直接的 HTTP API 执行 DDL SQL。');
console.log('DDL (CREATE TABLE, DROP TABLE 等) 只能通过以下方式执行:');
console.log('  1. Supabase Dashboard → SQL Editor');
console.log('  2. psql 直连数据库');
console.log('  3. Supabase CLI (supabase db push)');
console.log('');
console.log('当前环境没有 psql 和 supabase CLI，npm 也无法安装新模块。');
console.log('');
console.log('请手动操作 (30秒):');
console.log('  1. 打开 ' + SUPABASE_URL.replace('.supabase.co', '/project/').replace('https://', 'https://supabase.com/dashboard/project/'));
console.log('  2. 点击左侧 SQL Editor');
console.log('  3. 复制 ' + sqlPath + ' 全部内容');
console.log('  4. 粘贴到 SQL Editor，点击 Run');
console.log('');
console.log('或者，如果你能安装 psql，连接命令:');
console.log('  psql "postgresql://postgres.' + projectId + ':' + DB_PASSWORD + '@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" -f ' + sqlPath);
