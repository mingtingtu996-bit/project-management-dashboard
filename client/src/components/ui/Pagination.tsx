/**
 * 分页组件
 * 用于任务列表和报表数据的分页加载
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface PaginationProps {
  /** 当前页码 (1-based) */
  currentPage: number
  /** 总页数 */
  totalPages: number
  /** 每页条数 */
  pageSize: number
  /** 总条数 */
  totalItems: number
  /** 页码变化回调 */
  onPageChange: (page: number) => void
  /** 每页条数变化回调 */
  onPageSizeChange?: (size: number) => void
  /** 可选的每页条数选项 */
  pageSizeOptions?: number[]
}

export function Pagination({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100]
}: PaginationProps) {
  // 计算当前页显示的条目范围
  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  // 生成页码按钮
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      // 总页数少，直接显示所有
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // 复杂情况
      if (currentPage <= 3) {
        // 开头
        for (let i = 1; i <= 4; i++) pages.push(i)
        pages.push('ellipsis')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        // 结尾
        pages.push(1)
        pages.push('ellipsis')
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i)
      } else {
        // 中间
        pages.push(1)
        pages.push('ellipsis')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
        pages.push('ellipsis')
        pages.push(totalPages)
      }
    }

    return pages
  }

  if (totalItems === 0) {
    return null
  }

  return (
    <>
    <Separator />
    <div className="flex items-center justify-between bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-4">
        {/* 每页条数选择 */}
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">每页</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger aria-label="每页条数" className="h-8 w-[84px] rounded-md bg-background text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map(size => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">条</span>
          </div>
        )}

        {/* 条目范围 */}
        <span className="text-sm text-muted-foreground">
          第 {startItem}-{endItem} 条，共 {totalItems} 条
        </span>
      </div>

      {/* 分页按钮 */}
      <div className="flex items-center gap-1">
        {/* 首页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        {/* 上一页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* 页码 */}
        {getPageNumbers().map((page, idx) => (
          page === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-2">...</span>
          ) : (
            <Button
              key={page}
              variant={currentPage === page ? 'default' : 'ghost'}
              size="sm"
              className="w-9"
              onClick={() => onPageChange(page)}
            >
              {page}
            </Button>
          )
        ))}

        {/* 下一页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* 末页 */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
    </>
  )
}

/**
 * 分页 Hook
 * 用于管理分页状态
 */
import { useState, useMemo } from 'react'

interface UsePaginationOptions<T> {
  data: T[]
  initialPageSize?: number
}

interface UsePaginationResult<T> {
  /** 当前页数据 */
  currentData: T[]
  /** 当前页码 */
  currentPage: number
  /** 每页条数 */
  pageSize: number
  /** 总页数 */
  totalPages: number
  /** 总条数 */
  totalItems: number
  /** 设置页码 */
  setPage: (page: number) => void
  /** 设置每页条数 */
  setPageSize: (size: number) => void
  /** 跳转到第一页 */
  goToFirst: () => void
  /** 上一页 */
  goToPrev: () => void
  /** 下一页 */
  goToNext: () => void
}

export function usePagination<T>({
  data,
  initialPageSize = 20
}: UsePaginationOptions<T>): UsePaginationResult<T> {
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const totalItems = data.length
  const totalPages = Math.ceil(totalItems / pageSize)

  // 确保页码在有效范围内
  const validPage = useMemo(() => {
    if (currentPage < 1) return 1
    if (currentPage > totalPages && totalPages > 0) return totalPages
    return currentPage
  }, [currentPage, totalPages])

  // 获取当前页数据
  const currentData = useMemo(() => {
    const start = (validPage - 1) * pageSize
    const end = start + pageSize
    return data.slice(start, end)
  }, [data, validPage, pageSize])

  const setPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }

  const handleSetPageSize = (size: number) => {
    setPageSize(size)
    setCurrentPage(1) // 重置到第一页
  }

  return {
    currentData,
    currentPage: validPage,
    pageSize,
    totalPages: totalPages || 1,
    totalItems,
    setPage,
    setPageSize: handleSetPageSize,
    goToFirst: () => setPage(1),
    goToPrev: () => setPage(validPage - 1),
    goToNext: () => setPage(validPage + 1)
  }
}
