// v1.4.22.1 section 7.5: Step 4 - Engineering feature chips with grouping and search.
import { memo, useEffect, useMemo, useState } from 'react'

import { FEATURE_CATEGORIES, type FeatureItem } from './featureData'
import type { WizardDraftPayload } from './types'
import { getWizardScopeIcon, wizardIconTestId } from './wizardScopeIcons'
import { Button } from '@/components/ui/button'

interface Props {
  draft: WizardDraftPayload
  onUpdate: (u: Partial<WizardDraftPayload>) => void
}

function readScopeText(scopeTree: unknown[] | undefined): string {
  return JSON.stringify(scopeTree ?? []).toLowerCase()
}

function buildSuggestedFeatures(draft: WizardDraftPayload): Record<string, number | boolean> {
  const scopeText = readScopeText(draft.scopeTree)
  const suggestions: Record<string, number | boolean> = {}
  if (draft.businessType === 'hospital') {
    suggestions.has_medical_gas = true
    if (/手术|operating|or/.test(scopeText)) suggestions.has_or = 6
    if (/icu|重症/.test(scopeText)) suggestions.cleanroom_grade = 10000
    if (/mri|磁共振/.test(scopeText)) suggestions.has_mri = 1
    if (/直线加速|linac/.test(scopeText)) suggestions.has_linac = 1
    if (/bsl|生物安全/.test(scopeText)) suggestions.has_bsl2 = true
  }
  if (draft.businessType === 'data_center') {
    suggestions.tier_level = 3
    suggestions.dual_utility_power = true
    suggestions.has_dcim = true
    if (!('cabinet_density' in suggestions)) suggestions.cabinet_density = 10
  }
  if (draft.businessType === 'industrial') {
    if (/洁净|cleanroom/.test(scopeText)) suggestions.cleanroom_grade = 10000
    if (/纯水|pure_water/.test(scopeText)) suggestions.process_pure_water = 10
    if (/voc|废气/.test(scopeText)) suggestions.voc_treatment = true
    if (/废液|化学/.test(scopeText)) suggestions.chemical_waste = 1
  }
  if (draft.businessType === 'renovation') {
    suggestions.existing_structure_year = 2000
  }
  if (draft.businessType === 'tod_upper_cover' || /地铁|轨道|不停运/.test(scopeText)) {
    suggestions.non_stop_operation = true
    suggestions.three_level_isolation = draft.businessType === 'tod_upper_cover' ? true : suggestions.three_level_isolation
  }
  return suggestions
}

function getNumericLabel(item: FeatureItem): string {
  if (item.code === 'prefabRate') return '比例'
  if (item.code === 'near_metro' || item.code === 'near_heritage' || item.code === 'near_high_voltage') return '距离'
  if (item.code === 'deep_pit' || item.code === 'large_span' || item.code === 'supportHeightM' || item.code === 'integral_lifting') return '尺寸'
  if (item.code === 'basementLevelCount') return '层数'
  if (item.code === 'basementAreaM2') return '面积'
  if (item.code === 'green_building' || item.code === 'tier_level' || item.code === 'cleanroom_grade' || item.code === 'heritage_level' || item.code === 'seismic_retrofit_level' || item.code === 'explosion_proof') return '等级'
  if (item.code === 'cabinet_density') return '密度'
  if (item.code === 'ptfe_membrane') return '面积'
  return '数量'
}

