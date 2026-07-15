import { apiGet, apiPost } from '@/lib/apiClient'

export type ClimateConfidence = 'high' | 'medium' | 'low'

export interface ProjectClimateProfile {
  id?: string
  projectId?: string
  province?: string | null
  city?: string | null
  adminCode?: string | null
  climateRegion?: string | null
  thermalZone?: string | null
  confidence?: ClimateConfidence | null
  source?: string | null
  reason?: string | null
  metadata?: Record<string, unknown> | null
  updatedAt?: string | null
}

export interface BrowserLocationPayload {
  latitude: number
  longitude: number
  accuracyMeters?: number | null
}

export interface BrowserLocationResult {
  status: 'recorded' | 'skipped'
  reason?: string | null
  profile?: ProjectClimateProfile | null
}

export interface ProjectWeatherProviderStatus {
  provider: string
  configured: boolean
  productionAuthorized: boolean
  missing: string[]
  areaId: string | null
  message: string
}

export interface ProjectWeatherSyncResult {
  projectId: string
  status: 'synced' | 'degraded' | 'skipped' | 'failed' | string
  reason?: string | null
  provider?: string | null
  missing?: string[]
  message?: string | null
  degradationMessage?: string | null
  algorithmFallback?: string | null
  retryable?: boolean
  detail?: string | null
  written: number
}

export interface ProjectClimateRefreshResult {
  profile: ProjectClimateProfile
  weather: ProjectWeatherSyncResult
}

export function getProjectClimateProfile(projectId: string, options?: RequestInit) {
  return apiGet<ProjectClimateProfile>(
    `/api/projects/${encodeURIComponent(projectId)}/climate/profile`,
    options,
  )
}

export function getProjectWeatherProviderStatus(projectId: string, options?: RequestInit) {
  return apiGet<ProjectWeatherProviderStatus>(
    `/api/projects/${encodeURIComponent(projectId)}/climate/weather-provider/status`,
    options,
  )
}

export function refreshProjectClimateProfile(projectId: string, options?: RequestInit) {
  return apiPost<ProjectClimateRefreshResult>(
    `/api/projects/${encodeURIComponent(projectId)}/climate/refresh`,
    undefined,
    options,
  )
}

export function recordProjectBrowserLocation(projectId: string, payload: BrowserLocationPayload, options?: RequestInit) {
  return apiPost<BrowserLocationResult>(
    `/api/projects/${encodeURIComponent(projectId)}/climate/browser-location`,
    payload,
    options,
  )
}
