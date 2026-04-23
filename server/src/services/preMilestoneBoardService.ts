import type {
  CertificateBoardItem,
  CertificateBoardResponse,
  CertificateBoardSummary,
  CertificateDependency,
  CertificateDependencyMatrixCell,
  CertificateDependencyMatrixRow,
  CertificateDetailResponse,
  CertificateLedgerResponse,
  CertificateSharedRibbonItem,
  CertificateStage,
  CertificateStatus,
  CertificateType,
  CertificateWorkItem,
  Issue,
  PreMilestone,
  Risk,
  Warning,
  KnownCertificateType,
} from '../types/db.js'
import { CERTIFICATE_TYPE_LABELS, CERTIFICATE_TYPE_REGISTRY, CERTIFICATE_TYPES } from '../types/db.js'

export const CERTIFICATE_TYPE_ORDER: CertificateType[] = [...CERTIFICATE_TYPES]

const CERTIFICATE_TYPE_LOOKUP = new Map<string, KnownCertificateType>(
  CERTIFICATE_TYPE_REGISTRY.flatMap((entry) => [
    [entry.type.toLowerCase(), entry.type],
    ...(entry.aliases ?? []).map((alias) => [alias.toLowerCase(), entry.type] as const),
  ]),
)

export function getCertificateTypeLabel(type: string | null | undefined) {
  const normalized = normalizeText(type, '')
  if (!normalized) return '待补全'

  const knownType = CERTIFICATE_TYPE_LOOKUP.get(normalized.toLowerCase())
  if (knownType) {
    return CERTIFICATE_TYPE_LABELS[knownType]
  }

  return normalized
}

export const CERTIFICATE_STAGE_SEQUENCE: CertificateStage[] = [
  '资料准备',
  '内部报审',
  '外部报批',
  '批复领证',
]

const COMPLETE_STATUSES: CertificateStatus[] = ['issued', 'voided', 'approved']
const BLOCKING_STATUSES: CertificateStatus[] = ['supplement_required', 'expired']

type DateLike = string | null | undefined

function normalizeText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function normalizeDate(value: DateLike): string | null {
  const text = normalizeText(value)
  if (!text) return null
  return text.slice(0, 10)
}

export function normalizeCertificateType(
  value: string | null | undefined,
  fallbackIndex = 0
): CertificateType {
  const text = normalizeText(value)
  const knownType = CERTIFICATE_TYPE_LOOKUP.get(text.toLowerCase())
  if (knownType) {
    return knownType
  }

  if (!text) {
    return CERTIFICATE_TYPE_ORDER[fallbackIndex] ?? CERTIFICATE_TYPE_ORDER[0] ?? 'construction_permit'
  }

  return text
}

export function normalizeCertificateStatus(value: string | null | undefined): CertificateStatus {
  const text = normalizeText(value).toLowerCase()

  if (['issued', '已发证', '已领取', 'completed', '已办结'].includes(text)) return 'issued'
  if (['approved', '已批复'].includes(text)) return 'approved'
  if (['supplement_required', '补正', 'returned', 'rejected'].includes(text)) return 'supplement_required'
  if (['preparing_documents', '资料准备中', '准备材料'].includes(text)) return 'preparing_documents'
  if (['external_submission', '外部报批'].includes(text)) return 'external_submission'
  if (['internal_review', '内部报审'].includes(text)) return 'internal_review'
  if (['expired', '已过期', '已失效'].includes(text)) return 'expired'
  if (['voided', '已作废', '注销', '已吊销'].includes(text)) return 'voided'

  return 'pending'
}

export function normalizeCertificateStage(value: string | null | undefined): CertificateStage {
  const text = normalizeText(value)
  if (CERTIFICATE_STAGE_SEQUENCE.includes(text as CertificateStage)) {
    return text as CertificateStage
  }
  if (text.includes('外部')) return '外部报批'
  if (text.includes('内部')) return '内部报审'
  if (text.includes('资料') || text.includes('准备')) return '资料准备'
  return '资料准备'
}