function Step4KeyFeaturesConstraintsComponent({ draft, onUpdate }: Props) {
  const InfoIcon = getWizardScopeIcon('feature_info')
  const LockIcon = getWizardScopeIcon('feature_required')
  const SearchIcon = getWizardScopeIcon('feature_search')
  const features = draft.projectFeatures ?? {}
  const [search, setSearch] = useState('')
  const [showOptional, setShowOptional] = useState(true)

  const isSearching = search.trim().length > 0
  const methodSet = new Set(draft.methodVariantCodes ?? [])
  const suggestedFeatures = useMemo(() => buildSuggestedFeatures(draft), [draft.businessType, draft.scopeTree])

  useEffect(() => {
    const missingEntries = Object.entries(suggestedFeatures).filter(([code]) => features[code] === undefined)
    if (missingEntries.length === 0) return
    onUpdate({ projectFeatures: { ...suggestedFeatures, ...features } })
    // Suggestions should react only when upstream project facts change; user-selected features win.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedFeatures])

  const isApplicable = (item: FeatureItem) => {
    if (item.businessTypes?.length && draft.businessType && !item.businessTypes.includes(draft.businessType)) return false
    if (item.methodVariantCodes?.length && !item.methodVariantCodes.some((method) => methodSet.has(method))) return false
    return true
  }

  const toggleFeature = (item: FeatureItem) => {
    const next = { ...features }
    const code = item.code
    if (code in next) {
      delete next[code]
    } else {
      next[code] = item.hasNumeric ? item.numericDefault ?? true : true
    }
    onUpdate({ projectFeatures: next })
  }

  const setNumeric = (code: string, value: number) => {
    onUpdate({ projectFeatures: { ...features, [code]: value } })
  }

  const filteredCategories = useMemo(() => {
    const applicableCategories = FEATURE_CATEGORIES
      .map((category) => ({
        ...category,
        items: category.items.filter(isApplicable),
      }))
      .filter((category) => category.items.length > 0)
    if (!isSearching) return applicableCategories
    const q = search.toLowerCase()
    return applicableCategories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) =>
          item.label.toLowerCase().includes(q) || item.code.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
        ),
      }))
      .filter((category) => category.items.length > 0)
  }, [search, isSearching, draft.businessType, draft.methodVariantCodes])

  const selectedCount = Object.keys(features).length

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">关键特征与专项约束</h2>

      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
        <InfoIcon className="h-4 w-4 shrink-0 text-amber-600" data-testid={wizardIconTestId('feature_info')} />
        <p className="text-xs text-amber-800">
          系统会按业态和范围树自动带出常见专项；不需要的项可以取消勾选。
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" data-testid={wizardIconTestId('feature_search')} />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="找'手术'、'装配率'……"
          className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 tabular-nums">
          已选：{selectedCount} 项
        </span>
      </div>

      {filteredCategories.map((category, categoryIndex) => {
        const isCollapsed = category.tier === 'optional' && !showOptional && !isSearching
        return (
          <div key={`${category.tier}-${category.label}`} className={categoryIndex > 0 ? 'border-t border-slate-200 pt-6' : ''}>
            <Button unstyled
              type="button"
              onClick={() => category.tier === 'optional' && setShowOptional(!showOptional)}
              className="mb-3 flex items-center gap-2"
            >
              <h3 className="text-sm font-semibold text-slate-700">{category.label}</h3>
              <span className="text-xs text-slate-400 tabular-nums">
                ({category.items.filter((item) => features[item.code] !== undefined).length}/{category.items.length})
              </span>
            </Button>
            {!isCollapsed ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                {category.items.map((item) => {
                  const isSelected = features[item.code] !== undefined
                  const value = typeof features[item.code] === 'number' ? features[item.code] as number : item.numericDefault
                  const isRequired = category.tier === 'required'
                  const isHighlighted = isSearching && (item.label.toLowerCase().includes(search.toLowerCase()) || item.code.toLowerCase().includes(search.toLowerCase()))

                  return (
                    <div
                      key={item.code}
                      className={`relative rounded-lg border p-3 text-left transition-all ${
                        isSelected ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      } ${isHighlighted ? 'ring-2 ring-amber-300' : ''}`}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          aria-label={item.label}
                          checked={isSelected}
                          onChange={() => toggleFeature(item)}
                          className="mt-0.5 rounded border-slate-300"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-sm font-medium text-slate-900">{item.label}</span>
                            {isRequired ? <LockIcon className="h-3 w-3 shrink-0 text-amber-500" data-testid={wizardIconTestId('feature_required')} /> : null}
                          </div>
                          <p className="truncate text-xs text-slate-500">{item.description}</p>
                          {isSelected && item.hasNumeric ? (
                            <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                              <span>{getNumericLabel(item)}</span>
                              <input
                                type="number"
                                value={value ?? ''}
                                aria-label={`${item.label.replace(/CLN-.*/, '').trim()}${getNumericLabel(item)}`}
                                onChange={(event) => setNumeric(item.code, Number(event.target.value) || 0)}
                                className="h-7 w-16 rounded border border-slate-200 px-1 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                placeholder={String(item.numericDefault)}
                              />
                            </label>
                          ) : null}
                        </div>
                      </label>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export const Step4KeyFeaturesConstraints = memo(Step4KeyFeaturesConstraintsComponent)
