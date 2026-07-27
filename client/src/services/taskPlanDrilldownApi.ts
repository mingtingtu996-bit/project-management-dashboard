import { apiGet } from '@/lib/apiClient'
import type { WbsTemplateGenerationScope } from '@/services/wbsTemplateGenerationApi'

export type TaskPlanDrilldownLevel = 'master_control' | 'process_detail' | 'activity_step'

export interface TaskPlanDrilldownRecommendation {
  templateId: string
  templateName: string | null
  selectedNodeIds: string[]
  selectedNodeNames: string[]
  resolutionSource: 'rhythm_asset_match' | 'lineage_match' | 'standard_work_match' | 'semantic_match'
  confidence: 'high' | 'medium'
}

export interface TaskPlanDrilldownContext {
  parentTask: Record<string, unknown>
  scope: WbsTemplateGenerationScope
  currentLevel: TaskPlanDrilldownLevel
  nextLevel: Exclude<TaskPlanDrilldownLevel, 'master_control'> | null
  generationDepth: 'process' | 'activity_step' | null
  includeActivitySteps: boolean
  rowLimit: number
  recommendation: TaskPlanDrilldownRecommendation | null
  projectTaskCount: number
  projectRowLimitExceeded: boolean
  warningThreshold: number
  projectTotalBlockedByGenerationFuse: false
  mutationBoundary: 'read_only_context_no_task_or_dependency_write'
}

export function getTaskPlanDrilldownContext(taskId: string) {
  return apiGet<TaskPlanDrilldownContext>(
    `/api/tasks/${encodeURIComponent(taskId)}/plan-drilldown-context`,
    { runtimeCache: 'off' },
  )
}
