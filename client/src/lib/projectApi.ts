import { apiGet } from '@/lib/apiClient'
import type { Project } from '@/lib/supabase'

export type ProjectSource = Partial<Project> & {
  id: string
  name?: string
}

export type ProjectCatalogItem = Project & {
  id: string
  name: string
  description: string
  status: string
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined
  return String(value)
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function normalizeProjectStatus(status?: string | null): string {
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

export function normalizeApiProject(project: ProjectSource): ProjectCatalogItem {
  return {
    id: project.id,
    name: project.name || '项目',
    description: optionalString(project.description) ?? '',
    status: normalizeProjectStatus(project.status),
    location: optionalString(project.location),
    start_date: optionalString(project.start_date),
    end_date: optionalString(project.end_date),
    owner_id: optionalString(project.owner_id),
    created_at: optionalString(project.created_at),
    updated_at: optionalString(project.updated_at),
    version: optionalNumber(project.version),
    primary_invitation_code: optionalString(project.primary_invitation_code),
    created_by: optionalString(project.created_by),
    project_type: optionalString(project.project_type),
    building_type: optionalString(project.building_type),
    structure_type: optionalString(project.structure_type),
    building_count: optionalNumber(project.building_count),
    above_ground_floors: optionalNumber(project.above_ground_floors),
    underground_floors: optionalNumber(project.underground_floors),
    support_method: optionalString(project.support_method),
    total_area: optionalNumber(project.total_area),
    planned_start_date: optionalString(project.planned_start_date),
    planned_end_date: optionalString(project.planned_end_date),
    actual_start_date: optionalString(project.actual_start_date),
    actual_end_date: optionalString(project.actual_end_date),
    total_investment: optionalNumber(project.total_investment),
    health_score: optionalNumber(project.health_score),
    health_status: optionalString(project.health_status),
    current_phase: optionalString(project.current_phase),
    metadata: optionalRecord(project.metadata),
  }
}

export async function fetchProjectsFromApi(): Promise<ProjectCatalogItem[]> {
  const projects = await apiGet<ProjectSource[]>('/api/projects')
  return projects.map(normalizeApiProject)
}
