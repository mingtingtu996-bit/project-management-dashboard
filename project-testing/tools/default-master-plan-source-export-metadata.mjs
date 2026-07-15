import {
  defaultMasterPlanStructuredSourceSignals,
  defaultMasterPlanSourceBlockers,
} from './default-master-plan-source-guard.mjs'

const REAL_ENVIRONMENTS = new Set(['staging', 'production', 'live'])

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function text(value) {
  return String(value ?? '').trim()
}

function sourceExportSourceGuardBlockers(payload) {
  const sourceGuard = defaultMasterPlanSourceBlockers(sourceExportPayloadSourceSignals(payload))
  const filteredUnsupportedLabels = sourceGuard.unsupportedDefaultPlanLabels.filter((label) => {
    return text(label) !== 'default_master_plan_staging_runtime_writer'
  })
  return [
    ...sourceGuard.blockers.filter((blocker) => blocker !== 'unsupported_default_master_plan_source_label'),
    filteredUnsupportedLabels.length > 0 ? 'unsupported_default_master_plan_source_label' : null,
  ].filter(Boolean)
}

export function readSourceExportMetadata(payload) {
  const root = readObject(payload)
  return readObject(root.export_metadata ?? root.exportMetadata ?? readObject(root.metadata).export)
}

export function sourceExportMetadataBlockers(payload, sourceName = 'source_export') {
  const metadata = readSourceExportMetadata(payload)
  const environment = text(metadata.environment ?? metadata.source_environment ?? metadata.sourceEnvironment)
  const sourceGuardBlockers = sourceExportSourceGuardBlockers(payload)
  return [
    Object.keys(metadata).length > 0 ? null : `${sourceName}_metadata_required`,
    text(metadata.exported_at ?? metadata.exportedAt) ? null : `${sourceName}_exported_at_required`,
    text(metadata.exported_by ?? metadata.exportedBy) ? null : `${sourceName}_exported_by_required`,
    REAL_ENVIRONMENTS.has(environment) ? null : `${sourceName}_real_environment_required`,
    ...sourceGuardBlockers.map((blocker) => `${sourceName}_${blocker}`),
  ].filter(Boolean)
}

function sourceExportPayloadSourceSignals(payload) {
  const root = readObject(payload)
  return [
    ...sourceExportPayloadRootSourceSignals(root),
    ...sourceExportPayloadRows(root).flatMap(sourceExportPayloadRowSourceSignals),
  ]
}

function sourceExportPayloadRootSourceSignals(root) {
  const payloadRoot = { ...readObject(root) }
  delete payloadRoot.export_metadata
  delete payloadRoot.exportMetadata
  for (const key of SOURCE_EXPORT_ROW_ARRAY_KEYS) {
    delete payloadRoot[key]
  }
  const metadata = readObject(payloadRoot.metadata)
  if (Object.keys(metadata).length > 0) {
    const payloadMetadata = { ...metadata }
    delete payloadMetadata.export
    payloadRoot.metadata = payloadMetadata
  }
  return defaultMasterPlanStructuredSourceSignals(payloadRoot)
}

function sourceExportPayloadRowSourceSignals(row) {
  const record = readObject(row)
  const sourceSignalRecord = { ...record }
  delete sourceSignalRecord.asset_kind
  delete sourceSignalRecord.assetKind
  delete sourceSignalRecord.asset_type
  delete sourceSignalRecord.assetType
  return [
    ...defaultMasterPlanStructuredSourceSignals(sourceSignalRecord),
    ...defaultMasterPlanStructuredSourceSignals({
      source: record.source,
      sourceType: record.sourceType,
      source_type: record.source_type,
      sourceVersionLabel: record.sourceVersionLabel,
      source_version_label: record.source_version_label,
      generationMode: record.generationMode,
      generation_mode: record.generation_mode,
      handoffGenerationMode: record.handoffGenerationMode,
      handoff_generation_mode: record.handoff_generation_mode,
      scenarioType: record.scenarioType,
      scenario_type: record.scenario_type,
      comparisonScenario: record.comparisonScenario,
      comparison_scenario: record.comparison_scenario,
      originalSource: record.originalSource,
      original_source: record.original_source,
      profileSourceType: record.profileSourceType,
      profile_source_type: record.profile_source_type,
      templateSource: record.templateSource,
      template_source: record.template_source,
      originSource: record.originSource,
      origin_source: record.origin_source,
      scenarioSource: record.scenarioSource,
      scenario_source: record.scenario_source,
      fallbackApplied: record.fallbackApplied,
      fallback_applied: record.fallback_applied,
      controlledDegradation: record.controlledDegradation,
      controlled_degradation: record.controlled_degradation,
      sourceMetadata: record.sourceMetadata,
      source_metadata: record.source_metadata,
      runtimeLineage: record.runtimeLineage,
      runtime_lineage: record.runtime_lineage,
      sourceLineage: record.sourceLineage,
      source_lineage: record.source_lineage,
      generationMetadata: record.generationMetadata,
      generation_metadata: record.generation_metadata,
    }),
  ]
}

const SOURCE_EXPORT_ROW_ARRAY_KEYS = [
  'rows',
  'data',
  'samples',
  'change_logs',
  'changeLogs',
  'duration_experience_samples',
  'runtime_publications',
  'runtimePublications',
  'task_dependencies',
  'taskDependencies',
  'wbs_template_runtime_publications',
  'wbsTemplateRuntimePublications',
  'candidateDefaultMasterPlanReviews',
  'candidate_default_master_plan_reviews',
]

function sourceExportPayloadRows(root) {
  return SOURCE_EXPORT_ROW_ARRAY_KEYS
    .map((key) => root[key])
    .flatMap((value) => (Array.isArray(value) ? value : []))
}
