#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sourcePlanPath = 'docs/plans/v1.4.24上线验收测试方案.md'
const defaultReleaseDir = 'project-testing/reports/release-v1.4.24-20260702-125254'

const requiredCaseClasses = ['normal', 'boundary', 'exception', 'security']
const validCaseTypes = new Set(['normal', 'boundary', 'exception', 'security', 'pressure', 'closeout'])

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  return relative(repoRoot, path).replace(/\\/g, '/')
}

function caseRecord({
  caseId,
  baselineIds,
  gate,
  caseClass,
  caseType = caseClass,
  environment,
  preconditions,
  input,
  steps,
  expected,
  failIf,
  evidence,
  existingCoverage = [],
  coverageStatus,
  productionBranchCovered = false,
  notes = [],
}) {
  if (!validCaseTypes.has(caseType)) {
    throw new Error(`Invalid caseType for ${caseId}: ${caseType}`)
  }
  return {
    caseId,
    baselineIds,
    gate,
    caseClass,
    caseType,
    environment,
    executionStatus: 'not-executed',
    preconditions,
    input,
    steps,
    expected,
    failIf,
    evidence,
    existingCoverage,
    coverageStatus,
    productionBranchCovered,
    notes,
  }
}

const baselineDefinitions = [
  {
    baselineId: 'PB-01',
    name: '身份与权限',
    gates: ['G1', 'G3', 'G7', 'G8'],
    existingCoverage: ['authLoginRoute.test.ts', 'authMiddlewareSessionFreshness.test.ts', 'workspaceIsolationMatrix.test.ts', 'workspaceIsolationGuard.test.ts', 'routeAuthGuard.test.ts', 'scripts/verify-uiux-release-smoke.mjs'],
    cases: [
      caseRecord({
        caseId: 'PB01-AUTH-NORMAL-01',
        baselineIds: ['PB-01'],
        gate: ['G1', 'G3', 'G7'],
        caseClass: 'normal',
        environment: 'staging/browser',
        preconditions: ['owner/admin/editor/outsider 测试账号可登录', '浏览器可访问目标 API 与前端'],
        input: { roles: ['owner', 'company_admin', 'editor', 'outsider'], endpoint: '/api/auth/me', actions: ['login', 'refresh', 'route-switch', 'parallel-api'] },
        steps: ['分别登录四类账号', '调用 /api/auth/me', '刷新页面并切换主链页面', '并发触发 3 个业务接口'],
        expected: ['每个有效账号 /api/auth/me 返回 200', '刷新和切页后 token 仍稳定', '并发接口不出现随机 401/500'],
        failIf: ['任一有效账号登录失败', '刷新或切页后 token 丢失', '并发接口出现非预期 401/500'],
        evidence: ['auth-smoke.json'],
        existingCoverage: ['authLoginRoute.test.ts', 'authMiddlewareSessionFreshness.test.ts', 'scripts/verify-uiux-release-smoke.mjs'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB01-AUTH-BOUNDARY-01',
        baselineIds: ['PB-01'],
        gate: ['G3', 'G7'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['可生成过期 token 或无 company header 请求'],
        input: { tokenStates: ['expired', 'missing-company-header', 'switched-company'], endpoints: ['/api/auth/me', '/api/projects'] },
        steps: ['使用过期 token 调业务接口', '去掉 company header 调业务接口', '切换到未授权 company 后调业务接口'],
        expected: ['返回 401/403', '不串租户', '错误语义明确'],
        failIf: ['返回 200', '返回跨租户数据', '拒绝路径返回 500'],
        evidence: ['auth-smoke.json', 'tenant-access-matrix.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB01-COMPANY-CREATE-SWITCH-01',
        baselineIds: ['PB-01', 'PB-07', 'PB-11'],
        gate: ['G1', 'G4', 'G8'],
        caseClass: 'boundary',
        environment: 'local_browser/staging_browser',
        preconditions: ['用户已登录且初始无公司', '创建公司接口返回新 company id', '后续 /api/workspace 刷新允许短暂返回 stale no_company'],
        input: {
          initialWorkspace: 'no_company',
          createCompanyResponse: { id: 'company-created', role: 'company_admin' },
          followUpWorkspace: 'stale_no_company',
          requiredStorageKey: 'current_company_id',
        },
        steps: ['进入 workspace 无公司页', '点击创建公司并等待接口成功', '触发后续 workspace refresh', '读取页面状态和 localStorage.current_company_id'],
        expected: ['页面进入 workspace-empty-projects', '创建出的公司保持为 currentCompany', 'current_company_id 等于新公司 id', '不会回退到 workspace-no-company'],
        failIf: ['follow-up stale no_company 覆盖创建结果', 'localStorage 未持久化新公司 id', '页面重新显示 workspace-no-company', '测试只断言接口返回但不检查浏览器页面状态'],
        evidence: [
          'project-testing/artifacts/browser-checks/workspace-company-create-switch-browser-check.json',
          'project-testing/artifacts/browser-checks/workspace-company-create-switch/workspace-company-create-switch-browser-check.json',
        ],
        existingCoverage: ['client/src/hooks/__tests__/useWorkspaceData.test.tsx', 'scripts/verify-workspace-company-create-switch-browser.mjs'],
        coverageStatus: 'partial',
        notes: ['v1.4.24.1 反假绿补丁用例；local_browser 可证明前端状态机，staging_browser 仍需真实环境复跑后才能升级为 live 证据。'],
      }),
      caseRecord({
        caseId: 'PB01-AUTH-EXCEPTION-01',
        baselineIds: ['PB-01'],
        gate: ['G3', 'G7'],
        caseClass: 'exception',
        environment: 'staging',
        preconditions: ['可临时模拟 auth service 或 DB 连接失败'],
        input: { failureModes: ['auth-service-unavailable', 'db-connection-failure'], endpoint: '/api/auth/login' },
        steps: ['注入认证服务异常', '发起登录或会话校验', '检查响应与日志'],
        expected: ['返回 503 或明确错误', '不生成假登录态', '不写入业务数据'],
        failIf: ['返回成功 token', '吞错后进入登录态', '无错误分类'],
        evidence: ['api-error-semantics.json'],
        existingCoverage: ['authServiceUnavailableRoutes.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB01-RLS-MATRIX-01',
        baselineIds: ['PB-01', 'PB-06', 'PB-T01'],
        gate: ['G2', 'G3', 'G7'],
        caseClass: 'security',
        environment: 'staging/db',
        preconditions: ['同租户 company/project', '跨租户 company/project', 'owner/admin/editor/outsider token refs', 'anon/no token'],
        input: {
          roles: ['owner', 'company_admin', 'project_admin_or_editor', 'outsider', 'anon'],
          operations: ['same-tenant-read', 'same-tenant-write', 'cross-tenant-read', 'cross-tenant-write'],
          endpoints: ['/api/projects/:id', '/api/company/dashboard/company-summary', 'POST /api/projects', 'POST|PATCH /api/projects/:id/tasks'],
        },
        steps: ['按角色矩阵逐项请求读写接口', '对每个写请求做 DB readback', '清理 disposable 写入', '记录响应摘要'],
        expected: ['本租户授权读写成功', '同公司未入项目的 outsider 读写均拒绝', 'anon 读写拒绝', '跨租户读写全部 401/403/404 且无数据泄露'],
        failIf: ['跨租户读到数据', '越权写成功', '拒绝路径 500', '写入无 readback/cleanup'],
        evidence: ['rls-role-matrix.json', 'tenant-access-matrix.json'],
        existingCoverage: ['workspaceIsolationMatrix.test.ts', 'workspaceIsolationGuard.test.ts', 'coreRlsForceAndPoliciesMigration.test.ts'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-02',
    name: '数据与存储',
    gates: ['G2', 'G3', 'G7', 'G8'],
    existingCoverage: ['migrationRunner.test.ts', 'migrationSafetyGateService.test.ts', 'migrationProductionGovernanceService.test.ts', 'legacyObjectDropGuardService.test.ts', 'projectDailySnapshotService.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PB02-READBACK-NORMAL-01',
        baselineIds: ['PB-02'],
        gate: ['G2', 'G3'],
        caseClass: 'normal',
        environment: 'staging/db',
        preconditions: ['disposable company/project 可写', 'DB readback 只使用测试对象'],
        input: { entities: ['company', 'project', 'tasks', 'project_daily_snapshot'], cleanupRequired: true },
        steps: ['创建 disposable company/project/tasks/snapshot', '通过 API 读取', '通过 DB readback 校验', '清理测试数据'],
        expected: ['API 与 DB 数据一致', 'cleanup 后无孤儿行'],
        failIf: ['API/DB 不一致', '出现孤儿行', '无法清理'],
        evidence: ['v1424-db-readback.json'],
        coverageStatus: 'missing-db',
      }),
      caseRecord({
        caseId: 'PB02-MIGRATION-BOUNDARY-01',
        baselineIds: ['PB-02'],
        gate: ['G2'],
        caseClass: 'boundary',
        environment: 'db',
        preconditions: ['可连接目标 Postgres 或 staging branch'],
        input: { checks: ['pending', 'checksum', 'orphan', 'blocking-drift'] },
        steps: ['执行 migrate check/diagnose/drift', '读取迁移账本', '归档 stdout/stderr'],
        expected: ['pending/checksum/orphan/blocking drift 均为 0'],
        failIf: ['任一迁移治理指标非 0', '命令缺 stdout/stderr', '只跑本地未连 DB'],
        evidence: ['migrationStatus', 'production-migration-governance-evidence.json'],
        existingCoverage: ['migrationRunner.test.ts', 'migrationProductionGovernanceService.test.ts'],
        coverageStatus: 'missing-db',
      }),
      caseRecord({
        caseId: 'PB02-DATA-EXCEPTION-01',
        baselineIds: ['PB-02'],
        gate: ['G3', 'G7'],
        caseClass: 'exception',
        environment: 'staging/db',
        preconditions: ['可对 disposable 写链注入事务失败'],
        input: { failureModes: ['partial-write', 'transaction-failure'], writePath: 'project-create-with-membership-snapshot' },
        steps: ['注入部分写入失败', '检查事务结果', '执行 cleanup/readback'],
        expected: ['不留下半写入链', 'cleanup 可证明', '错误语义明确'],
        failIf: ['项目存在但 membership/snapshot 缺失', 'cleanup 后仍残留', '错误被吞掉'],
        evidence: ['projects-write-readback.json', 'db-cleanup-report.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB02-OLDOBJ-SECURITY-01',
        baselineIds: ['PB-02', 'PB-04', 'PB-12'],
        gate: ['G2', 'G5', 'G7'],
        caseClass: 'security',
        caseType: 'closeout',
        environment: 'db',
        preconditions: ['旧对象 discovery 结果可读', 'drop guard 可执行'],
        input: { oldObjectStates: ['rowCount=0-with-dependency', 'no-safe-candidate'] },
        steps: ['执行旧对象 catalog discovery', '读取依赖', '对无安全候选输出 no-op closeout', '若有候选则要求审批/备份/rollback'],
        expected: ['仅 rowCount=0 不允许 DROP', 'no-safe-candidate 不宣称物理删除'],
        failIf: ['凭 rowCount=0 删除', '无依赖 readback', '把 no-op 写成已 DROP'],
        evidence: ['old-object-physical-drop-summary.json'],
        existingCoverage: ['legacyObjectDropGuardService.test.ts'],
        coverageStatus: 'missing-db',
      }),
    ],
  },
  {
    baselineId: 'PB-03',
    name: '配置与密钥',
    gates: ['G3', 'G7', 'G8'],
    existingCoverage: ['databaseConnectionRoleGuard.test.ts', 'runtimeDatabaseRoleMigration.test.ts', 'executeSqlRpcLockdown.test.ts', 'serverBootstrapIsolation.test.ts', 'deployWorkflowContract.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PB03-ENV-NORMAL-01',
        baselineIds: ['PB-03'],
        gate: ['G3', 'G8'],
        caseClass: 'normal',
        environment: 'local/staging',
        preconditions: ['local/staging/production env ref 均存在且不含 raw secret 输出'],
        input: { envProfiles: ['local', 'staging', 'production'], forbiddenRawSecrets: ['service_role', 'postgresql://', 'JWT'] },
        steps: ['检查 env ref 分离', '执行 secret scan', '记录 env-file 指纹而非明文'],
        expected: ['仓库与证据中无生产 secret 明文', '环境引用可追溯'],
        failIf: ['raw secret 进入 docs/project-testing', 'staging 与 production ref 混用'],
        evidence: ['secret-leak-scan-summary.json'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB03-FLAG-BOUNDARY-01',
        baselineIds: ['PB-03'],
        gate: ['G5', 'G7', 'G8'],
        caseClass: 'boundary',
        environment: 'local',
        preconditions: ['scheduler/warmup/runtime publication 默认配置可读'],
        input: { flags: ['scheduler', 'warmup', 'runtimePublication'], defaultExpected: 'closed' },
        steps: ['读取默认配置', '无审批 flag 启动服务', '检查后台 job/runtime writer 状态'],
        expected: ['默认不执行生产写入', '只有审批 flag 才允许开启'],
        failIf: ['默认自动开启写 job', 'allowValidate 被解释成 allowWrite'],
        evidence: ['featureFlagStatus', 'schedulerGuardStatus'],
        existingCoverage: ['databasePoolWarmup.test.ts', 'jobRuntime.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB03-CONFIG-EXCEPTION-01',
        baselineIds: ['PB-03'],
        gate: ['G3', 'G7'],
        caseClass: 'exception',
        environment: 'local',
        preconditions: ['可启动缺 DB URL/key ref 的配置检查'],
        input: { missingRefs: ['DATABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY_REF'] },
        steps: ['移除或替换必要 ref', '启动配置检查', '检查失败模式'],
        expected: ['fail closed', '不 fallback 到生产 service role'],
        failIf: ['自动使用生产 secret', '缺配置仍继续运行写链'],
        evidence: ['environmentConfigStatus'],
        existingCoverage: ['databaseConnectionRoleGuard.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB03-SECRET-SECURITY-01',
        baselineIds: ['PB-03', 'PB-06'],
        gate: ['G7', 'G8'],
        caseClass: 'security',
        environment: 'local',
        preconditions: ['secret scan 覆盖 docs、project-testing、deploy/env、logs'],
        input: { forbiddenPatterns: ['postgresql://', 'service_role key', 'anon public key with raw token', 'JWT raw value'] },
        steps: ['扫描发布源码和证据目录', '输出命中列表', '人工确认 false positive'],
        expected: ['无 raw JWT/service role/DB URL/password'],
        failIf: ['任一真实 secret 明文进入仓库证据'],
        evidence: ['secret-leak-scan-summary.json'],
        coverageStatus: 'partial',
      }),
    ],
  },
  {
    baselineId: 'PB-04',
    name: '发布与回滚',
    gates: ['G4', 'G5', 'G7', 'G8'],
    existingCoverage: ['wbsTemplateGenerationService.test.ts', 'wizardGenerationSideEffects.test.ts', 'run-wizard-baseline-revision-staging-contract.test.mjs', 'durationRuntimeOrphanRetirement.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PB04-RELEASE-NORMAL-01',
        baselineIds: ['PB-04'],
        gate: ['G5', 'G8'],
        caseClass: 'normal',
        environment: 'staging',
        preconditions: ['release artifact、approval ref、consumer read path 均存在'],
        input: { artifact: 'runtime publication candidate', approvalRefRequired: true },
        steps: ['发布 runtime publication', '消费者读取新版本', '记录 publication key 和 readback'],
        expected: ['apply 成功', '消费者确实读到新版本'],
        failIf: ['只生成 report 未 apply', '消费者未读回新版本'],
        evidence: ['runtimePublicationStatus', 'c19-runtime-publication-apply.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB04-ROLLBACK-BOUNDARY-01',
        baselineIds: ['PB-04'],
        gate: ['G5', 'G8'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['已发布可回滚版本', 'rollback owner/ref 存在'],
        input: { action: 'rollback-after-publication', expectedPointer: 'previous-version' },
        steps: ['发布新版本', '触发 rollback', '消费者再次读取', '记录 saved outcome'],
        expected: ['消费者读回旧版本', 'version pointer 回退'],
        failIf: ['commandsExecuted=0', '从 canary 直接标 rolled_back', '无消费者读回'],
        evidence: ['rollback-readiness.json', 'c19-runtime-rollback-saved-outcome.json'],
        existingCoverage: [
          'durationLearningRuntimePublicationService.test.ts',
          'durationLearningRuntimeConsumptionService.test.ts',
        ],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB04-RELEASE-EXCEPTION-01',
        baselineIds: ['PB-04'],
        gate: ['G5', 'G7'],
        caseClass: 'exception',
        environment: 'staging',
        preconditions: ['可注入 publication apply 失败'],
        input: { failureMode: 'apply-interrupted' },
        steps: ['注入 apply 中途失败', '读取 saved outcome', '检查消费者版本'],
        expected: ['saved outcome 标失败', '消费者不切到半成品'],
        failIf: ['半成品被消费者使用', '失败被标成功'],
        evidence: ['runtimePublicationStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB04-DESTRUCTIVE-SECURITY-01',
        baselineIds: ['PB-04', 'PB-12'],
        gate: ['G2', 'G7', 'G8'],
        caseClass: 'security',
        environment: 'db',
        preconditions: ['无 approval/rollback 的 destructive action 请求可构造'],
        input: { actions: ['DROP', 'runtime apply'], approvalRef: null, rollbackRef: null },
        steps: ['尝试无审批 destructive action', '检查 guard 结果'],
        expected: ['guard 拒绝', '不产生 DDL 或 runtime 写入'],
        failIf: ['无审批仍执行', '无 rollback ref 仍通过'],
        evidence: ['destructive-action-approval.json'],
        existingCoverage: ['migrationProductionGovernanceService.test.ts'],
        coverageStatus: 'partial',
      }),
    ],
  },
  {
    baselineId: 'PB-05',
    name: '可观测性',
    gates: ['G5', 'G6', 'G8'],
    existingCoverage: ['logger.persistence.test.ts', 'clientErrorsRoute.test.ts', 'performanceReportsRoute.test.ts', 'warningNotificationSyncLiveDiagnostic.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PB05-LOG-NORMAL-01',
        baselineIds: ['PB-05'],
        gate: ['G5', 'G6'],
        caseClass: 'normal',
        environment: 'staging',
        preconditions: ['API/browser smoke 可运行', '日志采集开启'],
        input: { flow: 'api-browser-smoke', fields: ['requestId', 'route', 'status', 'duration'] },
        steps: ['执行 API/browser smoke', '查询日志和 release report', '核对 request id'],
        expected: ['有 request id 和错误采集', 'release report 归档'],
        failIf: ['无 request id', 'console/API 错误未记录'],
        evidence: ['observabilityStatus'],
        existingCoverage: ['logger.persistence.test.ts', 'clientErrorsRoute.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB05-DIAG-BOUNDARY-01',
        baselineIds: ['PB-05'],
        gate: ['G5'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['live diagnostics 命令有 target ids 与 cleanup owner'],
        input: { requiredMetadata: ['command', 'env', 'targetIds', 'cleanupOwner', 'exitCode'] },
        steps: ['执行 diagnostics 或读取证据', '用 validator 检查元数据'],
        expected: ['validator pass', '证据包含 target/cleanup/readback'],
        failIf: ['缺命令、环境或目标 ID', '只用截图/RPA'],
        evidence: ['liveDiagnosticsStatus', 'c18-live-evidence-summary.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB05-OBS-EXCEPTION-01',
        baselineIds: ['PB-05'],
        gate: ['G6', 'G8'],
        caseClass: 'exception',
        environment: 'staging',
        preconditions: ['可触发 API 500 或超时'],
        input: { failureModes: ['500', 'timeout'] },
        steps: ['触发失败请求', '检查错误分类、trace/log ref、前端错误态'],
        expected: ['错误可分类', '不吞错', '用户可感知失败'],
        failIf: ['静默成功', '无 trace/log ref', '错误全变成 unknown'],
        evidence: ['businessContinuityStatus.observability', 'api-error-semantics.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB05-OBS-SECURITY-01',
        baselineIds: ['PB-05', 'PB-06'],
        gate: ['G7', 'G8'],
        caseClass: 'security',
        environment: 'staging/local',
        preconditions: ['日志与 release artifact 可扫描'],
        input: { forbiddenLogFields: ['token', 'service_role', 'postgresql://', 'password'] },
        steps: ['扫描日志与证据目录', '抽样检查错误 payload'],
        expected: ['日志不输出 token/secret/DB URL'],
        failIf: ['任何真实 secret 出现在日志或证据'],
        evidence: ['secret-leak-scan-summary.json'],
        coverageStatus: 'partial',
      }),
    ],
  },
  {
    baselineId: 'PB-06',
    name: '安全',
    gates: ['G2', 'G3', 'G7', 'G8'],
    existingCoverage: ['routeAuthGuard.test.ts', 'publicRlsAuditGuard.test.ts', 'executeSqlGuard.test.ts', 'supabaseAdvisorSecurityCloseoutMigration.test.ts', 'advisorPublicRlsLiveCatalogMigration.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PB06-GUARD-NORMAL-01',
        baselineIds: ['PB-06'],
        gate: ['G1', 'G7'],
        caseClass: 'normal',
        environment: 'local',
        preconditions: ['guard scripts 可运行'],
        input: { commands: ['guard:route-auth', 'guard:public-rls', 'guard:execute-sql'] },
        steps: ['运行 route auth/public RLS/execute SQL guard', '归档 stdout/stderr'],
        expected: ['命令 exitCode=0', '无公开写面或 execute SQL 漏洞'],
        failIf: ['任一 guard 非 0', '缺日志'],
        evidence: ['v1424-command-results.json'],
        existingCoverage: ['routeAuthGuard.test.ts', 'publicRlsAuditGuard.test.ts', 'executeSqlGuard.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB06-ADVISOR-BOUNDARY-01',
        baselineIds: ['PB-06'],
        gate: ['G2', 'G8'],
        caseClass: 'boundary',
        environment: 'db/live',
        preconditions: ['Supabase Advisor UI/API 可复扫并导出'],
        input: { advisorCategory: 'public RLS disabled', afterCatalogMigration: true },
        steps: ['执行 catalog RLS readback', '触发 Supabase Advisor rescan/export', '归档 Advisor 结果'],
        expected: ['public RLS disabled 不再出现', 'advisorStatus 不能只写 catalog pass'],
        failIf: ['无 Advisor export', 'catalog pass 被当 Advisor pass'],
        evidence: ['v1424-advisor-rescan.json'],
        existingCoverage: ['supabaseAdvisorSecurityCloseoutMigration.test.ts', 'advisorPublicRlsLiveCatalogMigration.test.ts'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB06-SEC-EXCEPTION-01',
        baselineIds: ['PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'exception',
        environment: 'staging',
        preconditions: ['可发恶意输入、非法 SQL、越权 route 请求'],
        input: { attacks: ['malicious-input', 'illegal-sql', 'unauthorized-route'] },
        steps: ['逐类攻击请求', '检查状态码和 DB readback'],
        expected: ['返回 4xx', '不 500', '不写库'],
        failIf: ['500', '写入脏数据', '错误泄露 stack/secret'],
        evidence: ['api-error-semantics.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB06-RLS-SECURITY-01',
        baselineIds: ['PB-06', 'PB-01', 'PB-T01'],
        gate: ['G2', 'G3', 'G7'],
        caseClass: 'security',
        environment: 'staging/db',
        preconditions: ['复用 PB01-RLS-MATRIX-01 的角色和租户数据'],
        input: { reusedCaseId: 'PB01-RLS-MATRIX-01', focus: ['anon', 'outsider', 'cross-company'] },
        steps: ['执行 anon/outsider/cross-company 读写矩阵', '记录 DB readback 和 cleanup'],
        expected: ['越权读写全部拒绝', '无跨租户泄露'],
        failIf: ['anon 读写成功', 'outsider 项目读写成功', 'cross-company 返回业务数据'],
        evidence: ['rls-role-matrix.json'],
        existingCoverage: ['workspaceIsolationGuard.test.ts'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-07',
    name: '稳定性',
    gates: ['G3', 'G5', 'G6', 'G7'],
    existingCoverage: ['dbService.optimisticLockMiss.test.ts', 'tasksOptimisticLockRoute.test.ts', 'criticalPathProjectSingleFlight.test.ts', 'wbsTemplateGenerationConcurrencyGuard.test.ts', 'acceptanceStatusConcurrencyLiveDiagnostic.test.ts', 'durationLiveLearning*.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PB07-WRITE-NORMAL-01',
        baselineIds: ['PB-07'],
        gate: ['G3', 'G7'],
        caseClass: 'normal',
        environment: 'staging',
        preconditions: ['写入权限 token', 'disposable company'],
        input: { endpoint: 'POST /api/projects', cleanupRequired: true },
        steps: ['创建项目', 'API 读回', 'DB 读回 membership/snapshot', '删除或归档清理'],
        expected: ['创建成功', '读回一致', 'cleanup 后无孤儿'],
        failIf: ['500', '缺 membership/snapshot', '无法 cleanup'],
        evidence: ['projects-write-readback.json'],
        existingCoverage: ['commercialProjectCreationGuardRoute.test.ts'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB07-IDEMPOTENCY-BOUNDARY-01',
        baselineIds: ['PB-07'],
        gate: ['G3', 'G6'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['可并发或重复提交同一业务请求'],
        input: { scenarios: ['duplicate-submit', 'retry', 'optimistic-lock-conflict'] },
        steps: ['重复提交项目/任务写入', '触发乐观锁冲突', '检查最终状态'],
        expected: ['无重复项目', '后提交冲突失败', '无半状态'],
        failIf: ['重复写', '后提交覆盖前提交', '状态不一致'],
        evidence: ['stabilityStatus'],
        existingCoverage: ['dbService.optimisticLockMiss.test.ts', 'tasksOptimisticLockRoute.test.ts'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB07-FAILURE-EXCEPTION-01',
        baselineIds: ['PB-07'],
        gate: ['G5', 'G7'],
        caseClass: 'exception',
        environment: 'staging',
        preconditions: ['可注入 DB/route failure'],
        input: { failureModes: ['db-timeout', 'route-throw', 'partial-write'] },
        steps: ['注入故障', '执行写链', '运行 compensation/cleanup', 'post-failure readback'],
        expected: ['错误被分类', '补偿/清理成功', '读回无脏数据'],
        failIf: ['脏数据残留', '补偿未执行', '错误静默成功'],
        evidence: ['post-failure-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB07-SCHEDULER-SECURITY-01',
        baselineIds: ['PB-07', 'PB-03'],
        gate: ['G5', 'G7', 'G8'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['无审批启动 scheduler/warmup/runtime publication'],
        input: { approvals: [], attemptedWriters: ['scheduler', 'warmup', 'runtimePublication'] },
        steps: ['无审批触发 writer/job', '检查 guard 和 DB readback'],
        expected: ['未审批不执行生产写入', 'guard 输出 blocked'],
        failIf: ['未审批仍写入', '写入无 owner/rollback'],
        evidence: ['schedulerGuardStatus'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-08',
    name: '容量与性能',
    gates: ['G6', 'G8'],
    existingCoverage: ['companySummaryPressureHarness.test.ts', 'criticalPathSyntheticPressureHarness.test.ts', 'wbsGenerationPressureHarness.test.ts', 'scripts/verify-uiux-performance.mjs', 'scripts/check-client-bundle-budget.mjs'],
    cases: [
      caseRecord({
        caseId: 'PERF-COMPANY-SUMMARY-01',
        baselineIds: ['PB-08'],
        gate: ['G6'],
        caseClass: 'normal',
        caseType: 'pressure',
        environment: 'staging',
        preconditions: ['500 项目 x 200 任务 disposable 租户', 'query log 可采集'],
        input: { endpoint: 'GET /api/company/dashboard/company-summary', projects: 500, tasksPerProject: 200, concurrency: 100, durationSeconds: 60 },
        steps: ['造数', '100 并发压测 60s', '采集 p50/p95/p99 与 query log', 'cleanup'],
        expected: ['P95 < 800ms', 'P99 < 1500ms', '错误率 < 0.1%', '无 500', '连接池不耗尽', 'query 无全表扫'],
        failIf: ['P95/P99 超阈', '出现 500', '连接池打满', '全表扫', '未 cleanup'],
        evidence: ['performanceStatus', 'company-summary-pressure-report.json', 'query-log.json', 'cleanup-report.json'],
        existingCoverage: ['companySummaryPressureHarness.test.ts'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PERF-WRITE-BOUNDARY-01',
        baselineIds: ['PB-08', 'PB-07'],
        gate: ['G6', 'G7'],
        caseClass: 'boundary',
        caseType: 'pressure',
        environment: 'staging',
        preconditions: ['disposable company', '写入权限 token'],
        input: { endpoint: 'POST /api/projects', concurrency: 20, lifecycle: ['create', 'readback', 'delete'] },
        steps: ['20 并发创建项目', '逐项 readback', '删除/cleanup', '检查孤儿行'],
        expected: ['P95 < 1500ms', '错误率 < 0.1%', '无重复项目', '无孤儿 membership/snapshot'],
        failIf: ['500', '重复写', '清理失败', '孤儿行'],
        evidence: ['projects-write-readback.json', 'db-cleanup-report.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PERF-GANTT-LARGE-01',
        baselineIds: ['PB-08', 'PB-T04'],
        gate: ['G6'],
        caseClass: 'exception',
        caseType: 'pressure',
        environment: 'staging',
        preconditions: ['1 个项目 1000 tasks、999 dependencies、关键路径数据'],
        input: { projectShape: { tasks: 1000, dependencies: 999 }, concurrency: 50, durationSeconds: 60, flows: ['open-gantt', 'critical-path-read-refresh'] },
        steps: ['构造大项目', '50 并发打开 Gantt/critical path', '采集 browser trace/API timing/lock log', 'cleanup'],
        expected: ['P95 < 1200ms', '错误率 < 0.1%', '锁等待无失控', 'critical path readback 一致'],
        failIf: ['超阈', '500', '锁等待失控', 'critical path 读回不一致'],
        evidence: ['browserPerformanceStatus', 'db-lock-query-log.json'],
        existingCoverage: ['criticalPathSyntheticPressureHarness.test.ts'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PERF-IMPORT-SECURITY-01',
        baselineIds: ['PB-08', 'PB-06'],
        gate: ['G6', 'G7'],
        caseClass: 'security',
        caseType: 'pressure',
        environment: 'staging',
        preconditions: ['恶意/超大 xlsx/csv 样本', '导入接口可测试'],
        input: { files: ['malicious-xlsx', 'oversized-csv'], concurrency: 'defined-by-import-runner' },
        steps: ['并发导入超大文件', '导入恶意文件', '检查错误分类和 DB readback', 'cleanup'],
        expected: ['安全拒绝或限流', '无未处理异常', '无 DB 脏数据', 'P95 和错误分类归档'],
        failIf: ['500', '未分类错误', '脏数据', '无 query/cleanup'],
        evidence: ['spreadsheet-malicious-file-evidence.json', 'import-pressure-evidence.json'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-09',
    name: '业务闭环',
    gates: ['G3', 'G4', 'G8'],
    existingCoverage: ['workflowNotification*.test.ts', 'acceptanceRoutesLifecycle.test.ts', 'drawingPackage*.test.ts', 'project-materials-routes.test.ts', 'risksRoutesAccess.test.ts', 'browser verify scripts'],
    cases: [
      caseRecord({
        caseId: 'PB09-DRAWING-TASK-NORMAL-01',
        baselineIds: ['PB-09'],
        gate: ['G4'],
        caseClass: 'normal',
        environment: 'local_browser/staging',
        preconditions: ['标准项目含图纸包、图纸版本、关联任务、责任人'],
        input: { flow: 'drawing-package-to-task', entities: ['drawingPackage', 'drawingVersion', 'task', 'owner'] },
        steps: ['打开图纸管理页', '进入一个图纸包详情', '从图纸包跳转到关联任务', '核对责任人和任务状态', '归档截图/console/network'],
        expected: ['图纸包可打开', '图纸版本和关联任务一致', '责任人可解释', '无 console/API P0'],
        failIf: ['图纸白屏', '图纸包无法回到任务', '责任人缺失但仍显示闭环', 'console/API error 未解释'],
        evidence: ['v1424-browser-smoke.json'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB09-PREMILESTONE-TASK-NORMAL-02',
        baselineIds: ['PB-09'],
        gate: ['G4'],
        caseClass: 'normal',
        environment: 'local_browser/staging',
        preconditions: ['标准项目含证照/前置里程碑、关联任务、到期状态'],
        input: { flow: 'permit-premilestone-to-task', entities: ['certificate', 'preMilestone', 'task', 'dueDate'] },
        steps: ['打开证照或前期节点页', '进入一个前置里程碑详情', '跳转到关联任务', '核对到期状态、责任主体和任务进度'],
        expected: ['证照/前置节点可回溯到任务', '到期状态和任务状态一致', '责任主体不丢失'],
        failIf: ['节点只展示孤立记录', '到期状态和任务状态冲突', '责任主体空缺但页面显示正常闭环'],
        evidence: ['v1424-browser-smoke.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-ACCEPTANCE-TASK-NORMAL-03',
        baselineIds: ['PB-09'],
        gate: ['G4'],
        caseClass: 'normal',
        environment: 'local_browser/staging',
        preconditions: ['标准项目含验收节点、验收资料、关联任务、责任人'],
        input: { flow: 'acceptance-node-to-task', entities: ['acceptanceNode', 'acceptanceRecord', 'task', 'owner'] },
        steps: ['打开验收流程页', '进入一个验收节点', '查看验收资料和关联任务', '核对任务完成状态与验收状态'],
        expected: ['验收节点能解释到任务和资料', '任务完成状态与验收状态不矛盾', '责任人可见'],
        failIf: ['验收记录孤立', '任务未完成但验收显示已闭环且无解释', '资料缺失但状态显示完成'],
        evidence: ['v1424-browser-smoke.json', 'acceptance-readback-evidence.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-MATERIAL-TASK-NORMAL-04',
        baselineIds: ['PB-09'],
        gate: ['G4'],
        caseClass: 'normal',
        environment: 'local_browser/staging',
        preconditions: ['标准项目含材料计划、到货记录、短缺记录、关联施工任务'],
        input: { flow: 'material-arrival-shortage-to-task', entities: ['materialPlan', 'arrivalRecord', 'shortage', 'task'] },
        steps: ['打开材料页', '选择有到货和短缺状态的材料项', '跳转关联任务', '核对材料状态对任务风险/进度的影响'],
        expected: ['材料到货/短缺能回到任务链', '短缺状态能解释任务风险或进度偏差', '无重复或孤立材料记录'],
        failIf: ['材料记录不能关联任务', '短缺不影响任何任务或风险解释', '重复到货导致指标异常'],
        evidence: ['v1424-browser-smoke.json', 'material-readback-evidence.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-RISK-NOTIFICATION-TASK-NORMAL-05',
        baselineIds: ['PB-09'],
        gate: ['G4'],
        caseClass: 'normal',
        environment: 'local_browser/staging',
        preconditions: ['标准项目含风险、问题、通知、关联任务、责任主体'],
        input: { flow: 'risk-issue-notification-to-task', entities: ['risk', 'issue', 'notification', 'task', 'assignee'] },
        steps: ['打开风险或问题页', '进入一个活跃风险/问题', '检查通知记录', '跳转关联任务和责任主体'],
        expected: ['风险/问题能解释到任务和责任人', '通知对象与责任主体一致', '关闭状态有回读依据'],
        failIf: ['风险/问题孤立', '通知对象错误', '关闭状态无任务或回读依据'],
        evidence: ['v1424-browser-smoke.json', 'risk-notification-readback-evidence.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-REPORT-EXPORT-TASK-NORMAL-06',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'normal',
        environment: 'local_browser/staging',
        preconditions: ['标准项目含图纸、证照、验收、材料、风险/问题和任务链数据', '报表和导出入口可访问'],
        input: { flow: 'business-report-export-to-task-chain', entities: ['report', 'exportFile', 'task', 'owner', 'businessRecord'] },
        steps: ['打开报表页并筛选测试项目', '导出业务链报表', '核对导出文件中的任务、责任人和业务对象 ID', '通过 API/DB readback 校验导出行与任务链一致'],
        expected: ['报表和导出数据能回到任务与责任人链路', '导出行不丢失图纸/证照/验收/材料/风险关键字段', '导出行数与 readback 一致'],
        failIf: ['报表只展示孤立统计', '导出缺任务或责任人字段', '导出行数和 readback 不一致', '导出混入无权限数据'],
        evidence: ['business-report-export-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-EMPTY-PROJECT-BOUNDARY-01',
        baselineIds: ['PB-09'],
        gate: ['G4'],
        caseClass: 'boundary',
        environment: 'local_browser',
        preconditions: ['空项目/空月计划/无数据状态可进入'],
        input: { states: ['empty-project', 'empty-monthly-plan', 'no-risk', 'no-material'] },
        steps: ['进入空态页面', '检查 loading/empty/error 文案和主指标'],
        expected: ['不白屏', '有空态', '不伪造指标'],
        failIf: ['白屏', '假造 100%/0 风险等主指标', '文字溢出'],
        evidence: ['v1424-browser-smoke.json'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB09-EMPTY-MONTHLY-BOUNDARY-02',
        baselineIds: ['PB-09'],
        gate: ['G4'],
        caseClass: 'boundary',
        environment: 'local_browser/staging',
        preconditions: ['项目存在，但当前月份没有月计划或任务载体'],
        input: { state: 'empty-monthly-plan', month: 'test-month-without-plan' },
        steps: ['切换到无月计划月份', '打开驾驶舱、任务、材料、风险相关入口', '检查主指标和空态跳转'],
        expected: ['页面给出空态或创建入口', '主指标不伪造完成率', '跨页状态一致'],
        failIf: ['无月计划仍显示完成闭环', '主指标互相矛盾', '页面卡死或无限 loading'],
        evidence: ['empty-monthly-plan-browser-evidence.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-ORPHAN-LINK-BOUNDARY-03',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['测试库存在业务项缺少 task_id 或 task_id 已失效的边界样本'],
        input: { state: 'orphan-business-record', records: ['drawingPackage', 'materialItem', 'risk'] },
        steps: ['读取孤立业务项', '打开详情页', '尝试跳转任务链', '执行 DB readback 校验'],
        expected: ['页面明确显示未关联/待补齐', '不把孤立项计入已闭环', 'readback 能定位孤立行'],
        failIf: ['孤立项被算作闭环', '跳转到错误任务', 'readback 无法定位异常行'],
        evidence: ['business-orphan-link-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-MISSING-OWNER-BOUNDARY-04',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['测试库存在任务有关联业务项但缺责任人的边界样本'],
        input: { state: 'missing-owner', entities: ['task', 'acceptanceNode', 'risk'] },
        steps: ['打开缺责任人的业务项', '检查责任主体展示', '检查是否阻断闭环状态', '执行 readback'],
        expected: ['缺责任人被标成待补齐或阻断', '不允许显示责任闭环', 'readback 能返回缺失字段'],
        failIf: ['缺责任人仍显示闭环', '自动填充错误责任人', '缺失字段被前端吞掉'],
        evidence: ['business-missing-owner-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-NO-DEPENDENT-DATA-BOUNDARY-05',
        baselineIds: ['PB-09'],
        gate: ['G4'],
        caseClass: 'boundary',
        environment: 'local_browser/staging',
        preconditions: ['项目有任务链，但无图纸/证照/材料/风险/验收附属数据'],
        input: { state: 'task-only-project', dependentDomains: ['drawings', 'certificates', 'materials', 'risks', 'acceptance'] },
        steps: ['打开业务闭环相关页面', '检查任务链仍可用', '检查附属域空态和指标'],
        expected: ['任务链可用', '附属域显示真实空态', '不因无附属数据产生错误闭环或红屏'],
        failIf: ['无附属数据导致主任务链不可用', '显示假数据', '页面红屏'],
        evidence: ['task-only-business-boundary-evidence.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-BULK-IMPORT-LINK-BOUNDARY-06',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['可导入 disposable 图纸/材料/验收/风险业务记录', '导入样本含重复行、缺 task_id 行和合法 task_id 行'],
        input: { state: 'bulk-import-mixed-link-quality', records: ['valid-task-link', 'duplicate-business-row', 'missing-task-id'] },
        steps: ['导入混合质量样本', '检查合法行是否关联任务链', '检查重复/缺 task_id 行的处理状态', '执行 post-import readback 和 cleanup'],
        expected: ['合法行进入任务链', '重复或缺 task_id 行被标记待处理或拒绝', '不能把缺链路导入结果算成业务闭环'],
        failIf: ['缺 task_id 行被算作闭环', '重复行污染任务指标', '导入后无法 cleanup', '错误行导致整页白屏'],
        evidence: ['business-import-link-boundary-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-DRAWING-API-EXCEPTION-01',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'exception',
        environment: 'staging/browser',
        preconditions: ['可让图纸 API 返回 500/timeout'],
        input: { failureTarget: 'drawings-api', response: '500-or-timeout' },
        steps: ['注入图纸 API 失败', '打开图纸页和关联任务页', '观察 toast/error state', '检查 DB 无新增脏状态'],
        expected: ['用户可感知失败', '不静默成功', '任务链不被错误改写'],
        failIf: ['失败仍显示成功', '无 toast/error', '图纸失败污染任务状态', '前端崩溃'],
        evidence: ['api-error-semantics.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-MATERIAL-API-EXCEPTION-02',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'exception',
        environment: 'staging/browser',
        preconditions: ['可让材料 API 返回 500/timeout'],
        input: { failureTarget: 'materials-api', response: '500-or-timeout' },
        steps: ['注入材料 API 失败', '打开材料页和任务详情', '尝试材料状态更新', '执行 readback'],
        expected: ['失败有可见错误', '材料状态未被错误写入', '关联任务进度不被污染'],
        failIf: ['失败仍 toast 成功', '产生材料脏写', '任务进度被错误推进'],
        evidence: ['api-error-semantics.json', 'material-exception-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-ACCEPTANCE-API-EXCEPTION-03',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'exception',
        environment: 'staging/browser',
        preconditions: ['可让验收 API 返回 500/timeout'],
        input: { failureTarget: 'acceptance-api', response: '500-or-timeout' },
        steps: ['注入验收 API 失败', '尝试提交验收动作', '检查 UI 状态和 DB readback'],
        expected: ['失败不被显示为验收完成', '验收资料和任务状态保持原值', '错误分类可归档'],
        failIf: ['验收失败仍标完成', '产生半写入', '任务状态被推进'],
        evidence: ['api-error-semantics.json', 'acceptance-exception-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-RISK-API-EXCEPTION-04',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'exception',
        environment: 'staging/browser',
        preconditions: ['可让风险/问题 API 返回 500/timeout'],
        input: { failureTarget: 'risk-issue-api', response: '500-or-timeout' },
        steps: ['注入风险 API 失败', '尝试关闭风险或问题', '检查通知和任务链状态', '执行 readback'],
        expected: ['风险关闭失败可见', '通知不误发成功', '任务链不被错误标闭环'],
        failIf: ['失败仍关闭风险', '误发成功通知', '任务链被污染'],
        evidence: ['api-error-semantics.json', 'risk-exception-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-NOTIFICATION-PARTIAL-EXCEPTION-05',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'exception',
        environment: 'staging/browser',
        preconditions: ['可制造业务写成功但通知写失败或任务链 readback 失败的部分失败场景'],
        input: { failureTarget: 'notification-or-readback-partial-failure', consistency: 'business-write-vs-notification' },
        steps: ['触发业务闭环动作', '让通知或 readback 返回失败', '检查用户反馈、重试语义和 DB 状态'],
        expected: ['部分失败被明确提示', '不会把整条链路标为完全成功', 'DB 状态可解释且可重试'],
        failIf: ['部分失败显示全成功', '状态无法回读', '重复重试产生重复通知或重复闭环'],
        evidence: ['partial-failure-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-REPORT-EXPORT-EXCEPTION-06',
        baselineIds: ['PB-09'],
        gate: ['G3', 'G4'],
        caseClass: 'exception',
        environment: 'staging/browser',
        preconditions: ['可让报表查询或导出任务返回 500/timeout/partial-file'],
        input: { failureTarget: 'report-export-api', response: '500-timeout-or-partial-file' },
        steps: ['注入报表或导出失败', '触发业务链报表查询或导出', '检查 UI 错误、文件生成状态和 DB readback', '清理部分文件或导出任务'],
        expected: ['失败可见且不生成假成功文件', '导出任务状态明确失败或可重试', '任务链和业务记录状态不被错误推进'],
        failIf: ['导出失败仍显示成功', '生成空文件/半文件却标完成', '任务链状态被污染', '部分文件无清理记录'],
        evidence: ['business-report-export-exception-readback.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-ACTION-SECURITY-01',
        baselineIds: ['PB-09', 'PB-01', 'PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['outsider/anon token 或无 token 可用'],
        input: { roles: ['outsider', 'anon'], actions: ['business-chain-write', 'main-action-trigger'] },
        steps: ['outsider/anon 触发主链动作', '检查响应和 DB readback'],
        expected: ['请求拒绝', '不写库'],
        failIf: ['越权动作成功', '产生业务行'],
        evidence: ['rls-role-matrix.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-CROSS-TENANT-DRAWING-SECURITY-02',
        baselineIds: ['PB-09', 'PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['至少两个租户，各有图纸包和任务链'],
        input: { roles: ['owner', 'admin', 'editor', 'outsider', 'anon'], action: 'read-foreign-drawing-package' },
        steps: ['使用本租户 token 读取外租户图纸包', '通过图纸详情页和直接 API 分别尝试', '检查响应和日志'],
        expected: ['外租户图纸包不可读', '详情页不泄漏任务/责任人', 'API 返回 401/403/404 且无数据体'],
        failIf: ['跨租户读取成功', '错误响应含外租户业务字段', '前端缓存泄漏外租户图纸'],
        evidence: ['rls-role-matrix.json', 'cross-tenant-drawing-evidence.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-CROSS-TENANT-MATERIAL-RISK-SECURITY-03',
        baselineIds: ['PB-09', 'PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['至少两个租户，各有材料、风险/问题、任务链'],
        input: { roles: ['owner', 'admin', 'editor', 'outsider'], actions: ['read-foreign-material', 'read-foreign-risk', 'close-foreign-risk'] },
        steps: ['读取外租户材料记录', '读取外租户风险记录', '尝试关闭外租户风险', '执行 DB readback'],
        expected: ['跨租户读写均拒绝', '不产生通知或状态变更', 'readback 无外租户泄漏'],
        failIf: ['跨租户材料/风险可读', '外租户风险被关闭', '产生跨租户通知'],
        evidence: ['rls-role-matrix.json', 'cross-tenant-material-risk-evidence.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-EXPORT-DETAIL-LEAK-SECURITY-04',
        baselineIds: ['PB-09', 'PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['导出/详情接口可访问，存在外租户图纸/证照/材料/风险数据'],
        input: { actions: ['export-business-chain', 'open-detail-with-foreign-id'], ids: ['foreign-task-id', 'foreign-business-record-id'] },
        steps: ['使用本租户 token 请求导出', '在详情接口传外租户 id', '检查导出文件和响应体'],
        expected: ['导出只含本租户数据', '外租户详情请求拒绝', '文件和错误体不含外租户字段'],
        failIf: ['导出混入外租户数据', '外租户详情可打开', '错误体泄漏业务字段'],
        evidence: ['business-export-security-evidence.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-IMPORT-FOREIGN-TASK-SECURITY-05',
        baselineIds: ['PB-09', 'PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['存在外租户 task_id', '业务导入接口可调用', '导入样本可包含图纸/材料/验收/风险关联行'],
        input: { action: 'business-import-with-foreign-task-id', payloads: ['drawing-import-row', 'material-import-row', 'acceptance-import-row', 'risk-import-row'] },
        steps: ['构造带外租户 task_id 的导入文件', '使用本租户 token 调用导入', '检查导入响应、错误行和 DB readback', '确认无跨租户通知或导出残留'],
        expected: ['所有外租户 task_id 导入行均拒绝', '合法本租户行与拒绝行边界清晰', '无跨租户写入、通知或导出残留'],
        failIf: ['任一外租户行导入成功', '出现半写入', '拒绝响应泄漏外租户字段', 'cleanup/readback 缺失'],
        evidence: ['business-import-foreign-task-security-evidence.json', 'rls-role-matrix.json'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB09-FOREIGN-TASK-WRITE-SECURITY-06',
        baselineIds: ['PB-09', 'PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['存在外租户 task_id，业务闭环写接口可调用'],
        input: { action: 'business-chain-write-with-foreign-task-id', payloads: ['drawing-link', 'material-status', 'acceptance-closeout', 'risk-closeout'] },
        steps: ['构造外租户 task_id 的业务写请求', '分别命中图纸/材料/验收/风险写路径', '检查响应和 DB readback'],
        expected: ['所有外租户 task_id 写入均拒绝', '无半写入', '无跨租户通知'],
        failIf: ['任一写入成功', '产生半写入', '通知发到外租户或错误用户'],
        evidence: ['foreign-task-write-security-evidence.json', 'rls-role-matrix.json'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-10',
    name: '运维与支持',
    gates: ['G7', 'G8'],
    existingCoverage: ['generate-release-handoff-pack.test.mjs', 'check-release-handoff-readiness.test.mjs', 'validate-release-evidence.test.mjs', 'evaluate-release-closeout.test.mjs'],
    cases: [
      caseRecord({
        caseId: 'PB10-HANDOFF-NORMAL-01',
        baselineIds: ['PB-10'],
        gate: ['G7', 'G8'],
        caseClass: 'normal',
        environment: 'local',
        preconditions: ['release handoff 工具可运行'],
        input: { tools: ['generate-release-handoff-pack', 'check-release-handoff-readiness', 'validate-release-evidence'] },
        steps: ['生成 handoff pack', '运行 readiness checker', '检查缺字段拒绝'],
        expected: ['工具可生成', '缺字段会 fail closed'],
        failIf: ['缺 owner/rollback 仍 pass', 'raw secret 被写入 handoff'],
        evidence: ['handoff-plan.json', 'handoff-readiness.json'],
        existingCoverage: ['generate-release-handoff-pack.test.mjs', 'check-release-handoff-readiness.test.mjs'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB10-RUNBOOK-BOUNDARY-01',
        baselineIds: ['PB-10'],
        gate: ['G7', 'G8'],
        caseClass: 'boundary',
        environment: 'local',
        preconditions: ['构造缺 owner/rollback/artifact root 的 handoff 文件'],
        input: { missingFields: ['owner', 'rollbackRef', 'artifactRoot', 'dbReadyRef'] },
        steps: ['运行 handoff readiness checker', '读取 blocked 原因'],
        expected: ['状态 blocked', '缺什么字段说清楚'],
        failIf: ['缺字段仍 ready', '错误不具体'],
        evidence: ['operationsSupportStatus', 'handoff-readiness.json'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB10-REPAIR-EXCEPTION-01',
        baselineIds: ['PB-10'],
        gate: ['G7'],
        caseClass: 'exception',
        environment: 'staging/db',
        preconditions: ['手动修复/补偿工具有 dry-run 和 execute 模式'],
        input: { modes: ['dry-run', 'execute'], approvalRequiredFor: 'execute' },
        steps: ['运行 dry-run', '无审批运行 execute', '有审批运行受控 execute 并 readback'],
        expected: ['dry-run 无写入', '无审批 execute 被拒绝', '有审批 execute 有 readback/rollback'],
        failIf: ['dry-run 写库', '无审批 execute 成功', '无 readback/rollback'],
        evidence: ['manualRepairToolStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB10-OPS-SECURITY-01',
        baselineIds: ['PB-10', 'PB-01', 'PB-06'],
        gate: ['G7'],
        caseClass: 'security',
        environment: 'local/staging',
        preconditions: ['非管理员 token 和管理员入口可用'],
        input: { roles: ['outsider', 'editor', 'anon'], surfaces: ['admin', 'governance-workbench'] },
        steps: ['非管理员访问治理/后台入口', '检查响应与审计'],
        expected: ['403 或未授权提示', '无敏感数据泄露'],
        failIf: ['非管理员进入后台', '跨租户治理数据可见'],
        evidence: ['tenant-access-matrix.json'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-11',
    name: '测试体系',
    gates: ['G1', 'G8'],
    existingCoverage: ['release dashboard tests', 'Vitest suites', 'UIUX scripts', 'v1.4.24 matrix'],
    cases: [
      caseRecord({
        caseId: 'PB11-CASEMAP-NORMAL-01',
        baselineIds: ['PB-11'],
        gate: ['G8'],
        caseClass: 'normal',
        environment: 'local',
        preconditions: ['v1.4.24 方案存在', '用例台账生成器可运行'],
        input: { requiredArtifacts: ['v1424-test-case-matrix.json', 'v1424-baseline-test-coverage-map.json', 'v1424-false-green-audit.json'] },
        steps: ['生成三份台账/审计产物', '校验 PB 行无缺失'],
        expected: ['PB-01 至 PB-12、PB-T01 至 PB-T04 均有四类用例'],
        failIf: ['任一基线缺行', '任一用例缺输入/预期'],
        evidence: ['v1424-test-case-matrix.json', 'v1424-baseline-test-coverage-map.json', 'v1424-false-green-audit.json'],
        coverageStatus: 'covered',
        productionBranchCovered: true,
      }),
      caseRecord({
        caseId: 'PB11-COVERAGE-BOUNDARY-01',
        baselineIds: ['PB-11'],
        gate: ['G8'],
        caseClass: 'boundary',
        environment: 'local',
        preconditions: ['覆盖映射生成完成'],
        input: { requiredBaselines: ['PB-01..PB-12', 'PB-T01..PB-T04'] },
        steps: ['读取 baseline coverage map', '检查每个基线的 caseClass 覆盖'],
        expected: ['无 missing baseline', '缺 live/db 的行不能标 pass'],
        failIf: ['任一 PB 无用例或无映射', 'partial 被当 production-ready'],
        evidence: ['v1424-baseline-test-coverage-map.json'],
        coverageStatus: 'covered',
        productionBranchCovered: true,
      }),
      caseRecord({
        caseId: 'PB11-FAIL-EXCEPTION-01',
        baselineIds: ['PB-11'],
        gate: ['G1', 'G8'],
        caseClass: 'exception',
        environment: 'local',
        preconditions: ['命令结果归档可读'],
        input: { commandResultFields: ['command', 'exitCode', 'stdoutPath', 'stderrPath'] },
        steps: ['读取 v1424-command-results', '检查失败命令和缺日志项'],
        expected: ['失败命令为 invalid-evidence 或待修复', '缺 stdout/stderr 不算 pass'],
        failIf: ['命令失败仍 pass', '缺日志仍 pass'],
        evidence: ['v1424-command-results.json'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB11-FAKEGREEN-SECURITY-01',
        baselineIds: ['PB-11'],
        gate: ['G8'],
        caseClass: 'security',
        environment: 'local',
        preconditions: ['现有 516+ 测试和脚本可扫描'],
        input: { suspectPatterns: ['skip/only', 'mock-api', 'auth mock', 'DISABLE_PERMISSION_SYSTEM', 'dryRun', 'commandsExecuted=0', 'operator://current-thread', 'candidate-only'] },
        steps: ['扫描测试和脚本', '输出 suspect-fake-green/supporting-only', '禁止其关闭生产 gate'],
        expected: ['假绿规则有命中则进入审计，不得关闭 P0/P1'],
        failIf: ['skip/mock/dry-run 被算 pass', '无假绿审计产物'],
        evidence: ['v1424-false-green-audit.json'],
        coverageStatus: 'covered',
        productionBranchCovered: true,
      }),
    ],
  },
  {
    baselineId: 'PB-12',
    name: '合规与治理',
    gates: ['G1', 'G7', 'G8'],
    existingCoverage: ['auditLogger.test.ts', 'dataRetentionService.test.ts', 'deletionRetention*.test.ts', 'metricSsotGuard.test.ts', 'frontendBiAggregationGuard.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PB12-AUDIT-NORMAL-01',
        baselineIds: ['PB-12'],
        gate: ['G7', 'G8'],
        caseClass: 'normal',
        environment: 'staging/local',
        preconditions: ['审计、删除保留、指标口径服务可测试'],
        input: { surfaces: ['audit', 'retention', 'metricRegistry'] },
        steps: ['触发敏感操作', '读取审计记录', '运行 metric/retention guard'],
        expected: ['操作留痕', '删除保留策略可读', '指标口径单一出口'],
        failIf: ['无审计', 'route 临时聚合主指标', '删除无保留边界'],
        evidence: ['governanceStatus'],
        existingCoverage: ['auditLogger.test.ts', 'dataRetentionService.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB12-RETENTION-BOUNDARY-01',
        baselineIds: ['PB-12'],
        gate: ['G7'],
        caseClass: 'boundary',
        environment: 'staging/db',
        preconditions: ['disposable 数据可删除/归档'],
        input: { actions: ['delete', 'archive'], readback: true },
        steps: ['执行删除/归档', '读取保留策略结果', '检查恢复/审计引用'],
        expected: ['保留策略符合预期', 'readback 可证明'],
        failIf: ['硬删缺审计', '归档后跨租户可见'],
        evidence: ['dataRetentionStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PB12-GOV-EXCEPTION-01',
        baselineIds: ['PB-12'],
        gate: ['G1', 'G8'],
        caseClass: 'exception',
        environment: 'local/staging',
        preconditions: ['metricRegistry/route aggregation guard 可运行'],
        input: { antiPatterns: ['route reduce main metric', 'frontend main metric aggregation', 'unregistered metric'] },
        steps: ['运行 metric governance guards', '检查 route/frontend 临时聚合'],
        expected: ['发现未注册口径时 guard fail'],
        failIf: ['未注册主指标通过', '前端自行聚合主指标'],
        evidence: ['metricGovernanceStatus'],
        existingCoverage: ['metricSsotGuard.test.ts', 'frontendBiAggregationGuard.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PB12-AUDIT-SECURITY-01',
        baselineIds: ['PB-12', 'PB-06'],
        gate: ['G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['敏感操作和跨租户审计可测试'],
        input: { checks: ['redaction', 'cross-tenant-audit-isolation'] },
        steps: ['触发敏感操作', '跨租户读取审计', '扫描脱敏字段'],
        expected: ['敏感字段脱敏', '跨租户审计不可见'],
        failIf: ['secret 泄露', '跨租户审计可读'],
        evidence: ['auditStatus'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-T01',
    name: 'ToB/SaaS',
    gates: ['G1', 'G3', 'G7', 'G8'],
    existingCoverage: ['commercialFoundationService.test.ts', 'commercialProjectCreationGuardRoute.test.ts', 'workspaceIsolation*.test.ts', 'companyProjectTemplates*.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PBT01-TENANT-NORMAL-01',
        baselineIds: ['PB-T01'],
        gate: ['G3', 'G7'],
        caseClass: 'normal',
        environment: 'staging',
        preconditions: ['至少两个 company 和各自项目'],
        input: { roles: ['owner', 'company_admin'], views: ['project-list', 'company-cockpit'] },
        steps: ['登录 A 公司用户', '读取项目列表和公司驾驶舱', '切换 B 公司目标 ID 请求'],
        expected: ['只显示本租户数据', '跨租户拒绝'],
        failIf: ['看到其他公司项目', 'company summary 串租户'],
        evidence: ['tenantIsolationStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PBT01-QUOTA-BOUNDARY-01',
        baselineIds: ['PB-T01'],
        gate: ['G1', 'G7'],
        caseClass: 'boundary',
        environment: 'staging/local',
        preconditions: ['套餐/配额边界可配置'],
        input: { quotaStates: ['at-limit', 'over-limit', 'no-plan'] },
        steps: ['设置配额边界', '尝试创建项目或消耗配额', '检查提示和计数'],
        expected: ['边界触发明确提示', '不绕过准入'],
        failIf: ['超额仍写入', '失败但消耗配额'],
        evidence: ['commercialReadinessStatus'],
        existingCoverage: ['commercialFoundationService.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PBT01-COMM-EXCEPTION-01',
        baselineIds: ['PB-T01'],
        gate: ['G3', 'G7'],
        caseClass: 'exception',
        environment: 'staging',
        preconditions: ['可模拟租户准入失败'],
        input: { failureMode: 'tenant-admission-denied', action: 'create-project' },
        steps: ['触发准入失败', '检查项目和配额 readback'],
        expected: ['不创建项目', '不消耗配额'],
        failIf: ['项目创建成功', '配额被扣减'],
        evidence: ['usageQuotaStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PBT01-CROSS-SECURITY-01',
        baselineIds: ['PB-T01', 'PB-01', 'PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['复用 PB01-RLS-MATRIX-01 跨租户数据'],
        input: { reusedCaseId: 'PB01-RLS-MATRIX-01', focus: 'cross-tenant read/write' },
        steps: ['执行跨租户读写矩阵', 'DB readback'],
        expected: ['跨租户读写拒绝'],
        failIf: ['跨租户读写成功'],
        evidence: ['rls-role-matrix.json'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-T02',
    name: '强流程系统',
    gates: ['G3', 'G5', 'G7', 'G8'],
    existingCoverage: ['baselineGovernanceService.test.ts', 'monthlyPlan*.test.ts', 'tasksCommitRoute.test.ts', 'workflowDomainPolicy.test.ts', 'runtime publication tests'],
    cases: [
      caseRecord({
        caseId: 'PBT02-WORKFLOW-NORMAL-01',
        baselineIds: ['PB-T02'],
        gate: ['G3', 'G5'],
        caseClass: 'normal',
        environment: 'staging',
        preconditions: ['草稿、发布、确认、回滚链路可执行'],
        input: { lifecycle: ['draft', 'publish', 'confirm', 'rollback'] },
        steps: ['创建草稿', '发布', '确认', '回滚', '读取状态机'],
        expected: ['状态合法转换', '回滚后读回一致'],
        failIf: ['跳过审批', '非法状态转换', '回滚无效'],
        evidence: ['workflowStateStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PBT02-LOCK-BOUNDARY-01',
        baselineIds: ['PB-T02'],
        gate: ['G3', 'G6'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['可并发编辑同一草稿'],
        input: { conflict: 'draft-lock-or-optimistic-lock' },
        steps: ['两个会话同时编辑', '先后提交', '检查最终状态'],
        expected: ['后提交者失败且无覆盖'],
        failIf: ['后提交覆盖前提交', '冲突未提示'],
        evidence: ['draftLockStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PBT02-FLOW-EXCEPTION-01',
        baselineIds: ['PB-T02'],
        gate: ['G5', 'G7'],
        caseClass: 'exception',
        environment: 'staging',
        preconditions: ['可注入发布中失败'],
        input: { failureMode: 'publish-interrupted' },
        steps: ['发布中注入失败', '读取状态和 saved outcome'],
        expected: ['不进入 confirmed/published 假状态'],
        failIf: ['失败后状态标 confirmed/published'],
        evidence: ['approvalRollbackStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PBT02-APPROVAL-SECURITY-01',
        baselineIds: ['PB-T02', 'PB-04'],
        gate: ['G5', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['无审批 runtime publication/apply 请求可构造'],
        input: { action: 'runtime publication/apply', approvalRef: null },
        steps: ['无审批触发 apply', '检查 guard 和 DB readback'],
        expected: ['guard 拒绝', '不写入 published runtime'],
        failIf: ['无审批仍发布'],
        evidence: ['destructive-action-approval.json'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-T03',
    name: '数据型产品',
    gates: ['G1', 'G3', 'G4', 'G8'],
    existingCoverage: ['projectExecutionSummary.test.ts', 'projectDailySnapshotService.test.ts', 'metricRegistry.test.ts', 'metricSsotGuard.test.ts', 'frontendBiAggregationGuard.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PBT03-SSOT-NORMAL-01',
        baselineIds: ['PB-T03'],
        gate: ['G1', 'G4'],
        caseClass: 'normal',
        environment: 'local/staging',
        preconditions: ['Dashboard/Reports/CompanyCockpit 主指标可读取'],
        input: { pages: ['Dashboard', 'Reports', 'CompanyCockpit'], sources: ['summary', 'snapshot', 'metricRegistry'] },
        steps: ['读取主指标 API', '检查前端消费路径', '运行 BI SSOT guard'],
        expected: ['主指标来自 summary/snapshot/metricRegistry'],
        failIf: ['route/frontend 临时 reduce 主指标'],
        evidence: ['biSsotStatus'],
        existingCoverage: ['projectExecutionSummary.test.ts', 'projectDailySnapshotService.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PBT03-SNAPSHOT-BOUNDARY-01',
        baselineIds: ['PB-T03'],
        gate: ['G3', 'G8'],
        caseClass: 'boundary',
        environment: 'staging',
        preconditions: ['可构造缺快照项目'],
        input: { state: 'snapshot-missing' },
        steps: ['打开趋势/历史页面', '读取 fallback payload', '检查 UI 文案'],
        expected: ['fallback 可解释', '不伪造趋势'],
        failIf: ['缺快照仍显示虚假趋势', '白屏'],
        evidence: ['snapshotLineageStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PBT03-BI-EXCEPTION-01',
        baselineIds: ['PB-T03', 'PB-12'],
        gate: ['G1', 'G8'],
        caseClass: 'exception',
        environment: 'local',
        preconditions: ['metricRegistry/frontend aggregation guard 可运行'],
        input: { antiPatterns: ['route .reduce()', 'frontend .filter().length for main metric'] },
        steps: ['运行 guard', '扫描主指标临时聚合'],
        expected: ['临时聚合触发 guard fail'],
        failIf: ['临时聚合通过'],
        evidence: ['metricRegistryStatus'],
        existingCoverage: ['metricSsotGuard.test.ts', 'frontendBiAggregationGuard.test.ts'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PBT03-EXPORT-SECURITY-01',
        baselineIds: ['PB-T03', 'PB-06'],
        gate: ['G3', 'G7'],
        caseClass: 'security',
        environment: 'staging',
        preconditions: ['导出接口和跨租户测试数据可用'],
        input: { roles: ['authorized', 'unauthorized', 'cross-tenant'], action: 'export' },
        steps: ['授权导出', '无权限导出', '跨租户导出', '检查文件内容'],
        expected: ['授权成功', '无权限 403', '不泄露跨租户数据'],
        failIf: ['越权导出成功', '文件含跨租户数据'],
        evidence: ['export-security-evidence.json'],
        coverageStatus: 'missing-live',
      }),
    ],
  },
  {
    baselineId: 'PB-T04',
    name: '工程行业产品',
    gates: ['G1', 'G3', 'G5', 'G8'],
    existingCoverage: ['wbsTemplate*.test.ts', 'criticalPath*.test.ts', 'preMilestones*.test.ts', 'drawing*.test.ts', 'material*.test.ts', 'risk*.test.ts'],
    cases: [
      caseRecord({
        caseId: 'PBT04-WBS-NORMAL-01',
        baselineIds: ['PB-T04'],
        gate: ['G1', 'G3'],
        caseClass: 'normal',
        environment: 'staging/local',
        preconditions: ['WBS/关键路径/工期经验/材料/证照/风险链路可读取'],
        input: { domainChains: ['WBS', 'critical-path', 'duration', 'materials', 'certificates', 'risks'] },
        steps: ['执行工程主链 smoke', '检查每条链路回到任务计划'],
        expected: ['工程域对象连到任务计划链'],
        failIf: ['链路断裂', '候选数据冒充生产事实'],
        evidence: ['engineeringDomainStatus'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PBT04-SCOPE-BOUNDARY-01',
        baselineIds: ['PB-T04'],
        gate: ['G2', 'G8'],
        caseClass: 'boundary',
        environment: 'local/staging',
        preconditions: ['final range-tree 和旧 scope 兼容适配均可检查'],
        input: { authoritativeLevels: ['phase', 'section', 'building', 'basement', 'floor', 'physical_zone', 'functional_area'], legacyEndpoint: '/api/scope-dimensions' },
        steps: ['读取 final range-tree', '访问旧 scope 兼容接口', '检查写入路径'],
        expected: ['旧 scope 只兼容读', '不回写生产事实'],
        failIf: ['旧 scope 被重新作为生产事实源', '旧接口可写'],
        evidence: ['wbsStatus'],
        coverageStatus: 'partial',
      }),
      caseRecord({
        caseId: 'PBT04-DOMAIN-EXCEPTION-01',
        baselineIds: ['PB-T04'],
        gate: ['G3', 'G5'],
        caseClass: 'exception',
        environment: 'staging',
        preconditions: ['可注入工程对象/关键路径生成失败'],
        input: { failureModes: ['engineering-object-generation-fail', 'critical-path-generation-fail'] },
        steps: ['触发生成失败', '检查 compensation/readback'],
        expected: ['有补偿和 readback', '不留下半链'],
        failIf: ['半链残留', '错误无补偿'],
        evidence: ['criticalPathStatus'],
        coverageStatus: 'missing-live',
      }),
      caseRecord({
        caseId: 'PBT04-CANDIDATE-SECURITY-01',
        baselineIds: ['PB-T04'],
        gate: ['G5', 'G8'],
        caseClass: 'security',
        environment: 'local/staging',
        preconditions: ['候选网络/默认主计划证据可读'],
        input: { candidateTypes: ['default-master-plan', 'candidate-network'], forbiddenClaim: 'production-ready construction plan' },
        steps: ['读取默认主计划 readiness', '检查 release decision 和页面消费边界'],
        expected: ['候选/默认主计划不得冒充 production-ready'],
        failIf: ['staging controlled replay 被算 production-ready', '主链自动消费未复核候选'],
        evidence: ['documentMaterialRiskStatus', 'default-master-plan-readiness.json'],
        coverageStatus: 'partial',
      }),
    ],
  },
]

const closeoutCases = [
  caseRecord({
    caseId: 'C15-LEARN-01',
    baselineIds: ['PB-07', 'PB-05', 'C-15'],
    gate: ['G5'],
    caseClass: 'normal',
    caseType: 'closeout',
    environment: 'staging + real-sample-cohort',
    preconditions: ['N 批真实完工数据带 actual 日期', '学习前 MAE 可记录', 'E1 消费路径可读'],
    input: { sampleCohort: 'real-completion-samples', metric: 'MAE_before/MAE_after' },
    steps: ['灌入样本 cohort', '记录 MAE_before', '触发学习 job', '发布 canary/stable', 'E1 消费新参数并再预测同批任务'],
    expected: ['MAE_after < MAE_before', 'evaluatedDecisionCount > 0', '有样本 cohort 和独立环境标识'],
    failIf: ['MAE 无严格改善', '0.126=0.126', 'operator://current-thread 自证', '只生成报告未消费'],
    evidence: ['c15-sample-cohort-readback.json', 'c15-reward-mae-quality-readback.json'],
    coverageStatus: 'missing-live',
  }),
  caseRecord({
    caseId: 'C15-TENANT-02',
    baselineIds: ['PB-01', 'PB-06', 'C-15'],
    gate: ['G5', 'G7'],
    caseClass: 'security',
    caseType: 'closeout',
    environment: 'staging',
    preconditions: ['两个 company 的样本和策略版本'],
    input: { resources: ['learning-samples', 'policy-version', 'canary-result'], operation: 'cross-tenant-read' },
    steps: ['同租户读取样本和策略', '跨租户读取样本/策略/canary', '记录状态码'],
    expected: ['只能读本租户', '跨租户 403/404'],
    failIf: ['任一跨租户读到样本或策略'],
    evidence: ['c15-policy-version-tenant-isolation.json'],
    coverageStatus: 'missing-live',
  }),
  caseRecord({
    caseId: 'C19-ROLLBACK-01',
    baselineIds: ['PB-04', 'PB-07', 'C-19'],
    gate: ['G5'],
    caseClass: 'boundary',
    caseType: 'closeout',
    environment: 'staging/live-handoff',
    preconditions: ['release artifact', 'approval ref', 'rollback owner'],
    input: { publication: 'runtime publication', failureInjection: 'drift-or-failure' },
    steps: ['发布 runtime publication', '消费者读新版本', '注入 drift/失败', '触发 rollback', '消费者再读'],
    expected: ['回滚后消费者读到旧版本值', 'saved outcome 记录 apply/monitor/rollback'],
    failIf: ['commandsExecuted=0', '未真实 apply', '从 canary 直接标 rolled_back', '无消费者读回'],
    evidence: ['c19-runtime-publication-apply.json', 'c19-runtime-rollback-saved-outcome.json'],
    coverageStatus: 'missing-live',
  }),
  caseRecord({
    caseId: 'C18-DIAG-01',
    baselineIds: ['PB-05', 'PB-06', 'C-18.L'],
    gate: ['G5', 'G6', 'G7'],
    caseClass: 'exception',
    caseType: 'closeout',
    environment: 'staging/live-handoff',
    preconditions: ['disposable project', 'query log', 'lock telemetry', 'cleanup owner'],
    input: { diagnostics: ['concurrency', 'fault-injection', 'query-log', 'malicious-file', 'migration-replay'] },
    steps: ['执行并发诊断', '执行故障注入', '采 query log', '跑恶意文件和迁移重放诊断', 'cleanup/readback'],
    expected: ['每项有 command、exitCode=0、target IDs、DB/lock/query telemetry、cleanup/readback'],
    failIf: ['browser/RPA/MCP-only', '缺 DB/query telemetry', '缺 cleanup'],
    evidence: ['c18-live-evidence-summary.json'],
    coverageStatus: 'missing-live',
  }),
  caseRecord({
    caseId: 'OLDOBJ-DROP-01',
    baselineIds: ['PB-02', 'PB-04', 'PB-12'],
    gate: ['G2', 'G5', 'G7'],
    caseClass: 'security',
    caseType: 'closeout',
    environment: 'db-handoff',
    preconditions: ['candidate bundle 或 no-safe-candidate discovery'],
    input: { discovery: 'full-catalog', actionIfSafe: 'DDL export/approval/drop/rollback/post-smoke' },
    steps: ['full catalog discovery', 'dependency readback', '安全候选走 DDL export/approval/drop/rollback/post-smoke', '无候选走 no-op closeout'],
    expected: ['有候选时 post-drop catalog/API/browser smoke', '无候选时 candidateCount=0 且不宣称 physical DROP'],
    failIf: ['rowCount=0 alone', '无 dependency readback', '无 rollback', '无 post-drop smoke', '把 no-op 说成已 DROP'],
    evidence: ['old-object-physical-drop-summary.json'],
    coverageStatus: 'missing-db',
  }),
]

const extraPressureCases = [
  caseRecord({
    caseId: 'PERF-PROJECT-WRITE-01',
    baselineIds: ['PB-07', 'PB-08'],
    gate: ['G6', 'G7'],
    caseClass: 'boundary',
    caseType: 'pressure',
    environment: 'staging',
    preconditions: ['disposable company', '写入权限 token'],
    input: { endpoint: 'POST /api/projects', concurrency: 20, flow: ['create', 'readback', 'delete/cleanup'] },
    steps: ['20 并发项目创建', '逐项 readback', 'delete/cleanup', '检查孤儿行'],
    expected: ['P95 < 1500ms', '错误率 < 0.1%', '无重复项目', '无孤儿 membership/snapshot'],
    failIf: ['500', '重复写', '清理失败', '孤儿行'],
    evidence: ['write-readback-report.json', 'db-cleanup-report.json'],
    coverageStatus: 'missing-live',
  }),
]

const minimumCasesPerClass = 3

const densityScenarioCatalog = {
  'PB-01': {
    normal: ['token 刷新后读取驾驶舱', '登录深链恢复项目上下文', '多标签页同步登录态'],
    boundary: ['角色降级后的旧会话写入', '切换到未授权 company 上下文', '缺少 company header 的业务请求'],
    exception: ['token refresh 与业务请求并发竞争', 'auth session DB 读取超时', '认证服务 503 时登录失败'],
    security: ['跨租户项目读写矩阵', '同公司 outsider 直接调用项目读写接口', 'anon 读取租户业务数据'],
  },
  'PB-02': {
    normal: ['项目/任务/快照写入回读', 'project_daily_snapshot lineage 对齐', '迁移元数据与仓库文件对齐'],
    boundary: ['已应用迁移幂等重放', '大租户快照造数与清理', '旧表 no-safe-candidate catalog'],
    exception: ['迁移 checksum 冲突', 'DB 不可用时写链失败', '事务部分失败后的 post-failure readback'],
    security: ['应用 DB role 禁止 DDL', '旧对象 DROP 必须审批/备份/回滚', '跨租户快照读取拒绝'],
  },
  'PB-03': {
    normal: ['staging env 引用完整性', 'production env 只使用 secret ref', 'scheduler/warmup/runtime writer 默认关闭'],
    boundary: ['缺可选 flag 默认关闭写链', '非法 DATABASE_URL fail closed', '缺 service role ref 不 fallback'],
    exception: ['过期 secret ref 启动失败', 'env 文件不可读启动失败', '配置服务不可用时阻断写链'],
    security: ['配置错误日志脱敏', '证据目录 secret scan', '部署 workflow 不输出明文 secret'],
  },
  'PB-04': {
    normal: ['runtime stable 发布与消费者 readback', 'canary 发布与消费者 readback', 'consumer version pin 与切换'],
    boundary: ['发布后真实 rollback 读回旧版本', '缺 rollback ref 阻断发布', '无审批 destructive action 拒绝'],
    exception: ['publication apply 中途失败', 'consumer readback 失败不算发布成功', 'rollback apply 失败不得静默 rolled_back'],
    security: ['无审批 runtime apply 拒绝', 'rollback owner 缺失拒绝', '发布 artifact 不得含 secret'],
  },
  'PB-05': {
    normal: ['API/browser smoke 关联 requestId', 'live diagnostic 元数据完整', '浏览器 network 与服务端 trace 对齐'],
    boundary: ['日志保留窗口检查', 'health 轻量接口日志或豁免', 'query log 缺失时 G6 不得 pass'],
    exception: ['API 500 错误分类', 'query log export 不可用', '监控查询不可用时 operator preflight blocked'],
    security: ['错误 payload 脱敏', '日志导出按租户隔离', 'release artifact secret scan'],
  },
  'PB-06': {
    normal: ['route/public RLS/execute SQL guard', 'Supabase Advisor export 解析', 'API route security inventory'],
    boundary: ['public route allowlist 只允许健康信息', 'anon 只允许设计内公开读', 'Advisor catalog pass 不能替代 Advisor export'],
    exception: ['恶意输入拒绝且不 500', '非法 SQL/RPC 拒绝', 'RLS policy drift fail closed'],
    security: ['角色 × 租户 RLS 全矩阵', 'execute SQL RPC 锁死', '跨租户 read/write 全拒绝'],
  },
  'PB-07': {
    normal: ['POST /api/projects 写入回读', 'C-15 学习 MAE 严格改善', '任务乐观锁单次更新回读'],
    boundary: ['重复提交/重试幂等', '并发写入冲突检测', 'scheduler/warmup 无审批默认关闭'],
    exception: ['DB timeout 后补偿/cleanup', 'DB restart 中断写链后的 readback', 'cleanup 失败记录 residual catalog'],
    security: ['撤销 membership 后旧会话写入拒绝', '跨用户 replay 写请求拒绝', '学习样本跨租户读取拒绝'],
  },
  'PB-08': {
    normal: ['CompanyCockpit 大租户汇总压测', 'WBS 大规模生成压测', '项目创建写链并发压测'],
    boundary: ['冷缓存/暖缓存性能对比', '大数据量分页边界', '连接池高水位但未耗尽'],
    exception: ['DB pool exhaustion 分类与恢复', '慢查询超过阈值阻断 G6', '压测中 API timeout 不算 pass'],
    security: ['混合角色 token 压测不串权', '突发写请求限流', '压测日志不泄露 token'],
  },
  'PB-09': {
    normal: ['图纸包回任务链', '证照/前置里程碑回任务链', '材料/验收/风险回任务链'],
    boundary: ['空项目/空月计划', '孤立业务项缺 task_id', '缺责任主体不允许闭环'],
    exception: ['图纸 API 失败', '材料/验收 API 失败', '风险通知部分失败'],
    security: ['outsider/anon 主链写入拒绝', '跨租户图纸/材料/风险拒绝', '外租户 task_id 写入拒绝'],
  },
  'PB-10': {
    normal: ['handoff pack 生成与 preflight', 'operator/oncall owner 完整', '支持诊断 runbook 覆盖常见错误'],
    boundary: ['缺 oncall owner 阻断', '旧 runbook ref 标 stale', '缺 rollback owner 阻断'],
    exception: ['handoff generator 缺输入失败', '监控查询不可用阻断 preflight', '支持导出生成失败不覆盖旧证据'],
    security: ['support export 脱敏', 'support_readonly 不能写业务数据', 'operator 写入必须审批'],
  },
  'PB-11': {
    normal: ['用例矩阵 schema 校验', '命令结果归一化', '基线覆盖图完整性'],
    boundary: ['缺 baseline 覆盖图失败', 'skip/only 进入假绿审计', 'missing-live 不能算 pass'],
    exception: ['invalid schema artifact 失败', '命令 timeout 分类为 blocked/failed', '缺 stdout/stderr 不得 pass'],
    security: ['candidate-only 不得关闭生产 gate', 'mock-only 不得关闭权限/DB gate', 'DISABLE_PERMISSION_SYSTEM 测试只作 supporting'],
  },
  'PB-12': {
    normal: ['敏感操作审计留痕', 'release decision 审计字段完整', 'metric lineage 指向 summary/snapshot/registry'],
    boundary: ['retention 到期处理', 'delete scope 只影响目标项目', '未注册主指标 guard fail'],
    exception: ['审计 writer 失败阻断敏感操作', 'metricRegistry 不可用阻断主指标发布', '删除/归档失败保留恢复边界'],
    security: ['审计日志脱敏', '跨租户审计不可见', '删除/导出权限隔离'],
  },
  'PB-T01': {
    normal: ['租户项目列表隔离', '成员角色生命周期', '套餐/配额消耗回读'],
    boundary: ['无项目租户空态', '配额 exactly at limit 拒绝新增', 'no-plan 租户准入拒绝'],
    exception: ['租户准入失败不创建项目', 'membership sync 失败不授权', 'quota service 失败不扣减'],
    security: ['跨租户读写矩阵', 'outsider/anon 租户写入拒绝', '支持角色不能读租户 secret'],
  },
  'PB-T02': {
    normal: ['草稿-发布-确认-回滚状态机', '多级审批链路', '月计划 closeout 状态回读'],
    boundary: ['并发编辑同一草稿', '越级状态转换拒绝', '重复审批 callback 幂等'],
    exception: ['发布中失败不进入 confirmed', 'rollback 缺审批拒绝', 'workflow notification 失败不假成功'],
    security: ['outsider 不能审批', '跨租户 workflow 读写拒绝', '无审批 runtime publication 拒绝'],
  },
  'PB-T03': {
    normal: ['Dashboard/Reports/CompanyCockpit 主指标 SSOT', 'Dashboard->Reports->Task drilldown', '报表导出 lineage 对齐'],
    boundary: ['缺快照 fallback 不伪造趋势', '部分日期缺快照明确展示', '无数据窗口空态和空导出'],
    exception: ['snapshot read timeout 可见错误', '未注册 metricId guard fail', '报表导出失败不生成假文件'],
    security: ['报表导出 RLS 隔离', '跨租户 drilldown 拒绝', '导出文件不含外租户行'],
  },
  'PB-T04': {
    normal: ['WBS/关键路径/工期/材料/证照/风险回任务计划', '关键路径回任务依赖链', '工程域证照/材料/风险链路'],
    boundary: ['final range-tree 与 legacy scope 兼容', '混合 scope 层级不丢失', 'legacy scope 只读不回写'],
    exception: ['工程对象生成失败补偿', '关键路径生成失败不留半链', '工期推断失败不写生产任务'],
    security: ['候选/默认主计划不得冒充 production-ready', '候选网络不得自动发布', '跨租户工程对象读写拒绝'],
  },
}

const densityExecutionProfiles = {
  'PB-01': {
    target: 'browser login flow + /api/auth/me + /api/projects authorization probes',
    testData: 'owner/admin/editor/outsider/anon test identities, same-tenant and cross-tenant company/project IDs',
    readback: 'auth-smoke.json plus tenant-access-matrix.json must record token state, status codes, and target company/project IDs',
  },
  'PB-02': {
    target: 'migration commands + disposable project/task/snapshot DB readback',
    testData: 'disposable company/project/tasks, migration ledger rows, schema_migrations snapshot, legacy object catalog snapshot',
    readback: 'v1424-db-readback.json and migrationStatus must include row IDs, migration checksum state, cleanup result, and blockers',
  },
  'PB-03': {
    target: 'server bootstrap/env validation + feature flag guard + secret scan',
    testData: 'local/staging/production env refs, missing/invalid DATABASE_URL variants, scheduler/warmup/runtime publication flags',
    readback: 'environmentConfigStatus and secret-leak-scan-summary.json must show config source, redaction, and fail-closed result',
  },
  'PB-04': {
    target: 'runtime publication apply/readback/rollback scripts and release approval guard',
    testData: 'approved runtime publication artifact, canary/stable version refs, rollback owner, consumer readback target',
    readback: 'runtimePublicationStatus and rollback-readiness.json must show applied version, consumer value before/after, and rollback outcome',
  },
  'PB-05': {
    target: 'API/browser smoke with requestId, live diagnostics, log/query/trace export',
    testData: 'disposable request correlation IDs, forced 500/timeout probes, query log export ref, monitoring owner',
    readback: 'observabilityStatus and liveDiagnosticsStatus must include requestId, error class, log ref, telemetry ref, and cleanup',
  },
  'PB-06': {
    target: 'route auth guard + RLS matrix + Supabase Advisor UI/API export validator',
    testData: 'owner/admin/editor/outsider/anon tokens, public/secured routes, Advisor export JSON, execute-sql probes',
    readback: 'securityStatus, rls-role-matrix.json, and advisorStatus must record role x read/write/cross-tenant outcomes and Advisor issue count',
  },
  'PB-07': {
    target: 'POST /api/projects write-readback, idempotency/concurrency probes, scheduler/warmup/runtime writer guard',
    testData: 'disposable company, duplicate request keys, concurrent writers, failure-injection mode, cleanup owner',
    readback: 'projects-write-readback.json and stabilityStatus must show target IDs, duplicate count, residual rows, and post-failure catalog',
  },
  'PB-08': {
    target: 'staging pressure harness for CompanyCockpit, Gantt/critical path, WBS generation, import/write chains',
    testData: 'large disposable tenant data set, role-scoped tokens, concurrency/duration thresholds, query log capture',
    readback: 'performanceStatus must include p50/p95/p99, error rate, DB pool high water mark, slow query summary, and cleanup',
  },
  'PB-09': {
    target: 'browser/API business-chain probes for drawings, pre-milestones, acceptance, materials, risks, notifications, exports',
    testData: 'disposable project with task-linked drawing/certificate/acceptance/material/risk/notification/export records and foreign tenant IDs',
    readback: 'businessFlowStatus and browser/api smoke evidence must show task_id, owner/responsibility subject, status transition, notification/export result, and cleanup',
  },
  'PB-10': {
    target: 'release handoff pack, handoff readiness preflight, support/export runbook probes',
    testData: 'current release dir, operator/oncall/rollback owners, artifact root refs, support_readonly actor',
    readback: 'operationsSupportStatus and handoff-readiness.json must show missing/ready refs, owner fields, and blocked gate count',
  },
  'PB-11': {
    target: 'v1.4.24 case ledger, command result normalization, baseline coverage map, false-green audit',
    testData: 'current release report directory, command stdout/stderr files, skip/only/mock-only samples, missing-live markers',
    readback: 'v1424-test-case-matrix.json, v1424-baseline-test-coverage-map.json, and v1424-false-green-audit.json must match schema and gate boundary',
  },
  'PB-12': {
    target: 'audit logger, data retention/delete scope, metric registry lineage, sensitive export checks',
    testData: 'sensitive operation fixture, delete/retention candidates, metric IDs, cross-tenant audit/export requests',
    readback: 'governanceStatus must include audit event IDs, retention decision, metric lineage source, redaction, and tenant isolation result',
  },
  'PB-T01': {
    target: 'multi-tenant SaaS project list/company cockpit/quota and membership APIs',
    testData: 'two companies, owner/admin/editor/outsider/anon actors, quota-at-limit tenant, no-plan tenant',
    readback: 'tenantIsolationStatus and commercialReadinessStatus must show tenant-scoped rows, quota consumption, and rejected cross-tenant writes',
  },
  'PB-T02': {
    target: 'workflow draft/publish/confirm/rollback state machine and approval callbacks',
    testData: 'draft monthly plan/closeout/runtime publication fixture, concurrent editor actors, approval and duplicate callback refs',
    readback: 'workflowStateStatus and approvalRollbackStatus must show legal state transitions, lock conflicts, and rollback decision',
  },
  'PB-T03': {
    target: 'Dashboard/Reports/CompanyCockpit summary/snapshot/metricRegistry/export chain',
    testData: 'project_daily_snapshot windows, registered metric IDs, empty-window fixture, cross-tenant report/export request',
    readback: 'biSsotStatus and snapshotLineageStatus must show source service, snapshot IDs, drilldown links, export row counts, and RLS result',
  },
  'PB-T04': {
    target: 'WBS/Gantt/critical-path/duration/material/certificate/risk engineering-domain chain',
    testData: 'final range-tree project, legacy scope read-only fixture, task dependencies, candidate/default master-plan refs',
    readback: 'engineeringDomainStatus must show task-plan linkage, critical path dependencies, legacy-scope no-write, and candidate-not-production boundary',
  },
}

function densityProfile(definition) {
  const profile = densityExecutionProfiles[definition.baselineId]
  if (!profile) throw new Error(`missing density execution profile for ${definition.baselineId}`)
  return profile
}

function buildEvidenceContract(evidencePath, caseClass) {
  const requiredFields = [
    'caseId',
    'baselineIds',
    'environment',
    'executionTarget',
    'targetIds',
    'statusOrExitCode',
    'readback',
    'cleanup',
    'blockers',
  ]
  if (caseClass === 'security') requiredFields.push('roleMatrix', 'crossTenantResult')
  if (caseClass === 'exception') requiredFields.push('failureMode', 'postFailureReadback')
  return {
    path: evidencePath,
    requiredFields,
    invalidIfMissing: ['targetIds', 'statusOrExitCode', 'readback', 'cleanup'],
  }
}

function roleMatrixForCase(testCase) {
  if (testCase.caseClass !== 'security') return undefined
  return {
    roles: ['owner', 'company_admin', 'editor', 'outsider', 'anon'],
    operations: ['sameTenantRead', 'sameTenantWrite', 'crossTenantRead', 'crossTenantWrite'],
    expected: {
      owner: 'same-tenant read/write allowed; cross-tenant read/write rejected',
      company_admin: 'same-company read/write allowed; cross-tenant read/write rejected',
      editor: 'authorized project read/write allowed; cross-tenant and unauthorized project writes rejected',
      outsider: 'same-company non-member; all project reads and writes rejected',
      anon: 'all business reads/writes rejected',
    },
  }
}

function crossTenantResultForCase(testCase) {
  if (testCase.caseClass !== 'security') return undefined
  return {
    acceptedStatuses: [401, 403, 404],
    forbiddenOutcomes: ['businessRowWritten', 'foreignTenantDataReturned', 'foreignOwnerOrTaskFieldLeaked', 'crossTenantNotificationCreated'],
    readbackRequired: true,
  }
}

function failureModeForCase(testCase) {
  if (testCase.caseClass !== 'exception') return undefined
  const target = testCase.input?.failureTarget ?? testCase.input?.response ?? testCase.caseId
  return {
    target,
    injectedFailure: testCase.input?.response ?? '500-timeout-or-partial-failure',
    expectedSurface: 'visible-error-state-and-stable-error-classification',
  }
}

function postFailureReadbackForCase(testCase) {
  if (testCase.caseClass !== 'exception') return undefined
  return {
    required: true,
    checks: ['noSilentSuccess', 'noHalfWrite', 'taskStatusUnchangedUnlessExplicitlyCommitted', 'cleanupRecorded'],
  }
}

function buildPb09ExecutableInput(testCase) {
  const evidencePath = testCase.evidence?.[0] ?? `${testCase.caseId.toLowerCase()}.json`
  const originalInput = testCase.input ?? {}
  return {
    ...originalInput,
    executionTarget: 'browser/API business-chain probe for drawings, permits/pre-milestones, acceptance, materials, risks/issues, notifications, reports, imports/exports',
    testData: {
      companyIdRef: 'sameCompanyIdRef',
      projectIdRef: 'disposableProjectIdRef',
      taskIdRef: originalInput.ids?.includes?.('foreign-task-id') || String(originalInput.action ?? '').includes('foreign')
        ? 'foreignTaskIdRef plus sameTenantTaskIdRef'
        : 'sameTenantTaskIdRef',
      entities: originalInput.entities ?? originalInput.records ?? originalInput.payloads ?? originalInput.actions ?? originalInput.states ?? originalInput.flow ?? testCase.caseId,
      requiredFixtures: ['task-linked business record', 'responsibility subject', 'cleanup owner'],
    },
    readback: {
      artifact: evidencePath,
      requiredFields: ['targetIds', 'task_id', 'owner_or_responsibility_subject', 'status_transition_or_empty_state', 'cleanup'],
      consistencyChecks: ['business record links to task chain', 'responsibility subject is present or explicitly blocked', 'no orphan row counted as closed loop'],
    },
    evidenceContract: buildEvidenceContract(evidencePath, testCase.caseClass),
    ...(testCase.caseClass === 'security'
      ? {
          roleMatrix: roleMatrixForCase(testCase),
          crossTenantResult: crossTenantResultForCase(testCase),
        }
      : {}),
    ...(testCase.caseClass === 'exception'
      ? {
          failureMode: failureModeForCase(testCase),
          postFailureReadback: postFailureReadbackForCase(testCase),
        }
      : {}),
  }
}

function enrichExecutableCase(testCase) {
  if (!testCase.baselineIds.includes('PB-09')) return testCase
  return {
    ...testCase,
    input: buildPb09ExecutableInput(testCase),
  }
}

function buildDensityInput(definition, caseClass, scenario, evidencePath) {
  const profile = densityProfile(definition)
  return {
    baselineId: definition.baselineId,
    domain: definition.name,
    scenario,
    caseClass,
    executionTarget: profile.target,
    testData: profile.testData,
    readback: profile.readback,
    evidenceContract: buildEvidenceContract(evidencePath, caseClass),
    mutationBoundary: 'disposable-data-only; production mutation requires explicit live/db handoff and cleanup owner',
  }
}

function buildDensitySupplementCase(definition, caseClass, ordinal, scenario) {
  const prefix = definition.baselineId.replace(/-/g, '')
  const caseId = `${prefix}-DENSITY-${caseClass.toUpperCase()}-${String(ordinal).padStart(2, '0')}`
  const environment = caseClass === 'security' || caseClass === 'exception' ? 'staging' : 'local/staging'
  const gate = definition.gates
  const evidencePath = `${prefix.toLowerCase()}-density-${caseClass}-${String(ordinal).padStart(2, '0')}.json`
  const input = buildDensityInput(definition, caseClass, scenario, evidencePath)
  const base = {
    caseId,
    baselineIds: [definition.baselineId],
    gate,
    caseClass,
    environment,
    preconditions: [`${definition.name} 的「${scenario}」测试对象可构造`, '测试对象必须是 disposable 或有明确 cleanup owner'],
    input,
    evidence: [evidencePath],
    coverageStatus: environment.includes('staging') ? 'missing-live' : 'partial',
    notes: ['density-supplement-generated-from-v1424-ledger', 'requires-executable-target-and-evidence-contract'],
  }

  if (caseClass === 'normal') {
    return caseRecord({
      ...base,
      steps: [`准备数据：${input.testData}`, `执行目标：${input.executionTarget}`, `按读回口径核验：${input.readback}`, `按证据契约归档：${evidencePath}`],
      expected: [`场景「${scenario}」在目标入口返回成功状态`, 'API/UI/DB readback 指向同一批 targetIds', '证据包含 targetIds、statusOrExitCode、readback、cleanup，不使用 mock/dry-run 关闭 gate'],
      failIf: ['目标入口失败或未执行', 'readback 与 targetIds 不一致', '证据缺 executionTarget/readback/cleanup 或只有 mock/report-only'],
    })
  }
  if (caseClass === 'boundary') {
    return caseRecord({
      ...base,
      steps: [`构造边界数据：${input.testData}`, `执行目标：${input.executionTarget}`, `核验边界读回：${input.readback}`, `清理并归档：${evidencePath}`],
      expected: [`场景「${scenario}」返回明确边界语义`, '边界状态不伪造成功或主指标', '证据包含边界 targetIds、readback、cleanup 和 blockers'],
      failIf: ['边界状态白屏或 500', '把边界数据算作正常闭环', 'cleanup 缺失或残留', '证据缺边界输入规模或目标 ID'],
    })
  }
  if (caseClass === 'exception') {
    return caseRecord({
      ...base,
      steps: [`注入失败场景：${scenario}`, `执行目标：${input.executionTarget}`, `执行 post-failure readback：${input.readback}`, `归档 failureMode、targetIds 和 cleanup：${evidencePath}`],
      expected: ['失败可见且有稳定错误分类', '不显示静默成功', 'post-failure readback 证明无半写入或脏状态'],
      failIf: ['失败仍显示成功', '错误被吞掉或全变 unknown', 'post-failure readback 有脏数据', '证据缺 failureMode 或 postFailureReadback'],
    })
  }
  return caseRecord({
    ...base,
    steps: [`按 owner/admin/editor/outsider/anon 角色执行场景：${scenario}`, `执行安全目标：${input.executionTarget}`, `对允许与拒绝路径分别读回：${input.readback}`, `归档 roleMatrix、crossTenantResult 和 cleanup：${evidencePath}`],
    expected: ['授权范围内成功', 'outsider/anon/跨租户越权均拒绝', '拒绝路径不泄露业务字段且不写库', '证据包含 roleMatrix 和 crossTenantResult'],
    failIf: ['越权读写成功', '拒绝路径 500 或泄露敏感字段', 'DB readback 出现越权写入', '证据缺角色矩阵或跨租户结果'],
  })
}

function buildDensitySupplementCases(seedCases) {
  const supplemental = []
  const countFor = (baselineId, caseClass) =>
    seedCases.concat(supplemental).filter((testCase) => testCase.baselineIds.includes(baselineId) && testCase.caseClass === caseClass).length

  for (const definition of baselineDefinitions) {
    const profile = densityScenarioCatalog[definition.baselineId]
    if (!profile) throw new Error(`missing density profile for ${definition.baselineId}`)
    for (const caseClass of requiredCaseClasses) {
      const needed = Math.max(0, minimumCasesPerClass - countFor(definition.baselineId, caseClass))
      const available = profile[caseClass] ?? []
      if (available.length < minimumCasesPerClass) {
        throw new Error(`${definition.baselineId} ${caseClass} density profile requires at least ${minimumCasesPerClass} scenarios`)
      }
      for (let index = 0; index < needed; index += 1) {
        const ordinal = countFor(definition.baselineId, caseClass) + 1
        supplemental.push(buildDensitySupplementCase(definition, caseClass, ordinal, available[ordinal - 1]))
      }
    }
  }

  return supplemental
}

function buildCaseMatrix() {
  const seedCases = baselineDefinitions.flatMap((definition) => definition.cases).concat(closeoutCases, extraPressureCases)
  return seedCases.concat(buildDensitySupplementCases(seedCases)).map(enrichExecutableCase)
}

function buildCoverageMap(cases) {
  const map = {}
  for (const definition of baselineDefinitions) {
    const related = cases.filter((testCase) => testCase.baselineIds.includes(definition.baselineId))
    const classCoverage = Object.fromEntries(
      requiredCaseClasses.map((caseClass) => [
        caseClass,
        related.filter((testCase) => testCase.caseClass === caseClass).map((testCase) => testCase.caseId),
      ]),
    )
    const statuses = new Set(related.map((testCase) => testCase.coverageStatus))
    const status = statuses.has('missing-live')
      ? 'missing-live'
      : statuses.has('missing-db')
        ? 'missing-db'
        : statuses.has('missing-test')
          ? 'missing-test'
          : statuses.has('suspect-fake-green')
            ? 'suspect-fake-green'
            : statuses.has('partial')
              ? 'partial'
              : 'covered'
    map[definition.baselineId] = {
      baselineId: definition.baselineId,
      name: definition.name,
      gates: definition.gates,
      requiredCaseClasses,
      classCoverage,
      caseIds: related.map((testCase) => testCase.caseId),
      existingCoverage: definition.existingCoverage,
      coverageStatus: status,
      productionBranchCovered: related.every((testCase) => testCase.productionBranchCovered),
      notProductionReadyReason: status === 'covered'
        ? null
        : 'Coverage map is a case ledger only; live/db/staging execution evidence is still required before production-ready.',
    }
  }
  return map
}

async function walk(root, extensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.md', '.txt'])) {
  const absoluteRoot = join(repoRoot, root)
  if (!existsSync(absoluteRoot)) return []
  const files = []
  async function visit(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (['node_modules', 'dist', '.git', '.pnpm-store'].includes(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await visit(full)
      } else if (extensions.has(extname(entry.name))) {
        files.push(full)
      }
    }
  }
  await visit(absoluteRoot)
  return files
}

function isFalseGreenAuditTarget(file, releaseDir) {
  const path = rel(file)
  if (path === 'project-testing/tools/build-v1424-test-case-ledger.mjs') return false
  if (path.startsWith('project-testing/tools/')) return true
  const normalizedReleaseDir = rel(resolve(repoRoot, releaseDir))
  if (path.startsWith(`${normalizedReleaseDir}/`)) {
    if (path.includes('/logs/')) return false
    const releaseFile = path.slice(normalizedReleaseDir.length + 1)
    return [
      'v1424-command-results.json',
      'v1424-command-results.normalized.json',
      'v1424-release-decision.json',
      'summary.json',
      'closeout-decision.json',
      'closeout-status-index.json',
      'production-migration-governance-evidence.json',
      'c15-live-learning-closeout-evidence-validation.json',
      'c18-l07-l15-live-diagnostics-evidence-validation.json',
      'c19-runtime-publication-release-rollback-evidence-validation.json',
      'old-object-physical-drop-closeout-evidence-validation.json',
      'rls-role-matrix.json',
      'auth-smoke.json',
      'tenant-access-matrix.json',
      'projects-write-readback.json',
      'api-error-semantics.json',
    ].includes(releaseFile)
  }
  if (path.startsWith('scripts/')) return true
  if (path.includes('/__tests__/')) return true
  if (/\.(?:test|spec)\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(path)) return true
  return false
}

function sortCountRecords(left, right) {
  const countDelta = right.findingCount - left.findingCount
  if (countDelta !== 0) return countDelta
  const suspectDelta = (right.suspectFakeGreenCount ?? 0) - (left.suspectFakeGreenCount ?? 0)
  if (suspectDelta !== 0) return suspectDelta
  return String(left.id ?? left.file ?? left.ruleId).localeCompare(String(right.id ?? right.file ?? right.ruleId))
}

function falseGreenClassificationForSeverity(severity) {
  if (severity === 'suspect-fake-green') {
    return {
      classification: 'hard-gate-review-required',
      releaseGateUse: 'review-required; cannot close any release gate until manually reviewed and mapped to real production-branch/live evidence',
    }
  }
  return {
    classification: 'supporting-only-not-pass-evidence',
    releaseGateUse: 'supporting-only; cannot close P0/P1 gate without production-branch/live evidence',
  }
}

function buildFalseGreenSummary(files, findings, rules) {
  const bySeverity = Object.fromEntries(
    ['suspect-fake-green', 'supporting-only'].map((severity) => [
      severity,
      findings.filter((finding) => finding.severity === severity).length,
    ]),
  )
  const byClassification = Object.fromEntries(
    ['hard-gate-review-required', 'supporting-only-not-pass-evidence'].map((classification) => [
      classification,
      findings.filter((finding) => finding.classification === classification).length,
    ]),
  )
  const byRule = rules
    .map((rule) => {
      const related = findings.filter((finding) => finding.ruleId === rule.ruleId)
      return {
        ruleId: rule.ruleId,
        severity: rule.severity,
        classification: rule.classification,
        findingCount: related.length,
        reason: rule.reason,
      }
    })
    .filter((entry) => entry.findingCount > 0)
    .sort(sortCountRecords)

  const fileGroups = new Map()
  for (const finding of findings) {
    const group = fileGroups.get(finding.file) ?? {
      file: finding.file,
      findingCount: 0,
      suspectFakeGreenCount: 0,
      supportingOnlyCount: 0,
      hardGateReviewRequiredCount: 0,
      supportingOnlyNotPassEvidenceCount: 0,
      ruleCounts: new Map(),
    }
    group.findingCount += 1
    if (finding.severity === 'suspect-fake-green') group.suspectFakeGreenCount += 1
    if (finding.severity === 'supporting-only') group.supportingOnlyCount += 1
    if (finding.classification === 'hard-gate-review-required') group.hardGateReviewRequiredCount += 1
    if (finding.classification === 'supporting-only-not-pass-evidence') group.supportingOnlyNotPassEvidenceCount += 1
    group.ruleCounts.set(finding.ruleId, (group.ruleCounts.get(finding.ruleId) ?? 0) + 1)
    fileGroups.set(finding.file, group)
  }

  const topFiles = [...fileGroups.values()]
    .map((group) => ({
      file: group.file,
      findingCount: group.findingCount,
      suspectFakeGreenCount: group.suspectFakeGreenCount,
      supportingOnlyCount: group.supportingOnlyCount,
      classificationCounts: {
        'hard-gate-review-required': group.hardGateReviewRequiredCount,
        'supporting-only-not-pass-evidence': group.supportingOnlyNotPassEvidenceCount,
      },
      topRules: [...group.ruleCounts.entries()]
        .map(([ruleId, findingCount]) => ({ ruleId, findingCount }))
        .sort(sortCountRecords)
        .slice(0, 5),
    }))
    .sort(sortCountRecords)
    .slice(0, 20)

  const reviewPriority = topFiles.slice(0, 10).map((entry) => ({
    file: entry.file,
    findingCount: entry.findingCount,
    priority: entry.suspectFakeGreenCount > 0 ? 'P0-review-suspect-fake-green' : 'P1-review-supporting-only',
    classification: entry.suspectFakeGreenCount > 0 ? 'hard-gate-review-required' : 'supporting-only-not-pass-evidence',
    reason: entry.suspectFakeGreenCount > 0
      ? `${entry.suspectFakeGreenCount} suspect-fake-green finding(s) may be hiding skipped/only/self-evidence release claims.`
      : `${entry.supportingOnlyCount} supporting-only finding(s) must be mapped away from hard release gates.`,
    topRules: entry.topRules,
  }))

  return {
    scannedFileCount: files.length,
    findingCount: findings.length,
    bySeverity,
    byClassification,
    byRule,
    topFiles,
    reviewPriority,
    rulesWithFindings: byRule.map((entry) => entry.ruleId),
    classificationLegend: [
      {
        classification: 'hard-gate-review-required',
        severity: 'suspect-fake-green',
        releaseGateUse: falseGreenClassificationForSeverity('suspect-fake-green').releaseGateUse,
      },
      {
        classification: 'supporting-only-not-pass-evidence',
        severity: 'supporting-only',
        releaseGateUse: falseGreenClassificationForSeverity('supporting-only').releaseGateUse,
      },
    ],
    status: findings.length > 0 ? 'review-required' : 'no-suspect-pattern-found',
  }
}

async function scanFalseGreenPatterns(releaseDir) {
  const rules = [
    { ruleId: 'FG-01-SKIP-ONLY', severity: 'suspect-fake-green', pattern: /\b(?:describe|it|test)\.(?:skip|only)\b|\.only\(/g, reason: 'skip/only 不得关闭任何 release gate' },
    { ruleId: 'FG-02-ENV-SKIP', severity: 'supporting-only', pattern: /describeIfConfigured|itIfConfigured|testIfConfigured|process\.env\.[A-Z0-9_]+.*skip/gi, reason: '缺环境自动 skip 只能标 missing-env/not-executed' },
    { ruleId: 'FG-03-MOCK-API', severity: 'supporting-only', pattern: /mock-api|mock-api-browser|mock-api-production-build|route\.fulfill\(/gi, reason: 'mock 后端只能证明 UI 渲染或脚本稳定' },
    { ruleId: 'FG-04-AUTH-BYPASS', severity: 'supporting-only', pattern: /vi\.mock\([^)]*auth|DISABLE_PERMISSION_SYSTEM|VITE_DISABLE_PERMISSION_SYSTEM/gi, reason: '认证或权限 bypass 不能证明 PB-01/PB-06/PB-T01' },
    { ruleId: 'FG-05-DRY-RUN', severity: 'supporting-only', pattern: /dryRun\s*[:=]\s*true|--dry-run|commandsExecuted\s*[:=]\s*0/gi, reason: 'dry-run 或 commandsExecuted=0 不能关闭 live closeout' },
    { ruleId: 'FG-06-SELF-EVIDENCE', severity: 'suspect-fake-green', pattern: /operator:\/\/current-thread|manual-assisted-only/gi, reason: '当前线程自证或纯人工辅助不能作为 release pass' },
    { ruleId: 'FG-07-ROWCOUNT-ONLY', severity: 'supporting-only', pattern: /rowCount\s*[:=]\s*0|candidateCount\s*[:=]\s*0/gi, reason: 'rowCount/candidateCount alone 不能证明行为闭环或 DROP 安全' },
    { ruleId: 'FG-08-CANDIDATE-ONLY', severity: 'supporting-only', pattern: /candidate-only|candidateOnly|shadow|report-only/gi, reason: 'candidate/shadow/report-only 不能证明 production-ready' },
  ].map((rule) => ({
    ...rule,
    ...falseGreenClassificationForSeverity(rule.severity),
  }))

  const roots = ['server/src', 'client/src', 'scripts', 'project-testing/tools', releaseDir]
  const files = (await Promise.all(roots.map((root) => walk(root)))).flat().filter((file) => isFalseGreenAuditTarget(file, releaseDir))
  const findings = []
  for (const file of files) {
    const text = await readFile(file, 'utf8').catch(() => '')
    const lines = text.split(/\r?\n/)
    for (const rule of rules) {
      for (let index = 0; index < lines.length; index += 1) {
        rule.pattern.lastIndex = 0
        if (!rule.pattern.test(lines[index])) continue
        findings.push({
          ruleId: rule.ruleId,
          severity: rule.severity,
          classification: rule.classification,
          file: rel(file),
          line: index + 1,
          excerpt: lines[index].trim().slice(0, 220),
          reason: rule.reason,
          releaseGateUse: rule.releaseGateUse,
        })
      }
    }
  }

  const summary = buildFalseGreenSummary(files, findings, rules)

  return {
    schemaVersion: 'workbuddy/v1424-false-green-audit/v1',
    generatedAt: new Date().toISOString(),
    sourcePlan: sourcePlanPath,
    scannedRoots: roots,
    scanPolicy: {
      scope: 'test-scripts-release-evidence-only',
      excluded: ['non-test server/src runtime files', 'non-test client/src runtime files'],
      reason: 'False-green audit reviews test claims and release evidence. Runtime business code may legitimately contain candidate/shadow/count concepts and must not inflate test-fraud findings.',
    },
    rules: rules.map(({ pattern, ...rule }) => ({ ...rule, pattern: String(pattern) })),
    summary,
    findings,
  }
}

function validateCases(cases, coverageMap) {
  const errors = []
  const seen = new Set()
  for (const testCase of cases) {
    if (seen.has(testCase.caseId)) errors.push(`duplicate caseId: ${testCase.caseId}`)
    seen.add(testCase.caseId)
    for (const field of ['caseId', 'baselineIds', 'gate', 'caseClass', 'caseType', 'environment', 'preconditions', 'input', 'steps', 'expected', 'failIf', 'evidence', 'existingCoverage', 'coverageStatus']) {
      if (testCase[field] === undefined) errors.push(`${testCase.caseId} missing ${field}`)
    }
    if (!testCase.steps?.length) errors.push(`${testCase.caseId} has no steps`)
    if (!testCase.expected?.length) errors.push(`${testCase.caseId} has no expected`)
    if (!testCase.failIf?.length) errors.push(`${testCase.caseId} has no failIf`)
  }
  for (const definition of baselineDefinitions) {
    const coverage = coverageMap[definition.baselineId]
    if (!coverage) {
      errors.push(`missing coverage map for ${definition.baselineId}`)
      continue
    }
    for (const caseClass of requiredCaseClasses) {
      if (!coverage.classCoverage[caseClass]?.length) errors.push(`${definition.baselineId} missing ${caseClass} case`)
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
}

function buildMarkdown(cases, coverageMap, falseGreenAudit) {
  const lines = [
    '# v1.4.24 测试用例台账',
    '',
    `生成时间：${new Date().toISOString()}`,
    `来源方案：\`${sourcePlanPath}\``,
    '',
    '这份文件是基于 v1.4.24 验收门禁方案拆出的用例题库。它不是放行结论；默认状态为 `not-executed`，后续测试必须逐条填证据。',
    '',
    '## 汇总',
    '',
    `- 用例总数：${cases.length}`,
    `- 基线数：${Object.keys(coverageMap).length}`,
    `- 假绿审计命中：${falseGreenAudit.summary.findingCount}`,
    '',
    '## 基线覆盖',
    '',
    '| 基线 | 状态 | normal | boundary | exception | security |',
    '|------|------|--------|----------|-----------|----------|',
  ]
  for (const entry of Object.values(coverageMap)) {
    lines.push(`| ${entry.baselineId} ${entry.name} | ${entry.coverageStatus} | ${entry.classCoverage.normal.length} | ${entry.classCoverage.boundary.length} | ${entry.classCoverage.exception.length} | ${entry.classCoverage.security.length} |`)
  }
  lines.push('', '## 用例清单', '')
  for (const testCase of cases) {
    lines.push(`### ${testCase.caseId}`)
    lines.push('')
    lines.push(`- 基线：${testCase.baselineIds.join(', ')}`)
    lines.push(`- Gate：${testCase.gate.join(', ')}`)
    lines.push(`- 类型：${testCase.caseClass}/${testCase.caseType}`)
    lines.push(`- 环境：${testCase.environment}`)
    lines.push(`- 当前覆盖：${testCase.coverageStatus}`)
    lines.push(`- 输入：${JSON.stringify(testCase.input)}`)
    lines.push(`- 预期：${testCase.expected.join('；')}`)
    lines.push(`- FAIL：${testCase.failIf.join('；')}`)
    lines.push(`- 证据：${testCase.evidence.join(', ')}`)
    lines.push('')
  }
  lines.push('## 假绿审计汇总', '')
  lines.push(`- 状态：${falseGreenAudit.summary.status}`)
  lines.push(`- suspect-fake-green：${falseGreenAudit.summary.bySeverity['suspect-fake-green'] ?? 0}`)
  lines.push(`- supporting-only：${falseGreenAudit.summary.bySeverity['supporting-only'] ?? 0}`)
  lines.push('- 优先审查文件：')
  for (const entry of falseGreenAudit.summary.reviewPriority.slice(0, 10)) {
    lines.push(`  - ${entry.file}: ${entry.priority}, ${entry.findingCount} findings`)
  }
  lines.push('')
  lines.push('## 假绿审计规则', '')
  for (const rule of falseGreenAudit.rules) {
    lines.push(`- ${rule.ruleId}：${rule.reason}`)
  }
  lines.push('')
  lines.push('假绿命中项只允许作为定位线索；不能关闭 P0/P1 release gate。')
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = argValue('--release-dir', defaultReleaseDir)
  const outputDir = resolve(repoRoot, releaseDir)
  await mkdir(outputDir, { recursive: true })

  const cases = buildCaseMatrix()
  const coverageMap = buildCoverageMap(cases)
  validateCases(cases, coverageMap)
  const falseGreenAudit = await scanFalseGreenPatterns(releaseDir)
  const generatedAt = new Date().toISOString()

  const testCaseMatrix = {
    schemaVersion: 'workbuddy/v1424-test-case-matrix/v1',
    generatedAt,
    sourcePlan: sourcePlanPath,
    status: 'case-ledger-ready-not-executed',
    releaseDecisionBoundary: 'This ledger defines executable cases. It does not mark release gates passed.',
    requiredCaseClasses,
    cases,
  }
  const baselineCoverageMap = {
    schemaVersion: 'workbuddy/v1424-baseline-test-coverage-map/v1',
    generatedAt,
    sourcePlan: sourcePlanPath,
    status: 'coverage-map-ready-not-executed',
    baselines: coverageMap,
  }
  const markdown = buildMarkdown(cases, coverageMap, falseGreenAudit)

  const outputs = [
    ['v1424-test-case-matrix.json', testCaseMatrix],
    ['v1424-baseline-test-coverage-map.json', baselineCoverageMap],
    ['v1424-false-green-audit.json', falseGreenAudit],
  ]
  for (const [filename, payload] of outputs) {
    await writeFile(join(outputDir, filename), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  }
  await writeFile(join(outputDir, 'v1424-test-case-ledger.md'), markdown, 'utf8')

  console.log(JSON.stringify({
    status: 'case-ledger-ready-not-executed',
    releaseDir: rel(outputDir),
    caseCount: cases.length,
    baselineCount: Object.keys(coverageMap).length,
    falseGreenFindingCount: falseGreenAudit.summary.findingCount,
    outputs: [
      rel(join(outputDir, 'v1424-test-case-matrix.json')),
      rel(join(outputDir, 'v1424-baseline-test-coverage-map.json')),
      rel(join(outputDir, 'v1424-false-green-audit.json')),
      rel(join(outputDir, 'v1424-test-case-ledger.md')),
    ],
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
