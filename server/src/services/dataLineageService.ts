// v1.4.6: Data lineage write service.
// Records source-to-target mapping in the same write path as business changes.

import { randomUUID } from 'crypto'
import { query as rawQuery } from '../database.js'
import { supabase } from './dbService.js'

const LINEAGE_BATCH_INSERT_CHUNK_SIZE = 200

export interface LineageLinkInput {
  projectId: string
  sourceEntityType: string
  sourceEntityId: string
  relationType: string
  targetEntityType: string
  targetEntityId: string
  batchRef?: string
  mappingStatus?: string
  confidence?: number
  metadata?: Record<string, unknown>
}

type LineageEntityType = {
  entity_type: string
  table_name?: string | null
  id_column?: string | null
  project_id_column?: string | null
  is_project_scoped?: boolean | null
  is_global_reference?: boolean | null
  is_business_lineage_allowed?: boolean | null
}

type LineageRecordCheckResult = { rows: Array<{ project_id?: string | null }> }
type LineageRecordCheckExec = (sql: string, params: unknown[]) => Promise<LineageRecordCheckResult>
type LineageRecordCheck = (exec: LineageRecordCheckExec, entityId: string) => Promise<LineageRecordCheckResult>

function recordCheck(sql: string): LineageRecordCheck {
  return (exec, entityId) => exec(sql, [entityId])
}

const LINEAGE_ENTITY_RECORD_CHECKS: Record<string, LineageRecordCheck> = {
  acceptance_catalog: recordCheck('SELECT project_id::text AS project_id FROM public.acceptance_catalog WHERE id::text = $1 LIMIT 1'),
  acceptance_dependency: recordCheck('SELECT project_id::text AS project_id FROM public.acceptance_dependencies WHERE id::text = $1 LIMIT 1'),
  acceptance_plan: recordCheck('SELECT project_id::text AS project_id FROM public.acceptance_plans WHERE id::text = $1 LIMIT 1'),
  acceptance_requirement: recordCheck('SELECT project_id::text AS project_id FROM public.acceptance_requirements WHERE id::text = $1 LIMIT 1'),
  certificate: recordCheck('SELECT project_id::text AS project_id FROM public.pre_milestones WHERE id::text = $1 LIMIT 1'),
  certificate_dependency: recordCheck('SELECT project_id::text AS project_id FROM public.certificate_dependencies WHERE id::text = $1 LIMIT 1'),
  construction_drawing: recordCheck('SELECT project_id::text AS project_id FROM public.construction_drawings WHERE id::text = $1 LIMIT 1'),
  drawing_version: recordCheck('SELECT project_id::text AS project_id FROM public.drawing_versions WHERE id::text = $1 LIMIT 1'),
  issue: recordCheck('SELECT project_id::text AS project_id FROM public.issues WHERE id::text = $1 LIMIT 1'),
  project_material: recordCheck('SELECT project_id::text AS project_id FROM public.project_materials WHERE id::text = $1 LIMIT 1'),
  risk: recordCheck('SELECT project_id::text AS project_id FROM public.risks WHERE id::text = $1 LIMIT 1'),
  task: recordCheck('SELECT project_id::text AS project_id FROM public.tasks WHERE id::text = $1 LIMIT 1'),
  task_baseline_item: recordCheck('SELECT project_id::text AS project_id FROM public.task_baseline_items WHERE id::text = $1 LIMIT 1'),
  task_condition: recordCheck('SELECT project_id::text AS project_id FROM public.task_conditions WHERE id::text = $1 LIMIT 1'),
  task_dependency: recordCheck('SELECT project_id::text AS project_id FROM public.task_dependencies WHERE id::text = $1 LIMIT 1'),
  task_obstacle: recordCheck('SELECT project_id::text AS project_id FROM public.task_obstacles WHERE id::text = $1 LIMIT 1'),
  warning: recordCheck("SELECT project_id::text AS project_id FROM public.notifications WHERE source_entity_type = 'warning' AND id::text = $1 LIMIT 1"),
  wbs_template: recordCheck('SELECT id::text AS id FROM public.wbs_templates WHERE id::text = $1 LIMIT 1'),
}

function normalizeLineageStatus(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return normalized || 'active'
}

function entityRequiresProjectCheck(entity: LineageEntityType) {
  return entity.is_project_scoped !== false && entity.is_global_reference !== true
}

