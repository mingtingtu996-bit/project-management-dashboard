import { supabase } from './dbService.js'
import { bootstrapTaskCodeRule, bootstrapTaskCodeRuleInTransaction } from './taskCodeRuleService.js'
import { logger } from '../middleware/logger.js'

export interface TaskCodeInput {
  projectId: string
  phaseObjectId?: string | null
  sectionObjectId?: string | null
  buildingObjectId?: string | null
  basementObjectId?: string | null
  floorObjectId?: string | null
  physicalZoneObjectId?: string | null
  functionalAreaObjectId?: string | null
  engineeringObjectId?: string | null
  engineeringCategoryId?: string | null
  standardWorkCode?: string | null
}

export async function generateTaskCode(input: TaskCodeInput): Promise<string> {
  const rule = await bootstrapTaskCodeRule(input.projectId)

  // Resolve project_code
  let projectCode = await ensureProjectCode(input.projectId)

  const fragments: string[] = []
  if (rule.include_project) fragments.push(projectCode)

  // Scope fragments in fixed order: phase -> section -> building -> basement -> floor -> physical zone -> functional area
  const scopeIds: string[] = []
  if (rule.include_phase && input.phaseObjectId) scopeIds.push(input.phaseObjectId)
  if (rule.include_section && input.sectionObjectId) scopeIds.push(input.sectionObjectId)
  if (rule.include_building && input.buildingObjectId) scopeIds.push(input.buildingObjectId)
  if (rule.include_zone && input.basementObjectId) scopeIds.push(input.basementObjectId)
  if (rule.include_floor && input.floorObjectId) scopeIds.push(input.floorObjectId)
  if (rule.include_zone && input.physicalZoneObjectId) scopeIds.push(input.physicalZoneObjectId)
  if (rule.include_zone && input.functionalAreaObjectId) scopeIds.push(input.functionalAreaObjectId)

  if (scopeIds.length > 0) {
    const { data: objs } = await supabase
      .from('engineering_objects')
      .select('id, object_code')
      .in('id', scopeIds)
      .eq('project_id', input.projectId)
    const codeMap = new Map((objs ?? []).map((o: any) => [o.id, o.object_code]))
    for (const sid of scopeIds) {
      const code = codeMap.get(sid)
      if (code) fragments.push(code)
    }
  } else if (rule.include_building && input.engineeringObjectId) {
    // Fallback: use engineering_object_id if no scope dimensions set
    const { data: mainObj } = await supabase
      .from('engineering_objects')
      .select('object_code')
      .eq('id', input.engineeringObjectId)
      .eq('project_id', input.projectId)
      .maybeSingle()
    if (mainObj) fragments.push((mainObj as any).object_code)
  }

  // Work classification fragment
  if (rule.include_work_code) {
    let workCode = input.standardWorkCode
    if (!workCode && input.engineeringCategoryId) {
      const { data: cat } = await supabase
        .from('engineering_categories')
        .select('standard_work_code')
        .eq('id', input.engineeringCategoryId)
        .or(`project_id.eq.${input.projectId},project_id.is.null`)
        .maybeSingle()
      workCode = (cat as any)?.standard_work_code
    }
    if (workCode) fragments.push(workCode)
  }

  const prefix = fragments.join(rule.delimiter || '-')

  // Sequence key: stable hashed key for this encoding domain
  const sequenceKey = buildSequenceKey(input, rule.id)
  const seq = await getNextSequenceValue(input.projectId, rule.id, sequenceKey, rule.sequence_length ?? 3)
  const code = `${prefix}-${seq}`

  return code
}

export function shouldRegenerateTaskCode(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const keyFields = [
    'project_id',
    'engineering_object_id', 'phase_object_id', 'section_object_id',
    'building_object_id', 'basement_object_id', 'floor_object_id',
    'physical_zone_object_id', 'functional_area_object_id',
    'engineering_category_id', 'standard_work_code',
    'wbs_node_type', 'task_code_rule_id',
  ]
  for (const f of keyFields) {
    if (String(before[f] ?? '') !== String(after[f] ?? '')) return true
  }
  // v1.4.4: status reactivation (cancelled/archived → active) triggers regeneration
  const inactiveSet = new Set(['cancelled', 'archived', 'voided', 'deleted', '已取消', '已归档', '已作废', '已删除'])
  const wasInactive = inactiveSet.has(String(before.status ?? '').trim().toLowerCase())
  const isActive = !inactiveSet.has(String(after.status ?? '').trim().toLowerCase())
  if (wasInactive && isActive) return true
  return false
}

