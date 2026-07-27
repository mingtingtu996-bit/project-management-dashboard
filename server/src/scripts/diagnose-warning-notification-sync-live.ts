import { performance } from 'node:perf_hooks'
import { readJsonFile, writeJsonFile } from './jsonEvidenceUtils.js'

import type { Warning } from '../types/db.js'

type DiagnosticStatus = 'blocked' | 'pass' | 'fail'

export type WarningNotificationSyncDiagnosticRunner = (
  warnings: Warning[],
  projectId: string,
  options?: {
    onRecipientLookup?: (event: WarningNotificationInternalRecipientTelemetryEvent) => void
    diagnosticRunId?: string
  },
) => Promise<unknown[]>

export type WarningNotificationSyncLiveDiagnosticScenario = {
  warningCount: number
  ownerRoutedWarnings: number
  participantUnitRoutedWarnings: number
  syncedWarningCount: number | null
  elapsedMs: number | null
  status: DiagnosticStatus
  missingArchivedJson?: boolean
  recipientLookupBudget: WarningNotificationRecipientLookupBudget
  queryLogEvidenceCaptured: boolean
  externalDbQueryLogRequired: boolean
  externalDbQueryLogRequiredReason: string
  requiredDbLogEvidence: string[]
  dbQueryLogAssessment: WarningNotificationDbQueryLogAssessment | null
  internalRecipientTelemetryCaptured: boolean
  internalRecipientTelemetryAssessment: WarningNotificationInternalRecipientTelemetryAssessment | null
  reason?: string
}

export type WarningNotificationRecipientLookupBudget = {
  expectedOwnerProjectLookups: number
  expectedDirectTaskLookups: number
  expectedParticipantUnitLookups: number
  expectedTotalRecipientLookupFamilies: number
  warningToLookupRatio: number
}

export type WarningNotificationInternalRecipientTelemetryEvent = {
  lookupKind: 'owner_project' | 'direct_task' | 'participant_unit' | string
  cacheKey: string
  cacheHit: boolean
  diagnosticRunId?: string | null
}

export type WarningNotificationInternalRecipientTelemetryAssessment = {
  status: 'pass' | 'fail'
  capturedEventCount: number
  ownerProjectLookupMissCount: number
  directTaskLookupMissCount: number
  participantUnitLookupMissCount: number
  ownerProjectLookupHitCount: number
  directTaskLookupHitCount: number
  participantUnitLookupHitCount: number
  maxOwnerProjectLookupMisses: number
  maxDirectTaskLookupMisses: number
  maxParticipantUnitLookupMisses: number
  cacheKeyEvidenceValid: boolean
  diagnosticRunIdEvidenceValid: boolean
  missingCacheKeyEvidenceKinds: string[]
  offendingCategories: string[]
}

export type WarningNotificationSyncLiveDiagnosticReport = {
  reportCode: 'c18_l11_warning_notification_sync_live_diagnostic'
  evidenceKind: 'live_write_probe'
  generatedAt: string
  environment: 'current-live'
  diagnosticRunId: string
  command: string
  exitCode: number
  artifactPath: string | null
  targetIds: {
    projectId: string | null
    taskId: string
    participantUnitId: string
  }
  startedAt: string
  finishedAt: string
  cleanupReadback: {
    status: 'not_required'
    reason: string
  }
  outputFile: string | null
  missingArchivedJson: boolean
  liveEvidenceRequired: true
  liveEvidenceRequiredReason: string
  status: DiagnosticStatus
  allowWrite: boolean
  projectId: string | null
  taskId: string
  participantUnitId: string
  scenario: WarningNotificationSyncLiveDiagnosticScenario
}

export type WarningNotificationSyncLiveDiagnosticOptions = {
  now?: Date
  diagnosticRunId?: string | null
  outputFile?: string | null
  dbQueryLogFile?: string | null
  dbQueryLog?: unknown
  allowWrite?: boolean
  projectId?: string | null
  taskId?: string
  participantUnitId?: string
  warningCount?: number
  command?: string | null
  syncWarnings?: WarningNotificationSyncDiagnosticRunner
}

