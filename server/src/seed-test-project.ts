// 临时脚本：在数据库中创建特定 ID 的测试项目
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

async function main() {
  const projectId = 'aaaaaaaa-0001-0001-0001-5eed00000001'
  
  // 先检查是否已存在
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .single()
  
  if (existing) {
    console.log('项目已存在:', projectId)
    return
  }
  
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      id: projectId,
      name: '城市中心广场项目（二期）',
      description: '城市中心广场二期开发项目',
      status: '进行中',
      planned_start_date: '2025-01-01',
      planned_end_date: '2027-06-30',
      health_score: 75,
      health_status: '健康',
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()
  
  if (error) {
    console.error('创建失败:', error)
    process.exit(1)
  }
  
  console.log('✅ 项目创建成功:', data.id, data.name)
}

main()
