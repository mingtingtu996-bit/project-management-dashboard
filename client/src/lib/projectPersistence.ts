import { apiGet } from '@/lib/apiClient'
import type { Project as LocalProject } from '@/lib/localDb'
import { projectDb } from '@/lib/localDb'
import type { Project as ApiProject } from '@/lib/supabase'

type ProjectSource = Partial<ApiProject> & {
  id: string
  name?: string
}

const LEGACY_SEED_PREFIX = 'aaaaaaaa'

const toOptionalString = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  return String(value)
}

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const normalizeProjectStatus = (
  status?: string | null,
): LocalProject['status'] => {
  switch (status) {
    case '已完成':
    case 'completed':
      return 'completed'
    case '已暂停':
    case 'archived':
      return 'archived'
    default:
      return 'active'
  }
}

export const toPersistedProject = (project: ProjectSource): LocalProject => {
  const now = new Date().toISOString()

  return {
    id: project.id,
    name: project.name || '未命名项目',
    description: toOptionalString(project.description) ?? '',
    status: normalizeProjectStatus(project.status),
    start_date: toOptionalString(project.start_date),
    end_date: toOptionalString(project.end_date),
    owner_id: toOptionalString(project.owner_id),
    created_at: toOptionalString(project.created_at) ?? now,
    updated_at: toOptionalString(project.updated_at) ?? now,
    version: toOptionalNumber(project.version),
    primary_invitation_code: toOptionalString(project.primary_invitation_code),
    created_by: toOptionalString(project.created_by),
    project_type: toOptionalString(project.project_type),
    building_type: toOptionalString(project.building_type),
    structure_type: toOptionalString(project.structure_type),
    building_count: toOptionalNumber(project.building_count),
    above_ground_floors: toOptionalNumber(project.above_ground_floors),
    underground_floors: toOptionalNumber(project.underground_floors),
    support_method: toOptionalString(project.support_method),
    total_area: toOptionalNumber(project.total_area),
    planned_start_date: toOptionalString(project.planned_start_date),
    planned_end_date: toOptionalString(project.planned_end_date),
    actual_start_date: toOptionalString(project.actual_start_date),
    actual_end_date: toOptionalString(project.actual_end_date),
    total_investment: toOptionalNumber(project.total_investment),
    health_score: toOptionalNumber(project.health_score),
    health_status: toOptionalString(project.health_status),
  }
}

function removeLegacySeedProjects(projects: LocalProject[]): LocalProject[] {
  return projects.filter((project) => !project.id.startsWith(LEGACY_SEED_PREFIX))
}

export function getCachedProjects(): LocalProject[] {
  const cachedProjects = removeLegacySeedProjects(projectDb.getAll())
  if (cachedProjects.length !== projectDb.getAll().length) {
    projectDb.replaceAll(cachedProjects)
  }
  return cachedProjects
}

export async function syncProjectCacheFromApi(options: { allowEmptyReplace?: boolean } = {}): Promise<LocalProject[]> {
  const cachedProjects = getCachedProjects()
  const apiProjects = await apiGet<ProjectSource[]>('/api/projects')
  const persistedProjects = removeLegacySeedProjects(apiProjects.map(toPersistedProject))

  if (!options.allowEmptyReplace && persistedProjects.length === 0 && cachedProjects.length > 0) {
    return cachedProjects
  }

  projectDb.replaceAll(persistedProjects)
  return persistedProjects
}
