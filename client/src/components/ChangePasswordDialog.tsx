/**
 * ChangePasswordDialog - 修改密码弹窗
 */

import { useState, useEffect, useRef, useId } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { X, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button'

interface ChangePasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ isOpen, onClose }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loading]);

  if (!isOpen) return null;

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateRequired = (field: string, value: string) => {
    if (value.trim()) {
      clearFieldError(field);
      return true;
    }

    setFieldErrors((current) => ({ ...current, [field]: '此字段必填' }));
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const oldPasswordValid = validateRequired('oldPassword', oldPassword);
    const newPasswordValid = validateRequired('newPassword', newPassword);
    const confirmPasswordValid = validateRequired('confirmPassword', confirmPassword);
    if (!oldPasswordValid || !newPasswordValid || !confirmPasswordValid) return;

    if (newPassword.length < 6) {
      setError('新密码长度至少6位');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    if (oldPassword === newPassword) {
      setError('新密码不能与旧密码相同');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        onClose();
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setFieldErrors({});
      } else {
        setError(data.message || '修改失败');
      }
    } catch {
      setError('修改失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError('');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-[4px] duration-200 fade-in-0" onClick={handleClose}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-[90%] max-w-[560px] animate-in rounded-2xl border border-slate-200 bg-white p-6 shadow-[var(--el-4)] duration-200 ease-bounce fade-in-0 zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-800">修改密码</h2>
          <Button variant="ghost" ref={closeRef} onClick={handleClose} className="text-slate-400 hover:text-slate-600" aria-label="关闭">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">旧密码</label>
            <div className="relative">
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => {
                  setOldPassword(e.target.value);
                  if (fieldErrors.oldPassword) clearFieldError('oldPassword');
                }}
                onBlur={() => validateRequired('oldPassword', oldPassword)}
                aria-invalid={Boolean(fieldErrors.oldPassword)}
                aria-describedby={fieldErrors.oldPassword ? 'change-password-old-error' : undefined}
                className={`w-full px-3 py-2 pr-10 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${fieldErrors.oldPassword ? 'border-red-500' : 'border-slate-300'}`}
                required
                disabled={loading}
              />
              <Button variant="ghost" type="button" onClick={() => setShowOld(!showOld)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.oldPassword ? (
              <p id="change-password-old-error" className="text-sm text-red-600" role="alert">{fieldErrors.oldPassword}</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => {
                  setNewPassword(e.target.value);
                  if (fieldErrors.newPassword) clearFieldError('newPassword');
                }}
                onBlur={() => validateRequired('newPassword', newPassword)}
                aria-invalid={Boolean(fieldErrors.newPassword)}
                aria-describedby={fieldErrors.newPassword ? 'change-password-new-error' : undefined}
                className={`w-full px-3 py-2 pr-10 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${fieldErrors.newPassword ? 'border-red-500' : 'border-slate-300'}`}
                placeholder="至少6位"
                required
                disabled={loading}
              />
              <Button variant="ghost" type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.newPassword ? (
              <p id="change-password-new-error" className="text-sm text-red-600" role="alert">{fieldErrors.newPassword}</p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">确认新密码</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) clearFieldError('confirmPassword');
                }}
                onBlur={() => validateRequired('confirmPassword', confirmPassword)}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'change-password-confirm-error' : undefined}
                className={`w-full px-3 py-2 pr-10 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${fieldErrors.confirmPassword ? 'border-red-500' : 'border-slate-300'}`}
                required
                disabled={loading}
              />
              <Button variant="ghost" type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.confirmPassword ? (
              <p id="change-password-confirm-error" className="text-sm text-red-600" role="alert">{fieldErrors.confirmPassword}</p>
            ) : null}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={handleClose} disabled={loading} className="flex-1 px-4 py-2 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              取消
            </Button>
            <Button variant="ghost" type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? '修改中...' : '确认修改'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