export function mapLegacyPreMilestoneToCertificate(
  milestone: Partial<PreMilestone> & Record<string, any>,
  fallbackIndex = 0
): CertificateBoardItem {
  const certificateType = normalizeCertificateType(
    milestone.certificate_type ?? milestone.milestone_type ?? milestone.milestone_name,
    fallbackIndex
  )
  const certificateName = normalizeText(
    milestone.certificate_name ?? milestone.milestone_name,
    getCertificateTypeLabel(certificateType)
  )
  const status = normalizeCertificateStatus(milestone.status)
  const currentStage = normalizeCertificateStage(milestone.current_stage ?? milestone.milestone_type)

  return {
    id: normalizeText(milestone.id, `certificate-${certificateType}`),
    certificate_type: certificateType,
    certificate_name: certificateName,
    status,
    current_stage: currentStage,
    planned_finish_date: normalizeDate(milestone.planned_finish_date ?? milestone.planned_end_date ?? milestone.planned_date),
    actual_finish_date: normalizeDate(milestone.actual_finish_date ?? milestone.actual_end_date ?? milestone.actual_date),
    approving_authority: normalizeText(
      milestone.approving_authority ?? milestone.issuing_authority,
      ''
    ) || null,
    next_action: normalizeText(milestone.next_action ?? milestone.description, ''),
    next_action_due_date: normalizeDate(milestone.next_action_due_date),
    is_blocked: Boolean(milestone.is_blocked ?? BLOCKING_STATUSES.includes(status)),
    block_reason: normalizeText(milestone.block_reason, '') || null,
    latest_record_at: normalizeDate(milestone.latest_record_at ?? milestone.updated_at),
    work_item_ids: Array.isArray(milestone.work_item_ids) ? milestone.work_item_ids.filter(Boolean) : [],
    shared_work_item_ids: Array.isArray(milestone.shared_work_item_ids)
      ? milestone.shared_work_item_ids.filter(Boolean)
      : [],
  }
}

function buildCertificateItems(
  certificateSources: Array<Partial<PreMilestone> & Record<string, any>>,
  includeDefaultOrder = true,
): CertificateBoardItem[] {
  const indexedSources = certificateSources.map((milestone, index) => ({
    milestone,
    certificateType: normalizeCertificateType(
      milestone.certificate_type ?? milestone.milestone_type ?? milestone.milestone_name,
      index
    ),
  }))

  const orderedTypes: CertificateType[] = includeDefaultOrder ? [...CERTIFICATE_TYPE_ORDER] : []
  for (const entry of indexedSources) {
    if (!orderedTypes.some((certificateType) => String(certificateType) === String(entry.certificateType))) {
      orderedTypes.push(entry.certificateType)
    }
  }

  if (orderedTypes.length === 0) {
    return []
  }

  return orderedTypes.map((certificateType, index) => {
    const source =
      indexedSources.find((entry) => String(entry.certificateType) === String(certificateType))?.milestone ??
      ({
        milestone_type: certificateType,
        milestone_name: getCertificateTypeLabel(certificateType),
        status: 'pending',
      } as Partial<PreMilestone> & Record<string, any>)

    return mapLegacyPreMilestoneToCertificate(source, index)
  })
}

function collectRelations(
  certificate: CertificateBoardItem,
  workItems: CertificateWorkItem[],
  dependencies: CertificateDependency[]
) {
  const related = dependencies.filter(
    (dependency) =>
      dependency.predecessor_type === 'certificate' &&
      dependency.predecessor_id === certificate.id &&
      dependency.successor_type === 'work_item'
  )

  const workItemIds = new Set(related.map((dependency) => dependency.successor_id))
  const items = workItems.filter((item) => workItemIds.has(item.id))
  return { related, items }
}

function collectDetailAnchors(certificate: CertificateBoardItem, workItems: CertificateWorkItem[]) {
  const anchors = new Set<string>()
  const add = (value?: string | null) => {
    const normalized = normalizeText(value, '')
    if (normalized) anchors.add(normalized)
  }

  add(certificate.id)
  add(certificate.certificate_type)
  for (const workItem of workItems) {
    add(workItem.id)
  }
  for (const workItemId of certificate.work_item_ids || []) {
    add(workItemId)
  }
  for (const sharedWorkItemId of certificate.shared_work_item_ids || []) {
    add(sharedWorkItemId)
  }

  return anchors
}

function isLinkedToAnchors(
  candidate: {
    task_id?: string | null
    source_id?: string | null
    source_entity_id?: string | null
    chain_id?: string | null
    linked_issue_id?: string | null
  },
  anchors: Set<string>,
) {
  return [
    candidate.task_id,
    candidate.source_id,
    candidate.source_entity_id,
    candidate.chain_id,
    candidate.linked_issue_id,
  ]
    .map((value) => normalizeText(value, ''))
    .some((value) => value && anchors.has(value))
}

