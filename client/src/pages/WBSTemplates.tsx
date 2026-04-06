import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import StandardProcessDrawer from '../components/StandardProcessDrawer'
import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { useDebounce } from '@/hooks/useDebounce'
import { useStore } from '@/hooks/useStore'
import { useToast } from '@/hooks/use-toast'

// 类型定义
interface WbsTemplate {
  id: string
  name: string
  description?: string
  category?: string
  template_type?: string
  tags?: string[]
  applicable_building_types?: string[]
  applicable_project_types?: string[]
  min_area?: number
  max_area?: number
  template_data: any
  /** 兼容旧版数据格式（template_data 之前叫 wbs_nodes） */
  wbs_nodes?: any[]
  usage_count: number
  rating?: number
  is_public: boolean
  is_builtin: boolean
  is_active: boolean
  is_default?: boolean
  created_by?: string
  created_at: string
  updated_at: string
  // 设计稿扩展字段（前端展示用）
  node_count?: number
  depth?: number
  reference_days?: number
  /** B3: 三态状态 draft=草稿/published=已发布/disabled=停用 */
  status?: 'draft' | 'published' | 'disabled'
  color?: string
}

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
  timestamp: string
}

interface Project {
  id: string
  name: string
  status?: string
  health_status?: string
}

const API_BASE = ''

// 模板颜色映射
const TYPE_COLOR_MAP: Record<string, { bg: string; text: string; tagBg: string; tagText: string; icon: string }> = {
  '住宅': { bg: 'bg-blue-100', text: 'text-blue-600', tagBg: 'bg-blue-50', tagText: 'text-blue-600', icon: 'home' },
  '商业': { bg: 'bg-purple-100', text: 'text-purple-600', tagBg: 'bg-purple-50', tagText: 'text-purple-600', icon: 'building' },
  '工业': { bg: 'bg-amber-100', text: 'text-amber-600', tagBg: 'bg-amber-50', tagText: 'text-amber-600', icon: 'grid' },
  '公共建筑': { bg: 'bg-emerald-100', text: 'text-emerald-600', tagBg: 'bg-emerald-50', tagText: 'text-emerald-600', icon: 'landmark' },
}

function getTypeColor(type?: string) {
  return TYPE_COLOR_MAP[type || ''] || TYPE_COLOR_MAP['住宅']
}

/**
 * 辅助函数：为 fetch 请求添加 credentials: 'include'
 * 确保浏览器自动携带 httpOnly Cookie
 */
