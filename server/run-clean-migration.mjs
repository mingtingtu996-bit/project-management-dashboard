/**
 * 执行 CLEAN_MIGRATION_V4.sql 全量迁移脚本
 * 通过 PostgreSQL 直连 Supabase 数据库
 *
 * 使用方式:
 *   node server/run-clean-migration.mjs
 *
 * 需要环境变量（在 server/.env 中已配置）:
 *   SUPABASE_URL      - Supabase 项目 URL
 *   DB_PASSWORD       - 数据库密码（首次运行需要提供）
 *
 * 或者直接设置完整连接字符串:
 *   DB_CONNECTION_STRING=postgresql://postgres:[密码]@db.xxxx.supabase.co:5432/postgres
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// 加载环境变量
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: join(__dirname, '.env') });
} catch (e) {
  console.log('⚠️  dotenv 未安装，从系统环境变量读取配置');
}

const { Client } = require('pg');

// ─── 数据库连接配置 ──────────────────────────────────────────
function getConnectionConfig() {
  // 方式1: 直接使用完整连接字符串
  if (process.env.DB_CONNECTION_STRING) {
    return { connectionString: process.env.DB_CONNECTION_STRING, ssl: { rejectUnauthorized: false } };
  }

  // 方式2: 从 SUPABASE_URL 提取项目 ID 并组合连接字符串
  const supabaseUrl = process.env.SUPABASE_URL;
  const dbPassword = process.env.DB_PASSWORD;

  if (supabaseUrl && dbPassword) {
    // 从 https://xxxx.supabase.co 提取项目 ID
    const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (match) {
      const projectId = match[1];
      return {
        host: `db.${projectId}.supabase.co`,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: dbPassword,
        ssl: { rejectUnauthorized: false }
      };
    }
  }

  return null;
}

// ─── SQL 分割器（处理多语句 SQL）────────────────────────────────
function splitSQLStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  let inDollarQuote = false;
  let dollarTag = '';
  let inBlockComment = false;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1] || '';

    // 行注释
    if (!inString && !inDollarQuote && !inBlockComment && char === '-' && nextChar === '-') {
      inLineComment = true;
    }
    if (inLineComment && char === '\n') {
      inLineComment = false;
    }

    // 块注释
    if (!inString && !inDollarQuote && !inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true;
    }
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false;
      current += char + nextChar;
      i++;
      continue;
    }

    // Dollar quoting ($$...$$)
    if (!inString && !inLineComment && !inBlockComment && char === '$') {
      const rest = sql.slice(i);
      const dollarMatch = rest.match(/^\$([^$]*)\$/);
      if (dollarMatch) {
        const tag = dollarMatch[0];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
          current += tag;
          i += tag.length - 1;
          continue;
        } else if (tag === dollarTag) {
          inDollarQuote = false;
          dollarTag = '';
          current += tag;
          i += tag.length - 1;
          continue;
        }
      }
    }

    // 单引号字符串
    if (!inDollarQuote && !inLineComment && !inBlockComment && char === "'") {
      if (!inString) {
        inString = true;
      } else if (nextChar !== "'") {
        inString = false;
      }
    }

    // 语句分隔符
    if (!inString && !inDollarQuote && !inLineComment && !inBlockComment && char === ';') {
      const stmt = current.trim();
      if (stmt.length > 0) {
        statements.push(stmt);
      }
      current = '';
      continue;
    }

    current += char;
  }

  // 最后一个语句（无分号结尾）
  const lastStmt = current.trim();
  if (lastStmt.length > 0 && !lastStmt.startsWith('--')) {
    statements.push(lastStmt);
  }

  return statements.filter(s => {
    const clean = s.replace(/--[^\n]*/g, '').trim();
    return clean.length > 0;
  });
}

