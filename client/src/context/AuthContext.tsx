/**
 * AuthContext - 认证上下文
 * 提供全局认证状态管理。
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { apiGet, apiPost, apiPut, getApiErrorMessage, persistAuthToken } from '@/lib/apiClient'
import type { GlobalRole } from '@/lib/roleLabels'

export interface User {
  id: string
  username: string
  display_name: string
  email?: string
  role?: string
  globalRole: GlobalRole
  joined_at?: string | null
  last_active?: string | null
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
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
  })

  const fetchCurrentUser = useCallback(async () => {
    try {
      const data = await apiGet<AuthStatusDto>('/api/auth/me')
      if (data.authenticated && data.user) {
        setAuthState({
          isAuthenticated: true,
          user: data.user,
          loading: false,
        })
        return
      }

      if (data.authenticated === false) {
        persistAuthToken(null)
      }

      setAuthState({ isAuthenticated: false, user: null, loading: false })
    } catch (error) {
      console.error('Fetch current user error:', error)
      setAuthState({ isAuthenticated: false, user: null, loading: false })
    }
  }, [])

  const login = async (username: string, password: string): Promise<AuthActionResult> => {
    try {
      const data = await apiPost<AuthSessionDto>('/api/auth/login', { username, password })
      persistAuthToken(data.token || null)
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

  useEffect(() => {
    fetchCurrentUser()
  }, [fetchCurrentUser])

  return (
    <AuthContext.Provider value={{ authState, login, logout, register, changePassword, updateProfile }}>
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
  }
}
