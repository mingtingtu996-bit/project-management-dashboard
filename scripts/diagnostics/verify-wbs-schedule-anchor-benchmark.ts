import {
  CHINA_GB55032_TEMPLATE_ID,
  generateWbsTemplatePhaseChainRows,
} from '../../server/src/services/wbsTemplateGenerationService.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

type PhaseScenario = {
  phaseId: string
  templateIds: string[]
  selectedNodesByTemplate: Record<string, string[]>
}

type AnchorScenario = {
  key: string
  label: string
  anchorMonths: [number, number]
  facts: Record<string, unknown>
  includePrefabPhases?: boolean
}

const PROJECT_ID = '00000000-0000-4000-8000-0000000000ab'
const DAYS_PER_MONTH = 30

const BASE_PHASES: PhaseScenario[] = [
  {
    phaseId: 'p1a-pit-piling',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['01-02-01', '01-02-08', '01-03-01', '01-04-01', '01-05', '01-06'],
    },
  },
  {
    phaseId: 'p1b2-site',
    templateIds: ['china-building-site-management'],
    selectedNodesByTemplate: {
      'china-building-site-management': ['SITE-01-01-01', 'SITE-02-01-01'],
    },
  },
  {
    phaseId: 'p1c-foundation-pit-pile',
    templateIds: ['china-foundation-pit-pile'],
    selectedNodesByTemplate: {
      'china-foundation-pit-pile': ['FND-01-01-01', 'FND-02-01-01'],
    },
  },
  {
    phaseId: 'p2a-basement-struct',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01', '02-01-02', '02-01-03', '01-07'],
    },
  },
  {
    phaseId: 'p2b-waterproof-bdt',
    templateIds: ['china-waterproof-insulation', 'china-building-fine-detail'],
    selectedNodesByTemplate: {
      'china-waterproof-insulation': ['WPI-01-01-01', 'WPI-02-01-01'],
      'china-building-fine-detail': ['BDT-01-01-01', 'BDT-04-01-01'],
    },
  },
  {
    phaseId: 'p3a-superstructure-core',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['02-01-01', '02-01-02', '02-01-03', '02-01-06', '02-02-01'],
    },
  },
  {
    phaseId: 'p3b-quality',
    templateIds: ['china-quality-responsibility-acceptance'],
    selectedNodesByTemplate: {
      'china-quality-responsibility-acceptance': ['QR-01-01-03'],
    },
  },
  {
    phaseId: 'p4a-mep-core-1',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['05-01-01', '05-02', '06-01', '06-02'],
    },
  },
  {
    phaseId: 'p4b-mep-core-2',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['07-02', '07-04', '07-05', '07-07', '08-04', '08-15', '08-16'],
    },
  },
  {
    phaseId: 'p4c-mep-specialty',
    templateIds: ['china-plumbing-heating-system', 'china-electrical-system'],
    selectedNodesByTemplate: {
      'china-plumbing-heating-system': ['PLU-01-01-01', 'PLU-02-01-01'],
      'china-electrical-system': ['ELE-01-01-01', 'ELE-04-01-01', 'ELE-05-01-01'],
    },
  },
  {
    phaseId: 'p4d-mep-specialty-2',
    templateIds: ['china-hvac-system', 'china-cecs-fire-system', 'china-intelligent-building-system'],
    selectedNodesByTemplate: {
      'china-hvac-system': ['HVA-01-01-01', 'HVA-02-01-01'],
      'china-cecs-fire-system': ['FIR-01-01-01', 'FIR-02-01-01'],
      'china-intelligent-building-system': ['INT-01-01-01', 'INT-02-01-01'],
    },
  },
  {
    phaseId: 'p5a-finishing-core',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['03-01', '03-02', '03-04', '03-05', '03-09', '04-01', '04-03', '04-05'],
    },
  },
  {
    phaseId: 'p5b-finishing-specialty',
    templateIds: ['china-jgj-tianjin-decoration', 'china-facade-curtain-wall'],
    selectedNodesByTemplate: {
      'china-jgj-tianjin-decoration': ['DEC-01-01-01', 'DEC-02-01-01'],
      'china-facade-curtain-wall': ['FAC-01-01-01', 'FAC-02-01-01'],
    },
  },
  {
    phaseId: 'p6a-commission-core',
    templateIds: [CHINA_GB55032_TEMPLATE_ID],
    selectedNodesByTemplate: {
      [CHINA_GB55032_TEMPLATE_ID]: ['09-02', '09-03', '10-01'],
    },
  },
  {
    phaseId: 'p6b-outdoor-doc',
    templateIds: ['china-gb55032-2022-outdoor', 'china-document-commercial-support'],
    selectedNodesByTemplate: {
      'china-gb55032-2022-outdoor': ['OUT-01-01-01', 'OUT-02-01-01'],
      'china-document-commercial-support': ['DCS-01-01-01'],
    },
  },
  {
    phaseId: 'p6c-milestone',
    templateIds: ['china-project-milestone-handover'],
    selectedNodesByTemplate: {
      'china-project-milestone-handover': ['MS-01-01-07'],
    },
  },
]