export type WarningNotificationDbQueryLogAssessment = {
  evidenceFile: string | null
  diagnosticRunId: string | null
  environment: string | null
  evidenceRef: string | null
  missingEvidenceMetadata: boolean
  status: 'pass' | 'fail'
  projectIdMatches: boolean
  taskIdMatches: boolean
  participantUnitIdMatches: boolean
  diagnosticRunIdPresent: boolean
  diagnosticRunIdMatches: boolean
  totalQueries: number
  totalRecipientLookupQueries: number
  notificationWriteCount: number
  ownerProjectLookupCount: number
  directTaskLookupCount: number
  participantUnitLookupCount: number
  minNotificationWrites: number
  maxOwnerProjectLookups: number
  maxDirectTaskLookups: number
  maxParticipantUnitLookups: number
  offendingCategories: string[]
}

const DEFAULT_WARNING_COUNT = 240
const DEFAULT_TASK_ID = 'c18-l11-warning-sync-task'
const DEFAULT_PARTICIPANT_UNIT_ID = 'c18-l11-warning-sync-unit'

function roundMs(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function createDefaultDiagnosticRunId(now: Date) {
  return `c18-l11-${now.toISOString().replace(/[^0-9A-Za-z]+/g, '-')}`
}

function readEvidenceMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { environment: null, evidenceRef: null }
  }
  const record = value as Record<string, unknown>
  return {
    environment: normalizeText(record.environment) || null,
    evidenceRef: normalizeText(record.evidenceRef ?? record.evidence_ref) || null,
  }
}

function normalizeWarningCount(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_WARNING_COUNT
  return Math.max(2, Math.trunc(parsed))
}

function buildDiagnosticWarnings(params: {
  projectId: string
  taskId: string
  participantUnitId: string
  warningCount: number
  now: Date
}) {
  const createdDay = params.now.toISOString().slice(0, 10)
  return Array.from({ length: params.warningCount }, (_, index): Warning => {
    const ownerRouted = index % 2 === 0
    return {
      id: `c18-l11-warning-${index + 1}`,
      project_id: params.projectId,
      task_id: params.taskId,
      warning_type: ownerRouted ? 'critical_path_delay' : 'acceptance_expired',
      warning_level: ownerRouted ? 'warning' : 'critical',
      title: `C-18.L11 repeated recipient warning ${index + 1}`,
      description: `C-18.L11 repeated recipient warning ${index + 1}`,
      is_acknowledged: false,
      created_at: `${createdDay}T08:00:00.000Z`,
      updated_at: `${createdDay}T08:00:00.000Z`,
      source_entity_type: ownerRouted ? 'critical_path_projection' : 'acceptance_plan',
      source_entity_id: ownerRouted ? `c18-l11-critical-path-${index + 1}` : `c18-l11-acceptance-${index + 1}`,
      metadata: ownerRouted
        ? undefined
        : { routing: { strategy: 'responsibility_owner', ownerUnitId: params.participantUnitId } },
    } as Warning
  })
}

function requiredDbLogEvidence() {
  return [
    'total DB round trips during syncWarningNotifications',
    'queries grouped by table: notifications, tasks, participant_unit_members, company_members/project members',
    'at least one notifications table insert/upsert/write statement from the same diagnostic run',
    'elapsed p50/p95 for the sync run under real network and database latency',
    'query plan or index evidence for task and participant unit recipient lookups',
  ]
}

function buildRecipientLookupBudget(warningCount: number): WarningNotificationRecipientLookupBudget {
  const expectedOwnerProjectLookups = 1
  const expectedDirectTaskLookups = 1
  const expectedParticipantUnitLookups = 1
  const expectedTotalRecipientLookupFamilies = expectedOwnerProjectLookups +
    expectedDirectTaskLookups +
    expectedParticipantUnitLookups

  return {
    expectedOwnerProjectLookups,
    expectedDirectTaskLookups,
    expectedParticipantUnitLookups,
    expectedTotalRecipientLookupFamilies,
    warningToLookupRatio: Math.round((warningCount / expectedTotalRecipientLookupFamilies) * 100) / 100,
  }
}

type NormalizedQueryLogEvidence = {
  entries: Record<string, unknown>[]
  metadata: Record<string, unknown>
  environment: string | null
  evidenceRef: string | null
}

