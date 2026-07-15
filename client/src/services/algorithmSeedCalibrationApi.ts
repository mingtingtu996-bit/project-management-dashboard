import { apiGet, apiPost } from '@/lib/apiClient'

const ALGORITHM_SEED_GOVERNANCE_BASE = '/api/planning/algorithm-seeds'

export type AlgorithmSeedCalibrationSource =
  | 'project_history'
  | 'company_history'
  | 'standard_update'
  | 'system_observation'
  | string

export type AlgorithmSeedCalibrationStatus =
  | 'pending'
  | 'candidate_only'
  | 'auto_published'
  | 'quarantined'
  | 'rejected'
  | 'superseded'
  | string

export interface AlgorithmSeedCalibrationCandidate {
  id: string
  seedType: string
  stableCode: string
  candidatePayload: Record<string, unknown>
  candidateSource: AlgorithmSeedCalibrationSource
  projectId: string | null
  companyId: string | null
  sampleCount: number
  variance: number | null
  confidenceLevel: 'high' | 'medium' | 'low' | string
  evidenceSummary: Record<string, unknown>
  actionPolicy: 'candidate_only' | 'auto_govern' | string
  status: AlgorithmSeedCalibrationStatus
  createdAt: string | null
  updatedAt: string | null
}

export interface AlgorithmSeedCalibrationCandidateQuery {
  seedType?: string | null
  status?: AlgorithmSeedCalibrationStatus | null
  projectId?: string | null
}

export interface DiscoverAlgorithmSeedCalibrationPayload {
  projectId?: string | null
  minProjectSamples?: number | null
  minCompanySamples?: number | null
  maxSamples?: number | null
  autoGovern?: boolean
}

export interface AlgorithmSeedAutoGovernanceResult {
  candidate?: AlgorithmSeedCalibrationCandidate | Record<string, unknown> | null
  decision?: Record<string, unknown> | null
  override?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface AlgorithmSeedCalibrationDiscoveryResult {
  candidates?: AlgorithmSeedCalibrationCandidate[]
  governed?: AlgorithmSeedAutoGovernanceResult[]
  created?: number
  autoGoverned?: number
  skipped?: number
  [key: string]: unknown
}

function normalizeCandidate(raw: any): AlgorithmSeedCalibrationCandidate {
  return {
    ...raw,
    id: String(raw?.id ?? ''),
    seedType: raw?.seedType ?? raw?.seed_type ?? '',
    stableCode: raw?.stableCode ?? raw?.stable_code ?? '',
    candidatePayload: raw?.candidatePayload ?? raw?.candidate_payload ?? {},
    candidateSource: raw?.candidateSource ?? raw?.candidate_source ?? 'system_observation',
    projectId: raw?.projectId ?? raw?.project_id ?? null,
    companyId: raw?.companyId ?? raw?.company_id ?? null,
    sampleCount: Number(raw?.sampleCount ?? raw?.sample_count ?? 0),
    variance: raw?.variance ?? null,
    confidenceLevel: raw?.confidenceLevel ?? raw?.confidence_level ?? 'low',
    evidenceSummary: raw?.evidenceSummary ?? raw?.evidence_summary ?? {},
    actionPolicy: raw?.actionPolicy ?? raw?.action_policy ?? 'auto_govern',
    status: raw?.status ?? 'pending',
    createdAt: raw?.createdAt ?? raw?.created_at ?? null,
    updatedAt: raw?.updatedAt ?? raw?.updated_at ?? null,
  }
}

function normalizeAutoGovernanceResult(raw: any): AlgorithmSeedAutoGovernanceResult {
  return {
    ...raw,
    candidate: raw?.candidate ? normalizeCandidate(raw.candidate) : raw?.candidate ?? null,
    decision: raw?.decision ?? null,
    override: raw?.override ?? null,
  }
}

function buildCandidateQuery(params: AlgorithmSeedCalibrationCandidateQuery = {}) {
  const query = new URLSearchParams()
  if (params.seedType) query.set('seedType', params.seedType)
  if (params.status) query.set('status', params.status)
  if (params.projectId) query.set('projectId', params.projectId)
  return query.toString()
}

export async function listAlgorithmSeedCalibrationCandidates(
  params: AlgorithmSeedCalibrationCandidateQuery = {},
  options?: RequestInit,
) {
  const query = buildCandidateQuery(params)
  const rows = await apiGet<any[]>(
    `${ALGORITHM_SEED_GOVERNANCE_BASE}/upgrade-candidates${query ? `?${query}` : ''}`,
    options,
  )
  return (Array.isArray(rows) ? rows : []).map(normalizeCandidate)
}

export async function discoverAlgorithmSeedCalibrationCandidates(
  payload: DiscoverAlgorithmSeedCalibrationPayload = {},
  options?: RequestInit,
) {
  const result = await apiPost<any>(
    `${ALGORITHM_SEED_GOVERNANCE_BASE}/upgrade-candidates/discover`,
    {
      ...payload,
      autoGovern: payload.autoGovern ?? true,
    },
    options,
  )
  return {
    ...result,
    candidates: Array.isArray(result?.candidates) ? result.candidates.map(normalizeCandidate) : [],
    governed: Array.isArray(result?.governed) ? result.governed.map(normalizeAutoGovernanceResult) : [],
  } as AlgorithmSeedCalibrationDiscoveryResult
}

export async function autoGovernAlgorithmSeedCalibrationCandidate(candidateId: string, options?: RequestInit) {
  const result = await apiPost<any>(
    `${ALGORITHM_SEED_GOVERNANCE_BASE}/upgrade-candidates/${encodeURIComponent(candidateId)}/auto-govern`,
    undefined,
    options,
  )
  return normalizeAutoGovernanceResult(result)
}
