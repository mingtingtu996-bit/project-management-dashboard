import { beforeEach, describe, expect, it, vi } from 'vitest'

const databaseMocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  actualGetClient: null as null | (() => Promise<unknown>),
}))

vi.mock('../database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../database.js')>()
  databaseMocks.actualGetClient = actual.getClient
  return {
    ...actual,
    getClient: databaseMocks.getClient,
  }
})

import { runWithDatabaseTransactionClient } from '../database.js'
import { decideDurationAssetReviewItem } from '../services/durationAssetReviewDecisionService.js'
import {
  createDatabaseDurationAssetReviewQueueStore,
  type DurationAssetReviewItem,
} from '../services/durationAssetReviewQueueService.js'
import { promoteDurationBenchmarkRuntimeCanaryAtomically } from '../services/durationLearningAssetAtomicStoreService.js'
import {
  evaluateDurationLearningRuntimeMonitoringCandidate,
  findDurationLearningRuntimeMonitoringCandidateForReview,
  reviewRequirementForMonitoringCandidate,
  type DurationLearningRuntimeMonitoringCandidate,
} from '../services/durationLearningRuntimeLifecycleService.js'
import {
  promoteDurationLearningRuntimeCanary,
  recordDurationLearningRuntimeImpact,
  type DurationLearningRuntimeAssetKey,
  type DurationLearningRuntimeScope,
} from '../services/durationLearningRuntimePublicationService.js'
import {
  buildDurationBenchmarkCandidatePersistenceRow,
  buildDurationBenchmarkCandidates,
  type DurationExperienceSampleRow,
} from '../services/templateDurationGovernanceService.js'

const companyId = '11111111-1111-4111-8111-111111111111'
const projectId = '22222222-2222-4222-8222-222222222222'
const reviewerUserId = '33333333-3333-4333-8333-333333333333'
const reviewItemId = '44444444-4444-4444-8444-444444444444'
const benchmarkId = '55555555-5555-4555-8555-555555555555'
const observedAt = '2026-07-24T08:00:00.000Z'

function sourceAutomationDecision() {
  return {
    experienceTier: 'T3',
    factSource: 'hybrid',
    sourceAutomationEvidence: {
      structuralMutation: true,
      holdoutSampleCount: 20,
      overcompensationRate: 0,
      rollbackReady: true,
      tenantScopeValid: true,
    },
    observed: {
      conflictCount: 0,
      replayPassed: true,
      validChangeCount: 100,
      distinctTaskCount: 100,
      distinctProjectCount: 20,
      distinctCompanyCount: 5,
      realOutcomeCount: 100,
      replayCaseCount: 100,
      observationWindowDays: 90,
      holdoutSampleCount: 20,
      overcompensationRate: 0,
      replayPassRate: 1,
      outcomeAcceptanceRate: 1,
      qualityConsistencyRate: 1,
      rollbackReady: true,
      tenantScopeValid: true,
    },
  }
}

function monitoringCandidate(input: {
  assetKey: DurationLearningRuntimeAssetKey
  artifactKey: string
  publicationKey: string
  scope: DurationLearningRuntimeScope
  runtimePayload?: Record<string, unknown>
  state?: 'passed' | 'pending' | 'failed'
}): DurationLearningRuntimeMonitoringCandidate {
  const state = input.state ?? 'passed'
  return {
    publicationKey: input.publicationKey,
    assetKey: input.assetKey,
    artifactKey: input.artifactKey,
    publicationStage: 'canary',
    monitoringStatus: 'collecting',
    scope: input.scope,
    monitoringWindowHours: 72,
    monitoringElapsedHours: state === 'pending' ? 24 : 96,
    observedCount: 20,
    rejectedObservationCount: 0,
    acceptedOutcomeCount: 20,
    weakOrRejectedOutcomeCount: 0,
    accuracySampleCount: 20,
    maeBefore: 8,
    maeAfter: state === 'failed' ? 9 : 6,
    regressionRate: 0,
    runtimePayload: input.runtimePayload ?? { version: 'candidate-v1' },
    sourceCandidateRefs: [`candidate:${input.assetKey}`],
    sourceEvidenceRefs: [`evidence:${input.assetKey}`],
    sourceAutomationDecision: sourceAutomationDecision(),
  }
}

