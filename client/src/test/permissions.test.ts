import { describe, expect, it } from 'vitest'

import {
  ROLE_PERMISSIONS,
  getRoleDescription,
  getRoleDisplayName,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from '@/lib/permissions'

describe('权限模块', () => {
  describe('hasPermission', () => {
    it('项目负责人拥有所有权限', () => {
      expect(hasPermission('owner', 'view:project')).toBe(true)
      expect(hasPermission('owner', 'edit:project')).toBe(true)
      expect(hasPermission('owner', 'delete:project')).toBe(true)
      expect(hasPermission('owner', 'manage:settings')).toBe(true)
    })

    it('编辑成员拥有受限权限', () => {
      expect(hasPermission('editor', 'view:project')).toBe(true)
      expect(hasPermission('editor', 'edit:project')).toBe(true)
      expect(hasPermission('editor', 'delete:project')).toBe(false)
      expect(hasPermission('editor', 'manage:settings')).toBe(false)
    })

    it('只读成员仅拥有查看权限', () => {
      expect(hasPermission('viewer', 'view:project')).toBe(true)
      expect(hasPermission('viewer', 'edit:project')).toBe(false)
      expect(hasPermission('viewer', 'delete:project')).toBe(false)
      expect(hasPermission('viewer', 'create:task')).toBe(false)
    })
  })

  describe('hasAnyPermission', () => {
    it('如果拥有任意一项权限则返回 true', () => {
      expect(hasAnyPermission('editor', ['view:project', 'manage:settings'])).toBe(true)
    })

    it('如果没有任何权限则返回 false', () => {
      expect(hasAnyPermission('viewer', ['delete:project', 'manage:settings'])).toBe(false)
    })
  })

  describe('hasAllPermissions', () => {
    it('如果拥有全部权限则返回 true', () => {
      expect(hasAllPermissions('owner', ['view:project', 'edit:project'])).toBe(true)
    })

    it('如果缺少任一权限则返回 false', () => {
      expect(hasAllPermissions('editor', ['view:project', 'delete:project'])).toBe(false)
    })
  })

  describe('getRoleDisplayName', () => {
    it('返回当前角色模型对应的中文名称', () => {
      expect(getRoleDisplayName('owner')).toBe('项目负责人')
      expect(getRoleDisplayName('editor')).toBe('编辑成员')
      expect(getRoleDisplayName('viewer')).toBe('只读成员')
    })
  })

  describe('getRoleDescription', () => {
    it('返回角色描述', () => {
      expect(getRoleDescription('owner')).toContain('完整管理权限')
      expect(getRoleDescription('editor')).toContain('编辑')
      expect(getRoleDescription('viewer')).toContain('查看')
    })
  })

  describe('ROLE_PERMISSIONS', () => {
    it('owner 应该拥有最多权限', () => {
      const ownerPermissions = ROLE_PERMISSIONS.owner.length
      const editorPermissions = ROLE_PERMISSIONS.editor.length
      const viewerPermissions = ROLE_PERMISSIONS.viewer.length

      expect(ownerPermissions).toBeGreaterThan(editorPermissions)
      expect(editorPermissions).toBeGreaterThan(viewerPermissions)
    })

    it('所有角色都应该拥有 view:project 权限', () => {
      expect(ROLE_PERMISSIONS.owner).toContain('view:project')
      expect(ROLE_PERMISSIONS.editor).toContain('view:project')
      expect(ROLE_PERMISSIONS.viewer).toContain('view:project')
    })
  })
})
