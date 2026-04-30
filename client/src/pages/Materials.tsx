import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Boxes,
  ClipboardList,
  PackageCheck,
  PackageSearch,
  PencilLine,
  Plus,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react'

import { Breadcrumb } from '@/components/Breadcrumb'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { DisabledReasonTooltip } from '@/components/ui/disabled-reason-tooltip'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePermissions } from '@/hooks/usePermissions'
import { toast } from '@/hooks/use-toast'
import { useCurrentProject } from '@/hooks/useStore'
import { getApiErrorMessage, isAbortError } from '@/lib/apiClient'
import { formatDateTime as formatDisplayDateTime } from '@/lib/formatters'
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import {
  MATERIAL_TEMPLATE_GROUPS,
  type MaterialTemplateGroup,
} from '@/lib/materialTemplates'
import {
  buildMaterialSummaryCounts,
  getMaterialPrimaryStatus,
  getMaterialStatusLabel,
  getMaterialStatusTone,
  isMaterialArrivedThisWeek,
  matchesMaterialStatusFilter,
  type MaterialPrimaryStatus,
  type MaterialStatusFilter,
} from '@/lib/materialStatus'
import {
  MaterialsApiService,
  type MaterialCategorySummary,
  type MaterialChangeLogRecord,
  type MaterialReportSummary,
  type MaterialMutationPayload,
  type MaterialReminderRecord,
  type MaterialTaskDelayRisk,
  type MaterialTaskDurationEstimate,
  type ParticipantUnitSummary,
  type ProjectWeeklyDigestSnapshot,
  type ProjectMaterialRecord,
} from '@/services/materialsApi'

type CreateMode = 'single' | 'template' | 'batch'

type MaterialFormState = {
  material_name: string
  specialty_type: string
  participant_unit_id: string
  expected_arrival_date: string
  actual_arrival_date: string
  requires_sample_confirmation: boolean
  sample_confirmed: boolean
  requires_inspection: boolean
  inspection_done: boolean
}

type BatchDraftRow = {
  id: string
  material_name: string
  specialty_type: string
  participant_unit_id: string
  expected_arrival_date: string
  requires_sample_confirmation: boolean
  requires_inspection: boolean
}

type MaterialGroup = {
  participantUnitId: string | null
  participantUnitName: string
  specialtyTypes: string[]
  materials: ProjectMaterialRecord[]
}

type MaterialAiPlan = {
  recommendedBufferDays: number
  suggestedExpectedArrivalDate: string | null
  currentBufferDays: number | null
}

const STATUS_OPTIONS: Array<{ value: MaterialStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending_sample', label: '待定样' },
  { value: 'pending_arrival', label: '待到场' },
  { value: 'overdue_arrival', label: '逾期未到' },
  { value: 'arrived_this_week', label: '本周到场' },
  { value: 'pending_inspection', label: '待送检' },
  { value: 'completed', label: '已完成' },
]

const NO_PARTICIPANT_UNIT_VALUE = '__no_participant_unit__'

