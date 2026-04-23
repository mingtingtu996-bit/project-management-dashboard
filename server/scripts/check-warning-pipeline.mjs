#!/usr/bin/env node
/**
 * 8.5.3 通知 / 预警诊断脚本
 *
 * 检查范围：
 *   - /api/notifications 通知路由可达性与结构
 *   - /api/notifications/unread 未读计数可达性
 *   - /api/jobs (scheduler/任务触发) 最低限度可达性
 *   - warning service 产出口径（通过 notifications 路由间接验证）
 *
 * 用法：
 *   API_URL=http://localhost:3001 node server/scripts/check-warning-pipeline.mjs
 *   SAMPLE_PROJECT_ID=<uuid> API_URL=http://localhost:3001 node server/scripts/check-warning-pipeline.mjs
 */

const API_URL = process.env.API_URL || 'http://localhost:3001'
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const SAMPLE_PROJECT_ID = process.env.SAMPLE_PROJECT_ID || ''
const TIMEOUT_MS = 5000

async function fetchJSON(url, opts = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
    const res = await fetch(url, { headers, ...opts, signal: controller.signal })
    let body = null
    try { body = await res.json() } catch (_) {}
    return { ok: res.ok, status: res.status, body }
  } catch (err) {
    return { ok: false, status: -1, body: null, error: err.name === 'AbortError' ? 'TIMEOUT' : err.message }
  } finally {
    clearTimeout(timer)
  }
}

function checkNotificationItem(item) {
  const issues = []
  if (!item.id) issues.push('缺少 id')
  if (!item.title) issues.push('缺少 title')
  if (!item.message && !item.body) issues.push('缺少 message/body')
  return issues
}

async function main() {
  console.log(`\n=== 通知 / 预警诊断 ===  target: ${API_URL}\n`)
  let allOk = true

  // ── 1. /api/notifications 基础可达性与结构 ────────────────────────────────
  console.log('【1】通知路由可达性 /api/notifications')
  const query = SAMPLE_PROJECT_ID ? `?projectId=${SAMPLE_PROJECT_ID}&limit=5` : '?limit=5'
  const { ok, status, body, error } = await fetchJSON(`${API_URL}/api/notifications${query}`)
  if (!ok || error) {
    console.log(`  ❌ 不可达：HTTP ${status} ${error || ''}`)
    allOk = false
  } else if (body?.success === false) {
    console.log(`  ❌ 响应 success=false：${JSON.stringify(body.error)}`)
    allOk = false
  } else {
    const items = body?.data ?? []
    console.log(`  ✅ 可达，返回 ${items.length} 条通知`)
    if (items.length > 0) {
      let structOk = true
      for (let i = 0; i < items.length; i++) {
        const issues = checkNotificationItem(items[i])
        if (issues.length > 0) {
          console.log(`  ⚠️  通知[${i}] 结构问题：${issues.join(', ')}`)
          structOk = false
        }
      }
      if (structOk) {
        console.log(`  ✅ 所有通知结构检查通过`)
      } else {
        allOk = false
      }
    } else {
      console.log(`  ⏭  无通知数据（项目可能无风险/问题），跳过结构校验`)
    }
  }

  // ── 2. /api/notifications/unread 计数 ────────────────────────────────────
  console.log('\n【2】未读计数 /api/notifications/unread')
  const unreadQuery = SAMPLE_PROJECT_ID ? `?projectId=${SAMPLE_PROJECT_ID}` : ''
  const { ok: uOk, status: uStatus, body: uBody, error: uErr } = await fetchJSON(
    `${API_URL}/api/notifications/unread${unreadQuery}`,
  )
  if (!uOk || uErr) {
    console.log(`  ❌ 不可达：HTTP ${uStatus} ${uErr || ''}`)
    allOk = false
  } else if (uBody?.success === false) {
    console.log(`  ❌ 响�� success=false`)
    allOk = false
  } else {
    const count = uBody?.data?.count ?? uBody?.data?.unreadCount ?? (typeof uBody?.data === 'number' ? uBody.data : null)
    console.log(`  ✅ 可达，未读计数=${count ?? '(见 data 字段)'}`)
  }

  // ── 3. /api/jobs scheduler 可达性（触发接口，仅 GET 状态检查） ─────────────
  console.log('\n【3】定时任务可达性 /api/jobs')
  const { ok: jOk, status: jStatus, body: jBody, error: jErr } = await fetchJSON(`${API_URL}/api/jobs`)
  if (jErr) {
    console.log(`  ❌ 不可达：${jErr}`)
    allOk = false
  } else if (jStatus === 404) {
    console.log(`  ⚠️  /api/jobs 路由不存在（404），如果本项目未暴露此路由可忽略`)
  } else if (jStatus === 401 || jStatus === 403) {
    console.log(`  ⚠️  /api/jobs 需要认证（${jStatus}），服务可达，设置 AUTH_TOKEN 查看完整状态`)
  } else if (jOk) {
    console.log(`  ✅ 可达，HTTP ${jStatus}`)
  } else {
    console.log(`  ⚠️  HTTP ${jStatus}，可能需要认证或路由不同`)
  }

  // ── 4. warning service 产出间接验证 ──────────────────────────────────────
  console.log('\n【4】Warning service 产出间接验证')
  console.log('  ⏭  通过 /api/notifications 路由间接验证（步骤1已覆盖）')
  console.log('     如需深度诊断，请设置 SAMPLE_PROJECT_ID 并确保有活跃风险数据')

  console.log(`\n${allOk ? '✅ 全部通过' : '⚠️  存在问题，请查看上方输出（部分检查需要真实数据才能完整验证）'}`)
  if (!allOk) process.exit(1)
}

main().catch((err) => {
  console.error('未捕获错误:', err)
  process.exit(1)
})
