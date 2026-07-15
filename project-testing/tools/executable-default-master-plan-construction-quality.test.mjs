import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  applyWizardDurationDatesForSimulation,
  auditConstructionQuality,
  buildSimulationFacts,
  buildSimplePlanMarkdown,
} from './generate-executable-default-master-plan-simulation.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPORT_PATH = path.resolve(
  SCRIPT_DIR,
  '..',
  'reports',
  'executable-default-master-plan-current-20260713-r35-business-facing-simple-plans',
  'all-business-type-plans.json',
)

test('simulation facts accept a high-difference business subtype without changing project scale', () => {
  const facts = buildSimulationFacts({ businessType: 'industrial' }, 'industrial_logistics')

  assert.equal(facts.businessSubtype, 'industrial_logistics')
  assert.equal(facts.totalAreaM2, 80000)
  assert.equal(facts.buildingCount, 3)
  assert.match(facts.projectName, /智能物流仓储/)
})

test('simulation labels office and complex civil subtypes without presenting them as residential projects', () => {
  const office = buildSimulationFacts({ businessType: 'general_civil' }, 'civil_office_commercial')
  const complex = buildSimulationFacts({ businessType: 'general_civil' }, 'civil_complex')

  assert.match(office.projectName, /办公塔楼及商业裙房/)
  assert.doesNotMatch(office.projectName, /三栋高层住宅/)
  assert.match(complex.projectName, /住宅办公商业综合体/)
})

test('all 11 generated plans pass construction-quality network and semantic gates', async () => {
  const report = JSON.parse(await fs.readFile(REPORT_PATH, 'utf8'))
  assert.equal(report.plans.length, 11)
  for (const plan of report.plans) {
    const audit = auditConstructionQuality(plan)
    assert.deepEqual(audit.blockers, [], `${plan.project.businessType}: ${JSON.stringify(audit)}`)
    assert.equal(audit.network.acyclic, true)
    assert.equal(audit.network.componentCount, 1)
    assert.equal(audit.network.rootCount, 1)
    assert.equal(audit.network.sinkCount, 1)
    assert.equal(audit.methodConflictCount, 0)
    assert.equal(audit.durationSemanticMismatchCount, 0)
    assert.equal(audit.duplicateDependencyPairCount, 0)
    assert.equal(audit.criticalPath.coversProjectStart, true)
    assert.equal(audit.criticalPath.coversProjectEnd, true)
    assert.equal(audit.criticalPath.continuous, true)
    assert.equal(plan.generation.masterPlanVisibilitySummary.policyCoverageRate, 1)
    assert.equal(plan.generation.masterPlanVisibilitySummary.phaseCoverageRate, 1)
    assert.equal(plan.generation.masterPlanVisibilitySummary.danglingVisibleDependencyCount, 0)
    assert.equal(plan.summary.inventedCrossStreamHandoffCount, 0)
    assert.ok(Array.isArray(plan.generation.durationAssetConsumptionReceipts))
    assert.ok(plan.generation.durationAssetConsumptionReceipts.some((receipt) => (
      receipt.status === 'effective_applied'
      && Array.isArray(receipt.changedFields)
      && receipt.changedFields.length > 0
    )))
    assert.equal(
      plan.generation.durationAssetConsumptionSummary.effectiveAppliedCount,
      plan.generation.durationAssetConsumptionReceipts.filter((receipt) => receipt.status === 'effective_applied').length,
    )
  }
})

