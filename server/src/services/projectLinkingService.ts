// v1.4.11: Project entity linkage service.
// Manages relationships between drawings, certificates, acceptance plans
// and tasks, conditions, acceptance requirements.

import { executeSQL, supabase } from './dbService.js'

export type ProjectEntityLinkRole = 'source' | 'target'

export interface ProjectEntityLinkRow {
  id: string
  project_id: string
  source_entity_type: string
  source_entity_id: string
  target_entity_type: string
  target_entity_id: string
  relation_type: string
  relation_strength: string
  status: string
}

export interface EntityLinkInput {
  projectId: string
  sourceEntityType: 'drawing_package' | 'construction_drawing' | 'pre_milestone' | 'certificate_work_item' | 'acceptance_plan'
  sourceEntityId: string
  targetEntityType: 'task' | 'task_condition' | 'acceptance_requirement' | 'pre_milestone' | 'certificate_work_item'
  targetEntityId: string
  relationType: 'satisfies_condition' | 'satisfies_acceptance_requirement' | 'covers_task' | 'references_certificate' | 'blocks_task_start'
  relationStrength?: 'explicit' | 'system_inferred' | 'legacy_mapped'
  displaySnapshot?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

const PROJECT_ENTITY_LINK_COLUMNS = `
  id,
  project_id,
  source_entity_type,
  source_entity_id,
  target_entity_type,
  target_entity_id,
  relation_type,
  relation_strength,
  status
`

function dedupeLinks(rows: ProjectEntityLinkRow[]) {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (!row.id || seen.has(row.id)) return false
    seen.add(row.id)
    return true
  })
}

export async function listActiveEntityLinksForEntity(params: {
  projectId: string
  entityType: string
  entityId: string
  roles?: ProjectEntityLinkRole[]
}): Promise<ProjectEntityLinkRow[]> {
  const roles = params.roles ?? ['source', 'target']
  const rows: ProjectEntityLinkRow[] = []

  if (roles.includes('source')) {
    rows.push(...await executeSQL<ProjectEntityLinkRow>(
      `SELECT ${PROJECT_ENTITY_LINK_COLUMNS}
         FROM project_entity_links
        WHERE project_id = ?
          AND source_entity_type = ?
          AND source_entity_id = ?
          AND status = 'active'`,
      [params.projectId, params.entityType, params.entityId],
    ))
  }

  if (roles.includes('target')) {
    rows.push(...await executeSQL<ProjectEntityLinkRow>(
      `SELECT ${PROJECT_ENTITY_LINK_COLUMNS}
         FROM project_entity_links
        WHERE project_id = ?
          AND target_entity_type = ?
          AND target_entity_id = ?
          AND status = 'active'`,
      [params.projectId, params.entityType, params.entityId],
    ))
  }

  return dedupeLinks(rows)
}

export async function deactivateEntityLinksForEntity(params: {
  projectId: string
  entityType: string
  entityId: string
  roles?: ProjectEntityLinkRole[]
}): Promise<number> {
  const roles = params.roles ?? ['source', 'target']
  let affected = 0

  if (roles.includes('source')) {
    const result = await executeSQL(
      `UPDATE project_entity_links
          SET status = 'inactive', updated_at = NOW()
        WHERE project_id = ?
          AND source_entity_type = ?
          AND source_entity_id = ?
          AND status = 'active'`,
      [params.projectId, params.entityType, params.entityId],
    )
    affected += Array.isArray(result) ? result.length : 0
  }

  if (roles.includes('target')) {
    const result = await executeSQL(
      `UPDATE project_entity_links
          SET status = 'inactive', updated_at = NOW()
        WHERE project_id = ?
          AND target_entity_type = ?
          AND target_entity_id = ?
          AND status = 'active'`,
      [params.projectId, params.entityType, params.entityId],
    )
    affected += Array.isArray(result) ? result.length : 0
  }

  return affected
}

