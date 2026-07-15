import { createHash } from 'node:crypto'

import { calendarDaysToMilliseconds } from '../utils/durationDays.js'

export type V14231ReadinessStatus =
  | 'production-ready'
  | 'needs-gating'
  | 'not-ready'
  | 'display-only'

export type V14231ReleaseReadinessStatus =
  | 'verified'
  | 'needs-gating'
  | 'not-applicable'

export type V14231SourcePlan = 'v1.4.23.1-A'

type ConsumptionBoundary = {
  canUseAsPrimaryMetric: boolean
  canUseAsPrimaryConclusion: boolean
  canUseAsStableAction: boolean
  requiresDisplayOnlyDegradation: boolean
}

export type V14231PageAvailability = 'available' | 'unavailable'
export type V14231PageActionReadiness = 'stable' | 'mixed' | 'gated'

type PageConsumptionBoundary = ConsumptionBoundary & {
  pageAvailability: V14231PageAvailability
  actionReadiness: V14231PageActionReadiness
}

export type V14231ReadinessGateRun = {
  script: string
  status: 'passed' | 'failed' | 'skipped' | 'running' | 'unknown'
}

export type V14231ReadinessGateEvidence = {
  schemaVersion: 'workbuddy-v14231-readiness-gate/v1'
  status: 'passed' | 'failed'
  generatedAt: string
  releaseDigest: string
  artifactDigest: string
  targetEnvironment: string
  runs: V14231ReadinessGateRun[]
}

export type V14231ReadinessEvaluationContext = {
  evidence?: unknown
  preflightReasons?: string[]
  expectedReleaseDigest?: string | null
  expectedTargetEnvironment?: string | null
  now?: Date
  maxAgeMs?: number
}

export type V14231ReadinessGateEvaluation = {
  status: 'verified' | 'missing' | 'invalid' | 'stale' | 'mismatch' | 'failed'
  verified: boolean
  reasons: string[]
  generatedAt: string | null
  releaseDigest: string | null
  artifactDigest: string | null
  targetEnvironment: string | null
  passedScripts: string[]
}

type EvidenceBoundReadiness = {
  declaredStatus: V14231ReadinessStatus
  releaseReadinessStatus: V14231ReleaseReadinessStatus
  evidenceGate: {
    required: boolean
    verified: boolean
    reasons: string[]
  }
}

export type V14231CapabilityReadiness = ConsumptionBoundary & EvidenceBoundReadiness & {
  kind: 'capability'
  key: string
  name: string
  status: V14231ReadinessStatus
  currentStatusText: string
  codeEvidence: string
  unlockCondition: string
  consumptionRule: string
  sourcePlan: V14231SourcePlan
  sourceSection: '4.7.05'
  sourceRowRef: string
  browserVerificationScripts: string[]
  browserVerificationPolicy: string
}

export type V14231PageConsumptionReadiness = PageConsumptionBoundary & EvidenceBoundReadiness & {
  kind: 'page'
  key: string
  page: string
  status: V14231ReadinessStatus
  currentStatusText: string
  consumableCapabilities: string
  uiDegradationStrategy: string
  forbiddenActions: string
  sourcePlan: V14231SourcePlan
  sourceSection: '4.7.06'
  sourceRowRef: string
  browserVerificationScripts: string[]
  browserVerificationPolicy: string
}

export type V14231UnknownCapabilityReadiness = ConsumptionBoundary & EvidenceBoundReadiness & {
  kind: 'capability'
  key: string
  name: string
  status: 'not-ready'
  currentStatusText: 'not-ready'
  codeEvidence: string
  unlockCondition: '必须先回填 C-13 判定行、页面降级行、解锁 C 编号和证据索引'
  consumptionRule: '不得作为主指标、主结论、稳定动作或对外承诺的来源'
  sourcePlan: V14231SourcePlan
  sourceSection: '4.7.05'
  sourceRowRef: 'unregistered-default'
  browserVerificationScripts: []
  browserVerificationPolicy: '新增能力必须先补 C-13 行和对应浏览器主链路脚本映射'
}

export type V14231UnknownPageConsumptionReadiness = PageConsumptionBoundary & EvidenceBoundReadiness & {
  kind: 'page'
  key: string
  page: string
  status: 'not-ready'
  currentStatusText: 'not-ready'
  consumableCapabilities: 'none'
  uiDegradationStrategy: '隐藏或只读空态；不得默认消费未登记能力'
  forbiddenActions: '不得作为主指标、主结论、稳定动作或对外承诺的来源'
  sourcePlan: V14231SourcePlan
  sourceSection: '4.7.06'
  sourceRowRef: 'unregistered-default'
  browserVerificationScripts: []
  browserVerificationPolicy: '新增页面必须先补 4.7.06 行和对应浏览器主链路脚本映射'
}

