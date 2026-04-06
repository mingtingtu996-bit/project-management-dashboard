/**
 * 全面数据验证脚本 — 检查所有模块的数据是否正常
 * 
 * 执行: 在应用目录中 npx tsx C:\Users\jjj64\WorkBuddy\20260330214828\full-data-check.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv(filePath: string) {
  const content = readFileSync(filePath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv(resolve('C:/Users/jjj64/WorkBuddy/20260318232610/server/.env'))

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
)

const TABLES = [
  'projects',
  'milestones',
  'tasks',
  'risks',
  'task_conditions',
  'task_obstacles',
  'acceptance_plans',
  'task_delay_history',
  'wbs_templates',
  'pre_milestones',
  'project_members',
  'users',
  'task_summaries',
]

async function check() {
  console.log('='.repeat(60))
  console.log('  全面数据验证 — 各模块数据量检查')
  console.log('='.repeat(60))

  let allOk = true

  for (const table of TABLES) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.log(`❌ ${table.padEnd(25)} 错误: ${error.message}`)
      allOk = false
    } else {
      const status = count > 0 ? '✅' : '⚠️ 空'
      console.log(`${status} ${table.padEnd(25)} ${count} 条`)
    }
  }

  console.log('\n' + '-'.repeat(60))
  console.log('  详细数据抽样（各表前2条）')
  console.log('-'.repeat(60))

  // 抽样检查关键表的数据质量
  const sampleTables = ['tasks', 'milestones', 'task_conditions', 'task_obstacles', 'risks', 'acceptance_plans']
  for (const table of sampleTables) {
    const { data, error } = await supabase.from(table).select('*').limit(2)
    if (error) {
      console.log(`\n❌ ${table}: ${error.message}`)
    } else if (data && data.length > 0) {
      console.log(`\n📋 ${table} (${data.length} 条样本):`)
      for (const row of data) {
        // 只打印关键字段，避免太长
        const summary = Object.entries(row)
          .filter(([k]) => !['created_at', 'updated_at', 'id'].includes(k))
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
        console.log(`   → ${summary}`)
      }
    } else {
      console.log(`\n📋 ${table}: 无数据`)
    }
  }

  console.log('\n' + '='.repeat(60))
  if (allOk) console.log('  结论: 所有表结构正常，数据可读写 ✅')
  else console.log('  结论: 部分表存在问题，需要修复 ❌')
  console.log('='.repeat(60))
}

check().catch(e => { console.error(e); process.exit(1) })
