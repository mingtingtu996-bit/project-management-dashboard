import { memo, useCallback, useState } from 'react'
import { ChevronDown, ChevronUp, MapPin, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface ScopeBarSelection {
  phaseObjectId?: string | null
  phaseLabel?: string
  sectionObjectId?: string | null
  sectionLabel?: string
  buildingObjectId?: string | null
  buildingLabel?: string
  basementObjectId?: string | null
  basementLabel?: string
  floorObjectId?: string | null
  floorLabel?: string
  physicalZoneObjectId?: string | null
  physicalZoneLabel?: string
  functionalAreaObjectId?: string | null
  functionalAreaLabel?: string
}

export interface ScopeBarOptions {
  phases: Array<{ id: string; label: string }>
  sections: Array<{ id: string; label: string }>
  buildings: Array<{ id: string; label: string }>
  basements: Array<{ id: string; label: string }>
  floors: Array<{ id: string; label: string; buildingId?: string }>
  physicalZones: Array<{ id: string; label: string; floorId?: string }>
  functionalAreas: Array<{ id: string; label: string; floorId?: string }>
}

interface PlanningScopeBarProps {
  selection: ScopeBarSelection
  options: ScopeBarOptions
  onChange: (next: ScopeBarSelection) => void
  onClear: () => void
  readOnly?: boolean
  className?: string
}

const SELECT_NONE = '__none__'

const SCOPE_CONTROLS: Array<{
  field: keyof ScopeBarSelection
  labelField: keyof ScopeBarSelection
  placeholder: string
  allLabel: string
  optionKey: keyof ScopeBarOptions
  widthClass: string
}> = [
  { field: 'phaseObjectId', labelField: 'phaseLabel', placeholder: '分期', allLabel: '全部分期', optionKey: 'phases', widthClass: 'w-[104px]' },
  { field: 'sectionObjectId', labelField: 'sectionLabel', placeholder: '标段', allLabel: '全部标段', optionKey: 'sections', widthClass: 'w-[104px]' },
  { field: 'buildingObjectId', labelField: 'buildingLabel', placeholder: '单体', allLabel: '全部单体', optionKey: 'buildings', widthClass: 'w-[104px]' },
  { field: 'basementObjectId', labelField: 'basementLabel', placeholder: '地下室', allLabel: '全部地下室', optionKey: 'basements', widthClass: 'w-[112px]' },
  { field: 'floorObjectId', labelField: 'floorLabel', placeholder: '楼层', allLabel: '全部楼层', optionKey: 'floors', widthClass: 'w-[96px]' },
  { field: 'physicalZoneObjectId', labelField: 'physicalZoneLabel', placeholder: '工程区域', allLabel: '全部工程区域', optionKey: 'physicalZones', widthClass: 'w-[120px]' },
  { field: 'functionalAreaObjectId', labelField: 'functionalAreaLabel', placeholder: '功能区域', allLabel: '全部功能区域', optionKey: 'functionalAreas', widthClass: 'w-[120px]' },
]

function hasScopeSelection(selection: ScopeBarSelection) {
  return Boolean(
    selection.phaseObjectId
      || selection.sectionObjectId
      || selection.buildingObjectId
      || selection.basementObjectId
      || selection.floorObjectId
      || selection.physicalZoneObjectId
      || selection.functionalAreaObjectId,
  )
}

function buildScopeChips(selection: ScopeBarSelection) {
  return [
    selection.phaseLabel && `分期: ${selection.phaseLabel}`,
    selection.sectionLabel && `标段: ${selection.sectionLabel}`,
    selection.buildingLabel && `单体: ${selection.buildingLabel}`,
    selection.basementLabel && `地下室: ${selection.basementLabel}`,
    selection.floorLabel && `楼层: ${selection.floorLabel}`,
    selection.physicalZoneLabel && `工程区域: ${selection.physicalZoneLabel}`,
    selection.functionalAreaLabel && `功能区域: ${selection.functionalAreaLabel}`,
  ].filter(Boolean)
}

export const PlanningScopeBar = memo(function PlanningScopeBar(props: PlanningScopeBarProps) {
  const { selection, options, onChange, onClear, readOnly, className } = props
  const [expanded, setExpanded] = useState(false)
  const hasSelection = hasScopeSelection(selection)

  const handleChange = useCallback((field: keyof ScopeBarSelection, labelField: keyof ScopeBarSelection, optionKey: keyof ScopeBarOptions, value: string) => {
    if (value === SELECT_NONE) {
      onChange({ ...selection, [field]: null, [labelField]: undefined })
      return
    }

    const label = options[optionKey].find((item) => item.id === value)?.label
    onChange({ ...selection, [field]: value, [labelField]: label })
  }, [selection, options, onChange])

  if (readOnly) return null

  if (!expanded && !hasSelection) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5', className)}>
        <MapPin className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs text-slate-400">设置任务作用范围，用于新增任务和模板生成</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setExpanded(true)}>
          设置 <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </div>
    )
  }

  if (!expanded && hasSelection) {
    const chips = buildScopeChips(selection)
    return (
      <div className={cn('flex items-center gap-2 px-3 py-1.5', className)}>
        <MapPin className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs text-slate-500">当前作用范围</span>
        <span className="truncate text-xs font-medium text-slate-700">{chips.join(' / ')}</span>
        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setExpanded(true)}>
          展开 <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 text-xs text-slate-400" onClick={onClear}>
          清空
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/50 px-3 py-2', className)}>
      <MapPin className="h-3.5 w-3.5 text-blue-500" />
      <span className="text-xs font-medium text-slate-600">作用范围</span>

      {SCOPE_CONTROLS.map((control) => (
        <Select
          key={String(control.field)}
          value={String(selection[control.field] ?? SELECT_NONE)}
          onValueChange={(value) => handleChange(control.field, control.labelField, control.optionKey, value)}
        >
          <SelectTrigger className={cn('h-7 text-xs', control.widthClass)}>
            <SelectValue placeholder={control.placeholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SELECT_NONE} className="text-xs">{control.allLabel}</SelectItem>
            {options[control.optionKey].map((item) => (
              <SelectItem key={item.id} value={item.id} className="text-xs">{item.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onClear}>
        <X className="mr-1 h-3 w-3" />清空
      </Button>
      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setExpanded(false)}>
        <ChevronUp className="h-3 w-3" />
      </Button>
    </div>
  )
})

export default PlanningScopeBar
