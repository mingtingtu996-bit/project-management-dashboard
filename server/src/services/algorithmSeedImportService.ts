import { v4 as uuidv4 } from 'uuid'

import { logger } from '../middleware/logger.js'
import { supabase } from './dbService.js'
import {
  ALGORITHM_SEED_REGISTRY,
  type AlgorithmSeedRegistryEntry,
  type AlgorithmSeedType,
  getAlgorithmSeedEvidenceKeys,
  getAlgorithmSeedStableCode,
  isAlgorithmSeedPayloadActive,
} from './algorithmSeedRegistry.js'
import { clearAlgorithmSeedResolverCache } from './algorithmSeedResolver.js'
import { validateV1474AlgorithmSeeds } from './algorithmSeedValidationService.js'
import { getAlgorithmSeedGovernancePolicy } from './algorithmSeedGovernancePolicyService.js'
import { sanitizeLegacyScopeObjectFields } from './legacyScopeObjectSanitizer.js'

const ALGORITHM_SEED_RECORD_INSERT_BATCH_SIZE = 250

export type AlgorithmSeedImportSummary = {
  seedType: AlgorithmSeedType
  seedVersionId: string
  seedVersion: string
  recordCount: number
  created: boolean
}

export type AlgorithmSeedImportResult = {
  validation: ReturnType<typeof validateV1474AlgorithmSeeds>
  summaries: AlgorithmSeedImportSummary[]
}

export type AlgorithmSeedImportPreviewSummary = {
  seedType: AlgorithmSeedType
  seedVersion: string
  recordCount: number
  existingVersionId: string | null
  wouldCreateVersion: boolean
  wouldReplaceRecords: boolean
  wouldDeactivateCurrent: boolean
  impactedConsumers: string[]
  riskLevel: 'low' | 'medium' | 'high'
  stableCodeDiff: {
    added: string[]
    removed: string[]
    changed: string[]
  }
  highRiskFieldChanges: Array<{
    stableCode: string
    field: string
    reason: string
  }>
}

export type AlgorithmSeedImportPreviewResult = {
  dryRun: true
  validation: ReturnType<typeof validateV1474AlgorithmSeeds>
  summaries: AlgorithmSeedImportPreviewSummary[]
}

export type AlgorithmSeedRollbackInput = {
  seedType: AlgorithmSeedType
  fromVersionId: string
  toVersionId: string
  userId?: string | null
  reason?: string | null
}

