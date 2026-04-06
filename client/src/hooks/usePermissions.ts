// 权限检查 Hook
// 第三阶段：安全与测试 - 权限体系完善

import { useMemo } from 'react'
import { useCurrentProject, useCurrentUser } from '@/hooks/useStore'

import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  PermissionAction,
  PermissionLevel,
  ROLE_PERMISSIONS,
} from '@/lib/permissions'

interface UsePermissionsOptions {
  projectId?: string
}

export function usePermissions(options: UsePermissionsOptions = {}) {
  const currentUser = useCurrentUser()
  const currentProject = useCurrentProject()


  // 获取用户在当前项目的权限级别
  const permissionLevel = useMemo((): PermissionLevel => {
    if (!currentUser || !currentProject) {
      return 'guest'
    }

    // 检查是否是项目创建者
    if (currentProject.created_by === currentUser.id) {
      return 'admin'
    }

    // TODO: 从项目成员表中获取权限
    // 暂时返回 editor 作为默认权限
    return 'editor'
  }, [currentUser, currentProject])

  // 权限检查函数
  const can = useMemo(() => {
    // 检查单个权限
    const check = (action: PermissionAction): boolean => {
      return hasPermission(permissionLevel, action)
    }

    return {
      // 检查单个权限
      check,

      // 检查任意一项权限
      anyOf: (actions: PermissionAction[]): boolean => {
        return hasAnyPermission(permissionLevel, actions)
      },

      // 检查所有权限
      allOf: (actions: PermissionAction[]): boolean => {
        return hasAllPermissions(permissionLevel, actions)
      },

      // 便捷方法
      viewProject: () => hasPermission(permissionLevel, 'view:project'),
      editProject: () => hasPermission(permissionLevel, 'edit:project'),
      deleteProject: () => hasPermission(permissionLevel, 'delete:project'),
      
      viewTask: () => hasPermission(permissionLevel, 'view:task'),
      createTask: () => hasPermission(permissionLevel, 'create:task'),
      editTask: () => hasPermission(permissionLevel, 'edit:task'),
      deleteTask: () => hasPermission(permissionLevel, 'delete:task'),
      
      viewRisk: () => hasPermission(permissionLevel, 'view:risk'),
      createRisk: () => hasPermission(permissionLevel, 'create:risk'),
      editRisk: () => hasPermission(permissionLevel, 'edit:risk'),
      deleteRisk: () => hasPermission(permissionLevel, 'delete:risk'),
      
      viewMilestone: () => hasPermission(permissionLevel, 'view:milestone'),
      createMilestone: () => hasPermission(permissionLevel, 'create:milestone'),
      editMilestone: () => hasPermission(permissionLevel, 'edit:milestone'),
      deleteMilestone: () => hasPermission(permissionLevel, 'delete:milestone'),
      
      viewTeam: () => hasPermission(permissionLevel, 'view:team'),
      inviteMember: () => hasPermission(permissionLevel, 'invite:member'),
      removeMember: () => hasPermission(permissionLevel, 'remove:member'),
      
      viewReports: () => hasPermission(permissionLevel, 'view:reports'),
      exportData: () => hasPermission(permissionLevel, 'export:data'),
      viewAudit: () => hasPermission(permissionLevel, 'view:audit'),
      manageSettings: () => hasPermission(permissionLevel, 'manage:settings'),
    }
  }, [permissionLevel])

  // 返回权限信息和检查函数
  return {
    permissionLevel,
    can,
    isAdmin: permissionLevel === 'admin',
    isEditor: permissionLevel === 'editor',
    isGuest: permissionLevel === 'guest',
  }
}

// 导出所有可用权限（用于显示）
export const AVAILABLE_PERMISSIONS = ROLE_PERMISSIONS
