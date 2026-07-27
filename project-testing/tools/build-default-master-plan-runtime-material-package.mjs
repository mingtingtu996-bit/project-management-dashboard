#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { realProductionOutcomeQualityBlockers } from './default-master-plan-real-outcome-evidence.mjs'
import {
  defaultMasterPlanSourceBlockers,
  defaultMasterPlanStructuredSourceSignals,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness')
const DEFAULT_HANDOFF = path.join(DEFAULT_OUTPUT_ROOT, 'operator-handoff.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'runtime-material-package.json')

const MATERIAL_DEFINITIONS = [
  {
    key: 'publicationKey',
    placeholder: '<publication-key>',
    requiredEvidence: 'Real runtime publication key for the same baseline/project chain.',
    closesOrFeeds: 'runtime_publication_evidence and post_publish_smoke_and_rollback_evidence identity.',
  },
  {
    key: 'dependencyWriterResult',
    placeholder: '<dependency-writer-result.json>',
    requiredEvidence: 'Explicit execute-mode dependency writer result from the governed construction organization domain writer.',
    closesOrFeeds: 'production_dependency_writer_evidence source export.',
  },
  {
    key: 'criticalPathReadback',
    placeholder: '<critical-path-readback.json>',
    requiredEvidence: 'Critical-path readback for the same baseline/project/publication after dependency writer/runtime publication.',
    closesOrFeeds: 'production_dependency_writer_evidence and post_publish_smoke_and_rollback_evidence.',
  },
  {
    key: 'apiReadSmoke',
    placeholder: '<api-read-smoke.json>',
    requiredEvidence: 'real-environment API read smoke for the same baseline/project/publication.',
    closesOrFeeds: 'post_publish_smoke_and_rollback_evidence.',
  },
  {
    key: 'uiConsumptionSmoke',
    placeholder: '<ui-consumption-smoke.json>',
    requiredEvidence: 'Real-environment UI consumption smoke proving the published default master-plan runtime is visible and usable.',
    closesOrFeeds: 'post_publish_smoke_and_rollback_evidence.',
  },
  {
    key: 'rollbackVerification',
    placeholder: '<rollback-verification.json>',
    requiredEvidence: 'Rollback verification targeting rollback:<publicationKey> for the same runtime publication chain.',
    closesOrFeeds: 'post_publish_smoke_and_rollback_evidence.',
  },
]

const REAL_PRODUCTION_OUTCOME_REQUIRED_FIELDS = [
  'schemaVersion',
  'status',
  'environment',
  'target',
  'baselineId',
  'projectId',
  'publicationKey',
  'evidenceRef',
  'acceptedBy',
  'acceptedAt',
  'approvalRef',
  'runtimePublicationEvidenceRef',
  'apiReadSmokeEvidenceRef',
  'uiConsumptionSmokeEvidenceRef',
  'criticalPathReadbackEvidenceRef',
  'rollbackEvidenceRef',
]

const REAL_PRODUCTION_OUTCOME_TEMPLATE = {
  schemaVersion: 'workbuddy-default-master-plan-real-production-outcome/v1',
  requiredFields: REAL_PRODUCTION_OUTCOME_REQUIRED_FIELDS,
  example: {
    schemaVersion: 'workbuddy-default-master-plan-real-production-outcome/v1',
    status: 'verified',
    environment: 'production',
    target: {
      envFileRef: '<production-env-file-or-release-target-ref>',
      supabaseProjectRef: '<production-supabase-project-ref>',
      databaseHost: '<production-database-host>',
      connectionSource: '<connection-env-key-or-secret-ref>',
      environment: 'production',
    },
    baselineId: '<baseline-id>',
    projectId: '<project-id>',
    publicationKey: '<publication-key>',
    evidenceRef: '<path-to-real-production-outcome.json>#sha256=<64hex>',
    acceptedBy: 'production-owner:<user-id-or-uuid>',
    acceptedAt: '<iso-timestamp>',
    approvalRef: '<manual-approval-change-or-release-window-ref>',
    runtimePublicationEvidenceRef: '<runtime-publication-evidence-ref>',
    apiReadSmokeEvidenceRef: '<api-read-smoke-evidence-ref>',
    uiConsumptionSmokeEvidenceRef: '<ui-consumption-smoke-evidence-ref>',
    criticalPathReadbackEvidenceRef: '<critical-path-readback-evidence-ref>',
    rollbackEvidenceRef: '<rollback-evidence-ref>',
  },
  evidenceRefPolicy: {
    rawInputAcceptedPrefix: 'file_path_sha256',
    rawInputExample: '<path-to-real-production-outcome.json>#sha256=<64hex>',
    sourceExporterRewrite: 'real_production_outcome_export:<path-to-real-production-outcome.json>#sha256=<64hex>',
    finalSourceExportPrefix: 'real_production_outcome_export',
    finalReadinessRequiresSourceExportRef: true,
  },
}

const REAL_PRODUCTION_OUTCOME_MATERIAL_DEFINITION = {
  key: 'realProductionOutcome',
  placeholder: '<real-production-outcome.json>',
  requiredEvidence: 'Real production/live outcome evidence for the same baseline/project/publication chain.',
  closesOrFeeds: 'post_publish_smoke_and_rollback_evidence production-ready outcome boundary.',
  template: REAL_PRODUCTION_OUTCOME_TEMPLATE,
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoff: DEFAULT_HANDOFF,
    output: DEFAULT_OUTPUT,
    environment: 'staging',
    exportedBy: '',
    help: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const nextValue = () => {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`)
      index += 1
      return value
    }
    if (arg === '--handoff') {
      options.handoff = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--environment') {
      options.environment = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function buildDefaultMasterPlanRuntimeMaterialPackage({
  handoff = DEFAULT_HANDOFF,
  output = DEFAULT_OUTPUT,
  environment = 'staging',
  exportedBy = '',
  now = new Date(),
} = {}) {
  const handoffPath = path.resolve(handoff)
  const outputPath = path.resolve(output)
  const handoffPayload = JSON.parse(await readFile(handoffPath, 'utf8'))
  const handoffSourceGuard = defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(handoffPayload))
  const handoffSourceBlockers = handoffSourceGuard.blockers.map((blocker) => `operator_handoff_${blocker}`)
  const actionSequence = Array.isArray(handoffPayload.actionSequence) ? handoffPayload.actionSequence : []
  const sourceExportAction = actionSequence.find((action) => text(action.id) === 'source_export_collect') ?? {}
  const productionEvidencePipelineAction = actionSequence.find((action) => text(action.id) === 'production_evidence_pipeline') ?? {}
  const sourceExportCommand = text(sourceExportAction.command)
  const productionEvidencePipelineCommand = text(productionEvidencePipelineAction.command)
  const environmentText = text(environment) || text(handoffPayload.environment) || 'staging'
  const exportedByText = text(exportedBy) || text(handoffPayload.exportedBy) || '<real-release-operator>'
  const publicationKey = text(handoffPayload.publicationKey)
  const requiresRealProductionOutcome = hasFlag(sourceExportCommand, '--real-production-outcome')
    || isProductionReadyEnvironment(environmentText)
  const materialDefinitions = requiresRealProductionOutcome
    ? [...MATERIAL_DEFINITIONS, REAL_PRODUCTION_OUTCOME_MATERIAL_DEFINITION]
    : MATERIAL_DEFINITIONS
  const resolvedMaterials = {
    publicationKey: isPlaceholder(publicationKey) ? '' : publicationKey,
    dependencyWriterResult: extractFlagValue(sourceExportCommand, '--writer-result'),
    criticalPathReadback: extractFlagValue(sourceExportCommand, '--critical-path-readback'),
    apiReadSmoke: extractFlagValue(sourceExportCommand, '--api-read-smoke'),
    uiConsumptionSmoke: extractFlagValue(sourceExportCommand, '--ui-consumption-smoke'),
    rollbackVerification: extractFlagValue(sourceExportCommand, '--rollback-verification'),
    realProductionOutcome: extractFlagValue(sourceExportCommand, '--real-production-outcome')
      || (requiresRealProductionOutcome ? REAL_PRODUCTION_OUTCOME_MATERIAL_DEFINITION.placeholder : ''),
  }
  const requiredMaterials = materialDefinitions
    .filter((definition) => !text(resolvedMaterials[definition.key]) || isPlaceholder(resolvedMaterials[definition.key]))
    .map((definition) => ({
      ...definition,
      currentValue: text(resolvedMaterials[definition.key]) || definition.placeholder,
      collectionBoundary: 'Provide a real source artifact path/value through operator handoff; this package does not create or execute that artifact.',
    }))
  const missingMaterialFiles = requiredMaterials.length > 0
    ? []
    : await detectMissingMaterialFiles(resolvedMaterials, materialDefinitions)
  const baselineId = text(handoffPayload.baselineId)
  const projectId = text(handoffPayload.projectId)
  const materialIdentityMismatches = requiredMaterials.length > 0 || missingMaterialFiles.length > 0
    ? []
    : await detectMaterialIdentityMismatches(resolvedMaterials, {
      baselineId,
      projectId,
      publicationKey: resolvedMaterials.publicationKey,
      environment: environmentText,
    })
  const materialQualityMismatches = requiredMaterials.length > 0 || missingMaterialFiles.length > 0 || materialIdentityMismatches.length > 0
    ? []
    : await detectMaterialQualityMismatches(resolvedMaterials)
  const status = handoffSourceBlockers.length > 0
    ? 'blocked'
    : requiredMaterials.length > 0
      ? 'runtime_materials_required'
      : missingMaterialFiles.length > 0
        ? 'runtime_material_files_missing'
        : materialIdentityMismatches.length > 0
          ? 'runtime_material_identity_mismatch'
          : materialQualityMismatches.length > 0
            ? 'runtime_material_quality_mismatch'
            : 'runtime_materials_resolved'
  const blockers = [
    ...handoffSourceBlockers,
    requiredMaterials.length > 0 ? 'runtime_materials_required' : null,
    missingMaterialFiles.length > 0 ? 'runtime_material_files_missing' : null,
    materialIdentityMismatches.length > 0 ? 'runtime_material_identity_mismatch' : null,
    materialQualityMismatches.length > 0 ? 'runtime_material_quality_mismatch' : null,
  ].filter(Boolean)
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-runtime-material-package/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-runtime-material-package',
    status,
    productionReady: false,
    baselineId,
    projectId,
    handoffRef: `operator_handoff:${repoRelative(handoffPath)}`,
    environment: environmentText,
    exportedBy: exportedByText,
    requiredMaterialCount: requiredMaterials.length,
    requiredMaterials,
    missingMaterialFileCount: missingMaterialFiles.length,
    missingMaterialFiles,
    materialIdentityMismatchCount: materialIdentityMismatches.length,
    materialIdentityMismatches,
    materialQualityMismatchCount: materialQualityMismatches.length,
    materialQualityMismatches,
    resolvedMaterials,
    realProductionOutcomeTemplate: REAL_PRODUCTION_OUTCOME_TEMPLATE,
    blockers,
    nextCommands: {
      sourceExport: buildNextSourceExportCommand({
        sourceExportCommand,
        baselineId,
        projectId,
        publicationKey: publicationKey || '<publication-key>',
        environment: environmentText,
        exportedBy: exportedByText,
        includeRealProductionOutcome: requiresRealProductionOutcome,
      }),
      productionEvidencePipeline: productionEvidencePipelineCommand
        || 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs <source-export-pipeline-args>',
      operatorHandoffPreflight: 'npm run evidence:default-master-plan:operator-handoff-preflight',
    },
    mutationBoundary: {
      readsOperatorHandoff: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      invokesRuntimeWriters: false,
      writesRuntimePublication: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function buildFallbackSourceExportCommand({ baselineId, projectId, publicationKey, environment, exportedBy, includeRealProductionOutcome = false }) {
  const parts = [
    'npm run evidence:default-master-plan:export-sources --',
    `--baseline-id ${baselineId || '<baseline-id>'}`,
    `--project-id ${projectId || '<project-id>'}`,
    `--publication-key ${publicationKey || '<publication-key>'}`,
    `--environment ${environment}`,
    `--exported-by ${exportedBy}`,
    '--writer-result <dependency-writer-result.json>',
    '--critical-path-readback <critical-path-readback.json>',
    '--api-read-smoke <api-read-smoke.json>',
    '--ui-consumption-smoke <ui-consumption-smoke.json>',
    '--rollback-verification <rollback-verification.json>',
  ]
  if (includeRealProductionOutcome) {
    parts.push('--real-production-outcome <real-production-outcome.json>')
  }
  return parts.join(' ')
}

function buildNextSourceExportCommand({
  sourceExportCommand,
  baselineId,
  projectId,
  publicationKey,
  environment,
  exportedBy,
  includeRealProductionOutcome = false,
}) {
  const command = text(sourceExportCommand)
  if (!command) {
    return buildFallbackSourceExportCommand({
      baselineId,
      projectId,
      publicationKey,
      environment,
      exportedBy,
      includeRealProductionOutcome,
    })
  }
  if (includeRealProductionOutcome && !hasFlag(command, '--real-production-outcome')) {
    return `${command} --real-production-outcome <real-production-outcome.json>`
  }
  return command
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Runtime Material Package',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- requiredMaterialCount: ${report.requiredMaterialCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    `- mutationBoundary: writesProductionTables=false, writesTasks=false, writesTaskDependencies=false, writesDurationSamples=false, invokesRuntimeWriters=false, writesRuntimePublication=false`,
    '',
    '## Required Materials',
    '',
    '| key | current value | required evidence | feeds |',
    '|---|---|---|---|',
  ]
  for (const item of report.requiredMaterials) {
    lines.push(`| ${escapeTable(item.key)} | ${escapeTable(item.currentValue)} | ${escapeTable(item.requiredEvidence)} | ${escapeTable(item.closesOrFeeds)} |`)
  }
  if (report.requiredMaterials.length === 0) lines.push('| none | none | none | none |')
  lines.push(
    '',
    '## Real Production Outcome Template',
    '',
    '| field | example value |',
    '|---|---|',
  )
  for (const field of report.realProductionOutcomeTemplate.requiredFields) {
    lines.push(`| ${escapeTable(field)} | ${escapeTable(report.realProductionOutcomeTemplate.example?.[field])} |`)
  }
  lines.push(
    '',
    '## Evidence Ref Policy',
    '',
    '- Raw operator input accepts `<path-to-real-production-outcome.json>#sha256=<64hex>`.',
    '- The source exporter rewrites it to `real_production_outcome_export:<path-to-real-production-outcome.json>#sha256=<64hex>`.',
    '- Final readiness requires `real_production_outcome_export:` in the source manifest real outcome record.',
  )
  for (const item of report.requiredMaterials.filter((material) => Array.isArray(material.template?.requiredFields))) {
    lines.push(
      '',
      `## ${item.key} Required Fields`,
      '',
      '| field | example value |',
      '|---|---|',
    )
    for (const field of item.template.requiredFields) {
      lines.push(`| ${escapeTable(field)} | ${escapeTable(item.template.example?.[field])} |`)
    }
  }
  lines.push(
    '',
    '## Missing Material Files',
    '',
    '| key | path | expected evidence |',
    '|---|---|---|',
  )
  for (const item of report.missingMaterialFiles) {
    lines.push(`| ${escapeTable(item.key)} | ${escapeTable(item.path)} | ${escapeTable(item.requiredEvidence)} |`)
  }
  if (report.missingMaterialFiles.length === 0) lines.push('| none | none | none |')
  lines.push(
    '',
    '## Material Identity Mismatches',
    '',
    '| key | path | expected baseline | actual baseline | expected project | actual project | expected publication | actual publication | expected environment | actual environment |',
    '|---|---|---|---|---|---|---|---|---|---|',
  )
  for (const item of report.materialIdentityMismatches) {
    lines.push(`| ${escapeTable(item.key)} | ${escapeTable(item.path)} | ${escapeTable(item.expectedBaselineId)} | ${escapeTable(item.actualBaselineId)} | ${escapeTable(item.expectedProjectId)} | ${escapeTable(item.actualProjectId)} | ${escapeTable(item.expectedPublicationKey)} | ${escapeTable(item.actualPublicationKey)} | ${escapeTable(item.expectedEnvironment)} | ${escapeTable(item.actualEnvironment)} |`)
  }
  if (report.materialIdentityMismatches.length === 0) lines.push('| none | none | none | none | none | none | none | none | none | none |')
  lines.push(
    '',
    '## Material Quality Mismatches',
    '',
    '| key | path | blockers | required evidence |',
    '|---|---|---|---|',
  )
  for (const item of report.materialQualityMismatches) {
    lines.push(`| ${escapeTable(item.key)} | ${escapeTable(item.path)} | ${escapeTable(item.blockers.join(', '))} | ${escapeTable(item.requiredEvidence)} |`)
  }
  if (report.materialQualityMismatches.length === 0) lines.push('| none | none | none | none |')
  lines.push(
    '',
    '## Next Commands',
    '',
    '```powershell',
    report.nextCommands.sourceExport,
    report.nextCommands.productionEvidencePipeline,
    report.nextCommands.operatorHandoffPreflight,
    '```',
    '',
  )
  return `${lines.join('\n')}\n`
}

async function detectMissingMaterialFiles(resolvedMaterials, materialDefinitions = MATERIAL_DEFINITIONS) {
  const checks = materialDefinitions.filter((definition) => definition.key !== 'publicationKey')
  const missing = []
  for (const definition of checks) {
    const materialPath = text(resolvedMaterials[definition.key])
    if (!materialPath || isPlaceholder(materialPath)) continue
    if (!await isReadableFile(materialPath)) {
      missing.push({
        key: definition.key,
        path: materialPath,
        requiredEvidence: definition.requiredEvidence,
        closesOrFeeds: definition.closesOrFeeds,
      })
    }
  }
  return missing
}

async function detectMaterialIdentityMismatches(resolvedMaterials, { baselineId, projectId, publicationKey, environment }) {
  const checks = MATERIAL_DEFINITIONS
    .concat(resolvedMaterials.realProductionOutcome ? [REAL_PRODUCTION_OUTCOME_MATERIAL_DEFINITION] : [])
    .filter((definition, index, definitions) => (
      definition.key !== 'publicationKey'
      && definitions.findIndex((candidate) => candidate.key === definition.key) === index
    ))
  const mismatches = []
  for (const definition of checks) {
    const materialPath = text(resolvedMaterials[definition.key])
    if (!materialPath || isPlaceholder(materialPath)) continue
    const payload = await readJsonIfPossible(materialPath)
    if (!payload) continue
    const actualBaselineId = firstText(
      payload.baselineId,
      payload.baseline_id,
      payload.candidateBaselineId,
      payload.candidate_baseline_id,
    )
    const actualProjectId = firstText(
      payload.projectId,
      payload.project_id,
    )
    const actualPublicationKey = firstText(
      payload.publicationKey,
      payload.publication_key,
    )
    const actualEnvironment = firstText(
      payload.environment,
      payload.targetEnvironment,
      payload.target_environment,
      payload.runtimeEnvironment,
      payload.runtime_environment,
      payload.releaseEnvironment,
      payload.release_environment,
    )
    const baselineMismatch = actualBaselineId && baselineId && actualBaselineId !== baselineId
    const projectMismatch = actualProjectId && projectId && actualProjectId !== projectId
    const publicationMismatch = actualPublicationKey && publicationKey && actualPublicationKey !== publicationKey
    const environmentMismatch = definition.key === 'realProductionOutcome'
      && actualEnvironment
      && environment
      && actualEnvironment.toLowerCase() !== environment.toLowerCase()
    const productionOutcomeEnvironmentMismatch = definition.key === 'realProductionOutcome'
      && actualEnvironment
      && !isProductionReadyEnvironment(actualEnvironment)
    if (baselineMismatch || projectMismatch || publicationMismatch || environmentMismatch || productionOutcomeEnvironmentMismatch) {
      mismatches.push({
        key: definition.key,
        path: materialPath,
        expectedBaselineId: baselineId,
        actualBaselineId,
        expectedProjectId: projectId,
        actualProjectId,
        expectedPublicationKey: publicationKey,
        actualPublicationKey,
        expectedEnvironment: definition.key === 'realProductionOutcome' ? environment : '',
        actualEnvironment,
        requiredEvidence: definition.requiredEvidence,
        closesOrFeeds: definition.closesOrFeeds,
      })
    }
  }
  return mismatches
}

async function detectMaterialQualityMismatches(resolvedMaterials) {
  const mismatches = []
  const realProductionOutcomePath = text(resolvedMaterials.realProductionOutcome)
  if (!realProductionOutcomePath || isPlaceholder(realProductionOutcomePath)) return mismatches
  const payload = await readJsonIfPossible(realProductionOutcomePath)
  if (!payload) return mismatches
  const blockers = realProductionOutcomeQualityBlockers(payload)
  if (blockers.length > 0) {
    mismatches.push({
      key: 'realProductionOutcome',
      path: realProductionOutcomePath,
      blockers,
      requiredEvidence: REAL_PRODUCTION_OUTCOME_MATERIAL_DEFINITION.requiredEvidence,
      closesOrFeeds: REAL_PRODUCTION_OUTCOME_MATERIAL_DEFINITION.closesOrFeeds,
    })
  }
  return mismatches
}

async function readJsonIfPossible(filePath) {
  try {
    return JSON.parse(await readFile(path.resolve(filePath), 'utf8'))
  } catch {
    return null
  }
}

function firstText(...values) {
  return values.map(text).find(Boolean) ?? ''
}

async function isReadableFile(filePath) {
  try {
    const info = await stat(path.resolve(filePath))
    return info.isFile()
  } catch {
    return false
  }
}

function extractFlagValue(command, flag) {
  const parts = text(command).split(/\s+/).filter(Boolean)
  const index = parts.indexOf(flag)
  if (index < 0) return ''
  return text(parts[index + 1])
}

function hasFlag(command, flag) {
  return text(command).split(/\s+/).filter(Boolean).includes(flag)
}

function isProductionReadyEnvironment(value) {
  return ['production', 'live'].includes(text(value).toLowerCase())
}

function isPlaceholder(value) {
  return /^<[^>\r\n]+>$/.test(text(value))
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function escapeTable(value) {
  return text(value).replaceAll('|', '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/build-default-master-plan-runtime-material-package.mjs',
    '  [--handoff <operator-handoff.json>]',
    '  [--output <runtime-material-package.json>]',
    '  [--environment staging] [--exported-by <actor>]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanRuntimeMaterialPackage(options)
    console.log(JSON.stringify({
      status: report.status,
      productionReady: report.productionReady,
      baselineId: report.baselineId,
      projectId: report.projectId,
      requiredMaterialCount: report.requiredMaterialCount,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
