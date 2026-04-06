// 自定义 hook：确认弹窗（替代 window.confirm）
// 用法：
//   const { confirmDialog, openConfirm, closeConfirm } = useConfirmDialog()
// 在 JSX 中渲染 ConfirmDialog 组件，openConfirm(title, message, onConfirm) 打开弹窗
import { useState, useCallback } from 'react'

export interface ConfirmDialogState {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
}

const INITIAL_STATE: ConfirmDialogState = {
  open: false,
  title: '',
  message: '',
  onConfirm: () => {},
}

export function useConfirmDialog() {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(INITIAL_STATE)

  const openConfirm = useCallback(
    (title: string, message: string, onConfirm: () => void) => {
      setConfirmDialog({ open: true, title, message, onConfirm })
    },
    []
  )

  const closeConfirm = useCallback(() => {
    setConfirmDialog(INITIAL_STATE)
  }, [])

  return { confirmDialog, setConfirmDialog, openConfirm, closeConfirm }
}
