import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../middleware/logger.js'
import { query as rawQuery } from '../database.js'
import { calculateDueStatus } from './dueDateService.js'
import { generateId } from '../utils/id.js'
import type { CertificateDependency, CertificateWorkItem, Warning } from '../types/db.js'
import { upsertWarningLifecycle, markSourceResolved } from './riskIssueWarningGovernanceService.js'

let cachedClient: SupabaseClient | null = null

function getClient() {
  if (cachedClient) {
    return cachedClient
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('preMilestoneWarningService requires SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_KEY')
  }

  cachedClient = createClient(supabaseUrl, supabaseKey)
  return cachedClient
}

const WARNING_CONFIG = {
  ADVANCE_WARNING_DAYS: 7,
} as const

export type WarningLevel = 'info' | 'warning' | 'critical'

export interface PermitWarning {
  id: string
  project_id: string
  pre_milestone_id: string
  permit_name: string
  permit_type: string
  expiry_date: string
  warning_level: WarningLevel
  days_until_expiry: number
  is_overdue: boolean
  responsible_at?: string
  created_at: string
}

type PreMilestoneRow = {
  id: string
  project_id: string
  milestone_name?: string | null
  milestone_type?: string | null
  status?: string | null
  expiry_date?: string | null
  updated_at?: string | null
  responsible_user_id?: string | null
  responsible_at?: string | null
}

type SupplementContext = {
  certificate: PreMilestoneRow
  linkedSupplementWorkItems: CertificateWorkItem[]
}

type PreMilestoneWarningScanOptions = {
  asOfDate?: string | Date
  systemJob?: boolean
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeDirectRows<T>(rows: Array<Record<string, unknown>>): T[] {
  return rows.map((row) => {
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      normalized[key] = value instanceof Date ? value.toISOString() : value
    }
    return normalized as T
  })
}

function isClosedCertificateStatus(status: unknown) {
  const normalized = normalizeText(status).toLowerCase()
  return ['issued', 'voided', '已领取', '已发证', '已作废', '已取消', 'completed'].includes(normalized)
}

function isSupplementStatus(status: unknown) {
  const normalized = normalizeText(status).toLowerCase()
  return ['supplement_required', '补正', '待补正', 'returned', 'rejected'].includes(normalized)
}

function assertPreMilestoneScanScope(projectId?: string, systemJob = false) {
  if (!String(projectId ?? '').trim() && !systemJob) {
    throw new Error('pre-milestone warning scan requires projectId or systemJob capability')
  }
}

// workspace-isolation-system-job-approved: global permit scans are restricted to explicit scheduled-job capability.
async function queryExpiringPermits(projectId?: string, systemJob = false) {
  assertPreMilestoneScanScope(projectId, systemJob)
  try {
    const { rows } = projectId
      ? await rawQuery(
          `SELECT *
           FROM pre_milestones
           WHERE project_id::text = $1
             AND expiry_date IS NOT NULL
             AND (status IS NULL OR lower(status::text) NOT IN ('issued', 'voided', 'completed', 'cancelled', 'done', 'closed'))
           ORDER BY expiry_date ASC`,
          [projectId],
        )
      : await rawQuery(
          `SELECT *
           FROM pre_milestones
           WHERE expiry_date IS NOT NULL
             AND (status IS NULL OR lower(status::text) NOT IN ('issued', 'voided', 'completed', 'cancelled', 'done', 'closed'))
           ORDER BY expiry_date ASC`,
          [],
        )
    return normalizeDirectRows<PreMilestoneRow>(rows)
  } catch (error) {
    logger.warn('Falling back to Supabase REST for pre-milestone expiry warning scan', { projectId, error })
  }

  let query = getClient()
    .from('pre_milestones')
    .select('*')
    .not('status', 'in', '("已完成", "已取消")')
    .not('expiry_date', 'is', null)
    .order('expiry_date', { ascending: true })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []) as PreMilestoneRow[]
}

// workspace-isolation-system-job-approved: global certificate scans are restricted to explicit scheduled-job capability.
async function queryActiveCertificates(projectId?: string, systemJob = false) {
  assertPreMilestoneScanScope(projectId, systemJob)
  try {
    const { rows } = projectId
      ? await rawQuery(
          `SELECT *
           FROM pre_milestones
           WHERE project_id::text = $1
             AND (status IS NULL OR lower(status::text) NOT IN ('issued', 'voided', 'completed', 'cancelled', 'done', 'closed'))
           ORDER BY created_at ASC`,
          [projectId],
        )
      : await rawQuery(
          `SELECT *
           FROM pre_milestones
           WHERE (status IS NULL OR lower(status::text) NOT IN ('issued', 'voided', 'completed', 'cancelled', 'done', 'closed'))
           ORDER BY created_at ASC`,
          [],
        )
    return normalizeDirectRows<PreMilestoneRow>(rows)
  } catch (error) {
    logger.warn('Falling back to Supabase REST for active pre-milestone warning scan', { projectId, error })
  }

  let query = getClient()
    .from('pre_milestones')
    .select('*')
    .not('status', 'in', '("已完成", "已取消")')
    .order('created_at', { ascending: true })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []) as PreMilestoneRow[]
}

