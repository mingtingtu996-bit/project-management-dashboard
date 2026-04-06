/**
 * UserMenu组件 - 用户菜单
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';

export const UserMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout, isAuthenticated } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 未登录时不显示菜单
  if (!isAuthenticated || !user) {
    return null;
  }

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* 用户头像/名称按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded hover:bg-gray-100 transition-colors"
      >
        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-medium">
          {user.display_name?.charAt(0).toUpperCase() || user.username.charAt(0).toUpperCase()}
        </div>
        <span className="text-sm font-medium text-gray-700">{user.display_name || user.username}</span>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
          {/* 用户信息 */}
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-800">{user.display_name || user.username}</p>
            <p className="text-xs text-gray-500">{user.email || user.username}</p>
            <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded ${
              user.role === 'owner' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {user.role === 'owner' ? '所有者' : '成员'}
            </span>
          </div>

          {/* 菜单项 */}
          <div className="py-2">
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
