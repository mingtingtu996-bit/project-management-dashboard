/**
 * EditProfileDialog - 编辑个人信息弹窗
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EditProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileDialog: React.FC<EditProfileDialogProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      setDisplayName(user.display_name || '');
      setEmail(user.email || '');
      setError('');
      setFieldErrors({});
    }
  }, [isOpen, user]);

  const validateRequired = (field: string, value: string) => {
    if (value.trim()) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
      return true;
    }

    setFieldErrors((current) => ({ ...current, [field]: '此字段必填' }));
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateRequired('displayName', displayName)) return;
    setLoading(true);

    try {
      const data = await updateProfile({ display_name: displayName.trim(), email: email.trim() });
      if (data.success) {
        onClose();
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
    if (!loading) onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) handleClose();
    }}>
      <DialogContent
        className="max-h-[calc(100vh-4rem)] max-w-xl overflow-y-auto"
        onEscapeKeyDown={(event) => {
          if (loading) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (loading) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>编辑个人信息</DialogTitle>
          <DialogDescription>更新当前账号的显示名称和邮箱。</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-profile-username" className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
            <input
              id="edit-profile-username"
              type="text"
              value={user?.username || ''}
              className="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50 text-slate-500 text-sm"
              disabled
            />
            <p className="text-xs text-slate-500 mt-1">用户名不可修改</p>
          </div>

          <div>
            <label htmlFor="edit-profile-displayname" className="block text-sm font-medium text-slate-700 mb-1">显示名称</label>
            <input
              id="edit-profile-displayname"
              type="text"
              value={displayName}
              onChange={e => {
                setDisplayName(e.target.value);
                if (fieldErrors.displayName) validateRequired('displayName', e.target.value);
              }}
              onBlur={() => validateRequired('displayName', displayName)}
              aria-invalid={Boolean(fieldErrors.displayName)}
              aria-describedby={fieldErrors.displayName ? 'edit-profile-display-name-error' : undefined}
              className={`w-full px-3 py-2 border rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-sm ${fieldErrors.displayName ? 'border-red-500' : 'border-slate-300'}`}
              placeholder="请输入显示名称"
              disabled={loading}
            />
            {fieldErrors.displayName ? (
              <p id="edit-profile-display-name-error" className="text-sm text-red-600" role="alert">
                {fieldErrors.displayName}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="edit-profile-email" className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
            <input
              id="edit-profile-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-sm"
              placeholder="请输入邮箱（可选）"
              disabled={loading}
            />
          </div>

          <DialogFooter className="gap-3 pt-2">
            <Button variant="outline" type="button" onClick={handleClose} disabled={loading} className="flex-1">
              取消
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
