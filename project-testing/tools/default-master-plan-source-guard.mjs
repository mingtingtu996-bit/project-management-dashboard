const SUPPORTED_DEFAULT_MASTER_PLAN_SOURCE_LABELS = new Set([
  'residential_master_plan_v2',
  'managed_frontier_default_master_plan',
])

const RETIRED_DEFAULT_MASTER_PLAN_SOURCE_LABELS = new Set([
  'legacy_template_serial_fallback',
  'legacy_fallback',
  'business_type_base_master_plan_profile_v1',
  'business_type_master_plan_profile_v1',
])

const ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS = new Set([
  'business_type_base_master_plan_profile_v1',
  'business_type_master_plan_profile_v1',
  'dependency_anchor_master_plan_profile_v1',
])

const RETIRED_OR_LOW_INFORMATION_SOURCE_PATTERNS = [
  /legacy/i,
  /fallback/i,
  /reverse[_-]?inference/i,
  /old[_-]?template/i,
  /low[_-]?information/i,
  /low[_-]?info/i,
  /template[_-]?draft/i,
  /manual[_-]?comparison/i,
  /human[_-]?comparison/i,
  /option[_-]?comparison/i,
  /plan[_-]?option[_-]?comparison/i,
  /comparison[_-]?scenario/i,
  /controlled[_-]?degradation/i,
  /fallback[_-]?applied/i,
]

export function supportedDefaultMasterPlanSourceLabel(value) {
  return SUPPORTED_DEFAULT_MASTER_PLAN_SOURCE_LABELS.has(text(value))
}

export function defaultMasterPlanLikeSourceLabel(value) {
  const label = text(value)
  return label.includes('master_plan')
    || label.includes('managed_frontier')
    || label.includes('residential_master_plan')
    || label.includes('legacy')
    || label.includes('fallback')
}

export function legacyDefaultMasterPlanSourceLabel(value) {
  return RETIRED_DEFAULT_MASTER_PLAN_SOURCE_LABELS.has(text(value))
}

export function retiredOrLowInformationDefaultMasterPlanSource(value) {
  const label = text(value)
  if (!label) return false
  if (legacyDefaultMasterPlanSourceLabel(label)) return true
  return RETIRED_OR_LOW_INFORMATION_SOURCE_PATTERNS.some((pattern) => pattern.test(label))
}

export function defaultMasterPlanSourceBlockers(values) {
  const labels = unique(values.map(text).filter(Boolean))
  const blockers = []
  const unsupportedDefaultPlanLabels = labels.filter((label) => {
    return defaultMasterPlanLikeSourceLabel(label)
      && !supportedDefaultMasterPlanSourceLabel(label)
      && !retiredOrLowInformationDefaultMasterPlanSource(label)
  })
  const retiredOrLowInformationLabels = labels.filter(retiredOrLowInformationDefaultMasterPlanSource)

  if (unsupportedDefaultPlanLabels.length > 0) {
    blockers.push('unsupported_default_master_plan_source_label')
  }
  if (retiredOrLowInformationLabels.length > 0) {
    blockers.push('retired_or_low_information_default_master_plan_source')
  }

  return {
    blockers: unique(blockers),
    labels,
    unsupportedDefaultPlanLabels: unique(unsupportedDefaultPlanLabels),
    retiredOrLowInformationLabels: unique(retiredOrLowInformationLabels),
  }
}

export function defaultMasterPlanRowSourceSignals(row = {}) {
  return [
    row?.source,
    ...defaultMasterPlanStructuredSourceSignals(row),
    ...profileLineageSourceSignals(row?.originalSource ?? row?.original_source),
    ...profileLineageSourceSignals(row?.profileSourceType ?? row?.profile_source_type),
    row?.durationEvidence,
    row?.duration_evidence,
    row?.durationOutputCode,
    row?.duration_output_code,
    row?.sourceVersionLabel,
    row?.source_version_label,
    row?.handoffGenerationMode,
    row?.handoff_generation_mode,
    row?.scenarioType,
    row?.scenario_type,
    row?.comparisonScenario,
    row?.comparison_scenario,
    defaultMasterPlanFallbackAppliedSourceSignal(row?.fallbackApplied),
    defaultMasterPlanFallbackAppliedSourceSignal(row?.fallback_applied),
    row?.controlledDegradation === true ? 'controlled_degradation' : row?.controlledDegradation,
    row?.controlled_degradation === true ? 'controlled_degradation' : row?.controlled_degradation,
  ]
}

