/**
 * ReadOnlyGuard - 未登录只读模式保护组件
 * 未登录用户只能查看，不能进行增删改操作
 */

import { ReactNode, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthDialog } from '@/hooks/useAuthDialog';
import { Lock } from 'lucide-react';

interface ReadOnlyGuardProps {
  children: ReactNode;
  /** 需要登录才能执行的操作类型 */
  action?: 'edit' | 'create' | 'delete' | 'any';
  /** 自定义提示文本 */
  message?: string;
}

/**
 * ReadOnlyGuard - 未登录时包裹可编辑区域，阻止操作并提示登录
 */
export function ReadOnlyGuard({
  children,
  action = 'edit',
  message,
}: ReadOnlyGuardProps) {
  const { isAuthenticated } = useAuth();
  const { openLoginDialog } = useAuthDialog();

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const defaultMessages: Record<string, string> = {
    edit: '请登录后编辑',
    create: '请登录后创建',
    delete: '请登录后删除',
    any: '请登录后操作',
  };

  const msg = message || defaultMessages[action] || '请登录后操作';

  return (
    <div
      className="relative group"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openLoginDialog();
      }}
    >
      {/* 灰化遮罩 + 提示 */}
      <div className="pointer-events-none opacity-60 select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity rounded">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-md border text-sm text-gray-600">
          <Lock className="h-4 w-4" />
          {msg}
        </div>
      </div>
    </div>
  );
}

/**
 * useReadOnly - Hook，返回是否处于只读模式
 */
export function useReadOnly(): boolean {
  const { isAuthenticated } = useAuth();
  return !isAuthenticated;
}
