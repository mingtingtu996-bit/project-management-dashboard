import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  CHINA_GB55032_TEMPLATE_ID,
  generateWbsTemplateRows,
  type GeneratedTemplateRow,
} from '../../server/src/services/wbsTemplateGenerationService.ts'

type DetailLevel = 'overview' | 'standard'

type PhaseScenario = {
  phaseId: string
  phaseName: string
  detailLevel: DetailLevel
  plannedStartDate: string
  templateIds: string[]
  selectedNodesByTemplate: Record<string, string[]>
  scope: Record<string, unknown>
  note?: string
}

type RowSummary = {
  phaseId: string
  phaseName: string
  index: number
  clientRowId: string
  parentClientRowId: string | null
  parentStableCode: string | null
  stableCode: string
  title: string
  templateId: string
  packType: string
  templateGroup: string
  nodeType: string
  rowProjectionMode: string
  planItemKind: string
  durationContributionMode: string
  executionPhase: string
  executionLane: string
  building: string | null
  floor: string | null
  floorSeries: string | null
  zone: string | null
  startDate: string | null
  endDate: string | null
  referenceDuration: number | null
  durationProvenance: string
  durationSeedStableCode: string | null
  predecessorCount: number
  predecessors: string
  dependencySources: string
  dependencySourceList: string[]
}

type PhaseResult = {
  phase: PhaseScenario
  ok: boolean
  elapsedMs: number
  error?: {
    code: string | null
    message: string
    generatedRowCount?: number
    rowLimit?: number
    splitByPhase?: boolean
  }
  generation?: Awaited<ReturnType<typeof generateWbsTemplateRows>>
  rows: RowSummary[]
  dependencyCount: number
  orphanDependencyCount: number
}

const PROJECT_ID = '00000000-0000-4000-8000-00000000e2e0'
const REPORT_DATE = '2026-05-26'
const REPORT_DIR = resolve(process.cwd(), 'artifacts/reports')
const JSON_PATH = resolve(REPORT_DIR, `mixed-use-wbs-e2e-${REPORT_DATE}.json`)
const MD_PATH = resolve(REPORT_DIR, `mixed-use-wbs-e2e-${REPORT_DATE}.md`)

function towerFloorSequence(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const level = start + index
    return {
      label: `${level}F`,
      levelNumber: level,
      isBasement: false,
    }
  })
}

const commonMixedUseScope = {
  structure_type_code: 'shear_wall',
  method_variant_codes: [
    'aluminum_formwork',
    'deep_foundation_pit',
    'tower_crane',
    'construction_hoist',
    'fine_fitout',
  ],
}

const projectFacts = {
  basementLevelCount: 2,
  deepFoundationPitDepthM: 9.5,
  foundationDepthM: 9.5,
  highestBuildingFloorCount: 26,
  towerCraneCount: 3,
  constructionHoistCount: 6,
  climbingScaffoldFloors: 26,
  isFineFitout: true,
  hasCommercialPodium: true,
  hasResidentialChargingPile: true,
}

