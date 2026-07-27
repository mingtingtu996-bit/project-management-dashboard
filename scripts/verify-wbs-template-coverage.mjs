#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const tsxCliPath = resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs')
const auditPath = resolve(repoRoot, 'artifacts/reports/wbs-template-depth-audit.json')
const outputPath = resolve(repoRoot, 'artifacts/reports/wbs-template-coverage-verification.json')
const closureMatrixOutputPath = resolve(repoRoot, 'project-search/public-project-data/reports/wbs-template-real-project-closure-matrix.json')

function run(command, args, options = {}) {
  const executable = process.platform === 'win32' && ['npx', 'npm'].includes(command)
    ? `${command}.cmd`
    : command
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
    ...options,
  })
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    const detail = result.error ? `: ${result.error.message}` : ''
    throw new Error(`${executable} ${args.join(' ')} failed with exit code ${result.status}${detail}`)
  }
  return result
}

function runTsxJson(source) {
  const result = run('node', [tsxCliPath, '-e', source], { stdio: ['ignore', 'pipe', 'pipe'] })
  const text = String(result.stdout ?? '').trim()
  if (!text) throw new Error('tsx JSON helper returned empty stdout')
  return JSON.parse(text)
}

run('node', [tsxCliPath, 'scripts/diagnostics/audit-wbs-template-depth.ts'])

if (!existsSync(auditPath)) {
  throw new Error(`Missing audit report: ${auditPath}`)
}

const audit = JSON.parse(readFileSync(auditPath, 'utf8'))

const requiredMixedUseCrossItemRules = [
  'hospital_hotel_shared_fire_subsystems_to_life_safety_commissioning',
  'hospital_hotel_special_areas_to_shared_fire_commissioning',
  'shared_substation_to_data_center_power_chain',
  'data_center_power_to_common_building_monitoring_interface',
  'commercial_podium_transfer_to_residential_tower_interface',
  'residential_tower_handover_to_commercial_operation_interface',
]

