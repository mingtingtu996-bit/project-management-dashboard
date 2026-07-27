import { apiGet, apiPost } from '@/lib/apiClient'
import { executeRuleAssetGovernanceWorkbenchOperation } from '@/services/ruleAssetGovernanceWorkbenchApi'

export const DURATION_ASSET_REVIEW_KEYS = [
  'base_duration_benchmark',
  'standard_work_duration_seed',
  'special_work_duration_seed',
  'wbs_reference_days',
  'dependency_rule_candidate',
  'critical_path_rule_candidate',
] as const

export type DurationAssetReviewKey = typeof DURATION_ASSET_REVIEW_KEYS[number]
export type DurationAssetReviewScopeLevel = 'project' | 'company' | 'industry' | 'global'
export type DurationAssetReviewStatus = 'open' | 'approved' | 'rejected' | 'superseded' | 'resolved_by_publication'
export type DurationAssetReviewDecision = 'approve' | 'reject' | 'supersede'
export type DurationAssetReviewResolutionSource =
  | 'automatic_publication'
  | 'manual_approval'
  | 'manual_rejection'
  | 'manual_supersession'

export type DurationAssetReviewScope =
  | { level: 'project'; companyId: string; projectId: string }
  | { level: 'company'; companyId: string }
  | { level: 'industry'; industryKey: string }
  | { level: 'global' }

export interface DurationAssetReviewItem {
  id: string
  sourceKey: string
  decisionFingerprint: string
  reviewKind: 'candidate_publication' | 'stable_promotion'
  assetKey: DurationAssetReviewKey
  artifactKey: string
  scope: DurationAssetReviewScope
  proposalKey: string | null
  candidateEventRef: string | null
  conflictRef: string | null
  publicationKey: string | null
  resolvedPublicationKey: string | null
  reasonCodes: string[]
  reviewPayload: Record<string, unknown> | null
  status: DurationAssetReviewStatus
  canReview: boolean
  approvalReady: boolean
  assignedToUserId: string | null
  reviewedByUserId: string | null
  reviewedAt: string | null
  decisionReason: string | null
  resolutionSource: DurationAssetReviewResolutionSource | null
  createdAt: string
  updatedAt: string
}

export interface DurationAssetReviewFilters {
  assetKey?: DurationAssetReviewKey
  scope?: DurationAssetReviewScopeLevel
  projectId?: string
  reason?: string
  status?: DurationAssetReviewStatus
  age?: 'all' | '24h' | '7d' | '30d'
}

export interface DurationAssetReviewReadModel {
  generatedAt: string | null
  total: number
  items: DurationAssetReviewItem[]
}

export interface DurationAccuracySummary {
  generatedAt: string | null
  dataStatus: 'ok' | 'partial' | 'unavailable'
  sourceErrors: Array<{ source: string; code: string }>
  metrics: Array<Record<string, unknown> & { engineCode: string; sampleCount: number; status: string }>
}

export type DurationAccuracyGovernanceSourceKey = 'samples' | 'publications' | 'runtimeCalls' | 'observations'

export interface DurationAccuracyGovernanceReadModel {
  generatedAt: string | null
  sourceStatus: Record<DurationAccuracyGovernanceSourceKey, 'available' | 'unavailable'>
  sourceErrors: Partial<Record<DurationAccuracyGovernanceSourceKey, string>>
  samples: Array<Record<string, unknown>>
  publications: Array<Record<string, unknown> & { publicationKey: string; assetKey: string; publicationStage: string; monitoringStatus: string }>
  runtimeCalls: Array<Record<string, unknown>>
  observations: Array<Record<string, unknown>>
}

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function nullableText(value: unknown): string | null {
  return text(value) || null
}

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => [key, text(entry)] as const)
    .filter(([, entry]) => Boolean(entry)))
}

function summarySourceErrors(value: unknown): DurationAccuracySummary['sourceErrors'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const raw = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    const source = text(raw.source)
    const code = text(raw.code)
    return source && code ? [{ source, code }] : []
  })
}

function governanceSourceStatus(value: unknown): DurationAccuracyGovernanceReadModel['sourceStatus'] {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    samples: raw.samples === 'available' || raw.samples === 'unavailable' ? raw.samples : 'unavailable',
    publications: raw.publications === 'available' || raw.publications === 'unavailable' ? raw.publications : 'unavailable',
    runtimeCalls: raw.runtimeCalls === 'available' || raw.runtimeCalls === 'unavailable' ? raw.runtimeCalls : 'unavailable',
    observations: raw.observations === 'available' || raw.observations === 'unavailable' ? raw.observations : 'unavailable',
  }
}

function reviewScope(value: unknown): DurationAssetReviewScope {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const level = text(raw.level)
  if (level === 'project') return { level, companyId: text(raw.companyId), projectId: text(raw.projectId) }
  if (level === 'company') return { level, companyId: text(raw.companyId) }
  if (level === 'industry') return { level, industryKey: text(raw.industryKey) }
  return { level: 'global' }
}

