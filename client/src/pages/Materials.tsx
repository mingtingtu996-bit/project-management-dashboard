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
import { EmptyState } from '@/components/EmptyState'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingState } from '@/components/ui/loading-state'
import { usePermissions } from '@/hooks/usePermissions'
import { toast } from '@/hooks/use-toast'
import { useCurrentProject } from '@/hooks/useStore'
import { getApiErrorMessage, isAbortError } from '@/lib/apiClient'
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
  type MaterialStatusFilter,
} from '@/lib/materialStatus'
import {
  MaterialsApiService,
  type MaterialChangeLogRecord,
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

function isMaterialOnTime(material: Pick<ProjectMaterialRecord, 'expected_arrival_date' | 'actual_arrival_date'>) {
  if (!material.actual_arrival_date) return false
  return material.actual_arrival_date <= material.expected_arrival_date
}

function formatDateTimeLabel(value?: string | null) {
  if (!value) return '未生成'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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
      <DialogContent className="max-w-2xl border-slate-200" data-testid="material-detail-dialog">
        <DialogHeader>
          <DialogTitle>{readOnly ? '材料详情' : '编辑材料详情'}</DialogTitle>
          <DialogDescription>
            统一维护材料名称、归属单位、预计到场、实际到场、定样与送检状态。
          </DialogDescription>
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
            <select
              data-testid="material-detail-unit-select"
              value={form.participant_unit_id}
              onChange={(event) => onChange({ participant_unit_id: event.target.value })}
              disabled={readOnly}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
            >
              <option value="">暂不关联</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.unit_name}
                </option>
              ))}
            </select>
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
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
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
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
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
                  <div className="mt-1 text-xs text-blue-700">
                    按关联参建单位的最早开工任务推导材料到货窗口，并复用既有 AI 工期/风险分析结果。
                  </div>
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
                      <div className="rounded-2xl border border-dashed border-blue-200 bg-white/70 px-4 py-3 text-xs text-blue-700">
                        点击“获取 AI 建议”后，会展示关联任务的 AI 工期估算。
                      </div>
                    )
                  )}

                  {delayRiskInsight ? (
                    <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">AI 排程建议：{formatDelayRiskLabel(delayRiskInsight.delay_risk)}</div>
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
                <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-white/70 px-4 py-3 text-sm text-blue-700">
                  当前没有可关联的在施任务，AI 建议暂不可用。
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">变更日志</div>
                  <div className="mt-1 text-xs text-slate-500">查看材料创建、编辑与 AI 建议采纳后的最近留痕。</div>
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
                        <div className="text-xs text-slate-400">{formatDateTimeLabel(entry.changed_at)}</div>
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {formatChangeValue(entry.old_value)} → {formatChangeValue(entry.new_value)}
                        {entry.change_reason ? ` · ${entry.change_reason}` : ''}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                    {changeLogLoading ? '正在加载变更日志...' : '当前还没有材料变更记录。'}
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
      const [nextReminders, nextDigest] = await Promise.allSettled([
        MaterialsApiService.listReminders(projectId, { signal }),
        MaterialsApiService.getWeeklyDigest(projectId, { signal }),
      ])
      setMaterials(nextMaterials ?? [])
      setParticipantUnits(nextUnits ?? [])
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
  const weeklySummary = useMemo(() => {
    const onTimeCount = materials.filter(isMaterialOnTime).length
    return {
      totalExpectedCount: materials.length,
      onTimeCount,
      arrivalRate: materials.length > 0 ? Math.round((onTimeCount / materials.length) * 100) : 0,
      arrivedThisWeek: summary.arrivedThisWeek,
      overdueArrival: summary.overdueArrival,
      pendingInspection: summary.pendingInspection,
    }
  }, [materials, summary.arrivedThisWeek, summary.overdueArrival, summary.pendingInspection])
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

  if (loading) {
    return (
      <LoadingState
        className="mx-auto mt-12 max-w-sm"
        label="材料清单加载中"
        description="正在同步材料记录和参建单位信息"
      />
    )
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <EmptyState
          icon={Boxes}
          title={canReadAllMaterials ? '材料清单暂时不可用' : '暂时无法进入材料管控'}
          description={error}
          action={<Button onClick={() => void loadPage(undefined, true)}>重新加载</Button>}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6" data-testid="materials-page">
      <Breadcrumb
        items={[
          { label: PROJECT_NAVIGATION_LABELS.special, href: `/projects/${projectId}/pre-milestones` },
          { label: PROJECT_NAVIGATION_LABELS.materials },
        ]}
        showHome
      />

      <PageHeader
        eyebrow="专项管理"
        title={PROJECT_NAVIGATION_LABELS.materials}
        subtitle={`${currentProject?.name || '当前项目'}的材料到场、送检与单位归属统一在这里维护。`}
      >
        <Button variant="outline" onClick={() => void loadPage(undefined, true)} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </PageHeader>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          { label: '待定样', value: summary.pendingSample, icon: ClipboardList },
          { label: '待到场', value: summary.pendingArrival, icon: PackageSearch },
          { label: '逾期未到', value: summary.overdueArrival, icon: Wrench },
          { label: '本周到场', value: summary.arrivedThisWeek, icon: PackageCheck },
          { label: '待送检', value: summary.pendingInspection, icon: Boxes },
          { label: '已完成', value: summary.completed, icon: PackageCheck },
        ].map((item) => (
          <Card key={item.label} className="border-slate-200 shadow-sm">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
              </div>
              <item.icon className="h-5 w-5 text-slate-400" />
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="border-slate-200 shadow-sm" data-testid="materials-weekly-summary">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base text-slate-900">周报摘要</CardTitle>
                <div className="mt-1 text-sm text-slate-500">
                  周窗口 {formatWeekLabel(latestDigest?.week_start)} · 最近生成 {formatDateTimeLabel(latestDigest?.generated_at)}
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={`/projects/${projectId}/reports?view=progress`}>查看材料分析</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">应到总数</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{weeklySummary.totalExpectedCount}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">准时到场</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{weeklySummary.onTimeCount}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">本周到场</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{weeklySummary.arrivedThisWeek}</div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">逾期 / 待送检</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">
                  {weeklySummary.overdueArrival} / {weeklySummary.pendingInspection}
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              当前材料准时到场率 {weeklySummary.arrivalRate}%。
              {latestDigest
                ? ' 项目级周报已生成，可结合“材料到场率分析”和提醒列表一起复核。'
                : ' 项目级周报尚未生成，当前先用最新材料真值快照展示。'}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm" data-testid="materials-reminder-feed">
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base text-slate-900">提醒列表</CardTitle>
                <div className="mt-1 text-sm text-slate-500">
                  已按参建单位聚合材料到场提醒，逾期项会继续追踪。
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={`/notifications?scope=current-project&projectId=${encodeURIComponent(projectId)}`}>查看全部提醒</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {reminders.length > 0 ? (
              reminders.slice(0, 4).map((reminder) => (
                <div
                  key={reminder.id}
                  data-testid={`materials-reminder-item-${reminder.id}`}
                  className={`rounded-2xl border px-4 py-3 ${getReminderTone(reminder)}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium">{reminder.title}</div>
                    <div className="text-xs opacity-80">{formatDateTimeLabel(reminder.created_at)}</div>
                  </div>
                  <div className="mt-2 text-sm leading-6 opacity-90">{reminder.content || '系统已生成材料提醒。'}</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                当前暂无材料提醒，待每日扫描命中后会在这里汇总展示。
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base text-slate-900">筛选与录入</CardTitle>
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
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as MaterialStatusFilter)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-600">
              <span>参建单位</span>
              <select
                value={unitFilter}
                onChange={(event) => updateSearchFilter('unit', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">全部单位</option>
                {participantUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.unit_name}
                  </option>
                ))}
                <option value="__unassigned__">无归属单位</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-slate-600">
              <span>专项类型</span>
              <select
                value={specialtyFilter}
                onChange={(event) => updateSearchFilter('specialty', event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="all">全部专项</option>
                {specialtyOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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
                    <select
                      data-testid="materials-create-single-unit"
                      value={singleForm.participant_unit_id}
                      onChange={(event) => setSingleForm((current) => ({ ...current, participant_unit_id: event.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">暂不关联</option>
                      {participantUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.unit_name}
                        </option>
                      ))}
                    </select>
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
                      <select
                        data-testid="materials-template-specialty"
                        value={templateSpecialty}
                        onChange={(event) => {
                          setTemplateSpecialty(event.target.value)
                          setSelectedTemplateItems([])
                        }}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        {MATERIAL_TEMPLATE_GROUPS.map((group) => (
                          <option key={group.specialtyType} value={group.specialtyType}>
                            {group.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm text-slate-600">
                      <span>参建单位</span>
                      <select
                        data-testid="materials-template-unit"
                        value={templateUnitId}
                        onChange={(event) => setTemplateUnitId(event.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                      >
                        <option value="">暂不关联</option>
                        {participantUnits.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.unit_name}
                          </option>
                        ))}
                      </select>
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
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">材料名称</th>
                          <th className="px-3 py-2 font-medium">专项</th>
                          <th className="px-3 py-2 font-medium">参建单位</th>
                          <th className="px-3 py-2 font-medium">预计到场</th>
                          <th className="px-3 py-2 font-medium">定样</th>
                          <th className="px-3 py-2 font-medium">送检</th>
                          <th className="px-3 py-2 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchRows.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100" data-testid={`materials-batch-row-${row.id}`}>
                            <td className="px-3 py-2">
                              <input
                                data-testid={`materials-batch-name-${row.id}`}
                                value={row.material_name}
                                onChange={(event) =>
                                  setBatchRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, material_name: event.target.value } : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
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
                            </td>
                            <td className="px-3 py-2">
                              <select
                                data-testid={`materials-batch-unit-${row.id}`}
                                value={row.participant_unit_id}
                                onChange={(event) =>
                                  setBatchRows((current) =>
                                    current.map((item) =>
                                      item.id === row.id ? { ...item, participant_unit_id: event.target.value } : item,
                                    ),
                                  )
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5"
                              >
                                <option value="">暂不关联</option>
                                {participantUnits.map((unit) => (
                                  <option key={unit.id} value={unit.id}>
                                    {unit.unit_name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
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
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
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
                            </td>
                            <td className="px-3 py-2 text-center">
                              <input
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
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`materials-batch-delete-${row.id}`}
                                onClick={() =>
                                  setBatchRows((current) => (current.length === 1 ? current : current.filter((item) => item.id !== row.id)))
                                }
                              >
                                删除
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
          icon={Boxes}
          title="当前没有符合筛选条件的材料"
          description="可以先切换筛选条件，或者直接新增材料记录。"
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
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                    data-testid="materials-unassigned-banner"
                  >
                    以下材料所属分包商已删除，请重新关联
                  </div>
                )}

                {group.materials.map((material) => {
                  const status = getMaterialPrimaryStatus(material)

                  return (
                    <div key={material.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium text-slate-900">{material.material_name}</div>
                            <span
                              data-testid={`material-status-chip-${material.id}`}
                              className={`rounded-full px-2 py-1 text-xs font-medium ${getMaterialStatusTone(status)}`}
                            >
                              {getMaterialStatusLabel(status)}
                            </span>
                            {isMaterialArrivedThisWeek(material) && (
                              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                                本周到场
                              </span>
                            )}
                            {material.specialty_type && (
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                                {material.specialty_type}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500">
                            预计到场：{material.expected_arrival_date}
                            {material.actual_arrival_date ? ` · 实际到场：${material.actual_arrival_date}` : ''}
                          </div>
                          <div className="text-xs text-slate-500" data-testid={`material-linked-task-${material.id}`}>
                            {material.linked_task_id ? (
                              <>
                                关联任务：{material.linked_task_title || '未命名任务'} · 计划开工 {material.linked_task_start_date || '--'} · 到货缓冲{' '}
                                {material.linked_task_buffer_days == null ? '--' : `${material.linked_task_buffer_days} 天`}
                              </>
                            ) : (
                              '当前未匹配到在施任务，暂按材料真值独立跟踪'
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openDetailDialog(material)}
                            data-testid={`material-detail-trigger-${material.id}`}
                          >
                            <PencilLine className="mr-1 h-4 w-4" />
                            {isReadOnly ? '查看详情' : '详情编辑'}
                          </Button>
                          {!isReadOnly && (
                            <Button variant="ghost" size="sm" onClick={() => void handleDeleteMaterial(material.id)}>
                              <Trash2 className="mr-1 h-4 w-4" />
                              删除
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <label className="space-y-1 text-xs text-slate-500">
                          <span>参建单位</span>
                          <select
                            value={material.participant_unit_id ?? ''}
                            onChange={(event) => void handleInlineUpdate(material.id, { participant_unit_id: event.target.value || null })}
                            disabled={isReadOnly}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                          >
                            <option value="">暂不关联</option>
                            {participantUnits.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {unit.unit_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-xs text-slate-500">
                          <span>实际到场日期</span>
                          <input
                            data-testid={`material-inline-actual-arrival-${material.id}`}
                            type="date"
                            value={material.actual_arrival_date ?? ''}
                            onChange={(event) => void handleInlineUpdate(material.id, { actual_arrival_date: event.target.value || null })}
                            disabled={isReadOnly}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
                          />
                        </label>
                        {material.requires_sample_confirmation ? (
                          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                            <input
                              data-testid={`material-inline-sample-confirmed-${material.id}`}
                              type="checkbox"
                              checked={material.sample_confirmed}
                              disabled={isReadOnly}
                              onChange={(event) => void handleInlineUpdate(material.id, { sample_confirmed: event.target.checked })}
                            />
                            定样已完成
                          </label>
                        ) : (
                          <div
                            data-testid={`material-inline-sample-placeholder-${material.id}`}
                            className="flex items-center rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400"
                          >
                            无需定样
                          </div>
                        )}
                        {material.requires_inspection ? (
                          <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                            <input
                              data-testid={`material-inline-inspection-done-${material.id}`}
                              type="checkbox"
                              checked={material.inspection_done}
                              disabled={isReadOnly}
                              onChange={(event) => void handleInlineUpdate(material.id, { inspection_done: event.target.checked })}
                            />
                            送检已完成
                          </label>
                        ) : (
                          <div
                            data-testid={`material-inline-inspection-placeholder-${material.id}`}
                            className="flex items-center rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm text-slate-400"
                          >
                            无需送检
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
    </div>
  )
}