// workspace-isolation-system-job-approved: global work-item scans are restricted to explicit scheduled-job capability.
async function queryProjectWorkItems(projectId?: string, systemJob = false) {
  assertPreMilestoneScanScope(projectId, systemJob)
  try {
    const { rows } = projectId
      ? await rawQuery(
          `SELECT *
           FROM certificate_work_items
           WHERE project_id::text = $1
           ORDER BY sort_order ASC NULLS LAST, created_at ASC`,
          [projectId],
        )
      : await rawQuery(
          `SELECT *
           FROM certificate_work_items
           ORDER BY sort_order ASC NULLS LAST, created_at ASC`,
          [],
        )
    return normalizeDirectRows<CertificateWorkItem>(rows)
  } catch (error) {
    logger.warn('Falling back to Supabase REST for pre-milestone work item warning scan', { projectId, error })
  }

  let query = getClient()
    .from('certificate_work_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []) as CertificateWorkItem[]
}

// workspace-isolation-system-job-approved: global dependency scans are restricted to explicit scheduled-job capability.
async function queryProjectDependencies(projectId?: string, systemJob = false) {
  assertPreMilestoneScanScope(projectId, systemJob)
  try {
    const { rows } = projectId
      ? await rawQuery(
          `SELECT *
           FROM certificate_dependencies
           WHERE project_id::text = $1
           ORDER BY created_at ASC`,
          [projectId],
        )
      : await rawQuery(
          `SELECT *
           FROM certificate_dependencies
           ORDER BY created_at ASC`,
          [],
        )
    return normalizeDirectRows<CertificateDependency>(rows)
  } catch (error) {
    logger.warn('Falling back to Supabase REST for pre-milestone dependency warning scan', { projectId, error })
  }

  let query = getClient()
    .from('certificate_dependencies')
    .select('*')
    .order('created_at', { ascending: true })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) throw error

  return (data ?? []) as CertificateDependency[]
}

function buildPermitWarning(permit: PreMilestoneRow, options: PreMilestoneWarningScanOptions = {}): PermitWarning | null {
  if (!permit.expiry_date) return null

  const dueResult = calculateDueStatus(permit.expiry_date, {
    urgentDays: 3,
    approachingDays: WARNING_CONFIG.ADVANCE_WARNING_DAYS,
    overdueLabel: '已过期',
    dueLabel: '天后过期',
    todayLabel: '今天过期',
    asOfDate: options.asOfDate,
  })

  if (dueResult.due_status === 'normal') {
    return null
  }

  const daysDiff = dueResult.days_until_due ?? 0
  const warningLevel: WarningLevel =
    dueResult.due_status === 'overdue' || daysDiff <= 3 ? 'critical' : 'warning'

  return {
    id: generateId(),
    project_id: permit.project_id,
    pre_milestone_id: permit.id,
    permit_name: permit.milestone_name ?? '前期证照',
    permit_type: permit.milestone_type ?? 'certificate',
    expiry_date: permit.expiry_date,
    warning_level: warningLevel,
    days_until_expiry: daysDiff,
    is_overdue: dueResult.due_status === 'overdue',
    responsible_at: permit.responsible_user_id ?? permit.responsible_at ?? undefined,
    created_at: new Date().toISOString(),
  }
}

function buildPermitWarningRecord(permit: PreMilestoneRow, options: PreMilestoneWarningScanOptions = {}): Warning | null {
  const warning = buildPermitWarning(permit, options)
  if (!warning) return null

  const suffix = warning.is_overdue
    ? '已逾期，请尽快处理。'
    : `距离到期还有 ${Math.abs(warning.days_until_expiry)} 天。`

  return {
    id: warning.id,
    project_id: warning.project_id,
    task_id: warning.pre_milestone_id,
    warning_type: 'permit_expiry',
    warning_level: warning.warning_level,
    title: `${warning.permit_name} ${warning.is_overdue ? '已逾期' : '临期预警'}`,
    description: `证照 ${warning.permit_name} 到期日为 ${warning.expiry_date}，${suffix}`,
    is_acknowledged: false,
    created_at: warning.created_at,
  }
}

