import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ChartAccessibleWrapperProps {
  children: ReactNode
  columns: string[]
  rows: Array<Array<ReactNode>>
  summary?: string
  className?: string
  detailsClassName?: string
}

export function ChartAccessibleWrapper({
  children,
  columns,
  rows,
  summary = '查看数据表',
  className,
  detailsClassName,
}: ChartAccessibleWrapperProps) {
  const tableMinWidth = Math.max(480, columns.length * 128)

  return (
    <div className={className}>
      {children}
      <details className={cn('mt-2', detailsClassName)}>
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-600">
          {summary}
        </summary>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full table-fixed text-left text-xs" style={{ minWidth: tableMinWidth }}>
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="max-w-0 px-3 py-2 font-medium">
                    <span className="block truncate" title={column}>{column}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn('max-w-0 px-3 py-2 text-slate-600', typeof cell === 'number' && 'text-right tabular-nums')}
                      title={typeof cell === 'string' || typeof cell === 'number' ? String(cell) : undefined}
                    >
                      <span className="block truncate">{cell}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