function collectLinkedDetailSignals(params: {
  warnings: Warning[]
  issues: Issue[]
  risks: Risk[]
  anchors: Set<string>
}) {
  const anchors = new Set(params.anchors)
  const linkedWarnings = new Map<string, Warning>()
  const linkedIssues = new Map<string, Issue>()
  const linkedRisks = new Map<string, Risk>()

  let changed = true
  while (changed) {
    changed = false

    for (const warning of params.warnings) {
      if (linkedWarnings.has(warning.id)) continue
      if (!isLinkedToAnchors({ task_id: warning.task_id ?? null }, anchors)) continue

      linkedWarnings.set(warning.id, warning)
      anchors.add(warning.id)
      changed = true
    }

    for (const issue of params.issues) {
      if (linkedIssues.has(issue.id)) continue
      if (!isLinkedToAnchors(issue, anchors)) continue

      linkedIssues.set(issue.id, issue)
      anchors.add(issue.id)
      changed = true
    }

    for (const risk of params.risks) {
      if (linkedRisks.has(risk.id)) continue
      if (!isLinkedToAnchors(risk, anchors)) continue

      linkedRisks.set(risk.id, risk)
      anchors.add(risk.id)
      changed = true
    }
  }

  return {
    linkedWarnings: Array.from(linkedWarnings.values()),
    linkedIssues: Array.from(linkedIssues.values()),
    linkedRisks: Array.from(linkedRisks.values()),
  }
}

function toSharedRibbonItem(
  item: CertificateWorkItem,
  dependencies: CertificateDependency[],
  certificates: CertificateBoardItem[]
): CertificateSharedRibbonItem {
  const linkedCertificateIds = dependencies
    .filter(
      (dependency) =>
        dependency.successor_type === 'work_item' &&
        dependency.successor_id === item.id &&
        dependency.predecessor_type === 'certificate'
    )
    .map((dependency) => dependency.predecessor_id)

  const linkedCertificates = certificates.filter((certificate) =>
    linkedCertificateIds.includes(certificate.id)
  )

  return {
    work_item_id: item.id,
    item_name: item.item_name,
    item_stage: item.item_stage,
    status: item.status,
    is_shared: Boolean(item.is_shared ?? linkedCertificates.length > 1),
    certificate_types: linkedCertificates.map((certificate) => certificate.certificate_type),
    certificate_names: linkedCertificates.map((certificate) => certificate.certificate_name),
    blocking_certificate_types: linkedCertificates
      .filter((certificate) => certificate.is_blocked)
      .map((certificate) => certificate.certificate_type),
    dependency_count: linkedCertificates.length,
    next_action: item.next_action ?? null,
    next_action_due_date: normalizeDate(item.next_action_due_date),
    block_reason: item.block_reason ?? null,
    planned_finish_date: normalizeDate(item.planned_finish_date),
  }
}

function getExpectedReadyDate(certificates: CertificateBoardItem[], workItems: CertificateWorkItem[]): string | null {
  const candidateDates = [
    ...certificates
      .filter((certificate) => !COMPLETE_STATUSES.includes(normalizeCertificateStatus(certificate.status)))
      .map((certificate) => normalizeDate(certificate.planned_finish_date))
      .filter((value): value is string => Boolean(value)),
    ...workItems
      .filter((item) => !COMPLETE_STATUSES.includes(normalizeCertificateStatus(item.status)))
      .map((item) => normalizeDate(item.planned_finish_date))
      .filter((value): value is string => Boolean(value)),
  ]

  if (candidateDates.length === 0) return null
  return candidateDates.sort()[candidateDates.length - 1]
}

function countOverdueItems(certificates: CertificateBoardItem[], workItems: CertificateWorkItem[], now = new Date()) {
  const today = now.toISOString().slice(0, 10)

  const overdueCertificates = certificates.filter((certificate) => {
    const planned = normalizeDate(certificate.planned_finish_date)
    if (!planned) return false
    return planned < today && !COMPLETE_STATUSES.includes(normalizeCertificateStatus(certificate.status))
  })

  const overdueWorkItems = workItems.filter((item) => {
    const planned = normalizeDate(item.planned_finish_date)
    if (!planned) return false
    return planned < today && !COMPLETE_STATUSES.includes(normalizeCertificateStatus(item.status))
  })

  return overdueCertificates.length + overdueWorkItems.length
}

