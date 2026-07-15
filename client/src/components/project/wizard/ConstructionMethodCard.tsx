// v1.4.22.1 §7.0.6: Construction method cards with business-type filtering
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

export interface MethodOption { code: string; label: string; description: string }

export const METHOD_OPTIONS: MethodOption[] = [
  { code: 'cast_in_situ', label: '现浇钢筋混凝土', description: '主体 + BDT-04-01-01 标准层流水' },
  { code: 'steel_frame', label: '钢框架', description: 'china-steel-structure-specialty' },
  { code: 'precast_concrete', label: '装配式PC', description: 'china-prefabricated-assembly' },
  { code: 'modular_mic', label: '模块化MiC', description: 'MiC + 整体卫浴 + 集成厨房' },
]

// Business type → available methods + defaults
const METHOD_MATRIX: Record<string, { available: string[]; defaults: string[] }> = {
  general_civil: { available: ['cast_in_situ', 'precast_concrete', 'modular_mic'], defaults: ['cast_in_situ'] },
  hotel: { available: ['cast_in_situ', 'steel_frame'], defaults: ['cast_in_situ'] },
  hospital: { available: ['cast_in_situ', 'steel_frame'], defaults: ['cast_in_situ'] },
  school: { available: ['cast_in_situ', 'steel_frame'], defaults: ['cast_in_situ'] },
  industrial: { available: ['steel_frame', 'cast_in_situ'], defaults: ['steel_frame'] },
  data_center: { available: ['steel_frame'], defaults: ['steel_frame'] },
  transportation_hub: { available: ['steel_frame', 'cast_in_situ'], defaults: ['steel_frame'] },
  sports_culture: { available: ['steel_frame'], defaults: ['steel_frame'] },
  tod_upper_cover: { available: ['cast_in_situ', 'steel_frame'], defaults: ['cast_in_situ', 'steel_frame'] },
  renovation: { available: ['cast_in_situ'], defaults: ['cast_in_situ'] },
  modular_building: { available: ['modular_mic'], defaults: ['modular_mic'] },
}

interface Props {
  businessType: string | null
  selectedMethods: string[]
  onToggleMethod: (code: string) => void
}

export function ConstructionMethodCard({ businessType, selectedMethods, onToggleMethod }: Props) {
  const matrix = businessType ? METHOD_MATRIX[businessType] : null
  const available = matrix?.available ?? ['cast_in_situ', 'steel_frame', 'precast_concrete', 'modular_mic']
  const CompleteIcon = getWizardScopeIcon('wizard_complete')

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-slate-900">选择施工工法</h3>
      <div className="flex gap-4 flex-wrap">
        {METHOD_OPTIONS.map(m => {
          const isAvailable = available.includes(m.code)
          const isSelected = selectedMethods.includes(m.code)

          return (
            <Button unstyled
              key={m.code}
              aria-label={m.label}
              onClick={() => isAvailable && onToggleMethod(m.code)}
              disabled={!isAvailable}
              className={`relative flex flex-col items-start gap-1 p-3 rounded-xl border text-left w-[220px] transition-all ${
                !isAvailable
                  ? 'opacity-40 bg-slate-50 border-slate-200 cursor-not-allowed'
                  : isSelected
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-[var(--el-2)]'
              } focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none`}
              title={!isAvailable ? '该业态不适用此工法' : undefined}
            >
              {isSelected && <CompleteIcon className="absolute top-2 right-2 h-3.5 w-3.5 text-blue-600" data-testid={wizardIconTestId('wizard_complete')} />}
              <span className="text-sm font-semibold text-slate-900">{m.label}</span>
              <span className="text-xs text-slate-500 tabular-nums">{m.code}</span>
              <span className="text-xs text-slate-600">{m.description}</span>
            </Button>
          )
        })}
      </div>
      {businessType && (
        <p className="text-xs text-slate-400">
          默认工法：{(METHOD_MATRIX[businessType]?.defaults ?? ['cast_in_situ']).map(d => METHOD_OPTIONS.find(m => m.code === d)?.label ?? d).join(' + ')}
        </p>
      )}
    </div>
  )
}
