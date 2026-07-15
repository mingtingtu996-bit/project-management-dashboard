#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeRealProductionOutcomeEvidence,
  validateRealProductionOutcomeFile,
} from './default-master-plan-real-outcome-evidence.mjs'
import {
  defaultMasterPlanSourceBlockers,
  defaultMasterPlanStructuredSourceSignals,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness')
const DEFAULT_HANDOFF = path.join(DEFAULT_OUTPUT_ROOT, 'operator-handoff.json')
const DEFAULT_RUNTIME_MATERIAL_PACKAGE = path.join(DEFAULT_OUTPUT_ROOT, 'runtime-material-package.json')
const DEFAULT_OUTPUT = path.join(DEFAULT_OUTPUT_ROOT, 'real-production-outcome-package.json')

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

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoff: DEFAULT_HANDOFF,
    runtimeMaterialPackage: DEFAULT_RUNTIME_MATERIAL_PACKAGE,
    realProductionOutcome: '',
    output: DEFAULT_OUTPUT,
    targetEnvironment: 'production',
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
    } else if (arg === '--runtime-material-package') {
      options.runtimeMaterialPackage = path.resolve(nextValue())
    } else if (arg === '--real-production-outcome') {
      options.realProductionOutcome = nextValue()
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--target-environment' || arg === '--environment') {
      options.targetEnvironment = nextValue()
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

export async function buildDefaultMasterPlanRealProductionOutcomePackage({
  handoff = DEFAULT_HANDOFF,
  runtimeMaterialPackage = DEFAULT_RUNTIME_MATERIAL_PACKAGE,
  realProductionOutcome = '',
  output = DEFAULT_OUTPUT,
  targetEnvironment = 'production',
  exportedBy = '',
  now = new Date(),
} = {}) {
  const handoffPath = path.resolve(handoff)
  const runtimeMaterialPackagePath = path.resolve(runtimeMaterialPackage)
  const outputPath = path.resolve(output)
  const handoffPayload = await readJsonIfPresent(handoffPath)
  const runtimeMaterialPayload = await readJsonIfPresent(runtimeMaterialPackagePath)
  const handoffSourceGuard = defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(handoffPayload))
  const runtimeMaterialSourceGuard = defaultMasterPlanSourceBlockers(defaultMasterPlanStructuredSourceSignals(runtimeMaterialPayload))
  const inputBlockers = unique([
    ...handoffSourceGuard.blockers.map((blocker) => `operator_handoff_${blocker}`),
    ...runtimeMaterialSourceGuard.blockers.map((blocker) => `runtime_material_package_${blocker}`),
  ])
  const baselineId = text(handoffPayload.baselineId)
  const projectId = text(handoffPayload.projectId)
  const publicationKey = text(handoffPayload.publicationKey)
  const targetEnvironmentText = text(targetEnvironment) || 'production'
  const exportedByText = text(exportedBy) || text(handoffPayload.exportedBy) || '<production-release-operator>'
  const realProductionOutcomePath = text(realProductionOutcome)

  const realProductionOutcomeTemplate = buildRealProductionOutcomeTemplate({
    template: runtimeMaterialPayload.realProductionOutcomeTemplate,
    baselineId,
    projectId,
    publicationKey,
    targetEnvironment: targetEnvironmentText,
  })
  const validationBlockers = realProductionOutcomePath
    ? await validateRealProductionOutcomeFile(realProductionOutcomePath, {
      baselineId,
      projectId,
      publicationKey,
      targetEnvironment: targetEnvironmentText,
    })
    : []
  const realProductionOutcomePayload = realProductionOutcomePath && validationBlockers.length === 0
    ? normalizeRealProductionOutcomeEvidence(await readJsonIfPresent(realProductionOutcomePath))
    : null
  const blockers = inputBlockers.length > 0
    ? inputBlockers
    : realProductionOutcomePath
      ? validationBlockers
      : ['real_production_outcome_file_required']
  const status = inputBlockers.length > 0
    ? 'real_production_outcome_blocked'
    : realProductionOutcomePath
      ? blockers.length === 0
      ? 'real_production_outcome_ready_for_source_export'
      : 'real_production_outcome_blocked'
      : 'real_production_outcome_required'

  const report = {
    schemaVersion: 'workbuddy-default-master-plan-real-production-outcome-package/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-real-production-outcome-package',
    status,
    productionReady: false,
    baselineId,
    projectId,
    publicationKey,
    targetEnvironment: targetEnvironmentText,
    exportedBy: exportedByText,
    handoffRef: `operator_handoff:${repoRelative(handoffPath)}`,
    runtimeMaterialPackageRef: `runtime_material_package:${repoRelative(runtimeMaterialPackagePath)}`,
    realProductionOutcomePath: realProductionOutcomePath || '<real-production-outcome.json>',
    realProductionOutcomeTemplate,
    validationBlockers,
    realProductionOutcome: realProductionOutcomePayload,
    blockers,
    nextCommands: {
      sourceExport: buildSourceExportCommand({
        baselineId,
        projectId,
        publicationKey,
        targetEnvironment: targetEnvironmentText,
        exportedBy: exportedByText,
        realProductionOutcome: realProductionOutcomePath || '<real-production-outcome.json>',
      }),
      productionEvidencePipeline: 'node project-testing/tools/build-default-master-plan-production-evidence-pipeline.mjs <source-export-pipeline-args-from-production-manifest>',
      readinessCheck: 'node project-testing/tools/check-default-master-plan-production-readiness.mjs <five-evidence-args-from-production-pipeline>',
    },
    mutationBoundary: {
      readsOperatorHandoff: true,
      readsRuntimeMaterialPackage: true,
      readsRealProductionOutcome: Boolean(realProductionOutcomePath),
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

function buildRealProductionOutcomeTemplate({ template, baselineId, projectId, publicationKey, targetEnvironment }) {
  const templateRequiredFields = Array.isArray(template?.requiredFields) && template.requiredFields.length > 0
    ? template.requiredFields.map(text).filter(Boolean)
    : REAL_PRODUCTION_OUTCOME_REQUIRED_FIELDS
  const requiredFields = unique([...templateRequiredFields, ...REAL_PRODUCTION_OUTCOME_REQUIRED_FIELDS])
  return {
    schemaVersion: text(template?.schemaVersion) || 'workbuddy-default-master-plan-real-production-outcome/v1',
    requiredFields,
    evidenceRefPolicy: {
      rawInputAcceptedPrefix: 'file_path_sha256',
      rawInputExample: '<path-to-real-production-outcome.json>#sha256=<64hex>',
      sourceExporterRewrite: 'real_production_outcome_export:<path-to-real-production-outcome.json>#sha256=<64hex>',
      finalSourceExportPrefix: 'real_production_outcome_export',
      finalReadinessRequiresSourceExportRef: true,
    },
    example: {
      schemaVersion: 'workbuddy-default-master-plan-real-production-outcome/v1',
      status: 'verified',
      environment: targetEnvironment,
      target: {
        envFileRef: '<production-env-file-or-release-target-ref>',
        supabaseProjectRef: '<production-supabase-project-ref>',
        databaseHost: '<production-database-host>',
        connectionSource: '<connection-env-key-or-secret-ref>',
        environment: targetEnvironment,
      },
      baselineId: baselineId || '<baseline-id>',
      projectId: projectId || '<project-id>',
      publicationKey: publicationKey || '<publication-key>',
      evidenceRef: '<path-to-real-production-outcome.json>#sha256=<64hex>',
      acceptedBy: 'production-owner:<user-id-or-uuid>',
      acceptedAt: '<iso-timestamp>',
      approvalRef: '<manual-approval-change-or-release-window-ref>',
      runtimePublicationEvidenceRef: 'wbs_template_runtime_publications_export:<production-runtime-publications-export.json>#sha256=<64hex>',
      apiReadSmokeEvidenceRef: 'api_read_smoke_export:<production-api-read-smoke-export.json>#sha256=<64hex>',
      uiConsumptionSmokeEvidenceRef: 'ui_consumption_smoke_export:<production-ui-consumption-smoke-export.json>#sha256=<64hex>',
      criticalPathReadbackEvidenceRef: 'critical_path_readback_export:<production-critical-path-readback-export.json>#sha256=<64hex>',
      rollbackEvidenceRef: 'rollback_verification_export:<production-rollback-verification-export.json>#sha256=<64hex>',
    },
  }
}

function buildSourceExportCommand({ baselineId, projectId, publicationKey, targetEnvironment, exportedBy, realProductionOutcome }) {
  return [
    'npm run evidence:default-master-plan:export-sources --',
    `--baseline-id ${baselineId || '<baseline-id>'}`,
    `--project-id ${projectId || '<project-id>'}`,
    `--publication-key ${publicationKey || '<publication-key>'}`,
    `--environment ${targetEnvironment}`,
    `--exported-by ${exportedBy}`,
    '--writer-result <production-dependency-writer-result.json>',
    '--critical-path-readback <production-critical-path-readback.json>',
    '--api-read-smoke <production-api-read-smoke.json>',
    '--ui-consumption-smoke <production-ui-consumption-smoke.json>',
    '--rollback-verification <production-rollback-verification.json>',
    `--real-production-outcome ${realProductionOutcome}`,
  ].join(' ')
}

function renderMarkdown(report) {
  const lines = [
    '# Default Master Plan Real Production Outcome Package',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- publicationKey: ${report.publicationKey}`,
    `- targetEnvironment: ${report.targetEnvironment}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    `- mutationBoundary: writesProductionTables=false, writesTasks=false, writesTaskDependencies=false, writesDurationSamples=false, invokesRuntimeWriters=false, writesRuntimePublication=false, performsRollback=false`,
    '',
    '## Real Production Outcome Required Fields',
    '',
    '| field | example value |',
    '|---|---|',
  ]
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
  lines.push(
    '',
    '## Validation',
    '',
    '| key | value |',
    '|---|---|',
    `| realProductionOutcomePath | ${escapeTable(report.realProductionOutcomePath)} |`,
    `| validationBlockers | ${escapeTable(report.validationBlockers.length > 0 ? report.validationBlockers.join(', ') : 'none')} |`,
    '',
    '## Next Commands',
    '',
    '```powershell',
    report.nextCommands.sourceExport,
    report.nextCommands.productionEvidencePipeline,
    report.nextCommands.readinessCheck,
    '```',
    '',
  )
  return `${lines.join('\n')}\n`
}

async function readJsonIfPresent(filePath) {
  if (!filePath) return {}
  try {
    return JSON.parse(await readFile(path.resolve(filePath), 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

function markdownPathFor(outputPath) {
  return outputPath.endsWith('.json') ? outputPath.replace(/\.json$/, '.md') : `${outputPath}.md`
}

function repoRelative(filePath) {
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function escapeTable(value) {
  const rendered = value && typeof value === 'object'
    ? JSON.stringify(value)
    : text(value)
  return rendered.replaceAll('|', '\\|')
}

function text(value) {
  return String(value ?? '').trim()
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/build-default-master-plan-real-production-outcome-package.mjs',
    '  [--handoff <operator-handoff.json>]',
    '  [--runtime-material-package <runtime-material-package.json>]',
    '  [--real-production-outcome <real-production-outcome.json>]',
    '  [--output <real-production-outcome-package.json>]',
    '  [--target-environment <production|live>]',
    '  [--exported-by <actor>]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanRealProductionOutcomePackage(options)
    console.log(JSON.stringify({
      status: report.status,
      productionReady: report.productionReady,
      baselineId: report.baselineId,
      projectId: report.projectId,
      publicationKey: report.publicationKey,
      targetEnvironment: report.targetEnvironment,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