export function buildSequenceKey(input: TaskCodeInput, ruleId: string): string {
  // Format per v1.4.22.1: scope is the final seven-type range tree, while work
  // semantics live in engineering_category_id or standard_work_code.
  const parts: string[] = [`project=${input.projectId}`, `rule=${ruleId}`]

  // Scope: fixed order phase->section->building->basement->floor->physical_zone->functional_area.
  const scopeParts: string[] = []
  if (input.phaseObjectId) scopeParts.push(`phase:${input.phaseObjectId}`)
  if (input.sectionObjectId) scopeParts.push(`section:${input.sectionObjectId}`)
  if (input.buildingObjectId) scopeParts.push(`building:${input.buildingObjectId}`)
  if (input.basementObjectId) scopeParts.push(`basement:${input.basementObjectId}`)
  if (input.floorObjectId) scopeParts.push(`floor:${input.floorObjectId}`)
  if (input.physicalZoneObjectId) scopeParts.push(`physical_zone:${input.physicalZoneObjectId}`)
  if (input.functionalAreaObjectId) scopeParts.push(`functional_area:${input.functionalAreaObjectId}`)
  // If no scope dims but main object exists, use it as scope fallback
  if (scopeParts.length === 0 && input.engineeringObjectId) {
    scopeParts.push(`main:${input.engineeringObjectId}`)
  }
  if (scopeParts.length > 0) {
    parts.push(`scope=${scopeParts.join(';')}`)
  }

  const workRef = input.engineeringCategoryId || input.standardWorkCode || ''
  if (workRef) parts.push(`work=${workRef}`)
  return parts.join('|')
}

async function ensureProjectCode(projectId: string): Promise<string> {
  const { data: project } = await supabase
    .from('projects')
    .select('project_code')
    .eq('id', projectId)
    .maybeSingle()

  if ((project as any)?.project_code) return (project as any).project_code

  // Generate project code using sequence
  for (let attempt = 0; attempt < 3; attempt++) {
    let rawSeq: unknown = null
    try {
      const { data } = await supabase.rpc('nextval', { seq_name: 'project_code_seq' }).maybeSingle()
      rawSeq = data
    } catch {
      rawSeq = null
    }
    const nextVal = rawSeq ? Number((rawSeq as any)?.nextval ?? attempt + 1) : (attempt + 1)
    const code = `PRJ${String(nextVal).padStart(3, '0')}`
    const { error } = await supabase
      .from('projects')
      .update({ project_code: code, project_code_generated_at: new Date().toISOString() })
      .eq('id', projectId)
      .is('project_code', null)
    if (!error) return code
  }
  throw Object.assign(new Error('Failed to generate project code'), { code: 'PROJECT_CODE_CONFLICT', statusCode: 500 })
}

async function getNextSequenceValue(projectId: string, ruleId: string, sequenceKey: string, seqLength: number): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, error } = await supabase.rpc('increment_task_code_sequence', {
        p_project_id: projectId,
        p_rule_id: ruleId,
        p_sequence_key: sequenceKey,
        p_seq_length: seqLength,
      })
      if (!error && data) return String(data)
      logger.warn('Sequence RPC conflict, retrying', { projectId, ruleId, sequenceKey, attempt, error: error?.message })
    } catch (err: any) {
      logger.warn('Sequence RPC error, retrying', { projectId, ruleId, sequenceKey, attempt, error: err.message })
    }
  }
  throw Object.assign(new Error('Failed to generate task code sequence'), { code: 'TASK_CODE_CONFLICT', statusCode: 500 })
}

// ============================================================
// In-transaction variants for v1.4.4 write chain
// ============================================================