export function defaultMasterPlanMetadataSourceSignals(metadata = {}) {
  const signals = [
    metadata.source,
    ...defaultMasterPlanStructuredSourceSignals(metadata),
    ...profileLineageSourceSignals(metadata.originalSource ?? metadata.original_source),
    metadata.generation_source,
    metadata.generationSource,
    metadata.source_version_label,
    metadata.sourceVersionLabel,
    metadata.generation_mode,
    metadata.generationMode,
    metadata.handoff_generation_mode,
    metadata.handoffGenerationMode,
    metadata.scenario_type,
    metadata.scenarioType,
    metadata.comparison_scenario,
    metadata.comparisonScenario,
    ...profileLineageSourceSignals(metadata.profileSourceType ?? metadata.profile_source_type),
  ]

  signals.push(
    defaultMasterPlanFallbackAppliedSourceSignal(metadata.fallbackApplied),
    defaultMasterPlanFallbackAppliedSourceSignal(metadata.fallback_applied),
  )
  if (metadata.controlledDegradation === true || metadata.controlled_degradation === true) {
    signals.push('controlled_degradation')
  } else {
    signals.push(metadata.controlledDegradation, metadata.controlled_degradation)
  }

  const businessTypeMasterPlan = readObject(metadata.businessTypeMasterPlan ?? metadata.business_type_master_plan)
  signals.push(
    businessTypeMasterPlan.source,
    ...profileLineageSourceSignals(businessTypeMasterPlan.originalSource ?? businessTypeMasterPlan.original_source),
    ...profileLineageSourceSignals(businessTypeMasterPlan.profileSourceType ?? businessTypeMasterPlan.profile_source_type),
  )

  const durationSuggestion = readObject(metadata.durationSuggestion ?? metadata.duration_suggestion)
  signals.push(
    durationSuggestion.durationEvidenceSource,
    durationSuggestion.duration_evidence_source,
    durationSuggestion.planDurationTruthSource,
    durationSuggestion.plan_duration_truth_source,
    durationSuggestion.durationCalibrationSource,
    durationSuggestion.duration_calibration_source,
  )

  return signals
}

export function defaultMasterPlanCandidateQualityBlockers({ rows = [], sourceVersionLabel = '', status = '' } = {}) {
  const normalizedRows = Array.isArray(rows) ? rows : []
  const rowSources = normalizedRows.flatMap(defaultMasterPlanRowSourceSignals).map(text)
  const sourceLabelGuard = defaultMasterPlanSourceBlockers([sourceVersionLabel])
  const retiredOrLowInformationLabels = unique(rowSources.filter(retiredOrLowInformationDefaultMasterPlanSource))
  const sourceGuard = {
    blockers: unique([
      ...sourceLabelGuard.blockers,
      retiredOrLowInformationLabels.length > 0 ? 'retired_or_low_information_default_master_plan_source' : null,
    ].filter(Boolean)),
    labels: unique([sourceVersionLabel, ...rowSources].map(text).filter(Boolean)),
    unsupportedDefaultPlanLabels: sourceLabelGuard.unsupportedDefaultPlanLabels,
    retiredOrLowInformationLabels,
  }
  const blockers = [
    ...sourceGuard.blockers,
    normalizedRows.length > 0 ? null : 'candidate_baseline_rows_required',
    normalizedRows.some((row) => row?.candidateOnly !== true) ? 'candidate_baseline_rows_must_be_candidate_only' : null,
    normalizedRows.some((row) => !(Number(row?.smartReferenceDays ?? row?.referenceDays ?? row?.reference_days) > 0))
      ? 'candidate_baseline_rows_missing_reference_duration'
      : null,
    normalizedRows.some((row) => row?.writesTasks === true || row?.writesTaskDependencies === true)
      ? 'candidate_baseline_rows_must_not_write_runtime'
      : null,
    text(status) === 'blocked' ? 'candidate_baseline_export_already_blocked' : null,
  ].filter(Boolean)

  return {
    blockers: unique(blockers),
    productionCandidateEligible: blockers.length === 0,
    sourceGuard,
    retiredOrLowInformationSourceRowCount: normalizedRows.filter((row) => {
      return defaultMasterPlanRowSourceSignals(row).some(retiredOrLowInformationDefaultMasterPlanSource)
    }).length,
  }
}

function unique(values) {
  return [...new Set(values)]
}

function text(value) {
  return String(value ?? '').trim()
}

function profileLineageSourceSignals(value) {
  const label = text(value)
  if (!label || ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(label)) return []
  return [label]
}

