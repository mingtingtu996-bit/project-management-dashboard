/**
 * ProjectInfoCard.tsx
 * 
 * 项目信息卡片 - UI设计V4版本（含内联编辑）
 * 
 * 功能特性：
 * - 4列紧凑布局展示项目基本信息
 * - 点击铅笔按钮进入编辑模式
 * - 编辑模式：下拉选择 + 数字输入 + 日期选择
 * - 保存/取消按钮，调用 onSave 回调
 * 
 * @module
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Building2, Calendar, Timer, Pencil, Check, X } from 'lucide-react'

interface ProjectInfoCardProps {
  projectName: string
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
  /** 保存回调，传入变更字段 */
  onSave?: (updates: Partial<EditableFields>) => Promise<void>
}

interface EditableFields {
  project_type: string
  building_type: string
  structure_type: string
  support_method: string
  building_count: number | undefined
  above_ground_floors: number | undefined
  underground_floors: number | undefined
  total_area: number | undefined
  total_investment: number | undefined
  planned_start_date: string
  planned_end_date: string
}

// ─── 映射表 ────────────────────────────────────────────────────────────────

const projectTypeOptions = [
  { value: 'residential', label: '住宅' },
  { value: 'commercial', label: '商业' },
  { value: 'office', label: '办公' },
  { value: 'mixed', label: '综合体' },
  { value: 'industrial', label: '工业' },
  { value: 'infrastructure', label: '基础设施' },
]

const buildingTypeOptions = [
  { value: 'high_rise', label: '高层' },
  { value: 'mid_rise', label: '中层' },
  { value: 'low_rise', label: '低层' },
  { value: 'villa', label: '别墅' },
  { value: 'mixed', label: '混合' },
]

const structureTypeOptions = [
  { value: 'concrete', label: '混凝土结构' },
  { value: 'steel', label: '钢结构' },
  { value: 'masonry', label: '砌体结构' },
  { value: 'mixed', label: '混合结构' },
]

const supportMethodOptions = [
  { value: 'natural', label: '天然地基' },
  { value: 'pile', label: '桩基础' },
  { value: 'raft', label: '筏形基础' },
  { value: 'combined', label: '复合地基' },
]

const projectTypeMap: Record<string, string> = Object.fromEntries(projectTypeOptions.map(o => [o.value, o.label]))
const buildingTypeMap: Record<string, string> = Object.fromEntries(buildingTypeOptions.map(o => [o.value, o.label]))
const structureTypeMap: Record<string, string> = Object.fromEntries(structureTypeOptions.map(o => [o.value, o.label]))
const supportMethodMap: Record<string, string> = Object.fromEntries(supportMethodOptions.map(o => [o.value, o.label]))

const statusMap: Record<string, { label: string; color: string }> = {
  'active': { label: '进行中', color: 'bg-blue-500' },
  'completed': { label: '已完成', color: 'bg-emerald-500' },
  'archived': { label: '已归档', color: 'bg-gray-500' },
  'pending': { label: '待启动', color: 'bg-amber-500' },
}

const healthColorMap: Record<string, { text: string; bg: string; dot: string }> = {
  'excellent': { text: 'text-emerald-600', bg: 'bg-emerald-50', dot: 'bg-emerald-500' },
  'good': { text: 'text-blue-600', bg: 'bg-blue-50', dot: 'bg-blue-500' },
  'warning': { text: 'text-amber-600', bg: 'bg-amber-50', dot: 'bg-amber-500' },
  'critical': { text: 'text-red-600', bg: 'bg-red-50', dot: 'bg-red-500' },
}

// ─── 子组件：Select ─────────────────────────────────────────────────────────

function InlineSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full text-sm border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
    >
      <option value="">未设置</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

// ─── 子组件：Number Input ────────────────────────────────────────────────────

function InlineNumber({
  value,
  placeholder,
  onChange,
  suffix,
}: {
  value: number | undefined
  placeholder?: string
  onChange: (v: number | undefined) => void
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-0.5">
      <input
        type="number"
        min={0}
        value={value ?? ''}
        placeholder={placeholder ?? '-'}
        onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="w-full text-sm border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      {suffix && <span className="text-xs text-gray-400 flex-shrink-0">{suffix}</span>}
    </div>
  )
}

// ─── 子组件：Date Input ──────────────────────────────────────────────────────

