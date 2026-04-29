import type { PreviewNode, WbsNode } from '../types'
import { IconChevronDown, IconChevronRight } from './WbsIcons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

interface PreviewNodeTreeProps {
  nodes: WbsNode[]
  level?: number
  selectedId: string | null
  expandedIds: Set<string>
  onSelect: (node: PreviewNode) => void
  onToggle: (id: string) => void
  parentPath?: string
}

export function PreviewNodeTree({
  nodes,
  level = 0,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  parentPath = '',
}: PreviewNodeTreeProps) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return null
  }

  return (
    <div>
      {nodes.map((node, index) => {
        const nodeName = node.name || '未命名'
        const id = `${parentPath}${index}`
        const path = parentPath ? `${parentPath} / ${nodeName}` : nodeName
        const hasChildren = Array.isArray(node.children) && node.children.length > 0
        const expanded = expandedIds.has(id)
        const isSelected = selectedId === id
        const previewNode: PreviewNode = {
          id,
          name: nodeName,
          reference_days: node.reference_days,
          is_milestone: node.is_milestone,
          description: node.description,
          children: node.children,
          level,
          path,
        }

        return (
          <div key={id}>
            <div
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm group ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'}`}
              style={{ paddingLeft: `${8 + level * 20}px` }}
              onClick={() => onSelect(previewNode)}
            >
              <Button variant="ghost"
                className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-colors ${hasChildren ? 'text-slate-400 hover:text-slate-600' : 'invisible'}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (hasChildren) {
                    onToggle(id)
                  }
                }}
              >
                {expanded ? <IconChevronDown className="w-3.5 h-3.5" /> : <IconChevronRight className="w-3.5 h-3.5" />}
              </Button>
              {node.is_milestone && (
                <Tooltip>
  <TooltipTrigger asChild>
    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"  />
  </TooltipTrigger>
  <TooltipContent>里程碑</TooltipContent>
</Tooltip>
              )}
              <span className={`flex-1 truncate ${level === 0 ? 'font-medium' : ''}`}>{nodeName}</span>
              {node.reference_days && (
                <span className={`text-xs flex-shrink-0 ml-1 ${isSelected ? 'text-blue-500' : 'text-slate-400'}`}>
                  {node.reference_days}天
                </span>
              )}
            </div>
            {hasChildren && expanded && (
              <PreviewNodeTree
                nodes={node.children ?? []}
                level={level + 1}
                selectedId={selectedId}
                expandedIds={expandedIds}
                onSelect={onSelect}
                onToggle={onToggle}
                parentPath={path}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
