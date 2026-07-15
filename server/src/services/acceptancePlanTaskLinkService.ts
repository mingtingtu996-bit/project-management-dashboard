import { supabase } from './dbService.js'

function normalizeIds(ids: readonly string[]) {
  return [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))]
}

export async function listAcceptancePlanIdsCoveringTask(projectId: string, taskId: string) {
  const normalizedProjectId = String(projectId ?? '').trim()
  const normalizedTaskId = String(taskId ?? '').trim()
  if (!normalizedProjectId || !normalizedTaskId) return []

  const { data, error } = await supabase
    .from('project_entity_links')
    .select('source_entity_id')
    .eq('project_id', normalizedProjectId)
    .eq('source_entity_type', 'acceptance_plan')
    .eq('target_entity_type', 'task')
    .eq('target_entity_id', normalizedTaskId)
    .eq('relation_type', 'covers_task')
    .eq('status', 'active')

  if (error) throw error
  return normalizeIds((data ?? []).map((link: any) => String(link.source_entity_id ?? '')))
}

export async function loadCoveredTaskIdsByAcceptancePlanIds(
  acceptancePlanIds: readonly string[],
  projectId?: string,
) {
  const normalizedPlanIds = normalizeIds(acceptancePlanIds)
  const coveredTaskIdsByPlanId = new Map<string, string[]>()
  if (normalizedPlanIds.length === 0) return coveredTaskIdsByPlanId

  let query = supabase
    .from('project_entity_links')
    .select('source_entity_id, target_entity_id')
    .eq('source_entity_type', 'acceptance_plan')
    .in('source_entity_id', normalizedPlanIds)
    .eq('target_entity_type', 'task')
    .eq('relation_type', 'covers_task')
    .eq('status', 'active')

  const normalizedProjectId = String(projectId ?? '').trim()
  if (normalizedProjectId) query = query.eq('project_id', normalizedProjectId)

  const { data, error } = await query
  if (error) throw error

  for (const link of data ?? []) {
    const planId = String((link as any).source_entity_id ?? '').trim()
    const taskId = String((link as any).target_entity_id ?? '').trim()
    if (!planId || !taskId) continue
    const taskIds = coveredTaskIdsByPlanId.get(planId) ?? []
    if (!taskIds.includes(taskId)) taskIds.push(taskId)
    coveredTaskIdsByPlanId.set(planId, taskIds)
  }

  return coveredTaskIdsByPlanId
}
