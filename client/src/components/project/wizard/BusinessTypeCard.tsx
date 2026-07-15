// v1.4.22.1 §7.0.4-7.0.5: 12 business type cards (11 formal + 1 custom) + subtype cards
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

export interface BusinessTypeOption {
  code: string
  label: string
  iconName: string
  templateCount: number
  warningCount: number
  hasSubtypes: boolean
  isCustom?: boolean
  subtypes?: { code: string; label: string; description: string }[]
}

const BUSINESS_ICON_KEY_BY_NAME: Record<string, string> = {
  Building2: 'general_civil',
  Hotel: 'hotel',
  BadgePlus: 'hospital',
  GraduationCap: 'school',
  Factory: 'industrial',
  Server: 'data_center',
  TrainTrack: 'transportation_hub',
  Trophy: 'sports_culture',
  TramFront: 'tod_upper_cover',
  Wrench: 'renovation',
  Boxes: 'modular_building',
  PlusCircle: 'custom',
}

export const BUSINESS_TYPES: BusinessTypeOption[] = [
  { code: 'general_civil', label: '民用建筑', iconName: 'Building2', templateCount: 22, warningCount: 5, hasSubtypes: true,
    subtypes: [
      { code: 'civil_residential', label: '住宅', description: '强制带分户验收 + 住宅精装' },
      { code: 'civil_office_commercial', label: '商办', description: '含幕墙 + 商业泛光 + 公区精装' },
      { code: 'civil_complex', label: '综合体', description: '多业态接口 + 分期' },
    ] },
  { code: 'hotel', label: '酒店', iconName: 'Hotel', templateCount: 18, warningCount: 4, hasSubtypes: false },
  { code: 'hospital', label: '医院', iconName: 'BadgePlus', templateCount: 28, warningCount: 6, hasSubtypes: false },
  { code: 'school', label: '学校', iconName: 'GraduationCap', templateCount: 16, warningCount: 3, hasSubtypes: false },
  { code: 'industrial', label: '工业建筑', iconName: 'Factory', templateCount: 20, warningCount: 4, hasSubtypes: true,
    subtypes: [
      { code: 'industrial_general', label: '一般厂房', description: '主体 + 钢构' },
      { code: 'industrial_logistics', label: '物流仓储', description: 'AGV + 立体仓库' },
      { code: 'industrial_cleanroom', label: '工艺洁净', description: '加挂洁净室全套' },
      { code: 'industrial_heavy', label: '重型装备制造', description: '大型设备吊装、精密就位与负荷试验' },
    ] },
  { code: 'data_center', label: '数据中心', iconName: 'Server', templateCount: 16, warningCount: 4, hasSubtypes: false },
  { code: 'transportation_hub', label: '交通枢纽', iconName: 'TrainTrack', templateCount: 18, warningCount: 5, hasSubtypes: true,
    subtypes: [
      { code: 'transport_multimodal', label: '综合交通枢纽', description: '多方式换乘与综合运营移交' },
      { code: 'transport_railway_station', label: '铁路站房', description: '营业线接口与站台客运系统' },
      { code: 'transport_metro_interchange', label: '地铁换乘站', description: '既有线保护与夜间窗口改接' },
      { code: 'transport_bus_terminal', label: '汽车客运站', description: '发车场坪、充电与调度系统' },
    ] },
  { code: 'sports_culture', label: '体育文化建筑', iconName: 'Trophy', templateCount: 14, warningCount: 4, hasSubtypes: true,
    subtypes: [
      { code: 'sports_stadium', label: '体育场', description: '大跨度屋盖、比赛与集散系统' },
      { code: 'sports_indoor_arena', label: '室内体育馆', description: '活动场地、伸缩看台与模式转换' },
      { code: 'sports_theater', label: '剧院剧场', description: '舞台机械、建筑声学与带妆排演' },
      { code: 'sports_exhibition', label: '博物馆展览馆', description: '藏品环境、布展与试开放' },
    ] },
  { code: 'tod_upper_cover', label: 'TOD上盖', iconName: 'TramFront', templateCount: 22, warningCount: 6, hasSubtypes: false },
  { code: 'renovation', label: '改造修缮', iconName: 'Wrench', templateCount: 12, warningCount: 3, hasSubtypes: true,
    subtypes: [
      { code: 'renovation_seismic', label: '加固抗震', description: '抗震加固基础模板' },
      { code: 'renovation_energy', label: '节能改造', description: '既有节能改造' },
      { code: 'renovation_heritage', label: '文保修缮', description: '加挂文物保护全套' },
    ] },
  { code: 'modular_building', label: '模块化建筑', iconName: 'Boxes', templateCount: 10, warningCount: 3, hasSubtypes: false },
  { code: 'custom', label: '自定义业态', iconName: 'PlusCircle', templateCount: 0, warningCount: 0, hasSubtypes: false, isCustom: true },
]