const PREFAB_PHASES: PhaseScenario[] = [
  {
    phaseId: 'p1ab-prefab-factory',
    templateIds: ['china-prefabricated-assembly'],
    selectedNodesByTemplate: {
      'china-prefabricated-assembly': ['PFB-00-01-01', 'PFB-00-01-02', 'PFB-00-01-03'],
    },
  },
  {
    phaseId: 'p3c-prefab-site',
    templateIds: ['china-prefabricated-assembly'],
    selectedNodesByTemplate: {
      'china-prefabricated-assembly': ['PFB-01-01-01', 'PFB-01-01-03', 'PFB-02-01-01', 'PFB-03-01-02'],
    },
  },
]

const SCENARIOS: AnchorScenario[] = [
  {
    key: 'MA1',
    label: 'Haikou quota 98.1k sqm / 33F+26F+26F / shear wall',
    anchorMonths: [34.1, 34.1],
    facts: {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'shear_wall',
      methodVariantCodes: ['cast_in_place', 'aluminum_formwork', 'climbing_scaffold'],
      buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
      totalAreaM2: 98100,
      buildingCount: 3,
      standardFloorCount: 26,
      highestBuildingFloorCount: 33,
      basementLevelCount: 2,
      foundationDepthM: 8,
    },
  },
  {
    key: 'MA2',
    label: 'Cast-in-place residential 180k sqm / 3x26F',
    anchorMonths: [38, 40],
    facts: {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'shear_wall',
      methodVariantCodes: ['cast_in_place', 'aluminum_formwork', 'climbing_scaffold'],
      buildingPatternCodes: ['high_rise_core_and_floor_cycle'],
      totalAreaM2: 180000,
      buildingCount: 3,
      standardFloorCount: 26,
      highestBuildingFloorCount: 26,
      basementLevelCount: 2,
      foundationDepthM: 9.5,
    },
  },
  {
    key: 'MA3',
    label: 'Tianjin low-rise 139.3k sqm / 24x7-13F / frame',
    anchorMonths: [14.4, 14.4],
    facts: {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'frame',
      methodVariantCodes: ['cast_in_place'],
      buildingPatternCodes: ['multi_building_parallel_flow'],
      totalAreaM2: 139300,
      buildingCount: 24,
      standardFloorCount: 10,
      highestBuildingFloorCount: 13,
      basementLevelCount: 0,
      foundationDepthM: 4,
    },
  },
  {
    key: 'MA4',
    label: 'Hanyun Mansion cast-in-place view 118k sqm',
    anchorMonths: [18, 20],
    facts: {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'frame_shear',
      methodVariantCodes: ['cast_in_place'],
      buildingPatternCodes: ['multi_building_parallel_flow'],
      totalAreaM2: 118000,
      buildingCount: 8,
      standardFloorCount: 12,
      highestBuildingFloorCount: 18,
      basementLevelCount: 1,
      foundationDepthM: 5,
    },
  },
  {
    key: 'MB1',
    label: 'Vanke PC 30% 140k sqm / 5x22F',
    anchorMonths: [35, 37],
    includePrefabPhases: true,
    facts: {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'prefabricated_concrete',
      methodVariantCodes: ['precast_concrete', 'prefab_concrete'],
      buildingPatternCodes: ['high_rise_core_and_floor_cycle', 'prefabricated_concrete_floor_cycle', 'prefabricated_factory_coordination_flow'],
      totalAreaM2: 140000,
      buildingCount: 5,
      standardFloorCount: 22,
      highestBuildingFloorCount: 22,
      basementLevelCount: 2,
      foundationDepthM: 8,
      prefabRate: 0.3,
    },
  },
  {
    key: 'MB2',
    label: 'Beijing Chengshousi steel assembly 31.7k sqm / 4x9-16F',
    anchorMonths: [7, 7],
    facts: {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'steel_assembly',
      methodVariantCodes: ['steel_assembly', 'prefabricated_steel'],
      buildingPatternCodes: ['steel_structure_bay_zone_flow', 'multi_building_parallel_flow'],
      totalAreaM2: 31700,
      buildingCount: 4,
      standardFloorCount: 12,
      highestBuildingFloorCount: 16,
      basementLevelCount: 0,
      foundationDepthM: 4,
      prefabRate: 0.85,
    },
  },
  {
    key: 'MB3',
    label: 'Hanyun Mansion prefab fourth-generation 118k sqm',
    anchorMonths: [18, 20],
    includePrefabPhases: true,
    facts: {
      businessType: 'general_civil',
      businessSubtype: 'civil_residential',
      projectTypeCode: 'residential',
      structureTypeCode: 'prefabricated_concrete',
      methodVariantCodes: ['precast_concrete', 'prefab_concrete'],
      buildingPatternCodes: ['prefabricated_concrete_floor_cycle', 'prefabricated_factory_coordination_flow', 'multi_building_parallel_flow'],
      totalAreaM2: 118000,
      buildingCount: 8,
      standardFloorCount: 12,
      highestBuildingFloorCount: 18,
      basementLevelCount: 1,
      foundationDepthM: 5,
      prefabRate: 0.7,
    },
  },
]

