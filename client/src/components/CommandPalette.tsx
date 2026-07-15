import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  CornerDownLeft,
  Plus,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { COMPANY_NAVIGATION, PROJECT_NAVIGATION } from '@/config/navigation'
import { useCurrentCompanyRole } from '@/hooks/useCurrentCompanyRole'
import { toast } from '@/hooks/use-toast'
import { useStore } from '@/hooks/useStore'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CommandItem {
  id: string
  group: string
  label: string
  hint: string
  icon: LucideIcon
  keywords: string
  href?: string
  action: () => void
}

const QUICK_ACTION_GROUP = '快速操作'
const NAVIGATION_GROUP = '导航'

function resolveProjectHref(href: string, projectId: string) {
  return href.replace(':id', projectId)
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

function shortcutLabel() {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
    return '⌘K'
  }
  return 'Ctrl+K'
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const currentCompanyRole = useCurrentCompanyRole()
  const { currentProject } = useStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const currentProjectId = currentProject?.id

  const commands = useMemo<CommandItem[]>(() => {
    const navigationCommands: CommandItem[] = COMPANY_NAVIGATION.map((item) => {
      if (item.key === 'company' && currentCompanyRole !== 'company_admin') {
        return null
      }
      const href = item.href
      return {
        id: `company-${item.key}`,
        group: NAVIGATION_GROUP,
        label: `前往 ${item.label}`,
        hint: item.key === 'company' ? 'Company' : 'Notifications',
        icon: item.icon,
        keywords: `${item.label} ${item.key}`,
        href,
        action: () => navigate(href),
      }
    }).filter(Boolean) as CommandItem[]

    if (currentProjectId) {
      PROJECT_NAVIGATION.forEach((item) => {
        const href = resolveProjectHref(item.href, currentProjectId)
        navigationCommands.push({
          id: `project-${item.key}`,
          group: NAVIGATION_GROUP,
          label: `前往 ${item.label}`,
          hint: item.key,
          icon: item.icon,
          keywords: `${item.label} ${item.key}`,
          href,
          action: () => navigate(href),
        })

        item.children?.forEach((child) => {
          const childHref = resolveProjectHref(child.href, currentProjectId)
          navigationCommands.push({
            id: `project-${child.key}`,
            group: NAVIGATION_GROUP,
            label: `前往 ${child.label}`,
            hint: child.key,
            icon: item.icon,
            keywords: `${child.label} ${child.key} ${item.label}`,
            href: childHref,
            action: () => navigate(childHref),
          })
        })
      })
    }

    const showPlaceholder = (label: string) => {
      toast({
        title: label,
        description: '快捷入口已预留，后续接入对应业务弹窗。',
      })
    }

    return [
      ...navigationCommands,
      {
        id: 'quick-new-task',
        group: QUICK_ACTION_GROUP,
        label: '新建任务',
        hint: 'N',
        icon: Plus,
        keywords: '新建任务 task add create',
        action: () => showPlaceholder('新建任务'),
      },
      {
        id: 'quick-team',
        group: QUICK_ACTION_GROUP,
        label: '邀请成员',
        hint: 'I',
        icon: Users,
        keywords: '邀请成员 团队 team invite',
        action: () => showPlaceholder('邀请成员'),
      },
      {
        id: 'quick-settings',
        group: QUICK_ACTION_GROUP,
        label: '系统设置',
        hint: 'S',
        icon: Settings,
        keywords: '系统设置 settings preferences',
        action: () => navigate('/settings/billing'),
      },
    ]
  }, [currentCompanyRole, currentProjectId, navigate])

  const filteredCommands = useMemo(() => {
    const term = normalizeSearch(query)
    if (!term) return commands
    return commands.filter((item) => normalizeSearch(`${item.label} ${item.hint} ${item.keywords}`).includes(term))
  }, [commands, query])

  const groupedCommands = useMemo(() => {
    return [NAVIGATION_GROUP, QUICK_ACTION_GROUP]
      .map((group) => ({
        group,
        items: filteredCommands
          .map((item, index) => ({ ...item, index }))
          .filter((item) => item.group === group),
      }))
      .filter((group) => group.items.length > 0)
  }, [filteredCommands])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(focusTimer)
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open || filteredCommands.length === 0) return
    if (activeIndex > filteredCommands.length - 1) {
      setActiveIndex(filteredCommands.length - 1)
    }
  }, [activeIndex, filteredCommands.length, open])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(false)
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((current) => (filteredCommands.length === 0 ? 0 : (current + 1) % filteredCommands.length))
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((current) => (filteredCommands.length === 0 ? 0 : (current - 1 + filteredCommands.length) % filteredCommands.length))
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        const command = filteredCommands[activeIndex]
        if (!command) return
        command.action()
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeIndex, filteredCommands, onOpenChange, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[16vh] command-palette-overlay-in"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      onMouseDown={() => onOpenChange(false)}
    >
      <div className="absolute inset-0 bg-slate-950/30 backdrop-blur-[3px]" />
      <div
        className="command-palette-panel-in relative w-full max-w-[560px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.25)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center gap-3 border-b border-slate-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索命令"
            data-testid="command-palette-search"
            placeholder="搜索任务、项目、成员..."
            className="command-input-text h-full min-w-0 flex-1 border-0 bg-transparent text-slate-800 outline-none placeholder:text-slate-400"
          />
          <kbd className="badge-micro num-mono rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto py-1.5">
          {filteredCommands.length === 0 ? (
            <div className="command-item-text px-4 py-8 text-center text-slate-400">没有匹配项</div>
          ) : (
            groupedCommands.map(({ group, items }) => (
              <div key={group} className="px-1.5 pb-1">
                <div className="eyebrow px-3 pb-1 pt-2">{group}</div>
                {items.map((item) => {
                  const Icon = item.icon
                  const isActive = item.index === activeIndex
                  const isCurrent = Boolean(item.href && location.pathname === item.href)
                  return (
                    <Button unstyled
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(item.index)}
                      onClick={() => {
                        item.action()
                        onOpenChange(false)
                      }}
                      className={cn(
                        'command-item-text group flex h-9 w-full items-center gap-2.5 rounded-lg px-3 transition-colors duration-150',
                        isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={1.7} />
                      <span className="min-w-0 flex-1 truncate text-left font-medium">{item.label}</span>
                      {isCurrent ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="当前页面" /> : null}
                      <span className="eyebrow num-mono">{item.hint}</span>
                      <CornerDownLeft
                        className={cn('h-3 w-3 transition-opacity duration-150', isActive ? 'text-slate-500 opacity-100' : 'text-slate-300 opacity-0')}
                        strokeWidth={1.7}
                      />
                    </Button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="badge-micro flex h-9 items-center justify-between border-t border-slate-100 bg-slate-50/70 px-4 text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="num-mono rounded border border-slate-200 bg-white px-1">↑</kbd>
              <kbd className="num-mono rounded border border-slate-200 bg-white px-1">↓</kbd>
              选择
            </span>
            <span className="flex items-center gap-1">
              <kbd className="num-mono rounded border border-slate-200 bg-white px-1">↵</kbd>
              打开
            </span>
            <span className="flex items-center gap-1">
              <kbd className="num-mono rounded border border-slate-200 bg-white px-1">ESC</kbd>
              关闭
            </span>
          </div>
          <span className="num-mono">{shortcutLabel()}</span>
        </div>
      </div>
    </div>
  )
}
