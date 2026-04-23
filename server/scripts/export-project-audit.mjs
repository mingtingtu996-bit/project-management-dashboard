#!/usr/bin/env node
/**
 * 8.6.1 批量项目体检导出脚本
 *
 * 高频手工动作台账（8.6.0）：
 *   - 每周：查看所有项目健康度 / 延期数 / 风险状态
 *   - 每周：确认任务总结链是否正常（timeline_ready / total_completed）
 *   - 每月：导出摘要快照供人工复核
 *
 * 目标：将上述手工动作自动化，输出项目摘要、关键风险、任务总结可用性等汇总结果
 *
 * 用法：
 *   API_URL=http://localhost:3001 node server/scripts/export-project-audit.mjs
 *   API_URL=http://localhost:3001 node server/scripts/export-project-audit.mjs --output audit-$(date +%Y%m%d).json
 *
 * 输出：
 *   - 控制台：汇总表格
 *   - 文件（--output 指定）：JSON 格式快照
 */

import { writeFileSync } from 'fs'

const API_URL = process.env.API_URL || 'http://localhost:3001'
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const TIMEOUT_MS = 8000

// 从命令行参数解析 --output
const outputArg = process.argv.findIndex((a) => a === '--output')
const OUTPUT_FILE = outputArg >= 0 ? process.argv[outputArg + 1] : null

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

// 健康度评级
function healthGrade(score) {
  if (score === null || score === undefined) return '未知'
  if (score >= 85) return '健康'
  if (score >= 70) return '预警'
  if (score >= 55) return '风险'
  return '严重'
}

// 延期状态
function delayStatus(delayedCount, delayDays) {
  if (!delayedCount) return '无延期'
  return `${delayedCount}个任务延期/${delayDays || 0}天`
}

async function auditProject(projectId, projectName) {
  // 获取项目摘要
  const { body: summaryBody } = await fetchJSON(
    `${API_URL}/api/dashboard/project-summary?projectId=${projectId}`,
  )
  const summary = summaryBody?.data ?? null

  // 获取任务总结可用性
  const { body: taskSummaryBody } = await fetchJSON(
    `${API_URL}/api/task-summaries/projects/${projectId}/task-summary`,
  )
  const taskSummary = taskSummaryBody?.data ?? null

  return {
    projectId,
    projectName: summary?.name ?? projectName,
    status: summary?.status ?? 'unknown',
    healthScore: summary?.healthScore ?? null,
    healthGrade: healthGrade(summary?.healthScore),
    overallProgress: summary?.overallProgress ?? null,
    totalTasks: summary?.totalTasks ?? null,
    completedTaskCount: summary?.completedTaskCount ?? null,
    delayedTaskCount: summary?.delayedTaskCount ?? null,
    delayDays: summary?.delayDays ?? null,
    delayStatus: delayStatus(summary?.delayedTaskCount, summary?.delayDays),
    activeRiskCount: summary?.activeRiskCount ?? null,
    taskSummaryReady: taskSummary?.timeline_ready ?? null,
    taskSummaryTotal: taskSummary?.stats?.total_completed ?? null,
    auditedAt: new Date().toISOString(),
  }
}

async function main() {
  console.log(`\n=== 批量项目体检导出 ===  target: ${API_URL}\n`)

  // 获取所有项目摘要
  const { ok, body, error } = await fetchJSON(`${API_URL}/api/dashboard/projects-summary`)
  if (!ok || error) {
    console.error(`❌ 无法获取项目列表：${error || `HTTP ${body?.status}`}`)
    process.exit(1)
  }

  const projects = body?.data ?? []
  if (projects.length === 0) {
    console.log('⚠️  未找到任何项目，退出')
    return
  }

  console.log(`找到 ${projects.length} 个项目，逐一体检...\n`)

  const auditResults = []
  for (const project of projects) {
    process.stdout.write(`  检查: ${project.name ?? project.id}...`)
    const result = await auditProject(project.id, project.name)
    auditResults.push(result)
    console.log(` [${result.healthGrade}] 进度=${result.overallProgress ?? '?'}% 延期=${result.delayStatus}`)
  }

  // 汇总表格输出
  console.log('\n── 汇总 ────────────────────────────────────────────────')
  console.log(`${'项目名'.padEnd(24)} ${'健康度'.padEnd(6)} ${'进度'.padEnd(6)} ${'延期'.padEnd(14)} ${'活跃风险'.padEnd(6)} 任务总结`)
  console.log('─'.repeat(72))
  for (const r of auditResults) {
    const name = (r.projectName ?? r.projectId).substring(0, 22).padEnd(24)
    const grade = r.healthGrade.padEnd(6)
    const progress = `${r.overallProgress ?? '?'}%`.padEnd(6)
    const delay = r.delayStatus.padEnd(14)
    const risks = String(r.activeRiskCount ?? '?').padEnd(6)
    const taskSummary = r.taskSummaryReady == null ? 'N/A' : r.taskSummaryReady ? `✅(${r.taskSummaryTotal})` : '⏳待准备'
    console.log(`${name} ${grade} ${progress} ${delay} ${risks} ${taskSummary}`)
  }

  // 统计摘要
  const healthy = auditResults.filter((r) => r.healthScore >= 85).length
  const warning = auditResults.filter((r) => r.healthScore >= 70 && r.healthScore < 85).length
  const risky = auditResults.filter((r) => r.healthScore < 70 && r.healthScore !== null).length
  const totalDelay = auditResults.reduce((sum, r) => sum + (r.delayedTaskCount ?? 0), 0)
  console.log(`\n健康: ${healthy} | 预警: ${warning} | 风险/严重: ${risky} | 总延期任务: ${totalDelay}`)

  // 输出 JSON 文件
  if (OUTPUT_FILE) {
    const snapshot = {
      generatedAt: new Date().toISOString(),
      apiUrl: API_URL,
      projectCount: projects.length,
      summary: { healthy, warning, risky, totalDelayedTasks: totalDelay },
      projects: auditResults,
    }
    writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8')
    console.log(`\n✅ 已导出到: ${OUTPUT_FILE}`)
  }

  console.log('\n体检完成')
}

main().catch((err) => {
  console.error('未捕获错误:', err)
  process.exit(1)
})
