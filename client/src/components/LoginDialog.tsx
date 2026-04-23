import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { useDialogFocusRestore } from '@/hooks/useDialogFocusRestore'

interface LoginDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function LoginDialog({ isOpen, onClose }: LoginDialogProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const usernameInputRef = useRef<HTMLInputElement | null>(null)

  useDialogFocusRestore(isOpen)

  useEffect(() => {
    if (!isOpen) return

    const getFocusableElements = () => {
      const root = dialogRef.current
      if (!root) return [] as HTMLElement[]

      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
        ),
      ).filter((element) => {
        if (element.hasAttribute('disabled')) return false
        if (element.getAttribute('aria-hidden') === 'true') return false
        if (element.tabIndex < 0) return false
        const style = window.getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        return true
      })
    }

    const frame = window.requestAnimationFrame(() => {
      usernameInputRef.current?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusableElements()
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey) {
        if (currentIndex === 0 || currentIndex === -1) {
          event.preventDefault()
          focusable[focusable.length - 1]?.focus()
        }
        return
      }

      if (currentIndex === focusable.length - 1) {
        event.preventDefault()
        focusable[0]?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const resetForm = () => {
    setUsername('')
    setPassword('')
    setDisplayName('')
    setEmail('')
    setError('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const result = await login(username, password)
        if (!result.success) {
          setError(result.message || '登录失败')
          return
        }
      } else {
        const result = await register(username, password, displayName, email)
        if (!result.success) {
          setError(result.message || '注册失败')
          return
        }
      }

      resetForm()
      onClose()
    } catch {
      setError(mode === 'login' ? '登录失败，请稍后重试' : '注册失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6"
      data-testid="login-dialog-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={dialogRef}
        tabIndex={-1}
        data-testid="login-dialog"
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">登录系统</div>
            <h2 id={titleId} className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {mode === 'login' ? '登录账号' : '注册账号'}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-500">
              {mode === 'login' ? '登录后即可按公司级和项目级角色获取对应权限。' : '首个注册用户将自动成为公司管理员。'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="关闭登录弹窗">
            ×
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-username">用户名</Label>
            <Input
              id="login-username"
              ref={usernameInputRef}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="请输入用户名"
              disabled={loading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">密码</Label>
            <Input id="login-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" disabled={loading} required />
          </div>

          {mode === 'register' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="login-display-name">显示名称</Label>
                <Input id="login-display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="可选，默认为用户名" disabled={loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-email">邮箱</Label>
                <Input id="login-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="可选，用于联系与找回" disabled={loading} />
              </div>
            </>
          ) : null}

          <Button type="submit" className="w-full" loading={loading}>
            {mode === 'login' ? '登录' : '注册'}
          </Button>
        </form>

        {mode === 'login' ? (
          <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500">
            忘记密码？请联系公司管理员为你重置密码并获取临时密码。
          </p>
        ) : null}

        <div className="mt-5 text-center text-sm text-slate-600">
          {mode === 'login' ? '还没有账号？' : '已经有账号？'}{' '}
          <button
            type="button"
            className="font-medium text-blue-600 transition hover:text-blue-700"
            onClick={() => {
              resetForm()
              setMode(mode === 'login' ? 'register' : 'login')
            }}
          >
            {mode === 'login' ? '立即注册' : '立即登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
