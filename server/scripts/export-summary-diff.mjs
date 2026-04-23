#!/usr/bin/env node
/**
 * 8.6.3 数据一致性辅助导出脚本
 *
 * 目标：导出项目摘要 / 任务总结 / 通知链的差异快照，供人工复核
 *
 * 具体内容：
 *   - 项目摘要快照（healthScore / progress / delayedCount）
 *   - 任务总结状态（timeline_ready / total_completed）
 *   - 通知链摘要（通知总数 / 未读数）
 *   - 关键差异标记（进度与健康度不一致 / 有延期但健康度高 / timeline 未就绪）
 *
 * 用法：
 *   API_URL=http://localhost:3001 node server/scripts/export-summary-diff.mjs
 *   API_URL=http://localhost:3001 node server/scripts/export-summary-diff.mjs --output diff-$(date +%Y%m%d).json
 */

import { writeFileSync } from 'fs'

const API_URL = process.env.API_URL || 'http://localhost:3001'
const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const TIMEOUT_MS = 8000

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

// 标记不一致点
function detectAnomalies(summary, taskSummary, unreadCount) {
  const anomalies = []

  // 有延期任务但健康度很高（可能健康度计算未更新）
  if (summary.delayedTaskCount > 0 && summary.healthScore >= 85) {
    anomalies.push(`有延期任务(${summary.delayedTaskCount}个)但健康度仍为 ${summary.healthScore}（健康）`)
  }

  // 进度低但健康度高
  if (summary.overallProgress < 30 && summary.healthScore > 80) {
    anomalies.push(`进度仅 ${summary.overallProgress}% 但健康度 ${summary.healthScore}（可能初期项目，仅供参考）`)
  }

  // 任务总结 timeline 未就绪
  if (taskSummary && taskSummary.timeline_ready === false) {
    anomalies.push('任务总结 timeline_ready=false，时间线数据待写入')
  }

  // 有已完成任务但任务总结中 total_completed 为 0（可能统计口径差异）
  if (
    summary.completedTaskCount > 0 &&
    taskSummary &&
    taskSummary.stats?.total_completed === 0
  ) {
    anomalies.push(
      `项目摘要显示 ${summary.completedTaskCount} 个已完成任务，但任务总结 total_completed=0（可能数据口径不同）`,
    )
  }

  // 未读通知量大
  if (typeof unreadCount === 'number' && unreadCount > 10) {
    anomalies.push(`未读通知数量较多（${unreadCount}条），建议检查预警规则是否合理`)
  }

  return anomalies
}

async function collectProjectDiff(project) {
  const projectId = project.id

  // 任务总结
  const { body: tBody } = await fetchJSON(
    `${API_URL}/api/task-summaries/projects/${projectId}/task-summary`,
  )
  const taskSummary = tBody?.data ?? null

  // 通知未读数
  const { body: uBody } = await fetchJSON(
    `${API_URL}/api/notifications/unread?projectId=${projectId}`,
  )
  const unreadCount =
    uBody?.data?.count ?? uBody?.data?.unreadCount ?? (typeof uBody?.data === 'number' ? uBody.data : null)

  const anomalies = detectAnomalies(project, taskSummary, unreadCount)

  return {
    projectId,
    projectName: project.name,
    snapshot: {
      healthScore: project.healthScore,
      overallProgress: project.overallProgress,
      totalTasks: project.totalTasks,
      completedTaskCount: project.completedTaskCount,
      delayedTaskCount: project.delayedTaskCount ?? 0,
      activeRiskCount: project.activeRiskCount ?? 0,
    },
    taskSummarySnapshot: taskSummary
      ? {
          timelineReady: taskSummary.timeline_ready,
          totalCompleted: taskSummary.stats?.total_completed ?? 0,
          groupCount: taskSummary.groups?.length ?? 0,
        }
      : null,
    notificationSnapshot: {
      unreadCount,
    },
    anomalies,
    hasAnomalies: anomalies.length > 0,
    capturedAt: new Date().toISOString(),
  }
}

async function main() {
  console.log(`\n=== 数据一致性辅助导出 ===  target: ${API_URL}\n`)

  // 获取所有项目摘要
  const { ok, body, error } = await fetchJSON(`${API_URL}/api/dashboard/projects-summary`)
  if (!ok || error) {
    console.error(`❌ 无法获取项目列表：${error || `HTTP ${body?.status}`}`)
    process.exit(1)
  }

  const projects = body?.data ?? []
  if (projects.length === 0) {
    console.log('⚠️  未找到任何项目')
    return
  }

  console.log(`找到 ${projects.length} 个项目，逐一收集差异快照...\n`)

  const diffs = []
  for (const project of projects) {
    process.stdout.write(`  收集: ${project.name ?? project.id}...`)
    const diff = await collectProjectDiff(project)
    diffs.push(diff)
    const anomalyStr = diff.hasAnomalies ? ` ⚠️  ${diff.anomalies.length}个异常` : ' ✅'
    console.log(anomalyStr)
  }

  // 汇总异常
  const projectsWithAnomalies = diffs.filter((d) => d.hasAnomalies)
  console.log(`\n── 异常汇总（${projectsWithAnomalies.length}/${projects.length} 个项目有异常）──`)
  if (projectsWithAnomalies.length === 0) {
    console.log('  ✅ 无异常')
  } else {
    for (const diff of projectsWithAnomalies) {
      console.log(`\n  项目: ${diff.projectName}`)
      for (const anomaly of diff.anomalies) {
        console.log(`    - ${anomaly}`)
      }
    }
  }

  // 输出 JSON 文件
  if (OUTPUT_FILE) {
    const snapshot = {
      generatedAt: new Date().toISOString(),
      apiUrl: API_URL,
      projectCount: projects.length,
      anomalyCount: projectsWithAnomalies.length,
      projects: diffs,
    }
    writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8')
    console.log(`\n✅ 已导出到: ${OUTPUT_FILE}`)
  }

  console.log('\n导出完成')
}

main().catch((err) => {
  console.error('未捕获错误:', err)
  process.exit(1)
})
