import { supabase } from './dbService.js'
import { rollbackProjectProductivityCalibrationAtomically } from './durationLearningAssetAtomicStoreService.js'
import { getProjectCompanyId } from '../auth/access.js'

export interface ProjectProductivityPublishedCalibration {
  id: string | null
  status: string
  parameterPayload: Record<string, unknown>
  evidenceSummary: Record<string, unknown>
  recommendedCap: number | null
  recommendedMinUplift: number | null
}

type CalibrationRow = {
  id?: string | null
  parameter_payload?: unknown
  evidence_summary?: unknown
  recommended_cap?: number | string | null
  recommended_min_uplift?: number | string | null
  status?: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeId(value: unknown) {
  const text = normalizeText(value)
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readOptionalNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export async function loadPublishedProjectProductivityCalibration(projectId?: string | null) {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) return null
  const { data, error } = await (supabase as any)
    .from('project_productivity_compensation_calibrations')
    .select('id, status, parameter_payload, evidence_summary, recommended_cap, recommended_min_uplift')
    .eq('project_id', normalizedProjectId)
    .eq('calibration_key', 'productivity_compensation')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const row = data as CalibrationRow
  return {
    id: normalizeId(row.id),
    status: normalizeText(row.status) || 'published',
    parameterPayload: readRecord(row.parameter_payload),
    evidenceSummary: readRecord(row.evidence_summary),
    recommendedCap: readOptionalNumber(row.recommended_cap),
    recommendedMinUplift: readOptionalNumber(row.recommended_min_uplift),
  } satisfies ProjectProductivityPublishedCalibration
}

export async function rollbackPublishedProjectProductivityCalibration(projectId?: string | null, reason = 'manual_rollback') {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) return null
  const companyId = normalizeId(await getProjectCompanyId(normalizedProjectId))
  if (!companyId) return null
  return rollbackProjectProductivityCalibrationAtomically({
    companyId,
    projectId: normalizedProjectId,
    reason,
  })
}