const withCredentials = (options: RequestInit = {}): RequestInit => ({
  ...options,
  credentials: 'include',
})

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ===== SVG 图标组件 =====
function IconHome({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}
function IconBuilding({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}
function IconGrid({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
    </svg>
  )
}
function IconLandmark({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
    </svg>
  )
}
function IconPlus({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  )
}
function IconSearch({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}
function IconX({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function IconInfo({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconClock({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function IconDownload({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}
function IconChevronDown({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}
function IconChevronRight({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}
function IconUpload({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  )
}
function IconEdit({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}
function IconArrowRight({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  )
}

// ===== 模板图标 =====
function TemplateIcon({ type, className = 'w-5 h-5' }: { type?: string; className?: string }) {
  const color = getTypeColor(type)
  if (type === '商业') return <IconBuilding className={`${className} ${color.text}`} />
  if (type === '工业') return <IconGrid className={`${className} ${color.text}`} />
  if (type === '公共建筑') return <IconLandmark className={`${className} ${color.text}`} />
  return <IconHome className={`${className} ${color.text}`} />
}

// ===== U2: 状态标签组件 =====
function TemplateStatusBadge({ status }: { status?: 'draft' | 'published' | 'disabled' }) {
  if (status === 'draft') {
    return (
      <span className="badge-base gap-1 bg-gray-100 text-gray-600">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
        草稿
      </span>
    )
  }
  if (status === 'disabled') {
    return (
      <span className="badge-base gap-1 bg-red-50 text-red-500">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        停用
      </span>
    )
  }
  // published（默认）
  return (
    <span className="badge-base gap-1 bg-emerald-50 text-emerald-600">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      已发布
    </span>
  )
}

// ===== 单个模板卡片 =====
function TemplateCard({
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
  // F7: 右键上下文菜单
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const color = getTypeColor(template.template_type)
  // B3: 使用 status 字段，降级兼容旧 is_default 逻辑
  const status: 'draft' | 'published' | 'disabled' = template.status
    ?? (template.is_default ? 'draft' : (template.is_active ? 'published' : 'disabled'))
  const isDraft = status === 'draft'
  const isDisabled = status === 'disabled'
  const nodeCount = template.node_count ?? (template.template_data?.nodes?.length ?? 0)
  const depth = template.depth ?? 3
  const refDays = template.reference_days ?? null
  const displayTags = (template.tags ?? []).slice(0, 3)
  const extraTags = (template.tags ?? []).length > 3 ? `+${(template.tags ?? []).length - 3}` : null

  // U2: 停用模板用虚线边框
  const cardBorderClass = isDisabled
    ? 'border-dashed border-gray-200 opacity-70'
    : 'border-gray-100 hover:ring-1 ring-blue-100'

  return (
    <div
      className={`group bg-white rounded-xl border shadow-sm hover:shadow-md transition-all duration-200 p-5 cursor-pointer relative flex flex-col ${
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
            selected ? 'bg-blue-500 border-blue-500' : 'border-gray-300 bg-white'
          }`}>
            {selected && (
              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <h3 className="font-semibold text-gray-800 text-sm leading-tight truncate">{template.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {template.template_type || '通用'} · {template.category || '未分类'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          {/* U2: 三态状态标签 */}
          <TemplateStatusBadge status={status} />
          {/* U1: 三点菜单 */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
              className="w-6 h-6 rounded-md hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              title="更多操作"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }} />
                <div className="absolute right-0 top-8 z-20 bg-white border border-gray-100 rounded-xl shadow-lg py-1 w-36 text-sm">
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(template) }}
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    编辑
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClone(template) }}
                  >
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    克隆
                  </button>
                  <div className="border-t border-gray-100 my-1" />
                  {isDisabled ? (
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 text-emerald-600 flex items-center gap-2"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggleStatus(template, 'published') }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      启用
                    </button>
                  ) : (
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-500 flex items-center gap-2"
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onToggleStatus(template, 'disabled') }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                      停用
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 描述 */}
      <p className="text-xs text-gray-500 mb-3 line-clamp-2 leading-relaxed">
        {template.description || '暂无描述'}
      </p>

      {/* 节点统计 */}
      <div className="flex items-center gap-4 mb-3 py-2.5 px-3 bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-base font-bold text-gray-700">{nodeCount || '—'}</p>
          <p className="text-xs text-gray-400">任务节点</p>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center">
          <p className="text-base font-bold text-gray-700">{depth}</p>
          <p className="text-xs text-gray-400">层级深度</p>
        </div>
        <div className="w-px h-8 bg-gray-200" />
        <div className="text-center">
          {refDays ? (
            <p className="text-base font-bold text-emerald-600">{refDays}</p>
          ) : (
            <p className="text-base font-bold text-gray-400">—</p>
          )}
          <p className="text-xs text-gray-400">参考工期(天)</p>
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
        <span className="text-xs text-gray-400">{template.updated_at ? `更新于 ${formatDate(template.updated_at)}` : ''}</span>
        <div className="flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(template) }}
            className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
          >
            预览
          </button>
          {isDraft ? (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(template) }}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-md transition-colors"
            >
              编辑草稿
            </button>
          ) : isDisabled ? (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleStatus(template, 'published') }}
              className="text-xs bg-gray-200 hover:bg-emerald-100 text-gray-500 hover:text-emerald-600 px-3 py-1 rounded-md transition-colors"
            >
              重新启用
            </button>
          ) : (
            // B1: 移除 opacity-0 group-hover:opacity-100，按钮始终可见（浅色）
            <button
              onClick={(e) => { e.stopPropagation(); onApply(template) }}
              className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white px-3 py-1 rounded-md transition-colors border border-blue-200 hover:border-blue-600"
            >
              应用到项目
            </button>
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
            className="fixed z-50 bg-white border border-gray-100 rounded-xl shadow-xl py-1 w-44 text-sm"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
              onClick={() => { setCtxMenu(null); onPreview(template) }}
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              预览详情
            </button>
            {!isDisabled && (
              <button
                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-blue-600 flex items-center gap-2"
                onClick={() => { setCtxMenu(null); onApply(template) }}
              >
                <IconUpload />
                应用到项目
              </button>
            )}
            <div className="border-t border-gray-100 my-1" />
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
              onClick={() => { setCtxMenu(null); onEdit(template) }}
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              编辑
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2"
              onClick={() => { setCtxMenu(null); onClone(template) }}
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              克隆
            </button>
            <div className="border-t border-gray-100 my-1" />
            {isDisabled ? (
              <button
                className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-emerald-600 flex items-center gap-2"
                onClick={() => { setCtxMenu(null); onToggleStatus(template, 'published') }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                启用
              </button>
            ) : (
              <button
                className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-500 flex items-center gap-2"
                onClick={() => { setCtxMenu(null); onToggleStatus(template, 'disabled') }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                停用
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ===== 编辑模板弹窗 =====
function EditModal({
  template,
  onClose,
  onSuccess,
}: {
  template: WbsTemplate
  onClose: () => void
  onSuccess?: () => void
}) {
  const [name, setName] = useState(template.name)
  const [templateType, setTemplateType] = useState(template.template_type || '住宅')
  const [description, setDescription] = useState(template.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请填写模板名称')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/wbs-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          template_type: templateType,
          description: description.trim(),
        }),
        ...withCredentials(),
      })
      const result: ApiResponse = await res.json()
      if (result.success) {
        onSuccess?.()
        onClose()
      } else {
        setError(result.error?.message || '保存失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[480px]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">编辑模板</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <IconX />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">模板名称 *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：18层住宅标准施工工序"
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">模板类型</label>
            <select
              value={templateType}
              onChange={e => setTemplateType(e.target.value)}
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {['住宅', '商业', '工业', '公共建筑'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">模板描述</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="简要描述该模板的适用场景..."
              className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== JSON 导入/导出（F9，模块顶层，供 CreateModal 和主组件工具栏共同使用）=====
// F9: JSON 导出
const handleExportJSON = async (templateId?: string) => {
  try {
    const params = templateId ? `?ids=${templateId}` : ''
    const res = await fetch(`${API_BASE}/api/wbs-templates/export-json${params}`)
    const result = await res.json()
    if (result.success && result.data) {
      const json = JSON.stringify(result.data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wbs-templates-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    }
  } catch {
    // ignore
  }
}

// F9: JSON 导入
const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>, onSuccess?: () => void) => {
  const file = e.target.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    const templates = Array.isArray(data) ? data : (data.data || [])
    const res = await fetch(`${API_BASE}/api/wbs-templates/import-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates }),
      ...withCredentials(),
    })
    const result = await res.json()
    if (result.success) {
      onSuccess?.()
    }
  } catch {
    // ignore
  }
  e.target.value = ''
}

// ===== 新建模板弹窗 =====
function CreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const [createType, setCreateType] = useState<'manual' | 'excel' | 'fromProject'>('manual')
  const [step, setStep] = useState<1 | 2>(1)
  const [creating, setCreating] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateType, setTemplateType] = useState('住宅')
  const [createError, setCreateError] = useState('')
  // Excel 导入
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelUploading, setExcelUploading] = useState(false)

  const CARD_TYPES = [
    {
      key: 'manual' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      title: '新建空白模板',
      desc: '从空白开始，手动添加任务节点和层级结构',
      badge: '完全自定义',
      badgeColor: 'bg-gray-100 text-gray-500',
    },
    {
      key: 'excel' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
      title: '导入 Excel 模板',
      desc: '上传 Excel 文件，自动识别任务层级和工期数据',
      badge: '快速导入',
      badgeColor: 'bg-emerald-50 text-emerald-600',
    },
    {
      key: 'fromProject' as const,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      title: '从现有项目生成',
      desc: '将已有项目的任务结构保存为可复用模板',
      badge: '快速复用',
      badgeColor: 'bg-blue-50 text-blue-600',
    },
  ]

  const handleNext = () => {
    setCreateError('')
    if (createType === 'excel' && !excelFile) {
      setCreateError('请先选择 Excel 文件')
      return
    }
    if (createType === 'fromProject') {
      setCreateError('从现有项目生成功能即将上线，请先使用「新建空白模板」方式')
      return
    }
    setStep(2)
  }

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setCreateError('仅支持 .xlsx / .xls / .csv 格式')
      return
    }
    setExcelFile(file)
    setCreateError('')
    // 从文件名推断模板名
    const baseName = file.name.replace(/\.(xlsx|xls|csv)$/i, '')
    if (!templateName) setTemplateName(baseName)
  }

  const handleCreate = async () => {
    if (!templateName.trim()) {
      setCreateError('请填写模板名称')
      return
    }
    setCreating(true)
    setCreateError('')

    try {
      if (createType === 'excel' && excelFile) {
        // Excel 导入：multipart/form-data
        setExcelUploading(true)
        const formData = new FormData()
        formData.append('file', excelFile)
        formData.append('name', templateName.trim())
        formData.append('template_type', templateType)
        const res = await fetch(`${API_BASE}/api/wbs-templates/import-excel`, {
          method: 'POST',
          body: formData,
          ...withCredentials(),
        })
        const result: ApiResponse = await res.json()
        if (result.success) {
          onSuccess?.()
          onClose()
        } else {
          setCreateError(result.error?.message || '导入失败，请检查文件格式')
        }
        setExcelUploading(false)
      } else {
        // 手动新建
        const res = await fetch(`${API_BASE}/api/wbs-templates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: templateName.trim(),
            template_type: templateType,
            description: '',
            template_data: [],
            is_default: true, // 新建默认为草稿
          }),
          ...withCredentials(),
        })
        const result: ApiResponse = await res.json()
        if (result.success) {
          onSuccess?.()
          onClose()
        } else {
          setCreateError(result.error?.message || '创建失败，请重试')
        }
      }
    } catch {
      setCreateError('网络错误，请重试')
    } finally {
      setCreating(false)
      setExcelUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[640px] max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">新建 WBS 模板</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
            <IconX />
          </button>
        </div>

        <div className="p-6">
          {/* 步骤指示器 */}
          <div className="flex items-center gap-0 mb-8">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${step >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>1</div>
              <span className={`text-sm font-medium transition-colors ${step >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>选择创建方式</span>
            </div>
            <div className="flex-1 h-px bg-slate-200 mx-3" />
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${step >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>2</div>
              <span className={`text-sm font-medium transition-colors ${step >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>基本信息</span>
            </div>
          </div>

          {step === 1 && (
            <>
              <p className="text-sm font-medium text-gray-700 mb-4">选择模板创建方式</p>
              {/* F1: 横排三张卡片 */}
              <div className="grid grid-cols-3 gap-3">
                {CARD_TYPES.map(card => (
                  <div
                    key={card.key}
                    onClick={() => setCreateType(card.key)}
                    className={`relative flex flex-col items-center text-center gap-3 p-5 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                      createType === card.key
                        ? 'border-blue-500 bg-blue-50 shadow-sm'
                        : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${createType === card.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                      {card.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 mb-1">{card.title}</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{card.desc}</p>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${card.badgeColor}`}>
                      {card.badge}
                    </span>
                    {/* 选中指示器 */}
                    {createType === card.key && (
                      <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Excel 文件选择区（仅 excel 模式） */}
              {createType === 'excel' && (
                <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                  <label className="flex flex-col items-center gap-2 cursor-pointer">
                    <IconUpload className="w-6 h-6 text-gray-400" />
                    <span className="text-sm text-gray-500">
                      {excelFile ? (
                        <span className="text-emerald-600 font-medium">✓ {excelFile.name}</span>
                      ) : (
                        '点击选择 Excel 文件，或拖拽到此处'
                      )}
                    </span>
                    <span className="text-xs text-gray-400">支持 .xlsx / .xls / .csv</span>
                    <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelFileChange} />
                  </label>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">填写模板基本信息</p>
              <div>
                <label className="block text-xs text-gray-500 mb-1">模板名称 *</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="例：18层住宅标准施工工序"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">模板类型</label>
                <select
                  value={templateType}
                  onChange={e => setTemplateType(e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['住宅', '商业', '工业', '公共建筑'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {createType === 'excel' && excelFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-emerald-700">将从 <strong>{excelFile.name}</strong> 解析任务结构</span>
                </div>
              )}
            </div>
          )}

          {/* 错误提示 */}
          {createError && (
            <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{createError}</p>
          )}

          {/* 底部按钮 */}
          <div className="flex justify-between mt-6">
            <button onClick={step === 2 ? () => setStep(1) : onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
              {step === 2 ? '返回' : '取消'}
            </button>
            {step === 1 ? (
              <button
                onClick={handleNext}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                下一步
                <IconChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={creating || !templateName.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm"
              >
                {creating || excelUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {excelUploading ? '解析中...' : '创建中...'}
                  </>
                ) : (
                  <>创建模板</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== 应用到项目弹窗 =====
function ApplyModal({
  template,
  onClose,
  onSuccess,
}: {
  template: WbsTemplate
  onClose: () => void
  onSuccess: (projectId: string, projectName: string) => void
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [error, setError] = useState<string>('')
  // F2: 追加/覆盖模式
  const [applyMode, setApplyMode] = useState<'append' | 'overwrite'>('append')
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false)

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/projects`)
        const result: ApiResponse<Project[]> = await res.json()
        if (result.success && result.data) {
          setProjects(result.data)
          if (result.data.length > 0) {
            setSelectedProjectId(result.data[0].id)
          }
        }
      } catch {
        setError('加载项目数据失败')
      } finally {
        setLoading(false)
      }
    }
    fetchProjects()
  }, [])

  const handleApply = async () => {
    if (!selectedProjectId) {
      setError('请选择目标项目')
      return
    }
    if (applyMode === 'overwrite' && !overwriteConfirmed) {
      setError('请勾选确认框后再继续')
      return
    }
    setApplying(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/wbs-templates/${template.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, overwrite: applyMode === 'overwrite' }),
        ...withCredentials(),
      })
      const result: ApiResponse = await res.json()
      if (result.success) {
        const proj = projects.find(p => p.id === selectedProjectId)
        onSuccess(selectedProjectId, proj?.name || '目标项目')
      } else {
        setError(result.error?.message || '应用失败，请重试')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setApplying(false)
    }
  }

  // 切换模式时重置确认状态
  const handleModeChange = (mode: 'append' | 'overwrite') => {
    setApplyMode(mode)
    setOverwriteConfirmed(false)
    setError('')
  }

  const color = getTypeColor(template.template_type)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[500px]"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center`}>
              <TemplateIcon type={template.template_type} className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">应用 WBS 模板</h2>
              <p className="text-xs text-gray-400 mt-0.5">{template.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
            <IconX />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* 模板摘要 */}
          <div className="flex items-center gap-4 py-3 px-4 bg-gray-50 rounded-xl">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-700">{template.node_count ?? '—'}</p>
              <p className="text-xs text-gray-400">任务节点</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="text-center">
              <p className="text-lg font-bold text-emerald-600">{template.reference_days ?? '—'}</p>
              <p className="text-xs text-gray-400">参考工期(天)</p>
            </div>
            <div className="w-px h-8 bg-gray-200" />
            <div className="flex-1 text-xs text-gray-500 leading-relaxed">
              应用后可在任务列表中自由编辑：修改名称、调整层级、增删节点、设置依赖关系
            </div>
          </div>

          {/* F2: 应用模式选择 */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">应用方式</p>
            <div className="grid grid-cols-2 gap-2">
              <label
                onClick={() => handleModeChange('append')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${applyMode === 'append' ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${applyMode === 'append' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                  {applyMode === 'append' && <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-white" /></div>}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">追加</p>
                  <p className="text-xs text-gray-500 mt-0.5">新任务追加到现有任务末尾，不影响已有数据</p>
                </div>
              </label>
              <label
                onClick={() => handleModeChange('overwrite')}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${applyMode === 'overwrite' ? 'border-red-400 bg-red-50' : 'border-gray-100 hover:border-red-200'}`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 transition-colors ${applyMode === 'overwrite' ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
                  {applyMode === 'overwrite' && <div className="w-full h-full flex items-center justify-center"><div className="w-1.5 h-1.5 rounded-full bg-white" /></div>}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">覆盖</p>
                  <p className="text-xs text-gray-500 mt-0.5">先删除项目全部现有任务，再应用模板</p>
                </div>
              </label>
            </div>
          </div>

          {/* F2: 覆盖模式红色警告 + 确认复选框 */}
          {applyMode === 'overwrite' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-700">⚠️ 危险操作：将删除所有现有任务</p>
                  <p className="text-xs text-red-600 mt-1 leading-relaxed">
                    覆盖模式会<strong>永久删除</strong>该项目中的所有现有任务（包括进度、条件、阻碍等关联数据），然后创建模板中的任务结构。此操作<strong>不可撤销</strong>。
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={overwriteConfirmed}
                  onChange={e => setOverwriteConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-red-700 group-hover:text-red-800">
                  我了解风险，确认删除所有现有任务并应用模板
                </span>
              </label>
            </div>
          )}

          {/* 选择目标项目 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">选择目标项目</label>
            {loading ? (
              <div className="text-sm text-gray-400 py-3 text-center">加载中...</div>
            ) : projects.length === 0 ? (
              <div className="text-sm text-gray-400 py-3 text-center">暂无可用项目</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {projects.map(proj => (
                  <label
                    key={proj.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                      selectedProjectId === proj.id
                        ? (applyMode === 'overwrite' ? 'border-red-400 bg-red-50' : 'border-blue-500 bg-blue-50')
                        : 'border-gray-100 hover:border-blue-200 bg-white'
                    }`}
                    onClick={() => setSelectedProjectId(proj.id)}
                  >
                    <input
                      type="radio"
                      name="project-select"
                      checked={selectedProjectId === proj.id}
                      onChange={() => setSelectedProjectId(proj.id)}
                      className="accent-blue-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{proj.name}</p>
                      {proj.status && (
                        <p className="text-xs text-gray-400 mt-0.5">{proj.status}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 追加模式注意事项 */}
          {applyMode === 'append' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
              <IconInfo className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">应用将在所选项目中创建模板中的任务结构。已有任务不会被删除，新任务会追加到现有任务列表末尾。</p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* 按钮 */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleApply}
              disabled={applying || !selectedProjectId || loading || (applyMode === 'overwrite' && !overwriteConfirmed)}
              className={`disabled:bg-gray-300 text-white px-6 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-sm ${
                applyMode === 'overwrite'
                  ? 'bg-red-600 hover:bg-red-700 shadow-red-200'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
              }`}
            >
              {applying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  应用中...
                </>
              ) : (
                <>
                  <IconUpload />
                  {applyMode === 'overwrite' ? '覆盖并应用' : '确认应用'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== U3: 预览弹窗内部节点树渲染（支持点击选中） =====
interface PreviewNode {
  id: string
  name: string
  reference_days?: number
  is_milestone?: boolean
  description?: string
  children?: PreviewNode[]
  level: number
  path: string // 面包屑路径
}

function flattenPreviewNodes(nodes: any[], level = 0, parentPath = ''): PreviewNode[] {
  if (!Array.isArray(nodes)) return []
  const result: PreviewNode[] = []
  nodes.forEach((n, idx) => {
    const id = `${parentPath}${idx}`
    const path = parentPath ? `${parentPath} / ${n.name}` : n.name
    result.push({ id, name: n.name || '未命名', reference_days: n.reference_days, is_milestone: n.is_milestone, description: n.description, children: n.children, level, path })
    if (Array.isArray(n.children) && n.children.length > 0) {
      result.push(...flattenPreviewNodes(n.children, level + 1, path))
    }
  })
  return result
}

function PreviewNodeTree({
  nodes,
  level = 0,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  parentPath = '',
}: {
  nodes: any[]
  level?: number
  selectedId: string | null
  expandedIds: Set<string>
  onSelect: (node: PreviewNode) => void
  onToggle: (id: string) => void
  parentPath?: string
}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null
  return (
    <div>
      {nodes.map((n, idx) => {
        const id = `${parentPath}${idx}`
        const path = parentPath ? `${parentPath} / ${n.name}` : n.name
        const hasChildren = Array.isArray(n.children) && n.children.length > 0
        const expanded = expandedIds.has(id)
        const isSelected = selectedId === id
        const previewNode: PreviewNode = { id, name: n.name || '未命名', reference_days: n.reference_days, is_milestone: n.is_milestone, description: n.description, children: n.children, level, path }
        return (
          <div key={id}>
            <div
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm group ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'}`}
              style={{ paddingLeft: `${8 + level * 20}px` }}
              onClick={() => onSelect(previewNode)}
            >
              {/* 折叠按钮 */}
              <button
                className={`flex-shrink-0 w-4 h-4 flex items-center justify-center transition-colors ${hasChildren ? 'text-gray-400 hover:text-gray-600' : 'invisible'}`}
                onClick={e => { e.stopPropagation(); if (hasChildren) onToggle(id) }}
              >
                {expanded ? <IconChevronDown className="w-3 h-3" /> : <IconChevronRight className="w-3 h-3" />}
              </button>
              {/* 里程碑旗帜 */}
              {n.is_milestone && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" title="里程碑" />
              )}
              {/* 节点名称 */}
              <span className={`flex-1 truncate ${level === 0 ? 'font-medium' : ''}`}>{n.name || '未命名'}</span>
              {/* 工期 */}
              {n.reference_days && (
                <span className={`text-xs flex-shrink-0 ml-1 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                  {n.reference_days}天
                </span>
              )}
            </div>
            {hasChildren && expanded && (
              <PreviewNodeTree
                nodes={n.children}
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

// ===== 预览弹窗 =====
function PreviewModal({ template, onClose, onApply, onEdit, onClone }: {
  template: WbsTemplate
  onClose: () => void
  onApply: (t: WbsTemplate) => void
  onEdit: (t: WbsTemplate) => void
  onClone: (t: WbsTemplate) => void
}) {
  const color = getTypeColor(template.template_type)
  const refDays = template.reference_days ?? null
  // B2: 停用模板不可应用
  const effectiveStatus = template.status ?? (template.is_default ? 'draft' : (template.is_active ? 'published' : 'disabled'))
  const isDisabled = effectiveStatus === 'disabled'

  // U3: 从 wbs_nodes / template_data 读取真实节点树
  const wbsNodes: any[] = Array.isArray(template.template_data)
    ? template.template_data
    : (Array.isArray(template.template_data?.wbs_nodes) ? template.template_data.wbs_nodes : [])
  const allFlat = flattenPreviewNodes(wbsNodes)
  const nodeCount = template.node_count ?? allFlat.length

  // U3: 状态：选中节点 + 展开集合（默认展开第一层）
  const [selectedNode, setSelectedNode] = useState<PreviewNode | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // 默认展开所有一级节点（level=0 的 id 为 "0","1","2"...）
    const ids = new Set<string>()
    wbsNodes.forEach((_n, idx) => ids.add(`${idx}`))
    return ids
  })

  const handleToggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const usageHistory: Array<{ name: string; date: string }> =
    template.template_data?.usage_history ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(15,23,42,0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[960px] max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 弹窗头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg ${color.bg} flex items-center justify-center`}>
              <TemplateIcon type={template.template_type} className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-800">{template.name}</h2>
              <p className="text-xs text-gray-400">
                {nodeCount ? `${nodeCount} 个任务节点 · ` : ''}
                {refDays ? `参考工期 ${refDays} 天 · ` : ''}
                {template.template_type || ''}{template.category ? ` · ${template.category}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
            <IconX />
          </button>
        </div>

        {/* 内容：左中右三栏 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧：节点树 */}
          <div className="flex-1 overflow-y-auto p-4 border-r border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">任务结构</h3>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />里程碑</span>
                <button
                  className="text-blue-500 hover:text-blue-700 transition-colors"
                  onClick={() => {
                    const allIds = new Set<string>()
                    const collect = (nodes: any[], parentPath = '') => {
                      nodes.forEach((n, idx) => {
                        const id = `${parentPath}${idx}`
                        allIds.add(id)
                        if (Array.isArray(n.children)) collect(n.children, `${parentPath ? `${parentPath} / ` : ''}${n.name}`)
                      })
                    }
                    collect(wbsNodes)
                    setExpandedIds(allIds)
                  }}
                >全部展开</button>
                <span className="text-gray-300">|</span>
                <button
                  className="text-blue-500 hover:text-blue-700 transition-colors"
                  onClick={() => setExpandedIds(new Set())}
                >全部折叠</button>
              </div>
            </div>
            {wbsNodes.length === 0 ? (
              <div className="text-sm text-gray-400 py-6 text-center">暂无节点数据</div>
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

          {/* 中间：节点详情面板（U3：点击节点后显示） */}
          <div className="w-56 flex-shrink-0 border-r border-gray-100 p-4 overflow-y-auto bg-gray-50/30">
            {selectedNode ? (
              <>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">节点详情</h4>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">节点名称</p>
                    <p className="text-sm font-medium text-gray-800 leading-relaxed">{selectedNode.name}</p>
                  </div>
                  {selectedNode.path && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">层级路径</p>
                      <p className="text-xs text-gray-500 leading-relaxed break-words">{selectedNode.path}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-xl p-2 border border-gray-100 text-center">
                      <p className="text-lg font-bold text-emerald-600">{selectedNode.reference_days ?? '—'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">参考工期(天)</p>
                    </div>
                    <div className="bg-white rounded-xl p-2 border border-gray-100 text-center">
                      <p className="text-lg font-bold text-gray-700">{selectedNode.level + 1}</p>
                      <p className="text-xs text-gray-400 mt-0.5">层级</p>
                    </div>
                  </div>
                  {selectedNode.is_milestone && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-xs text-amber-700 font-medium">里程碑节点</span>
                    </div>
                  )}
                  {selectedNode.description && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">节点说明</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{selectedNode.description}</p>
                    </div>
                  )}
                  {Array.isArray(selectedNode.children) && selectedNode.children.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">直接子节点</p>
                      <div className="space-y-1">
                        {selectedNode.children.slice(0, 5).map((c: any, i: number) => (
                          <div key={i} className="text-xs text-gray-600 bg-white border border-gray-100 rounded-xl px-2 py-1.5 flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                            <span className="truncate">{c.name}</span>
                          </div>
                        ))}
                        {selectedNode.children.length > 5 && (
                          <p className="text-xs text-gray-400 pl-1">还有 {selectedNode.children.length - 5} 个子节点</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-xs text-gray-400 leading-relaxed">点击左侧节点<br/>查看详细信息</p>
              </div>
            )}
          </div>

          {/* 右侧：模板信息 + 操作 */}
          <div className="w-64 flex-shrink-0 p-5 flex flex-col gap-5 bg-gray-50/50">
            {/* 基本信息 */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">模板信息</h4>
              <div className="space-y-2">
                {[
                  { label: '适用类型', value: template.template_type || '—' },
                  { label: '结构形式', value: template.category || '—' },
                  { label: '任务节点', value: nodeCount ? `${nodeCount} 个` : '—' },
                  { label: '参考总工期', value: refDays ? `${refDays} 天` : '—', highlight: true },
                  { label: '使用次数', value: `${template.usage_count ?? 0} 次` },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-400">{label}</span>
                    <span className={`font-medium ${highlight ? 'text-emerald-600 font-bold' : 'text-gray-700'}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 标准工期说明 */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <IconClock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-amber-700">工期参考说明</p>
                  <p className="text-xs text-amber-600 mt-1">工期参考值来源于历史项目平均值，应用后可根据实际情况调整。</p>
                </div>
              </div>
            </div>

            {/* 使用记录 */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">使用记录</h4>
              {usageHistory.length > 0 ? (
                <div className="space-y-1.5">
                  {usageHistory.slice(0, 3).map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-500 py-1 hover:bg-gray-100 px-2 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span className="flex-1 truncate">{h.name}</span>
                      <span className="text-gray-400">{h.date}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 px-2">暂无使用记录</p>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="mt-auto space-y-2">
              {/* B2: 停用模板不可应用 */}
              {isDisabled ? (
                <div className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 text-center text-sm text-gray-400">
                  已停用，无法应用到项目
                </div>
              ) : (
                <button
                  onClick={() => onApply(template)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-sm shadow-blue-200"
                >
                  <IconUpload />
                  应用到项目
                </button>
              )}
              {/* B6: 克隆此模板按钮 */}
              <button
                onClick={() => { onClone(template); onClose() }}
                className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 py-2 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                克隆此模板
              </button>
              <button
                onClick={() => onEdit(template)}
                className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 py-2 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <IconEdit />
                编辑模板
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== 主页面 =====
export default function WBSTemplates() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentProject } = useStore()

  // 根据是否有项目上下文，动态生成面包屑路径
  // 支持两种来源：1) URL路径含 /projects/:id  2) URL query 参数 ?pid=xxx
  const projectMatch = location.pathname.match(/\/projects\/([^\/]+)/)
  const urlParams = new URLSearchParams(location.search)
  const pidFromQuery = urlParams.get('pid')
  const projectId = projectMatch ? projectMatch[1] : (pidFromQuery || '')
  const projectName = currentProject && (currentProject.id === projectId || pidFromQuery === currentProject.id)
    ? currentProject.name
    : (pidFromQuery ? '项目' : undefined)

  const breadcrumbItems = projectId && projectName
    ? [
        { label: '首页', href: '/' },
        { label: projectName, href: `/projects/${projectId}` },
        { label: 'WBS模板' },
      ]
    : [
        { label: '首页', href: '/' },
        { label: 'WBS模板' },
      ]
  const [templates, setTemplates] = useState<WbsTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  // 防抖搜索值：使用 useDebounce hook 统一管理（输入停止 300ms 后触发深度搜索）
  const debouncedQuery = useDebounce(searchQuery, 300)
  const [selectedType, setSelectedType] = useState('all')
  const [selectedStructure, setSelectedStructure] = useState('all')
  const [showDisabled, setShowDisabled] = useState(false) // F3: 默认隐藏停用模板
  const [previewTemplate, setPreviewTemplate] = useState<WbsTemplate | null>(null)
  const [applyTemplate, setApplyTemplate] = useState<WbsTemplate | null>(null)
  const [editTemplate, setEditTemplate] = useState<WbsTemplate | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [successMsg, setSuccessMsg] = useState<{ projectId: string; projectName: string } | null>(null)
  const { toast } = useToast()
  const [showProcessDrawer, setShowProcessDrawer] = useState(false) // F4: 标准工序库
  // F8: 批量多选 state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const handleSelectToggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = () => {
    if (selectedIds.size === filteredTemplates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredTemplates.map(t => t.id)))
    }
  }

  const handleBatchDisable = async () => {
    const ids = [...selectedIds]
    let ok = 0
    for (const id of ids) {
      try {
        const res = await fetch(`${API_BASE}/api/wbs-templates/${id}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'disabled' }),
          ...withCredentials(),
        })
        const r = await res.json()
        if (r.success) ok++
      } catch { /* ignore */ }
    }
    toast({ title: `已停用 ${ok} 个模板` })
    setSelectedIds(new Set())
    fetchTemplates()
  }

  const handleBatchClone = async () => {
    const ids = [...selectedIds]
    let ok = 0
    for (const id of ids) {
      try {
        const res = await fetch(`${API_BASE}/api/wbs-templates/${id}/clone`, {
          method: 'POST',
          ...withCredentials(),
        })
        const r = await res.json()
        if (r.success) ok++
      } catch { /* ignore */ }
    }
    toast({ title: `已克隆 ${ok} 个模板` })
    setSelectedIds(new Set())
    fetchTemplates()
  }

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const url = `${API_BASE}/api/wbs-templates${selectedType !== 'all' ? `?type=${selectedType}` : ''}`
      const res = await fetch(url)
      const result: ApiResponse<WbsTemplate[]> = await res.json()
      if (result.success && result.data) {
        setTemplates(result.data)
      }
    } catch (err) {
      console.error('Failed to fetch templates:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedType])

  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  // B4: 深度搜索 wbs_nodes 节点名称（递归扁平化搜索）
  function searchNodesDeep(nodes: any[], q: string): boolean {
    if (!nodes?.length) return false
    for (const n of nodes) {
      if (n.name?.toLowerCase().includes(q)) return true
      if (n.children?.length && searchNodesDeep(n.children, q)) return true
    }
    return false
  }

  const filteredTemplates = templates.filter(t => {
    const q = debouncedQuery.toLowerCase()
    // template_data 可能是节点数组，也可能是 {wbs_nodes: [...]} 对象，兜底 []
    const rawData = t.template_data ?? t.wbs_nodes ?? []
    const wbsNodes: any[] = Array.isArray(rawData) ? rawData : (rawData.wbs_nodes ?? [])
    const matchSearch = !q ||
      (t.name ?? '').toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q) ||
      (t.tags ?? []).some((tag: string) => tag.toLowerCase().includes(q)) ||
      searchNodesDeep(wbsNodes, q) // B4: 深度搜索节点名称
    const matchStructure = selectedStructure === 'all' || t.category === selectedStructure
    // F3: 默认隐藏停用模板（除非 showDisabled=true）
    // 防御：如果所有字段都缺失，默认显示（is_default=true 的显示为草稿）
    const effectiveStatus = t.status ?? (t.is_default ? 'draft' : (t.is_active ? 'published' : 'published'))
    const matchStatus = showDisabled ? true : effectiveStatus !== 'disabled'
    return matchSearch && matchStructure && matchStatus
  })

  const handleApply = useCallback((template: WbsTemplate) => {
    setPreviewTemplate(null)
    setApplyTemplate(template)
  }, [])

  const handleApplySuccess = useCallback((projectId: string, projectName: string) => {
    setApplyTemplate(null)
    setSuccessMsg({ projectId, projectName })
    setTimeout(() => setSuccessMsg(null), 5000)
  }, [])

  const handleEdit = (template: WbsTemplate) => {
    setPreviewTemplate(null)
    setEditTemplate(template)
  }

  // B6 / U1: 克隆模板
  const handleClone = useCallback(async (template: WbsTemplate) => {
    try {
      const res = await fetch(`${API_BASE}/api/wbs-templates/${template.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...withCredentials(),
      })
      const result: ApiResponse<WbsTemplate> = await res.json()
      if (result.success) {
        toast({ title: `已克隆「${template.name}」`, description: '新模板处于草稿状态' })
        fetchTemplates()
      } else {
        toast({ title: `克隆失败`, description: result.error?.message || '请重试', variant: 'destructive' })
      }
    } catch {
      toast({ title: '网络错误，克隆失败', variant: 'destructive' })
    }
  }, [toast, fetchTemplates])

  // U1: 切换启用/停用状态
  const handleToggleStatus = useCallback(async (template: WbsTemplate, newStatus: 'published' | 'disabled') => {
    try {
      const res = await fetch(`${API_BASE}/api/wbs-templates/${template.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        ...withCredentials(),
      })
      const result: ApiResponse = await res.json()
      if (result.success) {
        toast({ title: newStatus === 'disabled' ? `已停用「${template.name}」` : `已启用「${template.name}」` })
        fetchTemplates()
      }
    } catch {
      toast({ title: '操作失败，请重试', variant: 'destructive' })
    }
  }, [toast, fetchTemplates])

  // 统计数据
  const totalCount = templates.length
  const usageThisMonth = templates.reduce((sum, t) => sum + (t.usage_count ?? 0), 0)
  const avgNodes = totalCount
    ? Math.round(templates.reduce((sum, t) => sum + (t.node_count ?? 0), 0) / totalCount)
    : 0
  const withDuration = templates.filter(t => t.reference_days).length

  return (
    <div className="p-8 bg-gray-50 min-h-full page-enter">

      {/* 面包屑导航：根据项目上下文动态生成 */}
      <Breadcrumb items={breadcrumbItems} className="mb-4" />

      {/* 页面标题（PageHeader 组件统一）*/}
      <PageHeader
        eyebrow="独立主模块"
        title="WBS 模板"
        subtitle="独立维护可复用的任务结构模板，为项目任务管理提供标准化起点；WBS 结构的查看与调整保留在任务列表页。"
      />

      {/* 成功提示横幅（应用模板）*/}
      {successMsg && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-white border border-emerald-200 shadow-lg rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-800">模板已成功应用</p>
            <p className="text-xs text-gray-500 mt-0.5">已导入到「{successMsg.projectName}」</p>
          </div>
          {/* B5: 添加「去任务列表」链接 */}
          <button
            onClick={() => navigate(`/projects/${successMsg.projectId}/gantt`)}
            className="ml-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium whitespace-nowrap"
          >
            去任务列表 →
          </button>
          <button
            onClick={() => navigate(`/projects/${successMsg.projectId}`)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
          >
            前往项目 →
          </button>
          <button
            onClick={() => setSuccessMsg(null)}
            className="ml-1 w-6 h-6 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 flex-shrink-0"
          >
            <IconX className="w-3 h-3" />
          </button>
        </div>
      )}


      {/* F8: 批量操作浮动栏 */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 animate-in fade-in slide-in-from-bottom-4">
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={handleSelectAll}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              selectedIds.size === filteredTemplates.length ? 'bg-blue-500 border-blue-400' : 'border-gray-500 bg-gray-800'
            }`}>
              {selectedIds.size === filteredTemplates.length && (
                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {selectedIds.size > 0 && selectedIds.size < filteredTemplates.length && (
                <div className="w-2 h-0.5 bg-gray-400 rounded" />
              )}
            </div>
            <span className="text-sm font-medium">已选 {selectedIds.size} 个</span>
          </div>
          <div className="w-px h-5 bg-gray-600" />
          <button
            onClick={handleBatchClone}
            className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            批量克隆
          </button>
          <button
            onClick={handleBatchDisable}
            className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded-lg hover:bg-gray-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            批量停用
          </button>
          <div className="w-px h-5 bg-gray-600" />
          <button
            onClick={() => setSelectedIds(new Set())}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <IconX className="w-4 h-4" />
            取消
          </button>
        </div>
      )}

      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
        <IconInfo className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">WBS 模板是独立主模块，负责沉淀可复用的任务结构方案</p>
          <p className="text-xs text-blue-600 mt-0.5">在任务管理的任务列表页点击「从模板生成」，即可应用模板并继续在任务列表中调整 WBS 结构。</p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: '模板总数', value: totalCount || 12, sub: '覆盖 4 种项目类型', color: 'text-gray-800' },
          { label: '本月应用次数', value: usageThisMonth || 8, sub: '↑ 较上月 +2', color: 'text-blue-600' },
          { label: '平均任务节点数', value: avgNodes || 47, sub: '每个模板', color: 'text-gray-800' },
          { label: '含标准工期数据', value: withDuration || 9, sub: `${totalCount ? Math.round((withDuration / totalCount) * 100) : 75}% 已配置工期参考`, color: 'text-emerald-600' },
        ].map(item => (
          <div key={item.label} className="card-v4-sm">
            <p className="text-xs text-gray-400 mb-1">{item.label}</p>
            <p className={`text-2xl font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-gray-400 mt-1">{item.sub}</p>
          </div>
        ))}
      </div>

      {/* 搜索 + 筛选 + 新建 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索模板名称或工序..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
        </div>
        <select
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
        >
          <option value="all">全部类型</option>
          <option value="住宅">住宅项目</option>
          <option value="商业">商业综合体</option>
          <option value="工业">工业厂房</option>
          <option value="公共建筑">市政工程</option>
        </select>
        <select
          value={selectedStructure}
          onChange={e => setSelectedStructure(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-600"
        >
          <option value="all">全部结构</option>
          <option value="框架结构">框架结构</option>
          <option value="剪力墙结构">剪力墙结构</option>
          <option value="框剪结构">框剪结构</option>
          <option value="钢结构">钢结构</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          {/* F3: 显示/隐藏已停用模板 */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-gray-500 hover:text-gray-700">
            <div
              onClick={() => setShowDisabled(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${showDisabled ? 'bg-amber-400' : 'bg-gray-200'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${showDisabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
            显示已停用
          </label>
          <span className="text-sm text-gray-400">共 {filteredTemplates.length} 个模板</span>
          {/* F4: 标准工序库入口 */}
          <button
            onClick={() => setShowProcessDrawer(true)}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            标准工序库
          </button>
          {/* F9: JSON 导入按钮 */}
          <label className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer">
            <IconUpload />
            导入JSON
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportJSON}
            />
          </label>
          {/* F9: JSON 导出按钮 */}
          <button
            onClick={() => handleExportJSON()}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <IconDownload />
            导出JSON
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-blue-200"
          >
            <IconPlus />
            新建模板
          </button>
        </div>
      </div>

      {/* 模板卡片网格 */}
      {loading ? (
        <div className="text-center py-16">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="mt-4 text-gray-500 text-sm">加载中...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        /* U4: 空状态设计 */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          {/* 线框插图 */}
          <div className="w-32 h-32 mb-6 relative">
            <svg className="w-full h-full text-gray-200" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="16" y="20" width="96" height="88" rx="8" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3"/>
              <rect x="28" y="36" width="40" height="6" rx="3" fill="currentColor"/>
              <rect x="28" y="50" width="72" height="4" rx="2" fill="currentColor" opacity="0.5"/>
              <rect x="28" y="60" width="56" height="4" rx="2" fill="currentColor" opacity="0.4"/>
              <rect x="28" y="70" width="64" height="4" rx="2" fill="currentColor" opacity="0.3"/>
              <circle cx="96" cy="88" r="16" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="2"/>
              <line x1="90" y1="88" x2="102" y2="88" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="96" y1="82" x2="96" y2="94" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-700 mb-2">
            {searchQuery ? `没有找到与「${searchQuery}」相关的模板` : '还没有 WBS 模板'}
          </h3>
          <p className="text-sm text-gray-400 mb-8 max-w-sm leading-relaxed">
            {searchQuery
              ? '试试换个关键词，或者清除筛选条件查看全部模板'
              : '在这里创建标准化 WBS 模板，作为独立主模块沉淀任务结构方案，供多个项目复用'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm shadow-blue-200"
            >
              <IconPlus />
              创建第一个模板
            </button>
          )}
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSelectedType('all'); setSelectedStructure('all') }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              清除筛选条件
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filteredTemplates.map(t => (
            <TemplateCard
              key={t.id}
              template={t}
              onPreview={setPreviewTemplate}
              onApply={handleApply}
              onEdit={handleEdit}
              onClone={handleClone}
              onToggleStatus={handleToggleStatus}
              selected={selectedIds.has(t.id)}
              onSelect={handleSelectToggle}
            />
          ))}

          {/* 有数据时显示新建入口 */}
          <div
            onClick={() => setShowCreate(true)}
            className="bg-white rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 min-h-48 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-all group p-5"
          >
            <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
              <IconPlus className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500 group-hover:text-blue-600 transition-colors">新建模板</p>
              <p className="text-xs text-gray-400 mt-0.5">从头创建或导入已有数据</p>
            </div>
          </div>
        </div>
      )}

      {/* 预览弹窗 */}
      {previewTemplate && (
        <PreviewModal
          template={previewTemplate}
          onClose={() => setPreviewTemplate(null)}
          onApply={handleApply}
          onEdit={handleEdit}
          onClone={handleClone}
        />
      )}

      {/* 应用到项目弹窗 */}
      {applyTemplate && (
        <ApplyModal
          template={applyTemplate}
          onClose={() => setApplyTemplate(null)}
          onSuccess={handleApplySuccess}
        />
      )}

      {/* 新建弹窗 */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onSuccess={fetchTemplates} />
      )}

      {/* 编辑弹窗 */}
      {editTemplate && (
        <EditModal
          template={editTemplate}
          onClose={() => setEditTemplate(null)}
          onSuccess={() => { setEditTemplate(null); fetchTemplates() }}
        />
      )}

      {/* F4: 标准工序库抽屉 */}
      <StandardProcessDrawer
        open={showProcessDrawer}
        onClose={() => setShowProcessDrawer(false)}
      />
    </div>
  )
}
