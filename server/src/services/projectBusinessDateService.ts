import { toBusinessDateKey } from '../utils/businessDate.js'

export const DEFAULT_PROJECT_BUSINESS_TIME_ZONE = 'Asia/Shanghai'

export type ProjectBusinessDateRow = {
  id?: string | null
  metadata?: unknown
}

export type ProjectBusinessDateBucket = {
  businessDate: string
  projectIds: string[]
}

type ProjectBusinessDateQueryClient = {
  from: (table: string) => any
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {}
    } catch {
      return {}
    }
  }
  return {}
}

export function isValidProjectBusinessTimeZone(value: unknown): value is string {
  const timezone = String(value ?? '').trim()
  if (!timezone) return false
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function readProjectBusinessTimeZone(metadata: unknown): string | null {
  const record = readRecord(metadata)
  const candidate = record.business_timezone
    ?? record.businessTimezone
    ?? record.construction_calendar_timezone
    ?? record.constructionCalendarTimezone
    ?? record.timezone
  const timezone = String(candidate ?? '').trim()
  return isValidProjectBusinessTimeZone(timezone) ? timezone : null
}

export function resolveProjectBusinessTimeZone(
  metadata: unknown,
  fallback = DEFAULT_PROJECT_BUSINESS_TIME_ZONE,
): string {
  return readProjectBusinessTimeZone(metadata)
    ?? (isValidProjectBusinessTimeZone(fallback) ? fallback : DEFAULT_PROJECT_BUSINESS_TIME_ZONE)
}

export function projectBusinessDateKey(
  metadata: unknown,
  now = new Date(),
  fallback = DEFAULT_PROJECT_BUSINESS_TIME_ZONE,
): string {
  return toBusinessDateKey(now, resolveProjectBusinessTimeZone(metadata, fallback))
}

export function groupProjectIdsByBusinessDate(
  projects: ProjectBusinessDateRow[],
  now = new Date(),
  fallback = DEFAULT_PROJECT_BUSINESS_TIME_ZONE,
): ProjectBusinessDateBucket[] {
  const buckets = new Map<string, string[]>()
  for (const project of projects) {
    const projectId = String(project.id ?? '').trim()
    if (!projectId) continue
    const businessDate = projectBusinessDateKey(project.metadata, now, fallback)
    const ids = buckets.get(businessDate) ?? []
    ids.push(projectId)
    buckets.set(businessDate, ids)
  }
  return [...buckets.entries()].map(([businessDate, projectIds]) => ({ businessDate, projectIds }))
}

export async function resolveProjectBusinessDateBuckets(
  queryClient: ProjectBusinessDateQueryClient,
  projectId: string | undefined,
  now = new Date(),
): Promise<ProjectBusinessDateBucket[]> {
  let query = queryClient
    .from('projects')
    .select('id, metadata')
  if (projectId) query = query.eq('id', projectId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  const buckets = groupProjectIdsByBusinessDate((data ?? []) as ProjectBusinessDateRow[], now)
  if (buckets.length > 0) return buckets

  return [{
    businessDate: projectBusinessDateKey(null, now),
    projectIds: projectId ? [projectId] : [],
  }]
}
