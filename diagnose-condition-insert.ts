// 诊断 POST /api/task-conditions 500 错误
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 加载环境变量
const envPath = resolve(process.cwd(), '.env')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  })
} catch (e) {
  console.error('Failed to load .env file')
}

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || ''

console.log('=== POST /api/task-conditions 500 Error Diagnosis ===\n')
console.log('1. Checking table existence...')

const supabase = createClient(supabaseUrl, supabaseKey)

// 检查 task_conditions 表是否存在
async function checkTable() {
  try {
    const { data, error } = await supabase
      .from('task_conditions')
      .select('*')
      .limit(1)

    if (error) {
      console.log('   Table check error:', error.message)
      if (error.code === '42P01') {
        console.log('   ❌ Table "task_conditions" does NOT exist!')
        console.log('   Fix: Run migration 037_create_task_conditions_and_obstacles.sql')
      }
    } else {
      console.log('   ✅ Table "task_conditions" exists')
    }
  } catch (e: any) {
    console.log('   ❌ Connection error:', e.message)
  }
}

// 检查表结构
async function checkTableSchema() {
  try {
    const { data, error } = await supabase.rpc('exec', {
      sql: `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'task_conditions'
        ORDER BY ordinal_position
      `
    })

    if (error) {
      console.log('   Cannot check schema via RPC:', error.message)
      console.log('   Try checking via SELECT * FROM task_conditions LIMIT 0')

      // 尝试直接查询
      const { error: selectError } = await supabase
        .from('task_conditions')
        .select('id')

      if (selectError) {
        console.log('   SELECT error:', selectError.message)
      } else {
        console.log('   ✅ SELECT works, checking columns...')
      }
    } else {
      console.log('   Table columns:')
      if (data && data.length > 0) {
        data.forEach((col: any) => {
          console.log(`     - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`)
        })
      }
    }
  } catch (e: any) {
    console.log('   Schema check error:', e.message)
  }
}

// 检查 tasks 表是否有数据
async function checkTasksData() {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, project_id, title')
      .limit(3)

    if (error) {
      console.log('   Tasks check error:', error.message)
    } else if (!data || data.length === 0) {
      console.log('   ⚠️  tasks 表没有数据！无法创建 task_conditions')
    } else {
      console.log('   ✅ tasks 表有数据')
      data.forEach((t: any) => {
        console.log(`     - Task: ${t.id} (project: ${t.project_id})`)
      })
    }
  } catch (e: any) {
    console.log('   Tasks check error:', e.message)
  }
}

// 检查认证
async function checkAuth() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      console.log('   Auth error:', error.message)
    } else if (user) {
      console.log('   ✅ Authenticated as:', user.email)
    } else {
      console.log('   ❌ Not authenticated')
    }
  } catch (e: any) {
    console.log('   Auth check error:', e.message)
  }
}

// 测试 INSERT
async function testInsert() {
  try {
    // 先获取一个 task
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, project_id')
      .limit(1)

    if (!tasks || tasks.length === 0) {
      console.log('   ❌ No tasks found, cannot test INSERT')
      return
    }

    const task = tasks[0]
    console.log(`   Testing INSERT with task_id: ${task.id}`)

    const { data, error } = await supabase
      .from('task_conditions')
      .insert({
        task_id: task.id,
        project_id: task.project_id,
        name: 'Test condition',
        condition_type: '其他',
        is_satisfied: false
      })
      .select()
      .single()

    if (error) {
      console.log('   ❌ INSERT failed:', error.message)
      console.log('   Error code:', error.code)
      console.log('   Error details:', JSON.stringify(error, null, 2))
    } else {
      console.log('   ✅ INSERT successful!')
      console.log('   Created condition:', data)

      // 清理测试数据
      await supabase
        .from('task_conditions')
        .delete()
        .eq('id', data.id)
      console.log('   Test data cleaned up')
    }
  } catch (e: any) {
    console.log('   ❌ INSERT error:', e.message)
  }
}

async function main() {
  await checkTable()
  console.log()
  await checkTableSchema()
  console.log()
  await checkTasksData()
  console.log()
  await checkAuth()
  console.log()
  await testInsert()
}

main().catch(console.error)
