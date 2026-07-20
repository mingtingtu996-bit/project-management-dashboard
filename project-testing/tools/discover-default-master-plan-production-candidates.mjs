#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { readDefaultMasterPlanEnvTarget } from './default-master-plan-env-target.mjs'
import {
  defaultMasterPlanCandidateQualityBlockers,
  defaultMasterPlanMetadataSourceSignals,
  defaultMasterPlanSourceBlockers,
  supportedDefaultMasterPlanSourceLabel,
} from './default-master-plan-source-guard.mjs'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = path.resolve(path.dirname(__filename), '../..')
const DEFAULT_ENV_FILE = path.join(REPO_ROOT, 'deploy/env/staging.env')
const DEFAULT_OUTPUT = path.join(REPO_ROOT, 'project-testing/reports/default-master-plan-production-readiness/candidate-discovery.json')
const CANDIDATE_EXPORT_HYGIENE_FILE = 'candidate-export-hygiene.json'
const DEFAULT_MASTER_PLAN_MODES = new Set([
  'residential_master_plan_v2',
  'managed_frontier_default_master_plan',
])
const MANAGED_FRONTIER_SOURCE_LABEL = 'managed_frontier_default_master_plan'
const ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS = new Set([
  'business_type_base_master_plan_profile_v1',
  'business_type_master_plan_profile_v1',
])

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    envFile: DEFAULT_ENV_FILE,
    output: DEFAULT_OUTPUT,
    projectId: '',
    baselineId: '',
    candidateHygiene: '',
    environment: 'staging',
    exportedBy: '',
    limit: 20,
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

    if (arg === '--env-file') {
      options.envFile = path.resolve(nextValue())
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue())
    } else if (arg === '--project-id') {
      options.projectId = nextValue()
    } else if (arg === '--baseline-id') {
      options.baselineId = nextValue()
    } else if (arg === '--candidate-hygiene') {
      options.candidateHygiene = path.resolve(nextValue())
    } else if (arg === '--environment') {
      options.environment = nextValue()
    } else if (arg === '--exported-by') {
      options.exportedBy = nextValue()
    } else if (arg === '--limit') {
      options.limit = Math.max(1, Number(nextValue()) || 20)
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export async function discoverDefaultMasterPlanProductionCandidates({
  envFile = DEFAULT_ENV_FILE,
  output = DEFAULT_OUTPUT,
  projectId = '',
  baselineId = '',
  candidateHygiene = '',
  environment = 'staging',
  exportedBy = '',
  limit = 20,
  queryExec = null,
  now = new Date(),
} = {}) {
  const normalized = {
    envFile: path.resolve(envFile),
    output: path.resolve(output),
    projectId: text(projectId),
    baselineId: text(baselineId),
    candidateHygiene: candidateHygiene ? path.resolve(candidateHygiene) : path.join(path.dirname(path.resolve(output)), CANDIDATE_EXPORT_HYGIENE_FILE),
    environment: text(environment),
    exportedBy: text(exportedBy),
    limit: Math.max(1, Number(limit) || 20),
  }
  const target = await readDefaultMasterPlanEnvTarget(normalized.envFile, { repoRoot: REPO_ROOT })
  const candidateHygieneSummary = summarizeCandidateExportHygiene(
    await readJsonIfPresent(normalized.candidateHygiene),
    normalized.candidateHygiene,
  )

  const exec = queryExec ?? await createPgQueryExec(normalized.envFile)
  try {
    const schema = await readRelevantSchema(exec)
    const baselineRows = await readBaselineRows(exec, schema, normalized)
    const candidateReadiness = await readCandidateBaselinesFromRows(exec, schema, baselineRows)
    const candidates = candidateReadiness.candidates
    const enrichedCandidates = []
    for (const baseline of candidates.slice(0, normalized.limit)) {
      enrichedCandidates.push(await enrichCandidate(exec, schema, baseline, normalized, candidateHygieneSummary))
    }
    const blockers = [
      schema.task_baselines.exists ? null : 'task_baselines_table_missing',
      normalized.baselineId && baselineRows.length === 0 ? 'requested_baseline_not_found' : null,
      candidates.length > 0 ? null : 'candidate_default_master_plan_baseline_not_found',
      candidateReadiness.disqualifiedCandidates.length > 0 ? 'candidate_default_master_plan_candidates_disqualified' : null,
    ].filter(Boolean)
    const bestCandidate = enrichedCandidates[0] ?? null
    const report = {
      schemaVersion: 'workbuddy-default-master-plan-production-candidate-discovery/v1',
      status: blockers.length === 0 ? 'candidates_found' : 'blocked',
      generatedAt: now.toISOString(),
      source: 'discover-default-master-plan-production-candidates',
      target,
      filters: {
        projectId: normalized.projectId || null,
        baselineId: normalized.baselineId || null,
        environment: normalized.environment || null,
        exportedBy: normalized.exportedBy || null,
      },
      candidateCount: enrichedCandidates.length,
      candidates: enrichedCandidates,
      candidateHygiene: candidateHygieneSummary,
      disqualifiedCandidateCount: candidateReadiness.disqualifiedCandidates.length,
      disqualifiedCandidates: candidateReadiness.disqualifiedCandidates,
      recommendedCandidate: bestCandidate,
      blockers,
      nextAction: bestCandidate
        ? buildNextAction(bestCandidate, normalized)
        : null,
      schemaHealth: Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, {
        exists: value.exists,
        columnCount: value.columns.size,
      }])),
      mutationBoundary: {
        readsDatabase: true,
        writesProductionTables: false,
        writesTasks: false,
        writesTaskDependencies: false,
        invokesRuntimeWriters: false,
        writesRuntimePublication: false,
        performsRollback: false,
      },
    }

    await mkdir(path.dirname(normalized.output), { recursive: true })
    await writeFile(normalized.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    return report
  } finally {
    await closeQueryExec(exec)
  }
}

