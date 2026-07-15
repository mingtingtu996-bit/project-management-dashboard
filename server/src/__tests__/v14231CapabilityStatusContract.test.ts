import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildV14231EvidenceArtifactIndex,
  V14231_EVIDENCE_ARTIFACT_IDS,
} from '../services/v14231EvidenceArtifactIndexService.js'

function findWorkspaceRoot() {
  const candidates = [process.cwd(), resolve(process.cwd(), '..')]
  const root = candidates.find((candidate) => existsSync(resolve(candidate, 'docs', 'plans')))
  if (!root) {
    throw new Error('Unable to locate workspace docs/plans directory')
  }
  return root
}

function readPlan(): string {
  return readPlanByName('v1.4.23.1体系收口台账与验收门禁矩阵.md')
}

function readPlanByName(filename: string): string {
  const docsDir = resolve(findWorkspaceRoot(), 'docs', 'plans')
  const fullPath = resolve(docsDir, filename)
  if (!existsSync(fullPath)) {
    throw new Error(`Missing v1.4.23.1 plan file: ${filename}`)
  }

  return readFileSync(fullPath, 'utf8')
}

function readServerPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(
    readFileSync(resolve(findWorkspaceRoot(), 'server', 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> }
}

function extractTableRow(planDoc: string, firstCell: string): string {
  const row = planDoc
    .split(/\r?\n/)
    .find((line) => line.startsWith(`| ${firstCell} |`))

  if (!row) {
    throw new Error(`Missing v1.4.23.1 capability row: ${firstCell}`)
  }

  return row
}

function extractSection(planDoc: string, heading: string): string {
  const lines = planDoc.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.includes(heading))
  if (startIndex === -1) {
    throw new Error(`Missing v1.4.23.1 section heading: ${heading}`)
  }

  const nextHeadingIndex = lines.findIndex((line, index) => (
    index > startIndex && /^#{2,3}\s/.test(line)
  ))
  return lines.slice(startIndex, nextHeadingIndex === -1 ? undefined : nextHeadingIndex).join('\n')
}

function parseMarkdownTable(section: string): Array<Record<string, string>> {
  const rows = section
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|'))
    .filter((line) => !/^\|\s*-+/.test(line))
    .map((line) => line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim()))

  if (rows.length < 2) {
    throw new Error('Missing markdown table rows in section')
  }

  const [headers, ...bodyRows] = rows
  return bodyRows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])))
}

function compactMarkdownCell(value: string): string {
  return normalizeMarkdownCell(value).replace(/\s+/g, ' ')
}

function normalizeMarkdownCell(value: string): string {
  return value.replace(/\*\*/g, '').replace(/`/g, '').trim()
}

function extractStatusTokens(value: string): string[] {
  const tokens = Array.from(value.matchAll(/`([^`]+)`/g), (match) => match[1])
  return tokens.length ? tokens : [normalizeMarkdownCell(value)]
}

function buildNumberedIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}.${String(index + 1).padStart(2, '0')}`)
}

function extractV14FileLedgerRows(planDoc: string): string[] {
  return planDoc
    .split(/\r?\n/)
    .filter((line) => line.startsWith('| `v1.4'))
    .map((line) => compactMarkdownCell(line.split('|')[1] ?? ''))
}

function extractNumberedCompletionItems(planDoc: string): Map<number, string> {
  const section = extractSection(planDoc, '6. 终态完成判定')
  const items = new Map<number, string>()
  for (const line of section.split(/\r?\n/)) {
    const match = /^(\d+)\.\s+(.+)$/.exec(line.trim())
    if (match) {
      items.set(Number(match[1]), match[2])
    }
  }
  return items
}

function extractA10EvidenceIds(value: string): string[] {
  return Array.from(value.matchAll(/A10-E\d+[a-z]?/g), (match) => match[0])
}