function buildPhases(includePrefabPhases: boolean | undefined) {
  if (!includePrefabPhases) return BASE_PHASES
  return [
    BASE_PHASES[0],
    PREFAB_PHASES[0],
    ...BASE_PHASES.slice(1, 6),
    PREFAB_PHASES[1],
    ...BASE_PHASES.slice(6),
  ].filter(Boolean) as PhaseScenario[]
}

function normalizeDate(value: unknown) {
  return String(value ?? '').slice(0, 10)
}

function dateMs(value: string) {
  return Date.parse(`${value}T00:00:00Z`)
}

function daysInclusive(start: string, end: string) {
  return Math.max(1, Math.round((dateMs(end) - dateMs(start)) / 86_400_000) + 1)
}

function readMetadata(row: { values: Record<string, unknown> }) {
  const metadata = row.values.standard_task_metadata
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

function centerOfAnchor(anchor: [number, number]) {
  return (anchor[0] + anchor[1]) / 2
}

function formatPercent(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${Math.round(value)}%`
}

async function runScenario(scenario: AnchorScenario) {
  const phases = buildPhases(scenario.includePrefabPhases)
  const generated = await generateWbsTemplatePhaseChainRows({
    projectId: PROJECT_ID,
    surface: 'task_list',
    detailLevel: 'overview',
    operations: phases.map((phase) => ({
      type: 'template_generate',
      generationBatchId: `anchor-benchmark:${scenario.key}:${phase.phaseId}`,
      primaryCatalogId: CHINA_GB55032_TEMPLATE_ID,
      templateIds: phase.templateIds,
      selectedNodesByTemplate: phase.selectedNodesByTemplate,
      plannedStartDate: '2026-06-01',
      scope: {
        phase_object_id: phase.phaseId,
        building_object_id: `${scenario.key}:${phase.phaseId}:building`,
        zone_object_id: `${scenario.key}:${phase.phaseId}:zone`,
        projectTypeCode: scenario.facts.projectTypeCode,
        structureTypeCode: scenario.facts.structureTypeCode,
        methodVariantCodes: scenario.facts.methodVariantCodes,
        buildingPatternCodes: scenario.facts.buildingPatternCodes,
        businessType: scenario.facts.businessType,
        businessSubtype: scenario.facts.businessSubtype,
        recommendationPacks: scenario.facts.recommendationPacks,
      },
      projectFacts: scenario.facts,
    })),
  })

  const windows = phases.map((phase) => {
    const rows = generated.rows.filter((row) => row.values.phase_object_id === phase.phaseId)
    const starts = rows.map((row) => normalizeDate(row.values.planned_start_date)).filter(Boolean).sort()
    const ends = rows.map((row) => normalizeDate(row.values.planned_end_date)).filter(Boolean).sort()
    return {
      phaseId: phase.phaseId,
      start: starts[0] ?? '',
      end: ends.at(-1) ?? '',
      rows: rows.length,
    }
  }).filter((item) => item.rows > 0)

  const projectStart = windows.map((item) => item.start).filter(Boolean).sort()[0] ?? ''
  const projectEnd = windows.map((item) => item.end).filter(Boolean).sort().at(-1) ?? ''
  const totalDays = projectStart && projectEnd ? daysInclusive(projectStart, projectEnd) : 0
  const months = totalDays / DAYS_PER_MONTH
  const overlapCount = windows.slice(1).filter((phase, index) => dateMs(phase.start) <= dateMs(windows[index]!.end)).length
  const sameStartCount = windows.filter((phase) => phase.start === projectStart).length
  const phaseChainDeps = generated.rows.flatMap((row) => row.predecessorDependencies ?? [])
    .filter((dependency) => dependency.source === 'phase_chain')
  const phaseChainByType = new Map<string, number>()
  for (const dependency of phaseChainDeps) {
    const key = `${dependency.dependencyType}:${dependency.lagDays}`
    phaseChainByType.set(key, (phaseChainByType.get(key) ?? 0) + 1)
  }
  const policyModes = new Map<string, number>()
  for (const row of generated.rows) {
    const metadata = readMetadata(row)
    const phaseChainDependency = metadata.phaseChainDependency
    if (!phaseChainDependency || typeof phaseChainDependency !== 'object' || Array.isArray(phaseChainDependency)) continue
    const releasePolicy = (phaseChainDependency as Record<string, unknown>).releasePolicy
    if (!releasePolicy || typeof releasePolicy !== 'object' || Array.isArray(releasePolicy)) continue
    const mode = String((releasePolicy as Record<string, unknown>).mode ?? '')
    if (mode) policyModes.set(mode, (policyModes.get(mode) ?? 0) + 1)
  }
  const anchorMid = centerOfAnchor(scenario.anchorMonths)
  const deviation = anchorMid > 0 ? ((months - anchorMid) / anchorMid) * 100 : 0
  return {
    scenario,
    rows: generated.rows.length,
    dependencies: generated.rows.reduce((sum, row) => sum + (row.predecessorDependencies?.length ?? 0), 0),
    phaseChainDeps: phaseChainDeps.length,
    totalDays,
    months,
    deviation,
    overlapCount,
    sameStartCount,
    windows,
    phaseChainByType,
    policyModes,
    warnings: generated.governanceWarnings.length,
    longestRows: generated.rows
      .map((row) => {
        const start = normalizeDate(row.values.planned_start_date)
        const end = normalizeDate(row.values.planned_end_date)
        return {
          title: String(row.values.title ?? ''),
          stableCode: String(readMetadata(row).stableCode ?? ''),
          phaseId: String(row.values.phase_object_id ?? ''),
          nodeType: String(row.values.wbs_node_type ?? row.values.category_type ?? ''),
          start,
          end,
          days: start && end ? daysInclusive(start, end) : 0,
          durationContributionMode: String(row.values.duration_contribution_mode ?? readMetadata(row).durationContributionMode ?? ''),
        }
      })
      .filter((row) => row.days > 0)
      .sort((left, right) => right.days - left.days)
      .slice(0, 8),
  }
}

function printMap(map: Map<string, number>) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}=${count}`)
    .join(', ')
}

