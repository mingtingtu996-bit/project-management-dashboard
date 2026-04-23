import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { Keyboard } from 'lucide-react'

export interface PlanningShortcut {
  key: string
  description: string
  action: () => void
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

interface KeyboardShortcutsProps {
  shortcuts: PlanningShortcut[]
  enabled?: boolean
  label?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function KeyboardShortcuts({
  shortcuts,
  enabled = true,
  label = '快捷键',
  open: controlledOpen,
  onOpenChange,
}: KeyboardShortcutsProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)

  useKeyboardShortcuts(shortcuts, enabled)

  const shortcutRows = useMemo(
    () =>
      shortcuts.map((shortcut) => ({
        key: [shortcut.ctrlKey ? 'Ctrl' : null, shortcut.shiftKey ? 'Shift' : null, shortcut.altKey ? 'Alt' : null, shortcut.key]
          .filter(Boolean)
          .join(' + '),
        description: shortcut.description,
      })),
    [shortcuts]
  )

  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
        data-testid="planning-keyboard-shortcuts"
      >
        <Keyboard className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>计划编制快捷键</DialogTitle>
            <DialogDescription>这些快捷键只作用于计划编制工作台。</DialogDescription>
          </DialogHeader>
          <Card>
            <CardContent className="space-y-3 pt-4">
              {shortcutRows.map((shortcut) => (
                <div key={shortcut.key} className="flex items-center justify-between gap-4">
                  <kbd className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm text-slate-700">
                    {shortcut.key}
                  </kbd>
                  <span className="text-sm text-slate-600">{shortcut.description}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>
    </>
  )
}
