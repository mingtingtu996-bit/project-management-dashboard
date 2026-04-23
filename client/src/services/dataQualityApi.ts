import { apiGet, apiPost, apiPut } from '@/lib/apiClient'

export type DataQualityWeightKey = 'timeliness' | 'anomaly' | 'consistency' | 'jumpiness' | 'coverage'

export type DataQualityWeights = Record<DataQualityWeightKey, number>

export interface DataQualityProjectSettings {
  projectId: string
  weights: DataQualityWeights
  updatedAt: string | null
  updatedBy: string | null
  isDefault: boolean
}

export interface DataQualityConfidenceDimension {
  key: DataQualityWeightKey
  label: string
  score: number
  weight: number
  maxContribution: number
  actualContribution: number
  lossContribution: number
  lossShare: number
}

export interface DataQualityPromptItem {
  id: string
  taskId?: string | null
  taskTitle: string
  ruleCode: string
  severity: 'info' | 'warning' | 'critical'
  summary: string
  recommendation: string
}

export interface DataQualityProjectSummary {
  projectId: string
  month: string
  confidence: {
    score: number
    flag: 'high' | 'medium' | 'low'
    note: string
    timelinessScore: number
    anomalyScore: number
    consistencyScore: number
    coverageScore: number
    jumpinessScore: number
    weights: DataQualityWeights
    activeFindingCount: number
    trendWarningCount: number
    anomalyFindingCount: number
    crossCheckFindingCount: number
    dimensions?: DataQualityConfidenceDimension[]
  }
  prompt: {
    count: number
    summary: string
    items: DataQualityPromptItem[]
  }
  ownerDigest: {
    shouldNotify: boolean
    severity: 'info' | 'warning' | 'critical'
    scopeLabel: string | null
    findingCount: number
    summary: string
  }
  findings: Array<{
    id: string
    finding_key: string
    task_id?: string | null
    rule_code: string
    rule_type: 'trend' | 'anomaly' | 'cross_check'
    severity: 'info' | 'warning' | 'critical'
    summary: string
    detected_at: string
    status: 'active' | 'resolved' | 'ignored'
  }>
}

export interface DataQualityLiveCheckSummary {
  count: number
  summary: string
  items: DataQualityPromptItem[]
}

export class DataQualityApiService {
  static async getProjectSettings(projectId: string, options?: RequestInit): Promise<DataQualityProjectSettings | null> {
    if (!projectId) return null
    const search = new URLSearchParams({ projectId })
    return await apiGet<DataQualityProjectSettings>(`/api/data-quality/settings?${search.toString()}`, options)
  }

  static async updateProjectSettings(projectId: string, weights: DataQualityWeights, options?: RequestInit): Promise<DataQualityProjectSettings> {
    return await apiPut<DataQualityProjectSettings>('/api/data-quality/settings', { projectId, weights }, options)
  }

  static async getProjectSummary(projectId: string, month?: string, options?: RequestInit): Promise<DataQualityProjectSummary | null> {
    if (!projectId) return null
    const search = new URLSearchParams({ projectId })
    if (month) {
      search.set('month', month)
    }
    return await apiGet<DataQualityProjectSummary>(`/api/data-quality/project-summary?${search.toString()}`, options)
  }

  static async liveCheckTaskDraft(
    projectId: string,
    draft: Record<string, unknown>,
    taskId?: string | null,
    options?: RequestInit,
  ): Promise<DataQualityLiveCheckSummary | null> {
    if (!projectId) return null
    return await apiPost<DataQualityLiveCheckSummary>('/api/data-quality/live-check', { projectId, taskId, draft }, options)
  }
}
