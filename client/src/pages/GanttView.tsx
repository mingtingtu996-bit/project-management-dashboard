import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useRef } from 'react'
import {
  useAddTask,
  useConditions,
  useCurrentProject,
  useDeleteTask,
  useIssueRows,
  useObstacles,
  useProjectRisks,
  useStore,
  useSetConditions,
  useSetObstacles,
  useTasks,
  useUpdateTask,
} from '@/hooks/useStore'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { usePlanningPresence } from '@/hooks/usePlanningPresence'
import { usePlanningFieldRegistry } from '@/hooks/usePlanningFieldRegistry'
import { V14231PageReadinessBoundary } from '@/components/governance/V14231PageReadinessBoundary'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from '@/hooks/use-toast'
import { apiPost, getApiErrorMessage } from '@/lib/apiClient'
import { formatDurationMetric, readAvailableDurationValue } from '@/lib/durationMetric'
import { cn } from '@/lib/utils'
import type { DataQualityLiveCheckSummary } from '@/services/dataQualityApi'
import { GanttViewSkeleton } from '@/components/ui/page-skeleton'
import { ProjectRemainingForecastCard } from '@/components/ProjectRemainingForecastCard'
import {
  evaluateProjectScheduleAcceleration,
  recordScheduleAccelerationRecommendationAdoption,
} from '@/services/projectRemainingForecastApi'
import { Pagination, usePagination } from '@/components/ui/Pagination'
import { PlanningPageShell } from '@/components/planning/PlanningPageShell'
import { ArrowLeft, CalendarCheck, RefreshCw } from 'lucide-react'
import { SaveAsCompanyTemplateDialog } from '@/components/planning/SaveAsCompanyTemplateDialog'
import { ReconcileBanner, type ReconcileTaskEntry } from '@/components/planning/ReconcileBanner'
import { useGroupMode } from '@/hooks/useGroupMode'
import { GanttGovernanceBanner } from './GanttViewHeader'
import { useGanttCriticalPath } from './useGanttCriticalPath'
import { GanttBatchBar, TaskListMetricCards } from './GanttViewFilters'
import { GanttTaskRows } from './GanttViewRows'
import type { CriticalPathChange } from '@/components/planning/CriticalPathAlert'
import { GanttChart } from '@/components/planning/GanttChart'
import { GanttWorkspaceChrome } from './GanttView/GanttWorkspaceChrome'
import { GanttCriticalPathDialogs } from './GanttView/GanttCriticalPathDialogs'
import { GanttSelectedTaskAside, preloadTaskDetailPanel } from './GanttView/GanttSelectedTaskAside'
import { GanttEditWorkflowDialogs } from './GanttView/GanttEditWorkflowDialogs'
import { GanttAuxiliaryDialogs } from './GanttView/GanttAuxiliaryDialogs'
import { GanttDetailDrawer } from './GanttView/GanttDetailDrawer'
import { BusinessHealthBanner } from './GanttView/BusinessHealthBanner'
import type { ParticipantUnitDraft } from './GanttView/ParticipantUnitsDialog'
import { TaskTimelineView, type TaskTimelineReschedulePreview, type TaskTimelineViewHandle } from './GanttView/TaskTimelineView'
import { createEmptyGanttTaskFormData, type GanttTaskFormErrors } from './GanttView/taskFormUtils'
import type { DeleteGuardTarget } from './GanttView/deleteProtection'
import { useGanttProjectData } from './GanttView/useGanttProjectData'
import { useGanttReferenceData } from './GanttView/useGanttReferenceData'
import { useGanttTaskExport } from './GanttView/useGanttTaskExport'
import { useGanttFilters } from './GanttView/useGanttFilters'
import { useGanttTaskDraftState } from './GanttView/useGanttTaskDraftState'
import { useGanttDetailDrawer } from './GanttView/useGanttDetailDrawer'
import { useGanttTaskTableActions } from './GanttView/useGanttTaskTableActions'
import { useGanttConditionActions } from './GanttView/useGanttConditionActions'
import { useGanttObstacleActions } from './GanttView/useGanttObstacleActions'
import { useGanttParticipantUnitActions } from './GanttView/useGanttParticipantUnitActions'
import { useGanttMilestoneActions } from './GanttView/useGanttMilestoneActions'
import { useGanttTaskCommitActions } from './GanttView/useGanttTaskCommitActions'
import { useGanttDeleteGuardActions } from './GanttView/useGanttDeleteGuardActions'
import { useGanttTreeState } from './GanttView/useGanttTreeState'
import { useGanttTaskDialogActions } from './GanttView/useGanttTaskDialogActions'
import { useGanttHighlightTask } from './GanttView/useGanttHighlightTask'
import { useGanttTimelineBaselinePreference, useGanttViewPreferences } from './GanttView/useGanttViewPreferences'
import { useGanttProjectCollections } from './GanttView/useGanttProjectCollections'
import { useGanttTaskProgressState } from './GanttView/useGanttTaskProgressState'
import { useGanttDerivedViewState } from './GanttView/useGanttDerivedViewState'
import { useGanttBusinessActionSlots } from './GanttView/useGanttBusinessActionSlots'
import { useGanttScopePreferences } from './GanttView/useGanttScopePreferences'
import { createEmptyParticipantUnitDraft } from './GanttView/participantUnitUtils'
import { shouldShowTaskInMainExecutionList } from './GanttView/taskListProjection'
import { withTaskScheduleEvidence } from './GanttView/taskScheduleEvidence'
import { TargetAccelerationReviewPanel } from './GanttView/TargetAccelerationReviewPanel'
import { PlanningModelingWorkbenchDialog, type PlanningModelingWorkbenchMode } from './GanttView/PlanningModelingWorkbenchDialog'
import type { WbsAccelerationProposal, WbsTargetFeasibility } from '@/services/wbsTemplateGenerationApi'
import type { PlanningTableOperation } from '@/components/planning/PlanningCommitModel'

import { getDependencyChain, type Task, type TaskCondition, type TaskObstacle, type ConditionTypeValue } from './GanttViewTypes'

const WIZARD_ACCELERATION_STORAGE_PREFIX = 'workbuddy:wizard-acceleration:'
const WIZARD_GENERATION_EVIDENCE_STORAGE_PREFIX = 'workbuddy:wizard-generation-evidence:'
type WizardDurationAssetPreviewItem = {
  createdTaskId?: string | null
  title?: string | null
  standardWorkDurationSeedStableCode?: string | null
  standardWorkDurationSeedResolverSource?: string | null
  standardWorkDurationSeedResolverVersionId?: string | null
  t2RhythmTemplateId?: string | null
  t2RhythmTemplateResolverSource?: string | null
  t2RhythmTemplateResolverVersionId?: string | null
  runtimeReferenceDaysConsumed?: boolean
  runtimeReferenceDaysEvidenceLevel?: string | null
  runtimeReferenceDaysStableCode?: string | null
  runtimeReferenceDaysP50Days?: number | null
  runtimeReferenceDaysP80Days?: number | null
  runtimeReferenceDaysSampleCount?: number | null
  runtimeReferenceDaysMutationBoundary?: string | null
  dependencyAssetConsumed?: boolean
  dependencyAssetType?: string | null
  dependencyAssetStableCode?: string | null
  dependencyAssetAutoApplyPolicy?: string | null
  dependencyAssetStrength?: string | null
  dependencyAssetHandoffCategory?: string | null
  dependencyAssetDependencyType?: string | null
  dependencyAssetLagDays?: number | null
  dependencyAssetEvidenceSourceKeys?: string[] | null
}

type WizardGenerationEvidenceSnapshot = {
  source?: string | null
  mutationBoundary?: string | null
  generationBatchId?: string | null
  durationAssetUtilizationSummary?: {
    scheduleRowCount?: number | null
    standardWorkDurationSeedRowCount?: number | null
    activeStandardWorkDurationSeedRowCount?: number | null
    fallbackStandardWorkDurationSeedRowCount?: number | null
    t2RhythmTemplateRowCount?: number | null
    activeT2RhythmTemplateRowCount?: number | null
    fallbackT2RhythmTemplateRowCount?: number | null
    runtimeReferenceDaysRowCount?: number | null
    runtimeReferenceDaysConsumedRowCount?: number | null
    rowsMissingRuntimeReferenceDaysCount?: number | null
    durationRiskRangeRowCount?: number | null
  } | null
  candidateDurationAssetPreview?: {
    totalCount?: number | null
    riskRangeCount?: number | null
    dependencyAssetCount?: number | null
    processSeasonalAdjustmentCount?: number | null
    constructionCalendarCount?: number | null
    writesDurationRuntime?: boolean
    writesTasks?: boolean
    items?: WizardDurationAssetPreviewItem[] | null
  } | null
  candidateNetworkEvaluation?: {
    projectedNetworkSpanDays?: number | null
    previewEdgeCount?: number | null
    criticalGeneratedRowIds?: unknown
    writesTaskDependencies?: boolean
    writesPlanDates?: boolean
    writesCriticalPathFacts?: boolean
  } | null
  candidateAcceptancePlanPreview?: {
    totalCount?: number | null
    datedCount?: number | null
    writesAcceptancePlans?: boolean
    fallbackFromProjectTarget?: boolean
    items?: Array<{
      title?: string | null
      plannedDate?: string | null
      sourceBasis?: string | null
    }> | null
  } | null
  planQualityDiagnostics?: Record<string, unknown> | null
  criticalPathRefresh?: {
    source?: string | null
    status?: string | null
    criticalTaskCount?: number | null
    projectDurationDays?: number | null
    writesTaskDependencies?: boolean
    writesPlanDates?: boolean
    writesCriticalPathFacts?: boolean
  } | null
}

function readModelingWorkbenchMode(value: string | null): PlanningModelingWorkbenchMode | null {
  return value === 'generate' || value === 'adjust' || value === 'expand' ? value : null
}

