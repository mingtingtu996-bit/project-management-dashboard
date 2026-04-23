export type GlobalRole = 'company_admin' | 'regular'
export type ProjectPermissionLevel = 'owner' | 'editor' | 'viewer'

export function normalizeGlobalRole(value?: string | null): GlobalRole {
  return value === 'company_admin' ? 'company_admin' : 'regular'
}

export function normalizeProjectPermissionLevel(value?: string | null): ProjectPermissionLevel {
  switch (String(value ?? '').trim()) {
    case 'owner':
    case 'admin':
      return 'owner'
    case 'editor':
      return 'editor'
    default:
      return 'viewer'
  }
}

export function getGlobalRoleLabel(role?: string | null): string {
  return normalizeGlobalRole(role) === 'company_admin' ? '公司管理员' : '普通成员'
}

export function getProjectRoleLabel(role?: string | null): string {
  switch (normalizeProjectPermissionLevel(role)) {
    case 'owner':
      return '项目负责人'
    case 'editor':
      return '编辑成员'
    default:
      return '只读成员'
  }
}

export function getRoleBadgeTone(role?: string | null): string {
  switch (normalizeProjectPermissionLevel(role)) {
    case 'owner':
      return 'bg-slate-900 text-white'
    case 'editor':
      return 'bg-blue-100 text-blue-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}
