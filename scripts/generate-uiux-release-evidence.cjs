const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const requirementsPath = path.join(root, 'docs/plans/UI_UX需求清单.md')
const executionPlanPath = path.join(root, 'docs/plans/UI_UX优化执行方案.md')
const progressPath = path.join(root, 'EXECUTION_PROGRESS.json')
const evidencePath = path.join(root, 'docs/reports/uiux-295-release-evidence.md')

const requirements = fs.readFileSync(requirementsPath, 'utf8')
const executionPlan = fs.readFileSync(executionPlanPath, 'utf8')
const progress = JSON.parse(fs.readFileSync(progressPath, 'utf8'))
const steps = progress.uiux_v1_3?.steps ?? {}

const rows = requirements
  .split(/\r?\n/)
  .filter((line) => /^\|\s*R\d{3}\s*\|/.test(line))
  .map((line) => {
    const parts = line.split('|').slice(1, -1).map((part) => part.trim())
    const id = parts[0]
    const step = parts[parts.length - 1]
    const scope = parts.length >= 4 ? parts[parts.length - 2] : ''
    const requirement = parts.slice(1, -2).join(' -> ')
    return { id, requirement, scope, step }
  })

const headingIds = new Set(
  [...executionPlan.matchAll(/^#{2,4}\s+(U[^\s—]+)\s*[—-]/gm)].map((match) => match[1]),
)

const missingIds = []
for (let index = 1; index <= 295; index += 1) {
  const id = `R${String(index).padStart(3, '0')}`
  if (!rows.some((row) => row.id === id)) missingIds.push(id)
}

const duplicateIds = rows
  .map((row) => row.id)
  .filter((id, index, all) => all.indexOf(id) !== index)
const missingHeadings = [...new Set(rows.map((row) => row.step).filter((step) => !headingIds.has(step)))]
const incompleteRows = rows.filter((row) => steps[row.step]?.status !== 'completed')

if (rows.length !== 295 || missingIds.length || duplicateIds.length || missingHeadings.length || incompleteRows.length) {
  console.error({
    rowCount: rows.length,
    missingIds,
    duplicateIds: [...new Set(duplicateIds)],
    missingHeadings,
    incompleteRows: incompleteRows.map((row) => `${row.id}:${row.step}`),
  })
  process.exit(1)
}

function cell(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '/')
    .trim()
}

const now = '2026-04-29T09:50:00+08:00'
const tableRows = rows.map((row) => {
  const stepRecord = steps[row.step]
  const note = stepRecord?.note ? `Step completed at ${stepRecord.completed_at ?? 'recorded'}; ${stepRecord.note}` : ''
  return [
    row.id,
    row.step,
    'Leaf-step completion record + U.qa.trace consistency check',
    `EXECUTION_PROGRESS.json uiux_v1_3.steps.${row.step}`,
    'PASS',
    `${row.scope}: ${row.requirement}. ${note}`,
  ]
    .map(cell)
    .join(' | ')
})

const content = [
  '# UIUX 295 Release Evidence',
  '',
  `更新时间：${now}`,
  '',
  '母文件：`docs/plans/UI_UX商业级全面优化方案_v1.3.md`',
  '执行方案：`docs/plans/UI_UX优化执行方案.md`',
  '需求清单：`docs/plans/UI_UX需求清单.md`',
  '',
  '## Trace Gate Summary',
  '',
  '- `R001-R295` 连续性：PASS，295/295。',
  '- 需求清单叶子步骤引用：PASS，全部存在于执行方案标题。',
  '- 需求到执行进度：PASS，295 条对应步骤均已记录为 completed。',
  '- 证据口径：本文件为 `U.qa.trace` 追踪矩阵；后续 `U.qa.static` 到 `U.qa.contrast` 的命令日志、截图和缺陷闭环继续追加到本文件。',
  '',
  '## Requirement Matrix',
  '',
  '| 需求ID | 执行步骤 | 验证方式 | 证据 | 结果 | 备注 |',
  '|---|---|---|---|---|---|',
  ...tableRows.map((row) => `| ${row} |`),
  '',
].join('\n')

fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
fs.writeFileSync(evidencePath, content)

console.log('UIUX release evidence generated: 295/295 PASS')
