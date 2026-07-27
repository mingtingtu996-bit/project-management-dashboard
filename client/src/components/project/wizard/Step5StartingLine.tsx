// v1.4.22.1 - Step 5: starting-line form for already-started projects.
import { useEffect, useMemo, useState } from 'react'

import { listMilestonePresets, type MilestonePresetItem } from './projectWizardApi'
import type { WizardDraftPayload } from './types'

const MAIN_STAGES = [
  { code: 'pre_construction', label: '前期准备阶段' },
  { code: 'basement_construction', label: '地下结构阶段' },
  { code: 'main_structure', label: '主体结构阶段' },
  { code: 'secondary_structure', label: '二次结构阶段' },
  { code: 'mep_installation', label: '机电安装阶段' },
  { code: 'decoration', label: '装饰装修阶段' },
  { code: 'outdoor_support', label: '室外配套阶段' },
  { code: 'commissioning', label: '调试验收阶段' },
  { code: 'handover_warranty', label: '移交保修阶段' },
]

const STAGE_PROGRESS_FIELDS: Record<string, { label: string; type: 'building_floor' | 'slider' }[]> = {
  main_structure: [
    { label: '主体施工至', type: 'building_floor' },
  ],
  decoration: [
    { label: '室内精装', type: 'slider' },
    { label: '外立面', type: 'slider' },
    { label: '屋面装饰', type: 'slider' },
  ],
  mep_installation: [
    { label: '给排水主管', type: 'slider' },
    { label: '电气桥架', type: 'slider' },
    { label: '暖通风管', type: 'slider' },
    { label: '消防系统', type: 'slider' },
  ],
}

interface Props {
  draft: WizardDraftPayload
  onUpdate: (u: Partial<WizardDraftPayload>) => void
}

type ScopeNodeLike = {
  id?: unknown
  type?: unknown
  name?: unknown
  metadata?: unknown
  children?: unknown
}

type StartingLineBuilding = {
  id: string
  name: string
  floorOptions: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function flattenScopeNodes(nodes: unknown): ScopeNodeLike[] {
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    if (!isRecord(node)) return []
    return [node as ScopeNodeLike, ...flattenScopeNodes(node.children)]
  })
}

function readPositiveInteger(value: unknown): number | null {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : null
}

function buildFloorOptions(building: ScopeNodeLike): string[] {
  const children = Array.isArray(building.children) ? building.children : []
  const floorNames = children
    .filter((child): child is Record<string, unknown> => isRecord(child) && child.type === 'floor')
    .sort((left, right) => {
      const leftOrder = isRecord(left.metadata) ? readPositiveInteger(left.metadata.floorOrder) : null
      const rightOrder = isRecord(right.metadata) ? readPositiveInteger(right.metadata.floorOrder) : null
      return (leftOrder ?? 9999) - (rightOrder ?? 9999)
    })
    .map((floor) => String(floor.name ?? '').trim())
    .filter(Boolean)

  if (floorNames.length > 0) return floorNames

  const metadata = isRecord(building.metadata) ? building.metadata : {}
  const standardFloorCount = readPositiveInteger(metadata.standardFloorCount)
  if (!standardFloorCount) return []
  return Array.from({ length: Math.min(standardFloorCount, 120) }, (_, index) => `L${index + 1}`)
}

function buildStartingLineBuildings(scopeTree: unknown): StartingLineBuilding[] {
  return flattenScopeNodes(scopeTree)
    .filter((node) => node.type === 'building')
    .map((node, index) => ({
      id: String(node.id ?? `building-${index + 1}`),
      name: String(node.name ?? `${index + 1}#楼`),
      floorOptions: buildFloorOptions(node),
    }))
}

