import { useEffect, useRef, useState } from 'react'
import { saveWizardProjectDraft } from './projectWizardApi'
import type { WizardDraftPayload } from './types'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'

interface Props {
  draft: WizardDraftPayload
  projectId: string | null
  onSaved?: (payload: { projectId: string; lastSaved: string }) => void
  disabled?: boolean
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function WizardAutoSaveIndicator({ draft, projectId, onSaved, disabled = false }: Props) {
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [state, setState] = useState<SaveState>('idle')
  const requestSeq = useRef(0)

  useEffect(() => {
    if (disabled || !projectId) {
      setState('idle')
      return undefined
    }

    const timer = window.setTimeout(async () => {
      const seq = requestSeq.current + 1
      requestSeq.current = seq
      setState('saving')

      try {
        const result = await saveWizardProjectDraft(projectId, draft, draft.step)
        if (requestSeq.current !== seq) return
        setLastSaved(new Date(result.lastSaved).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }))
        setState('saved')
        onSaved?.({ projectId, lastSaved: result.lastSaved })
      } catch (error) {
        if (requestSeq.current !== seq) return
        setState('error')
        console.error('[ProjectInfoModule] 自动保存草稿失败', error)
      }
    }, 2000)

    return () => window.clearTimeout(timer)
  }, [disabled, draft, onSaved, projectId])

  if (state === 'idle') return null

  const iconKey = state === 'saving'
    ? 'generating'
    : state === 'error'
      ? 'autosave_error'
      : 'wizard_complete'
  const Icon = getWizardScopeIcon(iconKey)
  const label = state === 'saving'
    ? '保存中'
    : state === 'error'
      ? '服务端保存失败'
      : `已保存 ${lastSaved ?? ''}`

  return (
    <span className={`text-xs flex items-center gap-1 tabular-nums ${
      state === 'error' ? 'text-rose-600' : 'text-slate-500'
    }`}>
      <Icon
        className={`h-3 w-3 ${state === 'saving' ? 'animate-spin' : ''}`}
        data-testid={wizardIconTestId(iconKey)}
      />
      {label}
    </span>
  )
}
