import type { Project } from '../types/db.js'

export function normalizeProjectStatus(status?: string | null): Project['status'] {
  switch (String(status ?? '').trim()) {
    case '已完成':
    case 'completed':
    case 'done':
      return '已完成'
    case '进行中':
    case 'in_progress':
    case 'active':
      return '进行中'
    case '已暂停':
    case 'paused':
    case 'archived':
      return '已暂停'
    case '未开始':
    case 'planning':
    case 'pending':
    case 'not_started':
    default:
      return '未开始'
  }
}

export function isProjectActiveStatus(status?: string | null): boolean {
  return normalizeProjectStatus(status) === '进行中'
}
