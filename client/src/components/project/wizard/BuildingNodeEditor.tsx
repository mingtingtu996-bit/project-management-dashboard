// v1.4.22.1 - Lean right-side property panel for structured scope nodes.
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'

interface ScopeNode {
  id: string
  type: string
  name: string
  metadata: Record<string, unknown>
}

const SPECIAL_ROOM_TYPES = ['手术室', 'ICU', 'MRI', '直线加速器', '洁净室', '数据机房', '厨房', '实验室', '泳池', '宴会厅'] as const
const PHYSICAL_ZONE_TYPES = ['地下室分区', '室外道路', '园建绿化', '管网分区', '人防区', '设备区', '车库分区', '屋面区域'] as const
const FLOOR_USAGE_OPTIONS = [
  { id: 'standard', label: '标准层' },
  { id: 'ground_pilotis', label: '架空层' },
  { id: 'refuge', label: '避难层' },
  { id: 'mechanical', label: '设备层' },
  { id: 'transfer', label: '转换层' },
  { id: 'roof', label: '屋面层' },
  { id: 'mezzanine', label: '夹层' },
  { id: 'podium_roof', label: '裙房屋面' },
  { id: 'canopy', label: '雨棚/连廊层' },
] as const

interface Props {
  node: ScopeNode
  onRename: (name: string) => void
  onUpdate: (updates: Record<string, unknown>) => void
}

function readSingleMethodVariant(metadata: Record<string, unknown>): string {
  const methodCodes = metadata.methodVariantCodes
  if (Array.isArray(methodCodes)) return String(methodCodes[0] ?? '')
  return ''
}

export function BuildingNodeEditor({ node, onRename, onUpdate }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const metadata = node.metadata as Record<string, unknown>
  const isBuilding = node.type === 'building'
  const isBasement = node.type === 'basement'
  const isPhysicalZone = node.type === 'physical_zone'

  const field = useCallback((label: string, key: string, type: 'text' | 'number' = 'text', placeholder?: string) => (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={(metadata[key] as string | number) ?? ''}
        onChange={(event) => {
          const value = event.target.value
          onUpdate({ [key]: type === 'number' ? (Number(value) || undefined) : value })
        }}
        className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        placeholder={placeholder}
      />
    </label>
  ), [metadata, onUpdate])

  const advancedToggle = (
    <Button unstyled
      type="button"
      onClick={() => setShowAdvanced((value) => !value)}
      className="inline-flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      aria-expanded={showAdvanced}
      aria-label="高级属性"
    >
      高级属性
      <span className="text-slate-400">{showAdvanced ? '收起' : '展开'}</span>
    </Button>
  )

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">节点属性</h3>

      <label className="block">
        <span className="text-xs font-medium text-slate-600">名称</span>
        <input
          type="text"
          value={node.name}
          onChange={(event) => onRename(event.target.value)}
          className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          aria-label="名称"
        />
      </label>

      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">节点类型</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{node.type}</span>
      </div>

      {isBuilding ? (
        <>
          <hr className="border-slate-100" />
          <h4 className="text-xs font-semibold text-slate-700">单体专属属性</h4>
          {advancedToggle}
          {showAdvanced ? (
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">工法（可覆盖项目默认）</span>
                <select
                  value={readSingleMethodVariant(metadata)}
                  onChange={(event) => {
                    const value = event.target.value
                    onUpdate({ methodVariantCodes: value ? [value] : undefined })
                  }}
                  className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  aria-label="工法（可覆盖项目默认）"
                >
                  <option value="">不覆盖</option>
                  <option value="cast_in_situ">现浇混凝土</option>
                  <option value="steel_frame">钢结构</option>
                  <option value="precast_concrete">装配式 PC</option>
                  <option value="modular_mic">模块化 MiC</option>
                </select>
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      {isBasement ? (
        <>
          <hr className="border-slate-100" />
          <h4 className="text-xs font-semibold text-slate-700">地下空间属性</h4>
          <div className="grid grid-cols-1 gap-2">
            {field('地下室面积 (m²)', 'basementAreaM2', 'number', '例：32000')}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={metadata.hasCivilDefense === true}
              onChange={(event) => onUpdate({ hasCivilDefense: event.target.checked || undefined })}
              className="rounded border-slate-300"
            />
            含人防工程
          </label>
        </>
      ) : null}

      {node.type === 'floor' ? (
        <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">楼层性质</span>
            <select
              value={(metadata.floorUsage as string) ?? 'standard'}
              onChange={(event) => onUpdate({ floorUsage: event.target.value === 'standard' ? undefined : event.target.value })}
              className="mt-0.5 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              aria-label="楼层性质"
            >
              {FLOOR_USAGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {isPhysicalZone ? (
        <>
          <hr className="border-slate-100" />
          <h4 className="text-xs font-semibold text-slate-700">物理区域属性</h4>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">区域类型</span>
            <select
              value={(metadata.physicalCategory as string) ?? ''}
              onChange={(event) => onUpdate({ physicalCategory: event.target.value })}
              className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              aria-label="区域类型"
            >
              <option value="">选择区域类型</option>
              {PHYSICAL_ZONE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-1 gap-2">
            {field('区域面积 (m²)', 'areaM2', 'number', '例：12000')}
          </div>
        </>
      ) : null}

      {node.type === 'functional_area' ? (
        <>
          {advancedToggle}
          {showAdvanced ? (
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">功能分类</span>
                <select
                  value={(metadata.functionalCategory as string) ?? ''}
                  onChange={(event) => onUpdate({ functionalCategory: event.target.value })}
                  className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  aria-label="功能分类"
                >
                  <option value="">选择功能分类</option>
                  {['标准区', '公区', '核心区', '设备区', '人防区', '后勤服务区', '洁净区', '办公区', '商业配套', '展示区'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">特殊房间类型</span>
                <select
                  value={(metadata.specialRoomType as string) ?? ''}
                  onChange={(event) => onUpdate({ specialRoomType: event.target.value || undefined })}
                  className="mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  aria-label="特殊房间类型"
                >
                  <option value="">无需特殊房间</option>
                  {SPECIAL_ROOM_TYPES.map((room) => <option key={room} value={room}>{room}</option>)}
                </select>
              </label>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