function buildSupplementContexts(
  certificates: PreMilestoneRow[],
  workItems: CertificateWorkItem[],
  dependencies: CertificateDependency[],
) {
  const workItemsById = new Map(workItems.map((item) => [item.id, item]))
  const certificateToWorkItems = new Map<string, CertificateWorkItem[]>()

  for (const dependency of dependencies) {
    if (dependency.predecessor_type !== 'certificate' || dependency.successor_type !== 'work_item') {
      continue
    }

    const workItem = workItemsById.get(dependency.successor_id)
    if (!workItem) continue

    const linked = certificateToWorkItems.get(dependency.predecessor_id) ?? []
    linked.push(workItem)
    certificateToWorkItems.set(dependency.predecessor_id, linked)
  }

  return certificates
    .filter((certificate) => !isClosedCertificateStatus(certificate.status))
    .map((certificate) => ({
      certificate,
      linkedSupplementWorkItems: (certificateToWorkItems.get(certificate.id) ?? []).filter((item) =>
        isSupplementStatus(item.status),
      ),
    }))
}

function buildSupplementWarnings(contexts: SupplementContext[]): Warning[] {
  const warnings: Warning[] = []

  for (const { certificate, linkedSupplementWorkItems } of contexts) {
    const certificateSupplement = isSupplementStatus(certificate.status)
    const supplementCount = linkedSupplementWorkItems.length + (certificateSupplement ? 1 : 0)
    if (supplementCount === 0) continue

    const warningType = supplementCount > 1 ? 'permit_supplement_cycle' : 'permit_supplement_required'
    const warningLevel: WarningLevel = supplementCount > 1 ? 'critical' : 'warning'
    const certificateName = certificate.milestone_name ?? '前期证照'
    const fragments = linkedSupplementWorkItems.map((item) => item.item_name).filter(Boolean)
    const descriptionSuffix =
      fragments.length > 0 ? `涉及事项：${fragments.join('、')}。` : '当前证照办理链路存在补正要求。'

    warnings.push({
      id: generateId(),
      project_id: certificate.project_id,
      task_id: certificate.id,
      warning_type: warningType,
      warning_level: warningLevel,
      title: supplementCount > 1 ? `${certificateName} 补正反复预警` : `${certificateName} 待补正预警`,
      description:
        supplementCount > 1
          ? `证照 ${certificateName} 已多次进入补正链路，${descriptionSuffix}`
          : `证照 ${certificateName} 当前处于补正状态，${descriptionSuffix}`,
      is_acknowledged: false,
      created_at: new Date().toISOString(),
    })
  }

  return warnings
}

export async function scanExpiringPermits(): Promise<PermitWarning[]> {
  logger.info('Starting expiring permits scan')

  try {
    const permits = await queryExpiringPermits(undefined, true)
    const warnings = permits
      .map((permit) => buildPermitWarning(permit))
      .filter((warning): warning is PermitWarning => Boolean(warning))

    logger.info(`Scan completed, found ${warnings.length} expiring permits`)
    return warnings
  } catch (error) {
    logger.error('Failed to scan expiring permits', { error })
    throw error
  }
}

export async function scanPreMilestoneWarnings(
  projectId?: string,
  options: PreMilestoneWarningScanOptions = {},
): Promise<Warning[]> {
  assertPreMilestoneScanScope(projectId, options.systemJob === true)
  const [expiringPermits, certificates, workItems, dependencies] = await Promise.all([
    queryExpiringPermits(projectId, options.systemJob === true),
    queryActiveCertificates(projectId, options.systemJob === true),
    queryProjectWorkItems(projectId, options.systemJob === true),
    queryProjectDependencies(projectId, options.systemJob === true),
  ])

  const expiryWarnings = expiringPermits
    .map((permit) => buildPermitWarningRecord(permit, options))
    .filter((warning): warning is Warning => Boolean(warning))
  const supplementWarnings = buildSupplementWarnings(
    buildSupplementContexts(certificates, workItems, dependencies),
  )

  return [...expiryWarnings, ...supplementWarnings]
}

