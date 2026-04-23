#!/usr/bin/env node
/**
 * 8.5.2 摘要链一致性检查脚本
 *
 * 检查范围：
 *   - 项目摘要口径：/api/dashboard/projects-summary 的结构稳定性
 *   - 任务总结口径：/api/task-summaries/projects/:id/task-summary 的 stats/groups/timeline_ready
 *   - 共享摘要与页面消费的一致性：字段不缺失、数值型字段不为 undefined
 *
 * 用法：
 *   API_URL=http://localhost:3001 node server/scripts/check-summary-consistency.mjs
 *   SAMPLE_PROJECT_ID=<uuid> API_URL=http://localhost:3001 node server/scripts/check-summary-consistency.mjs
 */

const API_URL = process.env.API_URL || 'http://localhost:3001'
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const SAMPLE_PROJECT_ID = process.env.SAMPLE_PROJECT_ID || ''
const TIMEOUT_MS = 5000

async function fetchJSON(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
    const res = await fetch(url, { headers, signal: controller.signal })
    const body = await res.json()
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, status: -1, body: null, error: err.name === 'AbortError' ? 'TIMEOUT' : err.message }
  } finally {
    clearTimeout(timer)
  }
}

// 必填字段：共享摘要（projectsummary）
const REQUIRED_SUMMARY_FIELDS = [
  'id', 'name', 'status',
  'totalTasks', 'completedTaskCount', 'inProgressTaskCount', 'delayedTaskCount',
  'overallProgress', 'taskProgress',
  'totalMilestones', 'completedMilestones', 'milestoneProgress',
  'healthScore',
]

// 必须为 number 的字段
const NUMERIC_SUMMARY_FIELDS = [
  'totalTasks', 'completedTaskCount', 'inProgressTaskCount', 'delayedTaskCount',
  'overallProgress', 'taskProgress', 'totalMilestones', 'completedMilestones',
  'milestoneProgress', 'healthScore',
]

function checkSummaryItem(item, index) {
  const issues = []
  for (const field of REQUIRED_SUMMARY_FIELDS) {
    if (!(field in item)) issues.push(`缺少字段: ${field}`)
  }
  for (const field of NUMERIC_SUMMARY_FIELDS) {
    if (field in item && typeof item[field] !== 'number') {
      issues.push(`字段 ${field} 类型应为 number，实际为 ${typeof item[field]}`)
    }
  }
  if (issues.length > 0) {
    console.log(`  ⚠️  摘要[${index}] (id=${item.id ?? '?'}) 问题：`)
    for (const issue of issues) console.log(`       - ${issue}`)
    return false
  }
  return true
}

// 任务总结必填结构
function checkTaskSummary(data) {
  const issues = []
  if (!data || typeof data !== 'object') { issues.push('data 为空'); return issues }
  if (!('stats' in data)) issues.push('缺少 stats')
  if (!('groups' in data)) issues.push('缺少 groups')
  if (!('timeline_ready' in data)) issues.push('缺少 timeline_ready')
  if (!('timeline_events' in data)) issues.push('缺少 timeline_events')
  if (data.stats && typeof data.stats.total_completed !== 'number') {
    issues.push('stats.total_completed 类型应为 number')
  }
  if (data.groups && !Array.isArray(data.groups)) issues.push('groups 应为 array')
  return issues
}

async function main() {
  console.log(`\n=== 摘要链一致性检查 ===  target: ${API_URL}\n`)
  let allOk = true

  // ── 1. 项目摘要口径 ───────────────────────────────────────────────────────
  console.log('【1】项目共享摘要 /api/dashboard/projects-summary')
  const { ok, status, body, error } = await fetchJSON(`${API_URL}/api/dashboard/projects-summary`)
  if (!ok || error) {
    console.log(`  ❌ 接口不可达：HTTP ${status} ${error || ''}`)
    allOk = false
  } else if (!body?.success || !Array.isArray(body.data)) {
    console.log(`  ❌ 响应格式异常：success=${body?.success}, data 是否数组=${Array.isArray(body?.data)}`)
    allOk = false
  } else {
    const items = body.data
    console.log(`  ✅ 接口可达，共 ${items.length} 个项目`)
    if (items.length === 0) {
      console.log(`  ⏭  无项目数据，跳过字段一致性校验`)
    } else {
      let fieldOk = true
      for (let i = 0; i < items.length; i++) {
        if (!checkSummaryItem(items[i], i)) fieldOk = false
      }
      if (fieldOk) {
        console.log(`  ✅ 所有 ${items.length} 个摘要字段一致性通过`)
      } else {
        allOk = false
      }
    }
  }

  // ── 2. 任务总结口径 ───────────────────────────────────────────────────────
  console.log('\n【2】任务总结结构 /api/task-summaries/projects/:id/task-summary')
  if (!SAMPLE_PROJECT_ID) {
    console.log('  ⏭  SKIP（设置 SAMPLE_PROJECT_ID 环境变量以启用此检查）')
  } else {
    const url = `${API_URL}/api/task-summaries/projects/${SAMPLE_PROJECT_ID}/task-summary`
    const { ok: tOk, status: tStatus, body: tBody, error: tErr } = await fetchJSON(url)
    if (!tOk || tErr) {
      console.log(`  ❌ 接口不可达：HTTP ${tStatus} ${tErr || ''}`)
      allOk = false
    } else if (!tBody?.success) {
      console.log(`  ❌ 响应 success=false：${JSON.stringify(tBody?.error)}`)
      allOk = false
    } else {
      const issues = checkTaskSummary(tBody.data)
      if (issues.length > 0) {
        console.log('  ❌ 任务总结结构问题：')
        for (const issue of issues) console.log(`     - ${issue}`)
        allOk = false
      } else {
        console.log(`  ✅ 任务总结结构通过：total_completed=${tBody.data?.stats?.total_completed}, timeline_ready=${tBody.data?.timeline_ready}`)
      }
    }
  }

  // ── 3. 共享摘要与项目单项摘要一致性 ──────────────────────────────────────
  console.log('\n【3】共享摘要与单项摘要字段对齐')
  if (!SAMPLE_PROJECT_ID) {
    console.log('  ⏭  SKIP（设置 SAMPLE_PROJECT_ID 环境变量以启用此检查）')
  } else {
    const url = `${API_URL}/api/dashboard/project-summary?projectId=${SAMPLE_PROJECT_ID}`
    const { ok: sOk, status: sStatus, body: sBody, error: sErr } = await fetchJSON(url)
    if (!sOk || sErr) {
      console.log(`  ❌ 接口不可达：HTTP ${sStatus} ${sErr || ''}`)
      allOk = false
    } else if (!sBody?.success) {
      console.log(`  ❌ 响应 success=false`)
      allOk = false
    } else {
      const single = sBody.data
      const issues = []
      for (const field of REQUIRED_SUMMARY_FIELDS) {
        if (!(field in single)) issues.push(`缺少字段: ${field}`)
      }
      if (issues.length > 0) {
        console.log('  ❌ 单项摘要结构问题：')
        for (const issue of issues) console.log(`     - ${issue}`)
        allOk = false
      } else {
        console.log(`  ✅ 单项摘要字段对齐通过`)
      }
    }
  }

  console.log(`\n${allOk ? '✅ 全部通过' : '❌ 存在问题，请查看上方输出'}`)
  if (!allOk) process.exit(1)
}

main().catch((err) => {
  console.error('未捕获错误:', err)
  process.exit(1)
})