function readStoredTargetFeasibility(projectId?: string | null): WbsTargetFeasibility | null {
  if (!projectId || typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(`${WIZARD_ACCELERATION_STORAGE_PREFIX}${projectId}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { targetFeasibility?: WbsTargetFeasibility | null }
    return parsed.targetFeasibility ?? null
  } catch {
    return null
  }
}

function readStoredWizardGenerationEvidence(projectId?: string | null): WizardGenerationEvidenceSnapshot | null {
  if (!projectId || typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(`${WIZARD_GENERATION_EVIDENCE_STORAGE_PREFIX}${projectId}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as WizardGenerationEvidenceSnapshot
      : null
  } catch {
    return null
  }
}

function readWizardGenerationEvidenceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readWizardGenerationEvidenceObject(value: unknown): Record<string, unknown> | null {
  const record = readWizardGenerationEvidenceRecord(value)
  return Object.keys(record).length > 0 ? record : null
}

function hasWizardGenerationEvidenceSnapshot(evidence: WizardGenerationEvidenceSnapshot | null) {
  return Boolean(
    evidence?.durationAssetUtilizationSummary
      || evidence?.candidateDurationAssetPreview
      || evidence?.candidateNetworkEvaluation
      || evidence?.candidateAcceptancePlanPreview
      || evidence?.planQualityDiagnostics
      || evidence?.criticalPathRefresh,
  )
}

function readWizardGenerationEvidenceFromProjectMetadata(metadataValue?: Record<string, unknown> | null): WizardGenerationEvidenceSnapshot | null {
  const metadata = readWizardGenerationEvidenceRecord(metadataValue)
  const evidence: WizardGenerationEvidenceSnapshot = {
    source: 'project_metadata_wizard_generation_evidence',
    mutationBoundary: 'metadata_read_only_evidence_no_task_dependency_or_duration_runtime_write',
    generationBatchId: String(metadata.wizard_generation_batch_id ?? '').trim() || null,
    durationAssetUtilizationSummary: readWizardGenerationEvidenceObject(metadata.wizard_generation_duration_asset_utilization_summary),
    candidateDurationAssetPreview: readWizardGenerationEvidenceObject(metadata.wizard_generation_candidate_duration_asset_preview),
    candidateNetworkEvaluation: readWizardGenerationEvidenceObject(metadata.wizard_generation_candidate_network_evaluation),
    candidateAcceptancePlanPreview: readWizardGenerationEvidenceObject(metadata.wizard_generation_candidate_acceptance_plan_preview),
    planQualityDiagnostics: readWizardGenerationEvidenceObject(metadata.wizard_generation_plan_quality_diagnostics),
    criticalPathRefresh: readWizardGenerationEvidenceObject(metadata.wizard_generation_critical_path_refresh),
  }
  return hasWizardGenerationEvidenceSnapshot(evidence) ? evidence : null
}

function readEvidenceCount(value: unknown) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function formatWizardDurationAssetPreviewSeedLineage(item: WizardDurationAssetPreviewItem | null | undefined) {
  if (!item?.standardWorkDurationSeedStableCode) return null
  const resolver = [
    item.standardWorkDurationSeedResolverSource,
    item.standardWorkDurationSeedResolverVersionId,
  ].filter(Boolean).join(' / ')
  return resolver
    ? `seed ${item.standardWorkDurationSeedStableCode}：${resolver}`
    : `seed ${item.standardWorkDurationSeedStableCode}`
}

function formatWizardDurationAssetPreviewT2Lineage(item: WizardDurationAssetPreviewItem | null | undefined) {
  if (!item?.t2RhythmTemplateId) return null
  const resolver = [
    item.t2RhythmTemplateResolverSource,
    item.t2RhythmTemplateResolverVersionId,
  ].filter(Boolean).join(' / ')
  return resolver ? `T2 ${item.t2RhythmTemplateId}：${resolver}` : `T2 ${item.t2RhythmTemplateId}`
}

function formatWizardDurationAssetPreviewRuntimeReferenceDays(item: WizardDurationAssetPreviewItem | null | undefined) {
  if (!item?.runtimeReferenceDaysConsumed && !item?.runtimeReferenceDaysStableCode) return null
  const stableCode = item.runtimeReferenceDaysStableCode || '已消费'
  const referenceDays = item.runtimeReferenceDaysP50Days ?? item.runtimeReferenceDaysP80Days ?? '-'
  const sampleCount = item.runtimeReferenceDaysSampleCount ?? '-'
  return `参考天数 ${stableCode}：${referenceDays} 天 / 样本 ${sampleCount}`
}

function formatWizardDurationAssetPreviewDependencyLineage(item: WizardDurationAssetPreviewItem | null | undefined) {
  if (!item?.dependencyAssetStableCode) return null
  const details = [
    item.dependencyAssetStrength,
    item.dependencyAssetDependencyType,
    item.dependencyAssetLagDays == null ? null : `lag ${item.dependencyAssetLagDays}`,
    ...(item.dependencyAssetEvidenceSourceKeys ?? []),
  ].filter(Boolean)
  return details.length > 0
    ? `依赖依据 ${item.dependencyAssetStableCode}：${details.join(' / ')}`
    : `依赖依据 ${item.dependencyAssetStableCode}`
}

function formatWizardDurationRiskSummary(item: {
  riskP50DurationDays?: number | null
  riskP80DurationDays?: number | null
} | null | undefined) {
  if (!item) return '工期风险未评估'
  const baselineDays = item.riskP50DurationDays
  const conservativeDays = item.riskP80DurationDays
  if (baselineDays != null && conservativeDays != null && conservativeDays > baselineDays) {
    return `工期风险建议预留 ${conservativeDays - baselineDays} 天`
  }
  return baselineDays != null || conservativeDays != null ? '工期风险已评估' : '工期风险未评估'
}

function normalizeTaskId(value: unknown) {
  return String(value ?? '').trim()
}

function buildAccelerationReschedulePreviewMap(targetFeasibility: WbsTargetFeasibility | null | undefined) {
  const draft = targetFeasibility?.accelerationProposal?.rescheduleDraft
  const previewByTaskId = new Map<string, TaskTimelineReschedulePreview>()
  if (!draft) return previewByTaskId

  for (const adjustment of draft.taskDateAdjustments) {
    const taskId = normalizeTaskId(adjustment.clientRowId)
    if (!taskId) continue
    previewByTaskId.set(taskId, {
      taskId,
      proposedStartDate: adjustment.proposedStartDate ?? null,
      proposedEndDate: adjustment.proposedEndDate ?? null,
      currentDuration: adjustment.currentDuration ?? null,
      proposedDuration: adjustment.proposedDuration ?? null,
      recoverDuration: adjustment.recoverDuration ?? null,
    })
  }

  return previewByTaskId
}

function buildAccelerationRescheduleCommitOperations(
  proposal: WbsAccelerationProposal,
  tasks: Task[],
): PlanningTableOperation[] {
  const draft = proposal.rescheduleDraft
  if (!draft || draft.writePolicy !== 'requires_user_acceptance') return []

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const operations: PlanningTableOperation[] = []

  for (const adjustment of draft.taskDateAdjustments) {
    const taskId = normalizeTaskId(adjustment.clientRowId)
    if (!taskId || !taskById.has(taskId)) continue
    const values: Record<string, unknown> = {}
    if (adjustment.proposedStartDate) values.planned_start_date = adjustment.proposedStartDate
    if (adjustment.proposedEndDate) values.planned_end_date = adjustment.proposedEndDate
    if (Object.keys(values).length === 0) continue
    operations.push({
      type: 'update_row',
      rowId: taskId,
      values,
    })
  }

  const dependencyAdjustmentsBySuccessor = new Map<string, typeof draft.dependencyAdjustments>()
  for (const adjustment of draft.dependencyAdjustments) {
    const successorId = normalizeTaskId(adjustment.successorClientRowId)
    const predecessorId = normalizeTaskId(adjustment.predecessorClientRowId)
    if (!successorId || !predecessorId || !taskById.has(successorId) || !taskById.has(predecessorId)) continue
    dependencyAdjustmentsBySuccessor.set(successorId, [
      ...(dependencyAdjustmentsBySuccessor.get(successorId) ?? []),
      adjustment,
    ])
  }

  for (const [successorId, dependencyAdjustments] of dependencyAdjustmentsBySuccessor.entries()) {
    const successor = taskById.get(successorId)
    if (!successor) continue
    const dependencySpecs = new Map<string, {
      dependencyTaskId: string
      dependencyType: 'FS' | 'SS' | 'FF' | 'SF' | string
      lagDays: number
      source: string
    }>()
    for (const predecessorId of successor.dependencies ?? []) {
      const normalizedPredecessorId = normalizeTaskId(predecessorId)
      if (!normalizedPredecessorId || !taskById.has(normalizedPredecessorId)) continue
      dependencySpecs.set(normalizedPredecessorId, {
        dependencyTaskId: normalizedPredecessorId,
        dependencyType: 'FS',
        lagDays: 0,
        source: 'manual',
      })
    }
    for (const adjustment of dependencyAdjustments) {
      const predecessorId = normalizeTaskId(adjustment.predecessorClientRowId)
      dependencySpecs.set(predecessorId, {
        dependencyTaskId: predecessorId,
        dependencyType: adjustment.toDependencyType,
        lagDays: Number(adjustment.lagDaysAfter ?? 0) || 0,
        source: 'target_end_compression',
      })
    }
    const predecessorDependencies = Array.from(dependencySpecs.values())
    operations.push({
      type: 'set_predecessors',
      rowId: successorId,
      predecessorTaskIds: predecessorDependencies.map((dependency) => dependency.dependencyTaskId),
      predecessorDependencies,
    })
  }

  return operations
}

function hasReadySummaryCount(summary: { totalTasks?: unknown } | null | undefined, visibleTaskCount: number): boolean {
  const totalTasks = Number(summary?.totalTasks)
  return Number.isFinite(totalTasks) && (totalTasks > 0 || visibleTaskCount === 0)
}

export default function GanttView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const modelingWorkbenchMode = readModelingWorkbenchMode(searchParams.get('modelingWorkbench'))
  const modelingWorkbenchTaskId = searchParams.get('taskPlanTaskId')

  const closeModelingWorkbenchOnly = React.useCallback(() => {
    if (!id) return
    const nextSearch = new URLSearchParams(location.search)
    nextSearch.delete('modelingWorkbench')
    nextSearch.delete('taskPlanTaskId')
    const query = nextSearch.toString()
    navigate(`/projects/${encodeURIComponent(id)}/gantt${query ? `?${query}` : ''}`)
  }, [id, location.search, navigate])

  const handleModelingWorkbenchOnlyGenerated = React.useCallback((projectId: string, targetParams: string) => {
    const nextSearch = new URLSearchParams()
    if (targetParams) {
      const targetSearch = new URLSearchParams(targetParams.replace(/^&/, ''))
      targetSearch.forEach((value, key) => nextSearch.set(key, value))
    }
    if (!nextSearch.has('task_drilldown_saved')) nextSearch.set('wizard_generated', 'true')
    navigate(`/projects/${encodeURIComponent(projectId)}/gantt?${nextSearch.toString()}`)
  }, [navigate])

  if (modelingWorkbenchMode) {
    return (
      <div className="min-h-screen bg-slate-50">
        <PlanningModelingWorkbenchDialog
          open
          mode={modelingWorkbenchMode}
          projectId={id || ''}
          taskId={modelingWorkbenchTaskId}
          onOpenChange={(open) => {
            if (!open) closeModelingWorkbenchOnly()
          }}
          onGenerated={handleModelingWorkbenchOnlyGenerated}
        />
      </div>
    )
  }

  return <GanttViewContent />
}