export function defaultMasterPlanStructuredSourceSignals(value, depth = 0) {
  if (depth > 4) return []
  if (typeof value === 'string') {
    const structured = readStructuredJson(value)
    if (structured !== null) return defaultMasterPlanStructuredSourceSignals(structured, depth + 1)
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number') return [item]
      return defaultMasterPlanStructuredSourceSignals(item, depth + 1)
    })
  }
  const record = readObject(value)
  return Object.entries(record).flatMap(([key, nestedValue]) => {
    const normalizedKey = key.replace(/[_-]/g, '').toLowerCase()
    if (isDurationAssetEvidenceKey(normalizedKey)) return []
    if (isRuntimeAssetIdentityKey(normalizedKey)) return []
    if (isChangeLogAuditKey(normalizedKey)) return []
    if (!isDefaultMasterPlanSourceSignalKey(normalizedKey)) return []
    if (normalizedKey === 'fallbackapplied') {
      return [
        defaultMasterPlanFallbackAppliedSourceSignal(nestedValue),
        ...defaultMasterPlanStructuredSourceSignals(nestedValue, depth + 1),
      ]
    }
    if (
      (normalizedKey === 'originalsource' || normalizedKey === 'profilesourcetype')
      && ALLOWED_PROFILE_LINEAGE_SOURCE_LABELS.has(text(nestedValue))
    ) {
      return []
    }
    if (normalizedKey === 'controlleddegradation' && nestedValue === true) return ['controlled_degradation']
    if (typeof nestedValue === 'string') {
      const nestedStructured = readStructuredJson(nestedValue)
      if (nestedStructured !== null) {
        return defaultMasterPlanStructuredSourceSignals(nestedStructured, depth + 1)
      }
      return [nestedValue]
    }
    if (typeof nestedValue === 'boolean' || typeof nestedValue === 'number') {
      return [nestedValue]
    }
    return defaultMasterPlanStructuredSourceSignals(nestedValue, depth + 1)
  })
}

function isDurationAssetEvidenceKey(normalizedKey) {
  return normalizedKey.startsWith('durationasset')
    || normalizedKey.startsWith('durationcalibration')
    || normalizedKey.startsWith('durationtruth')
    || normalizedKey.startsWith('plandurationtruth')
    || normalizedKey.startsWith('durationmaturity')
    || normalizedKey.startsWith('durationreviewgate')
    || normalizedKey.startsWith('standardworkdurationseed')
    || normalizedKey.startsWith('standardworkseed')
    || normalizedKey.startsWith('t2rhythm')
    || normalizedKey.startsWith('runtimereferencedays')
    || normalizedKey.startsWith('quantityproxy')
    || normalizedKey === 'durationselection'
}

function isChangeLogAuditKey(normalizedKey) {
  return normalizedKey === 'actiontype'
    || normalizedKey === 'fieldname'
    || normalizedKey === 'entitytype'
    || normalizedKey === 'entityid'
}

function isRuntimeAssetIdentityKey(normalizedKey) {
  return normalizedKey === 'assetkind'
    || normalizedKey === 'assettype'
    || normalizedKey === 'runtimeassetkey'
    || normalizedKey === 'runtimeassetid'
}

function isDefaultMasterPlanSourceSignalKey(normalizedKey) {
  if (
    normalizedKey.includes('path')
    || normalizedKey.includes('ref')
    || normalizedKey.includes('url')
    || normalizedKey.includes('sha')
    || normalizedKey.includes('hash')
  ) {
    return false
  }
  return normalizedKey.includes('source')
    || normalizedKey.includes('lineage')
    || normalizedKey.includes('origin')
    || normalizedKey.includes('fallback')
    || normalizedKey.includes('degradation')
    || normalizedKey.includes('scenario')
    || normalizedKey.includes('template')
    || normalizedKey.includes('marker')
    || normalizedKey.includes('flag')
    || normalizedKey.includes('tag')
    || normalizedKey.includes('label')
    || normalizedKey.includes('alias')
    || normalizedKey.includes('generationmode')
    || normalizedKey.includes('basis')
    || normalizedKey.includes('policy')
    || normalizedKey.includes('reason')
    || normalizedKey.includes('evidence')
    || normalizedKey.includes('kind')
    || normalizedKey.includes('type')
    || normalizedKey.includes('status')
    || normalizedKey.includes('review')
    || normalizedKey.includes('handoff')
    || normalizedKey.includes('proof')
}

export function defaultMasterPlanFallbackAppliedSourceSignal(value) {
  if (value === true) return 'fallback_applied'
  const label = text(value)
  if (!label || label.toLowerCase() === 'false') return ''
  if (label.toLowerCase() === 'true') return 'fallback_applied'
  if (readStructuredJson(label) !== null) return ''
  return label
}

function readStructuredJson(value) {
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return (parsed && typeof parsed === 'object') ? parsed : null
  } catch {
    return null
  }
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
