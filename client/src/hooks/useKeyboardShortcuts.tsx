// 键盘快捷键 Hook
import { PROJECT_NAVIGATION_LABELS } from '@/config/navigation'
import { useEffect, useCallback } from 'react'

interface Shortcut {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  action: () => void
  description: string
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return
    if (typeof event.key !== 'string' || event.key.length === 0) return

    // 如果用户正在输入，不触发导航/非搜索快捷键
    // 但 Ctrl+K / Ctrl+F 应该仍可触发（聚焦搜索框）
    const target = event.target as HTMLElement
    const isTyping = (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    )

    for (const shortcut of shortcuts) {
      // 跳过无效快捷键
      if (!shortcut?.key) continue

      const eventKey = event.key.toLowerCase()
      const shortcutKey = typeof shortcut.key === 'string' ? shortcut.key.toLowerCase() : ''
      if (!shortcutKey) continue

      const keyMatch = eventKey === shortcutKey
      const ctrlMatch = shortcut.ctrlKey ? (event.ctrlKey || event.metaKey) : !(event.ctrlKey || event.metaKey)
      const shiftMatch = shortcut.shiftKey ? event.shiftKey : !event.shiftKey
      const altMatch = shortcut.altKey ? event.altKey : !event.altKey

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        // Ctrl 组合键在输入框中也允许（比如 Ctrl+K 聚焦搜索）
        // 非 Ctrl 组合键在输入状态下跳过
        if (isTyping && !shortcut.ctrlKey) continue

        event.preventDefault()
        shortcut.action()
        return
      }
    }
  }, [shortcuts, enabled])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}

// 常用快捷键配置
export const DEFAULT_SHORTCUTS = [
  { key: 'n', action: () => {}, description: '新建任务' },
  { key: 's', ctrlKey: true, action: () => {}, description: '保存' },
  { key: 'Escape', action: () => {}, description: '关闭对话框' },
  { key: '?', shiftKey: true, action: () => {}, description: '显示快捷键帮助' },
]

// 快捷键帮助对话框
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'

interface ShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  const shortcuts = [
    { key: 'Ctrl + K', description: '聚焦搜索框' },
    { key: 'Ctrl + F', description: '聚焦搜索框' },
    { key: 'Ctrl + 1', description: `跳转：${PROJECT_NAVIGATION_LABELS.dashboard}` },
    { key: 'Ctrl + 2', description: `跳转：${PROJECT_NAVIGATION_LABELS.milestones}` },
    { key: 'Ctrl + 3', description: `跳转：${PROJECT_NAVIGATION_LABELS.tasks}` },
    { key: 'Ctrl + 4', description: `跳转：${PROJECT_NAVIGATION_LABELS.risks}` },
    { key: 'Ctrl + 5', description: `跳转：${PROJECT_NAVIGATION_LABELS.preMilestones}` },
    { key: 'Ctrl + 6', description: `跳转：${PROJECT_NAVIGATION_LABELS.taskSummary}` },
    { key: 'Ctrl + 7', description: `跳转：${PROJECT_NAVIGATION_LABELS.notifications}` },
    { key: 'Escape', description: '关闭对话框 / 取消' },
    { key: '?', description: '显示快捷键帮助面板' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>键盘快捷键</DialogTitle>
          <DialogDescription>查看当前应用支持的常用快捷键与导航组合。</DialogDescription>
        </DialogHeader>
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {shortcuts.map((shortcut) => (
                <div key={shortcut.key} className="flex items-center justify-between">
                  <kbd className="px-2 py-1 bg-muted rounded text-sm font-mono">
                    {shortcut.key}
                  </kbd>
                  <span className="text-muted-foreground text-sm">{shortcut.description}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}