function reviewItem(raw: unknown): DurationAssetReviewItem {
  const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const status = text(item.status)
  const assetKey = text(item.assetKey) as DurationAssetReviewKey
  return {
    id: text(item.id), sourceKey: text(item.sourceKey), decisionFingerprint: text(item.decisionFingerprint),
    reviewKind: item.reviewKind === 'stable_promotion' ? 'stable_promotion' : 'candidate_publication',
    assetKey: DURATION_ASSET_REVIEW_KEYS.includes(assetKey) ? assetKey : 'base_duration_benchmark',
    artifactKey: text(item.artifactKey), scope: reviewScope(item.scope),
    proposalKey: nullableText(item.proposalKey), candidateEventRef: nullableText(item.candidateEventRef),
    conflictRef: nullableText(item.conflictRef), publicationKey: nullableText(item.publicationKey),
    resolvedPublicationKey: nullableText(item.resolvedPublicationKey), reasonCodes: stringList(item.reasonCodes),
    reviewPayload: item.reviewPayload && typeof item.reviewPayload === 'object' && !Array.isArray(item.reviewPayload)
      ? item.reviewPayload as Record<string, unknown> : null,
    status: ['open', 'approved', 'rejected', 'superseded', 'resolved_by_publication'].includes(status)
      ? status as DurationAssetReviewStatus : 'open',
    canReview: Boolean(item.canReview), approvalReady: Boolean(item.approvalReady),
    assignedToUserId: nullableText(item.assignedToUserId), reviewedByUserId: nullableText(item.reviewedByUserId),
    reviewedAt: nullableText(item.reviewedAt), decisionReason: nullableText(item.decisionReason),
    resolutionSource: ['automatic_publication', 'manual_approval', 'manual_rejection', 'manual_supersession'].includes(text(item.resolutionSource))
      ? text(item.resolutionSource) as DurationAssetReviewResolutionSource : null,
    createdAt: text(item.createdAt), updatedAt: text(item.updatedAt),
  }
}

function query(filters: DurationAssetReviewFilters) {
  const params = new URLSearchParams()
  if (filters.assetKey) params.set('assetKey', filters.assetKey)
  if (filters.scope) params.set('scope', filters.scope)
  if (text(filters.projectId)) params.set('projectId', text(filters.projectId))
  if (text(filters.reason)) params.set('reason', text(filters.reason))
  if (filters.status) params.set('status', filters.status)
  if (filters.age) params.set('age', filters.age)
  return params.toString()
}

export async function getDurationAssetReviewItems(filters: DurationAssetReviewFilters = {}): Promise<DurationAssetReviewReadModel> {
  const filterQuery = query(filters)
  const model = await apiGet<any>(`/api/admin/duration-assets/review-items${filterQuery ? `?${filterQuery}` : ''}`, { runtimeCache: 'off' })
  return {
    generatedAt: nullableText(model?.generatedAt),
    total: Math.max(0, Math.trunc(number(model?.total))),
    items: Array.isArray(model?.items) ? model.items.map(reviewItem) : [],
  }
}

export async function getDurationAccuracySummary(projectId?: string | null): Promise<DurationAccuracySummary> {
  const params = new URLSearchParams()
  if (text(projectId)) params.set('projectId', text(projectId))
  const model = await apiGet<any>(`/api/admin/duration-accuracy/summary${params.size ? `?${params}` : ''}`, { runtimeCache: 'off' })
  return {
    generatedAt: nullableText(model?.generatedAt),
    dataStatus: model?.dataStatus === 'ok' || model?.dataStatus === 'partial' || model?.dataStatus === 'unavailable'
      ? model.dataStatus : 'unavailable',
    sourceErrors: summarySourceErrors(model?.sourceErrors),
    metrics: Array.isArray(model?.metrics) ? model.metrics.map((metric: any) => ({
      ...metric, engineCode: text(metric?.engineCode), sampleCount: number(metric?.sampleCount), status: text(metric?.status),
    })) : [],
  }
}

export async function getDurationAccuracyGovernanceReadModel(projectId?: string | null): Promise<DurationAccuracyGovernanceReadModel> {
  const params = new URLSearchParams({ limit: '25' })
  if (text(projectId)) params.set('projectId', text(projectId))
  const model = await apiGet<any>(`/api/admin/duration-accuracy/governance-read-model?${params}`, { runtimeCache: 'off' })
  const records = (value: unknown) => Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[] : []
  return {
    generatedAt: nullableText(model?.generatedAt), sourceStatus: governanceSourceStatus(model?.sourceStatus),
    sourceErrors: stringRecord(model?.sourceErrors), samples: records(model?.samples), runtimeCalls: records(model?.runtimeCalls), observations: records(model?.observations),
    publications: records(model?.publications).map((publication) => ({
      ...publication, publicationKey: text(publication.publicationKey), assetKey: text(publication.assetKey),
      publicationStage: text(publication.publicationStage), monitoringStatus: text(publication.monitoringStatus),
    })),
  }
}

export function readTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

export function decideDurationAssetReviewItem(item: DurationAssetReviewItem, decision: DurationAssetReviewDecision, decisionNotes: string) {
  if (item.scope.level === 'industry' || item.scope.level === 'global') {
    return apiPost(`/api/admin/duration-assets/review-items/${encodeURIComponent(item.id)}/decision`, {
      decision,
      decisionNotes,
    }).then(() => ({
      status: 'operation_delegated' as const,
      reasons: [] as string[],
    }))
  }
  return executeRuleAssetGovernanceWorkbenchOperation({
    action: 'duration_asset_review_decision', assetType: 'duration_learning_runtime',
    domainWriterKey: 'duration_asset_review_decision_service', evidenceToken: item.sourceKey,
    reviewItemId: item.id, reviewDecision: decision, decisionNotes,
  })
}
