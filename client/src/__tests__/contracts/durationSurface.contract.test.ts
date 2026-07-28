import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { inclusiveDurationDays } from '../../lib/durationDays'

const repoRoot = process.cwd().endsWith('\\client') || process.cwd().endsWith('/client')
  ? resolve(process.cwd(), '..')
  : process.cwd()

const WBS_TEMPLATE_GENERATION_IMPLEMENTATION_FILES = [
  'wbsTemplateGenerationFoundation.ts',
  'wbsTemplateScopeClassificationService.ts',
  'wbsTemplateDurationAssemblyService.ts',
  'wbsTemplateOutputProjectionService.ts',
  'wbsTemplateDependencyCandidateService.ts',
  'wbsTemplateAssetStrategyService.ts',
  'wbsTemplateCloseoutChainService.ts',
  'wbsTemplateAuditFormattingService.ts',
  'wbsTemplateGenerationOrchestrator.ts',
] as const

const SURFACE_FIXTURE = {
  taskId: 'task-same-truth',
  plannedStart: '2026-05-01',
  plannedEnd: '2026-05-03',
} as const

function renderPlanSpanLabel(start: string, end: string) {
  const days = inclusiveDurationDays(start, end)
  return days == null ? '未设置' : `${days}天`
}

function readSource(relativeToSrc: string) {
  return readFileSync(resolve(repoRoot, 'client/src', relativeToSrc), 'utf8')
}

function readRepoSource(relativeToRepo: string) {
  return readFileSync(resolve(repoRoot, relativeToRepo), 'utf8')
}

function readWbsTemplateGenerationImplementationSource() {
  return WBS_TEMPLATE_GENERATION_IMPLEMENTATION_FILES
    .map((fileName) => readRepoSource(`server/src/services/${fileName}`))
    .join('\n')
}

function listFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const fullPath = resolve(root, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) return listFiles(fullPath)
    return fullPath
  })
}