function countWeeklyActions(workItems: CertificateWorkItem[], now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)

  return workItems.filter((item) => {
    const due = normalizeDate(item.next_action_due_date ?? item.planned_finish_date)
    if (!due) return false
    return due >= start.toISOString().slice(0, 10) && due <= end.toISOString().slice(0, 10)
  }).length
}

export function buildLicenseBoardReadModel(params: {
  certificates?: Array<Partial<PreMilestone> & Record<string, any>>
  workItems?: CertificateWorkItem[]
  dependencies?: CertificateDependency[]
  now?: Date
}): CertificateBoardResponse {
  const now = params.now ?? new Date()
  const certificates = buildCertificateItems(params.certificates ?? [])

  const workItems = params.workItems ?? []
  const dependencies = params.dependencies ?? []

  const enrichedCertificates = certificates.map((certificate) => {
    const { related, items } = collectRelations(certificate, workItems, dependencies)
    const sharedItemIds = items.filter((item) => Boolean(item.is_shared ?? related.length > 1)).map((item) => item.id)
    return {
      ...certificate,
      work_item_ids: items.map((item) => item.id),
      shared_work_item_ids: sharedItemIds,
      is_blocked:
        certificate.is_blocked ||
        items.some((item) => Boolean(item.is_blocked)) ||
        related.some((dependency) => dependency.dependency_kind === 'hard'),
      block_reason:
        certificate.block_reason ||
        items.find((item) => item.block_reason)?.block_reason ||
        (related.some((dependency) => dependency.dependency_kind === 'hard') ? '存在强依赖关系阻止启动' : null),
    }
  })

  const sharedItems = workItems
    .filter((item) => {
      const linkedCount = dependencies.filter(
        (dependency) =>
          dependency.successor_type === 'work_item' &&
          dependency.successor_id === item.id &&
          dependency.predecessor_type === 'certificate'
      ).length
      return Boolean(item.is_shared ?? linkedCount > 1)
    })
    .map((item) => toSharedRibbonItem(item, dependencies, enrichedCertificates))

  const completedCount = enrichedCertificates.filter((certificate) =>
    COMPLETE_STATUSES.includes(normalizeCertificateStatus(certificate.status))
  ).length

  const blockingCertificate =
    enrichedCertificates.find(
      (certificate) => normalizeCertificateStatus(certificate.status) === 'supplement_required'
    ) ??
    enrichedCertificates.find(
      (certificate) =>
        certificate.is_blocked &&
        normalizeCertificateStatus(certificate.status) !== 'issued' &&
        normalizeCertificateStatus(certificate.status) !== 'voided'
    ) ??
    null

  const summary: CertificateBoardSummary = {
    completedCount,
    totalCount: enrichedCertificates.length,
    blockingCertificateType: blockingCertificate?.certificate_type ?? null,
    expectedReadyDate: getExpectedReadyDate(enrichedCertificates, workItems),
    overdueCount: countOverdueItems(enrichedCertificates, workItems, now),
    supplementCount:
      workItems.filter((item) => normalizeCertificateStatus(item.status) === 'supplement_required').length +
      enrichedCertificates.filter((certificate) => normalizeCertificateStatus(certificate.status) === 'supplement_required').length,
    weeklyActionCount: countWeeklyActions(workItems, now),
  }

  return {
    summary,
    certificates: enrichedCertificates,
    sharedItems,
  }
}

export function buildLicenseLedgerReadModel(params: {
  workItems?: CertificateWorkItem[]
  dependencies?: CertificateDependency[]
  certificateId?: string | null
}): CertificateLedgerResponse {
  const workItems = params.workItems ?? []
  const dependencies = params.dependencies ?? []
  const filteredItems = params.certificateId
    ? workItems.filter((item) =>
        dependencies.some(
          (dependency) =>
            dependency.predecessor_type === 'certificate' &&
            dependency.predecessor_id === params.certificateId &&
            dependency.successor_type === 'work_item' &&
            dependency.successor_id === item.id
        )
      )
    : workItems

  return {
    items: filteredItems,
    totals: {
      overdueCount: filteredItems.filter((item) => BLOCKING_STATUSES.includes(normalizeCertificateStatus(item.status))).length,
      blockedCount: filteredItems.filter((item) => Boolean(item.is_blocked)).length,
      supplementCount: filteredItems.filter((item) => normalizeCertificateStatus(item.status) === 'supplement_required').length,
    },
  }
}

