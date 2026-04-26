import { useEffect, useMemo, useState } from 'react'

import { Check, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type AssigneeComboboxOption = {
  userId: string
  displayName: string
  permissionLevel?: string | null
}

export type AssigneeComboboxValue = {
  assignee_name: string
  assignee_user_id: string | null
}

interface AssigneeComboboxProps {
  members: AssigneeComboboxOption[]
  valueName: string
  valueUserId: string | null
  placeholder?: string
  testId?: string
  onChange: (value: AssigneeComboboxValue) => void
}

export function AssigneeCombobox({
  members,
  valueName,
  valueUserId,
  placeholder = '输入责任人或搜索项目成员',
  testId = 'gantt-assignee-combobox',
  onChange,
}: AssigneeComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(valueName)

  useEffect(() => {
    setQuery(valueName)
  }, [valueName])

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return members
    }

    return members.filter((member) => {
      const haystack = [
        member.displayName,
        member.userId,
        member.permissionLevel,
      ]
        .filter((value): value is string => Boolean(value))
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalized)
    })
  }, [members, query])

  const handleType = (nextValue: string) => {
    setQuery(nextValue)
    onChange({
      assignee_name: nextValue,
      assignee_user_id: null,
    })
    setOpen(true)
  }

  const handleSelectMember = (member: AssigneeComboboxOption) => {
    setQuery(member.displayName)
    onChange({
      assignee_name: member.displayName,
      assignee_user_id: member.userId,
    })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          data-testid={testId}
          value={query}
          onChange={(event) => handleType(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </PopoverAnchor>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="border-b px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            <span>可搜索项目成员，也可直接保留自由文本责任人。</span>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filteredMembers.length > 0 ? (
            filteredMembers.map((member) => {
              const selected = valueUserId === member.userId
              return (
                <button
                  key={member.userId}
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50',
                    selected && 'bg-blue-50 text-blue-700',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelectMember(member)}
                  data-testid={`gantt-assignee-option-${member.userId}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{member.displayName}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {member.userId}
                      {member.permissionLevel ? ` · ${member.permissionLevel}` : ''}
                    </div>
                  </div>
                  {selected && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                </button>
              )
            })
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              没有匹配的项目成员，当前输入会按自由文本责任人保存。
            </div>
          )}
        </div>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          直接输入即可保存外部责任人；选中成员后会自动关联账号。
        </div>
      </PopoverContent>
    </Popover>
  )
}