export type V14231ReadinessLedger = {
  sourcePlan: V14231SourcePlan
  sourceSections: ['4.7.05', '4.7.06']
  allowedStatuses: V14231ReadinessStatus[]
  defaultUnregisteredStatus: 'not-ready'
  evidenceGate: V14231ReadinessGateEvaluation
  capabilities: V14231CapabilityReadiness[]
  pages: V14231PageConsumptionReadiness[]
}

export type V14231ProductionReadyEvidenceViolation = {
  kind: 'capability' | 'page'
  key: string
  label: string
  sourceRowRef: string
  reason: string
}

const SOURCE_PLAN: V14231SourcePlan = 'v1.4.23.1-A'
const ALLOWED_STATUSES: V14231ReadinessStatus[] = [
  'production-ready',
  'needs-gating',
  'not-ready',
  'display-only',
]
const DEFAULT_READINESS_GATE_MAX_AGE_MS = calendarDaysToMilliseconds(14)

function toKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/companycockpit/g, 'company-cockpit')
    .replace(/dashboard/g, 'dashboard')
    .replace(/reports/g, 'reports')
    .replace(/tasksummary/g, 'task-summary')
    .replace(/durationaccuracyadmin/g, 'duration-accuracy-admin')
    .replace(/gantt\s*\/\s*planning/g, 'gantt-planning')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function buildBoundary(status: V14231ReadinessStatus): ConsumptionBoundary {
  if (status === 'production-ready') {
    return {
      canUseAsPrimaryMetric: true,
      canUseAsPrimaryConclusion: true,
      canUseAsStableAction: true,
      requiresDisplayOnlyDegradation: false,
    }
  }

  return {
    canUseAsPrimaryMetric: false,
    canUseAsPrimaryConclusion: false,
    canUseAsStableAction: false,
    requiresDisplayOnlyDegradation: true,
  }
}

function buildPageBoundary(status: V14231ReadinessStatus): PageConsumptionBoundary {
  if (status === 'production-ready') {
    return {
      ...buildBoundary(status),
      pageAvailability: 'available',
      actionReadiness: 'stable',
    }
  }

  if (status === 'needs-gating' || status === 'display-only') {
    return {
      canUseAsPrimaryMetric: false,
      canUseAsPrimaryConclusion: false,
      canUseAsStableAction: false,
      requiresDisplayOnlyDegradation: false,
      pageAvailability: 'available',
      actionReadiness: 'mixed',
    }
  }

  return {
    ...buildBoundary(status),
    pageAvailability: 'unavailable',
    actionReadiness: 'gated',
  }
}

function createCapability(
  index: number,
  name: string,
  status: V14231ReadinessStatus,
  currentStatusText: string,
  codeEvidence: string,
  unlockCondition: string,
  consumptionRule: string,
  browserVerificationScripts: string[],
): V14231CapabilityReadiness {
  return {
    kind: 'capability',
    key: toKey(name),
    name,
    status,
    currentStatusText,
    codeEvidence,
    unlockCondition,
    consumptionRule,
    sourcePlan: SOURCE_PLAN,
    sourceSection: '4.7.05',
    sourceRowRef: `4.7.05#${index}`,
    browserVerificationScripts: [...browserVerificationScripts],
    browserVerificationPolicy: '状态升级到 production-ready 前必须有当前 release、目标环境与摘要匹配且实际通过的主链路浏览器 smoke',
    declaredStatus: status,
    releaseReadinessStatus: status === 'production-ready' ? 'needs-gating' : 'not-applicable',
    evidenceGate: buildDeclaredEvidenceGate(status),
    ...buildBoundary(status),
  }
}