export type AlgorithmSeedRollbackResult = {
  seedType: AlgorithmSeedType
  fromVersionId: string
  toVersionId: string
  rolledBack: boolean
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function isMissingAlgorithmSeedSchema(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  const message = String((error as Error | null | undefined)?.message ?? '').toLowerCase()
  return code === '42P01'
    || code === '42703'
    || message.includes('algorithm_seed_versions')
    || message.includes('algorithm_seed_records')
}

function buildRecordRows(seedVersionId: string, entry: AlgorithmSeedRegistryEntry) {
  return entry.records.map((payload) => {
    const sanitizedPayload = sanitizeLegacyScopeObjectFields(payload).payload
    return {
      id: uuidv4(),
      seed_version_id: seedVersionId,
      seed_type: entry.seedType,
      stable_code: getAlgorithmSeedStableCode(entry.seedType, sanitizedPayload),
      rule_payload: sanitizedPayload,
      source_standard: normalizeText(sanitizedPayload.sourceStandard) || null,
      source_version: normalizeText(sanitizedPayload.sourceVersion) || null,
      source_clause_ref: normalizeText(sanitizedPayload.sourceClauseRef) || null,
      evidence_source_keys: getAlgorithmSeedEvidenceKeys(sanitizedPayload),
      confidence: normalizeText(sanitizedPayload.confidence) || 'medium',
      web_verified: sanitizedPayload.webVerified === true,
      review_needed: sanitizedPayload.reviewNeeded === true,
      status: isAlgorithmSeedPayloadActive(entry.seedType, sanitizedPayload) ? 'active' : 'inactive',
    }
  })
}

async function insertSeedRecordBatches(records: ReturnType<typeof buildRecordRows>, seedVersionId: string) {
  for (let start = 0; start < records.length; start += ALGORITHM_SEED_RECORD_INSERT_BATCH_SIZE) {
    const batch = records.slice(start, start + ALGORITHM_SEED_RECORD_INSERT_BATCH_SIZE)
    const { error } = await supabase.from('algorithm_seed_records').insert(batch)
    if (!error) continue

    const { error: cleanupError } = await supabase
      .from('algorithm_seed_records')
      .delete()
      .eq('seed_version_id', seedVersionId)
    if (cleanupError) {
      logger.warn('[algorithmSeedImportService] failed to clean partial seed record batch import', {
        seedVersionId,
        cleanupError,
      })
    }
    throw error
  }
}

function uniqueStrings(values: readonly unknown[] | undefined) {
  if (!values) return []
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function buildPreviewStableCodeDiff(entry: AlgorithmSeedRegistryEntry) {
  const added = entry.records
    .map((payload) => getAlgorithmSeedStableCode(entry.seedType, payload))
    .filter(Boolean)
    .sort()
  return {
    added,
    removed: [] as string[],
    changed: [] as string[],
  }
}

function buildHighRiskFieldChanges(entry: AlgorithmSeedRegistryEntry) {
  const highRiskFields = [
    'defaultDaysP50',
    'durationContributionMode',
    'baseDaysEligible',
    'blockingLevel',
    'progressImpact',
    'thresholdDays',
    'warningDays',
    'criticalDays',
  ]
  return entry.records.flatMap((payload) => {
    const stableCode = getAlgorithmSeedStableCode(entry.seedType, payload)
    return highRiskFields
      .filter((field) => payload[field] != null || payload[field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)] != null)
      .map((field) => ({
        stableCode,
        field,
        reason: `dry_run_tracks_${field}_as_high_risk_runtime_field`,
      }))
  })
}

function previewRiskLevel(entry: AlgorithmSeedRegistryEntry): AlgorithmSeedImportPreviewSummary['riskLevel'] {
  const policy = getAlgorithmSeedGovernancePolicy(entry.seedType)
  if (buildHighRiskFieldChanges(entry).length > 50) return 'high'
  if (entry.records.length >= 500) return 'high'
  if (policy.candidateOnly || entry.records.length >= 100) return 'medium'
  return 'low'
}

async function previewEntry(entry: AlgorithmSeedRegistryEntry): Promise<AlgorithmSeedImportPreviewSummary> {
  const { data: existing, error: existingError } = await supabase
    .from('algorithm_seed_versions')
    .select('id')
    .eq('seed_type', entry.seedType)
    .eq('seed_version', entry.meta.seedVersion)
    .maybeSingle()

  if (existingError) throw existingError

  const existingVersionId = normalizeText((existing as any)?.id) || null
  const stableCodeDiff = buildPreviewStableCodeDiff(entry)
  const highRiskFieldChanges = buildHighRiskFieldChanges(entry)
  return {
    seedType: entry.seedType,
    seedVersion: entry.meta.seedVersion,
    recordCount: entry.records.length,
    existingVersionId,
    wouldCreateVersion: !existingVersionId,
    wouldReplaceRecords: Boolean(existingVersionId),
    wouldDeactivateCurrent: true,
    impactedConsumers: uniqueStrings(entry.meta.downstreamRuleTypes),
    riskLevel: previewRiskLevel(entry),
    stableCodeDiff,
    highRiskFieldChanges,
  }
}

async function importEntry(entry: AlgorithmSeedRegistryEntry, userId: string | null, validation: ReturnType<typeof validateV1474AlgorithmSeeds>) {
  const now = new Date().toISOString()

  const { data: existing, error: existingError } = await supabase
    .from('algorithm_seed_versions')
    .select('id')
    .eq('seed_type', entry.seedType)
    .eq('seed_version', entry.meta.seedVersion)
    .maybeSingle()

  if (existingError) throw existingError

  const seedVersionId = String((existing as any)?.id ?? uuidv4())
  const versionPatch = {
    id: seedVersionId,
    seed_type: entry.seedType,
    seed_version: entry.meta.seedVersion,
    seed_scope: entry.meta.seedScope,
    source_standards: entry.meta.sourceStandards,
    expected_counts: entry.meta.expectedCounts,
    evidence_sources: entry.meta.evidenceSources,
    validation_result: validation,
    status: 'draft',
    is_current: false,
    imported_by: userId,
    imported_at: now,
    updated_at: now,
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('algorithm_seed_versions')
      .update(versionPatch)
      .eq('id', seedVersionId)
    if (error) throw error

    const { error: deleteError } = await supabase
      .from('algorithm_seed_records')
      .delete()
      .eq('seed_version_id', seedVersionId)
    if (deleteError) throw deleteError
  } else {
    const { error } = await supabase
      .from('algorithm_seed_versions')
      .insert({ ...versionPatch, created_at: now })
    if (error) throw error
  }

  const records = buildRecordRows(seedVersionId, entry)
  if (records.length > 0) {
    await insertSeedRecordBatches(records, seedVersionId)
  }

  const { error: deactivateCurrentError } = await supabase
    .from('algorithm_seed_versions')
    .update({ is_current: false, status: 'deprecated', updated_at: now })
    .eq('seed_type', entry.seedType)
    .neq('id', seedVersionId)
    .eq('is_current', true)
  if (deactivateCurrentError) throw deactivateCurrentError

  const { error: activateError } = await supabase
    .from('algorithm_seed_versions')
    .update({
      status: 'active',
      is_current: true,
      published_by: userId,
      published_at: now,
      updated_at: now,
    })
    .eq('id', seedVersionId)
  if (activateError) throw activateError

  await supabase.from('algorithm_seed_import_logs').insert({
    id: uuidv4(),
    seed_version_id: seedVersionId,
    seed_type: entry.seedType,
    import_source: 'ts_seed',
    expected_counts_snapshot: entry.meta.expectedCounts,
    actual_counts_snapshot: { records: records.length },
    validation_result: validation,
    imported_by: userId,
    imported_at: now,
  })

  return {
    seedType: entry.seedType,
    seedVersionId,
    seedVersion: entry.meta.seedVersion,
    recordCount: records.length,
    created: !existing?.id,
  } satisfies AlgorithmSeedImportSummary
}

export async function rollbackAlgorithmSeedVersion(input: AlgorithmSeedRollbackInput): Promise<AlgorithmSeedRollbackResult> {
  const now = new Date().toISOString()
  const seedType = input.seedType
  const fromVersionId = normalizeText(input.fromVersionId)
  const toVersionId = normalizeText(input.toVersionId)
  if (!fromVersionId || !toVersionId || fromVersionId === toVersionId) {
    throw Object.assign(new Error('fromVersionId and toVersionId are required and must be different'), { code: 'INVALID_ALGORITHM_SEED_ROLLBACK_TARGET' })
  }

  const { error: deactivateError } = await supabase
    .from('algorithm_seed_versions')
    .update({
      status: 'deprecated',
      is_current: false,
      updated_at: now,
    })
    .eq('id', fromVersionId)
    .eq('seed_type', seedType)
  if (deactivateError) throw deactivateError

  const { error: activateError } = await supabase
    .from('algorithm_seed_versions')
    .update({
      status: 'active',
      is_current: true,
      published_by: input.userId ?? null,
      published_at: now,
      updated_at: now,
    })
    .eq('id', toVersionId)
    .eq('seed_type', seedType)
  if (activateError) throw activateError

  await supabase.from('algorithm_seed_import_logs').insert({
    id: uuidv4(),
    seed_version_id: toVersionId,
    seed_type: seedType,
    import_source: 'rollback',
    expected_counts_snapshot: {},
    actual_counts_snapshot: {},
    validation_result: {
      rollback: true,
      reason: normalizeText(input.reason) || 'manual_rollback',
      fromVersionId,
      toVersionId,
      rolledBackAt: now,
    },
    imported_by: input.userId ?? null,
    imported_at: now,
  })

  clearAlgorithmSeedResolverCache(seedType)
  return {
    seedType,
    fromVersionId,
    toVersionId,
    rolledBack: true,
  }
}

export async function importV1474AlgorithmSeeds(options: { strict?: boolean; seedType?: AlgorithmSeedType; userId?: string | null } = {}): Promise<AlgorithmSeedImportResult> {
  const validation = validateV1474AlgorithmSeeds({ strict: options.strict ?? true, seedType: options.seedType })
  if (!validation.ok) {
    const error = new Error('v1.4.7.4 algorithm seed validation failed')
    ;(error as any).code = 'ALGORITHM_SEED_VALIDATION_FAILED'
    ;(error as any).details = validation
    throw error
  }

  const entries = options.seedType
    ? ALGORITHM_SEED_REGISTRY.filter((entry) => entry.seedType === options.seedType)
    : ALGORITHM_SEED_REGISTRY

  try {
    const summaries: AlgorithmSeedImportSummary[] = []
    for (const entry of entries) {
      summaries.push(await importEntry(entry, options.userId ?? null, validation))
    }
    clearAlgorithmSeedResolverCache(options.seedType)
    return { validation, summaries }
  } catch (error) {
    if (isMissingAlgorithmSeedSchema(error)) {
      logger.warn('[algorithmSeedImportService] algorithm seed governance schema is missing', { error })
    }
    throw error
  }
}

export async function previewAlgorithmSeedImport(options: { strict?: boolean; seedType?: AlgorithmSeedType } = {}): Promise<AlgorithmSeedImportPreviewResult> {
  const validation = validateV1474AlgorithmSeeds({ strict: options.strict ?? true, seedType: options.seedType })
  if (!validation.ok) {
    const error = new Error('v1.4.7.4 algorithm seed validation failed')
    ;(error as any).code = 'ALGORITHM_SEED_VALIDATION_FAILED'
    ;(error as any).details = validation
    throw error
  }

  const entries = options.seedType
    ? ALGORITHM_SEED_REGISTRY.filter((entry) => entry.seedType === options.seedType)
    : ALGORITHM_SEED_REGISTRY

  try {
    const summaries: AlgorithmSeedImportPreviewSummary[] = []
    for (const entry of entries) {
      summaries.push(await previewEntry(entry))
    }
    return { dryRun: true, validation, summaries }
  } catch (error) {
    if (isMissingAlgorithmSeedSchema(error)) {
      logger.warn('[algorithmSeedImportService] algorithm seed governance schema is missing during dry-run preview', { error })
    }
    throw error
  }
}