async function readRelevantSchema(queryExec) {
  const tables = [
    'task_baselines',
    'task_baseline_items',
    'duration_experience_samples',
    'task_dependencies',
    'projects',
    'duration_learning_runtime_publications',
    'duration_learning_runtime_consumptions',
  ]
  const entries = []
  for (const table of tables) {
    entries.push([table, await readTableColumns(queryExec, 'public', table)])
  }
  return Object.fromEntries(entries)
}

async function readJsonIfPresent(filePath) {
  if (!filePath) return {}
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
}

async function readBaselineRows(queryExec, schema, options) {
  const table = schema.task_baselines
  if (!table.exists || !table.columns.has('id') || !table.columns.has('project_id')) return []

  const where = []
  const params = []
  if (options.projectId && table.columns.has('project_id')) {
    params.push(options.projectId)
    where.push(`project_id = $${params.length}`)
  }
  if (options.baselineId && table.columns.has('id')) {
    params.push(options.baselineId)
    where.push(`id = $${params.length}`)
  }
  const orderColumn = firstExistingColumn(table.columns, ['updated_at', 'created_at'])
  const sql = [
    'SELECT * FROM public.task_baselines',
    where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    orderColumn ? `ORDER BY ${quoteIdent(orderColumn)} DESC` : '',
    'LIMIT 500',
  ].filter(Boolean).join(' ')
  const rows = await queryExec(sql, params)
  return rows
}

async function readCandidateBaselinesFromRows(queryExec, schema, rows) {
  const candidates = []
  const disqualifiedCandidates = []
  for (const row of rows) {
    const sourceGuard = candidateRowSourceGuard(row)
    const itemSourceGuard = sourceGuard.supportedLabel && sourceGuard.blockers.length === 0
      ? await candidateItemSourceGuard(queryExec, schema, row)
      : {
          blockers: [],
          labels: [],
          retiredOrLowInformationLabels: [],
          unsupportedDefaultPlanLabels: [],
    }
    const blockers = unique([...sourceGuard.blockers, ...itemSourceGuard.blockers])
    if (!sourceGuard.supportedLabel || blockers.length > 0) {
      if (sourceGuard.supportedLabel || blockers.length > 0) {
        disqualifiedCandidates.push({
          baselineId: text(row.id),
          projectId: text(row.project_id),
          status: text(row.status),
          name: text(row.name ?? row.title),
          sourceVersionLabel: sourceVersionLabel(row),
          sourceLabels: unique([...sourceGuard.labels, ...itemSourceGuard.labels]),
          reasons: blockers.length > 0 ? blockers : ['unsupported_default_master_plan_source_label'],
        })
      }
      continue
    }
    candidates.push({
      baselineId: text(row.id),
      projectId: text(row.project_id),
      status: text(row.status),
      name: text(row.name ?? row.title),
      sourceVersionLabel: sourceVersionLabel(row),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
      raw: row,
    })
  }
  return { candidates, disqualifiedCandidates }
}