function ParticipantUnitSelect({
  value,
  onChange,
  units,
  disabled,
  dataTestId,
  triggerClassName = 'h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900',
}: {
  value: string
  onChange: (value: string) => void
  units: ParticipantUnitSummary[]
  disabled?: boolean
  dataTestId?: string
  triggerClassName?: string
}) {
  return (
    <>
      {dataTestId ? (
        <input
          type="hidden"
          data-testid={`${dataTestId}-value`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onInput={(event) => onChange(event.currentTarget.value)}
          aria-hidden="true"
        />
      ) : null}
      <Select
        value={value || NO_PARTICIPANT_UNIT_VALUE}
        onValueChange={(nextValue) => onChange(nextValue === NO_PARTICIPANT_UNIT_VALUE ? '' : nextValue)}
        disabled={disabled}
      >
        <SelectTrigger className={triggerClassName} data-testid={dataTestId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PARTICIPANT_UNIT_VALUE}>暂不关联</SelectItem>
          {units.map((unit) => (
            <SelectItem key={unit.id} value={unit.id}>
              {unit.unit_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}

const EMPTY_FORM: MaterialFormState = {
  material_name: '',
  specialty_type: '',
  participant_unit_id: '',
  expected_arrival_date: '',
  actual_arrival_date: '',
  requires_sample_confirmation: false,
  sample_confirmed: false,
  requires_inspection: false,
  inspection_done: false,
}

function createBatchRow(): BatchDraftRow {
  return {
    id: Math.random().toString(36).slice(2, 10),
    material_name: '',
    specialty_type: '',
    participant_unit_id: '',
    expected_arrival_date: '',
    requires_sample_confirmation: false,
    requires_inspection: false,
  }
}

function toFormState(material: ProjectMaterialRecord): MaterialFormState {
  return {
    material_name: material.material_name,
    specialty_type: material.specialty_type ?? '',
    participant_unit_id: material.participant_unit_id ?? '',
    expected_arrival_date: material.expected_arrival_date,
    actual_arrival_date: material.actual_arrival_date ?? '',
    requires_sample_confirmation: material.requires_sample_confirmation,
    sample_confirmed: material.sample_confirmed,
    requires_inspection: material.requires_inspection,
    inspection_done: material.inspection_done,
  }
}

function buildCreatePayload(form: MaterialFormState): MaterialMutationPayload {
  const requiresSampleConfirmation = form.requires_sample_confirmation
  const requiresInspection = form.requires_inspection

  return {
    participant_unit_id: form.participant_unit_id || null,
    material_name: form.material_name.trim(),
    specialty_type: form.specialty_type.trim() || null,
    expected_arrival_date: form.expected_arrival_date,
    actual_arrival_date: form.actual_arrival_date || null,
    requires_sample_confirmation: requiresSampleConfirmation,
    sample_confirmed: requiresSampleConfirmation ? form.sample_confirmed : false,
    requires_inspection: requiresInspection,
    inspection_done: requiresInspection ? form.inspection_done : false,
  }
}

function formatDateTimeLabel(value?: string | null) {
  return formatDisplayDateTime(value, '未生成')
}

function formatWeekLabel(value?: string | null) {
  return String(value ?? '').trim() || '当前周'
}

function getReminderTone(reminder: Pick<MaterialReminderRecord, 'severity' | 'type'>) {
  if (reminder.type === 'material_arrival_overdue' || reminder.severity === 'critical') {
    return 'border-red-200 bg-red-50 text-red-800'
  }
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

const MATERIAL_CATEGORY_COLORS: Record<string, string> = {
  钢材: '#2563eb',
  混凝土: '#64748b',
  管材: '#0f766e',
  电气: '#f59e0b',
  其他: '#94a3b8',
}

function getMaterialStatusDotTone(status: MaterialPrimaryStatus) {
  switch (status) {
    case 'pending_sample':
      return 'bg-amber-500'
    case 'pending_arrival':
      return 'bg-slate-400'
    case 'overdue_arrival':
      return 'bg-red-500'
    case 'pending_inspection':
      return 'bg-sky-500'
    case 'completed':
      return 'bg-emerald-500'
    default:
      return 'bg-slate-400'
  }
}

function MaterialStatusPill({ material }: { material: ProjectMaterialRecord }) {
  const status = getMaterialPrimaryStatus(material)

  return (
    <span
      data-testid={`material-status-chip-${material.id}`}
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${getMaterialStatusTone(status)}`}
    >
      <span className={`h-2 w-2 rounded-full ${getMaterialStatusDotTone(status)}`} />
      {getMaterialStatusLabel(status)}
    </span>
  )
}

function MaterialMetricCard({
  label,
  value,
  trend,
  icon: Icon,
}: {
  label: string
  value: string | number
  trend: string
  icon: typeof Boxes
}) {
  return (
    <Card className="card-unified p-0" data-testid={`materials-metric-${label}`}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
          <div className="mt-2 text-xs leading-5 text-slate-500">{trend}</div>
        </div>
        <div className="shrink-0 rounded-lg bg-blue-50 p-2 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function MiniMetric({ label, value, tone = 'slate' }: { label: string; value: string | number; tone?: 'slate' | 'amber' | 'red' | 'sky' }) {
  const toneClass = {
    slate: 'bg-slate-50 text-slate-900 ring-slate-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
    sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  }[tone]

  return (
    <div className={`rounded-lg px-3 py-3 ring-1 ${toneClass}`}>
      <div className="text-xs font-medium text-slate-700">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function buildCategoryPieGradient(categories: MaterialCategorySummary[]) {
  const visible = categories.filter((item) => item.count > 0 && item.percentage > 0)
  if (visible.length === 0) return '#e2e8f0 0 100%'

  let cursor = 0
  return visible
    .map((item) => {
      const start = cursor
      cursor += item.percentage
      return `${MATERIAL_CATEGORY_COLORS[item.category] ?? MATERIAL_CATEGORY_COLORS.其他} ${start}% ${Math.min(cursor, 100)}%`
    })
    .join(', ')
}

function MaterialCategoryPie({ categories }: { categories: MaterialCategorySummary[] }) {
  const total = categories.reduce((sum, item) => sum + item.count, 0)

  return (
    <Card className="border-slate-200 shadow-sm" data-testid="materials-category-pie-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">分类饼图</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div
            className="h-32 w-32 shrink-0 rounded-full ring-1 ring-slate-200"
            data-testid="materials-category-pie"
            style={{ background: `conic-gradient(${buildCategoryPieGradient(categories)})` }}
          />
          <div className="min-w-0 flex-1 space-y-2">
            {categories.map((item) => (
              <div key={item.category} className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-2 text-slate-600">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: MATERIAL_CATEGORY_COLORS[item.category] ?? MATERIAL_CATEGORY_COLORS.其他 }}
                  />
                  {item.category}
                </span>
                <span className="font-medium tabular-nums text-slate-900">
                  {item.count} · {item.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">共 {total} 条材料纳入分类统计</div>
      </CardContent>
    </Card>
  )
}

function RecentArrivalsList({ materials }: { materials: ProjectMaterialRecord[] }) {
  return (
    <Card className="border-slate-200 shadow-sm" data-testid="materials-recent-arrivals">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">近期到场</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {materials.length > 0 ? (
          materials.map((material) => (
            <div key={material.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate text-sm font-medium text-slate-900">{material.material_name}</div>
                <div className="text-xs tabular-nums text-slate-500">{material.expected_arrival_date}</div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span className="truncate">{material.participant_unit_name || '无归属单位'}</span>
                <span>{getMaterialStatusLabel(getMaterialPrimaryStatus(material))}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            暂无近期到场材料
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function normalizeConfidenceLevel(value?: number | string | null) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized) return normalized
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const score = value > 1 ? value / 100 : value
    if (score >= 0.75) return 'high'
    if (score >= 0.45) return 'medium'
    return 'low'
  }

  return 'low'
}

function getConfidenceTone(level?: number | string | null) {
  switch (normalizeConfidenceLevel(level)) {
    case 'high':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'medium':
      return 'bg-amber-50 text-amber-700 ring-amber-200'
    default:
      return 'bg-rose-50 text-rose-700 ring-rose-200'
  }
}

function formatConfidenceLabel(level?: number | string | null) {
  switch (normalizeConfidenceLevel(level)) {
    case 'high':
      return '高'
    case 'medium':
      return '中'
    default:
      return '低'
  }
}

function formatDelayRiskLabel(risk?: string | null) {
  switch (String(risk ?? '').trim().toLowerCase()) {
    case 'high':
      return '高风险'
    case 'medium':
      return '中风险'
    default:
      return '低风险'
  }
}

function formatChangeFieldLabel(fieldName?: string | null) {
  switch (String(fieldName ?? '').trim()) {
    case 'material_name':
      return '材料名称'
    case 'participant_unit_id':
      return '参建单位'
    case 'specialty_type':
      return '专项类型'
    case 'requires_sample_confirmation':
      return '需要定样'
    case 'sample_confirmed':
      return '定样完成'
    case 'expected_arrival_date':
      return '预计到场日期'
    case 'actual_arrival_date':
      return '实际到场日期'
    case 'requires_inspection':
      return '需要送检'
    case 'inspection_done':
      return '送检完成'
    case 'lifecycle':
      return '生命周期'
    default:
      return String(fieldName ?? '').trim() || '字段变更'
  }
}

function formatChangeValue(value?: string | null) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return '空'
  if (normalized === 'true') return '是'
  if (normalized === 'false') return '否'
  return normalized
}

function shiftDate(value?: string | null, deltaDays = 0) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  date.setDate(date.getDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

function groupMaterialsByUnit(materials: ProjectMaterialRecord[]): MaterialGroup[] {
  const grouped = new Map<string, { participantUnitId: string | null; participantUnitName: string; specialtyTypes: Set<string>; materials: ProjectMaterialRecord[] }>()

  for (const material of materials) {
    const key = material.participant_unit_id ?? '__unassigned__'
    const current = grouped.get(key) ?? {
      participantUnitId: material.participant_unit_id ?? null,
      participantUnitName: material.participant_unit_name || '无归属单位',
      specialtyTypes: new Set<string>(),
      materials: [],
    }

    if (material.specialty_type) current.specialtyTypes.add(material.specialty_type)
    current.materials.push(material)
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .map((group) => ({
      participantUnitId: group.participantUnitId,
      participantUnitName: group.participantUnitName,
      specialtyTypes: [...group.specialtyTypes].sort((left, right) => left.localeCompare(right, 'zh-CN')),
      materials: [...group.materials].sort((left, right) => left.expected_arrival_date.localeCompare(right.expected_arrival_date)),
    }))
    .sort((left, right) => {
      if (left.participantUnitId === null && right.participantUnitId !== null) return 1
      if (left.participantUnitId !== null && right.participantUnitId === null) return -1
      return left.participantUnitName.localeCompare(right.participantUnitName, 'zh-CN')
    })
}

function MaterialDetailDialog({
  open,
  material,
  form,
  units,
  readOnly,
  saving,
  aiLoading,
  aiDurationEstimate,
  delayRiskInsight,
  aiPlan,
  changeLogs,
  changeLogLoading,
  onOpenChange,
  onChange,
  onSubmit,
  onLoadAiInsight,
  onApplyAiSuggestion,
  onRefreshChangeLogs,
}: {
  open: boolean
  material: ProjectMaterialRecord | null
  form: MaterialFormState
  units: ParticipantUnitSummary[]
  readOnly: boolean
  saving: boolean
  aiLoading: boolean
  aiDurationEstimate: MaterialTaskDurationEstimate | null
  delayRiskInsight: MaterialTaskDelayRisk | null
  aiPlan: MaterialAiPlan | null
  changeLogs: MaterialChangeLogRecord[]
  changeLogLoading: boolean
  onOpenChange: (open: boolean) => void
  onChange: (patch: Partial<MaterialFormState>) => void
  onSubmit: () => void
  onLoadAiInsight: () => void
  onApplyAiSuggestion: () => void
  onRefreshChangeLogs: () => void
}) {
  const previewMaterial = {
    expected_arrival_date: form.expected_arrival_date,
    actual_arrival_date: form.actual_arrival_date || null,
    requires_sample_confirmation: form.requires_sample_confirmation,
    sample_confirmed: form.requires_sample_confirmation ? form.sample_confirmed : false,
    requires_inspection: form.requires_inspection,
    inspection_done: form.requires_inspection ? form.inspection_done : false,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] border-slate-200" data-testid="material-detail-dialog">
        <DialogHeader>
          <DialogTitle>{readOnly ? '材料详情' : '编辑材料详情'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-600">
            <span>材料名称</span>
            <input
              data-testid="material-detail-name-input"
              value={form.material_name}
              onChange={(event) => onChange({ material_name: event.target.value })}
              disabled={readOnly}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>专项类型</span>
            <input
              data-testid="material-detail-specialty-input"
              value={form.specialty_type}
              onChange={(event) => onChange({ specialty_type: event.target.value })}
              disabled={readOnly}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>参建单位</span>
            <ParticipantUnitSelect
              dataTestId="material-detail-unit-select"
              value={form.participant_unit_id}
              onChange={(value) => onChange({ participant_unit_id: value })}
              disabled={readOnly}
              units={units}
              triggerClassName="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900 disabled:bg-slate-50"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>预计到场日期</span>
            <input
              data-testid="material-detail-expected-date-input"
              type="date"
              value={form.expected_arrival_date}
              onChange={(event) => onChange({ expected_arrival_date: event.target.value })}
              disabled={readOnly}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
            />
          </label>
          <label className="space-y-1 text-sm text-slate-600">
            <span>实际到场日期</span>
            <input
              data-testid="material-detail-actual-date-input"
              type="date"
              value={form.actual_arrival_date}
              onChange={(event) => onChange({ actual_arrival_date: event.target.value })}
              disabled={readOnly}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
            />
          </label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            当前状态：{material ? getMaterialStatusLabel(getMaterialPrimaryStatus(previewMaterial)) : '--'}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.requires_sample_confirmation}
              disabled={readOnly}
              onChange={(event) => onChange({
                requires_sample_confirmation: event.target.checked,
                sample_confirmed: event.target.checked ? form.sample_confirmed : false,
              })}
            />
            需要定样
          </label>
          {form.requires_sample_confirmation ? (
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                data-testid="material-detail-sample-confirmed-toggle"
                type="checkbox"
                checked={form.sample_confirmed}
                disabled={readOnly}
                onChange={(event) => onChange({ sample_confirmed: event.target.checked })}
              />
              定样已完成
            </label>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
              无需定样
            </div>
          )}
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.requires_inspection}
              disabled={readOnly}
              onChange={(event) => onChange({
                requires_inspection: event.target.checked,
                inspection_done: event.target.checked ? form.inspection_done : false,
              })}
            />
            需要送检
          </label>
          {form.requires_inspection ? (
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input
                data-testid="material-detail-inspection-done-toggle"
                type="checkbox"
                checked={form.inspection_done}
                disabled={readOnly}
                onChange={(event) => onChange({ inspection_done: event.target.checked })}
              />
              送检已完成
            </label>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500">
              无需送检
            </div>
          )}
        </div>

        {material && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-blue-900">AI 到货建议</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-blue-200 bg-white text-blue-700 hover:bg-blue-100"
                  onClick={onLoadAiInsight}
                  disabled={aiLoading || !material.linked_task_id}
                  data-testid="materials-ai-fetch"
                >
                  {aiLoading ? '分析中...' : '获取 AI 建议'}
                </Button>
              </div>

              {material.linked_task_id ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-700">
                    <div className="font-medium text-slate-900">
                      关联任务：{material.linked_task_title || '未命名任务'}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      计划开工 {material.linked_task_start_date || '--'} · 当前缓冲{' '}
                      {material.linked_task_buffer_days == null ? '--' : `${material.linked_task_buffer_days} 天`} · 任务状态{' '}
                      {material.linked_task_status || '--'}
                    </div>
                  </div>

                  {aiDurationEstimate ? (
                    <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          AI 工期估算：{aiDurationEstimate.estimated_duration} 天
                        </div>
                        <span className={`rounded-full px-2 py-1 text-xs ring-1 ${getConfidenceTone(aiDurationEstimate.confidence_level)}`}>
                          置信度 {formatConfidenceLabel(aiDurationEstimate.confidence_level)}
                          {typeof aiDurationEstimate.confidence_score === 'number'
                            ? ` · ${Math.round((aiDurationEstimate.confidence_score > 1 ? aiDurationEstimate.confidence_score / 100 : aiDurationEstimate.confidence_score) * 100)}%`
                            : ''}
                        </span>
                      </div>
                      {aiDurationEstimate.reasoning ? (
                        <div className="mt-2 text-xs leading-5 text-slate-500">{aiDurationEstimate.reasoning}</div>
                      ) : null}
                    </div>
                  ) : (
                    !aiLoading && (
                      <div className="rounded-2xl border border-dashed border-blue-200 bg-white/70 px-4 py-3" />
                    )
                  )}

                  {delayRiskInsight ? (
                    <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">AI 排程：{formatDelayRiskLabel(delayRiskInsight.delay_risk)}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          延期概率 {Math.round(delayRiskInsight.delay_probability)}%
                        </span>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        风险因素：{delayRiskInsight.risk_factors.length > 0 ? delayRiskInsight.risk_factors.join('、') : '暂无额外风险因素'}
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        {delayRiskInsight.recommendations.slice(0, 3).map((item, index) => (
                          <div key={`${item}-${index}`}>• {item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {aiPlan?.suggestedExpectedArrivalDate ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      <div className="font-medium">
                        建议预计到场日：{aiPlan.suggestedExpectedArrivalDate}
                      </div>
                      <div className="mt-1 text-xs text-emerald-700">
                        建议至少提前 {aiPlan.recommendedBufferDays} 天完成到货准备。
                        {aiPlan.currentBufferDays == null ? '' : ` 当前缓冲为 ${aiPlan.currentBufferDays} 天。`}
                      </div>
                      {!readOnly && (
                        <Button
                          type="button"
                          size="sm"
                          className="mt-3"
                          onClick={onApplyAiSuggestion}
                          disabled={saving}
                          data-testid="materials-ai-adopt"
                        >
                          采纳建议到场日
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-white/70 px-4 py-3" />
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">变更日志</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRefreshChangeLogs}
                  disabled={changeLogLoading}
                  data-testid="materials-change-log-refresh"
                >
                  {changeLogLoading ? '刷新中...' : '刷新日志'}
                </Button>
              </div>
              <div className="mt-4 space-y-2" data-testid="materials-change-log-list">
                {changeLogs.length > 0 ? (
                  changeLogs.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-700">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="font-medium text-slate-900">{formatChangeFieldLabel(entry.field_name)}</div>
                        <div className="text-xs text-slate-500">{formatDateTimeLabel(entry.changed_at)}</div>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {formatChangeValue(entry.old_value)} → {formatChangeValue(entry.new_value)}
                        {entry.change_reason ? ` · ${entry.change_reason}` : ''}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                    {changeLogLoading ? '加载中...' : '暂无记录'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="material-detail-cancel">
            {readOnly ? '关闭' : '取消'}
          </Button>
          {!readOnly && (
            <Button onClick={onSubmit} disabled={saving} data-testid="material-detail-save">
              保存详情
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Materials() {
  useEffect(() => {
    document.title = '材料管理 | WorkBuddy'
  }, [])

  const { id: projectId = '' } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentProject = useCurrentProject()
  const { canEdit, globalRole } = usePermissions({
    projectId,
  })

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [materials, setMaterials] = useState<ProjectMaterialRecord[]>([])
  const [participantUnits, setParticipantUnits] = useState<ParticipantUnitSummary[]>([])
  const [materialSummary, setMaterialSummary] = useState<MaterialReportSummary | null>(null)
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>('all')
  const [searchKeyword, setSearchKeyword] = useState(searchParams.get('q') || '')
  const [unitFilter, setUnitFilter] = useState(searchParams.get('unit') || 'all')
  const [specialtyFilter, setSpecialtyFilter] = useState(searchParams.get('specialty') || 'all')
  const [reminders, setReminders] = useState<MaterialReminderRecord[]>([])
  const [latestDigest, setLatestDigest] = useState<ProjectWeeklyDigestSnapshot | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiDurationEstimate, setAiDurationEstimate] = useState<MaterialTaskDurationEstimate | null>(null)
  const [delayRiskInsight, setDelayRiskInsight] = useState<MaterialTaskDelayRisk | null>(null)
  const [changeLogs, setChangeLogs] = useState<MaterialChangeLogRecord[]>([])
  const [changeLogLoading, setChangeLogLoading] = useState(false)
  const [pendingDeleteMaterial, setPendingDeleteMaterial] = useState<ProjectMaterialRecord | null>(null)

  const [createMode, setCreateMode] = useState<CreateMode>('single')
  const [singleForm, setSingleForm] = useState<MaterialFormState>(EMPTY_FORM)
  const [templateSpecialty, setTemplateSpecialty] = useState(MATERIAL_TEMPLATE_GROUPS[0]?.specialtyType ?? '')
  const [templateUnitId, setTemplateUnitId] = useState('')
  const [templateArrivalDate, setTemplateArrivalDate] = useState('')
  const [selectedTemplateItems, setSelectedTemplateItems] = useState<string[]>([])
  const [batchRows, setBatchRows] = useState<BatchDraftRow[]>([createBatchRow()])

  const [detailMaterialId, setDetailMaterialId] = useState<string | null>(null)
  const [detailForm, setDetailForm] = useState<MaterialFormState>(EMPTY_FORM)

  const isReadOnly = !canEdit
  const readOnlyActionReason = isReadOnly ? '只读成员无材料维护权限。' : null
  const canReadAllMaterials = globalRole === 'company_admin'

  const loadPage = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!projectId) return

    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const [nextMaterials, nextUnits] = await Promise.all([
        MaterialsApiService.list(projectId, { signal }),
        MaterialsApiService.listParticipantUnits(projectId, { signal }),
      ])
      const nextSummary = await MaterialsApiService.getSummary(projectId, { signal }).catch(() => null)
      const [nextReminders, nextDigest] = await Promise.allSettled([
        MaterialsApiService.listReminders(projectId, { signal }),
        MaterialsApiService.getWeeklyDigest(projectId, { signal }),
      ])
      setMaterials(nextMaterials ?? [])
      setParticipantUnits(nextUnits ?? [])
      setMaterialSummary(nextSummary)
      setReminders(nextReminders.status === 'fulfilled' ? nextReminders.value ?? [] : [])
      setLatestDigest(nextDigest.status === 'fulfilled' ? nextDigest.value ?? null : null)
      setError(null)
    } catch (err) {
      if (isAbortError(err)) return
      setError(getApiErrorMessage(err, '材料清单加载失败，请稍后重试'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [projectId])

  useEffect(() => {
    const controller = new AbortController()
    void loadPage(controller.signal)
    return () => controller.abort()
  }, [loadPage])

  useEffect(() => {
    setSearchKeyword(searchParams.get('q') || '')
    setUnitFilter(searchParams.get('unit') || 'all')
    setSpecialtyFilter(searchParams.get('specialty') || 'all')
  }, [searchParams])

  const summary = useMemo(() => buildMaterialSummaryCounts(materials), [materials])
  const arrivedCount = useMemo(() => materials.filter((material) => Boolean(material.actual_arrival_date)).length, [materials])
  const arrivalRate = materials.length > 0 ? Math.round((arrivedCount / materials.length) * 100) : 0
  const requiredSampleCount = useMemo(() => materials.filter((material) => material.requires_sample_confirmation).length, [materials])
  const sampleConfirmedCount = useMemo(() => materials.filter((material) => material.requires_sample_confirmation && material.sample_confirmed).length, [materials])
  const requiredInspectionCount = useMemo(() => materials.filter((material) => material.requires_inspection).length, [materials])
  const inspectionDoneCount = useMemo(() => materials.filter((material) => material.requires_inspection && material.inspection_done).length, [materials])
  const weeklySummary = useMemo(() => {
    const overview = materialSummary?.overview ?? null
    const onTimeCount = overview?.onTimeCount ?? 0
    return {
      totalExpectedCount: overview?.totalExpectedCount ?? materials.length,
      onTimeCount,
      arrivalRate: overview?.arrivalRate ?? 0,
      arrivedThisWeek: summary.arrivedThisWeek,
      overdueArrival: summary.overdueArrival,
      pendingInspection: summary.pendingInspection,
    }
  }, [materialSummary, materials.length, summary.arrivedThisWeek, summary.overdueArrival, summary.pendingInspection])
  const specialtyOptions = useMemo(
    () => [...new Set(materials.map((item) => item.specialty_type).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    [materials],
  )
  const normalizedSearchKeyword = searchKeyword.trim().toLocaleLowerCase()
  const filteredMaterials = useMemo(
    () => materials.filter((material) => {
      if (normalizedSearchKeyword) {
        const searchTarget = [
          material.material_name,
          material.participant_unit_name ?? '',
          material.specialty_type ?? '',
          material.expected_arrival_date,
          material.actual_arrival_date ?? '',
        ].join(' ').toLocaleLowerCase()
        if (!searchTarget.includes(normalizedSearchKeyword)) return false
      }
      if (unitFilter !== 'all' && (material.participant_unit_id ?? '__unassigned__') !== unitFilter) return false
      if (specialtyFilter !== 'all' && (material.specialty_type ?? '__none__') !== specialtyFilter) return false
      return matchesMaterialStatusFilter(material, statusFilter)
    }),
    [materials, normalizedSearchKeyword, specialtyFilter, statusFilter, unitFilter],
  )
  const groupedMaterials = useMemo(() => groupMaterialsByUnit(filteredMaterials), [filteredMaterials])
  const materialCategories = useMemo<MaterialCategorySummary[]>(
    () => materialSummary?.byCategory ?? [
      { category: '钢材', count: 0, percentage: 0 },
      { category: '混凝土', count: 0, percentage: 0 },
      { category: '管材', count: 0, percentage: 0 },
      { category: '电气', count: 0, percentage: 0 },
      { category: '其他', count: 0, percentage: 0 },
    ],
    [materialSummary?.byCategory],
  )
  const recentArrivals = useMemo(
    () => [...filteredMaterials]
      .sort((left, right) => left.expected_arrival_date.localeCompare(right.expected_arrival_date))
      .slice(0, 5),
    [filteredMaterials],
  )
  const hasActiveMaterialFilters = Boolean(normalizedSearchKeyword)
    || statusFilter !== 'all'
    || unitFilter !== 'all'
    || specialtyFilter !== 'all'
  const selectedTemplateGroup = useMemo<MaterialTemplateGroup | null>(
    () => MATERIAL_TEMPLATE_GROUPS.find((group) => group.specialtyType === templateSpecialty) ?? null,
    [templateSpecialty],
  )
  const detailMaterial = useMemo(
    () => materials.find((material) => material.id === detailMaterialId) ?? null,
    [detailMaterialId, materials],
  )
  const detailAiPlan = useMemo<MaterialAiPlan | null>(() => {
    if (!detailMaterial?.linked_task_start_date) return null

    const riskBuffer =
      delayRiskInsight?.delay_risk === 'high'
        ? 2
        : delayRiskInsight?.delay_risk === 'medium'
          ? 1
          : 0
    const recommendedBufferDays =
      3
      + (detailMaterial.requires_sample_confirmation ? 2 : 0)
      + (detailMaterial.requires_inspection ? 2 : 0)
      + riskBuffer

    return {
      recommendedBufferDays,
      suggestedExpectedArrivalDate: shiftDate(detailMaterial.linked_task_start_date, -recommendedBufferDays),
      currentBufferDays: detailMaterial.linked_task_buffer_days ?? null,
    }
  }, [delayRiskInsight?.delay_risk, detailMaterial])

  const syncMaterial = useCallback((nextMaterial: ProjectMaterialRecord) => {
    setMaterials((current) =>
      current
        .map((material) => (material.id === nextMaterial.id ? { ...material, ...nextMaterial } : material))
        .sort((left, right) => left.expected_arrival_date.localeCompare(right.expected_arrival_date)),
    )
  }, [])

  const loadMaterialChangeLogs = useCallback(async (materialId: string) => {
    if (!projectId) return

    setChangeLogLoading(true)
    try {
      const nextLogs = await MaterialsApiService.listChangeLogs(projectId, materialId)
      setChangeLogs(nextLogs)
    } catch (err) {
      setChangeLogs([])
      toast({
        title: '变更日志加载失败',
        description: getApiErrorMessage(err, '请稍后重试'),
        variant: 'destructive',
      })
    } finally {
      setChangeLogLoading(false)
    }
  }, [projectId])

  const updateSearchFilter = useCallback((key: 'unit' | 'specialty' | 'q', value: string) => {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all') {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const clearMaterialFilters = useCallback(() => {
    setSearchKeyword('')
    setStatusFilter('all')
    setUnitFilter('all')
    setSpecialtyFilter('all')

    const next = new URLSearchParams(searchParams)
    next.delete('q')
    next.delete('unit')
    next.delete('specialty')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const handleInlineUpdate = useCallback(async (materialId: string, patch: MaterialMutationPayload) => {
    if (!projectId || isReadOnly) return

    try {
      const updated = await MaterialsApiService.update(projectId, materialId, patch)
      syncMaterial(updated)
    } catch (err) {
      toast({
        title: '保存失败',
        description: getApiErrorMessage(err, '材料更新失败，请稍后重试'),
        variant: 'destructive',
      })
    }
  }, [isReadOnly, projectId, syncMaterial])

  const openDetailDialog = useCallback((material: ProjectMaterialRecord) => {
    setDetailMaterialId(material.id)
    setDetailForm(toFormState(material))
    setAiDurationEstimate(null)
    setDelayRiskInsight(null)
    setChangeLogs([])
    void loadMaterialChangeLogs(material.id)
  }, [loadMaterialChangeLogs])

  const handleLoadAiInsight = useCallback(async () => {
    if (!projectId || !detailMaterial?.linked_task_id) {
      toast({
        title: '暂无关联任务',
        description: '当前材料尚未匹配到可分析的在施任务。',
        variant: 'destructive',
      })
      return
    }

    setAiLoading(true)
    try {
      const [estimateResult, riskResult] = await Promise.allSettled([
        MaterialsApiService.estimateLinkedTaskDuration(projectId, detailMaterial.linked_task_id),
        MaterialsApiService.analyzeLinkedTaskDelayRisk(detailMaterial.linked_task_id),
      ])

      const nextEstimate = estimateResult.status === 'fulfilled' ? estimateResult.value : null
      const nextRisk = riskResult.status === 'fulfilled' ? riskResult.value : null

      setAiDurationEstimate(nextEstimate)
      setDelayRiskInsight(nextRisk)

      if (!nextEstimate && !nextRisk) {
        throw new Error('当前材料关联任务暂无可用 AI 建议')
      }
    } catch (err) {
      setAiDurationEstimate(null)
      setDelayRiskInsight(null)
      toast({
        title: 'AI 建议获取失败',
        description: getApiErrorMessage(err, '请稍后重试'),
        variant: 'destructive',
      })
    } finally {
      setAiLoading(false)
    }
  }, [detailMaterial?.linked_task_id, projectId, detailMaterial])

  const handleApplyAiSuggestion = useCallback(async () => {
    if (!projectId || !detailMaterial || !detailAiPlan?.suggestedExpectedArrivalDate) return

    setSaving(true)
    try {
      const updated = await MaterialsApiService.update(projectId, detailMaterial.id, {
        expected_arrival_date: detailAiPlan.suggestedExpectedArrivalDate,
        change_reason: '采纳 AI 排程建议',
      })
      syncMaterial(updated)
      setDetailForm(toFormState(updated))
      await loadMaterialChangeLogs(detailMaterial.id)
      toast({
        title: '已采纳 AI 建议',
        description: `预计到场日已调整为 ${detailAiPlan.suggestedExpectedArrivalDate}。`,
      })
    } catch (err) {
      toast({
        title: '采纳建议失败',
        description: getApiErrorMessage(err, '请稍后重试'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [detailAiPlan?.suggestedExpectedArrivalDate, detailMaterial, loadMaterialChangeLogs, projectId, syncMaterial])

  const handleSaveDetail = useCallback(async () => {
    if (!projectId || !detailMaterial) return

    setSaving(true)
    try {
      const updated = await MaterialsApiService.update(projectId, detailMaterial.id, buildCreatePayload(detailForm))
      syncMaterial(updated)
      setDetailMaterialId(null)
      toast({ title: '材料详情已保存', description: '材料记录已更新。' })
    } catch (err) {
      toast({
        title: '保存失败',
        description: getApiErrorMessage(err, '材料详情保存失败，请稍后重试'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [detailForm, detailMaterial, projectId, syncMaterial])

  const handleCreateSingle = useCallback(async () => {
    if (!projectId) return

    setSaving(true)
    try {
      const created = await MaterialsApiService.create(projectId, buildCreatePayload(singleForm))
      if (created && !Array.isArray(created)) {
        setMaterials((current) => [...current, created].sort((left, right) => left.expected_arrival_date.localeCompare(right.expected_arrival_date)))
      }
      setSingleForm(EMPTY_FORM)
      toast({ title: '已新增材料', description: '材料清单已更新。' })
    } catch (err) {
      toast({
        title: '新增失败',
        description: getApiErrorMessage(err, '材料新增失败，请稍后重试'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [projectId, singleForm])

  const handleCreateFromTemplate = useCallback(async () => {
    if (!projectId || !selectedTemplateGroup) return
    const selectedItems = selectedTemplateGroup.items.filter((item) => selectedTemplateItems.includes(item.name))
    if (selectedItems.length === 0) {
      toast({
        title: '请选择材料模板',
        description: '至少勾选一项常用材料后再创建。',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const payload = selectedItems.map<MaterialMutationPayload>((item) => ({
        participant_unit_id: templateUnitId || null,
        material_name: item.name,
        specialty_type: selectedTemplateGroup.specialtyType,
        expected_arrival_date: templateArrivalDate,
        requires_sample_confirmation: Boolean(item.requiresSampleConfirmation),
        requires_inspection: Boolean(item.requiresInspection),
      }))
      const created = await MaterialsApiService.create(projectId, payload)
      setMaterials((current) => [...current, ...(Array.isArray(created) ? created : [created])].sort((left, right) => left.expected_arrival_date.localeCompare(right.expected_arrival_date)))
      setSelectedTemplateItems([])
      setTemplateArrivalDate('')
      toast({ title: '模板材料已创建', description: `已一次性加入 ${selectedItems.length} 条常用材料。` })
    } catch (err) {
      toast({
        title: '模板创建失败',
        description: getApiErrorMessage(err, '模板材料创建失败，请稍后重试'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [projectId, selectedTemplateGroup, selectedTemplateItems, templateArrivalDate, templateUnitId])

  const handleCreateBatch = useCallback(async () => {
    if (!projectId) return
    const payload = batchRows
      .filter((row) => row.material_name.trim() && row.expected_arrival_date.trim())
      .map<MaterialMutationPayload>((row) => ({
        participant_unit_id: row.participant_unit_id || null,
        material_name: row.material_name.trim(),
        specialty_type: row.specialty_type.trim() || null,
        expected_arrival_date: row.expected_arrival_date,
        requires_sample_confirmation: row.requires_sample_confirmation,
        requires_inspection: row.requires_inspection,
      }))

    if (payload.length === 0) {
      toast({
        title: '没有可提交的材料',
        description: '请至少填写一行材料名称和预计到场日期。',
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const created = await MaterialsApiService.create(projectId, payload)
      setMaterials((current) => [...current, ...(Array.isArray(created) ? created : [created])].sort((left, right) => left.expected_arrival_date.localeCompare(right.expected_arrival_date)))
      setBatchRows([createBatchRow()])
      toast({ title: '批量录入完成', description: `已新增 ${payload.length} 条材料记录。` })
    } catch (err) {
      toast({
        title: '批量录入失败',
        description: getApiErrorMessage(err, '请稍后重试'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }, [batchRows, projectId])

  const handleDeleteMaterial = useCallback(async (materialId: string) => {
    if (!projectId || isReadOnly) return

    try {
      await MaterialsApiService.remove(projectId, materialId)
      setMaterials((current) => current.filter((material) => material.id !== materialId))
      if (detailMaterialId === materialId) {
        setDetailMaterialId(null)
      }
      toast({ title: '材料已删除', description: '清单已同步更新。' })
    } catch (err) {
      toast({
        title: '删除失败',
        description: getApiErrorMessage(err, '材料删除失败，请稍后重试'),
        variant: 'destructive',
      })
    }
  }, [detailMaterialId, isReadOnly, projectId])

  const handleConfirmDeleteMaterial = useCallback(() => {
    if (!pendingDeleteMaterial) return
    const materialId = pendingDeleteMaterial.id
    setPendingDeleteMaterial(null)
    void handleDeleteMaterial(materialId)
  }, [handleDeleteMaterial, pendingDeleteMaterial])

  if (loading) {
    return (
      <LoadingState
        className="mx-auto mt-12 max-w-sm"
        label="材料清单加载中"
      />
    )
  }

  if (error) {
    return (
      <div className="page-shell">
        <EmptyState
          variant="error"
          title={canReadAllMaterials ? '材料清单暂时不可用' : '暂时无法进入材料管控'}
          description={error}
          onRetry={() => void loadPage(undefined, true)}
        />
      </div>
    )
  }

  return (
    <div className="page-shell" data-testid="materials-page">
      <Breadcrumb
        items={[
          { label: currentProject?.name || '项目', href: `/projects/${projectId}/dashboard` },
          { label: PROJECT_NAVIGATION_LABELS.materials },
        ]}
      />

      <PageHeader
        eyebrow="专项管理"
        title={PROJECT_NAVIGATION_LABELS.materials}
        subtitle="跟踪专项工程材料到场状态，关联分包责任主体。"
      >
        <DisabledReasonTooltip reason={readOnlyActionReason}>
          <Button onClick={() => void handleCreateSingle()} disabled={isReadOnly || saving}>
            <Plus className="mr-2 h-4 w-4" />
            新增材料
          </Button>
        </DisabledReasonTooltip>
        <Button variant="outline" onClick={() => void loadPage(undefined, true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MaterialMetricCard
          label="到场率"
          value={`${arrivalRate}%`}
          trend={`已到场 ${arrivedCount}/${materials.length || 0}`}
          icon={PackageCheck}
        />
        <MaterialMetricCard
          label="定样推进"
          value={`${sampleConfirmedCount}/${requiredSampleCount}`}
          trend={`待定样 ${summary.pendingSample} 项`}
          icon={ClipboardList}
        />
        <MaterialMetricCard
          label="验收情况"
          value={`${inspectionDoneCount}/${requiredInspectionCount}`}
          trend={`待送检 ${summary.pendingInspection} · 不合格 0`}
          icon={Boxes}
        />
        <MaterialMetricCard
          label="风险提醒"
          value={summary.overdueArrival}
          trend={`待到场 ${summary.pendingArrival} · 本周到场 ${summary.arrivedThisWeek}`}
          icon={Wrench}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm" data-testid="materials-toolbar-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-slate-900">材料列表工具栏</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1 text-sm text-slate-600">
              <span>搜索</span>
              <input
                data-testid="materials-search-input"
                value={searchKeyword}
                onChange={(event) => {
                  setSearchKeyword(event.target.value)
                  updateSearchFilter('q', event.target.value)
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                placeholder="按材料、单位、专项或日期搜索"
              />
            </label>
            <label className="space-y-1 text-sm text-slate-600">
              <span>状态筛选</span>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as MaterialStatusFilter)}
              >
                <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm text-slate-600">
              <span>参建单位</span>
              <Select
                value={unitFilter}
                onValueChange={(value) => updateSearchFilter('unit', value)}
              >
                <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部单位</SelectItem>
                  {participantUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unit.unit_name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__unassigned__">无归属单位</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm text-slate-600">
              <span>专项类型</span>
              <Select
                value={specialtyFilter}
                onValueChange={(value) => updateSearchFilter('specialty', value)}
              >
                <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部专项</SelectItem>
                  {specialtyOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          {!isReadOnly && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'single' as const, label: '单条新增' },
                  { key: 'template' as const, label: '模板预填' },
                  { key: 'batch' as const, label: '批量录入' },
                ].map((item) => (
                  <Button
                    key={item.key}
                    data-testid={`materials-create-mode-${item.key}`}
                    variant={createMode === item.key ? 'default' : 'outline'}
                    onClick={() => setCreateMode(item.key)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              {createMode === 'single' && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label className="space-y-1 text-sm text-slate-600">
                    <span>材料名称</span>
                    <input
                      data-testid="materials-create-single-name"
                      value={singleForm.material_name}
                      onChange={(event) => setSingleForm((current) => ({ ...current, material_name: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder="如：铝型材"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-slate-600">
                    <span>专项类型</span>
                    <input
                      data-testid="materials-create-single-specialty"
                      value={singleForm.specialty_type}
                      onChange={(event) => setSingleForm((current) => ({ ...current, specialty_type: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      placeholder="如：幕墙"
                    />
                  </label>
                  <label className="space-y-1 text-sm text-slate-600">
                    <span>参建单位</span>
                    <ParticipantUnitSelect
                      dataTestId="materials-create-single-unit"
                      value={singleForm.participant_unit_id}
                      onChange={(value) => setSingleForm((current) => ({ ...current, participant_unit_id: value }))}
                      units={participantUnits}
                    />
                  </label>
                  <label className="space-y-1 text-sm text-slate-600">
                    <span>预计到场日期</span>
                    <input
                      data-testid="materials-create-single-expected-date"
                      type="date"
                      value={singleForm.expected_arrival_date}
                      onChange={(event) => setSingleForm((current) => ({ ...current, expected_arrival_date: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      data-testid="materials-create-single-requires-sample"
                      type="checkbox"
                      checked={singleForm.requires_sample_confirmation}
                      onChange={(event) => setSingleForm((current) => ({ ...current, requires_sample_confirmation: event.target.checked }))}
                    />
                    需要定样
                  </label>
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      data-testid="materials-create-single-requires-inspection"
                      type="checkbox"
                      checked={singleForm.requires_inspection}
                      onChange={(event) => setSingleForm((current) => ({ ...current, requires_inspection: event.target.checked }))}
                    />
                    需要送检
                  </label>
                  <div className="md:col-span-2 xl:col-span-3">
                    <Button onClick={() => void handleCreateSingle()} disabled={saving} data-testid="materials-create-single-submit">
                      <Plus className="mr-2 h-4 w-4" />
                      新增材料
                    </Button>
                  </div>
                </div>
              )}

              {createMode === 'template' && selectedTemplateGroup && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1 text-sm text-slate-600">
                      <span>专项模板</span>
                      <Select
                        value={templateSpecialty}
                        onValueChange={(value) => {
                          setTemplateSpecialty(value)
                          setSelectedTemplateItems([])
                        }}
                      >
                        <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-900" data-testid="materials-template-specialty">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MATERIAL_TEMPLATE_GROUPS.map((group) => (
                            <SelectItem key={group.specialtyType} value={group.specialtyType}>
                              {group.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="space-y-1 text-sm text-slate-600">
                      <span>参建单位</span>
                      <ParticipantUnitSelect
                        dataTestId="materials-template-unit"
                        value={templateUnitId}
                        onChange={setTemplateUnitId}
                        units={participantUnits}
                      />
                    </label>
                    <label className="space-y-1 text-sm text-slate-600">
                      <span>统一预计到场日期</span>
                      <input
                        data-testid="materials-template-arrival-date"
                        type="date"
                        value={templateArrivalDate}
                        onChange={(event) => setTemplateArrivalDate(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {selectedTemplateGroup.items.map((item) => {
                      const checked = selectedTemplateItems.includes(item.name)
                      return (
                        <label
                          key={item.name}
                          className={`rounded-2xl border px-4 py-3 text-sm ${
                            checked ? 'border-blue-300 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              data-testid={`materials-template-item-${selectedTemplateGroup.specialtyType}-${item.name}`}
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setSelectedTemplateItems((current) =>
                                  event.target.checked
                                    ? [...current, item.name]
                                    : current.filter((value) => value !== item.name),
                                )
                              }
                            />
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                {item.requiresSampleConfirmation ? '含定样' : '无需定样'} · {item.requiresInspection ? '含送检' : '无需送检'}
                              </div>
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  <Button onClick={() => void handleCreateFromTemplate()} disabled={saving} data-testid="materials-template-submit">
                    <ClipboardList className="mr-2 h-4 w-4" />
                    用模板批量创建
                  </Button>
                </div>
              )}

              {createMode === 'batch' && (
                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <Table className="min-w-full text-sm">
                      <TableHeader className="sticky top-0 z-10 bg-white text-left text-slate-500">
                        <TableRow className="py-3">
                          <TableHead className="px-3 py-2 font-medium">材料名称</TableHead>
                          <TableHead className="px-3 py-2 font-medium">专项</TableHead>
                          <TableHead className="px-3 py-2 font-medium">参建单位</TableHead>
                          <TableHead className="px-3 py-2 text-right font-medium tabular-nums">预计到场</TableHead>
                          <TableHead className="px-3 py-2 font-medium">定样</TableHead>
                          <TableHead className="px-3 py-2 font-medium">送检</TableHead>
                          <TableHead className="px-3 py-2 font-medium">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {batchRows.map((row) => (
                          <TableRow
                            key={row.id}
                            className="group py-3 even:bg-slate-50/50 hover:bg-slate-100/60"
                            data-testid={`materials-batch-row-${row.id}`}
                          >
                            <TableCell className="px-3 py-2 text-right tabular-nums">
                              <input
                                aria-label="材料名称"
                                data-testid={`materials-batch-name-${row.id}`}
                                value={row.material_name}
                                onChange={(event) =>
                                  setBatchRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, material_name: event.target.value } : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-right tabular-nums"
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <input
                                aria-label="专业"
                                data-testid={`materials-batch-specialty-${row.id}`}
                                value={row.specialty_type}
                                onChange={(event) =>
                                  setBatchRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, specialty_type: event.target.value } : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5"
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <ParticipantUnitSelect
                                dataTestId={`materials-batch-unit-${row.id}`}
                                value={row.participant_unit_id}
                                onChange={(value) =>
                                  setBatchRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, participant_unit_id: value } : item,
                                    ),
                                  )
                                }
                                units={participantUnits}
                                triggerClassName="h-9 rounded-lg border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <input
                                aria-label="进场日期"
                                data-testid={`materials-batch-date-${row.id}`}
                                type="date"
                                value={row.expected_arrival_date}
                                onChange={(event) =>
                                  setBatchRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, expected_arrival_date: event.target.value } : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5"
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2 text-center">
                              <input
                                aria-label="取样确认"
                                data-testid={`materials-batch-sample-${row.id}`}
                                type="checkbox"
                                checked={row.requires_sample_confirmation}
                                onChange={(event) =>
                                  setBatchRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, requires_sample_confirmation: event.target.checked } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2 text-center">
                              <input
                                aria-label="送检确认"
                                data-testid={`materials-batch-inspection-${row.id}`}
                                type="checkbox"
                                checked={row.requires_inspection}
                                onChange={(event) =>
                                  setBatchRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, requires_inspection: event.target.checked } : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell className="px-3 py-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`materials-batch-delete-${row.id}`}
                                className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                                onClick={() =>
                                  setBatchRows((current) => (current.length === 1 ? current : current.filter((item) => item.id !== row.id)))
                                }
                              >
                                删除
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setBatchRows((current) => [...current, createBatchRow()])}
                      data-testid="materials-batch-add-row"
                    >
                      新增一行
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setBatchRows([createBatchRow()])}
                      data-testid="materials-batch-clear"
                    >
                      清空草稿
                    </Button>
                    <Button onClick={() => void handleCreateBatch()} disabled={saving} data-testid="materials-batch-submit">
                      提交批量录入
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

          {groupedMaterials.length === 0 ? (
            <EmptyState
              variant={hasActiveMaterialFilters ? 'filter' : 'default'}
              icon={Boxes}
              title={hasActiveMaterialFilters ? '当前没有符合筛选条件的材料' : '暂无材料记录'}
              description={hasActiveMaterialFilters ? '尝试调整筛选条件' : '添加材料后可跟踪到场、验收和联动任务。'}
              onClearFilter={clearMaterialFilters}
            />
          ) : (
            <div className="space-y-4">
              {groupedMaterials.map((group) => (
                <Card key={group.participantUnitId ?? '__unassigned__'} className="border-slate-200 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-base text-slate-900">{group.participantUnitName}</CardTitle>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                          <span>{group.materials.length} 条材料</span>
                          {group.specialtyTypes.map((type) => (
                            <span key={type} className="rounded-full bg-slate-100 px-2 py-1">
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {group.participantUnitId === null && (
                      <div
                        className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                        data-testid="materials-unassigned-banner"
                      >
                        以下材料所属分包商已删除，请重新关联
                      </div>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <Table className="min-w-[980px] w-full text-left text-sm" data-testid="materials-table">
                        <TableHeader className="sticky top-0 z-10 bg-white text-xs text-slate-500">
                          <TableRow className="py-3">
                            <TableHead className="px-3 py-2 font-medium">材料名</TableHead>
                            <TableHead className="px-3 py-2 font-medium">定样</TableHead>
                            <TableHead className="px-3 py-2 text-right font-medium tabular-nums">预计到场</TableHead>
                            <TableHead className="px-3 py-2 text-right font-medium tabular-nums">实际到场</TableHead>
                            <TableHead className="px-3 py-2 font-medium">送检</TableHead>
                            <TableHead className="px-3 py-2 font-medium">状态</TableHead>
                            <TableHead className="px-3 py-2 text-right font-medium">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.materials.map((material) => (
                            <TableRow
                              key={material.id}
                              className="group py-3 even:bg-slate-50/50 hover:bg-slate-100/60"
                              data-testid={`materials-table-row-${material.id}`}
                            >
                              <TableCell className="px-3 py-3 align-top">
                                <div className="font-medium text-slate-900">{material.material_name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  {material.specialty_type ? <span>{material.specialty_type}</span> : null}
                                  {isMaterialArrivedThisWeek(material) ? (
                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 ring-1 ring-blue-200">
                                      本周到场
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-2 max-w-[320px] text-xs leading-5 text-slate-500" data-testid={`material-linked-task-${material.id}`}>
                                  {material.linked_task_id ? (
                                    <>
                                      关联任务：{material.linked_task_title || '未命名任务'} · 计划开工 {material.linked_task_start_date || '--'} · 到货缓冲{' '}
                                      {material.linked_task_buffer_days == null ? '--' : `${material.linked_task_buffer_days} 天`}
                                    </>
                                  ) : (
                                    '当前未匹配到在施任务，暂按材料真值独立跟踪'
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                {material.requires_sample_confirmation ? (
                                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                      data-testid={`material-inline-sample-confirmed-${material.id}`}
                                      type="checkbox"
                                      checked={material.sample_confirmed}
                                      disabled={isReadOnly}
                                      onChange={(event) => void handleInlineUpdate(material.id, { sample_confirmed: event.target.checked })}
                                    />
                                    已定样
                                  </label>
                                ) : (
                                  <span
                                    data-testid={`material-inline-sample-placeholder-${material.id}`}
                                    className="text-sm text-slate-500"
                                  >
                                    无需定样
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="px-3 py-3 text-right align-top tabular-nums text-slate-700">
                                {material.expected_arrival_date}
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <input
                                  data-testid={`material-inline-actual-arrival-${material.id}`}
                                  type="date"
                                  aria-label={`填写${material.material_name}实际到场日期`}
                                  value={material.actual_arrival_date ?? ''}
                                  onChange={(event) => void handleInlineUpdate(material.id, { actual_arrival_date: event.target.value || null })}
                                  disabled={isReadOnly}
                                  className="w-full min-w-[140px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums text-slate-900 disabled:bg-slate-50"
                                />
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                {material.requires_inspection ? (
                                  <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                      data-testid={`material-inline-inspection-done-${material.id}`}
                                      type="checkbox"
                                      checked={material.inspection_done}
                                      disabled={isReadOnly}
                                      onChange={(event) => void handleInlineUpdate(material.id, { inspection_done: event.target.checked })}
                                    />
                                    已送检
                                  </label>
                                ) : (
                                  <span
                                    data-testid={`material-inline-inspection-placeholder-${material.id}`}
                                    className="text-sm text-slate-500"
                                  >
                                    无需送检
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <MaterialStatusPill material={material} />
                              </TableCell>
                              <TableCell className="px-3 py-3 align-top">
                                <div className="flex justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openDetailDialog(material)}
                                    data-testid={`material-detail-trigger-${material.id}`}
                                  >
                                    <PencilLine className="mr-1 h-4 w-4" />
                                    {isReadOnly ? '查看' : '编辑'}
                                  </Button>
                                  <DisabledReasonTooltip reason={readOnlyActionReason}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setPendingDeleteMaterial(material)}
                                      data-testid={`material-delete-trigger-${material.id}`}
                                      disabled={isReadOnly}
                                    >
                                      <Trash2 className="mr-1 h-4 w-4" />
                                      删除
                                    </Button>
                                  </DisabledReasonTooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4" data-testid="materials-side-panel">
          <Card className="border-slate-200 shadow-sm" data-testid="materials-quick-stats">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-900">快速统计</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <MiniMetric label="待定样" value={summary.pendingSample} tone="amber" />
              <MiniMetric label="逾期未到" value={summary.overdueArrival} tone="red" />
              <MiniMetric label="待送检" value={summary.pendingInspection} tone="sky" />
            </CardContent>
          </Card>

          <MaterialCategoryPie categories={materialCategories} />
          <RecentArrivalsList materials={recentArrivals} />

          <Card className="border-slate-200 shadow-sm" data-testid="materials-weekly-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-900">周报摘要</CardTitle>
              <div className="mt-1 text-sm text-slate-500">
                周窗口 {formatWeekLabel(latestDigest?.week_start)} · 最近生成 {formatDateTimeLabel(latestDigest?.generated_at)}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label="应到总数" value={weeklySummary.totalExpectedCount} />
                <MiniMetric label="准时到场" value={weeklySummary.onTimeCount} />
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                准时到场率 {weeklySummary.arrivalRate}%
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm" data-testid="materials-reminder-feed">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base text-slate-900">提醒列表</CardTitle>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/notifications?scope=current-project&projectId=${encodeURIComponent(projectId)}`}>全部</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {reminders.length > 0 ? (
                reminders.slice(0, 3).map((reminder) => (
                  <div
                    key={reminder.id}
                    data-testid={`materials-reminder-item-${reminder.id}`}
                    className={`rounded-lg border px-3 py-3 ${getReminderTone(reminder)}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-sm font-medium">{reminder.title}</div>
                      <div className="shrink-0 text-xs opacity-80">{formatDateTimeLabel(reminder.created_at)}</div>
                    </div>
                    <div className="mt-2 text-sm leading-6 opacity-90">{reminder.content || '系统已生成材料提醒。'}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  暂无材料提醒
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </section>

      <MaterialDetailDialog
        open={Boolean(detailMaterial)}
        material={detailMaterial}
        form={detailForm}
        units={participantUnits}
        readOnly={isReadOnly}
        saving={saving}
        aiLoading={aiLoading}
        aiDurationEstimate={aiDurationEstimate}
        delayRiskInsight={delayRiskInsight}
        aiPlan={detailAiPlan}
        changeLogs={changeLogs}
        changeLogLoading={changeLogLoading}
        onOpenChange={(open) => {
          if (!open) {
            setDetailMaterialId(null)
            setAiDurationEstimate(null)
            setDelayRiskInsight(null)
            setChangeLogs([])
          }
        }}
        onChange={(patch) => setDetailForm((current) => ({ ...current, ...patch }))}
        onSubmit={() => void handleSaveDetail()}
        onLoadAiInsight={() => void handleLoadAiInsight()}
        onApplyAiSuggestion={() => void handleApplyAiSuggestion()}
        onRefreshChangeLogs={() => void (detailMaterial ? loadMaterialChangeLogs(detailMaterial.id) : Promise.resolve())}
      />
      <ConfirmActionDialog
        open={Boolean(pendingDeleteMaterial)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteMaterial(null)
        }}
        title="删除材料"
        description={`确认删除“${pendingDeleteMaterial?.material_name ?? '该材料'}”？删除后将从材料清单移除，并写入变更日志。`}
        confirmLabel="删除"
        confirmTone="destructive"
        testId="materials-delete-confirm-dialog"
        onConfirm={handleConfirmDeleteMaterial}
      />
    </div>
  )
}
