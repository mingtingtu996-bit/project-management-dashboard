/**
 * useAuthDialog Hook - 全局登录弹窗控制
 * 允许 Header 和其他组件控制 AppContent 中的 LoginDialog
 */

import React, { createContext, useContext, useState, ReactNode, FC } from 'react';

interface AuthDialogContextType {
  isOpen: boolean;
  openLoginDialog: () => void;
  closeLoginDialog: () => void;
}

const AuthDialogContext = createContext<AuthDialogContextType | undefined>(undefined);

export const AuthDialogProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);

  const openLoginDialog = () => setIsOpen(true);
  const closeLoginDialog = () => setIsOpen(false);

  return React.createElement(
    AuthDialogContext.Provider,
    { value: { isOpen, openLoginDialog, closeLoginDialog } },
    children
  );
};

export const useAuthDialog = () => {
  const context = useContext(AuthDialogContext);
  if (context === undefined) {
    throw new Error('useAuthDialog must be used within an AuthDialogProvider');
  }
  return context;
};