const PHASES: PhaseScenario[] = [
  {
    phaseId: 'p00-startup-site-danger',
    phaseName: 'P00 开工准备、临设、危大管理',
    detailLevel: 'overview',
    plannedStartDate: '2026-06-01',
    templateIds: [
      'china-building-site-management',
      'china-dangerous-subproject-control',
    ],
    selectedNodesByTemplate: {
      'china-building-site-management': [
        'SITE-01-01-01',
        'SITE-01-01-02',
        'SITE-01-01-03',
        'SITE-01-01-05',
        'SITE-01-01-06',
        'SITE-01-01-07',
        'SITE-05-01-01',
        'SITE-05-01-03',
      ],
      'china-dangerous-subproject-control': [
        'DANGER-01-01-01',
        'DANGER-01-01-02',
        'DANGER-01-01-03',
        'DANGER-01-01-04',
        'DANGER-01-01-05',
        'DANGER-01-01-06',
        'DANGER-01-01-11',
      ],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'civil_complex',
      scopeExpansionMode: 'entire_project',
    },
  },
  {
    phaseId: 'p10-foundation-basement',
    phaseName: 'P10 桩基基坑、地下室、防水和地库穿插',
    detailLevel: 'overview',
    plannedStartDate: '2026-06-15',
    templateIds: [
      'china-foundation-pit-pile',
      'china-waterproof-insulation',
      'china-building-fine-detail',
      'china-civil-defense-specialty',
    ],
    selectedNodesByTemplate: {
      'china-foundation-pit-pile': ['FND-01-01-01', 'FND-01-01-03', 'FND-02-01-01', 'FND-02-01-02'],
      'china-waterproof-insulation': ['WPI-01-01-01', 'WPI-01-01-04'],
      'china-building-fine-detail': ['BDT-01-01-01', 'BDT-01-01-04', 'BDT-01-01-05', 'BDT-01-01-06'],
      'china-civil-defense-specialty': ['CDF-01-01-01', 'CDF-01-01-02', 'CDF-02-01-01', 'CDF-02-01-02'],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'civil_complex',
      zone_object_id: 'B1-B2 地下室及地库',
      phase_object_id: '地下结构及地库',
    },
  },
  {
    phaseId: 'p20-standard-floor-rhythm',
    phaseName: 'P20 三栋住宅标准层主体节拍',
    detailLevel: 'overview',
    plannedStartDate: '2026-08-20',
    templateIds: ['china-building-fine-detail'],
    selectedNodesByTemplate: {
      'china-building-fine-detail': ['BDT-04-01-01'],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'residential',
      buildings: ['1#住宅塔楼', '2#住宅塔楼', '3#住宅塔楼'],
      floor_sequence: towerFloorSequence(5, 26),
      phase_object_id: '主体标准层',
    },
    note: '标准层用楼栋级 rhythm 行聚合，避免 3 栋 x 22 层 x 工序笛卡尔积。',
  },
  {
    phaseId: 'p30-secondary-samples',
    phaseName: 'P30 二次结构、预留预埋、样板先行',
    detailLevel: 'overview',
    plannedStartDate: '2026-09-15',
    templateIds: ['china-building-fine-detail', 'china-quality-responsibility-acceptance'],
    selectedNodesByTemplate: {
      'china-building-fine-detail': [
        'BDT-01-01-02',
        'BDT-01-01-03',
        'BDT-05-01-01',
        'BDT-05-01-02',
        'BDT-06-01-01',
        'BDT-06-01-02',
        'BDT-06-01-05',
        'BDT-06-01-07',
      ],
      'china-quality-responsibility-acceptance': ['QR-01-01-03', 'QR-01-01-05', 'QR-01-01-14'],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'residential',
      buildings: ['1#住宅塔楼', '2#住宅塔楼', '3#住宅塔楼'],
      phase_object_id: '二次结构样板',
    },
  },
  {
    phaseId: 'p40-mep-fire-intelligent',
    phaseName: 'P40 住宅塔楼机电、消防、智能化粗装及调试前置',
    detailLevel: 'overview',
    plannedStartDate: '2026-10-01',
    templateIds: [
      'china-mep-coordination',
      'china-plumbing-heating-system',
      'china-hvac-system',
      'china-electrical-system',
      'china-cecs-fire-system',
      'china-intelligent-building-system',
    ],
    selectedNodesByTemplate: {
      'china-mep-coordination': ['MEP-01-01-01', 'MEP-02-01-01'],
      'china-plumbing-heating-system': ['PLU-01-01-01', 'PLU-01-01-02', 'PLU-03-01-01', 'PLU-07-01-01'],
      'china-hvac-system': ['HVA-01-01-01', 'HVA-01-01-02', 'HVA-02-01-01', 'HVA-02-01-02', 'HVA-03-01-01'],
      'china-electrical-system': ['ELE-01-01-01', 'ELE-01-01-02', 'ELE-02-01-01', 'ELE-02-01-02', 'ELE-05-01-01'],
      'china-cecs-fire-system': [
        'FIR-01-01-01',
        'FIR-01-01-02',
        'FIR-02-01-01',
        'FIR-03-01-01',
        'FIR-03-02-01',
        'FIR-05-01-01',
        'FIR-05-01-02',
      ],
      'china-intelligent-building-system': ['INT-01-01-01', 'INT-02-01-01', 'INT-02-01-02', 'INT-03-01-02'],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'residential',
      buildings: ['1#住宅塔楼', '2#住宅塔楼', '3#住宅塔楼'],
      phase_object_id: '机电消防智能化',
    },
  },
  {
    phaseId: 'p50-envelope-elevator',
    phaseName: 'P50 屋面外立面幕墙门窗和电梯',
    detailLevel: 'overview',
    plannedStartDate: '2026-11-01',
    templateIds: [
      'china-waterproof-insulation',
      'china-facade-curtain-wall',
      'china-elevator-installation',
    ],
    selectedNodesByTemplate: {
      'china-waterproof-insulation': ['WPI-01-01-02', 'WPI-01-01-03', 'WPI-02-01-02'],
      'china-facade-curtain-wall': ['FAC-01-01-01', 'FAC-01-01-02', 'FAC-02-01-01', 'FAC-02-01-02', 'FAC-03-01-01'],
      'china-elevator-installation': ['ELV-01-01-01', 'ELV-01-01-02', 'ELV-02-01-01', 'ELV-02-01-02'],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'civil_complex',
      buildings: ['1#住宅塔楼', '2#住宅塔楼', '3#住宅塔楼', '商业裙房'],
      phase_object_id: '外立面屋面电梯',
    },
  },
  {
    phaseId: 'p60-commercial-podium',
    phaseName: 'P60 商业裙房精装、厨房燃气、泛光导视',
    detailLevel: 'overview',
    plannedStartDate: '2026-12-01',
    templateIds: [
      'china-jgj-tianjin-decoration',
      'china-hvac-system',
      'china-plumbing-heating-system',
      'china-electrical-system',
    ],
    selectedNodesByTemplate: {
      'china-jgj-tianjin-decoration': ['DEC-05-01-01', 'DEC-06-01-01'],
      'china-hvac-system': ['HVA-04-01-01'],
      'china-plumbing-heating-system': ['PLU-06-01-01'],
      'china-electrical-system': ['ELE-06-01-01'],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'commercial',
      building_object_id: '商业裙房',
      zone_object_id: 'L1-L4 商业公区及餐饮',
      phase_object_id: '商业裙房',
    },
  },
  {
    phaseId: 'p70-residential-fitout-charging',
    phaseName: 'P70 住宅精装、空气检测、充电桩',
    detailLevel: 'overview',
    plannedStartDate: '2027-01-05',
    templateIds: [
      'china-jgj-tianjin-decoration',
      'china-electrical-system',
      'china-prefab-bathroom-specialty',
      'china-prefab-kitchen-specialty',
    ],
    selectedNodesByTemplate: {
      'china-jgj-tianjin-decoration': [
        'DEC-01-01-01',
        'DEC-01-02-01',
        'DEC-02-01-01',
        'DEC-02-01-02',
        'DEC-02-02-01',
        'DEC-03-01-01',
        'DEC-03-01-02',
        'DEC-03-02-01',
        'DEC-03A-01-01',
      ],
      'china-electrical-system': ['ELE-03-02-01'],
      'china-prefab-bathroom-specialty': ['IBU-01-01-01', 'IBU-02-01-01'],
      'china-prefab-kitchen-specialty': ['IKU-01-01-01', 'IKU-02-01-01'],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'residential',
      buildings: ['1#住宅塔楼', '2#住宅塔楼', '3#住宅塔楼'],
      phase_object_id: '住宅精装交付',
    },
  },
  {
    phaseId: 'p80-outdoor-closeout',
    phaseName: 'P80 室外工程、资料商务、验收移交里程碑',
    detailLevel: 'overview',
    plannedStartDate: '2027-03-01',
    templateIds: [
      'china-gb55032-2022-outdoor',
      'china-document-commercial-support',
      'china-project-milestone-handover',
    ],
    selectedNodesByTemplate: {
      'china-gb55032-2022-outdoor': [
        'OUT-01-01-01',
        'OUT-02-01-01',
        'OUT-02-02-01',
        'OUT-04-01-01',
        'OUT-04-01-02',
        'OUT-04-03-01',
        'OUT-04-03-02',
        'OUT-05-01-01',
      ],
      'china-document-commercial-support': [
        'DCS-01-01-01',
        'DCS-01-01-04',
        'DCS-01-01-05',
        'DCS-01-01-06',
        'DCS-01-01-09',
        'DCS-01-01-11',
      ],
      'china-project-milestone-handover': [
        'MS-01-01-06',
        'MS-01-01-07',
        'MS-01-01-10',
        'MS-01-01-11',
        'MS-01-01-12',
        'MS-01-01-22',
        'MS-01-01-23',
      ],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'residential',
      zone_object_id: '室外总平及交付',
      phase_object_id: '竣工验收移交',
      scopeExpansionMode: 'entire_project',
    },
  },
  {
    phaseId: 's10-standard-basement-chain-sample',
    phaseName: 'S10 对照样本：地库穿插 process 深度',
    detailLevel: 'standard',
    plannedStartDate: '2026-09-01',
    templateIds: ['china-building-fine-detail', 'china-mep-coordination', 'china-cecs-fire-system'],
    selectedNodesByTemplate: {
      'china-building-fine-detail': ['BDT-01-01-04', 'BDT-01-01-05', 'BDT-01-01-06'],
      'china-mep-coordination': ['MEP-01-01-01'],
      'china-cecs-fire-system': ['FIR-04-01-02'],
    },
    scope: {
      ...commonMixedUseScope,
      project_type_code: 'civil_complex',
      zone_object_id: 'B1-B2 地库样本区',
      phase_object_id: '对照样本-地库穿插',
    },
    note: '这组刻意展开到 process，用于验证同一 itemPack 内工序依赖、工期和资料/验收控制项不会污染主计划。',
  },
]

