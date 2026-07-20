import { useCallback, useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { getApiErrorMessage } from '@/lib/apiClient'
import { formatDurationMetric } from '@/lib/durationMetric'
import { cn } from '@/lib/utils'
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary'
import {
  generateWbsTemplatePreview,
  type WbsTemplateCatalogItem,
  type WbsTemplateGeneratePreview,
  type WbsTemplateGenerationScope,
} from '@/services/wbsTemplateGenerationApi'
import type { ConstructionOrganizationUseCase } from './ConstructionOrganizationScenarioSummary'
import { TemplateBrowser, getTemplateRootNodes } from './TemplateBrowser'
import { TemplateGenerationPreview, type TemplateDuplicatePolicy } from './TemplateGenerationPreview'
import type { WbsTemplateGenerateApplyContext } from './WbsTemplateGenerateDialog'

type TemplateSurface = 'baseline' | 'task_list'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function hasScope(scope?: WbsTemplateGenerationScope) {
  if (!scope) return false
  return Object.values(scope).some((value) => typeof value === 'string' && value.trim().length > 0)
}

function keepSelectedPreviewRows(preview: WbsTemplateGeneratePreview | null, selectedPreviewRowIds: Set<string>) {
  const previewRows = preview?.previewRows ?? preview?.rows ?? []
  if (!previewRows.length) return []
  const rowById = new Map(previewRows.map((row) => [row.clientRowId, row]))
  const keepIds = new Set<string>()
  const includeWithParents = (rowId: string | null | undefined) => {
    if (!rowId || keepIds.has(rowId)) return
    const row = rowById.get(rowId)
    if (!row) return
    keepIds.add(rowId)
    includeWithParents(row.parentClientRowId)
  }

  selectedPreviewRowIds.forEach(includeWithParents)
  return previewRows
    .filter((row) => keepIds.has(row.clientRowId))
    .map((row) => ({
      ...row,
      predecessorClientRowIds: (row.predecessorClientRowIds ?? []).filter((id) => keepIds.has(id)),
      predecessorDependencies: (row.predecessorDependencies ?? []).filter((dependency) => keepIds.has(dependency.clientRowId)),
    }))
}

function resolveInlineConstructionOrganizationUseCase(
  surface: TemplateSurface,
  preview: WbsTemplateGeneratePreview | null,
): ConstructionOrganizationUseCase {
  if (preview?.targetFeasibility?.accelerationProposal) return 'accelerationRecovery'
  return surface === 'task_list' ? 'startingLineOnboarding' : 'newProjectPlanning'
}

export interface TemplateInlineExpandProps {
  projectId: string
  surface: TemplateSurface
  defaultScope?: WbsTemplateGenerationScope
  scopeLabel?: string
  defaultPlannedStartDate?: string | null
  defaultSortOrder?: number
  attachUnderRowId?: string | null
  drilldownPreset?: {
    templateId: string
    templateName?: string | null
    selectedNodeIds: string[]
    selectedNodeNames?: string[]
    generationDepth: 'process' | 'activity_step'
    includeActivitySteps: boolean
    rowLimit: number
  } | null
  applyLabel?: string
  onApply: (preview: WbsTemplateGeneratePreview, context: WbsTemplateGenerateApplyContext) => void | Promise<void>
  onCancel: () => void
}

function buildPresetTemplate(
  preset: TemplateInlineExpandProps['drilldownPreset'],
): WbsTemplateCatalogItem | null {
  if (!preset) return null
  return {
    id: preset.templateId,
    name: preset.templateName || '系统下钻资产',
    source: 'builtin_seed',
    nodeCount: preset.selectedNodeIds.length,
    packType: 'core_quality',
    templateGroup: 'building_main',
    generationPolicy: 'explicit',
    domainScope: 'selected_parent_task',
    sourceStandard: 'T2 system standard library',
    sourceVersion: null,
    nodes: preset.selectedNodeIds.map((nodeId, index) => ({
      id: nodeId,
      stableCode: nodeId,
      name: preset.selectedNodeNames?.[index] || nodeId,
      categoryType: preset.generationDepth === 'process' ? 'item_work' : 'process',
      defaultDurationDays: null,
      sourceStandard: 'T2 system standard library',
      sourceVersion: null,
      sourceClauseRef: null,
      reviewNeeded: true,
      webVerified: false,
      evidenceLevel: 'candidate',
      verificationStatus: 'candidate_seeded',
      applicableScope: 'selected_parent_task',
      children: [],
    })),
  }
}

export function TemplateInlineExpand({
  projectId,
  surface,
  defaultScope,
  scopeLabel,
  defaultPlannedStartDate,
  defaultSortOrder = 0,
  attachUnderRowId = null,
  drilldownPreset = null,
  applyLabel,
  onApply,
  onCancel,
}: TemplateInlineExpandProps) {
  const {
    templates: catalogTemplates,
    loading,
    loadingTemplateId,
    ensureTemplateNodes,
    error: catalogError,
  } = useTemplateLibrary(projectId, { enabled: Boolean(projectId) })
  const presetTemplate = useMemo(() => buildPresetTemplate(drilldownPreset), [drilldownPreset])
  const templates = useMemo(() => {
    if (!presetTemplate || catalogTemplates.some((template) => template.id === presetTemplate.id)) {
      return catalogTemplates
    }
    return [presetTemplate, ...catalogTemplates]
  }, [catalogTemplates, presetTemplate])
  const [templateId, setTemplateId] = useState(drilldownPreset?.templateId ?? '')
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(
    drilldownPreset?.templateId ? [drilldownPreset.templateId] : [],
  )
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(drilldownPreset?.selectedNodeIds ?? [])
  const [selectedNodesByTemplate, setSelectedNodesByTemplate] = useState<Record<string, string[]>>(
    drilldownPreset?.templateId
      ? { [drilldownPreset.templateId]: drilldownPreset.selectedNodeIds }
      : {},
  )
  const [plannedStartDate, setPlannedStartDate] = useState(defaultPlannedStartDate || todayString())
  const [includeActivitySteps, setIncludeActivitySteps] = useState(drilldownPreset?.includeActivitySteps ?? false)
  const [duplicatePolicy, setDuplicatePolicy] = useState<TemplateDuplicatePolicy>('skip')
  const [generating, setGenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [preview, setPreview] = useState<WbsTemplateGeneratePreview | null>(null)
  const [previewContext, setPreviewContext] = useState<WbsTemplateGenerateApplyContext | null>(null)
  const [selectedPreviewRowIds, setSelectedPreviewRowIds] = useState<Set<string>>(() => new Set())
  const [accelerationNotice, setAccelerationNotice] = useState<string | null>(null)
  const error = generationError ?? catalogError

  useEffect(() => {
    setPlannedStartDate(defaultPlannedStartDate || todayString())
  }, [defaultPlannedStartDate])

  useEffect(() => {
    const nextTemplate = templates.find((template) => template.id === templateId) ?? templates[0] ?? null
    setTemplateId(nextTemplate?.id ?? '')
    if (nextTemplate && selectedTemplateIds.length === 0) {
      const rootIds = getTemplateRootNodes(nextTemplate).map((node) => node.id)
      if (rootIds.length === 0) void ensureTemplateNodes(nextTemplate.id)
      setSelectedTemplateIds([nextTemplate.id])
      if (rootIds.length > 0) {
        setSelectedNodeIds(rootIds)
        setSelectedNodesByTemplate({ [nextTemplate.id]: rootIds })
      }
    }
  }, [ensureTemplateNodes, selectedTemplateIds.length, templateId, templates])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templateId, templates],
  )
  const templateNodesLoading = Boolean(templateId && loadingTemplateId === templateId)
  const selectedTemplateNames = useMemo(
    () => selectedTemplateIds
      .map((id) => templates.find((template) => template.id === id)?.name)
      .filter(Boolean)
      .join(' + '),
    [selectedTemplateIds, templates],
  )
  const scopeRequired = surface === 'task_list'
  const scopeReady = !scopeRequired || hasScope(defaultScope)
  const previewRows = preview?.previewRows ?? preview?.rows ?? []
  const selectedPreviewRows = useMemo(() => keepSelectedPreviewRows(preview, selectedPreviewRowIds), [preview, selectedPreviewRowIds])
  const constructionOrganizationUseCase = useMemo(
    () => resolveInlineConstructionOrganizationUseCase(surface, preview),
    [surface, preview],
  )
  const canGenerate = Boolean(projectId && selectedTemplate && selectedNodeIds.length > 0 && plannedStartDate && scopeReady && !loading && !templateNodesLoading && !generating)

  const clearPreview = useCallback(() => {
    setPreview(null)
    setPreviewContext(null)
    setSelectedPreviewRowIds(new Set())
    setAccelerationNotice(null)
  }, [])

  useEffect(() => {
    if (!selectedTemplate) return
    const rootIds = getTemplateRootNodes(selectedTemplate).map((node) => node.id)
    if (rootIds.length === 0) {
      void ensureTemplateNodes(selectedTemplate.id)
      return
    }
    if (!selectedNodesByTemplate[selectedTemplate.id]) {
      setSelectedNodesByTemplate((current) => ({ ...current, [selectedTemplate.id]: rootIds }))
      if (selectedTemplate.id === templateId && selectedNodeIds.length === 0) {
        setSelectedNodeIds(rootIds)
      }
    }
  }, [ensureTemplateNodes, selectedNodeIds.length, selectedNodesByTemplate, selectedTemplate, templateId])

  const handleTemplateChange = useCallback((value: string) => {
    const nextTemplate = templates.find((template) => template.id === value) ?? null
    setSelectedNodesByTemplate((current) => ({
      ...current,
      ...(templateId ? { [templateId]: selectedNodeIds } : {}),
    }))
    setTemplateId(value)
    const rootIds = getTemplateRootNodes(nextTemplate).map((node) => node.id)
    if (nextTemplate && rootIds.length === 0) void ensureTemplateNodes(nextTemplate.id)
    setSelectedNodeIds(selectedNodesByTemplate[value] ?? rootIds)
    clearPreview()
  }, [clearPreview, ensureTemplateNodes, selectedNodeIds, selectedNodesByTemplate, templateId, templates])

  const handleTemplateToggle = useCallback((value: string, checked: boolean) => {
    const targetTemplate = templates.find((template) => template.id === value) ?? null
    const targetRootIds = getTemplateRootNodes(targetTemplate).map((node) => node.id)
    if (targetTemplate && targetRootIds.length === 0) void ensureTemplateNodes(targetTemplate.id)
    setSelectedTemplateIds((current) => {
      if (checked) return Array.from(new Set([...current, value]))
      const next = current.filter((id) => id !== value)
      return next.length > 0 ? next : current
    })
    setSelectedNodesByTemplate((current) => {
      const next = {
        ...current,
        ...(templateId ? { [templateId]: selectedNodeIds } : {}),
      }
      if (checked && !next[value]) next[value] = targetRootIds
      return next
    })
    if (checked) {
      setTemplateId(value)
      setSelectedNodeIds(selectedNodesByTemplate[value] ?? targetRootIds)
    }
    clearPreview()
  }, [clearPreview, ensureTemplateNodes, selectedNodeIds, selectedNodesByTemplate, templateId, templates])

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !selectedTemplate) return
    setGenerating(true)
    setGenerationError(null)
    try {
      const nextPreview = await generateWbsTemplatePreview({
        projectId,
        surface,
        templateId: selectedTemplate.id,
        templateIds: selectedTemplateIds.length > 0 ? selectedTemplateIds : [selectedTemplate.id],
        selectedNodeIds,
        selectedNodesByTemplate: {
          ...selectedNodesByTemplate,
          [selectedTemplate.id]: selectedNodeIds,
        },
        scope: defaultScope ?? {},
        attachUnderRowId,
        plannedStartDate,
        generationDepth: drilldownPreset?.generationDepth ?? (includeActivitySteps ? 'activity_step' : 'item_work'),
        includeActivitySteps: drilldownPreset?.includeActivitySteps ?? includeActivitySteps,
        duplicatePolicy,
        sortOrder: defaultSortOrder,
      })
      const context: WbsTemplateGenerateApplyContext = {
        templateId: selectedTemplate.id,
        templateIds: selectedTemplateIds.length > 0 ? selectedTemplateIds : [selectedTemplate.id],
        templateName: selectedTemplateNames || selectedTemplate.name,
        selectedNodeIds,
        selectedNodesByTemplate: {
          ...selectedNodesByTemplate,
          [selectedTemplate.id]: selectedNodeIds,
        },
        scope: defaultScope ?? {},
        plannedStartDate,
        generationDepth: drilldownPreset?.generationDepth ?? (includeActivitySteps ? 'activity_step' : 'item_work'),
        includeActivitySteps: drilldownPreset?.includeActivitySteps ?? includeActivitySteps,
        duplicatePolicy,
        attachUnderRowId,
        sortOrder: defaultSortOrder,
      }
      const rows = nextPreview.previewRows ?? nextPreview.rows ?? []
      setPreview(nextPreview)
      setPreviewContext(context)
      setSelectedPreviewRowIds(new Set(rows.map((row) => row.clientRowId)))
      setAccelerationNotice(null)
    } catch (caught) {
      setGenerationError(getApiErrorMessage(caught, '模板生成失败'))
    } finally {
      setGenerating(false)
    }
  }, [
    attachUnderRowId,
    canGenerate,
    defaultScope,
    defaultSortOrder,
    duplicatePolicy,
    drilldownPreset,
    includeActivitySteps,
    plannedStartDate,
    projectId,
    selectedNodeIds,
    selectedNodesByTemplate,
    selectedTemplateIds,
    selectedTemplateNames,
    selectedTemplate,
    surface,
  ])

  const handleApplyPreview = useCallback(async () => {
    if (!preview || !previewContext || selectedPreviewRows.length === 0 || applying) return
    setApplying(true)
    setGenerationError(null)
    try {
      await onApply({ ...preview, rows: selectedPreviewRows, previewRows: selectedPreviewRows }, previewContext)
      onCancel()
    } catch (caught) {
      setGenerationError(getApiErrorMessage(caught, '下钻计划保存失败'))
    } finally {
      setApplying(false)
    }
  }, [applying, onApply, onCancel, preview, previewContext, selectedPreviewRows])

  return (
    <section data-testid="template-inline-expand" className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Sparkles className="h-4 w-4 text-blue-600" />
            {drilldownPreset ? '任务下钻' : '智能展开'}
          </div>
          {drilldownPreset ? null : (
            <p className="mt-1 text-xs text-slate-500">
              先生成预览，确认后加入当前表格草稿，保存后才写入系统。
            </p>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onCancel}>
          收起
        </Button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="grid gap-3">
          <TemplateBrowser
            templates={templates}
            selectedTemplateId={templateId}
            selectedTemplateIds={selectedTemplateIds}
            selectedNodeIds={selectedNodeIds}
            loading={loading || templateNodesLoading}
            disabled={generating || applying || templateNodesLoading}
            compact
            showNestedNodes={Boolean(drilldownPreset)}
            onTemplateChange={handleTemplateChange}
            onTemplateToggle={drilldownPreset ? undefined : handleTemplateToggle}
            onSelectAll={drilldownPreset ? undefined : () => {
              clearPreview()
              const rootIds = getTemplateRootNodes(selectedTemplate).map((node) => node.id)
              setSelectedNodeIds(rootIds)
              if (selectedTemplate) {
                setSelectedNodesByTemplate((current) => ({ ...current, [selectedTemplate.id]: rootIds }))
              }
            }}
            onToggleNode={(nodeId, checked) => {
              clearPreview()
              setSelectedNodeIds((current) => (
                checked ? Array.from(new Set([...current, nodeId])) : current.filter((id) => id !== nodeId)
              ))
            }}
          />
        </div>
        <div className="grid content-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            计划开始
            <Input
              type="date"
              value={plannedStartDate}
              disabled={Boolean(drilldownPreset)}
              onChange={(event) => {
                clearPreview()
                setPlannedStartDate(event.target.value)
              }}
              className="h-9"
            />
          </label>
          {drilldownPreset ? null : (
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <Checkbox
              checked={includeActivitySteps}
              onCheckedChange={(checked) => {
                clearPreview()
                setIncludeActivitySteps(checked === true)
              }}
              className="mt-0.5"
            />
            <span>
              <span className="block font-medium text-slate-800">展开作业步骤</span>
              默认只生成到工序，作业步骤用于交底和质检底稿。
            </span>
          </label>
          )}
          <div className={cn('rounded-md border px-2 py-1.5 text-xs', scopeReady ? 'border-slate-200 bg-white text-slate-600' : 'border-amber-200 bg-amber-50 text-amber-700')}>
            {scopeRequired ? scopeLabel || '请先选择工程归属' : '基线模板不强制选择工程归属'}
          </div>
          <Button type="button" size="sm" className="h-8" loading={generating} disabled={!canGenerate} onClick={handleGenerate}>
            生成预览
          </Button>
        </div>
      </div>

      {preview ? (
        <TemplateGenerationPreview
          rows={previewRows}
          selectedRowIds={selectedPreviewRowIds}
          duplicatePolicy={duplicatePolicy}
          onDuplicatePolicyChange={(policy) => {
            setDuplicatePolicy(policy)
            setPreviewContext((current) => current ? { ...current, duplicatePolicy: policy } : current)
          }}
          onToggleRow={(rowId, checked) => {
            setSelectedPreviewRowIds((current) => {
              const next = new Set(current)
              if (checked) next.add(rowId)
              else next.delete(rowId)
              return next
            })
          }}
          onApply={handleApplyPreview}
          applyLabel={applyLabel ?? (drilldownPreset ? '生成并保存' : undefined)}
          applyPending={applying}
          maxRows={drilldownPreset?.rowLimit}
          rowLimitBehavior={drilldownPreset ? 'hard_limit' : 'render_budget'}
          className="mt-3"
          rowLimitPolicy={preview.rowLimitPolicy}
          targetFeasibility={preview.targetFeasibility}
          candidateNetworkEvaluation={preview.candidateNetworkEvaluation}
          constructionOrganizationUseCase={constructionOrganizationUseCase}
          onRequestAccelerationProposal={() => {
            const feasibility = preview.targetFeasibility
            setAccelerationNotice(feasibility
              ? `当前自然排期超出目标 ${formatDurationMetric(feasibility.overshoot, { absolute: true })}，需生成赶工建议并由人工确认。`
              : '当前自然排期未发现目标工期缺口。')
          }}
          generationBatches={preview.generationBatches}
        />
      ) : null}

      {accelerationNotice ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {accelerationNotice}
        </div>
      ) : null}

      {error ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
    </section>
  )
}

export default TemplateInlineExpand