function assertBusinessLineageAllowed(entity: LineageEntityType, role: 'source' | 'target') {
  if (entity.is_business_lineage_allowed === false) {
    throw new Error(`Lineage ${role} entity type is not business-lineage writable: ${entity.entity_type}`)
  }
}

// workspace-isolation-global-read-approved: lineage entity types are a read-only system registry; record-level writes are separately project checked.
async function loadEntityType(entityType: string): Promise<LineageEntityType> {
  const { data, error } = await supabase
    .from('data_lineage_entity_types')
    .select('entity_type, table_name, id_column, project_id_column, is_project_scoped, is_global_reference, is_business_lineage_allowed')
    .eq('entity_type', entityType)
    .maybeSingle()

  if (error) throw new Error(`Failed to read lineage entity type ${entityType}: ${error.message}`)
  if (!data) throw new Error(`Unknown lineage entity type: ${entityType}`)
  return data as LineageEntityType
}

// workspace-isolation-global-read-approved: transaction-local lookup reads the same system lineage registry.
async function loadEntityTypeInTransaction(client: any, entityType: string): Promise<LineageEntityType> {
  const { rows } = await client.query(
    `SELECT entity_type, table_name, id_column, project_id_column, is_project_scoped, is_global_reference, is_business_lineage_allowed
       FROM data_lineage_entity_types
      WHERE entity_type = $1`,
    [entityType],
  )
  if (!rows[0]) throw new Error(`Unknown lineage entity type: ${entityType}`)
  return rows[0] as LineageEntityType
}

async function assertEntityRecordExists(entity: LineageEntityType, entityId: string, projectId: string) {
  if (!entity.table_name) return

  const check = LINEAGE_ENTITY_RECORD_CHECKS[entity.entity_type]
  if (!check) throw new Error(`Unsupported lineage entity record check: ${entity.entity_type}`)

  const result = await check(rawQuery, entityId)
  const row = result.rows[0] as { project_id?: string | null } | undefined
  if (!row) throw new Error(`Lineage entity record not found: ${entity.entity_type}:${entityId}`)
  if (entityRequiresProjectCheck(entity) && String(row.project_id ?? '') !== projectId) {
    throw new Error(`Lineage entity ${entity.entity_type}:${entityId} belongs to different project`)
  }
}

async function assertEntityRecordExistsInTransaction(client: any, entity: LineageEntityType, entityId: string, projectId: string) {
  if (!entity.table_name) return

  const check = LINEAGE_ENTITY_RECORD_CHECKS[entity.entity_type]
  if (!check) throw new Error(`Unsupported lineage entity record check: ${entity.entity_type}`)

  const { rows } = await check((sql, params) => client.query(sql, params), entityId)
  const row = rows[0] as { project_id?: string | null } | undefined
  if (!row) throw new Error(`Lineage entity record not found: ${entity.entity_type}:${entityId}`)
  if (entityRequiresProjectCheck(entity) && String(row.project_id ?? '') !== projectId) {
    throw new Error(`Lineage entity ${entity.entity_type}:${entityId} belongs to different project`)
  }
}

async function validateLineageWrite(input: LineageLinkInput) {
  const [sourceEntity, targetEntity] = await Promise.all([
    loadEntityType(input.sourceEntityType),
    loadEntityType(input.targetEntityType),
  ])

  assertBusinessLineageAllowed(sourceEntity, 'source')
  assertBusinessLineageAllowed(targetEntity, 'target')

  const { data: rule, error: ruleError } = await supabase.from('data_lineage_relation_rules')
    .select('id')
    .eq('source_entity_type', input.sourceEntityType)
    .eq('relation_type', input.relationType)
    .eq('target_entity_type', input.targetEntityType)
    .eq('is_active', true)
    .maybeSingle()
  if (ruleError) throw new Error(`Failed to validate lineage relation: ${ruleError.message}`)
  if (!rule) throw new Error(`Lineage relation not allowed: ${input.sourceEntityType} --${input.relationType}--> ${input.targetEntityType}`)

  await Promise.all([
    assertEntityRecordExists(sourceEntity, input.sourceEntityId, input.projectId),
    assertEntityRecordExists(targetEntity, input.targetEntityId, input.projectId),
  ])
}

