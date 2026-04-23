// 权限保护组件
// 第三阶段：安全与测试 - 权限体系完善

import { ReactNode } from 'react'
import { PermissionAction, hasPermission, PermissionLevel } from '@/lib/permissions'
import { usePermissions } from '@/hooks/usePermissions'

interface PermissionGuardProps {
  children: ReactNode
  action: PermissionAction | PermissionAction[]
  fallback?: ReactNode
  requireAll?: boolean // 当 action 是数组时，是否需要全部满足
}

interface RoleGuardProps {
  children: ReactNode
  roles: PermissionLevel[]
  fallback?: ReactNode
}

/**
 * 权限守卫组件 - 根据权限决定是否显示子元素
 */
export function PermissionGuard({
  children,
  action,
  fallback = null,
  requireAll = false,
}: PermissionGuardProps) {
  // 使用 usePermissions hook 获取当前用户权限
  const { permissionLevel } = usePermissions()

  // 检查单个权限
  if (typeof action === 'string') {
    if (hasPermission(permissionLevel, action)) {
      return <>{children}</>
    }
    return <>{fallback}</>
  }

  // 检查多个权限
  if (Array.isArray(action)) {
    const hasAny = action.some(a => hasPermission(permissionLevel, a))
    const hasAll = action.every(a => hasPermission(permissionLevel, a))

    if (requireAll) {
      return hasAll ? <>{children}</> : <>{fallback}</>
    }
    return hasAny ? <>{children}</> : <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * 角色守卫组件 - 根据角色决定是否显示子元素
 */
export function RoleGuard({ children, roles, fallback = null }: RoleGuardProps) {
  // 使用 usePermissions hook 获取当前用户权限
  const { permissionLevel } = usePermissions()

  if (roles.includes(permissionLevel)) {
    return <>{children}</>
  }

  return <>{fallback}</>
}

/**
 * 管理员专属组件
 */
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <RoleGuard roles={['owner']} fallback={fallback}>{children}</RoleGuard>
}

/**
 * 编辑者及以上权限组件
 */
export function EditorAndAbove({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <RoleGuard roles={['owner', 'editor']} fallback={fallback}>{children}</RoleGuard>
}

/**
 * 访客不可见组件 - 非访客可见
 */
export function MemberOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <RoleGuard roles={['owner', 'editor', 'viewer']} fallback={fallback}>{children}</RoleGuard>
}