const seedFacts = runTsxJson(`
  import { DOMAIN_WBS_TEMPLATE_CATALOGS } from './server/src/seeds/domainWbsTemplateCatalogs.ts'
  import { CHINA_GB55032_TEMPLATE_CATALOG } from './server/src/seeds/chinaGb50300TemplateCatalog.ts'
  import { V1475_CROSS_ITEM_WORKFLOW_SEED } from './server/src/seeds/v1475CrossItemWorkflowSeed.ts'
  import { WBS_TEMPLATE_PROJECT_RECOMMENDATIONS } from './server/src/seeds/wbsTemplateProjectRecommendations.ts'
  import { WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX } from './server/src/seeds/wbsTemplateRealProjectCoverageMatrix.ts'
  import { WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET, WBS_TEMPLATE_GENERATION_SPLIT_BY_PHASE_ENABLED } from './server/src/services/wbsTemplateGenerationService.ts'
  import { evaluateWbsTemplateGoldenBenchmarkStaticGate } from './server/src/services/wbsTemplateGoldenBenchmarkGateService.ts'
  const branchControlledPackTypes = new Set(['danger_control', 'quality_responsibility', 'project_milestone'])
  const specialtyAwareBranchModes = new Set(['by_specialty_selection', 'by_project_type_or_specialty_selection'])
  const hasNonEmptyArray = (value) => Array.isArray(value) && value.length > 0
  const allCatalogs = [CHINA_GB55032_TEMPLATE_CATALOG, ...DOMAIN_WBS_TEMPLATE_CATALOGS]
  const catalogById = new Map(allCatalogs.map((catalog) => [catalog.templateId, catalog]))
  const stablePrefixesByTemplateId = {}
  const visitStable = (templateId, node) => {
    const prefixes = stablePrefixesByTemplateId[templateId] ?? new Set()
    const stableCode = String(node.stableCode ?? '')
    const parts = stableCode.split('-')
    for (let length = 1; length <= Math.min(4, parts.length); length += 1) {
      prefixes.add(parts.slice(0, length).join('-'))
    }
    stablePrefixesByTemplateId[templateId] = prefixes
    for (const child of node.children ?? []) visitStable(templateId, child)
  }
  for (const catalog of allCatalogs) {
    for (const division of catalog.divisions ?? []) visitStable(catalog.templateId, division)
  }
  const stablePrefixExists = (prefix) => Object.values(stablePrefixesByTemplateId).some((prefixes) => prefixes.has(prefix))
  const dangerProcessesMissingHazardPlaceholder = []
  const branchProcessesMissingMetadata = []
  const dangerBranchProcessesNotClosedByTrigger = []
  const specialtyBranchProcessesMissingReferences = []
  const differentiatedBranchPresence = {}
  const branchProcessStats = {}
  const promotedFallbackPacks = []
  const promotedItemPacks = []
  const visit = (catalog, node, path) => {
    const metadata = node.metadata ?? {}
    if (node.categoryType === 'process' && branchControlledPackTypes.has(catalog.packType)) {
      const packStats = branchProcessStats[catalog.packType] ?? { total: 0, modes: {} }
      packStats.total += 1
      packStats.modes[String(metadata.branchSelectionMode)] = (packStats.modes[String(metadata.branchSelectionMode)] ?? 0) + 1
      branchProcessStats[catalog.packType] = packStats

      if (!metadata.branchFamily || !metadata.branchSelectionMode) {
        branchProcessesMissingMetadata.push({
          templateId: catalog.templateId,
          packType: catalog.packType,
          stableCode: node.stableCode,
          name: node.name,
          path,
          branchFamily: metadata.branchFamily,
          branchSelectionMode: metadata.branchSelectionMode,
        })
      }

      if (catalog.packType === 'danger_control') {
        if (
          metadata.branchSelectionMode !== 'auto_by_trigger'
          || !hasNonEmptyArray(metadata.branchTriggerConditions)
          || metadata.generationMode !== 'auto_by_trigger_only'
        ) {
          dangerBranchProcessesNotClosedByTrigger.push({
            templateId: catalog.templateId,
            stableCode: node.stableCode,
            name: node.name,
            path,
            branchSelectionMode: metadata.branchSelectionMode,
            generationMode: metadata.generationMode,
            branchTriggerConditions: metadata.branchTriggerConditions,
          })
        }
      }

      if (['quality_responsibility', 'project_milestone'].includes(catalog.packType) && metadata.branchSelectionMode !== 'always') {
        differentiatedBranchPresence[catalog.packType] = true
      }

      if (
        ['quality_responsibility', 'project_milestone'].includes(catalog.packType)
        && specialtyAwareBranchModes.has(metadata.branchSelectionMode)
        && !hasNonEmptyArray(metadata.applicableSpecialtyTemplateIds)
        && !hasNonEmptyArray(metadata.referencedSpecialtyCodes)
        && !hasNonEmptyArray(metadata.semanticReferencedSpecialtyCodes)
      ) {
        specialtyBranchProcessesMissingReferences.push({
          templateId: catalog.templateId,
          packType: catalog.packType,
          stableCode: node.stableCode,
          name: node.name,
          path,
          branchSelectionMode: metadata.branchSelectionMode,
        })
      }
    }
    if (catalog.packType === 'danger_control' && node.categoryType === 'process' && !metadata.siteHazardPlaceholder) {
      dangerProcessesMissingHazardPlaceholder.push({ templateId: catalog.templateId, stableCode: node.stableCode, name: node.name, path })
    }
    if (node.categoryType === 'item_work' && metadata.realProjectCoveragePromoted === true) {
      promotedItemPacks.push({ templateId: catalog.templateId, stableCode: node.stableCode, name: node.name })
      if (metadata.coverageProcessDepthSource === 'coverage_profile_fallback') {
        promotedFallbackPacks.push({ templateId: catalog.templateId, stableCode: node.stableCode, name: node.name })
      }
    }
    for (const child of node.children ?? []) visit(catalog, child, path + ' > ' + child.stableCode)
  }
  for (const catalog of DOMAIN_WBS_TEMPLATE_CATALOGS) {
    for (const division of catalog.divisions ?? []) visit(catalog, division, catalog.templateId + ' > ' + division.stableCode)
  }
  const realProjectClosureMatrix = WBS_TEMPLATE_REAL_PROJECT_COVERAGE_MATRIX.map((entry) => {
    const recommendation = WBS_TEMPLATE_PROJECT_RECOMMENDATIONS[entry.recommendationKey]
    const recommendedTemplates = new Set([
      ...(recommendation?.requiredTemplateIds ?? []),
      ...(recommendation?.recommendedTemplateIds ?? []),
      ...((recommendation?.conditionalTemplateRules ?? []).flatMap((rule) => rule.includeTemplateIds)),
    ])
    const missingTemplates = entry.requiredTemplateIds.filter((templateId) => !catalogById.has(templateId))
    const missingRecommendationTemplates = entry.requiredTemplateIds.filter((templateId) => !recommendedTemplates.has(templateId))
    const missingStableCodePrefixes = entry.requiredStableCodePrefixes.filter((prefix) => !stablePrefixExists(prefix))
    const missingEngineRequirements = (entry.engineRequirements ?? []).filter((requirement) => {
      if (requirement === 'split_by_phase') return WBS_TEMPLATE_GENERATION_SPLIT_BY_PHASE_ENABLED !== true
      return true
    })
    return {
      ...entry,
      status: missingTemplates.length === 0
        && missingRecommendationTemplates.length === 0
        && missingStableCodePrefixes.length === 0
        && missingEngineRequirements.length === 0
        ? 'closed'
        : 'open',
      missingTemplates,
      missingRecommendationTemplates,
      missingStableCodePrefixes,
      missingEngineRequirements,
    }
  })
  console.log(JSON.stringify({
    catalogCount: DOMAIN_WBS_TEMPLATE_CATALOGS.length,
    dangerProcessesMissingHazardPlaceholder,
    branchProcessesMissingMetadata,
    dangerBranchProcessesNotClosedByTrigger,
    specialtyBranchProcessesMissingReferences,
    differentiatedBranchPresence,
    branchProcessStats,
    promotedFallbackPacks,
    promotedItemPacks,
    crossItemWorkflowSeed: V1475_CROSS_ITEM_WORKFLOW_SEED,
    realProjectClosureMatrix,
    realProjectRecommendationKeys: Object.keys(WBS_TEMPLATE_PROJECT_RECOMMENDATIONS),
    generationRenderRowBudget: WBS_TEMPLATE_GENERATION_RENDER_ROW_BUDGET,
    splitByPhaseEnabled: WBS_TEMPLATE_GENERATION_SPLIT_BY_PHASE_ENABLED,
    goldenBenchmarkStaticGate: evaluateWbsTemplateGoldenBenchmarkStaticGate(),
  }))
`)

