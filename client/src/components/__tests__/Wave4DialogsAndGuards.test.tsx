import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { ActionGuardDialog } from '../ActionGuardDialog'
import { DeleteProtectionDialog } from '../DeleteProtectionDialog'
import { LoginDialog } from '../LoginDialog'
import { PermissionGuard } from '../PermissionGuard'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}))

const mockedUseAuth = vi.mocked(useAuth)
const mockedUsePermissions = vi.mocked(usePermissions)

function LoginDialogHarness() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" data-testid="login-trigger" onClick={() => setOpen(true)}>
        open
      </button>
      <LoginDialog isOpen={open} onClose={() => setOpen(false)} />
    </>
  )
}

describe('wave4 dialogs and guards', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({
      login: vi.fn().mockResolvedValue({ success: true }),
      register: vi.fn().mockResolvedValue({ success: true }),
    } as never)
  })

  it('keeps login dialog closable by Escape and restores focus to the trigger', async () => {
    render(<LoginDialogHarness />)

    const trigger = screen.getByTestId('login-trigger')
    trigger.focus()
    fireEvent.click(trigger)

    const usernameInput = await screen.findByLabelText('用户名')
    await waitFor(() => {
      expect(document.activeElement).toBe(usernameInput)
    })

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByTestId('login-dialog')).toBeNull()
    })
    expect(document.activeElement).toBe(trigger)
  })

  it('traps login dialog focus when tabbing past both ends', async () => {
    render(<LoginDialogHarness />)

    fireEvent.click(screen.getByTestId('login-trigger'))

    const dialog = await screen.findByTestId('login-dialog')
    const closeButton = screen.getByRole('button', { name: '关闭登录弹窗' })
    const registerToggle = screen.getByRole('button', { name: '立即注册' })

    registerToggle.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(closeButton)
    expect(dialog.contains(document.activeElement)).toBe(true)

    closeButton.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(registerToggle)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('keeps permission guard fallback and allow paths aligned to permission level', () => {
    mockedUsePermissions.mockReturnValue({
      permissionLevel: 'viewer',
    } as never)

    const { rerender } = render(
      <PermissionGuard action="edit:project" fallback={<span>no access</span>}>
        <span>editor tools</span>
      </PermissionGuard>,
    )

    expect(screen.getByText('no access')).toBeTruthy()
    expect(screen.queryByText('editor tools')).toBeNull()

    mockedUsePermissions.mockReturnValue({
      permissionLevel: 'owner',
    } as never)

    rerender(
      <PermissionGuard action={['edit:project', 'manage:settings']} requireAll fallback={<span>blocked</span>}>
        <span>owner tools</span>
      </PermissionGuard>,
    )

    expect(screen.getByText('owner tools')).toBeTruthy()
    expect(screen.queryByText('blocked')).toBeNull()
  })

  it('keeps action guard dialog acknowledge path wired', async () => {
    const onOpenChange = vi.fn()
    render(
      <ActionGuardDialog
        open
        onOpenChange={onOpenChange}
        title="操作暂不可执行"
        description="当前记录状态已变化，请刷新后再试。"
        hint="请先同步最新数据。"
      />,
    )

    expect(screen.getByTestId('action-guard-dialog')).toBeTruthy()
    expect(screen.getByText('请先同步最新数据。')).toBeTruthy()

    fireEvent.click(screen.getByText('我知道了'))

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it('keeps delete protection dialog warning, secondary action and confirm paths available', async () => {
    const onConfirm = vi.fn()
    const onSecondaryAction = vi.fn()

    render(
      <DeleteProtectionDialog
        open
        onOpenChange={vi.fn()}
        title="删除已被保护"
        description="当前记录不能直接删除。"
        warning="请先改为关闭。"
        secondaryActionLabel="改为关闭"
        onSecondaryAction={onSecondaryAction}
        onConfirm={onConfirm}
        testId="wave4-delete-protection-dialog"
      />,
    )

    expect(screen.getByTestId('wave4-delete-protection-dialog')).toBeTruthy()
    expect(screen.getByText('请先改为关闭。')).toBeTruthy()

    fireEvent.click(screen.getByText('改为关闭'))
    fireEvent.click(screen.getByText('确认删除'))

    await waitFor(() => {
      expect(onSecondaryAction).toHaveBeenCalledTimes(1)
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
  })
})
