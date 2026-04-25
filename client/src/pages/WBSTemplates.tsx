import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, FileSymlink, Layers3, Sparkles, WandSparkles } from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoadingState } from '@/components/ui/loading-state'
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { useToast } from '@/hooks/use-toast'
import { useStore } from '@/hooks/useStore'

import OnboardingDialog from './planning/OnboardingDialog'
import { TemplateQualityPanel, type WbsTemplateQualitySnapshot } from './WBSTemplates/TemplateQualityPanel'
import { TemplateIcon } from './WBSTemplates/components/TemplateIcon'
import { getTypeColor } from './WBSTemplates/utils'

type TemplateRecord = {
  id: string
  name?: string
  description?: string | null
  template_type?: string | null
  category?: string | null
  node_count?: number | null
  reference_days?: number | null
  status?: string | null
  tags?: string[] | null
  template_data?: unknown
  wbs_nodes?: unknown
}

type TemplateQualityFeedbackNode = {
  path: string
  title: string
  is_leaf?: boolean
  sample_count: number
  mean_days: number
  median_days: number
  current_reference_days: number | null
  suggested_reference_days: number | null
}

type TemplateQualityFeedbackReport = {
  completed_project_count: number
  sample_task_count: number
  node_count: number
  nodes: TemplateQualityFeedbackNode[]
}

type TemplateQualityApiResponse = {
  template_id: string
  template_name: string
  updated_count: number
  nodes: TemplateQualityFeedbackNode[]
  feedback: TemplateQualityFeedbackReport
  inferred_template_data?: unknown
}

type TemplateTreeNode = {
  title: string
  reference_days: number | null
  children: TemplateTreeNode[]
}

type PlanningBootstrapPath = 'template_to_baseline' | 'completed_project_to_template' | 'ongoing_project_to_baseline'

type PlanningBootstrapGuide = {
  project_id: string
  project_name: string
  status_label: string
  mode: PlanningBootstrapPath
  title: string
  subtitle: string
  quickActions: Array<{ path: PlanningBootstrapPath; label: string; description: string }>
  checklist: Array<{ key: string; title: string; detail: string }>
  learnMore: {
    title: string
    sections: Array<{ heading: string; body: string }>
  }
}

const API_BASE = '/api/planning/wbs-templates'
const GOVERNANCE_API_BASE = '/api/wbs-template-governance'
const GUIDE_KEY_PREFIX = 'planning:wbs:onboarding:seen'

function normalizeProjectLabel(status?: string | null) {
  switch (String(status ?? '').trim()) {
    case '进行中':
    case 'in_progress':
    case 'active':
      return '进行中'
    case '已完成':
    case 'completed':
    case 'done':
      return '已完成'
    case '已暂停':
    case 'paused':
    case 'archived':
      return '已暂停'
    default:
      return '未开始'
  }
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function parseTemplateNodes(raw: unknown): TemplateTreeNode[] {
  const source = (
    Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { wbs_nodes?: unknown } | null)?.wbs_nodes)
        ? (raw as { wbs_nodes?: unknown }).wbs_nodes
        : Array.isArray((raw as { template_data?: unknown } | null)?.template_data)
          ? (raw as { template_data?: unknown }).template_data
          : Array.isArray((raw as { nodes?: unknown } | null)?.nodes)
            ? (raw as { nodes?: unknown }).nodes
            : []
  ) as Array<Record<string, unknown>>

  return source.map((node) => ({
    title: String(node.title ?? node.name ?? '未命名节点').trim() || '未命名节点',
    reference_days: typeof node.reference_days === 'number'
      ? node.reference_days
      : typeof node.duration === 'number'
        ? node.duration
        : null,
    children: parseTemplateNodes(node.children ?? []),
  }))
}