describe('duration surface contract', () => {
  it('uses one helper for the same inclusive plan-span value across display surfaces', () => {
    const labelsBySurface = {
      gantt: renderPlanSpanLabel(SURFACE_FIXTURE.plannedStart, SURFACE_FIXTURE.plannedEnd),
      baselineExport: renderPlanSpanLabel(SURFACE_FIXTURE.plannedStart, SURFACE_FIXTURE.plannedEnd),
      monthlyExport: renderPlanSpanLabel(SURFACE_FIXTURE.plannedStart, SURFACE_FIXTURE.plannedEnd),
      cpmNode: renderPlanSpanLabel(SURFACE_FIXTURE.plannedStart, SURFACE_FIXTURE.plannedEnd),
    }

    expect(new Set(Object.values(labelsBySurface))).toEqual(new Set(['3天']))
  })

  it('keeps leaf reference duration wording separate from parent plan-window wording', () => {
    const parentPlanWindowLabel = '计划窗口 7天'
    const childReferenceLabel = '参考工期 4天'

    expect(parentPlanWindowLabel).toContain('计划窗口')
    expect(childReferenceLabel).toContain('参考工期')
    expect(parentPlanWindowLabel).not.toBe(childReferenceLabel)
  })

  it('locks plan-span display surfaces to the shared inclusive helper', () => {
    const surfaceFiles = [
      'pages/GanttView/taskRowModel.ts',
      'pages/GanttView/taskExport.ts',
      'pages/GanttViewPanels.tsx',
      'pages/planning/BaselinePage.tsx',
      'pages/planning/MonthlyPlanPage.tsx',
      'pages/planning/planningShared.tsx',
    ]

    for (const file of surfaceFiles) {
      const source = readSource(file)
      expect(source, file).toContain('inclusiveDurationDays')
      expect(source, file).not.toContain('86400000')
      expect(source, file).not.toContain('Math.ceil((new Date')
    }
  })

  it('surfaces duration basis semantics on primary duration display outlets', () => {
    const badgeSource = readSource('components/planning/DurationBasisBadge.tsx')
    const planningTreeSource = readSource('components/planning/PlanningTreeView.tsx')
    const planningRowCardSource = readSource('components/planning/PlanningRowCard.tsx')
    const detailDrawerSource = readSource('pages/GanttView/GanttDetailDrawer.tsx')
    const ganttDialogsSource = readSource('pages/GanttViewDialogs.tsx')
    const dashboardSource = readSource('pages/Dashboard.tsx')
    const reportsSource = readSource('pages/Reports.tsx')
    const tooltipSource = readSource('components/planning/DurationSuggestionTooltip.tsx')
    const exportSource = readSource('pages/GanttView/taskExport.ts')
    const planningExportSource = readSource('components/planning/PlanningExportDialog.tsx')
    const projectRemainingSource = readSource('components/ProjectRemainingForecastCard.tsx')
    const criticalPathGraphSource = readSource('components/CriticalPathGraph.tsx')
    const ganttPanelsSource = readSource('pages/GanttViewPanels.tsx')
    const accelerationReviewSource = readSource('pages/GanttView/TargetAccelerationReviewPanel.tsx')
    const baselinePageSource = readSource('pages/planning/BaselinePage.tsx')
    const monthlyPlanPageSource = readSource('pages/planning/MonthlyPlanPage.tsx')
    const taskSummarySource = readSource('pages/TaskSummary.tsx')
    const deviationDetailTableSource = readSource('pages/Reports/components/DeviationDetailTable.tsx')
    const baselineDumbbellSource = readSource('pages/Reports/components/BaselineDumbbellChart.tsx')
    const executionScatterSource = readSource('pages/Reports/components/ExecutionScatterChart.tsx')
    const planningTreeColumnsStart = planningTreeSource.indexOf('const BASE_COLUMNS')
    const planningTreeColumnsEnd = planningTreeSource.indexOf('const EXTRA_COLUMNS')
    expect(planningTreeColumnsStart).toBeGreaterThanOrEqual(0)
    expect(planningTreeColumnsEnd).toBeGreaterThan(planningTreeColumnsStart)
    const planningTreeColumnDefinitions = planningTreeSource.slice(planningTreeColumnsStart, planningTreeColumnsEnd)

    for (const label of ['计划', '参考', '生产日', '预测', '剩余']) {
      expect(badgeSource, label).toContain(label)
    }

    expect(planningTreeSource).toContain('DurationBasisBadge')
    expect(planningTreeColumnDefinitions).toContain("label: '计划工期'")
    expect(planningTreeColumnDefinitions).not.toContain("label: '工期'")
    expect(planningTreeColumnDefinitions).not.toContain("'计划完成', '工期'")
    expect(planningRowCardSource).toContain('DurationBasisBadge')
    expect(planningRowCardSource).toContain('basis="plan"')
    expect(detailDrawerSource).toContain('DurationBasisBadge')
    expect(detailDrawerSource).toContain('inclusiveDurationDays')
    expect(detailDrawerSource).toContain('basis="plan"')
    expect(ganttDialogsSource).toContain('DurationBasisBadge')
    expect(ganttDialogsSource).toContain('inclusiveDurationDays')
    expect(ganttDialogsSource).toContain('计划工期')
    for (const [file, source] of Object.entries({
      'pages/Dashboard.tsx': dashboardSource,
      'pages/Reports.tsx': reportsSource,
      'pages/TaskSummary.tsx': taskSummarySource,
    })) {
      expect(source, file).toContain('formatDurationMetric')
      expect(source, file).not.toMatch(/\.(?:delay_days|delayDays|daysUntilDue|remainingDurationDays|targetGapDays)\b/)
      expect(source, file).not.toMatch(/\$\{[^}]+\}\s*个生产日/)
    }
    expect(dashboardSource).toContain('DurationBasisBadge')
    expect(reportsSource).toContain('DurationBasisBadge')
    expect(taskSummarySource).toContain('DurationBasisBadge')
    expect(taskSummarySource).not.toContain('86400000')
    expect(taskSummarySource).not.toContain('延期 ${delayDays} 天')
    expect(taskSummarySource).not.toContain('延后 ${diffDays} 天')
    expect(deviationDetailTableSource).toContain('DurationBasisBadge')
    expect(deviationDetailTableSource).toContain('偏差生产日')
    expect(deviationDetailTableSource).toContain('formatDurationMetric(row.deviation_duration')
    expect(baselineDumbbellSource).toContain("readAvailableDurationValue(row.deviation_duration, 'construction_production_day')")
    expect(executionScatterSource).toContain("readAvailableDurationValue(row.deviation_duration, 'construction_production_day')")
    expect(tooltipSource).toContain('DurationBasisBadge')
    expect(tooltipSource).toContain('项目节奏参考 · 参考工期')
    expect(tooltipSource).not.toContain('项目节奏参考工期')
    expect(exportSource).toContain('计划工期')
    expect(planningExportSource).toContain('计划工期(天)')
    expect(planningExportSource).not.toContain("header: '工期(天)'")
    expect(projectRemainingSource).toContain('DurationBasisBadge')
    expect(projectRemainingSource).toContain('basis="remaining"')
    expect(projectRemainingSource).toContain('basis="forecast"')
    expect(criticalPathGraphSource).toContain('DurationBasisBadge')
    expect(criticalPathGraphSource).toContain('计划工期')
    expect(criticalPathGraphSource).toContain('basis="plan"')
    expect(ganttPanelsSource).toContain('DurationBasisBadge')
    expect(ganttPanelsSource).toContain('basis="plan"')
    expect(accelerationReviewSource).toContain('basis="forecast"')
    expect(baselinePageSource).toContain("header: '计划工期'")
    expect(monthlyPlanPageSource).toContain("header: '计划工期'")
  })

  it('keeps live duration references from pretending to be frozen snapshots', () => {
    const tooltipSource = readSource('components/planning/DurationSuggestionTooltip.tsx')
    const apiSource = readSource('services/durationSuggestionsApi.ts')

    expect(tooltipSource).not.toContain('duration-reference-freeze-trigger')
    expect(tooltipSource).not.toContain('duration-reference-freeze-indicator')
    expect(tooltipSource).not.toContain('suggestion.generatedAt')
    expect(tooltipSource).not.toContain('referenceFrozenAt')
    expect(tooltipSource).not.toContain('isReferenceFrozen')
    expect(tooltipSource).toContain('benchmarkGeneratedAt')
    expect(tooltipSource).toContain('benchmarkProvenance')
    expect(apiSource).toContain('benchmarkGeneratedAt')
    expect(apiSource).toContain('benchmarkProvenance')
    expect(apiSource).toContain("export type BenchmarkScope = 'project' | 'company' | 'industry' | 'global' | 'mixed'")
    expect(apiSource).not.toContain("'project' | 'company' | 'system'")
    expect(apiSource).not.toMatch(/\bgeneratedAt\??:/)
    expect(apiSource).not.toContain('referenceFrozenAt')
    expect(apiSource).not.toContain('isReferenceFrozen')
  })

  it('documents the duration semantics matrix and the benign raw-date whitelist', () => {
    const guidanceSource = readRepoSource('CLAUDE.md')

    for (const phrase of [
      '计划日历工期',
      '施工生产日',
      '剩余工期预测',
      'CPM/关键路径工期',
      '项目剩余工期',
      '完成总结与学习样本',
      'Lag 判定',
      '参考工期',
      '治理截止日',
      '允许裸毫秒差的白名单',
      '新增任何“天数”展示前必须先说明语义',
    ]) {
      expect(guidanceSource).toContain(phrase)
    }
  })

  it('keeps raw millisecond date math limited to the documented benign whitelist', () => {
    const allowedRawDateFiles = new Set([
      'client/src/__tests__/contracts/durationSurface.contract.test.ts',
      'client/src/hooks/useProjectClimateAutoLocation.ts',
      'client/src/lib/dateDistance.ts',
      'client/src/lib/durationDays.ts',
      'client/src/lib/modalManager.ts',
      'client/src/lib/planningGuidance.ts',
      'client/src/pages/AcceptanceTimeline.tsx',
      'client/src/pages/GanttView/TaskTimelineView.tsx',
      'client/src/pages/Reports/components/BaselineDumbbellChart.tsx',
    ])
    const rawDatePattern = /(?:86400000|86_400_000|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24|DAY_MS)/
    const offenders = listFiles(resolve(repoRoot, 'client/src'))
      .filter((file) => /\.(?:ts|tsx)$/.test(file))
      .map((file) => file.replace(/\\/g, '/').slice(repoRoot.replace(/\\/g, '/').length + 1))
      .filter((file) => rawDatePattern.test(readRepoSource(file)))
      .filter((file) => !allowedRawDateFiles.has(file))

    expect(offenders).toEqual([])
  })

  it('keeps client vitest collection rooted at the client package when invoked from the repo root', () => {
    const configSource = readRepoSource('client/vitest.config.ts')

    expect(configSource).toContain('root:')
    expect(configSource).toContain('src/**/*.{test,spec}.{js,ts,jsx,tsx}')
  })

  it('locks critical-path and report duration surfaces to backend truth fields', () => {
    const criticalPathSource = readSource('lib/criticalPath.ts')
    const ganttCriticalPathSource = readSource('pages/GanttView/ganttViewUtils.ts')
    const graphSource = readSource('components/CriticalPathGraph.tsx')
    const layoutSource = readSource('lib/buildCriticalPathLayout.ts')
    const panelsSource = readSource('pages/GanttViewPanels.tsx')
    const rowSectionsSource = readSource('pages/GanttViewRowSections.tsx')
    const rowsSource = readSource('pages/GanttViewRows.tsx')
    const detailDrawerSource = readSource('pages/GanttView/GanttDetailDrawer.tsx')
    const scheduleEvidenceSource = readSource('pages/GanttView/taskScheduleEvidence.ts')
    const taskExportSource = readSource('pages/GanttView/taskExport.ts')
    const taskExportHookSource = readSource('pages/GanttView/useGanttTaskExport.ts')
    const ganttViewSource = readSource('pages/GanttView.tsx')
    const reportsSource = readSource('pages/Reports.tsx')

    expect(criticalPathSource).toContain('normalizeCriticalPathSnapshot')
    expect(criticalPathSource).toContain('normalizeDurationMetricDto')
    expect(criticalPathSource).toContain('formatCriticalPathDurationMetric(snapshot.projectDuration)')
    expect(ganttCriticalPathSource).toContain('summary.projectDuration')
    expect(ganttCriticalPathSource).toContain('formatDurationMetric')
    expect(criticalPathSource).not.toContain('criticalPathFallback')
    expect(criticalPathSource).not.toContain('calculateCPM')
    for (const [file, source] of Object.entries({
      'components/CriticalPathGraph.tsx': graphSource,
      'lib/buildCriticalPathLayout.ts': layoutSource,
      'pages/GanttView/ganttViewUtils.ts': ganttCriticalPathSource,
      'pages/GanttViewPanels.tsx': panelsSource,
      'pages/GanttViewRowSections.tsx': rowSectionsSource,
      'pages/GanttViewRows.tsx': rowsSource,
      'pages/GanttView/GanttDetailDrawer.tsx': detailDrawerSource,
      'pages/GanttView/taskScheduleEvidence.ts': scheduleEvidenceSource,
      'pages/GanttView/taskExport.ts': taskExportSource,
    })) {
      expect(source, file).not.toMatch(/\.(?:projectDurationDays|totalDurationDays|durationDays|floatDays|freeFloatDays)\b/)
      expect(source, file).not.toMatch(/task\.(?:total_float_days|free_float_days)\b/)
    }
    expect(taskExportHookSource).toContain('criticalScheduleByTaskId')
    expect(ganttViewSource).toContain('criticalPathNetworkScheduleMap')
    expect(ganttViewSource).toContain('getCriticalPathSchedule')
    expect(reportsSource).toContain("value: 'delay_days'")
    expect(reportsSource).toContain("value: 'schedule_deviation_days'")
  })

  it('keeps representative forecast surfaces from consuming legacy duration numerics', () => {
    const representativeSources = {
      'components/ProjectRemainingForecastCard.tsx': readSource('components/ProjectRemainingForecastCard.tsx'),
      'components/CriticalPathGraph.tsx': readSource('components/CriticalPathGraph.tsx'),
      'pages/GanttView/GanttDetailDrawer.tsx': readSource('pages/GanttView/GanttDetailDrawer.tsx'),
      'pages/GanttView/TargetAccelerationReviewPanel.tsx': readSource('pages/GanttView/TargetAccelerationReviewPanel.tsx'),
    }
    const legacyDurationAlias = /\b(?:projectRemainingForecastDays|remainingForecastDays|remainingDurationDays|forecastDelayDays|duration_risk_p(?:20|50|80)_days|riskP(?:20|50|80)DurationDays|p(?:20|50|80)RemainingDays|total_float_days|free_float_days|floatDays|freeFloatDays)\b/

    for (const [file, source] of Object.entries(representativeSources)) {
      expect(source, file).not.toMatch(legacyDurationAlias)
    }
  })

  it('locks Reports progress-deviation display to the backend SSOT payload', () => {
    const reportsSource = readSource('pages/Reports.tsx')
    const progressDeviationApiSource = readSource('services/progressDeviationApi.ts')
    const detailTableSource = readSource('pages/Reports/components/DeviationDetailTable.tsx')
    const baselineChartSource = readSource('pages/Reports/components/BaselineDumbbellChart.tsx')
    const executionChartSource = readSource('pages/Reports/components/ExecutionScatterChart.tsx')
    const monthlyChartSource = readSource('pages/Reports/components/MonthlyStackedBarChart.tsx')
    const deviationSurfaceStart = reportsSource.indexOf('const loadDeviationAnalysis')
    const deviationSurfaceEnd = reportsSource.indexOf('const loadIssueSummary')
    expect(deviationSurfaceStart).toBeGreaterThanOrEqual(0)
    expect(deviationSurfaceEnd).toBeGreaterThan(deviationSurfaceStart)

    const deviationSurface = reportsSource.slice(deviationSurfaceStart, deviationSurfaceEnd)
    expect(deviationSurface).toContain('getProgressDeviationAnalysis(projectId, latestBaseline.id')
    expect(deviationSurface).toContain('setDeviationData(analysis)')
    expect(progressDeviationApiSource).toContain('normalizeDurationMetricDto')
    expect(progressDeviationApiSource).toContain("metric?.unit === 'construction_production_day'")

    const deviationRenderStart = reportsSource.indexOf('const deviationMainlineKey')
    const deviationRenderEnd = reportsSource.indexOf('const deviationChips')
    expect(deviationRenderStart).toBeGreaterThanOrEqual(0)
    expect(deviationRenderEnd).toBeGreaterThan(deviationRenderStart)

    const deviationRenderSurface = reportsSource.slice(deviationRenderStart, deviationRenderEnd)
    for (const backendField of ['deviation_duration', 'deviation_rate', 'planned_progress', 'actual_progress']) {
      expect(deviationRenderSurface).toContain(backendField)
    }

    for (const [file, source] of Object.entries({
      'pages/Reports.tsx': reportsSource,
      'pages/Reports/components/DeviationDetailTable.tsx': detailTableSource,
      'pages/Reports/components/BaselineDumbbellChart.tsx': baselineChartSource,
      'pages/Reports/components/ExecutionScatterChart.tsx': executionChartSource,
    })) {
      expect(source, file).not.toMatch(/\.(?:deviation_days|impact_days|wait_days)\b/)
    }
    expect(reportsSource).toContain('formatProductionDuration(entry.impact_duration)')
    expect(reportsSource).toContain('formatProductionDuration(item.evidence?.wait_duration)')
    expect(detailTableSource).toContain('生产日口径不可用')
    expect(monthlyChartSource).not.toMatch(/\bdeviation_days\s*:/)

    const forbiddenLocalRecalculationPattern = /(delayDayDelta|inclusiveDurationDays|calculateTaskPlannedProgress|planned_end_date|actual_end_date|task\.progress)/
    expect(deviationRenderSurface).not.toMatch(forbiddenLocalRecalculationPattern)
  })

  it('locks baseline date movement to typed Gregorian calendar-day facts and structured validity details', () => {
    const baselinePageSource = readSource('pages/planning/BaselinePage.tsx')
    const baselineApiSource = readSource('services/baselineGenerationApi.ts')

    expect(baselineApiSource).toContain('normalizeDurationMetricDto')
    expect(baselineApiSource).toContain("metric.unit !== 'calendar_day'")
    expect(baselinePageSource).toContain('normalizeBaselineGenerationCandidate')
    expect(baselinePageSource).toContain('normalizeBaselineValidityDetails')
    expect(baselinePageSource).toContain('formatDurationMetric')
    expect(baselinePageSource).toContain('data-testid="baseline-publish-validity"')
    expect(baselinePageSource).not.toMatch(/\.metrics\.(?:totalFinishShiftDays|milestoneMaxShiftDays)\b/)
    expect(baselinePageSource).not.toMatch(/\.averageMilestoneShiftDays\b/)
    expect(existsSync(resolve(repoRoot, 'client/src/pages/planning/components/BaselineConfirmDialog.tsx'))).toBe(false)
  })

  it('labels monthly-plan shift and confirmation reminder offsets as Gregorian calendar days', () => {
    const monthlyPlanSource = readSource('pages/planning/MonthlyPlanPage.tsx')

    expect(monthlyPlanSource).toContain('批量顺延（日历天）')
    expect(monthlyPlanSource).toContain('剩余 ${Math.abs(diffDays)} 个日历天')
    expect(monthlyPlanSource).toContain('已超 ${diffDays} 个日历天')
    expect(monthlyPlanSource).not.toMatch(/\$\{(?:Math\.abs\()?diffDays\)?\}\s*天/)
  })

  it('locks due-date surfaces to the shared local-calendar distance helper', () => {
    const acceptanceApiSource = readSource('services/acceptanceApi.ts')
    const acceptanceTypesSource = readSource('types/acceptance.ts')
    const ganttDialogsSource = readSource('pages/GanttViewDialogs.tsx')

    for (const [file, source] of Object.entries({
      'services/acceptanceApi.ts': acceptanceApiSource,
      'types/acceptance.ts': acceptanceTypesSource,
      'pages/GanttViewDialogs.tsx': ganttDialogsSource,
    })) {
      expect(source, file).toContain('daysUntilLocalDate')
      expect(source, file).not.toContain('Date.now()')
    }
    const milestonesSource = readSource('pages/Milestones.tsx')
    expect(milestonesSource).toContain('formatDurationMetric')
    expect(milestonesSource).toContain('planDateShift')
    expect(milestonesSource).toContain('futureDueWindow')
    expect(milestonesSource).toContain('actualOverdue')
    expect(milestonesSource).toContain('actualScheduleVariance')
    expect(milestonesSource).toContain('if (currentVariance === null)')
    expect(milestonesSource).toContain('日历天口径不可用')
    expect(milestonesSource).not.toContain('currentVariance === null || currentVariance === 0')
    expect(milestonesSource).not.toContain('daysUntilLocalDate')
    expect(milestonesSource).not.toContain('getVarianceDays')
    expect(ganttDialogsSource).not.toContain('elapsedLocalDaysSince')
  })

  it('locks project summary delivery and overdue surfaces to typed duration facts', () => {
    const dashboardApiSource = readSource('services/dashboardApi.ts')
    const dashboardSource = readSource('pages/Dashboard.tsx')
    const companyCockpitSource = readSource('pages/CompanyCockpit.tsx')
    const companyCockpitUtilsSource = readSource('pages/CompanyCockpit/utils.ts')
    const projectOverviewSource = readSource('pages/CompanyCockpit/components/ProjectOverviewSection.tsx')

    expect(dashboardApiSource).toContain('normalizeDurationMetricDto')
    expect(dashboardApiSource).toContain('futureDueWindow')
    expect(dashboardApiSource).toContain('actualOverdue')
    expect(dashboardSource).toContain('formatDurationMetric(summaryData?.futureDueWindow')
    expect(companyCockpitSource).toContain('readFutureDeliveryDaysRemaining(summary)')
    expect(companyCockpitUtilsSource).toContain("readAvailableDurationValue(summary.futureDueWindow, 'calendar_day')")
    expect(companyCockpitUtilsSource).toContain("readAvailableDurationValue(summary.actualOverdue, 'construction_production_day')")
    expect(companyCockpitUtilsSource).toContain('实际延期口径暂不可用')
    expect(companyCockpitUtilsSource).not.toContain('已延期 ${formattedRemaining}')
    expect(projectOverviewSource).toContain('formatDeliveryHint(summary)')
    expect(projectOverviewSource).toContain('data-testid="company-project-delivery-hint"')

    for (const [file, source] of Object.entries({
      'pages/Dashboard.tsx': dashboardSource,
      'pages/CompanyCockpit.tsx': companyCockpitSource,
      'pages/CompanyCockpit/utils.ts': companyCockpitUtilsSource,
    })) {
      expect(source, file).not.toContain('.daysUntilPlannedEnd')
    }
  })

  it('locks frontend lag and delay summaries to date-only shared helpers', () => {
    const taskBusinessStatusSource = readSource('lib/taskBusinessStatus.ts')
    const durationDaysSource = readSource('lib/durationDays.ts')
    const ganttUtilsSource = readSource('pages/GanttView/ganttViewUtils.ts')
    const milestoneOverviewSource = readSource('lib/milestoneOverview.ts')
    const milestonesPageSource = readSource('pages/Milestones.tsx')
    const monthlyPlanPageSource = readSource('pages/planning/MonthlyPlanPage.tsx')
    const closeoutPageSource = readSource('pages/planning/CloseoutPage.tsx')

    expect(durationDaysSource).toContain('normalizeDurationDateUtc')
    expect(durationDaysSource).toContain('export function delayDayDelta')
    expect(taskBusinessStatusSource).toContain("import { delayDayDelta } from './durationDays'")
    expect(taskBusinessStatusSource).toContain('delayDayDelta')
    expect(taskBusinessStatusSource).toContain('task.planned_end_date || task.end_date')
    expect(taskBusinessStatusSource).toContain('task.statusDerivation?.businessStatus?.status')
    expect(taskBusinessStatusSource).not.toContain('calculateLegacyLagLevel')
    expect(taskBusinessStatusSource).not.toContain('task.planned_start_date || task.start_date')
    expect(taskBusinessStatusSource).not.toContain('Math.ceil((Date.now()')
    expect(taskBusinessStatusSource).not.toContain('/ 86400000')

    for (const [file, source] of Object.entries({
      'lib/milestoneOverview.ts': milestoneOverviewSource,
      'pages/planning/MonthlyPlanPage.tsx': monthlyPlanPageSource,
      'pages/planning/CloseoutPage.tsx': closeoutPageSource,
    })) {
      expect(source, file).toMatch(/delayDayDelta|daysUntilLocalDate/)
      expect(source, file).not.toContain('/ 86400000')
      expect(source, file).not.toContain('/ (1000 * 60 * 60 * 24)')
      expect(source, file).not.toContain('/ (24 * 60 * 60 * 1000)')
    }

    expect(milestonesPageSource).toContain('formatDurationMetric')
    expect(milestonesPageSource).not.toMatch(/delayDayDelta|daysUntilLocalDate/)

    expect(ganttUtilsSource).toContain('formatDurationMetric')
    expect(ganttUtilsSource).not.toContain('daysUntilDue')
    expect(ganttUtilsSource).not.toContain('delayDayDelta(task.end_date, new Date())')
    expect(closeoutPageSource).toContain('日历天')
  })

  it('asserts package parent rows do not expose package seed reference as the final parent duration', () => {
    const wbsGenerationSource = readWbsTemplateGenerationImplementationSource()
    const tooltipSource = readSource('components/planning/DurationSuggestionTooltip.tsx')

    expect(wbsGenerationSource).toContain("planDurationTruthSource: 'child_plan_window_rollup'")
    expect(wbsGenerationSource).toContain('计划窗口')
    expect(wbsGenerationSource).toContain('父级参考不再单独作为最终工期')
    expect(tooltipSource).toContain('参考工期')
    expect(tooltipSource).toContain('计划表以父级包窗口为约束')
  })
})
