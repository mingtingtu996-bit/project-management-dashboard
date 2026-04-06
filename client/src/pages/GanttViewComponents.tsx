import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/**
 * 可拖拽的任务行容器
 * 提取为独立组件以便在内部使用 useSortable hook
 */
export function SortableTaskRowWrapper({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? 'relative' : undefined,
    zIndex: isDragging ? 100 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} className="relative group/sortable">
      {/* 拖拽手柄 */}
      <span
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-2 cursor-grab active:cursor-grabbing flex items-center justify-center opacity-0 group-hover/sortable:opacity-100 transition-opacity z-10"
        title="拖拽排序"
      >
        <svg className="h-3 w-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
        </svg>
      </span>
      {children}
    </div>
  )
}
