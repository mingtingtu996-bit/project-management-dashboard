/**
 * 执行 warnings 表迁移
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM 兼容的 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 创建 Supabase 客户端
function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  
  if (!url || !key) {
    throw new Error('Supabase configuration missing');
  }
  
  return createClient(url, key);
}

async function migrateCreateWarnings() {
  console.log('🔄 开始执行 warnings 表迁移...');
  
  const supabase = createSupabaseClient();
  
  // 读取 SQL 文件
  const sqlPath = join(__dirname, 'migrations', '009_create_warnings_table.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  
  console.log('📄 SQL 文件已加载');
  console.log(`   大小: ${sql.length} 字符`);
  
  try {
    // Supabase 不支持直接执行 SQL，需要使用 REST API 或客户端库
    // 这里我们使用 Supabase 的 rest 方法（如果可用）
    // 或者我们可以提示用户手动执行 SQL
    
    console.log('\n⚠️  Supabase 客户端不支持直接执行 SQL 脚本');
    console.log('\n📋 请按照以下步骤手动执行迁移:');
    console.log('1. 访问 Supabase Dashboard');
    console.log('2. 进入 SQL Editor');
    console.log('3. 复制 migrations/009_create_warnings_table.sql 文件内容');
    console.log('4. 粘贴到 SQL Editor 并执行');
    console.log('\n📄 SQL 文件路径:', sqlPath);
    console.log('\n或者使用 Supabase CLI:');
    console.log(`  supabase db push --db-url ${process.env.SUPABASE_URL}`);
    
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

// 执行迁移
migrateCreateWarnings()
  .then(() => {
    console.log('\n✅ 迁移完成');
    console.log('⏭️  请手动执行 SQL 脚本');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 迁移失败:', error);
    process.exit(1);
  });