export async function generateTaskCodeInTransaction(client: any, input: TaskCodeInput): Promise<string> {
  const rule = await bootstrapTaskCodeRuleInTransaction(client, input.projectId)
  let projectCode = await ensureProjectCodeInTransaction(client, input.projectId)
  const fragments: string[] = []
  if (rule.include_project) fragments.push(projectCode)

  const scopeIds: string[] = []
  if (rule.include_phase && input.phaseObjectId) scopeIds.push(input.phaseObjectId)
  if (rule.include_section && input.sectionObjectId) scopeIds.push(input.sectionObjectId)
  if (rule.include_building && input.buildingObjectId) scopeIds.push(input.buildingObjectId)
  if (rule.include_zone && input.basementObjectId) scopeIds.push(input.basementObjectId)
  if (rule.include_floor && input.floorObjectId) scopeIds.push(input.floorObjectId)
  if (rule.include_zone && input.physicalZoneObjectId) scopeIds.push(input.physicalZoneObjectId)
  if (rule.include_zone && input.functionalAreaObjectId) scopeIds.push(input.functionalAreaObjectId)

  if (scopeIds.length > 0) {
    const { rows } = await client.query(
      `SELECT id, object_code FROM engineering_objects WHERE id = ANY($1) AND project_id = $2`,
      [scopeIds, input.projectId],
    )
    const codeMap = new Map((rows as any[]).map((o: any) => [o.id, o.object_code]))
    for (const sid of scopeIds) { const c = codeMap.get(sid); if (c) fragments.push(c) }
  } else if (rule.include_building && input.engineeringObjectId) {
    const { rows } = await client.query(
      `SELECT object_code FROM engineering_objects WHERE id = $1 AND project_id = $2`,
      [input.engineeringObjectId, input.projectId],
    )
    if (rows[0]) fragments.push((rows[0] as any).object_code)
  }
  if (rule.include_work_code) {
    let workCode = input.standardWorkCode
    if (!workCode && input.engineeringCategoryId) {
      const { rows } = await client.query(
        `SELECT standard_work_code FROM engineering_categories WHERE id = $1 AND (project_id = $2 OR project_id IS NULL)`,
        [input.engineeringCategoryId, input.projectId],
      )
      if (rows[0]) workCode = (rows[0] as any).standard_work_code
    }
    if (workCode) fragments.push(workCode)
  }

  const prefix = fragments.join(rule.delimiter || '-')
  const sequenceKey = buildSequenceKey(input, rule.id)
  const seq = await getNextSequenceValueInTransaction(client, input.projectId, rule.id, sequenceKey, rule.sequence_length ?? 3)
  return `${prefix}-${seq}`
}

export async function ensureProjectCodeInTransaction(client: any, projectId: string): Promise<string> {
  const { rows } = await client.query('SELECT project_code FROM projects WHERE id = $1', [projectId])
  if (rows[0]?.project_code) return rows[0].project_code
  for (let attempt = 0; attempt < 3; attempt++) {
    const { rows: seqRows } = await client.query("SELECT nextval('project_code_seq') as val")
    const nextVal = Number(seqRows[0]?.val ?? attempt + 1)
    const code = `PRJ${String(nextVal).padStart(3, '0')}`
    const { rowCount } = await client.query(
      'UPDATE projects SET project_code = $1, project_code_generated_at = NOW() WHERE id = $2 AND project_code IS NULL',
      [code, projectId],
    )
    if (rowCount > 0) return code

    const { rows: latestRows } = await client.query('SELECT project_code FROM projects WHERE id = $1', [projectId])
    if (!latestRows[0]) {
      throw Object.assign(new Error('Project no longer exists while generating project code'), {
        code: 'PROJECT_NOT_FOUND',
        statusCode: 404,
      })
    }
    if (latestRows[0]?.project_code) return latestRows[0].project_code
  }
  throw Object.assign(new Error('Failed to generate project code'), { code: 'PROJECT_CODE_CONFLICT', statusCode: 500 })
}

async function getNextSequenceValueInTransaction(client: any, projectId: string, ruleId: string, sequenceKey: string, seqLength: number): Promise<string> {
  await client.query(
    `INSERT INTO task_code_sequences (project_id, rule_id, sequence_key, current_value)
     VALUES ($1, $2, $3, 0) ON CONFLICT (project_id, rule_id, sequence_key) DO NOTHING`,
    [projectId, ruleId, sequenceKey],
  )
  const { rows } = await client.query(
    `SELECT current_value FROM task_code_sequences
     WHERE project_id = $1 AND rule_id = $2 AND sequence_key = $3 FOR UPDATE`,
    [projectId, ruleId, sequenceKey],
  )
  const nextVal = Number(rows[0]?.current_value ?? 0) + 1
  await client.query(
    `UPDATE task_code_sequences SET current_value = $1, updated_at = NOW()
     WHERE project_id = $2 AND rule_id = $3 AND sequence_key = $4`,
    [nextVal, projectId, ruleId, sequenceKey],
  )
  return String(nextVal).padStart(seqLength, '0')
}
