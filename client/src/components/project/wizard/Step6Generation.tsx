// v1.4.22.1 §7.7: Step 6 - detail level selector and company template save.
import { memo } from 'react'
import type { WizardDraftPayload } from './types'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

interface Props {
  draft: WizardDraftPayload
  projectId: string | null
  onGenerate: () => void
  onUpdate: (u: Partial<WizardDraftPayload>) => void
  generating?: boolean
  hideGenerateButton?: boolean
}

const DETAIL_LEVEL_OPTIONS = [
  { value: 'overview', title: '总览级', hint: '约 120 行，适合先进入主计划' },
  { value: 'standard', title: '标准级', hint: '约 400 行，适合项目经理日常维护' },
  { value: 'detailed', title: '精细级', hint: '约 1500 行，适合专项深化排期' },
] as const

function Step6GenerationComponent({
  draft,
  onUpdate,
  onGenerate,
  generating = false,
  hideGenerateButton = false,
}: Props) {
  const GenerationIcon = getWizardScopeIcon('generation')
  const GeneratingIcon = getWizardScopeIcon('generating')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">生成设置</h2>
        <p className="mt-1 text-sm text-slate-500">
          先选择任务展开颗粒度，再进入项目画像确认；真正生成任务在确认页完成。
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-sm font-medium text-slate-700">任务详细度</p>
        {DETAIL_LEVEL_OPTIONS.map((option) => (
          <Button unstyled
            key={option.value}
            type="button"
            onClick={() => onUpdate({ detailLevel: option.value })}
            className={`w-full rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
              (draft.detailLevel ?? 'overview') === option.value
                ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <span className="text-sm font-semibold text-slate-900">{option.title}</span>
            <span className="ml-2 text-xs text-slate-500 tabular-nums">{option.hint}</span>
          </Button>
        ))}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={draft.saveAsCompanyTemplate === true}
            onChange={(event) => onUpdate({ saveAsCompanyTemplate: event.target.checked })}
            className="rounded border-slate-300"
          />
          同时保存为公司项目模板，下次新建可复用
        </label>
        {draft.saveAsCompanyTemplate ? (
          <label className="block">
            <span className="text-xs font-medium text-slate-500">模板名称</span>
            <input
              type="text"
              value={draft.companyTemplateName ?? ''}
              onChange={(event) => onUpdate({ companyTemplateName: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
              placeholder={draft.projectName ? `${draft.projectName}模板` : '输入模板名称'}
            />
          </label>
        ) : null}
      </div>

      {!hideGenerateButton ? (
        <div className="flex justify-center pt-4">
          <Button unstyled
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none active:scale-[0.98]"
          >
            {generating ? (
              <GeneratingIcon className="h-4 w-4 animate-spin" data-testid={wizardIconTestId('generating')} />
            ) : (
              <GenerationIcon className="h-4 w-4" data-testid={wizardIconTestId('generation')} />
            )}
            {generating ? '正在生成' : '生成任务'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export const Step6Generation = memo(Step6GenerationComponent)
