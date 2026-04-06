/**
 * AuthContext - 认证上下文
 * 提供全局认证状态管理。
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { getAuthHeaders, persistAuthToken } from '@/lib/apiClient'

export interface User {
  id: string
  username: string
  display_name: string
  email?: string
  role: 'owner' | 'member'
}

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
  loading: boolean
}

interface LoginResponse {
  success: boolean
  token?: string
  user?: User
  message?: string
}

interface AuthContextType {
  authState: AuthState
  login: (username: string, password: string) => Promise<LoginResponse>
  logout: () => Promise<void>
  register: (username: string, password: string, displayName?: string, email?: string) => Promise<LoginResponse>
  changePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>
  updateProfile: (data: { display_name?: string; email?: string }) => Promise<{ success: boolean; user?: User; message?: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const getApiUrl = () => {
  return (import.meta as any).env?.VITE_API_URL || ''
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
  })

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...getAuthHeaders(),
        },
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success && data.user) {
          setAuthState({
            isAuthenticated: true,
            user: data.user,
            loading: false,
          })
          return
        }
      } else if (response.status === 401) {
        persistAuthToken(null)
      }

      setAuthState({ isAuthenticated: false, user: null, loading: false })
    } catch (error) {
      console.error('Fetch current user error:', error)
      setAuthState({ isAuthenticated: false, user: null, loading: false })
    }
  }, [])

  const login = async (username: string, password: string): Promise<LoginResponse> => {
    try {
      const apiUrl = getApiUrl()
      const loginUrl = `${apiUrl}/api/auth/login`

      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })

      const data: LoginResponse = await response.json()

      if (data.success) {
        persistAuthToken(data.token || null)
        setAuthState({
          isAuthenticated: true,
          user: data.user || null,
          loading: false,
        })
      }

      return data
    } catch (error) {
      console.error('登录错误:', error)
      return { success: false, message: '登录失败，请稍后重试' }
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await fetch(`${getApiUrl()}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...getAuthHeaders(),
        },
      })
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
  ): Promise<LoginResponse> => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password, display_name: displayName, email }),
      })

      const data: LoginResponse = await response.json()

      if (data.success) {
        persistAuthToken(data.token || null)
        setAuthState({
          isAuthenticated: true,
          user: data.user || null,
          loading: false,
        })
      }

      return data
    } catch (error) {
      console.error('Register error:', error)
      return { success: false, message: '注册失败，请稍后重试' }
    }
  }

  const changePassword = async (
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const data = await response.json()
      return data
    } catch (error) {
      console.error('Change password error:', error)
      return { success: false, message: '修改密码失败' }
    }
  }

  const updateProfile = async (
    data: { display_name?: string; email?: string }
  ): Promise<{ success: boolean; user?: User; message?: string }> => {
    try {
      const response = await fetch(`${getApiUrl()}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      const result = await response.json()
      if (result.success && result.user) {
        persistAuthToken(result.token || null)
        setAuthState(prev => ({
          ...prev,
          user: { ...prev.user!, ...result.user },
        }))
      }
      return result
    } catch (error) {
      console.error('Update profile error:', error)
      return { success: false, message: '更新信息失败' }
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