export function buildLicenseDetailReadModel(params: {
  certificates?: Array<Partial<PreMilestone> & Record<string, any>>
  certificate?: Partial<PreMilestone> & Record<string, any> | null
  workItems?: CertificateWorkItem[]
  dependencies?: CertificateDependency[]
  warnings?: Warning[]
  issues?: Issue[]
  risks?: Risk[]
  records?: Array<{
    id: string
    project_id: string
    target_type: 'certificate' | 'work_item'
    target_id: string
    record_type: 'status_change' | 'supplement_required' | 'condition_satisfied' | 'blocked' | 'unblocked' | 'note'
    from_status?: string | null
    to_status?: string | null
    content?: string | null
    recorded_at: string
    recorded_by?: string | null
  }>
}): CertificateDetailResponse {
  const certificateSources = params.certificates?.length
    ? params.certificates
    : [
        params.certificate ?? {
          milestone_type: CERTIFICATE_TYPE_ORDER[0],
          milestone_name: getCertificateTypeLabel(CERTIFICATE_TYPE_ORDER[0]),
          status: 'pending',
        },
      ]
  const certificates = buildCertificateItems(certificateSources, Boolean(params.certificates?.length))
  const certificate = certificates[0]
  const workItems = params.workItems ?? []
  const dependencies = params.dependencies ?? []
  const warnings = params.warnings ?? []
  const issues = params.issues ?? []
  const risks = params.risks ?? []
  const records = params.records ?? []
  const anchors = collectDetailAnchors(certificate, workItems)
  const { linkedWarnings, linkedIssues, linkedRisks } = collectLinkedDetailSignals({
    warnings,
    issues,
    risks,
    anchors,
  })
  const matrix: CertificateDependencyMatrixRow[] = certificates.map((rowCertificate) => {
    const rowDependencies = dependencies.filter(
      (item) =>
        item.predecessor_type === 'certificate' &&
        item.predecessor_id === rowCertificate.id &&
        item.successor_type === 'work_item'
    )

    const cells: CertificateDependencyMatrixCell[] = workItems.map((workItem) => {
      const dependency = rowDependencies.find((item) => item.successor_id === workItem.id)

      if (!dependency) {
        return {
          work_item_id: workItem.id,
          work_item_name: workItem.item_name,
          status: 'none',
          dependency_kind: null,
          is_shared: Boolean(workItem.is_shared),
        }
      }

      return {
        work_item_id: workItem.id,
        work_item_name: workItem.item_name,
        status: workItem.is_blocked ? 'blocked' : normalizeCertificateStatus(workItem.status) === 'issued' ? 'satisfied' : 'pending',
        dependency_kind: dependency.dependency_kind,
        is_shared: Boolean(workItem.is_shared),
      }
    })

    return {
      certificate_id: rowCertificate.id,
      certificate_type: rowCertificate.certificate_type,
      certificate_name: rowCertificate.certificate_name,
      cells,
    }
  })

  return {
    certificate,
    workItems,
    dependencies,
    records,
    dependencyMatrix: matrix,
    linkedWarnings,
    linkedIssues,
    linkedRisks,
  }
}

export const certificateBoardContracts = {
  types: [
    'CertificateType',
    'CertificateStatus',
    'CertificateStage',
    'CertificateWorkItem',
    'CertificateDependency',
    'CertificateBoardResponse',
    'CertificateLedgerResponse',
    'CertificateDetailResponse',
  ],
  endpoints: [
    {
      method: 'GET',
      path: '/api/projects/:projectId/pre-milestones/board',
      requestShape: '{ projectId: string }',
      responseShape: 'CertificateBoardResponse',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'GET',
      path: '/api/projects/:projectId/pre-milestones/ledger',
      requestShape: '{ projectId: string }',
      responseShape: 'CertificateLedgerResponse',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'GET',
      path: '/api/projects/:projectId/pre-milestones/:certificateId/detail',
      requestShape: '{ projectId: string, certificateId: string }',
      responseShape: 'CertificateDetailResponse',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
  ],
} as const
