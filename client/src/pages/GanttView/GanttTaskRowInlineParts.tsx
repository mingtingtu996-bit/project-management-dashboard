import { AlertOctagon, Check, ChevronDown, MapPin, ShieldCheck, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { AssigneeCombobox, type AssigneeComboboxOption, type AssigneeComboboxValue } from '@/components/AssigneeCombobox'
import { AcceptanceImpactChip, type AcceptanceImpactItem } from '@/components/planning/AcceptanceImpactChip'
import { BlockageListPopover } from '@/components/planning/blockages/BlockageListPopover'
import { QuickBlockageForm } from '@/components/planning/blockages/QuickBlockageForm'
import { ConditionListPopover } from '@/components/planning/conditions/ConditionListPopover'
import { ParticipantUnitLookup, type ParticipantUnitLookupOption } from '@/components/planning/lookups/ParticipantUnitLookup'
import { PlanningChipBand } from '@/components/planning/PlanningChipBand'
import type { DrawerSection } from '@/components/planning/PlanningDetailDrawer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { CriticalTaskSnapshot } from '@/lib/criticalPath'
import { cn } from '@/lib/utils'
import type { Task, TaskCondition, TaskObstacle } from '../GanttViewTypes'
import {
  clampProgress,
  hasEngineeringScope,
  hasResponsibleUnit,
  isHardCondition,
  normalizeDateInput,
  toInlineConditionItems,
  type TaskConditionBreakdown,
} from './taskRowModel'

export type QuickBlockageDraft = {
  description: string
  severity: string
  expectedResolution?: string
}
type TaskIssueChipDescriptor = {
  key: string
  label: string
  tooltip: string
  priority: number
  icon: ReactNode
  className: string
  section?: DrawerSection
  kind?: 'acceptance'
}

export function TaskIssueChipBand({
  task,
  conditionSummary,
  conditionBreakdown,
  conditions,
  obstacles,
  obstacleCount,
  criticalTask,
  acceptanceImpactItems,
  isExecutableLeaf,
  canEdit,
  onOpenDetailDrawer,
  onOpenConditionDialog,
  onOpenObstacleDialog,
  onToggleCondition,
  onQuickAddObstacle,
}: {
  task: Task
  conditionSummary?: { satisfied: number; total: number }
  conditionBreakdown?: TaskConditionBreakdown
  conditions: TaskCondition[]
  obstacles: TaskObstacle[]
  obstacleCount: number
  criticalTask: CriticalTaskSnapshot | null
  acceptanceImpactItems: AcceptanceImpactItem[]
  isExecutableLeaf: boolean
  canEdit?: boolean
  onOpenDetailDrawer?: (task: Task, section: DrawerSection) => void
  onOpenConditionDialog: (task: Task) => void
  onOpenObstacleDialog: (task: Task) => void
  onToggleCondition?: (condition: TaskCondition) => void
  onQuickAddObstacle?: (task: Task, data: QuickBlockageDraft) => void | Promise<void>
}) {
  const conditionTotal = conditionSummary?.total ?? 0
  const conditionSatisfied = conditionSummary?.satisfied ?? 0
  const conditionLabel = conditionBreakdown && (conditionBreakdown.hardTotal > 0 || conditionBreakdown.softTotal > 0)
    ? `硬 ${conditionBreakdown.hardSatisfied}/${conditionBreakdown.hardTotal} 软 ${conditionBreakdown.softSatisfied}/${conditionBreakdown.softTotal}`
    : `条件 ${conditionSatisfied}/${conditionTotal}`
  const chips: TaskIssueChipDescriptor[] = []

  if (obstacleCount > 0) {
    chips.push({
      key: 'blockages',
      label: `阻碍 ${obstacleCount}`,
      tooltip: `${obstacleCount} 条未解决阻碍`,
      priority: 2,
      section: 'blockages',
      icon: <AlertOctagon className="h-3 w-3" />,
      className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    })
  }

  if (conditionTotal > 0) {
    const allSatisfied = conditionSatisfied >= conditionTotal
    chips.push({
      key: 'conditions',
      label: conditionLabel,
      tooltip: `开工条件 ${conditionLabel}`,
      priority: allSatisfied ? 8 : 3,
      section: 'conditions',
      icon: <ShieldCheck className="h-3 w-3" />,
      className: allSatisfied
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
        : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100',
    })
  }

  if (isExecutableLeaf && !hasResponsibleUnit(task)) {
    chips.push({
      key: 'missing-unit',
      label: '责任单位缺失',
      tooltip: '责任单位尚未绑定，影响执行准备',
      priority: 4,
      section: 'responsibility',
      icon: <UserRound className="h-3 w-3" />,
      className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    })
  }

  if (isExecutableLeaf && !hasEngineeringScope(task)) {
    chips.push({
      key: 'missing-scope',
      label: '工程对象缺失',
      tooltip: '工程对象尚未绑定',
      priority: 5,
      section: 'scope',
      icon: <MapPin className="h-3 w-3" />,
      className: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    })
  }

  if (acceptanceImpactItems.length > 0) {
    chips.push({
      key: 'acceptance',
      label: acceptanceImpactItems.length === 1 ? '验收影响' : `验收 ${acceptanceImpactItems.length}`,
      tooltip: acceptanceImpactItems.map((item) => item.name).join('、'),
      priority: 6,
      section: 'acceptance',
      kind: 'acceptance',
      icon: null,
      className: '',
    })
  }

  const sortedChips = chips.sort((a, b) => a.priority - b.priority)
  const visibleChip = sortedChips[0]
  const hiddenChips = sortedChips.slice(1)
  const showObstacleAction = Boolean(canEdit && isExecutableLeaf && obstacleCount === 0)
  const showConditionAction = Boolean(canEdit && isExecutableLeaf && conditionTotal === 0)
  const inlineConditionItems = toInlineConditionItems(conditions)
  const visibleObstacles = obstacles.slice(0, 3)
  if (!visibleChip && !showObstacleAction && !showConditionAction) return null

  const handleOpen = (section?: DrawerSection) => {
    if (!section) return
    onOpenDetailDrawer?.(task, section)
  }

  return (
    <PlanningChipBand
      overflowItems={hiddenChips.map((chip) => ({ key: chip.key, label: chip.label }))}
      actions={(
        <>
          {showObstacleAction ? (
            <QuickBlockageInlineAction
              task={task}
              onFallback={() => onOpenObstacleDialog(task)}
              onQuickAddObstacle={onQuickAddObstacle}
            />
          ) : null}

          {showConditionAction ? (
            <ConditionInlineAction
              task={task}
              onOpenConditionDialog={onOpenConditionDialog}
            />
          ) : null}
        </>
      )}
    >
      {visibleChip?.kind === 'acceptance' ? (
        <AcceptanceImpactChip
          items={acceptanceImpactItems}
          maxVisible={1}
          onOpenDrawer={() => handleOpen('acceptance')}
          className="max-w-[7.5rem] shrink-0"
        />
      ) : visibleChip?.key === 'blockages' ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button unstyled
              type="button"
              className={cn(
                'inline-flex h-5 max-w-[7.5rem] shrink-0 items-center gap-1 truncate rounded-md border px-1.5 text-xs font-medium transition-colors',
                visibleChip.className,
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {visibleChip.icon}
              <span className="truncate">{visibleChip.label}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            className="w-80 p-0"
            data-testid="task-blockage-chip-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <BlockageListPopover
              items={visibleObstacles.map((obstacle) => ({
                id: obstacle.id,
                title: obstacle.title,
                description: obstacle.description,
                expectedResolutionDate: obstacle.expected_resolution_date,
              }))}
              totalCount={obstacleCount}
              onOpenDrawer={() => handleOpen('blockages')}
            />
          </PopoverContent>
        </Popover>
      ) : visibleChip?.key === 'conditions' ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button unstyled
              type="button"
              className={cn(
                'inline-flex h-5 max-w-[7.5rem] shrink-0 items-center gap-1 truncate rounded-md border px-1.5 text-xs font-medium transition-colors',
                visibleChip.className,
              )}
              onClick={(event) => event.stopPropagation()}
            >
              {visibleChip.icon}
              <span className="truncate">{visibleChip.label}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            className="w-80 p-0"
            data-testid="task-condition-chip-popover"
            onClick={(event) => event.stopPropagation()}
          >
            <ConditionListPopover
              className="border-0 shadow-none"
              conditions={inlineConditionItems}
              onToggleSatisfied={canEdit && onToggleCondition
                ? (conditionId) => {
                  const condition = conditions.find((item) => item.id === conditionId)
                  if (condition && !isHardCondition(condition)) onToggleCondition(condition)
                }
                : undefined}
              onAddCondition={canEdit ? () => onOpenConditionDialog(task) : undefined}
              onOpenDrawer={() => handleOpen('conditions')}
            />
          </PopoverContent>
        </Popover>
      ) : visibleChip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button unstyled
              type="button"
              className={cn(
                'inline-flex h-5 max-w-[7.5rem] shrink-0 items-center gap-1 truncate rounded-md border px-1.5 text-xs font-medium transition-colors',
                visibleChip.className,
              )}
              onClick={(event) => {
                event.stopPropagation()
                handleOpen(visibleChip.section)
              }}
            >
              {visibleChip.icon}
              <span className="truncate">{visibleChip.label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {visibleChip.tooltip}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </PlanningChipBand>
  )
}

function QuickBlockageInlineAction({
  task,
  onFallback,
  onQuickAddObstacle,
}: {
  task: Task
  onFallback: () => void
  onQuickAddObstacle?: (task: Task, data: QuickBlockageDraft) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!onQuickAddObstacle) {
    return (
      <Button unstyled
        type="button"
        className="h-5 shrink-0 rounded-md px-1 text-xs font-medium text-slate-600 outline-none transition-colors hover:bg-amber-50 hover:text-amber-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
        onClick={(event) => {
          event.stopPropagation()
          onFallback()
        }}
      >
        +阻碍
      </Button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button unstyled
          type="button"
          data-testid={`task-inline-add-blockage-${task.id}`}
          className="h-5 shrink-0 rounded-md px-1 text-xs font-medium text-slate-600 outline-none transition-colors hover:bg-amber-50 hover:text-amber-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          onClick={(event) => event.stopPropagation()}
        >
          +阻碍
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-80 p-0"
        data-testid="task-inline-blockage-popover"
        onClick={(event) => event.stopPropagation()}
        aria-busy={submitting}
      >
        <QuickBlockageForm
          className="border-0 shadow-none"
          onCancel={() => setOpen(false)}
          onSubmit={(data) => {
            setSubmitting(true)
            void Promise.resolve(onQuickAddObstacle(task, data))
              .then(() => setOpen(false))
              .catch(() => undefined)
              .finally(() => setSubmitting(false))
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function ConditionInlineAction({
  task,
  onOpenConditionDialog,
}: {
  task: Task
  onOpenConditionDialog: (task: Task) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button unstyled
          type="button"
          data-testid={`task-inline-add-condition-${task.id}`}
          className="h-5 shrink-0 rounded-md px-1 text-xs font-medium text-slate-600 outline-none transition-colors hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          onClick={(event) => event.stopPropagation()}
        >
          +条件
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-80 p-0"
        data-testid="task-inline-condition-popover"
        onClick={(event) => event.stopPropagation()}
      >
        <ConditionListPopover
          className="border-0 shadow-none"
          conditions={[]}
          onAddCondition={() => {
            setOpen(false)
            onOpenConditionDialog(task)
          }}
          onOpenDrawer={() => {
            setOpen(false)
            onOpenConditionDialog(task)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function usePreservedRealtimeDraft(normalized: string) {
  const [draft, setDraft] = useState(normalized)
  const lastNormalizedRef = useRef(normalized)

  useEffect(() => {
    setDraft((current) => {
      const previousNormalized = lastNormalizedRef.current
      lastNormalizedRef.current = normalized
      return current === previousNormalized ? normalized : current
    })
  }, [normalized])

  return [draft, setDraft] as const
}

export function TaskDateCell({
  label,
  value,
  readOnly,
  onSave,
}: {
  label: string
  value?: string | null
  readOnly?: boolean
  onSave: (value: string) => void | Promise<void>
}) {
  const normalized = normalizeDateInput(value)
  const [draft, setDraft] = usePreservedRealtimeDraft(normalized)
  const dirty = draft !== normalized
  const saveDraft = () => {
    if (!dirty || !draft) return
    void onSave(draft)
  }
  if (readOnly) {
    return (
      <div
        aria-label={label}
        className="flex h-8 min-w-0 items-center justify-end rounded-md border border-slate-100 bg-slate-50 px-2 text-xs text-slate-600 num-mono"
      >
        <span className="truncate">{normalized || '-'}</span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        type="date"
        aria-label={label}
        value={draft}
        className="h-8 min-w-0 border-slate-200 bg-white px-2 text-right text-xs num-mono"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') saveDraft()
          if (event.key === 'Escape') setDraft(normalized)
        }}
      />
      {dirty ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 rounded-md text-blue-600 hover:bg-blue-50"
          aria-label={`保存 ${label}`}
          disabled={!draft}
          onClick={(event) => {
            event.stopPropagation()
            saveDraft()
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

export function TaskAssigneeCell({
  label,
  valueName,
  valueUserId,
  members,
  readOnly,
  onSave,
}: {
  label: string
  valueName?: string | null
  valueUserId?: string | null
  members: AssigneeComboboxOption[]
  readOnly?: boolean
  onSave: (value: AssigneeComboboxValue) => void | Promise<void>
}) {
  const normalizedName = valueName?.trim() ?? ''
  const normalizedUserId = valueUserId ?? null
  const normalizedKey = `${normalizedName}\u0000${normalizedUserId ?? ''}`
  const [draft, setDraft] = useState<AssigneeComboboxValue>({
    assignee_name: normalizedName,
    assignee_user_id: normalizedUserId,
  })
  const lastNormalizedRef = useRef(normalizedKey)

  useEffect(() => {
    setDraft((current) => {
      const previousKey = lastNormalizedRef.current
      lastNormalizedRef.current = normalizedKey
      const currentKey = `${current.assignee_name.trim()}\u0000${current.assignee_user_id ?? ''}`
      return currentKey === previousKey
        ? { assignee_name: normalizedName, assignee_user_id: normalizedUserId }
        : current
    })
  }, [normalizedKey, normalizedName, normalizedUserId])

  const draftKey = `${draft.assignee_name.trim()}\u0000${draft.assignee_user_id ?? ''}`
  const dirty = draftKey !== normalizedKey
  const saveDraft = () => {
    if (!dirty) return
    void onSave({
      assignee_name: draft.assignee_name.trim(),
      assignee_user_id: draft.assignee_user_id,
    })
  }

  if (readOnly) {
    return (
      <div
        aria-label={label}
        className="flex h-8 min-w-0 items-center rounded-md border border-slate-100 bg-slate-50 px-2 text-xs text-slate-600"
      >
        <span className="truncate">{normalizedName || '未分配'}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <AssigneeCombobox
        members={members}
        valueName={draft.assignee_name}
        valueUserId={draft.assignee_user_id}
        placeholder="未分配"
        testId="task-row-assignee-combobox"
        className="h-8 min-w-0 border-slate-200 bg-white px-2 text-xs"
        onChange={setDraft}
      />
      {dirty ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 rounded-md text-blue-600 hover:bg-blue-50"
          aria-label={`保存 ${label}`}
          onClick={(event) => {
            event.stopPropagation()
            saveDraft()
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}

export function TaskParticipantUnitCell({
  label,
  valueId,
  valueLabel,
  options,
  loading,
  readOnly,
  onLoadOptions,
  onOpenCreate,
  onSave,
}: {
  label: string
  valueId?: string | null
  valueLabel?: string | null
  options: ParticipantUnitLookupOption[]
  loading?: boolean
  readOnly?: boolean
  onLoadOptions?: () => void
  onOpenCreate?: (query?: string) => void
  onSave: (unitId: string | null, option?: ParticipantUnitLookupOption | null) => void | Promise<void>
}) {
  const normalizedUnitId = valueId ?? null
  const normalizedLabel = valueLabel?.trim() ?? ''
  const [open, setOpen] = useState(false)
  const [draftUnitId, setDraftUnitId] = useState<string | null>(normalizedUnitId)
  const selectedOption = options.find((option) => option.id === draftUnitId) ?? null

  useEffect(() => {
    setDraftUnitId(normalizedUnitId)
  }, [normalizedUnitId])

  const dirty = draftUnitId !== normalizedUnitId
  const displayLabel = options.find((option) => option.id === normalizedUnitId)?.unitName || normalizedLabel || '未分配'
  const saveDraft = () => {
    if (!dirty || readOnly) return
    void onSave(draftUnitId, selectedOption)
    setOpen(false)
  }

  if (readOnly) {
    return (
      <div
        aria-label={label}
        className="flex h-8 min-w-0 items-center rounded-md border border-slate-100 bg-slate-50 px-2 text-xs text-slate-600"
      >
        <span className="truncate">{displayLabel}</span>
      </div>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (nextOpen) onLoadOptions?.()
      }}
    >
      <PopoverTrigger asChild>
        <Button unstyled
          type="button"
          aria-label={label}
          className="flex h-8 min-w-0 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-2 text-left text-xs text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end" onClick={(event) => event.stopPropagation()}>
        <ParticipantUnitLookup
          valueId={draftUnitId}
          options={options}
          disabled={loading}
          canCreate={Boolean(onOpenCreate)}
          className="rounded-lg border-0 p-0 shadow-none"
          onChange={(unitId) => setDraftUnitId(unitId)}
          onCreate={(query) => {
            setOpen(false)
            onOpenCreate?.(query)
          }}
        />
        {loading ? <p className="px-1 py-2 text-xs text-slate-500">正在加载责任单位...</p> : null}
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-slate-500"
            onClick={() => setDraftUnitId(null)}
          >
            清空
          </Button>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={!dirty || loading} onClick={saveDraft}>
              保存
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function TaskProgressCell({
  taskId,
  taskTitle,
  value,
  readOnly,
  readOnlyReason,
  onSave,
}: {
  taskId: string
  taskTitle: string
  value: number
  readOnly?: boolean
  readOnlyReason?: string | null
  onSave: (taskId: string, value: number) => void | Promise<void>
}) {
  const normalized = clampProgress(value)
  const [draft, setDraft] = usePreservedRealtimeDraft(String(normalized))
  const draftProgress = clampProgress(Number(draft))
  const dirty = draftProgress !== normalized
  const isReadOnly = Boolean(readOnlyReason || readOnly)
  const effectiveReadOnlyReason = readOnlyReason || '当前无编辑权限'
  const saveDraft = () => {
    if (!dirty || isReadOnly) return
    setDraft(String(draftProgress))
    void onSave(taskId, draftProgress)
  }
  const input = (
    <Input
      type="number"
      min={0}
      max={100}
      value={draft}
      aria-label={isReadOnly ? `查看 ${taskTitle} 进度` : `更新 ${taskTitle} 进度`}
      disabled={isReadOnly}
      className={cn(
        'h-8 w-16 border-slate-200 bg-white text-right text-sm num-mono',
        isReadOnly && 'cursor-not-allowed bg-slate-50 text-slate-500',
      )}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        if (!isReadOnly) setDraft(event.currentTarget.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') saveDraft()
        if (event.key === 'Escape') setDraft(String(normalized))
      }}
    />
  )

  return (
    <div className="flex items-center justify-end gap-1">
      {isReadOnly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{input}</div>
          </TooltipTrigger>
          <TooltipContent>{effectiveReadOnlyReason}</TooltipContent>
        </Tooltip>
      ) : input}
      {dirty && !isReadOnly ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 rounded-md text-blue-600 hover:bg-blue-50"
          aria-label={`保存 ${taskTitle} 进度`}
          onClick={(event) => {
            event.stopPropagation()
            saveDraft()
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