describe('v1.4.23.1 capability status ledger', () => {
  it('defaults unlisted v1.5 capabilities and page entries to not-ready instead of implicit consumption', () => {
    const mainPlan = readPlanByName('v1.4.23.1体系收口台账与验收门禁矩阵.md')
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')

    for (const plan of [mainPlan, ledgerPlan]) {
      expect(plan).toContain('未出现在 4.7.05 或 4.7.06 的能力 / 页面入口，一律按 `not-ready` 处理')
      expect(plan).toContain('不得作为 v1.5 主指标、主结论、主动作或卖点文案来源')
      expect(plan).toContain('只能先回填 C-13 判定行、页面降级行、解锁 C 编号和证据索引后再消费')
    }
    expect(ledgerPlan).toContain('2026-06-26 C-13 v1.5 未登记能力默认 not-ready 契约补强')
    expect(ledgerPlan).toContain('v14231CapabilityStatusContract.test.ts')
  })

  it('keeps the C-13 capability and page degradation tables structurally complete', () => {
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')
    const allowedStatuses = new Set(['production-ready', 'needs-gating', 'not-ready', 'display-only'])
    const expectedCapabilities = [
      '健康度分解',
      '进度偏差 + 归因',
      '未来预测（剩余/关键路径/完工日/赶工）',
      '责任主体绩效',
      '报表 / 导出',
      '公司驾驶舱 CompanyCockpit',
      '快照 / 历史趋势',
      '快速建模向导（冷启动脊柱）',
      '计划生成（冷启动脊柱·护城河兑现）',
      '进度录入（冷启动脊柱·日常最小录入）',
    ]
    const expectedPages = [
      'Dashboard 项目总览',
      'Reports',
      'CompanyCockpit',
      'TaskSummary',
      'Gantt / Planning',
      '规则资产 / 治理工作台',
      'DurationAccuracyAdmin / 工期准度后台',
      'Workspace / 待办',
    ]

    const capabilityRows = parseMarkdownTable(extractSection(ledgerPlan, '4.7.05 C-13 首批能力判定表'))
    expect(capabilityRows.map((row) => normalizeMarkdownCell(row['v1.5 首批能力']))).toEqual(expectedCapabilities)
    expect(capabilityRows).toHaveLength(10)
    for (const row of capabilityRows) {
      for (const token of extractStatusTokens(row['当前判定'])) {
        expect(allowedStatuses.has(token)).toBe(true)
      }
      expect(row['代码核查事实（为何这判定）']).not.toHaveLength(0)
      expect(row['解锁条件（指向 C 编号）']).toMatch(/C-\d+/)
      expect(row['v1.5 当前可做']).not.toHaveLength(0)
    }

    const pageRows = parseMarkdownTable(extractSection(ledgerPlan, '4.7.06 v1.5 页面级消费降级映射'))
    expect(pageRows.map((row) => normalizeMarkdownCell(row['v1.5 页面 / 入口']))).toEqual(expectedPages)
    expect(pageRows).toHaveLength(8)
    for (const row of pageRows) {
      for (const token of extractStatusTokens(row['当前状态'])) {
        expect(allowedStatuses.has(token)).toBe(true)
      }
      expect(row['可消费能力']).not.toHaveLength(0)
      expect(row['UI 降级策略']).not.toHaveLength(0)
      expect(row['禁止动作']).not.toHaveLength(0)
    }
  })

  it('keeps the C-01 file status coverage table complete and evidence-backed', () => {
    const mainPlan = readPlanByName('v1.4.23.1体系收口台账与验收门禁矩阵.md')
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')
    const statusRows = parseMarkdownTable(extractSection(ledgerPlan, '3.1 C-01 文件状态覆盖表'))
    const expectedFiles = [
      'v1.4工程对象主数据体系执行方案.md',
      'v1.4.1项目范围维度体系执行方案.md',
      'v1.4.2WBS拆解标准体系执行方案.md',
      'v1.4.3施工任务标准数据模型执行方案.md',
      'v1.4.4建筑工程任务编码规则执行方案.md',
      'v1.4.5状态与生命周期字典体系执行方案.md',
      'v1.4.6数据来源与映射关系体系执行方案.md',
      'v1.4.7项目基线月度计划执行任务计划治理体系执行方案.md',
      'v1.4.7.1共享计划树底座优化升级执行方案.md',
      'v1.4.7.2分部分项标准库与模板生成体系执行方案.md',
      'v1.4.7.3GanttView共享计划树视图收口方案.md',
      'v1.4.7.4项目基线算法与月度计划算法升级执行方案.md',
      'v1.4.7.5算法seed标准规则项目事实自动校准规则口径.md',
      'v1.4.8任务依赖开工条件阻碍体系执行方案.md',
      'v1.4.9里程碑与关键节点体系执行方案.md',
      'v1.4.10责任主体体系执行方案.md',
      'v1.4.11图纸证照验收与任务联动体系执行方案.md',
      'v1.4.12风险问题预警升级体系执行方案.md',
      'v1.4.13提醒通知与待办触达体系执行方案.md',
      'v1.4.14变更留痕审批审计体系执行方案.md',
      'v1.4.15删除关闭归档与历史保留体系执行方案.md',
      'v1.4.16数据质量与口径治理体系执行方案.md',
      'v1.4.17统计指标口径体系执行方案.md',
      'v1.4.18模板库与经验工期体系执行方案.md',
      'v1.4.19项目健康度与偏差分析体系执行方案.md',
      'v1.4.20权限角色与协作体系执行方案.md',
      'v1.4.20.1工作台前端落地方案.md',
      'v1.4.21材料管控与任务联动体系执行方案.md',
      'v1.4.22算法与规则口径治理体系执行方案.md',
      'v1.4.22.1项目快速建模与起跑线接入执行方案.md',
      'v1.4.22.2前期证照系统模板Seed执行方案.md',
      'v1.4.22.3规则资产公司隔离与自学习体系执行方案.md',
      'v1.4.22.4工期与进度精度闭环专项方案.md',
      'v1.4.22.5外部进度知识源与工期资产自动发布专项方案.md',
      'v1.4.22.6可学习工期资产live自升级闭环专项方案.md',
      'v1.4.23总集成与全链路验收体系执行方案.md',
    ]

    expect(statusRows.map((row) => compactMarkdownCell(row['文件']))).toEqual(expectedFiles)
    expect(extractV14FileLedgerRows(mainPlan)).toEqual(expectedFiles)
    expect(extractV14FileLedgerRows(ledgerPlan).slice(0, expectedFiles.length)).toEqual(expectedFiles)
    expect(statusRows).toHaveLength(36)

    const indexedEvidenceIds = new Set(buildV14231EvidenceArtifactIndex().entries.map((entry) => entry.id))
    for (const row of statusRows) {
      expect(row['当前状态'], row['文件']).not.toHaveLength(0)
      expect(row['验收归属'], row['文件']).toMatch(/C-\d+|A9|A10/)
      expect(row['证据索引'], row['文件']).toMatch(/A10-E\d+[a-z]?|A9|v14231|v141/)
      expect(row['下一步'], row['文件']).not.toHaveLength(0)
      for (const evidenceId of extractA10EvidenceIds(row['证据索引'])) {
        expect(V14231_EVIDENCE_ARTIFACT_IDS, `${row['文件']} references ${evidenceId}`).toContain(evidenceId as typeof V14231_EVIDENCE_ARTIFACT_IDS[number])
        expect(indexedEvidenceIds, `${row['文件']} references indexed ${evidenceId}`).toContain(evidenceId)
      }
    }

    expect(statusRows.find((row) => row['文件'].includes('v1.4.23总集成'))?.['证据索引']).toBe('A9、A10')
    expect(extractTableRow(ledgerPlan, 'C-01')).toContain('状态覆盖表已补')
  })

  it('keeps every C-17, C-18, and C-18.L row evidence-backed or explicitly live-gated', () => {
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')
    const evidenceOrBoundaryPattern = /server\/|client\/|\.github\/|\.test\.|\.sql|\.mjs|\.ts|package\.json|pnpm-lock|CLEAN_MIGRATION|npm(?:\.cmd)? run|npx(?:\.cmd)?|vitest|tsc|guard:|diagnose:|profile:|migrate:|artifacts\/|live|needs_live|needs-gating|PoC|压测|真实|归档|复核|待证|未闭|阻断|持续门禁|废止|边界|不代表|不得|仍需/i
    const c17Ids = buildNumberedIds('C-17', 49)
    const c18Ids = buildNumberedIds('C-18', 20)
    const c18LiveIds = Array.from({ length: 15 }, (_, index) => `C-18.L${String(index + 1).padStart(2, '0')}`)

    for (const id of c17Ids) {
      const row = extractTableRow(ledgerPlan, id)
      expect(row, id).toMatch(evidenceOrBoundaryPattern)
      expect(row, id).toMatch(/C-\d+|C-18\.L|C-19|CLEAN_MIGRATION|A10-E\d+/)
    }

    for (const id of c18Ids) {
      const row = extractTableRow(ledgerPlan, id)
      expect(row, id).toMatch(evidenceOrBoundaryPattern)
      expect(row, id).toMatch(/C-\d+|C-18\.L|CLEAN_MIGRATION|A10-E\d+/)
    }

    for (const id of c18LiveIds) {
      const row = extractTableRow(ledgerPlan, id)
      expect(row, id).toMatch(/diagnose:|profile:|guard:|live|压测|PoC|真实|迁移|归档|静态门禁|CI/)
      expect(row, id).toMatch(/--output-file|missingArchivedJson|归档|blocked|evidence|证据|guard:|CI|测试/)
    }

    expect(extractTableRow(ledgerPlan, 'C-17')).toContain('当前 49/49 均已纳入')
    expect(extractTableRow(ledgerPlan, 'C-18')).toContain('2026-06-29')
    expect(extractTableRow(ledgerPlan, 'C-18')).toContain('pass / mayClose=true')
    expect(extractTableRow(ledgerPlan, 'C-18')).toContain('后续换库、换 env、改 schema、改诊断或新增 live surface 必须重跑')
  })

  it('keeps every C-18.L live diagnostic/profile command exposed by npm and backed by an existing script file', () => {
    const plan = readPlan()
    const packageJson = readServerPackageJson()
    const requiredCommands: Array<{
      rows: string[]
      command: string
      scriptPath: string
    }> = [
      {
        rows: ['C-18.L01', 'C-18.L02', 'C-18.L03', 'C-18.L04'],
        command: 'diagnose:rls-proacl-live',
        scriptPath: 'src/scripts/diagnose-rls-proacl-live.ts',
      },
      {
        rows: ['C-18.L04'],
        command: 'diagnose:execute-sql-anon-poc-live',
        scriptPath: 'src/scripts/diagnose-execute-sql-anon-poc-live.ts',
      },
      {
        rows: ['C-18.L06'],
        command: 'diagnose:duration-canary-approval-live',
        scriptPath: 'src/scripts/diagnose-duration-canary-approval-live.ts',
      },
      {
        rows: ['C-18.L07'],
        command: 'diagnose:critical-path-concurrency-live',
        scriptPath: 'src/scripts/diagnose-critical-path-concurrency-live.ts',
      },
      {
        rows: ['C-18.L08'],
        command: 'diagnose:acceptance-status-concurrency-live',
        scriptPath: 'src/scripts/diagnose-acceptance-status-concurrency-live.ts',
      },
      {
        rows: ['C-18.L09'],
        command: 'diagnose:wizard-commit-live',
        scriptPath: 'src/scripts/diagnose-wizard-commit-live.ts',
      },
      {
        rows: ['C-18.L10'],
        command: 'profile:wbs-generation',
        scriptPath: 'src/scripts/profile-wbs-generation.ts',
      },
      {
        rows: ['C-18.L11'],
        command: 'diagnose:warning-sync-live',
        scriptPath: 'src/scripts/diagnose-warning-notification-sync-live.ts',
      },
      {
        rows: ['C-18.L12'],
        command: 'profile:critical-path-network',
        scriptPath: 'src/scripts/profile-critical-path-network.ts',
      },
      {
        rows: ['C-18.L13'],
        command: 'diagnose:health-trend-live',
        scriptPath: 'src/scripts/diagnose-company-health-trend-live.ts',
      },
      {
        rows: ['C-18.L14'],
        command: 'profile:company-summary',
        scriptPath: 'src/scripts/profile-company-summary.ts',
      },
      {
        rows: ['C-18.L15'],
        command: 'diagnose:spreadsheet-migration-live',
        scriptPath: 'src/scripts/diagnose-spreadsheet-migration-live.ts',
      },
    ]

    for (const item of requiredCommands) {
      for (const rowId of item.rows) {
        expect(extractTableRow(plan, rowId)).toContain(item.command)
      }
      expect(packageJson.scripts?.[item.command]).toBe(`tsx -r dotenv/config ${item.scriptPath}`)
      const scriptFile = resolve(findWorkspaceRoot(), 'server', item.scriptPath)
      expect(existsSync(scriptFile)).toBe(true)
      const scriptSource = readFileSync(scriptFile, 'utf8')
      expect(scriptSource, `${item.command} must expose --output-file for archived evidence`).toContain('output-file')
      expect(
        scriptSource.includes('writeFileSync') || scriptSource.includes('writeJsonFile'),
        `${item.command} must write archived JSON when outputFile is present`,
      ).toBe(true)
      expect(scriptSource, `${item.command} must mark missing archived JSON explicitly`).toContain('missingArchivedJson')
      if (item.command.startsWith('diagnose:') || item.command.startsWith('profile:')) {
        expect(scriptSource, `${item.command} must carry diagnosticRunId for evidence correlation`).toContain('diagnosticRunId')
      }
    }
  })

  it('keeps the A-file terminal completion checklist machine-bound while preserving future live gate discipline', () => {
    const workspaceRoot = findWorkspaceRoot()
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')
    const mainPlan = readPlanByName('v1.4.23.1体系收口台账与验收门禁矩阵.md')
    const serverPackageJson = readServerPackageJson()
    const rootPackageJson = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> }
    const deployWorkflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const workflowGuard = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'workflow-guard.yml'), 'utf8')
    const items = extractNumberedCompletionItems(ledgerPlan)

    expect([...items.keys()]).toEqual(Array.from({ length: 19 }, (_, index) => index + 1))

    expect(items.get(1)).toContain('每份 v1.4 文件')
    expect(items.get(1)).toContain('验收归属')
    expect(extractSection(ledgerPlan, '3.1 C-01 文件状态覆盖表')).toContain('v1.4.23总集成与全链路验收体系执行方案.md')

    expect(items.get(2)).toContain('P0')
    expect(items.get(2)).toContain('回归门禁')
    expect(items.get(3)).toContain('P1')
    expect(items.get(3)).toMatch(/契约测试|静态检查|台账追踪/)
    expect(extractTableRow(ledgerPlan, 'C-17')).toContain('当前 49/49 均已纳入')
    expect(extractTableRow(ledgerPlan, 'C-18')).toContain('C-18.L07-L15')
    expect(extractTableRow(ledgerPlan, 'C-18')).toContain('pass / mayClose=true')

    expect(items.get(4)).toContain('旧对象')
    expect(items.get(4)).toContain('受控 drop migration')
    expect(items.get(4)).toContain('无历史数据')
    expect(serverPackageJson.scripts?.['guard:legacy-object-drop']).toContain('check-legacy-object-drop-guard.ts')
    expect(deployWorkflow).toContain('npm run audit:retired-object-references')
    expect(workflowGuard).toContain('server/src/scripts/check-legacy-object-drop-guard.ts')

    expect(items.get(5)).toContain('Dashboard')
    expect(items.get(5)).toContain('CompanyCockpit')
    for (const guardName of [
      'guard:route-aggregation',
      'guard:summary-service-aggregation',
      'guard:metric-ssot',
    ]) {
      expect(serverPackageJson.scripts?.[guardName]).toBeTruthy()
      expect(deployWorkflow).toContain(`npm run ${guardName}`)
    }
    expect(deployWorkflow).toContain('pnpm --dir client run guard:frontend-bi-aggregation')

    expect(items.get(6)).toContain('多公司 / 项目隔离')
    expect(items.get(6)).toMatch(/后端查询|RLS|服务层校验/)
    expect(items.get(7)).toContain('算法、seed、规则、项目事实、自学习、override')
    expect(extractTableRow(ledgerPlan, 'A10-E14')).toContain('guard:spatial-semantic')
    expect(extractTableRow(ledgerPlan, 'A10-E14')).toContain('guard:business-type-registry')

    expect(items.get(8)).toContain('inclusiveDurationDays / constructionCalendar')
    expect(items.get(8)).toContain('唯一 span 真值')
    expect(extractTableRow(ledgerPlan, 'A10-E08')).toContain('durationSurface.contract.test.ts')
    expect(extractTableRow(ledgerPlan, 'A10-E08')).toContain('durationConsistency.contract.test.ts')

    expect(items.get(9)).toContain('C-05')
    for (const fragment of ['.reduce(', '.filter(...).length', '集合 size', '未登记 metric key', 'CI']) {
      expect(items.get(9)).toContain(fragment)
    }

    expect(items.get(10)).toContain('C-16.1')
    expect(items.get(10)).toContain('guard-architecture-boundaries.mjs')
    expect(serverPackageJson.scripts?.['guard:architecture-boundaries']).toContain('guard-architecture-boundaries.mjs')
    expect(deployWorkflow).toContain('npm run guard:architecture-boundaries')

    expect(items.get(11)).toContain('C-15 / C-15.1 / C-15.2')
    for (const fragment of ['采纳信号生产者', '学习 job scheduler', 'reward / MAE', '回滚 supersede', '租户隔离门禁']) {
      expect(items.get(11)).toContain(fragment)
    }

    expect(items.get(12)).toContain('v1.5')
    expect(items.get(12)).toContain('production-ready / needs-gating / not-ready')
    expect(items.get(12)).toContain('不得成为主指标、主结论或处置动作来源')
    expect(extractSection(ledgerPlan, '4.7.05 C-13 首批能力判定表')).toContain('进度录入')

    expect(items.get(13)).toContain('事实层')
    expect(items.get(13)).toContain('过去偏差归因')
    expect(items.get(13)).toContain('v1.5 降级策略')
    expect(extractTableRow(ledgerPlan, 'A10-E07')).toContain('runtimeExecutionInferenceService.test.ts')

    expect(items.get(14)).toContain('双环 / 桥 / 横切 / 底座')
    expect(items.get(14)).toContain('4.7.1')
    expect(items.get(14)).toContain('持续门禁')
    expect(items.get(15)).toContain('C-16.2')
    expect(items.get(15)).toContain('route')
    expect(items.get(15)).toContain('service / job')
    expect(items.get(15)).toContain('page surface')
    expect(items.get(15)).toContain('migration table surface')
    expect(serverPackageJson.scripts?.['guard:system-surface-ownership']).toContain('guard-system-surface-ownership.mjs')
    expect(workflowGuard).toContain('server/migrations/*.sql')

    expect(items.get(16)).toContain('C-17.01 至 C-17.49')
    expect(items.get(16)).toContain('needs-gating')
    expect(items.get(17)).toContain('C-18.01 至 C-18.20')
    expect(items.get(17)).toContain('C-18.L01 至 C-18.L15')
    expect(items.get(17)).toContain('2026-06-29')
    expect(items.get(17)).toContain('真实环境 closeout 已通过')
    expect(items.get(17)).toContain('未通过前回退为 `needs-gating`')
    expect(items.get(18)).toContain('C-19')
    expect(items.get(18)).toContain('4.7.2a / 4.7.2b')
    expect(items.get(18)).toContain('runtime publication / release / rollback closeout 已通过')
    expect(items.get(18)).toContain('重新进入 C-19 gate')
    expect(mainPlan).toContain('C-18.L、C-15、C-19 和旧对象 closeout gate 已由 `project-testing/reports/release-20260630-live-closeout-staging` 的 fresh staging evidence 关闭')

    expect(items.get(19)).toContain('MG-01 至 MG-07')
    for (const fragment of ['2026-06-28', 'pending migration', 'orphan ledger row', 'blocking drift', '新增 Advisor/public catalog']) {
      expect(items.get(19)).toContain(fragment)
    }
    expect(ledgerPlan).toContain('production-migration-governance')
    expect(ledgerPlan).toContain('status=closed')
    expect(ledgerPlan).toContain('246 / 247 / 248')
    expect(serverPackageJson.scripts?.['migrate:production-governance']).toContain('check-production-migration-governance.ts')
    expect(rootPackageJson.scripts?.['verify:v14231-non-live-closeout']).toBe('npm run verify:v14231-non-live-closeout --workspace=server')
    expect(deployWorkflow).toContain('npm run verify:v14231-non-live-closeout')
  })

  it('summarizes the current C-17/C-18/C-18.L commercialization defect status without claiming full commercial readiness', () => {
    const plan = readPlan()
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')

    expect(plan).toContain('C-17 / C-18 / C-18.L 商业化缺陷与验收尾项边界快照')
    expect(ledgerPlan).toContain('C-17 / C-18 / C-18.L 商业化缺陷与验收尾项状态快照')
    expect(extractTableRow(plan, 'C-17 原始缺陷')).toContain('已纳入 §4.11')
    expect(extractTableRow(plan, 'C-17 原始缺陷')).toContain('不能因已登记 / 已归档就把相关能力整体升为 `production-ready`')
    expect(extractTableRow(plan, 'C-18 新增缺陷')).toContain('non-live 静态确认项已由 A 台账承接为已关闭或持续门禁索引')
    expect(extractTableRow(plan, 'C-18 新增缺陷')).toContain('2026-06-30 staging fresh evidence 已补齐 C-18.L07-L15')
    expect(extractTableRow(plan, 'C-18 新增缺陷')).toContain('后续换库、换环境、改 schema、改诊断脚本或新增能力时继续按 C-18.L 重新门禁')
    expect(extractTableRow(plan, 'C-18.L live-only 验收项')).toContain('本轮商业化验收尾项不再作为当前 blocker')
    expect(extractTableRow(plan, 'C-18.L live-only 验收项')).toContain('未来新增 live surface 或证据过期时必须重跑')
    expect(ledgerPlan).toContain('C-17 49/49、C-18 20/20、C-18.L 15 项')
    expect(plan).toContain('227_v14231_force_core_rls_and_project_policies.sql')
    expect(plan).toContain('228_v14231_runtime_database_role.sql')
    expect(plan).toContain('workbuddy_runtime_login')
    expect(plan).toContain('currentRoleBypass.status=pass')
    expect(plan).toContain('C-18.L06 已完成当前 live canary 并发写探针')
    expect(plan).toContain('C-18.L13 已用 disposable 1001 快照 live 探针证明 Supabase max-rows / >1000 快照趋势分页在当前连接通过')
    expect(plan).toContain('C-18.L01-L15 的本轮 closeout 通过结论以 `project-testing/reports/release-20260630-live-closeout-staging`')
    expect(plan).toContain('fresh evidence validation 和 `closeout-decision.fresh.json` 为准')
    expect(plan).toContain('c18-live-evidence-summary.json')
    expect(plan).toContain('closeout-decision.fresh.json')
    expect(plan).toContain('missingArchivedJson=false')
    expect(plan).toContain('C-18.L05 的本地静态守卫已进入 deploy CI')
    expect(plan).toContain('non-live 静态修复 / 本地门禁已按 A 台账收口或转持续门禁')
    expect(plan).toContain('不得把当前证据外推为未来任意部署天然全绿')
    expect(extractTableRow(ledgerPlan, 'C-17')).toContain('当前 49/49 均已纳入')
    expect(extractTableRow(ledgerPlan, 'C-17')).toContain('P0 已收口 / 持续门禁')
    expect(extractTableRow(ledgerPlan, 'C-18')).toContain('non-live 已收口 + C-18.L live closeout 已归档 / 持续门禁')
    expect(extractTableRow(ledgerPlan, 'C-18')).toContain('P0 已收口 / 持续门禁')
  })

  it('keeps C-18.L01-L04 aligned with the current live RLS/proacl and anon PoC evidence', () => {
    const plan = readPlan()
    const l01 = extractTableRow(plan, 'C-18.L01')
    const l02 = extractTableRow(plan, 'C-18.L02')
    const l03 = extractTableRow(plan, 'C-18.L03')
    const l04 = extractTableRow(plan, 'C-18.L04')

    expect(l01).toContain('diagnose:rls-proacl-live')
    expect(l01).toContain('--output-file')
    expect(l01).toContain('publicRls.status=pass')
    expect(l01).toContain('missingArchivedJson=false')
    expect(l01).toContain('forceMissingTables=[]')
    expect(l02).toContain('tablesWithoutPolicies=[]')
    expect(l02).toContain('tablesWithoutTenantPredicate=[]')
    expect(l03).toContain('currentRole=postgres')
    expect(l03).toContain('bypassRole=postgres')
    expect(l03).toContain('currentRole=workbuddy_runtime_login')
    expect(l03).toContain('bypassRole=null')
    expect(l03).toContain('currentRoleBypass.status=pass')
    expect(l03).toContain('C-18.L03 可按当前 live 连接关闭')
    expect(l04).toContain('functionCount=0')
    expect(l04).toContain('diagnose:execute-sql-anon-poc-live')
    expect(l04).toContain('--output-file')
    expect(l04).toContain('PGRST202')
    expect(l04).toContain('dataReturned=false')
    expect(l04).toContain('missingArchivedJson=false')
    expect(l04).toContain('当前 C-18.L04 可关闭')
  })

  it('keeps C-18.L06 aligned with the disposable canary concurrent approval live probe', () => {
    const row = extractTableRow(readPlan(), 'C-18.L06')

    expect(row).toContain('guarded update')
    expect(row).toContain('active canary / published 唯一索引')
    expect(row).toContain('diagnose:duration-canary-approval-live')
    expect(row).toContain('c18_l06_duration_canary_approval_live_diagnostic')
    expect(row).toContain('--allow-write --candidate-id=')
    expect(row).toContain('--allow-write --create-disposable-candidate')
    expect(row).toContain('关闭 C-18.L06 必须使用 `--create-disposable-candidate`')
    expect(row).toContain('--output-file')
    expect(row).toContain('缺 `--output-file` 时写入前 blocked')
    expect(row).toContain('missingArchivedJson=false')
    expect(row).toContain('createdDisposableCandidate=true')
    expect(row).toContain('successCount=1')
    expect(row).toContain('guardedFailureCount=1')
    expect(row).toContain('unexpectedFailureCount=0')
    expect(row).toContain('disposableCandidateCleanup.status=pass')
    expect(row).toContain('C-18.L06 可按当前 live 连接关闭')
    expect(row).not.toContain('未归档 live JSON 前不得关闭 C-18.L06')
  })

  it('keeps C-18.L13 aligned with the current disposable >1000 snapshot live probe', () => {
    const row = extractTableRow(readPlan(), 'C-18.L13')

    expect(row).toContain('diagnose:health-trend-live')
    expect(row).toContain('c18_l13_supabase_max_rows_snapshot_trend_diagnostic')
    expect(row).toContain('UTC 月边界')
    expect(row).toContain('--allow-write --create-disposable-snapshots')
    expect(row).toContain('--output-file')
    expect(row).toContain('status=pass')
    expect(row).toContain('missingArchivedJson=false')
    expect(row).toContain('createdRows=1001')
    expect(row).toContain('projectIdFilterApplied=false')
    expect(row).toContain('maxRowsObserved=1000')
    expect(row).toContain('maxRowsReported=1197')
    expect(row).toContain('trendRows=1197')
    expect(row).toContain('rangeCalls=2')
    expect(row).toContain('cleanupStatus=pass')
    expect(row).toContain('deletedSnapshotRows=1001')
    expect(row).toContain('deletedProjects=1001')
    expect(row).toContain('deletedCompanies=1')
    expect(row).toContain('C-18.L13 可按当前 live 环境关闭')
    expect(row).toContain('后续换库 / 换 env / 改 schema / 改摘要查询必须带 `--output-file` 重跑')
    expect(row).toContain('缺主诊断 JSON 会 fail')
    expect(row).not.toContain('observedRows=196')
    expect(row).not.toContain('reportedCount=196')
    expect(row).not.toContain('没有 pass JSON 前不得关闭 C-18.L13')
  })

  it('keeps C-18.L05 tied to the deploy CI executeSQL guard instead of a document-only claim', () => {
    const workspaceRoot = findWorkspaceRoot()
    const plan = readPlan()
    const packageJson = readServerPackageJson()
    const deployWorkflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const row = extractTableRow(plan, 'C-18.L05')

    expect(packageJson.scripts?.['guard:execute-sql']).toBe('node scripts/run-vitest-guard.mjs src/__tests__/executeSqlGuard.test.ts')
    expect(deployWorkflow).toContain('Server executeSQL guard')
    expect(deployWorkflow).toContain('npm run guard:execute-sql')
    expect(row).toContain('guard:execute-sql')
    expect(row).toContain('.github/workflows/deploy.yml')
    expect(row).toContain('deploy CI')
    expect(row).toContain('当前剩余 0 个存量审计快照')
  })

  it('keeps Advisor public RLS and task obstacle schema drift wording aligned with current local closeout evidence', () => {
    const mainPlan = readPlanByName('v1.4.23.1体系收口台账与验收门禁矩阵.md')
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')
    const workspaceRoot = findWorkspaceRoot()
    const advisorMigration = readFileSync(resolve(workspaceRoot, 'server', 'migrations', '246_v14231_advisor_public_rls_closeout.sql'), 'utf8')
    const cleanMigration = readFileSync(resolve(workspaceRoot, 'server', 'migrations', 'CLEAN_MIGRATION_V4.sql'), 'utf8')
    const durationContextService = readFileSync(resolve(workspaceRoot, 'server', 'src', 'services', 'durationContextService.ts'), 'utf8')
    const durationContextServiceTest = readFileSync(resolve(workspaceRoot, 'server', 'src', '__tests__', 'durationContextService.test.ts'), 'utf8')
    const taskObstaclesRoute = readFileSync(resolve(workspaceRoot, 'server', 'src', 'routes', 'task-obstacles.ts'), 'utf8')
    const dashboardRoute = readFileSync(resolve(workspaceRoot, 'server', 'src', 'routes', 'dashboard.ts'), 'utf8')

    for (const table of [
      'project_key_node_snapshots',
      'task_constraint_snapshots',
      'data_lineage_entity_types',
      'data_lineage_relation_rules',
    ]) {
      expect(advisorMigration).toContain(`ALTER TABLE IF EXISTS public.${table} FORCE ROW LEVEL SECURITY`)
      expect(cleanMigration).toContain(`ALTER TABLE IF EXISTS public.${table} FORCE ROW LEVEL SECURITY`)
      expect(mainPlan).toContain(table)
      expect(ledgerPlan).toContain(table)
    }
    expect(cleanMigration).toContain('Source: 246_v14231_advisor_public_rls_closeout.sql')

    for (const plan of [mainPlan, ledgerPlan]) {
      expect(plan).toContain('246_v14231_advisor_public_rls_closeout.sql')
      expect(plan).toContain('CLEAN_MIGRATION_V4.sql')
      expect(plan).toContain('2026-06-28')
      expect(plan).toContain('MG-01')
      expect(plan).toContain('MG-07')
      expect(plan).toContain('246')
      expect(plan).toContain('247')
      expect(plan).toContain('248')
      expect(plan).toContain('status=closed')
      expect(plan).toContain('needs-gating')
      expect(plan).toContain('estimated_resolve_date')
      expect(plan).toContain('expected_resolution_date')
      expect(plan).not.toContain('后续必须补专门的 Advisor public RLS closeout 迁移')
      expect(plan).not.toContain('forward migration 已应用')
    }
    expect(mainPlan).toContain('生产迁移治理 closeout 覆写')
    expect(ledgerPlan).toContain('本地代码兼容和防继续报错')
    expect(ledgerPlan).toContain('blockingDrift=[]')

    expect(durationContextService).toContain("estimated_resolve_date")
    expect(durationContextService).not.toContain(".select('id, status, obstacle_type, blocking_level, impact_level, progress_impact_level, severity, expected_resolution_date")
    expect(durationContextServiceTest).toContain('does not select the retired task_obstacles expected_resolution_date column from Supabase')
    expect(durationContextServiceTest).toContain("expect(selectClause).not.toContain('expected_resolution_date')")
    expect(taskObstaclesRoute).toContain('TASK_OBSTACLE_SELECT_COLUMNS')
    expect(taskObstaclesRoute).not.toContain('SELECT * FROM task_obstacles')
    expect(dashboardRoute).toContain('DASHBOARD_TASK_OBSTACLE_SELECT_COLUMNS')
    expect(dashboardRoute).not.toContain('SELECT * FROM public.task_obstacles')
  })

  it('marks stale historical blockers as superseded by current evidence in both ledgers', () => {
    const mainPlan = readPlanByName('v1.4.23.1体系收口台账与验收门禁矩阵.md')
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')

    expect(mainPlan).toContain('当前不再按“分部级从零建”理解')
    expect(mainPlan).toContain('分部级 non-live 候选 / 评审链已补')
    expect(mainPlan).toContain('2026-06-30 staging closeout fresh verification 口径覆写')
    expect(mainPlan).toContain('C-19 runtime publication / release / rollback')
    expect(mainPlan).toContain('C-18.L、C-15、C-19 和旧对象 closeout gate 已由 `project-testing/reports/release-20260630-live-closeout-staging` 的 fresh staging evidence 关闭')
    expect(mainPlan).toContain('历史验证备注：上述“当前受另一路施工组织测试夹具阻断”和“当前只剩另一路 `scheduleAccelerationService.test.ts` 施工组织测试夹具”只描述 2026-06-22 当轮局部 typecheck 环境')
    expect(mainPlan).toContain('当前主台账的有效结论以 2026-06-27 A10 / C-19 current evidence 为准')
    expect(mainPlan).toContain('C-19.07 / C-19.15 的 non-live read-model、诊断入口、候选事件桥和装配门禁已进入本地契约 / 守卫收口')
    expect(mainPlan).toContain('历史推进记录总括：以下 C-18.L05 段落保留 2026-06-20 至 2026-06-21 的逐点迁移过程')
    expect(mainPlan).toContain('其中“C-18.L05 仍未完成 / 仍保持 needs-gating / 剩余 N 个 direct rawQuery”均是当轮递减状态')
    expect(mainPlan).toContain('存量 `executeSQL` 与 direct `rawQuery` 动态 SQL 债为 0')
    expect(mainPlan).toContain('历史推进记录：上方 C-18.L05 递减日志中的“仍未完成 / 剩余 N 个”只描述 2026-06-20 当轮收缩过程')
    expect(mainPlan).toContain('历史推进记录：本组 direct rawQuery “剩余 14/13/12/11/10/9/8/7/6 个”是当轮递减过程')
    expect(mainPlan).toContain('历史推进记录：本组“剩余 4/3/2/1 个”同样只是 2026-06-21 闭合前的递减日志')

    expect(ledgerPlan).toContain('历史验证备注：上述“当前受另一路施工组织测试夹具阻断”仅指 2026-06-22 当轮运行环境')
    expect(ledgerPlan).toContain('上述“当前只剩另一路”同样只描述当轮局部 typecheck 环境')
    expect(ledgerPlan).toContain('历史验证备注：上述 projectWizard logger typecheck 阻断仅指该轮全量 `tsc` 环境')
    expect(ledgerPlan).toContain('历史推进记录：本段保留 2026-06-20 早期 C-18.L05 缺口推进过程')
    expect(ledgerPlan).toContain('当前 C-18.L05 存量 `executeSQL` / direct `rawQuery` 动态 SQL 债为 0')
    expect(ledgerPlan).toContain('本地静态清零不替代 live / PoC 边界')
    expect(ledgerPlan).toContain('上两段中的“C-18.L05 仍未完成 / 剩余 N 个 direct rawQuery 快照”只描述当轮收缩进度')
    expect(ledgerPlan).toContain('本组“剩余 9/8/7/6 个 service 级 direct rawQuery 快照”是 2026-06-20 当轮递减日志')

    const staleBlockerMentions = [
      '当前受另一路施工组织测试夹具阻断',
      '当前只剩另一路 `scheduleAccelerationService.test.ts` 施工组织测试夹具',
      '当前全量 `npx.cmd tsc -p server/tsconfig.json --noEmit --pretty false` 被非本轮目标文件',
      'C-18.L05 未完成前，相关能力只能按 `needs-gating` 消费',
    ]
    for (const mention of staleBlockerMentions) {
      expect(ledgerPlan).toContain(mention)
    }
    expect(extractTableRow(ledgerPlan, 'C-18.L05')).toContain('当前剩余 0 个存量审计快照')
  })

  it('keeps remaining live and pressure gates explicit for L07-L15', () => {
    const plan = readPlan()

    expect(extractTableRow(plan, 'C-18.L07')).toContain('finalProjectionEvidenceRequired=true')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('finalProjectionReadback')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('networkLineagePresent=true')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('projectedFloatTaskCount>0')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('routeResponseProjectIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('projectIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('final_snapshot_project_id_mismatch')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('liveEvidenceChecklist')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('runtimeEvidenceGap')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('--output-file')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('缺 `--output-file`')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('--lock-telemetry-file')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('--diagnostic-run-id')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('lockTelemetryAssessment')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('diagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('environment')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('evidenceRef')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('missingEvidenceMetadata=false')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('diagnosticRunIdMatch=true')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('diagnosticRunIdMatchesReport=true')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('expectedDiagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('lockScopeMatch=true')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('eventSequenceValid=true')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('coherentDiagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('coherentLockScope')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('normalReleasePairCount>0')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('errorReleasePairCount>0')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('waitEvidenceCount>0')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('diagnostic_run_id_match / diagnostic_run_id / lock_scope_match / lock_event_sequence')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('missingLockTelemetryEvidence')
    expect(extractTableRow(plan, 'C-18.L07')).toContain('missingLockTelemetryEvidence=false')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('ACCEPTANCE_STATUS_CONFLICT')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('finalPlanReadback')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('planStatus')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('expectedProjectId')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('final_plan_project_id_mismatch')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('--output-file')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('缺 `--output-file`')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('写入前 blocked')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('--create-disposable-plan')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('--project-id')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('createdDisposablePlan=true')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('disposablePlanCleanup.status=pass')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('deletionReadback.status=pass')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('planStillReadable=false')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('createdProjectIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('created_project_id_match')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('--disposable-plan-evidence-file')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('disposablePlanEvidenceAssessment')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('missingDisposablePlanEvidence')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('missingDisposablePlanEvidence=false')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('createdForDiagnostic=C-18.L08')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('environment')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('evidenceRef')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('missingEvidenceMetadata=false')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('diagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('--diagnostic-run-id')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('diagnosticRunIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('routeInvocationId')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('requestId')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('requestCorrelationPresent=true')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('diagnostic_run_id / route_correlation')
    expect(extractTableRow(plan, 'C-18.L08')).not.toContain('或未声明')
    expect(extractTableRow(plan, 'L08')).toContain('createdForDiagnostic=C-18.L08')
    expect(extractTableRow(plan, 'L08')).not.toContain('或未声明')
    expect(extractTableRow(plan, 'C-18.L08')).toContain('missingArchivedJson')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('failureInjectionEvidenceRequired=true')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('failureInjectionEvidenceChecklist')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('runtimeEvidenceGap')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('--output-file')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('缺 `--output-file`')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('写入前 blocked')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('--create-disposable-draft')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('createdDisposableDraft=true')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('disposableProjectCleanup.status=pass')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('missingDisposableDraftCleanup=false')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('--failure-injection-evidence-file')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('--create-failure-injection-evidence')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('WORKBUDDY_ENABLE_WIZARD_DIAGNOSTIC_FAILURE_INJECTION=true')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('failureInjectionEvidenceAssessment')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('runs[]')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('perStageRunCount=3')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('diagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('--diagnostic-run-id')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('diagnosticRunIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('requestId')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('routeInvocationId')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('perStageRunCorrelationPresent=true')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('diagnostic_run_id / per_stage_run_correlation')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('per_stage_failure_runs')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('cleanupBatchIdEvidencePresent=true')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('cleanupBatchIdsConsistent=true')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('cleanup_batch_id_evidence')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('environment')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('evidenceRef')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('missingEvidenceMetadata=false')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('artifactInventoryReadback')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('artifactInventoryReadback.projectId')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('projectId` 匹配')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('successResponseProjectIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('wizardGenerationState=completed')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('duplicateGeneratedTaskSignatureCount=0')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('missingFailureInjectionRun')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('missingFailureInjectionRun=false')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('missingCleanupReadback')
    expect(extractTableRow(plan, 'C-18.L09')).toContain('missingCleanupReadback=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('preflightStage=scope_cardinality')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('--output-file')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('缺 `--output-file`')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingArchivedJson=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('--route-evidence-file')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('--diagnostic-run-id')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('--require-live-evidence')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('routeEvidenceAssessment')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('environment')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('evidenceRef')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('diagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('expectedDiagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('diagnosticRunIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingEvidenceMetadata=false')
    expect(plan).toContain('nonLiveEvidenceMetadata')
    expect(plan).toContain('sample / synthetic / local')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('routeInvocationId')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('requestId')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingMemoryObservation=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingConnectionPoolObservation=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingTimeoutBudgetEvidence=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingUserVisibleFuseResponse=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingRowLimitConfigurationEvidence=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingTimingSanityEvidence=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingRouteCorrelationEvidence=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('p95Ms>=0')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('elapsedBudgetMs>0')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('missingScopeCardinalityEvidence=false')
    expect(extractTableRow(plan, 'C-18.L10')).toContain('buildingCount=200 / floorCount=200')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('externalDbQueryLogRequired=true')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('--output-file')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('--db-query-log-file')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('dbQueryLogAssessment')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('dbQueryLogAssessment.status=pass')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('notificationWriteCount')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('minNotificationWrites=1')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('notification_write_evidence')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('internalRecipientTelemetryAssessment')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('internalRecipientTelemetryAssessment.status=pass')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('internalRecipientTelemetryCaptured=true')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('cacheKeyEvidenceValid=true')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('非空 cache key')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('diagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('--diagnostic-run-id')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('diagnosticRunIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('diagnosticRunIdEvidenceValid=true')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('diagnostic_run_id / recipient_diagnostic_run_id')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('environment')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('evidenceRef')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('missingEvidenceMetadata=false')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('missingArchivedJson=false')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('缺文件、超预算')
    expect(extractTableRow(plan, 'C-18.L11')).toContain('缺通知写入证据都会 fail')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('c18_l12_critical_path_synthetic_pressure')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('--output-file')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('缺 `--output-file`')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('missingArchivedJson=false')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('--db-evidence-file')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('--diagnostic-run-id')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('--require-live-evidence')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('dbEvidenceAssessment')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('environment')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('evidenceRef')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('diagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('expectedDiagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('diagnosticRunIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('missingEvidenceMetadata=false')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('refreshRequestId')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('readbackRequestId')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('dbWriteTraceId')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('missingPersistedNetworkData=false')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('missingConcurrentSweepAndRouteRun=false')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('missingDbWriteTiming=false')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('missingConnectionPoolEvidence=false')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('missingFinalProjectionReadback=false')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('missingDiagnosticRunCorrelationEvidence=false')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('dbWriteP95Ms>=0')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('dbWriteBudgetMs>0')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('finalProjectionReadbackProjectId=projectId')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('finalProjectedFloatTaskCount<=persistedTaskCount')
    expect(extractTableRow(plan, 'C-18.L12')).toContain('finalCriticalTaskCount<=persistedTaskCount')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('真实 p50 / p95 / p99')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('--output-file')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('缺 `--output-file`')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('missingArchivedJson=false')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('--route-evidence-file')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('--diagnostic-run-id')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('--require-live-evidence')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('routeEvidenceAssessment')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('environment')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('evidenceRef')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('diagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('expectedDiagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('diagnosticRunIdMatches=true')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('missingEvidenceMetadata=false')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('routeInvocationId')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('requestId')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('p50Ms<=p95Ms<=p99Ms')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('missingLatencyPercentileOrder=false')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('missingTimingSanityEvidence=false')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('p50Ms>=0 / p95Ms>=0 / p99Ms>=0')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('missingDbQueryLogDetail=false')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('missingCacheHitDetail=false')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('missingResponseShapeEvidence=false')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('missingRouteCorrelationEvidence=false')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('coldRequestQueryCount>warmRequestQueryCount')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('tableNames')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('project_daily_snapshot')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('非空 `cacheKey`')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('coldCacheHit=false / warmCacheHit=true')
    expect(extractTableRow(plan, 'C-18.L14')).toContain('responseShape.projectCount=projectCount')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('migrationReplayEvidenceRequired=true')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('--output-file')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('缺 `--output-file`')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('missingArchivedJson=false')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('--import-pressure-evidence-file')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('--diagnostic-run-id')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('environment')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('evidenceRef')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('diagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('expectedDiagnosticRunId')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('missingEvidenceMetadata=false')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('missingMemoryObservation=false')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('missingCleanupEvidence=false')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('per-attempt')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('requestId')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('routeInvocationId')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('missingDiagnosticCorrelationEvidence=false')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('cleanupTemplateIds')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('覆盖本次 2xx 响应创建的 templateId')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('missingCreatedTemplateEvidence=false')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('missingImportedNodeEvidence=false')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('finite replayRunCount>=2')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('migration replay')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('同一个 `diagnosticRunId`')
    expect(extractTableRow(plan, 'C-18.L15')).toContain('旧导入压力 evidence')
  })
})