function flattenTemplateNodes(nodes: TemplateTreeNode[]): TemplateTreeNode[] {
  const result: TemplateTreeNode[] = []
  const visit = (node: TemplateTreeNode) => {
    result.push(node)
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return result
}

function buildStructuralAnomalyCount(nodes: TemplateTreeNode[]): number {
  let anomalies = 0

  const visit = (items: TemplateTreeNode[]) => {
    const siblingNames = new Set<string>()

    for (const node of items) {
      const name = normalizeText(node.title)
      if (!name) {
        anomalies += 1
      }

      if (name && siblingNames.has(name)) {
        anomalies += 1
      }
      siblingNames.add(name)

      if (node.children.length > 0) {
        visit(node.children)
      }
    }
  }

  visit(nodes)
  return anomalies
}

function buildMissingStandardStepCount(nodes: TemplateTreeNode[], templateType?: string | null): number {
  const catalogMap: Record<string, string[]> = {
    住宅: [
      '场地准备与测量',
      '基坑支护与土方',
      '地基基础及地下室结构',
      '主体结构',
      '机电安装',
      '专项验收与交付',
    ],
    商业: [
      '场地准备与基坑工程',
      '基础与地下室结构',
      '地上主体结构',
      '外立面与屋面',
      '机电安装',
      '调试验收与移交',
    ],
    工业: [
      '场地准备与测量',
      '地基与基础',
      '钢结构主体与围护',
      '机电与工艺配套',
      '调试验收与移交',
    ],
    公共建筑: [
      '场地准备与测量',
      '基础与地下结构',
      '主体结构',
      '机电安装',
      '专项系统与功能用房',
      '调试验收与移交',
    ],
  }

  const catalog = catalogMap[String(templateType ?? '').trim()] ?? [
    '主体结构',
    '机电安装',
    '专项验收',
  ]
  const titles = new Set(flattenTemplateNodes(nodes).map((node) => normalizeText(node.title)))
  return catalog.filter((step) => !titles.has(normalizeText(step))).length
}

function buildQualitySnapshot(
  template: TemplateRecord,
  report: TemplateQualityApiResponse | null,
): WbsTemplateQualitySnapshot | null {
  if (!report) return null
  if (report.template_id !== template.id) return null

  const templateNodes = parseTemplateNodes(template.template_data ?? template.wbs_nodes ?? [])
  const flattenedNodes = flattenTemplateNodes(templateNodes)
  const leafNodes = flattenedNodes.filter((node) => node.children.length === 0)
  const missingReferenceDaysLeafCount = leafNodes.filter((node) => node.reference_days === null || node.reference_days === undefined).length
  const leafCount = leafNodes.length

  return {
    template_id: report.template_id,
    template_name: report.template_name,
    completed_project_count: report.feedback.completed_project_count,
    sample_task_count: report.feedback.sample_task_count,
    node_count: report.feedback.node_count,
    leaf_count: leafCount,
    missing_reference_days_leaf_count: missingReferenceDaysLeafCount,
    missing_reference_days_ratio: leafCount > 0 ? missingReferenceDaysLeafCount / leafCount : 0,
    missing_standard_step_count: buildMissingStandardStepCount(templateNodes, template.template_type),
    structure_anomaly_count: buildStructuralAnomalyCount(templateNodes),
    suggestions: report.nodes
      .filter((node) => node.is_leaf !== false)
      .filter((node) => node.suggested_reference_days !== null && node.suggested_reference_days !== undefined)
      .filter((node) => node.current_reference_days !== node.suggested_reference_days)
      .sort((left, right) => right.sample_count - left.sample_count),
  }
}

function buildFallbackGuide(params: {
  projectId: string
  projectName: string
  statusLabel: string
  mode: PlanningBootstrapPath
}): PlanningBootstrapGuide {
  return {
    project_id: params.projectId,
    project_name: params.projectName,
    status_label: params.statusLabel,
    mode: params.mode,
    title: '计划编制启用与 WBS 模板',
    subtitle: '',
    quickActions: [
      {
        path: 'template_to_baseline',
        label: 'WBS 模板 -> 项目基线',
        description: '',
      },
      {
        path: 'completed_project_to_template',
        label: '已完成项目 -> WBS 模板',
        description: '',
      },
      {
        path: 'ongoing_project_to_baseline',
        label: '在建项目 -> 初始化基线',
        description: '',
      },
    ],
    checklist: [
      { key: 'scan', title: '先看现状', detail: '识别当前执行到哪一步。' },
      { key: 'bootstrap', title: '自动补基线', detail: '自动补建初始基线，不用手工一条条录。' },
      { key: 'review', title: '确认映射', detail: '把待确认项补齐后再正式启用。' },
    ],
    learnMore: {
      title: '四层时间线怎么理解',
      sections: [
        { heading: '项目基线', body: '先定下来的主计划骨架，后续确认和对比都围绕它。' },
        { heading: '月度计划', body: '把本月真正要推进的事情说清楚。' },
        { heading: '当前项目计划时间', body: '系统整理后的最新计划时间。' },
        { heading: '项目实际执行时间', body: '现场真实发生的时间，用来复盘和看偏差。' },
      ],
    },
  }
}

function TemplateCardItem({
  template,
  selected,
  onSelect,
  onUse,
}: {
  template: TemplateRecord
  selected: boolean
  onSelect: () => void
  onUse: () => void
}) {
  const displayType = template.template_type || template.category || '通用'
  const color = getTypeColor(displayType)

  return (
    <Card
      data-testid={`wbs-template-card-${template.id}`}
      className={`cursor-pointer shadow-sm transition-all hover:shadow-md ${
        selected
          ? 'border-blue-300 ring-2 ring-blue-100'
          : 'border-slate-200'
      }`}
      onClick={onSelect}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color.bg}`}>
              <TemplateIcon type={displayType} className={`h-5 w-5 ${color.text}`} />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base">{template.name || '未命名模板'}</CardTitle>
              <CardDescription className="mt-1 line-clamp-2">
                {template.description || '把成熟结构整理成后续能直接复用的模板。'}
              </CardDescription>
              {selected ? (
                <div className="mt-2 text-xs font-medium text-blue-600">当前查看模板</div>
              ) : null}
            </div>
          </div>
          <Badge className={`${color.tagBg} ${color.tagText} border-0`}>{displayType}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>节点 {template.node_count ?? 0}</span>
          <span>·</span>
          <span>参考工期 {template.reference_days ?? '未设置'}</span>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={(event) => {
            event.stopPropagation()
            onUse()
          }}
        >
          用这个模板生成基线
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

export default function WBSTemplates() {
  const params = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const currentProject = useStore((state) => state.currentProject)

  const projectId = params.id || currentProject?.id || ''
  const projectName = currentProject && currentProject.id === projectId
    ? currentProject.name || '当前项目'
    : '当前项目'
  const projectStatusLabel = normalizeProjectLabel(currentProject?.status)

  const breadcrumbItems = useMemo(
    () => [
      { label: '首页', href: '/' },
      { label: projectName, href: `/projects/${projectId}` },
      { label: '计划编制' },
      { label: 'WBS 模板' },
    ],
    [projectId, projectName],
  )

  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [bootstrapGuide, setBootstrapGuide] = useState<PlanningBootstrapGuide | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [qualityReport, setQualityReport] = useState<TemplateQualityApiResponse | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [applyingFeedback, setApplyingFeedback] = useState(false)
  const [selectedSuggestionPaths, setSelectedSuggestionPaths] = useState<string[]>([])
  const isCompletedProject = projectStatusLabel === '已完成'

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null,
    [selectedTemplateId, templates],
  )
  const qualitySnapshot = useMemo(
    () => (selectedTemplate ? buildQualitySnapshot(selectedTemplate, qualityReport) : null),
    [qualityReport, selectedTemplate],
  )

  const allSuggestionPaths = useMemo(
    () => qualitySnapshot?.suggestions.map((suggestion) => suggestion.path) ?? [],
    [qualitySnapshot],
  )

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      if (!projectId) return
      setLoading(true)

      try {
        const [templateResponse, contextResponse] = await Promise.all([
          fetch(`${API_BASE}?project_id=${encodeURIComponent(projectId)}`, { signal: controller.signal }),
          fetch(`${API_BASE}/bootstrap/context?project_id=${encodeURIComponent(projectId)}`, { signal: controller.signal }),
        ])

        const templateJson = await templateResponse.json()
        const contextJson = await contextResponse.json()

        if (templateJson.success && Array.isArray(templateJson.data)) {
          setTemplates(templateJson.data)
        }

        if (contextJson.success && contextJson.data?.guide) {
          setBootstrapGuide(contextJson.data.guide)
        } else {
          setBootstrapGuide(buildFallbackGuide({
            projectId,
            projectName: String(projectName),
            statusLabel: normalizeProjectLabel(currentProject?.status),
            mode:
              normalizeProjectLabel(currentProject?.status) === '已完成'
                ? 'completed_project_to_template'
                : normalizeProjectLabel(currentProject?.status) === '进行中'
                  ? 'ongoing_project_to_baseline'
                  : 'template_to_baseline',
          }))
        }

        const seenKey = `${GUIDE_KEY_PREFIX}:${projectId}`
        const seen = safeStorageGet(window.localStorage, seenKey)
        if (!seen && window.innerWidth >= 640) {
          setGuideOpen(true)
        }
      } catch (error) {
        if (controller.signal.aborted) return
        console.error('Failed to load planning WBS templates', error)
        toast({
          title: '加载失败',
          description: '计划编制模板没能加载出来，请稍后再试。',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }

    void load()
    return () => { controller.abort() }
  }, [currentProject?.status, currentProject?.name, projectId, projectName, toast])

  useEffect(() => {
    if (templates.length === 0) {
      setSelectedTemplateId(null)
      return
    }

    if (!selectedTemplateId || !templates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(templates[0].id)
    }
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (!selectedTemplate?.id) {
      setQualityReport(null)
      setQualityLoading(false)
      return
    }

    let cancelled = false

    const loadQuality = async () => {
      setQualityReport(null)
      setQualityLoading(true)
      try {
        const response = await fetch(`${GOVERNANCE_API_BASE}/${encodeURIComponent(selectedTemplate.id)}/reference-days`)
        const result = await response.json()

        if (!cancelled && result.success) {
          setQualityReport(result.data as TemplateQualityApiResponse)
        } else if (!cancelled) {
          setQualityReport(null)
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load WBS template quality', error)
          setQualityReport(null)
        }
      } finally {
        if (!cancelled) {
          setQualityLoading(false)
        }
      }
    }

    void loadQuality()

    return () => {
      cancelled = true
    }
  }, [selectedTemplate?.id])

  useEffect(() => {
    setSelectedSuggestionPaths(allSuggestionPaths)
  }, [allSuggestionPaths])

  const handleGuideOpenChange = useCallback((open: boolean) => {
    setGuideOpen(open)
    if (!open) {
      if (projectId) {
        safeStorageSet(window.localStorage, `${GUIDE_KEY_PREFIX}:${projectId}`, '1')
      }
    }
  }, [projectId])

  const handleBootstrap = async (
    path: PlanningBootstrapPath,
    templateId?: string,
  ) => {
    if (!projectId) return

    try {
      let endpoint = `${API_BASE}/bootstrap/from-ongoing-project`
      let body: Record<string, unknown> = { project_id: projectId }

      if (path === 'template_to_baseline') {
        const selectedTemplate = templateId
          ? templates.find((template) => template.id === templateId)
          : null
        if (!selectedTemplate) {
          toast({
            title: '先选一个模板',
            description: templateId
              ? '这套模板已经找不到了，先换一套再生成项目基线。'
              : '请先在下方选择一套模板，再生成项目基线。',
          })
          return
        }
        endpoint = `${API_BASE}/bootstrap/from-template`
        body = {
          project_id: projectId,
          template_id: selectedTemplate.id,
        }
      } else if (path === 'completed_project_to_template') {
        endpoint = `${API_BASE}/bootstrap/from-completed-project`
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error?.message || '操作失败')
      }

      if (path === 'ongoing_project_to_baseline') {
        toast({
          title: '已自动补建初始基线',
          description: result.data?.needs_mapping_review
            ? '还有映射待确认项，已带你去项目基线继续处理。'
            : '已带你去项目基线继续处理。',
        })
        navigate(`/projects/${projectId}/planning/baseline`)
        return
      }

      if (path === 'completed_project_to_template') {
        const createdTemplate = result.data?.template as
          | (Partial<TemplateRecord> & { template_name?: string; template_data?: unknown; wbs_nodes?: unknown })
          | undefined

        if (createdTemplate?.id) {
          const normalizedTemplate: TemplateRecord = {
            ...createdTemplate,
            id: String(createdTemplate.id),
            name: createdTemplate.name ?? createdTemplate.template_name ?? '未命名模板',
            description: createdTemplate.description ?? null,
            template_type: createdTemplate.template_type ?? null,
            category: createdTemplate.category ?? null,
            node_count: createdTemplate.node_count ?? null,
            reference_days: createdTemplate.reference_days ?? null,
            status: createdTemplate.status ?? null,
            tags: createdTemplate.tags ?? null,
            template_data: createdTemplate.template_data ?? createdTemplate.wbs_nodes,
            wbs_nodes: createdTemplate.wbs_nodes ?? createdTemplate.template_data,
          }

          setTemplates((current) => [
            normalizedTemplate,
            ...current.filter((template) => template.id !== normalizedTemplate.id),
          ])
          setSelectedTemplateId(normalizedTemplate.id)
        }
      }

      toast({
        title: '已提交',
        description:
          path === 'completed_project_to_template'
            ? '已开始把项目沉淀成可复用模板。'
            : '已开始自动补建初始基线。',
      })
    } catch (error) {
      toast({
        title: '操作失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'destructive',
      })
    }
  }

  const handleApplyFeedback = async () => {
    if (!selectedTemplate?.id || !qualitySnapshot || allSuggestionPaths.length === 0) {
      return
    }

    const selectedPaths = allSuggestionPaths.filter((path) => selectedSuggestionPaths.includes(path))

    if (selectedPaths.length === 0) {
      return
    }

    setApplyingFeedback(true)

    try {
      const response = await fetch(`${GOVERNANCE_API_BASE}/${encodeURIComponent(selectedTemplate.id)}/reference-days/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apply_all: selectedPaths.length === allSuggestionPaths.length,
          selected_paths: selectedPaths,
        }),
      })
      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error?.message || '确认采纳失败')
      }

      const nextTemplateData = result.data?.template_data
      if (nextTemplateData !== undefined) {
        setTemplates((current) =>
          current.map((template) =>
            template.id === selectedTemplate.id
              ? {
                  ...template,
                  reference_days: result.data?.reference_days ?? template.reference_days,
                  template_data: nextTemplateData,
                  wbs_nodes: nextTemplateData,
                }
              : template,
          ),
        )
      }

      const refreshedQualityResponse = await fetch(`${GOVERNANCE_API_BASE}/${encodeURIComponent(selectedTemplate.id)}/reference-days`)
      const refreshedQualityResult = await refreshedQualityResponse.json()
      if (refreshedQualityResult.success) {
        setQualityReport(refreshedQualityResult.data as TemplateQualityApiResponse)
      }

      toast({
        title: '已确认采纳建议',
        description: `已采纳 ${selectedPaths.length} 条节点工期建议，正在刷新校核结果。`,
      })
    } catch (error) {
      toast({
        title: '确认采纳失败',
        description: error instanceof Error ? error.message : '请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setApplyingFeedback(false)
    }
  }

  const guide = bootstrapGuide ?? buildFallbackGuide({
    projectId,
    projectName: String(projectName),
    statusLabel: normalizeProjectLabel(currentProject?.status),
    mode:
      normalizeProjectLabel(currentProject?.status) === '已完成'
        ? 'completed_project_to_template'
        : normalizeProjectLabel(currentProject?.status) === '进行中'
          ? 'ongoing_project_to_baseline'
          : 'template_to_baseline',
  })

  return (
    <div className="min-h-full bg-slate-50 p-6 md:p-8" data-testid="wbs-templates-page">
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      <PageHeader
        eyebrow="计划编制"
        title="WBS 模板"
        subtitle=""
      />

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-5 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                {guide.status_label}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Layers3 className="h-3.5 w-3.5" />
                {guide.mode}
              </Badge>
            </div>

            <h2 className="text-xl font-semibold text-slate-900">计划编制入口</h2>

            <div className="grid gap-3 md:grid-cols-3">
              {guide.quickActions.map((action) => (
                <button
                  key={action.path}
                  type="button"
                  onClick={() => void handleBootstrap(action.path)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <WandSparkles className="h-4 w-4 text-slate-500" />
                    {action.label}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" className="gap-2" onClick={() => void handleBootstrap(guide.mode)}>
                <FileSymlink className="h-4 w-4" />
                {guide.mode === 'completed_project_to_template'
                  ? '沉淀为模板'
                  : guide.mode === 'template_to_baseline'
                    ? '生成基线'
                    : '在建项目一键启用'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">当前项目状态</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-900">{projectName}</div>
              <div className="mt-1 text-sm text-slate-600">状态：{projectStatusLabel}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedTemplate ? (
        <div className="mt-6">
          <TemplateQualityPanel
            templateName={selectedTemplate.name || '未命名模板'}
            templateType={selectedTemplate.template_type || selectedTemplate.category || null}
            quality={qualitySnapshot}
            loading={qualityLoading}
            applyingFeedback={applyingFeedback}
            canGenerateFromCompleted={isCompletedProject}
            selectedSuggestionPaths={selectedSuggestionPaths}
            onToggleSuggestion={(path) =>
              setSelectedSuggestionPaths((current) =>
                current.includes(path)
                  ? current.filter((item) => item !== path)
                  : [...current, path],
              )
            }
            onSelectAllSuggestions={() => setSelectedSuggestionPaths(allSuggestionPaths)}
            onClearSuggestionSelection={() => setSelectedSuggestionPaths([])}
            onGenerateFromCompleted={() => void handleBootstrap('completed_project_to_template')}
            onApplyFeedback={handleApplyFeedback}
          />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">模板列表</CardTitle>
          </CardHeader>
          <CardContent data-testid="wbs-template-list">
            {loading ? (
              <LoadingState
                label="模板列表加载中"
                className="min-h-40 border-slate-200 bg-slate-50/50"
              />
            ) : templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-400">
                  <Layers3 className="h-5 w-5" />
                </div>
                <div className="text-sm font-medium text-slate-800">当前还没有模板</div>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map((template) => (
                  <TemplateCardItem
                    key={template.id}
                    template={template}
                    selected={selectedTemplate?.id === template.id}
                    onSelect={() => setSelectedTemplateId(template.id)}
                    onUse={() => void handleBootstrap('template_to_baseline', template.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <OnboardingDialog
        open={guideOpen}
        onOpenChange={handleGuideOpenChange}
        onLearnMore={() => {
          if (projectId) {
            safeStorageSet(window.localStorage, `${GUIDE_KEY_PREFIX}:${projectId}`, '1')
          }
          navigate(`/projects/${projectId}/planning/wbs-templates`)
        }}
        projectName={String(projectName)}
      />
    </div>
  )
}
