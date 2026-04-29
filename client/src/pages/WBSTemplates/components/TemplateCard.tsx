import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { WbsTemplate } from '../types'
import {
  formatDate,
  getTemplateNodeCount,
  getTemplateStatus,
  getTypeColor,
} from '../utils'
import { IconUpload } from './WbsIcons'
import { TemplateIcon, TemplateStatusBadge } from './TemplateIcon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

export function TemplateCard({
  template,
  onPreview,
  onApply,
  onEdit,
  onClone,
  onToggleStatus,
  selected,
  onSelect,
}: {
  template: WbsTemplate
  onPreview: (t: WbsTemplate) => void
  onApply: (t: WbsTemplate) => void
  onEdit: (t: WbsTemplate) => void
  onClone: (t: WbsTemplate) => void
  onToggleStatus: (t: WbsTemplate, newStatus: 'published' | 'disabled') => void
  selected?: boolean        // F8: 多选状态
  onSelect?: (id: string) => void // F8: 切换选中
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const color = getTypeColor(template.template_type)
  const status = getTemplateStatus(template)
  const isDraft = status === 'draft'
  const isDisabled = status === 'disabled'
  const nodeCount = getTemplateNodeCount(template)
  const depth = template.depth ?? 3
  const refDays = template.reference_days ?? null
  const displayTags = (template.tags ?? []).slice(0, 3)
  const extraTags = (template.tags ?? []).length > 3 ? `+${(template.tags ?? []).length - 3}` : null

  // U2: 停用模板用虚线边框
  const cardBorderClass = isDisabled
    ? 'border-dashed border-slate-200 opacity-70'
    : 'border-slate-100 hover:ring-1 ring-blue-100'

  return (
    <Card
      variant={isDisabled ? 'ghost' : 'detail'}
      className={`group cursor-pointer relative flex flex-col p-5 ${
        selected
          ? 'border-blue-400 ring-2 ring-blue-200'
          : cardBorderClass
      }`}
      onClick={() => onPreview(template)}
      onContextMenu={(e) => {
        // F7: 右键菜单
        e.preventDefault()
        setCtxMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {/* F8: 多选 checkbox（左上角，hover 或已选时显示）*/}
      {onSelect && (
        <div
          className={`absolute top-3 left-3 z-10 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={(e) => { e.stopPropagation(); onSelect(template.id) }}
        >
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
            selected ? 'bg-blue-600 border-blue-500' : 'border-slate-300 bg-white'
          }`}>
            {selected && (
              <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}
      {/* 头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-10 h-10 rounded-lg ${color.bg} flex items-center justify-center flex-shrink-0`}>
            <TemplateIcon type={template.template_type} className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-800 text-sm leading-tight truncate">{template.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {template.template_type || '通用'} · {template.category || '未分类'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {/* U2: 三态状态标签 */}
          <TemplateStatusBadge status={status} />
          {/* U1: 三点菜单 */}
          <div className="relative">
            <Tooltip>
  <TooltipTrigger asChild>
    <Button variant="ghost"
              type="button"
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
              className="w-6 h-6 rounded-md hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-600 transition-colors"
              
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
              </svg>
            </Button>
  </TooltipTrigger>
  <TooltipContent>更多操作</TooltipContent>
</Tooltip>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} />
                <div
                  role="menu"
                  className="absolute right-0 top-8 z-20 bg-white border border-slate-100 rounded-xl shadow-lg py-1 w-36 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation()
                      setMenuOpen(false)
                    }
                  }}
                >
                  <Button variant="ghost"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(template) }}
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    编辑
                  </Button>
                  <Button variant="ghost"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClone(template) }}
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    克隆
                  </Button>
                  <Separator className="my-1" />
                  {isDisabled ? (
                    <Button variant="ghost"
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-emerald-600 flex items-center gap-2"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggleStatus(template, 'published') }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      启用
                    </Button>
                  ) : (
                    <Button variant="ghost"
                      className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-500 flex items-center gap-2"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggleStatus(template, 'disabled') }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      停用
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 描述 */}
      <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
        {template.description || '暂无描述'}
      </p>

      {/* 节点统计 */}
      <div className="flex items-center gap-4 mb-3 py-2.5 px-3 bg-slate-50 rounded-lg">
        <div className="text-center">
          <p className="text-base font-bold text-slate-700">{nodeCount || '—'}</p>
          <p className="text-xs text-slate-500">任务节点</p>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="text-center">
          <p className="text-base font-bold text-slate-700">{depth}</p>
          <p className="text-xs text-slate-500">层级深度</p>
        </div>
        <div className="w-px h-8 bg-slate-200" />
        <div className="text-center">
          {refDays ? (
            <p className="text-base font-bold text-emerald-600">{refDays}</p>
          ) : (
            <p className="text-base font-bold text-slate-500">—</p>
          )}
          <p className="text-xs text-slate-500">参考工期(天)</p>
        </div>
      </div>

      {/* 标签 */}
      {displayTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {displayTags.map((tag, i) => (
            <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color.tagBg} ${color.tagText}`}>
              {tag}
            </span>
          ))}
          {extraTags && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color.tagBg} ${color.tagText}`}>
              {extraTags}
            </span>
          )}
        </div>
      )}

      {/* 底部操作 */}
      <div className="flex items-center justify-between mt-auto" onClick={e => e.stopPropagation()}>
        <span className="text-xs text-slate-500">{template.updated_at ? `更新于 ${formatDate(template.updated_at)}` : ''}</span>
        <div className="flex gap-2">
          <Button variant="ghost"
            onClick={(e) => { e.stopPropagation(); onPreview(template) }}
            className="text-xs text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
          >
            预览
          </Button>
          {isDraft ? (
            <Button variant="ghost"
              onClick={(e) => { e.stopPropagation(); onEdit(template) }}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-md transition-colors"
            >
              编辑草稿
            </Button>
          ) : isDisabled ? (
            <Button variant="ghost"
              onClick={(e) => { e.stopPropagation(); onToggleStatus(template, 'published') }}
              className="text-xs bg-slate-200 hover:bg-emerald-100 text-slate-500 hover:text-emerald-600 px-3 py-1 rounded-md transition-colors"
            >
              重新启用
            </Button>
          ) : (
            // B1: 移除 opacity-0 group-hover:opacity-100，按钮始终可见（浅色）
            <Button variant="ghost"
              onClick={(e) => { e.stopPropagation(); onApply(template) }}
              className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-3 py-1 rounded-md transition-colors border border-blue-200 hover:border-blue-600"
            >
              应用到项目
            </Button>
          )}
        </div>
      </div>

      {/* F7: 右键上下文菜单 */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => { e.stopPropagation(); setCtxMenu(null) }}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}
          />
          <div
            className="fixed z-50 bg-white border border-slate-100 rounded-xl shadow-xl py-1 w-44 text-sm"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <Button variant="ghost"
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
              onClick={() => { setCtxMenu(null); onPreview(template) }}
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              预览详情
            </Button>
            {!isDisabled && (
              <Button variant="ghost"
                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-blue-600 flex items-center gap-2"
                onClick={() => { setCtxMenu(null); onApply(template) }}
              >
                <IconUpload />
                应用到项目
              </Button>
            )}
            <Separator className="my-1" />
            <Button variant="ghost"
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
              onClick={() => { setCtxMenu(null); onEdit(template) }}
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              编辑
            </Button>
            <Button variant="ghost"
              className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
              onClick={() => { setCtxMenu(null); onClone(template) }}
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              克隆
            </Button>
            <Separator className="my-1" />
            {isDisabled ? (
              <Button variant="ghost"
                className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-emerald-600 flex items-center gap-2"
                onClick={() => { setCtxMenu(null); onToggleStatus(template, 'published') }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                启用
              </Button>
            ) : (
              <Button variant="ghost"
                className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-500 flex items-center gap-2"
                onClick={() => { setCtxMenu(null); onToggleStatus(template, 'disabled') }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                停用
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
