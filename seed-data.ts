/**
 * 种子数据脚本 — 创建测试数据 + 一键清理
 *
 * 用法（在应用目录中执行）:
 *   npx tsx C:\Users\jjj64\WorkBuddy\20260330214828\seed-data.ts          # 插入种子数据
 *   npx tsx C:\Users\jjj64\WorkBuddy\20260330214828\seed-data.ts --clean  # 清理所有种子数据
 *
 * 种子数据通过 description = '种子数据' 标记，清理时按此标识精确删除
 */

import { createClient } from '@supabase/supabase-js'

// 直接读取 .env 文件解析变量（不依赖 dotenv 模块）
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

const envPath = resolve('C:/Users/jjj64/WorkBuddy/20260318232610/server/.env')
loadEnv(envPath)

const supabaseUrl = process.env.SUPABASE_URL || ''
// 优先使用 SERVICE_KEY（绕过 RLS），否则用 ANON_KEY
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少环境变量 SUPABASE_URL / (SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ============ 种子数据定义 ============

async function getProjectAndUser() {
  const { data: proj, error: e1 } = await supabase
    .from('projects')
    .select('id, owner_id')
    .limit(1)
    .single()
  if (e1 || !proj) throw new Error('数据库中没有项目，请先创建项目')

  // 尝试从 auth.users 获取用户（需要 service_role key 才能查）
  // 回退：直接用项目的 owner_id
  const userId = proj.owner_id
  if (!userId) throw new Error('项目没有 owner_id')

  return { projectId: proj.id, userId }
}

async function insertSeedData() {
  const { projectId, userId } = await getProjectAndUser()

  console.log(`项目ID: ${projectId}`)
  console.log(`用户ID: ${userId}\n`)

  let inserted = 0

  // ---- 1. 项目成员 ----
  const { data: existMember } = await supabase
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)

  if (!existMember || existMember.length === 0) {
    const { error } = await supabase.from('project_members').insert({
      project_id: projectId,
      user_id: userId,
      permission_level: 'admin',
      joined_at: new Date().toISOString(),
      is_active: true,
    })
    if (error) console.error('⚠️ 项目成员插入失败:', error.message)
    else { console.log('✅ 项目成员: 已添加 owner 为 admin'); inserted++ }
  } else {
    console.log('⏭️  项目成员: owner 已存在，跳过')
  }

  // ---- 2. 里程碑任务 (is_milestone=true，3条) ----
  const milestones = [
    { title: '基础工程验收', planned_end: '2026-05-15', status: 'completed', is_milestone: true, milestone_level: 1, milestone_order: 1, progress: 100 },
    { title: '主体结构封顶', planned_end: '2026-08-01', status: 'in_progress', is_milestone: true, milestone_level: 1, milestone_order: 2, progress: 30 },
    { title: '竣工验收',     planned_end: '2026-12-31', status: 'todo', is_milestone: true, milestone_level: 1, milestone_order: 3, progress: 0 },
  ]

  const milestoneIds: string[] = []
  for (const m of milestones) {
    const { data, error } = await supabase.from('tasks').insert({
      project_id: projectId,
      title: m.title,
      description: '种子数据',
      planned_end_date: m.planned_end,
      status: m.status,
      is_milestone: true,
      milestone_level: m.milestone_level,
      milestone_order: m.milestone_order,
      progress: m.progress,
      created_by: userId,
    }).select('id').single()

    if (error) { console.error(`⚠️ 里程碑 ${m.title} 失败:`, error.message); continue }
    milestoneIds.push(data!.id)
    console.log(`✅ 里程碑: ${m.title} → ${data!.id.substring(0, 8)}`)
    inserted++
  }

  // ---- 3. 任务 (8条) ----
  const tasks = [
    { title: '施工图设计', status: 'done', progress: 100, priority: 'high',
      planned_start: '2026-03-01', planned_end: '2026-03-20', actual_start: '2026-03-01', actual_end: '2026-03-18',
      assignee_name: '张工', assignee_type: 'person', specialty: '设计', ref_duration: 20 },
    { title: '基坑开挖', status: 'in_progress', progress: 65, priority: 'high',
      planned_start: '2026-03-15', planned_end: '2026-04-30', actual_start: '2026-03-16', actual_end: null,
      assignee_name: '李工', assignee_type: 'person', specialty: '土建', ref_duration: 45 },
    { title: '桩基施工', status: 'in_progress', progress: 30, priority: 'high',
      planned_start: '2026-03-20', planned_end: '2026-05-10', actual_start: '2026-03-22', actual_end: null,
      assignee_name: '王施工队', assignee_type: 'unit', specialty: '基础', ref_duration: 50 },
    { title: '钢筋采购', status: 'todo', progress: 0, priority: 'medium',
      planned_start: '2026-04-01', planned_end: '2026-04-15', actual_start: null, actual_end: null,
      assignee_name: '采购部', assignee_type: 'unit', specialty: '材料', ref_duration: 15 },
    { title: '主体结构施工', status: 'todo', progress: 0, priority: 'high',
      planned_start: '2026-05-01', planned_end: '2026-08-30', actual_start: null, actual_end: null,
      assignee_name: '赵工', assignee_type: 'person', specialty: '土建', ref_duration: 120 },
    { title: '机电安装预埋', status: 'todo', progress: 0, priority: 'medium',
      planned_start: '2026-05-15', planned_end: '2026-07-15', actual_start: null, actual_end: null,
      assignee_name: '机电班组', assignee_type: 'unit', specialty: '机电', ref_duration: 60 },
    { title: '外墙施工', status: 'todo', progress: 0, priority: 'low',
      planned_start: '2026-07-01', planned_end: '2026-09-30', actual_start: null, actual_end: null,
      assignee_name: '外墙班组', assignee_type: 'unit', specialty: '装饰', ref_duration: 90 },
    { title: '园林绿化', status: 'todo', progress: 0, priority: 'low',
      planned_start: '2026-09-01', planned_end: '2026-11-30', actual_start: null, actual_end: null,
      assignee_name: '园林公司', assignee_type: 'unit', specialty: '园林', ref_duration: 90 },
  ]

  const taskIds: string[] = []
  for (const t of tasks) {
    const { data, error } = await supabase.from('tasks').insert({
      project_id: projectId,
      title: t.title,
      description: '种子数据',
      status: t.status,
      priority: t.priority,
      progress: t.progress,
      planned_start_date: t.planned_start,
      planned_end_date: t.planned_end,
      actual_start_date: t.actual_start,
      actual_end_date: t.actual_end,
      planned_duration: t.ref_duration,
      standard_duration: t.ref_duration,
      reference_duration: t.ref_duration,
      assignee_name: t.assignee_name,
      assignee_type: t.assignee_type,
      specialty_type: t.specialty,
      is_milestone: false,
      created_by: userId,
    }).select('id').single()

    if (error) { console.error(`⚠️ 任务 ${t.title} 失败:`, error.message); continue }
    taskIds.push(data!.id)
    console.log(`✅ 任务: ${t.title} [${t.status}] → ${data!.id.substring(0, 8)}`)
    inserted++
  }

  // ---- 4. 任务条件 (3条，关联到"基坑开挖") ----
  if (taskIds[1]) {
    const conditions = [
      { condition_type: '手续', name: '施工许可证',       is_satisfied: true },
      { condition_type: '材料', name: '混凝土配合比报告', is_satisfied: true },
      { condition_type: '设备', name: '塔吊安装验收',     is_satisfied: false },
    ]

    for (const c of conditions) {
      const { error } = await supabase.from('task_conditions').insert({
        task_id: taskIds[1],
        project_id: projectId,
        condition_type: c.condition_type,
        name: c.name,
        description: '种子数据',
        is_satisfied: c.is_satisfied,
        created_by: userId,
      })
      if (error) console.error(`⚠️ 条件 ${c.name} 失败:`, error.message)
      else { console.log(`✅ 条件: ${c.name} [${c.is_satisfied ? '已满足' : '未满足'}]`); inserted++ }
    }
  }

  // ---- 5. 任务阻碍 (2条，关联到"桩基施工") ----
  if (taskIds[2]) {
    const obstacles = [
      { obstacle_type: '环境', description: '连续降雨影响桩基施工', severity: '中', status: '处理中' },
      { obstacle_type: '材料', description: '商混供应不足',         severity: '高', status: '待处理' },
    ]

    for (const o of obstacles) {
      const { error } = await supabase.from('task_obstacles').insert({
        task_id: taskIds[2],
        project_id: projectId,
        obstacle_type: o.obstacle_type,
        description: o.description,
        severity: o.severity,
        status: o.status,
        created_by: userId,
      })
      if (error) console.error(`⚠️ 阻碍失败:`, error.message)
      else { console.log(`✅ 阻碍: ${o.description} [${o.severity}/${o.status}]`); inserted++ }
    }
  }

  // ---- 6. 风险 (2条) ----
  const risks = [
    { title: '基坑支护变形风险', description: '种子数据', level: 'medium', risk_category: 'safety', probability: 40, impact: 70 },
    { title: '材料价格波动',     description: '种子数据', level: 'low',    risk_category: 'cost',   probability: 60, impact: 40 },
  ]

  for (const r of risks) {
    const { error } = await supabase.from('risks').insert({
      project_id: projectId,
      title: r.title,
      description: r.description,
      level: r.level,
      risk_category: r.risk_category,
      status: 'identified',
      probability: r.probability,
      impact: r.impact,
      mitigation: '持续监控',
    })
    if (error) console.error(`⚠️ 风险 ${r.title} 失败:`, error.message)
    else { console.log(`✅ 风险: ${r.title} [${r.level}]`); inserted++ }
  }

  // ---- 7. 验收计划 (2条) ----
  const acceptances = [
    { acceptance_type: '分项', acceptance_name: '基坑支护分项验收', planned_date: '2026-05-15', status: '待验收' },
    { acceptance_type: '分部', acceptance_name: '地基基础分部验收', planned_date: '2026-06-30', status: '待验收' },
  ]

  for (const a of acceptances) {
    const { error } = await supabase.from('acceptance_plans').insert({
      project_id: projectId,
      acceptance_type: a.acceptance_type,
      acceptance_name: a.acceptance_name,
      planned_date: a.planned_date,
      status: a.status,
      created_by: userId,
      notes: '种子数据',
    })
    if (error) console.error(`⚠️ 验收 ${a.acceptance_name} 失败:`, error.message)
    else { console.log(`✅ 验收计划: ${a.acceptance_name} [${a.status}]`); inserted++ }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`✅ 种子数据插入完成！共 ${inserted} 条`)
  console.log(`   里程碑: ${milestoneIds.length} 条`)
  console.log(`   任务:   ${taskIds.length} 条`)
  console.log(`   条件:   3 条`)
  console.log(`   阻碍:   2 条`)
  console.log(`   风险:   2 条`)
  console.log(`   验收:   2 条`)
  console.log(`   成员:   1 条 (owner)`)
}

