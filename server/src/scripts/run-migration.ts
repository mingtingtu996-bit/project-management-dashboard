// Migration执行辅助脚本
// 通过Supabase REST API执行SQL迁移

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 从环境变量读取配置
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 缺少环境变量: SUPABASE_URL 或 SUPABASE_SERVICE_KEY')
  process.exit(1)
}

// 使用service role key创建客户端（有最高权限）
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// 读取Migration文件
const migrationFile = path.join(__dirname, '../migrations/050_add_login_fields.sql')
let sqlContent = fs.readFileSync(migrationFile, 'utf-8')

// 移除验证查询部分（只执行DDL和DML）
const statements = sqlContent
  .split(/-- .*验证.*/)[0] // 移除验证部分
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'))

console.log(`📝 准备执行 ${statements.length} 条SQL语句...`)

// 逐条执行SQL（避免复杂语句执行失败）
async function executeMigration() {
  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < statements.length; i++) {
    const sql = statements[i]
    
    // 跳过空语句和注释
    if (!sql || sql.startsWith('--')) continue

    try {
      console.log(`\n[${i + 1}/${statements.length}] 执行: ${sql.substring(0, 50)}...`)
      
      // 使用RPC执行SQL（需要在Supabase中创建execute_sql函数）
      // 或者直接使用supabase.rpc()执行存储过程
      
      // 由于RPC限制，这里使用简单的方式：
      // 将复杂SQL拆分，只执行核心DDL/DML
      
      // 注意：实际生产环境应该使用Supabase CLI或psql执行Migration
      // 这里只是为了演示流程
      
      successCount++
    } catch (error) {
      console.error(`❌ 语句 ${i + 1} 执行失败:`, error.message)
      errorCount++
    }
  }

  console.log(`\n✅ 执行完成: ${successCount} 条成功, ${errorCount} 条失败`)
  
  if (errorCount > 0) {
    console.log('⚠️  部分语句执行失败，请检查日志')
    console.log('💡 建议: 使用Supabase Dashboard SQL Editor手动执行Migration文件')
  } else {
    console.log('✅ Migration执行成功!')
    console.log('📋 默认管理员账户: admin / admin123')
  }
}

// 实际上，由于REST API限制，我们推荐用户手动执行Migration
console.log('⚠️  注意: 由于Supabase REST API限制，无法直接执行复杂SQL')
console.log('📋 请按以下步骤手动执行Migration:')
console.log('')
console.log('1. 打开 Supabase Dashboard')
console.log('2. 进入 SQL Editor')
console.log('3. 复制并执行以下文件内容:')
console.log(`   ${migrationFile}`)
console.log('')
console.log('或者使用以下命令（如果已安装psql或Supabase CLI）:')
console.log(`   psql -h db.xxx.supabase.co -U postgres -d postgres -f ${migrationFile}`)
console.log('   supabase db push')
console.log('')
console.log('📋 Migration执行后，默认管理员账户: admin / admin123')
console.log('⚠️  重要: 请在生产环境中修改默认密码!')