function InlineDate({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
    />
  )
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export default function ProjectInfoCard({
  projectName,
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
  onSave,
}: ProjectInfoCardProps) {
  const statusInfo = statusMap[status] || statusMap['active']

  // ─── 编辑状态 ─────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<EditableFields>({
    project_type: projectType ?? '',
    building_type: buildingType ?? '',
    structure_type: structureType ?? '',
    support_method: supportMethod ?? '',
    building_count: buildingCount,
    above_ground_floors: aboveGroundFloors,
    underground_floors: undergroundFloors,
    total_area: totalArea,
    total_investment: totalInvestment,
    planned_start_date: plannedStartDate ?? '',
    planned_end_date: plannedEndDate ?? '',
  })

  const handleEdit = () => {
    // 重置表单为最新 props
    setForm({
      project_type: projectType ?? '',
      building_type: buildingType ?? '',
      structure_type: structureType ?? '',
      support_method: supportMethod ?? '',
      building_count: buildingCount,
      above_ground_floors: aboveGroundFloors,
      underground_floors: undergroundFloors,
      total_area: totalArea,
      total_investment: totalInvestment,
      planned_start_date: plannedStartDate ?? '',
      planned_end_date: plannedEndDate ?? '',
    })
    setEditing(true)
  }

  const handleCancel = () => setEditing(false)

  const handleSave = async () => {
    if (!onSave) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(form)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const set = <K extends keyof EditableFields>(key: K, val: EditableFields[K]) =>
    setForm(prev => ({ ...prev, [key]: val }))

  // ─── 只读计算 ─────────────────────────────────────────────────────────────
  const effectiveStart = editing ? form.planned_start_date : (plannedStartDate ?? '')
  const effectiveEnd   = editing ? form.planned_end_date   : (plannedEndDate ?? '')

  const getDuration = () => {
    if (!effectiveStart || !effectiveEnd) return null
    const days = Math.ceil((new Date(effectiveEnd).getTime() - new Date(effectiveStart).getTime()) / 86400000)
    return days > 0 ? days : null
  }

  const getRemainingDays = () => {
    if (!effectiveEnd) return null
    return Math.ceil((new Date(effectiveEnd).getTime() - Date.now()) / 86400000)
  }

  const duration = getDuration()
  const remainingDays = getRemainingDays()

  const getRemainingStyle = (days: number | null) => {
    if (days === null) return { text: '未设置', color: 'text-gray-400', bg: 'bg-gray-50' }
    if (days < 0)  return { text: `已延期 ${Math.abs(days)} 天`, color: 'text-red-600', bg: 'bg-red-50' }
    if (days === 0) return { text: '今天截止', color: 'text-amber-600', bg: 'bg-amber-50' }
    if (days <= 7)  return { text: `剩余 ${days} 天`, color: 'text-amber-600', bg: 'bg-amber-50' }
    if (days <= 30) return { text: `剩余 ${days} 天`, color: 'text-blue-600', bg: 'bg-blue-50' }
    return { text: `剩余 ${days} 天`, color: 'text-emerald-600', bg: 'bg-emerald-50' }
  }

  const remainingStyle = getRemainingStyle(remainingDays)

  // ─── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <Card className="rounded-xl border border-gray-200 shadow-sm bg-white hover:shadow-md hover:ring-1 ring-blue-100 transition-all h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-1.5 mb-1">
              <Building2 className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
              项目信息
            </CardTitle>
            <h3 className="text-base font-bold text-gray-900 truncate">{projectName}</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            <Badge className={`${statusInfo.color} text-white text-xs`}>
              {statusInfo.label}
            </Badge>
            {/* 编辑 / 保存 / 取消 按钮 */}
            {!editing && onSave && (
              <button
                onClick={handleEdit}
                title="编辑项目信息"
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {editing && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  className="h-6 px-2 text-xs bg-blue-500 hover:bg-blue-600"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Check className="h-3 w-3 mr-0.5" />
                  {saving ? '保存中…' : '保存'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  <X className="h-3 w-3 mr-0.5" />
                  取消
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 项目属性 - 3列紧凑布局 */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-2">

          {/* 项目类型 */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">项目类型</p>
            {editing ? (
              <InlineSelect value={form.project_type} options={projectTypeOptions} onChange={v => set('project_type', v)} />
            ) : (
              <p className="text-sm font-medium text-gray-700">{projectType ? (projectTypeMap[projectType] || projectType) : '-'}</p>
            )}
          </div>

          {/* 建筑类型 */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">建筑类型</p>
            {editing ? (
              <InlineSelect value={form.building_type} options={buildingTypeOptions} onChange={v => set('building_type', v)} />
            ) : (
              <p className="text-sm font-medium text-gray-700">{buildingType ? (buildingTypeMap[buildingType] || buildingType) : '-'}</p>
            )}
          </div>

          {/* 结构类型 */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">结构类型</p>
            {editing ? (
              <InlineSelect value={form.structure_type} options={structureTypeOptions} onChange={v => set('structure_type', v)} />
            ) : (
              <p className="text-sm font-medium text-gray-700">{structureType ? (structureTypeMap[structureType] || structureType) : '-'}</p>
            )}
          </div>

          {/* 楼栋数 */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">楼栋数</p>
            {editing ? (
              <InlineNumber value={form.building_count} placeholder="栋数" onChange={v => set('building_count', v)} suffix="栋" />
            ) : (
              <p className="text-sm font-medium text-gray-700">{buildingCount !== undefined && buildingCount > 0 ? `${buildingCount}栋` : '-'}</p>
            )}
          </div>

          {/* 楼层（地上+地下） */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">楼层（地上/下）</p>
            {editing ? (
              <div className="flex items-center gap-0.5">
                <input
                  type="number" min={0}
                  value={form.above_ground_floors ?? ''}
                  placeholder="地上"
                  onChange={e => set('above_ground_floors', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="w-1/2 text-sm border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-xs text-gray-400">+</span>
                <input
                  type="number" min={0}
                  value={form.underground_floors ?? ''}
                  placeholder="地下"
                  onChange={e => set('underground_floors', e.target.value === '' ? undefined : Number(e.target.value))}
                  className="w-1/2 text-sm border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            ) : (
              <p className="text-sm font-medium text-gray-700">
                {aboveGroundFloors !== undefined && aboveGroundFloors > 0
                  ? `${aboveGroundFloors}+${undergroundFloors || 0}层`
                  : '-'}
              </p>
            )}
          </div>

          {/* 建筑面积 */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">建筑面积</p>
            {editing ? (
              <InlineNumber value={form.total_area} placeholder="㎡" onChange={v => set('total_area', v)} suffix="㎡" />
            ) : (
              <p className="text-sm font-medium text-gray-700">{totalArea !== undefined && totalArea > 0 ? `${totalArea.toLocaleString()}㎡` : '-'}</p>
            )}
          </div>

          {/* 支撑方式 */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">支撑方式</p>
            {editing ? (
              <InlineSelect value={form.support_method} options={supportMethodOptions} onChange={v => set('support_method', v)} />
            ) : (
              <p className="text-sm font-medium text-gray-700">{supportMethod ? (supportMethodMap[supportMethod] || supportMethod) : '-'}</p>
            )}
          </div>

          {/* 总投资 */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">总投资（万）</p>
            {editing ? (
              <InlineNumber value={form.total_investment} placeholder="万元" onChange={v => set('total_investment', v)} suffix="万" />
            ) : (
              <p className="text-sm font-medium text-gray-700">
                {totalInvestment !== undefined && totalInvestment > 0
                  ? totalInvestment >= 10000 ? `${(totalInvestment / 10000).toFixed(1)}亿` : `${totalInvestment.toLocaleString()}万`
                  : '-'}
              </p>
            )}
          </div>

          {/* 总工期（只读，由日期计算） */}
          <div>
            <p className="text-xs text-gray-400 mb-0.5">总工期</p>
            <p className="text-sm font-medium text-gray-700">
              {duration ? `${duration}天` : '-'}
            </p>
          </div>

          {/* 健康度（只读） */}
          {healthScore !== undefined && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">健康度</p>
              <p className={`text-sm font-medium ${healthColorMap[healthStatus || '']?.text || 'text-gray-700'}`}>
                {healthScore}分
              </p>
            </div>
          )}
        </div>

        {/* 时间信息 + 剩余天数 */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 gap-2">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Calendar className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            {editing ? (
              <div className="flex items-center gap-1">
                <InlineDate value={form.planned_start_date} onChange={v => set('planned_start_date', v)} />
                <span className="text-gray-400">-</span>
                <InlineDate value={form.planned_end_date} onChange={v => set('planned_end_date', v)} />
              </div>
            ) : (
              <span className="text-gray-500">
                {plannedStartDate ? new Date(plannedStartDate).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '未设'} -&nbsp;
                {plannedEndDate   ? new Date(plannedEndDate).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '未设'}
              </span>
            )}
            {duration && !editing && <span className="text-gray-400">({duration}天)</span>}
          </div>
          {remainingDays !== null && (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded flex-shrink-0 ${remainingStyle.bg}`}>
              <Timer className={`h-3.5 w-3.5 ${remainingStyle.color}`} />
              <span className={`text-sm font-medium ${remainingStyle.color}`}>{remainingStyle.text}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