export function Step5StartingLine({ draft, onUpdate }: Props) {
  const [mainStage, setMainStage] = useState<string>(draft.onboardingSubstage ?? '')
  const [progress, setProgress] = useState<Record<string, unknown>>(draft.onboardingPhaseProgress ?? {})
  const [passedMilestones, setPassedMilestones] = useState<string[]>(draft.onboardingPassedMilestones ?? [])
  const [milestonePresets, setMilestonePresets] = useState<MilestonePresetItem[]>([])
  const [presetsLoading, setPresetsLoading] = useState(false)
  const buildings = useMemo(() => buildStartingLineBuildings(draft.scopeTree), [draft.scopeTree])

  useEffect(() => {
    setMainStage(draft.onboardingSubstage ?? '')
    setProgress(draft.onboardingPhaseProgress ?? {})
    setPassedMilestones(draft.onboardingPassedMilestones ?? [])
  }, [draft.onboardingSubstage, draft.onboardingPhaseProgress, draft.onboardingPassedMilestones])

  useEffect(() => {
    if (!mainStage) {
      setMilestonePresets([])
      return
    }

    let cancelled = false
    setPresetsLoading(true)
    void listMilestonePresets({ businessType: draft.businessType ?? 'general_civil', mainStage })
      .then((rows) => {
        if (!cancelled) setMilestonePresets(rows)
      })
      .catch((error) => {
        console.error('[ProjectInfoModule] failed to load milestone presets', error)
        if (!cancelled) setMilestonePresets([])
      })
      .finally(() => {
        if (!cancelled) setPresetsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [draft.businessType, mainStage])

  const handleStage = (code: string) => {
    setMainStage(code)
    setProgress({})
    onUpdate({ onboardingSubstage: code, onboardingPhaseProgress: {} })
  }

  const handleProgress = (key: string, value: unknown) => {
    const next = { ...progress, [key]: value }
    setProgress(next)
    onUpdate({ onboardingPhaseProgress: next })
  }

  const toggleMilestone = (code: string) => {
    const next = passedMilestones.includes(code)
      ? passedMilestones.filter((milestone) => milestone !== code)
      : [...passedMilestones, code]
    setPassedMilestones(next)
    onUpdate({ onboardingPassedMilestones: next })
  }

  const stageFields = STAGE_PROGRESS_FIELDS[mainStage] ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">起跑线接入</h2>
        <p className="mt-1 text-sm text-slate-500">
          对已开工项目，先记录当前施工阶段、楼层进度和已通过里程碑，生成计划时从真实现场状态接续。
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">当前主阶段</h3>
        {MAIN_STAGES.map((stage) => (
          <label
            key={stage.code}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
              mainStage === stage.code ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <input
              type="radio"
              name="mainStage"
              checked={mainStage === stage.code}
              onChange={() => handleStage(stage.code)}
              className="text-blue-600"
            />
            <span className="text-sm text-slate-900">{stage.label}</span>
          </label>
        ))}
      </div>

      {mainStage && stageFields.length > 0 ? (
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium text-slate-700">阶段进度</h3>
          {stageFields.map((field) => (
            <div key={field.label}>
              {field.type === 'building_floor' ? (
                <div className="space-y-2">
                  <span className="text-xs text-slate-500">{field.label}</span>
                  {buildings.length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                      请先在范围体量步骤补充单体及楼层信息，系统会按楼栋生成可选择的起跑线。
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {buildings.map((building) => (
                        <label key={building.id} className="flex items-center gap-2">
                          <span className="sr-only">{building.name}{field.label}</span>
                          <select
                            aria-label={`${building.name}当前施工至`}
                            value={(progress[building.id] as { floor?: string } | undefined)?.floor ?? ''}
                            onChange={(event) => handleProgress(building.id, {
                              ...((progress[building.id] as Record<string, unknown> | undefined) ?? {}),
                              buildingName: building.name,
                              floor: event.target.value,
                            })}
                            className="rounded border border-slate-200 px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            <option value="">{building.name}</option>
                            {building.floorOptions.map((floor) => (
                              <option key={floor} value={floor}>{floor}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="w-24 text-xs text-slate-500">{field.label}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={(progress[field.label] as number) ?? 0}
                    onChange={(event) => handleProgress(field.label, Number(event.target.value))}
                    className="flex-1"
                  />
                  <span className="w-10 text-xs text-slate-500 tabular-nums">{(progress[field.label] as number) ?? 0}%</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {mainStage ? (
        <div className="space-y-2 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-medium text-slate-700">已通过里程碑</h3>
          <p className="text-xs text-slate-400">用于判断哪些前置工序已经完成，避免重新生成已完成工作。</p>
          {presetsLoading ? <p className="text-xs text-slate-400">正在加载里程碑...</p> : null}
          {!presetsLoading && milestonePresets.length === 0 ? (
            <p className="text-xs text-slate-400">当前阶段暂无预设里程碑。</p>
          ) : null}
          {milestonePresets.map((milestone) => (
            <label key={milestone.code} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={passedMilestones.includes(milestone.code)}
                onChange={() => toggleMilestone(milestone.code)}
                className="rounded border-slate-300"
              />
              <span>{milestone.label}</span>
              {milestone.required ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">必选</span> : null}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