test('all 11 generated plans render the same business-facing simple schedule contract', async () => {
  const report = JSON.parse(await fs.readFile(REPORT_PATH, 'utf8'))
  assert.equal(report.plans.length, 11)
  for (const plan of report.plans) {
    const markdown = buildSimplePlanMarkdown(plan)
    assert.match(markdown, /\| 序号 \| WBS \| 任务名称 \| 类型 \| 阶段 \| 计划开始 \| 计划完成 \| 工期（天） \| 前置任务 \| 关键 \|/)
    assert.doesNotMatch(markdown, /P20|P50|P80|标准工期资产|T2 节奏|责任单位|备注/)
    assert.match(markdown, new RegExp(plan.project.projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(markdown, new RegExp(`总控计划行：${plan.summary.scheduleRowCount}`))
  }
})

test('residential master plan hides internal vertical-transport constraints without deleting them', async () => {
  const report = JSON.parse(await fs.readFile(REPORT_PATH, 'utf8'))
  const residential = report.plans.find((plan) => plan.project.businessType === 'general_civil')
  assert.ok(residential)
  assert.equal(residential.summary.visibleSignificanceLeakRowCount, 0)
  assert.ok(residential.summary.hiddenInternalConstraintRowCount >= 6)
  assert.equal(residential.rows.some((row) => /塔吊|施工电梯安装与楼层运输保障/.test(row.title)), false)
  assert.ok(residential.generation.masterPlanVisibilitySummary.hiddenStableCodes.includes('RMP-01-05'))
  assert.ok(residential.generation.masterPlanVisibilitySummary.hiddenStableCodes.includes('RMP-01-06'))
  assert.ok(residential.generation.masterPlanVisibilitySummary.hiddenStableCodes.includes('RMP-10-01'))
})

test('construction audit detects a dependency cycle', () => {
  const plan = {
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-01-20' },
    rows: [
      row('A', 'A', '2026-01-01', '2026-01-10', [{ clientRowId: 'C', wbsCode: 'C', dependencyType: 'FS', lagDays: 0 }]),
      row('B', 'B', '2026-01-11', '2026-01-15', [{ clientRowId: 'A', wbsCode: 'A', dependencyType: 'FS', lagDays: 0 }]),
      row('C', 'C', '2026-01-16', '2026-01-20', [{ clientRowId: 'B', wbsCode: 'B', dependencyType: 'FS', lagDays: 0 }]),
    ],
  }
  const audit = auditConstructionQuality(plan)
  assert.equal(audit.network.acyclic, false)
  assert.ok(audit.blockers.includes('dependency_cycle_detected'))
})

test('construction audit rejects dates that violate an authored dependency', () => {
  const predecessor = row('PREDECESSOR', 'PREDECESSOR', '2026-01-10', '2026-01-20', [])
  const successor = row('SUCCESSOR', 'SUCCESSOR', '2026-01-12', '2026-01-18', [
    {
      clientRowId: 'PREDECESSOR',
      wbsCode: 'PREDECESSOR',
      dependencyType: 'FS',
      lagDays: 0,
    },
  ])

  const audit = auditConstructionQuality({
    summary: { projectStartDate: '2026-01-10', projectEndDate: '2026-01-20' },
    rows: [predecessor, successor],
  })

  assert.equal(audit.dependencyDateViolationCount, 1)
  assert.ok(audit.blockers.includes('dependency_date_constraint_violated'))
})

test('construction audit rejects a child scheduled outside its summary control window', () => {
  const parent = row('PARENT', 'PARENT', '2026-02-01', '2026-02-28', [], {
    isWbsSummary: true,
  })
  const child = row('CHILD', 'CHILD', '2026-01-20', '2026-02-10', [], {
    parentClientRowId: 'PARENT',
  })

  const audit = auditConstructionQuality({
    summary: { projectStartDate: '2026-01-20', projectEndDate: '2026-02-28' },
    rows: [parent, child],
  })

  assert.equal(audit.parentChildWindowViolationCount, 1)
  assert.ok(audit.blockers.includes('parent_child_schedule_window_violated'))
})

test('construction audit rejects an inverted industrial equipment mainline', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'industrial', buildingCount: 1 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-06-30' },
    rows: [
      row('FOUNDATION', 'IPL-02-01-01', '2026-05-20', '2026-05-25', [], {
        title: '工艺设备基础、预埋与二次灌浆',
      }),
      row('EQUIPMENT', 'IPL-03-01-01', '2026-05-10', '2026-05-18', [], {
        title: '生产设备就位、找正与单机试运转',
      }),
      row('CONTROL', 'IPL-03-01-02', '2026-05-01', '2026-05-08', [], {
        title: '供配电、仪表、PLC与生产线控制系统联调',
      }),
    ],
  })

  assert.equal(audit.specialtyMainlineViolationCount, 2)
  assert.ok(audit.blockers.includes('specialty_mainline_sequence_violated'))
})