function createPage(
  index: number,
  page: string,
  status: V14231ReadinessStatus,
  currentStatusText: string,
  consumableCapabilities: string,
  uiDegradationStrategy: string,
  forbiddenActions: string,
  browserVerificationScripts: string[],
): V14231PageConsumptionReadiness {
  return {
    kind: 'page',
    key: toKey(page),
    page,
    status,
    currentStatusText,
    consumableCapabilities,
    uiDegradationStrategy,
    forbiddenActions,
    sourcePlan: SOURCE_PLAN,
    sourceSection: '4.7.06',
    sourceRowRef: `4.7.06#${index}`,
    browserVerificationScripts: [...browserVerificationScripts],
    browserVerificationPolicy: '页面接入 C-13 能力前必须有当前 release、目标环境与摘要匹配且实际通过的浏览器 smoke；该 gate 不替代 live / 压测 / 发布回滚证据',
    declaredStatus: status,
    releaseReadinessStatus: status === 'production-ready' ? 'needs-gating' : 'not-applicable',
    evidenceGate: buildDeclaredEvidenceGate(status),
    ...buildPageBoundary(status),
  }
}

const CAPABILITY_READINESS: V14231CapabilityReadiness[] = [
  createCapability(
    1,
    '健康度分解',
    'production-ready',
    '`production-ready`（当前健康维度、封顶原因与数据置信度范围；自动定责仍禁用）',
    'projectHealthService 从统一项目事实计算五个健康维度、scoreBeforeCaps、capReasons、metricAvailability 与数据置信度；Dashboard 真实库主链已读回并通过当前 release 浏览器门禁。',
    '当前范围已闭；新增健康维度、事实来源、封顶规则、换库或换环境时重跑 C-05 / C-12 / C-18.L13。',
    '可作为主健康指标展示分解、封顶原因和数据可用性；不得把解释项包装成自动因果定责或自动处罚。',
    ['verify:dashboard'],
  ),
  createCapability(
    2,
    '进度偏差 + 归因',
    'production-ready',
    '`production-ready`（偏差证据链与责任贡献辅助口径；非统计因果定责）',
    'progressDeviationService 已统一 actual 口径、cause_chain、responsibility_contribution 与证据来源，Reports / Responsibility 真实库浏览器主链已验证。',
    '当前工程问责辅助范围已闭；新增空间归因、反事实模型、写入型处置或换环境时重跑 C-12 / C-17 / C-18.L12。',
    '可作为偏差与证据链主结论展示，并明确责任贡献与置信度；自动定责、处罚和写入型处置仍须人工确认。',
    ['verify:reports', 'verify:task-summary'],
  ),
  createCapability(
    3,
    '未来预测（剩余/关键路径/完工日/赶工）',
    'production-ready',
    '`production-ready`（带置信度的辅助预测；非保证完工日）',
    '剩余工期、关键路径、完工日与赶工建议已走统一预测桥和 published runtime selector；真实库 forecast、快照事实、worker 刷新与 Dashboard 浏览器主链已验证。',
    '当前冷启动和已发布校准范围已闭；新增业态、样本阈值、自动写计划、换库或换环境时重跑 C-15 / C-18.L12 / C-19。',
    '可作为带依据、范围和置信度的主预测结论；不得承诺精确完工日，也不得自动改写基线或稳定参数。',
    ['verify:gantt', 'verify:planning-deviation'],
  ),
  createCapability(
    4,
    '责任主体绩效',
    'production-ready',
    '`production-ready`（执行履约画像；非自动处罚）',
    'responsibilityInsightService 已统一执行主体聚合、watch 状态、恢复建议与偏差责任贡献引用；真实租户 RLS 写入、自动刷新任务和 Responsibility 浏览器主链已验证。',
    '当前履约画像范围已闭；新增处罚、自动定责、跨公司排名或规则阈值时重跑 C-12.1 / C-17 / C-18。',
    '可作为执行履约主画像和关联任务入口；因果责任仅引用偏差证据链，处罚与正式问责仍须人工决策。',
    ['verify:responsibility', 'verify:task-summary'],
  ),
  createCapability(
    5,
    '报表 / 导出',
    'production-ready',
    '`production-ready`（当前 PDF/XLSX/业主月报链；正式公文策略另管）',
    'Reports 已消费摘要/快照统一口径，PDF/XLSX 和业主月报附件链在真实鉴权浏览器流程中可见，XLSX 已完成真实下载与文件读回。',
    '当前产品报表与导出范围已闭；正式公文套版、盖章、批量归档、水印或付费策略作为独立商业能力管理。',
    '可作为当前产品的稳定报表、钻取和导出能力；不得宣称具备未实现的审计级公文、盖章或全量合规交付。',
    ['verify:reports'],
  ),
  createCapability(
    6,
    '公司驾驶舱 CompanyCockpit',
    'production-ready',
    '`production-ready`（当前验证规模与租户边界；超大组合需重跑）',
    'CompanyCockpit 已由后端公司摘要端点统一聚合，项目排行、低健康项目、趋势和钻取在真实租户数据与浏览器流程中验证，未再前端二次聚合。',
    '当前验证规模与公司权限范围已闭；新增公司级指标、超大组合、换库或换环境时重跑 C-05 / C-18.L13 / C-18.L14。',
    '可作为当前公司项目组合主驾驶舱和钻取入口；不得外推为任意规模性能承诺或未注册经营指标。',
    ['verify:company-cockpit'],
  ),
  createCapability(
    7,
    '快照 / 历史趋势',
    'production-ready',
    '`production-ready`（当前快照事实层；换库、换环境或 schema 变化时重跑）',
    'project_daily_snapshot 已作为历史趋势单一事实层，真实库已生成 71 个指标快照并由 Dashboard / Reports / CompanyCockpit 消费，worker 刷新和分页读取均已验证。',
    '当前事实层与刷新链已闭；换库、换环境、schema 变更、超大时间窗口或新增趋势指标时重跑 C-05 / C-18.L13。',
    '可作为历史趋势主事实来源并展示数据窗口；不得回退为前端列表拼历史或绕过快照可用性降级。',
    ['verify:dashboard', 'verify:reports', 'verify:company-cockpit'],
  ),
  createCapability(
    8,
    '快速建模向导（冷启动脊柱）',
    'production-ready',
    '`production-ready`（本轮主链 closeout） / `needs-gating`（未来新增场景）',
    '向导主链、范围物化、恢复链路、C-18.L09 双并发 commit 与第 N 步故障注入已由 2026-06-30 staging closeout fresh evidence 关闭本轮主链。',
    'C-11、C-18.L09、C-19',
    '可作为冷启动入口呈现并实际生成；新增向导步骤、写链、对象类型、导入模式或环境变化必须重跑 C-18.L09。',
    ['verify:scope-modeling', 'verify:join-project'],
  ),
  createCapability(
    9,
    '计划生成（冷启动脊柱·护城河兑现）',
    'production-ready',
    '`production-ready`（当前 row-fuse 主链） / `needs-gating`（未来超规模和新模板族）',
    '旧工期 fallback 已关闭，计划生成主链有结构契约；C-18.L10 200 x 200 scope route / pressure evidence 已由 2026-06-30 staging closeout fresh evidence 关闭本轮 row-fuse 主链。',
    'C-11.1、C-18.L10',
    '可作为计划生成主链呈现并实际生成；不得把本轮证据外推为任意超大 scope、全模板族、跨日历组合或新生成入口天然通过。',
    ['verify:scope-modeling', 'verify:wbs-templates', 'verify:planning-baseline'],
  ),
  createCapability(
    10,
    '进度录入（冷启动脊柱·日常最小录入）',
    'production-ready',
    '`production-ready`（主链范围） / `needs-gating`（超出本轮 profile 的极大 CPM 网络）',
    '普通进度录入主链、状态口径和最小录入路径已由 C-17 主链缺陷修复和契约覆盖；C-18.L12 staging resource_chain_1000 DB evidence 已通过，超出本轮 profile 的极大网络仍需重跑。',
    'C-17.10-C-17.15、C-18.L12',
    '普通主链可作为稳定动作来源；超出本轮 C-18.L12 profile 的极大网络继续按 needs-gating 降级。',
    ['verify:gantt', 'verify:task-summary'],
  ),
]