async function enrichCandidate(queryExec, schema, baseline, options, candidateHygieneSummary = null) {
  const itemCount = await countBaselineItems(queryExec, schema, baseline)
  const duration = await readDurationReadiness(queryExec, schema, baseline)
  const dependencies = await readDependencyReadiness(queryExec, schema, baseline)
  const publication = await readPublicationReadiness(queryExec, schema, baseline)
  const gateStatus = {
    candidateBaselineItems: itemCount.count > 0 ? 'pass' : 'blocked',
    durationSamples: duration.acceptedCount > 0 ? 'pass' : 'blocked',
    productionDependencies: dependencies.constructionOrganizationCount > 0 ? 'pass' : 'blocked',
    runtimePublication: publication.publishedCount > 0 && publication.trustedConsumptionCount > 0 ? 'pass' : 'blocked',
  }
  const blockers = [
    gateStatus.candidateBaselineItems === 'pass' ? null : 'candidate_baseline_items_missing',
    gateStatus.durationSamples === 'pass' ? null : 'accepted_duration_experience_samples_missing',
    gateStatus.productionDependencies === 'pass' ? null : 'construction_organization_task_dependencies_missing',
    publication.publishedCount > 0 ? null : 'runtime_publication_missing',
    publication.publishedCount > 0 && publication.trustedConsumptionCount === 0
      ? 'trusted_runtime_consumption_missing'
      : null,
    ...candidateHygieneBlockersForBaseline(candidateHygieneSummary, baseline),
  ].filter(Boolean)

  const publicationKey = publication.latestPublicationKey || options.publicationKey || '<publication-key>'
  return {
    baselineId: baseline.baselineId,
    projectId: baseline.projectId,
    sourceVersionLabel: baseline.sourceVersionLabel,
    status: baseline.status,
    name: baseline.name,
    createdAt: baseline.createdAt,
    updatedAt: baseline.updatedAt,
    offlineDevelopmentQualityReview: {
      status: 'not_evaluated_by_runtime_discovery',
      requiredForRuntime: false,
      intendedUse: 'offline_development_quality_review_and_template_calibration',
    },
    evidenceReadiness: {
      gateStatus,
      blockers,
      baselineItemCount: itemCount.count,
      durationSampleCount: duration.totalCount,
      acceptedDurationSampleCount: duration.acceptedCount,
      taskDependencyCount: dependencies.totalCount,
      constructionOrganizationDependencyCount: dependencies.constructionOrganizationCount,
      runtimePublicationCount: publication.totalCount,
      runtimePublishedCount: publication.publishedCount,
      trustedRuntimeConsumptionCount: publication.trustedConsumptionCount,
      latestPublicationKey: publication.latestPublicationKey,
      candidateHygiene: candidateHygieneForBaseline(candidateHygieneSummary, baseline),
    },
    suggestedSourceExportCommand: buildSourceExportCommand({
      baselineId: baseline.baselineId,
      projectId: baseline.projectId,
      publicationKey,
      environment: options.environment,
      exportedBy: options.exportedBy || '<operator>',
    }),
  }
}

async function countBaselineItems(queryExec, schema, baseline) {
  const table = schema.task_baseline_items
  if (!table.exists) return { count: 0 }
  const baselineReferenceColumn = firstExistingColumn(table.columns, ['baseline_version_id', 'baseline_id'])
  if (!baselineReferenceColumn) return { count: 0 }
  return {
    count: await countRows(
      queryExec,
      'task_baseline_items',
      [`${quoteIdent(baselineReferenceColumn)} = $1`],
      [baseline.baselineId],
    ),
  }
}