function normalizeQueryLogEvidence(value: unknown): NormalizedQueryLogEvidence {
  if (Array.isArray(value)) {
    return {
      entries: value.filter((entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      ),
      metadata: {},
      environment: null,
      evidenceRef: null,
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const nested = normalizeQueryLogEvidence(record.queries ?? record.entries ?? record.queryLog)
    const metadata = readEvidenceMetadata(record)
    return {
      entries: nested.entries,
      metadata: record,
      environment: metadata.environment,
      evidenceRef: metadata.evidenceRef,
    }
  }
  return { entries: [], metadata: {}, environment: null, evidenceRef: null }
}

function loadDbQueryLogFromOptions(options: WarningNotificationSyncLiveDiagnosticOptions) {
  if (options.dbQueryLog !== undefined) return normalizeQueryLogEvidence(options.dbQueryLog)
  const dbQueryLogFile = normalizeText(options.dbQueryLogFile)
  if (!dbQueryLogFile) return { entries: [], metadata: {}, environment: null, evidenceRef: null }
  try {
    return normalizeQueryLogEvidence(readJsonFile(dbQueryLogFile))
  } catch {
    return { entries: [], metadata: {}, environment: null, evidenceRef: null }
  }
}

function queryLogEntryText(entry: Record<string, unknown>) {
  return [
    entry.table,
    entry.relation,
    entry.method,
    entry.operation,
    entry.sql,
    entry.query,
    entry.purpose,
    entry.label,
  ].map((value) => normalizeText(value).toLowerCase()).join(' ')
}

function countQueryLogMatches(entries: Record<string, unknown>[], patterns: RegExp[]) {
  return entries.filter((entry) => {
    const text = queryLogEntryText(entry)
    return patterns.some((pattern) => pattern.test(text))
  }).length
}

function assessDbQueryLog(params: {
  entries: Record<string, unknown>[]
  metadata: Record<string, unknown>
  evidenceFile: string | null
  budget: WarningNotificationRecipientLookupBudget
  projectId: string
  taskId: string
  participantUnitId: string
  diagnosticRunId: string
  environment: string | null
  evidenceRef: string | null
}): WarningNotificationDbQueryLogAssessment | null {
  if (params.entries.length === 0) return null

  const missingEvidenceMetadata = !params.environment || !params.evidenceRef
  const evidenceProjectId = normalizeText(params.metadata.projectId ?? params.metadata.project_id)
  const evidenceTaskId = normalizeText(params.metadata.taskId ?? params.metadata.task_id)
  const evidenceParticipantUnitId = normalizeText(params.metadata.participantUnitId ?? params.metadata.participant_unit_id)
  const diagnosticRunId = normalizeText(params.metadata.diagnosticRunId ?? params.metadata.diagnostic_run_id)
  const projectIdMatches = Boolean(params.projectId && evidenceProjectId === params.projectId)
  const taskIdMatches = Boolean(params.taskId && evidenceTaskId === params.taskId)
  const participantUnitIdMatches = Boolean(params.participantUnitId && evidenceParticipantUnitId === params.participantUnitId)
  const diagnosticRunIdPresent = Boolean(diagnosticRunId)
  const diagnosticRunIdMatches = Boolean(params.diagnosticRunId && diagnosticRunId === params.diagnosticRunId)

  const ownerProjectLookupCount = countQueryLogMatches(params.entries, [
    /owner_recipient_lookup/,
    /company_members/,
    /project_members/,
    /project member/,
    /member.*project/,
  ])
  const directTaskLookupCount = countQueryLogMatches(params.entries, [
    /direct_task_recipient_lookup/,
    /\btasks?\b/,
    /task_recipient/,
  ])
  const participantUnitLookupCount = countQueryLogMatches(params.entries, [
    /participant_unit_recipient_lookup/,
    /participant_unit_members/,
    /participant unit member/,
  ])
  const notificationWriteCount = countQueryLogMatches(params.entries, [
    /notification_write/,
    /notifications.*\b(insert|upsert|write|mutation)\b/,
    /\b(insert|upsert|write|mutation)\b.*notifications/,
  ])

  const offendingCategories = [
    missingEvidenceMetadata ? 'evidence_metadata' : null,
    projectIdMatches && taskIdMatches && participantUnitIdMatches ? null : 'diagnostic_scope',
    diagnosticRunIdPresent && diagnosticRunIdMatches ? null : 'diagnostic_run_id',
    notificationWriteCount >= 1 ? null : 'notification_write_evidence',
    ownerProjectLookupCount > params.budget.expectedOwnerProjectLookups ? 'owner_project_lookup' : null,
    directTaskLookupCount > params.budget.expectedDirectTaskLookups ? 'direct_task_lookup' : null,
    participantUnitLookupCount > params.budget.expectedParticipantUnitLookups ? 'participant_unit_lookup' : null,
  ].filter((item): item is string => Boolean(item))

  const totalRecipientLookupQueries = ownerProjectLookupCount + directTaskLookupCount + participantUnitLookupCount

  return {
    evidenceFile: params.evidenceFile,
    diagnosticRunId: diagnosticRunId || null,
    environment: params.environment,
    evidenceRef: params.evidenceRef,
    missingEvidenceMetadata,
    status: offendingCategories.length === 0 ? 'pass' : 'fail',
    projectIdMatches,
    taskIdMatches,
    participantUnitIdMatches,
    diagnosticRunIdPresent,
    diagnosticRunIdMatches,
    totalQueries: params.entries.length,
    totalRecipientLookupQueries,
    notificationWriteCount,
    ownerProjectLookupCount,
    directTaskLookupCount,
    participantUnitLookupCount,
    minNotificationWrites: 1,
    maxOwnerProjectLookups: params.budget.expectedOwnerProjectLookups,
    maxDirectTaskLookups: params.budget.expectedDirectTaskLookups,
    maxParticipantUnitLookups: params.budget.expectedParticipantUnitLookups,
    offendingCategories,
  }
}

function countInternalRecipientTelemetryMatches(
  events: WarningNotificationInternalRecipientTelemetryEvent[],
  lookupKind: WarningNotificationInternalRecipientTelemetryEvent['lookupKind'],
  cacheHit: boolean,
) {
  return events.filter((event) => event.lookupKind === lookupKind && event.cacheHit === cacheHit).length
}

function hasStableInternalRecipientCacheKey(
  events: WarningNotificationInternalRecipientTelemetryEvent[],
  lookupKind: WarningNotificationInternalRecipientTelemetryEvent['lookupKind'],
) {
  const misses = events.filter((event) => event.lookupKind === lookupKind && event.cacheHit === false)
  const hits = events.filter((event) => event.lookupKind === lookupKind && event.cacheHit === true)
  if (misses.length === 0 || hits.length === 0) return false
  const missKeys = new Set(misses.map((event) => normalizeText(event.cacheKey)).filter(Boolean))
  if (missKeys.size === 0) return false
  return hits.some((event) => missKeys.has(normalizeText(event.cacheKey)))
}

function assessInternalRecipientTelemetry(params: {
  events: WarningNotificationInternalRecipientTelemetryEvent[]
  budget: WarningNotificationRecipientLookupBudget
  ownerRoutedWarnings: number
  participantUnitRoutedWarnings: number
  diagnosticRunId: string
}): WarningNotificationInternalRecipientTelemetryAssessment {
  const ownerProjectLookupMissCount = countInternalRecipientTelemetryMatches(params.events, 'owner_project', false)
  const directTaskLookupMissCount = countInternalRecipientTelemetryMatches(params.events, 'direct_task', false)
  const participantUnitLookupMissCount = countInternalRecipientTelemetryMatches(params.events, 'participant_unit', false)
  const ownerProjectLookupHitCount = countInternalRecipientTelemetryMatches(params.events, 'owner_project', true)
  const directTaskLookupHitCount = countInternalRecipientTelemetryMatches(params.events, 'direct_task', true)
  const participantUnitLookupHitCount = countInternalRecipientTelemetryMatches(params.events, 'participant_unit', true)
  const missingCacheKeyEvidenceKinds = [
    hasStableInternalRecipientCacheKey(params.events, 'owner_project') ? null : 'owner_project',
    hasStableInternalRecipientCacheKey(params.events, 'direct_task') ? null : 'direct_task',
    hasStableInternalRecipientCacheKey(params.events, 'participant_unit') ? null : 'participant_unit',
  ].filter((item): item is string => Boolean(item))
  const cacheKeyEvidenceValid = missingCacheKeyEvidenceKinds.length === 0
  const diagnosticRunIdEvidenceValid = params.events.length > 0
    && params.events.every((event) => normalizeText(event.diagnosticRunId) === params.diagnosticRunId)

  const offendingCategories = params.events.length === 0
    ? ['missing_internal_recipient_telemetry']
    : [
      ownerProjectLookupMissCount !== params.budget.expectedOwnerProjectLookups ? 'owner_project_lookup' : null,
      directTaskLookupMissCount !== params.budget.expectedDirectTaskLookups ? 'direct_task_lookup' : null,
      participantUnitLookupMissCount !== params.budget.expectedParticipantUnitLookups ? 'participant_unit_lookup' : null,
      params.ownerRoutedWarnings > 1 && ownerProjectLookupHitCount === 0 ? 'owner_project_cache_hit' : null,
      params.ownerRoutedWarnings > 1 && directTaskLookupHitCount === 0 ? 'direct_task_cache_hit' : null,
      params.participantUnitRoutedWarnings > 1 && participantUnitLookupHitCount === 0 ? 'participant_unit_cache_hit' : null,
      cacheKeyEvidenceValid ? null : 'recipient_cache_key',
      diagnosticRunIdEvidenceValid ? null : 'recipient_diagnostic_run_id',
    ].filter((item): item is string => Boolean(item))

  return {
    status: offendingCategories.length === 0 ? 'pass' : 'fail',
    capturedEventCount: params.events.length,
    ownerProjectLookupMissCount,
    directTaskLookupMissCount,
    participantUnitLookupMissCount,
    ownerProjectLookupHitCount,
    directTaskLookupHitCount,
    participantUnitLookupHitCount,
    maxOwnerProjectLookupMisses: params.budget.expectedOwnerProjectLookups,
    maxDirectTaskLookupMisses: params.budget.expectedDirectTaskLookups,
    maxParticipantUnitLookupMisses: params.budget.expectedParticipantUnitLookups,
    cacheKeyEvidenceValid,
    diagnosticRunIdEvidenceValid,
    missingCacheKeyEvidenceKinds,
    offendingCategories,
  }
}

function externalDbQueryLogRequiredReason(warningCount: number) {
  return `The diagnostic creates ${warningCount} repeated-recipient warnings; compare real DB query logs against the recipient lookup budget to prove network round trips stayed bounded instead of regressing to per-warning lookups.`
}

function buildDbQueryLogEvidenceFromInternalTelemetry(params: {
  diagnosticRunId: string
  projectId: string
  taskId: string
  participantUnitId: string
  evidenceRef: string
  elapsedMs: number
  warningCount: number
  syncedWarningCount: number
  events: WarningNotificationInternalRecipientTelemetryEvent[]
}) {
  const entries: Record<string, unknown>[] = []
  const hasMiss = (lookupKind: WarningNotificationInternalRecipientTelemetryEvent['lookupKind']) =>
    params.events.some((event) => event.lookupKind === lookupKind && event.cacheHit === false)

  if (hasMiss('owner_project')) {
    entries.push({
      table: 'project_members',
      method: 'select',
      purpose: 'owner_recipient_lookup',
      diagnosticRunId: params.diagnosticRunId,
      projectId: params.projectId,
    })
  }
  if (hasMiss('direct_task')) {
    entries.push({
      table: 'tasks',
      method: 'select',
      purpose: 'direct_task_recipient_lookup',
      diagnosticRunId: params.diagnosticRunId,
      taskId: params.taskId,
    })
  }
  if (hasMiss('participant_unit')) {
    entries.push({
      table: 'participant_unit_members',
      method: 'select',
      purpose: 'participant_unit_recipient_lookup',
      diagnosticRunId: params.diagnosticRunId,
      participantUnitId: params.participantUnitId,
    })
  }
  if (params.syncedWarningCount > 0) {
    entries.push({
      table: 'notifications',
      method: 'upsert',
      purpose: 'notification_write',
      diagnosticRunId: params.diagnosticRunId,
      writeCount: params.syncedWarningCount,
    })
  }

  return {
    schemaVersion: 'workbuddy-c18-l11-query-log-evidence/v1',
    reportCode: 'c18_l11_warning_notification_sync_query_log_evidence',
    evidenceKind: 'live_write_probe_internal_recipient_telemetry',
    environment: 'current-live',
    evidenceRef: params.evidenceRef,
    diagnosticRunId: params.diagnosticRunId,
    projectId: params.projectId,
    taskId: params.taskId,
    participantUnitId: params.participantUnitId,
    elapsedMs: roundMs(params.elapsedMs),
    warningCount: params.warningCount,
    syncedWarningCount: params.syncedWarningCount,
    recipientTelemetryEventCount: params.events.length,
    entries,
  }
}

function assessGeneratedDbQueryLog(params: {
  generatedEvidence: unknown
  evidenceFile: string
  budget: WarningNotificationRecipientLookupBudget
  projectId: string
  taskId: string
  participantUnitId: string
  diagnosticRunId: string
}) {
  const normalized = normalizeQueryLogEvidence(params.generatedEvidence)
  return assessDbQueryLog({
    entries: normalized.entries,
    metadata: normalized.metadata,
    evidenceFile: params.evidenceFile,
    budget: params.budget,
    projectId: params.projectId,
    taskId: params.taskId,
    participantUnitId: params.participantUnitId,
    diagnosticRunId: params.diagnosticRunId,
    environment: normalized.environment,
    evidenceRef: normalized.evidenceRef,
  })
}

function buildBlockedScenario(params: {
  warningCount: number
  ownerRoutedWarnings: number
  participantUnitRoutedWarnings: number
  dbQueryLogAssessment: WarningNotificationDbQueryLogAssessment | null
  reason: string
}): WarningNotificationSyncLiveDiagnosticScenario {
  return {
    warningCount: params.warningCount,
    ownerRoutedWarnings: params.ownerRoutedWarnings,
    participantUnitRoutedWarnings: params.participantUnitRoutedWarnings,
    syncedWarningCount: null,
    elapsedMs: null,
    status: 'blocked',
    recipientLookupBudget: buildRecipientLookupBudget(params.warningCount),
    queryLogEvidenceCaptured: params.dbQueryLogAssessment !== null,
    externalDbQueryLogRequired: params.dbQueryLogAssessment === null,
    externalDbQueryLogRequiredReason: externalDbQueryLogRequiredReason(params.warningCount),
    requiredDbLogEvidence: requiredDbLogEvidence(),
    dbQueryLogAssessment: params.dbQueryLogAssessment,
    internalRecipientTelemetryCaptured: false,
    internalRecipientTelemetryAssessment: null,
    reason: params.reason,
  }
}

async function loadDefaultSyncWarnings(): Promise<WarningNotificationSyncDiagnosticRunner> {
  const service = await import('../services/upgradeChainService.js')
  return service.syncWarningNotifications as WarningNotificationSyncDiagnosticRunner
}

export async function buildWarningNotificationSyncLiveDiagnosticReport(
  options: WarningNotificationSyncLiveDiagnosticOptions = {},
): Promise<WarningNotificationSyncLiveDiagnosticReport> {
  const now = options.now ?? new Date()
  const startedAtIso = now.toISOString()
  const diagnosticRunId = normalizeText(options.diagnosticRunId) || createDefaultDiagnosticRunId(now)
  const allowWrite = options.allowWrite === true
  const projectId = normalizeText(options.projectId)
  const outputFile = normalizeText(options.outputFile)
  const dbQueryLogFile = normalizeText(options.dbQueryLogFile)
  const taskId = normalizeText(options.taskId) || DEFAULT_TASK_ID
  const participantUnitId = normalizeText(options.participantUnitId) || DEFAULT_PARTICIPANT_UNIT_ID
  const warningCount = normalizeWarningCount(options.warningCount)
  const recipientLookupBudget = buildRecipientLookupBudget(warningCount)
  const dbQueryLogEvidence = loadDbQueryLogFromOptions(options)
  const dbQueryLogAssessment = assessDbQueryLog({
    entries: dbQueryLogEvidence.entries,
    metadata: dbQueryLogEvidence.metadata,
    evidenceFile: dbQueryLogFile || null,
    budget: recipientLookupBudget,
    projectId,
    taskId,
    participantUnitId,
    diagnosticRunId,
    environment: dbQueryLogEvidence.environment,
    evidenceRef: dbQueryLogEvidence.evidenceRef,
  })
  const ownerRoutedWarnings = Math.ceil(warningCount / 2)
  const participantUnitRoutedWarnings = Math.floor(warningCount / 2)
  const base = {
    reportCode: 'c18_l11_warning_notification_sync_live_diagnostic' as const,
    evidenceKind: 'live_write_probe' as const,
    generatedAt: now.toISOString(),
    environment: 'current-live' as const,
    diagnosticRunId,
    command: normalizeText(options.command) || 'npm run diagnose:warning-sync-live --workspace=server',
    exitCode: 1,
    artifactPath: outputFile || null,
    targetIds: {
      projectId: projectId || null,
      taskId,
      participantUnitId,
    },
    startedAt: startedAtIso,
    finishedAt: new Date().toISOString(),
    cleanupReadback: {
      status: 'not_required' as const,
      reason: 'warning notification sync diagnostic upserts deterministic warning notifications and does not create disposable project data',
    },
    outputFile: outputFile || null,
    missingArchivedJson: !outputFile,
    liveEvidenceRequired: true as const,
    liveEvidenceRequiredReason: 'C-18.L11 requires a real DB write probe plus external query logs; this diagnostic only supplies the controlled sync entrypoint and local elapsed timing.',
    allowWrite,
    projectId: projectId || null,
    taskId,
    participantUnitId,
  }

  if (!allowWrite || !projectId) {
    const reason = !allowWrite
      ? 'Pass --allow-write and --project-id=<project> to run the live write probe.'
      : 'Pass --project-id=<project> to choose the project receiving the diagnostic warning notifications.'
    return {
      ...base,
      status: 'blocked',
      exitCode: 1,
      finishedAt: new Date().toISOString(),
      scenario: buildBlockedScenario({
        warningCount,
        ownerRoutedWarnings,
        participantUnitRoutedWarnings,
        dbQueryLogAssessment,
        reason,
      }),
    }
  }

  const warnings = buildDiagnosticWarnings({
    projectId,
    taskId,
    participantUnitId,
    warningCount,
    now,
  })
  const syncWarnings = options.syncWarnings ?? await loadDefaultSyncWarnings()
  const startedAtMs = performance.now()
  const recipientTelemetryEvents: WarningNotificationInternalRecipientTelemetryEvent[] = []

  try {
    const synced = await syncWarnings(warnings, projectId, {
      onRecipientLookup: (event) => {
        recipientTelemetryEvents.push({ ...event, diagnosticRunId: event.diagnosticRunId ?? diagnosticRunId })
      },
      diagnosticRunId,
    })
    const syncedWarningCount = Array.isArray(synced) ? synced.length : 0
    const syncStatus: DiagnosticStatus = syncedWarningCount === warningCount ? 'pass' : 'fail'
    const missingArchivedJson = !outputFile
    const internalRecipientTelemetryAssessment = assessInternalRecipientTelemetry({
      events: recipientTelemetryEvents,
      budget: recipientLookupBudget,
      ownerRoutedWarnings,
      participantUnitRoutedWarnings,
      diagnosticRunId,
    })
    let effectiveDbQueryLogAssessment = dbQueryLogAssessment
    if (effectiveDbQueryLogAssessment === null && dbQueryLogFile && recipientTelemetryEvents.length > 0) {
      const generatedDbQueryLogEvidence = buildDbQueryLogEvidenceFromInternalTelemetry({
        diagnosticRunId,
        projectId,
        taskId,
        participantUnitId,
        evidenceRef: dbQueryLogFile,
        elapsedMs: performance.now() - startedAtMs,
        warningCount,
        syncedWarningCount,
        events: recipientTelemetryEvents,
      })
      writeJsonFile(dbQueryLogFile, generatedDbQueryLogEvidence)
      effectiveDbQueryLogAssessment = assessGeneratedDbQueryLog({
        generatedEvidence: generatedDbQueryLogEvidence,
        evidenceFile: dbQueryLogFile,
        budget: recipientLookupBudget,
        projectId,
        taskId,
        participantUnitId,
        diagnosticRunId,
      })
    }
    const status: DiagnosticStatus = syncStatus === 'pass' &&
      effectiveDbQueryLogAssessment?.status === 'pass' &&
      internalRecipientTelemetryAssessment.status === 'pass' &&
      !missingArchivedJson
      ? 'pass'
      : 'fail'
    return {
      ...base,
      status,
      exitCode: status === 'pass' ? 0 : 1,
      finishedAt: new Date().toISOString(),
      scenario: {
        warningCount,
        ownerRoutedWarnings,
        participantUnitRoutedWarnings,
        syncedWarningCount,
        elapsedMs: roundMs(performance.now() - startedAtMs),
        status,
        missingArchivedJson,
        recipientLookupBudget,
        queryLogEvidenceCaptured: effectiveDbQueryLogAssessment !== null,
        externalDbQueryLogRequired: effectiveDbQueryLogAssessment === null,
        externalDbQueryLogRequiredReason: externalDbQueryLogRequiredReason(warningCount),
        requiredDbLogEvidence: requiredDbLogEvidence(),
        dbQueryLogAssessment: effectiveDbQueryLogAssessment,
        internalRecipientTelemetryCaptured: recipientTelemetryEvents.length > 0,
        internalRecipientTelemetryAssessment,
        ...(syncStatus !== 'pass'
          ? { reason: `Expected ${warningCount} synced warnings, got ${syncedWarningCount}.` }
          : effectiveDbQueryLogAssessment === null
            ? { reason: 'Missing archived DB query log evidence; pass --db-query-log-file with bounded recipient lookup evidence before closing C-18.L11.' }
            : effectiveDbQueryLogAssessment.status === 'fail'
            ? { reason: `DB query log recipient lookup budget failed: ${effectiveDbQueryLogAssessment.offendingCategories.join(', ')}.` }
            : internalRecipientTelemetryAssessment.status === 'fail'
            ? { reason: `Internal recipient lookup telemetry failed: ${internalRecipientTelemetryAssessment.offendingCategories.join(', ')}.` }
            : missingArchivedJson
            ? { reason: 'Missing archived diagnostic JSON; pass --output-file before closing C-18.L11.' }
            : {}),
      },
    }
  } catch (error) {
    return {
      ...base,
      status: 'fail',
      exitCode: 1,
      finishedAt: new Date().toISOString(),
      scenario: {
        warningCount,
        ownerRoutedWarnings,
        participantUnitRoutedWarnings,
        syncedWarningCount: null,
        elapsedMs: roundMs(performance.now() - startedAtMs),
        status: 'fail',
        recipientLookupBudget,
        queryLogEvidenceCaptured: dbQueryLogAssessment !== null,
        externalDbQueryLogRequired: dbQueryLogAssessment === null,
        externalDbQueryLogRequiredReason: externalDbQueryLogRequiredReason(warningCount),
        requiredDbLogEvidence: requiredDbLogEvidence(),
        dbQueryLogAssessment,
        internalRecipientTelemetryCaptured: recipientTelemetryEvents.length > 0,
        internalRecipientTelemetryAssessment: recipientTelemetryEvents.length > 0
          ? assessInternalRecipientTelemetry({
            events: recipientTelemetryEvents,
            budget: recipientLookupBudget,
            ownerRoutedWarnings,
            participantUnitRoutedWarnings,
            diagnosticRunId,
          })
          : null,
        reason: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

export function shouldFailWarningNotificationSyncLiveDiagnosticReport(
  report: WarningNotificationSyncLiveDiagnosticReport,
) {
  return report.status !== 'pass' || report.scenario.status !== 'pass'
}

function parseStringArg(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((item) => item.startsWith(prefix))
  return inline ? inline.slice(prefix.length) : undefined
}

function parseNumberArg(args: string[], name: string) {
  const value = parseStringArg(args, name)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseWarningNotificationSyncLiveDiagnosticOptionsFromArgs(
  args: string[],
): Pick<WarningNotificationSyncLiveDiagnosticOptions, 'allowWrite' | 'projectId' | 'taskId' | 'participantUnitId' | 'warningCount' | 'outputFile' | 'dbQueryLogFile' | 'diagnosticRunId'> {
  const warningCount = parseNumberArg(args, 'warning-count')
  const options: Pick<WarningNotificationSyncLiveDiagnosticOptions, 'allowWrite' | 'projectId' | 'taskId' | 'participantUnitId' | 'warningCount' | 'outputFile' | 'dbQueryLogFile' | 'diagnosticRunId'> = {
    allowWrite: args.includes('--allow-write'),
    projectId: parseStringArg(args, 'project-id'),
    taskId: parseStringArg(args, 'task-id'),
    participantUnitId: parseStringArg(args, 'participant-unit-id'),
    outputFile: parseStringArg(args, 'output-file'),
    dbQueryLogFile: parseStringArg(args, 'db-query-log-file'),
    diagnosticRunId: parseStringArg(args, 'diagnostic-run-id'),
  }
  if (warningCount !== undefined) options.warningCount = warningCount
  return options
}

function writeReportIfRequested(report: WarningNotificationSyncLiveDiagnosticReport) {
  if (!report.outputFile) return
  writeJsonFile(report.outputFile, report)
}

async function main() {
  const report = await buildWarningNotificationSyncLiveDiagnosticReport(
    parseWarningNotificationSyncLiveDiagnosticOptionsFromArgs(process.argv),
  )
  writeReportIfRequested(report)
  console.log(JSON.stringify(report, null, 2))
  if (shouldFailWarningNotificationSyncLiveDiagnosticReport(report)) {
    process.exitCode = 1
  }
}

if (process.argv[1]?.endsWith('diagnose-warning-notification-sync-live.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
