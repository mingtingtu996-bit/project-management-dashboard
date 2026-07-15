import { readFileSync, readdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  evaluateAlgorithmAssetAdmissionGate,
  getAlgorithmRuleAsset,
  getAlgorithmRuleAssetInventoryDiagnostics,
} from '../services/algorithmRuleAssetInventoryService.js'
import {
  buildConstructionOrganizationExperienceAssetDispositionMatrix,
} from '../services/constructionOrganizationScenarioGovernanceService.js'
import { getAlgorithmGovernanceCatalogDiagnostics } from '../services/algorithmCatalogService.js'
import {
  getProjectGenerationFactConsumerMatrix,
  getProjectGenerationFactGovernanceDiagnostics,
} from '../services/projectGenerationFactsConsumerRegistry.js'
import { collectDurationAlgorithmClosureGovernanceReport } from '../services/durationAlgorithmClosureGovernanceService.js'
import { buildV14223DomainReleaseRuntimeClosureMatrix } from '../services/domainReleaseRuntimeClosureMatrixService.js'
import { assessExperienceTierCandidatePayload } from '../services/experienceTierRegistryService.js'
import { buildBusinessSpatialWbsConsumerCoverageMatrix } from '../services/businessSpatialWbsConsumerCoverageMatrixService.js'
import { listDurationColdStartTemplateAssetView } from '../services/durationColdStartTemplateRegistryService.js'
import { buildV141HistoricalScopeCloseoutMatrix } from '../services/v141HistoricalScopeCloseoutMatrixService.js'
import { buildAlgorithmRuleAssetRelationshipMatrix } from '../scripts/diagnose-algorithm-rule-asset-relationship-matrix.js'

const workspaceRoot = process.cwd().endsWith(`${sep}server`)
  ? resolve(process.cwd(), '..')
  : process.cwd()

function readPlan(filenamePrefix: string) {
  const docsDir = resolve(workspaceRoot, 'docs', 'plans')
  const filename = readdirSync(docsDir)
    .find((item) => item.startsWith(filenamePrefix) && item.endsWith('.md'))
  if (!filename) throw new Error(`Missing plan file with prefix ${filenamePrefix}`)
  return readFileSync(resolve(docsDir, filename), 'utf8')
}

function extractRow(planDoc: string, firstCell: string) {
  const row = planDoc
    .split(/\r?\n/)
    .find((line) => line.startsWith(`| ${firstCell} |`))
  if (!row) throw new Error(`Missing table row ${firstCell}`)
  return row
}

function extractLastRow(planDoc: string, firstCell: string) {
  const rows = planDoc
    .split(/\r?\n/)
    .filter((line) => line.startsWith(`| ${firstCell} |`))
  const row = rows.at(-1)
  if (!row) throw new Error(`Missing table row ${firstCell}`)
  return row
}

function expectContainsAll(text: string, expectedFragments: string[]) {
  for (const fragment of expectedFragments) {
    expect(text).toContain(fragment)
  }
}

function countRegistryEntriesByKind(entries: Array<{ kind: string }>) {
  return {
    routes: entries.filter((entry) => entry.kind === 'route').length,
    services: entries.filter((entry) => entry.kind === 'service').length,
    jobs: entries.filter((entry) => entry.kind === 'job').length,
    metrics: entries.filter((entry) => entry.kind === 'metric').length,
    migrations: entries.filter((entry) => entry.kind === 'migration').length,
  }
}