async function candidateItemSourceGuard(queryExec, schema, baseline) {
  const table = schema.task_baseline_items
  if (!table.exists) {
    return {
      blockers: [],
      labels: [],
      retiredOrLowInformationLabels: [],
      unsupportedDefaultPlanLabels: [],
    }
  }
  const baselineReferenceColumn = firstExistingColumn(table.columns, ['baseline_version_id', 'baseline_id'])
  if (!baselineReferenceColumn || !table.columns.has('generation_metadata')) {
    return {
      blockers: [],
      labels: [],
      retiredOrLowInformationLabels: [],
      unsupportedDefaultPlanLabels: [],
    }
  }

  const rows = await queryExec(
    [
      'SELECT generation_metadata',
      'FROM public."task_baseline_items"',
      `WHERE ${quoteIdent(baselineReferenceColumn)} = $1`,
      'LIMIT 500',
    ].join(' '),
    [text(baseline.id)],
  )
  const quality = defaultMasterPlanCandidateQualityBlockers({
    rows: rows.map((row) => summarizeCandidateItemSourceRow(row)),
    sourceVersionLabel: sourceVersionLabel(baseline),
    status: '',
  })
  return quality.sourceGuard
}

async function readDurationReadiness(queryExec, schema, baseline) {
  const table = schema.duration_experience_samples
  if (!table.exists || !table.columns.has('project_id')) return { totalCount: 0, acceptedCount: 0 }
  const totalCount = await countRows(queryExec, 'duration_experience_samples', ['project_id = $1'], [baseline.projectId])
  const acceptedWhere = ['project_id = $1']
  if (table.columns.has('sample_status')) acceptedWhere.push(`sample_status IN ('active', 'accepted')`)
  if (table.columns.has('included_in_benchmark')) acceptedWhere.push('included_in_benchmark IS TRUE')
  const actualDurationColumn = firstExistingColumn(table.columns, ['actual_duration_days', 'actual_duration'])
  if (actualDurationColumn) acceptedWhere.push(`${quoteIdent(actualDurationColumn)} > 0`)
  const acceptedCount = await countRows(queryExec, 'duration_experience_samples', acceptedWhere, [baseline.projectId])
  return { totalCount, acceptedCount }
}

async function readDependencyReadiness(queryExec, schema, baseline) {
  const table = schema.task_dependencies
  if (!table.exists || !table.columns.has('project_id')) return { totalCount: 0, constructionOrganizationCount: 0 }
  const totalCount = await countRows(queryExec, 'task_dependencies', ['project_id = $1'], [baseline.projectId])
  const sourceWhere = ['project_id = $1']
  if (table.columns.has('source_type')) sourceWhere.push(`source_type = 'construction_organization_plan_network'`)
  const constructionOrganizationCount = await countRows(queryExec, 'task_dependencies', sourceWhere, [baseline.projectId])
  return { totalCount, constructionOrganizationCount }
}

