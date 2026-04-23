import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../middleware/logger.js'
import { calculateDueStatus } from './dueDateService.js'
import { generateId } from '../utils/id.js'
import type { CertificateDependency, CertificateWorkItem, Warning } from '../types/db.js'

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

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function isClosedCertificateStatus(status: unknown) {
  const normalized = normalizeText(status).toLowerCase()
  return ['issued', 'voided', '已领取', '已发证', '已作废', '已取消', 'completed'].includes(normalized)
}

function isSupplementStatus(status: unknown) {
  const normalized = normalizeText(status).toLowerCase()
  return ['supplement_required', '补正', '待补正', 'returned', 'rejected'].includes(normalized)
}

async function queryExpiringPermits(projectId?: string) {
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

async function queryActiveCertificates(projectId?: string) {
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

async function queryProjectWorkItems(projectId?: string) {
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

async function queryProjectDependencies(projectId?: string) {
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

function buildPermitWarning(permit: PreMilestoneRow): PermitWarning | null {
  if (!permit.expiry_date) return null

  const dueResult = calculateDueStatus(permit.expiry_date, {
    urgentDays: 3,
    approachingDays: WARNING_CONFIG.ADVANCE_WARNING_DAYS,
    overdueLabel: '已过期',
    dueLabel: '天后过期',
    todayLabel: '今天过期',
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

function buildPermitWarningRecord(permit: PreMilestoneRow): Warning | null {
  const warning = buildPermitWarning(permit)
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
    const permits = await queryExpiringPermits()
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

export async function scanPreMilestoneWarnings(projectId?: string): Promise<Warning[]> {
  const [expiringPermits, certificates, workItems, dependencies] = await Promise.all([
    queryExpiringPermits(projectId),
    queryActiveCertificates(projectId),
    queryProjectWorkItems(projectId),
    queryProjectDependencies(projectId),
  ])

  const expiryWarnings = expiringPermits
    .map((permit) => buildPermitWarningRecord(permit))
    .filter((warning): warning is Warning => Boolean(warning))
  const supplementWarnings = buildSupplementWarnings(
    buildSupplementContexts(certificates, workItems, dependencies),
  )

  return [...expiryWarnings, ...supplementWarnings]
}

export async function createWarning(warning: Omit<PermitWarning, 'id' | 'created_at'>): Promise<void> {
  try {
    const { data: existing } = await getClient()
      .from('warnings')
      .select('id')
      .eq('warning_type', 'permit_expiry')
      .eq('task_id', warning.pre_milestone_id)
      .single()

    const title = `${warning.permit_name} ${warning.is_overdue ? '已逾期' : '临期预警'}`
    const description = warning.is_overdue
      ? `证照 ${warning.permit_name} 到期日为 ${warning.expiry_date}，已逾期，请尽快处理。`
      : `证照 ${warning.permit_name} 到期日为 ${warning.expiry_date}，距离到期还有 ${Math.abs(warning.days_until_expiry)} 天。`

    if (existing) {
      await getClient()
        .from('warnings')
        .update({
          title,
          description,
          warning_level: warning.warning_level,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await getClient()
        .from('warnings')
        .insert({
          project_id: warning.project_id,
          task_id: warning.pre_milestone_id,
          warning_type: 'permit_expiry',
          warning_level: warning.warning_level,
          title,
          description,
          is_acknowledged: false,
          created_at: new Date().toISOString(),
        })
    }

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
      .select('id')
      .in('status', ['已完成', '已取消'])

    if (error) throw error

    if (!completedPermits || completedPermits.length === 0) {
      logger.info('No completed permits found')
      return 0
    }

    const { error: deleteError } = await getClient()
      .from('warnings')
      .delete()
      .eq('warning_type', 'permit_expiry')
      .in('task_id', completedPermits.map((permit) => permit.id))

    if (deleteError) throw deleteError

    logger.info(`Cleaned up ${completedPermits.length} expired warnings`)
    return completedPermits.length
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
