// v1.4.22.1 §10.7b: Reconcile banner for governance preview in PlanningTreeView
import { AlertTriangle, ArrowUp, ArrowDown, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type ReconcilePhase = 'match' | 'add' | 'rename_suggest' | 'orphan'

export interface ReconcileTaskEntry {
  taskId: string
  title: string
  wbsCode?: string | null
  phase: ReconcilePhase
  suggestedTitle?: string
  similarity?: number
  reason: string
}

// Phase → visual mapping
const PHASE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  match: { bg: 'bg-white', border: 'border-slate-200', text: 'text-slate-900' },
  add: { bg: 'bg-emerald-50', border: 'border-l-4 border-emerald-500', text: 'text-emerald-900' },
  rename_suggest: { bg: 'bg-amber-50', border: 'border-l-4 border-amber-500', text: 'text-amber-900' },
  orphan: { bg: 'bg-slate-50', border: 'border-slate-300', text: 'text-slate-500' },
}

const PHASE_SUMMARY: Record<string, string> = {
  match: '匹配',
  add: '新增',
  rename_suggest: '建议更名',
  orphan: '孤立',
}

interface Props {
  entries: ReconcileTaskEntry[]
  currentConflictIndex: number
  onPrevConflict: () => void
  onNextConflict: () => void
  onAccept: () => void
  onCancel: () => void
  onEntryAction: (taskId: string, action: 'merge_to_standard' | 'keep_both' | 'replace_with_standard') => void
}

export function ReconcileBanner({
  entries, currentConflictIndex, onPrevConflict, onNextConflict,
  onAccept, onCancel, onEntryAction,
}: Props) {
  const summary = {
    match: entries.filter(e => e.phase === 'match').length,
    add: entries.filter(e => e.phase === 'add').length,
    rename_suggest: entries.filter(e => e.phase === 'rename_suggest').length,
    orphan: entries.filter(e => e.phase === 'orphan').length,
  }

  return (
    <div className="sticky top-0 z-20 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 space-y-3">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-slate-900">模板治理预览</span>
          <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
            {Object.entries(summary).map(([phase, count]) =>
              count > 0 ? (
                <span key={phase} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${
                    phase === 'match' ? 'bg-slate-400' : phase === 'add' ? 'bg-emerald-500' :
                    phase === 'rename_suggest' ? 'bg-amber-500' : 'bg-slate-300'
                  }`} />
                  {PHASE_SUMMARY[phase]} {count}
                </span>
              ) : null
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Conflict navigation */}
          {summary.rename_suggest > 0 && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Button unstyled onClick={onPrevConflict} className="p-1 hover:bg-amber-100 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
                <ArrowUp className="h-3 w-3" />
              </Button>
              <span className="tabular-nums">{currentConflictIndex + 1}/{summary.rename_suggest}</span>
              <Button unstyled onClick={onNextConflict} className="p-1 hover:bg-amber-100 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
          )}
          <Button unstyled onClick={onCancel} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-lg hover:bg-amber-100 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
            <X className="h-3 w-3" />
            取消治理
          </Button>
          <Button unstyled onClick={onAccept} className="inline-flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
            <Check className="h-3 w-3" />
            接受治理
          </Button>
        </div>
      </div>

      {/* Conflict detail (rename_suggest only) */}
      {summary.rename_suggest > 0 && entries.filter(e => e.phase === 'rename_suggest')[currentConflictIndex] && (
        (() => {
          const entry = entries.filter(e => e.phase === 'rename_suggest')[currentConflictIndex]
          return (
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-900">{entry.title}</p>
                  <p className="text-xs text-amber-600">建议更名为：{entry.suggestedTitle}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{entry.reason}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button unstyled onClick={() => onEntryAction(entry.taskId, 'merge_to_standard')}
                    className="text-xs text-blue-600 hover:text-blue-700 px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
                    合并到标准
                  </Button>
                  <Button unstyled onClick={() => onEntryAction(entry.taskId, 'keep_both')}
                    className="text-xs text-slate-600 hover:text-slate-700 px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
                    保留两份
                  </Button>
                  <Button unstyled onClick={() => onEntryAction(entry.taskId, 'replace_with_standard')}
                    className="text-xs text-amber-600 hover:text-amber-700 px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none">
                    替换为标准
                  </Button>
                </div>
              </div>
            </div>
          )
        })()
      )}
    </div>
  )
}

/** Get phase-based row style for use in PlanningTreeView */
export function getReconcileRowStyle(phase: string): { bg: string; border: string; text: string } {
  return PHASE_STYLES[phase] ?? PHASE_STYLES.match
}
