import React, { useCallback, useEffect, useState } from 'react'

import { useDialogFocusRestore } from '@/hooks/useDialogFocusRestore'
import { useDebounce } from '@/hooks/useDebounce'
import { LoadingState } from '@/components/ui/loading-state'

const API_BASE = ''

// ===== 类型 =====
interface StandardProcess {
  id: string
  name: string
  category: string
  phase?: string
  reference_days?: number
  description?: string
  tags?: string[]
  sort_order: number
}

interface Category {
  key: string
  label: string
  icon?: React.ReactNode
}

// ===== SVG 图标（替代 emoji） =====
const CategoryIcon = ({ category }: { category: string }) => {
  const iconProps = { className: 'w-3.5 h-3.5', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24' }
  switch (category) {
    case 'all':
      return <svg {...iconProps}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
    case 'civil':
      return <svg {...iconProps}><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0l2-1.5M5 19.5l2-1.5M9 10V5m0 0h4M9 5l4 5-4 5" /></svg>
    case 'structure':
      return <svg {...iconProps}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/></svg>
    case 'fitout':
      return <svg {...iconProps}><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
    case 'mep':
      return <svg {...iconProps}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
    case 'general':
      return <svg {...iconProps}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
    default:
      return <svg {...iconProps}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
  }
}

// 分类配置（本地备用，API也会返回）
const CATEGORIES: Category[] = [
  { key: 'all',       label: '全部' },
  { key: 'civil',     label: '土建' },
  { key: 'structure', label: '主体结构' },
  { key: 'fitout',    label: '装饰装修' },
  { key: 'mep',       label: '机电安装' },
  { key: 'general',   label: '通用' },
]

// ===== 主组件 =====
interface StandardProcessDrawerProps {
  /** 抽屉是否可见 */
  open: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 选中工序后的回调（可选，用于"引用到模板"功能）*/
  onSelect?: (process: StandardProcess) => void
}

export default function StandardProcessDrawer({
  open,
  onClose,
  onSelect,
}: StandardProcessDrawerProps) {
  useDialogFocusRestore(open)
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword, 300)
  const [activeCategory, setActiveCategory] = useState('all')
  const [processes, setProcesses] = useState<StandardProcess[]>([])
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>(CATEGORIES)

  // 搜索
  const fetchProcesses = useCallback(async (kw: string, cat: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (kw) params.set('q', kw)
      if (cat !== 'all') params.set('category', cat)
      const res = await fetch(`${API_BASE}/api/standard-processes?${params}`)
      const result = await res.json()
      if (result.success) setProcesses(result.data)
    } catch {
      // 网络错误静默处理
    } finally {
      setLoading(false)
    }
  }, [])

  // 获取分类列表
  useEffect(() => {
    fetch(`${API_BASE}/api/standard-processes/categories`)
      .then(r => r.json())
      .then(r => { if (r.success && r.data?.length) setCategories(r.data) })
      .catch(() => { /* 使用本地备用数据 */ })
  }, [])

  // 打开时加载数据
  useEffect(() => {
    if (open) {
      void fetchProcesses(debouncedKeyword, activeCategory)
    }
  }, [activeCategory, debouncedKeyword, fetchProcesses, open])

  if (!open) return null

  const getCategoryColor = (cat: string) => {
    const map: Record<string, string> = {
      civil:     'bg-amber-100 text-amber-700',
      structure: 'bg-blue-100 text-blue-700',
      fitout:    'bg-purple-100 text-purple-700',
      mep:       'bg-emerald-100 text-emerald-700',
      general:   'bg-gray-100 text-gray-600',
    }
    return map[cat] ?? 'bg-gray-100 text-gray-600'
  }

  const getCategoryLabel = (cat: string) =>
    categories.find(c => c.key === cat)?.label ?? cat

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 抽屉主体 */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-[480px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-800">标准工序库</h2>
            <p className="text-xs text-gray-400 mt-0.5">参考行业标准工序，可引用到 WBS 模板</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 搜索框 */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="搜索工序名称..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            />
            {keyword && (
              <button
                onClick={() => setKeyword('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 hover:text-gray-600"
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 分类 Tab */}
        <div className="px-6 py-2 border-b border-gray-100 flex gap-1 overflow-x-auto scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === cat.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <CategoryIcon category={cat.key} />
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* 列表内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <LoadingState
              label="标准工序加载中"
              description="正在读取可复用的标准工序清单"
              className="min-h-48"
            />
          ) : processes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <svg className="w-12 h-12 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-sm text-gray-500">未找到匹配的工序</p>
              <p className="text-xs text-gray-400 mt-1">尝试更换关键词或分类</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 mb-3">共 {processes.length} 条工序</p>
              {processes.map(p => (
                <div
                  key={p.id}
                  className="group bg-white border border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* 名称 + 分类标签 */}
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-gray-800 truncate">{p.name}</h4>
                        <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium ${getCategoryColor(p.category)}`}>
                          {getCategoryLabel(p.category)}
                        </span>
                      </div>

                      {/* 描述 */}
                      {p.description && (
                        <p className="text-xs text-gray-500 mb-2 leading-relaxed line-clamp-2">{p.description}</p>
                      )}

                      {/* 参考工期 + 标签 */}
                      <div className="flex items-center gap-3">
                        {p.reference_days != null && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            参考 {p.reference_days} 天
                          </span>
                        )}
                        {p.tags?.slice(0, 3).map((tag, i) => (
                          <span key={i} className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 引用按钮 */}
                    {onSelect && (
                      <button
                        onClick={() => onSelect(p)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        引用
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部提示 */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs text-gray-400 text-center">
            标准工序数据来源于行业规范，仅供参考
          </p>
        </div>
      </div>
    </>
  )
}
