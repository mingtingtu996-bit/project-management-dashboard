// v1.4.20.1: /demo is a read-only product preview namespace.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Building2, Eye, Lock, PlayCircle } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CardHead } from '@/components/ui/card-head'
import { LoadingState } from '@/components/ui/loading-state'
import { apiGet, getApiErrorMessage } from '@/lib/apiClient'
import { cn } from '@/lib/utils'

type DemoProjectPayload = {
  stage?: unknown
  highlights?: unknown
  disabledActions?: unknown
  metrics?: unknown
}

type DemoProject = {
  id: string
  name: string
  description?: string | null
  project_type?: string | null
  type?: string | null
  stage?: string | null
  thumbnail_url?: string | null
  sort_order?: number | null
  preview_payload?: DemoProjectPayload | null
}

const DEMO_FALLBACKS: Record<string, Pick<DemoProject, 'name' | 'description' | 'project_type' | 'stage' | 'preview_payload'>> = {
  residential: {
    name: '住宅小区综合项目',
    description: '典型住宅建筑工程示例，展示从计划编制到现场执行的闭环。',
    project_type: 'residential',
    stage: '主体施工',
    preview_payload: {
      highlights: ['任务列表', '项目基线', '月度计划'],
      disabledActions: ['保存任务', '发布基线', '月度确认'],
    },
  },
  commercial: {
    name: '商业综合体项目',
    description: '商业建筑全生命周期示例，展示专业交叉、关键路径和风险预警。',
    project_type: 'commercial',
    stage: '装修阶段',
    preview_payload: {
      highlights: ['计划编制', '关键路径', '风险预警'],
      disabledActions: ['保存任务', '发布基线', '月度确认'],
    },
  },
  industrial: {
    name: '工业厂房项目',
    description: '工业建筑施工管理示例，展示钢结构、设备基础和专项验收链路。',
    project_type: 'industrial',
    stage: '基础施工',
    preview_payload: {
      highlights: ['工程对象', '工序模板', '资源冲突识别'],
      disabledActions: ['保存任务', '发布基线', '月度确认'],
    },
  },
}

function asArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function normalizeType(project: DemoProject) {
  return (project.project_type || project.type || '').trim().toLowerCase()
}

function getProjectDisplay(project: DemoProject) {
  const type = normalizeType(project)
  const fallback = DEMO_FALLBACKS[type]
  const payload = project.preview_payload ?? fallback?.preview_payload ?? {}
  const stage = project.stage || (typeof payload.stage === 'string' ? payload.stage : '') || fallback?.stage || '只读预览'

  return {
    name: project.name || fallback?.name || '演示项目',
    description: project.description || fallback?.description || '查看 WorkBuddy 项目管理核心能力的只读演示。',
    type: type || fallback?.project_type || 'demo',
    stage,
    highlights: asArray(payload.highlights).length > 0
      ? asArray(payload.highlights)
      : asArray(fallback?.preview_payload?.highlights),
    disabledActions: asArray(payload.disabledActions).length > 0
      ? asArray(payload.disabledActions)
      : asArray(fallback?.preview_payload?.disabledActions),
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'residential':
      return '住宅'
    case 'commercial':
      return '商业'
    case 'industrial':
      return '工业'
    default:
      return '演示'
  }
}

export function DemoPreviewPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<DemoProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadDemoProjects() {
      setLoading(true)
      setError(null)

      try {
        const data = await apiGet<DemoProject[]>('/api/demo-projects')
        if (!active) return

        const nextProjects = Array.isArray(data) ? data : []
        setProjects(nextProjects)
        setSelectedProjectId((current) => current || nextProjects[0]?.id || null)
      } catch (loadError) {
        if (!active) return
        setError(getApiErrorMessage(loadError, '当前无法加载演示项目，请稍后重试。'))
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDemoProjects()

    return () => {
      active = false
    }
  }, [])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  )
  const selectedDisplay = selectedProject ? getProjectDisplay(selectedProject) : null

  return (
    <div className="page-shell page-enter space-y-6 pb-12 pt-6" data-testid="demo-preview-page">
      <div
        className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 sm:flex-row sm:items-center sm:justify-between"
        data-testid="demo-readonly-banner"
      >
        <div className="flex items-start gap-2">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">产品预览模式</p>
            <p className="mt-0.5 text-blue-700">所有数据为演示数据，写入功能已禁用，不进入真实项目统计。</p>
          </div>
        </div>
        <Badge variant="outline" className="w-fit bg-white text-blue-700">
          只读
        </Badge>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/workspace')}
          className="w-fit gap-1"
          data-testid="demo-back-workspace"
        >
          <ArrowLeft className="h-4 w-4" />
          返回工作台
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled
          className="w-fit gap-1"
          data-testid="demo-write-disabled-action"
        >
          <Lock className="h-4 w-4" />
          写入功能已禁用
        </Button>
      </div>

      {loading ? (
        <LoadingState label="正在加载演示项目..." data-testid="demo-loading" />
      ) : error ? (
        <Card variant="ghost" className="border-rose-200 bg-rose-50/80" data-testid="demo-error">
          <CardContent padding="md" className="flex items-start gap-3 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold text-rose-900">演示项目加载失败</p>
              <p className="mt-1">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : projects.length === 0 ? (
        <Card variant="ghost" data-testid="demo-empty">
          <CardContent padding="md" className="text-sm text-slate-500">
            暂无可用演示项目。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card variant="surface">
            <CardContent padding="md" className="space-y-4">
              <div>
                <CardHead eyebrow="DEMO" title="演示项目" />
                <p className="mt-1 text-sm text-slate-500">选择一个示例，只在当前产品预览页查看能力说明。</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {projects.map((project) => {
                  const display = getProjectDisplay(project)
                  const selected = selectedProject?.id === project.id

                  return (
                    <Button unstyled
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProjectId(project.id)}
                      className={cn(
                        'group rounded-xl border bg-white px-4 py-4 text-left shadow-[var(--el-1)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--el-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0',
                        selected ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300',
                      )}
                      aria-pressed={selected}
                      data-testid={`demo-project-card-${project.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{display.name}</p>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{display.description}</p>
                        </div>
                        <Building2 className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-blue-500" />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{getTypeLabel(display.type)}</Badge>
                        <Badge variant="secondary">{display.stage}</Badge>
                      </div>
                    </Button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {selectedProject && selectedDisplay ? (
            <Card variant="detail" data-testid="demo-project-detail">
              <CardContent padding="md" className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase text-blue-600">只读演示详情</p>
                  <h2 className="mt-2 text-lg font-semibold text-slate-950">{selectedDisplay.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{selectedDisplay.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-slate-50 px-3 py-3">
                    <p className="text-xs text-slate-500">项目类型</p>
                    <p className="mt-1 font-semibold text-slate-900">{getTypeLabel(selectedDisplay.type)}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-3">
                    <p className="text-xs text-slate-500">演示阶段</p>
                    <p className="mt-1 font-semibold text-slate-900">{selectedDisplay.stage}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">可查看能力</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedDisplay.highlights.map((item) => (
                      <Badge key={item} variant="secondary">{item}</Badge>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Lock className="h-4 w-4 text-slate-500" />
                    禁用写入动作
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedDisplay.disabledActions.map((item) => (
                      <Badge key={item} variant="outline">{item}</Badge>
                    ))}
                  </div>
                </div>

                <Button className="w-full gap-2" disabled>
                  <PlayCircle className="h-4 w-4" />
                  进入真实项目前请返回工作台
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default DemoPreviewPage