async function main() {
  const results = []
  for (const scenario of SCENARIOS) {
    results.push(await runScenario(scenario))
  }

  console.log('\nA/B anchor benchmark after phase-overlap regression fix')
  console.log('key | rows | deps | phaseDeps | months | days | anchor | deviation | overlaps | sameStart | warnings')
  for (const result of results) {
    const anchor = result.scenario.anchorMonths[0] === result.scenario.anchorMonths[1]
      ? `${result.scenario.anchorMonths[0]}m`
      : `${result.scenario.anchorMonths[0]}-${result.scenario.anchorMonths[1]}m`
    console.log([
      result.scenario.key.padEnd(3),
      String(result.rows).padStart(4),
      String(result.dependencies).padStart(4),
      String(result.phaseChainDeps).padStart(5),
      `${result.months.toFixed(1)}m`.padStart(7),
      `${result.totalDays}d`.padStart(5),
      anchor.padStart(8),
      formatPercent(result.deviation).padStart(7),
      String(result.overlapCount).padStart(3),
      String(result.sameStartCount).padStart(3),
      String(result.warnings).padStart(3),
    ].join(' | '))
  }

  console.log('\nPhase-chain dependency shapes')
  for (const result of results) {
    console.log(`${result.scenario.key}: deps[${printMap(result.phaseChainByType)}] policies[${printMap(result.policyModes)}]`)
  }

console.log('\nPhase windows')
for (const result of results) {
  console.log(`\n${result.scenario.key} ${result.scenario.label}`)
  for (const window of result.windows) {
    console.log(`${window.phaseId.padEnd(28)} ${window.start} -> ${window.end} rows=${window.rows}`)
  }
}

  console.log('\nLongest generated rows')
  for (const result of results) {
  console.log(`\n${result.scenario.key}`)
  for (const row of result.longestRows) {
    console.log(`${String(row.days).padStart(4)}d ${row.phaseId.padEnd(24)} ${row.nodeType.padEnd(10)} ${row.stableCode.padEnd(16)} ${row.start}->${row.end} ${row.title}`)
    }
  }

  const reportPath = resolve('artifacts/reports/wbs-schedule-anchor-benchmark-latest.json')
  mkdirSync(resolve('artifacts/reports'), { recursive: true })
  writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    description: 'A/B real anchor benchmark for WBS phase-chain scheduling after phase-overlap regression fix.',
    results: results.map((result) => ({
      key: result.scenario.key,
      label: result.scenario.label,
      anchorMonths: result.scenario.anchorMonths,
      rows: result.rows,
      dependencies: result.dependencies,
      phaseChainDependencies: result.phaseChainDeps,
      totalDays: result.totalDays,
      months: Number(result.months.toFixed(2)),
      deviationPercent: Number(result.deviation.toFixed(1)),
      overlapCount: result.overlapCount,
      sameStartCount: result.sameStartCount,
      warnings: result.warnings,
      phaseChainByType: Object.fromEntries(result.phaseChainByType),
      policyModes: Object.fromEntries(result.policyModes),
      windows: result.windows,
      longestRows: result.longestRows,
    })),
  }, null, 2))
  console.log(`\nReport written: ${reportPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