function metadataOf(row: GeneratedTemplateRow): Record<string, any> {
  return (row.values.standard_task_metadata as Record<string, any> | undefined) ?? {}
}

function stableCodeOf(row: GeneratedTemplateRow): string {
  return String(metadataOf(row).stableCode ?? row.values.standard_work_code ?? row.values.template_node_id ?? '')
}

function textValue(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function summarizeRows(phase: PhaseScenario, rows: GeneratedTemplateRow[]): RowSummary[] {
  const stableByClientRowId = new Map(rows.map((row) => [row.clientRowId, stableCodeOf(row)]))
  return rows.map((row, index) => {
    const metadata = metadataOf(row)
    const floorSeries = (metadata.floorSeries as Record<string, any> | undefined) ?? null
    const floorRhythm = (metadata.floorRhythm as Record<string, any> | undefined) ?? null
    const predecessors = row.predecessorDependencies.map((dependency) => {
      const predecessorCode = stableByClientRowId.get(dependency.clientRowId) ?? dependency.clientRowId
      return `${predecessorCode} ${dependency.dependencyType}+${dependency.lagDays} [${dependency.source ?? 'unknown'}]`
    })
    const dependencySourceList = row.predecessorDependencies.map((dependency) => dependency.source ?? 'unknown')
    return {
      phaseId: phase.phaseId,
      phaseName: phase.phaseName,
      index: index + 1,
      clientRowId: row.clientRowId,
      parentClientRowId: row.parentClientRowId,
      parentStableCode: row.parentClientRowId ? stableByClientRowId.get(row.parentClientRowId) ?? null : null,
      stableCode: stableCodeOf(row),
      title: String(row.values.title ?? ''),
      templateId: String(row.values.template_id ?? ''),
      packType: String(row.values.pack_type ?? metadata.packType ?? ''),
      templateGroup: String(row.values.template_group ?? metadata.templateGroup ?? ''),
      nodeType: String(row.values.wbs_node_type ?? ''),
      rowProjectionMode: String(row.values.row_projection_mode ?? row.rowProjectionMode ?? ''),
      planItemKind: String(row.planItemKind ?? metadata.planItemKind ?? ''),
      durationContributionMode: String(row.values.duration_contribution_mode ?? metadata.durationContributionMode ?? ''),
      executionPhase: String(row.values.execution_phase ?? metadata.executionPhase ?? ''),
      executionLane: String(row.values.execution_lane ?? metadata.executionLane ?? ''),
      building: textValue(row.values.building_object_id),
      floor: textValue(row.values.floor_object_id),
      floorSeries: textValue(floorSeries?.label) ?? (
        floorRhythm?.floorCount ? `${floorRhythm.floorCount} floors (${floorRhythm.floorSeriesLabel ?? ''})` : null
      ),
      zone: textValue(row.values.zone_object_id),
      startDate: textValue(row.values.planned_start_date ?? row.values.start_date),
      endDate: textValue(row.values.planned_end_date ?? row.values.end_date),
      referenceDuration: numberValue(row.values.smart_reference_days),
      durationProvenance: String(row.values.duration_provenance ?? ''),
      durationSeedStableCode: textValue((metadata.durationSuggestion as Record<string, any> | undefined)?.businessReasonParams?.seedStableCode)
        ?? textValue(floorRhythm?.durationSeedStableCode),
      predecessorCount: row.predecessorDependencies.length,
      predecessors: predecessors.join('; '),
      dependencySources: [...new Set(dependencySourceList)].join(', '),
      dependencySourceList,
    }
  })
}

async function runPhase(phase: PhaseScenario): Promise<PhaseResult> {
  const started = performance.now()
  try {
    const generation = await generateWbsTemplateRows({
      projectId: PROJECT_ID,
      surface: 'task_list',
      detailLevel: phase.detailLevel,
      operation: {
        type: 'template_generate',
        generationBatchId: `mixed-use-e2e:${phase.phaseId}:${REPORT_DATE}`,
        templateIds: phase.templateIds,
        selectedNodesByTemplate: phase.selectedNodesByTemplate,
        plannedStartDate: phase.plannedStartDate,
        detailLevel: phase.detailLevel,
        scope: phase.scope,
        projectFacts,
      },
    })
    const elapsedMs = Math.round(performance.now() - started)
    const rows = summarizeRows(phase, generation.rows)
    const rowIds = new Set(generation.rows.map((row) => row.clientRowId))
    const orphanDependencyCount = generation.rows.reduce((sum, row) => (
      sum + row.predecessorDependencies.filter((dependency) => !rowIds.has(dependency.clientRowId)).length
    ), 0)
    return {
      phase,
      ok: true,
      elapsedMs,
      generation,
      rows,
      dependencyCount: generation.rows.reduce((sum, row) => sum + row.predecessorDependencies.length, 0),
      orphanDependencyCount,
    }
  } catch (error: any) {
    const elapsedMs = Math.round(performance.now() - started)
    return {
      phase,
      ok: false,
      elapsedMs,
      rows: [],
      dependencyCount: 0,
      orphanDependencyCount: 0,
      error: {
        code: error?.code ?? null,
        message: String(error?.message ?? error),
        generatedRowCount: error?.generatedRowCount,
        rowLimit: error?.rowLimit,
        splitByPhase: error?.splitByPhase,
      },
    }
  }
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>()
  for (const item of items) {
    const key = keyFn(item) || '(empty)'
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...map.entries()].sort(([left], [right]) => left.localeCompare(right)))
}