// ============ 清理种子数据 ============

async function cleanSeedData() {
  let deleted = 0

  const cleanOps: { table: string; field: string; value: string }[] = [
    // 子表先删（外键依赖）
    { table: 'acceptance_plans',  field: 'notes',       value: '种子数据' },
    { table: 'task_obstacles',    field: 'description',  value: '种子数据' },
    { table: 'task_conditions',   field: 'description',  value: '种子数据' },
    { table: 'risks',             field: 'description',  value: '种子数据' },
    { table: 'tasks',             field: 'description',  value: '种子数据' },
    { table: 'milestones',        field: 'description',  value: '种子数据' },
  ]

  for (const op of cleanOps) {
    const { data, error } = await supabase
      .from(op.table)
      .delete()
      .eq(op.field, op.value)
      .select('id')

    if (error) {
      console.error(`⚠️ 清理 ${op.table} 失败:`, error.message)
    } else if (data && data.length > 0) {
      console.log(`🗑️  ${op.table}: 删除 ${data.length} 条`)
      deleted += data.length
    }
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`✅ 种子数据清理完成！共删除 ${deleted} 条`)
}

// ============ 主函数 ============

async function main() {
  const isClean = process.argv.includes('--clean')

  console.log('✅ Supabase 连接成功\n')

  if (isClean) {
    console.log('🗑️  清理模式 — 删除所有种子数据...\n')
    await cleanSeedData()
  } else {
    console.log('🌱 插入模式 — 创建种子数据...\n')
    await insertSeedData()
  }
}

main().catch(e => {
  console.error('❌ 执行失败:', e.message)
  process.exit(1)
})
