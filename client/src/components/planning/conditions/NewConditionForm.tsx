import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type NewConditionType = string

export interface NewConditionTypeOption {
  value: NewConditionType
  label: string
}

export interface NewConditionFormValue {
  name: string
  type: NewConditionType
  targetDate?: string | null
  description?: string | null
  participantUnitId?: string | null
}

export interface NewConditionParticipantUnitOption {
  id: string
  name: string
}

export interface NewConditionFormProps {
  participantUnits?: NewConditionParticipantUnitOption[]
  defaultType?: NewConditionType
  conditionTypes?: NewConditionTypeOption[]
  onTypeChange?: (type: NewConditionType) => void
  onSubmit: (value: NewConditionFormValue) => void | Promise<void>
  onCancel?: () => void
  className?: string
}

const DEFAULT_CONDITION_TYPES: NewConditionTypeOption[] = [
  { value: 'soft', label: '软条件' },
  { value: 'hard', label: '硬条件' },
]

export const NewConditionForm = memo(function NewConditionForm({
  participantUnits = [],
  defaultType = 'soft',
  conditionTypes = DEFAULT_CONDITION_TYPES,
  onTypeChange,
  onSubmit,
  onCancel,
  className,
}: NewConditionFormProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<NewConditionType>(defaultType)
  const [targetDate, setTargetDate] = useState('')
  const [description, setDescription] = useState('')
  const [participantUnitId, setParticipantUnitId] = useState('__none__')

  const canSubmit = useMemo(() => name.trim().length > 0, [name])
  const typeOptions = conditionTypes.length > 0 ? conditionTypes : DEFAULT_CONDITION_TYPES

  useEffect(() => {
    setType(defaultType)
  }, [defaultType])

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim()
    if (!trimmedName) return
    void Promise.resolve(onSubmit({
      name: trimmedName,
      type,
      targetDate: targetDate || null,
      description: description.trim() || null,
      participantUnitId: participantUnitId === '__none__' ? null : participantUnitId,
    })).then(() => {
      setName('')
      setTargetDate('')
      setDescription('')
      setParticipantUnitId('__none__')
    })
  }, [description, name, onSubmit, participantUnitId, targetDate, type])

  return (
    <div
      data-testid="new-condition-form"
      className={cn('space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-[var(--el-2)]', className)}
    >
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium text-slate-900">新增开工条件</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
        <Input
          value={name}
          placeholder="条件名称"
          className="h-8 text-sm"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSubmit()
          }}
        />
        <Select
          value={type}
          onValueChange={(value) => {
            setType(value)
            onTypeChange?.(value)
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {typeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          type="date"
          aria-label="目标日期"
          value={targetDate}
          className="h-8 text-xs"
          onChange={(event) => setTargetDate(event.target.value)}
        />
        <Select value={participantUnitId} onValueChange={setParticipantUnitId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="责任单位" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">暂不指定</SelectItem>
            {participantUnits.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        value={description}
        placeholder="条件说明"
        className="min-h-20 text-sm"
        onChange={(event) => setDescription(event.target.value)}
      />

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
            取消
          </Button>
        ) : null}
        <Button type="button" size="sm" className="h-7 text-xs" disabled={!canSubmit} onClick={handleSubmit}>
          新增条件
        </Button>
      </div>
    </div>
  )
})

export default NewConditionForm