export async function linkEntities(input: EntityLinkInput): Promise<string> {
  // Upsert: deactivate old link with same key, insert new
  await supabase.from('project_entity_links')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('project_id', input.projectId)
    .eq('source_entity_type', input.sourceEntityType)
    .eq('source_entity_id', input.sourceEntityId)
    .eq('target_entity_type', input.targetEntityType)
    .eq('target_entity_id', input.targetEntityId)
    .eq('relation_type', input.relationType)
    .eq('status', 'active')

  const { data, error } = await supabase.from('project_entity_links').insert({
    project_id: input.projectId,
    source_entity_type: input.sourceEntityType,
    source_entity_id: input.sourceEntityId,
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId,
    relation_type: input.relationType,
    relation_strength: input.relationStrength ?? 'explicit',
    status: 'active',
    display_snapshot: input.displaySnapshot ?? {},
    metadata: input.metadata ?? {},
  }).select('id').single()

  if (error) throw new Error(`Failed to link entities: ${error.message}`)
  return (data as any).id
}

export async function unlinkEntities(projectId: string, id: string): Promise<void> {
  await supabase.from('project_entity_links')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('project_id', projectId)
}

export async function getLinkedTargets(
  projectId: string,
  sourceType: string, sourceId: string,
) {
  const { data } = await supabase.from('project_entity_links')
    .select('*').eq('project_id', projectId)
    .eq('source_entity_type', sourceType).eq('source_entity_id', sourceId)
    .eq('status', 'active')
  return data ?? []
}

export async function getSourceLinkages(
  projectId: string,
  targetType: string, targetId: string,
) {
  const { data } = await supabase.from('project_entity_links')
    .select('*').eq('project_id', projectId)
    .eq('target_entity_type', targetType).eq('target_entity_id', targetId)
    .eq('status', 'active')
  return data ?? []
}

export async function autoSatisfyConditionsViaLinkage(
  projectId: string, sourceType: string, sourceId: string,
) {
  const links = await getLinkedTargets(projectId, sourceType, sourceId)
  const now = new Date().toISOString()
  for (const link of links ?? []) {
    const l = link as any
    if (!['explicit', 'legacy_mapped'].includes(String(l.relation_strength ?? 'explicit'))) {
      continue
    }
    if (l.target_entity_type === 'task_condition' && l.relation_type === 'satisfies_condition') {
      await supabase.from('task_conditions')
        .update({
          is_satisfied: true,
          satisfied_reason: `linked_${sourceType}_ready`,
          requires_review: true,
          review_reason: `linked_${sourceType}_auto_satisfied`,
          review_source_entity_type: sourceType,
          review_source_entity_id: sourceId,
          review_requested_at: now,
          updated_at: now,
        })
        .eq('id', l.target_entity_id)
        .eq('project_id', projectId)
    }
    if (l.target_entity_type === 'acceptance_requirement' && l.relation_type === 'satisfies_acceptance_requirement') {
      await supabase.from('acceptance_requirements')
        .update({
          is_satisfied: true,
          status: 'met',
          requires_review: true,
          review_reason: `linked_${sourceType}_auto_satisfied`,
          review_source_entity_type: sourceType,
          review_source_entity_id: sourceId,
          review_requested_at: now,
          updated_at: now,
        })
        .eq('id', l.target_entity_id)
        .eq('project_id', projectId)
    }
  }
}

export async function linkEntityInTransaction(client: any, input: EntityLinkInput): Promise<string> {
  // Deactivate old
  await client.query(
    `UPDATE project_entity_links SET status = 'inactive', updated_at = NOW()
     WHERE project_id = $1 AND source_entity_type = $2 AND source_entity_id = $3
       AND target_entity_type = $4 AND target_entity_id = $5 AND relation_type = $6 AND status = 'active'`,
    [input.projectId, input.sourceEntityType, input.sourceEntityId, input.targetEntityType, input.targetEntityId, input.relationType],
  )
  // Insert new
  const { rows } = await client.query(
    `INSERT INTO project_entity_links (project_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type, relation_strength, status, display_snapshot, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, $9) RETURNING id`,
    [input.projectId, input.sourceEntityType, input.sourceEntityId, input.targetEntityType, input.targetEntityId, input.relationType, input.relationStrength ?? 'explicit', JSON.stringify(input.displaySnapshot ?? {}), JSON.stringify(input.metadata ?? {})],
  )
  return (rows[0] as any).id
}