describe('v1.4.23.1 non-live closeout contract', () => {
  it('upgrades C-04 from document-only relationship map to current inventory, catalog, and admission-gate evidence', () => {
    const inventory = getAlgorithmRuleAssetInventoryDiagnostics()
    const catalog = getAlgorithmGovernanceCatalogDiagnostics()
    const admissionGate = evaluateAlgorithmAssetAdmissionGate()
    const relationshipMatrix = buildAlgorithmRuleAssetRelationshipMatrix()

    expect(inventory.gaps).toEqual(expect.objectContaining({
      duplicateAssetKeys: [],
      missingAlgorithmSeedTypes: [],
      algorithmSeedAssetsMissingSeedType: [],
      algorithmSeedAssetsMissingCapabilities: [],
    }))
    expect(inventory.summary.algorithmSeedCount).toBe(catalog.summary.registrySeedTypeCount)
    expect(inventory.summary.totalAssetCount).toBeGreaterThan(catalog.summary.algorithmCatalogCount)
    expect(catalog.status).toBe('pass')
    expect(catalog.gaps).toEqual(expect.objectContaining({
      duplicateAlgorithmKeys: [],
      duplicateSeedKeys: [],
      missingAlgorithmImplementationPaths: [],
      missingRegistrySeedCatalogEntries: [],
      nonRegistryRuleAssetsMissingCatalogEntries: [],
      ordinaryUserVisibleAlgorithmKeys: [],
    }))
    expect(admissionGate.status).toBe('pass')
    expect(admissionGate.blockers).toEqual([])
    expect(admissionGate.requiredFor).toEqual(expect.arrayContaining([
      'adding_project_generation_fact',
      'adding_duration_context_factor',
      'adding_algorithm_seed_type',
      'adding_rule_or_governance_asset',
      'before_golden_benchmark_replay',
    ]))

    for (const key of [
      'projectGenerationFacts',
      'durationPipelineTopology',
      'durationAlgorithmClosureGovernance',
      'constructionOrganizationScenarioSelector',
      'algorithmAssetGovernanceProtocol',
      'algorithmAssetAdmissionGate',
    ]) {
      expect(getAlgorithmRuleAsset(key), key).toEqual(expect.objectContaining({
        key,
        boundaryPolicy: expect.any(Array),
        consumers: expect.any(Array),
      }))
    }
    expect(relationshipMatrix).toEqual(expect.objectContaining({
      matrixCode: 'v14231_algorithm_rule_asset_relationship_matrix',
      status: 'pass',
      runtimeBoundary: {
        writesRuntime: false,
        writesSeeds: false,
        writesTaskDependencies: false,
        writesPlanDates: false,
        declaresProductionReady: false,
      },
    }))
    expect(relationshipMatrix.gaps).toEqual(expect.objectContaining({
      seedTypesWithoutRuleAsset: [],
      seedTypesWithoutSeedCatalogEntry: [],
      projectFactsWithoutConsumerEdge: [],
      ruleAssetConsumersWithoutEdge: [],
      autoDiscoveredAssetsMissingRegistration: [],
      runtimeBoundaryViolations: [],
    }))
    expect(relationshipMatrix.nodesById['rule_asset:projectGenerationFacts']).toEqual(expect.objectContaining({
      kind: 'rule_asset',
    }))
    expect(relationshipMatrix.edgesById['project_fact:businessType->consumer:wbsTemplateGenerationService:consumed_by']).toEqual(expect.objectContaining({
      relation: 'consumed_by',
    }))
  })

  it('locks the C-12 five-layer closeout to authoritative services and non-live v1.5 downgrade evidence', () => {
    const factDiagnostics = getProjectGenerationFactGovernanceDiagnostics()
    const factMatrix = getProjectGenerationFactConsumerMatrix()
    const report = collectDurationAlgorithmClosureGovernanceReport()
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    expect(factDiagnostics).toEqual({
      factCount: Object.keys(factMatrix).length,
      uncoveredFactKeys: [],
      fieldsWithoutGenerationConsumer: [],
    })
    expect(report.factLayer.projectGenerationFacts.authority).toBe('ProjectGenerationFacts')
    expect(report.factLayer.runtimeExecutionFacts.authority).toBe('RuntimeExecutionFacts')
    expect(report.factLayer.algorithmFactContext.authority).toBe('AlgorithmFactContext')
    expect(report.quadrants.map((item) => item.authorityAlgorithm)).toEqual(expect.arrayContaining([
      'durationSuggestionService',
      'taskDurationForecastService/durationSuggestionService',
      'scheduleAccelerationService/monthlyPlanGenerationService',
    ]))
    expect(report.assetInventory.assets.map((item) => item.key)).toEqual(expect.arrayContaining([
      'ProjectGenerationFacts',
      'RuntimeExecutionFacts',
      'runtimeExecutionInferenceService',
      'progressVelocityLearningService',
      'durationPipelineTopology',
    ]))

    expect(mainPlan).toContain('4.7.05')
    expect(mainPlan).toContain('production-ready')
    expect(mainPlan).toContain('needs-gating')
    expect(mainPlan).toContain('not-ready')
    expect(ledgerPlan).toContain('4.7.05')
    expect(ledgerPlan).toContain('4.7.06 页面级消费降级映射')
    expect(ledgerPlan).toContain('A10-E07')
    expect(ledgerPlan).toContain('A10-E08')
    expect(ledgerPlan).toContain('A10-E12')
    expect(extractRow(ledgerPlan, 'A10-E07')).toContain('runtimeExecutionInferenceService.test.ts')
    expect(extractRow(ledgerPlan, 'A10-E08')).toContain('durationSurface.contract.test.ts')
    expect(extractRow(ledgerPlan, 'A10-E12')).toContain('T2 focused tests')
  })

  it('locks C-19.0 to a single duration pipeline and keeps runtime closure separate from product readiness', () => {
    const report = collectDurationAlgorithmClosureGovernanceReport()
    const matrix = buildV14223DomainReleaseRuntimeClosureMatrix()
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    const topology = report.assetInventory.assets.find((asset) => asset.key === 'durationPipelineTopology')
    expect(topology).toEqual(expect.objectContaining({
      role: expect.stringContaining('single duration pipeline'),
      boundaryPolicy: expect.arrayContaining([
        'facts_engines_outputs_must_stay_single_pipeline',
        'five_duration_engines_must_be_cataloged',
        'topology_contract_not_algorithm_seed',
      ]),
    }))
    expect(report.durationOutputGovernance.boundaryPolicy).toEqual(expect.arrayContaining([
      'duration_outputs_are_semantic_contracts_not_independent_algorithms',
      'write_targets_must_be_allowed_by_output_contract',
    ]))
    expect(report.dependencyNetwork.layers.map((layer) => layer.code)).toEqual([
      'L1_workflow_dictionary',
      'L2_standard_internal_flow',
      'L3_cross_item_workflow',
      'L4_dependency_intent_template',
      'L5_process_constraint',
    ])

    expect(matrix.canDeclareDomainReleaseRuntimeClosureComplete).toBe(true)
    expect(matrix.assetTypes).toContain('t2_rhythm_schedule_runtime')
    expect(matrix.requiredSurfaces).toEqual([
      'asset_type_domain_writer',
      'runtime_consumer_verification',
      'impact_monitoring',
      'release_record',
      'rollback_writer_and_target',
    ])
    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'matrix_ready_is_not_future_asset_whitelist',
      'each_asset_type_must_keep_its_own_writer_consumer_monitoring_and_rollback',
    ]))

    const mainC19Row = extractRow(mainPlan, 'C-19.0')
    const ledgerC19Row = extractRow(ledgerPlan, 'C-19.0')
    const ledgerC19RouteRow = extractRow(ledgerPlan, 'C-19')
    expect(mainC19Row).toContain('不作为第三套架构')
    expect(ledgerC19Row).toContain('不作为第三套架构')
    expect(mainC19Row).toContain('C-19 runtime publication / release / rollback closeout fresh evidence 包已关闭产品闭环本轮真实环境门禁')
    expect(ledgerC19Row).toContain('C-19 runtime publication / release / rollback closeout fresh evidence 包已关闭产品闭环本轮真实环境门禁')
    expect(ledgerC19RouteRow).toContain('non-live 口径归位')
    expect(ledgerC19RouteRow).toContain('真实 runtime publication')
    expect(ledgerC19RouteRow).toContain('validation pass / failureCount=0 / mayClose=true')
    expect(ledgerC19RouteRow).toContain('P1 已收口 / 持续门禁')
  })

  it('keeps C-19 wording current: local architecture and scoped database integration are closed while same-SHA release remains gated', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const mainC1913 = extractRow(mainPlan, 'C-19.13')
    const mainC1914 = extractRow(mainPlan, 'C-19.14')
    const ledgerA10E12 = extractRow(ledgerPlan, 'A10-E12')
    const ledgerA10E14 = extractRow(ledgerPlan, 'A10-E14')
    const ledgerA10E18 = extractRow(ledgerPlan, 'A10-E18')

    for (const stalePhrase of [
      '待建 `experienceTierRegistry`',
      '待建 `DurationInputAssembler.assembleEngineInput`',
      '尚未形成统一模板资产、装配口径和发布门禁',
      '待建 T2 learning 管线',
      '待建 `BusinessTypeRegistry`',
      'T1/T2/T3 不是「做得不够」，是「压根没做」',
      '**纯空白**',
      '**从零立项**',
      '运行期杠杆仍接近 0',
      '建 experienceTierRegistry',
      '拆 durationContextService 上帝服务',
      '统一 DurationInputAssembler',
      '业态双轨与空间语义裸串收口',
    ]) {
      expect(mainPlan, stalePhrase).not.toContain(stalePhrase)
    }

    expect(mainPlan).toContain('experienceTierRegistryService` 已建首版 non-live registry')
    expect(mainPlan).toContain('durationInputAssemblerService` 已建首版 L3 只读装配入口')
    expect(mainPlan).toContain('T2 / registry / dictionary 的 non-live 首版已补并转入 A 台账')
    expect(mainPlan).toContain('2026-06-30 staging C-19 closeout fresh evidence')
    expect(mainC1914).toContain('统一纯策略服务和单一发布判定入口')

    expect(mainC1913).toContain('三入口接线')
    expect(mainC1913).toContain('phase-1 selector')
    expect(mainC1913).toContain('tie-break')
    expect(mainC1913).toContain('rejectedCandidates 人工复核优先级')
    expect(mainC1913).toContain('本轮已由 2026-06-30 staging C-19 closeout fresh evidence 承接关闭')
    expect(mainC1913).not.toContain('| 待启动 /')
    expect(mainC1914).toContain('所有自动资产先 canary')
    expect(mainC1914).toContain('发布、benchmark/project calibration 替换和回滚使用事务')
    expect(mainC1914).toContain('305/307 已定向应用')
    expect(mainC1914).toContain('同 SHA 部署、持续 canary/monitoring observation 与正式 release 仍待发布链完成')
    expect(mainC1914).not.toContain('| 待启动 |')

    expect(ledgerA10E12).toContain('本地已闭')
    expect(ledgerA10E12).toContain('validation failureCount=0 / mayClose=true')
    expect(ledgerA10E14).toContain('本地已闭')
    expect(ledgerA10E14).toContain('runtime reader / live replay / L5 发布链')
    expect(ledgerA10E18).toContain('本地已闭')
    expect(ledgerA10E18).toContain('本轮关闭')
  })

  it('locks the current duration-system four-item closure boundary in code and v1.4.23.1-A docs', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const durationContextSource = readFileSync(resolve(workspaceRoot, 'server/src/services/durationContextService.ts'), 'utf8')
    const factReadModelSource = readFileSync(resolve(workspaceRoot, 'server/src/services/durationContextFactReadModelService.ts'), 'utf8')

    expectContainsAll(ledgerPlan, [
      '2026-07-04 工期体系四项补证覆写',
      'readDurationContextTaskContextRow / readDurationContextResponsibleUnitHistoryRows / readDurationContextResourceConflictTaskRows',
      '`durationContextService` 不再导入或调用 `durationContextFactTable`',
      'durationContextActiveWeatherProductivityCeilingService',
      'durationContextSeasonalProductivityFactorService',
      'durationContextProcessSeasonalSensitivityFactorService',
      'durationContextWeatherForecastImpactFactorService',
      'durationContextProcessConstraintFactorService',
      'durationContextExternalReadinessFactorService',
      'durationContextProgressQualityFactorService',
      'durationContextProductivityCompensationFactorService',
      'durationContextProjectBaselineCalibrationFactorService',
      'durationContextPmRecoveryCompensationFactorService',
      'durationContextProjectScheduleStateFactorService',
      'durationContextWorkflowSequenceFactorService',
      '当前复核为 2829 行编排服务',
      '不是上帝服务已彻底拆完',
      'MG-07 仍 blocked',
      'allowValidate=true / allowWarmup=false / allowScheduler=false',
    ])
    expectContainsAll(mainPlan, [
      'durationContextFactReadModelService.durationContextFactTable(...)',
      '不能把“已过网关”误读为上帝服务已彻底消失',
    ])
    expect(durationContextSource).not.toContain('durationContextFactTable')
    expectContainsAll(durationContextSource, [
      'readDurationContextTaskContextRow',
      'readDurationContextResponsibleUnitHistoryRows',
      'readDurationContextResourceConflictTaskRows',
    ])
    expectContainsAll(factReadModelSource, [
      "durationContextFactTable('tasks')",
      "durationContextFactTable('task_conditions')",
      "durationContextFactTable('task_dependencies')",
    ])
  })

  it('locks locally closed C-09/C-11/C-14/C-15 ledger status and current live closeout evidence', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    expectContainsAll(extractRow(mainPlan, 'C-09'), [
      '统一治理链已补',
      '持续门禁',
      '不代表所有旧对象已物理删除',
      'legacyObjectDropGuardService',
      'guard:legacy-object-drop',
    ])
    expectContainsAll(extractRow(ledgerPlan, 'A10-E04'), [
      'deletionRetentionGovernanceService.ts',
      'deletionRetentionCleanupJob.ts',
      'C-09 从“待补 CI”升级为统一治理链已补',
      '不代表所有旧对象已物理删除',
      'legacyObjectDropGuardService',
      'guard:legacy-object-drop',
    ])

    expectContainsAll(extractRow(mainPlan, 'C-11'), [
      '核心口径已补',
      '持续门禁',
      'C-19 runtime publication / replay / canary / rollback / 人工复核 / live observation 已由 2026-06-30 staging C-19 closeout fresh evidence 关闭',
    ])
    expectContainsAll(extractRow(ledgerPlan, 'A10-E08'), [
      'durationSurface.contract.test.ts',
      'durationConsistency.contract.test.ts',
      'C-11 核心口径与 C-19.0 非第三系统 / runtime closure boundary 已升级为持续门禁',
      'C-19 runtime、replay、canary、rollback、人工复核与 live 证据已由 A10-E18 / 2026-06-30 staging C-19 closeout fresh evidence 关闭本轮 gate',
    ])

    expectContainsAll(extractRow(mainPlan, 'C-14'), [
      '核心事实层 non-live 已补',
      '持续门禁',
      '任务级边界',
      '不代表全空间 FK 或统计学完整因果',
    ])
    expectContainsAll(extractRow(ledgerPlan, 'A10-E07'), [
      'biStatusUtilities.test.ts',
      'runtimeExecutionInferenceService.test.ts',
      '五层闭环的 non-live 权威来源、归因链和 v1.5 降级边界已补契约',
      '仍不代表全空间 FK 或统计学完整因果',
    ])

    expectContainsAll(extractRow(mainPlan, 'C-15'), [
      '本地结构门禁已补',
      'C-15 live learning closeout 本轮 `validationStatus=pass / mayClose=true`',
      'maeBefore=0.64 / maeAfter=0.59 / evaluatedDecisionCount=1',
    ])
    expectContainsAll(extractRow(ledgerPlan, 'A10-E09'), [
      'durationContextPolicyLearningJob.test.ts',
      'durationLiveLearningProductionClaimAuditJobContract.test.ts',
      'durationContextPolicyAutoPublishGateService.test.ts',
      'C-15 live closeout 本轮通过',
      'validationStatus=pass / mayClose=true',
    ])
  })

  it('locks C-15 controlled runtime publication while keeping the production claim independently gated', () => {
    const schedulerSource = readFileSync(resolve(workspaceRoot, 'server', 'src', 'scheduler.ts'), 'utf8')
    const learningJobSource = readFileSync(resolve(workspaceRoot, 'server', 'src', 'jobs', 'durationContextPolicyLearningJob.ts'), 'utf8')
    const runtimePublicationBridgeSource = readFileSync(resolve(workspaceRoot, 'server', 'src', 'services', 'durationContextPolicyRuntimePublicationBridgeService.ts'), 'utf8')
    const productionClaimAuditContract = readFileSync(resolve(workspaceRoot, 'server', 'src', '__tests__', 'durationLiveLearningProductionClaimAuditJobContract.test.ts'), 'utf8')
    const autoPublishGateTest = readFileSync(resolve(workspaceRoot, 'server', 'src', '__tests__', 'durationContextPolicyAutoPublishGateService.test.ts'), 'utf8')
    const canaryGateTest = readFileSync(resolve(workspaceRoot, 'server', 'src', '__tests__', 'durationContextPolicyCanaryGateService.test.ts'), 'utf8')
    const canaryApprovalTest = readFileSync(resolve(workspaceRoot, 'server', 'src', '__tests__', 'durationContextPolicyCanaryApprovalService.test.ts'), 'utf8')
    const stateBucketTest = readFileSync(resolve(workspaceRoot, 'server', 'src', '__tests__', 'durationContextPolicyStateBucketService.test.ts'), 'utf8')
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    expect(schedulerSource).toContain("import { durationContextPolicyLearningJob } from './jobs/durationContextPolicyLearningJob.js'")
    expect(schedulerSource).toContain('durationContextPolicyLearningJob.start()')
    expect(schedulerSource).toContain('durationContextPolicyLearningJob.stop()')

    expect(learningJobSource).toContain('persistDecisions: false')
    expect(learningJobSource).toContain('learnDurationContextPolicyParameters')
    expect(learningJobSource).toContain('persist: true')
    expect(learningJobSource).toContain('generateDurationContextPolicyCanaryCandidates')
    expect(learningJobSource).toContain('autoPublishDurationContextPolicyCandidates')
    expect(learningJobSource).toContain("'stable_parameter_runtime_publication_with_monitoring_and_rollback'")
    expect(learningJobSource).toContain("'bounded_canary_parameter_runtime_publication_with_explicit_boundary'")
    expect(learningJobSource).toContain("'runtime_canary_rollback_restored_previous_stable'")
    expect(learningJobSource).toContain("policyVersionRegistryPolicy: 'registry_candidate_plus_runtime_parameter_publication_bridge'")
    expect(runtimePublicationBridgeSource).toContain('persistAlgorithmAssetLearnableParameterRuntimePublication')
    expect(runtimePublicationBridgeSource).toContain('recordAlgorithmAssetLearnableParameterImpactMonitoring')
    expect(runtimePublicationBridgeSource).toContain('executeAlgorithmAssetLearnableParameterRuntimeRollback')
    expect(runtimePublicationBridgeSource).toContain("releasePolicy: 'manual_professional_approval_required'")

    expect(productionClaimAuditContract).toContain("runtimeMutationPolicy: 'none_audit_only'")
    expect(productionClaimAuditContract).toContain("factMutationPolicy: 'fact_and_commitment_assets_locked'")
    expect(autoPublishGateTest).toContain('does not leave an approved orphan candidate when canary version persistence fails')
    expect(autoPublishGateTest).toContain('rollbackPolicy')
    expect(autoPublishGateTest).toContain('244_v14231_duration_context_policy_versions_active_scope_key.sql')
    expect(autoPublishGateTest).toContain('uq_duration_context_policy_versions_active_scope_action')
    expect(canaryGateTest).toContain('243_v14232c_duration_context_canary_company_scope.sql')
    expect(canaryGateTest).toContain('company_id')
    expect(canaryApprovalTest).toContain('rejects high-risk canary approval while allowing explicit rejection records')
    expect(canaryApprovalTest).toContain('rollbackDurationContextPolicyVersion')
    expect(stateBucketTest).toContain('experience:T2')
    expect(stateBucketTest).toContain('experience_tier_mismatch')

    const mainC152 = extractRow(mainPlan, 'C-15.2')
    const ledgerC152 = extractRow(ledgerPlan, 'C-15.2')
    const mainC1908 = extractRow(mainPlan, 'C-19.08')
    const a10e09 = extractRow(ledgerPlan, 'A10-E09')
    const ledgerC1908 = extractRow(ledgerPlan, 'C-19.08')
    for (const row of [mainC1908, ledgerC1908, a10e09]) {
      expect(row).toContain('离线治理壳已补')
      expect(row).toContain('candidate/version registry')
      expect(row).toContain('no-write')
      expect(row).toContain('rollback/orphan')
      expect(row).toContain('按资产类型隔离的 runtime publication 表面')
      expect(row).toContain('不是当前 non-live blocker')
      expect(row).not.toContain('离线治理壳待补')
      expect(row).not.toContain('runtime_publications 多表合并')
    }
    expect(a10e09).toContain('validationStatus=pass / mayClose=true')
    expect(a10e09).toContain('reward-mae-improvement')
    expect(a10e09).toContain('maeBefore=0.64 / maeAfter=0.59 / evaluatedDecisionCount=1')
    for (const row of [mainC152, ledgerC152]) {
      expect(row).toContain('offline replay 仍 report-only')
      expect(row).toContain('production-claim audit 仍 `none_audit_only`')
      expect(row).toContain('auto-publish 先形成候选/版本 registry')
      expect(row).toContain('受控参数 runtime publication bridge')
      expect(row).toContain('不写 task / fact / seed')
      expect(row).toContain('production claim 仍独立门禁')
      expect(row).toContain('生产学习闭环 live 门禁已归档')
      expect(row).toContain('新增策略或 scheduler 写面仍需重跑')
    }
    expect(mainC152).toContain('non-live 已收口 + 本轮 live closeout-ready')
    expect(ledgerC152).toContain('A10-E09 台账证据')
    expect(a10e09).toContain('durationContextPolicyLearningJob.test.ts')
    expect(a10e09).toContain('durationContextPolicyRuntimePublicationBridgeService.test.ts')
    expect(a10e09).toContain('durationContextPolicyLearningCheckpointService.test.ts')
    expect(a10e09).toContain('受控参数 runtime publication bridge')
    expect(a10e09).toContain('不写 task / fact / seed')
    expect(a10e09).toContain('durationLiveLearningProductionClaimAuditJobContract.test.ts')
    expect(a10e09).toContain('durationContextPolicyStateBucketService.test.ts')
    expect(a10e09).toContain('durationContextPolicyAutoPublishGateService.test.ts')
    expect(a10e09).toContain('durationContextPolicyCanaryGateService.test.ts')
    expect(a10e09).toContain('verify:v14231-non-live-closeout')
    expect(a10e09).toContain('active canary 唯一性')
    expect(a10e09).toContain('按资产类型隔离的 runtime publication 表面不是当前 non-live blocker')
    expect(a10e09).toContain('C-15 live closeout 本轮通过')
    expect(a10e09).toContain('validationStatus=pass / mayClose=true')
    expect(a10e09).toContain('不外推未来环境或无人审阅自动排程权威')
    expect(a10e09).not.toContain('validationStatus=fail / mayClose=false')
    expect(a10e09).not.toContain('maeBefore=0.126 / maeAfter=0.126')
  })

  it('locks C-19.01 experience-tier registry to contract-backed asset type gating', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const validT2Payload = {
      experienceTier: 'T2',
      experienceAssetType: 't2_division_rhythm_template',
      companyId: '11111111-1111-4111-8111-111111111111',
      wbsNodeTypes: ['division', 'subdivision'],
      experienceGroupKeys: [
        'T2:division:superstructure',
        'T2:subdivision:standard_floor_handover',
      ],
    }

    expect(assessExperienceTierCandidatePayload(validT2Payload)).toEqual(expect.objectContaining({
      status: 'tier_candidate_valid',
      tier: 'T2',
      rejectedReasons: [],
    }))
    expect(assessExperienceTierCandidatePayload({
      ...validT2Payload,
      experienceAssetType: undefined,
    }).rejectedReasons).toContain('missing_experience_asset_type')
    expect(assessExperienceTierCandidatePayload({
      ...validT2Payload,
      experienceAssetType: 'process_duration',
    }).rejectedReasons).toContain('unsupported_experience_asset_type:process_duration')

    const mainC1901 = extractRow(mainPlan, 'C-19.01')
    const a10e14 = extractRow(ledgerPlan, 'A10-E14')
    for (const row of [mainC1901, a10e14]) {
      expect(row).toContain('experienceTierRegistryService')
      expect(row).toContain('experienceAssetType')
      expect(row).toContain('reuseScope')
      expect(row).toContain('factSource')
      expect(row).toContain('fail-closed')
    }
    expect(mainC1901).toContain('migration 305/307 已在当前真实 Supabase 库定向应用')
    expect(a10e14).toContain('305/307 已应用并验证 RLS/ACL')
    expect(a10e14).toContain('同 SHA 应用部署、canary/monitor/rollback observation 与正式 release 仍待发布链完成')
  })

  it('locks C-19.12 construction organization asset typing to non-live registry evidence while leaving runtime closeout live-gated', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const constructionScenarioTest = readFileSync(resolve(workspaceRoot, 'server', 'src', '__tests__', 'constructionOrganizationScenarioGovernanceService.test.ts'), 'utf8')
    const dispositionMatrix = buildConstructionOrganizationExperienceAssetDispositionMatrix()
    const payloadAssessment = assessExperienceTierCandidatePayload({
      experienceTier: 'T3',
      experienceAssetType: 'construction_organization_profile',
      experienceGroupKeys: ['T3:business:general_civil'],
      learningScope: 'project_level',
      reuseScope: 'project',
      projectId: '22222222-2222-4222-8222-222222222222',
      companyId: '11111111-1111-4111-8111-111111111111',
    })

    expect(payloadAssessment).toEqual(expect.objectContaining({
      status: 'tier_candidate_valid',
      tier: 'T3',
      rejectedReasons: [],
    }))
    expect(constructionScenarioTest).toContain('construction_organization_profile')
    expect(constructionScenarioTest).toContain('assessExperienceTierCandidatePayload')
    expect(dispositionMatrix).toEqual(expect.objectContaining({
      status: 'non_live_object_disposition_closed',
      canDeclareNonLiveObjectDispositionClosed: true,
    }))
    expect(dispositionMatrix.rows.map((row) => row.objectKey)).toEqual([
      'construction_organization_profile_seed_candidate',
      'construction_organization_plan_option_experience_asset',
    ])
    expect(dispositionMatrix.rows.every((row) =>
      row.seedDisposition === 'not_algorithm_seed_do_not_write_algorithm_seed_records'
      && row.runtimeDisposition === 'not_runtime_reader_or_writer_until_release_exit'
      && row.mutationBoundary.writesSeed === false
      && row.mutationBoundary.readsRuntimeReader === false
    )).toBe(true)

    const mainC1912 = extractRow(mainPlan, 'C-19.12')
    const ledgerC1912 = extractRow(ledgerPlan, 'C-19.12')
    const a10e15 = extractRow(ledgerPlan, 'A10-E15')
    for (const row of [mainC1912, ledgerC1912, a10e15]) {
      expect(row).toContain('construction_organization_profile')
      expect(row).toContain('producer typed contract')
      expect(row).toContain('对象级登记矩阵已补')
      expect(row).toContain('non-live object disposition closed')
      expect(row).toContain('runtime')
      expect(row).toContain('live')
      expect(row).not.toContain('待对象级登记清单或废止说明')
      expect(row).not.toContain('剩余 non-live 仅是组织画像 seed / 方案选择经验资产')
      expect(row).not.toContain('组织画像 seed / 方案选择经验资产全登记、runtime reader')
    }
  })

  it('locks C-02 v1.4.1 historical P0/P1/P2 scope-modeling debts to a current non-live classification matrix', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const matrix = buildV141HistoricalScopeCloseoutMatrix()

    expect(matrix).toEqual(expect.objectContaining({
      matrixCode: 'v141_historical_scope_p0_p1_p2_closeout',
      status: 'non_live_classification_closed',
    }))
    expect(matrix.summary).toEqual(expect.objectContaining({
      totalCount: 17,
      canDeclareNonLiveClassificationClosed: true,
    }))
    expect(matrix.rows.map((row) => row.id)).toEqual([
      'P0-1',
      'P0-2',
      'P0-3',
      'P0-4',
      'P1-1',
      'P1-2',
      'P1-3',
      'P1-4',
      'P1-5',
      'P1-6',
      'P1-7',
      'P1-8',
      'P2-1',
      'P2-2',
      'P2-3',
      'P2-4',
      'P2-5',
    ])
    expect(matrix.rows.every((row) => row.evidenceRefs.length > 0 && row.guards.length > 0)).toBe(true)
    expect(matrix.rows.some((row) => row.status === 'fixed')).toBe(true)
    expect(matrix.rows.some((row) => row.status === 'continuous_guard')).toBe(true)
    expect(matrix.rows.some((row) => row.status === 'deprecated')).toBe(true)

    const mainC02 = extractRow(mainPlan, 'C-02')
    const ledgerA10E02 = extractRow(ledgerPlan, 'A10-E02')
    const ledgerC02 = extractRow(ledgerPlan, 'C-02')
    for (const row of [mainC02, ledgerA10E02, ledgerC02]) {
      expect(row).toContain('v141HistoricalScopeCloseoutMatrixService')
      expect(row).toContain('17/17')
      expect(row).toContain('non-live classification closed')
      expect(row).not.toContain('待核查 / 待门禁归并')
      expect(row).not.toContain('将 v1.4.1 中历史 P0/P1/P2')
    }
  })

  it('locks C-19.02/C-19.03 business and spatial WBS consumers to an explicit non-live coverage matrix', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const matrix = buildBusinessSpatialWbsConsumerCoverageMatrix()
    const requiredConsumers = [
      'projectFactsToTemplateService.businessTypeNormalization',
      'projectScenarioTaxonomyService.formalBusinessTypes',
      't2DivisionRhythmTemplateRegistryService.businessAndPhaseCoverage',
      'constructionScopeInferenceService.spatialSemantics',
      'wbsSeedSemanticGovernanceService.seedSemanticAudit',
      'wbsTemplateGenerationService.businessSpatialInputs',
      'projectGenerationFactsConsumerRegistry.wbsAndTemplateConsumers',
    ]

    expect(matrix).toEqual(expect.objectContaining({
      matrixCode: 'c1902_c1903_business_spatial_wbs_consumer_coverage',
      status: 'non_live_consumer_coverage_ready',
    }))
    expect(matrix.summary).toEqual(expect.objectContaining({
      rowCount: requiredConsumers.length,
      gapRowCount: 0,
      businessTypeRegistryStatus: 'ready',
      spatialSemanticDictionaryStatus: 'ready',
      canDeclareNonLiveConsumerCoverageClosed: true,
    }))
    expect(matrix.rows.map((row) => row.consumerKey)).toEqual(requiredConsumers)
    expect(matrix.rows.every((row) =>
      row.status === 'non_live_consumer_coverage_ready'
      && row.evidenceRefs.length > 0
      && row.mutationBoundary.readsRuntimeReader === false
      && row.mutationBoundary.writesTaskDependencies === false
      && row.mutationBoundary.writesPlanDates === false
      && row.mutationBoundary.writesSeed === false
      && row.mutationBoundary.writesRuntimePublications === false
    )).toBe(true)
    expect(matrix.rows.find((row) => row.consumerKey === 'wbsSeedSemanticGovernanceService.seedSemanticAudit')).toEqual(expect.objectContaining({
      spatialAuditUsed: true,
      wbsConsumerCoverage: 'guard_only',
    }))

    const mainC1902 = extractRow(mainPlan, 'C-19.02')
    const mainC1903 = extractRow(mainPlan, 'C-19.03')
    const a10e14 = extractRow(ledgerPlan, 'A10-E14')
    for (const row of [mainC1902, mainC1903, a10e14]) {
      expect(row).toContain('businessSpatialWbsConsumerCoverageMatrixService')
      expect(row).toContain('non-live consumer coverage closed')
      expect(row).toContain('runtime reader')
      expect(row).toContain('live replay')
      expect(row).toContain('L5 发布链')
      expect(row).not.toContain('consumer / WBS 覆盖清单仍需继续补索引或废止说明')
      expect(row).not.toContain('WBS 全消费 / 更广 consumer 迁移仍需覆盖清单或废止说明')
    }
  })

  it('locks C-19.15 to a read-only cold-start template asset view without upgrading runtime publication', () => {
    const report = collectDurationAlgorithmClosureGovernanceReport()
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const assetView = listDurationColdStartTemplateAssetView()

    expect(assetView).toEqual(expect.objectContaining({
      viewCode: 'duration_cold_start_template_asset_view',
      status: 'non_live_template_asset_view_ready',
    }))
    expect(assetView.summary).toEqual(expect.objectContaining({
      t2TemplateRowCount: assetView.t2RegistryAudit.templateCount,
      nonT2FamilyRowCount: 9,
      canDeclareNonLiveTemplateAssetViewClosed: true,
    }))
    expect(assetView.rows.filter((row) => row.family === 't2_division_rhythm_template')).toHaveLength(assetView.t2RegistryAudit.templateCount)
    expect(new Set(assetView.rows.map((row) => row.templateId)).size).toBe(assetView.rows.length)
    expect(assetView.rows.every((row) =>
      row.canAutoApply === false
      && row.sourceType
      && row.tier
      && row.reuseScope
      && row.businessType.length > 0
      && row.spatialScope.length > 0
      && row.maturity
      && row.confidence
      && row.governanceStatus
      && row.mutationBoundary.readsRuntimeReader === false
      && row.mutationBoundary.writesTaskDependencies === false
      && row.mutationBoundary.writesPlanDates === false
      && row.mutationBoundary.writesSeed === false
      && row.mutationBoundary.writesRuntimePublications === false
    )).toBe(true)
    expect(assetView.rows.some((row) => row.governanceStatus === 'compatibility_receipt_required')).toBe(true)
    expect(assetView.rows.some((row) => row.governanceStatus === 'registry_adapter_missing')).toBe(true)
    expect(report.assetInventory.assets.map((asset) => asset.key)).toContain('durationColdStartTemplateAssetView')

    const mainC1915 = extractRow(mainPlan, 'C-19.15')
    const a10e18 = extractRow(ledgerPlan, 'A10-E18')
    for (const row of [mainC1915, a10e18]) {
      expect(row).toContain('durationColdStartTemplateRegistryService')
      expect(row).toContain('read-only template asset view closed')
      expect(row).toContain('非 T2 模板族 gap 显式可见')
      expect(row).toContain('本轮')
      expect(row).toContain('2026-06-30 staging C-19 closeout fresh evidence')
      expect(row).not.toContain('后续仍需建总 `durationColdStartTemplateRegistry`')
    }
  })

  it('locks C-16 aggregate architecture ownership to route, system registry, and import-direction gates', async () => {
    const { evaluateSystemRegistryGuard } = await import(
      pathToFileURL(resolve(workspaceRoot, 'server', 'scripts', 'guard-system-registry.mjs')).href
    ) as {
      evaluateSystemRegistryGuard: (root?: string) => {
        registry: {
          entries: Array<{ kind: string; id: string }>
        }
        violations: unknown[]
      }
    }
    const serverPackageJson = readFileSync(resolve(workspaceRoot, 'server', 'package.json'), 'utf8')
    const deployWorkflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const registryGuard = evaluateSystemRegistryGuard(workspaceRoot)
    const registryCounts = countRegistryEntriesByKind(registryGuard.registry.entries)
    const ledgerRegistrySnapshot = ledgerPlan.match(
      /current non-live registry count:\s+(\d+) routes \/ (\d+) services \/ (\d+) jobs \/ (\d+) metrics \/ (\d+) migrations/,
    )

    expect(registryGuard.violations).toEqual([])
    expect(ledgerRegistrySnapshot).not.toBeNull()
    const historicalRegistryCounts = {
      routes: Number(ledgerRegistrySnapshot?.[1]),
      services: Number(ledgerRegistrySnapshot?.[2]),
      jobs: Number(ledgerRegistrySnapshot?.[3]),
      metrics: Number(ledgerRegistrySnapshot?.[4]),
      migrations: Number(ledgerRegistrySnapshot?.[5]),
    }
    const intentionallyRetiredCounts = {
      routes: 0,
      services: 2,
      jobs: 1,
      metrics: 0,
      migrations: 0,
    }
    for (const kind of Object.keys(historicalRegistryCounts) as Array<keyof typeof historicalRegistryCounts>) {
      expect(registryCounts[kind] + intentionallyRetiredCounts[kind]).toBeGreaterThanOrEqual(
        historicalRegistryCounts[kind],
      )
    }
    expect(registryGuard.registry.entries.map((entry) => entry.id)).not.toEqual(
      expect.arrayContaining([
        'publicProjectShadowCalibrationJob',
        'publicProjectShadowCalibrationService',
        'publicProjectShadowManifestService',
      ]),
    )

    for (const guardName of [
      'guard:route-ownership',
      'guard:system-registry',
      'guard:architecture-boundaries',
    ]) {
      expect(serverPackageJson).toContain(`"${guardName}"`)
      expect(deployWorkflow).toContain(`npm run ${guardName}`)
    }

    const mainC16 = extractRow(mainPlan, 'C-16')
    const ledgerC16 = extractRow(ledgerPlan, 'C-16')
    for (const row of [mainC16, ledgerC16]) {
      expect(row).toContain('guard-route-ownership')
      expect(row).toContain('guard-system-registry')
      expect(row).toContain('guard-architecture-boundaries')
      expect(row).toContain('durationContextProcessConstraintFactorService')
      expect(row).toContain('durationContextExternalReadinessFactorService')
      expect(row).toContain('routes /')
      expect(row).toContain('services /')
      expect(row).toContain('jobs /')
      expect(row).toContain('metrics /')
      expect(row).toContain('migrations assigned')
      expect(row).toContain('持续门禁')
    }
    const a10e11 = extractRow(ledgerPlan, 'A10-E11')
    expect(a10e11).toContain('guard-route-ownership')
    expect(a10e11).toContain('guard-system-registry')
    expect(a10e11).toContain('guard-architecture-boundaries')
    expect(a10e11).toContain('durationContextSampleReadModelService')
  }, 15000)

  it('locks current file-status ledger rows to non-live evidence without stale open wording', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    expect(mainPlan).toContain('§3 初始处理列只保留历史盘点')

    const staleStatusFragments = ['待扩面', '待门禁归并', '部分已补 / 持续扩面']

    const v146Rows = [
      extractRow(mainPlan, '`v1.4.6数据来源与映射关系体系执行方案.md`'),
      extractRow(ledgerPlan, '`v1.4.6数据来源与映射关系体系执行方案.md`'),
    ]
    for (const row of v146Rows) {
      expect(row).toContain('已补证据索引 / 持续扩面')
      expect(row).not.toContain('需门禁化')
    }

    const milestoneRow = extractLastRow(ledgerPlan, '`v1.4.9里程碑与关键节点体系执行方案.md`')
    const dataQualityRow = extractLastRow(ledgerPlan, '`v1.4.16数据质量与口径治理体系执行方案.md`')
    const metricRow = extractLastRow(ledgerPlan, '`v1.4.17统计指标口径体系执行方案.md`')
    for (const row of [milestoneRow, dataQualityRow, metricRow]) {
      for (const stale of staleStatusFragments) {
        expect(row).not.toContain(stale)
      }
    }
    expect(milestoneRow).toContain('持续门禁')
    expect(dataQualityRow).toContain('持续扩面')
    expect(metricRow).toContain('持续扩面')

    const currentV146StatusRow = extractLastRow(ledgerPlan, '`v1.4.6数据来源与映射关系体系执行方案.md`')
    for (const stale of staleStatusFragments) {
      expect(currentV146StatusRow).not.toContain(stale)
    }
    expect(currentV146StatusRow).toContain('已补证据索引 / 持续扩面')

    expectContainsAll(currentV146StatusRow, ['A10-E07', 'A10-E09', '统一证据索引'])
    expectContainsAll(milestoneRow, ['已补门禁 / 持续门禁', 'A10-E06', 'A10-E07'])
    expectContainsAll(dataQualityRow, [
      'summary',
      'metricRegistry',
      'guard',
    ])
    expectContainsAll(metricRow, [
      '已补当前守卫 / 持续扩面',
      'C-05',
      'A10-E11',
    ])
    const a10e11a = extractRow(ledgerPlan, 'A10-E11a')
    expectContainsAll(a10e11a, [
      'guard:route-aggregation',
      'guard:summary-service-aggregation',
      'guard:frontend-bi-aggregation',
      'guard:metric-ssot',
      'A10-E11a',
    ])
    expect(a10e11a).toContain('57 frontend BI files / 26/26 sites approved')
    expect(a10e11a).not.toContain('57 frontend BI files / 23/23 sites approved')

    const c01Rows = [extractRow(mainPlan, 'C-01'), extractRow(ledgerPlan, 'C-01')]
    for (const row of c01Rows) {
      expect(row).toContain('状态覆盖表已补')
      expect(row).toContain('持续更新')
      expect(row).not.toContain('| 补文件 |')
    }
    const mainC13 = extractRow(mainPlan, 'C-13')
    const ledgerC13 = extractRow(ledgerPlan, 'C-13')
    for (const row of [mainC13, ledgerC13]) {
      expectContainsAll(row, [
        'production-ready / needs-gating / not-ready',
        '未标注状态的一律视为 `not-ready`',
        '建模 / 生成 / 进度录入可按本轮 closeout 证据作为真实功能呈现',
        '分析 / 输出层仍按各自',
        'v1.5 当前可做',
      ])
      expect(row).not.toContain('| 补文件 |')
    }
    for (const row of [mainC13, ledgerC13]) {
      expect(row).toContain('当前治理清单已由 §4.7.05 C-13 首批能力判定表与契约测试锁定')
      expect(row).toContain('已锁定清单结构、允许状态、解锁 C 编号')
      expect(row).toContain('降级消费纪律')
      expect(row).toContain('current release gate')
      expect(row).toContain('browser execution status + generatedAt freshness + releaseDigest + artifactDigest + targetEnvironment')
      expect(row).not.toContain('explicit not-applicable reason')
      expect(row).toContain('v14231CapabilityReadinessService')
      expect(row).toContain('v14231-readiness')
    }

    const readinessService = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'services', 'v14231CapabilityReadinessService.ts'),
      'utf8',
    )
    const actionSurfaceService = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'services', 'v14231ActionableSurfaceRegistryService.ts'),
      'utf8',
    )
    const readinessRuntimeService = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'services', 'v14231ReadinessGateRuntimeService.ts'),
      'utf8',
    )
    const deployWorkflow = readFileSync(resolve(workspaceRoot, '.github', 'workflows', 'deploy.yml'), 'utf8')

    expect(readinessService).toContain('validateV14231ProductionReadyEvidenceBindings')
    expect(readinessService).toContain('evaluateV14231ReadinessGate')
    expect(readinessService).toContain('readiness_gate_release_digest_mismatch')
    expect(readinessRuntimeService).not.toContain('V14231_READINESS_GATE_EVIDENCE')
    expect(readinessRuntimeService).not.toContain('readFileSync')
    expect(deployWorkflow).toContain('write-v14231-readiness-gate.mjs')
    expect(actionSurfaceService).toContain('defaultUnregisteredSurfaceStatus')
    expect(actionSurfaceService).toContain('declaresProductionReady: false')
  })

  it('locks current guard-count and migration-governance evidence to the latest closeout artifacts', () => {
    const ledgerPlan = readPlan('v1.4.23.1-A体系')
    const maintenanceRule = ledgerPlan
      .split(/\r?\n/)
      .find((line) => line.startsWith('7. 本文件中带日期的旧 guard 数量'))
    if (!maintenanceRule) throw new Error('Missing A0 current guard-count maintenance rule')

    expect(maintenanceRule).toContain('guard:duration-architecture` 934 duration boundary files / legacy debt 0')
    expect(maintenanceRule).not.toContain('guard:duration-architecture` 912 duration boundary files / legacy debt 0')

    for (const rowId of ['A10-E03', 'A10-E15', 'A10-E17']) {
      const row = extractRow(ledgerPlan, rowId)
      expect(row).toContain('guard:duration-architecture')
      expect(row).toContain('934')
      expect(row).not.toContain('当前 2026-06-28 复跑 `guard:duration-architecture` 扫描 912')
    }

    const a10e11 = extractRow(ledgerPlan, 'A10-E11')
    const a10e11a = extractRow(ledgerPlan, 'A10-E11a')
    expect(a10e11).toContain('57 个前端 BI 文件且 26/26 个聚合位点显式审批')
    expect(a10e11a).toContain('57 frontend BI files / 26/26 sites approved')
    for (const row of [a10e11, a10e11a]) {
      expect(row).not.toContain('23/23')
    }

    const reportPath = resolve(
      workspaceRoot,
      'docs',
      'reports',
      'v14231_current_live_migration_governance_20260628.md',
    )
    const trackedEvidenceSummaryPath = resolve(
      workspaceRoot,
      'docs',
      'reports',
      'v14231_current_live_migration_governance_20260628.evidence.json',
    )
    const report = readFileSync(reportPath, 'utf8')
    const evidence = JSON.parse(readFileSync(trackedEvidenceSummaryPath, 'utf8')) as {
      sourceArtifactPath: string
      closeoutReadback: {
        schemaMigrationsRowCount: number
        keyMigrationsLedgered: string[]
        allowValidate: boolean
        allowWarmup: boolean
        allowScheduler: boolean
      }
      ledgeredMigrationFilenames: string[]
    }

    expect(evidence.sourceArtifactPath).toBe(
      'artifacts/test-runs/20260628-migration-governance-current-live/production-migration-governance-current-live.json',
    )
    expect(report).toContain('production-migration-governance-current-live.json')
    expect(report).toContain(`\`${evidence.closeoutReadback.schemaMigrationsRowCount}\` rows`)
    expect(report).not.toContain('`262` rows')

    for (const flag of ['allowValidate', 'allowWarmup', 'allowScheduler'] as const) {
      expect(report).toContain(`${flag}=${evidence.closeoutReadback[flag]}`)
    }
    expect(report).not.toContain('allowWarmup=false')
    expect(report).not.toContain('allowScheduler=false')

    for (const filename of evidence.closeoutReadback.keyMigrationsLedgered) {
      expect(report).toContain(filename)
    }
    expect(evidence.ledgeredMigrationFilenames).toContain('245_v14231_algorithm_asset_registry_view_acl_hardening.sql')
    expect(report).toContain('245_v14231_algorithm_asset_registry_view_acl_hardening.sql')
  })

  it('keeps C-18.L and C-13 rows aligned with current staging closeout fresh evidence', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    for (const plan of [mainPlan, ledgerPlan]) {
      const c18LiveRow = extractRow(plan, 'C-18.L 全量')
      expectContainsAll(c18LiveRow, [
        'status=pass / mayCloseAll=true / openGateCount=0',
        'C-15 已由同一 staging closeout 包内 C-15 live learning closeout 关闭',
      ])
      expect(c18LiveRow).not.toContain('全局 `openGateCount=1` 由 C-15 贡献')
    }

    const reportExportRow = extractRow(ledgerPlan, '报表 / 导出')
    expectContainsAll(reportExportRow, [
      '`production-ready`（当前 PDF/XLSX/业主月报链）',
      '`needs-gating`（正式公文、盖章与批量归档策略）',
      'C-05 / C-13 当前产品报表与导出范围已闭',
      'XLSX 已完成真实下载与文件读回',
    ])
    expect(reportExportRow).not.toContain('真实导入链压测 / 迁移幂等重放未闭合')

    const companyCockpitRow = extractRow(ledgerPlan, '公司驾驶舱 CompanyCockpit')
    expectContainsAll(companyCockpitRow, [
      '`production-ready`（当前验证规模与公司权限范围）',
      '`needs-gating`（超大组合或新增指标）',
      '真实租户数据、权限和浏览器钻取流程已验证',
    ])
    expect(companyCockpitRow).not.toContain('当前还没有真实 50/100/500')
  })

  it('keeps C-15 current learning evidence aligned across A10 and wiring status sections', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    const mainLearningGovernanceLine = mainPlan
      .split(/\r?\n/)
      .find((line) => line.startsWith('| 学习治理环 |'))
    if (!mainLearningGovernanceLine) throw new Error('Missing main learning governance row')

    const ledgerWiringStatus = ledgerPlan
      .split(/\r?\n/)
      .find((line) => line.startsWith('当前 wiring 状态：五引擎准度治理不能只看 service / table 是否存在。'))
    if (!ledgerWiringStatus) throw new Error('Missing ledger current wiring status paragraph')

    const a10e17 = extractRow(ledgerPlan, 'A10-E17')

    for (const text of [mainLearningGovernanceLine, ledgerWiringStatus, a10e17]) {
      expect(text).toContain('maeBefore=0.64 / maeAfter=0.59 / evaluatedDecisionCount=1')
      expect(text).not.toContain('reward / MAE 未严格改善')
      expect(text).not.toContain('真实学习闭环仍等样本和 live 证据')
      expect(text).not.toContain('补齐前，学习治理环状态仍必须标 `needs-gating`')
      expect(text).not.toContain('剩余尾项是生产样本、reward / MAE 回填')
    }
  })

  it('locks C-17.26 auto-publish persistence to an explicit transaction boundary', () => {
    const serviceSource = readFileSync(
      resolve(workspaceRoot, 'server', 'src', 'services', 'durationContextPolicyAutoPublishGateService.ts'),
      'utf8',
    )
    const testSource = readFileSync(
      resolve(workspaceRoot, 'server', 'src', '__tests__', 'durationContextPolicyAutoPublishGateService.test.ts'),
      'utf8',
    )
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    expect(serviceSource).toContain("await client.query('BEGIN')")
    expect(serviceSource).toContain("await client.query('SAVEPOINT duration_context_policy_auto_publish_version_insert')")
    expect(serviceSource).toContain("await client.query('ROLLBACK TO SAVEPOINT duration_context_policy_auto_publish_version_insert')")
    expect(serviceSource).toContain("await client.query('COMMIT')")
    expect(testSource).toContain('savepoint duration_context_policy_auto_publish_version_insert')
    expect(testSource).toContain('rollback to savepoint ')

    for (const row of [extractRow(mainPlan, 'C-17.26'), extractRow(ledgerPlan, 'C-17.26')]) {
      expect(row).toContain('BEGIN / SAVEPOINT / COMMIT')
      expect(row).toContain('事务化持续门禁')
      expect(row).not.toContain('当前仍不是数据库原子事务')
    }
  })

  it('locks C-16.2 as current-state backfilled into A rather than future work', () => {
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    for (const row of [extractRow(mainPlan, 'C-16.2'), extractRow(ledgerPlan, 'C-16.2')]) {
      expect(row).toContain('当前口径已收口')
      expect(row).toContain('新增 route、service 或 job 必须先归入双环 + 桥 + 横切 + 底座清单并继续进入同一门禁')
      expect(row).not.toContain('后续完成记录统一回填')
    }
  })

  it('keeps C-19.08 runtime-publication table separation as an accepted per-asset architecture decision', () => {
    const matrix = buildV14223DomainReleaseRuntimeClosureMatrix()
    const mainPlan = readPlan('v1.4.23.1体系')
    const ledgerPlan = readPlan('v1.4.23.1-A体系')

    expect(matrix.boundaryPolicy).toEqual(expect.arrayContaining([
      'each_asset_type_must_keep_its_own_writer_consumer_monitoring_and_rollback',
    ]))
    expect(matrix.assetTypes).toEqual(expect.arrayContaining([
      'metric_runtime',
      'construction_dependency_rule_runtime',
      't2_rhythm_schedule_runtime',
    ]))
    expect(matrix.canDeclareDomainReleaseRuntimeClosureComplete).toBe(true)

    for (const row of [
      extractRow(mainPlan, 'C-19.08'),
      extractRow(ledgerPlan, 'C-19.08'),
      extractRow(ledgerPlan, 'A10-E09'),
    ]) {
      expect(row).toContain('按资产类型隔离的 runtime publication 表面')
      expect(row).toContain('不是当前 non-live blocker')
      expect(row).toContain('live publish')
      expect(row).toContain('monitoring')
      expect(row).toContain('rollback')
      expect(row).not.toContain('runtime_publications 多表合并')
    }
  })
})
