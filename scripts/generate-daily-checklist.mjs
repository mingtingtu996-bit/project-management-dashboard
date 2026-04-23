#!/usr/bin/env node
/**
 * 8.6.2 日常巡检清单生成脚本
 *
 * 生成固定格式的日常巡检命令清单，不接外部系统。
 * 适合每天/每周执行前确认检查范围，或纳入 CI 备忘录。
 *
 * 用法：
 *   node scripts/generate-daily-checklist.mjs
 *   node scripts/generate-daily-checklist.mjs --api http://localhost:3001
 *   node scripts/generate-daily-checklist.mjs --output daily-checklist.md
 */

import { writeFileSync } from 'fs'

const apiArg = process.argv.findIndex((a) => a === '--api')
const API_URL = apiArg >= 0 ? process.argv[apiArg + 1] : (process.env.API_URL || 'http://localhost:3001')

const outputArg = process.argv.findIndex((a) => a === '--output')
const OUTPUT_FILE = outputArg >= 0 ? process.argv[outputArg + 1] : null

const today = new Date().toISOString().slice(0, 10)

const CHECKLIST = `# WorkBuddy 日常巡检清单 — ${today}

> 生成时间：${new Date().toISOString()}
> 目标 API：${API_URL}

---

## 一、验收测试（不依赖真实服务，每次部署后运行）

\`\`\`powershell
# v1 全量验收（前端 + 后端 3 主链）
npm run acceptance:v1

# 或分开运行：
# 前端
npx vitest run --config client/vitest.config.ts src/pages/__tests__/sharedSummary.test.tsx src/pages/__tests__/GanttView.test.tsx src/pages/__tests__/Notifications.test.tsx

# 后端
npx vitest run --config server/vitest.config.ts src/__tests__/projectCreationSummaryChain.test.ts src/__tests__/taskCompletionSummaryChain.test.ts src/__tests__/riskNotificationChain.test.ts
\`\`\`

---

## 二、核心接口健康检查（需 server 已启动）

\`\`\`powershell
API_URL=${API_URL} npm run diag:health
\`\`\`

**检查范围：**
- [ ] \`/api/health\` — 服务存活
- [ ] \`/api/dashboard/projects-summary\` — 共享摘要可达
- [ ] \`/api/notifications\` — 通知路由可达

---

## 三、摘要链一致性检查（需 server 已启动）

\`\`\`powershell
API_URL=${API_URL} SAMPLE_PROJECT_ID=<项目UUID> npm run diag:summary
\`\`\`

**检查范围：**
- [ ] 项目摘要字段完整性（healthScore / totalTasks / overallProgress 等）
- [ ] 任务总结结构（stats / groups / timeline_ready）
- [ ] 单项摘要与共享摘要字段对齐

---

## 四、通知 / 预警诊断（需 server 已启动）

\`\`\`powershell
API_URL=${API_URL} SAMPLE_PROJECT_ID=<项目UUID> npm run diag:warning
\`\`\`

**检查范围：**
- [ ] \`/api/notifications\` 通知结构
- [ ] \`/api/notifications/unread\` 未读计数
- [ ] \`/api/jobs\` 定时任务可达性

---

## 五、批量项目体检导出（每周）

\`\`\`powershell
API_URL=${API_URL} node server/scripts/export-project-audit.mjs --output audit-${today}.json
\`\`\`

**检查范围：**
- [ ] 所有项目健康度 / 进度 / 延期状态
- [ ] 任务总结链是否 timeline_ready
- [ ] 活跃风险数量

---

## 六、数据一致性辅助导出（按需/每月）

\`\`\`powershell
API_URL=${API_URL} node server/scripts/export-summary-diff.mjs --output diff-${today}.json
\`\`\`

**检查范围：**
- [ ] 项目摘要 / 任务总结 / 通知链差异快照

---

## 七、类型检查

\`\`\`powershell
npx tsc -p client/tsconfig.json --noEmit
npx tsc -p server/tsconfig.json --noEmit
\`\`\`

---

_此清单由 \`scripts/generate-daily-checklist.mjs\` 自动生成_
`

// 输出到控制台
console.log(CHECKLIST)

// 输出到文件
if (OUTPUT_FILE) {
  writeFileSync(OUTPUT_FILE, CHECKLIST, 'utf-8')
  console.error(`\n✅ 已保存到: ${OUTPUT_FILE}`)
}
