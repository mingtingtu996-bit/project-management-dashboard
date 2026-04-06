// run-migration.cjs — 确认环境信息并给出操作指引
const fs = require('fs');
const path = require('path');

// 直接读取 .env
const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
const lines = envContent.split('\n');
const env = {};
for (const line of lines) {
  const idx = line.indexOf('=');
  if (idx > 0 && !line.startsWith('#')) {
    env[line.substring(0, idx).trim()] = line.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
}

const url = env.SUPABASE_URL || 'NOT FOUND';
const svcKey = env.SUPABASE_SERVICE_KEY || 'NOT FOUND';
const dbPwd = env.DB_PASSWORD || 'NOT FOUND';
const projectId = url !== 'NOT FOUND' ? url.replace('https://', '').split('.')[0] : 'unknown';

console.log('=== Supabase 迁移执行工具 ===\n');
console.log('项目 URL:', url);
console.log('Project ID:', projectId);
console.log('Service Key:', svcKey.substring(0, 15) + '...');
console.log('DB Password:', dbPwd === 'NOT FOUND' ? 'NOT FOUND' : '***');

// SQL 文件
const sqlPath = path.join(__dirname, 'migrations', 'CLEAN_MIGRATION_V4.sql');
const sql = fs.readFileSync(sqlPath, 'utf-8');
console.log('\n迁移文件:', sqlPath);
console.log('文件大小:', sql.length, '字符,', sql.split('\n').length, '行');

console.log('\n========================================');
console.log('当前环境限制:');
console.log('  - 无 psql 客户端');
console.log('  - 无 Supabase CLI');
console.log('  - npm 安装新包失败');
console.log('  - Supabase REST API 不支持 DDL');
console.log('\n结论: 无法通过命令行自动执行 DDL 迁移');
console.log('========================================\n');
console.log('请在浏览器中操作 (约 30 秒):');
console.log('');
console.log('  1. 打开 Supabase Dashboard:');
console.log('     https://supabase.com/dashboard/project/' + projectId);
console.log('');
console.log('  2. 左侧菜单 → SQL Editor');
console.log('');
console.log('  3. 打开文件并全选复制:');
console.log('     ' + sqlPath);
console.log('');
console.log('  4. 粘贴到 SQL Editor → 点击 Run');
console.log('');
console.log('SQL 会自动: DROP 旧表 → 重建 39 张表 → 创建触发器/索引/RLS/种子数据');
console.log('');
console.log('---');
console.log('\n备选方案 (需要 psql):');
console.log('psql "postgresql://postgres.' + projectId + ':' + dbPwd + '@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres" -f "' + sqlPath + '"');
