export const CANONICAL_RUNTIME_PUBLICATION_SOURCE = 'duration_learning_runtime_publications'
export const CANONICAL_RUNTIME_CONSUMPTION_SOURCE = 'duration_learning_runtime_consumptions'
export const CANONICAL_RUNTIME_PUBLICATION_TABLE = 'public.duration_learning_runtime_publications'
export const CANONICAL_RUNTIME_CONSUMPTION_TABLE = 'public.duration_learning_runtime_consumptions'
export const CANONICAL_RUNTIME_PUBLICATION_REF_PREFIX = 'duration_learning_runtime_publications_export'
export const CANONICAL_RUNTIME_CONSUMPTION_REF_PREFIX = 'duration_learning_runtime_consumptions_export'

export const DURATION_LEARNING_ASSET_KEYS = new Set([
  'base_duration_benchmark',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
])

export const CONSUMABLE_PUBLICATION_STAGES = new Set(['canary', 'stable'])
export const CONSUMABLE_MONITORING_STATUSES = new Set(['pending', 'collecting', 'passed'])
export const TRUSTED_COMMIT_CONSUMER_SURFACES = new Set([
  'project_wizard_commit',
  'task_list_commit',
  'baseline_commit',
])

export const LEGACY_RUNTIME_SOURCE_ROW_ARRAY_KEYS = [
  'wbs_template_runtime_publications',
  'wbsTemplateRuntimePublications',
  'duration_learning_legacy_default_master_plan_mappings',
  'durationLearningLegacyDefaultMasterPlanMappings',
  'duration_learning_legacy_runtime_row_archive',
  'durationLearningLegacyRuntimeRowArchive',
]

const CANONICAL_ROW_KEYS = {
  publication: [
    'duration_learning_runtime_publications',
    'durationLearningRuntimePublications',
  ],
  consumption: [
    'duration_learning_runtime_consumptions',
    'durationLearningRuntimeConsumptions',
  ],
}

export function readRuntimeSourceRows(payload, kind) {
  const root = readObject(payload)
  const expectedSource = kind === 'publication'
    ? CANONICAL_RUNTIME_PUBLICATION_SOURCE
    : CANONICAL_RUNTIME_CONSUMPTION_SOURCE
  if (runtimeSourceName(root) !== expectedSource) return []
  for (const key of CANONICAL_ROW_KEYS[kind] ?? []) {
    if (Array.isArray(root[key])) return root[key]
  }
  if (Array.isArray(root.rows)) return root.rows
  if (Array.isArray(root.data)) return root.data
  return []
}

export function runtimeSourceName(payload) {
  const root = readObject(payload)
  const metadata = readObject(root.export_metadata ?? root.exportMetadata ?? readObject(root.metadata).export)
  return text(metadata.source ?? metadata.source_name ?? metadata.sourceName)
}

export function hasLegacyRuntimeSource(payload) {
  const root = readObject(payload)
  const source = runtimeSourceName(root)
  if (source === 'wbs_template_runtime_publications'
    || source === 'duration_learning_legacy_default_master_plan_mappings'
    || source === 'duration_learning_legacy_runtime_row_archive') {
    return true
  }
  return LEGACY_RUNTIME_SOURCE_ROW_ARRAY_KEYS.some((key) => Array.isArray(root[key]) && root[key].length > 0)
}

export function buildRuntimeSourceRef(kind, sourcePath, sha256) {
  const prefix = kind === 'publication'
    ? CANONICAL_RUNTIME_PUBLICATION_REF_PREFIX
    : CANONICAL_RUNTIME_CONSUMPTION_REF_PREFIX
  return `${prefix}:${sourcePath}#sha256=${sha256}`
}

export function isCanonicalRuntimeSourceRef(kind, value) {
  const prefix = kind === 'publication'
    ? CANONICAL_RUNTIME_PUBLICATION_REF_PREFIX
    : CANONICAL_RUNTIME_CONSUMPTION_REF_PREFIX
  return new RegExp(`^${prefix}:.+#sha256=[a-f0-9]{64}$`, 'i').test(text(value))
}

export function readJsonObject(value) {
  if (typeof value === 'string') {
    try {
      return readJsonObject(JSON.parse(value))
    } catch {
      return {}
    }
  }
  return readObject(value)
}

export function readStringArray(value) {
  if (typeof value === 'string') {
    try {
      return readStringArray(JSON.parse(value))
    } catch {
      return []
    }
  }
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

export function text(value) {
  return String(value ?? '').trim()
}

function readObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
