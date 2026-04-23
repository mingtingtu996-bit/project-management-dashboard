/**
 * EditProfileDialog - 编辑个人信息弹窗
 */

import { useState, useEffect, useRef, useId } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { X } from 'lucide-react';

interface EditProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EditProfileDialog: React.FC<EditProfileDialogProps> = ({ isOpen, onClose }) => {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen && user) {
      setDisplayName(user.display_name || '');
      setEmail(user.email || '');
      setError('');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !loading && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-800">编辑个人信息</h2>
          <button ref={closeRef} onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={loading} aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input
              type="text"
              value={user?.username || ''}
              className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-500 text-sm"
              disabled
            />
            <p className="text-xs text-gray-400 mt-1">用户名不可修改</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="请输入显示名称"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="请输入邮箱（可选）"
              disabled={loading}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={loading} className="flex-1 px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              取消
            </button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