test('construction audit rejects modular factory testing after onsite hoisting', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'modular_building', buildingCount: 1 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-31' },
    rows: [
      row('FAT', 'MIC-02-01-02', '2026-10-01', '2026-10-10', [], {
        title: '工厂带电带水试运行',
      }),
      row('HOIST', 'MIC-04-01-01', '2026-06-01', '2026-07-31', [], {
        title: '大吊装和临时支撑施工',
      }),
    ],
  })

  assert.equal(audit.specialtyMainlineViolationCount, 1)
  assert.ok(audit.blockers.includes('specialty_mainline_sequence_violated'))
})

test('construction audit rejects more generated building lanes than the wizard project declares', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'sports_culture', buildingCount: 1 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-31' },
    rows: [
      row('B1', 'SPC-01', '2026-01-01', '2026-06-01', [], { buildingObjectId: 'B1' }),
      row('B2', 'SPC-02', '2026-01-01', '2026-06-01', [], { buildingObjectId: 'B2' }),
    ],
  })

  assert.equal(audit.projectScopeContradictionCount, 1)
  assert.ok(audit.blockers.includes('project_scope_task_contradiction'))
})

test('construction audit detects mutually exclusive methods and semantic duration mismatch', () => {
  const plan = {
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-01-20' },
    rows: [
      row('A', 'A', '2026-01-01', '2026-01-05', [], {
        title: '筏型与箱型基础',
        standardWorkDurationSeedStableCode: 'foundation_pit_retaining_support',
      }),
      row('B', 'B', '2026-01-06', '2026-01-10', [{ clientRowId: 'A', wbsCode: 'A', dependencyType: 'FS', lagDays: 0 }], {
        title: '泥浆护壁成孔灌注桩基础',
        standardWorkDurationSeedStableCode: 'foundation_pit_retaining_support',
      }),
      row('C', 'C', '2026-01-11', '2026-01-20', [{ clientRowId: 'B', wbsCode: 'B', dependencyType: 'FS', lagDays: 0 }], {
        title: '竣工验收与移交',
        standardWorkDurationSeedStableCode: 'integrated_commissioning',
        critical: true,
      }),
    ],
  }
  const audit = auditConstructionQuality(plan)
  assert.ok(audit.methodConflictCount > 0)
  assert.ok(audit.durationSemanticMismatchCount > 0)
  assert.ok(audit.blockers.includes('mutually_exclusive_method_conflict'))
  assert.ok(audit.blockers.includes('duration_asset_semantic_mismatch'))
})

test('construction audit detects hierarchy-aware schedule propagation cycles', () => {
  const plan = {
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-01-20' },
    rows: [
      row('P', 'P', '2026-01-01', '2026-01-20', [{ clientRowId: 'C', wbsCode: 'C', dependencyType: 'FS', lagDays: 0 }]),
      row('C', 'C', '2026-01-01', '2026-01-10', [], { parentClientRowId: 'P' }),
    ],
  }
  const audit = auditConstructionQuality(plan)
  assert.equal(audit.schedulePropagation.acyclic, false)
  assert.ok(audit.blockers.includes('schedule_propagation_cycle_detected'))
})

test('construction audit detects a synthetic dependency from commissioning back into startup', () => {
  const commissioning = row('COMMISSION', 'IPL-05-04-02', '2026-01-01', '2026-01-05', [], {
    title: '工业消防、防爆与环保处理系统联调',
    executionPhase: 'commissioning',
    critical: true,
  })
  const startup = row('START', 'BTMP-BASE-01', '2026-01-01', '2026-01-20', [
    {
      clientRowId: 'COMMISSION',
      wbsCode: 'IPL-05-04-02',
      dependencyType: 'SS',
      lagDays: 0,
      intentCode: 'executable_default_master_plan_primary_control_spine',
    },
  ], {
    title: '施工准备与现场临设完成',
    executionPhase: 'startup_site_setup',
    critical: true,
  })
  const terminal = row('END', 'MS-01-01-11', '2026-12-01', '2026-12-01', [
    { clientRowId: 'START', wbsCode: 'BTMP-BASE-01', dependencyType: 'FS', lagDays: 0 },
  ], {
    title: '竣工验收备案完成',
    executionPhase: 'acceptance_handover',
    critical: true,
  })

  const audit = auditConstructionQuality({
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [commissioning, startup, terminal],
  })

  assert.equal(audit.syntheticPhaseInversionCount, 1)
  assert.ok(audit.blockers.includes('synthetic_dependency_phase_inversion'))
})

