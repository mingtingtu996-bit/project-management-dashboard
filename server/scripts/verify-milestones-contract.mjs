import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '../..')
const milestonesPagePath = resolve(rootDir, 'client/src/pages/Milestones.tsx')
const milestoneSummaryServicePath = resolve(rootDir, 'server/src/services/projectExecutionSummaryService.ts')

const pageSource = readFileSync(milestonesPagePath, 'utf8')
const serviceSource = readFileSync(milestoneSummaryServicePath, 'utf8')

assert.ok(pageSource.includes('DashboardApiService.getProjectSummary'), 'Milestones 页面应直接消费共享摘要')
assert.ok(pageSource.includes('milestoneOverview'), 'Milestones 页面应渲染共享里程碑摘要')
assert.ok(!pageSource.includes('buildMilestoneOverview('), 'Milestones 页面不应再本地重算里程碑摘要')
assert.ok(!pageSource.includes('useStore('), 'Milestones 页面不应再读取本地任务快照')
assert.ok(!pageSource.includes('milestoneDb') && !pageSource.includes('taskDb'), 'Milestones 页面不应再依赖本地里程碑/任务库')

assert.ok(serviceSource.includes('export interface MilestoneOverviewItem'), '共享摘要服务应导出里程碑条目类型')
assert.ok(serviceSource.includes('export interface MilestoneOverviewStats'), '共享摘要服务应导出里程碑统计类型')
assert.ok(serviceSource.includes('export interface MilestoneOverview'), '共享摘要服务应导出里程碑汇总类型')
assert.ok(serviceSource.includes('const milestoneOverview = buildMilestoneOverview(tasks)'), '共享摘要服务应统一计算里程碑汇总')
assert.ok(serviceSource.includes('milestoneOverview,'), '共享摘要服务应把里程碑汇总返回给项目摘要')

console.log('Milestones contract verified')