function GanttViewContent() {
  useEffect(() => {
    document.title = '任务列表 | WorkBuddy'
  }, [])

  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const timelineViewRef = useRef<TaskTimelineViewHandle | null>(null)
  const currentProject = useCurrentProject()
  const currentUser = useStore((state) => state.currentUser)
  const { canEdit } = usePermissions()
  const taskListPresence = usePlanningPresence({
    projectId: id,
    resourceType: 'task-list',
    resourceId: id,
    enabled: Boolean(id && canEdit),
  })
  const taskListFieldRegistry = usePlanningFieldRegistry(id, 'task_list')
  const allTasks = useTasks()
  const allConditions = useConditions()
  const allObstacles = useObstacles()
  const projectRisks = useProjectRisks(id)
  const issueRows = useIssueRows()
  const addTask = useAddTask()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const setProjectConditions = useSetConditions()
  const setProjectObstacles = useSetObstacles()
  const [liveCheckSummary, setLiveCheckSummary] = useState<DataQualityLiveCheckSummary | null>(null)
  const [liveCheckLoading, setLiveCheckLoading] = useState(false)
  const [taskSaving, setTaskSaving] = useState(false)
  const modelingWorkbenchMode = readModelingWorkbenchMode(searchParams.get('modelingWorkbench'))
  const modelingWorkbenchOpen = Boolean(modelingWorkbenchMode)
  const {
    setTimelineBaselineVersionId,
    setTimelineCompareMode,
    setTimelineScale,
    setViewMode,
    timelineBaselineVersionId,
    timelineCompareMode,
    timelineScale,
    viewMode,
  } = useGanttViewPreferences({
    location,
    navigate,
    projectId: id,
    searchParams,
  })
  const [criticalPathInsertRequest, setCriticalPathInsertRequest] = useState<{
    anchorTaskId: string
    direction: 'before' | 'after'
  } | null>(null)
  const {
    dataQualityRefreshKey,
    projectConditions,
    projectObstacles,
    projectTaskIds,
    relatedRiskIssueSummaryByTaskId,
    relatedRiskIssueTaskIds,
    tasks,
  } = useGanttProjectCollections({
    allConditions: allConditions as TaskCondition[],
    allObstacles: allObstacles as TaskObstacle[],
    allTasks: allTasks as Task[],
    issueRows,
    projectId: id,
    projectRisks,
  })
  const criticalPathInsertAnchorTask = useMemo(
    () => (criticalPathInsertRequest ? tasks.find((task) => task.id === criticalPathInsertRequest.anchorTaskId) ?? null : null),
    [criticalPathInsertRequest, tasks],
  )
  const {
    baselineLoading,
    baselineOptions,
    baselineOptionsLoaded,
    dataQualitySummary,
    handleLightRefresh,
    loadTasks,
    loading,
    pageLoadError,
    projectSummary,
    refreshingTaskList,
    refreshGanttProjectData,
  } = useGanttProjectData({
    hasCachedProjectTasks: tasks.length > 0,
    projectId: id,
    viewMode,
    timelineCompareMode,
    timelineBaselineVersionId,
    dataQualityRefreshKey,
  })
  useEffect(() => {
    if (loading || pageLoadError) return
    const timer = window.setTimeout(() => {
      preloadTaskDetailPanel()
    }, 800)
    return () => window.clearTimeout(timer)
  }, [loading, pageLoadError])
  useGanttTimelineBaselinePreference({
    baselineOptions,
    setTimelineBaselineVersionId,
    timelineBaselineVersionId,
    timelineCompareMode,
  })
  const {
    criticalPathSummary,
    criticalPathDialogOpen,
    setCriticalPathDialogOpen,
    criticalPathDialogLoading,
    criticalPathActionLoading,
    criticalPathError,
    criticalPathOverrides,
    criticalPathFocusTaskId,
    setCriticalPathFocusTaskId,
    handleOpenCriticalPathDialog,
    handleRefreshCriticalPath,
    handleCreateCriticalPathOverride,
    handleDeleteCriticalPathOverride,
  } = useGanttCriticalPath({ projectId: loading || pageLoadError ? null : id, summaryDelayMs: 6_000 })

  const highlightTaskId = new URLSearchParams(location.search).get('highlight') || null
  const milestoneFilterId = searchParams.get('milestoneId')?.trim() || ''
  const milestoneFilterLabel = searchParams.get('milestoneName')?.trim() || milestoneFilterId
  const wizardGenerationEvidenceRequested = searchParams.get('wizard_evidence') === 'true'
  const [wizardTargetFeasibility, setWizardTargetFeasibility] = useState<WbsTargetFeasibility | null>(() => readStoredTargetFeasibility(id))
  const [wizardGenerationEvidence, setWizardGenerationEvidence] = useState<WizardGenerationEvidenceSnapshot | null>(() => (
    readStoredWizardGenerationEvidence(id)
      ?? readWizardGenerationEvidenceFromProjectMetadata(currentProject?.metadata)
  ))
  const showWizardGenerationEvidence = wizardGenerationEvidenceRequested || Boolean(wizardGenerationEvidence)
  const wizardDurationAssetSummary = wizardGenerationEvidence?.durationAssetUtilizationSummary ?? null
  const wizardDurationAssetScheduleRowCount = readEvidenceCount(wizardDurationAssetSummary?.scheduleRowCount)
  const wizardDurationAssetSeedRowCount = readEvidenceCount(wizardDurationAssetSummary?.standardWorkDurationSeedRowCount)
  const wizardDurationAssetActiveSeedRowCount = readEvidenceCount(wizardDurationAssetSummary?.activeStandardWorkDurationSeedRowCount)
  const wizardDurationAssetFallbackSeedRowCount = readEvidenceCount(wizardDurationAssetSummary?.fallbackStandardWorkDurationSeedRowCount)
  const wizardDurationAssetT2RowCount = readEvidenceCount(wizardDurationAssetSummary?.t2RhythmTemplateRowCount)
  const wizardDurationAssetActiveT2RowCount = readEvidenceCount(wizardDurationAssetSummary?.activeT2RhythmTemplateRowCount)
  const wizardDurationAssetFallbackT2RowCount = readEvidenceCount(wizardDurationAssetSummary?.fallbackT2RhythmTemplateRowCount)
  const wizardDurationAssetRuntimeReferenceDaysRowCount =
    readEvidenceCount(wizardDurationAssetSummary?.runtimeReferenceDaysConsumedRowCount)
    || readEvidenceCount(wizardDurationAssetSummary?.runtimeReferenceDaysRowCount)
  const wizardDurationAssetMissingRuntimeReferenceDaysCount = readEvidenceCount(wizardDurationAssetSummary?.rowsMissingRuntimeReferenceDaysCount)
  const wizardDurationAssetPreview = wizardGenerationEvidence?.candidateDurationAssetPreview ?? null
  const wizardDurationAssetPreviewItems = wizardDurationAssetPreview?.items ?? []
  const wizardCandidateAcceptancePlanPreview = wizardGenerationEvidence?.candidateAcceptancePlanPreview ?? null
  const wizardCandidateAcceptancePlanFallbackFromProjectTarget = wizardCandidateAcceptancePlanPreview?.fallbackFromProjectTarget === true
  const wizardCandidateAcceptancePlanFirstItem = wizardCandidateAcceptancePlanPreview?.items?.[0] ?? null
  const wizardCandidateAcceptancePlanSourceBasis = wizardCandidateAcceptancePlanFirstItem?.sourceBasis?.trim() || ''
  const wizardDurationAssetHasRuntimeBreakdown = Boolean(
    wizardDurationAssetSummary
      && (
        wizardDurationAssetActiveSeedRowCount > 0
        || wizardDurationAssetFallbackSeedRowCount > 0
        || wizardDurationAssetActiveT2RowCount > 0
        || wizardDurationAssetFallbackT2RowCount > 0
        || wizardDurationAssetRuntimeReferenceDaysRowCount > 0
        || wizardDurationAssetMissingRuntimeReferenceDaysCount > 0
      ),
  )
  const wizardDurationAssetUsesColdStartAssets = Boolean(
    wizardDurationAssetSummary
      && wizardDurationAssetHasRuntimeBreakdown
      && (
        wizardDurationAssetActiveSeedRowCount < wizardDurationAssetSeedRowCount
        || wizardDurationAssetActiveT2RowCount < wizardDurationAssetT2RowCount
      ),
  )
  const [acceptingAccelerationDraft, setAcceptingAccelerationDraft] = useState(false)
  const [evaluatingRuntimeAcceleration, setEvaluatingRuntimeAcceleration] = useState(false)
  const accelerationReschedulePreviewByTaskId = useMemo(
    () => buildAccelerationReschedulePreviewMap(wizardTargetFeasibility),
    [wizardTargetFeasibility],
  )
  useEffect(() => {
    setWizardTargetFeasibility(readStoredTargetFeasibility(id))
    setWizardGenerationEvidence(
      readStoredWizardGenerationEvidence(id)
        ?? readWizardGenerationEvidenceFromProjectMetadata(currentProject?.metadata),
    )
  }, [currentProject?.metadata, id, location.search])
  const {
    activeFilterCount,
    clearAllFilters,
    debouncedSearchText,
    filterBuilding,
    filterCritical,
    filterPriority,
    filterSpecialty,
    filterStatus,
    searchText,
    setFilterBuilding,
    setFilterPriority,
    setFilterSpecialty,
    setFilterStatus,
    setSearchText,
    setShowFilterBar,
    setShowRiskIssueOnly,
    showFilterBar,
    showRiskIssueOnly,
    toggleCriticalFilter,
  } = useGanttFilters({ projectId: id, milestoneFilterId })
  useGanttHighlightTask({ loading, taskId: highlightTaskId })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const [criticalPathChangeNotice, setCriticalPathChangeNotice] = useState<(CriticalPathChange & { focusTaskId?: string | null }) | null>(null)
  const { confirmDialog, setConfirmDialog, openConfirm } = useConfirmDialog()
  // 新建子任务时继承的父任务 ID
  const [newTaskParentId, setNewTaskParentId] = useState<string | null>(null)

  const [milestoneDialogOpen, setMilestoneDialogOpen] = useState(false)
  const [milestoneTargetTask, setMilestoneTargetTask] = useState<Task | null>(null)

  const [conditionDialogOpen, setConditionDialogOpen] = useState(false)
  const [conditionTask, setConditionTask] = useState<Task | null>(null)
  const [taskConditions, setTaskConditions] = useState<TaskCondition[]>([])
  const [conditionsLoading, setConditionsLoading] = useState(false)
  const [conditionPrecedingTasks, setConditionPrecedingTasks] = useState<Record<string, Array<{task_id: string; title?: string; status?: string}>>>({})
  const [newConditionName, setNewConditionName] = useState('')
  const [newConditionType, setNewConditionType] = useState<string>('other')
  const [newConditionTargetDate, setNewConditionTargetDate] = useState('')       // P1-6: 目标日期
  const [newConditionDescription, setNewConditionDescription] = useState('')     // [G3]: 条件说明
  const [newConditionResponsibleUnit, setNewConditionResponsibleUnit] = useState('')
  const [newConditionPrecedingTaskIds, setNewConditionPrecedingTaskIds] = useState<string[]>([])
  const [confirmConditionDialogOpen, setConfirmConditionDialogOpen] = useState(false)
  const [confirmCondition, setConfirmCondition] = useState<TaskCondition | null>(null)
  const [confirmConditionReason, setConfirmConditionReason] = useState('')

  const [obstacleDialogOpen, setObstacleDialogOpen] = useState(false)
  const [obstacleTask, setObstacleTask] = useState<Task | null>(null)
  const [taskObstacles, setTaskObstacles] = useState<TaskObstacle[]>([])
  const [obstaclesLoading, setObstaclesLoading] = useState(false)

  const [expandedConditionTaskId, setExpandedConditionTaskId] = useState<string | null>(null)
  const [inlineConditionsMap, setInlineConditionsMap] = useState<Record<string, TaskCondition[]>>({})
  const [newObstacleTitle, setNewObstacleTitle] = useState('')
  const [newObstacleSeverity, setNewObstacleSeverity] = useState('medium')
  const [newObstacleExpectedResolutionDate, setNewObstacleExpectedResolutionDate] = useState('')
  const [newObstacleResolutionNotes, setNewObstacleResolutionNotes] = useState('')
  const [editingObstacleId, setEditingObstacleId] = useState<string | null>(null)
  const [editingObstacleTitle, setEditingObstacleTitle] = useState('')
  const [editingObstacleSeverity, setEditingObstacleSeverity] = useState('medium')
  const [editingObstacleExpectedResolutionDate, setEditingObstacleExpectedResolutionDate] = useState('')
  const [editingObstacleResolutionNotes, setEditingObstacleResolutionNotes] = useState('')
  const [deleteGuardTarget, setDeleteGuardTarget] = useState<DeleteGuardTarget | null>(null)
  const [deleteGuardSubmitting, setDeleteGuardSubmitting] = useState(false)
  const [deleteGuardSecondarySubmitting, setDeleteGuardSecondarySubmitting] = useState(false)
  const [conditionWarningTarget, setConditionWarningTarget] = useState<null | {
    taskId: string
    taskTitle: string
    pendingConditionCount: number
  }>(null)

  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const [inlineTitleTaskId, setInlineTitleTaskId] = useState<string | null>(null)
  const [inlineTitleValue, setInlineTitleValue] = useState<string>('')
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null)

  // 版本冲突弹窗状态
  const [conflictOpen, setConflictOpen] = useState(false)
  const [conflictData, setConflictData] = useState<{
    localVersion: Task
    serverVersion: Task
  } | null>(null)
  const [pendingTaskData, setPendingTaskData] = useState<Partial<Task> | null>(null)
  const [formData, setFormData] = useState(createEmptyGanttTaskFormData)
  const [participantUnitsOpen, setParticipantUnitsOpen] = useState(false)
  const { groupMode, setGroupMode } = useGroupMode(id)
  const {
    engineeringObjects,
    engineeringObjectsLoaded,
    engineeringObjectsLoading,
    ensureParticipantUnitsForLookup,
    participantUnits,
    participantUnitsLoading,
    projectMembers,
    setEngineeringObjects,
    setParticipantUnits,
  } = useGanttReferenceData({
    projectId: id,
    dialogOpen,
    conditionDialogOpen,
    participantUnitsOpen,
    engineeringObjectsRequired: groupMode === 'spatial',
  })
  const {
    scopeBarOptions,
    scopeSelection,
    setScopeSelection,
    taskFieldConfigStorageKey,
    taskScope,
    templateGenerateScope,
    templateGenerateScopeLabel,
  } = useGanttScopePreferences({
    engineeringObjects,
    projectId: id,
    userId: currentUser?.id,
  })
  const [participantUnitSaving, setParticipantUnitSaving] = useState(false)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [reconcileEntries, setReconcileEntries] = useState<ReconcileTaskEntry[]>([])
  const [reconcileConflictIndex, setReconcileConflictIndex] = useState(0)
  const [participantUnitDraft, setParticipantUnitDraft] = useState<ParticipantUnitDraft>(() => createEmptyParticipantUnitDraft(id))
  const [taskFormErrors, setTaskFormErrors] = useState<GanttTaskFormErrors>({})
  const canConfirmConditionSatisfied = useMemo(() => {
    if (!currentUser?.id) return false
    if (currentUser.global_role === 'company_admin') return true
    if (currentProject?.owner_id && currentProject.owner_id === currentUser.id) return true
    return projectMembers.some((member) => member.userId === currentUser.id && ['owner', 'admin'].includes(String(member.permissionLevel ?? '').trim().toLowerCase()))
  }, [currentProject?.owner_id, currentUser?.global_role, currentUser?.id, projectMembers])

  const [newTaskConditionPromptId, setNewTaskConditionPromptId] = useState<string | null>(null)
  const {
    canRedoTaskTableDraft,
    canUndoTaskTableDraft,
    enqueueTaskTableDraftPatch,
    handleCancelTaskTableDraft,
    handleRedoTaskTableDraft,
    handleStartTaskTableDraft,
    handleUndoTaskTableDraft,
    recordTaskTableDraftPatches,
    resetTaskTableDraftPatches,
    setTaskTableEditing,
    taskTableDraftDeletedIds,
    taskTableDraftDirtyCellMap,
    taskTableDraftDirtyRowIds,
    taskTableDraftPatches,
    taskTableDraftRows,
    taskTableEditing,
  } = useGanttTaskDraftState({
    canEdit,
    projectId: id,
    tasks: tasks as Task[],
  })
  const {
    allSelected,
    batchUpdating,
    collapsed,
    flatList,
    selectedIds,
    setBatchUpdating,
    setSelectedIds,
    someSelected,
    toggleCollapse,
    toggleSelect,
    toggleSelectAll,
    wbsTree,
  } = useGanttTreeState({
    projectId: id,
    tasks: taskTableDraftRows,
  })
  const scopedProjectConditions = projectConditions as TaskCondition[]
  const scopedProjectObstacles = projectObstacles as TaskObstacle[]

  const {
    blockedProgressTaskIds,
    editingProgressReadOnlyReason,
    editingTaskConditions,
    openConditionWarning,
    progressInputBlocked,
    progressInputHint,
    taskProgressSnapshot,
    unmetEditingTaskConditions,
  } = useGanttTaskProgressState({
    editingTask,
    projectConditions: scopedProjectConditions,
    projectObstacles: scopedProjectObstacles,
    setConditionWarningTarget,
    tasks: tasks as Task[],
  })

  const {
    buildingOptions,
    criticalPathOverrideFlags,
    criticalPathDisplayTaskIds,
    criticalPathSnapshot,
    criticalPathSummaryText,
    criticalPathTaskMap,
    dependencyChainIds,
    filteredFlatList,
    getBusinessStatus,
    getCriticalPathSourceType,
    isOnCriticalPath,
    milestoneOptions,
    planningHealthIssues,
    selectedCriticalPathTask,
    selectedTaskView,
    specialtyOptions,
    taskMap,
  } = useGanttDerivedViewState({
    criticalPathOverrides,
    criticalPathSummary,
    debouncedSearchText,
    editingTask,
    filterBuilding,
    filterCritical,
    filterPriority,
    filterSpecialty,
    filterStatus,
    flatList,
    hoveredTaskId,
    milestoneFilterId,
    relatedRiskIssueSummaryByTaskId,
    relatedRiskIssueTaskIds,
    selectedTask,
    setShowFilterBar,
    setShowRiskIssueOnly,
    showRiskIssueOnly,
    taskProgressSnapshot,
    taskTableDraftRows,
    tasks: tasks as Task[],
    wbsTree,
  })

  const hasDashboardSummaryMetrics = hasReadySummaryCount(projectSummary, tasks.length)
  const mainExecutionRows = useMemo(
    () => filteredFlatList
      .filter(shouldShowTaskInMainExecutionList)
      .map(withTaskScheduleEvidence),
    [filteredFlatList],
  )

  const {
    engineeringObjectLabelsById,
    exportOpen,
    handleExportTaskList,
    setExportOpen,
  } = useGanttTaskExport({
    currentProjectName: currentProject?.name,
    criticalPathTaskIds: criticalPathDisplayTaskIds,
    engineeringObjects,
    rows: mainExecutionRows,
    taskFieldConfigStorageKey,
    taskFieldRegistryVersion: taskListFieldRegistry.registry?.registryVersion,
  })
  const [engineeringObjectsOpen, setEngineeringObjectsOpen] = useState(false)

  const {
    handleAddFirstTaskRow,
    handleApplyBatchUpdate,
    handleBatchComplete,
    handleBatchDelete,
    handleDeleteTaskRows,
    handleFillTaskRows,
    handleInlineProgressSave,
    handleInlineTaskPatchSave,
    handleInlineTitleSave,
    handleImportTaskFile,
    handlePasteTaskRows,
    handleProgressEntrySave,
    handleStatusChange,
    handleTaskTableProgressDraftSave,
    handleUpdateTaskCells,
  } = useGanttTaskTableActions({
    batchUpdating,
    blockedProgressTaskIds,
    canEdit,
    engineeringObjects,
    enqueueTaskTableDraftPatch,
    flatList,
    inlineTitleValue,
    participantUnits,
    projectId: id,
    recordTaskTableDraftPatches,
    scopeSelection,
    selectedIds,
    setBatchUpdating,
    setInlineTitleTaskId,
    setInlineTitleValue,
    setSelectedIds,
    setTaskTableEditing,
    taskConditionSummaryByTaskId: taskProgressSnapshot.taskConditionMap,
    taskTableDraftPatches,
    taskTableDraftRows,
    taskTableEditing,
    tasks: tasks as Task[],
    openConditionWarning,
  })

  const { handleSelectMilestoneLevel } = useGanttMilestoneActions({
    enqueueTaskTableDraftPatch,
    milestoneTargetTask,
    setMilestoneDialogOpen,
    setMilestoneTargetTask,
  })

  const {
    confirmConditionSatisfied,
    handleAddCondition,
    handleAddConditionValue,
    handleConfirmConditionSatisfied,
    handleDeleteCondition,
    handleToggleCondition,
    openConditionDialog,
    toggleInlineConditions,
  } = useGanttConditionActions({
    canEdit,
    conditionTask,
    confirmCondition,
    confirmConditionReason,
    expandedConditionTaskId,
    inlineConditionsMap,
    newConditionDescription,
    newConditionName,
    newConditionPrecedingTaskIds,
    newConditionResponsibleUnit,
    newConditionTargetDate,
    newConditionType,
    openConfirm,
    participantUnits,
    projectConditions: scopedProjectConditions,
    setConditionDialogOpen,
    setConditionPrecedingTasks,
    setConditionTask,
    setConditionsLoading,
    setConfirmCondition,
    setConfirmConditionDialogOpen,
    setConfirmConditionReason,
    setExpandedConditionTaskId,
    setInlineConditionsMap,
    setNewConditionDescription,
    setNewConditionName,
    setNewConditionPrecedingTaskIds,
    setNewConditionResponsibleUnit,
    setNewConditionTargetDate,
    setNewConditionType,
    setProjectConditions,
    setTaskConditions,
    taskConditions,
  })

  useEffect(() => {
    setParticipantUnitDraft(createEmptyParticipantUnitDraft(id))
  }, [id])

  const {
    applyCommittedTaskRows,
    commitTaskListOperations,
    handleSaveTaskTableDraft,
  } = useGanttTaskCommitActions({
    addTask,
    canEdit,
    currentProjectId: currentProject?.id,
    fieldRegistryVersion: taskListFieldRegistry.registry?.registryVersion,
    onOpenCriticalPathDialog: handleOpenCriticalPathDialog,
    projectId: id,
    refetchFieldRegistry: taskListFieldRegistry.refetch,
    resetTaskTableDraftPatches,
    setCriticalPathChangeNotice,
    setDeleteGuardTarget,
    setTaskTableEditing,
    taskTableDraftPatches,
    tasks: tasks as Task[],
    updateTask,
  })

  const handleAcceptAccelerationRescheduleDraft = React.useCallback(async (proposal: WbsAccelerationProposal) => {
    if (!canEdit) {
      toast({ title: '当前无权调整计划', description: '请联系项目管理员后再采纳重排草案。' })
      return
    }
    const operations = buildAccelerationRescheduleCommitOperations(proposal, tasks as Task[])
    if (operations.length === 0) {
      toast({ title: '没有可提交的重排变更', description: '当前草案没有匹配到可保存的任务日期或前置关系。' })
      return
    }

    setAcceptingAccelerationDraft(true)
    try {
      const committed = await commitTaskListOperations(operations)
      applyCommittedTaskRows(committed.rows)
      await refreshGanttProjectData({ includeSummary: true })
      if (id) {
        try {
          await recordScheduleAccelerationRecommendationAdoption(id, proposal, {
            outcomeRef: `task-list-commit:${id}:${committed.revision ?? Date.now()}:acceleration-reschedule`,
            outcomeMetadata: {
              source: 'gantt_target_acceleration_reschedule_commit',
              revision: committed.revision ?? null,
              operationCount: operations.length,
              governanceSummary: committed.governanceSummary ?? null,
              criticalPathChangeSummary: committed.criticalPathChangeSummary ?? null,
              rescheduleDraftOperationCount: proposal.rescheduleDraft?.operations.length ?? 0,
            },
          })
        } catch (adoptionError) {
          toast({
            title: '閲嶆帓宸叉彁浜わ紝但采纳记录未写入',
            description: getApiErrorMessage(adoptionError, '后续赶工效果回测可能暂时无法归因到本次采纳，请稍后重试。'),
            variant: 'destructive',
          })
        }
      }
      if (typeof window !== 'undefined' && id) {
        window.sessionStorage.removeItem(`${WIZARD_ACCELERATION_STORAGE_PREFIX}${id}`)
      }
      setWizardTargetFeasibility(null)
      toast({
        title: '已采纳重排草案',
        description: `已提交 ${operations.length} 项计划日期或前置关系调整。`,
      })
    } catch (error) {
      toast({
        title: '采纳重排草案失败',
        description: getApiErrorMessage(error, '请检查字段注册表、任务权限或前置关系后重试。'),
        variant: 'destructive',
      })
    } finally {
      setAcceptingAccelerationDraft(false)
    }
  }, [
    applyCommittedTaskRows,
    canEdit,
    commitTaskListOperations,
    id,
    refreshGanttProjectData,
    tasks,
  ])

  const handleEvaluateRuntimeScheduleAcceleration = React.useCallback(async () => {
    if (!id) {
      toast({ title: '缺少项目 ID', description: '请重新进入项目后再生成赶工建议。', variant: 'destructive' })
      return
    }

    const targetEndDate = projectSummary?.plannedEndDate
      ?? currentProject?.planned_end_date
      ?? currentProject?.end_date
      ?? null
    if (!targetEndDate) {
      toast({ title: '缺少目标完工日', description: '请先维护项目目标完工日期，再生成运行期赶工建议。' })
      return
    }

    setEvaluatingRuntimeAcceleration(true)
    try {
      const result = await evaluateProjectScheduleAcceleration(id, {
        targetEndDate,
        mode: 'compression_preview',
      })
      const overshootValue = readAvailableDurationValue(result.targetFeasibility?.overshoot, 'calendar_day')
      if (result.targetFeasibility?.accelerationProposal && overshootValue !== null && overshootValue > 0) {
        setWizardTargetFeasibility(result.targetFeasibility)
        toast({
          title: '已生成运行期赶工建议',
          description: `预计晚于目标 ${formatDurationMetric(result.targetFeasibility.overshoot, { absolute: true })}，可追回约 ${formatDurationMetric(result.targetFeasibility.recoverable, { absolute: true })}。`,
        })
        return
      }

      setWizardTargetFeasibility(result.targetFeasibility ?? null)
      toast({
        title: '当前暂无可审阅赶工草案',
        description: (readAvailableDurationValue(result.projectRemainingForecast?.targetGap, 'calendar_day') ?? 0) > 0
          ? '系统识别到目标缺口，但当前关键路径、硬约束或施工组织条件不足以生成可采纳草案。'
          : '当前项目整体剩余工期未形成目标缺口。',
      })
    } catch (error) {
      toast({
        title: '生成赶工建议失败',
        description: getApiErrorMessage(error, '请稍后重试，或先刷新关键路径和项目剩余工期。'),
        variant: 'destructive',
      })
    } finally {
      setEvaluatingRuntimeAcceleration(false)
    }
  }, [
    currentProject?.end_date,
    currentProject?.planned_end_date,
    id,
    projectSummary?.plannedEndDate,
  ])

  const {
    handleDependencyChange,
    handleKeepLocal,
    handleKeepServer,
    handleMerge,
    handleSaveTask,
    openEditDialog,
  } = useGanttTaskDialogActions({
    canEdit,
    conflictData,
    dialogOpen,
    editingProgressReadOnlyReason,
    editingTask,
    formData,
    pendingTaskData,
    projectId: id,
    scopeSelection,
    taskSaving,
    taskTableDraftRows,
    tasks: tasks as Task[],
    unmetEditingTaskConditions,
    enqueueTaskTableDraftPatch,
    openConditionWarning,
    recordTaskTableDraftPatches,
    setConflictData,
    setConflictOpen,
    setDialogOpen,
    setEditingTask,
    setFormData,
    setLiveCheckLoading,
    setLiveCheckSummary,
    setNewTaskConditionPromptId,
    setNewTaskParentId,
    setPendingTaskData,
    setSelectedIds,
    setTaskFormErrors,
    setTaskSaving,
    setTaskTableEditing,
    updateTask,
  })

  const {
    closeDeleteGuard,
    handleConfirmDeleteGuard,
  } = useGanttDeleteGuardActions({
    commitTaskListOperations,
    deleteGuardSecondarySubmitting,
    deleteGuardSubmitting,
    deleteGuardTarget,
    deleteTask,
    projectId: id,
    projectObstacles,
    refreshGanttProjectData,
    setDeleteGuardSubmitting,
    setDeleteGuardTarget,
    setProjectObstacles,
    setTaskObstacles,
  })

  const {
    handleParticipantUnitCreateNew,
    handleParticipantUnitDelete,
    handleParticipantUnitEdit,
    handleParticipantUnitSubmit,
    handleParticipantUnitsOpenChange,
    openParticipantUnitsDialog,
  } = useGanttParticipantUnitActions({
    canEdit,
    loadTasks,
    participantUnitDraft,
    participantUnits,
    projectId: id,
    setParticipantUnitDraft,
    setParticipantUnitSaving,
    setParticipantUnits,
    setParticipantUnitsOpen,
  })

  const activeTaskScopePatch = taskScope.patch
  const hasActiveTaskScopeSelection = taskScope.hasSelection
  const {
    closePlanningDetailDrawer,
    detailDrawerAcceptanceItems,
    detailDrawerBlockageRecords,
    detailDrawerConditionRecords,
    detailDrawerConditions,
    detailDrawerObstacles,
    detailDrawerPredecessors,
    detailDrawerPrimaryObjectId,
    detailDrawerRelatedRiskIssueCount,
    detailDrawerRelatedRiskIssueSummary,
    detailDrawerScopeObjects,
    detailDrawerSection,
    detailDrawerTask,
    detailDrawerTaskIndex,
    detailScopeDirty,
    detailScopeDraftObjectId,
    engineeringObjectLookupOptions,
    handleSaveDetailDrawerScopeObject,
    openPlanningDetailDrawer,
    setDetailDrawerSection,
    setDetailDrawerTaskId,
    setDetailScopeDraftObjectId,
    switchPlanningDetailDrawerTask,
  } = useGanttDetailDrawer({
    canEdit,
    engineeringObjects,
    filteredFlatList: mainExecutionRows,
    flatList,
    handleInlineTaskPatchSave,
    onOpenDetailDrawer: () => setExpandedConditionTaskId(null),
    projectConditions: scopedProjectConditions,
    projectObstacles: scopedProjectObstacles,
    relatedRiskIssueSummaryByTaskId,
    taskMap,
    tasks: tasks as Task[],
  })
  const {
    handleAddDrawerBlockage,
    handleAddObstacle,
    handleCloseObstacleRecord,
    handleDeleteObstacle,
    handleQuickAddTaskObstacle,
    handleResolveObstacle,
    handleSaveObstacleEdit,
    openObstacleDialog,
  } = useGanttObstacleActions({
    canEdit,
    deleteGuardTarget,
    detailDrawerTask,
    editingObstacleExpectedResolutionDate,
    editingObstacleResolutionNotes,
    editingObstacleSeverity,
    editingObstacleTitle,
    newObstacleExpectedResolutionDate,
    newObstacleResolutionNotes,
    newObstacleSeverity,
    newObstacleTitle,
    obstacleTask,
    projectId: id,
    projectObstacles: scopedProjectObstacles,
    setDeleteGuardSecondarySubmitting,
    setDeleteGuardTarget,
    setEditingObstacleExpectedResolutionDate,
    setEditingObstacleId,
    setEditingObstacleResolutionNotes,
    setEditingObstacleSeverity,
    setEditingObstacleTitle,
    setNewObstacleExpectedResolutionDate,
    setNewObstacleResolutionNotes,
    setNewObstacleSeverity,
    setNewObstacleTitle,
    setObstacleDialogOpen,
    setObstacleTask,
    setObstaclesLoading,
    setProjectObstacles,
    setTaskObstacles,
    taskObstacles,
  })
  const planningGovernance = projectSummary?.planningGovernance
  const [baselineActionPending, setBaselineActionPending] = useState(false)
  const hasBaseline = baselineOptionsLoaded && baselineOptions.some((option) => ['confirmed', 'pending_realign', 'closed'].includes(String(option.status ?? '').trim()))
  const handleOpenBaselineGovernance = React.useCallback(async () => {
    if (!id) return
    if (!canEdit) {
      navigate(`/projects/${id}/planning/baseline`)
      return
    }

    setBaselineActionPending(true)
    try {
      await apiPost('/api/task-baselines/generate', { project_id: id })
      toast({
        title: hasBaseline ? '已生成基线更新草稿' : '已开启计划治理',
        description: '已基于当前已保存的任务列表生成项目基线草稿，可在项目基线页复核后发布。',
      })
      navigate(`/projects/${id}/planning/baseline`)
    } catch (error) {
      toast({
        title: hasBaseline ? '更新基线失败' : '计划治理启动失败',
        description: getApiErrorMessage(error, '请确认任务列表已有已保存数据后再试。'),
        variant: 'destructive',
      })
    } finally {
      setBaselineActionPending(false)
    }
  }, [canEdit, hasBaseline, id, navigate])
  const currentCompanyId = (currentUser as { currentCompanyId?: string | null; company_id?: string | null } | null)?.currentCompanyId
    ?? (currentUser as { currentCompanyId?: string | null; company_id?: string | null } | null)?.company_id
    ?? (typeof window !== 'undefined' ? window.localStorage.getItem('current_company_id') : null)
    ?? 'default'
  const handleSaveCompanyTemplate = React.useCallback(async (name: string, description: string, overwriteExisting: boolean) => {
    try {
      await apiPost(`/api/companies/${encodeURIComponent(currentCompanyId)}/project-templates`, {
        name,
        description,
        sourceProjectId: id,
        businessType: String(currentProject?.project_type ?? 'general_civil'),
        businessSubtype: String(currentProject?.building_type ?? ''),
        methodVariantCodes: [],
        projectFeatures: {},
        scopeTreeSnapshot: engineeringObjects,
        defaultDetailLevel: 'overview',
        snapshot: {
          source: 'task_list',
          projectId: id,
          projectName: currentProject?.name ?? '',
          taskCount: tasks.length,
          overwriteExisting,
        },
      })
      toast({ title: '已保存为公司模板', description: '下次新建项目时可在公司模板入口复用。' })
    } catch (error) {
      toast({
        title: '保存公司模板失败',
        description: getApiErrorMessage(error, '请稍后重试。'),
        variant: 'destructive',
      })
    }
  }, [currentCompanyId, currentProject?.building_type, currentProject?.name, currentProject?.project_type, engineeringObjects, id, tasks.length])
  const openModelingWorkbench = React.useCallback((mode: PlanningModelingWorkbenchMode, taskId?: string | null) => {
    if (!id) return
    const nextSearch = new URLSearchParams(location.search)
    nextSearch.set('modelingWorkbench', mode)
    if (taskId) nextSearch.set('taskPlanTaskId', taskId)
    else nextSearch.delete('taskPlanTaskId')
    navigate(`/projects/${encodeURIComponent(id)}/gantt?${nextSearch.toString()}`)
  }, [id, location.search, navigate])
  const closeModelingWorkbench = React.useCallback(() => {
    if (!id) return
    const nextSearch = new URLSearchParams(location.search)
    nextSearch.delete('modelingWorkbench')
    nextSearch.delete('taskPlanTaskId')
    const query = nextSearch.toString()
    navigate(`/projects/${encodeURIComponent(id)}/gantt${query ? `?${query}` : ''}`)
  }, [id, location.search, navigate])
  const handleModelingWorkbenchGenerated = React.useCallback((projectId: string, targetParams: string) => {
    const nextSearch = new URLSearchParams()
    nextSearch.set('wizard_generated', 'true')
    if (targetParams) {
      const targetSearch = new URLSearchParams(targetParams.replace(/^&/, ''))
      targetSearch.forEach((value, key) => nextSearch.set(key, value))
    }
    navigate(`/projects/${encodeURIComponent(projectId)}/gantt?${nextSearch.toString()}`)
    void refreshGanttProjectData({ includeSummary: true })
  }, [navigate, refreshGanttProjectData])
  const handleOpenTemplateAdjustWizard = React.useCallback(() => {
    if (!id) return
    openModelingWorkbench('adjust')
  }, [id, openModelingWorkbench])
  const handleReconcileEntryAction = React.useCallback((taskId: string, action: 'merge_to_standard' | 'keep_both' | 'replace_with_standard') => {
    setReconcileEntries((current) => current.map((entry) => (
      entry.taskId === taskId
        ? { ...entry, reason: `${entry.reason} · ${action}` }
        : entry
    )))
  }, [])
  const shouldRenderGanttDialogs =
    dialogOpen
    || conflictOpen
    || milestoneDialogOpen
    || conditionDialogOpen
    || obstacleDialogOpen
    || confirmConditionDialogOpen
    || confirmDialog.open
  const handleOpenTaskListWizard = React.useCallback((task?: Task) => {
    if (!id) return
    openModelingWorkbench(task ? 'expand' : 'generate', task?.id)
  }, [id, openModelingWorkbench])
  const {
    handleOpenEngineeringObjects,
    scrollTaskWorkspaceToToday,
    taskListBusinessActions,
    taskListEditBusinessActions,
  } = useGanttBusinessActionSlots({
    baselineActionPending,
    baselineStatusKnown: baselineOptionsLoaded,
    canEdit,
    hasBaseline,
    onOpenCriticalPath: handleOpenCriticalPathDialog,
    onOpenBaselineGovernance: handleOpenBaselineGovernance,
    onOpenFilters: () => setShowFilterBar(true),
    onOpenTaskListWizard: handleOpenTaskListWizard,
    onImportTasks: handleImportTaskFile,
    onOpenReconcile: handleOpenTemplateAdjustWizard,
    onOpenSaveCompanyTemplate: () => setSaveTemplateOpen(true),
    projectId: id,
    selectedTaskId: selectedTask?.id,
    setExportOpen,
    setEngineeringObjectsOpen,
    timelineViewRef,
    viewMode,
  })
  const taskListPageActions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"
        onClick={() => void handleLightRefresh()}
        disabled={refreshingTaskList}
        data-testid="gantt-light-refresh"
      >
        <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', refreshingTaskList && 'animate-spin')} />
        {refreshingTaskList ? '刷新中' : '刷新'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-lg px-2.5 text-xs"
        onClick={() => navigate(`/projects/${id}/dashboard`)}
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
        返回仪表盘
      </Button>
      {viewMode === 'gantt' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-slate-200 bg-white px-2.5 text-xs"
          onClick={scrollTaskWorkspaceToToday}
          data-testid="gantt-scroll-to-today"
        >
          <CalendarCheck className="mr-1.5 h-3.5 w-3.5" />
          今天
        </Button>
      ) : null}
    </div>
  )
  if (loading) {
    return (
      <div className="page-shell" data-testid="gantt-loading-skeleton">
        <GanttViewSkeleton />
      </div>
    )
  }

  const taskListProjectName = currentProject?.name?.trim() || '当前项目'

  return (
    <PlanningPageShell
      projectName={taskListProjectName}
      eyebrow="计划编制"
      title="任务列表"
      description="项目现场执行表，承接实时排期、进度维护、开工条件与阻碍登记。"
      frame="open"
      tabs={[]}
      breadcrumbItems={[
        { label: taskListProjectName, href: `/projects/${id}/dashboard` },
        { label: '计划编制' },
        { label: '任务列表' },
      ]}
      metrics={!pageLoadError ? <TaskListMetricCards summary={projectSummary} summaryPending={!hasDashboardSummaryMetrics} /> : undefined}
      actions={taskListPageActions}
      className="pb-20"
    >
      {pageLoadError ? (
        <Alert variant="destructive">
          <AlertDescription>{pageLoadError}</AlertDescription>
        </Alert>
      ) : null}

      <GanttGovernanceBanner planningGovernance={planningGovernance} />

      <V14231PageReadinessBoundary pageKey="Gantt / Planning" />

      <ProjectRemainingForecastCard
        projectId={id || ''}
        targetEndDate={projectSummary?.plannedEndDate ?? currentProject?.planned_end_date ?? currentProject?.end_date ?? null}
        testId="gantt-project-remaining-forecast"
        title="执行期项目整体剩余工期"
        description="运行期赶工、关键路径快照、月计划承诺与外部接口约束共用这一套项目级剩余工期信号。"
        tone="gantt"
        onOpenAcceleration={handleEvaluateRuntimeScheduleAcceleration}
        accelerationActionLoading={evaluatingRuntimeAcceleration}
      />

      {wizardTargetFeasibility && (
        (readAvailableDurationValue(wizardTargetFeasibility.overshoot, 'calendar_day') ?? 0) > 0
        || wizardTargetFeasibility.overshoot?.availability === 'unavailable'
      ) ? (
        <TargetAccelerationReviewPanel
          targetFeasibility={wizardTargetFeasibility}
          tasks={tasks as Task[]}
          onFocusTask={(taskId) => {
            setSelectedTask((tasks as Task[]).find((task) => task.id === taskId) ?? null)
            navigate(`/projects/${id}/gantt?highlight=${encodeURIComponent(taskId)}`)
          }}
          onAcceptRescheduleDraft={handleAcceptAccelerationRescheduleDraft}
          acceptingRescheduleDraft={acceptingAccelerationDraft}
          onDismiss={() => {
            if (typeof window !== 'undefined' && id) {
              window.sessionStorage.removeItem(`${WIZARD_ACCELERATION_STORAGE_PREFIX}${id}`)
            }
            setWizardTargetFeasibility(null)
          }}
        />
      ) : null}

      {showWizardGenerationEvidence && wizardGenerationEvidence ? (
        <Alert className="border-blue-200 bg-blue-50 text-blue-900">
          <AlertDescription className="space-y-2 text-sm">
            <div className="font-semibold">生成证据已接入</div>
            <div className="grid gap-2 md:grid-cols-4">
              <span>候选工期资产 {readEvidenceCount(wizardDurationAssetPreview?.totalCount)} 行</span>
              <span>候选关键路径 {readEvidenceCount(wizardGenerationEvidence.candidateNetworkEvaluation?.projectedNetworkSpanDays)} 天</span>
              <span>
                候选验收计划 {readEvidenceCount(wizardCandidateAcceptancePlanPreview?.datedCount)} 项
                {wizardCandidateAcceptancePlanFallbackFromProjectTarget ? ' / 项目目标日期兜底' : ''}
                {wizardCandidateAcceptancePlanSourceBasis ? ` / 依据 ${wizardCandidateAcceptancePlanSourceBasis}` : ''}
              </span>
              <span>真实关键路径刷新 {readEvidenceCount(wizardGenerationEvidence.criticalPathRefresh?.criticalTaskCount)} 项</span>
            </div>
            {wizardDurationAssetHasRuntimeBreakdown ? (
              <div className="grid gap-2 text-xs text-blue-800 md:grid-cols-3">
                <span>runtime seed {wizardDurationAssetActiveSeedRowCount}/{wizardDurationAssetScheduleRowCount}</span>
                <span>fallback seed {wizardDurationAssetFallbackSeedRowCount}/{wizardDurationAssetScheduleRowCount}</span>
                <span>runtime T2 {wizardDurationAssetActiveT2RowCount}/{wizardDurationAssetScheduleRowCount}</span>
                <span>fallback T2 {wizardDurationAssetFallbackT2RowCount}/{wizardDurationAssetScheduleRowCount}</span>
                <span>已发布学习校准 {wizardDurationAssetRuntimeReferenceDaysRowCount}/{wizardDurationAssetScheduleRowCount}</span>
                <span>未采用学习覆盖 {wizardDurationAssetMissingRuntimeReferenceDaysCount}</span>
              </div>
            ) : null}
            {wizardDurationAssetUsesColdStartAssets ? (
              <div className="text-xs text-blue-800">当前计划已使用系统冷启动资产；已发布学习校准仅作为可选覆盖，不影响计划使用。</div>
            ) : null}
            {wizardDurationAssetPreviewItems.length > 0 ? (
              <div className="rounded-lg border border-blue-100 bg-white/70 p-3 text-xs text-blue-900">
                <div className="font-semibold">候选工期依据明细</div>
                <div className="mt-2 divide-y divide-blue-100">
                  {wizardDurationAssetPreviewItems.map((item, index) => {
                    const title = item.title?.trim() || `候选行 ${index + 1}`
                    const createdTaskId = item.createdTaskId?.trim() || ''
                    const seedLineage = formatWizardDurationAssetPreviewSeedLineage(item)
                    const t2Lineage = formatWizardDurationAssetPreviewT2Lineage(item)
                    const runtimeReferenceDays = formatWizardDurationAssetPreviewRuntimeReferenceDays(item)
                    const dependencyLineage = formatWizardDurationAssetPreviewDependencyLineage(item)
                    return (
                      <div key={`${item.createdTaskId ?? item.title ?? 'candidate'}-${index}`} className="py-2 first:pt-0 last:pb-0">
                        <div className="font-medium text-blue-950">{title}</div>
                        {createdTaskId ? (
                          <div className="mt-1 text-blue-800">对应任务 {createdTaskId}</div>
                        ) : null}
                        <div className="mt-1 grid gap-1 md:grid-cols-2">
                          {seedLineage ? <span>{seedLineage}</span> : null}
                          {t2Lineage ? <span>{t2Lineage}</span> : null}
                          {runtimeReferenceDays ? <span>{runtimeReferenceDays}</span> : null}
                          {item.runtimeReferenceDaysEvidenceLevel ? (
                            <span>参考天数证据 {item.runtimeReferenceDaysEvidenceLevel}</span>
                          ) : null}
                          {item.runtimeReferenceDaysMutationBoundary ? (
                            <span>参考天数边界 {item.runtimeReferenceDaysMutationBoundary}</span>
                          ) : null}
                          {dependencyLineage ? <span>{dependencyLineage}</span> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}
            <div className="text-xs text-blue-800">只读证据，不写入任务、依赖或工期 runtime</div>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* 操作工具栏 */}
      {viewMode !== 'gantt' ? (
        <GanttBatchBar
          allSelected={allSelected}
          someSelected={someSelected}
          selectedCount={selectedIds.size}
          projectMembers={projectMembers}
          participantUnits={participantUnits}
          batchUpdating={batchUpdating}
          canBatchEdit={taskTableEditing}
          onToggleSelectAll={toggleSelectAll}
          onClearSelection={() => setSelectedIds(new Set())}
          onApplyBatchUpdate={handleApplyBatchUpdate}
          onApplyCurrentScope={() => {
            void handleApplyBatchUpdate(activeTaskScopePatch)
          }}
          canApplyCurrentScope={hasActiveTaskScopeSelection}
          onBatchDelete={handleBatchDelete}
        />
      ) : null}

      <div className={!pageLoadError && (!dataQualitySummary || Number(dataQualitySummary.prompt?.count ?? 0) > 0) ? 'min-h-[3rem]' : undefined}>
        <BusinessHealthBanner summary={dataQualitySummary} />
      </div>

      <div data-testid="task-workspace-layer-l2" className="space-y-5">
      <div data-testid="task-workspace-body" className={`grid gap-5 transition-all duration-300 ${selectedTask ? 'xl:grid-cols-[minmax(0,1fr)_20rem]' : 'grid-cols-1'}`}>
        {/* 任务工作区主内容 */}
        <div data-testid="task-workspace-layer-l4" className="min-w-0 transition-all duration-300">
      <Card variant="detail">
        {reconcileEntries.length > 0 ? (
          <div className="px-4 pt-4">
            <ReconcileBanner
              entries={reconcileEntries}
              currentConflictIndex={Math.min(reconcileConflictIndex, Math.max(0, reconcileEntries.filter((entry) => entry.phase === 'rename_suggest').length - 1))}
              onPrevConflict={() => setReconcileConflictIndex((value) => Math.max(0, value - 1))}
              onNextConflict={() => setReconcileConflictIndex((value) => Math.min(Math.max(0, reconcileEntries.filter((entry) => entry.phase === 'rename_suggest').length - 1), value + 1))}
              onAccept={() => {
                setReconcileEntries([])
                toast({ title: '已接受模板治理预览' })
              }}
              onCancel={() => setReconcileEntries([])}
              onEntryAction={handleReconcileEntryAction}
            />
          </div>
        ) : null}
        <GanttWorkspaceChrome
          canEdit={canEdit}
          criticalPathChangeNotice={criticalPathChangeNotice}
          criticalPathSnapshot={criticalPathSnapshot}
          filterActions={{
            clearAllFilters, onBuildingChange: setFilterBuilding, onCriticalToggle: toggleCriticalFilter,
            onPriorityChange: setFilterPriority, onSearchChange: setSearchText, onShowRiskIssueOnlyChange: setShowRiskIssueOnly,
            onSpecialtyChange: setFilterSpecialty, onStatusChange: setFilterStatus, setShowFilterBar,
          }}
          filters={{
            activeFilterCount, buildingOptions, filterBuilding, filterCritical, filterPriority,
            filterSpecialty, filterStatus, filteredFlatListLength: mainExecutionRows.length,
            flatListLength: flatList.length, searchText, showFilterBar, showRiskIssueOnly, specialtyOptions,
          }}
          milestone={{ id: milestoneFilterId, label: milestoneFilterLabel, projectId: id }}
          navigate={navigate}
          onCriticalPathNoticeDismiss={() => setCriticalPathChangeNotice(null)}
          onCriticalPathNoticeViewDetails={() => {
            handleOpenCriticalPathDialog(criticalPathChangeNotice?.focusTaskId ?? selectedTask?.id ?? null)
          }}
          planningHealthIssues={planningHealthIssues}
          signalsPending={!pageLoadError && (!dataQualitySummary || !criticalPathSummary)}
          criticalPathSummaryText={criticalPathSummaryText}
          scope={{
            options: scopeBarOptions, selection: scopeSelection,
            onChange: setScopeSelection, onClear: taskScope.clearSelection,
          }}
          tasks={tasks as Task[]}
          viewMode={viewMode}
        />
        <GanttTaskRows
                tasks={taskTableDraftRows}
                taskConditions={scopedProjectConditions}
                taskObstacles={scopedProjectObstacles}
                flatList={flatList}
              filteredFlatList={filteredFlatList}
              collapsed={collapsed}
              selectedIds={selectedIds}
              canEdit={canEdit}
              expandedConditionTaskId={expandedConditionTaskId}
              inlineConditionsMap={inlineConditionsMap}
              taskProgressSnapshot={taskProgressSnapshot}
              projectMembers={projectMembers}
              participantUnits={participantUnits}
              participantUnitsLoading={participantUnitsLoading}
              taskDraftPatches={taskTableDraftPatches}
              taskDraftDirtyRowIds={taskTableDraftDirtyRowIds}
              taskDraftDirtyCellMap={taskTableDraftDirtyCellMap}
              taskDraftDirtyCount={taskTableDraftDirtyRowIds.size}
              taskDraftEditing={taskTableEditing}
              canUndoTaskDraft={canUndoTaskTableDraft}
              canRedoTaskDraft={canRedoTaskTableDraft}
              engineeringObjectLabelsById={engineeringObjectLabelsById}
              fieldRegistryFields={taskListFieldRegistry.registry?.fields}
              fieldRegistryVersion={taskListFieldRegistry.registry?.registryVersion}
              fieldConfigStorageKey={taskFieldConfigStorageKey}
              reconcileEntries={reconcileEntries}
              onReconcileEntryAction={handleReconcileEntryAction}
              groupMode={groupMode}
              onGroupModeChange={setGroupMode}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              readBusinessActionsSlot={taskListBusinessActions}
              editBusinessActionsSlot={taskListEditBusinessActions}
              ganttRenderer={(rendererProps) => (
                <GanttChart
                  rows={rendererProps.rows}
                  selectedRowIds={rendererProps.selectedRowIds}
                  onRowClick={rendererProps.onRowClick}
                  scale={rendererProps.scale}
                  readOnly={rendererProps.readOnly}
                  className="p-4 pt-0"
                >
                  {mainExecutionRows.length > 50 ? (
                    <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-700">
                      提示：可使用鼠标滚轮缩放时间轴，拖拽平移。
                    </div>
                  ) : null}
                  <TaskTimelineView
                    ref={timelineViewRef}
                    rows={mainExecutionRows}
                    collapsed={collapsed}
                    selectedTaskId={selectedTask?.id}
                    highlightTaskId={highlightTaskId}
                    reschedulePreviewByTaskId={accelerationReschedulePreviewByTaskId}
                    scale={rendererProps.scale}
                    compareMode={timelineCompareMode}
                    baselineOptions={baselineOptions}
                    baselineVersionId={timelineBaselineVersionId}
                    baselineLoading={baselineLoading}
                    onScaleChange={(nextScale) => {
                      rendererProps.onScaleChange?.(nextScale)
                      setTimelineScale(nextScale)
                    }}
                    onCompareModeChange={setTimelineCompareMode}
                    onBaselineVersionIdChange={setTimelineBaselineVersionId}
                    onToggleCollapse={toggleCollapse}
                    onSelectTask={(task) => setSelectedTask((previous) => (previous?.id === task.id ? null : task))}
                    isOnCriticalPath={isOnCriticalPath}
                    getCriticalPathSourceType={getCriticalPathSourceType}
                  />
                </GanttChart>
              )}
              inlineTitleTaskId={inlineTitleTaskId}
                inlineTitleValue={inlineTitleValue}
              onClearFilters={clearAllFilters}
                onToggleCollapse={toggleCollapse}
                onToggleSelect={toggleSelect}
                onSelectTask={(task) => setSelectedTask((previous) => (previous?.id === task.id ? null : task))}
                onOpenMilestoneDialog={(task) => {
                  setMilestoneTargetTask(task)
                  setMilestoneDialogOpen(true)
                }}
                onOpenEditDialog={openEditDialog}
                onOpenConditionDialog={openConditionDialog}
                onOpenObstacleDialog={openObstacleDialog}
                onQuickAddObstacle={handleQuickAddTaskObstacle}
                onOpenDetailDrawer={openPlanningDetailDrawer}
                onDeleteTask={(taskId) => handleDeleteTaskRows([taskId])}
                onStatusChange={handleStatusChange}
                onSaveProgress={taskTableEditing ? handleTaskTableProgressDraftSave : handleInlineProgressSave}
                onSaveTaskPatch={handleInlineTaskPatchSave}
                onLoadParticipantUnits={ensureParticipantUnitsForLookup}
                onOpenParticipantUnits={openParticipantUnitsDialog}
                onPasteRows={handlePasteTaskRows}
                onDeleteRows={handleDeleteTaskRows}
                onFillRows={handleFillTaskRows}
                onUpdateCells={handleUpdateTaskCells}
                onStartTaskDraft={handleStartTaskTableDraft}
                onSaveTaskDraft={handleSaveTaskTableDraft}
                onCancelTaskDraft={handleCancelTaskTableDraft}
                onUndoTaskDraft={handleUndoTaskTableDraft}
                onRedoTaskDraft={handleRedoTaskTableDraft}
                presence={taskListPresence}
                onActiveCellChange={taskListPresence.setEditingCell}
                onToggleInlineConditions={toggleInlineConditions}
                onToggleCondition={handleToggleCondition}
                dependencyChainIds={dependencyChainIds}
                onHoverTaskId={setHoveredTaskId}
                onStartInlineTitleEdit={(task) => {
                  setInlineTitleTaskId(task.id)
                  setInlineTitleValue(task.title || '')
                }}
                onInlineTitleValueChange={setInlineTitleValue}
                onInlineTitleSave={handleInlineTitleSave}
                onCancelInlineTitleEdit={() => setInlineTitleTaskId(null)}
                onOpenCriticalPath={(taskId) => handleOpenCriticalPathDialog(taskId)}
                onMarkCriticalPathAttention={(taskId) => void handleCreateCriticalPathOverride({ taskId, mode: 'manual_attention' })}
                onInsertBeforeChain={(taskId) => setCriticalPathInsertRequest({ anchorTaskId: taskId, direction: 'before' })}
                onInsertAfterChain={(taskId) => setCriticalPathInsertRequest({ anchorTaskId: taskId, direction: 'after' })}
                onRemoveCriticalPathOverride={handleDeleteCriticalPathOverride}
                getBusinessStatus={getBusinessStatus}
                getCriticalPathTask={(taskId) => criticalPathTaskMap.get(taskId) ?? null}
                criticalPathOverrideFlags={criticalPathOverrideFlags}
                emptyFilterTitle={milestoneFilterId ? '该节点暂无关联任务' : undefined}
                onAddFirstRow={handleAddFirstTaskRow}
                onGenerateTasks={handleOpenTaskListWizard}
                onImportTasks={handleImportTaskFile}
                projectId={id || ''}
                templateGenerateScope={templateGenerateScope}
                templateGenerateScopeLabel={templateGenerateScopeLabel}
                targetFeasibility={wizardTargetFeasibility}
              />
      </Card>
        </div>{/* 任务工作区主内容层结束 */}

        <GanttSelectedTaskAside
          projectId={id}
          selectedTask={selectedTaskView}
          setSelectedTask={setSelectedTask}
          navigate={navigate}
          getBusinessStatus={getBusinessStatus}
          onEdit={openEditDialog}
          onOpenCondition={openConditionDialog}
          onOpenObstacle={openObstacleDialog}
          criticalPathSummaryText={criticalPathSummaryText}
          criticalPathError={criticalPathError}
          criticalPathSnapshot={criticalPathSnapshot}
          selectedCriticalPathTask={selectedCriticalPathTask}
          onOpenCriticalPathDialog={() => {
            if (selectedTaskView?.id) handleOpenCriticalPathDialog(selectedTaskView.id)
          }}
          selectedTaskConditionSummary={selectedTaskView?.id ? taskProgressSnapshot.taskConditionMap[selectedTaskView.id] ?? null : null}
          selectedTaskObstacleCount={selectedTaskView?.id ? taskProgressSnapshot.obstacleCountMap[selectedTaskView.id] ?? 0 : 0}
          onSaveProgress={handleProgressEntrySave}
          onQuickAddObstacle={handleQuickAddTaskObstacle}
        />
      </div>
      </div>

      <GanttCriticalPathDialogs
        actionLoading={criticalPathActionLoading}
        currentProjectName={currentProject?.name}
        dialogLoading={criticalPathDialogLoading}
        dialogOpen={criticalPathDialogOpen}
        error={criticalPathError}
        focusTaskId={criticalPathFocusTaskId}
        insertAnchorTask={criticalPathInsertAnchorTask as Task | null}
        insertRequest={criticalPathInsertRequest}
        navigate={navigate}
        onCreateOverride={handleCreateCriticalPathOverride}
        onDeleteOverride={handleDeleteCriticalPathOverride}
        onRefresh={handleRefreshCriticalPath}
        overrides={criticalPathOverrides}
        projectId={id}
        setDialogOpen={setCriticalPathDialogOpen}
        setFocusTaskId={setCriticalPathFocusTaskId}
        setInsertRequest={setCriticalPathInsertRequest}
        summary={criticalPathSummary}
        tasks={tasks as Task[]}
      />

      <GanttDetailDrawer
        task={detailDrawerTask}
        section={detailDrawerSection}
        onSectionChange={setDetailDrawerSection}
        onClose={closePlanningDetailDrawer}
        hasPrevious={detailDrawerTaskIndex > 0}
        hasNext={detailDrawerTaskIndex >= 0 && detailDrawerTaskIndex < mainExecutionRows.length - 1}
        onPreviousTask={() => switchPlanningDetailDrawerTask('previous')}
        onNextTask={() => switchPlanningDetailDrawerTask('next')}
        projectId={id}
        navigate={navigate}
        canEdit={canEdit}
        acceptanceItems={detailDrawerAcceptanceItems}
        blockages={detailDrawerBlockageRecords}
        conditions={detailDrawerConditions}
        conditionRecords={detailDrawerConditionRecords}
        obstacles={detailDrawerObstacles}
        predecessors={detailDrawerPredecessors}
        scopeObjects={detailDrawerScopeObjects}
        relatedRiskIssueCount={detailDrawerRelatedRiskIssueCount}
        relatedRiskIssueSummary={detailDrawerRelatedRiskIssueSummary}
        detailScopeDraftObjectId={detailScopeDraftObjectId}
        primaryScopeObjectId={detailDrawerPrimaryObjectId}
        detailScopeDirty={detailScopeDirty}
        engineeringObjectLookupOptions={engineeringObjectLookupOptions}
        engineeringObjectsLoading={engineeringObjectsLoading}
        onScopeDraftObjectChange={setDetailScopeDraftObjectId}
        onSaveScopeObject={handleSaveDetailDrawerScopeObject}
        onOpenEngineeringObjects={handleOpenEngineeringObjects}
        onToggleCondition={handleToggleCondition}
        onOpenConditionDialog={openConditionDialog}
        onOpenTemplateGenerate={handleOpenTaskListWizard}
        onDeleteCondition={handleDeleteCondition}
        onAddBlockage={handleAddDrawerBlockage}
        onResolveObstacle={handleResolveObstacle}
        onSelectTask={(taskId, nextSection = 'basic') => {
          setDetailDrawerTaskId(taskId)
          setDetailDrawerSection(nextSection)
        }}
      />
      <GanttEditWorkflowDialogs
        shouldRender={shouldRenderGanttDialogs}
        {...{
          dialogOpen, setDialogOpen, editingTask, newTaskParentId, formData, setFormData,
          projectId: id,
          taskFormErrors, setTaskFormErrors, projectMembers, participantUnits, engineeringObjects,
          engineeringObjectsLoading, handleDependencyChange, handleSaveTask, taskSaving,
          liveCheckSummary, liveCheckLoading, progressInputBlocked, progressInputHint,
          conflictOpen, setConflictOpen, handleKeepLocal, handleKeepServer, handleMerge,
          milestoneDialogOpen, setMilestoneDialogOpen, handleSelectMilestoneLevel,
          conditionDialogOpen, setConditionDialogOpen, conditionsLoading, taskConditions,
          conditionPrecedingTasks, newConditionName, setNewConditionName, newConditionType,
          setNewConditionType, newConditionTargetDate, setNewConditionTargetDate,
          newConditionDescription, setNewConditionDescription, newConditionResponsibleUnit,
          setNewConditionResponsibleUnit, newConditionPrecedingTaskIds, setNewConditionPrecedingTaskIds,
          handleAddCondition, handleAddConditionValue, handleToggleCondition, handleDeleteCondition,
          handleConfirmConditionSatisfied, confirmConditionDialogOpen, setConfirmConditionDialogOpen,
          confirmCondition, confirmConditionReason, setConfirmConditionReason, confirmConditionSatisfied,
          canConfirmConditionSatisfied, obstacleDialogOpen, setObstacleDialogOpen, obstaclesLoading,
          taskObstacles, newObstacleTitle, setNewObstacleTitle, newObstacleSeverity, setNewObstacleSeverity,
          newObstacleExpectedResolutionDate, setNewObstacleExpectedResolutionDate,
          newObstacleResolutionNotes, setNewObstacleResolutionNotes, editingObstacleId, setEditingObstacleId,
          editingObstacleTitle, setEditingObstacleTitle, editingObstacleSeverity, setEditingObstacleSeverity,
          editingObstacleExpectedResolutionDate, setEditingObstacleExpectedResolutionDate,
          editingObstacleResolutionNotes, setEditingObstacleResolutionNotes, handleAddObstacle,
          handleResolveObstacle, handleDeleteObstacle, handleSaveObstacleEdit, newTaskConditionPromptId,
          setNewTaskConditionPromptId, confirmDialog, setConfirmDialog, isOnCriticalPath,
          onOpenEngineeringObjects: handleOpenEngineeringObjects,
          onOpenParticipantUnits: openParticipantUnitsDialog,
          tasks: tasks as Task[],
          milestoneOptions: milestoneOptions as Task[],
          conflictData: conflictData as { localVersion: Task; serverVersion: Task } | null,
          milestoneTargetTask: milestoneTargetTask as Task | null,
          conditionTask: conditionTask as Task | null,
          obstacleTask: obstacleTask as Task | null,
        }}
        openConditionDialogByTaskId={(taskId) => {
          const task = tasks.find((item) => item.id === taskId)
          if (task) openConditionDialog(task as Task)
        }}
      />
      <GanttAuxiliaryDialogs
        exportDialogProps={{
          open: exportOpen,
          onClose: () => setExportOpen(false),
          onExport: (scope, format) => void handleExportTaskList(scope, format),
          projectName: currentProject?.name ?? '',
          pageName: '任务列表',
        }}
        participantUnitsProps={{
          open: participantUnitsOpen,
          onOpenChange: handleParticipantUnitsOpenChange,
          loading: participantUnitsLoading,
          saving: participantUnitSaving,
          units: participantUnits,
          draft: participantUnitDraft,
          setDraft: setParticipantUnitDraft,
          onSubmit: () => void handleParticipantUnitSubmit(),
          onEdit: handleParticipantUnitEdit,
          onDelete: (unit) => void handleParticipantUnitDelete(unit),
          onCreateNew: handleParticipantUnitCreateNew,
        }}
        engineeringObjectsBridgeProps={{
          projectId: id || '',
          open: engineeringObjectsOpen,
          onOpenChange: setEngineeringObjectsOpen,
          engineeringObjects,
          engineeringObjectsLoaded,
          engineeringObjectsLoading,
          setEngineeringObjects,
        }}
        deleteProtectionProps={{
          target: deleteGuardTarget,
          submitting: deleteGuardSubmitting,
          secondarySubmitting: deleteGuardSecondarySubmitting,
          onClose: closeDeleteGuard,
          onConfirm: () => void handleConfirmDeleteGuard(),
          onCloseObstacle: (obstacleId) => void handleCloseObstacleRecord(obstacleId),
        }}
        conditionWarningProps={{
          open: Boolean(conditionWarningTarget),
          onOpenChange: (open) => {
            if (!open) setConditionWarningTarget(null)
          },
          projectId: id,
          taskTitle: conditionWarningTarget?.taskTitle,
          pendingConditionCount: conditionWarningTarget?.pendingConditionCount,
        }}
      />
      <SaveAsCompanyTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        defaultName={`${taskListProjectName}模板`}
        businessType={String(currentProject?.project_type ?? 'general_civil')}
        onSave={handleSaveCompanyTemplate}
        existingNames={[]}
      />
      <PlanningModelingWorkbenchDialog
        open={modelingWorkbenchOpen}
        mode={modelingWorkbenchMode === 'adjust' ? 'adjust' : 'generate'}
        projectId={id || ''}
        onOpenChange={(open) => {
          if (!open) closeModelingWorkbench()
        }}
        onGenerated={handleModelingWorkbenchGenerated}
      />
    </PlanningPageShell>
  )
}
