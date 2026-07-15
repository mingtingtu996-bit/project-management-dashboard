import { supabase } from './dbService.js'
import type { PolicyTemplateReleaseTargetTable } from './policyTemplateReleaseAdapterService.js'

export type PolicyTemplateEntityRuntimeProjectionStatus =
  | 'runtime_stable_published'
  | 'runtime_rolled_back'

export interface PolicyTemplateEntityRuntimeProjectionRecord {
  source_run_id: string
  target_table: PolicyTemplateReleaseTargetTable
  runtime_publication_status: PolicyTemplateEntityRuntimeProjectionStatus
  runtime_record: Record<string, unknown>
  published_at?: string | null
  updated_at?: string | null
}

function readProjectionRecord(value: unknown): PolicyTemplateEntityRuntimeProjectionRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Partial<PolicyTemplateEntityRuntimeProjectionRecord>
  if (!record.source_run_id || !record.target_table || !record.runtime_publication_status) return null
  return {
    source_run_id: String(record.source_run_id),
    target_table: record.target_table as PolicyTemplateReleaseTargetTable,
    runtime_publication_status: record.runtime_publication_status,
    runtime_record: record.runtime_record && typeof record.runtime_record === 'object' && !Array.isArray(record.runtime_record)
      ? record.runtime_record
      : {},
    published_at: record.published_at ?? null,
    updated_at: record.updated_at ?? null,
  }
}

export async function loadLatestPolicyTemplateEntityRuntimeProjection(
  targetTable: PolicyTemplateReleaseTargetTable,
  status?: PolicyTemplateEntityRuntimeProjectionStatus,
): Promise<PolicyTemplateEntityRuntimeProjectionRecord | null> {
  let query = (supabase as any)
    .from('policy_template_entity_runtime_publications')
    .select('source_run_id,target_table,runtime_publication_status,runtime_record,published_at,updated_at')
    .eq('target_table', targetTable)

  if (status) query = query.eq('runtime_publication_status', status)

  const { data, error } = await query
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return readProjectionRecord(data)
}

export async function loadLatestStablePolicyTemplateEntityRuntimeRecord(
  targetTable: PolicyTemplateReleaseTargetTable,
): Promise<Record<string, unknown> | null> {
  const projection = await loadLatestPolicyTemplateEntityRuntimeProjection(targetTable, 'runtime_stable_published')
  return projection?.runtime_record ?? null
}

export async function hasPolicyTemplateEntityRuntimeProjection(
  targetTable: PolicyTemplateReleaseTargetTable,
): Promise<boolean> {
  return Boolean(await loadLatestPolicyTemplateEntityRuntimeProjection(targetTable))
}