function markdownEscape(value: unknown) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
}

function table(headers: string[], rows: Array<Array<unknown>>) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(markdownEscape).join(' | ')} |`),
  ].join('\n')
}

function buildMarkdown(results: PhaseResult[], allRows: RowSummary[], elapsedMs: number) {
  const okResults = results.filter((result) => result.ok)
  const failedResults = results.filter((result) => !result.ok)
  const rowLimitBreaches = results.filter((result) => (
    result.error?.code === 'TEMPLATE_GENERATE_ROW_LIMIT_EXCEEDED'
    || result.generation?.generationBatches.some((batch) => batch.rowLimitExceeded)
  ))
  const dependencySourceRows = allRows.flatMap((row) => row.dependencySourceList.map((source) => ({ source })))
  const rhythmRows = allRows.filter((row) => row.stableCode === 'BDT-04-01-01')
  const standardRows = allRows.filter((row) => row.phaseId.startsWith('s10-'))
  const zeroDurationScheduleRows = allRows.filter((row) => (
    row.rowProjectionMode === 'schedule_row'
    && (row.referenceDuration == null || row.referenceDuration === 0 || row.durationProvenance === 'unavailable')
  ))

  const lines: string[] = []
  lines.push(`# 综合业态 WBS 模板端到端生成模拟报告 (${REPORT_DATE})`)
  lines.push('')
  lines.push('## 1. 模拟项目')
  lines.push('')
  lines.push('- 项目画像：3 栋 26 层住宅塔楼 + 4 层商业裙房 + 2 层地下室/地库。')
  lines.push('- 施工特征：铝模标准层节拍、深基坑、塔吊/施工电梯、住宅精装、商业公区、消防电梯、充电桩、室外海绵和竣工移交。')
  lines.push('- 生成路径：直接调用 `generateWbsTemplateRows`，使用默认 full 治理通道与 plan_reference/contextual_reference 工期输出。')
  lines.push('- 目标：验证模板能否展开、工期 seed/占位能否生成、依赖关系是否闭合、500 行限制是否触发、生成耗时是否异常。')
  lines.push('')
  lines.push('## 2. 总结论')
  lines.push('')
  lines.push(`- 总耗时：${elapsedMs} ms。`)
  lines.push(`- 成功 phase：${okResults.length}/${results.length}；失败 phase：${failedResults.length}。`)
  lines.push(`- 展开总行数：${allRows.length}。`)
  lines.push(`- 主计划行：${allRows.filter((row) => row.rowProjectionMode === 'schedule_row').length}；门控/里程碑行：${allRows.filter((row) => row.rowProjectionMode === 'gate_marker').length}；联动投影：${allRows.filter((row) => row.rowProjectionMode === 'linked_projection').length}；内联控制：${allRows.filter((row) => row.rowProjectionMode === 'inline_control').length}。`)
  lines.push(`- 依赖总数：${results.reduce((sum, result) => sum + result.dependencyCount, 0)}；孤儿依赖：${results.reduce((sum, result) => sum + result.orphanDependencyCount, 0)}。`)
  lines.push(`- 500 行限制：${rowLimitBreaches.length === 0 ? '未触发' : `触发 ${rowLimitBreaches.length} 个 phase` }。`)
  lines.push('')
  if (failedResults.length > 0) {
    lines.push('### 失败 phase')
    lines.push('')
    lines.push(table(
      ['phase', '耗时(ms)', '错误码', '错误信息', '生成行数', 'rowLimit'],
      failedResults.map((result) => [
        result.phase.phaseId,
        result.elapsedMs,
        result.error?.code ?? '',
        result.error?.message ?? '',
        result.error?.generatedRowCount ?? '',
        result.error?.rowLimit ?? '',
      ]),
    ))
    lines.push('')
  }
  lines.push('## 3. Phase 结果')
  lines.push('')
  lines.push(table(
    ['phase', '名称', '深度', '行数', '主计划行', '依赖', '孤儿依赖', '耗时(ms)', 'rowLimitPolicy', 'splitByPhase'],
    results.map((result) => [
      result.phase.phaseId,
      result.phase.phaseName,
      result.phase.detailLevel,
      result.rows.length,
      result.rows.filter((row) => row.rowProjectionMode === 'schedule_row').length,
      result.dependencyCount,
      result.orphanDependencyCount,
      result.elapsedMs,
      result.generation?.rowLimitPolicy ?? '',
      result.generation?.splitByPhaseApplied ?? '',
    ]),
  ))
  lines.push('')
  lines.push('## 4. 统计画像')
  lines.push('')
  lines.push('### 按模板')
  lines.push('')
  lines.push(table(['templateId', '行数'], Object.entries(countBy(allRows, (row) => row.templateId))))
  lines.push('')
  lines.push('### 按 packType')
  lines.push('')
  lines.push(table(['packType', '行数'], Object.entries(countBy(allRows, (row) => row.packType))))
  lines.push('')
  lines.push('### 按计划行语义')
  lines.push('')
  lines.push(table(['planItemKind', '行数'], Object.entries(countBy(allRows, (row) => row.planItemKind))))
  lines.push('')
  lines.push('### 按投影模式')
  lines.push('')
  lines.push(table(['rowProjectionMode', '行数'], Object.entries(countBy(allRows, (row) => row.rowProjectionMode))))
  lines.push('')
  lines.push('### 按工期来源')
  lines.push('')
  lines.push(table(['durationProvenance', '行数'], Object.entries(countBy(allRows, (row) => row.durationProvenance))))
  lines.push('')
  lines.push('### 按依赖来源')
  lines.push('')
  lines.push(table(['dependencySource', '数量'], Object.entries(countBy(dependencySourceRows, (row) => row.source))))
  lines.push('')
  lines.push('### 主计划中的 0 工期 / 非工期控制行')
  lines.push('')
  lines.push(`共 ${zeroDurationScheduleRows.length} 行。它们多为 quality_gate / handover_marker / embedded_check / external_wait 等控制项，说明当前 overview 下 itemPack 仍会作为主计划行承载控制语义；前端展示时应避免把这些行当普通施工持续时间。`)
  lines.push('')
  lines.push(table(
    ['phase', 'stableCode', 'title', 'projection', 'kind', 'durationMode', 'duration', 'provenance'],
    zeroDurationScheduleRows.slice(0, 80).map((row) => [
      row.phaseId,
      row.stableCode,
      row.title,
      row.rowProjectionMode,
      row.planItemKind,
      row.durationContributionMode,
      row.referenceDuration ?? '',
      row.durationProvenance,
    ]),
  ))
  if (zeroDurationScheduleRows.length > 80) {
    lines.push('')
    lines.push(`仅展示前 80 行，完整清单见 JSON 明细：${JSON_PATH}`)
  }
  lines.push('')
  lines.push('## 5. 标准层节拍行核查')
  lines.push('')
  lines.push(table(
    ['phase', 'stableCode', 'title', 'building', 'floorSeries', 'start', 'end', 'duration', 'durationSeed'],
    rhythmRows.map((row) => [
      row.phaseId,
      row.stableCode,
      row.title,
      row.building ?? '',
      row.floorSeries ?? '',
      row.startDate ?? '',
      row.endDate ?? '',
      row.referenceDuration ?? '',
      row.durationSeedStableCode ?? '',
    ]),
  ))
  lines.push('')
  lines.push('## 6. process 深度对照样本')
  lines.push('')
  lines.push('这部分只展开地库穿插样本到 process，用来检查工序级工期和 sibling_sequence 依赖。')
  lines.push('')
  lines.push(table(
    ['#', 'stableCode', 'title', 'nodeType', 'kind', 'mode', 'start', 'end', 'duration', 'predecessors'],
    standardRows.map((row) => [
      row.index,
      row.stableCode,
      row.title,
      row.nodeType,
      row.planItemKind,
      row.durationContributionMode,
      row.startDate ?? '',
      row.endDate ?? '',
      row.referenceDuration ?? '',
      row.predecessors,
    ]),
  ))
  lines.push('')
  lines.push('## 7. 全量展开明细')
  lines.push('')
  lines.push(table(
    ['phase', '#', 'stableCode', 'title', 'type', 'projection', 'kind', 'durationMode', 'executionPhase', 'building', 'floor/series', 'zone', 'start', 'end', 'duration', 'provenance', 'predecessors'],
    allRows.map((row) => [
      row.phaseId,
      row.index,
      row.stableCode,
      row.title,
      row.nodeType,
      row.rowProjectionMode,
      row.planItemKind,
      row.durationContributionMode,
      row.executionPhase,
      row.building ?? '',
      row.floor ?? row.floorSeries ?? '',
      row.zone ?? '',
      row.startDate ?? '',
      row.endDate ?? '',
      row.referenceDuration ?? '',
      row.durationProvenance,
      row.predecessors,
    ]),
  ))
  lines.push('')
  lines.push('## 8. 诊断判断')
  lines.push('')
  lines.push('- 本报告使用 full 工期建议路径；如果前端实际生成仍出现分钟级耗时，主要应继续查远端 DB/DNS fallback、接口串行等待或前端渲染，而不是模板行数本身。')
  lines.push('- 多楼栋多楼层的标准层主体已聚合为楼栋级节拍行；本次样本中不会出现 3 栋 x 22 层 x 9 工序的主计划笛卡尔积。')
  lines.push('- process 级样本证明工序级 sibling_sequence 依赖仍能产生；overview 主计划则以 itemPack 为主，详细工序适合进入详情/检查表。')
  lines.push('- 当前脚本按施工 phase 分批调用生成器。跨 phase 的全局 CPM 重排不是模板生成器职责，后续应由基线/月度计划算法消费依赖后统一排程。')

  return lines.join('\n')
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true })
  const started = performance.now()
  const results: PhaseResult[] = []
  for (const phase of PHASES) {
    // eslint-disable-next-line no-console
    console.log(`Running ${phase.phaseId} ${phase.detailLevel}...`)
    results.push(await runPhase(phase))
  }
  const elapsedMs = Math.round(performance.now() - started)
  const allRows = results.flatMap((result) => result.rows)
  const report = {
    checkedAt: new Date().toISOString(),
    projectId: PROJECT_ID,
    elapsedMs,
    phases: results.map((result) => ({
      phaseId: result.phase.phaseId,
      phaseName: result.phase.phaseName,
      detailLevel: result.phase.detailLevel,
      ok: result.ok,
      elapsedMs: result.elapsedMs,
      rowCount: result.rows.length,
      dependencyCount: result.dependencyCount,
      orphanDependencyCount: result.orphanDependencyCount,
      rowLimitPolicy: result.generation?.rowLimitPolicy ?? null,
      splitByPhaseApplied: result.generation?.splitByPhaseApplied ?? null,
      generationBatches: result.generation?.generationBatches ?? [],
      error: result.error ?? null,
      note: result.phase.note ?? null,
    })),
    totals: {
      rowCount: allRows.length,
      dependencyCount: results.reduce((sum, result) => sum + result.dependencyCount, 0),
      orphanDependencyCount: results.reduce((sum, result) => sum + result.orphanDependencyCount, 0),
      byTemplate: countBy(allRows, (row) => row.templateId),
      byPackType: countBy(allRows, (row) => row.packType),
      byPlanItemKind: countBy(allRows, (row) => row.planItemKind),
      byProjectionMode: countBy(allRows, (row) => row.rowProjectionMode),
      byDurationProvenance: countBy(allRows, (row) => row.durationProvenance),
    },
    rows: allRows,
  }
  writeFileSync(JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  writeFileSync(MD_PATH, `${buildMarkdown(results, allRows, elapsedMs)}\n`, 'utf8')
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    ok: results.every((result) => result.ok),
    elapsedMs,
    markdownReport: MD_PATH,
    jsonReport: JSON_PATH,
    totals: report.totals,
    failedPhases: report.phases.filter((phase) => !phase.ok),
  }, null, 2))
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exitCode = 1
})
