import { useMemo } from 'react'
import { ListTree, Search, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type {
  WbsTemplateCatalogItem,
  WbsTemplateCatalogNode,
  WbsTemplateGroup,
  WbsTemplatePackType,
} from '@/services/wbsTemplateGenerationApi'

type TemplatePackBucket = WbsTemplatePackType | 'database'

const CATEGORY_LABELS: Record<string, string> = {
  division: '分部',
  sub_division: '子分部',
  item_work: '分项',
  process: '工序',
  activity_step: '作业步骤',
  custom: '自定义',
}

const TEMPLATE_GROUP_LABELS: Record<string, string> = {
  building_main: '房建主干',
  site_management: '安全文明与临设',
  danger_control: '危大工程控制',
  quality_responsibility: '质量责任与检测',
  project_milestone: '开竣工与移交',
  document_commercial_support: '资料与商务配合',
  specialty: '专业专项',
  outdoor: '室外配套',
  municipal: '市政基础',
  decoration: '装饰专项',
  mep: '消防深化',
  facade: '幕墙外立面',
  elevator: '电梯专项',
  intelligent: '智能化专项',
  hvac: '暖通空调',
  plumbing: '给排水供暖',
  electrical: '建筑电气',
  foundation: '基坑桩基',
  steel_structure: '钢结构专项',
  prefab: '装配式专项',
  waterproof: '防水保温',
  civil_defense: '人防专项',
  cleanroom: '洁净医疗',
  database: '项目模板',
}

const PACK_TYPE_LABELS: Record<TemplatePackBucket, string> = {
  core_quality: '核心质量主线',
  site_management: '安全文明与临设',
  danger_control: '危大工程控制',
  quality_responsibility: '质量责任与检测',
  project_milestone: '开竣工与移交',
  document_commercial_support: '资料与商务配合',
  specialty: '专业专项',
  database: '项目模板',
}

const PACK_TYPE_ORDER: TemplatePackBucket[] = [
  'core_quality',
  'site_management',
  'danger_control',
  'quality_responsibility',
  'project_milestone',
  'document_commercial_support',
  'specialty',
  'database',
]

const TEMPLATE_GROUP_ORDER = [
  'building_main',
  'site_management',
  'danger_control',
  'quality_responsibility',
  'project_milestone',
  'document_commercial_support',
  'specialty',
  'foundation',
  'steel_structure',
  'prefab',
  'facade',
  'waterproof',
  'decoration',
  'plumbing',
  'hvac',
  'electrical',
  'mep',
  'intelligent',
  'elevator',
  'civil_defense',
  'cleanroom',
  'outdoor',
  'municipal',
  'database',
]

export function countTemplateNodes(nodes: WbsTemplateCatalogNode[] = []): number {
  return nodes.reduce((total, node) => total + 1 + countTemplateNodes(node.children), 0)
}

function orderIndex<T extends string>(order: T[], value: string) {
  const index = order.indexOf(value as T)
  return index === -1 ? 999 : index
}

function resolveTemplatePackType(template: WbsTemplateCatalogItem): TemplatePackBucket {
  if (template.source === 'database') return 'database'
  return template.packType ?? (template.templateGroup === 'building_main' ? 'core_quality' : 'specialty')
}

function resolveTemplateGroup(template: WbsTemplateCatalogItem): WbsTemplateGroup | 'database' {
  if (template.source === 'database') return 'database'
  return template.templateGroup ?? 'building_main'
}

export function getTemplateRootNodes(template?: WbsTemplateCatalogItem | null) {
  return template?.nodes ?? []
}

type TemplateNodeEntry = {
  node: WbsTemplateCatalogNode
  depth: number
  pathLabel: string
}

function flattenTemplateNodes(
  nodes: WbsTemplateCatalogNode[] = [],
  depth = 0,
  ancestors: string[] = [],
): TemplateNodeEntry[] {
  return nodes.flatMap((node) => {
    const path = [...ancestors, node.name]
    return [
      { node, depth, pathLabel: path.join(' / ') },
      ...flattenTemplateNodes(node.children, depth + 1, path),
    ]
  })
}

export function formatTemplateStats(template: WbsTemplateCatalogItem) {
  const summary = template.evidenceSummary
  if (!summary) return `${template.sourceStandard || '标准模板'} · ${template.nodeCount || countTemplateNodes(template.nodes)} 个节点`
  return `${template.sourceStandard || '标准模板'} · ${summary.divisionCount} 分部 · ${summary.itemWorkCount} 分项 · ${summary.disciplineProcessCount} 专业工序 · ${summary.genericFallbackProcessCount} 兜底工序`
}

export interface TemplateBrowserProps {
  templates: WbsTemplateCatalogItem[]
  selectedTemplateId: string
  selectedTemplateIds?: string[]
  selectedNodeIds: string[]
  disabledTemplateReasons?: Record<string, string | null | undefined>
  loading?: boolean
  disabled?: boolean
  onTemplateChange: (templateId: string) => void
  onTemplateToggle?: (templateId: string, checked: boolean) => void
  onToggleNode: (nodeId: string, checked: boolean) => void
  onSelectAll?: () => void
  showNestedNodes?: boolean
  compact?: boolean
  className?: string
}

export function TemplateBrowser({
  templates,
  selectedTemplateId,
  selectedTemplateIds,
  selectedNodeIds,
  disabledTemplateReasons,
  loading = false,
  disabled = false,
  onTemplateChange,
  onTemplateToggle,
  onToggleNode,
  onSelectAll,
  showNestedNodes = false,
  compact = false,
  className,
}: TemplateBrowserProps) {
  const [nodeSearch, setNodeSearch] = useState('')
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? templates[0] ?? null,
    [selectedTemplateId, templates],
  )
  const selectedTemplateIdSet = useMemo(() => new Set(selectedTemplateIds ?? [selectedTemplateId].filter(Boolean)), [selectedTemplateId, selectedTemplateIds])
  const groupedTemplatePacks = useMemo(() => {
    const packs = new Map<TemplatePackBucket, Map<WbsTemplateGroup | 'database', WbsTemplateCatalogItem[]>>()
    for (const template of templates) {
      const packType = resolveTemplatePackType(template)
      const group = resolveTemplateGroup(template)
      const packGroups = packs.get(packType) ?? new Map<WbsTemplateGroup | 'database', WbsTemplateCatalogItem[]>()
      packGroups.set(group, [...(packGroups.get(group) ?? []), template])
      packs.set(packType, packGroups)
    }
    return Array.from(packs.entries())
      .sort(([left], [right]) => orderIndex(PACK_TYPE_ORDER, left) - orderIndex(PACK_TYPE_ORDER, right))
      .map(([packType, groups]) => [
        packType,
        Array.from(groups.entries()).sort(([left], [right]) => orderIndex(TEMPLATE_GROUP_ORDER, left) - orderIndex(TEMPLATE_GROUP_ORDER, right)),
      ] as const)
  }, [templates])
  const rootNodes = useMemo(() => getTemplateRootNodes(selectedTemplate), [selectedTemplate])
  const nodeEntries = useMemo(() => flattenTemplateNodes(rootNodes), [rootNodes])
  const visibleNodeEntries = useMemo(() => {
    const entries = showNestedNodes ? nodeEntries : nodeEntries.filter((entry) => entry.depth === 0)
    const query = nodeSearch.trim().toLowerCase()
    if (!query) return entries
    return entries.filter(({ node, pathLabel }) => [
      node.name,
      node.stableCode,
      node.standardWorkCode,
      node.standardWorkName,
      pathLabel,
    ].some((value) => String(value ?? '').toLowerCase().includes(query)))
  }, [nodeEntries, nodeSearch, showNestedNodes])
  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds])

  return (
    <section
      data-testid={compact ? 'template-inline-browser' : 'template-browser'}
      className={cn('grid gap-3', compact ? 'lg:grid-cols-[minmax(0,1fr)_220px]' : 'lg:grid-cols-[220px_minmax(0,1fr)_220px]', className)}
    >
      <div className="grid content-start gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-900">模板库</div>
          {loading ? <span className="text-xs text-slate-400">加载中</span> : null}
        </div>
        <ScrollArea className={compact ? 'max-h-36' : 'max-h-64'}>
          <div className="space-y-1">
            {groupedTemplatePacks.map(([packType, groupEntries]) => (
              <div key={packType} className="space-y-1">
                <div data-testid={`template-pack-${packType}`} className="px-2 pt-2 text-xs font-bold text-slate-600">
                  {PACK_TYPE_LABELS[packType] ?? packType}
                </div>
                {groupEntries.map(([group, groupTemplates]) => (
                  <div key={`${packType}-${group}`} className="space-y-1">
                    <div data-testid={`template-group-${group}`} className="px-2 pt-1 text-xs font-semibold text-slate-400">
                      {TEMPLATE_GROUP_LABELS[group] ?? group}
                    </div>
                    {groupTemplates.map((template) => {
                      const selected = selectedTemplateIdSet.has(template.id)
                      const disabledReason = disabledTemplateReasons?.[template.id] ?? null
                      const templateDisabled = disabled || Boolean(disabledReason)
                      return (
                        <div
                          key={template.id}
                          title={disabledReason ?? undefined}
                          className={cn(
                            'flex items-start gap-2 rounded-lg px-2 py-2 transition-colors',
                            disabledReason
                              ? 'bg-slate-50 text-slate-400'
                              : selectedTemplate?.id === template.id
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-slate-700 hover:bg-slate-50',
                          )}
                        >
                          {onTemplateToggle ? (
                            <Checkbox
                              checked={selected}
                              disabled={templateDisabled || (selected && selectedTemplateIdSet.size <= 1)}
                              onCheckedChange={(checked) => onTemplateToggle(template.id, checked === true)}
                              className="mt-0.5"
                            />
                          ) : null}
                          <Button unstyled
                            type="button"
                            disabled={templateDisabled}
                            data-testid={`template-browser-template-${template.id}`}
                            className="min-w-0 flex-1 text-left"
                            onClick={() => onTemplateChange(template.id)}
                          >
                            <span className="block truncate text-sm font-medium">{template.name}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {template.sourceStandard || '标准模板'} · {template.nodeCount || countTemplateNodes(template.nodes)} 节点
                            </span>
                            {disabledReason ? (
                              <span className="mt-0.5 block truncate text-xs text-slate-400">{disabledReason}</span>
                            ) : null}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="grid content-start gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900">节点范围</div>
          <div className="flex items-center gap-2">
            {onSelectAll ? (
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAll} disabled={rootNodes.length === 0 || disabled}>
                全选
              </Button>
            ) : null}
            <span className="text-xs text-slate-400">已选 {selectedNodeIds.length} 项</span>
          </div>
        </div>
        {showNestedNodes ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="template-browser-node-search"
              aria-label="搜索模板节点"
              value={nodeSearch}
              onChange={(event) => setNodeSearch(event.target.value)}
              className="h-8 pl-8 text-xs"
              placeholder="搜索节点"
            />
          </div>
        ) : null}
        <ScrollArea className={compact ? 'max-h-44' : 'max-h-64'}>
          {visibleNodeEntries.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-slate-400">
              <ListTree className="h-4 w-4" />
              {loading ? '节点加载中' : nodeSearch ? '无匹配节点' : '暂无可生成节点'}
            </div>
          ) : (
            <div className="space-y-1">
              {visibleNodeEntries.map(({ node, depth, pathLabel }) => {
                const checked = selectedNodeSet.has(node.id)
                return (
                  <label
                    key={node.id}
                    data-testid={`template-browser-node-${node.id}`}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white',
                      checked && 'bg-white shadow-sm',
                    )}
                  >
                    <Checkbox checked={checked} disabled={disabled} onCheckedChange={(nextChecked) => onToggleNode(node.id, nextChecked === true)} />
                    <span className="min-w-0 flex-1" style={{ paddingLeft: `${depth * 12}px` }}>
                      <span className="block truncate text-sm font-medium text-slate-900">{node.name}</span>
                      <span className="text-xs text-slate-500">
                        {CATEGORY_LABELS[node.categoryType] ?? '节点'} · {countTemplateNodes(node.children)} 个下级节点
                        {nodeSearch && depth > 0 ? ` · ${pathLabel}` : ''}
                      </span>
                    </span>
                    <span className="text-xs tabular-nums text-slate-400">{node.stableCode}</span>
                  </label>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>

      {selectedTemplate ? (
        <aside data-testid="template-browser-detail" className="grid content-start gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-sm font-semibold text-slate-900">{selectedTemplate.name}</div>
          <div className="text-xs leading-5 text-slate-500">{formatTemplateStats(selectedTemplate)}</div>
          {selectedTemplate.evidenceSummary ? (
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="h-6 gap-1 border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-3 w-3" />
                {selectedTemplate.evidenceSummary.domainScope}
              </Badge>
              <Badge variant="outline" className="h-6 border-slate-200 bg-white px-2 text-xs font-medium text-slate-600">
                {selectedTemplate.evidenceSummary.evidenceStatus === 'verified' ? '证据链通过' : '证据待复核'}
              </Badge>
              <Badge variant="outline" className="h-6 border-slate-200 bg-white px-2 text-xs font-medium text-slate-600">
                待复核 {selectedTemplate.evidenceSummary.reviewNeededCount + selectedTemplate.evidenceSummary.webVerifiedFalseCount}
              </Badge>
              <Badge variant="outline" className="h-6 border-slate-200 bg-white px-2 text-xs font-medium text-slate-600">
                作业步骤 {selectedTemplate.evidenceSummary.uniqueActivityStepNameCount} 类
              </Badge>
            </div>
          ) : null}
        </aside>
      ) : null}
    </section>
  )
}

export default TemplateBrowser
