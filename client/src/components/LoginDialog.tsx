/**
 * LoginDialog组件 - 登录/注册弹窗
 */

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, register } = useAuth();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const result = await login(username, password);
        if (result.success) {
          onClose();
          // 清空表单
          setUsername('');
          setPassword('');
        } else {
          setError(result.message || '登录失败');
        }
      } else {
        const result = await register(username, password, displayName, email);
        if (result.success) {
          onClose();
          // 清空表单
          setUsername('');
          setPassword('');
          setDisplayName('');
          setEmail('');
        } else {
          setError(result.message || '注册失败');
        }
      }
    } catch (err) {
      setError(mode === 'login' ? '登录失败，请稍后重试' : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setError('');
    setUsername('');
    setPassword('');
    setDisplayName('');
    setEmail('');
    setMode(mode === 'login' ? 'register' : 'login');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 用户名 */}
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              用户名
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入用户名"
              required
              disabled={loading}
            />
          </div>

          {/* 密码 */}
          <div className="mb-4">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              密码
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入密码"
              required
              disabled={loading}
            />
          </div>

          {/* 注册模式下的额外字段 */}
          {mode === 'register' && (
            <>
              <div className="mb-4">
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 mb-1">
                  显示名称（可选）
                </label>
                <input
                  type="text"
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入显示名称"
                  disabled={loading}
                />
              </div>

              <div className="mb-4">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  邮箱（可选）
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入邮箱"
                  disabled={loading}
                />
              </div>
            </>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        {/* 切换模式 */}
        <div className="mt-4 text-center text-sm text-gray-600">
          {mode === 'login' ? (
            <>
              还没有账户？{' '}
              <button
                type="button"
                onClick={switchMode}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                立即注册
              </button>
            </>
          ) : (
            <>
              已有账户？{' '}
              <button
                type="button"
                onClick={switchMode}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                立即登录
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
