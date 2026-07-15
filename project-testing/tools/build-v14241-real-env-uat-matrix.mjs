#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  return relative(repoRoot, path).replace(/\\/g, '/')
}

async function readJsonIfPresent(path, fallback = null) {
  if (!existsSync(path)) return fallback
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

function envTier({ name, mode, mutation, status = 'blocked_missing_handoff', requiredInputs = [] }) {
  return {
    name,
    mode,
    status,
    mutationBoundary: mutation,
    requiredInputs,
  }
}

function scenario({
  id,
  title,
  baselines,
  gateRefs,
  priority = 'P0',
  customerJourney,
  riskClosed,
  tiers,
  prerequisites,
  steps,
  expected,
  failIf,
  evidence,
  automation,
  owners,
  notes = [],
}) {
  return {
    id,
    title,
    priority,
    productionBaselineIds: baselines,
    gateRefs,
    customerJourney,
    riskClosed,
    status: 'blocked_pending_real_environment_handoff',
    executionStatus: 'not_executed',
    tiers,
    prerequisites,
    steps,
    expected,
    failIf,
    evidenceContract: {
      requiredArtifacts: evidence,
      requiredMetadata: [
        'environment',
        'baseUrl',
        'actorRefs',
        'companyId',
        'projectId',
        'startedAt',
        'finishedAt',
        'commandOrManualScript',
        'screenshotsOrTrace',
        'apiFailureSummary',
        'consoleErrorSummary',
        'cleanupOrRollbackReadback',
      ],
      rejectIf: [
        'mock-api-only',
        'local-only',
        'dry-run-only',
        'manual-note-without-screenshot-or-trace',
        'missing-target-ids',
        'missing-cleanup-or-rollback',
        'missing-cross-tenant-negative-assertion-when-security-relevant',
      ],
    },
    automation,
    evidenceOwners: owners,
    notes,
  }
}

function commonTiers({ uatMutation = 'manual browser against staging/UAT seed data only', stagingMutation = 'disposable staging writes with cleanup readback', liveMutation = 'read-only or disposable live writes only after explicit handoff' } = {}) {
  return [
    envTier({
      name: 'UAT',
      mode: 'human_browser_plus_scripted_trace',
      mutation: uatMutation,
      requiredInputs: ['UAT URL', 'named tester accounts', 'seed company/project ids', 'recording/screenshot owner'],
    }),
    envTier({
      name: 'staging',
      mode: 'scripted_browser_api_db_readback',
      mutation: stagingMutation,
      requiredInputs: ['staging base URL', 'auth token refs', 'target company/project ids', 'cleanup owner', 'artifact root'],
    }),
    envTier({
      name: 'solo-live',
      mode: 'personal_real_environment_with_self_approval',
      mutation: 'single-owner personal staging/live deployment with rollback and monitoring refs; cannot close productionReady',
      requiredInputs: ['non-local personal base URL', 'deployment ref', 'self-approval ref', 'rollback owner', 'monitoring owner', 'API/UI smoke refs'],
    }),
    envTier({
      name: 'live',
      mode: 'read_only_or_disposable_write_with_approval',
      mutation: liveMutation,
      requiredInputs: ['live handoff declaration', 'approval ref', 'rollback owner', 'monitoring owner', 'retention path'],
    }),
  ]
}

function buildScenarios() {
  return [
    scenario({
      id: 'REAL-UAT-01',
      title: '登录/会话/创建公司后自动切换',
      baselines: ['PB-01', 'PB-07', 'PB-11'],
      gateRefs: ['G1', 'G4', 'G8'],
      customerJourney: '新客户首次登录、无公司状态下创建公司，并立即进入已创建公司空间。',
      riskClosed: '防止 createCompany 接口成功但 follow-up workspace stale 导致页面回退到无公司页。',
      tiers: commonTiers(),
      prerequisites: ['企业/普通账号各一组', '首次无公司账号', '可创建 disposable company', '确认 SSO/MFA 是否本轮门禁或 explicit gate'],
      steps: ['登录首次无公司账号', '创建公司', '刷新页面并切换工作台', '再次调用 /api/workspace', '读取 localStorage/current company 上下文'],
      expected: ['页面保持新公司上下文', 'current_company_id 与新公司一致', '无 401/403/500', '审计日志记录创建与切换'],
      failIf: ['页面回到 no_company', 'localStorage 未持久化', '跨公司上下文混入', '只有接口断言没有浏览器证据'],
      evidence: ['real-uat-01-company-create-switch.json', 'screenshots/company-create-switch/*.png', 'audit-company-create-switch.json'],
      automation: 'existing local script must be adapted to staging/live with real auth and no mock API',
      owners: ['frontend-owner', 'auth-owner', 'uat-tester', 'cleanup-owner'],
    }),
    scenario({
      id: 'REAL-UAT-02',
      title: '邀请/加入项目/成员角色闭环',
      baselines: ['PB-01', 'PB-09', 'PB-12'],
      gateRefs: ['G1', 'G4', 'G7'],
      customerJourney: '公司管理员邀请项目成员，成员接受加入项目，角色权限立即生效。',
      riskClosed: '防止邀请链只在 mock join 成功，真实成员/项目权限未生效。',
      tiers: commonTiers(),
      prerequisites: ['公司管理员账号', '受邀成员账号', '目标项目', '邮件或站内邀请通道'],
      steps: ['管理员发起邀请', '成员接受邀请', '成员打开项目 Dashboard/Gantt', '管理员调整角色', '成员验证读写边界'],
      expected: ['邀请状态、成员表、项目权限一致', 'editor/owner 权限符合矩阵', '通知/审计均有记录'],
      failIf: ['成员加入后无项目', '角色变更不生效', '非项目成员可写', '邀请状态与成员表不一致'],
      evidence: ['real-uat-02-invite-join-role.json', 'member-role-readback.json', 'audit-invite-role.json'],
      automation: 'hybrid browser plus API/DB readback',
      owners: ['workspace-owner', 'auth-owner', 'uat-tester'],
    }),
    scenario({
      id: 'REAL-UAT-03',
      title: '跨公司/跨项目隔离与 RLS 负向矩阵',
      baselines: ['PB-01', 'PB-06', 'PB-T01'],
      gateRefs: ['G2', 'G3', 'G7'],
      customerJourney: '同一浏览器或不同账号在多公司/多项目间切换时，只能访问授权空间。',
      riskClosed: '防止真实 RLS/header/session 与本地 mock 权限不一致。',
      tiers: commonTiers({ uatMutation: 'manual read/write attempts against disposable UAT tenants', liveMutation: 'read-only plus pre-approved disposable negative checks only' }),
      prerequisites: ['两个公司', '两个项目', 'owner/admin/editor/outsider/anon token refs', 'DB readback 权限'],
      steps: ['按角色矩阵访问本租户读写接口', '切换 company header/token 后访问跨租户项目', '写入后 DB readback', '清理 disposable 写入'],
      expected: ['本租户授权成功', '跨租户 401/403/404', '同公司 outsider 读写拒绝', 'anon 全拒绝', '无数据泄露'],
      failIf: ['跨租户读到数据', '越权写成功', '拒绝路径 500', '无 cleanup/readback'],
      evidence: ['real-uat-03-rls-role-matrix.json', 'cross-tenant-negative-readback.json', 'cleanup-readback.json'],
      automation: 'scripted API/DB matrix; browser evidence supports only route layer',
      owners: ['security-owner', 'database-owner', 'backend-owner'],
    }),
    scenario({
      id: 'REAL-UAT-04',
      title: '项目创建 -> WBS -> 候选基线 -> 发布/回滚',
      baselines: ['PB-02', 'PB-04', 'PB-07', 'PB-09', 'PB-T04'],
      gateRefs: ['G2', 'G4', 'G5', 'G7'],
      customerJourney: '客户创建真实工程项目，生成 WBS 和候选主计划，预览编辑并确认基线后发布且可回滚。',
      riskClosed: '防止候选/默认主计划只在 staging 或文档闭合，缺真实发布/回滚证据。',
      tiers: commonTiers({ liveMutation: 'live only after explicit project/baseline approval and rollback owner' }),
      prerequisites: ['目标 businessType', '项目事实输入', '计划确认账号', 'baseline/project/publication ids', 'rollback window'],
      steps: ['创建项目并填写工程事实', '生成 WBS/候选基线', '预览编辑并确认基线', '发布 runtime publication', '前端读回', '执行 rollback 或保存 rollback outcome'],
      expected: ['WBS/任务/依赖/关键路径一致', '发布后消费端可见', '回滚证据完整', '候选和生产证据边界清楚'],
      failIf: ['无已确认基线读回', '只生成候选未发布', '无 runtime readback', '无 rollback 证据'],
      evidence: ['real-uat-04-wbs-baseline-publication.json', 'runtime-publication-readback.json', 'rollback-verification.json'],
      automation: 'controlled staging/live writer plus browser/API smoke',
      owners: ['planning-owner', 'runtime-publication-owner', 'rollback-owner'],
    }),
    scenario({
      id: 'REAL-UAT-05',
      title: 'Gantt 任务编辑/依赖/关键路径/冲突处理',
      baselines: ['PB-05', 'PB-08', 'PB-09'],
      gateRefs: ['G4', 'G6', 'G7'],
      customerJourney: '项目经理在大项目甘特图中调整任务、依赖和工期，系统更新关键路径且不丢数据。',
      riskClosed: '防止浏览器可渲染但真实任务依赖、锁、冲突和性能不可用。',
      tiers: commonTiers(),
      prerequisites: ['含 500/2000+ 任务的 staging 项目', '并发编辑账号', '关键路径读回接口'],
      steps: ['打开 Gantt', '编辑任务日期/责任人', '新增依赖', '并发冲突提交', '读回关键路径和变更日志', '检查 p95/p99'],
      expected: ['变更持久化', '冲突明确提示', '关键路径更新', '大项目交互不卡死'],
      failIf: ['保存丢失', '冲突静默覆盖', '关键路径不更新', 'p95/p99 超阈值无降级'],
      evidence: ['real-uat-05-gantt-critical-path.json', 'critical-path-readback.json', 'performance-gantt-p95.json'],
      automation: 'browser script plus API/db readback and performance trace',
      owners: ['planning-owner', 'frontend-owner', 'performance-owner'],
    }),
    scenario({
      id: 'REAL-UAT-06',
      title: '月计划/基线/收口状态机与草稿锁',
      baselines: ['PB-05', 'PB-07', 'PB-09'],
      gateRefs: ['G4', 'G5', 'G7'],
      customerJourney: '项目团队编制月计划、提交审批、确认、修订和收口。',
      riskClosed: '防止状态机、草稿锁、发布/回滚只在单测里成立。',
      tiers: commonTiers(),
      prerequisites: ['可写项目', '计划编制人/审批人账号', '并发草稿场景'],
      steps: ['创建月计划草稿', '并发编辑', '提交审批', '确认发布', '修订回滚', '收口读回'],
      expected: ['状态迁移合法', '草稿锁防覆盖', '审批/确认/回滚链有审计', '任务计划链同步'],
      failIf: ['非法状态跳转', '锁失效', '发布后读回不一致', '无审计'],
      evidence: ['real-uat-06-plan-state-machine.json', 'draft-lock-readback.json', 'approval-audit.json'],
      automation: 'hybrid browser/API state-machine replay',
      owners: ['planning-owner', 'workflow-owner', 'uat-tester'],
    }),
    scenario({
      id: 'REAL-UAT-07',
      title: '图纸/证照/验收资料与任务责任链',
      baselines: ['PB-02', 'PB-09', 'PB-12', 'PB-T04'],
      gateRefs: ['G4', 'G7'],
      customerJourney: '工程资料上传、版本审查、证照节点和验收节点能回到任务/责任人。',
      riskClosed: '防止资料模块成为孤岛，不能驱动任务、通知和责任链。',
      tiers: commonTiers({ stagingMutation: 'staging file/storage writes with cleanup and retention evidence', liveMutation: 'live file writes only with explicit disposable scope and deletion proof' }),
      prerequisites: ['测试文件集', '资料管理员/审核人账号', '任务和责任人链路'],
      steps: ['上传图纸/证照/验收附件', '发起审查/验收', '关联任务责任人', '退回/通过', '检查通知和留痕'],
      expected: ['版本、状态、附件、任务、责任人、通知一致', '敏感文件权限隔离', '删除/保留策略明确'],
      failIf: ['附件丢失', '跨租户下载', '资料无法回到任务', '无删除保留证据'],
      evidence: ['real-uat-07-document-chain.json', 'file-permission-readback.json', 'retention-delete-readback.json'],
      automation: 'browser upload/download plus storage/API readback',
      owners: ['document-owner', 'security-owner', 'uat-tester'],
    }),
    scenario({
      id: 'REAL-UAT-08',
      title: '材料/风险/问题/待办/通知闭环',
      baselines: ['PB-09', 'PB-10', 'PB-12'],
      gateRefs: ['G4', 'G7'],
      customerJourney: '材料到场异常、风险问题和待办通知能落到责任人并闭环。',
      riskClosed: '防止业务闭环只展示卡片，没有消息触达和责任链读回。',
      tiers: commonTiers(),
      prerequisites: ['材料/风险/问题测试数据', '责任人账号', '通知渠道或站内通知'],
      steps: ['创建材料到场异常', '创建风险/问题', '生成待办/通知', '责任人处理', '关闭并读回报表'],
      expected: ['提醒、待办、责任人、任务、报表同步', '逾期/关闭状态准确', '审计留痕完整'],
      failIf: ['通知未生成', '责任人链断开', '关闭后报表不更新', '跨项目可见'],
      evidence: ['real-uat-08-business-loop.json', 'notification-readback.json', 'responsibility-chain-readback.json'],
      automation: 'browser plus API notification/readback',
      owners: ['business-loop-owner', 'notification-owner', 'uat-tester'],
    }),
    scenario({
      id: 'REAL-UAT-09',
      title: 'Dashboard/CompanyCockpit/Reports 指标口径与快照血缘',
      baselines: ['PB-08', 'PB-09', 'PB-T03'],
      gateRefs: ['G4', 'G6', 'G8'],
      customerJourney: '客户在公司驾驶舱、项目 Dashboard 和报表之间看到同一口径指标。',
      riskClosed: '防止前端/路由临时聚合导致指标不一致。',
      tiers: commonTiers({ uatMutation: 'read-only browser review against prepared staging data', stagingMutation: 'read-only plus controlled snapshot generation if authorized', liveMutation: 'read-only only unless snapshot job explicitly approved' }),
      prerequisites: ['项目快照数据', 'CompanyCockpit/Dashboard/Reports 可访问', 'metricRegistry 对照'],
      steps: ['打开三个指标页面', '抽样核对健康度/进度/风险/趋势', '追踪 snapshot 和摘要服务来源', '检查导出报表'],
      expected: ['指标口径一致', '趋势来自快照', '导出与页面一致', '无前端二次聚合偏差'],
      failIf: ['同一指标不同页面数值冲突', '缺 snapshot lineage', '路由临时 reduce 口径', '导出不一致'],
      evidence: ['real-uat-09-bi-ssot.json', 'metric-lineage-readback.json', 'report-export-sample.xlsx'],
      automation: 'scripted browser/API comparison plus export artifact',
      owners: ['bi-owner', 'backend-owner', 'uat-tester'],
    }),
    scenario({
      id: 'REAL-UAT-10',
      title: '导入/导出/PDF-XLSX 报表与权限',
      baselines: ['PB-06', 'PB-09', 'PB-12'],
      gateRefs: ['G4', 'G7'],
      customerJourney: '客户导入工程数据并导出报表/清单，权限、格式和审计都正确。',
      riskClosed: '防止导出只在 mock 下载通过，真实文件打不开或越权下载。',
      tiers: commonTiers({ stagingMutation: 'staging import writes with cleanup/readback', liveMutation: 'live import only in disposable project after explicit approval' }),
      prerequisites: ['CSV/XLSX/PDF 测试文件', '不同角色账号', '文件校验器'],
      steps: ['导入任务/资料样例', '检查迁移回放', '导出 PDF/XLSX', '用下游 reader 打开', '越权下载负向测试'],
      expected: ['导入可回放', '导出文件可打开', '权限拒绝正确', '审计记录导入导出'],
      failIf: ['文件损坏', '导入半成功', '越权下载', '无导入导出审计'],
      evidence: ['real-uat-10-import-export.json', 'export-open-validation.json', 'permission-negative-download.json'],
      automation: 'API/browser plus downstream file reader validation',
      owners: ['export-owner', 'security-owner', 'uat-tester'],
    }),
    scenario({
      id: 'REAL-UAT-11',
      title: '容量/性能/慢查询/热点保护',
      baselines: ['PB-05', 'PB-08'],
      gateRefs: ['G6', 'G7'],
      customerJourney: '真实大项目在高并发浏览/编辑/报表场景下仍可用。',
      riskClosed: '防止功能通但容量不足，或只有本地小数据通过。',
      tiers: commonTiers({ uatMutation: 'read-only plus approved synthetic load window', stagingMutation: 'controlled load against staging with monitoring', liveMutation: 'read-only synthetic canary only with SRE approval' }),
      prerequisites: ['大项目数据集', '压测窗口', '监控/日志/DB query log', '阈值 p95/p99'],
      steps: ['加载大 Gantt', '打开 CompanyCockpit/Reports', '执行并发读写/导出', '采集 p95/p99 和慢查询', '验证降级/分页/缓存'],
      expected: ['关键页面 p95/p99 达标', '慢查询有治理记录', '热点保护/分页/缓存生效', '无数据损坏'],
      failIf: ['p95/p99 超阈值无处置', '慢查询未记录', '压力后数据不一致', '无监控证据'],
      evidence: ['real-uat-11-performance-pressure.json', 'db-query-log.json', 'browser-trace.zip'],
      automation: 'load/performance scripts plus observability readback',
      owners: ['performance-owner', 'database-owner', 'sre-owner'],
    }),
    scenario({
      id: 'REAL-UAT-12',
      title: '安全负向：XSS/CSRF/SSRF/限流/恶意文件/密钥',
      baselines: ['PB-03', 'PB-06', 'PB-12'],
      gateRefs: ['G3', 'G7'],
      customerJourney: '企业客户安全审查要求的核心攻击面不能被绕过。',
      riskClosed: '防止只靠单测和静态扫描，真实网关/浏览器/存储链路未测。',
      tiers: commonTiers({ uatMutation: 'negative tests against staging/UAT only', stagingMutation: 'controlled negative tests with disposable payloads', liveMutation: 'live negative tests require explicit security window; no destructive payloads' }),
      prerequisites: ['安全测试窗口', '恶意文件样本', 'payload 清单', 'WAF/CSP/header 读回'],
      steps: ['提交 XSS/CSRF/SSRF payload', '上传恶意文件', '触发限流/防刷', '检查 CSP/header', '执行 secret/advisor 扫描读回'],
      expected: ['危险 payload 被拒绝或转义', '恶意文件 blocked', '限流生效', '无 secret 泄露', '告警可见'],
      failIf: ['payload 执行', 'SSRF 出网', '恶意文件可下载', '限流无效', '密钥出现在证据中'],
      evidence: ['real-uat-12-security-negative.json', 'csp-header-readback.json', 'advisor-security-readback.json'],
      automation: 'security scripts plus manual safety review',
      owners: ['security-owner', 'sre-owner', 'uat-tester'],
    }),
    scenario({
      id: 'REAL-UAT-13',
      title: '发布/回滚/健康检查/前端部署回滚',
      baselines: ['PB-04', 'PB-05', 'PB-07'],
      gateRefs: ['G5', 'G7'],
      customerJourney: '上线窗口中发布新版本，发现问题可快速回滚并保持健康检查通过。',
      riskClosed: '防止只有构建通过，没有真实发布和回滚演练。',
      tiers: commonTiers({ uatMutation: 'release rehearsal against UAT environment', stagingMutation: 'staging blue-green/canary rehearsal', liveMutation: 'live rollout only with approval, monitoring and rollback owner' }),
      prerequisites: ['发布审批', '版本号', '回滚脚本', '健康检查 URL', '监控窗口'],
      steps: ['执行 staging 发布', '跑健康检查/冒烟', '触发前端回滚', '执行 DB migration rollback 演练或 no-op 证明', '归档发布证据'],
      expected: ['健康检查稳定', '回滚脚本可用', '版本证据完整', '发布审批和监控记录齐全'],
      failIf: ['无回滚证据', '健康检查只看首页', '迁移无回滚策略', '发布审批缺失'],
      evidence: ['real-uat-13-release-rollback.json', 'healthcheck-readback.json', 'rollback-drill.json'],
      automation: 'CI/CD release scripts plus manual approval evidence',
      owners: ['release-owner', 'sre-owner', 'rollback-owner'],
    }),
    scenario({
      id: 'REAL-UAT-14',
      title: '备份恢复/迁移治理/schema drift/旧对象处置',
      baselines: ['PB-02', 'PB-04', 'PB-12'],
      gateRefs: ['G2', 'G5', 'G7'],
      customerJourney: '客户数据可备份、可恢复、迁移可控，旧对象处置明确。',
      riskClosed: '防止只备份不演练、只 rowCount=0 就 DROP、schema drift 未闭合。',
      tiers: commonTiers({ uatMutation: 'restore drill against non-production copy', stagingMutation: 'staging DB restore/migration rehearsal', liveMutation: 'live read-only evidence unless approved maintenance window' }),
      prerequisites: ['备份文件 ref', '恢复演练库', '迁移账本', '旧对象 candidate discovery', 'DB readiness owner'],
      steps: ['执行备份恢复演练', '跑 migration check/drift/advisor', '旧对象 discovery', 'dependency readback', 'post-restore smoke'],
      expected: ['恢复成功且数据一致', 'pending/drift/advisor 关闭或有 gate', '旧对象 no-safe-candidate 或审批 DROP 证据明确'],
      failIf: ['无法恢复', 'drift 未解释', '旧对象无依赖 readback', '物理 DROP 无回滚/审批'],
      evidence: ['real-uat-14-backup-restore-migration.json', 'schema-drift-readback.json', 'old-object-disposition.json'],
      automation: 'DB-dependent runbook plus validators',
      owners: ['database-owner', 'migration-owner', 'sre-owner'],
    }),
    scenario({
      id: 'REAL-UAT-15',
      title: '可观测性/告警/事故响应 Runbook',
      baselines: ['PB-05', 'PB-10', 'PB-12'],
      gateRefs: ['G7', 'G8'],
      customerJourney: '真实故障被发现、告警到人、按 runbook 处理并复盘。',
      riskClosed: '防止有日志/告警配置但无人响应、无升级路径。',
      tiers: commonTiers({ uatMutation: 'tabletop drill plus staging signal', stagingMutation: 'staging synthetic failure and alert route', liveMutation: 'live alert route test only in approved low-risk window' }),
      prerequisites: ['告警接收人', 'on-call 表', 'runbook', '故障注入窗口', '复盘模板'],
      steps: ['注入低风险错误', '确认日志/指标/错误聚合', '确认告警到人', '按 runbook 处理', '记录复盘和补偿动作'],
      expected: ['告警到人', '响应时限达标', '问题定位路径明确', '复盘和改进项归档'],
      failIf: ['告警无人接收', '只有 dashboard 无通知', 'runbook 不可执行', '无复盘记录'],
      evidence: ['real-uat-15-observability-incident.json', 'alert-delivery-proof.json', 'incident-review.md'],
      automation: 'synthetic alert plus manual incident drill',
      owners: ['sre-owner', 'support-owner', 'incident-commander'],
    }),
    scenario({
      id: 'REAL-UAT-16',
      title: '管理员/客服支持/审计/数据补偿工具',
      baselines: ['PB-10', 'PB-12', 'PB-T01'],
      gateRefs: ['G4', 'G7'],
      customerJourney: '客户遇到生产问题时，支持人员能定位、补偿、审计并复核。',
      riskClosed: '防止生产运维只能靠手写 SQL 或临时脚本。',
      tiers: commonTiers({ liveMutation: 'live support action only with ticket, approval and before/after readback' }),
      prerequisites: ['管理员入口', '工单编号', '支持账号', '补偿工具', '审计日志'],
      steps: ['创建工单', '管理员定位用户/项目', '执行只读诊断', '执行受控补偿或 no-op 演练', '复核审计和访问记录'],
      expected: ['支持动作可追踪', '补偿有 before/after readback', '敏感信息脱敏', '访问复核可导出'],
      failIf: ['绕过审计', '手工 SQL 无审批', '敏感信息明文外泄', '补偿无读回'],
      evidence: ['real-uat-16-support-ops.json', 'support-audit-readback.json', 'data-compensation-proof.json'],
      automation: 'admin workflow plus audit export',
      owners: ['support-owner', 'security-owner', 'database-owner'],
    }),
  ]
}

function summarizeCoverage(testCaseMatrix, baselineCoverageMap) {
  const cases = testCaseMatrix?.cases ?? []
  const byCoverageStatus = {}
  const byEnvironment = {}
  for (const testCase of cases) {
    byCoverageStatus[testCase.coverageStatus] = (byCoverageStatus[testCase.coverageStatus] ?? 0) + 1
    byEnvironment[testCase.environment] = (byEnvironment[testCase.environment] ?? 0) + 1
  }
  const baselineStatuses = {}
  for (const baseline of Object.values(baselineCoverageMap?.baselines ?? {})) {
    baselineStatuses[baseline.coverageStatus] = (baselineStatuses[baseline.coverageStatus] ?? 0) + 1
  }
  return {
    totalCases: cases.length,
    byCoverageStatus,
    byEnvironment,
    baselineStatuses,
  }
}

export async function buildMatrix({ releaseDir = defaultReleaseDir, now = new Date() } = {}) {
  const absoluteReleaseDir = resolve(releaseDir)
  const releaseSummary = await readJsonIfPresent(join(absoluteReleaseDir, 'summary.json'), null)
  const testCaseMatrix = await readJsonIfPresent(join(absoluteReleaseDir, 'v1424-test-case-matrix.json'), null)
  const baselineCoverageMap = await readJsonIfPresent(join(absoluteReleaseDir, 'v1424-baseline-test-coverage-map.json'), null)
  const scenarios = buildScenarios()

  return {
    schemaVersion: 'workbuddy/v14241-real-env-uat-staging-live-matrix/v1',
    generatedAt: now.toISOString(),
    releaseDir: rel(absoluteReleaseDir),
    sourceReleaseDecision: releaseSummary
      ? {
          decision: releaseSummary.decision,
          gates: releaseSummary.gateSummary,
          blockerCount: releaseSummary.blockers?.length ?? null,
        }
      : null,
    boundary: {
      purpose: 'Define the real-customer UAT/staging/solo-live/live execution matrix that must be run before claiming real customer scenario coverage.',
      notAReleasePassClaim: true,
      localMockEvidenceCannotClose: true,
      personalRealEnvironmentCanCloseSoloLiveOnly: true,
      liveExecutionRequiresHandoff: true,
      dbExecutionRequiresDbReady: true,
      productionMutationRequiresApprovalRollbackAndCleanup: true,
    },
    currentV1424CoverageSnapshot: summarizeCoverage(testCaseMatrix, baselineCoverageMap),
    status: 'matrix_ready_execution_blocked_until_real_environment_handoff',
    requiredHandoffInputs: [
      'UAT/staging/solo-live/live base URLs and deployment versions.',
      'Named tester accounts for owner/company_admin/project_admin/editor/outsider/anon and SSO/MFA decision.',
      'Target company/project/baseline/publication ids and disposable data boundaries.',
      'Database readback owner, backup/restore owner, cleanup owner, rollback owner, monitoring owner.',
      'solo-live owner refs may close personal real-environment readiness only; they do not replace live handoff or production outcome evidence.',
      'Artifact root under project-testing/reports/<real-env-run>/ and retention policy.',
      'Approval refs for any staging/live write, runtime publication, destructive action, or security negative test.',
    ],
    scenarios,
    executionOrder: [
      'REAL-UAT-01',
      'REAL-UAT-02',
      'REAL-UAT-03',
      'REAL-UAT-04',
      'REAL-UAT-05',
      'REAL-UAT-06',
      'REAL-UAT-07',
      'REAL-UAT-08',
      'REAL-UAT-09',
      'REAL-UAT-10',
      'REAL-UAT-11',
      'REAL-UAT-12',
      'REAL-UAT-13',
      'REAL-UAT-14',
      'REAL-UAT-15',
      'REAL-UAT-16',
    ],
  }
}

function renderMarkdown(matrix) {
  const lines = [
    '# v1.4.24.1 Real Environment UAT / staging / solo-live / live Matrix',
    '',
    `- Generated at: ${matrix.generatedAt}`,
    `- Release dir: ${matrix.releaseDir}`,
    `- Status: ${matrix.status}`,
    `- Source decision: ${matrix.sourceReleaseDecision?.decision ?? 'unknown'}`,
    `- Boundary: local/mock/browser evidence may support triage, solo-live may close personal real-environment readiness only, and strict live/production evidence remains separate.`,
    '',
    '## Current Coverage Snapshot',
    '',
    `- v1.4.24 case count: ${matrix.currentV1424CoverageSnapshot.totalCases}`,
    `- Case coverage statuses: ${JSON.stringify(matrix.currentV1424CoverageSnapshot.byCoverageStatus)}`,
    `- Baseline coverage statuses: ${JSON.stringify(matrix.currentV1424CoverageSnapshot.baselineStatuses)}`,
    '',
    '## Handoff Inputs Required Before Execution',
    '',
    ...matrix.requiredHandoffInputs.map((item) => `- ${item}`),
    '',
    '## Scenario Summary',
    '',
    '| ID | Priority | Scenario | Baselines | Status | Automation |',
    '| --- | --- | --- | --- | --- | --- |',
  ]

  for (const item of matrix.scenarios) {
    lines.push(`| ${item.id} | ${item.priority} | ${item.title} | ${item.productionBaselineIds.join(', ')} | ${item.status} | ${item.automation} |`)
  }

  lines.push('', '## Scenario Details', '')
  for (const item of matrix.scenarios) {
    lines.push(
      `### ${item.id} ${item.title}`,
      '',
      `- Priority: ${item.priority}`,
      `- Baselines: ${item.productionBaselineIds.join(', ')}`,
      `- Gates: ${item.gateRefs.join(', ')}`,
      `- Customer journey: ${item.customerJourney}`,
      `- Risk closed: ${item.riskClosed}`,
      `- Status: ${item.status}`,
      '',
      'Environment tiers:',
      ...item.tiers.map((tier) => `- ${tier.name}: ${tier.status}; ${tier.mode}; mutation=${tier.mutationBoundary}; inputs=${tier.requiredInputs.join(' / ')}`),
      '',
      'Prerequisites:',
      ...item.prerequisites.map((step) => `- ${step}`),
      '',
      'Steps:',
      ...item.steps.map((step, index) => `${index + 1}. ${step}`),
      '',
      'Expected:',
      ...item.expected.map((step) => `- ${step}`),
      '',
      'Fail if:',
      ...item.failIf.map((step) => `- ${step}`),
      '',
      'Required evidence:',
      ...item.evidenceContract.requiredArtifacts.map((artifact) => `- ${artifact}`),
      '',
      'Reject evidence if:',
      ...item.evidenceContract.rejectIf.map((reject) => `- ${reject}`),
      '',
    )
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = argValue('--release-dir', defaultReleaseDir)
  const outputDir = resolve(argValue('--output-dir', releaseDir))
  const matrix = await buildMatrix({ releaseDir })
  await mkdir(outputDir, { recursive: true })
  const jsonPath = join(outputDir, 'v14241-real-env-uat-staging-live-matrix.json')
  const mdPath = join(outputDir, 'v14241-real-env-uat-staging-live-matrix.md')
  await writeFile(jsonPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8')
  await writeFile(mdPath, renderMarkdown(matrix), 'utf8')
  console.log(JSON.stringify({
    status: matrix.status,
    releaseDir: matrix.releaseDir,
    scenarioCount: matrix.scenarios.length,
    outputs: [rel(jsonPath), rel(mdPath)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
