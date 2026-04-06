import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ESM 兼容的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 错误: 缺少 Supabase 环境变量');
  console.log('需要设置: VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('✅ 环境变量已加载');
console.log(`Supabase URL: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseKey);

// 读取 SQL 文件
const sqlPath = join(__dirname, 'migrations', '009_create_warnings_table.sql');
let sqlContent: string;

try {
  sqlContent = readFileSync(sqlPath, 'utf-8');
  console.log('✅ SQL 文件已读取');
  console.log(`SQL 路径: ${sqlPath}`);
  console.log(`SQL 长度: ${sqlContent.length} 字符`);
} catch (error) {
  console.error('❌ 错误: 无法读取 SQL 文件');
  console.error(error);
  process.exit(1);
}

// 检查 warnings 表是否已存在
async function checkWarningsTable() {
  console.log('\n🔍 检查 warnings 表是否存在...');
  
  const { data, error } = await supabase
    .from('warnings')
    .select('id')
    .limit(1);

  if (error) {
    if (error.code === '42P01') {
      // 表不存在
      console.log('✅ warnings 表不存在，可以创建');
      return false;
    } else {
      console.error('❌ 错误: 检查表时出错');
      console.error(error);
      throw error;
    }
  } else {
    console.log('⚠️ warnings 表已存在');
    return true;
  }
}

// 执行 SQL 迁移
async function executeMigration() {
  console.log('\n🚀 开始执行迁移...');
  
  // 方法1: 尝试通过 SQL Editor API（如果有）
  // 注意: Supabase 客户端默认不提供直接执行任意 SQL 的功能
  // 这里使用 rpc 调用或其他方法
  
  // 方法2: 分步执行（简化版）
  // 由于 Supabase 客户端限制，我们需要手动创建表
  
  console.log('⚠️ 注意: Supabase 客户端无法直接执行 CREATE TABLE 语句');
  console.log('ℹ️ 建议通过 Supabase Dashboard 的 SQL Editor 执行迁移');
  console.log('   1. 访问: https://app.supabase.com');
  console.log('   2. 进入项目 → SQL Editor');
  console.log('   3. 复制 SQL 文件内容并执行');
  console.log('\n或者使用 Supabase CLI:');
  console.log(`   supabase db execute --file ${sqlPath}`);
}

// 主函数
async function main() {
  try {
    const tableExists = await checkWarningsTable();
    
    if (tableExists) {
      console.log('⏭️  warnings 表已存在，跳过创建');
      return;
    }
    
    await executeMigration();
    
    console.log('\n✅ 迁移准备完成');
    console.log('⚠️ 请手动执行 SQL 文件或使用 Supabase CLI');
    
  } catch (error) {
    console.error('\n❌ 错误: 迁移失败');
    console.error(error);
    process.exit(1);
  }
}

main();
