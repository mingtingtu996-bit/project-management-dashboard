#!/usr/bin/env node
/**
 * 8.5.1 核心接口健康检查脚本
 *
 * 检查范围：
 *   - /api/health
 *   - /api/dashboard/projects-summary
 *   - /api/dashboard/project-summary?projectId=...
 *   - /api/task-summaries/projects/:id/task-summary
 *   - /api/notifications
 *
 * 用法（在项目根目录）：
 *   API_URL=http://localhost:3001 node server/scripts/check-core-health.mjs
 *   AUTH_TOKEN=<your-token> API_URL=http://localhost:3001 node server/scripts/check-core-health.mjs
 */

const API_URL = process.env.API_URL || 'http://localhost:3001'
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''

const TIMEOUT_MS = 5000

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (AUTH_TOKEN) headers['Authorization'] = `Bearer ${AUTH_TOKEN}`
  return headers
}

async function checkEndpoint(label, url, opts = {}) {
  try {
    const res = await fetchWithTimeout(url, { headers: buildHeaders(), ...opts })
    const body = await res.json().catch(() => null)
    const ok = res.ok && (body?.success !== false)
    const status = ok ? '✅ OK' : `⚠️  HTTP ${res.status}`
    const note = body ? (body.success === false ? `error=${body.error?.message ?? JSON.stringify(body.error)}` : '') : '(no json)'
    console.log(`  ${status}  [${res.status}]  ${label}  ${note}`)
    return ok
  } catch (err) {
    const msg = err.name === 'AbortError' ? 'TIMEOUT' : err.message
    console.log(`  ❌ FAIL  [---]  ${label}  error=${msg}`)
    return false
  }
}

async function main() {
  console.log(`\n=== 核心接口健康检查 ===  target: ${API_URL}\n`)
  const results = []

  // 1. /api/health
  results.push(await checkEndpoint('/api/health', `${API_URL}/api/health`))

  // 2. /api/dashboard/projects-summary（无需认证）
  results.push(await checkEndpoint('/api/dashboard/projects-summary', `${API_URL}/api/dashboard/projects-summary`))

  // 3. /api/notifications（无需认证）
  results.push(await checkEndpoint('/api/notifications', `${API_URL}/api/notifications?limit=1`))

  // 4. 以下接口通常需要认证；无 TOKEN 时仅做连接性检查，401/400 也视为服务可达
  const projectId = process.env.SAMPLE_PROJECT_ID || ''
  if (projectId) {
    results.push(await checkEndpoint(
      `/api/dashboard/project-summary?projectId=${projectId}`,
      `${API_URL}/api/dashboard/project-summary?projectId=${projectId}`,
    ))
    results.push(await checkEndpoint(
      `/api/task-summaries/projects/${projectId}/task-summary`,
      `${API_URL}/api/task-summaries/projects/${projectId}/task-summary`,
    ))
  } else {
    console.log(`  ⏭  SKIP  /api/dashboard/project-summary  (set SAMPLE_PROJECT_ID to enable)`)
    console.log(`  ⏭  SKIP  /api/task-summaries/projects/:id/task-summary  (set SAMPLE_PROJECT_ID to enable)`)
  }

  const passed = results.filter(Boolean).length
  const total = results.length
  console.log(`\n结果：${passed}/${total} 通过`)
  if (passed < total) {
    console.log('建议：检查 server 是否已启动、环境变量是否正确配置')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('未捕获错误:', err)
  process.exit(1)
})
