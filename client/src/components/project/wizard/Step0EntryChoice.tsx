// v1.4.22.1 §4.3.3: Step 0 entry choice (blank / template / copy)
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

interface Props {
  onSelectBlank: () => void
  onSelectTemplate: () => void
  onSelectCopy: () => void
}

const CARDS = [
  { iconKey: 'entry_blank', title: '从空白开始', desc: '按业态向导从头填写', time: '~10 分钟', action: 'onSelectBlank' },
  { iconKey: 'entry_template', title: '基于公司模板', desc: '已有模板可选', time: '~3 分钟', action: 'onSelectTemplate' },
  { iconKey: 'entry_copy', title: '基于已有项目复制', desc: '已有项目可参考', time: '~5 分钟', action: 'onSelectCopy' },
] as const

export function Step0EntryChoice({ onSelectBlank, onSelectTemplate, onSelectCopy }: Props) {
  const handlers = { onSelectBlank, onSelectTemplate, onSelectCopy }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">怎么开始这个项目？</h2>
      <div className="grid grid-cols-3 gap-4">
        {CARDS.map((card) => {
          const Icon = getWizardScopeIcon(card.iconKey)
          return (
            <Button unstyled
              key={card.title}
              onClick={handlers[card.action]}
              className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[var(--el-2)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
            >
              <Icon className="h-8 w-8 text-blue-600" data-testid={wizardIconTestId(card.iconKey)} />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
                <p className="mt-1 text-xs text-slate-500">{card.desc}</p>
                <p className="mt-0.5 text-xs text-slate-400">{card.time}</p>
              </div>
            </Button>
          )
        })}
      </div>
    </div>
  )
}
