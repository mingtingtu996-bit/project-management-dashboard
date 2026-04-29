/**
 * EditProfileDialog - 编辑个人信息弹窗
 */

import { useState, useEffect, useRef, useId } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button'

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
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      setDisplayName(user.display_name || '');
      setEmail(user.email || '');
      setError('');
      setFieldErrors({});
    }
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return;
    closeRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-[4px] duration-200 fade-in-0" onClick={() => !loading && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-[90%] max-w-[560px] animate-in rounded-2xl border border-slate-200 bg-white p-6 shadow-[var(--el-4)] duration-200 ease-bounce fade-in-0 zoom-in-95" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-800">编辑个人信息</h2>
          <Button variant="ghost" ref={closeRef} onClick={onClose} className="text-slate-400 hover:text-slate-600" disabled={loading} aria-label="关闭">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">用户名</label>
            <input
              type="text"
              value={user?.username || ''}
              className="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50 text-slate-500 text-sm"
              disabled
            />
            <p className="text-xs text-slate-400 mt-1">用户名不可修改</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">显示名称</label>
            <input
              type="text"
              value={displayName}
              onChange={e => {
                setDisplayName(e.target.value);
                if (fieldErrors.displayName) validateRequired('displayName', e.target.value);
              }}
              onBlur={() => validateRequired('displayName', displayName)}
              aria-invalid={Boolean(fieldErrors.displayName)}
              aria-describedby={fieldErrors.displayName ? 'edit-profile-display-name-error' : undefined}
              className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm ${fieldErrors.displayName ? 'border-red-500' : 'border-slate-300'}`}
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
            <label className="block text-sm font-medium text-slate-700 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="请输入邮箱（可选）"
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" type="button" onClick={onClose} disabled={loading} className="flex-1 px-4 py-2 border border-slate-300 rounded text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              取消
            </Button>
            <Button variant="ghost" type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? '保存中...' : '保存'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
