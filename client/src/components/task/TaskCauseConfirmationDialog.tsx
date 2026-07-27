import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { getApiErrorMessage } from '@/lib/apiClient'
import {
  confirmTaskCause,
  listCauseTaxonomy,
} from '@/services/causeAttributionApi'
import type { CauseAttributionRecord, StructuredCauseTaxonomyEntry } from '@/domain/structuredCauseTaxonomy'

type TaskCauseConfirmationDialogProps = {
  open: boolean
  projectId: string
  task: {
    id: string
    title: string
    rawText: string
  } | null
  onOpenChange: (open: boolean) => void
  onConfirmed: (attribution: CauseAttributionRecord) => void
}

export function TaskCauseConfirmationDialog({
  open,
  projectId,
  task,
  onOpenChange,
  onConfirmed,
}: TaskCauseConfirmationDialogProps) {
  const [entries, setEntries] = useState<StructuredCauseTaxonomyEntry[]>([])
  const [causeCode, setCauseCode] = useState('')
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(false)
  const [taxonomyLoaded, setTaxonomyLoaded] = useState(false)
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return

    let active = true
    setCauseCode('')
    setEntries([])
    setTaxonomyLoaded(false)
    setTaxonomyError(null)
    setLoadingTaxonomy(true)

    void listCauseTaxonomy()
      .then((response) => {
        if (active) setEntries(response.entries)
      })
      .catch((error) => {
        if (!active) return
        const message = getApiErrorMessage(error, '无法加载延误原因分类')
        setTaxonomyError(message)
        toast({
          title: '加载失败',
          description: message,
          variant: 'destructive',
        })
      })
      .finally(() => {
        if (active) {
          setLoadingTaxonomy(false)
          setTaxonomyLoaded(true)
        }
      })

    return () => {
      active = false
    }
  }, [open])

  const submitDisabled = !task || !causeCode || !task.rawText || loadingTaxonomy || submitting || Boolean(taxonomyError)

  const handleSubmit = async () => {
    if (submitDisabled || !task) return

    setSubmitting(true)
    try {
      const attribution = await confirmTaskCause({
        projectId,
        taskId: task.id,
        causeCode,
        causeRole: 'primary',
        eventType: 'delay',
        rawText: task.rawText,
      })
      toast({ title: '延误原因已确认' })
      onConfirmed(attribution)
      onOpenChange(false)
    } catch (error) {
      toast({
        title: '确认失败',
        description: getApiErrorMessage(error, '无法确认延误原因'),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[var(--dialog-md-width)] border-slate-200">
        <DialogHeader>
          <DialogTitle>确认延误原因</DialogTitle>
          <DialogDescription>{task?.title || '任务'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-cause-code">延误原因分类</Label>
            <Select value={causeCode} onValueChange={setCauseCode} disabled={loadingTaxonomy || Boolean(taxonomyError) || submitting}>
              <SelectTrigger id="task-cause-code" aria-label="延误原因分类" aria-required="true">
                <SelectValue placeholder={loadingTaxonomy ? '正在加载分类...' : '请选择原因分类'} />
              </SelectTrigger>
              <SelectContent align="start" side="bottom">
                {entries.map((entry) => (
                  <SelectItem key={entry.code} value={entry.code}>{entry.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {taxonomyLoaded && !taxonomyError && entries.length === 0 ? (
            <p role="status" className="text-sm text-slate-500">暂无可用的延误原因分类</p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="task-cause-raw-text">原始说明</Label>
            <textarea
              id="task-cause-raw-text"
              aria-required="true"
              readOnly
              value={task?.rawText ?? ''}
              className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            />
          </div>
          {taxonomyError ? <p role="alert" className="text-sm text-red-600">{taxonomyError}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={submitDisabled} loading={submitting}>确认原因</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