export async function createWarning(warning: Omit<PermitWarning, 'id' | 'created_at'>): Promise<void> {
  try {
    const title = `${warning.permit_name} ${warning.is_overdue ? '已逾期' : '临期预警'}`
    const description = warning.is_overdue
      ? `证照 ${warning.permit_name} 到期日为 ${warning.expiry_date}，已逾期，请尽快处理。`
      : `证照 ${warning.permit_name} 到期日为 ${warning.expiry_date}，距离到期还有 ${Math.abs(warning.days_until_expiry)} 天。`

    // v1.4.12: write to notifications warning projection via governance service
    await upsertWarningLifecycle({
      projectId: warning.project_id,
      warningType: 'permit_expiry',
      severity: warning.warning_level === 'critical' ? 'critical' : warning.warning_level === 'warning' ? 'warning' : 'info',
      title,
      message: description,
      sourceEntityType: 'pre_milestone',
      sourceEntityId: warning.pre_milestone_id,
      taskId: warning.pre_milestone_id,
    })

    logger.info('Warning created', { permitId: warning.pre_milestone_id, level: warning.warning_level })
  } catch (error) {
    logger.error('Failed to create warning', { error, permitId: warning.pre_milestone_id })
    throw error
  }
}

export async function createWarningsBatch(warnings: PermitWarning[]): Promise<void> {
  logger.info(`Creating ${warnings.length} warnings batch`)

  for (const warning of warnings) {
    try {
      await createWarning(warning)
    } catch (error) {
      logger.error('Failed to create warning in batch', { error, permitId: warning.pre_milestone_id })
    }
  }

  logger.info('Batch warning creation completed')
}

export async function markAsOverdue(): Promise<number> {
  logger.info('Starting overdue permits marking')

  const today = new Date().toISOString().split('T')[0]

  try {
    const { data, error } = await getClient()
      .from('pre_milestones')
      .select('id, milestone_name, status')
      .not('status', 'in', '("已完成", "已取消", "已延期")')
      .lt('expiry_date', today)

    if (error) throw error

    if (!data || data.length === 0) {
      logger.info('No overdue permits found')
      return 0
    }

    const { error: updateError } = await getClient()
      .from('pre_milestones')
      .update({
        status: '已延期',
        updated_at: new Date().toISOString(),
      })
      .in('id', data.map((permit) => permit.id))

    if (updateError) throw updateError

    logger.info(`Marked ${data.length} permits as overdue`)
    return data.length
  } catch (error) {
    logger.error('Failed to mark overdue permits', { error })
    throw error
  }
}

export async function executeWarningCheck(): Promise<{
  expiring: number
  overdue: number
  warningsCreated: number
  warningsCleaned: number
}> {
  logger.info('Starting permit warning check')

  try {
    const expiringPermits = await scanExpiringPermits()
    await createWarningsBatch(expiringPermits)
    const overdueCount = await markAsOverdue()
    const cleanupCount = await cleanupExpiredWarnings()

    logger.info('Warning check completed', {
      expiring: expiringPermits.length,
      overdue: overdueCount,
      warningsCreated: expiringPermits.length,
      warningsCleaned: cleanupCount,
    })

    return {
      expiring: expiringPermits.length,
      overdue: overdueCount,
      warningsCreated: expiringPermits.length,
      warningsCleaned: cleanupCount,
    }
  } catch (error) {
    logger.error('Failed to execute warning check', { error })
    throw error
  }
}

export async function getPermitWarnings(projectId: string): Promise<PermitWarning[]> {
  try {
    const permits = await queryExpiringPermits(projectId)
    return permits
      .map((permit) => buildPermitWarning(permit))
      .filter((warning): warning is PermitWarning => Boolean(warning))
  } catch (error) {
    logger.error('Failed to get permit warnings', { error, projectId })
    throw error
  }
}

export async function cleanupExpiredWarnings(): Promise<number> {
  logger.info('Starting expired warnings cleanup')

  try {
    const { data: completedPermits, error } = await getClient()
      .from('pre_milestones')
      .select('id, project_id')
      .in('status', ['已完成', '已取消'])

    if (error) throw error

    if (!completedPermits || completedPermits.length === 0) {
      logger.info('No completed permits found')
      return 0
    }

    // v1.4.12: mark source resolved instead of physical delete
    let resolvedCount = 0
    for (const permit of completedPermits) {
      await markSourceResolved('pre_milestone', permit.id, permit.project_id ?? null)
      resolvedCount++
    }

    logger.info(`Resolved ${resolvedCount} expired warnings`)
    return resolvedCount
  } catch (error) {
    logger.error('Failed to cleanup expired warnings', { error })
    throw error
  }
}

export default {
  scanExpiringPermits,
  scanPreMilestoneWarnings,
  createWarning,
  createWarningsBatch,
  markAsOverdue,
  executeWarningCheck,
  getPermitWarnings,
  cleanupExpiredWarnings,
}
