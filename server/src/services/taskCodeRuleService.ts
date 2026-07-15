import { supabase } from './dbService.js'

export async function getProjectTaskCodeRule(projectId: string) {
  const { data } = await supabase
    .from('project_task_code_rules')
    .select('*')
    .eq('project_id', projectId)
    .eq('enabled', true)
    .maybeSingle()
  return (data ?? null) as Record<string, any> | null
}

export async function bootstrapTaskCodeRule(projectId: string) {
  const existing = await getProjectTaskCodeRule(projectId)
  if (existing) return existing

  const { data, error } = await supabase
    .from('project_task_code_rules')
    .insert({
      project_id: projectId,
      rule_name: '默认任务编码规则',
      rule_version: 'v1',
      delimiter: '-',
      sequence_length: 3,
      include_project: true,
      include_phase: true,
      include_section: true,
      include_building: true,
      include_floor: true,
      include_zone: true,
      include_professional: false,
      include_work_code: true,
      enabled: true,
      metadata: {},
    })
    .select('*')
    .single()

  if (error) throw new Error(`Failed to bootstrap task code rule: ${error.message}`)
  return data
}

export async function bootstrapTaskCodeRuleInTransaction(client: any, projectId: string) {
  const { rows } = await client.query(
    'SELECT * FROM project_task_code_rules WHERE project_id = $1 AND enabled = true',
    [projectId],
  )
  if (rows[0]) return rows[0]

  const { rows: inserted } = await client.query(
    `INSERT INTO project_task_code_rules (project_id, rule_name, rule_version, delimiter, sequence_length,
      include_project, include_phase, include_section, include_building, include_floor, include_zone,
      include_professional, include_work_code, enabled, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
    [projectId, '默认任务编码规则', 'v1', '-', 3, true, true, true, true, true, true, false, true, true, '{}'],
  )
  return inserted[0]
}