async function validateLineageWriteInTransaction(client: any, input: LineageLinkInput) {
  const [sourceEntity, targetEntity] = await Promise.all([
    loadEntityTypeInTransaction(client, input.sourceEntityType),
    loadEntityTypeInTransaction(client, input.targetEntityType),
  ])

  assertBusinessLineageAllowed(sourceEntity, 'source')
  assertBusinessLineageAllowed(targetEntity, 'target')

  const { rows: rule } = await client.query(
    'SELECT 1 FROM data_lineage_relation_rules WHERE source_entity_type = $1 AND relation_type = $2 AND target_entity_type = $3 AND is_active = true',
    [input.sourceEntityType, input.relationType, input.targetEntityType],
  )
  if (!rule[0]) throw new Error(`Lineage relation not allowed: ${input.sourceEntityType} --${input.relationType}--> ${input.targetEntityType}`)

  await assertEntityRecordExistsInTransaction(client, sourceEntity, input.sourceEntityId, input.projectId)
  await assertEntityRecordExistsInTransaction(client, targetEntity, input.targetEntityId, input.projectId)
}

async function validateLineageBatchWriteInTransaction(client: any, links: LineageLinkInput[]) {
  const signatures = new Set<string>()
  for (const link of links) {
    signatures.add(`${link.sourceEntityType}\u0000${link.relationType}\u0000${link.targetEntityType}`)
  }

  for (const signature of signatures) {
    const [sourceEntityType, relationType, targetEntityType] = signature.split('\u0000')
    const [sourceEntity, targetEntity] = await Promise.all([
      loadEntityTypeInTransaction(client, sourceEntityType),
      loadEntityTypeInTransaction(client, targetEntityType),
    ])

    assertBusinessLineageAllowed(sourceEntity, 'source')
    assertBusinessLineageAllowed(targetEntity, 'target')

    const { rows: rule } = await client.query(
      'SELECT 1 FROM data_lineage_relation_rules WHERE source_entity_type = $1 AND relation_type = $2 AND target_entity_type = $3 AND is_active = true',
      [sourceEntityType, relationType, targetEntityType],
    )
    if (!rule[0]) throw new Error(`Lineage relation not allowed: ${sourceEntityType} --${relationType}--> ${targetEntityType}`)
  }

  const taskTargetIds = links
    .filter((link) => link.targetEntityType === 'task')
    .map((link) => String(link.targetEntityId ?? '').trim())
    .filter(Boolean)
  if (taskTargetIds.length > 0) {
    const projectIds = [...new Set(links.map((link) => String(link.projectId ?? '').trim()).filter(Boolean))]
    if (projectIds.length !== 1) {
      throw new Error('Lineage batch must be scoped to exactly one project')
    }
    const { rows } = await client.query(
      `SELECT id::text AS id FROM public.tasks WHERE project_id = $1 AND id::text = ANY($2::text[])`,
      [projectIds[0], taskTargetIds],
    )
    const existingIds = new Set((rows as Array<{ id?: string | null }>).map((row) => String(row.id ?? '').trim()).filter(Boolean))
    const missingId = taskTargetIds.find((id) => !existingIds.has(id))
    if (missingId) throw new Error(`Lineage entity record not found: task:${missingId}`)
  }
}

async function insertLineageLinksInChunks(client: any, links: LineageLinkInput[], batchId: string) {
  const linkRows = links.map((link) => ({
    id: randomUUID(),
    link,
  }))
  const ts = new Date().toISOString()

  for (let offset = 0; offset < linkRows.length; offset += LINEAGE_BATCH_INSERT_CHUNK_SIZE) {
    const chunk = linkRows.slice(offset, offset + LINEAGE_BATCH_INSERT_CHUNK_SIZE)
    const values: unknown[] = []
    const groups = chunk.map(({ id, link }) => {
      const rowValues = [
        id,
        link.projectId,
        link.sourceEntityType,
        link.sourceEntityId,
        link.relationType,
        link.targetEntityType,
        link.targetEntityId,
        batchId,
        normalizeLineageStatus(link.mappingStatus),
        link.confidence ?? null,
        JSON.stringify({ ...(link.metadata ?? {}), batchId }),
        ts,
      ]
      const start = values.length + 1
      values.push(...rowValues)
      return `(${rowValues.map((_, index) => `$${start + index}`).join(', ')})`
    })
    await client.query(
      `INSERT INTO data_lineage_links (id, project_id, source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id, batch_ref, mapping_status, confidence, metadata, created_at)
       VALUES ${groups.join(', ')}`,
      values,
    )
  }

  for (let offset = 0; offset < linkRows.length; offset += LINEAGE_BATCH_INSERT_CHUNK_SIZE) {
    const chunk = linkRows.slice(offset, offset + LINEAGE_BATCH_INSERT_CHUNK_SIZE)
    const values: unknown[] = []
    const groups = chunk.map(({ id, link }) => {
      const rowValues = [
        randomUUID(),
        link.projectId,
        id,
        'recorded',
        JSON.stringify({ relation_type: link.relationType, batchId }),
        ts,
      ]
      const start = values.length + 1
      values.push(...rowValues)
      return `(${rowValues.map((_, index) => `$${start + index}`).join(', ')})`
    })
    await client.query(
      `INSERT INTO data_lineage_events (id, project_id, link_id, event_type, metadata, changed_at)
       VALUES ${groups.join(', ')}`,
      values,
    )
  }
}