test('construction audit detects late execution work misclassified as management support', () => {
  const audit = auditConstructionQuality({
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [
      row('START', 'BTMP-BASE-01', '2026-01-01', '2026-01-20', [], {
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
      }),
      row('LATE', 'TRH-04-04-02', '2026-01-01', '2026-01-10', [
        { clientRowId: 'START', wbsCode: 'BTMP-BASE-01', dependencyType: 'SS', lagDays: 0 },
      ], {
        title: '综合运营指挥、应急处置与全网联调',
        executionPhase: 'management_support',
      }),
      row('END', 'MS-01-01-11', '2026-12-01', '2026-12-01', [
        { clientRowId: 'LATE', wbsCode: 'TRH-04-04-02', dependencyType: 'FS', lagDays: 0 },
      ], {
        title: '竣工验收备案完成',
        executionPhase: 'acceptance_handover',
      }),
    ],
  })

  assert.equal(audit.lateActivityPhaseMisclassificationCount, 1)
  assert.ok(audit.blockers.includes('late_activity_phase_misclassified'))
})

test('construction audit detects basement work that contradicts a zero-basement wizard fact', () => {
  const audit = auditConstructionQuality({
    project: {
      businessType: 'industrial',
      basementLevelCount: 0,
      foundationDepthM: 2,
    },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [
      row('START', 'BTMP-BASE-01', '2026-01-01', '2026-01-20', [], {
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
        critical: true,
      }),
      row('BASEMENT', 'BTMP-BASE-04', '2026-02-01', '2026-05-01', [
        { clientRowId: 'START', wbsCode: 'BTMP-BASE-01', dependencyType: 'FS', lagDays: 0 },
      ], {
        title: '地下结构施工与出正负零',
        executionPhase: 'basement_structure',
        critical: true,
      }),
      row('END', 'MS-01-01-11', '2026-12-01', '2026-12-01', [
        { clientRowId: 'BASEMENT', wbsCode: 'BTMP-BASE-04', dependencyType: 'FS', lagDays: 0 },
      ], {
        title: '竣工验收备案完成',
        executionPhase: 'acceptance_handover',
        critical: true,
      }),
    ],
  })

  assert.equal(audit.projectFactContradictionCount, 1)
  assert.ok(audit.blockers.includes('project_fact_task_contradiction'))
})

test('construction audit detects a deep-pit duration asset on a shallow modular foundation row', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'modular_building', basementLevelCount: 0, foundationDepthM: 2 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [
      row('START', 'BTMP-MOD-01', '2026-01-01', '2026-01-20', [], {
        title: '模块深化设计与工厂样板确认',
        executionPhase: 'startup_site_setup',
      }),
      row('FOUNDATION', 'BTMP-MOD-03', '2026-02-01', '2026-04-01', [{
        clientRowId: 'START', wbsCode: 'BTMP-MOD-01', dependencyType: 'FS', lagDays: 0,
      }], {
        title: '模块基础与吊装道路准备',
        executionPhase: 'foundation_pit_pile',
        standardWorkDurationSeedStableCode: 'foundation_pit_retaining_support',
      }),
      row('END', 'BTMP-MOD-10', '2026-12-01', '2026-12-01', [{
        clientRowId: 'FOUNDATION', wbsCode: 'BTMP-MOD-03', dependencyType: 'FS', lagDays: 0,
      }], {
        title: '模块整体调试移交、专项验收与竣工交付',
        executionPhase: 'acceptance_handover',
      }),
    ],
  })

  assert.equal(audit.projectFactContradictionCount, 1)
  assert.ok(audit.blockers.includes('project_fact_task_contradiction'))
})

