import { apiGet, apiPost } from '@/lib/apiClient'

export interface StatusDomain {
  domain_key: string
  domain_name: string
  domain_group: string
  status_kind: string
}

export interface StatusValue {
  domain_key: string
  status_key: string
  status_label: string
  status_label_short?: string
  sort_order: number
  is_initial: boolean
  is_terminal: boolean
  visual_tone?: string
  semantic_tone?: string
}

export interface StatusTransition {
  domain_key: string
  from_status: string
  to_status: string
  event_key?: string
}

export interface NormalizedStatus {
  domainKey: string
  statusKey: string
  statusLabel: string
  visualTone: string
  semanticTone: string
  statusKind: string
  dictionaryVersion: string
}

export async function listStatusDomains(): Promise<StatusDomain[]> {
  return await apiGet<StatusDomain[]>('/api/status-dictionary/domains') ?? []
}

export async function listStatusValues(domainKey: string): Promise<StatusValue[]> {
  return await apiGet<StatusValue[]>(`/api/status-dictionary/domains/${encodeURIComponent(domainKey)}/values`) ?? []
}

export async function listStatusTransitions(domainKey: string): Promise<StatusTransition[]> {
  return await apiGet<StatusTransition[]>(`/api/status-dictionary/domains/${encodeURIComponent(domainKey)}/transitions`) ?? []
}

export async function normalizeStatus(domainKey: string, rawStatus: unknown): Promise<NormalizedStatus> {
  return await apiPost<NormalizedStatus>('/api/status-dictionary/normalize', { domainKey, rawStatus })
}
