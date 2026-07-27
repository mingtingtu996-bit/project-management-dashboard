import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const changePassword = vi.fn()

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ changePassword }),
}))

import { ChangePasswordDialog } from '../ChangePasswordDialog'

describe('ChangePasswordDialog credential rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    changePassword.mockResolvedValue({ success: true, message: '密码修改成功' })
  })

  it('cannot be dismissed while an administrator-issued temporary password must be rotated', () => {
    render(<ChangePasswordDialog isOpen required onClose={vi.fn()} />)

    expect(screen.getByText('首次登录必须修改临时密码。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '取消' })).not.toBeInTheDocument()
  })

  it('uses the auth context password flow so the replacement token is persisted', async () => {
    const onClose = vi.fn()
    render(<ChangePasswordDialog isOpen required onClose={onClose} />)

    fireEvent.change(screen.getByLabelText('旧密码'), { target: { value: 'SecureTemp123!' } })
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'NewSecure123!' } })
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'NewSecure123!' } })
    fireEvent.click(screen.getByRole('button', { name: '确认修改' }))

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith('SecureTemp123!', 'NewSecure123!')
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
