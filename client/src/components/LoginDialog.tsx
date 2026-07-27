import { useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()
  const usernameInputRef = useRef<HTMLInputElement | null>(null)

  useDialogFocusRestore(isOpen)

  const resetForm = () => {
    setUsername('')
    setPassword('')
    setDisplayName('')
    setEmail('')
    setError('')
    setFieldErrors({})
    setShowPassword(false)
  }

  const setFieldError = (field: string, message: string) => {
    setFieldErrors((current) => ({ ...current, [field]: message }))
  }

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  const validateRequired = (field: string, value: string) => {
    if (value.trim()) {
      clearFieldError(field)
      return true
    }

    setFieldError(field, '此字段必填')
    return false
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    const usernameValid = validateRequired('username', username)
    const passwordValid = validateRequired('password', password)
    if (!usernameValid || !passwordValid) return

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
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent
        closeLabel="关闭登录弹窗"
        data-testid="login-dialog"
        className="max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto border-slate-200"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          usernameInputRef.current?.focus()
        }}
      >
        <DialogHeader className="mb-2 pr-12">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">登录系统</div>
            <DialogTitle className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              {mode === 'login' ? '登录账号' : '注册账号'}
            </DialogTitle>
            <DialogDescription>使用账号密码登录系统，或注册一个新账号。</DialogDescription>
          </div>
        </DialogHeader>

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
              onChange={(event) => {
                setUsername(event.target.value)
                if (fieldErrors.username) clearFieldError('username')
              }}
              onBlur={() => validateRequired('username', username)}
              aria-invalid={Boolean(fieldErrors.username)}
              aria-describedby={fieldErrors.username ? 'login-username-error' : undefined}
              placeholder="请输入用户名"
              disabled={loading}
              required
            />
            {fieldErrors.username ? (
              <p id="login-username-error" className="text-sm text-red-600" role="alert">
                {fieldErrors.username}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="login-password">密码</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (fieldErrors.password) clearFieldError('password')
                }}
                onBlur={() => validateRequired('password', password)}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                placeholder="请输入密码"
                disabled={loading}
                required
                className="pr-10"
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-slate-500 hover:text-slate-700"
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.password ? (
              <p id="login-password-error" className="text-sm text-red-600" role="alert">
                {fieldErrors.password}
              </p>
            ) : null}
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

        <div className="mt-5 text-center text-sm text-slate-600">
          {mode === 'login' ? '还没有账号？' : '已经有账号？'}{' '}
          <Button
            variant="ghost"
            type="button"
            className="font-medium text-blue-600 transition hover:text-blue-700"
            onClick={() => {
              resetForm()
              setMode(mode === 'login' ? 'register' : 'login')
            }}
          >
            {mode === 'login' ? '立即注册' : '立即登录'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