function monitoringRow(candidate: DurationLearningRuntimeMonitoringCandidate) {
  return {
    publication_key: candidate.publicationKey,
    asset_key: candidate.assetKey,
    artifact_key: candidate.artifactKey,
    publication_stage: candidate.publicationStage,
    monitoring_status: candidate.monitoringStatus,
    scope_level: candidate.scope.level,
    company_id: candidate.scope.level === 'project' || candidate.scope.level === 'company'
      ? candidate.scope.companyId
      : null,
    project_id: candidate.scope.level === 'project' ? candidate.scope.projectId : null,
    industry_key: candidate.scope.level === 'industry' ? candidate.scope.industryKey : null,
    runtime_payload: candidate.runtimePayload,
    source_candidate_refs: candidate.sourceCandidateRefs,
    source_evidence_refs: candidate.sourceEvidenceRefs,
    automation_decision: candidate.sourceAutomationDecision,
    monitoring_window_hours: candidate.monitoringWindowHours,
    monitoring_elapsed_hours: candidate.monitoringElapsedHours,
    observed_count: candidate.observedCount,
    rejected_observation_count: candidate.rejectedObservationCount,
    accepted_outcome_count: candidate.acceptedOutcomeCount,
    weak_or_rejected_outcome_count: candidate.weakOrRejectedOutcomeCount,
    accuracy_sample_count: candidate.accuracySampleCount,
    mae_before: candidate.maeBefore,
    mae_after: candidate.maeAfter,
    regression_rate: candidate.regressionRate,
    previous_publication_key: null,
    traffic_percent: 20,
    impact_metrics: null,
    published_at: '2026-07-20T00:00:00.000Z',
  }
}

function queueRow(input: {
  candidate: DurationLearningRuntimeMonitoringCandidate
  fingerprint: string
  sourceKey?: string
}) {
  const scope = input.candidate.scope
  return {
    id: reviewItemId,
    source_key: input.sourceKey ?? `review:${input.candidate.publicationKey}`,
    decision_fingerprint: input.fingerprint,
    review_kind: 'stable_promotion',
    asset_key: input.candidate.assetKey,
    artifact_key: input.candidate.artifactKey,
    scope_level: scope.level,
    company_id: scope.level === 'project' || scope.level === 'company' ? scope.companyId : null,
    project_id: scope.level === 'project' ? scope.projectId : null,
    industry_key: scope.level === 'industry' ? scope.industryKey : null,
    proposal_key: null,
    candidate_event_ref: null,
    conflict_ref: null,
    publication_key: input.candidate.publicationKey,
    resolved_publication_key: null,
    reason_codes: ['structural_mutation_requires_exception_review'],
    review_payload: {},
    status: 'open',
    assigned_to_user_id: null,
    reviewed_by_user_id: null,
    reviewed_at: null,
    decision_reason: null,
    resolution_source: null,
    created_at: '2026-07-23T00:00:00.000Z',
    updated_at: '2026-07-23T00:00:00.000Z',
  }
}

