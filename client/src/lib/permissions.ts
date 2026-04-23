// 权限类型定义
// 第三阶段：安全与测试 - 权限体系完善

import { getProjectRoleLabel, normalizeProjectPermissionLevel, type ProjectPermissionLevel } from '@/lib/roleLabels'

export type PermissionLevel = ProjectPermissionLevel

export type PermissionAction = 
  | 'view:project'
  | 'edit:project'
  | 'delete:project'
  | 'view:task'
  | 'create:task'
  | 'edit:task'
  | 'delete:task'
  | 'view:risk'
  | 'create:risk'
  | 'edit:risk'
  | 'delete:risk'
  | 'view:milestone'
  | 'create:milestone'
  | 'edit:milestone'
  | 'delete:milestone'
  | 'view:team'
  | 'invite:member'
  | 'remove:member'
  | 'view:reports'
  | 'export:data'
  | 'view:audit'
  | 'manage:settings'

// 角色权限映射
export const ROLE_PERMISSIONS: Record<PermissionLevel, PermissionAction[]> = {
  viewer: [
    'view:project',
    'view:task',
    'view:risk',
    'view:milestone',
    'view:team',
    'view:reports',
  ],
  editor: [
    'view:project',
    'edit:project',
    'view:task',
    'create:task',
    'edit:task',
    'view:risk',
    'create:risk',
    'edit:risk',
    'view:milestone',
    'create:milestone',
    'edit:milestone',
    'view:team',
    'view:reports',
    'export:data',
  ],
  owner: [
    'view:project',
    'edit:project',
    'delete:project',
    'view:task',
    'create:task',
    'edit:task',
    'delete:task',
    'view:risk',
    'create:risk',
    'edit:risk',
    'delete:risk',
    'view:milestone',
    'create:milestone',
    'edit:milestone',
    'delete:milestone',
    'view:team',
    'invite:member',
    'remove:member',
    'view:reports',
    'export:data',
    'view:audit',
    'manage:settings',
  ],
}

// 检查权限的辅助函数
export function hasPermission(
  role: PermissionLevel,
  action: PermissionAction
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false
}

// 检查是否具有任意一项权限
export function hasAnyPermission(
  role: PermissionLevel,
  actions: PermissionAction[]
): boolean {
  return actions.some(action => hasPermission(role, action))
}

// 检查是否具有所有权限
export function hasAllPermissions(
  role: PermissionLevel,
  actions: PermissionAction[]
): boolean {
  return actions.every(action => hasPermission(role, action))
}

// 获取角色的显示名称
export function getRoleDisplayName(role: PermissionLevel): string {
  return getProjectRoleLabel(role)
}

// 获取角色的描述
export function getRoleDescription(role: PermissionLevel): string {
  const descriptions: Record<PermissionLevel, string> = {
    viewer: '只能查看项目内容，不能发起编辑或提交流程',
    editor: '可以进行日常编辑和提交流程，但不能转让负责人或管理团队',
    owner: '拥有项目完整管理权限，可转让负责人、管理成员和执行强制操作',
  }
  return descriptions[normalizeProjectPermissionLevel(role)] || ''
}