const dangerProcessesMissingHazardPlaceholder = seedFacts.dangerProcessesMissingHazardPlaceholder
const branchProcessesMissingMetadata = seedFacts.branchProcessesMissingMetadata
const dangerBranchProcessesNotClosedByTrigger = seedFacts.dangerBranchProcessesNotClosedByTrigger
const specialtyBranchProcessesMissingReferences = seedFacts.specialtyBranchProcessesMissingReferences
const differentiatedBranchPresence = seedFacts.differentiatedBranchPresence
const branchProcessStats = seedFacts.branchProcessStats
const promotedFallbackPacks = seedFacts.promotedFallbackPacks
const promotedItemPacks = seedFacts.promotedItemPacks
const crossItemWorkflowSeed = seedFacts.crossItemWorkflowSeed
const realProjectClosureMatrix = seedFacts.realProjectClosureMatrix
const realProjectRecommendationKeys = seedFacts.realProjectRecommendationKeys
const goldenBenchmarkStaticGate = seedFacts.goldenBenchmarkStaticGate
const realProjectOpenMatrixEntries = realProjectClosureMatrix.filter((entry) => entry.status !== 'closed')
const missingRequiredRecommendationKeys = [
  'residential',
  'prefab_residential',
  'hospital',
  'data_center',
  'clean_industrial',
  'large_span_steel_public',
  'renovation',
  'heritage',
  'campus',
  'tod',
  'modular_construction',
  'luxury_hotel',
  'deep_foundation',
].filter((key) => !realProjectRecommendationKeys.includes(key))
const ruleByCode = new Map(crossItemWorkflowSeed.map((rule) => [rule.stableCode, rule]))
const missingMixedUseCrossItemRules = requiredMixedUseCrossItemRules.filter((code) => !ruleByCode.has(code))
const inactiveMixedUseCrossItemRules = requiredMixedUseCrossItemRules.filter((code) => {
  const rule = ruleByCode.get(code)
  return rule && (rule.isActive === false || rule.autoApplyPolicy !== 'confirmed_template_only')
})
const differentiatedBranchMissingPacks = ['quality_responsibility', 'project_milestone'].filter(
  (packType) => differentiatedBranchPresence[packType] !== true,
)

