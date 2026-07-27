#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const OUTPUT_ROOT = path.join(REPO_ROOT, 'project-testing', 'reports', 'default-master-plan-production-readiness')
const DEFAULT_COLLECTION_PACKAGE = path.join(OUTPUT_ROOT, 'duration-sample-collection-package.json')
const DEFAULT_OUTPUT = path.join(OUTPUT_ROOT, 'real-duration-sample-material.template.json')
const DEFAULT_COLLECTION_KIT_OUTPUT = path.join(OUTPUT_ROOT, 'real-duration-sample-collection-kit.json')

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    collectionPackage: DEFAULT_COLLECTION_PACKAGE,
    output: DEFAULT_OUTPUT,
    collectionKitOutput: '',
    realEvidenceGapSummary: '',
    preparedBy: '',
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
    if (arg === '--collection-package') {
      options.collectionPackage = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--real-evidence-gap-summary') {
      options.realEvidenceGapSummary = path.resolve(nextValue())
    } else if (arg === '--collection-kit-output') {
      options.collectionKitOutput = path.resolve(nextValue())
    } else if (arg === '--prepared-by') {
      options.preparedBy = nextValue()
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export async function buildDefaultMasterPlanRealDurationSampleMaterialTemplate({
  collectionPackage = DEFAULT_COLLECTION_PACKAGE,
  output = DEFAULT_OUTPUT,
  collectionKitOutput = '',
  realEvidenceGapSummary = '',
  preparedBy = '',
  now = new Date(),
} = {}) {
  const collectionPackagePath = path.resolve(collectionPackage)
  const outputPath = path.resolve(output)
  const collectionKitOutputPath = collectionKitOutput ? path.resolve(collectionKitOutput) : ''
  const realEvidenceGapSummaryPath = realEvidenceGapSummary ? path.resolve(realEvidenceGapSummary) : ''
  const packagePayload = JSON.parse(await readFile(collectionPackagePath, 'utf8'))
  const baselineId = text(packagePayload.baselineId ?? packagePayload.baseline_id)
  const projectId = text(packagePayload.projectId ?? packagePayload.project_id)
  const sampleRequests = readSampleRequests(packagePayload)
  const realEvidenceGapSummaryPayload = realEvidenceGapSummaryPath
    ? JSON.parse(await readFile(realEvidenceGapSummaryPath, 'utf8'))
    : null
  const templateRequests = realEvidenceGapSummaryPayload
    ? buildTargetSampleRequests(sampleRequests, readNextSampleCollectionTargets(realEvidenceGapSummaryPayload))
    : sampleRequests
  const blockers = uniqueText([
    baselineId ? null : 'baseline_id_required',
    projectId ? null : 'project_id_required',
    sampleRequests.length > 0 ? null : 'sample_requests_required',
    templateRequests.length > 0 ? null : realEvidenceGapSummaryPayload ? 'next_sample_collection_targets_required' : 'sample_requests_required',
  ])
  const template = {
    schemaVersion: 'workbuddy-real-duration-sample-material/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-real-duration-sample-material-template',
    materialTemplate: true,
    templateStatus: 'operator_input_required',
    baselineId,
    projectId,
    preparedBy: text(preparedBy) || '<real-release-operator>',
    collectionPackageRef: `duration_sample_collection_package:${repoRelative(collectionPackagePath)}`,
    realEvidenceGapSummaryRef: realEvidenceGapSummaryPath ? `real_evidence_gap_summary:${repoRelative(realEvidenceGapSummaryPath)}` : '',
    targetSource: realEvidenceGapSummaryPath ? 'real_evidence_gap_summary' : 'duration_sample_collection_package',
    sourceEvidence: {
      sourceName: '<required: completed project/task source name>',
      evidenceRef: '<required: operator-reviewed source evidence ref>',
      operatorReviewRef: '<required: review record or evidence package ref>',
    },
    operatorInstructions: {
      noWriteBoundary: 'template_only_no_db_write',
      fillRequiredFields: [
        'id',
        'projectId',
        'taskId',
        'actualDurationDays',
        'startedAt',
        'completedAt',
        'evidenceRef',
      ],
      beforeExport: [
        'replace all <required:...> placeholders with real completed-task evidence',
        'set sampleStatus to accepted or active only after operator review',
        'set includedInBenchmark to true only after evidence review',
        'remove materialTemplate/templatePlaceholder markers or set them false',
      ],
      rejectedMarkers: [
        'materialTemplate=true',
        'metadata.materialTemplate=true',
        'metadata.templatePlaceholder=true',
        'stagingControlledReplay=true',
        'notRealProductionOutcome=true',
        'metadata.source=default_master_plan_staging_runtime_writer',
      ],
    },
    samples: templateRequests.map((request, index) => buildTemplateSample(request, {
      index,
      baselineId,
      projectId,
      collectionPackagePath,
    })),
  }
  const collectionKit = collectionKitOutputPath ? buildCollectionKit(template, {
    outputPath: collectionKitOutputPath,
    collectionPackagePath,
    realEvidenceGapSummaryPath,
  }) : null
  const report = {
    schemaVersion: 'workbuddy-default-master-plan-real-duration-sample-material-template/v1',
    generatedAt: now.toISOString(),
    source: 'build-default-master-plan-real-duration-sample-material-template',
    status: blockers.length > 0 ? 'blocked' : 'template_ready',
    productionReady: false,
    baselineId,
    projectId,
    materialTemplateRef: `real_duration_sample_material_template:${repoRelative(outputPath)}`,
    collectionKitRef: collectionKitOutputPath ? `real_duration_sample_collection_kit:${repoRelative(collectionKitOutputPath)}` : '',
    collectionPackageRef: `duration_sample_collection_package:${repoRelative(collectionPackagePath)}`,
    realEvidenceGapSummaryRef: realEvidenceGapSummaryPath ? `real_evidence_gap_summary:${repoRelative(realEvidenceGapSummaryPath)}` : '',
    summary: {
      requestCount: sampleRequests.length,
      templateSampleCount: template.samples.length,
      targetSampleCount: realEvidenceGapSummaryPath ? templateRequests.length : 0,
      targetSource: realEvidenceGapSummaryPath ? 'real_evidence_gap_summary' : 'duration_sample_collection_package',
      targetBusinessTypeCount: realEvidenceGapSummaryPath ? uniqueText(templateRequests.map((request) => request.businessType ?? request.business_type)).length : 0,
      collectionKitBusinessTypeCount: collectionKit ? collectionKit.summary.businessTypeGroupCount : 0,
      collectionKitTargetCount: collectionKit ? collectionKit.summary.targetCount : 0,
    },
    blockers,
    mutationBoundary: {
      readsDurationSampleCollectionPackage: true,
      writesReportFiles: true,
      writesProductionTables: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesDurationSamples: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(template, null, 2)}\n`, 'utf8')
  if (collectionKit && collectionKitOutputPath) {
    await mkdir(path.dirname(collectionKitOutputPath), { recursive: true })
    await writeFile(collectionKitOutputPath, `${JSON.stringify(collectionKit, null, 2)}\n`, 'utf8')
    await writeFile(collectionKitMarkdownPathFor(collectionKitOutputPath), renderCollectionKitMarkdown(collectionKit), 'utf8')
  }
  await writeFile(reportPathFor(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(markdownPathFor(outputPath), renderMarkdown(report), 'utf8')
  return report
}

function buildCollectionKit(template, { outputPath, collectionPackagePath, realEvidenceGapSummaryPath }) {
  const rows = template.samples.map((sample, index) => buildCollectionKitRow(sample, index))
  const businessTypeOrder = uniqueText(rows.map((row) => row.businessType || 'unknown'))
  const businessTypeGroups = businessTypeOrder.map((businessType) => {
    const groupRows = rows.filter((row) => row.businessType === businessType)
    return {
      businessType,
      targetCount: groupRows.length,
      missingSampleCount: groupRows.reduce((sum, row) => sum + row.missingSampleCount, 0),
      invalidSampleCount: groupRows.reduce((sum, row) => sum + row.invalidSampleCount, 0),
      rows: groupRows,
    }
  })
  return {
    schemaVersion: 'workbuddy-real-duration-sample-collection-kit/v1',
    generatedAt: template.generatedAt,
    source: 'build-default-master-plan-real-duration-sample-material-template',
    productionReady: false,
    noWriteBoundary: 'operator_collection_kit_only_no_db_write',
    baselineId: template.baselineId,
    projectId: template.projectId,
    preparedBy: template.preparedBy,
    targetSource: template.targetSource,
    collectionPackageRef: `duration_sample_collection_package:${repoRelative(collectionPackagePath)}`,
    realEvidenceGapSummaryRef: realEvidenceGapSummaryPath ? `real_evidence_gap_summary:${repoRelative(realEvidenceGapSummaryPath)}` : '',
    collectionKitRef: `real_duration_sample_collection_kit:${repoRelative(outputPath)}`,
    summary: {
      targetCount: rows.length,
      businessTypeGroupCount: businessTypeGroups.length,
      missingSampleCount: rows.reduce((sum, row) => sum + row.missingSampleCount, 0),
      invalidSampleCount: rows.reduce((sum, row) => sum + row.invalidSampleCount, 0),
    },
    requiredOperatorFields: [
      'sourceProjectName',
      'sourceTaskName',
      'sourceTaskId',
      'actualDurationDays',
      'startedAt',
      'completedAt',
      'evidenceRef',
      'operatorReviewRef',
    ],
    businessTypeGroups,
    mutationBoundary: {
      writesProductionTables: false,
      writesDurationSamples: false,
      writesTasks: false,
      writesTaskDependencies: false,
      writesRuntimePublication: false,
      invokesRuntimeWriters: false,
      performsRollback: false,
    },
  }
}

function buildCollectionKitRow(sample, index) {
  const metadata = sample.metadata ?? {}
  const stableCode = text(sample.stableCode) || `row-${index + 1}`
  return {
    priority: readNumber(metadata.sampleCollectionTargetPriority) || index + 1,
    businessType: text(metadata.businessType) || 'unknown',
    stableCode,
    title: text(sample.title),
    requiredAcceptedSampleCount: readNumber(sample.requiredAcceptedSampleCount) || 1,
    readySampleCount: readNumber(metadata.readySampleCount),
    missingSampleCount: readNumber(metadata.missingSampleCount),
    invalidSampleCount: readNumber(metadata.invalidSampleCount),
    candidateReferenceDays: readNumber(sample.candidateReferenceDays),
    durationAssetStableCode: text(metadata.durationAssetStableCode),
    t2RhythmTemplateId: text(metadata.t2RhythmTemplateId),
    profileRuntimeReferenceStableCode: text(metadata.profileRuntimeReferenceStableCode),
    stableCodeResolution: text(metadata.stableCodeResolution),
    nextAction: text(metadata.nextAction),
    operatorFields: {
      sourceProjectName: '<required:string>',
      sourceTaskName: '<required:string>',
      sourceTaskId: '<required:string>',
      actualDurationDays: '<required:number>',
      startedAt: '<required:YYYY-MM-DD>',
      completedAt: '<required:YYYY-MM-DD>',
      evidenceRef: '<required:string>',
      operatorReviewRef: '<required:string>',
    },
  }
}
function buildTemplateSample(request, { index, baselineId, projectId, collectionPackagePath }) {
  const stableCode = requestStableCode(request)
  const requiredCount = Math.max(1, readNumber(request.requiredAcceptedSampleCount ?? request.required_accepted_sample_count))
  return {
    id: `<required: real-sample-id-for-${stableCode || `row-${index + 1}`}>`,
    stableCode,
    title: text(request.title),
    projectId,
    taskId: `<required: completed-task-id-for-${stableCode || `row-${index + 1}`}>`,
    actualDurationDays: null,
    startedAt: '<required: YYYY-MM-DD>',
    completedAt: '<required: YYYY-MM-DD>',
    sourceType: 'completed_task',
    sampleStatus: 'draft',
    includedInBenchmark: false,
    evidenceRef: `<required: operator-evidence-ref-for-${stableCode || `row-${index + 1}`}>`,
    candidateReferenceDays: readNumber(request.candidateReferenceDays ?? request.candidate_reference_days),
    requiredAcceptedSampleCount: requiredCount,
    collectionRequirement: text(request.collectionRequirement ?? request.collection_requirement),
    metadata: {
      materialTemplate: true,
      templatePlaceholder: true,
      baselineId,
      requestCandidateRowId: text(request.candidateRowId ?? request.candidate_row_id),
      collectionPackageRef: repoRelative(collectionPackagePath),
      businessType: text(request.businessType ?? request.business_type),
      businessTypes: readStringArray(request.businessTypes ?? request.business_types),
      executionPhase: text(request.executionPhase ?? request.execution_phase),
      executionLane: text(request.executionLane ?? request.execution_lane),
      requestSources: uniqueText([
        request.source,
        ...(Array.isArray(request.requestSources) ? request.requestSources : []),
        ...(Array.isArray(request.request_sources) ? request.request_sources : []),
      ]),
      durationAssetStableCode: text(request.durationAssetStableCode ?? request.duration_asset_stable_code),
      t2RhythmTemplateId: text(request.t2RhythmTemplateId ?? request.t2_rhythm_template_id),
      profileRuntimeReferenceStableCode: text(request.profileRuntimeReferenceStableCode ?? request.profile_runtime_reference_stable_code),
      stableCodeResolution: text(request.stableCodeResolution ?? request.stable_code_resolution),
      sampleCollectionTargetPriority: readNumber(request.sampleCollectionTargetPriority ?? request.sample_collection_target_priority ?? request.priority),
      readySampleCount: readNumber(request.readySampleCount ?? request.ready_sample_count),
      missingSampleCount: readNumber(request.missingSampleCount ?? request.missing_sample_count),
      invalidSampleCount: readNumber(request.invalidSampleCount ?? request.invalid_sample_count),
      nextAction: text(request.nextAction ?? request.next_action),
      stagingControlledReplay: false,
      notRealProductionOutcome: false,
    },
  }
}

function readSampleRequests(payload) {
  if (Array.isArray(payload?.sampleRequests)) return payload.sampleRequests
  if (Array.isArray(payload?.sample_requests)) return payload.sample_requests
  if (Array.isArray(payload?.rows)) return payload.rows
  return []
}
function readNextSampleCollectionTargets(payload) {
  const targets = payload?.realEvidenceGaps?.realDurationSampleMaterialPreflight?.nextSampleCollectionTargets
    ?? payload?.real_evidence_gaps?.real_duration_sample_material_preflight?.next_sample_collection_targets
    ?? payload?.nextSampleCollectionTargets
    ?? payload?.next_sample_collection_targets
  return Array.isArray(targets) ? targets : []
}

function buildTargetSampleRequests(sampleRequests, targets) {
  const requestByStableCode = new Map(sampleRequests.map((request) => [requestStableCode(request), request]))
  return targets
    .filter((target) => requestStableCode(target))
    .sort((left, right) => readNumber(left.priority) - readNumber(right.priority))
    .map((target) => {
      const stableCode = requestStableCode(target)
      const request = requestByStableCode.get(stableCode) ?? {}
      return {
        ...target,
        ...request,
        stableCode,
        title: text(target.title) || text(request.title),
        businessType: text(target.businessType ?? target.business_type) || text(request.businessType ?? request.business_type),
        requiredAcceptedSampleCount: readNumber(target.requiredAcceptedSampleCount ?? target.required_accepted_sample_count)
          || readNumber(request.requiredAcceptedSampleCount ?? request.required_accepted_sample_count)
          || 1,
        readySampleCount: readNumber(target.readySampleCount ?? target.ready_sample_count),
        missingSampleCount: readNumber(target.missingSampleCount ?? target.missing_sample_count),
        invalidSampleCount: readNumber(target.invalidSampleCount ?? target.invalid_sample_count),
        nextAction: text(target.nextAction ?? target.next_action),
        sampleCollectionTargetPriority: readNumber(target.priority),
      }
    })
}


function requestStableCode(request) {
  return text(request.stableCode ?? request.stable_code ?? request.standardWorkCode ?? request.standard_work_code)
}

function reportPathFor(outputPath) {
  if (outputPath.endsWith('.json')) return outputPath.replace(/\.json$/, '.report.json')
  return `${outputPath}.report.json`
}

function collectionKitMarkdownPathFor(outputPath) {
  if (outputPath.endsWith('.json')) return outputPath.replace(/\.json$/, '.md')
  return `${outputPath}.md`
}
function markdownPathFor(outputPath) {
  if (outputPath.endsWith('.json')) return outputPath.replace(/\.json$/, '.report.md')
  return `${outputPath}.report.md`
}

function renderCollectionKitMarkdown(collectionKit) {
  const lines = [
    '# Default Master Plan Real Duration Sample Collection Kit',
    '',
    `- productionReady: ${collectionKit.productionReady}`,
    `- noWriteBoundary: ${collectionKit.noWriteBoundary}`,
    `- targetCount: ${collectionKit.summary.targetCount}`,
    `- businessTypeGroupCount: ${collectionKit.summary.businessTypeGroupCount}`,
    '- mutationBoundary: writesDurationSamples=false, writesProductionTables=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false, invokesRuntimeWriters=false, performsRollback=false',
    '',
  ]
  for (const group of collectionKit.businessTypeGroups) {
    lines.push(`## ${group.businessType}`)
    lines.push('')
    lines.push('| priority | stableCode | title | missing | invalid | candidateReferenceDays |')
    lines.push('| --- | --- | --- | ---: | ---: | ---: |')
    for (const row of group.rows) {
      lines.push(`| ${row.priority} | ${row.stableCode} | ${row.title} | ${row.missingSampleCount} | ${row.invalidSampleCount} | ${row.candidateReferenceDays} |`)
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}
function renderMarkdown(report) {
  return [
    '# Default Master Plan Real Duration Sample Material Template',
    '',
    `- status: ${report.status}`,
    `- productionReady: ${report.productionReady}`,
    `- baselineId: ${report.baselineId}`,
    `- projectId: ${report.projectId}`,
    `- templateSampleCount: ${report.summary.templateSampleCount}`,
    `- targetSource: ${report.summary.targetSource}`,
    `- targetSampleCount: ${report.summary.targetSampleCount}`,
    `- blockers: ${report.blockers.length > 0 ? report.blockers.join(', ') : 'none'}`,
    '- mutationBoundary: writesDurationSamples=false, writesTasks=false, writesTaskDependencies=false, writesRuntimePublication=false, invokesRuntimeWriters=false, performsRollback=false',
    '',
    'This file is an operator-fill template only. It is not an accepted duration sample export and does not write production data.',
    '',
  ].join('\n')
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, path.resolve(filePath)).replaceAll('\\', '/')
}

function uniqueText(values) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function readNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function readStringArray(value) {
  if (!Array.isArray(value)) return []
  return uniqueText(value)
}

function text(value) {
  return String(value ?? '').trim()
}

function printHelp() {
  console.log([
    'Usage: node project-testing/tools/build-default-master-plan-real-duration-sample-material-template.mjs',
    '  [--collection-package <duration-sample-collection-package.json>]',
    '  [--output <real-duration-sample-material.template.json>]',
    '  [--real-evidence-gap-summary <real-evidence-gap-summary.json>]',
    '  [--collection-kit-output <real-duration-sample-collection-kit.json>]',
    '  [--prepared-by <actor-id>]',
  ].join('\n'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    const options = parseArgs()
    if (options.help) {
      printHelp()
      process.exit(0)
    }
    const report = await buildDefaultMasterPlanRealDurationSampleMaterialTemplate(options)
    console.log(JSON.stringify({
      status: report.status,
      baselineId: report.baselineId,
      projectId: report.projectId,
      templateSampleCount: report.summary.templateSampleCount,
      targetSource: report.summary.targetSource,
      targetSampleCount: report.summary.targetSampleCount,
      collectionKitTargetCount: report.summary.collectionKitTargetCount,
      collectionKitBusinessTypeCount: report.summary.collectionKitBusinessTypeCount,
      collectionKitOutput: report.collectionKitRef,
      blockers: report.blockers,
      output: repoRelative(path.resolve(options.output)),
    }, null, 2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
