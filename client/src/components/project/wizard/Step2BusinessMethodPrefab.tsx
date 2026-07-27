// v1.4.22.1 §7.4: Step 2 - Business type, construction method, and prefab system selection
import { memo, useState, useEffect } from 'react'
import type { WizardDraftPayload } from './types'
import { BusinessTypeCard } from './BusinessTypeCard'
import { ConstructionMethodCard } from './ConstructionMethodCard'
import { Button } from '@/components/ui/button'

interface Props { draft: WizardDraftPayload; onUpdate: (u: Partial<WizardDraftPayload>) => void }

const PREFAB_SYSTEM_OPTIONS = [
  { code: 'pcf_facade_panel', label: '装饰一体化预制外墙板/PCF外挂墙板', methods: ['precast_concrete'] },
  { code: 'alc_partition_panel', label: '蒸压加气混凝土轻质隔墙板/ALC隔墙板', methods: ['precast_concrete', 'modular_mic'] },
  { code: 'integrated_bathroom', label: '整体卫浴', methods: ['precast_concrete', 'modular_mic'] },
  { code: 'integrated_kitchen', label: '集成厨房', methods: ['precast_concrete', 'modular_mic'] },
] as const

const FOUNDATION_METHOD_OPTIONS = [
  { code: 'raft_foundation', label: '筏板基础', category: '浅基础', description: '整体筏板、厚板、承台筏板候选' },
  { code: 'independent_foundation', label: '独立基础', category: '浅基础', description: '独立基础、条形基础候选' },
  { code: 'bored_pile', label: '钻孔灌注桩', category: '桩基', description: '旋挖、泥浆护壁、成孔成桩候选' },
  { code: 'precast_pile', label: '预制管桩', category: '桩基', description: '静压或锤击预制桩候选' },
  { code: 'cfg_pile', label: 'CFG 桩', category: '桩基', description: '复合地基处理候选' },
  { code: 'diaphragm_wall', label: '地下连续墙', category: '基坑支护', description: '地下连续墙支护与止水候选' },
  { code: 'smw_pile', label: 'SMW 工法桩', category: '基坑支护', description: '型钢水泥土搅拌墙候选' },
  { code: 'trd_wall', label: 'TRD 等厚水泥土连续墙', category: '基坑支护', description: '等厚水泥土墙候选' },
  { code: 'soil_nailing', label: '土钉墙', category: '基坑支护', description: '放坡、喷锚、土钉墙候选' },
  { code: 'anchor_support', label: '锚杆支护', category: '基坑支护', description: '锚索、锚杆、腰梁体系候选' },
  { code: 'dewatering_well', label: '管井降水', category: '降排水', description: '降水井、回灌、地下水控制候选' },
] as const

function readFoundationFormCodes(features: WizardDraftPayload['projectFeatures']): string[] {
  const value = features?.foundationFormCodes
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

function Step2BusinessMethodPrefabComponent({ draft, onUpdate }: Props) {
  const [selectedType, setSelectedType] = useState<string | null>(draft.businessType ?? null)
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(draft.businessSubtype ?? null)
  const [selectedMethods, setSelectedMethods] = useState<string[]>(draft.methodVariantCodes ?? [])
  const [selectedFoundationForms, setSelectedFoundationForms] = useState<string[]>(readFoundationFormCodes(draft.projectFeatures))
  const selectedPrefabSystems = draft.prefabSystemCodes ?? []

  useEffect(() => {
    setSelectedType(draft.businessType ?? null)
    setSelectedSubtype(draft.businessSubtype ?? null)
    setSelectedMethods(draft.methodVariantCodes ?? [])
    setSelectedFoundationForms(readFoundationFormCodes(draft.projectFeatures))
  }, [draft.businessType, draft.businessSubtype, draft.methodVariantCodes, draft.projectFeatures])

  const handleType = (code: string) => {
    setSelectedType(code)
    setSelectedSubtype(null)
    onUpdate({ businessType: code, businessSubtype: undefined })
  }

  const handleSubtype = (code: string) => {
    setSelectedSubtype(code)
    onUpdate({ businessSubtype: code })
  }

  const handleMethod = (code: string) => {
    const next = selectedMethods.includes(code)
      ? selectedMethods.filter(m => m !== code)
      : [...selectedMethods, code]
    setSelectedMethods(next)
    onUpdate({ methodVariantCodes: next })
  }

  const handlePrefabSystem = (code: string) => {
    const next = selectedPrefabSystems.includes(code)
      ? selectedPrefabSystems.filter((item) => item !== code)
      : [...selectedPrefabSystems, code]
    onUpdate({ prefabSystemCodes: next })
  }

  const handleFoundationForm = (code: string) => {
    const nextForms = selectedFoundationForms.includes(code)
      ? selectedFoundationForms.filter((item) => item !== code)
      : [...selectedFoundationForms, code]
    const foundationCodes = new Set(FOUNDATION_METHOD_OPTIONS.map((option) => option.code))
    const retainedMethods = selectedMethods.filter((item) => !foundationCodes.has(item as typeof FOUNDATION_METHOD_OPTIONS[number]['code']))
    const nextMethods = [...retainedMethods, ...nextForms]
    setSelectedFoundationForms(nextForms)
    setSelectedMethods(nextMethods)
    onUpdate({
      methodVariantCodes: nextMethods,
      projectFeatures: {
        ...(draft.projectFeatures ?? {}),
        foundationFormCodes: nextForms,
      },
    })
  }

  const availablePrefabSystems = PREFAB_SYSTEM_OPTIONS.filter((option) => (
    option.methods.some((method) => selectedMethods.includes(method))
  ))

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-slate-900">业态、工法与装配体系</h2>
      <BusinessTypeCard
        selectedType={selectedType}
        selectedSubtype={selectedSubtype}
        onSelectType={handleType}
        onSelectSubtype={handleSubtype}
      />
      <div className="border-t border-slate-200 pt-6">
        <ConstructionMethodCard
          businessType={selectedType}
          selectedMethods={selectedMethods}
          onToggleMethod={handleMethod}
        />
      </div>
      <div className="border-t border-slate-200 pt-6">
        <h3 className="text-base font-semibold text-slate-900">基础形式与基坑方案</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          {FOUNDATION_METHOD_OPTIONS.map((option) => {
            const selected = selectedFoundationForms.includes(option.code)
            return (
              <Button unstyled
                key={option.code}
                type="button"
                aria-label={option.label}
                onClick={() => handleFoundationForm(option.code)}
                className={`w-[220px] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
                  selected ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.category}</span>
                <span className="block text-xs text-slate-600">{option.description}</span>
              </Button>
            )
          })}
        </div>
      </div>
      {availablePrefabSystems.length > 0 ? (
        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-base font-semibold text-slate-900">装配式体系</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {availablePrefabSystems.map((option) => {
              const selected = selectedPrefabSystems.includes(option.code)
              return (
                <Button unstyled
                  key={option.code}
                  type="button"
                  onClick={() => handlePrefabSystem(option.code)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none ${
                    selected ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  {option.label}
                </Button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export const Step2BusinessMethodPrefab = memo(Step2BusinessMethodPrefabComponent)
