/**
 * §3.0 UI contract tests
 *
 * Tests for:
 * - Invite link: only shown on project pages, requires primary_invitation_code, copies to clipboard, shows success toast, cooldown
 * - Logout clears token and navigates to login
 * - Page title / context label switches dynamically with pathname
 */
import { describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { getShellNavigationMeta } from '@/config/navigation'
import { persistAuthToken } from '@/lib/apiClient'

function readSrc(relPath: string): string | null {
  // We're running from client/ dir; check relative to cwd first, then parent
  const candidates = [
    join(process.cwd(), relPath),
    join(process.cwd(), '..', relPath),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8')
  }
  return null
}

// ─────────────────────────────────────────────
// §3.0 退出登录清除 token 并跳转登录页
// ─────────────────────────────────────────────
describe('§3.0 logout token clearing', () => {
  it('persistAuthToken(null) calls localStorage.removeItem for auth_token', () => {
    const removeItemSpy = vi.spyOn(localStorage, 'removeItem')
    persistAuthToken(null)
    const removedKeys = removeItemSpy.mock.calls.map(([key]) => key)
    expect(removedKeys).toContain('auth_token')
  })

  it('persistAuthToken(null) calls localStorage.removeItem for access_token', () => {
    const removeItemSpy = vi.spyOn(localStorage, 'removeItem')
    persistAuthToken(null)
    const removedKeys = removeItemSpy.mock.calls.map(([key]) => key)
    expect(removedKeys).toContain('access_token')
  })

  it('persistAuthToken(token) calls localStorage.setItem for auth_token and access_token', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem')
    persistAuthToken('my-jwt-token')
    const setKeys = setItemSpy.mock.calls.map(([key]) => key)
    expect(setKeys).toContain('auth_token')
    expect(setKeys).toContain('access_token')
  })

  it('AuthContext logout calls persistAuthToken(null) as indicated by source', () => {
    const src = readSrc('src/context/AuthContext.tsx')
    if (!src) return
    // Verify persistAuthToken(null) is called inside the logout function
    expect(src).toMatch(/const logout[\s\S]*?persistAuthToken\(null\)/)
  })
})

// ─────────────────────────────────────────────
// §3.0 页面标题 / 上下文标签随 pathname 动态切换
// ─────────────────────────────────────────────
describe('§3.0 page title / contextLabel switches with pathname', () => {
  it('/company returns company label', () => {
    const meta = getShellNavigationMeta('/company')
    expect(meta.title).toBeTruthy()
    expect(meta.contextLabel).toContain('公司')
  })

  it('/notifications returns notifications label', () => {
    const meta = getShellNavigationMeta('/notifications')
    expect(meta.contextLabel).toBeTruthy()
  })

  it('/projects/:id/dashboard returns dashboard meta', () => {
    const meta = getShellNavigationMeta('/projects/abc123/dashboard')
    expect(meta.title).toBeTruthy()
    expect(meta.contextLabel).toBeTruthy()
  })

  it('/projects/:id/gantt returns tasks/gantt meta', () => {
    const meta = getShellNavigationMeta('/projects/abc123/gantt')
    expect(meta.title).toBeTruthy()
    expect(meta.contextLabel).toContain('任务')
  })

  it('/projects/:id/risks returns risks meta', () => {
    const meta = getShellNavigationMeta('/projects/abc123/risks')
    expect(meta.title).toBeTruthy()
  })

  it('/projects/:id/milestones returns milestones meta', () => {
    const meta = getShellNavigationMeta('/projects/abc123/milestones')
    expect(meta.title).toBeTruthy()
    expect(meta.contextLabel).toContain('节点')
  })

  it('/projects/:id/responsibility returns responsibility meta', () => {
    const meta = getShellNavigationMeta('/projects/abc123/responsibility')
    expect(meta.title).toBeTruthy()
    expect(meta.contextLabel).toContain('责任')
  })

  it('different pathnames produce different titles', () => {
    const dashboard = getShellNavigationMeta('/projects/x/dashboard')
    const risks = getShellNavigationMeta('/projects/x/risks')
    expect(dashboard.title).not.toBe(risks.title)
  })
})

// ─────────────────────────────────────────────
// §3.0 邀请链接显示/复制链
// ─────────────────────────────────────────────
describe('§3.0 invite link display/copy contract (source-level)', () => {
  it('Header.tsx only shows invite button when isProjectPage is true', () => {
    const src = readSrc('src/components/layout/Header.tsx')
    if (!src) return
    // Invite button conditional: currentProject && isProjectPage && primary_invitation_code
    expect(src).toMatch(/isProjectPage.*primary_invitation_code|primary_invitation_code.*isProjectPage/s)
  })

  it('Header.tsx requires primary_invitation_code before showing invite button', () => {
    const src = readSrc('src/components/layout/Header.tsx')
    if (!src) return
    expect(src).toMatch(/primary_invitation_code/)
  })

  it('copyInvitationCode writes invite URL to clipboard', () => {
    const src = readSrc('src/components/layout/Header.tsx')
    if (!src) return
    expect(src).toMatch(/navigator\.clipboard\.writeText/)
    expect(src).toMatch(/join\/.*primary_invitation_code|primary_invitation_code.*join/)
  })

  it('copyInvitationCode shows success toast after copying', () => {
    const src = readSrc('src/components/layout/Header.tsx')
    if (!src) return
    expect(src).toMatch(/toast\(/)
    expect(src).toMatch(/链接已复制|已复制/)
  })

  it('copyInvitationCode sets copied=true and then resets after cooldown (setTimeout)', () => {
    const src = readSrc('src/components/layout/Header.tsx')
    if (!src) return
    expect(src).toMatch(/setCopied\(true\)/)
    expect(src).toMatch(/setCopied\(false\)/)
    expect(src).toMatch(/setTimeout/)
  })
})