const PAGE_READINESS: V14231PageConsumptionReadiness[] = [
  createPage(
    1,
    'Dashboard 项目总览',
    'production-ready',
    '`production-ready`（当前摘要、快照与辅助预测范围）',
    '健康分、偏差摘要、快照趋势、普通进度录入',
    '健康分解、偏差摘要、快照趋势和带置信度预测可作为主视图；缺事实或当前 release 证据失效时自动回落降级。',
    '不得显示自动根因、自动问责、自动改计划或整体 production-ready 文案。',
    ['verify:dashboard'],
  ),
  createPage(
    2,
    'Reports',
    'production-ready',
    '`production-ready`（当前报表、钻取与附件导出范围）',
    '报表 / 导出、快照 / 历史趋势、偏差摘要',
    '允许预览、钻取并导出已注册指标和快照窗口；当前 release 证据或权限失效时自动回落降级。',
    '不得作为审计级、全量合规或商业化最终月报承诺。',
    ['verify:reports'],
  ),
  createPage(
    3,
    'CompanyCockpit',
    'production-ready',
    '`production-ready`（当前验证规模与公司权限范围）',
    '公司驾驶舱、快照趋势、健康摘要',
    '公司趋势、项目排行和项目钻取消费后端统一摘要；超出验证规模或当前 release 证据失效时显示降级。',
    '不得输出公司经营主结论、自动排名问责或整体健康承诺。',
    ['verify:company-cockpit'],
  ),
  createPage(
    4,
    'TaskSummary',
    'production-ready',
    '`production-ready`（当前核心完成状态口径已修复；持续门禁）',
    '进度偏差、责任主体绩效、普通进度录入',
    '完成/延期数字消费统一常量和 summary 口径；异常解释提供证据来源。',
    '不在页面内私算完成状态或再次硬编码 completed/done。',
    ['verify:task-summary'],
  ),
  createPage(
    5,
    'Gantt / Planning',
    'production-ready',
    '`production-ready`（冷启动脊柱本轮主链；极大网络 / 新模板族持续门禁）',
    '普通进度录入、计划生成、关键路径预测',
    '建模、生成、进度录入可作为主动作；赶工建议作为审阅草案，显示证据范围。',
    '不自动写 T2 候选依赖或计划日期；不把新增模板族 / 新环境当作已验。',
    ['verify:gantt', 'verify:planning-baseline', 'verify:planning-monthly'],
  ),
  createPage(
    6,
    '规则资产 / 治理工作台',
    'needs-gating',
    '`needs-gating`',
    '学习治理、候选 / 评审 / 发布状态',
    '只读展示候选、评审、冲突和门禁；运行时发布必须走审批 / 回滚 / observation。',
    '不得从页面直接绕过发布门、写 runtime、替代人工批准或关闭回滚门。',
    ['verify:wbs-templates', 'verify:monitoring'],
  ),
  createPage(
    7,
    'DurationAccuracyAdmin / 工期准度后台',
    'needs-gating',
    '`needs-gating`',
    '工期准度、回放、canary、runtime consumer observation',
    '展示准度、回放和待补证据；未达 stable 前只读。',
    '不得启用自动发布、自动调参、自动 stable、自动回滚关闭。',
    ['verify:monitoring'],
  ),
  createPage(
    8,
    'Workspace / 待办',
    'needs-gating',
    '`needs-gating`',
    '待办、提醒、普通进度录入入口',
    '普通提醒和进度录入入口可用；治理 / 预测类待办显示来源和 gated 状态。',
    '不得把 gated 待办作为强制处置、自动关闭或生产承诺。',
    ['verify:notifications', 'verify:join-project'],
  ),
]