const findings = []
if ((audit.findings?.total ?? 0) > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'DEPTH_AUDIT_FINDINGS_PRESENT',
    message: 'wbs template depth audit returned findings.',
    metrics: audit.findings,
  })
}
if (branchProcessesMissingMetadata.length > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'DANGER_QR_MILESTONE_BRANCH_METADATA_MISSING',
    message: 'Danger, quality-responsibility, and milestone process rows must declare branchFamily and branchSelectionMode.',
    count: branchProcessesMissingMetadata.length,
    samples: branchProcessesMissingMetadata.slice(0, 10),
  })
}
if (dangerBranchProcessesNotClosedByTrigger.length > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'DANGER_BRANCH_TRIGGER_NOT_CLOSED',
    message: 'Danger-control process rows must be selected only by closed trigger conditions, not by manual default selection.',
    count: dangerBranchProcessesNotClosedByTrigger.length,
    samples: dangerBranchProcessesNotClosedByTrigger.slice(0, 10),
  })
}
if (specialtyBranchProcessesMissingReferences.length > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'SPECIALTY_BRANCH_REFERENCES_MISSING',
    message: 'Specialty-aware QR and milestone branches must reference selected specialty templates or specialty stable codes.',
    count: specialtyBranchProcessesMissingReferences.length,
    samples: specialtyBranchProcessesMissingReferences.slice(0, 10),
  })
}
if (differentiatedBranchMissingPacks.length > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'DANGER_QR_MILESTONE_DIFFERENTIATED_BRANCHES_MISSING',
    message: 'QR and milestone packs must keep at least one project-type or specialty-aware branch so mainline packs are not purely generic.',
    missingPacks: differentiatedBranchMissingPacks,
  })
}
if (dangerProcessesMissingHazardPlaceholder.length > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'DANGER_SITE_HAZARD_PLACEHOLDER_MISSING',
    message: 'Danger-control process rows must keep a project-editable site hazard placeholder.',
    count: dangerProcessesMissingHazardPlaceholder.length,
    samples: dangerProcessesMissingHazardPlaceholder.slice(0, 10),
  })
}
if (promotedFallbackPacks.length > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'PROMOTED_PACK_USES_COVERAGE_PROFILE_FALLBACK',
    message: 'Real-project promoted item packs must use native differentiated process depth, not the generic coverage profile fallback.',
    count: promotedFallbackPacks.length,
    samples: promotedFallbackPacks.slice(0, 10),
  })
}
if (missingMixedUseCrossItemRules.length > 0 || inactiveMixedUseCrossItemRules.length > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'MIXED_USE_CROSS_ITEM_RULES_NOT_READY',
    message: 'Mixed-use CrossItem interface rules must exist and be confirmed-template-only so generated complex projects can auto-link interfaces.',
    missing: missingMixedUseCrossItemRules,
    inactiveOrNonAuto: inactiveMixedUseCrossItemRules,
  })
}
if (missingRequiredRecommendationKeys.length > 0 || realProjectOpenMatrixEntries.length > 0) {
  findings.push({
    severity: 'P1',
    ruleCode: 'REAL_PROJECT_REPORT_CLOSURE_MATRIX_OPEN',
    message: 'Real-project coverage report sections 2-15 must be traceable to templates, recommendation packs, and engine requirements.',
    missingRequiredRecommendationKeys,
    openEntries: realProjectOpenMatrixEntries,
  })
}
if (goldenBenchmarkStaticGate.status !== 'pass') {
  findings.push({
    severity: 'P1',
    ruleCode: 'WBS_TEMPLATE_GOLDEN_BENCHMARK_STATIC_GATE_FAILED',
    message: 'The 13 real-project benchmark matrix must stay closed against recommendation packs, taxonomy and schedule profiles.',
    gate: goldenBenchmarkStaticGate,
  })
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'wbs_template_coverage_self_check',
  totals: {
    catalogCount: seedFacts.catalogCount,
    totalNodes: audit.totals?.totalNodes ?? null,
    processNodes: audit.totals?.processNodes ?? null,
    activityStepNodes: audit.totals?.activityStepNodes ?? null,
    itemWorkNodes: audit.totals?.itemWorkNodes ?? null,
    realProjectPromotedItemPacks: promotedItemPacks.length,
    crossItemWorkflowRules: crossItemWorkflowSeed.length,
    realProjectClosureMatrixEntries: realProjectClosureMatrix.length,
  },
  gates: {
    depthAuditClean: (audit.findings?.total ?? 0) === 0,
    dangerQrMilestoneBranchesReady:
      branchProcessesMissingMetadata.length === 0
      && dangerBranchProcessesNotClosedByTrigger.length === 0
      && specialtyBranchProcessesMissingReferences.length === 0
      && differentiatedBranchMissingPacks.length === 0,
    dangerHazardPlaceholderReady: dangerProcessesMissingHazardPlaceholder.length === 0,
    promotedPacksUseNativeDifferentiatedDepth: promotedFallbackPacks.length === 0,
    mixedUseCrossItemInterfacesReady: missingMixedUseCrossItemRules.length === 0 && inactiveMixedUseCrossItemRules.length === 0,
    realProjectReportClosureMatrixReady: missingRequiredRecommendationKeys.length === 0 && realProjectOpenMatrixEntries.length === 0,
    goldenBenchmarkStaticGateReady: goldenBenchmarkStaticGate.status === 'pass',
  },
  goldenBenchmarkStaticGate,
  branchProcessStats,
  requiredMixedUseCrossItemRules,
  nativeDepthByCatalog: audit.nativeDepthByCatalog ?? {},
  realProjectClosureMatrix,
  findings,
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
writeFileSync(closureMatrixOutputPath, `${JSON.stringify({
  generatedAt: report.generatedAt,
  sourceReport: 'project-search/public-project-data/reports/wbs-template-real-project-coverage-2026-05-22.md',
  entries: realProjectClosureMatrix,
}, null, 2)}\n`, 'utf8')

if (findings.length > 0) {
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
}

console.log(JSON.stringify(report, null, 2))