function genericHarness(input: { state?: 'passed' | 'pending' | 'failed'; stale?: boolean; failQueueUpdate?: boolean } = {}) {
  const candidate = monitoringCandidate({
    assetKey: 'dependency_rule_candidate',
    artifactKey: 'dependency:finish-to-start',
    publicationKey: 'duration-learning-runtime:dependency:1',
    scope: { level: 'company', companyId },
    state: input.state,
  })
  const evaluated = evaluateDurationLearningRuntimeMonitoringCandidate(candidate)
  const requirement = evaluated.stableDecision
    ? reviewRequirementForMonitoringCandidate(candidate, evaluated.evaluation, evaluated.stableDecision)
    : null
  const row = queueRow({
    candidate,
    fingerprint: input.stale ? 'f'.repeat(64) : requirement?.decisionFingerprint ?? 'e'.repeat(64),
  })
  const events: string[] = []
  let publicationStage = 'canary'
  let monitoringStatus = 'collecting'
  let impactMetrics: Record<string, unknown> | null = null
  let transactionSnapshot: null | {
    publicationStage: string
    monitoringStatus: string
    impactMetrics: Record<string, unknown> | null
    queueStatus: string
    resolvedPublicationKey: string | null
  } = null
  let failQueueUpdate = input.failQueueUpdate ?? false
  const client = {
    release: vi.fn(),
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized === 'begin') {
        events.push('transaction:start')
        transactionSnapshot = {
          publicationStage,
          monitoringStatus,
          impactMetrics,
          queueStatus: row.status,
          resolvedPublicationKey: row.resolved_publication_key,
        }
        return { rows: [], rowCount: 0 }
      }
      if (normalized === 'commit') {
        events.push('transaction:commit')
        transactionSnapshot = null
        return { rows: [], rowCount: 0 }
      }
      if (normalized === 'rollback') {
        events.push('transaction:rollback')
        if (transactionSnapshot) {
          publicationStage = transactionSnapshot.publicationStage
          monitoringStatus = transactionSnapshot.monitoringStatus
          impactMetrics = transactionSnapshot.impactMetrics
          row.status = transactionSnapshot.queueStatus
          row.resolved_publication_key = transactionSnapshot.resolvedPublicationKey
        }
        transactionSnapshot = null
        return { rows: [], rowCount: 0 }
      }
      if (normalized.includes('from public.duration_asset_review_items where id = $1::uuid for update')) {
        events.push('review:lock')
        return { rows: [row], rowCount: 1 }
      }
      if (normalized.includes('from public.duration_asset_review_items where source_key = $1 for update')) {
        return { rows: [row], rowCount: 1 }
      }
      if (normalized.includes('for update of publication')) {
        events.push('monitoring:lock-and-read')
        return { rows: [monitoringRow(candidate)], rowCount: 1 }
      }
      if (normalized.includes('set impact_metrics = $1::jsonb')) {
        events.push('impact:record:passed')
        impactMetrics = params[0] as Record<string, unknown>
        monitoringStatus = String(params[1])
        return { rows: [{ publication_key: candidate.publicationKey, monitoring_status: monitoringStatus }], rowCount: 1 }
      }
      if (normalized.includes('promote_duration_learning_runtime_canary')) {
        events.push('generic:promote')
        publicationStage = 'stable'
        monitoringStatus = 'passed'
        return { rows: [{ target_previous_publication_key: null }], rowCount: 1 }
      }
      if (normalized.startsWith('update public.duration_asset_review_items')) {
        events.push('review:resolve:manual_approval')
        if (failQueueUpdate) {
          failQueueUpdate = false
          throw new Error('final queue update failed')
        }
        row.status = 'resolved_by_publication'
        row.resolved_publication_key = String(params[1])
        row.reviewed_at = String(params[2])
        row.resolution_source = String(params[3])
        row.reviewed_by_user_id = String(params[4])
        row.decision_reason = String(params[5])
        return { rows: [row], rowCount: 1 }
      }
      throw new Error(`Unexpected generic approval SQL: ${normalized}`)
    }),
  }
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => (
    (await client.query(sql, params)).rows as T[]
  )
  const queueStore = createDatabaseDurationAssetReviewQueueStore(queryExec, async (work) => work())
  const decision = () => decideDurationAssetReviewItem({
    reviewItemId,
    decision: 'approve',
    decisionReason: 'validated current monitoring evidence',
    authority: {
      kind: 'company_admin',
      companyId,
      authorizedProjectIds: [],
      reviewerUserId,
    },
    queryExec,
    queueStore,
    transactionRunner: (work) => runWithDatabaseTransactionClient(client as any, work),
    findMonitoringCandidate: findDurationLearningRuntimeMonitoringCandidateForReview,
    evaluateMonitoringCandidate: evaluateDurationLearningRuntimeMonitoringCandidate,
    buildMonitoringReviewRequirement: reviewRequirementForMonitoringCandidate,
    recordImpact: recordDurationLearningRuntimeImpact,
    promoteCanary: promoteDurationLearningRuntimeCanary,
    promoteBenchmarkCanary: promoteDurationBenchmarkRuntimeCanaryAtomically,
    observedAt,
  })
  return {
    candidate,
    row,
    events,
    client,
    decision,
    state: () => ({ publicationStage, monitoringStatus, impactMetrics }),
  }
}

