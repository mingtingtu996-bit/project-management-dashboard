import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ROLE_PERMISSIONS,
  getRoleDescription,
  getRoleDisplayName,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from '@/lib/permissions'

describe('权限模块', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DISABLE_PERMISSION_SYSTEM', 'false')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

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

    it('none 表示没有项目成员身份和项目权限', () => {
      expect(hasPermission('none', 'view:project')).toBe(false)
      expect(hasPermission('none', 'edit:project')).toBe(false)
      expect(hasPermission('none', 'delete:project')).toBe(false)
      expect(hasPermission('none', 'create:task')).toBe(false)
    })
  })

  describe('hasAnyPermission', () => {
    it('如果拥有任意一项权限则返回 true', () => {
      expect(hasAnyPermission('editor', ['view:project', 'manage:settings'])).toBe(true)
    })

    it('如果没有任何权限则返回 false', () => {
      expect(hasAnyPermission('none', ['delete:project', 'manage:settings'])).toBe(false)
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
      expect(getRoleDisplayName('none')).toBe('无项目权限')
    })
  })

  describe('getRoleDescription', () => {
    it('返回角色描述', () => {
      expect(getRoleDescription('owner')).toContain('完整管理权限')
      expect(getRoleDescription('editor')).toContain('编辑')
      expect(getRoleDescription('none')).toContain('没有此项目')
    })
  })

  describe('ROLE_PERMISSIONS', () => {
    it('owner 应该拥有最多权限', () => {
      const ownerPermissions = ROLE_PERMISSIONS.owner.length
      const editorPermissions = ROLE_PERMISSIONS.editor.length
      const noAccessPermissions = ROLE_PERMISSIONS.none.length

      expect(ownerPermissions).toBeGreaterThan(editorPermissions)
      expect(editorPermissions).toBeGreaterThan(noAccessPermissions)
    })

    it('只有正式项目角色拥有 view:project 权限', () => {
      expect(ROLE_PERMISSIONS.owner).toContain('view:project')
      expect(ROLE_PERMISSIONS.editor).toContain('view:project')
      expect(ROLE_PERMISSIONS.none).not.toContain('view:project')
    })
  })
})
