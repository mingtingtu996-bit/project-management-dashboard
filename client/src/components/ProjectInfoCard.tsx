import { useEffect, useMemo, useState } from 'react'
import { Building2, Calendar, ChevronDown, ChevronUp, Plus, Timer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type ScopeDimensionKey = 'building' | 'specialty' | 'phase' | 'region'

export interface ScopeDimensionSection {
  key: ScopeDimensionKey
  label: string
  description?: string
  options: string[]
  selected: string[]
}

export type ScopeDraft = Record<ScopeDimensionKey, string[]>

export interface ProjectBasicInfoDraft {
  projectName: string
  projectDescription: string
  projectLocation: string
  projectStatus: string
  projectPhase: string
  plannedStartDate: string
  plannedEndDate: string
  actualStartDate: string
  actualEndDate: string
}

interface ProjectInfoCardProps {
  projectName: string
  projectDescription?: string
  projectLocation?: string
  projectType?: string
  buildingType?: string
  structureType?: string
  buildingCount?: number
  aboveGroundFloors?: number
  undergroundFloors?: number
  supportMethod?: string
  totalArea?: number
  plannedStartDate?: string
  plannedEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
  totalInvestment?: number
  healthScore?: number
  healthStatus?: string
  status?: string
  projectPhase?: string
  scopeSections?: ScopeDimensionSection[]
  onSaveScope?: (sections: ScopeDraft) => Promise<void>
  onSaveBasicInfo?: (draft: ProjectBasicInfoDraft) => Promise<void>
  scopeLoading?: boolean
  scopeSaving?: boolean
  basicInfoSaving?: boolean
}

const healthColorMap: Record<string, string> = {
  excellent: 'text-emerald-600',
  good: 'text-blue-600',
  warning: 'text-amber-600',
  critical: 'text-red-600',
}

const SCOPE_KEYS: ScopeDimensionKey[] = ['building', 'specialty', 'phase', 'region']

const PROJECT_STATUS_OPTIONS = [
  { value: '未开始', label: '未开始' },
  { value: '进行中', label: '进行中' },
  { value: '已完成', label: '已完成' },
  { value: '已暂停', label: '已暂停' },
]

const PROJECT_PHASE_OPTIONS = [
  { value: 'pre-construction', label: '前期准备' },
  { value: 'construction', label: '建设实施' },
  { value: 'completion', label: '竣工收尾' },
  { value: 'delivery', label: '交付阶段' },
]

const SCOPE_META: Record<ScopeDimensionKey, { label: string; description: string }> = {
  building: { label: '建筑维度', description: '楼栋 / 建筑类型' },
  specialty: { label: '专业维度', description: '专项工程 / 专业分类' },
  phase: { label: '阶段维度', description: '项目阶段 / 里程碑阶段' },
  region: { label: '区域维度', description: '片区 / 标段 / 区域分区' },
}

function normalizeText(value?: string | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function toReadableDate(value?: string | null) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN')
}

function toReadableNumber(value?: number, suffix = '') {
  if (value === undefined || value === null || Number.isNaN(value)) return '未设置'
  return `${value.toLocaleString()}${suffix}`
}

function normalizeProjectStatus(status?: string | null) {
  switch (String(status ?? '').trim()) {
    case 'active':
    case 'in_progress':
      return '进行中'
    case 'completed':
      return '已完成'
    case 'paused':
    case 'archived':
      return '已暂停'
    case '未开始':
    case '进行中':
    case '已完成':
    case '已暂停':
      return String(status ?? '').trim()
    default:
      return '未开始'
  }
}

function normalizePhaseValue(value?: string | null) {
  const normalized = String(value ?? '').trim()
  return PROJECT_PHASE_OPTIONS.some((option) => option.value === normalized) ? normalized : ''
}

function formatProjectPhaseLabel(value?: string | null) {
  const normalized = normalizePhaseValue(value)
  return PROJECT_PHASE_OPTIONS.find((option) => option.value === normalized)?.label || '未设置'
}

function buildBasicInfoDraft(props: {
  projectName: string
  projectDescription?: string
  projectLocation?: string
  status?: string
  projectPhase?: string
  plannedStartDate?: string
  plannedEndDate?: string
  actualStartDate?: string
  actualEndDate?: string
}): ProjectBasicInfoDraft {
  return {
    projectName: props.projectName,
    projectDescription: props.projectDescription ?? '',
    projectLocation: props.projectLocation ?? '',
    projectStatus: normalizeProjectStatus(props.status),
    projectPhase: normalizePhaseValue(props.projectPhase),
    plannedStartDate: props.plannedStartDate ?? '',
    plannedEndDate: props.plannedEndDate ?? '',
    actualStartDate: props.actualStartDate ?? '',
    actualEndDate: props.actualEndDate ?? '',
  }
}

function buildScopeDraft(sections?: ScopeDimensionSection[]): ScopeDraft {
  const sectionMap = new Map<ScopeDimensionKey, ScopeDimensionSection>(
    (sections ?? []).map((section) => [section.key, section]),
  )

  return {
    building: sectionMap.get('building')?.selected ?? [],
    specialty: sectionMap.get('specialty')?.selected ?? [],
    phase: sectionMap.get('phase')?.selected ?? [],
    region: sectionMap.get('region')?.selected ?? [],
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}

export default function ProjectInfoCard({
  projectName,
  projectDescription,
  projectLocation,
  projectType,
  buildingType,
  structureType,
  buildingCount,
  aboveGroundFloors,
  undergroundFloors,
  supportMethod,
  totalArea,
  plannedStartDate,
  plannedEndDate,
  actualStartDate,
  actualEndDate,
  totalInvestment,
  healthScore,
  healthStatus,
  status = 'active',
  projectPhase,
  scopeSections,
  onSaveScope,
  onSaveBasicInfo,
  scopeLoading = false,
  scopeSaving = false,
  basicInfoSaving = false,
}: ProjectInfoCardProps) {
  const [basicInfoExpanded, setBasicInfoExpanded] = useState(Boolean(onSaveBasicInfo))
  const [basicInfoDraft, setBasicInfoDraft] = useState<ProjectBasicInfoDraft>(() =>
    buildBasicInfoDraft({
      projectName,
      projectDescription,
      projectLocation,
      status,
      projectPhase,
      plannedStartDate,
      plannedEndDate,
      actualStartDate,
      actualEndDate,
    }),
  )
  const [scopeExpanded, setScopeExpanded] = useState(Boolean(onSaveScope) || scopeLoading)
  const [scopeDraft, setScopeDraft] = useState<ScopeDraft>(() => buildScopeDraft(scopeSections))
  const [scopeDraftInputs, setScopeDraftInputs] = useState<Record<ScopeDimensionKey, string>>({
    building: '',
    specialty: '',
    phase: '',
    region: '',
  })

  const scopeSectionMap = useMemo(
    () => new Map<ScopeDimensionKey, ScopeDimensionSection>((scopeSections ?? []).map((section) => [section.key, section])),
    [scopeSections],
  )

  useEffect(() => {
    setScopeDraft(buildScopeDraft(scopeSections))
  }, [scopeSections])

  useEffect(() => {
    setBasicInfoDraft(
      buildBasicInfoDraft({
        projectName,
        projectDescription,
        projectLocation,
        status,
        projectPhase,
        plannedStartDate,
        plannedEndDate,
        actualStartDate,
        actualEndDate,
      }),
    )
  }, [
    actualEndDate,
    actualStartDate,
    plannedEndDate,
    plannedStartDate,
    projectDescription,
    projectLocation,
    projectName,
    projectPhase,
    status,
  ])

  const plannedDuration = useMemo(() => {
    if (!plannedStartDate || !plannedEndDate) return null
    const start = new Date(plannedStartDate)
    const end = new Date(plannedEndDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    const diff = Math.ceil((end.getTime() - start.getTime()) / 86400000)
    return diff > 0 ? diff : null
  }, [plannedEndDate, plannedStartDate])

  const remainingDays = useMemo(() => {
    if (!plannedEndDate) return null
    const end = new Date(plannedEndDate)
    if (Number.isNaN(end.getTime())) return null
    return Math.ceil((end.getTime() - Date.now()) / 86400000)
  }, [plannedEndDate])

  const remainingStyle = useMemo(() => {
    if (remainingDays === null) return { text: '未设置', color: 'text-gray-400', bg: 'bg-gray-50' }
    if (remainingDays < 0) return { text: `已延期 ${Math.abs(remainingDays)} 天`, color: 'text-red-600', bg: 'bg-red-50' }
    if (remainingDays === 0) return { text: '今天截止', color: 'text-amber-600', bg: 'bg-amber-50' }
    if (remainingDays <= 7) return { text: `剩余 ${remainingDays} 天`, color: 'text-amber-600', bg: 'bg-amber-50' }
    if (remainingDays <= 30) return { text: `剩余 ${remainingDays} 天`, color: 'text-blue-600', bg: 'bg-blue-50' }
    return { text: `剩余 ${remainingDays} 天`, color: 'text-emerald-600', bg: 'bg-emerald-50' }
  }, [remainingDays])

  const handleScopeToggle = (key: ScopeDimensionKey, value: string) => {
    const normalized = normalizeText(value)
    if (!normalized) return
    setScopeDraft((previous) => {
      const next = previous[key] ?? []
      return {
        ...previous,
        [key]: next.includes(normalized)
          ? next.filter((item) => item !== normalized)
          : [...next, normalized],
      }
    })
  }

  const handleAddCustomScope = (key: ScopeDimensionKey) => {
    const value = normalizeText(scopeDraftInputs[key])
    if (!value) return
    setScopeDraft((previous) => ({
      ...previous,
      [key]: unique([...(previous[key] ?? []), value]),
    }))
    setScopeDraftInputs((previous) => ({ ...previous, [key]: '' }))
  }

  const handleSaveScope = async () => {
    if (!onSaveScope) return
    await onSaveScope({
      building: unique(scopeDraft.building ?? []),
      specialty: unique(scopeDraft.specialty ?? []),
      phase: unique(scopeDraft.phase ?? []),
      region: unique(scopeDraft.region ?? []),
    })
  }

  const handleSaveBasicInfo = async () => {
    if (!onSaveBasicInfo) return
    await onSaveBasicInfo({
      ...basicInfoDraft,
      projectName: basicInfoDraft.projectName.trim(),
      projectDescription: basicInfoDraft.projectDescription.trim(),
      projectLocation: basicInfoDraft.projectLocation.trim(),
      projectStatus: normalizeProjectStatus(basicInfoDraft.projectStatus),
      projectPhase: normalizePhaseValue(basicInfoDraft.projectPhase),
      plannedStartDate: basicInfoDraft.plannedStartDate.trim(),
      plannedEndDate: basicInfoDraft.plannedEndDate.trim(),
      actualStartDate: basicInfoDraft.actualStartDate.trim(),
      actualEndDate: basicInfoDraft.actualEndDate.trim(),
    })
  }

  return (
    <Card variant="detail">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-500">
              <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-blue-500" />
              项目信息
            </CardTitle>
            <h3 className="truncate text-base font-semibold text-slate-900">{projectName}</h3>
          </div>
          <StatusBadge status={status} className="text-xs" fallbackLabel="进行中" />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">范围摘要</p>
              <p className="text-sm font-medium text-slate-900">{scopeLoading ? '加载中' : '已配置'}</p>
            </div>
            {onSaveScope && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs"
                onClick={() => setScopeExpanded((previous) => !previous)}
              >
                {scopeExpanded ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
                {scopeExpanded ? '收起维护' : '展开维护'}
              </Button>
            )}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {SCOPE_KEYS.map((key) => {
              const section = scopeSectionMap.get(key)
              const selected = section?.selected ?? []
              return (
                <div key={key} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">{section?.label || SCOPE_META[key].label}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.length > 0 ? selected.map((label) => (
                      <Badge key={label} variant="secondary" className="bg-blue-50 text-blue-700">
                        {label}
                      </Badge>
                    )) : (
                      <span className="text-sm text-slate-400">未配置</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {onSaveScope && scopeExpanded && (
            <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
              {SCOPE_KEYS.map((key) => {
                const section = scopeSectionMap.get(key)
                const options = unique([...(section?.options ?? []), ...(scopeDraft[key] ?? [])])
                const selected = scopeDraft[key] ?? []
                return (
                  <div key={key} className="space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{section?.label || SCOPE_META[key].label}</p>
                      <p className="text-xs text-slate-500">{section?.description || SCOPE_META[key].description}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {options.length > 0 ? options.map((option) => {
                        const active = selected.includes(option)
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => handleScopeToggle(key, option)}
                            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                              active
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {option}
                          </button>
                        )
                      }) : (
                        <span className="text-sm text-slate-400">暂无可选项</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={scopeDraftInputs[key]}
                        onChange={(event) => setScopeDraftInputs((previous) => ({ ...previous, [key]: event.target.value }))}
                        placeholder={`补录 ${section?.label || SCOPE_META[key].label}`}
                        className="h-9"
                      />
                      <Button type="button" variant="outline" className="h-9 px-3" onClick={() => handleAddCustomScope(key)}>
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        添加
                      </Button>
                    </div>
                  </div>
                )
              })}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setScopeDraft(buildScopeDraft(scopeSections))
                    setScopeExpanded(false)
                  }}
                  disabled={scopeSaving}
                >
                  取消
                </Button>
                <Button type="button" onClick={() => void handleSaveScope()} disabled={scopeSaving}>
                  {scopeSaving ? '保存中' : '保存范围'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {onSaveBasicInfo && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">基础信息</p>
                <p className="text-sm text-slate-600">项目名称、描述、位置、状态与阶段</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-3 text-xs"
                onClick={() => setBasicInfoExpanded((previous) => !previous)}
              >
                {basicInfoExpanded ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}
                {basicInfoExpanded ? '收起编辑' : '展开编辑'}
              </Button>
            </div>

            {basicInfoExpanded && (
              <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <p className="text-xs text-slate-500">项目名称</p>
                    <Input
                      value={basicInfoDraft.projectName}
                      onChange={(event) => setBasicInfoDraft((previous) => ({ ...previous, projectName: event.target.value }))}
                      placeholder="请输入项目名称"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <p className="text-xs text-slate-500">项目描述</p>
                    <Textarea
                      value={basicInfoDraft.projectDescription}
                      onChange={(event) => setBasicInfoDraft((previous) => ({ ...previous, projectDescription: event.target.value }))}
                      placeholder="请输入项目描述"
                      className="min-h-[96px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">项目位置</p>
                    <Input
                      value={basicInfoDraft.projectLocation}
                      onChange={(event) => setBasicInfoDraft((previous) => ({ ...previous, projectLocation: event.target.value }))}
                      placeholder="请输入项目位置"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">项目状态</p>
                    <Select
                      value={basicInfoDraft.projectStatus}
                      onValueChange={(value) => setBasicInfoDraft((previous) => ({ ...previous, projectStatus: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择项目状态" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">当前阶段</p>
                    <Select
                      value={basicInfoDraft.projectPhase}
                      onValueChange={(value) => setBasicInfoDraft((previous) => ({ ...previous, projectPhase: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择当前阶段" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_PHASE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">计划开始</p>
                    <Input
                      type="date"
                      value={basicInfoDraft.plannedStartDate}
                      onChange={(event) => setBasicInfoDraft((previous) => ({ ...previous, plannedStartDate: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">计划结束</p>
                    <Input
                      type="date"
                      value={basicInfoDraft.plannedEndDate}
                      onChange={(event) => setBasicInfoDraft((previous) => ({ ...previous, plannedEndDate: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">实际开始</p>
                    <Input
                      type="date"
                      value={basicInfoDraft.actualStartDate}
                      onChange={(event) => setBasicInfoDraft((previous) => ({ ...previous, actualStartDate: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-500">实际结束</p>
                    <Input
                      type="date"
                      value={basicInfoDraft.actualEndDate}
                      onChange={(event) => setBasicInfoDraft((previous) => ({ ...previous, actualEndDate: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={basicInfoSaving}
                    onClick={() => {
                      setBasicInfoDraft(
                        buildBasicInfoDraft({
                          projectName,
                          projectDescription,
                          projectLocation,
                          status,
                          projectPhase,
                          plannedStartDate,
                          plannedEndDate,
                          actualStartDate,
                          actualEndDate,
                        }),
                      )
                      setBasicInfoExpanded(false)
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSaveBasicInfo()}
                    disabled={basicInfoSaving || basicInfoDraft.projectName.trim().length === 0}
                  >
                    {basicInfoSaving ? '保存中' : '保存基础信息'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
          <Field label="项目位置" value={projectLocation || '未设置'} />
          <Field label="当前阶段" value={formatProjectPhaseLabel(projectPhase)} />
          <Field label="项目类型" value={projectType || '未设置'} />
          <Field label="建筑类型" value={buildingType || '未设置'} />
          <Field label="结构类型" value={structureType || '未设置'} />
          <Field label="支撑方式" value={supportMethod || '未设置'} />
          <Field label="楼栋数" value={toReadableNumber(buildingCount, ' 栋')} />
          <Field label="建筑面积" value={toReadableNumber(totalArea, ' ㎡')} />
          <Field label="地上 / 地下" value={`${aboveGroundFloors ?? '未设置'} / ${undergroundFloors ?? '未设置'}`} />
          <Field label="总投资" value={toReadableNumber(totalInvestment, ' 元')} />
          <Field label="计划工期" value={plannedDuration ? `${plannedDuration} 天` : '未设置'} />
          <Field label="计划开始" value={toReadableDate(plannedStartDate)} />
          <Field label="计划结束" value={toReadableDate(plannedEndDate)} />
          <Field label="实际开始" value={toReadableDate(actualStartDate)} />
          <Field label="实际结束" value={toReadableDate(actualEndDate)} />
          {healthScore !== undefined && (
            <Field
              label="健康度"
              value={`${healthScore} 分`}
            />
          )}
        </div>

        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ${remainingStyle.bg}`}>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">
              {plannedStartDate ? toReadableDate(plannedStartDate) : '未设置'} - {plannedEndDate ? toReadableDate(plannedEndDate) : '未设置'}
            </span>
            {plannedDuration && <span className="text-slate-400">({plannedDuration} 天)</span>}
          </div>
          <div className="flex items-center gap-2 rounded-full px-3 py-1">
            <Timer className={`h-4 w-4 ${remainingStyle.color}`} />
            <span className={`text-sm font-medium ${remainingStyle.color}`}>{remainingStyle.text}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