// ─── 主函数 ─────────────────────────────────────────────────
async function runMigration() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║     CLEAN_MIGRATION_V4.sql  全量迁移执行工具       ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');

  const connConfig = getConnectionConfig();

  if (!connConfig) {
    console.error('❌ 缺少数据库连接配置！');
    console.error('');
    console.error('请选择以下任一方式提供配置：');
    console.error('');
    console.error('方式1: 设置完整连接字符串（推荐）');
    console.error('  在 server/.env 中添加：');
    console.error('  DB_CONNECTION_STRING=postgresql://postgres:[密码]@db.wwdrkjnbvcbfytwnnyvs.supabase.co:5432/postgres');
    console.error('');
    console.error('方式2: 只提供数据库密码');
    console.error('  在 server/.env 中添加：');
    console.error('  DB_PASSWORD=你的Supabase数据库密码');
    console.error('');
    console.error('  数据库密码在 Supabase Dashboard → Settings → Database → Database password 中查看');
    console.error('');
    process.exit(1);
  }

  // 读取迁移文件
  const sqlFile = join(__dirname, 'migrations', 'CLEAN_MIGRATION_V4.sql');
  console.log(`📄 读取迁移文件: ${sqlFile}`);

  let sqlContent;
  try {
    sqlContent = readFileSync(sqlFile, 'utf-8');
  } catch (e) {
    console.error(`❌ 无法读取迁移文件: ${e.message}`);
    process.exit(1);
  }

  console.log(`✅ 文件读取成功 (${(sqlContent.length / 1024).toFixed(1)} KB)\n`);

  // 分割 SQL 语句
  console.log('🔧 解析 SQL 语句...');
  const statements = splitSQLStatements(sqlContent);
  console.log(`✅ 共解析出 ${statements.length} 条 SQL 语句\n`);

  // 连接数据库
  const host = connConfig.host || (connConfig.connectionString && connConfig.connectionString.match(/@([^:/]+)/)?.[1]) || 'unknown';
  console.log(`🔌 连接数据库: ${host}`);

  const client = new Client(connConfig);

  try {
    await client.connect();
    console.log('✅ 数据库连接成功\n');
  } catch (e) {
    console.error(`❌ 数据库连接失败: ${e.message}`);
    console.error('');
    console.error('常见原因：');
    console.error('1. 密码错误 - 检查 DB_PASSWORD 或 DB_CONNECTION_STRING');
    console.error('2. 网络问题 - 确认网络可以访问 Supabase');
    console.error('3. IP 限制 - 在 Supabase Dashboard → Settings → Database 中检查 IP 白名单');
    process.exit(1);
  }

  // 执行迁移
  console.log('🚀 开始执行迁移...');
  console.log('─'.repeat(52));

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 70);

    try {
      await client.query(stmt);
      successCount++;

      // 打印关键操作
      if (/CREATE TABLE/i.test(stmt)) {
        const tableName = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)/i)?.[1];
        console.log(`  ✅ [${i + 1}/${statements.length}] CREATE TABLE ${tableName}`);
      } else if (/CREATE INDEX/i.test(stmt)) {
        // 静默
      } else if (/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION/i.test(stmt)) {
        const funcName = stmt.match(/FUNCTION\s+(\w+)/i)?.[1];
        console.log(`  ✅ [${i + 1}/${statements.length}] CREATE FUNCTION ${funcName}`);
      } else if (/CREATE TRIGGER/i.test(stmt)) {
        const trigName = stmt.match(/CREATE TRIGGER\s+(\w+)/i)?.[1];
        console.log(`  ✅ [${i + 1}/${statements.length}] CREATE TRIGGER ${trigName}`);
      } else if (/ALTER TABLE/i.test(stmt)) {
        const tableName = stmt.match(/ALTER TABLE\s+(?:IF EXISTS\s+)?(\w+)/i)?.[1];
        console.log(`  ✅ [${i + 1}/${statements.length}] ALTER TABLE ${tableName}`);
      } else if (/INSERT INTO/i.test(stmt)) {
        const tableName = stmt.match(/INSERT INTO\s+(\w+)/i)?.[1];
        console.log(`  ✅ [${i + 1}/${statements.length}] INSERT INTO ${tableName}`);
      }
    } catch (e) {
      // 跳过"已存在"类错误（IF NOT EXISTS 有时仍会报错）
      if (
        e.message.includes('already exists') ||
        e.message.includes('duplicate key') ||
        e.message.includes('already exists, skipping')
      ) {
        skipCount++;
      } else {
        errorCount++;
        errors.push({ index: i + 1, preview: preview + '...', error: e.message });
        console.log(`  ⚠️  [${i + 1}/${statements.length}] 警告: ${e.message.slice(0, 80)}`);
      }
    }
  }

  await client.end();

  // 执行报告
  console.log('─'.repeat(52));
  console.log('');
  console.log('📊 迁移执行报告');
  console.log(`  总语句数:    ${statements.length}`);
  console.log(`  ✅ 成功:    ${successCount}`);
  console.log(`  ⏭️  跳过:    ${skipCount}（对象已存在）`);
  console.log(`  ❌ 错误:    ${errorCount}`);
  console.log('');

  if (errors.length > 0) {
    console.log('⚠️  错误详情:');
    errors.forEach(({ index, preview, error }) => {
      console.log(`  [${index}] ${preview}`);
      console.log(`        → ${error}`);
    });
    console.log('');
    console.log('💡 提示: 部分错误可能是由于依赖顺序问题，重新执行一次通常可以解决。');
  } else {
    console.log('🎉 迁移执行完成，无错误！');
  }

  console.log('');
}

runMigration().catch(e => {
  console.error('❌ 未预期的错误:', e);
  process.exit(1);
});