async function readPublicationReadiness(queryExec, schema, baseline) {
  const publications = schema.duration_learning_runtime_publications
  const consumptions = schema.duration_learning_runtime_consumptions
  const baselineItems = schema.task_baseline_items
  const projects = schema.projects
  const requiredPublicationColumns = [
    'publication_key', 'asset_key', 'artifact_key', 'scope_level', 'company_id',
    'project_id', 'industry_key', 'publication_stage', 'monitoring_status', 'published_at',
  ]
  const requiredConsumptionColumns = [
    'consumption_key', 'publication_key', 'asset_key', 'artifact_key', 'company_id', 'project_id',
    'consumer_surface', 'task_id', 'baseline_item_id', 'consumption_context',
    'duration_day_basis', 'source_evidence_refs', 'consumed_at',
  ]
  const requiredBaselineColumns = ['id', 'project_id', 'baseline_version_id', 'source_task_id']
  const requiredProjectColumns = ['id', 'company_id']
  if (!publications.exists || requiredPublicationColumns.some((column) => !publications.columns.has(column))) {
    return { totalCount: 0, publishedCount: 0, trustedConsumptionCount: 0, latestPublicationKey: '' }
  }
  if (!baselineItems.exists || requiredBaselineColumns.some((column) => !baselineItems.columns.has(column))) {
    return { totalCount: 0, publishedCount: 0, trustedConsumptionCount: 0, latestPublicationKey: '' }
  }
  if (!projects.exists || requiredProjectColumns.some((column) => !projects.columns.has(column))) {
    return { totalCount: 0, publishedCount: 0, trustedConsumptionCount: 0, latestPublicationKey: '' }
  }
  const consumptionSchemaReady = consumptions.exists
    && requiredConsumptionColumns.every((column) => consumptions.columns.has(column))
  const industryApplicability = consumptionSchemaReady
    ? `OR (
            publication.scope_level = 'industry'
            AND EXISTS (
              SELECT 1
                FROM public.duration_learning_runtime_consumptions industry_consumption
               WHERE industry_consumption.project_id = $1
                 AND industry_consumption.company_id = project.company_id
                 AND industry_consumption.publication_key = publication.publication_key
                 AND industry_consumption.asset_key = publication.asset_key
                 AND industry_consumption.artifact_key = publication.artifact_key
                 AND publication.industry_key = industry_consumption.consumption_context ->> 'industryKey'
                 AND industry_consumption.consumption_context ->> 'authoritySource'
                       = 'runtime_resolver_publication_set'
                 AND industry_consumption.source_evidence_refs @> jsonb_build_array(
                       'duration_learning_runtime_publications:' || industry_consumption.publication_key
                     )
            )
          )`
    : ''
  const publicationRows = await queryExec(
    `SELECT publication.publication_key,
            publication.asset_key,
            publication.artifact_key,
            publication.publication_stage,
            publication.monitoring_status,
            publication.published_at
       FROM public.duration_learning_runtime_publications publication
       JOIN public.projects project
         ON project.id = $1
      WHERE publication.publication_stage IN ('canary', 'stable')
        AND publication.monitoring_status NOT IN ('failed', 'rollback_pending')
        AND (
          publication.scope_level = 'global'
          OR (publication.scope_level = 'company' AND publication.company_id = project.company_id)
          OR (
            publication.scope_level = 'project'
            AND publication.company_id = project.company_id
            AND publication.project_id = project.id
          )
          ${industryApplicability}
        )
      ORDER BY publication.published_at DESC NULLS LAST, publication.publication_key
      LIMIT 50`,
    [baseline.projectId],
  )
  const eligiblePublicationRows = publicationRows.filter((row) => runtimePublicationIdentity(row))
  const publicationKeys = unique(eligiblePublicationRows.map((row) => text(row.publication_key)))
  if (!consumptionSchemaReady) {
    return {
      totalCount: publicationKeys.length,
      publishedCount: publicationKeys.length,
      trustedConsumptionCount: 0,
      latestPublicationKey: '',
    }
  }
  const consumptionRows = await queryExec(
    `SELECT publication.publication_key,
            publication.asset_key,
            publication.artifact_key,
            publication.publication_stage,
            publication.monitoring_status,
            consumption.consumption_key,
            consumption.consumer_surface,
            consumption.source_evidence_refs,
            consumption.consumption_context,
            consumption.consumed_at
       FROM public.duration_learning_runtime_consumptions consumption
       JOIN public.duration_learning_runtime_publications publication
         ON publication.publication_key = consumption.publication_key
        AND publication.asset_key = consumption.asset_key
        AND publication.artifact_key = consumption.artifact_key
       JOIN public.task_baseline_items baseline_item
         ON (
              (consumption.consumer_surface = 'baseline_commit' AND consumption.baseline_item_id = baseline_item.id)
              OR (
                consumption.consumer_surface IN ('project_wizard_commit', 'task_list_commit')
                AND consumption.task_id = baseline_item.source_task_id
              )
            )
       JOIN public.projects project
         ON project.id = baseline_item.project_id
        AND project.company_id = consumption.company_id
      WHERE consumption.project_id = $1
        AND baseline_item.project_id = $1
        AND baseline_item.baseline_version_id = $2
        AND publication.publication_stage IN ('canary', 'stable')
        AND publication.monitoring_status NOT IN ('failed', 'rollback_pending')
        AND ((consumption.task_id IS NOT NULL)::int + (consumption.baseline_item_id IS NOT NULL)::int) = 1
        AND consumption.duration_day_basis = 'construction_production_day'
        AND consumption.consumption_context ->> 'authoritySource'
              = 'runtime_resolver_publication_set'
        AND consumption.source_evidence_refs @> jsonb_build_array(
              'duration_learning_runtime_publications:' || consumption.publication_key
            )
        AND (
          publication.scope_level = 'global'
          OR (
            publication.scope_level = 'industry'
            AND publication.industry_key = consumption.consumption_context ->> 'industryKey'
          )
          OR (publication.scope_level = 'company' AND publication.company_id = consumption.company_id)
          OR (
            publication.scope_level = 'project'
            AND publication.company_id = consumption.company_id
            AND publication.project_id = consumption.project_id
          )
        )
      ORDER BY consumption.consumed_at DESC
      LIMIT 500`,
    [baseline.projectId, baseline.baselineId],
  )
  const eligiblePublicationIdentities = new Set(
    eligiblePublicationRows.map(runtimePublicationIdentity),
  )
  const trustedConsumptionRows = consumptionRows.filter((row) => {
    const identity = runtimePublicationIdentity(row)
    const publicationKey = text(row.publication_key)
    const context = readObject(row.consumption_context)
    const evidenceRefs = arrayOfText(row.source_evidence_refs)
    return eligiblePublicationIdentities.has(identity)
      && text(context.authoritySource) === 'runtime_resolver_publication_set'
      && evidenceRefs.includes(`duration_learning_runtime_publications:${publicationKey}`)
  })
  const trustedPublicationIdentities = new Set(
    trustedConsumptionRows.map(runtimePublicationIdentity),
  )
  const latestTrustedPublication = eligiblePublicationRows.find((row) => (
    trustedPublicationIdentities.has(runtimePublicationIdentity(row))
  ))
  return {
    totalCount: publicationKeys.length,
    publishedCount: publicationKeys.length,
    trustedConsumptionCount: trustedConsumptionRows.length,
    latestPublicationKey: text(latestTrustedPublication?.publication_key),
  }
}

