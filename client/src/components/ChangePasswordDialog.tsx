/**
 * ChangePasswordDialog - 修改密码弹窗
 */

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'

interface ChangePasswordDialogProps {
  isOpen: boolean;
  onClose: () => void;
  required?: boolean;
}

export const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({ isOpen, onClose, required = false }) => {
  const { changePassword } = useAuth()
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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
      const result = await changePassword(oldPassword, newPassword)
      if (result.success) {
        onClose();
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setFieldErrors({});
      } else {
        setError(result.message || '修改失败');
      }
    } catch {
      setError('修改失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading && !required) {
      setError('');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFieldErrors({});
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleClose();
    }}>
      <DialogContent
        className="max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto"
        showClose={!required}
        onEscapeKeyDown={(event) => {
          if (loading || required) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (loading || required) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>
            {required ? '首次登录必须修改临时密码。' : '修改当前账号密码。'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="change-pwd-old" className="block text-sm font-medium text-slate-700 mb-1">旧密码</label>
            <div className="relative">
              <input
                id="change-pwd-old"
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={e => {
                  setOldPassword(e.target.value);
                  if (fieldErrors.oldPassword) clearFieldError('oldPassword');
                }}
                onBlur={() => validateRequired('oldPassword', oldPassword)}
                aria-invalid={Boolean(fieldErrors.oldPassword)}
                aria-describedby={fieldErrors.oldPassword ? 'change-password-old-error' : undefined}
                className={`w-full px-3 py-2 pr-10 border rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-sm ${fieldErrors.oldPassword ? 'border-red-500' : 'border-slate-300'}`}
                required
                disabled={loading}
              />
              <Button variant="ghost" type="button" onClick={() => setShowOld(!showOld)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.oldPassword ? (
              <p id="change-password-old-error" className="text-sm text-red-600" role="alert">{fieldErrors.oldPassword}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="change-pwd-new" className="block text-sm font-medium text-slate-700 mb-1">新密码</label>
            <div className="relative">
              <input
                id="change-pwd-new"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => {
                  setNewPassword(e.target.value);
                  if (fieldErrors.newPassword) clearFieldError('newPassword');
                }}
                onBlur={() => validateRequired('newPassword', newPassword)}
                aria-invalid={Boolean(fieldErrors.newPassword)}
                aria-describedby={fieldErrors.newPassword ? 'change-password-new-error' : undefined}
                className={`w-full px-3 py-2 pr-10 border rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-sm ${fieldErrors.newPassword ? 'border-red-500' : 'border-slate-300'}`}
                placeholder="至少6位"
                required
                disabled={loading}
              />
              <Button variant="ghost" type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.newPassword ? (
              <p id="change-password-new-error" className="text-sm text-red-600" role="alert">{fieldErrors.newPassword}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="change-pwd-confirm" className="block text-sm font-medium text-slate-700 mb-1">确认新密码</label>
            <div className="relative">
              <input
                id="change-pwd-confirm"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value);
                  if (fieldErrors.confirmPassword) clearFieldError('confirmPassword');
                }}
                onBlur={() => validateRequired('confirmPassword', confirmPassword)}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'change-password-confirm-error' : undefined}
                className={`w-full px-3 py-2 pr-10 border rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-sm ${fieldErrors.confirmPassword ? 'border-red-500' : 'border-slate-300'}`}
                required
                disabled={loading}
              />
              <Button variant="ghost" type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {fieldErrors.confirmPassword ? (
              <p id="change-password-confirm-error" className="text-sm text-red-600" role="alert">{fieldErrors.confirmPassword}</p>
            ) : null}
          </div>

          <DialogFooter className="gap-3 pt-2">
            {!required ? (
              <Button variant="outline" type="button" onClick={handleClose} disabled={loading} className="flex-1">
                取消
              </Button>
            ) : null}
            <Button type="submit" loading={loading} className="flex-1">
              确认修改
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