export function businessTypeRequiresSubtype(value: string | null | undefined) {
  return BUSINESS_TYPES.some((businessType) => businessType.code === value && businessType.hasSubtypes)
}

export function isBusinessSubtypeForType(
  businessTypeValue: string | null | undefined,
  businessSubtypeValue: string | null | undefined,
) {
  const businessType = BUSINESS_TYPES.find((candidate) => candidate.code === businessTypeValue)
  return businessType?.subtypes?.some((subtype) => subtype.code === businessSubtypeValue) ?? false
}

interface Props {
  selectedType: string | null
  selectedSubtype: string | null
  onSelectType: (code: string) => void
  onSelectSubtype: (code: string) => void
}

export function BusinessTypeCard({ selectedType, selectedSubtype, onSelectType, onSelectSubtype }: Props) {
  const CompleteIcon = getWizardScopeIcon('wizard_complete')

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-slate-900">选择项目业态</h3>
      <div className="grid grid-cols-4 gap-4">
        {BUSINESS_TYPES.map(bt => {
          const iconKey = BUSINESS_ICON_KEY_BY_NAME[bt.iconName] ?? bt.code
          const Icon = getWizardScopeIcon(iconKey)
          const isSelected = selectedType === bt.code

          return (
            <Button unstyled
              key={bt.code}
              onClick={() => onSelectType(bt.code)}
              className={`relative flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all ${
                bt.isCustom
                  ? 'border-2 border-dashed border-slate-300 hover:border-slate-400'
                  : isSelected
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-[var(--el-2)]'
              } focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none`}
            >
              {isSelected && !bt.isCustom && (
                <CompleteIcon className="absolute top-2 right-2 h-4 w-4 text-blue-600" data-testid={wizardIconTestId('wizard_complete')} />
              )}
              <Icon className="h-8 w-8 text-blue-600" data-testid={wizardIconTestId(iconKey)} />
              <div>
                <span className="text-sm font-semibold text-slate-900">{bt.label}</span>
                <p className="text-xs text-slate-500 tabular-nums">{bt.code}</p>
                {!bt.isCustom && (
                  <p className="text-xs text-slate-600 mt-1">
                    {bt.templateCount > 0 ? `含 ${bt.templateCount} 模板 · ${bt.warningCount} 项危大` : '自定义'}
                  </p>
                )}
              </div>
            </Button>
          )
        })}
      </div>

      {/* Subtype cards */}
      {selectedType && (
        (() => {
          const bt = BUSINESS_TYPES.find(t => t.code === selectedType)
          if (!bt?.hasSubtypes || !bt.subtypes) return null
          return (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <h4 className="text-sm font-medium text-slate-700 mb-3">选择子项：</h4>
              <div className="flex gap-3">
                {bt.subtypes.map(sub => (
                  <Button unstyled
                    key={sub.code}
                    onClick={() => onSelectSubtype(sub.code)}
                    className={`p-3 rounded-lg border text-left w-44 transition-all ${
                      selectedSubtype === sub.code
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    } focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none`}
                  >
                    <span className="text-sm font-semibold text-slate-900">{sub.label}</span>
                    <p className="text-xs text-slate-500 mt-0.5">{sub.description}</p>
                  </Button>
                ))}
              </div>
            </div>
          )
        })()
      )}
    </div>
  )
}