function runtimePublicationIdentity(row) {
  const publicationKey = text(row?.publication_key)
  const assetKey = text(row?.asset_key)
  const artifactKey = text(row?.artifact_key)
  return publicationKey && assetKey && artifactKey
    ? `${publicationKey}\u0000${assetKey}\u0000${artifactKey}`
    : ''
}

async function countRows(queryExec, tableName, where, params) {
  const rows = await queryExec(
    `SELECT count(*)::int AS count FROM public.${quoteIdent(tableName)}${where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''}`,
    params,
  )
  return Number(rows[0]?.count ?? 0)
}

async function readTableColumns(queryExec, schemaName, tableName) {
  const rows = await queryExec(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
      ORDER BY ordinal_position`,
    [schemaName, tableName],
  )
  const columns = rows.map((row) => text(row.column_name)).filter(Boolean)
  return {
    exists: columns.length > 0,
    columns: new Set(columns),
  }
}

function isDefaultMasterPlanBaseline(row) {
  return candidateRowSourceGuard(row).supportedLabel
}

function candidateRowSourceGuard(row) {
  const label = sourceVersionLabel(row)
  const metadata = readObject(row.generation_metadata ?? row.metadata)
  const sourceGuard = defaultMasterPlanSourceBlockers([
    label,
    ...defaultMasterPlanMetadataSourceSignals(metadata),
  ])
  return {
    ...sourceGuard,
    supportedLabel: DEFAULT_MASTER_PLAN_MODES.has(label) && supportedDefaultMasterPlanSourceLabel(label),
  }
}

function summarizeCandidateItemSourceRow(row) {
  const metadata = readObject(row.generation_metadata)
  const durationSuggestion = readObject(metadata.durationSuggestion ?? metadata.duration_suggestion)
  const mutationBoundary = readObject(metadata.mutationBoundary ?? metadata.mutation_boundary)
  const rawSource = text(metadata.source)
  const rawProfileSourceType = text(readObject(metadata.businessTypeMasterPlan ?? metadata.business_type_master_plan).profileSourceType ?? metadata.profileSourceType ?? metadata.profile_source_type)
  const profileSourceType = rawProfileSourceType || (ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(rawSource) ? rawSource : '')
  const source = ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(rawSource)
    ? MANAGED_FRONTIER_SOURCE_LABEL
    : rawSource
  return {
    source,
    originalSource: text(metadata.originalSource ?? metadata.original_source),
    profileSourceType,
    fallbackApplied: metadata.fallbackApplied ?? metadata.fallback_applied,
    controlledDegradation: metadata.controlledDegradation ?? metadata.controlled_degradation,
    handoffGenerationMode: text(metadata.handoffGenerationMode ?? metadata.handoff_generation_mode),
    scenarioType: text(metadata.scenarioType ?? metadata.scenario_type),
    comparisonScenario: text(metadata.comparisonScenario ?? metadata.comparison_scenario),
    durationEvidence: text(durationSuggestion.durationEvidenceSource ?? durationSuggestion.planDurationTruthSource ?? durationSuggestion.durationCalibrationSource),
    durationOutputCode: text(durationSuggestion.durationOutputCode ?? durationSuggestion.duration_output_code),
    candidateOnly: metadata.candidateOnly === true,
    smartReferenceDays: firstPositiveNumber([
      durationSuggestion.planReferenceDays,
      durationSuggestion.contextualReferenceDays,
      durationSuggestion.independentReferenceDurationDays,
      metadata.planReferenceDays,
      metadata.referenceDays,
    ]),
    writesTasks: metadata.writesTasks === true,
    writesTaskDependencies: metadata.writesTaskDependencies === true || mutationBoundary.writesTaskDependencies === true,
  }
}

function sourceVersionLabel(row) {
  const metadata = readObject(row.generation_metadata ?? row.metadata)
  return text(row.source_version_label ?? row.sourceVersionLabel ?? metadata.source_version_label ?? metadata.sourceVersionLabel ?? metadata.generation_mode ?? metadata.generationMode)
}

function buildNextAction(candidate, options) {
  const productionReadyEnvironment = isProductionReadyEnvironment(options.environment)
  return {
    description: productionReadyEnvironment
      ? 'Run source export collector, then pass its pipelineArgs to the production/live evidence pipeline.'
      : 'Run source export collector for supporting non-production evidence only; do not use this as a production-ready evidence pipeline.',
    sourceExportMode: productionReadyEnvironment ? 'production_or_live' : 'supporting_non_production',
    mayRunProductionEvidencePipeline: productionReadyEnvironment,
    sourceExportCommand: candidate.suggestedSourceExportCommand,
    blockedBy: candidate.evidenceReadiness.blockers,
    requiredExternalFiles: [
      'dependency writer result from explicit execute mode',
      'critical-path readback for the same baseline/project/publication',
      'real-environment API read smoke',
      'real-environment UI consumption smoke',
      'rollback verification for rollback:<publicationKey>',
    ],
    note: options.exportedBy
      ? productionReadyEnvironment
        ? 'exportedBy is set; command is ready except external files and real publication key if missing.'
        : 'exportedBy is set; current environment is non-production, so this can only produce supporting evidence.'
      : 'Set --exported-by to a real operator/service identity before collecting source exports.',
  }
}

function summarizeCandidateExportHygiene(payload, filePath) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).length === 0) {
    return {
      status: 'not_found',
      productionReady: false,
      artifact: repoRelative(filePath),
      baselineId: '',
      projectId: '',
      blockers: [],
      profileComparison: {},
    }
  }
  const currentCandidate = readObject(payload.currentCandidate ?? payload.current_candidate)
  return {
    status: text(payload.status) || 'unknown',
    productionReady: payload.productionReady === true || payload.production_ready === true,
    artifact: repoRelative(filePath),
    baselineId: firstText(currentCandidate.baselineId, currentCandidate.baseline_id, payload.baselineId, payload.baseline_id),
    projectId: firstText(currentCandidate.projectId, currentCandidate.project_id, payload.projectId, payload.project_id),
    blockers: arrayOfText(payload.blockers),
    profileComparison: readObject(payload.profileComparison ?? payload.profile_comparison),
  }
}

function candidateHygieneBlockersForBaseline(summary, baseline) {
  const candidateHygiene = candidateHygieneForBaseline(summary, baseline)
  return candidateHygiene.appliesToCandidate ? candidateHygiene.blockers : []
}

function candidateHygieneForBaseline(summary, baseline) {
  const status = text(summary?.status) || 'not_found'
  const blockers = arrayOfText(summary?.blockers)
  const baselineMatches = text(summary?.baselineId) && text(summary?.baselineId) === baseline.baselineId
  const projectMatches = !text(summary?.projectId) || text(summary?.projectId) === baseline.projectId
  const appliesToCandidate = Boolean(baselineMatches && projectMatches)
  return {
    status,
    productionReady: summary?.productionReady === true,
    artifact: text(summary?.artifact),
    appliesToCandidate,
    blockers: appliesToCandidate ? blockers : [],
    profileComparison: appliesToCandidate ? readObject(summary?.profileComparison) : {},
  }
}

function buildSourceExportCommand({ baselineId, projectId, publicationKey, environment, exportedBy }) {
  return [
    'node',
    'project-testing/tools/export-default-master-plan-production-sources.mjs',
    '--baseline-id', baselineId,
    '--project-id', projectId,
    '--publication-key', publicationKey,
    '--environment', environment || '<staging|production|live>',
    '--exported-by', exportedBy,
    '--writer-result', '<dependency-writer-result.json>',
    '--critical-path-readback', '<critical-path-readback.json>',
    '--api-read-smoke', '<api-read-smoke.json>',
    '--ui-consumption-smoke', '<ui-consumption-smoke.json>',
    '--rollback-verification', '<rollback-verification.json>',
  ]
}

async function createPgQueryExec(envFile) {
  const env = dotenv.parse(await readFile(envFile, 'utf8'))
  const connectionString = text(env.SUPABASE_MIGRATION_URL) || text(env.DB_CONNECTION_STRING) || text(env.DATABASE_URL)
  if (!connectionString) {
    throw new Error('SUPABASE_MIGRATION_URL, DB_CONNECTION_STRING, or DATABASE_URL is required for default master-plan candidate discovery')
  }
  const client = new pg.Client(buildDiscoveryPgClientConfig(connectionString, env))
  await client.connect()
  const exec = async (sql, params = []) => {
    const result = await client.query(sql, params)
    return result.rows
  }
  exec.close = async () => {
    await client.end()
  }
  return exec
}

export function buildDiscoveryPgClientConfig(connectionString, env = {}) {
  return {
    connectionString: stripSslModeFromConnectionString(connectionString),
    ssl: env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 12000,
    query_timeout: 12000,
    statement_timeout: 12000,
  }
}

function stripSslModeFromConnectionString(connectionString) {
  try {
    const url = new URL(connectionString)
    url.searchParams.delete('sslmode')
    return url.toString()
  } catch {
    return connectionString
  }
}

async function closeQueryExec(queryExec) {
  if (typeof queryExec?.close === 'function') await queryExec.close()
}

function firstExistingColumn(columns, candidates) {
  return candidates.find((column) => columns.has(column)) ?? ''
}

function readObject(value) {
  if (typeof value === 'string') {
    try {
      return readObject(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function text(value) {
  return String(value ?? '').trim()
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value)
    if (normalized) return normalized
  }
  return ''
}

function arrayOfText(value) {
  if (!Array.isArray(value)) return []
  return unique(value.map(text).filter(Boolean))
}

function repoRelative(filePath) {
  if (!filePath) return ''
  return path.relative(REPO_ROOT, path.resolve(filePath)).replace(/\\/g, '/')
}

function firstPositiveNumber(values) {
  for (const value of values) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
  }
  return 0
}

function unique(values) {
  return [...new Set(values)]
}

function isProductionReadyEnvironment(value) {
  return ['production', 'live'].includes(text(value).toLowerCase())
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const options = parseArgs()
  if (options.help) {
    console.log([
      'Usage: node project-testing/tools/discover-default-master-plan-production-candidates.mjs',
      '  [--project-id <id>] [--baseline-id <id>] [--environment <staging|production|live>]',
      '  [--exported-by <operator>] [--env-file <path>] [--output <json>] [--candidate-hygiene <json>] [--limit <n>]',
    ].join('\n'))
    process.exit(0)
  }
  const report = await discoverDefaultMasterPlanProductionCandidates(options)
  console.log(JSON.stringify({
    status: report.status,
    candidateCount: report.candidateCount,
    output: path.relative(REPO_ROOT, path.resolve(options.output)).replace(/\\/g, '/'),
    target: report.target,
    recommendedCandidate: report.recommendedCandidate
      ? {
          baselineId: report.recommendedCandidate.baselineId,
          projectId: report.recommendedCandidate.projectId,
          blockers: report.recommendedCandidate.evidenceReadiness.blockers,
        }
      : null,
    blockers: report.blockers,
  }, null, 2))
}
