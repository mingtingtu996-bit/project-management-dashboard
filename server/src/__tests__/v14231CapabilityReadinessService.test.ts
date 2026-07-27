import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import express from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import {
  buildV14231ReadinessLedger,
  getV14231CapabilityReadiness,
  getV14231PageConsumptionReadiness,
  listV14231CapabilityReadiness,
  listV14231PageConsumptionReadiness,
  validateV14231ProductionReadyEvidenceBindings,
} from '../services/v14231CapabilityReadinessService.js'

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'user-1', globalRole: 'owner' }
    next()
  }),
}))

function findWorkspaceRoot() {
  const candidates = [process.cwd(), resolve(process.cwd(), '..')]
  const root = candidates.find((candidate) => existsSync(resolve(candidate, 'docs', 'plans')))
  if (!root) {
    throw new Error('Unable to locate workspace docs/plans directory')
  }
  return root
}

function readPlanByName(filename: string): string {
  return readFileSync(resolve(findWorkspaceRoot(), 'docs', 'plans', filename), 'utf8')
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

function normalizeMarkdownCell(value: string): string {
  return value.replace(/\*\*/g, '').replace(/`/g, '').trim()
}

function extractStatusTokens(value: string): string[] {
  const tokens = Array.from(value.matchAll(/`([^`]+)`/g), (match) => match[1])
  return tokens.length ? tokens : [normalizeMarkdownCell(value)]
}

function buildApp(router: express.Router) {
  const app = express()
  app.use(express.json())
  app.use('/api/v14231-readiness', router)
  return app
}

const VALID_GATE_RUNS = [
  { script: 'verify:dashboard', status: 'passed' },
  { script: 'verify:reports', status: 'passed' },
  { script: 'verify:company-cockpit', status: 'passed' },
  { script: 'verify:planning-deviation', status: 'passed' },
  { script: 'verify:responsibility', status: 'passed' },
  { script: 'verify:scope-modeling', status: 'passed' },
  { script: 'verify:join-project', status: 'passed' },
  { script: 'verify:wbs-templates', status: 'passed' },
  { script: 'verify:planning-baseline', status: 'passed' },
  { script: 'verify:gantt', status: 'passed' },
  { script: 'verify:task-summary', status: 'passed' },
  { script: 'verify:planning-monthly', status: 'passed' },
] as const
const VALID_GATE_SUITES = [{
  suiteKey: 'test-suite',
  manifestPath: 'test-suite/suite-manifest.json',
  status: 'passed',
  runCount: VALID_GATE_RUNS.length,
}] as const

function gateArtifactDigest(
  suites: Array<Record<string, unknown>> = [...VALID_GATE_SUITES],
  runs: Array<Record<string, unknown>> = VALID_GATE_RUNS.map((run) => ({ ...run, suiteKey: 'test-suite' })),
) {
  const canonicalInput = JSON.stringify({
    suites: [...suites].sort((left, right) => String(left.suiteKey).localeCompare(String(right.suiteKey))),
    runs: [...runs].sort((left, right) => String(left.script).localeCompare(String(right.script))),
  })
  return `sha256:${createHash('sha256').update(canonicalInput).digest('hex')}`
}

const VALID_GATE_CONTEXT = {
  expectedReleaseDigest: 'git:release-123',
  expectedTargetEnvironment: 'staging',
  now: new Date('2026-07-12T00:05:00.000Z'),
  maxAgeMs: 60 * 60 * 1000,
  evidence: {
    schemaVersion: 'workbuddy-v14231-readiness-gate/v1',
    status: 'passed',
    generatedAt: '2026-07-12T00:00:00.000Z',
    releaseDigest: 'git:release-123',
    artifactDigest: gateArtifactDigest(),
    targetEnvironment: 'staging',
    expectedSuiteCount: 1,
    suiteCount: 1,
    suites: VALID_GATE_SUITES,
    runs: VALID_GATE_RUNS.map((run) => ({ ...run, suiteKey: 'test-suite' })),
    blockers: [],
  },
} as const

describe('v1.4.23.1-A C-13 capability readiness service', () => {
  it('mirrors the C-13 capability table names and statuses from the A ledger', () => {
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')
    const capabilityRows = parseMarkdownTable(extractSection(ledgerPlan, '4.7.05 C-13 首批能力判定表'))
    const capabilities = listV14231CapabilityReadiness(VALID_GATE_CONTEXT)

    expect(capabilities.map((item) => item.name)).toEqual(
      capabilityRows.map((row) => normalizeMarkdownCell(row['v1.5 首批能力'])),
    )
    expect(capabilities).toHaveLength(10)
    capabilities.forEach((item, index) => {
      expect(extractStatusTokens(capabilityRows[index]['当前判定'])).toContain(item.status)
      expect(item.sourcePlan).toBe('v1.4.23.1-A')
      expect(item.sourceSection).toBe('4.7.05')
      expect(item.sourceRowRef).toBe(`4.7.05#${index + 1}`)
      expect(item.browserVerificationScripts.length).toBeGreaterThan(0)
    })
  })

  it('mirrors the v1.5 page degradation table names and statuses from the A ledger', () => {
    const ledgerPlan = readPlanByName('v1.4.23.1-A体系收口台账与验收门禁矩阵.md')
    const pageRows = parseMarkdownTable(extractSection(ledgerPlan, '4.7.06 v1.5 页面级消费降级映射'))
    const pages = listV14231PageConsumptionReadiness(VALID_GATE_CONTEXT)

    expect(pages.map((item) => item.page)).toEqual(
      pageRows.map((row) => normalizeMarkdownCell(row['v1.5 页面 / 入口'])),
    )
    expect(pages).toHaveLength(8)
    pages.forEach((item, index) => {
      expect(extractStatusTokens(pageRows[index]['当前状态'])).toContain(item.status)
      expect(item.sourcePlan).toBe('v1.4.23.1-A')
      expect(item.sourceSection).toBe('4.7.06')
      expect(item.sourceRowRef).toBe(`4.7.06#${index + 1}`)
      expect(item.browserVerificationScripts.length).toBeGreaterThan(0)
    })
  })

  it('keeps unregistered capabilities and pages fail-closed as not-ready', () => {
    const capability = getV14231CapabilityReadiness('future-ai-board')
    const page = getV14231PageConsumptionReadiness('Future Board')

    expect(capability).toMatchObject({
      status: 'not-ready',
      canUseAsPrimaryMetric: false,
      canUseAsPrimaryConclusion: false,
      canUseAsStableAction: false,
      requiresDisplayOnlyDegradation: true,
      sourceRowRef: 'unregistered-default',
      browserVerificationScripts: [],
    })
    expect(page).toMatchObject({
      status: 'not-ready',
      canUseAsPrimaryMetric: false,
      canUseAsPrimaryConclusion: false,
      canUseAsStableAction: false,
      requiresDisplayOnlyDegradation: true,
      sourceRowRef: 'unregistered-default',
      browserVerificationScripts: [],
    })
  })

  it('reports missing release evidence without overriding runtime consumption status', () => {
    const ledger = buildV14231ReadinessLedger()

    const releaseCandidates = [...ledger.capabilities, ...ledger.pages]
      .filter((item) => item.declaredStatus === 'production-ready')

    expect(ledger.capabilities.filter((item) => item.status === 'production-ready')).toHaveLength(10)
    expect(ledger.pages.filter((item) => item.status === 'production-ready')).toHaveLength(5)
    expect(releaseCandidates.every((item) => item.releaseReadinessStatus === 'needs-gating')).toBe(true)
    expect(releaseCandidates.every((item) => item.evidenceGate.verified === false)).toBe(true)
    expect(ledger.evidenceGate).toMatchObject({
      status: 'missing',
      verified: false,
      reasons: ['readiness_gate_evidence_missing'],
    })
  })

  it('keeps cold-start runtime consumption enabled while release evidence remains gated', () => {
    const ledger = buildV14231ReadinessLedger()
    const runtimeReady = ledger.capabilities.find((item) => item.declaredStatus === 'production-ready')

    expect(runtimeReady).toMatchObject({
      status: 'production-ready',
      releaseReadinessStatus: 'needs-gating',
      evidenceGate: {
        required: true,
        verified: false,
        reasons: ['readiness_gate_evidence_missing'],
      },
      canUseAsPrimaryMetric: true,
      canUseAsPrimaryConclusion: true,
      canUseAsStableAction: true,
      requiresDisplayOnlyDegradation: false,
    })
  })

  it('only grants primary metric/conclusion/action consumption to rows proven by the current release gate', () => {
    const ledger = buildV14231ReadinessLedger(VALID_GATE_CONTEXT)
    const productionReadyCapabilities = ledger.capabilities.filter((item) => item.status === 'production-ready')
    const gatedCapabilities = ledger.capabilities.filter((item) => item.status !== 'production-ready')

    expect(productionReadyCapabilities.map((item) => item.name)).toEqual([
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
    ])
    for (const item of productionReadyCapabilities) {
      expect(item).toEqual(expect.objectContaining({
        canUseAsPrimaryMetric: true,
        canUseAsPrimaryConclusion: true,
        canUseAsStableAction: true,
        requiresDisplayOnlyDegradation: false,
      }))
    }
    for (const item of gatedCapabilities) {
      expect(item.canUseAsPrimaryMetric).toBe(false)
      expect(item.canUseAsPrimaryConclusion).toBe(false)
      expect(item.canUseAsStableAction).toBe(false)
      expect(item.requiresDisplayOnlyDegradation).toBe(true)
    }
  })

  it('promotes the closed BI and forecasting pages only for a verified current release', () => {
    const ledger = buildV14231ReadinessLedger(VALID_GATE_CONTEXT)
    const pagesByKey = new Map(ledger.pages.map((item) => [item.key, item]))

    for (const key of ['dashboard-项目总览', 'reports', 'company-cockpit']) {
      expect(pagesByKey.get(key), key).toEqual(expect.objectContaining({
        status: 'production-ready',
        canUseAsPrimaryMetric: true,
        canUseAsPrimaryConclusion: true,
        requiresDisplayOnlyDegradation: false,
        evidenceGate: {
          required: true,
          verified: true,
          reasons: [],
        },
      }))
    }

    expect(pagesByKey.get('规则资产-治理工作台')?.status).toBe('needs-gating')
    expect(pagesByKey.get('duration-accuracy-admin-工期准度后台')?.status).toBe('needs-gating')
    expect(pagesByKey.get('workspace-待办')?.status).toBe('needs-gating')
  })

  it.each([
    {
      name: 'stale evidence',
      context: {
        ...VALID_GATE_CONTEXT,
        now: new Date('2026-07-12T03:00:00.000Z'),
      },
      reason: 'readiness_gate_evidence_stale',
    },
    {
      name: 'wrong deployment target',
      context: {
        ...VALID_GATE_CONTEXT,
        expectedTargetEnvironment: 'production',
      },
      reason: 'readiness_gate_target_mismatch',
    },
    {
      name: 'wrong release digest',
      context: {
        ...VALID_GATE_CONTEXT,
        expectedReleaseDigest: 'git:other-release',
      },
      reason: 'readiness_gate_release_digest_mismatch',
    },
    {
      name: 'failed browser gate',
      context: {
        ...VALID_GATE_CONTEXT,
        evidence: {
          ...VALID_GATE_CONTEXT.evidence,
          status: 'failed',
          runs: VALID_GATE_CONTEXT.evidence.runs.map((run) => (
            run.script === 'verify:gantt' ? { ...run, status: 'failed' as const } : run
          )),
        },
      },
      reason: 'readiness_gate_status_not_passed',
    },
    {
      name: 'tampered artifact digest',
      context: {
        ...VALID_GATE_CONTEXT,
        evidence: {
          ...VALID_GATE_CONTEXT.evidence,
          artifactDigest: `sha256:${'0'.repeat(64)}`,
        },
      },
      reason: 'readiness_gate_artifact_digest_mismatch',
    },
  ])('gates release readiness without disabling runtime rows for $name', ({ context, reason }) => {
    const ledger = buildV14231ReadinessLedger(context)
    const releaseCandidates = [...ledger.capabilities, ...ledger.pages]
      .filter((item) => item.declaredStatus === 'production-ready')

    expect(ledger.capabilities.filter((item) => item.status === 'production-ready')).toHaveLength(10)
    expect(ledger.pages.filter((item) => item.status === 'production-ready')).toHaveLength(5)
    expect(releaseCandidates.every((item) => item.releaseReadinessStatus === 'needs-gating')).toBe(true)
    expect(releaseCandidates.every((item) => item.evidenceGate.verified === false)).toBe(true)
    expect(ledger.evidenceGate.verified).toBe(false)
    expect(ledger.evidenceGate.reasons).toContain(reason)
  })

  it('downgrades a row when its required browser script is absent from otherwise valid evidence', () => {
    const runs = VALID_GATE_CONTEXT.evidence.runs.filter((run) => run.script !== 'verify:planning-monthly')
    const suites = [{ ...VALID_GATE_SUITES[0], runCount: runs.length }]
    const context = {
      ...VALID_GATE_CONTEXT,
      evidence: {
        ...VALID_GATE_CONTEXT.evidence,
        artifactDigest: gateArtifactDigest(suites, runs),
        suites,
        runs,
      },
    }
    const ledger = buildV14231ReadinessLedger(context)
    const taskSummary = ledger.pages.find((item) => item.key === 'task-summary')
    const ganttPlanning = ledger.pages.find((item) => item.key === 'gantt-planning')

    expect(taskSummary?.status).toBe('production-ready')
    expect(taskSummary?.releaseReadinessStatus).toBe('verified')
    expect(ganttPlanning).toMatchObject({
      status: 'production-ready',
      releaseReadinessStatus: 'needs-gating',
      evidenceGate: {
        verified: false,
        reasons: ['browser_verification_not_passed:verify:planning-monthly'],
      },
    })
  })

  it('binds every registered browser verification script to a real package.json command', () => {
    const packageJson = JSON.parse(readFileSync(resolve(findWorkspaceRoot(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const scripts = new Set(Object.keys(packageJson.scripts ?? {}))
    const readinessScripts = [
      ...listV14231CapabilityReadiness(VALID_GATE_CONTEXT).flatMap((item) => item.browserVerificationScripts),
      ...listV14231PageConsumptionReadiness(VALID_GATE_CONTEXT).flatMap((item) => item.browserVerificationScripts),
    ]

    expect(readinessScripts.length).toBeGreaterThan(0)
    for (const script of readinessScripts) {
      expect(scripts.has(script), `missing package.json script: ${script}`).toBe(true)
      const command = packageJson.scripts?.[script] ?? ''
      const nodeScriptMatch = command.match(/^node\s+(scripts\/[^\s]+\.mjs)(?:\s|$)/)
      expect(nodeScriptMatch, `browser verification script must run a node scripts/*.mjs command: ${script}`).not.toBeNull()
      expect(
        existsSync(resolve(findWorkspaceRoot(), nodeScriptMatch?.[1] ?? '')),
        `browser verification target missing for ${script}: ${nodeScriptMatch?.[1]}`,
      ).toBe(true)
    }
  })

  it('keeps key C-13 browser evidence scripts inside the browser suite commands', () => {
    const packageJson = JSON.parse(readFileSync(resolve(findWorkspaceRoot(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const browserSuiteCommands = Object.entries(packageJson.scripts ?? {})
      .filter(([name]) => name.startsWith('verify:browser-suite:'))
      .map(([, command]) => command)
      .join('\n')
    const keyScripts = [
      'verify:dashboard',
      'verify:reports',
      'verify:gantt',
      'verify:task-summary',
      'verify:company-cockpit',
      'verify:notifications',
      'verify:wbs-templates',
      'verify:scope-modeling',
      'verify:monitoring',
    ]

    for (const script of keyScripts) {
      expect(browserSuiteCommands, `${script} missing from browser suite commands`).toContain(script)
    }
  })

  it('requires declared production-ready capabilities and pages to have current-release browser evidence', () => {
    const productionReadyItems = [
      ...listV14231CapabilityReadiness(VALID_GATE_CONTEXT).filter((item) => item.status === 'production-ready'),
      ...listV14231PageConsumptionReadiness(VALID_GATE_CONTEXT).filter((item) => item.status === 'production-ready'),
    ]

    expect(productionReadyItems.length).toBeGreaterThan(0)
    expect(validateV14231ProductionReadyEvidenceBindings(VALID_GATE_CONTEXT)).toEqual([])
    for (const item of productionReadyItems) {
      expect(item.browserVerificationScripts.length, `${item.kind}:${item.key} missing browser verification evidence`).toBeGreaterThan(0)
      expect(item.evidenceGate).toMatchObject({ required: true, verified: true, reasons: [] })
    }
  })

  it('exposes the same readiness ledger through the read-only API route', async () => {
    const { default: router } = await import('../routes/v14231-readiness.js')
    const response = await request(buildApp(router)).get('/api/v14231-readiness')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.sourcePlan).toBe('v1.4.23.1-A')
    expect(response.body.data.defaultUnregisteredStatus).toBe('not-ready')
    expect(response.body.data.capabilities).toHaveLength(10)
    expect(response.body.data.pages).toHaveLength(8)
    expect(response.body.data.evidenceGate).toMatchObject({ status: 'missing', verified: false })
    expect(response.body.data.capabilities.filter((item: { status: string }) => item.status === 'production-ready')).toHaveLength(10)
    expect(response.body.data.capabilities.filter(
      (item: { releaseReadinessStatus: string }) => item.releaseReadinessStatus === 'needs-gating',
    )).toHaveLength(10)
  })

  it('does not load repository evidence files into the runtime readiness API', async () => {
    const previous = {
      evidencePath: process.env.V14231_READINESS_GATE_EVIDENCE,
      releaseSha: process.env.RELEASE_SHA,
      deployTarget: process.env.DEPLOY_TARGET,
    }
    process.env.V14231_READINESS_GATE_EVIDENCE = 'project-testing/reports/v14231-readiness/gate.json'
    process.env.RELEASE_SHA = 'release-123'
    process.env.DEPLOY_TARGET = 'staging'

    try {
      const { default: router } = await import('../routes/v14231-readiness.js')
      const response = await request(buildApp(router)).get('/api/v14231-readiness')

      expect(response.status).toBe(200)
      expect(response.body.data.evidenceGate).toMatchObject({
        status: 'missing',
        verified: false,
      })
      expect(response.body.data.capabilities.filter((item: { status: string }) => item.status === 'production-ready')).toHaveLength(10)
      expect(response.body.data.pages.filter((item: { status: string }) => item.status === 'production-ready')).toHaveLength(5)
    } finally {
      if (previous.evidencePath === undefined) delete process.env.V14231_READINESS_GATE_EVIDENCE
      else process.env.V14231_READINESS_GATE_EVIDENCE = previous.evidencePath
      if (previous.releaseSha === undefined) delete process.env.RELEASE_SHA
      else process.env.RELEASE_SHA = previous.releaseSha
      if (previous.deployTarget === undefined) delete process.env.DEPLOY_TARGET
      else process.env.DEPLOY_TARGET = previous.deployTarget
    }
  })

  it('exposes fail-closed capability and page lookups through the read-only API route', async () => {
    const { default: router } = await import('../routes/v14231-readiness.js')
    const app = buildApp(router)

    const capability = await request(app).get('/api/v14231-readiness/capabilities/future-ai-board')
    const page = await request(app).get('/api/v14231-readiness/pages/Future%20Board')

    expect(capability.status).toBe(200)
    expect(capability.body.data.status).toBe('not-ready')
    expect(capability.body.data.canUseAsStableAction).toBe(false)
    expect(page.status).toBe(200)
    expect(page.body.data.status).toBe('not-ready')
    expect(page.body.data.canUseAsPrimaryConclusion).toBe(false)
  })

  it('exposes C-07/C-09/C-12 actionable surface boundaries through the read-only API route', async () => {
    const { default: router } = await import('../routes/v14231-readiness.js')
    const app = buildApp(router)

    const ledger = await request(app).get('/api/v14231-readiness/actionable-surfaces')
    const known = await request(app).get('/api/v14231-readiness/actionable-surfaces/notification_attention_todo')
    const unknown = await request(app).get('/api/v14231-readiness/actionable-surfaces/future_auto_close_action')

    expect(ledger.status).toBe(200)
    expect(ledger.body.data.sourcePlan).toBe('v1.4.23.1-A')
    expect(ledger.body.data.defaultUnregisteredSurfaceStatus).toBe('display-only')
    expect(ledger.body.data.surfaces.map((surface: { key: string }) => surface.key)).toEqual(expect.arrayContaining([
      'notification_attention_todo',
      'warning_issue_closure',
      'retention_delete_operator_action',
      'responsibility_recovery_confirmation',
    ]))

    expect(known.status).toBe(200)
    expect(known.body.data.boundaryPolicy.canUseAsStableAction).toBe(false)
    expect(known.body.data.boundaryPolicy.writesRuntimePublication).toBe(false)

    expect(unknown.status).toBe(200)
    expect(unknown.body.data.status).toBe('display-only')
    expect(unknown.body.data.boundaryPolicy.canUseAsStableAction).toBe(false)
  })
})
