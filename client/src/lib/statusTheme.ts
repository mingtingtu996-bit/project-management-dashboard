export type StatusTheme = {
  label: string
  className: string
}

const STATUS_THEME: Record<string, StatusTheme> = {
  active: {
    label: '进行中',
    className: 'bg-blue-500 text-white',
  },
  archived: {
    label: '已归档',
    className: 'bg-slate-500 text-white',
  },
  cancelled: {
    label: '已取消',
    className: 'bg-slate-100 text-slate-600 border border-slate-200',
  },
  blocked: {
    label: '受阻',
    className: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  closed: {
    label: '已关闭',
    className: 'bg-slate-100 text-slate-600 border border-slate-200',
  },
  completed: {
    label: '已完成',
    className: 'bg-emerald-500 text-white',
  },
  critical: {
    label: '严重',
    className: 'bg-red-100 text-red-700 border border-red-200',
  },
  delayed: {
    label: '延期完成',
    className: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  draft: {
    label: '草稿',
    className: 'bg-slate-100 text-slate-600 border border-slate-200',
  },
  high: {
    label: '高',
    className: 'bg-orange-100 text-orange-700 border border-orange-200',
  },
  info: {
    label: '提示',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  in_progress: {
    label: '进行中',
    className: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  overdue: {
    label: '已延期',
    className: 'bg-red-100 text-red-700 border border-red-200',
  },
  investigating: {
    label: '处理中',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  low: {
    label: '低',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  medium: {
    label: '中',
    className: 'bg-amber-100 text-amber-700 border border-amber-200',
  },
  on_time: {
    label: '按时完成',
    className: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
  open: {
    label: '待处理',
    className: 'bg-slate-50 text-slate-700 border border-slate-200',
  },
  pending: {
    label: '未开始',
    className: 'bg-amber-500 text-white',
  },
  processing: {
    label: '进行中',
    className: 'bg-blue-100 text-blue-700 border border-blue-200',
  },
  pending_conditions: {
    label: '待开工',
    className: 'bg-orange-100 text-orange-700 border border-orange-200',
  },
  published: {
    label: '已发布',
    className: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
  ready: {
    label: '可开工',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  resolved: {
    label: '已解决',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  disabled: {
    label: '停用',
    className: 'bg-rose-50 text-rose-700 border border-rose-200',
  },
  warning: {
    label: '关注',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
}

function normalizeStatus(status?: string | null) {
  return String(status ?? '').trim().toLowerCase()
}

export function getStatusTheme(status?: string | null, fallbackLabel?: string): StatusTheme {
  const normalized = normalizeStatus(status)
  return STATUS_THEME[normalized] ?? {
    label: fallbackLabel || status || '状态',
    className: 'bg-slate-100 text-slate-700 border border-slate-200',
  }
}

export { STATUS_THEME }
