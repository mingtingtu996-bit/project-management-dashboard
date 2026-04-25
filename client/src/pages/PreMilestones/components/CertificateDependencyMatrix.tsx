import { CheckCircle2, Circle, Slash, AlertTriangle } from 'lucide-react'
import type { CertificateDependencyMatrixRow } from '../types'

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
    className: 'bg-white text-slate-400 border-slate-200',
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

export function CertificateDependencyMatrix({
  rows,
  selectedCertificateId,
  selectedWorkItemId,
  onSelectCertificate,
  onSelectWorkItem,
}: CertificateDependencyMatrixProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        暂无可展示的依赖矩阵。
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-slate-900">轻量依赖矩阵</h4>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">强依赖</span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700">软依赖</span>
        </div>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full border-separate border-spacing-2">
          <caption className="sr-only">前期证照共享事项依赖矩阵</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-medium text-slate-500">证件 / 事项</th>
              {rows[0]?.cells.map((cell) => (
                <th scope="col" key={cell.work_item_id} className="min-w-28 px-3 py-2 text-xs font-medium text-slate-500">
                  <button
                    type="button"
                    onClick={() => onSelectWorkItem(cell.work_item_id)}
                    className={`w-full rounded-lg border px-2 py-1 text-left transition-colors ${
                      selectedWorkItemId === cell.work_item_id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    {cell.work_item_name}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.certificate_id}>
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left">
                  <button
                    type="button"
                    onClick={() => onSelectCertificate(row.certificate_id)}
                    className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                      selectedCertificateId === row.certificate_id ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    {row.certificate_name}
                  </button>
                </th>
                {row.cells.map((cell) => {
                  const config = cellConfig[cell.status]
                  const Icon = config.icon
                  const active = selectedWorkItemId === cell.work_item_id || selectedCertificateId === row.certificate_id
                  const dependencyKind = cell.dependency_kind ? dependencyKindConfig[cell.dependency_kind] : null

                  return (
                    <td key={`${row.certificate_id}-${cell.work_item_id}`} className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCertificate(row.certificate_id)
                          onSelectWorkItem(cell.work_item_id)
                        }}
                        className={`flex w-full items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                          active ? 'ring-2 ring-blue-200' : ''
                        } ${config.className}`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span>{config.label}</span>
                        {dependencyKind ? (
                          <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${dependencyKind.className}`}>
                            {dependencyKind.label}
                          </span>
                        ) : null}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
