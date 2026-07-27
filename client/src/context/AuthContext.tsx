/**
 * AuthContext - 认证上下文
 * 提供全局认证状态管理。
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import {
  AUTH_SESSION_EXPIRED_EVENT,
  apiGet,
  apiPost,
  apiPut,
  getApiErrorMessage,
  getAuthToken,
  persistCurrentCompanyId,
  persistAuthToken,
} from '@/lib/apiClient'
import { safeStorageGet } from '@/lib/browserStorage'
import { isPermissionSystemDisabled } from '@/lib/permissionBypass'
import { setCurrentCompanyContextSnapshot } from '@/lib/currentCompanyContext'
import type { GlobalRole } from '@/lib/roleLabels'

export interface User {
  id: string
  username: string
  display_name: string
  email?: string
  globalRole: GlobalRole
  currentCompanyId?: string | null
  currentCompanyRole?: GlobalRole | null
  joined_at?: string | null
  last_active?: string | null
  passwordResetRequired?: boolean
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
  loading: boolean
}

interface AuthSessionDto {
  token?: string
  user: User
}

interface AuthStatusDto {
  authenticated: boolean
  user: User | null
}

interface AuthMessageDto {
  message: string
  token?: string
}

interface AuthActionResult {
  success: boolean
  message?: string
}

interface ProfileActionResult extends AuthActionResult {
  user?: User
}

interface AuthContextType {
  authState: AuthState
  login: (username: string, password: string) => Promise<AuthActionResult>
  logout: () => Promise<void>
  register: (username: string, password: string, displayName?: string, email?: string) => Promise<AuthActionResult>
  changePassword: (oldPassword: string, newPassword: string) => Promise<AuthActionResult>
  updateProfile: (data: { display_name?: string; email?: string }) => Promise<ProfileActionResult>
  syncCurrentCompanyContext: (data: { companyId?: string | null; role?: GlobalRole | null }) => void
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

const permissionBypassGlobalRole: GlobalRole = import.meta.env.VITE_DEV_GLOBAL_ROLE === 'company_admin'
  ? 'company_admin'
  : 'regular'

const PERMISSION_BYPASS_USER: User = {
  id: '9e4a5570-0032-43bd-8f17-0bc415a1eb70',
  username: 'permission-bypass',
  display_name: permissionBypassGlobalRole === 'company_admin' ? '临时管理员' : '临时用户',
  email: 'dev@localhost',
  globalRole: permissionBypassGlobalRole,
  currentCompanyRole: permissionBypassGlobalRole,
  joined_at: null,
  last_active: null,
}

function readStoredCurrentCompanyId(): string | null {
  if (typeof window === 'undefined') return null
  return safeStorageGet(localStorage, 'current_company_id')?.trim() || null
}

function buildPermissionBypassAuthState(): AuthState {
  const currentCompanyId = readStoredCurrentCompanyId()
  const user: User = {
    ...PERMISSION_BYPASS_USER,
    currentCompanyId,
    currentCompanyRole: permissionBypassGlobalRole,
  }
  setCurrentCompanyContextSnapshot({
    companyId: currentCompanyId,
    role: user.currentCompanyRole ?? null,
    resolved: true,
  })
  return {
    isAuthenticated: true,
    user,
    loading: false,
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const permissionSystemDisabled = isPermissionSystemDisabled()
  const [authState, setAuthState] = useState<AuthState>(() => (
    permissionSystemDisabled
      ? buildPermissionBypassAuthState()
      : {
          isAuthenticated: false,
          user: null,
          loading: true,
        }
  ))

  const fetchCurrentUser = useCallback(async () => {
    if (permissionSystemDisabled) {
      setAuthState(buildPermissionBypassAuthState())
      return
    }

    const hadStoredToken = Boolean(getAuthToken())

    try {
      const data = await apiGet<AuthStatusDto>('/api/auth/me')
      if (data.authenticated && data.user) {
        persistCurrentCompanyId(data.user.currentCompanyId)
        setAuthState({
          isAuthenticated: true,
          user: data.user,
          loading: false,
        })
        return
      }

      if (data.authenticated === false) {
        persistAuthToken(null)
        if (hadStoredToken && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(AUTH_SESSION_EXPIRED_EVENT, {
              detail: {
                url: '/api/auth/me',
                message: '登录状态已过期，请重新登录。',
              },
            }),
          )
        }
      }

      setAuthState({ isAuthenticated: false, user: null, loading: false })
    } catch (error) {
      console.error('Fetch current user error:', error)
      setAuthState({ isAuthenticated: false, user: null, loading: false })
    }
  }, [permissionSystemDisabled])

  useEffect(() => {
    if (permissionSystemDisabled || typeof window === 'undefined') return undefined

    const handleSessionExpired = () => {
      setAuthState({ isAuthenticated: false, user: null, loading: false })
    }

    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired)
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleSessionExpired)
  }, [permissionSystemDisabled])

  const login = async (username: string, password: string): Promise<AuthActionResult> => {
    try {
      const data = await apiPost<AuthSessionDto>('/api/auth/login', { username, password })
      persistAuthToken(data.token || null)
      persistCurrentCompanyId(data.user.currentCompanyId)
      setAuthState({
        isAuthenticated: true,
        user: data.user,
        loading: false,
      })
      return { success: true }
    } catch (error) {
      console.error('登录错误:', error)
      return { success: false, message: getApiErrorMessage(error, '登录失败，请稍后重试') }
    }
  }

  const logout = async (): Promise<void> => {
    if (permissionSystemDisabled) {
      persistAuthToken(null)
      setAuthState(buildPermissionBypassAuthState())
      return
    }

    try {
      await apiPost<AuthMessageDto>('/api/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      persistAuthToken(null)
      setAuthState({ isAuthenticated: false, user: null, loading: false })
    }
  }

  const register = async (
    username: string,
    password: string,
    displayName?: string,
    email?: string
  ): Promise<AuthActionResult> => {
    try {
      const data = await apiPost<AuthSessionDto>('/api/auth/register', {
        username,
        password,
        display_name: displayName,
        email,
      })
      persistAuthToken(data.token || null)
      persistCurrentCompanyId(data.user.currentCompanyId)
      setAuthState({
        isAuthenticated: true,
        user: data.user,
        loading: false,
      })
      return { success: true }
    } catch (error) {
      console.error('Register error:', error)
      return { success: false, message: getApiErrorMessage(error, '注册失败，请稍后重试') }
    }
  }

  const changePassword = async (
    oldPassword: string,
    newPassword: string
  ): Promise<AuthActionResult> => {
    try {
      const data = await apiPost<AuthMessageDto>('/api/auth/change-password', { oldPassword, newPassword })
      if (data.token) persistAuthToken(data.token)
      setAuthState((current) => ({
        ...current,
        user: current.user
          ? { ...current.user, passwordResetRequired: false }
          : null,
      }))
      return { success: true, message: data.message }
    } catch (error) {
      console.error('Change password error:', error)
      return { success: false, message: getApiErrorMessage(error, '修改密码失败') }
    }
  }

  const updateProfile = async (
    data: { display_name?: string; email?: string }
  ): Promise<ProfileActionResult> => {
    try {
      const result = await apiPut<AuthSessionDto>('/api/auth/profile', data)
      persistAuthToken(result.token || null)
      persistCurrentCompanyId(result.user.currentCompanyId)
      setAuthState((prev) => ({
        ...prev,
        user: result.user,
      }))
      return { success: true, user: result.user, message: '个人信息已更新' }
    } catch (error) {
      console.error('Update profile error:', error)
      return { success: false, message: getApiErrorMessage(error, '更新信息失败') }
    }
  }

  const syncCurrentCompanyContext = useCallback((data: { companyId?: string | null; role?: GlobalRole | null }) => {
    setAuthState((prev) => {
      if (!prev.user) return prev

      const nextCompanyId = data.companyId ?? prev.user.currentCompanyId ?? null
      const nextCompanyRole = data.role ?? prev.user.currentCompanyRole ?? null
      setCurrentCompanyContextSnapshot({
        companyId: nextCompanyId,
        role: nextCompanyRole,
        resolved: true,
      })
      if (nextCompanyId === prev.user.currentCompanyId && nextCompanyRole === prev.user.currentCompanyRole) {
        return prev
      }

      persistCurrentCompanyId(nextCompanyId)
      return {
        ...prev,
        user: {
          ...prev.user,
          currentCompanyId: nextCompanyId,
          currentCompanyRole: nextCompanyRole,
        },
      }
    })
  }, [permissionSystemDisabled])

  useEffect(() => {
    fetchCurrentUser()
  }, [fetchCurrentUser])

  return (
    <AuthContext.Provider value={{ authState, login, logout, register, changePassword, updateProfile, syncCurrentCompanyContext }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return {
    ...context.authState,
    login: context.login,
    logout: context.logout,
    register: context.register,
    changePassword: context.changePassword,
    updateProfile: context.updateProfile,
    syncCurrentCompanyContext: context.syncCurrentCompanyContext,
  }
}