export async function recordLineage(input: LineageLinkInput): Promise<string> {
  await validateLineageWrite(input)

  const { data, error } = await supabase.from('data_lineage_links').insert({
    project_id: input.projectId,
    source_entity_type: input.sourceEntityType,
    source_entity_id: input.sourceEntityId,
    relation_type: input.relationType,
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId,
    batch_ref: input.batchRef ?? null,
    mapping_status: normalizeLineageStatus(input.mappingStatus),
    confidence: input.confidence ?? null,
    metadata: input.metadata ?? {},
  }).select('id').single()

  if (error) throw new Error(`Lineage write failed: ${error.message}`)

  const { error: eventError } = await supabase.from('data_lineage_events').insert({
    project_id: input.projectId,
    link_id: (data as any)?.id,
    event_type: 'recorded',
    metadata: { relation_type: input.relationType },
  })
  if (eventError) throw new Error(`Lineage event write failed: ${eventError.message}`)

  return (data as any)?.id as string
}

export async function recordLineageInTransaction(client: any, input: LineageLinkInput): Promise<string> {
  await validateLineageWriteInTransaction(client, input)

  const linkId = randomUUID()
  const ts = new Date().toISOString()
  const linkResult = await client.query(
    `INSERT INTO data_lineage_links (id, project_id, source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id, batch_ref, mapping_status, confidence, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (source_entity_type, source_entity_id, relation_type, target_entity_type, target_entity_id)
       WHERE mapping_status = 'active'
     DO UPDATE SET
       project_id = EXCLUDED.project_id,
       batch_ref = EXCLUDED.batch_ref,
       confidence = EXCLUDED.confidence,
       metadata = EXCLUDED.metadata
     RETURNING id`,
    [
      linkId,
      input.projectId,
      input.sourceEntityType,
      input.sourceEntityId,
      input.relationType,
      input.targetEntityType,
      input.targetEntityId,
      input.batchRef ?? null,
      normalizeLineageStatus(input.mappingStatus),
      input.confidence ?? null,
      JSON.stringify(input.metadata ?? {}),
      ts,
    ],
  )
  const persistedLinkId = String(linkResult?.rows?.[0]?.id ?? linkId)

  await client.query(
    `INSERT INTO data_lineage_events (id, project_id, link_id, event_type, metadata, changed_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), input.projectId, persistedLinkId, 'recorded', JSON.stringify({ relation_type: input.relationType }), ts],
  )

  return persistedLinkId
}

export async function createLineageBatchInTransaction(
  client: any,
  projectId: string,
  batchType: string,
  links: LineageLinkInput[],
  createdBy?: string,
): Promise<{ batchId: string; linkCount: number }> {
  const batchId = randomUUID()
  await client.query(
    'INSERT INTO data_lineage_batches (id, project_id, batch_type, link_count, created_by) VALUES ($1, $2, $3, $4, $5)',
    [batchId, projectId, batchType, links.length, createdBy ?? null],
  )
  if (links.length > 0) {
    await validateLineageBatchWriteInTransaction(client, links)
    await insertLineageLinksInChunks(client, links, batchId)
  }
  await client.query('UPDATE data_lineage_batches SET link_count = $1 WHERE id = $2 AND project_id = $3', [links.length, batchId, projectId])
  return { batchId, linkCount: links.length }
}

export async function recordLineageBatchInTransaction(
  client: any,
  projectId: string,
  batchType: string,
  links: LineageLinkInput[],
  createdBy?: string,
): Promise<{ batchId: string; linkCount: number }> {
  return createLineageBatchInTransaction(client, projectId, batchType, links, createdBy)
}

export async function createLineageBatch(
  projectId: string,
  batchType: string,
  links: LineageLinkInput[],
  createdBy?: string,
): Promise<{ batchId: string; linkCount: number }> {
  const { data: batch } = await supabase.from('data_lineage_batches').insert({
    project_id: projectId,
    batch_type: batchType,
    link_count: links.length,
    created_by: createdBy ?? null,
  }).select('id').single()
  if (!batch) throw new Error('Failed to create lineage batch')
  const batchId = (batch as any).id

  let count = 0
  for (const link of links) {
    await recordLineage({ ...link, batchRef: batchId, metadata: { ...(link.metadata ?? {}), batchId } })
    count += 1
  }

  await supabase.from('data_lineage_batches').update({ link_count: count }).eq('id', batchId).eq('project_id', projectId)
  return { batchId, linkCount: count }
}

export async function traceLineage(entityType: string, entityId: string, direction: 'up' | 'down' = 'up') {
  if (direction === 'up') {
    const { data } = await supabase.from('data_lineage_links').select('*')
      .eq('target_entity_type', entityType).eq('target_entity_id', entityId)
      .order('created_at', { ascending: false })
    return data ?? []
  }
  const { data } = await supabase.from('data_lineage_links').select('*')
    .eq('source_entity_type', entityType).eq('source_entity_id', entityId)
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function recordLineageBatch(inputs: LineageLinkInput[]): Promise<number> {
  let count = 0
  for (const input of inputs) {
    const id = await recordLineage(input)
    if (id) count += 1
  }
  return count
}

/** Record template node -> task generation lineage. */
export async function recordTemplateLineage(
  projectId: string,
  templateId: string,
  templateNodeId: string | null,
  targetTaskId: string,
  batchRef?: string,
) {
  if (!templateNodeId) return null
  return recordLineage({
    projectId,
    sourceEntityType: 'wbs_template_node',
    sourceEntityId: templateNodeId,
    relationType: 'generates',
    targetEntityType: 'task',
    targetEntityId: targetTaskId,
    batchRef,
    mappingStatus: 'active',
    metadata: { templateId },
  })
}

/** Record baseline_item -> monthly_plan_item lineage. */
export async function recordBaselineToMonthlyLineage(
  projectId: string,
  baselineItemId: string,
  monthlyPlanItemId: string,
) {
  return recordLineage({ projectId, sourceEntityType: 'task_baseline_item', sourceEntityId: baselineItemId, relationType: 'derives', targetEntityType: 'monthly_plan_item', targetEntityId: monthlyPlanItemId, mappingStatus: 'active' })
}

/** Record monthly_plan_item -> task lineage. */
export async function recordMonthlyToTaskLineage(
  projectId: string,
  monthlyPlanItemId: string,
  targetTaskId: string,
) {
  return recordLineage({ projectId, sourceEntityType: 'monthly_plan_item', sourceEntityId: monthlyPlanItemId, relationType: 'derives', targetEntityType: 'task', targetEntityId: targetTaskId, mappingStatus: 'active' })
}

/** Record import batch lineage. */
export async function recordImportLineage(
  projectId: string,
  batchId: string,
  targetTaskId: string,
  rowIndex: number,
) {
  return recordLineage({ projectId, sourceEntityType: 'import_batch', sourceEntityId: batchId, relationType: 'contains', targetEntityType: 'task', targetEntityId: targetTaskId, batchRef: batchId, metadata: { rowIndex } })
}

/** Record risk/issue escalation lineage. */
export async function recordEscalationLineage(
  projectId: string,
  sourceType: string,
  sourceId: string,
  targetType: string,
  targetId: string,
  chainId?: string,
) {
  return recordLineage({ projectId, sourceEntityType: sourceType, sourceEntityId: sourceId, relationType: 'escalates_to', targetEntityType: targetType, targetEntityId: targetId, metadata: chainId ? { chainId } : {} })
}
