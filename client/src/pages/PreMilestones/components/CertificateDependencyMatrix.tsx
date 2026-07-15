import { CheckCircle2, Circle, Slash, AlertTriangle } from 'lucide-react'
import type { CertificateDependencyMatrixRow } from '../types'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface CertificateDependencyMatrixProps {
  rows: CertificateDependencyMatrixRow[]
  selectedCertificateId?: string | null
  selectedWorkItemId?: string | null
  onSelectCertificate: (certificateId: string) => void
  onSelectWorkItem: (workItemId: string) => void
}

const cellConfig = {
  satisfied: {
    icon: CheckCircle2,
    label: '已满足',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  pending: {
    icon: Circle,
    label: '待办',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  blocked: {
    icon: AlertTriangle,
    label: '阻塞',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  none: {
    icon: Slash,
    label: '无关',
    className: 'bg-white text-slate-500 border-slate-200',
  },
} as const

const dependencyKindConfig = {
  hard: {
    label: '强依赖',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  soft: {
    label: '软依赖',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
  },
} as const

const MATRIX_LEFT_COLUMN_WIDTH = 220
const MATRIX_CELL_COLUMN_WIDTH = 150

export function CertificateDependencyMatrix({
  rows,
  selectedCertificateId,
  selectedWorkItemId,
  onSelectCertificate,
  onSelectWorkItem,
}: CertificateDependencyMatrixProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="暂无依赖矩阵"
        description="当前没有可展示的共享事项依赖关系。"
        className="rounded-xl empty-state-frame border-slate-200 bg-slate-50 py-8"
      />
    )
  }

  const matrixMinWidth = MATRIX_LEFT_COLUMN_WIDTH + (rows[0]?.cells.length ?? 0) * MATRIX_CELL_COLUMN_WIDTH

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-[var(--el-1)]">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-slate-900">轻量依赖矩阵</h4>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700 ring-1 ring-inset ring-amber-200/60">强依赖</span>
          <span className="rounded-full bg-sky-50 px-2 py-1 text-sky-700 ring-1 ring-inset ring-sky-200/60">软依赖</span>
        </div>
      </div>
      <div className="overflow-auto">
        <Table className="w-full table-fixed border-separate border-spacing-2" style={{ minWidth: matrixMinWidth }}>
          <TableCaption className="sr-only">前期证照共享事项依赖矩阵</TableCaption>
          <TableHeader className="sticky top-0 z-10 bg-white">
            <TableRow className="py-3">
              <TableHead scope="col" className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-medium text-slate-500" style={{ width: MATRIX_LEFT_COLUMN_WIDTH }}>证件 / 事项</TableHead>
              {rows[0]?.cells.map((cell) => (
                <TableHead scope="col" key={cell.work_item_id} className="px-3 py-2 text-xs font-medium text-slate-500" style={{ width: MATRIX_CELL_COLUMN_WIDTH }}>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => onSelectWorkItem(cell.work_item_id)}
                    className={`h-auto w-full min-w-0 rounded-lg border px-2 py-1 text-left transition-colors ${
                      selectedWorkItemId === cell.work_item_id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50'
                    }`}
                    title={cell.work_item_name}
                  >
                    <span className="block truncate">{cell.work_item_name}</span>
                  </Button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.certificate_id} className="py-3 even:bg-slate-50/50 hover:bg-slate-100/60">
                <TableHead scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left" style={{ width: MATRIX_LEFT_COLUMN_WIDTH }}>
                  <Button variant="ghost"
                    type="button"
                    onClick={() => onSelectCertificate(row.certificate_id)}
                    className={`h-auto w-full min-w-0 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                      selectedCertificateId === row.certificate_id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                    title={row.certificate_name}
                  >
                    <span className="block truncate">{row.certificate_name}</span>
                  </Button>
                </TableHead>
                {row.cells.map((cell) => {
                  const config = cellConfig[cell.status]
                  const Icon = config.icon
                  const active = selectedWorkItemId === cell.work_item_id || selectedCertificateId === row.certificate_id
                  const dependencyKind = cell.dependency_kind ? dependencyKindConfig[cell.dependency_kind] : null

                  return (
                    <TableCell key={`${row.certificate_id}-${cell.work_item_id}`} className="px-3 py-2" style={{ width: MATRIX_CELL_COLUMN_WIDTH }}>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => {
                          onSelectCertificate(row.certificate_id)
                          onSelectWorkItem(cell.work_item_id)
                        }}
                        className={`flex h-auto w-full min-w-0 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                          active ? 'ring-2 ring-blue-200' : ''
                        } ${config.className}`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{config.label}</span>
                        {dependencyKind ? (
                          <span className={`rounded-full border px-1.5 py-0.5 text-xs ${dependencyKind.className}`}>
                            {dependencyKind.label}
                          </span>
                        ) : null}
                      </Button>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