const CAPABILITY_BY_KEY = new Map(CAPABILITY_READINESS.map((item) => [item.key, item]))
const CAPABILITY_BY_NAME = new Map(CAPABILITY_READINESS.map((item) => [item.name, item]))
const PAGE_BY_KEY = new Map(PAGE_READINESS.map((item) => [item.key, item]))
const PAGE_BY_NAME = new Map(PAGE_READINESS.map((item) => [item.page, item]))

function buildDeclaredEvidenceGate(status: V14231ReadinessStatus) {
  const required = status === 'production-ready'
  return {
    required,
    verified: !required,
    reasons: required ? ['readiness_gate_evidence_missing'] : [],
  }
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function buildArtifactDigest(value: unknown) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

export function evaluateV14231ReadinessGate(
  context: V14231ReadinessEvaluationContext = {},
): V14231ReadinessGateEvaluation {
  if (!isRecord(context.evidence)) {
    const preflightReasons = unique(context.preflightReasons ?? [])
    return {
      status: preflightReasons.length > 0 ? 'invalid' : 'missing',
      verified: false,
      reasons: preflightReasons.length > 0 ? preflightReasons : ['readiness_gate_evidence_missing'],
      generatedAt: null,
      releaseDigest: null,
      artifactDigest: null,
      targetEnvironment: null,
      passedScripts: [],
    }
  }

  const evidence = context.evidence
  const schemaVersion = normalizeText(evidence.schemaVersion)
  const evidenceStatus = normalizeText(evidence.status)
  const generatedAt = normalizeText(evidence.generatedAt)
  const releaseDigest = normalizeText(evidence.releaseDigest)
  const artifactDigest = normalizeText(evidence.artifactDigest)
  const targetEnvironment = normalizeText(evidence.targetEnvironment)
  const expectedReleaseDigest = normalizeText(context.expectedReleaseDigest)
  const expectedTargetEnvironment = normalizeText(context.expectedTargetEnvironment)
  const reasons: string[] = [...(context.preflightReasons ?? [])]

  if (schemaVersion !== 'workbuddy-v14231-readiness-gate/v1') {
    reasons.push('readiness_gate_schema_invalid')
  }
  if (!generatedAt || !releaseDigest || !artifactDigest || !targetEnvironment) {
    reasons.push('readiness_gate_required_field_missing')
  }
  if (!expectedReleaseDigest) {
    reasons.push('readiness_gate_expected_release_digest_missing')
  } else if (releaseDigest !== expectedReleaseDigest) {
    reasons.push('readiness_gate_release_digest_mismatch')
  }
  if (!expectedTargetEnvironment) {
    reasons.push('readiness_gate_expected_target_missing')
  } else if (targetEnvironment !== expectedTargetEnvironment) {
    reasons.push('readiness_gate_target_mismatch')
  }
  if (evidenceStatus !== 'passed') {
    reasons.push('readiness_gate_status_not_passed')
  }

  const generatedTime = Date.parse(generatedAt)
  const now = context.now instanceof Date ? context.now : new Date()
  const maxAgeMs = Number.isFinite(context.maxAgeMs) && Number(context.maxAgeMs) > 0
    ? Number(context.maxAgeMs)
    : DEFAULT_READINESS_GATE_MAX_AGE_MS
  if (!Number.isFinite(generatedTime)) {
    reasons.push('readiness_gate_generated_at_invalid')
  } else if (generatedTime > now.getTime() + 5 * 60 * 1000) {
    reasons.push('readiness_gate_generated_at_in_future')
  } else if (now.getTime() - generatedTime > maxAgeMs) {
    reasons.push('readiness_gate_evidence_stale')
  }

  const runs = Array.isArray(evidence.runs) ? evidence.runs : []
  if (runs.length === 0) {
    reasons.push('readiness_gate_browser_runs_missing')
  }
  const passedScripts: string[] = []
  const normalizedRuns: Array<{ script: string; status: string; suiteKey: string }> = []
  for (const run of runs) {
    if (!isRecord(run)) {
      reasons.push('readiness_gate_browser_run_invalid')
      continue
    }
    const script = normalizeText(run.script)
    const status = normalizeText(run.status)
    const suiteKey = normalizeText(run.suiteKey)
    if (!script || !['passed', 'failed', 'skipped', 'running', 'unknown'].includes(status)) {
      reasons.push('readiness_gate_browser_run_invalid')
      continue
    }
    if (!suiteKey) reasons.push('readiness_gate_browser_run_suite_key_missing')
    normalizedRuns.push({ script, status, suiteKey })
    if (status === 'passed') passedScripts.push(script)
    if (status !== 'passed') reasons.push(`browser_verification_not_passed:${script}`)
  }

  const suites = Array.isArray(evidence.suites) ? evidence.suites : []
  const normalizedSuites: Array<{
    suiteKey: string
    manifestPath: string
    status: string
    runCount: number
  }> = []
  for (const suite of suites) {
    if (!isRecord(suite)) {
      reasons.push('readiness_gate_browser_suite_invalid')
      continue
    }
    const normalizedSuite = {
      suiteKey: normalizeText(suite.suiteKey),
      manifestPath: normalizeText(suite.manifestPath),
      status: normalizeText(suite.status),
      runCount: Number(suite.runCount),
    }
    if (
      !normalizedSuite.suiteKey
      || !normalizedSuite.manifestPath
      || !['passed', 'failed'].includes(normalizedSuite.status)
      || !Number.isInteger(normalizedSuite.runCount)
      || normalizedSuite.runCount <= 0
    ) {
      reasons.push('readiness_gate_browser_suite_invalid')
    }
    normalizedSuites.push(normalizedSuite)
  }

  const expectedSuiteCount = Number(evidence.expectedSuiteCount)
  const suiteCount = Number(evidence.suiteCount)
  if (
    !Number.isInteger(expectedSuiteCount)
    || expectedSuiteCount <= 0
    || !Number.isInteger(suiteCount)
    || suiteCount !== expectedSuiteCount
    || normalizedSuites.length !== suiteCount
  ) {
    reasons.push('readiness_gate_browser_suite_count_invalid')
  }
  const blockers = Array.isArray(evidence.blockers)
    ? evidence.blockers.map(normalizeText).filter(Boolean)
    : []
  if (blockers.length > 0) reasons.push('readiness_gate_blockers_not_empty')

  const canonicalInput = {
    suites: [...normalizedSuites].sort((left, right) => left.suiteKey.localeCompare(right.suiteKey)),
    runs: [...normalizedRuns].sort((left, right) => left.script.localeCompare(right.script)),
  }
  if (artifactDigest !== buildArtifactDigest(canonicalInput)) {
    reasons.push('readiness_gate_artifact_digest_mismatch')
  }

  const normalizedReasons = unique(reasons)
  let status: V14231ReadinessGateEvaluation['status'] = 'invalid'
  if (normalizedReasons.length === 0) status = 'verified'
  else if (normalizedReasons.includes('readiness_gate_evidence_stale')) status = 'stale'
  else if (normalizedReasons.some((reason) => reason.endsWith('_mismatch'))) status = 'mismatch'
  else if (normalizedReasons.includes('readiness_gate_status_not_passed')) status = 'failed'

  return {
    status,
    verified: normalizedReasons.length === 0,
    reasons: normalizedReasons,
    generatedAt: generatedAt || null,
    releaseDigest: releaseDigest || null,
    artifactDigest: artifactDigest || null,
    targetEnvironment: targetEnvironment || null,
    passedScripts: unique(passedScripts),
  }
}

function applyEvidenceGate<T extends V14231CapabilityReadiness | V14231PageConsumptionReadiness>(
  item: T,
  gate: V14231ReadinessGateEvaluation,
): T {
  const consumptionBoundary = item.kind === 'page'
    ? buildPageBoundary(item.declaredStatus)
    : buildBoundary(item.declaredStatus)

  if (item.declaredStatus !== 'production-ready') {
    return {
      ...item,
      releaseReadinessStatus: 'not-applicable',
      evidenceGate: { required: false, verified: true, reasons: [] },
      ...consumptionBoundary,
    }
  }

  const passedScripts = new Set(gate.passedScripts)
  const scriptReasons = gate.verified
    ? item.browserVerificationScripts
      .filter((script) => !passedScripts.has(script))
      .map((script) => `browser_verification_not_passed:${script}`)
    : []
  const reasons = gate.verified ? scriptReasons : gate.reasons
  if (reasons.length === 0) {
    return {
      ...item,
      status: item.declaredStatus,
      releaseReadinessStatus: 'verified',
      evidenceGate: { required: true, verified: true, reasons: [] },
      ...consumptionBoundary,
    }
  }

  return {
    ...item,
    status: item.declaredStatus,
    releaseReadinessStatus: 'needs-gating',
    evidenceGate: { required: true, verified: false, reasons: [...reasons] },
    ...consumptionBoundary,
  }
}

function cloneCapability(item: V14231CapabilityReadiness): V14231CapabilityReadiness {
  return {
    ...item,
    browserVerificationScripts: [...item.browserVerificationScripts],
    evidenceGate: { ...item.evidenceGate, reasons: [...item.evidenceGate.reasons] },
  }
}

function clonePage(item: V14231PageConsumptionReadiness): V14231PageConsumptionReadiness {
  return {
    ...item,
    browserVerificationScripts: [...item.browserVerificationScripts],
    evidenceGate: { ...item.evidenceGate, reasons: [...item.evidenceGate.reasons] },
  }
}

export function listV14231CapabilityReadiness(
  context: V14231ReadinessEvaluationContext = {},
): V14231CapabilityReadiness[] {
  const gate = evaluateV14231ReadinessGate(context)
  return CAPABILITY_READINESS.map(cloneCapability).map((item) => applyEvidenceGate(item, gate))
}

export function listV14231PageConsumptionReadiness(
  context: V14231ReadinessEvaluationContext = {},
): V14231PageConsumptionReadiness[] {
  const gate = evaluateV14231ReadinessGate(context)
  return PAGE_READINESS.map(clonePage).map((item) => applyEvidenceGate(item, gate))
}

export function getV14231CapabilityReadiness(
  nameOrKey: string,
  context: V14231ReadinessEvaluationContext = {},
): V14231CapabilityReadiness | V14231UnknownCapabilityReadiness {
  const normalized = String(nameOrKey ?? '').trim()
  const item = CAPABILITY_BY_NAME.get(normalized) ?? CAPABILITY_BY_KEY.get(toKey(normalized))
  if (item) return applyEvidenceGate(cloneCapability(item), evaluateV14231ReadinessGate(context))

  return {
    kind: 'capability',
    key: toKey(normalized),
    name: normalized,
    status: 'not-ready',
    currentStatusText: 'not-ready',
    codeEvidence: '未出现在 v1.4.23.1-A §4.7.05 C-13 首批能力判定表',
    unlockCondition: '必须先回填 C-13 判定行、页面降级行、解锁 C 编号和证据索引',
    consumptionRule: '不得作为主指标、主结论、稳定动作或对外承诺的来源',
    sourcePlan: SOURCE_PLAN,
    sourceSection: '4.7.05',
    sourceRowRef: 'unregistered-default',
    browserVerificationScripts: [],
    browserVerificationPolicy: '新增能力必须先补 C-13 行和对应浏览器主链路脚本映射',
    declaredStatus: 'not-ready',
    releaseReadinessStatus: 'not-applicable',
    evidenceGate: { required: false, verified: true, reasons: [] },
    ...buildBoundary('not-ready'),
  }
}

export function getV14231PageConsumptionReadiness(
  pageOrKey: string,
  context: V14231ReadinessEvaluationContext = {},
): V14231PageConsumptionReadiness | V14231UnknownPageConsumptionReadiness {
  const normalized = String(pageOrKey ?? '').trim()
  const item = PAGE_BY_NAME.get(normalized) ?? PAGE_BY_KEY.get(toKey(normalized))
  if (item) return applyEvidenceGate(clonePage(item), evaluateV14231ReadinessGate(context))

  return {
    kind: 'page',
    key: toKey(normalized),
    page: normalized,
    status: 'not-ready',
    currentStatusText: 'not-ready',
    consumableCapabilities: 'none',
    uiDegradationStrategy: '隐藏或只读空态；不得默认消费未登记能力',
    forbiddenActions: '不得作为主指标、主结论、稳定动作或对外承诺的来源',
    sourcePlan: SOURCE_PLAN,
    sourceSection: '4.7.06',
    sourceRowRef: 'unregistered-default',
    browserVerificationScripts: [],
    browserVerificationPolicy: '新增页面必须先补 4.7.06 行和对应浏览器主链路脚本映射',
    declaredStatus: 'not-ready',
    releaseReadinessStatus: 'not-applicable',
    evidenceGate: { required: false, verified: true, reasons: [] },
    ...buildPageBoundary('not-ready'),
  }
}

export function buildV14231ReadinessLedger(
  context: V14231ReadinessEvaluationContext = {},
): V14231ReadinessLedger {
  const evidenceGate = evaluateV14231ReadinessGate(context)
  return {
    sourcePlan: SOURCE_PLAN,
    sourceSections: ['4.7.05', '4.7.06'],
    allowedStatuses: [...ALLOWED_STATUSES],
    defaultUnregisteredStatus: 'not-ready',
    evidenceGate,
    capabilities: CAPABILITY_READINESS.map(cloneCapability).map((item) => applyEvidenceGate(item, evidenceGate)),
    pages: PAGE_READINESS.map(clonePage).map((item) => applyEvidenceGate(item, evidenceGate)),
  }
}

export function validateV14231ProductionReadyEvidenceBindings(
  context: V14231ReadinessEvaluationContext = {},
): V14231ProductionReadyEvidenceViolation[] {
  const violations: V14231ProductionReadyEvidenceViolation[] = []
  const evidenceGate = evaluateV14231ReadinessGate(context)

  for (const capability of CAPABILITY_READINESS) {
    const evaluated = applyEvidenceGate(cloneCapability(capability), evidenceGate)
    if (requiresBrowserEvidence(capability) && !evaluated.evidenceGate.verified) {
      for (const reason of evaluated.evidenceGate.reasons) {
        violations.push({
          kind: 'capability',
          key: capability.key,
          label: capability.name,
          sourceRowRef: capability.sourceRowRef,
          reason,
        })
      }
    }
  }

  for (const page of PAGE_READINESS) {
    const evaluated = applyEvidenceGate(clonePage(page), evidenceGate)
    if (requiresBrowserEvidence(page) && !evaluated.evidenceGate.verified) {
      for (const reason of evaluated.evidenceGate.reasons) {
        violations.push({
          kind: 'page',
          key: page.key,
          label: page.page,
          sourceRowRef: page.sourceRowRef,
          reason,
        })
      }
    }
  }

  return violations
}

function requiresBrowserEvidence(
  item: V14231CapabilityReadiness | V14231PageConsumptionReadiness,
) {
  return item.status === 'production-ready'
}