test('construction audit detects late work released only by a synthetic project-start lag', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'data_center', basementLevelCount: 1 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [
      row('START', 'BTMP-BASE-01', '2026-01-01', '2026-01-20', [], {
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
        critical: true,
      }),
      row('UPS', 'DTC-02-01-01', '2026-09-01', '2026-09-30', [
        {
          clientRowId: 'START',
          wbsCode: 'BTMP-BASE-01',
          dependencyType: 'SS',
          lagDays: 243,
          intentCode: 'executable_default_master_plan_component_release',
        },
      ], {
        title: 'UPS和电池室安装调试',
        executionPhase: 'commissioning',
        critical: true,
      }),
      row('END', 'MS-01-01-11', '2026-12-01', '2026-12-01', [
        { clientRowId: 'UPS', wbsCode: 'DTC-02-01-01', dependencyType: 'FS', lagDays: 0 },
      ], {
        title: '竣工验收备案完成',
        executionPhase: 'acceptance_handover',
        critical: true,
      }),
    ],
  })

  assert.equal(audit.lateActivityMissingPhysicalHandoffCount, 1)
  assert.ok(audit.blockers.includes('late_activity_missing_physical_handoff'))
})

test('construction audit follows nested commissioning dependencies to reject a synthetic-only release chain', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'modular_building', basementLevelCount: 0, foundationDepthM: 2 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [
      row('START', 'BTMP-MOD-01', '2026-01-01', '2026-01-20', [], {
        title: '模块深化设计与工厂样板确认',
        executionPhase: 'startup_site_setup',
      }),
      row('GATE', 'MIC-GATE', '2026-09-01', '2026-09-05', [{
        clientRowId: 'START',
        wbsCode: 'BTMP-MOD-01',
        dependencyType: 'SS',
        lagDays: 243,
        intentCode: 'executable_default_master_plan_component_release',
      }], {
        title: '系统接口条件确认',
        executionPhase: 'commissioning',
      }),
      row('LATE', 'MIC-06-01-20', '2026-09-06', '2026-09-10', [{
        clientRowId: 'GATE',
        wbsCode: 'MIC-GATE',
        dependencyType: 'FS',
        lagDays: 0,
        intentCode: 'executable_default_master_plan_sibling_release_rhythm',
      }], {
        title: '整栋联动调试与功能复测',
        executionPhase: 'commissioning',
      }),
      row('END', 'MS-01-01-11', '2026-12-01', '2026-12-01', [{
        clientRowId: 'LATE',
        wbsCode: 'MIC-06-01-20',
        dependencyType: 'FS',
        lagDays: 0,
      }], {
        title: '竣工验收备案完成',
        executionPhase: 'acceptance_handover',
      }),
    ],
  })

  assert.equal(audit.lateActivityMissingPhysicalHandoffCount, 1)
  assert.ok(audit.blockers.includes('late_activity_missing_physical_handoff'))
})

test('construction audit detects contractual closeout milestones disconnected from commissioning and acceptance', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'transportation_hub', basementLevelCount: 2 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [
      row('START', 'BTMP-BASE-01', '2026-01-01', '2026-01-20', [], {
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
        critical: true,
      }),
      row('FILING', 'MS-01-01-11', '2026-11-30', '2026-11-30', [
        {
          clientRowId: 'START',
          wbsCode: 'BTMP-BASE-01',
          dependencyType: 'SS',
          lagDays: 333,
          intentCode: 'executable_default_master_plan_component_release',
        },
      ], {
        title: '竣工验收备案完成',
        executionPhase: 'acceptance_handover',
        contractualCloseoutRole: 'completion_filing',
        contractualTerminalControlCode: 'BTMP-TRH-06',
        critical: true,
      }),
      row('HANDOVER', 'MS-01-01-12', '2026-12-01', '2026-12-01', [
        { clientRowId: 'FILING', wbsCode: 'MS-01-01-11', dependencyType: 'FS', lagDays: 0 },
      ], {
        title: '物业业主移交保修启动',
        executionPhase: 'acceptance_handover',
        contractualCloseoutRole: 'property_handover',
        contractualTerminalControlCode: 'BTMP-TRH-06',
        critical: true,
      }),
    ],
  })

  assert.equal(audit.contractualCloseoutMissingHandoffCount, 1)
  assert.ok(audit.blockers.includes('contractual_closeout_missing_business_handoff'))
})

