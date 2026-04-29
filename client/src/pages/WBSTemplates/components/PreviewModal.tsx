import { useState } from 'react'
import { Separator } from '@/components/ui/separator'
import type { PreviewNode, WbsTemplate } from '../types'
import {
  collectExpandedPreviewNodeIds,
  flattenPreviewNodes,
  getTemplateNodeCount,
  getTemplateNodes,
  getTemplateStatus,
  getTypeColor,
} from '../utils'
import { PreviewNodeTree } from './PreviewNodeTree'
import {
  IconEdit,
  IconUpload,
  IconX,
} from './WbsIcons'
import { TemplateIcon } from './TemplateIcon'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface PreviewModalProps {
  template: WbsTemplate
  onClose: () => void
  onApply: (template: WbsTemplate) => void
  onEdit: (template: WbsTemplate) => void
  onClone: (template: WbsTemplate) => void
}

export function PreviewModal({
  template,
  onClose,
  onApply,
  onEdit,
  onClone,
}: PreviewModalProps) {
  const color = getTypeColor(template.template_type)
  const refDays = template.reference_days ?? null
  const isDisabled = getTemplateStatus(template) === 'disabled'
  const wbsNodes = getTemplateNodes(template)
  const allFlat = flattenPreviewNodes(wbsNodes)
  const nodeCount = getTemplateNodeCount(template) || allFlat.length
  const [selectedNode, setSelectedNode] = useState<PreviewNode | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>()
    wbsNodes.forEach((_node, index) => ids.add(`${index}`))
    return ids
  })

  const handleToggle = (id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const usageHistory: Array<{ name: string; date: string }> =
    template.template_data?.usage_history ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-950/50 px-4 py-6 backdrop-blur-[4px] duration-200 fade-in-0"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-[90%] max-w-[720px] animate-in flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--el-4)] duration-200 ease-bounce fade-in-0 zoom-in-95"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center`}>
              <TemplateIcon type={template.template_type} className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">{template.name}</h2>
              <p className="text-xs text-slate-400">
                {nodeCount ? `${nodeCount} 个任务节点 · ` : ''}
                {refDays ? `参考工期 ${refDays} 天 · ` : ''}
                {template.template_type || ''}
                {template.category ? ` · ${template.category}` : ''}
              </p>
            </div>
          </div>
          <Button variant="ghost"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <IconX />
          </Button>
        </div>
        <Separator />

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 border-r border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">任务结构</h3>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  里程碑
                </span>
                <Button variant="ghost"
                  className="text-blue-500 hover:text-blue-700 transition-colors"
                  onClick={() => setExpandedIds(collectExpandedPreviewNodeIds(wbsNodes))}
                >
                  全部展开
                </Button>
                <span className="text-slate-300">|</span>
                <Button variant="ghost"
                  className="text-blue-500 hover:text-blue-700 transition-colors"
                  onClick={() => setExpandedIds(new Set())}
                >
                  全部折叠
                </Button>
              </div>
            </div>
            {wbsNodes.length === 0 ? (
              <div className="text-sm text-slate-400 py-6 text-center">暂无节点数据</div>
            ) : (
              <PreviewNodeTree
                nodes={wbsNodes}
                selectedId={selectedNode?.id ?? null}
                expandedIds={expandedIds}
                onSelect={setSelectedNode}
                onToggle={handleToggle}
              />
            )}
          </div>

          <div className="w-56 flex-shrink-0 border-r border-slate-100 p-4 overflow-y-auto bg-slate-50/30">
            {selectedNode ? (
              <>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">节点详情</h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">节点名称</p>
                    <p className="text-sm font-medium text-slate-800 leading-relaxed">{selectedNode.name}</p>
                  </div>
                  {selectedNode.path && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">层级路径</p>
                      <p className="text-xs text-slate-500 leading-relaxed break-words">{selectedNode.path}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Card className="bg-white rounded-xl p-2 border border-slate-100 text-center">
                      <p className="text-lg font-bold text-emerald-600">{selectedNode.reference_days ?? '—'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">参考工期(天)</p>
                    </Card>
                    <Card className="bg-white rounded-xl p-2 border border-slate-100 text-center">
                      <p className="text-lg font-bold text-slate-700">{selectedNode.level + 1}</p>
                      <p className="text-xs text-slate-400 mt-0.5">层级</p>
                    </Card>
                  </div>
                  {selectedNode.is_milestone && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs text-amber-700 font-medium">里程碑节点</span>
                    </div>
                  )}
                  {selectedNode.description && (
                    <div>
                      <p className="text-xs text-slate-600 leading-relaxed">{selectedNode.description}</p>
                    </div>
                  )}
                  {Array.isArray(selectedNode.children) && selectedNode.children.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-400 mb-1">直接子节点</p>
                      <div className="space-y-1">
                        {selectedNode.children.slice(0, 5).map((child, index) => (
                          <Card
                            key={`${selectedNode.id}-${index}`}
                            className="text-xs text-slate-600 bg-white border border-slate-100 rounded-xl px-2 py-1.5 flex items-center gap-1.5"
                          >
                            <span className="w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                            <span className="truncate">{child.name || '未命名'}</span>
                          </Card>
                        ))}
                        {selectedNode.children.length > 5 && (
                          <p className="text-xs text-slate-400 pl-1">
                            还有 {selectedNode.children.length - 5} 个子节点
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <svg className="w-8 h-8 text-slate-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            )}
          </div>

          <div className="w-64 flex-shrink-0 p-5 flex flex-col gap-5 bg-slate-50/50">
            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">模板信息</h4>
              <div className="space-y-2">
                {[
                  { label: '适用类型', value: template.template_type || '—' },
                  { label: '结构形式', value: template.category || '—' },
                  { label: '任务节点', value: nodeCount ? `${nodeCount} 个` : '—' },
                  { label: '参考总工期', value: refDays ? `${refDays} 天` : '—', highlight: true },
                  { label: '使用次数', value: `${template.usage_count ?? 0} 次` },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-slate-400">{label}</span>
                    <span className={`font-medium ${highlight ? 'text-emerald-600 font-bold' : 'text-slate-700'}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">使用记录</h4>
              {usageHistory.length > 0 ? (
                <div className="space-y-1.5">
                  {usageHistory.slice(0, 3).map((history, index) => (
                    <div
                      key={`${history.name}-${history.date}-${index}`}
                      className="flex items-center gap-2 text-xs text-slate-500 py-1 hover:bg-slate-100 px-2 rounded-lg"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span className="flex-1 truncate">{history.name}</span>
                      <span className="text-slate-400">{history.date}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 px-2">暂无使用记录</p>
              )}
            </div>

            <div className="mt-auto space-y-2">
              {isDisabled ? (
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 text-center text-sm text-slate-400">
                  已停用，无法应用到项目
                </div>
              ) : (
                <Button variant="ghost"
                  onClick={() => onApply(template)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-sm"
                >
                  <IconUpload />
                  应用到项目
                </Button>
              )}
              <Button variant="ghost"
                onClick={() => {
                  onClone(template)
                  onClose()
                }}
                className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 py-2 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                克隆此模板
              </Button>
              <Button variant="ghost"
                onClick={() => onEdit(template)}
                className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 py-2 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <IconEdit />
                编辑模板
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
