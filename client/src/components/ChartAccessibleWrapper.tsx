import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ChartAccessibleWrapperProps {
  children: ReactNode
  columns: string[]
  rows: Array<Array<ReactNode>>
  summary?: string
  className?: string
}

export function ChartAccessibleWrapper({
  children,
  columns,
  rows,
  summary = '查看数据表',
  className,
}: ChartAccessibleWrapperProps) {
  return (
    <div className={className}>
      {children}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
          {summary}
        </summary>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="px-3 py-2 font-medium">
                    {column}
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
                      className={cn('px-3 py-2 text-slate-600', typeof cell === 'number' && 'text-right tabular-nums')}
                    >
                      {cell}
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