test('construction audit rejects filing attached to an intermediate commissioning row instead of the declared terminal', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'transportation_hub', basementLevelCount: 2 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [
      row('START', 'BTMP-BASE-01', '2026-01-01', '2026-01-20', [], {
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
      }),
      row('INTERMEDIATE', 'BTMP-TRH-05', '2026-09-01', '2026-10-01', [{
        clientRowId: 'START', wbsCode: 'BTMP-BASE-01', dependencyType: 'SS', lagDays: 243,
      }], {
        title: '站台接口验收与运营联调条件确认',
        executionPhase: 'commissioning',
      }),
      row('TERMINAL', 'BTMP-TRH-06', '2026-10-02', '2026-11-01', [{
        clientRowId: 'INTERMEDIATE', wbsCode: 'BTMP-TRH-05', dependencyType: 'FS', lagDays: 0,
      }], {
        title: '枢纽联调联试与运营移交',
        executionPhase: 'acceptance_handover',
      }),
      row('FILING', 'BTMP-CLOSEOUT-01', '2026-11-02', '2026-11-02', [{
        clientRowId: 'INTERMEDIATE', wbsCode: 'BTMP-TRH-05', dependencyType: 'FS', lagDays: 0,
      }], {
        title: '竣工验收备案完成',
        executionPhase: 'acceptance_handover',
        contractualCloseoutRole: 'completion_filing',
        contractualTerminalControlCode: 'BTMP-TRH-06',
      }),
      row('HANDOVER', 'BTMP-CLOSEOUT-02', '2026-11-03', '2026-11-03', [{
        clientRowId: 'FILING', wbsCode: 'BTMP-CLOSEOUT-01', dependencyType: 'FS', lagDays: 0,
      }], {
        title: '物业业主移交保修启动',
        executionPhase: 'acceptance_handover',
        contractualCloseoutRole: 'property_handover',
        contractualTerminalControlCode: 'BTMP-TRH-06',
      }),
    ],
  })

  assert.equal(audit.contractualCloseoutMissingHandoffCount, 1)
  assert.ok(audit.blockers.includes('contractual_closeout_missing_business_handoff'))
})

test('construction audit rejects a non-residential plan with the entire contractual closeout chain missing', () => {
  const audit = auditConstructionQuality({
    project: { businessType: 'hotel', basementLevelCount: 2 },
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-12-01' },
    rows: [
      row('START', 'BTMP-BASE-01', '2026-01-01', '2026-01-20', [], {
        title: '施工准备与现场临设完成',
        executionPhase: 'startup_site_setup',
      }),
      row('TERMINAL', 'BTMP-HTL-06', '2026-11-01', '2026-12-01', [{
        clientRowId: 'START', wbsCode: 'BTMP-BASE-01', dependencyType: 'SS', lagDays: 304,
      }], {
        title: '酒店试运营移交与开业条件确认',
        executionPhase: 'acceptance_handover',
      }),
    ],
  })

  assert.equal(audit.contractualCloseoutMissingHandoffCount, 2)
  assert.ok(audit.blockers.includes('contractual_closeout_missing_business_handoff'))
})

test('construction audit excludes record-only WBS summaries from duration assets and primary CPM', () => {
  const summary = {
    ...row('ROOT', 'ROOT', '2026-01-01', '2026-01-20', []),
    isWbsSummary: true,
    durationContributionMode: 'record_only',
    standardWorkDurationSeedStableCode: null,
  }
  const first = row('A', 'A', '2026-01-01', '2026-01-10', [], {
    parentClientRowId: 'ROOT',
    critical: true,
    standardWorkDurationSeedStableCode: 'generic_seed',
  })
  const second = row('B', 'B', '2026-01-11', '2026-01-20', [
    { clientRowId: 'A', wbsCode: 'A', dependencyType: 'FS', lagDays: 0 },
  ], {
    parentClientRowId: 'ROOT',
    critical: true,
    standardWorkDurationSeedStableCode: 'generic_seed',
  })

  const audit = auditConstructionQuality({
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-01-20' },
    rows: [summary, first, second],
  })

  assert.deepEqual(audit.blockers, [])
  assert.equal(audit.durationSemanticMismatchCount, 0)
  assert.equal(audit.network.componentCount, 1)
  assert.equal(audit.network.rootCount, 1)
  assert.equal(audit.network.sinkCount, 1)
  assert.equal(audit.schedulePropagation.acyclic, true)
})