function benchmarkSamples(): DurationExperienceSampleRow[] {
  const confirmedAt = '2026-07-20T00:00:00.000Z'
  return Array.from({ length: 20 }, (_, index) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`,
    company_id: companyId,
    project_id: projectId,
    task_id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, '0')}`,
    completed_at: new Date(Date.UTC(2026, 6, index + 1)).toISOString(),
    created_at: new Date(Date.UTC(2026, 6, index + 1, 1)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 6, index + 1, 2)).toISOString(),
    evidence_fingerprint: `fingerprint-${index + 1}`,
    source_lineage: { schemaVersion: 'duration-experience-sample/v1', completionId: `completion-${index + 1}` },
    standard_work_code: 'SW-APPROVAL',
    wbs_node_type: 'process',
    actual_duration_production_days: 6 + (index % 3),
    duration_day_basis: 'construction_production_day',
    metadata: {
      construction_calendar_ref: 'cn-work-calendar',
      construction_calendar_version: '2026.07',
      structured_cause_snapshot: {
        confirmed_causes: index < 6 ? [{
          attribution_id: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`,
          cause_code: 'material_shortage',
          taxonomy_version: 'v1.0.0',
          event_type: 'delay',
          cause_role: 'primary',
          confirmed_at: confirmedAt,
        }] : [],
      },
    },
  }))
}

function benchmarkHarness(input: { failQueueUpdate?: boolean } = {}) {
  const samples = benchmarkSamples()
  const [benchmarkCandidate] = buildDurationBenchmarkCandidates(samples)
  const persistenceRow = {
    ...buildDurationBenchmarkCandidatePersistenceRow(benchmarkCandidate, '2026-07-21T00:00:00.000Z'),
    id: benchmarkId,
  } as Record<string, any>
  const artifactKey = String(persistenceRow.benchmark_key)
  const runtimePayload = {
    benchmarkId,
    p50Days: persistenceRow.p50_days,
    p75Days: persistenceRow.p75_days,
    p80Days: persistenceRow.p80_days,
    meanDays: persistenceRow.mean_days,
    variance: persistenceRow.variance,
    coefficientOfVariation: persistenceRow.coefficient_of_variation,
    sampleCount: persistenceRow.sample_count,
    confidenceLevel: persistenceRow.confidence_level,
    confidenceScore: persistenceRow.confidence_score,
    durationDayBasis: persistenceRow.duration_day_basis,
    generatedAt: persistenceRow.generated_at,
    sourceWindowStart: persistenceRow.source_window_start,
    sourceAsOf: persistenceRow.source_as_of,
    calendarRef: persistenceRow.metadata.calendar_ref,
    calendarVersion: persistenceRow.metadata.calendar_version,
  }
  const candidate = monitoringCandidate({
    assetKey: 'base_duration_benchmark',
    artifactKey,
    publicationKey: 'duration-learning-runtime:benchmark:manual-approval',
    scope: { level: 'project', companyId, projectId },
    runtimePayload,
  })
  const evaluated = evaluateDurationLearningRuntimeMonitoringCandidate(candidate)
  if (!evaluated.stableDecision) throw new Error('benchmark stable decision required')
  const requirement = reviewRequirementForMonitoringCandidate(candidate, evaluated.evaluation, evaluated.stableDecision)
  const row = queueRow({ candidate, fingerprint: requirement.decisionFingerprint })
  const publication = {
    ...monitoringRow(candidate),
    impact_metrics: null as Record<string, unknown> | null,
  }
  const events: string[] = []
  let benchmarkCurrent = false
  let causeSegmentsCurrent = false
  let persistedSegment: Record<string, unknown> | null = null
  let failQueueUpdate = input.failQueueUpdate ?? false
  let transactionSnapshot: null | {
    publicationStage: string
    monitoringStatus: string
    impactMetrics: Record<string, unknown> | null
    benchmarkCurrent: boolean
    causeSegmentsCurrent: boolean
    persistedSegment: Record<string, unknown> | null
    queueStatus: string
    resolvedPublicationKey: string | null
  } = null
  const client = {
    release: vi.fn(),
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized === 'begin') {
        events.push('transaction:start')
        transactionSnapshot = {
          publicationStage: publication.publication_stage,
          monitoringStatus: publication.monitoring_status ?? 'collecting',
          impactMetrics: publication.impact_metrics,
          benchmarkCurrent,
          causeSegmentsCurrent,
          persistedSegment,
          queueStatus: row.status,
          resolvedPublicationKey: row.resolved_publication_key,
        }
        return { rows: [], rowCount: 0 }
      }
      if (normalized === 'commit') {
        events.push('transaction:commit')
        transactionSnapshot = null
        return { rows: [], rowCount: 0 }
      }
      if (normalized === 'rollback') {
        events.push('transaction:rollback')
        if (transactionSnapshot) {
          publication.publication_stage = transactionSnapshot.publicationStage as 'canary'
          publication.monitoring_status = transactionSnapshot.monitoringStatus as 'collecting'
          publication.impact_metrics = transactionSnapshot.impactMetrics
          benchmarkCurrent = transactionSnapshot.benchmarkCurrent
          causeSegmentsCurrent = transactionSnapshot.causeSegmentsCurrent
          persistedSegment = transactionSnapshot.persistedSegment
          row.status = transactionSnapshot.queueStatus
          row.resolved_publication_key = transactionSnapshot.resolvedPublicationKey
        }
        transactionSnapshot = null
        return { rows: [], rowCount: 0 }
      }
      if (normalized.includes('from public.duration_asset_review_items where id = $1::uuid for update')) {
        events.push('review:lock')
        return { rows: [row], rowCount: 1 }
      }
      if (normalized.includes('from public.duration_asset_review_items where source_key = $1 for update')) {
        return { rows: [row], rowCount: 1 }
      }
      if (normalized.includes('for update of publication')) {
        events.push('monitoring:lock-and-read')
        return { rows: [monitoringRow(candidate)], rowCount: 1 }
      }
      if (normalized.includes('set impact_metrics = $1::jsonb')) {
        events.push('impact:record:passed')
        publication.impact_metrics = params[0] as Record<string, unknown>
        publication.monitoring_status = String(params[1]) as any
        return { rows: [{ publication_key: candidate.publicationKey, monitoring_status: params[1] }], rowCount: 1 }
      }
      if (normalized.includes('from public.duration_learning_runtime_publications') && normalized.includes('for update')) {
        events.push('benchmark:publication-lock')
        return { rows: [publication], rowCount: 1 }
      }
      if (normalized.includes('from public.projects')) return { rows: [{ company_id: companyId }], rowCount: 1 }
      if (normalized.includes('from public.duration_benchmarks') && normalized.includes('for update')) {
        return { rows: [{ ...persistenceRow, is_current: benchmarkCurrent, is_active: true }], rowCount: 1 }
      }
      if (normalized.includes('promote_duration_learning_runtime_canary')) {
        events.push('benchmark:promote')
        publication.publication_stage = 'stable' as any
        publication.monitoring_status = 'passed' as any
        return { rows: [{ target_previous_publication_key: null }], rowCount: 1 }
      }
      if (normalized.includes('update public.duration_benchmarks') && normalized.includes('id <>')) {
        return { rows: [], rowCount: 0 }
      }
      if (normalized.includes('update public.duration_benchmarks') && normalized.includes('runtime_publication_status')) {
        benchmarkCurrent = true
        return { rows: [{ ...persistenceRow, is_current: true }], rowCount: 1 }
      }
      if (normalized.includes('from public.duration_experience_samples sample')) {
        const rows = samples.map((sample) => {
          const cause = (sample.metadata?.structured_cause_snapshot as { confirmed_causes: Array<Record<string, any>> }).confirmed_causes[0]
          return {
            sample_id: sample.id,
            sample_task_id: sample.task_id,
            sample_completed_at: sample.completed_at,
            sample_created_at: sample.created_at,
            sample_updated_at: sample.updated_at,
            sample_evidence_fingerprint: sample.evidence_fingerprint,
            sample_source_lineage: sample.source_lineage,
            attribution_id: cause?.attribution_id ?? null,
            cause_code: cause?.cause_code ?? null,
            taxonomy_version: cause?.taxonomy_version ?? null,
            actual_duration_production_days: sample.actual_duration_production_days,
            sample_company_id: companyId,
            sample_project_id: projectId,
            attribution_company_id: cause ? companyId : null,
            attribution_project_id: cause ? projectId : null,
            attribution_status: cause ? 'confirmed' : null,
            attribution_event_type: cause?.event_type ?? null,
            cause_role: cause?.cause_role ?? null,
            attribution_subject_type: cause ? 'task' : null,
            attribution_subject_id: cause ? sample.task_id : null,
            confirmed_at: cause?.confirmed_at ?? null,
            source_type: 'task_completion',
            snapshot_attribution_id: cause?.attribution_id ?? null,
            snapshot_cause_code: cause?.cause_code ?? null,
            snapshot_taxonomy_version: cause?.taxonomy_version ?? null,
            snapshot_event_type: cause?.event_type ?? null,
            snapshot_cause_role: cause?.cause_role ?? null,
            snapshot_confirmed_at: cause?.confirmed_at ?? null,
            snapshot_primary_count: cause ? 1 : 0,
            included_in_benchmark: true,
            sample_strength: 'strong',
            duration_day_basis: 'construction_production_day',
            calendar_ref: 'cn-work-calendar',
            calendar_version: '2026.07',
          }
        })
        return { rows, rowCount: rows.length }
      }
      if (normalized.includes('update public.duration_benchmark_cause_segments')) return { rows: [], rowCount: 0 }
      if (normalized.includes('insert into public.duration_benchmark_cause_segments')) {
        causeSegmentsCurrent = true
        persistedSegment = {
          id: '66666666-6666-4666-8666-666666666666',
          benchmark_id: params[0],
          company_id: params[1],
          project_id: params[2],
          cause_code: params[3],
          taxonomy_version: params[4],
          sample_count: params[5],
          p50_days: params[6],
          p75_days: params[7],
          p80_days: params[8],
          mean_days: params[9],
          variance: params[10],
          generated_at: params[11],
          source_window_start: params[12],
          source_as_of: params[13],
          duration_day_basis: 'construction_production_day',
          calendar_ref: params[14],
          calendar_version: params[15],
          lineage: JSON.parse(String(params[16])),
        }
        return { rows: [persistedSegment], rowCount: 1 }
      }
      if (normalized.includes('cause_segments_publication_key')) {
        events.push('benchmark:activate-causes')
        return { rows: [{ id: benchmarkId }], rowCount: 1 }
      }
      if (normalized.startsWith('update public.duration_asset_review_items')) {
        events.push('review:resolve:manual_approval')
        if (failQueueUpdate) {
          failQueueUpdate = false
          throw new Error('final queue update failed')
        }
        row.status = 'resolved_by_publication'
        row.resolved_publication_key = String(params[1])
        row.reviewed_at = String(params[2])
        row.resolution_source = String(params[3])
        row.reviewed_by_user_id = String(params[4])
        row.decision_reason = String(params[5])
        return { rows: [row], rowCount: 1 }
      }
      throw new Error(`Unexpected benchmark approval SQL: ${normalized}`)
    }),
  }
  const queryExec = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> => (
    (await client.query(sql, params)).rows as T[]
  )
  const queueStore = createDatabaseDurationAssetReviewQueueStore(queryExec, async (work) => work())
  const decision = () => decideDurationAssetReviewItem({
    reviewItemId,
    decision: 'approve',
    decisionReason: 'benchmark monitoring and frozen causes validated',
    authority: {
      kind: 'company_admin',
      companyId,
      authorizedProjectIds: [projectId],
      reviewerUserId,
    },
    queryExec,
    queueStore,
    transactionRunner: (work) => runWithDatabaseTransactionClient(client as any, work),
    findMonitoringCandidate: findDurationLearningRuntimeMonitoringCandidateForReview,
    evaluateMonitoringCandidate: evaluateDurationLearningRuntimeMonitoringCandidate,
    buildMonitoringReviewRequirement: reviewRequirementForMonitoringCandidate,
    recordImpact: recordDurationLearningRuntimeImpact,
    promoteCanary: promoteDurationLearningRuntimeCanary,
    promoteBenchmarkCanary: promoteDurationBenchmarkRuntimeCanaryAtomically,
    observedAt,
  })
  return {
    decision,
    events,
    row,
    publication,
    state: () => ({ benchmarkCurrent, causeSegmentsCurrent, persistedSegment }),
  }
}

describe('duration asset stable approval with current locked evidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    databaseMocks.getClient.mockImplementation(async () => {
      if (!databaseMocks.actualGetClient) throw new Error('actual database getClient unavailable')
      return databaseMocks.actualGetClient()
    })
  })

  it('locks current evidence, records impact, promotes generically, and resolves in one commit', async () => {
    const harness = genericHarness()

    const result = await harness.decision()

    expect(result.status).toBe('resolved_by_publication')
    expect(harness.events).toEqual([
      'transaction:start',
      'review:lock',
      'monitoring:lock-and-read',
      'impact:record:passed',
      'generic:promote',
      'review:resolve:manual_approval',
      'transaction:commit',
    ])
    expect(harness.state()).toMatchObject({ publicationStage: 'stable', monitoringStatus: 'passed' })
    expect(harness.state().impactMetrics).toEqual(expect.objectContaining({
      manualApproval: expect.objectContaining({ reviewItemId, reviewerUserId }),
    }))
  })

  it('rejects a stale fingerprint with zero impact, promotion, or queue writes', async () => {
    const harness = genericHarness({ stale: true })

    await expect(harness.decision()).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_STALE',
      status: 409,
    })

    expect(harness.events).toEqual([
      'transaction:start',
      'review:lock',
      'monitoring:lock-and-read',
      'transaction:rollback',
    ])
    expect(harness.state()).toEqual({ publicationStage: 'canary', monitoringStatus: 'collecting', impactMetrics: null })
    expect(harness.row.status).toBe('open')
  })

  it.each(['pending', 'failed'] as const)('rejects %s monitoring with zero writes', async (state) => {
    const harness = genericHarness({ state })

    await expect(harness.decision()).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_NOT_PUBLICATION_READY',
      status: 409,
    })

    expect(harness.events).toEqual([
      'transaction:start',
      'review:lock',
      'monitoring:lock-and-read',
      'transaction:rollback',
    ])
    expect(harness.state().impactMetrics).toBeNull()
    expect(harness.row.status).toBe('open')
  })

  it('uses the project benchmark atomic writer and activates frozen cause segments', async () => {
    const harness = benchmarkHarness()

    await expect(harness.decision()).resolves.toMatchObject({ status: 'resolved_by_publication' })

    expect(harness.events).toEqual(expect.arrayContaining([
      'transaction:start',
      'monitoring:lock-and-read',
      'impact:record:passed',
      'benchmark:publication-lock',
      'benchmark:promote',
      'benchmark:activate-causes',
      'review:resolve:manual_approval',
      'transaction:commit',
    ]))
    expect(harness.publication).toMatchObject({ publication_stage: 'stable', monitoring_status: 'passed' })
    expect(harness.state()).toMatchObject({ benchmarkCurrent: true, causeSegmentsCurrent: true })
    expect(harness.state().persistedSegment).toEqual(expect.objectContaining({ cause_code: 'material_shortage' }))
    expect(harness.row.status).toBe('resolved_by_publication')
  })

  it('rolls back impact, promotion, cause activation, and queue resolution when the final queue update fails', async () => {
    const harness = benchmarkHarness({ failQueueUpdate: true })

    await expect(harness.decision()).rejects.toMatchObject({
      code: 'DURATION_ASSET_REVIEW_QUEUE_RESOLUTION_FAILED',
      status: 409,
      statusCode: 409,
    })

    expect(harness.events.at(-1)).toBe('transaction:rollback')
    expect(harness.publication).toMatchObject({
      publication_stage: 'canary',
      monitoring_status: 'collecting',
      impact_metrics: null,
    })
    expect(harness.state()).toEqual({ benchmarkCurrent: false, causeSegmentsCurrent: false, persistedSegment: null })
    expect(harness.row).toMatchObject({ status: 'open', resolved_publication_key: null })
  })
})
