// v1.4.22.1 §7.0.12: Draft badge + popover on CompanyCockpit "新建项目" button
import { useState } from 'react'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

interface DraftItem {
  id: string
  name: string
  draftStep?: number | string | null
  updatedAt?: string | null
}

interface Props {
  draftCount: number
  drafts: DraftItem[]
  onResume: (projectId: string) => void
  onDelete: (projectId: string) => void
}

export function WizardDraftBadge({ draftCount, drafts, onResume, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const DraftIcon = getWizardScopeIcon('draft')

  if (draftCount === 0) return null

  return (
    <div className="relative">
      <Button unstyled
        onClick={() => setOpen(!open)}
        className="inline-flex h-11 items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 text-xs text-slate-500 hover:text-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
      >
        <DraftIcon className="h-3.5 w-3.5" data-testid={wizardIconTestId('draft')} />
        草稿 ({draftCount})
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="surface-card absolute right-0 top-full z-50 mt-2 w-72 space-y-2 p-3">
            <p className="text-xs font-semibold text-slate-700">未完成的草稿</p>
            {drafts.map(d => (
              <div key={d.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900 truncate">{d.name || '未命名项目'}</p>
                  <p className="text-xs text-slate-400 tabular-nums">步骤 {d.draftStep ?? 0}/6 · {d.updatedAt ?? '刚刚'}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button unstyled
                    onClick={() => { onResume(d.id); setOpen(false) }}
                    className="text-xs text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  >
                    恢复
                  </Button>
                  <Button unstyled
                    onClick={() => onDelete(d.id)}
                    className="text-xs text-rose-500 hover:text-rose-600 px-2 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                  >
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