test('construction audit accepts governed hotel mockup and modular foundation proxy mappings', () => {
  const hotelMockup = row('hotel-mockup', 'BTMP-HTL-01', '2026-01-01', '2026-01-10', [], {
    title: '酒店样板层与机电综合样板确认',
    standardWorkDurationSeedStableCode: 'interior_public_finish',
  })
  const modularFoundation = row('modular-foundation', 'BTMP-MOD-03', '2026-01-11', '2026-01-20', [
    { clientRowId: 'hotel-mockup', wbsCode: 'BTMP-HTL-01', dependencyType: 'FS', lagDays: 0 },
  ], {
    title: '模块基础与吊装道路准备',
    standardWorkDurationSeedStableCode: 'foundation_pit_retaining_support',
  })

  const audit = auditConstructionQuality({
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-01-20' },
    rows: [hotelMockup, modularFoundation],
  })

  assert.equal(audit.durationSemanticMismatchCount, 0)
})

test('construction audit recognizes structural strengthening terminology for renovation duration assets', () => {
  const strengthening = row('strengthening', 'RNV-02-01-02', '2026-01-01', '2026-01-24', [], {
    title: '梁板柱补强和新旧结构连接施工',
    standardWorkDurationSeedStableCode: 'expert_domain_renovation_retrofit',
  })

  const audit = auditConstructionQuality({
    summary: { projectStartDate: '2026-01-01', projectEndDate: '2026-01-24' },
    rows: [strengthening],
  })

  assert.equal(audit.durationSemanticMismatchCount, 0)
})

test('simulation applies final duration authority to dates and propagates FS successors', () => {
  const predecessor = generatedRow('A', '2026-01-01', '2026-01-05', 20)
  const successor = generatedRow('B', '2026-01-06', '2026-01-10', 5, [{
    clientRowId: 'A',
    dependencyType: 'FS',
    lagDays: 0,
  }])

  applyWizardDurationDatesForSimulation([predecessor, successor])

  assert.equal(predecessor.values.planned_end_date, '2026-01-20')
  assert.equal(successor.values.planned_start_date, '2026-01-21')
  assert.equal(successor.values.planned_end_date, '2026-01-25')
})

function row(clientRowId, wbsCode, plannedStartDate, plannedEndDate, predecessors, overrides = {}) {
  return {
    clientRowId,
    wbsCode,
    title: overrides.title ?? wbsCode,
    parentClientRowId: overrides.parentClientRowId ?? null,
    plannedStartDate,
    plannedEndDate,
    standardWorkDurationSeedStableCode: overrides.standardWorkDurationSeedStableCode ?? 'site_setup_temp_works',
    executionPhase: overrides.executionPhase ?? null,
    contractualCloseoutRole: overrides.contractualCloseoutRole ?? null,
    contractualTerminalControlCode: overrides.contractualTerminalControlCode ?? null,
    isWbsSummary: overrides.isWbsSummary ?? false,
    buildingObjectId: overrides.buildingObjectId ?? null,
    predecessors,
    critical: overrides.critical ?? false,
  }
}

function generatedRow(clientRowId, plannedStartDate, plannedEndDate, referenceDurationDays, predecessors = []) {
  return {
    clientRowId,
    parentClientRowId: null,
    predecessorClientRowIds: predecessors.map((dependency) => dependency.clientRowId),
    predecessorDependencies: predecessors,
    rowProjectionMode: 'schedule_row',
    planItemKind: 'work_task',
    values: {
      title: clientRowId,
      planned_start_date: plannedStartDate,
      planned_end_date: plannedEndDate,
      start_date: plannedStartDate,
      end_date: plannedEndDate,
      smart_reference_days: referenceDurationDays,
      duration_contribution_mode: 'duration_bearing',
      is_wbs_summary: false,
      is_executable: true,
      standard_task_metadata: {
        durationAssetCalculation: {
          selectedDurationDays: referenceDurationDays,
        },
      },
    },
  }
}
